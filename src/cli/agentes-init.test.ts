import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "./init.js";
import { aplicarOverride, lerOverridesDoProjeto } from "../harness/agentes.js";

/**
 * Modelo e esforço dos agentes: o frontmatter da skill é o piso, e o
 * `.expx/agentes.json` do projeto sobrepõe — e sobrevive à reinstalação.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const AGENTE = (nome: string, extra = "model: opus\neffort: high") =>
  `---\nname: ${nome}\ndescription: audita\ntools: Read\n${extra}\n---\n\nCorpo do agente.\n`;

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
  const p = mkdtempSync(join(tmpdir(), "expx-agentes-"));
  criados.push(p);
  return p;
}

const lerAgente = (p: string, n: string) => readFileSync(join(p, ".claude/agents", `${n}.md`), "utf8");
const gravarOverride = (p: string, conteudo: unknown) => {
  mkdirSync(join(p, ".expx"), { recursive: true });
  writeFileSync(join(p, ".expx/agentes.json"), typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
};

describe("aplicarOverride", () => {
  it("troca model e effort sem tocar no resto", () => {
    const r = aplicarOverride(AGENTE("a"), { model: "sonnet", effort: "medium" });
    expect(r).toBe(AGENTE("a", "model: sonnet\neffort: medium"));
  });
  it("insere o campo ausente ao fim do frontmatter", () => {
    const r = aplicarOverride("---\nname: a\nmodel: inherit\n---\ncorpo\n", { effort: "high" });
    expect(r).toBe("---\nname: a\nmodel: inherit\neffort: high\n---\ncorpo\n");
  });
  it("preserva CRLF", () => {
    const r = aplicarOverride("---\r\nname: a\r\nmodel: inherit\r\n---\r\ncorpo\r\n", { model: "opus" });
    expect(r).toBe("---\r\nname: a\r\nmodel: opus\r\n---\r\ncorpo\r\n");
  });
  it("troca a chave entre aspas em vez de duplicá-la", () => {
    const r = aplicarOverride('---\nname: a\n"model": opus\n---\ncorpo\n', { model: "haiku" });
    expect(r).toBe("---\nname: a\nmodel: haiku\n---\ncorpo\n");
  });
  it("sem frontmatter devolve igual", () => {
    expect(aplicarOverride("# so corpo\n", { model: "opus" })).toBe("# so corpo\n");
  });
});

describe("lerOverridesDoProjeto", () => {
  it("ausente vale o frontmatter", () => {
    expect(lerOverridesDoProjeto(produto())).toEqual({ ok: true, overrides: {} });
  });
  it.each([
    ["JSON quebrado", "{nope"],
    ["model fora do formato", { agentes: { a: { model: "gpt-4" } } }],
    ["effort invalido", { agentes: { a: { effort: "altissimo" } } }],
    ["chave desconhecida no agente", { agentes: { a: { tools: "Read" } } }],
    ["chave desconhecida no topo", { agentes: {}, outra: 1 }],
    ["versao futura", { expx_agentes: 2, agentes: {} }],
    ["agentes nulo", { expx_agentes: 1, agentes: null }],
  ])("falha: %s", (_n, conteudo) => {
    const p = produto();
    gravarOverride(p, conteudo);
    expect(lerOverridesDoProjeto(p).ok).toBe(false);
  });
});

describe("init com agentes", () => {
  const origens = () => ({
    alfa: skill("alfa", {
      ".claude/agents/auditor.md": AGENTE("auditor"),
      ".claude/agents/investigador.md": AGENTE("investigador", "model: sonnet\neffort: medium"),
    }),
  });

  it("instala o agente com o piso da skill quando não há override", async () => {
    const p = produto();
    const r = await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: origens() });
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor"));
    expect(r.avisos).toEqual([]);
  });

  it("aplica o override do projeto e o preserva na reinstalação", async () => {
    const p = produto();
    gravarOverride(p, { expx_agentes: 1, agentes: { auditor: { model: "sonnet", effort: "low" } } });
    const o = origens();
    for (let i = 0; i < 2; i++) {
      const r = await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: o });
      expect(r.ok, r.erros.join("\n")).toBe(true);
      expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor", "model: sonnet\neffort: low"));
      expect(lerAgente(p, "investigador")).toBe(AGENTE("investigador", "model: sonnet\neffort: medium"));
    }
    // o arquivo do projeto nunca é reescrito pelo init
    expect(JSON.parse(readFileSync(join(p, ".expx/agentes.json"), "utf8"))).toEqual({
      expx_agentes: 1,
      agentes: { auditor: { model: "sonnet", effort: "low" } },
    });
    // o lock trava o conteúdo FINAL, que é o que o doctor confere
    const lock = JSON.parse(readFileSync(join(p, ".expx/expx-lock.json"), "utf8")) as {
      instalacao: { arquivos: Record<string, string> };
    };
    expect(Object.keys(lock.instalacao.arquivos)).toContain(".claude/agents/auditor.md");
  });

  it("remover o override devolve o agente ao piso", async () => {
    const p = produto();
    const o = origens();
    gravarOverride(p, { agentes: { auditor: { model: "haiku" } } });
    await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: o });
    expect(lerAgente(p, "auditor")).toContain("model: haiku");
    rmSync(join(p, ".expx/agentes.json"));
    await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: o });
    expect(lerAgente(p, "auditor")).toBe(AGENTE("auditor"));
  });

  it("override inválido falha antes de escrever", async () => {
    const p = produto();
    gravarOverride(p, { agentes: { auditor: { effort: "altissimo" } } });
    const r = await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: origens() });
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("effort invalido");
  });

  it("override de agente desconhecido avisa e não falha", async () => {
    const p = produto();
    gravarOverride(p, { agentes: { fantasma: { model: "opus" } } });
    const r = await executarInit({ raiz: p, skills: ["alfa"], harness: ["claude"], origens: origens() });
    expect(r.ok).toBe(true);
    expect(r.avisos.join("\n")).toContain("fantasma");
  });
});

describe("init com agentes — proteção do que não é do expx", () => {
  const um = () => ({ alfa: skill("alfa", { ".claude/agents/auditor.md": AGENTE("auditor") }) });
  const rodar = (p: string, skills: string[], origens: Record<string, string>) =>
    executarInit({ raiz: p, skills, harness: ["claude"], origens });

  it("não sobrescreve agente do projeto com o mesmo nome", async () => {
    const p = produto();
    mkdirSync(join(p, ".claude/agents"), { recursive: true });
    writeFileSync(join(p, ".claude/agents/auditor.md"), "# meu auditor\n");
    const r = await rodar(p, ["alfa"], um());
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain(".claude/agents/auditor.md");
    expect(readFileSync(join(p, ".claude/agents/auditor.md"), "utf8")).toBe("# meu auditor\n");
  });

  it("aceita o agente existente quando os bytes já são os do plano", async () => {
    const p = produto();
    mkdirSync(join(p, ".claude/agents"), { recursive: true });
    writeFileSync(join(p, ".claude/agents/auditor.md"), AGENTE("auditor"));
    const r = await rodar(p, ["alfa"], um());
    expect(r.ok, r.erros.join("\n")).toBe(true);
  });

  it("reinstalar sobre o que o próprio expx gravou não é conflito", async () => {
    const p = produto();
    const o = um();
    expect((await rodar(p, ["alfa"], o)).ok).toBe(true);
    gravarOverride(p, { agentes: { auditor: { model: "haiku" } } });
    const r = await rodar(p, ["alfa"], o);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(lerAgente(p, "auditor")).toContain("model: haiku");
  });

  it("remove o agente de uma skill que saiu, mas preserva o que foi editado à mão", async () => {
    const p = produto();
    const o = {
      alfa: skill("alfa", { ".claude/agents/auditor.md": AGENTE("auditor") }),
      beta: skill("beta", { ".claude/agents/revisor.md": AGENTE("revisor") }),
    };
    expect((await rodar(p, ["alfa", "beta"], o)).ok).toBe(true);
    const r = await rodar(p, ["alfa"], o);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(existsSync(join(p, ".claude/agents/revisor.md"))).toBe(false);
    expect(existsSync(join(p, ".claude/agents/auditor.md"))).toBe(true);

    expect((await rodar(p, ["alfa", "beta"], o)).ok).toBe(true);
    writeFileSync(join(p, ".claude/agents/revisor.md"), "# editado a mao\n");
    const r2 = await rodar(p, ["alfa"], o);
    expect(r2.ok).toBe(true);
    expect(readFileSync(join(p, ".claude/agents/revisor.md"), "utf8")).toBe("# editado a mao\n");
    expect(r2.avisos.join("\n")).toContain("revisor.md");
  });

  it("recusa agente que é link simbólico para fora da skill", async () => {
    const repo = skill("alfa", { ".claude/agents/ok.md": AGENTE("ok") });
    const pastaAlvo = mkdtempSync(join(tmpdir(), "expx-alvo-"));
    criados.push(pastaAlvo);
    writeFileSync(join(pastaAlvo, "segredo.md"), "SEGREDO\n");
    try {
      symlinkSync(join(pastaAlvo, "segredo.md"), join(repo, ".claude/agents/vazado.md"));
    } catch {
      return; // sem permissão de symlink neste ambiente
    }
    const p = produto();
    const r = await rodar(p, ["alfa"], { alfa: repo });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.falhas)).toContain("link simbolico");
    expect(existsSync(join(p, ".claude/agents/vazado.md"))).toBe(false);
  });
});
