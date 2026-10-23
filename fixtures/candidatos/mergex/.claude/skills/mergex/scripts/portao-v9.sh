#!/usr/bin/env bash
# portao-v9 — a V9 do portão de prontidão (E2), executável: arquivo alterado
# fora da lista declarada no plano, sobre a base validada por SHA.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 10; references/02-prontidao.md, V9.
#
# Uso:
#   portao-v9.sh --verificar [--planejamento] --entrega docs/entregas/<id>/ENTREGA.md \
#     --origem <sprintx|runx> --trabalho <id>
#
# --planejamento (a entrega do PR de planejamento, DM-259; quem decide é
# entrega-de-planejamento.sh): mesma base e mesmo diff, mas o conjunto aceito
# é só `^docs/(sprintx|entregas|eventos)/` (nem a união das tasks, nem os
# cobertos, nem submódulo); cada desvio sai `fora_do_planejamento<TAB><caminho>`.
# Com --no-renames, a origem de uma renomeação para docs/ conta como desvio.
# A opção não é confiada: o ENTREGA.md de HEAD tem de ser a entrega de
# planejamento (entrega-de-planejamento.sh); senão, v9_sem_prova.
#
# Só leitura: não grava no repositório, não adquire a trava C5, não exige
# stage vazio; os temporários (fora do repositório) saem em toda saída.
#
# 1. Base B, sempre um SHA (nunca o nome de uma ref, salvo no legado):
#    - com reconciliação (a cadeia RECONCILIACAO-BASE-NNN.md que
#      `reconciliacao-base.sh --verificar` aprova): o b1_sha da última, lido do
#      artefato que a verificação validou (o mesmo conteúdo antes e depois
#      dela) — origem_base=reconciliacao;
#    - sem reconciliação: o base_validada_sha do ENTREGA.md de HEAD (a versão
#      commitada; o do disco nunca alimenta a base: divergência vira uma linha
#      `aviso`) — origem_base = a origem_base de HEAD (registrada_e0 sem ela;
#      registrada_sprint depois da reancoragem do E0, abaixo);
#    - entrega legada (NENHUMA versão do ENTREGA.md alcançável de HEAD tem a
#      chave): `git merge-base --all HEAD <branch_base>` com exatamente um
#      resultado — origem_base=inferida_leitura, nunca gravada. Mais de um,
#      nenhum, branch_base inexistente ou fora da forma de branch (inclusive
#      `@...` e `@{`): v9_sem_prova.
#    Âncora, sem reconciliação: todas as versões do ENTREGA.md alcançáveis de
#    HEAD (`git rev-list --full-history HEAD -- <ENTREGA>`) que têm
#    base_validada_sha têm UM único valor, e HEAD tem a chave com esse valor.
#    Chave malformada (vazia, null, entre aspas) em qualquer versão, valores
#    diferentes, ou HEAD sem a chave que o histórico tem (rebaixamento a
#    legado): v9_sem_prova.
#    Reancoragem depois do PR de planejamento (DM-261): com a origem_base de
#    HEAD registrada_sprint, a entrega de HEAD tem de ter o merge do
#    planejamento registrado (entrega-de-planejamento.sh:
#    `planejamento_merge_sha=`), e esse merge P tem de ser ancestral da base.
#    A âncora passa a ser: toda versão registrada_sprint tem a base de HEAD;
#    as anteriores (registrada_e0 ou sem a chave) têm UMA base, ancestral de
#    P; e nenhuma versão de ordem anterior — inclusive uma revisão sem a chave —
#    descende de uma registrada_sprint (rebaixamento). Senão, ou sem o merge
#    registrado: v9_sem_prova.
#    Em qualquer origem, a base que já contém o trabalho é v9_sem_prova: a
#    própria HEAD; uma base da qual é ancestral algum commit de
#    ENTREGA.commits (de HEAD; entrada que não resolve para um único commit
#    também é v9_sem_prova), algum commit com `Trabalho: <id>` (mensagem lida
#    em UTF-8) ou algum commit que toca a pasta do trabalho ou
#    docs/entregas/<id>/. Com o merge do planejamento P registrado e
#    ancestral da base, as duas últimas guardas olham só `<base> ^P`: o que P
#    contém é o planejamento, desde que todo commit do trabalho alcançável de
#    P (com `Trabalho: <id>` ou tocando a pasta ou a entrega, e a diferença de
#    P para o 1º pai quando P é merge) só toque
#    `^docs/(sprintx|entregas|eventos)/`, e todo commit do intervalo do PR,
#    `base_sha..P` (a base do PR no merge, gravada pelo E9 no item de
#    planejamento; DM-269), também: o commit comum pelo que muda, o merge pelo
#    que muda por conta própria (`--cc`). Assim um rebase-merge ou ff não
#    esconde em `^P` um commit de produto sem a marca anterior ao último.
#    Item sem base_sha, base_sha fora da história ou que não é ancestral
#    própria de P: v9_sem_prova.
#    Riscos residuais conhecidos (limite de desenho; o Git local não
#    distingue):
#    - legado com a ref de base movida para um commit sem nenhuma dessas
#      marcas: aceito (a spec lê a ref nesse caso);
#    - âncora nascida errada: o ENTREGA.md já nasce com base_validada_sha num
#      commit só de produto (sem marca, sem tocar a pasta); todas as versões
#      concordam e a base é aceita (o E0 lê a ref). Inclui o ramo montado do
#      zero em que o ENTREGA.md nasce noutro caminho e é renomeado para o
#      canônico já com a base errada: `rev-list -- <caminho>` não segue
#      renomeação, e no caminho nunca houve outra versão;
#    - registro do merge do planejamento forjado: o intervalo conferido é o
#      que a entrega diz (`base_sha..merge_sha`, gravados pelo E9 a partir do
#      serviço); uma base_sha gravada depois da base real deixa fora do
#      intervalo o que veio antes dela. E a base reancorada pode ser qualquer
#      descendente de P (o E0 a lê da ref buscada);
#    - B1 lateral: com reconciliação, a cadeia nunca reconfere b1_sha contra a
#      base real; um B1 forjado (descende de B0, traz produto, a ref movida no
#      registro) desloca a base.
#    Repositório raso (`git rev-parse --is-shallow-repository` true, ou um
#    arquivo `shallow` no diretório Git ou no comum; GIT_SHALLOW_FILE do
#    ambiente é descartado): v9_sem_prova com o motivo `repositório raso:
#    história incompleta`, antes de qualquer prova — o corte esconde versões
#    do ENTREGA.md e commits da base. Um clone raso legítimo (CI com
#    --depth) também falha fechado: rode `git fetch --unshallow` antes do E2.
# 2. Diff: `git diff --raw --no-renames --ignore-submodules=none B...HEAD` (os
#    caminhos de `--name-only`, com os modos), caminho exato (sem quoting).
# 3. Aceito, nesta ordem: a união de arquivos.cria + arquivos.altera de todas
#    as tasks do plano da árvore de HEAD (o plano do disco não conta); as
#    isenções de método (a pasta do trabalho resolvida em HEAD,
#    docs/entregas/<id>/ e, só na SprintX, docs/sprintx/estimativas/HISTORICO.md);
#    os caminhos `coberto` de `reconciliacao-base.sh --verificar`, só com
#    `ok=true` (ok=false é v9_sem_prova). Um submódulo (gitlink, 160000) só é
#    aceito pela união: nunca é isento nem coberto.
#
# Saída (stdout):
#   base=<oid-completo>
#   origem_base=<registrada_e0|registrada_sprint|inferida_legado|reconciliacao|inferida_leitura>
#   aviso<TAB><texto>                  (zero ou mais)
#   resultado=<ok|v9>
#   fora_do_plano<TAB><caminho>        (um por desvio, em ordem de byte;
#                                       fora_do_planejamento com --planejamento)
# ou, sem prova:
#   resultado=v9_sem_prova
#   motivo<TAB><texto>                 (um ou mais; com ok=false, seguido das
#                                       linhas `motivo` da verificação)
# Códigos: 0 ok; 1 v9; 3 v9_sem_prova; 64 uso. Nenhuma opção de força.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
OWNERSHIP_SH="$AQUI/ownership-da-task.sh"
ARTEFATO_SH="$AQUI/reconciliacao-artefato.sh"
RB_SH="$AQUI/reconciliacao-base.sh"
ARVORE_SH="$AQUI/reconciliacao-arvore.sh"
PREDECESSORES_SH="$AQUI/predecessores-sprintx.sh"
PLANEJAMENTO_SH="$AQUI/entrega-de-planejamento.sh"
g() { git -c core.quotepath=false "$@"; }

