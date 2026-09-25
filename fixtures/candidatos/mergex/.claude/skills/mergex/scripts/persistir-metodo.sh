#!/usr/bin/env bash
# persistir-metodo — catálogo e lifecycle versionado dos artefatos de método.
#
# O trabalho corrente vem exclusivamente dos argumentos explícitos, conferidos
# contra ENTREGA.md. A branch ativa é somente uma prova de consistência.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_SH="$AQUI/../../../hooks/comum/base.sh"
TRAVA_SH="$AQUI/trava-do-e1.sh"
CONTRATO_SH="$AQUI/contrato-de-commit.sh"
SEGREDO_SH="$AQUI/../../../hooks/comum/sem-segredo.sh"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"

for dependencia in "$BASE_SH" "$TRAVA_SH" "$CONTRATO_SH" "$SEGREDO_SH" "$CATALOGO_SH"; do
  [ -r "$dependencia" ] || { printf 'persistir-metodo: dependência indisponível: %s\n' "$dependencia" >&2; exit 1; }
done
# shellcheck source=../../../hooks/comum/base.sh
. "$BASE_SH"
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
set +e

MODO=""
ENTREGA=""
ORIGEM=""
TRABALHO=""
CHECKPOINT=""

uso() {
  printf '%s\n' \
    'uso: persistir-metodo.sh --listar|--persistir|--verificar --entrega <ENTREGA.md> --origem <sprintx|runx> --trabalho <id> --checkpoint <pre-e2|pre-e6|e8>' >&2
  exit 64
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --listar) [ -z "$MODO" ] || uso; MODO=listar; shift ;;
    --persistir) [ -z "$MODO" ] || uso; MODO=persistir; shift ;;
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    --checkpoint) [ "$#" -ge 2 ] || uso; CHECKPOINT="$2"; shift 2 ;;
    *) uso ;;
  esac
done

case "$MODO" in listar|persistir|verificar) ;; *) uso ;; esac
case "$ORIGEM" in sprintx|runx) ;; *) uso ;; esac
case "$CHECKPOINT" in pre-e2|pre-e6|e8) ;; *) uso ;; esac
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto) uso ;;
esac

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf 'persistir-metodo: fora de um repositório Git\n' >&2
  exit 1
}

fm() { expx_frontmatter_valor "$1" "$2"; }

para() {
  printf 'persistir-metodo: %s\n' "$1" >&2
  exit 1
}

TOKEN=""
LIBERAR_NA_SAIDA=0
TMP_LISTA=""
TMP_MSG=""
TMP_CATALOGO=""

encerrar() {
  local rc="$1"
  [ -z "$TMP_LISTA" ] || rm -f "$TMP_LISTA"
  [ -z "$TMP_MSG" ] || rm -f "$TMP_MSG"
  [ -z "$TMP_CATALOGO" ] || rm -f "$TMP_CATALOGO"
  if [ "$LIBERAR_NA_SAIDA" = 1 ] && [ -n "$TOKEN" ]; then
    liberar "$TOKEN" >/dev/null 2>&1
  fi
  exit "$rc"
}
trap 'encerrar $?' EXIT

if [ "$MODO" = persistir ]; then
  SAIDA_TRAVA="$(adquirir "metodo:$CHECKPOINT")"; RC_TRAVA=$?
  if [ "$RC_TRAVA" = 2 ]; then
    printf 'persistir-metodo: índice ocupado pela trava C5\n' >&2
    exit 2
  fi
  [ "$RC_TRAVA" = 0 ] || para 'não foi possível adquirir a trava C5 do índice'
  TOKEN="$(printf '%s\n' "$SAIDA_TRAVA" | awk -F= '$1 == "token" { print $2 }')"
  [ -n "$TOKEN" ] || para 'a trava C5 foi criada sem token'
  LIBERAR_NA_SAIDA=1
fi

if [ "$MODO" = persistir ] || [ "$MODO" = verificar ]; then
  if [ -n "$(git diff --cached --name-only 2>/dev/null)" ]; then
    para 'o stage já estava preenchido; nada foi limpo ou adotado'
  fi
fi

