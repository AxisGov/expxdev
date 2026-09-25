---
description: Verifica se o trabalho está realmente pronto para entregar — etapa E2 da mergex, o portão de prontidão, isolada. Roda as onze verificações (tasks concluídas, registro de suíte por task e suíte inteira no fechamento da sprint, dois testes por task, teste de regressão, QA, auditoria, bloqueios, modo legado, arquivos fora do escopo, segredos no diff, commit do E1 por task concluída) e devolve PRONTO ou BLOQUEADO com o que falta. Use antes de entregar, ao perguntar se está pronto para PR, ou para conferir a entrega.
---

Acione a skill `mergex` e execute **apenas a etapa E2 (portão de prontidão)**, seguindo `references/02-prontidao.md`.

Trabalho: $ARGUMENTS

## O que fazer

Primeiro execute somente a barreira:

```bash
bash .claude/skills/mergex/scripts/persistir-metodo.sh --verificar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id> --checkpoint pre-e2
```

Se houver método pendente, pare. Este comando não chama o modo de gravação; o checkpoint é ação explícita anterior ao E2.

Rode **todas as onze verificações**, mesmo depois de a primeira falhar — o usuário precisa da lista completa do que falta, não do primeiro erro. Verificação que não se aplica é marcada `n/a`, nunca omitida.

| # | Verificação |
|---|---|
| V1 | Task com status diferente de `concluida` |
| V2 | Task concluída sem registro de suíte que a sustente (`parcial` e `verde` valem; `vermelha` e `nao_executada` barram), e a evidência da suíte inteira no fechamento de cada sprint |
| V3 | Task sem teste de integração ou sem teste funcional |
| V4 | Bug da runx cuja primeira task não tem teste de regressão |
| V5 | QA da runx reprovado, ou ausente quando exigido |
| V6 | Auditoria da sprintx reprovada |
| V7 | Bloqueio aberto que afeta o escopo entregue |
| V8 | Modo legado: raio, caracterização, reversão, orçamento, aprovação |
| V9 | Arquivo alterado fora da lista declarada no plano |
| V10 | Segredo, credencial ou dado real de cliente no diff |
| V11 | Task concluída sem commit do E1 correspondente em `ENTREGA.commits` |

**V10 roda sempre, mesmo quando todo o resto passou.**

**V11 responde uma pergunta só:** cada task `concluida` tem pelo menos um item em `ENTREGA.commits` com `task` igual ao id dela e `commit` válido? Task não concluída não é alvo dela — isso é da V1. Rode com `scripts/prova-de-commit.sh --verificar <ENTREGA.md> <tasks.md>...`.

Use `assets/TEMPLATE-prontidao.md`. A saída é binária: `PRONTO` ou `BLOQUEADO`, com o que falta e onde corrigir.

O portão barra e explica. **Nunca maquia, nunca passa com ressalva, nunca ajusta o trabalho para caber.** Este comando só verifica: não commite, não suba nada, não abra PR.
