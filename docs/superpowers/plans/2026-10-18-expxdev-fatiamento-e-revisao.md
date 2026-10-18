# Fatiamento por projeto e revisão por task no núcleo — plano de implementação (expxdev)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao núcleo do expx as duas peças que sprintx e mergex vão compartilhar — o leitor/validador de `.expx/fatiamento.json` e o executor/conferidor da revisão por task —, com o contrato `expx-fatiamento` v2, a medida de capacidade no verificador e o doctor.

**Architecture:** Duas ferramentas Node (ESM, sem dependências) em `nucleo/scripts/`, que o `init` já copia para todo projeto em `.expx/marketplace/plugins/expx/nucleo/scripts/`; as skills as chamam com `node <caminho>`, então uma regra existe uma vez só. O verificador de fatiamento continua lendo só variáveis `FATIA_*` (quem as preenche a partir do arquivo é o E7 da mergex, no plano dela). O doctor valida o arquivo rodando o mesmo script instalado.

**Tech Stack:** Node ≥ 20.19 (ESM puro, `node:` built-ins), bash (verificador), vitest, git.

**Spec:** `docs/superpowers/specs/2026-10-18-revisao-por-task-pr-por-sprint-design.md` (seções 4.1, 4.2, 4.5, 6.0, 7).

## Global Constraints

- `.expx/fatiamento.json` é do projeto: `init`, `add`, `remove`, `update` nunca o escrevem (como `.expx/agentes.json`).
- Ausente = padrões do contrato e comportamento de hoje. Presente e inválido = erro, nunca queda calada nos padrões.
- Capacidade (não calibrável): `pr_arquivos ≤ 100`; `arquivo.linhas ≤ 5000`.
- Padrões de legibilidade: `pr_linhas 400`, `pr_arquivos 20`, `commit_linhas 300`; arquivo `kb 150`, `linhas 4000`.
- Afrouxar qualquer limite de legibilidade acima do padrão exige `revisao_por_task.modo: "obrigatoria"`; valor diferente do padrão exige `justificativa` não vazia.
- `ignorar` soma aos padrões, nunca os substitui. `capacidade.excluido_no_painel` tem padrão `^docs/(sprintx|entregas|eventos)/`.
- CLI do CodeAnt: versão mínima **0.5.14**; o código de saída e `--fail-on` NÃO são usados (spike 6.0: saem 0 com achados); o portão lê o JSON.
- Todo achado em linha alterada pela task bloqueia; achado em linha não alterada é `anterior` e não bloqueia.
- Quem consome o leitor no shell exporta as variáveis: `set -a; eval "$(node <leitor>)"; set +a` — um `eval` sozinho cria variáveis do shell que o verificador, processo filho, não recebe (e mediria com os padrões). O contrato v2 (Task 5) e os planos da mergex e da sprintx usam essa forma.
- O agente nunca configura credencial da CLI (nem `login`, nem `set-codeant-api-key`, nem `CODEANT_API_TOKEN`).
- Fatiamento desta mudança: commits ≤ 300 linhas, PR ≤ 400 linhas e 20 arquivos (`bash scripts/verificar-fatiamento.sh origin/main HEAD`). Três PRs, uma por bloco abaixo.

## Review Focus

1. `.expx/fatiamento.json` salvo com BOM ou CRLF por editor do Windows → lido normalmente (Task 1).
2. Arquivo da task com vírgula no caminho (o `--include` da CLI separa por vírgula) → revisão `indisponivel` com o motivo, nunca revisão parcial tratada como completa (Task 6).
3. Saída da CLI com linhas de aviso do npm/npx antes do JSON → o JSON é achado e lido (Task 6).
4. Arquivo apagado pela task → não é revisado, entra na evidência como removido, e a conferência aceita (Tasks 6 e 7).
5. Evidência que não bate com o commit (arquivo editado depois da revisão) → a conferência reprova o task, nomeando o arquivo (Task 7).

---

