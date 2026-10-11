#!/usr/bin/env bash
# registrar-portao — o gravador único do resultado do portão (E2).
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13, itens 1 e 6 (DM-184); references/02-prontidao.md, "Critério de
# saída"; references/12-barreira-de-push.md, "Prova funcional".
#
# Uso:
#   registrar-portao.sh --entrega docs/entregas/<id>/ENTREGA.md \
#     --origem <sprintx|runx> --trabalho <id> --resultado <pronto|bloqueado> \
#     [--falhas <vN>...]
#
# É o único caminho do E2 que grava `portao`, `portao_sha`, `falhas_portao` e
# `atualizado_em` no ENTREGA.md do disco (nunca no índice, nunca commita), pelo
# editor de frontmatter do registro (reconciliacao-base.sh, Task 6),
# reutilizado literalmente. As demais chaves e o corpo ficam byte a byte.
#
# --resultado pronto (sem --falhas)
#   Roda `ativacao-pre-push.sh --provar` ANTES de qualquer escrita. Reprovada:
#   imprime `RESULTADO: BLOQUEADO — pre-push sem prova funcional`, não grava
#   nada e sai 3. Aprovada: grava `portao: pronto`, `portao_sha` = SHA
#   completo do HEAD avaliado, `falhas_portao: []` e `atualizado_em` de hoje,
#   e imprime `RESULTADO: PRONTO` e `portao_sha=<sha>`.
# --resultado bloqueado --falhas <vN>... (ao menos uma)
#   Não exige a prova. Grava `portao: bloqueado`, `portao_sha` = HEAD,
#   `falhas_portao` na forma de `causa-do-portao.sh --lista` e `atualizado_em`,
#   e imprime `RESULTADO: BLOQUEADO` e `falhas_portao=<lista>`.
#
# Fora de um repositório Git (DM-186): o próprio Git não resolve a raiz
# (`git rev-parse --show-toplevel` falha). Não há push a proteger, então a
# prova do pre-push é DISPENSADA: a raiz é o diretório corrente, `portao_sha`
# é `null` (não há HEAD) e o `pronto` grava sem `--provar`. O critério é só o
# Git real — nunca o campo `versionado` do ENTREGA.md: dentro de um
# repositório Git, `versionado: false` continua exigindo a prova.
#
# O resultado é montado numa cópia e só substitui o ENTREGA.md depois de
# passar em `causa-do-portao.sh --validar`; qualquer recusa deixa o arquivo
# byte a byte igual.
#
# Códigos: 0 gravado; 1 ambiente (temporário, editor indisponível); 3 prova
# ausente ou reprovada; 5 contrato inválido (entrega, origem, trabalho, falhas
# ou resultado que não passa em --validar); 64 uso. Nenhuma opção de força: o
# PRONTO só existe com a prova — ou sem Git, quando não há push a proteger.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ATIVACAO_SH="$AQUI/ativacao-pre-push.sh"
CAUSA_SH="$AQUI/causa-do-portao.sh"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
RB_SH="$AQUI/reconciliacao-base.sh"
NL='
'

uso() {
  [ -z "${1:-}" ] || printf 'registrar-portao: %s\n' "$1" >&2
  printf '%s\n' 'uso: registrar-portao.sh --entrega <ENTREGA.md> --origem <sprintx|runx> --trabalho <id> --resultado <pronto|bloqueado> [--falhas <vN>...]' >&2
  exit 64
}

ENTREGA=""; ORIGEM=""; TRABALHO=""; RESULTADO=""; FALHAS=""; COM_FALHAS=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    --resultado) [ "$#" -ge 2 ] || uso; RESULTADO="$2"; shift 2 ;;
    --falhas)
      [ "$COM_FALHAS" = 0 ] || uso '--falhas repetido'
      COM_FALHAS=1; shift
      while [ "$#" -gt 0 ]; do
        case "$1" in --*) break ;; esac
        FALHAS="$FALHAS $1"; shift
      done ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done

case "$ORIGEM" in sprintx|runx) ;; *) uso '--origem é sprintx ou runx' ;; esac
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*) uso '--trabalho inválido' ;;
esac
case "$RESULTADO" in
  pronto) [ "$COM_FALHAS" = 0 ] || uso 'PRONTO não tem falhas: --falhas só com --resultado bloqueado' ;;
  bloqueado) [ -n "$FALHAS" ] || uso 'BLOQUEADO exige --falhas com ao menos uma verificação' ;;
  *) uso '--resultado é pronto ou bloqueado' ;;
esac
[ -n "$ENTREGA" ] || uso 'falta --entrega'

