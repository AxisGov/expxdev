#!/usr/bin/env bash
# revisao-retroativa — o caminho estreito para a task fechada no E1 sem revisão aprovada
# (último item com `revisao: null` ou `invalida`) ganhar a revisão por task depois (DM-346).
#
# A mergex continua sem ler o resultado da revisão: quem grava a evidência é o `revisar
# --retroativa` do núcleo do expx, quem julga é o `conferir`. Este script só prova que a
# evidência é da task certa, faz UM commit só com as evidências e registra um item novo por
# task em `ENTREGA.commits`, com `revisao: ok`.
#
#   --listar     os commits registrados da task (via `sequencia-de-commits.sh`), SHA completo,
#                separados por vírgula: o `--commits` do `revisar --retroativa`. Uma task só.
#   --verificar  para cada task: o último item tem `revisao` null ou invalida e o commit dele não
#                é uma revisão retroativa; a evidência no disco tem `modo: retroativa` e
#                `commits_da_task` igual ao `--listar`; a árvore só tem essas evidências, com o
#                stage vazio; e o `conferir` responde `ok` sobre o commit simulado num índice
#                temporário (nenhuma ref muda).
#   --aplicar    sob a trava C5, refaz a prova, faz o commit com os trailers `Trabalho: W` e
#                `Revisao-retroativa: T1 T2 ...`, acrescenta um item por task com `revisao: ok` e
#                anota o desvio no corpo da ENTREGA (nunca em `desvios`, que é da V9). A ENTREGA
#                fica suja, como no E1, e o pre-e2 a persiste. Termina com `proxima=E2`.
#
# Uso:
#   revisao-retroativa.sh --listar|--verificar|--aplicar --entrega docs/entregas/<W>/ENTREGA.md \
#     --trabalho <W> -- <task>...
# Códigos: 0 ok; 1 ambiente; 2 trava ocupada; 3 recusa; 64 uso.
#
# Bash 3.2; sem jq, python, eval de dados ou opção de força.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEQ_SH="$AQUI/sequencia-de-commits.sh"
TRAVA_SH="$AQUI/trava-do-e1.sh"
CONTRATO_SH="$AQUI/contrato-de-commit.sh"
TMP_DIR=""; TOKEN=""; LIBERA=0

encerra() {
  local rc="$1"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  if [ "$LIBERA" = 1 ] && [ -n "$TOKEN" ]; then liberar "$TOKEN" >/dev/null 2>&1; fi
  exit "$rc"
}
trap 'encerra $?' EXIT
trap 'exit 1' HUP INT TERM

uso() {
  printf '%s\n' 'uso: revisao-retroativa.sh --listar|--verificar|--aplicar --entrega docs/entregas/<trabalho>/ENTREGA.md --trabalho <trabalho> -- <task>...' >&2
  exit 64
}
recusa() { printf 'revisao-retroativa: %s\n' "$1" >&2; exit "${2:-3}"; }

MODO=""; ENTREGA=""; TRABALHO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --listar|--verificar|--aplicar) [ -z "$MODO" ] || uso; MODO="${1#--}"; shift ;;
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    --) shift; break ;;
    *) uso ;;
  esac
done
case "$MODO" in listar|verificar|aplicar) ;; *) uso ;; esac
case "$TRABALHO" in ''|*[!A-Za-z0-9._-]*|.*) uso ;; esac
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
[ "$ENTREGA" = "docs/entregas/$TRABALHO/ENTREGA.md" ] || uso
[ "$#" -ge 1 ] || uso
[ "$MODO" != listar ] || [ "$#" = 1 ] || uso
TASKS=""
for t in "$@"; do
  case "$t" in ''|*[!A-Za-z0-9._-]*|[!A-Za-z0-9]*) uso ;; esac
  case " $TASKS " in *" $t "*) uso ;; esac
  TASKS="${TASKS:+$TASKS }$t"
done
for dep in "$SEQ_SH" "$TRAVA_SH" "$CONTRATO_SH"; do
  [ -r "$dep" ] || recusa "dependencia indisponivel: $dep" 1
