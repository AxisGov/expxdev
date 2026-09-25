# E0 — ABERTURA

Você está no E0. Esta etapa roda **quando o trabalho começa**, não no fim: acionada pela `sprintx` no início da F6 e pela `runx` no início do E3, antes da primeira task.

Objetivo: garantir que exista uma branch própria para este trabalho, nascida antes da primeira linha de código, sem passar por cima do trabalho não salvo de ninguém.

**A branch pode já existir, e normalmente existe.** A `sprintx` abre a feature em `feature/<slug>` e em `git worktree` próprio já na F1 (regra 21 dela), muito antes da F6. Quando a skill de origem já criou branch ou worktree, o E0 **adota** o que existe: ele registra e valida a entrega, e **nunca cria uma segunda branch para o mesmo trabalho**.

Você não pergunta nada e não pede autorização. O E0 para em dois casos, e nos dois **para e avisa** — não é pergunta, é bloqueio: árvore suja quando seria preciso criar ou trocar de branch (passo 4, caso C), e branch alvo em uso por outro worktree (passo 4, caso B).

## Pré-requisitos verificáveis

Existe um trabalho em andamento com `trabalho_id` conhecido. Procure o `ORQUESTRADOR.md` nesta ordem, parando no primeiro que existir:

| Origem | Ordem de busca |
|---|---|
| sprintx | 1. `docs/sprintx/features/<slug>/ORQUESTRADOR.md` (canônico) · 2. `docs/<slug>/ORQUESTRADOR.md` (formato antigo) |
| runx | `docs/manutencao/<OC-ID>-<slug>/ORQUESTRADOR.md` |

O canônico da sprintx é `docs/sprintx/features/<slug>/`; `docs/<slug>/` é o formato anterior, que a sprintx continua suportando em pastas já existentes. Registre qual dos dois respondeu — todas as etapas seguintes (E2, E3, E4) leem a **mesma** pasta.

**Nunca mova a pasta legada.** Migrar é decisão do usuário, e mover por conta própria quebraria links e histórico do repositório dele. A mergex trabalha onde a pasta está.

Se nenhum deles existe, não há trabalho para abrir. Diga que a mergex precisa de um trabalho planejado (F4 da sprintx ou E2 da runx) e encerre sem criar nada.

## Passo 1 — Detectar se o repositório usa versionamento

```
git rev-parse --is-inside-work-tree
```

**Se o comando falhar ou não houver `git`:** o repositório não usa versionamento. Registre no `ENTREGA.md` (passo 5) `versionado: false` e **siga o trabalho normalmente, sem nenhuma operação de versionamento**. Ausência de versionador nunca é erro nem bloqueio (regra 15).

Nesse modo, E0, E1, E6 e E7 não têm o que fazer; E2, E3, E4, E5 e E8 continuam valendo — a classificação de atenção é feita sobre os arquivos declarados nas tasks em vez do diff, e o revisor recebe `PR.md` como documento.

Confirme também a raiz do repositório, que ancora `docs/entregas/`:

```
git rev-parse --show-toplevel
```

Num `git worktree`, isso devolve a raiz **do worktree** — que é onde o trabalho está acontecendo, e onde `docs/entregas/` deve nascer.

## Passo 2 — Determinar o nome da branch do trabalho

Convenção padrão da mergex:

| Origem | Padrão |
|---|---|
| trabalho da sprintx | `feature/<slug>` |
| `tipo: bug` da runx | `fix/<OC-ID>-<slug>` |
| demais tipos da runx (melhoria, campo novo, novo relatório, regra de cálculo) | `chore/<OC-ID>-<slug>` |

**Convenção detectada no repositório ou declarada no `CONVENCOES.md` da stackx vence a padrão acima** (regra 14). Para detectar, olhe os prefixos das branches existentes:

```
git branch -a --format='%(refname:short)'
```

Se a maioria das branches de trabalho usa outro prefixo ou outro separador, siga o que o repositório faz e registre a decisão no `ENTREGA.md`.

O `<slug>` é o mesmo já usado pela skill de origem — não gere um novo.

**Se a skill de origem já abriu a branch do trabalho**, o nome dela vence esta convenção: é o nome que já está no repositório. A `sprintx` registra o worktree na chave `worktree` do `ORQUESTRADOR.md`, e a branch na prosa dele; `git branch --show-current` confirma. Renomear a branch de alguém não é assunto do E0.

## Passo 3 — Determinar a branch base