## Bloco A (PR 1) — leitor de `.expx/fatiamento.json` e doctor

### Task 1: `nucleo/scripts/expx-fatiamento.mjs`

**Files:**
- Create: `nucleo/scripts/expx-fatiamento.mjs`
- Test: `src/nucleo/expx-fatiamento.test.ts`

**Interfaces:**
- Produces: CLI `node expx-fatiamento.mjs [--raiz <dir>] [--formato env|json] [--validar]`.
  - Sem arquivo: sai 0 com os padrões. Válido: sai 0. Inválido: sai 1, uma linha `expx-fatiamento: <chave>: <motivo>` por erro no stderr, nada no stdout. Uso errado: sai 2.
  - `--formato env` (padrão) imprime uma linha `CHAVE=valor` por variável, nesta ordem: `FATIA_MAX_LINHAS_PR`, `FATIA_MAX_ARQUIVOS`, `FATIA_MAX_LINHAS_COMMIT`, `FATIA_MAX_KB_ARQUIVO`, `FATIA_MAX_LINHAS_ARQUIVO`, `FATIA_IGNORAR_PROJETO` (os padrões de `ignorar` unidos por `|`, vazio se nenhum), `FATIA_CAPACIDADE_ARQUIVOS` (sempre `100`), `FATIA_CAPACIDADE_EXCLUIDO`, `EXPX_REVISAO_POR_TASK`, `EXPX_ENTREGA`, `EXPX_FATIAMENTO_ORIGEM` (`padrao` ou `projeto`).
  - `--formato json` imprime `{origem, legibilidade:{pr_linhas,pr_arquivos,commit_linhas}, arquivo:{kb,linhas}, ignorar:[], capacidade:{pr_arquivos:100, excluido_no_painel:[]}, revisao_por_task:{modo}, entrega, justificativa}` com os padrões preenchidos.
  - `--validar` só valida (sem stdout).
  - Valores para shell: o env sai entre aspas simples quando tiver espaço ou metacaractere, para ser seguro em `eval "$(node … )"`.

- [ ] **Step 1: Write the failing tests** (cada um cria um diretório temporário com `.expx/fatiamento.json` e roda `node` no script):
  - `sem arquivo: sai 0 com os padrões` — env contém `FATIA_MAX_LINHAS_PR=400`, `FATIA_MAX_ARQUIVOS=20`, `FATIA_MAX_LINHAS_COMMIT=300`, `FATIA_CAPACIDADE_ARQUIVOS=100`, `EXPX_REVISAO_POR_TASK=se_disponivel`, `EXPX_ENTREGA=por_trabalho`, `EXPX_FATIAMENTO_ORIGEM=padrao`.
  - `calibragem do conselho é válida` — `{expx_fatiamento:1, justificativa:"sprint de ~8 tasks", legibilidade:{pr_linhas:2500, pr_arquivos:80, commit_linhas:300}, revisao_por_task:{modo:"obrigatoria"}, entrega:"por_sprint"}` → `FATIA_MAX_LINHAS_PR=2500`, `FATIA_MAX_ARQUIVOS=80`, `EXPX_ENTREGA=por_sprint`.
  - `afrouxar sem revisão obrigatória é inválido` — o mesmo com `modo:"se_disponivel"` → rc 1, stderr cita `revisao_por_task.modo`.
  - `limite diferente do padrão sem justificativa é inválido` → rc 1, stderr cita `justificativa`.
  - `pr_arquivos acima de 100 é inválido` (101) e `arquivo.linhas acima de 5000 é inválido` (5001) → rc 1.
  - `chave desconhecida é inválida` (`{"expx_fatiamento":1,"limites":{}}`) → rc 1, cita `limites`.
  - `versão desconhecida é inválida` (`expx_fatiamento: 2`) → rc 1.
  - `ignorar com regex inválida é inválido` (`["(sem-fechar"]`) → rc 1, cita `ignorar[0]`.
  - `ignorar soma aos padrões` — `["^gerado/"]` → `FATIA_IGNORAR_PROJETO` = `^gerado/`.
  - `JSON com BOM e CRLF é lido` (Review Focus 1).
  - `JSON malformado é inválido, não padrão` → rc 1, stdout vazio.
  - `env é seguro para eval` — `ignorar:["^a b/","^x'y/"]`; rodar `bash -c 'eval "$(node script)"; printf %s "$FATIA_IGNORAR_PROJETO"'` devolve `^a b/|^x'y/`.

- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-fatiamento.test.ts` — Expected: FAIL (script não existe).
- [ ] **Step 3: Implement** o script: lê o arquivo (tira BOM), `JSON.parse`, valida estritamente (chaves conhecidas por nível; inteiros positivos; enums `modo ∈ {obrigatoria, se_disponivel, desligada}`, `entrega ∈ {por_trabalho, por_sprint}`; regex válidos como ERE do `grep -E`, porque é o bash que os aplica — sintaxe só do JavaScript, como lookahead e `\d`, é recusada), acumula todos os erros antes de sair.
- [ ] **Step 4: Run** o teste — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): leitor de .expx/fatiamento.json no nucleo`.

### Task 2: doctor valida `.expx/fatiamento.json`

**Files:**
- Modify: `src/doctor/verificadores.ts` (novo `verificarFatiamento(raiz, push)`, chamado ao lado de `verificarHooks`/`verificarRastro`, ~l.217)
- Test: `src/doctor/verificadores.test.ts`

**Interfaces:**
- Consumes: o script da Task 1. O doctor exige que a cópia instalada (`.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs`, a que as skills chamam) exista como arquivo regular, mas VALIDA com a cópia do pacote do próprio CLI (`nucleo/scripts/` ao lado do `dist/`), por `process.execPath` com `--validar`: nunca executa código que o repositório do projeto pode ter alterado (feito assim na expxdev#45).
- Produces: achados `fatiamento-invalido` (erro, problema = stderr do script) e `fatiamento-sem-leitor` (erro: arquivo presente, script ausente; correção "rode `expx update`").

- [ ] **Step 1: Write the failing tests:** `projeto sem .expx/fatiamento.json: nenhum achado de fatiamento`; `arquivo válido: nenhum achado`; `arquivo inválido: erro fatiamento-invalido com a mensagem do script`; `arquivo presente e núcleo sem o script: erro fatiamento-sem-leitor`.
- [ ] **Step 2: Run** `npx vitest run src/doctor/verificadores.test.ts` — Expected: FAIL nos três últimos.
- [ ] **Step 3: Implement** `verificarFatiamento(raiz: string, push: (a: Achado) => void): void` com `spawnSync(process.execPath, [scriptDoPacote, "--validar", "--raiz", raiz])`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): doctor valida .expx/fatiamento.json`.

### Task 3: o arquivo é do projeto — contrato de instalação, README do núcleo e preservação

**Files:**
- Modify: `docs/contrato/CONTRATO-expx-instalacao.md` (nova §5.2 "`.expx/fatiamento.json`", ao lado da §5.1 do `agentes.json`; §6 passa a citá-lo)
- Modify: `nucleo/README.md` (seção `scripts/`: o que é, como chamar, que é cópia do expxdev)
- Test: `src/cli/init.test.ts`

- [ ] **Step 1: Write the failing test** `init e update preservam .expx/fatiamento.json byte a byte` (cria o arquivo, roda `init` e depois `update`, compara bytes) e `init copia nucleo/scripts para o plugin` (o script existe em `.expx/marketplace/plugins/expx/nucleo/scripts/`).
- [ ] **Step 2: Run** `npx vitest run src/cli/init.test.ts` — Expected: o de preservação passa já (registre isso no commit: prova que a regra vale hoje) e o da cópia passa depois da Task 1; se algum falhar, corrija a montagem.
- [ ] **Step 3: Write** a §5.2 (formato, chaves, padrões, regras de validação, quem lê: sprintx F3/auditor, mergex E7, doctor) e a seção do README.
- [ ] **Step 4: Run** a suíte (`npm run build && npx vitest run`) — Expected: tudo verde (o `documentacao.test.ts` confere tabelas de contrato; ajuste se ele listar arquivos do núcleo).
- [ ] **Step 5: Commit** `docs(expxdev): .expx/fatiamento.json e do projeto (contrato de instalacao)`. Abra a PR 1.

## Bloco B (PR 2) — verificador: capacidade e artefatos de método; contrato v2

### Task 4: `scripts/verificar-fatiamento.sh` mede capacidade e ignora artefatos de método por padrão

**Files:**
- Modify: `scripts/verificar-fatiamento.sh` (padrões ~l.21-32; F2 ~l.88-95)
- Test: `src/nucleo/fatiamento.test.ts`

**Interfaces:**
- Produces: variáveis novas `FATIA_CAPACIDADE_ARQUIVOS` (padrão 100) e `FATIA_CAPACIDADE_EXCLUIDO` (padrão `^docs/(sprintx|entregas|eventos)/`); violação nova `F2c: a PR altera N arquivos visíveis ao revisor (limite 100)`. **F2c nunca é rebaixada por `FATIA_EXCECAO`** (é capacidade, como F4). O padrão de `FATIA_IGNORAR` passa a incluir `^docs/(sprintx|entregas|eventos)/`; `FATIA_IGNORAR_PROJETO`, quando definido, soma ao `FATIA_IGNORAR` efetivo.
- O corpo do script é espelhado pela mergex (`fatiamento-da-pr.sh`); o plano da mergex faz o espelho.

- [ ] **Step 1: Write the failing tests** (helpers `repo`, `escreve`, `commita`, `verifica` já existem):
  - `artefato de método não conta para F2 por padrão` — 30 arquivos em `docs/entregas/x/` + 1 de código → passa F2.
  - `F2c: 101 arquivos visíveis ao revisor reprovam mesmo com FATIA_MAX_ARQUIVOS=200 e FATIA_EXCECAO` → rc 1, saída contém `F2c:`.
  - `F2c conta artefato de método que o painel não exclui` — `FATIA_CAPACIDADE_EXCLUIDO=` (vazio) + 101 arquivos em `docs/entregas/` → `F2c:`.
  - `FATIA_IGNORAR_PROJETO soma ao padrão` — `FATIA_IGNORAR_PROJETO=^gerado/` + arquivo em `gerado/` e `package-lock.json` → nenhum dos dois conta.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/fatiamento.test.ts` — Expected: FAIL nos quatro.
