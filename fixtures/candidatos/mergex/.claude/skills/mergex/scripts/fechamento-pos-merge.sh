#!/usr/bin/env bash
# fechamento-pos-merge — abre a área do fechamento da runx, só com o merge da
# entrega provado no serviço (DM-306).
#
# O E5 da runx só roda depois da entrega aceita, e a essa altura a branch já foi
# integrada. O fechamento vai numa branch própria, docs/<OC-ID>-fechamento, a
# partir da base. ENTREGA.md não é tocado: `pr_estado` continua com o E9 ou com
# uma pessoa, e o portão não seleciona o PR de fechamento.
#
#   fechamento-pos-merge.sh --trabalho <pasta em docs/entregas> [--raiz <dir>]
#
# Sem efeito até a última conferência: consulta o serviço, confere que o PR é o
# desta entrega e que o merge está na base, e só então cria a branch, o worktree
# e a marca `branch.<branch>.expxFechamento`, que o hook arquivo-fora-do-plano
# exige. Rodar de novo retoma, se a marca for a mesma.
#
# Saída: worktree=, branch=, merge= e pr=. rc: 0 pronto; 3 entrega sem PR
# registrado; 4 PR não mesclado; 5 serviço indisponível; 6 o PR não é o desta
# entrega; 7 merge fora da base; 8 a branch ou a pasta já existem de outro jeito;
# 64 uso errado. Nunca faz merge e nunca toca o E9.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=catalogo-de-metodo.sh
. "$DIR/catalogo-de-metodo.sh"

para() { printf 'fechamento-pos-merge: %s\n' "$2" >&2; exit "$1"; }

TRABALHO=""; RAIZ_ARG=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --trabalho) [ "$#" -ge 2 ] || para 64 "--trabalho pede um valor"; TRABALHO="$2"; shift 2 ;;
    --raiz) [ "$#" -ge 2 ] || para 64 "--raiz pede um valor"; RAIZ_ARG="$2"; shift 2 ;;
    *) para 64 "opção desconhecida: $1" ;;
  esac
done
[ -n "$TRABALHO" ] || para 64 "uso: fechamento-pos-merge.sh --trabalho <pasta em docs/entregas> [--raiz <dir>]"
[[ "$TRABALHO" =~ ^OC-[0-9]{4}-[0-9]{4}(-[A-Za-z0-9._-]+)?$ ]] \
  || para 64 "o fechamento é da ocorrência da runx: id sem a forma OC-AAAA-NNNN: $TRABALHO"
OC="$(printf '%s' "$TRABALHO" | sed -E 's/^(OC-[0-9]{4}-[0-9]{4}).*/\1/')"

