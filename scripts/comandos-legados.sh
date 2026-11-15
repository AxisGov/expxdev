#!/usr/bin/env bash
#
# Gera src/nucleo/comandos-legados-manifesto.ts: as versões que o fork AxisGov já
# publicou de cada comando, em `.claude/commands/<nome>.md` ou `commands/<nome>.md`.
# É a autoridade com que o init remove a cópia manual antiga de um comando em
# `.claude/commands/` (src/nucleo/comandos-legados.ts; conselhos, 2026-11-14).
#
#   bash scripts/comandos-legados.sh [--check] <skill>=<clone local> ...
#
# Uma entrada por skill do catálogo, com um clone que tenha o commit certificado.
# As fontes são fechadas e auditáveis: o commit `certificado` de cada skill em
# src/nucleo/catalogo.ts (a história alcançável dele) e os commits `historico`
# abaixo, versões publicadas em ramos do fork que a história certificada não
# alcança. Nunca "todas as refs": um ramo experimental não autoriza apagar nada.
#
# O hash é o sha256 do blob com CRLF trocado por LF, o mesmo de hashNormalizado().
# Rode de novo sempre que um pin do catálogo andar (o teste do manifesto cobra).
# --check: gera num temporário e falha (1) se diferir do arquivo versionado.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# EXPX_MANIFESTO_SAIDA e EXPX_CATALOGO trocam os caminhos só no teste do gerador
SAIDA="${EXPX_MANIFESTO_SAIDA:-$RAIZ/src/nucleo/comandos-legados-manifesto.ts}"
CATALOGO="${EXPX_CATALOGO:-$RAIZ/src/nucleo/catalogo.ts}"

# skill commit — versões publicadas fora da história certificada
HISTORICO="${EXPX_HISTORICO-buildx 5364de54af90663eb0e64bf8264ad47d6b5481dd
buildx 174c044313878330a79831fb55d6bf8cc0499325}"

CHECK=0
if [ "${1:-}" = --check ]; then CHECK=1; shift; fi
declare -A REPO=()
for a in "$@"; do
  case "$a" in *=*) REPO["${a%%=*}"]="${a#*=}" ;; *) echo "uso: $0 [--check] <skill>=<clone> ..." >&2; exit 64 ;; esac
done

CERTIFICADOS="$(awk '
  /nome: "/ { n = $0; sub(/.*nome: "/, "", n); sub(/".*/, "", n) }
  /certificado: "/ { c = $0; sub(/.*certificado: "/, "", c); sub(/".*/, "", c); print n " " c }
' "$CATALOGO")"
[ -n "$CERTIFICADOS" ] || { echo "nenhum commit certificado em $CATALOGO" >&2; exit 2; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
: > "$tmp/pares"; : > "$tmp/fontes"

coleta() { # <skill> <commit> <papel>
  local skill="$1" commit="$2" papel="$3" repo="${REPO[$1]:-}"
  [ -n "$repo" ] || { echo "falta o clone de $skill (passe $skill=<caminho>)" >&2; exit 2; }
  git -C "$repo" cat-file -e "$commit^{commit}" 2>/dev/null \
    || { echo "$skill: o commit $commit não está em $repo" >&2; exit 2; }
  printf '%s\t%s\t%s\n' "$skill" "$commit" "$papel" >> "$tmp/fontes"
  git -C "$repo" log "$commit" --no-renames --format= --raw --no-abbrev -- .claude/commands commands \
    | awk -F'\t' '{ split($1, m, " "); if (m[5] == "A" || m[5] == "M") print m[4] "\t" $2 }' \
    | while IFS=$'\t' read -r blob caminho; do
        nome="${caminho##*/}"
        [[ "$nome" =~ ^[a-z0-9][a-z0-9-]*\.md$ ]] || continue
        h="$(git -C "$repo" cat-file blob "$blob" | perl -0777 -pe 's/\r\n/\n/g' | sha256sum | cut -d' ' -f1)"
        printf '%s\t%s\n' "$nome" "$h"
      done >> "$tmp/pares"
}

while read -r skill commit; do coleta "$skill" "$commit" certificado; done <<< "$CERTIFICADOS"
while read -r skill commit; do [ -n "$skill" ] && coleta "$skill" "$commit" historico; done <<< "$HISTORICO"

{
  printf '%s\n' '// Gerado por scripts/comandos-legados.sh: não edite à mão. Ao mover um pin do' \
    '// catálogo, rode o script de novo (o teste do manifesto cobra as fontes).' \
    'import type { ManifestoDeComandos } from "./comandos-legados.js";' '' \
    'export const MANIFESTO_DE_COMANDOS: ManifestoDeComandos = {' '  versao: 1,' '  fontes: ['
  while IFS=$'\t' read -r skill commit papel; do
    printf '    { skill: "%s", commit: "%s", papel: "%s" },\n' "$skill" "$commit" "$papel"
  done < "$tmp/fontes"
  printf '%s\n' '  ],' '  comandos: {'
  LC_ALL=C sort -u "$tmp/pares" | awk -F'\t' '
    $1 != atual { if (atual != "") print "    ],"; atual = $1; print "    \"" $1 "\": [" }
    { print "      \"" $2 "\"," }
    END { if (atual != "") print "    ]," }'
  printf '%s\n' '  },' '};'
} > "$tmp/manifesto.ts"

if [ "$CHECK" = 1 ]; then
  cmp -s "$tmp/manifesto.ts" "$SAIDA" || { echo "manifesto desatualizado: rode scripts/comandos-legados.sh" >&2; diff "$SAIDA" "$tmp/manifesto.ts" | head -20 >&2; exit 1; }
  echo "ok: manifesto em dia ($(LC_ALL=C sort -u "$tmp/pares" | wc -l) versões)"
else
  cp "$tmp/manifesto.ts" "$SAIDA"
  echo "ok: $(cut -f1 "$tmp/pares" | sort -u | wc -l) comandos, $(LC_ALL=C sort -u "$tmp/pares" | wc -l) versões"
fi
