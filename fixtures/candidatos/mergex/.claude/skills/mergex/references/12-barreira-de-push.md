# BARREIRA DE PUSH — ATIVAÇÃO E PROVA DO `pre-push`

Contrato: `docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md`, seção 13,
itens 5 a 8 (DM-184, DM-185).

O `pre-push` do Git é a barreira **local autoritativa contra erro normal**: ele decide cada push
pelo que o Git entrega (refs e SHAs), chamando o validador de push da skill
(`scripts/portao-push.sh --pre-push`), que aplica a mesma validade do portão
(`validade-do-portao.sh --rev`) ao SHA enviado. A entrega governada pelo portão é identificada pelo
**conteúdo** do que é enviado, nunca pelo nome da branch (DM-185; seção "Seleção da entrega").
Este reference cobre como o E0 o ativa, como o E2 prova que ele está ativo, como compô-lo com um
hook que já existe, como revertê-lo, como as entregas são selecionadas e o que o CI confere.

**O `pre-push` também varre segredo** (DM-279). Com a mesma tabela do hook `sem-segredo`
(`scripts/segredo-tabela.sh`), ele lê o que o push publica: a mensagem e as linhas adicionadas de
cada commit que o remoto ainda não tem (contra o primeiro pai, inclusive em merge) e a mensagem da
tag anotada. "O que o remoto tem" é o SHA remoto do protocolo; na branch nova, o que o servidor
anuncia na hora (`ls-remote` na URL do push), e a consulta que falha barra. A ref de rastreio
(`refs/remotes/<remoto>`) não conta: é cache local (DM-281). O modo é o do `sem-segredo` em `.expx/hooks.json` (nasce `bloqueio`): achado barra a
ref; em `aviso`, diagnostica e o push segue; em `desligado`, não varre. Qualquer falha de leitura
não libera. Acima de 300 commits a varredura não roda e, em `bloqueio`, o push é barrado: divida a
publicação, ou desligue conscientemente — nenhuma varredura manual libera o push. É a segunda
camada: pega o segredo que o próprio comando gerou e o commit feito por fora do PreToolUse.

O executável é um só: `scripts/ativacao-pre-push.sh <--instalar|--provar|--reverter> --entrega
docs/entregas/<trabalho_id>/ENTREGA.md`. Códigos: `0` ok; `1` prova reprovada; `3` pré-requisito
ausente (hook de terceiro que não passa na prova); `64` uso. Não existe opção de força.

## Ativação

O E0 roda, **depois de criar ou retomar o `ENTREGA.md`**:

```bash
bash .claude/skills/mergex/scripts/ativacao-pre-push.sh --instalar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md
```

- **Diretório efetivo:** o script resolve o diretório de hooks pelo próprio Git
  (`git rev-parse --git-path hooks`), o que já respeita um `core.hooksPath` existente, relativo ou
  absoluto, e o diretório comum de uma worktree vinculada. **O E0 nunca altera `core.hooksPath`.**
- **Sem `pre-push` nesse diretório:** instala o chamador gerenciado (`assets/pre-push-gerenciado.sh`,
  com o marcador `# mergex: pre-push gerenciado`), que só chama o validador de push e propaga o
  código de saída dele. O modelo é versionado sem o bit de execução; a cópia instalada recebe o bit.
- **Diretório efetivo fora do repositório** (DM-186): quando o diretório de hooks efetivo está
  **fora da árvore de trabalho e do diretório Git comum** — um `core.hooksPath` global,
  compartilhado por vários repositórios —, o E0 **não instala** o chamador gerenciado: sai `3` com
  a instrução de composição, para quem mantém aquele diretório. Instalado ali, o chamador viraria
  o `pre-push` de todos os repositórios da máquina, preso ao validador deste checkout; removido o
  checkout, todo push da máquina seria barrado. A comparação é por caminho canônico (links
  simbólicos e `..` resolvidos), dos três lados. Um `pre-push` já presente nesse diretório segue a
  regra do hook de terceiro abaixo: só a prova funcional o aceita. **Limite conhecido:** no Git for
  Windows a comparação é textual sobre o que `pwd -P` devolve; sistema de arquivos insensível a
  caixa (`c:/users/x` contra `C:/Users/X`) ou nome curto 8.3 podem dar recusa indevida — sempre para
  o lado seguro (código `3` com a instrução) —, e um repositório cuja árvore é o próprio `$HOME`
  (dotfiles) tem qualquer `core.hooksPath` sob `$HOME` como "dentro".
