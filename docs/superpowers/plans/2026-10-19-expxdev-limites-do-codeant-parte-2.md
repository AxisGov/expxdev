# Limites do CodeAnt, fixos — plano de implementação (expxdev), parte 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Continuação de `2026-10-19-expxdev-limites-do-codeant.md`: Goal, Architecture, Spec, decisões, Global Constraints, Review Focus e a tabela de blocos estão lá e valem aqui. Esta parte tem o bloco C (revisão por task), a release, o que fica para a mergex e a sprintx, e os pontos em aberto.

Pré-requisito: blocos A1, A2, A3 e B mergeados. O bloco C é medido só por L2 e L3.

---

## Bloco C (PR 5) — revisão por task v2

### Task C1: CLI falsa como pacote, localização e integridade

**Files:**
- Create: `src/teste/codeant-falsa.ts`
- Modify: `nucleo/scripts/expx-limites.mjs`
- Modify: `nucleo/scripts/expx-revisao.mjs` (sai `VERSAO_MINIMA` :15 e a conferência por `--version` :132-139; `codeant()` :93-98 passa a rodar `process.execPath <bin conferido>`)
- Modify: `src/nucleo/expx-revisao.test.ts` (o `cenario()` :23-48 passa a usar o helper)
- Test: `src/nucleo/expx-limites.test.ts`

**Interfaces:**
- Produces, no módulo:
  - `localizarPacote(env: Record<string, string | undefined>, plataforma: string): {ok: true, bin: string, pacote: string, versao: string} | {ok: false, motivo: "cli-ausente" | "integridade", detalhe: string}`. Procura `codeant` no `PATH` (no Windows, `PATHEXT`, como o `cmd.exe`); segue link por `realpath`; shim do npm (`.cmd`, ou `sh` com `node_modules/codeant-cli/`) é lido como texto e o alvo, relativo à pasta do shim, extraído por `node_modules[\\/]codeant-cli[\\/]([^"'\s%]+)`; sobe do alvo, passando por `package.json` de outro nome, até o que tem `name` `codeant-cli` (nenhum: `integridade`); o `bin` dele (texto, ou `bin.codeant`) resolvido na pasta do pacote tem de ser o alvo (no Windows, sem diferença de maiúsculas). Nenhum `codeant` no `PATH`: `cli-ausente`; o resto que falha: `integridade`.
  - `conferirIntegridade(pacote: string, perfil: PerfilCli): string | null` — `null` se cada arquivo do `manifesto` (menos `package.json`) existe com o mesmo sha256 e `package.json` tem `name`, `version` e `bin` iguais a `perfil.package_json`; senão o detalhe (`arquivo-ausente:<c>`, `arquivo-diferente:<c>`, `package-json`). Arquivo a mais no pacote e `node_modules` não são conferidos (limite aceito, emenda §6).
- Produces, no teste: `instalarCodeantFalsa(base: string, cfg: CfgFalsa): {path: string, manifesto: Record<string, string>}` monta o layout do npm da plataforma (POSIX: `prefixo/lib/node_modules/codeant-cli/` e o link `prefixo/bin/codeant`; Windows: `prefixo/node_modules/codeant-cli/` e o shim `prefixo/codeant.cmd`). `CfgFalsa = {versao?: string, fixture?: "limite40" | "limite41" | "pulos" | "pulos-uncommitted", resposta?: object, stderr?: string, issues?: object[], durante?: [string, string], reescreve?: string}`: `fixture` serve o JSON da #60 cru (`respostaDoCaso` da Task B2); `resposta`, um JSON montado; `stderr` vai para o stderr. Cada chamada vai para `chamadas.jsonl`. `nucleoDeTeste(base: string, falsa): string` copia `nucleo/scripts/` para `<base>/nucleo/scripts/`, troca no perfil 0.5.14 só `manifesto` e `package_json` pelos da falsa, e devolve o caminho do `expx-revisao.mjs` copiado. Nenhuma variável de ambiente troca o perfil.

