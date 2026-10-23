#!/usr/bin/env bash
# pr-so-com-portao — PreToolUse em execução de comando. AVISO ANTECIPADO.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13, itens 5, 7 e 8 (DM-184). A barreira de push tem três camadas, todas
# sobre a mesma regra (portao-regras.sh -> validade-do-portao.sh --rev) e o
# mesmo modo (`pr-so-com-portao` em .expx/hooks.json):
#   - o `pre-push` do Git (portao-push.sh): autoritativo contra erro normal;
#     decide pelas refs e SHAs que o Git entrega, qualquer que seja o texto do
#     comando;
#   - este hook: só aviso antecipado. Não é fronteira de segurança;
#   - o CI com proteção de merge: a barreira contra o `--no-verify` e contra o
#     contorno pelo nome da branch (DM-185), nos limites da spec, seção 15.1
#     (itens 1 e 12).
#
# O que este hook faz, num comando que publica (`git ... push`, `send-pack`,
# `subtree push`, inclusive dentro de `bash -c`, `xargs` ou função):
#   1. `--no-verify` num `git push` reconhecido: bloqueia (exit 2) em qualquer
#      modo, porque ele faria o Git pular o `pre-push`.
#   2. Bloqueia (exit 2) só com prova: o comando é um único `git push` simples
#      (sem `;`, `&&`, `||`, `|`, subshell, `cd`, `-C`, opção global, prefixo
#      de ambiente nem expansão), o repositório do cwd se lê pelo Git, cada
#      refspec resolve sem ambiguidade para a ref local, o SHA enviado e a ref
#      de destino, e pr_decide_ref dá `barra` por um motivo do portão (vencido,
#      ausente, inconsistente, história incompleta, `portao: null` em modo
#      bloqueio). `erro_ambiente` e `entrega_indeterminada` não provam nada aqui:
#      viram aviso.
#   3. Em qualquer outro caso — comando composto, caminho UNC, `dubious
#      ownership`, diretório que não determina o repositório, refspec que não
#      resolve, validade que não termina dentro do orçamento — imprime um aviso e
#      sai 0. Quem decide é o `pre-push`.
#
# O SHA remoto anterior que o hook passa a pr_decide_ref é nulo: ele lê só a
# árvore do SHA enviado e a ponta local da branch, um subconjunto do que o
# `pre-push` lê. Assim o hook nunca barra o que o `pre-push` deixaria passar.
#
# Orçamento: o hook inteiro cabe em ORCAMENTO segundos (abaixo do timeout de
# 10 s do harness). A validade roda num processo filho com `timeout` de
# coreutils, aceito só depois de provar que mata um processo dentro do prazo
# (a mesma detecção por comportamento de ativacao-pre-push.sh). Sem `timeout`
# funcional, ou estourado o orçamento: aviso e exit 0. Nenhuma varredura de
# branches, nenhum laço de subida de diretório: uma validade por ref enviada.
#
# Modo: o de pr_modo_null. `desligado` silencia os avisos; o bloqueio provado
# segue pr_decide_ref, que o modo nunca afrouxa para portão vencido.

HOOK="pr-so-com-portao"
ORCAMENTO=8
SECONDS=0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../comum/base.sh
. "$DIR/../comum/base.sh"
# A mesma instalação publica hooks e skill lado a lado em .claude/.
REGRAS="$DIR/../../skills/mergex/scripts/portao-regras.sh"

# jq.exe do Windows escreve CRLF: o CR sai antes de qualquer comparação.
ENTRADA="$(cat)"
[ "$(printf '%s' "$ENTRADA" | jq -r '.tool_name // empty' 2>/dev/null | tr -d '\r')" = "Bash" ] || exit 0
CMD="$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // empty' 2>/dev/null | tr -d '\r')"
[ -n "$CMD" ] || exit 0
CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null | tr -d '\r')"
[ -n "$CWD" ] || CWD="$PWD"

