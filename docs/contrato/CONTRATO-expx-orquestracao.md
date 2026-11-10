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
(seção 12). **Desde a 0.13.0**, o envelope da invocação observa a chamada de cada
agente gerenciado (seção 13). **Desde a F5**, o painel mostra, por invocação, a
classe declarada, a resolução e o executor observado lado a lado, com a
divergência destacada (11.5). A recusa operacional do veredito e o nível `isolado`
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
o modelo, e o `resolucao_id` não muda com ele. A skill declara o papel junto com a
classe, no frontmatter do agente (`papel:`, F4). Valor fora do vocabulário é skill
inválida, com ou sem política. Sem `papel:`, o agente não é de aprovação: o papel
nunca é inferido do nome. `revisar` e `testar` são os papéis de aprovação: só eles
passam pela integridade final (§12), com ou sem política. O primeiro plano (§13.1)
exige, além do papel legível na projeção dos papéis (11.4), a linha válida do
agente na projeção do rastro (11.2): sem ela não há envelope, e o agente passa
sem nada.

### 2.3 Adaptadores

`claude`, `opencode` e `codex`, os mesmos de `HARNESS_VALIDOS`. Na v1 só o
`claude` tem suporte operacional. `opencode` e `codex` são aceitos no arquivo e
validados na sintaxe, mas o resolvedor devolve `sem_suporte_operacional` para
eles até a F6/F7. Nenhum dos dois produz uma resolução válida na v1.

## 3. Opt-in

A resolução e o envelope da invocação só existem num projeto que tem
`.expx/orquestracao.json`. Sem o arquivo, essa camada fica **inativa**: nenhuma
resolução é calculada para materializar nem gravada; o lock não ganha a seção
`orquestracao`; nenhum agente é reescrito além do que o `.expx/agentes.json` v1 já
faz; e os hooks de resolução e invocação não são instalados. Os arquivos de agente
saem byte a byte iguais aos de uma instalação sem orquestração.

A separação de papéis não depende do arquivo: a integridade final (§12) é
instalada sempre, e por isso a projeção dos papéis (11.4), o hash dela no lock
(`instalacao.papeis`) e o achado `papeis-projecao-divergente` do `doctor` existem
com ou sem política, sempre que algum agente instalado declara `papel:`.

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
alternativa. O escritor comum cumpre a regra, e os escritores próprios da
SprintX também, desde AxisGov/sprintx@80d2e9b (DS-190); linhas anteriores, em
que eles completavam o subagente do Claude com o frontmatter, continuam
válidas. O escritor comum (`nucleo/hooks/expx-rastro.sh`) os tira de
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
chaves. `invocacao`, `instancia`, `estado_invocacao`, `modelos_observados` e
`fora_da_politica` são do envelope da invocação (seção 13).

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
- Um NUL em qualquer ponto do arquivo, mesmo na linha de outro agente, invalida a
  projeção inteira, no escritor e no hook do envelope (§13): o `read` do shell o
  descartaria em silêncio, e os dois leitores discordariam sobre a mesma linha. Cada
  leitor abre o arquivo uma vez: a conferência do NUL e o parse leem os mesmos
  bytes, e uma troca concorrente no meio da leitura não entra.
- O `doctor` confere a projeção contra o lock e o registro
  (`orquestracao-projecao-divergente`, `CONTRATO-expx-instalacao.md` §5.3).

### 11.3 O leitor da linha avulsa

Na linha do tempo, cada evento mostra **uma** fonte para o executor. O painel
mostra a configuração quando não há observação, e só ele:

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

### 11.4 A projeção dos papéis `.expx/papeis.tsv` (F4)

Os hooks da integridade final (§12) e do envelope (§13) leem o papel de uma projeção
plana, que o `init` grava **com ou sem política**: a integridade final roda nos dois
regimes, e por isso o papel não é uma coluna da projeção do rastro (11.2).

