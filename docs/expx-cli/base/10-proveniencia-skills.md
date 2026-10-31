# Proveniência das skills do catálogo

Esta é a fonte pública para origem, instalação e proteção de proveniência das
nove skills registradas no ExpxDev. O catálogo executável continua em
`src/nucleo/catalogo.ts`.

Cada versão do ExpxDev certifica um commit de cada skill, gravado no campo
`certificado` do catálogo. O `expx init` e o `expx update` instalam esse commit da
origem canônica; um merge na `main` de uma skill só chega aos projetos pela
próxima release do ExpxDev. `--to <ref>` sai do certificado de propósito, uma
skill por vez. O portão da release confere que cada certificado é ancestral da
`main` da skill, e `catalogo.test.ts` confere esta tabela contra o catálogo.

Commits certificados (confirmados na organização AxisGov em 2026-10-30, depois de AxisGov/sprintx#58 e AxisGov/mergex#61):

| Repositório | Commit certificado |
|---|---|
| `AxisGov/runx` | `5de15a9d48ca3aa30be433201103cd1a23e6474b` |
| `AxisGov/legadox` | `4b92ec47da1d075224f74aa8c3fc928fdb72230d` |
| `AxisGov/stackx` | `79200ec5761f26adef1f9b3cf66ec039f031e163` |
| `AxisGov/mergex` | `72093979da6d0d9745888afe084c8d2974f8a7f8` |
| `AxisGov/sprintx` | `d80c96ff097c77e7cc4953b182f85bd0e7ff8f6b` |
| `AxisGov/MemoX` | `897408f6bf60d0c9f4c0ed6b5cb12d6db8e8cdd4` |
| `AxisGov/prodx` | `06ce57a42db8eaae3f98ea60fc3895f1536383c5` |
| `AxisGov/buildx` | `caf4fbe9dfac60a0ae8f34d7a36e9eb779c3cb0b` |
| `AxisGov/designx` | `389a42897dff438152b06d8054d00c9490c46c87` |

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
