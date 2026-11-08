import { describe, expect, it } from "vitest";
import { ROTULO, visaoDaOrquestracao } from "./orquestracao.js";
import type { Evento, ResolucaoNoPainel } from "./tipos.js";

/** A F5 junta declarada × resolvida × observada por invocação (CONTRATO-expx-orquestracao §11.5). */

const RID = "a".repeat(64);
const RID_V1 = "b".repeat(64);
const INST = "1".repeat(40);
const INST_256 = "1".repeat(64);

const resolucao: ResolucaoNoPainel = {
  agente: "revisor-diff",
  model: "sonnet",
  effort: "high",
  classe_declarada: "raciocinio_normal",
  origem_classe: "declarada",
  classe_resolvida: "raciocinio_normal",
  cadeia: [
    { id: "sonnet-high", model: "sonnet", effort: "high" },
    { id: "opus-medium", model: "opus", effort: "medium" },
  ],
  alternativa: { id: "sonnet-high", model: "sonnet", effort: "high" },
  origem_alternativa: "projeto",
};

const resolucoes: Record<string, ResolucaoNoPainel | null> = {
  [RID]: resolucao,
  [RID_V1]: {
    ...resolucao,
    model: "haiku",
    effort: null,
    origem_alternativa: "agentes-json-v1",
    materializado: { model: "haiku" },
  },
};

const base = {
  expx_eventos: 1 as const,
  trabalho_id: "t",
  ferramenta: "mergex",
  origem: "hook" as const,
  fase: null,
  task: null,
  agente: "revisor-diff",
  detalhe: "",
  arquivos: [],
};

function fechada(extra: Partial<Evento> = {}): Evento {
  return {
    ...base,
    ts: "2026-11-08T12:00:02Z",
    evento: "invocacao_fechada",
    resultado: "ok",
    invocacao: "toolu_1",
    estado_invocacao: "concluida",
    instancia: INST,
    papel: "revisar",
    resolucao_id: RID,
    modelos_observados: ["claude-sonnet-5-5"],
    ...extra,
  };
}

function integridade(extra: Partial<Evento> = {}): Evento {
  return {
    ...base,
    ts: "2026-11-08T12:00:01Z",
    evento: "integridade_final_verificada",
    resultado: "ok",
    instancia: INST,
    papel: "revisar",
    integridade_final: { estado: "igual", diferencas: [] },
    ...extra,
  };
}

const textos = (ds: readonly { texto: string }[]): string[] => ds.map((d) => d.texto);