- Primeira linha: `# expx-papeis 1`. Depois, uma linha por agente instalado que
  declara `papel:`, em ordem, com três campos separados por TAB: `agente`, a
  `skill` que o publica e o `papel`. A `skill` é a `ferramenta` dos eventos
  desses hooks: nada é deduzido do nome.
- Só entram o agente e a skill que o rastro aceita (`Agente` e `Ferramenta` de
  `CONTRATO-expx-eventos.md`): o evento de outro seria inválido. O de fora fica
  fora da projeção, com aviso no plano, e não passa pela integridade nem pelo
  primeiro plano. O mesmo `name` com papel em duas skills recusa o plano.
- Sem nenhum agente com papel, o arquivo não existe, e o `init` remove o anterior.
- Os hooks aceitam o arquivo inteiro ou nada, lido de uma abertura só: NUL em
  qualquer ponto (o `read` do shell o descartaria em silêncio), cabeçalho diferente, linha sem
  exatamente dois TABs, campo fora de `[a-z0-9-]`, papel fora do vocabulário ou
  agente repetido deixam todo agente sem papel, e o mesmo vale para o `principal` e
  para skill fora do vocabulário `ferramenta` do rastro. O CLI lê com as mesmas
  regras; o vocabulário de agentes fica só na escrita, e os hooks não guardam lista
  de nomes de agente. O CR no fim da linha sai, como no `read` do shell: a projeção
  é versionada com o `.expx/`, e o checkout com `core.autocrlf` a entrega em CRLF.
  Falha aberta: sem papel, o agente não é de aprovação.
- O `init` grava a projeção antes dos hooks e do lock, cada arquivo de forma
  atômica; o conjunto não é uma transação. Na janela entre um e outro, o hook novo
  sem projeção só não mede. A integridade final guarda o papel e a skill junto da
  foto do início, e o fim vale por eles: a projeção trocada ou removida durante o
  agente não suprime a comparação nem deixa a foto para trás. Se a foto do início
  falha, o papel fica, e o fim grava `ausente` com ele. Para quem não é de
  aprovação, o fim só roda Git se houver alguma foto pendente no git-dir.
- O `doctor` a confere contra o hash que o `init` gravou no lock e contra os
  agentes instalados (`papeis-projecao-divergente`, `CONTRATO-expx-instalacao.md`
  §5.4).
- O evento leva o `papel` do início (`CONTRATO-expx-eventos.md`): o da foto, na
  integridade final, e o do envelope, no fechamento e no abandono da chamada. A
  projeção é o estado presente, e só o evento diz qual papel valia quando o agente
  rodou.

### 11.5 A visão da invocação (F5)

O Detalhe de um trabalho ganha a seção **Orquestração**, que junta as três camadas
da seção 1 numa linha por chamada. Ela só aparece quando o rastro do trabalho tem
`invocacao_fechada`, `invocacao_abandonada` ou `integridade_final_verificada`, e
abre sozinha quando há destaque vermelho. O formato dos eventos não muda: a visão
só lê.

- **A unidade é a `invocacao`.** Cada `invocacao_fechada` ou `invocacao_abandonada`
  é uma linha. A linha avulsa do subagente, sem `invocacao`, continua com o leitor
  da 11.3, na linha do tempo, e não entra aqui.
- **Declarada e resolvida vêm do registro**, pelo `resolucao_id` da linha, com a
  mesma leitura da 11.3 (formato, arquivo regular, `lerRegistro`). Os campos de
  classe e de alternativa da própria linha não substituem o registro: o escritor
  comum os tira da projeção vigente quando grava, e entre a comparação do hook e
  essa releitura a projeção pode ter mudado. Sem `resolucao_id`, registro ilegível
  ou registro de outro agente: as duas colunas ficam vazias, e a linha leva
  **Inconsistência no rastro**.
