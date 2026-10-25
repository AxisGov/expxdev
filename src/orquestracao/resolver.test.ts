import { describe, expect, it } from "vitest";
import { conferirResolucaoId, resolucaoId, resolver, resolverNoProjeto, sobreporV1, type EntradaResolucao, type Resolucao } from "./resolver.js";
import type { Politica } from "./tipos.js";

/** CONTRATO-expx-orquestracao §7 e §8, caso a caso. As propriedades estão em `resolver-propriedades.test.ts`. */

const VAZIA: Politica = { adaptadores: {}, agentes: {} };

function ok(e: EntradaResolucao): Resolucao {
  const r = resolver(e);
  if (!r.ok) throw new Error(`deveria resolver: ${r.motivo} — ${r.mensagem}`);
  return r.resolucao;
}

function recusa(e: EntradaResolucao): string {
  const r = resolver(e);
  if (r.ok) throw new Error("deveria recusar: " + JSON.stringify(r.resolucao));
  return r.motivo;
}

const agente = (classe?: EntradaResolucao["agente"]["classe"], model?: string, effort?: string): EntradaResolucao["agente"] => {
  const frontmatter = model === undefined ? undefined : effort === undefined ? { model } : { model, effort };
  return { nome: "runx-investigador", ...(classe === undefined ? {} : { classe }), ...(frontmatter === undefined ? {} : { frontmatter }) };
};

describe("resolverNoProjeto — opt-in", () => {
  it("política ausente: camada inativa, nenhuma resolução nem id", () => {
    expect(resolverNoProjeto({ ok: true, ativa: false }, { agente: agente("raciocinio_normal"), adaptador: "claude" })).toEqual({ ativa: false });
  });

  it("política inválida não vale como ausente", () => {
    const r = resolverNoProjeto({ ok: false, erro: "quebrada" }, { agente: agente("raciocinio_normal"), adaptador: "claude" });
    expect(r).toEqual({ ativa: true, resultado: { ok: false, motivo: "politica_invalida", mensagem: "quebrada" } });
  });
});

describe("classe declarada", () => {
  it("vence a inferência do frontmatter", () => {
    const r = ok({ agente: agente("raciocinio_normal", "opus", "high"), adaptador: "claude", politica: VAZIA });
    expect(r.classe_declarada).toBe("raciocinio_normal");
    expect(r.origem_classe).toBe("declarada");
  });

  it("sem classe, é inferida do frontmatter", () => {
    const r = ok({ agente: agente(undefined, "sonnet", "medium"), adaptador: "claude", politica: VAZIA });
    expect(r.classe_declarada).toBe("raciocinio_normal");
    expect(r.origem_classe).toBe("inferida");
  });

  it.each([[undefined], ["inherit"], ["claude-fable-5-1"]])("sem classe e frontmatter %s: falha pedindo classe explícita", (model) => {
    const r = resolver({ agente: agente(undefined, model), adaptador: "claude", politica: VAZIA });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("sem_classe");
      expect(r.mensagem).toContain("classe:");
    }
  });
});

describe("elevação", () => {
  const politica = (classe: "mecanico_triagem" | "raciocinio_normal" | "profundo_excepcional", justificativa?: string): Politica => ({
    adaptadores: {},
    agentes: { "runx-investigador": justificativa === undefined ? { classe } : { classe, justificativa } },
  });

  it("rebaixar pelo agente é recusado, não normalizado", () => {
    expect(recusa({ agente: agente("raciocinio_normal", "sonnet"), adaptador: "claude", politica: politica("mecanico_triagem") })).toBe("rebaixamento");
  });

  it("rebaixar pela tarefa, abaixo do que o agente já elevou, é recusado", () => {
    const e: EntradaResolucao = {
      agente: agente("raciocinio_normal", "sonnet"),
      adaptador: "claude",
      politica: politica("profundo_excepcional", "legado"),
      tarefa: { classe: "raciocinio_normal" },
    };
    expect(recusa(e)).toBe("rebaixamento");
  });

  it("pedir a mesma classe não é elevação e preserva o frontmatter", () => {
    const r = ok({ agente: agente("raciocinio_normal", "sonnet", "high"), adaptador: "claude", politica: politica("raciocinio_normal") });
    expect(r.origem_classe).toBe("declarada");
    expect(r.origem_alternativa).toBe("skill");
  });

  it("profundo_excepcional exige justificativa não vazia depois de trim, no agente e na tarefa", () => {
    expect(recusa({ agente: agente("raciocinio_normal", "sonnet"), adaptador: "claude", politica: politica("profundo_excepcional", "  ") })).toBe("justificativa_ausente");
    expect(
      recusa({ agente: agente("raciocinio_normal", "sonnet"), adaptador: "claude", politica: VAZIA, tarefa: { classe: "profundo_excepcional", justificativa: "\t" } }),
    ).toBe("justificativa_ausente");
  });

  it("elevação exclui o frontmatter e cai na embutida", () => {
    const r = ok({ agente: agente("raciocinio_normal", "sonnet", "high"), adaptador: "claude", politica: politica("profundo_excepcional", "legado") });
    expect(r.origem_classe).toBe("agente");
    expect(r.origem_alternativa).toBe("embutida");
    expect(r.alternativa).toEqual({ id: "embutida-opus-high", model: "opus", effort: "high" });
  });

  it("a tarefa eleva além do agente", () => {
    const r = ok({ agente: agente("mecanico_triagem", "haiku"), adaptador: "claude", politica: VAZIA, tarefa: { classe: "raciocinio_normal" } });
    expect(r.origem_classe).toBe("tarefa");
    expect(r.classe_resolvida).toBe("raciocinio_normal");
  });
});

