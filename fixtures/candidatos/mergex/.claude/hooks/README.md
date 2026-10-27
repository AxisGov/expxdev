# Hooks da mergex

Implementação dos hooks descritos no contrato `expx-eventos` v1. O contrato
mora no repositório do painel, em `docs/contrato/CONTRATO-expx-eventos.md`, e
governa formato de rastro, modos e regras comuns.

## Por que hooks

Toda regra inviolável da mergex é hoje uma instrução que o modelo pode esquecer
numa execução longa. Hook é script determinístico: roda sempre, porque quem
executa é o harness, não o modelo.

A mergex é a skill que mais toca o versionador — é onde os hooks de segurança
importam mais, e onde um hook mal escrito faz mais estrago.

## Os seis hooks

| Hook | Evento | Modo inicial | O que faz |
|---|---|---|---|
| `sem-segredo` | `PreToolUse` | **bloqueio** | Barra commit e escrita com segredo, credencial ou dado real de cliente |
| `mergex/git-perigoso` | `PreToolUse` | **bloqueio** | Barra push forçado, commit/push na principal, reescrita de histórico enviado, descarte de alteração local, limpeza destrutiva |
| `branch-limpa` | `PreToolUse` | **bloqueio** | Barra criação ou troca de branch com alteração não commitada pendente |
| `commit-por-task` | `PreToolUse` | aviso¹ | Verifica que o commit corresponde a **uma** task, `concluida` e com registro de suíte válido (`parcial` ou `verde`); e que nenhum arquivo em preparação pertence **só a outra task** da feature |
| `arquivo-fora-do-plano` | `PreToolUse` | aviso | Compara o que está em preparação com a lista declarada na task. Artefato de método do **próprio** trabalho é isento; o de outro trabalho, não |
| `pr-so-com-portao` | `PreToolUse` | aviso² | Aviso antecipado no `git push`: avisa quando não determina o push; bloqueia só o push simples que a regra do `pre-push` prova inválido e o `--no-verify` |

Os três de segurança nascem em bloqueio: segredo commitado não tem volta, e o
falso positivo ali é raro. Os três de método nascem em aviso, e só sobem a
bloqueio depois de rodarem semanas sem falso positivo — a lista de violações
que o painel acumula é o que guia a promoção.

### ¹ A exceção do `commit-por-task`: arquivo de task irmã

O hook continua em **aviso**, e todas as verificações dele obedecem ao modo
configurado — menos **uma**: um arquivo em preparação que mudou, que a task
sendo fechada **não** declara e que **outra task da feature** declara. Essa
condição **falha fechada mesmo em aviso** (`exit 2`).

Não é uma promoção do hook, e sim uma condição que não sobrevive a falhar
aberta: deixá-la passar cria o **commit parcial enganoso** da task — o
histórico afirmando que a task fechou com o trabalho que ela tem —, e commit
no histórico não tem volta. As demais verificações continuam avisando, e
`desligado` continua desligando o hook inteiro.

Quem classifica é `.claude/skills/mergex/scripts/ownership-da-task.sh`: uma
implementação só, provada pela bancada `scripts/ci/test-ownership-task.sh`.
Quando a branch identifica exatamente uma entrega SprintX/RunX, script ausente
é instalação MergeX incompleta e o hook para; não degrada para `n/a`.
Plano corrente ausente, ilegível ou inconsistente também para o commit manual:
o hook preserva o código de saída do classificador, em vez de confundir erro
sem linhas classificadas com autorização para seguir.

O plano também sai desse contexto: branch ativa + `branch:` de exatamente uma
`docs/entregas/<trabalho_id>/ENTREGA.md`, então `expx_tool` resolve somente a
pasta canônica daquele trabalho. Nenhum plano histórico com task id repetido
participa, e recência/rastro nunca selecionam ownership.

A mensagem (`-m` ou arquivo de `-F`) declara uma de três classes mecânicas:

- **E1:** exatamente um `Task:` e um `Trabalho:`, sem `Metodo:`;
- **método:** exatamente um `Trabalho:` e um `Metodo:`, do enum fechado
  `pre-e2 | reconciliacao-base | predecessores | retomar-v9-predecessores | pre-e6 | e8`, sem `Task:`;
- **integração de base:** exatamente um `Trabalho:` e um `Integra-base:` com o
  SHA completo do segundo pai, sem `Task:` nem `Metodo:` — o merge que integra
  uma base que avançou depois do E8
  (`references/11-reconciliacao-base.md`).

`Task:` + `Metodo:`, qualquer chave de controle duplicada e `Metodo:` fora do
enum param mesmo quando o hook está em aviso.

**O commit de integração da base.** Os dois hooks de commit reconhecem a classe
pela **mensagem**, nunca pelo estado do Git, por uma biblioteca só:
`comum/integracao-da-mensagem.sh`, carregada com `.` pelo `commit-por-task` e
pelo `arquivo-fora-do-plano`. Só vale a mensagem que declara `Integra-base:`
como trailer isolado e limpo, com `MERGE_HEAD` presente; ela passa por
`contrato-de-commit.sh --validar-integracao` e o `Integra-base:` tem de ser o
`MERGE_HEAD`. O que a leitura não isola (aspas soltas, lixo depois dos 40 hex,
trailers que o Git não acha) é classe "nenhuma" e segue as regras de sempre:
bloquear só com prova.

- `commit-por-task`: integração válida não é mistura de tasks, e as regras de
  status e suíte não se aplicam; integração que declara `Integra-base:` e não
  passa no contrato barra (`exit 2`).
- `arquivo-fora-do-plano`: numa integração válida, avalia só os caminhos que
  diferem do segundo pai (`git diff --cached MERGE_HEAD`) — o que a resolução
  acrescenta, não tudo o que veio da base. O arquivo nascido na base e ajustado
  pela integração só deixa de ser fora do plano pela reconciliação de base.
  Por isso, com o hook em `bloqueio`, o commit de `M` com arquivo reconciliável é barrado: esse commit
  precisa do hook em `aviso`, e a cobertura vem depois, pelo `--registrar`.

A gramática das três classes vem de uma única implementação,
`scripts/contrato-de-commit.sh`: commit de método válido não é interpretado
como E1 e segue para o hook de escopo, sem cobrar status/suíte de task.
Sem nenhuma das três declarações (task, método ou integração), o hook não
inventa a classe.

A task que está fechando sai do `Task:` validado e **nunca é adivinhada**. O
contrato inteiro está em
`references/01-commits.md`, "O dono do arquivo é a task que está sendo
fechada", e nas decisões da skill.

`scripts/fechamento-do-e1.sh` — a seção crítica do E1 — classifica com o
**mesmo** script, **antes** do primeiro `git add`: pelo caminho normal, o
arquivo de task irmã nunca chega a este hook, porque nunca chega a ser
staged. Este hook continua existindo como **defesa em profundidade** para
quem roda `git add`/`git commit` por fora da seção crítica — as duas chamadas
classificam pela mesma implementação, nunca por regras divergentes.

A mergex só **detecta e nomeia** a condição (`arquivo_de_task_irma`). Abrir
`B-NN` e replanejar é da sprintx.

### ² O `pr-so-com-portao`: aviso antecipado, não barreira

A barreira de push da MergeX (DM-184; spec de reconciliação pós-E8, seção
13, itens 5, 7 e 8) tem três camadas. As três aplicam a mesma regra,
`scripts/portao-regras.sh`, que roda `validade-do-portao.sh --rev` sobre o SHA
enviado, e leem o mesmo modo (`pr-so-com-portao` em `.expx/hooks.json`):

