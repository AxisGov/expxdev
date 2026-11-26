#!/usr/bin/env bash
# fechamento-pos-merge — abre a área do fechamento da runx, só com o merge da
# entrega provado no serviço (DM-306), e registra o merge de uma entrega que
# não é da runx (DM-351).
#
# O E5 da runx só roda depois da entrega aceita, e a essa altura a branch já foi
# integrada. O fechamento vai numa branch própria, docs/<OC-ID>-fechamento, a
# partir da base. ENTREGA.md não é tocado: `pr_estado` fica com o retrato do E7
# (a entrega da runx é por trabalho, DM-317), e o portão não seleciona o PR de
# fechamento.
#
#   fechamento-pos-merge.sh --trabalho <pasta em docs/entregas> [--raiz <dir>]
#
# Trabalho que não é ocorrência (DM-351): a mesma prova abre
# docs/<trabalho>-registro-pos-merge, com a marca `branch.<branch>.expxRegistroPosMerge`,
# e grava nela um commit só, com docs/entregas/<trabalho>/POS-MERGE.md
# (kind: registro_pos_merge) e os trailers `Registro-pos-merge-de: <pr_url>` e
# `Merge: <sha>`. ENTREGA.md continua o retrato do E7; o portão só seleciona
# ENTREGA.md, e o PR do registro passa como ref_nao_aplicavel. Push e PR ficam
# com quem roda. A saída ganha commit=.
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
if [[ "$TRABALHO" =~ ^OC-[0-9]{4}-[0-9]{4}(-[A-Za-z0-9._-]+)?$ ]]; then
  MODO=fechamento
  OC="$(printf '%s' "$TRABALHO" | sed -E 's/^(OC-[0-9]{4}-[0-9]{4}).*/\1/')"
else
  # Prefixo de ocorrência sem a forma dela é erro de digitação, não outro trabalho.
  case "$TRABALHO" in OC-*) para 64 "id de ocorrência sem a forma OC-AAAA-NNNN: $TRABALHO" ;; esac
  # A gramática de id da validade-do-portao: um nível, sem nome reservado.
  case "$TRABALHO" in
    *[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto)
      para 64 "id de trabalho inválido: $TRABALHO" ;;
  esac
  MODO=registro
fi

RAIZ="$(git -C "${RAIZ_ARG:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" \
  || para 64 "fora de um repositório Git"
g() { git -C "$RAIZ" "$@"; }

ENTREGA="$RAIZ/docs/entregas/$TRABALHO/ENTREGA.md"
[ ! -L "$RAIZ/docs/entregas/$TRABALHO" ] || para 3 "docs/entregas/$TRABALHO é link"
[ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] || para 3 "sem docs/entregas/$TRABALHO/ENTREGA.md"
PR_URL="$(catalogo_fm "$ENTREGA" pr_url)"
BRANCH_ENTREGA="$(catalogo_fm "$ENTREGA" branch)"
BASE="$(catalogo_fm "$ENTREGA" branch_base)"
case "$PR_URL" in ''|null) para 3 "ENTREGA.md sem pr_url: não há PR para provar o merge" ;; esac
case "$BRANCH_ENTREGA:$BASE" in :*|*:|null:*|*:null) para 3 "ENTREGA.md sem branch ou branch_base" ;; esac
[[ "$PR_URL" =~ ^https://([^/]+)/([^/]+/[^/]+)/pull/[0-9]+$ ]] || para 3 "pr_url fora da forma esperada: $PR_URL"
REPO_PR="$(printf '%s/%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" | tr '[:upper:]' '[:lower:]')"
if [ "$MODO" = registro ]; then
  # Esses valores vão para o frontmatter do registro: só o alfabeto que o YAML lê sem aspas.
  [[ "$PR_URL" =~ ^https://[A-Za-z0-9.-]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/pull/[0-9]+$ ]] \
    || para 3 "pr_url com caractere fora do registro: $PR_URL"
  [[ "$BRANCH_ENTREGA" =~ ^[A-Za-z0-9._/-]+$ ]] || para 3 "branch com caractere fora do registro: $BRANCH_ENTREGA"
  # Por sprint, o merge de cada PR já se registra no E9 (e9-merge): o registro é de entrega por trabalho.
  [ "$(catalogo_fm "$ENTREGA" entrega)" != por_sprint ] \
    || para 3 "entrega por_sprint: o merge de cada sprint se registra no E9 (--checkpoint e9-merge), não aqui"
fi

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
# SHA local no tamanho do formato do repositório (DM-315)
case "$(g rev-parse --show-object-format 2>/dev/null)" in
  sha1) OID_LEN=40 ;; sha256) OID_LEN=64 ;;
  *) para 5 "formato de objetos Git ilegível ou não suportado" ;;
