# Proveniência das skills do catálogo

Esta é a fonte pública para origem, instalação e proteção de proveniência das
nove skills registradas no ExpxDev. O catálogo executável continua em
`src/nucleo/catalogo.ts`.

Os repositórios abaixo foram confirmados na organização AxisGov em 2026-10-22:

| Repositório | `origin/main` confirmado |
|---|---|
| `AxisGov/expxdev` | `0aab93ed1081a30ab7e3dfd9967549e13400c987` |
| `AxisGov/runx` | `b3edbf1e68af81852e183678c4a634b9f2a043d7` |
| `AxisGov/legadox` | `8d33c0c303f531e2c70dbbd32a40bad83e329b9b` |
| `AxisGov/stackx` | `7379a5ee575c11b09d601048958934684bbe80b0` |
| `AxisGov/mergex` | `4c10a0d79e930e8c569023ca44daede573ebd425` |
| `AxisGov/sprintx` | `7fc8a3f854edf6be1445405d1ff6dbc7deb08f09` |
| `AxisGov/buildx` | `b7dc7b6906904b3bf7184431518608a11422bd54` |
| `AxisGov/designx` | `a0473ed769cd20dd298ceb581e428579f1781eab` |

## Catálogo completo

| ID da skill | Nome | Repositório padrão atual | Repositório canônico pretendido | Origem legada | Caminho de instalação | Lock/manifesto produzido | Documentação pública | Teste que protege a origem |
|---|---|---|---|---|---|---|---|---|
| `sprintx` | SprintX | `https://github.com/AxisGov/sprintx` | `AxisGov/sprintx` | `https://github.com/bittencourtthulio/sprintx` | padrão `sprintx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/sprintx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts`, `proveniencia.test.ts`, `pacote.test.ts` e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/SprintX |
| `runx` | RunX | `https://github.com/AxisGov/runx` | `AxisGov/runx` | `https://github.com/bittencourtthulio/runx` | padrão `runx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/runx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | os quatro testes ExpxDev acima e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/RunX |
| `legadox` | LegadoX | `https://github.com/AxisGov/legadox` | `AxisGov/legadox` | `https://github.com/bittencourtthulio/legadox` | padrão `legadox` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/legadox#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `stackx` | StackX | `https://github.com/AxisGov/stackx` | `AxisGov/stackx` | `https://github.com/bittencourtthulio/stackx` | padrão `stackx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/stackx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts`, `proveniencia-skills.test.ts` e `proveniencia.test.ts` no ExpxDev |
| `mergex` | MergeX | `https://github.com/AxisGov/mergex` | `AxisGov/mergex` | `https://github.com/bittencourtthulio/mergex` | padrão `mergex` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README](https://github.com/AxisGov/mergex#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | os quatro testes ExpxDev acima e guards `scripts/ci/test-proveniencia.sh` no ExpxDev/MergeX |
| `memox` | MemoX | `https://github.com/bittencourtthulio/MemoX` | propriedade ainda não decidida | não classificada enquanto não houver decisão de propriedade | padrão `memox` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README da origem observada](https://github.com/bittencourtthulio/MemoX#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts` protege a origem observada; decisão de propriedade pendente |
| `prodx` | ProdX | `https://github.com/bittencourtthulio/prodx` | propriedade ainda não decidida | não classificada enquanto não houver decisão de propriedade | padrão `prodx` detalhado abaixo | lock/manifestos padrão detalhados abaixo | [README da origem observada](https://github.com/bittencourtthulio/prodx#readme) e [catálogo público](https://github.com/AxisGov/expxdev/blob/main/docs/expx-cli/base/04-skills-do-ecossistema.md) | `catalogo.test.ts` protege a origem observada; decisão de propriedade pendente |
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

- As sete skills com fork AxisGov — SprintX, RunX, LegadoX, StackX, MergeX,
  BuildX e DesignX — resolvem a origem gerenciada para AxisGov, inclusive quando um lock antigo termina em `.git`.
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
