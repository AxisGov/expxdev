# Limites do CodeAnt, fixos — plano de implementação (mergex), parte 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar à mergex a parte dela da emenda "limites do CodeAnt, fixos" (passo 3 da §11): a cópia do núcleo regerada de expxdev 4060f8d (release `cli-4060f8d`), o `fatiamento-da-pr.sh` espelhando o verificador só com L2/L3, o E7 e o `leitor-do-projeto.sh` sem `FATIA_*`, o PR de planejamento (E0, E2, E7, E8, E9) e as emendas aos planos antigos da mergex, com a volta ao B1.

**Architecture:**
- **O núcleo é uma pasta, não um arquivo.** O leitor v2 importa `expx-limites.mjs`, que lê `perfis/`. A cópia dos testes, o gerador dela, a montagem nos testes e a conferência "o commit versiona outro leitor" passam a tratar `nucleo/scripts/` inteira.
- **O espelho continua byte a byte.** `fatiamento-da-pr.sh` = cabeçalho da mergex + corpo de `scripts/verificar-fatiamento.sh` do expxdev 660bf9a (o mesmo em 4060f8d), a partir de `set -uo pipefail`, com `Corpo-sha256`.
- **O E7 não exporta limite nenhum.** O leitor dá `EXPX_*`; o E7 transforma `EXPX_EXCLUIR_DA_REVISAO` em argumentos `--excluir-da-revisao` e, na entrega de planejamento, passa `--planejamento`.
- **Entrega de planejamento num leitor só.** Um script novo, `entrega-de-planejamento.sh`, é o único que lê `sprint_atual` e `prs` para dizer se a entrega é a de planejamento; E2, E7, E8 e E9 o consomem.

**Tech Stack:** bash compatível com 3.2, jq, git ≥ 2.36, node ≥ 20.19 (só quando o núcleo é chamado), `gh` nos testes com falso.

**Spec:** `docs/superpowers/specs/2026-10-19-limites-do-codeant-emenda.md` do expxdev (§3, §4, §5, §7, §8 "mergex", §9, §10, §11 passo 3). Desenho de base: `docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md`. Planos que esta emenda altera: `2026-10-18-mergex-revisao-por-task-e-merge-automatico.md` e `-parte-2.md`. Plano do expxdev já executado: `2026-10-19-expxdev-limites-do-codeant.md` e `-parte-2.md`.

**Continua em:** `2026-10-20-mergex-limites-do-codeant-parte-2.md` (emendas aos planos antigos, a volta ao B1, dependências e pontos para o usuário).

