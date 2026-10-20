# Limites do CodeAnt, fixos — plano de implementação (mergex), parte 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Continuação de `2026-10-20-mergex-limites-do-codeant.md`: Goal, Architecture, Spec, decisões, Global Constraints, Review Focus e a tabela de blocos estão lá e valem aqui. Esta parte tem as emendas aos planos antigos da mergex (emenda §10), a volta ao B1, as dependências e os pontos para o usuário.

Pré-requisito: blocos L0, L1 e P mergeados.

---

## Emendas aos planos antigos (emenda §10)

Os planos `2026-10-18-mergex-revisao-por-task-e-merge-automatico.md` (parte 1) e `-parte-2.md` continuam valendo, **com as emendas abaixo**; onde divergem, vale esta lista. Os blocos já mergeados (A1 = #32, A2 = #33, mais #34, #35 e #36) não se reabrem: o que eles construíram com `FATIA_*` foi trocado pelos blocos L0 e L1.

### Parte 1

- **Goal** (:6): "mede o PR com os limites de `.expx/fatiamento.json`" → "mede L2 e L3, fixos, com a exclusão do projeto por argumento" (L1.4).
- **Architecture** (:15): o helper continua o único ponto que lê a configuração; o consumo `set -a; eval` fica; o leitor não imprime limite de fatiamento.
- **Global Constraints:**
  - "A única mudança visível é a F2c" (:58) → "As mudanças visíveis são L2 e L3".
  - "De onde vem a configuração" (:61-63): soma-se a decisão do usuário — no merge automático (M1/M2) e na D3 o leitor do núcleo é **executado da árvore da base** (a main), pela opção `--nucleo-da-rev` (D3, abaixo); no E7, o instalado, com a saída 3 da L1.2.
  - "Fatiamento" (:64-67): sai inteiro; vale DM-257 (espelho L2/L3, exclusão por argumento).
  - "F4" (:81-87): deixa de ser regra de crescimento. Fica só L2 (arquivo revisável ≤ 5.000 linhas e 204.800 bytes): hoje nenhum arquivo da mergex passa de 150 KB nem de 4.000 linhas. A organização que ela criou fica como está (DMs novas no arquivo de `decisoes/`, testes novos em `scripts/ci/test-*.sh`, references novos 14 e 15 em vez de crescer o `09-revisao.md`).
  - "Fatiamento desta mudança" (:88-92): "commit ≤ 300; PR ≤ 400 e 20" → a regra da parte 1 deste plano (L2/L3, `--excluir-da-revisao '^scripts/ci/fixtures/candidatos/'`). As estimativas de linhas por PR das tasks deixam de ser limite.
- **Review Focus 1** (:96): fica, testado na L1.4 (exclusão do SHA publicado, não do disco).
- **Tasks A1–A4** (:109-210): concluídas e superadas — A1 por L0/L1.1, A2 por L1.3, A3 por L1.2, A4 por L1.4. Os casos com `FATIA_*`, `pr_linhas`, `ignorar` e F2c saem dos testes na L1; a DM-236 ("F2c nunca rebaixada") vira histórico, substituída pela DM-257.
- **Task B1** (:212-256): reescrita abaixo ("A volta ao B1").
- **Task B2/B3** (:258-298): sem mudança de conteúdo; a seção da V12 (B3) cita `incompleta` como FALHA nos dois modos e a tabela da Task B1 emendada.
- **Task C1** (:302-318): a gramática de `revisao:` (:311) fica `ok`, `achados`, `indisponivel:<classe>`, **`incompleta:<classe>`**, **`invalida`** ou `null`. O valor **não** sai da evidência: sai da linha do `conferir --modo obrigatoria --task <T>=<commit da task>` (mapeamento na C2). A classe é o texto do motivo antes do segundo `:`, como vier (`incompleta:L1:41` → `incompleta:L1`); a gramática da classe passa a `[A-Za-z0-9][A-Za-z0-9-]*` (ponto 6). Caso novo: `incompleta:L1:41 grava revisao: incompleta:L1`.
- **Task C2** (:320-336): "Consumes: o formato da evidência do contrato `expx-revisao` v1" (:330) → consome o `conferir`, depois do commit da task: `ok` → `ok`; `FALHA achados-abertos:<n>` → `achados`; `FALHA incompleta:<motivo>` → `incompleta:<classe>`; `FALHA indisponivel:<motivo>` → `indisponivel:<classe>`; `FALHA evidencia-ausente` → `null`; `FALHA evidencia-invalida…`, `FALHA evidencia-nao-bate…`, `FALHA commit-inexistente…`, saída 64 ou linha fora da forma → `invalida`. O passo de `git show ":<caminho>" | jq` sai. Teste novo: `evidencia incompleta no commit: revisao incompleta:<classe>`.
- **Task C3:** sem mudança.
- **Tasks D1 e D2** (:353-381): leem achados rejeitados, `rejeicoes`, `removidos_sem_revisao` e o motivo de `indisponivel` direto da evidência com `jq`. Isso contraria a regra "a mergex só conhece a evidência pelo `conferir`" e depende da forma que a AxisGov/expxdev#69 (mergeada, 4060f8d) fixou (achados derivados de `chamada.issues`). Ficam **bloqueadas** até a decisão do ponto 1 (abaixo). Na D1, a lista ganha também as tasks `incompleta:<motivo>`.

### Parte 2

- **Task D3** (:9-43): `leitor-do-projeto.sh` ganha `--nucleo-da-rev` (só com `--rev`): extrai `.expx/marketplace/plugins/expx/nucleo/scripts/` da árvore de `<rev>` (`git archive`) para um temporário e roda **esse** leitor, sem a conferência do instalado; a base sem a pasta é saída 3 ("a base não versiona o núcleo"). `EXPX_REVISOR_BOT` vem de `leitor-do-projeto.sh --rev <base> --nucleo-da-rev`. Caso novo: `nucleo da base diferente do instalado: vale o da base`.
- **Task S1** (:45-91): o bloco P já criou `sprint_atual: planejamento | null` e `prs` com o item de planejamento, e a retomada do E0 depois dele. A S1 acrescenta `sprint_atual: NN`, os itens de sprint **depois** do de planejamento, `--sprint`, e a regra "o PR da sprint 01 só abre com o planejamento `merged`" (a mesma pré-condição da P2, agora com `--sprint 01`). O teste `causa-do-portao --validar e sequencia --validar aceitam a entrega com prs` (:87) já está na P1. Na tabela de `prs`, `sprint` aceita `planejamento` ou `NN`.
- **Task S2** (:93-132): a entrega de planejamento não tem sprint: as verificações por sprint seguem a P2 (V1, V2, V3, V11, V12 `n/a`; V9 `--planejamento`).
- **Task M1** (:134-178): condição `ligado` lê `leitor-do-projeto.sh --rev <base> --nucleo-da-rev`. Condição nova, primeira da tabela: `planejamento` — `entrega-de-planejamento.sh --entrega <ENTREGA.md> --rev <head>` com `planejamento=sim` → `falha` (o PR de planejamento nunca é automático), saída ≠ 0 → `nao_verificavel`. Testes: `entrega de planejamento: espera, mesmo com tudo ok`; `ENTREGA incoerente: nao_verificavel`.
- **Task M2** (:180-229): a condição 6 (`achado_rejeitado`) lê a evidência com o trecho da D2: bloqueada pelo ponto 1, como D1 e D2. As demais condições não mudam.
- **Task M3:** sem mudança.
- **Task M4** (:284-326): o E9 automático cita a condição `planejamento` da M1; teste novo `PR de planejamento com merge_automatico ligado: o E9 pergunta como hoje`. O pulo da revisão do app (> 100 arquivos) no PR de planejamento não é pendência (DM-260).
- **Tabela de PRs** (:328-344): PRs 1 e 2 feitas; a coluna "Linhas" deixa de ser limite; o assunto da PR 1 é histórico. A ordem segue com P antes da PR 3 (B1).
- **Dependências externas** (:346-365): "Release com #51, #53 e D2" (:354) → `cli-4060f8d` (a do merge da AxisGov/expxdev#69, que a cópia da L1 acompanha).

## A volta ao B1

### Task B1 (emendada): `scripts/portao-v12.sh`

Substitui a Task B1 da parte 1 do plano antigo (:212-256). O resto do bloco (ci.yml, DM-238) fica.

**Pré-requisito:** a AxisGov/expxdev#69 já está mergeada (4060f8d) e a cópia da L1.1 já vem de 4060f8d, com o `conferir` que exige `head`, `chamada.issues` e `chamada.stdout_sha256` e deriva os achados das `issues`. Se, ao começar o B1, o expxdev tiver mudado `nucleo/scripts/` depois de 4060f8d, regere a cópia da revisão nova (commit próprio, com o comando no corpo) antes do primeiro teste.

**Files:**
- Create: `.claude/skills/mergex/scripts/portao-v12.sh`
- Create: `scripts/ci/codeant-falsa.sh` (biblioteca, carregada com `.`)
- Create: `scripts/ci/test-portao-v12.sh`; Modify: `.github/workflows/ci.yml` (passo `Test E2 V12`)

**Interfaces:**
- Produces: a mesma linha de comando e os mesmos códigos da B1 antiga (`V12=OK|AVISO|FALHA|SEM_PROVA|n/a`, depois as linhas do `conferir` como vieram e `motivo=`; 0, 1, 2, 64).
- Mapeamento (DM-238), com o que muda em negrito:

| Situação | `obrigatoria` | `se_disponivel` | `desligada` |
|---|---|---|---|
| sem `.expx/fatiamento.json` | `n/a`, sem node | `n/a`, sem node | `n/a`, sem node |
| **entrega de planejamento** (`entrega-de-planejamento.sh`) | `n/a` | `n/a` | `n/a` |
| modo `desligada`; `versionado: false`; nenhuma task concluída | — | — | `n/a` |
| configuração inválida, **`FATIA_*` no ambiente**, leitor ausente, **núcleo antigo** ou node ausente (`leitor-do-projeto` 1 ou 3; também 2 e 64, que não deviam ocorrer) | `SEM_PROVA` | `SEM_PROVA` | `SEM_PROVA` |
| `entrega-de-planejamento.sh` sai ≠ 0 (entrega incoerente) | `SEM_PROVA` | `SEM_PROVA` | `SEM_PROVA` |
| núcleo instalado sem `expx-revisao.mjs` | `SEM_PROVA` | `AVISO revisao-nao-conferida:<motivo>` | — |
| `conferir` 0 / 3 / 1 (**`FALHA incompleta:<motivo>` é 1 nos dois modos**) | OK / AVISO / FALHA | OK / AVISO / FALHA | — |
| `conferir` 64 (**inclusive `FATIA_*`**), outro código, ou saída sem exatamente uma linha `T-… ok\|AVISO …\|FALHA …` por task (**inclusive o node que não carrega o núcleo**) | `SEM_PROVA` | `SEM_PROVA` | — |

- `codeant-falsa.sh` produz `instala_codeant_falsa <prefixo> <resposta.json> [<stderr>]` e `nucleo_com_falsa <nucleo> <prefixo>`: monta o pacote `codeant-cli` 0.5.14 no layout do npm em POSIX (`<prefixo>/lib/node_modules/codeant-cli/` e o link `<prefixo>/bin/codeant`), cujo bin devolve a resposta (com `reviewed_files` = o `--include` recebido quando a resposta traz `"__include__"`), e troca **na cópia montada no projeto temporário** só `manifesto` e `package_json` do perfil 0.5.14 pelos da falsa (jq). As evidências dos testes são gravadas pelo `revisar` do núcleo: **nenhum teste escreve evidência à mão**, e a mergex não depende da forma dela. No Git Bash do Windows, sem link simbólico confiável, os casos que precisam da falsa saem com `passa '… (o CI em Linux cobre)'`.

- [ ] **Step 1: Write the failing tests** (repositório temporário com o núcleo montado como na L0, tasks com commit e evidência gravada pelo `revisar` antes do commit):
  - os da B1 antiga (:239-252), menos `lotes`: `obrigatoria com evidencia ok: OK`; `obrigatoria sem evidencia: FALHA evidencia-ausente`; `se_disponivel sem evidencia: AVISO, codigo 0`; `sem .expx/fatiamento.json: n/a sem node`; `id com ponto (T-01.03)`; `desligada: n/a sem conferir`; `node ausente: SEM_PROVA`; `se_disponivel sem expx-revisao.mjs: AVISO`; `achado aberto: FALHA achados-abertos:1`; `evidencia editada no disco depois do commit nao muda o veredito`; `task com dois itens em commits: confere o ultimo`; `conferir 64: SEM_PROVA`; `conferir com uma linha a menos: SEM_PROVA`; `task sem item em commits nao e alvo`;
  - novos: `task com 41 arquivos revisaveis: incompleta:L1:41, V12=FALHA em se_disponivel tambem`; `CLI falsa com "[error] Failed to review" no stderr: FALHA incompleta:lote-falhou`; `FATIA_X no ambiente: SEM_PROVA`; `nucleo sem expx-limites.mjs: SEM_PROVA`; `entrega de planejamento: n/a sem chamar o conferir`; `entrega incoerente: SEM_PROVA`; `evidencia v2 sem chamada.issues (gravada antes da #69): FALHA evidencia-invalida:chamada`; `issues com achado trocado: FALHA evidencia-invalida:achados`; `evidencia de versao antiga (expx_revisao 1) no commit: FALHA evidencia-invalida:versao` (os dois únicos casos que montam evidência à mão, de propósito: tiram uma chave de uma evidência gravada pelo `revisar`, ou trocam a versão, para provar que a forma antiga não passa).
- [ ] **Step 2: Run** `bash scripts/ci/test-portao-v12.sh` — Expected: FAIL (script ausente).
- [ ] **Step 3: Implement** o script (o leitor de `commits` do `prova-de-commit.sh`, nunca um segundo parser; `entrega-de-planejamento.sh` antes de tudo).
- [ ] **Step 4: Run** — Expected: `0 falha(s)`.
- [ ] **Step 5: Run** o fatiamento L2/L3 — Expected: exit 0.
- [ ] **Step 6: Commit** `feat(mergex): portao-v12 confere a revisao por task pelo nucleo v2`. Abra a PR.

Depois do B1, a ordem executável é: B2 → C (C1, C2, C3) → D2 (Task D3) → S1 → S2 → M1. D1 e, por consequência, M2, M3 e M4 (M2 depende da PR 6, D1) esperam a decisão do ponto 1; decidido, a ordem do plano antigo volta (D1 depois de C; M2 depois de M1 e D1).

## Dependências

**expxdev**
- `cli-4060f8d` (a publicar e liberar pelo usuário; a L1.1 só confere que existe): a cópia do bloco L1, já com a AxisGov/expxdev#69 (mergeada). A #69 é também a base da decisão do ponto 1.
- Versão liberada aos projetos (emenda §11, passo 5): só depois de L1 e P mergeados e da parte da sprintx (passo 4).

**sprintx** (passo 4 da emenda, plano próprio): no fim da F5, chamar E0–E8 com `--planejamento`; esperar o merge; a F6 da primeira sprint chama o E0 sem `--planejamento` (por trabalho) ou com `--sprint 01` (depois da S1).

## Pontos para o usuário

1. **D1, D2 e a condição 6 da M2 leem a evidência por conta própria** (achados rejeitados, `rejeicoes`, `removidos_sem_revisao`, motivo de `indisponivel`), com `jq`, o que contraria "a mergex só conhece a evidência pelo `conferir`" e depende da forma que a `feat/evidencia-guarda-issues` vai fixar. Proposta: o núcleo ganha um subcomando de leitura (por exemplo `expx-revisao.mjs listar --trabalho <slug> --task <T>=<sha>`, com uma linha por achado rejeitado e por removido) e a mergex o consome como consome o `conferir`. Até decidir, D1, D2 e a condição 6 ficam bloqueadas; B1, B2, C e D3 não dependem disso.
2. **Merge do PR de planejamento feito fora do E9** (botão do serviço): o plano adota o E9 como único registrador (P3): o E0 recusa sem o registro e manda rodar o E9, que lê o PR de `pr_url` no serviço e grava o merge. A alternativa — o E0 consultar o serviço — traria a plataforma para o E0; fica registrada aqui caso o usuário prefira.
3. **Quem commita os artefatos do planejamento.** O catálogo de método da mergex (`catalogo-de-metodo.sh`) é fechado por nome; o PR de planejamento leva tudo sob `^docs/(sprintx|entregas|eventos)/`. Se a sprintx não commitar o planejamento antes de chamar o E0, o `pre-e2` não persiste o que estiver fora do catálogo. O plano fixa a pré-condição do lado da mergex (P2: o E0 `--planejamento` recusa com artefato do planejamento sujo); o plano da sprintx (passo 4) tem de commitar o planejamento antes de chamar o E0. A mergex não amplia o catálogo.
4. **D3 e M1 executam o núcleo da árvore da base**, o que pressupõe que o projeto versiona `.expx/marketplace/plugins/expx/nucleo/scripts/`. Base sem a pasta: saída 3 e o merge espera. Se algum projeto não a versiona, o merge automático fica sempre em espera nele; a ativação do merge automático num projeto (passo 5 da emenda) deve conferir antes que a pasta está versionada na main. Teste na D3: `base com .expx/fatiamento.json e sem a pasta do nucleo: sai 3`.
5. **A PR que troca o espelho (L1) é medida por ele mesmo**, como a B do expxdev; L0 é a única medida pelos limites antigos. Ela junta quatro tasks (cópia, helper, espelho, E7) porque nenhuma fica verde sozinha. Como o CI não tem o expxdev, a identidade do corpo no CI é só o `Corpo-sha256`; a comparação com o arquivo de 4060f8d (`EXPXDEV_RAIZ`, revisão 4060f8d) é obrigatória no Step 4 da L1.3 e na verificação final da L1.4, rodada localmente e citada na descrição da PR.
6. **A classe de `revisao:` (C1) passa a aceitar maiúsculas** (`incompleta:L1`, `incompleta:L2`), porque os motivos do núcleo são `L1`/`L2`; a alternativa é a mergex normalizar para minúsculas, perdendo a igualdade com o `conferir`.
