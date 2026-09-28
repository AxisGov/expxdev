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
| `pr-so-com-portao` | `PreToolUse` | aviso | Barra push e abertura de PR sem `PRONTO` registrado no rastro |

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

A mensagem (`-m` ou arquivo de `-F`) declara uma de duas classes mecânicas:

- **E1:** exatamente um `Task:` e um `Trabalho:`, sem `Metodo:`;
- **método:** exatamente um `Trabalho:` e um `Metodo:` (`pre-e2`, `pre-e6`
  ou `e8`), sem `Task:`.

`Task:` + `Metodo:`, qualquer chave de controle duplicada e `Metodo:` fora do
enum param mesmo quando o hook está em aviso. A gramática vem de uma única
implementação, `scripts/contrato-de-commit.sh`: commit de método válido não é
interpretado como E1 e segue para o hook de escopo, sem cobrar status/suíte de
task. Sem nenhuma das duas declarações, o hook não inventa a classe.

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

## Onde cada coisa mora

Segue a convenção do ecossistema — a mesma da `stackx` e da `sprintx`:

```
.claude/hooks/comum/     biblioteca e hooks compartilhados (base, segredo, branch)
.claude/hooks/mergex/    hooks próprios da mergex
.claude/hooks/teste.sh   a suíte
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
| `desligado` | Não faz nada, nem registra |

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
hook, rode `./hooks/teste.sh` — a suíte cobre exatamente os casos onde essas
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
rodar — timeout é falha aberta. O `mergex/git-perigoso` usa 30 s, o mesmo
timeout crítico do `sprintx/git-perigoso`. A barreira posterior, fechada, é o
E1 (`fechamento-do-e1.sh`): ele inventaria a árvore inteira antes do
`git add`, então um arquivo de task irmã escrito enquanto o hook de escopo da
skill de origem estourava o timeout ainda barra o fechamento (DM-172).
