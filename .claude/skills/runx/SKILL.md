---
name: runx
description: "Use ao relatar defeito em sistema que já existe: não funciona como deveria, não segue o padrão esperado, trava, some ou dá valor errado — mesmo sem a palavra bug. Inclui falha de interface e interação (arrastar, clicar, salvar) e ajuste de tela, cálculo ou campo. Feature nova é sprintx."
---

# runx

## Gatilho

Use `runx` quando uma ocorrência de manutenção já chegou ao desenvolvimento: defeito em comportamento existente, melhoria de UI/UX, relatório dentro de estrutura existente, regra de cálculo, campo novo ou outro ajuste localizado. Feature nova do zero usa `sprintx`.

A entrada pode ser texto, ticket ou arquivo. O deploy é externo: a runx investiga, planeja, corrige, valida e documenta; apenas registra uma liberação informada pelo usuário.

## Invariantes

1. Evidência antes de hipótese: mapear a base precede causa, plano e código.
2. Bug não avança sem causa demonstrada; sem prova, E1 permanece bloqueado.
3. Plano antes do fix, sempre na hierarquia sprint → fase → task e com contrato completo.
4. Regressão primeiro: o teste nasce e fica vermelho antes de qualquer implementação.
5. Escopo travado: só se toca o que causa/impacto e plano autorizam.
6. Task só fecha verde no subconjunto afetado; suíte completa em E4, uma única vez.
7. Critérios de aceite são binários; paralelismo e dependências vêm do plano.
8. Implementador não aprova. QA não corrige; achado bloqueante retorna ao E3.
9. Bloqueios são registrados no E3, nunca resolvidos por suposição ou pergunta improvisada.
10. Artefatos, eventos, diagramas e transições são determinísticos; caminhos gravados são relativos.
11. Arquivo de estado usa `expx-schema v1`; valor ausente é explícito, não chave omitida.
12. Nada em `docs/manutencao/` é apagado ou movido pela skill.
13. Coincidência de arquivo não é regressão; vínculo causal exige evidência.
14. Uma ocorrência aberta por worktree. Uma sessão por ocorrência; nova ocorrência começa em nova sessão.
15. `usage_limit_reached` encerra imediatamente: sem repetição, continuação automática, troca de modelo ou abertura de agente.
16. Nenhuma segunda leitura por revisor sem mudança do artefato ou lote revisado.

Agentes são opcionais, read-only e mutuamente exclusivos. Hooks são proteção adicional; sua ausência não muda o método. A política operacional e de capacidade está em `references/06-estado.md` e só é carregada quando necessária.

## Máquina de estados

Fluxo estritamente sequencial:

`E1 INVESTIGAÇÃO → E2 PLANO → E3 FIX → E4 QA → E5 RELATÓRIO`

Detecte o estágio pelos artefatos em `docs/manutencao/<OC-ID>-<slug>/`:

| Estado observado | Estágio |
|---|---|
| pasta ausente, ou `base/` sem causa/impacto concluído | E1 |
| causa/impacto concluído sem plano e `ORQUESTRADOR.md` | E2 |
| plano e orquestrador com task executável | E3 |
| tasks encerradas sem `QA.md` aprovado | E4 |
| `QA.md` com `VEREDITO: APROVADO` | E5 |

Retornos permitidos:

- E3 → E1 quando o teste de regressão passa antes do fix; registre a divergência e reinvestigue.
- E4 → E3 quando o QA reprova; preserve o veredito e corrija somente no E3.
- E4 aguarda, sem reprovar, quando outra sessão contamina a árvore.

Nunca pule estágio por pedido do usuário. Havendo mais de uma ocorrência aberta sem identificação suficiente, liste estágio e caminho de cada uma e peça a escolha.

## Roteamento por estágio

Leia somente a referência do estágio atual antes de agir:

| Estágio | Referência operacional | Templates lidos somente antes de criar o artefato |
|---|---|---|
| E1 | `references/01-investigacao.md` | `TEMPLATE-ocorrencia.md`, `TEMPLATE-base-area.md`, `TEMPLATE-causa-raiz.md` ou `TEMPLATE-analise-impacto.md` |
| E2 | `references/02-plano.md` | `TEMPLATE-plano-condensado.md` ou os templates de sprint/fases/tasks; `TEMPLATE-ORQUESTRADOR.md` |
| E3 | `references/03-fix.md` | nenhum |
| E4 | `references/04-qa.md` | `TEMPLATE-qa.md` |
| E5 | `references/05-relatorio.md` | templates técnico, de uso e de índice |

Carregue `references/00-schema.md` quando a operação for validar ou gravar um artefato. Carregue `references/06-estado.md` quando houver transição, bloqueio, decisão, término, recuperação ou decisão sobre agente. Carregue `references/07-diagrama.md` somente ao gerar ou atualizar um diagrama. Um template é lido somente imediatamente antes de criar o documento correspondente.

Detalhes, exemplos, schemas, contratos de task/fase/sprint, layouts, hooks, eventos e instruções de preenchimento pertencem às referências e templates acima, não a este núcleo.

## Condição de término

A ocorrência termina somente quando E5 estiver encerrado, com:

- `QA.md` aprovado após suíte completa verde;
- relatórios técnico e de uso gravados;
- `docs/relatorios/INDICE.md` atualizado sem alterar entradas anteriores;
- ocorrência marcada concluída nos artefatos versionados;
- estado local derivado fechado pelo procedimento de `references/06-estado.md`.

Não faça deploy, não apague a worktree e não encurte o encerramento por limite de contexto.
