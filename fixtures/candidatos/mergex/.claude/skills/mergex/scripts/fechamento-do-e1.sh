#!/usr/bin/env bash
# fechamento-do-e1 — a seção crítica do E1, do primeiro `git add` à lista
# `ENTREGA.commits` validada, sob a trava do índice desta worktree.
#
# Contrato: references/01-commits.md, "A seção crítica do E1";
# references/00-schema.md, "A ordem de registro — a chave `seq`".
#
# A execução das tasks pode ser paralela. O FECHAMENTO delas é serial: o índice
# Git é de dono único. Este é o trecho inteiro que roda sob a trava, e nesta
# ordem:
#
#   A. staging da task           D. `git commit`
#   B. verificação do diff       E. captura do identificador produzido
#      em stage                  F. `sequencia-de-commits.sh --acrescentar`
#   C. verificações do E1        G. validação da lista final
#
# Só depois de G a trava é liberada. A atribuição do `seq` acontece DENTRO da
# seção — é isso que impede duas sessões de calcularem o mesmo próximo número.
#
#   1. A TRAVA VEM ANTES DO PRIMEIRO `git add`. Travar depois de montar o
#      stage é não travar: a mistura de arquivos já teria acontecido.
#   2. STAGE NÃO VAZIO NA ENTRADA PARA. Não importa se o que está lá parece
#      ser da task atual: não existe prova durável de que este E1 o preparou.
#      Nada de `reset`, `restore --staged`, `stash`, limpeza ou commit do que
#      se encontrou — o stage fica exatamente como estava, e os caminhos vão
#      no relatório.
#   3. FALHA É FECHADA. Trava ocupada, stage sujo, verificação reprovada,
#      commit recusado: PARA, sem limpeza destrutiva e sem tocar no que é de
#      outra execução.
#   4. COMMIT FEITO E REGISTRO NÃO CONCLUÍDO NÃO GERA SEGUNDO COMMIT. O
#      desfecho é relatado como o que é — `commit Git existe; registro E1 não
#      foi concluído` —, e a V11 do portão (E2) é quem cobra a prova que falta.
#   5. NADA DE RENUMERAR. Se a lista ficar inválida depois do append, PARA:
#      escolher outro número esconderia o registro perdido (`00-schema.md`).
#
# Uso:
#   fechamento-do-e1.sh --fechar --entrega <ENTREGA.md> --task <id> \
#       --mensagem <arquivo> [--verificacao <comando>] -- <caminho>...
#       a seção crítica inteira, num processo só.
#
#   fechamento-do-e1.sh --preparar --entrega <ENTREGA.md> --task <id> \
#       --mensagem <arquivo> -- <caminho>...
#       A a C, e a trava FICA ADQUIRIDA. Imprime `token=`. É o modo do agente:
#       a varredura de segredo do E1 é julgamento humano sobre `git diff
#       --cached`, e ela precisa acontecer DENTRO da seção crítica.
#
#   fechamento-do-e1.sh --concluir --entrega <ENTREGA.md> --task <id> \
#       --mensagem <arquivo> --token <token>
#       D a G, sob a mesma trava, e libera.
#
#   fechamento-do-e1.sh --status      # diagnóstico da trava desta worktree
#
#   fechamento-do-e1.sh --registrar-existente --entrega <ENTREGA.md> \
#       --origem <sprintx|runx> --trabalho <id> --task <id> --sha <40-hex>
#       recupera somente o registro de um commit E1 já existente e alcançável.
#
# Ordem normativa combinada (P0.2-C7-B — compõe contexto, C1 e C5):
#   1 resolver worktree/índice   6 git add                10 validar commit
#   2 adquirir a trava do E1     7 diff em stage          11 capturar SHA
#   3 stage inicial vazio?       8 demais verificações    12 acrescentar em
#   4 contexto + footers         9 git commit                 ENTREGA.commits
#   5 ownership unitário da                              13 validar a lista
#     task (ownership-da-task.sh)                         14 liberar a trava
# O ownership (5) roda DEPOIS da checagem de stage (3) e ANTES de qualquer
# `git add` (6): ele prova de quem é o ARQUIVO/TASK, nunca de quem é o
# ÍNDICE. Se o stage de entrada já não estava vazio, a regra 3 (DM-138) já
# parou antes de chegar aqui — o ownership nunca "explica" ou autoriza um
# stage preexistente.
#
# M4 — o ownership (5) classifica a ÁRVORE INTEIRA, não só os caminhos que o
# chamador listou (DM-172). Antes dele, `git status --porcelain -z
# --untracked-files=all` inventaria tudo o que está dirty; o que o catálogo de
# método do trabalho corrente reconhece (catalogo-de-metodo.sh, o mesmo do M2)
# fica fora do E1 e espera o checkpoint; TODO o resto é produto e passa pelo
# classificador junto com os caminhos dados. A lista do chamador nunca limita
# a barreira: se o hook de escopo da skill de origem estourou o timeout ou foi
# contornado, o arquivo de task irmã ainda é encontrado aqui. E o ownership
# não autoriza inclusão (DM-173): entra no commit só o que o chamador LISTOU;
# produto da task atual alterado e não listado para o E1 (código 11), porque
# na mesma worktree ele pode ser trabalho de outra execução em voo.
#
# Códigos:
#   0  seção crítica concluída (ou preparada, no `--preparar`)
#   2  E1 OCUPADO — outra execução tem a seção crítica deste índice
#   3  o índice já tinha conteúdo em stage na entrada
#   4  verificação reprovou ANTES do commit — nenhum commit foi criado
#   5  `git commit` falhou — nenhum registro de E1 foi escrito
#   6  o commit existe e o append em `ENTREGA.commits` falhou
#   7  o commit e o item existem e a lista final não valida
#   8  `arquivo_de_task_irma` — arquivo planejado em outra task da feature;
#      nenhum `git add` ocorreu; a trava desta execução foi liberada
#   9  ownership não determinável (plano legado, task fora do formato,
#      árvore ou catálogo de método ilegível, conflito não resolvido);
#      nenhum `git add` ocorreu; a trava desta execução foi liberada
#   10 desvio — arquivo fora de todas as tasks do trabalho corrente;
#      nenhum `git add` ocorreu; a alteração fica preservada na árvore
#   11 produto da task atual alterado e NÃO listado no E1 — o ownership não
#      autoriza inclusão automática; nenhum `git add` ocorreu
#   64 uso inválido
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAVA_SH="$AQUI/trava-do-e1.sh"
SEQ_SH="$AQUI/sequencia-de-commits.sh"
CONTRATO_COMMIT_SH="$AQUI/contrato-de-commit.sh"
# OWNERSHIP_SH é obrigatório quando a ENTREGA declara sprintx/runx. Ausente,
# a instalação MergeX está incompleta e o E1 falha fechado antes do staging.
OWNERSHIP_SH="$AQUI/ownership-da-task.sh"
# CATALOGO_SH separa método de produto no inventário da árvore (M4). Mesma
# regra: ausente em trabalho task-based, o E1 para antes do staging.
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"