done
# shellcheck source=sequencia-de-commits.sh
. "$SEQ_SH"
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"
set +e

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || recusa 'fora de um repositorio Git' 1
cd "$RAIZ" || recusa 'raiz Git inacessivel' 1
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-retroativa.XXXXXX")" || { TMP_DIR=""; recusa 'temporario indisponivel' 1; }

evidencia_de() { printf 'docs/entregas/%s/revisao/%s.json\n' "$TRABALHO" "$1"; }

if [ "$MODO" = listar ]; then
  lista="$(commits_da_task "$ENTREGA" "$TASKS" "$RAIZ")" || recusa "$ERRO"
  printf '%s\n' "$lista"
  exit 0
fi

MJS="$RAIZ/.expx/marketplace/plugins/expx/nucleo/scripts/expx-revisao.mjs"
nativo() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }

# le_evidencia <arquivo> — `modo<TAB>commits,...` da evidência, ou 1 quando não é JSON legível
le_evidencia() {
  node -e '
    const fs = require("fs");
    let j; try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(1); }
    const c = Array.isArray(j.commits_da_task) ? j.commits_da_task.join(",") : "";
    process.stdout.write(String(j.modo) + "\t" + c + "\n");
  ' "$(nativo "$1")" 2>/dev/null
}

# trailer_retroativo <commit> — o valor de `Revisao-retroativa` do commit (vazio sem o trailer)
trailer_retroativo() {
  local msg tr
  msg="$(git show -s --format=%B "$1" 2>/dev/null)" || return 1
  tr="$(printf '%s\n' "$msg" | git interpret-trailers --parse 2>/dev/null)" || return 1
  sed -n 's/^Revisao-retroativa:[[:space:]]*//p' <<<"$tr"
}

MENSAGEM="$TMP_DIR/mensagem"
printf 'chore(mergex): revisao retroativa de %s\n\nTrabalho: %s\nRevisao-retroativa: %s\n' \
  "$TASKS" "$TRABALHO" "$TASKS" > "$MENSAGEM"

