#!/usr/bin/env bash
# prova-de-commit — a V11 do portão de prontidão (E2): toda task `concluida`
# tem prova de E1 em `ENTREGA.commits`?
#
# Contrato: references/02-prontidao.md, "V11 — Task concluída sem commit do E1";
# references/00-schema.md, "O kind que a mergex produz" (a lista `commits`);
# references/01-commits.md, "commits é histórico de execução, não índice de plano".
#
# A V11 responde UMA pergunta, e só ela: para cada task marcada `concluida` no
# plano executado, existe pelo menos UM item de `ENTREGA.commits` cujo `task`
# é exatamente o id dela e cujo `commit` é um identificador válido?
#
#   1. Ela NÃO lê `suite` (V2), `teste_integracao`/`teste_funcional` (V3), nem
#      o status das tasks não concluídas (V1). Task não concluída não é alvo
#      positivo da V11: a razão dela é da V1, e duas verificações não dão a
#      mesma razão duas vezes.
#   2. EXISTE pelo menos um item — nunca "exatamente um". Uma task pode
#      reaparecer em `commits` depois de replanejamento, e isso é histórico de
#      execução válido, não erro. Ordem e seção crítica não são assunto daqui.
#   3. Prova é o item inteiro. `task` sem `commit`, `commit` vazio, marcador de
#      template ou SHA malformado não provam nada: o item existe, a prova não.
#   4. A evidência canônica do E1 é `ENTREGA.commits` (é o que o E1 grava, e o
#      que o E8 commita). A V11 não audita `git log`: o cruzamento que faltava
#      é `tasks.md` × `ENTREGA.commits`, e é só esse que ela fecha.
#   5. Sem versionador (`versionado: false`) não há commit a exigir — o schema
#      já define `commits: []` nesse caso. A V11 é `n/a`, nunca FALHA.
#   6. O que não pôde ser lido sai como SEM_PROVA (código 2), para o E2
#      registrar `v11_sem_prova`. Ausência de prova não é prova.
#   7. A ordem NÃO é assunto da V11. Desde a chave `seq`, quem lê a lista é o
#      `sequencia-de-commits.sh` — a interpretação mecânica única de `commits`,
#      carregada aqui para não existirem dois parsers. A V11 usa dele só a
#      leitura crua: `seq` fora de sequência é contrato inválido, e quem para
#      por isso é a validação de contrato, nunca o portão.
#
# Uso:
#   prova-de-commit.sh --verificar <ENTREGA.md|-> <tasks.md>...
#   prova-de-commit.sh --commits <ENTREGA.md|->     # `task<TAB>commit` dos itens VÁLIDOS
#   prova-de-commit.sh --concluidas <tasks.md>...   # `id<TAB>arquivo` das tasks concluídas
#   prova-de-commit.sh --sha <valor>                # 0 quando é identificador válido
#
# Saída de --verificar, primeira linha sempre:
#   V11=OK         (código 0) — toda task concluída tem prova
#   V11=n/a        (código 0) — mais `motivo=`; a verificação não se aplica
#   V11=FALHA      (código 1) — mais uma linha `id<TAB>arquivo` por task sem prova
#   V11=SEM_PROVA  (código 2) — mais `motivo=`; não foi possível verificar
# Opção inválida: 64.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

ERRO=""

# ---------------------------------------------------------------------------
# O leitor de `commits` é compartilhado: `bloco`, `confere_bloco`, `escalar`,
# `legivel`, `limpa`, `sha_valido` e `itens_de` vêm do sequencia-de-commits.sh,
# que é a interpretação mecânica única da lista (`references/00-schema.md`,
# "A ordem de registro"). Duplicar o parser aqui faria as duas leituras
# divergirem na primeira manutenção — e foi exatamente isso que aconteceu
# quando o item passou a poder começar por `seq:` em vez de `task:`.
# ---------------------------------------------------------------------------
# shellcheck source=sequencia-de-commits.sh
. "$(dirname "${BASH_SOURCE[0]}")/sequencia-de-commits.sh"

# ---------------------------------------------------------------------------
# commits_validos <ENTREGA.md> — `task<TAB>commit` de cada item VÁLIDO de
# `ENTREGA.commits`, na ordem em que estão no arquivo. Item sem `task`, sem
# `commit` ou com `commit` malformado não sai: ele não é prova de nada.
# ---------------------------------------------------------------------------
commits_validos() {
  local arq="$1" its linha t c
  its="$(itens_de "$arq")" || return 1
  [ -n "$its" ] || return 0
  printf '%s\n' "$its" | while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    campos "$linha"
    t="$(limpa "$CAMPO3")"; c="$(limpa "$CAMPO4")"
    [ -n "$t" ] || continue
    sha_valido "$c" || continue
    printf '%s\t%s\n' "$t" "$c"
  done
}

