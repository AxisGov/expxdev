#!/usr/bin/env bash
#
# Confere o fatiamento de uma mudança (docs/contrato/CONTRATO-expx-fatiamento.md).
#
#   bash scripts/verificar-fatiamento.sh <base> <head>
#
# Compara <base>..<head> (a base é o ponto de partida da PR) e falha, com a lista
# de violações, quando:
#   F2  a PR passa de FATIA_MAX_LINHAS_PR linhas alteradas ou de FATIA_MAX_ARQUIVOS arquivos;
#   F3  um commit passa de FATIA_MAX_LINHAS_COMMIT linhas alteradas;
#   F4  um arquivo de texto passa de FATIA_MAX_KB_ARQUIVO KB ou de FATIA_MAX_LINHAS_ARQUIVO
#       linhas, ou cresce estando acima de um dos dois.
# Entre FATIA_AVISO_KB e o limite, F4 só avisa. Acima do limite o arquivo não cresce,
# com tolerância de FATIA_TOLERANCIA_B bytes por PR para a edição inevitável (uma
# linha de tabela); passou disso, a PR divide o arquivo ou não mexe nele.
#
# Arquivos gerados (FATIA_IGNORAR, uma regex de caminho) não contam para F2 e F3:
# a regra é sobre o que uma pessoa precisa revisar. Eles continuam sujeitos a F4.
#
# Exceção declarada: FATIA_EXCECAO=<motivo> transforma as violações de F2 e F3 em
# aviso e imprime o motivo. Existe para o movimento mecânico (F6); F4 não tem exceção.
#
# Saída: 0 sem violação; 1 com violação; 2 uso incorreto.

set -uo pipefail

if [ "$#" -ne 2 ]; then
  echo "uso: verificar-fatiamento.sh <base> <head>" >&2
  exit 2
fi
base="$1"; head="$2"

max_linhas_pr="${FATIA_MAX_LINHAS_PR:-400}"
max_arquivos="${FATIA_MAX_ARQUIVOS:-20}"
max_linhas_commit="${FATIA_MAX_LINHAS_COMMIT:-300}"
max_kb="${FATIA_MAX_KB_ARQUIVO:-150}"
aviso_kb="${FATIA_AVISO_KB:-100}"
tolerancia_b="${FATIA_TOLERANCIA_B:-2048}"
max_linhas_arq="${FATIA_MAX_LINHAS_ARQUIVO:-4000}"
aviso_linhas_arq="${FATIA_AVISO_LINHAS:-3000}"
tolerancia_l="${FATIA_TOLERANCIA_LINHAS:-20}"
ignorar="${FATIA_IGNORAR:-(^|/)(package-lock\.json|fixtures/candidatos/)}"
excecao="${FATIA_EXCECAO:-}"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "base inexistente: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head^{commit}" >/dev/null || { echo "head inexistente: $head" >&2; exit 2; }

mb="$(git merge-base "$base" "$head")" || { echo "sem ancestral comum entre $base e $head" >&2; exit 2; }

violacoes=0
avisos=0
viola() { violacoes=$((violacoes + 1)); printf 'VIOLACAO %s\n' "$1"; }
avisa() { avisos=$((avisos + 1)); printf 'aviso    %s\n' "$1"; }
# F2 e F3 viram aviso quando há exceção declarada; F4 nunca.
viola_ou_avisa() {
  if [ -n "$excecao" ]; then avisa "$1 [excecao declarada: $excecao]"; else viola "$1"; fi
}

# linhas alteradas e arquivos de um diff, sem os gerados
soma() { # <argumentos do git diff>
  git diff --numstat -M "$@" | IGN="$ignorar" awk '
    $1 == "-" { l = 0 } $1 != "-" { l = $1 + $2 }
    { arq = $NF; if (arq ~ ENVIRON["IGN"]) next; linhas += l; n++ }
    END { printf "%d %d\n", linhas + 0, n + 0 }'
}

# F2 — a PR inteira
read -r linhas_pr arquivos_pr < <(soma "$mb" "$head")
[ "$linhas_pr" -le "$max_linhas_pr" ] \
  || viola_ou_avisa "F2: a PR altera $linhas_pr linhas (limite $max_linhas_pr); divida por assunto"
[ "$arquivos_pr" -le "$max_arquivos" ] \
  || viola_ou_avisa "F2: a PR altera $arquivos_pr arquivos (limite $max_arquivos); divida por assunto"

# F3 — cada commit (merges ficam de fora: o conteúdo deles é o dos pais)
while IFS= read -r c; do
  read -r l _ < <(soma "$c^" "$c" 2>/dev/null || echo "0 0")
  if [ "$l" -gt "$max_linhas_commit" ]; then
    viola_ou_avisa "F3: o commit $(git rev-parse --short "$c") altera $l linhas (limite $max_linhas_commit): $(git log -1 --format=%s "$c" | cut -c1-70)"
  fi
done < <(git rev-list --no-merges "$mb..$head")

# F4 — tamanho de arquivo de texto no head, e crescimento acima do limite
while IFS= read -r arq; do
  [ -n "$arq" ] || continue
  tam_head="$(git cat-file -s "$head:$arq" 2>/dev/null || echo 0)"
  tipo="$(git diff --numstat "$mb" "$head" -- "$arq" | awk '{print $1}')"
  [ "$tipo" = "-" ] && continue   # binário: não é revisado como texto
  kb_head=$((tam_head / 1024))
  tam_base="$(git cat-file -s "$mb:$arq" 2>/dev/null || echo 0)"
  if [ "$kb_head" -gt "$max_kb" ]; then
    if [ $((tam_head - tam_base)) -gt "$tolerancia_b" ]; then
      viola "F4: $arq tem ${kb_head} KB (limite $max_kb) e cresceu $((tam_head - tam_base)) bytes (tolerancia $tolerancia_b); arquivo acima do limite so diminui ou e dividido"
    else
      avisa "F4: $arq tem ${kb_head} KB, acima do limite $max_kb; cresceu no maximo a tolerancia, mas precisa ser dividido"
    fi
  elif [ "$kb_head" -gt "$aviso_kb" ]; then
    avisa "F4: $arq tem ${kb_head} KB, perto do limite $max_kb"
  fi
  # linhas: o `codeant review` documenta 5.000 por arquivo, e a API de scan filtra
  # arquivo acima disso; o limite aqui tem folga (4.000)
  lin_head="$(git cat-file -p "$head:$arq" 2>/dev/null | wc -l | tr -d ' ')"
  lin_base="$(git cat-file -p "$mb:$arq" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$lin_head" -gt "$max_linhas_arq" ]; then
    if [ $((lin_head - lin_base)) -gt "$tolerancia_l" ]; then
      viola "F4: $arq tem $lin_head linhas (limite $max_linhas_arq) e cresceu $((lin_head - lin_base)) (tolerancia $tolerancia_l); arquivo acima do limite so diminui ou e dividido"
    else
      avisa "F4: $arq tem $lin_head linhas, acima do limite $max_linhas_arq; precisa ser dividido"
    fi
  elif [ "$lin_head" -gt "$aviso_linhas_arq" ]; then
    avisa "F4: $arq tem $lin_head linhas, perto do limite $max_linhas_arq"
  fi
done < <(git diff --name-only --diff-filter=AMR "$mb" "$head")

printf 'fatiamento: %d violacao(oes), %d aviso(s); PR com %d linhas em %d arquivo(s)\n' \
  "$violacoes" "$avisos" "$linhas_pr" "$arquivos_pr"
[ "$violacoes" -eq 0 ]
