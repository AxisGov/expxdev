# Contrato `expx-orquestracao` v1 — classe, política e resolução por papel

Este contrato define como o ExpxDev escolhe, para cada agente de uma skill,
qual harness, modelo e esforço podem executá-lo. O desenho que o originou, com
as alternativas descartadas e o histórico de revisão, está em
`docs/superpowers/specs/2026-10-24-orquestracao-multimodelo-design.md`. Onde
este texto e o desenho divergem, vale este texto.

**Estado da v1:** são normativos o vocabulário, o arquivo de política, a
tabela embutida, a matriz de esforço do Claude, a função de resolução e o
formato do registro e do lock. **Desde a F2**, o `init` aplica a política no
adaptador Claude: materializa os agentes, grava o registro e a seção do lock, e
o `doctor` diagnostica (`CONTRATO-expx-instalacao.md` §5.3). **Desde a F3a**,
o rastro grava `model`/`effort` só como executor observado (H10) e, com a
política ativa, as chaves da resolução no evento do subagente, a partir da
projeção `.expx/orquestracao-rastro.tsv`; o painel mostra a resolução como
configuração não observada (seção 11 e `CONTRATO-expx-eventos.md`). **Desde a
F3c**, o hook do núcleo registra a `integridade_final` dos agentes de aprovação
(seção 12). O envelope da invocação e a recusa operacional do veredito (F3b)
ainda não existem.

## 1. Três coisas separadas

| Camada | O que é | Quem escreve |
|---|---|---|
| **Classe declarada** | o mínimo que o papel do agente exige | a skill, no frontmatter do agente (`classe:`) |
| **Resolução** | a alternativa concreta (`model`, `effort`) escolhida para um adaptador, e de que camada ela veio | o resolvedor do ExpxDev |
| **Executor observado** | o que o runtime informou que de fato executou | o escritor do rastro (`model`/`effort` em `CONTRATO-expx-eventos.md`) |

`model` e `effort` do rastro nunca representam intenção. A intenção é alcançada
pelo `resolucao_id` (seção 8).

## 2. Vocabulário

### 2.1 Classes

`mecanico_triagem` < `raciocinio_normal` < `profundo_excepcional`

Só as classes têm ordem. Não existe ordenação entre modelos de fornecedores
diferentes. "Piso" significa classe mínima.

### 2.2 Papéis

`planejar`, `implementar`, `investigar`, `testar` e `revisar`. O papel diz o que
o agente faz e quais garantias precisa ter (independência e ausência de escrita
para `testar`/`revisar`). Ele **não** entra na resolução: a classe é que decide
o modelo. A skill declara o papel junto com a classe (F4).

### 2.3 Adaptadores

`claude`, `opencode` e `codex`, os mesmos de `HARNESS_VALIDOS`. Na v1 só o
`claude` tem suporte operacional. `opencode` e `codex` são aceitos no arquivo e
validados na sintaxe, mas o resolvedor devolve `sem_suporte_operacional` para
eles até a F6/F7. Nenhum dos dois produz uma resolução válida na v1.

## 3. Opt-in

A orquestração só existe num projeto que tem `.expx/orquestracao.json`. Sem o
arquivo, a camada fica **inteiramente inativa**: nenhuma resolução é calculada
para materializar nem gravada; o lock não ganha a seção `orquestracao`; nenhum
agente é reescrito além do que o `.expx/agentes.json` v1 já faz; e os hooks de
resolução e invocação não são instalados. Arquivos de agente e lock saem byte a
byte iguais aos de uma instalação sem orquestração.

Um projeto que removeu a política volta a esse regime. As resoluções já gravadas
não são apagadas (seção 9).

## 4. O arquivo `.expx/orquestracao.json`

O arquivo é do projeto. O `init`, `add`, `remove` e `update` nunca o escrevem.

