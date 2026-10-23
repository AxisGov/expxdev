#!/usr/bin/env bash
# portao-v12 — a V12 do portão de prontidão (E2): cada task `concluida` com commit
# registrado tem revisão por task aprovada no commit dela?
#
# Contrato: `expx-revisao` v2 do expxdev (`conferir`); DM-238; plano
# 2026-10-20-mergex-limites-do-codeant-parte-2.md (Task B1 emendada).
#
#   1. A mergex nunca lê nem escreve a evidência de revisão: quem grava é o `revisar`
#      do núcleo do expx, quem lê é o `conferir` dele, e a V12 só traduz o que o
#      `conferir` responde. A evidência lida é a do commit da task, nunca a do disco.
#   2. O commit da task é o do ÚLTIMO item dela em `ENTREGA.commits`, na ordem efetiva
#      (a do arquivo), lido por `sequencia-de-commits.sh --ler`: nunca um segundo parser.
#      Task concluída sem item não é alvo (é da V11); último item sem commit válido é
#      SEM_PROVA (nunca o commit de um item anterior).
#   3. A entrega de planejamento (`entrega-de-planejamento.sh`, antes de tudo) não tem
#      task executada: `n/a`. Entrega incoerente: SEM_PROVA.
#   4. O modo vem de `leitor-do-projeto.sh --rev HEAD` (consumo com `set -a`). Sem
#      `.expx/fatiamento.json`: `n/a`, sem node. Leitor que não lê (configuração
#      inválida, `FATIA_*` no ambiente, núcleo ausente ou antigo, node ausente):
#      SEM_PROVA em qualquer modo, porque o modo não pode ser lido.
#   5. `desligada`, `versionado: false`, nenhuma task concluída ou nenhuma com commit:
#      `n/a`, sem chamar o `conferir`. Fora de um repositório Git (sem `--raiz`), só
#      `versionado: false` é `n/a`; o resto é SEM_PROVA (não há HEAD para ler o modo).
#   6. Núcleo sem `expx-revisao.mjs`: SEM_PROVA em `obrigatoria`, AVISO
#      `revisao-nao-conferida` em `se_disponivel`.
#   7. `conferir` 0 / 3 / 1: OK / AVISO / FALHA (o modo já está no veredito de cada
#      linha; `incompleta` é FALHA nos dois). Qualquer outro código (64 inclusive), ou
#      saída que não seja exatamente uma linha `<task> ok|AVISO <motivo>|FALHA <motivo>`
#      por task pedida, na ordem, coerente com o código: SEM_PROVA.
#
# Uso:
#   portao-v12.sh --verificar --entrega <ENTREGA.md> --trabalho <slug> [--raiz <dir>] -- <tasks.md>...
#
# Saída, primeira linha sempre:
#   V12=OK         (0) — mais as linhas do `conferir`
#   V12=AVISO      (0) — mais as linhas do `conferir`, ou `motivo=`
#   V12=n/a        (0) — mais `motivo=`
#   V12=FALHA      (1) — mais as linhas do `conferir`
#   V12=SEM_PROVA  (2) — mais `motivo=`; o que veio do `conferir` ou do leitor vai ao stderr
# Uso errado: 64.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SH="${BASH:-bash}"

uso() {
  [ -z "${1:-}" ] || printf 'portao-v12: %s\n' "$1" >&2
  printf '%s\n' 'uso: portao-v12.sh --verificar --entrega <ENTREGA.md> --trabalho <slug> [--raiz <dir>] -- <tasks.md>...' >&2
  exit 64
}

VERIFICAR=0; ENTREGA=""; TRABALHO=""; RAIZ=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar) VERIFICAR=1; shift ;;
    --entrega|--trabalho|--raiz)
      [ "$#" -ge 2 ] && [ -n "$2" ] || uso "$1 exige valor"
      case "$1" in --entrega) ENTREGA="$2" ;; --trabalho) TRABALHO="$2" ;; *) RAIZ="$2" ;; esac
      shift 2 ;;
    --) shift; break ;;
    *) uso "argumento desconhecido: $1" ;;
  esac