for f in "$TRAVA_SH" "$SEQ_SH" "$CONTRATO_COMMIT_SH"; do
  [ -f "$f" ] || { printf 'fechamento-do-e1: falta %s\n' "$f" >&2; exit 1; }
done
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"

TOKEN=""
LIBERAR_NA_SAIDA=0
RECOVERY_DIFF=""
INVENTARIO_TMP=""
CATALOGO_TMP=""

# A trava só é liberada pelo dono, e o código de saída nunca é mascarado: o
# `rc` é capturado antes de qualquer outra coisa acontecer.
encerrar() {
  local rc="$1"
  [ -z "$RECOVERY_DIFF" ] || rm -f "$RECOVERY_DIFF"
  [ -z "$INVENTARIO_TMP" ] || rm -f "$INVENTARIO_TMP"
  [ -z "$CATALOGO_TMP" ] || rm -f "$CATALOGO_TMP"
  if [ "$LIBERAR_NA_SAIDA" = 1 ] && [ -n "$TOKEN" ]; then
    liberar "$TOKEN" >/dev/null 2>&1
  fi
  exit "$rc"
}
trap 'encerrar $?' EXIT

uso() { printf 'fechamento-do-e1: %s\n' "$1" >&2; exit 64; }

para() { # <código> <título> [linha]...
  local rc="$1" titulo="$2"; shift 2
  printf 'mergex E1 %s\n' "$titulo" >&2
  while [ "$#" -gt 0 ]; do printf '%s\n' "$1" >&2; shift; done
  exit "$rc"
}

fm() { # <arquivo> <chave>
  [ -r "$1" ] || return 0
  awk -v chave="$2" '
    NR == 1 { if ($0 !~ /^---[[:space:]]*\r?$/) exit; next }
    /^---[[:space:]]*\r?$/ { exit }
    {
      linha = $0; gsub(/\r/, "", linha)
      if (index(linha, chave ":") == 1) {
        sub(/^[^:]*:[[:space:]]*/, "", linha)
        gsub(/^["'"'"']|["'"'"']$/, "", linha)
        gsub(/[[:space:]]+$/, "", linha)
        print linha; exit
      }
    }
  ' "$1" 2>/dev/null
}

ORIGEM=""
TRABALHO=""

carrega_contexto() { # <ENTREGA.md>
  local entrega="$1" kind pasta
  kind="$(fm "$entrega" kind)"
  ORIGEM="$(fm "$entrega" expx_tool)"
  TRABALHO="$(fm "$entrega" trabalho_id)"
  [ "$kind" = entrega ] || para 9 'PARADO — ENTREGA corrente inválida' \
    "kind esperado: entrega; obtido: ${kind:-ausente}"
  case "$ORIGEM" in
    sprintx|runx) ;;
    *) para 9 'PARADO — aplicabilidade do modelo de tasks indeterminada' \
      "Origem no ENTREGA.md: ${ORIGEM:-ausente}" \
      'O E1 não inventa heurística global para decidir se há plano.' ;;
  esac
  [ -n "$TRABALHO" ] || para 9 'PARADO — ENTREGA corrente sem trabalho_id'
  pasta="$(basename "$(dirname "$entrega")")"
  [ "$pasta" = "$TRABALHO" ] || para 9 'PARADO — ENTREGA corrente divergente' \
    "Pasta da entrega: $pasta" "trabalho_id: $TRABALHO"
}

registra_contexto_preparado() {
  local trava dono
  trava="$(caminho_da_trava 2>/dev/null)"
  dono="$trava/dono"
  [ -f "$dono" ] || para 1 'PARADO — a seção crítica não tem registro de dono'
  {
    printf 'origem=%s\n' "$ORIGEM"
    printf 'trabalho=%s\n' "$TRABALHO"
  } >> "$dono" || para 1 'PARADO — o contexto do --preparar não pôde ser vinculado à seção'
}