- [ ] **Step 1: Write the failing tests** (Review Focus 5):
  - `expx-limites.test.ts`: `localiza a falsa pelo link e pelo shim do npm`; `codeant fora de pacote (script solto no PATH) → integridade`; `package.json de outro pacote → integridade`; `bin que aponta para outro arquivo → integridade`; `PATH sem codeant → cli-ausente`; `conferirIntegridade: igual → null; arquivo editado → arquivo-diferente:<c>; arquivo apagado → arquivo-ausente:<c>; version 0.5.15 no package.json → package-json`.
  - `expx-revisao.test.ts`: `a falsa com o perfil de teste revisa (ok)`; `a falsa com o perfil real → indisponivel:integridade, nenhuma chamada de review`; `versão 0.5.15 sem perfil → indisponivel:versao`; `PATH sem codeant → indisponivel:cli-ausente`; `a CLI roda pelo node no arquivo conferido, não pelo shim` (a falsa registra `process.argv[1]`).
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-limites.test.ts src/nucleo/expx-revisao.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement**. Ordem no `revisar`: localizar → versão homologada (`perfilCli(versao)`) → `conferirIntegridade` → chamada. `ev.cli = {versao, integridade: "conferida"}`.
- [ ] **Step 4: Run** a suíte do Step 2 — Expected: PASS (os casos antigos migrados para o helper).
- [ ] **Step 5: Commit** `feat(expxdev): revisao confere a integridade do pacote da CLI antes de rodar`.

### Task C2: `revisar` v2 — sem lotes, portões antes e depois da CLI

**Files:**
- Modify: `nucleo/scripts/expx-revisao.mjs` (`revisar` :115-184; saem os lotes :140-167)
- Test: `src/nucleo/expx-revisao.test.ts`

