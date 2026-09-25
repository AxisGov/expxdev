#!/usr/bin/env bash
# classificar-atencao — a ordem dos critérios do E3 e o reconhecimento dos
# artefatos de método (critérios L4 e D4).
#
# Contrato: references/03-atencao-humana.md, "Passo 3" e "Artefatos de método".
#
# Quem classifica continua sendo o agente `revisor-diff`: é ele quem levanta a
# evidência de cada critério. Este script faz as duas coisas que não podem
# depender de leitura de prosa:
#
#   1. aplica a ORDEM — O1..O9, L1..L3, L4, D1..D3, D4, padrão — e para no
#      primeiro que bate. Critério O sempre vence: artefato de método nunca
#      anula evidência de risco;
#   2. RECONHECE artefato de método pelo catálogo fechado abaixo. L4 e D4 só
#      existem por aqui: quem chama não consegue declará-los.
#
# Reconhecimento é específico, nunca curinga. Todos os sinais precisam bater:
#   - o trabalho corrente sai da branch (exatamente um ENTREGA.md com
#     `branch:` igual à branch ativa — o mesmo resolvedor do hook de escopo);
#   - a origem sai da pasta do trabalho E precisa conferir com o `expx_tool`
#     do ENTREGA.md; a pasta precisa ter ORQUESTRADOR.md deste trabalho;
#   - o caminho casa com uma linha do catálogo, dentro da pasta DESTE trabalho;
#   - o `kind` do frontmatter confere com o catálogo (e o arquivo sem kind no
#     contrato não pode declarar um);
#   - arquivo regular, não executável, não link simbólico.
# `expx_tool: sprintx` escrito num arquivo qualquer não reconhece nada.
#
# Qualquer dúvida => não reconhecido => a classificação segue como sempre, e
# o padrão continua sendo OLHO OBRIGATÓRIO.
#
# Uso (na raiz do projeto):
#   printf '%s\t%s\t%s\n' <caminho> "O5: evidência" "D1: evidência" \
#     | bash .claude/skills/mergex/scripts/classificar-atencao.sh --base <branch-base>
#
# Entrada: uma linha por arquivo do diff; campos separados por TAB; o primeiro
# é o caminho, os demais são critérios `Xn: evidência` que o agente confirmou.
# Saída: <caminho> TAB <faixa> TAB <justificativa>, na ordem de entrada.
#
#   --base <ref>   base do diff (a mesma do E3); sem ela, D4 do HISTORICO não é provado
#   --raiz <dir>   raiz do projeto (padrão: a que o versionador informa)
#   --ordem        imprime a ordem dos critérios e sai
#   --catalogo     imprime o catálogo e sai
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

FAIXA_OLHO='OLHO OBRIGATÓRIO'
FAIXA_LEITURA='LEITURA RÁPIDA'
FAIXA_DISPENSAVEL='DISPENSÁVEL'

ORDEM='O1 O2 O3 O4 O5 O6 O7 O8 O9 L1 L2 L3 L4 D1 D2 D3 D4 PADRAO'

