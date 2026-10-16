#!/usr/bin/env bash
#
# Libera uma versão do CLI: garante que a release `cli-<sha7>` de um commit da main
# existe, está completa e instala.
#
#   bash scripts/liberar-versao.sh [commit]
#
# Sem argumento, usa o HEAD de origin/main. Passo a passo:
#   1. confere que o commit é da main (primeiro pai) e calcula a tag cli-<sha7>;
#   2. se a release ainda não existe, espera o CI do push desse commit; se o run foi
#      cancelado (push seguido na main) ou não existe, dispara o CI com `ref` e espera;
#   3. confere a release: publicada, exatamente o .tgz e o .sha256, tag no commit;
#   4. baixa numa pasta temporária, confere o sha256 e roda `expx --version` do .tgz,
#      que tem de dar a versão do package.json desse commit;
#   5. imprime o resumo com os comandos de instalação.
#
# Não usa o dist/ local nem compila nada. Precisa de git, gh (autenticado), node/npx
# e sha256sum. Saída: 0 liberada, 1 falhou (a mensagem diz onde), 2 uso.
# EXPX_REPO troca o repositório (padrão AxisGov/expxdev).

set -uo pipefail

REPO="${EXPX_REPO:-AxisGov/expxdev}"
WORKFLOW=ci.yml
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

falha() { echo "liberar-versao: $*" >&2; exit 1; }
passo() { echo "== $*"; }

case "${1:-}" in -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
[ "$#" -le 1 ] || { echo "uso: ${0##*/} [commit]" >&2; exit 2; }
for c in git gh npx sha256sum; do command -v "$c" >/dev/null || falha "$c não encontrado"; done

# 1. commit e tag
git -C "$RAIZ" fetch -q origin main || falha "git fetch origin main falhou"
SHA="$(git -C "$RAIZ" rev-parse --verify -q "${1:-origin/main}^{commit}")" || falha "commit inexistente: ${1:-origin/main}"
# Só um commit em que a main esteve (primeiro pai): é dele que o push na main gera
# release. Um commit de dentro de um PR está na main, mas nunca foi versão.
git -C "$RAIZ" rev-list --first-parent origin/main | grep -x "$SHA" >/dev/null \
  || falha "$SHA não é um commit da main (primeiro pai); use o merge do PR"
TAG="cli-${SHA::7}"
VERSAO="$(git -C "$RAIZ" show "$SHA:package.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).version))')" \
  || falha "não li a versão do package.json em $SHA"
TGZ="expxdev-$VERSAO.tgz"
passo "commit $SHA → $TAG (pacote $TGZ)"

# Estado da release numa linha: "<isDraft> <arquivos em ordem>"; vazio se não existe.
# Só "release not found" é ausência: outro erro (rede, credencial) para aqui, senão
# viraria um disparo do CI por uma release que existe.
estado() {
  local saida
  if saida="$(gh release view "$TAG" -R "$REPO" --json isDraft,assets \
      --jq '"\(.isDraft) \([.assets[].name] | sort | join(","))"' 2>&1)"; then
    printf '%s\n' "$saida"
  elif [ "$saida" = "release not found" ]; then
    :
  else
    falha "não consegui consultar a release $TAG: $saida"
  fi
}
COMPLETA="false $TGZ,$TGZ.sha256"

