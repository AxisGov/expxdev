# Contrato `expx-eventos` v1 — hooks, agentes e rastro

Documento compartilhado pelas cinco skills e pelo painel. Guarde no repositório do painel e referencie nos outros.

---

## Por que hooks

Toda regra inviolável das skills é hoje uma instrução que o modelo pode esquecer numa execução longa. Hook é script determinístico: roda sempre, porque quem executa é o harness, não o modelo.

Mecânica que o desenho assume:

- Hooks ficam em `.claude/settings.json`, aninhados em evento → matcher → handler
- O hook recebe o evento em JSON no stdin
- `PreToolUse` é o único que barra a chamada: **exit 2 bloqueia e o stderr volta ao modelo como o motivo**
- `PostToolUse` roda depois do sucesso e não desfaz nada. **Atenção:** ali o exit 2 NÃO bloqueia e o **stderr não volta ao modelo** — verificado na documentação oficial. O único canal que chega ao modelo é JSON no stdout: `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}`. Todo hook de aviso em `PostToolUse` precisa usar esse formato; escrever em stderr ali é falha silenciosa
- Exit 0 permite; qualquer outro não-zero é erro não bloqueante, registrado e ignorado
- Hooks apertam permissão, nunca afrouxam

**Paridade com o OpenCode — verificada no binário v1.18.23 e testada de ponta a ponta.** Hooks são mecanismo do Claude Code; o OpenCode tem sistema próprio, de plugins JS auto-carregados de `.opencode/plugin/*.ts`, com os hooks `tool.execute.before` e `tool.execute.after`. O que a verificação encontrou:

| Capacidade | Claude Code | OpenCode |
|---|---|---|
| Bloquear a chamada | `exit 2` no `PreToolUse`, stderr vira o motivo | **lançar exceção** em `tool.execute.before` — testado: a ação não acontece e o modelo lê a mensagem |
| Avisar sem bloquear | JSON no stdout (`additionalContext`) | **não existe no `before`** — só passar em silêncio ou lançar |

A lacuna real é o **modo aviso**, que é justamente o modo em que todo hook de método nasce. O contorno adotado pela `sprintx`: anexar o aviso ao resultado da ferramenta em `tool.execute.after`, sempre prefixado por `[sprintx/hooks — aviso, a ação NÃO foi bloqueada]`, para o modelo não confundir o aviso com a saída da própria ferramenta.

Recomendação para as demais skills: a lógica de cada hook mora **uma vez só**, em script de shell, e o plugin do OpenCode é uma ponte que o invoca e traduz a saída. Duplicar a lógica cria duas fontes divergindo com o tempo. Ao traduzir o payload, note que as ferramentas do OpenCode usam `filePath` (camelCase), e que os argumentos vêm em `output.args` no `before` e em `input.args` no `after`.

## Princípio de adoção — leia antes de implementar

Hook que dá falso positivo é desinstalado, e junto com ele vão os que funcionavam. Por isso todo hook nasce em modo `aviso` e só é promovido depois.

| Modo | Comportamento | Quando usar |
|---|---|---|
| `aviso` | Registra no rastro, não bloqueia | Estado inicial de todo hook de método |
| `bloqueio` | Exit 2, barra a ação | Só depois de rodar semanas sem falso positivo |
| `desligado` | Não roda, não registra | Escape explícito, quando o hook atrapalha mais que ajuda |

Exceção: os hooks de segurança nascem em `bloqueio`. Segredo commitado não tem volta, e o falso positivo ali é raro.

**Os três modos são obrigatórios em toda implementação.** Um hook que reconhece só dois e trata o terceiro como valor inválido continua rodando quando alguém pediu para desligá-lo — a intenção do operador some em silêncio.

### `.expx/hooks.json`

```json
{
  "expx_hooks": 1,
  "hooks": {
    "segredo":       { "modo": "bloqueio", "tipo": "seguranca" },
    "escopo-da-task":{ "modo": "aviso",    "tipo": "metodo" }
  }
}
```

