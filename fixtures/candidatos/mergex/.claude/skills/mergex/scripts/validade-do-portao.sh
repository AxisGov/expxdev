#!/usr/bin/env bash
# validade-do-portao — o portão `pronto` do E2 ainda vale para a revisão?
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13. Consumido pela barreira de push (portao-regras.sh: pre-push, hook
# pr-so-com-portao e CI) e pelo E6/E7.
#
# Uso:
#   validade-do-portao.sh --verificar --entrega docs/entregas/<id>/ENTREGA.md [--rev <commit>]
#
# Só leitura: não grava no repositório, não adquire a trava C5, não exige
# stage vazio; os temporários (fora do repositório) saem em toda saída.
#
# Revisão avaliada: `--rev <commit>` (padrão HEAD), resolvida para o SHA do
# commit. O pre-push passa o SHA que o push publica, que nem sempre é o HEAD.
# Abaixo, "HEAD" é essa revisão. Uma revisão que não se resolve para um commit
# é erro_ambiente, salvo quando é objeto ausente (historia_incompleta, abaixo).
#
# Fonte: `portao`, `portao_sha`, `trabalho_id` e `expx_tool` vêm de
# <rev>:<ENTREGA> (a versão commitada, que é a que o push envia). O ENTREGA.md
# do disco nunca decide: se diverge do da revisão em `portao` ou `portao_sha`,
# sai uma linha `aviso=` e vale o da revisão.
#
# O portão vale somente se:
#   - HEAD:<ENTREGA> existe, é arquivo regular, `kind: entrega`, `trabalho_id`
#     igual ao <id> do caminho, `expx_tool` sprintx|runx e `portao: pronto`;
#   - `portao_sha` é um OID completo de 40 ou 64 hex minúsculos, conforme o
#     formato do repositório, existe e é ancestral de HEAD;
#   - nenhum merge no intervalo: `git rev-list --merges --topo-order --reverse
#     <portao_sha>..HEAD` vazio. Havendo, commit_merge no merge mais antigo,
#     antes de avaliar qualquer commit (o merge é a causa, não o que ele trouxe);
#   - TODO commit de `git rev-list --reverse --topo-order <portao_sha>..HEAD`
#     (sem --first-parent: os commits trazidos por um merge também são
#     avaliados), na ordem, até o primeiro que invalida:
#       * tem exatamente um pai (dois ou mais: commit_merge, defesa em
#         profundidade da passada dos merges; nenhum, um commit raiz trazido
#         de outra história: commit_de_produto);
#       * é commit de método válido do trabalho, pela gramática de
#         contrato-de-commit.sh --validar-metodo, com checkpoint pre-e6 ou e8
#         (pre-e2, reconciliacao-base, outro trabalho ou sem Metodo:
#         commit_de_produto);
#       * toca só caminhos do catálogo daquele checkpoint (catalogo_metodo),
#         calculado sobre a árvore DAQUELE commit — a pasta do trabalho e o
#         ENTREGA.md do commit materializados num temporário, nunca o disco
#         nem o HEAD. Caminhos de `git diff-tree --no-commit-id -r
#         --no-renames --ignore-submodules=none -z`, exatos, sem quoting. Um
#         modo fora de arquivo regular (gitlink 160000, link simbólico 120000)
#         em qualquer lado, um caminho com TAB, quebra de linha ou outro
#         caractere de controle, ou um catálogo que não se calcula:
#         metodo_fora_do_catalogo;
#       * não toca o plano: `tasks.md`, `sprint.md`, `fases.md` ou
#         `00-PLANEJAMENTO.md` em qualquer nível das pastas candidatas do
#         trabalho (docs/sprintx/features/<id>, docs/<id>,
#         docs/manutencao/<id>) dá metodo_fora_do_catalogo, mesmo estando no
#         catálogo do checkpoint: o plano mudado depois do portão não foi
#         avaliado pelo E2 ("qualquer commit de plano invalida"). O
#         catalogo-de-metodo.sh não muda: o checkpoint continua podendo
#         persistir o plano ANTES do portão.
#
# Limites (riscos residuais conhecidos):
#   - Portão reposicionado por commit de método: o ENTREGA.md está no catálogo
#     de pre-e6/e8, então um commit de método pode regravar `portao_sha` para
#     um commit posterior (até um de produto) e o portão volta a valer. É
#     indistinguível do fluxo legítimo "E2 avalia P, grava portao_sha: P e o
#     pre-e6 persiste" — mesmo grafo, mesmo conteúdo. A validade prova que
#     nada mudou depois de portao_sha, não que um E2 rodou em portao_sha
#     (como já valia para `portao: pronto` editado à mão). O teste
#     `residual: portão reposicionado por commit de método` fixa este
#     comportamento (rc 0).
#
# Saída (stdout), rc 0:
#   ok=true
#   primeiro_commit=-
#   aviso=<texto>                  (zero ou mais)
# ou, rc 1:
#   ok=false
#   motivo=<portao_nao_pronto|portao_sha_ausente|portao_sha_nao_ancestral|
#           commit_de_produto|commit_merge|metodo_fora_do_catalogo|
#           historia_incompleta|erro_ambiente>
#   primeiro_commit=<oid completo do commit que invalidou|->
#   aviso=<texto>                  (zero ou mais)
# Motivos:
#   portao_nao_pronto       ENTREGA ausente ou ilegível em HEAD, portao
#                           diferente de pronto (null, bloqueado, ausente),
#                           contexto inválido;
#   erro_ambiente           nada se pôde avaliar: dependência ausente, fora de
#                           um repositório Git, temporário que não se cria,
#                           revisão (HEAD ou --rev) que não é um commit por
#                           motivo que não seja objeto ausente, ou rev-list
#                           que falha com a história inteira; com um
#                           `aviso=` que descreve a falha;
#   portao_sha_ausente      portao_sha ausente, vazio, null ou fora do OID
#                           completo do formato de objetos do repositório;
#   portao_sha_nao_ancestral  portao_sha inexistente ou não ancestral de HEAD;
#   historia_incompleta     a história está cortada: repositório raso (rode
#                           `git fetch --unshallow`) ou objeto Git necessário
#                           ausente (busque os objetos que faltam). Objeto
#                           necessário ausente (guarda VALOBJ), num repositório
#                           Git legível: o commit para o qual um NOME de
#                           revisão (ref, HEAD) aponta; um objeto que falta
#                           ao percorrer a história de HEAD, quando a
#                           ancestralidade de portao_sha ou o rev-list do
#                           intervalo falha; ou uma árvore ou um blob que
#                           falta na árvore de HEAD (ENTREGA.md ausente ou
#                           ilegível) ou de um commit do intervalo (contrato
#                           de commit, materialização do catálogo, ENTREGA.md
#                           do commit ou diff-tree que falham). Sem objeto
#                           faltando, cada falha mantém o motivo de sempre.
#                           Um SHA literal sem objeto não é
#                           distinguível de um SHA que nunca existiu: continua
#                           erro_ambiente (--rev) ou portao_sha_nao_ancestral.
#                           O diagnóstico vem num `aviso=`.
# Os dois motivos de falha (historia_incompleta e erro_ambiente) falham
# fechado: ok=false e rc 1; todo consumidor os trata como bloqueio.
# Códigos: 0 válido; 1 inválido; 64 uso. Nenhuma opção de força.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
ARVORE_SH="$AQUI/reconciliacao-arvore.sh"
CONTRATO_SH="$AQUI/contrato-de-commit.sh"
g() { git -c core.quotepath=false "$@"; }

NL='
'
TAB='	'

uso() {
  [ -z "${1:-}" ] || printf 'validade-do-portao: %s\n' "$1" >&2
  printf '%s\n' 'uso: validade-do-portao.sh --verificar --entrega docs/entregas/<id>/ENTREGA.md [--rev <commit>]' >&2
  exit 64
}

TMP_DIR=""
encerrar() {
  local rc="$1"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  exit "$rc"
}
trap 'encerrar $?' EXIT
trap 'exit 1' HUP INT TERM

AVISOS=""
aviso() { AVISOS="$AVISOS$(printf '%s' "$1" | tr '\t\n\r' '   ')$NL"; }
imprime_avisos() { [ -z "$AVISOS" ] || printf '%s' "$AVISOS" | sed 's/^/aviso=/'; }

# invalido <motivo> [primeiro_commit] — rc 1
invalido() {
  printf 'ok=false\nmotivo=%s\nprimeiro_commit=%s\n' "$1" "${2:--}"
  imprime_avisos
  exit 1
}
ambiente() { aviso "$1"; invalido erro_ambiente; }
objeto_ausente() {
  aviso "$1: objeto Git ausente, história incompleta; busque os objetos que faltam (git fetch) ou rode git fetch --unshallow"
  invalido historia_incompleta
}
# A história de <rev> se percorre inteira (só commits)? Chamada só nos caminhos
# de falha: o custo de percorrer a história não entra no caminho válido.
historia_integra() { g rev-list "$REV_SHA" >/dev/null 2>&1; }
# Uma falha do Git depois de resolvida a revisão: objeto ausente
# (historia_incompleta) ou ambiente (erro_ambiente).
ambiente_ou_objeto() {
  historia_integra || objeto_ausente "$1" # guarda:VALOBJ
  ambiente "$1"
}
# objetos_faltam <commit>... — rc 0 se falta algum objeto (árvore ou blob) da
# árvore de algum dos commits. Também só nos caminhos de falha: percorre a
# árvore inteira (`rev-list --objects --no-walk --missing=print`).
objetos_faltam() {
  local cf
  for cf in "$@"; do
    g rev-list --objects --no-walk --missing=print "$cf" > "$TMP_DIR/objetos" 2>/dev/null || return 0
    grep -q '^?' "$TMP_DIR/objetos" && return 0
  done
  return 1
}

MODO=""; ENTREGA=""; REV=""; REV_DADA=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --entrega) [ "$#" -ge 2 ] && [ -z "$ENTREGA" ] || uso; ENTREGA="$2"; shift 2 ;;
    --rev) [ "$#" -ge 2 ] && [ "$REV_DADA" = 0 ] || uso; REV="$2"; REV_DADA=1; shift 2 ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done
