import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "../cli/init.js";
import { diagnosticar, type Achado } from "./verificadores.js";

/** Achados `orquestracao-*` do doctor (CONTRATO-expx-instalacao §5.3). */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const AGENTE = (nome: string, extra: string) => `---\nname: ${nome}\ndescription: audita\ntools: Read\n${extra}\n---\n\nCorpo.\n`;

function temp(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

function gravar(base: string, rel: string, conteudo: unknown): void {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo));
}

async function projeto(opcoes: { politica?: unknown; agentesJson?: unknown } = {}): Promise<{ raiz: string; home: string }> {
  const repo = criarRepoSkill({ nome: "alfa", tags: [] });
  criados.push(repo);
  gravar(repo, ".claude/agents/auditor.md", AGENTE("auditor", "classe: raciocinio_normal\nmodel: sonnet\neffort: high"));
  gravar(repo, ".claude/agents/triagem.md", AGENTE("triagem", "model: haiku"));
  const raiz = temp("expx-orq-doctor-");
  if (opcoes.politica !== undefined) gravar(raiz, ".expx/orquestracao.json", opcoes.politica);
  if (opcoes.agentesJson !== undefined) gravar(raiz, ".expx/agentes.json", opcoes.agentesJson);
  const r = await executarInit({ raiz, skills: ["alfa"], harness: ["claude"], origens: { alfa: repo } });
  if (!r.ok) throw new Error(r.erros.join("\n"));
  return { raiz, home: temp("expx-home-") };
}

function achados(raiz: string, env: NodeJS.ProcessEnv): Achado[] {
  return diagnosticar(raiz, env).achados.filter((a) => a.id.startsWith("orquestracao-"));
}
const ids = (as: Achado[]) => as.map((a) => `${a.id}:${a.severidade}`).sort();

