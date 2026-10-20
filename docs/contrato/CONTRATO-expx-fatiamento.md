# Contrato `expx-fatiamento` v3 — limites fixos do CodeAnt

Este contrato vale para todo desenvolvimento nos repositórios do método —
`expxdev`, `sprintx`, `mergex`, `buildx` e as demais skills — e nos projetos que
o usam. Ele define o tamanho e a ordem em que uma mudança pode ser executada,
revisada e entregue ao `main`.

Os limites não são metas de estilo nem números calibráveis por projeto. Eles
reproduzem a capacidade observada da versão homologada da CLI e do app do
CodeAnt. Acima deles, parte da mudança não recebe revisão; ausência de achado
nesse estado não significa aprovação.

## Fatos e fontes

| Fato | Fonte |
|---|---|
| A CLI 0.5.14 revisa no máximo **40 arquivos**; o 41º recebe `exceeded 40-file limit` | `MAX_REVIEW_FILES` em `src/utils/reviewApiHelper.js` do pacote npm `codeant-cli@0.5.14`; casos `limite40` e `limite41` em `fixtures/conformidade/codeant-cli-0.5.14/` |
| Arquivo acima de **5.000 linhas** ou **204.800 bytes** é pulado | `MAX_FILE_LINES` e `MAX_FILE_SIZE_BYTES` no mesmo pacote; casos de conformidade `limite40` e `pulos` |
| Linhas são `conteudo.split('\n').length`: quebras + 1. Um arquivo com `wc -l = 5000` e quebra final conta 5.001 | fonte publicada da CLI e caso `pulos` |
| Bytes são `Buffer.byteLength(conteudo, 'utf8')` depois da decodificação UTF-8; byte inválido vira U+FFFD e ocupa três bytes | fonte publicada da CLI e suíte de conformidade do núcleo |
| Locks, imagens, fontes, binários, compactados, mídia, documentos de escritório, dados e bancos da lista publicada são `binary/generated`; `.min.js` e `.min.css` também ficam fora | `EXCLUDED_FILENAMES`, `EXCLUDED_EXTENSIONS` e `isReviewableFile` no pacote homologado |
| Markdown não está nessa lista: `.md` é revisável e conta para os 40 e para L2 | caso `pulos`, no qual `notas.md` foi revisado e `manual.pdf` foi pulado |
| Deletado, excluído por padrão, acima de L2 e além do 40º são pulos distintos; pulo ou corte não faz a CLI sair com erro | fonte publicada e quatro respostas gravadas em `fixtures/conformidade/codeant-cli-0.5.14/` |
| `meta.reviewed_files` significa enviado, não necessariamente revisado pela API; falha de lote aparece apenas no stderr como `[error] Failed to review ...` | `src/reviewHeadless.js` do pacote e `LEIAME.md` das fixtures de conformidade |
| O app não revisa PR com mais de **100 arquivos** | observado em `AxisGov/mergex#15` |
| Exclusões configuradas no painel tiram arquivos da revisão, mas **não descontam** dos 100 | teste em `katosmv/login#7`: 101 arquivos, cinco em pasta excluída, e o app pulou a PR |
| Não há limite de linhas por PR, commit ou task | código e documentação da CLI; a PR `AxisGov/sprintx#26`, com 61 arquivos e mais de 19 mil linhas, foi revisada |

A fonte canônica executável desses números é `nucleo/scripts/perfis/`, não esta
tabela. O texto, o verificador e os consumidores são conferidos contra os perfis
por teste.

## Limites

Os três limites são fixos e referenciados pelo prefixo `L`.

### L1 — task: 40 arquivos revisáveis

Uma task declara no máximo **40 arquivos revisáveis**. A conta ocorre antes do
corte da CLI. Mais de 40 arquivos significa dividir a task; a revisão não é
executada em lotes para contornar o limite.

L1 é conferido pela revisão por task, porque só ela conhece o conjunto declarado
na task. Nos repositórios do método em que essa integração ainda não existe, L1
continua regra obrigatória de planejamento.

### L2 — arquivo: 5.000 linhas e 204.800 bytes

Cada arquivo revisável fica, inteiro e no estado depois da task, em no máximo:

- **5.000 linhas**, por `conteudo.split('\n').length`;
- **204.800 bytes**, por `Buffer.byteLength(conteudo.toString('utf8'), 'utf8')`.

Mede-se o arquivo, não o diff. Um arquivo de 5.000 linhas terminado em quebra
tem 5.001 pela conta da CLI e viola L2; sem quebra final, 5.000 passa. O texto
`200 KB` no motivo da CLI é arredondado e nunca serve de medida.

Quando há blob Git e arquivo regular no checkout representando o mesmo blob,
ambos são medidos e vale o maior valor de linhas e o maior de bytes. Isso cobre
CRLF e outros filtros que tornam a árvore de trabalho maior que o blob. Nenhum
arquivo revisável tem tolerância ou exceção a L2: uma task anterior divide o que
já estiver acima.