prova() {
  local head revs t ultima rev sha lista ev saida modo commits linha xy caminho permitidos sim tree rc
  head="$(git rev-parse --verify -q 'HEAD^{commit}' 2>/dev/null)" || { RET_ERRO='HEAD nao e commit'; return 1; }
  git symbolic-ref --quiet HEAD >/dev/null 2>&1 || { RET_ERRO='HEAD destacado'; return 1; }
  case "$(git ls-tree "$head" -- "$ENTREGA" 2>/dev/null)" in
    "100644 blob "*|"100755 blob "*) ;;
    *) RET_ERRO='ENTREGA.md ausente ou nao regular em HEAD'; return 1 ;;
  esac
  git cat-file blob "$head:$ENTREGA" > "$TMP_DIR/entrega-head" 2>/dev/null \
    || { RET_ERRO='ENTREGA.md de HEAD ilegivel'; return 1; }
  [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cmp -s "$ENTREGA" "$TMP_DIR/entrega-head" \
    || { RET_ERRO='ENTREGA.md do disco diverge de HEAD'; return 1; }
  [ "$(limpa "$(escalar "$TMP_DIR/entrega-head" kind)")" = entrega ] \
    && [ "$(limpa "$(escalar "$TMP_DIR/entrega-head" trabalho_id)")" = "$TRABALHO" ] \
    || { RET_ERRO='contexto da entrega diverge'; return 1; }
  revs="$(revisoes "$TMP_DIR/entrega-head")" || { RET_ERRO="commits ilegivel: $ERRO"; return 1; }
  # o que o --acrescentar exige depois do commit é provado antes dele: a sequência válida e o
  # arquivo gravável. Senão o commit das evidências ficaria sem o item `ok` na ENTREGA.
  bash "$SEQ_SH" --validar "$ENTREGA" > /dev/null 2> "$TMP_DIR/validar.err" \
    || { RET_ERRO="sequencia de commits invalida: $(tr '\n' ' ' < "$TMP_DIR/validar.err")"; return 1; }
  [ -w "$ENTREGA" ] || { RET_ERRO='ENTREGA.md sem permissao de escrita'; return 1; }
  command -v node >/dev/null 2>&1 || { RET_ERRO='node ausente'; return 1; }
  [ -f "$MJS" ] || { RET_ERRO='nucleo sem expx-revisao.mjs'; return 1; }

  permitidos=" "
  for t in $TASKS; do
    ultima="$(awk -F'\t' -v t="$t" '$2 == t { r = $3 } END { print r }' <<<"$revs")"
    [ -n "$ultima" ] || { RET_ERRO="$t sem item em commits"; return 1; }
    case "$ultima" in
      null|invalida) ;;
      *) RET_ERRO="$t: o ultimo item tem revisao $ultima, nao null nem invalida"; return 1 ;;
    esac
    sha="$(ler "$TMP_DIR/entrega-head" | awk -F'\t' -v t="$t" '$3 == t { c = $4 } END { print c }')"
    sha="$(git rev-parse --verify -q "$(limpa "$sha")^{commit}" 2>/dev/null)" \
      || { RET_ERRO="$t: o commit do ultimo item nao existe"; return 1; }
    rev="$(trailer_retroativo "$sha")" || { RET_ERRO="$t: mensagem do commit ilegivel"; return 1; }
    [ -z "$rev" ] || { RET_ERRO="$t: o ultimo item ja e uma revisao retroativa"; return 1; }
    lista="$(commits_da_task "$TMP_DIR/entrega-head" "$t" "$RAIZ")" || { RET_ERRO="$t: $ERRO"; return 1; }
    ev="$(evidencia_de "$t")"
    [ -f "$ev" ] && [ ! -L "$ev" ] || { RET_ERRO="$t: evidencia ausente no disco ($ev)"; return 1; }
    saida="$(le_evidencia "$ev")" || { RET_ERRO="$t: evidencia ilegivel"; return 1; }
    modo="${saida%%	*}"; commits="${saida#*	}"
    [ "$modo" = retroativa ] || { RET_ERRO="$t: evidencia sem modo retroativa ($modo)"; return 1; }
    [ "$commits" = "$lista" ] \
      || { RET_ERRO="$t: commits_da_task diverge dos commits registrados (evidencia=$commits registrados=$lista)"; return 1; }
    permitidos="$permitidos$ev "
  done

  [ -z "$(git diff --cached --name-only 2>/dev/null)" ] || { RET_ERRO='stage ja estava preenchido'; return 1; }
  git status --porcelain=v1 --untracked-files=all > "$TMP_DIR/status" 2>/dev/null \
    || { RET_ERRO='git status falhou'; return 1; }
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    xy="${linha%"${linha#??}"}"; caminho="${linha#???}"
    case "$xy" in '??'|' M') ;; *) RET_ERRO="arvore suja fora das evidencias: $linha"; return 1 ;; esac
    case "$permitidos" in *" $caminho "*) ;; *) RET_ERRO="arvore suja fora das evidencias: $caminho"; return 1 ;; esac
  done < "$TMP_DIR/status"
  for ev in $permitidos; do
    awk -v c="$ev" 'substr($0, 4) == c { achou = 1 } END { exit !achou }' "$TMP_DIR/status" \
      || { RET_ERRO="evidencia sem mudanca para commitar: $ev"; return 1; }
  done

  # o commit simulado: índice temporário a partir do HEAD, nenhuma ref muda
  rm -f "$TMP_DIR/index"
  GIT_INDEX_FILE="$TMP_DIR/index" git read-tree "$head" 2>/dev/null \
    && GIT_INDEX_FILE="$TMP_DIR/index" git add -- $permitidos 2>/dev/null \
    && tree="$(GIT_INDEX_FILE="$TMP_DIR/index" git write-tree 2>/dev/null)" \
    && sim="$(GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-mergex}" GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-mergex@localhost}" \
              GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-mergex}" GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-mergex@localhost}" \
              git commit-tree "$tree" -p "$head" -F "$MENSAGEM" 2>/dev/null)" \
    || { RET_ERRO='commit simulado falhou'; return 1; }

  set -- conferir --trabalho "$TRABALHO" --modo obrigatoria --raiz "$(nativo "$RAIZ")"
  for t in $TASKS; do set -- "$@" --task "$t=$sim"; done
  node "$(nativo "$MJS")" "$@" > "$TMP_DIR/conferir" 2> "$TMP_DIR/conferir.err"; rc=$?
  [ "$rc" = 0 ] || { RET_ERRO="conferir sobre o commit simulado saiu $rc: $(tr '\n' ' ' < "$TMP_DIR/conferir")"; return 1; }
  printf '%s\n' $TASKS | awk '{ print $0 " ok" }' > "$TMP_DIR/esperado"
  cmp -s "$TMP_DIR/conferir" "$TMP_DIR/esperado" \
    || { RET_ERRO="conferir sobre o commit simulado fora da forma: $(tr '\n' ' ' < "$TMP_DIR/conferir")"; return 1; }
  RET_HEAD="$head"; RET_PERMITIDOS="$permitidos"; RET_TREE="$tree"; RET_ERRO=""
  return 0
}