# --------------------------------------------------------------------------
# 1. O comando publica? (`git` como programa seguido do subcomando)
# --------------------------------------------------------------------------
# Por segmento (expx_segmentos), sem aspas nem barra invertida. O casamento
# começa no PROGRAMA do segmento (depois de atribuições e palavras-chave):
# quando ele é o `git`, o subcomando vem logo depois dele, só com opções globais
# no meio (com o valor das que o levam na palavra seguinte); `git commit -m "…
# git push …"` não publica. Quando o programa é um executor (`bash -c`,
# `xargs`, `env`, `nice`…), o `git push` pode estar em qualquer posição. Outro
# programa (`echo`, `grep`, `gh`) só cita: não publica.
G_='(^|[[:space:]/{])git(\.exe)?'
OPT_='([[:space:]]+((-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix|--config-env|--attr-source)[[:space:]]+[^[:space:]]+|-[^[:space:]]*))*'
SUB_='[[:space:]]+(push|send-pack|subtree[[:space:]]+push)'
GITX_='(^|[[:space:]/{])git-(push|send-pack)(\.exe)?'
FIM_='([[:space:]]|$)'
# `--no-verify` e os prefixos únicos que o Git aceita para ele (`--no-ver`
# colide com `--no-verbose`)
NV_='[[:space:]]+([^[:space:]]+[[:space:]]+)*--no-veri(fy?)?([[:space:]]|$)'

SEGS="$(expx_segmentos "$CMD" | tr -d "\"'\\\\")"

# programa_casa <segmento> <cauda ERE> — o segmento executa um push cujo resto
# casa a cauda (FIM_: só publicar; NV_: com --no-verify)
programa_casa() {
  local s="$1" cauda="$2" b
  set -f
  # shellcheck disable=SC2086
  set -- $1
  set +f
  while [ "$#" -gt 0 ]; do
    case "$1" in
      [_[:alpha:]]*=*|'{'|'!'|if|then|else|elif|do|while|until|time) shift ;;
      *) break ;;
    esac
  done
  [ "$#" -gt 0 ] || return 1
  b="${1##*/}"; b="${b%.exe}"
  case "$b" in
    git) printf '%s\n' "$*" | grep -E "^[^[:space:]]*${OPT_}${SUB_}${cauda}" >/dev/null ;;
    git-push|git-send-pack) printf '%s\n' "$*" | grep -E "^[^[:space:]]*${cauda}" >/dev/null ;;
    *) expx_executor "$b" || return 1
       printf '%s\n' "$s" | grep -E -e "${G_}${OPT_}${SUB_}${cauda}" -e "${GITX_}${cauda}" >/dev/null ;;
  esac
}
# algum_segmento <cauda ERE>
algum_segmento() {
  local s
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    programa_casa "$s" "$1" && return 0
  done <<EOF
$SEGS
EOF
  return 1
}
publica() { algum_segmento "$FIM_"; }
publica || exit 0

# nv_publica — algum segmento executa um push com `--no-verify` (ou prefixo
# único dele)
nv_publica() { algum_segmento "$NV_"; }

# --------------------------------------------------------------------------
# Desfechos
# --------------------------------------------------------------------------
RAIZ=""
TMPH=""
trap '[ -z "$TMPH" ] || rm -rf "$TMPH"' EXIT

sai_barra() { # <motivo curto> <mensagem>
  [ -z "$RAIZ" ] || expx_rastro "$RAIZ" "acao_bloqueada" "bloqueado" "$1" "$HOOK"
  printf '%s\n' "$2" >&2
  exit 2
}
MODO=""
# sai_aviso <motivo curto> <mensagem> — aviso nos dois canais (stderr para o
# Claude Code, JSON no stdout para o OpenCode) e exit 0
sai_aviso() {
  [ -z "$RAIZ" ] || expx_rastro "$RAIZ" "regra_violada" "aviso" "$1" "$HOOK"
  printf '%s\n' "$2" >&2
  jq -cn --arg ctx "$2" '{hookSpecificOutput:{hookEventName:"PreToolUse", additionalContext:$ctx}}' 2>/dev/null || true
  exit 0
}
# indeterminado <motivo> [detalhe] — o hook não decide: avisa (silêncio em
# modo desligado) e deixa o Git seguir até o pre-push
indeterminado() {
  [ "$MODO" != desligado ] || exit 0
  sai_aviso "push indeterminado: $1" "mergex/pr-so-com-portao — aviso: o hook não determina este push ($1)

Comando: $CMD
${2:+
$2
}
O hook do Claude é só aviso antecipado e não bloqueia o que não consegue
provar. Quem decide é o pre-push do Git (portao-push.sh), na hora do push,
pelas refs e SHAs que o Git entrega. Se ele barrar, rode o E2 (/mergex-check)."
}

