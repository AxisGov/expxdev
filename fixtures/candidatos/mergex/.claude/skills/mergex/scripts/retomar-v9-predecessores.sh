#!/usr/bin/env bash
# retomar-v9-predecessores — reabre apenas E8 bloqueado exclusivamente pela V9
# que passou a ser coberta por predecessores SprintX historicamente provados.
# Bash 3.2; sem jq, python, eval de dados ou opção de força.
set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
PREDS_SH="$AQUI/predecessores-sprintx.sh"
V9_SH="$AQUI/portao-v9.sh"
PERSISTE_SH="$AQUI/persistir-metodo.sh"
TRAVA_SH="$AQUI/trava-do-e1.sh"
RB_SH="$AQUI/reconciliacao-base.sh"
TMP_DIR=""; TMP_ARQ=""; TOKEN=""; LIBERA=0
NL='
'

encerra() {
  local rc="$1"
  [ -z "$TMP_ARQ" ] || rm -f "$TMP_ARQ"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  if [ "$LIBERA" = 1 ] && [ -n "$TOKEN" ]; then liberar "$TOKEN" >/dev/null 2>&1; fi
  exit "$rc"
}
trap 'encerra $?' EXIT
trap 'exit 1' HUP INT TERM

uso() {
  printf '%s\n' 'uso: retomar-v9-predecessores.sh --verificar|--aplicar --entrega <ENTREGA.md> --origem sprintx --trabalho <slug>' >&2
  exit 64
}
recusa() { printf 'retomar-v9-predecessores: %s\n' "$1" >&2; exit "${2:-3}"; }

MODO=""; ENTREGA=""; ORIGEM=""; TRABALHO=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --verificar|--aplicar) [ -z "$MODO" ] || uso; MODO="${1#--}"; shift ;;
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    *) uso ;;
  esac
done
case "$MODO" in verificar|aplicar) ;; *) uso ;; esac
[ "$ORIGEM" = sprintx ] || uso
case "$TRABALHO" in ''|*[!A-Za-z0-9._-]*|.*) uso ;; esac
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
[ "$ENTREGA" = "docs/entregas/$TRABALHO/ENTREGA.md" ] || uso
for dep in "$CATALOGO_SH" "$PREDS_SH" "$V9_SH" "$PERSISTE_SH" "$TRAVA_SH" "$RB_SH"; do
  [ -r "$dep" ] || recusa "dependencia indisponivel: $dep" 1
done
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"
set +e

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || recusa 'fora de um repositorio Git' 1
cd "$RAIZ" || recusa 'raiz Git inacessivel' 1
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-retomar-v9.XXXXXX")" || { TMP_DIR=""; recusa 'temporario indisponivel' 1; }

lista_topo() { # <arquivo> <chave>; somente lista inline [] ou bloco simples
  awk -v chave="$2" '
    NR==1 { if ($0!="---") exit 2; fm=1; next }
    fm && $0=="---" { exit }
    !fm { next }
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      k=$0; sub(/:.*/,"",k); dentro=(k==chave)
      if (dentro) { v=$0; sub(/^[^:]*:[[:space:]]*/,"",v); if (v=="[]") print "[]"; else if (v!="") exit 2 }
      next
    }
    dentro && /^  - / { print substr($0,5); next }
    dentro { exit 2 }
  ' "$1"
}

prova() {
  local head modo out rc pred desv branch_ativa branch_entrega
  [ -z "$(git status --porcelain=v1 --untracked-files=all 2>/dev/null)" ] \
    || { RET_ERRO='arvore ou stage sujo'; return 1; }
  head="$(git rev-parse --verify -q 'HEAD^{commit}' 2>/dev/null)" \
    || { RET_ERRO='HEAD nao e commit'; return 1; }
  modo="$(git ls-tree "$head" -- "$ENTREGA" 2>/dev/null | awk '{print $1}')"
  case "$modo" in 100644|100755) ;; *) RET_ERRO='ENTREGA.md ausente ou nao regular em HEAD'; return 1 ;; esac
  git cat-file blob "$head:$ENTREGA" > "$TMP_DIR/entrega-head" 2>/dev/null \
    || { RET_ERRO='ENTREGA.md de HEAD ilegivel'; return 1; }
  [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cmp -s "$ENTREGA" "$TMP_DIR/entrega-head" \
    || { RET_ERRO='ENTREGA.md do disco diverge de HEAD'; return 1; }
  [ "$(catalogo_fm "$TMP_DIR/entrega-head" kind)" = entrega ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" trabalho_id)" = "$TRABALHO" ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" expx_tool)" = sprintx ] \
    || { RET_ERRO='contexto da entrega diverge'; return 1; }
  branch_ativa="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" \
    || { RET_ERRO='HEAD destacado nao corresponde a branch da entrega'; return 1; }
  branch_entrega="$(catalogo_fm "$TMP_DIR/entrega-head" branch)"
  [ -n "$branch_entrega" ] && [ "$branch_ativa" = "$branch_entrega" ] \
    || { RET_ERRO='branch ativa diverge da entrega'; return 1; }
  [ "$(catalogo_fm "$TMP_DIR/entrega-head" estado)" = bloqueado ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" portao)" = bloqueado ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" falhas_portao)" = '[v9]' ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" causa)" = arquivo_fora_do_plano ] \
    || { RET_ERRO='estado terminal nao e bloqueio exclusivo da v9'; return 1; }
  [ "$(catalogo_fm "$TMP_DIR/entrega-head" push_feito)" = false ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" pr_url)" = null ] \
    && [ "$(catalogo_fm "$TMP_DIR/entrega-head" pr_estado)" = null ] \
    || { RET_ERRO='entrega ja tem publicacao ou estado remoto'; return 1; }
  [ "$(catalogo_fm "$TMP_DIR/entrega-head" reconciliacoes)" = '[]' ] \
    || { RET_ERRO='reconciliacao de base pendente'; return 1; }
  lista_topo "$TMP_DIR/entrega-head" desvios > "$TMP_DIR/desvios" 2>/dev/null \
    || { RET_ERRO='desvios ilegivel'; return 1; }
  grep -Fxq '[]' "$TMP_DIR/desvios" && { RET_ERRO='desvios vazios no bloqueio v9'; return 1; }
  LC_ALL=C sort -u "$TMP_DIR/desvios" -o "$TMP_DIR/desvios"

  out="$(bash "$PREDS_SH" --verificar --rev "$head" --trabalho "$TRABALHO" 2>/dev/null)"; rc=$?
  [ "$rc" = 0 ] && [ "$(printf '%s\n' "$out" | sed -n '1p')" = resultado=ok ] \
    || { RET_ERRO="predecessores sem prova valida (rc $rc)"; return 1; }
  printf '%s\n' "$out" | awk -F'\t' '$1=="predecessor" {print $2}' | LC_ALL=C sort -u > "$TMP_DIR/predecessores"
  [ -s "$TMP_DIR/predecessores" ] && cmp -s "$TMP_DIR/predecessores" "$TMP_DIR/desvios" \
    || { RET_ERRO='desvios antigos nao correspondem exatamente aos predecessores provados'; return 1; }
  out="$(bash "$V9_SH" --verificar --entrega "$ENTREGA" --origem sprintx --trabalho "$TRABALHO" 2>/dev/null)"; rc=$?
  [ "$rc" = 0 ] && grep -Fxq resultado=ok <<<"$out" \
    && ! grep -q '^fora_do_plano' <<<"$out" \
    || { RET_ERRO="v9 ainda nao esta integralmente verde (rc $rc)"; return 1; }
  RET_HEAD="$head"; RET_ERRO=""
  return 0
}

