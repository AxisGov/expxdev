# Predecessores verificáveis — pins coordenados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixar e certificar, numa única PR do ExpxDev, o par SprintX/MergeX que implementa predecessores verificáveis.

**Architecture:** Os snapshots continuam sendo extraídos byte a byte dos commits Git. A certificação instala ambos pelo fluxo real e prova o contrato cruzado executando o produtor SprintX e o consumidor MergeX sobre um repositório descartável.

**Tech Stack:** TypeScript, Vitest, Bash 3.2, Git.

**Spec:** `docs/superpowers/specs/2026-10-13-predecessores-verificaveis-pins-design.md`

## Global Constraints

- SprintX deve ficar em `8e2547c6a7f43f3cdb6d5d01845a4ce61b10ba36`.
- MergeX deve ficar em `ccee68c5c11b530836cc26efc6058aba150e0436`.
- Snapshots vêm somente de `scripts/fixture-candidatos.sh`.
- A prova usa `expxdev init` real, HOME isolado e scripts instalados.
- BuildX, produto, cache, marketplace e instalação global ficam fora do escopo.

## Review Focus

- Um pin novo com o outro antigo não pode passar: o teste fixa e exercita o par.
- O produtor pode gerar um manifesto que o consumidor rejeita: o teste executa os dois em sequência.
- O teste pode usar acidentalmente a fonte externa: caminhos devem partir do produto instalado.
- O snapshot pode divergir do manifesto: `conferirSnapshot` e a suíte existente continuam bloqueando.
- A instalação pode escrever fora da fixture: as provas de HOME isolado permanecem verdes.

---

### Task 1: Certificar e fixar o par SprintX/MergeX

**Files:**
- Modify: `src/cli/certificacao-p02.test.ts`
- Modify: `src/teste/candidatos.ts`
- Regenerate: `fixtures/candidatos/sprintx/**`
- Regenerate: `fixtures/candidatos/sprintx.sha`
- Regenerate: `fixtures/candidatos/sprintx.MANIFESTO.sha256`
- Regenerate: `fixtures/candidatos/mergex/**`
- Regenerate: `fixtures/candidatos/mergex.sha`
- Regenerate: `fixtures/candidatos/mergex.MANIFESTO.sha256`

**Interfaces:**
- Consumes: `scripts/fixture-candidatos.sh <repo> <sha> <nome>` e os CLIs Bash instalados das duas skills.
- Produces: par certificado em `CANDIDATOS` e prova end-to-end do manifesto de predecessores.

- [ ] **Step 1: Escrever o teste de contrato cruzado**

Adicionar à certificação um caso que cria especificação e plano versionados antes do planejamento, chama o `predecessores.sh` instalado para registrar ambos, commita o nascimento do planejamento e chama o `predecessores-sprintx.sh` instalado sobre `HEAD`. Exigir código 0, `resultado=ok` e duas linhas `predecessor`.

- [ ] **Step 2: Executar o teste e confirmar o vermelho**

Run: `npx vitest run src/cli/certificacao-p02.test.ts`

Expected: FAIL porque os pins atuais não instalam os scripts do protocolo novo.

- [ ] **Step 3: Regenerar os dois snapshots e atualizar os pins**

Executar o gerador para os dois SHAs aprovados e atualizar `CANDIDATOS` e a documentação da certificação. Não editar bytes dentro dos snapshots.

- [ ] **Step 4: Executar a certificação e confirmar o verde**

Run: `npx vitest run src/cli/certificacao-p02.test.ts`

Expected: PASS, incluindo o ciclo produtor/consumidor.

- [ ] **Step 5: Rodar os portões completos**

Run: `npm test && npm run typecheck && npm run build`

Expected: todos com código 0.

- [ ] **Step 6: Commit**

Commitar documentação, pins, snapshots e certificação numa única mudança coerente.
