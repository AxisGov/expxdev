# E8 — REGISTRO DA ENTREGA

Você está no E8, a última etapa do fluxo automático. Aqui você fecha `docs/entregas/<trabalho_id>/ENTREGA.md`.

Este arquivo é lido pelo **expx-panel** para mostrar o que aguarda revisão. Prosa não é contrato: o frontmatter é a interface com a máquina, a prosa abaixo dele é para a pessoa.

O `ENTREGA.md` **não substitui** o registro que a runx faz em `docs/relatorios/`. A mergex entrega; a runx fecha a ocorrência (regra 19).

## Quando o arquivo é escrito

Ao longo do trabalho, sempre no mesmo arquivo — e **nunca recriado do zero**:

| Momento | Etapa | Estado |
|---|---|---|
| Abertura da branch | E0 | `aberto` |
| A cada task commitada | E1 | `aberto`, com a lista `commits` crescendo |
| Retomada depois de replanejamento | E0 | volta a `aberto`, **preservando** `commits` e `criado_em` (`00-abertura.md`) |
| Fim do fluxo | E8 | `entregue` ou `bloqueado` — os dois são persistidos por commit |

## O contrato — `kind: entrega`

Segue o `expx-schema v1`, o mesmo contrato da sprintx e da runx. O contrato completo deste
kind — campo a campo, com os enums e os campos de indexação — está em `references/00-schema.md`;
o que segue é o que você precisa para gravar. As regras universais valem todas:

1. O bloco YAML é a primeira coisa do arquivo, delimitado por `---` antes e depois.
2. Toda chave em `snake_case`, minúscula, sem acento.
3. Todo valor de enum em minúscula e sem acento.
4. Datas em ISO `AAAA-MM-DD`, obtidas com `date +%Y-%m-%d` do sistema, **nunca de memória**.
5. Booleanos `true` / `false`, sem aspas.
6. Lista vazia é `[]`, valor ausente é `null`. **NUNCA omita a chave** — o painel diferencia "não se aplica" de "esqueceram de escrever".
7. Campos de texto no YAML são de **uma linha**.
8. `atualizado_em` é reescrito a cada gravação.
9. Nenhum caminho absoluto em nenhum valor.

### Enums próprios deste kind

| Enum | Valores |
|---|---|
| `estado` | `aberto` \| `entregue` \| `bloqueado` |
| `portao` | `pronto` \| `bloqueado` \| `null` (ainda não rodou) |
| `pr_estado` | `rascunho` \| `aberto` \| `merged` \| `fechado` \| `null` |
| `tipo_trabalho` | `feature` \| `ocorrencia` |
| `raio` | `baixo` \| `medio` \| `alto` \| `null` (sem modo legado) |
| `causa` | as dez causas de `references/00-schema.md` \| `indeterminada` \| `null` |

`expx_tool` fica como a skill de **origem** do trabalho (`sprintx` ou `runx`) — é ela que governa o trabalho. O campo `entregue_por: mergex` diz quem gravou este arquivo.

### O bloco completo

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
estado: entregue
versionado: true
branch: fix/OC-2026-0184-icms-st-base-desconto
branch_base: main
commits:
  - seq: 1
    task: T-01.01
    commit: a3f19c2
  - seq: 2
    task: T-01.02
    commit: 7b2e401
