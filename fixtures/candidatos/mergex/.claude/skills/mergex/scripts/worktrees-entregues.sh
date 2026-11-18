#!/usr/bin/env bash
# worktrees-entregues — lista as worktrees do repositório e remove a que já foi entregue.
#
# A F1 da sprintx abre uma worktree por feature, e nada a removia (DM-290). Removível é a
# worktree com branch, sem trava, sem submódulo, com o HEAD na base remota, sem alteração,
# sem arquivo novo e sem arquivo ignorado que não se refaça sozinho: dependência (`node_modules`),
# cache de Python e saída de build ou de cobertura (`dist/`, `coverage/`, DM-331). O rastro
# ignorado (`docs/eventos/`) bloqueia e aparece aqui: o descarte é decisão humana. A base vem
# do remoto, e comando que falha é "nao_verificado", nunca removível. A remoção não força nada, e a branch fica. Entregue é o HEAD ancestral da base: squash e
# rebase aparecem como `nao_entregue`, e fica a sobra, nunca a perda. Limite assumido: um
# arquivo ignorado criado entre a conferência e a remoção se perde; a janela é de milissegundos
# numa worktree sem sessão.
#
#   worktrees-entregues.sh --listar [--base <branch>]
#       estado<TAB>motivo<TAB>caminho<TAB>branch, uma worktree por linha
#   worktrees-entregues.sh --remover <caminho> [--base <branch>]
#       remove essa worktree se ela estiver removível; senão sai 1, com o motivo e, quando o
#       motivo é `ignorado`, cada caminho que ficaria perdido
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

# Dependencia, cache e saida de build se refazem sozinhos a partir do commit, que ja esta na base
# (DM-331). O resto do que esta ignorado e do dono. `dist/` e `coverage/` so contam como saida de
# build quando a pasta-mae tem um manifesto de build: uma pasta qualquer com esse nome pode
# guardar dado que nao se refaz (CodeAnt no conselhos-municipais#350).
# descartavel <caminho-ignorado> <worktree>
# gitignore_do_hook <arquivo> — 0 quando e o marcador exato que o hook grava.
# CRLF e aceito porque o rastro pode passar por checkout que normaliza linhas.
gitignore_do_hook() {
  local esperado conteudo
  esperado='# Rastro de eventos expx: local da maquina, nao versionado.
*
'
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  conteudo="$(tr -d '\r' < "$1" 2>/dev/null; printf .)" || return 1
  [ "$conteudo" = "${esperado}." ]
}
# so_gitignores_do_hook <lista> — 0 quando cada caminho da lista (um por linha) e `.gitignore` do hook
so_gitignores_do_hook() {
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in */.gitignore) gitignore_do_hook "$f" || return 1 ;; *) return 1 ;; esac
  done <<<"$1"
  return 0
}

descartavel() {
  local resto="$1" c="$2" pre="" comp m lista quebra NL=$'\n'
  case "$1" in
    node_modules/*|*/node_modules/*|__pycache__/*|*/__pycache__/*|.pytest_cache/*|*/.pytest_cache/*) return 0 ;;
    .mypy_cache/*|*/.mypy_cache/*|.ruff_cache/*|*/.ruff_cache/*) return 0 ;;
  esac
  # a pasta ignorada que so tem `.gitignore` (o `*` que o hook do rastro grava em docs/eventos/)
  # nao guarda nada: sem nenhum outro arquivo, sai junto (login, depois do DM-331)
  # So vale o `.gitignore` que e exatamente o do hook: outro conteudo foi escrito por alguem
  # e bloqueia. O `find` que falha numa parte da pasta nao a declara vazia (CodeAnt no
  # conselhos-municipais#354).
  case "$1" in
    # sem a pasta no .gitignore da raiz, o Git mostra o proprio `.gitignore` que se ignora
    .gitignore|*/.gitignore) gitignore_do_hook "$c/$1" && return 0 ;;
    # a lista e um caminho por linha: um nome com quebra de linha viraria varios caminhos, e cada
    # pedaco poderia ser um `.gitignore` do hook que existe. Nome assim bloqueia (CodeAnt no login#101)
    */) if [ -d "$c/$1" ] && lista="$(find "$c/$1" ! -type d -print 2>/dev/null)" \
          && quebra="$(find "$c/$1" -path "*$NL*" -print 2>/dev/null)" && [ -z "$quebra" ]; then
          so_gitignores_do_hook "$lista" && return 0
        fi ;;
  esac
  while [ -n "$resto" ]; do
    comp="${resto%%/*}"
    [ "$comp" != "$resto" ] || return 1 # ultimo componente: arquivo, nao pasta
    resto="${resto#*/}"
    case "$comp" in
      dist|coverage)
        for m in package.json pyproject.toml setup.py setup.cfg; do
          [ -f "$c/${pre:+$pre/}$m" ] && return 0
        done
        return 1 ;;
    esac
    pre="${pre:+$pre/}$comp"
  done
  return 1
}

