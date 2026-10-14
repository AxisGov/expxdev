---
description: Reabre, de forma estreita, uma entrega bloqueada exclusivamente pela V9 depois que predecessores SprintX foram provados.
---

Acione a skill `mergex` e siga `references/13-predecessores-sprintx.md`.

Trabalho: $ARGUMENTS

Resolva `<trabalho>` a partir do argumento e use a entrega canônica
`docs/entregas/<trabalho>/ENTREGA.md`. Primeiro rode:

```bash
bash .claude/skills/mergex/scripts/retomar-v9-predecessores.sh --verificar \
  --entrega docs/entregas/<trabalho>/ENTREGA.md --origem sprintx --trabalho <trabalho>
```

Só com `ok=true`, repita o mesmo comando trocando `--verificar` por `--aplicar`; não omita
`--entrega`, `--origem sprintx` ou `--trabalho`. O comando termina em `proxima=E2`: execute de
novo o E2 inteiro; não pule diretamente para E3, push ou PR.