# O caminho da entrega também é evidência explícita: ele não é procurado por
# branch, mtime ou glob. Aceita apenas a forma canônica relativa ao repositório.
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
ENTREGA_ESPERADA="docs/entregas/$TRABALHO/ENTREGA.md"
[ "$ENTREGA" = "$ENTREGA_ESPERADA" ] || para "--entrega deve ser $ENTREGA_ESPERADA"
[ -f "$RAIZ/$ENTREGA" ] && [ ! -L "$RAIZ/$ENTREGA" ] || para "$ENTREGA não é arquivo regular"
[ "$(fm "$RAIZ/$ENTREGA" kind)" = entrega ] || para "$ENTREGA não declara kind: entrega"
[ "$(fm "$RAIZ/$ENTREGA" trabalho_id)" = "$TRABALHO" ] || para "trabalho explícito diverge de ENTREGA.trabalho_id"
[ "$(fm "$RAIZ/$ENTREGA" expx_tool)" = "$ORIGEM" ] || para "origem explícita diverge de ENTREGA.expx_tool"

BRANCH="$(git branch --show-current 2>/dev/null)" || BRANCH=""
[ -n "$BRANCH" ] || para 'HEAD destacado: branch não pode provar consistência'
[ "$(fm "$RAIZ/$ENTREGA" branch)" = "$BRANCH" ] || para "branch ativa diverge de ENTREGA.branch"

if [ "$ORIGEM" = sprintx ]; then
  CANONICA="docs/sprintx/features/$TRABALHO"
  LEGADA="docs/$TRABALHO"
  if [ -d "$RAIZ/$CANONICA" ] && [ -d "$RAIZ/$LEGADA" ]; then
    para "há duas pastas SprintX para $TRABALHO"
  elif [ -d "$RAIZ/$CANONICA" ]; then
    PASTA="$CANONICA"
  elif [ -d "$RAIZ/$LEGADA" ]; then
    PASTA="$LEGADA"
  else
    para "pasta SprintX do trabalho não existe"
  fi
else
  PASTA="docs/manutencao/$TRABALHO"
  [ -d "$RAIZ/$PASTA" ] || para "pasta RunX do trabalho não existe"
fi

ORQUESTRADOR="$RAIZ/$PASTA/ORQUESTRADOR.md"
[ -f "$ORQUESTRADOR" ] && [ ! -L "$ORQUESTRADOR" ] || para "$PASTA/ORQUESTRADOR.md não é arquivo regular"
[ "$(fm "$ORQUESTRADOR" kind)" = orquestrador ] || para "$PASTA/ORQUESTRADOR.md não declara kind: orquestrador"
[ "$(fm "$ORQUESTRADOR" trabalho_id)" = "$TRABALHO" ] || para "ORQUESTRADOR.md pertence a outro trabalho"

TMP_LISTA="$(mktemp "${TMPDIR:-/tmp}/mergex-metodo.XXXXXX")" || para 'não foi possível criar lista temporária'

sujo() {
  [ -n "$(git -C "$RAIZ" status --porcelain=v1 --untracked-files=all -- "$1" 2>/dev/null)" ]
}

adiciona() {
  local caminho="$1"
  [ -f "$RAIZ/$caminho" ] && [ ! -L "$RAIZ/$caminho" ] || return 0
  sujo "$caminho" || return 0
  printf '%s\n' "$caminho" >> "$TMP_LISTA"
}

confere_historico_corrente() {
  local caminho='docs/sprintx/estimativas/HISTORICO.md' diff linha valor
  sujo "$caminho" || return 0
  git -C "$RAIZ" ls-files --error-unmatch -- "$caminho" >/dev/null 2>&1 \
    || para 'HISTORICO global untracked não tem base para provar ownership'
  diff="$(git -C "$RAIZ" diff HEAD --no-color --no-ext-diff -U0 -- "$caminho" 2>/dev/null)" \
    || para 'não foi possível provar o diff do HISTORICO global'
  while IFS= read -r linha; do
    case "$linha" in
      ''|'diff '*|'index '*|'--- '*|'+++ '*|'@@ '*|'\ No newline'|+|-)
        continue ;;
      -atualizado_em:*|+atualizado_em:*) continue ;;
      -*) para 'HISTORICO global remove ou reescreve evidência existente' ;;
      '+ '*|'+	'*)
        case "$linha" in
          *trabalho_id:*)
            valor="${linha#*trabalho_id:}"
            valor="$(printf '%s' "$valor" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
            [ "$valor" = "$TRABALHO" ] || para "HISTORICO global contém entrada de outro trabalho: $valor"
            ;;
        esac
        ;;
      '+|'*)
        valor="$(printf '%s' "${linha#+|}" | awk -F'|' '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1 }')"
        [ "$valor" = "$TRABALHO" ] || para "HISTORICO global contém linha de outro trabalho: $valor"
        ;;
      +*) para 'HISTORICO global contém acréscimo não atribuível ao trabalho corrente' ;;
    esac
  done <<EOF
