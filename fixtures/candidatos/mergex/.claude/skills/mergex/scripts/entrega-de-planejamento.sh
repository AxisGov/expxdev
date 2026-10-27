#!/usr/bin/env bash
# entrega-de-planejamento — lê e grava o modo e o PR atual da entrega.
#
# Contrato: references/00-schema.md, "A entrega por sprint"; DM-259, DM-264 e DM-267.
# É o ÚNICO leitor de `entrega`, `sprint_atual` e `prs` na mergex: E0, E2, E7,
# E8 e E9 perguntam a ele, ninguém relê o YAML por conta própria.
#
# Uso:
#   entrega-de-planejamento.sh --entrega <ENTREGA.md> [--rev <commit>]
#
# Com --rev, lê o frontmatter da versão commitada (`git show <rev>:./<caminho>`,
# caminho relativo ao diretório atual), nunca o do disco.
#
# As marcas coerentes são `entrega: por_trabalho|por_sprint`,
# `sprint_atual: planejamento|NN|null` e `prs` em YAML de bloco. O item de
# planejamento é sempre o primeiro; numa entrega por sprint seguem 01, 02, ... .
# Cada item tem url, estado, merge_sha, merge e base_sha; só o atual pode estar
# aberto, e todo anterior está merged.
#
# Saída (stdout):
#   planejamento=nao
#   [planejamento_merge_sha=<prs[0].merge_sha>]   (só depois da retomada)
#   [planejamento_base_sha=<prs[0].base_sha>]     (idem; `null` num registro anterior à DM-269)
#   [planejamento_url=<prs[0].url>]                (com o item de planejamento)
# ou `planejamento=sim` com estado/merge/base do primeiro item. Em ambos os
# casos, também imprime `entrega=`, `entrega_origem=`, `sprint_atual=`, o estado
# do item atual, o último item fechado e uma linha `pr=` por item.
#
# Entrega anterior às chaves lê como `entrega=por_trabalho` e
# `sprint_atual=null`. Depois da retomada do E0 (`sprint_atual: null` com o
# planejamento `merged`), a saída inclui o merge do planejamento que a base
# reancorada contém (a V9 tira dele o limite das guardas da base, DM-261).
#
# Códigos: 0 leu; 2 ilegível ou incoerente (motivo em stderr); 64 uso.
#
# As ações de escrita são: `--registrar-pr` (E8), `--registrar-merge` (E9),
# `--completar-base` (E9, migração de item merged), `--abrir-sprint` (E0).
# `--modo-efetivo` fixa a precedência plano > projeto antes
# do primeiro registro. Todas reescrevem só as chaves de que são donas, conferem o
# temporário com este mesmo leitor e recusam link simbólico.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

uso() {
  [ -z "${1:-}" ] || printf 'entrega-de-planejamento: %s\n' "$1" >&2
  printf '%s\n' 'uso: entrega-de-planejamento.sh [--rev <commit>] --entrega <ENTREGA.md>' \
    '     entrega-de-planejamento.sh --registrar-merge --merge-sha <sha> --base-sha <sha> --entrega <ENTREGA.md>' \
    '     entrega-de-planejamento.sh --completar-base <planejamento|NN> --merge-sha <sha> --base-sha <sha> --entrega <ENTREGA.md>' \
    '     entrega-de-planejamento.sh --registrar-pr --url <url|null> --estado <estado> --entrega <ENTREGA.md>' \
    '     entrega-de-planejamento.sh --abrir-sprint <NN> --base-validada-sha <sha> --entrega <ENTREGA.md>' \
    '     entrega-de-planejamento.sh --modo-efetivo --plano <00-PLANEJAMENTO.md> --projeto <modo> --entrega <ENTREGA.md>' >&2
  exit 64
}
ilegivel() { printf 'entrega-de-planejamento: %s\n' "$1" >&2; exit 2; }
recusa() { printf 'entrega-de-planejamento: %s\n' "$1" >&2; exit 1; }

