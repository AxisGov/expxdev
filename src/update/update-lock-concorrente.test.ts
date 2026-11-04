import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";

/**
 * O `update` decide a seleção pelo lock que leu no início e só chama o `init`
 * depois da busca remota. Se outra operação regravar o lock nesse intervalo, o
 * retrato que vale é o do `update`, não o que o `init` tiraria ao começar
 * (nitpick do CodeAnt no expxdev#141). E a recusa do `init` precisa chegar à
 * saída do `update`, que antes só copiava os avisos.
 */
const concorrente = vi.hoisted(() => ({ regravar: undefined as string | undefined }));

vi.mock("../cli/init.js", async (original) => {
  const real = await original<typeof import("../cli/init.js")>();
  return {
    ...real,
    executarInit: vi.fn(async (op: Parameters<typeof real.executarInit>[0]) => {
      // a outra operação terminou entre a leitura do update e o começo do init
      if (concorrente.regravar !== undefined) writeFileSync(join(op.raiz, ".expx", "expx-lock.json"), concorrente.regravar);
      return real.executarInit(op);
    }),
  };
});

import { executarInit } from "../cli/init.js";
import { executarUpdate } from "./flags.js";

let p: ProjetoTemporario | undefined;
const repos: string[] = [];
afterEach(() => {
  concorrente.regravar = undefined;
  p?.descartar();
  p = undefined;
  for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** O lock como gravado por uma CLI anterior: o update remonta pelo init. */
function deCliAnterior(raiz: string): void {
  const caminho = join(raiz, ".expx", "expx-lock.json");
  const lock = JSON.parse(readFileSync(caminho, "utf8")) as Record<string, unknown>;
  lock["cli_version"] = "0.0.1";
  writeFileSync(caminho, `${JSON.stringify(lock, null, 2)}\n`);
}

describe("update e o lock regravado por outra operação", () => {
  it("funcional: o lock mudou depois da leitura do update: o init recusa, e a causa chega à saída", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } })).ok).toBe(true);
    deCliAnterior(p.raiz);
    const caminho = join(p.raiz, ".expx", "expx-lock.json");
    const outro = readFileSync(caminho, "utf8").replace('"lock_version"', '"lock_version_outra"');
    concorrente.regravar = outro;

    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens: { sprintx: repo } });

    expect(r.ok).toBe(false);
    expect(r.aplicou).toBe(false);
    expect(r.mensagens.join("\n")).toContain("o .expx/expx-lock.json mudou");
    expect(readFileSync(caminho, "utf8")).toBe(outro);
  });
});