- **Já é o chamador gerenciado:** nada muda (idempotente).
- **Existe um `pre-push` de terceiro:** o E0 nunca o sobrescreve, renomeia ou edita. Quem decide é
  a prova funcional: aprovada, é **integração externa válida** e o E0 segue; reprovada, o script sai
  `3` com a instrução de composição.
- Em todos os casos o E0 termina com a prova funcional. Código diferente de zero:
  **`mergex E0 BLOQUEADO — pre-push`**, o E0 encerra e mostra a instrução que o script imprimiu.
- **Fora de um repositório Git** (DM-186): não há push a proteger. `--instalar` sai `0` sem
  instalar nada, e o E2 dispensa a prova (`registrar-portao.sh` grava `portao_sha: null`). O
  critério é só o Git real (`git rev-parse --show-toplevel`), **nunca pelo campo `versionado`** do
  `ENTREGA.md`: dentro de um repositório Git, `versionado: false` continua exigindo a prova.

O marcador serve só para a idempotência e para a reversão. A aceitação de qualquer `pre-push`,
gerenciado ou de terceiro, sempre passa pela prova funcional.

## Composição com hook de terceiro

Quando o repositório já tem um `pre-push`, a composição é **deliberada e feita à mão** por quem
mantém aquele hook. A instrução é uma só, a mesma que o E0 imprime: o `pre-push` existente chama `portao-push.sh --pre-push "$@"`, repassa a entrada padrão e propaga exatamente o código de saída dele.

Exemplo (o hook guarda a entrada padrão, faz o que já fazia e entrega a mesma entrada ao validador):

```bash
#!/usr/bin/env bash
entrada="$(cat)"
# ... o que o hook já fazia, lendo "$entrada" ...
printf '%s\n' "$entrada" \
  | bash "$(git rev-parse --show-toplevel)/.claude/skills/mergex/scripts/portao-push.sh" --pre-push "$@" \
  || exit $?
```

Sequência normativa de recuperação:

1. Na primeira execução, o hook de terceiro ainda não invoca a MergeX: a prova falha, o E0 não
   altera o arquivo, falha fechado (`3`) e mostra a instrução de composição.
2. O responsável compõe o hook à mão, como acima.
3. Na execução seguinte, o E0 não reprova por falta do marcador: executa a prova controlada.
4. O hook composto barra a ref inválida da prova e propaga o código: integração externa válida, o
   E0 prossegue.
5. Se a prova falhar, o hook terminar inesperadamente, liberar a ref inválida ou não propagar o
   código de saída, o E0 continua falhando fechado.
6. A reversão da MergeX não modifica o hook composto (seção "Reversão").

Hook que só **cita** a MergeX (num comentário, numa string) sem executá-la não passa: o
reconhecimento é por comportamento, nunca por busca textual.

## Prova funcional

```bash
bash .claude/skills/mergex/scripts/ativacao-pre-push.sh --provar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md
```

A mesma prova serve ao E0 e ao E2, e não confia no caminho nem na existência do arquivo:

1. Monta, **sem tocar remoto nem ref**, um commit solto (`git commit-tree`, com índice temporário)
   sobre `HEAD`, com um arquivo de produto e o `ENTREGA.md` do disco em `portao: pronto` e
   `portao_sha` = `HEAD`: um portão sabidamente vencido. O índice, a árvore de trabalho, as refs e o
   remoto não mudam; só ficam objetos soltos, que nenhuma ref alcança.
2. Executa o `pre-push` efetivo como o Git o executaria: na raiz da árvore de trabalho, com os
   argumentos `prova-mergex file:///dev/null`, uma linha de protocolo para
   `refs/heads/<branch da entrega>` com o SHA desse commit solto, e `MERGEX_PRE_PUSH_SINAL`
   apontando para um temporário. O validador de push escreve ali, **depois de decidir** cada ref
   recebida na entrada padrão, a linha `mergex-pre-push <SHA avaliado> <passa|avisa|barra>`, sem
   mudar a decisão.