```json
{
  "expx_orquestracao": 1,
  "adaptadores": {
    "claude": {
      "classes": {
        "raciocinio_normal": [
          { "id": "sonnet-high", "model": "sonnet", "effort": "high" },
          { "id": "opus-medium", "model": "opus", "effort": "medium" }
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

### 4.1 Forma

- `expx_orquestracao` é obrigatório e vale `1`.
- `adaptadores` e `agentes` são opcionais. Chaves de topo começadas por `_` são
  comentários e são ignoradas. Qualquer outra chave é erro.
- `adaptadores.<a>` só aceita `claude`, `opencode` ou `codex`, e só a chave
  `classes`. `classes.<c>` só aceita as três classes.
- Uma cadeia é uma lista **não vazia** de alternativas `{ id, model, effort? }`,
  sem outras chaves. Os `id` são únicos dentro da cadeia e seguem
  `^[a-z0-9][a-z0-9._-]{0,63}$`. O `id` `frontmatter-da-skill` é reservado.
- `agentes.<nome>` segue `^[a-z0-9][a-z0-9-]*$` e aceita só `classe`
  (obrigatória) e `justificativa`. Com `classe: profundo_excepcional`, a
  `justificativa` é obrigatória e não pode ser vazia depois de remover os
  espaços.
- Nenhuma chave aceita credencial, URL, variável de ambiente ou caminho: as
  únicas strings livres são `id`, `model`, `effort` e `justificativa`. As três
  primeiras são validadas por padrão, e a última nunca é interpretada.

Presente e inválido, o arquivo **falha**, com mensagem que aponta o caminho da
chave (`adaptadores.claude.classes.raciocinio_normal[1].effort`). Um arquivo
ilegível não equivale a um arquivo ausente.

### 4.2 Validação por adaptador

**`claude`**

- `model` é um alias (`opus`, `sonnet`, `haiku`) ou um ID `claude-*`. `inherit`
  não é aceito numa cadeia, porque não se classifica.
- **Classe do modelo:** a família contida no nome (`haiku` → `mecanico_triagem`,
  `sonnet` → `raciocinio_normal`, `opus` → `profundo_excepcional`). Um modelo
  sem família reconhecida, como `fable` ou um ID desconhecido, não tem classe e
  **não pode** entrar numa cadeia na v1.
- **A alternativa satisfaz a classe** quando a classe do seu modelo é maior ou
  igual à classe da cadeia. `opus` numa cadeia de `raciocinio_normal` é válido;
  `haiku` numa cadeia de `profundo_excepcional` é erro.
- **`effort`** é validado pela matriz da seção 6. Um nível que o modelo não
  suporta é erro: o Claude Code rebaixaria o nível em silêncio, e a política não
  aceita aproximação.

**`opencode`**: `model` segue `<provedor>/<modelo>`. **`codex`**: `model` é um
slug (`^[a-z0-9][a-z0-9._-]*$`). Nos dois, `effort` é aceito só como forma
(`^[a-z]+$`) e **não é validado contra o modelo**, porque não há manifesto
comprovado de níveis. É mais um motivo para o resolvedor não operar esses
adaptadores na v1.

## 5. Tabela embutida v1

A versão da tabela é `1`. Só o `claude` tem entradas. Escolher provedor e modelo
para `opencode` e `codex` seria adivinhar uma credencial que o ExpxDev não
conhece.

| Classe | `id` | `model` | `effort` |
|---|---|---|---|
| `mecanico_triagem` | `embutida-haiku-low` | `haiku` | `low` |
| `raciocinio_normal` | `embutida-sonnet-medium` | `sonnet` | `medium` |
| `profundo_excepcional` | `embutida-opus-high` | `opus` | `high` |

Mudar a tabela é mudar a sua versão, e com ela todo `resolucao_id`.

## 6. Matriz de esforço do Claude v1

Fonte: `code.claude.com/docs/en/model-config`, acesso em 2026-10-24. A matriz
tem versão própria (`1`) e é reverificada a cada versão do ExpxDev que a altere.

| Modelo (ID, com ou sem sufixo de data `-AAAAMMDD`) | Níveis |
|---|---|
| `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-fable-5-1`, `claude-fable-5` | `low`, `medium`, `high`, `xhigh`, `max` |
| `claude-opus-4-6`, `claude-sonnet-4-6` | `low`, `medium`, `high`, `max` |
| qualquer outro ID | sem esforço: `effort` precisa estar ausente |

**Aliases.** O modelo de um alias depende do provedor. Na API da Anthropic,
`opus`, `sonnet` e `haiku` resolvem para Opus 5.5, Sonnet 5.5 e Haiku 5.5. Em
Bedrock, Agent Platform e Foundry, resolvem para versões anteriores, algumas sem
nenhum esforço (Haiku 4.5, por exemplo). O ExpxDev não sabe qual provedor o
projeto usa. Por isso a v1 **valida o alias como se fosse a API da Anthropic** e
declara essa suposição. Um provedor que resolve o alias para outro modelo é
detectado pela observação do executor na F3, que compara **o `model`
observado** com a alternativa, e não só o esforço: um alias pode resolver para
outra versão que aceita o mesmo `effort`, e nesse caso só o modelo denuncia a
divergência. Quem precisa de garantia estática usa o ID completo.

## 7. Resolução

### 7.1 Camadas

Da mais fraca para a mais forte:

| # | Camada | Pode |
|---|---|---|
| 1 | tabela embutida (seção 5) | oferecer uma cadeia padrão para a classe |
| 2 | configuração global do usuário | **reservada** (H1): só declarará adaptadores e provedores disponíveis, nunca política, e não ativa a camada sozinha |
| 3 | skill: `classe` declarada e frontmatter | fixar o piso e oferecer a alternativa `frontmatter-da-skill` |
| 4 | projeto: `adaptadores.<a>.classes.<c>` | substituir a cadeia da classe |
| 5 | projeto: `agentes.<nome>.classe` | elevar a classe do agente |
| 6 | tarefa: `classe` da tarefa | elevar a classe só daquela tarefa |
| 7 | sessão: `id` de alternativa | escolher uma alternativa da cadeia resolvida |

### 7.2 Invariantes

1. **Nunca rebaixa.** Uma classe pedida nas camadas 5 ou 6 menor que a classe
   vigente naquele ponto é **recusada** (`rebaixamento`), e não normalizada.
   Pedir a mesma classe não é elevação.
2. **Justificativa.** Elevar a `profundo_excepcional` nas camadas 5 ou 6 exige
   justificativa não vazia depois de remover os espaços (H2). A sessão nunca
   eleva classe.
3. **Classe declarada não é elevação** (H3). A classe que a skill declara é o
   piso do papel e não pede justificativa.
4. **A sessão só escolhe dentro da cadeia.** Um `id` que não está na cadeia
   resolvida é recusado (`alternativa_fora_da_cadeia`).
5. **Sem mescla.** Uma cadeia é sempre uma lista inteira de uma única origem.

### 7.3 Algoritmo

Entrada: o agente da skill (`nome`, `classe?`, frontmatter `model?`/`effort?`),
o adaptador, a política, e opcionalmente a tarefa (`classe`, `justificativa?`)
e a sessão (`alternativa`).

1. Adaptador sem suporte operacional → `sem_suporte_operacional`.
2. **Classe declarada:** a `classe` do agente, com `origem_classe: declarada`;
   sem ela, a classe do `model` do frontmatter (seção 4.2), com
   `origem_classe: inferida`. Sem nenhuma das duas (frontmatter ausente,
   `inherit` ou modelo sem família) → `sem_classe`, com a mensagem pedindo
   `classe:` explícita no agente.
3. **Camada 5**, e depois **camada 6**, pelos invariantes 1 e 2. Cada elevação
   efetiva muda `origem_classe` para `agente` ou `tarefa`.
4. **Cadeia** da classe resolvida `<c>`. A primeira regra que se aplica decide:
   1. a política declara `adaptadores.<a>.classes.<c>`: essa cadeia, com
      `origem_alternativa: projeto`;
   2. a classe resolvida é a declarada (nenhuma elevação) e o frontmatter traz
      um `model` que não é `inherit`: a cadeia de uma alternativa
      `{ id: "frontmatter-da-skill", model, effort? }`, com
      `origem_alternativa: skill`. Essa alternativa passa pela mesma validação
      da seção 4.2. Se o modelo não tem classe ou tem classe menor que a
      declarada, a resolução falha (`frontmatter_fora_da_classe`); se a sintaxe
      ou o `effort` são inválidos, falha (`frontmatter_invalido`). Nos dois
      casos a skill se contradiz, e a política não escolhe outro modelo no
      lugar dela;
   3. a tabela embutida tem cadeia para `<c>` no adaptador: essa cadeia, com
      `origem_alternativa: embutida`;
   4. nenhuma das anteriores → `sem_resolucao`.
5. **Alternativa:** a primeira da cadeia. Com a camada 7, a de `id` pedido, ou
   `alternativa_fora_da_cadeia`; uma escolha válida muda `origem_alternativa`
   para `sessao`.
6. **`resolucao_id`** (seção 8).

A função é pura e determinística: as mesmas entradas dão a mesma saída, byte a
byte.

### 7.4 Exceção do `.expx/agentes.json` v1

O v1 continua sendo um override de agentes Claude e pode rebaixar (H9). Numa
resolução que ele altera, o piso deixa de valer. A resolução ganha
`sobreposta_por: "agentes-json-v1"`, `materializado` (o `model`/`effort` finais)
e `origem_alternativa: "agentes-json-v1"`. A `cadeia` e a `alternativa` são
preservadas, e o `resolucao_id` é recalculado sobre essa forma. Override que não
muda nada não altera a resolução. Para julgar um modelo observado ou um
fallback, valem **a cadeia e o `materializado`**: a cadeia é o que a política
autoriza, e o `materializado` é a exceção aceita. **Meta:** a exceção é removida ou revista na
próxima versão maior do ExpxDev.

## 8. O objeto de resolução e o `resolucao_id`

```json
{
  "versao_resolvedor": 1,
  "tabela_embutida": 1,
  "matriz_effort_claude": 1,
  "adaptador": "claude",
  "agente": "runx-investigador",
  "classe_declarada": "raciocinio_normal",
  "origem_classe": "agente",
  "classe_resolvida": "profundo_excepcional",
  "cadeia": [{ "id": "embutida-opus-high", "model": "opus", "effort": "high" }],
  "alternativa": { "id": "embutida-opus-high", "model": "opus", "effort": "high" },
  "origem_alternativa": "embutida",
  "resolucao_id": "<64 hex>"
}
```

- `cadeia` é sempre a cadeia **completa**, com `model` e `effort`, para que o
  julgamento de um fallback não dependa da política vigente na leitura.
- `sobreposta_por` e `materializado` só existem na exceção da 7.4. Campo
  opcional ausente é omitido, nunca gravado como `null`.
- **`resolucao_id`** é o SHA-256, em hexadecimal minúsculo, do JSON canônico
  (chaves em ordem, sem espaços) do objeto **sem** o campo `resolucao_id`. Quem
  confere remove o campo, recalcula e compara. Campo ausente, valor fora do
  formato ou divergência reprovam a conferência.

## 9. Registro e lock (implementados na F2)

Só com a camada ativa.

- **Registro:** `.expx/resolucoes/<resolucao_id>.json` guarda o objeto da seção 8.
  É imutável e endereçado pelo conteúdo: um arquivo existente nunca é reescrito
  nem apagado automaticamente, nem quando a política é removida (H7). Guarda
  toda resolução efetivamente gravada, na instalação ou na invocação.
- **Forma do arquivo:** chaves ordenadas em todos os níveis, indentação de 2
  espaços e quebra de linha final. É só legibilidade: o `resolucao_id` continua
  calculado sobre o JSON canônico compacto. Um arquivo é válido só se é JSON, se
  o id confere com o conteúdo e com o nome do arquivo, e se os bytes são
  exatamente essa forma.
- **Lock:** a seção opcional `orquestracao` guarda `versao_resolvedor`,
  `tabela_embutida`, `matriz_effort_claude` e, por agente e adaptador, só o
  `resolucao_id` vigente. É evidência de reprodução, não fonte de política: o
  resolvedor lê a política, nunca o lock.
- Nenhum dos dois guarda credencial.

## 10. Decisões que regem este contrato

H1–H11 do desenho foram aprovadas em 2026-10-24 como recomendadas. As que esta
versão aplica diretamente são H2 (justificativa), H3 (classe declarada), H6
(só Claude operacional), H7 (registro e lock), H9 (exceção v1) e, desde a F3a,
H10 (o escritor do rastro sem configuração em `model`/`effort`). As demais
(H4, H5, H8, H11) regem as fases seguintes e entram nas emendas delas.

## 11. Rastro (F3a)

### 11.1 O evento: executor observado e resolução

`model` e `effort` do rastro são **só o executor observado** (H10): nenhum
escritor deve preenchê-los com configuração — frontmatter, resolução ou
alternativa. O escritor comum já cumpre a regra; os escritores próprios da
SprintX ainda completam o subagente do Claude com o frontmatter, exceção
transitória até receberem a mesma mudança. O escritor comum (`nucleo/hooks/expx-rastro.sh`) os tira de
`EXPX_MODEL`/`EXPX_EFFORT`, que o chamador lê do payload do runtime para o
executor `EXPX_AGENTE` (no Claude, `effort.level`), e, no contexto Claude, de
`$CLAUDE_EFFORT` apenas para `principal`. Sem observação, `null`. O `harness`
detectado vai na linha, salvo se o chamador já o mandou.

Com a política ativa, a linha de um **subagente no contexto Claude** leva a
resolução vigente dele, depois das doze chaves:

| Chave | Valor |
|---|---|
| `resolucao_id` | o id da seção 8, que endereça `.expx/resolucoes/<id>.json` |
| `classe_declarada` · `classe_resolvida` · `origem_classe` | os campos de mesmo nome da resolução |
| `alternativa` | o `id` da alternativa materializada |
| `origem_alternativa` | o campo de mesmo nome |
| `materializado` | `{model, effort?}`, **só** com `origem_alternativa: agentes-json-v1` (7.4) |

O principal, outro harness e o agente fora da projeção não levam essas
chaves. `invocacao`, `modelos_observados`, `fora_da_politica` e o evento
`invocacao_abandonada` estão declarados em `CONTRATO-expx-eventos.md` para o
envelope da invocação (F3b), e nenhum escritor os grava nesta versão.

### 11.2 A projeção `.expx/orquestracao-rastro.tsv`

O escritor é bash, sem `jq` nem runtime, e por isso não lê o lock nem o
registro: lê uma projeção plana deles, que o `init` grava no mesmo plano em
que grava o registro e o lock, de forma atômica, e remove quando a política
sai. Ela não é fonte de nada.

- Primeira linha: `# expx-orquestracao-rastro 1`. Depois, uma linha por
  agente, em ordem, com nove campos separados por TAB: `agente`,
  `resolucao_id`, `classe_declarada`, `origem_classe`, `classe_resolvida`, o
  `id` da `alternativa`, `origem_alternativa`, `model` e `effort` do
  `materializado`, com `-` quando ausentes.