**Estado de partida:**
- expxdev `origin/main` 4060f8d (merge da AxisGov/expxdev#69 sobre e772f88). A release `cli-e772f88` (0.7.0) foi publicada e conferida; a `cli-4060f8d` é a que a cópia acompanha — quem a libera é o usuário, o plano só confere que ela existe (L1.1). Nenhuma das duas liberada aos projetos. Em `nucleo/scripts/`: `expx-fatiamento.mjs` (254 linhas), `expx-limites.mjs` (300), `expx-revisao.mjs` (420), `perfis/codeant-cli-0.5.14.json` (16.948 B) e `perfis/codeant-app.json`. `scripts/verificar-fatiamento.sh` (201 linhas; último commit 660bf9a, com `--planejamento`), corpo com sha256 `586a3cae512ae6e13b218f3b0cd0e0fb9f42470bdf01165090cac726bff89019`.
- mergex `origin/main` d2da99d (#32 a #36 mergeados). Peças a mudar: `.claude/skills/mergex/scripts/fatiamento-da-pr.sh` (239 linhas, cabeçalho :1-31, origem 5260920), `.claude/skills/mergex/scripts/leitor-do-projeto.sh` (108), `scripts/ci/atualizar-nucleo-expx.sh` (41, lista fixa de dois arquivos em :23), `scripts/ci/fixtures/candidatos/expx-nucleo/` (de expxdev 8653468, só os dois `.mjs`), `references/07-abertura-pr.md` (Passo 1.5 :62-167; "Quando falha" :313-331), `scripts/ci/test-fatiamento-e7.sh` (505), `scripts/ci/test-leitor-do-projeto.sh` (254), `scripts/ci/test-nucleo-expx.sh` (83), `.github/workflows/ci.yml` (140).
- Nenhum arquivo da mergex passa de 150 KB nem de 4.000 linhas: L2 não reprova nada hoje.
- AxisGov/expxdev#69 (`feat/evidencia-guarda-issues`) **mergeada em 4060f8d**: a evidência continua `expx_revisao: 2`, mas `ok`/`achados` exigem `head`, `chamada.issues` (cruas) e `chamada.stdout_sha256`; o `conferir` deriva os achados das `issues` e reprova `evidencia-invalida:achados|head|base_commit`. Só `expx-revisao.mjs` mudou entre e772f88 e 4060f8d: o leitor, `expx-limites.mjs`, os perfis e o verificador são os mesmos.

## Decisões incorporadas

*Da emenda e do usuário, sem reabrir:* L2 (5.000 linhas e 204.800 bytes, pela conta da CLI, maior de blob e checkout) e L3 (100 arquivos, todos); sem limite de linhas; `FATIA_*` falham em toda peça, para sempre, com a mensagem exata; `excluir_da_revisao` só de classes de artefato, e só por argumento; PR de planejamento com só `^docs/(sprintx|entregas|eventos)/`, sem L3, merge sempre do desenvolvedor, registrado em `prs` como primeiro item `{sprint: planejamento, …}`. No E7, roda o leitor **instalado** e sai 3 se o commit versiona leitor diferente; no merge automático (M1/M2) e na D3, o leitor é **executado da árvore da main**.

*Decisões técnicas deste plano (reversíveis):*
- **A cópia é a pasta `nucleo/scripts/` inteira** de uma revisão do expxdev (`git archive <rev> nucleo/scripts`), não uma lista de arquivos: o que o núcleo passar a importar vem junto sem mudar o gerador. O `ORIGEM` ganha uma linha por arquivo com o caminho relativo (`perfis/codeant-cli-0.5.14.json`).
- **"O commit versiona outro leitor" vale para a pasta.** Com `--rev`, se o commit tem `.expx/marketplace/plugins/expx/nucleo/scripts/`, o conjunto `(caminho, blob)` de `git ls-tree -r` no commit tem de ser igual ao conjunto `(caminho, git hash-object)` dos arquivos regulares instalados nessa pasta; qualquer diferença (arquivo a mais, a menos, outro conteúdo) é saída 3.
- **Núcleo antigo instalado é 3, não 1.** Sem `expx-limites.mjs` ou sem `perfis/` ao lado do leitor, o `leitor-do-projeto.sh` sai 3 ("atualize o expx") antes de chamar node: o leitor v1 diria "versão desconhecida", que o E7 mostraria como arquivo inválido.
- **`FATIA_*` no ambiente:** `leitor-do-projeto.sh` sai **1** (configuração não lida), com `leitor-do-projeto: <mensagem da emenda>` por variável. Ordem: argumentos (64) → `FATIA_*` (1) → raiz e revisão (2) → arquivo, núcleo e node; com ou sem arquivo e sem precisar de node; o espelho sai 2 (é o corpo do expxdev). No E7, os dois viram saída 2 do bloco ("não mediu").
- **Saída padrão do helper sem arquivo** (sem node), na ordem do leitor: `EXPX_REVISAO_POR_TASK=se_disponivel`, `EXPX_ENTREGA=por_trabalho`, `EXPX_MERGE_AUTOMATICO=nao`, `EXPX_CAMINHOS_PROTEGIDOS=` (vazio de propósito, como hoje), `EXPX_REVISOR_BOT=`, `EXPX_EXCLUIR_DA_REVISAO=`, `EXPX_FATIAMENTO_ORIGEM=padrao`, `EXPX_PERFIL_CLI=codeant-cli@0.5.14`, `EXPX_L1_ARQUIVOS=40`, `EXPX_L2_LINHAS=5000`, `EXPX_L2_BYTES=204800`, `EXPX_L3_ARQUIVOS=100`. O teste que compara com o leitor do núcleo (hoje :53-66 de `test-leitor-do-projeto.sh`) garante que os números são os do perfil.
- **Chaves exigidas do leitor** (hoje :102-105): as onze `EXPX_*` acima menos `EXPX_FATIAMENTO_ORIGEM` (conferida à parte, :101); e saída do leitor com qualquer linha `FATIA_` é 3 (leitor antigo).
- **A exclusão do projeto vira argumento no E7:** `EXPX_EXCLUIR_DA_REVISAO` dividido em `|` (a gramática de pasta literal não admite `|`, `*`, `?`, `[`), sem expansão de glob e sem quebrar em espaço; cada parte vira `--excluir-da-revisao <parte>`. Padrão vazio não gera argumento.
- **Marca da entrega de planejamento:** `sprint_atual: planejamento` e `prs` cujo primeiro item tem `sprint: planejamento`. O E0 grava as duas; `entrega-de-planejamento.sh` exige as duas coerentes (uma sem a outra é ilegível, saída 2). As chaves e os enums de `prs` são os da Task S1 (parte 2 do plano antigo); este plano antecipa só o item de planejamento.
- **E2 na entrega de planejamento:** V1, V2, V3 e V11 `n/a` com o motivo `planejamento: nenhuma task executada`; V9 pelo `portao-v9.sh --planejamento`, que troca o conjunto aceito por `^docs/(sprintx|entregas|eventos)/` (linha `fora_do_planejamento<TAB><caminho>`, com a origem de renomeação, porque a V9 já lê `--no-renames`); V4–V8 e V10 como hoje. A V12, quando existir, também `n/a`.
- **Numeração de decisões:** DM-238 a DM-256 continuam reservadas aos blocos do plano antigo; esta emenda usa **DM-257** (espelho L2/L3 e exclusão por argumento), **DM-258** (o núcleo como pasta no helper e na cópia), **DM-259** (PR de planejamento: marca, E0, E2, E7, E8) e **DM-260** (E9 e o PR de planejamento). DM-229, DM-235 e DM-236 ficam como histórico; as novas dizem o que substituem.

## Global Constraints

- **Fatiamento destas PRs.** Na mergex o fatiamento é medido localmente pelo `fatiamento-da-pr.sh` do checkout da branch (não há job de fatiamento no CI da mergex). O bloco **L0** é medido pelo espelho **antigo**: `bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh origin/main HEAD` (PR ≤ 400 linhas e 20 arquivos, commit ≤ 300 linhas, F4; o padrão do script já tira `fixtures/candidatos/`). O bloco **L1 é a PR que troca o espelho** e é medida por ele mesmo, como a B do expxdev: daí em diante (L1, P e todos os blocos do plano antigo) vale `bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh --excluir-da-revisao '^scripts/ci/fixtures/candidatos/' origin/main HEAD` (PR ≤ 100 arquivos, todos contados; arquivo revisável ≤ 5.000 linhas e 204.800 bytes). Rode-o a cada commit e antes de abrir a PR, sem nenhuma `FATIA_*` no shell; saída ≠ 0 = refatie.
- Cada bloco é uma PR mergeável sozinha, na ordem L0 → L1 → P → B1 (volta), com os checks exigidos verdes: `contract`, `ubuntu-latest / hooks`, `r1 / reconciliacao-base`.
- Mensagens exatas, com acento (iguais ao núcleo): `` `FATIA_<nome>` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente ``.
- Constantes: L2 **5000** linhas e **204800** bytes; L3 **100** arquivos; perfil `codeant-cli@0.5.14`. Nada de limite, exclusão ou caminho vem do ambiente.
- A cópia do núcleo é artefato gerado: commit próprio, com o comando no corpo, e nunca editada à mão; achado sobre ela se corrige no expxdev.
- O consumo do leitor continua `fatia="$(…)" || <falha>; set -a; eval "$fatia"; set +a` (os testes de :420-431 de `test-fatiamento-e7.sh` ficam).
- A mergex nunca lê nem escreve a evidência de revisão por conta própria: a V12 e o E1 consomem o `conferir` do núcleo (parte 2).
- Nenhum nome de produto de review no texto da skill (DM-197), salvo onde ele já está (07-abertura-pr.md cita o CodeAnt como fato da ferramenta).
- Commits `<tipo>(mergex): <frase sem acento>`; corpo do commit da cópia com o comando que a gerou.

## Review Focus

1. **`FATIA_*` esquecida no shell do desenvolvedor** (inclusive definida e vazia, `FATIA_IGNORAR=`) quando o E7 roda: o bloco do Passo 1.5 sai 2, mostra a mensagem exata, não grava o estado da base e não abre o PR; nunca mede ignorando a variável. Testes nas Tasks L1.2 (helper), L1.3 (espelho) e L1.4 (bloco).
2. **Projeto com `.expx/fatiamento.json` v2 e núcleo instalado antigo** (só `expx-fatiamento.mjs`, sem `expx-limites.mjs` ou `perfis/`): saída 3 "atualize o expx", nunca "arquivo inválido". Teste na Task L1.2.
3. **Commit que versiona o núcleo com só o perfil diferente do instalado** (ou um arquivo a mais em `perfis/`): saída 3 com `--rev`. Teste na Task L1.2.
4. **PR de planejamento que renomeia `src/a.ts` para `docs/sprintx/...`**: a origem conta; o E7 recusa e a V9 de planejamento reprova. Testes na Task P2.
5. **Padrão de exclusão com espaço** (`^dados de teste/`) passado pelo E7: chega como um argumento só e tira a pasta de L2. Testes nas Tasks L1.3 (espelho) e L1.4 (bloco).

## Os blocos

| PR | Entrega | Arquivos (est.) | Medido por | Depende de |
|---|---|---|---|---|
| L0 | gerador e testes tratam o núcleo como pasta (cópia ainda a de 8653468) | 4 | espelho antigo (400/20/300) | — |
| L1 | cópia regerada de 4060f8d; `leitor-do-projeto.sh` v2; espelho L2/L3; E7 Passo 1.5; DM-257, DM-258 | ~16 | espelho novo (troca) | L0 |
| P | PR de planejamento: `entrega-de-planejamento.sh`, schema, E0, E2 (V9), E7, E8, E9; DM-259, DM-260 | ~17 | L2/L3 | L1 |
| B1… | volta ao plano antigo, com as emendas da parte 2 | — | L2/L3 | P (a #69 já vem na cópia da L1) |

---

## Bloco L0 (PR 1) — o núcleo como pasta

### Task L0: gerador, `ORIGEM` e montagem nos testes

**Files:**
- Modify: `scripts/ci/atualizar-nucleo-expx.sh` (:23 `arquivos=`, :29-40)
- Modify: `scripts/ci/test-nucleo-expx.sh` (:79 lista fixa; caso 4 :115-124; casos novos)
- Modify: `scripts/ci/test-leitor-do-projeto.sh` (:25-26) e `scripts/ci/test-fatiamento-e7.sh` (:438-439): montam a cópia inteira

**Interfaces:**
- Produces: `atualizar-nucleo-expx.sh <expxdev_raiz> <rev>` (mesmas saídas: 0, 64, 1) extrai `git -C <expx> archive <sha> nucleo/scripts` para um temporário; sem nenhum arquivo, sai 1. Grava em `<destino>.novo`; com tudo gravado, renomeia a cópia atual para `<destino>.velho`, renomeia `.novo` para `<destino>` e só então apaga `.velho`; se a segunda renomeação falhar, devolve `.velho` ao lugar e sai 1. Nenhuma falha deixa o destino vazio. `ORIGEM`: `expxdev <sha>` e uma linha `<sha256>  <caminho relativo>` por arquivo, em ordem de `LC_ALL=C sort`.
- Produces: `monta_nucleo <destino>` em cada um dos dois testes (função local, sem biblioteca nova): copia todo arquivo da cópia menos `ORIGEM`, preservando subpastas, com `tr -d '\r'` por arquivo (como hoje).
- `test-nucleo-expx.sh` passa a exigir no `ORIGEM` só `expx-fatiamento.mjs` e `expx-revisao.mjs` (a cópia de 8653468 ainda não tem os outros); L1 aumenta a lista.

- [ ] **Step 1: Write the failing tests** em `test-nucleo-expx.sh`:
  - `atualizar copia subpastas do nucleo` — expxdev falso com `nucleo/scripts/a.mjs` e `nucleo/scripts/perfis/p.json` → sai 0, `perfis/p.json` copiado, `ORIGEM` com a linha `<sha>  perfis/p.json`;
  - `atualizar apaga o que saiu do nucleo` — destino com `velho.mjs` que a revisão não tem → ausente depois;
  - `atualizar sem nucleo/scripts na revisao sai 1 e nao toca a copia`;
  - `ORIGEM lista todo arquivo da copia, e so eles` (arquivo na pasta sem linha no `ORIGEM`, ou linha sem arquivo, reprova);
  - o caso 4 de hoje (destino é arquivo → 1) fica.
- [ ] **Step 2: Run** `bash scripts/ci/test-nucleo-expx.sh` — Expected: FAIL nos quatro novos.
- [ ] **Step 3: Implement** o gerador e `monta_nucleo` nos dois testes. Não rode o gerador contra o expxdev: a cópia fica a de 8653468.
- [ ] **Step 4: Run** `bash scripts/ci/test-nucleo-expx.sh && bash scripts/ci/test-leitor-do-projeto.sh && bash scripts/ci/test-fatiamento-e7.sh` — Expected: `0 falha(s)` nos três.
- [ ] **Step 5: Run** `bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh origin/main HEAD` — Expected: exit 0 (limites antigos).
- [ ] **Step 6: Commit** `test(mergex): copia do nucleo do expx e a pasta nucleo/scripts inteira`. Abra a PR 1.

## Bloco L1 (PR 2) — a troca: cópia, helper, espelho e E7

Esta é a PR que troca o espelho; ela e as seguintes valem L2/L3 (Global Constraints). As quatro tasks vão juntas porque nenhuma fica verde sozinha: o leitor v2 recusa a configuração v1 dos testes de hoje, o helper de hoje exige `FATIA_*` do leitor, e o espelho novo sai 2 com as `FATIA_*` que o E7 de hoje exporta.

### Task L1.1: a cópia regerada de 4060f8d

**Files:**
- Regenerate: `scripts/ci/fixtures/candidatos/expx-nucleo/` (`expx-fatiamento.mjs`, `expx-limites.mjs`, `expx-revisao.mjs`, `perfis/codeant-cli-0.5.14.json`, `perfis/codeant-app.json`, `ORIGEM`)
- Modify: `scripts/ci/test-nucleo-expx.sh` (lista exigida; casos 2 e 3)

**Interfaces:**
- Produces: a cópia que as Tasks L1.2–L1.4, P e B1 montam. Lista exigida no `ORIGEM`: os cinco arquivos acima.

- [ ] **Step 1: Write the failing tests**: lista exigida com os cinco; caso 2 vira `a copia fica fora de L2 do proprio repositorio` (espelho novo com `--excluir-da-revisao '^scripts/ci/fixtures/candidatos/'` num commit só com a cópia: saída 0 e resumo `PR com 6 arquivo(s)`); caso 3 vira `node roda a copia: padroes com os numeros do perfil` (saída contém `EXPX_FATIAMENTO_ORIGEM=padrao` e `EXPX_L2_BYTES=204800`, nenhuma linha `FATIA_`); novo `com EXPXDEV_RAIZ, a copia e a arvore nucleo/scripts da revisao do ORIGEM` (blob a blob; pulado com `passa` sem a variável).
- [ ] **Step 2: Run** `bash scripts/ci/test-nucleo-expx.sh` — Expected: FAIL (cópia antiga; o caso 2 ainda falha até a Task L1.4).
- [ ] **Step 3: Generate**: confira antes `gh release view cli-4060f8d -R AxisGov/expxdev` (Expected: a release existe; se não, pare e relate — o plano não a publica). Então `bash scripts/ci/atualizar-nucleo-expx.sh F:/Projetos/expxdev 4060f8d`. Commit só da cópia: `test(mergex): copia do nucleo do expx de 4060f8d` (corpo: o comando).
- [ ] **Step 4:** siga para a L1.2; o teste fecha verde na L1.4.

### Task L1.2: `leitor-do-projeto.sh` v2

**Files:**
- Modify: `.claude/skills/mergex/scripts/leitor-do-projeto.sh` (cabeçalho :3-21; padrões :57-70; :72-78; :101-108)
- Modify: `scripts/ci/test-leitor-do-projeto.sh`

**Interfaces:**
- Consumes: a cópia da L1.1.
- Produces: mesma linha de comando e mesmas saídas (0, 1, 2, 3, 64), com as decisões deste plano: `FATIA_*` → 1 antes de tudo; saída padrão sem arquivo (lista das decisões); `expx-limites.mjs` ou `perfis/` ausentes ao lado do leitor → 3; a conferência do commit sobre a pasta inteira → 3; saída do leitor com `FATIA_` → 3; chaves exigidas = as `EXPX_*` das decisões.
- Consumers: Task L1.4 (E7), Task P2 (nada novo), B1 (`EXPX_REVISAO_POR_TASK`), e a D3/M1 com a opção da parte 2.

- [ ] **Step 1: Write the failing tests** (a fixture `conselho` passa a ser o exemplo da emenda §5, com `excluir_da_revisao` `^fixtures/candidatos/`):
  - `sem arquivo: padroes sem node, sem FATIA_ e com EXPX_L2_BYTES=204800`;
  - `os padroes do helper sao os do leitor do nucleo` (o caso de :53-66 fica, agora com doze chaves; só `EXPX_CAMINHOS_PROTEGIDOS` é exceção);
  - `arquivo v2 valido: repassa o leitor` (`EXPX_EXCLUIR_DA_REVISAO=^fixtures/candidatos/`, `EXPX_ENTREGA=por_sprint`, `EXPX_FATIAMENTO_ORIGEM=projeto`);
  - `versao 1: sai 1, stdout vazio, stderr com "migre para 2" e a chave legibilidade`;
  - `FATIA_MAX_LINHAS_PR no ambiente: sai 1 com a mensagem exata, sem arquivo e sem node`; `FATIA_IGNORAR vazia tambem`; `com arquivo valido tambem` (Review Focus 1);
  - `nucleo sem expx-limites.mjs: sai 3 e cita expx update`; `nucleo sem perfis/: sai 3` (Review Focus 2);
  - `--rev com perfil do commit diferente do instalado: sai 3`; `--rev com um arquivo a mais em perfis/ no commit: sai 3`; `--rev com a pasta igual a instalada: le` (Review Focus 3);
  - `leitor que imprime FATIA_: sai 3` (substitui o caso de :171-181, que esperava `FATIA_MAX_LINHAS_PR=1`);
  - `--rev le o arquivo do commit, nao o do disco` (commit com `^a/`, disco com `^b/` → `EXPX_EXCLUIR_DA_REVISAO=^a/`);
  - `consumo seguro exporta para processo filho` (o filho imprime `EXPX_EXCLUIR_DA_REVISAO`).
  Os demais casos de hoje (64, 2, link quebrado, pasta e gitlink no lugar do arquivo, `.expx` arquivo, leitor que não carrega, sem permissão) ficam, só com a fixture v2.
- [ ] **Step 2: Run** `bash scripts/ci/test-leitor-do-projeto.sh` — Expected: FAIL nos novos e nos que esperavam `FATIA_*`.
- [ ] **Step 3: Implement** (nenhum `eval` dentro do helper; a conferência de `FATIA_*` por `compgen -e`, como o verificador; a da pasta com `git ls-tree -r --full-tree <commit> -- <pasta>` contra `find <pasta> -type f` + `git hash-object`).
- [ ] **Step 4: Run** — Expected: `0 falha(s)`.
- [ ] **Step 5: Commit** `feat(mergex): leitor-do-projeto le o nucleo v2, sem FATIA, e confere a pasta do nucleo`.

### Task L1.3: `fatiamento-da-pr.sh` espelha o verificador L2/L3

**Files:**
- Modify: `.claude/skills/mergex/scripts/fatiamento-da-pr.sh` (cabeçalho :1-31 reescrito; corpo :32-239 trocado pelo corpo de `scripts/verificar-fatiamento.sh` de 4060f8d, :8-201, igual ao de e772f88)
- Modify: `scripts/ci/test-fatiamento-e7.sh` (identidade :19-35 e contrato :37-79 ficam, menos :45-55 (o `FATIA_IGNORAR` montado pelo E7), que sai na L1.4; saem os casos de script de :80-264, menos `falha_ao_medir` e `sem_objeto` de :180-190, reaproveitados)

**Interfaces:**
- Produces: `fatiamento-da-pr.sh [--planejamento] [--excluir-da-revisao <padrao>]... <base> <head>`; saídas 0/1/2 do verificador. Cabeçalho: o que o script mede (L2 e L3, `--planejamento`), `COPIA, nao dependencia` (o teste de :20 procura), `# Origem: AxisGov/expxdev 660bf9a scripts/verificar-fatiamento.sh` (o commit que mudou o arquivo por último; igual em 4060f8d) e `# Corpo-sha256: 586a3cae512ae6e13b218f3b0cd0e0fb9f42470bdf01165090cac726bff89019`. Sem lista de variáveis.

- [ ] **Step 1: Write the failing tests** (helpers `g`, `passa`, `quebra` de hoje; repositórios temporários):
  - `L3: 100 arquivos passam; 101 reprovam contando package-lock.json, docs/entregas/ e fixtures/candidatos/` (saída contém `VIOLACAO L3`);
  - `L3: renomeacao conta 1`;
  - `sem limite de linhas: 3.000 linhas em 5 arquivos passam`;
  - `L2: 5.000 linhas com quebra final reprova; 4.999 com quebra final passa`;
  - `L2 fora com --excluir-da-revisao '^dados de teste/'` (pasta com espaço; Review Focus 5);
  - `--excluir-da-revisao fora da gramatica sai 2`;
  - `FATIA_EXCECAO= vazia no ambiente: sai 2 com a mensagem exata`;
  - `--planejamento: 150 arquivos em docs/sprintx/ passam (L3 nao se aplica)`; `--planejamento: src/a.ts reprova (VIOLACAO planejamento)`; `--planejamento: renomeacao de src/a.ts para docs/sprintx/a.ts reprova pela origem` (Review Focus 4);
  - `objeto ausente no head: sai 2` (o `falha_ao_medir` de :180-190, com o blob de um arquivo revisável).
- [ ] **Step 2: Run** `bash scripts/ci/test-fatiamento-e7.sh` — Expected: FAIL nos novos e no `Corpo-sha256`.
- [ ] **Step 3: Implement**: copie o corpo (`git -C F:/Projetos/expxdev show 4060f8d:scripts/verificar-fatiamento.sh | sed -n '/^set -uo pipefail$/,$p'`), escreva o cabeçalho e confira o sha256. Com `EXPXDEV_RAIZ=F:/Projetos/expxdev`, o caso de :30-35 compara com o arquivo de lá.
- [ ] **Step 4: Run** `EXPXDEV_RAIZ=F:/Projetos/expxdev bash scripts/ci/test-fatiamento-e7.sh` — Expected: as únicas linhas `FALHA` são as dos casos do bloco do E7 (os que a L1.4 reescreve); nenhuma de identidade nem de script.
- [ ] **Step 5: Commit** `feat(mergex): fatiamento-da-pr espelha o verificador so com L2 e L3`.

### Task L1.4: o Passo 1.5 do E7 com os limites do CodeAnt

**Files:**
- Modify: `.claude/skills/mergex/references/07-abertura-pr.md`: Passo 1.5 (:64-65, o que mede; bloco :115-120; texto :124-167); "Quando falha" :320-322
- Modify: `scripts/ci/test-fatiamento-e7.sh` (casos do bloco extraído, :388-505)
- Modify: `.claude/skills/mergex/decisoes/revisao-por-task-e-entrega-por-sprint.md` (seção nova "Limites do CodeAnt, fixos" com DM-257 e DM-258)

**Interfaces:**
- Consumes: `leitor-do-projeto.sh --rev "$publicado"` (L1.2); `fatiamento-da-pr.sh` (L1.3). O `--planejamento` entra na Task P3.
- Produces: o bloco, depois de `base=` (:114), nesta forma (o teste a procura):
  - `fatia="$(bash .claude/skills/mergex/scripts/leitor-do-projeto.sh --rev "$publicado")" || { echo "configuração do projeto (.expx/fatiamento.json) não lida: o E7 não mede nem abre o PR"; exit 2; }` e `set -a; eval "$fatia"; set +a` (como hoje);
  - os argumentos, montados assim (bash 3.2): `set --`; `set -f`; `IFS='|'`; para cada parte não vazia de `$EXPX_EXCLUIR_DA_REVISAO`, `set -- "$@" --excluir-da-revisao "$parte"`; `IFS` e `set +f` restaurados. Sem `FATIA_IGNORAR`, `FATIA_EXCECAO` nem `e7_ignorar`;
  - `bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh "$@" "$base" "$publicado"` e a linha do estado de :121, igual.
- Texto: o que é L2 e L3 e de onde vêm (perfis do núcleo, fixos; nenhum projeto calibra); `excluir_da_revisao` do SHA publicado vira argumento e só tira de L2, nunca de L3; os artefatos de método ficam fora de L2 pelo próprio script e **contam** em L3; o painel do revisor tira da revisão do app, não da conta dos 100 (substitui :141-149); saída 1 (L2: uma task anterior divide o arquivo; L3: dividir a sprint ou o trabalho; nunca forçar a revisão do app); saída 2 inclui `FATIA_*` no ambiente e núcleo desatualizado; sai a exceção declarada (:157-159) e os avisos de arquivo perto do limite (:151).
- "Quando falha": `saiu 1 (L2 ou L3)`; `saiu 2` com `FATIA_*` no ambiente (remova a variável); a linha do leitor ganha "núcleo antigo (sem `expx-limites.mjs` ou `perfis/`)".
- DM-257: E7 mede só L2/L3 pelo espelho; exclusão por argumento; `FATIA_*` falham (substitui DM-229 e DM-236 no que dizem de F2, F2c, F3, F4, exceção e `FATIA_*`). DM-258: o núcleo como pasta (cópia, gerador, conferência do commit); núcleo antigo é 3 (completa DM-235 e DM-237).

- [ ] **Step 1: Write the failing tests** (o bloco real extraído, como os casos de :388-505):
  - `o bloco nao exporta nem passa FATIA_` (contrato: nenhuma ocorrência de `FATIA_` **dentro do bloco** extraído do Passo 1.5; o texto pode citar `FATIA_*` ao explicar a saída 2);
  - `dois padroes, um com espaco, e EXPX_EXCLUIR_DA_REVISAO vazio`: os dois chegam como dois pares de argumentos; vazio não gera argumento; parâmetros posicionais herdados não chegam ao script;
  - `excluir_da_revisao do SHA publicado tira a pasta de L2`: commit com `excluir_da_revisao` `^gerado/` e `gerado/a.js` de 5.001 linhas → sai 0 e grava o estado; disco com outro padrão não muda a medida;
  - `padrao com espaco chega inteiro` (`^dados de teste/`; Review Focus 5);
  - `FATIA_IGNORAR= no shell: o bloco sai 2, cita remova-a do ambiente e nao deixa o estado` (Review Focus 1);
  - `.expx/fatiamento.json v1 no SHA publicado: sai 2 e cita migre para 2`;
  - `sem arquivo: 101 arquivos (fixtures/candidatos/ e docs/entregas/ inclusive) reprovam (L3) e nada chama node` (substitui o caso F2c);
  - `passo 1.5 reprovado (saida 1) nao deixa o estado` (:392, agora com 101 arquivos no lugar de `FATIA_MAX_LINHAS_PR=0`);
  - os casos de :397-431 (busca de novo, fetch que falha, `set -a`, nenhum `eval` solto) ficam.
- [ ] **Step 2: Run** `bash scripts/ci/test-fatiamento-e7.sh` contra o texto atual — Expected: FAIL nos novos.
- [ ] **Step 3: Write** o bloco, o texto e as DM.
- [ ] **Step 4: Run** `EXPXDEV_RAIZ=F:/Projetos/expxdev bash scripts/ci/test-fatiamento-e7.sh && EXPXDEV_RAIZ=F:/Projetos/expxdev bash scripts/ci/test-nucleo-expx.sh && bash scripts/ci/test-leitor-do-projeto.sh && bash scripts/ci/validate-mergex-contract.sh && bash .claude/hooks/teste.sh` — Expected: verdes, com os casos de `EXPXDEV_RAIZ` rodados (não pulados); cite a saída na descrição da PR.
- [ ] **Step 5: Run** `bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh --excluir-da-revisao '^scripts/ci/fixtures/candidatos/' origin/main HEAD` — Expected: exit 0.
- [ ] **Step 6: Commit** `feat(mergex): E7 mede o PR com os limites fixos do CodeAnt`. Abra a PR 2.

## Bloco P (PR 3) — o PR de planejamento

### Task P1: `entrega-de-planejamento.sh` e o schema

**Files:**
- Create: `.claude/skills/mergex/scripts/entrega-de-planejamento.sh`
- Modify: `.claude/skills/mergex/references/00-schema.md` (enum `pr_estado` :69; exemplo :94-145; "Campo a campo" :148-176: `sprint_atual` e `prs`)
- Modify: `.claude/skills/mergex/assets/TEMPLATE-ENTREGA.md` (perto de `pr_url`/`pr_estado`)
- Create: `scripts/ci/test-pr-de-planejamento.sh`; Modify: `.github/workflows/ci.yml` (passo `Test PR de planejamento`, no job `contract`)

**Interfaces:**
- Produces: `entrega-de-planejamento.sh --entrega <ENTREGA.md> [--rev <commit>]`. Lê o frontmatter (do disco, ou do commit com `--rev`). Imprime `planejamento=sim|nao`, e com `sim` também `estado=<prs[0].estado>` e `merge_sha=<prs[0].merge_sha>`. Saídas: 0 leu; 2 ilegível ou incoerente (`sprint_atual: planejamento` sem `prs[0].sprint: planejamento`, ou o contrário; item de planejamento fora da primeira posição; `estado` fora do enum); 64 uso. Entrega sem `sprint_atual` nem `prs` (antiga) é `planejamento=nao`.
- Schema (o subconjunto da Task S1 que este bloco usa): `sprint_atual: planejamento | null` (a S1 acrescenta `NN`); `prs:` lista de `{sprint, url, estado, merge_sha, merge}`, `estado` em `aberto | rascunho | aguardando_merge | merged | fechado | null`, `merge` em `humano | automatico | null`; `pr_url`/`pr_estado` de topo são os da entrega atual.

- [ ] **Step 1: Write the failing tests** em `test-pr-de-planejamento.sh`: `entrega antiga sem as chaves: nao`; `planejamento aberto: sim, estado null`; `sprint_atual sem prs: sai 2`; `prs com planejamento em segundo: sai 2`; `--rev le o commit, nao o disco`; `causa-do-portao --validar e sequencia-de-commits --validar aceitam a entrega com prs` (casos que eram da S1).
- [ ] **Step 2: Run** `bash scripts/ci/test-pr-de-planejamento.sh` — Expected: FAIL (script ausente).
- [ ] **Step 3: Implement** (leitura de frontmatter no molde de `le_frontmatter` de `causa-do-portao.sh` :100-122; o bloco `prs` em YAML de bloco — a forma canônica, a mesma do template, do E0 e das fixtures; a forma em fluxo `[{…}]` é ilegível, saída 2 — só os campos acima). Valor nulo sai como o texto `null` (`estado=null`, `merge_sha=null`).
- [ ] **Step 4: Run** — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): leitor da entrega de planejamento e as chaves sprint_atual e prs`.

### Task P2: E0 e E2

**Files:**
- Modify: `.claude/skills/mergex/references/00-abertura.md` (pré-requisitos :11-24: `--planejamento` do chamador; passo 5 caso 1 :203-218 e caso 2 :220-242)
- Modify: `.claude/skills/mergex/scripts/portao-v9.sh` (uso :8-10, opções :124-127; o conjunto aceito) e `.claude/skills/mergex/references/02-prontidao.md` (seção nova "Entrega de planejamento" antes de :52; V9 :152-190)
- Modify: `.claude/skills/mergex/references/integracao/sprintx.md` (a F5 chama E0–E8 com `--planejamento`; a F6 só depois do merge)
- Modify: `scripts/ci/test-pr-de-planejamento.sh`

**Interfaces:**
- E0 com `--planejamento`: caso 1 grava `sprint_atual: planejamento` e `prs` em YAML de bloco com um item (`sprint: planejamento`, `url: null`, `estado: null`, `merge_sha: null`, `merge: null`). Pré-condição verificável, antes de escrever: nada sujo nem fora do índice sob `docs/sprintx/features/<slug>/` (`git status --porcelain -- <pasta>` vazio): a sprintx commita o planejamento antes de chamar o E0 (ponto 3 da parte 2). Caso 2 com `--planejamento` é retomada do próprio planejamento (preserva o item). Recusa, sem escrever: `--planejamento` numa entrega com `commits` não vazio, ou com o planejamento já `merged`. Retomada **sem** `--planejamento` numa entrega cujo `prs[0]` é o planejamento: só com `estado: merged` e `merge_sha` ancestral da base buscada, e com a base ancestral do `HEAD`; então `sprint_atual` volta a `null` e `pr_url`/`pr_estado` a `null` (a S1 acrescenta `--sprint`). Sem o registro do merge, o E0 recusa e manda rodar o E9, que o registra (P3).
- `portao-v9.sh --verificar --planejamento …`: mesma base, mesmo diff (`--no-renames`), conjunto aceito = `^docs/(sprintx|entregas|eventos)/`; desvio `fora_do_planejamento<TAB><caminho>` → `resultado=v9` (código 1).
- E2: quem decide o modo é `entrega-de-planejamento.sh` (P1); V1, V2, V3, V11 `n/a` com o motivo das decisões; V9 com `--planejamento`.

- [ ] **Step 1: Write the failing tests**: `E0 --planejamento com artefato do planejamento sujo: recusa sem escrever` (contrato do texto e a checagem extraída); `V9 de planejamento: so docs/sprintx, docs/entregas e docs/eventos passa`; `V9 de planejamento: src/a.ts e fora_do_planejamento`; `V9 de planejamento: renomeacao de src/a.ts para docs/sprintx/ reprova pela origem` (Review Focus 4); `V9 sem --planejamento nao muda` (um caso de hoje roda igual); contrato: `00-abertura nomeia --planejamento, o item prs e as recusas`; `02-prontidao marca V1, V2, V3 e V11 n/a na entrega de planejamento`; `a retomada sem --planejamento exige o planejamento merged`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** o script e **write** os textos.
- [ ] **Step 4: Run** `bash scripts/ci/test-pr-de-planejamento.sh && bash scripts/ci/test-r3-predecessores-sprintx.sh && bash scripts/ci/validate-mergex-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E0 abre a entrega de planejamento e a V9 a confere so com artefatos de metodo`.

### Task P3: E7, E8 e E9

**Files:**
- Modify: `.claude/skills/mergex/references/07-abertura-pr.md` (bloco do Passo 1.5; texto; "Quando falha")
- Modify: `.claude/skills/mergex/references/08-registro.md` (o item `prs[0]` com `url` e `estado`)
- Modify: `.claude/skills/mergex/references/09-revisao.md` (passo 7, item 7, :961: `prs[0]` com `estado: merged`, `merge_sha`, `merge: humano`; passo 2, "Trabalho atual no E9" :62-87: com a entrega atual de planejamento ainda sem `merged` e `pr_url` preenchido, o E9 lê esse PR no serviço (`gh pr view <pr_url> --json state,mergeCommit`; `glab` equivalente) e, se ele já foi mergeado — inclusive pelo botão do serviço —, grava o mesmo registro com `merge_sha` = o commit de merge; sem ferramenta ou sem resposta, não grava nada e diz o motivo; texto novo: o PR de planejamento nunca tem merge automático, e o aviso do app de que pulou a revisão por passar de 100 arquivos não é finding nem pendência)
- Modify: `scripts/ci/test-fatiamento-e7.sh`, `scripts/ci/test-pr-de-planejamento.sh`, `scripts/ci/validate-review-evidence-contract.sh` (a frase do E9)
- Modify: `.claude/skills/mergex/decisoes/revisao-por-task-e-entrega-por-sprint.md` (DM-259, DM-260)

**Interfaces:**
- No bloco do E7, antes do script: `bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --entrega docs/entregas/<trabalho_id>/ENTREGA.md --rev "$publicado"`; `planejamento=sim` → `--planejamento` à frente dos argumentos; saída ≠ 0 → o bloco sai 2. Com `--planejamento`, a saída 1 é a recusa: o E7 não abre, registra a lista de `VIOLACAO planejamento` e diz que o PR de planejamento só leva `docs/sprintx/`, `docs/entregas/` e `docs/eventos/`.
- DM-259: a marca e o leitor único; E0, E2, E7, E8. DM-260: o E9 registra o merge do planejamento; nunca automático; o pulo do app não é pendência.

- [ ] **Step 1: Write the failing tests**: `entrega de planejamento com 150 arquivos de metodo: o bloco sai 0 e grava o estado`; `entrega de planejamento com src/a.ts: sai 1, lista o arquivo, sem estado`; `ENTREGA incoerente no SHA publicado: sai 2`; `entrega comum: o bloco nao passa --planejamento` (um PR de 101 arquivos ainda reprova em L3); `E9 com o PR de planejamento mergeado pelo servico: grava prs[0] merged com o mergeCommit` e `gh sem resposta: nao grava` (`gh` falso, como `test-r4-cabeca-do-pr.sh`); contrato: `08-registro grava prs[0]`, `09-revisao diz que o PR de planejamento nunca tem merge automatico` e `09-revisao diz que o pulo do app por mais de 100 arquivos nao e pendencia`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write** o bloco, os textos e as DM.
- [ ] **Step 4: Run** `bash scripts/ci/test-fatiamento-e7.sh && bash scripts/ci/test-pr-de-planejamento.sh && bash scripts/ci/validate-mergex-contract.sh && bash scripts/ci/validate-review-evidence-contract.sh && bash .claude/hooks/teste.sh` — Expected: verdes.
- [ ] **Step 5: Run** o fatiamento L2/L3 (Global Constraints) — Expected: exit 0.
- [ ] **Step 6: Commit** `feat(mergex): PR de planejamento so com artefatos de metodo, sem L3 e com merge do desenvolvedor`. Abra a PR 3.
