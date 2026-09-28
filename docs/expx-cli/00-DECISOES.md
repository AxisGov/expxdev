---
expx_schema: 1
expx_tool: sprintx
kind: decisoes
trabalho_id: expx-cli
atualizado_em: 2026-09-27
decisoes:
  - id: D-01
    decisao: Renomear o pacote para @expx/cli com bin expx, mantendo tambem o bin expx-painel
    alternativa_descartada: Publicar um segundo pacote separado para o CLI
    motivo: O painel nunca foi publicado no npm (404), entao nao ha usuario a quebrar
    status: fechada
    bloqueante: false
  - id: D-02
    decisao: O plugin fica DENTRO da arvore do marketplace, em .expx/marketplace/plugins/expx/
    alternativa_descartada: marketplace/ e plugin/ como irmaos, como o prompt descreve
    motivo: source relativo que sobe de diretorio e rejeitado com source Invalid input
    status: fechada
    bloqueante: false
  - id: D-03
    decisao: O init instala chamando claude plugin marketplace add e claude plugin install
    alternativa_descartada: Apenas declarar extraKnownMarketplaces no settings.json do projeto
    motivo: Cinco sintaxes testadas no settings do projeto e nenhuma carregou o plugin
    status: fechada
    bloqueante: false
  - id: D-04
    decisao: O merge de settings.json le enabledPlugins como array ou objeto e escreve objeto
    alternativa_descartada: Seguir o array documentado na doc oficial
    motivo: O arquivo real que o Claude Code escreve usa objeto nome-arroba-marketplace para boolean
    status: fechada
    bloqueante: false
  - id: D-05
    decisao: O doctor verifica o efeito real da instalacao, nao so a sintaxe dos arquivos
    alternativa_descartada: Validar apenas o JSON de settings, plugin e marketplace
    motivo: O comportamento mudou na v2.1.195 e pode mudar de novo
    status: fechada
    bloqueante: false
  - id: D-06
    decisao: Busca das skills por git clone com profundidade rasa, usando o git do sistema
    alternativa_descartada: API REST do GitHub com token
    motivo: Usa a credencial ja configurada, atende repositorio privado e evita rate limit
    status: fechada
    bloqueante: false
  - id: D-07
    decisao: O que mudou vem do CHANGELOG quando existir e senao de git log entre as referencias
    alternativa_descartada: API de compare do GitHub
    motivo: Mantem tudo em git, testavel sem rede com repositorio de fixture local
    status: fechada
    bloqueante: false
  - id: D-08
    decisao: Com OpenCode escolhido as skills vao apenas para .claude/skills/ e nunca para .opencode/skills/
    alternativa_descartada: Copiar as skills para os dois diretorios
    motivo: O OpenCode le .claude/skills nativamente e duplicar causa colisao por last-writer-wins
    status: fechada
    bloqueante: false
  - id: D-09
    decisao: Deteccao de modificacao local por hash sha256 de cada arquivo gravado no lock
    alternativa_descartada: Hash unico da arvore ou comparacao por mtime
    motivo: So o hash por arquivo permite listar quais arquivos mudaram, como o prompt exige
    status: fechada
    bloqueante: false
  - id: D-10
    decisao: Rollback pelo versionador, sem guardar copia da versao anterior em .expx/
    alternativa_descartada: Guardar a versao anterior de cada skill dentro de .expx/
    motivo: Alternativa explicitamente aceita no prompt e o update e obrigado a dizer isso na saida
    status: fechada
    bloqueante: false
  - id: D-11
    decisao: Chave opcional expx_schema no frontmatter do SKILL.md, ausencia significa versao 1
    alternativa_descartada: Manifesto proprio por skill ou campo obrigatorio
    motivo: Nenhuma das cinco skills declara nada hoje e o CLI nao pode escrever skill
    status: fechada
    bloqueante: false
  - id: D-12
    decisao: Normalizador de layout que localiza SKILL.md e toma o diretorio dele como raiz da skill
    alternativa_descartada: Assumir caminho fixo por repositorio
    motivo: Os cinco repositorios tem dois layouts distintos, harness embutido e raiz plana
    status: fechada
    bloqueante: false
  - id: D-13
    decisao: Comandos do OpenCode sempre em .opencode/commands/ no plural
    alternativa_descartada: Espelhar a pasta do repositorio de origem, que varia entre singular e plural
    motivo: Apenas o plural e documentado e o sprintx usa singular enquanto stackx e mergex usam plural
    status: fechada
    bloqueante: false
  - id: D-14
    decisao: O CLI nao aplica os patches de integracao do legadox, apenas informa que existem
    alternativa_descartada: Aplicar os patches automaticamente quando mergex ou legadox forem marcados
    motivo: Os patches reescrevem a skill destino e o prompt proibe o CLI de escrever skill
    status: fechada
    bloqueante: false
  - id: D-15
    decisao: Framework de CLI escrito a mao, sem dependencia nova, seguindo o padrao de argumentos.ts
    alternativa_descartada: Adotar commander, yargs, clipanion ou prompts
    motivo: O projeto ja resolve argumentos a mao e a superficie de subcomando e pequena
    status: fechada
    bloqueante: false
  - id: D-16
    decisao: Escrita atomica montando em .expx/.tmp-<pid>/ e trocando por rename ao final
    alternativa_descartada: Escrever direto no destino final
    motivo: O prompt exige que .expx/ nunca fique inconsistente se falhar no meio
    status: fechada
    bloqueante: false
  - id: D-18
    decisao: O pacote publicado chama-se expxdev, com o binario expx
    alternativa_descartada: expx nao-escopado, e @expx-barra-cli
    motivo: O npm recusou expx por similaridade com expo e o escopo @expx nao existe no registry
    status: fechada
    bloqueante: false
  - id: D-17
    decisao: Todas as decisoes desta F2 foram tomadas pela IA a pedido explicito do usuario
    alternativa_descartada: Entrevistar o usuario em blocos de cinco perguntas, como a F2 manda
    motivo: O usuario instruiu rodar ate o fim sem perguntar nada e instrucao do usuario tem precedencia
    status: fechada
    bloqueante: false
  - id: D-19
    decisao: SessionStart nao aplica atualizacao automatica a instalacoes que contenham origem local (commit terminado em -local); o lock congelado vence a conveniencia de sincronizacao e atualizar essas instalacoes exige acao explicita
    alternativa_descartada: Deixar o expx update vindo de AxisGov main decidir, confiando que o comparador trata sha-local como nao comparavel por commit
    motivo: A decisao de congelar tem de ser do proprio projeto e versionada no ExpxDev, e nao depender de um executavel de main fora do freeze; e a decisao P0.2 D-03
    status: fechada
    bloqueante: false
  - id: D-20
    decisao: O lock trava a lista de executaveis em instalacao.executaveis e o doctor reprova executavel gerenciado registrado como 100644 no indice, entregando o git update-index --chmod=+x pronto sem nunca executa-lo
    alternativa_descartada: O init rodar git add e git update-index por conta propria, ou reescrever os settings para invocar os hooks por bash
    motivo: Produto com core.filemode=false recebe 0755 em disco e versiona 100644, e o clone seguinte materializa 0644 com hook morto em 126; preparar o indice de quem instala e mexer em trabalho alheio, e trocar a invocacao mudaria a execucao direta que a SprintX registra
    status: fechada
    bloqueante: false
  - id: D-21
    decisao: O portao de modo executavel so fica verde quando o HEAD contem 100755, e nao quando o indice contem; o aviso do init entrega comando apenas para o que esta rastreado como 100644; toda consulta ao git usa --literal-pathspecs e so aceita o estagio 0 do indice; a sonda de bit roda apenas quando ha candidato sem bit; consulta ao HEAD que falha vira aviso e nao erro
    alternativa_descartada: Conferir so o indice, entregar um comando unico com todos os pendentes, confiar no pathspec do git e tratar falha de consulta como ausencia de defeito
    motivo: O indice ficar 100755 sem commit deixava o doctor verde enquanto clone e worktree nasciam 0644; um comando que inclui caminho fora do indice falha atomicamente e ensina a ignorar o aviso; pathspec do git leria nome de arquivo como padrao e devolveria modo de outro arquivo; a sonda escreve na arvore de quem pediu o diagnostico; e tratar falha de git como ausencia de defeito esconderia verificacao inconclusiva
    status: fechada
    bloqueante: false
  - id: D-22
    decisao: Fora do .sh, o bit da origem so marca um artefato como executavel se o arquivo comecar com shebang
    alternativa_descartada: Confiar no bit da origem sozinho, como antes, ou apagar a regra do bit e deixar so a extensao .sh
    motivo: EXPX_SKILLS_LOCAIS copia com cpSync, que preserva o modo, e origem hospedada em DrvFs aparece 0777 — o 0777 virava modo real da copia e punha SKILL.md e json em instalacao.executaveis, com o doctor exigindo update-index --chmod=+x para a instalacao inteira como erro; o shebang e sinal de conteudo, que nenhum filesystem fabrica, e apagar a regra do bit tiraria o executavel legitimo sem .sh
    status: fechada
    bloqueante: false
