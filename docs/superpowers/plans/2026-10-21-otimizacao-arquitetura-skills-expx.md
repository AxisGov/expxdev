# Expx Skills Architecture Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir tokens, reinjeções do hook, agentes redundantes e churn de estado sem alterar a semântica `E1 INVESTIGAÇÃO → E2 PLANO → E3 FIX → E4 QA → E5 RELATÓRIO` nem os artefatos públicos do Expx.

**Architecture:** ExpxDev continuará sendo a fonte canônica do hook e de sua instalação. RunX continuará sendo a fonte canônica do método; seu núcleo conterá apenas gatilho, invariantes, máquina de estados, roteamento e término, enquanto referências, templates e um helper determinístico assumirão os detalhes sob demanda. A integração será provada a partir das duas fontes locais, sem editar a cópia histórica instalada no ExpxDev nem qualquer consumidor externo.

**Tech Stack:** Node.js 20.19+, TypeScript, Vitest, ESM sem dependências externas, Bash, Python 3 já usado pelos hooks do RunX, Git worktrees.

**Spec:** `docs/superpowers/specs/2026-10-21-otimizacao-arquitetura-skills-expx-design.md`

## Global Constraints

- Não publicar, fazer push, abrir PR, fazer merge nem alterar consumidor externo.
- Trabalhar somente nas duas fontes canônicas e em worktrees novas fora de `node_modules`.
- Preservar formatos, enums, caminhos públicos, schema v1, E1–E5 e retornos já aceitos.
- Aplicar RED → implementação mínima → GREEN em cada unidade; não aceitar teste escrito depois do código.
- Não carregar todas as referências RunX simultaneamente. Abrir uma referência por vez e manter o mapa de duplicação da especificação.
- Não abrir agentes durante a implementação. Após todos os artefatos estabilizados, permitir no máximo um revisor final read-only, em classe econômica adequada.
- `usage_limit_reached` encerra a execução e impede tentativas automáticas.
- Atualizar `ORQUESTRADOR.md`, `.expx/estado.json` e `.expx/handoff.md` somente em transição, bloqueio, decisão ou término.
- Ausência de `onFailure` é parte do contrato. `timeout: 1` permanece; `onFailure: "block"` é proibido.
- Todo commit abaixo é local e limitado ao repositório indicado.

## Worktrees e comandos canônicos

| Nome | Repositório administrativo | Worktree de implementação | Branch planejada |
|---|---|---|---|
| ExpxDev | `F:/Projetos/expxdev` | `F:/Projetos/.worktrees/expxdev-otimiza-skills` | `feat/otimiza-skills-expx` |
| RunX | clone local de `bittencourtthulio/runx` em `F:/Projetos/runx` | `F:/Projetos/.worktrees/runx-otimiza-skills` | `feat/otimiza-skills-expx` |

Se o clone administrativo do RunX não existir, obtê-lo do repositório canônico antes de criar a worktree. Resolver e validar os quatro caminhos absolutos antes de qualquer criação ou remoção. Nenhum deles pode estar sob `node_modules`.

## Mapa de responsabilidades

### ExpxDev

- `nucleo/hooks/expx-lembrete.sh`: adaptador de stdin, seleção Node/fallback shell e fail-open.
- `nucleo/hooks/expx-lembrete.mjs`: parse, classificador preservado, identidades, decisão e emissão.
- `nucleo/hooks/expx-lembrete-estado.mjs`: armazenamento seguro, TTL, lock e escrita atômica.
- `src/nucleo/expx-lembrete.test.ts`: matriz funcional, segurança e concorrência do hook.
- `src/harness/hooks.ts` / `src/harness/hooks.test.ts`: empacotamento do wrapper e módulos.
- `src/harness/settings.ts` / `src/harness/settings.test.ts`: `timeout: 1`, sem `onFailure`.
- `src/cli/certificacao-d03.test.ts` / `src/cli/certificacao-p02.test.ts`: instalação, lock e sincronização.
- `scripts/benchmark-expx-lembrete.mjs`: benchmark reproduzível de wrapper completo.
- `docs/superpowers/plans/2026-10-21-otimizacao-arquitetura-skills-expx-baseline.md`: commits-base, medidas e bloco final.

### RunX