confere_contexto_preparado() {
  local trava task_preparada origem_preparada trabalho_preparado
  trava="$(caminho_da_trava 2>/dev/null)"
  task_preparada="$(campo_do_dono "$trava" task)"
  origem_preparada="$(campo_do_dono "$trava" origem)"
  trabalho_preparado="$(campo_do_dono "$trava" trabalho)"
  [ "$task_preparada" = "$TASK" ] \
    && [ "$origem_preparada" = "$ORIGEM" ] \
    && [ "$trabalho_preparado" = "$TRABALHO" ] \
    && return 0
  para 4 'PARADO — o contexto do --concluir diverge do --preparar' \
    "Preparado: origem=${origem_preparada:-ausente} trabalho=${trabalho_preparado:-ausente} task=${task_preparada:-ausente}" \
    "Concluir:  origem=$ORIGEM trabalho=$TRABALHO task=$TASK" \
    'O stage preparado foi preservado e nenhum commit foi criado.'
}

valida_mensagem() {
  local saida
  saida="$(bash "$CONTRATO_COMMIT_SH" --validar-e1 \
    --trabalho "$TRABALHO" --task "$TASK" --arquivo "$MENSAGEM" 2>&1)" \
    || para 4 'PARADO — rodapé da mensagem inválido' "$saida"
}
valida_commit_produzido() {
  local saida
  saida="$(bash "$CONTRATO_COMMIT_SH" --validar-e1 \
    --trabalho "$TRABALHO" --task "$TASK" --commit HEAD 2>&1)" \
    || para 6 'PARADO — rodapé do commit produzido inválido' "$saida"
}

carrega_contexto_explicito() { # <entrega> <origem> <trabalho>
  local entrega="$1" origem_dada="$2" trabalho_dado="$3" branch
  carrega_contexto "$entrega"
  [ "$ORIGEM" = "$origem_dada" ] || para 9 'PARADO — origem explícita diverge da ENTREGA' \
    "Explícita: $origem_dada" "ENTREGA.expx_tool: $ORIGEM"
  [ "$TRABALHO" = "$trabalho_dado" ] || para 9 'PARADO — trabalho explícito diverge da ENTREGA' \
    "Explícito: $trabalho_dado" "ENTREGA.trabalho_id: $TRABALHO"
  branch="$(git branch --show-current 2>/dev/null)" || branch=""
  [ -n "$branch" ] || para 9 'PARADO — HEAD destacado não prova consistência de branch'
  [ "$(fm "$entrega" branch)" = "$branch" ] || para 9 'PARADO — branch ativa diverge da ENTREGA' \
    "Ativa: $branch" "ENTREGA.branch: $(fm "$entrega" branch)"
}

sha_registrado_resolve() { # <identificador armazenado>
  local registrado="$1"
  case "$registrado" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#registrado}" -ge 7 ] && [ "${#registrado}" -le 40 ] || return 1
  git rev-parse --verify "$registrado^{commit}" 2>/dev/null
}

registra_existente() { # <entrega> <origem> <trabalho> <task> <sha completo>
  local entrega="$1" origem_dada="$2" trabalho_dado="$3" task="$4" sha="$5"
  local pais status caminho origem_nome destino_nome linha ordem seq task_reg commit_reg objeto saida rc
  local -a caminhos

  abre_secao "recovery:$task"          # mesma trava C5, antes de qualquer prova mutável
  confere_stage_de_entrada
  carrega_contexto_explicito "$entrega" "$origem_dada" "$trabalho_dado"

  printf '%s\n' "$sha" | grep -Eq '^[0-9A-Fa-f]{40}$' \
    || para 4 'PARADO — --sha precisa ter exatamente 40 hexadecimais'
  sha="$(printf '%s' "$sha" | tr 'A-F' 'a-f')"
  git cat-file -e "$sha^{commit}" 2>/dev/null \
    || para 4 'PARADO — o SHA informado não existe como commit'
  git merge-base --is-ancestor "$sha" HEAD >/dev/null 2>&1 \
    || para 4 'PARADO — o commit informado não é alcançável do HEAD atual'

  pais="$(git rev-list --parents -n 1 "$sha" 2>/dev/null)" \
    || para 4 'PARADO — não foi possível ler os pais do commit informado'
  set -- $pais
  [ "$#" -le 2 ] || para 4 'PARADO — merge commit não é um E1 unitário recuperável'

  saida="$(bash "$CONTRATO_COMMIT_SH" --validar-e1 \
    --trabalho "$trabalho_dado" --task "$task" --commit "$sha" 2>&1)"; rc=$?
  [ "$rc" = 0 ] || para 4 'PARADO — trailers do commit existente não provam este E1' "$saida"

  RECOVERY_DIFF="$(mktemp "${TMPDIR:-/tmp}/mergex-recovery.XXXXXX")" \
    || para 4 'PARADO — não foi possível preparar a leitura dos paths do commit'
  git diff-tree --root --no-commit-id -r -M --name-status -z "$sha" > "$RECOVERY_DIFF" \
    || para 4 'PARADO — não foi possível ler os paths do commit existente'
  caminhos=()
  while IFS= read -r -d '' status <&3; do
    case "$status" in
      R*|C*)
        IFS= read -r -d '' origem_nome <&3 || para 4 'PARADO — rename sem path de origem'
        IFS= read -r -d '' destino_nome <&3 || para 4 'PARADO — rename sem path de destino'
        caminhos+=("$origem_nome" "$destino_nome") ;;
      *)
        IFS= read -r -d '' caminho <&3 || para 4 'PARADO — entrada de diff sem path'
        caminhos+=("$caminho") ;;
    esac
  done 3< "$RECOVERY_DIFF"
  [ "${#caminhos[@]}" -gt 0 ] || para 4 'PARADO — commit existente não altera path algum'

  # A classificação recebe exatamente os paths do objeto Git. Em rename,
  # origem e destino participam; nenhuma prova vem da worktree atual.
  verifica_ownership "$task" "${caminhos[@]}"

  bash "$SEQ_SH" --validar "$entrega" >/dev/null 2>&1 \
    || para 4 'PARADO — ENTREGA.commits com sequência inválida' \
      "$(bash "$SEQ_SH" --validar "$entrega" 2>&1)"

  while IFS=$'\t' read -r ordem seq task_reg commit_reg; do
    [ -n "$commit_reg" ] || continue
    objeto="$(sha_registrado_resolve "$commit_reg")" \
      || para 4 'PARADO — ENTREGA.commits contém SHA que não resolve no repositório' \
        "Registro: ${commit_reg:-vazio}"
    [ "$objeto" = "$sha" ] || continue
    if [ "$task_reg" = "$task" ]; then
      printf 'noop=true\n'
      return 0
    fi
    para 4 'PARADO — o mesmo commit já está registrado para outra task' \
      "Informada: $task" "Registrada: $task_reg"
  done <<EOF
