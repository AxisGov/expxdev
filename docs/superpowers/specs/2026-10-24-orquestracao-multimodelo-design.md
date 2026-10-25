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
| **Resolução materializada** | a alternativa concreta escolhida para um adaptador (`{adaptador, model, effort}`) e de que camada ela veio | lock do projeto e arquivo de agente instalado | o `expx init`/`update` |
| **Executor observado** | o que o runtime informou que de fato executou | `model`/`effort` no rastro | o escritor do rastro |

O campo histórico `model` do rastro **nunca** representa intenção. Quando o
runtime não informa o executor, `model`/`effort` ficam `null`, e a intenção é
alcançada pelo `resolucao_id` (seção 11).

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
datado pela verificação que o sustenta.

| Capacidade | Claude Code | OpenCode | Codex CLI |
|---|---|---|---|
| `seleciona_modelo` por agente | sim: `model` no frontmatter | sim: `model` como `provider/model` | sim: `model` em `.codex/agents/` |
| `seleciona_effort` por agente | sim: `effort` (`low`…`max`) | parcial: `variant` por agente existe no código v1.19.4 mas não no doc; não verificado na 1.18.23 | sim: `model_reasoning_effort`; os níveis dependem do modelo |
| `materializa_arquivo` | sim, já feito pelo `init` | não feito hoje: o `init` não instala agentes do OpenCode | não feito hoje: o `init` não instala agentes do Codex |
| `observa_executor.model` | parcial: só no `SessionStart` (nem sempre) e na statusline; não há `$CLAUDE_MODEL` | parcial: só no plugin `chat.message` (código, fora do doc); processos filhos não recebem | sim: `model` no stdin dos hooks |
| `observa_executor.effort` | sim: `effort.level` nos hooks e `$CLAUDE_EFFORT` | parcial: `variant` no `chat.message` | **não**: ausente do payload |
| `isola_ferramentas` | sim: `tools:` (omitir herda todas) | sim: `permission:` | **não verificado** |
| `hooks` | sim | por plugin | sim, com eventos próprios; não equivalentes um a um aos do Claude |
| `subagentes` | sim | sim | sim (`.codex/agents/`, ligados por padrão) |
| `troca_provedor_por_agente` | não documentado | provável, pelo formato `provider/model` (não declarado) | **não**: o subagente herda o `model_provider` do pai |
| `paralelismo` | sim | sim | variável |

Fontes (acesso em 2026-10-24): code.claude.com/docs/en/{model-config,
sub-agents, hooks, statusline, env-vars, authentication}; opencode.ai/docs/
{models, config, agents, plugins, providers} e anomalyco/opencode@v1.19.4;
learn.chatgpt.com/docs/{config-file, agent-configuration/subagents, hooks,
auth} e openai/codex@rust-v0.164.0. **Antes de cada fase de implementação, a
linha do adaptador é verificada de novo na versão instalada.** O manifesto não
é escrito de memória.

Riscos que o manifesto precisa expor ao `doctor`:

- **Claude:** `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` ignora o `model` do
  frontmatter, e `CLAUDE_CODE_EFFORT_LEVEL` vence o `effort` do agente. Com
  qualquer um dos dois, a resolução materializada não é a executada.
- **Codex:** `.codex/config.toml` do projeto só é lido em projeto confiável, e há
  duas formas de definir agente (`agents.<nome>.config_file` e arquivos soltos)
  sem interação documentada.
- **OpenCode:** a precedência entre o agente e `--model`/`--variant` não é
  documentada, e a branch `dev` está em reestruturação.

## 7. Arquivo de política: `.expx/orquestracao.json`

Arquivo novo, do projeto, versionado. O `init`, `add`, `remove` e `update`
nunca o escrevem, pela mesma regra do `agentes.json`.