- `.claude/skills/runx/SKILL.md`: núcleo mínimo sempre carregado.
- `.claude/skills/runx/references/00-schema.md` a `07-diagrama.md`: normas e procedimentos lazy por estágio.
- `.claude/skills/runx/assets/TEMPLATE-*.md`: apenas forma concreta, sem regra normativa duplicada.
- `.claude/agents/investigador.md`, `revisor-testes.md`, `qa.md`: gates, exclusão mútua e classes de capacidade.
- `.claude/hooks/comum/estado.py`: marcos, reconstrução, handoff e escrita atômica.
- `.claude/hooks/comum/rastro.py`: JSONL mecânico, sem chamada de LLM.
- `.claude/hooks/testes/testar-conteudo.sh`: invariantes, tamanho, roteamento e política de agentes.
- `.claude/hooks/testes/testar-estado.sh`: helper, recuperação, limites e retornos.
- `.claude/hooks/testes/testar-espelho.sh`: igualdade Claude/OpenCode.
- `.claude/hooks/testes/testar-instalacao.sh`: instalação a partir da fonte nova.
- `.claude/hooks/testes/testar.sh`: agregador existente e regressão dos hooks.
- `sincronizar-espelho.sh`: cópia determinística Claude → OpenCode.
- `install.sh`: distribuição da fonte e do espelho novos.
- `.opencode/skills/runx/`: saída gerada; nunca editar manualmente.

## Review Focus

1. **Identidade incompleta:** sem `session_id`, usar transcript; sem ambos, permanecer stateless e fail-open. Fixado nas tarefas 2 e 4.
2. **Concorrência e filesystem hostil:** lock contendido, JSON corrompido e symlink nunca bloqueiam nem tocam alvo externo. Fixado nas tarefas 3 e 5.
3. **Regra perdida durante a redução:** limite de 8 KB não pode remover invariante nem alterar E1–E5. Fixado nas tarefas 7, 9 e 10.
4. **Cópia antiga restaurada:** espelho, instalador ou CLI não podem sobrescrever a versão nova. Fixado nas tarefas 8, 11 e 14.
5. **Retomada depois de queda:** task persistida antes do marco deve reconstruir estado e handoff sem LLM. Fixado nas tarefas 12 e 13.

---

## Fase 1 — Preparação das worktrees e baseline

### Task 1: Criar worktrees externas, registrar bases e obter duas baselines verdes

