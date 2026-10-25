# Orquestração multimodelo — harness, modelo e esforço por papel — desenho

Data: 2026-10-24. Repositórios: AxisGov/expxdev (contrato, resolvedor, instalação,
rastro e painel); AxisGov/sprintx, AxisGov/runx, AxisGov/mergex e demais forks
(declaração de classe nos agentes).
Estado de partida: expxdev `f0a9dfb` (v0.12.2).
Estado: **desenho para revisão do Codex e decisões do Flávio. Nenhuma linha de
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
| `garante_revisao_sem_escrita` | **forte** só com `tools:` sem `Edit`, `Write`, `NotebookEdit` e sem `Bash`; com `Bash` a escrita indireta continua possível e a garantia é **parcial** | não verificado | **não**: "custom agent instructions can ask an agent to avoid edits, but they don't create a separate read-only sandbox" |
| `fallback_nativo` | sim, **por sessão**: `fallbackModel` / `--fallback-model` (até três modelos), aplicado também aos subagentes desde a v2.1.247; não cobre rate limit, billing nem autenticação; não há cadeia por agente | não verificado | não verificado |
| `seleciona_na_invocacao` | `model`: sim (o parâmetro `model` da invocação vence o frontmatter); `effort`: não verificado | não verificado | **não serve para sobrepor**: o valor do arquivo do agente vence o valor explícito do spawn |
| `hooks` | sim | por plugin | sim, com eventos próprios, não equivalentes um a um aos do Claude |
| `subagentes` | sim | sim | sim (`.codex/agents/`, ligados por padrão) |
| `troca_provedor_por_agente` | não documentado | não verificado (o formato `provider/model` sugere que sim, mas não há fonte nem teste) | **não**: o subagente herda o `model_provider` do pai |
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

Ordem de escolha da cadeia, por agente, adaptador e classe resolvida `<c>`.
A primeira regra que se aplica decide:

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

### 7.3 Sem arquivo de política

Sem `.expx/orquestracao.json`, só a regra 2 se aplica. O `init` **não
reescreve** o agente: a cópia continua sendo o frontmatter da skill, mais o
`agentes.json` v1, e a instalação sai byte a byte igual à de hoje.

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
- a camada 7 não aceita valor livre, só o `id` de uma alternativa que o arquivo
  do projeto já autorizou. Um id fora da cadeia é recusado e registrado;
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
- `origem_alternativa`: `projeto`, `skill`, `embutida` ou `sessao`;
- `cadeia`: os `id` autorizados para a classe resolvida, em ordem;
- `resolucao_id`: o SHA-256 do JSON canônico da própria resolução (todos os
  campos acima, mais a versão do resolvedor e da tabela embutida).

O resolvedor vive no ExpxDev, em TypeScript, com testes de propriedade:
determinismo, nunca rebaixa, id fora da cadeia é recusado e a mesma resolução
dá o mesmo id.

### 8.3 Convivência com `.expx/agentes.json` v1

O v1 **não é generalizado**: continua sendo um override de agentes Claude,
aplicado depois da resolução, só na cópia de `.claude/agents/`. Como ele permite
rebaixar, o que contraria o invariante da 8.1, ele é uma **exceção explícita
de compatibilidade**:

- num agente alterado pelo v1, **o piso deixa de valer** e a `alternativa` da
  resolução **não descreve mais** o que foi materializado. A resolução ganha
  `sobreposta_por: "agentes-json-v1"` e os valores finais, e o
  `resolucao_id` é calculado sobre essa forma final;
- o `doctor` avisa quando o v1 põe um agente abaixo da classe declarada.

Se o rebaixamento pelo v1 continua permitido é decisão humana (H9).

## 9. Materialização, lock e registro de resoluções

- **Claude:** como hoje: o frontmatter da cópia em `.claude/agents/` sai com o
  `model`/`effort` da alternativa resolvida (7.3 garante a cópia idêntica sem
  política).
- **OpenCode e Codex:** materializar agentes em `.opencode/agents/` e
  `.codex/agents/` é trabalho novo, com o formato de arquivo verificado na
  versão instalada antes de implementar (no Codex há campos obrigatórios
  próprios, como `developer_instructions`). Entram só nas fases F6 e F7, e só se
  a decisão de rollout (H6) incluir esses harnesses.
