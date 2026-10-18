# Fatiamento por projeto, revisão por task, entrega por sprint sequencial e merge automático — plano de implementação (mergex) — parte 2

Continuação de `2026-10-18-mergex-revisao-por-task-e-merge-automatico.md` (parte 1). O cabeçalho, as Global Constraints e o Review Focus da parte 1 valem para estes blocos.

## Bloco D2 (PR 7) — feature empilhada redirecionada (4.4, item 2)

> A leitura de `revisor_bot` depende da chave nova no leitor do núcleo (dependência D2 do expxdev, no fim do plano). Sem ela, a Task D3 entra sem a parte do bot, e a parte do bot vem num commit seguinte.

### Task D3: sincronizada com a base nova, CI novo e R1–R6 recalculado

**Files:**
- Modify: `.claude/skills/mergex/references/09-revisao.md`:
  - "Antes do impacto: PRs empilhados", l.736-749;
  - inelegíveis, l.751;
  - passo 7, item 5, l.907-917: a releitura confere de novo a sincronização.
- Modify: `.claude/skills/mergex/references/11-reconciliacao-base.md` (início, l.1-14: sincronizar a feature redirecionada é uma integração de base depois do E8 e segue este reference)
- Modify: `.claude/skills/mergex/scripts/leitor-do-projeto.sh` (repassa `EXPX_REVISOR_BOT`)
- Create: `scripts/ci/test-e9-redirecionamento.sh` (com `gh`/`glab` falsos, como `test-r4-cabeca-do-pr.sh`); Modify: `.github/workflows/ci.yml`

**Interfaces:**
- **Quando vale:** o PR teve a base trocada (a predecessora foi mergeada).
- **Condições, todas sobre o `headRefOid` atual:**
  - a ponta da base atual (`baseRefOid`) é ancestral do `headRefOid`, ou seja, o PR está sincronizado;
  - o R1 está verde com checks desse `headRefOid`; como o HEAD é novo, todo check dele é posterior ao redirecionamento;
  - o R1–R6 foi recalculado inteiro;
  - com `EXPX_REVISOR_BOT` não vazio, lido da árvore da base, há uma revisão de um desses logins, comparados exatamente, cujo commit é o `headRefOid`.
- **Motivos de inelegibilidade:** `não sincronizado com a base nova` e `revisão do revisor_bot ausente no HEAD atual`. O motivo `CI anterior ao redirecionamento` vale quando o único verde é de um HEAD anterior.
- **Orientação ao desenvolvedor.** Sincronizar pela reconciliação de base (`references/11-reconciliacao-base.md`: merge registrado, E2, push), que mantém o portão provado. Nunca com commit vazio. O botão de atualizar a branch do serviço faz o mesmo merge sem registro, e o portão aparece vencido para o `pre-push` e para o CI (DM-245).
- **DM-245.**

- [ ] **Step 1: Write the failing tests:**
  - `base nova nao ancestral do head: inelegivel nao sincronizado`;
  - `sincronizado e check verde so de head anterior: inelegivel CI anterior ao redirecionamento`;
  - `sincronizado, CI verde no head, sem revisor_bot: elegivel`;
  - `revisor_bot declarado e revisao so de head anterior: inelegivel`;
  - `login parecido (prefixo) nao conta`;
  - `revisor_bot acrescentado so na cabeca do PR nao vale` (Review Focus 2);
  - contrato: `nunca um commit vazio` e o encaminhamento para a reconciliação.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write.**
- [ ] **Step 4: Run** o teste e `validate-review-evidence-contract.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): feature redirecionada so e elegivel sincronizada, com CI e revisao no HEAD novo`. Abra a PR 7 (≈ 320 linhas, 6 arquivos).

## Bloco S1 (PR 8) — entrega por sprint: o E0 fixa o modo e a sprint

### Task S1: `entrega`, `sprint_atual` e `prs`; o E0 abre a sprint seguinte só depois do merge

**Files:**
- Modify: `.claude/skills/mergex/references/00-schema.md`:
  - exemplo, l.94-145, e "Campo a campo", l.148-176: chaves `entrega: por_trabalho | por_sprint`, `sprint_atual: NN | null` e `prs: [{sprint, url, estado, merge_sha, merge}]`;
  - `estado` do item de `prs`: `aberto | rascunho | aguardando_merge | merged | fechado`; `merge`: `humano | automatico | null`;
  - `pr_url` e `pr_estado` de topo são os da sprint atual;
  - `origem_base` ganha `registrada_sprint`;
  - entrega antiga sem as chaves é lida como `por_trabalho`.
- Modify: `.claude/skills/mergex/assets/TEMPLATE-ENTREGA.md` (l.31-72; `origem_base`, l.45)
- Modify: `.claude/skills/mergex/references/00-abertura.md`:
  - pré-requisitos, l.13-24: o E0 recebe do chamador `--sprint <id fixo>`;
  - passo 5, caso 1, l.203-218: o E0 lê, uma vez, `entrega:` do frontmatter de `00-PLANEJAMENTO.md`, que sobrescreve `EXPX_ENTREGA` do `leitor-do-projeto.sh`; valida o enum e grava `entrega` e `sprint_atual`;
  - caso 2, l.220-242: retomada para a sprint seguinte, só com estas pré-condições conferidas antes de qualquer escrita:
    - o item de `prs` da sprint anterior está `merged`, com `merge_sha` alcançável na base buscada;
    - a base buscada é ancestral do `HEAD`;
    - a sprint informada é a seguinte à registrada;
  - na retomada: `pr_url`/`pr_estado` voltam a `null`, e `base_validada_sha` vira `git merge-base HEAD <base>` com `origem_base: registrada_sprint`. É a única exceção à l.235.
