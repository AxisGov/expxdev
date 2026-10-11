---
description: Garante a branch do trabalho antes da primeira linha de código — etapa E0 da mergex, isolada. Adota a branch e o worktree que a skill de origem já criou, e só cria branch quando não existe nenhuma. Use ao começar a implementar uma feature ou uma ocorrência, ao iniciar a execução de um plano, ou quando pedirem para criar a branch do trabalho, versionar o que vai ser feito ou preparar o repositório para receber a implementação.
---

Acione a skill `mergex` e execute **apenas a etapa E0 (abertura)**, seguindo `references/00-abertura.md` — inclusive a ativação do `pre-push` (`ativacao-pre-push.sh --instalar`), que, quando falha, encerra o E0 como `mergex E0 BLOQUEADO — pre-push`.

Trabalho: $ARGUMENTS

Se nenhum trabalho for informado, descubra qual é pelo disco, nesta ordem: `docs/sprintx/features/<slug>/ORQUESTRADOR.md` (sprintx, canônico), `docs/<slug>/ORQUESTRADOR.md` (sprintx, formato antigo) ou `docs/manutencao/<OC-ID>-<slug>/ORQUESTRADOR.md` (runx). **Nunca mova uma pasta em formato antigo** — trabalhe nela onde está.

## O que fazer

1. Detectar se o repositório usa versionamento. Sem versionador: registre e siga sem erro.
2. Determinar o nome da branch do trabalho (`feature/<slug>`, `fix/<OC-ID>-<slug>` ou `chore/<OC-ID>-<slug>`; convenção do repositório vence). Se a skill de origem já abriu a branch, o nome dela vence.
3. Determinar a branch base, nesta ordem: **base informada pelo chamador** (valide que a ref existe; se não existir, PARE — nunca troque por outra em silêncio), senão a convenção declarada na stackx, senão a detectada no repositório, senão a principal atual.
4. Adotar, criar ou trocar — nesta ordem de casos:
   - **A branch ativa já é a do trabalho:** **adote**. Não execute `git switch`, não crie outra branch e **não exija árvore limpa** para isso. É o caso normal quando a F1 da sprintx abriu a feature em worktree próprio.
   - **A branch alvo está em outro worktree** (`git worktree list --porcelain`): informe o caminho e encerre. Nunca troque, nunca remova worktree de ninguém.
   - **Criar ou trocar branch:** aí sim verifique se há alteração não commitada pendente. **Se houver, PARE e avise** — nunca crie nem troque branch por cima de trabalho não salvo. Branch que já existe é retomada, nunca duplicada.
5. Registrar a branch no `ORQUESTRADOR.md` (dizendo se foi aberta, retomada ou adotada) e criar `docs/entregas/<trabalho_id>/ENTREGA.md` com `estado: aberto` e a base efetiva em `branch_base`.
6. Depois de criar ou retomar o `ENTREGA.md`, ativar o `pre-push` da MergeX (repositório versionado):

   ```bash
   bash .claude/skills/mergex/scripts/ativacao-pre-push.sh --instalar \
     --entrega docs/entregas/<trabalho_id>/ENTREGA.md
   ```

   O script usa o diretório de hooks efetivo do Git, **nunca altera `core.hooksPath`** e **nunca sobrescreve, renomeia ou edita** um `pre-push` de terceiro; termina sempre com a prova funcional. Diretório efetivo **fora da árvore de trabalho e do diretório Git comum** (`core.hooksPath` global): o script **não instala** o chamador e sai `3` com a instrução de composição. Fora de um repositório Git: sai `0` sem instalar nada. **Código diferente de zero: `mergex E0 BLOQUEADO — pre-push`** — pare aqui, não devolva o controle como OK, e mostre a instrução que o script imprimiu (com hook de terceiro ou diretório fora do repositório, a de composição: `references/12-barreira-de-push.md`).

Ao terminar, devolva uma linha com o nome da branch, a base e como ela chegou até aqui, e devolva o controle: quem executa as tasks é a skill de origem.