ENTREGA=""; REV=""; TEM_REV=0; ACAO=ler; MERGE_SHA=""; BASE_SHA=""; ALVO_SPRINT=""
URL=""; TEM_URL=0; ESTADO=""; NN=""; BASE_VALIDADA=""; PLANO=""; PROJETO=""
acao() { [ "$ACAO" = ler ] || uso 'uma ação por vez'; ACAO="$1"; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --entrega) [ "$#" -ge 2 ] && [ -z "$ENTREGA" ] || uso; ENTREGA="$2"; shift 2 ;;
    --rev) [ "$#" -ge 2 ] && [ "$TEM_REV" = 0 ] || uso; REV="$2"; TEM_REV=1; shift 2 ;;
    --registrar-merge) acao registrar-merge; shift ;;
    --completar-base) [ "$#" -ge 2 ] || uso; acao completar-base; ALVO_SPRINT="$2"; shift 2 ;;
    --registrar-pr) acao registrar-pr; shift ;;
    --abrir-sprint) [ "$#" -ge 2 ] || uso; acao abrir-sprint; NN="$2"; shift 2 ;;
    --modo-efetivo) acao modo-efetivo; shift ;;
    --merge-sha) [ "$#" -ge 2 ] && [ -z "$MERGE_SHA" ] || uso; MERGE_SHA="$2"; shift 2 ;;
    --base-sha) [ "$#" -ge 2 ] && [ -z "$BASE_SHA" ] || uso; BASE_SHA="$2"; shift 2 ;;
    --url) [ "$#" -ge 2 ] && [ "$TEM_URL" = 0 ] || uso; URL="$2"; TEM_URL=1; shift 2 ;;
    --estado) [ "$#" -ge 2 ] && [ -z "$ESTADO" ] || uso; ESTADO="$2"; shift 2 ;;
    --base-validada-sha) [ "$#" -ge 2 ] && [ -z "$BASE_VALIDADA" ] || uso; BASE_VALIDADA="$2"; shift 2 ;;
    --plano) [ "$#" -ge 2 ] && [ -z "$PLANO" ] || uso; PLANO="$2"; shift 2 ;;
    --projeto) [ "$#" -ge 2 ] && [ -z "$PROJETO" ] || uso; PROJETO="$2"; shift 2 ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done
[ -n "$ENTREGA" ] || uso 'falta --entrega'
[ "$TEM_REV" = 0 ] || [ -n "$REV" ] || uso '--rev vazio'
[ "$ACAO" = ler ] || [ "$TEM_REV" = 0 ] || uso '--rev só na leitura'
sha_uso() { # <nome> <valor> <comprimento exigido, ou vazio para 40|64>
  case "$2" in *[!0-9a-f]*|'') uso "$1 inválido: ${2:-ausente}" ;; esac
  if [ -n "${3:-}" ]; then [ "${#2}" = "$3" ] || uso "$1 inválido: $2"
  else [ "${#2}" = 40 ] || [ "${#2}" = 64 ] || uso "$1 inválido: $2"; fi
}
case "$ACAO" in registrar-merge|completar-base) ;; *) [ -z "$MERGE_SHA$BASE_SHA" ] || uso '--merge-sha e --base-sha só com --registrar-merge ou --completar-base' ;; esac
[ "$ACAO" = registrar-pr ] || { [ "$TEM_URL" = 0 ] && [ -z "$ESTADO" ]; } || uso '--url e --estado só com --registrar-pr'
[ "$ACAO" = abrir-sprint ] || [ -z "$BASE_VALIDADA" ] || uso '--base-validada-sha só com --abrir-sprint'
[ "$ACAO" = modo-efetivo ] || [ -z "$PLANO$PROJETO" ] || uso '--plano e --projeto só com --modo-efetivo'
case "$ACAO" in
  registrar-merge|completar-base)
    sha_uso merge_sha "$MERGE_SHA"
    sha_uso base_sha "${BASE_SHA:-}" "${#MERGE_SHA}"
    if [ "$ACAO" = completar-base ]; then
      case "$ALVO_SPRINT" in planejamento|[0-9][0-9]) ;; *) uso "alvo de --completar-base fora de planejamento|NN: ${ALVO_SPRINT:-ausente}" ;; esac
    fi ;;
  registrar-pr)
    [ "$TEM_URL" = 1 ] && [ -n "$URL" ] || uso 'falta --url (null quando o PR não abriu)'
    case "$URL" in *[[:space:]\"\'#]*) uso "url fora da forma: $URL" ;; esac
    # merged e fechado são do E9: o E8 nunca os grava
    case "$ESTADO" in aberto|rascunho|aguardando_merge|null) ;; *) uso "estado do E8 fora de aberto|rascunho|aguardando_merge|null: ${ESTADO:-ausente}" ;; esac ;;
  abrir-sprint)
    case "$NN" in [0-9][0-9]) [ "$NN" != 00 ] || uso 'sprint 00' ;; *) uso "sprint fora da forma NN: $NN" ;; esac
    sha_uso base_validada_sha "$BASE_VALIDADA" ;;
  modo-efetivo)
    [ -n "$PLANO" ] || uso 'falta --plano'
    case "$PROJETO" in por_trabalho|por_sprint) ;; *) uso "modo do projeto fora de por_trabalho|por_sprint: ${PROJETO:-ausente}" ;; esac ;;
