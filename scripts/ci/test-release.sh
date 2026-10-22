#!/usr/bin/env bash
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ci="$raiz/.github/workflows/ci.yml"
release="$raiz/.github/workflows/release.yml"
preflight="$raiz/scripts/ci/preparar-release.mjs"

falha() {
  printf 'contrato de release: %s\n' "$*" >&2
  exit 1
}

esperar_falha() {
  local nome="$1"
  shift
  if "$@" >"$temporario/$nome.out" 2>&1; then
    falha "$nome deveria falhar"
  fi
}

grep -Eq '^  push:' "$ci" || falha 'CI deixou de validar pushes na main'
! grep -Eq 'gh release create|contents:[[:space:]]*write|name:[[:space:]]*release do CLI' "$ci" \
  || falha 'CI comum ainda pode publicar release'
if grep -l 'gh release create' "$raiz"/.github/workflows/*.yml | grep -Fv '/release.yml' >/dev/null; then
  falha 'outro workflow ainda pode criar release automaticamente'
fi

[ -f "$release" ] || falha 'workflow manual de release ausente'
grep -Eq '^  workflow_dispatch:' "$release" || falha 'release não exige dispatch explícito'
! grep -Eq '^  push:|^  pull_request:' "$release" || falha 'release possui gatilho automático'
grep -Fq 'node scripts/ci/preparar-release.mjs' "$release" || falha 'workflow não usa o preflight comum'
grep -Fq 'gh release create' "$release" || falha 'workflow não publica a GitHub Release validada'
! grep -R -E -n 'npm[[:space:]]+publish' "$raiz/.github/workflows" \
  || falha 'workflow não pode publicar no npm'

prepare_block="$(sed -n '/^  prepare:/,/^  publish:/p' "$release")"
publish_block="$(sed -n '/^  publish:/,$p' "$release")"
[ -n "$prepare_block" ] && [ -n "$publish_block" ] || falha 'jobs prepare/publish ausentes'
! grep -Fq 'contents: write' <<<"$prepare_block" \
  || falha 'job que executa código selecionado recebeu escrita'
grep -Fq 'needs: prepare' <<<"$publish_block" || falha 'publicação não depende da preparação read-only'
grep -Fq 'contents: write' <<<"$publish_block" || falha 'job de publicação não recebeu escrita'
! grep -Fq 'actions/checkout' <<<"$publish_block" \
  || falha 'job privilegiado não pode fazer checkout do SHA selecionado'
! grep -Fq 'preparar-release.mjs' <<<"$publish_block" \
  || falha 'job privilegiado não pode executar o preflight do SHA selecionado'
grep -Fq 'gh api --method POST "repos/$GH_REPO/git/refs"' <<<"$publish_block" \
  || falha 'tag não é reservada atomicamente'
grep -Fq -- '--verify-tag' <<<"$publish_block" \
  || falha 'release pode recriar uma tag sem verificação'

temporario="$(mktemp -d)"
trap 'rm -rf "$temporario"' EXIT
fixture="$temporario/repo com espacos"
remoto="$temporario/origin.git"
bin_falso="$temporario/bin"
mkdir -p "$fixture" "$bin_falso"
git init --bare -q "$remoto"
git -C "$fixture" init -q --initial-branch=main
git -C "$fixture" config user.name 'Release Test'
git -C "$fixture" config user.email 'release@example.invalid'
git -C "$fixture" remote add origin "$remoto"

cat >"$fixture/package.json" <<'JSON'
{
  "name": "expxdev",
  "version": "0.10.0",
  "files": ["index.js"]
}
JSON
cat >"$fixture/package-lock.json" <<'JSON'
{
  "name": "expxdev",
  "version": "0.10.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "expxdev",
      "version": "0.10.0"
    }
  }
}
JSON
printf 'export const versao = "0.10.0";\n' >"$fixture/index.js"
git -C "$fixture" add package.json package-lock.json index.js
git -C "$fixture" commit -q -m 'fixture 0.10.0'
git -C "$fixture" push -q -u origin main
sha="$(git -C "$fixture" rev-parse HEAD)"

cat >"$bin_falso/gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-} ${2:-}" = 'release view' ]; then
  if [ "${FAKE_GH_RELEASE_EXISTS:-0}" = 1 ]; then
    printf '{"tagName":"v0.10.0"}\n'
    exit 0
  fi
  printf 'release not found\n' >&2
  exit 1
fi
if [ "${1:-} ${2:-}" = 'run list' ]; then
  if [ "${FAKE_GH_CHECKS_FAIL:-0}" = 1 ]; then
    printf '[{"status":"completed","conclusion":"failure","headSha":"%s"}]\n' "$FAKE_SHA"
  else
    printf '[{"status":"completed","conclusion":"success","headSha":"%s"}]\n' "$FAKE_SHA"
  fi
  exit 0
fi
printf 'gh falso recebeu comando inesperado: %s\n' "$*" >&2
exit 2
SH
chmod +x "$bin_falso/gh"

executar_preflight() {
  PATH="$bin_falso:$PATH" FAKE_SHA="$sha" node "$preflight" \
    --repo "$fixture" --github-repo AxisGov/expxdev --version 0.10.0 \
    --sha "$sha" --output "$1"
}

executar_preflight "$temporario/saida um"
tgz="$temporario/saida um/expxdev-0.10.0.tgz"
[ -f "$tgz" ] || falha 'nome do tarball não corresponde à versão'
(cd "$temporario/saida um" && sha256sum -c expxdev-0.10.0.tgz.sha256) >/dev/null
versao_empacotada="$(tar -xOf "$tgz" package/package.json | node -e \
  'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')"
[ "$versao_empacotada" = 0.10.0 ] || falha 'metadata do pacote divergiu da versão'

executar_preflight "$temporario/saida dois"
hash_um="$(sha256sum "$tgz" | cut -d' ' -f1)"
hash_dois="$(sha256sum "$temporario/saida dois/expxdev-0.10.0.tgz" | cut -d' ' -f1)"
[ "$hash_um" = "$hash_dois" ] || falha 'npm pack não foi determinístico'

printf 'sujeira\n' >"$fixture/arquivo-nao-rastreado"
esperar_falha arvore_suja executar_preflight "$temporario/arvore suja"
rm "$fixture/arquivo-nao-rastreado"

FAKE_GH_RELEASE_EXISTS=1 esperar_falha release_existente executar_preflight "$temporario/release existente"
FAKE_GH_CHECKS_FAIL=1 esperar_falha checks_vermelhos executar_preflight "$temporario/checks vermelhos"

node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p));j.version="0.9.9";j.packages[""].version="0.9.9";fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' \
  "$fixture/package-lock.json"
git -C "$fixture" add package-lock.json
git -C "$fixture" commit -q -m 'lock divergente'
git -C "$fixture" push -q origin main
sha="$(git -C "$fixture" rev-parse HEAD)"
esperar_falha lock_divergente executar_preflight "$temporario/lock divergente"

node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p));j.version="0.10.0";j.packages[""].version="0.10.0";fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' \
  "$fixture/package-lock.json"
git -C "$fixture" add package-lock.json
git -C "$fixture" commit -q -m 'lock reconciliado'
git -C "$fixture" push -q origin main
sha="$(git -C "$fixture" rev-parse HEAD)"

git -C "$fixture" tag v0.10.0
git -C "$fixture" push -q origin v0.10.0
esperar_falha tag_existente executar_preflight "$temporario/tag existente"

printf 'contrato de release manual verificado\n'
