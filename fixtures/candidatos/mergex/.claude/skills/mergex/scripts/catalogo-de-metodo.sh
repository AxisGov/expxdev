#!/usr/bin/env bash
# catalogo-de-metodo — os caminhos exatos dos artefatos de método do trabalho
# corrente. Biblioteca: é carregada com `.` e não executa nada sozinha.
#
# Uma fonte só para duas perguntas (DM-172):
#   - persistir-metodo.sh (M2): quais artefatos de método este checkpoint
#     persiste — ele filtra existência, arquivo regular e dirty;
#   - fechamento-do-e1.sh (M4): quais paths dirty da árvore são método do
#     trabalho corrente e, por isso, NÃO são produto nem entram no E1.
#
# O catálogo é fechado: nomes literais por pasta do trabalho, sprints
# `sprint-NN`, a base enumerada pelo próprio `00-INDICE.md`, a entrega do
# trabalho e — só na sprintx — o `HISTORICO.md` global pelo caminho exato.
# Nenhum glob de diretório (`docs/**`, pasta inteira) vira método: um produto
# com nome parecido continua produto.
#
# A atribuição do `HISTORICO.md` ao trabalho (o diff só acrescenta linhas
# dele) NÃO mora aqui: é prova do checkpoint, feita por persistir-metodo.sh
# antes de gravar. O E1 não o commita de jeito nenhum.
#
# Uso:
#   catalogo_metodo <raiz> <origem> <trabalho> <pasta> <checkpoint>
#     <pasta> relativa à raiz (a pasta resolvida do trabalho);
#     <checkpoint> pre-e2 | reconciliacao-base | predecessores |
#     retomar-v9-predecessores | pre-e6 | e8 (cumulativo; e8 é o conjunto
#     inteiro). Os três checkpoints de recuperação têm catálogo estreito:
#     reconciliacao-base é só ENTREGA.md e os
#     RECONCILIACAO-BASE-NNN.md de ENTREGA.reconciliacoes; pre-e6 e e8 também
#     incluem esses artefatos; predecessores é só 00-PREDECESSORES.md;
#     retomar-v9-predecessores é só ENTREGA.md. Nome fora do contrato retorna 1.
#   Imprime um caminho relativo por linha, sem ordem garantida.
#   Retorna 1 com CATALOGO_ERRO preenchido quando o índice da base é inválido.
#   Chame SEM subshell (`catalogo_metodo ... > arquivo`) para ler CATALOGO_ERRO.
#
#   catalogo_pasta_do_trabalho <raiz> <origem> <trabalho>
#     A pasta do trabalho, relativa à raiz: SprintX canônica
#     `docs/sprintx/features/<t>`, senão a legada `docs/<t>` (as duas ao mesmo
#     tempo é erro); RunX `docs/manutencao/<t>`. Pasta ausente ou origem sem
#     pasta: retorna 1 com CATALOGO_ERRO. Mesmas regras de persistir-metodo.sh.
#     Também deixa a pasta em CATALOGO_PASTA, para quem a chama sem subshell
#     e precisa ler CATALOGO_ERRO.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

CATALOGO_ERRO=""

catalogo_fm() { # <arquivo> <chave>
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

catalogo_pasta_do_trabalho() { # <raiz> <origem> <trabalho>
  local raiz="$1" origem="$2" trabalho="$3" canonica legada pasta
  CATALOGO_ERRO=""; CATALOGO_PASTA=""
  case "$origem" in
    sprintx)
      canonica="docs/sprintx/features/$trabalho"
      legada="docs/$trabalho"
      if [ -d "$raiz/$canonica" ] && [ -d "$raiz/$legada" ]; then
        CATALOGO_ERRO="há duas pastas SprintX para $trabalho"; return 1
      elif [ -d "$raiz/$canonica" ]; then
        pasta="$canonica"
      elif [ -d "$raiz/$legada" ]; then
        pasta="$legada"
      else
        CATALOGO_ERRO="pasta SprintX do trabalho não existe"; return 1
      fi ;;
    runx)
      pasta="docs/manutencao/$trabalho"
      [ -d "$raiz/$pasta" ] || { CATALOGO_ERRO="pasta RunX do trabalho não existe"; return 1; } ;;
    *) CATALOGO_ERRO="origem sem pasta de trabalho: $origem"; return 1 ;;
  esac
  CATALOGO_PASTA="$pasta"
  printf '%s\n' "$pasta"
}