- [ ] **Repositórios/worktrees:** ExpxDev em `F:/Projetos/.worktrees/expxdev-otimiza-skills`; RunX em `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** criar no ExpxDev `docs/superpowers/plans/2026-10-21-otimizacao-arquitetura-skills-expx-baseline.md`; não alterar produção.
- [ ] **Interfaces — consome:** HEAD limpo de cada repositório, versões de Node/npm/Bash/Python e a especificação aprovada.
- [ ] **Interfaces — produz:** duas branches isoladas, SHA-base de cada repositório e resultados reproduzíveis das baselines.
- [ ] **Teste RED/gate:** antes de qualquer RED funcional, rodar no ExpxDev `npm.cmd test` e `npm.cmd run typecheck`; no RunX, `bash .claude/hooks/testes/testar.sh`, `bash .claude/hooks/testes/testar-conteudo.sh` e `bash .claude/hooks/testes/testar-espelho.sh`.
- [ ] **Falha esperada:** nenhuma. Se uma baseline falhar, corrigir somente ambiente/fixture, repetir e registrar a causa. Se não for possível deixá-la verde sem código de produto, **parar e devolver ao usuário**; nenhuma tarefa seguinte é autorizada.
- [ ] **Implementação mínima:** criar as worktrees com `git worktree add`, coletar `git rev-parse HEAD`, versões e saídas; escrever o arquivo de baseline sem concluir antecipadamente o bloco `BASELINE-POS-MUDANCA`.
- [ ] **Comando GREEN:** os cinco comandos acima saem 0, `git -C <worktree> status --short` está vazio antes de criar o registro, e `git diff --check` passa após criá-lo.
- [ ] **Critério de término:** ambos os SHAs-base e todas as suítes verdes estão registrados; nenhum caminho contém `node_modules`.
- [ ] **Commit local esperado:** ExpxDev — `test: registrar baseline pre mudanca das skills expx`; RunX — nenhum.

## Fase 2 — Testes RED do hook e harness no ExpxDev

### Task 2: Fixar classificação, identidades e deduplicação em RED

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `src/nucleo/expx-lembrete.test.ts`; usar fixtures temporárias, sem editar produção.
- [ ] **Interfaces — consome:** JSON `UserPromptSubmit`, skills instaladas, `.expx/estado.json.trabalho`, relógio injetável.
- [ ] **Interfaces — produz:** contrato testado de `classificar`, `identidadeSessao`, `chaveEvento`, `chaveTrabalho` e `decidirInjecao`.
- [ ] **Teste RED:** casos 1–13, 17, 20, 22 e 24 da matriz: primeira injeção; repetição por trabalho/evento; troca de skill; novo trabalho; cwd/sessão independentes; retomada; transcript; modo anônimo; E4→E3; TTL; eventos autônomos uniformes; ausência de prompt persistido; uma injeção por trabalho; prioridade antiga.
- [ ] **Falha esperada:** import de `../../nucleo/hooks/expx-lembrete.mjs` ausente e asserções de deduplicação sem implementação.
- [ ] **Implementação mínima:** nenhuma nesta tarefa; somente fixtures determinísticas e asserts sobre saída/estado, sem mock de comportamento central.
- [ ] **Comando GREEN futuro:** `npm.cmd test -- src/nucleo/expx-lembrete.test.ts` deverá sair 0 após as tarefas 4–5.
- [ ] **Critério de término:** todos os casos falham pela capacidade ausente, não por sintaxe, path ou fixture.
- [ ] **Commit local esperado:** nenhum; RED permanece não versionado até a implementação mínima da Task 4.

### Task 3: Fixar segurança, concorrência, fallback e harness em RED

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `src/nucleo/expx-lembrete.test.ts`, `src/harness/hooks.test.ts`, `src/harness/settings.test.ts`, `src/cli/certificacao-d03.test.ts` e `src/cli/certificacao-p02.test.ts`.
- [ ] **Interfaces — consome:** filesystem temporário, duas execuções concorrentes, PATH sem Node, catálogo de hooks e settings gerados.
- [ ] **Interfaces — produz:** contrato testado para estado seguro e pacote instalável.
- [ ] **Teste RED:** casos 14–16, 18–19 e 21: corrupção; corrida com exatamente uma emissão; symlink intocado; Node ausente/incompatível; timeout fail-open; 768 bytes/zero bytes. Provar também wrapper+módulos no lock/marketplace, `timeout: 1` e propriedade `onFailure` ausente.
- [ ] **Falha esperada:** módulos não empacotados, ausência do store/lock e settings sem o novo timeout.
- [ ] **Implementação mínima:** nenhuma; aceitar apenas falhas diretamente ligadas aos requisitos.
- [ ] **Comando GREEN futuro:** `npm.cmd test -- src/nucleo/expx-lembrete.test.ts src/harness/hooks.test.ts src/harness/settings.test.ts src/cli/certificacao-d03.test.ts src/cli/certificacao-p02.test.ts`.
- [ ] **Critério de término:** o conjunto fica vermelho pelas capacidades novas; o restante da suíte continua na baseline da Task 1.
- [ ] **Commit local esperado:** nenhum; RED será versionado com as Tasks 4–6.

## Fase 3 — Implementação mínima do hook

### Task 4: Extrair o motor ESM e manter o wrapper fail-open

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `nucleo/hooks/expx-lembrete.mjs`; alterar `nucleo/hooks/expx-lembrete.sh` e `src/nucleo/expx-lembrete.test.ts`.
- [ ] **Interfaces — consome:** stdin JSON, `process.env`, `fs`, relógio e caminho de estado fornecidos por adapters.
- [ ] **Interfaces — produz:** exports `classificarEntrada(input, ambiente)`, `identificarSessao(input)`, `identificarTrabalho(input, cwd)`, `decidirInjecao(contexto, estado)` e `main(io)`; JSON de `additionalContext` ou saída vazia; exit 0.
- [ ] **Teste RED:** selecionar os casos da Task 2; confirmar que a classificação existente passa, mas identidades/deltas falham antes do módulo.
- [ ] **Implementação mínima:** mover literalmente a prioridade e padrões atuais para funções puras; normalizar cwd; calcular SHA-256 versionado; emitir lembrete curto/delta; wrapper lê stdin uma vez, usa Node ≥20.19 e cai no classificador shell stateless em qualquer ausência/incompatibilidade.
- [ ] **Comando GREEN:** `npm.cmd test -- src/nucleo/expx-lembrete.test.ts -t "classifica|identidade|deduplica|delta|fallback"` sai 0.
- [ ] **Critério de término:** casos 1–13, 17, 18, 20, 22 e 24 passam; nenhuma dependência ou rede foi adicionada.
- [ ] **Commit local esperado:** `feat: tornar lembrete expx idempotente por trabalho`.

### Task 5: Implementar armazenamento seguro e concorrente

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `nucleo/hooks/expx-lembrete-estado.mjs`; alterar `nucleo/hooks/expx-lembrete.mjs`, `nucleo/hooks/expx-lembrete.sh` e `src/nucleo/expx-lembrete.test.ts`.
- [ ] **Interfaces — consome:** `scratchpad_dir`, temp seguro do sistema, identidade principal, `lstat/open/fstat/rename/mkdir`, relógio.
- [ ] **Interfaces — produz:** `selecionarRaizEstado`, `comLock`, `lerEstado`, `gravarEstadoAtomico`, `podarEstado`; registros só com versão, hashes, skill e timestamp.
- [ ] **Teste RED:** executar os casos 13–16, 19–21; antes da mudança, corrupção/race/symlink/TTL/limites devem falhar de modo específico.
- [ ] **Implementação mínima:** precedência de diretórios da spec; recusa de symlink; permissões restritas; lock por `mkdir` com 50 ms e stale de 30 s; arquivo exclusivo+flush+rename; TTL 24 h/7 d e 64+64 entradas; fail-open conservador.
- [ ] **Comando GREEN:** `npm.cmd test -- src/nucleo/expx-lembrete.test.ts` sai 0, inclusive duas execuções normais com uma emissão.
- [ ] **Critério de término:** alvo de symlink permanece byte a byte intacto, JSON corrompido é reconstruído, prompt/hash nunca aparecem e toda saída termina em exit 0.
- [ ] **Commit local esperado:** `feat: persistir deduplicacao segura do lembrete expx`.

### Task 6: Empacotar módulos e fixar settings compatíveis

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `src/harness/hooks.ts`, `src/harness/hooks.test.ts`, `src/harness/settings.ts`, `src/harness/settings.test.ts`, `src/cli/certificacao-d03.test.ts` e `src/cli/certificacao-p02.test.ts`.
- [ ] **Interfaces — consome:** três artefatos canônicos do hook e composição de settings/marketplace existente.
- [ ] **Interfaces — produz:** instalação byte a byte de `.sh` + dois `.mjs`; comando aponta ao wrapper; `timeout: 1`; nenhuma chave `onFailure`.
- [ ] **Teste RED:** reexecutar a Task 3 e observar falhas de arquivo ausente/settings antes das mudanças.
- [ ] **Implementação mínima:** incluir os módulos como não executáveis no inventário/lock e o wrapper como executável; acrescentar timeout apenas à entrada do lembrete; não declarar `onFailure`.
- [ ] **Comando GREEN:** `npm.cmd test -- src/harness/hooks.test.ts src/harness/settings.test.ts src/cli/certificacao-d03.test.ts src/cli/certificacao-p02.test.ts` e `npm.cmd run typecheck` saem 0.
- [ ] **Critério de término:** init/sync temporário gera exatamente os três arquivos novos e não restaura wrapper antigo; falha/timeout continuam não bloqueantes por ausência de `block`.
- [ ] **Commit local esperado:** `feat: distribuir hook expx idempotente no harness`.

## Fase 4 — Testes RED de conteúdo, invariantes e sincronização no RunX

### Task 7: Fixar núcleo mínimo, invariantes e política de agentes em RED

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `.claude/hooks/testes/testar-conteudo.sh`.
- [ ] **Interfaces — consome:** `.claude/skills/runx/SKILL.md`, referências 00–07, templates e três agentes.
- [ ] **Interfaces — produz:** asserções nomeadas para ≤8.000 bytes, cinco responsabilidades, invariantes, roteamento lazy, ausência de blocos duplicados, gates/digests/exclusão mútua, classes e `usage_limit_reached`.
- [ ] **Teste RED:** `bash .claude/hooks/testes/testar-conteudo.sh` deve listar cada asserção nova como `FALHA`, preservando as antigas verdes.
- [ ] **Falha esperada:** núcleo atual excede 8 KB e política atual ainda usa corte por arquivos/modelo herdado.
- [ ] **Implementação mínima:** nenhuma; asserções devem casar estrutura normativa, não palavras soltas.
- [ ] **Comando GREEN futuro:** o mesmo comando sairá 0 após as Tasks 9–10.
- [ ] **Critério de término:** cada requisito novo tem nome único e uma causa de falha; nenhum falso vermelho preexistente.
- [ ] **Commit local esperado:** nenhum; RED será versionado com a Task 9.

### Task 8: Fixar sincronização e instalação em RED

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `.claude/hooks/testes/testar-espelho.sh`; criar `.claude/hooks/testes/testar-instalacao.sh`; alterar `.claude/hooks/testes/testar.sh`.
- [ ] **Interfaces — consome:** árvore Claude canônica, árvore OpenCode gerada, `install.sh`, destino temporário vazio.
- [ ] **Interfaces — produz:** prova de sincronização determinística e instalação da versão nova sem restauração.
- [ ] **Teste RED:** exigir `sincronizar-espelho.sh`; adulterar cópia temporária e provar reparo; instalar em temporário e comparar hashes/tamanho/conteúdo do núcleo, refs, assets e agentes.
- [ ] **Falha esperada:** sincronizador não existe e instalador atual não prova a nova assinatura.
- [ ] **Implementação mínima:** nenhuma; testes não podem escrever na árvore real, somente em cópias temporárias.
- [ ] **Comando GREEN futuro:** `bash .claude/hooks/testes/testar-espelho.sh && bash .claude/hooks/testes/testar-instalacao.sh` após a Task 11.
- [ ] **Critério de término:** RED decorre só da ausência do sincronizador/assinatura nova.
- [ ] **Commit local esperado:** nenhum; RED será versionado com a Task 11.

## Fase 5 — Redução e reorganização da RunX

### Task 9: Reduzir o SKILL ao roteador e invariantes globais

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `.claude/skills/runx/SKILL.md` e `.claude/hooks/testes/testar-conteudo.sh`.
- [ ] **Interfaces — consome:** máquina E1–E5 e mapa de alocação normativa da especificação.
- [ ] **Interfaces — produz:** núcleo ≤8.000 bytes com gatilho, invariantes, máquina/retornos, roteamento e término — nada além.
- [ ] **Teste RED:** rodar somente as asserções `nucleo-*`, `invariante-*`, `roteamento-*`; confirmar falha por tamanho/responsabilidade antes da edição.
- [ ] **Implementação mínima:** condensar formulação sem remover regra; trocar detalhes por links relativos à referência/template lido apenas quando necessário; manter `usage_limit_reached`, sessão por ocorrência e proibição de segunda leitura sem mudança.
- [ ] **Comando GREEN:** `bash .claude/hooks/testes/testar-conteudo.sh` passa o subconjunto do núcleo; `wc -c .claude/skills/runx/SKILL.md` reporta ≤8.000.
- [ ] **Critério de término:** E1–E5 e retornos permanecem iguais, todas as invariantes estão presentes uma vez e exemplos/schemas não ficam no núcleo.
- [ ] **Commit local esperado:** `refactor: reduzir nucleo sempre carregado da runx`.

### Task 10: Realocar detalhes, eliminar duplicação e aplicar política de agentes

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** alterar `.claude/skills/runx/references/00-schema.md`, `01-investigacao.md`, `02-plano.md`, `03-fix.md`, `04-qa.md`, `05-relatorio.md`, `06-estado.md`, `07-diagrama.md`; os assets `TEMPLATE-analise-impacto.md`, `TEMPLATE-base-area.md`, `TEMPLATE-causa-raiz.md`, `TEMPLATE-fases.md`, `TEMPLATE-INDICE.md`, `TEMPLATE-ocorrencia.md`, `TEMPLATE-ORQUESTRADOR.md`, `TEMPLATE-plano-condensado.md`, `TEMPLATE-qa.md`, `TEMPLATE-relatorio-tecnico.md`, `TEMPLATE-relatorio-uso.md`, `TEMPLATE-sprint.md`, `TEMPLATE-tasks.md`; `.claude/agents/investigador.md`, `.claude/agents/revisor-testes.md`, `.claude/agents/qa.md`; e `.claude/hooks/testes/testar-conteudo.sh`.
- [ ] **Interfaces — consome:** conteúdo removido na Task 9, mapa de duplicação e contratos públicos atuais.
- [ ] **Interfaces — produz:** uma fonte normativa por regra, referências lazy e agentes opcionais por evidência/digest/lote.
- [ ] **Teste RED:** executar as asserções `duplicacao-*`, `agente-*`, `modelo-*`, `marco-*`; confirmar os blocos antigos e `model: inherit` como falhas.
- [ ] **Implementação mínima:** mover cada detalhe ao destino 00–07; templates apontam à norma sem copiá-la; investigador somente sem causa provada localmente, revisor uma vez por digest vermelho estável, QA uma vez por digest de lote; nunca simultâneos; classes canônicas com adaptadores Claude/Codex e justificativa para profundo.
- [ ] **Comando GREEN:** `bash .claude/hooks/testes/testar-conteudo.sh` sai 0.
- [ ] **Critério de término:** nenhuma duplicação literal catalogada permanece, templates preservam campos, e nenhuma referência é transformada em prólogo global.
- [ ] **Commit local esperado:** `refactor: carregar detalhes runx somente por estagio`.

### Task 11: Gerar o espelho e provar a instalação nova

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `sincronizar-espelho.sh` e `.claude/hooks/testes/testar-instalacao.sh`; alterar `install.sh`, `.claude/hooks/testes/testar-espelho.sh`, `.claude/hooks/testes/testar.sh`; regenerar `.opencode/skills/runx/`.
- [ ] **Interfaces — consome:** `.claude/skills/runx/` exclusivamente.
- [ ] **Interfaces — produz:** espelho OpenCode byte a byte e instalação temporária com assinatura da versão nova.
- [ ] **Teste RED:** reexecutar a Task 8 antes do sincronizador; deve falhar sem modificar a fonte.
- [ ] **Implementação mínima:** sincronizador valida origem/destino, copia para temporário e substitui o espelho de forma determinística; instalador sempre lê a árvore Claude e/ou espelho recém-validado, nunca uma cópia histórica.
- [ ] **Comando GREEN:** `bash sincronizar-espelho.sh --check && bash .claude/hooks/testes/testar-espelho.sh && bash .claude/hooks/testes/testar-instalacao.sh` saem 0.
- [ ] **Critério de término:** `diff -rq .claude/skills/runx .opencode/skills/runx` não produz saída; instalação temporária conserva hashes e núcleo ≤8 KB.
- [ ] **Commit local esperado:** `build: sincronizar fontes claude e opencode da runx`.

## Fase 6 — Helper de estado, recuperação e handoff

### Task 12: Especificar helper de marcos e recuperação em RED

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `.claude/hooks/testes/testar-estado.sh`; alterar `.claude/hooks/testes/testar.sh`.
- [ ] **Interfaces — consome:** fixtures de `ORQUESTRADOR.md`, `tasks.md`, `BLOQUEIOS.md`, `00-DECISOES.md`, `QA.md`, estado/handoff e JSONL.
- [ ] **Interfaces — produz:** contrato CLI `estado.py marco <transicao|bloqueio|decisao|termino>` e `estado.py reconstruir`, ambos determinísticos.
- [ ] **Teste RED:** proibir escrita em eventos mecânicos; exigir atualização atômica só nos quatro marcos; E4→E3; queda depois de task persistida; reconstrução de contadores/estágio; handoff por ponteiros ≤500 tokens; JSONL <1 KB; stdout sem contexto.
- [ ] **Falha esperada:** `estado.py` ausente e fixtures de reconstrução sem saída.
- [ ] **Implementação mínima:** nenhuma; cada fixture deve provar entrada e arquivos exatos esperados.
- [ ] **Comando GREEN futuro:** `bash .claude/hooks/testes/testar-estado.sh` após a Task 13.
- [ ] **Critério de término:** todas as falhas são da capacidade ausente; fixtures não dependem de relógio/rede reais.
- [ ] **Commit local esperado:** nenhum; RED será versionado com a Task 13.

### Task 13: Implementar marcos, reconstrução e handoff determinísticos

- [ ] **Repositório/worktree:** RunX — `F:/Projetos/.worktrees/runx-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `.claude/hooks/comum/estado.py`; alterar `.claude/hooks/comum/rastro.py`, `.claude/hooks/testes/testar-estado.sh`, `.claude/hooks/testes/testar.sh`, `.claude/skills/runx/references/06-estado.md` e `.claude/skills/runx/assets/TEMPLATE-ORQUESTRADOR.md`; regenerar `.opencode/skills/runx/` com `sincronizar-espelho.sh`.
- [ ] **Interfaces — consome:** caminho da ocorrência, tipo/resultado/id do marco, artefatos versionados e relógio injetável.
- [ ] **Interfaces — produz:** `.expx/estado.json` v1 preservado, `.expx/handoff.md` derivado, linha JSONL mecânica e exit code; stdout vazio.
- [ ] **Teste RED:** executar a Task 12 e confirmar ausência do helper antes da criação.
- [ ] **Implementação mínima:** validar transição; derivar estado dos artefatos; gravar temporário+fsync+rename; handoff só com IDs e caminhos existentes; rejeitar >2.000 bytes pela estimativa conservadora; reconstruir no SessionStart e antes de transição; `rastro.py` registra mecânica sem LLM.
- [ ] **Comando GREEN:** `bash .claude/hooks/testes/testar-estado.sh && bash .claude/hooks/testes/testar.sh && bash .claude/hooks/testes/testar-espelho.sh` saem 0.
- [ ] **Critério de término:** a fixture interrompida retoma exatamente etapa/contadores, E4→E3 é válido, handoff não copia causa/plano/log e transição emite zero contexto.
- [ ] **Commit local esperado:** `feat: reconstruir estado e handoff runx por marcos`.