NL='
'
TAB='	'

uso() {
  [ -z "${1:-}" ] || printf 'portao-v9: %s\n' "$1" >&2
  printf '%s\n' 'uso: portao-v9.sh --verificar [--planejamento] --entrega docs/entregas/<id>/ENTREGA.md --origem <sprintx|runx> --trabalho <id>' >&2
  exit 64
}

TMP_DIR=""
encerrar() {
  local rc="$1"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  exit "$rc"
}
trap 'encerrar $?' EXIT
trap 'exit 3' HUP INT TERM

# sem_prova <motivo> [arquivo com linhas extras] — v9_sem_prova, rc 3
sem_prova() {
  printf 'resultado=v9_sem_prova\n'
  printf 'motivo\t%s\n' "$(printf '%s' "$1" | tr '\t\n\r' '   ')"
  [ -z "${2:-}" ] || [ ! -f "$2" ] || cat "$2"
  exit 3
}

MODO=""; ENTREGA=""; ORIGEM=""; TRABALHO=""; PLANEJAMENTO=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --planejamento) [ "$PLANEJAMENTO" = 0 ] || uso; PLANEJAMENTO=1; shift ;;
    --entrega) [ "$#" -ge 2 ] && [ -z "$ENTREGA" ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] && [ -z "$ORIGEM" ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] && [ -z "$TRABALHO" ] || uso; TRABALHO="$2"; shift 2 ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done
[ "$MODO" = verificar ] || uso 'falta --verificar'
case "$ORIGEM" in sprintx|runx) ;; *) uso "origem inválida: ${ORIGEM:-ausente}" ;; esac
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto)
    uso "trabalho inválido: ${TRABALHO:-ausente}" ;;
esac
# o PR de planejamento é da SprintX (fim da F5); a RunX não tem planejamento
[ "$PLANEJAMENTO" = 0 ] || [ "$ORIGEM" = sprintx ] || uso '--planejamento só com --origem sprintx (a runx não tem PR de planejamento)'
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
[ "$ENTREGA" = "docs/entregas/$TRABALHO/ENTREGA.md" ] || uso "--entrega deve ser docs/entregas/$TRABALHO/ENTREGA.md"

for dependencia in "$CATALOGO_SH" "$OWNERSHIP_SH" "$ARTEFATO_SH" "$RB_SH" "$ARVORE_SH" "$PREDECESSORES_SH" "$PLANEJAMENTO_SH"; do
  [ -r "$dependencia" ] || sem_prova "dependência indisponível: $dependencia"
done
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
# shellcheck source=reconciliacao-artefato.sh
. "$ARTEFATO_SH"
# shellcheck source=reconciliacao-arvore.sh
. "$ARVORE_SH"
set +e

# O ambiente Git fixo de reconciliacao-arvore.sh (o mesmo do
# reconciliacao-base.sh) e nem o refresh oportunista do índice.
arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-v9.XXXXXX")" || { TMP_DIR=""; sem_prova 'não foi possível criar diretório temporário'; }
RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || sem_prova 'fora de um repositório Git'
cd "$RAIZ" || sem_prova "raiz inacessível: $RAIZ"
FORMATO_OBJETOS="$(git rev-parse --show-object-format 2>/dev/null)" || sem_prova 'formato de objetos Git ilegível'
case "$FORMATO_OBJETOS" in sha1) OID_LEN=40 ;; sha256) OID_LEN=64 ;; *) sem_prova "formato de objetos Git não suportado: $FORMATO_OBJETOS" ;; esac
oid_valido() { [ "${#1}" -eq "$OID_LEN" ] && case "$1" in *[!0-9a-f]*) return 1 ;; *) return 0 ;; esac; }
# história cortada não prova nada: antes de qualquer leitura de versão ou base
arvore_recusa_raso || sem_prova "$ARVORE_ERRO" # guarda:EST
HEAD_SHA="$(g rev-parse --verify -q 'HEAD^{commit}')" || sem_prova 'HEAD não é um commit'

# ---------------------------------------------------------------------------
# O ENTREGA.md de HEAD (a versão commitada): contexto e base.
# ---------------------------------------------------------------------------
modo_em() { g ls-tree -z "$1" -- "$2" 2>/dev/null | tr '\0' '\n' | sed -n '1s/ .*//p'; }

ENTREGA_H="$TMP_DIR/entrega-head.md"
case "$(modo_em "$HEAD_SHA" "$ENTREGA")" in
  100644|100755) g cat-file blob "$HEAD_SHA:$ENTREGA" > "$ENTREGA_H" 2>/dev/null || sem_prova "$ENTREGA ilegível em HEAD" ;;
  '') sem_prova "$ENTREGA ausente em HEAD (o E2 avalia o ENTREGA.md commitado)" ;;
  *) sem_prova "$ENTREGA não é arquivo regular em HEAD" ;;