| Camada | Papel |
|---|---|
| `pre-push` do Git (`portao-push.sh`, ativado e provado pelo E0 e pelo E2) | Barreira local **autoritativa contra erro normal**. Decide pelas refs e SHAs que o Git entrega, qualquer que seja o comando que disparou o push: `cd … &&`, `bash -c`, `xargs`, função ou alias chegam iguais |
| Este hook | **Aviso antecipado.** Antecipa o diagnóstico quando consegue provar o resultado; no resto, avisa e deixa o Git seguir até o `pre-push` |
| CI com proteção de merge (`portao-ci.sh` e o template em `assets/ci/`) | Barreira contra `--no-verify` e contra o contorno pelo nome da branch: seleciona as entregas **só pelo conteúdo do PR** (DM-185), nunca pelo nome, nos limites da spec (seção 15.1). Esta branch entrega o executável e o template e não ativa CI em produto nenhum |

**A validade do portão.** O portão do E2 vale para um SHA (`portao_sha`, DM-181).
`scripts/validade-do-portao.sh --verificar --entrega <ENTREGA.md> --rev <sha>` lê
`portao` e `portao_sha` da revisão avaliada, nunca do disco, e só mantém o
`pronto` se todo commit em `portao_sha..<sha>` é commit de método `pre-e6` ou
`e8`, de um pai, tocando só o catálogo daquele checkpoint. Commit de produto, de
teste, de plano ou merge invalida (`commit_de_produto`, `commit_merge`,
`metodo_fora_do_catalogo`); clone raso ou objeto ausente é
`historia_incompleta`, e ambiente que impede a avaliação é `erro_ambiente` —
os dois barram sempre. É a regra que as três camadas consomem; nenhuma tem regra
própria.

O hook não é fronteira de segurança. Ler o texto do shell nunca cobre tudo
(alias, função, config de push, plumbing), e o que ele não consegue determinar
vira aviso, nunca bloqueio.

**Quando ele age.** Num comando que publica: `git` como programa seguido de
`push`, `send-pack` ou `subtree push` (com opções globais no meio), ou o
executável `git-push`/`git-send-pack`, inclusive dentro de `bash -c`, `xargs`,
função ou subshell. Citação (`echo push`, `git log --grep push`), outro
programa (`docker push`, `npm run push-notifications`) e abertura de PR
(`gh pr create`) saem na hora, calados: o PR só expõe o que já chegou ao
remoto por um push.

**1. `--no-verify` reconhecido: bloqueia** (`exit 2`, em qualquer modo,
`desligado` inclusive). O `--no-verify` faz o Git pular o `pre-push`, e a
mensagem diz isso e aponta o CI como a barreira contra esse contorno.
Reconhecido é um segmento cujo programa é o `git`, seguido do `push` (só
opções globais no meio) e do `--no-verify` ou de um prefixo único dele que o
Git aceita (`--no-veri`, `--no-verif`); ou um executor como `bash -c`, `env`,
`nice` ou `xargs` que roda esse push. `git commit --no-verify` não é push, e a
citação (`echo "git push --no-verify"`, `git commit -m "… git push
--no-verify"`, `git log --grep …`) não executa nada: sai calada.

**2. Bloqueia só com prova** (`exit 2`), quando tudo isto vale:

- o comando é um único `git push` simples: uma linha, sem `;`, `&&`, `||`,
  `|`, subshell, `cd`, `-C` ou outra opção global, prefixo de ambiente, aspas
  ou expansão;
- as opções não mudam quais refs sobem (`-u`, `-v`, `-q`, `-o`, `--force*`,
  `--atomic`, `--follow-tags`…). `--all`, `--mirror`, `--tags`, `--delete`,
  `--dry-run`, `--repo` e qualquer outra deixam o push indeterminado;
- o repositório do cwd se lê pelo Git (`git rev-parse --show-toplevel`) e não
  tem `remote.<nome>.push` nem `remote.<nome>.mirror` configurado;
- cada refspec resolve sem ambiguidade. A origem é `HEAD`, uma branch local
  sem tag ou remota homônima, um SHA ou uma expressão que o Git resolve num
  commit. O destino vem do refspec ou, sem refspec, da branch atual pelo
  `push.default` (`simple`, `current` ou `upstream`);