## Fase 7 — Integração entre as duas fontes canônicas

### Task 14: Provar instalação cruzada ExpxDev + RunX sem cópia obsoleta

- [ ] **Repositórios/worktrees:** ambos os worktrees externos; não usar `expxdev/.claude/skills/runx/` como fonte.
- [ ] **Arquivos exatos:** alterar no ExpxDev `src/cli/certificacao-p02.test.ts` e o arquivo de baseline; no RunX, alterar `.claude/hooks/testes/testar-instalacao.sh` somente se o contrato cruzado revelar lacuna.
- [ ] **Interfaces — consome:** pacote local do ExpxDev e worktree canônica do RunX indicada por variável explícita de teste `EXPX_RUNX_CANONICA`.
- [ ] **Interfaces — produz:** projeto temporário instalado com hook novo e RunX novo, hashes comparáveis às duas fontes.
- [ ] **Teste RED:** fixture instala/sincroniza e exige: três arquivos do lembrete; settings com timeout e sem `onFailure`; RunX ≤8 KB; referências/agentes novos; nenhum hash igual à cópia histórica obsoleta.
- [ ] **Falha esperada:** antes de apontar a resolução para as fontes locais novas, a instalação usa artefato antigo ou não encontra a assinatura.
- [ ] **Implementação mínima:** permitir ao teste fornecer o checkout canônico local sem mudar o catálogo de produção; executar o fluxo real em diretório temporário; registrar hashes, sem copiar RunX para o repositório ExpxDev.
- [ ] **Comando GREEN:** no ExpxDev, `$env:EXPX_RUNX_CANONICA='F:/Projetos/.worktrees/runx-otimiza-skills'; npm.cmd test -- src/cli/certificacao-p02.test.ts`; no RunX, `bash .claude/hooks/testes/testar-instalacao.sh`.
- [ ] **Critério de término:** uma instalação/sincronização restaura sempre as duas fontes novas e não modifica qualquer consumidor real.
- [ ] **Commit local esperado:** ExpxDev — `test: certificar integracao local com runx otimizada`; RunX — `test: certificar instalacao cruzada com expxdev` somente se houver alteração necessária.

