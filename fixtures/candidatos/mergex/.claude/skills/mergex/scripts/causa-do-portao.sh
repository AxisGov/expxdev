#!/usr/bin/env bash
# causa-do-portao — as falhas que o portão (E2) registrou e a causa que o
# fechamento bloqueado (E8) grava no ENTREGA.md.
#
# Contrato: references/00-schema.md, "A causa do bloqueio"; references/02-prontidao.md,
# "Registro das falhas"; references/08-registro.md, "Fechamento bloqueado".
#
# A causa NÃO é lida da prosa, do B-NN nem da narrativa de quem executou. Ela é
# função pura de `falhas_portao` — a lista das verificações que deram FALHA —,
# que fica gravada no mesmo ENTREGA.md. Mesma lista, mesma causa, sempre.
#
#   1. Cada verificação tem UMA causa (tabela CAUSAS). Nenhum outro valor existe.
#   2. Várias falhas: vence a primeira da ORDEM — V10; depois V6..V9; depois
#      V1..V5 e V11, cada grupo na numeração do portão.
#   3. `vN_sem_prova` é a verificação que não pôde rodar (FALHA por ausência de
#      prova). Se ela aparece antes de qualquer falha provada, a causa é
#      `indeterminada`: a mergex não sabe, e não inventa.
#
# Uso:
#   causa-do-portao.sh --derivar v7 v1            # imprime a causa (a ordem de entrada não importa)
#   causa-do-portao.sh --lista v7 v1              # imprime `[v1, v7]`, a forma gravada em falhas_portao
#   causa-do-portao.sh --validar <ENTREGA.md|->   # gravação nova: as duas chaves obrigatórias
#   causa-do-portao.sh --validar-historico <ENTREGA.md|->
#                                                 # leitura: aceita ENTREGA anterior às chaves
#   causa-do-portao.sh --ordem | --causas
#
# Saída de --validar*: `causa=<valor|null|ausente>` e código 0; ou o motivo em
# stderr e código 1. Opção inválida: 64.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

ORDEM='v10 v6 v7 v8 v9 v1 v2 v3 v4 v5 v11'

# verificação|causa
CAUSAS='v1|tarefa_nao_concluida
v2|suite_reprovada
v3|teste_nao_declarado
v4|regressao_nao_declarada
v5|qa_nao_aprovado
v6|auditoria_reprovada
v7|bloqueio_aberto
v8|legado_incompleto
v9|arquivo_fora_do_plano
v10|segredo_no_diff
v11|commit_nao_registrado'

INDETERMINADA='indeterminada'

causa_de() { # <vN> — a causa da verificação
  printf '%s\n' "$CAUSAS" | awk -F'|' -v v="$1" '$1 == v { print $2; exit }'
}

numero() { # <token> — o número da verificação, ou vazio se o token não é válido
  case "$1" in
    v[1-9]|v10|v11) printf '%s\n' "${1#v}" ;;
    v[1-9]_sem_prova|v10_sem_prova|v11_sem_prova) local t="${1%_sem_prova}"; printf '%s\n' "${t#v}" ;;
    *) printf '\n' ;;
  esac
}

# confere_falhas <tokens...> — lista válida: tokens conhecidos, sem repetição,
# sem `vN` e `vN_sem_prova` juntos, na numeração do portão.
confere_falhas() {
  local t n ant=0 vistos=" "
  for t in "$@"; do
    n="$(numero "$t")"
    [ -n "$n" ] || { ERRO="falha desconhecida em falhas_portao: $t"; return 1; }
    case "$vistos" in *" v$n "*) ERRO="verificação v$n registrada duas vezes em falhas_portao"; return 1 ;; esac
    [ "$n" -gt "$ant" ] || { ERRO="falhas_portao fora da numeração do portão: $t"; return 1; }
    vistos="$vistos v$n "; ant="$n"
  done
  return 0
}

# ordena <tokens...> — os tokens na numeração do portão (a forma gravada).
ordena() {
  local t
  for t in "$@"; do printf '%s\t%s\n' "$(numero "$t")" "$t"; done | sort -n -k1,1 | cut -f2
}

# deriva <tokens...> — imprime a causa; sem falha nenhuma, não há causa a derivar.
deriva() {
  [ "$#" -gt 0 ] || { ERRO="nenhuma falha registrada: não há causa a derivar"; return 1; }
  local v t
  for v in $ORDEM; do
    for t in "$@"; do
      [ "$t" = "$v" ] && { causa_de "$v"; return 0; }
      [ "$t" = "${v}_sem_prova" ] && { printf '%s\n' "$INDETERMINADA"; return 0; }
    done
  done
  ERRO="nenhuma falha reconhecida"; return 1
}

# ---------------------------------------------------------------------------
# Frontmatter: `chave<TAB>valor` de cada chave de topo; a PRESENÇA importa.
# ---------------------------------------------------------------------------
FM=""
le_frontmatter() {
  local arq="$1"
  if [ "$arq" = - ]; then arq=/dev/stdin; fi
  [ "$arq" = /dev/stdin ] || [ -r "$arq" ] || { ERRO="arquivo ilegível: $1"; return 1; }
  FM="$(awk '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[[:space:]]*$/) { print "\001sem-frontmatter"; exit }; next }
    /^---[[:space:]]*$/ { fechado = 1; exit }
    /^[a-z_][a-z0-9_]*:/ {
      chave = $0; sub(/:.*/, "", chave)
      valor = $0; sub(/^[^:]*:[[:space:]]*/, "", valor); sub(/[[:space:]]+$/, "", valor)
      printf "%s\t%s\n", chave, valor
    }
    END { if (NR > 0 && !fechado) print "\001aberto" }
  ' "$arq")"
  case "$FM" in
    *$'\001'sem-frontmatter*) ERRO="o arquivo não começa com frontmatter"; return 1 ;;
    *$'\001'aberto*)          ERRO="o frontmatter não foi fechado"; return 1 ;;
  esac
  [ -n "$FM" ] || { ERRO="frontmatter vazio"; return 1; }
}
tem()   { printf '%s\n' "$FM" | awk -F'\t' -v c="$1" '$1 == c { achou = 1 } END { exit !achou }'; }
valor() { printf '%s\n' "$FM" | awk -F'\t' -v c="$1" '$1 == c { print $2; exit }'; }

