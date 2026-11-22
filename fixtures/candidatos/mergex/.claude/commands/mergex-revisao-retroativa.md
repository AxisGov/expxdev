---
description: Dá a revisão por task, depois do fechamento, às tasks cujo último item em ENTREGA.commits ficou com revisao null ou invalida.
---

Acione a skill `mergex` e siga `references/14-revisao-retroativa.md`.

Trabalho e tasks: $ARGUMENTS

Resolva `<trabalho>` e as tasks a partir do argumento e use a entrega canônica
`docs/entregas/<trabalho>/ENTREGA.md`. Para cada task, liste os commits registrados e grave a
evidência retroativa com o núcleo:

```bash
bash .claude/skills/mergex/scripts/revisao-retroativa.sh --listar \
  --entrega docs/entregas/<trabalho>/ENTREGA.md --trabalho <trabalho> -- <task>
node .expx/marketplace/plugins/expx/nucleo/scripts/expx-revisao.mjs revisar \
  --trabalho <trabalho> --task <task> --retroativa --commits <saída do --listar>
```

Depois prove todas de uma vez:

```bash
bash .claude/skills/mergex/scripts/revisao-retroativa.sh --verificar \
  --entrega docs/entregas/<trabalho>/ENTREGA.md --trabalho <trabalho> -- <task>...
```

Só com `ok=true`, repita o mesmo comando trocando `--verificar` por `--aplicar`, com as mesmas
tasks. O comando termina em `proxima=E2`: execute de novo o E2 inteiro, a partir do pre-e2; não
pule para E3, push ou PR.