esac

# Antes da primeira leitura de uma escrita, serializar todo ciclo de leitura/validação/
# alteração/rename. mkdir é atômico também em Bash 3.2 (macOS); leitores não bloqueiam.
# Lock órfão é falha fechada: nunca apagar automaticamente o lock de outra execução.
LOCK_DIR=""
libera_lock() {
  [ -z "$LOCK_DIR" ] || rmdir "$LOCK_DIR" 2>/dev/null || :
}
case "$ACAO" in
  registrar-merge|completar-base|registrar-pr|abrir-sprint)
    LOCK_DIR="$ENTREGA.lock"
    tentativas=0
    until mkdir "$LOCK_DIR" 2>/dev/null; do
      tentativas=$((tentativas + 1))
      [ "$tentativas" -lt 100 ] || recusa "entrega ocupada ou lock órfão: $LOCK_DIR (verifique antes de removê-lo)"
      sleep 0.1
    done
    trap 'libera_lock' EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM ;;
esac

# antes de ler: um link quebrado também é link, e a recusa é a mesma
case "$ACAO" in registrar-merge|completar-base|registrar-pr|abrir-sprint)
  [ ! -L "$ENTREGA" ] || recusa "$ENTREGA é link simbólico: o registro só grava um arquivo regular" ;;
esac
conteudo=""
if [ "$TEM_REV" = 1 ]; then
  case "$ENTREGA" in /*|?:*) ilegivel "--rev exige caminho relativo: $ENTREGA" ;; esac
  conteudo="$(git show "${REV}:./${ENTREGA#./}" 2>/dev/null)" \
    || ilegivel "não há $ENTREGA em $REV"
elif [ "$ACAO" = modo-efetivo ] && [ ! -e "$ENTREGA" ] && [ ! -L "$ENTREGA" ]; then
  conteudo='---
---'   # a entrega ainda não existe (o E0 vai criá-la): nada registrado
else
  [ -f "$ENTREGA" ] && [ -r "$ENTREGA" ] || ilegivel "arquivo ilegível: $ENTREGA"
  conteudo="$(cat "$ENTREGA")"
fi

# Uma linha por fato, com o motivo da ilegibilidade quando houver:
#   S<TAB><sprint_atual>          (ausente: sem a linha)
#   M<TAB><entrega>               (ausente: sem a linha)
#   P<TAB><inline de prs:>        (ausente: sem a linha)
#   I<TAB>pos<TAB>sprint<TAB>url<TAB>estado<TAB>merge_sha<TAB>merge<TAB>base_sha
#   E<TAB><motivo>
fatos="$(printf '%s\n' "$conteudo" | awk -v q="'" '
  function limpa(v,   a, z) {
    sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v)
    a = substr(v, 1, 1); z = substr(v, length(v))
    if (length(v) >= 2 && a == z && (a == "\"" || a == q)) v = substr(v, 2, length(v) - 2)
    return v
  }
  function emite() {
    if (!aberto) return
    aberto = 0
    if (!("sprint" in c) || !("url" in c) || !("estado" in c) || !("merge_sha" in c) || !("merge" in c)) {
      if (erro == "") erro = "item " n " de prs sem as cinco chaves (sprint, url, estado, merge_sha, merge)"
      return
    }
    if (!("base_sha" in c)) c["base_sha"] = "null"
    printf "I\t%d\t%s\t%s\t%s\t%s\t%s\t%s\n", n, c["sprint"], c["url"], c["estado"], c["merge_sha"], c["merge"], c["base_sha"]
  }
  function campo(l,   k, v) {
    if (l !~ /^[a-z_]+:/) { erro = "linha de prs fora da forma chave: valor: " l; return }
    k = l; sub(/:.*/, "", k)
    v = l; sub(/^[^:]*:/, "", v); v = limpa(v)
    if (k != "sprint" && k != "url" && k != "estado" && k != "merge_sha" && k != "merge" && k != "base_sha") {
      erro = "chave desconhecida num item de prs: " k; return
    }
    if (k in c) { erro = "chave repetida num item de prs: " k; return }
    if (v == "" || v == "~") v = "null"
    c[k] = v
  }
  { sub(/\r$/, "") }
  NR == 1 { if ($0 !~ /^---[[:space:]]*$/) { erro = "o arquivo não começa com frontmatter"; exit }; fm = 1; next }
  /^---[[:space:]]*$/ { fechado = 1; exit }
  /^[A-Za-z_][A-Za-z0-9_]*:/ {
    if (dentro) { emite(); if (erro != "") exit }
    dentro = 0
    nome = $0; sub(/:.*/, "", nome)
    v = $0; sub(/^[^:]*:/, "", v); v = limpa(v)
    if (nome == "sprint_atual") { if (vs) { erro = "sprint_atual repetida"; exit }; vs = 1; printf "S\t%s\n", (v == "" || v == "~") ? "null" : v }
    if (nome == "entrega") { if (vm) { erro = "entrega repetida"; exit }; vm = 1; printf "M\t%s\n", v }
    if (nome == "prs") { if (vp) { erro = "prs repetida"; exit }; vp = 1; dentro = 1; printf "P\t%s\n", v }
    next
  }
  !dentro { next }
  /^[[:space:]]*$/ { next }
  /^[[:space:]]+-[[:space:]]/ || /^[[:space:]]+-$/ {
    emite(); if (erro != "") exit
    n++; aberto = 1; split("", c)
    l = $0; sub(/^[[:space:]]+-[[:space:]]*/, "", l)
    if (l != "") campo(l)
    if (erro != "") exit
    next
  }
  /^[[:space:]]+[a-z_]+:/ {
    if (!aberto) { erro = "campo de prs fora de um item"; exit }
    l = $0; sub(/^[[:space:]]+/, "", l); campo(l)
    if (erro != "") exit
    next
  }
  { erro = "linha de prs fora da forma de bloco: " $0; exit }
  END {
    if (erro == "" && fm && !fechado) erro = "o frontmatter não foi fechado"
    if (erro == "" && dentro) emite()
    if (erro != "") printf "E\t%s\n", erro
  }