3. **A prova tem dois lados**, cada um uma execução do hook, e **aprova só com os dois**:
   - **(a) ref aplicável vencida:** o hook sai com código diferente de zero **e** o sinal tem a
     linha `mergex-pre-push <SHA do commit solto desta prova> barra`;
   - **(b) controle positivo:** um segundo commit solto, com a **árvore vazia** (`git mktree
     </dev/null`: nenhum `ENTREGA.md`, para que nenhuma parcela da seleção o alcance), numa ref
     **não aplicável** (`refs/heads/mergex-prova-livre-<pid>`, conferida como inexistente
     localmente): o hook sai com código **0** **e** o sinal tem
     `mergex-pre-push <SHA desse commit> passa`.

   O lado (b) pega o que o (a) não distingue: o hook que chama a MergeX mas decide o código por
   regra própria (no push real, ele liberaria um portão vencido) e o ambiente em que o validador
   barra tudo por erro (por exemplo, objetos ou `safe.directory` inacessíveis para ele). Reprovam
   também: `pre-push` ausente ou não executável, término por sinal (código 128 ou mais), a falta de
   qualquer das duas linhas (o validador não rodou, rodou sem receber a entrada, ou a linha foi
   escrita por outro com SHA alheio) e o estouro do orçamento de tempo.
4. **Orçamento de tempo:** 120 s por execução. Vale um `timeout` que comprove, pelo comportamento,
   matar um processo dentro do prazo (GNU, uutils ou outro); sem ele, um vigia em Bash. O hook roda
   em grupo de processos próprio, morto inteiro no estouro e ao fim da prova: nenhum processo fica
   órfão. Estouro reprova — com o `timeout`, o código 124, ou 137 depois do prazo inteiro (o hook
   ignorou o TERM e levou o KILL).

**Limite da prova.** Ela pega erro normal: hook que não chama a MergeX, que só a cita, que a chama
sem a entrada, que não propaga o código, que forja o sinal antigo ou uma linha com outro SHA. Um hook
escrito **de propósito** para forjar a linha certa (lendo o SHA da entrada padrão) é contorno
deliberado, que nenhuma prova local alcança: a barreira contra ele é o CI com proteção de merge,
quando o produto o ativar (spec, seção 13, item 8), nos limites da seção "Limites do CI" (spec,
seção 15.1, itens 1 e 12).

No E2 a prova é barreira inicial, ao lado da `pre-e2`: reprovada, o E2 não começa e nada é
gravado. O resultado do portão é gravado só por `scripts/registrar-portao.sh`, que roda a mesma
prova antes de gravar `portao: pronto` (reprovada: `RESULTADO: BLOQUEADO — pre-push sem prova
funcional`, nada gravado, código `3`). E os checkpoints `pre-e6` e `e8` de `persistir-metodo.sh`
recusam persistir um `ENTREGA.md` com `portao: pronto` sem a prova: sem essa persistência, o
`pronto` nunca chega ao SHA que o `pre-push` avalia.

## Reversão

```bash
bash .claude/skills/mergex/scripts/ativacao-pre-push.sh --reverter \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md
```

- Remove o `pre-push` **só** se ele é o chamador gerenciado, reconhecido pelo marcador.
- Diante de um hook de terceiro, composto ou não, não toca o arquivo: só informa que a integração
  externa precisa ser removida pelo responsável dela, e sai `0`.
- Nunca altera `core.hooksPath`.

Reverter a MergeX (voltar o pin) não desfaz uma composição feita à mão: quem compôs um hook próprio
desfaz a composição por conta própria, e o PR de reversão explica o passo.

## Seleção da entrega

A entrega que o portão governa é identificada pelo **conteúdo** do que é enviado (DM-185). Antes
dela, a aplicabilidade era uma igualdade entre o nome da ref e o `branch:` do `ENTREGA.md`: bastava
um nome diferente (PR de `feature/ft-rec-2` para um trabalho de `feature/ft-rec`, fork `patch-1`,
renomeação, `--branch` forjado) para um portão vencido ou ausente passar com código 0, sem a
validade rodar. A auditoria de segurança final (2026-10-09) provou o contorno nos dez cenários; a
suíte `scripts/ci/test-r2-barreira-push.sh ci` os mantém como regressão.

**Seleção pelo conteúdo** — `pr_entregas_do_intervalo <raiz> <base> <sha>`, em
`scripts/portao-regras.sh` (spec, seção 13, item 5). `MB` é o merge-base de `<base>` e `<sha>`
(`git merge-base --all`; mais de um barra com `base_ambigua`). A seleção é a união de:

- (a) os `docs/entregas/<id>/ENTREGA.md` com qualquer status (A, M, D, T) em
  `git diff-tree -r --no-renames -z MB <sha>`: o que o PR cria, altera, apaga ou troca de tipo,
  inclusive o que um merge faz contra os dois pais;
- (b) os `docs/entregas/<id>/ENTREGA.md` tocados por algum commit não-merge de
  `git log --full-history --no-merges --no-renames -z MB..<sha>`: o que foi criado e apagado, tocado
  e restaurado (um merge que devolve a versão de um pai não esconde o commit que a alterou), ou
  renomeado (o caminho antigo continua listado).

Só o caminho canônico conta; a leitura é NUL-safe; caminho com caractere de controle sob
`docs/entregas/` barra (`caminho_com_controle`). Merges ficam fora de (b) para que o merge de
integração da base (`references/11-reconciliacao-base.md`) não selecione entregas de outros
trabalhos. Sem merge-base: em clone completo a base é a árvore vazia (toda a história de `<sha>`
entra); em clone raso, `historia_incompleta`. O custo é constante em processos Git. **O nome da
branch nunca seleciona nem isenta.**

**Decisão por entrega.** Cada entrega selecionada é validada com `validade-do-portao.sh --rev <sha>`
(`pr_decide_entrega`) e a lista é agregada (`pr_decide_entregas`): qualquer `barra` vence, depois
`avisa`, depois `passa`; o motivo do resumo é o da primeira entrega que barra. Entrega selecionada
que não existe no `<sha>` (removida, renomeada, criada e apagada) barra com `portao_nao_pronto`.
Seleção vazia: `passa`, `ref_nao_aplicavel`.

### Seleção no `pre-push`

Para cada ref `refs/heads/<b>` do push (exclusão e tag passam, como antes), as entregas são a
**união** de três parcelas, que só acrescentam e nunca isentam (spec, seção 13, item 7):

- (a) a seleção pelo conteúdo com `<base>` = `refs/remotes/<remoto>/HEAD`, quando ela resolve para
  um commit (`<remoto>` é o primeiro argumento do `pre-push`; um push para URL não tem). Sem ela,
  a parcela não existe — nunca se adivinha `main` ou `master`;
- (b) a regra legada pelo nome: o `ENTREGA.md` que declara `branch: <b>` na árvore do SHA enviado,
  na do SHA remoto anterior ou na ponta local de `refs/heads/<b>`;
