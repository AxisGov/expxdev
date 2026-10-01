import { describe, it, expect } from "vitest";
import type { GrupoAtividade } from "../visao/atividade.js";
import { ROTULO_EVENTO, rotuloEvento, sinalDe } from "./atividade.js";
import { EventoNome } from "../../parser/esquema/evento.js";

/** Um grupo já agrupado; cada teste muda só o que o sinal depende. */
function grupo(extra: Partial<GrupoAtividade> = {}): GrupoAtividade {
  return {
    evento: "task_concluida",
    vezes: 1,
    ts: "2026-08-29T14:32:10Z",
    alvo: "T-01.02",
    resultado: "ok",
    detalhe: "concluida",
    houveFalha: false,
    falhas: 0,
    ...extra,
  } as GrupoAtividade;
}

/**
 * Revisão do PR #10 — os oito eventos novos ganharam rótulo e nenhum ganhou
 * sinal, então os dois que são DESFECHO bem-sucedido saíam com o mesmo `·` do
 * ruído de rotina (`checkpoint_planejamento`, `arquivo_alterado`).
 *
 * Os dois, pelos escritores congelados:
 *
 *  - `bloqueio_resolvido` — `scripts/bloqueios.sh resolver`, `resultado: ok`, ao
 *    gravar `resolvido_em`. É o inverso exato do `task_bloqueada`, que a tela
 *    marca `!`: o bloqueio abrindo gritava e o bloqueio fechando não dizia nada.
 *  - `replanejamento_execucao_aprovado` — `scripts/planejamento.sh`,
 *    `resultado: ok`, quando a F5 aprova o plano replanejado **e a rodada
 *    fecha**. Fechamento, como `fase_concluida` e `task_concluida`.
 *
 * O critério do `✓` não muda: desfecho bem-sucedido. Os de transição em curso
 * (`iniciado`, `retomado`), os de rotina (`checkpoint_planejamento`) e o
 * `task_reaberta` seguem neutros, e os terminais de insucesso seguem `!` — ali o
 * `houveFalha` decide primeiro, porque o escritor os grava `bloqueado`.
 */
describe("sinalDe — o desfecho bem-sucedido é `✓`, o resto não", () => {
  it("funcional: `bloqueio_resolvido` é desfecho bem-sucedido, não ruído de rotina", () => {
    expect(sinalDe(grupo({ evento: "bloqueio_resolvido", resultado: "ok" }))).toEqual({
      marca: "✓",
      papel: "sucesso",
    });
  });

  it("funcional: `replanejamento_execucao_aprovado` fecha a rodada — `✓`, como o `fase_concluida`", () => {
    expect(sinalDe(grupo({ evento: "replanejamento_execucao_aprovado", resultado: "ok" }))).toEqual({
      marca: "✓",
      papel: "sucesso",
    });
  });

  it("funcional: os terminais de insucesso seguem `!` — o `houveFalha` decide antes de tudo", () => {
    for (const evento of ["replanejamento_execucao_esgotado", "replanejamento_execucao_recusado"]) {
      expect(
        sinalDe(grupo({ evento, resultado: "bloqueado", houveFalha: true, falhas: 1 })),
        evento,
      ).toEqual({ marca: "!", papel: "erro" });
    }
  });

  it("funcional: transição em curso e rotina seguem neutras — `✓` não virou enfeite", () => {
    for (const evento of [
      "replanejamento_execucao_iniciado",
      "replanejamento_execucao_retomado",
      "checkpoint_planejamento",
      "task_reaberta",
      "arquivo_alterado",
    ]) {
      expect(sinalDe(grupo({ evento, resultado: "ok" })), evento).toEqual({
        marca: "·",
        papel: "apagado",
      });
    }
  });

  it("funcional: o `✓` de antes continua de pé — task, fase e suíte", () => {
    for (const evento of ["task_concluida", "fase_concluida", "suite_executada"]) {
      expect(sinalDe(grupo({ evento, resultado: "verde" })), evento).toEqual({
        marca: "✓",
        papel: "sucesso",
      });
    }
  });

  it("funcional: um desfecho que falhou não é `✓` — a falha vence o nome do evento", () => {
    expect(
      sinalDe(grupo({ evento: "bloqueio_resolvido", resultado: "falha", houveFalha: true, falhas: 1 })),
    ).toEqual({ marca: "!", papel: "erro" });
  });
});

describe("rotuloEvento", () => {
  it("integração: todo evento do contrato tem rótulo legível", () => {
    expect(EventoNome.options.filter((e) => ROTULO_EVENTO[e] === undefined)).toEqual([]);
  });

  it("funcional: evento sem rótulo sai como o próprio nome, nunca em branco", () => {
    expect(rotuloEvento("evento_de_outra_skill")).toBe("evento_de_outra_skill");
  });
});
