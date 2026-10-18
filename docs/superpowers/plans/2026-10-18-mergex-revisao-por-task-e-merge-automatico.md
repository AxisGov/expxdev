# Fatiamento por projeto, revisão por task, entrega por sprint sequencial e merge automático — plano de implementação (mergex)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar para a mergex a parte dela do desenho:
- **E7:** mede o PR com os limites de `.expx/fatiamento.json`, lidos pelo núcleo do expx, e com o corpo atual do verificador.
- **E2:** ganha a V12, a revisão por task conferida pelo `conferir` do núcleo.
- **E1:** commita a evidência de revisão junto com a task.
- **E4 e E9:** tratam os achados rejeitados.
- **E9 e features empilhadas:** só aceita a feature redirecionada depois de sincronizada com a base nova (4.4).
- **Entrega por sprint (4.3):** um trabalho entrega um PR por sprint, em sequência, na mesma branch e com a mesma entrega.
- **Merge automático (4.6):** o E9 pode mergear sozinho o PR de baixo risco. É desligado por padrão e exige as sete condições mecânicas. Tem espera própria, trilha e aviso.

**Architecture:**
- **Leitor do projeto.** Um helper, `scripts/leitor-do-projeto.sh`, é o único ponto que lê a configuração do projeto, e sempre pelo núcleo. Arquivo ausente: os padrões, sem node. Arquivo presente: o leitor do núcleo. Arquivo presente e leitor ausente: erro. Consumo: `fatia="$(…)" || …; set -a; eval "$fatia"; set +a`.
- **V12.** Script no molde da V11.
- **Entrega por sprint.** Sem caminho novo de entrega: `feature/<slug>` e `docs/entregas/<slug>/ENTREGA.md` continuam. A entrega ganha `entrega`, `sprint_atual` e `prs`. O E0 valida e registra o modo efetivo uma vez; depois disso ninguém relê o frontmatter do plano.
- **Merge automático, em três peças:**
  - `scripts/merge-automatico.sh` confere o que o Git prova.
  - `scripts/espera-do-merge.sh` é a máquina de estados da espera e é dono da idempotência.
  - O E9 junta a isso o que só a plataforma diz (CI, gate R1–R6) e faz o merge preso ao SHA.

**Tech Stack:** bash compatível com 3.2, jq, node ≥ 20.19 só quando o núcleo é chamado, git ≥ 2.36, `gh`/`glab` no E9, `codex` CLI opcional (só leitura, só parecer).