')"

erro="$(printf '%s\n' "$fatos" | awk -F'\t' '$1 == "E" { print $2; exit }')"
[ -z "$erro" ] || ilegivel "$erro"

TAB='	'
sprint=""; tem_p=0; inline=""; modo=""; tem_m=0
linha_s="$(printf '%s\n' "$fatos" | grep "^S$TAB" || true)"
linha_m="$(printf '%s\n' "$fatos" | grep "^M$TAB" || true)"
linha_p="$(printf '%s\n' "$fatos" | grep "^P$TAB" || true)"
[ -z "$linha_s" ] || sprint="${linha_s#S$TAB}"
[ -z "$linha_m" ] || { tem_m=1; modo="${linha_m#M$TAB}"; }
[ -z "$linha_p" ] || { tem_p=1; inline="${linha_p#P$TAB}"; }
itens="$(printf '%s\n' "$fatos" | grep "^I$TAB" || true)"

case "$inline" in
  '') ;;
  '[]') [ -z "$itens" ] || ilegivel 'prs: [] com itens abaixo' ;;
  *) ilegivel "prs fora da forma de bloco (a forma em fluxo é ilegível): $inline" ;;
esac
[ "$tem_p" = 0 ] || [ -n "$inline" ] || [ -n "$itens" ] || ilegivel 'prs sem itens: use prs: []'

[ "$tem_m" = 0 ] || case "$modo" in por_trabalho|por_sprint) ;; *) ilegivel "entrega fora do enum (por_trabalho | por_sprint): $modo" ;; esac
case "$sprint" in ''|null|planejamento|[0-9][0-9]) ;; *) ilegivel "sprint_atual fora do enum: $sprint" ;; esac

sha_ok() {
  case "$1" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#1}" -ge 7 ] && [ "${#1}" -le 64 ]
}
nome_pr() { case "$1" in planejamento) printf 'o PR de planejamento' ;; *) printf 'o PR da sprint %s' "$1" ;; esac; }
# 10#: "08" e "09" não são octais
proxima() { printf '%02d' "$((10#$1 + 1))"; }

