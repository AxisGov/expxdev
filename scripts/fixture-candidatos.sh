#!/usr/bin/env bash
#
# Extrai o snapshot de uma skill candidata, fixado num commit, para
# fixtures/candidatos/<nome>/ — a fonte que a bancada P0.2 instala pelo
# `expxdev init` real (src/cli/certificacao-p02.test.ts).
#
#   bash scripts/fixture-candidatos.sh <repositorio-da-skill> <sha> <nome>
#
# Leva só o que o init lê ou que a bancada precisa provar que NÃO é instalado:
# .claude/, .expx/, install.sh, README.md, LICENSE, AGENTS.md. Os bytes saem
# do objeto Git (core.autocrlf=false), e cada arquivo é conferido contra o blob
# do commit antes de entrar no MANIFESTO.sha256.
#
# ATENÇÃO — o snapshot pode ter correção propagada POR CIMA do commit. Rodar isto
# extrai só o commit e DESFAZ essa propagação, e o MANIFESTO regerado não acusa
# nada: ele passa a descrever o snapshot revertido. O que está propagado está em
# fixtures/candidatos/<nome>.PROPAGACOES.md, e é `npm test` que fica vermelho.
set -euo pipefail

REPO="$1"; SHA="$2"; NOME="$3"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$RAIZ/fixtures/candidatos/$NOME"

git -C "$REPO" cat-file -e "$SHA^{commit}"
rm -rf "$DEST"
mkdir -p "$DEST"

CAMINHOS=()
for c in .claude .expx install.sh README.md LICENSE AGENTS.md; do
  if git -C "$REPO" cat-file -e "$SHA:$c" 2>/dev/null; then CAMINHOS+=("$c"); fi
done
git -C "$REPO" -c core.autocrlf=false archive --format=tar "$SHA" -- "${CAMINHOS[@]}" | tar -x -C "$DEST"

# confere cada arquivo extraído contra o blob do commit
while IFS=$'\t' read -r meta caminho; do
  blob="$(printf '%s' "$meta" | awk '{print $3}')"
  [ "$(git hash-object --no-filters "$DEST/$caminho")" = "$blob" ] \
    || { echo "divergente do blob: $caminho" >&2; exit 1; }
done < <(git -C "$REPO" ls-tree -r "$SHA" -- "${CAMINHOS[@]}")

printf '%s\n' "$SHA" > "$DEST.sha"
( cd "$DEST" && find . -type f | LC_ALL=C sort | sed 's|^\./||' | while IFS= read -r f; do
    printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "$f"
  done ) > "$DEST.MANIFESTO.sha256"
echo "ok: $NOME @ $SHA ($(wc -l < "$DEST.MANIFESTO.sha256") arquivos)"

# Reextrair desfaz a propagação em silêncio: quem rodou isto tem de saber.
if [ -f "$DEST.PROPAGACOES.md" ]; then
  echo "AVISO: $NOME tinha propagação por cima de $SHA e ela ACABOU DE SER DESFEITA." >&2
  echo "       Reaplique o que está em fixtures/candidatos/$NOME.PROPAGACOES.md e regere o manifesto." >&2
fi
