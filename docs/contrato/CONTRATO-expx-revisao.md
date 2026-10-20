# Contrato `expx-revisao` v2 — revisão por task pela CLI do CodeAnt

Cada task do método passa pela CLI do CodeAnt, e o portão do PR confere que passou.
Este contrato define a CLI aceita, a evidência que a revisão grava, a identidade de
um achado, e o que `revisar`, `conferir` e `rejeitar` fazem. Quem o implementa é
`nucleo/scripts/expx-revisao.mjs`, com as regras fixas de `nucleo/scripts/expx-limites.mjs`
e os perfis de `nucleo/scripts/perfis/`, instalados em
`.expx/marketplace/plugins/expx/nucleo/scripts/`; quem o chama são a sprintx (passo
de revisão da F6) e a mergex (V12 no E2), nos planos delas. O modo vem de
`revisao_por_task.modo` em `.expx/fatiamento.json` (§5.2 de
`CONTRATO-expx-instalacao.md`). Desenho: seção 4.2 de
`docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md`, com a
emenda `docs/superpowers/specs/2026-10-19-limites-do-codeant-emenda.md` (seções 3, 6 e 8),
que vale onde os dois divergem. Os limites L1, L2 e L3 estão em
`CONTRATO-expx-fatiamento.md`.

## A CLI

- **Só versão homologada**, pela lista exata: hoje só **`codeant-cli@0.5.14`**. Nunca
  "versão mínima" nem `@latest`. Homologada é a versão que tem perfil em
  `nucleo/scripts/perfis/codeant-cli-<versão>.json` (com o pacote npm, `dist.integrity`,
  `gitHead`, os números, a lista exata de exclusões, os motivos de pulo e o manifesto).
  Orientação ao desenvolvedor: `npm i -g codeant-cli@0.5.14`. O agente não instala nem
  atualiza a CLI.
- **Localização.** O `codeant` que o shell rodaria: o primeiro do `PATH` (no Windows,
  com cada extensão do `PATHEXT`, como o `cmd.exe`). O link é seguido até o caminho
  real; o shim do npm (`.cmd`, ou `sh` que aponta para `node_modules/codeant-cli/`) é
  lido como texto e o alvo é tirado dele. Do alvo, sobe-se, passando por
  `package.json` de outro nome, até o que tem `name` `codeant-cli`; o `bin` dele
  (texto, ou `bin.codeant`) tem de ser o arquivo resolvido. A versão é a desse
  `package.json`, nunca a que o executável afirma em `--version`.
- **Integridade.** Cada arquivo do manifesto do perfil (menos o `package.json`) existe
  no pacote instalado com o mesmo sha256, e o `package.json` tem `name`, `version` e
  `bin` iguais aos do perfil (o npm pode reescrever o resto). **Limite aceito**
  (emenda, 6): só os arquivos do pacote `codeant-cli` são conferidos, não as
  dependências em `node_modules` nem arquivo a mais no pacote. O objetivo é recusar
  CLI errada ou falsa no `PATH`, não defender de máquina comprometida.
- **Execução pelo arquivo conferido:** `node <bin do pacote> review ...`, pelo mesmo
  `node` que roda a revisão; nunca o `codeant` do `PATH` depois da conferência.
- **Comando**, uma chamada só, **sem lotes**:
  - trabalho antes do commit (F6): `review --headless --uncommitted --include <revisáveis>`;
  - trabalho já commitado: `review --headless --base-commit <SHA inicial da task> --include <revisáveis>`.
  - Nunca `--last-n-commits` (máximo 5) nem `--fail-on`.
  O JSON `{issues:[{issue_content, relevant_file, start_line, label}], meta:{reviewed_files, total_changed, skipped:[{file, reason}], capped, max_files}, error, noFiles}`
  é lido a partir do primeiro `{` que forma JSON (o npm pode avisar antes). O stderr
  é guardado: falha de lote só aparece nele. Não há severidade: todo achado em linha
  alterada conta.
- **Credencial é do desenvolvedor.** O agente nunca roda `codeant login` nem
  `set-codeant-api-key`, nunca define `CODEANT_API_TOKEN` e nunca lê nem imprime
  `~/.codeant/config.json`. Sem login, a revisão nunca é aprovação.

## Os dois portões

Uma task só fecha com os dois (emenda, 3):