# Todo item: enums; o de planejamento só na primeira posição; as sprints em
# sequência (01, 02, ...), depois do planejamento; todo item antes do último merged.
p_sprint=""; p_url=""; p_estado=""; p_sha=""; p_merge=""; p_base=""
u_pos=0; u_sprint=""; u_estado=""; u_sha=""; u_base=""; u_merge=""; u_url=""
a_pos=0; a_sprint=""; a_estado=""; a_sha=""; a_base=""; a_merge=""
f_sprint=""; f_sha=""; n_itens=0; ultima_nn=""; prs_linhas=""
while IFS="$TAB" read -r _ pos s_item url_item estado sha merge base; do
  [ -n "$pos" ] || continue
  case "$estado" in aberto|rascunho|aguardando_merge|merged|fechado|null) ;;
    *) ilegivel "estado fora do enum no item $pos de prs: $estado" ;; esac
  case "$merge" in humano|automatico|null) ;;
    *) ilegivel "merge fora do enum no item $pos de prs: $merge" ;; esac
  case "$s_item" in
    planejamento) [ "$pos" = 1 ] || ilegivel "o item de planejamento está na posição $pos de prs (só a primeira)" ;;
    [0-9][0-9])
      [ "$p_sprint" = planejamento ] || ilegivel "item de sprint $s_item sem o item de planejamento no início de prs"
      esperado="$(proxima "${ultima_nn:-00}")"
      [ "$s_item" = "$esperado" ] || ilegivel "sprint $s_item fora de sequência no item $pos de prs (esperada $esperado)"
      ultima_nn="$s_item" ;;
    *) ilegivel "sprint fora da forma no item $pos de prs: $s_item" ;;
  esac
  if [ "$estado" = merged ]; then
    sha_ok "$sha" || ilegivel "item $pos de prs merged sem merge_sha válido: $sha"
  else
    [ "$sha" = null ] || ilegivel "item $pos de prs com merge_sha sem estar merged"
    [ "$base" = null ] || ilegivel "item $pos de prs com base_sha sem estar merged"
  fi
  [ "$base" = null ] || sha_ok "$base" || ilegivel "item $pos de prs com base_sha inválido: $base"
  # sequencial (desenho 4.3): só o último item pode estar aberto
  [ "$u_pos" = 0 ] || [ "$u_estado" = merged ] || ilegivel "o item $pos de prs vem depois do item $u_pos, que não está merged"
  if [ "$pos" = 1 ]; then p_sprint="$s_item"; p_url="$url_item"; p_estado="$estado"; p_sha="$sha"; p_merge="$merge"; p_base="$base"; fi
  if [ -n "$ALVO_SPRINT" ] && [ "$s_item" = "$ALVO_SPRINT" ]; then
    a_pos="$pos"; a_sprint="$s_item"; a_estado="$estado"; a_sha="$sha"; a_merge="$merge"; a_base="$base"
  fi
  u_pos="$pos"; u_sprint="$s_item"; u_estado="$estado"; u_sha="$sha"; u_base="$base"; u_merge="$merge"; u_url="$url_item"
  [ "$estado" != merged ] || { f_sprint="$s_item"; f_sha="$sha"; }
  n_itens="$pos"
  prs_linhas="$prs_linhas$(printf 'pr=%s\t%s\t%s\t%s' "$s_item" "$estado" "$sha" "$base")
"
done <<EOF
$itens
EOF

PLANEJAMENTO=nao
if [ "$p_sprint" = planejamento ]; then
  [ "$p_merge" != automatico ] || ilegivel 'o PR de planejamento nunca tem merge automático (merge: automatico)'
fi
case "$sprint" in
  planejamento)
    [ "$p_sprint" = planejamento ] || ilegivel 'sprint_atual: planejamento sem o item de planejamento no início de prs'
    [ "$n_itens" = 1 ] || ilegivel 'sprint_atual: planejamento com itens de sprint em prs'
    PLANEJAMENTO=sim ;;
  [0-9][0-9])
    [ "$tem_m" = 1 ] && [ "$modo" = por_sprint ] || ilegivel "sprint_atual: $sprint sem entrega: por_sprint"
    [ "$u_sprint" = "$sprint" ] || ilegivel "sprint_atual: $sprint não é o último item de prs (${u_sprint:-nenhum})" ;;
  *)
    [ -z "$ultima_nn" ] || ilegivel "prs tem itens de sprint com sprint_atual ${sprint:-ausente}"
    if [ "$p_sprint" = planejamento ]; then
      [ -n "$sprint" ] || ilegivel 'prs começa pelo planejamento sem sprint_atual'
      [ "$p_estado" = merged ] || ilegivel 'sprint_atual: null com o planejamento ainda não merged em prs'
    fi ;;
esac

MODO_EF="$modo"; [ "$tem_m" = 1 ] || MODO_EF=por_trabalho
ATUAL_ESTADO=""; ATUAL_URL=""
# A URL do PR atual vive no item dele em `prs` (o E8 a grava ali, e o --abrir-sprint
# deixa `pr_url: null` no topo): quem le o PR da sprint, como o E9, le esta chave,
# nunca o topo (conselhos#208, M10).
case "$sprint" in planejamento|[0-9][0-9]) ATUAL_ESTADO="$u_estado"; ATUAL_URL="${u_url:-null}" ;; esac

