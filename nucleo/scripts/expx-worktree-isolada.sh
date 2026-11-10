#!/usr/bin/env bash
# A árvore atual é a worktree que o Claude Code cria para um subagente com `isolation: "worktree"`?
# (CONTRATO-expx-orquestracao §15). Imprime `isolada` e sai 0; senão sai 1, sem imprimir.
#   bash expx-worktree-isolada.sh
# Vale para a raiz da worktree de quem chama, de qualquer subpasta dela: worktree vinculada (`git-dir` ≠
# `git-common-dir`), em `<raiz do checkout principal>/.claude/worktrees/agent-<id>`, na branch
# `worktree-agent-<id>` (a inicial, antes de qualquer troca), com a entrada igual no `git worktree list`.
# A F1 da sprintx e o E1 da runx o consultam antes de criar a worktree do trabalho: `isolada`, eles adotam esta.
# É detecção operacional, não fronteira de segurança: quem controla o repositório reproduz caminho e branch.
set -u
top="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
top="$(cd "$top" 2>/dev/null && pwd -P)" || exit 1
gd="$(git rev-parse --absolute-git-dir 2>/dev/null)" || exit 1
comum="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 1
gd="$(cd "$gd" 2>/dev/null && pwd -P)" || exit 1
comum="$(cd "$comum" 2>/dev/null && pwd -P)" || exit 1
# vinculada, e o diretório comum é o `.git` de um checkout (o principal)
[ "$gd" != "$comum" ] || exit 1
[ "${comum##*/}" = ".git" ] || exit 1
principal="${comum%/.git}"
nome="${top##*/}"
id="${nome#agent-}"
[ "$nome" = "agent-$id" ] || exit 1
case "$id" in "" | *[!A-Za-z0-9]*) exit 1 ;; esac
[ "$top" = "$principal/.claude/worktrees/agent-$id" ] || exit 1
[ "$(git branch --show-current 2>/dev/null)" = "worktree-agent-$id" ] || exit 1
# a entrada desta worktree no registro do Git, com a mesma branch (caminhos com `-z`, como o git os grava)
achou=1
caminho=""
while IFS= read -r -d '' linha; do
  case "$linha" in
    "worktree "*) caminho="$(cd "${linha#worktree }" 2>/dev/null && pwd -P)" ;;
    "branch refs/heads/worktree-agent-$id") [ "$caminho" = "$top" ] && achou=0 ;;
  esac
done < <(git worktree list --porcelain -z 2>/dev/null)
[ "$achou" -eq 0 ] || exit 1
echo isolada
