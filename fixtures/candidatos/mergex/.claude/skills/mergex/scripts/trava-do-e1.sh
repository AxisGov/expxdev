#!/usr/bin/env bash
# trava-do-e1 — a exclusão mútua do E1. O índice Git é recurso de DONO ÚNICO
# enquanto uma task fecha: na MESMA worktree, dois E1 nunca executam ao mesmo
# tempo.
#
# Contrato: references/01-commits.md, "A seção crítica do E1".
#
# Duas execuções do E1 na mesma worktree compartilham o mesmo índice, o mesmo
# HEAD, o mesmo `ENTREGA.commits` e o mesmo próximo `seq`. Sem exclusão, o
# `git add` de uma aparece no stage da outra, uma commita a mistura, a outra lê
# o HEAD que a primeira produziu, e as duas calculam o mesmo próximo `seq`. A
# C4 fez o resultado disso (lista com `seq` duplicado) PARAR como contrato
# inválido; esta trava impede que o estado seja criado.
#
#   1. O RECURSO É O ÍNDICE, não o repositório. Worktrees diferentes têm
#      índices independentes e podem fechar tasks em paralelo — uma trava no
#      diretório Git comum serializaria o repositório inteiro sem motivo.
#   2. A TRAVA MORA JUNTO DO ÍNDICE: `<git-path do index>.mergex-e1.lock`. É
#      área não versionada, é a mesma para todo processo daquela worktree, e é
#      outra para cada worktree. `.git` pode ser ARQUIVO (worktree vinculada),
#      então quem responde onde está o índice é o versionador — nunca `[ -d
#      .git ]`.
#   3. O MECANISMO É `mkdir`, não `flock`. A criação de diretório é atômica e
#      existe igual em Linux, macOS, Windows e Git Bash; `flock` não. Quem
#      criou o diretório é o dono.
#   4. O DONO SE IDENTIFICA POR TOKEN. Liberar é do dono: o token que o
#      `--adquirir` imprimiu é o que o `--liberar` exige. Nenhuma execução
#      remove a trava de outra.
#   5. TRAVA OCUPADA PARA — não espera, não expira, não é removida
#      automaticamente. PID pode ter sido reutilizado, o ambiente pode ser
#      outro e o stage pode estar preparado pela metade: "a trava parece
#      velha" não é prova de nada. Recuperação automática de queda não é
#      requisito desta versão; `--status` diagnostica e a decisão é humana.
#   6. O CONTEÚDO DA TRAVA REGISTRA O DONO — task, pid, instante, raiz, índice
#      e, no modo em dois tempos, origem/trabalho preparados. O diretório faz
#      a exclusão e o token autoriza a liberação; o contexto impede concluir
#      com outra task ou outro trabalho sobre o mesmo stage preparado.
#
# Uso:
#   trava-do-e1.sh --caminho            # onde fica a trava deste índice
#   trava-do-e1.sh --adquirir <task>    # cria a trava; imprime `trava=` e `token=`
#   trava-do-e1.sh --conferir <token>   # 0 quando a trava existe e é desta execução
#   trava-do-e1.sh --liberar <token>    # remove a trava do próprio dono
#   trava-do-e1.sh --status             # diagnóstico; nunca altera nada
#
# Códigos: 0 ok; 1 erro (fora de repositório, trava ausente, token errado);
#          2 trava OCUPADA por outra execução; 64 opção inválida.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

ERRO=""

SUFIXO_DA_TRAVA=".mergex-e1.lock"