$(bash "$SEQ_SH" --ler "$entrega")
EOF

  saida="$(bash "$SEQ_SH" --acrescentar "$entrega" "$task" "$sha" 2>&1)" \
    || para 6 'PARADO — commit Git existe; registro E1 não foi concluído' \
      "commit=$sha" "$saida"
  bash "$SEQ_SH" --validar "$entrega" >/dev/null 2>&1 \
    || para 7 'PARADO — a lista ficou inválida depois do registro' \
      "commit=$sha" "$(bash "$SEQ_SH" --validar "$entrega" 2>&1)"
  printf '%s\n' "$saida"
}

# ---------------------------------------------------------------------------
# A. staging — por caminho explícito, nunca em bloco.
#
# `git add .`, `-A` e `-u` arrastam o que não foi declarado na task (regra 4 do
# E1). Aqui eles nem chegam ao versionador.
# ---------------------------------------------------------------------------
recusa_bloco() {
  local p
  for p in "$@"; do
    case "$p" in
      .|..|-A|-u|--all|--update|-*)
        para 64 'RECUSADO — staging em bloco' \
          "Caminho não declarado: $p" \
          'O E1 adiciona por caminho explícito; `git add .`, `-A` e `-u` arrastam' \
          'o que nenhuma task declarou.' ;;
    esac
  done
}

# O conteúdo do índice, um caminho por linha. Sem HEAD não há o que comparar,
# e aí o índice inteiro é o stage.
stage_atual() {
  if git rev-parse --verify -q HEAD >/dev/null 2>&1; then
    git diff --cached --name-only 2>/dev/null
  else
    git ls-files --cached 2>/dev/null
  fi
}

# ---------------------------------------------------------------------------
# 1 e 2 — resolver worktree/índice e adquirir a trava. Nesta ordem, e antes de
# qualquer coisa que toque no índice.
# ---------------------------------------------------------------------------
abre_secao() { # <task>
  local saida rc trava
  saida="$(adquirir "$1")"; rc=$?
  if [ "$rc" = 2 ]; then
    trava="$(caminho_da_trava 2>/dev/null)"
    para 2 'OCUPADO — outra execução do E1 tem a seção crítica deste índice' \
      "trava=$trava" \
      "$(diagnostico "$trava" 2>/dev/null)" \
      'A trava não é removida automaticamente e o índice não foi tocado.' \
      'Espere o outro E1 terminar, ou use --status para diagnosticar.'
  fi
  [ "$rc" = 0 ] || para 1 'PARADO — a trava do índice não pôde ser adquirida' \
    'O índice não foi tocado.'
  TOKEN="$(printf '%s\n' "$saida" | awk -F= '$1 == "token" { print $2 }')"
  [ -n "$TOKEN" ] || para 1 'PARADO — a trava foi criada sem token'
  LIBERAR_NA_SAIDA=1
}

# ---------------------------------------------------------------------------
# 3 — o stage na entrada. Nada é limpo, nada é commitado, nada é desfeito.
# ---------------------------------------------------------------------------
confere_stage_de_entrada() {
  local staged
  staged="$(stage_atual)"
  [ -n "$staged" ] || return 0
  para 3 'PARADO — o índice já tinha conteúdo em stage antes do E1' \
    'Não há prova durável de que este E1 preparou esses caminhos, então eles' \
    'ficaram exatamente como estavam: nada foi resetado, guardado nem commitado.' \
    'Em stage:' \
    "$(printf '%s\n' "$staged" | sed 's/^/  /')" \
    'Decida o que fazer com eles e rode o E1 de novo.'
}

# ---------------------------------------------------------------------------
# 4 — ownership unitário da task, DEPOIS do stage vazio (3) e ANTES do
# primeiro `git add` (5). Mesma classificação que o hook `commit-por-task`
# usa depois, por outro caminho: uma implementação só
# (ownership-da-task.sh), nunca duas divergentes.
#
# Prova de quem é o ARQUIVO/TASK, nunca de quem é o ÍNDICE: se o stage de
# entrada já não estava vazio, a seção 3 já parou antes de chegar aqui, e
# este passo não roda sobre stage nenhum (DM-138 continua valendo).
# ---------------------------------------------------------------------------
CLASSIFICACAO=""
NOTA_INDICE='Nada foi adicionado ao índice: o ownership roda antes do primeiro `git add`.'

