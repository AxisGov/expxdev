import type { Papel } from "../desenho/cor.js";
import type { GrupoAtividade } from "../visao/atividade.js";

/**
 * Lógica pura da seção de atividade — compartilhada pelos dois motores.
 */

/** Rótulo curto e legível de um evento — sem o vocabulário de máquina. */
export const ROTULO_EVENTO: Record<string, string> = {
  fase_iniciada: "fase iniciada",
  fase_concluida: "fase concluida",
  task_iniciada: "task iniciada",
  task_concluida: "task concluida",
  task_bloqueada: "task bloqueada",
  task_reaberta: "task reaberta",
  checkpoint_planejamento: "checkpoint",
  replanejamento_execucao_iniciado: "replanejamento aberto",
  replanejamento_execucao_retomado: "replanejamento retomado",
  replanejamento_execucao_aprovado: "replanejamento aprovado",
  replanejamento_execucao_esgotado: "replanejamento esgotado",
  replanejamento_execucao_recusado: "replanejamento recusado",
  bloqueio_resolvido: "bloqueio resolvido",
  suite_executada: "suite",
  arquivo_alterado: "arquivos",
  regra_violada: "regra violada",
  acao_bloqueada: "acao bloqueada",
  agente_iniciado: "agente iniciado",
  agente_concluido: "agente concluido",
  veredito_emitido: "veredito",
  commit_criado: "commit",
  pr_aberto: "pr aberto",
};

/**
 * Os eventos cujo `✓` a tela mostra: DESFECHO, não transição.
 *
 * `bloqueio_resolvido` é o inverso exato do `task_bloqueada`, que sai `!` — sem
 * ele aqui, o bloqueio abrindo gritava e o bloqueio fechando saía com o mesmo `·`
 * do ruído de rotina. `replanejamento_execucao_aprovado` é o fechamento da rodada
 * (a F5 aprovou o plano replanejado), do mesmo tipo que `fase_concluida`.
 *
 * Quem fica fora, de propósito: as transições em curso
 * (`replanejamento_execucao_iniciado`/`_retomado`), a rotina
 * (`checkpoint_planejamento`) e o `task_reaberta`, que reabre trabalho em vez de
 * fechá-lo. Os terminais de insucesso (`_esgotado`, `_recusado`) nem chegam aqui:
 * o escritor os grava `bloqueado`, e o `houveFalha` decide antes.
 */
const DESFECHO_COM_EXITO = new Set([
  "task_concluida",
  "fase_concluida",
  "suite_executada",
  "bloqueio_resolvido",
  "replanejamento_execucao_aprovado",
]);

/** O sinal de um grupo: o que a pessoa lê antes de ler a linha. */
export function sinalDe(g: GrupoAtividade): { marca: string; papel: Papel } {
  if (g.houveFalha) return { marca: "!", papel: "erro" };
  if (DESFECHO_COM_EXITO.has(g.evento)) return { marca: "✓", papel: "sucesso" };
  return { marca: "·", papel: "apagado" };
}

/** O rótulo legível de um evento, ou o próprio nome se não mapeado. */
export function rotuloEvento(evento: string): string {
  return ROTULO_EVENTO[evento] ?? evento;
}
