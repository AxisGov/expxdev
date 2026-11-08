import type { Evento, ResolucaoNoPainel } from "./tipos.js";

/**
 * A visão da invocação (CONTRATO-expx-orquestracao §11.5): declarada × resolvida ×
 * observada, uma linha por `invocacao`, com a integridade final anexada só pela
 * `instancia` idêntica.
 *
 * O painel mostra o que está gravado e nunca rejulga a política: `fora_da_politica`
 * e a integridade final são os julgamentos dos hooks. A ausência de
 * `fora_da_politica` não prova nada, e a única comparação feita aqui é visual — o
 * observado contra a alternativa materializada —, em âmbar. Nada é correlacionado
 * por agente, horário, tarefa ou sessão, e quando o rastro traz duas versões da
 * mesma coisa, a inconsistência aparece em vez de uma delas ser escolhida.
 */

export const ROTULO = {
  fora: "Fora da política",
  integridade: "Integridade final inválida",
  falha: "Invocação falhou",
  lancada: "Só lançamento; execução não julgável",
  abandonada: "Invocação abandonada",
  inconsistencia: "Inconsistência no rastro",
  par: "Par não visto na janela",
  difere: "Observado difere da alternativa materializada",
} as const;

export type Destaque = { nivel: "bug" | "aviso"; texto: string };

export type IntegridadeNaVisao = { estado: "igual" | "divergente" | "ausente"; diferencas: string[] };

export type LinhaInvocacao = {
  invocacao: string;
  ts: string;
  agente: string;
  papel: string | null;
  /** `repetida`: mais de uma linha terminal para a mesma invocação. */
  estado: "concluida" | "lancada" | "falha" | "abandonada" | "repetida";
  instancia: string | null;
  declarada: { classe: string; inferida: boolean } | null;
  resolvida: {
    classe: string;
    origem_classe: string;
    alternativa: { id: string; model: string; effort: string | null };
    origem_alternativa: string;
    materializado: { model: string; effort: string | null } | null;
  } | null;
  observada: string[] | null;
  integridade: IntegridadeNaVisao | null;
  destaques: Destaque[];
};

export type IntegridadeOrfa = {
  ts: string;
  agente: string;
  papel: string | null;
  instancia: string | null;
  integridade: IntegridadeNaVisao | null;
  destaques: Destaque[];
};

export type VisaoOrquestracao = { invocacoes: LinhaInvocacao[]; orfas: IntegridadeOrfa[] };

const APROVACAO = new Set(["revisar", "testar"]);

const inconsistencia = (motivo: string): Destaque => ({ nivel: "bug", texto: `${ROTULO.inconsistencia}: ${motivo}` });

/** A mesma regra do envelope (§13.2): um ID completo casa com o mesmo ID ou com o alias contido nele. */
function corresponde(observado: string, autorizado: string): boolean {
  return observado === autorizado || (/^[a-z]+$/.test(autorizado) && observado.split(/[-.[\]]/).includes(autorizado));
}

function integridadeDe(e: Evento): IntegridadeNaVisao | null {
  return e.integridade_final ? { estado: e.integridade_final.estado, diferencas: [...e.integridade_final.diferencas] } : null;
}

function destaquesDaIntegridade(i: IntegridadeNaVisao | null): Destaque[] {
  return i !== null && i.estado !== "igual" ? [{ nivel: "bug", texto: ROTULO.integridade }] : [];
}

/**
 * A resolução do registro, e só dela. Os campos de classe da linha são a projeção
 * vigente quando o escritor gravou, e podem não ser os da chamada (§11.5).
 */
function daResolucao(
  e: Evento,
  resolucoes: Readonly<Record<string, ResolucaoNoPainel | null>>,
): { declarada: LinhaInvocacao["declarada"]; resolvida: LinhaInvocacao["resolvida"]; problema: string | null } {
  const nada = { declarada: null, resolvida: null };
  if (typeof e.resolucao_id !== "string") return { ...nada, problema: "evento sem resolucao_id" };
  const r = resolucoes[e.resolucao_id];
  if (r === undefined || r === null) return { ...nada, problema: `resolução ${e.resolucao_id.slice(0, 8)} ilegível no registro` };
  if (r.agente !== e.agente) return { ...nada, problema: `resolução ${e.resolucao_id.slice(0, 8)} é de ${r.agente}` };
  return {
    declarada: { classe: r.classe_declarada, inferida: r.origem_classe === "inferida" },
    resolvida: {
      classe: r.classe_resolvida,
      origem_classe: r.origem_classe,
      alternativa: { id: r.alternativa.id, model: r.alternativa.model, effort: r.alternativa.effort ?? null },
      origem_alternativa: r.origem_alternativa,
      materializado: r.materializado ? { model: r.materializado.model, effort: r.materializado.effort ?? null } : null,
    },
    problema: null,
  };
}

/**
 * Projeta as invocações e as integridades sem invocação a partir do rastro do
 * trabalho, já na ordem do painel (da mais recente para a mais antiga).
 */