- **Registro de resoluções:** cada resolução materializada é gravada em
  `.expx/resolucoes/<resolucao_id>.json`, com o JSON canônico da 8.2. O arquivo é
  **imutável e endereçado pelo conteúdo**: o `init`/`update` cria os novos e
  **nunca apaga nem reescreve** os existentes. É o que permite a um evento
  antigo, depois de um `update`, continuar apontando para o objeto que o
  descreve. O diretório é versionado no projeto. A retenção é decisão humana
  (H7); a proposta é nunca apagar automaticamente.
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
| `doctor` | capacidades exigidas contra o manifesto (12); variáveis que sobrepõem o frontmatter; `fallbackModel` com modelo fora das cadeias declaradas; v1 abaixo da classe; agente instalado que diverge do lock | achado com a correção sugerida |
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
  (presente só quando houve troca no meio da execução) e compara cada modelo
  usado com os `model` da `cadeia` da resolução;
- todos na cadeia: o evento registra a `alternativa` usada e segue;
- algum fora da cadeia: o evento registra `fora_da_politica: true`. Num papel
  `revisar` ou `testar`, o veredito **não é aceito** e a tarefa fica bloqueada
  para nova execução decidida por humano; nos demais papéis, aviso;
- subagente em segundo plano (`async_launched`) só traz o `resolvedModel` do
  momento da ida para o segundo plano: a observação é parcial e o evento diz
  isso;
- num adaptador sem `observa_executor.model`, a troca não é detectável. O
  manifesto expõe isso, e H8 decide se um papel de aprovação pode rodar ali.

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
| `origem_classe` | `declarada`, `inferida`, `agente` ou `tarefa` (8.2) |
| `alternativa` | o `id` da alternativa materializada ou, depois de um fallback aceito, o da alternativa usada |
| `origem_alternativa` | `projeto`, `skill`, `embutida` ou `sessao` (8.2); `agentes-json-v1` quando a 8.3 se aplica |
| `fora_da_politica` | `true` quando o executor observado saiu da cadeia (10.2); ausente nos demais casos |
| `harness` | já existe na SprintX e passa a ser gravada também pelo escritor comum, quando houver sinal |

`classe_declarada`, `alternativa` e as origens vão **também** no evento, e não
só no registro, para que o essencial sobreviva mesmo a um registro perdido.

`model` e `effort` continuam sendo **somente** o executor observado e ficam
`null` quando o runtime não os expõe. Linhas antigas continuam válidas, e quem
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

Proposta (H10): o escritor passa a preferir essas observações, cada uma no
evento em que existe. O fallback para o frontmatter só fica para os eventos sem
observação disponível, e nesses o evento leva `resolucao_id`, para que o leitor
saiba que o valor veio da resolução. Mudar o comportamento publicado na 0.12.2 é
decisão humana.

## 12. Separação de papéis e isolamento

Um papel `revisar` ou `testar` exige três coisas:

1. **identidade e sessão distintas** de quem implementou;
2. **contexto independente**;
3. **ausência de escrita no projeto**, comprovada por pelo menos um destes
   meios:
   - **estrutural**: `garante_revisao_sem_escrita: forte` no adaptador, com a
     configuração materializada verificável. No Claude: `tools:` sem `Edit`,
     `Write`, `NotebookEdit` e sem `Bash`. Hoje é o caso de `auditor-plano` e
     `sprintx-revisor-testes`;
   - **verificada a posteriori**: hook no início e no fim do subagente registra
     o estado da árvore (`git status --porcelain` e o hash dos arquivos
     rastreados e não ignorados). Qualquer diferença invalida o veredito. É o
     meio para agentes que precisam de `Bash` para rodar testes ou comandos,
     como `revisor-diff` e o `qa` e o `revisor-testes` da RunX. A revisão da
     MergeX já lê um snapshot Git imutável (0.12.1), o que é a mesma ideia do
     lado da entrada;
   - **por sandbox da sessão**: só onde o harness não isola por agente (Codex) e
     a sessão inteira roda somente leitura. Não serve para uma sessão que também
     implementa.

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
| F3 | rastro: chaves da seção 11 no escritor comum, julgamento do executor observado (10.2) e verificação da árvore (12), e emenda aos eventos; depois, os escritores próprios da SprintX | expxdev; sprintx |
| F4 | `classe:` (e papel) declarados nos agentes de cada skill; recertificação dos candidatos | forks AxisGov; expxdev |
| F5 | painel: classe declarada, resolução e executor observado, com divergência destacada | expxdev |
| F6 | adaptador OpenCode (agentes em `.opencode/agents/`) | expxdev |
| F7 | adaptador Codex (agentes em `.codex/agents/`) | expxdev |

