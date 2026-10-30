#!/usr/bin/env bash
#
# Portão da release: cada commit certificado no catálogo existe na origem
# canônica da skill e já está na `main` dela.
#
#   bash scripts/ci/test-certificados.sh [certificados.tsv]
#
# O `init` e o `update` instalam o `certificado` de cada skill (src/nucleo/catalogo.ts),
# e não o topo da `main`. O certificado tem de ser um commit revisado e mesclado: um
# commit de branch que nunca entrou, ou que não existe mais, não pode virar o que os
# projetos instalam. Sem argumento, os pares vêm do catálogo compilado (`dist/`); com
# um TSV (`nome<TAB>repositorio<TAB>certificado`), dele — é como o portão se prova.
#
# Precisa de rede (busca cada repositório, só o histórico, sem conteúdo de arquivo).
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
aux="$(mktemp -d)"; trap 'rm -rf "$aux"' EXIT

if [ "$#" -ge 1 ]; then
  cp "$1" "$aux/certificados.tsv"
else
  [ -f "$raiz/dist/nucleo/catalogo.js" ] || { echo "ERRO: dist/ ausente; rode npm run build" >&2; exit 2; }
  (cd "$raiz" && node --input-type=module -e "
    import { CATALOGO } from './dist/nucleo/catalogo.js';
    for (const s of CATALOGO) console.log([s.nome, s.repositorio, s.certificado].join('\t'));
  ") > "$aux/certificados.tsv"
fi
[ -s "$aux/certificados.tsv" ] || { echo "ERRO: nenhum certificado" >&2; exit 2; }

falhou=0; n=0
while IFS="$(printf '\t')" read -r nome repositorio certificado; do
  n=$((n + 1))
  repo="$aux/$nome.git"
  if ! git init -q --bare "$repo" \
    || ! git -C "$repo" fetch -q --filter=blob:none "$repositorio" "+refs/heads/main:refs/heads/main" 2>"$aux/erro"; then
    echo "FALHA $nome: a main de $repositorio nao se busca: $(cat "$aux/erro")"; falhou=1; continue
  fi
  if ! git -C "$repo" cat-file -e "$certificado^{commit}" 2>/dev/null; then
    echo "FALHA $nome: o certificado $certificado nao esta na main de $repositorio"; falhou=1; continue
  fi
  if ! git -C "$repo" merge-base --is-ancestor "$certificado" main; then
    echo "FALHA $nome: o certificado $certificado nao e ancestral da main de $repositorio"; falhou=1; continue
  fi
  echo "ok   $nome $certificado"
done < "$aux/certificados.tsv"

[ "$falhou" -eq 0 ] || exit 1
echo "ok: $n certificados na main das skills"