export function visaoDaOrquestracao(
  eventos: readonly Evento[],
  resolucoes: Readonly<Record<string, ResolucaoNoPainel | null>>,
): VisaoOrquestracao {
  const porInvocacao = new Map<string, Evento[]>();
  const integridades: Evento[] = [];
  for (const e of eventos) {
    if ((e.evento === "invocacao_fechada" || e.evento === "invocacao_abandonada") && typeof e.invocacao === "string") {
      const grupo = porInvocacao.get(e.invocacao);
      if (grupo) grupo.push(e);
      else porInvocacao.set(e.invocacao, [e]);
    } else if (e.evento === "integridade_final_verificada") {
      integridades.push(e);
    }
  }

  // toda instância que alguma invocação cita, mesmo repetida: a integridade dela não é órfã
  const instanciasDasInvocacoes = new Map<string, number>();
  for (const grupo of porInvocacao.values()) {
    for (const inst of new Set(grupo.map((e) => e.instancia).filter((i): i is string => typeof i === "string"))) {
      instanciasDasInvocacoes.set(inst, (instanciasDasInvocacoes.get(inst) ?? 0) + 1);
    }
  }
  const integridadesPorInstancia = new Map<string, Evento[]>();
  for (const e of integridades) {
    if (typeof e.instancia !== "string") continue;
    const grupo = integridadesPorInstancia.get(e.instancia);
    if (grupo) grupo.push(e);
    else integridadesPorInstancia.set(e.instancia, [e]);
  }

  const invocacoes: LinhaInvocacao[] = [];
  for (const [invocacao, grupo] of porInvocacao) {
    const e = grupo[0] as Evento;
    const papel = e.papel ?? null;
    if (grupo.length > 1) {
      invocacoes.push({
        invocacao, ts: e.ts, agente: e.agente, papel, estado: "repetida", instancia: null,
        declarada: null, resolvida: null, observada: null, integridade: null,
        destaques: [inconsistencia(`${String(grupo.length)} linhas para a mesma invocação`)],
      });
      continue;
    }

    const estado: LinhaInvocacao["estado"] = e.evento === "invocacao_abandonada" ? "abandonada" : (e.estado_invocacao ?? "concluida");
    const { declarada, resolvida, problema } = daResolucao(e, resolucoes);
    const observada = e.modelos_observados && e.modelos_observados.length > 0 ? [...e.modelos_observados] : null;
    const instancia = typeof e.instancia === "string" ? e.instancia : null;
    const destaques: Destaque[] = [];

    if (estado === "falha") destaques.push({ nivel: "bug", texto: ROTULO.falha });
    if (estado === "lancada") destaques.push({ nivel: "aviso", texto: ROTULO.lancada });
    if (estado === "abandonada") destaques.push({ nivel: "aviso", texto: ROTULO.abandonada });
    if (problema !== null) destaques.push(inconsistencia(problema));
    if (e.fora_da_politica === true) destaques.push({ nivel: "bug", texto: ROTULO.fora });

    let integridade: IntegridadeNaVisao | null = null;
    let integridadeComProblema = false;
    if (instancia !== null) {
      const pares = integridadesPorInstancia.get(instancia) ?? [];
      if ((instanciasDasInvocacoes.get(instancia) ?? 0) > 1) {
        destaques.push(inconsistencia("instância citada por mais de uma invocação"));
        integridadeComProblema = true;
      } else if (pares.length > 1) {
        destaques.push(inconsistencia(`${String(pares.length)} integridades para a mesma instância`));
        integridadeComProblema = true;
      } else if (pares.length === 1) {
        const par = pares[0] as Evento;
        if (par.agente !== e.agente || (par.papel ?? null) !== papel) {
          destaques.push(inconsistencia("integridade da mesma instância com outro agente ou papel"));
          integridadeComProblema = true;
        } else {
          integridade = integridadeDe(par);
          destaques.push(...destaquesDaIntegridade(integridade));
        }
      }
    }

    const julgavel = estado === "concluida" || estado === "falha";
    if (julgavel && papel !== null && APROVACAO.has(papel) && integridade === null && !integridadeComProblema) {
      destaques.push({ nivel: "aviso", texto: ROTULO.par });
    }

    if (estado === "concluida" && observada !== null && resolvida !== null && e.fora_da_politica !== true) {
      const efetivo = resolvida.materializado ?? resolvida.alternativa;
      const idAlternativa = resolvida.materializado === null ? resolvida.alternativa.id : null;
      if (observada.some((m) => !corresponde(m, efetivo.model) && m !== idAlternativa)) {
        destaques.push({ nivel: "aviso", texto: ROTULO.difere });
      }
    }

    invocacoes.push({ invocacao, ts: e.ts, agente: e.agente, papel, estado, instancia, declarada, resolvida, observada, integridade, destaques });
  }

  const orfas: IntegridadeOrfa[] = [];
  for (const e of integridades) {
    const instancia = typeof e.instancia === "string" ? e.instancia : null;
    if (instancia !== null && instanciasDasInvocacoes.has(instancia)) continue;
    // duplicata não se escolhe: nenhuma das versões aparece
    if (instancia !== null && (integridadesPorInstancia.get(instancia)?.length ?? 0) > 1) {
      orfas.push({
        ts: e.ts, agente: e.agente, papel: e.papel ?? null, instancia, integridade: null,
        destaques: [inconsistencia("instância repetida em mais de uma integridade")],
      });
      continue;
    }
    const integridade = integridadeDe(e);
    orfas.push({ ts: e.ts, agente: e.agente, papel: e.papel ?? null, instancia, integridade, destaques: destaquesDaIntegridade(integridade) });
  }

  return { invocacoes, orfas };
}
