import type { ConfiguracaoAgente, Evento } from "./tipos.js";

export type ExecucaoDoEvento = {
  texto: string;
  fonte: "histórico" | "configuração atual" | "histórico indisponível";
};

/**
 * Modelo/esforço do próprio evento vencem a configuração instalada hoje.
 *
 * A presença da chave é relevante: `null` significa que o escritor tentou
 * capturar e o runtime não informou; ausência significa "sem snapshot".
 * O fallback atual só vale quando o evento não identifica outro harness.
 */
export function execucaoDoEvento(
  evento: Evento,
  agentes: readonly ConfiguracaoAgente[],
): ExecucaoDoEvento {
  const temSnapshot =
    Object.prototype.hasOwnProperty.call(evento, "model") ||
    Object.prototype.hasOwnProperty.call(evento, "effort");

  if (temSnapshot) {
    return {
      texto: [
        evento.agente,
        evento.model ?? "modelo não informado",
        evento.effort ?? "esforço não informado",
      ].join(" · "),
      fonte: "histórico",
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
  if (atual === undefined || (atual.model === undefined && atual.effort === undefined)) {
    return {
      texto: `${evento.agente} · modelo/esforço não informados`,
      fonte: "histórico indisponível",
    };
  }
  return {
    texto: [evento.agente, atual?.model, atual?.effort].filter(Boolean).join(" · "),
    fonte: "configuração atual",
  };
}