describe("doctor — orquestração", () => {
  it("sem política nem seção no lock, não diz nada", async () => {
    const p = await projeto();
    expect(achados(p.raiz, { HOME: p.home })).toEqual([]);
  });

  it("com política saudável, só avisa a classe inferida", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const a = achados(p.raiz, { HOME: p.home });
    expect(ids(a)).toEqual(["orquestracao-classe-inferida:aviso"]);
    expect(a[0]?.problema).toContain("triagem");
    expect(a[0]?.problema).not.toContain("auditor");
  });

  it("política que ficou inválida é erro", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    gravar(p.raiz, ".expx/orquestracao.json", { expx_orquestracao: 1, extra: 1 });
    expect(ids(achados(p.raiz, { HOME: p.home }))).toContain("orquestracao-invalida:erro");
  });

  it("política removida depois do init: a seção do lock sobra, e é aviso", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    rmSync(join(p.raiz, ".expx/orquestracao.json"));
    expect(ids(achados(p.raiz, { HOME: p.home }))).toContain("orquestracao-lock-sem-politica:aviso");
  });

  it("registro citado pelo lock e ausente é erro", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const dir = join(p.raiz, ".expx/resolucoes");
    for (const f of readdirSync(dir)) rmSync(join(dir, f));
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-resolucao-ausente");
    expect(a?.severidade).toBe("erro");
  });

  it("registro adulterado é erro, inclusive só nos espaços", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const dir = join(p.raiz, ".expx/resolucoes");
    const f = readdirSync(dir)[0] ?? "";
    writeFileSync(join(dir, f), readFileSync(join(dir, f), "utf8").replace("\n  ", "\n    "));
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-registro-adulterado");
    expect(a?.severidade).toBe("erro");
    expect(a?.problema).toContain(f.replace(/\.json$/, ""));
  });

  it("agentes.json v1 abaixo da classe declarada é aviso", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 }, agentesJson: { expx_agentes: 1, agentes: { auditor: { model: "haiku" } } } });
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-v1-abaixo-da-classe");
    expect(a?.severidade).toBe("aviso");
    expect(a?.problema).toContain("auditor");
  });

  it("com override v1, o fallback aceita a cadeia e o materializado", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 }, agentesJson: { expx_agentes: 1, agentes: { auditor: { model: "haiku" } } } });
    const fora = (modelos: string[]) => {
      gravar(p.raiz, ".claude/settings.local.json", { fallbackModel: modelos });
      return achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-fallback-fora")?.problema ?? "";
    };
    // auditor: cadeia = sonnet (frontmatter), materializado = haiku; triagem: cadeia = haiku
    expect(fora(["haiku"])).toBe("");
    expect(fora(["sonnet"])).not.toContain("auditor");
    expect(fora(["claude-opus-4-6"])).toContain("auditor");
  });

  it("registro válido de outro agente, apontado pelo lock, é adulteração", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const lockPath = join(p.raiz, ".expx/expx-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { orquestracao: { agentes: Record<string, { claude: string }> } };
    const doTriagem = lock.orquestracao.agentes["triagem"]?.claude ?? "";
    lock.orquestracao.agentes["auditor"] = { claude: doTriagem };
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-registro-adulterado");
    expect(a?.problema).toContain("auditor");
    expect(a?.problema).toContain("triagem");
  });

  it("id do lock fora do formato não sai de .expx/resolucoes: o lock é ilegível", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const lockPath = join(p.raiz, ".expx/expx-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { orquestracao: { agentes: Record<string, { claude: string }> } };
    lock.orquestracao.agentes["auditor"] = { claude: "../expx-lock" };
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const todos = diagnosticar(p.raiz, { HOME: p.home }).achados;
    expect(todos.find((a) => a.id === "lock-ilegivel")?.severidade).toBe("erro");
  });

  it("registro forjado com hash válido e sem cadeia é adulteração, não derruba o doctor", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const dir = join(p.raiz, ".expx/resolucoes");
    const lockPath = join(p.raiz, ".expx/expx-lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { orquestracao: { agentes: Record<string, { claude: string }> } };
    const id = lock.orquestracao.agentes["auditor"]?.claude ?? "";
    const original = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8")) as Record<string, unknown>;
    delete original["cadeia"];
    delete original["resolucao_id"];
    const { createHash } = await import("node:crypto");
    const { jsonCanonico } = await import("../plugin/plano.js");
    const novo = createHash("sha256").update(jsonCanonico(original)).digest("hex");
    const ordenado = Object.fromEntries(Object.entries({ ...original, resolucao_id: novo }).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(join(dir, `${novo}.json`), `${JSON.stringify(ordenado, null, 2)}\n`);
    lock.orquestracao.agentes["auditor"] = { claude: novo };
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    gravar(p.raiz, ".claude/settings.local.json", { fallbackModel: ["opus"] });
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-registro-adulterado");
    expect(a?.problema).toContain("auditor");
  });

  it("variáveis que sobrepõem o frontmatter no ambiente do doctor são aviso", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    const a = achados(p.raiz, { HOME: p.home, CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1", CLAUDE_CODE_EFFORT_LEVEL: "low" }).find(
      (x) => x.id === "orquestracao-variavel-sobrepoe",
    );
    expect(a?.problema).toContain("CLAUDE_CODE_SUBAGENT_MODEL_FORCE");
    expect(a?.problema).toContain("CLAUDE_CODE_EFFORT_LEVEL");
  });

  it("fallbackModel fora das cadeias: avisa com o arquivo de origem e respeita a precedência", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    // usuário: só modelos que correspondem; projeto: um Opus que não é de nenhuma cadeia
    gravar(p.home, ".claude/settings.json", { fallbackModel: ["sonnet"] });
    gravar(p.raiz, ".claude/settings.local.json", { fallbackModel: ["claude-opus-4-6"] });
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-fallback-fora");
    expect(a?.severidade).toBe("aviso");
    expect(a?.problema).toContain(".claude/settings.local.json");
    expect(a?.problema).toContain("claude-opus-4-6");
  });

  it("a fonte de maior precedência vence inteira, sem mescla", async () => {
    const p = await projeto({ politica: { expx_orquestracao: 1 } });
    gravar(p.home, ".claude/settings.json", { fallbackModel: ["claude-opus-4-6"] });
    // o settings do projeto vence o do usuário: sonnet corresponde à cadeia do auditor
    gravar(p.raiz, ".claude/settings.local.json", { fallbackModel: ["sonnet", "haiku"] });
    const a = achados(p.raiz, { HOME: p.home }).find((x) => x.id === "orquestracao-fallback-fora");
    // haiku não corresponde à cadeia do auditor (sonnet); claude-opus-4-6 do usuário não conta
    expect(a?.problema).toContain("haiku");
    expect(a?.problema).not.toContain("claude-opus-4-6");
  });
});
