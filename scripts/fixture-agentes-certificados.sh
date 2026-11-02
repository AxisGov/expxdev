#!/usr/bin/env bash
#
# Extrai os agentes Claude de uma skill, fixados no commit certificado, para
# fixtures/agentes-certificados/<nome>/ — a fonte que
# src/cli/certificacao-orquestracao.test.ts resolve com a política ativa.
#
#   bash scripts/fixture-agentes-certificados.sh <repositorio-da-skill> <sha> <nome>
#
# Só `.claude/agents/*.md`: é o que o resolvedor lê, e o que falhou na 0.13.0
# (`sem_classe`). A instalação inteira das nove skills fica na prova de release,
# porque os snapshots completos passariam do limite L3 de um PR. Os bytes saem
# do objeto Git e são conferidos contra o blob; `<nome>.sha` guarda o commit.
set -euo pipefail
REPO="$1"; SHA="$2"; NOME="$3"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="$RAIZ/fixtures/agentes-certificados"
DEST="$BASE/$NOME"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "informe o SHA completo: $SHA" >&2; exit 2; }
git -C "$REPO" cat-file -e "$SHA^{commit}"
rm -rf "${DEST:?}"
mkdir -p "$DEST"
if git -C "$REPO" cat-file -e "$SHA:.claude/agents" 2>/dev/null; then
  while IFS=$'\t' read -r meta caminho; do
    blob="$(printf '%s' "$meta" | awk '{print $3}')"
    case "$caminho" in *.md) ;; *) continue ;; esac
    git -C "$REPO" cat-file blob "$blob" > "$DEST/$(basename "$caminho")"
    [ "$(git hash-object --no-filters "$DEST/$(basename "$caminho")")" = "$blob" ] \
      || { echo "divergente do blob: $caminho" >&2; exit 1; }
  done < <(git -C "$REPO" ls-tree "$SHA" -- .claude/agents/)
fi
printf '%s\n' "$SHA" > "$BASE/$NOME.sha"
echo "$NOME: $(find "$DEST" -name '*.md' | wc -l) agente(s) em $SHA"