# lista_fluxo <valor> — `[a, b]` vira `a b`; qualquer outra forma é erro.
lista_fluxo() {
  case "$1" in
    '[]') printf '\n' ;;
    \[*\]) printf '%s\n' "$1" | sed 's/^\[//; s/\]$//' | tr ',' ' ' | tr -s ' ' | sed 's/^ //; s/ $//' ;;
    *) return 1 ;;
  esac
}

valida() { # <arquivo> <historico:0|1>
  local arq="$1" historico="$2" estado portao causa falhas lista esperada tem_c tem_f
  ERRO=""
  le_frontmatter "$arq" || return 1
  [ "$(valor kind)" = entrega ] || { ERRO="kind não é entrega"; return 1; }

  estado="$(valor estado)"; portao="$(valor portao)"
  case "$estado" in aberto|entregue|bloqueado) ;; *) ERRO="estado fora do enum: '${estado}'"; return 1 ;; esac
  case "$portao" in pronto|bloqueado|null) ;; *) ERRO="portao fora do enum: '${portao}'"; return 1 ;; esac

  tem_c=0; tem causa && tem_c=1
  tem_f=0; tem falhas_portao && tem_f=1
  if [ "$tem_c" = 0 ] && [ "$tem_f" = 0 ]; then
    if [ "$historico" = 1 ]; then
      # ENTREGA gravada antes das chaves: legível, mas a causa NÃO está commitada.
      printf 'causa=ausente\n'; return 0
    fi
    ERRO="chave causa ausente (gravação nova exige causa e falhas_portao)"; return 1
  fi
  [ "$tem_c" = 1 ] || { ERRO="chave causa ausente"; return 1; }
  [ "$tem_f" = 1 ] || { ERRO="chave falhas_portao ausente"; return 1; }

  causa="$(valor causa)"
  if [ "$causa" != null ] && [ "$causa" != "$INDETERMINADA" ] \
     && ! printf '%s\n' "$CAUSAS" | cut -d'|' -f2 | grep -Fxq -- "$causa"; then
    ERRO="causa fora do enum: '${causa}'"; return 1
  fi

  falhas="$(valor falhas_portao)"
  lista="$(lista_fluxo "$falhas")" || { ERRO="falhas_portao não é lista em uma linha: '${falhas}'"; return 1; }
  # shellcheck disable=SC2086
  confere_falhas $lista || return 1

  case "$portao" in
    pronto|null) [ -z "$lista" ] || { ERRO="portao $portao com falhas registradas"; return 1; } ;;
    bloqueado)   [ -n "$lista" ] || { ERRO="portao bloqueado sem falhas registradas"; return 1; } ;;
  esac

  case "$estado" in
    aberto)
      [ "$causa" = null ] || { ERRO="estado aberto exige causa: null"; return 1; } ;;
    entregue)
      [ "$portao" = pronto ] || { ERRO="estado entregue exige portao: pronto"; return 1; }
      [ "$causa" = null ]    || { ERRO="estado entregue exige causa: null"; return 1; } ;;
    bloqueado)
      [ "$portao" = bloqueado ] || { ERRO="estado bloqueado exige portao: bloqueado"; return 1; }
      [ "$causa" != null ]      || { ERRO="estado bloqueado exige causa não nula"; return 1; }
      # shellcheck disable=SC2086
      esperada="$(deriva $lista)" || return 1
      [ "$causa" = "$esperada" ] \
        || { ERRO="causa '$causa' não é a derivada de falhas_portao ($falhas): '$esperada'"; return 1; } ;;
  esac
  printf 'causa=%s\n' "$causa"
}

ERRO=""
case "${1:-}" in
  --ordem)  printf '%s\n' "$ORDEM"; exit 0 ;;
  --causas) printf '%s\n' "$CAUSAS"; printf '*|%s\n' "$INDETERMINADA"; exit 0 ;;
  --derivar|--lista)
    modo="$1"; shift
    # A ordem de entrada não importa: a mesma evidência dá a mesma causa.
    # shellcheck disable=SC2046
    set -- $(ordena "$@")
    if confere_falhas "$@"; then
      if [ "$modo" = --lista ]; then
        printf '[%s]\n' "$(printf '%s\n' "$@" | paste -sd, - | sed 's/,/, /g')"; exit 0
      fi
      deriva "$@" && exit 0
    fi
    printf 'causa-do-portao: %s\n' "$ERRO" >&2; exit 1 ;;
  --validar|--validar-historico)
    h=0; [ "$1" = --validar-historico ] && h=1
    [ "$#" -eq 2 ] || { printf 'causa-do-portao: %s <ENTREGA.md|->\n' "$1" >&2; exit 64; }
    valida "$2" "$h" && exit 0
    printf 'causa-do-portao: %s\n' "$ERRO" >&2; exit 1 ;;
  *) printf 'causa-do-portao: opção desconhecida: %s\n' "${1:-}" >&2; exit 64 ;;
esac