- `pr_decide_ref` dá `barra` para alguma ref por um motivo do portão:
  - vencido: `commit_de_produto`, `commit_merge`, `metodo_fora_do_catalogo`,
    `portao_sha_nao_ancestral`;
  - ausente ou inconsistente: `portao_sha_ausente`, `portao_nao_pronto`
    (inclusive `portao: bloqueado`);
  - `historia_incompleta` ou `caminho_com_controle`;
  - `portao: null` com o modo `bloqueio`.

O hook passa a `pr_decide_ref` o SHA enviado e o SHA remoto **nulo**: lê só a
árvore do SHA enviado e a ponta local da branch, um subconjunto do que o
`pre-push` lê. Assim ele nunca barra o que o `pre-push` deixaria passar. Uma
ref aplicável inválida barra o push inteiro, como no `pre-push`. A mensagem
nomeia a ref, o SHA, o motivo e o primeiro commit, e manda rodar o E2
(`/mergex-check`).

**3. Em qualquer outro caso, avisa e sai 0.** O aviso vai ao stderr (Claude
Code) e ao JSON do stdout (OpenCode). Os casos:

- comando composto, com expansão, opção global, prefixo de ambiente ou mais de
  uma linha;
- cwd que o Git não lê: fora de repositório, `.git` que não se resolve,
  caminho UNC, `dubious ownership`;
- opção, config ou refspec que o hook não lê sem ambiguidade (origem ambígua
  ou que não resolve, destino `HEAD`);
- `erro_ambiente` ou `entrega_indeterminada` da regra: o ambiente impediu a
  avaliação, e isso não prova nada sobre o push;
- validade que não termina dentro do orçamento, ou sem `timeout` funcional;
- `portao-regras.sh` ausente ao lado dos hooks.

**Modo.** É o de `pr_modo_null`, o mesmo do `pre-push` e do CI. Com
`portao: null`: `bloqueio` barra, `aviso` avisa, `desligado` passa. Modo
inválido ou `.expx/hooks.json` ilegível valem como `bloqueio`. O modo nunca
afrouxa o portão vencido, ausente, inconsistente ou bloqueado.
`desligado` silencia os avisos do hook, mas não pula a regra do portão no push
simples nem o `--no-verify`. A suíte `scripts/ci/test-r2-barreira-push.sh modo`
dá a mesma entrada aos três consumidores e exige a mesma decisão.

**Tempo.** O hook inteiro cabe num orçamento interno de **8 s**
(`ORCAMENTO=8`), abaixo do `timeout` de 10 s do harness, que é o mesmo dos
outros hooks no `.claude/settings.json` e o limite único (`TEMPO_LIMITE`) do
plugin do OpenCode. A regra roda num processo filho com o `timeout` do
coreutils. Ele só é aceito depois de provar, pelo comportamento, que mata um
processo no prazo (`timeout 0.2 sleep 3` sai 124 em menos de 2 s), a mesma
técnica de `ativacao-pre-push.sh`. Sem `timeout` funcional, ou com o
orçamento estourado, o hook avisa e sai 0, e o processo filho morre inteiro.
Sem `timeout` funcional (macOS sem coreutils, por exemplo), o hook nunca
antecipa bloqueio de portão e só avisa; o `--no-verify` continua bloqueado.

São uma validade por ref enviada, nenhuma varredura de branches e nenhum laço
de subida de diretório. Um cwd `//` ou UNC sem repositório avisa na hora.

**Git for Windows sobre `\\wsl.localhost\...`.** O Git for Windows recusa um
repositório do WSL sem uma exceção de `safe.directory` (`dubious ownership`).
O hook então avisa, e a mensagem diz que a exceção na config **global** é
pré-requisito do `pre-push` no Git for Windows:

```
git config --global --add safe.directory '<caminho do repositório>'
```

O hook tira o CR que o `jq.exe` do Windows escreve antes de comparar.

**Limites.** O que o hook não lê vira aviso e fica com o `pre-push`:

- **Alias de git.** Com `git config alias.p push`, `git p origin <branch>` não
  é reconhecido como push e nem o aviso sai. O `pre-push` decide igual.