# Procura um run do CI (até 2 min, o run demora a aparecer); devolve o id ou nada.
# Um run de dispatch registra o HEAD da main, não o `ref`: por isso o filtro de commit
# é só para o push, e o dispatch se acha pela hora do disparo.
achar_run() {
  local evento="$1" desde="$2" filtro=() id="" i
  [ "$evento" = push ] && filtro=(--commit "$SHA")
  for i in $(seq 1 12); do
    # ${filtro[@]+...}: array vazio com `set -u` aborta no bash < 4.4 (o do macOS é 3.2).
    id="$(gh run list -R "$REPO" --workflow "$WORKFLOW" --event "$evento" ${filtro[@]+"${filtro[@]}"} --limit 20 \
      --json databaseId,createdAt --jq "[.[] | select(.createdAt >= \"$desde\")] | last | .databaseId // empty")"
    [ -n "$id" ] && break
    sleep 10
  done
  echo "$id"
}

# Acompanha o run até o fim; devolve a conclusão ("sem-run" se não há id).
acompanhar_run() {
  local id="$1"
  [ -n "$id" ] || { echo "sem-run"; return; }
  echo "   run $id: https://github.com/$REPO/actions/runs/$id" >&2
  gh run watch "$id" -R "$REPO" --exit-status >/dev/null 2>&1
  gh run view "$id" -R "$REPO" --json conclusion --jq .conclusion
}

# 2. garantir a release
atual="$(estado)" || exit 1
if [ "$atual" != "$COMPLETA" ]; then
  [ -z "$atual" ] || falha "$TAG existe incompleta ($atual); remova com: gh release delete $TAG -R $REPO --cleanup-tag"
  passo "$TAG ainda não existe; esperando o CI do push"
  conclusao="$(acompanhar_run "$(achar_run push 1970-01-01T00:00:00Z)")"
  echo "   conclusão: $conclusao"
  atual="$(estado)" || exit 1
  if [ "$atual" != "$COMPLETA" ]; then
    case "$conclusao" in
      success|cancelled|sem-run) ;;
      *) falha "o CI do push terminou em '$conclusao' e a release não saiu; veja o run acima" ;;
    esac
    passo "disparando o CI com ref=$SHA"
    desde="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    saida="$(gh workflow run "$WORKFLOW" -R "$REPO" --ref main -f ref="$SHA")" || falha "gh workflow run falhou"
    # O gh novo imprime a URL do run criado; sem ela, acha pelo horário do disparo.
    id="$(printf '%s\n' "$saida" | sed -n 's|.*/actions/runs/\([0-9][0-9]*\).*|\1|p' | head -n 1)"
    [ -n "$id" ] || id="$(achar_run workflow_dispatch "$desde")"
    conclusao="$(acompanhar_run "$id")"
    echo "   conclusão: $conclusao"
    # Push ou outro dispatch na main cancelam este run (concurrency por ref): rodar de novo.
    [ "$conclusao" = success ] || falha "o CI disparado terminou em '$conclusao'; se foi 'cancelled', rode de novo"
    atual="$(estado)" || exit 1
  fi
fi

# 3. conferir a release
[ "$atual" = "$COMPLETA" ] || falha "$TAG não está completa ($atual)"
dono="$(gh api "repos/$REPO/commits/$TAG" --jq .sha)" || falha "não resolvi a tag $TAG"
[ "$dono" = "$SHA" ] || falha "$TAG aponta para $dono, não para $SHA"
passo "release publicada, com $TGZ e $TGZ.sha256, tag no commit"

# 4. instalar como quem consome
tmp="$(mktemp -d)" || falha "mktemp falhou"
trap 'rm -rf "$tmp"' EXIT
gh release download "$TAG" -R "$REPO" -D "$tmp" || falha "download de $TAG falhou"
(cd "$tmp" && sha256sum -c "$TGZ.sha256") || falha "sha256 não confere"
SHA256="$(cut -d' ' -f1 "$tmp/$TGZ.sha256")"
v="$(npx --yes --package "$tmp/$TGZ" expx --version 2>/dev/null | tail -n 1)"
[ "$v" = "$VERSAO" ] || falha "expx --version deu '$v', esperado '$VERSAO'"
passo "instalação conferida: expx --version = $v"

# 5. resumo
cat <<EOF

Versão liberada: $TAG
  commit:  $SHA
  release: https://github.com/$REPO/releases/tag/$TAG
  sha256:  $SHA256  $TGZ

Para instalar num projeto:
  gh release download $TAG -R $REPO -D ~/expx-cli/$TAG
  (cd ~/expx-cli/$TAG && sha256sum -c $TGZ.sha256)
  npx --yes --package ~/expx-cli/$TAG/$TGZ expx init --skills buildx,mergex,sprintx --harness claude --yes
EOF