verifica_ownership() { # <task> [caminho...]; sem caminhos, lê o stage atual
  local task="$1"; shift
  local saida rc irma desvios

  # Script ausente em trabalho task-based é instalação incompleta. Não existe
  # fallback silencioso: ownership=n/a precisa vir de origem explicitamente n/a.
  confere_instalacao

  # O classificador recebe o contexto vivo da ENTREGA e resolve somente o
  # plano daquele trabalho. Plano ausente/ilegível e task indeterminável param.
  if [ "$#" -gt 0 ]; then
    saida="$(printf '%s\n' "$@" | bash "$OWNERSHIP_SH" --classificar \
      "$RAIZ" "$ORIGEM" "$TRABALHO" "$task" 2>&1)"; rc=$?
  else
    saida="$(stage_atual | bash "$OWNERSHIP_SH" --classificar \
      "$RAIZ" "$ORIGEM" "$TRABALHO" "$task" 2>&1)"; rc=$?
  fi
  CLASSIFICACAO="$saida"
  case "$rc" in
    0)
      desvios="$(printf '%s\n' "$saida" | awk -F'\t' '$1 == "desvio" { print "  - " $2 }')"
      [ -z "$desvios" ] || para 10 'PARADO — desvio: arquivo não declarado em nenhuma task do trabalho' \
        "Task sendo fechada: $task" \
        'Arquivo(s) modificados fora do plano corrente:' "$desvios" \
        'Nenhum commit parcial foi criado e nada foi apagado, restaurado ou guardado.' \
        "$NOTA_INDICE"
      return 0 ;;
    2)
      irma="$(printf '%s\n' "$saida" | awk -F'\t' '$1 == "arquivo_de_task_irma" { print "  - " $2 "   (declarado em " $3 ")" }')"
      para 8 'PARADO — arquivo_de_task_irma: arquivo planejado em outra task da feature' \
        "Task sendo fechada: $task" \
        'Arquivo(s) que mudaram e que só outra task da feature declara:' \
        "$irma" \
        "$NOTA_INDICE" \
        'A mergex só detecta e nomeia a condição; levar ao replanejamento é da sprintx.' ;;
    *)
      para 9 'PARADO — o ownership da task não pôde ser determinado' \
        "$saida" \
        'Nada foi adicionado ao índice. O script recusou responder — plano legado' \
        'ou task fora do formato — e o E1 não infere o dono pela prosa.' ;;
  esac
}

# ---------------------------------------------------------------------------
# M4 — inventário da árvore inteira, antes do ownership e do primeiro `git add`.
#
# A barreira não depende do que o chamador lembrou de listar: toda alteração
# da worktree é classificada. Três grupos, e nenhum path fica sem grupo:
#   - ignorado pelo Git: nem aparece (docs/eventos/, estado local); nenhuma
#     exceção manual é criada aqui;
#   - método do trabalho corrente: path EXATO do catálogo compartilhado com
#     o M2; fica dirty, não entra no E1 e é persistido em pre-e2/pre-e6/e8;
#   - produto: todo o resto, classificado pelo ownership-da-task.sh.
# ---------------------------------------------------------------------------
DIRTY=""
METODO=""
PRODUTO=""
STAGING=""

confere_instalacao() {
  [ -f "$OWNERSHIP_SH" ] || para 9 'PARADO — instalação MergeX incompleta' \
    "Componente ausente: $OWNERSHIP_SH" \
    "O trabalho '$TRABALHO' é $ORIGEM e exige modelo de tasks; ownership não pode virar n/a."
  [ -f "$CATALOGO_SH" ] || para 9 'PARADO — instalação MergeX incompleta' \
    "Componente ausente: $CATALOGO_SH" \
    'Sem o catálogo de método, a árvore não separa método de produto.'
}

# Toda entrada de `git status`, NUL-safe: modificado, não rastreado, removido,
# rename/cópia (origem E destino). Conflito não resolvido para.
inventaria_arvore() {
  local entrada estado caminho origem_nome
  INVENTARIO_TMP="$(mktemp "${TMPDIR:-/tmp}/mergex-inventario.XXXXXX")" \
    || para 9 'PARADO — não foi possível preparar o inventário da árvore' "$NOTA_INDICE"
  git status --porcelain=v1 -z --untracked-files=all > "$INVENTARIO_TMP" \
    || para 9 'PARADO — não foi possível inventariar a árvore' "$NOTA_INDICE"
  DIRTY=""
  while IFS= read -r -d '' entrada <&3; do
    estado="${entrada:0:2}"
    caminho="${entrada:3}"
    case "$estado" in
      DD|AU|UD|UA|DU|AA|UU)
        para 9 'PARADO — a árvore tem conflito não resolvido' \
          "Em conflito: $caminho" "$NOTA_INDICE" ;;
    esac
    case "$caminho" in
      ''|*$'\n'*)
        para 9 'PARADO — path que o inventário não representa sem ambiguidade' \
          "Entrada: $(printf '%q' "$entrada")" "$NOTA_INDICE" ;;
    esac
    DIRTY="$DIRTY$caminho"$'\n'
    case "$estado" in
      R*|C*|?R|?C)
        IFS= read -r -d '' origem_nome <&3 \
          || para 9 'PARADO — rename sem path de origem no inventário' "$NOTA_INDICE"
        case "$origem_nome" in
          ''|*$'\n'*)
            para 9 'PARADO — path que o inventário não representa sem ambiguidade' \
              "Origem: $(printf '%q' "$origem_nome")" "$NOTA_INDICE" ;;
        esac
        DIRTY="$DIRTY$origem_nome"$'\n' ;;
    esac
  done 3< "$INVENTARIO_TMP"
}

