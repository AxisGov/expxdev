#!/usr/bin/env bash
# ownership-da-task — de qual task é cada arquivo que mudou, no fechamento (E1).
#
# Contrato: references/01-commits.md, "O dono do arquivo é a task que está sendo
# fechada"; references/02-prontidao.md, V9 (que usa a UNIÃO, e não isto).
#
# No E1 o ownership é UNITÁRIO: dono é a task que está sendo fechada, e só ela.
# A classificação é por CONJUNTOS, nunca por prosa — título, objetivo, status e
# a ordem das tasks não entram na conta:
#
#   mudou ∩ atual                     → na_task_atual        (entra no commit)
#   atual − mudou                     → declarado_nao_mudou  (não entra; não é erro)
#   mudou − união(todas as tasks)     → desvio               (o desvio de sempre)
#   mudou ∩ (união(outras) − atual)   → arquivo_de_task_irma (a situação nova)
#
# Arquivo declarado na atual E numa irmã é da ATUAL: a interseção vem primeiro.
#
# `arquivo_de_task_irma` NÃO é desvio: o arquivo foi planejado, só que noutra
# task. É evidência mecânica de incompatibilidade entre execução e plano — a
# quarta situação, que o contrato do E1 não tinha. A mergex apenas a DETECTA e
# a nomeia pelo que observa; ela não grava `00-BLOQUEIOS.md`, não cria `B-NN` e
# não altera estado da sprintx. Traduzir esta condição para uma classe de
# pendência (`defeito_de_plano`) é da sprintx, pelo mesmo corte de dono que a
# DM-111 já fixou para a `causa` do portão.
#
# Trabalho, origem e task atual são DECLARADOS por quem chama. O script resolve
# somente a pasta canônica desse trabalho; id repetido em feature histórica não
# participa. Escolher a primeira task ou o primeiro plano seria inventar dono.
#
# Uso:
#   ownership-da-task.sh --classificar <raiz> <origem> <trabalho> <T-NN.MM> [arquivo...]
#       Sem arquivo na linha de comando, lê um caminho por linha da entrada
#       padrão (`git diff --cached --name-only`, `git status --porcelain`).
#   ownership-da-task.sh --situacoes     # o enum fechado, `situacao|descrição`
#   ownership-da-task.sh --condicao      # o nome da condição estruturada
#
# Saída de --classificar, uma linha por arquivo, ordenada e estável:
#   <situacao>\t<arquivo>\t<tasks que o declaram, ou `-`>
#
# Código de saída:
#   0  nenhum arquivo de task irmã — o fechamento pode seguir; ou ownership=n/a
#   2  a condição estruturada existe (mesma convenção de bloqueio dos hooks)
#   1  não deu para determinar o ownership — falha fechado, nunca infere
#  64  uso inválido
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

TAB=$'\t'

S_ATUAL='na_task_atual'
S_INTACTO='declarado_nao_mudou'
S_DESVIO='desvio'
S_IRMA='arquivo_de_task_irma'

SITUACOES="$S_ATUAL|o arquivo mudou e a task atual o declara
$S_INTACTO|a task atual declara o arquivo, que não mudou
$S_DESVIO|o arquivo mudou e nenhuma task o declara
$S_IRMA|o arquivo mudou e só outra task da feature o declara"

CONDICAO="$S_IRMA"

ERRO=""
PLANO=""
PASTA_TRABALHO=""

contexto() { # <raiz> <origem> <trabalho>
  local raiz="$1" origem="$2" trabalho="$3" canonico legado

  [ -d "$raiz" ] || { ERRO="raiz inexistente: $raiz"; return 1; }
  case "$trabalho" in
    ''|/*|*/*|.|..|.*) ERRO="trabalho_id invalido: '$trabalho'"; return 1 ;;
  esac

  case "$origem" in
    sprintx)
      canonico="$raiz/docs/sprintx/features/$trabalho"
      legado="$raiz/docs/$trabalho"
      if [ -d "$canonico" ]; then PASTA_TRABALHO="$canonico"
      elif [ -d "$legado" ]; then PASTA_TRABALHO="$legado"
      else ERRO="plano corrente ausente: trabalho sprintx '$trabalho'"; return 1
      fi ;;
    runx)
      PASTA_TRABALHO="$raiz/docs/manutencao/$trabalho"
      [ -d "$PASTA_TRABALHO" ] \
        || { ERRO="plano corrente ausente: trabalho runx '$trabalho'"; return 1; } ;;
    n/a)
      PASTA_TRABALHO=""; return 2 ;;
    *)
      ERRO="origem sem aplicabilidade de tasks determinavel: '$origem'"; return 1 ;;
  esac
  return 0
}

