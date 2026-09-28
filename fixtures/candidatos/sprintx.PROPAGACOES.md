# fixtures/candidatos/sprintx — propagações sobre o commit fixado

`sprintx.sha` guarda o commit BASE do snapshot: `253b59233e6d7a225a05f011cf52668b708e448b`
(AxisGov/sprintx, ponta de `origin/p0.2/sprintx-c7b`). Este arquivo registra o que
foi propagado POR CIMA dessa base e por quê — sem ele, o snapshot pareceria ser os
bytes do commit, e não é.

Quem regera o snapshot com `scripts/fixture-candidatos.sh` extrai só a base e
**desfaz** tudo o que está listado aqui. O que acusa isso é teste, não este texto:
o describe `P0.2 — o rastro do hook instalado é UTF-8 válido no corte do detalhe`,
em `src/cli/certificacao-p02.test.ts`, fica vermelho na hora.

## P-01 — corte UTF-8-seguro de `suite_executada.detalhe`

| | |
|---|---|
| Upstream | AxisGov/sprintx PR #3, merge `a4ac7c61fae2477341f378136c556894587bb1d7` |
| Commits | `5533410c56d70a60f20fbe376918dbdbc8735a3c` (correção), `bb1378fb64bf9cd850a1a4cdca13e43c0edbecc5` (cobertura e terminologia) |
| Arquivos | `.claude/hooks/comum/rastro.sh`, `.claude/hooks/comum/rastro-post.sh` |

**Por que não re-fixar o snapshot no merge.** A base `253b592` **não está** em
`origin/main` da SprintX, e o merge `a4ac7c6` **não contém** `253b592`: os dois saem
do ancestral comum `bb00eda` e seguiram separados. Re-fixar em `a4ac7c6` traria a
correção e levaria embora tudo o que a base tem e a `main` ainda não — entre outras
coisas a normalização de caminho do Windows, o `git-perigoso` separado por skill
(que a certificação P0.2 exige em `sprintx/` e `mergex/`) e o endurecimento de custo
dos hooks. Não é uma atualização: é uma troca de linhagem. O caminho limpo é a
SprintX integrar `p0.2/sprintx-c7b` na `main`; aí o snapshot volta a ser um commit
só, e este item sai daqui.

**Por que o código não é idêntico ao de upstream.** O `rastro_corta_utf8` de upstream
nasceu contra a `main`, anterior ao endurecimento de custo, e gasta de 9 a 24
processos (`head`, `wc`, e `tail|head|od|tr` por byte inspecionado). O `rastro.sh`
desta base declara a regra oposta no próprio cabeçalho — «no Git Bash cada processo
novo custa de 0,5 a 2 s, e o que protege um hook crítico é não criar processo»
(DS-157) — e o `rastro-post.sh` está registrado com `timeout: 10`. A propagação
mantém o nome público `rastro_corta_utf8` e acrescenta `rastro_corta_utf8_em`, na
forma `*_em <var>` da base, com **zero** processo.