**Interfaces:**
- Produces: `revisar --trabalho <slug> --task <id> --arquivos <a,b,…> [--base-commit <sha>] [--raiz <dir>]`. Saída 0 `ok`, 1 `achados`, 2 `indisponivel`, **3 `incompleta`**, 64 uso (inclusive `FATIA_*` no ambiente, nos três subcomandos), 75 trava. Resumo no stdout: `<task> <resultado>[:<motivo>]`.
- Exclusões: `EXCLUIDOS_DO_NUCLEO` mais os `padrao` de `excluir_da_revisao` lidos pelo leitor irmão (`node <pasta do script>/expx-fatiamento.mjs --formato json --raiz <raiz>`); leitor que falha: `indisponivel:fatiamento-invalido`.
- Medida de cada arquivo presente: blob (sem `--base-commit`: `git hash-object -w -- <f>` e `git cat-file blob`, para ter os bytes que vão ao commit — o objeto solto fica para o `gc`, e o índice não muda; com `--base-commit`: `HEAD:<f>`) e checkout (`readFileSync`), cada um por `medir`; vale o maior. Com `--base-commit`, arquivo da task cujo `hash-object` difere de `HEAD:<f>`: `indisponivel:arquivo-nao-commitado:<f>`.
- Precedência (o primeiro que se aplica):
  1. `indisponivel:caminho-com-virgula`, `indisponivel:arquivo-inexistente:<f>` (ausente no disco, no `HEAD` e, com `--base-commit`, na árvore de `<sha>`; o apagado pela task é removido, não inexistente), `indisponivel:fatiamento-invalido`, `indisponivel:arquivo-nao-commitado:<f>`;
  2. `incompleta:excluido-declarado:<f>` (arquivo presente da task que casa um item de `excluir_da_revisao` do projeto; o que casa as exclusões do núcleo fica `revisao: "excluido"`, fora de L1 e L2), `incompleta:L1:<n>` (revisáveis > 40), `incompleta:L2:<f>` (primeiro em ordem, acima de 5.000 linhas ou 204.800 bytes) — antes da CLI, valem em qualquer modo;
  3. sem revisável: `ok` sem localizar nem chamar a CLI (`cli: null`, `chamada: null`);
  4. `indisponivel:cli-ausente`, `indisponivel:integridade`, `indisponivel:versao`;
  5. uma chamada: `review --headless --uncommitted --include <revisáveis>` ou `review --headless --base-commit <sha> --include <revisáveis>`;
  6. `incompleta:lote-falhou` — alguma linha do stderr começa com `[error] Failed to review `, qualquer que seja o JSON ou o código de saída;
  7. `indisponivel:erro` — `error` não nulo ou JSON ilegível;
  8. `incompleta:perfil` — topo fora da forma (`issues` lista, `error` nulo, `noFiles` booleano, `meta` objeto); `meta` fora da forma (`reviewed_files` lista de texto, `total_changed` inteiro, `skipped` lista de `{file, reason}` de texto, `capped` booleano); `max_files` ≠ perfil; `total_changed` ≠ revisados + pulados; motivo fora de `motivos` do perfil; código de saída ≠ 0 com `error` nulo;
  9. reconciliação com `I` = revisáveis enviados: `incompleta:repetido:<f>` (duas vezes em `reviewed_files` ∪ `skipped`), `incompleta:sobra:<f>` (revisado fora de `I`, ou pulado fora de `I` por motivo que não seja `binary/generated`, `deleted` ou `excluded by pattern`, os filtros que a #60 mostrou virem antes do `--include`), `incompleta:pulado:<f>` (de `I`, em `skipped`), `incompleta:faltante:<f>` (de `I`, em nenhum dos dois);
  10. `indisponivel:arquivo-mudou-durante-revisao` — o blob e a medida de cada arquivo enviado são refeitos logo depois da chamada e comparados com os de antes;
  11. `achados` / `ok`, como hoje.
- Evidência `expx_revisao: 2`: `{expx_revisao, trabalho, task, modo: "uncommitted" | "base-commit", base_commit: <sha> | null, cli: {versao, integridade} | null, executada_em, arquivos: {<f>: {blob, bytes, linhas, revisao: "enviado" | "nao-revisavel" | "excluido"} | null}, chamada: {include, meta, error, falhas_de_lote: [<linha>]} | null, resultado: "ok" | "achados" | "incompleta" | "indisponivel", motivo?, achados, rejeicoes, removidos_sem_revisao}`. `identidade` e achados como na v1.

- [ ] **Step 1: Write the failing tests** (com `arquivosDoCaso`/`respostaDoCaso` da Task B2 e a falsa da C1):
  - `limite40.json: 40 revisáveis, com 5.000 linhas sem quebra final e 204.800 bytes → ok; uma chamada, --include com os 40, evidência com bytes e linhas`.
  - `41 revisáveis → incompleta:L1:41, sem chamar a CLI` (também com `PATH` sem `codeant`: rc 3, nunca 2).
  - `5.000 linhas com quebra final → incompleta:L2:<f>, sem chamar a CLI`.
  - `CRLF no checkout acima de 204.800 com blob abaixo → incompleta:L2` (Review Focus 1).
  - `task com notas.md, manual.pdf, logo.png, package-lock.json e apagado.js → --include só notas.md; a resposta que a CLI daria (as entradas de pulos.json dos arquivos da task) → ok`.
  - `limite41.json servido a uma task com f01–f40 → incompleta:sobra:f41.js` (corte fora de `I` contraria a ordem dos filtros); `pulos.json inteiro servido à task de notas.md → incompleta:sobra:bytes-204801.js`.
  - `pulos-uncommitted.json (noFiles) servido a uma task com notas.md → incompleta:faltante:notas.md` (a mesma resposta, sem as entradas de tamanho, que fora de `I` seriam sobra).
  - `stderr com "[error] Failed to review a.js: 500" e JSON limpo → incompleta:lote-falhou, rc 3`; `o mesmo com error não nulo → incompleta:lote-falhou`.
  - `max_files 15 → incompleta:perfil`; `reason "too big" → incompleta:perfil`; `total_changed errado → incompleta:perfil`; `meta ausente → incompleta:perfil`; `noFiles "x" → incompleta:perfil`; `saída 1 com error nulo → incompleta:perfil`.
  - `arquivo da task em skipped com "too large (200 KB, max 200 KB)" → incompleta:pulado:<f>`.
  - `src/[id].ts na task e resposta sem ele → incompleta:faltante:src/[id].ts` (Review Focus 4).
  - `arquivo da task em excluir_da_revisao do projeto → incompleta:excluido-declarado:<f>`; `arquivo da task em ^docs/entregas/ → fora do --include, revisao "excluido", não bloqueia`; `arquivo apagado em pasta excluída não bloqueia`.
  - `--base-commit com arquivo apagado desde <sha> → removido, não arquivo-inexistente`.
  - `.expx/fatiamento.json inválido → indisponivel:fatiamento-invalido`.
  - `--base-commit: chama --base-commit <sha>, linhas alteradas pelo diff desde <sha>`; `arquivo da task alterado e não commitado → indisponivel:arquivo-nao-commitado:<f>`.
  - `FATIA_X no ambiente → rc 64 com a mensagem, sem evidência` (também em `conferir` e `rejeitar`).
  - Os casos de hoje que falam de lotes saem; os demais (rejeições, trava, CRLF do blob, vírgula, avisos antes do JSON, arquivo alterado durante a chamada pelo `durante` da falsa) ficam.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-revisao.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** na ordem da precedência.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(expxdev): revisao por task sem lotes, com cobertura completa e incompleta` (dois commits se ficar grande: portões antes da CLI; reconciliação depois).

### Task C3: `conferir` e `rejeitar` v2

**Files:**
- Modify: `nucleo/scripts/expx-revisao.mjs` (`semSinalDaCli` :215-227, `veredito` :230-252, `rejeitar` :260-276)
- Test: `src/nucleo/expx-revisao.test.ts`

**Interfaces:**
- Produces: `conferir` com as saídas de hoje (0 ok, 1 FALHA, 3 só AVISO). Por task, nesta ordem:
  1. `desligada` → `ok`;
  2. `FALHA commit-inexistente:<sha>`; evidência ausente → `FALHA`/`AVISO` pelo modo;
  3. `FALHA evidencia-invalida[:<campo>]` — `expx_revisao` ≠ 2 (`:versao`), forma errada, `resultado` fora dos quatro;
  4. `FALHA evidencia-nao-bate:<f>` — blob ≠ `<sha>:<f>` (ou presença diferente);
  5. `indisponivel` → `FALHA`/`AVISO` pelo modo;
  6. `incompleta` → **`FALHA incompleta:<motivo>`** em `obrigatoria` e em `se_disponivel`;
  7. em `ok`/`achados` com algum `enviado`, `FALHA evidencia-invalida:<campo>` para: `cli.versao` sem perfil (`cli.versao`), `cli.integridade` ≠ `conferida` (`integridade`), `chamada.meta.max_files` ≠ perfil ou motivo fora do perfil (`perfil`), `falhas_de_lote` não vazia (`lote-falhou`), mais de 40 `enviado` (`L1`), `enviado` acima de 5.000/204.800, ou com `bytes`/`linhas` menores que os do blob `<sha>:<f>` medido de novo por `medir` (`L2`), `enviado` fora de `reviewed_files` ou pulado (`cobertura`), `chamada` nula (`chamada`);
  8. `FALHA achados-abertos:<n>`; senão `ok`.
- `rejeitar`: como hoje; não muda o `resultado` de `indisponivel` nem de `incompleta`.

- [ ] **Step 1: Write the failing tests:** um por item 3–7 (inclusive `evidência v1 → FALHA evidencia-invalida:versao`, `incompleta é FALHA em se_disponivel`, `ok com max_files 15 forjado → FALHA evidencia-invalida:perfil`, `ok com enviado de 5.001 linhas forjado → FALHA evidencia-invalida:L2`) e `rejeitar não tira a evidência de incompleta`.
- [ ] **Step 2: Run** `npx vitest run src/nucleo/expx-revisao.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm run typecheck && npm test` — Expected: verde.
- [ ] **Step 5: Commit** `feat(expxdev): conferir reprova revisao incompleta e evidencia fora do perfil`.

### Task C4: contrato `expx-revisao` v2

**Files:**
- Modify: `docs/contrato/CONTRATO-expx-revisao.md`, `nucleo/README.md` (:56 em diante), `docs/contrato/CONVENCOES.md` (:161)

- [ ] **Step 1:** Reescreva a partir das Interfaces de C1–C3, sem repetir código: a lista exata de homologadas no lugar da mínima e do `@latest` (`npm i -g codeant-cli@0.5.14`); a localização, a integridade e o limite aceito (`node_modules`); a execução pelo arquivo conferido; o comando (`--uncommitted` na F6, `--base-commit` para o commitado, nunca `--last-n-commits`); sem lotes; os dois portões; a evidência v2; os resultados, os motivos e a precedência; os códigos de saída (`revisar` 3 = `incompleta`); a tabela do `conferir`; a classe `revisao_incompleta` da sprintx e a rota por motivo (emenda §8, sprintx F6) como orientação ao consumidor; os perfis e os testes de conformidade (quem roda, onde ficam, a CLI falsa); histórico.
- [ ] **Step 2: Run** `npm test` e `bash scripts/verificar-fatiamento.sh --excluir-da-revisao '^fixtures/candidatos/' origin/main HEAD` — Expected: verde, exit 0.
- [ ] **Step 3: Commit** `docs(expxdev): contrato expx-revisao v2`. Abra a PR 5.

## R — Release

- [ ] **Step 1:** Depois do merge da PR 5, confira a release que a CI publica: `gh release view cli-<sha7 do merge> -R AxisGov/expxdev` — Expected: a release existe, com o pacote. Se o job `release` foi cancelado por outro push, dispare `gh workflow run ci.yml -R AxisGov/expxdev -f ref=<sha>`.
- [ ] **Step 2:** **Não** rode `scripts/liberar-versao.sh`: a versão liberada aos projetos é o passo 5 da emenda, depois da mergex e da sprintx. Registre o `cli-<sha7>` na PR 5.

## Depois do expxdev

Cada item é um plano próprio, no repositório dele; aqui só o que eles precisam do expxdev.

**Passo 0:** as divisões já estão mergeadas (sprintx#39, mergex#35); o inventário de `.expx/fatiamento.json` e `FATIA_*` no login e no conselho é do desenvolvedor e alimenta a transição (§9).

**mergex** (emenda §8 e §10):
- `fatiamento-da-pr.sh` volta a ser o espelho byte a byte do `verificar-fatiamento.sh` do merge da PR 4 (cabeçalho `Origem` e `Corpo-sha256`; sem lista de variáveis); o E7 passa `--excluir-da-revisao` de cada `padrao` de `EXPX_EXCLUIR_DA_REVISAO` lido do leitor no SHA publicado; "Quando falha" cita L2 e L3.
- `leitor-do-projeto.sh`: saída padrão sem `FATIA_*`; chaves exigidas do leitor = as `EXPX_*` da parte 1 (inclusive `EXPX_EXCLUIR_DA_REVISAO` e `EXPX_L*`); saída 3 quando o commit versiona outro leitor fica.
- Cópia do núcleo (`scripts/ci/fixtures/candidatos/expx-nucleo/`) regerada da release R: o `atualizar-nucleo-expx.sh` passa a copiar também `expx-limites.mjs` e `perfis/` (o leitor e a revisão os importam).
- V12 (B1): mapeia `incompleta` (saída 3 do `revisar`, `FALHA incompleta:<motivo>` do `conferir`) e a evidência v2, sem `lotes`; C1: `revisao: incompleta:<classe>` na gramática.
- PR de planejamento: E0 `--planejamento`, E2 `n/a` e caminhos, E7 recusa fora de `^docs/(sprintx|entregas|eventos)/`, E9 nunca automático. Ajuste dos planos (emenda §10) e volta ao B1.

**sprintx:**
- F3 e o auditor (as duas cópias) com L1, L2 e L3, números lidos de `EXPX_L*` do leitor; sai o movimento mecânico.
- F6: o passo de revisão por task com `revisar` (saída 3 = `incompleta`) e os dois portões; bloqueio `revisao_incompleta` com a rota pelo motivo (`L1`, `L2`, `excluido-declarado`, `perfil`, `lote-falhou`, `pulado`/`faltante`/`sobra`/`repetido`); nunca contestação.
- F5/F6: o PR de planejamento e a espera do merge antes da primeira sprint; DS nova.

**Repin e versão liberada (passo 5):** repin das candidatas no expxdev (`scripts/fixture-candidatos.sh`), com a bancada da sprintx já dividida; testes de consistência da 4.5 sobre os perfis e `excluir_da_revisao` (corpo do espelho da mergex = verificador; números da sprintx = `limites()`); então o desenvolvedor libera a versão e os projetos migram para `expx_fatiamento: 2` (emenda §9).

## Pontos em aberto para o usuário

1. **A PR que troca o verificador (B) é medida por ele mesmo.** Pelas regras antigas ela passaria de 400 linhas e 20 arquivos; o CI roda o script da PR, então B já vale L2/L3. A1–A3 seguem 400/20/300. Alternativa: pôr B primeiro (o leitor e o resto já sob L2/L3), contra a ordem a → b → c da §11.
2. **A peça (a) da §11 vira três PRs** (A1, A2, A3) para caber em 400/20/300; a emenda fala em uma PR por peça.
3. **Evidência v1 vira FALHA** no `conferir` (`evidencia-invalida:versao`): nenhum consumidor grava v1 hoje (a V12 e o passo da sprintx ainda não existem), mas um projeto que a tenha commitada teria de revisar de novo.
4. **O verificador bash chama `node`** só para medir arquivo revisável que não é UTF-8 válido (sem node, saída 2). A mergex o espelha byte a byte, então o E7 passa a precisar de node nesse caso raro.
5. **Pulado fora do `--include`** só é aceito com `binary/generated`, `deleted` ou `excluded by pattern` (a ordem de filtros da #60); qualquer outro motivo fora da task é `sobra`. Se a CLI mudar a ordem, a revisão fica `incompleta` até nova homologação.
6. **Inventário dos projetos** (passo 0): não está no repositório; o plano só pede a confirmação antes do A1.
