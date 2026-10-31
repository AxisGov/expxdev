#!/usr/bin/env bash
# worktrees-entregues — lista as worktrees do repositório e remove a que já foi entregue.
#
# A F1 da sprintx abre uma worktree por feature, e nada a removia (DM-290). Removível é a
# worktree com branch, sem trava, sem submódulo, com o HEAD na base remota, sem alteração,
# sem arquivo novo e sem arquivo ignorado que não seja dependência (`node_modules`, caches de
# Python). O rastro ignorado (`docs/eventos/`) bloqueia e aparece aqui: o descarte é decisão
# humana. A base vem do remoto, e comando que falha é "nao_verificado", nunca removível. A
# remoção não força nada, e a branch fica. Entregue é o HEAD ancestral da base: squash e
# rebase aparecem como `nao_entregue`, e fica a sobra, nunca a perda. Limite assumido: um
# arquivo ignorado criado entre a conferência e a remoção se perde; a janela é de milissegundos
# numa worktree sem sessão.
#
#   worktrees-entregues.sh --listar [--base <branch>]
#       estado<TAB>motivo<TAB>caminho<TAB>branch, uma worktree por linha
#   worktrees-entregues.sh --remover <caminho> [--base <branch>]
#       remove essa worktree se ela estiver removível; senão sai 1, com o motivo
set -uo pipefail

ACAO=""; ALVO=""; BASE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --listar) ACAO=listar; shift ;;
    --remover) ACAO=remover; ALVO="${2:-}"; shift 2 || exit 2 ;;
    --base) BASE="${2:-}"; shift 2 || exit 2 ;;
    *) echo "uso: worktrees-entregues.sh --listar | --remover <caminho> [--base <ref>]" >&2; exit 2 ;;
  esac
done
[ -n "$ACAO" ] || { echo "uso: worktrees-entregues.sh --listar | --remover <caminho> [--base <ref>]" >&2; exit 2; }

[ -n "$BASE" ] || BASE="$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)" || BASE=""
BASE="${BASE#origin/}"; BASE="${BASE:-main}"
# A base local pode estar velha ou adiantada: quem diz o que foi entregue é o remoto.
if git fetch -q origin "+refs/heads/$BASE:refs/remotes/origin/$BASE" 2>/dev/null; then
  BASE_OK=1
else
  BASE_OK=0
fi
BASE="refs/remotes/origin/$BASE"

# So dependencia e cache se refazem sozinhos. O resto do que esta ignorado e do dono.
descartavel() {
  case "$1" in
    node_modules/*|*/node_modules/*|__pycache__/*|*/__pycache__/*|.pytest_cache/*|*/.pytest_cache/*) return 0 ;;
  esac
  return 1
}

# julga <caminho> <branch> <travada> <head> — estado<TAB>motivo
julga() {
  local c="$1" b="$2" trava="$3" h="$4" saida ignorados x
  [ "$trava" = 0 ] || { printf 'bloqueada\ttravada'; return; }
  [ -n "$b" ] || { printf 'bloqueada\tsem_branch'; return; }
  [ "$BASE_OK" = 1 ] || { printf 'bloqueada\tnao_verificado'; return; }
  saida="$(git -C "$c" ls-files -s 2>/dev/null | awk '$1 == "160000"')" || { printf 'bloqueada\tnao_verificado'; return; }
  [ -z "$saida" ] && [ ! -e "$c/.gitmodules" ] || { printf 'bloqueada\tsubmodulo'; return; }
  saida="$(git -C "$c" status --porcelain 2>/dev/null)" || { printf 'bloqueada\tnao_verificado'; return; }
  [ -z "$saida" ] || { printf 'bloqueada\talterada'; return; }
  # `assume-unchanged` e `skip-worktree` escondem a alteração do status.
  saida="$(git -C "$c" ls-files -v 2>/dev/null | awk '/^[a-zS]/')" || { printf 'bloqueada\tnao_verificado'; return; }
  [ -z "$saida" ] || { printf 'bloqueada\toculta'; return; }
  ignorados="$(git -C "$c" status --ignored --porcelain 2>/dev/null)" || { printf 'bloqueada\tnao_verificado'; return; }
  while IFS= read -r x; do
    case "$x" in '!! '*) descartavel "${x#'!! '}" || { printf 'bloqueada\tignorado'; return; } ;; esac
  done <<<"$ignorados"
  git merge-base --is-ancestor "$h" "$BASE" 2>/dev/null || { printf 'bloqueada\tnao_entregue'; return; }
  printf 'removivel\t-'
}

# Registros NUL de `worktree list --porcelain -z`: caminho com quebra de linha não vira outro
# registro. O primeiro bloco é o checkout principal.
listar() {
  local n=0 c="" b="" t=0 h="" morto=0 l lista
  lista="$(mktemp)" || return 2
  # Em arquivo, para o status do comando contar: `-z` existe desde o Git 2.36.
  git worktree list --porcelain -z > "$lista" 2>/dev/null || {
    rm -f "$lista"; echo "git worktree list falhou (exige Git 2.36 ou mais novo)" >&2; return 2
  }
  while IFS= read -r -d '' l; do
    case "$l" in
      'worktree '*) c="${l#worktree }"; b=""; t=0; h=""; morto=0 ;;
      'HEAD '*) h="${l#HEAD }" ;;
      'branch refs/heads/'*) b="${l#branch refs/heads/}" ;;
      locked*) t=1 ;;
      prunable*) morto=1 ;;
      '')
        n=$((n + 1))
        if [ "$n" -gt 1 ] && [ -n "$c" ]; then
          if [ "$morto" = 1 ] || [ ! -d "$c" ]; then printf 'bloqueada\tregistro_morto\t%s\t%s\n' "$c" "$b"
          else printf '%s\t%s\t%s\n' "$(julga "$c" "$b" "$t" "$h")" "$c" "$b"; fi
        fi
        c="" ;;
    esac
  done < "$lista"
  rm -f "$lista"
  [ "$n" -gt 0 ] || { echo "git worktree list vazio" >&2; return 2; }
}

if [ "$ACAO" = listar ]; then listar; exit $?; fi

ALVO_GIT="$(git -C "$ALVO" rev-parse --show-toplevel 2>/dev/null)" || { echo "worktree inexistente: $ALVO" >&2; exit 1; }
[ "$(git rev-parse --show-toplevel 2>/dev/null)" != "$ALVO_GIT" ] || { echo "PARADO: rodando dentro da worktree: $ALVO" >&2; exit 1; }
TODAS="$(listar)" || exit 1
LINHA="$(awk -F '\t' -v a="$ALVO_GIT" '$3 == a' <<<"$TODAS")"
[ -n "$LINHA" ] || { echo "PARADO: nao e worktree deste repositorio: $ALVO" >&2; exit 1; }
case "$LINHA" in
  removivel*) git worktree remove "$ALVO_GIT" || exit 1; echo "removida: $ALVO_GIT" ;;
  *) echo "PARADO: $(cut -f2 <<<"$LINHA"): $ALVO_GIT" >&2; exit 1 ;;
esac