TMP_DIR=""
TMP_ARQ="" # o ENTREGA.md novo ao lado do atual, até a troca
encerrar() {
  local rc="$1"
  [ -z "$TMP_ARQ" ] || rm -f "$TMP_ARQ"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  exit "$rc"
}
trap 'encerrar $?' EXIT
trap 'exit 1' HUP INT TERM

ambiente() { printf 'registrar-portao: %s\n' "$1" >&2; exit 1; }
contrato() { printf 'registrar-portao: %s\n' "$1" >&2; exit 5; }

[ -r "$CATALOGO_SH" ] || ambiente "dependência indisponível: $CATALOGO_SH"
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH" || ambiente "dependência ilegível: $CATALOGO_SH"
set +e

# sem_repositorio_git — fora de QUALQUER repositório Git, pelo próprio Git
# (DM-186, rodada 1). Só quando as três valem: (1) o ambiente não aponta
# repositório (GIT_DIR, GIT_WORK_TREE e GIT_COMMON_DIR vazios); (2) não há
# `.git` no diretório corrente nem em nenhum ancestral; (3) o Git não acha
# repositório nenhum (`rev-parse --git-dir` falha com "not a git repository",
# em LC_ALL=C). Qualquer outra falha do Git — GIT_DIR inválido, dubious
# ownership, cwd dentro de .git, repositório bare ou corrompido — NÃO é "sem
# Git": é erro de ambiente, e SEM_GIT_ERRO leva o diagnóstico. A mesma função,
# byte a byte, em registrar-portao.sh e ativacao-pre-push.sh (o validador do
# contrato confere). Bash 3.2.
SEM_GIT_ERRO=""
sem_repositorio_git() {
  local p saida
  SEM_GIT_ERRO=""
  if [ -n "${GIT_DIR:-}${GIT_WORK_TREE:-}${GIT_COMMON_DIR:-}" ]; then
    SEM_GIT_ERRO="GIT_DIR, GIT_WORK_TREE ou GIT_COMMON_DIR está definido e o Git não resolveu a árvore de trabalho"; return 1
  fi
  p="$PWD"
  while :; do
    if [ -e "${p%/}/.git" ]; then SEM_GIT_ERRO="há um .git em ${p%/}/ e o Git não resolveu a árvore de trabalho"; return 1; fi
    case "$p" in ''|/) break ;; esac
    p="${p%/*}"; [ -n "$p" ] || p=/
  done
  if saida="$(LC_ALL=C git rev-parse --git-dir 2>&1)"; then
    SEM_GIT_ERRO="o Git acha um repositório ($saida) mas não resolve a árvore de trabalho"; return 1
  fi
  case "$saida" in *'not a git repository'*) return 0 ;; esac
  SEM_GIT_ERRO="o Git falhou: $saida"; return 1
}

# DM-186: fora de um repositório Git não há push a proteger; a raiz é o
# diretório corrente e a prova do pre-push é dispensada (adiante). Só o Git
# real decide isso, nunca o campo `versionado` do ENTREGA.md — e só a AUSÊNCIA
# de repositório dispensa: qualquer outra falha do Git é ambiente (rc 1), nada
# gravado.
SEM_GIT=0
RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  sem_repositorio_git || ambiente "o Git não resolveu a árvore de trabalho e isto não é 'sem repositório' ($SEM_GIT_ERRO; git: $(LC_ALL=C git rev-parse --show-toplevel 2>&1 | sed -n 1p)); a prova NÃO foi dispensada e nada foi gravado"
  SEM_GIT=1; RAIZ="$PWD"
}

# A entrega é evidência explícita, na forma canônica, conferida com os
# argumentos (como em persistir-metodo.sh).
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
[ "$ENTREGA" = "docs/entregas/$TRABALHO/ENTREGA.md" ] || contrato "--entrega deve ser docs/entregas/$TRABALHO/ENTREGA.md"
ARQ="$RAIZ/$ENTREGA"
[ -f "$ARQ" ] && [ ! -L "$ARQ" ] || contrato "$ENTREGA não é arquivo regular"
[ "$(catalogo_fm "$ARQ" kind)" = entrega ] || contrato "$ENTREGA não declara kind: entrega"
[ "$(catalogo_fm "$ARQ" trabalho_id)" = "$TRABALHO" ] || contrato 'trabalho explícito diverge de ENTREGA.trabalho_id'
[ "$(catalogo_fm "$ARQ" expx_tool)" = "$ORIGEM" ] || contrato 'origem explícita diverge de ENTREGA.expx_tool'

