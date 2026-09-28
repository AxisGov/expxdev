#!/usr/bin/env bash
# commit-por-task — PreToolUse em execução de comando.
#
# Verifica que o que está sendo commitado corresponde aos arquivos de UMA
# task, e que essa task está `concluida` com registro de suíte válido.
#
# `suite` da task: `parcial` (o subconjunto afetado pela task passou) e `verde`
# (a suíte inteira passou) são os dois registros válidos do expx-schema; a
# sprintx cobra a suíte INTEIRA no fechamento da sprint, não em cada task.
# `vermelha` e `nao_executada` continuam barrando: commit sobre teste que não
# passa põe no histórico um ponto em que quem bisecar depois cai.
#
# É a regra que sustenta a qualidade do histórico — que, como a mergex não
# previne colisão, é o principal ativo de quem for resolver um conflito depois.
#
# Modo padrão: AVISO (hook de método).
# FALHA ABERTA: qualquer erro interno deixa passar. Hook de método que quebra e
# trava o terminal faz o time desligar tudo — inclusive os de segurança.

HOOK="commit-por-task"
PADRAO="aviso"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../comum/base.sh
. "$DIR/../comum/base.sh"

# Falha aberta: sem `set -e`, um comando que retorna não-zero não derruba o
# script — ele segue e, no limite, chega ao fim e sai 0. É esse o comportamento
# desejado para hook de método. Um `trap ... ERR` aqui seria pior: em bash 3.2
# ele não dispara de forma confiável fora de `set -e`, e mascararia o exit 2 de
# um bloqueio legítimo.

ENTRADA="$(cat)"
[ "$(printf '%s' "$ENTRADA" | jq -r '.tool_name // empty' 2>/dev/null)" = "Bash" ] || exit 0

CMD="$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$CMD" ] || exit 0
printf '%s' "$CMD" | grep -Eq 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' || exit 0

CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null)"
RAIZ="$(expx_raiz "${CWD:-$PWD}")"

MODO="$(expx_modo "$HOOK" "$PADRAO" "$RAIZ")"
[ "$MODO" = "desligado" ] && exit 0

# O que está em preparação. Nada preparado: não é assunto deste hook.
PREP="$(git -C "$RAIZ" diff --cached --name-only 2>/dev/null)"
[ -n "$PREP" ] || exit 0

# Contexto defensivo do commit manual: a branch ativa casa com exatamente uma
# ENTREGA. A task continua vindo somente do rodapé Task: da mensagem.
TRABALHO="$(expx_trabalho_atual_por_branch "$RAIZ")" || TRABALHO=""
ORIGEM=""
PASTA_TRABALHO=""
if [ -n "$TRABALHO" ]; then
  ENTREGA_ATUAL="$RAIZ/docs/entregas/$TRABALHO/ENTREGA.md"
  ORIGEM="$(expx_frontmatter_valor "$ENTREGA_ATUAL" expx_tool)"
  case "$ORIGEM" in
    sprintx)
      if [ -d "$RAIZ/docs/sprintx/features/$TRABALHO" ]; then
        PASTA_TRABALHO="$RAIZ/docs/sprintx/features/$TRABALHO"
      elif [ -d "$RAIZ/docs/$TRABALHO" ]; then
        PASTA_TRABALHO="$RAIZ/docs/$TRABALHO"
      fi ;;
    runx) PASTA_TRABALHO="$RAIZ/docs/manutencao/$TRABALHO" ;;
  esac
fi

# --------------------------------------------------------------------------
# Arquivo de task irmã — a quarta situação do E1
# --------------------------------------------------------------------------
# Antes de tudo: um arquivo que mudou, que NÃO é da task sendo fechada e que
# outra task da feature declara. Não é mistura de tasks (o conselho "commite
# uma de cada vez" fecharia de novo uma task congelada) e não é desvio (o
# arquivo foi planejado). É evidência mecânica de incompatibilidade entre
# execução e plano, e o fechamento para aqui.
#
# Esta condição FALHA FECHADO mesmo com o hook em `aviso`, e é a única deste
# hook que faz isso. O motivo é o da própria condição: deixá-la passar produz
# um commit parcial enganoso da task — o dano que o hook existe para impedir,
# e que não tem volta depois de entrar no histórico. As demais verificações
# deste hook continuam exatamente no modo configurado.
#
# Quem classifica é o script da skill, não o hook: uma implementação só,
# provada pela bancada. Ausente — instalação parcial —, o hook segue com o que
# sempre fez (falha aberta no método).
#
# P0.2-C7-A: `scripts/fechamento-do-e1.sh` — a seção crítica do E1 — chama o
# MESMO script, ANTES do primeiro `git add`. Pelo caminho normal, o arquivo de
# task irmã nunca chega a este hook, porque nunca chega a ser staged. Este
# bloco continua existindo como DEFESA EM PROFUNDIDADE, para quem roda
# `git add`/`git commit` por fora da seção crítica; ele não implementa uma
# segunda regra, só chama de novo a mesma classificação.
OWNERSHIP="$DIR/../../skills/mergex/scripts/ownership-da-task.sh"
CONTRATO_COMMIT="$DIR/../../skills/mergex/scripts/contrato-de-commit.sh"