esac
[ "$(catalogo_fm "$ENTREGA_H" kind)" = entrega ] || sem_prova "$ENTREGA de HEAD não declara kind: entrega"
[ "$(catalogo_fm "$ENTREGA_H" trabalho_id)" = "$TRABALHO" ] || sem_prova 'trabalho explícito diverge de ENTREGA.trabalho_id em HEAD'
[ "$(catalogo_fm "$ENTREGA_H" expx_tool)" = "$ORIGEM" ] || sem_prova 'origem explícita diverge de ENTREGA.expx_tool em HEAD'
# --planejamento não é confiado: a entrega de HEAD tem de ser a de planejamento
if [ "$PLANEJAMENTO" = 1 ]; then
  MARCA="$(bash "$PLANEJAMENTO_SH" --entrega "$ENTREGA_H" 2>&1)" || sem_prova "entrega de HEAD ilegível para entrega-de-planejamento.sh: $MARCA"
  case "$MARCA" in
    planejamento=sim*) ;;
    *) sem_prova '--planejamento numa entrega que não é a de planejamento (entrega-de-planejamento.sh em HEAD)' ;;
  esac
fi
# O merge do planejamento já registrado e retomado (DM-261): só a entrega de
# HEAD depois da retomada do E0 o diz (`planejamento_merge_sha=`)
M_PLAN=""
MARCA_H="$(bash "$PLANEJAMENTO_SH" --entrega "$ENTREGA_H" 2>&1)" \
  || sem_prova "entrega de HEAD ilegível para entrega-de-planejamento.sh: $MARCA_H" # guarda:V9PLAN
mp="$(printf '%s\n' "$MARCA_H" | sed -n 's/^planejamento_merge_sha=//p')"
B_PLAN_REG="$(printf '%s\n' "$MARCA_H" | sed -n 's/^planejamento_base_sha=//p')"
if [ -n "$mp" ]; then
  M_PLAN="$(g rev-parse --verify -q "$mp^{commit}" 2>/dev/null)" \
    || sem_prova "o merge do planejamento registrado ($mp) não é um commit deste repositório" # guarda:V9PLAN
fi

# ---------------------------------------------------------------------------
# A cadeia de reconciliação: `reconciliacao-base.sh --verificar`, com o
# ENTREGA.md e os artefatos do disco fotografados antes e conferidos depois (a
# base sai do artefato que a verificação validou).
# ---------------------------------------------------------------------------
DIR_E="docs/entregas/$TRABALHO"
mkdir -p "$TMP_DIR/antes" || sem_prova 'temporário inacessível'
foto() { # <destino> — `nome<TAB>sha256` do ENTREGA.md e de cada RECONCILIACAO-BASE-* do disco
  local arq
  : > "$1"
  for arq in "$ENTREGA" "$DIR_E"/RECONCILIACAO-BASE-*; do
    [ -e "$arq" ] || [ -L "$arq" ] || continue
    printf '%s\t%s\n' "${arq##*/}" "$(rb_sha256 < "$arq" 2>/dev/null)" >> "$1"
  done
}
foto "$TMP_DIR/foto-antes"
for arq in "$DIR_E"/RECONCILIACAO-BASE-[0-9][0-9][0-9].md; do
  [ -f "$arq" ] || continue
  cp "$arq" "$TMP_DIR/antes/${arq##*/}" 2>/dev/null || sem_prova "artefato ilegível: ${arq##*/}"
done

bash "$RB_SH" --verificar --entrega "$ENTREGA" --origem "$ORIGEM" --trabalho "$TRABALHO" > "$TMP_DIR/verificar" 2> "$TMP_DIR/verificar.err"
RC_VER=$?
foto "$TMP_DIR/foto-depois"
cmp -s "$TMP_DIR/foto-antes" "$TMP_DIR/foto-depois" || sem_prova 'o ENTREGA.md ou os artefatos de reconciliação mudaram durante a verificação'
[ "$(g rev-parse --verify -q 'HEAD^{commit}')" = "$HEAD_SHA" ] || sem_prova 'HEAD mudou durante a verificação'
if [ "$RC_VER" != 0 ] || [ "$(sed -n 1p "$TMP_DIR/verificar")" != ok=true ]; then # guarda:V9OK
  awk 'index($0, "motivo\t") == 1 { print "motivo\treconciliacao-base: " substr($0, 8) }' "$TMP_DIR/verificar" > "$TMP_DIR/motivos-ver"
  sem_prova "reconciliacao-base.sh --verificar ok=false (rc $RC_VER)$( [ -s "$TMP_DIR/verificar.err" ] && printf ': %s' "$(tr '\n' ' ' < "$TMP_DIR/verificar.err")")" "$TMP_DIR/motivos-ver"
fi
awk -F'\t' '$1 == "coberto" { print $2 }' "$TMP_DIR/verificar" > "$TMP_DIR/cobertos"

ULTIMO="$(ls "$TMP_DIR/antes" | LC_ALL=C sort | sed -n '$p')"
AVISOS="$TMP_DIR/avisos"; : > "$AVISOS"

# Sem reconciliação: o base_validada_sha de TODAS as versões do ENTREGA.md
# alcançáveis de HEAD (rev-list --full-history: sem simplificação de merge e sem
# depender de data nem de "qual commit o criou"). Chave presente e malformada,
# em qualquer versão: v9_sem_prova. VALORES fica com um valor por versão que
# tem a chave; SEM_BASE registra toda versão que não a tem, para a prova de que
# nenhuma delas veio depois de uma reancoragem. VALORES vazio, e só então, é legado.
VALORES="$TMP_DIR/valores"; : > "$VALORES"
SEM_BASE="$TMP_DIR/versoes-sem-base"; : > "$SEM_BASE"
if [ -z "$ULTIMO" ]; then
  g rev-list --full-history "$HEAD_SHA" -- "$ENTREGA" > "$TMP_DIR/versoes" 2>/dev/null \
    || sem_prova "histórico de $ENTREGA ilegível" # guarda:V9SHA
  while IFS= read -r cv <&3; do
    case "$(modo_em "$cv" "$ENTREGA")" in 100644|100755) ;; *) continue ;; esac
    g cat-file blob "$cv:$ENTREGA" > "$TMP_DIR/versao.md" 2>/dev/null || sem_prova "$ENTREGA ilegível em $cv"
    if ! _entrega_chave_qualquer "$TMP_DIR/versao.md" base_validada_sha; then
      printf '%s\n' "$cv" >> "$SEM_BASE"
      continue
    fi
    vv="$(catalogo_fm "$TMP_DIR/versao.md" base_validada_sha)"
    oid_valido "$vv" || sem_prova "$ENTREGA em $cv tem base_validada_sha malformada: ${vv:-vazia ou ilegível}"
    printf '%s\n' "$vv" >> "$VALORES"
    printf '%s\t%s\t%s\n' "$cv" "$vv" "$(catalogo_fm "$TMP_DIR/versao.md" origem_base)" >> "$TMP_DIR/versoes-info"
  done 3< "$TMP_DIR/versoes"
