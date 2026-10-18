# Contrato `expx-fatiamento` v2 — mudanças pequenas, revisáveis, em ordem

Este contrato vale para **todo desenvolvimento** nos repositórios do método —
`expxdev`, `sprintx`, `mergex` e as demais skills — e para quem o conduz, pessoa
ou agente. Ele não trata do formato dos artefatos (isso é `CONVENCOES.md`): trata
do **tamanho e da ordem** em que uma mudança chega ao `main`. Um projeto que usa o
método calibra os limites de legibilidade para si (Configuração por projeto); a
capacidade do revisor não se calibra.

## Por que existe

A revisão automática que o método usa (CodeAnt) deixa de revisar o que é grande, e
o efeito é silencioso: a PR não recebe comentário nenhum, e "sem comentário" é
lido como "sem problema".

O que se sabe, e de onde vem:

| Fato | Fonte |
|---|---|
| Acima de **100 arquivos** na PR, o bot não revisa: responde "Skipping CodeAnt AI review — this PR changes more than 100 files" e só revisa se alguém comentar `@codeant-ai : review` | observado na AxisGov/mergex#15 (177 arquivos); a documentação não declara o limite |
| `codeant review` (CLI): **5.000 linhas por arquivo** e **10 arquivos por revisão**; o que passa disso é pulado com aviso | [docs.codeant.ai/cli/review](https://docs.codeant.ai/cli/review) |
| Scan de agente (API): arquivo filtrado acima de **400 KB** ou **5.000 linhas** | [docs.codeant.ai — Start Agent Scan](https://docs.codeant.ai/api-reference/agent-analysis/start-agent-scan.md) |
| Revisão de PR "reviews all files by default", sem limite de tamanho declarado; filtra por `include_files`/`exclude_files` em `.codeant/configuration.json` e ignora o que está no `.gitignore` | [docs.codeant.ai — Review Configuration](https://docs.codeant.ai/ide/review/configuration.md) |

O limite de ~200 KB por arquivo, lembrado de memória, **não consta** da
documentação. Os limites desta regra ficam com folga sob os números acima, e o de
100 arquivos é o único que o próprio bot confirmou. A #26 da sprintx (61 arquivos,
+19 mil linhas) foi revisada, o que mostra que o gatilho é a contagem de arquivos,
não o total de linhas — mas uma PR dessas não é legível por quem a revisa.

Medido em outubro de 2026, antes desta regra:

| Mudança | Tamanho |
|---|---|
| promoção da linha P0.2 da sprintx para o `main` | +19 mil linhas, 61 arquivos, 100 commits |
| promoção da linha P0.2 da mergex para o `main` | +43 mil linhas, 177 arquivos |
| `bancada.sh` da sprintx | 604 KB em um arquivo |
| `test-r1-reconciliacao-base.sh` da mergex | 239 KB em um arquivo |

Parte da linha P0.2 entrou por commits diretos, sem PR: nada nela foi revisado
por quem revisa.

## Capacidade × legibilidade

Os limites são de duas naturezas, e só uma se calibra:

| Natureza | Regras | Quem fixa | Por projeto |
|---|---|---|---|
| **capacidade** do revisor: acima dela a revisão automática pula arquivo ou a PR inteira, em silêncio | F2c (100 arquivos visíveis ao revisor na PR); F4 (arquivo acima do limite não cresce; o limite em linhas nunca passa de 5.000) | o CodeAnt (tabela acima) | não se calibra; `FATIA_EXCECAO` não a rebaixa |
| **legibilidade** de quem lê: acima dela a PR é revisada, mas não é lida inteira | F2 (400 linhas e 20 arquivos por PR), F3 (300 linhas por commit) | este contrato | calibrável, e afrouxar exige revisão por task obrigatória |

Os números de F4 (150 KB, 4.000 linhas) também se calibram por projeto, com
justificativa, abaixo da capacidade.

## As regras

Referencie sempre com o prefixo `F` (`F2`, `F4`), para não colidir com as `R` de
`CONVENCOES.md`.

### F1 — Um assunto por PR e por commit

Uma PR responde a uma pergunta só: "o que muda e por quê" cabe em uma frase. Duas
decisões independentes são duas PRs. Correção de revisão entra como commit na PR
que a motivou; se o achado é anterior à PR (o trecho já estava no `main`), vai
para PR própria e a thread original aponta para ela.

### F2 — Tamanho da PR

No máximo **400 linhas alteradas** (adições mais remoções) e **20 arquivos**,
sem contar o que casa com `FATIA_IGNORAR`: os arquivos gerados (o lock de
dependências e os snapshots de `fixtures/candidatos/`, que entram em commit
próprio) e os artefatos de método (F6).

Os 20 arquivos são limite de legibilidade, nosso; o do revisor é 100 (F2c). Uma
PR entre os dois é revisada, mas a pessoa que lê não a lê inteira.

### F2c — Capacidade do revisor

No máximo **100 arquivos visíveis ao revisor** na PR: todos os alterados, menos
os que o projeto exclui no painel do CodeAnt (`FATIA_CAPACIDADE_EXCLUIDO`). Num
projeto, o leitor a preenche com `capacidade.excluido_no_painel`, cujo padrão são
os artefatos de método, `^docs/(sprintx|entregas|eventos)/`. Sem leitor, nos
repositórios do método, o padrão é o mesmo de `FATIA_IGNORAR`, que o painel deles
exclui (F6). Gerado que o painel não exclui conta aqui, porque o bot o vê. Acima de 100 o bot não
revisa a PR (tabela acima): F2c não se calibra e `FATIA_EXCECAO` não a rebaixa.

### F3 — Tamanho do commit

No máximo **300 linhas alteradas** por commit. Um commit que o revisor não
consegue ler em uma passada não é revisado.

### F4 — Tamanho de arquivo

Arquivo de texto versionado:

- até **100 KB** e **3.000 linhas**: livre;
- de 100 a **150 KB**, ou de 3.000 a **4.000 linhas**: aviso — o arquivo está perto
  do limite;
- acima de **150 KB** ou de **4.000 linhas**: **não cresce**. A PR o divide ou não
  mexe nele, com a tolerância de 2 KB e 20 linhas por PR para a edição inevitável
  (uma linha de tabela).

O limite em linhas pesa mais que o em KB: um arquivo de 98 KB com 9.800 linhas
estoura o de 5.000 linhas do `codeant review` sem chegar perto dos KB.

Quando um arquivo precisa crescer e já está perto do limite, o conteúdo novo vai
para um arquivo novo. Registro cumulativo (`DECISOES-DA-SKILL.md`, bancadas) se
divide por época ou por seção; a divisão é PR própria, mecânica (F6).

### F5 — Linha longa se promove em fatias, na ordem do histórico

Uma linha de trabalho (`p0.2/*`, ou qualquer branch longa) chega ao `main` em
várias PRs, cada uma:

1. dentro de F2 e F3;
2. **na ordem do histórico**, para que cada fatia sobre a anterior e nenhuma
   dependa do que ainda não entrou;
3. **verde sozinha**: a suíte e os validadores passam com só aquela fatia;
4. **revisada**: nenhuma fatia entra por commit direto ou por merge em bloco.

O merge em bloco de uma linha só é aceito quando todas as fatias dela já
passaram por PR revisada em uma base intermediária. Commit direto na linha não
é caminho para escapar da revisão: ele entra na fatia seguinte como qualquer
outro.

### F6 — Exceções declaradas

Três, e só elas:

- **movimento mecânico**: dividir ou renomear arquivo sem alterar conteúdo, em PR
  que não faz mais nada. Declara-se com `FATIA_EXCECAO=<motivo>`, que rebaixa F2
  e F3 a aviso e imprime o motivo;
- **artefato gerado**: snapshot e fixture regenerados por script, em commit
  separado do código que os motivou, com o comando que os gerou no corpo da PR.
  O que casa com `FATIA_IGNORAR` fica fora de F2, F3 **e F4**, e também fora da
  revisão automática: ninguém revisa a cópia, então o limite do revisor não se
  aplica a ela. O tamanho do original é conferido no repositório de onde ele vem.

  A exclusão que vale na revisão de PR é a do **painel do CodeAnt**: app.codeant.ai →
  Code Review → Configuration → aba Exclusions → Exclude Files, com o repositório
  selecionado, um padrão por "Add": `fixtures/candidatos/**` e `**/package-lock.json`.
  O "Test a Value" da mesma tela usa o matcher da revisão de PR. O
  `.codeant/configuration.json` (`review_configuration.exclude` e
  `file_filters.config.exclude_files`, as chaves que a documentação cita) não é lido
  na PR: com as duas no `main`, a #24 ainda teve achados em `fixtures/candidatos/`.
  Ele fica no repositório para a revisão no IDE e cobre os mesmos caminhos, cada
  chave na sua sintaxe (`file_filters` é fnmatch, sem `**`: `fixtures/candidatos/*`,
  `*package-lock.json`); padrão novo em `FATIA_IGNORAR` vai para o painel e para as
  duas chaves.
- **artefato de método**: o que a `sprintx` e a `mergex` gravam na branch da
  feature — `docs/sprintx/`, `docs/entregas/`, `docs/eventos/` — entra no PR para
  rastreabilidade, mas fica fora de F2, F3 e F4 (está no padrão de `FATIA_IGNORAR`
  do verificador) e fora da revisão automática (no painel do CodeAnt do projeto,
  como acima; por isso é também o padrão de `FATIA_CAPACIDADE_EXCLUIDO` e não conta
  para F2c). O planejamento de uma feature real passa sozinho de 250 arquivos e
  38 mil linhas antes da primeira linha de código; medi-lo reprovaria todo PR, e o
  método já é conferido pelos portões das próprias skills. A regra de tamanho da F3
  da `sprintx` é sobre o código das tasks.

Fora disso, F4 não tem exceção: o limite de arquivo é do revisor, não nosso. F2c
também não tem.

## Configuração por projeto

Um projeto que usa o método calibra a legibilidade e acrescenta exclusões em
`.expx/fatiamento.json`, arquivo do projeto. O formato, os padrões e a validação
estão na §5.2 de `CONTRATO-expx-instalacao.md` e não se repetem aqui. Sem o
arquivo, valem os números desta página. O leitor único
(`nucleo/scripts/expx-fatiamento.mjs`, instalado em
`.expx/marketplace/plugins/expx/nucleo/scripts/`) transforma o arquivo nas
variáveis `FATIA_*` do verificador; `ignorar` sai em `FATIA_IGNORAR_PROJETO`, que
**soma** ao `FATIA_IGNORAR` efetivo, nunca o substitui.

### Afrouxar exige revisão por task obrigatória

Um limite de legibilidade (F2, F3) acima do padrão só vale com
`revisao_por_task.modo: "obrigatoria"`: cada task passa pela CLI do CodeAnt antes
do commit, e nenhuma fecha com achado aberto em linha que ela alterou. A PR maior
chega com cada pedaço já revisado. Com `se_disponivel` ou `desligada`, o arquivo
que afrouxa é inválido: o leitor o recusa e o `doctor` o aponta. Todo valor
diferente do padrão, mais frouxo ou mais estrito, exige `justificativa`. A
capacidade (F2c e o teto de 5.000 linhas de F4) não se afrouxa em modo nenhum.

### Entrega por sprint

Com `entrega: "por_sprint"`, um trabalho entrega uma PR por sprint, empilhadas: a
da sprint N+1 tem como base a branch da sprint N. F2 conta **por sprint**: cada PR
é medida contra a base dela, e não o trabalho inteiro. F2c, F3 e F4 não mudam.
Com `por_trabalho` (o padrão), uma PR por trabalho, como antes.

### Como consumir o leitor

```bash
fatia="$(node .expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs)" || exit 1
set -a; eval "$fatia"; set +a
bash <verificador> <base> <head>
```

O leitor imprime `CHAVE=valor`, uma por linha, com aspas quando o valor pede. Um
`eval` sozinho cria variáveis **do shell**, que não chegam ao verificador: ele roda
em outro processo e só herda o que foi exportado. Sem o `set -a`, ele mediria com
os padrões, em silêncio, mesmo com o projeto calibrado. O `set -a` exporta tudo o
que o `eval` define; o `set +a` volta ao normal. A saída vai para uma variável
antes do `eval` porque `eval "$(…)"` devolve o código do `eval`, não o do leitor:
leitor que sai com 1 (arquivo inválido) não imprime nada, e o `eval` de nada sai
com 0 — o verificador mediria com os padrões no lugar do arquivo inválido.

## Como verificar

```bash
bash scripts/verificar-fatiamento.sh <base> <head>
```

Compara `<base>...<head>`, lista as violações com a regra (`F2`, `F2c`, `F3`, `F4`)
e sai com 1 se houver alguma. Os limites vêm das variáveis `FATIA_MAX_LINHAS_PR`,
`FATIA_MAX_ARQUIVOS`, `FATIA_MAX_LINHAS_COMMIT`, `FATIA_MAX_KB_ARQUIVO`,
`FATIA_AVISO_KB`, `FATIA_TOLERANCIA_B`, `FATIA_MAX_LINHAS_ARQUIVO` (até 5.000:
acima sai 2), `FATIA_AVISO_LINHAS`, `FATIA_TOLERANCIA_LINHAS`, `FATIA_IGNORAR` (definida,
substitui o padrão), `FATIA_IGNORAR_PROJETO` (soma ao `FATIA_IGNORAR`),
`FATIA_CAPACIDADE_ARQUIVOS` (só mais estrita: acima de 100 sai 2) e `FATIA_CAPACIDADE_EXCLUIDO` (definida e vazia: o
painel não exclui nada), com os valores desta página como padrão. O cabeçalho do
script as descreve. O `ci.yml` do `expxdev` roda o verificador em toda PR.

## O que é do método, e o que ainda não é

Feito: o verificador mede F2c e os artefatos de método, e soma
`FATIA_IGNORAR_PROJETO`; o leitor de `.expx/fatiamento.json` e o `doctor` que o
valida estão no núcleo. Falta, nos planos de cada skill:

- a `mergex` (E7) espelhar o corpo deste verificador no `fatiamento-da-pr.sh` e
  exportar o leitor antes dele (como acima);
- a `sprintx` (F3 e auditor) ler os limites do leitor, não do texto;
- a revisão por task (`nucleo/scripts/expx-revisao.mjs`), que é o que torna o
  afrouxamento válido.

Até lá, a conferência é do `verificar-fatiamento.sh` e de quem abre a PR.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-15 | Contrato criado (F1–F6), depois que o CodeAnt deixou de revisar as PRs de promoção da linha P0.2 (+19 mil e +43 mil linhas). |
| 2026-10-15 | Os limites do CodeAnt passam a ser citados com a fonte de cada um. |
| 2026-10-15 | Artefato gerado fica fora de F4 e da revisão do CodeAnt. |
| 2026-10-15 | F6 registra que a exclusão por arquivo no `.codeant/configuration.json` não bastou na PR, aponta a exclusão no painel e diz que `file_filters` cobre os mesmos caminhos em fnmatch. |
| 2026-10-16 | F6 ganha a exceção de artefato de método. |
| 2026-10-18 | v2: capacidade × legibilidade; F2c (100 arquivos visíveis ao revisor); configuração por projeto em `.expx/fatiamento.json`, com afrouxamento só sob revisão por task obrigatória; entrega por sprint; como consumir o leitor (`set -a`); os artefatos de método entram no padrão do verificador, como F6 já dizia. |
