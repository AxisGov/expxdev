# Proveniência das skills do catálogo

Esta é a fonte pública para origem, instalação e proteção de proveniência das
nove skills registradas no ExpxDev. O catálogo executável continua em
`src/nucleo/catalogo.ts`.

Os repositórios abaixo foram confirmados na organização AxisGov em 2026-10-23:

| Repositório | `origin/main` confirmado |
|---|---|
| `AxisGov/expxdev` | `09a242635910918bd5f284b20dca330aa0dde13c` |
| `AxisGov/runx` | `2673c26cb98681032d5e12c72c57826816dda404` |
| `AxisGov/legadox` | `b185ef751e65d5f59d439528988344c52fe47b17` |
| `AxisGov/stackx` | `1243537f2991e7097074889e2953ebc85ba726f4` |
| `AxisGov/mergex` | `66dd6ace235287c1d094c3c77d25366ec4776635` |
| `AxisGov/sprintx` | `3b45027335e3fc06cb6d354a704fbedf18f2ffdc` |
| `AxisGov/MemoX` | `75f11897e7ac1a9123c5b1495b8e396122a85c4b` |
| `AxisGov/prodx` | `7539db41013585d31b79ef21afd07268bd99d0c1` |
| `AxisGov/buildx` | `b7dc7b6906904b3bf7184431518608a11422bd54` |
| `AxisGov/designx` | `1d0414a39b0f92138c595223d84a59d6da00a657` |

## Catálogo completo

| ID da skill | Nome | Repositório padrão atual | Repositório canônico pretendido | Origem legada | Caminho de instalação | Lock/manifesto produzido | Documentação pública | Teste que protege a origem |
|---|---|---|---|---|---|---|---|---|
| `sprintx` | SprintX | `https://github.com/AxisGov/sprintx` | `AxisGov/sprintx` | `https://github.com/bittencourtthulio/sprintx` | padrão `sprintx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/sprintx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts`, `proveniencia.test.ts`, `pacote.test.ts` e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/SprintX |
| `runx` | RunX | `https://github.com/AxisGov/runx` | `AxisGov/runx` | `https://github.com/bittencourtthulio/runx` | padrão `runx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/runx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | os quatro testes ExpxDev acima e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/RunX |
| `legadox` | LegadoX | `https://github.com/AxisGov/legadox` | `AxisGov/legadox` | `https://github.com/bittencourtthulio/legadox` | padrão `legadox` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/legadox#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `stackx` | StackX | `https://github.com/AxisGov/stackx` | `AxisGov/stackx` | `https://github.com/bittencourtthulio/stackx` | padrão `stackx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/stackx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `mergex` | MergeX | `https://github.com/AxisGov/mergex` | `AxisGov/mergex` | `https://github.com/bittencourtthulio/mergex` | padrão `mergex` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/mergex#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | os quatro testes ExpxDev acima e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/MergeX |
| `memox` | MemoX | `https://github.com/AxisGov/MemoX` | `AxisGov/MemoX` | `https://github.com/bittencourtthulio/MemoX` | padrão `memox` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/MemoX#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `prodx` | ProdX | `https://github.com/AxisGov/prodx` | `AxisGov/prodx` | `https://github.com/bittencourtthulio/prodx` | padrão `prodx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/prodx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `buildx` | BuildX | `https://github.com/AxisGov/buildx` | `AxisGov/buildx` | `https://github.com/bittencourtthulio/buildx` | padrão `buildx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/buildx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | os quatro testes ExpxDev acima e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/BuildX |
| `designx` | DesignX | `https://github.com/AxisGov/designx` | `AxisGov/designx` | `https://github.com/bittencourtthulio/designx` | padrão `designx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/designx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |

## Caminhos e registros padrão

Para qualquer skill `<id>`, o `init` materializa:

- `.expx/marketplace/plugins/expx/skills/<id>/`, dentro do plugin local;
- `.claude/skills/<id>/`, quando o harness Claude é selecionado;
- comandos normalizados em `.claude/commands/` e/ou `.opencode/commands/`,
  conforme os harnesses escolhidos.

A origem resolvida fica em
`.expx/expx-lock.json -> skills.<id>.repositorio`. O marketplace produz
`.expx/marketplace/.claude-plugin/marketplace.json` e o plugin produz
`.expx/marketplace/plugins/expx/.claude-plugin/plugin.json`.

## Regras de migração

- As nove skills resolvem a origem gerenciada para AxisGov, inclusive quando
  um lock antigo termina em `.git`.
- `update --check` apenas informa; `update --yes` migra somente o campo
  `repositorio` e preserva referência, commit, data, hashes, harness e
  configuração instalada.
- Uma segunda migração não reescreve o lock.
- Uma origem customizada que não seja uma origem legada conhecida permanece
  intacta.
- As origens anteriores existem no código somente em `origensLegadas` e nos
  testes de migração. Documentos antigos que as citam são marcados
  explicitamente como históricos.

## Distribuição do ExpxDev

Os metadados do pacote apontam para `AxisGov/expxdev`. A distribuição
certificada deste repositório é o artefato produzido por `npm pack` e
publicado em GitHub Releases por acionamento manual e versão SemVer explícita.

- `0.7.0` foi a versão interna histórica dos pacotes AxisGov publicados sob
  tags `cli-<sha7>`; essas releases permanecem imutáveis.
- O pacote `expxdev@0.9.0` observado no registro público npm pertence a uma
  linha de publicação anterior e não é tratado como artefato canônico AxisGov.
- `0.10.0` inicia a linha AxisGov pós-otimização e correção de proveniência.

Um push ou merge comum em `main` executa testes e build, mas nunca cria tag ou
release. A publicação exige o workflow `Release CLI`, um SHA completo já verde
na `main` e a versão exata presente em `package.json` e `package-lock.json`.
