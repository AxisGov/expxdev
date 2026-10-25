import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "./init.js";
import { lerRegistro } from "../orquestracao/materializar.js";
import type { Resolucao } from "../orquestracao/resolver.js";

/**
 * F2 da orquestração: o `init` com o adaptador Claude
 * (CONTRATO-expx-instalacao §5.3, CONTRATO-expx-orquestracao §9).
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const AGENTE = (nome: string, extra: string) => `---\nname: ${nome}\ndescription: audita\ntools: Read\n${extra}\n---\n\nCorpo do agente.\n`;

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
  const p = mkdtempSync(join(tmpdir(), "expx-orq-init-"));
  criados.push(p);
  return p;
}

const gravar = (p: string, rel: string, conteudo: unknown) => {
  mkdirSync(dirname(join(p, rel)), { recursive: true });
  writeFileSync(join(p, rel), typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
};
const lerAgente = (p: string, n: string) => readFileSync(join(p, ".claude/agents", `${n}.md`), "utf8");
type LockOrq = { orquestracao?: { versao_resolvedor: number; tabela_embutida: number; matriz_effort_claude: number; agentes: Record<string, { claude: string }> } };
const lerLock = (p: string) => JSON.parse(readFileSync(join(p, ".expx/expx-lock.json"), "utf8")) as LockOrq & Record<string, unknown>;
const registro = (p: string, id: string): Resolucao => {
  const r = lerRegistro(id, readFileSync(join(p, ".expx/resolucoes", `${id}.json`), "utf8"));
  if (!r.ok) throw new Error(r.erro);
  return r.resolucao;
};

const AUDITOR = AGENTE("auditor", "classe: raciocinio_normal\nmodel: sonnet\neffort: high");
const TRIAGEM = AGENTE("triagem", "model: haiku");
const origens = () => ({ alfa: skill("alfa", { ".claude/agents/auditor.md": AUDITOR, ".claude/agents/triagem.md": TRIAGEM }) });
const init = (p: string, o = origens()) => executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: o });

describe("init sem política — camada inativa", () => {
  it("não grava registro nem seção no lock, e os agentes saem como na skill", async () => {
    const p = produto();
    const r = await init(p);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerLock(p).orquestracao).toBeUndefined();
    expect(Object.keys(lerLock(p))).not.toContain("orquestracao");
    expect(existsSync(join(p, ".expx/resolucoes"))).toBe(false);
    expect(lerAgente(p, "auditor")).toBe(AUDITOR);
    expect(lerAgente(p, "triagem")).toBe(TRIAGEM);
  });
});

describe("init com política", () => {
  it("só com a versão: frontmatter fica, resolução vai para o registro e o id para o lock", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const r = await init(p);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toBe(AUDITOR);
    const orq = lerLock(p).orquestracao;
    expect(orq).toMatchObject({ versao_resolvedor: 1, tabela_embutida: 1, matriz_effort_claude: 1 });
    const id = orq?.agentes["auditor"]?.claude ?? "";
    const res = registro(p, id);
    expect(res).toMatchObject({ agente: "auditor", origem_classe: "declarada", origem_alternativa: "skill" });
    expect(registro(p, orq?.agentes["triagem"]?.claude ?? "")).toMatchObject({ classe_declarada: "mecanico_triagem", origem_classe: "inferida" });
    // o registro não é artefato gerenciado: a limpeza nunca o alcança
    const arquivos = Object.keys((lerLock(p) as { instalacao: { arquivos: Record<string, string> } }).instalacao.arquivos);
    expect(arquivos.some((a) => a.startsWith(".expx/resolucoes/"))).toBe(false);
  });

  it("cadeia do projeto reescreve o agente, e alternativa sem effort tira a linha", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", {
      expx_orquestracao: 1,
      adaptadores: { claude: { classes: { raciocinio_normal: [{ id: "opus-sem-effort", model: "claude-opus-4-6" }] } } },
    });
    const r = await init(p);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor", "classe: raciocinio_normal\nmodel: claude-opus-4-6"));
    expect(registro(p, lerLock(p).orquestracao?.agentes["auditor"]?.claude ?? "")).toMatchObject({ origem_alternativa: "projeto" });
  });

  it("elevação do agente usa a embutida e exclui o frontmatter", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1, agentes: { auditor: { classe: "profundo_excepcional", justificativa: "legado" } } });
    const r = await init(p);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor", "classe: raciocinio_normal\nmodel: opus\neffort: high"));
  });

  it("o agentes.json v1 é aplicado depois da resolução e fica marcado", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    gravar(p, ".expx/agentes.json", { expx_agentes: 1, agentes: { auditor: { model: "haiku" } } });
    const r = await init(p);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor", "classe: raciocinio_normal\nmodel: haiku\neffort: high"));
    const res = registro(p, lerLock(p).orquestracao?.agentes["auditor"]?.claude ?? "");
    expect(res).toMatchObject({ sobreposta_por: "agentes-json-v1", materializado: { model: "haiku", effort: "high" }, origem_alternativa: "agentes-json-v1" });
  });

  it("reinstalar com o registro igual é aceito e não muda nada", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const o = origens();
    await init(p, o);
    const antes = readFileSync(join(p, ".expx/expx-lock.json"), "utf8");
    const r = await init(p, o);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(readFileSync(join(p, ".expx/expx-lock.json"), "utf8")).toBe(antes);
  });

  it("política removida tira a seção do lock e mantém o registro", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const o = origens();
    await init(p, o);
    const id = lerLock(p).orquestracao?.agentes["auditor"]?.claude ?? "";
    rmSync(join(p, ".expx/orquestracao.json"));
    const r = await init(p, o);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerLock(p).orquestracao).toBeUndefined();
    expect(existsSync(join(p, ".expx/resolucoes", `${id}.json`))).toBe(true);
  });
});

describe("init com política — falha antes de escrever", () => {
  async function falhaSemEscrever(p: string, o = origens()): Promise<string> {
    const r = await init(p, o);
    expect(r.ok).toBe(false);
    expect(existsSync(join(p, ".expx/expx-lock.json"))).toBe(false);
    expect(existsSync(join(p, ".claude/agents"))).toBe(false);
    expect(existsSync(join(p, ".expx/resolucoes"))).toBe(false);
    return r.erros.join("\n");
  }

  it("política inválida", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1, extra: true });
    expect(await falhaSemEscrever(p)).toContain(".expx/orquestracao.json");
  });

  it("recusa do resolvedor, com agente e motivo", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const o = { alfa: skill("alfa", { ".claude/agents/auditor.md": AGENTE("auditor", "classe: profundo_excepcional\nmodel: haiku") }) };
    const erro = await falhaSemEscrever(p, o);
    expect(erro).toContain("auditor");
    expect(erro).toContain("frontmatter_fora_da_classe");
  });

  it("classe fora do vocabulário no agente da skill", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const o = { alfa: skill("alfa", { ".claude/agents/auditor.md": AGENTE("auditor", "classe: altissima\nmodel: opus") }) };
    expect(await falhaSemEscrever(p, o)).toContain("altissima");
  });

  it("registro existente com bytes diferentes é corrupção", async () => {
    const p = produto();
    gravar(p, ".expx/orquestracao.json", { expx_orquestracao: 1 });
    const o = origens();
    await init(p, o);
    const lockAntes = readFileSync(join(p, ".expx/expx-lock.json"), "utf8");
    const dir = join(p, ".expx/resolucoes");
    const arquivo = readdirSync(dir)[0] ?? "";
    writeFileSync(join(dir, arquivo), readFileSync(join(dir, arquivo), "utf8").replace("\n  ", "\n    "));
    const r = await init(p, o);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain(arquivo.replace(/\.json$/, ""));
    expect(readFileSync(join(p, ".expx/expx-lock.json"), "utf8")).toBe(lockAntes);
  });
});
