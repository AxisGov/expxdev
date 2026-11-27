#!/usr/bin/env bash
# portao-v2 — a V2 do portão de prontidão (E2): toda task `concluida` tem
# registro de suíte que a sustente? E a lista versionada de falhas de ambiente.
#
# Contrato: references/02-prontidao.md, "V2 — Task concluída sem registro de
# suíte que a sustente"; decisão DM-357.
#
# A regra, por task `concluida`:
#
#   suite: parcial | verde   -> OK
#   suite: nao_executada     -> FALHA
#   suite: vermelha          -> AVISO só quando as QUATRO condições valem:
#                                 1. `suite_falhas` existe e não é vazia;
#                                 2. TODO caminho dela está em
#                                    `.expx/falhas-de-ambiente.tsv` para a
#                                    plataforma atual, com motivo;
#                                 3. NENHUM desses caminhos aparece em
#                                    `git diff --name-only <base>...HEAD`
#                                    (e no índice, com --staged);
#                               senão FALHA.
#   suite ausente ou outro valor -> FALHA
#
# A lista é a do projeto, versionada: `.expx/falhas-de-ambiente.tsv` na raiz,
# linhas `caminho<TAB>plataforma<TAB>motivo<TAB>desde`. `#` no começo comenta,
# linha em branco é ignorada, motivo vazio invalida a linha, CR de fim de linha
# some, e o caminho casa EXATO (sem normalizar `./` nem barra invertida).
# Timeout por máquina carregada NÃO entra na lista: a reexecução isolada verde
# é registrada como `parcial`.
#
# Plataforma: EXPX_PLATAFORMA, senão `uname -s` (MINGW*/MSYS*/CYGWIN* -> win32,
# Linux -> linux, Darwin -> darwin; outro -> desconhecida).
#
# Um teste da lista tocado pelo diff do trabalho deixa de ser falha de
# ambiente: quem o alterou pode tê-lo quebrado, e a lista não absolve isso.
#
# Uso:
#   portao-v2.sh --verificar --base <rev> [--raiz <dir>] [--staged] [--task <id>] <tasks.md>...
#   portao-v2.sh --conferir-falhas --base <rev> [--raiz <dir>] [--staged] [--] <caminho>...
#   portao-v2.sh --plataforma
#
#   --raiz    onde ficam o repositório e `.expx/` (padrão: a raiz do Git do cwd)
#   --staged  soma ao diff o que está no índice (`git diff --cached`); é o que
#             o hook commit-por-task usa antes do commit existir
#   --task    avalia só essa task, qualquer que seja o status (o hook); ausente
#             em todos os tasks.md é SEM_PROVA
#
# `--conferir-falhas` aplica a mesma regra a uma lista solta: o `suite_falhas`
# do registro do fechamento da sprint. Lista vazia é FALHA.
#
# Saída, primeira linha sempre:
#   V2=OK         (código 0)
#   V2=AVISO      (código 0) — vermelha só de ambiente; não entra em falhas_portao
#   V2=FALHA      (código 1)
#   V2=SEM_PROVA  (código 2) — não foi possível verificar (registrar v2_sem_prova)
# depois uma linha por task fora de OK:
#   <resultado><TAB><id><TAB><tasks.md><TAB><motivo>
# (`-` no id e no tasks.md quando não se aplicam). FALHA vence SEM_PROVA, que
# vence AVISO. Opção inválida: 64.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}. Nada de
# `| grep -q` nem `| head` (lint-consumidor-precoce): here-string e awk.

set -uo pipefail

# O leitor do frontmatter é o compartilhado (`bloco`, `confere_bloco`,
# `legivel`), o mesmo da V11 (prova-de-commit.sh): um parser só.
# shellcheck source=sequencia-de-commits.sh
. "$(dirname "${BASH_SOURCE[0]}")/sequencia-de-commits.sh"

US=$'\037'   # separador de campo: não é espaço de IFS, campo vazio sobrevive
RS=$'\036'   # separador dos caminhos de suite_falhas: caminho com espaço sobrevive

uso() {
  printf '%s\n' 'uso: portao-v2.sh --verificar --base <rev> [--raiz <dir>] [--staged] [--task <id>] <tasks.md>...' \
    '     portao-v2.sh --conferir-falhas --base <rev> [--raiz <dir>] [--staged] [--] <caminho>...' \
    '     portao-v2.sh --plataforma' >&2
  exit 64
}