modulo_afetado: [fiscal, relatorios]
arquivos_alterados: [src/fiscal/base_calculo.py, src/fiscal/calculo_icms_st.py, tests/fiscal/test_icms_st_desconto.py]
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
falhas_portao: []
causa: null
desvios: []
push_feito: true
pr_url: https://github.com/<org>/<repo>/pull/482
pr_estado: rascunho
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
| `estado` | `aberto` no E0; `entregue` quando o fluxo completou; `bloqueado` quando o portão barrou |
| `versionado` | `false` em repositório sem versionador |
| `branch`, `branch_base` | `null` quando `versionado: false`. `branch_base` é a **base efetiva** determinada no E0 — inclusive quando informada pelo chamador; é ela que os diffs do E2, do E3 e do E4 usam |
| `commits` | Um item por **fechamento de task em cada execução**, na ordem em que fecharam, cada um com a chave de ordem `seq` (`references/00-schema.md`, "A ordem de registro"); `[]` sem versionador. É histórico de execução: na retomada depois de replanejamento a lista é **preservada**, e um `task` id pode reaparecer com outro SHA (`01-commits.md`). O commit de artefatos de método não é task e **não entra aqui** — ele vai na prosa |
| `modulo_afetado` | Os módulos que a entrega toca; copiado da skill de origem quando ela o declara |
| `arquivos_alterados` | **O diff real** (`git diff --name-only <branch_base>...HEAD`), não a previsão do plano |
| `faixa_atencao` | A faixa por arquivo do E3, no vocabulário do índice (`alta`/`media`/`baixa`); `[]` antes do E3 |
| `raio` | A faixa da legadox; `null` sem modo legado — **nunca invente uma faixa** |
| `atencao` | As três contagens do E3; zeros quando o E3 não rodou |
| `portao` | O resultado do E2 |
| `falhas_portao` | As verificações que deram FALHA no E2 (`vN`, ou `vN_sem_prova` quando não pôde rodar); `[]` sem portão ou com PRONTO |
| `causa` | `null` fora de `estado: bloqueado`; nele, obrigatória e **derivada** de `falhas_portao` (`references/00-schema.md`, "A causa do bloqueio") |
| `desvios` | Arquivos alterados fora da lista declarada, detectados no E1 e no E2; `[]` quando não houve |
| `push_feito` | Durante o E6, `true` afirma que a publicação executada até ali está sincronizada. **Ao encerrar o E8, `true` afirma que o HEAD final — o commit que carrega este registro — está em `origin/<branch>`**, e o E8 revalida isso; falhou a publicação final, vira `false` (ver "O que `push_feito` afirma") |
| `pr_url` | A URL devolvida pelo E7; `null` quando o PR não foi aberto — **não é falha** |
| `pr_estado` | `rascunho` na abertura normal; `aberto` quando o QA já aprovou; `merged`/`fechado` quando o E9 ou uma pessoa atualizarem |
| `entregue_em` | A data em que o fluxo completou; `null` enquanto `estado` não for `entregue` |

## A prosa

Abaixo do frontmatter, use `assets/TEMPLATE-ENTREGA.md`. A prosa é para quem abre o arquivo:

1. **Resumo em uma linha** — o que foi entregue e onde está.
2. **Onde está o quê** — links relativos para `PR.md`, `QA-PACOTE.md`, `ATENCAO.md` e para a pasta do trabalho de origem.
3. **Estado da entrega** — a branch e **como ela chegou até aqui** (aberta pela mergex, retomada, ou adotada da skill de origem), a base efetiva e de onde ela veio, portão, push, PR, e o que falta para o merge.
4. **Avisos** — insumos ausentes acumulados pelas etapas: sem raio, sem roteiro manual, sem `DIVIDA.md`, ferramenta de PR ausente. É a lista do que faltou, e é ela que a Parte de entrega apresenta ao usuário.
5. **Desvios**, se houver — arquivos fora da lista declarada.

**O YAML e a prosa andam juntos.** Nunca atualize um sem o outro.

## Reindexação do memox — depois de gravar

O `ENTREGA.md` que você acabou de gravar é **fonte indexada** pelo memox: é dele que saem o
histórico de faixa de atenção por arquivo e a lista do que a entrega de fato tocou. Um índice
que não sabe da entrega recém-fechada não a devolve na próxima consulta — e a entrega seguinte
classificaria o mesmo arquivo sem saber o que este trabalho fez com ele.

Verifique se o motor existe:

```
.claude/skills/memox/assets/memox.py
```

**Não existindo, pule em silêncio.** Não registre aviso, não mencione o memox na saída ao
usuário: a camada de memória é opcional, e a entrega está completa sem ela.

Existindo, dispare a reindexação **depois** de o `ENTREGA.md` estar gravado no disco:

```
python3 .claude/skills/memox/assets/memox.py indexar
```

Quatro regras:

1. **Depois de gravar, nunca antes.** Reindexar antes indexaria a versão anterior do arquivo,
   e o trabalho recém-entregue ficaria de fora até a próxima reconstrução.
2. **Falha não bloqueia.** Código de saída diferente de zero, motor quebrado, `python3`
   ausente: registre o aviso ("reindexação do memox não concluída") e siga. O índice inteiro é
   derivado e reconstruível a qualquer momento com `/memox-indexar`; a entrega não depende dele.
