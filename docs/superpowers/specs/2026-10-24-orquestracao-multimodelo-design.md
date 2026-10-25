# Orquestração multimodelo — harness, modelo e esforço por papel — desenho

Data: 2026-10-24. Repositórios: AxisGov/expxdev (contrato, resolvedor, instalação,
rastro e painel); AxisGov/sprintx, AxisGov/runx, AxisGov/mergex e demais forks
(declaração de classe nos agentes).
Estado de partida: expxdev `f0a9dfb` (v0.12.2).
Estado: **desenho aprovado pelo Codex na revisão 5 (§17); decisões H1–H11 tomadas pelo Flávio em 2026-10-24 (§15). Nenhuma linha de
código, nenhuma mudança de contrato vigente e nenhuma mudança em skill entram
com este documento.**

## 1. Objetivo e limites

O rastro já registra o executor efetivo: `model` e `effort` em
`CONTRATO-expx-eventos.md` (0.12.2). Falta a outra metade, uma **política** que
diga, para cada papel do método, qual harness, provedor, modelo e esforço podem
executá-lo, com resultado determinístico, auditável e equivalente entre Claude
Code, OpenCode, Codex e harnesses futuros.

Fora do escopo deste desenho e das fases que ele planeja:

- escolha automática por custo, orçamento ou cota (fica registrada como
  decisão pendente na seção 15);
- troca automática de modelo depois de `usage_limit_reached`, que continua
  bloqueio de recurso, como já define a spec da RunX (§6);
- ler, guardar, transmitir ou validar credenciais;
- fundir agentes distintos ou apagar responsabilidades e permissões de um
  agente para caber numa classe.

## 2. Resultado normativo

Este desenho produz, numa fase posterior (seção 14):

- **`docs/contrato/CONTRATO-expx-orquestracao.md`**, novo e normativo:
  vocabulário, arquivo de política, precedência, resolução, manifesto de
  capacidades, materialização e falhas;
- **emenda a `CONTRATO-expx-instalacao.md`**: materialização por adaptador,
  seção nova do lock e convivência com `.expx/agentes.json` v1;
- **emenda a `CONTRATO-expx-eventos.md`**: chaves extras da resolução no rastro.
  O contrato de eventos só **referencia** a resolução e não a redefine;
- possivelmente o schema de `.expx/`.

As classes canônicas da spec de otimização
(`2026-10-21-otimizacao-arquitetura-skills-expx-design.md`, §6) são
**incorporadas** aqui, sem criar uma segunda taxonomia. A tabela "Adaptação por
runtime" daquela seção é **substituída** pelo mapa por adaptador da seção 7
deste desenho. As regras de abertura e repetição de agentes da RunX continuam
valendo como estão.

## 3. O que existe hoje

| Peça | Onde | O que faz | Limite |
|---|---|---|---|
| Piso por agente | frontmatter de cada `.claude/agents/<agente>.md` da skill | `model` e `effort` que o agente usa | só Claude; o valor nomeia um modelo, não uma classe |
| Override do projeto | `.expx/agentes.json` v1, `src/harness/agentes.ts` | reescreve `model`/`effort` na cópia instalada | só Claude; aceita alias Claude ou `claude-*`; **permite rebaixar** (o exemplo do contrato põe `runx-investigador` em `haiku`/`low`) |
| Harness `codex` | `src/harness/codex.ts` | instala só o hook `SessionStart` em `.codex/hooks.json` | nenhum agente instalado |
| Harness `opencode` | `src/harness/` | ponte de hooks da RunX | agentes de `.opencode/agent(s)/` fora do escopo do `init` |
| Rastro | `nucleo/hooks/expx-rastro.sh:408-420` | `EXPX_MODEL`/`EXPX_EFFORT` têm prioridade; no contexto Claude, o frontmatter instalado serve de fallback; nos demais harnesses, `null` | ver o achado da seção 11.2 |
| Painel | `src/servidor/agentes.ts` | projeta a configuração instalada | somente leitura, não decide nada |

Decisões já tomadas, que este desenho preserva (handoff pós-0.12.1):

1. As skills se comportam de modo equivalente entre harnesses, e nenhum harness
   herda configuração Claude indevidamente.
2. Metadado explícito do runtime tem prioridade.
3. O fallback para a configuração instalada só vale em contexto compatível; fora
   dele, o histórico fica indisponível.
4. Identificadores de modelo são livres de provedor.
5. `model` e `effort` do rastro registram o executor efetivo e não o escolhem.
6. Agentes distintos não são combinados apagando responsabilidades ou
   permissões.

## 4. Três coisas separadas

O desenho inteiro depende de não misturar três camadas:

| Camada | O que é | Onde vive | Quem escreve |
|---|---|---|---|
| **Classe declarada** | o mínimo que o papel exige (`raciocinio_normal`, por exemplo) | frontmatter do agente na skill (`classe:`) | a skill |
| **Resolução materializada** | a alternativa concreta escolhida para um adaptador (`{adaptador, model, effort}`) e de que camada ela veio | registro imutável `.expx/resolucoes/`, lock do projeto e arquivo de agente instalado | o `expx init`/`update` |
| **Executor observado** | o que o runtime informou que de fato executou | `model`/`effort` no rastro | o escritor do rastro |

O campo histórico `model` do rastro **nunca** representa intenção. Quando o
runtime não informa o executor, `model`/`effort` ficam `null`, e a intenção é
alcançada pelo `resolucao_id` (seções 9 e 11).

## 5. Vocabulário

### 5.1 Papéis

O papel diz o que o agente faz no método e quais garantias ele precisa ter. Ele
não diz qual modelo o executa.

| Papel | Escreve no projeto | Aprova ou veta | Agentes de hoje |
|---|---|---|---|
| `planejar` | só artefatos de método | não | principal na F1–F4 da SprintX |
| `implementar` | sim | **nunca** | principal na execução |
| `investigar` | não, ou só artefatos de evidência | não | `sprintx-investigador`, `runx-investigador`, `legadox-cartografo`, `stackx-cartografo`, `cartografo-visual`, `avaliador-de-raio`, `analista-de-conflito` |
| `testar` | não | sim, sobre o teste | `sprintx-revisor-testes`, `runx-revisor-testes`, `qa` |
| `revisar` | não | sim | `auditor-plano`, `revisor-diff`, `auditor-design` |

A atribuição de papel a cada agente é **declarada pela skill**, não inferida
pelo ExpxDev. A coluna da direita é só o ponto de partida para as PRs nas
skills. Um agente da LegadoX que escreve (`legadox-cartografo`,
`avaliador-de-raio`) tem papel `investigar` com escrita restrita a artefatos de
evidência, como hoje.

### 5.2 Classes canônicas

São as três classes da spec da RunX (§6), em ordem total:

`mecanico_triagem` < `raciocinio_normal` < `profundo_excepcional`

**Só as classes têm ordem.** Não existe ordenação universal entre modelos de
fornecedores diferentes, e o desenho não tenta criar uma. "Piso" significa
**classe mínima**. Cada adaptador declara quais pares `{model, effort}`
satisfazem cada classe (seção 7).

## 6. Manifesto de capacidades por adaptador

Uma política só se aplica onde a capacidade de que ela precisa está
**comprovada**. Cada adaptador publica um manifesto, versionado no ExpxDev e
datado pela verificação que o sustenta. "Não verificado" é um valor legítimo e
conta como ausência da capacidade.

| Capacidade | Claude Code | OpenCode | Codex CLI |
|---|---|---|---|
| `seleciona_modelo` por agente | sim: `model` no frontmatter | sim: `model` como `provider/model` | sim: `model` em `.codex/agents/` |
| `seleciona_effort` por agente | sim: `effort` (`low`…`max`) | parcial: `variant` por agente existe no código v1.19.4 e não no doc; não verificado na 1.18.23 | sim: `model_reasoning_effort`, com níveis que dependem do modelo |
| `materializa_arquivo` | sim, já feito pelo `init` | não feito hoje: o `init` não instala agentes do OpenCode | não feito hoje: o `init` não instala agentes do Codex |
| `observa_executor.model` | parcial: subagente em primeiro plano tem `resolvedModel` e `modelsUsed` no `tool_response` do `PostToolUse` do `Agent`; a sessão tem `from_model`/`to_model` em `PreModelSwitch`/`PostModelSwitch` e `model` no `SessionStart` (nem sempre); não existe `$CLAUDE_MODEL` | parcial: só no plugin `chat.message` (código, fora do doc); processos filhos não recebem | sim: `model` no stdin dos hooks |
| `observa_executor.effort` | sim: `effort.level` nos hooks e `$CLAUDE_EFFORT` | parcial: `variant` no `chat.message` | **não**: ausente do payload |
| `limita_ferramentas` | sim: `tools:` como lista permitida e `disallowedTools` (omitir os dois herda todas) | sim: `permission:` | **não**: o arquivo do agente não substitui sandbox nem aprovações do pai |
| `garante_revisao_sem_escrita` (nível `estrutural` da seção 12) | sim, só com `tools:` sem `Edit`, `Write`, `NotebookEdit` e sem `Bash`; com `Bash` a escrita indireta continua possível e o nível não se aplica | não verificado | **não**: "custom agent instructions can ask an agent to avoid edits, but they don't create a separate read-only sandbox" |
| `fallback_nativo` | sim, **por sessão**: `fallbackModel` / `--fallback-model` (até três modelos), aplicado também aos subagentes desde a v2.1.247; não cobre rate limit, billing nem autenticação; não há cadeia por agente | não verificado | não verificado |
| `seleciona_na_invocacao` | `model`: sim (o parâmetro `model` da invocação vence o frontmatter); `effort`: não verificado | não verificado | **não serve para sobrepor**: o valor do arquivo do agente vence o valor explícito do spawn |
| `hooks` | sim | por plugin | sim, com eventos próprios, não equivalentes um a um aos do Claude |
| `subagentes` | sim | sim | sim (`.codex/agents/`, ligados por padrão) |
| `troca_provedor_por_agente` | não documentado | não verificado (o formato `provider/model` sugere que sim, mas não há fonte nem teste) | **não**: o subagente herda o `model_provider` do pai |
| `vincula_invocacao` | sim: `tool_use_id` no `PreToolUse`, `PostToolUse`, `PostToolUseFailure` e `PermissionDenied` (este só no modo auto); `session_id` comum a todos os hooks; `updatedInput` substitui o input; o input do `Agent` tem `model` (alias) e não tem `effort`; `onFailure: "block"` desde a v2.1.295 | não verificado | não verificado |
| `paralelismo` | não verificado | não verificado | sim: `agents.max_concurrent_threads_per_session` limita as threads de subagente |

Fontes (acesso em 2026-10-24): code.claude.com/docs/en/{model-config,
sub-agents, hooks, statusline, env-vars, authentication}; opencode.ai/docs/
{models, config, agents, plugins, providers} e anomalyco/opencode@v1.19.4;
learn.chatgpt.com/docs/{config-file, agent-configuration/subagents, hooks,
auth} e openai/codex@rust-v0.164.0. **Antes de cada fase de implementação, a
linha do adaptador é verificada de novo na versão instalada.** O manifesto não
é escrito de memória.

Riscos que o manifesto precisa expor ao `doctor`:

- **Claude:** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` ignora o `model` do
  frontmatter, e `CLAUDE_CODE_EFFORT_LEVEL` vence o `effort` do agente. Um
  `fallbackModel` configurado pode pôr o subagente num modelo fora da cadeia
  declarada (seção 10). Com sessão em `bypassPermissions`, `acceptEdits` ou
  `auto`, o `permissionMode` do agente é ignorado. Isso não afeta `tools:`, que
  continua limitando as ferramentas.
- **Codex:** `.codex/config.toml` do projeto só é lido em projeto confiável, e há
  duas formas de definir agente (`agents.<nome>.config_file` e arquivos soltos)
  sem interação documentada.
- **OpenCode:** a precedência entre o agente e `--model`/`--variant` não é
  documentada, e a branch `dev` está em reestruturação.

## 7. Arquivo de política e tabela embutida

### 7.1 `.expx/orquestracao.json`

Arquivo novo, do projeto, versionado. O `init`, `add`, `remove` e `update`
nunca o escrevem, pela mesma regra do `agentes.json`.

```json
{
  "expx_orquestracao": 1,
  "adaptadores": {
    "claude": {
      "classes": {
        "raciocinio_normal": [
          { "id": "sonnet-high", "model": "sonnet", "effort": "high" },
          { "id": "opus-medium", "model": "opus",   "effort": "medium" }
        ]
      }
    },
    "opencode": {
      "classes": {
        "raciocinio_normal": [
          { "id": "gpt-high", "model": "openai/gpt-5.4", "effort": "high" }
        ]
      }
    }
  },
  "agentes": {
    "runx-investigador": {
      "classe": "profundo_excepcional",
      "justificativa": "causa raiz em código legado sem testes"
    }
  }
}
```

Regras:

- cada classe recebe uma **cadeia ordenada de alternativas**. A primeira é a
  materializada; as seguintes só servem para validar um fallback (seção 10).
  Toda alternativa da cadeia satisfaz a mesma classe, as mesmas permissões e os
  mesmos requisitos do papel;
- o `id` da alternativa é estável e é o que o rastro e o override de sessão
  citam, nunca os valores crus;
- a sintaxe de `model` é validada **pelo adaptador** (alias ou `claude-*` no
  Claude; `provider/model` no OpenCode; slug no Codex). O `effort` é validado
  contra os níveis que o manifesto declara para aquele adaptador. Um `effort`
  que o modelo não suporta é erro e nunca é "aproximado";
- `agentes.<nome>` só pode **elevar** a classe declarada pela skill, e elevar
  para `profundo_excepcional` exige `justificativa` (regra herdada da RunX §6;
  quem pode elevar está na seção 15);
- chave desconhecida é erro, e nenhuma chave aceita credencial, URL de provedor,
  variável de ambiente ou caminho.

### 7.2 Tabela embutida (normativa)

O ExpxDev traz uma tabela por adaptador, com versão própria
(`tabela_embutida: <n>`). Na primeira versão, só o Claude tem entradas:

| Classe | Claude: `id` → `model`/`effort` |
|---|---|
| `mecanico_triagem` | `embutida-haiku-low` → `haiku`/`low` |
| `raciocinio_normal` | `embutida-sonnet-medium` → `sonnet`/`medium` |
| `profundo_excepcional` | `embutida-opus-high` → `opus`/`high` |

OpenCode e Codex **não** têm entradas embutidas. Escolher provedor e modelo por
eles seria adivinhar uma credencial que o ExpxDev não conhece.

Ordem de escolha da cadeia, por agente, adaptador e classe resolvida `<c>`,
**com a camada ativa** (7.3). A primeira regra que se aplica decide:

1. o projeto declara `adaptadores.<a>.classes.<c>`: essa cadeia **substitui**
   inteira qualquer outra (não há mescla de listas). `origem_alternativa:
   "projeto"`;
2. a classe resolvida é a própria classe declarada pela skill (ninguém elevou) e
   o agente da skill traz `model`/`effort` para esse adaptador (hoje, o
   frontmatter Claude): vale a alternativa sintética `frontmatter-da-skill`.
   `origem_alternativa: "skill"`;
3. existe cadeia embutida para `<c>` no adaptador: vale a embutida.
   `origem_alternativa: "embutida"`;
4. nenhuma das anteriores: a classe fica **sem resolução** naquele adaptador. Um
   agente que precisa dela é erro no `init` quando o adaptador está no harness
   instalado, e bloqueio na abertura da tarefa (seção 10).

Em consequência, a tabela embutida só materializa algo quando uma classe foi
elevada (pelo projeto ou pela tarefa) e o projeto não disse com o quê.

Mudar a tabela embutida é mudar a versão do resolvedor, e com ela todo
`resolucao_id`.

### 7.3 Sem arquivo de política: camada inativa

A orquestração é **opt-in**. Sem `.expx/orquestracao.json`, a camada fica
**inteiramente inativa**:

- nenhuma resolução é calculada para materializar nem gravada em
  `.expx/resolucoes/`;
- o lock não ganha a seção `orquestracao`;
- nenhum agente é reescrito além do que o `agentes.json` v1 já faz;
- os hooks de resolução e de invocação (8.2) não são instalados, e por isso
  não há camadas 6 e 7.

Os arquivos de agente e o lock saem **byte a byte iguais aos de hoje**. Um
projeto que confere hashes do lock não muda sem pedir.

Os hooks de rastro que já existem continuam independentes da camada. A
semântica do H10 (`model`/`effort` só observados, `null` sem observação) vale
com ou sem política. Sem política, o evento não leva `resolucao_id`, e o leitor
aplica o fallback que o contrato de eventos já permite (configuração instalada,
só em contexto Claude).

Um projeto que **removeu** a política volta a esse regime no próximo `init`. As
resoluções já gravadas não são apagadas (H7): deixam de ser referenciadas pelo
lock, mas continuam endereçáveis pelos eventos antigos.

## 8. Precedência e resolução

### 8.1 Camadas

Da mais fraca para a mais forte:

| # | Camada | O que pode fazer | Quando age |
|---|---|---|---|
| 1 | tabela embutida do adaptador (7.2) | mapear classe para alternativas padrão | instalação |
| 2 | *[pendente]* configuração global do usuário | ver H1. Proposta: declarar só quais adaptadores e provedores existem na máquina, nunca política | instalação |
| 3 | skill: `classe` declarada no agente, e o frontmatter dele | fixar o mínimo do papel e a alternativa `frontmatter-da-skill` | instalação |
| 4 | projeto: `adaptadores.<a>.classes` | trocar a cadeia de cada classe | instalação |
| 5 | projeto: `agentes.<nome>.classe` | elevar a classe do agente | instalação |
| 6 | tarefa: `classe` na task do plano | elevar a classe só daquela tarefa, com justificativa | invocação |
| 7 | sessão: `EXPX_ALTERNATIVA=<id>` | escolher uma alternativa **já autorizada** para a classe resolvida | invocação |

Invariantes:

- as camadas 5 a 7 **nunca rebaixam** a classe abaixo da declarada pela skill;
- a camada 7 não aceita valor livre, só o `id` de uma alternativa da cadeia da
  resolução (seja ela do projeto, da skill ou embutida). Um id fora da cadeia é
  recusado e registrado;
- as camadas 6 e 7 só existem num adaptador com `seleciona_na_invocacao`
  comprovado. No Codex o arquivo do agente vence o valor do spawn, então
  elevar por tarefa exige outro agente materializado (decisão de F7). Sem a
  capacidade, a tarefa elevada é bloqueada, e não executada na classe menor.

### 8.2 Função de resolução

`resolver(skill, agente, adaptador, política, tabela, tarefa?, sessão?) → resolução`

é **pura e determinística**: as mesmas entradas dão a mesma saída. A saída tem:

- `classe_declarada` e `classe_resolvida`;
- `origem_classe`: `declarada` (a skill declarou `classe:`), `inferida` (sem
  `classe:`, deduzida do frontmatter pela tabela inversa da 7.2), `agente`
  (elevada na camada 5) ou `tarefa` (elevada na camada 6);
- `alternativa`, com `id`, `model` e `effort`;
- `origem_alternativa`: `projeto`, `skill`, `embutida`, `sessao` ou
  `agentes-json-v1` (8.3);
- `cadeia`: a cadeia **completa** autorizada para a classe resolvida, em ordem,
  com `id`, `model` e `effort` de cada alternativa. Ela é copiada para a
  resolução para que o julgamento de um fallback (10.2) não dependa da política
  vigente no momento da leitura;
- `sobreposta_por` e `materializado` (`model`, `effort` finais), presentes só
  na exceção da 8.3;
- `resolucao_id`: o SHA-256 do JSON canônico do objeto de resolução **sem** o
  campo `resolucao_id` (todos os campos acima, mais a versão do resolvedor e da
  tabela embutida). O campo é acrescentado depois do cálculo, e quem confere
  remove o campo, recalcula e compara.

Quem grava a resolução, e como ela chega ao julgamento:

- **na instalação** (camadas 1 a 5): o `init`/`update` grava cada resolução
  nova em `.expx/resolucoes/` **antes** dos agentes e do lock, por arquivo
  temporário no mesmo diretório seguido de `rename`. O contrato de instalação
  não tem transação única (só `.expx/marketplace/` troca de uma vez, e o lock,
  gravado por último, é a afirmação de completude). Por isso, uma falha no meio
  deixa no máximo resoluções **órfãs**, que nenhum lock nem evento cita, são
  inofensivas por serem endereçadas pelo conteúdo, e o próximo `init` as
  reaproveita;
- **na invocação** (toda chamada de agente gerenciado, com ou sem camadas 6 e
  7, **só com a camada ativa**; 7.3): no Claude, a sequência abaixo. A seção 8.4 diz de onde vem a tarefa.

  1. **Antes da chamada**: o hook `PreToolUse` do `Agent` (matcher restrito ao
     `Agent`) chama `expx resolucao` com o `subagent_type`, o `session_id` do
     hook e `EXPX_ALTERNATIVA`. Um agente que nenhuma skill instalou passa sem
     resolução e sem envelope. Para um agente gerenciado, o comando resolve,
     grava a resolução (mesma escrita atômica) e grava o **envelope da
     invocação**, `.expx/invocacoes/<tool_use_id>.json`, com `resolucao_id`,
     agente, tarefa e `session_id`. Só então o hook devolve `updatedInput`
     com todos os campos originais e o `model` da alternativa;
  2. **Fechamento**: o envelope é fechado pelo evento terminal da chamada, que
     traz o mesmo `tool_use_id`: `PostToolUse` (sucesso; para
     `async_launched`, só se a F3b provar que ele é emitido com o mesmo
     `tool_use_id`; senão o envelope fica para a recuperação do passo 3, e
     veredito de aprovação nunca é aceito em segundo plano),
     `PostToolUseFailure` (falha da ferramenta) ou
     `PermissionDenied` (negação pelo modo auto). Os três handlers seguem a
     mesma ordem idempotente: gravar o julgamento (10.2) no envelope, gravar o
     evento com a chave `invocacao` (o `tool_use_id`) e só então apagar o
     envelope. Se o processo cai entre o evento e a remoção, a repetição acha o
     evento com a mesma `invocacao` e não o duplica;
  3. **Envelope abandonado**: uma negação por prompt de permissão fora do modo
     auto, uma sessão que caiu ou um handler que não rodou deixam o envelope
     sem fechamento. O hook `SessionStart` e o `doctor` o encontram, gravam um
     evento `invocacao_abandonada` com a `invocacao` e o `resolucao_id` e o
     removem, pela mesma ordem idempotente.

- **o hook de antes da chamada é fail-closed**: ele é registrado com
  `onFailure: "block"`, porque o padrão do Claude deixa a ação seguir quando o
  hook estoura o tempo, quebra, falta ou devolve JSON inválido. Isso exige
  Claude Code **v2.1.295 ou superior**: o `init` não instala a camada de
  invocação numa versão anterior, e o `doctor` acusa a versão. É uma
  **exceção explícita** à regra de que hooks de método falham abertos,
  justificada porque este hook é o portão da política. O risco é bloquear toda
  chamada de `Agent`, inclusive de agentes não gerenciados, se o hook quebrar.
  Por isso o hook decide primeiro se o agente é gerenciado, só lendo o lock, e
  não faz mais nada quando não é;
- um arquivo de resolução com o mesmo id e bytes diferentes é corrupção e erro;
- **se qualquer gravação falha, o hook nega a chamada**
  (`permissionDecision: deny`) e o agente não é iniciado: nenhum evento cita um
  `resolucao_id` ausente do registro;
- **limites do Claude na invocação**: o `model` do input do `Agent` é um
  **alias**, e não existe `effort`. Uma resolução de invocação só é honrada se
  a alternativa usa alias e tem o mesmo `effort` do agente materializado. ID
  completo (`claude-*`) e `effort` diferente continuam valendo na instalação,
  no frontmatter, mas numa resolução de invocação são **negados pelo
  resolvedor**, nunca executados com outro valor;
- um adaptador sem hooks antes e depois da chamada de agente com um
  identificador de invocação comum não tem as camadas 6 e 7 nem o julgamento
  da 10.2. O manifesto expõe isso (`vincula_invocacao`).

### 8.3 Convivência com `.expx/agentes.json` v1

O v1 **não é generalizado**: continua sendo um override de agentes Claude,
aplicado depois da resolução, só na cópia de `.claude/agents/`. Como ele permite
rebaixar, o que contraria o invariante da 8.1, ele é uma **exceção explícita
de compatibilidade**:

- num agente alterado pelo v1, **o piso deixa de valer** e a `alternativa` da
  resolução **não descreve mais** o que foi materializado. A resolução ganha
  `sobreposta_por: "agentes-json-v1"`, `materializado` com os valores finais e
  `origem_alternativa: "agentes-json-v1"`, e o `resolucao_id` é calculado sobre
  essa forma final. Como os valores finais estão fora da cadeia, o julgamento
  da 10.2 compara o observado com `materializado`, não com a `cadeia`, usando
  a mesma regra de correspondência do adaptador (alias da família no Claude e
  esforço quando observado);
- o `doctor` avisa quando o v1 põe um agente abaixo da classe declarada.

Se o rebaixamento pelo v1 continua permitido é decisão humana (H9).

### 8.4 De onde vem a tarefa da invocação

O input do `Agent` não traz a tarefa, e o texto que o modelo escreve no
`prompt` não é fonte confiável. A fonte autoritativa é o rastro: o evento
`task_iniciada`, gravado pelo escritor da skill **antes** de qualquer chamada de
agente daquela tarefa, já carrega `sessao` (`<harness>@<id>`, derivada do
harness e nunca preenchida por quem chama, como diz o contrato de eventos).

O `expx resolucao` procura as tarefas **abertas** na sessão do hook: com
`task_iniciada` e sem `task_concluida` nem `task_bloqueada`, e cuja `sessao`
tem exatamente a forma `<prefixo>@<id>`, com `<prefixo>` na família Claude
(`claude` ou `claude-code`, o mesmo conjunto que o escritor comum trata como
contexto Claude; a SprintX grava `claude-code@<id>`) e `<id>` **igual** ao
`session_id` do hook. A comparação é por campo, não por busca textual, e um
prefixo fora da família não casa.

- nenhuma tarefa aberta: não há camada 6, e vale a resolução da instalação;
- exatamente uma: é a tarefa da invocação;
- mais de uma: se nenhuma delas eleva a classe daquele agente, não há
  ambiguidade e vale a resolução sem camada 6; se alguma eleva, a escolha é
  ambígua e **a chamada é negada**, com mensagem dizendo quais tarefas estão
  abertas.

Pré-requisito verificado na F3b: o `<id>` que o escritor da SprintX grava em
`sessao` precisa ser o `session_id` que o Claude passa aos hooks. Se não for, a
camada 6 fica indisponível até o escritor ser alinhado.

O resolvedor vive no ExpxDev, em TypeScript, com testes de propriedade:
determinismo, nunca rebaixa, id fora da cadeia é recusado e a mesma resolução
dá o mesmo id.

## 9. Materialização, lock e registro de resoluções

- **Claude:** como hoje: o frontmatter da cópia em `.claude/agents/` sai com o
  `model`/`effort` da alternativa resolvida (7.3 garante a cópia idêntica sem
  política).
- **OpenCode e Codex:** materializar agentes em `.opencode/agents/` e
  `.codex/agents/` é trabalho novo, com o formato de arquivo verificado na
  versão instalada antes de implementar (no Codex há campos obrigatórios
  próprios, como `developer_instructions`). Entram só nas fases F6 e F7, e só se
  a decisão de rollout (H6) incluir esses harnesses.
- **Só com a camada ativa** (7.3). Sem política, nada desta seção é escrito.
- **Registro de resoluções:** cada resolução **efetivamente gravada**, na
  instalação ou na invocação (8.2), fica em
  `.expx/resolucoes/<resolucao_id>.json`, com o JSON canônico da 8.2. O arquivo é
  **imutável e endereçado pelo conteúdo**: o `init`/`update` cria os novos e
  **nunca apaga nem reescreve** os existentes. É o que permite a um evento
  antigo, depois de um `update`, continuar apontando para o objeto que o
  descreve. O diretório é versionado no projeto. A retenção é decisão humana
  (H7); a proposta é nunca apagar automaticamente, nem quando a política é
  removida.
- **Lock:** uma seção nova e opcional, `orquestracao`, guarda a versão do
  resolvedor e da tabela embutida e, por agente e adaptador, o `resolucao_id`
  **vigente**, além dos hashes dos arquivos materializados, que já existem. Nunca
  guarda credencial. **O lock é evidência de reprodução, não fonte de
  política**: o resolvedor lê o `.expx/orquestracao.json`, e não o lock.

## 10. Validação, fallback e falhas

### 10.1 Quem verifica o quê

| Momento | O que verifica | Falha |
|---|---|---|
| `init`/`update` | sintaxe e semântica do arquivo; classe de cada agente; ids; compatibilidade de `model`/`effort` com o manifesto; classe sem resolução num adaptador instalado (7.2, regra 4) | erro antes de qualquer escrita, como no `agentes.json` |
| `init`/`update` | **não** verifica disponibilidade de modelo nem credencial: o ExpxDev não consegue fazer isso sem invadir o harness | — |
| `doctor` | capacidades exigidas contra o manifesto (12); variáveis que sobrepõem o frontmatter **no ambiente em que o `doctor` roda**; `fallbackModel` **persistido** nos settings que ele consegue ler com modelo fora das cadeias declaradas (um `--fallback-model` de outra sessão não é diagnosticável: quem pega é a 10.2); v1 abaixo da classe; agente instalado que diverge do lock | achado com a correção sugerida |
| abertura da tarefa (hook ou lembrete das skills) | se existe resolução elegível para o papel no harness em uso, inclusive a da tarefa elevada (8.1) | bloqueia antes da execução, com mensagem acionável |
| fim do subagente (hook `PostToolUse` do `Agent` no Claude; equivalente onde o manifesto comprovar) | o executor observado contra a cadeia da resolução (10.2) e a árvore de trabalho (12) | registra no rastro; em papel de aprovação, invalida o veredito |

### 10.2 Fallback

Neste rollout, **nenhum componente do ExpxDev reinvoca um agente** com outra
alternativa: o ExpxDev instala, observa e julga, e não é runtime. A cadeia
declarada tem duas funções:

1. **Na instalação**, a primeira alternativa é a materializada.
2. **Na execução**, a cadeia é a **lista do que é aceitável** quando o harness
   troca de modelo sozinho. O caso real é o fallback nativo do Claude Code
   (`fallbackModel`/`--fallback-model`), que é **por sessão**, vale para
   subagentes, não tem cadeia por agente e por isso pode levar um subagente
   para fora da política.

Detecção e julgamento:

- no Claude, o hook `PostToolUse` do `Agent` lê `resolvedModel` e `modelsUsed`
  (este só existe quando houve troca no meio da execução) e monta a sequência
  observada: `modelsUsed` quando existe, senão `[resolvedModel]`;
- **correspondência**: o adaptador define quando um modelo observado
  corresponde a uma alternativa. No Claude, um ID completo corresponde a uma
  alternativa com o mesmo ID ou com o alias da família contida nele (`opus`,
  `sonnet`, `haiku`). Quando o esforço também é observado (`effort.level`), ele
  precisa ser igual ao da alternativa. Um modelo observado pode corresponder a
  mais de uma alternativa: basta uma, porque todas estão autorizadas;
- todos os modelos da sequência correspondem a alternativas da `cadeia` da
  resolução gravada: o evento registra `modelos_observados` e segue;
- algum não corresponde: o evento registra `fora_da_politica: true`. Num papel
  `revisar` ou `testar`, o veredito **não é aceito** e a tarefa fica bloqueada
  para nova execução decidida por humano; nos demais papéis, aviso;
- **papel de aprovação exige observação completa**: um veredito de `revisar`
  ou `testar` só é aceito com a execução observada do início ao fim (no Claude,
  `Agent` em primeiro plano com status `completed`). Em segundo plano
  (`async_launched`), a observação só alcança o lançamento, e o veredito **não é
  aceito**. Esses papéis rodam em primeiro plano até existir telemetria de
  conclusão para o segundo plano;
- num adaptador sem `observa_executor.model`, a troca não é detectável. Pela
  regra acima, a observação é incompleta e o papel de aprovação não se sustenta
  ali (H8).

Sempre:

- `usage_limit_reached`, rate limit, billing e autenticação não são fallback:
  são bloqueio de recurso, sem troca de modelo (o fallback nativo do Claude
  também não cobre esses casos);
- não existe "aproximação": uma alternativa incompatível (esforço que o modelo
  não suporta; provedor diferente do da sessão num adaptador sem
  `troca_provedor_por_agente`) é erro de resolução.

A reinvocação automática pela própria skill, com a próxima alternativa da
cadeia, fica para depois do primeiro rollout e exige `seleciona_na_invocacao`.

## 11. Rastro (emenda a `CONTRATO-expx-eventos.md`)

### 11.1 Chaves extras novas

Todas opcionais, depois das doze obrigatórias, como manda o contrato:

| Chave | O que é |
|---|---|
| `resolucao_id` | a resolução em vigor para aquele agente; endereça `.expx/resolucoes/<id>.json`, que nunca é apagado (9) |
| `classe_declarada` | a classe que a skill declarou, ou a inferida |
| `classe_resolvida` | a classe depois das elevações (8.1) |
| `origem_classe` | `declarada`, `inferida`, `agente` ou `tarefa` (8.2) |
| `alternativa` | o `id` da alternativa materializada (a primeira da cadeia, ou a escolhida na sessão) |
| `origem_alternativa` | `projeto`, `skill`, `embutida`, `sessao` ou `agentes-json-v1` (8.2, 8.3) |
| `materializado` | só na exceção da 8.3: `{model, effort}` finais escritos pelo v1 |
| `modelos_observados` | a sequência de modelos que o runtime informou para aquela execução (10.2), quando informou |
| `invocacao` | o identificador da chamada do agente (no Claude, o `tool_use_id`), que torna idempotente o fechamento do envelope (8.2) |
| `fora_da_politica` | `true` quando o executor observado saiu da cadeia (10.2); ausente nos demais casos |
| `harness` | já existe na SprintX e passa a ser gravada também pelo escritor comum, quando houver sinal |

`classe_declarada`, `classe_resolvida`, `alternativa`, as origens e, na
exceção da 8.3, `materializado` vão **também** no evento, e não só no registro,
para que o essencial sobreviva mesmo a um registro perdido.

A emenda também declara o evento `invocacao_abandonada` (8.2, passo 3).

`model` e `effort` são **somente** o executor observado e ficam `null` quando o
runtime não os expõe. **Nenhum escritor preenche esses campos com
configuração**, nem com frontmatter, resolução ou alternativa. A intenção é
alcançada pelo `resolucao_id` e pelos campos acima, e o leitor (o painel) é quem
decide mostrá-la quando a observação falta. Linhas antigas continuam válidas, e quem
valida segue verificando que as doze chaves estão contidas na linha.

### 11.2 O fallback atual do Claude grava resolução como observação

Desde a 0.12.2, no contexto Claude, o escritor comum grava em `model`/`effort`
o frontmatter instalado quando o runtime não informa nada. Pelo critério da
seção 4, isso é resolução materializada gravada como executor observado. Na
prática quase sempre coincide, mas deixa de coincidir com
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, `CLAUDE_CODE_EFFORT_LEVEL` ou um
`fallbackModel` que entrou em ação.

O Claude expõe mais do que o escritor usa hoje:

- `effort`: `$CLAUDE_EFFORT` e `effort.level` nos hooks são observação direta;
- `model` de subagente em primeiro plano: `resolvedModel`/`modelsUsed` no
  `PostToolUse` do `Agent`;
- `model` da sessão principal: `PostModelSwitch` (`to_model`) e, nem sempre,
  `SessionStart`.

Proposta (H10): o escritor passa a usar essas observações, cada uma no evento
em que existe, e **deixa de gravar o frontmatter em `model`/`effort`**. Sem
observação, os dois ficam `null` e o evento leva `resolucao_id`. O fallback
para a configuração instalada continua existindo **no leitor**, como o
contrato de eventos já permite, e não no escritor. Isso muda o comportamento
publicado na 0.12.2 (o escritor comum passa a gravar `null` onde hoje grava o
frontmatter) e é decisão humana.

## 12. Separação de papéis e isolamento

Um papel `revisar` ou `testar` exige:

1. **identidade e sessão distintas** de quem implementou;
2. **contexto independente**;
3. **observação completa** da execução (10.2);
4. **impossibilidade de escrever no projeto**, em um destes níveis:

| Nível | O que garante | Como se comprova |
|---|---|---|
| `estrutural` (forte) | o agente não tem nenhum meio de escrita | configuração materializada verificável no manifesto. No Claude: `tools:` sem `Edit`, `Write`, `NotebookEdit` e sem `Bash`. Hoje é o caso de `auditor-plano` e `sprintx-revisor-testes` |
| `isolado` (forte para o projeto) | o agente pode escrever, mas só numa cópia descartável; nada do que ele faz alcança a árvore de trabalho | duas condições, as duas obrigatórias: (a) o agente roda numa worktree ou snapshot Git próprio, criado para ele e apagado depois, com os arquivos ignorados de que o comando precise (dependências instaladas, por exemplo) preparados ali; (b) **confinamento efetivo do processo**: sandbox do harness, ACL ou contêiner que restrinja a escrita à cópia descartável e recuse caminho absoluto, `..` e symlink que levem para fora dela. Uma worktree sozinha separa a cópia Git, mas não confina o processo, e **não basta**. A revisão da MergeX já lê um snapshot Git imutável (0.12.1), o que cobre a entrada, mas não a escrita |
| `integridade_final` (fraco) | só que o estado **final** da árvore é igual ao inicial | hook no início e no fim do subagente compara `git status --porcelain` e o hash dos arquivos rastreados. **Não prova ausência de escrita**: não pega editar e reverter, nem arquivo ignorado alterado que mude o resultado de um comando |

Regime de ativação, por adaptador:

- **transição** (até o nível `isolado` estar implementado e certificado
  naquele adaptador, na F3b): um agente de aprovação que não é `estrutural` tem
  o veredito aceito **com aviso**, e o evento registra `integridade_final` e o
  nível que faltou;
- **vigente** (depois da certificação): só `estrutural` e `isolado` aceitam
  veredito, e a rejeição é obrigatória. A certificação é registrada no
  manifesto do adaptador, e a passagem de um regime para o outro é uma mudança
  de versão do ExpxDev, anotada no CHANGELOG.

Em qualquer regime, uma diferença em `integridade_final` invalida o veredito.
Sozinho, `integridade_final` nunca sustenta o papel (H8).

Hoje `revisor-diff`, o `qa` e o `revisor-testes` da RunX têm `Bash`, então não
são `estrutural`. Para eles o caminho é `isolado`, ou ficam sem sustentação
estrutural até a decisão H8.

No Codex, o subagente herda o sandbox da sessão principal. `estrutural` não
existe ali, e `isolado` exige que a sessão inteira rode somente leitura ou numa
cópia. Isso não serve para uma sessão que também implementa.

"Modelo diferente" não é garantia de independência. Exigir modelo distinto é
uma opção adicional do projeto (H4).

Paralelismo: a escrita é exclusiva por árvore de trabalho, a mesma regra da
MergeX; a revisão somente leitura pode ser paralela.

Num adaptador em que nenhum dos três meios se comprova, o papel de aprovação não
é sustentado. Se isso bloqueia ou só avisa é decisão humana (H8).

## 13. Credenciais

- O ExpxDev nunca lê, guarda, transmite nem valida segredo. A política cita
  adaptador, `model` e `id`, e nada além disso.
- A credencial é do harness: `~/.claude/.credentials.json` ou Keychain;
  `~/.local/share/opencode/auth.json`; `~/.codex/auth.json` ou keyring.
- O override de sessão aceita só ids da lista autorizada. Nenhum valor de
  ambiente arbitrário é registrado no rastro.
- A capacidade `troca_provedor_por_agente` decide se uma política com provedor
  diferente do da sessão é válida. No Codex não é, e a resolução falha no
  `init`.

## 14. Fases

Cada fase vira um PR, com TDD (RED registrado antes), revisão do Codex e merge
humano.

| Fase | Entrega | Repositório |
|---|---|---|
| F0 | este desenho, revisado | expxdev |
| F1 | `CONTRATO-expx-orquestracao.md` normativo, schema do `.expx/orquestracao.json`, tabela embutida e resolvedor puro com testes de propriedade, **sem** mudar a instalação | expxdev |
| F2 | adaptador Claude: materialização a partir da resolução, registro `.expx/resolucoes/`, seção `orquestracao` do lock, achados do `doctor` e emenda à instalação | expxdev |
| F3 | rastro: chaves da seção 11 no escritor comum, `model`/`effort` só observados, `integridade_final` (12) e emenda aos eventos, **junto com o ajuste mínimo do leitor do painel** (abaixo); depois, os escritores próprios da SprintX. O julgamento da 10.2 depende do envelope e entra na F3b | expxdev; sprintx |
| F3b | `expx resolucao`, hooks `PreToolUse`/`PostToolUse` do `Agent` com envelope por `tool_use_id` (8.2), nível `isolado` com confinamento certificado no Claude e passagem do regime de transição para vigente (12) | expxdev; skills que abrem tarefa |
| F4 | `classe:` (e papel) declarados nos agentes de cada skill; recertificação dos candidatos | forks AxisGov; expxdev |
| F5 | painel: classe declarada, resolução e executor observado, com divergência destacada | expxdev |
| F6 | adaptador OpenCode (agentes em `.opencode/agents/`) | expxdev |
| F7 | adaptador Codex (agentes em `.codex/agents/`) | expxdev |

Ajuste mínimo do leitor do painel na F3, no mesmo PR da mudança do escritor
(H10) ou antes dele, para o painel não perder legibilidade na transição:

- `model`/`effort` nulos e `resolucao_id` com registro legível: mostra a
  resolução, rotulada "configuração (não observada)";
- sem `resolucao_id`: mantém o fallback de hoje;
- `resolucao_id` sem registro legível: sinaliza inconsistência, sem inventar
  configuração.

A F5 continua sendo a visão completa (declarada × resolvida × observada).

Pré-requisitos verificáveis da F3b, cada um com teste antes da ativação
(levantados na revisão 5 do Codex):

1. **`async_launched`**: provar se o `PostToolUse` é emitido com o mesmo
   `tool_use_id`. Se não for, o envelope fica para recuperação e veredito de
   aprovação nunca é aceito.
2. **Sessão e tarefa**: provar ponta a ponta que o `session_id` do hook
   coincide com o `<id>` gravado pela SprintX em `sessao`, com os prefixos
   `claude` e `claude-code`, inclusive em subagente
   aninhado e em segundo plano; testar zero, uma e várias tarefas abertas
   (8.4).
3. **Eventos terminais**: testar sucesso, falha (`PostToolUseFailure`),
   negação automática (`PermissionDenied`), negação interativa, queda entre
   julgamento, evento e remoção, e recuperação concorrente por `SessionStart`
   e `doctor`. A deduplicação por `invocacao` precisa ser **atômica**, não só
   uma convenção de campo.
4. **Compatibilidade**: validar `onFailure: "block"` no settings materializado
   e bloquear a ativação com Claude anterior à v2.1.295, inclusive instalação
   antiga seguida de downgrade.
5. **Escopo**: provar que agente não gerenciado passa sem envelope, e que lock
   ausente, ilegível ou divergente, ou agente gerenciado ambíguo, nega sem
   capturar indevidamente um agente do usuário.
6. **Invocação**: testar a preservação integral do input, a aceitação só de
   alias com esforço igual ao materializado e a rejeição de ID completo ou de
   esforço diferente.

Até a F4, um agente sem `classe:` tem a classe **inferida** do frontmatter pela
tabela embutida do Claude (`haiku`→`mecanico_triagem`,
`sonnet`→`raciocinio_normal`, `opus`→`profundo_excepcional`). A inferência
aparece no `doctor` e no rastro (`origem_classe: "inferida"`). Um ID `claude-*` é classificado pela família contida no nome (`haiku`, `sonnet`, `opus`); um modelo que não se classifica fica sem classe e o `doctor` pede `classe:` explícita.

## 15. Decisões do Flávio

**Decididas pelo Flávio em 2026-10-24: as onze aprovadas como estão na coluna
"Recomendação"**, com os ajustes do Codex já incorporados. A coluna "Trava"
diz em que fase cada decisão passa a valer. Uma revisão futura de qualquer
uma delas ganha uma linha nova aqui, citando a anterior, e não apaga esta.

| # | Decisão | Recomendação | Codex | Trava |
|---|---|---|---|---|
| H1 | Existe configuração global do usuário? Com que papel? | sim, mas só declarando adaptadores e provedores disponíveis na máquina, nunca política; sozinha, não ativa a camada (7.3) | concorda | depois da F2 |
| H2 | Quem pode elevar para `profundo_excepcional`? Exige aprovação humana? | justificativa registrada **e não vazia** basta no projeto e na tarefa; a sessão nunca eleva classe | concorda, com a validação da justificativa | F1 |
| H3 | **Conflito existente:** `auditor-plano`, `sprintx-revisor-testes` e `revisor-diff` (papéis `revisar`/`testar`) e `analista-de-conflito` (papel `investigar`) declaram `opus`/`high`, que pela tabela inversa é `profundo_excepcional`, classe que a RunX diz exigir justificativa | a classe que a skill **declara** é o piso do papel, não uma elevação, e não pede justificativa; a justificativa vale só acima do declarado (camadas 5 e 6). A regra abstrata entra na F1; a classe concreta de cada agente, na F4 | concorda | F1 (regra), F4 (por agente) |
| H4 | Revisão exige modelo distinto do implementador? | não: modelo distinto é opção do projeto. Continuam obrigatórios identidade e sessão distintas, contexto independente, observação completa e nível `estrutural` ou `isolado` (12) | concorda, com essa precisão | F1 |
| H5 | Teto de custo, orçamento, paralelismo e política após o limite de uso | fora do primeiro rollout; o rollout só preserva os limites operacionais seguros que já existem; `usage_limit_reached` continua bloqueio | concorda, com esse limite | não trava a F1 |
| H6 | Quais harnesses entram no primeiro rollout? | Claude (F1–F5); OpenCode e Codex só na F6/F7, com o manifesto reverificado. A F1 deixa o contrato extensível, mas não alega suporte operacional aos demais | concorda | F1 |
| H7 | Que campos da resolução são persistidos, e por quanto tempo? | registro `.expx/resolucoes/`: toda resolução **efetivamente gravada** (instalação e invocação), nunca apagada automaticamente; lock: só o `resolucao_id` vigente; rastro: os campos da 11.1, com a retenção do rastro | concorda, com a troca de "materializada" por "efetivamente gravada" | F1 (contrato), F2 (implementação) |
| H8 | Confirmar o regime de ativação da seção 12 para agentes de aprovação sem nível `estrutural` (hoje `revisor-diff` e `qa`/`revisor-testes` da RunX, que têm `Bash`), e o que fazer com observação incompleta | aprovar o regime: transição com aviso até a F3b certificar `isolado` no adaptador, rejeição obrigatória depois; observação incompleta rejeita desde já | concorda | F1 (contrato), F3b (ativação forte) |
| H9 | `.expx/agentes.json` v1 continua podendo rebaixar abaixo da classe? | sim, por compatibilidade, com aviso no `doctor` e marca no rastro, e com **meta explícita de remoção ou revisão na próxima versão maior**, porque é uma exceção que permite sair da política | concorda, com a meta explícita | F1/F2 |
| H10 | Mudar o escritor do rastro no Claude (seção 11.2)? | sim: `model`/`effort` só com observação (`$CLAUDE_EFFORT`/`effort.level`, `resolvedModel`/`modelsUsed`, `PostModelSwitch`), `null` sem ela; a configuração fica na resolução e no leitor. Entra na F3, com o ajuste do painel (14) | concorda | F3 |
| H11 | O ExpxDev deve escrever `fallbackModel` nos settings do projeto? | não: o setting é do usuário, vale para a sessão inteira e não tem granularidade por agente; o `doctor` só diagnostica o que estiver persistido em settings que ele consiga ler | concorda | F2 |

## 16. Critérios de aceite deste desenho

- O Codex revisa e não deixa achado bloqueante em aberto.
- O Flávio decide H1–H11, ou adia explicitamente cada uma. **Atendido em 2026-10-24: todas aprovadas.**
- Toda capacidade do manifesto tem fonte e data, ou está marcada como não
  verificada.
- O texto preserva as seis decisões herdadas da seção 3 e não contradiz
  `CONTRATO-expx-eventos.md` nem `CONTRATO-expx-instalacao.md` vigentes: as
  mudanças neles são emendas planejadas, não efeitos deste documento.

## 17. Histórico de revisão

| Rodada | Revisor | Resultado | O que mudou |
|---|---|---|---|
| 1 | Codex, 2026-10-24 | 5 bloqueantes e 3 não bloqueantes | registro imutável de resoluções (9); fallback nativo detectado e julgado, sem reinvocação (10.2); `origem_classe` separada de `origem_alternativa` (8.2, 11.1); `limita_ferramentas` separado de `garante_revisao_sem_escrita`, com verificação a posteriori da árvore (6, 12); tabela embutida normativa e ordem de escolha da cadeia (7.2); 11.2 com `resolvedModel`/`modelsUsed`/`PostModelSwitch`; H3 por agente; fases F6/F7; manifesto sem "provável" e com paralelismo por fonte. As afirmações novas do revisor foram conferidas nas fontes antes de entrar |
| 2 | Codex, 2026-10-24 | 6 bloqueantes e 3 não bloqueantes | 7.3 com as regras 2–4 sem arquivo de política; escritor atômico das resoluções de invocação (`expx resolucao`), com bloqueio se não gravar (8.2); cadeia completa copiada na resolução, `modelos_observados` e correspondência por adaptador (8.2, 10.2); aprovação só com observação completa, sem `async_launched` (10.2); `model`/`effort` nunca preenchidos com configuração (11.1, 11.2, H10); níveis `estrutural`/`isolado`/`integridade_final`, com só os dois primeiros aceitando veredito (12, H8); `agentes-json-v1` no resolvedor, `classe_resolvida` e `materializado` inline; escopo do `doctor` em H11 |
| 3 | Codex, 2026-10-24 | 5 bloqueantes e 2 não bloqueantes | `resolucao_id` calculado sem o próprio campo (8.2); envelope da invocação por `tool_use_id` entre `PreToolUse` e `PostToolUse` do `Agent`, com negação se a gravação falhar, e o limite de `effort` na invocação do Claude (8.2, manifesto `vincula_invocacao`); registro gravado antes dos agentes e do lock, com órfãs recuperáveis, sem alegar transação que o contrato de instalação não tem (8.2); `isolado` exige confinamento efetivo do processo (12); regime de transição e vigente por adaptador (12, H8, F3/F3b); camada 7 citando a cadeia da resolução; correspondência também contra `materializado`. Os campos `tool_use_id`, `updatedInput` e o input do `Agent` foram conferidos na documentação do Claude Code |
| 4 | Codex, 2026-10-24 | 4 bloqueantes e 1 não bloqueante | hook de antes da chamada com `onFailure: "block"`, versão mínima v2.1.295 e exceção explícita ao fail-open (8.2); fechamento do envelope por `PostToolUse`, `PostToolUseFailure` e `PermissionDenied`, em ordem idempotente com a chave `invocacao`, e recuperação de envelope abandonado (8.2, 11.1); tarefa da invocação pelo `task_iniciada` aberto na mesma `sessao`, com ambiguidade negada (8.4); invocação só com alias e o mesmo `effort` do materializado (8.2); `agentes-json-v1` no enum da 8.2. Os eventos, `onFailure` e `session_id` foram conferidos na documentação do Claude Code |
| 5 | Codex, 2026-10-24 | **aprovado** para PR; sem bloqueante de F1/F2 | `async_launched` condicional à prova da F3b (8.2); seis pré-requisitos verificáveis da F3b registrados na §14 |
| 6 | CodeAnt no PR #91 e Codex, 2026-10-24 | 3 achados do CodeAnt procedentes; Codex concordou com as correções e com H1–H11, com ajustes | camada opt-in, inteiramente inativa sem política, preservando lock e agentes byte a byte (7.3, 8.2, 9); busca de sessão pela família `claude`/`claude-code` com comparação do `<id>` (8.4, pré-requisito 2); ajuste mínimo do leitor do painel na F3 (14); 8.3 e 8.4 em ordem; §15 com a posição do Codex e a fase que cada decisão trava |
| — | Flávio, 2026-10-24 | decisão | H1–H11 aprovadas como recomendadas (§15) |