- Todo campo é preenchido e fica no alfabeto `[A-Za-z0-9._:/-]`, que entra no
  JSON sem escape; `-` só vale nas duas colunas do `materializado`. Valor fora
  disso, ou agente repetido, recusa o plano.
- O escritor falha aberto: cabeçalho diferente, linha sem exatamente oito
  TABs, campo vazio ou fora do alfabeto, `resolucao_id` fora do formato ou
  agente fora do alfabeto de nome deixam a linha **sem** as chaves, nunca com
  parte delas.
- O `doctor` confere a projeção contra o lock e o registro
  (`orquestracao-projecao-divergente`, `CONTRATO-expx-instalacao.md` §5.3).

### 11.3 O leitor

O painel mostra a configuração quando não há observação, e só ele:

1. `model` ou `effort` observados (não `null`): histórico, sem completar o
   que falta;
2. sem observação e com `resolucao_id` cujo registro se lê e é do mesmo
   agente: a alternativa resolvida (ou o `materializado`), rotulada
   **configuração (não observada)**;
3. `resolucao_id` sem registro legível, ou de outro agente: **inconsistência**,
   sem inventar configuração. O id do evento só vira caminho se estiver no
   formato, e o arquivo precisa ser regular e passar pela leitura do registro;
4. sem `resolucao_id`: o fallback anterior — a configuração instalada, só
   quando o evento não identifica outro harness.

