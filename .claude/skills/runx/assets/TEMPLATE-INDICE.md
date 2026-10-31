---
expx_schema: 1
expx_tool: runx
kind: relatorios_indice
atualizado_em: {{AAAA-MM-DD}}
entradas:
  - data: {{AAAA-MM-DD}}
    oc_id: {{OC-ID}}
    tipo: {{bug | melhoria-ui | melhoria-ux | novo-relatorio | regra-de-calculo | campo-novo | outro}}
    modulo: {{modulo afetado}}
    resumo: {{o que mudou, uma linha}}
    pasta: {{AAAA-MM-DD}}-{{OC-ID}}-{{slug}}
---

> Este kind NAO leva `trabalho_id`: o indice e do sistema inteiro. A lista `entradas:` e append-only, mais recente no topo, e espelha exatamente a tabela em prosa abaixo. Toda ocorrencia fechada entra nas duas.

> Preencha pelo contrato e pela instrução comum de templates em `references/00-schema.md`.

# Índice de ocorrências

> Histórico permanente do sistema. Append-only: uma linha por ocorrência, mais recente no topo. Nunca reescreva, reordene nem apague linhas existentes — insira a nova logo abaixo do cabeçalho da tabela.

| data | OC-ID | tipo | módulo afetado | resumo | link |
|---|---|---|---|---|---|
| {{AAAA-MM-DD}} | {{OC-ID}} | {{tipo}} | {{módulo afetado}} | {{o que mudou, em uma linha}} | [{{AAAA-MM-DD}}-{{OC-ID}}-{{slug}}]({{AAAA-MM-DD}}-{{OC-ID}}-{{slug}}/) |
