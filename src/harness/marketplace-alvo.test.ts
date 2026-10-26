import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marketplaceParaRegistrar } from "./marketplace-alvo.js";
import { registrarPluginNoClaude, deveRegistrarNoUpdate } from "./registro.js";
import { comandosDeInstalacao, instrucaoManual } from "./instalar.js";

/**
 * `expx init` numa worktree registrava o marketplace `expx-local` no escopo do
 * usuário com o caminho ABSOLUTO da worktree. Removida a worktree, o plugin não
 * carregava mais (`cache-miss`) e os comandos /expx: sumiam, embora o settings do
 * projeto já usasse `./.expx/marketplace`, que o Claude Code resolve contra o
 * checkout principal (relato da janela do conselhos, 2026-10-26).
 */
const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "ignore" });
}

function repoComWorktree(principalTemMarketplace: boolean): { principal: string; worktree: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "expx-mkt-")));
  pastas.push(base);
  const principal = join(base, "principal");
  mkdirSync(principal);
  git(principal, "init", "-q", "-b", "main");
  writeFileSync(join(principal, "a.txt"), "a\n");
  git(principal, "add", "-A");
  git(principal, "commit", "-q", "-m", "base");
  if (principalTemMarketplace) {
    mkdirSync(join(principal, ".expx", "marketplace", ".claude-plugin"), { recursive: true });
    writeFileSync(join(principal, ".expx", "marketplace", ".claude-plugin", "marketplace.json"), "{}\n");
  }
  const worktree = join(base, "principal--feature");
  git(principal, "worktree", "add", "-q", "-b", "feature", worktree);
  return { principal, worktree };
}

describe("marketplace a registrar no escopo do usuário", () => {
  it("fora de worktree: o da própria raiz, sem aviso", async () => {
    const { principal } = repoComWorktree(true);
    const alvo = await marketplaceParaRegistrar(principal);
    expect(alvo.caminho).toBe(join(principal, ".expx", "marketplace"));
    expect(alvo.aviso).toBeUndefined();
  });

  it("worktree com o principal montado: o do checkout principal, com aviso", async () => {
    const { principal, worktree } = repoComWorktree(true);
    const alvo = await marketplaceParaRegistrar(worktree);
    expect(alvo.caminho).toBe(join(principal, ".expx", "marketplace"));
    expect(alvo.aviso).toContain("checkout principal");
    expect(alvo.aviso).toContain(principal);
  });

  it("worktree sem o marketplace no principal: o da worktree, com aviso de que quebra", async () => {
    const { principal, worktree } = repoComWorktree(false);
    const alvo = await marketplaceParaRegistrar(worktree);
    expect(alvo.caminho).toBe(join(worktree, ".expx", "marketplace"));
    expect(alvo.aviso).toContain("quebra");
    expect(alvo.aviso).toContain(join(principal, ".expx", "marketplace"));
  });

  it("git ausente ou falhando: o da própria raiz, sem aviso", async () => {
    const alvo = await marketplaceParaRegistrar("/proj", async () => {
      throw new Error("spawn git ENOENT");
    });
    expect(alvo.caminho).toBe(join("/proj", ".expx", "marketplace"));
    expect(alvo.aviso).toBeUndefined();
  });

  it("saída do git fora do esperado (relativa, ou common-dir que não é .git): o da própria raiz", async () => {
    for (const saida of ["rel/.git\nrel/.git\n", "/x/.git/worktrees/w\n/x/repo.git\n", "\n"]) {
      const alvo = await marketplaceParaRegistrar("/proj", async () => saida);
      expect(alvo.caminho).toBe(join("/proj", ".expx", "marketplace"));
    }
  });
});

describe("registro do plugin: substitui o registro anterior", () => {
  it("remove o expx-local antes de adicionar, para não preservar o caminho de uma worktree antiga", () => {
    const args = comandosDeInstalacao("/p/.expx/marketplace").map((c) => c.args.join(" "));
    const remove = args.findIndex((a) => a === "plugin marketplace remove expx-local");
    const add = args.findIndex((a) => a.startsWith("plugin marketplace add"));
    expect(remove).toBeGreaterThanOrEqual(0);
    expect(remove).toBeLessThan(add);
  });

  it("a instrução manual traz o caminho escolhido", () => {
    expect(instrucaoManual("/principal/.expx/marketplace")).toContain("/principal/.expx/marketplace");
  });

  it("init e update registram pelo caminho resolvido e repassam o aviso", async () => {
    const chamadas: string[] = [];
    const r = await registrarPluginNoClaude("/wt", {
      resolver: async () => ({ caminho: "/principal/.expx/marketplace", aviso: "AVISO" }),
      instalar: async (c) => {
        chamadas.push(c);
        return { ok: true, executados: [] };
      },
    });
    expect(chamadas).toEqual(["/principal/.expx/marketplace"]);
    expect(r.avisos).toEqual(["AVISO"]);
    expect(r.instalacao.ok).toBe(true);
  });

  it("o update registra só quando aplicou, sem --check, e o lock inclui o claude", () => {
    expect(deveRegistrarNoUpdate({ ok: true, aplicou: true }, false, ["claude"])).toBe(true);
    expect(deveRegistrarNoUpdate({ ok: true, aplicou: false }, false, ["claude"])).toBe(false);
    expect(deveRegistrarNoUpdate({ ok: true, aplicou: true }, true, ["claude"])).toBe(false);
    expect(deveRegistrarNoUpdate({ ok: false, aplicou: true }, false, ["claude"])).toBe(false);
    expect(deveRegistrarNoUpdate({ ok: true, aplicou: true }, false, ["opencode"])).toBe(false);
  });
});