# origem|caminho|kind|critério|função
#   caminho sem `docs/` na frente é relativo à pasta do trabalho;
#   `sprint-NN` é só `sprint-` seguido de dígitos; `base/<area>.md` só vale para
#   arquivo listado no `base/00-INDICE.md` do mesmo trabalho;
#   kind `-` = o contrato não define frontmatter, e o arquivo não pode declarar kind;
#   critério `D4:<prova>` = dispensável só quando a prova mecânica passa; se não
#   passa, o artefato é conferido em LEITURA RÁPIDA (L4).
CATALOGO='sprintx|00-DECISOES.md|decisoes|L4|decisões e hipóteses do trabalho
sprintx|BUILDX-PREMISSAS.md|-|L4|premissas assumidas pela buildx no lugar do humano
sprintx|00-ESTIMATIVA.md|estimativa|L4|estimativa com premissas e invalidadores
sprintx|ORQUESTRADOR.md|orquestrador|L4|objetivo, mapa e rota do trabalho
sprintx|00-AUDITORIA.md|-|L4|veredito e achados da auditoria do plano
sprintx|FECHAMENTO.md|fechamento|L4|resumo, decisão principal e risco residual
sprintx|sprint-NN/tasks.md|tasks,plano|L4|plano: tasks, testes e critérios de aceite
sprintx|sprint-NN/sprint.md|sprint|L4|plano: objetivo e critério de saída da sprint
sprintx|sprint-NN/fases.md|fases|L4|plano: fases e critérios de saída
sprintx|base/00-LACUNAS.md|-|L4|lacunas da investigação
sprintx|base/<area>.md|-|L4|base da investigação, listada no índice
sprintx|base/00-INDICE.md|base_indice|D4:indice-consistente|índice da base
sprintx|00-BLOQUEIOS.md|bloqueios|D4:bloqueios-vazio|registro de bloqueios
sprintx|docs/sprintx/estimativas/HISTORICO.md|estimativa_historico|D4:historico-so-acrescenta|histórico quantitativo global de estimativas
runx|00-OCORRENCIA.md|ocorrencia|L4|relato e tipo da ocorrência
runx|01-CAUSA-RAIZ.md|causa_raiz|L4|causa raiz, hipóteses e decisões
runx|ORQUESTRADOR.md|orquestrador|L4|objetivo, mapa e rota da ocorrência
runx|QA.md|qa|L4|veredito e roteiro do QA
runx|sprint-NN/tasks.md|tasks,plano|L4|plano: tasks, testes e critérios de aceite
runx|sprint-NN/sprint.md|sprint|L4|plano: objetivo e critério de saída da sprint
runx|sprint-NN/fases.md|fases|L4|plano: fases e critérios de saída
runx|base/00-LACUNAS.md|-|L4|lacunas da investigação
runx|base/<area>.md|-|L4|base da investigação, listada no índice
runx|base/00-INDICE.md|base_indice|D4:indice-consistente|índice da base
runx|BLOQUEIOS.md|bloqueios|D4:bloqueios-vazio|registro de bloqueios
mergex|docs/entregas/<trabalho_id>/ENTREGA.md|entrega|D4|registro da entrega, gravado pela própria mergex
mergex|docs/entregas/<trabalho_id>/PR.md|-|D4|descrição do PR, regravada pelo E4 desta entrega
mergex|docs/entregas/<trabalho_id>/QA-PACOTE.md|-|D4|pacote de QA, regravado pelo E5 desta entrega
mergex|docs/entregas/<trabalho_id>/ATENCAO.md|-|D4|classificação, regravada pelo E3 desta entrega'

BASE_REF=""
RAIZ=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --ordem)    printf '%s\n' "$ORDEM"; exit 0 ;;
    --catalogo) printf '%s\n' "$CATALOGO"; exit 0 ;;
    --base)     BASE_REF="${2:-}"; shift 2 ;;
    --raiz)     RAIZ="${2:-}"; shift 2 ;;
    *) printf 'classificar-atencao: opção desconhecida: %s\n' "$1" >&2; exit 64 ;;
  esac
done

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_SH="$DIR/../../../hooks/comum/base.sh"

# Sem a biblioteca comum não há como resolver o trabalho corrente pela branch:
# nada é reconhecido, e a ordem continua valendo. Falha para o lado conservador.
TEM_BASE=0
if [ -r "$BASE_SH" ]; then
  # shellcheck source=../../../hooks/comum/base.sh
  . "$BASE_SH"
  set +e
  TEM_BASE=1
fi

if [ -z "$RAIZ" ]; then
  RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || RAIZ="$PWD"
  [ -n "$RAIZ" ] || RAIZ="$PWD"
fi

# ---------------------------------------------------------------------------
# Contexto do trabalho corrente — calculado uma vez
# ---------------------------------------------------------------------------
TRABALHO=""; ORIGEM=""; PASTA=""; BRANCH=""; CONTEXTO_MOTIVO=""

