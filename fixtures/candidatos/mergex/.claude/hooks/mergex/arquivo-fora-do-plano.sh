#!/usr/bin/env bash
# arquivo-fora-do-plano — PreToolUse em execução de comando.
#
# Compara os arquivos em preparação para commit com a lista declarada na task.
# Fora da lista → aviso.
#
# Sobreposição intencional com o hook de escopo do sprintx e do runx: aquele
# pega na hora da edição, este pega na hora do commit. Um arquivo pode ter sido
# alterado por outro processo, ou o hook de escopo pode ter estado em aviso.
#
# Modo padrão: AVISO (hook de método). FALHA ABERTA.

HOOK="arquivo-fora-do-plano"
PADRAO="aviso"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../comum/base.sh
. "$DIR/../comum/base.sh"

ENTRADA="$(cat)"
[ "$(printf '%s' "$ENTRADA" | jq -r '.tool_name // empty' 2>/dev/null)" = "Bash" ] || exit 0

CMD="$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$CMD" ] || exit 0
printf '%s' "$CMD" | grep -Eq 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' || exit 0

CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null)"
RAIZ="$(expx_raiz "${CWD:-$PWD}")"

MODO="$(expx_modo "$HOOK" "$PADRAO" "$RAIZ")"
[ "$MODO" = "desligado" ] && exit 0

PREP="$(git -C "$RAIZ" diff --cached --name-only 2>/dev/null)"
[ -n "$PREP" ] || exit 0

TASKS_ARQS="$(find "$RAIZ/docs" -name tasks.md -not -path '*/node_modules/*' 2>/dev/null)"
[ -n "$TASKS_ARQS" ] || exit 0

# Todos os caminhos declarados em qualquer task, em qualquer sprint.
# A comparação é com a UNIÃO: quem cuida de "uma task por commit" é o
# commit-por-task. Aqui a pergunta é outra — este arquivo foi planejado?
DECLARADOS="$(
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    awk '
      function coleta(s,   n, i, partes) {
        sub(/^[^:]*:[[:space:]]*/, "", s)
        gsub(/^\[|\]$/, "", s)
        n = split(s, partes, /,[[:space:]]*/)
        for (i = 1; i <= n; i++) {
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", partes[i])
          gsub(/^["'"'"']|["'"'"']$/, "", partes[i])
          if (partes[i] != "") print partes[i]
        }
      }
      /^[[:space:]]*arquivos:/ { dentro = 1; next }
      /^[[:space:]]*(cria|altera):/ { coleta($0); dentro = 1; next }
      dentro && /^[[:space:]]*-[[:space:]]+[A-Za-z0-9_.\/-]+[[:space:]]*$/ {
        c = $0; sub(/^[[:space:]]*-[[:space:]]+/, "", c); gsub(/[[:space:]]+$/, "", c); print c; next
      }
      /^[[:space:]]*[a-z_]+:/ { if ($0 !~ /^[[:space:]]*(cria|altera|arquivos):/) dentro = 0 }
    ' "$f" 2>/dev/null || true
  done <<< "$TASKS_ARQS" | sort -u
)"
[ -n "$DECLARADOS" ] || exit 0

# Artefatos de MÉTODO não precisam estar no plano das tasks: eles não são
# produto, são o registro do trabalho. Dois grupos, e nada além deles:
#
#   1. o que a própria mergex grava (docs/entregas/, docs/eventos/);
#   2. a pasta do TRABALHO CORRENTE. Nunca `docs/` inteiro: a pasta de outro
#      trabalho continua sendo desvio, porque commitá-la aqui esconderia
#      invasão de escopo.
#
# Qual é o trabalho corrente sai de `expx_trabalho_atual_por_branch`: a branch
# ativa casada com o `branch:` de EXATAMENTE UM `docs/entregas/*/ENTREGA.md`.
# Não usa `expx_trabalho_id` (o ENTREGA.md mais recente, que é o helper do
# rastro): numa árvore que acumula entregas de várias features, recência não
# diz qual trabalho é o de agora, e errar aqui isentaria a pasta errada.
# Sem trabalho determinado — zero matches, ambiguidade ou HEAD destacado —
# não há isenção nenhuma: o hook volta a tratar tudo pelo plano das tasks.
TRABALHO="$(expx_trabalho_atual_por_branch "$RAIZ")" || TRABALHO=""