`tipo` é `seguranca` ou `metodo`, e não é decorativo: **hook de segurança nunca é rebaixado por ausência de configuração.** Arquivo ausente, ilegível ou sem a entrada do hook ⇒ o hook de segurança assume `bloqueio`, o de método assume `aviso`. Só um `desligado` explícito desliga um hook de segurança.

O `doctor` mostra em que modo cada um está.

## O rastro de eventos

Arquivo append-only, uma linha JSON por evento:

```
docs/eventos/<trabalho_id>.jsonl
```

Escrito por hooks e pelas próprias skills nas transições de fase. Lido pelo painel. Ninguém edita à mão.

### Formato da linha

```json
{
  "ts": "2026-08-29T14:32:10Z",
  "expx_eventos": 1,
  "trabalho_id": "OC-2026-0142",
  "ferramenta": "runx",
  "origem": "hook",
  "evento": "task_concluida",
  "fase": "e3",
  "task": "T-01.02",
  "agente": "implementador",
  "resultado": "ok",
  "detalhe": "suite verde, 14 testes",
  "arquivos": ["src/frete/calculo.ts"],
  "model": "openai/gpt-5.4",
  "effort": "high"
}
```

Valem as convenções do documento raiz `CONVENCOES.md` — em particular R2 (chave em `snake_case` sem acento), R3 (enum minúsculo sem acento), R4 (data ISO, obtida do sistema), R6 (chave nunca omitida) e R10 (nenhum caminho absoluto).

Não repita aqui o texto das convenções: cite pelo identificador. Este parágrafo já foi, numa versão anterior, um resumo em prosa que citava quatro das nove regras e perdia as outras cinco.

### As doze chaves obrigatórias, e as extras

A linha tem **doze chaves obrigatórias**, sempre todas, nesta ordem:

`ts` · `expx_eventos` · `trabalho_id` · `ferramenta` · `origem` · `evento` · `fase` · `task` · `agente` · `resultado` · `detalhe` · `arquivos`

Por R6, nenhuma delas é omitida: sem valor, escreva `null` (ou `[]` em `arquivos`).

**Chaves extras são permitidas**, desde que declaradas aqui e posicionadas **depois** das doze, antes do fim do objeto. Uma skill que tem informação real a registrar não deve perdê-la nem espremê-la em `detalhe`.

| Chave extra | Quem grava | O que é |
|---|---|---|
| `hook` | mergex, legadox | nome do hook que decidiu, quando `origem: hook` |
| `faixa` | legadox | faixa de atenção do arquivo tocado |
| `sessao` · `harness` | sprintx, pelo escritor `scripts/rastro.sh` | identidade da sessão (`<harness>@<id>`), **derivada** do harness — nunca preenchida por quem chama. Obrigatória somente quando `ferramenta: sprintx` e o evento é `task_iniciada`/`task_concluida`/`task_bloqueada`; nos demais eventos da SprintX, `scripts/rastro.sh` pode gravar `null`, enquanto planejamento, bloqueios e hooks omitem as chaves |
| `model` · `effort` | escritor comum `nucleo/hooks/expx-rastro.sh` e escritores próprios da SprintX | retrato da configuração usada naquela execução; identificadores de modelo são livres para suportar Claude, Codex, Gemini, Grok e outros provedores |

`model` e `effort` são uma extensão aditiva do v1: continuam opcionais para que todo rastro anterior permaneça válido. O escritor comum inclui as duas chaves em cada linha que ele próprio grava; `EXPX_MODEL` e `EXPX_EFFORT`, quando fornecidos pelo runtime, têm prioridade.

Escritores próprios das skills não passam automaticamente pelo gravador comum. Os da SprintX (`scripts/rastro.sh`, `scripts/planejamento.sh` e `scripts/bloqueios.sh`, desde AxisGov/sprintx@1941c5a) gravam as duas chaves pela mesma regra, com uma restrição explícita: `EXPX_MODEL`/`EXPX_EFFORT` descrevem o executor `EXPX_AGENTE` (sem ela, `principal`) e não passam para uma linha atribuída a outro agente — o `veredito_emitido` do `auditor-plano` é gravado pelo principal, que não é quem auditou. Hooks das skills e linhas antigas continuam sem as chaves e aparecem como **sem snapshot**.