# ---------------------------------------------------------------------------
# concluidas_de <tasks.md>... — `id<TAB>arquivo` das tasks `concluida`.
#
# As tasks vêm sempre da chave `tasks`, nos DOIS formatos de sprint da sprintx
# (`kind: plano` e `kind: tasks`) — o formato nunca muda quais campos existem
# (`references/integracao/sprintx.md`, "Como ler uma sprint da sprintx").
# ---------------------------------------------------------------------------
concluidas_de() {
  local arq b saida=0
  for arq in "$@"; do
    legivel "$arq" || return 1
    b="$(bloco "$arq" tasks)"
    confere_bloco "$b" || { ERRO="$ERRO: $arq"; return 1; }
    printf '%s\n' "$b" | awk -v arq="$arq" '
      /^\001/ { next }
      { sub(/\r$/, "") }
      /^[[:space:]]*-[[:space:]]*id:/ {
        if (id != "" && st == "concluida") print id "\t" arq
        id = $0; sub(/^[[:space:]]*-[[:space:]]*id:[[:space:]]*/, "", id); sub(/[[:space:]]+$/, "", id)
        gsub(/^["'"'"']|["'"'"']$/, "", id)
        st = ""; next
      }
      /^[[:space:]]*status:/ {
        if (id == "") next
        st = $0; sub(/^[[:space:]]*status:[[:space:]]*/, "", st); sub(/[[:space:]]+$/, "", st)
        gsub(/^["'"'"']|["'"'"']$/, "", st)
        next
      }
      END { if (id != "" && st == "concluida") print id "\t" arq }
    ' || saida=1
  done
  return "$saida"
}

# ---------------------------------------------------------------------------
verificar() { # <ENTREGA.md> <tasks.md>...
  local ent="$1" versionado provadas concluidas faltam id arq; shift
  if [ "$#" -eq 0 ]; then
    printf 'V11=SEM_PROVA\nmotivo=nenhum-tasks-md-informado\n'; return 2
  fi
  if ! legivel "$ent"; then
    printf 'V11=SEM_PROVA\nmotivo=entrega-ilegivel\n'; printf 'prova-de-commit: %s\n' "$ERRO" >&2; return 2
  fi

  # Sem versionador o schema já define `commits: []`: não há commit a exigir.
  versionado="$(escalar "$ent" versionado)"
  if [ "$(limpa "$versionado")" = false ]; then
    printf 'V11=n/a\nmotivo=sem-versionador\n'; return 0
  fi

  if ! concluidas="$(concluidas_de "$@")"; then
    printf 'V11=SEM_PROVA\nmotivo=plano-ilegivel\n'; printf 'prova-de-commit: %s\n' "$ERRO" >&2; return 2
  fi
  if ! provadas="$(commits_validos "$ent")"; then
    printf 'V11=SEM_PROVA\nmotivo=commits-ilegivel\n'; printf 'prova-de-commit: %s\n' "$ERRO" >&2; return 2
  fi

  # Nenhuma task concluída: a V11 não tem alvo positivo. A razão de não haver
  # task concluída é da V1, e a V11 não a repete.
  if [ -z "$concluidas" ]; then
    printf 'V11=n/a\nmotivo=nenhuma-task-concluida\n'; return 0
  fi

  faltam=""
  while IFS=$'\t' read -r id arq; do
    [ -n "$id" ] || continue
    # EXISTE pelo menos um item: casamento EXATO do id, nunca prefixo ou trecho.
    printf '%s\n' "$provadas" | cut -f1 | grep -Fxq -- "$id" && continue
    faltam="$faltam$id	$arq
"
  done <<EOF
$concluidas
EOF

  if [ -z "$faltam" ]; then printf 'V11=OK\n'; return 0; fi
  printf 'V11=FALHA\n'
  printf '%s' "$faltam"
  return 1
}

case "${1:-}" in
  --verificar)
    shift
    [ "$#" -ge 1 ] || { printf 'prova-de-commit: --verificar <ENTREGA.md> <tasks.md>...\n' >&2; exit 64; }
    verificar "$@"; exit $? ;;
  --commits)
    [ "$#" -eq 2 ] || { printf 'prova-de-commit: --commits <ENTREGA.md|->\n' >&2; exit 64; }
    commits_validos "$2" && exit 0
    printf 'prova-de-commit: %s\n' "$ERRO" >&2; exit 1 ;;
  --concluidas)
    shift
    [ "$#" -ge 1 ] || { printf 'prova-de-commit: --concluidas <tasks.md>...\n' >&2; exit 64; }
    concluidas_de "$@" && exit 0
    printf 'prova-de-commit: %s\n' "$ERRO" >&2; exit 1 ;;
  --sha)
    [ "$#" -eq 2 ] || { printf 'prova-de-commit: --sha <valor>\n' >&2; exit 64; }
    sha_valido "$(limpa "$2")" && exit 0 || exit 1 ;;
  *) printf 'prova-de-commit: opção desconhecida: %s\n' "${1:-}" >&2; exit 64 ;;
esac