eh_artefato_de_metodo() {
  case "$1" in
    docs/entregas/*|docs/eventos/*) return 0 ;;
  esac
  [ -n "$TRABALHO" ] || return 1

  # Uma pasta só por trabalho: a canônica vence, e a legada só vale quando a
  # canônica não existe — o mesmo desempate do E0 ao localizar o trabalho.
  if [ -d "$RAIZ/docs/sprintx/features/$TRABALHO" ]; then
    case "$1" in "docs/sprintx/features/$TRABALHO"/*) return 0 ;; esac
    return 1
  fi
  if [ -d "$RAIZ/docs/manutencao/$TRABALHO" ]; then        # runx
    case "$1" in "docs/manutencao/$TRABALHO"/*) return 0 ;; esac
    return 1
  fi
  if [ -d "$RAIZ/docs/$TRABALHO" ]; then                   # sprintx, formato antigo
    case "$1" in "docs/$TRABALHO"/*) return 0 ;; esac
  fi
  return 1
}

# O HISTORICO da sprintx e o unico artefato de metodo GLOBAL: memoria de
# calibragem que atravessa trabalhos, escrita pela sprintx e versionada pela
# mergex. A excecao e EXATA — este caminho literal, e so quando o trabalho
# corrente e da sprintx. Nada mais sob docs/sprintx/estimativas/, nada sob
# docs/sprintx/, e nada equivalente na runx: fora da pasta do trabalho, o resto
# continua podendo ser invasao real de escopo.
HISTORICO_SPRINTX='docs/sprintx/estimativas/HISTORICO.md'

eh_historico_global_sprintx() {
  [ "$1" = "$HISTORICO_SPRINTX" ] || return 1
  [ -n "$TRABALHO" ] || return 1
  [ -d "$RAIZ/docs/sprintx/features/$TRABALHO" ] && return 0
  [ -d "$RAIZ/docs/manutencao/$TRABALHO" ] && return 1   # runx nao ganha a isencao
  [ -d "$RAIZ/docs/$TRABALHO" ] && return 0              # sprintx, formato antigo
  return 1
}

FORA=""
while IFS= read -r arquivo; do
  [ -n "$arquivo" ] || continue
  eh_artefato_de_metodo "$arquivo" && continue
  eh_historico_global_sprintx "$arquivo" && continue
  printf '%s\n' "$DECLARADOS" | grep -Fxq "$arquivo" || FORA="$FORA  - $arquivo
"
done <<< "$PREP"

[ -n "$FORA" ] || expx_permite "$RAIZ" "$HOOK" "todo arquivo preparado esta declarado"

QTD="$(printf '%s' "$FORA" | grep -c . || true)"
ARQ_JSON="$(printf '%s' "$FORA" | sed 's/^  - //' | jq -R . | jq -sc . 2>/dev/null || echo '[]')"

expx_rastro "$RAIZ" "regra_violada" "aviso" "arquivo fora do plano ($QTD)" "$HOOK" "$ARQ_JSON"

MSG="mergex/arquivo-fora-do-plano — arquivo em preparação que nenhuma task declarou

$FORA
Nunca commitar arquivo fora da lista declarada na task (regra 4 da mergex).
A lista sai de 'arquivos.cria' e 'arquivos.altera' das tasks.

Um arquivo pode chegar aqui por três caminhos, e a saída é diferente em cada um:
  - Foi alterado sem estar no plano  → tire do commit (git restore --staged)
    e registre em DIVIDA.md, ou acrescente-o à task se ele é mesmo do trabalho.
  - É de outro processo ou de outra pessoa → tire do commit e deixe na árvore.
  - O plano é que está desatualizado → atualize a task, não o commit.

Não apague o arquivo: quem decide o que fazer com ele é a pessoa. O portão de
prontidão (V9) volta a barrar por isto, com o arquivo nomeado."

if [ "$MODO" = "bloqueio" ]; then
  expx_rastro "$RAIZ" "acao_bloqueada" "bloqueado" "arquivo fora do plano ($QTD)" "$HOOK" "$ARQ_JSON"
  printf '%s\n' "$MSG" >&2
  exit 2
fi
printf '%s\n' "$MSG" >&2
exit 0