```json
{
  "expx_orquestracao": 1,
  "adaptadores": {
    "claude": {
      "classes": {
        "mecanico_triagem":     [{ "id": "haiku-low",   "model": "haiku",  "effort": "low" }],
        "raciocinio_normal":    [{ "id": "sonnet-med",  "model": "sonnet", "effort": "medium" }],
        "profundo_excepcional": [{ "id": "opus-high",   "model": "opus",   "effort": "high" }]
      }
    },
    "opencode": {
      "classes": {
        "raciocinio_normal": [
          { "id": "gpt-high",    "model": "openai/gpt-5.4",          "effort": "high" },
          { "id": "sonnet-high", "model": "anthropic/claude-sonnet-5-5", "effort": "high" }
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

- cada classe recebe uma **cadeia ordenada de alternativas**: a primeira é a
  preferida e as seguintes são o fallback. Toda alternativa da cadeia satisfaz a
  mesma classe, as mesmas permissões e os mesmos requisitos do papel;
- o `id` da alternativa é estável e é o que o rastro e o override de sessão
  citam, nunca os valores crus;
- a sintaxe de `model` é validada **pelo adaptador** (alias ou `claude-*` no
  Claude; `provider/model` no OpenCode; slug no Codex). O `effort` é validado
  contra os níveis que o manifesto declara para aquele adaptador. Um `effort`
  que o modelo não suporta é erro, nunca é "aproximado";
- `agentes.<nome>` só pode **elevar** a classe declarada pela skill, e elevar
  para `profundo_excepcional` exige `justificativa` (regra herdada da RunX §6;
  quem pode elevar está na seção 15);
- chave desconhecida é erro; nenhuma chave aceita credencial, URL de provedor,
  variável de ambiente ou caminho;
- um adaptador sem entrada no arquivo usa a tabela embutida (seção 8.1).

## 8. Precedência e resolução

### 8.1 Camadas

Da mais fraca para a mais forte:

| # | Camada | O que pode fazer |
|---|---|---|
| 1 | tabela embutida do adaptador, no ExpxDev | mapear classe para alternativas padrão |
| 2 | *[pendente]* configuração global do usuário | ver a seção 15. Proposta: declarar só quais adaptadores e provedores existem na máquina, nunca política |
| 3 | skill: `classe` declarada no agente | fixar o mínimo do papel |
| 4 | projeto: `adaptadores.<a>.classes` | trocar as alternativas de cada classe |
| 5 | projeto: `agentes.<nome>.classe` | elevar a classe do agente |
| 6 | tarefa: `classe` na task do plano | elevar a classe só daquela tarefa, com justificativa |
| 7 | sessão: `EXPX_ALTERNATIVA=<id>` | escolher uma alternativa **já autorizada** para a classe resolvida |

Invariante: as camadas 5 a 7 **nunca rebaixam** a classe abaixo da declarada
pela skill. A camada 7 não aceita valor livre, só o `id` de uma alternativa que
o arquivo do projeto já autorizou. Um id fora da cadeia é recusado e
registrado.

### 8.2 Função de resolução

`resolver(skill, agente, adaptador, política, tarefa?, sessão?) → resolução`

é **pura e determinística**: as mesmas entradas dão a mesma saída. A saída tem
`classe_resolvida`, `alternativa` (id, model, effort), `origem` (a camada que
decidiu) e `resolucao_id`, que é o SHA-256 do JSON canônico das entradas
relevantes mais a versão do resolvedor. O resolvedor vive no ExpxDev em
TypeScript, com testes de propriedade (determinismo, nunca rebaixa, id fora da
cadeia é recusado).

### 8.3 Convivência com `.expx/agentes.json` v1

O v1 **não é generalizado**: continua sendo um override de agentes Claude,
aplicado depois da resolução, só na cópia de `.claude/agents/`. Como ele permite
rebaixar, o que contraria o invariante da 8.1, valem duas regras:

- o rastro marca `origem_resolucao: "agentes-json-v1"` para todo agente que ele
  alterou;
- o `doctor` avisa quando o v1 põe um agente abaixo da classe declarada.

Se o rebaixamento pelo v1 continua permitido é decisão humana (seção 15).

## 9. Materialização e lock

- **Claude:** como hoje: o frontmatter da cópia em `.claude/agents/` sai com o
  `model`/`effort` da resolução. Sem `.expx/orquestracao.json` e sem classe
  declarada, a cópia sai **byte a byte igual à de hoje**.
- **OpenCode e Codex:** materializar agentes em `.opencode/agents/` e
  `.codex/agents/` é trabalho novo, com formato de arquivo verificado na versão
  instalada antes de implementar (no Codex há campos obrigatórios próprios, como
  `developer_instructions`). Entram só nas fases 5 e 6, e só se a decisão de
  rollout incluir esses harnesses.
- **Lock:** uma seção nova e opcional, `orquestracao`, guarda a versão do
  resolvedor e, por agente e adaptador, `classe_declarada`,
  `classe_resolvida`, `alternativa`, `origem` e `resolucao_id`, além dos hashes
  dos arquivos materializados, que já existem. Nunca guarda credencial. **O
  lock é evidência de reprodução, não fonte de política**: o resolvedor lê o
  `.expx/orquestracao.json`, e não o lock.

## 10. Validação, fallback e falhas

| Momento | O que verifica | Falha |
|---|---|---|
| `init`/`update` | sintaxe e semântica do arquivo, a classe de cada agente, os ids e a compatibilidade de `effort` e `model` com o manifesto | erro antes de qualquer escrita, como no `agentes.json` |
| `init`/`update` | **não** verifica se o modelo está disponível nem se há credencial: o ExpxDev não consegue fazer isso sem invadir o harness | — |
| `doctor` | capacidades exigidas contra o manifesto: papel `revisar`/`testar` num adaptador sem `isola_ferramentas` comprovado; variáveis que sobrepõem o frontmatter; v1 abaixo da classe; agente instalado que diverge do lock | achado com a correção sugerida |
| abertura da tarefa (hook/lembrete das skills) | se existe resolução elegível para o papel no harness em uso | bloqueia antes da execução, com mensagem acionável |

Fallback:

- percorre **somente** a cadeia declarada, em ordem;
- o rastro registra a alternativa usada (`alternativa`), e o painel mostra
  quando não foi a primeira;
- `usage_limit_reached` não percorre a cadeia: é bloqueio de recurso, sem troca
  automática de modelo;
- não existe "aproximação": uma alternativa incompatível (esforço não suportado
  pelo modelo, provedor diferente do da sessão num adaptador sem
  `troca_provedor_por_agente`) é erro de resolução.

## 11. Rastro (emenda a `CONTRATO-expx-eventos.md`)

### 11.1 Chaves extras novas

Todas opcionais, depois das doze obrigatórias, como manda o contrato:

| Chave | O que é |
|---|---|
| `resolucao_id` | a resolução que estava em vigor para aquele agente (liga o evento ao lock) |
| `classe_declarada` | a classe que a skill declarou |
| `origem_resolucao` | a camada que decidiu (`embutida`, `projeto`, `agente`, `tarefa`, `sessao`, `agentes-json-v1`) |
| `alternativa` | o `id` da alternativa materializada |
| `harness` | já existe na SprintX; passa a ser gravada também pelo escritor comum, quando houver sinal |

`model` e `effort` continuam sendo **somente** o executor observado e ficam
`null` quando o runtime não os expõe. Linhas antigas continuam válidas, e quem
valida segue verificando que as doze chaves estão contidas na linha.

### 11.2 Achado sobre o fallback atual do Claude

Desde a 0.12.2, no contexto Claude, o escritor comum grava em `model`/`effort`
o frontmatter instalado quando o runtime não informa nada. Pelo critério da
seção 4, isso é **resolução materializada gravada como executor observado**.
Na prática quase sempre coincide, mas deixa de coincidir com
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` ou `CLAUDE_CODE_EFFORT_LEVEL`.