describe("visaoDaOrquestracao", () => {
  it("funcional: invocação completa junta a resolução do registro, os modelos observados e a integridade da mesma instância", () => {
    const v = visaoDaOrquestracao([fechada(), integridade()], resolucoes);
    expect(v.invocacoes).toHaveLength(1);
    const l = v.invocacoes[0];
    expect(l).toMatchObject({
      invocacao: "toolu_1",
      agente: "revisor-diff",
      papel: "revisar",
      estado: "concluida",
      declarada: { classe: "raciocinio_normal", inferida: false },
      resolvida: {
        classe: "raciocinio_normal",
        origem_classe: "declarada",
        alternativa: { id: "sonnet-high", model: "sonnet", effort: "high" },
        origem_alternativa: "projeto",
        materializado: null,
      },
      observada: ["claude-sonnet-5-5"],
      integridade: { estado: "igual", diferencas: [] },
    });
    expect(l?.destaques).toEqual([]);
    expect(v.orfas).toEqual([]);
  });

  it("funcional: fora_da_politica gravado e integridade divergente ou ausente são destaques vermelhos", () => {
    const fora = visaoDaOrquestracao(
      [fechada({ fora_da_politica: true, modelos_observados: ["claude-haiku-5-5"] }), integridade({ resultado: "falha", integridade_final: { estado: "divergente", diferencas: ["status", "arvore"] } })],
      resolucoes,
    ).invocacoes[0];
    expect(fora?.destaques).toEqual([
      { nivel: "bug", texto: ROTULO.fora },
      { nivel: "bug", texto: ROTULO.integridade },
    ]);
    const ausente = visaoDaOrquestracao([fechada(), integridade({ resultado: "falha", integridade_final: { estado: "ausente", diferencas: [] } })], resolucoes).invocacoes[0];
    expect(textos(ausente?.destaques ?? [])).toEqual([ROTULO.integridade]);
  });

  it("funcional: lançada, falha e abandonada têm rótulo próprio, e só a falha é vermelha", () => {
    const lancada = visaoDaOrquestracao([fechada({ estado_invocacao: "lancada", papel: "investigar", instancia: undefined, modelos_observados: undefined })], resolucoes).invocacoes[0];
    expect(lancada?.estado).toBe("lancada");
    expect(lancada?.destaques).toEqual([{ nivel: "aviso", texto: ROTULO.lancada }]);

    const falha = visaoDaOrquestracao([fechada({ estado_invocacao: "falha", resultado: "falha" }), integridade()], resolucoes).invocacoes[0];
    expect(falha?.destaques).toEqual([{ nivel: "bug", texto: ROTULO.falha }]);

    const abandonada = visaoDaOrquestracao(
      [{ ...base, ts: "2026-11-08T12:00:00Z", evento: "invocacao_abandonada", resultado: "falha", invocacao: "toolu_9", papel: "revisar", resolucao_id: RID }],
      resolucoes,
    ).invocacoes[0];
    expect(abandonada?.estado).toBe("abandonada");
    expect(abandonada?.destaques).toEqual([{ nivel: "aviso", texto: ROTULO.abandonada }]);
  });

  it("funcional: resolução ausente, ilegível ou de outro agente é inconsistência, sem inventar declarada nem resolvida", () => {
    for (const [ev, motivo] of [
      [fechada({ resolucao_id: undefined }), "evento sem resolucao_id"],
      [fechada({ resolucao_id: "c".repeat(64) }), "resolução cccccccc ilegível no registro"],
      [fechada({ agente: "qa", papel: "testar" }), "resolução aaaaaaaa é de revisor-diff"],
    ] as const) {
      const l = visaoDaOrquestracao([ev], { ...resolucoes, ["c".repeat(64)]: null }).invocacoes[0];
      expect(l?.declarada).toBeNull();
      expect(l?.resolvida).toBeNull();
      expect(l?.destaques).toContainEqual({ nivel: "bug", texto: `${ROTULO.inconsistencia}: ${motivo}` });
    }
  });

  it("funcional: os campos de classe do evento nunca substituem o registro", () => {
    const l = visaoDaOrquestracao([fechada({ resolucao_id: "c".repeat(64), classe_declarada: "profundo_excepcional", alternativa: "opus-high" })], { [("c".repeat(64))]: null }).invocacoes[0];
    expect(l?.declarada).toBeNull();
    expect(l?.resolvida).toBeNull();
  });

  it("funcional: observado diferente da alternativa materializada é âmbar, nunca vermelho nem 'dentro da política'", () => {
    const l = visaoDaOrquestracao([fechada({ modelos_observados: ["claude-opus-5-5"] }), integridade()], resolucoes).invocacoes[0];
    expect(l?.destaques).toEqual([{ nivel: "aviso", texto: ROTULO.difere }]);
    // a exceção v1: vale o materializado, não a alternativa
    const v1 = visaoDaOrquestracao([fechada({ resolucao_id: RID_V1, modelos_observados: ["claude-haiku-5-5"] }), integridade()], resolucoes).invocacoes[0];
    expect(v1?.resolvida?.materializado).toEqual({ model: "haiku", effort: null });
    expect(v1?.destaques).toEqual([]);
    // fora_da_politica já é o julgamento: não repete em âmbar
    const fora = visaoDaOrquestracao([fechada({ fora_da_politica: true, modelos_observados: ["claude-opus-5-5"] }), integridade()], resolucoes).invocacoes[0];
    expect(textos(fora?.destaques ?? [])).toEqual([ROTULO.fora]);
    // só concluída é comparada
    const lancada = visaoDaOrquestracao([fechada({ estado_invocacao: "lancada", modelos_observados: ["claude-opus-5-5"] }), integridade()], resolucoes).invocacoes[0];
    expect(textos(lancada?.destaques ?? [])).toEqual([ROTULO.lancada]);
  });

  it("funcional: a correlação é só pela instância inteira; 40 e 64 hex não se juntam", () => {
    const v = visaoDaOrquestracao([fechada({ instancia: INST_256 }), integridade()], resolucoes);
    expect(v.invocacoes[0]?.integridade).toBeNull();
    expect(textos(v.invocacoes[0]?.destaques ?? [])).toEqual([ROTULO.par]);
    expect(v.orfas).toHaveLength(1);
  });

  it("funcional: integridade da mesma instância com outro agente ou outro papel não se anexa", () => {
    for (const outra of [integridade({ agente: "qa" }), integridade({ papel: "testar" })]) {
      const l = visaoDaOrquestracao([fechada(), outra], resolucoes).invocacoes[0];
      expect(l?.integridade).toBeNull();
      expect(l?.destaques).toContainEqual({ nivel: "bug", texto: `${ROTULO.inconsistencia}: integridade da mesma instância com outro agente ou papel` });
    }
  });

  it("funcional: invocação repetida e integridade repetida expõem a inconsistência, sem escolher uma", () => {
    const rep = visaoDaOrquestracao([fechada(), fechada({ ts: "2026-11-08T12:00:03Z", modelos_observados: ["claude-opus-5-5"] }), integridade()], resolucoes);
    expect(rep.invocacoes).toHaveLength(1);
    const l = rep.invocacoes[0];
    expect(l?.estado).toBe("repetida");
    expect(l?.observada).toBeNull();
    expect(l?.integridade).toBeNull();
    expect(l?.destaques).toEqual([{ nivel: "bug", texto: `${ROTULO.inconsistencia}: 2 linhas para a mesma invocação` }]);
    expect(rep.orfas).toEqual([]);

    const int = visaoDaOrquestracao([fechada(), integridade(), integridade({ ts: "2026-11-08T12:00:04Z" })], resolucoes).invocacoes[0];
    expect(int?.integridade).toBeNull();
    expect(int?.destaques).toEqual([{ nivel: "bug", texto: `${ROTULO.inconsistencia}: 2 integridades para a mesma instância` }]);
  });

  it("funcional: aprovador sem par é 'não visto na janela', e integridade sem invocação é órfã, não 'incompleta'", () => {
    const sem = visaoDaOrquestracao([fechada()], resolucoes);
    expect(sem.invocacoes[0]?.destaques).toEqual([{ nivel: "aviso", texto: ROTULO.par }]);
    // quem não é de aprovação não espera integridade
    expect(visaoDaOrquestracao([fechada({ papel: "investigar" })], resolucoes).invocacoes[0]?.destaques).toEqual([]);

    const orfa = visaoDaOrquestracao([integridade({ resultado: "falha", integridade_final: { estado: "divergente", diferencas: ["arvore"] } })], resolucoes);
    expect(orfa.invocacoes).toEqual([]);
    expect(orfa.orfas).toEqual([
      {
        ts: "2026-11-08T12:00:01Z",
        agente: "revisor-diff",
        papel: "revisar",
        instancia: INST,
        integridade: { estado: "divergente", diferencas: ["arvore"] },
        destaques: [{ nivel: "bug", texto: ROTULO.integridade }],
      },
    ]);
    expect(JSON.stringify(orfa)).not.toMatch(/incomplet/i);
  });

  it("funcional: sem política só existem integridades, e nenhuma invocação é inventada; linha antiga sem papel nem instância também é órfã", () => {
    const v = visaoDaOrquestracao(
      [
        integridade(),
        integridade({ ts: "2026-11-08T11:00:00Z", papel: undefined, instancia: undefined }),
        { ...base, ts: "2026-11-08T10:00:00Z", evento: "agente_concluido", resultado: "ok", resolucao_id: RID },
      ],
      resolucoes,
    );
    expect(v.invocacoes).toEqual([]);
    expect(v.orfas.map((o) => [o.papel, o.instancia])).toEqual([["revisar", INST], [null, null]]);
  });

  it("unitário: as invocações saem da mais recente para a mais antiga, como o rastro do painel", () => {
    const v = visaoDaOrquestracao(
      [fechada({ ts: "2026-11-08T12:00:05Z", invocacao: "toolu_2", instancia: "2".repeat(40), papel: "investigar" }), fechada({ papel: "investigar" })],
      resolucoes,
    );
    expect(v.invocacoes.map((l) => l.invocacao)).toEqual(["toolu_2", "toolu_1"]);
  });
});
