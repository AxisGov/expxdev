import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerPolitica, validarPolitica } from "./politica.js";

/**
 * `.expx/orquestracao.json` — a forma do arquivo (CONTRATO-expx-orquestracao §4.1).
 * A validação de `model`/`effort` por adaptador é de `adaptadores.ts`.
 */

const BASE = { expx_orquestracao: 1 };

function erro(bruto: unknown): string {
  const r = validarPolitica(bruto);
  if (r.ok) throw new Error("deveria reprovar: " + JSON.stringify(bruto));
  return r.erro;
}

const cadeia = (...alts: unknown[]) => ({ ...BASE, adaptadores: { claude: { classes: { raciocinio_normal: alts } } } });

describe("validarPolitica — forma", () => {
  it("aceita o mínimo, e adaptadores e agentes ausentes viram vazios", () => {
    const r = validarPolitica(BASE);
    expect(r).toEqual({ ok: true, politica: { adaptadores: {}, agentes: {} } });
  });

  it("aceita o exemplo do contrato", () => {
    const r = validarPolitica({
      ...BASE,
      _comentario: "chave de comentário é ignorada",
      adaptadores: {
        claude: {
          classes: {
            raciocinio_normal: [
              { id: "sonnet-high", model: "sonnet", effort: "high" },
              { id: "opus-medium", model: "opus", effort: "medium" },
            ],
          },
        },
      },
      agentes: { "runx-investigador": { classe: "profundo_excepcional", justificativa: "causa raiz em legado" } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.politica.adaptadores.claude?.classes.raciocinio_normal?.map((a) => a.id)).toEqual(["sonnet-high", "opus-medium"]);
    expect(r.politica.agentes["runx-investigador"]?.classe).toBe("profundo_excepcional");
  });

  it("exige expx_orquestracao igual a 1", () => {
    expect(erro({})).toContain("expx_orquestracao");
    expect(erro({ expx_orquestracao: 2 })).toContain("expx_orquestracao");
  });

  it("recusa raiz que não é objeto", () => {
    expect(erro([])).toContain("objeto");
    expect(erro("x")).toContain("objeto");
  });

  it("recusa chave de topo desconhecida, mas não as de comentário", () => {
    expect(erro({ ...BASE, politica: {} })).toContain("politica");
    expect(validarPolitica({ ...BASE, _nota: 1 }).ok).toBe(true);
  });

  it("recusa adaptador e classe fora do vocabulário, apontando o caminho", () => {
    expect(erro({ ...BASE, adaptadores: { gemini: { classes: {} } } })).toContain("adaptadores");
    expect(erro({ ...BASE, adaptadores: { claude: { classes: { genial: [] } } } })).toContain("adaptadores.claude.classes");
    expect(erro({ ...BASE, adaptadores: { claude: { classes: {}, extra: 1 } } })).toContain("adaptadores.claude");
  });

  it("recusa cadeia vazia", () => {
    expect(erro(cadeia())).toContain("adaptadores.claude.classes.raciocinio_normal");
  });

  it("recusa id repetido, id reservado e id fora do padrão", () => {
    const a = { id: "x", model: "sonnet" };
    expect(erro(cadeia(a, a))).toMatch(/repetid/);
    expect(erro(cadeia({ id: "frontmatter-da-skill", model: "sonnet" }))).toContain("frontmatter-da-skill");
    expect(erro(cadeia({ id: "Maiuscula", model: "sonnet" }))).toContain("raciocinio_normal[0].id");
  });

  it("recusa chave extra na alternativa (nenhum campo carrega credencial)", () => {
    expect(erro(cadeia({ id: "x", model: "sonnet", api_key: "sk-123" }))).toContain("raciocinio_normal[0]");
    expect(erro(cadeia({ id: "x", model: "sonnet", url: "https://exemplo" }))).toContain("raciocinio_normal[0]");
  });

  it("exige model texto não vazio e effort texto quando presente", () => {
    expect(erro(cadeia({ id: "x" }))).toContain("raciocinio_normal[0].model");
    expect(erro(cadeia({ id: "x", model: "" }))).toContain("raciocinio_normal[0].model");
    expect(erro(cadeia({ id: "x", model: "sonnet", effort: 3 }))).toContain("raciocinio_normal[0].effort");
  });
});

describe("validarPolitica — agentes", () => {
  const ag = (agentes: unknown) => ({ ...BASE, agentes });

  it("exige classe do vocabulário", () => {
    expect(erro(ag({ "runx-qa": {} }))).toContain("agentes.runx-qa.classe");
    expect(erro(ag({ "runx-qa": { classe: "alta" } }))).toContain("agentes.runx-qa.classe");
  });

  it("recusa nome fora do padrão e chave extra", () => {
    expect(erro(ag({ "Runx QA": { classe: "raciocinio_normal" } }))).toContain("Runx QA");
    expect(erro(ag({ "runx-qa": { classe: "raciocinio_normal", model: "opus" } }))).toContain("agentes.runx-qa");
  });

  it("profundo_excepcional exige justificativa não vazia depois de trim", () => {
    expect(erro(ag({ "runx-qa": { classe: "profundo_excepcional" } }))).toContain("justificativa");
    expect(erro(ag({ "runx-qa": { classe: "profundo_excepcional", justificativa: "   " } }))).toContain("justificativa");
    expect(validarPolitica(ag({ "runx-qa": { classe: "profundo_excepcional", justificativa: "legado" } })).ok).toBe(true);
    expect(validarPolitica(ag({ "runx-qa": { classe: "raciocinio_normal" } })).ok).toBe(true);
  });
});

describe("lerPolitica", () => {
  const criados: string[] = [];
  afterEach(() => {
    for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
  });
  function projeto(conteudo?: string): string {
    const raiz = mkdtempSync(join(tmpdir(), "expx-orq-"));
    criados.push(raiz);
    if (conteudo !== undefined) {
      mkdirSync(join(raiz, ".expx"));
      writeFileSync(join(raiz, ".expx", "orquestracao.json"), conteudo);
    }
    return raiz;
  }

  it("ausente: camada inativa, sem erro", () => {
    expect(lerPolitica(projeto())).toEqual({ ok: true, ativa: false });
  });

  it("presente e válido: camada ativa", () => {
    const r = lerPolitica(projeto(JSON.stringify(BASE)));
    expect(r).toEqual({ ok: true, ativa: true, politica: { adaptadores: {}, agentes: {} } });
  });

  it("JSON inválido falha, em vez de valer como ausente", () => {
    const r = lerPolitica(projeto("{ nao e json"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain(".expx/orquestracao.json");
  });

  it("forma inválida falha com o caminho da chave", () => {
    const r = lerPolitica(projeto(JSON.stringify({ ...BASE, agentes: { "runx-qa": {} } })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("agentes.runx-qa.classe");
  });
});
