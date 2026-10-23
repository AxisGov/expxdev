import type { ConfiguracaoAgente, Evento } from "./tipos.js";

export type ExecucaoDoEvento = {
  texto: string;
  fonte: "histórico" | "configuração atual";
};

/**
 * Modelo/esforço do próprio evento vencem a configuração instalada hoje.
 *
 * A presença da chave é relevante: `null` numa linha nova significa que o
 * escritor tentou capturar e o runtime não informou; ausência identifica uma
 * linha antiga, para a qual só existe o fallback explicitamente rotulado.
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

  const atual = agentes.find((agente) => agente.nome === evento.agente);
  return {
    texto: [evento.agente, atual?.model, atual?.effort].filter(Boolean).join(" · "),
    fonte: "configuração atual",
  };
}