# ---------------------------------------------------------------------------
# O plano: `id<TAB>arquivo`, uma linha por par declarado, de todas as tasks.
# ---------------------------------------------------------------------------
# Lê SOMENTE `id` e `arquivos` (`cria`/`altera`). Título, objetivo, status,
# suíte e a ordem em que as tasks aparecem não entram: a mesma evidência de
# conjuntos tem que dar sempre a mesma classificação.
plano() {
  local pasta="$1" f arqs find_rc
  arqs="$(find "$pasta" -name tasks.md -not -path '*/node_modules/*' 2>/dev/null)"
  find_rc=$?
  [ "$find_rc" = 0 ] \
    || { printf '__ERRO__plano corrente ilegivel: nao foi possivel percorrer %s\n' "$pasta"; return 1; }
  [ -n "$arqs" ] || { printf '__ERRO__plano corrente ausente: nenhum tasks.md em %s\n' "$pasta"; return 1; }
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] && [ -r "$f" ] \
      || { printf '__ERRO__plano corrente ilegivel: %s\n' "$f"; return 1; }
    awk '
      function coleta(s,   n, i, partes) {
        sub(/^[^:]*:[[:space:]]*/, "", s)
        gsub(/^\[|\]$/, "", s)
        n = split(s, partes, /,[[:space:]]*/)
        for (i = 1; i <= n; i++) {
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", partes[i])
          gsub(/^["]|["]$/, "", partes[i])
          if (partes[i] != "" && id != "") print id "\t" partes[i]
        }
      }
      # O reconhecimento de uma task nova vem ANTES do coletor em bloco: senão
      # a linha `- id: T-...` seria lida como caminho da task anterior.
      /^[[:space:]]*-[[:space:]]+id:[[:space:]]*T-/ {
        id = $0; sub(/^.*id:[[:space:]]*/, "", id); gsub(/[[:space:]"]+$/, "", id)
        dentro = 0; next
      }
      /^[[:space:]]*arquivos:/ { dentro = 1; next }
      /^[[:space:]]*(cria|altera):/ { coleta($0); dentro = 1; next }
      dentro && /^[[:space:]]*-[[:space:]]+[^[:space:]]+/ {
        c = $0; sub(/^[[:space:]]*-[[:space:]]+/, "", c); gsub(/[[:space:]"]+$/, "", c)
        if (c ~ /^[A-Za-z0-9_.\/-]+$/ && id != "") print id "\t" c
        next
      }
      /^[[:space:]]*[a-z_]+:/ { if ($0 !~ /^[[:space:]]*(cria|altera|arquivos):/) dentro = 0 }
    ' "$f" 2>/dev/null || { printf '__ERRO__plano corrente ilegivel: %s\n' "$f"; return 1; }
  done <<EOF
$arqs
EOF
}

# declara <task> <arquivo> — a task declara esse caminho?
declara() {
  printf '%s\n' "$PLANO" | awk -F'\t' -v t="$1" -v a="$2" \
    '$1 == t && $2 == a { achou = 1 } END { exit !achou }'
}

# tasks_de <arquivo> — as tasks que declaram o caminho, ordenadas: `a,b`.
tasks_de() {
  printf '%s\n' "$PLANO" | awk -F'\t' -v a="$1" '$2 == a { print $1 }' \
    | sort -u | paste -sd, -
}

# arquivos_de <task> — os caminhos que a task declara, ordenados.
arquivos_de() {
  printf '%s\n' "$PLANO" | awk -F'\t' -v t="$1" '$1 == t { print $2 }' | sort -u
}

# situacao_do <task atual> <arquivo que mudou> — `<chave de ordem>\t<situação>`.
#
# É aqui, e só aqui, que a decisão acontece. A ordem dos ramos É a regra:
#   1. ninguém declara o arquivo            → desvio, como sempre foi
#   2. a TASK ATUAL o declara                → dela, mesmo que uma irmã também
#   3. sobrou: só outra task o declara       → a condição estruturada
# Trocar o ramo 2 por "alguma task declara" seria usar a UNIÃO como ownership,
# que é a pergunta da V9 — não a do E1.
situacao_do() {
  if [ -z "$(tasks_de "$2")" ]; then printf '3\t%s\n' "$S_DESVIO"
  elif declara "$1" "$2"; then printf '1\t%s\n' "$S_ATUAL"
  else printf '4\t%s\n' "$S_IRMA"
  fi
}

classificar() {
  local raiz="$1" origem="$2" trabalho="$3" atual="$4"; shift 4
  local mudados saida="" arquivo

  contexto "$raiz" "$origem" "$trabalho"; local contexto_rc=$?
  if [ "$contexto_rc" = 2 ]; then
    printf 'ownership=n/a\n'
    return 0
  fi
  [ "$contexto_rc" = 0 ] || return 1
  case "$atual" in
    T-*) ;;
    *) ERRO="task atual fora do formato T-NN.MM: '$atual'"; return 1 ;;
  esac

  PLANO="$(plano "$PASTA_TRABALHO")"; local plano_rc=$?
  if [ "$plano_rc" != 0 ]; then
    ERRO="${PLANO#__ERRO__}"
    PLANO=""
    return 1
  fi
  [ -n "$PLANO" ] || { ERRO="plano corrente ilegivel: nenhuma task com arquivos declarados em $PASTA_TRABALHO"; return 1; }

  # A task atual precisa existir no plano com arquivos declarados. Sem isso o
  # ownership unitário não é determinável — e inferir pela prosa é proibido.
  # Cair para "a primeira task do plano" aqui inventaria o dono.
  arquivos_de "$atual" | grep -q . || { ERRO="a task atual '$atual' nao declara arquivos no plano corrente de '$trabalho'"; return 1; }

  # Os arquivos que mudaram: argumentos, ou a entrada padrão.
  if [ "$#" -gt 0 ]; then
    mudados="$(printf '%s\n' "$@")"
  else
    mudados="$(cat)"
  fi
  mudados="$(printf '%s\n' "$mudados" | sed 's/[[:space:]]*$//' | grep -v '^$' | sort -u)"

  # A, C e D — sobre o que mudou. A chave numérica à frente só ordena a saída.
  local tasks
  while IFS= read -r arquivo; do
    [ -n "$arquivo" ] || continue
    tasks="$(tasks_de "$arquivo")"
    [ -n "$tasks" ] || tasks='-'
    saida="${saida}$(situacao_do "$atual" "$arquivo")${TAB}${arquivo}${TAB}${tasks}"$'\n'
  done <<EOF
$mudados
EOF

  # B — declarado na atual e que não mudou.
  while IFS= read -r arquivo; do
    [ -n "$arquivo" ] || continue
    printf '%s\n' "$mudados" | grep -Fxq "$arquivo" && continue
    saida="${saida}2${TAB}${S_INTACTO}${TAB}${arquivo}${TAB}$(tasks_de "$arquivo")"$'\n'
  done <<EOF
$(arquivos_de "$atual")
EOF

  # Ordem estável: pela situação (A, B, C, D) e, dentro dela, pelo caminho.
  # Nem a ordem das tasks no plano nem a ordem dos arquivos na entrada mudam
  # a saída.
  printf '%s' "$saida" | grep -v '^$' | LC_ALL=C sort -t"$TAB" -k1,1 -k3,3 | cut -f2-

  printf '%s' "$saida" | grep -q "^4${TAB}" && return 2
  return 0
}

case "${1:-}" in
  --situacoes) printf '%s\n' "$SITUACOES"; exit 0 ;;
  --condicao)  printf '%s\n' "$CONDICAO"; exit 0 ;;
  --classificar)
    shift
    [ "$#" -ge 4 ] || { printf 'ownership-da-task: --classificar <raiz> <origem> <trabalho> <T-NN.MM> [arquivo...]\n' >&2; exit 64; }
    classificar "$@"; rc=$?
    [ "$rc" = 1 ] && { printf 'ownership-da-task: %s\n' "$ERRO" >&2; exit 1; }
    exit "$rc" ;;
  *) printf 'ownership-da-task: opção desconhecida: %s\n' "${1:-}" >&2; exit 64 ;;
esac
