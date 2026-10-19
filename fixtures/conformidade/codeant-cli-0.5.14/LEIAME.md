# Conformidade da CLI do CodeAnt 0.5.14

Passo 0 da emenda `docs/superpowers/specs/2026-10-19-limites-do-codeant-emenda.md` (seções 6 e 11): o comportamento da CLI nas bordas, provado com a CLI real e logada, em 2026-10-19. Os `*.json` desta pasta são o **stdout da CLI, byte a byte** (`codeant review --headless`), sem redução: são pequenos, e nenhum traz token, chave, sessão ou identificador de conta (conferido). A suíte da revisão por task (emenda, 11, passo 1c) os serve por uma CLI falsa.

## Versão

| Campo | Valor (`npm view codeant-cli@0.5.14`) |
|---|---|
| `codeant --version` | `0.5.14` (WSL Ubuntu, `/home/kato/.npm-global/bin/codeant`) |
| `dist.integrity` | `sha512-LNg2uf76Qq4b11vZuxtL0ULTs6UPcGHlRxvFoiADXywLxqtYoBnHszyaNQmY1v9niZW/zzPwqMgNTn3ltuNnzw==` |
| `gitHead` | `475f9793969c3c86cb0dae04acc64884af2ee1f1` |
| publicado | 2026-10-15 |

## Como reproduzir

```sh
bash conformidade.sh <limite40|limite41|pulos|pulos-uncommitted> <pasta-de-saida>
```

Cada caso monta um repositório git temporário em `/tmp/conformidade-codeant-*` (removido ao fim), com datas fixas, e roda `codeant review --headless --base-commit <sha inicial>` (o modo da emenda para trabalho commitado); `pulos-uncommitted` deixa a mudança sem commit e roda `--uncommitted` (o modo da F6). O script recusa outra versão da CLI. Gasta crédito: `limite40`, `limite41` e `pulos` (só o `notas.md`); `pulos-uncommitted` não chama a API (`noFiles: true`). Esta homologação consumiu **3 revisões**.

## Resultado por caso

| Caso | Arquivos | Resultado (`meta`) | Exit |
|---|---|---|---|
| `limite40` | 38 funções + `linhas-5000.js` (5.000 linhas pela conta da CLI, sem quebra final; 132.785 B) + `bytes-204800.js` (204.800 B, 100 linhas) | os 40 em `reviewed_files`, `skipped: []`, `capped: false`, `max_files: 40` | 0 |
| `limite41` | 41 funções | 40 revisados (`f01`–`f40`); `{"file":"f41.js","reason":"exceeded 40-file limit"}`; `capped: true`, `total_changed: 41` | 0 |
| `pulos` | lock, `.png`, `.pdf`, `.md`, deletado, `--exclude 'gerado/**'`, 5.001 linhas, 5.000 linhas **com** quebra final, 204.801 B | só `notas.md` revisado; os outros 8 pulados (motivos abaixo); `total_changed: 9` | 0 |
| `pulos-uncommitted` | os mesmos, sem o `.md`, pela `--uncommitted` | nada revisado, os mesmos 8 motivos, `noFiles: true` | 0 |

## Valores observados (para o perfil `codeant-cli@0.5.14`, emenda 6)

- **Caminho dos metadados:** `meta`, no topo do JSON do `--headless` (chaves do topo: `issues`, `meta`, `error`, `noFiles`). `_meta` não aparece: o `--headless` o renomeia. O limite é **`meta.max_files` = 40** (número). Também em `meta`: `reviewed_files` (lista), `total_changed` (número), `skipped` (lista de `{file, reason}`), `capped` (booleano).
- **Motivos de pulo, texto exato:**

  | Situação | `reason` |
  |---|---|
  | lock (`package-lock.json` e os outros nomes da lista), binário/mídia (`.png`), documento de escritório (`.pdf`) | `binary/generated` |
  | arquivo deletado | `deleted` |
  | casa `--exclude` (ou fica fora de `--include`) | `excluded by pattern` |
  | acima de 204.800 bytes | `too large (<KB arredondado>, max 200 KB)`; com 204.801 B: `too large (200 KB, max 200 KB)` |
  | acima de 5.000 linhas | `too large (<n> lines, max 5000)` |
  | além do 40º revisável | `exceeded 40-file limit` |

- **Ordem dos filtros** (modo `--base-commit` e `--uncommitted`): `binary/generated`, `deleted`, `excluded by pattern`, tamanho em bytes, linhas e, por último, o corte de 40, na ordem do diff (alfabética).
- **Exit code:** 0 com arquivos pulados ou cortados; 1 só quando `error` não é nulo.

## O que confirma e o que difere da emenda

Confirma: 40 arquivos por revisão, com o corte depois dos filtros; 204.800 bytes revisado e 204.801 pulado; deletado, lock, binário, `.pdf` e `--exclude` fora da conta; o caminho é `meta` (como o spike 6.0 viu); o mesmo comportamento em `--base-commit` e em `--uncommitted`.

Difere ou precisa de decisão:

1. **`.md` é revisado.** "Documento", para a CLI, é só `.pdf`, `.doc(x)`, `.xls(x)`, `.ppt(x)` (lista de extensões); Markdown conta para os 40 e para L2. O predicado de revisável não pode excluir `.md`.
2. **A CLI conta linhas como `split('\n').length`**, isto é, quebras + 1. Arquivo comum de 5.000 linhas, terminado em quebra (`wc -l` = 5.000), é **pulado** como `5001 lines`. Na prática, L2 é `wc -l` ≤ 4.999 para arquivo com quebra final (ou "quebras + 1 ≤ 5.000").
3. **O motivo de bytes arredonda:** 204.801 B aparece como `200 KB, max 200 KB`. O predicado mede bytes, nunca o texto do motivo.
4. **Falha de lote não aparece no JSON.** Um lote (até 5 arquivos) que falha na API só sai no stderr (`[error] Failed to review <arquivos>: ...`); o arquivo continua em `reviewed_files`, `error` fica nulo e o exit é 0. "Revisado" no JSON quer dizer "enviado". Nenhum caso aqui falhou (stderr sem `[error]`), mas o portão de cobertura completa precisa olhar o stderr.