O contrato é igual para qualquer harness: `EXPX_MODEL` e `EXPX_EFFORT` registram a configuração efetivamente escolhida. O frontmatter instalado em `.claude/agents/<agente>.md` é fallback somente no contexto Claude: `EXPX_HARNESS` igual a `claude` ou `claude-code` ou, sem `EXPX_HARNESS`, a variável `CLAUDECODE` que o Claude Code exporta. Codex, OpenCode, um runtime sem nenhum desses sinais e qualquer outro harness sem metadado explícito gravam as duas chaves como `null`, em vez de receber uma configuração Claude que podem não ter usado.

Uma chave presente com `null` registra que o escritor tentou capturar o dado e o runtime não o informou — caso normal de `principal` sem metadado explícito. A ausência identifica uma linha **sem snapshot**, seja antiga ou emitida por outro escritor. O leitor só pode usar a configuração atual como fallback quando o evento não identifica outro harness; caso contrário, informa histórico indisponível.

Quem valida uma linha verifica que as doze estão **contidas** nela — nunca igualdade exata de conjunto. Um validador de igualdade estrita reprova as skills que usam extras legítimas, e foi assim que a verificação da `runx` passou a reprovar toda linha da `mergex` e da `legadox`.

### Valores de `ferramenta`

`sprintx` · `runx` · `mergex` · `legadox` · `stackx` · `memox` · `prodx` · `buildx`

**Não confundir com `expx_tool`**, do `expx-schema`, que aceita só `sprintx`, `runx` e `buildx`. São campos de domínios diferentes: `expx_tool` diz que skill *escreveu um artefato de estado* — e só essas três escrevem; `ferramenta` diz que skill *emitiu um evento* — e todas emitem. Um leitor que trate os dois como o mesmo enum rejeita o rastro de cinco skills.

### Vocabulário de `evento`

| Evento | Quem grava |
|---|---|
| `fase_iniciada` · `fase_concluida` | skill |
| `task_iniciada` · `task_concluida` · `task_bloqueada` | skill |
| `task_reaberta` | sprintx, por `scripts/planejamento.sh`: no fechamento da rodada, a task do B-NN volta de `bloqueada` a `pendente`. Task concluída nunca gera este evento |
| `checkpoint_planejamento` | sprintx, por `scripts/planejamento.sh`: ao fim da F2, F3 e F4, a cada veredito da F5 e em cada transição do replanejamento da execução |
| `replanejamento_execucao_iniciado` · `replanejamento_execucao_retomado` · `replanejamento_execucao_aprovado` · `replanejamento_execucao_esgotado` · `replanejamento_execucao_recusado` | sprintx, por `scripts/planejamento.sh`: rodada aberta, retomada na mesma rodada, aprovada pela F5, orçamento da F6 consumido, transição recusada |
| `bloqueio_resolvido` | sprintx, por `scripts/bloqueios.sh resolver`, ao gravar `resolvido_em` |
| `suite_executada` | hook `PostToolUse` |
| `arquivo_alterado` | hook `PostToolUse` |
| `regra_violada` | hook, em modo aviso |
| `acao_bloqueada` | hook, em modo bloqueio |
| `agente_iniciado` · `agente_concluido` | hook `SubagentStop` e skill |
| `veredito_emitido` | agente auditor ou QA |
| `commit_criado` · `pr_aberto` | mergex |
| `artefato_gravado` | mergex, quando a gravação de um artefato derivado (`.expx/estado.json`) falha: sai com `resultado: falha` e `agente: principal`, no rastro do trabalho ou em `docs/eventos/sem-trabalho.jsonl` no E9 sem trabalho atual. Nunca interrompe a etapa |