# --------------------------------------------------------------------------
# 2. O repositório do cwd, como o Git o lê (sem subir diretório à mão)
# --------------------------------------------------------------------------
ERR_RAIZ="$(git -C "$CWD" rev-parse --show-toplevel 2>&1 >/dev/null)"
RAIZ="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null | tr -d '\r')" || RAIZ=""

# --------------------------------------------------------------------------
# 3. `--no-verify` reconhecido: bloqueia em qualquer modo
# --------------------------------------------------------------------------
barra_nv() {
  sai_barra "push com --no-verify" "mergex/pr-so-com-portao — push com --no-verify barrado

Comando: $CMD

\`--no-verify\` faz o Git pular o pre-push, e o pre-push é a barreira local
que confere o portão de prontidão (portao-push.sh) para cada ref enviada.
Pular essa conferência é contorno da barreira; contra ele, o check de CI do
portão (portao-ci.sh), onde o produto o tiver ativado com proteção de merge,
reprova o PR. O hook barra o \`--no-verify\` em qualquer modo.

O que fazer:
  - Rode o mesmo push sem --no-verify.
  - Se o pre-push barrar, rode o E2 (/mergex-check): PRONTO libera o push."
}
if nv_publica; then barra_nv; fi # guarda:HKNV

if [ -z "$RAIZ" ]; then
  case "$ERR_RAIZ" in
    *'dubious ownership'*|*safe.directory*)
      indeterminado "o Git recusou o repositório do cwd: dubious ownership" \
"O Git não lê '$CWD' sem uma exceção de safe.directory (repositório de
outro dono; no Git for Windows, todo caminho \\\\wsl.localhost\\...). A
exceção na config global é pré-requisito do pre-push no Git for Windows:
sem ela, o Git não roda nem o push nem o pre-push nesse repositório.
  git config --global --add safe.directory '<caminho do repositório>'" ;;
    *) indeterminado "o cwd não é um repositório que o Git leia" \
"cwd: $CWD" ;;
  esac
fi

# --------------------------------------------------------------------------
# 4. A regra compartilhada e o modo
# --------------------------------------------------------------------------
# shellcheck source=../../skills/mergex/scripts/portao-regras.sh
if [ ! -r "$REGRAS" ] || ! . "$REGRAS" 2>/dev/null; then
  indeterminado "regras do portão indisponíveis" "portao-regras.sh ausente ou ilegível ao lado dos hooks: $REGRAS"
fi
set +e
MODO="$(pr_modo_null "$RAIZ" 2>/dev/null)"
export GIT_OPTIONAL_LOCKS=0

# --------------------------------------------------------------------------
# 5. O push simples, lido sem ambiguidade
# --------------------------------------------------------------------------
case "$CMD" in *$'\n'*) indeterminado "comando com mais de uma linha" ;; esac
# Sem `-q`, por uniformidade com os demais hooks (sob `pipefail`, um grep que sai
# cedo dá SIGPIPE ao printf e o pipeline devolve 141 — rodada extra da revisão).
printf '%s\n' "$CMD" | grep -E '^[[:space:]]*git[[:space:]]+push([[:space:]]+[A-Za-z0-9._/:@+=,^~%-]+)*[[:space:]]*$' >/dev/null \
  || indeterminado "comando composto, com expansão, opção global, prefixo de ambiente ou outro programa"

g() { git -C "$RAIZ" "$@"; }

# Opções do push que não mudam quais refs sobem; qualquer outra é indeterminada
REMOTO=""; TEM_REMOTO=0; SPECS=()
set -f
# shellcheck disable=SC2086
set -- $CMD
set +f
shift 2
FIM=0
while [ "$#" -gt 0 ]; do
  T="$1"; shift
  case "$T" in '~'*) indeterminado "palavra com expansão de til: $T" ;; esac
  if [ "$FIM" = 0 ]; then
    case "$T" in
      --) FIM=1; continue ;;
      -u|--set-upstream|-v|--verbose|-q|--quiet|--progress|--no-progress|--atomic|--no-atomic|--porcelain|\
      -4|-6|--ipv4|--ipv6|-f|--force|--force-if-includes|--no-force-if-includes|--force-with-lease|\
      --force-with-lease=*|--no-force-with-lease|--verify|--follow-tags|--no-follow-tags|--thin|--no-thin|--push-option=*)
        continue ;;
      -o|--push-option) [ "$#" -gt 0 ] || indeterminado "opção sem valor: $T"; shift; continue ;;
      --*) indeterminado "opção do push que muda as refs enviadas ou não é lida pelo hook: $T" ;;
      -*)
        # aglomerado curto: `-uv`; terminado em `o`, o valor vem a seguir
        C="${T#-}"
        if printf '%s' "$C" | grep -E '^[uvqf46]+$' >/dev/null; then continue; fi
        if printf '%s' "$C" | grep -E '^[uvqf46]*o$' >/dev/null; then
          [ "$#" -gt 0 ] || indeterminado "opção sem valor: $T"; shift; continue
        fi
        if printf '%s' "$C" | grep -E '^[uvqf46]*o.+$' >/dev/null; then continue; fi
        indeterminado "opção do push não lida pelo hook: $T" ;;
    esac
  fi
  if [ "$TEM_REMOTO" = 0 ]; then TEM_REMOTO=1; REMOTO="$T"; continue; fi
  SPECS[${#SPECS[@]}]="$T"
done
: "$REMOTO"

# Config que muda o destino (remote.<r>.push, remote.<r>.mirror): indeterminado
if [ -n "$(g config --get-regexp '^remote\..*\.(push|mirror)$' 2>/dev/null)" ]; then
  indeterminado "remote.<nome>.push ou remote.<nome>.mirror configurado: o destino depende da config"
fi

ATUAL="$(g symbolic-ref -q HEAD 2>/dev/null)" || ATUAL=""
case "$ATUAL" in refs/heads/?*) ;; *) ATUAL="" ;; esac

# sha_de <revisão> — o commit, sem aviso de ambiguidade do Git
sha_de() {
  local e s
  e="$(g rev-parse --verify -q "$1^{commit}" 2>&1 >/dev/null)"
  s="$(g rev-parse --verify -q "$1^{commit}" 2>/dev/null)" || return 1
  [ -z "$e" ] || return 1
  printf '%s\n' "$s"
}
existe_ref() { g show-ref --verify -q "$1" 2>/dev/null; }

ARGS=()   # <ref local> <SHA local> <ref remota> <SHA remoto>, por ref
ZERO_SHA=0000000000000000000000000000000000000000
ref_enviada() { # <ref local> <sha> <ref remota>
  g check-ref-format "$3" 2>/dev/null || indeterminado "destino que não é nome de ref válido: $3"
  ARGS[${#ARGS[@]}]="$1"; ARGS[${#ARGS[@]}]="$2"; ARGS[${#ARGS[@]}]="$3"; ARGS[${#ARGS[@]}]="$ZERO_SHA"
}

if [ "${#SPECS[@]}" = 0 ]; then
  # Sem refspec: a branch atual, pelo push.default
  [ -n "$ATUAL" ] || indeterminado "push sem refspec fora de uma branch (HEAD destacado)"
  B="${ATUAL#refs/heads/}"
  PD="$(g config --get push.default 2>/dev/null)"
  case "$PD" in
    ''|simple|current) DST="$ATUAL" ;;
    upstream|tracking)
      DST="$(g config --get "branch.$B.merge" 2>/dev/null)"
      case "$DST" in refs/heads/?*) ;; *) indeterminado "push.default=$PD sem upstream de branch para $B" ;; esac ;;
    *) indeterminado "push.default=$PD: as refs enviadas dependem da config" ;;
  esac
  S="$(sha_de "$ATUAL")" || indeterminado "a ponta de $ATUAL não se resolve"
  ref_enviada "$ATUAL" "$S" "$DST"
fi

for R in ${SPECS[@]+"${SPECS[@]}"}; do
  R="${R#+}"
  case "$R" in
    *:*:*|*:) indeterminado "refspec que o hook não lê: $R" ;;
    :*) continue ;;                       # exclusão: não publica código
    *:*) SRC="${R%%:*}"; DST="${R#*:}" ;;
    *) SRC="$R"; DST="" ;;
  esac
  # a origem: branch, tag ou commit, sem ambiguidade
  TIPO=""; RL=""; SL=""
  case "$SRC" in
    HEAD|@)
      [ -n "$ATUAL" ] || indeterminado "origem HEAD fora de uma branch"
      TIPO=branch; RL="$ATUAL" ;;
    refs/heads/?*) existe_ref "$SRC" || indeterminado "a origem não existe: $SRC"; TIPO=branch; RL="$SRC" ;;
    refs/tags/?*) TIPO=tag ;;
    refs/*) indeterminado "origem fora de refs/heads e refs/tags: $SRC" ;;
    *)
      N=0; ULT=""
      for C in "refs/$SRC" "refs/tags/$SRC" "refs/heads/$SRC" "refs/remotes/$SRC" "refs/remotes/$SRC/HEAD"; do
        if existe_ref "$C"; then N=$((N + 1)); ULT="$C"; fi
      done
      if [ "$N" -gt 1 ]; then indeterminado "origem ambígua: $SRC"
      elif [ "$N" = 1 ] && [ "$ULT" = "refs/heads/$SRC" ]; then TIPO=branch; RL="$ULT"
      elif [ "$N" = 1 ] && [ "$ULT" = "refs/tags/$SRC" ]; then TIPO=tag
      elif [ "$N" = 1 ]; then indeterminado "origem fora de refs/heads e refs/tags: $ULT"
      else TIPO=commit; RL="$SRC"
      fi ;;
  esac
  if [ "$TIPO" = tag ]; then
    case "$DST" in ''|refs/tags/*) continue ;; esac
    indeterminado "tag empurrada para outro destino: $R"
  fi
  if [ "$TIPO" = commit ]; then
    SL="$(sha_de "$SRC")" || indeterminado "a origem não se resolve num commit: $SRC"
  else
    SL="$(sha_de "$RL")" || indeterminado "a origem não se resolve num commit: $SRC"
  fi
  # o destino
  case "$DST" in
    '') [ "$TIPO" = branch ] || indeterminado "origem sem destino explícito: $R"
        RR="$RL" ;;
    refs/heads/?*) RR="$DST" ;;
    refs/*) continue ;;                   # fora de refs/heads: não aplicável
    HEAD|@) indeterminado "destino HEAD: $R" ;;
    *) RR="refs/heads/$DST" ;;
  esac
  ref_enviada "$RL" "$SL" "$RR"
done

[ "${#ARGS[@]}" -gt 0 ] || exit 0

# --------------------------------------------------------------------------
# 6. A decisão de pr_decide_ref, dentro do orçamento
# --------------------------------------------------------------------------
# timeout_funcional — o `timeout` mata um processo dentro do prazo (detecção
# pelo comportamento, como orcamento() de ativacao-pre-push.sh): `timeout 0.2
# sleep 3` tem de sair 124 em menos de 2 s.
TBIN=""
timeout_funcional() {
  local b ini rc
  for b in timeout gtimeout; do
    command -v "$b" >/dev/null 2>&1 || continue
    ini=$SECONDS; "$b" 0.2 sleep 3 >/dev/null 2>&1; rc=$?
    if [ "$rc" = 124 ] && [ $((SECONDS - ini)) -lt 2 ]; then TBIN="$b"; return 0; fi
  done
  return 1
}
timeout_funcional || indeterminado "sem \`timeout\` funcional para limitar a validade"
# um segundo de folga pela granularidade de SECONDS: o hook inteiro cabe no
# orçamento
LIMITE=$((ORCAMENTO - 1 - SECONDS))
[ "$LIMITE" -ge 1 ] || indeterminado "o orçamento de ${ORCAMENTO} s acabou antes da validade"

TMPH="$(mktemp -d "${TMPDIR:-/tmp}/mergex-hook-portao.XXXXXX" 2>/dev/null)" || { TMPH=""; indeterminado "temporário que não se cria"; }

# O processo filho decide cada ref com pr_decide_ref, num TMPDIR próprio (o
# hook apaga tudo no fim, mesmo depois de um estouro)
DECIDE='
. "$1" 2>/dev/null || { printf "erro=regras\n"; exit 3; }
set +e
arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0
raiz="$2"; shift 2
t="$TMPDIR/decisao"
while [ "$#" -ge 4 ]; do
  pr_decide_ref "$raiz" "$1" "$2" "$3" "$4" > "$t" 2>/dev/null
  printf "ref=%s\nsha=%s\n" "$3" "$2"
  cat "$t"
  printf "diag=%s\n" "$(printf "%s" "$PR_DIAG" | tr "\n" " ")"
  shift 4
done
'
SAIDA="$(cd "$RAIZ" 2>/dev/null && TMPDIR="$TMPH" "$TBIN" -k 1 "$LIMITE" bash -c "$DECIDE" _ "$REGRAS" "$RAIZ" "${ARGS[@]}" 2>/dev/null)"; RC=$?
case "$RC" in
  0) ;;
  124|137) indeterminado "a validade do portão não terminou dentro do orçamento de ${ORCAMENTO} s" ;;
  *) indeterminado "a decisão do portão não se calculou (código $RC)" ;;