# A task que está sendo fechada é a que a mensagem DECLARA no rodapé `Task:`,
# que o contrato do E1 já exige em todo commit de task. Nunca é adivinhada:
# escolher a primeira task do plano, ou a do arquivo mais recente, inventaria
# o dono. Duas declarações diferentes, ou nenhuma, é "não determinada".
MSG="$CMD"
ARQ_MSG="$(printf '%s' "$CMD" | sed -n 's/.*[[:space:]]-F[[:space:]]*\([^[:space:]]*\).*/\1/p; s/.*--file=\([^[:space:]]*\).*/\1/p' | head -1)"
if [ -n "$ARQ_MSG" ]; then
  ARQ_MSG="$(printf '%s' "$ARQ_MSG" | sed "s/^['\"]//; s/['\"]$//")"
  case "$ARQ_MSG" in
    /*) : ;;
    *) ARQ_MSG="$RAIZ/$ARQ_MSG" ;;
  esac
  [ -r "$ARQ_MSG" ] && MSG="$MSG
$(cat "$ARQ_MSG" 2>/dev/null)"
else
  # O evento do harness traz a linha de comando, não argv. Para `-m "..."`,
  # retire somente o invólucro externo usado pelo chamador; o corpo, inclusive
  # quebras de linha e trailers, permanece byte a byte para o parser do Git.
  MARCADOR_M=' -m "'
  case "$CMD" in
    *"$MARCADOR_M"*)
      MSG="${CMD#*"$MARCADOR_M"}"
      MSG="${MSG%\"*}"
      ;;
  esac
fi

# As três chaves de controle formam duas classes mutuamente exclusivas. Esta
# gramática falha fechada mesmo no modo aviso: aceitar Task+Metodo ou trailers
# duplicados tornaria o histórico ambíguo depois do commit.
TRAILERS_CONTROLE="$(printf '%s\n' "$MSG" | git interpret-trailers --parse 2>/dev/null)"
Q_TASK="$(printf '%s\n' "$TRAILERS_CONTROLE" | grep -Ec '^Task:[[:space:]]*')"
Q_TRABALHO="$(printf '%s\n' "$TRAILERS_CONTROLE" | grep -Ec '^Trabalho:[[:space:]]*')"
Q_METODO="$(printf '%s\n' "$TRAILERS_CONTROLE" | grep -Ec '^Metodo:[[:space:]]*')"
TASK_ATUAL="$(printf '%s\n' "$TRAILERS_CONTROLE" | sed -n 's/^Task:[[:space:]]*//p' | head -1)"
TRABALHO_MENSAGEM="$(printf '%s\n' "$TRAILERS_CONTROLE" | sed -n 's/^Trabalho:[[:space:]]*//p' | head -1)"
METODO_ATUAL="$(printf '%s\n' "$TRAILERS_CONTROLE" | sed -n 's/^Metodo:[[:space:]]*//p' | head -1)"

if [ "$Q_TASK" -gt 0 ] || [ "$Q_METODO" -gt 0 ]; then
  [ -r "$CONTRATO_COMMIT" ] || {
    printf '%s\n' "mergex/commit-por-task — instalação MergeX incompleta

Componente ausente: $CONTRATO_COMMIT
Um commit declarou Task ou Metodo, mas sua classe não pode ser provada." >&2
    exit 2
  }
  TMP_MENSAGEM="$(mktemp)" || exit 2
  printf '%s\n' "$MSG" > "$TMP_MENSAGEM" || { rm -f "$TMP_MENSAGEM"; exit 2; }
  if [ "$Q_METODO" -gt 0 ]; then
    SAIDA_CONTRATO="$(bash "$CONTRATO_COMMIT" --validar-metodo \
      --trabalho "$TRABALHO_MENSAGEM" --checkpoint "$METODO_ATUAL" \
      --arquivo "$TMP_MENSAGEM" 2>&1)"
    RC_CONTRATO=$?
    rm -f "$TMP_MENSAGEM"
    if [ "$RC_CONTRATO" != 0 ]; then
      printf '%s\n' "mergex/commit-por-task — classe de commit inválida