plataforma() {
  if [ -n "${EXPX_PLATAFORMA:-}" ]; then printf '%s\n' "$EXPX_PLATAFORMA"; return 0; fi
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) printf 'win32\n' ;;
    Linux)                printf 'linux\n' ;;
    Darwin)               printf 'darwin\n' ;;
    *)                    printf 'desconhecida\n' ;;
  esac
}

# ---------------------------------------------------------------------------
# tasks_de <tasks.md> — uma linha por task da chave `tasks`:
#   id US status US suite US marca US caminhos(separados por RS)
# marca: `ausente` (sem suite_falhas), `lista` (fluxo `[a, b]` ou bloco `- a`)
# ou `invalida` (escalar, ou fluxo com aspas desbalanceadas). No fluxo, item
# entre aspas guarda a vírgula (DM-358).
# ---------------------------------------------------------------------------
tasks_de() {
  local b
  legivel "$1" || { printf 'portao-v2: %s\n' "$ERRO" >&2; return 1; }
  b="$(bloco "$1" tasks)"
  confere_bloco "$b" || { printf 'portao-v2: %s: %s\n' "$ERRO" "$1" >&2; return 1; }
  printf '%s\n' "$b" | awk '
    function limpo(v) {
      sub(/[[:space:]]+#.*$/, "", v)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      if (length(v) >= 2 && (v ~ /^".*"$/ || v ~ /^\047.*\047$/)) v = substr(v, 2, length(v) - 2)
      return v
    }
    function recuo(s) { match(s, /^ */); return RLENGTH }
    function junta(v) { v = limpo(v); if (v == "") return; itens = (itens == "" ? v : itens "\036" v) }
    function despeja() { if (id != "") printf "%s\037%s\037%s\037%s\037%s\n", id, st, su, marca, itens }
    # fluxo(s) — o miolo de `[a, "b,c"]` (DM-358). A vírgula separa, menos
    # dentro de item que COMEÇA com aspa; depois do fecho só cabe espaço. Aspa
    # no meio de item sem aspas é literal. Par desbalanceado devolve 0.
    function fluxo(s,   i, n, c, aspa, fechado, item) {
      n = length(s); aspa = ""; fechado = 0; item = ""
      for (i = 1; i <= n + 1; i++) {
        c = (i <= n) ? substr(s, i, 1) : ","
        if (aspa != "" && i <= n) {
          item = item c
          if (c == aspa) { aspa = ""; fechado = 1 }
          continue
        }
        if (aspa != "") return 0
        if (c == ",") {
          if (!fechado && item ~ /["\047][[:space:]]*$/) return 0
          junta(item); item = ""; fechado = 0
          continue
        }
        if (fechado && c !~ /[[:space:]]/) return 0
        if ((c == "\"" || c == "\047") && item ~ /^[[:space:]]*$/) aspa = c
        item = item c
      }
      return 1
    }
    /^\001/ { next }
    /^[[:space:]]*-[[:space:]]*id:/ {
      despeja()
      id = $0; sub(/^[[:space:]]*-[[:space:]]*id:/, "", id); id = limpo(id)
      st = ""; su = ""; marca = "ausente"; itens = ""; lista = 0
      next
    }
    id == "" { next }
    lista {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^[[:space:]]*#/) next
      if ($0 ~ /^[[:space:]]*-([[:space:]]|$)/ && recuo($0) >= rlista) {
        v = $0; sub(/^[[:space:]]*-/, "", v); junta(v); next
      }
      lista = 0
    }
    /^[[:space:]]*status:/ { v = $0; sub(/^[^:]*:/, "", v); st = limpo(v); next }
    /^[[:space:]]*suite:/  { v = $0; sub(/^[^:]*:/, "", v); su = limpo(v); next }
    /^[[:space:]]*suite_falhas:/ {
      rlista = recuo($0)
      v = $0; sub(/^[^:]*:/, "", v); v = limpo(v)
      marca = "lista"; itens = ""
      if (v == "") { lista = 1; next }
      if (v ~ /^\[.*\]$/ && fluxo(substr(v, 2, length(v) - 2))) next
      marca = "invalida"; itens = ""; next
    }
    END { despeja() }
  '
}

# ---------------------------------------------------------------------------
# A lista de ambiente e o diff: lidos uma vez, só quando uma vermelha precisa.
# ---------------------------------------------------------------------------
LISTA_LIDA=0; LISTA_RC=0; LISTADOS=""
carrega_lista() {
  [ "$LISTA_LIDA" = 0 ] || return "$LISTA_RC"
  LISTA_LIDA=1
  local tsv="$RAIZ/.expx/falhas-de-ambiente.tsv"
  # sem a lista, nada está listado: a vermelha é FALHA, provada
  [ -e "$tsv" ] || return 0
  if [ ! -f "$tsv" ] || [ ! -r "$tsv" ]; then LISTA_RC=1; return 1; fi
  LISTADOS="$(awk -v plat="$PLAT" '
    BEGIN { FS = "\t" }
    { sub(/\r$/, "") }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      c = $1; p = $2; m = $3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", p)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", m)
      if (c == "" || p != plat || m == "") next
      print c
    }
  ' "$tsv")" || { LISTA_RC=1; return 1; }
  return 0
}

DIFF_LIDO=0; DIFF_RC=0; DIFF_MOTIVO=""; TOCADOS=""
carrega_diff() {
  [ "$DIFF_LIDO" = 0 ] || return "$DIFF_RC"
  DIFF_LIDO=1
  local saida
  if ! git -C "$RAIZ" rev-parse -q --verify "$BASE^{commit}" >/dev/null 2>&1; then
    DIFF_RC=1; DIFF_MOTIVO="base-invalida: $BASE"; return 1
  fi
  # -z e --no-renames: caminho com espaço ou acento chega cru, e o teste
  # renomeado aparece pelos dois nomes
  if ! saida="$(git -C "$RAIZ" diff --name-only --no-renames -z "$BASE...HEAD" | tr '\000' '\n')"; then
    DIFF_RC=1; DIFF_MOTIVO="diff-ilegivel: $BASE...HEAD"; return 1
  fi
  TOCADOS="$saida"
  if [ "$STAGED" = 1 ]; then
    if ! saida="$(git -C "$RAIZ" diff --cached --name-only --no-renames -z | tr '\000' '\n')"; then
      DIFF_RC=1; DIFF_MOTIVO="indice-ilegivel"; return 1
    fi
    TOCADOS="$TOCADOS
$saida"
  fi
  return 0
}

# confere_lista <marca> <caminho>... — a regra da vermelha. Grava V_RES e V_MOTIVO.
confere_lista() {
  local marca="$1" c fora="" tocados="" todos=""
  shift
  case "$marca" in
    ausente)  V_RES=FALHA; V_MOTIVO="suite_falhas-ausente"; return 0 ;;
    invalida) V_RES=FALHA; V_MOTIVO="suite_falhas-invalida"; return 0 ;;
  esac
  if [ "$#" -eq 0 ]; then V_RES=FALHA; V_MOTIVO="suite_falhas-vazia"; return 0; fi
  if ! carrega_lista; then V_RES=SEM_PROVA; V_MOTIVO="lista-ilegivel: .expx/falhas-de-ambiente.tsv"; return 0; fi
  for c in "$@"; do
    todos="${todos:+$todos, }$c"
    grep -Fx -- "$c" <<<"$LISTADOS" >/dev/null || fora="${fora:+$fora, }$c"
  done
  if [ -n "$fora" ]; then V_RES=FALHA; V_MOTIVO="fora-da-lista($PLAT): $fora"; return 0; fi
  if ! carrega_diff; then V_RES=SEM_PROVA; V_MOTIVO="$DIFF_MOTIVO"; return 0; fi
  for c in "$@"; do
    grep -Fx -- "$c" <<<"$TOCADOS" >/dev/null && tocados="${tocados:+$tocados, }$c"
  done
  if [ -n "$tocados" ]; then V_RES=FALHA; V_MOTIVO="tocado-pelo-diff: $tocados"; return 0; fi
  V_RES=AVISO; V_MOTIVO="falha-de-ambiente($PLAT): $todos"
  return 0
}