[ "$MODO" = verificar ] || uso 'falta --verificar'
[ -n "$ENTREGA" ] || uso 'falta --entrega'
if [ "$REV_DADA" = 1 ]; then
  case "$REV" in ''|-*) uso "revisão inválida em --rev: ${REV:-vazia}" ;; esac
else
  REV=HEAD
fi

for dependencia in "$CATALOGO_SH" "$ARVORE_SH" "$CONTRATO_SH"; do
  [ -r "$dependencia" ] || ambiente "dependência indisponível: $dependencia"
done
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
# shellcheck source=reconciliacao-arvore.sh
. "$ARVORE_SH"
set +e

# O ambiente Git fixo de reconciliacao-arvore.sh e nem o refresh oportunista
# do índice: só leitura.
arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || ambiente 'fora de um repositório Git'
cd "$RAIZ" || ambiente "raiz inacessível: $RAIZ"
FORMATO_OBJETOS="$(g rev-parse --show-object-format 2>/dev/null)" \
  || ambiente 'formato de objetos Git indisponível'
case "$FORMATO_OBJETOS" in
  sha1) OID_LEN=40 ;;
  sha256) OID_LEN=64 ;;
  *) ambiente "formato de objetos Git não suportado: ${FORMATO_OBJETOS:-ausente}" ;;
