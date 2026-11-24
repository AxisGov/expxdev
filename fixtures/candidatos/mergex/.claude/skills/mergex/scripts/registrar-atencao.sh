#!/usr/bin/env bash
# registrar-atencao — persiste a classificação E3 no registro da entrega.
#
# Uso: registrar-atencao.sh --entrega docs/entregas/<id>/ENTREGA.md
#        [--atencao <ATENCAO.md>]

set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RB_SH="$AQUI/reconciliacao-base.sh"
NL='
'

uso() {
  [ -z "${1:-}" ] || printf 'registrar-atencao: %s\n' "$1" >&2
  printf '%s\n' 'uso: registrar-atencao.sh --entrega <docs/entregas/<id>/ENTREGA.md> [--atencao <ATENCAO.md>]' >&2
  exit 64
}
recusa() { printf 'registrar-atencao: %s\n' "$1" >&2; exit 5; }
ambiente() { printf 'registrar-atencao: %s\n' "$1" >&2; exit 1; }

ENTREGA=""; ATENCAO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --atencao) [ "$#" -ge 2 ] || uso; ATENCAO="$2"; shift 2 ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done
[ -n "$ENTREGA" ] || uso 'falta --entrega'
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
case "$ENTREGA" in docs/entregas/*/ENTREGA.md) ;; *) uso '--entrega deve ser docs/entregas/<id>/ENTREGA.md' ;; esac
TRABALHO="${ENTREGA#docs/entregas/}"; TRABALHO="${TRABALHO%/ENTREGA.md}"
case "$TRABALHO" in ''|*/*|*[!A-Za-z0-9._-]*|.*) uso 'trabalho inválido' ;; esac

# Sem versionador o E3 classifica os arquivos declarados nas tasks (03-atencao-humana.md),
# e arquivos_alterados é essa união (00-schema.md): vale só com `versionado: false` gravado.
SEM_GIT=0
if ! RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  # só é "sem versionador" se não há repositório nenhum acima: um .git que o Git não
  # conseguiu ler (permissão, dono duvidoso) é erro de ambiente, não modo sem Git
  d="$(pwd -P)"
  while :; do
    [ ! -e "$d/.git" ] || ambiente "o Git não leu o repositório em $d; corrija o acesso e rode de novo"
    [ "$d" != / ] && [ -n "$d" ] || break
    d="$(dirname "$d")"
  done
  RAIZ="$(pwd -P)"; SEM_GIT=1
fi
ARQ="$RAIZ/$ENTREGA"
[ -f "$ARQ" ] && [ ! -L "$ARQ" ] || recusa "$ENTREGA não é arquivo regular"
# a pasta física é a do repositório: docs, entregas ou a pasta do trabalho como link
# levariam a gravação (o mv) para fora dele
RAIZ_REAL="$(cd "$RAIZ" && pwd -P)" || ambiente "não foi possível resolver $RAIZ"
PASTA_REAL="$(cd "$(dirname "$ARQ")" && pwd -P)" || ambiente "não foi possível resolver a pasta de $ENTREGA"
[ "$PASTA_REAL" = "$RAIZ_REAL/docs/entregas/$TRABALHO" ] \
  || recusa "a pasta de $ENTREGA resolve para $PASTA_REAL, fora de $RAIZ_REAL/docs/entregas/$TRABALHO: link simbólico no caminho"