describe("cadeia: projeto > skill > embutida > sem resolução, sem mescla", () => {
  const projeto: Politica = {
    adaptadores: { claude: { classes: { raciocinio_normal: [{ id: "p1", model: "opus", effort: "medium" }, { id: "p2", model: "sonnet" }] } } },
    agentes: {},
  };

  it("a cadeia do projeto vence o frontmatter, inteira", () => {
    const r = ok({ agente: agente("raciocinio_normal", "sonnet"), adaptador: "claude", politica: projeto });
    expect(r.origem_alternativa).toBe("projeto");
    expect(r.cadeia.map((a) => a.id)).toEqual(["p1", "p2"]);
    expect(r.alternativa.id).toBe("p1");
  });

  it("sem cadeia do projeto para a classe, vale o frontmatter (nada é mesclado de outra classe)", () => {
    const r = ok({ agente: agente("mecanico_triagem", "haiku", "low"), adaptador: "claude", politica: projeto });
    expect(r.origem_alternativa).toBe("skill");
    expect(r.cadeia).toEqual([{ id: "frontmatter-da-skill", model: "haiku", effort: "low" }]);
  });

  it("frontmatter inherit cai na embutida", () => {
    const r = ok({ agente: agente("profundo_excepcional", "inherit"), adaptador: "claude", politica: VAZIA });
    expect(r.origem_alternativa).toBe("embutida");
  });

  it("sem nenhuma cadeia: sem_resolucao", () => {
    const tabela = { versao: 99, cadeias: { claude: {}, opencode: {}, codex: {} } };
    const r = resolver({ agente: agente("raciocinio_normal"), adaptador: "claude", politica: VAZIA }, tabela);
    expect(r.ok ? "ok" : r.motivo).toBe("sem_resolucao");
  });

  it("frontmatter que contradiz a classe declarada falha, sem trocar de modelo", () => {
    expect(recusa({ agente: agente("profundo_excepcional", "haiku"), adaptador: "claude", politica: VAZIA })).toBe("frontmatter_fora_da_classe");
    expect(recusa({ agente: agente("profundo_excepcional", "claude-fable-5-1"), adaptador: "claude", politica: VAZIA })).toBe("frontmatter_fora_da_classe");
    expect(recusa({ agente: agente("profundo_excepcional", "claude-opus-4-6", "xhigh"), adaptador: "claude", politica: VAZIA })).toBe("frontmatter_invalido");
    expect(recusa({ agente: agente("raciocinio_normal", "gpt-5"), adaptador: "claude", politica: VAZIA })).toBe("frontmatter_invalido");
  });
});

describe("sessão", () => {
  const projeto: Politica = {
    adaptadores: { claude: { classes: { raciocinio_normal: [{ id: "p1", model: "opus" }, { id: "p2", model: "sonnet" }] } } },
    agentes: {},
  };

  it("escolhe uma alternativa da cadeia resolvida", () => {
    const r = ok({ agente: agente("raciocinio_normal"), adaptador: "claude", politica: projeto, sessao: { alternativa: "p2" } });
    expect(r.alternativa.id).toBe("p2");
    expect(r.origem_alternativa).toBe("sessao");
  });

  it("id fora da cadeia efetiva é recusado, mesmo que exista noutra classe ou na embutida", () => {
    expect(recusa({ agente: agente("raciocinio_normal"), adaptador: "claude", politica: projeto, sessao: { alternativa: "embutida-sonnet-medium" } })).toBe(
      "alternativa_fora_da_cadeia",
    );
  });
});