fm() { expx_frontmatter_valor "$1" "$2"; }

resolve_contexto() {
  [ "$TEM_BASE" = 1 ] || { CONTEXTO_MOTIVO="biblioteca comum dos hooks indisponível"; return 1; }

  BRANCH="$(git -C "$RAIZ" branch --show-current 2>/dev/null)" || BRANCH=""
  TRABALHO="$(expx_trabalho_atual_por_branch "$RAIZ")" || TRABALHO=""
  if [ -z "$TRABALHO" ]; then
    CONTEXTO_MOTIVO="trabalho corrente não determinado pela branch"
    return 1
  fi
  case "$TRABALHO" in
    *[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto)
      CONTEXTO_MOTIVO="trabalho_id '$TRABALHO' não é um identificador de trabalho válido"
      TRABALHO=""; return 1 ;;
  esac

  local s="docs/sprintx/features/$TRABALHO" r="docs/manutencao/$TRABALHO" l="docs/$TRABALHO"
  if [ -d "$RAIZ/$s" ] && [ -d "$RAIZ/$r" ]; then
    CONTEXTO_MOTIVO="trabalho '$TRABALHO' tem pasta na sprintx e na runx"
    return 1
  elif [ -d "$RAIZ/$s" ]; then PASTA="$s"; ORIGEM=sprintx
  elif [ -d "$RAIZ/$r" ]; then PASTA="$r"; ORIGEM=runx
  elif [ -d "$RAIZ/$l" ]; then PASTA="$l"; ORIGEM=sprintx   # sprintx, formato antigo
  else
    CONTEXTO_MOTIVO="pasta do trabalho '$TRABALHO' não encontrada"
    return 1
  fi

  local orq="$RAIZ/$PASTA/ORQUESTRADOR.md"
  if [ "$(fm "$orq" kind)" != "orquestrador" ] || [ "$(fm "$orq" trabalho_id)" != "$TRABALHO" ]; then
    CONTEXTO_MOTIVO="$PASTA/ORQUESTRADOR.md ausente ou não é deste trabalho"
    PASTA=""; ORIGEM=""; return 1
  fi

  local tool
  tool="$(fm "$RAIZ/docs/entregas/$TRABALHO/ENTREGA.md" expx_tool)"
  if [ "$tool" != "$ORIGEM" ]; then
    CONTEXTO_MOTIVO="origem pela pasta ($ORIGEM) diverge do expx_tool do ENTREGA.md (${tool:-vazio})"
    PASTA=""; ORIGEM=""; return 1
  fi
  return 0
}

CONTEXTO_OK=0
resolve_contexto && CONTEXTO_OK=1

# ---------------------------------------------------------------------------
# Provas mecânicas do D4
# ---------------------------------------------------------------------------
PROVA_MOTIVO=""

prova_bloqueios_vazio() {
  local arq="$RAIZ/$1"
  if [ "$(fm "$arq" bloqueios)" != "[]" ]; then
    PROVA_MOTIVO="a lista de bloqueios não está vazia"; return 1
  fi
  if grep -Eq 'B-[0-9]+' "$arq" 2>/dev/null; then
    PROVA_MOTIVO="o arquivo cita bloqueio (B-NN)"; return 1
  fi
  PROVA_MOTIVO="bloqueios: [] e nenhum B-NN no arquivo"
  return 0
}