# ignorados_com_valor <caminho> — o que esta ignorado e nao se refaz, um caminho por linha
ignorados_com_valor() {
  local x saida
  # `matching` mostra o caminho que casou no .gitignore (`packages/p/dist/`). Sem ele, a pasta
  # não versionada que só tem ignorados aparece inteira (`packages/`) e não se distingue do resto.
  saida="$(git -C "$1" status --ignored=matching --porcelain 2>/dev/null)" || return 1
  while IFS= read -r x; do
    case "$x" in '!! '*) descartavel "${x#'!! '}" "$1" || printf '%s\n' "${x#'!! '}" ;; esac
  done <<<"$saida"
}

# dona_do_pre_push <worktree> — 0 quando o pre-push efetivo e o chamador gerenciado da MergeX e
# guarda o validador DENTRO desta worktree pelo caminho absoluto: removida a worktree, todo push do
# repositorio para com "validador ausente" (login, depois do #96). O chamador relativo a raiz
# (`"$MERGEX_RAIZ"/...`) nao prende worktree nenhuma.
dona_do_pre_push() {
  local c="$1" hook v cfis vd vfis
  hook="$(git -C "$c" rev-parse --path-format=absolute --git-path hooks/pre-push 2>/dev/null)" || return 1
  [ -f "$hook" ] || return 1
  v="$(awk 'index($0, "MERGEX_PORTAO_PUSH=") == 1 { print substr($0, 20); exit }' "$hook" 2>/dev/null)"
  case "$v" in ''|'"$MERGEX_RAIZ"'*) return 1 ;; esac
  # o `--instalar` grava o caminho com `printf '%q'`: cada `\x` vale `x`. A forma `$'...'` (quebra
  # de linha, caractere de controle) nao se desfaz aqui, e na duvida a worktree e dona: bloqueia
  # (CodeAnt no login#101, DM-336). Apagar toda barra invertida perdia o `\` literal do caminho.
  case "$v" in "\$'"*) return 0 ;; esac
  v="${v#\"}"; v="${v%\"}"
  local d=""
  while [ -n "$v" ]; do
    case "$v" in
      '\'?*) d="$d${v:1:1}"; v="${v:2}" ;;
      *) d="$d${v:0:1}"; v="${v:1}" ;;
    esac
  done
  v="$d"
  cfis="$(cd -P -- "$c" 2>/dev/null && pwd -P)" || cfis="$c"
  vd="${v%/*}"; vfis="$(cd -P -- "$vd" 2>/dev/null && pwd -P)" || vfis="$vd"
  case "$v/" in "$c"/*) return 0 ;; esac
  case "$vfis/" in "$cfis"/*) return 0 ;; esac
  return 1
}

# julga <caminho> <branch> <travada> <head> — estado<TAB>motivo
julga() {
  local c="$1" b="$2" trava="$3" h="$4" saida ignorados
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
  ignorados="$(ignorados_com_valor "$c")" || { printf 'bloqueada\tnao_verificado'; return; }
  [ -z "$ignorados" ] || { printf 'bloqueada\tignorado'; return; }
  git merge-base --is-ancestor "$h" "$BASE" 2>/dev/null || { printf 'bloqueada\tnao_entregue'; return; }
  ! dona_do_pre_push "$c" || { printf 'bloqueada\tvalidador_do_pre_push'; return; }
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

# casca_da_worktree <caminho> — depois do `git worktree remove`: o Git for Windows tira a worktree do
# registro e deixa a pasta com as junctions do `node_modules` dos workspaces npm, pendentes porque o
# destino era a propria worktree (login, depois da 0.14.13). Sem nenhum arquivo comum, os links saem
# sem ser seguidos (o `find` nao segue link, e o Git Bash ve a junction como link) e depois as pastas
# vazias; com qualquer arquivo, a pasta fica e o caminho aparece. 0 quando nao sobrou nada.
casca_da_worktree() {
  local c="$1" comuns
  [ -e "$c" ] || [ -L "$c" ] || return 0
  if [ -L "$c" ] || [ ! -d "$c" ]; then
    echo "PARADO: o Git tirou a worktree do registro, mas $c continua no disco e nao e pasta" >&2; return 1
  fi
  comuns="$(find "$c" ! -type d ! -type l -print 2>/dev/null)" \
    || { echo "PARADO: o Git tirou a worktree do registro, mas nao consegui ler o que sobrou em $c" >&2; return 1; }
  if [ -n "$comuns" ]; then
    echo "PARADO: o Git tirou a worktree do registro, mas sobraram arquivos em $c (nada foi apagado):" >&2
    printf '%s\n' "$comuns" | sed 's/^/  /' >&2
    return 1
  fi
  find "$c" -type l -exec rm -f -- {} + 2>/dev/null
  find "$c" -depth -type d -empty -delete 2>/dev/null
  [ ! -e "$c" ] && [ ! -L "$c" ] && return 0
  echo "PARADO: o Git tirou a worktree do registro, mas $c nao saiu inteira; confira o que restou" >&2
  return 1
}

ALVO_GIT="$(git -C "$ALVO" rev-parse --show-toplevel 2>/dev/null)" || { echo "worktree inexistente: $ALVO" >&2; exit 1; }
[ "$(git rev-parse --show-toplevel 2>/dev/null)" != "$ALVO_GIT" ] || { echo "PARADO: rodando dentro da worktree: $ALVO" >&2; exit 1; }
TODAS="$(listar)" || exit 1
LINHA="$(awk -F '\t' -v a="$ALVO_GIT" '$3 == a' <<<"$TODAS")"
[ -n "$LINHA" ] || { echo "PARADO: nao e worktree deste repositorio: $ALVO" >&2; exit 1; }
case "$LINHA" in
  removivel*) git worktree remove "$ALVO_GIT" || exit 1; casca_da_worktree "$ALVO_GIT" || exit 1
    echo "removida: $ALVO_GIT" ;;
  *)
    MOTIVO="$(cut -f2 <<<"$LINHA")"
    echo "PARADO: $MOTIVO: $ALVO_GIT" >&2
    # O operador decide sem investigar: cada ignorado que se perderia, e o que fazer com ele.
    if [ "$MOTIVO" = ignorado ]; then
      ignorados_com_valor "$ALVO_GIT" | sed 's/^/  ignorado que nao se refaz: /' >&2
      echo "  guarde o que tiver valor (o rastro de docs/eventos/ e decisao do dono), apague o resto e rode de novo" >&2
    fi
    if [ "$MOTIVO" = validador_do_pre_push ]; then
      echo "  o pre-push instalado chama o validador desta worktree pelo caminho absoluto: sem ela, todo push para" >&2
      echo "  reinstale o chamador a partir do checkout principal (ativacao-pre-push.sh --reverter e depois --instalar) e rode de novo" >&2
    fi
    exit 1 ;;
esac
