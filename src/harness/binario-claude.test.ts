import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { ehWsl, resolverClaude } from "./binario-claude.js";
import { instalarPlugin, type Executor } from "./instalar.js";

/**
 * No WSL, o `claude` do Windows (sob `/mnt/`) também está no PATH. Ele registra o
 * plugin no Claude do Windows, não no do Linux, e o `marketplace list --json` dele
 * não volta como JSON: no Login, o `remove` e o `add` rodaram nele antes de a
 * conferência falhar (0.13.1). A raiz do Windows é injetada: o teste não cria `/mnt`.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function base(): { raiz: string; windows: string; linux: string; outro: string } {
  const raiz = mkdtempSync(join(tmpdir(), "expx-binario-claude-"));
  criados.push(raiz);
  const windows = join(raiz, "mnt", "c", "bin");
  const linux = join(raiz, "linux", "bin");
  const outro = join(raiz, "outro", "bin");
  for (const d of [windows, linux, outro]) mkdirSync(d, { recursive: true });
  return { raiz, windows, linux, outro };
}
function executavel(pasta: string): string {
  const f = join(pasta, "claude");
  writeFileSync(f, "#!/bin/sh\nexit 0\n");
  chmodSync(f, 0o755);
  return f;
}
const WSL = { WSL_DISTRO_NAME: "Ubuntu" };

describe.skipIf(process.platform === "win32")("o claude do PATH no WSL", () => {
  it("funcional: detecta o WSL pela variável ou pelo /proc/version", () => {
    expect(ehWsl({ WSL_DISTRO_NAME: "Ubuntu" }, () => "")).toBe(true);
    expect(ehWsl({}, () => "Linux version 6.18.33.2-microsoft-standard-WSL2")).toBe(true);
    expect(ehWsl({}, () => "Linux version 6.8.0-generic")).toBe(false);
  });

  it("funcional: fora do WSL, nada muda: o nome vai para o PATH do sistema", () => {
    const b = base();
    executavel(b.windows);
    const r = resolverClaude({ ambiente: { PATH: b.windows }, wsl: false, raizWindows: join(b.raiz, "mnt") });
    expect(r).toEqual({ ok: true, caminho: "claude" });
  });

  it("funcional: no WSL, só o claude do Windows no PATH é ausente, e diz por quê", () => {
    const b = base();
    executavel(b.windows);
    const r = resolverClaude({ ambiente: { ...WSL, PATH: b.windows }, wsl: true, raizWindows: join(b.raiz, "mnt") });
    expect(r).toEqual({ ok: false, motivo: "so-windows" });
  });

  it("funcional: no WSL, o do Linux vem mesmo depois do do Windows no PATH, na ordem", () => {
    const b = base();
    executavel(b.windows);
    const linux = executavel(b.linux);
    executavel(b.outro);
    const r = resolverClaude({ ambiente: { ...WSL, PATH: [b.windows, b.linux, b.outro].join(delimiter) }, wsl: true, raizWindows: join(b.raiz, "mnt") });
    expect(r).toEqual({ ok: true, caminho: linux });
  });

  it("funcional: link no Linux que aponta para o do Windows também fica de fora", () => {
    const b = base();
    const windows = executavel(b.windows);
    symlinkSync(windows, join(b.linux, "claude"));
    const r = resolverClaude({ ambiente: { ...WSL, PATH: b.linux }, wsl: true, raizWindows: join(b.raiz, "mnt") });
    expect(r).toEqual({ ok: false, motivo: "so-windows" });
  });

  // CodeAnt no #132: o Windows pode expor só o `claude.exe`, que o WSL roda pelo interop.
  it("funcional: só o claude.exe do Windows no PATH também é do Windows", () => {
    const b = base();
    const exe = join(b.windows, "claude.exe");
    writeFileSync(exe, "MZ");
    chmodSync(exe, 0o755);
    expect(resolverClaude({ ambiente: { ...WSL, PATH: b.windows }, wsl: true, raizWindows: join(b.raiz, "mnt") })).toEqual({ ok: false, motivo: "so-windows" });
  });

  // No POSIX, a entrada vazia do PATH é a pasta atual, como no execvp.
  it("funcional: entrada vazia do PATH é a pasta atual", () => {
    const b = base();
    const linux = executavel(b.linux);
    const r = resolverClaude({ ambiente: { ...WSL, PATH: ["", b.outro].join(delimiter) }, wsl: true, raizWindows: join(b.raiz, "mnt"), cwd: b.linux });
    expect(r).toEqual({ ok: true, caminho: linux });
  });

  it("funcional: sem claude nenhum, ausente", () => {
    const b = base();
    expect(resolverClaude({ ambiente: { ...WSL, PATH: b.linux }, wsl: true, raizWindows: join(b.raiz, "mnt") })).toEqual({ ok: false, motivo: "ausente" });
  });
});

describe("a instalação do plugin com o claude resolvido", () => {
  it("funcional: só o do Windows no WSL -> nenhum comando roda, e a instrução não manda rodar `claude`", async () => {
    const chamadas: string[] = [];
    const executar: Executor = async (bin, args) => { chamadas.push(`${bin} ${args.join(" ")}`); return { stdout: "[]" }; };
    const r = await instalarPlugin("/proj/.expx/marketplace", executar, () => ({ ok: false, motivo: "so-windows" }));
    expect(chamadas).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.instrucao).toContain("Claude Code do Linux");
    expect(r.instrucao).not.toMatch(/^\s+claude plugin/m);
  });

  it("funcional: o caminho resolvido roda todos os comandos, inclusive a conferência", async () => {
    const bins: string[] = [];
    const executar: Executor = async (bin, args) => {
      bins.push(bin);
      if (args.join(" ") === "plugin marketplace list --json") return { stdout: JSON.stringify([{ name: "expx-local", path: "/proj/.expx/marketplace" }]) };
      return { stdout: "" };
    };
    const r = await instalarPlugin("/proj/.expx/marketplace", executar, () => ({ ok: true, caminho: "/usr/local/bin/claude" }));
    expect(r.ok).toBe(true);
    expect(bins.length).toBeGreaterThan(4);
    expect(new Set(bins)).toEqual(new Set(["/usr/local/bin/claude"]));
  });
});