areas_do_indice() {
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

prova_indice_consistente() {
  local arq="$RAIZ/$1" dir area n=0
  dir="$(dirname "$arq")"
  while IFS= read -r area; do
    [ -n "$area" ] || continue
    case "$area" in
      */*|*..*|00-INDICE.md|00-LACUNAS.md) PROVA_MOTIVO="o índice lista caminho fora da forma '<area>.md': $area"; return 1 ;;
      *.md) ;;
      *) PROVA_MOTIVO="o índice lista arquivo que não é .md: $area"; return 1 ;;
    esac
    [ -f "$dir/$area" ] || { PROVA_MOTIVO="o índice lista arquivo inexistente: $area"; return 1; }
    n=$((n+1))
  done <<EOF
$(areas_do_indice "$arq")
EOF
  PROVA_MOTIVO="as $n área(s) listadas existem na base"
  return 0
}

prova_historico_so_acrescenta() {
  local caminho="$1" arq="$RAIZ/$1" diff linha valor
  if [ -z "$BASE_REF" ]; then
    PROVA_MOTIVO="sem --base, não há como provar que só acrescenta"; return 1
  fi
  if ! git -C "$RAIZ" rev-parse --verify --quiet "$BASE_REF^{commit}" >/dev/null 2>&1; then
    PROVA_MOTIVO="base '$BASE_REF' não existe"; return 1
  fi
  if git -C "$RAIZ" cat-file -e "$BASE_REF:$caminho" 2>/dev/null; then
    # Base contra a árvore de trabalho: pega o que já foi commitado e o que ainda está sujo.
    diff="$(git -C "$RAIZ" diff -U0 --no-color --no-ext-diff "$BASE_REF" -- "$caminho" 2>/dev/null)" || {
      PROVA_MOTIVO="diff contra a base falhou"; return 1; }
    diff="$(printf '%s\n' "$diff" | grep -v -e '^+++ ' -e '^--- ' -e '^@@' -e '^diff ' -e '^index ' -e '^new file' -e '^\\')"
  else
    # Não existe na base: o arquivo inteiro é acréscimo.
    diff="$(sed 's/^/+/' "$arq" 2>/dev/null)"
  fi
  diff="$(printf '%s\n' "$diff" | tr -d '\r')"

  while IFS= read -r linha; do
    case "$linha" in
      '') continue ;;
      -atualizado_em:*) continue ;;
      -*) PROVA_MOTIVO="remove ou reescreve linha existente: ${linha#-}"; return 1 ;;
      +) continue ;;
      +atualizado_em:*) continue ;;
      '+ '*|'+	'*)
        # Linha indentada do frontmatter: entrada nova. trabalho_id tem que ser este.
        case "$linha" in
          *trabalho_id:*)
            valor="${linha#*trabalho_id:}"; valor="$(printf '%s' "$valor" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
            [ "$valor" = "$TRABALHO" ] || { PROVA_MOTIVO="acrescenta entrada de outro trabalho: $valor"; return 1; } ;;
        esac ;;
      '+|'*)
        valor="$(printf '%s' "${linha#+|}" | awk -F'|' '{ gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1 }')"
        [ "$valor" = "$TRABALHO" ] || { PROVA_MOTIVO="acrescenta linha de tabela que não é deste trabalho: ${linha#+}"; return 1; } ;;
      *) PROVA_MOTIVO="acrescenta prosa ou estrutura, não só entradas: ${linha#+}"; return 1 ;;
    esac
  done <<EOF
$diff
EOF
  PROVA_MOTIVO="só acrescenta entradas de $TRABALHO; nenhuma linha existente removida"
  return 0
}

# ---------------------------------------------------------------------------
# Reconhecimento
# ---------------------------------------------------------------------------
REC_CRITERIO=""; REC_MOTIVO=""

nao_reconhecido() { REC_CRITERIO=""; REC_MOTIVO="artefato de método não reconhecido: $1"; }

linha_do_catalogo() {
  # <origem> <chave> — a linha do catálogo, ou nada.
  printf '%s\n' "$CATALOGO" | awk -F'|' -v o="$1" -v c="$2" '$1 == o && $2 == c { print; exit }'
}

reconhece() {
  local caminho="$1" arq chave origem_linha linha kind_esperado criterio funcao kind_real rel dir nome modo

  case "$caminho" in
    /*|*\\*|./*|*/./*|*..*|'') nao_reconhecido "caminho fora da forma canônica"; return ;;
  esac
  [ "$CONTEXTO_OK" = 1 ] || { nao_reconhecido "$CONTEXTO_MOTIVO"; return; }

  arq="$RAIZ/$caminho"
  if [ -L "$arq" ] || [ ! -f "$arq" ]; then
    nao_reconhecido "não é arquivo regular na árvore"; return
  fi
  modo="$(git -C "$RAIZ" ls-files -s -- "$caminho" 2>/dev/null | awk 'NR == 1 { print $1 }')"
  case "$modo" in
    100755|120000) nao_reconhecido "o versionador registra o arquivo como executável ou link"; return ;;
  esac

  origem_linha="$ORIGEM"
  case "$caminho" in
    "docs/entregas/$TRABALHO/"*)
      nome="${caminho#docs/entregas/$TRABALHO/}"
      case "$nome" in */*) nao_reconhecido "fora do catálogo"; return ;; esac
      chave="docs/entregas/<trabalho_id>/$nome"; origem_linha=mergex ;;
    docs/sprintx/estimativas/HISTORICO.md)
      chave="$caminho" ;;
    "$PASTA/"*)
      rel="${caminho#$PASTA/}"
      dir="${rel%%/*}"; nome="${rel#*/}"
      if [ "$rel" = "$dir" ]; then
        chave="$rel"
      elif printf '%s' "$dir" | grep -Eq '^sprint-[0-9]{2,}$' && [ "${nome#*/}" = "$nome" ]; then
        chave="sprint-NN/$nome"
      elif [ "$dir" = base ] && [ "${nome#*/}" = "$nome" ]; then
        case "$nome" in
          00-INDICE.md|00-LACUNAS.md) chave="$rel" ;;
          *)
            if ! areas_do_indice "$RAIZ/$PASTA/base/00-INDICE.md" | grep -Fxq "$nome" \
               || [ "$(fm "$RAIZ/$PASTA/base/00-INDICE.md" kind)" != base_indice ] \
               || [ "$(fm "$RAIZ/$PASTA/base/00-INDICE.md" trabalho_id)" != "$TRABALHO" ]; then
              nao_reconhecido "arquivo da base não listado no base/00-INDICE.md deste trabalho"; return
            fi
            chave="base/<area>.md" ;;
        esac
      else
        nao_reconhecido "fora do catálogo"; return
      fi ;;
    *) nao_reconhecido "fora do catálogo"; return ;;
  esac

  linha="$(linha_do_catalogo "$origem_linha" "$chave")"
  [ -n "$linha" ] || { nao_reconhecido "fora do catálogo da $origem_linha"; return; }

  kind_esperado="$(printf '%s' "$linha" | cut -d'|' -f3)"
  criterio="$(printf '%s' "$linha" | cut -d'|' -f4)"
  funcao="$(printf '%s' "$linha" | cut -d'|' -f5)"
  kind_real="$(fm "$arq" kind)"

  if [ "$kind_esperado" = "-" ]; then
    [ -z "$kind_real" ] || { nao_reconhecido "o contrato não define kind para $chave, e o arquivo declara '$kind_real'"; return; }
  else
    case ",$kind_esperado," in
      *",$kind_real,"*) [ -n "$kind_real" ] || { nao_reconhecido "kind ausente; esperado $kind_esperado"; return; } ;;
      *) nao_reconhecido "kind '${kind_real:-ausente}' não confere com $kind_esperado"; return ;;
    esac
    if [ "$chave" = docs/sprintx/estimativas/HISTORICO.md ]; then
      [ "$(fm "$arq" trabalho_id)" = null ] || { nao_reconhecido "HISTORICO global precisa de trabalho_id: null"; return; }
    elif [ "$(fm "$arq" trabalho_id)" != "$TRABALHO" ]; then
      nao_reconhecido "trabalho_id do arquivo não é $TRABALHO"; return
    fi
    if [ "$kind_esperado" = entrega ] && [ "$(fm "$arq" branch)" != "$BRANCH" ]; then
      nao_reconhecido "ENTREGA.md de outra branch"; return
    fi
  fi

  case "$criterio" in
    L4) REC_CRITERIO=L4; REC_MOTIVO="$funcao ($chave, origem $origem_linha)" ;;
    D4) REC_CRITERIO=D4; REC_MOTIVO="$funcao ($chave, origem $origem_linha)" ;;
    D4:*)
      if "prova_$(printf '%s' "${criterio#D4:}" | sed 's/-/_/g')" "$caminho"; then
        REC_CRITERIO=D4; REC_MOTIVO="$funcao ($chave, origem $origem_linha); prova mecânica: $PROVA_MOTIVO"
      else
        REC_CRITERIO=L4; REC_MOTIVO="$funcao ($chave, origem $origem_linha); D4 não provado: $PROVA_MOTIVO"
      fi ;;
    *) nao_reconhecido "linha do catálogo inválida"; return ;;
  esac
}

