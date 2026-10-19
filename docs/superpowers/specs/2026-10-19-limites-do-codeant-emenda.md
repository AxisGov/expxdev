# Emenda 2026-10-19: limites do CodeAnt, fixos

Data: 2026-10-19. Emenda o desenho `2026-10-18-revisao-por-task-pr-por-sprint-design.md` (aprovado). Repositórios: AxisGov/expxdev, AxisGov/mergex, AxisGov/sprintx; vale também para os demais repositórios do método (buildx) e para os projetos.
Estado de partida: expxdev f95d7cd, mergex 1310f4c, sprintx e1f88c9.
Estado: **decisões fechadas, aguardando a aprovação do texto**. Nada se implementa antes dela; o contrato `expx-fatiamento` v3, o código e o plano vêm depois.
Ajustada em 2026-10-19 aos testes de conformidade da CLI 0.5.14 (AxisGov/expxdev#60, `fixtures/conformidade/codeant-cli-0.5.14/`), com decisão do usuário: o método **espelha exatamente a CLI** (o que ela revisa, como conta linhas e bytes, e como falha).

Onde esta emenda e o desenho divergem, vale a emenda. Todas as decisões aqui são do usuário (2026-10-19, depois de dois pareceres do Codex); onde o autor do texto e o Codex divergiram, o usuário ficou com o Codex.

## 1. Por que

O desenho de 2026-10-18 manteve o fatiamento em duas naturezas: **capacidade** do revisor (100 arquivos por PR, 5.000 linhas por arquivo) e **legibilidade** "nossa" (400 linhas e 20 arquivos por PR, 300 linhas por commit), calibrável por projeto, com `justificativa` e só afrouxável com revisão por task obrigatória (4.1). Isso trouxe uma seção de configuração, uma regra de afrouxamento, quatorze variáveis `FATIA_*` e o espelho delas na mergex.

A legibilidade não tem motivo para ser calibrável: os números que importam são os do revisor, e eles são fixos. Ao mesmo tempo, o levantamento do código da CLI mostrou que o desenho usava números errados (10 arquivos por revisão, sem limite em bytes) e que um arquivo grande demais é **pulado**, não revisado: sem achado, a task fecharia verde sem revisão.

A emenda troca o "fatiamento calibrável" por **limites do CodeAnt, fixos**, presos à versão da CLI e ao comportamento observado do app.

## 2. Fatos, com fonte

| Fato | Fonte |
|---|---|
| A CLI revisa no máximo **40 arquivos** por revisão (`MAX_REVIEW_FILES = 40`) | `src/utils/reviewApiHelper.js` (:6-8) do pacote npm [`codeant-cli@0.5.14`](https://registry.npmjs.org/codeant-cli/-/codeant-cli-0.5.14.tgz), publicado em 2026-10-15, integridade `sha512-LNg2uf76Qq4b11vZuxtL0ULTs6UPcGHlRxvFoiADXywLxqtYoBnHszyaNQmY1v9niZW/zzPwqMgNTn3ltuNnzw==`, `gitHead` 475f979. A `main` do [repositório](https://github.com/CodeAnt-AI/codeant-cli) pode mostrar outra versão no `package.json`: a fonte é o pacote. O [PR #52](https://github.com/CodeAnt-AI/codeant-cli/pull/52) subiu de 15 para 40; o spike 6.0 do desenho viu `max_files` 15 na 0.5.1 e 40 na 0.5.14 |
| Arquivo acima de **5.000 linhas** (`MAX_FILE_LINES`) ou de **200 KB = 204.800 bytes** (`MAX_FILE_SIZE_BYTES = 200 * 1024`) é **pulado**, com o motivo `too large (<n> lines, max 5000)` ou `too large (<n> KB, max 200 KB)` | mesmo arquivo, :124-131 e :207-215 |
| **Bytes** são `Buffer.byteLength(conteúdo, 'utf-8')` do conteúdo no head. O texto do motivo arredonda (`toFixed(0)` de KB): 204.801 B aparece como `too large (200 KB, max 200 KB)` | mesmo arquivo, :206-209; caso `pulos` da #60 |
| **Linhas** são `conteúdo.split('\n').length`, isto é, quebras de linha + 1. Arquivo terminado em quebra com `wc -l` = 5.000 conta 5.001 e é pulado (`too large (5001 lines, max 5000)`); com 5.000 linhas sem quebra final, conta 5.000 e é revisado | mesmo arquivo, :212-215; casos `limite40` e `pulos` da #60 |
| Não contam para os 40, e são pulados com `binary/generated`, os arquivos cujo nome é um de `EXCLUDED_FILENAMES` (:10-22: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `Pipfile.lock`, `go.sum`, `.DS_Store`, `Thumbs.db`), cuja extensão é uma de `EXCLUDED_EXTENSIONS` (:24-45: imagens, fontes, binários e compilados, arquivos compactados, mídia, `.map`, `.pb`, `.bin`, documentos de escritório `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, dados `.csv`, `.tsv`, `.parquet`, `.avro`, `.ndjson`, banco `.sqlite`, `.db`) ou que terminam em `.min.js` ou `.min.css` (:68). A comparação é a de `isReviewableFile` (:59-71): nome exato do `basename`, extensão por `path.extname` em minúsculas. **Markdown (`.md`) não está na lista: é revisado** e conta para os 40 e para L2 | mesmo arquivo; caso `pulos` da #60 (`notas.md` revisado, `.pdf` pulado) |
| Também não contam: arquivo deletado (`deleted`) e o que casa `--exclude` ou fica fora de `--include` (`excluded by pattern`). No modo `--base-commit` e `--uncommitted` a ordem dos filtros é `binary/generated`, `deleted`, `excluded by pattern`, bytes, linhas e, por último, o corte de 40 (`exceeded 40-file limit`), na ordem do diff | mesmo arquivo, :163-234; casos `limite41`, `pulos` e `pulos-uncommitted` da #60 |
| O JSON do `--headless` tem no topo `issues`, `meta`, `error` e `noFiles`. O pacote monta `_meta` (:148, :257), e o `--headless` o devolve como `meta` (`src/reviewHeadless.js:116`, :124, :237): **`meta.max_files`** (número, 40), `meta.reviewed_files` (lista), `meta.total_changed` (número), `meta.skipped` (lista de `{file, reason}`) e `meta.capped` (booleano). `_meta` não aparece na saída | #60, todos os casos |
| Sem arquivo revisável, a CLI não chama a API e devolve `noFiles: true` (com `meta` preenchido). O exit é 0 com arquivos pulados ou cortados, e 1 só quando `error` não é nulo. `--base-commit` e `--uncommitted` filtram e respondem igual | `src/reviewHeadless.js:122-124`, :237-241; caso `pulos-uncommitted` da #60 |
| **Falha de lote não aparece no JSON.** A revisão vai em lotes de até 5 arquivos; um lote que falha na API só sai no stderr (`[error] Failed to review <arquivos>: <mensagem>`), os arquivos dele continuam em `meta.reviewed_files`, `error` fica nulo e o exit é 0. "Revisado" no JSON quer dizer só **enviado** | `src/reviewHeadless.js:148-168`; LEIAME da #60, item 4 |
| A documentação pública ainda diz 10 arquivos: está desatualizada | [docs.codeant.ai/cli/review](https://docs.codeant.ai/cli/review) |
| `--last-n-commits` aceita no máximo 5 commits; `--base-commit <sha>` revisa tudo desde um commit | [docs.codeant.ai/cli/review](https://docs.codeant.ai/cli/review) |
| O app do GitHub não revisa PR com **mais de 100 arquivos**: responde "Skipping CodeAnt AI review — this PR changes more than 100 files"; dá para forçar com `@codeant-ai : review`, mas o sinal é pior | observado na AxisGov/mergex#15 (177 arquivos) |
| As **exclusões do painel não descontam** dos 100: o app conta todos os arquivos alterados | teste em [katosmv/login#7](https://github.com/katosmv/login/pull/7) (fechado sem merge): 101 arquivos `.js`, 5 em `docs/sprintx/teste-capacidade-codeant/`, pasta excluída no painel da org; o app respondeu "Skipping CodeAnt AI review — this PR changes more than 100 files" |
| O CodeAnt não tem limite de linhas por PR nem por commit | nenhum no código da CLI nem na documentação; a #26 da sprintx (61 arquivos, +19 mil linhas) foi revisada |

Isto corrige o item da CLI na seção 3 do desenho ("10 arquivos únicos e 5.000 linhas"), a suposição da 4.1 de que o painel desconta dos 100 (`capacidade.excluido_no_painel`) e a tabela do contrato `expx-fatiamento` v2 (:21 e :25, que diz que o limite de ~200 KB "não consta").

## 3. As regras novas

Fixas. Nenhum projeto as calibra, nem para afrouxar nem para apertar. Valem iguais nos repositórios do método (expxdev, sprintx, mergex, buildx) e nos projetos.

- **L1 — task:** no máximo **40 arquivos revisáveis**. Revisável é o arquivo da task que a CLI revisaria: presente (não deletado), fora da lista exata de exclusões da CLI (nomes e extensões de `reviewApiHelper.js` do pacote 0.5.14, 2) e fora de `excluir_da_revisao` (5). Markdown e qualquer outro texto fora da lista são revisáveis. A conta é feita antes do corte da CLI.
- **L2 — arquivo:** cada arquivo revisável da task tem no máximo **5.000 linhas** e **204.800 bytes**, inteiro, **no estado depois da task** (não o diff, nem o estado anterior), medidos **como a CLI mede** (2): linhas = `conteúdo.split('\n').length` (quebras de linha + 1) e bytes = `Buffer.byteLength(conteúdo, 'utf-8')`. Exemplo: arquivo de 5.000 linhas terminado em quebra (`wc -l` = 5.000) tem 5.001 pela conta e **passa de L2**; com quebra final, o máximo é `wc -l` = 4.999. No shell, linhas = `wc -l` + 1. Nunca se lê o tamanho do texto do motivo da CLI, que arredonda. O verificador e o núcleo medem igual. **Não há exceção a L2 para arquivo nenhum.**
- **L3 — PR:** no máximo **100 arquivos alterados**, contando **todos**, como o `changed_files` do GitHub: código, artefatos de método (`docs/sprintx/`, `docs/entregas/`, `docs/eventos/`), gerados, lock e o que o painel exclui (2).
- **Sem limite de linhas** por PR, por commit ou por task.

"Revisável" é **um predicado só**, no núcleo, usado pela revisão por task, pelo verificador e pelos testes. As exclusões da CLI que ele reproduz são a lista exata do pacote homologado (`EXCLUDED_FILENAMES`, `EXCLUDED_EXTENSIONS` e os sufixos `.min.js`/`.min.css`, com a comparação de `isReviewableFile`; 2), guardada no perfil da versão (6) e conferida pelos testes de conformidade, não por suposição. Ele **não** exclui documentação nem Markdown por serem texto: o que o método tira da revisão por task sai só por `excluir_da_revisao` (5).

**Dois portões na task**, os dois obrigatórios:
1. **Cobertura completa:** o conjunto de arquivos revisáveis da task é igual ao conjunto revisado pela CLI mais os pulados por motivo aceito no perfil, sem faltante, sem sobra e sem repetido. Arquivo pulado por tamanho, cortado, com erro ou ausente da resposta é **revisão incompleta**, e a task **não fecha**: em arquivo pulado não há achado porque não houve revisão, e "sem achado" não pode valer como aprovação. Como `meta.reviewed_files` diz só que o arquivo foi enviado (2), o portão lê também o **stderr** da CLI: qualquer linha `[error] Failed to review ...` torna a revisão `incompleta:lote-falhou`, mesmo com `error` nulo e exit 0.
2. **Zero achado aberto** em linha alterada pela task (como em 4.2).

A saída de L1 ou L2 é tornar a mudança revisável. Mais de 40 arquivos: dividir a task. Arquivo acima de L2: uma task anterior o divide. Isso não é circular: L2 mede o estado **depois** da task, e a task que divide deixa o original e as partes abaixo do limite, todos revisáveis. Só não cabe numa task a divisão que precisa de mais de 40 arquivos; essa se faz em várias tasks, cada uma deixando o que tocou abaixo do limite.

**PR acima de 100 arquivos bloqueia e se divide.** O E7 não abre o PR e ninguém força a revisão com `@codeant-ai : review`. Com `entrega: por_sprint`, a sprint que passa de 100 arquivos se divide no plano da sprint (F3); com `por_trabalho`, o trabalho se divide em trabalhos. A única PR que passa de 100 é a de planejamento, que só tem artefatos de método e nunca é revisada pelo app (7).

## 4. O que sai

- F2 (400 linhas e 20 arquivos por PR) e F3 (300 linhas por commit) do contrato `expx-fatiamento`.
- F4 como está hoje (150 KB e 4.000 linhas, aviso em 100 KB e 3.000 linhas, tolerância de 2 KB e 20 linhas por PR). L2 a substitui, sem tolerância: arquivo acima do limite não é revisado.
- F2c como estava (100 arquivos **visíveis ao revisor**, descontado o painel): L3 conta todos.
- A natureza "legibilidade" e a tabela "Capacidade × legibilidade" do contrato.
- Em `.expx/fatiamento.json`: `legibilidade`, `arquivo`, `justificativa`, `capacidade` (com `excluido_no_painel`) e a regra "afrouxar exige revisão por task obrigatória".
- **Todas** as variáveis de ambiente `FATIA_*`: `FATIA_MAX_LINHAS_PR`, `FATIA_MAX_ARQUIVOS`, `FATIA_MAX_LINHAS_COMMIT`, `FATIA_MAX_KB_ARQUIVO`, `FATIA_AVISO_KB`, `FATIA_TOLERANCIA_B`, `FATIA_MAX_LINHAS_ARQUIVO`, `FATIA_AVISO_LINHAS`, `FATIA_TOLERANCIA_LINHAS`, `FATIA_IGNORAR`, `FATIA_IGNORAR_PROJETO`, `FATIA_CAPACIDADE_ARQUIVOS`, `FATIA_CAPACIDADE_EXCLUIDO`, `FATIA_EXCECAO`. Nenhum limite nem exclusão vem do ambiente.
- Com `FATIA_EXCECAO`, a exceção de **movimento mecânico** (F6): ela só rebaixava F2 e F3, que saem. As exceções de artefato gerado e de artefato de método ficam como exclusões **da revisão por task** (5); na conta de L3 dos PRs de sprint não há exceção (o planejamento vai num PR próprio, 7).
- A revisão **em lotes** (4.2 e 6.0 do desenho): task com mais de 40 arquivos revisáveis se divide, não se revisa em pedaços.
- No desenho: o O3 ("limites calibráveis por projeto"), o anti-objetivo "limite relaxado sem revisão por task", a 4.1 ("Capacidade", "Legibilidade", "Afrouxamento", "Duas medidas no E7") e a seção 5 (calibragem do conselho). Ficam da 4.1: o arquivo do projeto, o leitor único no núcleo, o caminho fixo dele e o erro quando o arquivo existe e o leitor não.

**Nomes `FATIA_*` reservados para sempre:** toda peça que lia `FATIA_*` (leitor, verificador, `fatiamento-da-pr.sh`, `leitor-do-projeto.sh`, revisão por task, doctor) **falha** se qualquer variável com esse prefixo estiver definida no ambiente, com a mensagem "`FATIA_<nome>` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente". Não é transição: a conferência fica, para que quem pular uma versão nunca tenha a variável ignorada em silêncio.

## 5. `.expx/fatiamento.json` depois da emenda

```json
{
  "expx_fatiamento": 2,
  "revisao_por_task": { "modo": "obrigatoria" },
  "entrega": "por_sprint",
  "merge_automatico": { "ativo": true, "caminhos_protegidos": ["^src/pagamentos/"] },
  "revisor_bot": ["codeant-ai[bot]"],
  "excluir_da_revisao": [
    { "padrao": "^fixtures/candidatos/", "classe": "copia", "origem": "scripts/atualizar-candidatos.sh", "motivo": "cópia das skills candidatas, revisada no repositório de origem" }
  ]
}
```

- Ficam como estão: `revisao_por_task.modo`, `entrega`, `merge_automatico` (com `caminhos_protegidos`) e `revisor_bot`.
- `excluir_da_revisao` substitui `ignorar`. Serve só para **classes de artefato**, nunca para código-fonte. O que o arquivo lista **soma** ao padrão do núcleo (os artefatos de método, `^docs/(sprintx|entregas|eventos)/`), que não se declara. Arquivo que casa não vai para a CLI na revisão por task e fica fora de L1 e L2; não muda L3. O método aplica o padrão antes de montar o `--include`, então a sintaxe glob do `--exclude` da CLI não entra. Validação de cada item, toda obrigatória:
  1. **Forma:** objeto com exatamente `padrao`, `classe`, `origem` e `motivo`.
  2. **`padrao` é um diretório literal:** `^`, um ou mais segmentos e `/` no fim, sem metacaractere de regex (só `\.` escapado). Não há padrão por extensão, por nome de arquivo nem com alternativa: cada exclusão é uma pasta inteira, à vista.
  3. **`classe`** é `gerado` (produzido por script: snapshot, fixture regenerada) ou `copia` (cópia versionada de outro repositório, revisada lá).
  4. **`origem`** não vazia: o comando que gera a pasta (`gerado`) ou o repositório de onde ela vem (`copia`). **`motivo`** não vazio.
  5. **Nunca código-fonte:** o primeiro segmento não pode ser uma raiz de código (`src`, `lib`, `app`, `apps`, `packages`, `pkg`, `cmd`, `internal`, `server`, `client`, `web`, `api`, `test`, `tests`, `spec`, `scripts`, `.github`, `.claude`, `.opencode`, `.expx`), salvo com mais de um segmento e um deles chamado `fixtures`, `snapshots`, `__snapshots__`, `generated` ou `gerado` (`^scripts/ci/fixtures/candidatos/` passa; `^src/` e `^scripts/` não).
  6. **O que a task escreve é revisado:** arquivo declarado em `cria` ou `altera` de uma task que casa um item da lista torna a revisão `incompleta` (`incompleta:excluido-declarado`). Regenerar um artefato gerado é commit próprio, fora das tasks, como na F6 do contrato.

  Como `.expx/fatiamento.json` é caminho sempre protegido no merge automático, ampliar a lista nunca entra sem o desenvolvedor.
- `capacidade.excluido_no_painel` sai (7).
- Chave removida (`legibilidade`, `arquivo`, `justificativa`, `capacidade`, `ignorar`) é **inválida** com mensagem própria: "`<chave>`: removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a" (para `ignorar`: "substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato"). Não é a "chave desconhecida" genérica, e nunca é ignorada.
- **`expx_fatiamento: 2`.** O formato muda (chaves removidas, chave nova, sentido novo da exclusão), então a versão sobe: o leitor antigo recusa o formato novo de forma determinística ("versão desconhecida"), e o leitor novo recusa a versão 1 com a mensagem "versão 1: migre para 2 (emenda de 2026-10-19)", seguida da lista das chaves removidas que o arquivo ainda tem.

## 6. Os números presos à versão da CLI

- **Dois perfis versionados** no núcleo, separados porque têm donos diferentes: o da CLI, `codeant-cli@0.5.14 = 40 / 5000 / 204800`, com a conta de linhas e de bytes, a lista exata de exclusões e os motivos de pulo dessa versão (2), e o do app, `100 arquivos, todos contados` (2). O perfil é a **fonte canônica**; as cópias (constantes do verificador, espelho na mergex, texto da sprintx e dos contratos) são conferidas contra ele por teste.
- **Versão da CLI:** só versão da **lista exata de homologadas** é aceita, hoje só 0.5.14; nunca "≥". Cada versão homologada registra o pacote npm, a integridade (`dist.integrity`) e o `gitHead`. Isso substitui a orientação `npm i -g codeant-cli@latest` do contrato `expx-revisao`. Outra versão: `indisponivel:versao`, com a orientação de instalar a homologada (`npm i -g codeant-cli@0.5.14`) ou homologar a nova; o agente não instala nada.
- **Asserção, nunca adaptação:** a revisão confere no JSON da CLI o **`meta.max_files`** (tem de ser 40; fixado pela #60: `meta`, não `_meta`, 2), a forma de `meta` (`reviewed_files`, `total_changed`, `skipped[{file, reason}]`, `capped`) e a lista de pulados. Os motivos aceitos são os textos exatos do perfil: `binary/generated`, `deleted`, `excluded by pattern`, `too large (<n> KB, max 200 KB)`, `too large (<n> lines, max 5000)` e `exceeded 40-file limit`. Campo ausente, tipo errado, `max_files` diferente ou motivo de pulo fora da lista do perfil: revisão incompleta (`incompleta:perfil`). Linha `[error] Failed to review ...` no stderr: `incompleta:lote-falhou` (3). Nunca muda limite em silêncio, e nunca se tira número do texto do motivo.
- **Mesmo estado medido e revisado:** a evidência guarda, de cada arquivo, o caminho, o blob, os bytes e as linhas, medidos como a CLI mede (L2, 3); o blob é conferido antes e depois da chamada (como já faz o `revisar`), e o conjunto que a CLI devolve é reconciliado com o da task (3).
- **Testes de conformidade** nas bordas, **feitos** com a 0.5.14 (#60): 40 e 41 arquivos, 5.000 linhas sem quebra final e com quebra final, 5.001 linhas, 204.800 e 204.801 bytes; lock, binário, `.pdf`, `.md`, arquivo deletado, exclusão explícita, e os modos `--base-commit` e `--uncommitted`. Precisam da CLI e do login, então quem os roda é o desenvolvedor, ao homologar uma versão, com o `conformidade.sh` da pasta. Os artefatos ficam em **`fixtures/conformidade/codeant-cli-<versão>/`** do expxdev (`LEIAME.md`, o script e o stdout da CLI byte a byte), e nunca em `nucleo/`, porque o `montarPlugin` copia `nucleo/` para os projetos. A suíte testa a revisão contra esses JSONs com uma CLI falsa. Eles fixaram o caminho dos metadados, os textos de motivo, a ordem dos filtros, o predicado de revisável e a conta de linhas e de bytes (2).
- **Comando:** na F6 continua `--uncommitted --include <arquivos da task>` (a task é revisada antes do commit). Revisão de mudança já commitada usa `--base-commit <SHA inicial da task>`, nunca `--last-n-commits` (máximo 5).

## 7. As exclusões do painel e o PR de planejamento

O desenho supôs que o app aplica as exclusões do painel antes de contar os 100 arquivos. O teste em [katosmv/login#7](https://github.com/katosmv/login/pull/7) mostrou que não: com 101 arquivos `.js`, 5 deles numa pasta excluída no painel, o app pulou a revisão por passar de 100.

Consequências:
- L3 conta todos os arquivos alterados do PR (`changed_files`), sem desconto.
- `capacidade.excluido_no_painel` e o desconto saem do leitor, do verificador (`FATIA_CAPACIDADE_EXCLUIDO`), do `leitor-do-projeto.sh` e do E7.
- O painel continua útil para o que ele faz: tirar arquivos da **revisão** do app (gerados, artefatos de método). Só não muda a conta dos 100.
- Os artefatos de método consomem a cota de 100. O planejamento de uma feature real passa de 250 arquivos (contrato v2, F6), então ele sai dos PRs de sprint.

### O PR de planejamento

*Decisão do usuário, 2026-10-19.* Vale em `por_sprint` e em `por_trabalho`.

- **O que leva:** só os artefatos de método do planejamento (sprintx F1–F5): tudo sob `^docs/(sprintx|entregas|eventos)/`. Qualquer arquivo fora disso, código ou não, faz o PR ser **recusado**: ele não abre, e o motivo é dito.
- **Quando abre:** no fim da F5, com o plano aprovado, antes da execução da primeira sprint. A sprintx aciona a mergex para ele como a primeira entrega do trabalho.
- **Merge do usuário, sempre:** nunca tem merge automático, mesmo com `merge_automatico.ativo`. A F6 só executa a primeira sprint depois do merge dele, com a branch atualizada a partir da main (como entre sprints, 4.3 do desenho).
- **L3 não vale para ele.** Se passar de 100 arquivos, o app pula a revisão, e isso é aceito: esses caminhos já ficam fora da revisão por desenho (excluídos no painel, conferidos pelos portões das skills).
- **Os PRs de sprint** levam só o código e os poucos artefatos que a sprint atualiza (progresso em `docs/sprintx/`, eventos, `ENTREGA.md`), e contam **tudo** nos 100.

## 8. O que muda em cada peça

### expxdev

- **Leitor** (`nucleo/scripts/expx-fatiamento.mjs`): saem `LEGIBILIDADE`, `ARQUIVO`, `TETOS` e `CAP_ARQUIVOS` (:8-11), `limites()` (:56-68), `capacidade` e `EXCLUIDO_PADRAO` (:12, :175-176, :199), a `justificativa` e o afrouxamento (:189-198); as chaves `justificativa`, `legibilidade`, `arquivo`, `capacidade` e `ignorar` saem de `CHAVES` (:15) e passam a dar o erro de chave removida. Sai da saída env tudo o que é `FATIA_*` (:222-229). A versão aceita passa a ser 2, e a 1 dá a mensagem de migração (5). Entram os perfis (6), `excluir_da_revisao` com a validação da seção 5 e a falha permanente das `FATIA_*` (4). Ficam `EXPX_*` e o resto da validação.
- **Revisão por task** (`nucleo/scripts/expx-revisao.mjs`):
  - `VERSAO_MINIMA` (:15) e as comparações (:132-139, :215-217) viram a lista exata de versões homologadas (6).
  - Antes de chamar a CLI, aplica o predicado de revisável e mede L1 e L2 (com `excluir_da_revisao` lido do leitor irmão, nunca do ambiente). Acima, ou arquivo declarado pela task que casa `excluir_da_revisao`: `incompleta`, sem chamar a CLI.
  - Saem os lotes (:146-151): uma chamada só; `meta.max_files` ≠ 40 é `incompleta:perfil`. A chamada guarda o stderr, e linha `[error] Failed to review ...` é `incompleta:lote-falhou` (3), qualquer que seja o JSON.
  - O pulo por padrão (`porPadrao`, :153-161, que hoje aceita qualquer motivo com "pattern") vira a lista de motivos do perfil, e a conta de revisados (:159-161) vira a reconciliação de conjuntos (3). A regra de que arquivo da task pulado fora de padrão é incompleto já existe (:158); a emenda a torna um portão próprio, com motivo, e a leva ao `conferir`.
  - `incompleta` passa a ser um **resultado**, separado de `indisponivel` (decidido, 2026-10-19): falta de CLI depende do modo; mudança que a CLI não cobre, não. O `conferir` dá FALHA para `incompleta` em `obrigatoria` e em `se_disponivel`, e reprova evidência `ok` com `max_files` ≠ perfil ou com pulo fora da lista (:215-227, :230-252). A precedência entre os resultados e os códigos de saída ficam no contrato `expx-revisao` v2.
- **Verificador** (`scripts/verificar-fatiamento.sh`): saem F2 (:117-123), F3 (:139-174), a tolerância e os avisos de F4 (:176-226), a exclusão de F2c (:127) e todas as variáveis (:13-21, :31-57). Ficam duas medidas, com os números dos perfis como constantes conferidas por teste: **L3** (todos os arquivos alterados, a medida de :125-130 sem exclusão) e **L2** (arquivo alterado ou criado que passa no predicado de revisável, com no máximo 5.000 linhas e 204.800 bytes no head, pela conta da CLI: `wc -l` + 1 e bytes do conteúdo; 3). As exclusões da revisão chegam por argumento, que quem chama tira do leitor do commit medido, nunca do ambiente. L1 não se mede na PR, porque a PR não conhece a task. O `ci.yml` (:81) passa a exclusão do próprio repositório (`fixtures/candidatos/`).
- **doctor** (`src/doctor/verificadores.ts:505-525`): continua validando pelo leitor do pacote; a mensagem de chave removida chega pelo stderr. Ganha um **erro** para `FATIA_*` no ambiente (4) e o erro de migração de `expx_fatiamento: 1` (5).

### Contratos

- **`CONTRATO-expx-fatiamento.md` v3:** a tabela de fatos com as fontes da seção 2; o PR de planejamento (7); L1, L2 e L3 no lugar de F2, F2c, F3 e F4; o predicado de revisável e os dois portões; F1, F5 (item 1 passa a dizer "dentro de L3") e F6 ficam, sem o movimento mecânico; "Capacidade × legibilidade" sai; "Configuração por projeto", "Entrega por sprint" (:184-189, que ainda fala de PRs empilhadas, superadas na 4.3 do desenho), "Como consumir o leitor" e "Como verificar" (:208-222) são reescritas sem `FATIA_*`; o texto do painel (F2c, :77-85, e F6, :139-158) passa a dizer que a exclusão tira da revisão do app, não da conta dos 100; histórico.
- **`CONTRATO-expx-instalacao.md` §5.2** (:166-199): o exemplo, a versão 2, a validação de `excluir_da_revisao` e as regras da seção 5 desta emenda.
- **`CONTRATO-expx-revisao.md` v2:** a lista exata de versões homologadas no lugar da mínima e do `@latest` (:15-17); sem lotes (:77-78); o resultado `incompleta`, os motivos dele e a reconciliação (:89-97); os dois portões; a tabela do `conferir` (:109-118); os perfis e os testes de conformidade.
- `nucleo/README.md` (:56) e `CONVENCOES.md` (:160) acompanham.

### mergex

- **`fatiamento-da-pr.sh`:** volta a ser o espelho byte a byte do verificador novo; o cabeçalho (`Origem`, `Corpo-sha256`, :13-14) e a lista de variáveis (:22-30) mudam.
- **E7, Passo 1.5** (`references/07-abertura-pr.md`): o bloco perde `FATIA_IGNORAR` e `FATIA_EXCECAO` (:117-119) e passa a exclusão por argumento; o texto sobre limites calibrados e `FATIA_CAPACIDADE_EXCLUIDO` (:130-139) e sobre a exceção declarada (:156-159) sai; "Quando falha" (:320-322) cita L2 e L3.
- **`leitor-do-projeto.sh`:** a saída padrão (:60-68) perde `FATIA_CAPACIDADE_EXCLUIDO`; a lista de chaves exigidas do leitor (:102-105) perde as `FATIA_*` e ganha as novas. Fica a saída 3 quando o commit versiona um leitor diferente do instalado (:76-77).
- **Cópia do núcleo** (`scripts/ci/fixtures/candidatos/expx-nucleo/`, hoje de expxdev 8653468): regerada a partir do commit do expxdev que trouxer a emenda.
- **Testes:** `test-fatiamento-e7.sh` e `test-leitor-do-projeto.sh` trocam os casos de `FATIA_*` pelos de L2 e L3.
- **PR de planejamento (7):**
  - **E0:** aceita a entrega de planejamento (`--planejamento`, no lugar de `--sprint`) e a registra em `prs` como o primeiro item, `{sprint: planejamento, …}`; o PR da primeira sprint só abre com ele `merged`.
  - **E2:** as verificações de task ficam `n/a` (nenhuma task foi executada); entra a conferência de que todo arquivo do diff casa `^docs/(sprintx|entregas|eventos)/`.
  - **E7:** confere de novo os caminhos antes de abrir; arquivo fora dos artefatos de método faz o E7 recusar (não abre, com a lista dos arquivos). L3 não se mede nele; L2 não se aplica, porque nada nele é revisável (tudo casa o padrão do núcleo de `excluir_da_revisao`, 5; não por ser Markdown, que a CLI revisa).
  - **E9:** nunca faz merge automático dele, com qualquer configuração; o merge é do desenvolvedor. A revisão pulada pelo app (> 100) não conta como pendência.
- Já decidido, e só registrado: no merge automático (M1/M2) e na D3, o leitor do núcleo é executado da árvore da main; no E7, roda o instalado e sai 3 se o commit versiona um leitor diferente.

### sprintx

- **F3** (`references/03-plano.md:73`): a regra de tamanho deixa de ser 300 linhas por commit e 400/20 por PR. Passa a ser: cada task com no máximo 40 arquivos revisáveis declarados (L1); nenhuma task deixa arquivo revisável acima de 5.000 linhas ou 204.800 bytes, e uma task anterior divide o que já passa (L2); a sprint (`por_sprint`) ou o trabalho (`por_trabalho`) com no máximo 100 arquivos, **somando os poucos artefatos de método** que o PR da sprint leva (L3); o planejamento vai no PR próprio (7) e não entra nessa conta. A sprint que passa de 100 se divide no plano da sprint.
- **Auditor** (`.claude/agents/auditor-plano.md:44` e `:91-94`, e a cópia em `.opencode/agent/`): o item 10 cita L1, L2 e L3, com os números do leitor; a linha MÉDIA do movimento mecânico sai.
- **F5 e F6, PR de planejamento (7):** no fim da F5, com o plano aprovado, a sprintx aciona a mergex (E0–E8) com `--planejamento`, só com os artefatos do planejamento, e registra o bloqueio `aguardando_merge` até o desenvolvedor mergear. A F6 só executa a primeira sprint depois desse merge, com a branch atualizada a partir da main. Nada de código entra antes disso.
- **F6** (`references/06-execucao.md:123`): o passo de revisão por task, ainda a construir, nasce com os dois portões. A task com revisão `incompleta` vira bloqueio da classe `revisao_incompleta` (decidido, 2026-10-19), com a rota pelo motivo: L1, dividir a task; L2, task anterior que divide o arquivo; `excluido-declarado`, tirar o arquivo da lista ou da task; `perfil`, instalar a versão homologada ou homologar a nova; `lote-falhou`, revisar de novo a task inteira; pulo desconhecido ou faltante, diagnóstico. Nunca contestação.

## 9. Transição dos projetos que já têm `.expx/fatiamento.json`

O que o repositório mostra: o desenho (seção 5) e o contrato de instalação (§5.2) trazem a calibragem do conselho como exemplo (`legibilidade` 2500/80/300, `justificativa`), e a ordem de entrega do desenho deixa a adoção pelo conselho para o fim (7, passo 6). Se o conselho ou o login já versionam o arquivo não está aqui (os projetos não foram lidos); o inventário é o passo 0 da seção 11. A transição cobre os dois casos:

- **Sem o arquivo:** nada a mudar no projeto. Depois da atualização, o E7 mede L2 e L3 no lugar de F2, F2c, F3 e F4, e o trabalho seguinte começa pelo PR de planejamento (7).
- **Com o arquivo:** `expx_fatiamento: 1` é recusado com a mensagem de migração, que lista as chaves removidas que ele ainda tem (`legibilidade`, `arquivo`, `justificativa`, `capacidade`, `ignorar`). O `doctor` dá `fatiamento-invalido` e o E7 sai 2 sem abrir o PR. Nunca vale como padrão. A correção é passar a 2 e apagar as chaves, numa PR do projeto; `.expx/fatiamento.json` é caminho sempre protegido no merge automático, então essa PR espera o desenvolvedor.
- **Com `ignorar`:** cada padrão que deve mesmo ficar fora da revisão por task vira um item de `excluir_da_revisao` (pasta literal, classe, origem e motivo); padrão sobre código-fonte não tem equivalente e sai.
- **Com `FATIA_*` no ambiente** (no shell ou no CI do projeto): falha clara, sempre (4).
- **Ordem:** o projeto só atualiza quando a versão liberada trouxer o núcleo novo **e** a mergex e a sprintx que o leem. Núcleo novo com mergex antiga não passa calado: o `leitor-do-projeto.sh` antigo exige as `FATIA_*` (:102-105) e sai 3 ("atualize o expx"). Voltar atrás é voltar à versão liberada anterior, inteira; nenhuma combinação mista é suportada.

## 10. O que fica obsoleto nos planos da mergex

Os blocos A1 e A2 já foram mergeados (mergex #32, #33 e #34). O que eles construíram com `FATIA_*` muda na PR da mergex desta emenda (seção 8), não reabrindo as tasks.

Parte 1 (`docs/superpowers/plans/2026-10-18-mergex-revisao-por-task-e-merge-automatico.md`):
- Goal (:6): "mede o PR com os limites de `.expx/fatiamento.json`" vira "mede L2 e L3".
- Global Constraints: "A única mudança visível é a F2c" (:58); F2c e F4 nunca rebaixadas e `FATIA_IGNORAR_PROJETO` soma (:64-67); a lista "F4" (:81-87), que deixa de valer como está (os arquivos citados ficam abaixo de 200 KB; as linhas ainda precisam ser medidas contra 5.000); o fatiamento da própria mudança, 300/400/20 (:89), vira PR com até 100 arquivos.
- Task A1 (:126): o caso "a cópia fica fora do F2" depende de `FATIA_IGNORAR`.
- Task A2 (:133-153): todos os casos novos (:146-149) usam `FATIA_*`.
- Task A3 (:164-178): a saída padrão (:166) e os casos de calibragem (:172, :178).
- Task A4 (:184-210): os casos de `pr_linhas 2500`, `ignorar` que soma e F2c (:200-205); a DM-236 ("F2c nunca rebaixada", :197).
- Task B1 (:216-256), ainda a fazer: o mapeamento da V12 precisa do resultado `incompleta`; as evidências de teste perdem `lotes` com vários lotes.
- Task C1 (:302-318), ainda a fazer: a gramática de `revisao:` (:311) ganha `incompleta:<classe>`.

Parte 2 (`docs/superpowers/plans/2026-10-18-mergex-revisao-por-task-e-merge-automatico-parte-2.md`):
- Tabela de PRs (:332): o assunto da PR 1 ("F2c, sha256") e a coluna de linhas deixam de ser limite.
- A dependência "Release com #51, #53 e D2" (:354) passa a incluir a release da emenda.
- Task S1 (:45-91): `prs` ganha o item de planejamento, primeiro da lista, e o E0 a entrega `--planejamento` (8).

O resto (B2 em diante, S2, M1 a M4) não depende dos limites; o M4 (E9 automático) só precisa recusar o PR de planejamento.

## 11. Ordem de implementação

PRs pequenas, cada uma com até 100 arquivos. "Release" é a do CLI que a CI publica a cada commit da main (`cli-<sha7>`); "versão liberada" é a que o desenvolvedor aponta aos projetos (`scripts/liberar-versao.sh`).

0. **Antes de tudo:**
   - pelo desenvolvedor: os testes de conformidade com a CLI 0.5.14 e login (6) — **feitos** na #60, em `fixtures/conformidade/codeant-cli-0.5.14/`, que fixaram `meta.max_files`, os motivos, a ordem dos filtros e as contas de linhas e bytes (2); e o inventário de `.expx/fatiamento.json` e de `FATIA_*` nos projetos e no CI deles (9);
   - **divisão dos dois arquivos acima de L2**, cada um numa PR de movimento mecânico, sem mudar casos, em partes com menos de 5.000 linhas e de 200 KB: `.claude/hooks/testes/bancada.sh` da sprintx (621.567 bytes, 9.829 linhas) e `scripts/ci/test-r1-reconciliacao-base.sh` da mergex (245.639 bytes). Isto **revoga** a decisão antiga de não dividir a `bancada.sh` da sprintx. Nenhuma outra mudança toca esses arquivos antes da divisão. A cópia da bancada no expxdev (`fixtures/candidatos/`) acompanha no repin.
1. **expxdev**, uma PR por peça: (a) leitor, doctor e contrato de instalação §5.2; (b) verificador, `ci.yml` e contrato `expx-fatiamento` v3; (c) revisão por task, a CLI falsa que serve os JSONs de `fixtures/conformidade/codeant-cli-0.5.14/` e contrato `expx-revisao` v2. A main não fica vermelha entre elas: a mergex e a sprintx usam a cópia fixada, e o verificador do expxdev não lê o leitor.
2. **Release** do expxdev (`cli-<sha7>`), sem liberar aos projetos.
3. **mergex:** `fatiamento-da-pr.sh`, E7 e `leitor-do-projeto.sh`, com a cópia do núcleo regerada; o PR de planejamento (E0, E2, E7, E9); depois, o ajuste dos planos (10) e a volta ao B1.
4. **sprintx:** F3 e auditor (as duas cópias); o PR de planejamento no fim da F5 e a espera do merge antes da primeira sprint; DS nova.
5. **expxdev:** repin das candidatas e os testes de consistência da 4.5 (agora sobre os perfis e `excluir_da_revisao`); **versão liberada**; os projetos atualizam (9).

## 12. O que ainda está aberto

Decidido em 2026-10-19 e já no texto: o PR de planejamento (7), a divisão dos dois arquivos grandes (11, passo 0) e o pacote do Codex (versão 2 do arquivo, `FATIA_*` reservados para sempre, `excluir_da_revisao` só para classes de artefato, `incompleta` e `revisao_incompleta`, versão exata homologada, L1 e L2 antes da CLI).

Fechado pelos testes de conformidade (#60) e ajustado no texto, com decisão do usuário de espelhar exatamente a CLI: o caminho `meta.max_files`, a forma de `meta` e os motivos de pulo (2, 6); `.md` revisável e o predicado como a lista exata da CLI (2, 3); a conta de linhas de L2 (quebras + 1) e a de bytes (`Buffer.byteLength`), nunca o texto do motivo (3); a falha de lote lida no stderr, `incompleta:lote-falhou` (3); o lugar dos artefatos, `fixtures/conformidade/codeant-cli-<versão>/` (6).

Fica para o passo 0 ou para o plano:
- **O inventário** de `.expx/fatiamento.json` e de `FATIA_*` no login e no conselho (9).
- **L1 nos repositórios do método.** Neles não há revisão por task pela CLI: valem L2 e L3 na PR, e L1 fica como regra de planejamento sem portão automático.
- **A lista de raízes de código** da validação de `excluir_da_revisao` (5): o contrato de instalação a fixa, e cresce só por PR no expxdev.