- [ ] **Step 3: Implement**: padrões novos; `mede` reaproveitado com o padrão de exclusão como parâmetro (uma medida com `FATIA_IGNORAR` efetivo para F2/F3, outra com `FATIA_CAPACIDADE_EXCLUIDO` para F2c); cabeçalho do script documenta as variáveis.
- [ ] **Step 4: Run** a suíte do arquivo — Expected: PASS, inclusive os casos antigos.
- [ ] **Step 5: Commit** `feat(expxdev): fatiamento mede a capacidade do revisor e ignora artefatos de metodo`.

### Task 5: contrato `expx-fatiamento` v2

**Files:**
- Modify: `docs/contrato/CONTRATO-expx-fatiamento.md`
- Modify: `docs/contrato/CONVENCOES.md` (índice, se citar seções do contrato)

- [ ] **Step 1:** Reescreva as seções: "Capacidade × legibilidade" (F2c e F4 são capacidade; F2/F3 legibilidade calibrável); "Configuração por projeto" (aponta para a §5.2 do contrato de instalação, não repete o formato); "Afrouxar exige revisão por task obrigatória"; "Entrega por sprint" (um PR por sprint conta F2 por sprint); "Como consumir o leitor" (`set -a; eval "$(node …/expx-fatiamento.mjs)"; set +a`, e por que o `set -a`); F6 corrigida (os artefatos de método estão no padrão do verificador). Preencha o Histórico com as mudanças desde a criação (git log do arquivo) e a v2.
- [ ] **Step 2: Run** `npm run build && npx vitest run` e `bash scripts/verificar-fatiamento.sh origin/main HEAD` — Expected: verdes.
- [ ] **Step 3: Commit** `docs(expxdev): contrato expx-fatiamento v2`. Abra a PR 2.