3. **Uma vez por entrega, no E8.** Não reindexe no E0, no E1 nem no E3 — o índice não muda a
   cada commit, e reconstruí-lo a cada task seria custo sem informação nova.
4. **A mergex não edita nada do memox.** Ela dispara a reconstrução e lê o resultado; o índice
   e a `config.json` são do projeto, e a `config.json` nunca é sobrescrita pela reconstrução.

Se o projeto tem o hook `memox-reindexar.sh` registrado no `Stop`, ele fará o mesmo ao fim da
sessão. Disparar aqui não é duplicação inútil: a reconstrução é idempotente e roda em
milissegundos, e a entrega pode fechar muito antes de a sessão acabar — inclusive numa sessão
que nunca chega ao `Stop`.

## O fechamento final — a entrega precisa sobreviver ao worktree

O `ENTREGA.md` que você acabou de gravar só serve a quem vem depois se estiver **no histórico**.
Quem integra a branch — a buildx num fast-forward, o E9, uma pessoa — integra **commits**, nunca
a árvore de trabalho. Registro final que fica só no disco não chega à integração e desaparece
junto com o `git worktree` quando a skill de origem o remove.

Por isso o E8 fecha com o checkpoint executável `e8`. Ele é o último escritor do terminal e o
commit produzido é **método, não E1**.

### Passo 1 — Separar o que ainda está sujo

```
git status --porcelain
```

| O que é | O que fazer |
|---|---|
| Artefato de método **deste** trabalho: `docs/entregas/<trabalho_id>/` e a pasta do trabalho na skill de origem | **Entra** no commit final |
| `docs/sprintx/estimativas/HISTORICO.md`, quando a origem é a **sprintx** e ele está sujo | **Entra** — é o artefato global de método da sprintx (`references/integracao/sprintx.md`). A exceção é exata: nada mais sob `docs/sprintx/estimativas/`, e nada equivalente na runx |
| Arquivo de **produto** fora da lista declarada | **Não entra.** Continua sendo desvio (regra 4, `01-commits.md`); nomeie no relatório |
| Artefato de **outro** trabalho | **Não entra.** É desvio pelo mesmo critério |
| Derivado e não versionado: `docs/eventos/<trabalho_id>.jsonl`, `.expx/estado.json`, índice do memox | **Não entra.** Não é artefato da entrega |

**O `HISTORICO.md` normalmente já está limpo aqui**, porque entrou no `pre-e2`. Se voltou a ficar
dirty e o diff continua pertencendo ao trabalho explícito, o catálogo cumulativo de `e8` o inclui.

Depois do E6 e do E7, o que costuma estar sujo é **um arquivo só**: o próprio `ENTREGA.md` — o
E7 gravou `pr_url` e `pr_estado`, e o E8 acabou de gravar `estado`, `portao`, `push_feito`,
`entregue_em`, `atualizado_em` e a prosa. Quando a skill de origem grava algo depois do push (um
fechamento que cita a URL do PR, por exemplo), esse arquivo é deste trabalho e entra também.

Nada sujo deste trabalho: **não há commit a fazer.** Nunca force um commit vazio
(`--allow-empty`) — o registro já está no histórico.

**A garantia do fechamento não é "árvore inteira limpa".** É esta: **ao sair do E8, nenhum
artefato de método legítimo deste trabalho fica sem persistir.** Arquivo de produto fora do
plano é desvio: ele **não entra** no commit, **não é apagado**, e continua aparecendo em
`git status` — de propósito. Quem decide o destino dele é a pessoa (regra 4), e varrê-lo para
dentro do commit "para deixar a árvore limpa" seria exatamente a invasão de escopo que o método
existe para impedir.

### Passo 2 — Persistir pelo executor

A lista acima é catálogo conceitual; staging e commit não são feitos à mão. Depois de gravar e
validar todos os campos terminais, execute:

```
bash .claude/skills/mergex/scripts/persistir-metodo.sh --persistir \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id> --checkpoint e8
```

O executor usa a trava C5, exige stage vazio, deriva paths exatos, roda a varredura de segredo e
valida `Trabalho:` + `Metodo: e8`, sem `Task:`. Sem mudanças elegíveis devolve `noop=true`; nunca
cria commit vazio. O commit não entra em `ENTREGA.commits`, não consome `seq` e não inclui produto.

### Passo 3 — Publicar o commit final