**Spec:** `AxisGov/expxdev`, branch `docs/desenho-opcao-c-merge-automatico` (PR #52), `docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md`, seções 4.1–4.6, 6.0 e 7.

**Estado de partida:** mergex `origin/main` 6006515. No expxdev: `origin/main` 05847fd (com a #51, id de task com ponto); a #53 (`feat/leitor-merge-automatico`, e61d79b) a mergear.

**Decisões do usuário e do coordenador incorporadas (2026-10-18):**

*Configuração e revisão por task*
- Sem `.expx/fatiamento.json`, a V12 é `n/a`.
- A confirmação de rejeição no E9 é interativa, uma por achado. Qualquer achado rejeitado impede o merge automático.
- `revisao: null` quando não há evidência; o motivo vai sem o caminho.

*Entrega por sprint*
- **Sprint no E0:** a F6 passa ao E0 um identificador fixo da sprint, que se propaga até o E8.
- **Modo da entrega:** `entrega:` no frontmatter do `00-PLANEJAMENTO.md` sobrescreve o padrão do projeto. O E0 valida e registra o valor efetivo.

*Merge automático: condições*
- **Contagem de testes:** a sprintx registra a contagem no fechamento da sprint. Sem o registro, a contagem é não verificável e o merge espera. A conferência do diff (teste apagado, desligado ou renomeado) vale sempre.
- **Remoção:** a remoção só é declarada em `arquivos.remove`. Renomeação é a origem em `remove` e o destino em `cria`. Remoção que só aparece em `altera` faz o merge esperar.
- **OLHO OBRIGATÓRIO:**
  - por caminho protegido, segurança ou dados, sempre impede;
  - por O2, impede salvo dispensa da sprint, registrada e válida só com a regra de negócio em critérios de aceite com teste.
- **Leitor (expxdev#53):** emite `EXPX_MERGE_AUTOMATICO=sim|nao` e `EXPX_CAMINHOS_PROTEGIDOS`. Os dois saem da árvore da main. `.expx/fatiamento.json` e `.expx/hooks.json` são sempre protegidos.

*Merge automático: operação*
- **Espera:** a mergex é dona da espera. Confere a cada 2 min, por até 30 min. Estourou: `aguardando_merge`, aviso e para. É idempotente, e cada tentativa recalcula tudo.
- **Trilha:** comentário único e idempotente no PR, mais o rastro, mais o `ENTREGA.md` quando há sprint seguinte.
- **Codex:** só parecer técnico; nunca fecha decisão nem muda o portão.

*Features empilhadas*
- Depois do redirecionamento: sincronizar com a base nova, CI novo no HEAD resultante, R1–R6 recalculado, revisão dos logins de `revisor_bot`. Nunca commit vazio.

## Global Constraints

- **Projeto sem `.expx/fatiamento.json`.** A mergex se comporta como hoje: nada chama node, `por_trabalho`, V12 `n/a`, merge automático desligado. A única mudança visível é a F2c (100 arquivos visíveis ao revisor).
- **Erros do leitor.** Arquivo presente e leitor ausente, node ausente ou arquivo inválido é **erro**, nunca os padrões.
- **Consumo do leitor.** É sempre `fatia="$(…)" || <falha>; set -a; eval "$fatia"; set +a`. Os testes proíbem `eval "$(…)"` direto e `eval` sem `set -a`.
- **De onde vem a configuração:**
  - O E7 lê a configuração do SHA publicado.
  - O merge automático e o E9 leem `EXPX_MERGE_AUTOMATICO`, `EXPX_CAMINHOS_PROTEGIDOS` e `EXPX_REVISOR_BOT` da árvore da **base** (a main que recebe o merge), nunca da cabeça do PR.
- **Fatiamento:**
  - O corpo do `fatiamento-da-pr.sh` é o do `verificar-fatiamento.sh` do expxdev, byte a byte, com o sha256 no cabeçalho.
  - F2c e F4 nunca são rebaixadas.
  - `FATIA_IGNORAR_PROJETO` soma.
- **Credenciais e CLI de revisão.** A mergex nunca lê o código de saída da CLI do CodeAnt. Nunca configura credencial (`codeant login`, `CODEANT_API_TOKEN`, `gh auth`).
- **Entrega por sprint:**
  - Uma branch e uma entrega por trabalho.
  - Sprint fechada é imutável.
  - O PR da N+1 só abre com o da N `merged`.
  - O modo efetivo e a sprint ficam gravados na entrega pelo E0; nenhuma etapa depois relê `00-PLANEJAMENTO.md` para decidir isso.
- **Merge automático:**
  - É preso ao SHA revalidado (DM-225).
  - Qualquer condição falha, não verificável ou ilegível faz o merge esperar o desenvolvedor, com o motivo.
  - Nunca em lote.
  - Nunca duas tentativas de merge nem dois comentários para o mesmo PR e HEAD.
- **O que nunca é automático.** Confirmação humana nunca vem de parecer do Codex. Rejeitar achado, aceitar risco, exceção ao portão e dispensa de O2 são sempre do desenvolvedor.
- **Nomes de produto.** Nenhum nome de produto de review no texto da skill (DM-197). `revisor_bot` é configuração do projeto, não texto da skill.
- **F4:**
  - `teste.sh` (116 KB) não cresce.
  - `DECISOES-DA-SKILL.md` (122 KB) ganha só o título da seção nova e o link (≤ 5 linhas); as DM-235 em diante vão para `decisoes/revisao-por-task-e-entrega-por-sprint.md`.
  - `validate-mergex-contract.sh` (102 KB) só muda onde contradiz o texto novo.
  - Contrato novo vai em `scripts/ci/test-*.sh`, cada um com passo no `ci.yml`.
  - `test-r2-barreira-push.sh` e `test-r1-reconciliacao-base.sh` não crescem.
  - `09-revisao.md` (74 KB) aponta para os references novos `14-merge-automatico.md` e `15-espera-do-merge.md`, em vez de crescer.
- **Fatiamento desta mudança:**
  - Commit ≤ 300 linhas; PR ≤ 400 linhas e 20 arquivos (`fatiamento-da-pr.sh origin/main HEAD`).
  - A cópia do núcleo em `scripts/ci/fixtures/candidatos/` fica fora da medida.
  - Um PR por bloco, na ordem.
  - Mensagens `<tipo>(mergex): <frase sem acento>`.

## Review Focus

1. **`.expx/fatiamento.json` sujo no disco, diferente do commitado.** O E7 mede com o arquivo do SHA publicado. Testes nas Tasks A3 e A4.
2. **PR que liga o merge automático, amplia `caminhos_protegidos` ou acrescenta um login em `revisor_bot` no próprio diff.** Tudo vem da árvore da base. `.expx/fatiamento.json` alterado no PR é sempre protegido. Testes nas Tasks M1 e D3.
3. **Teste desligado, apagado ou renomeado escondido no diff.** Inclui marcador só movido (não conta) e renomeação de teste para fora do padrão (conta). Testes na Task M1.
4. **Dispensa de O2 mal formada passando por válida:**
   - dispensa sem sprint, `sprint: todas`, ou para outra sprint;
   - dispensa sem `por`, `em` ou `motivo`;
   - dispensa com task da sprint sem critério de aceite.

   Em todos os casos, `espera`. Testes na Task M2.
5. **Repetição da espera.** Duas chamadas no mesmo minuto, HEAD que muda durante a espera, comentário já existente de uma passagem anterior: nenhum comentário duplicado, nenhuma segunda tentativa de merge, e tudo recalculado no HEAD novo. Testes na Task M3.

---

## Bloco A1 (PR 1) — cópia do núcleo para os testes e espelho do verificador

### Task A1: cópia do núcleo do expx nos testes

**Files:**
- Create: `scripts/ci/fixtures/candidatos/expx-nucleo/expx-fatiamento.mjs` e `expx-revisao.mjs` (cópia de `nucleo/scripts/` do expxdev 05847fd, que já aceita id de task com ponto, expxdev#51; regerada, em commit próprio, para a release que trouxer a expxdev#53 e a chave `revisor_bot`)
- Create: `scripts/ci/fixtures/candidatos/expx-nucleo/ORIGEM` (`expxdev <rev>`, uma linha `sha256  arquivo` por cópia)
- Create: `scripts/ci/atualizar-nucleo-expx.sh` (copia de `$EXPXDEV_RAIZ` numa revisão e regrava `ORIGEM`)
- Create: `scripts/ci/test-nucleo-expx.sh`
- Modify: `.github/workflows/ci.yml` (passo novo depois de l.100)

**Interfaces:**
- Produces: `bash scripts/ci/atualizar-nucleo-expx.sh <expxdev_raiz> <rev>` (0; 64 uso; 1 revisão ou arquivo ausente). A cópia é artefato gerado (F6): commit próprio, com o comando no corpo.
- Consumers: Tasks A3, A4, B1, C2 (os testes montam `.expx/marketplace/plugins/expx/nucleo/scripts/` num repositório temporário copiando daqui).

- [ ] **Step 1: Write the failing test** `scripts/ci/test-nucleo-expx.sh`:
  - `ORIGEM confere com o sha256 de cada copia`;
  - `a copia fica fora do F2 do proprio repositorio` (o `fatiamento-da-pr.sh` sem `FATIA_IGNORAR` mede `0 linhas em 0 arquivo` num commit só com a cópia);
  - `node consegue rodar a copia` (`node expx-fatiamento.mjs --raiz <vazio>` sai 0 com `EXPX_FATIAMENTO_ORIGEM=padrao`; pulado com `passa '... (sem node)'` só se `command -v node` falhar — no CI tem node).
- [ ] **Step 2: Run** `bash scripts/ci/test-nucleo-expx.sh` — Expected: FAIL (`ORIGEM` ausente).
- [ ] **Step 3: Implement** o script de atualização e rode-o: `bash scripts/ci/atualizar-nucleo-expx.sh F:/Projetos/expxdev 05847fd`.
- [ ] **Step 4: Run** — Expected: `3 ok, 0 falha(s)`.
- [ ] **Step 5: Commit** `test(mergex): copia do nucleo do expx para os testes` (corpo: o comando que gerou a cópia).

### Task A2: `fatiamento-da-pr.sh` espelha o corpo atual do verificador

**Files:**
- Modify: `.claude/skills/mergex/scripts/fatiamento-da-pr.sh` (cabeçalho l.1-16; corpo l.18-200 trocado pelo corpo de `scripts/verificar-fatiamento.sh` do expxdev 4320936, l.24-250)
- Modify: `scripts/ci/test-fatiamento-e7.sh` (identidade depois de l.22; casos F2c e soma depois de l.120)

**Interfaces:**
- Produces: cabeçalho com `# Origem: AxisGov/expxdev 4320936 scripts/verificar-fatiamento.sh` e `# Corpo-sha256: <hex do corpo a partir de set -uo pipefail>`; variáveis novas aceitas pelo script: `FATIA_IGNORAR_PROJETO`, `FATIA_CAPACIDADE_ARQUIVOS` (≤ 100; acima sai 2), `FATIA_CAPACIDADE_EXCLUIDO` (definida e vazia = nada excluído); violação nova `F2c:`; o padrão de `FATIA_IGNORAR` passa a incluir `^docs/(sprintx|entregas|eventos)/`.
- Consumes: nada novo. O E7 continua passando `FATIA_IGNORAR` explícito (Task A4).

- [ ] **Step 1: Write the failing tests** (em `test-fatiamento-e7.sh`, com os helpers `g`, `passa`, `quebra` que já existem):
  - `o corpo bate com o Corpo-sha256 do cabecalho` (recalcula `sed -n '/^set -uo pipefail$/,$p' | sha256sum`);
  - `com EXPXDEV_RAIZ definido, o corpo e igual ao verificar-fatiamento.sh do expxdev` (pulado com `passa` sem a variável; no CI fica pulado, localmente é o teste que pega deriva);
  - `F2c: 101 arquivos visiveis reprovam mesmo com FATIA_MAX_ARQUIVOS=200 e FATIA_EXCECAO` (rc 1, saída contém `F2c:`);
  - `F2c conta artefato de metodo quando FATIA_CAPACIDADE_EXCLUIDO e vazio` (101 arquivos em `docs/entregas/x/`);
  - `FATIA_IGNORAR_PROJETO soma ao FATIA_IGNORAR do E7` (`^gerado/` e `docs/entregas/` fora; `app.ts` conta);
  - `FATIA_CAPACIDADE_ARQUIVOS=101 sai 2` e `FATIA_MAX_LINHAS_ARQUIVO=5001 sai 2`.
- [ ] **Step 2: Run** `bash scripts/ci/test-fatiamento-e7.sh` — Expected: FAIL nos sete novos; os antigos passam.
- [ ] **Step 3: Implement**: copie o corpo, escreva o cabeçalho (mantém `COPIA, nao dependencia`, que o teste de l.20 procura) e o sha256.
- [ ] **Step 4: Run** — Expected: `N ok, 0 falha(s)` (todos, inclusive os de renomeação, lock e merge).
- [ ] **Step 5: Commit** `feat(mergex): fatiamento-da-pr espelha o verificador do expxdev (F2c e artefatos de metodo)`. Abra a PR 1 (≈ 220 linhas contadas, 6 arquivos).

## Bloco A2 (PR 2) — o E7 lê `.expx/fatiamento.json`

### Task A3: `scripts/leitor-do-projeto.sh`

**Files:**
- Create: `.claude/skills/mergex/scripts/leitor-do-projeto.sh`
- Create: `scripts/ci/test-leitor-do-projeto.sh`

**Interfaces:**
- Produces: `leitor-do-projeto.sh [--raiz <dir>] [--rev <commit>]`. Raiz padrão: `git rev-parse --show-toplevel`. Leitor: `<raiz>/.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs`.
  - Presença: com `--rev`, `git cat-file -e <rev>:.expx/fatiamento.json`; sem `--rev`, qualquer entrada em disco (`-e` ou `-L`), como o leitor faz com `lstat`.
  - Ausente: sai 0 e imprime, sem chamar node, `FATIA_CAPACIDADE_EXCLUIDO='^docs/(sprintx|entregas|eventos)/'`, `EXPX_REVISAO_POR_TASK=se_disponivel`, `EXPX_ENTREGA=por_trabalho`, `EXPX_MERGE_AUTOMATICO=nao`, `EXPX_CAMINHOS_PROTEGIDOS=` (vazio: com o merge automático desligado a lista não é lida), `EXPX_REVISOR_BOT=` (vazio), `EXPX_FATIAMENTO_ORIGEM=padrao` (os padrões do leitor; não imprime `FATIA_MAX_*`, para não mudar o que o E7 mede hoje).
  - Presente: materializa o arquivo do `<rev>` (ou o do disco) num diretório temporário e roda `node <leitor> --raiz <tmp> --formato env`; repassa stdout byte a byte e sai 0. Leitor sai 1: stderr do leitor, stdout vazio, sai 1. Leitor ausente, node ausente ou saída do leitor sem `EXPX_FATIAMENTO_ORIGEM=projeto`: sai 3 com `expx-fatiamento ausente ou incompleto: atualize o expx (expx update)`. Uso: 64.
- Consumers: Task A4 (E7), Task B1 (V12), Task S1 (E0, `EXPX_ENTREGA`), Task D3 (`EXPX_REVISOR_BOT`), Tasks M1 e M2 (`EXPX_MERGE_AUTOMATICO`, `EXPX_CAMINHOS_PROTEGIDOS`), sempre lidos da árvore da base com `--rev <sha da base>`.

- [ ] **Step 1: Write the failing tests** (repositório temporário com a cópia da Task A1 em `.expx/marketplace/...`):
  - `sem arquivo: padroes sem chamar node` (PATH sem node; sai 0; `EXPX_ENTREGA=por_trabalho`);
  - `arquivo valido: repassa o leitor` (calibragem do conselho → `FATIA_MAX_LINHAS_PR=2500`, `EXPX_ENTREGA=por_sprint`);
  - `arquivo invalido: sai 1, stdout vazio, stderr cita a chave`;
  - `arquivo presente e leitor ausente: sai 3 e cita expx update`; `arquivo presente e node ausente: sai 3`;
  - `--rev le o arquivo do commit, nao o do disco` (commit com `pr_linhas: 2500`, disco com `9999` → `2500`) (Review Focus 1);
  - `--rev sem o arquivo no commit, com arquivo so no disco: padroes`;
  - `link quebrado como .expx/fatiamento.json: presente e invalido (sai 1)`;
  - `consumo seguro exporta para processo filho` (o trecho `fatia=…; set -a; eval "$fatia"; set +a` seguido de `bash -c 'printf %s "$FATIA_MAX_LINHAS_PR"'` imprime `2500`).
- [ ] **Step 2: Run** `bash scripts/ci/test-leitor-do-projeto.sh` — Expected: FAIL (script ausente).
- [ ] **Step 3: Implement** o helper (temporário removido em `trap`; nenhum `eval` dentro dele).
- [ ] **Step 4: Run** — Expected: `9 ok, 0 falha(s)`.
- [ ] **Step 5: Commit** `feat(mergex): leitor-do-projeto le .expx/fatiamento.json pelo nucleo do expx`.

### Task A4: Passo 1.5 do E7 com o leitor

**Files:**
- Modify: `.claude/skills/mergex/references/07-abertura-pr.md` (bloco l.89-120: duas linhas depois de `base=` l.114; texto l.122-136; saída 2 l.148-151; "Quando falha" l.304-305 e uma linha nova)
- Modify: `scripts/ci/test-fatiamento-e7.sh` (casos do bloco extraído, depois de l.357)
- Modify: `.github/workflows/ci.yml` (passo `Test leitor do projeto`)
- Create: `.claude/skills/mergex/decisoes/revisao-por-task-e-entrega-por-sprint.md` (DM-235 a DM-237)
- Modify: `.claude/skills/mergex/DECISOES-DA-SKILL.md` (fim do arquivo: título da seção nova e o link, ≤ 5 linhas)

**Interfaces:**
- Consumes: `leitor-do-projeto.sh --rev "$publicado"` (Task A3).
- Produces: as duas linhas novas do bloco, nesta forma exata (o teste as procura):
  `fatia="$(bash .claude/skills/mergex/scripts/leitor-do-projeto.sh --rev "$publicado")" || { echo "<motivo>: o E7 não mede nem abre o PR"; exit 2; }` e `set -a; eval "$fatia"; set +a`. Configuração inválida ou leitor ausente é "não mediu" (saída 2), nunca violação (1) nem os padrões.
- DM-235 (E7 lê pelo helper, do SHA publicado; ausente sem node; presente sem leitor = saída 2), DM-236 (corpo espelhado com identidade por sha256; F2c nunca rebaixada), DM-237 (cópia do núcleo nos testes, em `fixtures/candidatos/`, regenerada por script).

- [ ] **Step 1: Write the failing tests** (rodando o bloco real extraído com `bloco_do_e7`, como os casos de l.284-357):
  - `com pr_linhas 2500 no SHA publicado, PR de 600 linhas passa e grava o estado`;
  - `bloco do passo 1.5 mede com o arquivo do SHA publicado` (disco com `pr_linhas: 9999`, commit com o padrão → reprova F2) (Review Focus 1);
  - `.expx/fatiamento.json invalido: o bloco sai 2 e nao deixa o estado da base`;
  - `arquivo presente sem leitor: sai 2 e cita expx update`;
  - `ignorar do projeto soma: gerado/ fora, docs/entregas fora, app.ts conta`;
  - `sem arquivo: 101 arquivos visiveis reprovam (F2c) e nada chama node`;
  - contrato: `o E7 consome o leitor com set -a` e `nenhum eval "$(...)" direto no E7` (reprova o texto anterior, que não tem o leitor).
- [ ] **Step 2: Run** `bash scripts/ci/test-fatiamento-e7.sh` contra o texto atual — Expected: FAIL nos sete novos.
- [ ] **Step 3: Write** o bloco, o texto (de onde vêm os limites, por que do SHA publicado, o que é saída 2) e as DM.
- [ ] **Step 4: Run** `bash scripts/ci/test-fatiamento-e7.sh && bash scripts/ci/test-leitor-do-projeto.sh && bash scripts/ci/validate-mergex-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E7 mede o PR com os limites de .expx/fatiamento.json`. Abra a PR 2 (≈ 380 linhas, 7 arquivos).

## Bloco B1 (PR 3) — a V12 executável

> A correção do id com ponto já está no núcleo (expxdev#51, 05847fd); a cópia da Task A1 sai dessa revisão ou de uma posterior.

### Task B1: `scripts/portao-v12.sh`

**Files:**
- Create: `.claude/skills/mergex/scripts/portao-v12.sh`
- Create: `scripts/ci/test-portao-v12.sh`
- Modify: `.github/workflows/ci.yml` (passo `Test E2 V12`)

**Interfaces:**
- Produces: `portao-v12.sh --verificar --entrega <ENTREGA.md> --trabalho <slug> [--raiz <dir>] -- <tasks.md>...`. Primeira linha `V12=OK|AVISO|FALHA|SEM_PROVA|n/a`, depois as linhas do `conferir` como vieram e `motivo=` quando houver. Códigos no molde da V11: 0 (OK, AVISO, n/a), 1 (FALHA), 2 (SEM_PROVA), 64 (uso).
- Consumes: `leitor-do-projeto.sh --rev HEAD` (`EXPX_REVISAO_POR_TASK`); `prova-de-commit.sh --concluidas <tasks.md>...` e `--commits <ENTREGA.md>` (o commit do **último** item da task na ordem efetiva); `node <raiz>/.expx/marketplace/plugins/expx/nucleo/scripts/expx-revisao.mjs conferir --trabalho <slug> --modo <modo> --task <T>=<commit>...`.
- Mapeamento (DM-238):

| Situação | `obrigatoria` | `se_disponivel` | `desligada` |
|---|---|---|---|
| sem `.expx/fatiamento.json` (`EXPX_FATIAMENTO_ORIGEM=padrao`) | `n/a`, sem node | `n/a`, sem node | `n/a`, sem node |
| modo `desligada`; `versionado: false`; nenhuma task concluída | — | — | `n/a`, sem node |
| task concluída sem item em `commits` | fora da V12 (é da V11) | idem | — |
| configuração inválida ou leitor ausente (`leitor-do-projeto` 1 ou 3) | `SEM_PROVA` | `SEM_PROVA` | `SEM_PROVA` |
| node ausente ou núcleo sem `expx-revisao.mjs` | `SEM_PROVA` | `AVISO revisao-nao-conferida:<motivo>` | — |
| `conferir` 0 / 3 / 1 | OK / AVISO / FALHA | OK / AVISO / FALHA | — |
| `conferir` 64, outro código, ou saída sem exatamente uma linha `T-… ok|AVISO …|FALHA …` por task pedida | `SEM_PROVA` | `SEM_PROVA` | — |

- [ ] **Step 1: Write the failing tests** (repositório temporário com núcleo copiado, `tasks.md` de duas tasks, commits de task e evidências montadas com `cli.versao: 0.5.14`, `executada_em` ISO e `lotes` que cobrem os arquivos):
  - `obrigatoria com evidencia ok no commit da task: V12=OK`;
  - `obrigatoria sem evidencia: V12=FALHA e a linha T-… FALHA evidencia-ausente`;
  - `se_disponivel sem evidencia: V12=AVISO, codigo 0`;
  - `sem .expx/fatiamento.json: n/a sem chamar node` (decisão do coordenador, 2026-10-18);
  - `id com ponto (T-01.03) e conferido de verdade` (cópia 05847fd);
  - `desligada: n/a sem chamar node` (PATH sem node);
  - `achado aberto: FALHA achados-abertos:1`;
  - `evidencia editada no disco depois do commit nao muda o veredito`;
  - `task com dois itens em commits: confere o commit do ultimo`;
  - `conferir que sai 64 vira SEM_PROVA em qualquer modo` (`node` falso que sai 64);
  - `node ausente: SEM_PROVA em obrigatoria, AVISO em se_disponivel`;
  - `conferir que sai 0 com uma linha a menos: SEM_PROVA`;
  - `task concluida sem item em commits nao e alvo da V12`.
- [ ] **Step 2: Run** `bash scripts/ci/test-portao-v12.sh` — Expected: FAIL (script ausente).
- [ ] **Step 3: Implement** o script (usa o leitor de `commits` do `prova-de-commit.sh`, nunca um segundo parser).
- [ ] **Step 4: Run** — Expected: `13 ok, 0 falha(s)`.
- [ ] **Step 5: Commit** `feat(mergex): portao-v12 confere a revisao por task pelo nucleo`. Abra a PR 3 (≈ 390 linhas, 3 arquivos mais a cópia regenerada, que fica fora da conta).

## Bloco B2 (PR 4) — a V12 no portão: causa, schema e texto

### Task B2: `causa-do-portao.sh` e o schema conhecem a V12

**Files:**
- Modify: `.claude/skills/mergex/scripts/causa-do-portao.sh` (comentário l.13-14; `ORDEM` l.34; `CAUSAS` l.37-47; `numero` l.57-58)
- Modify: `.claude/skills/mergex/references/00-schema.md` (enum l.67; tabela l.430-442 ganha `| 12 | \`v12\` | \`revisao_reprovada\` |`; prosa l.452-466: o último grupo é "v1 a v5, v11 e v12")
- Modify: `.claude/skills/mergex/assets/TEMPLATE-ENTREGA.md` (l.63: `v1..v12`)
- Modify: `scripts/ci/validate-mergex-contract.sh` (l.504: 12→13; l.600: `` `v1` … `v12` ``; asserções da v12 depois de l.606, no molde de l.601-606)
- Modify: `scripts/ci/test-causa-portao.sh` (l.117-130 e l.164, l.194-195)

**Interfaces:**
- Produces: `ORDEM='v10 v6 v7 v8 v9 v1 v2 v3 v4 v5 v11 v12'`; `v12|revisao_reprovada`; `v12_sem_prova` aceito. O `registrar-portao.sh` não muda: ele valida por `causa-do-portao.sh --lista` (l.86 de `registrar-portao.sh`), e o teste prova isso.
- DM-239: V12 por último (sem commit de task não há evidência para conferir: a V12 é consequência da V11 e de V1).

- [ ] **Step 1: Write the failing tests** em `test-causa-portao.sh`: `ordem declarada termina em v11 v12`; `deriva revisao_reprovada "V12 sozinha" v12`; `deriva commit_nao_registrado v11 v12`; `deriva tarefa_nao_concluida v1 v12`; `deriva indeterminada v12_sem_prova`; `--lista v12 v1 imprime [v1, v12]`; `registrar-portao --resultado bloqueado --falhas v12 grava falhas_portao: [v12]` (bloqueado não exige a prova do pre-push).
- [ ] **Step 2: Run** `bash scripts/ci/test-causa-portao.sh` — Expected: FAIL nos novos e no da ordem.
- [ ] **Step 3: Implement** script, schema, template e o validador.
- [ ] **Step 4: Run** `bash scripts/ci/test-causa-portao.sh && bash scripts/ci/validate-mergex-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): causa do portao conhece a V12 (revisao_reprovada)`.

### Task B3: o E2 tem doze verificações

**Files:**
- Modify: `.claude/skills/mergex/references/02-prontidao.md` (l.46, l.52, l.267, l.295, l.349; seção `### V12 — Task concluída sem revisão por task aprovada` depois da V11, l.246; "Quando falha" l.354-368 ganha as linhas da V12)
- Modify: `.claude/skills/mergex/assets/TEMPLATE-prontidao.md` (l.4, l.28 + linha `| V12 |`, l.49)
- Modify: `.claude/commands/mergex-check.md` e `.opencode/commands/mergex-check.md` (l.42, l.44, l.58 + `| V12 |`, parágrafo como o da l.64)
- Modify: `.claude/hooks/mergex/pr-so-com-portao.sh` (l.447, l.466: `doze verificações (V1..V12)`)
- Modify: `README.md` (l.199) e `.github/assets/badge-portao.svg` (`12 verificacoes`, l.1-14)
- Modify: `.claude/skills/mergex/references/11-reconciliacao-base.md` (l.316) e `13-predecessores-sprintx.md` (l.24): `V1–V12`
- Modify: `scripts/ci/test-r3-predecessores-sprintx.sh` (l.737, l.856) e `scripts/ci/mutacao-r3-predecessores-sprintx.sh` (l.149)
- Modify: `scripts/ci/validate-mergex-contract.sh` (l.549-565: doze; a varredura de l.553 passa a proibir também `onze verifica`, `11 verifica`, `V1..V11)`, `V1–V11`)

**Interfaces:**
- Consumes: `portao-v12.sh` (Task B1), `causa-do-portao.sh` com v12 (Task B2).
- A seção da V12 diz: a pergunta (cada task `concluida` do escopo tem evidência de revisão aprovada no commit dela?), o comando, a tabela da Task B1, `v12_sem_prova` como FALHA registrada, e que a V12 não lê `revisao:` de `ENTREGA.commits` (lê a evidência no commit, pelo núcleo).

- [ ] **Step 1: Run** `bash scripts/ci/validate-mergex-contract.sh` depois de mudar só a l.549-565 do validador — Expected: FAIL (`README no longer announces twelve checks` etc.), prova de que o texto anterior reprova.
- [ ] **Step 2: Write** o texto nos arquivos acima.
- [ ] **Step 3: Run** `bash scripts/ci/validate-mergex-contract.sh && bash scripts/ci/test-r3-predecessores-sprintx.sh && bash .claude/hooks/teste.sh` — Expected: verdes (o `teste.sh` não muda; ele só tem de continuar passando com o hook novo).
- [ ] **Step 4: Commit** `feat(mergex): portao de prontidao com doze verificacoes (V12 revisao por task)`. Abra a PR 4 (≈ 300 linhas, 18 arquivos).

## Bloco C (PR 5) — E1: a evidência entra no commit da task

### Task C1: `ENTREGA.commits` ganha `revisao:`

**Files:**
- Modify: `.claude/skills/mergex/scripts/sequencia-de-commits.sh` (uso l.42-44; gravador l.297-305; opção l.350)
- Modify: `.claude/skills/mergex/references/00-schema.md` ("A ordem de registro", l.177-209; campo `commits`, l.162)
- Modify: `.claude/skills/mergex/assets/TEMPLATE-ENTREGA.md` (l.47-50)
- Create: `scripts/ci/test-e1-evidencia-revisao.sh`

**Interfaces:**
- Produces: `sequencia-de-commits.sh --acrescentar <ENTREGA.md> <task> <commit> [<revisao>]`, que grava `revisao: <valor>` como quarta chave do item. Gramática do valor: `ok`, `achados`, `indisponivel:<classe>` (`[a-z][a-z-]*`, a classe do motivo antes do segundo `:`) ou `null` quando não há evidência (decisão do coordenador, 2026-10-18). Valor fora da gramática: não grava nada (código 1). Leitura (`--ler`, `--validar`, `prova-de-commit.sh --commits`) ignora a chave e continua aceitando itens sem ela (legado).
- DM-241.

- [ ] **Step 1: Write the failing tests**: `acrescentar com revisao ok grava a quarta chave`; `sem o quarto argumento grava revisao: null`; `motivo com caminho nao entra no YAML` (`indisponivel:arquivo-inexistente:src/a: b.js` → `indisponivel:arquivo-inexistente`; `--validar` e `prova-de-commit.sh --commits` continuam lendo a lista); `valor fora da gramatica nao grava`; `lista legada sem revisao continua valida`.
- [ ] **Step 2: Run** `bash scripts/ci/test-e1-evidencia-revisao.sh` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** o teste e `bash scripts/ci/test-sequencia-commits.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): item de ENTREGA.commits registra a revisao da task`.

### Task C2: o E1 commita a evidência da task atual

**Files:**
- Modify: `.claude/skills/mergex/scripts/fechamento-do-e1.sh` (`separa_metodo` l.524-558: passo novo logo depois, que separa `docs/entregas/<trabalho>/revisao/*.json`; staging A; chamadas a `--acrescentar` l.318 e l.655 passam o valor lido da evidência em stage com `git show ":<caminho>" | jq`)
- Modify: `.claude/hooks/mergex/commit-por-task.sh` (antes da classificação por ownership: a evidência da task atual não é produto)
- Modify: `.claude/skills/mergex/references/01-commits.md` (tabela l.319-325 e "Eles **nunca contam como desvio** e **não entram no commit de uma task**", l.341: a exceção exata; Passo 4 l.580-590: o item com `revisao`)
- Modify: `scripts/ci/test-e1-evidencia-revisao.sh`

**Interfaces:**
- Regra (DM-240): `docs/entregas/<trabalho_id>/revisao/<task atual>.json` suja entra no commit da task sem precisar estar na lista do chamador; `revisao/<outra task>.json` suja fica na árvore, não entra e não para; qualquer outro nome sob `revisao/` (temporário, trava) é produto e segue a regra de desvio (falha fechada). `ownership-da-task.sh` não muda (o validador exige exatamente quatro situações, `validate-mergex-contract.sh` l.873).
- Consumes: o formato da evidência do contrato `expx-revisao` v1 (`resultado`, `motivo`).

- [ ] **Step 1: Write the failing tests**: `evidencia da task atual suja entra no commit sem ser listada`; `evidencia de outra task fica na arvore e nao para o E1`; `item novo tem revisao: ok lido da evidencia em stage`; `sem evidencia: revisao: null`; `T-01.01.json.123.tmp sob revisao/ e desvio`; `hook commit-por-task aceita a evidencia da task atual no stage`; contrato: `01-commits nomeia a excecao da evidencia de revisao` e a frase antiga sem exceção não existe mais.
- [ ] **Step 2: Run** — Expected: FAIL nos sete.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `bash scripts/ci/test-e1-evidencia-revisao.sh && bash scripts/ci/test-trava-e1.sh && bash scripts/ci/test-m4b-arvore-inteira.sh && bash .claude/hooks/teste.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E1 commita a evidencia de revisao junto com a task`.

### Task C3: o E3 classifica a evidência

**Files:**
- Modify: `.claude/skills/mergex/scripts/classificar-atencao.sh` (catálogo l.95-98: linha `mergex|docs/entregas/<trabalho_id>/revisao/<T-NN.MM>.json|-|L4|evidência da revisão por task`; casamento l.338-345)
- Modify: `.claude/skills/mergex/references/03-atencao-humana.md` (tabela l.284-287, a mesma linha)
- Modify: `scripts/ci/test-e1-evidencia-revisao.sh` e `.github/workflows/ci.yml` (passo do teste)

**Interfaces:**
- DM-242: LEITURA RÁPIDA (L4), não DISPENSÁVEL: a evidência não prova conteúdo para o revisor (mesma razão do contrato do E3 sobre o D4); os achados rejeitados vão destacados no PR (Bloco D).
- [ ] **Step 1: Write the failing tests**: `revisao/T-01.01.json do trabalho corrente e L4`; `revisao de outro trabalho e OLHO OBRIGATORIO fora do catalogo`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** script e tabela (o validador já confere que os dois catálogos batem).
- [ ] **Step 4: Run** o teste, `bash scripts/ci/test-atencao-metodo.sh` e `bash scripts/ci/validate-mergex-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E3 classifica a evidencia de revisao por task`. Abra a PR 5 (≈ 360 linhas, 11 arquivos).

## Bloco D1 (PR 6) — E4 e E9: achados rejeitados

### Task D1: o PR lista os achados rejeitados e os removidos sem revisão

**Files:**
- Modify: `.claude/skills/mergex/references/04-descricao-pr.md` (§6, l.147-154: subseção "Revisão por task", com o bloco que lê as evidências do PR)
- Modify: `.claude/skills/mergex/assets/TEMPLATE-PR.md` (depois de l.52: `### Revisão por task`, omitida sem insumo pela regra 10)
- Create: `scripts/ci/test-e4-revisao-por-task.sh`

**Interfaces:**
- Fonte: as evidências alteradas no PR, `git diff --name-only <branch_base>...HEAD -- 'docs/entregas/<trabalho_id>/revisao/*.json'`, lidas em `HEAD` com `jq`. Lista: cada achado `rejeitado` (`arquivo:linha — label — motivo da rejeição`, o motivo de `rejeicoes` pela `identidade`), cada `removidos_sem_revisao`, e cada task `indisponivel:<motivo>`. A seção 6 continua na posição 6; a ordem das onze seções não muda.
- DM-244.
- [ ] **Step 1: Write the failing tests** (bloco extraído do `04-descricao-pr.md` e rodado numa fixture): `lista o achado rejeitado com o motivo`; `lista removidos_sem_revisao`; `sem rejeicao nem removido: a secao e omitida`; `evidencia de outro trabalho nao entra`; contrato: `TEMPLATE-PR tem ### Revisão por task dentro de O que foi testado`.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Write**. **Step 4: Run** — Expected: `5 ok, 0 falha(s)`.
- [ ] **Step 5: Commit** `feat(mergex): descricao do PR lista os achados rejeitados da revisao por task`.

### Task D2: o E9 exige confirmação por achado rejeitado

**Files:**
- Modify: `.claude/skills/mergex/references/09-revisao.md` (Passo 2, l.46-61: coleta dos achados rejeitados no `headRefOid`; "As seis situações", l.375-391, e R6, l.392-404: o achado rejeitado na revisão por task é finding `REJECTED_WITH_EVIDENCE` sem resposta de reviewer, confirmável só pelo operador; "Confirmação humana", l.454-480: a pergunta específica por achado; recusa dura 6 inalterada)
- Modify: `.claude/skills/mergex/assets/TEMPLATE-revisao.md` (bloco de confirmações)
- Create: `scripts/ci/test-e9-revisao-por-task.sh`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Fonte: `git diff --name-only <baseRefOid>...<headRefOid> -- 'docs/entregas/*/revisao/*.json'` e `git show <headRefOid>:<caminho>`; buscar o `headRefOid` como o R4 já faz (DM-213).
- Regra (DM-243): uma confirmação HUMANO OPERADOR por achado (identidade, arquivo:linha, label, motivo), nesta execução; não persiste (DM-224), não vira closure histórico, não resolve thread nenhuma. Sem as confirmações o gate é `BLOQUEADO` confirmável humanamente; recusa → recusa dura 6 (decisão do coordenador, 2026-10-18: interativa, uma por achado). Qualquer achado rejeitado também impede o merge automático (Task M2, condição 6).
- [ ] **Step 1: Write the failing tests**: contrato (o passo 2 coleta as evidências do `headRefOid`; a pergunta por achado existe; o texto diz que não persiste); execução do trecho de coleta numa fixture (`dois achados rejeitados em duas evidencias: duas confirmacoes`; `evidencia so no disco, nao no head: nenhuma`; `achado rejeitado que voltou a aberto no head: nao e confirmacao, e R3`).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Write**. **Step 4: Run** o teste e `bash scripts/ci/validate-review-evidence-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E9 pede confirmacao por achado rejeitado na revisao por task`. Abra a PR 6 (≈ 330 linhas, 7 arquivos).



*Continua em `2026-10-18-mergex-revisao-por-task-e-merge-automatico-parte-2.md` (blocos D2, S1–S2 e M1–M4, PRs 7 a 13, tabela de PRs e dependências externas).*