$diff
EOF
}

# Os caminhos vêm do catálogo compartilhado (catalogo-de-metodo.sh), o mesmo
# que o E1 usa para separar método de produto. Aqui cada um só entra se
# existe, é arquivo regular e está dirty.
TMP_CATALOGO="$(mktemp "${TMPDIR:-/tmp}/mergex-catalogo.XXXXXX")" || para 'não foi possível criar catálogo temporário'
catalogo_metodo "$RAIZ" "$ORIGEM" "$TRABALHO" "$PASTA" "$CHECKPOINT" > "$TMP_CATALOGO" || para "$CATALOGO_ERRO"
[ "$ORIGEM" = sprintx ] && confere_historico_corrente
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  adiciona "$caminho"
done < "$TMP_CATALOGO"

LC_ALL=C sort -u -o "$TMP_LISTA" "$TMP_LISTA"

if [ "$MODO" = listar ]; then
  cat "$TMP_LISTA"
  exit 0
fi

if [ "$MODO" = verificar ]; then
  if [ -s "$TMP_LISTA" ]; then
    printf 'persistir-metodo: checkpoint %s pendente; artefatos de método dirty:\n' "$CHECKPOINT" >&2
    sed 's/^/  - /' "$TMP_LISTA" >&2
    exit 1
  fi
  printf 'ok=true\n'
  exit 0
fi

if [ ! -s "$TMP_LISTA" ]; then
  printf 'noop=true\n'
  exit 0
fi

# O stage nasce vazio sob a trava. Cada path vem do catálogo fechado acima;
# nenhum diretório, glob ou `git add -A` participa desta operação.
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  git add -- "$caminho" || para "falha ao preparar $caminho; stage preservado"
done < "$TMP_LISTA"

STAGED="$(git diff --cached --name-only 2>/dev/null | LC_ALL=C sort -u)"
ESPERADO="$(cat "$TMP_LISTA")"
[ -n "$STAGED" ] || para 'nenhuma mudança elegível entrou no stage'
[ "$STAGED" = "$ESPERADO" ] || para 'o staged diff diverge do catálogo exato; stage preservado'

# Reutiliza literalmente o gate de segurança dos hooks sobre o staged diff.
# Falha de jq ou do hook também é fechada: método não ganha atalho de segredo.
command -v jq >/dev/null 2>&1 || para 'jq indisponível para o gate de segredo'
ENTRADA_SEGREDO="$(jq -cn --arg w "$RAIZ" \
  '{tool_name:"Bash",cwd:$w,tool_input:{command:"git commit"}}' 2>/dev/null)"
[ -n "$ENTRADA_SEGREDO" ] || para 'não foi possível preparar o gate de segredo'
printf '%s' "$ENTRADA_SEGREDO" | bash "$SEGREDO_SH" \
  || para 'gate de segredo reprovou; nenhum commit foi criado e o stage foi preservado'

TMP_MSG="$(mktemp "${TMPDIR:-/tmp}/mergex-metodo-msg.XXXXXX")" || para 'não foi possível criar a mensagem do commit'
{
  printf 'chore(mergex): persiste metodo %s\n\n' "$CHECKPOINT"
  printf 'Trabalho: %s\n' "$TRABALHO"
  printf 'Metodo: %s\n' "$CHECKPOINT"
} > "$TMP_MSG" || para 'não foi possível escrever a mensagem do commit'

bash "$CONTRATO_SH" --validar-metodo --trabalho "$TRABALHO" \
  --checkpoint "$CHECKPOINT" --arquivo "$TMP_MSG" >/dev/null 2>&1 \
  || para 'mensagem de método não satisfaz o contrato'

git commit -F "$TMP_MSG" >/dev/null \
  || para 'git commit falhou; nenhum estado foi limpo automaticamente'

bash "$CONTRATO_SH" --validar-metodo --trabalho "$TRABALHO" \
  --checkpoint "$CHECKPOINT" --commit HEAD >/dev/null 2>&1 \
  || para 'commit criado não satisfaz o contrato de método'

SHA="$(git rev-parse HEAD 2>/dev/null)"
printf '%s\n' "$SHA" | grep -Eq '^[0-9a-f]{40}$' || para 'commit criado sem SHA completo legível'
printf 'commit=%s\n' "$SHA"