- (c) o trailer `Trabalho: <id>` do commit enviado (só o da ponta da ref), que seleciona
  `docs/entregas/<id>/ENTREGA.md`. **Limite:** a parcela só acrescenta, e a entrega que ela nomeia
  é validada na árvore enviada. Se a árvore não a tem — por exemplo, o cherry-pick de um commit E1
  (com `Trabalho:`) para uma branch sem a entrega — o push **barra** com `portao_nao_pronto`; não
  há flag, por desenho. Um `<id>` fora da gramática de trabalho (vazio, caractere fora de
  `[A-Za-z0-9._-]`, começando por `.`, nome reservado) não nomeia entrega nenhuma e é ignorado.
  A parcela depende de `git log --format='%(trailers:key=…,valueonly,unfold)'` (ver "Versão do
  Git"); num Git sem suporte ela não seleciona nada e as parcelas (a) e (b) continuam.

A ref é aplicável quando a união não é vazia; cada entrega é decidida sobre o **SHA enviado** e a
decisão da ref é a agregada. Sem a parcela (a) e com (b) e (c) vazias, se a árvore enviada tem algum
`ENTREGA.md` canônico, a ref **avisa** com `cobertura_indeterminada` e o push segue: a
aplicabilidade não está provada, e o diagnóstico sugere `git remote set-head <remoto> --auto`. Sem
`ENTREGA.md` na árvore, passa. Qualquer ref que barra barra o push inteiro.

**Falso bloqueio por base defasada (limite do `pre-push`).** A parcela (a) usa sempre
`refs/remotes/<remoto>/HEAD`. Se essa ref está **defasada** (o `fetch` foi tarde e a base já
avançou além do que a branch integrou), ou **não é a base de integração** da branch (branch
empilhada sobre outra feature, fluxo por `develop`), as entregas trazidas pela base entram na
seleção; toda entrega integrada por merge está vencida (`commit_merge`) e a de baixo da pilha, vencida
pelos commits da de cima (`commit_de_produto`). O push de um SHA **válido** é então barrado: falha
fechada, nunca aprovação, e a decisão não muda. O diagnóstico cita a base usada
(`refs/remotes/<remoto>/HEAD` e o SHA dela), diz que, se essa base está defasada ou não é a base de
integração da branch, entregas trazidas pela base podem ter sido selecionadas, e manda rodar
`git fetch <remoto>` e `git remote set-head <remoto> -a` antes de rodar o E2 de novo. O outro lado do
limite é a ausência da ref: sem `refs/remotes/<remoto>/HEAD` (repositório com `git remote add`, não
`git clone`) e sem outra parcela que alcance a árvore, o `pre-push` só avisa com
`cobertura_indeterminada` e não barra.

**Chamador gerenciado sem o validador.** O `pre-push` instalado pelo E0 confere que
`portao-push.sh` existe no checkout antes de chamá-lo. Sem ele (branch anterior à instalação da
skill, skill removida), barra com a mensagem
`mergex pre-push: validador ausente neste checkout (<caminho>): push barrado; reinstale a skill ou
rode ativacao-pre-push.sh --reverter`, em vez do erro cru do bash.

O hook do Claude `pr-so-com-portao` continua resolvendo o `ENTREGA.md` pelo nome da branch: ele é
só aviso antecipado e nunca barra o que o `pre-push` deixaria passar.

### Versão do Git

A parcela (c) lê o trailer com `git log -1 --format='%(trailers:key=Trabalho,valueonly,unfold)'`:
`unfold` existe desde o Git 2.15 e `key=`/`valueonly` desde o **2.22** (RelNotes 2.22.0). Num Git
anterior o placeholder sai literal, não passa na gramática do id e a parcela (c) não seleciona nada;
como ela só acrescenta, as parcelas (a) e (b) continuam valendo. O resto da barreira já exige
Git ≥ 2.31 (`--path-format=absolute`), como os demais scripts da skill.

## CI

O CI é a defesa adicional ao `pre-push`, nunca o substituto dele. Com a proteção de merge do
repositório exigindo o check, ele é a barreira contra `git push --no-verify` (que ignora o
`pre-push`) e contra o contorno pelo nome da branch, nos limites da seção "Limites do CI". Ele
seleciona as entregas **só pelo conteúdo do PR** e aplica a cada uma a mesma validade, sobre o SHA
real da cabeça do PR:

```bash
bash .claude/skills/mergex/scripts/portao-ci.sh --verificar --sha <sha40> --branch <nome> --base <sha40>
```

- **Seleção pelo conteúdo do PR.** `<base>` é `pull_request.base.sha` e `<sha>` é
  `pull_request.head.sha`: `pr_entregas_do_intervalo` com os dois (seção "Seleção da entrega").
  Nenhum `refs/heads/*` local nem SHA remoto anterior é consultado, e o nome da branch não entra na
  seleção. Fork, renomeação e PR de qualquer nome são decididos pelo que trazem.
- **Mesma validade, mesmo modo.** Cada entrega selecionada passa por `validade-do-portao.sh --rev
  <sha>` (`pr_decide_entregas`, em `portao-regras.sh`): portão `pronto` vencido, ausente,
  inconsistente ou ilegível, `historia_incompleta` e `erro_ambiente` reprovam em qualquer modo;
  `portao: null` segue o modo de `pr-so-com-portao` em `.expx/hooks.json`, igual ao `pre-push`.
  Qualquer entrega que barra reprova o PR.
- **`--branch` é só conferência.** O nome da branch de origem do PR continua obrigatório (e precisa
  ser um nome de branch válido), mas não seleciona nem isenta: quando não é o `branch:` de nenhuma
  entrega selecionada, a saída traz `aviso=branch_divergente` e a decisão não muda. Fork e
  renomeação legítimos passam quando o portão é válido; renomeação definitiva pede atualizar
  `branch:` no `ENTREGA.md` num commit de método `pre-e6`, que mantém a validade.
- **O SHA do PR, não o `HEAD` local.** A decisão é sobre o `--sha` recebido; o commit em que o
  checkout está não entra.
- **Saída.** Por entrega selecionada, `entrega[<i>]=`, `decisao[<i>]=` e `motivo[<i>]=` (`<i>` a
  partir de 1); cada aviso numa linha `aviso=<branch_divergente|...>`; e, uma única vez no fim, o
  resumo `decisao=`, `motivo=` (o da primeira entrega que barra, senão o da que decide), `entrega=`
  (`-` com nenhuma ou mais de uma) e `quantidade_entregas=<n>`. O código de saída segue só o resumo.
- **Mais de uma entrega.** O diagnóstico lista todas e diz que, se alguma veio da base, o evento do
  PR tem base defasada (`pull_request.base.sha` mais antigo que a base que a cabeça já integrou):
  gerar novo evento (push na branch do PR) com a base atual. É falso bloqueio, nunca aprovação.
- **História completa.** O clone do CI precisa de `fetch-depth: 0`; clone raso, `--base` ou `--sha`
  que não é objeto no clone, e objeto que falta no meio são `historia_incompleta` e reprovam. Sem
  merge-base num clone completo (branch órfã), a história do `--sha` inteira entra.
- **Códigos:** `0` passa ou avisa; `1` barra (o diagnóstico vai a stderr, com textos distintos para
  `historia_incompleta`, que manda completar a história, e para `erro_ambiente`); `64` uso (inclui
  `--branch` que não é nome de branch ou com prefixo `refs/`). Não existe opção de força.
- **Template.** `assets/ci/mergex-portao.yml` roda em `pull_request`, faz o checkout do SHA da
  cabeça do PR com `fetch-depth: 0` e chama `portao-ci.sh` com esse SHA, a branch de origem e o SHA
  da base do PR. Os valores do evento entram pelo `env:` do step, nunca interpolados no texto do shell.

### Limites do CI

A DM-185 fecha o contorno pelo nome da branch; ela **não** torna o CI barreira contra todo contorno
deliberado (spec, seção 15.1, itens 1 e 9 a 12):

- **O autor do PR controla a cabeça do PR.** Com `on: pull_request`, o `.expx/hooks.json` (o modo de
  `portao: null`), o `portao-ci.sh` e o próprio workflow vêm da árvore dele, e o check confia neles.
  O CI não é barreira contra todo contorno deliberado: não barra quem reescreve a própria verificação.
  No produto, exija `CODEOWNERS` com revisão obrigatória para `.expx/**`, `.claude/**` e
  `.github/**`.
- **PR sem `ENTREGA.md`.** Código enviado num PR que não cria, altera nem apaga nenhum
  `ENTREGA.md` (por exemplo, um cherry-pick dos commits de produto sem a entrega) não está sob o
  portão: a seleção é vazia e o CI passa com `ref_nao_aplicavel`. O CI não lê trailer de commit —
  só o `pre-push` lê o `Trabalho:` do commit enviado (parcela (c)).
- **Várias entregas ativas no mesmo PR.** Um PR empilhado sobre a base principal que traz uma
  entrega ainda não integrada além da sua seleciona as duas; a anterior fica vencida pelos commits
  da seguinte e o PR barra. Encadeie os PRs pela base ou entregue a anterior antes. Remover, ou
  tocar e restaurar, um `ENTREGA.md` existente também barra, sem exceção por `estado: entregue`.
- **Base do evento defasada.** Barra com o diagnóstico de base defasada (acima); nunca aprova.
- **Portão reposicionado por commit de método** (seção 15.1, item 1) continua indistinguível do
  fluxo legítimo: a validade prova que nada mudou depois de `portao_sha`, não que um E2 rodou nele.

### Handoff: esta branch não ativa o CI

Esta branch não ativa CI em nenhum produto: ela entrega o executável, o template e os testes, e nenhum
workflow versionado roda o `portao-ci.sh` nem é o template `mergex-portao` (DM-263: o
`.github/workflows/` da própria mergex só roda os testes dela). Ativar é handoff posterior e separado, feito no repositório do
produto: copiar o template para `.github/workflows/`, configurar a proteção de merge da branch
principal exigindo o check `mergex-portao` e exigir `CODEOWNERS` com revisão obrigatória para
`.expx/**`, `.claude/**` e `.github/**`. Sem a proteção de merge exigindo o check, ele não barra
nada. O empacotamento do `pre-push` e do template pelo ExpxDev é outro handoff.
### Condição do PR #192

O PR #192 fica em rascunho até o QA aprovar e até estarem comprovados no produto os três itens:

1. a instalação da MergeX nova com o `pre-push` ativo;
2. o check de CI correspondente com a proteção de merge;
3. os gates.

Enquanto isso não estiver comprovado, nenhum texto deste repositório afirma proteção em vigor.