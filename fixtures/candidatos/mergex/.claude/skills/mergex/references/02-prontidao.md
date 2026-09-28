# E2 — PORTÃO DE PRONTIDÃO

Você está no E2. Esta etapa roda **ao fim da execução, antes de qualquer preparação de entrega** — antes do E3, do E4, do E5, do push e do PR.

O portão tem uma função só: **barrar o que não está pronto e explicar o que falta**. Ele nunca maquia, nunca "passa com ressalva", nunca ajusta o trabalho para caber (regra 6). Um portão que deixa passar não é portão.

A saída é binária: `PRONTO` ou `BLOQUEADO`.

## Pré-requisitos verificáveis

Antes de qualquer V1–V11, confirme a barreira executável `pre-e2`:

```bash
bash .claude/skills/mergex/scripts/persistir-metodo.sh --verificar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id> --checkpoint pre-e2
```

Falhou: **E2 não começa**. Rode a ação explícita `persistir-metodo pre-e2` fora do portão e tente de novo. O E2 nunca chama o modo de gravação para consertar o lifecycle silenciosamente.

- `docs/entregas/<trabalho_id>/ENTREGA.md` existe (o E0 rodou). Se não existir, rode o E0 primeiro (`references/00-abertura.md`) — a branch pode não ter nascido, e o portão precisa saber o que foi commitado.
- O `ORQUESTRADOR.md` e o `tasks.md` do trabalho existem. Sem eles não há o que verificar: relate que o trabalho não está planejado e encerre `BLOQUEADO`.
- A pasta do trabalho é a **mesma** que o E0 encontrou: na sprintx, `docs/sprintx/features/<slug>/` (canônico) e, só quando ele não existe, `docs/<slug>/` (formato antigo); na runx, `docs/manutencao/<OC-ID>-<slug>/`. Nunca misture as duas pastas da sprintx na mesma verificação.

## As onze verificações

Rode **todas**, sempre, mesmo depois de a primeira falhar. O usuário precisa da lista completa do que falta, não do primeiro erro. Verificação que não se aplica ao trabalho é marcada `n/a`, nunca omitida.

### V1 — Task com status diferente de `concluida`

Leia o frontmatter de todo `sprint-NN/tasks.md` do trabalho. Toda task tem que estar `concluida`.

**Os dois formatos de sprint da sprintx valem em V1, V2, V3, V9 e V11.** As tasks vêm sempre da chave `tasks`, no `kind: plano` (condensado) e no `kind: tasks` (três arquivos) — regra única em `references/integracao/sprintx.md`, "Como ler uma sprint da sprintx". O formato nunca muda quais campos existem nem quanto rigor se cobra.

Falha: qualquer task em `pendente`, `em_andamento` ou `bloqueada`. Nomeie cada uma (id e título) e o status atual. Task `bloqueada` aponta o `B-NN` correspondente em `BLOQUEIOS.md`.

### V2 — Task concluída sem registro de suíte que a sustente

Para cada task `concluida`, leia o campo `suite`:

| Valor | Resultado |
|---|---|
| `parcial` | OK — os testes afetados pela task passaram |
| `verde` | OK — a suíte inteira passou |
| `vermelha` | **FALHA** |
| `nao_executada` | **FALHA** — `concluida` sem teste executado é inconsistência do registro |

`parcial` e `verde` são registros válidos, e é assim que a skill de origem trabalha: na task roda o subconjunto afetado, e a suíte inteira é cobrada uma vez, ao fechar a sprint. Reprovar `parcial` aqui obrigaria a skill de origem a escrever `verde` onde ela não rodou a suíte inteira — o portão passaria a premiar registro falso, que é o oposto do que ele existe para fazer.

`vermelha` e `nao_executada` são FALHA. Nomeie a task.

**O trabalho inteiro continua precisando da suíte inteira.** Além do registro por task, procure a **evidência da suíte inteira no fechamento de cada sprint**, onde a skill de origem a registra, com a saída da execução colada. **Onde procurar depende do formato da sprint:**

| Formato | Onde está o fechamento da sprint |
|---|---|
| Três arquivos (`kind: tasks`) | `sprint-NN/sprint.md` e o relatório da F6 |
| Condensado (`kind: plano`) | a chave `sprint` do próprio `sprint-NN/tasks.md` (status e `criterio_saida`) e o relatório da F6 |

**Na sprint condensada, `sprint.md` não existe — e a ausência dele não é aviso nem falha.** Exigir um arquivo que o formato não tem seria barrar plano válido. O que continua sendo cobrado é a evidência da execução, no lugar onde a skill de origem deveria tê-la registrado; ausente, vale a tabela abaixo, sem inventar evidência.

