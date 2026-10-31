#!/usr/bin/env bash
# portao-ci — a verificação do portão no CI, sobre o SHA da cabeça do PR.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13, itens 5 e 8 (DM-184, DM-185). Seleciona as entregas governadas pelo
# portão SÓ PELO CONTEÚDO do PR (pr_entregas_do_intervalo, em portao-regras.sh:
# o diff de árvores entre o merge-base de --base e --sha e os commits não-merge
# do intervalo que tocam docs/entregas/<id>/ENTREGA.md) e decide cada uma com a
# mesma validade do pre-push (validade-do-portao.sh --rev <sha>) e o mesmo modo
# de `portao: null` (pr-so-com-portao em .expx/hooks.json), agregando: qualquer
# barra vence, depois avisa, depois passa. O nome da branch nunca seleciona
# nem isenta: `--branch` é só conferência — quando não é o `branch:` de nenhuma
# entrega selecionada, a saída traz `aviso=branch_divergente` e a decisão não
# muda. Esta branch entrega o executável e o template, nunca ativa CI.
#
# Uso (a partir da raiz do checkout, com a história completa):
#   portao-ci.sh --verificar --sha <sha40|sha64> --branch <nome> --base <sha40|sha64>
#
# Seleção. <base> é pull_request.base.sha e <sha> é pull_request.head.sha. Um
# merge-base único; mais de um barra (base_ambigua). Sem merge-base: num clone
# completo a base é a árvore vazia (a história do SHA inteira entra); num clone
# raso, historia_incompleta. Clone raso, --base ou --sha que não é objeto no
# clone: historia_incompleta (falha fechada). Entrega selecionada que não existe
# no <sha> (removida, renomeada, criada e apagada) barra (portao_nao_pronto).
# Custo: um número constante de processos Git na seleção, mais uma validade por
# entrega selecionada (normalmente uma); nunca proporcional às entregas do
# repositório.
#
# Saída (stdout): por entrega selecionada, entrega[<i>]=, decisao[<i>]= e
# motivo[<i>]= (<i> a partir de 1); cada aviso numa linha aviso=<...>; e, uma
# única vez no fim, o resumo decisao=<passa|avisa|barra>, motivo= (o da
# primeira entrega que barra, senão o da que decide), entrega= (`-` com
# nenhuma ou mais de uma) e quantidade_entregas=<n>. Seleção vazia: passa,
# ref_nao_aplicavel. O código de saída segue só o resumo. O diagnóstico (avisa
# e barra) vai a stderr; historia_incompleta (completar a história, clone raso)
# e erro_ambiente (falha do ambiente, inclusive o validador ausente) têm textos
# distintos. Com mais de uma entrega selecionada, o diagnóstico lista todas e
# diz que, se alguma veio da base, o evento tem base defasada: gerar novo
# evento (push na branch do PR) com a base atual.
#
# Códigos: 0 passa ou avisa; 1 barra; 64 uso. Nenhuma opção de força.
#
# LIMITES (spec, seção 15.1, itens 1 e 9 a 12 — documentados, não resolvidos):
# - A DM-185 fecha o contorno pelo nome da branch; o CI não é barreira contra todo contorno deliberado.
#   Com `on: pull_request`, o autor do PR controla a
#   cabeça do PR: o próprio portao-ci.sh, o workflow e o .expx/hooks.json (o
#   modo de `portao: null`). O check confia neles. Proteja .expx/**, .claude/**
#   e .github/** com CODEOWNERS e revisão obrigatória no produto.
# - Código enviado num PR que não carrega nenhum ENTREGA.md (cherry-pick sem a
#   entrega) não está sob o portão: a seleção é vazia e o CI passa.
# - Várias entregas ativas no mesmo PR barram (a anterior fica vencida); base
#   do evento defasada barra (falso bloqueio, nunca aprovação).
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uso() {
  [ -z "${1:-}" ] || printf 'portao-ci: %s\n' "$1" >&2
  printf '%s\n' 'uso: portao-ci.sh --verificar --sha <sha completo> --branch <nome> --base <sha completo>' >&2
  exit 64
}

[ "$#" -eq 7 ] || uso 'esperava --verificar --sha <sha> --branch <nome> --base <sha>'
[ "$1" = --verificar ] || uso "opção desconhecida: $1"
shift
SHA=""; BRANCH=""; BASE=""; TEM_B=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --sha) [ -z "$SHA" ] || uso '--sha repetido'; SHA="$2" ;;
    --branch) [ "$TEM_B" = 0 ] || uso '--branch repetido'; TEM_B=1; BRANCH="$2" ;;
    --base) [ -z "$BASE" ] || uso '--base repetido'; BASE="$2" ;;
    *) uso "opção desconhecida: $1" ;;
  esac
  shift 2
done
for v in "$SHA" "$BASE"; do
  grep -Eqx '[0-9a-f]{40}|[0-9a-f]{64}' <<<"$v" || uso '--sha e --base precisam ser SHAs completos em minúsculas (40 hex, ou 64)'
