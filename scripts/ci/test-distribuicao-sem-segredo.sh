#!/usr/bin/env bash
#
# Portão da release: a distribuição completa passa pela varredura de segredo da
# MergeX.
#
#   bash scripts/ci/test-distribuicao-sem-segredo.sh
#
# O `init` real (o binário do `dist/`) instala as nove skills do catálogo, cada
# uma do `main` dela, num projeto descartável. Cada arquivo que o lock registra é
# conferido contra o hash, e cada arquivo que a instalação deixou na árvore —
# `.claude/`, `.expx/marketplace/` e `.expx/hooks.json`, inclusive o que o lock não
# registra (núcleo, manifestos do plugin, `hooks.json` consolidado) — é varrido
# INTEIRO com a tabela de segredo da MergeX instalada. A suíte de teste dos hooks
# (`hooks/teste.sh`, `hooks/testes/`) não pode chegar ao projeto.
#
# Por quê: o que o `init` instala vai para o commit do projeto, e o pre-push da
# MergeX (DM-279) varre o que o push publica. Na 0.12.5, exemplos fictícios do
# texto da MergeX e a suíte dos hooks barraram o push do commit que instalava a
# versão no katosmv/login. O teste offline (`src/cli/distribuicao-sem-segredo.test.ts`)
# cobre os candidatos fixados; este cobre o que um projeto recebe no dia da release.
#
# Precisa de rede (clona do GitHub) e do `dist/` montado (`npm run build`). Roda
# com HOME descartável e com um `claude` falso à frente do PATH: o `init` nunca
# registra nada na configuração de quem o roda.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$raiz/dist/cli/expx-bin.js"
[ -f "$BIN" ] || { echo "ERRO: $BIN ausente; rode npm run build" >&2; exit 2; }

aux="$(mktemp -d)"; trap 'rm -rf "$aux"' EXIT
mkdir -p "$aux/lar" "$aux/bin" "$aux/produto"
printf '#!/bin/sh\necho "claude falso do portao da release" >&2\nexit 1\n' > "$aux/bin/claude"
chmod +x "$aux/bin/claude"

skills="$(cd "$raiz" && node --input-type=module -e "import { NOMES } from './dist/nucleo/catalogo.js'; console.log(NOMES.join(','))")"
[ -n "$skills" ] || { echo "ERRO: catalogo vazio" >&2; exit 2; }

produto="$aux/produto"
git -C "$produto" init -q -b main
git -C "$produto" config user.email portao@example.invalid
git -C "$produto" config user.name portao
if ! (cd "$produto" && HOME="$aux/lar" USERPROFILE="$aux/lar" PATH="$aux/bin:$PATH" \
  node "$BIN" init --skills "$skills" --yes) > "$aux/init.out" 2>&1; then
  echo "ERRO: o init das nove skills falhou:" >&2
  cat "$aux/init.out" >&2
  exit 1
fi

tabela="$produto/.claude/skills/mergex/scripts/segredo-tabela.sh"
[ -f "$tabela" ] || { echo "ERRO: a tabela da mergex nao foi instalada" >&2; exit 1; }

# caminho TAB hash, um por arquivo que o lock registra
node -e '
  const l = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const [c, h] of Object.entries(l.instalacao.arquivos)) console.log(c + "\t" + h);
' "$produto/.expx/expx-lock.json" > "$aux/arquivos.tsv"

n="$(wc -l < "$aux/arquivos.tsv" | tr -d ' ')"
[ "$n" -gt 100 ] || { echo "ERRO: so $n arquivos no lock" >&2; exit 1; }

falhou=0
# o hash de cada arquivo registrado
while IFS="$(printf '\t')" read -r rel hash; do
  atual="$(sha256sum "$produto/$rel" 2>/dev/null | cut -d' ' -f1 || true)"
  [ "$atual" = "$hash" ] || { echo "FALHA hash: $rel"; falhou=1; }
done < "$aux/arquivos.tsv"

# o que a instalação deixou na árvore, registrado no lock ou não
(cd "$produto" && find .claude .expx/marketplace -type f; [ -f .expx/hooks.json ] && echo .expx/hooks.json) \
  | sed 's#^\./##' | sort > "$aux/arvore.txt"
na="$(wc -l < "$aux/arvore.txt" | tr -d ' ')"
# todo caminho do lock está na árvore varrida: um arquivo travado fora dela teria o
# hash conferido sem passar pela tabela
cut -f1 "$aux/arquivos.tsv" | sort > "$aux/lock.txt"
if [ -n "$(comm -23 "$aux/lock.txt" "$aux/arvore.txt")" ]; then
  echo "FALHA caminhos do lock fora da arvore varrida:"; comm -23 "$aux/lock.txt" "$aux/arvore.txt"; falhou=1
fi

# a suíte de teste dos hooks, na árvore
if grep -E '(^|/)hooks/(teste\.sh|testes/)' "$aux/arvore.txt" > "$aux/suite.txt"; then
  echo "FALHA a suite de teste dos hooks chegou ao projeto:"; cat "$aux/suite.txt"; falhou=1
fi

# cada arquivo da árvore, inteiro, pela tabela instalada
achados="$(cat "$aux/arvore.txt" | (cd "$produto" && bash -c '
  . "$1"
  while IFS= read -r f; do
    [ -f "$f" ] && [ -r "$f" ] || { printf "== %s\n  - ilegivel\n" "$f"; continue; }
    ALVO="$(cat "$f")"; segredo_varrer
    [ -z "$ACHADOS" ] || printf "== %s\n%s" "$f" "$ACHADOS"
  done
' varre "$tabela"))"
if [ -n "$achados" ]; then echo "FALHA achados na distribuicao:"; printf '%s\n' "$achados"; falhou=1; fi

[ "$falhou" -eq 0 ] || exit 1
echo "ok: $na arquivos instalados ($n no lock) de $skills, sem achado, sem a suite dos hooks"
