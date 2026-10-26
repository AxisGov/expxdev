#!/usr/bin/env bash
# predecessores-sprintx — prova, pela árvore Git, predecessores declarados pela SprintX.
# Bash 3.2; somente leitura; sem jq, python ou eval.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
ARVORE_SH="$AQUI/reconciliacao-arvore.sh"
TAB=$'\t'
TMP_DIR=""

encerra() { local rc="$1"; [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"; exit "$rc"; }
trap 'encerra $?' EXIT
trap 'exit 3' HUP INT TERM

uso() {
  printf '%s\n' 'uso: predecessores-sprintx.sh --verificar --rev <sha> --trabalho <slug>' >&2
  exit 64
}

sem_prova() {
  printf 'resultado=v9_sem_prova\nmotivo\t%s\n' "$(printf '%s' "$1" | tr '\t\n\r' '   ')"
  exit 3
}

MODO=""; REV=""; TRABALHO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --rev) [ "$#" -ge 2 ] && [ -z "$REV" ] || uso; REV="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] && [ -z "$TRABALHO" ] || uso; TRABALHO="$2"; shift 2 ;;
    *) uso ;;
  esac
done
[ "$MODO" = verificar ] && [ -n "$REV" ] || uso
case "$TRABALHO" in ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto) uso ;; esac
[ -r "$CATALOGO_SH" ] && [ -r "$ARVORE_SH" ] || sem_prova 'dependencia indisponivel'
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
# shellcheck source=reconciliacao-arvore.sh
. "$ARVORE_SH"
arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || sem_prova 'fora de um repositorio Git'
cd "$RAIZ" || sem_prova 'raiz Git inacessivel'
FORMATO_OBJETOS="$(git rev-parse --show-object-format 2>/dev/null)" || sem_prova 'formato de objetos Git ilegivel'
case "$FORMATO_OBJETOS" in sha1) OID_LEN=40 ;; sha256) OID_LEN=64 ;; *) sem_prova "formato de objetos Git nao suportado: $FORMATO_OBJETOS" ;; esac
oid_valido() { [ "${#1}" -eq "$OID_LEN" ] && case "$1" in *[!0-9a-f]*) return 1 ;; *) return 0 ;; esac; }
arvore_recusa_raso || sem_prova "$ARVORE_ERRO"
REV_SHA="$(git rev-parse --verify -q "$REV^{commit}" 2>/dev/null)" || sem_prova 'revisao ausente ou nao e commit'
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-predecessores.XXXXXX")" || { TMP_DIR=""; sem_prova 'temporario indisponivel'; }

MANIFESTO="docs/sprintx/features/$TRABALHO/00-PREDECESSORES.md"
PLANEJAMENTO="docs/sprintx/features/$TRABALHO/00-PLANEJAMENTO.md"
linha="$(git ls-tree "$REV_SHA" -- "$MANIFESTO" 2>/dev/null)" || sem_prova 'arvore do manifesto ilegivel'
if [ -z "$linha" ]; then printf 'resultado=ausente\n'; exit 0; fi
modo="${linha%% *}"; resto="${linha#* }"; tipo="${resto%% *}"
case "$modo:$tipo" in 100644:blob|100755:blob) ;; *) sem_prova 'manifesto nao e blob regular' ;; esac
git cat-file blob "$REV_SHA:$MANIFESTO" > "$TMP_DIR/manifesto" 2>/dev/null || sem_prova 'manifesto ilegivel'

# O nascimento formal é a única adição do planejamento alcançável da revisão.
git log --format=%H --full-history --diff-filter=A "$REV_SHA" -- "$PLANEJAMENTO" > "$TMP_DIR/nascimentos" 2>/dev/null \
  || sem_prova 'historia do planejamento ilegivel'
n="$(grep -c . "$TMP_DIR/nascimentos")"
[ "$n" = 1 ] || sem_prova "nascimento do planejamento ambiguo ou ausente ($n)"
NASCIMENTO="$(sed -n '1p' "$TMP_DIR/nascimentos")"

