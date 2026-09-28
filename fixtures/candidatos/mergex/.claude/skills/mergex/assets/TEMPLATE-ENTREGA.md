# TEMPLATE — registro da entrega (E0 e E8)

Grave em `docs/entregas/<trabalho_id>/ENTREGA.md`. Substitua todos os
marcadores `{{assim}}`. O frontmatter segue o contrato expx-schema v1
(`references/08-registro.md`): nenhuma chave é omitida — ausente é `null` ou
`[]`. Datas com `date +%Y-%m-%d` do sistema, nunca de memória.
O YAML e a prosa andam juntos. Apague este cabeçalho ao gravar.

`arquivos_alterados` é o **diff real**, não a previsão das tasks. `faixa_atencao` usa o
vocabulário do índice (`alta`/`media`/`baixa`), não o nome da faixa em prosa: OLHO
OBRIGATÓRIO → `alta`, LEITURA RÁPIDA → `media`, DISPENSÁVEL → `baixa`. As duas listas são
`[]` enquanto o E3 não rodou; nunca omita a chave.

Numa entrega nova, `commits` nasce `[]` e o primeiro E1 grava `seq: 1`. **Não escreva item de
`commits` à mão**: o escritor é `scripts/sequencia-de-commits.sh --acrescentar`, que calcula o
próximo `seq` e acrescenta no fim. Toda gravação nova leva `seq`; item legado (sem `seq`) só
existe como **prefixo** de lista antiga, e não há backfill — ele nunca ganha a chave
retroativamente (`references/00-schema.md`, "A ordem de registro").

`falhas_portao` e `causa` nunca são omitidas (`references/00-schema.md`, "A causa do
bloqueio"). `causa` é `null` salvo em `estado: bloqueado`, onde é obrigatória e sai do script,
nunca da mão. Confira com `scripts/causa-do-portao.sh --validar` antes de commitar.

---

---
expx_schema: 1
expx_tool: {{sprintx | runx}}
kind: entrega
trabalho_id: {{slug da feature ou OC-ID-slug}}
entregue_por: mergex
titulo: {{titulo do trabalho, uma linha, sem acento no frontmatter}}
tipo_trabalho: {{feature | ocorrencia}}
tipo_ocorrencia: {{tipo da runx | null}}
estado: {{aberto | entregue | bloqueado}}
versionado: {{true | false}}
branch: {{nome da branch | null}}
branch_base: {{nome da base | null}}
commits:
  - seq: {{ordem de registro do E1: 1, 2, 3...}}
    task: {{T-NN.MM}}
    commit: {{identificador curto}}
modulo_afetado: [{{modulos em minuscula sem acento, ou vazio}}]
arquivos_alterados: [{{o diff real: git diff --name-only <base>...HEAD, sem repeticao, ou vazio}}]
faixa_atencao:
  - arquivo: {{caminho de arquivos_alterados}}
    faixa: {{alta | media | baixa}}
raio: {{baixo | medio | alto | null}}
atencao:
  olho_obrigatorio: {{n}}
  leitura_rapida: {{n}}
  dispensavel: {{n}}
portao: {{pronto | bloqueado | null}}
falhas_portao: [{{as verificacoes com FALHA no E2: v1..v11, ou vN_sem_prova; vazio sem portao ou com PRONTO}}]
causa: {{null | a causa derivada por scripts/causa-do-portao.sh --derivar, so com estado bloqueado}}
desvios: []
push_feito: {{true | false}}
pr_url: {{url | null}}
pr_estado: {{rascunho | aberto | merged | fechado | null}}
criado_em: {{AAAA-MM-DD}}
atualizado_em: {{AAAA-MM-DD}}
entregue_em: {{AAAA-MM-DD | null}}
---

# Entrega — {{título do trabalho}}

{{uma linha: o que foi entregue e onde está}}

## Onde está o quê

| O quê | Onde |
|---|---|
| Descrição do pull request | [PR.md](PR.md) |
| Pacote de QA | [QA-PACOTE.md](QA-PACOTE.md) |
| Classificação da atenção | [ATENCAO.md](ATENCAO.md) |
| Trabalho de origem | [{{pasta}}]({{caminho relativo}}) |
| Pull request | {{url | não aberto}} |

## Estado da entrega

- Branch: {{nome}} — {{aberta pela mergex | retomada | adotada da skill de origem}}
- Base: {{branch_base}} — {{informada pelo chamador | CONVENCOES.md | origin/HEAD | principal atual}}
- Portão de prontidão: {{PRONTO | BLOQUEADO}}
- Commits: {{n}}, um por task
- Commit de artefatos de método: {{identificador curto | não feito}}
- Atenção humana: {{x}} olho obrigatório, {{y}} leitura rápida, {{z}} dispensável
- Push: {{feito | não feito — motivo}}
- Pull request: {{estado}}
- Falta para o merge: {{o que falta — revisão humana, QA, etc.}}

## Avisos

{{insumos ausentes acumulados pelas etapas: sem raio, sem roteiro manual, sem
DIVIDA.md, ferramenta de PR ausente, convenção divergente}}

## Desvios

{{arquivos alterados fora da lista declarada nas tasks, quando houver}}