esac
case "$ENTREGA" in
  ./*) ENTREGA="${ENTREGA#./}" ;;
  "$RAIZ"/*) ENTREGA="${ENTREGA#"$RAIZ"/}" ;;
esac
case "$ENTREGA" in
  docs/entregas/*/ENTREGA.md) ;;
  *) uso "--entrega deve ser docs/entregas/<id>/ENTREGA.md: $ENTREGA" ;;
esac
TRABALHO="${ENTREGA#docs/entregas/}"; TRABALHO="${TRABALHO%/ENTREGA.md}"
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto)
    uso "trabalho inválido no caminho da entrega: ${TRABALHO:-ausente}" ;;
esac

# história cortada esconde commits: antes de qualquer leitura
arvore_recusa_raso || { aviso "$ARVORE_ERRO"; invalido historia_incompleta; } # guarda:PTRASO
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-validade-portao.XXXXXX")" || { TMP_DIR=""; ambiente 'não foi possível criar diretório temporário'; }
if ! REV_SHA="$(g rev-parse --verify -q "$REV^{commit}" 2>/dev/null)"; then
  # um NOME (ref, HEAD) que aponta para um objeto que falta; um SHA literal sem
  # objeto não se distingue de um que nunca existiu
  case "$REV" in *[!0-9a-f]*) REV_ALVO="$(g rev-parse --verify -q "$REV" 2>/dev/null)" ;; *) REV_ALVO="" ;; esac
  [ -z "$REV_ALVO" ] || g cat-file -e "$REV_ALVO" 2>/dev/null || objeto_ausente "$REV aponta para $REV_ALVO" # guarda:VALOBJ
  ambiente "$REV não é um commit"