done
[ "$VERIFICAR" = 1 ] || uso 'falta --verificar'
[ -n "$ENTREGA" ] || uso 'falta --entrega'
[ -n "$TRABALHO" ] || uso 'falta --trabalho'
[ "$#" -ge 1 ] || uso 'nenhum tasks.md informado'
case "$TRABALHO" in [!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) uso "trabalho invalido: $TRABALHO" ;; esac

tmp="$(mktemp -d)" || { printf 'V12=SEM_PROVA\nmotivo=sem-temporario\n'; exit 2; }
trap 'rm -rf "$tmp"' EXIT

na()        { printf 'V12=n/a\nmotivo=%s\n' "$1"; exit 0; }
sem_prova() { printf 'V12=SEM_PROVA\nmotivo=%s\n' "$1"; exit 2; }
repassa()   { [ ! -s "$tmp/err" ] || cat "$tmp/err" >&2; }

# 1. a entrega de planejamento, antes de tudo
marca="$("$SH" "$AQUI/entrega-de-planejamento.sh" --entrega "$ENTREGA" 2> "$tmp/err")" \
  || { repassa; sem_prova 'entrega-de-planejamento-ilegivel'; }
case "$marca" in
  planejamento=sim*) na 'planejamento: nenhuma task executada' ;;
  planejamento=nao*) ;;
  *) repassa; sem_prova 'entrega-de-planejamento-ilegivel' ;;
esac

# o leitor único de `commits` (sequencia-de-commits.sh, por prova-de-commit.sh); daqui só
# `escalar` e `limpa`, como na V11
# shellcheck source=sequencia-de-commits.sh
. "$AQUI/sequencia-de-commits.sh"

# sem_repositorio_git — fora de QUALQUER repositório Git, pelo próprio Git (DM-186): a
# mesma função, byte a byte, de registrar-portao.sh e ativacao-pre-push.sh (o validador do
# contrato confere). Qualquer outra falha do Git (GIT_DIR inválido, dubious ownership,
# repositório corrompido) não é "sem Git".
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

# 2. o modo, pelo leitor do projeto, do commit (HEAD). Fora de um repositório Git não há
# HEAD a ler: com `versionado: false` a V12 é `n/a` (não há commit de task), senão SEM_PROVA.
# O Git que falha por outro motivo é sempre SEM_PROVA.
if [ -z "$RAIZ" ]; then
  RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    sem_repositorio_git || { printf 'portao-v12: %s\n' "$SEM_GIT_ERRO" >&2; sem_prova 'git-falhou'; }
    [ "$(limpa "$(escalar "$ENTREGA" versionado)")" != false ] || na 'sem-versionador'
    sem_prova 'fora-de-um-repositorio-git'
  }
fi
# absoluta: o node roda de dentro dela, e uma relativa seria resolvida duas vezes
RAIZ="$(cd "$RAIZ" 2>/dev/null && pwd)" || sem_prova 'raiz-inexistente'
EXPX_REVISAO_POR_TASK=""; EXPX_FATIAMENTO_ORIGEM=""
fatia="$("$SH" "$AQUI/leitor-do-projeto.sh" --raiz "$RAIZ" --rev HEAD 2> "$tmp/err")" \
  || { rc=$?; repassa; sem_prova "configuracao-nao-lida:$rc"; }
set -a; eval "$fatia"; set +a
[ "$EXPX_FATIAMENTO_ORIGEM" != padrao ] || na 'sem-fatiamento-json'
MODO="$EXPX_REVISAO_POR_TASK"
case "$MODO" in
  obrigatoria|se_disponivel) ;;
  desligada) na 'revisao-por-task-desligada' ;;
  *) sem_prova "modo-desconhecido:$MODO" ;;
esac

# 3. versionado e as tasks
[ "$(limpa "$(escalar "$ENTREGA" versionado)")" != false ] || na 'sem-versionador'

concluidas="$("$SH" "$AQUI/prova-de-commit.sh" --concluidas "$@" 2> "$tmp/err")" \
  || { repassa; sem_prova 'plano-ilegivel'; }
[ -n "$concluidas" ] || na 'nenhuma-task-concluida'
commits="$("$SH" "$AQUI/sequencia-de-commits.sh" --ler "$ENTREGA" 2> "$tmp/err")" \
  || { repassa; sem_prova 'commits-ilegivel'; }

