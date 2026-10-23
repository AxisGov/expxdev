#!/usr/bin/env bash
#
# Fatiamento da PR, no E7 (references/07-abertura-pr.md, Passo 1.5): os limites do
# CodeAnt, fixos (emenda de 2026-10-19 do ExpxDev; contrato `expx-fatiamento` v3):
#   L2  cada arquivo revisavel alterado ou criado tem no maximo 5.000 linhas e 204.800
#       bytes no head, pela conta da CLI (quebras + 1; no blob e no checkout, vale o maior)
#   L3  a PR altera no maximo 100 arquivos, todos contados (como o changed_files do GitHub)
# Sem limite de linhas por PR nem por commit. Nenhum limite nem exclusao vem do ambiente:
# `FATIA_*` definida (mesmo vazia) e saida 2.
#
#   bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh [--planejamento] [--excluir-da-revisao <padrao>]... <base> <head>
#
#   --excluir-da-revisao  pasta literal (`^a/b/`) que fica fora de L2 (nunca de L3); quem
#                         chama a tira do `.expx/fatiamento.json` do commit medido
#   --planejamento        PR de planejamento: todo caminho alterado, inclusive a origem de
#                         renomeacao, fica sob docs/sprintx/, docs/entregas/ ou docs/eventos/,
#                         e L3 nao se aplica
#
# COPIA, nao dependencia: e o `scripts/verificar-fatiamento.sh` do ExpxDev, igual
# byte a byte a partir de `set -uo pipefail`. A skill roda sozinha no projeto, e
# nenhum repositorio de skill depende do expxdev por npm. Mudou la, muda aqui, e o
# sha256 abaixo junto (scripts/ci/test-fatiamento-e7.sh confere; com EXPXDEV_RAIZ,
# compara com o arquivo de la).
# Origem: AxisGov/expxdev 405a134 scripts/verificar-fatiamento.sh
# Corpo-sha256: 165d3495181c45eea605a7cadb10637bbce18c1630b999151a8b42073fddd43d
#
# Saida: 0 sem violacao, 1 com (linhas `VIOLACAO L2|L3|planejamento: ...`), 2 uso,
# `FATIA_*` no ambiente ou medicao impossivel (ref inexistente, sem ancestral comum,
# objeto ausente, `git diff` que falha).

set -uo pipefail

MAX_ARQUIVOS_PR=100
MAX_LINHAS=5000
MAX_BYTES=204800
NOMES_EXCLUIDOS=(package-lock.json yarn.lock pnpm-lock.yaml composer.lock Gemfile.lock Cargo.lock poetry.lock Pipfile.lock go.sum .DS_Store Thumbs.db)
EXTENSOES_EXCLUIDAS=(.png .jpg .jpeg .gif .bmp .ico .svg .webp .avif .woff .woff2 .ttf .eot .otf .exe .dll .so .dylib .bin .o .a .class .pyc .pyo .wasm .jar .war .ear .zip .tar .gz .bz2 .7z .rar .mp3 .mp4 .wav .avi .mov .flv .wmv .ogg .webm .min.js .min.css .map .pb .proto.bin .pdf .doc .docx .xls .xlsx .ppt .pptx .csv .tsv .parquet .avro .ndjson .sqlite .db)
SUFIXOS_EXCLUIDOS=(.min.js .min.css)
EXCLUIDOS_DO_NUCLEO=(docs/sprintx/ docs/entregas/ docs/eventos/)

uso() {
  echo "uso: ${0##*/} [--planejamento] [--excluir-da-revisao <padrao>]... <base> <head>" >&2
  exit 2
}

for nome in $(compgen -e); do
  case "$nome" in
    FATIA_*)
      echo "\`$nome\` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente" >&2
      exit 2
      ;;
  esac
done

