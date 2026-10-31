import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registrarPluginNoClaude } from "./registro.js";

/**
 * O `expx-local` no escopo do usuário é único. Registrar o repositório-fonte do
 * CLI, com o conjunto reduzido de skills dele, trocaria o plugin de todas as
 * sessões da máquina.
 */
const PACOTE_FONTE = {
  name: "expxdev",
  repository: { type: "git", url: "git+https://github.com/AxisGov/expxdev.git" },
};

describe("registro do plugin no repositório-fonte do CLI", () => {
  const pastas: string[] = [];

  afterEach(() => {
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
  });

  function repo(pacote: unknown): string {
    const raiz = mkdtempSync(join(tmpdir(), "expx-registro-"));
    pastas.push(raiz);
    execFileSync("git", ["init", "-q", raiz]);
    writeFileSync(join(raiz, "package.json"), `${JSON.stringify(pacote)}\n`);
    return raiz;
  }

  function espiao(): { chamadas: string[]; instalar: (c: string) => Promise<{ ok: boolean; executados: string[] }> } {
    const chamadas: string[] = [];
    return { chamadas, instalar: async (c) => { chamadas.push(c); return { ok: true, executados: [] }; } };
  }

  it("funcional: na fonte não roda nenhum `claude plugin` e devolve um aviso", async () => {
    const e = espiao();
    const r = await registrarPluginNoClaude(repo(PACOTE_FONTE), { instalar: e.instalar });
    expect(e.chamadas).toEqual([]);
    expect(r.instalacao.pulado).toBe(true);
    expect(r.avisos.join("")).toContain("repositorio-fonte");
  });

  it("funcional: a partir de uma subpasta da fonte, a guarda vale do mesmo jeito", async () => {
    const raiz = repo(PACOTE_FONTE);
    mkdirSync(join(raiz, "sub", "pasta"), { recursive: true });
    const e = espiao();
    const r = await registrarPluginNoClaude(join(raiz, "sub", "pasta"), { instalar: e.instalar });
    expect(e.chamadas).toEqual([]);
    expect(r.instalacao.pulado).toBe(true);
  });

  it("funcional: o `expxdev` de outro autor continua registrando", async () => {
    const e = espiao();
    const raiz = repo({ name: "expxdev", repository: "https://github.com/outro/expxdev.git" });
    const r = await registrarPluginNoClaude(raiz, { instalar: e.instalar });
    expect(e.chamadas).toHaveLength(1);
    expect(r.instalacao.pulado).toBeUndefined();
  });

  it("funcional: projeto consumidor continua registrando", async () => {
    const e = espiao();
    await registrarPluginNoClaude(repo({ name: "login" }), { instalar: e.instalar });
    expect(e.chamadas).toHaveLength(1);
  });
});