## 12. Separação de papéis: a integridade final (F3c)

O desenho (§12) exige, de um papel `revisar` ou `testar`, a impossibilidade de
escrever no projeto em um de três níveis: `estrutural`, `isolado` ou
`integridade_final`. Esta seção fixa o terceiro, o **fraco**. Ele prova só que
o estado final da árvore de trabalho é igual ao inicial: não pega editar e
reverter, nem arquivo ignorado alterado que mude o resultado de um comando.
Sozinho, nunca sustenta o papel (H8).

### 12.1 O que é comparado, e onde

O hook do núcleo `expx-integridade-final.sh`, registrado no `SubagentStart` e
no `SubagentStop` (sem matcher, `timeout` 30), age só nos agentes de
aprovação. No início, fotografa a árvore; no fim, fotografa de novo e compara
as três partes, byte a byte:

| Parte | O que é |
|---|---|
| `head` | `git rev-parse HEAD^{commit}` |
| `status` | os bytes de `git status --porcelain -z --untracked-files=all` |
| `arvore` | o tree id da árvore inteira — rastreado e não rastreado não ignorado — montado com `git add -A` e `git write-tree` num índice **temporário**, copiado do real. O `git diff HEAD` não vê o conteúdo de arquivo não rastreado, e editar o arquivo novo que o implementador ainda não adicionou é o caso comum de revisão. O índice real nunca é tocado |

