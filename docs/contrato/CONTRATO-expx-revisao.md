# Contrato `expx-revisao` v1 — revisão por task pela CLI do CodeAnt

Cada task do método passa pela CLI do CodeAnt antes do commit, e o portão do PR
confere que passou. Este contrato define a evidência que a revisão grava, a
identidade de um achado, e o que `revisar`, `conferir` e `rejeitar` fazem. Quem o
implementa é `nucleo/scripts/expx-revisao.mjs`, instalado em
`.expx/marketplace/plugins/expx/nucleo/scripts/`; quem o chama são a sprintx (passo
de revisão da F6) e a mergex (V12 no E2), nos planos delas. O modo vem de
`revisao_por_task.modo` em `.expx/fatiamento.json` (§5.2 de
`CONTRATO-expx-instalacao.md`); o desenho é a seção 4.2 de
`docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md`.

## A CLI

- Versão mínima **0.5.14** (a 0.5.1 não explica o achado). Abaixo dela a revisão
  é `indisponivel:versao`; o método orienta `npm i -g codeant-cli@latest`, mas o
  agente não instala nem atualiza a CLI.
- Comando: `codeant review --uncommitted --headless --include <arquivos da task>`.
  O **código de saída não é usado**, nem `--fail-on`: a CLI sai 0 com achados
  (spike de 2026-10-18). Vale o JSON
  `{issues:[{issue_content, relevant_file, start_line, label}], meta:{reviewed_files, total_changed, skipped, capped, max_files}, error, noFiles}`,
  lido a partir do primeiro `{` que forma JSON (o npm pode avisar antes). Não há
  severidade: todo achado em linha alterada conta.
- **Credencial é do desenvolvedor.** O agente nunca roda `codeant login` nem
  `set-codeant-api-key`, nunca define `CODEANT_API_TOKEN` e nunca lê nem imprime
  `~/.codeant/config.json`. Sem login, a revisão é `indisponivel`, nunca aprovação.

## A evidência

`docs/entregas/<trabalho>/revisao/<T-NN>.json`, commitada pelo E1 no commit da
task (artefato de método: fora de F2/F3 e da revisão de PR). Chaves, todas sempre
presentes (R6) exceto `motivo`:

| Chave | O que é |
|---|---|
| `expx_revisao` | `1` |
| `trabalho`, `task` | o slug e o `T-NN` |
| `cli.versao` | a versão informada por `codeant --version`; `null` se não houve |
| `executada_em` | timestamp ISO (R4) |
| `arquivos` | `{<caminho>: <blob>}`: o sha1 do blob que vai para o commit (`git hash-object`, com os filtros de fim de linha); `null` para arquivo removido |
| `lotes` | `[{include, meta, error}]`, um por chamada que valeu |
| `resultado` | `ok`, `achados` (algum `aberto`) ou `indisponivel` |
| `motivo` | só com `indisponivel` (tabela abaixo) |
| `achados` | `[{identidade, arquivo, linha, label, texto, estado}]`, `estado` ∈ `aberto`, `anterior`, `rejeitado` |
| `rejeicoes` | `[{identidade, motivo, em}]` |
| `removidos_sem_revisao` | caminhos apagados pela task |

**Identidade** de um achado: sha256, em hex, de
`label \0 arquivo \0 linha anterior \0 linha apontada \0 linha seguinte \0 versão da CLI`,
com as linhas sem espaço nas pontas e vazias fora do arquivo. As vizinhas
separam linhas de texto idêntico sem depender do número da linha; mudar o trecho
ou a versão da CLI muda a identidade e reabre o achado.

## `revisar`

`node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN> --arquivos <a,b,...> [--raiz <dir>]`

Sai **0** (ok), **1** (achado aberto) ou **2** (`indisponivel`); uso errado
(inclusive `--arquivos` sem nenhum caminho), **64**.
Imprime uma linha de resumo.

- Linha alterada é a dos hunks de `git diff -U0 HEAD`; arquivo não rastreado (ou
  `git diff` que falha, como sem `HEAD`) tem todas as linhas alteradas. Achado em linha alterada é `aberto` e bloqueia; nas
  demais é `anterior`, não bloqueia e vai para PR própria (F1).