N_FALHA=0; N_SEM=0; N_AVISO=0; LINHAS=""
registra() { # <resultado> <id> <tasks.md> <motivo>
  LINHAS="$LINHAS$1	$2	$3	$4
"
  case "$1" in
    FALHA)     N_FALHA=$((N_FALHA + 1)) ;;
    SEM_PROVA) N_SEM=$((N_SEM + 1)) ;;
    AVISO)     N_AVISO=$((N_AVISO + 1)) ;;
  esac
}

# avalia <id> <tasks.md> <suite> <marca> <caminhos separados por RS>
avalia() {
  local id="$1" arq="$2" su="$3" marca="$4" itens="$5" velho="$IFS"
  case "$su" in
    parcial|verde) return 0 ;;
    nao_executada) registra FALHA "$id" "$arq" "suite-nao_executada"; return 0 ;;
    vermelha) ;;
    '') registra FALHA "$id" "$arq" "suite-ausente"; return 0 ;;
    *)  registra FALHA "$id" "$arq" "suite-desconhecida: $su"; return 0 ;;
  esac
  set -f; IFS="$RS"
  # shellcheck disable=SC2086
  set -- $itens
  IFS="$velho"; set +f
  confere_lista "$marca" "$@"
  registra "$V_RES" "$id" "$arq" "$V_MOTIVO"
}