saida() {
  if [ "$PLANEJAMENTO" = sim ]; then
    printf 'planejamento=sim\nestado=%s\nmerge_sha=%s\nbase_sha=%s\nplanejamento_url=%s\n' "$p_estado" "$p_sha" "$p_base" "$p_url"
  elif [ "$p_sprint" = planejamento ]; then
    printf 'planejamento=nao\nplanejamento_merge_sha=%s\nplanejamento_base_sha=%s\nplanejamento_url=%s\n' "$p_sha" "$p_base" "$p_url"
  else
    printf 'planejamento=nao\n'
  fi
  printf 'entrega=%s\nentrega_origem=%s\nsprint_atual=%s\n' "$MODO_EF" "$([ "$tem_m" = 1 ] && echo registrada || echo padrao)" "${sprint:-null}"
  [ -z "$ATUAL_ESTADO" ] || printf 'atual_estado=%s\natual_url=%s\n' "$ATUAL_ESTADO" "$ATUAL_URL"
  [ -z "$f_sprint" ] || printf 'fechada=%s\nfechada_merge_sha=%s\n' "$f_sprint" "$f_sha"
  printf '%s' "$prs_linhas"
}

case "$ACAO" in
  ler) saida; exit 0 ;;
  modo-efetivo)
    if [ "$tem_m" = 1 ]; then printf 'entrega=%s\norigem=registrada\n' "$modo"; exit 0; fi
    v_plano=""
    if [ -e "$PLANO" ]; then
      [ -f "$PLANO" ] && [ -r "$PLANO" ] || ilegivel "plano ilegível: $PLANO"
      # o E0 lê a chave uma vez, só do frontmatter (DM-264)
      v_plano="$(awk -v q="'" '
        { sub(/\r$/, "") }
        NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; next }
        /^---[[:space:]]*$/ { exit }
        /^entrega:/ { v = $0; sub(/^entrega:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
                      a = substr(v, 1, 1); z = substr(v, length(v))
                      if (length(v) >= 2 && a == z && (a == "\"" || a == q)) v = substr(v, 2, length(v) - 2)
                      print "v=" v; exit }' "$PLANO")"
    fi
    case "$v_plano" in
      '') printf 'entrega=%s\norigem=projeto\n' "$PROJETO" ;;
      v=por_trabalho|v=por_sprint) printf 'entrega=%s\norigem=plano\n' "${v_plano#v=}" ;;
      *) recusa "entrega fora do enum (por_trabalho | por_sprint) no frontmatter de $PLANO: ${v_plano#v=}" ;;
    esac
    exit 0 ;;
esac