### L3 — PR: 100 arquivos alterados

Uma PR altera no máximo **100 arquivos**, contando todos: código, locks, gerados,
cópias, artefatos de método e caminhos excluídos no painel. É a contagem de
`changed_files` do GitHub; renomeação conta uma vez.

Exclusões do painel continuam úteis para tirar conteúdo da revisão do app, mas
não alteram L3. PR acima de 100 se divide e não é forçada com
`@codeant-ai : review`.

Não há limite de linhas por PR, por commit ou por task.

## O predicado de revisável

Existe um único predicado, derivado do perfil homologado e implementado em
`nucleo/scripts/expx-limites.mjs`:

1. arquivo deletado não é revisável;
2. o `basename` exato não pode estar em `excluidos.nomes`;
3. `path.posix.extname(basename).toLowerCase()` não pode estar em
   `excluidos.extensoes`;
4. o `basename` não pode terminar em um dos `excluidos.sufixos`, com a mesma
   comparação da CLI;
5. o caminho não pode estar sob as exclusões do núcleo nem sob um item válido de
   `excluir_da_revisao`.

As exclusões do núcleo são `^docs/sprintx/`, `^docs/entregas/` e
`^docs/eventos/`. Markdown e extensão desconhecida continuam revisáveis. A lista
completa de nomes, extensões e sufixos fica no perfil; não se mantém uma segunda
lista em prosa.

`excluir_da_revisao` serve somente para classes de artefato (`gerado` ou
`copia`), nunca para esconder código-fonte. Sua forma e validação estão na §5.2
de `CONTRATO-expx-instalacao.md`.

## Dois portões da revisão por task

Uma task só fecha quando os dois portões passam:

1. **Cobertura completa:** o conjunto revisável declarado pela task coincide com
   o conjunto coberto pela resposta da CLI, sem faltante, sobra ou repetição. O
   perfil valida `meta.max_files`, a forma de `meta` e os motivos. Corte, pulo por
   tamanho, arquivo ausente, pulo desconhecido ou `[error] Failed to review ...`
   no stderr tornam a revisão `incompleta`; não há aprovação por ausência de
   achado.
2. **Zero achado aberto** em linha alterada pela task. Achado anterior segue F1;
   falso positivo ou risco só é rejeitado pelo desenvolvedor, conforme
   `CONTRATO-expx-revisao.md`.

## Regras de composição e entrega

### F1 — Um assunto por PR e por commit

Uma PR responde a uma pergunta: “o que muda e por quê” cabe em uma frase. Duas
decisões independentes são duas PRs. Correção pedida na revisão entra na PR que
a motivou; achado em trecho que já estava no `main` vai para PR própria, apontada
pela thread original.

### F5 — Linha longa se promove em fatias, na ordem

Uma linha longa chega ao `main` em PRs sequenciais. Cada fatia:

1. fica dentro de **L3**;
2. respeita a ordem do histórico, sem depender do que ainda não entrou;
3. fica verde sozinha contra a base real;
4. recebe revisão antes do merge.

Commit direto ou merge em bloco não serve para escapar da revisão. Um merge em
bloco só é aceitável quando todas as fatias já passaram por PR revisada numa base
intermediária.

### F6 — Exclusões declaradas

Há duas classes:

- **artefato gerado:** snapshot ou fixture regenerado por script, em commit
  separado do código que o motivou, com o comando gerador no corpo da PR;
- **artefato de método:** conteúdo sob `docs/sprintx/`, `docs/entregas/` e
  `docs/eventos/`, conferido pelos portões das próprias skills.

Esses arquivos podem sair de L1 e L2 e da revisão por task conforme o predicado,
mas continuam contando integralmente em L3. O painel do CodeAnt deve espelhar as
exclusões aplicáveis para não gastar revisão com cópias; isso não reduz a conta
de 100 arquivos do app.

Movimento mecânico não é exceção. As antigas variáveis `FATIA_EXCECAO` e demais
`FATIA_*` não existem mais.

## PR de planejamento

O PR de planejamento é a única exceção a L3 e vale tanto em `por_sprint` quanto
em `por_trabalho`:

- leva somente os artefatos produzidos pelo planejamento da sprintx sob
  `docs/sprintx/`, `docs/entregas/` e `docs/eventos/`;
- qualquer caminho fora desses prefixos faz a abertura ser recusada;
- abre no fim da F5, com o plano aprovado, antes da primeira sprint;
- exige merge do desenvolvedor e nunca recebe merge automático;
- a primeira sprint só começa depois desse merge, em branch atualizada da main;
- L3 não se aplica: se o app pular o PR por mais de 100 arquivos, isso é aceito,
  pois os artefatos já são conferidos pelas skills e ficam fora da revisão.

Os PRs de sprint não herdam a exceção: contam todos os seus arquivos em L3.

## Configuração por projeto