# Imprime o prefixo literal de ^a/b/; recusa regex, glob, controle e segmento vazio.
prefixo_de() {
  local padrao="$1" corpo segmento saida="" i c proximo
  [ "${padrao#^}" != "$padrao" ] && [ "${padrao%/}" != "$padrao" ] || return 1
  corpo="${padrao#^}"
  while [ -n "$corpo" ]; do
    segmento="${corpo%%/*}"
    [ -n "$segmento" ] || return 1
    corpo="${corpo#*/}"
    i=0
    while [ "$i" -lt "${#segmento}" ]; do
      c="${segmento:$i:1}"
      case "$c" in
        '\')
          i=$((i + 1)); [ "$i" -lt "${#segmento}" ] || return 1
          proximo="${segmento:$i:1}"; [ "$proximo" = "." ] || return 1
          saida="${saida}."
          ;;
        '.'|'^'|'$'|'|'|'?'|'*'|'+'|'('|')'|'['|']'|'{'|'}') return 1 ;;
        *)
          case "$c" in $'\001'|$'\002'|$'\003'|$'\004'|$'\005'|$'\006'|$'\007'|$'\010'|$'\011'|$'\012'|$'\013'|$'\014'|$'\015'|$'\016'|$'\017'|$'\020'|$'\021'|$'\022'|$'\023'|$'\024'|$'\025'|$'\026'|$'\027'|$'\030'|$'\031'|$'\032'|$'\033'|$'\034'|$'\035'|$'\036'|$'\037'|$'\177') return 1 ;; esac
          saida="${saida}${c}"
          ;;
      esac
      i=$((i + 1))
    done
    saida="${saida}/"
  done
  [ -n "$saida" ] || return 1
  printf '%s\n' "$saida"
}

EXCLUIDOS_PROJETO=()
planejamento=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --planejamento) planejamento=1; shift ;;
    --excluir-da-revisao)
      [ "$#" -ge 2 ] || uso
      prefixo="$(prefixo_de "$2")" || { echo "--excluir-da-revisao: padrão fora da gramática: $2" >&2; exit 2; }
      EXCLUIDOS_PROJETO+=("$prefixo")
      shift 2
      ;;
    *) break ;;
  esac
done
[ "$#" -eq 2 ] || uso
base="$1"; head="$2"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "base inexistente: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head^{commit}" >/dev/null || { echo "head inexistente: $head" >&2; exit 2; }
mb="$(git merge-base "$base" "$head")" || { echo "sem ancestral comum entre $base e $head" >&2; exit 2; }

lista_todos=""; lista_l2=""; conteudo=""; decodificado=""
trap 'rm -f ${lista_todos:+"$lista_todos"} ${lista_l2:+"$lista_l2"} ${conteudo:+"$conteudo"} ${decodificado:+"$decodificado"}' EXIT
lista_todos="$(mktemp)" && lista_l2="$(mktemp)" && conteudo="$(mktemp)" && decodificado="$(mktemp)" \
  || { echo "sem arquivo temporario" >&2; exit 2; }

git -c core.quotepath=off diff --name-only -z -M "$mb" "$head" > "$lista_todos" \
  || { echo "nao foi possivel listar os arquivos de $mb..$head" >&2; exit 2; }
total=0
while IFS= read -r -d '' _; do total=$((total + 1)); done < "$lista_todos"

violacoes=0
if [ "$planejamento" -eq 1 ]; then
  git -c core.quotepath=off diff --name-only -z --no-renames "$mb" "$head" > "$lista_l2" \
    || { echo "nao foi possivel listar os caminhos de $mb..$head" >&2; exit 2; }
  while IFS= read -r -d '' caminho; do
    case "$caminho" in
      docs/sprintx/*|docs/entregas/*|docs/eventos/*) ;;
      *)
        printf 'VIOLACAO planejamento: %s fora de docs/sprintx/, docs/entregas/ e docs/eventos/; o PR de planejamento so leva artefatos de metodo\n' "$caminho"
        violacoes=$((violacoes + 1))
        ;;
    esac
  done < "$lista_l2"
elif [ "$total" -gt "$MAX_ARQUIVOS_PR" ]; then
  printf 'VIOLACAO L3: a PR altera %d arquivos, todos contados (limite %d do app do CodeAnt); divida a PR\n' "$total" "$MAX_ARQUIVOS_PR"
  violacoes=$((violacoes + 1))
fi

git -c core.quotepath=off diff --name-status -z -M --diff-filter=AMRT "$mb" "$head" > "$lista_l2" \
  || { echo "nao foi possivel listar os arquivos revisaveis de $mb..$head" >&2; exit 2; }

prefixo_excluido() {
  local caminho="$1" p
  for p in "${EXCLUIDOS_DO_NUCLEO[@]}" "${EXCLUIDOS_PROJETO[@]}"; do
    case "$caminho" in "$p"*) return 0 ;; esac
  done
  return 1
}

revisavel() {
  local caminho="$1" nome ext prefixo item
  nome="${caminho##*/}"
  for item in "${NOMES_EXCLUIDOS[@]}"; do [ "$nome" = "$item" ] && return 1; done
  ext=""
  case "$nome" in
    *.*)
      prefixo="${nome%.*}"
      if [ -n "$prefixo" ]; then ext=".${nome##*.}"; fi
      ;;
  esac
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')" || return 2
  for item in "${EXTENSOES_EXCLUIDAS[@]}"; do [ "$ext" = "$item" ] && return 1; done
  for item in "${SUFIXOS_EXCLUIDOS[@]}"; do case "$nome" in *"$item") return 1 ;; esac; done
  return 0
}

