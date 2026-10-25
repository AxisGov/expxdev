# Changelog

## Próxima versão — dependência de execução corrigida e orquestração no Claude

- Atualiza o `zod` para 4.6.7 e o intervalo direto para `^4.6.7`, fechando a GHSA-mrhx-c7xc-m3w5 (alta, `zod < 4.6.6`): validar coleções restritas muito grandes podia esgotar a memória. O `zod` é dependência de execução e ia no pacote publicado.
- Estende a regressão de dependências auditadas ao `zod`, verificando todas as cópias do lockfile e o intervalo direto.
- Publica o contrato `expx-orquestracao` v1 (`docs/contrato/CONTRATO-expx-orquestracao.md`): classes canônicas, o arquivo opcional `.expx/orquestracao.json`, a tabela embutida e a matriz de esforço do Claude, a precedência que nunca rebaixa a classe, a função de resolução e o formato do registro e do lock.
- Implementa a leitura e a validação da política e o resolvedor puro, com testes de propriedade sobre o domínio inteiro.
- Aplica a política no adaptador Claude quando `.expx/orquestracao.json` existe: o `init` resolve cada agente e grava o frontmatter com a alternativa, grava cada resolução no registro imutável `.expx/resolucoes/` e o id vigente na seção nova `orquestracao` do lock (`lock_version` continua 2). O `.expx/agentes.json` v1 é aplicado depois, marcado como exceção. Política inválida, classe inválida ou agente sem resolução falham antes de escrever.
- O `doctor` ganha os achados `orquestracao-*`: política inválida, registro ausente ou adulterado (erros); seção sem política, classe inferida, v1 abaixo da classe, variáveis que sobrepõem o frontmatter e `fallbackModel` fora das cadeias (avisos).
- Sem `.expx/orquestracao.json`, nada muda: agentes e lock saem byte a byte iguais. Rastro, painel e hooks de invocação seguem inalterados até as próximas fases.
- Grava o registro de resoluções com temporário `O_EXCL`/`O_NOFOLLOW` publicado por `link`: o registro nunca é sobrescrito nem seguido, inclusive quando outro escritor publica no meio (o `rename` anterior sobrescrevia), e a troca de `.expx` ou `.expx/resolucoes`, por link ou por outro diretório, que persista até a revalidação aborta antes do lock. O limite do Node (sem `openat`) fica declarado no contrato.
- Traz para o núcleo as correções P1 que o Login aplicou na cópia instalada e que nunca chegaram à distribuição: o revisor mata a CLI que não responde em 15 minutos e falha fechado (`indisponivel:tempo-esgotado`), trata como aberto o achado sem vínculo a uma linha de arquivo da task (antes era dado por anterior e ignorado) e encerra os vereditos por `process.exitCode`, sem cortar o stdout assíncrono; o lembrete aceita a base confiável do estado atrás de um link (o scratchpad sob diretório-link) sem liberar link dentro dela; e o fallback em bash do lembrete normaliza maiúscula acentuada também em `LC_ALL=C`.

## 0.12.2 — histórico de modelo e esforço e correções de instalação

- Faz o gravador comum registrar `model` e `effort` em cada evento que emite, com prioridade para metadados explícitos do runtime e fallback para o agente instalado somente no contexto Claude.
- Mantém eventos sem snapshot válidos; a configuração atual só vira fallback quando o evento não identifica outro harness, e nos demais casos o painel informa que o histórico está indisponível.
- Aceita identificadores de modelos de qualquer provedor, preparando o rastro para a futura orquestração multimodelo sem acoplá-lo à seleção.
- Coloca entre aspas o caminho dos hooks registrados por nome de arquivo (os do MemoX), que quebravam com espaço em `$CLAUDE_PROJECT_DIR`; a reinstalação substitui a forma antiga sem duplicá-la, mesmo com lock anterior ao registro das entradas gerenciadas.
- Certifica a SprintX em AxisGov/sprintx@9a742f4: os escritores próprios passam a gravar `model` e `effort` do executor, sem atribuir o modelo do principal a outro agente; a bancada instalada pelo marketplace deixa de abortar e de derivar caminhos da fonte a partir dos hooks e passa a rodar no Git Bash sem symlink e com `jq.exe`; e as tasks aceitam campos de extensão declarados por camada instalada e ativa (hoje `design_refs` e `tom_estetico`, da DesignX).
- Mantém aceito o grupo vazio `()` em `merge_automatico.caminhos_protegidos`: a validação só recusa o que o Git Bash recusa. A recusa anunciada junto da 0.12.1 não faz parte do contrato.
- Faz `--arquivos` da revisão recusar caminho absoluto, componente `..` e diretório-link, para que a lista não alcance arquivos fora da raiz do projeto.
- Instala a ponte de hooks da RunX em `.opencode/plugins/` quando o `init` recebe `claude` e `opencode`; só com `opencode`, a ponte não é instalada (ela despacha pela árvore `.claude/hooks/`) e o `init` avisa como obtê-la. O MimoCode não é harness do expx: os harnesses válidos são `claude`, `opencode` e `codex`.
- Traz, pela reinstalação a partir da `main` dos forks AxisGov, as correções das origens: RunX (escopo por igualdade, listas com aspas, `trabalho_id` seguro, suíte de estado no marketplace, marco e handoff sem gravação parcial, campos de extensão de task), MemoX (redação de credenciais), DesignX (hex e foco válidos e JSONL bem formado), LegadoX (caminho sem `jq`) e StackX (conflito sem `.git` e busca de segredo no arquivo inteiro).

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