fi

modo_em() { g ls-tree -z "$1" -- "$2" 2>/dev/null | tr '\0' '\n' | sed -n '1s/ .*//p'; }

# ---------------------------------------------------------------------------
# O ENTREGA.md da revisão (a versão commitada).
# ---------------------------------------------------------------------------
ENTREGA_H="$TMP_DIR/entrega-head.md"
# ausente ou ilegível: antes de concluir, falta objeto da árvore de <rev>?
F=0
case "$(modo_em "$REV_SHA" "$ENTREGA")" in
  100644|100755) g cat-file blob "$REV_SHA:$ENTREGA" > "$ENTREGA_H" 2>/dev/null || F=ilegivel ;;
  '') F=ausente ;;
  *) aviso "$ENTREGA não é arquivo regular em $REV"; invalido portao_nao_pronto ;;
esac
[ "$F" = 0 ] || ! objetos_faltam "$REV_SHA" || objeto_ausente "a árvore de $REV não se lê inteira ($ENTREGA)" # guarda:VALOBJ
[ "$F" != ilegivel ] || { aviso "$ENTREGA ilegível em $REV"; invalido portao_nao_pronto; }
[ "$F" != ausente ] || { aviso "$ENTREGA ausente em $REV"; invalido portao_nao_pronto; }
[ "$(catalogo_fm "$ENTREGA_H" kind)" = entrega ] || { aviso "$ENTREGA de $REV não declara kind: entrega"; invalido portao_nao_pronto; }
[ "$(catalogo_fm "$ENTREGA_H" trabalho_id)" = "$TRABALHO" ] \
  || { aviso "ENTREGA.trabalho_id de $REV diverge do caminho ($TRABALHO)"; invalido portao_nao_pronto; }
ORIGEM="$(catalogo_fm "$ENTREGA_H" expx_tool)"
case "$ORIGEM" in sprintx|runx) ;; *) aviso "ENTREGA.expx_tool de $REV fora de sprintx|runx: ${ORIGEM:-ausente}"; invalido portao_nao_pronto ;; esac

PORTAO="$(catalogo_fm "$ENTREGA_H" portao)"
PS="$(catalogo_fm "$ENTREGA_H" portao_sha)"

# o disco que diverge da revisão é relatado, nunca usado
if [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ]; then
  p_disco="$(catalogo_fm "$ENTREGA" portao)"; s_disco="$(catalogo_fm "$ENTREGA" portao_sha)"
  [ "$p_disco" = "$PORTAO" ] || aviso "portao do disco (${p_disco:-ausente}) diverge do de $REV:$ENTREGA (${PORTAO:-ausente}); vale o de $REV"
  [ "$s_disco" = "$PS" ] || aviso "portao_sha do disco (${s_disco:-ausente}) diverge do de $REV:$ENTREGA (${PS:-ausente}); vale o de $REV"