**Esta tabela não é a fonte: o enum é.** A lista mora em `EventoNome`
(`src/parser/esquema/evento.ts`) e `src/nucleo/documentacao.test.ts` confere a
tabela contra ele — nome a mais, a menos ou repetido aqui quebra a suíte. Era a
tabela escrita à mão que sustentava a divergência: ela ficou nos catorze eventos
originais enquanto a `sprintx` já gravava outros oito por
`scripts/planejamento.sh` e `scripts/bloqueios.sh`, e o `doctor` contava rastro
legítimo como fora do contrato. Evento novo entra **no mesmo commit** no enum,
nesta tabela, na tabela publicada do `docs-site` e no rótulo do painel
(`src/watch/logica/atividade.ts`) — as três são conferidas contra o enum.

### Valores de `agente`

`principal` · `auditor-plano` · `sprintx-revisor-testes` · `sprintx-investigador` · `runx-revisor-testes` · `runx-investigador` · `qa` · `legadox-cartografo` · `avaliador-de-raio` · `stackx-cartografo` · `revisor-diff` · `analista-de-conflito` · `auditor-design` · `cartografo-visual`

`principal` é o valor quando não há subagente — o modelo principal executando. Nunca `null`: por R6 a chave está sempre lá, e "foi o principal" é informação, não ausência.

Os três últimos existiam em disco e já eram gravados no rastro antes de constarem aqui. Um agente novo entra nesta lista **no mesmo commit** em que passa a emitir evento.

### Decisão de versionamento

O rastro é **ignorado pelo versionador** por padrão. É local da máquina de quem executou, cresce rápido, e o painel roda local. Quem quiser rastro compartilhado troca isso conscientemente — e aí precisa lidar com conflito de merge em arquivo append-only, que é chato.

Rotação: acima de 5 MB, o arquivo vira `<trabalho_id>.1.jsonl` e um novo começa. O painel lê os dois.

## O que o painel mostra com isso

- Linha do tempo do trabalho: cada fase, cada task, quanto tempo levou
- **Quem fez o quê**: filtro por agente, com o que cada um tocou e que veredito emitiu
- **Com qual configuração**: `model` e `effort` do evento como histórico; sem snapshot, configuração atual apenas quando o evento não identifica outro harness, ou histórico indisponível
- Violações de regra em modo aviso, que é a lista que decide quais hooks promover a bloqueio
- Ações bloqueadas, para ver se algum hook está atrapalhando mais que ajudando
- Duração real por task, que alimenta a calibração de estimativa do `sprintx`

Esse último item é um ganho que não estava previsto: o rastro dá o esforço real por task sem ninguém anotar nada.

## Convenção de agentes

Subagentes rodam em contexto próprio e com ferramentas restritas. É isso que torna estrutural a regra "quem implementa não aprova" — hoje ela é uma promessa que o mesmo modelo faz a si mesmo, tendo visto o próprio raciocínio.

Um arquivo por agente, com frontmatter declarando nome, descrição e as ferramentas permitidas. **Os campos diferem entre os dois harnesses** — verificado na documentação oficial e no binário do OpenCode v1.18.23:

| | Claude Code (`.claude/agents/<nome>.md`) | OpenCode (`.opencode/agent/<nome>.md`) |
|---|---|---|
| Restringir ferramentas | `tools: Read, Glob, Grep` (string separada por vírgula) | `permission:` com `edit: deny`, `write: deny`, `bash: deny` |
| Campo `tools:` | existe | **não existe** — campo desconhecido vai silenciosamente para `options` |
| Se omitir a restrição | **herda TODAS as ferramentas** | herda a permissão do nível acima |
| Outros campos | `name`, `description`, `model` | `description`, `mode: subagent`, `model` |

A linha "se omitir, herda todas" é a mais perigosa da tabela: um agente de veredito sem o campo `tools:` nasce com permissão de escrita, o que destrói exatamente a garantia que justifica o agente existir. Confirme os nomes na documentação vigente antes de implementar — não escreva de memória.

