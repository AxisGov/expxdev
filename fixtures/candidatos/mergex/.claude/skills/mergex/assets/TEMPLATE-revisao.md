# TEMPLATE — revisão e merge de pull requests (E9, MANUAL)

Saída do comando `/mergex-revisar`, que só roda por chamada explícita do
desenvolvedor. Substitua todos os marcadores `{{assim}}`.
Apague este cabeçalho ao usar.

---

# Pull requests abertos — {{n}}

## Sobreposição entre PRs abertos

{{quando dois ou mais PRs tocam o mesmo arquivo — vai no TOPO, sempre}}

```
#{{n}} "{{título}}" ({{branch}})
#{{n}} "{{título}}" ({{branch}})
Em comum:
  {{caminho do arquivo}}
```

Isto não é bloqueio e não há conflito ainda. É informação para decidir a ordem:
o segundo a entrar vai precisar rebasear ou resolver conflito. A mergex não
previne colisão entre desenvolvedores.

## Critério de ordenação

Do MENOR para o MAIOR impacto, porque cada merge fácil que entra reduz a
superfície do próximo, e porque adiar o difícil não o piora — adiar o fácil sim.

Desempate, nesta ordem: faixa de raio → arquivos em olho obrigatório →
sobreposição com outro PR → conflito com a base → quantidade de arquivos →
número do PR.

## Fila

### {{ordem}}. #{{n}} — {{título}}

- Autor: {{autor}}
- Trabalho: {{trabalho_id}} ({{skill de origem}}, {{tipo}})
- Impacto: {{raio}} — {{n}} arquivos em olho obrigatório
- Arquivos: {{n}} ({{agrupamento por pasta}})
- Integração contínua: {{verde | vermelha | sem integração configurada | resultado não obtido}}
- Conflito: {{não | sim, com a base | sim, com #n}}
- Review Evidence: {{SATISFEITO | BLOQUEADO}}
- Reviews: {{n}} actionable, {{n}} aguardando evidência, {{n}} aguardando re-review, {{n}} rejeitados com evidência, {{n}} resolvidos, {{n}} obsoletos
- {{[aberto por esta instalação da mergex — a skill não aprova o próprio trabalho]}}
- Recomendação: {{uma linha, derivada do estado, nunca de opinião — ausente quando BLOQUEADO}}

{{bloco do REVIEW EVIDENCE GATE — obrigatório em TODO PR, SATISFEITO ou BLOQUEADO}}

```
REVIEW EVIDENCE — {{SATISFEITO | BLOQUEADO}}{{ (recalculado nesta execução) — só depois de confirmação humana}}

R1 CI: {{OK | FALHOU | n/a | NÃO VERIFICÁVEL}}
R2 blocking reviews: {{OK | OK (confirmação humana) | FALHOU | NÃO VERIFICÁVEL}}
R3 actionable threads: {{OK | OK (confirmação humana) | FALHOU — {{n}} findings | NÃO VERIFICÁVEL}}
R4 fix evidence: {{OK | FALHOU | n/a}}
R5 review reply: {{OK | OK (confirmação humana) | FALHOU | n/a | NÃO VERIFICÁVEL}}
R6 closure: {{OK | OK (confirmação humana) | FALHOU | n/a | NÃO VERIFICÁVEL}}

{{somente quando BLOQUEADO:}}
Tipo de bloqueio: {{corrigível por remediação | confirmável humanamente nesta execução}}
Findings pendentes:
  {{arquivo}}:{{linha}} — {{descrição}}
Confirmações que serão pedidas no passo 7: {{somente se confirmável — uma por critério/finding}}

{{somente quando houve confirmação humana nesta execução:}}
Confirmações humanas nesta execução:
  {{R2 | R3 | R5 | R6}} — {{o que foi confirmado, e para qual finding}}
```

{{BLOQUEADO corrigível por remediação entra em "Não oferecidos para merge". BLOQUEADO
confirmável humanamente fica na fila marcado "confirmação humana necessária"}}

## Conflitos

{{um bloco por PR em conflito — relatar, NUNCA resolver}}

```
CONFLITO — #{{n}} contra {{base | #n}}

  {{arquivo}}, {{função ou trecho}}, linhas {{n}}–{{n}}

  O que #{{n}} pretendia:
    "{{objetivo, da mensagem de commit da task}}"
    ({{task}}, {{branch}})

  O que o outro lado pretendia:
    "{{objetivo do outro lado}}"
    ({{origem}})

  Por que se cruzaram:
    {{mesma função, mesma linha, ou mudanças adjacentes}}

  A mergex não resolve conflito. Resolver isto é decisão humana.
```

## Não oferecidos para merge

{{cada PR aqui também mostra, na fila acima ou junto do motivo, o bloco R1–R6 completo}}

{{motivo: rascunho, integração contínua vermelha, ou REVIEW EVIDENCE: BLOQUEADO (corrigível por remediação)}}

| PR | Motivo |
|---|---|
| #{{n}} | {{motivo}} |

## Review Remediation

{{um bloco por finding válido devolvido à skill de origem — o pacote é o de "O pacote de
remediação", em references/09-revisao.md; o template só o materializa}}

- #{{n}} {{arquivo}}:{{linha}} — origem {{ID ou URL estável do review/comentário de origem}} — publicado em {{thread <url> | comentário no PR <url> | NÃO PERSISTIDO — <motivo literal>}}

```
REVIEW REMEDIATION

Finding:
{{texto normalizado}}

Origem:
{{ID ou URL estável do review/comentário de origem}}

Arquivo:
{{caminho/linha}}

Validação:
{{por que é válido}}

Correção esperada:
{{comportamento esperado, não implementação inventada}}

Regressão necessária:
{{teste que deve provar a correção}}

Review reply esperada:
{{resposta de evidência esperada}}
```

---

## Condução

Um PR por vez, na ordem acima, com confirmação explícita daquele PR
específico. Nunca em lote. PR com faixa OLHO OBRIGATÓRIO ou raio ALTO exige,
antes, a confirmação de que o desenvolvedor revisou os arquivos daquela faixa,
nomeados um a um. PR com Review Evidence diferente de SATISFEITO nunca é
oferecido — mudança de código não encerra review, evidência encerra review.

PR bloqueado apenas por critério confirmável humanamente: antes de qualquer
pergunta de merge, (A) pedir cada confirmação específica, (B) recalcular o gate
e mostrar R1–R6 de novo, (C) só seguir se o resultado for SATISFEITO. A
confirmação vale só nesta execução, não altera a fonte remota e não substitui a
confirmação final do merge daquele PR.

## Resumo final

- Integrados: {{lista}}
- Pendentes: {{lista, com o motivo de cada um}}
- Confirmações humanas do gate nesta execução: {{#n — critério/finding — resposta}}
