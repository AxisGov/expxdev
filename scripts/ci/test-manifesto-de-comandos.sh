#!/usr/bin/env bash
#
# Portão da release: o manifesto dos comandos legados (src/nucleo/comandos-legados-manifesto.ts)
# é exatamente o que scripts/comandos-legados.sh gera dos commits certificados do catálogo
# e dos commits históricos dele. Clona cada fork AxisGov (o histórico inteiro: o gerador
# lê os blobs) e roda o gerador em --check. Precisa de rede.
#
#   bash scripts/ci/test-manifesto-de-comandos.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
aux="$(mktemp -d)"; trap 'rm -rf "$aux"' EXIT

pares="$(awk '
  /nome: "/ { n = $0; sub(/.*nome: "/, "", n); sub(/".*/, "", n) }
  /repositorio: "/ { r = $0; sub(/.*repositorio: "/, "", r); sub(/".*/, "", r); print n " " r }
' "$raiz/src/nucleo/catalogo.ts")"
[ -n "$pares" ] || { echo "ERRO: nenhuma skill no catalogo" >&2; exit 2; }

args=()
while read -r nome repositorio; do
  git clone -q --no-checkout "$repositorio" "$aux/$nome" 2>"$aux/erro" \
    || { echo "FALHA $nome: $repositorio nao se clona: $(cat "$aux/erro")" >&2; exit 1; }
  args+=("$nome=$aux/$nome")
done <<< "$pares"

bash "$raiz/scripts/comandos-legados.sh" --check "${args[@]}"