RAIZ="$(git -C "${RAIZ_ARG:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" \
  || para 64 "fora de um repositório Git"
g() { git -C "$RAIZ" "$@"; }

ENTREGA="$RAIZ/docs/entregas/$TRABALHO/ENTREGA.md"
[ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] || para 3 "sem docs/entregas/$TRABALHO/ENTREGA.md"
PR_URL="$(catalogo_fm "$ENTREGA" pr_url)"
BRANCH_ENTREGA="$(catalogo_fm "$ENTREGA" branch)"
BASE="$(catalogo_fm "$ENTREGA" branch_base)"
case "$PR_URL" in ''|null) para 3 "ENTREGA.md sem pr_url: não há PR para provar o merge" ;; esac
case "$BRANCH_ENTREGA:$BASE" in :*|*:|null:*|*:null) para 3 "ENTREGA.md sem branch ou branch_base" ;; esac
[[ "$PR_URL" =~ ^https://([^/]+)/([^/]+/[^/]+)/pull/[0-9]+$ ]] || para 3 "pr_url fora da forma esperada: $PR_URL"
REPO_PR="$(printf '%s/%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"

# O PR tem de ser deste repositório: um pr_url de outro lugar provaria o merge errado.
repo_do_remoto() {
  local u="$1"
  case "$u" in
    *://*) u="${u#*://}"; u="${u#*@}"; u="$(printf '%s' "$u" | sed -E 's#^([^/:]+):[0-9]+/#\1/#')" ;;
    *) u="${u#*@}"; u="${u/:/\/}" ;;
  esac
  printf '%s' "$u" | sed -E 's#\.git/?$##; s#/$##' | tr '[:upper:]' '[:lower:]'
}
REMOTO=""
while IFS= read -r r; do
  [ -n "$r" ] || continue
  [ "$(repo_do_remoto "$(g config --get "remote.$r.url" 2>/dev/null)")" = "$REPO_PR" ] && { REMOTO="$r"; break; }
done <<<"$(g remote 2>/dev/null)"
[ -n "$REMOTO" ] || para 6 "nenhum remoto aponta para $REPO_PR, o repositório do pr_url"

command -v gh >/dev/null 2>&1 || para 5 "sem a ferramenta gh: o merge não foi provado"
command -v jq >/dev/null 2>&1 || para 5 "sem jq: a resposta do serviço não se lê"
RESP="$(gh pr view "$PR_URL" --json url,state,mergeCommit,headRefName,baseRefName 2>/dev/null)" \
  || para 5 "o serviço não respondeu sobre $PR_URL"
campo() { printf '%s' "$RESP" | jq -r "$1 // empty" 2>/dev/null; }
ESTADO="$(campo .state)"
[ -n "$ESTADO" ] || para 5 "resposta ilegível do serviço sobre $PR_URL"
[ "$(campo .url)" = "$PR_URL" ] || para 6 "o serviço devolveu outro PR: $(campo .url)"
[ "$(campo .headRefName)" = "$BRANCH_ENTREGA" ] || para 6 "o PR é da branch $(campo .headRefName), e a entrega é de $BRANCH_ENTREGA"
# `branch_base` é a base efetiva do E0: nome, ref do remoto ou SHA. O PR só diz o nome.
BASE_PR="$(campo .baseRefName)"
BASE_SHA=""
if [[ "$BASE" =~ ^[0-9a-f]{40}$ ]]; then
  BASE_SHA="$BASE"
else
  # Ref completa não tem dúvida; sem ela, `origin/main` pode ser a branch `main` do
  # remoto ou uma branch com esse nome literal.
  case "$BASE" in
    refs/heads/*) BASE_NOME="${BASE#refs/heads/}"; BASE_LITERAL="$BASE_NOME" ;;
    refs/remotes/"$REMOTO"/*) BASE_NOME="${BASE#refs/remotes/"$REMOTO"/}"; BASE_LITERAL="$BASE_NOME" ;;
    *) BASE_NOME="${BASE#"$REMOTO"/}"; BASE_LITERAL="$BASE" ;;
  esac
  [ "$BASE_PR" = "$BASE_NOME" ] || [ "$BASE_PR" = "$BASE_LITERAL" ] \
    || para 6 "o PR mira $BASE_PR, e a base da entrega é $BASE"
fi
[ "$ESTADO" = MERGED ] || para 4 "o PR está $ESTADO: a ocorrência só fecha depois do merge. $PR_URL"
MERGE="$(campo .mergeCommit.oid)"
[[ "$MERGE" =~ ^[0-9a-f]{40}$ ]] || para 5 "o serviço não informou o commit de merge de $PR_URL"

REF_BASE="refs/remotes/$REMOTO/$BASE_PR"
# A refspec explícita: em clone de uma branch só, o fetch atualizaria só o FETCH_HEAD.
g fetch -q --no-tags "$REMOTO" "+refs/heads/$BASE_PR:$REF_BASE" 2>/dev/null || para 5 "git fetch $REMOTO $BASE_PR falhou"
[ "$(g rev-parse --is-shallow-repository 2>/dev/null)" != true ] \
  || para 5 "clone raso: o merge não se confere aqui (git fetch --unshallow $REMOTO)"
g merge-base --is-ancestor "$MERGE" "$REF_BASE" 2>/dev/null \
  || para 7 "o merge $MERGE não está em $REMOTO/$BASE_PR"
[ -z "$BASE_SHA" ] || g merge-base --is-ancestor "$BASE_SHA" "$REF_BASE" 2>/dev/null \
  || para 6 "a base da entrega, $BASE_SHA, não está em $REMOTO/$BASE_PR"

BRANCH="docs/$OC-fechamento"
PRINCIPAL="$(g worktree list --porcelain | sed -n '1s/^worktree //p')"
DESTINO="$PRINCIPAL/../${PRINCIPAL##*/}--$OC-fechamento"

if g show-ref --verify -q "refs/heads/$BRANCH"; then
  [ "$(g config --get "branch.$BRANCH.expxFechamento")" = "$MERGE" ] \
    || para 8 "a branch $BRANCH já existe sem a marca deste merge: confira antes de seguir"
  g merge-base --is-ancestor "$MERGE" "refs/heads/$BRANCH" 2>/dev/null \
    || para 8 "a branch $BRANCH não contém o merge $MERGE: confira antes de seguir"
  LOCAL="$(g worktree list --porcelain | awk -v b="branch refs/heads/$BRANCH" 'BEGIN { RS = ""; FS = "\n" }
    { w = ""; casa = 0; morto = 0
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^worktree /) w = substr($i, 10)
        if ($i == b) casa = 1
        if ($i ~ /^prunable/) morto = 1
      }
      if (casa && !morto) print w }')"
  [ -n "$LOCAL" ] && [ -d "$LOCAL" ] \
    || para 8 "a branch $BRANCH já existe sem worktree utilizável: confira antes de seguir"
  DESTINO="$LOCAL"
else
  [ ! -e "$DESTINO" ] || para 8 "a pasta $DESTINO já existe: confira antes de seguir"
  # A marca antes do worktree: sem ela, a branch criada não se retomaria.
  g config --local "branch.$BRANCH.expxFechamento" "$MERGE" \
    || para 8 "a marca de $BRANCH não foi gravada"
  if ! g worktree add -q -b "$BRANCH" --no-track "$DESTINO" "$REF_BASE" 2>/dev/null; then
    # A marca fica: se outro E5 venceu nesse intervalo, ela é dele; sem branch, não isenta nada.
    para 8 "o worktree $DESTINO não foi criado"
  fi
  g config --local "branch.$BRANCH.expxFechamento" "$MERGE" \
    || para 8 "a marca de $BRANCH não foi gravada"
  DESTINO="$(cd "$DESTINO" && pwd -P)"
fi

printf 'worktree=%s\nbranch=%s\nmerge=%s\npr=%s\n' "$DESTINO" "$BRANCH" "$MERGE" "$PR_URL"