| Estado | Resultado |
|---|---|
| Sprint concluída com a execução registrada e verde | OK |
| Sprint concluída com execução registrada vermelha | **FALHA** — nomeie a sprint |
| Sprint concluída sem nenhum registro de execução | **AVISO**, nomeando a sprint e onde ele deveria estar |

**Nunca reescreva tasks `parcial` para `verde`** para satisfazer esta verificação, e nunca invente a evidência: o que falta nesses casos é a execução, não o registro.

### V3 — Task sem teste de integração ou sem teste funcional

Para cada task, `teste_integracao` e `teste_funcional` têm que existir e não estar vazios.

Falha: campo ausente, vazio, ou preenchido com marcador de template (`{{...}}`, `TODO`, `NÃO DETERMINADO`). Nomeie a task e o campo.

### V4 — Bug da runx cuja primeira task não tem teste de regressão

Aplica-se só quando o trabalho é da runx com `tipo: bug`. A primeira task da primeira fase tem que ter `teste_regressao` preenchido.

Falha: campo ausente ou vazio. Sem teste de regressão não há prova de que o defeito existia — nem de que sumiu.

Nos demais tipos e nos trabalhos da sprintx: `n/a`.

### V5 — QA da runx reprovado, ou ausente quando exigido

Aplica-se só a trabalhos da runx. Leia `docs/manutencao/<OC-ID>-<slug>/QA.md`.

| Estado | Resultado |
|---|---|
| Contém `VEREDITO: APROVADO` | Passa |
| Contém `VEREDITO: REPROVADO` | **Falha.** Liste os achados ALTA: cada um precisa voltar ao E3 da runx |
| Não existe | **Falha**, quando o fluxo da runx já deveria tê-lo produzido (E2–E8 da mergex rodam entre o E4 e o E5 da runx) |

Trabalho da sprintx: `n/a` — a sprintx não tem estágio de QA equivalente; o que ela tem é a auditoria da F5 (V6).

### V6 — Auditoria da sprintx reprovada

Aplica-se só a trabalhos da sprintx. Leia o `00-AUDITORIA.md` na pasta do trabalho, na mesma ordem do E0: `docs/sprintx/features/<slug>/00-AUDITORIA.md` (canônico) e, só se ele não existir, `docs/<slug>/00-AUDITORIA.md` (formato antigo).

Falha: o arquivo existe e **não** contém `VEREDITO: SIM`, ou existe achado de severidade ALTA em aberto. Auditoria reprovada na F5 faz o portão barrar.

Arquivo ausente: aviso, não bloqueio — a execução pode ter vindo de um fluxo que não passou pela F5.

### V7 — Bloqueio aberto que afeta o escopo entregue

Leia os bloqueios na pasta do trabalho: `docs/sprintx/features/<slug>/00-BLOQUEIOS.md` (canônico) ou `docs/<slug>/00-BLOQUEIOS.md` (formato antigo) na sprintx; `BLOQUEIOS.md` na runx.

Falha: bloqueio com `resolvido_em: null` cuja `task` está dentro do escopo entregue. Nomeie o `B-NN`, a task e a descrição.

Bloqueio resolvido, ou aberto sobre task fora do escopo entregue: não barra, mas entra como aviso na saída.

### V8 — Modo legado

Aplica-se só quando `docs/legado/PERFIL.md` existe. Sem ele: `n/a` em todos os itens abaixo.

| Item | Falha quando |
|---|---|
| Raio calculado | Não há raio de impacto registrado para este trabalho |
| Caracterização | Raio MÉDIO ou ALTO sem testes de caracterização registrados |
| Reversão | Não há plano de reversão registrado |
| Orçamento | O orçamento de mudança declarado foi estourado |
| Aprovação humana | Raio ALTO sem aprovação humana registrada |

Cada item falho é uma linha da saída, com o arquivo onde deveria estar.

### V9 — Arquivo alterado fora da lista declarada no plano

Compare o conjunto de arquivos tocados pelos commits do trabalho com a união dos `arquivos.cria` + `arquivos.altera` de todas as tasks.

```
git diff --name-only <branch-base>...HEAD
```

Falha: arquivo de produto no diff que não está declarado em nenhuma task. Nomeie cada um. Some a isso os `desvios` já registrados pelo E1.

Arquivo declarado que não aparece no diff **não** é falha: pode ter sido criado e revertido dentro do escopo, ou já existir como estava.

**A V9 pergunta pela UNIÃO; o E1 pergunta pela task. As duas perguntas são diferentes, e ficam diferentes de propósito:**

