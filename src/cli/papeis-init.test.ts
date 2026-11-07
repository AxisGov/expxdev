import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "./init.js";

/**
 * F4 da orquestração: o `init` projeta o `papel:` dos agentes em
 * `.expx/papeis.tsv`, com ou sem política (CONTRATO-expx-orquestracao §11.4).
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const AGENTE = (nome: string, extra: string) => `---\nname: ${nome}\ndescription: x\ntools: Read\nmodel: sonnet\nclasse: raciocinio_normal\n${extra}---\n\nCorpo.\n`;

function skill(nome: string, arquivos: Record<string, string>): string {
  const repo = criarRepoSkill({ nome, tags: [] });
  criados.push(repo);
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), conteudo);
  }
  return repo;
}

function produto(): string {
  const p = mkdtempSync(join(tmpdir(), "expx-papeis-init-"));
  criados.push(p);
  return p;
}

const gravar = (p: string, rel: string, conteudo: unknown) => {
  mkdirSync(dirname(join(p, rel)), { recursive: true });
  writeFileSync(join(p, rel), typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
};
const PAPEIS = ".expx/papeis.tsv";
const lerPapeis = (p: string) => readFileSync(join(p, PAPEIS), "utf8");

const REVISOR = AGENTE("revisor-diff", "papel: revisar\n");
const ANALISTA = AGENTE("analista-de-conflito", "papel: investigar\n");
const QA = AGENTE("qa", "papel: testar\n");
const origens = (qa = QA) => ({
  mergex: skill("mergex", { ".claude/agents/revisor-diff.md": REVISOR, ".claude/agents/analista-de-conflito.md": ANALISTA }),
  runx: skill("runx", { ".claude/agents/qa.md": qa }),
});
const init = (p: string, o: Record<string, string>) =>
  executarInit({ raiz: p, skills: Object.keys(o), harness: ["claude"], origens: o });

describe("projeção dos papéis (F4)", () => {
  it("sem política: uma linha por agente com papel, com a skill que o publica; o agente sai como na skill", async () => {
    const p = produto();
    const r = await init(p, origens());
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerPapeis(p)).toBe("# expx-papeis 1\nanalista-de-conflito\tmergex\tinvestigar\nqa\trunx\ttestar\nrevisor-diff\tmergex\trevisar\n");
    expect(readFileSync(join(p, ".claude/agents/revisor-diff.md"), "utf8")).toBe(REVISOR);
    expect(existsSync(join(p, ".expx/orquestracao-rastro.tsv"))).toBe(false);
  });

  it("com política: a mesma projeção, ao lado da do rastro", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const r = await init(p, origens());
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerPapeis(p)).toContain("qa\trunx\ttestar\n");
    expect(existsSync(join(p, ".expx/orquestracao-rastro.tsv"))).toBe(true);
  });

  it("agente sem papel não entra; sem nenhum, a projeção anterior some", async () => {
    const p = produto();
    expect((await init(p, origens())).ok).toBe(true);
    expect(existsSync(join(p, PAPEIS))).toBe(true);
    const semPapel = { runx: skill("runx", { ".claude/agents/qa.md": AGENTE("qa", "") }) };
    const r = await init(p, semPapel);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(existsSync(join(p, PAPEIS))).toBe(false);
  });

  it.each([false, true])("papel fora do vocabulário é skill inválida, com política %s, e nada é escrito", async (comPolitica) => {
    const p = produto();
    if (comPolitica) gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const r = await init(p, origens(AGENTE("qa", "papel: aprovar\n")));
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("papel");
    expect(existsSync(join(p, ".expx/expx-lock.json"))).toBe(false);
    expect(existsSync(join(p, PAPEIS))).toBe(false);
  });

  it("o mesmo agente com papel em duas skills recusa o plano, mesmo sem política", async () => {
    const p = produto();
    const o = { ...origens(), sprintx: skill("sprintx", { ".claude/agents/outro-qa.md": QA }) };
    const r = await init(p, o);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("qa");
  });

  it("agente fora do vocabulário do rastro fica fora da projeção, com aviso", async () => {
    const p = produto();
    const o = { ...origens(), sprintx: skill("sprintx", { ".claude/agents/meu-revisor.md": AGENTE("meu-revisor", "papel: revisar\n") }) };
    const r = await init(p, o);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerPapeis(p)).not.toContain("meu-revisor");
    expect(r.avisos.join("\n")).toContain("meu-revisor");
  });
});