esac
if [[ "$BASE" =~ ^[0-9a-f]{$OID_LEN}$ ]]; then
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
[ "$ESTADO" = MERGED ] || para 4 "o PR está $ESTADO: a entrega só fecha depois do merge. $PR_URL"
MERGE="$(campo .mergeCommit.oid)"
# O serviço é o GitHub, que só hospeda SHA-1: o merge dele tem 40 hex. Num
# repositório SHA-256 o merge do serviço não se prova aqui (DM-315).
[[ "$MERGE" =~ ^[0-9a-f]{40}$ ]] \
  || para 5 "o serviço não informou o commit de merge de $PR_URL em SHA-1 de 40 hex${MERGE:+ (informou $MERGE)}"
[ "$OID_LEN" = 40 ] \
  || para 5 "repositório SHA-256: o merge que o serviço informa é SHA-1 e não se prova aqui; o fechamento depois do merge não está disponível neste formato"

REF_BASE="refs/remotes/$REMOTO/$BASE_PR"
# A refspec explícita: em clone de uma branch só, o fetch atualizaria só o FETCH_HEAD.
g fetch -q --no-tags "$REMOTO" "+refs/heads/$BASE_PR:$REF_BASE" 2>/dev/null || para 5 "git fetch $REMOTO $BASE_PR falhou"
[ "$(g rev-parse --is-shallow-repository 2>/dev/null)" != true ] \
  || para 5 "clone raso: o merge não se confere aqui (git fetch --unshallow $REMOTO)"
g merge-base --is-ancestor "$MERGE" "$REF_BASE" 2>/dev/null \
  || para 7 "o merge $MERGE não está em $REMOTO/$BASE_PR"
[ -z "$BASE_SHA" ] || g merge-base --is-ancestor "$BASE_SHA" "$REF_BASE" 2>/dev/null \
  || para 6 "a base da entrega, $BASE_SHA, não está em $REMOTO/$BASE_PR"

if [ "$MODO" = fechamento ]; then SUFIXO="$OC-fechamento"; CHAVE=expxFechamento
else SUFIXO="$TRABALHO-registro-pos-merge"; CHAVE=expxRegistroPosMerge; fi
BRANCH="docs/$SUFIXO"
g check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || para 64 "o id não dá nome de branch: $BRANCH"
REL="docs/entregas/$TRABALHO/POS-MERGE.md"
if [ "$MODO" = registro ]; then
  # Antes de qualquer efeito: o que só a base diz.
  [[ "$BASE_PR" =~ ^[A-Za-z0-9._/-]+$ ]] || para 3 "base do PR com caractere fora do registro: $BASE_PR"
  g cat-file -e "$REF_BASE:docs/entregas/$TRABALHO/ENTREGA.md" 2>/dev/null \
    || para 7 "a base não traz docs/entregas/$TRABALHO/ENTREGA.md: o merge não é desta entrega"
  # O pr_url, a branch e a base saíram do ENTREGA.md local: ele tem de ser o da base, ou um
  # arquivo editado atribuiria a esta entrega o merge de outro PR.
  [ "$(g hash-object -- "$ENTREGA" 2>/dev/null)" = "$(g rev-parse -q --verify "$REF_BASE:docs/entregas/$TRABALHO/ENTREGA.md" 2>/dev/null)" ] \
    || para 6 "o docs/entregas/$TRABALHO/ENTREGA.md local difere do da base $REMOTO/$BASE_PR: atualize a árvore antes de registrar"
  ! g cat-file -e "$REF_BASE:$REL" 2>/dev/null \
    || para 8 "a base já traz $REL: o merge desta entrega já está registrado"
fi
PRINCIPAL="$(g worktree list --porcelain | sed -n '1s/^worktree //p')"
DESTINO="$PRINCIPAL/../${PRINCIPAL##*/}--$SUFIXO"

if g show-ref --verify -q "refs/heads/$BRANCH"; then
  [ "$(g config --get "branch.$BRANCH.$CHAVE")" = "$MERGE" ] \
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
  g config --local "branch.$BRANCH.$CHAVE" "$MERGE" \
    || para 8 "a marca de $BRANCH não foi gravada"
  if ! g worktree add -q -b "$BRANCH" --no-track "$DESTINO" "$REF_BASE" 2>/dev/null; then
    # A marca fica: se outro E5 venceu nesse intervalo, ela é dele; sem branch, não isenta nada.
    para 8 "o worktree $DESTINO não foi criado"
  fi
  g config --local "branch.$BRANCH.$CHAVE" "$MERGE" \
    || para 8 "a marca de $BRANCH não foi gravada"
  DESTINO="$(cd "$DESTINO" && pwd -P)"