| Quem | Pergunta | Conjunto |
|---|---|---|
| **E1**, ao fechar uma task | *de quem é este arquivo?* | **unitário** — só a task que está sendo fechada |
| **V9**, ao avaliar a entrega | *este arquivo foi planejado nesta feature?* | **união** — todas as tasks do trabalho |

Um arquivo declarado **só em outra task** da feature é `arquivo_de_task_irma` no E1 (não entra naquele commit; `references/01-commits.md`) e **passa na V9**, porque ele está no plano do trabalho. Isso não é incoerência: a V9 existe para pegar arquivo que **ninguém** planejou, e transformá-la em escopo unitário faria toda task que toca arquivo de outra reprovar a entrega inteira — barrando trabalho legítimo já replanejado. **Não converta a V9 para o conjunto unitário.**

A união dos `arquivos` sai da chave `tasks`, **nos dois formatos de sprint** (`kind: plano` e `kind: tasks`): o formato do plano nunca muda o que é produto declarado.

**Os artefatos de método do próprio trabalho não são desvio** e não entram nesta conta: a pasta do trabalho (`docs/sprintx/features/<trabalho_id>/`, `docs/<trabalho_id>/` no formato antigo, `docs/manutencao/<trabalho_id>/` na runx) e `docs/entregas/<trabalho_id>/`.

**E, quando a origem é a sprintx, `docs/sprintx/estimativas/HISTORICO.md` também fica fora da conta.** Ele é o artefato global de método da sprintx (`references/integracao/sprintx.md`): não reprova a V9, não entra em `desvios` e não precisa estar declarado em nenhuma task. A exclusão é **exata e cirúrgica** — só esse caminho literal, só na origem sprintx. Nenhum outro arquivo sob `docs/sprintx/estimativas/` é isento, e a runx não ganha isenção equivalente.

**Vale também quando ele já está no histórico da branch.** Numa retomada depois de bloqueio, o `HISTORICO.md` commitado na tentativa anterior aparece em `git diff <branch-base>...HEAD`: continua sendo método, e continua não barrando a V9. A regra não depende de ele estar sujo agora. Eles são o registro do trabalho, não produto, e é o E1 que os commita (`01-commits.md`). A pasta de **outro** trabalho continua sendo desvio, e nomeá-la aqui é justamente como se percebe escopo invadido.

### V10 — Segredo, credencial ou dado real de cliente no diff

**Roda sempre, mesmo quando todo o resto passou** (regra 5). É a única verificação que não pode ser pulada por nenhum motivo.

```
git diff <branch-base>...HEAD
```

Aplique a mesma tabela de sinais do `01-commits.md` (chave de API, credencial, chave privada, dado real de cliente). Falha: qualquer ocorrência, **com o valor mascarado na saída**.

Esta verificação existe em duas camadas de propósito: o E1 impede o segredo de entrar, o E2 pega o que entrou por fora do E1 (commit manual do dev, merge da base, arquivo trazido de outra branch).

**Repositório sem versionador:** V9 e V10 rodam sobre os arquivos declarados nas tasks e sobre a árvore de trabalho, em vez do diff. Não pule nenhuma das duas.

### V11 — Task concluída sem commit do E1 correspondente

O E1 commita uma task por vez e registra a prova em `ENTREGA.commits`, um item `{task, commit}` por fechamento (`references/01-commits.md`, "Passo 4"). Quando o commit **não** acontece — segredo detectado na varredura, branch errada, hook do versionador, falha operacional —, o E1 manda a task ficar **sem commit** e promete que "o E2 vai barrá-la". Até aqui nenhuma verificação cruzava as duas pontas, e a promessa não se cumpria: V1 vê `concluida`, V2 vê a suíte, V3 vê os testes, e nada olha se a prova existe.

**A pergunta da V11 é uma só:** cada task `concluida` tem prova de E1?

Para cada task marcada `concluida` no plano executado, tem que existir **pelo menos um** item em `ENTREGA.commits` cujo campo `task` seja **exatamente** o id dessa task, com `commit` preenchido e válido.

```
bash .claude/skills/mergex/scripts/prova-de-commit.sh --verificar \
  docs/entregas/<trabalho_id>/ENTREGA.md \
  docs/sprintx/features/<slug>/sprint-*/tasks.md
```

Falha: qualquer task `concluida` sem item que a prove. **Nomeie cada uma** (id e o `tasks.md` onde está). A saída do script é a lista, uma task por linha.