---

# Decisões — expx-cli

> Uma linha por decisão tomada no planejamento. Formato fixo. Não apague decisões: uma decisão revertida ganha nova linha que cita a anterior.

**Aviso de método.** A F2 é a fase de entrevista e a skill proíbe decidir no lugar do usuário. O usuário instruiu explicitamente: *"roda tudo ate o final implementa sem me perguntar nada"*. Instrução direta do usuário tem precedência sobre a skill. Portanto **todas as decisões abaixo foram tomadas pela IA**, cada uma com o critério declarado. Nove das quinze lacunas da F1 foram eliminadas por **verificação empírica**, não por palpite — ver `base/09-validacao-marketplace-local.md` e `base/08-repositorios-reais.md`. As decisões restantes seguem o princípio de menor risco e de aderência ao que o repositório já faz.

## Decisões

```
D-01 | Renomear para @expx/cli com bin expx, mantendo o bin expx-painel | Publicar pacote separado só para o CLI | O painel nunca foi publicado no npm (404 no registry), então não há usuário instalado a quebrar; um pacote só, como o prompt pede
D-02 | O plugin fica DENTRO da árvore do marketplace: .expx/marketplace/plugins/expx/ | marketplace/ e plugin/ como irmãos, como promptcli1.md:73-77 descreve | Testado: source relativo que sobe de diretório é rejeitado com "source: Invalid input". A estrutura do prompt não funciona
D-03 | O init instala chamando `claude plugin marketplace add` + `claude plugin install` | Apenas declarar extraKnownMarketplaces no settings.json do projeto | Testado: cinco sintaxes no settings do projeto, todas PLUGIN_NAO. Declarar não instala
D-04 | O merge de settings.json lê enabledPlugins como array OU objeto, e escreve objeto | Seguir o array documentado na doc oficial | O arquivo real que o Claude Code escreve usa objeto {"nome@mkt": true}; escrever array corromperia o arquivo do usuário
D-05 | O doctor verifica o EFEITO da instalação, não só a sintaxe dos arquivos | Validar apenas o JSON de settings, plugin.json e marketplace.json | O comportamento mudou na v2.1.195 e pode mudar de novo; sintaxe válida não prova que a skill carregou
D-06 | Busca das skills por `git clone --depth`, usando o git do sistema | API REST do GitHub com token | Usa a credencial já configurada na máquina (o prompt exige), atende repositório privado e não tem rate limit
D-07 | "O que mudou" vem do CHANGELOG quando existir, senão de `git log` entre as referências | API de compare do GitHub | Mantém tudo em git, o que torna a camada testável sem rede com repositório de fixture local
D-08 | Com OpenCode escolhido, as skills vão APENAS para .claude/skills/ | Copiar as skills para .claude/skills/ e .opencode/skills/ | O OpenCode lê .claude/skills/ nativamente; duplicar causa colisão resolvida por last-writer-wins com só um warning
D-09 | Detecção de modificação local por hash SHA-256 de cada arquivo, gravado no lock | Hash único da árvore, ou comparação por mtime | Só o hash por arquivo permite LISTAR quais arquivos mudaram, que é o que promptcli2.md:32-33 exige
D-10 | Rollback pelo versionador, sem cópia da versão anterior em .expx/ | Guardar a versão anterior de cada skill dentro de .expx/ | Alternativa explicitamente aceita em promptcli2.md:70-73; em troca o update é OBRIGADO a dizer isso na saída
D-11 | Chave opcional `expx_schema` no frontmatter do SKILL.md; ausência = versão 1 | Manifesto próprio por skill, ou campo obrigatório | Nenhuma das cinco skills declara nada hoje e o CLI não pode escrever skill; ausência tem que ser válida
D-12 | Normalizador de layout: localiza SKILL.md e toma o diretório dele como raiz da skill | Assumir caminho fixo por repositório | Os cinco repositórios têm DOIS layouts: .claude/skills/<nome>/ e skill/ na raiz
D-13 | Comandos do OpenCode sempre em .opencode/commands/ (plural) | Espelhar a pasta de origem, que varia entre singular e plural | Só o plural é documentado; sprintx usa singular e stackx/mergex usam plural — normalizar evita projeto inconsistente
D-14 | O CLI NÃO aplica os patches de integração do legadox; apenas informa que existem | Aplicar os patches quando mergex/legadox forem marcados | Os patches são prompts que reescrevem a skill destino, e promptcli2.md:115 proíbe o CLI de escrever skill
D-15 | Framework de CLI escrito à mão, sem dependência nova | Adotar commander, yargs, clipanion ou prompts | promptcli2.md:124-125 manda escolher "a partir do que já existe no projeto", e o projeto resolve argumentos à mão em src/cli/argumentos.ts
D-16 | Escrita atômica: montar em .expx/.tmp-<pid>/ e trocar por rename ao final | Escrever direto no destino final | promptcli2.md:93-94 exige que .expx/ nunca fique inconsistente se falhar no meio
D-18 | O pacote publicado chama-se `expxdev`, com o binário `expx` | `expx` não-escopado, e `@expx/cli` | O npm recusou `expx` com 403 por similaridade com `expo`/`exit`/`cpx`, e o escopo `@expx` não existe no registry (404 em todo PUT). Revê o D-01: o nome do pacote mudou, o binário `expx` não
D-17 | Todas as decisões desta F2 foram tomadas pela IA, a pedido explícito do usuário | Entrevistar o usuário em blocos de 5 perguntas, como a F2 manda | O usuário instruiu "roda tudo ate o final implementa sem me perguntar nada"; instrução do usuário tem precedência sobre a skill
D-19 | SessionStart não aplica atualização automática a instalações que contenham origem local (`commit *-local`). O lock congelado vence a conveniência de sincronização. Atualização dessas instalações exige ação explícita | Deixar o `expx update` vindo de AxisGov/main decidir, confiando no comparador tratar `<sha>-local` como não comparável por commit | Decisão P0.2 D-03: congelar é decisão do próprio projeto, lida do lock antes de qualquer rede, e não de um executável de `main` fora do freeze. Regra em `docs/contrato/CONTRATO-expx-instalacao.md` §10
D-20 | O lock trava `instalacao.executaveis` e o `expx doctor` REPROVA executável gerenciado registrado como `100644` no índice, com o `git update-index --chmod=+x -- …` pronto na mensagem; o bit ausente no disco (onde a raiz do projeto prova preservar o bit POSIX) é reparado por `expx init` | O `init` preparar o índice (`git add`, `git update-index`) por conta própria, ou reescrever os settings para invocar os hooks por `bash <script>` | Com `core.filemode=false` o disco fica 0755 e o git versiona `100644`: o próximo clone/worktree materializa 0644 e o hook por execução direta morre com 126, com `doctor` verde. Preparar o índice de quem instala é mexer em trabalho alheio (um `git commit -a` levaria a mudança junto de um commit alheio), e trocar a invocação mudaria a execução direta que a SprintX registra
D-21 | O portão de modo executável só fica verde quando o **`HEAD`** contém `100755` (e não quando o índice contém); o aviso do `init` entrega comando só para o que já está rastreado como `100644`, e instrução para o resto; toda consulta ao git usa `--literal-pathspecs` e aceita só o estágio 0 do índice; a sonda do bit roda apenas quando há candidato sem bit; consulta ao `HEAD` que falha vira **aviso** | Conferir só o índice, entregar um comando único com todos os pendentes, confiar no pathspec do git, sondar sempre, e tratar falha de consulta como ausência de defeito | Índice `100755` sem commit deixava o `doctor` verde enquanto clone e `git worktree add` nasciam 0644 — falso verde que aparecia justamente para quem seguiu a instrução pela metade. `git update-index` é atômico: um caminho fora do índice derruba o comando inteiro, e comando que falha ensina a ignorar o aviso. O pathspec do git leria nome de arquivo como padrão (`x*.sh` casa `x.sh`; nome com `:` faz o git recusar a consulta). A sonda ESCREVE na árvore de quem pediu o diagnóstico. E tratar falha de git como ausência de defeito esconderia uma verificação inconclusiva: vira aviso, proporcional. Regras em `docs/contrato/CONTRATO-expx-instalacao.md` §11
D-22 | Fora do `.sh`, o bit da origem só marca um artefato como executável se o arquivo **começar com shebang** | Confiar no bit da origem sozinho, como antes; ou apagar a regra do bit e deixar só a extensão `.sh` | `EXPX_SKILLS_LOCAIS` não clona: copia com `cpSync`, que **preserva o modo**. Origem em DrvFs (`/mnt/c`) aparece 0777, e a cópia recebe 0777 de verdade — o número deixa de ser artefato de filesystem e passa a ser o modo real que o plano mede. Resultado medido: `SKILL.md`, `.md` e `.json` entravam em `instalacao.executaveis` e o `doctor` exigia `git update-index --chmod=+x` para a instalação **inteira**, como erro. O shebang é sinal de CONTEÚDO, que nenhum filesystem fabrica; apagar a regra do bit tiraria o executável legítimo sem `.sh`. Preço aceito: binário compilado deixa de ser marcado — nenhuma skill traz binário hoje. Regra em `docs/contrato/CONTRATO-expx-instalacao.md` §11
```

## Pendências

Nenhuma pendência bloqueante. As duas incertezas remanescentes (L-16, comportamento de plugin pode mudar de versão; L-17, nenhuma skill tem tag hoje) estão registradas em `base/00-LACUNAS.md` com mitigação decidida (D-05 e fixture sintética), e não travam o plano.