else
  aviso "$ENTREGA ausente ou não regular no disco; vale o de $REV"
fi

[ "$PORTAO" = pronto ] || invalido portao_nao_pronto # guarda:PTPRONTO
[ "${#PS}" -eq "$OID_LEN" ] 2>/dev/null || invalido portao_sha_ausente # guarda:PTSHA
case "$PS" in *[!0-9a-f]*) invalido portao_sha_ausente ;; esac # guarda:PTSHA
# portao_sha sem objeto ou fora da ancestralidade: antes de concluir, a
# história de <rev> se percorre? Senão, o que falta é objeto (VALOBJ).
{ g cat-file -e "$PS^{commit}" && g merge-base --is-ancestor "$PS" "$REV_SHA"; } 2>/dev/null || historia_integra || objeto_ausente "a história de $REV não se percorre" # guarda:VALOBJ
g cat-file -e "$PS^{commit}" 2>/dev/null || invalido portao_sha_nao_ancestral # guarda:PTANC
g merge-base --is-ancestor "$PS" "$REV_SHA" 2>/dev/null || invalido portao_sha_nao_ancestral # guarda:PTANC

# ---------------------------------------------------------------------------
# Cada commit de portao_sha..<rev>, pais antes dos filhos, até o primeiro que
# invalida. Sem --first-parent: o que um merge traz também é avaliado.
# ---------------------------------------------------------------------------
# Primeiro os merges: um merge no intervalo é a causa, antes do que ele trouxe.
g rev-list --merges --topo-order --reverse "$PS..$REV_SHA" > "$TMP_DIR/merges" 2>/dev/null \
  || ambiente_ou_objeto "rev-list --merges $PS..$REV não calculável"
PRIMEIRO_MERGE="$(sed -n 1p "$TMP_DIR/merges")"
[ -z "$PRIMEIRO_MERGE" ] || invalido commit_merge "$PRIMEIRO_MERGE" # guarda:PTMERGE
g rev-list --reverse --topo-order "$PS..$REV_SHA" > "$TMP_DIR/commits" 2>/dev/null \
  || ambiente_ou_objeto "rev-list $PS..$REV não calculável" # guarda:PTLISTA