Nesta ordem, parando no primeiro que responder:

1. **Base informada pelo chamador** — a skill que acionou o E0 declarou explicitamente de qual base este trabalho deve sair.
2. **Convenção declarada:** `docs/stack/CONVENCOES.md` da stackx, se existir, na seção de versionamento. Ponto marcado como `PROPOSTA` **não governa**: vira aviso, não regra.
3. **Convenção detectada no repositório:** a branch padrão do remoto —
   ```
   git symbolic-ref refs/remotes/origin/HEAD
   ```
4. **A principal atual:** a branch em que o repositório está agora (`git branch --show-current`), se ela for `main`, `master`, `develop` ou equivalente detectada.

### Quando a base é informada pelo chamador

Ela é a mais alta porque é a única que carrega informação que o repositório não tem: qual árvore este trabalho precisa enxergar. Duas exigências, e nenhuma é negociável:

- **Valide que a ref existe**, antes de usá-la:
  ```
  git rev-parse --verify --quiet <base-informada>
  ```
- **Ref inexistente ou ambígua não vira outra base em silêncio.** Pare, diga qual base foi pedida e que ela não existe, e encerre o E0 sem criar nem trocar branch. Cair para `origin/HEAD` sem avisar faria o trabalho nascer de uma árvore diferente da que o chamador pediu — e ninguém descobriria até o diff da entrega vir errado. Valide a ref e **nunca substitua silenciosamente por outra** base.

```
mergex E0 BLOQUEADO — base informada não existe

Base pedida pelo chamador: <base>
git rev-parse --verify não a encontrou neste repositório.

Nenhuma branch foi criada nem trocada. Crie a base, ou chame o E0 sem base
explícita para usar a convenção do repositório.
```

Registre qual das quatro respondeu. A base efetiva vai para `branch_base` no `ENTREGA.md`, e é ela que o E2 (V9, V10), o E3 e o E4 usam no `git diff <branch-base>...HEAD`.

Se a branch atual **não** for a base determinada e já for uma branch de trabalho de outra coisa, use a base determinada como ponto de partida — nunca ramifique um trabalho de dentro de outro sem que isso esteja declarado.

## Passo 4 — Adotar, criar ou trocar a branch

Verifique **antes** de qualquer operação:

```
git branch --show-current
git rev-parse --verify --quiet <nome-da-branch>
git worktree list --porcelain
```

Os três casos abaixo são exaustivos e mutuamente exclusivos. Resolva o primeiro que se aplicar.

### Caso A — a branch ativa já é a branch do trabalho

A skill de origem já abriu a branch e a sessão já está dentro dela — é o caminho normal quando a `sprintx` criou o worktree na F1.

**Adote.** Nesse caso:

- **não execute `git switch`** — não há para onde ir, e trocar para a branch em que já se está é operação sem efeito que só pode falhar;
- não crie branch nenhuma;
- **não exija árvore limpa.** Reconhecer que o processo já está na branch certa não mexe em arquivo nenhum, e os artefatos de F1 a F5 do próprio trabalho estão ali, ainda não commitados, exatamente como deveriam estar;
- registre no `ENTREGA.md` que a branch foi **adotada** da skill de origem, com a base efetiva.

Siga direto para o passo 5.

### Caso B — a branch alvo existe e está em uso por outro worktree

`git worktree list --porcelain` lista, para cada worktree, o `worktree <caminho>` e o `branch refs/heads/<nome>`. Se a branch alvo aparece num worktree que **não** é o atual, ela está em uso lá.

**Pare e avise.** Não troque, não crie outra, **nunca remova o worktree de ninguém**, nunca force:

```
mergex E0 — a branch deste trabalho está em outro worktree

Branch: <nome-da-branch>
Worktree: <caminho que o git worktree list devolveu>

O git não permite duas árvores na mesma branch, e a mergex não mexe na árvore
de ninguém. Continue o trabalho de dentro daquele diretório: rode /mergex-abrir
lá, e o E0 adota a branch normalmente (caso A).
```

E encerre o E0 sem alterar nada.

### Caso C — criar ou trocar branch

Só aqui a mergex mexe na posição da árvore: a branch do trabalho não existe (criar), ou existe e não está ativa nem em outro worktree (trocar).

**Exija árvore limpa primeiro:**

```
git status --porcelain
```

**Saída vazia:** siga.

**Qualquer linha na saída:** há alteração não commitada pendente. **PARE.** Não crie branch, não troque de branch, não commite, não guarde em stash, não descarte nada (regra 2).

