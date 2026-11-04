import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";

/**
 * O `init` planeja a partir do lock anterior (entradas do settings, modos, envelope
 * da invocação) antes de adquirir o bloqueio da operação. Se outra operação regravou
 * o lock nesse intervalo, o plano é de um retrato velho e sobrescreveria o mais novo
 * (nitpick do CodeAnt no expxdev#140). Com o bloqueio na mão, o lock tem de ser o
 * mesmo que foi lido; se não for, nada é escrito.
 */
const concorrente = vi.hoisted(() => ({ regravar: undefined as string | undefined }));

vi.mock("../nucleo/bloqueio-operacao.js", async (original) => {
  const real = await original<typeof import("../nucleo/bloqueio-operacao.js")>();
  return {
    ...real,
    adquirirBloqueioOperacao: vi.fn((raiz: string) => {
      // a outra operação terminou entre o planejamento e este bloqueio
      if (concorrente.regravar !== undefined) writeFileSync(join(raiz, ".expx", "expx-lock.json"), concorrente.regravar);
      return real.adquirirBloqueioOperacao(raiz);
    }),
  };
});

import { executarInit } from "./init.js";

const criados: string[] = [];
afterEach(() => {
  concorrente.regravar = undefined;
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe("init e o lock regravado por outra operação", () => {
  it("funcional: o lock mudou entre o planejamento e o bloqueio: recusa sem escrever", async () => {
    const repo = criarRepoSkill({ nome: "alfa", tags: [] });
    const p = mkdtempSync(join(tmpdir(), "expx-init-concorrente-"));
    criados.push(repo, p);
    const op = { raiz: p, skills: ["alfa"], harness: ["claude" as const], origens: { alfa: repo } };
    expect((await executarInit(op)).ok).toBe(true);
    const caminho = join(p, ".expx", "expx-lock.json");
    const outro = readFileSync(caminho, "utf8").replace('"lock_version"', '"lock_version_outra"');
    concorrente.regravar = outro;
    const r = await executarInit(op);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("o .expx/expx-lock.json mudou");
    expect(readFileSync(caminho, "utf8")).toBe(outro);
  });

  it("funcional: sem ninguém no meio, o init repetido segue", async () => {
    const repo = criarRepoSkill({ nome: "alfa", tags: [] });
    const p = mkdtempSync(join(tmpdir(), "expx-init-concorrente-"));
    criados.push(repo, p);
    const op = { raiz: p, skills: ["alfa"], harness: ["claude" as const], origens: { alfa: repo } };
    expect((await executarInit(op)).ok).toBe(true);
    expect((await executarInit(op)).ok).toBe(true);
  });
});
