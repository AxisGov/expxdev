#!/usr/bin/env bash
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"

legada='((github\.com[/:]|raw\.githubusercontent\.com/)bittencourtthulio/(runx|mergex|sprintx|buildx|expxdev)(\.git)?|bittencourtthulio\.github\.io/expxdev)'
for exemplo in \
  'https://github.com/bittencourtthulio/runx.git' \
  'git@github.com:bittencourtthulio/mergex.git' \
  'ssh://git@github.com/bittencourtthulio/sprintx.git' \
  'git://github.com/bittencourtthulio/buildx.git' \
  'https://raw.githubusercontent.com/bittencourtthulio/runx/main/SKILL.md'
do
  printf '%s\n' "$exemplo" | grep -Eq "$legada" || {
    printf 'regex nao reconheceu origem legada: %s\n' "$exemplo" >&2
    exit 1
  }
done
alvos=(README.md package.json docs-site .github scripts src nucleo docs)
achados="$(grep -RInE --exclude=test-proveniencia.sh "$legada" "${alvos[@]}" 2>/dev/null || true)"
permitidos='^(src/nucleo/catalogo\.ts:[0-9]+:[[:space:]]*origensLegadas:|src/.*\.test\.ts:|docs/expx-cli/base/10-proveniencia-skills\.md:|docs/superpowers/plans/2026-10-21-otimizacao-arquitetura-skills-expx(-baseline)?\.md:|docs/superpowers/specs/2026-10-21-otimizacao-arquitetura-skills-expx-design\.md:)'
nao_permitidos="$(printf '%s\n' "$achados" | grep -Ev "$permitidos" || true)"
[ -z "$nao_permitidos" ] || {
  printf 'origem legada em caminho operacional:\n%s\n' "$nao_permitidos" >&2
  exit 1
}

for repo in runx mergex sprintx buildx; do
  grep -q "https://github.com/AxisGov/$repo" src/nucleo/catalogo.ts || {
    printf 'catalogo sem origem canonica AxisGov/%s\n' "$repo" >&2
    exit 1
  }
done
grep -q 'https://github.com/AxisGov/expxdev' package.json
grep -q '^  pull_request:$' .github/workflows/proveniencia.yml
! grep -q '^[[:space:]]*paths:' .github/workflows/proveniencia.yml || {
  printf 'workflow de proveniencia nao pode limitar caminhos de pull request\n' >&2
  exit 1
}

printf 'proveniencia AxisGov verificada\n'
