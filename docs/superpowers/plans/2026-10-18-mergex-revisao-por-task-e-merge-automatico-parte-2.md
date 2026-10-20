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
  - o R1 está verde com checks desse `headRefOid` concluídos depois do redirecionamento (o horário do evento de troca de base do serviço). O HEAD pode não mudar, quando a base nova já era ancestral (predecessora mergeada por fast-forward), e um verde de antes, como o `fora-de-main` do gate do conselho, não rodou a suíte contra a base atual;
  - o R1–R6 foi recalculado inteiro;
  - com `EXPX_REVISOR_BOT` não vazio, lido da árvore da base, há uma revisão de um desses logins, comparados exatamente, cujo commit é o `headRefOid` e submetida depois do redirecionamento.
- **Motivos de inelegibilidade:** `não sincronizado com a base nova` e `revisão do revisor_bot ausente no HEAD atual`. O motivo `CI anterior ao redirecionamento` vale quando o único verde é de um HEAD anterior ou anterior ao redirecionamento; a orientação é disparar o CI de novo pelo serviço, contra a base atual.
- **Orientação ao desenvolvedor.** Sincronizar pela reconciliação de base (`references/11-reconciliacao-base.md`: merge registrado, E2, push), que mantém o portão provado. Nunca com commit vazio. O botão de atualizar a branch do serviço faz o mesmo merge sem registro, e o portão aparece vencido para o `pre-push` e para o CI (DM-245).
- **DM-245.**

- [ ] **Step 1: Write the failing tests:**
  - `base nova nao ancestral do head: inelegivel nao sincronizado`;
  - `sincronizado e check verde so de head anterior: inelegivel CI anterior ao redirecionamento`;
  - `head inalterado pelo redirecionamento e check verde so de antes dele: inelegivel CI anterior ao redirecionamento`;
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

## Bloco M1 (PR 10) — condições do merge automático que o Git prova

> Depende da expxdev#53 mergeada e da cópia do núcleo regerada (Task A1).

### Task M1: `scripts/merge-automatico.sh --conferir` (ligado, 3, 4-diff, 5, 7)

**Files:**
- Create: `.claude/skills/mergex/scripts/merge-automatico.sh`
- Create: `scripts/ci/test-merge-automatico.sh`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- **Comando:** `merge-automatico.sh --conferir --entrega <ENTREGA.md> --base <sha> --head <sha> [--raiz <dir>]`.
- **Saída:** uma linha `condicao<TAB>ok|falha|nao_verificavel<TAB>motivo` por condição, depois `regras=merge-automatico-v1` e `resultado=apto|espera`.
- **Códigos:** 0 apto; 1 espera; 2 ambiente (= espera); 64 uso. `merge-automatico.sh --versao` imprime `merge-automatico-v1` (a "versão das regras" da trilha).

| Condição | Como |
|---|---|
| `ligado` | `EXPX_MERGE_AUTOMATICO=sim` em `leitor-do-projeto.sh --rev <base>` |
| `portao` | `validade-do-portao.sh --verificar --rev <head>` `ok=true`: o ATENCAO.md e as evidências do HEAD são os que o portão avaliou |
| 3 `sincronizado` | `<base>` ancestral de `<head>`; `git merge-tree --write-tree <base> <head>` sem conflito |
| 4 `teste_no_diff` | nenhum arquivo de teste com status `D`; nenhum teste renomeado para fora do padrão; nenhuma linha adicionada com marcador de teste desligado que não exista, igual, numa linha removida do mesmo arquivo. O padrão de arquivo de teste e a lista de marcadores (`.skip(`, `xit(`, `xdescribe(`, `.only(`, `.todo(`, `@pytest.mark.skip`, `@pytest.mark.xfail`, `pytest.skip(`, `t.Skip(`, `@Disabled`, `@Ignore`, `[Ignore]`, `[Skip]`) ficam num bloco único do script e na DM-252 |
| 5 `remocao_declarada` | todo `D` de `<base>...<head>` (renomeação: a origem) está em `ownership-da-task.sh --remocoes … --sprint <sprint_atual>`, com os `tasks.md` lidos da árvore de `<head>` (extraídos por `git archive <head>` para uma pasta temporária, removida em `trap`, passada como `<raiz>`), nunca do disco; remoção só em `altera` → `falha` |
| 7 `caminho_protegido` | nenhum caminho alterado casa `EXPX_CAMINHOS_PROTEGIDOS` da base, nem `^\.expx/(fatiamento|hooks)\.json$` |