# alvos: cada task concluída (uma vez só) com o commit do ÚLTIMO item dela, na ordem
# efetiva (a do arquivo). A leitura é a crua (`--ler`, todos os itens): se o último item
# da task não tem commit válido, a V12 não volta a um item anterior, que provaria um
# commit que já não é o da task — SEM_PROVA.
ALVOS=""; VISTAS=""
while IFS="$(printf '\t')" read -r id _; do
  [ -n "$id" ] || continue
  printf '%s' "$VISTAS" | grep -Fxq -- "$id" && continue
  VISTAS="$VISTAS$id
"
  tem_item=0; sha=""
  while IFS= read -r item; do
    [ -n "$item" ] || continue
    campos "$item"
    [ "$(limpa "$CAMPO3")" = "$id" ] || continue
    tem_item=1; sha="$(limpa "$CAMPO4")"
  done <<EOI
$commits
EOI
  [ "$tem_item" = 1 ] || continue
  sha_valido "$sha" || sem_prova "commit-invalido:$id"
  ALVOS="$ALVOS$id=$sha
"
done <<EOF
$concluidas
EOF
[ -n "$ALVOS" ] || na 'nenhuma-task-com-commit'

# 4. o conferir do núcleo instalado
mjs="$RAIZ/.expx/marketplace/plugins/expx/nucleo/scripts/expx-revisao.mjs"
if [ ! -f "$mjs" ]; then
  if [ "$MODO" = se_disponivel ]; then
    printf 'V12=AVISO\nmotivo=revisao-nao-conferida:nucleo-sem-expx-revisao\n'; exit 0
  fi
  sem_prova 'nucleo-sem-expx-revisao'
fi
command -v node >/dev/null 2>&1 || sem_prova 'node-ausente'
raiz_node="$RAIZ"
# node nativo no Windows não entende o caminho do MSYS
if command -v cygpath >/dev/null 2>&1; then mjs="$(cygpath -w "$mjs")"; raiz_node="$(cygpath -w "$RAIZ")"; fi

set -- conferir --trabalho "$TRABALHO" --modo "$MODO" --raiz "$raiz_node"
while IFS= read -r alvo; do
  [ -z "$alvo" ] || set -- "$@" --task "$alvo"
done <<EOF
$ALVOS
EOF
(cd "$RAIZ" && node "$mjs" "$@") > "$tmp/out" 2> "$tmp/err"; rc=$?

fora() { cat "$tmp/out" "$tmp/err" >&2; sem_prova "$1"; }
case "$rc" in 0|1|3) ;; *) fora "conferir-saiu-$rc" ;; esac

# exatamente uma linha por task pedida, na ordem, e coerente com o código
esperadas="$(printf '%s' "$ALVOS" | sed 's/=.*//')"
n_falha=0; n_aviso=0
exec 3< "$tmp/out"
while IFS= read -r task; do
  IFS= read -r linha <&3 || fora 'conferir-saida-fora-da-forma'
  case "$linha" in
    "$task ok") ;;
    "$task AVISO "[![:space:]]*) n_aviso=$((n_aviso + 1)) ;;
    "$task FALHA "[![:space:]]*) n_falha=$((n_falha + 1)) ;;
    *) fora 'conferir-saida-fora-da-forma' ;;
  esac
done <<EOF
$esperadas
EOF
# nada depois, nem uma linha sem o fim de linha (o `read` sai 1, mas preenche `linha`)
linha=''
if IFS= read -r linha <&3 || [ -n "$linha" ]; then fora 'conferir-saida-fora-da-forma'; fi
exec 3<&-

case "$rc:$n_falha:$n_aviso" in
  0:0:0) veredito=OK ;;
  1:0:*) fora 'conferir-saida-fora-da-forma' ;;
  1:*) veredito=FALHA ;;
  3:0:0) fora 'conferir-saida-fora-da-forma' ;;
  3:0:*) veredito=AVISO ;;
  *) fora 'conferir-saida-fora-da-forma' ;;
esac
printf 'V12=%s\n' "$veredito"
cat "$tmp/out"
[ "$veredito" != FALHA ] || exit 1
exit 0
