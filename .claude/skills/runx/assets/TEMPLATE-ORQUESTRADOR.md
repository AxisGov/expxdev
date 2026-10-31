---
expx_schema: 1
expx_tool: runx
kind: orquestrador
trabalho_id: {{OC-ID}}
titulo: {{titulo da ocorrencia, uma linha}}
tipo_trabalho: ocorrencia
tipo_ocorrencia: {{bug | melhoria-ui | melhoria-ux | novo-relatorio | regra-de-calculo | campo-novo | outro}}
estagio: {{e1 | e2 | e3 | e4 | e5}}
status: {{nao_iniciado | em_andamento | bloqueado | concluido}}
criado_em: {{AAAA-MM-DD}}
atualizado_em: {{AAAA-MM-DD}}
concluido_em: null
sprints: [sprint-01]
caminho_critico: [T-01.01]
---

> Preencha pelo contrato e pela instrução comum de templates em `references/00-schema.md`.

# Orquestrador — {{OC-ID}} {{título da ocorrência}}

> Porta de entrada da execução. Escrito para quem abriu o repositório agora e não sabe nada. Só caminhos relativos; nunca o valor de um segredo.

## 1. Objetivo

{{O que esta ocorrência resolve. NO MÁXIMO 5 linhas.}}

## 2. Mapa e ordem de leitura

1. Este arquivo (`ORQUESTRADOR.md`)
2. `00-OCORRENCIA.md` — o chamado como chegou
3. `01-CAUSA-RAIZ.md` — a causa comprovada (ou o impacto mapeado) e as decisões que governam o plano
4. `base/00-INDICE.md` — e os arquivos da base que ele lista
5. `sprint-01/sprint.md` → `fases.md` → `tasks.md`
6. {{`sprint-02/` em diante, na ordem}}
7. `BLOQUEIOS.md` — bloqueios registrados durante a execução
8. `QA.md` — achados MÉDIA/BAIXA que permanecem válidos

## 3. Rota de execução

{{Sequência de sprints e fases. Marque explicitamente o que roda em paralelo com o quê, derivado de fases.md e dos depende_de. Ex.:}}

- Sprint 01: F-01.1 → F-01.2
- Sprint 02: F-02.1 ∥ F-02.2 (paralelas) → F-02.3

**Caminho crítico:** {{a cadeia de tasks/fases que define a duração total. Ex.: T-01.01 → T-01.02 → T-02.03}}

## 4. Ferramentas

- **Testes:** `{{comando exato}}`
- **Lint:** `{{comando exato, ou "NÃO EXISTE NO PROJETO"}}`
- **Typecheck:** `{{comando exato, ou "NÃO EXISTE NO PROJETO"}}`
- **MCPs / SDKs:** {{quais e para quê, ou "nenhum além do padrão"}}
- **Segredos:** {{NOME_DA_VARIAVEL}} — fica em {{onde: .env local, secret manager, CI}}. NUNCA escreva o valor.
- **Área de trabalho:** {{../<repo>--<OC-ID>-<slug> | checkout principal (sem worktree)}}

## 5. Papéis dentro de cada task

- **Implementador** — escreve o teste primeiro, vê falhar, implementa o mínimo até passar.
- **Revisor de testes** — uma vez após o vermelho de regressão estabilizar e antes do fix final; só repete se o digest do teste mudar.
- **Auditor de aceite** — verifica de fato o `criterio_aceite` da task antes de permitir `status: concluida`.

**Executor principal:** implementa. Os agentes opcionais e mutuamente exclusivos seguem
`references/06-estado.md`; a aprovação final é do E4 QA, nunca do E3.

## 6. Regras de autonomia

1. Não pergunte nada; não peça autorização para nada.
2. O teste vem antes do código, sempre. O teste de regressão tem que falhar antes do fix — se ele passar antes, pare e volte ao E1.
3. Task só é `concluida` com testes de integração e funcional afetados passando e `criterio_aceite` verificado. A suíte inteira roda uma vez no E4. Não existe "concluído com ressalva".
4. Aplique o limite de escopo do invariante 5 do `SKILL.md`.
5. Dúvida nova ou pré-requisito faltando: registrar em `BLOQUEIOS.md` (`B-NN | task | bloqueio | o que destravaria`), marcar a task `bloqueada`, pular para a próxima paralelizável. Nunca parar e esperar.
6. Só rode em paralelo o que o plano declarou paralelizável; a execução nunca decide paralelismo. Entre sprints, sempre sequencial.
7. Atualize `status` em `tasks.md` durante a execução; consolide ORQUESTRADOR, estado e handoff somente no próximo marco definido em `references/06-estado.md`.
8. Critério de saída de fase/sprint não atendido = não avança.

## 7. Definição de pronto da ocorrência

{{Lista verificável do que precisa ser verdade para esta ocorrência estar entregue — derivada do comportamento esperado em 01-CAUSA-RAIZ.md + critérios de saída das sprints. Ex.:}}

- [ ] {{condição verificável}}
- [ ] O teste de regressão falhava antes e passa agora.
- [ ] A suíte inteira passa com `{{comando}}`.
- [ ] Nenhum arquivo fora do escopo declarado foi alterado.

## 8. Como retomar uma sessão interrompida

1. Abra a sessão de dentro da área de trabalho da seção 4.
2. Leia este arquivo inteiro.
3. Leia o `status` de cada task em cada `sprint-NN/tasks.md`.
4. Leia `BLOQUEIOS.md`.
5. Execute `estado.py reconstruir` para derivar o cache local dos artefatos versionados.
6. Continue da primeira task `pendente` ou `em_andamento` cujas dependências (`depende_de`) estão todas `concluida`. Ignore as `bloqueada` até que o bloqueio registrado seja resolvido.