- **DM-251** (o que é do Git e o que é da plataforma) e **DM-252** (padrões de teste e marcadores; movimento não conta).

- [ ] **Step 1: Write the failing tests:**
  - `nao na base: espera, mesmo sim na cabeca` (Review Focus 2);
  - `.expx/fatiamento.json alterado: caminho_protegido`;
  - `migration padrao: caminho_protegido`;
  - `portao vencido no head: espera`;
  - um caso por marcador, com `teste_no_diff falha`;
  - `marcador movido: ok`;
  - `teste apagado: falha`;
  - `teste renomeado para docs/: falha`;
  - `remocao so em altera: remocao_declarada falha`;
  - `remocao declarada so no tasks.md do disco, nao commitado: remocao_declarada falha`;
  - `renomeacao declarada: ok`;
  - `base nao ancestral: espera`;
  - `conflito: espera`;
  - `tudo ok: apto`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (sem `eval` de dado do PR).
- [ ] **Step 4: Run** — Expected: `N ok, 0 falha(s)`.
- [ ] **Step 5: Commit** `feat(mergex): condicoes do merge automatico que o Git prova`. Abra a PR 10 (≈ 390 linhas, 3 arquivos).

## Bloco M2 (PR 11) — condições de evidência: achados, atenção, suíte e contagem

### Task M2: condições 1 (parte registrada), 4 (contagem), 6 e OLHO OBRIGATÓRIO no `merge-automatico.sh`

**Files:**
- Modify: `.claude/skills/mergex/scripts/merge-automatico.sh`
- Modify: `scripts/ci/test-merge-automatico.sh`

**Interfaces:**

| Condição | Como |
|---|---|
| 1 `suite_da_sprint` | a mesma leitura da V2 por sprint (Task S2) no `<head>`: suíte inteira da sprint registrada e verde |
| 4 `contagem_de_testes` | registro de contagem do fechamento da sprint no `<head>` (campos da sprintx: dependência S2) contra o registro mais recente do mesmo trabalho na árvore de `<base>`. `coletados` não cai; `ignorados` não sobe. Sem registro no head ou na base (primeira sprint, sprintx anterior): `nao_verificavel` → espera |
| 6 `achado_rejeitado` | nenhuma evidência `revisao/*.json` alterada em `<base>...<head>` com achado `rejeitado` (o trecho de coleta da Task D2) |
| `atencao` | as linhas de OLHO OBRIGATÓRIO de `docs/entregas/<slug>/ATENCAO.md` no `<head>`, com o critério tirado da coluna "Por quê": linha sem `O<n>` legível → espera; qualquer `O<n>` diferente de O2 → espera; só O2 → vale a dispensa, abaixo |

- **A dispensa de O2 (DM-253).**
  - **Onde fica:** no frontmatter de `docs/sprintx/features/<slug>/00-PLANEJAMENTO.md`, gravada pela sprintx ao aprovar o plano da sprint (dependência S3 da sprintx):

    ```yaml
    merge_automatico_dispensas:
      - sprint: "02"
        criterio: O2
        por: <nome de quem aprovou>
        em: <AAAA-MM-DD>
        motivo: <texto>
    ```

  - **Quando o E9 a aceita:** só se todas valem, lidas no `<head>`:
    - existe exatamente um item com `sprint` igual à `sprint_atual` da entrega e `criterio: O2`;
    - `por`, `em` e `motivo` estão preenchidos, sem marcador de template;
    - toda task da sprint tem `criterio_aceite` preenchido e os dois testes declarados (a V3 já cobra os testes).
  - **Quando recusa:** item de outra sprint, item sem sprint, `sprint: todas` ou qualquer outra forma global nunca vale.
  - **Na trilha:** a dispensa usada vai citada na trilha (Task M3).

