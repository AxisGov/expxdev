#!/usr/bin/env bash
#
# Testes de conformidade da CLI do CodeAnt nas bordas (emenda de 2026-10-19,
# seções 6 e 11, passo 0). Precisa da CLI `codeant` 0.5.14 instalada e logada;
# cada caso com arquivo revisável consome crédito do CodeAnt.
#
#   bash conformidade.sh <caso> <pasta-de-saida>
#
# Casos:
#   limite40  38 funções pequenas + linhas-5000.js + bytes-204800.js = 40 revisáveis
#   limite41  41 funções pequenas (um arquivo além do corte)
#   pulos     linhas e bytes um acima do limite, a quebra final, lock, binário,
#             documento (.pdf e .md), arquivo deletado e --exclude
#   pulos-uncommitted  os mesmos pulos, sem o .md, sem commit e com --uncommitted
#             (nada revisável: a CLI não chama a API e não gasta crédito)
#
# Cada caso roda num repositório git temporário: um commit inicial, um commit
# com a mudança e `codeant review --headless --base-commit <sha inicial>`
# (o modo da emenda para trabalho commitado, seção 6). Datas fixas: os SHAs se
# repetem a cada execução. Grava em <pasta-de-saida>: <caso>.json (o stdout da
# CLI, byte a byte: é o que fica versionado ao lado), <caso>.stderr (progresso;
# falha de lote só aparece aqui, como `[error] Failed to review ...`),
# <caso>.saida (exit code) e <caso>.medidas (bytes e linhas de cada arquivo).

set -euo pipefail

[ "$#" -eq 2 ] || { echo "uso: ${0##*/} <limite40|limite41|pulos|pulos-uncommitted> <pasta-de-saida>" >&2; exit 2; }
caso="$1"; saida="$(mkdir -p "$2" && cd "$2" && pwd)"
versao="$(codeant --version)"
[ "$versao" = "0.5.14" ] || { echo "CLI $versao: estes testes são da 0.5.14" >&2; exit 2; }

repo="$(mktemp -d /tmp/conformidade-codeant-XXXXXX)"
trap 'rm -rf "$repo"' EXIT
cd "$repo"
git init -q
git config user.name conformidade
git config user.email conformidade@exemplo.invalid
git config commit.gpgsign false
export GIT_AUTHOR_DATE=2026-10-19T00:00:00Z GIT_COMMITTER_DATE=2026-10-19T00:00:00Z

# função JS pequena e determinística
funcao() { printf 'export function soma%d(a) {\n  return a + %d;\n}\n' "$((10#$1))" "$((10#$1))"; }
# <n> linhas `export const vN = N;`, a última sem quebra final quando $2 = sem
linhas() {
  local n="$1"
  for ((i = 1; i < n; i++)); do printf 'export const v%d = %d;\n' "$i" "$i"; done
  if [ "${2:-}" = sem ]; then printf 'export const v%d = %d;' "$n" "$n"; else printf 'export const v%d = %d;\n' "$n" "$n"; fi
}
# 100 linhas de 2.048 bytes (204.800), mais <extra> bytes na última
bytes() {
  local extra="$1" corpo
  corpo="$(head -c 2024 /dev/zero | tr '\0' x)"
  for ((i = 100; i < 199; i++)); do printf 'export const s%d = "%s";\n' "$i" "$corpo"; done
  printf 'export const s%d = "%s%s";\n' 199 "$corpo" "$(head -c "$extra" /dev/zero | tr '\0' x)"
}

echo '{"lockfileVersion": 3, "packages": {}}' > package-lock.json
funcao 0 > apagado.js
git add -A && git commit -qm inicial
base="$(git rev-parse HEAD)"

exclude=()
case "$caso" in
  limite40)
    for i in $(seq -w 1 38); do funcao "$i" > "f$i.js"; done
    linhas 5000 sem > linhas-5000.js
    bytes 0 > bytes-204800.js
    ;;
  limite41)
    for i in $(seq -w 1 41); do funcao "$i" > "f$i.js"; done
    ;;
  pulos|pulos-uncommitted)
    linhas 5000 > linhas-5000-quebra-final.js
    linhas 5001 sem > linhas-5001.js
    bytes 1 > bytes-204801.js
    echo '{"lockfileVersion": 3, "packages": {"": {"name": "x"}}}' > package-lock.json
    printf '\x89PNG\r\n\x1a\n\x00\x01\x02\x03' > logo.png
    printf '%%PDF-1.4\n%%conformidade\n' > manual.pdf
    # o .md é revisável (gasta crédito): só no caso commitado
    [ "$caso" = pulos-uncommitted ] || printf '# Notas\n\nDocumento de teste.\n' > notas.md
    git rm -q apagado.js
    mkdir gerado && funcao 99 > gerado/saida.js
    exclude=(--exclude 'gerado/**')
    ;;
  *) echo "caso desconhecido: $caso" >&2; exit 2 ;;
esac
# pulos-uncommitted: a mudança fica sem commit (o modo da F6), com os arquivos
# novos fora do índice (untracked)
modo=(--base-commit "$base")
if [ "$caso" = pulos-uncommitted ]; then modo=(--uncommitted); else git add -A && git commit -qm mudanca; fi

# medidas dos arquivos (bytes, wc -l e o que a CLI conta: split('\n'))
for f in $( (git diff --name-only "$base"; git ls-files --others --exclude-standard) | sort -u); do
  [ -f "$f" ] || { echo "$f deletado" >&2; continue; }
  echo "$f bytes=$(wc -c < "$f") wc-l=$(wc -l < "$f") split=$(($(wc -l < "$f") + 1))" >&2
done 2> "$saida/$caso.medidas"

set +e
codeant review --headless "${modo[@]}" "${exclude[@]}" > "$saida/$caso.json" 2> "$saida/$caso.stderr"
echo $? > "$saida/$caso.saida"
set -e
cat "$saida/$caso.json"
rc="$(cat "$saida/$caso.saida")"
echo "exit $rc" >&2
exit "$rc"