# ---------------------------------------------------------------------------
# A ordem
# ---------------------------------------------------------------------------
junta() { if [ -n "$1" ]; then printf '%s; %s' "$1" "$2"; else printf '%s' "$2"; fi; }

classifica() {
  local caminho="$1"; shift
  local ev id o="" l="" d="" ignorados=""

  for ev in "$@"; do
    [ -n "$ev" ] || continue
    id="$(printf '%s' "${ev%%:*}" | tr -d '[:space:]')"
    case "$id" in
      O[1-9]) o="$(junta "$o" "$ev")" ;;
      L[1-3]) l="$(junta "$l" "$ev")" ;;
      D[1-3]) d="$(junta "$d" "$ev")" ;;
      *) ignorados="$ignorados $id" ;;   # L4 e D4 só vêm do reconhecedor
    esac
  done

  local nota=""
  [ -z "$ignorados" ] || nota=" [ignorado:$ignorados — L4 e D4 só vêm do reconhecimento]"

  # 1. OLHO OBRIGATÓRIO: critério O vence, inclusive em artefato de método.
  if [ -n "$o" ]; then
    printf '%s\t%s\t%s%s\n' "$caminho" "$FAIXA_OLHO" "$o" "$nota"; return
  fi
  # 2. LEITURA RÁPIDA: L1..L3, depois L4.
  if [ -n "$l" ]; then
    printf '%s\t%s\t%s%s\n' "$caminho" "$FAIXA_LEITURA" "$l" "$nota"; return
  fi
  reconhece "$caminho"
  if [ "$REC_CRITERIO" = L4 ]; then
    printf '%s\t%s\tL4: %s%s\n' "$caminho" "$FAIXA_LEITURA" "$REC_MOTIVO" "$nota"; return
  fi
  # 3. DISPENSÁVEL: D1..D3, depois D4.
  if [ -n "$d" ]; then
    printf '%s\t%s\t%s%s\n' "$caminho" "$FAIXA_DISPENSAVEL" "$d" "$nota"; return
  fi
  if [ "$REC_CRITERIO" = D4 ]; then
    printf '%s\t%s\tD4: %s%s\n' "$caminho" "$FAIXA_DISPENSAVEL" "$REC_MOTIVO" "$nota"; return
  fi
  # 4. Padrão: nenhum critério bateu.
  printf '%s\t%s\tpadrão: nenhum critério bateu (%s)%s\n' "$caminho" "$FAIXA_OLHO" "$REC_MOTIVO" "$nota"
}

while IFS= read -r entrada || [ -n "$entrada" ]; do
  entrada="$(printf '%s' "$entrada" | tr -d '\r')"
  [ -n "$entrada" ] || continue
  set -f
  OLDIFS="$IFS"; IFS='	'
  # shellcheck disable=SC2086
  set -- $entrada
  IFS="$OLDIFS"
  set +f
  classifica "$@"
done