$SAIDA_CONTRATO

Commit de método exige exatamente Trabalho + Metodo (pre-e2, pre-e6 ou e8)
e nunca aceita Task." >&2
      exit 2
    fi
    # Método válido não representa task. O hook de escopo continua responsável
    # por conferir os arquivos; este hook termina sem exigir status/suíte.
    exit 0
  fi

  SAIDA_CONTRATO="$(bash "$CONTRATO_COMMIT" --validar-e1 \
    --trabalho "$TRABALHO_MENSAGEM" --task "$TASK_ATUAL" \
    --arquivo "$TMP_MENSAGEM" 2>&1)"
  RC_CONTRATO=$?
  rm -f "$TMP_MENSAGEM"
  if [ "$RC_CONTRATO" != 0 ]; then
    printf '%s\n' "mergex/commit-por-task — classe de commit inválida

$SAIDA_CONTRATO

Commit E1 exige exatamente Task + Trabalho e nunca aceita Metodo." >&2
    exit 2
  fi
fi

if [ -n "$TASK_ATUAL" ] && [ -n "$TRABALHO" ] \
  && [ "$TRABALHO_MENSAGEM" != "$TRABALHO" ]; then
  printf '%s\n' "mergex/commit-por-task — Trabalho diverge do contexto corrente

Trabalho da mensagem: $TRABALHO_MENSAGEM
Trabalho corrente:     $TRABALHO" >&2
  exit 2
fi

if [ -n "$TASK_ATUAL" ] && [ -n "$TRABALHO" ]; then
  if [ "$ORIGEM" = sprintx ] || [ "$ORIGEM" = runx ]; then
    if [ ! -r "$OWNERSHIP" ]; then
      printf '%s\n' "mergex/commit-por-task — instalação MergeX incompleta

Trabalho: $TRABALHO
Origem:   $ORIGEM
Componente ausente: $OWNERSHIP

Este trabalho usa modelo de tasks. A ausência do classificador de ownership
não pode ser tratada como n/a nem liberar o commit." >&2
      exit 2
    fi
  fi
fi

if [ -n "$TASK_ATUAL" ] && [ -r "$OWNERSHIP" ] && [ -n "$TRABALHO" ]; then
  SAIDA_OWNERSHIP="$(printf '%s\n' "$PREP" \
    | bash "$OWNERSHIP" --classificar "$RAIZ" "$ORIGEM" "$TRABALHO" "$TASK_ATUAL" 2>&1)"
  RC_OWNERSHIP=$?
  case "$RC_OWNERSHIP" in
    0|2) ;;
    *)
      printf '%s\n' "mergex/commit-por-task — ownership não determinável

Trabalho: $TRABALHO
Origem:   $ORIGEM
Task:     $TASK_ATUAL

$SAIDA_OWNERSHIP

O plano corrente task-based está ausente, ilegível ou inconsistente. O commit
manual para sem procurar outro trabalho nem degradar para n/a." >&2
      exit 2 ;;
  esac

  IRMA="$(printf '%s\n' "$SAIDA_OWNERSHIP" \
    | awk -F'\t' '$1 == "arquivo_de_task_irma" { print "  - " $2 "   (declarado em " $3 ")" }')"
  if [ -n "$IRMA" ]; then
    QTD_IRMA="$(printf '%s\n' "$IRMA" | grep -c .)"
    ARQ_IRMA="$(printf '%s\n' "$IRMA" | sed 's/^  - //; s/   (declarado em .*//' \
      | jq -R . | jq -sc . 2>/dev/null || echo '[]')"
    expx_rastro "$RAIZ" "acao_bloqueada" "bloqueado" \
      "arquivo de task irma no fechamento de $TASK_ATUAL ($QTD_IRMA)" "$HOOK" "$ARQ_IRMA"
    printf '%s\n' "mergex/commit-por-task — arquivo de OUTRA task no fechamento desta