`.expx/fatiamento.json` é versionado pelo projeto e preservado pelo CLI. O
formato, a versão 2, os padrões, `excluir_da_revisao` e toda a validação estão na
§5.2 de `CONTRATO-expx-instalacao.md`; este contrato não os duplica.

O arquivo escolhe modo de revisão por task, forma de entrega, merge automático,
bot revisor e classes de artefato excluídas. Ele não configura limites. Qualquer
variável de ambiente cujo nome comece por `FATIA_`, mesmo vazia, é erro permanente:

```text
`FATIA_<nome>` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente
```

## Entrega por sprint

Com `entrega: "por_sprint"`, o trabalho continua um só, com a mesma branch e a
mesma `ENTREGA.md`, mas há **um PR por vez**. Ao fechar a sprint N, a sprintx
entrega somente seu escopo. A sprint N+1 começa apenas depois do merge, quando a
branch é atualizada da main.

Não há PRs empilhadas entre sprints. Cada PR usa a main como base; correção
pedida enquanto o PR está aberto entra naquela sprint, e defeito descoberto após
o merge vira task da sprint seguinte ou correção própria. Com
`entrega: "por_trabalho"`, a entrega de código ocorre no fim do trabalho. Nos
dois modos, o PR de planejamento vem antes da execução.

## Perfis e homologação

O núcleo carrega dois perfis separados:

- `codeant-cli@0.5.14`: 40 / 5.000 / 204.800, predicado, motivos, origem,
  integridade, `gitHead` e manifesto sha256 do pacote publicado;
- `codeant-app`: 100 arquivos, todos contados.

Somente versões listadas por `homologadas()` são aceitas; hoje, somente 0.5.14.
Versão nova não herda os números. Ela precisa de nova homologação, testes de
conformidade nas bordas e perfil compatível. Perfis homologados divergentes em
limites, exclusões ou motivos fazem o núcleo falhar, nunca adaptar silenciosamente.

O homologador é executado pelo desenvolvedor com os metadados publicados:

```bash
node scripts/homologar-codeant-cli.mjs \
  --versao <versao> --integridade <sha512> --git-head <sha>
```

Ele baixa ou recebe o tarball e o packument, confere integridade e origem, lê a
fonte publicada e grava o perfil. Os casos que exigem login são reproduzidos por
`fixtures/conformidade/codeant-cli-<versao>/conformidade.sh`; o stdout bruto fica
versionado ao lado e a suíte o reconcilia com o núcleo.

## Como consumir o leitor

O leitor único fica em
`.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs`. Primeiro se
valida a configuração; quando forem necessários os dados, usa-se JSON:

```bash
leitor=.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs
node "$leitor" --validar || exit 1
configuracao="$(node "$leitor" --formato json)" || exit 1
```

A saída contém `limites`, `excluir_da_revisao` e as demais decisões do projeto.
Quem chama o verificador transforma cada `excluir_da_revisao[].padrao` em um
argumento repetido `--excluir-da-revisao`; nenhum limite ou exclusão vem do
ambiente. A saída `env` contém apenas `EXPX_*`, inclusive o perfil e os limites
para consumidores que precisam exibi-los ou conferi-los.

## Como verificar

```bash
bash scripts/verificar-fatiamento.sh [--planejamento] \
  [--excluir-da-revisao '^pasta/']... <base> <head>
```

O verificador:

- mede L3 com `git diff --name-only -z -M`, sem desconto;
- com `--planejamento` (só quem abre o PR de planejamento passa), não aplica L3
  e reprova todo caminho alterado, inclusive a origem de renomeação, fora de
  `docs/sprintx/`, `docs/entregas/` e `docs/eventos/`;
- mede L2 nos caminhos A/M/R/T novos que passam no predicado;
- ignora em L2 submódulo, exclusões do perfil, exclusões do núcleo e os prefixos
  literais recebidos por argumento;
- mede blob e checkout correspondente e usa o maior;
- sai 0 sem violação, 1 com violação e 2 por uso ou medida impossível.

O padrão de `--excluir-da-revisao` é pasta literal: começa por `^`, termina em
`/`, não aceita metacaractere e só aceita ponto como `\.`. O CI do expxdev passa
`^fixtures/candidatos/` explicitamente e nunca `--planejamento`: os repositórios
do método não têm PR de planejamento.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-15 | v1: F1–F6 criadas depois das promoções P0.2 que chegaram grandes ou sem revisão. |
| 2026-10-18 | v2: separação entre capacidade e legibilidade, configuração por projeto, revisão por task e entrega por sprint. |
| 2026-10-19 | v3: números calibráveis, F2/F2c/F3/F4 e `FATIA_*` saem; entram L1/L2/L3 fixos pelos perfis homologados. A conta de linhas, bytes e arquivos passa a espelhar a CLI 0.5.14 e o app; as exclusões do painel não descontam L3; o PR de planejamento é separado; entrega por sprint fica sequencial, sem pilha. |