- **Push que o hook não determina.** Comando composto, `cd`, `-C`,
  `GIT_DIR=`, função, `xargs`, `bash -c`, `--all` e `--tags` avisam em vez de
  bloquear, mesmo com o portão vencido.
- **Publicação puxada pelo remoto.** Com um remoto no sistema de arquivos,
  `git -C <remoto> fetch <wt> feature/x:feature/x` grava a branch no remoto
  sem push. Isso não passa nem pelo hook nem pelo `pre-push`: a barreira é o
  CI, nos limites da seção 15.1, itens 1 e 12.
- **`send-pack`.** O `git send-pack` não roda o `pre-push`. O hook só avisa,
  e a barreira é o CI, nos limites da seção 15.1, itens 1 e 12.

A implementação anterior deste hook foi substituída pela DM-184. Ela varria o
portão de todas as branches a cada comando, tinha um prazo de 45 s que falhava
fechado e seguia o `cd` encadeado do texto do comando. Com dezenas de branches
entregues, ela estourava o prazo e barrava push legítimo.

## Onde cada coisa mora

Segue a convenção do ecossistema — a mesma da `stackx` e da `sprintx`:

```
.claude/hooks/comum/     biblioteca e hooks compartilhados (base, segredo, branch)
.claude/hooks/mergex/    hooks próprios da mergex
.claude/hooks/teste.sh   a suíte (só no repositório da mergex; não é instalada no projeto)
.claude/settings.json    o registro dos hooks no Claude Code
.claude/agents/          os dois agentes
.opencode/plugin/        a ponte para o OpenCode
.opencode/agent/         os mesmos agentes, no formato do OpenCode
.expx/hooks.json         o modo de cada hook
```

**Hook com nome que outra skill também usa mora no namespace da skill.** O
`git-perigoso` da mergex é `.claude/hooks/mergex/git-perigoso.sh`, com id
`mergex/git-perigoso` em `.expx/hooks.json`; a sprintx publica o dela em
`.claude/hooks/sprintx/git-perigoso.sh`, com id `sprintx/git-perigoso`. Os
dois coexistem sem sobrescrita, e desligar um id não desliga o outro. O id sem
namespace (`git-perigoso`) não é lido por nenhum dos dois (DM-171).

**A lógica não é duplicada entre os dois harnesses.** O plugin do OpenCode
(`.opencode/plugin/mergex.ts`) invoca os **mesmos scripts** de
`.claude/hooks/`. Só o registro difere, porque os mecanismos diferem:

| | Claude Code | OpenCode |
|---|---|---|
| Registro | `settings.json`, evento → matcher → handler | plugin JS/TS, `tool.execute.before` |
| Bloqueio | `exit 2`, motivo no stderr | lançar exceção |
| Aviso | stderr, lido pelo transcript | não existe no `before`: o aviso é represado e anexado ao resultado no `after` |

Por causa da última linha, os hooks emitem o aviso **nos dois canais**: stderr
(Claude Code) e JSON no stdout (OpenCode). Um harness ignora o canal do outro.

## Modo, por hook

O modo vive em `.expx/hooks.json`, na raiz do projeto:

```json
{
  "expx_hooks": 1,
  "hooks": {
    "sem-segredo": { "modo": "bloqueio" },
    "mergex/git-perigoso": { "modo": "bloqueio" },
    "branch-limpa": { "modo": "bloqueio" },
    "commit-por-task": { "modo": "aviso" },
    "arquivo-fora-do-plano": { "modo": "aviso" },
    "pr-so-com-portao": { "modo": "aviso" }
  }
}
```

| Modo | Comportamento |
|---|---|
| `aviso` | Registra `regra_violada` no rastro e deixa passar |
| `bloqueio` | Registra `acao_bloqueada`, sai com 2 e devolve o motivo ao modelo |
| `desligado` | Não faz nada, nem registra — menos, no `pr-so-com-portao`, o push simples provadamente inválido e o `--no-verify` (²), que nenhum modo pula |