Task sendo fechada: $TASK_ATUAL
Arquivo(s) que mudaram e que só outra task da feature declara:

$IRMA
No E1 o dono do arquivo é a task que está sendo fechada. Estes arquivos foram
planejados — só que em outra task —, então NÃO são desvio de escopo; e não
podem entrar neste commit, porque isso os atribuiria em silêncio a $TASK_ATUAL.

Isto é evidência mecânica de que a execução e o plano não batem.

O que fazer:
  - Tire o arquivo do índice, sem tocar na sua alteração:
      git restore --staged <arquivo>
  - Não apague, não restaure o conteúdo, não faça stash e não o mova para
    outra task: a alteração é real e precisa continuar na árvore.
  - Leve a condição ao planejamento. Depois que o plano passar a declarar o
    arquivo na task atual, este commit passa normalmente.

A mergex só detecta e nomeia a condição (arquivo_de_task_irma). Registrar
bloqueio, abrir B-NN e replanejar é da sprintx." >&2
    exit 2
  fi
fi

# --------------------------------------------------------------------------
# As tasks do trabalho
# --------------------------------------------------------------------------
# Sem estado próprio: tudo sai de tasks.md, que já existe.
# Sem tasks.md, não há o que verificar — passa (falha aberta).
# bash 3.2 (o do macOS) não tem mapfile: usa lista separada por linha.
if [ -n "$PASTA_TRABALHO" ] && [ -d "$PASTA_TRABALHO" ]; then
  TASKS_ARQS="$(find "$PASTA_TRABALHO" -name tasks.md -not -path '*/node_modules/*' 2>/dev/null)"
else
  TASKS_ARQS=""
fi
[ -n "$TASKS_ARQS" ] || exit 0

# Para cada task do plano, extrai: id, status, suite e arquivos declarados.
# O formato é o do expx-schema v1: blocos por task dentro do tasks.md.
TMP="$(mktemp)" || exit 0
# O trap de limpeza NÃO pode ter `exit`: um `exit 0` aqui sobrescreveria o
# `exit 2` de um bloqueio, e o hook nunca barraria nada. Só remove o temporário
# e preserva o código de saída de quem chamou.
trap 'rm -f "$TMP"' EXIT