A foto mora no git-dir da worktree
(`git rev-parse --git-path expx/integridade-final/v1`), nunca na árvore de
trabalho, num diretório por sessão (`session_id`) e por instância (`agent_id`)
cujos nomes são o hash do id: id do payload nunca vira caminho, e instâncias
paralelas não colidem. O fim remove o diretório da instância em qualquer
resultado. Os filtros `clean` (LFS) e o `core.autocrlf` valem no `git add`: a
`arvore` compara a representação Git, não necessariamente os bytes físicos. Um
submódulo entra só pelo gitlink; a sujeira interna dele aparece no `status`,
não na `arvore`.

### 12.2 Os agentes de aprovação (lista transitória)

| `agent_type` | `ferramenta` do evento |
|---|---|
| `revisor-diff` | `mergex` |
| `qa` | `runx` |
| `runx-revisor-testes` | `runx` |

Aceita-se o nome exato, ou o nome depois de **um** prefixo literal `expx:`.
Substring, outro prefixo ou nome parecido não viram aprovador. Fora da lista, o
hook sai sem rodar Git e sem gravar nada. As variáveis locais do Git herdadas
do ambiente (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` e as demais de
`git rev-parse --local-env-vars`) são descartadas antes da foto: com elas, a foto
seria de outro repositório. A lista é transitória: a F4 a troca
pelo `papel` declarado e projetado da política, sem inferi-lo do nome. O
`auditor-plano` e o `sprintx-revisor-testes` não estão nela porque já são
`estrutural` (sem ferramenta de escrita nem `Bash`).

### 12.3 O evento

No `SubagentStop` de um aprovador, o hook grava `integridade_final_verificada`
(`CONTRATO-expx-eventos.md`) com a extra `integridade_final`:

```json
{"integridade_final": {"estado": "divergente", "diferencas": ["status", "arvore"]}}
```

| `estado` | Quando | `resultado` | `diferencas` |
|---|---|---|---|
| `igual` | as três partes iguais | `ok` | `[]` |
| `divergente` | ao menos uma parte diferente | `falha` | as partes, na ordem `head`, `status`, `arvore`, sem repetir |
| `ausente` | sem foto do início, foto ilegível ou incompleta, Git falhou, repositório sem commit, payload sem `agent_id` | `falha` | `[]` |

`ausente` nunca vira `igual`: timeout, truncamento ou erro invalidam. A extra é
obrigatória nesse evento e vedada nos demais; linhas antigas, sem ela,
continuam válidas. O esquema também amarra o `resultado` ao `estado` e o
`agente` à `ferramenta` da tabela 12.2: linha incoerente é defeito do rastro. O evento é próprio, e não `agente_concluido`, porque a
SprintX já grava `agente_concluido` para todo subagente, e o aprovador ficaria
com duas conclusões. O `SubagentStart` não grava evento.

### 12.4 O que `divergente` e `ausente` invalidam, nesta fase

Divergência ou ausência **invalidam o veredito** daquele aprovador, em qualquer
regime. Nesta versão isso é registrado e mostrado, não executado:

- o evento sai `falha`, e o painel o destaca;
- o `doctor` avisa `integridade-final-invalida`, com a contagem por arquivo do
  rastro;
- a **recusa operacional** do veredito fica para a F3b. Hoje o
  `veredito_emitido` não carrega `agent_id` nem `invocacao`, e recusar por nome
  de agente associaria aprovadores paralelos errado. O envelope da F3b
  correlaciona invocação, instância, término e veredito.

### 12.5 Pré-condição: o rastro ignorado

O rastro (`docs/eventos/`) é ignorado pelo versionador por padrão
(`CONTRATO-expx-eventos.md`). Fora disso, cada linha que um hook grava durante
o subagente entra no `status` da foto, e a verificação dá `divergente` sem o
aprovador ter tocado em nada. O mesmo vale para arquivo do rastro que
já está versionado: a regra do `.gitignore` não alcança o que está no índice.
Com a integridade instalada, o `doctor` avisa `rastro-nao-ignorado` nos dois
casos. A comparação não exclui `docs/eventos/` por conta
própria: o que ela mede é o que o Git vê.