# --- as gravações (únicos escritores de `entrega`, `sprint_atual` e `prs`) ---
hoje="$(date +%Y-%m-%d)" || ilegivel 'data do sistema indisponível'
tmp="$ENTREGA.tmp.$$"
trap 'rm -f "$tmp"; libera_lock' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# grava <posição do item alvo (0: nenhum)> <k=v;… do item> <k=v;… do topo> <NN do item novo ou vazio>
# Troca só as linhas das chaves dadas, no frontmatter; a chave que falta no item
# alvo entra no fim dele, com a indentação das chaves do item; a de topo que falta
# entra antes do `---` que fecha; o item novo entra no fim de `prs` (`prs: []` vira
# bloco). O fim de linha de cada linha (CRLF ou LF) fica como estava, e as linhas
# novas seguem o da primeira. BINMODE=3: o gawk do Git para Windows (MSYS) tira o CR
# na leitura sem ele; os outros awk o ignoram.
grava() {
  awk -v BINMODE=3 -v alvo="$1" -v itemsets="$2" -v topsets="$3" -v novo="$4" '
    function troca(l, chave, valor,   cr, ind) {
      cr = ""; if (l ~ /\r$/) { cr = "\r"; sub(/\r$/, "", l) }
      ind = l; sub(/[^ \t].*$/, "", ind)
      if (substr(l, length(ind) + 1, 2) == "- ") ind = ind "- "
      return ind chave ": " valor cr
    }
    function separa(spec, val, ordem,   n, i, partes, k) {
      if (spec == "") return 0
      n = split(spec, partes, ";")
      for (i = 1; i <= n; i++) { k = partes[i]; sub(/=.*/, "", k); val[k] = substr(partes[i], length(k) + 2); ordem[i] = k }
      return n
    }
    function fecha_item(   i, k) {
      if (!alvo_aberto) return
      for (i = 1; i <= ni; i++) { k = io[i]; if (!(k in visto)) print kind k ": " iv[k] cr0 }
      alvo_aberto = 0
    }
    function anexa_novo() {
      if (novo == "" || anexado) return
      print "  - sprint: " novo cr0; print "    url: null" cr0; print "    estado: null" cr0
      print "    merge_sha: null" cr0; print "    merge: null" cr0; print "    base_sha: null" cr0
      anexado = 1
    }
    BEGIN { ni = separa(itemsets, iv, io); nt = separa(topsets, tv, to) }
    NR == 1 { cr0 = ($0 ~ /\r$/) ? "\r" : ""; print; next }
    fim { print; next }
    { l = $0; sub(/\r$/, "", l) }
    l ~ /^---[[:space:]]*$/ {
      if (dentro) { fecha_item(); anexa_novo() }
      for (i = 1; i <= nt; i++) if (!(to[i] in feito)) print to[i] ": " tv[to[i]] cr0
      fim = 1; print; next
    }
    l ~ /^[A-Za-z_][A-Za-z0-9_]*:/ {
      if (dentro) { fecha_item(); anexa_novo() }
      dentro = (l ~ /^prs:/)
      k = l; sub(/:.*/, "", k)
      if (k == "prs" && novo != "" && l ~ /^prs:[[:space:]]*\[\][[:space:]]*$/) {
        print "prs:" cr0; anexa_novo(); dentro = 0; next
      }
      if (k in tv) { feito[k] = 1; print troca($0, k, tv[k]); next }
      print; next
    }
    dentro && l ~ /^[[:space:]]+-/ {
      fecha_item(); item++
      if (item == alvo) { alvo_aberto = 1; split("", visto); kind = l; sub(/[^ \t].*$/, "", kind); kind = kind "  " }
    }
    dentro && alvo_aberto && l ~ /^[[:space:]]+(-[[:space:]]+)?[a-z_]+:/ {
      k = l; sub(/^[[:space:]]+(-[[:space:]]+)?/, "", k); sub(/:.*/, "", k)
      visto[k] = 1
      if (k in iv) { print troca($0, k, iv[k]); next }
    }
    { print }
  ' "$ENTREGA" > "$tmp" || { rm -f "$tmp"; ilegivel "não consegui gravar $ENTREGA"; }
}
# confere <linha esperada>... — o temporário relido pelo leitor tem as linhas; então troca
confere_e_troca() {
  local depois l
  depois="$(bash "$0" --entrega "$tmp" 2>/dev/null)" || { rm -f "$tmp"; ilegivel "a gravação não ficou legível em $ENTREGA"; }
  for l in "$@"; do
    printf '%s\n' "$depois" | grep -Fqx -- "$l" || { rm -f "$tmp"; ilegivel "a gravação não ficou legível em $ENTREGA ($l)"; }
  done
  mv "$tmp" "$ENTREGA" || { rm -f "$tmp"; ilegivel "não consegui gravar $ENTREGA"; }
}