# A pasta do trabalho, pelo mesmo desempate do classificador: a canônica vence.
pasta_do_trabalho() {
  case "$ORIGEM" in
    sprintx)
      if [ -d "docs/sprintx/features/$TRABALHO" ] || [ ! -d "docs/$TRABALHO" ]; then
        printf 'docs/sprintx/features/%s\n' "$TRABALHO"
      else
        printf 'docs/%s\n' "$TRABALHO"
      fi ;;
    runx) printf 'docs/manutencao/%s\n' "$TRABALHO" ;;
  esac
}

separa_metodo() {
  local caminho
  # shellcheck source=catalogo-de-metodo.sh
  . "$CATALOGO_SH"
  CATALOGO_TMP="$(mktemp "${TMPDIR:-/tmp}/mergex-catalogo.XXXXXX")" \
    || para 9 'PARADO — não foi possível preparar o catálogo de método' "$NOTA_INDICE"
  # e8 é o catálogo cumulativo inteiro: artefato de método do trabalho em
  # qualquer ponto do lifecycle.
  catalogo_metodo "$RAIZ" "$ORIGEM" "$TRABALHO" "$(pasta_do_trabalho)" e8 > "$CATALOGO_TMP" \
    || para 9 'PARADO — o catálogo de método do trabalho não pôde ser lido' \
      "$CATALOGO_ERRO" "$NOTA_INDICE"
  METODO=""; PRODUTO=""
  while IFS= read -r caminho; do
    [ -n "$caminho" ] || continue
    if grep -Fxq -- "$caminho" "$CATALOGO_TMP" && [ ! -L "$caminho" ]; then
      METODO="$METODO$caminho"$'\n'
    else
      PRODUTO="$PRODUTO$caminho"$'\n'
    fi
  done <<EOF
$DIRTY
EOF
}

# Os caminhos dados MAIS todo produto dirty passam pelo classificador — a
# lista do chamador não limita a DETECÇÃO. Ela também não é ampliada: o
# ownership não autoriza INCLUSÃO. Em STAGING fica só o que o chamador listou;
# produto da task atual que ele não listou PARA o E1 (código 11, DM-173), em
# vez de ser absorvido no commit.
classifica_arvore() { # <task> <caminho listado>...
  local task="$1" caminho omitidos
  shift
  confere_instalacao
  inventaria_arvore
  separa_metodo
  local -a entrada
  entrada=()
  while IFS= read -r caminho; do
    [ -n "$caminho" ] && entrada+=("$caminho")
  done <<EOF
$( { [ "$#" -eq 0 ] || printf '%s\n' "$@"; printf '%s' "$PRODUTO"; } | LC_ALL=C sort -u)
EOF
  if [ "${#entrada[@]}" -eq 0 ]; then
    STAGING=""
    return 0
  fi
  verifica_ownership "$task" "${entrada[@]}"
  omitidos="$(printf '%s\n' "$CLASSIFICACAO" | awk -F'\t' '$1 == "na_task_atual" { print $2 }' \
    | while IFS= read -r caminho; do
        [ -n "$caminho" ] || continue
        printf '%s\n' "$@" | grep -Fxq -- "$caminho" || printf '  - %s\n' "$caminho"
      done)"
  [ -z "$omitidos" ] || para 11 'PARADO — produto da task atual alterado e não listado no E1' \
    "Task sendo fechada: $task" \
    'Arquivo(s) que mudaram, que a task atual declara e que o fechamento não listou:' \
    "$omitidos" \
    'O ownership não autoriza inclusão automática: sem a lista explícita, o commit' \
    'poderia absorver trabalho de outra execução na mesma worktree. Liste os' \
    'arquivos no E1 se são desta task; se outra task está em voo nesta worktree,' \
    'ela precisa de uma worktree própria. Nada foi apagado, restaurado ou guardado.' \
    "$NOTA_INDICE"
  STAGING="$(printf '%s\n' "$CLASSIFICACAO" | awk -F'\t' '$1 == "na_task_atual" { print $2 }' \
    | while IFS= read -r caminho; do
        [ -n "$caminho" ] || continue
        printf '%s\n' "$@" | grep -Fxq -- "$caminho" && printf '%s\n' "$caminho"
      done)"
}

# ---------------------------------------------------------------------------
# A a C — staging, diff em stage e verificações aplicáveis, tudo sob a trava.
# ---------------------------------------------------------------------------
prepara() { # usa STAGING, a saída da classificação da árvore (M4)
  local caminho
  local -a alvos
  alvos=()
  while IFS= read -r caminho; do
    [ -n "$caminho" ] && alvos+=("$caminho")
  done <<EOF
$STAGING
EOF
  [ "${#alvos[@]}" -gt 0 ] \
    || para 4 'PARADO — nada entrou em stage' \
      'Nenhum caminho alterado é da task atual.'
  git add -- "${alvos[@]}" \
    || para 4 'PARADO — o staging da task falhou' \
      'Nenhum commit foi criado. O índice ficou como o versionador o deixou.'
  [ -n "$(stage_atual)" ] \
    || para 4 'PARADO — nada entrou em stage' \
      'Os caminhos declarados não têm alteração a commitar.'
}