# Parser fechado do frontmatter. Produz caminho/origem/papel/commit/blob.
# A forma inline [] é um estado explícito, validado contra o histórico abaixo.
awk -v out="$TMP_DIR/itens" -v estado="$TMP_DIR/estado" '
  function erro(m) { print m > "/dev/stderr"; exit 2 }
  function fecha( k) {
    if (!item) return
    if (!("caminho" in v) || !("origem" in v) || !("papel" in v) || !("commit_sha" in v) || !("blob_oid" in v)) erro("item incompleto")
    print v["caminho"] "\t" v["origem"] "\t" v["papel"] "\t" v["commit_sha"] "\t" v["blob_oid"] >> out
    delete v; item=0; itens++
  }
  NR==1 { if ($0!="---") erro("frontmatter sem abertura"); fm=1; next }
  fm && $0=="---" { fecha(); fechado=1; exit }
  !fm { next }
  /^  - caminho: / { if (!lista) erro("item fora da lista"); fecha(); item=1; v["caminho"]=substr($0,14); next }
  /^    (origem|papel|commit_sha|blob_oid): / {
    if (!item) erro("campo fora de item"); l=$0; sub(/^    /,"",l); k=l; sub(/:.*/,"",k); if (k in v) erro("campo repetido"); sub(/^[^:]*: /,"",l); v[k]=l; next
  }
  /^predecessores: \[\]$/ {
    if (lista || depois || ("predecessores" in topo)) erro("lista repetida")
    topo["predecessores"]=1; vazia=1; print "vazia" > estado; next
  }
  /^predecessores:$/ { if (lista || depois || ("predecessores" in topo)) erro("lista repetida"); lista=1; topo["predecessores"]=1; next }
  /^[a-z_][a-z_0-9]*: / {
    fecha(); if (lista) { lista=0; depois=1 }
    l=$0; k=l; sub(/:.*/,"",k)
    if (k!="expx_schema" && k!="expx_tool" && k!="kind" && k!="trabalho_id" && k!="criado_em" && k!="atualizado_em") erro("chave de topo desconhecida")
    if (k in topo) erro("chave repetida"); topo[k]=1; sub(/^[^:]*: /,"",l); val[k]=l; next
  }
  { erro("linha malformada") }
  END {
    if (!fechado) erro("frontmatter sem fechamento")
    if (val["expx_schema"]!="1" || val["expx_tool"]!="sprintx" || val["kind"]!="predecessores") erro("cabecalho invalido")
    if (val["trabalho_id"]=="") erro("trabalho ausente")
    if (!("predecessores" in topo)) erro("lista ausente")
    if (itens<1 && !vazia) erro("lista vazia fora da forma canonica")
    if (itens>0 && vazia) erro("lista vazia com itens")
    if (val["criado_em"] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/ || val["atualizado_em"] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) erro("data invalida")
  }
' "$TMP_DIR/manifesto" 2> "$TMP_DIR/parse.err"
rc=$?
[ "$rc" = 0 ] || sem_prova "manifesto malformado: $(tr '\n' ' ' < "$TMP_DIR/parse.err")"
# O trabalho no manifesto é conferido separadamente para manter a gramática simples.
trab_manifesto="$(sed -n 's/^trabalho_id:[[:space:]]*//p' "$TMP_DIR/manifesto" | head -n1)"
[ "$trab_manifesto" = "$TRABALHO" ] || sem_prova 'trabalho_id diverge do trabalho solicitado'

# Lista vazia só é N/A quando o Git prova que nenhum docs/superpowers/** existiu
# em qualquer commit alcançável estritamente anterior ao nascimento do plano.
if [ "$(cat "$TMP_DIR/estado" 2>/dev/null)" = vazia ]; then
  linha_pais="$(git rev-list --parents -n 1 "$NASCIMENTO" 2>/dev/null)" \
    || sem_prova 'pais do nascimento do planejamento ilegíveis'
  case "$linha_pais" in *' '*) pais="${linha_pais#* }" ;; *) pais="" ;; esac
  : > "$TMP_DIR/elegiveis"
  if [ -n "$pais" ]; then
    # Os pais são OIDs produzidos pelo Git; a expansão deliberada cobre merges.
    git log --format=%H --full-history $pais -- docs/superpowers > "$TMP_DIR/elegiveis" 2>/dev/null \
      || sem_prova 'histórico de predecessores elegíveis ilegível'
  fi
  [ ! -s "$TMP_DIR/elegiveis" ] \
    || sem_prova 'lista vazia com predecessor elegível estritamente anterior ao planejamento'
  printf 'resultado=n_a\nprova_n_a\tsem_predecessor_elegivel\t%s\n' "$NASCIMENTO"
  exit 0
fi