## Bloco C (PR 3) — revisão por task no núcleo

### Task 6: `nucleo/scripts/expx-revisao.mjs revisar`

**Files:**
- Create: `nucleo/scripts/expx-revisao.mjs`
- Test: `src/nucleo/expx-revisao.test.ts` (com uma `codeant` falsa no `PATH`: script que imprime `--version` e um JSON fixo no `review`, registrando os argumentos recebidos)

**Interfaces:**
- Produces: `node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN> --arquivos <a,b,...> [--raiz <dir>]`. Grava `docs/entregas/<slug>/revisao/<T-NN>.json` e sai 0 (passou), 1 (achado bloqueante aberto) ou 2 (`indisponivel`). Imprime no stdout um resumo de uma linha.
- Evidência (`expx_revisao: 1`): `{expx_revisao, trabalho, task, cli:{versao}, executada_em, arquivos:{<caminho>: <blob-sha1 do conteúdo revisado> | null se removido}, lotes:[{include:[...], meta, error}], resultado: "ok"|"achados"|"indisponivel", motivo?, achados:[{identidade, arquivo, linha, label, texto, estado: "aberto"|"anterior"|"rejeitado"}], rejeicoes:[{identidade, motivo, em}]}`.
- `identidade` = sha256 de `label + "\0" + arquivo + "\0" + linha anterior + "\0" + linha apontada + "\0" + linha seguinte + "\0" + versão da CLI` (linhas sem espaços nas pontas; vazio fora do arquivo), em hex.

