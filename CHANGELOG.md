# Changelog

## Próxima versão — histórico de modelo e esforço

- Faz o gravador comum registrar `model` e `effort` em cada evento que emite, com prioridade para metadados explícitos do runtime e fallback para o agente instalado somente no contexto Claude.
- Mantém eventos sem snapshot válidos; a configuração atual só vira fallback quando o evento não identifica outro harness, e nos demais casos o painel informa que o histórico está indisponível.
- Aceita identificadores de modelos de qualquer provedor, preparando o rastro para a futura orquestração multimodelo sem acoplá-lo à seleção.
- Coloca entre aspas o caminho dos hooks registrados por nome de arquivo (os do MemoX), que quebravam com espaço em `$CLAUDE_PROJECT_DIR`; a reinstalação substitui a forma antiga sem duplicá-la, mesmo com lock anterior ao registro das entradas gerenciadas.
- Certifica a SprintX em AxisGov/sprintx@1941c5a: os escritores próprios passam a gravar `model` e `effort` do executor, sem atribuir o modelo do principal a outro agente, e a bancada instalada pelo marketplace deixa de abortar e de derivar caminhos da fonte a partir dos hooks.
- Mantém aceito o grupo vazio `()` em `merge_automatico.caminhos_protegidos`: a validação só recusa o que o Git Bash recusa. A recusa anunciada junto da 0.12.1 não faz parte do contrato.

## 0.12.1 — correções de revisão e fontes oficiais consolidadas

- Corrige o portão de revisão para aceitar somente evidências planas de tasks válidas e impede que JSONs aninhados forjem rejeições.
- Faz a revisão automatizada ler um snapshot Git imutável e preserva travas pertencentes a processos ainda vivos.
- Incorpora as correções técnicas revisadas nos forks AxisGov e torna MemoX e ProdX origens canônicas, mantendo as origens anteriores apenas para migração de locks.
- Atualiza os candidatos certificados de SprintX e MergeX e valida a instalação conjunta das nove skills com treze agentes sem colisões.
- Mantém fora desta correção o histórico de modelo e esforço em múltiplos harnesses, tratado separadamente no PR #83.

## 0.12.0 — rastro e configuração de agentes no painel

- Projeta no detalhe do trabalho a linha do tempo do contrato `expx-eventos`, reutilizando o leitor do terminal.
- Anota o grafo vivo com o agente observado e a configuração atual de modelo/esforço instalada pelo `init`.
- Mantém plano, eventos e agentes como fontes de verdade externas ao painel: nenhuma decisão de execução é duplicada.
- Corrige no README a documentação da seleção interativa já implementada.

## 0.11.1 — segurança, Actions Node 24 e instalação completa

- Atualiza Vite para 8.3.5, Vitest e `@vitest/mocker` para 4.1.12 e `source-map-js` para 1.2.2.
- Elimina as quatro vulnerabilidades reportadas pelo `npm audit`.
- Migra as Actions oficiais para versões com runtime Node.js 24, mantendo Node.js 20.19 como piso suportado pelo produto.
- Adiciona regressão que verifica todas as cópias das dependências auditadas no lockfile, inclusive instalações aninhadas.
- Elimina as colisões de agentes entre SprintX/RunX e LegadoX/StackX com identidades exclusivas por skill, preservando prompts, responsabilidades e permissões.
- Permite instalar simultaneamente as nove skills oficiais e valida os treze agentes resultantes em teste de integração.
- Torna LegadoX, StackX e DesignX canônicos nos forks AxisGov, mantendo os repositórios anteriores somente como origens legadas migráveis.

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