```
mergex E0 BLOQUEADO — árvore de trabalho suja

Há alteração não commitada em:
  <lista dos arquivos de git status --porcelain>

A mergex não cria nem troca branch por cima de trabalho não salvo.
Commite, guarde em stash ou descarte essas alterações e rode /mergex-abrir de novo.
```

E encerre o E0. Quem decide o destino daquele trabalho é a pessoa, não a skill.

Arquivo apenas não rastreado (`??`) também conta: pode ser trabalho de alguém. A skill não julga o conteúdo.

**Árvore limpa é pré-condição para criar ou trocar branch, não para reconhecer que o processo já está na branch certa.** É o que a regra 2 diz literalmente — o risco que ela existe para evitar é o de uma troca de branch carregar ou destruir trabalho não salvo, e adotar (caso A) não troca nada.

Com a árvore limpa:

| Situação | Comando |
|---|---|
| A branch já existe | `git switch <nome>` — **retome nela, nunca crie outra** |
| A branch não existe | `git switch -c <nome-da-branch> <branch-base>` |

Confirme depois com `git branch --show-current`. Se a operação falhou, relate o erro do versionador literalmente e encerre — não tente contornar.

## Passo 5 — Registrar

Três gravações: duas de método, e uma terceira que é só exibição.

**1. No `ORQUESTRADOR.md` do trabalho** (da sprintx ou da runx, na pasta que os pré-requisitos encontraram), acrescente ou atualize a linha da branch, na prosa:

```
Branch do trabalho: <nome-da-branch> (base: <branch-base>) — <aberta | retomada | adotada> em <AAAA-MM-DD> pela mergex
```

`adotada` é o caso A: a branch é da skill de origem, e a mergex só a registrou. Obtenha a data com `date +%Y-%m-%d` do sistema, nunca de memória. Não reescreva mais nada do `ORQUESTRADOR.md`: a mergex só acrescenta essa linha.

**2. `docs/entregas/<trabalho_id>/ENTREGA.md` — criar ou retomar.**

O E0 é chamado no **início de toda F6**, inclusive quando a mesma feature volta do
replanejamento (portão bloqueado → replaneja → F3/F4/F5 → F6 de novo → E0 de novo). Por isso ele
é **idempotente**: nunca recria do zero um registro que já existe, e nunca apaga história.

**CASO 1 — o arquivo não existe.** Crie a partir de `assets/TEMPLATE-ENTREGA.md`, com estado **aberto**:

- `estado: aberto`
- `branch` e `branch_base` preenchidos — `branch_base` é a **base efetiva** determinada no passo 3
- `versionado: true` (ou `false`, se o passo 1 assim determinou)
- `commits: []` — a lista cresce no E1, e o primeiro item dela recebe `seq: 1`. **Não existe `seq` de topo**: o próximo número sai da própria lista (`00-schema.md`, "A ordem de registro")
- `portao: null`, `falhas_portao: []`, `causa: null`, `push_feito: false`, `pr_url: null`, `pr_estado: null`
- `criado_em` e `atualizado_em` com a data de hoje

Na prosa, a linha da branch diz como ela chegou até aqui — `aberta pela mergex`, `retomada` ou `adotada da skill de origem` — e de onde saiu a base (chamador, `CONVENCOES.md`, `origin/HEAD` ou principal atual). É o que permite, depois, entender um diff que não bate com `main`.

Crie a pasta `docs/entregas/<trabalho_id>/` se não existir. Leia o contrato do frontmatter em `08-registro.md` antes de gravar.

**CASO 2 — o arquivo existe, é do mesmo `trabalho_id` e declara a mesma branch: é RETOMADA.**
Atualize **somente o necessário** para abrir uma nova tentativa de entrega:

| Campo | Na retomada |
|---|---|
| `estado` | volta para `aberto` |
| `portao` | volta para `null` — o veredito da tentativa anterior não vale para esta |
| `falhas_portao`, `causa` | voltam para `[]` e `null`, junto com o veredito. Arquivo anterior a estas chaves ganha as duas agora (`00-schema.md`, "A causa do bloqueio"); a causa da tentativa anterior continua no histórico da branch, nunca é copiada para esta |
| `push_feito` | volta para `false` |
| `commits` | **preservado. Nunca zere** — é o histórico de execução (ver `01-commits.md`). A série de `seq` **continua de onde parou**: a retomada nunca reinicia em 1 nem renumera o que já está gravado |
| `criado_em` | preservado |
| `desvios` | preservado enquanto continuar verdadeiro |
| `pr_url`, `pr_estado` | **preservados como estão.** O E0 não verifica e não afirma que aquele PR ainda vale; quem confirma é o E7, que já trata "PR já existe" como retomada. **Nunca abra um segundo PR e nunca recrie a branch** |
| `branch`, `branch_base` | coerentes com a branch adotada e com a base efetiva do passo 3 |
| `atualizado_em` | a data de hoje |
| prosa | acrescente que **esta é uma retomada** — e, quando for o caso, que a tentativa anterior parou no portão |

Nunca apague, na retomada: `commits`, `criado_em`, a prosa que ainda é válida, e os desvios que
continuam verdadeiros. Recriar o arquivo do zero apagaria o histórico de execução de um trabalho
que só voltou para o começo da entrega, não para o começo do mundo.

**CASO 3 — o arquivo existe mas declara outra branch.** Não é retomada desta branch. **Pare e
relate**, sem reescrever nada: ou o `trabalho_id` está sendo reaproveitado por outro trabalho, ou
alguém trocou a branch por fora — as duas coisas são decisão humana.

**3. Atualize `.expx/estado.json`**, o arquivo que a barra de status lê:

- `branch`: o nome da branch, **completo e sem corte** — a criada agora, a retomada ou a adotada;
- `pr_estado`: `null` — no E0 nunca existe pull request, inclusive na retomada de uma branch
  cujo PR já tenha sido aberto antes. Se ele já existia, o E7 o repõe.

**Repositório sem versionador (passo 1): não grave nada.** Os dois campos ficam `null`, que
é o valor que já têm.

O procedimento é o de `10-estado.md`: só se `.expx/` existir, alterando apenas estes dois
campos e preservando os das outras skills, com gravação em temporário e renomeação. Falha de
gravação vai para o rastro e **não interrompe o E0** — a barra nunca barra trabalho.

## Critério de saída

O E0 terminou quando **todas** são verdade:

- [ ] A detecção de versionamento foi feita e registrada.
- [ ] O `ORQUESTRADOR.md` do trabalho foi localizado, e a pasta encontrada (canônica ou legada) está registrada.
- [ ] A branch do trabalho existe e está ativa — criada agora, retomada ou adotada da skill de origem.
- [ ] Nenhuma segunda branch foi criada para este trabalho.
- [ ] `git status --porcelain` estava vazio na hora de criar ou trocar a branch (ou o repositório não é versionado, ou a branch foi adotada sem troca).
- [ ] `ORQUESTRADOR.md` tem a linha da branch.
- [ ] `docs/entregas/<trabalho_id>/ENTREGA.md` existe com `estado: aberto` e frontmatter válido.
- [ ] `.expx/estado.json` tem `branch` e `pr_estado: null` — **ou** `.expx/` não existe, ou o repositório não é versionado, e nesses casos nada foi gravado. Este item nunca reprova o E0.

Devolva ao chamador uma linha só: `mergex E0 OK — branch <nome> (base <base>, <criada | retomada | adotada>), entrega registrada.` E devolva o controle: quem executa as tasks é a skill de origem.

## Quando falha

| Situação | O que fazer |
|---|---|
| Sem `git` / sem repositório | `versionado: false`, segue sem versionamento, sem erro (regra 15) |
| Branch ativa já é a do trabalho | Adota: não troca, não cria, não exige árvore limpa (caso A) |
| Branch alvo em outro worktree | Informa o caminho e encerra; nunca troca, nunca remove worktree (caso B) |
| Árvore suja ao criar ou trocar | PARA e avisa, sem criar nem trocar branch (regra 2) |
| Branch já existe e está livre | Retoma nela, não cria outra |
| Base informada pelo chamador não existe | PARA e avisa; nunca cai para outra base em silêncio |
| Branch base não determinável | Usa a branch atual, registra a incerteza como aviso no `ENTREGA.md` |
| `git switch -c` falha | Relata o erro literal e encerra; nunca força, nunca descarta nada |
| Sem trabalho planejado | Diz o que falta (F4 da sprintx / E2 da runx) e encerra |
| Pasta do trabalho em formato antigo | Trabalha nela onde está; **nunca move**, e registra qual pasta usou |
| `.expx/` não existe | Segue sem gravar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Registra no rastro e segue; o E0 continua OK |