## Fase 8 — Benchmarks, matriz de 24 cenários e validação final

### Task 15: Automatizar benchmark e orçamento de volume

- [ ] **Repositório/worktree:** ExpxDev — `F:/Projetos/.worktrees/expxdev-otimiza-skills`.
- [ ] **Arquivos exatos:** criar `scripts/benchmark-expx-lembrete.mjs`; alterar `src/nucleo/expx-lembrete.test.ts` e o arquivo de baseline.
- [ ] **Interfaces — consome:** wrapper real, 10 aquecimentos + 200 amostras intercaladas ou randomizadas por cenário/piso equivalente, relógio monotônico, PATH normal/sem Node.
- [ ] **Interfaces — produz:** JSON/texto com p50/p95 absolutos, `max(0, p95 candidato - p95 baseline)` e p50/p95 diagnóstico dos deltas pareados para primeira injeção, repetição e fallback; bytes e processos de cada caminho.
- [ ] **Teste RED:** invocar script inexistente e exigir schema, contagens, percentis e limites; falha esperada é arquivo ausente.
- [ ] **Implementação mínima:** spawn intercalado do wrapper e do piso equivalente; percentil determinístico do valor absoluto, da diferença dos p95 e de `hook - baseline` por par; sem rede; não mascarar timeout/falha; reduzir o caminho normal a um único Node antes de aceitar o resultado.
- [ ] **Comando GREEN:** em processo dedicado, fora da suíte paralela, `node scripts/benchmark-expx-lembrete.mjs --json` sai 0; POSIX/WSL usa p95 absoluto ≤100 ms quando o launcher permitir; Windows/Git Bash usa `max(0, p95 candidato - p95 baseline) ≤100 ms`; saída de injeção/delta ≤768 bytes e supressão 0. O caso Vitest correspondente só roda com `EXPX_BENCHMARK_OFICIAL=1`; `npm.cmd test` não repete a medição.
- [ ] **Critério de término:** before/after, plataforma, versões, processos, p50/p95 absolutos, diferença dos p95, p50/p95 diagnóstico dos deltas pareados e bytes estão registrados.
- [ ] **Commit local esperado:** `test: medir latencia e volume do lembrete expx`.

