#!/usr/bin/env bash
#
# Fatiamento da PR, no E7 (references/07-abertura-pr.md, Passo 1.5): F2, F3 e F4
# do contrato `expx-fatiamento` do ExpxDev (docs/contrato/CONTRATO-expx-fatiamento.md).
#
#   bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh <base> <head>
#
# COPIA, nao dependencia: e o `scripts/verificar-fatiamento.sh` do ExpxDev, igual
# depois deste cabecalho. A skill roda sozinha no projeto, e nenhum repositorio
# de skill depende do expxdev por npm. Mudou la, muda aqui.
#
# Compara <base>...<head> e falha, com a lista de violações, em F2 (PR: linhas e
# arquivos), F3 (linhas por commit) e F4 (tamanho de arquivo, em KB e em linhas;
# acima do limite o arquivo não cresce, com tolerância POR PR). Os limites e as
# exceções (FATIA_*) estão no contrato. Saída: 0 sem violação, 1 com, 2 uso ou
# medição impossível (ref inexistente, sem ancestral comum, `git diff` que falha).

set -uo pipefail

if [ "$#" -ne 2 ]; then
  echo "uso: ${0##*/} <base> <head>" >&2
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

# os limites em KB são comparados em BYTES: dividir por 1024 truncaria, e um
# arquivo um byte acima de 150 KiB passaria por 150
max_b=$((max_kb * 1024))
aviso_b=$((aviso_kb * 1024))

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

# KiB com arredondamento para cima, só para exibir
kib() { echo $((($1 + 1023) / 1024)); }

# linhas alteradas e arquivos de um diff, sem os gerados. O numstat vem com -z: o
# caminho e um campo terminado por NUL, entao espaco, `=>` ou quebra no nome nao o
# confundem. Na renomeacao o campo do caminho vem vazio e seguem origem e destino;
# o FATIA_IGNORAR vale para o DESTINO, como no F4 — sem isto, um arquivo tirado de
# fixtures/candidatos/ para um caminho revisado ficaria fora da conta. A saida do
# git vai para um arquivo, nao para um pipe: um diff que falha tem de falhar aqui.
soma() { # <argumentos do git diff>
  soma_de git -c core.quotepath=off diff --numstat -z -M "$@"
}
# soma_de <comando que imprime numstat -z> — a mesma conta para qualquer fonte de numstat
soma_de() {
  local t a d p linhas=0 n=0
  t="$(mktemp)" || return 1
  "$@" > "$t" || { rm -f "$t"; return 1; }
  while IFS=$'\t' read -r -d '' a d p; do
    [ -n "$p" ] || { read -r -d '' p; read -r -d '' p; }
    [[ $p =~ $ignorar ]] && continue
    [ "$a" = - ] || linhas=$((linhas + a + d))
    n=$((n + 1))
  done < "$t"
  rm -f "$t"
  printf '%d %d\n' "$linhas" "$n"
}

# a medida vai para uma variavel, nunca direto num `read < <(...)`: a substituicao
# de processo esconde a saida do `git diff`, e um diff que falha (objeto ausente)
# imprimiria `0 0` e passaria por PR limpo. Nao mediu e saida 2, nunca 0.
mede() { # <rotulo> <argumentos do git diff>
  local r="$1"; shift
  soma "$@" || { echo "nao foi possivel medir $r (git diff falhou)" >&2; exit 2; }
}

# F2 — a PR inteira
med="$(mede "a PR $mb..$head" "$mb" "$head")" || exit 2
read -r linhas_pr arquivos_pr <<< "$med"
[ "$linhas_pr" -le "$max_linhas_pr" ] \
  || viola_ou_avisa "F2: a PR altera $linhas_pr linhas (limite $max_linhas_pr); divida por assunto"
[ "$arquivos_pr" -le "$max_arquivos" ] \
  || viola_ou_avisa "F2: a PR altera $arquivos_pr arquivos (limite $max_arquivos); divida por assunto"

# As listas que os lacos percorrem vao para arquivo, nunca para `< <(...)`: a
# substituicao de processo esconde a falha, e um laco sobre lista vazia nao confere nada.
lista_c="$(mktemp)" && lista_f="$(mktemp)" || { echo "sem arquivo temporario" >&2; exit 2; }
trap 'rm -f "$lista_c" "$lista_f"' EXIT

# F3 — cada commit (merges ficam de fora: o conteúdo deles é o dos pais). Commit
# sem pai (raiz de historia trazida por merge) mede contra a arvore vazia. Na
# fronteira de um clone raso o commit tambem parece sem pai, mas nao e raiz: ali
# nao ha medida, e conta-lo inteiro daria uma violacao falsa.
git rev-list --no-merges "$mb..$head" > "$lista_c" \
  || { echo "nao foi possivel listar os commits de $mb..$head" >&2; exit 2; }
vazia="$(git hash-object -t tree /dev/null)"
raso="${GIT_SHALLOW_FILE:-$(git rev-parse --git-path shallow)}"
while IFS= read -r c; do
  if git rev-parse -q --verify "$c^" >/dev/null; then pai="$c^"
  elif [ -f "$raso" ] && grep -qx "$c" "$raso"; then
    echo "o commit $c esta na fronteira de um clone raso: sem o pai nao ha medida; aprofunde o clone (git fetch --unshallow)" >&2; exit 2
  else pai="$vazia"; fi
  med="$(mede "o commit $c" "$pai" "$c")" || exit 2
  read -r l _ <<< "$med"
  if [ "$l" -gt "$max_linhas_commit" ]; then
    viola_ou_avisa "F3: o commit $(git rev-parse --short "$c") altera $l linhas (limite $max_linhas_commit): $(git log -1 --format=%s "$c" | cut -c1-70)"
  fi