fi

if [ -n "$ULTIMO" ]; then
  # com reconciliação: o b1_sha da última, do artefato validado
  num="$(printf '%s' "$ULTIMO" | sed 's/^RECONCILIACAO-BASE-0*\([0-9][0-9]*\)\.md$/\1/')"
  RB_ERRO=""
  rb_validar "$TMP_DIR/antes/$ULTIMO" "$TRABALHO" "$num" || sem_prova "$ULTIMO inválido: $RB_ERRO"
  rb_ler "$TMP_DIR/antes/$ULTIMO" > "$TMP_DIR/ultimo.lido" || sem_prova "$ULTIMO ilegível: $RB_ERRO"
  B_CADEIA="$(awk -F'\t' '$1 == "escalar" && $2 == "b1_sha" { print $3; exit }' "$TMP_DIR/ultimo.lido")"
  BASE="$B_CADEIA"; ORIGEM_BASE=reconciliacao # guarda:V9SHA
elif [ -s "$VALORES" ]; then # guarda:V9SHA
  # sem reconciliação e com a chave no histórico: a base validada de HEAD,
  # nunca a do disco; HEAD sem a chave que o histórico tem é rebaixamento
  _entrega_chave_qualquer "$ENTREGA_H" base_validada_sha \
    || sem_prova "HEAD:$ENTREGA não tem base_validada_sha, que versões do histórico têm: rebaixamento a legado" # guarda:V9SHA
  B_HEAD="$(catalogo_fm "$ENTREGA_H" base_validada_sha)" # guarda:V9DISCO
  oid_valido "$B_HEAD" || sem_prova "base_validada_sha de HEAD não é OID completo: ${B_HEAD:-vazia ou ilegível}"
  case "$(catalogo_fm "$ENTREGA_H" origem_base)" in
    inferida_legado) OB_HEAD=inferida_legado ;;
    registrada_e0|'') OB_HEAD=registrada_e0 ;;
    registrada_sprint)
      [ -n "$M_PLAN" ] || sem_prova 'origem_base registrada_sprint sem o merge do planejamento registrado na entrega de HEAD' # guarda:V9PLAN
      OB_HEAD=registrada_sprint ;;
    *) sem_prova "origem_base de HEAD fora de registrada_e0|registrada_sprint|inferida_legado: $(catalogo_fm "$ENTREGA_H" origem_base)" ;;
  esac
  BASE="$B_HEAD"; ORIGEM_BASE="$OB_HEAD" # guarda:V9SHA
else
  # entrega legada (nenhuma versão alcançável tem a chave): merge-base único
  # com branch_base, só para esta leitura
  _entrega_chave_qualquer "$ENTREGA_H" base_validada_sha \
    && sem_prova "HEAD:$ENTREGA tem base_validada_sha fora do histórico de versões"
  BB="$(catalogo_fm "$ENTREGA_H" branch_base)"
  # @, @{-N}, @{upstream}: atalhos do reflog e da HEAD, nunca uma branch
  case "$BB" in @*|*@\{*) sem_prova "legado: branch_base inválida em HEAD: $BB" ;; esac # guarda:V9SHA
  { [ -n "$BB" ] && g check-ref-format --branch "$BB" >/dev/null 2>&1; } || sem_prova "legado: branch_base inválida em HEAD: ${BB:-ausente}"
  BB_SHA="$(g rev-parse --verify -q "$BB^{commit}" 2>/dev/null)" || sem_prova "legado: branch_base $BB inexistente"
  g merge-base --all "$HEAD_SHA" "$BB_SHA" > "$TMP_DIR/mb" 2>/dev/null || sem_prova "legado: nenhum merge-base entre HEAD e $BB"
  n="$(grep -c . "$TMP_DIR/mb")"
  [ "$n" = 1 ] || sem_prova "legado: $n merge-bases entre HEAD e $BB (a leitura exige exatamente um)"
  BASE="$(sed -n 1p "$TMP_DIR/mb")"; ORIGEM_BASE=inferida_leitura # guarda:V9SHA
fi
oid_valido "$BASE" || sem_prova "base fora do formato de objetos Git: ${BASE:-vazia}"
g cat-file -e "$BASE^{commit}" 2>/dev/null || sem_prova "base $BASE não é commit deste repositório"
# O planejamento mergeado que a base contém não é trabalho escondido nela: as
# guardas da história olham `<base> ^P` (o conteúdo de P é conferido depois,
# guarda:V9PLAN, com a pasta do trabalho resolvida)
# Entrega por sprint (DM-264): cada abertura de sprint reancora a base, então as
# versões registrada_sprint têm k bases, em cadeia (cada uma ancestral da
# seguinte); a de ordem r contém o merge do r-ésimo PR fechado de `prs` (o
# planejamento é o 1º), a de HEAD é a mais nova (r = k), e k nunca passa do
# número de PRs fechados. As guardas olham `<base> ^L`, L = o merge do k-ésimo.
L_SPRINT=""
if [ -n "$ULTIMO" ] && printf '%s\n' "$MARCA_H" | grep -qx 'entrega=por_sprint'; then
  # Com reconciliação, a cadeia já prova BASE (DM-266). L_SPRINT ainda precisa apontar
  # o último PR fechado: ele tem de ser ancestral de BASE e separa das guardas
  # o produto das sprints que a main já recebeu.
  printf '%s\n' "$MARCA_H" | awk -F'\t' '/^pr=/ && $2 == "merged" { print $3 }' > "$TMP_DIR/fechados"
  L_SPRINT="$(sed -n '$p' "$TMP_DIR/fechados")"
  [ -n "$L_SPRINT" ] || sem_prova 'entrega por_sprint reconciliada sem PR fechado que justifique a base' # guarda:V9PLAN
  g merge-base --is-ancestor "$L_SPRINT" "$BASE" 2>/dev/null \
    || sem_prova "o último PR fechado ($L_SPRINT) não é ancestral de BASE ($BASE) depois da reconciliação" # guarda:V9PLAN
