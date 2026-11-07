import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "../cli/init.js";
import { diagnosticar, type Achado } from "./verificadores.js";

/**
 * `papeis-projecao-divergente` (CONTRATO-expx-instalacao §5.3, F4): o doctor
 * confere `.expx/papeis.tsv` contra os agentes instalados, com ou sem política.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const AGENTE = (nome: string, extra: string) => `---\nname: ${nome}\ndescription: x\ntools: Read\nmodel: sonnet\nclasse: raciocinio_normal\n${extra}---\n\nCorpo.\n`;

function gravar(base: string, rel: string, conteudo: string): void {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), conteudo);
}

async function projeto(politica = false): Promise<string> {
  const mergex = criarRepoSkill({ nome: "mergex", tags: [] });
  const runx = criarRepoSkill({ nome: "runx", tags: [] });
  criados.push(mergex, runx);
  gravar(mergex, ".claude/agents/revisor-diff.md", AGENTE("revisor-diff", "papel: revisar\n"));
  gravar(mergex, ".claude/agents/analista-de-conflito.md", AGENTE("analista-de-conflito", ""));
  gravar(runx, ".claude/agents/qa.md", AGENTE("qa", "papel: testar\n"));
  const raiz = mkdtempSync(join(tmpdir(), "expx-papeis-doctor-"));
  criados.push(raiz);
  if (politica) gravar(raiz, ".expx/orquestracao.json", JSON.stringify({ expx_orquestracao: 1 }));
  const r = await executarInit({ raiz, skills: ["mergex", "runx"], harness: ["claude"], origens: { mergex, runx } });
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return raiz;
}

const PAPEIS = ".expx/papeis.tsv";
const achados = (raiz: string): Achado[] => diagnosticar(raiz, { HOME: raiz }).achados.filter((a) => a.id.startsWith("papeis-"));
const ids = (as: Achado[]) => as.map((a) => `${a.id}:${a.severidade}`);

describe("doctor — projeção dos papéis (F4)", () => {
  it.each([false, true])("instalação saudável, com política %s: não diz nada", async (politica) => {
    expect(achados(await projeto(politica))).toEqual([]);
  });

  it("projeção ausente com agente de papel instalado é erro: o aprovador deixaria de ser verificado em silêncio", async () => {
    const raiz = await projeto();
    rmSync(join(raiz, PAPEIS));
    const a = achados(raiz);
    expect(ids(a)).toEqual(["papeis-projecao-divergente:erro"]);
    expect(a[0]?.correcao).toContain("expx init");
  });

  it.each([
    ["papel trocado", (t: string) => t.replace("qa\trunx\ttestar", "qa\trunx\tinvestigar")],
    ["agente a menos", (t: string) => t.replace("qa\trunx\ttestar\n", "")],
    ["agente a mais", (t: string) => `${t}analista-de-conflito\tmergex\trevisar\n`],
    ["skill fora do lock", (t: string) => t.replace("qa\trunx", "qa\tsprintx")],
    ["arquivo ilegível", () => "# expx-papeis 2\n"],
  ])("%s é erro", async (_, mudar) => {
    const raiz = await projeto();
    writeFileSync(join(raiz, PAPEIS), mudar(readFileSync(join(raiz, PAPEIS), "utf8")));
    expect(ids(achados(raiz))).toEqual(["papeis-projecao-divergente:erro"]);
  });

  it("o papel editado na cópia instalada do agente aparece pelo hash do lock, e a projeção segue o que o init gravou", async () => {
    const raiz = await projeto();
    const arq = join(raiz, ".claude/agents/qa.md");
    writeFileSync(arq, readFileSync(arq, "utf8").replace("papel: testar", "papel: investigar"));
    // o lock acusa a cópia modificada; a projeção continua a do plano
    expect(ids(achados(raiz))).toEqual([]);
  });

  it("projeção que sobrou sem nenhum agente de papel é aviso", async () => {
    const raiz = await projeto();
    gravar(raiz, PAPEIS, readFileSync(join(raiz, PAPEIS), "utf8"));
    const lock = JSON.parse(readFileSync(join(raiz, ".expx/expx-lock.json"), "utf8")) as { instalacao: { arquivos: Record<string, string> } };
    for (const k of Object.keys(lock.instalacao.arquivos)) if (k.startsWith(".claude/agents/")) delete lock.instalacao.arquivos[k];
    writeFileSync(join(raiz, ".expx/expx-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    expect(ids(achados(raiz))).toEqual(["papeis-projecao-divergente:aviso"]);
  });
});