| Situação | Resultado |
|---|---|
| Toda task `concluida` tem item com `task` igual e `commit` válido | OK |
| Alguma task `concluida` sem item que a prove | **FALHA** — nomeie a(s) task(s) |
| Nenhuma task `concluida` no plano | `n/a` — a V11 não tem alvo; a razão é da V1 |
| `versionado: false` | `n/a` — sem versionador o schema já define `commits: []` |
| `ENTREGA.md` ou `tasks.md` ilegível | **FALHA**, registrada como `v11_sem_prova` |

**O que conta como prova.** O item inteiro, não o texto `task: T-NN.MM`. `commit` vazio, `null`, marcador de template (`{{...}}`, `TODO`, `NÃO DETERMINADO`) ou identificador malformado **não** prova: o item existe, a prova não. O identificador válido é o que o E1 grava — o hexadecimal minúsculo que `git rev-parse --short HEAD` devolveu, do tamanho curto do versionador ao SHA-1 inteiro.

**Mais de um item para a mesma task não é erro.** `commits` é histórico de execução, não índice de plano: um `id` reaparece legitimamente depois de replanejamento (`references/01-commits.md`, "`commits` é histórico de execução"). A V11 exige que **exista** pelo menos um item, nunca exatamente um, e não trata duplicidade como falha dela. Ordem e sequência dos itens também não são assunto da V11.

**A V11 não lê `seq`.** Desde a chave de ordem (`references/00-schema.md`, "A ordem de registro"), a V11 continua respondendo exatamente a mesma pergunta, sobre os mesmos três tipos de lista: totalmente legada (sem `seq` em item nenhum), moderna e mista válida. Ela **não** exige `seq` em leitura histórica, **não** falha porque a sequência está quebrada — isso é violação de contrato do `ENTREGA.md`, não causa de negócio do portão — e **não** lê `seq` como quantidade de commits esperada para a task. Os dois scripts compartilham o mesmo leitor de `commits` justamente para que só exista uma interpretação da lista; o que a V11 usa dele é a leitura crua.

**A V11 não audita o `git log`.** `ENTREGA.commits` é a evidência canônica do E1 neste contrato, e é sobre ela que a V11 decide. A lacuna que ela fecha é `tasks.md` ↔ `ENTREGA.commits`; provar que o SHA existe, que é ancestral do HEAD ou que pertence à branch é outra verificação, que nenhum ponto do contrato vigente exige.

Na recuperação, essas provas adicionais pertencem ao escritor `--registrar-existente`, não à leitura V11. O ciclo esperado é: antes do registro, V11 falha; após o append, passa na worktree; após `persistir-metodo pre-e2`, passa também ao ler `ENTREGA.md` de `git show HEAD`. A certificação terminal depende dessa última evidência durável.

**A V11 não duplica a razão de outra verificação.** Task `pendente`, `em_andamento` ou `bloqueada` **não é alvo positivo** da V11: ela não tem commit porque não fechou, e quem responde por isso é a V1. Suíte vermelha é V2, teste não declarado é V3, arquivo fora do plano é V9. A V11 responde por uma coisa só, e é por isso que a falha dela é diagnosticável sozinha.

**Os dois formatos de sprint da sprintx valem aqui**, como em V1, V2, V3 e V9: as tasks vêm sempre da chave `tasks` (`references/integracao/sprintx.md`, "Como ler uma sprint da sprintx").

**Vale nas duas origens.** A V11 não lê pasta: ela recebe o `ENTREGA.md` e os `tasks.md` do trabalho. Na runx, são os de `docs/manutencao/<OC-ID>-<slug>/sprint-*/tasks.md`. A regra e o resultado são os mesmos.

**Leitura histórica × entrega nova.** Uma `ENTREGA.md` anterior a este contrato pode ter task concluída sem o item correspondente. Ler esse snapshot continua possível. Numa entrega nova a inconsistência barra. Se nenhum commit de produto existe, faça o E1 tardio normal; se o commit já existe e só o registro falhou, use `fechamento-do-e1.sh --registrar-existente` com o SHA completo. Nunca crie um segundo commit para recuperar apenas o registro.

## Formato exato da saída

Use `assets/TEMPLATE-prontidao.md`. Grave em `docs/entregas/<trabalho_id>/` **não** é obrigatório — a saída do portão é para a tela e para o campo `portao` do `ENTREGA.md`.

Cabeçalho, sempre:

```
mergex E2 — PORTÃO DE PRONTIDÃO
Trabalho: <trabalho_id>   Branch: <branch>   Data: <AAAA-MM-DD>

RESULTADO: PRONTO
```

ou

```
RESULTADO: BLOQUEADO
```

Depois, a tabela das onze verificações, todas as linhas, sempre:

```
| # | Verificação | Resultado |
|---|---|---|
| V1 | Tasks concluídas | OK |
| V2 | Registro de suíte por task | FALHA |
...
| V11 | Commit do E1 por task concluída | OK |
```