Só quando **todas** valerem: `versionado: true`, há remoto configurado, e o E6 publicou a branch
(`push_feito: true`). Fora disso, pule este passo — não é erro.

O princípio é o mesmo do E6, e é conservador:

```
git fetch origin <branch>
git rev-list --count HEAD..origin/<branch>
```

| Resultado | O que fazer |
|---|---|
| A branch não existe no remoto | Push normal, com `--set-upstream` quando aplicável |
| Contagem `0` | O remoto está contido no local: `git push origin <branch>` |
| Contagem maior que `0` | **PARE.** Não publique |

**Nunca `pull`, nunca `merge`, nunca `rebase`, nunca `--force`, nunca `--force-with-lease`.**
A mergex não reconcilia histórico — aqui menos ainda, porque o que está em jogo é só o registro
da entrega.

Confirme:

```
git rev-parse HEAD
git rev-parse origin/<branch>
```

Os dois têm que ser iguais.

### O que `push_feito` afirma

O campo tem **um significado por estágio**, e o E8 é quem dá a palavra final:

| Estágio | `push_feito: true` afirma |
|---|---|
| Durante o E6 | A publicação executada até aquele estágio está sincronizada: `origin/<branch>` tem o commit que o E6 subiu |
| **Ao encerrar o E8** | O **HEAD final**, que contém o registro final do E8, está sincronizado com `origin/<branch>` |

**O E8 revalida a verdade final.** Falhou a publicação final, o campo vira `false` no registro
local — nunca fica `true` afirmando um HEAD que o remoto não tem. Nenhum enum novo, nenhuma
mudança de schema: o campo continua booleano.

Em uma frase: `push_feito: true`, ao fim do fluxo, significa **a publicação da entrega foi
executada com sucesso e o commit que carrega este registro está no remoto.**

A circularidade é aparente — gravar `push_feito` num arquivo que ainda vai virar commit, e esse
commit ainda vai ser publicado — e se resolve pela **ordem**, nunca por um estado intermediário:

1. O E8 grava `push_feito` com o resultado do E6.
2. O checkpoint `e8` persiste o registro.
3. O push final publica esse commit.
4. Deu certo: **nada muda depois.** `true` continua verdadeiro, agora inclusive sobre o commit
   que o contém.

Não existe valor `pending` e nenhum enum novo: o campo continua booleano, como no
`references/00-schema.md`.

### Quando a publicação final falha

Remoto à frente, push rejeitado por permissão, por hook ou por proteção de branch: **não
maquie.**

- Relate o erro **literal**, e deixe claro que a entrega **não está sincronizada com o remoto**.
- Nunca force, nunca reconcilie, **nunca tente o push de novo em laço**.
- A branch local fica com o registro final preservado, e nenhum artefato de método deste
  trabalho fica sem persistir.
- Se `push_feito` está `true` mas o commit final não chegou ao remoto, o arquivo está mentindo:
  grave `push_feito: false`, ajuste a prosa e faça um **commit corretivo**, no mesmo formato do
  passo 3 — somente artefato de método, sem reescrever histórico, sem novo push automático.

Prefira a verdade no artefato à simplicidade: um `push_feito: true` que não corresponde ao remoto
quebra exatamente quem confia no registro para achar a entrega.

### Sem remoto, sem versionador, sem PR

| Situação | O fechamento final |
|---|---|
| `versionado: false` | Não roda: não há histórico onde persistir |
| Versionado, sem remoto | **Acontece localmente.** `push_feito: false`, estado final no histórico. Não é erro: o fast-forward local continua possível |
| E6 não publicou (remoto à frente, push rejeitado) | Commit final acontece; publicação não é tentada; o relatório diz que a entrega não está no remoto |
| PR não aberto (ferramenta ausente) | Igual ao caso normal: `pr_url: null` já está gravado, e o commit final acontece do mesmo jeito |

### Fechamento bloqueado — quando o portão barrou

`BLOQUEADO` no E2 encerra as **etapas de entrega**: E3, E4, E5, E6 e E7 **não executam**. O fluxo
segue **apenas ao E8**, e apenas para registrar e persistir o bloqueio. Ir ao E8 não é continuar
a entrega — o portão continua barrando a entrega.