Proposta: no Claude, o `effort` vem de `$CLAUDE_EFFORT`, que é observado, quando
existir. O `model` mantém o fallback do frontmatter enquanto o Claude não expuser
o modelo aos hooks, mas o evento passa a carregar `resolucao_id`, e o `doctor`
avisa quando as variáveis de sobreposição estão ativas. Mudar o comportamento
publicado na 0.12.2 é decisão humana (seção 15).

## 12. Separação de papéis e isolamento

- Um papel `revisar` ou `testar` exige **identidade e sessão distintas** de quem
  implementou, **contexto independente** e **restrição efetiva de escrita**
  (`isola_ferramentas` comprovado no adaptador). "Modelo diferente" não basta
  como garantia; exigir modelo distinto é uma opção adicional (seção 15).
- Paralelismo: a escrita é exclusiva por árvore de trabalho (a mesma regra da
  MergeX); a revisão somente leitura pode ser paralela.
- Num adaptador que não comprova `isola_ferramentas`, o papel de aprovação não é
  sustentado estruturalmente. Se isso bloqueia ou só avisa é decisão humana
  (seção 15).

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
| F1 | `CONTRATO-expx-orquestracao.md` normativo, schema do `.expx/orquestracao.json` e resolvedor puro com testes de propriedade, **sem** mudar a instalação | expxdev |
| F2 | adaptador Claude: materialização a partir da resolução, seção `orquestracao` do lock, achados do `doctor` e emenda à instalação | expxdev |
| F3 | rastro: chaves da seção 11 no escritor comum e emenda aos eventos; depois, os escritores próprios da SprintX | expxdev; sprintx |
| F4 | `classe:` (e papel) declarados nos agentes de cada skill; recertificação dos candidatos | forks AxisGov; expxdev |
| F5 | painel: classe declarada, resolução e executor observado, com divergência destacada | expxdev |
| F6 | adaptador OpenCode (agentes em `.opencode/agents/`) | expxdev |
| F7 | adaptador Codex (agentes em `.codex/agents/`) | expxdev |