1. **Cobertura completa:** os arquivos revisáveis enviados são exatamente os revisados
   pela CLI, sem faltante, sem sobra, sem repetido e sem pulado; nenhuma linha
   `[error] Failed to review ` no stderr. "Sem achado" num arquivo pulado não é
   aprovação. Antes da CLI, L1 (≤ 40 revisáveis) e L2 (cada revisável ≤ 5.000 linhas e
   ≤ 204.800 bytes, no blob e no checkout, vale o maior) garantem que a CLI não
   precisará cortar nem pular.
2. **Zero achado aberto** em linha alterada pela task.

## A evidência (v2)

O id da task é o da sprintx e da runx, `T-NN.MM` (sprint.task, dois dígitos em cada
parte: `^T-[0-9]{2}\.[0-9]{2}$`); o legado sem ponto continua aceito, com qualquer
número de dígitos (`^T-[0-9]+$`). Como o id vira nome de arquivo, qualquer outra forma
(`T-01..03`, `T-01/03`, `T-01\03`, `../x`, vazio) é uso errado (**64**) nos três
subcomandos, antes de qualquer leitura ou gravação.

`docs/entregas/<trabalho>/revisao/<T-NN.MM>.json`, commitada pelo E1 no commit da
task (artefato de método: fora da revisão). Chaves, todas sempre presentes (R6)
exceto `motivo`:

| Chave | O que é |
|---|---|
| `expx_revisao` | `2` |
| `trabalho`, `task` | o slug e o id da task |
| `modo` | `uncommitted` ou `base-commit` |
| `base_commit` | o SHA completo de `--base-commit`, ou `null` |
| `head` | o SHA completo do `HEAD` quando o `revisar` rodou, ou `null` sem commit; sem `--base-commit`, é dele que as linhas alteradas são medidas |
| `cli` | `{versao, integridade}`: a versão do `package.json` do pacote e `conferida`; `integridade` `null` quando a CLI foi achada mas não passou; `cli` `null` quando a CLI não foi procurada (nada a revisar, ou um portão antes dela) ou não foi achada |
| `executada_em` | timestamp ISO (R4) |
| `arquivos` | `{<caminho>: {blob, bytes, linhas, revisao} \| null}`. `blob`: o sha1 que vai ao commit (sem `--base-commit`, `git hash-object -w`, com os filtros de fim de linha; com, o de `HEAD:<caminho>`). `bytes` e `linhas`: medidos como a CLI (`Buffer.byteLength` e `split('\n').length`) no blob e no checkout, o maior. `revisao`: `enviado`, `nao-revisavel` (fora do predicado da CLI) ou `excluido` (exclusões do núcleo ou do projeto). `null` para arquivo removido |
| `chamada` | `{include, meta, error, falhas_de_lote, issues, stdout_sha256}` da única chamada, ou `null` sem chamada. `falhas_de_lote`: as linhas do stderr que começam com `[error] Failed to review `. `issues`: a lista `issues` do JSON da CLI, crua (cada objeto com todas as chaves que a CLI deu, sem reformatar), ou `null` com JSON ilegível. `stdout_sha256`: sha256, em hex, do stdout da CLI byte a byte (com os avisos do npm), para rastreio |
| `resultado` | `ok`, `achados` (algum `aberto`), `incompleta` ou `indisponivel` |
| `motivo` | só com `incompleta` e `indisponivel` (abaixo) |
| `achados` | `[{identidade, arquivo, linha, label, texto, estado}]`, `estado` ∈ `aberto`, `anterior`, `rejeitado`: um por item de `chamada.issues`, na mesma ordem, derivado dele (abaixo) |
| `rejeicoes` | `[{identidade, motivo, em}]` |
| `removidos_sem_revisao` | caminhos apagados pela task |

**Identidade** de um achado: sha256, em hex, de
`label \0 arquivo \0 linha anterior \0 linha apontada \0 linha seguinte \0 versão da CLI`,
com as linhas sem espaço nas pontas e vazias fora do arquivo. As vizinhas separam
linhas de texto idêntico sem depender do número da linha; mudar o trecho ou a versão
da CLI muda a identidade e reabre o achado.