- [ ] **Step 1: Write the failing tests:**
  - `achado em linha alterada bloqueia` — task altera a linha 3 de `src/a.js`; a CLI falsa devolve achado na linha 3 → rc 1, `resultado:"achados"`, achado `estado:"aberto"`.
  - `achado em linha não alterada é anterior e não bloqueia` — achado na linha 1, task só alterou a 3 → rc 0, `estado:"anterior"`.
  - `arquivo novo não rastreado: todas as linhas contam como alteradas`.
  - `chama a CLI com --uncommitted --headless e --include dos arquivos da task; nunca com --fail-on`.
  - `lotes pelo meta.max_files` — a falsa responde `max_files: 2`; 3 arquivos → dois lotes; passa só se os dois passam.
  - `CLI ausente / versão < 0.5.14 / error não nulo / capped / arquivo da task em skipped sem ser por padrão` → rc 2, `resultado:"indisponivel"` com `motivo` (`cli-ausente`, `versao`, `erro`, `incompleta`).
  - `vírgula no caminho do arquivo → indisponivel com motivo caminho-com-virgula` (Review Focus 2).
  - `JSON precedido de avisos no stdout é lido` (Review Focus 3).
  - `arquivo apagado pela task não é revisado e fica null em arquivos` (Review Focus 4).
  - `rejeição anterior com a mesma identidade vale nesta task` — evidência de outra task do mesmo trabalho com `rejeicoes:[{identidade}]` → o achado entra como `rejeitado` e rc 0.
  - `revisar de novo preserva as rejeições da própria task`.
  - `duas linhas de texto idêntico com vizinhas diferentes têm identidades diferentes; rejeitar uma não rejeita a outra`.
  - `arquivo com CRLF no checkout (core.autocrlf=true): o blob da evidência é igual ao do commit`.
  - `arquivo alterado durante a chamada da CLI → indisponivel com motivo arquivo-mudou-durante-revisao` (a CLI falsa reescreve o arquivo antes de responder).
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-revisao.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: linhas alteradas por `git diff -U0 HEAD -- <arq>` (hunks `+a,b`); não rastreado = todas; blob por `git hash-object -- <arq>` SEM `--no-filters` (assim ele aplica a conversão de fim de linha do `git add` e dá o blob que vai para o commit, também no Windows com CRLF) ANTES e DEPOIS da chamada da CLI — se mudou durante a revisão, `indisponivel` com motivo `arquivo-mudou-durante-revisao` (a evidência nunca fica amarrada a bytes não revisados); versão por `codeant --version` comparada por semver; JSON extraído do primeiro `{` que faz `JSON.parse` do resto. Nunca lê nem imprime `~/.codeant/config.json`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): revisao por task pela CLI do CodeAnt no nucleo`.

### Task 7: `expx-revisao.mjs conferir` (a regra da V12) e `rejeitar`

**Files:**
- Modify: `nucleo/scripts/expx-revisao.mjs`
- Test: `src/nucleo/expx-revisao.test.ts`

**Interfaces:**
- Produces:
  - `conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN>=<sha-do-commit> [...]`: sai 0 (ok), 1 (FALHA) ou 3 (só AVISO); imprime uma linha por task `T-NN ok|AVISO <motivo>|FALHA <motivo>`. Regras: `desligada` → tudo ok; evidência ausente → FALHA em `obrigatoria`, AVISO em `se_disponivel`; `indisponivel` → idem; achado `aberto` → FALHA; blob de cada arquivo da evidência ≠ `git rev-parse <sha>:<arquivo>` (ou o arquivo existir no commit quando a evidência diz `null`) → FALHA `evidencia-nao-bate:<arquivo>`.
  - `rejeitar --trabalho <slug> --task <T-NN> --identidade <hex> --motivo <texto>`: acrescenta em `rejeicoes` e muda o achado para `rejeitado`. Não muda o `resultado` de `indisponivel`.
- Consumes: o formato de evidência da Task 6. É o que o E2 da mergex chama na V12 e o que a sprintx usa no passo de revisão (planos delas).

- [ ] **Step 1: Write the failing tests:** um por regra acima, incluindo `evidência que não bate com o commit reprova nomeando o arquivo` (Review Focus 5) e `rejeitar um achado aberto faz conferir passar`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** os dois subcomandos.
- [ ] **Step 4: Run** a suíte inteira (`npm run build && npx vitest run`) — Expected: verde.
- [ ] **Step 5: Commit** `feat(expxdev): conferencia e rejeicao da revisao por task`.

### Task 8: contrato da revisão por task

**Files:**
- Create: `docs/contrato/CONTRATO-expx-revisao.md` (formato da evidência, identidade, regras de `revisar`/`conferir`/`rejeitar`, versão mínima, o que nunca fazer com credencial, e que a confirmação de cada rejeição no PR é do E9 da mergex)
- Modify: `docs/contrato/CONVENCOES.md` (índice de contratos)
- Modify: `nucleo/README.md` (o segundo script)

- [ ] **Step 1:** Escreva o contrato a partir das Interfaces das Tasks 6 e 7 (sem repetir código).
- [ ] **Step 2: Run** `npm run build && npx vitest run` e o verificador de fatiamento — Expected: verdes.
- [ ] **Step 3: Commit** `docs(expxdev): contrato da revisao por task`. Abra a PR 3.

## Depois deste plano

- Release pelo `bash scripts/liberar-versao.sh` depois de cada PR mergeada.
- Planos da mergex (E7 lê o leitor e F2c espelhada; V12 chama `conferir`; entrega por sprint; E9 com a confirmação das rejeições e a revalidação após redirecionamento) e da sprintx (F3/auditor pelo leitor; passo de revisão por task com `revisar`; classes `revisao_defeito`/`revisao_contestada`; entrega por sprint).
- Repin das candidatas e testes de consistência entre sprintx e mergex na bancada P0.2 (spec 4.5).