i=0
while IFS= read -r c <&3; do
  [ -n "$c" ] || continue
  i=$((i + 1))
  n="$(g rev-list --parents -n1 "$c" 2>/dev/null | wc -w | tr -d ' ')"
  case "$n" in
    2) ;;
    1) invalido commit_de_produto "$c" ;; # commit raiz: nenhuma diferença a provar
    *) invalido commit_merge "$c" ;; # guarda:PTMERGE
  esac

  CP=""
  for cand in pre-e6 e8; do # guarda:PTMET
    if bash "$CONTRATO_SH" --validar-metodo --trabalho "$TRABALHO" --checkpoint "$cand" --commit "$c" >/dev/null 2>&1; then
      CP="$cand"; break
    fi
  done
  # o contrato lê o commit pelo Git: sem CP, falta objeto da árvore de c?
  [ -n "$CP" ] || ! objetos_faltam "$c" || objeto_ausente "a árvore de $c não se lê inteira" # guarda:VALOBJ
  [ -n "$CP" ] || invalido commit_de_produto "$c" # guarda:PTMET

  # o catálogo de CP sobre a árvore deste commit: a pasta do trabalho e o
  # ENTREGA.md dele, materializados (sem subshell: ARVORE_* e CATALOGO_ERRO)
  arv="$TMP_DIR/arvore-$i"
  F=0
  arvore_materializa "$c" "$arv" "$ORIGEM" "$TRABALHO" "$c" '' || F=1
  [ "$F" = 0 ] || ! objetos_faltam "$c" || objeto_ausente "a árvore de $c não se lê inteira" # guarda:VALOBJ
  [ "$F" = 0 ] || { aviso "catálogo de $c não calculável: $ARVORE_ERRO"; invalido metodo_fora_do_catalogo "$c"; }
  F=0
  case "$(modo_em "$c" "$ENTREGA")" in
    100644|100755)
      mkdir -p "$ARVORE_RAIZ/docs/entregas/$TRABALHO" 2>/dev/null \
        && g cat-file blob "$c:$ENTREGA" > "$ARVORE_RAIZ/$ENTREGA" 2>/dev/null \
        || F=1 ;;
    '') ;;
    *) aviso "$ENTREGA não é arquivo regular em $c"; invalido metodo_fora_do_catalogo "$c" ;;
  esac
  [ "$F" = 0 ] || ! objetos_faltam "$c" || objeto_ausente "$ENTREGA de $c não se lê" # guarda:VALOBJ
  [ "$F" = 0 ] || { aviso "$ENTREGA ilegível em $c"; invalido metodo_fora_do_catalogo "$c"; }
  catalogo_metodo "$ARVORE_RAIZ" "$ORIGEM" "$TRABALHO" "$ARVORE_PASTA" "$CP" > "$TMP_DIR/catalogo-$i" \
    || { aviso "catálogo $CP de $c inválido: $CATALOGO_ERRO"; invalido metodo_fora_do_catalogo "$c"; } # guarda:PTARV

  # --raw: os mesmos caminhos de --name-only, com os modos (gitlink)
  F=0
  g diff-tree --no-commit-id -r --root --raw -z --no-abbrev --no-renames --ignore-submodules=none "$c" > "$TMP_DIR/toca-$i" 2>/dev/null || F=1
  [ "$F" = 0 ] || ! objetos_faltam "$c" "$c^" || objeto_ausente "diff-tree de $c não se lê" # guarda:VALOBJ
  [ "$F" = 0 ] || { aviso "diff-tree de $c não calculável"; invalido metodo_fora_do_catalogo "$c"; }
  while IFS= read -r -d '' cab <&4 && IFS= read -r -d '' p <&4; do
    # NL faria o grep -Fx casar uma linha do caminho com o catálogo
    case "$p" in *"$NL"*|*"$TAB"*|*[[:cntrl:]]*) invalido metodo_fora_do_catalogo "$c" ;; esac # guarda:PTPROD
    # `:<modo origem> <modo destino> ...`: só arquivo regular (ou ausente)
    mo="${cab#:}"; md="${mo#* }"; mo="${mo%% *}"; md="${md%% *}"
    case "$mo" in 000000|100644|100755) ;; *) invalido metodo_fora_do_catalogo "$c" ;; esac # guarda:PTPROD
    case "$md" in 000000|100644|100755) ;; *) invalido metodo_fora_do_catalogo "$c" ;; esac # guarda:PTPROD
    # o plano depois do portão não foi avaliado pelo E2
    for pl in "docs/sprintx/features/$TRABALHO" "docs/$TRABALHO" "docs/manutencao/$TRABALHO"; do
      case "$p" in
        "$pl"/*/tasks.md|"$pl"/*/sprint.md|"$pl"/*/fases.md|"$pl"/*/00-PLANEJAMENTO.md|"$pl"/tasks.md|"$pl"/sprint.md|"$pl"/fases.md|"$pl"/00-PLANEJAMENTO.md)
          invalido metodo_fora_do_catalogo "$c" ;; # guarda:PTPROD
      esac
    done
    grep -Fxq -e "$p" "$TMP_DIR/catalogo-$i" || invalido metodo_fora_do_catalogo "$c" # guarda:PTPROD
  done 4< "$TMP_DIR/toca-$i"
  rm -rf "$arv" "$arv.lista" "$arv.pasta"
done 3< "$TMP_DIR/commits"

printf 'ok=true\nprimeiro_commit=-\n'
imprime_avisos
exit 0
