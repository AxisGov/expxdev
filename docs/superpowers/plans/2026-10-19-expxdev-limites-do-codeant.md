# Limites do CodeAnt, fixos — plano de implementação (expxdev), parte 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o expxdev cumprir a emenda "limites do CodeAnt, fixos" (passo 1 da seção 11): o leitor de `.expx/fatiamento.json` na versão 2, os `FATIA_*` reservados para sempre, o predicado "revisável" e as medidas L1/L2/L3 espelhando a CLI 0.5.14, os perfis versionados com o manifesto de integridade, o verificador só com L2 e L3, a revisão por task sem lotes e com cobertura completa, o doctor, os contratos e a release.

**Architecture:**
- **Um módulo de regras no núcleo**, `nucleo/scripts/expx-limites.mjs` (ESM, só `node:`), importado pelo leitor e pela revisão: exclusões do núcleo, gramática de `excluir_da_revisao`, `FATIA_*` reservados, perfis, predicado `revisavel`, `medir`, localização e integridade do pacote da CLI.
- **Perfis como dados**, em `nucleo/scripts/perfis/`: `codeant-cli-<versão>.json` (gerado pela homologação, com o manifesto) e `codeant-app.json`. Versão homologada = arquivo de perfil presente; o perfil é a fonte canônica.
- **O verificador continua bash** (a mergex o espelha byte a byte): constantes e predicado copiados do perfil, conferidos por teste contra o módulo.
- **A revisão executa o arquivo do pacote conferido** (`node <bin resolvido>`), nunca o `codeant` do `PATH` depois da conferência.

**Tech Stack:** Node ≥ 20.19 (ESM, `node:`), bash compatível com 3.2 (verificador), `iconv` e `tar` do sistema, vitest, git ≥ 2.36.