# toda leitura de chave é do frontmatter: um exemplo YAML na prosa não conta
FM_TXT="$(awk 'NR == 1 { if ($0 !~ /^---[ \t]*\r?$/) exit; next } /^---[ \t]*\r?$/ { exit } { sub(/\r$/, ""); print }' "$ARQ")"
[ -n "$FM_TXT" ] || recusa "$ENTREGA não tem frontmatter"
# escalar <chave>: o valor de topo do frontmatter, sem aspas e sem comentário no fim da linha
escalar() {
  awk -v k="$1" 'index($0, k ":") == 1 {
    s = substr($0, length(k) + 2); sub(/^[[:space:]]+/, "", s)
    if (s ~ /^"/) { sub(/^"/, "", s); sub(/".*$/, "", s) }
    else if (s ~ /^\047/) { sub(/^\047/, "", s); sub(/\047.*$/, "", s) }
    else { sub(/[[:space:]]+#.*$/, "", s); sub(/[[:space:]]+$/, "", s) }
    print s; exit
  }' <<<"$FM_TXT"
}
if [ "$SEM_GIT" = 1 ]; then
  [ "$(escalar versionado)" = false ] \
    || ambiente 'o Git não resolveu a raiz do repositório, e o ENTREGA.md não declara versionado: false'
fi

# Um escritor por registro: a trava nasce em O_EXCL (set -C) antes da primeira leitura,
# e duas gravações seguidas não apagam a mescla uma da outra.
# O trap vem antes da trava e só apaga a trava que guarda o PID desta execução:
# um sinal entre a criação e qualquer atribuição não deixa a trava órfã, e a recusa
# por trava alheia não apaga a dos outros.
TRAVA="$ARQ.registrar-atencao.trava"
TMP_DIR=""; TMP_ARQ=""
limpar() {
  local rc="$1" dono=""
  [ -z "$TMP_ARQ" ] || rm -f "$TMP_ARQ"; [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  if [ -f "$TRAVA" ]; then IFS= read -r dono < "$TRAVA" 2>/dev/null || dono=""; fi
  [ "$dono" != "$$" ] || rm -f "$TRAVA"
  exit "$rc"
}
trap 'limpar $?' EXIT
trap 'exit 1' HUP INT TERM
( set -C; printf '%s\n' "$$" > "$TRAVA" ) 2>/dev/null \
  || recusa "outra gravação da atenção está em andamento ($TRAVA); se nenhuma está, apague a trava e rode de novo"
ID_REGISTRO="$(escalar trabalho_id)"
[ "$ID_REGISTRO" = "$TRABALHO" ] || recusa 'ENTREGA.md tem trabalho_id diferente do caminho'
[ -n "$ATENCAO" ] || ATENCAO="${ENTREGA%/ENTREGA.md}/ATENCAO.md"
case "$ATENCAO" in /*) ATENCAO_ARQ="$ATENCAO" ;; *) ATENCAO_ARQ="$RAIZ/${ATENCAO#./}" ;; esac
[ -f "$ATENCAO_ARQ" ] && [ ! -L "$ATENCAO_ARQ" ] || recusa "ATENCAO.md ausente: $ATENCAO"
grep -Fq '{{' "$ATENCAO_ARQ" && recusa 'ATENCAO.md ainda tem marcador {{...}}'

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-registrar-atencao.XXXXXX")" || ambiente 'não foi possível criar temporário'

# O formato da classificação é deliberadamente estreito: somente linhas de tabela
# cujo primeiro campo é um caminho entre crases, dentro das três seções do template.
CLASSIFICACAO="$TMP_DIR/classificacao.tsv"
awk '
  { sub(/\r$/, "") }
  /^##[[:space:]]+OLHO OBRIGAT/ { faixa="alta"; next }
  /^##[[:space:]]+LEITURA R/ { faixa="media"; next }
  /^##[[:space:]]+DISPENS/ { faixa="baixa"; next }
  /^##[[:space:]]/ { faixa=""; next }
  faixa != "" && $0 ~ /^\|[[:space:]]*`[^`]+`[[:space:]]*\|/ {
    linha=$0; sub(/^\|[[:space:]]*`/, "", linha); sub(/`[[:space:]]*\|.*/, "", linha)
    print linha "\t" faixa
  }
' "$ATENCAO_ARQ" > "$CLASSIFICACAO"

[ -s "$CLASSIFICACAO" ] || recusa 'ATENCAO.md não tem arquivos classificados nas três tabelas'
if awk -F '\t' 'seen[$1]++ { exit 1 }' "$CLASSIFICACAO"; then :; else recusa 'arquivo aparece em duas faixas no ATENCAO.md'; fi

# Lê a lista YAML tanto na forma curta quanto na forma com um caminho por linha.
ALTERADOS="$TMP_DIR/alterados"
awk '
  { sub(/\r$/, "") }
  /^arquivos_alterados:[[:space:]]*\[/ {
    s=$0; sub(/^[^\[]*\[/, "", s); sub(/\].*$/, "", s)
    # na lista em fluxo, aspas podem guardar vírgula: separar por vírgula mudaria os caminhos
    if (s ~ /["\047]/) { print "\001ASPAS"; next }
    n=split(s, a, ",")
    for (i=1; i<=n; i++) { gsub(/^[[:space:]"\047]+|[[:space:]"\047]+$/, "", a[i]); if (a[i] != "") print a[i] }
    next
  }
  /^arquivos_alterados:[[:space:]]*$/ { dentro=1; next }
  dentro && /^[A-Za-z_][A-Za-z0-9_]*:/ { dentro=0 }
  dentro && /^[[:space:]]*-[[:space:]]*/ { s=$0; sub(/^[[:space:]]*-[[:space:]]*/, "", s); gsub(/^["\047]|["\047]$/, "", s); print s }
' <<<"$FM_TXT" > "$ALTERADOS"
MODO_LIDO="$(escalar entrega)"
# por_trabalho substitui a lista; só a mescla por sprint precisa reler a antiga
if [ "$MODO_LIDO" = por_sprint ] && grep -q $'^\001ASPAS$' "$ALTERADOS"; then
  recusa 'arquivos_alterados em lista com aspas: o script não a relê com segurança; deixe um caminho por item, sem aspas'
fi

# O diff do E3 (03-atencao-humana.md, Passo 1): o que a branch fez desde que divergiu
# da base. Todo arquivo dele tem faixa; num renomeado basta a ponta nova, e as duas
# pontas entram em arquivos_alterados (00-schema.md).
EXIGIDOS="$TMP_DIR/exigidos"; DO_DIFF="$TMP_DIR/do_diff"
if [ "$SEM_GIT" = 1 ]; then
  # sem diff: a classificação já é dos arquivos declarados nas tasks
  cut -f1 "$CLASSIFICACAO" > "$DO_DIFF"
else
  BASE="$(escalar branch_base)"
  case "$BASE" in ''|null) recusa 'ENTREGA.md sem branch_base: o diff do E3 não tem base' ;; esac
  git -C "$RAIZ" rev-parse --verify -q "$BASE^{commit}" >/dev/null || recusa "branch_base $BASE não é um commit deste repositório"
  DIFF="$TMP_DIR/diff"
  git -C "$RAIZ" -c core.quotePath=false diff --name-status -M "$BASE...HEAD" > "$DIFF" \
    || ambiente "o Git não listou o diff $BASE...HEAD"
  awk -F '\t' '$1 ~ /^[RC]/ { print $3 > ex; print $2 > to; print $3 > to; next } NF >= 2 { print $2 > ex; print $2 > to }' \
    ex="$EXIGIDOS" to="$DO_DIFF" "$DIFF"
  [ -s "$EXIGIDOS" ] || recusa "o diff $BASE...HEAD está vazio: não há o que registrar"
  while IFS= read -r arquivo; do
    awk -F '\t' -v a="$arquivo" '$1 == a { achou = 1 } END { exit !achou }' "$CLASSIFICACAO" \
      || recusa "arquivo do diff sem faixa no ATENCAO.md: $arquivo"
  done < "$EXIGIDOS"
  while IFS=$'\t' read -r arquivo faixa; do
    grep -Fqx -- "$arquivo" "$DO_DIFF" || recusa "arquivo fora do diff $BASE...HEAD: $arquivo"
  done < "$CLASSIFICACAO"
fi
TODOS="$TMP_DIR/todos"
if [ "$MODO_LIDO" = por_sprint ]; then cat "$ALTERADOS" "$DO_DIFF"; else cat "$DO_DIFF"; fi | LC_ALL=C sort -u > "$TODOS"
# o caminho vai sem aspas para o YAML (lista em fluxo e `arquivo:`): o que mudaria o sentido
# dele lá é recusado, inclusive nos caminhos já gravados que a mescla por sprint reescreve
while IFS= read -r arquivo; do
  case "$arquivo" in
    *': '*|*' #'*|*,*|*'"'*|*"'"*|*'['*|*']'*|*'{'*|*'}'*|[-?:\&*!\|\>%@\`#]*|' '*|*' ') \
      recusa "caminho que o YAML sem aspas não guarda: $arquivo" ;;
  esac
  # escalar que o YAML lê como booleano, nulo ou número, e não como texto
  if grep -Eqi '^(y|n|yes|no|true|false|on|off|null|~)$|^[-+.0-9][-+.0-9_a-fA-FxXoO:]*$' <<<"$arquivo"; then
    recusa "caminho que o YAML sem aspas não guarda: $arquivo"
  fi
done < "$TODOS"
ALTERADOS_YAML="arquivos_alterados: [$(awk 'NR > 1 { printf ", " } { printf "%s", $0 }' "$TODOS")]"

MODO="$(escalar entrega)"
case "$MODO" in ''|por_trabalho) MODO=por_trabalho ;; por_sprint) ;; *) recusa 'ENTREGA.md tem entrega diferente de por_trabalho ou por_sprint' ;; esac

NOVAS="$TMP_DIR/novas.tsv"
cp "$CLASSIFICACAO" "$NOVAS"
LISTA="$TMP_DIR/lista.tsv"
if [ "$MODO" = por_sprint ]; then
  ANTIGAS="$TMP_DIR/antigas.tsv"
  awk '
    /^faixa_atencao:[[:space:]]*$/ { dentro=1; next }
    dentro && /^[A-Za-z_][A-Za-z0-9_]*:/ { dentro=0 }
    dentro && /^[[:space:]]*-[[:space:]]+arquivo:[[:space:]]*/ {
      s=$0; sub(/^[[:space:]]*-[[:space:]]+arquivo:[[:space:]]*/, "", s); sub(/\r$/, "", s); arq=s; next
    }
    dentro && arq != "" && /^[[:space:]]+faixa:[[:space:]]*/ {
      s=$0; sub(/^[[:space:]]+faixa:[[:space:]]*/, "", s); sub(/\r$/, "", s); print arq "\t" s; arq=""
    }
  ' <<<"$FM_TXT" > "$ANTIGAS"
  # o caminho é comparado inteiro: `a.sh` antigo fica mesmo que `src/a.sh` seja novo
  awk -F '\t' 'NR == FNR { novo[$1] = 1; next } !($1 in novo) { print }' "$NOVAS" "$ANTIGAS" >> "$LISTA"
fi
cat "$NOVAS" >> "$LISTA"

OLHO="$(awk -F '\t' '$2 == "alta" { n++ } END { print n+0 }' "$CLASSIFICACAO")"
LEITURA="$(awk -F '\t' '$2 == "media" { n++ } END { print n+0 }' "$CLASSIFICACAO")"
DISPENSAVEL="$(awk -F '\t' '$2 == "baixa" { n++ } END { print n+0 }' "$CLASSIFICACAO")"

FAIXAS='faixa_atencao:'
while IFS=$'\t' read -r arquivo faixa; do
  FAIXAS="$FAIXAS$NL  - arquivo: $arquivo$NL    faixa: $faixa"
done < "$LISTA"
ATENCAO_YAML="atencao:$NL  olho_obrigatorio: $OLHO$NL  leitura_rapida: $LEITURA$NL  dispensavel: $DISPENSAVEL"

[ -r "$RB_SH" ] || ambiente "editor de frontmatter indisponível: $RB_SH"
eval "$(awk '/^(_entrega_fecha|_entrega_troca|entrega_define)\(\) \{/,/^}$/' "$RB_SH")" \
  && declare -F _entrega_troca >/dev/null && declare -F entrega_define >/dev/null \
  || ambiente "editor de frontmatter indisponível: $RB_SH"

HOJE="$(date +%Y-%m-%d)" || ambiente 'data do sistema indisponível'
NOVO="$TMP_DIR/ENTREGA.md"
cp "$ARQ" "$NOVO" || ambiente "não foi possível copiar $ENTREGA"
_entrega_troca "$NOVO" arquivos_alterados "$ALTERADOS_YAML" \
  && _entrega_troca "$NOVO" atencao "$ATENCAO_YAML" \
  && _entrega_troca "$NOVO" faixa_atencao "$FAIXAS" \
  && entrega_define "$NOVO" atualizado_em "$HOJE" \
  || recusa "$ENTREGA: $ENTREGA_ERRO; nada foi gravado"

EVENTOS="$RAIZ/docs/eventos"
mkdir -p "$EVENTOS" || ambiente 'não foi possível criar docs/eventos'
[ "$(cd "$EVENTOS" && pwd -P)" = "$RAIZ_REAL/docs/eventos" ] \
  || recusa 'docs/eventos resolve para fora do repositório: link simbólico no caminho'
[ ! -L "$EVENTOS/$TRABALHO.jsonl" ] && [ ! -L "$EVENTOS/.gitignore" ] \
  || recusa 'o rastro em docs/eventos é link simbólico'
# o rastro é local (contrato expx-eventos): sem o ignore, ele suja a árvore e o
# branch-limpa barra toda troca de branch; o mesmo ignore do expx_rastro dos hooks
[ -f "$EVENTOS/.gitignore" ] || printf '# Rastro de eventos expx: local da maquina, nao versionado.\n*\n' > "$EVENTOS/.gitignore" \
  || ambiente 'não foi possível criar docs/eventos/.gitignore'
# e o Git confirma, antes de qualquer gravação, que o rastro fica fora da árvore:
# um .gitignore que já existia e não o ignora, ou o rastro já versionado, recusam
if [ "$SEM_GIT" = 0 ]; then
  git -C "$RAIZ" check-ignore -q --no-index "docs/eventos/$TRABALHO.jsonl" \
    || recusa "docs/eventos/$TRABALHO.jsonl não é ignorado pelo Git: o rastro sujaria a árvore; ignore docs/eventos/ (o .gitignore com * dentro dela)"
  ! git -C "$RAIZ" ls-files --error-unmatch "docs/eventos/$TRABALHO.jsonl" >/dev/null 2>&1 \
    || recusa "docs/eventos/$TRABALHO.jsonl está versionado: o rastro é local e não pode ser commitado"
fi
EVENTO="$TMP_DIR/evento.jsonl"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || ambiente 'hora do sistema indisponível'
printf '{"ts":"%s","expx_eventos":1,"trabalho_id":"%s","ferramenta":"mergex","origem":"skill","evento":"veredito_emitido","fase":"e3","task":null,"agente":"revisor-diff","resultado":"ok","detalhe":"%s olho obrigatorio, %s leitura rapida, %s dispensavel","arquivos":[]}\n' \
  "$TS" "$TRABALHO" "$OLHO" "$LEITURA" "$DISPENSAVEL" > "$EVENTO" || ambiente 'não foi possível montar o evento'

# o temporário nasce novo e exclusivo (mktemp) na mesma pasta: um link pré-criado
# com nome previsível não desvia a gravação
TMP_ARQ="$(mktemp "$PASTA_REAL/.ENTREGA.md.atencao.XXXXXX")" || { TMP_ARQ=""; ambiente "não foi possível criar o temporário ao lado de $ENTREGA"; }
{ cp -p "$ARQ" "$TMP_ARQ" && cat "$NOVO" > "$TMP_ARQ" && mv "$TMP_ARQ" "$ARQ"; } \
  || { rm -f "$TMP_ARQ"; TMP_ARQ=""; ambiente "não foi possível gravar $ENTREGA; o arquivo não foi alterado"; }
TMP_ARQ=""
cat "$EVENTO" >> "$EVENTOS/$TRABALHO.jsonl" || ambiente 'não foi possível gravar o evento'

printf '%s\n' 'registrado=atencao' "olho_obrigatorio=$OLHO" "leitura_rapida=$LEITURA" "dispensavel=$DISPENSAVEL"
