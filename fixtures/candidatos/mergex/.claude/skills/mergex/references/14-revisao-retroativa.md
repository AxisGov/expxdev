# Revisão retroativa (DM-346)

Caminho estreito para a task fechada no E1 sem revisão por task aprovada: o último item dela em
`ENTREGA.commits` tem `revisao: null` (fechada antes da revisão por task) ou `revisao: invalida`.
A V12 reprova essas tasks, e refazer o E1 reescreveria histórico. A revisão retroativa revisa os
commits que já existem e registra a aprovação num commit novo, só de evidências.

A mergex continua sem ler o resultado da revisão. Quem grava a evidência é o `revisar
--retroativa` do núcleo do expx; quem julga é o `conferir`.

## Passos

1. `revisao-retroativa.sh --listar ... -- <task>` imprime os commits registrados da task (lidos
   por `sequencia-de-commits.sh`, sem parser novo), em SHA completo, na ordem, separados por vírgula.
   Um commit pode ser de várias tasks: cada uma lista o seu.
2. `expx-revisao.mjs revisar --trabalho W --task T --retroativa --commits <lista>` grava
   `docs/entregas/W/revisao/T.json` com `modo: "retroativa"`, `base_commit`, `head` e
   `commits_da_task` na ordem dada.
3. `--verificar ... -- <tasks>` exige, para cada task:
   - ENTREGA do disco igual à do HEAD, com `kind: entrega` e o `trabalho_id` certo;
   - último item com `revisao` `null` ou `invalida`, e commit dele sem o trailer `Revisao-retroativa`;
   - evidência no disco com `modo: retroativa` e `commits_da_task` igual ao `--listar`;
   - árvore com mudança só nessas evidências e stage vazio;
   - `conferir --modo obrigatoria` com `ok` sobre o commit simulado num índice temporário. Nenhuma
     ref muda.
4. `--aplicar`, com os mesmos argumentos, pega a trava C5 (`metodo:revisao-retroativa`), refaz a
   prova e faz **um** commit só com as evidências:

   ```text
   chore(mergex): revisao retroativa de T1 T2

   Trabalho: W
   Revisao-retroativa: T1 T2
   ```

   O commit é validado com `contrato-de-commit.sh --validar-retroativa`. Depois, um item por task
   entra em `ENTREGA.commits` via `--acrescentar`, com o SHA desse commit e `revisao: ok`. A nota
   de desvio vai ao corpo da ENTREGA, na seção `## Revisão retroativa`, e nunca em `desvios`,
   que alimenta a V9. A ENTREGA fica suja, como no E1. A saída termina em `proxima=E2`, e o
   pre-e2 a persiste.

## A V12

O commit do último item que traz `Revisao-retroativa` só vale se a evidência dele, lida no
próprio commit, tiver `modo: retroativa` e `commits_da_task` igual aos commits dos itens
anteriores da task. Senão a linha vira `T FALHA retroativa-divergente` e a V12 é FALHA. O
`conferir` continua julgando a cobertura: aceita só se `ev.head..sha` toca apenas evidências, se
`commits_da_task` são ancestrais e não merges, e se a união dos diffs deles está nas chaves de
arquivos.

## O que não existe

Não há `--force`. Último item já aprovado, evidência divergente, produto sujo, stage preenchido,
ENTREGA do disco diferente do HEAD e `conferir` que não responde `ok` são recusados (código 3).
A revisão retroativa não emite `PRONTO`, não chama E3 e não autoriza publicação.
