#!/usr/bin/env bash
# contrato-de-commit — gramática mecânica das duas classes de commit da mergex.
#
# E1:     exatamente um Task e um Trabalho; nenhum Metodo.
# método: exatamente um Trabalho e um Metodo; nenhum Task.
#
# Outros trailers descritivos continuam permitidos. As três chaves de controle
# acima são case-sensitive e nunca podem formar uma classe híbrida.

set -uo pipefail

uso() { printf 'contrato-de-commit: %s\n' "$1" >&2; exit 64; }
invalido() { printf 'contrato-de-commit: %s\n' "$1" >&2; exit 2; }

ACAO="${1:-}"
case "$ACAO" in
  --validar-e1|--validar-metodo) shift ;;
  *) uso "ação desconhecida: ${ACAO:-<nenhuma>}" ;;
esac

TRABALHO=""
TASK=""
CHECKPOINT=""
ARQUIVO=""
COMMIT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --trabalho)   [ "$#" -ge 2 ] || uso '--trabalho precisa de valor'; TRABALHO="$2"; shift 2 ;;
    --task)       [ "$#" -ge 2 ] || uso '--task precisa de valor'; TASK="$2"; shift 2 ;;
    --checkpoint) [ "$#" -ge 2 ] || uso '--checkpoint precisa de valor'; CHECKPOINT="$2"; shift 2 ;;
    --arquivo)    [ "$#" -ge 2 ] || uso '--arquivo precisa de caminho'; ARQUIVO="$2"; shift 2 ;;
    --commit)     [ "$#" -ge 2 ] || uso '--commit precisa de SHA'; COMMIT="$2"; shift 2 ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done

[ -n "$TRABALHO" ] || uso 'falta --trabalho'
if [ -n "$ARQUIVO" ] && [ -n "$COMMIT" ]; then
  uso '--arquivo e --commit são mutuamente exclusivos'
fi
if [ -z "$ARQUIVO" ] && [ -z "$COMMIT" ]; then
  uso 'informe --arquivo ou --commit'
fi

if [ -n "$ARQUIVO" ]; then
  [ -r "$ARQUIVO" ] || uso "arquivo ilegível: $ARQUIVO"
  TEXTO="$(cat "$ARQUIVO")"
else
  TEXTO="$(git show -s --format=%B "$COMMIT" 2>/dev/null)" \
    || uso "commit inexistente ou ilegível: $COMMIT"
fi

TRAILERS="$(printf '%s\n' "$TEXTO" | git interpret-trailers --parse 2>/dev/null)" \
  || invalido 'mensagem não pôde ser interpretada'

Q_TASK="$(printf '%s\n' "$TRAILERS" | grep -Ec '^Task:[[:space:]]*')"
Q_TRABALHO="$(printf '%s\n' "$TRAILERS" | grep -Ec '^Trabalho:[[:space:]]*')"
Q_METODO="$(printf '%s\n' "$TRAILERS" | grep -Ec '^Metodo:[[:space:]]*')"
V_TASK="$(printf '%s\n' "$TRAILERS" | sed -n 's/^Task:[[:space:]]*//p')"
V_TRABALHO="$(printf '%s\n' "$TRAILERS" | sed -n 's/^Trabalho:[[:space:]]*//p')"
V_METODO="$(printf '%s\n' "$TRAILERS" | sed -n 's/^Metodo:[[:space:]]*//p')"

case "$ACAO" in
  --validar-e1)
    [ -n "$TASK" ] || uso 'falta --task'
    [ -z "$CHECKPOINT" ] || uso '--validar-e1 não recebe --checkpoint'
    [ "$Q_TASK" = 1 ] || invalido "E1 exige exatamente um Task; encontrou $Q_TASK"
    [ "$Q_TRABALHO" = 1 ] || invalido "E1 exige exatamente um Trabalho; encontrou $Q_TRABALHO"
    [ "$Q_METODO" = 0 ] || invalido "E1 não aceita Metodo; encontrou $Q_METODO"
    [ "$V_TASK" = "$TASK" ] || invalido "Task divergente: mensagem=$V_TASK contexto=$TASK"
    [ "$V_TRABALHO" = "$TRABALHO" ] \
      || invalido "Trabalho divergente: mensagem=$V_TRABALHO contexto=$TRABALHO"
    printf 'classe=e1\n'
    ;;
  --validar-metodo)
    [ -z "$TASK" ] || uso '--validar-metodo não recebe --task'
    case "$CHECKPOINT" in pre-e2|pre-e6|e8) ;; *) uso "checkpoint inválido: ${CHECKPOINT:-ausente}" ;; esac
    [ "$Q_TASK" = 0 ] || invalido "commit de método não aceita Task; encontrou $Q_TASK"
    [ "$Q_TRABALHO" = 1 ] || invalido "método exige exatamente um Trabalho; encontrou $Q_TRABALHO"
    [ "$Q_METODO" = 1 ] || invalido "método exige exatamente um Metodo; encontrou $Q_METODO"
    [ "$V_TRABALHO" = "$TRABALHO" ] \
      || invalido "Trabalho divergente: mensagem=$V_TRABALHO contexto=$TRABALHO"
    [ "$V_METODO" = "$CHECKPOINT" ] \
      || invalido "Metodo divergente: mensagem=$V_METODO contexto=$CHECKPOINT"
    printf 'classe=metodo\n'
    printf 'checkpoint=%s\n' "$CHECKPOINT"
    ;;
esac