catalogo_areas_do_indice() {
  awk '
    NR == 1 { if ($0 !~ /^---[[:space:]]*\r?$/) exit; next }
    /^---[[:space:]]*\r?$/ { exit }
    {
      linha = $0; gsub(/\r/, "", linha)
      if (linha ~ /^[[:space:]]*-?[[:space:]]*arquivo:[[:space:]]*/) {
        sub(/^[[:space:]]*-?[[:space:]]*arquivo:[[:space:]]*/, "", linha)
        gsub(/^["'"'"']|["'"'"'][[:space:]]*$/, "", linha)
        gsub(/[[:space:]]+$/, "", linha)
        print linha
      }
    }
  ' "$1" 2>/dev/null
}

catalogo_base() { # <raiz> <trabalho> <pasta>
  local raiz="$1" trabalho="$2" pasta="$3" indice area
  indice="$pasta/base/00-INDICE.md"
  printf '%s\n' "$pasta/base/00-LACUNAS.md"
  [ -f "$raiz/$indice" ] || return 0
  [ ! -L "$raiz/$indice" ] || { CATALOGO_ERRO="$indice é link simbólico"; return 1; }
  [ "$(catalogo_fm "$raiz/$indice" kind)" = base_indice ] \
    || { CATALOGO_ERRO="$indice não declara kind: base_indice"; return 1; }
  [ "$(catalogo_fm "$raiz/$indice" trabalho_id)" = "$trabalho" ] \
    || { CATALOGO_ERRO="$indice pertence a outro trabalho"; return 1; }
  printf '%s\n' "$indice"
  while IFS= read -r area; do
    [ -n "$area" ] || continue
    case "$area" in
      */*|*\\*|*..*|00-INDICE.md|00-LACUNAS.md|*.md) ;;
      *) CATALOGO_ERRO="$indice enumera nome inválido: $area"; return 1 ;;
    esac
    case "$area" in
      */*|*\\*|*..*|00-INDICE.md|00-LACUNAS.md)
        CATALOGO_ERRO="$indice enumera caminho fora da base: $area"; return 1 ;;
      *.md) ;;
      *) CATALOGO_ERRO="$indice enumera arquivo que não é Markdown: $area"; return 1 ;;
    esac
    printf '%s\n' "$pasta/base/$area"
  done <<EOF
$(catalogo_areas_do_indice "$raiz/$indice")
EOF
}

catalogo_sprints() { # <raiz> <pasta>
  local raiz="$1" pasta="$2" dir nome arquivo
  for dir in "$raiz/$pasta"/sprint-*; do
    [ -d "$dir" ] || continue
    nome="$(basename "$dir")"
    printf '%s\n' "$nome" | grep -Eq '^sprint-[0-9]{2,}$' || continue
    for arquivo in tasks.md sprint.md fases.md; do
      printf '%s\n' "$pasta/$nome/$arquivo"
    done
  done
}

catalogo_reconciliacoes_brutas() { # <ENTREGA.md> — `=<valor>` de cada `arquivo:` do bloco
  [ -r "$1" ] || return 0
  awk '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; fm = 1; next }
    fm && /^---[[:space:]]*$/ { exit }
    !fm { next }
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      nome = $0; sub(/:.*/, "", nome); dentro = (nome == "reconciliacoes")
      if (dentro) {
        v = $0; sub(/^[^:]*:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
        if (v != "" && v != "[]") print "!" v
      }
      next
    }
    dentro && /^[[:space:]]*(-[[:space:]]+)?arquivo:/ {
      v = $0; sub(/^[[:space:]]*(-[[:space:]]+)?arquivo:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
      print "=" v
    }
  ' "$1" 2>/dev/null
}

# catalogo_reconciliacoes <raiz> <trabalho> — os artefatos RECONCILIACAO-BASE-NNN.md
# nomeados em `reconciliacoes[].arquivo` do ENTREGA.md do disco, como caminhos
# relativos à raiz. Só nome literal; qualquer outro valor, ou lista que não seja
# `[]` nem bloco, falha fechado.
catalogo_reconciliacoes() {
  local raiz="$1" trabalho="$2" arquivo nome
  arquivo="$raiz/docs/entregas/$trabalho/ENTREGA.md"
  [ -f "$arquivo" ] && [ ! -L "$arquivo" ] || return 0
  while IFS= read -r nome; do
    case "$nome" in
      '!'*) CATALOGO_ERRO="ENTREGA.reconciliacoes fora do formato de bloco: ${nome#!}"; return 1 ;; # guarda:FLOW
      =*) nome="${nome#=}" ;;
      *) continue ;;
    esac
    case "$nome" in
      RECONCILIACAO-BASE-[0-9][0-9][0-9].md) ;; # guarda:NOME-LITERAL
      *) CATALOGO_ERRO="ENTREGA.reconciliacoes lista nome inválido: $nome"; return 1 ;;
    esac
    printf '%s\n' "docs/entregas/$trabalho/$nome"
  done <<EOF