### Task 16: Fechar matriz, métricas, suítes e revisão única

- [ ] **Repositórios/worktrees:** ExpxDev e RunX externos.
- [ ] **Arquivos exatos:** alterar somente lacunas de teste identificadas em `src/nucleo/expx-lembrete.test.ts`, `.claude/hooks/testes/testar-conteudo.sh`, `.claude/hooks/testes/testar-estado.sh`, `.claude/hooks/testes/testar-instalacao.sh` e o arquivo de baseline; nenhum código de produção sem novo RED.
- [ ] **Interfaces — consome:** todos os commits anteriores e os 24 cenários da especificação.
- [ ] **Interfaces — produz:** matriz 24/24, métricas before/after e bloco literal `BASELINE-POS-MUDANCA`.
- [ ] **Teste RED:** mapear cada cenário a nome de teste; qualquer cenário sem teste executável é RED e deve ser adicionado antes de eventual correção mínima.
- [ ] **Implementação mínima:** somente preencher lacunas demonstradas; depois congelar artefatos e solicitar um único revisor read-only. Não repetir revisão sem mudança de artefato.
- [ ] **Comando GREEN:** ExpxDev — `npm.cmd test`, `npm.cmd run typecheck`, `node scripts/benchmark-expx-lembrete.mjs --json`, `git diff --check`; RunX — `bash .claude/hooks/testes/testar.sh`, `bash .claude/hooks/testes/testar-conteudo.sh`, `bash .claude/hooks/testes/testar-estado.sh`, `bash .claude/hooks/testes/testar-espelho.sh`, `bash .claude/hooks/testes/testar-instalacao.sh`, `git diff --check`.
- [ ] **Critério de término:** 24/24 verdes; núcleo ≤8.000 bytes e redução ≥60,7%; espelho idêntico; instalação nova; p95/volume dentro do orçamento; handoff/JSONL dentro dos limites; árvores limpas; no máximo um parecer final read-only.
- [ ] **Commit local esperado:** ExpxDev — `docs: registrar baseline pos mudanca das skills expx`; RunX — `test: fechar validacao da arquitetura runx` somente se houver lacuna de teste.