case "$ACAO" in
  completar-base)
    [ "$a_pos" != 0 ] || recusa "não há item $ALVO_SPRINT em prs para completar base_sha"
    [ "$a_estado" = merged ] || recusa "$(nome_pr "$a_sprint") não está merged: base_sha histórica só completa item fechado"
    [ "$a_sha" = "$MERGE_SHA" ] || recusa "$(nome_pr "$a_sprint") está merged com outro merge_sha ($a_sha)"
    if [ "$a_base" = "$BASE_SHA" ]; then
      printf 'completado=%s\nmerge_sha=%s\nbase_sha=%s\n' "$a_sprint" "$MERGE_SHA" "$BASE_SHA"; exit 0
    fi
    [ "$a_base" = null ] || recusa "$(nome_pr "$a_sprint") já está merged com outra base_sha ($a_base)"
    grava "$a_pos" "base_sha=$BASE_SHA" "atualizado_em=$hoje" ''
    confere_e_troca "$(printf 'pr=%s\tmerged\t%s\t%s' "$a_sprint" "$MERGE_SHA" "$BASE_SHA")"
    printf 'completado=%s\nmerge_sha=%s\nbase_sha=%s\n' "$a_sprint" "$MERGE_SHA" "$BASE_SHA" ;;
  registrar-merge)
    # o item da entrega atual: o de planejamento ou o da sprint atual
    case "$sprint" in
      planejamento|[0-9][0-9]) ;;
      *) recusa 'a entrega não é a do PR de planejamento nem a de uma sprint: nada a registrar' ;;
    esac
    if [ "$u_estado" = merged ]; then
      [ "$u_sha" = "$MERGE_SHA" ] || recusa "$(nome_pr "$u_sprint") já está merged com outro merge_sha ($u_sha)"
      if [ "$u_base" = "$BASE_SHA" ]; then
        printf 'registrado=merged\nmerge_sha=%s\nbase_sha=%s\n' "$MERGE_SHA" "$BASE_SHA"; exit 0
      fi
      # o registro anterior à DM-269 (sem a base) ganha a base; outra base é recusa
      [ "$u_base" = null ] || recusa "$(nome_pr "$u_sprint") já está merged com outra base_sha ($u_base)"
    fi
    m="humano"; [ "$u_estado" != merged ] || m="$u_merge"
    grava "$u_pos" "estado=merged;merge_sha=$MERGE_SHA;merge=$m;base_sha=$BASE_SHA" "pr_estado=merged;atualizado_em=$hoje" ''
    confere_e_troca "fechada=$u_sprint" "fechada_merge_sha=$MERGE_SHA" \
      "$(printf 'pr=%s\tmerged\t%s\t%s' "$u_sprint" "$MERGE_SHA" "$BASE_SHA")"
    printf 'registrado=merged\nmerge_sha=%s\nbase_sha=%s\n' "$MERGE_SHA" "$BASE_SHA" ;;
  registrar-pr)
    # Em por_trabalho já retomado (sprint_atual: null), o E8 atualiza somente
    # o PR de topo; o histórico de planejamento em prs permanece imutável.
    if [ "$sprint" = null ] && [ "$MODO_EF" = por_trabalho ]; then
      grava 0 "" "pr_url=$URL;pr_estado=$ESTADO;atualizado_em=$hoje" ''
      awk -v u="pr_url: $URL" -v e="pr_estado: $ESTADO" '
        { sub(/\r$/, ""); if ($0 == u) viu_url = 1; if ($0 == e) viu_estado = 1 }
        END { exit !(viu_url && viu_estado) }' "$tmp" ||
        ilegivel "a gravação do PR por trabalho não preservou os campos de topo"
      confere_e_troca 'sprint_atual=null' 'entrega=por_trabalho'
      printf 'registrado=%s\nsprint=null\n' "$ESTADO"
      exit 0
    fi
    # O E8 grava o PR no item da sprint que o E0 registrou (nunca relida do plano)
    case "$sprint" in
      planejamento|[0-9][0-9]) ;;
      *) recusa 'a entrega não é a do PR de planejamento nem a de uma sprint: o E8 não grava prs' ;;
    esac
    [ "$u_estado" != merged ] && [ "$u_estado" != fechado ] || recusa "$(nome_pr "$u_sprint") já está $u_estado: o E8 não o regrava"
    grava "$u_pos" "url=$URL;estado=$ESTADO" "" ''
    confere_e_troca "sprint_atual=$sprint" "atual_estado=$ESTADO"
    printf 'registrado=%s\nsprint=%s\n' "$ESTADO" "$sprint" ;;
  abrir-sprint)
    # o modo é registrado uma vez: entrega por_trabalho registrada não abre sprint
    [ "$tem_m" = 0 ] || [ "$modo" = por_sprint ] || recusa "a entrega está registrada como $modo: --abrir-sprint só em por_sprint"
    if [ "$sprint" = "$NN" ]; then
      [ "$u_estado" != merged ] || recusa "a sprint $NN já está merged: sprint fechada é imutável (defeito vira task da sprint seguinte)"
      printf 'aberta=%s\nretomada=sim\n' "$NN"; exit 0
    fi
    [ "$p_sprint" = planejamento ] || recusa "a sprint $NN só abre depois do PR de planejamento (prs sem o item de planejamento)"
    esperado="$(proxima "${ultima_nn:-00}")"
    [ "$NN" = "$esperado" ] || recusa "sprint $NN fora de sequência: a próxima é a $esperado"
    [ "$u_estado" = merged ] || recusa "$(nome_pr "$u_sprint") não está merged: a sprint $NN só abre depois do merge dele (rode o E9, que o registra)"
    grava 0 "" "entrega=por_sprint;sprint_atual=$NN;pr_url=null;pr_estado=null;base_validada_sha=$BASE_VALIDADA;origem_base=registrada_sprint;atualizado_em=$hoje" "$NN"
    confere_e_troca "entrega=por_sprint" "sprint_atual=$NN" "atual_estado=null"
    printf 'aberta=%s\nbase_validada_sha=%s\norigem_base=registrada_sprint\n' "$NN" "$BASE_VALIDADA" ;;
esac