while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Formato real do expx-schema v1:
  #   - id: T-01.02
  #     status: concluida
  #     suite: verde
  #     arquivos:
  #       cria: [a/b.ts, c/d.ts]
  #       altera: []
  # Os caminhos vêm em lista de fluxo na mesma linha; há também a forma em
  # bloco (`- caminho`). As duas são aceitas.
  awk '
    function despeja(  linha) {
      if (id != "") print id "\t" status "\t" suite "\t" arquivos
    }
    function coleta(s,   n, i, partes) {
      sub(/^[^:]*:[[:space:]]*/, "", s)
      gsub(/^\[|\]$/, "", s)
      n = split(s, partes, /,[[:space:]]*/)
      for (i = 1; i <= n; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", partes[i])
        gsub(/^["'"'"']|["'"'"']$/, "", partes[i])
        if (partes[i] != "") arquivos = arquivos " " partes[i]
      }
    }
    /^[[:space:]]*-[[:space:]]+id:[[:space:]]*T-/ {
      despeja()
      id = $0; sub(/^.*id:[[:space:]]*/, "", id); gsub(/[[:space:]"]+$/, "", id)
      status = ""; suite = ""; arquivos = ""; dentro_arq = 0; next
    }
    /^[[:space:]]*status:/ { s = $0; sub(/^[^:]*:[[:space:]]*/, "", s); gsub(/[[:space:]"]+$/, "", s); status = s; next }
    /^[[:space:]]*suite:/  { s = $0; sub(/^[^:]*:[[:space:]]*/, "", s); gsub(/[[:space:]"]+$/, "", s); suite  = s; next }
    /^[[:space:]]*arquivos:/ { dentro_arq = 1; next }
    /^[[:space:]]*(cria|altera):/ { coleta($0); dentro_arq = 1; next }
    # forma em bloco: "- caminho/arquivo.ext"
    dentro_arq && /^[[:space:]]*-[[:space:]]+[^[:space:]]+/ {
      c = $0; sub(/^[[:space:]]*-[[:space:]]+/, "", c); gsub(/[[:space:]"]+$/, "", c)
      if (c ~ /^[A-Za-z0-9_.\/-]+$/) { arquivos = arquivos " " c; next }
    }
    /^[[:space:]]*[a-z_]+:/ { if ($0 !~ /^[[:space:]]*(cria|altera|arquivos):/) dentro_arq = 0 }
    END { despeja() }
  ' "$f" >> "$TMP" 2>/dev/null || true
done <<< "$TASKS_ARQS"

[ -s "$TMP" ] || exit 0

# --------------------------------------------------------------------------
# A qual task pertence cada arquivo em preparação
# --------------------------------------------------------------------------
TASKS_TOCADAS=""
SEM_TASK=""

while IFS= read -r arquivo; do
  [ -n "$arquivo" ] || continue
  achou=""
  while IFS=$'\t' read -r id status suite arquivos; do
    case " $arquivos " in
      *" $arquivo "*) achou="$id"; break ;;
    esac
  done < "$TMP"
  if [ -n "$achou" ]; then
    case " $TASKS_TOCADAS " in
      *" $achou "*) : ;;
      *) TASKS_TOCADAS="$TASKS_TOCADAS $achou" ;;
    esac
  else
    SEM_TASK="$SEM_TASK  - $arquivo
"
  fi
done <<< "$PREP"

QTD_TASKS="$(printf '%s\n' $TASKS_TOCADAS | grep -c . || true)"

# --------------------------------------------------------------------------
# 1. Commit misturando tasks
# --------------------------------------------------------------------------
if [ "${QTD_TASKS:-0}" -gt 1 ]; then
  expx_barra "$MODO" "$RAIZ" "$HOOK" "commit mistura tasks:$TASKS_TOCADAS" \
"mergex/commit-por-task — o commit mistura mais de uma task

Tasks no que está preparado:$TASKS_TOCADAS

Um commit por task, no momento em que ela fecha (regra 3 da mergex). A mensagem
de commit é o que permite entender a intenção de cada mudança num merge difícil,
meses depois, por quem não participou do trabalho. Misturar tasks apaga isso.

O que fazer:
  - Prepare e commite uma task de cada vez:
      git reset
      git add <arquivos da task>   # por caminho explícito, nunca 'git add .'
      git commit -m '<tipo>(<escopo>): <título da task>'"
fi

# --------------------------------------------------------------------------
# 2. Task não concluída, ou com registro de suíte que não sustenta um commit
# --------------------------------------------------------------------------
for id in $TASKS_TOCADAS; do
  linha="$(grep -F "$id	" "$TMP" | head -1)" || continue
  status="$(printf '%s' "$linha" | cut -f2)"
  suite="$(printf '%s' "$linha" | cut -f3)"

  if [ -n "$status" ] && [ "$status" != "concluida" ]; then
    expx_barra "$MODO" "$RAIZ" "$HOOK" "task $id em status $status" \
"mergex/commit-por-task — task ainda não concluída

Task:   $id
Status: $status

O commit acontece quando a task fecha: os dois testes escritos, os testes
afetados pela task passando, e a task marcada 'concluida' em tasks.md. Antes
disso, não commita.

O que fazer:
  - Termine a task, rode os testes afetados, marque 'status: concluida' e
    'suite: parcial' (ou 'verde') no tasks.md — no frontmatter e na prosa — e
    commite então."
  fi

  case "${suite:-}" in
    ''|parcial|verde) ;;
    *)
    expx_barra "$MODO" "$RAIZ" "$HOOK" "task $id com suite $suite" \
"mergex/commit-por-task — a task fechou sem teste passando

Task:  $id
Suíte: $suite

Commit com suíte vermelha, ou sem teste executado, põe no histórico um ponto
que não passa. Quem bisecar esse histórico depois cai justamente aí.

Registros válidos numa task concluída:
  parcial — os testes afetados pela task passaram (a suíte inteira é cobrada
            no fechamento da sprint)
  verde   — a suíte inteira passou

O que fazer:
  - Faça os testes da task passarem e atualize 'suite' no tasks.md."
    ;;
  esac
done

# --------------------------------------------------------------------------
# 3. Nenhuma task reconhecida
# --------------------------------------------------------------------------
# Não é violação por si: pode ser commit de artefato da própria mergex
# (ENTREGA.md, PR.md). O arquivo-fora-do-plano é quem trata escopo.
if [ "${QTD_TASKS:-0}" = "0" ] && [ -n "$SEM_TASK" ]; then
  exit 0
fi

expx_permite "$RAIZ" "$HOOK" "commit de uma task concluida com suite valida"