Arquivo ausente: valem os padrões da tabela dos seis hooks. **Um hook de
segurança nunca é rebaixado por arquivo ausente** — a ausência do arquivo não
afrouxa nada, só o `desligado` explícito o faz.

## As três regras de desenho que este diretório obedece

Hook em execução de comando é o mais arriscado do ecossistema: intercepta
**toda** chamada de terminal, inclusive as que não têm nada a ver com a mergex.

1. **Casar o comando com precisão.** Uma regra frouxa que barre qualquer coisa
   contendo `push` atrapalha o dev o dia inteiro. Os casamentos são ancorados
   em `git` como programa e na forma real da opção, não em substring solta.
2. **Ser rápido.** Roda em toda chamada de terminal; acima de 200 ms o atraso é
   perceptível. Tudo é `bash` + `jq`, sem interpretador pesado, sem rede, e
   com saída antecipada assim que o comando não é do versionador.
3. **Falhar aberto no método, fechado na segurança.** Hook de método que quebra
   e trava o terminal faz o time desligar tudo — inclusive os de segurança.

## Como testar

No checkout da própria mergex — a suíte carrega amostras de segredo de propósito e
não é instalada no projeto (DM-282):

```
./.claude/hooks/teste.sh
```

Roda os casos de cada hook: o que tem que barrar, o que tem que passar, e os
falsos positivos conhecidos que precisam continuar passando.

## Lacuna registrada no contrato

O contrato manda, na regra 7, que o hook **sempre grave no rastro, inclusive
quando permite**. Mas o vocabulário de `evento` não tem um termo para "avaliou
e deixou passar": os disponíveis para hook são `regra_violada` (modo aviso),
`acao_bloqueada` (modo bloqueio), `suite_executada` e `arquivo_alterado`.

Inventar um enum aqui poluiria a leitura do painel, que trata `evento` como
lista fechada. Enquanto o contrato não nomear esse evento, **a passagem limpa é
silenciosa**. Nada se perde para o propósito declarado: o painel precisa de
`regra_violada` e `acao_bloqueada` para montar a lista de violações que guia a
promoção de aviso para bloqueio, e as duas são gravadas.

Quem mantém o contrato decide se acrescenta um `regra_avaliada` ao vocabulário.

## Nota de portabilidade

Os scripts rodam em **bash 3.2**, que é o que o macOS ainda entrega. Isso
exclui `mapfile`/`readarray` e outras construções de bash 4+. Ao editar um
hook (no checkout da mergex), rode `./.claude/hooks/teste.sh` — a suíte cobre exatamente os casos onde essas
diferenças aparecem.

Dependências: `bash`, `jq`, `git`, e os utilitários POSIX (`grep`, `sed`,
`awk`, `find`). Nenhuma chamada de rede, em nenhum caminho.

**`jq` precisa estar no PATH do processo que executa o hook**, não só no do
terminal interativo: o harness roda `bash` não interativo, que não lê
`~/.bash_profile`. No `mergex/git-perigoso`, jq ausente é **bloqueio de
contrato** — toda chamada cujo payload menciona `git` é barrada com a mensagem
`dependência ausente: jq` — porque sem jq o comando não pode ser lido e o hook
passaria sem avaliar nada (DM-171). Não existe parser alternativo. Os demais
hooks que leem o payload por jq (`sem-segredo`, `branch-limpa` e os de método)
ainda **falham abertos** sem jq: risco registrado na DM-171, fora do escopo do
M4-A.

**Timeout.** O harness cancela o hook que estoura o timeout e deixa o comando
rodar — timeout é falha aberta. No Claude Code, o `mergex/git-perigoso` usa
30 s, o mesmo timeout crítico do `sprintx/git-perigoso`; no OpenCode, ele fica
no limite único de 10 s do plugin (`TEMPO_LIMITE`). A barreira posterior, fechada, é o
E1 (`fechamento-do-e1.sh`): ele inventaria a árvore inteira antes do
`git add`, então um arquivo de task irmã escrito enquanto o hook de escopo da
skill de origem estourava o timeout ainda barra o fechamento (DM-172).
