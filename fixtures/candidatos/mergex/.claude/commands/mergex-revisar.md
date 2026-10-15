---
description: "Ação MANUAL de revisão e integração de pull requests. Executa apenas quando o desenvolvedor pede explicitamente por este comando, pelo nome. NÃO use por iniciativa própria, NÃO encadeie a partir de nenhum fluxo, NÃO ofereça ao fim de um trabalho e NÃO acione ao terminar uma entrega, um PR ou uma task: integrar código é decisão humana."
---

Acione a skill `mergex` e execute **a etapa E9 (revisão e merge)**, seguindo `references/09-revisao.md`.

Pull requests: $ARGUMENTS

## Antes de qualquer coisa

Este comando **só roda por chamada explícita do desenvolvedor**. Se você chegou aqui encadeado por um fluxo, sugerido ao fim de uma entrega, ou por iniciativa própria, **volte**: você está encadeando o que não pode ser encadeado.

## O que fazer

1. **Liste** os pull requests abertos do repositório, inclusive rascunhos.
2. **Reúna o estado** de cada um: registro de entrega da mergex, faixa de raio da legadox, classificação de atenção, resultado da integração contínua, e se há conflito com a base. Fonte ausente vira "não disponível", nunca suposição.
3. **Destaque no topo** os PRs que tocam o mesmo arquivo, com os dois identificados e os arquivos em comum nomeados. Não é prevenção de colisão — é informação para quem decide a ordem.
4. **Ordene do MENOR para o MAIOR impacto**, com o critério declarado na saída: faixa de raio → arquivos em olho obrigatório → sobreposição → conflito → quantidade de arquivos → número do PR.
5. **Apresente por PR**: título, autor, trabalho de origem, faixa de impacto, arquivos tocados, estado da integração contínua, se tem conflito, o veredito do REVIEW EVIDENCE GATE e a recomendação em uma linha. Marque os PRs abertos por esta instalação da mergex: **a skill não aprova o próprio trabalho.**
6. **Avalie o REVIEW EVIDENCE GATE de cada PR** antes de oferecer merge: mudança de código não encerra review, evidência encerra review. Finding válido sem evidência publicada vira um pacote `REVIEW REMEDIATION` devolvido a quem executou (sprintx, runx ou buildx), e o PR fica `REVIEW PENDENTE` — a mergex nunca corrige código de produto para satisfazer um review.
7. **Conduza um PR por vez**, na ordem, com confirmação explícita antes de cada merge.

Use `assets/TEMPLATE-revisao.md`.

## Regras invioláveis

- **Nunca resolve conflito.** Relata onde está, quais arquivos e trechos, e o que cada lado pretendia segundo a mensagem de commit e o plano de cada trabalho. Essa análise é o que este comando tem de mais útil. **A resolução é humana.**
- **Nunca faz merge com integração contínua vermelha.**
- **Nunca faz merge de PR em rascunho.**
- **Nunca faz merge sem confirmação daquele PR específico.** Nunca em lote, nunca uma confirmação única para vários.
- **Nunca faz merge de PR com faixa OLHO OBRIGATÓRIO** sem que o desenvolvedor confirme que revisou os arquivos daquela faixa, nomeados um a um.
- **Nunca faz merge de PR com `REVIEW EVIDENCE: BLOQUEADO`.** Detalhe completo — os seis estados do finding, os critérios R1–R6, o formato da resposta e a ordem de resolução de thread — em `references/09-revisao.md`.