: > "$TMP_DIR/predecessores"; : > "$TMP_DIR/fora"; : > "$TMP_DIR/vistos"
while IFS="$TAB" read -r caminho origem papel commit blob; do
  [ -n "$caminho" ] || continue
  case "$caminho" in ""|/*|[A-Za-z]:/*|./*|*/./*|*/.|../*|*/../*|*/..|*//*|*\\*|*\**|*\?*|*\[*|*\]*) sem_prova "caminho nao canonico: $caminho" ;; esac
  case "$caminho" in docs/superpowers/*) ;; *) sem_prova "predecessor fora de docs/superpowers: $caminho" ;; esac
  case "$caminho" in *': '*|*:|*' #'*|*$'\t'*|*$'\n'*|*$'\r'*) sem_prova "caminho inseguro para scalar YAML: $caminho" ;; esac
  LC_ALL=C
  case "$caminho" in *[!\ -~]*|*' ') sem_prova "caminho fora do subconjunto YAML seguro: $caminho" ;; esac
  case "$caminho" in docs/sprintx/features/"$TRABALHO"/*|docs/entregas/"$TRABALHO"/*) sem_prova "predecessor dentro do trabalho: $caminho" ;; esac
  grep -Fqx "$caminho" "$TMP_DIR/vistos" && sem_prova "caminho duplicado: $caminho"
  printf '%s\n' "$caminho" >> "$TMP_DIR/vistos"
  [ "$origem" = superpowers ] || sem_prova "origem fora do enum: $origem"
  case "$papel" in especificacao|plano) ;; *) sem_prova "papel fora do enum: $papel" ;; esac
  oid_valido "$commit" || sem_prova "commit_sha invalido: $caminho"
  oid_valido "$blob" || sem_prova "blob_oid invalido: $caminho"
  git cat-file -e "$commit^{commit}" 2>/dev/null || sem_prova "commit predecessor ausente: $commit"
  git merge-base --is-ancestor "$commit" "$REV_SHA" >/dev/null 2>&1 || sem_prova "commit predecessor nao alcancavel: $caminho"
  [ "$commit" != "$NASCIMENTO" ] && git merge-base --is-ancestor "$commit" "$NASCIMENTO" >/dev/null 2>&1 \
    || sem_prova "predecessor nao antecede estritamente o planejamento: $caminho"
  l_commit="$(git ls-tree "$commit" -- "$caminho" 2>/dev/null)" || sem_prova "objeto predecessor ilegivel: $caminho"
  m_commit="${l_commit%% *}"; r_commit="${l_commit#* }"; t_commit="${r_commit%% *}"; r_commit="${r_commit#* }"; oid_commit="${r_commit%%$TAB*}"
  case "$m_commit:$t_commit" in 100644:blob|100755:blob) ;; *) sem_prova "predecessor nao e blob regular: $caminho" ;; esac
  [ "$oid_commit" = "$blob" ] || sem_prova "blob declarado diverge do predecessor: $caminho"
  l_head="$(git ls-tree "$REV_SHA" -- "$caminho" 2>/dev/null)" || sem_prova "objeto atual ilegivel: $caminho"
  if [ -z "$l_head" ]; then
    printf 'fora_do_plano\t%s\tblob_divergente\n' "$caminho" >> "$TMP_DIR/fora"
    continue
  fi
  m_head="${l_head%% *}"; r_head="${l_head#* }"; t_head="${r_head%% *}"; r_head="${r_head#* }"; oid_head="${r_head%%$TAB*}"
  case "$m_head:$t_head" in 100644:blob|100755:blob) ;; *) printf 'fora_do_plano\t%s\tblob_divergente\n' "$caminho" >> "$TMP_DIR/fora"; continue ;; esac
  if [ "$oid_head" != "$blob" ]; then
    printf 'fora_do_plano\t%s\tblob_divergente\n' "$caminho" >> "$TMP_DIR/fora"
  else
    printf 'predecessor\t%s\t%s\t%s\n' "$caminho" "$commit" "$blob" >> "$TMP_DIR/predecessores"
  fi
done < "$TMP_DIR/itens"

if [ -s "$TMP_DIR/fora" ]; then
  printf 'resultado=v9\n'; cat "$TMP_DIR/predecessores"; cat "$TMP_DIR/fora"; exit 1
fi
[ -s "$TMP_DIR/predecessores" ] || sem_prova 'manifesto sem predecessor comprovado'
printf 'resultado=ok\n'; cat "$TMP_DIR/predecessores"
exit 0