Até a F4, um agente sem `classe:` tem a classe **inferida** do frontmatter pela
tabela embutida do Claude (`haiku`→`mecanico_triagem`,
`sonnet`→`raciocinio_normal`, `opus`→`profundo_excepcional`). A inferência
aparece no `doctor` e no rastro (`origem_resolucao: "inferida"`).

## 15. Decisões do Flávio

Nenhuma destas é fechada por este desenho. Cada uma traz a recomendação, para
servir de ponto de partida.

| # | Decisão | Recomendação |
|---|---|---|
| H1 | Existe configuração global do usuário? Com que papel? | sim, mas só declarando adaptadores e provedores disponíveis na máquina, nunca política. Pode ficar para depois da F2 |
| H2 | Quem pode elevar para `profundo_excepcional`? Exige aprovação humana? | justificativa registrada basta no projeto e na tarefa; elevação por sessão não é permitida |
| H3 | **Conflito existente:** `auditor-plano`, `sprintx-revisor-testes`, `revisor-diff` e `analista-de-conflito` declaram `opus`/`high`, que pela tabela inferida é `profundo_excepcional`, classe que a RunX diz exigir justificativa | reconhecer `revisar` como papel cuja classe mínima é `profundo_excepcional` por declaração da skill, e não por elevação; a justificativa vale para elevações acima do declarado |
| H4 | Revisão exige modelo distinto do implementador, ou só isolamento estrutural? | só isolamento estrutural como obrigação; modelo distinto como opção do projeto |
| H5 | Teto de custo, orçamento, paralelismo e política após o limite de uso | fora do primeiro rollout; o limite de uso continua bloqueio |
| H6 | Quais harnesses entram no primeiro rollout? | Claude (F1–F5); OpenCode e Codex depois, cada um com o manifesto reverificado |
| H7 | Que campos da resolução são persistidos, e por quanto tempo? | lock: só a resolução vigente; rastro: os campos da 11.1, com a mesma retenção do rastro |
| H8 | Adaptador sem `isola_ferramentas` comprovado bloqueia o papel de aprovação, ou só avisa? | bloqueia o papel `revisar`/`testar` naquele adaptador |
| H9 | `.expx/agentes.json` v1 continua podendo rebaixar abaixo da classe? | sim, por compatibilidade, com aviso no `doctor` e marca no rastro; reavaliar numa versão maior |
| H10 | Mudar o fallback do rastro no Claude (seção 11.2)? | sim para o `effort` via `$CLAUDE_EFFORT`; o `model` mantém o fallback, com `resolucao_id` |

## 16. Critérios de aceite deste desenho

- O Codex revisa e não deixa achado bloqueante em aberto.
- O Flávio decide H1–H10, ou adia explicitamente cada uma.
- Toda capacidade do manifesto tem fonte e data, ou está marcada como não
  verificada.
- O texto preserva as seis decisões herdadas da seção 3 e não contradiz
  `CONTRATO-expx-eventos.md` nem `CONTRATO-expx-instalacao.md` vigentes: as
  mudanças neles são emendas planejadas, não efeitos deste documento.
