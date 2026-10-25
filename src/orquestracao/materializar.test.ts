import { describe, expect, it } from "vitest";
import { correspondeClaude, familiaClaude } from "./adaptadores.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gravarNoRegistro, lerAgenteDaSkill, lerRegistro, reescreverModeloEsforco, serializarRegistro } from "./materializar.js";
import { conferirResolucaoId, resolucaoId, resolver } from "./resolver.js";

/** CONTRATO-expx-orquestracao §9 e CONTRATO-expx-instalacao §5.3 (F2). */

const AGENTE = (extra: string) => `---\nname: auditor\ndescription: audita\ntools: Read\n${extra}\n---\n\nCorpo.\n`;

describe("lerAgenteDaSkill", () => {
  it("lê nome, classe, model e effort do frontmatter", () => {
    expect(lerAgenteDaSkill("x/auditor.md", AGENTE("classe: profundo_excepcional\nmodel: opus\neffort: high"))).toEqual({
      ok: true,
      agente: { nome: "auditor", classe: "profundo_excepcional", frontmatter: { model: "opus", effort: "high" } },
    });
  });

  it("sem classe nem effort, omite as chaves", () => {
    expect(lerAgenteDaSkill("x/auditor.md", AGENTE("model: sonnet"))).toEqual({
      ok: true,
      agente: { nome: "auditor", frontmatter: { model: "sonnet" } },
    });
  });

  it.each(["__proto__", "Auditor", "auditor x"])("name %s fora do padrão de agente é skill inválida", (nome) => {
    const r = lerAgenteDaSkill("x/a.md", `---\nname: ${nome}\nmodel: opus\n---\n`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("name");
  });

  it("classe fora do vocabulário é skill inválida", () => {
    const r = lerAgenteDaSkill("x/auditor.md", AGENTE("classe: altissima\nmodel: opus"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("altissima");
  });
});

describe("reescreverModeloEsforco", () => {
  it("troca model e effort sem tocar no resto", () => {
    expect(reescreverModeloEsforco(AGENTE("model: opus\neffort: high"), "sonnet", "medium")).toBe(AGENTE("model: sonnet\neffort: medium"));
  });

  it("sem effort na alternativa, remove a linha effort", () => {
    expect(reescreverModeloEsforco(AGENTE("model: opus\neffort: high"), "claude-haiku-4-5", undefined)).toBe(AGENTE("model: claude-haiku-4-5"));
  });

  it("aceita o BOM no início, como o leitor de frontmatter, e o preserva", () => {
    const comBom = `\uFEFF${AGENTE("model: opus\neffort: high")}`;
    expect(reescreverModeloEsforco(comBom, "sonnet", "low")).toBe(`\uFEFF${AGENTE("model: sonnet\neffort: low")}`);
  });

  it("insere o que falta e preserva CRLF", () => {
    const crlf = "---\r\nname: a\r\n---\r\ncorpo\r\n";
    expect(reescreverModeloEsforco(crlf, "opus", "high")).toBe("---\r\nname: a\r\nmodel: opus\r\neffort: high\r\n---\r\ncorpo\r\n");
  });
});

describe("registro", () => {
  const r = resolver({ agente: { nome: "auditor", classe: "raciocinio_normal" }, adaptador: "claude", politica: { adaptadores: {}, agentes: {} } });
  if (!r.ok) throw new Error(r.mensagem);
  const resolucao = r.resolucao;

  it("serializa com chaves ordenadas, indentação 2 e quebra final, sem mudar a identidade", () => {
    const texto = serializarRegistro(resolucao);
    expect(texto.endsWith("}\n")).toBe(true);
    expect(texto).toContain('\n  "adaptador": "claude",\n');
    expect(texto.indexOf('"adaptador"')).toBeLessThan(texto.indexOf('"agente"'));
    expect(conferirResolucaoId(JSON.parse(texto))).toBe(true);
  });

  it("lerRegistro recusa objeto de forma inválida mesmo com o hash recalculado", () => {
    const semCadeia: Record<string, unknown> = { ...resolucao };
    delete semCadeia["cadeia"];
    delete semCadeia["resolucao_id"];
    const forjado = { ...semCadeia, resolucao_id: resolucaoId(semCadeia as never) };
    expect(conferirResolucaoId(forjado)).toBe(true);
    const r = lerRegistro(forjado.resolucao_id, serializarRegistro(forjado as never));
    expect(r.ok).toBe(false);
  });

  it("gravarNoRegistro escreve o ausente, aceita o idêntico e recusa bytes diferentes", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-reg-"));
    try {
      gravarNoRegistro(raiz, resolucao);
      const arquivo = join(raiz, ".expx/resolucoes", `${resolucao.resolucao_id}.json`);
      expect(readFileSync(arquivo, "utf8")).toBe(serializarRegistro(resolucao));
      gravarNoRegistro(raiz, resolucao);
      writeFileSync(arquivo, "{}");
      expect(() => gravarNoRegistro(raiz, resolucao)).toThrow(/imutavel/);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("lerRegistro aceita só a forma canônica legível de um id conferível", () => {
    const texto = serializarRegistro(resolucao);
    expect(lerRegistro(resolucao.resolucao_id, texto)).toEqual({ ok: true, resolucao });
    expect(lerRegistro(resolucao.resolucao_id, texto.replace("\n  ", "\n    ")).ok).toBe(false);
    expect(lerRegistro(resolucao.resolucao_id, JSON.stringify(resolucao)).ok).toBe(false);
    expect(lerRegistro("0".repeat(64), texto).ok).toBe(false);
    expect(lerRegistro(resolucao.resolucao_id, "{nao e json").ok).toBe(false);
  });
});

describe("família e correspondência Claude (sem substring livre)", () => {
  it.each([
    ["opus", "opus"],
    ["claude-opus-5-5", "opus"],
    ["claude-3-5-sonnet-20241022", "sonnet"],
    ["claude-fable-5-1", null],
    ["superopus", null],
    ["claude-opus-sonnet-1", null],
  ] as const)("família de %s = %s", (m, f) => {
    expect(familiaClaude(m)).toBe(f);
  });

  it("ID exato corresponde; dois IDs diferentes da mesma família não", () => {
    expect(correspondeClaude("claude-opus-5-5", "claude-opus-5-5")).toBe(true);
    expect(correspondeClaude("claude-opus-4-6", "claude-opus-5-5")).toBe(false);
  });

  it("alias corresponde a ID da mesma família, nos dois sentidos", () => {
    expect(correspondeClaude("claude-sonnet-5-5", "sonnet")).toBe(true);
    expect(correspondeClaude("sonnet", "claude-sonnet-5-5")).toBe(true);
    expect(correspondeClaude("claude-haiku-5-5", "sonnet")).toBe(false);
    expect(correspondeClaude("default", "sonnet")).toBe(false);
    expect(correspondeClaude("supersonnet", "sonnet")).toBe(false);
  });
});