fi

[ "$MODO" = registro ] || {
  printf 'worktree=%s\nbranch=%s\nmerge=%s\npr=%s\n' "$DESTINO" "$BRANCH" "$MERGE" "$PR_URL"
  exit 0
}

# O registro: um commit só, com POS-MERGE.md, sobre a base que contém a entrega.
w() { git -C "$DESTINO" "$@"; }
trailer() { w log -1 --format="%(trailers:key=$1,valueonly,unfold)" "$2" 2>/dev/null | sed '/^$/d'; }
w cat-file -e "HEAD:docs/entregas/$TRABALHO/ENTREGA.md" 2>/dev/null \
  || para 7 "a branch $BRANCH não traz docs/entregas/$TRABALHO/ENTREGA.md: confira antes de seguir"
if w cat-file -e "HEAD:$REL" 2>/dev/null; then
  # Retomada: o HEAD é o commit do registro, deste merge, sobre a base, só com ele.
  COMMIT="$(w rev-parse HEAD)"
  { [ "$(trailer Merge "$COMMIT")" = "$MERGE" ] && [ "$(trailer Registro-pos-merge-de "$COMMIT")" = "$PR_URL" ] \
      && [ "$(w rev-list --parents -n 1 "$COMMIT" 2>/dev/null | wc -w | tr -d ' ')" = 2 ] \
      && g merge-base --is-ancestor "$COMMIT^" "$REF_BASE" 2>/dev/null \
      && [ "$(w diff-tree --no-commit-id -r --name-only "$COMMIT")" = "$REL" ] \
      && [ -z "$(w status --porcelain 2>/dev/null)" ]; } \
    || para 8 "a branch $BRANCH tem $REL de outro jeito, ou andou depois dele: confira antes de seguir"
else
  # Sem o registro, a branch ainda é a base (ou uma base anterior, numa retomada).
  g merge-base --is-ancestor "$(w rev-parse HEAD)" "$REF_BASE" 2>/dev/null \
    || para 8 "a branch $BRANCH andou sem o registro: confira antes de seguir"
  [ -z "$(w status --porcelain 2>/dev/null)" ] || para 8 "o worktree $DESTINO tem alterações: confira antes de seguir"
  ARQ="$DESTINO/$REL"
  [ ! -L "$DESTINO/docs/entregas/$TRABALHO" ] && [ ! -e "$ARQ" ] && [ ! -L "$ARQ" ] \
    || para 8 "$REL ou a pasta dele já existem de outro jeito: confira antes de seguir"
  # Falha no meio não deixa o arquivo para trás: a próxima execução recomeça do zero.
  desfaz() { w reset -q -- ":(literal)$REL" 2>/dev/null; rm -f "$ARQ"; para 8 "$1"; }
  QUANDO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    printf -- '---\nexpx_schema: 1\nexpx_tool: mergex\nkind: registro_pos_merge\n'
    printf 'trabalho_id: %s\npr_url: %s\npr_estado: merged\nmerge: %s\nbranch: %s\nbranch_base: %s\nregistrado_em: %s\n---\n\n' \
      "$TRABALHO" "$PR_URL" "$MERGE" "$BRANCH_ENTREGA" "$BASE_PR" "$QUANDO"
    printf '# Registro do merge de %s\n\n' "$TRABALHO"
    printf 'O PR %s foi mesclado em `%s` pelo commit `%s`. O serviço e a base foram conferidos por `fechamento-pos-merge.sh` em %s.\n\n' \
      "$PR_URL" "$BASE_PR" "$MERGE" "$QUANDO"
    printf 'O `ENTREGA.md` ao lado continua com o retrato do E7 (DM-317). O estado final da entrega é este registro (DM-351).\n'
  } > "$ARQ" || desfaz "$REL não foi gravado"
  w add -f -- ":(literal)$REL" || desfaz "$REL não entrou no índice"
  printf 'docs: registra o merge da entrega %s\n\nRegistro-pos-merge-de: %s\nMerge: %s\n' "$TRABALHO" "$PR_URL" "$MERGE" \
    | w commit -q -F - -- ":(literal)$REL" >/dev/null \
    || desfaz "o commit do registro falhou (confira user.name e user.email)"
  COMMIT="$(w rev-parse HEAD)"
fi
printf 'worktree=%s\nbranch=%s\nmerge=%s\npr=%s\ncommit=%s\n' "$DESTINO" "$BRANCH" "$MERGE" "$PR_URL" "$COMMIT"
