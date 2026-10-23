# Changelog

## 0.11.1 — correções de segurança e Actions Node 24

- Atualiza Vite para 8.3.5, Vitest e `@vitest/mocker` para 4.1.12 e `source-map-js` para 1.2.2.
- Elimina as quatro vulnerabilidades reportadas pelo `npm audit`.
- Migra as Actions oficiais para versões com runtime Node.js 24, mantendo Node.js 20.19 como piso suportado pelo produto.
- Adiciona regressão que verifica todas as cópias das dependências auditadas no lockfile, inclusive instalações aninhadas.

## 0.11.0 — grafo operacional e sincronização final

- Incorpora o estado final publicado por Thulio em ExpxDev, BuildX e SprintX, preservando as extensões e a proveniência da linha AxisGov.
- Adiciona o comando `expx grafo` para gerar e exportar o grafo de dependências das tasks, com ordenação topológica, caminho crítico e diagnóstico de ciclos.
- Adiciona o grafo vivo ao painel, atualizado a partir do plano e do estado observados pelo servidor.
- Mantém como funcionalidade separada qualquer escolha de LLM: este grafo descreve dependências e execução do trabalho.

## 0.10.0 — linha AxisGov pós-otimização

- Consolida a otimização P1 e a proveniência canônica de RunX, MergeX, SprintX e BuildX.
- Separa a validação contínua da publicação: merges comuns em `main` não criam mais tags ou releases.
- Introduz release SemVer explícita, com validação de SHA, checks obrigatórios, versão, pacote e checksum determinístico.
- Mantém a distribuição exclusivamente em GitHub Releases; não publica no namespace público `expxdev` do npm.

## Histórico de distribuição

- `0.7.0` foi a versão interna histórica dos artefatos AxisGov publicados em GitHub Releases sob tags `cli-<sha7>`, inclusive `cli-54520c5`.
- `expxdev@0.9.0` no registro público npm pertence à distribuição anterior e não é um artefato da linha AxisGov.
- `0.10.0` inaugura a numeração da linha AxisGov após a otimização e a correção de proveniência.

As releases históricas não são apagadas, sobrescritas nem recriadas.