Até a F4, um agente sem `classe:` tem a classe **inferida** do frontmatter pela
tabela embutida do Claude (`haiku`→`mecanico_triagem`,
`sonnet`→`raciocinio_normal`, `opus`→`profundo_excepcional`). A inferência
aparece no `doctor` e no rastro (`origem_classe: "inferida"`). Um ID `claude-*` é classificado pela família contida no nome (`haiku`, `sonnet`, `opus`); um modelo que não se classifica fica sem classe e o `doctor` pede `classe:` explícita.

## 15. Decisões do Flávio

Nenhuma destas é fechada por este desenho. Cada uma traz a recomendação, para
servir de ponto de partida.

| # | Decisão | Recomendação |
|---|---|---|
| H1 | Existe configuração global do usuário? Com que papel? | sim, mas só declarando adaptadores e provedores disponíveis na máquina, nunca política. Pode ficar para depois da F2 |
| H2 | Quem pode elevar para `profundo_excepcional`? Exige aprovação humana? | justificativa registrada basta no projeto e na tarefa; elevação por sessão não é permitida |
| H3 | **Conflito existente:** `auditor-plano`, `sprintx-revisor-testes` e `revisor-diff` (papéis `revisar`/`testar`) e `analista-de-conflito` (papel `investigar`) declaram `opus`/`high`, que pela tabela inversa é `profundo_excepcional`, classe que a RunX diz exigir justificativa | a classe que a skill **declara** para o agente não é elevação e não pede justificativa; a justificativa vale só para elevações acima do declarado (camadas 5 e 6). A decisão é por agente, conforme o papel e a classe que cada skill declarar na F4 |
| H4 | Revisão exige modelo distinto do implementador, ou só isolamento estrutural? | só isolamento estrutural como obrigação; modelo distinto como opção do projeto |
| H5 | Teto de custo, orçamento, paralelismo e política após o limite de uso | fora do primeiro rollout; o limite de uso continua bloqueio |
| H6 | Quais harnesses entram no primeiro rollout? | Claude (F1–F5); OpenCode e Codex depois, cada um com o manifesto reverificado |
| H7 | Que campos da resolução são persistidos, e por quanto tempo? | registro `.expx/resolucoes/`: toda resolução materializada, nunca apagada automaticamente; lock: só o `resolucao_id` vigente; rastro: os campos da 11.1, com a mesma retenção do rastro |
| H8 | Adaptador em que nenhum meio da seção 12 comprova a ausência de escrita, ou sem `observa_executor.model`: bloqueia o papel de aprovação, ou só avisa? | bloqueia o papel `revisar`/`testar` naquele adaptador; a verificação a posteriori da árvore basta como comprovação |
| H9 | `.expx/agentes.json` v1 continua podendo rebaixar abaixo da classe? | sim, por compatibilidade, com aviso no `doctor` e marca no rastro; reavaliar numa versão maior |
| H10 | Mudar o fallback do rastro no Claude (seção 11.2)? | sim: preferir `$CLAUDE_EFFORT`/`effort.level`, `resolvedModel`/`modelsUsed` e `PostModelSwitch`; o frontmatter só onde não há observação, com `resolucao_id` |
| H11 | O ExpxDev deve escrever `fallbackModel` nos settings do projeto para alinhar o fallback nativo do Claude à política? | não: o setting é do usuário e vale para a sessão inteira; o `doctor` só avisa quando ele sai das cadeias declaradas |

## 16. Critérios de aceite deste desenho

- O Codex revisa e não deixa achado bloqueante em aberto.
- O Flávio decide H1–H11, ou adia explicitamente cada uma.
- Toda capacidade do manifesto tem fonte e data, ou está marcada como não
  verificada.
- O texto preserva as seis decisões herdadas da seção 3 e não contradiz
  `CONTRATO-expx-eventos.md` nem `CONTRATO-expx-instalacao.md` vigentes: as
  mudanças neles são emendas planejadas, não efeitos deste documento.

## 17. Histórico de revisão

| Rodada | Revisor | Resultado | O que mudou |
|---|---|---|---|
| 1 | Codex, 2026-10-24 | 5 bloqueantes e 3 não bloqueantes | registro imutável de resoluções (9); fallback nativo detectado e julgado, sem reinvocação (10.2); `origem_classe` separada de `origem_alternativa` (8.2, 11.1); `limita_ferramentas` separado de `garante_revisao_sem_escrita`, com verificação a posteriori da árvore (6, 12); tabela embutida normativa e ordem de escolha da cadeia (7.2); 11.2 com `resolvedModel`/`modelsUsed`/`PostModelSwitch`; H3 por agente; fases F6/F7; manifesto sem "provável" e com paralelismo por fonte. As afirmações novas do revisor foram conferidas nas fontes antes de entrar |