- [ ] **Step 1: Write the failing tests:**
  - `rejeitado em evidencia do PR: espera`;
  - `atencao O3: espera`; `atencao O2 sem dispensa: espera`;
  - `O2 com dispensa da sprint: ok`;
  - `dispensa de outra sprint: espera`; `dispensa global: espera`; `dispensa sem motivo: espera`;
  - `task sem criterio_aceite com dispensa: espera` (Review Focus 4);
  - `linha de atencao sem criterio legivel: espera`;
  - `sem registro de contagem: nao_verificavel e espera`;
  - `coletados cai: falha`; `ignorados sobe: falha`;
  - `suite da sprint ausente: falha`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): merge automatico confere achados, atencao, suite e contagem de testes`. Abra a PR 11 (≈ 360 linhas, 2 arquivos).

## Bloco M3 (PR 12) — a espera, a trilha e o aviso

### Task M3: `scripts/espera-do-merge.sh`, a máquina de estados da espera

**Files:**
- Create: `.claude/skills/mergex/scripts/espera-do-merge.sh`
- Create: `.claude/skills/mergex/references/15-espera-do-merge.md`
- Create: `scripts/ci/test-espera-do-merge.sh`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- **Estado:**
  - Arquivo: `$(git rev-parse --git-path mergex-e9-espera)`, uma linha por PR, com `pr`, `head`, `inicio`, `ultima`, `tentativas`, `estado`, `comentario_id` e `merge_tentado`.
  - Estados: `aguardando` → `apto` → `mergeado`; `aguardando` → `espera_humana`; `aguardando` → `aguardando_merge`, por tempo.
- **Comandos:**
  - `--proxima --pr <n> --head <sha>` imprime `proxima=conferir|cedo|parar` e o motivo:
    - `cedo`: menos de 120 s desde a última tentativa;
    - `parar`: o estado já é terminal (`mergeado`, `espera_humana`, `aguardando_merge`) — devolve o estado como está, sem regravar —, ou o estado é `aguardando` e passaram 30 min desde o `inicio` — só aí grava `aguardando_merge`;
    - HEAD novo mantém o `inicio` e zera o resultado: tudo é recalculado.
  - `--registrar --pr <n> --head <sha> --resultado apto|pendente|espera --motivo <texto>`:
    - `pendente` (CI ou revisão rodando) mantém `aguardando`;
    - `espera` (qualquer condição definitiva) vai a `espera_humana`.
  - `--marcar-merge --pr <n> --head <sha>` sai 1 se já houve tentativa para esse par: a idempotência do merge.
  - `--comentario-id …` grava e lê o id do comentário da trilha.
- **Trilha (DM-254):**
  - **Comentário único no PR, com o marcador `<!-- mergex:merge-automatico pr=<n> -->`:** achado pela leitura paginada de todos os comentários (DM-222) e editado no lugar, nunca recriado.
  - **Conteúdo do comentário:**
    - SHA da base e do HEAD;
    - checks com conclusão e URL;
    - `regras=merge-automatico-v1`;
    - resultado de cada condição;
    - dispensa usada;
    - horário UTC;
    - executor (`mergex E9 automático`, com a conta usada).
  - **Rastro:** evento `veredito_emitido` com `fase: e9`, sem evento novo (DS-180).
  - **`ENTREGA.md`:** a seção de prosa `## Merges automáticos`, só local, levada ao histórico pelo `pre-e2` da sprint seguinte quando ela existe.
- **Aviso:** na saída da sessão, a cada transição terminal.
- **`aguardando_merge`:** a mergex grava `prs[].estado: aguardando_merge`, avisa e devolve `resultado=aguardando_merge` ao chamador. O bloqueio em `00-BLOQUEIOS.md` é da sprintx (dependência S4).
- **DM-254** (trilha) e **DM-255** (máquina de estados).