conclui() {
  local r=OK rc=0
  if [ "$N_FALHA" -gt 0 ]; then r=FALHA; rc=1
  elif [ "$N_SEM" -gt 0 ]; then r=SEM_PROVA; rc=2
  elif [ "$N_AVISO" -gt 0 ]; then r=AVISO
  fi
  printf 'V2=%s\n' "$r"
  printf '%s' "$LINHAS"
  exit "$rc"
}

# ---------------------------------------------------------------------------
MODO="${1:-}"
case "$MODO" in
  --verificar|--conferir-falhas) shift ;;
  --plataforma) [ "$#" -eq 1 ] || uso; plataforma; exit 0 ;;
  *) printf 'portao-v2: opção desconhecida: %s\n' "$MODO" >&2; uso ;;
esac

BASE=""; RAIZ=""; STAGED=0; SO_TASK=""; TEM_TASK=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)   [ "$#" -ge 2 ] || uso; BASE="$2"; shift 2 ;;
    --raiz)   [ "$#" -ge 2 ] || uso; RAIZ="$2"; shift 2 ;;
    --staged) STAGED=1; shift ;;
    --task)   [ "$MODO" = --verificar ] && [ "$#" -ge 2 ] || uso; SO_TASK="$2"; TEM_TASK=1; shift 2 ;;
    --)       shift; break ;;
    -*)       printf 'portao-v2: opção desconhecida: %s\n' "$1" >&2; uso ;;
    *)        break ;;
  esac
done
[ -n "$BASE" ] || uso
[ "$TEM_TASK" = 0 ] || [ -n "$SO_TASK" ] || uso
if [ -z "$RAIZ" ]; then
  RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || RAIZ=""
  [ -n "$RAIZ" ] || RAIZ="$PWD"
fi
PLAT="$(plataforma)"

if [ "$MODO" = --conferir-falhas ]; then
  confere_lista lista "$@"
  [ "$V_RES" = OK ] || registra "$V_RES" - - "$V_MOTIVO"
  conclui
fi

if [ "$#" -eq 0 ]; then
  registra SEM_PROVA - - "nenhum-tasks-md-informado"
  conclui
fi

ACHOU=0
for arq in "$@"; do
  if ! linhas="$(tasks_de "$arq")"; then
    registra SEM_PROVA - "$arq" "plano-ilegivel"
    continue
  fi
  while IFS="$US" read -r id st su marca itens; do
    [ -n "$id" ] || continue
    if [ "$TEM_TASK" = 1 ]; then
      [ "$id" = "$SO_TASK" ] || continue
      ACHOU=1
    else
      [ "$st" = concluida ] || continue
    fi
    avalia "$id" "$arq" "$su" "$marca" "$itens"
  done <<EOF
$linhas
EOF
done

if [ "$TEM_TASK" = 1 ] && [ "$ACHOU" = 0 ]; then
  registra SEM_PROVA "$SO_TASK" - "task-nao-encontrada"
fi
conclui