# absoluto <caminho> <base> — deixa o caminho absoluto sem depender de
# `realpath`, que não existe em toda máquina suportada. `C:/...` é absoluto
# tanto quanto `/...`: no Git Bash o versionador devolve as duas formas.
absoluto() {
  case "$1" in
    /*|[A-Za-z]:[/\\]*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "${2%/}" "$1" ;;
  esac
}

raiz_da_worktree() {
  local r
  r="$(git rev-parse --show-toplevel 2>/dev/null)"
  [ -n "$r" ] || { ERRO="não é uma árvore de trabalho Git: $PWD"; return 1; }
  printf '%s\n' "$r"
}

# indice_da_worktree — o caminho real do índice DESTA worktree.
#
# `git rev-parse --git-path index` devolve `.git/index` na worktree principal e
# `<comum>/worktrees/<nome>/index` na vinculada, onde `.git` é um ARQUIVO. É o
# versionador que sabe a diferença; o teste de diretório erraria na vinculada.
# O caminho sai relativo ao diretório corrente, então é resolvido a partir da
# raiz — assim dois processos da mesma worktree chegam à mesma string, mesmo
# tendo entrado por subdiretórios diferentes.
indice_da_worktree() {
  local raiz p
  raiz="$(raiz_da_worktree)" || return 1
  p="$(cd "$raiz" && git rev-parse --git-path index 2>/dev/null)"
  [ -n "$p" ] || { ERRO="o versionador não informou o caminho do índice"; return 1; }
  absoluto "$p" "$raiz"
}

caminho_da_trava() {
  local i
  i="$(indice_da_worktree)" || return 1
  printf '%s%s\n' "$i" "$SUFIXO_DA_TRAVA"
}

# campo_do_dono <trava> <chave> — um campo do diagnóstico, ou vazio.
campo_do_dono() {
  [ -f "$1/dono" ] || return 0
  awk -v k="$2" -F= '{ sub(/\r$/, "") } $1 == k { sub(/^[^=]*=/, ""); print; exit }' "$1/dono"
}

# diagnostico <trava> — o que a trava conta sobre quem a tem, indentado.
diagnostico() {
  local t="$1" c
  for c in task origem trabalho pid instante raiz indice; do
    printf '  %s=%s\n' "$c" "$(campo_do_dono "$t" "$c")"
  done
}

# ---------------------------------------------------------------------------
# adquirir <task> — a seção crítica começa aqui, ANTES do primeiro `git add`.
#
# `mkdir` de um diretório que já existe falha, atomicamente, em todo sistema
# suportado: é essa falha que é a exclusão mútua. O diagnóstico é escrito
# depois de vencer a corrida — escrevê-lo antes exigiria um arquivo temporário
# que não decide nada.
# ---------------------------------------------------------------------------
adquirir() {
  local task="$1" trava token
  task="${task#"${task%%[![:space:]]*}"}"
  [ -n "$task" ] || { ERRO="--adquirir precisa do id da task"; return 1; }
  trava="$(caminho_da_trava)" || return 1
  if ! mkdir "$trava" 2>/dev/null; then
    if [ -d "$trava" ]; then
      ERRO="o E1 deste índice já tem dono"
      return 2
    fi
    ERRO="não foi possível criar a trava em $trava"
    return 1
  fi
  # `$$` distingue processos concorrentes; o resto só ajuda quem lê. O token
  # não é segredo e não é o mecanismo: o mecanismo é o diretório.
  token="e1-$$-$(date -u +%Y%m%d%H%M%S)-${RANDOM}${RANDOM}"
  {
    printf 'token=%s\n' "$token"
    printf 'task=%s\n' "$task"
    printf 'pid=%s\n' "$$"
    printf 'instante=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'raiz=%s\n' "$(raiz_da_worktree)"
    printf 'indice=%s\n' "$(indice_da_worktree)"
  } > "$trava/dono" || { ERRO="trava criada sem diagnóstico em $trava"; return 1; }
  printf 'trava=%s\n' "$trava"
  printf 'token=%s\n' "$token"
}

conferir() {
  local token="$1" trava
  [ -n "$token" ] || { ERRO="--conferir precisa do token"; return 1; }
  trava="$(caminho_da_trava)" || return 1
  [ -d "$trava" ] || { ERRO="não há trava neste índice"; return 1; }
  [ "$(campo_do_dono "$trava" token)" = "$token" ] && return 0
  ERRO="a trava deste índice é de outra execução do E1"
  return 1
}

# ---------------------------------------------------------------------------
# liberar <token> — só o dono libera.
#
# `rm -f` do diagnóstico e `rmdir` do diretório: nunca `rm -rf`. Se algo mais
# tiver sido posto ali dentro, o `rmdir` falha e a trava fica — o que é o
# comportamento conservador, porque significa que este processo não entende o
# estado que encontrou.
# ---------------------------------------------------------------------------
liberar() {
  local token="$1" trava
  [ -n "$token" ] || { ERRO="--liberar precisa do token"; return 1; }
  trava="$(caminho_da_trava)" || return 1
  [ -d "$trava" ] || { ERRO="não há trava neste índice para liberar"; return 1; }
  if [ "$(campo_do_dono "$trava" token)" != "$token" ]; then
    ERRO="a trava é de outra execução do E1: nada foi removido"
    return 2
  fi
  rm -f "$trava/dono"
  rmdir "$trava" 2>/dev/null || { ERRO="a trava não pôde ser removida: $trava"; return 1; }
}

# status — diagnóstico, e nada além disso. Não remove, não espera, não julga a
# idade da trava. A decisão sobre uma trava órfã é humana.
status() {
  local trava
  trava="$(caminho_da_trava)" || return 1
  printf 'trava=%s\n' "$trava"
  if [ -d "$trava" ]; then
    printf 'estado=ocupada\n'
    diagnostico "$trava"
    printf 'A trava não é removida automaticamente. Confirme que nenhum E1 está\n'
    printf 'em curso nesta worktree e, só então, remova o diretório acima à mão.\n'
    return 2
  fi
  printf 'estado=livre\n'
  return 0
}

# ---------------------------------------------------------------------------
# Executado como script: o CLI. Carregado com `.`: só as funções acima — é
# assim que o `fechamento-do-e1.sh` usa a trava, sem um segundo mecanismo.
# ---------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  rc=0
  case "${1:-}" in
    --caminho)
      [ "$#" -eq 1 ] || { printf 'trava-do-e1: --caminho\n' >&2; exit 64; }
      caminho_da_trava && exit 0; rc=$? ;;
    --adquirir)
      [ "$#" -eq 2 ] || { printf 'trava-do-e1: --adquirir <task>\n' >&2; exit 64; }
      adquirir "$2" && exit 0; rc=$? ;;
    --conferir)
      [ "$#" -eq 2 ] || { printf 'trava-do-e1: --conferir <token>\n' >&2; exit 64; }
      conferir "$2" && exit 0; rc=$? ;;
    --liberar)
      [ "$#" -eq 2 ] || { printf 'trava-do-e1: --liberar <token>\n' >&2; exit 64; }
      liberar "$2" && exit 0; rc=$? ;;
    --status)
      [ "$#" -eq 1 ] || { printf 'trava-do-e1: --status\n' >&2; exit 64; }
      status; exit $? ;;
    *) printf 'trava-do-e1: opção desconhecida: %s\n' "${1:-}" >&2; exit 64 ;;
  esac
  printf 'trava-do-e1: %s\n' "$ERRO" >&2
  exit "${rc:-1}"
fi