## Matriz de 24 cenários

| # | Cenário | Tarefa principal |
|---:|---|---:|
| 1 | primeira correspondência injeta | 2/4 |
| 2 | novo prompt no mesmo trabalho suprimido | 2/4 |
| 3 | mesmo prompt repetido suprimido | 2/4 |
| 4 | troca de skill emite delta | 2/4 |
| 5 | novo trabalho injeta | 2/4 |
| 6 | dois cwd independentes | 2/4 |
| 7 | duas sessões independentes | 2/4 |
| 8 | sessão retomada conserva supressão | 2/4 |
| 9 | transcript substitui session id | 2/4 |
| 10 | session id ausente não força anonimato | 2/4 |
| 11 | ambas identidades ausentes usam stateless | 2/4 |
| 12 | E4→E3 não reinjeta | 2/4 |
| 13 | TTL permite nova injeção | 2/5 |
| 14 | JSON corrompido reconstrói fail-open | 3/5 |
| 15 | concorrência normal emite uma vez | 3/5 |
| 16 | symlink não toca alvo | 3/5 |
| 17 | eventos autônomos seguem política uniforme | 2/4 |
| 18 | Node ausente/incompatível usa shell | 3/4 |
| 19 | timeout é fail-open | 3/5/6 |
| 20 | prompt e hash não são persistidos | 2/5 |
| 21 | limites de hook, transição, JSONL e handoff | 3/5/13 |
| 22 | uma injeção por trabalho/skill e deltas | 2/4 |
| 23 | benchmark p50/p95 | 15 |
| 24 | prioridade/classificador permanecem iguais | 2/4 |