elif [ -z "$ULTIMO" ] && [ -s "$VALORES" ] && [ "$ORIGEM_BASE" = registrada_sprint ]; then
  printf '%s\n' "$MARCA_H" | awk -F'\t' '/^pr=/ && $2 == "merged" { print $3 }' > "$TMP_DIR/fechados"
  awk -F'\t' '$3 == "registrada_sprint" { print $2 }' "$TMP_DIR/versoes-info" | LC_ALL=C sort -u > "$TMP_DIR/sprint-bases"
  k="$(grep -c . "$TMP_DIR/sprint-bases")"; nf="$(grep -c . "$TMP_DIR/fechados")"
  [ "$k" -le "$nf" ] \
    || sem_prova "as versões de $ENTREGA têm $k bases registrada_sprint e prs só $nf PR(s) fechado(s): registrada_sprint com outra base que nenhum merge justifica" # guarda:V9PLAN
  : > "$TMP_DIR/ranks"
  while IFS= read -r b <&4; do
    r=1
    while IFS= read -r o <&5; do
      [ "$o" = "$b" ] || ! g merge-base --is-ancestor "$o" "$b" 2>/dev/null || r=$((r + 1))
    done 5< "$TMP_DIR/sprint-bases"
    printf '%s\t%s\n' "$b" "$r" >> "$TMP_DIR/ranks"
  done 4< "$TMP_DIR/sprint-bases"
  [ "$(cut -f2 "$TMP_DIR/ranks" | LC_ALL=C sort -u | grep -c .)" = "$k" ] \
    || sem_prova "as bases registrada_sprint de $ENTREGA não formam uma cadeia (cada uma ancestral da seguinte): $(cut -f1 "$TMP_DIR/ranks" | tr '\n' ' ')" # guarda:V9PLAN
  [ "$(awk -F'\t' -v b="$BASE" '$1 == b { print $2 }' "$TMP_DIR/ranks")" = "$k" ] \
    || sem_prova "a base de HEAD ($BASE) não é a mais nova das bases registrada_sprint: registrada_sprint com outra base depois da de HEAD" # guarda:V9PLAN
  while IFS="$TAB" read -r b r <&4; do
    f="$(sed -n "${r}p" "$TMP_DIR/fechados")"
    if [ "$r" = 1 ]; then o="do planejamento $f"; else o="do PR fechado nº $r de prs ($f)"; fi
    g merge-base --is-ancestor "$f" "$b" 2>/dev/null \
      || sem_prova "origem_base registrada_sprint: a base $b não contém o merge $o" # guarda:V9PLAN
  done 4< "$TMP_DIR/ranks"
  L_SPRINT="$(sed -n "${k}p" "$TMP_DIR/fechados")"
fi
EXCL=""
if [ -n "$L_SPRINT" ]; then
  EXCL="^$L_SPRINT"
elif [ -n "$M_PLAN" ] && g merge-base --is-ancestor "$M_PLAN" "$BASE" 2>/dev/null; then
  EXCL="^$M_PLAN"
elif [ "$ORIGEM_BASE" = registrada_sprint ]; then
  sem_prova "origem_base registrada_sprint: a base $BASE não contém o merge do planejamento $M_PLAN" # guarda:V9PLAN
fi