# C — a verificação injetada roda DENTRO da seção, com o diff em stage pronto.
verifica() { # <comando>
  [ -n "$1" ] || return 0
  MERGEX_E1_TOKEN="$TOKEN" bash -c "$1" \
    || para 4 'PARADO — verificação do E1 reprovou antes do commit' \
      "Comando: $1" \
      'Nenhum commit foi criado e nada foi limpo: o stage ficou para diagnóstico.'
}

# ---------------------------------------------------------------------------
# D a G — commit, identificador, append e validação final. Ainda sob a trava.
# ---------------------------------------------------------------------------
conclui() { # <entrega> <task> <mensagem>
  local entrega="$1" task="$2" mensagem="$3" sha saida seq

  # A lista é conferida ANTES do commit, e aqui — não no `prepara` —, para que
  # a conferência aconteça também quando a seção foi aberta pelo `--preparar`.
  # Uma sequência já quebrada faria o `--acrescentar` recusar depois, e o
  # desfecho seria um commit sem registro (código 6) por um defeito que dava
  # para ver antes de commitar.
  bash "$SEQ_SH" --validar "$entrega" >/dev/null 2>&1 \
    || para 4 'PARADO — ENTREGA.commits com sequência inválida' \
      "$(bash "$SEQ_SH" --validar "$entrega" 2>&1)" \
      'Contrato do ENTREGA.md inválido: nenhum commit foi criado e nenhum' \
      'número foi escolhido para caber.'

  git commit -F "$mensagem" >/dev/null \
    || para 5 'PARADO — `git commit` falhou' \
      'Nenhum registro de E1 foi escrito: a lista `commits` da ENTREGA não foi' \
      'tocada. Leia o erro literal do versionador acima; nunca contorne com' \
      '`--no-verify`.'

  valida_commit_produzido

  sha="$(git rev-parse --short HEAD 2>/dev/null)"
  [ -n "$sha" ] \
    || para 6 'PARADO — commit Git existe; registro E1 não foi concluído' \
      'O identificador do commit não pôde ser lido. Nenhum segundo commit foi' \
      'criado. A V11 do portão (E2) vai cobrar a prova que falta.'

  saida="$(bash "$SEQ_SH" --acrescentar "$entrega" "$task" "$sha" 2>&1)" \
    || para 6 'PARADO — commit Git existe; registro E1 não foi concluído' \
      "commit=$sha" \
      "$saida" \
      'NENHUM segundo commit foi criado e nada foi desfeito: o commit é real e' \
      'fica no histórico. Use --registrar-existente com este SHA completo;' \
      'até lá, a V11 do portão (E2) nomeia a task sem prova.'

  seq="$(printf '%s\n' "$saida" | awk -F= '$1 == "seq" { print $2 }')"

  bash "$SEQ_SH" --validar "$entrega" >/dev/null 2>&1 \
    || para 7 'PARADO — a lista ficou inválida depois do registro' \
      "commit=$sha" \
      "seq=$seq" \
      "$(bash "$SEQ_SH" --validar "$entrega" 2>&1)" \
      'Nada foi renumerado e nenhum item foi reescrito. Contrato do ENTREGA.md' \
      'inválido: relate e pare.'

  printf 'commit=%s\n' "$sha"
  printf 'seq=%s\n' "$seq"
}

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
ACAO=""; ENTREGA=""; TASK=""; MENSAGEM=""; VERIFICACAO=""; TOKEN_DADO=""
ORIGEM_DADA=""; TRABALHO_DADO=""; SHA_DADO=""
CAMINHOS_INICIO=0

case "${1:-}" in
  --fechar|--preparar|--concluir|--registrar-existente|--status) ACAO="$1"; shift ;;
  *) uso "ação desconhecida: ${1:-<nenhuma>} (--fechar, --preparar, --concluir, --registrar-existente, --status)" ;;
esac

if [ "$ACAO" = --status ]; then
  LIBERAR_NA_SAIDA=0
  [ "$#" -eq 0 ] || uso '--status não recebe argumento'
  status; exit $?
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --entrega)     [ "$#" -ge 2 ] || uso '--entrega precisa de um arquivo'; ENTREGA="$2"; shift 2 ;;
    --task)        [ "$#" -ge 2 ] || uso '--task precisa de um id'; TASK="$2"; shift 2 ;;
    --mensagem)    [ "$#" -ge 2 ] || uso '--mensagem precisa de um arquivo'; MENSAGEM="$2"; shift 2 ;;
    --verificacao) [ "$#" -ge 2 ] || uso '--verificacao precisa de um comando'; VERIFICACAO="$2"; shift 2 ;;
    --token)       [ "$#" -ge 2 ] || uso '--token precisa de um token'; TOKEN_DADO="$2"; shift 2 ;;
    --origem)      [ "$#" -ge 2 ] || uso '--origem precisa de sprintx|runx'; ORIGEM_DADA="$2"; shift 2 ;;
    --trabalho)    [ "$#" -ge 2 ] || uso '--trabalho precisa de um id'; TRABALHO_DADO="$2"; shift 2 ;;
    --sha)         [ "$#" -ge 2 ] || uso '--sha precisa de um SHA completo'; SHA_DADO="$2"; shift 2 ;;
    --)            shift; CAMINHOS_INICIO=1; break ;;
    *)             uso "opção desconhecida: $1" ;;
  esac