esac

BARRA=""; AVISA=""; INDET=""
REF_=""; SHA_=""; DEC_=""; MOT_=""
fecha_ref() {
  [ -n "$REF_" ] || return 0
  case "$DEC_" in
    passa) ;;
    avisa) AVISA="$AVISA
  - $REF_ ($SHA_): $DIAG_" ;;
    barra)
      case "$MOT_" in
        erro_ambiente|entrega_indeterminada|'') INDET="$INDET
  - $REF_ ($SHA_): $DIAG_" ;;
        *) BARRA="$BARRA
  - $REF_ ($SHA_): $DIAG_" ;;
      esac ;;
    *) INDET="$INDET
  - $REF_ ($SHA_): decisão indeterminada" ;;
  esac
}
DIAG_=""
while IFS= read -r L; do
  case "$L" in
    ref=*) fecha_ref; REF_="${L#ref=}"; SHA_=""; DEC_=""; MOT_=""; DIAG_="" ;;
    sha=*) SHA_="${L#sha=}" ;;
    decisao=*) DEC_="${L#decisao=}" ;;
    motivo=*) MOT_="${L#motivo=}" ;;
    diag=*) DIAG_="${L#diag=}" ;;
  esac
done <<EOF
$SAIDA
EOF
fecha_ref
N_DEC="$(printf '%s\n' "$SAIDA" | grep -c '^decisao=')"
[ "$N_DEC" -eq $(( ${#ARGS[@]} / 4 )) ] || indeterminado "a decisão do portão saiu incompleta"

if [ -n "$BARRA" ]; then
  sai_barra "push com portao que nao vale" "mergex/pr-so-com-portao — push barrado: o portão não vale para o que seria publicado

Comando: $CMD
$BARRA

O hook leu este push sem ambiguidade e aplicou a mesma regra do pre-push
(portao-regras.sh -> validade-do-portao.sh --rev sobre o SHA enviado). O
pre-push barraria o mesmo push.

O portão roda as doze verificações (V1..V12): tasks concluídas, suíte verde,
dois testes por task, teste de regressão, QA, auditoria, bloqueios, modo legado,
arquivos fora do escopo, segredo no diff, commit do E1 por task concluída e
revisão por task aprovada.

O que fazer:
  - Rode o E2 de novo:  /mergex-check
  - PRONTO   → o push segue normalmente.
  - BLOQUEADO → a saída nomeia o que falta e onde corrigir."
fi

[ -z "$INDET" ] || indeterminado "a validade não decidiu por motivo do ambiente" "Refs:$INDET"

if [ -n "$AVISA" ]; then
  sai_aviso "push com portao null em modo aviso" "mergex/pr-so-com-portao — aviso: push antes do portão de prontidão

Comando: $CMD
$AVISA

O push segue (modo aviso de pr-so-com-portao). Rode o E2 (/mergex-check)
antes do PR: o portão roda as doze verificações (V1..V12)."
fi

exit 0