RET_ERRO=""; RET_HEAD=""
if [ "$MODO" = verificar ]; then
  prova || recusa "$RET_ERRO"
  printf 'ok=true\nhead=%s\nproxima=E2\n' "$RET_HEAD"
  exit 0
fi

[ -z "$(git diff --cached --name-only 2>/dev/null)" ] || recusa 'stage ja estava preenchido'
SAIDA_TRAVA="$(adquirir 'metodo:retomar-v9-predecessores')"; rc=$?
if [ "$rc" = 2 ]; then recusa 'indice ocupado pela trava C5' 2; fi
[ "$rc" = 0 ] || recusa 'nao foi possivel adquirir a trava C5' 1
TOKEN="$(printf '%s\n' "$SAIDA_TRAVA" | sed -n 's/^token=//p')"
[ -n "$TOKEN" ] || recusa 'trava adquirida sem token' 1
LIBERA=1
prova || recusa "$RET_ERRO"

# Reutiliza o editor atômico do registro da MergeX; os valores são constantes.
eval "$(awk '/^(_entrega_fecha|_entrega_troca|entrega_define)\(\) \{/,/^}$/' "$RB_SH")" \
  && declare -F entrega_define >/dev/null || recusa 'editor de frontmatter indisponivel' 1
cp "$ENTREGA" "$TMP_DIR/novo" || recusa 'nao foi possivel copiar ENTREGA.md' 1
ENTREGA_ERRO=""
entrega_define "$TMP_DIR/novo" estado aberto \
  && entrega_define "$TMP_DIR/novo" portao null \
  && entrega_define "$TMP_DIR/novo" portao_sha null \
  && entrega_define "$TMP_DIR/novo" falhas_portao '[]' \
  && entrega_define "$TMP_DIR/novo" causa null \
  && entrega_define "$TMP_DIR/novo" desvios '[]' \
  && entrega_define "$TMP_DIR/novo" atualizado_em "$(date +%Y-%m-%d)" \
  || recusa "ENTREGA.md nao pode ser reaberto: $ENTREGA_ERRO"
TMP_ARQ="$(mktemp "$(dirname "$ENTREGA")/.ENTREGA.md.retomar.XXXXXX")" \
  || { TMP_ARQ=""; recusa 'temporario atomico indisponivel' 1; }
{ cp -p "$ENTREGA" "$TMP_ARQ" && cat "$TMP_DIR/novo" > "$TMP_ARQ" && mv "$TMP_ARQ" "$ENTREGA"; } \
  || { rm -f "$TMP_ARQ"; TMP_ARQ=""; recusa 'gravacao atomica falhou' 1; }
TMP_ARQ=""

# O checkpoint oficial adota a mesma trava: não existe janela entre provar,
# gravar e persistir. O filho confere o token, mas o dono continua sendo este
# processo, que só libera depois do checkpoint concluído.
bash "$PERSISTE_SH" --persistir --trava-token "$TOKEN" --entrega "$ENTREGA" --origem sprintx \
  --trabalho "$TRABALHO" --checkpoint retomar-v9-predecessores \
  || recusa 'checkpoint retomar-v9-predecessores falhou; alteracao ficou pendente' 1
liberar "$TOKEN" >/dev/null 2>&1 || recusa 'nao foi possivel liberar a trava apos o checkpoint' 1
LIBERA=0; TOKEN=""
printf 'ok=true\nproxima=E2\n'
exit 0