## Dependências entre repositórios

1. As Tasks 2–6 do ExpxDev e 7–13 do RunX podem avançar separadamente somente depois da baseline dupla da Task 1.
2. A Task 14 depende do hook empacotado da Task 6 e do RunX sincronizado com helper da Task 13.
3. A Task 15 depende do hook estável das Tasks 4–6, mas não do conteúdo RunX.
4. A Task 16 depende das validações cruzadas da Task 14 e do benchmark da Task 15.
5. Nenhum commit de um repositório inclui vendoring ou cópia da fonte do outro; a integração usa caminhos locais explícitos e diretórios temporários.

## Decisões humanas ainda necessárias durante a execução

- Escolher como integrar cada branch local depois da validação; este plano não autoriza push, PR ou merge.
- Decidir qualquer baseline que não possa ficar verde apenas com correção do ambiente de testes.
- Windows/Git Bash usa o gate incremental pareado da Task 15; qualquer outra exceção de plataforma exige nova decisão humana.
- Autorizar explicitamente qualquer mudança de contrato público descoberta como indispensável; o plano presume compatibilidade total.
- Revisar e aprovar o resultado deste plano antes de iniciar a Task 1.

## Self-review do plano

- **Cobertura:** requisitos A–E, quatro gates de baseline, 24 cenários, instalação, espelho, benchmarks e entrega final estão atribuídos a tarefas.
- **Granularidade:** cada tarefa produz uma capacidade testável e um commit local coeso; REDs preparatórios ficam sem commit até seu GREEN correspondente.
- **Tipos/contratos:** nomes das classes, comandos do helper, campos do hook e limites são consistentes com a especificação.
- **Review focus:** os cinco modos de falha estão presos a testes e tarefas específicas.
- **Proporção:** implementação do hook, reorganização documental, helper e integração têm gates independentes; nenhuma tarefa executa publicação ou consumidor.
