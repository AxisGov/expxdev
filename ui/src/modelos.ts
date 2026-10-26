import type { ConfiguracaoAgente, Evento, ResolucaoNoPainel } from "./tipos.js";

export type ExecucaoDoEvento = {
  texto: string;
  fonte: "histórico" | "configuração (não observada)" | "inconsistência" | "configuração atual" | "histórico indisponível";
};

/**
 * O executor do evento, e de onde o painel tirou o que mostra.
 *
 * `model`/`effort` são só o executor observado (H10): o que vier neles vence
 * tudo e é histórico, e o que faltar não é completado. Sem nenhuma observação,
 * a configuração é papel do leitor: a resolução que o evento cita, rotulada
 * como não observada; a citada que não se lê, ou que é de outro agente, é
 * inconsistência, sem inventar. Sem resolução, vale o fallback de antes — a
 * configuração instalada hoje, só quando o evento não identifica outro harness.
 */
export function execucaoDoEvento(
  evento: Evento,
  agentes: readonly ConfiguracaoAgente[],
  resolucoes: Readonly<Record<string, ResolucaoNoPainel | null>> = {},
): ExecucaoDoEvento {
  const model = evento.model ?? null;
  const effort = evento.effort ?? null;
  if (model !== null || effort !== null) {
    return {
      texto: [evento.agente, model ?? "modelo não informado", effort ?? "esforço não informado"].join(" · "),
      fonte: "histórico",
    };
  }

  if (typeof evento.resolucao_id === "string") {
    const r = resolucoes[evento.resolucao_id];
    if (r === undefined || r === null || r.agente !== evento.agente) {
      return {
        texto: `${evento.agente} · resolução ${evento.resolucao_id.slice(0, 8)} ilegível no registro`,
        fonte: "inconsistência",
      };
    }
    return {
      texto: [evento.agente, r.model, r.effort].filter(Boolean).join(" · "),
      fonte: "configuração (não observada)",
    };
  }

  const harnessDaSessao = evento.sessao?.split("@", 1)[0];
  const harnessDoEvento = evento.harness ?? harnessDaSessao;
  const identificaOutroHarness =
    harnessDoEvento !== undefined &&
    harnessDoEvento !== "claude" &&
    harnessDoEvento !== "claude-code";
  if (identificaOutroHarness) {
    return {
      texto: `${evento.agente} · modelo/esforço não informados`,
      fonte: "histórico indisponível",
    };
  }

  const atual = agentes.find((agente) => agente.nome === evento.agente);
  // o servidor serve null para frontmatter sem a chave
  if (atual === undefined || (atual.model == null && atual.effort == null)) {
    return {
      texto: `${evento.agente} · modelo/esforço não informados`,
      fonte: "histórico indisponível",
    };
  }
  return {
    texto: [evento.agente, atual.model, atual.effort].filter(Boolean).join(" · "),
    fonte: "configuração atual",
  };
}