- **Observada** é a lista `modelos_observados`, como o hook a gravou.
- **A integridade final se anexa só pela `instancia` idêntica**, comparada como
  texto inteiro: 40 e 64 caracteres não se normalizam. Nada se correlaciona por
  agente, horário, tarefa ou sessão. Integridade da mesma instância com outro agente
  ou outro papel não se anexa e é inconsistência.
- **Duplicata não se escolhe.** Duas linhas terminais para a mesma `invocacao`, duas
  integridades para a mesma instância, ou uma instância citada por duas invocações
  viram **Inconsistência no rastro**, sem mostrar nenhuma das versões.
- **Integridade sem invocação** aparece à parte, como "sem invocação na janela".
  Sem política, é só isso que a seção mostra, e nenhuma invocação é inventada. A
  linha antiga, sem `papel` nem `instancia`, entra aqui também.

Os destaques, e só eles:

| O que está gravado | Rótulo | Cor |
|---|---|---|
| `fora_da_politica: true` | Fora da política | vermelho |
| integridade anexada `divergente` ou `ausente` | Integridade final inválida | vermelho |
| `estado_invocacao: falha` | Invocação falhou | vermelho |
| resolução ausente, ilegível ou de outro agente; duplicata; par de outro agente ou papel | Inconsistência no rastro | vermelho |
| `estado_invocacao: lancada` | Só lançamento; execução não julgável | âmbar |
| `invocacao_abandonada` | Invocação abandonada | âmbar |
| aprovador (`revisar`/`testar`) concluído ou com falha, sem integridade anexada | Par não visto na janela | âmbar |
| concluída, sem `fora_da_politica`, com modelo observado que não corresponde à alternativa (ou ao `materializado`, na exceção 7.4) | Observado difere da alternativa materializada | âmbar |

**O painel não rejulga a política.** `fora_da_politica` e a integridade final são os
julgamentos dos hooks. A ausência de `fora_da_politica` não quer dizer "dentro da
política": o hook não julga sem modelo observado nem registro legível (13.2). A
única comparação da visão é a do último destaque, com a regra de correspondência da
13.2, e ela não diz se o modelo está na cadeia nem a direção de um fallback.

**A janela.** O painel lê só a cauda do rastro: no máximo 200 eventos, e os últimos
64 KiB de cada arquivo (`<id>.1.jsonl` e `<id>.jsonl`). Por isso a falta do par é
"não visto na janela", nunca "rastro incompleto". A contagem do critério da 13.5
(20 vereditos, PRs, configurações, falso positivo) não é desta visão: o
`veredito_emitido` não carrega `invocacao`, e o painel não lê o rastro inteiro.

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
não na `arvore`. Na cópia do índice, `assume-unchanged` sai de todas as
entradas e `skip-worktree` de todo arquivo presente no disco: a edição escondida
do `status` por esses bits entra na `arvore`. Num sparse checkout, o que está
fora do cone continua fora da foto.

### 12.2 Os agentes de aprovação (F4)

É de aprovação o agente com papel `revisar` ou `testar` na projeção dos papéis
(11.4); a `ferramenta` do evento é a skill da mesma linha. Até a 0.13.13, isso era
uma lista transitória por nome (`revisor-diff`, `qa` e `runx-revisor-testes`), que a
F4 substituiu. Os agentes estruturais (`auditor-plano`, `auditor-design`), sem
ferramenta de escrita nem `Bash`, também passam: decidir pelas ferramentas seria
outra inferência, e a foto a mais é redundante, não errada.

