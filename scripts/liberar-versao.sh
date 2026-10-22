#!/usr/bin/env bash
#
# Dispara explicitamente a release SemVer de um SHA completo já validado na main.
#
#   bash scripts/liberar-versao.sh <versao> <sha-completo>
#
# O script não cria tag, não cria release diretamente e não publica no npm. Ele
# valida a seleção e aciona o workflow release.yml, onde todos os gates são
# repetidos antes de qualquer escrita no GitHub.

set -euo pipefail

REPO="${EXPX_REPO:-AxisGov/expxdev}"
WORKFLOW=release.yml
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

falha() { echo "liberar-versao: $*" >&2; exit 1; }

case "${1:-}" in
  -h|--help)
    sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac
[ "$#" -eq 2 ] || { echo "uso: ${0##*/} <versao> <sha-completo>" >&2; exit 2; }
VERSAO="$1"
SHA="$2"
[[ "$VERSAO" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] \
  || falha "versão SemVer inválida: $VERSAO"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || falha "informe o SHA completo em lowercase"

for comando in git gh node; do
  command -v "$comando" >/dev/null || falha "$comando não encontrado"
done

git -C "$RAIZ" fetch -q --no-tags origin main || falha "git fetch origin main falhou"
resolvido="$(git -C "$RAIZ" rev-parse --verify -q "$SHA^{commit}")" \
  || falha "commit inexistente: $SHA"
[ "$resolvido" = "$SHA" ] || falha "SHA não resolveu exatamente para $SHA"
git -C "$RAIZ" rev-list --first-parent origin/main | grep -x "$SHA" >/dev/null \
  || falha "$SHA não é commit de primeiro pai da main"

versao_pacote="$(git -C "$RAIZ" show "$SHA:package.json" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')" \
  || falha "não foi possível ler package.json no SHA"
versoes_lock="$(git -C "$RAIZ" show "$SHA:package-lock.json" | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`${j.version} ${j.packages?.[""]?.version}`)})')" \
  || falha "não foi possível ler package-lock.json no SHA"
[ "$versao_pacote $versoes_lock" = "$VERSAO $VERSAO $VERSAO" ] \
  || falha "package.json/package-lock.json divergem da versão solicitada: $versao_pacote $versoes_lock"

TAG="v$VERSAO"
if git -C "$RAIZ" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  falha "tag remota já existe: $TAG"
else
  status=$?
  [ "$status" -eq 2 ] || falha "não foi possível consultar a tag remota $TAG"
fi

if existente="$(gh release view "$TAG" -R "$REPO" --json tagName 2>&1)"; then
  falha "GitHub Release já existe: $TAG ($existente)"
elif [ "$existente" != "release not found" ]; then
  falha "não foi possível consultar a release $TAG: $existente"
fi

echo "disparando $WORKFLOW para $TAG em $SHA"
gh workflow run "$WORKFLOW" -R "$REPO" --ref main -f ref="$SHA" -f version="$VERSAO"
echo "acompanhe: gh run list -R $REPO --workflow $WORKFLOW --limit 1"