describe("nomes de agente que coincidem com propriedades de Object", () => {
  it.each(["constructor", "tostring", "hasownproperty", "valueof"])("%s sem entrada na política resolve sem elevação", (nome) => {
    const r = resolver({ agente: { nome, classe: "raciocinio_normal", frontmatter: { model: "sonnet" } }, adaptador: "claude", politica: VAZIA });
    expect(r.ok ? r.resolucao.origem_classe : r.motivo).toBe("declarada");
  });

  it("toString (nome fora do padrão) também não herda nada do Object", () => {
    const r = resolver({ agente: { nome: "toString", classe: "raciocinio_normal" }, adaptador: "claude", politica: VAZIA });
    expect(r.ok ? r.resolucao.origem_classe : r.motivo).toBe("declarada");
  });

  it("constructor com entrada própria na política é elevado normalmente", () => {
    const politica: Politica = { adaptadores: {}, agentes: { constructor: { classe: "profundo_excepcional", justificativa: "legado" } } };
    const r = resolver({ agente: { nome: "constructor", classe: "raciocinio_normal" }, adaptador: "claude", politica });
    expect(r.ok ? r.resolucao.classe_resolvida : r.motivo).toBe("profundo_excepcional");
  });
});

describe("adaptadores sem suporte operacional na v1", () => {
  it.each(["opencode", "codex"] as const)("%s nunca resolve", (adaptador) => {
    expect(recusa({ agente: agente("raciocinio_normal", "sonnet"), adaptador, politica: VAZIA })).toBe("sem_suporte_operacional");
  });
});

describe("resolucao_id", () => {
  const r = ok({ agente: agente("raciocinio_normal", "sonnet", "high"), adaptador: "claude", politica: VAZIA });

  it("é o SHA-256 do objeto sem o próprio campo, independente da ordem das chaves", () => {
    expect(r.resolucao_id).toMatch(/^[0-9a-f]{64}$/);
    const embaralhado = Object.fromEntries(Object.entries(r).reverse()) as Resolucao;
    expect(resolucaoId(embaralhado)).toBe(r.resolucao_id);
    expect(conferirResolucaoId(r)).toBe(true);
  });

  it("a conferência reprova campo ausente, formato inválido e divergência", () => {
    const { resolucao_id: _, ...semId } = r;
    expect(conferirResolucaoId(semId)).toBe(false);
    expect(conferirResolucaoId({ ...r, resolucao_id: "ABC" })).toBe(false);
    expect(conferirResolucaoId({ ...r, resolucao_id: "0".repeat(64) })).toBe(false);
    expect(conferirResolucaoId({ ...r, classe_resolvida: "profundo_excepcional" })).toBe(false);
    expect(conferirResolucaoId(null)).toBe(false);
  });
});

describe("sobreporV1 — exceção de compatibilidade", () => {
  const r = ok({ agente: agente("raciocinio_normal", "sonnet", "high"), adaptador: "claude", politica: VAZIA });

  it("marca a sobreposição, preserva cadeia e alternativa, e muda o id de forma conferível", () => {
    const s = sobreporV1(r, { model: "haiku", effort: "low" });
    expect(s.sobreposta_por).toBe("agentes-json-v1");
    expect(s.materializado).toEqual({ model: "haiku", effort: "low" });
    expect(s.origem_alternativa).toBe("agentes-json-v1");
    expect(s.cadeia).toEqual(r.cadeia);
    expect(s.alternativa).toEqual(r.alternativa);
    expect(s.resolucao_id).not.toBe(r.resolucao_id);
    expect(conferirResolucaoId(s)).toBe(true);
  });

  it("override que não muda nada não altera a resolução", () => {
    expect(sobreporV1(r, {})).toEqual(r);
    expect(sobreporV1(r, { model: "sonnet", effort: "high" })).toEqual(r);
  });

  it("override parcial completa com o valor da alternativa", () => {
    expect(sobreporV1(r, { effort: "low" }).materializado).toEqual({ model: "sonnet", effort: "low" });
  });
});