**Achados derivados das `issues`.** Cada item de `chamada.issues` dá um achado:
`arquivo` é o `relevant_file` (no Windows, `\` vira `/`), `linha` o `start_line` como
número, `label` e `texto` o `label` e o `issue_content` como texto, a identidade como
acima, e `estado` `aberto` se a linha foi alterada pela task (`revisar`, abaixo), senão
`anterior`; `rejeitado` se a identidade está em `rejeicoes`. O `revisar` lê as linhas
vizinhas no checkout; o `conferir`, no blob `<sha>:<arquivo>` do commit da task, que é o
mesmo (a evidência só vale se os blobs batem). Assim `achados` é derivável das `issues`
gravadas, e o `conferir` o refaz.

**Limite aceito.** Quem pode editar a evidência pode editar também `issues` (e
`stdout_sha256`, que o `conferir` não tem como recalcular sem o stdout), `head` e
`base_commit`: o `conferir` não prova o que a CLI respondeu. A defesa real é a evidência
commitada junto da task e revisada no PR (desenho de 2026-10-18). O que muda é o
tamanho da edição: apagar um achado aberto deixa de ser a troca de um campo e passa a
exigir apagar a issue de `chamada.issues`, o que fica visível no diff da evidência.

## `revisar`

`node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN.MM> --arquivos <a,b,...> [--base-commit <sha>] [--raiz <dir>]`

Sai **0** (`ok`), **1** (`achados`, algum aberto), **2** (`indisponivel`) ou
**3** (`incompleta`); uso errado, **64** (inclusive `--arquivos` sem nenhum caminho,
`--base-commit` que não é commit ou fora do `revisar`, e qualquer `FATIA_*` definida
no ambiente, nos três subcomandos, com a mensagem da emenda e sem evidência);
evidência travada, **75**. Imprime `<task> <resultado>[:<motivo>]`.

- **Exclusões:** as do núcleo (`^docs/sprintx/`, `^docs/entregas/`, `^docs/eventos/`)
  mais os `padrao` de `excluir_da_revisao` do projeto, lidos pelo leitor irmão
  (`node <pasta do script>/expx-fatiamento.mjs --formato json --raiz <raiz>`), nunca do
  ambiente. Com `--base-commit`, o arquivo lido é o `.expx/fatiamento.json` do `HEAD`
  revisado, nunca o da árvore de trabalho: o leitor roda sobre uma pasta temporária com
  esse blob; ausente no `HEAD`, valem os padrões (como o ausente no disco); no `HEAD`
  como algo que não é arquivo comum (pasta, link, submódulo), `fatiamento-invalido`.
  Arquivo da task sob as do núcleo fica `revisao: "excluido"`, fora de L1 e L2. Arquivo
  presente da task sob as do projeto é `incompleta:excluido-declarado` (o que a task escreve é revisado; regenerar um gerado é commit próprio).
- **Revisável** é o predicado da CLI homologada (perfil): fora dos nomes, extensões e
  sufixos excluídos. Markdown é revisável. Os portões antes da CLI usam os números do
  perfil, iguais em todas as homologadas, e não dependem da CLI instalada.
- **Com `--base-commit`**, cada arquivo da task tem de estar commitado: o
  `hash-object` do checkout igual a `HEAD:<arquivo>`, e o apagado ausente do `HEAD`.
- Linha alterada é a dos hunks de `git diff -U0 <head>` (o checkout desde o `HEAD`; com
  `--base-commit`, `git diff -U0 <sha> <head>`); arquivo novo (ausente em `<head>`, ou em
  `<sha>`), repositório sem commit ou `git diff` que falha tem todas as linhas alteradas. Achado em linha alterada é
  `aberto` e bloqueia; nas demais é `anterior`, não bloqueia e vai para PR própria (F1).
- Achado cuja identidade está em `rejeicoes` de qualquer evidência do trabalho é
  `rejeitado` (relidas também sob a trava, antes de gravar). Revisar de novo preserva
  as rejeições da própria task.
- No Windows, `\` em `--arquivos` e no `relevant_file` da CLI vira `/`; fora dele é
  parte do nome. Espaço na ponta de um caminho é parte do nome: nunca é aparado.
- Todo caminho dado ao git é literal (`GIT_LITERAL_PATHSPECS=1`): glob (`src/[id].ts`) ou pathspec mágico
  (`:(top)x`) no nome nunca traz os hunks de outro arquivo nem esconde os do próprio.
- Arquivo apagado não vai para a CLI: fica `null` em `arquivos` e entra em
  `removidos_sem_revisao`, que o E4 da mergex lista na descrição do PR.
- `revisar` e `rejeitar` releem e gravam a evidência (temporário + `rename`) sob a trava
  `<T-NN.MM>.json.trava` (`mkdir` exclusivo; abandonada após 2 min, removida só por quem a
  confere de novo sob `<T-NN.MM>.json.trava.quebra`, que nunca é removida por idade;
  ocupada por 30 s: sai **75**, nomeando a `.quebra` velha, se houver).

### Precedência

O primeiro que se aplica decide o resultado:

| # | Resultado | Quando |
|---|---|---|
| 1 | `indisponivel:caminho-com-virgula` | caminho com vírgula (o `--include` separa por vírgula) |
| 1 | `indisponivel:arquivo-inexistente:<f>` | ausente no disco, no `HEAD` e, com `--base-commit`, na árvore de `<sha>` (o apagado pela task é removido, não inexistente); ou presente e ilegível para o git |
| 1 | `indisponivel:fatiamento-invalido` | o leitor de `.expx/fatiamento.json` falha (com `--base-commit`, o do `HEAD`, ou ele no `HEAD` não é arquivo comum) |
| 1 | `indisponivel:arquivo-nao-commitado:<f>` | com `--base-commit`, arquivo da task diferente de `HEAD` |
| 2 | `incompleta:excluido-declarado:<f>` | arquivo presente da task em `excluir_da_revisao` do projeto |
| 2 | `incompleta:L1:<n>` | mais de 40 revisáveis |
| 2 | `incompleta:L2:<f>` | o primeiro revisável, na ordem da task, acima de 5.000 linhas ou de 204.800 bytes |
| 3 | `ok` | nenhum revisável: a CLI nem é procurada (`cli` e `chamada` `null`) |
| 4 | `indisponivel:cli-ausente` | nenhum `codeant` no `PATH` |
| 4 | `indisponivel:integridade` | `codeant` fora de pacote, `package.json` de outro pacote, `bin` que não é o executável, arquivo do manifesto ausente ou diferente, `package.json` com outro `name`, `version` ou `bin`, ou o que não se consegue conferir. A CLI não roda |
| 4 | `indisponivel:versao` | versão do pacote sem perfil |
| 5 | — | a chamada |
| 6 | `incompleta:lote-falhou` | alguma linha do stderr começa com `[error] Failed to review `, qualquer que seja o JSON ou o código de saída |
| 7 | `indisponivel:erro` | `error` não nulo ou JSON ilegível |
| 8 | `incompleta:perfil` | topo fora da forma (`issues` lista de objetos, `error` nulo, `noFiles` booleano, `meta` objeto); `meta` fora da forma (`reviewed_files` lista de texto, `total_changed` inteiro, `skipped` lista de `{file, reason}` de texto, `capped` booleano); `max_files` ≠ perfil; `total_changed` ≠ revisados + pulados; motivo fora do perfil; código de saída ≠ 0 com `error` nulo |
| 9 | `incompleta:repetido:<f>` | o arquivo duas vezes em `reviewed_files` ∪ `skipped` |
| 9 | `incompleta:sobra:<f>` | revisado fora dos enviados, ou pulado fora deles por motivo que não seja `binary/generated`, `deleted` ou `excluded by pattern` (os filtros que vêm antes do `--include`) |
| 9 | `incompleta:pulado:<f>` | enviado em `skipped` |
| 9 | `incompleta:faltante:<f>` | enviado em nenhum dos dois (inclusive caminho com metacaractere de glob, como `src/[id].ts`, que o `--include` toma por padrão) |
| 10 | `indisponivel:arquivo-mudou-durante-revisao` | o blob, o checkout ou a medida de um enviado mudou durante a chamada |
| 11 | `achados` / `ok` | algum achado aberto / nenhum |

Motivos de pulo do perfil 0.5.14 (texto exato): `binary/generated`, `deleted`,
`excluded by pattern`, `too large (<n> KB, max 200 KB)`, `too large (<n> lines, max 5000)`,
`exceeded 40-file limit`. Nunca se tira número do texto do motivo.

## `conferir`

`node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN.MM>=<sha> [...]`

A regra da V12. Uma linha por task, `T-NN.MM ok`, `T-NN.MM AVISO <motivo>` ou
`T-NN.MM FALHA <motivo>`; sai **0** (tudo ok), **1** (alguma FALHA) ou **3** (só AVISO).
A evidência lida é a que está **no commit da task** (`<sha>`), nunca a do disco. As
linhas valem na ordem em que aparecem.

| Situação | `obrigatoria` | `se_disponivel` |
|---|---|---|
| `desligada` | ok | ok |
| `<sha>` não é commit | FALHA `commit-inexistente:<sha>` | FALHA |
| evidência ausente do commit | FALHA `evidencia-ausente` | AVISO `evidencia-ausente` |
| `expx_revisao` ≠ 2 (a v1 inclusive: a task se revisa de novo) | FALHA `evidencia-invalida:versao` | FALHA |
| JSON ilegível; outra task ou trabalho; `arquivos` que não é mapa, vazio ou com valor que não é mapa nem `null`; `achados` fora da forma; `resultado` fora dos quatro | FALHA `evidencia-invalida` | FALHA |
| `ok`/`achados` com `executada_em` fora de ISO 8601 ou data impossível | FALHA `evidencia-invalida:executada_em` | FALHA |
| `blob` ≠ `git rev-parse <sha>:<arquivo>` (ou `null` e o arquivo existe no commit) | FALHA `evidencia-nao-bate:<arquivo>` | FALHA |
| `indisponivel` | FALHA `indisponivel:<motivo>` | AVISO `indisponivel:<motivo>` |
| `incompleta` (não depende do modo) | FALHA `incompleta:<motivo>` | FALHA `incompleta:<motivo>` |
| `ok`/`achados` com a `revisao` de algum arquivo diferente da refeita no `conferir` (`excluido` só nas exclusões do núcleo, que em `ok`/`achados` são as únicas; senão o predicado do perfil) (`revisao`) | FALHA `evidencia-invalida:revisao` | FALHA |
| `ok`/`achados` com algum `enviado` e: `cli.versao` sem perfil (`cli.versao`); `cli.integridade` ≠ `conferida` (`integridade`); `chamada` nula, com `error` não nulo, sem `issues` lista de objetos ou sem `stdout_sha256` de 64 hex (`chamada`), o que reprova a v2 gravada antes de 2026-10-20; `meta` que não é mapa, `max_files` ≠ perfil ou motivo de pulo fora do perfil (`perfil`); `falhas_de_lote` não vazia (`lote-falhou`); mais de 40 `enviado` (`L1`); `enviado` acima de 5.000 linhas ou 204.800 bytes, ou com `bytes`/`linhas` menores que os do blob `<sha>:<arquivo>` medido de novo (`L2`); `include` diferente dos enviados, ou a reconciliação do `revisar` (repetido, sobra, pulado, faltante) que não fecha (`cobertura`) | FALHA `evidencia-invalida:<campo>` | FALHA |
| `ok`/`achados` com algum `enviado` e `head` que não é `null` nem o SHA completo de um commit (`head`), ou `modo` `base-commit` com `base_commit` que não é o SHA completo de um commit, ou `modo` `uncommitted` com `base_commit` não nulo, ou outro `modo` (`base_commit`) | FALHA `evidencia-invalida:<campo>` | FALHA |
| `ok`/`achados` com `achados` diferente dos derivados de `chamada.issues` (de nenhuma, sem `enviado`), com as linhas alteradas de `git diff -U0 <de> <sha>` (`<de>`: `base_commit` com `--base-commit`, senão `head`) e as vizinhas do blob do commit: outra quantidade, ordem, `identidade`, `arquivo`, `linha`, `label` ou `texto`, ou `estado` diferente do derivado, exceto `rejeitado` com a identidade em `rejeicoes` da evidência ou de outra evidência do trabalho no commit; ou `resultado` que não é `achados` com algum `aberto` e `ok` sem nenhum | FALHA `evidencia-invalida:achados` | FALHA |
| achado `aberto` | FALHA `achados-abertos:<n>` | FALHA |

## `rejeitar`

`node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN.MM> --identidade <hex> --motivo <texto>`

Acrescenta `{identidade, motivo, em}` em `rejeicoes` e muda o achado para
`rejeitado`; o `resultado` é recalculado, exceto `indisponivel` e `incompleta`, que
não mudam (rejeitar um achado não cobre o que a CLI não revisou). Sai 1 se a evidência
ou o achado não existe.

Só o desenvolvedor rejeita. O agente classifica, deduplica e contesta (bloqueio
`revisao_contestada`), nunca aceita risco. Como o agente pode escrever o arquivo,
a rejeição gravada não basta: **cada achado rejeitado é confirmação obrigatória
no PR**, e o E9 da mergex não mergeia sem a confirmação explícita do
desenvolvedor no PR para cada um.

## Orientação ao consumidor

Na sprintx (F6), `incompleta` vira o bloqueio da classe **`revisao_incompleta`**
(emenda, 8), nunca contestação, com a rota pelo motivo:

| Motivo | Rota |
|---|---|
| `L1` | dividir a task |
| `L2` | uma task anterior divide o arquivo |
| `excluido-declarado` | tirar o arquivo da lista de exclusão ou da task |
| `perfil` | instalar a versão homologada ou homologar a nova |
| `lote-falhou` | revisar de novo a task inteira |
| `pulado`, `faltante`, `sobra`, `repetido` | diagnóstico |

`indisponivel` depende do modo (`obrigatoria`: a task não fecha). Na mergex, a V12
mapeia a saída 3 do `revisar` e o `FALHA incompleta:<motivo>` do `conferir`.

## Perfis e testes de conformidade

- O perfil da versão é gerado pela homologação (`scripts/homologar-codeant-cli.mjs`, do
  desenvolvedor): baixa o tarball do npm, confere o sha512 contra `dist.integrity` e
  grava o manifesto. Homologar versão que mude números, exclusões ou motivos é emenda
  nova.
- Os testes de conformidade com a CLI real e logada ficam em
  `fixtures/conformidade/codeant-cli-<versão>/` (`LEIAME.md`, `conformidade.sh` e o
  stdout da CLI byte a byte), nunca em `nucleo/`. Quem os roda é o desenvolvedor, ao
  homologar.
- A suíte usa uma **CLI falsa** instalada como pacote npm
  (`src/teste/codeant-falsa.ts`: link no POSIX, shim `.cmd` no Windows) que serve esses
  JSONs, e um núcleo de teste cujo perfil tem o manifesto dela; nenhuma variável de
  ambiente troca o perfil.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-18 | Contrato criado: evidência v1, identidade com as linhas vizinhas, `revisar`, `conferir` e `rejeitar`. |
| 2026-10-18 | `conferir` exige, em `ok`/`achados`, `cli.versao` ≥ 0.5.14, `executada_em` ISO 8601 e `lotes` que cobrem os arquivos presentes (`evidencia-invalida:<campo>`). |
| 2026-10-18 | Trava velha removida sob `.quebra`: quem a viu velha não remove a trava nova de outro processo; a `.quebra` velha só sai à mão. |
| 2026-10-18 | `revisar` relê sob a trava as rejeições de todas as evidências do trabalho, não só as da própria task. |
| 2026-10-18 | `\` só vira `/` no Windows: fora dele é parte do nome, e o arquivo deixava de ser achado. |
| 2026-10-19 | Caminhos de `--arquivos` não são aparados: espaço na ponta é parte do nome, e aparar revisava outro arquivo ou o dava por ausente. |
| 2026-10-20 | **v2** (emenda de 2026-10-19, limites do CodeAnt, fixos): lista exata de versões homologadas, localização e integridade do pacote, execução pelo arquivo conferido; sem lotes; `--base-commit`; exclusões, L1 e L2 antes da CLI; reconciliação com `meta`, `skipped` e stderr; resultado `incompleta` (saída 3); evidência v2; `conferir` reprova `incompleta` em qualquer modo e evidência fora do perfil; `FATIA_*` no ambiente é uso errado. |
| 2026-10-20 | Revisão da PR 5: `conferir` refaz a classificação `revisao` de cada arquivo (`evidencia-invalida:revisao`), exige `chamada.error` nulo e `include` igual aos enviados, e aplica a reconciliação do `revisar` (`cobertura`); o git recebe caminhos literais. |
| 2026-10-20 | A evidência guarda as `issues` da CLI cruas, o `stdout_sha256` e o `head` da revisão; o `conferir` deriva os `achados` das `issues` gravadas (`evidencia-invalida:achados`, `head`, `base_commit`), e `rejeitado` exige a rejeição gravada. Continua `expx_revisao: 2`, com os campos novos obrigatórios em `ok`/`achados`: nenhum consumidor grava v2 além do núcleo (a V12 da mergex e a sprintx ainda não existem), e a v2 sem eles reprova (`evidencia-invalida:chamada`) e se revisa de novo. Arquivo novo, no `revisar` sem `--base-commit`, passa a ser o ausente do `HEAD` (antes, o fora do índice), a mesma regra do `conferir`. Limite aceito: quem edita a evidência edita as `issues`; a defesa é o diff da evidência no PR. |
| 2026-10-20 | Com `--base-commit`, `excluir_da_revisao` vem do `.expx/fatiamento.json` do `HEAD` revisado, não da árvore de trabalho (achado do CodeAnt na AxisGov/mergex#38): uma exclusão só no disco não vale, e a versionada vale mesmo apagada do disco. |