LISTA='[]'
if [ "$RESULTADO" = bloqueado ]; then
  # shellcheck disable=SC2086
  LISTA="$(bash "$CAUSA_SH" --lista $FALHAS 2>&1)" || contrato "falhas inválidas: $LISTA"
fi

if [ "$SEM_GIT" = 1 ]; then
  # sem Git não há HEAD: `portao_sha: null` (00-schema.md), como antes do E2
  HEAD_SHA=null
else
  HEAD_SHA="$(git -C "$RAIZ" rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null)" || contrato 'HEAD não resolve para um commit'
  printf '%s\n' "$HEAD_SHA" | grep -Eqx '[0-9a-f]{40}|[0-9a-f]{64}' || contrato "HEAD sem SHA completo: $HEAD_SHA"
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-registrar-portao.XXXXXX")" || { TMP_DIR=""; ambiente 'não foi possível criar diretório temporário'; }

# O PRONTO só existe com a prova funcional do pre-push, antes de qualquer
# escrita. Reprovada (ou o ativador ausente): BLOQUEADO, nada gravado. Fora de
# um repositório Git (SEM_GIT, pelo Git real) a prova é dispensada: não há
# push a proteger (DM-186).
sem_prova() {
  sed 's/^/  /' "$TMP_DIR/prova" >&2
  printf '%s\n' 'RESULTADO: BLOQUEADO — pre-push sem prova funcional'
  printf '%s\n' "registrar-portao: nada foi gravado em $ENTREGA; rode o E0 (ativacao-pre-push.sh --instalar) e o E2 de novo" >&2
  exit 3
}
[ "$RESULTADO" != pronto ] || [ "$SEM_GIT" = 1 ] || ( cd "$RAIZ" && bash "$ATIVACAO_SH" --provar --entrega "$ENTREGA" ) > "$TMP_DIR/prova" 2>&1 || sem_prova # guarda:E2SEMHOOK
[ "$SEM_GIT" = 0 ] || printf 'registrar-portao: fora de um repositório Git: não há push a proteger; prova do pre-push dispensada e portao_sha: null\n' >&2

# O editor de frontmatter do registro (Task 6), reutilizado literalmente.
[ -r "$RB_SH" ] || ambiente "editor de frontmatter indisponível: $RB_SH"
eval "$(awk '/^(_entrega_fecha|_entrega_troca|entrega_define)\(\) \{/,/^}$/' "$RB_SH")" \
  && declare -F _entrega_fecha >/dev/null && declare -F _entrega_troca >/dev/null && declare -F entrega_define >/dev/null \
  || ambiente "editor de frontmatter indisponível: $RB_SH"

HOJE="$(date +%Y-%m-%d)" || ambiente 'data do sistema indisponível'
NOVO="$TMP_DIR/ENTREGA.md"
cp "$ARQ" "$NOVO" || ambiente "não foi possível copiar $ENTREGA"
ENTREGA_ERRO=""
entrega_define "$NOVO" portao "$RESULTADO" \
  && entrega_define "$NOVO" portao_sha "$HEAD_SHA" \
  && entrega_define "$NOVO" falhas_portao "$LISTA" \
  && entrega_define "$NOVO" atualizado_em "$HOJE" \
  || contrato "$ENTREGA: $ENTREGA_ERRO; nada foi gravado"

VALIDA="$(bash "$CAUSA_SH" --validar "$NOVO" 2>&1)" || contrato "o resultado não passa em causa-do-portao --validar ($VALIDA); nada foi gravado"

# Gravação atômica, no padrão do registro (reconciliacao-base.sh): o conteúdo
# novo vai para um temporário na pasta da entrega (`cp -p`: mesmo modo) e troca
# de lugar com o ENTREGA.md por `mv`. Qualquer falha de leitura ou escrita
# deixa o arquivo como estava — `cat NOVO > ARQ` truncava antes de ler, e um
# NOVO ilegível deixava o ENTREGA.md com 0 bytes (CodeAnt 4235529223).
TMP_ARQ="$ARQ.portao.$$"
{ cp -p "$ARQ" "$TMP_ARQ" && cat "$NOVO" > "$TMP_ARQ" && mv "$TMP_ARQ" "$ARQ"; } \
  || { rm -f "$TMP_ARQ"; TMP_ARQ=""; ambiente "não foi possível gravar $ENTREGA; o arquivo não foi alterado"; }
TMP_ARQ=""

if [ "$RESULTADO" = pronto ]; then
  printf '%s\n' 'RESULTADO: PRONTO' "portao_sha=$HEAD_SHA"
else
  printf '%s\n' 'RESULTADO: BLOQUEADO' "falhas_portao=$LISTA"
fi
exit 0
