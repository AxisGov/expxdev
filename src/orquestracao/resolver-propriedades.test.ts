import { describe, expect, it } from "vitest";
import { conferirResolucaoId, resolucaoId, resolver, type EntradaResolucao, type MotivoRecusa, type Resolucao } from "./resolver.js";
import { CLASSES, posto, type Adaptador, type Classe, type Politica } from "./tipos.js";

/**
 * Propriedades do resolvedor (CONTRATO-expx-orquestracao §7.2 e §7.3), por
 * enumeração EXAUSTIVA do produto cartesiano abaixo. O domínio é finito e
 * pequeno; percorrê-lo inteiro é mais forte que sortear casos.
 *
 * O eixo de adaptador tem o `claude` e um representante dos sem suporte
 * (`opencode`); o `codex`, que recusa pelo mesmo motivo, está nos testes de
 * exemplo de `resolver.test.ts`.
 *
 * Eixos cobertos:
 *   adaptador   × claude, opencode
 *   declarada   × ausente, as três classes
 *   frontmatter × ausente, haiku/low, sonnet, opus/high, inherit, claude-opus-4-6/xhigh (inválido)
 *   agente      × sem elevação, as três classes, profundo sem justificativa
 *   tarefa      × sem tarefa, as três classes, profundo sem justificativa
 *   projeto     × sem cadeias, cadeias nas três classes
 *   sessão      × sem sessão, p2, embutida-opus-high, frontmatter-da-skill, inexistente
 */

type Elevacao = { classe: Classe; justificativa?: string } | undefined;

const ADAPTADORES_EIXO: Adaptador[] = ["claude", "opencode"];
const DECLARADAS: Array<Classe | undefined> = [undefined, ...CLASSES];
const FRONTMATTERS: Array<{ model: string; effort?: string } | undefined> = [
  undefined,
  { model: "haiku", effort: "low" },
  { model: "sonnet" },
  { model: "opus", effort: "high" },
  { model: "inherit" },
  { model: "claude-opus-4-6", effort: "xhigh" },
];
const ELEVACOES: Elevacao[] = [
  undefined,
  { classe: "mecanico_triagem" },
  { classe: "raciocinio_normal" },
  { classe: "profundo_excepcional", justificativa: "legado" },
  { classe: "profundo_excepcional" },
];
const CADEIAS_PROJETO: Politica["adaptadores"] = {
  claude: {
    classes: {
      mecanico_triagem: [{ id: "p1", model: "haiku", effort: "low" }, { id: "p2", model: "sonnet" }],
      raciocinio_normal: [{ id: "p1", model: "sonnet", effort: "high" }, { id: "p2", model: "opus", effort: "medium" }],
      profundo_excepcional: [{ id: "p1", model: "opus", effort: "max" }, { id: "p2", model: "claude-opus-4-6", effort: "high" }],
    },
  },
};
const SESSOES: Array<string | undefined> = [undefined, "p2", "embutida-opus-high", "frontmatter-da-skill", "inexistente"];

function* entradas(): Generator<EntradaResolucao> {
  for (const adaptador of ADAPTADORES_EIXO)
    for (const classe of DECLARADAS)
      for (const frontmatter of FRONTMATTERS)
        for (const elevAgente of ELEVACOES)
          for (const tarefa of ELEVACOES)
            for (const comProjeto of [false, true])
              for (const sessao of SESSOES) {
                const politica: Politica = {
                  adaptadores: comProjeto ? CADEIAS_PROJETO : {},
                  agentes: elevAgente === undefined ? {} : { "agente-x": elevAgente },
                };
                yield {
                  agente: { nome: "agente-x", ...(classe === undefined ? {} : { classe }), ...(frontmatter === undefined ? {} : { frontmatter }) },
                  adaptador,
                  politica,
                  ...(tarefa === undefined ? {} : { tarefa }),
                  ...(sessao === undefined ? {} : { sessao: { alternativa: sessao } }),
                };
              }
}