- Modify: `.claude/skills/mergex/references/07-abertura-pr.md` (l.210-211: um PR `merged` de sprint anterior não é retomada)
- Modify: `.claude/skills/mergex/references/08-registro.md`:
  - l.9-23 e l.188-246: o E8 grava o item de `prs` da sprint (`url`, `estado`) com a sprint que o E0 registrou, nunca relida do plano;
  - memox, l.149-186: reindexação só na última sprint; os artefatos de fim de trabalho também.
- Modify: `.claude/skills/mergex/references/integracao/sprintx.md` (l.27-37 e l.103-137: a F6 passa a sprint ao E0; a sprintx atualiza a branch a partir da main depois do merge; o E9 é disparado depois do E8)
- Create: `scripts/ci/test-entrega-por-sprint.sh`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- **Consumes:** `leitor-do-projeto.sh` (`EXPX_ENTREGA`), o frontmatter de `00-PLANEJAMENTO.md` (só no E0) e `--sprint` da F6.
- **Produces:** os valores efetivos na entrega, lidos por E2, E8 e E9.
- **DM-246** (sequencial; base registrada de novo por sprint; quem fixa o modo e a sprint) e **DM-247** (memox e artefatos de fim só na última sprint).

- [ ] **Step 1: Write the failing tests:**
  - `entrega: por_sprint no 00-PLANEJAMENTO sobrescreve por_trabalho do projeto`;
  - `valor fora do enum no plano: E0 para`;
  - `E0 grava entrega e sprint_atual efetivos`;
  - `E0 da sprint 02 recusa com o PR da 01 aberto`;
  - `E0 da sprint 02 recusa com a branch sem a main`;
  - `E0 recusa sprint fora de sequencia`;
  - `squash da sprint 01: V9 da sprint 02 so ve a 02`;
  - `PR merged da sprint anterior nao e retomada`;
  - `E8 grava prs com a sprint registrada mesmo com 00-PLANEJAMENTO alterado depois`;
  - `causa-do-portao --validar e sequencia --validar aceitam a entrega com prs`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write.**
- [ ] **Step 4: Run** o teste, `validate-mergex-contract.sh` e `test-r3-predecessores-sprintx.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): entrega por sprint sequencial com modo e sprint fixados no E0`. Abra a PR 8 (≈ 360 linhas, 9 arquivos).

## Bloco S2 (PR 9) — o portão da sprint atual e `arquivos.remove`

### Task S2: verificações restritas à sprint atual; remoção declarada

**Files:**
- Modify: `.claude/skills/mergex/scripts/ownership-da-task.sh`:
  - lê `arquivos.remove` além de `cria` e `altera`, na classificação do E1 e na `--uniao`;
  - `--uniao … [--sprint NN]` (l.279; uso, l.33-37);
  - `--remocoes <raiz> <origem> <trabalho> --sprint NN` imprime só as remoções declaradas.
- Modify: `.claude/skills/mergex/scripts/portao-v9.sh` (`--sprint NN`, l.100 e l.138; padrão: `sprint_atual` da entrega)
- Modify: `.claude/skills/mergex/references/02-prontidao.md`:
  - "Entrega por sprint — o escopo de cada verificação", depois de l.50;
  - V2, l.88-92: FALHA sem a suíte inteira da sprint;
  - comandos da V9, V11 e V12 com `sprint-<sprint_atual>/tasks.md`.
- Modify: `.claude/skills/mergex/references/01-commits.md` (l.253-287: arquivo removido é da task que o declara em `remove`; renomeação é origem em `remove` e destino em `cria`)
- Modify: `.claude/commands/mergex-check.md` e `.opencode/commands/mergex-check.md`
- Modify: `scripts/ci/test-entrega-por-sprint.sh`

**Interfaces:**
- **Escopo por verificação:**
  - V1, V2, V3, V7, V11 e V12 leem só `sprint-NN/tasks.md`.
  - V9: `B...HEAD` contra a união da sprint atual. Um arquivo de sprint anterior pode reaparecer quando declarado numa task da sprint atual.
  - V10: `branch_base...HEAD`.
  - V6: sobre o trabalho.
  - V4, V5 e V8: inalteradas.
- **`arquivos.remove`** vem da sprintx (dependência S1 da sprintx). Plano sem a chave é lido como lista vazia.
- **DM-248** (escopo), **DM-249** (V2 por sprint) e **DM-250** (`remove` no ownership e na união).

- [ ] **Step 1: Write the failing tests:**
  - `--uniao --sprint 02 so tem a sprint 02`;
  - `arquivo da 01 alterado e declarado na 02 passa na V9`;
  - `nao declarado na 02 e fora_do_plano`;
  - `E1: arquivo removido declarado em remove da task atual entra; so em altera tambem entra no E1, mas --remocoes nao o lista`;
  - `renomeacao com origem em remove e destino em cria e na_task_atual`;
  - `prova-de-commit com sprint-02/tasks.md ignora a 01`;
  - contrato.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** o teste, `test-ownership-task.sh`, `test-m4b-arvore-inteira.sh`, `validate-mergex-contract.sh` — Expected: verdes. O validador continua vendo exatamente quatro situações.
- [ ] **Step 5: Commit** `feat(mergex): portao da sprint atual e remocao declarada em arquivos.remove`. Abra a PR 9 (≈ 340 linhas, 8 arquivos).