Aceita-se o nome exato, ou o nome depois de **um** prefixo literal `expx:`.
Substring, outro prefixo ou nome parecido não casam com a linha. Sem papel de
aprovação, o hook sai sem gravar nada, e sem rodar Git: a raiz é achada pela
procura do `.git`. A única exceção é o fim com alguma foto pendente no git-dir,
que pode ser de um início em que o agente era de aprovação (11.4). As variáveis locais do Git herdadas
do ambiente (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` e as demais de
`git rev-parse --local-env-vars`) são descartadas antes da foto: com elas, a foto
seria de outro repositório. A configuração passada pelo ambiente (`GIT_CONFIG*`)
fica, porque não escolhe repositório.

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
continuam válidas. O esquema também amarra o `resultado` ao `estado`, e, desde a
F4, o `papel` da linha a `revisar` ou `testar`: linha incoerente é defeito do
rastro. A tabela agente × ferramenta da 12.2 antiga saiu do esquema, que não
conhece a projeção do projeto; a linha de antes da F4, sem `papel`, continua
válida. O evento é próprio, e não `agente_concluido`, porque a
SprintX já grava `agente_concluido` para todo subagente, e o aprovador ficaria
com duas conclusões. O `SubagentStart` não grava evento.

Desde a 0.13.0, o evento leva também `instancia` quando o payload traz
`agent_id`: o hash Git de `<session_id>\n<agent_id>`, a mesma conta do fechamento
da invocação (13.2). O hook da integridade final é instalado com ou sem política,
então o campo aparece também sem `.expx/orquestracao.json`. É aditivo: o leitor do
rastro (11.3), o portão da MergeX e o MemoX não decidem nada por ele (errata da
0.13.1 ao "sem política, nada muda" da 0.13.0).

### 12.4 O que `divergente` e `ausente` invalidam, nesta fase

Divergência ou ausência **invalidam o veredito** daquele aprovador, em qualquer
regime. Nesta versão isso é registrado e mostrado, não executado:

- o evento sai `falha`, e o painel o destaca;
- o `doctor` avisa `integridade-final-invalida`, com a contagem por arquivo do
  rastro;
- a **recusa operacional** do veredito ainda não existe. O `veredito_emitido` não
  carrega `invocacao`, e recusar por nome de agente associaria aprovadores
  paralelos errado. O envelope (seção 13) já correlaciona invocação, instância e
  término; falta o veredito, que entra com a decisão de recusar.

### 12.5 Pré-condição: o rastro ignorado

O rastro (`docs/eventos/`) é ignorado pelo versionador por padrão
(`CONTRATO-expx-eventos.md`). Fora disso, cada linha que um hook grava durante
o subagente entra no `status` da foto, e a verificação dá `divergente` sem o
aprovador ter tocado em nada. O mesmo vale para arquivo do rastro que
já está versionado: a regra do `.gitignore` não alcança o que está no índice.
Com a integridade instalada, o `doctor` avisa `rastro-nao-ignorado` nos dois
casos. A comparação não exclui `docs/eventos/` por conta
própria: o que ela mede é o que o Git vê.

## 13. O envelope da invocação (0.13.0): só observa

`nucleo/hooks/expx-invocacao.mjs`, em `PreToolUse`, `PostToolUse` e
`PostToolUseFailure` do `Agent`, e em `SessionStart`. Instalado só com a política
ativa e o Claude Code no piso (13.4). **Nada é recusado nesta versão**, e por isso o
hook falha aberto: qualquer erro sai 0, sem imprimir, e o agente roda. O registro é
sem `onFailure: "block"`, que só faz sentido com a recusa.

### 13.1 O que acontece em cada chamada

1. **Antes:** agente fora da projeção do rastro (11.2), ou sem papel na projeção dos
   papéis (11.4), que dá a `ferramenta` do evento, passa sem nada. Gerenciado: grava o
   envelope, exclusivo, com a invocação (`tool_use_id`), o `resolucao_id` vigente, o
   agente, a sessão, e a skill e o papel da chamada, que valem no fechamento e no
   abandono mesmo se a projeção mudar no meio.
2. **Primeiro plano do aprovador:** o Claude Code roda `Agent` em segundo plano por
   padrão, e aí a observação só alcança o lançamento. Para o agente de papel `revisar`
   ou `testar` na projeção dos papéis (11.4), com um prefixo `expx:` opcional, o hook
   devolve `updatedInput` com todo o input e `run_in_background: false`. Não devolve
   `permissionDecision`: permissão continua com quem decidia. Até a 0.13.13 era uma
   lista por nome, dos que emitem `veredito_emitido`; desde a F4, o `auditor-design`,
   que é `revisar` e não emite veredito, também vai para o primeiro plano.
3. **Depois:** o envelope é tomado por `rename`, e quem não consegue não fecha. Sai
   `invocacao_fechada`, e só então o envelope é removido. Se o escritor não rodou, ele
   fica para a recuperação. O envelope vale mesmo se a projeção saiu no meio.

O envelope mora no git-dir de cada worktree (`git rev-parse --git-path
expx/invocacoes/v1`), com o nome em hash: na árvore, ele mudaria o `status` da
integridade final de outro aprovador. Sem Git, em `.expx/invocacoes/`.

### 13.2 O evento `invocacao_fechada`

| Chave | O que é |
|---|---|
| `invocacao` | o `tool_use_id` |
| `estado_invocacao` | `concluida` (`completed`), `lancada` (`async_launched`) ou `falha` (`PostToolUseFailure`). `falha` dá `resultado: falha` |
| `instancia` | o hash Git de `<session_id>\n<agentId>`, a mesma conta de `integridade_final_verificada`. Sozinho, o `agent_id` pode repetir entre sessões |
| `modelos_observados` | `modelsUsed`, só como lista não vazia de texto; senão `[resolvedModel]`; ausente se nada foi informado |
| `fora_da_politica` | `true` quando algum modelo não corresponde à `cadeia` do registro, ou a `materializado` na exceção 7.4 |

Só `concluida` é julgada: `lancada` prova o lançamento, não a execução. Registro
ilegível ou nada observado não julgam, e a chave fica ausente: isso nunca significa
"dentro da política". Um ID completo corresponde ao mesmo ID ou ao alias contido nele.
Fechamento sem envelope grava `sem envelope` no `detalhe`: é assim que uma falha do
hook aparece.

### 13.3 O abandono

`SessionStart` com `startup` ou `resume` começa um processo novo, então todo envelope
daquela sessão é de antes dele, mesmo com o `session_id` igual. Vira
`invocacao_abandonada`, salvo se o evento da invocação já está no rastro (fechamento
interrompido). Envelope de outra sessão só depois de um dia: ela pode estar viva.
Compactar não conta, porque a sessão continua, com agente rodando. Negação por prompt,
negação por outro hook e queda chegam aqui: sem evento terminal, o envelope fica.

### 13.4 O piso

**Claude Code 2.1.310**, por decisão do dono: é a versão em que este fluxo foi provado
ponta a ponta. Esta versão não usa `onFailure`, mas a recusa vai usar, e em 2026-11-02 a
2.1.269 e a 2.1.287 o ignoraram enquanto a 2.1.310 o respeitou; a 2.1.295, citada no
desenho, não foi medida. Abaixo do piso, o `init` instala o resto sem o envelope e
avisa, e o `doctor` acusa `claude-abaixo-do-piso`. Sem versão legível (sem `claude`, só o do
Windows no WSL, ou saída sem versão), o `init` e o `update` mantêm o envelope que o lock
anterior gerenciava, e só ele: sem esse lock, o envelope não entra. O `doctor` acusa
`claude-versao-ilegivel`, sem dizer que o envelope falta (Conselhos na 0.13.6). Com a
política ativa e sem o hook, no piso ou sem versão legível, `envelope-nao-instalado`.

### 13.5 O que falta para recusar

Decisão do dono, depois de observar uso real. Antes dela: `veredito_emitido` com
`invocacao`; `onFailure: "block"` com saída diferente de 0 em todo erro próprio, porque
JSON inválido com saída 0 passa mesmo com `block`; a prova de chamadas concorrentes na
mesma mensagem e a de `modelsUsed` sob fallback real; a sessão `claude-code@<id>` da
SprintX comparada ao `session_id` cru. As camadas 6 e 7, com o `expx resolucao`, ficam
até haver elevação por tarefa. O nível `isolado` é trabalho à parte.

**Critério para construir a recusa**, decidido pelo dono na 0.13.1: com a política ativa
em projeto real, **20 vereditos de aprovação** observados, em ao menos **5 PRs** e **3
configurações de projeto**, todos com rastro completo (`invocacao_fechada` e
`integridade_final_verificada` com a mesma `instancia`) e **nenhum falso positivo**, isto
é, nenhuma `falha` em aprovador que não tenha escrito no projeto. Vinte é limiar
operacional, sem pretensão estatística: basta para ver concorrência e variação de ambiente.
Antes disso, nada recusa. O `isolado` só se constrói depois da recusa, e o
`revisor-diff` não chega a `estrutural` tirando o `Bash`, porque a revisão precisa de
`git diff`, `git log` e `git show`.

Provas da 0.13.1, com o `claude` 2.1.310 real: duas chamadas de `Agent` na mesma mensagem
fecham com `invocacao` e `instancia` distintas, sem envelope restante; a sessão
`claude-code@<id>` da SprintX tem o mesmo id cru que entra na `instancia`. O `modelsUsed`
sob fallback real segue não exercitado, porque o fallback só ocorre sob sobrecarga, e o
payload que ele produz está coberto por teste. O hook no Windows nativo não será provado,
por decisão do dono: o trabalho é no WSL.

## 14. A sessão principal: a classe declarada (0.13.22, escopo (a))

O Claude Code não troca o modelo nem o esforço de uma sessão que já roda: `--model` e
`--effort` valem na abertura, e `/model` e `/effort` são do humano. Então a política da
sessão principal da runx e da sprintx é, na v1, só uma **declaração** no artefato do trabalho
e um **comando de abertura** derivado dela. Nada observa, avisa nem recusa.

### 14.1 A declaração

Três chaves de topo, sempre presentes no artefato que as tem, `null` sem declaração:

| Chave | Valor |
|---|---|
| `classe_sessao` | `mecanico_triagem`, `raciocinio_normal`, `profundo_excepcional` ou `null` |
| `classe_sessao_por` | quem declarou, identificador minúsculo (`^[a-z][a-z0-9_-]*$`); `null` só com a classe `null` |
| `classe_sessao_justificativa` | texto de uma linha, não vazio, só e obrigatório em `profundo_excepcional`; `null` nas outras |

- **Onde:** no `00-OCORRENCIA.md` da runx (`docs/manutencao/<pasta>/`), que o E1 grava, e no
  `00-PLANEJAMENTO.md` da sprintx (`docs/sprintx/features/<slug>/`), que só o
  `planejamento.sh criar` grava (`--classe-sessao`, `--classe-sessao-por`,
  `--classe-sessao-justificativa`, depois dos posicionais) e que toda regravação preserva. O nome
  não é `classe`: na sprintx, `classe` é o enum do bloqueio.
- **Quem:** quem chama a skill (o pedido, o orquestrador do Conselhos) ou um humano. A skill só
  grava; nunca infere do tamanho, do tipo ou do nome.
- **Imutável na v1:** declarada, não muda mais no trabalho; nova classe pede novo trabalho.

### 14.2 `expx sessao <trabalho>`

Procura o trabalho em todas as worktrees do repositório (a atual primeiro) pelos dois artefatos,
pelo `trabalho_id` do frontmatter, e imprime uma linha:

```
cd '<raiz da worktree do artefato>' && claude --model <m> [--effort <e>]
```

A raiz vai entre aspas simples POSIX (o apóstrofo vira `'\''`). A cadeia é a do projeto para a
classe (`adaptadores.claude.classes.<c>`) quando a política está ativa e a traz; senão, a da
tabela embutida (§5), como no §7; vale a primeira alternativa, e sem `effort` não há `--effort`.
Sai 0 com a linha; 1, sem linha e com o motivo no stderr, quando o trabalho não é achado, quando
há mais de um artefato com o mesmo id (`ambiguo`, com os caminhos), quando a classe é `null`
("sem classe declarada"), quando a tripla é incoerente (`declaracao invalida`) ou quando a
política é inválida. `ANTHROPIC_MODEL` e `CLAUDE_CODE_EFFORT_LEVEL` no ambiente viram aviso no
stderr: passam por cima do comando. É puro: não grava nada e não chama o `claude`. O painel
preserva as chaves e não as julga.

Limite da v1: num trabalho novo, a primeira sessão abre antes do artefato, e quem a abre é quem
declara a classe, com o modelo dela (o `expx sessao` não aceita `--classe`, para que o artefato
seja a única fonte). O comando serve às sessões seguintes: retomada, `/clear` e a sessão aberta na
worktree depois do handoff do E1 da runx, que leva a tripla quando ela foi declarada.

### 14.3 Fora da v1

A observação passiva do modelo da sessão, o aviso de sessão fora da classe, a linha no painel, o
`doctor`, o `PreModelSwitch` e cadeias próprias do principal. O H10 (§11.1) não muda: o `model`
dos eventos do principal continua sendo só o observado no evento.

## 15. Execução como subagente (0.13.22)

Os hooks do expx escolhem o repositório e o trabalho pelo `cwd` do payload (ou pelo `$PWD` do
processo do hook): no código do núcleo (`expx_raiz`), da runx, da sprintx e da mergex, pela
leitura do parecer de 2026-11-09. A bancada (`scripts/bancada-subagente-cwd.sh`; resultado em
`docs/superpowers/specs/2026-11-09-bancada-subagente-cwd.md`), com o `claude` 2.1.319 real e
`--setting-sources project`, mediu o payload, o `$PWD` do hook e o destino do escritor real do
núcleo (`expx_rastro_grava`); os hooks da runx, da sprintx e da mergex não rodaram nela:

- **Subagente comum** (`general-purpose`, sem isolamento): `git -C <worktree>` e
  `cd <worktree> && …` no Bash **não** mudam o `cwd` do payload nem o `$PWD` do hook, que ficam
  no checkout da sessão; os eventos do escritor do núcleo caem no JSONL do checkout principal. É o
  que o Conselhos mediu com os hooks reais na OC-2026-0011 (rastro em `sem-trabalho.jsonl`, push
  lido como push na `main`).
- **Subagente com `isolation: "worktree"`**: `SubagentStart`, `PreToolUse`, `PostToolUse` e
  `SubagentStop` recebem como `cwd` a worktree que o Claude Code cria para ele
  (`.claude/worktrees/agent-<id>`, branch `worktree-agent-<id>`, a partir do `HEAD`), o `$PWD` do
  hook é o mesmo, e os eventos do escritor do núcleo caem no JSONL dessa worktree. O `tool_response.agentId` do
  `PostToolUse` do `Agent` é o `agent_id` do `SubagentStart`.

Regra: **a runx e a sprintx não rodam como subagente comum quando a worktree do trabalho é
diferente do `cwd` da sessão.** A sessão abre na worktree, com o comando do `expx sessao`
(§14.2). O modo `isolation: "worktree"` tem só a **compatibilidade de `cwd` medida**; ele não é
suportado: o E0 da mergex só adota a árvore quando a branch ativa já é a do trabalho, e a
`worktree-agent-<id>` não é; e o fluxo E0–E5 nesse modo, a integridade e o OpenCode não foram
provados. Suportá-lo pede mudança no E0 da mergex (criar a branch do trabalho na mesma árvore,
sem trocar de árvore) e uma prova do fluxo inteiro.