done
[ -n "$BRANCH" ] || uso '--branch vazio'
case "$BRANCH" in refs/*) uso '--branch é o nome da branch, sem o prefixo refs/' ;; esac
{ git check-ref-format --branch "$BRANCH" && git check-ref-format "refs/heads/$BRANCH"; } >/dev/null 2>&1 \
  || uso "--branch não é um nome de branch válido: $BRANCH" # guarda:CIBRANCH

diag() { printf 'mergex ci: %s\n' "$1" >&2; }
AMBIENTE='erro de ambiente (erro_ambiente): a validade do portão não pôde ser avaliada'

# shellcheck source=portao-regras.sh
if [ ! -r "$AQUI/portao-regras.sh" ] || ! . "$AQUI/portao-regras.sh"; then
  diag "$AMBIENTE: regras indisponíveis em $AQUI (${PR_ERRO:-portao-regras.sh ausente}); PR reprovado"
  exit 1
fi
set +e

arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { diag "$AMBIENTE: fora de um repositório Git com árvore de trabalho; PR reprovado"; exit 1; }

REF="refs/heads/$BRANCH"
# um diretório temporário único, removido inteiro na saída: a seleção, as
# decisões e os avisos ficam todos nele; nada vaza para /tmp
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-ci.XXXXXX")" \
  || { diag "$AMBIENTE: não foi possível criar diretório temporário; PR reprovado"; exit 1; }
trap 'rm -rf "$TMP_DIR"' EXIT
trap 'exit 1' HUP INT TERM
TMP="$TMP_DIR/saida"

# final — imprime a saída de $TMP, o diagnóstico e sai com o código do resumo
final() {
  local decisao
  # o resumo sempre traz quantidade_entregas=: nos caminhos de falha da seleção
  # (clone raso, base ausente, base_ambigua, caminho_com_controle,
  # historia_incompleta) nenhuma entrega chegou a ser decidida: 0
  grep -q '^quantidade_entregas=' "$TMP" || printf 'quantidade_entregas=0\n' >> "$TMP"
  cat "$TMP"
  decisao="$(sed -n 's/^decisao=//p' "$TMP")"
  case "$decisao" in
    passa) exit 0 ;;
    avisa) diag "$REF: $PR_DIAG"; exit 0 ;;
    *) diag "$REF: ${PR_DIAG:-$AMBIENTE: decisão indeterminada}"; exit 1 ;; # guarda:CIBARRA
  esac
}

# clone raso: a história cortada esconde commits e versões do ENTREGA.md
if _pr_raso "$RAIZ"; then
  _pr_sai barra historia_incompleta - "$(_pr_diag_invalido historia_incompleta) [clone raso: o CI precisa de fetch-depth: 0]" > "$TMP"
  final
fi
# a base precisa existir no clone: sem ela o intervalo do PR não se lê
if ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  _pr_sai barra historia_incompleta - "$(_pr_diag_invalido historia_incompleta) [a base $BASE do PR não é objeto neste clone]" > "$TMP"
  final
fi

# a seleção pelo conteúdo do PR: o nome da branch não entra
SEL_RC=0
: > "$TMP_DIR/selecao"
pr_entregas_do_intervalo "$RAIZ" "$BASE" "$SHA" > "$TMP_DIR/selecao" || SEL_RC=1 # guarda:CINOME
if [ "$SEL_RC" = 1 ]; then
  _pr_barra_selecao "${PR_SEL_MOTIVO:-erro_ambiente}" "$PR_ERRO" > "$TMP"
  final
fi
set --
while IFS= read -r e; do [ -n "$e" ] && set -- "$@" "$e"; done < "$TMP_DIR/selecao"

# cada entrega selecionada decidida sobre o SHA da cabeça do PR, com a agregação
: > "$TMP_DIR/decisao"
pr_decide_entregas "$RAIZ" "$SHA" "$@" > "$TMP_DIR/decisao" # guarda:CISHA

# --branch é só conferência: não é o branch: de nenhuma entrega selecionada
: > "$TMP_DIR/avisos"
if [ "$#" -gt 0 ]; then
  DECLARA=0
  for e in "$@"; do
    if git cat-file blob "$SHA:$e" > "$TMP_DIR/blob" 2>/dev/null && [ "$(catalogo_fm "$TMP_DIR/blob" branch)" = "$BRANCH" ]; then DECLARA=1; fi
  done
  [ "$DECLARA" = 1 ] || printf 'aviso=branch_divergente\n' >> "$TMP_DIR/avisos" # guarda:BRDIV
  [ "$DECLARA" = 1 ] || diag "$REF: o nome da branch do PR ($BRANCH) não é o branch: de nenhuma entrega selecionada (branch_divergente): a seleção é pelo conteúdo e a decisão não muda; atualize branch: no ENTREGA.md num commit de método pre-e6 se a renomeação for legítima"
  if [ "$#" -gt 1 ]; then
    diag "$REF: $# entregas selecionadas pelo conteúdo do PR ($(printf '%s, ' "$@" | sed 's/, $//')); se alguma veio da base, o evento do PR tem base defasada: gere novo evento (push na branch do PR) com a base atual"
  fi
fi

# a saída: as linhas por entrega, os avisos e o resumo único no fim
{ grep -E '^[a-z_]+\[[0-9]+\]=' "$TMP_DIR/decisao"; cat "$TMP_DIR/avisos"; grep -Ev '^[a-z_]+\[[0-9]+\]=' "$TMP_DIR/decisao"; } > "$TMP"
final