RET_ERRO=""; RET_HEAD=""; RET_PERMITIDOS=""; RET_TREE=""
if [ "$MODO" = verificar ]; then
  prova || recusa "$RET_ERRO"
  printf 'ok=true\nhead=%s\ntasks=%s\nproxima=aplicar\n' "$RET_HEAD" "$TASKS"
  exit 0
fi

[ -z "$(git diff --cached --name-only 2>/dev/null)" ] || recusa 'stage ja estava preenchido'
SAIDA_TRAVA="$(adquirir 'metodo:revisao-retroativa')"; rc=$?
if [ "$rc" = 2 ]; then recusa 'indice ocupado pela trava C5' 2; fi
[ "$rc" = 0 ] || recusa 'nao foi possivel adquirir a trava C5' 1
TOKEN="$(printf '%s\n' "$SAIDA_TRAVA" | sed -n 's/^token=//p')"
[ -n "$TOKEN" ] || recusa 'trava adquirida sem token' 1
LIBERA=1
prova || recusa "$RET_ERRO"

git add -- $RET_PERMITIDOS || recusa 'git add das evidencias falhou' 1
# o que vai ao commit é o índice: ele tem de ser byte a byte a árvore que o conferir aprovou,
# senão uma evidência reescrita depois da prova entraria sem revisão
real="$(git write-tree 2>/dev/null)" || { git reset -q -- $RET_PERMITIDOS; recusa 'indice ilegivel depois do git add' 1; }
[ "$real" = "$RET_TREE" ] \
  || { git reset -q -- $RET_PERMITIDOS; recusa 'evidencia mudou depois da prova; rode --verificar de novo'; }
git commit -q -F "$MENSAGEM" || { git reset -q -- $RET_PERMITIDOS; recusa 'commit da revisao retroativa falhou' 1; }
NOVO="$(git rev-parse --verify -q 'HEAD^{commit}')" || recusa 'HEAD ilegivel depois do commit' 1
[ "$(git rev-parse --verify -q 'HEAD^')" = "$RET_HEAD" ] || recusa 'o commit nao saiu sobre o HEAD provado' 1
bash "$CONTRATO_SH" --validar-retroativa --trabalho "$TRABALHO" --tasks "$TASKS" --commit "$NOVO" >/dev/null \
  || recusa "commit $NOVO fora do contrato da revisao retroativa" 1

for t in $TASKS; do
  bash "$SEQ_SH" --acrescentar "$ENTREGA" "$t" "$NOVO" ok >/dev/null \
    || recusa "commit $NOVO feito, mas o item de $t nao entrou em commits" 1
done
# a nota de desvio vai ao corpo: `desvios` alimenta a V9 e não é lugar de revisão
grep -Fxq '## Revisão retroativa' "$ENTREGA" || printf '\n## Revisão retroativa\n\n' >> "$ENTREGA"
printf -- '- %s: commit %s revisou depois do fechamento (DM-346) as tasks %s, cujo E1 ficou sem revisão aprovada.\n' \
  "$(date +%Y-%m-%d)" "$NOVO" "$TASKS" >> "$ENTREGA" || recusa 'nota de desvio nao gravada' 1

liberar "$TOKEN" >/dev/null 2>&1 || recusa 'nao foi possivel liberar a trava' 1
LIBERA=0; TOKEN=""
printf 'ok=true\ncommit=%s\ntasks=%s\nproxima=E2\n' "$NOVO" "$TASKS"
exit 0