- [ ] **Step 1: Write the failing tests:**
  - `duas chamadas em 60 s: a segunda e cedo`;
  - `30 min sem apto: aguardando_merge e parar`;
  - `estado terminal (mergeado, espera_humana) passados 30 min: parar sem regravar o estado`;
  - `head novo: tudo recalculado, inicio mantido`;
  - `marcar-merge duas vezes no mesmo head: a segunda recusa`;
  - `comentario existente de passagem anterior e editado, nao duplicado` (com `gh` falso que conta as chamadas);
  - `espera definitiva para na hora`;
  - `estado ilegivel: parar com motivo, nunca apto` (Review Focus 5).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): espera do merge automatico com estado idempotente e trilha unica no PR`. Abra a PR 12 (≈ 390 linhas, 4 arquivos).

## Bloco M4 (PR 13) — o E9 automático

### Task M4: modo automático do E9, regras da skill e o Codex

**Files:**
- Create: `.claude/skills/mergex/references/14-merge-automatico.md`:
  - **Disparo:** pela sprintx, depois do E8, só para o PR da sprint atual do trabalho atual.
  - **Kill switch:** `EXPX_MERGE_AUTOMATICO` lido da base a cada tentativa.
  - **Ciclo:** a cada `proxima=conferir`, recalcula as condições 1 e 2 da plataforma (gate R1–R6, CI verde no HEAD, nenhuma thread sem resposta, nenhum pedido de mudança) e roda `merge-automatico.sh --conferir`.
  - **Merge:** com `apto`, faz a revalidação do item 5 do passo 7, `--marcar-merge` e o merge preso ao SHA.
  - **Fechamento:** grava no item de `prs` da sprint atual `estado: merged`, `merge_sha` e `merge: automatico`; grava também `pr_estado: merged` de topo, que é o da sprint atual (Task S1), e, como o item 7 do passo 7, em `.expx/estado.json` quando o PR é do trabalho atual; e atualiza a trilha.
- Modify: `.claude/skills/mergex/references/09-revisao.md`:
  - pré-requisitos, l.11-25: o modo automático e o link;
  - passo 7, item 7, l.961: `prs`;
  - recusas duras, l.979-996: as recusas 3 e 4 têm uma exceção só, o modo automático com `apto`. Na recusa 4, OLHO OBRIGATÓRIO segue a condição `atencao` (Task M2).
- Modify: `.claude/skills/mergex/SKILL.md` (regras 16 e 17, l.225-226), `AGENTS.md` (l.19) e `.claude/commands/mergex-revisar.md` (l.30): a exceção, só com `merge_automatico` ligado na base.
- Modify: `decisoes/revisao-por-task-e-entrega-por-sprint.md` (DM-256)
- Create: `scripts/ci/test-e9-merge-automatico.sh`; Modify: `.github/workflows/ci.yml`

**Interfaces:**
- **O Codex na mergex (DM-256).** Só parecer técnico. Quando a espera termina em `espera_humana` ou `aguardando_merge` e o `codex` existe, o E9 pode anexar ao aviso a saída de `codex exec --sandbox read-only "<pergunta técnica sobre o motivo>"`, marcada como parecer. O parecer:
  - nunca muda condição, resultado do portão ou gate;
  - nunca vale como confirmação humana;
  - nunca fecha decisão.

  Sem o `codex`, segue sem parecer.
- **Sem o modo ligado:** o E9 manual não muda.

- [ ] **Step 1: Write the failing tests** (contrato e trechos com `gh` falso):
  - `modo nao: E9 pergunta como hoje`;
  - `sim e apto: merge com --match-head-commit, prs.merge automatico, trilha editada`;
  - `fechamento automatico: pr_estado de topo e prs da sprint ficam merged`;
  - `HEAD muda entre conferir e merge: nao mergeia e recalcula`;
  - `gate BLOQUEADO: espera_humana com o motivo`;
  - `CI pendente: aguardando`;
  - `recusas 3 e 4 citam a excecao unica`;
  - `regra 16 nomeia a excecao`;
  - `parecer do codex nunca muda o resultado` (o texto proíbe; o trecho do aviso só anexa);
  - o texto antigo, sem a exceção, reprova.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write.**
- [ ] **Step 4: Run** o teste, os dois validadores e `bash .claude/hooks/teste.sh` — Expected: verdes.
- [ ] **Step 5: Commit** `feat(mergex): E9 faz o merge automatico quando o projeto liga e todas as condicoes valem`. Abra a PR 13 (≈ 360 linhas, 9 arquivos).

## Tabela de PRs

| PR | Bloco | Assunto | Linhas | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | A1 | cópia do núcleo nos testes; espelho do verificador (F2c, sha256) | ≈220 | 6 | — |
| 2 | A2 | `leitor-do-projeto.sh`; E7 com o leitor do SHA publicado | ≈380 | 7 | PR 1 |
| 3 | B1 | `portao-v12.sh` | ≈390 | 3 | PR 2 |
| 4 | B2 | causa v12 e "doze verificações" | ≈300 | 18 | PR 3 |
| 5 | C | evidência no commit da task; `revisao:`; E3 | ≈360 | 11 | PR 4 |
| 6 | D1 | E4 lista os rejeitados; E9 confirma um a um | ≈330 | 7 | PR 5 |
| 7 | D2 | feature empilhada redirecionada; `revisor_bot` | ≈320 | 6 | PR 2; expxdev D2 |
| 8 | S1 | E0 fixa o modo e a sprint; `prs`; E7; E8 | ≈360 | 9 | PR 2 |
| 9 | S2 | portão da sprint atual; `arquivos.remove` | ≈340 | 8 | PR 8; sprintx S1 |
| 10 | M1 | merge automático: condições do Git | ≈390 | 3 | PR 9; expxdev#53 |
| 11 | M2 | achados, atenção e dispensa de O2, suíte, contagem | ≈360 | 2 | PR 10, PR 6; sprintx S2/S3 |
| 12 | M3 | espera idempotente, trilha e aviso | ≈390 | 4 | PR 11 |
| 13 | M4 | E9 automático; regras 16/17; Codex | ≈360 | 9 | PR 12 |

## Dependências externas

**expxdev**
- **#53** (`feat/leitor-merge-automatico`): `merge_automatico {ativo, caminhos_protegidos}` → `EXPX_MERGE_AUTOMATICO=sim|nao` e `EXPX_CAMINHOS_PROTEGIDOS` (ERE unidas por `|`, padrão mais projeto). Os nomes foram conferidos na branch, em e61d79b. Bloqueia M1.
- **D2 (PR pequena nova):** chave `revisor_bot` no leitor.
  - Formato no `.expx/fatiamento.json`: `"revisor_bot": ["login-exato", "outro[bot]"]`, uma lista de logins exatos, cada um casando `^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$`; lista vazia ou ausente = nenhum.
  - Saída do leitor: `EXPX_REVISOR_BOT=login1,login2` (vírgula, porque login não tem vírgula).
  - Validação estrita como as demais chaves. Bloqueia a parte do bot da Task D3.
- **Release com #51, #53 e D2**, para a Task A1 regerar a cópia do núcleo.

**sprintx**
- **S1:** campo `arquivos.remove` nas tasks (lista; renomeação = origem em `remove` e destino em `cria`). Bloqueia a condição 5 e a regra do E1 com remoção.
- **S2:** registro de contagem no fechamento da sprint (comando, coletados, aprovados, ignorados, CI de referência), em campos de frontmatter que a mergex leia sem prosa. Os nomes dos campos saem do plano da sprintx e entram na Task M2. Sem eles, a contagem fica `nao_verificavel` e o merge espera.
- **S3:** gravar `merge_automatico_dispensas` no `00-PLANEJAMENTO.md` (formato da Task M2) ao aprovar o plano da sprint, com quem, quando e motivo, e só para aquela sprint.
- **S4:**
  - F6 passa `--sprint <id fixo>` ao E0;
  - `entrega:` no frontmatter do `00-PLANEJAMENTO.md`;
  - atualizar a branch a partir da main depois do merge;
  - disparar o E9 depois do E8;
  - registrar o bloqueio `aguardando_merge` quando a mergex o devolve.

## Pergunta que resta

1. **A dispensa de O2 é escrita pela sprintx, com a conta do agente.** O E9 confere a forma e o escopo (só aquela sprint, campos completos, critérios de aceite com teste), mas não consegue provar que foi o desenvolvedor quem a deu: mesma limitação de proveniência da DM-223. O plano aceita o registro como está e o expõe na trilha do PR. Se for preciso prova de autoria (por exemplo, a dispensa confirmada de forma interativa no E9 da própria sprint), é uma condição a mais na Task M2.

> **Emendado em 2026-10-20** pela emenda "limites do CodeAnt, fixos": onde este texto diverge da lista "Emendas aos planos antigos" de `2026-10-20-mergex-limites-do-codeant-parte-2.md`, vale a lista. A1–A4 estão concluídos e superados pelos blocos L0 e L1 daquele plano; o B1 foi reescrito lá. A nota fica no fim para não mudar os números de linha citados.
