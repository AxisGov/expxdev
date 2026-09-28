---
description: Leva o trabalho já implementado até o repositório e até o revisor — roda o fluxo automático completo da mergex a partir do estado atual, verificando a prontidão, classificando o que exige olho humano, montando a descrição do pull request e o pacote do QA, subindo a branch e abrindo o PR. Use ao terminar uma feature ou uma ocorrência, ao pedir para entregar, versionar, subir o trabalho, abrir PR ou passar para o QA.
---

Acione a skill `mergex` e execute o **fluxo automático completo** a partir do estado atual do trabalho.

Trabalho: $ARGUMENTS

Se nenhum trabalho for informado, use o contexto explícito já fornecido pela sessão ou um único `ENTREGA.md` aberto. Havendo mais de um candidato, peça a escolha: **a branch nunca seleciona o trabalho**; ela apenas precisa conferir com `ENTREGA.branch`. `trabalho_id` e `expx_tool` determinam a pasta canônica `docs/sprintx/features/<slug>/`, o fallback legado `docs/<slug>/` ou a pasta RunX.

## O que executar

Descubra em que ponto o trabalho está e siga daí:

| Estado | Rode |
|---|---|
| O trabalho vai começar | **E0** (`references/00-abertura.md`) — adota a branch e o worktree que a skill de origem já abriu, ou cria a branch quando não existe nenhuma — e devolva o controle para a skill de origem executar as tasks |
| Há task concluída sem commit | **E1** (`references/01-commits.md`) para cada uma, na ordem em que fecharam |
| A execução terminou | **E2 → E8**, nesta ordem |

O fluxo do fim, com checkpoints explícitos:

1. **pre-e2** — ação auditável: `persistir-metodo.sh --persistir ... --checkpoint pre-e2`.
2. **E2** — chama apenas `persistir-metodo.sh --verificar ... --checkpoint pre-e2` e então roda o portão. `BLOQUEADO` pula E3–E7 e segue ao E8.
3. **E3 → E5** — atenção, descrição do PR e pacote de QA.
4. **pre-e6** — ação auditável: `persistir-metodo.sh --persistir ... --checkpoint pre-e6`.
5. **E6** — chama apenas `persistir-metodo.sh --verificar ... --checkpoint pre-e6` antes do push.
6. **E7** — abertura do pull request.
7. **E8** — grava o terminal e chama `persistir-metodo.sh --persistir ... --checkpoint e8`; só depois publica o commit final no caminho entregue.

Leia o reference da etapa atual antes de agir, e somente o dela.

## Regras

- Execute de ponta a ponta, sem perguntar e sem pedir autorização.
- Nada na entrega é inventado: todo conteúdo vem de artefato existente. Insumo ausente vira aviso do que falta.
- Nunca push forçado, nunca na branch principal, nunca reescrever histórico enviado.
- Ferramenta de abertura de PR ausente não é erro: grave a descrição em `PR.md` e informe. Nunca peça credencial.
- Repositório sem versionador não é erro: siga sem as etapas de versionamento.
- **Ao terminar, NÃO sugira o merge e NÃO sugira `/mergex-revisar`.** A revisão e a integração são manuais e só rodam quando o desenvolvedor as chama pelo nome.