describe("resolvedor — propriedades sobre o domínio inteiro", () => {
  const casos = [...entradas()];
  const resultados = casos.map((e) => ({ e, r: resolver(e) }));

  it("percorre o produto cartesiano completo", () => {
    expect(casos.length).toBe(2 * 4 * 6 * 5 * 5 * 2 * 5);
  });

  it("é determinístico", () => {
    for (const { e, r } of resultados) expect(resolver(e)).toEqual(r);
  });

  it("opencode nunca resolve na v1", () => {
    for (const { e, r } of resultados) if (e.adaptador === "opencode") expect(r.ok ? "ok" : r.motivo).toBe("sem_suporte_operacional");
  });

  it("nunca rebaixa: a classe resolvida é ≥ declarada, ≥ a do agente e ≥ a da tarefa", () => {
    for (const { e, r } of resultados) {
      if (!r.ok) continue;
      const s = r.resolucao;
      expect(posto(s.classe_resolvida)).toBeGreaterThanOrEqual(posto(s.classe_declarada));
      const doAgente = e.politica.agentes["agente-x"]?.classe;
      if (doAgente !== undefined) expect(posto(s.classe_resolvida)).toBeGreaterThanOrEqual(posto(doAgente));
      if (e.tarefa !== undefined) expect(posto(s.classe_resolvida)).toBeGreaterThanOrEqual(posto(e.tarefa.classe));
    }
  });

  it("pedido abaixo da classe vigente é recusado como rebaixamento", () => {
    for (const { e, r } of resultados) {
      if (e.adaptador !== "claude" || r.ok || r.motivo === "sem_classe") continue;
      const declarada = e.agente.classe;
      const doAgente = e.politica.agentes["agente-x"]?.classe;
      if (declarada !== undefined && doAgente !== undefined && posto(doAgente) < posto(declarada)) expect(r.motivo).toBe("rebaixamento");
    }
  });

  it("elevar a profundo_excepcional sem justificativa nunca resolve", () => {
    const semJust = (x: Elevacao) => x?.classe === "profundo_excepcional" && (x.justificativa ?? "").trim() === "";
    for (const { e, r } of resultados) {
      if (!r.ok) continue;
      // Só resolve se o pedido sem justificativa não foi elevação: a classe
      // vigente antes dele já era profundo_excepcional.
      const declarada = r.resolucao.classe_declarada;
      const doAgente = e.politica.agentes["agente-x"];
      if (semJust(doAgente)) expect(declarada).toBe("profundo_excepcional");
      const antesDaTarefa = doAgente !== undefined && posto(doAgente.classe) > posto(declarada) ? doAgente.classe : declarada;
      if (semJust(e.tarefa)) expect(antesDaTarefa).toBe("profundo_excepcional");
    }
  });

  it("o id é recalculável, conferível e independe da ordem das chaves", () => {
    for (const { r } of resultados) {
      if (!r.ok) continue;
      expect(conferirResolucaoId(r.resolucao)).toBe(true);
      const embaralhado = Object.fromEntries(Object.entries(r.resolucao).reverse()) as Resolucao;
      expect(resolucaoId(embaralhado)).toBe(r.resolucao.resolucao_id);
    }
  });

  it("a alternativa é sempre um elemento da cadeia, e a cadeia nunca é vazia", () => {
    for (const { r } of resultados) {
      if (!r.ok) continue;
      expect(r.resolucao.cadeia.length).toBeGreaterThan(0);
      expect(r.resolucao.cadeia).toContainEqual(r.resolucao.alternativa);
    }
  });

  it("sessão: escolhe o id pedido, ou recusa o que está fora da cadeia", () => {
    for (const { e, r } of resultados) {
      if (e.sessao === undefined) continue;
      if (r.ok) {
        expect(r.resolucao.alternativa.id).toBe(e.sessao.alternativa);
        expect(r.resolucao.origem_alternativa).toBe("sessao");
      } else if (r.motivo === "alternativa_fora_da_cadeia") {
        const semSessao = resolver({ ...e, sessao: undefined } as EntradaResolucao);
        expect(semSessao.ok).toBe(true);
        if (semSessao.ok) expect(semSessao.resolucao.cadeia.map((a) => a.id)).not.toContain(e.sessao.alternativa);
      }
    }
  });

  it("frontmatter só entra quando a classe resolvida é a declarada", () => {
    for (const { e, r } of resultados) {
      if (!r.ok) continue;
      const s = r.resolucao;
      const usouFrontmatter = s.cadeia.some((a) => a.id === "frontmatter-da-skill");
      if (usouFrontmatter) {
        expect(s.classe_resolvida).toBe(s.classe_declarada);
        expect(["declarada", "inferida"]).toContain(s.origem_classe);
        expect(s.cadeia).toHaveLength(1);
      }
      if (s.origem_classe === "agente" || s.origem_classe === "tarefa") expect(usouFrontmatter).toBe(false);
      if (e.politica.adaptadores.claude !== undefined) expect(usouFrontmatter).toBe(false);
    }
  });

  it("cadeia do projeto vence sempre que existe para a classe, inteira", () => {
    for (const { e, r } of resultados) {
      if (!r.ok || e.politica.adaptadores.claude === undefined) continue;
      const doProjeto = e.politica.adaptadores.claude.classes[r.resolucao.classe_resolvida];
      expect(r.resolucao.cadeia).toEqual(doProjeto);
      expect(["projeto", "sessao"]).toContain(r.resolucao.origem_alternativa);
    }
  });

  it("origem_classe é coerente com o que elevou", () => {
    for (const { e, r } of resultados) {
      if (!r.ok) continue;
      const s = r.resolucao;
      const base = e.agente.classe === undefined ? "inferida" : "declarada";
      const doAgente = e.politica.agentes["agente-x"]?.classe;
      const elevouAgente = doAgente !== undefined && posto(doAgente) > posto(s.classe_declarada);
      const elevouTarefa = e.tarefa !== undefined && posto(e.tarefa.classe) > posto(elevouAgente && doAgente !== undefined ? doAgente : s.classe_declarada);
      expect(s.origem_classe).toBe(elevouTarefa ? "tarefa" : elevouAgente ? "agente" : base);
    }
  });

  it("cobre todos os motivos de recusa e todas as origens de alternativa", () => {
    const motivos = new Set<MotivoRecusa>();
    const origens = new Set<string>();
    for (const { r } of resultados) {
      if (r.ok) origens.add(r.resolucao.origem_alternativa);
      else motivos.add(r.motivo);
    }
    expect([...motivos].sort()).toEqual(
      ["alternativa_fora_da_cadeia", "frontmatter_fora_da_classe", "frontmatter_invalido", "justificativa_ausente", "rebaixamento", "sem_classe", "sem_suporte_operacional"].sort(),
    );
    expect([...origens].sort()).toEqual(["embutida", "projeto", "sessao", "skill"]);
  });
});