| Campo | Valor no fechamento bloqueado |
|---|---|
| `portao` | `bloqueado` — preservado como o E2 gravou |
| `falhas_portao` | Preservado como o E2 gravou — é a evidência da `causa` |
| `causa` | **Derivada** de `falhas_portao` pelo script, nunca escrita à mão (ver abaixo) |
| `estado` | `bloqueado` |
| `push_feito` | `false` — o E6 não rodou |
| `pr_url`, `pr_estado` | `null` quando nunca houve PR. Na retomada de um trabalho que já tinha PR, o valor anterior permanece como está — o E7 é quem confirma, e ele não roda aqui |
| `entregue_em` | `null` — só recebe data quando `estado: entregue` |
| `faixa_atencao`, `atencao` | `[]` e zeros: o E3 não rodou |
| `arquivos_alterados` | O diff real, que continua existindo |
| `desvios` | O que o E1 e o E2 registraram, preservado |

**A causa do bloqueio.** Grave `causa` na **mesma gravação** que põe `estado: bloqueado`, e
antes do commit do passo 3 — é o commit que a leva ao HEAD da branch, onde quem vem depois a lê
por `git show`. O valor sai do script, a partir de `falhas_portao` e de nada mais:

```
bash .claude/skills/mergex/scripts/causa-do-portao.sh --derivar <itens de falhas_portao>
bash .claude/skills/mergex/scripts/causa-do-portao.sh --validar docs/entregas/<trabalho_id>/ENTREGA.md
```

O enum, a precedência entre várias falhas e o valor `indeterminada` estão em
`references/00-schema.md`, "A causa do bloqueio". Três proibições:

- **nunca** uma causa pela narrativa: o texto do `B-NN`, a opinião de quem executou ou a
  intenção de ninguém não mudam o valor — `falha_tecnica` não existe neste enum;
- **nunca** `causa: null` com `estado: bloqueado`: sem causa provada, o valor é `indeterminada`;
- **nunca** causa sem falha: `falhas_portao: []` com o portão bloqueado é registro inconsistente —
  o script recusa, o E8 não grava o fechamento e o E2 roda de novo.

`--validar` reprovado: o E8 não commita e relata o motivo literal.

O fechamento bloqueado faz **três coisas e nada mais**: escreve a prosa com o que falta (o mesmo
que o relatório do E2 apontou), persiste os artefatos de método deste trabalho pelo checkpoint `e8`
acima, e informa o desenvolvedor. **O passo 3 não roda**: branch bloqueada não é publicada.

**Inclusive o `HISTORICO.md`.** No caminho bloqueado não existe `pre-e6` — E3 a E7 não
rodaram —, mas a sprintx já gravou `docs/sprintx/estimativas/HISTORICO.md` antes do
`FECHAMENTO.md` e do portão. Quando a origem é a sprintx e ele está sujo, ele **entra no commit
final do bloqueio**: por caminho explícito, com a mesma varredura de segredo, fora da lista
`commits`, sem inventar task e sem publicar nada. É o que evita que uma retomada perca a memória
que a sprintx já havia registrado.

Termina com o bloqueio preservado no HEAD local — é o que permite a uma sessão futura, ou a
outra skill, ver que este trabalho parou no portão, e por quê, mesmo depois de o worktree sumir.

## Limpar o estado da barra

Terminado o registro, o trabalho está entregue: não há mais um trabalho em andamento nesta
sessão. Em `.expx/estado.json`, devolva os **seus dois campos** a `null`:

- `branch`: `null`
- `pr_estado`: `null`

Vale igualmente para trabalho **abandonado** — o desenvolvedor desistiu, ou o portão barrou
e o trabalho não vai seguir. A barra some do que já não está acontecendo.

Não limpe `trabalho`, `fase`, `task`, `raio` nem `orcamento_*`: eles são das irmãs, e são
elas que os zeram nas próprias transições de fechamento. Limpar campo alheio apagaria o
estado de quem ainda está trabalhando.

Repositório sem versionador: os dois campos já são `null` desde o E0 e nada é gravado.

O procedimento é o de `10-estado.md`. Falha de gravação vai para o rastro e **não interrompe
o E8** — a entrega já está registrada no `ENTREGA.md`, que é a fonte de verdade.

## Entrega ao usuário

Terminado o E8, apresente na tela, curto:

```
mergex — entrega concluída

Trabalho: <trabalho_id>
Branch: <branch> → <branch_base>
Commits: <n> (um por task)
Portão: PRONTO
Atenção humana: <x> olho obrigatório, <y> leitura rápida, <z> dispensável
Push: feito
Fechamento: <sha curto> — publicado em origin/<branch> | só local, não sincronizado
PR: <url> (rascunho) | não aberto — descrição em docs/entregas/<trabalho_id>/PR.md
Pacote de QA: docs/entregas/<trabalho_id>/QA-PACOTE.md

Avisos: <lista, ou "nenhum">
```

**Não sugira o merge. Não sugira `/mergex-revisar`.** O comando de revisão nunca é encadeado nem oferecido ao fim de um trabalho (regra 16): quem decide revisar e integrar é o desenvolvedor, quando ele quiser, chamando o comando pelo nome.

## Critério de saída

- [ ] `ENTREGA.md` tem frontmatter válido, com o cabeçalho comum e nenhuma chave omitida.
- [ ] `estado` reflete o que aconteceu de verdade.
- [ ] `causa` e `falhas_portao` presentes; `scripts/causa-do-portao.sh --validar` passa no `ENTREGA.md` final.
- [ ] Datas em ISO, obtidas do sistema.
- [ ] Nenhum caminho absoluto.
- [ ] A prosa bate com o YAML.
- [ ] Os avisos acumulados estão listados.
- [ ] Nada foi sugerido sobre merge ou revisão.
- [ ] `arquivos_alterados` veio do diff real; `faixa_atencao` bate com o `ATENCAO.md`.
- [ ] Com o memox instalado, a reindexação foi disparada **depois** de gravar o `ENTREGA.md`.
- [ ] Sem o memox instalado, nenhuma menção a ele — nem na saída, nem nos avisos.
- [ ] `branch` e `pr_estado` voltaram a `null` no `.expx/estado.json`, e os campos das outras skills sobreviveram intactos. Este item nunca reprova o E8.
- [ ] O fechamento final commitou os artefatos de método deste trabalho que ainda estavam sujos; `git status --porcelain` não lista nenhum artefato deste trabalho.
- [ ] `git show <branch>:docs/entregas/<trabalho_id>/ENTREGA.md` mostra o estado final — o mesmo que está na árvore.
- [ ] O commit de fechamento não entrou na lista `commits` e não levou arquivo de produto.
- [ ] Havendo remoto e push do E6, `git rev-parse HEAD` e `git rev-parse origin/<branch>` são iguais; não havendo, a saída diz que a entrega está só local.
- [ ] `push_feito` corresponde ao que o remoto tem de verdade.

## Quando falha

| Situação | O que fazer |
|---|---|
| Portão barrou (E2) | `estado: bloqueado`, `portao: bloqueado`, `falhas_portao` preservado e `causa` derivada dele; o que falta na prosa; o resto fica `null`/`false` |
| Causa não provada (a primeira falha na ordem é `_sem_prova`) | `causa: indeterminada` — nunca `null`, nunca uma causa escolhida |
| Sem versionador | `versionado: false`, `branch`/`branch_base`/`pr_url` `null`, `commits: []`; `estado: entregue` mesmo assim |
| PR não aberto | `pr_url: null`, `pr_estado: null`, aviso na prosa; `estado` continua `entregue` |
| Valor não determinável | `null` ou `[]`, **nunca invente**, nunca omita a chave |
| Arquivo já existe do E0 | Atualize; nunca recrie do zero, nunca apague o histórico de `commits` |
| memox não instalado | Pule a reindexação **em silêncio**; a entrega está completa |
| Reindexação falha | Aviso na prosa e siga; o índice é reconstruível com `/memox-indexar` |
| E3 não rodou (portão barrou) | `faixa_atencao: []` e `atencao` zerado; `arquivos_alterados` continua sendo o diff real |
| `.expx/` não existe | Segue sem limpar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Registra no rastro e segue; a entrega continua concluída |
| Nada deste trabalho está sujo no fechamento | O checkpoint devolve `noop=true`; nunca cria commit vazio |
| Segredo no artefato do fechamento | Aborta o commit final, mascara o trecho, e a entrega fica sem o registro publicado até a pessoa resolver |
| Remoto à frente na publicação final | Não publica, não reconcilia, não força; relata literal; branch local guarda o registro final |
| Push final rejeitado (permissão, hook, proteção) | Erro literal no relatório; sem novo push automático; `push_feito: false` por commit corretivo quando ele estava `true` |
| Sem remoto | Commit final local, `push_feito: false`; não é erro |