done

[ -n "$TASK" ] || uso 'falta --task'

RAIZ="$(raiz_da_worktree)" || { printf 'fechamento-do-e1: %s\n' "$ERRO" >&2; exit 1; }

# A ENTREGA é resolvida ANTES do `cd`: o chamador a nomeia a partir de onde
# está, e os caminhos da task são relativos à raiz da worktree.
if [ -n "$ENTREGA" ]; then
  ENTREGA="$(absoluto "$ENTREGA" "$PWD")"
  [ -f "$ENTREGA" ] || uso "ENTREGA.md inexistente: $ENTREGA"
fi
if [ -n "$MENSAGEM" ]; then
  MENSAGEM="$(absoluto "$MENSAGEM" "$PWD")"
  [ -s "$MENSAGEM" ] || uso "arquivo de mensagem vazio ou inexistente: $MENSAGEM"
fi

cd "$RAIZ" || { printf 'fechamento-do-e1: raiz inacessível: %s\n' "$RAIZ" >&2; exit 1; }

case "$ACAO" in
  --registrar-existente)
    [ -n "$ENTREGA" ] || uso 'falta --entrega'
    [ -n "$ORIGEM_DADA" ] || uso 'falta --origem'
    [ -n "$TRABALHO_DADO" ] || uso 'falta --trabalho'
    [ -n "$SHA_DADO" ] || uso 'falta --sha'
    [ "$CAMINHOS_INICIO" = 0 ] || uso '--registrar-existente não recebe paths'
    case "$ORIGEM_DADA" in sprintx|runx) ;; *) uso '--origem precisa ser sprintx|runx' ;; esac
    registra_existente "$ENTREGA" "$ORIGEM_DADA" "$TRABALHO_DADO" "$TASK" "$SHA_DADO"
    exit 0 ;;

  --fechar)
    [ -n "$ENTREGA" ] || uso 'falta --entrega'
    [ -n "$MENSAGEM" ] || uso 'falta --mensagem'
    [ "$CAMINHOS_INICIO" = 1 ] && [ "$#" -gt 0 ] || uso '--fechar precisa de `-- <caminho>...`'
    recusa_bloco "$@"
    abre_secao "$TASK"                 # 1 e 2
    confere_stage_de_entrada           # 3
    carrega_contexto "$ENTREGA"
    valida_mensagem
    classifica_arvore "$TASK" "$@"     # 4 (M4: árvore inteira + dados)
    prepara                            # 5 (A) e 6 (B)
    verifica "$VERIFICACAO"            # 7 (C)
    conclui "$ENTREGA" "$TASK" "$MENSAGEM"   # 8-11 (D a G)
    exit 0 ;;

  --preparar)
    [ -n "$ENTREGA" ] || uso 'falta --entrega'
    [ -n "$MENSAGEM" ] || uso 'falta --mensagem'
    [ "$CAMINHOS_INICIO" = 1 ] && [ "$#" -gt 0 ] || uso '--preparar precisa de `-- <caminho>...`'
    recusa_bloco "$@"
    abre_secao "$TASK"
    confere_stage_de_entrada
    carrega_contexto "$ENTREGA"
    valida_mensagem
    registra_contexto_preparado
    classifica_arvore "$TASK" "$@"
    prepara
    # A seção continua aberta: quem preparou tem a trava até `--concluir`.
    LIBERAR_NA_SAIDA=0
    printf 'token=%s\n' "$TOKEN"
    printf 'trava=%s\n' "$(caminho_da_trava)"
    stage_atual | sed 's/^/staged=/'
    exit 0 ;;

  --concluir)
    [ -n "$ENTREGA" ] || uso 'falta --entrega'
    [ -n "$MENSAGEM" ] || uso 'falta --mensagem'
    [ -n "$TOKEN_DADO" ] || uso 'falta --token (o que o --preparar imprimiu)'
    [ "$CAMINHOS_INICIO" = 0 ] || uso '--concluir não recebe caminhos: o stage já está montado'
    conferir "$TOKEN_DADO" \
      || para 2 'OCUPADO — esta execução não é dona da seção crítica' \
        "$ERRO" \
        'Nada foi commitado e nada foi registrado.'
    TOKEN="$TOKEN_DADO"
    LIBERAR_NA_SAIDA=1
    [ -n "$(stage_atual)" ] \
      || para 4 'PARADO — nada em stage para concluir' \
        'O --preparar desta seção não deixou nada no índice.'
    carrega_contexto "$ENTREGA"
    valida_mensagem
    confere_contexto_preparado
    NOTA_INDICE='O stage preparado foi preservado e nenhum commit foi criado.'
    verifica_ownership "$TASK"         # o stage, sem isenção de método
    # M4: a lista do --concluir é o stage que o --preparar montou; o que ficou
    # dirty fora dele desde então é classificado e barra do mesmo jeito.
    LISTA_PREPARADA=()
    while IFS= read -r caminho_preparado; do
      [ -n "$caminho_preparado" ] && LISTA_PREPARADA+=("$caminho_preparado")
    done <<EOF
$(git diff --cached --name-only --no-renames 2>/dev/null)
EOF
    classifica_arvore "$TASK" "${LISTA_PREPARADA[@]}"
    conclui "$ENTREGA" "$TASK" "$MENSAGEM"
    exit 0 ;;
esac