# Escreve "linhas bytes" com a mesma decodificacao UTF-8 da CLI.
medir_arquivo() {
  local arquivo="$1" bytes linhas
  command -v iconv >/dev/null 2>&1 || { echo "iconv ausente: nao foi possivel medir $novo" >&2; return 2; }
  if iconv -f UTF-8 -t UTF-8 < "$arquivo" > "$decodificado" 2>/dev/null; then
    bytes="$(wc -c < "$decodificado")" || return 2
    linhas="$(wc -l < "$decodificado")" || return 2
    printf '%d %d\n' "$((linhas + 1))" "$bytes"
  else
    command -v node >/dev/null 2>&1 || { echo "node ausente: UTF-8 invalido em $novo nao pode ser medido como a CLI" >&2; return 2; }
    node -e 'const fs=require("node:fs"),t=fs.readFileSync(0).toString("utf8"); process.stdout.write(`${t.split("\n").length} ${Buffer.byteLength(t,"utf8")}\n`)' < "$arquivo" \
      || { echo "node falhou ao medir UTF-8 invalido em $novo" >&2; return 2; }
  fi
}

while IFS= read -r -d '' estado; do
  antigo=""; novo=""
  IFS= read -r -d '' antigo || { echo "lista de arquivos truncada" >&2; exit 2; }
  case "$estado" in
    R*|C*) IFS= read -r -d '' novo || { echo "renomeacao truncada" >&2; exit 2; } ;;
    *) novo="$antigo" ;;
  esac
  prefixo_excluido "$novo" && continue
  revisavel "$novo"; rev=$?
  [ "$rev" -eq 1 ] && continue
  [ "$rev" -eq 0 ] || { echo "nao foi possivel classificar $novo" >&2; exit 2; }

  arvore="$(git --literal-pathspecs -c core.quotepath=off ls-tree "$head" -- "$novo")" \
    || { echo "nao foi possivel consultar $novo no head" >&2; exit 2; }
  modo="${arvore%% *}"
  [ "$modo" = "160000" ] && continue
  [ -n "$arvore" ] || { echo "nao foi possivel localizar $novo no head" >&2; exit 2; }
  resto="${arvore#* }"; resto="${resto#* }"; oid="${resto%%$'\t'*}"
  git cat-file blob "$oid" > "$conteudo" 2>/dev/null \
    || { echo "nao foi possivel medir $novo no head" >&2; exit 2; }
  medida="$(medir_arquivo "$conteudo")" || exit 2
  read -r linhas bytes <<< "$medida"

  if [ -f "$novo" ] && [ ! -L "$novo" ]; then
    oid_checkout="$(git hash-object -- "$novo" 2>/dev/null)" || { echo "nao foi possivel identificar $novo no checkout" >&2; exit 2; }
    if [ "$oid_checkout" = "$oid" ]; then
      medida="$(medir_arquivo "$novo")" || exit 2
      read -r linhas_checkout bytes_checkout <<< "$medida"
      [ "$linhas_checkout" -gt "$linhas" ] && linhas="$linhas_checkout"
      [ "$bytes_checkout" -gt "$bytes" ] && bytes="$bytes_checkout"
    fi
  fi

  if [ "$linhas" -gt "$MAX_LINHAS" ] || [ "$bytes" -gt "$MAX_BYTES" ]; then
    printf 'VIOLACAO L2: %s tem %d linhas e %d bytes pela conta da CLI (limite %d linhas e %d bytes); uma task anterior o divide\n' \
      "$novo" "$linhas" "$bytes" "$MAX_LINHAS" "$MAX_BYTES"
    violacoes=$((violacoes + 1))
  fi
done < "$lista_l2"

if [ "$planejamento" -eq 1 ]; then
  printf 'fatiamento: %d violacao(oes); PR de planejamento com %d arquivo(s)\n' "$violacoes" "$total"
else
  printf 'fatiamento: %d violacao(oes); PR com %d arquivo(s)\n' "$violacoes" "$total"
fi
[ "$violacoes" -eq 0 ]