Resultado por verificação: `OK`, `FALHA`, `AVISO` ou `n/a`.

E, para cada `FALHA`, um bloco com **o que falta e onde corrigir**:

```
V2 — FALHA: task fechada sem teste passando
  T-01.03 "Recalcular o rateio por item" — suite: vermelha
  Onde corrigir: docs/manutencao/<OC-ID>-<slug>/sprint-01/tasks.md
  O que fazer: voltar ao E3 da runx, fazer a suíte passar, remarcar a task
```

Avisos vão numa seção própria no fim, sem alterar o resultado.

## Registro das falhas

O portão grava no `ENTREGA.md`, **junto com `portao`**, a lista das verificações que deram `FALHA` — a chave `falhas_portao` (`references/00-schema.md`, "A causa do bloqueio"). É dela, e só dela, que o E8 deriva a `causa` do bloqueio.

- Um item por linha `FALHA` da tabela, com o número da verificação em minúscula: `v1` … `v11`.
- Verificação que **não pôde rodar** — marcada `FALHA` porque ausência de prova não é prova — entra como `vN_sem_prova`, nunca como `vN`. É o que impede que um "não consegui verificar" seja lido depois como um defeito provado.
- `AVISO` e `n/a` não entram. `PRONTO` grava `falhas_portao: []`.
- Na numeração do portão, uma linha só. Monte a lista com o script, que também recusa item desconhecido ou repetido:

```
bash .claude/skills/mergex/scripts/causa-do-portao.sh --lista v7 v1
[v1, v7]
```

O portão **não grava `causa`**: ela continua `null` até o E8 fechar o bloqueio (`references/08-registro.md`). E ele não classifica o motivo pelo conteúdo — o que diz o `B-NN`, de quem é o arquivo fora do escopo, por que a suíte ficou vermelha fica na saída para a pessoa, não no YAML.

## Critério de saída

**`PRONTO`** quando nenhuma verificação deu `FALHA`. Grave `portao: pronto` e `falhas_portao: []` no `ENTREGA.md`, reescreva `atualizado_em`, e siga para o E3.

**`BLOQUEADO`** quando qualquer verificação deu `FALHA`. Grave `portao: bloqueado` e `falhas_portao` com as verificações que falharam no `ENTREGA.md`.

**`BLOQUEADO` encerra as etapas de entrega e segue apenas ao E8 para registrar e persistir o bloqueio.** Não classifique o diff (E3), não monte a descrição do PR (E4), não gere o pacote de QA (E5), não faça push (E6), não abra PR (E7): **nenhuma dessas etapas executa.**

O E8 roda em **fechamento bloqueado** (`references/08-registro.md`): grava `estado: bloqueado`, preserva `portao: bloqueado`, e commita esse registro para que o bloqueio sobreviva ao worktree. Ele **não publica a branch** — o portão proibiu o E6, e o fechamento não fura essa proibição. Ir ao E8 **não é continuar a entrega**: é finalizar e persistir o bloqueio.

O trabalho fica na branch, commitado até onde estava correto. Nada é desfeito, nada é descartado, nada é maquiado.

## Quando falha

| Situação | O que fazer |
|---|---|
| `tasks.md` sem frontmatter | Leia da prosa e registre o aviso; se não for possível determinar o status, é `FALHA` em V1 |
| `QA.md` ausente em trabalho da runx | `FALHA` em V5 — a entrega ainda não passou pelo E4 da runx |
| `PERFIL.md` ausente | V8 inteira é `n/a`; não invente modo legado |
| Sem versionador | V9 e V10 rodam sobre árvore e tasks; as demais não mudam |
| Branch base indisponível para o diff | Use `git diff --name-only HEAD~<n>..HEAD` sobre os commits do trabalho registrados no `ENTREGA.md`; registre a imprecisão como aviso |
| Verificação impossível de rodar | Marque `FALHA`, nunca `OK`, e registre `vN_sem_prova` em `falhas_portao`. Ausência de prova não é prova |
| Task `concluida` sem item em `ENTREGA.commits` | `FALHA` em V11. Sem commit existente: E1 tardio normal. Com commit existente e append perdido: `--registrar-existente`, nunca um segundo commit. |
| `ENTREGA.md` sem a chave `commits`, ou ilegível | `FALHA` em V11, registrada como `v11_sem_prova` |
| `ORQUESTRADOR.md` ou `tasks.md` ausente | `BLOQUEADO`: V1 não tem como determinar status — `v1_sem_prova` —, e as demais que dependem do plano também entram `_sem_prova` |