done < "$lista_c"

# F3 nos merges: o conteudo deles e o dos pais, MENOS a resolucao — linhas que nao
# estao em nenhum pai. `--remerge-diff` mostra so isso (a diferenca entre a mescla
# automatica e o merge gravado). Merge que nao se mede sai 2, como toda medida
# impossivel aqui — inclusive no git anterior a 2.36, que nao tem a opcao.
git rev-list --merges "$mb..$head" > "$lista_c" \
  || { echo "nao foi possivel listar os merges de $mb..$head" >&2; exit 2; }
while IFS= read -r c; do
  med="$(soma_de git -c core.quotepath=off show --remerge-diff --format= --numstat -z "$c")" \
    || { echo "nao foi possivel medir o merge $c (git show --remerge-diff falhou; exige git 2.36 ou mais novo)" >&2; exit 2; }
  read -r l _ <<< "$med"
  if [ "$l" -gt "$max_linhas_commit" ]; then
    viola_ou_avisa "F3: o merge $(git rev-parse --short "$c") resolve $l linhas proprias (limite $max_linhas_commit): $(git log -1 --format=%s "$c" | cut -c1-70)"
  fi
done < "$lista_c"

# F4 — tamanho de arquivo de texto no head. Acima do limite, o crescimento é
# SOMADO sobre a PR inteira e comparado com a tolerância uma vez. `T` (mudança de
# tipo: link virou arquivo) entra: o arquivo de texto que sai dali e revisado igual.
# Com -z, como no `soma`: cada campo termina em NUL, e um nome com quebra de linha
# chega inteiro, nunca escapado entre aspas (que nao e caminho nenhum).
git -c core.quotepath=off diff --name-status -z -M --diff-filter=AMRT "$mb" "$head" > "$lista_f" \
  || { echo "nao foi possivel listar os arquivos de $mb..$head" >&2; exit 2; }
cresc_b=0; cresc_l=0
acima=()
while IFS= read -r -d '' st; do
  a=""; b=""
  IFS= read -r -d '' a
  case "$st" in R*|C*) IFS= read -r -d '' b ;; esac
  [ -n "$st" ] || continue
  novo="${b:-$a}"
  # renomeação: o arquivo no ancestral tem o caminho ANTIGO; sem isto, um
  # arquivo grande só movido pareceria ter crescido do zero ao tamanho inteiro
  antigo="$a"
  # gerado (FATIA_IGNORAR) nao e revisado: fica fora de F4 tambem (contrato, F6)
  [[ $novo =~ $ignorar ]] && continue
  # submodulo (gitlink, 160000) nao e arquivo: o objeto dele nem esta neste repositorio
  case "$(git ls-tree "$head" -- "$novo")" in 160000\ *) continue ;; esac
  tipo="$(git -c core.quotepath=off diff --numstat "$mb" "$head" -- "$novo" | awk -F'\t' 'NR == 1 { print $1 }')"
  [ "$tipo" = "-" ] && continue   # binário: não é revisado como texto
  # o arquivo existe no head (A/M/R): sem ler o tamanho dele nao ha medida, e um 0
  # passaria por arquivo pequeno. No ancestral ele pode nao existir (A): ali, 0.
  tam_head="$(git cat-file -s "$head:$novo" 2>/dev/null)" \
    && lin_head="$(git cat-file -p "$head:$novo" 2>/dev/null | awk 'END { print NR }')" \
    || { echo "nao foi possivel medir $novo no head" >&2; exit 2; }
  tam_base="$(git cat-file -s "$mb:$antigo" 2>/dev/null || echo 0)"
  lin_base="$(git cat-file -p "$mb:$antigo" 2>/dev/null | awk 'END { print NR }')"

  # linhas por `awk NR`, nao `wc -l`: o wc conta quebras, e a ultima linha sem
  # quebra ficaria de fora. O `codeant review` documenta 5.000 linhas por arquivo e o scan de agente
  # filtra acima disso: o limite em linhas aqui tem folga (4.000)
  if [ "$tam_head" -gt "$max_b" ] || [ "$lin_head" -gt "$max_linhas_arq" ]; then
    acima+=("$novo")
    [ "$tam_head" -gt "$tam_base" ] && cresc_b=$((cresc_b + tam_head - tam_base))
    [ "$lin_head" -gt "$lin_base" ] && cresc_l=$((cresc_l + lin_head - lin_base))
    avisa "F4: $novo tem $(kib "$tam_head") KB e $lin_head linhas, acima do limite ($max_kb KB / $max_linhas_arq linhas); precisa ser dividido"
  elif [ "$tam_head" -gt "$aviso_b" ] || [ "$lin_head" -gt "$aviso_linhas_arq" ]; then
    avisa "F4: $novo tem $(kib "$tam_head") KB e $lin_head linhas, perto do limite ($max_kb KB / $max_linhas_arq linhas)"
  fi
done < "$lista_f"

if [ "$cresc_b" -gt "$tolerancia_b" ] || [ "$cresc_l" -gt "$tolerancia_l" ]; then
  viola "F4: os arquivos acima do limite cresceram $cresc_b bytes e $cresc_l linhas no total (tolerancia da PR: $tolerancia_b bytes, $tolerancia_l linhas): ${acima[*]}; arquivo acima do limite so diminui ou e dividido"
fi

printf 'fatiamento: %d violacao(oes), %d aviso(s); PR com %d linhas em %d arquivo(s)\n' \
  "$violacoes" "$avisos" "$linhas_pr" "$arquivos_pr"
[ "$violacoes" -eq 0 ]