**Spec:** `docs/superpowers/specs/2026-10-19-limites-do-codeant-emenda.md` (main, #59) com o ajuste da AxisGov/expxdev#61 (§6, item 3: a integridade cobre os arquivos do pacote `codeant-cli`, não `node_modules`; limite aceito). Desenho de base: `docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md`. Fatos da CLI: `fixtures/conformidade/codeant-cli-0.5.14/` (#60).

**Continua em:** `2026-10-19-expxdev-limites-do-codeant-parte-2.md` (bloco C, release, "Depois do expxdev" e pontos em aberto).

**Estado de partida:** expxdev `origin/main` d5afc59 (com #59 e #60). Código: `nucleo/scripts/expx-fatiamento.mjs` (238 linhas), `nucleo/scripts/expx-revisao.mjs` (278), `scripts/verificar-fatiamento.sh` (230), `src/doctor/verificadores.ts:505-525`, `.github/workflows/ci.yml:81`.

## Decisões incorporadas

*Da emenda (do usuário, 2026-10-19), sem reabrir:* limites fixos L1 40 / L2 5.000 linhas e 204.800 bytes / L3 100; sem limite de linhas; `expx_fatiamento: 2`; chaves removidas inválidas com mensagem própria; `FATIA_*` falham em toda peça, para sempre; `excluir_da_revisao` só para classes de artefato; predicado igual à CLI 0.5.14 (`.md` revisável); linhas = `split('\n').length`, bytes = `Buffer.byteLength`, maior de blob e checkout; versões homologadas exatas com integridade, manifesto e `gitHead`; sem lotes; `--base-commit` para trabalho commitado; cobertura completa com `meta`, `skipped` e stderr; `incompleta:<causa>`, `indisponivel:integridade`; ordem a → b → c da §11.

*Decisões técnicas deste plano (reversíveis):*
- **Exclusões como pasta literal.** `padrao` é `^` seguido de um ou mais segmentos terminados em `/`; cada segmento tem qualquer caractere menos `/`, controle e os metacaracteres `\ ^ $ . | ? * + ( ) [ ] { }`, com o ponto escrito `\.`; segmento que, desescapado, é `.` ou `..` é inválido. Quem aplica usa o **prefixo** literal (`^fixtures/candidatos/` → `fixtures/candidatos/`), nunca regex. As exclusões do núcleo são três itens da mesma gramática: `^docs/sprintx/`, `^docs/entregas/`, `^docs/eventos/`.
- **Saída do leitor v2.** Env: `EXPX_REVISAO_POR_TASK`, `EXPX_ENTREGA`, `EXPX_MERGE_AUTOMATICO`, `EXPX_CAMINHOS_PROTEGIDOS`, `EXPX_REVISOR_BOT`, `EXPX_EXCLUIR_DA_REVISAO` (só os `padrao` do projeto, unidos por `|`; o núcleo não se declara), `EXPX_FATIAMENTO_ORIGEM` e, a partir do bloco B, `EXPX_PERFIL_CLI`, `EXPX_L1_ARQUIVOS`, `EXPX_L2_LINHAS`, `EXPX_L2_BYTES`, `EXPX_L3_ARQUIVOS`. Nenhuma `FATIA_*`.
- **Mensagens exatas da emenda**, com acento: `` `FATIA_<nome>` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente ``; chave removida `removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a`; `ignorar`: `` substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato ``; versão 1: `versão 1: migre para 2 (emenda de 2026-10-19)`.
- **Saída com `FATIA_*` no ambiente:** leitor 1, verificador 2, `expx-revisao` 64 (os três subcomandos); o doctor dá o erro `fatia-no-ambiente`.
- **Várias homologadas:** números, listas de exclusão e motivos têm de ser iguais em todos os perfis (teste); homologar versão que mude isso é emenda nova. Assim os portões antes da CLI (L1, L2) não dependem da versão instalada. Hoje só há a 0.5.14.
- **Bytes no bash:** conteúdo UTF-8 válido (`iconv -f UTF-8 -t UTF-8`) mede os bytes crus, que são os da CLI. Inválido (a CLI troca cada byte ruim por U+FFFD) é medido por `node -e` com a conta de `medir`; sem node, saída 2. Linhas = quebras + 1, que a troca não muda.
- **Regra 6 (`excluido-declarado`)** vale para os itens de `excluir_da_revisao` do projeto, como diz o texto; arquivo da task sob as exclusões do núcleo fica fora da revisão e é registrado na evidência (`revisao: "excluido"`).
- **Checkout no L2 do verificador:** o arquivo da árvore conta quando existe e o `git hash-object` dele é o blob do `<head>` (mesmo conteúdo, a menos do fim de linha); assim vale também no CI, que faz checkout do merge da PR.
- **L3 conta como o GitHub:** `git diff --name-only -z -M` (renomeação = 1 arquivo), sem exclusão nenhuma.

## Global Constraints

- **Fatiamento desta mudança.** O verificador vigente (`bash scripts/verificar-fatiamento.sh origin/main HEAD`: PR ≤ 400 linhas e 20 arquivos, commit ≤ 300 linhas, F4) vale para os blocos **A1, A2 e A3**. O bloco **B é a PR que troca o verificador**: o job `fatiamento` do CI roda o script do checkout da PR, então B já é medido pelo verificador novo (L2/L3), e daí em diante, inclusive B e C, valem **só L2 e L3** (PR ≤ 100 arquivos; arquivo revisável ≤ 5.000 linhas e 204.800 bytes). Nos blocos A, rode o verificador **a cada commit** e antes de abrir a PR; saída ≠ 0 = refatie.
- **Pré-requisito (emenda §11, passo 0):** as divisões estão mergeadas (sprintx#39, `bancada.sh`; mergex#35, `test-r1-reconciliacao-base.sh`); antes do A1, confirme com o desenvolvedor que o inventário de `.expx/fatiamento.json` e `FATIA_*` nos projetos foi feito (ele não muda este plano, só a transição da §9). As releases `cli-<sha7>` entre A1 e C não são liberadas aos projetos.
- Cada bloco é uma PR mergeável sozinha, na ordem A1 → A2 → A3 → B → C, com `npm run typecheck && npm test` verde e a main nunca vermelha. A mergex e a sprintx usam a cópia fixada do núcleo; nada nelas quebra entre as PRs.
- Constantes da emenda, iguais em todo lugar: `max_files` **40**; `MAX_FILE_LINES` **5000**; `MAX_FILE_SIZE_BYTES` **204800**; app **100** arquivos, todos contados.
- Motivos de pulo aceitos (texto exato): `binary/generated`, `deleted`, `excluded by pattern`, `too large (<n> KB, max 200 KB)`, `too large (<n> lines, max 5000)`, `exceeded 40-file limit`.
- Homologada única: **codeant-cli 0.5.14**, `dist.integrity` `sha512-LNg2uf76Qq4b11vZuxtL0ULTs6UPcGHlRxvFoiADXywLxqtYoBnHszyaNQmY1v9niZW/zzPwqMgNTn3ltuNnzw==`, `gitHead` `475f9793969c3c86cb0dae04acc64884af2ee1f1`. Orientação: `npm i -g codeant-cli@0.5.14`; o agente não instala nada.
- Raízes de código (regra 5 de `excluir_da_revisao`): `src`, `lib`, `app`, `apps`, `packages`, `pkg`, `cmd`, `internal`, `server`, `client`, `web`, `api`, `test`, `tests`, `spec`, `scripts`, `.github`, `.claude`, `.opencode`, `.expx`; liberadas por um segmento posterior `fixtures`, `snapshots`, `__snapshots__`, `generated` ou `gerado`.
- Nada de limite, exclusão ou caminho vem do ambiente. Nunca se tira número do texto do motivo da CLI.
- Os artefatos de conformidade ficam em `fixtures/conformidade/`, nunca em `nucleo/` (o `montarPlugin` copia `nucleo/` para os projetos).
- O agente nunca configura credencial da CLI (`login`, `set-codeant-api-key`, `CODEANT_API_TOKEN`).
- Commits `<tipo>(expxdev): <frase sem acento>`; artefato gerado (perfil) em commit próprio, com o comando no corpo.

## Review Focus

1. **Checkout CRLF no Windows** (`core.autocrlf=true`): o arquivo da árvore tem 1 byte a mais por linha que o blob; L2 tem de usar o maior, no verificador e na revisão. Testes nas Tasks B3 e C2.
2. **Arquivo de 5.000 linhas terminado em quebra** (`wc -l` = 5.000): conta 5.001 e passa de L2; com 5.000 sem quebra final, passa. Testes nas Tasks B2 e B3.
3. **Binário com extensão fora da lista** (`dados.bin2`, `.wasm` se não estiver na lista): a CLI o lê como texto, então é revisável e medido; não há "binário pelo conteúdo". Testes nas Tasks B2 e B3.
4. **Caminho com metacaractere de glob** (`src/[id].ts`): o `--include` da CLI o trata como padrão; a reconciliação acusa `faltante`/`sobra`, nunca `ok` calado. Teste na Task C2.
5. **`codeant` do `PATH` que não é o pacote** (script qualquer que responde 0.5.14, shim do npm apontando para outro pacote, arquivo do pacote editado): `indisponivel:integridade`, e a CLI não roda. Testes na Task C1.

## Os blocos

| PR | Entrega | Arquivos | Linhas (est.) | Limite |
|---|---|---|---|---|
| A1 | leitor v2: versão 2, chaves removidas, sem `FATIA_*` na saída | 5 | ~260 | 400/20/300 |
| A2 | `excluir_da_revisao`, `FATIA_*` reservados no leitor e no doctor, `expx-limites.mjs` | 6 | ~330 | 400/20/300 |
| A3 | contrato de instalação §5.2 e README do núcleo | 3 | ~170 | 400/20/300 |
| B | perfis e homologação, predicado e medidas, verificador L2/L3, `ci.yml`, contrato `expx-fatiamento` v3 | ~13 | ~1.300 | L2/L3 (troca) |
| C | revisão por task v2, CLI falsa com os JSONs da #60, contrato `expx-revisao` v2 (parte 2) | ~9 | ~1.400 | L2/L3 |
| R | release `cli-<sha7>` do merge de C, sem liberar (parte 2) | 0 | 0 | — |

Dependências: A2 depende de A1 (mesmo leitor); A3 descreve A1+A2; B depende de A2 (`expx-limites.mjs` e o leitor que passa a emitir os números); C depende de B (perfis, predicado, medidas) e de A2 (`FATIA_*`, exclusões).

---

## Bloco A1 (PR 1) — leitor v2

### Task A1: `expx-fatiamento.mjs` aceita só a versão 2

**Files:**
- Modify: `nucleo/scripts/expx-fatiamento.mjs` (sai :8-12, `limites()` :56-68, :172-176, :189-199, as `FATIA_*` de :221-229; `CHAVES` :15)
- Modify: `src/nucleo/expx-fatiamento.test.ts`, `src/doctor/verificadores.test.ts` (:125-151, fixtures para a versão 2), `src/cli/init.test.ts:293` (fixture de preservação na versão 2)
- Modify: `src/nucleo/fatiamento.test.ts` (sai o caso "o leitor chega ao verificador só com `set -a`", :399-432, que dependia das `FATIA_*` do leitor)

**Interfaces:**
- Produces: `CHAVES` = `expx_fatiamento`, `revisao_por_task`, `entrega`, `merge_automatico`, `revisor_bot` (A2 soma `excluir_da_revisao`). `REMOVIDAS` = `legibilidade`, `arquivo`, `justificativa`, `capacidade` (motivo "removida…") e `ignorar` (motivo "substituída…"). `--formato json` = `{origem, revisao_por_task:{modo}, entrega, merge_automatico:{ativo, caminhos_protegidos}, revisor_bot}`. Env sem nenhuma `FATIA_*`.
- A validação ERE (`foraDoEre`, `regexes`) fica, só para `merge_automatico.caminhos_protegidos`.

- [ ] **Step 1: Write the failing tests** (no `expx-fatiamento.test.ts`; os casos de ERE passam de `ignorar` para `merge_automatico.caminhos_protegidos`, com o helper `const ere = (l: string[]) => ({ expx_fatiamento: 2, merge_automatico: { caminhos_protegidos: l } })` e a chave esperada `merge_automatico.caminhos_protegidos[i]`):
  - `sem arquivo: sai 0, só EXPX_*` — nenhuma linha começa com `FATIA_`; contém `EXPX_REVISAO_POR_TASK=se_disponivel`, `EXPX_ENTREGA=por_trabalho`, `EXPX_FATIAMENTO_ORIGEM=padrao`.
  - `versão 2 mínima é válida` — `{expx_fatiamento:2, entrega:"por_sprint"}` → rc 0, `EXPX_ENTREGA=por_sprint`.
  - `versão 1 dá a mensagem de migração e lista as chaves removidas` — a calibragem antiga do conselho (`{expx_fatiamento:1, justificativa, legibilidade, revisao_por_task, entrega}`) → rc 1, stdout vazio, stderr contém `expx-fatiamento: expx_fatiamento: versão 1: migre para 2 (emenda de 2026-10-19)`, `expx-fatiamento: legibilidade: removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a` e a linha de `justificativa`.
  - `it.each` das chaves removidas na versão 2 (`legibilidade`, `arquivo`, `justificativa`, `capacidade`) → rc 1 com a mensagem "removida…"; `ignorar` → `` expx-fatiamento: ignorar: substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato ``. Nenhuma delas diz "chave desconhecida".
  - `versão desconhecida` (`3`, `"2"`, ausente) → `expx_fatiamento: versão desconhecida (esperada 2)`.
  - `chave desconhecida` continua (`{expx_fatiamento:2, limites:{}}` → cita `limites`).
  - BOM/CRLF, JSON malformado, link quebrado, `--formato json`/`--validar`/`yaml`, env seguro para `eval` (agora com `caminhos_protegidos: ["^a b/","^x'y/"]` e `EXPX_CAMINHOS_PROTEGIDOS`), `merge_automatico` e `revisor_bot`: os casos de hoje, com `expx_fatiamento: 2`.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-fatiamento.test.ts` — Expected: FAIL nos casos de versão 2 e de chave removida.
- [ ] **Step 3: Implement**: tirar o que a emenda §8 lista; `resolver` acumula, para a versão 1, a linha de migração e uma linha por chave removida presente (a lista que a emenda pede); para a 2, a mensagem própria de cada chave removida. Atualizar as fixtures do doctor e do `init` para a versão 2 e apagar o caso do `set -a` do `fatiamento.test.ts`.
- [ ] **Step 4: Run** `npm run typecheck && npm test` — Expected: verde.
- [ ] **Step 5: Run** `bash scripts/verificar-fatiamento.sh origin/main HEAD` — Expected: exit 0.
- [ ] **Step 6: Commit** `feat(expxdev): leitor de fatiamento na versao 2, sem os limites calibraveis` (dois commits se passar de 300 linhas: testes de ERE migrados; versão 2). Abra a PR 1.

## Bloco A2 (PR 2) — `excluir_da_revisao` e `FATIA_*` reservados

### Task A2.1: `nucleo/scripts/expx-limites.mjs` (exclusões e `FATIA_*`)

**Files:**
- Create: `nucleo/scripts/expx-limites.mjs`
- Test: `src/nucleo/expx-limites.test.ts` (importa o módulo por `pathToFileURL`)

**Interfaces:**
- Produces:
  - `EXCLUIDOS_DO_NUCLEO: readonly string[]` = `["^docs/sprintx/", "^docs/entregas/", "^docs/eventos/"]`.
  - `RAIZES_DE_CODIGO`, `PASTAS_GERADAS`: as listas das Global Constraints.
  - `prefixoDe(padrao: string): string | null` — o prefixo literal (`\.` vira `.`), ou `null` fora da gramática.
  - `excluido(caminho: string, padroes: string[]): boolean` — algum prefixo é começo de `caminho`.
  - `ehRaizDeCodigo(padrao: string): boolean` — regra 5 da emenda.
  - `fatiaNoAmbiente(env: Record<string, string | undefined>): string[]` — nomes com prefixo `FATIA_`, ordenados; definida e vazia conta.
  - `mensagemFatia(nome: string): string` — a frase exata das decisões.

- [ ] **Step 1: Write the failing tests:** `prefixoDe("^fixtures/candidatos/")` = `"fixtures/candidatos/"`; `prefixoDe("^a\\.b/")` = `"a.b/"`; `prefixoDe("^dados de teste/")` = `"dados de teste/"`; `null` para `"fixtures/"`, `"^src"`, `"^a/*/"`, `"^(a|b)/"`, `"^./"`, `"^../x/"`, `"^\\./"`, `"^\\.\\./x/"`, `"^a//"`, `"^a.b/"`; `excluido("docs/eventos/x.jsonl", EXCLUIDOS_DO_NUCLEO)` true e `excluido("docs/eventosx/a", …)` false; `ehRaizDeCodigo`: true para `^src/`, `^scripts/`, `^.github/`… (escrito `^\.github/`); false para `^scripts/ci/fixtures/candidatos/`, `^src/__snapshots__/`, `^fixtures/candidatos/`; `fatiaNoAmbiente({FATIA_X:"", PATH:"x", FATIA_A:"1"})` = `["FATIA_A","FATIA_X"]`; `mensagemFatia("FATIA_X")` igual ao texto exato.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-limites.test.ts` — Expected: FAIL (módulo ausente).
- [ ] **Step 3: Implement** o módulo (só `node:`; nada lido do ambiente além do que `fatiaNoAmbiente` recebe).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): modulo de limites do nucleo com as exclusoes e os FATIA reservados`.

### Task A2.2: o leitor valida `excluir_da_revisao` e recusa `FATIA_*`

**Files:**
- Modify: `nucleo/scripts/expx-fatiamento.mjs` (importa `./expx-limites.mjs`)
- Test: `src/nucleo/expx-fatiamento.test.ts`

**Interfaces:**
- Consumes: Task A2.1.
- Produces: `CHAVES` ganha `excluir_da_revisao`. Erros com a chave `excluir_da_revisao[i]` ou `excluir_da_revisao[i].<campo>`: não objeto; chave a mais ou a menos (forma exata `padrao`, `classe`, `origem`, `motivo`); `padrao` fora da gramática; `padrao` em raiz de código; `padrao` repetido (`deve aparecer uma vez (repete o item <j>)`); `classe` fora de `gerado`/`copia`; `origem` ou `motivo` vazio (depois de aparar). `--formato json` ganha `excluir_da_revisao: [itens]`; env `EXPX_EXCLUIR_DA_REVISAO`. Com qualquer `FATIA_*` no ambiente: uma linha `expx-fatiamento: <mensagemFatia>` por variável, rc 1, mesmo sem arquivo e com `--validar`.

- [ ] **Step 1: Write the failing tests:** `exemplo da emenda é válido` (o JSON da §5 da emenda → rc 0, `EXPX_EXCLUIR_DA_REVISAO=^fixtures/candidatos/`); `it.each` dos inválidos acima, um por regra (inclusive `^src/`, `^scripts/`, `^gerado`, `^a/*/`, item com `extra`, `classe:"codigo"`, `origem:" "`, padrão repetido) → rc 1 citando a chave; `^scripts/ci/fixtures/candidatos/` é válido; `FATIA_MAX_LINHAS_PR=400 no ambiente falha com a mensagem exata, também sem arquivo e com --validar`; `FATIA_ vazia também falha`; `sem lista: EXPX_EXCLUIR_DA_REVISAO vazio e json []`.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-fatiamento.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** a validação (acumula todos os erros, como hoje) e a conferência do ambiente antes de ler o arquivo.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): leitor valida excluir_da_revisao e recusa FATIA no ambiente`.

### Task A2.3: doctor — `FATIA_*` e migração

**Files:**
- Modify: `src/doctor/verificadores.ts` (`verificarFatiamento`, :505-525; nova `verificarFatiaNoAmbiente`)
- Test: `src/doctor/verificadores.test.ts`

**Interfaces:**
- Produces: achado `fatia-no-ambiente` (erro), um por variável, com `problema` = `mensagemFatia(nome)` e `correcao` "remova a variável do shell, do perfil e do CI do projeto"; vale com ou sem `.expx/fatiamento.json`. O doctor chama o leitor com um ambiente **sem** as `FATIA_*` (para o mesmo problema não sair duas vezes). `fatiamento-sem-leitor` passa a exigir também `expx-limites.mjs` (instalado e do pacote) como arquivo regular. A versão 1 chega como `fatiamento-invalido` com a mensagem de migração (stderr do leitor).

- [ ] **Step 1: Write the failing tests:** `FATIA_X no ambiente: erro fatia-no-ambiente, sem arquivo`; `FATIA_X e arquivo válido: só fatia-no-ambiente, nenhum fatiamento-invalido`; `versão 1: fatiamento-invalido com "migre para 2"`; `expx-limites.mjs ausente na instalação: fatiamento-sem-leitor`.
- [ ] **Step 2: Run** `npx vitest run src/doctor/verificadores.test.ts` — Expected: FAIL nos quatro.
- [ ] **Step 3: Implement** a conta em TypeScript (o doctor é síncrono e não importa `.mjs` do núcleo), com um teste a mais: `a mensagem do doctor é a do módulo` (importa `expx-limites.mjs` no teste e compara `mensagemFatia`).
- [ ] **Step 4: Run** `npm run typecheck && npm test` e `bash scripts/verificar-fatiamento.sh origin/main HEAD` — Expected: verdes, exit 0.
- [ ] **Step 5: Commit** `feat(expxdev): doctor acusa FATIA no ambiente e a migracao da versao 1`. Abra a PR 2.

## Bloco A3 (PR 3) — contrato de instalação §5.2

### Task A3: §5.2 na versão 2

**Files:**
- Modify: `docs/contrato/CONTRATO-expx-instalacao.md` (§5.2, :166-199)
- Modify: `nucleo/README.md` (seção `scripts/`, :54-61: o leitor imprime só `EXPX_*`; o módulo `expx-limites.mjs`)

- [ ] **Step 1:** Reescreva a §5.2: o exemplo da emenda (§5); os padrões que ficam; `excluir_da_revisao` com as seis regras, a lista de raízes de código e as pastas que liberam (a emenda §12 manda fixá-las aqui; crescem só por PR no expxdev), o núcleo que soma sem se declarar, a sintaxe glob fora; as chaves removidas e as mensagens; a versão 2 e a migração da 1; `FATIA_*` reservados (leitor sai 1, doctor `fatia-no-ambiente`); a saída env e json das decisões; quem lê (doctor; mergex E7 e sprintx F3/F6 nos planos delas). Tira a calibragem do conselho, `capacidade`, `justificativa` e a regra de afrouxar.
- [ ] **Step 2: Run** `npm test` e `bash scripts/verificar-fatiamento.sh origin/main HEAD` — Expected: verde, exit 0.
- [ ] **Step 3: Commit** `docs(expxdev): contrato de instalacao com o fatiamento.json na versao 2`. Abra a PR 3.

## Bloco B (PR 4) — perfis, predicado, verificador L2/L3 e contrato v3

Esta é a PR que troca o verificador. Antes dela, 400/20/300; ela mesma e as seguintes, L2/L3 (Global Constraints).

### Task B1: homologação e perfis

**Files:**
- Create: `scripts/homologar-codeant-cli.mjs`
- Create (gerado): `nucleo/scripts/perfis/codeant-cli-0.5.14.json`
- Create: `nucleo/scripts/perfis/codeant-app.json`
- Test: `src/nucleo/homologar-codeant-cli.test.ts`

**Interfaces:**
- Produces: `node scripts/homologar-codeant-cli.mjs --versao <v> --integridade <sha512-…> --git-head <sha> [--tarball <arquivo>] [--packument <arquivo>] [--saida <dir>]` (padrão da saída: `nucleo/scripts/perfis/`). Sem eles, baixa `https://registry.npmjs.org/codeant-cli/<v>` e o tarball de `dist.tarball`; confere `version`, `dist.integrity` e `gitHead` do packument contra os argumentos antes de tudo. Sai 0 (gravou), 1 (integridade diferente, fonte não reconhecida), 2 (uso).
- Perfil da CLI: `{perfil:"codeant-cli", versao, integridade, git_head, fonte:"src/utils/reviewApiHelper.js", max_files, max_linhas, max_bytes, excluidos:{nomes:[], extensoes:[], sufixos:[]}, motivos:{exatos:[], padroes:[]}, package_json:{name, version, bin}, manifesto:{<caminho em package/>: <sha256 hex>}}`, chaves do manifesto ordenadas, separador `/`.
- `motivos.exatos` = `binary/generated`, `deleted`, `excluded by pattern`, `exceeded <max_files>-file limit`; `motivos.padroes` = `^too large \([0-9]+ KB, max <max_bytes/1024> KB\)$` e `^too large \([0-9]+ lines, max <max_linhas>\)$`.
- Perfil do app: `{perfil:"codeant-app", max_arquivos_pr:100, conta:"todos os arquivos alterados (changed_files), sem desconto do painel", fontes:["AxisGov/mergex#15","katosmv/login#7"]}`.

- [ ] **Step 1: Write the failing tests** (tarball sintético montado no teste com `tar -czf`, com `package/package.json` e `package/src/utils/reviewApiHelper.js` imitando :6-71 do pacote real): `grava o perfil com os números, as listas e o manifesto`; `integridade diferente sai 1 e não grava`; `gitHead ou dist.integrity do packument diferentes dos argumentos sai 1`; `fonte sem MAX_REVIEW_FILES (ou sem EXCLUDED_EXTENSIONS, ou sem os textos "too large (" e "-file limit") sai 1: homologue à mão`; `MAX_FILE_SIZE_BYTES = 200 * 1024 vira 204800`.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/homologar-codeant-cli.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: sha512 do tarball em base64 contra `--integridade`; extração com `tar -xzf` num diretório temporário; sha256 de cada arquivo regular de `package/`; as listas lidas dos literais de array de `reviewApiHelper.js` e os números de `MAX_*` (produto de inteiros); os sufixos das chamadas `endsWith('…')` de `isReviewableFile`. Antes de gravar, **leia** :59-71 da fonte e confira que a comparação é a da emenda (nome exato do `basename`, `path.extname` em minúsculas, sufixos): se não for, o script não serve para esta versão.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Run** a homologação real: `node scripts/homologar-codeant-cli.mjs --versao 0.5.14 --integridade sha512-LNg2uf76Qq4b11vZuxtL0ULTs6UPcGHlRxvFoiADXywLxqtYoBnHszyaNQmY1v9niZW/zzPwqMgNTn3ltuNnzw== --git-head 475f9793969c3c86cb0dae04acc64884af2ee1f1` — Expected: exit 0; o perfil tem `max_files` 40, `max_linhas` 5000, `max_bytes` 204800, os 11 nomes da emenda §2, extensões com `.pdf`, `.png`, `.csv`, `.map`, sem `.md`. Escreva `codeant-app.json` à mão.
- [ ] **Step 6: Commit** o script e o teste: `feat(expxdev): homologacao da CLI do CodeAnt grava o perfil da versao`; o perfil gerado, em commit próprio: `chore(expxdev): perfil da codeant-cli 0.5.14` (corpo: o comando do Step 5); o do app: `feat(expxdev): perfil do app do CodeAnt`.

### Task B2: predicado, medidas e limites no módulo; o leitor emite os números

**Files:**
- Modify: `nucleo/scripts/expx-limites.mjs`, `nucleo/scripts/expx-fatiamento.mjs`
- Create: `src/teste/conformidade.ts` — `arquivosDoCaso(caso: Caso): Map<string, Buffer | null>` (`null` = apagado; `Caso` = `"limite40" | "limite41" | "pulos" | "pulos-uncommitted"`) (os geradores `funcao`, `linhas` e `bytes` do `conformidade.sh`, em TypeScript) e `respostaDoCaso(caso: Caso): Buffer` (o JSON da #60, cru); a Task C2 os reusa
- Test: `src/nucleo/expx-limites.test.ts`, `src/nucleo/conformidade-codeant.test.ts` (novo), `src/nucleo/expx-fatiamento.test.ts`, `src/cli/init.test.ts`

**Interfaces:**
- Consumes: os perfis da Task B1, lidos por `new URL("./perfis/…", import.meta.url)`.
- Produces:
  - `homologadas(): string[]` (versões com perfil, ordenadas); `perfilCli(versao: string): PerfilCli | undefined`; `perfilApp(): PerfilApp`. Ao carregar, o perfil é validado por inteiro (campos, tipos, manifesto não vazio com sha256 hex); perfil inválido lança erro com o campo, e a revisão o trata como `indisponivel:integridade`.
  - `limites(): {perfil_cli: string, l1_arquivos: number, l2_linhas: number, l2_bytes: number, l3_arquivos: number}` — lança erro se as homologadas divergem em números, exclusões ou motivos (decisões).
  - `revisavel(caminho: string, perfil: PerfilCli): boolean` — `path.posix.basename` fora de `nomes`; `path.posix.extname(...).toLowerCase()` fora de `extensoes`; sem sufixo de `sufixos` (com a comparação que a Task B1 leu na fonte).
  - `medir(conteudo: Buffer): {bytes: number, linhas: number}` — `t = conteudo.toString("utf8")`; `bytes = Buffer.byteLength(t, "utf8")`, `linhas = t.split("\n").length`.
  - `motivoAceito(reason: string, perfil: PerfilCli): boolean`.
  - O leitor emite `EXPX_PERFIL_CLI=codeant-cli@0.5.14`, `EXPX_L1_ARQUIVOS=40`, `EXPX_L2_LINHAS=5000`, `EXPX_L2_BYTES=204800`, `EXPX_L3_ARQUIVOS=100`, e `limites` no json.

- [ ] **Step 1: Write the failing tests:**
  - `expx-limites.test.ts`: `limites()` = 40/5000/204800/100; `medir`: `"a\nb"` → 2 linhas, `"a\nb\n"` → 3, `""` → 1 linha e 0 bytes, `Buffer.from([0xff])` → 3 bytes (U+FFFD), `"é"` → 2 bytes; `revisavel`: `notas.md`, `.png` (só extensão, sem nome: `extname` vazio), `a.PNG.md`, `dados.bin2` true; `logo.PNG`, `manual.pdf`, `dist/app.min.js`, `x/package-lock.json`, `go.sum` false; `package-lock.json.backup` true.
  - `conformidade-codeant.test.ts` (Review Focus 2 e 3): recria em memória os arquivos dos quatro casos com `arquivosDoCaso` e, para cada arquivo dos quatro JSONs da #60: em `reviewed_files` → `revisavel` e dentro de 5000/204800; `binary/generated` → não `revisavel`; `deleted` → `null` no caso; `excluded by pattern` → casa `^gerado/`; `too large (…)` → `revisavel` e fora do limite pela `medir`; `exceeded 40-file limit` → `revisavel`, dentro do limite e além do 40º em ordem; todo `reason` passa em `motivoAceito`; `max_files` = 40 nos quatro. Os bytes e linhas de `linhas-5000.js` (132.785 B) e de `bytes-204800.js` batem com o LEIAME.
  - `expx-fatiamento.test.ts`: `sem arquivo: emite os números do perfil` (as cinco linhas acima).
  - `init.test.ts`: `init copia expx-limites.mjs e perfis/ para o plugin` (o leitor e a revisão os importam; o `files` do `package.json` já leva `nucleo`).
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-limites.test.ts src/nucleo/conformidade-codeant.test.ts src/nucleo/expx-fatiamento.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as funções e a saída do leitor.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): predicado de revisavel e medidas da CLI no nucleo`.

### Task B3: `verificar-fatiamento.sh` só com L2 e L3

**Files:**
- Modify: `scripts/verificar-fatiamento.sh` (reescrito; ficam `uso`, `merge-base`, as listas em arquivo temporário, o `-z` e o tratamento de submódulo e de nome com quebra)
- Modify: `src/nucleo/fatiamento.test.ts` (saem F2, F3, F4, F2c, `FATIA_*`, merge e clone raso; ficam e se adaptam os casos de git que falha, submódulo, nome com quebra, metacaractere de pathspec, mudança de tipo e uso)
- Modify: `.github/workflows/ci.yml:81`

**Interfaces:**
- Produces: `bash scripts/verificar-fatiamento.sh [--excluir-da-revisao <padrao>]... <base> <head>`. Saída 0 sem violação, 1 com, 2 uso ou medida impossível (inclusive `FATIA_*` no ambiente, padrão fora da gramática, `iconv` ausente, `node` ausente quando precisa). Linhas: `VIOLACAO L3: a PR altera <n> arquivos, todos contados (limite 100 do app do CodeAnt); divida a PR`; `VIOLACAO L2: <arquivo> tem <l> linhas e <b> bytes pela conta da CLI (limite 5000 linhas e 204800 bytes); uma task anterior o divide`; resumo `fatiamento: <v> violacao(oes); PR com <n> arquivo(s)`.
- Constantes no topo, uma por linha, conferidas por teste contra o módulo: `MAX_ARQUIVOS_PR=100`, `MAX_LINHAS=5000`, `MAX_BYTES=204800`, `NOMES_EXCLUIDOS=(…)`, `EXTENSOES_EXCLUIDAS=(…)`, `SUFIXOS_EXCLUIDOS=(…)`, `EXCLUIDOS_DO_NUCLEO=(docs/sprintx/ docs/entregas/ docs/eventos/)`.
- L3: entradas de `git diff --name-only -z -M <mb> <head>`, sem exclusão. L2: entradas A/M/R/T de `--name-status -z -M`, no caminho novo; fora: submódulo, prefixo do núcleo ou de argumento, `revisavel` falso (minúsculas por `tr`, compatível com bash 3.2). Medida no blob do head (`git cat-file`) e, quando o caminho é arquivo regular no checkout e o `git hash-object` dele é esse blob, também no checkout; vale o maior. Linhas = número de `\n` + 1; bytes conforme as decisões (UTF-8 inválido: `node -e`).

- [ ] **Step 1: Write the failing tests** (helpers `repo`, `escreve`, `commita`, `verifica` de hoje):
  - `L3: 100 arquivos passam, 101 reprovam, contando lock, docs/entregas e fixtures/candidatos`.
  - `L3: renomeação conta 1`.
  - `sem limite de linhas: PR com 3.000 linhas em 5 arquivos e commit de 2.000 passam`.
  - `L2: 5.000 linhas sem quebra final passa; 5.000 com quebra final (wc -l 5000) reprova; 5.001 reprova` (Review Focus 2).
  - `L2: 204.800 bytes passa; 204.801 reprova`.
  - `L2: checkout CRLF mede o maior` — `core.autocrlf=true` no repositório de teste, arquivo com 204.000 bytes no blob e mais de 204.800 no checkout, → reprova; com o arquivo do checkout editado depois do commit (outro blob), mede só o blob e passa (Review Focus 1).
  - `L2: UTF-8 inválido é medido como a CLI` — 70.000 bytes crus com 68.000 bytes `0xff` (a CLI conta mais de 204.800) reprova; 1.000 bytes com um `0xff` passa; a medida bate com `medir`.
  - `L2 fora: lock, .png, .pdf, .min.js, docs/sprintx/ e --excluir-da-revisao '^gerado/'`; `L2 dentro: .md, dados.bin2 (binário com extensão fora da lista)` (Review Focus 3).
  - `L2: arquivo apagado não é medido; arquivo só renomeado é medido no caminho novo`.
  - `--excluir-da-revisao fora da gramática ('^gerado', '(a|b)/') sai 2`.
  - `FATIA_MAX_LINHAS_PR no ambiente sai 2 com a mensagem exata`.
  - `as constantes do verificador são as do perfil` — lê as linhas do script e compara com `limites()`, `perfilCli("0.5.14").excluidos` e `EXCLUIDOS_DO_NUCLEO`.
  - `o predicado do verificador é o do módulo` — tabela de caminhos (`a.PNG`, `.png`, `..png`, `a.`, `x.min.js`, `x.MIN.JS`, `a.tar.gz`, `Thumbs.db`, `d/go.sum`, `notas.md`) num commit; os que o verificador mede em L2 (todos acima do limite) são exatamente os de `revisavel` verdadeiro.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/fatiamento.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** o script e mude o `ci.yml` para `bash scripts/verificar-fatiamento.sh --excluir-da-revisao '^fixtures/candidatos/' "origin/$BASE_REF" "$HEAD_SHA"`.
- [ ] **Step 4: Run** `npm run typecheck && npm test` — Expected: verde.
- [ ] **Step 5: Run** `bash scripts/verificar-fatiamento.sh --excluir-da-revisao '^fixtures/candidatos/' origin/main HEAD` — Expected: exit 0. E, uma vez, a lista do repositório acima de L2 fora de `fixtures/candidatos/` (um laço `git ls-files` com a mesma conta): Expected: só arquivos não revisáveis (`package-lock.json`); anote no PR qualquer outro.
- [ ] **Step 6: Commit** `feat(expxdev): verificador de fatiamento mede so L2 e L3, fixos`.

### Task B4: contrato `expx-fatiamento` v3

**Files:**
- Modify: `docs/contrato/CONTRATO-expx-fatiamento.md`, `docs/contrato/CONVENCOES.md` (:160, linha do índice)

- [ ] **Step 1:** Reescreva conforme a emenda §8 ("Contratos"): tabela de fatos com fonte (§2); L1, L2, L3 no lugar de F2, F2c, F3 e F4; o predicado de revisável e os dois portões; o PR de planejamento (§7); F1, F5 (item 1: "dentro de L3") e F6 sem o movimento mecânico; o painel tira da revisão do app, não da conta dos 100; "Configuração por projeto" aponta para a §5.2; "Entrega por sprint" sem PRs empilhadas; "Como consumir o leitor" e "Como verificar" com `--excluir-da-revisao` e sem `FATIA_*`; os perfis e a homologação (`scripts/homologar-codeant-cli.mjs`); `FATIA_*` reservados; histórico. Sai "Capacidade × legibilidade".
- [ ] **Step 2: Run** `npm test` e o verificador do Step 5 da B3 — Expected: verde, exit 0.
- [ ] **Step 3: Commit** `docs(expxdev): contrato expx-fatiamento v3 com os limites do CodeAnt`. Abra a PR 4.