# A base nunca contém o próprio trabalho: senão o diff esconde o que ele mudou.
[ "$BASE" != "$HEAD_SHA" ] || sem_prova "a base $BASE é o próprio HEAD: a base contém o trabalho" # guarda:V9SHA
# os valores `commit:` do bloco `commits` do ENTREGA.md de HEAD (só para esta
# guarda, que só fica mais estrita com mais SHAs; a leitura canônica da lista
# é a da V11, que este script não chama)
awk '
  { sub(/\r$/, "") }
  NR == 1 { next }
  /^---[ \t]*$/ { exit }
  /^[A-Za-z_][A-Za-z0-9_]*:/ { em = ($0 ~ /^commits:/); next }
  em && /^[ \t]*(-[ \t]+)?commit:[ \t]*/ {
    v = $0; sub(/^[ \t]*(-[ \t]+)?commit:[ \t]*/, "", v); gsub(/["\047 \t]/, "", v)
    if (v != "") print "-\t" v
  }
' "$ENTREGA_H" > "$TMP_DIR/commits" 2>/dev/null || sem_prova "ENTREGA.commits de HEAD ilegível"
while IFS="$TAB" read -r _ c <&3; do
  [ -n "$c" ] || continue
  # abreviação ambígua, SHA inexistente ou valor solto: a guarda não pula em silêncio
  cs="$(g rev-parse --verify -q "$c^{commit}" 2>/dev/null)" || sem_prova "ENTREGA.commits de HEAD: $c não resolve para um único commit" # guarda:V9SHA
  # o commit de uma sprint já mergeada (ou do planejamento) está no PR fechado que
  # as guardas descontam, `^L`: não é trabalho escondido na base
  if [ -n "$EXCL" ] && g merge-base --is-ancestor "$cs" "${EXCL#^}" 2>/dev/null; then
    continue
  fi
  if g merge-base --is-ancestor "$cs" "$BASE" 2>/dev/null; then
    sem_prova "a base $BASE contém o commit $cs de ENTREGA.commits: a base contém o trabalho" # guarda:V9SHA
  fi
done 3< "$TMP_DIR/commits"
TRAB_RE="$(printf '%s' "$TRABALHO" | sed 's/[.]/\\./g')"
c="$(g rev-list -n1 --encoding=UTF-8 --grep="^Trabalho: $TRAB_RE\$" "$BASE" $EXCL 2>/dev/null)" || sem_prova "histórico da base $BASE ilegível" # guarda:ENC
[ -z "$c" ] || sem_prova "a base $BASE contém o commit $c com Trabalho: $TRABALHO: a base contém o trabalho" # guarda:V9SHA

# (a) sem reconciliação, a base é uma só em todas as versões do ENTREGA.md que a
# têm, e é a de HEAD: a spec só deixa a chave mudar por reconciliação (que traz
# a cadeia, ancorada)
if [ -z "$ULTIMO" ] && [ -s "$VALORES" ] && [ "$ORIGEM_BASE" = registrada_sprint ]; then
  # reancorada pelo E0 depois do planejamento (DM-261) e a cada sprint (DM-264):
  # a cadeia das bases registrada_sprint já foi conferida acima; aqui, a base de
  # antes da primeira reancoragem e o rebaixamento
  # anterior é só registrada_e0 (ou sem a chave, como o E0 a lê): outra origem não vale
  awk -F'\t' '$3 != "registrada_sprint" && $3 != "registrada_e0" && $3 != "" { print $1 "\t" $3; exit }' "$TMP_DIR/versoes-info" > "$TMP_DIR/origem-outra"
  [ ! -s "$TMP_DIR/origem-outra" ] \
    || sem_prova "a versão de $ENTREGA em $(cut -f1 "$TMP_DIR/origem-outra") tem origem_base $(cut -f2 "$TMP_DIR/origem-outra"), fora de registrada_e0|registrada_sprint" # guarda:V9PLAN
  awk -F'\t' '$3 != "registrada_sprint" { print $2 }' "$TMP_DIR/versoes-info" | LC_ALL=C sort -u > "$TMP_DIR/distintos"
  n="$(grep -c . "$TMP_DIR/distintos")"
  [ "$n" = 1 ] || sem_prova "as versões de $ENTREGA anteriores à reancoragem têm $n bases ($(tr '\n' ' ' < "$TMP_DIR/distintos")): a base anterior não é uma só" # guarda:V9PLAN
  g merge-base --is-ancestor "$(sed -n 1p "$TMP_DIR/distintos")" "$M_PLAN" 2>/dev/null \
    || sem_prova "a base anterior à reancoragem ($(sed -n 1p "$TMP_DIR/distintos")) não é ancestral do merge do planejamento $M_PLAN" # guarda:V9PLAN
  # rebaixamento: uma versão de ordem menor (0 antes da reancoragem; r, a da sua
  # base registrada_sprint; 0 também para uma revisão sem a chave) que descende
  # de uma de ordem maior
  awk -F'\t' 'NR == FNR { r[$1] = $2; next } { print $1 "\t" (($3 == "registrada_sprint") ? r[$2] : 0) }' \
    "$TMP_DIR/ranks" "$TMP_DIR/versoes-info" > "$TMP_DIR/v-ordem"
  awk '{ print $1 "\t0" }' "$SEM_BASE" >> "$TMP_DIR/v-ordem"
  # Uma travessia pais-antes-dos-filhos propaga a maior ordem registrada em
  # qualquer ancestral. Assim cada aresta é examinada uma vez; não se abre um
  # processo Git para cada par de versões da entrega.
  g rev-list --reverse --topo-order --parents "$HEAD_SHA" > "$TMP_DIR/grafo-versoes" 2>/dev/null \
    || sem_prova "histórico de $HEAD_SHA ilegível ao conferir rebaixamento" # guarda:V9PLAN
  awk -F'\t' '
    NR == FNR {
      ordem[$1] = $2 + 0
      versao[$1] = 1
      next
    }
    {
      n = split($0, no, " ")
      atual = no[1]
      maior = 0
      origem = ""
      for (i = 2; i <= n; i++) {
        pai = no[i]
        if (maximo[pai] > maior) {
          maior = maximo[pai]
          origem = fonte[pai]
        }
      }
      if (versao[atual] && maior > ordem[atual]) {
        print atual "\t" origem
        exit
      }
      if (versao[atual] && ordem[atual] >= maior) {
        maximo[atual] = ordem[atual]
        fonte[atual] = atual
      } else {
        maximo[atual] = maior
        fonte[atual] = origem
      }
    }
  ' "$TMP_DIR/v-ordem" "$TMP_DIR/grafo-versoes" > "$TMP_DIR/rebaixamento"
  if [ -s "$TMP_DIR/rebaixamento" ]; then
    va="$(cut -f1 "$TMP_DIR/rebaixamento")"
    vs="$(cut -f2 "$TMP_DIR/rebaixamento")"
    sem_prova "a versão de $ENTREGA em $va volta a uma base anterior depois da reancoragem em $vs: rebaixamento" # guarda:V9PLAN
  fi
elif [ -z "$ULTIMO" ] && [ -s "$VALORES" ]; then
  LC_ALL=C sort -u "$VALORES" > "$TMP_DIR/distintos"
  n="$(grep -c . "$TMP_DIR/distintos")"
  [ "$n" = 1 ] || sem_prova "as versões de $ENTREGA no histórico de HEAD têm $n bases diferentes ($(tr '\n' ' ' < "$TMP_DIR/distintos")): a base não é uma só" # guarda:V9SHA
  [ "$BASE" = "$(sed -n 1p "$TMP_DIR/distintos")" ] \
    || sem_prova "a base de HEAD ($BASE) diverge da do histórico de $ENTREGA ($(sed -n 1p "$TMP_DIR/distintos"))" # guarda:V9SHA
fi

# sem reconciliação: o disco que diverge de HEAD é relatado, nunca usado
if [ -z "$ULTIMO" ]; then
  if [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ]; then b_disco="$(catalogo_fm "$ENTREGA" base_validada_sha)"; else b_disco=""; fi
  b_head="$(catalogo_fm "$ENTREGA_H" base_validada_sha)"
  [ "$b_disco" = "$b_head" ] || printf 'aviso\tbase_validada_sha do disco (%s) diverge da de HEAD:%s (%s); vale a de HEAD\n' \
    "${b_disco:-ausente}" "$ENTREGA" "${b_head:-ausente}" >> "$AVISOS"
fi

# ---------------------------------------------------------------------------
# O plano de HEAD: a pasta do trabalho materializada blob por blob (as três
# candidatas), para a união das tasks e a pasta isenta.
# ---------------------------------------------------------------------------
# (reconciliacao-arvore.sh, as mesmas guardas do registro; sem subshell)
arvore_materializa "$HEAD_SHA" "$TMP_DIR/arvore-head" "$ORIGEM" "$TRABALHO" HEAD '' || sem_prova "$ARVORE_ERRO"
RAIZ_H="$ARVORE_RAIZ"
PASTA="$ARVORE_PASTA"
# (b) nenhum commit que toca a pasta do trabalho ou a entrega é da base.
# --full-history, como nas versões do ENTREGA.md acima (e no CIFULL2 de
# portao-regras.sh): a simplificação de histórico com pathspec segue o pai
# TREESAME e esconderia o 2º pai de um merge que descartou a pasta (-s ours,
# resolução que ficou com o lado da base); a árvore da base não a tem, só a
# história — e esta guarda é sobre a história.
c="$(g rev-list -n1 --full-history "$BASE" $EXCL -- "$PASTA" "$DIR_E" 2>/dev/null)" || sem_prova "histórico da base $BASE ilegível" # guarda:V9FULL
[ -z "$c" ] || sem_prova "a base $BASE contém o commit $c, que toca a pasta do trabalho ou a entrega: a base contém o trabalho" # guarda:V9SHA
# (c) o que as guardas descontaram (P e o que ele contém) é só planejamento:
# todo commit do trabalho alcançável de P, e a diferença de P para o 1º pai
# quando P é merge, só toca os artefatos de método
so_metodo() { # <arquivo -z de caminhos> — o primeiro caminho fora deles, se houver
  tr '\0' '\n' < "$1" | awk '!/^docs\/(sprintx|entregas|eventos)\// && $0 != "" { print; exit }'
}
if [ -n "$EXCL" ]; then
  { g rev-list --no-merges --full-history "$M_PLAN" -- "$PASTA" "$DIR_E" \
    && g rev-list --no-merges --encoding=UTF-8 --grep="^Trabalho: $TRAB_RE\$" "$M_PLAN"; } > "$TMP_DIR/do-plan" 2>/dev/null \
    || sem_prova "histórico do merge do planejamento $M_PLAN ilegível" # guarda:V9PLAN
  while IFS= read -r cpl <&3; do
    g diff-tree -r -z --root --no-commit-id --name-only --no-renames "$cpl" > "$TMP_DIR/do-plan.nomes" 2>/dev/null \
      || sem_prova "commit $cpl do planejamento ilegível" # guarda:V9PLAN
    fora_p="$(so_metodo "$TMP_DIR/do-plan.nomes")"
    [ -z "$fora_p" ] || sem_prova "o commit $cpl do trabalho, contido no merge do planejamento $M_PLAN, toca $fora_p: o planejamento só leva docs/sprintx, docs/entregas e docs/eventos" # guarda:V9PLAN
  done 3< "$TMP_DIR/do-plan"
  if g rev-parse --verify -q "$M_PLAN^2" >/dev/null 2>&1; then
    g diff -z --name-only --no-renames "$M_PLAN^1" "$M_PLAN" > "$TMP_DIR/do-plan.nomes" 2>/dev/null \
      || sem_prova "diferença do merge do planejamento $M_PLAN ilegível" # guarda:V9PLAN
    fora_p="$(so_metodo "$TMP_DIR/do-plan.nomes")"
    [ -z "$fora_p" ] || sem_prova "o merge do planejamento $M_PLAN traz $fora_p: o planejamento só leva docs/sprintx, docs/entregas e docs/eventos" # guarda:V9PLAN
  fi
  # o intervalo do PR de planejamento, base_sha..P (DM-269): no rebase-merge e no
  # fast-forward, P é só o último commit; os de antes, com ou sem a marca, também
  # são do PR. Commit comum: o que ele muda; merge: o que ele muda por conta
  # própria (--cc), porque o que vem dos pais já é um commit do intervalo ou da base
  case "$B_PLAN_REG" in
    ''|null) sem_prova "o merge do planejamento $M_PLAN está registrado sem base_sha (a base do PR no merge): rode o E9, que a lê no serviço" ;; # guarda:V9PLAN
  esac
  B_PLAN="$(g rev-parse --verify -q "$B_PLAN_REG^{commit}" 2>/dev/null)" \
    || sem_prova "a base_sha do PR de planejamento ($B_PLAN_REG) não é um commit deste repositório" # guarda:V9PLAN
  [ "$B_PLAN" != "$M_PLAN" ] && g merge-base --is-ancestor "$B_PLAN" "$M_PLAN" 2>/dev/null \
    || sem_prova "a base_sha do PR de planejamento ($B_PLAN) não é ancestral própria do merge $M_PLAN" # guarda:V9PLAN
  B_PLAN_PROVADO="$(g rev-parse --verify -q "$M_PLAN^1" 2>/dev/null)" \
    || sem_prova "o merge do planejamento $M_PLAN não tem pai que comprove a base do PR" # guarda:V9PLAN
  [ "$B_PLAN" = "$B_PLAN_PROVADO" ] \
    || sem_prova "a base_sha do PR de planejamento ($B_PLAN) não é a base comprovável pelo pai do merge $M_PLAN ($B_PLAN_PROVADO); histórico linear com vários commits não é verificável offline" # guarda:V9PLAN

  g rev-list --parents "$B_PLAN..$M_PLAN" > "$TMP_DIR/intervalo" 2>/dev/null \
    || sem_prova "intervalo $B_PLAN..$M_PLAN do PR de planejamento ilegível" # guarda:V9PLAN
  while read -r cpl _pai1 pai2 _ <&3; do
    if [ -n "${pai2:-}" ]; then
      g diff-tree -r -z --cc --no-commit-id --name-only "$cpl" > "$TMP_DIR/do-plan.nomes" 2>/dev/null
    else
      g diff-tree -r -z --root --no-commit-id --name-only --no-renames "$cpl" > "$TMP_DIR/do-plan.nomes" 2>/dev/null
    fi || sem_prova "commit $cpl do PR de planejamento ilegível" # guarda:V9PLAN
    fora_p="$(so_metodo "$TMP_DIR/do-plan.nomes")"
    [ -z "$fora_p" ] || sem_prova "o commit $cpl do PR de planejamento ($B_PLAN..$M_PLAN) toca $fora_p: o planejamento só leva docs/sprintx, docs/entregas e docs/eventos" # guarda:V9PLAN
  done 3< "$TMP_DIR/intervalo"
fi
# O planejamento não aceita pela união: nada de produto entra nele.
: > "$TMP_DIR/uniao"
[ "$PLANEJAMENTO" = 1 ] || bash "$OWNERSHIP_SH" --uniao "$RAIZ_H" "$ORIGEM" "$TRABALHO" > "$TMP_DIR/uniao" 2> "$TMP_DIR/uniao.err" \
  || sem_prova "união das tasks de HEAD não calculável: $(tr '\n' ' ' < "$TMP_DIR/uniao.err")" # guarda:V9UNIAO

# ---------------------------------------------------------------------------
# Predecessores SprintX: protocolo fechado, validado por conteúdo E por rc.
# A ausência preserva a V9 histórica; RunX não tem este artefato.
# ---------------------------------------------------------------------------
: > "$TMP_DIR/predecessores-aceitos"
: > "$TMP_DIR/predecessores-vistos"
: > "$TMP_DIR/predecessores-fora"
if [ "$ORIGEM" = sprintx ] && [ "$PLANEJAMENTO" = 0 ]; then
  bash "$PREDECESSORES_SH" --verificar --rev "$HEAD_SHA" --trabalho "$TRABALHO" \
    > "$TMP_DIR/predecessores.out" 2> "$TMP_DIR/predecessores.err"
  RC_PRE=$?
  RESULTADOS="$(grep -c '^resultado=' "$TMP_DIR/predecessores.out" 2>/dev/null)"
  RESULTADO="$(sed -n 's/^resultado=//p' "$TMP_DIR/predecessores.out")"
  PRE_N=0; FORA_N=0; MOTIVO_N=0; INVALIDA=0
  [ "$RESULTADOS" = 1 ] || INVALIDA=1
  while IFS="$TAB" read -r tipo a b c extra; do
    case "$tipo" in
      resultado=*) [ -z "$a$b$c$extra" ] || INVALIDA=1 ;;
      predecessor)
        case "$a" in
          ''|/*|[A-Za-z]:/*|./*|*/./*|*/.|../*|*/../*|*/..|*//*|*\\*|*\**|*\?*|*\[*|*\]*) INVALIDA=1 ;;
          docs/sprintx/features/"$TRABALHO"/*|docs/entregas/"$TRABALHO"/*) INVALIDA=1 ;;
        esac
        case "$a" in docs/superpowers/*) ;; *) INVALIDA=1 ;; esac
        case "$a" in *': '*|*:|*' #'*|*$'\t'*|*$'\n'*|*$'\r'*) INVALIDA=1 ;; esac
        LC_ALL=C
        case "$a" in *[!\ -~]*|*' ') INVALIDA=1 ;; esac
        grep -Fqx "$a" "$TMP_DIR/predecessores-vistos" && INVALIDA=1
        printf '%s\n' "$a" >> "$TMP_DIR/predecessores-vistos"
        oid_valido "$b" || INVALIDA=1
        oid_valido "$c" || INVALIDA=1
        [ -z "$extra" ] || INVALIDA=1
        PRE_N=$((PRE_N + 1)); printf '%s\n' "$a" >> "$TMP_DIR/predecessores-aceitos" ;;
      fora_do_plano)
        [ -n "$a" ] && [ "$b" = blob_divergente ] && [ -z "$c$extra" ] || INVALIDA=1
        FORA_N=$((FORA_N + 1)); printf 'fora_do_plano\t%s\tblob_divergente\n' "$a" >> "$TMP_DIR/predecessores-fora" ;;
      motivo)
        [ -n "$a" ] && [ -z "$b$c$extra" ] || INVALIDA=1
        MOTIVO_N=$((MOTIVO_N + 1)) ;;
      '') [ -z "$a$b$c$extra" ] || INVALIDA=1 ;;
      *) INVALIDA=1 ;;
    esac
  done < "$TMP_DIR/predecessores.out"
  case "$RESULTADO:$RC_PRE" in
    ausente:0) [ "$PRE_N:$FORA_N:$MOTIVO_N" = 0:0:0 ] || INVALIDA=1 ;;
    ok:0) [ "$PRE_N" -ge 1 ] && [ "$FORA_N:$MOTIVO_N" = 0:0 ] || INVALIDA=1 ;;
    v9:1) [ "$FORA_N" -ge 1 ] && [ "$MOTIVO_N" = 0 ] || INVALIDA=1 ;;
    v9_sem_prova:3) [ "$MOTIVO_N" -ge 1 ] && [ "$PRE_N:$FORA_N" = 0:0 ] || INVALIDA=1 ;;
    *) INVALIDA=1 ;;
  esac
  [ "$INVALIDA" = 0 ] || sem_prova 'predecessores-sprintx: saida_inconclusiva'
  [ "$RESULTADO" != v9_sem_prova ] || sem_prova 'predecessores-sprintx: v9_sem_prova'
  cat "$TMP_DIR/predecessores-aceitos" >> "$TMP_DIR/uniao"
fi

# ---------------------------------------------------------------------------
# O diff e o conjunto aceito.
# ---------------------------------------------------------------------------
# --raw: os mesmos caminhos de --name-only, um registro `:<modo> <modo> <sha>
# <sha> <status>` seguido do caminho; os modos dizem se é submódulo
g diff --raw -z --no-abbrev --no-renames --ignore-submodules=none "$BASE...$HEAD_SHA" > "$TMP_DIR/diff" 2>/dev/null \
  || sem_prova "diff $BASE...HEAD não calculável" # guarda:SUB
contem() { grep -Fxq -e "$2" "$1"; }
DESVIO=fora_do_plano; [ "$PLANEJAMENTO" = 0 ] || DESVIO=fora_do_planejamento
: > "$TMP_DIR/fora"
while IFS= read -r -d '' cab <&3 && IFS= read -r -d '' p <&3; do
  case "$p" in
    *"$NL"*|*"$TAB"*) printf '%s\t%s\n' "$DESVIO" "$(printf '%s' "$p" | tr '\t\n' '??')" >> "$TMP_DIR/fora"; continue ;;
  esac
  if [ "$PLANEJAMENTO" = 1 ]; then
    # só os artefatos de método; submódulo nunca, nem sob docs/
    case "$cab" in ':160000 '*|':'*' 160000 '*) printf '%s\t%s\n' "$DESVIO" "$p" >> "$TMP_DIR/fora"; continue ;; esac
    case "$p" in docs/sprintx/*|docs/entregas/*|docs/eventos/*) continue ;; esac
    printf '%s\t%s\n' "$DESVIO" "$p" >> "$TMP_DIR/fora"
    continue
  fi
  contem "$TMP_DIR/uniao" "$p" && continue
  contem "$TMP_DIR/predecessores-aceitos" "$p" && continue
  if awk -F'\t' -v p="$p" '$1 == "fora_do_plano" && $2 == p { achou=1 } END { exit !achou }' "$TMP_DIR/predecessores-fora"; then
    printf 'fora_do_plano\t%s\tblob_divergente\n' "$p" >> "$TMP_DIR/fora"
    continue
  fi
  # submódulo (gitlink) fora da união: nunca isento nem coberto
  case "$cab" in ':160000 '*|':'*' 160000 '*) printf 'fora_do_plano\t%s\n' "$p" >> "$TMP_DIR/fora"; continue ;; esac # guarda:SUB
  case "$p" in "$PASTA"/*|"$DIR_E"/*) continue ;; esac
  [ "$ORIGEM" = sprintx ] && [ "$p" = docs/sprintx/estimativas/HISTORICO.md ] && continue # guarda:V9HIST
  contem "$TMP_DIR/cobertos" "$p" && continue
  printf 'fora_do_plano\t%s\n' "$p" >> "$TMP_DIR/fora"
done 3< "$TMP_DIR/diff"

printf 'base=%s\norigem_base=%s\n' "$BASE" "$ORIGEM_BASE"
cat "$AVISOS"
if [ -s "$TMP_DIR/fora" ]; then
  printf 'resultado=v9\n'
  # O terceiro campo é detalhe interno da reconciliação de predecessores. O
  # contrato público da V9 expõe somente o diagnóstico e o caminho.
  LC_ALL=C sort -u "$TMP_DIR/fora" | awk -F'\t' '{ print $1 "\t" $2 }' | LC_ALL=C sort -u
  exit 1
fi
printf 'resultado=ok\n'
exit 0