$(catalogo_reconciliacoes_brutas "$arquivo")
EOF
}

catalogo_metodo() { # <raiz> <origem> <trabalho> <pasta> <checkpoint>
  local raiz="$1" origem="$2" trabalho="$3" pasta="$4" checkpoint="$5" nome
  CATALOGO_ERRO=""
  case "$checkpoint" in pre-e2|reconciliacao-base|predecessores|retomar-v9-predecessores|pre-e6|e8) ;;
    *) CATALOGO_ERRO="checkpoint desconhecido: $checkpoint"; return 1 ;;
  esac
  if [ "$checkpoint" = reconciliacao-base ]; then # guarda:CAT-RECONCILIACAO
    # Só a entrega e os artefatos da reconciliação: nada de plano, base,
    # HISTORICO, produto, teste nem documentos E3-E5.
    case "$origem" in sprintx|runx) ;;
      *) CATALOGO_ERRO="origem sem catálogo de método: $origem"; return 1 ;;
    esac
    printf '%s\n' "docs/entregas/$trabalho/ENTREGA.md"
    catalogo_reconciliacoes "$raiz" "$trabalho" || return 1
    return 0
  fi
  if [ "$checkpoint" = predecessores ]; then
    [ "$origem" = sprintx ] || { CATALOGO_ERRO="predecessores exige origem sprintx"; return 1; }
    printf '%s\n' "$pasta/00-PREDECESSORES.md"
    return 0
  fi
  if [ "$checkpoint" = retomar-v9-predecessores ]; then
    [ "$origem" = sprintx ] || { CATALOGO_ERRO="retomar-v9-predecessores exige origem sprintx"; return 1; }
    printf '%s\n' "docs/entregas/$trabalho/ENTREGA.md"
    return 0
  fi
  case "$origem" in
    sprintx)
      for nome in 00-DECISOES.md BUILDX-PREMISSAS.md 00-ESTIMATIVA.md PREFLIGHT.md ORQUESTRADOR.md \
        00-AUDITORIA.md FECHAMENTO.md 00-PLANEJAMENTO.md 00-BLOQUEIOS.md 00-PREDECESSORES.md; do
        printf '%s\n' "$pasta/$nome"
      done ;;
    runx)
      for nome in 00-OCORRENCIA.md 01-CAUSA-RAIZ.md ORQUESTRADOR.md QA.md BLOQUEIOS.md; do
        printf '%s\n' "$pasta/$nome"
      done ;;
    *) CATALOGO_ERRO="origem sem catálogo de método: $origem"; return 1 ;;
  esac
  catalogo_sprints "$raiz" "$pasta"
  catalogo_base "$raiz" "$trabalho" "$pasta" || return 1
  [ "$origem" = sprintx ] && printf '%s\n' docs/sprintx/estimativas/HISTORICO.md
  printf '%s\n' "docs/entregas/$trabalho/ENTREGA.md"
  case "$checkpoint" in
    pre-e6|e8)
      printf '%s\n' "docs/entregas/$trabalho/ATENCAO.md" \
        "docs/entregas/$trabalho/PR.md" "docs/entregas/$trabalho/QA-PACOTE.md"
      catalogo_reconciliacoes "$raiz" "$trabalho" || return 1 ;; # guarda:CAT-PRE-E6-E8
  esac
  return 0
}