- Achado cuja identidade está em `rejeicoes` de qualquer evidência do trabalho é
  `rejeitado`. Revisar de novo preserva as rejeições da própria task.
- Mais arquivos que o `meta.max_files` informado: revisa em lotes; a task passa só
  se todos passam.
- Arquivo apagado não vai para a CLI (não há linha onde ancorar achado): fica
  `null` em `arquivos` e entra em `removidos_sem_revisao`, que o E4 da mergex lista
  na descrição do PR.
- O blob de cada arquivo é tirado antes e depois da chamada da CLI: a evidência
  nunca fica amarrada a bytes que a CLI não viu.
- `revisar` e `rejeitar` releem e regravam a evidência sob uma trava por arquivo
  (`<T-NN>.json.trava`, criada por `mkdir` exclusivo; abandonada depois de 2 min),
  gravando por arquivo temporário + `rename`: uma rejeição feita enquanto a CLI
  roda não se perde. Trava ocupada por mais de 30 s: sai **75**.

| Motivo de `indisponivel` | Quando |
|---|---|
| `cli-ausente` | `codeant` não está no PATH |
| `versao` | versão abaixo de 0.5.14 ou ilegível |
| `erro` | `error` não nulo ou JSON ilegível |
| `incompleta` | `meta.capped`, `noFiles`, arquivo da task em `meta.skipped` sem ser por padrão de exclusão, ou `meta.reviewed_files` abaixo dos arquivos pedidos |
| `caminho-com-virgula` | caminho com vírgula (o `--include` separa por vírgula) |
| `arquivo-inexistente:<caminho>` | caminho que não existe nem no disco nem no `HEAD` |
| `arquivo-mudou-durante-revisao` | o blob mudou durante a chamada da CLI |

## `conferir`

`node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN>=<sha> [...]`

A regra da V12. Uma linha por task, `T-NN ok`, `T-NN AVISO <motivo>` ou
`T-NN FALHA <motivo>`; sai **0** (tudo ok), **1** (alguma FALHA) ou **3** (só AVISO).
A evidência lida é a que está **no commit da task** (`<sha>`), nunca a do disco:
editar o arquivo depois do commit não muda o veredito. As linhas abaixo valem na
ordem em que aparecem.

| Situação | `obrigatoria` | `se_disponivel` |
|---|---|---|
| `desligada` | ok | ok |
| `<sha>` não é commit | FALHA `commit-inexistente:<sha>` | FALHA |
| evidência ausente do commit | FALHA `evidencia-ausente` | AVISO `evidencia-ausente` |
| JSON ilegível; outra task ou trabalho; `expx_revisao` ≠ 1; `arquivos` que não é mapa ou vazio; `achados` que não é lista, ou achado sem `identidade` sha256 ou com `estado` fora de `aberto`, `anterior`, `rejeitado`; `resultado` desconhecido | FALHA `evidencia-invalida` | FALHA |
| blob ≠ `git rev-parse <sha>:<arquivo>` (ou `null` e o arquivo existe no commit) | FALHA `evidencia-nao-bate:<arquivo>` | FALHA |
| `indisponivel` | FALHA `indisponivel:<motivo>` | AVISO `indisponivel:<motivo>` |
| achado `aberto`, ou `resultado: achados` | FALHA `achados-abertos:<n>` | FALHA |

## `rejeitar`

`node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN> --identidade <hex> --motivo <texto>`

Acrescenta `{identidade, motivo, em}` em `rejeicoes` e muda o achado para
`rejeitado`; o `resultado` é recalculado, exceto `indisponivel`, que não muda.
Sai 1 se a evidência ou o achado não existe.

Só o desenvolvedor rejeita. O agente classifica, deduplica e contesta (bloqueio
`revisao_contestada`), nunca aceita risco. Como o agente pode escrever o arquivo,
a rejeição gravada não basta: **cada achado rejeitado é confirmação obrigatória
no PR**, e o E9 da mergex não mergeia sem a confirmação explícita do
desenvolvedor no PR para cada um.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-18 | Contrato criado: evidência v1, identidade com as linhas vizinhas, `revisar`, `conferir` e `rejeitar`. |
