# Contrato expx-schema v1 — frontmatter dos arquivos de estado da mergex

Leitura OBRIGATÓRIA em qualquer etapa que grave arquivo de estado (E0, E1, E8).

Um painel de operação lê os arquivos gerados por esta skill para mostrar o que aguarda
revisão. Prosa não é contrato: a mesma informação pode ser escrita de dez formas corretas
para um humano e todas quebram um parser. O frontmatter resolve isso sem prejudicar a
leitura humana — a máquina lê o YAML, a pessoa lê a prosa abaixo dele.

O painel apenas LÊ. Esta skill continua sendo a única a escrever `docs/entregas/`.

## Contrato irmão — sprintx e runx

O `expx-schema v1` é compartilhado com a [`sprintx`](https://github.com/AxisGov/sprintx)
(Build, F1–F6) e a [`runx`](https://github.com/AxisGov/runx) (Run, E1–E5). A mergex
não tem kind compartilhado: ela produz dois kinds, exclusivos dela — o `entrega` e o
`reconciliacao_base` (DM-178, ver "O kind da reconciliação de base").

O que **é** compartilhado são os **nomes dos campos de indexação**. `modulo_afetado`,
`arquivos_alterados` e `palavras_chave` existem nas três skills com **exatamente estes nomes**
e a mesma semântica, ainda que em kinds diferentes (na `sprintx` vivem no `orquestrador` e no
`fechamento`; na `runx`, no `ocorrencia`, no `causa_raiz` e nos relatórios; na mergex, no
`entrega`). Quem indexa os artefatos das três lê o mesmo nome de campo nos três lados:
**renomear de um lado só quebra o índice**, mesmo que o painel continue funcionando.

| Campo | sprintx | runx | mergex |
|---|---|---|---|
| `modulo_afetado` | `orquestrador`, `fechamento` | `ocorrencia`, `relatorio_tecnico`, `relatorio_uso` | `entrega` |
| `arquivos_alterados` | `orquestrador`, `fechamento` | `relatorio_tecnico` | `entrega` |
| `palavras_chave` | `orquestrador`, `fechamento` | `causa_raiz`, `relatorio_tecnico` | **não se aplica** (ver abaixo) |

Ao mudar um destes nomes, mude nas três skills.

**A semântica de `arquivos_alterados` difere de propósito.** Na `sprintx` e na `runx` ele é a
união dos `arquivos` (`cria` + `altera`) das tasks concluídas — o que o plano declarou. Na
mergex ele é o **diff real**. As duas leituras usam o mesmo nome porque respondem à mesma
pergunta ("que caminhos este trabalho tocou") e o índice as trata igual; a mergex é só a fonte
mais precisa das duas, porque é a única que enxerga o versionador. Quando divergem, é a mergex
que está certa — e a divergência já tem lugar próprio: `desvios`.

## Regras universais

Valem para todo arquivo que leva frontmatter:

1. O bloco YAML é a primeira coisa do arquivo, delimitado por `---` antes e depois.
2. Toda chave em `snake_case`, minúscula, sem acento.
3. Todo valor de enum em minúscula e sem acento: `entregue`, nunca `Entregue`.
4. Datas em ISO: `AAAA-MM-DD`. Obtenha a data com `date +%Y-%m-%d` do sistema, nunca de memória.
5. Booleanos: `true` / `false` (sem aspas).
6. Lista vazia é `[]`. Valor ausente é `null`. **NUNCA omita a chave** — o painel
   diferencia "não se aplica" de "esqueceram de escrever".
7. O frontmatter é a única fonte para o painel. A prosa abaixo dele é para humano e
   continua exatamente como esta skill já a produz.
8. Campos de texto no YAML são de UMA linha. Nada de duplicar prosa longa no YAML.
9. `atualizado_em` é reescrito a cada gravação do arquivo.
10. Nenhum caminho absoluto em nenhum valor.

## Enums

| Enum | Valores |
|---|---|
| `expx_tool` | `sprintx` \| `runx` |
| `entregue_por` | `mergex` |
| `tipo_trabalho` | `feature` \| `ocorrencia` |
| `entrega` | `por_trabalho` \| `por_sprint` |
| `estado` | `aberto` \| `entregue` \| `bloqueado` |
| `portao` | `pronto` \| `bloqueado` \| `null` (ainda não rodou) |
| `falhas_portao` (por item) | `v1` … `v12` \| `v1_sem_prova` … `v12_sem_prova` |
| `causa` | ver "A causa do bloqueio" \| `null` (não bloqueado) |
| `pr_estado` | `rascunho` \| `aberto` \| `merged` \| `fechado` \| `null` |
| `sprint_atual` | `planejamento` \| `NN` (dois dígitos, `01`, `02`, ...) \| `null` |
| `estado` (por item de `prs`) | `aberto` \| `rascunho` \| `aguardando_merge` \| `merged` \| `fechado` \| `null` |
| `merge` (por item de `prs`) | `humano` \| `automatico` \| `null` |
| `raio` | `baixo` \| `medio` \| `alto` \| `null` (sem modo legado) |
| `faixa` (por arquivo) | `alta` \| `media` \| `baixa` |
| `origem_base` (no `entrega`) | `registrada_e0` \| `registrada_sprint` \| `inferida_legado` \| `null` (sem versionador) |

`expx_tool` fica como a skill de **origem** do trabalho (`sprintx` ou `runx`) — é ela que
governa o trabalho. O campo `entregue_por: mergex` diz quem gravou este arquivo. Mudar o enum
de `expx_tool` para incluir `mergex` quebraria o painel que lê as três skills (DM-23).

## Cabeçalho comum

Todo arquivo com frontmatter começa com estas quatro chaves, nesta ordem:

```yaml
expx_schema: 1
expx_tool: <sprintx | runx>
kind: <o kind do arquivo>
trabalho_id: <slug da feature ou OC-ID-slug>
```

`trabalho_id` é sempre o mesmo da skill de origem: o `<slug-da-feature>` da sprintx ou o
`<OC-ID>-<slug>` da runx.

## O kind que a mergex produz

### `docs/entregas/<trabalho_id>/ENTREGA.md` → `kind: entrega`

```yaml
---
expx_schema: 1
expx_tool: runx
kind: entrega
trabalho_id: OC-2026-0184-icms-st-base-desconto
entregue_por: mergex
titulo: Corrigir base de calculo do ICMS-ST com desconto incondicional
tipo_trabalho: ocorrencia
tipo_ocorrencia: regra-de-calculo
entrega: por_trabalho
estado: entregue
versionado: true
branch: fix/OC-2026-0184-icms-st-base-desconto
branch_base: main
base_validada_sha: 4c1e9a0b2d3f4e5a6b7c8d9e0f1a2b3c4d5e6f70
origem_base: registrada_e0
reconciliacoes: []
commits:
  - seq: 1
    task: T-01.01
    commit: a3f19c2
  - seq: 2
    task: T-01.02
    commit: 7b2e401
modulo_afetado: [fiscal, relatorios]
arquivos_alterados: [src/fiscal/calculo_icms_st.py, src/fiscal/base_calculo.py, tests/fiscal/test_icms_st_desconto.py]
faixa_atencao:
  - arquivo: src/fiscal/calculo_icms_st.py
    faixa: alta
  - arquivo: src/fiscal/base_calculo.py
    faixa: media
  - arquivo: tests/fiscal/test_icms_st_desconto.py
    faixa: baixa
raio: alto
atencao:
  olho_obrigatorio: 3
  leitura_rapida: 2
  dispensavel: 4
portao: pronto
portao_sha: 7b2e4019c1d8e2f3a4b5c6d7e8f90a1b2c3d4e5f
falhas_portao: []
causa: null
desvios: []
push_feito: true
pr_url: https://github.com/<org>/<repo>/pull/482
pr_estado: rascunho
sprint_atual: null
prs: []
criado_em: 2026-08-27
atualizado_em: 2026-08-29
entregue_em: 2026-08-29
---
```

### Campo a campo

| Campo | Regra |
|---|---|
| `trabalho_id` | O slug da sprintx ou o `<OC-ID>-<slug>` da runx. O mesmo da pasta de origem |
| `entregue_por` | Sempre `mergex` |
| `tipo_ocorrencia` | O tipo da runx; `null` quando `tipo_trabalho: feature` |
| `entrega` | O modo efetivo fixado pelo E0: `por_trabalho` ou `por_sprint`. O valor do plano sobrescreve o do projeto apenas antes do primeiro registro; ausente em entrega antiga é lido como `por_trabalho` |
| `estado` | `aberto` no E0; `entregue` quando o fluxo completou; `bloqueado` quando o portão barrou |
| `versionado` | `false` em repositório sem versionador |
| `branch`, `branch_base` | `null` quando `versionado: false` |
| `base_validada_sha` | SHA de 40 hex da base em que o trabalho foi validado; gravado no E0 (`git merge-base HEAD <branch_base>`); atualizado pelo `reconciliacao-base.sh --registrar` para o `b1_sha` registrado. Nunca nome de ref. `null` sem versionador |
| `origem_base` | `registrada_e0` \| `registrada_sprint` (a base reancorada pelo E0 na primeira retomada depois do PR de planejamento `merged`, sobre a main que contém o `merge_sha` — DM-261) \| `inferida_legado` (gravado uma única vez, pela primeira reconciliação de uma entrega anterior a esta chave — DM-183). Uma reconciliação aberta sobre uma base `registrada_sprint` grava no `RECONCILIACAO-BASE-001.md` `origem_base: registrada_e0`, como sobre qualquer base registrada |
| `reconciliacoes` | Lista `{numero, arquivo, b1_sha, m_sha}`, na ordem da cadeia; `[]` sem reconciliação. Escrita só pelo `--registrar` |
| `portao_sha` | SHA de 40 hex do `HEAD` que o E2 avaliou, gravado com `portao` só por `registrar-portao.sh`; `null` antes do E2 e depois de um `--registrar`. O `--resultado bloqueado` também grava `portao_sha` = `HEAD` avaliado, sem efeito na validade (`portao_nao_pronto` vem antes do SHA). O portão vale só para ele e para os commits de método `pre-e6`/`e8` de um pai que o seguem (DM-181) |
| `commits` | Um item por task commitada, na ordem em que fecharam, cada um com a chave de ordem `seq` e, no item novo, a `revisao` da task; `[]` sem versionador. Ver "A ordem de registro" |
| `modulo_afetado` | Os módulos que a entrega toca (ver abaixo) |
| `arquivos_alterados` | **O diff real** — ver abaixo. É o campo mais importante deste kind |
| `faixa_atencao` | A faixa de atenção por arquivo (ver abaixo) |
| `raio` | A faixa da legadox; `null` sem modo legado — **nunca invente uma faixa** |
| `atencao` | As três contagens do E3; zeros quando o E3 não rodou |
| `portao` | O resultado do E2 |
| `falhas_portao` | As verificações que deram FALHA no E2, na numeração do portão; `[]` quando o portão não rodou ou deu PRONTO. Ver "A causa do bloqueio" |
| `causa` | `null` salvo em `estado: bloqueado`, onde é **obrigatória e não nula**: derivada de `falhas_portao`, nunca escrita à mão. Ver "A causa do bloqueio" |
| `desvios` | Arquivos alterados fora da lista declarada, detectados no E1 e no E2; `[]` quando não houve |
| `push_feito` | `true` só quando o E6 confirmou que o remoto tem o mesmo commit |
| `pr_url` | A URL devolvida pelo E7; `null` quando o PR não foi aberto — **não é falha** |
| `pr_estado` | `rascunho` na abertura normal; `aberto` quando o QA já aprovou; `merged`/`fechado` quando o E9 ou uma pessoa atualizarem |
| `sprint_atual` | `planejamento` no PR de planejamento, `NN` na sprint que o E0 abriu, ou `null` fora dessas entregas. Nunca é relido do plano depois de registrado |
| `prs` | Os PRs do trabalho, um item `{sprint, url, estado, merge_sha, merge, base_sha}` por PR, em YAML de bloco e em sequência. O de planejamento é sempre o primeiro; numa entrega `por_sprint`, seguem `01`, `02`, ... . `pr_url`/`pr_estado` de topo são os da entrega atual |
| `entregue_em` | A data em que o fluxo completou; `null` enquanto `estado` não for `entregue` |

## A entrega por sprint — `entrega`, `sprint_atual` e `prs`

O PR de planejamento (DM-259) leva só os artefatos de método do planejamento (tudo sob
`^docs/(sprintx|entregas|eventos)/`), abre no fim da F5 e tem merge do desenvolvedor, nunca
automático. A entrega dele é marcada por **duas** chaves coerentes, gravadas pelo E0
`--planejamento`:

```yaml
sprint_atual: planejamento
prs:
  - sprint: planejamento
    url: null
    estado: null
    merge_sha: null
    merge: null
    base_sha: null
```

Depois do merge do planejamento, uma entrega `por_sprint` abre uma sprint por vez. O E0 recebe
`--sprint <NN>`, fixa o modo efetivo e acrescenta o item da sprint; por exemplo, durante a 02:

```yaml
entrega: por_sprint
sprint_atual: 02
prs:
  - sprint: planejamento
    url: https://github.com/<org>/<repo>/pull/480
    estado: merged
    merge_sha: 1111111111111111111111111111111111111111
    merge: humano
    base_sha: 0000000000000000000000000000000000000000
  - sprint: 01
    url: https://github.com/<org>/<repo>/pull/481
    estado: merged
    merge_sha: 3333333333333333333333333333333333333333
    merge: humano
    base_sha: 2222222222222222222222222222222222222222
  - sprint: 02
    url: null
    estado: null
    merge_sha: null
    merge: null
    base_sha: null
```

| Campo do item | Regra |
|---|---|
| `sprint` | `planejamento` só no **primeiro** item; depois, `01`, `02`, ... sem lacuna |
| `url` | A URL do PR, gravada pelo E8; `null` antes do E7 |
| `estado` | O enum da tabela; o E8 grava o do E7, o E9 grava `merged` |
| `merge_sha` | O commit de merge, só com `estado: merged`; `null` antes |
| `merge` | `humano` quando o E9 registra o merge; `automatico` só quando o modo automático fizer o merge de uma sprint; **nunca** `automatico` no planejamento |
| `base_sha` | A ponta comprovada da base quando o PR foi integrado: primeiro pai do commit de merge ou squash; num resultado linear, pai único somente quando o serviço prova que o PR/MR tinha um commit. Histórico linear com múltiplos commits falha fechado. Gravada pelo E9 com o merge (DM-269 e DM-267); `null` antes. `diff_refs.start_sha` não serve: é da versão do diff, não do instante do merge. Item sem a chave lê como `null`. A V9 exige `base_sha == merge_sha^1` antes de conferir `base_sha..merge_sha` |

- `prs` é sempre YAML de bloco; a forma em fluxo (`prs: [{...}]`) é ilegível. Lista vazia é `prs: []`.
- Uma chave sem a outra é incoerente: `sprint_atual: planejamento` ou `NN` sem o item
  correspondente em `prs`, ou item de sprint com `sprint_atual: null`. A exceção é a retomada do
  E0 depois do merge do planejamento: `sprint_atual: null` com aquele item `merged`.
- Numa entrega `por_sprint`, cada item anterior ao atual está `merged`; só o último pode estar
  aberto. O E0 só acrescenta a sprint seguinte depois de o E9 registrar o merge da anterior.
- Entrega anterior às três chaves é lida como `entrega: por_trabalho`, `sprint_atual: null` e
  `prs: []`.
- **Ninguém relê estas chaves por conta própria.** O leitor único é
  `scripts/entrega-de-planejamento.sh --entrega <ENTREGA.md> [--rev <commit>]`, que imprime
  `planejamento=sim|nao`, `entrega=`, `sprint_atual=`, o estado do item atual e os itens de `prs`
  (com `sim`, também `estado=`, `merge_sha=` e `base_sha=`; depois da retomada, também
  `planejamento_merge_sha=` e `planejamento_base_sha=`; com o item, `planejamento_url=`, DM-261,
  DM-269 e DM-267) e sai 2 com a entrega
  ilegível ou incoerente. E0, E2, E7, E8 e E9 o consomem.
- `--completar-base <planejamento|NN> --merge-sha <sha> --base-sha <sha>` é a migração
  idempotente de um item histórico `merged` com `base_sha: null`: exige o mesmo `merge_sha`,
  recusa base diferente e não toca `sprint_atual`, `pr_url`, `pr_estado` nem outro item.

## A ordem de registro — a chave `seq`

`commits` é uma lista **ordenada**: o contrato sempre disse "na ordem em que fecharam". Até aqui
essa ordem existia só na **posição física** dos itens, e posição não tem identidade própria. Ela
não sobrevive a uma reordenação (nada prova que houve uma), não distingue duas passagens da mesma
task, não diz numa sessão nova qual foi o último registro, e não dá a um E1 tardio um lugar que
signifique "aconteceu agora".

Por isso **todo item novo leva `seq`**.

```yaml
commits:
  - seq: 15
    task: T-04.03
    commit: 9f3c1aa
```

| Regra | |
|---|---|
| O que é | A **ordem de registro do E1**: a posição deste fechamento na série de fechamentos desta entrega |
| Tipo | Inteiro **positivo** |
| Alcance | **Global à ENTREGA** — um contador só, para todas as tasks e todas as sprints |
| Progressão | O primeiro item é `seq: 1`; cada item novo é **o maior `seq` efetivo existente + 1** |
| Obrigatoriedade | **Obrigatório em toda gravação nova.** A exceção é só de leitura: o prefixo legado, abaixo |
| Nunca | Reutilizado, renumerado, reordenado, diminuído, nem escolhido por task |

**`seq` não é** número da task, número do sprint, timestamp, rodada da F5, nem quantidade de
commits que a branch tem no versionador. Ele conta **registros de E1**, e nada mais.

**A mesma task pode aparecer mais de uma vez, com `seq` diferentes.** Isso é o que já valia para
`commits` (é histórico de execução, não índice de plano — `references/01-commits.md`) e continua
valendo: `seq: 15` e `seq: 22` para `T-04.03` é uma lista correta.

### O prefixo legado — compatibilidade sem migração

Uma `ENTREGA.md` gravada antes desta chave tem itens **sem** `seq`. Ela continua legível, e
**não há migração em massa**: os itens antigos não são reescritos só para ganhar a chave.

```yaml
commits:
  - task: T-01.01
    commit: aaa1111
  - task: T-01.02
    commit: bbb2222
  - seq: 3
    task: T-01.03
    commit: ccc3333
  - seq: 4
    task: T-01.04
    commit: ddd4444
```

- Os itens sem `seq` do **início** da lista formam o **prefixo legado**. A ordem efetiva deles vem
  da posição: o primeiro é 1, o segundo é 2, e assim por diante até N.
- O **primeiro item moderno** acrescentado depois deles recebe **N+1**.
- **Depois que aparece o primeiro `seq`, nenhum item posterior pode voltar a omiti-lo.** A exceção
  é um prefixo, não um modo.

| Lista | |
|---|---|
| `[legado, legado, seq 3, seq 4]` | válida |
| `[seq 1, legado]` | **inválida** |
| `[legado, seq 2, legado]` | **inválida** |

### A invariante da sequência

Considerado o prefixo legado como 1..N, os itens modernos continuam exatamente N+1, N+2, N+3…
Como a ordem efetiva de um item **é** a posição dele na lista, isso se resume a uma igualdade só:

> **todo `seq` explícito é igual à posição do seu item.**

É essa mesma comparação que recusa as quatro formas de lista quebrada — e é por isso que `seq`
também é **prova de integridade do histórico**:

| Lista | Por quê |
|---|---|
| `seq 1`, `seq 1` | duplicata — o mesmo registro contado duas vezes |
| `seq 1`, `seq 3` | buraco — um registro sumiu |
| `seq 1`, `seq 3`, `seq 2` | regressão |
| `seq 2`, `seq 1` | reordenação — a ordem física deixou de bater com a de registro |

**Datas não resolvem isso.** `AAAA-MM-DD` não distingue dois fechamentos do mesmo dia, e o
timestamp do rastro (`docs/eventos/<trabalho_id>.jsonl`) é local da máquina, append-only e não
versionado — não é fonte canônica. A regra geral: **datas são registro; quando há ordem
contratual, existe campo de ordem.**

### Entrega nova

O template continua podendo nascer com `commits: []`. **Não existe `seq` de topo**: o próximo
número sai da própria lista, nunca de um contador guardado à parte. O primeiro E1 daquela entrega
grava `seq: 1`.

### Quem lê e quem escreve

Uma interpretação mecânica só, num script só — `scripts/sequencia-de-commits.sh`:

```
sequencia-de-commits.sh --ler <ENTREGA.md>     # ordem_efetiva, seq, task, commit por item
sequencia-de-commits.sh --validar <ENTREGA.md> # a invariante acima; PARA quando quebra
sequencia-de-commits.sh --proximo <ENTREGA.md> # o maior seq efetivo + 1
sequencia-de-commits.sh --acrescentar <ENTREGA.md> <task> <commit> [<revisao>]
sequencia-de-commits.sh --revisao <valor>      # o valor de revisao como seria gravado
```

- **`--acrescentar` é o escritor do E1** (e do E1 tardio). Ele acrescenta no **fim**, com `seq`,
  e **nunca** reescreve item existente, reordena ou faz backfill do prefixo legado.
- **Gravação nova nunca cria item legado.** Leitura histórica aceita o prefixo; escrita, não.
- A V11 usa a **leitura crua** desse mesmo script (`references/02-prontidao.md`). Ela pergunta se
  existe prova de E1 para a task, e **não** depende de ordem, `seq` ou sequência.

### A chave `revisao` do item (DM-241)

O item novo leva uma quarta chave, `revisao`, com o que o `conferir` do núcleo do expx disse da
task no commit dela (o E1 o chama depois do `git commit`; `references/01-commits.md`, Passo 4):

```yaml
commits:
  - seq: 16
    task: T-04.04
    commit: 1a2b3c4
    revisao: incompleta:L1
```

| Valor | Quando |
|---|---|
| `ok` | `T ok` |
| `achados` | `T FALHA achados-abertos:<n>` |
| `incompleta:<classe>` | `T FALHA incompleta:<motivo>` |
| `indisponivel:<classe>` | `T FALHA indisponivel:<motivo>` |
| `null` | sem evidência no commit da task (`evidencia-ausente`, ou o projeto sem revisão por task) |
| `invalida` | qualquer outra resposta: `evidencia-invalida…`, `evidencia-nao-bate…`, `commit-inexistente…`, saída 64, linha fora da forma, núcleo ou node ausente |

- A **classe** é o texto do motivo antes do segundo `:`, como veio, com
  `[A-Za-z0-9][A-Za-z0-9-]*` (`incompleta:L1:41` → `incompleta:L1`;
  `indisponivel:arquivo-inexistente:src/a.ts` → `indisponivel:arquivo-inexistente`). O resto do
  motivo — um caminho, um número — nunca entra no YAML.
- Valor fora dessa gramática: o `--acrescentar` não grava nada (código 1). O E1 passa o valor
  pelo `--revisao` antes e grava `invalida` no lugar de um que não cabe.
- É **registro**, não prova: a V12 nunca lê esta chave (DM-239) e pergunta de novo ao `conferir`.
  A leitura (`--ler`, `--validar`, `prova-de-commit.sh`) a ignora, e o item legado sem ela
  continua válido.

### Sequência inválida é contrato inválido — e PARA

Duplicata, buraco, regressão e mistura inválida de legado com `seq` **não são causa de negócio do
portão**. Não viram `indeterminada` e não entram em `falhas_portao`: são **violação de contrato do
`ENTREGA.md`**, tratadas como as demais — a gravação para, e ninguém corrige o registro por conta
própria.

**Nunca "conserte" escolhendo outro número.** Se duas sessões calcularem o mesmo próximo `seq` ao
mesmo tempo, o resultado é uma lista com `seq` duplicado — e o certo é parar e mostrar isso. Um
número escolhido para caber esconderia o registro perdido. Este contrato **não resolve corrida**:
ele garante que a corrida, quando acontece, fique visível.

**Quem impede a corrida é o E1**, e não esta chave. O `seq` é atribuído **dentro da seção crítica
do E1** — a trava do índice daquela worktree, descrita em `references/01-commits.md`, "A seção
crítica do E1". A gravação nova de um item só acontece sob essa seção; a **leitura** da lista
(`--ler`, `--validar`, `--proximo`) nunca exige trava nenhuma. A invariante acima continua sendo a
rede de segurança: se um item duplicado chegar à lista por qualquer caminho, ela para.

## Os campos de indexação

Três campos existem para que a entrega seja **indexável por arquivo e por módulo**. Eles são
listas e seguem a regra universal 6: **nunca omita a chave**; vazia é `[]`, jamais ausente.

### `arquivos_alterados` — o diff real, não a previsão do plano

**É o campo mais importante deste kind, e a razão de a mergex ser quem o grava.**

A `sprintx` e a `runx` declaram nas tasks os arquivos que o trabalho *pretende* tocar. A
mergex é a única camada do método que conhece o **diff real**: o que de fato mudou, incluindo
o que ninguém previu e excluindo o que foi previsto e não foi necessário. Um índice alimentado
pela previsão do plano indexa a intenção; alimentado pelo diff, indexa o fato.

- Em `por_trabalho`, a fonte é `git diff --name-only <branch_base>...HEAD`, a mesma base do E3
  (três pontos). Em `por_sprint`, cada E3 acumula em `arquivos_alterados` a união, sem repetição,
  do valor já gravado pelas sprints anteriores com o diff real da sprint atual. Assim a main já
  atualizada não apaga do registro final um caminho entregue antes.
- Caminhos **relativos à raiz do repositório**, na forma exata em que o versionador os devolve.
- Sem repetição, ordenados alfabeticamente.
- Inclui arquivo removido (`D`) e as duas pontas de um renomeado (`R`): o caminho antigo
  deixou de existir e o novo passou a existir, e as duas coisas são histórico daquele caminho.
- Sem versionador (`versionado: false`), é a união dos campos `arquivos` (`cria` + `altera`)
  das tasks **concluídas** — a melhor aproximação disponível. Registre o aviso de que a base
  foi o plano, não o diff.
- Vazio só quando não há diff, o que o E2 já deveria ter barrado.

**Divergência entre `arquivos_alterados` e a lista declarada nas tasks vai para `desvios`, não
para uma correção silenciosa deste campo.** Este campo diz o que aconteceu; `desvios` diz o
que aconteceu fora do previsto. Os dois são verdadeiros ao mesmo tempo.

### `modulo_afetado`

Os módulos que a entrega toca, em minúscula e sem acento, um termo por módulo (`autenticacao`,
não `Autenticação`; `relatorios`, não `Relatórios`). Mesmo nome de campo e mesma semântica da
`sprintx` e da `runx`.

Derivação, nesta ordem de precedência:

1. O `modulo_afetado` já declarado pela skill de origem (`ORQUESTRADOR.md` da sprintx,
   `00-OCORRENCIA.md` da runx). **Existindo, é copiado sem reinterpretar** — a origem é a fonte.
2. Não existindo, derivado dos caminhos de `arquivos_alterados`, pelas camadas do
   `CONVENCOES.md` da stackx quando ele existe, ou pela estrutura de pastas quando não.
3. Não sendo possível derivar com segurança, `[]` e um aviso. **Nunca invente um módulo.**

### `faixa_atencao` — a faixa de atenção por arquivo

Uma lista de objetos `{arquivo, faixa}`, um por arquivo classificado no E3.

```yaml
faixa_atencao:
  - arquivo: src/fiscal/calculo_icms_st.py
    faixa: alta
```

- `arquivo` é um caminho de `arquivos_alterados`, na mesma forma exata. Um caminho aqui que não
  esteja lá é erro de gravação.
- `faixa` usa o vocabulário do índice — `alta` \| `media` \| `baixa` —, não o nome da faixa em
  prosa. O mapeamento é fixo:

| Faixa da mergex (E3) | `faixa` no YAML |
|---|---|
| OLHO OBRIGATÓRIO | `alta` |
| LEITURA RÁPIDA | `media` |
| DISPENSÁVEL | `baixa` |

Este campo é a contraparte **por arquivo** do campo `atencao`, que traz só as contagens. As
contagens dizem quanto de olho humano a entrega pediu; a lista diz **onde**. Sem ela, o
histórico de faixa de um arquivo não existe — e é ele que fecha o ciclo com o memox.

`faixa_atencao` é `[]` enquanto o E3 não rodou (no E0 e durante o E1). Em `por_trabalho`, o E3 a
grava inteira, junto com as contagens. Em `por_sprint`, preserva as entradas das sprints anteriores
e mescla as da sprint atual por caminho; a classificação observada na sprint atual substitui a
anterior quando o mesmo arquivo reaparece. `atencao` continua sendo a contagem do PR atual.

**Por que dois campos e não um.** `atencao` é lido pelo painel para mostrar quanto de revisão
cada PR está pedindo; `faixa_atencao` é lido pelo índice para saber o passado de um caminho.
Derivar um do outro é impossível nos dois sentidos: das contagens não se recupera quais
arquivos, e varrer a lista a cada render do painel custaria mais que ler três inteiros.

### `palavras_chave` — por que a mergex NÃO o grava

`palavras_chave` existe na `sprintx` (no `orquestrador` e no `fechamento`) e na `runx` (no
`causa_raiz` e nos relatórios), e **não existe** no `kind: entrega`. Isso é deliberado, não
esquecimento.

As palavras-chave descrevem **o trabalho** — o assunto, o domínio, o defeito. Quem sabe disso é
a skill que investigou ou planejou: a runx tem a causa raiz, a sprintx tem a descoberta. A
mergex não sabe nada sobre o assunto que já não esteja escrito nesses artefatos; gerar termos
próprios aqui seria conteúdo novo (regra 7), e termos diferentes dos da origem para o mesmo
trabalho quebrariam a busca por termo do índice, que casa string exata.

O índice já encontra o trabalho pelas palavras-chave que a origem gravou, e chega ao
`ENTREGA.md` pelo `trabalho_id`. **Não acrescente `palavras_chave` a este kind** sem que as
três skills concordem sobre quem é a fonte.

A regra prática: a mergex grava o que **só ela** sabe (o diff real, a faixa por arquivo, a
branch, os commits) e copia o que a origem já declarou (`modulo_afetado`). O que ela não sabe,
ela não inventa.

## A causa do bloqueio — `falhas_portao` e `causa`

### Retomada estreita de predecessores SprintX

O estado terminal `bloqueado` só pode voltar a `aberto` pelo protocolo de
`references/13-predecessores-sprintx.md`: bloqueio exclusivo `[v9]`, causa
`arquivo_fora_do_plano`, sem push nem PR, e `desvios` exatamente iguais aos
predecessores historicamente provados. A transição limpa apenas `portao`,
`portao_sha`, `falhas_portao`, `causa` e `desvios`; não altera tasks,
`commits`, base, reconciliações nem datas históricas. O checkpoint
`retomar-v9-predecessores` torna essa reabertura durável antes de um novo E2.

Quando o portão barra, quem vem depois (a buildx, uma sessão futura, uma pessoa) precisa saber
**por que** — lendo o `ENTREGA.md` commitado (`git show <branch>:docs/entregas/<trabalho_id>/ENTREGA.md`),
sem depender da memória da sessão nem da prosa. Duas chaves respondem isso, e as duas seguem a
regra universal 6: **nunca são omitidas**.

- **`falhas_portao`** é o que o portão **viu**: as verificações que deram `FALHA` no E2, como
  lista de uma linha, na numeração do portão (`[v1, v7]`). Uma verificação que **não pôde rodar**
  (o E2 marca `FALHA` porque ausência de prova não é prova) entra como `vN_sem_prova`, nunca como
  `vN`. Gravada pelo E2 junto com `portao` (`references/02-prontidao.md`, "Registro das falhas").
- **`causa`** é **uma** das causas abaixo, derivada **mecanicamente** de `falhas_portao` — e de
  nada mais. Gravada pelo E8 no fechamento bloqueado, junto com `estado: bloqueado`, pelo script
  `scripts/causa-do-portao.sh --derivar`.

A mergex é dona **só da causa observável do portão**. Ela não lê a descrição do `B-NN`, não
interpreta a narrativa de quem executou e não conhece as classes de pendência da buildx: traduzir
`causa` para o que fazer com o trabalho é da buildx.

### O enum — uma causa por verificação, e a ordem de precedência

| Ordem | Verificação | `causa` |
|---|---|---|
| 1 | `v10` | `segredo_no_diff` |
| 2 | `v6` | `auditoria_reprovada` |
| 3 | `v7` | `bloqueio_aberto` |
| 4 | `v8` | `legado_incompleto` |
| 5 | `v9` | `arquivo_fora_do_plano` |
| 6 | `v1` | `tarefa_nao_concluida` |
| 7 | `v2` | `suite_reprovada` |
| 8 | `v3` | `teste_nao_declarado` |
| 9 | `v4` | `regressao_nao_declarada` |
| 10 | `v5` | `qa_nao_aprovado` |
| 11 | `v11` | `commit_nao_registrado` |
| 12 | `v12` | `revisao_reprovada` |

E um valor a mais, que não é causa de trabalho nenhum: **`indeterminada`** — a mergex não
conseguiu provar a causa. Nenhum outro valor existe. `falha_tecnica`, `decisao_humana` ou qualquer
classificação pelo conteúdo do bloqueio **não** são valores deste enum.

**A regra, inteira:** percorra a ordem acima; a primeira verificação presente em
`falhas_portao` decide. Presente como `vN`, a causa é a da linha. Presente como `vN_sem_prova`,
a causa é `indeterminada` — a verificação que decidiria não pôde rodar, e uma causa de ordem
mais baixa, mesmo provada, não é a causa inequívoca.

**Por que esta ordem.** Ela não é um juízo sobre qual falha é mais grave; é o que torna uma
falha consequência da outra:

- `v10` primeiro: é a única verificação que não pode ser pulada por nenhum motivo (regra 5).
- `v6` a `v9` em seguida, na numeração: são **fatos que existem independentemente de a execução
  ter terminado** — o veredito da auditoria (que devolve o plano à F3 e invalida as verificações
  medidas contra ele), o `B-NN` registrado, as pré-condições do modo legado, o arquivo no diff.
- `v1` a `v5`, `v11` e `v12` por último, na numeração: leem o **registro da execução**, que fica
  incompleto justamente quando um daqueles fatos parou o trabalho. O próprio contrato do E2 diz
  isso: task `bloqueada` aponta o `B-NN` (V1 é sintoma da V7), e o QA da runx ausente é o fluxo
  que não chegou ao E4 da runx (V5 é sintoma da V1). A `v11` vem depois das cinco porque a prova de
  E1 que falta é a **última** coisa que a execução registra sobre uma task: com a execução
  interrompida antes (V1), ou com o commit abortado por segredo (V10), a ausência da prova é
  consequência, não causa. A `v12` vem depois dela: ela só confere tasks concluídas e com commit
  registrado, e a evidência de revisão é do commit da task; enquanto a execução não terminou
  (V1) ou o registro do E1 falta (V11), o commit que a revisão tem de cobrir ainda pode mudar, e a
  correção começa por elas (DM-239).

Exemplo: `falhas_portao: [v1, v7]` → `causa: bloqueio_aberto`. `[v1, v2]` →
`tarefa_nao_concluida`. `[v7, v10_sem_prova]` → `indeterminada`. `[v11]` →
`commit_nao_registrado`. `[v11, v12]` → `commit_nao_registrado`. `[v12]` → `revisao_reprovada`.
`[v12_sem_prova]` → `indeterminada`.

**`commit_nao_registrado` não é `tarefa_nao_concluida`.** A task da V11 **está** `concluida` —
o que falta é a prova de E1 dela em `commits`. Quem lê `tarefa_nao_concluida` vai ao `tasks.md`
procurar status; quem lê `commit_nao_registrado` vai à lista `commits` deste mesmo arquivo
procurar o item que falta. Duas evidências diferentes, dois lugares diferentes de correção:
uma causa só para as duas apagaria a diferença justamente onde ela é acionável.

**`revisao_reprovada` não é `commit_nao_registrado`.** A task da V12 está `concluida` e tem o
commit registrado; o que falta é a revisão por task aprovada **no commit dela**, conferida pelo
`conferir` do núcleo (`references/02-prontidao.md`, V12). Quem lê `revisao_reprovada` vai à
evidência de revisão da task (revisar de novo, dividir a task, resolver o achado), não à lista
`commits`.

### Por estado

| `estado` | `portao` | `falhas_portao` | `causa` |
|---|---|---|---|
| `aberto` | `null` ou `pronto` | `[]` | `null` |
| `aberto` (E2 barrou, E8 ainda não fechou) | `bloqueado` | não vazia | `null` |
| `entregue` | `pronto` | `[]` | `null` |
| `bloqueado` | `bloqueado` | não vazia | **não nula**, igual à derivada de `falhas_portao` |

`bloqueado` sem falha registrada não tem causa a derivar: o registro está inconsistente e o E8
não grava — roda o E2 de novo. **Nunca** se escreve uma causa sem as falhas que a sustentam.

`scripts/causa-do-portao.sh --validar <ENTREGA.md>` confere tudo isto antes de o E8 commitar.

### `ENTREGA.md` anterior a estas chaves

Um `ENTREGA.md` gravado antes de `causa` e `falhas_portao` existirem, **sem as duas**:

- **em leitura histórica é aceito** (`--validar-historico`): a causa dele é `ausente` — **não
  commitada**. Quem lê trata assim; ninguém a infere da prosa;
- **como gravação nova é inválido** (`--validar`): toda gravação da mergex a partir daqui leva as
  duas chaves;
- **não há migração em massa**: vale a regra de migração abaixo. A mergex acrescenta as chaves na
  próxima vez que gravar aquele arquivo — e só grava onde o valor é `null`/`[]` por definição (E0
  na retomada, E9 atualizando `pr_estado` de uma entrega `entregue`). **Um bloqueio legado nunca
  ganha causa retroativa**: a causa só existe quando o portão roda de novo.

Um arquivo com **uma** das duas chaves e sem a outra não é legado: é gravação incompleta, e
reprova nos dois modos.

## O kind da reconciliação de base

### `docs/entregas/<trabalho_id>/RECONCILIACAO-BASE-NNN.md` → `kind: reconciliacao_base`

Um arquivo por merge de base integrado depois do E8, com `NNN` de três dígitos, a partir de `001`,
contínuo e sem lacunas. É artefato de método da MergeX: entra no catálogo do checkpoint
`reconciliacao-base` (e nos de `pre-e6` e `e8`), nunca no commit de uma task. **Só o
`reconciliacao-base.sh --registrar` o escreve**: a `assinatura` cobre os SHAs e os arquivos, e
editar à mão a quebra.

```yaml
---
expx_schema: 1
expx_tool: sprintx
kind: reconciliacao_base
trabalho_id: "ft-exemplo"
numero: 1
anterior: null
branch: "feature/ft-exemplo"
branch_base: "main"
origem_base: registrada_e0
b0_sha: <sha de 40 hex>
p1_sha: <sha de 40 hex>
b1_sha: <sha de 40 hex>
m_sha: <sha de 40 hex>
estado: ativa
arquivos:
  - caminho: "tests/ui/exemplo.test.tsx"
    status_base: A
    blob_b1: <sha de 40 hex>
    blob_m: <sha de 40 hex>
    diff_b1_m_sha256: <sha256 de 64 hex>
    motivo: "a feature dividiu o botao em duas etapas"
registrado_em: 2026-10-07
assinatura: <sha256 de 64 hex>
---
```

| Campo | Regra |
|---|---|
| `numero` | Igual ao `NNN` do nome do arquivo |
| `anterior` | `RECONCILIACAO-BASE-<NNN-1>.md`; `null` só no `001` |
| `origem_base` | `registrada_e0` \| `inferida_legado` (só no `001`) \| `reconciliacao_anterior` (do `002` em diante) |
| `b0_sha`, `p1_sha`, `b1_sha`, `m_sha` | SHAs completos, nunca nome de ref; `b0_sha` é o `b1_sha` da anterior |
| `estado` | `ativa` (a última da cadeia) \| `superada` (uma seguinte já a encadeou) |
| `arquivos` | Um item por caminho reconciliado; `[]` quando o merge não exigiu ajuste — é esse artefato que avança a base validada |
| `arquivos[].status_base` | `A` (nasceu entre `B0` e `B1`) \| `M` (mudou entre `B0` e `B1`) |
| `arquivos[].motivo` | Uma linha, não vazia, para o revisor; não entra em prova nem na assinatura |
| `assinatura` | sha256 das linhas canônicas (`numero`, `anterior`, `trabalho_id`, os quatro SHAs e uma linha por arquivo) |

Abaixo do frontmatter, a prosa tem um parágrafo com a base integrada e o merge, e uma tabela por
arquivo (caminho, status na base, motivo); nenhum frontmatter extra, nenhuma cópia de diff. O
contrato completo, com as quatro provas e o diff canônico de `diff_b1_m_sha256`, está em
`references/11-reconciliacao-base.md`. O painel ainda não lê este kind (fora de escopo).

## Arquivos SEM frontmatter

Não recebem frontmatter, porque o painel não os lê individualmente:

- `PR.md` — a descrição do pull request;
- `QA-PACOTE.md` — o pacote executável pelo QA;
- `ATENCAO.md` — a classificação das três faixas.

Não acrescente frontmatter a eles: um `kind` fora deste contrato é uma violação, não uma
extensão. A informação que a máquina precisa dos três já está no `ENTREGA.md` — as contagens
em `atencao`, a faixa por arquivo em `faixa_atencao`, e os caminhos em `arquivos_alterados`.

## Regra de migração — entregas que já existem

Ao abrir um `ENTREGA.md` que já existe e não tem os campos de indexação:

1. A skill os acrescenta na PRÓXIMA VEZ que gravar aquele arquivo, inferindo os valores do
   que já existe: `arquivos_alterados` do diff da branch registrada, `faixa_atencao` do
   `ATENCAO.md` da mesma pasta, `modulo_afetado` da skill de origem.
2. A skill NUNCA reescreve em massa nem sai migrando entregas que não vai tocar.
3. Se um valor não puder ser inferido com segurança, use `[]` e siga — nunca invente, nunca
   pergunte, nunca pare. A chave sempre existe.
4. Migrar o frontmatter NÃO autoriza reescrever a prosa nem apagar o histórico de `commits`.
5. Migrar o frontmatter NÃO autoriza **backfill de `seq`** nos itens que já estão na lista. O
   prefixo legado fica como está, e a chave entra só nos itens novos (ver "O prefixo legado").

## Verificação antes de gravar

- [ ] O bloco `---` é a primeira coisa do arquivo e está fechado.
- [ ] O cabeçalho comum (`expx_schema`, `expx_tool`, `kind`, `trabalho_id`) está presente.
- [ ] Nenhuma chave do kind foi omitida — ausente é `null`/`[]`, nunca chave faltando.
- [ ] Nenhum acento em chave ou em valor de enum.
- [ ] Datas em `AAAA-MM-DD`; `atualizado_em` reescrito nesta gravação.
- [ ] `arquivos_alterados` veio do diff real, sem repetição, e não da previsão das tasks.
- [ ] Todo caminho de `faixa_atencao` está em `arquivos_alterados`.
- [ ] `faixa` usa `alta`/`media`/`baixa`, nunca o nome da faixa em prosa.
- [ ] `modulo_afetado` em minúscula e sem acento.
- [ ] Nenhum caminho absoluto em nenhum valor.
- [ ] `falhas_portao` e `causa` presentes; `causa` não nula só em `estado: bloqueado`, e igual à
      derivada de `falhas_portao` (`scripts/causa-do-portao.sh --validar` passa).
- [ ] Todo item **novo** de `commits` tem `seq`; nenhum item legado ganhou `seq` retroativo
      (`scripts/sequencia-de-commits.sh --validar` passa).
- [ ] `base_validada_sha` e `portao_sha` são SHA de 40 hex ou `null`, nunca nome de ref; nenhum
      dos dois, nem `reconciliacoes`, foi escrito à mão.