### Os agentes do ecossistema

| Agente | Usado por | Ferramentas | Papel |
|---|---|---|---|
| `auditor-plano` | sprintx F5 | leitura apenas | Fura o plano antes de virar código |
| `sprintx-revisor-testes` | sprintx F5/F6 | leitura apenas | Verifica se o teste discrimina a implementação errada |
| `sprintx-investigador` | sprintx F1 | leitura + busca web | Condensa bases grandes para o planejamento |
| `runx-revisor-testes` | runx E3 | leitura + rodar teste | Verifica se o teste discrimina a implementação errada |
| `runx-investigador` | runx E1 | leitura + busca + comandos | Prova causa raiz ou dimensiona o impacto |
| `qa` | runx E4 | leitura + rodar suíte | Valida contra os critérios, não corrige |
| `legadox-cartografo` | legadox | leitura + comandos + escrita | Monta o perfil legado e prova que o código está vivo |
| `avaliador-de-raio` | legadox | leitura + comandos + escrita | Calcula o raio de impacto por evidência |
| `stackx-cartografo` | stackx | leitura + histórico + comandos | Extrai convenções sem escrever o `CONVENCOES.md` |
| `revisor-diff` | mergex E3 | leitura + comandos | Classifica o diff por atenção humana |
| `analista-de-conflito` | mergex manual | leitura apenas | Explica a intenção de cada lado; não resolve |
| `auditor-design` | designx | leitura apenas | Audita conformidade visual; não corrige |
| `cartografo-visual` | designx | leitura apenas | Extrai do código o vocabulário visual em uso |

**Regra que dá sentido a tudo:** agentes que apenas emitem veredito não recebem ferramentas de escrita. Alguns agentes precisam executar testes ou comandos, e os dois agentes do legadox preservam escrita porque produzem os artefatos do próprio método. As permissões permanecem declaradas em cada arquivo de agente.

## Estrutura no plugin

```
plugin/
├── hooks/
│   ├── hooks.json
│   ├── comum/          segredo, git, rastro
│   ├── sprintx/
│   ├── runx/
│   ├── legadox/
│   ├── stackx/
│   └── mergex/
├── agents/
│   ├── auditor-plano.md
│   ├── sprintx-revisor-testes.md
│   ├── sprintx-investigador.md
│   ├── runx-revisor-testes.md
│   ├── runx-investigador.md
│   ├── qa.md
│   ├── legadox-cartografo.md
│   ├── avaliador-de-raio.md
│   ├── stackx-cartografo.md
│   ├── revisor-diff.md
│   ├── analista-de-conflito.md
│   ├── auditor-design.md
│   └── cartografo-visual.md
└── skills/
```

Os hooks são instalados pelo CLI conforme a seleção de skills: quem não instalou o `legadox` não recebe os hooks dele.

## Regras que todo hook obedece

1. **Rápido.** Roda em toda chamada de ferramenta. Acima de 200 ms, o dev sente.
2. **Silencioso quando passa.** Só fala quando barra ou avisa.
3. **Falha aberta, exceto segurança.** Hook de método que quebra não pode travar o trabalho: registra o erro e sai com 0. Hook de segurança falha fechada.
4. **Sem rede.** Nada de chamada externa no caminho de uma chamada de ferramenta.
5. **Mensagem acionável.** O stderr vai para o modelo: diga o que fazer, não só o que está errado.
6. **Sem estado próprio.** Toda decisão sai de arquivo já existente — `tasks.md`, `PERFIL.md`, `CONVENCOES.md`, o lock.
7. **Sempre grava no rastro**, inclusive quando permite.

## Ordem de implementação sugerida

1. Rastro e os hooks de segurança, em bloqueio
2. Hooks de método, todos em modo aviso
3. Agentes de veredito
4. Promoção a bloqueio, guiada pela lista de violações que o painel acumulou

O passo 4 é o único que não dá para acelerar: ele depende de evidência de uso real.