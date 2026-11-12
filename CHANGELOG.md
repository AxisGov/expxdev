## 0.13.25 — a 1ª prova real da revisão por task, no Login

Instale por PR, como a 0.13.24. Muda o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`), a runx (AxisGov/runx#22, merge 29e6813, DR-113) e a sprintx (AxisGov/sprintx#75, merge b9d411f, DS-215). Os eventos, o `init`, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.24. Os relatos são da `implementa-login`, na frente ui-react-046 (CodeAnt CLI 0.5.14, `se_disponivel`).

- **O arquivo declarado e não alterado não dá mais `incompleta:faltante`.** O arquivo de `arquivos.cria`/`altera` que a task não tocou ia ao `--include`, e a CLI, que só revisa o que mudou, não o devolvia. Agora o revisável igual ao da partida (o `HEAD`, ou a base com `--base-commit`) fica `revisao: "sem-alteracao"`, fora de L1, L2, do `--include` e da reconciliação. O `conferir` refaz a igualdade contra o `base_commit` ou o `head`, que tem de ser commit.
- **Não se revisa de novo depois de um `rejeitar` que sai `ok`.** A CLI varia entre chamadas e redescrevia o mesmo ponto com outra identidade, o que reabria o achado. A F6, o passo 8 do 03-fix e o contrato dizem que a revisão da task está feita e que só se revisa de novo se um arquivo da task mudou depois.
- **O "lock não atualizado" é falso positivo conhecido.** O `package-lock.json` não vai à CLI, e ela acusa o lock sempre que o `package.json` muda. A rota é `revisao_contestada` com duas provas: o diff do lock com a mesma mudança do `package.json` e a instalação congelada (`npm ci` e equivalentes) passando. Sem elas, o achado é real (revisão do runx#22, do sprintx#75 e do expxdev#161). O texto da runx e da sprintx ganha a instalação congelada na 0.13.26.
- **Não exercitado:** a CLI real com o `sem-alteracao` (a suíte usa a CLI falsa).

# Changelog

## 0.14.3 — o ambiente do Codex e o arquivo que muda durante a revisão

Instale por PR, como a 0.14.2. Muda o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`), a runx (AxisGov/runx#27, merge 575677f, DR-120) e a sprintx (AxisGov/sprintx#80, merge 9e4de6d, DS-222). O `init` passa a instalar esses dois commits. Os eventos, o `doctor`, o painel e o `expx sessao` seguem como na 0.14.2. Os achados são da CodeAnt no katosmv/login#83 (instalação da 0.14.2), do CodeRabbit no runx#27 e da revisão do Codex.

- **O Codex não herda o que injeta código** (CodeAnt no katosmv/login#83, segurança). A lista da 0.14.1 esquecia o `LD_LIBRARY_PATH` e os primos do macOS, que carregam biblioteca de uma pasta controlada sem mudar o hash do executável gravado. Agora o Codex não herda:
  - nenhuma variável `LD_*`, `DYLD_*` ou `GIT_*`, bloqueadas por prefixo;
  - `CORECLR_PROFILER*` e `LUA_INIT*`, também por prefixo;
  - os injetores conhecidos de Node, Python, Perl, Ruby, Java e .NET (`NODE_OPTIONS`, `PYTHONPATH`, `PYTHONHOME`, `PERL5OPT`, `RUBYOPT`, `JAVA_TOOL_OPTIONS`, `DOTNET_STARTUP_HOOKS` e afins), mais `GCONV_PATH`, `BASH_ENV` e `ENV`. A configuração legítima desses runtimes (`JAVA_HOME`, `PYTHONIOENCODING`) passa.

  Isso vale também para os comandos que ele roda no sandbox. O resto do ambiente passa (proxy, certificado, `CODEX_*`). É bloqueio, não lista de permissão, para não quebrar o Codex num ambiente que a lista não previsse. A lista é defesa a mais, não fronteira: quem controla o ambiente também põe um `codex` falso no `PATH`, limite que o contrato já declara.
- **O arquivo que muda durante a revisão** (CodeRabbit no runx#27, anterior a esta versão). Na runx e na sprintx, o `arquivo-mudou-durante-revisao` deixa de ser tratado como indisponibilidade: o agente roda de novo o subconjunto afetado, confere o critério de aceite e roda o `revisar` de novo, inclusive depois de uma saída 1. Se mudar outra vez, ele para e diz. Antes, em `se_disponivel`, a task fechava com aviso, usando os testes de antes da mudança.
- **Textos:** `git worktree repair "<novo caminho>"` ganhou aspas, e a abertura da saída 2 cobre o `arquivo-mudou-durante-revisao`.

## 0.14.2 — a identidade dos achados do Codex

Instale por PR, como a 0.14.1. Muda só o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`). A runx, a sprintx, os eventos, o `init`, o `doctor`, o painel e o `expx sessao` seguem como na 0.14.1. O achado é da CodeAnt no katosmv/login#81 (instalação da 0.14.0).

- **Dois defeitos do Codex na mesma linha, com mensagens diferentes, deixam de colidir.** Toda issue do Codex tem o `label` `codex`, e a identidade não levava a mensagem. Com isso, dois defeitos diferentes na mesma linha tinham a mesma identidade, e um `rejeitar` calava os dois. No formato 2 do revisor, o sha256 da mensagem entra na identidade. O custo aceito: se o Codex redescreve o mesmo ponto com outro texto numa nova revisão, o achado rejeitado reabre, e isso falha fechado. Com a mesma mensagem, ainda colidem. A CodeAnt não muda: a parte extra nunca vem da issue crua. A evidência de formato 1 (da 0.14.1; a da 0.14.0 já é recusada pela falta do `executavel`) continua conferida pela regra dela.

## 0.14.1 — a falha de segurança da escala e a derivacao 3

Instale por PR, como a 0.14.0, e o quanto antes onde a 0.14.0 está instalada. Muda o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`), a runx (AxisGov/runx#26, merge d48f7db, DR-119) e a sprintx (AxisGov/sprintx#79, merge eaee574, DS-221). O `init` passa a instalar esses dois commits. Os eventos, o `doctor`, o painel e o `expx sessao` seguem como na 0.14.0. Os achados são da CodeAnt no conselhos-municipais#315 (instalação da 0.14.0) e #312 (instalação da 0.13.27), e da revisão do Codex.

- **Sai o gancho de teste que trocava o Codex** (conselhos#315, segurança). Na 0.14.0, a `EXPX_REVISAO_TESTE_CODEX` valia também no núcleo instalado: quem a definisse trocava o Codex por qualquer script, e a evidência passava no `conferir`.
  - **Como é agora:** o núcleo acha o `codex` no `PATH`, roda e mede o mesmo arquivo. A evidência v3 grava `revisor.executavel` (o caminho real e o sha256), que o `conferir` exige.
  - **O que o Codex achou na revisão:** o Codex roda sem `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD` e afins, que injetariam código sem mudar o arquivo medido. O script de `node` do npm roda pelo `node` do próprio núcleo, e o executável é medido de novo depois de rodar.
  - **Limite declarado:** um `codex` falso posto antes no `PATH` revisa como o verdadeiro. O caminho e o hash dele aparecem no PR.
  - **A evidência de escala da 0.14.0 é recusada** (`evidencia-invalida:revisor`): ela não tem `executavel` e pode ter vindo do gancho. A task revisada por escala na 0.14.0 e ainda não integrada se revisa de novo. A evidência da CodeAnt (v2) não muda.
- **`derivacao: 3`.** Na CodeAnt, a issue num arquivo fora da task não é lida e fica `aberto`, como a da linha além do fim do arquivo; no Codex, a issue fora da task já invalida a resposta (`codex-saida-invalida`, desde a 0.14.0), e a linha além do fim também fica `aberto`. Antes, uma resposta apontando para `../../dev/zero` travava a revisão, e a linha além do fim virava `anterior`. As evidências com `derivacao` 1 ou 2 continuam conferidas pela regra delas. A identidade de um achado fora da task pode mudar, porque as linhas vizinhas dele não são mais lidas, e a rejeição antiga dele então não casa; esses achados nunca deixaram de ser `aberto`.
- **A releitura depois da revisão** cobre todo arquivo presente da task, não só os enviados (conselhos#312). Antes, o `sem-alteracao` que mudasse durante a chamada só era pego no `conferir`.
- **Na runx e na sprintx, só texto:** a escala dá "saída 0 ou 1" (não 3), e `git worktree remove "<caminho>"` ganhou aspas.
- **Não exercitado:** o Windows com o Codex de verdade (a CI do Windows roda o falso como `codex.cmd`).

## 0.14.0 — a escala da CodeAnt para o Codex

Instale por PR, como a 0.13.27. Muda o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`, agora v3), a runx (AxisGov/runx#25, merge e52769e, DR-117 e DR-118) e a sprintx (AxisGov/sprintx#78, merge 2ad1587, DS-220). O `init` passa a instalar esses dois commits. Os eventos, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.27. É versão menor nova porque a evidência ganha a v3: um núcleo 0.13.x a recusa (`evidencia-invalida:versao`), e o núcleo e as skills se atualizam juntos, como sempre pelo `init`.

- **A revisão por task escala para o Codex.** O pedido veio da orquestra_conselho, depois de horas de 403 da CodeAnt em 2026-11-10: com `obrigatoria`, a V12 travava; com `se_disponivel`, a task sem evidência também passava como aviso. A decisão do Flávio foi "não é parâmetro, é escala".
  - **Quando escala:** com a CodeAnt fora (ausente, sem acesso, com erro, fora do prazo, versão não homologada ou pacote que não confere), o próprio `revisar` revisa com o Codex sobre o mesmo snapshot.
  - **Como o Codex é chamado:** o `codex` do `PATH`, só leitura, sem a configuração do usuário, com modelo fixo, pedido fixo e schema, numa tentativa só de até 15 minutos.
  - **A evidência:** é a v3, com a escala, o revisor, os campos da resposta na forma do schema e o hash do texto que o Codex devolveu. O `conferir` refaz o pedido e deriva os achados das `issues` do Codex. A severidade não decide: todo achado em linha alterada conta, como na CodeAnt.
  - **Com a CodeAnt funcionando:** nada muda, e a evidência continua v2.
  - **Com os dois fora:** `indisponivel:<CodeAnt>+codex-<motivo>`, FALHA em `obrigatoria` e AVISO em `se_disponivel`.
  - **O que não escala:** erro de quem chama, snapshot e cobertura parcial.
- **O que o consumidor precisa:** para a escala funcionar, o `codex` instalado e com login feito pelo desenvolvedor. O agente nunca roda `codex login`. Sem ele, a saída é `<motivo da CodeAnt>+codex-ausente` ou `+codex-sem-login`, com a mesma rota de antes.
- **A corrida do `rejeitar`** (CodeAnt no katosmv/login#79): a trava só protegia a evidência. Agora o `rejeitar` confere os blobs de novo depois de gravar e desfaz a gravação se um arquivo da task mudou no meio.
- **A runx e a sprintx:** a saída 2 passa a ser "nem a CodeAnt nem o Codex revisaram" com o núcleo 0.14.0. O agente nunca chama o Codex.
- **A base informada na runx** (DR-118; CodeAnt no conselhos-municipais#312): a runx não aceita base informada. O pedido que nomeia outra base, ou uma base que não existe, para e diz, sem trocar a base em silêncio.
- **Não exercitado:**
  - o shim `codex.cmd` do npm no Windows (o teste só roda no Windows, na CI);
  - o fluxo inteiro de uma task com a escala, executado pelo modelo.

  A escala com o `codex` real foi provada uma vez, num repositório de teste sem a CodeAnt: o Codex achou o defeito plantado, e o `conferir` reprovou a task.

## 0.13.27 — os achados da instalação da 0.13.26 no Login

Instale por PR, como a 0.13.26. Muda o núcleo (`expx-revisao.mjs` e o contrato `expx-revisao`), a runx (AxisGov/runx#24, merge f8cdc2c, DR-116) e a sprintx (AxisGov/sprintx#77, merge 5921cc4, DS-219). O `init` passa a instalar esses dois commits. Os eventos, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.26. Os achados são da CodeAnt no katosmv/login#78, confirmados no código.

- **O `rejeitar` recusa a evidência desatualizada.** Se um arquivo da task mudava entre o `revisar` e o `rejeitar`, o `rejeitar` gravava `ok` sobre o blob antigo, e só o `conferir` do commit reprovava (`evidencia-nao-bate`). Agora ele sai 1, sem gravar nada (`evidencia desatualizada: <arquivo>`), quando o `hash-object` do checkout difere do blob gravado ou quando o arquivo dado por removido existe de novo, inclusive como link quebrado. A regra da F6 e do passo 8 do 03-fix passa a ser revisar de novo se um arquivo mudou depois do último `revisar`.
- **O caminho real da worktree.** O `expx-worktree-isolada.sh` só reconhece a worktree do agente na branch inicial. Ao retomar a F1 ou o E1 nela, já na branch do trabalho, a sprintx e a runx gravavam `../<repo>--<slug>`. Agora gravam o caminho real do worktree em que a branch está, como o `git worktree list --porcelain` o lista.
- **Não exercitado:** a retomada real de um subagente isolado (os testes são de conteúdo).

## 0.13.26 — código movido, o subagente isolado e os achados do Login na 0.13.24

Instale por PR, como a 0.13.25. Muda o núcleo (`expx-revisao.mjs`, o novo `expx-worktree-isolada.sh` e os contratos `expx-revisao` e `expx-orquestracao`), a runx (AxisGov/runx#23, merge 473db26, DR-114 e DR-115) e a sprintx (AxisGov/sprintx#76, merge 0c3c8ef, DS-216 a DS-218). O `init` passa a instalar esses dois commits da runx e da sprintx. Os eventos, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.25.

- **Código só movido não é linha alterada (`derivacao: 2`).** No Login (ui-react-046), um teste dividido em dois arquivos fez o achado sobre código antigo ficar `aberto`. Agora o trecho que a task só moveu, igual byte a byte e com linha substantiva, não conta como alterado, e o achado nele vira `anterior`. O diff é por blob, da partida ao commit, com algoritmo fixo, teto de 1.000.000 de linhas reunidas e teto de 5.000.000 de comparações (passou de um deles, nenhum crédito). A evidência grava `derivacao: 2`, e a evidência sem o campo continua conferida pela regra de antes.
- **A runx e a sprintx rodam como subagente com `isolation: "worktree"` do Claude Code.** O `expx-worktree-isolada.sh` reconhece a worktree do agente (`.claude/worktrees/agent-<id>`, na branch `worktree-agent-<id>`). Com ela e a árvore limpa, o E1 da runx e a F1 da sprintx criam ou retomam a branch do trabalho ali mesmo, em vez de abrir uma segunda worktree. A branch ativa em outra worktree viva para. A mergex não muda: o E0 adota a branch ativa (contrato `expx-orquestracao` §15.1).
- **O lock contestado, na runx e na sprintx.** O texto da 0.13.25 chega às skills: o diff do lock e a instalação congelada passando. A instalação que falha por outro motivo não prova nada e vai com a contestação ao desenvolvedor, e o subconjunto de testes afetado roda de novo depois dela. O contrato `expx-revisao` diz o mesmo.
- **Achados da CodeAnt na instalação da 0.13.24 no Login (katosmv/login#77, DS-218).** Um comentário no fim de uma linha de chave (`tasks: # nota: |`) ou um `|` entre aspas abria um escalar em bloco no `task-so-fecha-verde`, e as tasks abaixo eram puladas. No `criar` da sprintx, o `trap` do temporário só sai depois do `mv`, e o `mv` que falha para com erro de persistência.
- **Não exercitado:** a CLI real com a `derivacao: 2` (a suíte usa a CLI falsa) e o fluxo inteiro da runx e da sprintx executado pelo modelo como subagente isolado (a bancada real cobriu a abertura da branch).

## 0.13.24 — os achados da instalação da 0.13.23 no conselhos

Instale por PR, como a 0.13.23. Muda só a sprintx (AxisGov/sprintx#74, merge e3481da), no `task-so-fecha-verde.sh` (DS-214). A runx, o núcleo, os eventos, o `init`, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.23. Os achados são da CodeAnt no conselhos-municipais#298, reproduzidos pela `expx-atualizacao`. Nenhum tinha efeito no conselhos no dia.

- **O `status` entre aspas.** `status: "concluida"` (ou entre aspas simples), YAML válido, não casava no gate nem nos dois awks, e o hook ficava mudo. Anterior à 0.13.23.
- **O comentário não abre escalar em bloco.** Um `# nota: |` fazia o hook pular os campos seguintes. Era regressão da 0.13.23 (DS-212).
- **CRLF.** O `\r` do fim da linha impedia o `status` ancorado; agora sai.
- **O tab** conta 4 espaços na indentação, como no `_parse` da runx. Antes, os dois liam diferente dentro de um escalar em bloco.
- **Fora, por decisão do dono:** o texto do `>` dobrado no `_parse` (os hooks só usam o id e o `status`) e o sistema de arquivos sem hard link no `criar` (limite declarado na DS-213).
- **Não exercitado:** o bash 3.2 do macOS.

## 0.13.23 — os achados da instalação da 0.13.22 no conselhos e no Login

Instale por PR, como a 0.13.22. Muda a runx (AxisGov/runx#21, merge c958b52) e a sprintx (AxisGov/sprintx#73, merge 49db46a). O núcleo, os eventos, o `init`, o `doctor`, o painel e o `expx sessao` seguem como na 0.13.22. Os achados vêm da CodeAnt no conselhos-municipais#296, reproduzidos pela `expx-atualizacao`, e no katosmv/login#75. Nenhum tinha efeito nos consumidores no dia.

- **O texto da saída 1** (runx DR-111, sprintx DS-212). A saída 1 do `revisar` cobre também o achado sem vínculo a uma linha de um arquivo da task, que o núcleo deixa aberto.
- **A evidência no `task-so-fecha-verde`** (DR-111, DS-212):
  - link em qualquer ponto do caminho (uma pasta `revisao` linkada para fora da worktree) não vale;
  - na sprintx, `- id:` vazio vira `?` e avisa como fora da forma, e o `?` nunca conta como já concluído;
  - `id: "T-01.01"` é lido sem as aspas e sem o comentário.
- **O `status` só pela chave** (DS-212, DR-112). Um `status: concluida` dentro de outro campo (uma nota) ou de um escalar em bloco (`objetivo: |`) concluía a task.
  - Na sprintx, a âncora e o escalar em bloco nos dois awks do hook.
  - Na runx, o `_parse` do `expx_rastro.py` passa a reconhecer `chave: |` e `>`, o que vale para todo hook que o usa. O conteúdo na mesma coluna da chave continua chave, como no PyYAML.
- **O `planejamento.sh criar`** (DS-212, DS-213):
  - `--classe-sessao ""` e as outras duas opções vazias são erro de contrato, em vez de "sem declaração";
  - a corrida de dois `criar` do mesmo slug (CodeAnt no login#75): o arquivo nasce por `ln` exclusivo, e quem perde cai no `ja_existe`, que compara e recusa;
  - um `00-PLANEJAMENTO.md` que é link, inclusive pendente, passa a ser erro de contrato, também pelo caminho do legado no `avanca`.
- **A regra 21 da sprintx** traz a exceção "sem worktree" explícita da F1.
- **O que não procede:** a chave sem fecho com escape no `expx-rastro.sh` (o painel não lê id nenhum, e o critério é nunca dar um id diferente do que ele lê) e a vírgula no `--arquivos` (já sai `indisponivel:caminho-com-virgula`).
- **Não exercitado:** o bash 3.2 do macOS e o `ln` no Windows nativo.

## 0.13.22 — tudo junto: os achados do login#73 e do conselhos#293, a evidência no hook, o modo subagente e a classe da sessão

Instale por PR, como a 0.13.21. Muda a runx (AxisGov/runx#20, merge 618dbc6), a sprintx (AxisGov/sprintx#72, merge b4850d0), o núcleo (`expx-revisao.mjs`, `expx-rastro.sh`) e o CLI (`expx sessao`). Os eventos, o `init`, o `doctor` e o painel seguem como na 0.13.21; o painel só preserva as chaves novas do `00-OCORRENCIA.md`.

- **A saída 1 do `revisar`** (CodeAnt no katosmv/login#73, r4518931241). Uma exceção não tratada saía 1, o código de `achados`, e a F6 e o E3 a liam como achado.
  - O núcleo passa a sair **70** (erro interno).
  - A runx e a sprintx só leem `achados` com a última linha `<T-NN.MM> achados` (DR-104, DS-208). O 70, e a saída 1 sem a linha, são tratados como a saída 2.
- **O modo pelo leitor** (r4518931484). O `[ -f .expx/fatiamento.json ]` era falso para pasta e link quebrado, e a skill pulava o leitor e assumia `se_disponivel`.
  - Com o leitor instalado, ele roda sempre e decide sozinho (DR-107, DS-208).
  - Sem o leitor, qualquer entrada é modo desconhecido (`prerequisito_ausente`).
- **Aspas no exemplo do `revisar`** (r4518931754). Um caminho com espaço era dividido pelo shell, e o `revisar` saía 64.
- **A evidência no `task-so-fecha-verde`** (desenho de 2026-10-18, item 4.2; DR-106, DR-110, DS-207, DS-211).
  - Em `obrigatoria`, a task que a escrita leva a `concluida` precisa de `docs/entregas/<trabalho>/revisao/<T>.json`, arquivo comum.
  - O id fora de `T-NN.MM` avisa que a evidência não pode ser conferida.
  - Com modo desconhecido, não exige. O hook fica no modo dele, aviso por padrão.
- **O `trabalho_id` com outra chave escapada** (CodeAnt no conselhos#293). Uma chave entre aspas com escape, alheia ao `trabalho_id`, zerava o id. Agora a chave é decodificada como no YAML do painel, e só invalida quando dá `trabalho_id`, quando o escape não é do YAML ou quando o code point passa de `U+10FFFF`.
- **runx, a fechada da branch com o Git falhando** (conselhos#293, DR-105). Sem nenhuma aberta, o Git também é consultado.
- **O modo subagente** (Conselhos, OC-2026-0011; DR-108, DS-209; CONTRATO-expx-orquestracao §15). A runx e a sprintx não rodam como subagente comum com a worktree diferente do `cwd` da sessão.
  - Bancada com o `claude` 2.1.319 real (`scripts/bancada-subagente-cwd.sh`): `git -C` e `cd` não mudam o `cwd` do payload.
  - Com `isolation: "worktree"`, o `cwd` e o rastro do núcleo seguem a worktree do subagente. É compatibilidade medida, não suporte: o E0 da mergex não adota a branch `worktree-agent-*`.
- **A classe da sessão principal** (escopo (a); DR-109, DS-210; §14).
  - `classe_sessao`, `classe_sessao_por` e `classe_sessao_justificativa` no `00-OCORRENCIA.md` e no `00-PLANEJAMENTO.md`. Na sprintx, só o `planejamento.sh criar` as grava, com `--classe-sessao`, `--classe-sessao-por` e `--classe-sessao-justificativa`.
  - `expx sessao <trabalho>` imprime `cd '<worktree>' && claude --model … --effort …`, pela cadeia da política ou pela embutida.
  - Fora da v1: a observação, o aviso e o painel.
- **Não exercitado:** o bash 3.2 do macOS, o passo de revisão e o hook com o binário real numa feature ou numa ocorrência, e o fluxo E0–E5 como subagente com `isolation: "worktree"`.

## 0.13.21 — os achados da instalação da 0.13.20 no conselhos

Instale por PR, como a 0.13.20. Muda a runx (AxisGov/runx#19, merge a4127f7) e o hook `expx-rastro.sh`; a sprintx, os eventos, o `init`, o `doctor` e o painel seguem como na 0.13.20. Todos os achados vêm do conselhos-municipais#292, e nenhum tinha efeito lá no dia.

- **runx, a aberta que veio da `main`.** O Conselhos tem a OC-0008 e a OC-0011 com `em_andamento` na `main`. Numa worktree nova de outra OC, antes do `00-OCORRENCIA.md`, os primeiros eventos iam para `OC-2026-0011.jsonl`.
  - Agora, na branch `fix|chore/OC-…` sem a pasta dela aberta, só vale a aberta criada nesta árvore, fora do `HEAD`: é o caso da ocorrência aberta sem worktree. Senão vale a fechada da branch; senão, nenhuma.
  - Quando não dá para saber de onde a pasta veio (Git falhando, branch órfã), nenhuma é escolhida (DR-103).
- **runx, o marco pela metade** (CodeAnt r4517966249). A gravação do derivado que falha vira aviso no stderr, e o marco segue até o evento.
- **runx, o prefixo aparado** (CodeAnt r4517966257). O `--show-prefix` não corta mais o espaço do começo de uma pasta.
- **O comentário depois do `trabalho_id`.** A linha só com comentário logo depois da chave, indentada ou não, é comentário, e o valor fica, como no painel. A continuação indentada depois dela ainda invalida. A chave repetida passa a invalidar o arquivo, como no painel.
- **O que já estava tratado.** A vírgula num caminho do `--arquivos` (CodeAnt no #292): o `revisar` já sai `indisponivel:caminho-com-virgula` (`CONTRATO-expx-revisao`), porque o `--include` da CLI do CodeAnt também separa por vírgula.
- **Não exercitado:** o bash 3.2 do macOS, e o binário real numa ocorrência.

## 0.13.20 — a revisão por task na runx e na sprintx, e o `trabalho_id` com comentário

Instale por PR, como a 0.13.19. Muda a runx (AxisGov/runx#18, merge b6acc15), a sprintx (AxisGov/sprintx#71, merge 432bd9c) e o hook `expx-rastro.sh`. Os eventos, o `init`, o `doctor` e o painel seguem como na 0.13.19.

- **A revisão por task, nas duas skills.** O contrato `expx-revisao` dizia que a sprintx chamava o `revisar` do núcleo na F6, mas nenhuma versão da sprintx nem da runx teve esse passo. Com `revisao_por_task.modo: obrigatoria`, a task saía sem a evidência, e o commit seguinte, só com ela, era recusado pela mergex (conselhos, OC-2026-0009).
  - **Onde entra:** no passo 8 do E3 da runx (DR-100) e no passo 4 da F6 da sprintx (DS-206), depois do aceite e antes de `status: concluida`.
  - **O modo:** o leitor do núcleo só roda quando existe `.expx/fatiamento.json`; sem o arquivo, vale `se_disponivel`.
  - **As saídas:** cada uma tem sua rota, inclusive uma saída sem rota, como `127` sem `node`. Só o desenvolvedor rejeita um achado. Depois de um achado, uma revisão indisponível não fecha a task.
  - **Classes novas:** a sprintx ganha três, `revisao_defeito`, `revisao_contestada` e `revisao_incompleta`. Na runx, a classe vai no começo da descrição do bloqueio.
  - **O resultado** vai no detalhe do `task_concluida`, sem evento novo.
- **runx, os derivados fora do commit (DR-101).** O `.expx/handoff.md` não rastreado barrava o commit da task e o persistir-método como desvio. O `estado.py` passa a pôr o `estado.json` e o `handoff.md` no exclude local do Git, o do diretório comum, que vale para toda worktree. O que o time versiona fica como está.
- **runx, a ocorrência pela branch (DR-102).** Numa worktree nova, antes do `00-OCORRENCIA.md`, os primeiros eventos iam para a ocorrência fechada mais recente (`OC-2026-0006.jsonl`). Na branch `fix|chore/OC-…`, vale a pasta dela quando aberta; senão a aberta mais recente; senão a fechada dela. A fechada de outra ocorrência nunca é escolhida.
- **O `trabalho_id` com comentário (conselhos#283).** Com `trabalho_id: OC-2026-0098 # nota`, o hook caía no nome da pasta, e o painel descarta o comentário. Agora o hook tira o comentário fora das aspas. Também aceita a chave com espaço antes dos dois-pontos ou entre aspas, e não aceita sem aspas o que o YAML lê como booleano, nulo ou número. O contrato `expx-eventos` declara o subconjunto do YAML que o hook lê: âncora, tag, mapa em fluxo, escalar em bloco e escape valem como sem id.
- **Não entra:** o hook que barraria a task concluída sem a evidência no modo `obrigatoria` (desenho de 2026-10-18, item 4.2).
- **Não exercitado:** o bash 3.2 do macOS, e o passo novo com o binário real numa feature ou numa ocorrência.

## 0.13.19 — o trabalho dos hooks do núcleo no planejamento e na ocorrência

Instale por PR, como a 0.13.18. Muda só o `expx_trabalho_id` do hook `expx-rastro.sh`, que o rastro, a integridade final e o envelope da invocação usam. Os eventos, o `init`, o `doctor`, o painel e as skills seguem como na 0.13.18. A regra nova está em `CONTRATO-expx-eventos.md`, na seção "De onde sai o `trabalho_id` dos hooks do núcleo".

- **Planejamento da sprintx.** O `ORQUESTRADOR.md` só nasce na F4. Até lá, num repositório com mais de um trabalho, os eventos do núcleo iam para `sem-trabalho.jsonl`; no Login, foram as duas invocações do `sprintx-investigador` na F1 da `ui-react-045`. Agora a pasta da branch também vale quando só tem o `00-PLANEJAMENTO.md`.
- **Ocorrência da runx.** O id dos eventos do núcleo era o nome da pasta (`OC-2026-0007-<slug>`). A runx e o painel usam o `trabalho_id` do frontmatter (`OC-2026-0007`), então os eventos da mesma ocorrência ficavam em dois arquivos, e a orquestração do painel nunca mostrava as invocações e as integridades (conselhos, OC-2026-0003 a 0009). Agora o id é o do frontmatter: o primeiro válido entre `ORQUESTRADOR.md`, `00-OCORRENCIA.md` e `00-PLANEJAMENTO.md`, e o nome da pasta só quando nenhum tem. A pasta da branch também vale quando só tem o `00-OCORRENCIA.md` (E1).
- **O que não muda.** Os marcadores do planejamento só valem pela branch. O "único trabalho" continua contando só `ORQUESTRADOR.md`, e o mtime continua sem escolher. `EXPX_TRABALHO_ID` e o lock seguem com a sanitização de antes.
- **Sem migração.** Os arquivos já gravados (`OC-…-<slug>.jsonl` e as linhas em `sem-trabalho.jsonl`) ficam como estão. Nada os une ao rastro do trabalho.
- **Não exercitado:** o bash 3.2 do macOS.

## 0.13.18 — cada leitor de projeção em shell abre o arquivo uma vez

Instale por PR, como a 0.13.17. Muda só o hook `expx-rastro.sh`; o `expx-invocacao.mjs`, os eventos, o `init`, o `doctor`, o painel e as skills seguem como na 0.13.17. Corrige o Major de condição de corrida do CodeAnt na instalação da 0.13.17 no Login (login#69, r4508677024).

- **O problema.** Na 0.13.17, o `expx_papel_de` e o `expx_resolucao_extras` abriam a projeção para procurar NUL e a reabriam para o parse. Se o arquivo fosse trocado por um com NUL entre as duas aberturas, o Bash lia a versão nova sem o NUL e aceitava o que o leitor Node recusa. No `expx_resolucao_extras` a janela é anterior à 0.13.17: o cabeçalho e as linhas já eram lidos em duas aberturas.
- **A correção.** Cada leitor lê o arquivo inteiro para a memória numa abertura só (`IFS= read -r -d '' conteudo`), e o parse sai da variável. A conferência do NUL e o parse leem os mesmos bytes. A regra de cada linha não muda: arquivo sem quebra final, com quebra dupla no fim e em CRLF dão o mesmo resultado de antes (`CONTRATO-expx-orquestracao.md` §11.2 e §11.4).
- **Gravidade baixa.** Para acontecer, era preciso trocar a projeção por um arquivo com NUL no meio da chamada do hook. Só o `expx init` escreve esses arquivos, de forma atômica e sem NUL. O efeito era o do achado da 0.13.17, e nada aprovava o que devia recusar.
- **O que não fecha.** Os hooks em shell e o do envelope são processos diferentes, que leem em momentos diferentes. Uma troca entre eles faz os dois discordarem mesmo com duas projeções válidas, e por isso o papel e a skill da chamada ficam guardados desde o início (§11.4 e §13.1).
- **Contrato §2.2.** Passa a dizer que o primeiro plano do aprovador exige o papel na projeção dos papéis e a linha válida do agente na projeção do rastro: sem ela, não há envelope. Era o que o §13.1 já dizia. Os outros dois Major do login#69 apontavam essa ausência e ficaram como desenho.
- **Não exercitado:** o bash 3.2 do macOS.

## 0.13.17 — NUL numa projeção a invalida inteira, nos hooks em shell e no do envelope

Instale por PR, como a 0.13.15. Mudam só os hooks `expx-rastro.sh` e `expx-invocacao.mjs`; eventos, `init`, `doctor`, painel e skills seguem como na 0.13.16. Corrige o achado do CodeAnt na instalação da 0.13.16 (conselhos#274).

- **O problema.** O `read` do shell descarta o byte NUL em silêncio, e o leitor Node da mesma projeção não. Com um NUL no nome do agente, num campo, no cabeçalho ou depois da última quebra de linha, os dois hooks discordavam sobre o mesmo arquivo:
  - **`.expx/papeis.tsv`:** o `expx_papel_de` dava papel ao agente, e o `papelDe` do envelope deixava todos sem papel. A integridade final rodava a mais.
  - **`.expx/orquestracao-rastro.tsv`:** o `expx_resolucao_extras` gravava `resolucao_id` e a classe sem o NUL, que não é o valor do arquivo, e o `resolucaoDe` recusava a linha.
- **A correção.** Os dois leitores em shell recusam o arquivo que tiver NUL, antes de qualquer outra leitura, sem processo extra (`read -d ''`). O `resolucaoDe` passa a recusar o arquivo inteiro também quando o NUL está na linha de outro agente, que antes ignorava. Os quatro leitores concordam, e a falha continua aberta, como para qualquer linha inválida (`CONTRATO-expx-orquestracao.md` §11.2 e §11.4).
- **Nada passa a ser aprovado.** Antes e depois, nenhum caso com NUL fazia o hook aprovar o que devia recusar. O `doctor` já acusava as duas projeções adulteradas, e não muda.
- **Não exercitado:** o bash 3.2 do macOS. O `read -d ''` existe nele, mas a prova foi no bash 5 do Linux e no Git Bash do CI do Windows.

## 0.13.16 — o painel mostra declarada, resolvida e observada por invocação (F5 da orquestração)

Só o painel muda: hooks, eventos, `init`, `doctor` e skills seguem como na 0.13.15, e o consumidor não precisa reinstalar nada para continuar como está. É a F5 da orquestração (`CONTRATO-expx-orquestracao.md` §11.5).

- **A seção Orquestração no Detalhe.** Uma linha por invocação (`invocacao_fechada` ou `invocacao_abandonada`), com a classe declarada e a resolução lidas do registro `.expx/resolucoes/`, os modelos observados e a integridade final. Ela só aparece quando o rastro do trabalho tem invocação ou integridade, e abre sozinha quando há destaque vermelho.
- **A integridade se anexa só pela `instancia` idêntica.** Nada se correlaciona por agente, horário, tarefa ou sessão. Integridade sem invocação aparece à parte, e sem política é só isso que a seção mostra.
- **Destaques.** Em vermelho: fora da política, integridade final inválida, invocação que falhou e inconsistência no rastro (resolução ilegível ou de outro agente, duplicata, par de outro agente ou papel). Em âmbar: só lançamento, invocação abandonada, par não visto na janela e observado diferente da alternativa materializada.
- **O painel não rejulga a política.** Ele mostra o que os hooks gravaram, e a ausência de `fora_da_politica` não é lida como "dentro da política". O painel lê só a cauda do rastro, então a falta do par é "não visto na janela", nunca "rastro incompleto".
- **Fora da F5:** a contagem dos 20 vereditos do critério da recusa (§13.5). O `veredito_emitido` não carrega `invocacao`, e o painel não lê o rastro inteiro.
- **Linha do tempo:** continua com o leitor da §11.3. O servidor passa a servir a resolução validada completa, e a linha do tempo usa só o recorte de antes.
- **Não exercitado:** a seção foi provada com fixtures e testes de tela, não com o rastro de uma sessão real com subagentes.

## 0.13.15 — o papel decide quem é de aprovação (F4 da orquestração), e a DM-327 na MergeX

Instale por PR, como a 0.13.14. É a F4 da orquestração: a integridade final e o primeiro plano do aprovador deixam de escolher o agente por uma lista de nomes e passam a decidir pelo `papel:` que a skill declara. Mudam o ExpxDev e as seis skills com agentes. Vem junto a DM-327 da MergeX, os dois nitpicks do CodeAnt na instalação da 0.13.14 (conselhos#271).

- **mergex@326af49** (mergex#91, DM-327): os braços `sem`, `0` e `*` da recusa do `--registrar` passam a sugerir a busca só para remoto com `remote.<r>.url`, como o `mudou` desde a DM-326. Com o remoto da branch só com `fetch`, a recusa sugeria um `git fetch` que falha. A classificação não muda: a recusa continua, e nada passa a ser aceito.

- **As skills declaram o papel** (sprintx#70, runx#17, mergex#89, legadox#7, stackx#9, designx#12):
  - **`revisar`:** `auditor-plano`, `revisor-diff` e `auditor-design`;
  - **`testar`:** `qa`, `sprintx-revisor-testes` e `runx-revisor-testes`;
  - **`investigar`:** os outros sete.

  Cada skill tem um teste que exige o papel decidido de cada agente.
- **A projeção dos papéis.** O `init` lê o `papel:` com ou sem política e grava `.expx/papeis.tsv` (agente, skill e papel). Papel fora do vocabulário, ou frontmatter inválido que declara papel, recusa o plano antes de escrever, nos dois regimes. Sem política, `classe` e `model` continuam sem conferência.
- **A integridade final e o envelope decidem pelo papel.** É de aprovação quem tem `revisar` ou `testar` na projeção, e a `ferramenta` do evento é a skill da linha. Saem as três listas por nome: a dos aprovadores da integridade, a do primeiro plano e a de ferramenta por agente. O hook da integridade continua saindo sem rodar Git para quem não é de aprovação.
- **O que muda no comportamento:**
  - o `auditor-plano`, o `sprintx-revisor-testes` e o `auditor-design` passam também pela integridade final;
  - o `auditor-design` passa a rodar em primeiro plano;
  - sem a projeção, nenhum agente é de aprovação: ela sai junto com o hook, no mesmo `init`.
- **Os eventos levam o papel.** `integridade_final_verificada`, `invocacao_fechada` e `invocacao_abandonada` gravam o `papel` do início da chamada, que é a coorte da F5. O esquema deixa de amarrar o agente à ferramenta e exige `revisar` ou `testar` na verificação com papel; as linhas antigas, sem papel, continuam válidas.
- **Doctor:** `papeis-projecao-divergente` confere a projeção contra o hash que o `init` gravou no lock (`instalacao.papeis`) e contra as cópias dos agentes que o lock travou.
- **A projeção trocada no meio do agente** não suprime a integridade final: o papel e a skill do início ficam guardados com a foto.
- **Não exercitado:** a F4 foi provada com hooks reais, fixtures e o `init`, mas não numa sessão do Claude Code com subagentes de verdade.

## 0.13.14 — a busca sugerida nas recusas da reconciliação vai ao remoto certo, na MergeX

Instale por PR, como a 0.13.13. São os três nitpicks do CodeAnt na instalação da 0.13.13 no Conselhos (conselhos#271), mais um que o CodeAnt achou no próprio PR da correção (mergex#90), o do remoto sem URL. Só a MergeX muda: o ExpxDev e as outras skills seguem como na 0.13.13. A recusa já estava certa, e nada passa a ser aceito: muda só o comando sugerido.

- **mergex@0e8dffb** (mergex#90, DM-326):
  - **Remoto da branch trocado entre a consulta e a trava.** A recusa sugeria buscar no remoto consultado, mas o próximo registro confere a ref do remoto da branch, e a recusa se repetia. Agora ela dá as duas saídas: buscar no remoto novo, para registrar com ele, ou voltar o `branch.<atual>.remote` ao consultado e buscar nele.
  - **Remoto sem URL.** A busca só é sugerida para remoto com `remote.<r>.url`. Sem URL, a mensagem pede para configurá-lo, porque o `git remote get-url` devolve o próprio nome e sai 0.
  - **Remoto com `/` no nome.** O diagnóstico do B1 fora da ponta remota cortava o nome na primeira barra: com `time/origin`, sugeria `git fetch time +refs/heads/origin/main:…`. Agora o refspec só sai para `refs/remotes/<remoto>/<base>` exata; nos outros casos, a mensagem manda atualizar a ref remota.
- **Não exercitado:** as trocas de remoto foram testadas com um `git` falso, não numa corrida real.

## 0.13.13 — a foto inteira da consulta e a busca da base com refspec, na MergeX

Instale por PR, como a 0.13.12. São os dois Major do CodeAnt na instalação da 0.13.12 no Login (login#65). Só a MergeX muda: o ExpxDev e as outras skills seguem como na 0.13.12.

- **mergex@582738f** (mergex#88, DM-324):
  - **A foto conferida sob a trava é a configuração congelada inteira.** Antes, ela cobria só `remote.<remoto>.*` e `url.*`. Um `core.sshCommand` ou um `http.proxy` trocado entre a consulta e a trava, e restaurado antes dela, deixava a foto igual, e um "ausente" de outro servidor valia. Agora qualquer chave mudada recusa e manda buscar a base.
  - **A consulta só vale para o remoto consultado.** Se o `branch.<atual>.remote` muda antes da trava, mesmo para um remoto que não existe, o registro recusa em vez de aceitar a base local.
  - **As recusas dão a busca com o refspec explícito.** O comando sugerido passa a ser `git fetch <remoto> +refs/heads/<base>:refs/remotes/<remoto>/<base>`, com o quoting do shell. Ele cria a ref de rastreio num clone `--single-branch` ou com um `remote.<remoto>.fetch` sem a base, onde `git fetch <remoto>` não a traz e a recusa se repetia. A recusa "mudou" sugere o remoto consultado.
- **Não exercitado:**
  - as trocas de configuração e de `insteadOf` foram testadas com um `git` falso, não com uma corrida real;
  - o caso do conselhos#266 continua reproduzido só com fixtures sintéticas.

## 0.13.12 — o `regressao_de` na MemoX e a base trazida antes do E0 na MergeX

Instale por PR, como a 0.13.11. São um relato do Conselhos sobre a MemoX (conselhos#266), um defeito da reconciliação que travou o conselhos#266 e os achados do CodeAnt no conselhos#267. Mudam a MemoX e a MergeX; o ExpxDev e as outras skills seguem como na 0.13.11.

- **memox@db64a04** (MemoX#6, DM-29):
  - **A regressão respeita a causa raiz.** O `detectar_regressoes` não lia o `regressao_de` nem o `evidencia_regressao` do `01-CAUSA-RAIZ.md`, em que a runx declara a regressão. Com `regressao_de: null`, que é a coincidência de arquivo da regra 15 da runx, a regressão era registrada mesmo assim, e o E3 da MergeX subia o arquivo para OLHO OBRIGATÓRIO. A declaração passa a ser a 4ª condição:
    - `null` ou vazio nega;
    - preenchido, com evidência em texto, vale só contra o trabalho nomeado;
    - inválido ou sem evidência vira coincidência e vai para `fora_do_indice`;
    - a causa raiz anterior ao campo fica com as três condições.
  - **Causa raiz duplicada.** Com duas causas raiz do mesmo trabalho, a que não tem a chave não desfaz a declaração da outra, e dois `regressao_de` diferentes não afirmam regressão. O comentário YAML no fim do valor, com ou sem aspas, sai antes da comparação.
  - **O índice antigo é reconstruído.** O `VERSAO_INDICE` vai para 2, e o índice da versão anterior não é carregado: a consulta e o hook Stop o reconstroem. As regressões falsas já gravadas somem na primeira consulta.
- **mergex@0093795** (mergex#87, DM-323):
  - **A base trazida antes do E0 não trava a primeira reconciliação.** Um merge que trouxe base nova à feature, com o segundo pai na base validada (o feito antes do E0, ou antes da reancoragem da DM-261), sai da fila da ordem do `001`. Na prova 2, ele não conta no arquivo que tomou da base. O merge "sem efeito" de um commit já contido na feature fica na fila e na prova 2. Trazer a base antes do E0 continua permitido.
  - **O E7 confere a ponta buscada numa ref só da execução.** Antes, a ponta era lida do `FETCH_HEAD`, que outro fetch na mesma worktree (como o automático do editor) sobrescreve.
  - **A consulta da base usa a configuração congelada inteira.** Ela é escrita num arquivo só do dono, nunca em argumentos de processo, e a consulta roda fora do repositório. Um `url.*.insteadOf` que mude durante a consulta não desvia o servidor, e um token de `http.*.extraHeader` não aparece no `ps`. No Git anterior ao 2.32, a consulta recusa e manda rodar `git fetch`.
- **Não exercitado:**
  - a troca de `insteadOf` durante a consulta foi testada com um `git` falso, não com uma corrida real;
  - o caso do conselhos#266 foi reproduzido com fixtures sintéticas.

## 0.13.11 — a base em SHA e a base do PR conferida na ponta buscada, na MergeX

Instale por PR, como a 0.13.10. São os achados do CodeAnt nas instalações da 0.13.10 (conselhos#264 e login#64). Só a MergeX muda: o ExpxDev e as outras skills seguem como na 0.13.10.

- **mergex@08f6fff** (mergex#86, DM-322):
  - **A `branch_base` em SHA volta a valer sem rede.** Era regressão da 0.13.10: um SHA completo virava nome de branch, e o `--registrar` consultava `refs/heads/<sha>` no servidor. Com o remoto fora do ar, recusava. Agora o SHA no tamanho do OID do repositório (40 no SHA-1, 64 no SHA-256) conta como ref completa, sem consulta.
  - **A consulta da base vai a um remoto congelado.** A configuração do remoto é lida uma vez e copiada num remoto sintético, e o `ls-remote` vai a ele. O `insteadOf` é aplicado uma vez, e o proxy e o `uploadpack` do remoto continuam valendo. Sob a trava C5, se a URL ou a configuração do remoto mudou, ou se ele foi removido, o registro recusa e manda rodar `git fetch`.
  - **O pre-push ignora o `PR_BASE_DO_PR` do shell.** Só o CI define a variável. Exportada no shell, ela vazava para o pre-push local e barrava o push com `base_do_pr_divergente`.
  - **O E7 confere a base do PR na ponta buscada.** No GitHub, o `is-ancestor` da base validada é feito contra o `FETCH_HEAD`, e não contra o `baseRefOid` lido antes do `fetch`. No GitHub e no GitLab, a base validada abreviada é recusada: ela precisa ter o tamanho do OID do repositório, como o CI exige.
  - O diagnóstico `base_do_pr_divergente` separa as duas causas: depois de um squash da predecessora, reconcilie; com a base defasada no evento, gere um novo evento.
- **Não procede:** o nitpick do `U+2028` no `expx-invocacao.mjs`. Sem a flag `m`, o `$` do JavaScript só casa no fim da entrada.
- **Não exercitado:** a troca de URL do remoto durante a consulta foi testada com um `git` falso, não com uma corrida real.

## 0.13.10 — a base do PR e a base publicada na MergeX

Instale por PR, como a 0.13.9. Mudam a MergeX e o envelope da invocação do núcleo, e o README passa a documentar o `--harness codex`. Nenhum item é regressão da 0.13.9.

- **mergex@b30e951** (mergex#84 e #85):
  - **A base do PR contém a base validada** (DM-320, relato do Login no login#58):
    - o CI barra com `base_do_pr_divergente` o PR cuja base não contém a `base_validada_sha` da entrega. É o caso da frente empilhada aberta contra a `main`, levando a predecessora junto;
    - a regra é pelo SHA, então o PR redirecionado depois do merge da predecessora (DM-245) passa;
    - o E7 não retoma um PR existente cuja base não a contém, e lê a base validada do `ENTREGA.md` publicado. No GitLab, confere também a ponta do alvo;
    - o E9 confere a mesma regra na releitura antes do merge;
    - o pre-push não muda.
  - **A base publicada no registro da reconciliação** (DM-321, nitpick do CodeAnt no login#57):
    - sem a ref remota da base, o `--registrar` consulta o servidor antes da trava C5;
    - a base que existe lá, mas não foi buscada, recusa e manda rodar `git fetch`. A consulta que falha também recusa;
    - a base que não existe no servidor (a empilhada nunca enviada) vale pela local, e a DM-320 barra no CI o PR que não a contém.
- **ExpxDev** (expxdev#145, achados do CodeAnt no login#62):
  - **O envelope da invocação não grava executor herdado:** o `expx-invocacao.mjs` tira o `EXPX_MODEL` e o `EXPX_EFFORT` herdados da sessão. Antes, quando o hook não via modelo, um valor velho ia ao evento como executor observado.
  - **O envelope não perde a resolução:** o hook valida a linha da projeção pelas mesmas regras do leitor do rastro (`expx_resolucao_extras`), inclusive o CR final sem quebra de linha. Antes, numa linha malformada, ele suprimia o `resolucao_id` explícito da chamada e o evento saía sem ele. Os dois falhavam aberto: o envelope só observa.
  - O README documenta o `--harness codex`, que a CLI já aceitava. Hoje ele só registra o hook de sincronização de sessão; os agentes do método no Codex são a F7 da orquestração.
- **Efeito no consumidor:** um PR aberto contra outra base que não a registrada passa a falhar no CI da MergeX. O caminho é abrir contra a `branch_base`, ou entregar a predecessora antes e reconciliar.
- **Não exercitado:**
  - a consulta ao servidor com credencial interativa real: o teste usa um `git` falso;
  - a predecessora integrada por squash, que barra até a reconciliação (falso bloqueio, nunca aprovação).

## 0.13.9 — o teto do SHA de `commits` e o commit de método com a árvore fixada na MergeX

Instale por PR, como a 0.13.8. São os achados do CodeAnt na instalação da 0.13.8 (conselhos#262). Nenhum é regressão grave: o primeiro só afrouxava a sintaxe aceita, e o segundo depende de uma corrida rara. Só a MergeX muda: o ExpxDev e as outras skills seguem como na 0.13.8.

- **mergex@37f2159** (mergex#82 e #83):
  - **O teto do SHA de `commits`** (DM-318): a DM-315 tinha levado o `sha_valido` a aceitar de 7 a 64 hex em qualquer repositório, e a V11 contava de 41 a 64 hex como prova num repositório SHA-1. O teto passa a ser o OID do repositório da ENTREGA: 40 no SHA-1, 64 no SHA-256, e 40 fora de repositório. O formato é lido sem `GIT_DIR` e afins. O E1 e a V11 medem pela ENTREGA, e a V12 por `--raiz`.
  - **O commit de método com a árvore fixada** (DM-319): o pai é lido antes do `add`, e a árvore logo depois. O catálogo do stage e o blob provado do `e9-merge` são conferidos nessa árvore, nome a nome. Depois do commit, `HEAD^1` e `HEAD^{tree}` têm de ser os fixados. Se divergirem, o `persistir-metodo` para sem desfazer o commit local e diz para não enviar. Isso vale para todo checkpoint, não só o `e9-merge`. De quebra, área da base com acento, TAB ou aspas no nome deixa de parar o checkpoint.
  - **Textos** (DM-319): o `Integra-base:` com hex a mais depois do SHA completo é integração inválida, como o código já fazia. O "mesmo tamanho" do artefato de reconciliação vale para os OIDs do Git, e não para os dois sha256 de conteúdo.
- **Não exercitado:**
  - o `persistir-metodo` no macOS: a comparação foi escrita sem `sort -z` e sem process substitution, mas só roda no Linux e no Windows do CI;
  - um hook `pre-commit` do projeto que reescreva o stage: o checkpoint para por "o índice mudou", como deve, mas não há bancada com esse hook.

## 0.13.8 — o SHA-256 de ponta a ponta, o blob provado no `e9-merge` e a entrega por trabalho depois do merge na MergeX

Instale por PR, como a 0.13.7. Traz os achados do Conselhos e do CodeAnt na instalação da 0.13.7 (conselhos#256) e dois defeitos anteriores achados no caminho. Nenhum item é regressão da 0.13.7. Só a MergeX muda: o ExpxDev e as outras skills seguem como na 0.13.7.

- **mergex@66b26a0** (mergex#77 a #81):
  - **Os scripts não estão no PATH** (DM-314): o SKILL.md manda rodar cada um como `bash .claude/skills/mergex/scripts/<nome>.sh`, e os comandos feitos para copiar trazem o caminho completo. Os dois do passo 7 do E9 davam "command not found".
  - **O blob provado no `e9-merge`** (DM-314): depois do `git add`, o stage tem de ser o blob que a prova leu do disco. Um escritor entre a prova e o add para o checkpoint sem commitar, e o stage fica preservado.
  - **SHA-256 de ponta a ponta** (DM-315): o tamanho do SHA vem do formato do repositório (40 hex no SHA-1, 64 no SHA-256) na reconciliação da base, no `Integra-base`, no E1 de recuperação, nos hooks, nos fechamentos e no `--abrir-sprint`. Num repositório SHA-256, o `--registrar-existente` aceitava 40 hex, uma abreviação, como SHA completo. O GitHub não hospeda SHA-256: o fechamento depois do merge para com rc 5 nesse formato.
  - **`e9-merge` com `core.autocrlf=true`** (DM-316): a prova recusava sempre, porque comparava o blob cru em LF com o disco em CRLF. Agora ela lê o blob como o checkout o escreve.
  - **A entrega por trabalho depois do merge** (DM-317): na runx e na entrega por trabalho da sprintx, o E9 não grava `pr_estado` no `ENTREGA.md`. Ele fica com o retrato do E7, e o estado final é o do serviço. O `e9-merge` numa entrega por trabalho recusa citando a regra. No Conselhos, a OC-2026-0001, a 0002 e a 0003 ficam com `aberto`, e nenhum commit à mão é necessário.
- **Não exercitado:**
  - o fechamento depois do merge num repositório SHA-256 real hospedado: o GitHub não hospeda esse formato;
  - o pre-push da branch empilhada num repositório SHA-256, provado só por chamada direta à função (DM-313).

## 0.13.7 — o E9 persistido e o E8 terminal na MergeX, a ponta publicada da base, e o update sem `claude` legível no ExpxDev

Instale por PR, como a 0.13.6. Fecha o impasse E9/E0 do Conselhos (onda-0c) e traz os achados do Conselhos e do CodeAnt na instalação da 0.13.6. Nenhum item é regressão da 0.13.6.

- **mergex@2ddb8dc** (mergex#74, #75 e #76):
  - **Checkpoint `e9-merge`** (DM-311): o registro do merge pelo E9 (`--registrar-merge`, `--completar-base`) é persistido com `persistir-metodo --checkpoint e9-merge`, só o ENTREGA.md e só na branch da entrega, com prova por replay; aceita CRLF e o registro feito noutro dia. O contorno do Conselhos (`--checkpoint e8` antes do merge de integração) deixa de ser necessário.
  - **O `e8` exige o estado terminal** (DM-311), no persistir e no `--verificar`, antes do `noop`: entregue com `portao: pronto`, `entregue_em` que é data do calendário, `causa: null` e `push_feito` booleano; bloqueado com `portao: bloqueado`, `entregue_em: null`, `push_feito: false` e a causa que `falhas_portao` deriva. Campo terminal repetido no frontmatter, em qualquer grafia YAML, recusa.
  - **A ponta publicada da base** (DM-312): o `reconciliacao-base.sh --registrar` exige `refs/remotes/<remoto>/<branch_base>` quando ela existe, também com `branch_base: refs/heads/<base>`. A recusa manda rodar `git fetch`. A `main` local atrás da origem deixa de barrar um B1 publicado.
  - **A base declarada da branch empilhada** (DM-313): ENTREGA.md com NUL não estreita a seleção; a `base_validada_sha` tem o tamanho do OID do repositório (40 hex no SHA-1, 64 no SHA-256); `refs/heads/origin/main` é a branch de nome literal `origin/main`. O SHA-256 de ponta a ponta continua fora do método: o schema, o E0, a reconciliação e os fechamentos seguem em 40 hex.
- **ExpxDev** (expxdev#140 e #141):
  - **Envelope mantido**: com a política de orquestração ativa e sem `claude` legível no PATH (CI, outra máquina), o `init` e o `update` mantêm o envelope da invocação que o lock anterior gerenciava, com o aviso `envelope da invocacao mantido`. Abaixo do piso, ele sai. O `doctor` ganha `claude-versao-ilegivel` (trinta e seis verificações).
  - **`--sem-registro`** no `init` e no `update`: nenhum `claude plugin ...` roda, e o rc é o da instalação. Para quem não pode tocar a configuração do usuário.
  - **`init --check`** só mostra o que instalaria; antes, instalava.
  - **O lock regravado no meio**: o `init` recusa escrever se o lock mudou entre o planejamento e o bloqueio da operação; o retrato que vale no `update` é o dele. Lock ilegível vira erro, e a recusa do `init` chega à saída do `update`.
- **Não exercitado:**
  - o `e9-merge` encadeado com uma reconciliação real (a fixture por sprint tem um merge comum sem `Integra-base:`);
  - `branch_base: origin/main` no `--registrar`, e o pre-push inteiro num repositório SHA-256 (a função foi provada direto).

## 0.13.6 — o pre-push da branch empilhada na MergeX, os hooks da designx no Claude Code, e a task do [item 1] só solta na SprintX

Instale por PR, como a 0.13.5. São achados de revisão do CodeAnt e do CodeRabbit e relatos dos consumidores; nenhum é regressão da 0.13.5. O `e9-merge`, o `e8` terminal (mergex#74) e a ponta remota da base no `--registrar` (mergex#75) ficam para a 0.13.7: no Conselhos, o contorno do E9 com `persistir-metodo --checkpoint e8` continua valendo até lá.

- **mergex@915fcff** (mergex#73, DM-310): no pre-push da branch empilhada, a parcela (a) da seleção usa a `base_validada_sha` do ENTREGA.md da própria branch, quando ela é ancestral do SHA enviado e não da base padrão. Uma `branch_base` com byte de controle não estreita a seleção. Relato do Login (login#53). Limite: o NUL o Bash descarta antes da checagem (`feature/a\0b` vira `feature/ab`), e o nome passa sem ele. A seleção só estreita com uma `base_validada_sha` empilhada válida, e o Git não aceita NUL em nome de ref; a recusa do NUL nos bytes brutos entra na 0.13.7 (revisão do Codex).
- **designx@0d649e3** (designx#11): os hooks.
  - O `designx-audit` lê `.tool_input.file_path`: no Claude Code, ele nunca rodava.
  - Os dois hooks leem o modo do `.expx/hooks.json`, com fallback em `DESIGNX_*_MODO`, e falham abertos sem `jq` ou com JSON inválido. O aviso sai em `additionalContext`, no stdout.
  - O descarte do A1 é um awk de uma passada (o `jq` levava 8 s em 4500 linhas) e trata strings, `@scope`, `@supports selector()`, at-rules do SCSS e CRLF.
- **sprintx@a6f852a** (sprintx#69, DS-204): no `valida-auditoria` da F5, uma `T-NN.MM` só cita a task do `[item 1]` quando está solta: sem letra (também acentuada), dígito ou `_` grudado, nem `.` seguido de dígito depois. `XT-01.01`, `T-01.01oops`, `T-01.01é` e `T-01.01.02` deixam de citar a T-01.01, e o achado volta a ser recusado ao lado de um `[fraco:ausente]`; `T-01.01.` e `(T-01.01)` seguem citando. Achado do CodeAnt no login#54.
- **Não exercitado:**
  - o awk do BSD (macOS) nos hooks da designx, e o plugin do OpenCode da designx;
  - o pre-push empilhado num push real de consumidor.

## 0.13.5 — a cor hex solta em CSS e no CSS-in-JS, e sombras e bordas contadas sem corte, na designx

Instale por PR, como a 0.13.4. São achados de revisão do CodeAnt e do CodeRabbit; nenhum é regressão da 0.13.4.

- **designx@344005c** (designx#9 e designx#10): a cor hex na auditoria e na cartografia, e a elevação e a tipografia na cartografia.
  - **Busca de cor:** as seis buscas de cor (o A1 no auditor, na auditoria, nas boas práticas e no checklist de QA; "Cores" na cartografia e no cartógrafo) olham `.css`, `.scss` e `.ts`, além de `.js`, `.jsx` e `.tsx` (CodeAnt no conselhos#249 e no expxdev#137). Lá, `src/index.css` tinha 43 linhas de hex fora de variável que nenhuma busca via.
  - **Objeto de tema:** o hex de um tema com variante dark (`createTheme`, `theme.ts`) é a definição do token, e o auditor o julga lendo o arquivo; o mesmo hex num componente é achado.
  - **CSS-in-JS na cartografia:** a sombra casa `boxShadow`, e a tipografia, `fontFamily`, `fontSize` e `fontWeight`.
  - **Descarte:** sai o hex que é só o valor de `--nome:` (a definição do token), o que está em comentário, o seletor de id do CSS e a referência `url(#...)` do SVG.
  - **Variável do SCSS:** `$cor:` continua achado, porque não muda no dark mode.
  - **Padrão da cartografia:** passa a ser o do A1, que não aceita cinco nem sete dígitos.
  - **Sombras e bordas:** são duas buscas que contam linhas, sem o corte em 30, porque um arquivo cheio de `border` inclinava a comparação (nitpick do CodeAnt no expxdev#136).
  - **Busca sem `rg`:** traduz a contagem (`grep -rcE` ou `-Hc`, sem as linhas `:0`) e deixa de fora o arquivo oculto ou em pasta oculta, que o `rg` pula.
  - **Hooks:** não mudam.
- **Não exercitado:**
  - uma auditoria real do A1 novo num consumidor;
  - a cartografia com os agentes reais.

## 0.13.4 — o A9 da designx em .js e .jsx, e o [item 1] sem task da SprintX

Instale por PR, como a 0.13.3. São achados de revisão do CodeAnt e do CodeRabbit nos consumidores e nos próprios PRs; nenhum é regressão da 0.13.3.

- **designx@4ddff14** (designx#8): o A9 (`prefers-reduced-motion`) e as demais buscas de JSX e CSS-in-JS:
  - olham `.js` e `.jsx`, além de `.ts` e `.tsx` (CodeAnt no expxdev#135 e no conselhos#247). Os hooks não mudam;
  - acham a chave entre aspas no CSS-in-JS (`'animation-name':`, `"transition":`), e o valor entre aspas vai até a aspa que fecha;
  - o reset global protege a transição com `transition-duration` de no máximo `0.01ms !important`. A animação, só se o reset também tiver `animation-iteration-count: 1 !important`: uma animação `infinite` de 0.01ms continua repetindo, e `animate-spin`, `-ping`, `-pulse` e `-bounce` são todas `infinite`. Dentro de um seletor, só a duração zero desliga;
  - o reset vale igual num objeto de estilo (`animationDuration`, `'animation-duration'`). Dentro de outro seletor (`.card { @media ... { * {...} } }`), ele não é global. As declarações do próprio reset deixam de ser achado;
  - a cartografia de bordas e sombras passa a olhar `.css` e `.scss`, com `shadow` no lugar de `shadow-`, porque o `box-shadow:` não casava.
- **sprintx@e552cfc** (sprintx#68, DS-204): na F5, toda `T-NN.MM` do `[item 1]` conta, não só a primeira, na forma do contrato do id (`T-1.1` não conta). Um `[item 1]` sem task é recusado só quando a tabela tem `[fraco:ausente]`, porque aí não há como provar que não é o mesmo defeito (nitpick do CodeAnt no katosmv/login#50). Sem `fraco:ausente`, o relatório antigo segue lendo.
- **Não exercitado:**
  - uma auditoria real do A9 novo num consumidor;
  - o caminho F5 → F6 com os agentes reais.

## 0.13.3 — o que o Conselhos e o Login acharam na 0.13.2

Instale por PR, como a 0.13.2. O hook da 0.13.2 só avisa.

- **mergex@0a85eab** (mergex#72, DM-309): a V9 deixa de barrar o merge do "Update branch" que não traz nada do trabalho. No Conselhos, o merge 71358c1, do #241, tem um pai que é o próprio merge do planejamento, e a pasta e a entrega nele são iguais às desse pai. Como toda base depois dele o contém, a V9 dava `v9_sem_prova` na entrega `por_sprint` da onda-0c, sem saída. Agora a guarda (b) percorre toda a lista do `rev-list --full-history`. Ela descarta só o merge que tem um pai ancestral do planejamento com pasta e entrega idênticas às dele. Se essa comparação der erro, a guarda continua barrando. Um merge que muda a pasta continua `v9_sem_prova`.
- **sprintx@b4c62aa** (sprintx#67, DS-203): o `valida-auditoria` e o `obrigacoes-f6` voltam a aceitar a F5 da mp2-7b, que tem dois `[fraco:teste]` de T-04.01 com implementações erradas diferentes. Davam rc 0 na 0.13.1 e rc 4 na 0.13.2. Cada implementação errada é uma obrigação da F6, então o `fraco:teste` repete, uma linha por implementação distinta. Tipos diferentes na mesma task, dois `ausente`, dois `criterio` ou a mesma implementação duas vezes continuam recusados. Nos 11 relatórios F5 da main do Conselhos, só a mp2-7b muda de resultado.
- **designx@2a0a9a8** (designx#7): o A9 (`prefers-reduced-motion`) passa a buscar `animation` e `transition` em `.css`, `.scss` e CSS-in-JS: prefixo de fornecedor, camelCase e `@apply`. O descarte segue a cascata:
  - só `no-preference` dispensa;
  - dentro de `reduce`, a animação tem de ser desligada no mesmo seletor, depois da original ou com `!important`, também por longhand;
  - o reset global precisa de `*, *::before, *::after` com `!important`, e o que tem `!important` próprio vence o reset;
  - nas classes, a proteção leva as mesmas variantes e a mesma prioridade;
  - transições só de cor ou opacidade ficam, como a regra já dizia.

  A T7 lê a className inteira, que pode estar em várias linhas. A busca sem `rg` corrige o `-e` e o glob do `--include`, que não casava nada. Sem `--include`, ela usa o `find`.
- **O cache Axis num ancestral do projeto é recusado** (CodeAnt no katosmv/login#50). Com `EXPX_AXIS_CACHE` numa pasta que contém o projeto, o `relative` dava `..` ou `../..`, e o SessionStart aceitava esse caminho como fora do projeto. Agora o hook adia, como faz com o cache dentro do projeto.
- **Não exercitado:**
  - a V9 nova contra o histórico real do Conselhos, que tem só o formato reproduzido no teste;
  - o caminho F5 → F6 com os agentes reais;
  - uma auditoria real do A9 novo.

## 0.13.2 — o SessionStart só avisa

**Instale por PR antes de abrir sessão nova.** O hook da 0.13.1 ainda instalado aplica a versão sozinho na primeira sessão em árvore limpa, e publicar a 0.13.2 não o desliga. Depois de instalada, nenhuma sessão aplica mais nada.

- **SessionStart só avisa** (decisão do dono). O `expx-session-sync` aplicava `update --yes` sozinho em árvore limpa. No Login, deixou a 0.12.14 sem commit por dois dias, contra o `AGENTS.md` de lá. Agora roda `expx update --check --json` com o CLI da última release e diz o que há (pendências e skills bloqueadas por modificação local). Nada é aplicado: a instalação é sempre o `expx update --yes` de quem vai commitar. A árvore suja não impede mais a verificação.
- **`expx update --check --json`**: um objeto JSON numa linha, com as chaves `ok`, `pendente`, `pendencias` e `bloqueadas`, com `skill:`, `cli:`, `proveniencia:` e `normalizacao:`. O `--json` só vale com `--check`.
- **O cache Axis fica fora do projeto.** Com `EXPX_AXIS_CACHE` relativo, dentro do projeto, sob link para dentro dele ou com `..`, o hook adia antes do bootstrap, que escreveria no próprio projeto.
- **WSL sem o `claude` do Windows.** O registro do plugin e a leitura do piso deixam de usar o `claude` (ou `claude.exe`) sob `/mnt/`, inclusive por link. No Login, o `remove` e o `add` rodaram no Claude do Windows. Só com o do Windows no PATH, nada roda, e a instrução manda pôr o Claude Code do Linux no PATH. A entrada vazia do PATH conta como a pasta atual.
- **O 403 da CLI do CodeAnt em todo lote é indisponível** (AxisGov/expxdev#134). No Conselhos, a T-01.04 parou com 403 em todos os lotes. O 403 que vem só no stderr dava `incompleta:lote-falhou`, FALHA nos dois modos, enquanto o mesmo 403 em `error` no JSON dava `indisponivel:erro`. Agora, quando todas as linhas `[error] Failed to review <arquivos>: Access denied (403)...` juntas cobrem todos os enviados, com `issues` vazia e `error` nulo, o resultado é `indisponivel:acesso-negado`: AVISO em `se_disponivel` e FALHA em `obrigatoria`. O `meta.reviewed_files` não prova revisão: a CLI 0.5.14 só repete nele os enviados. Com qualquer outro sinal, o resultado continua `incompleta`.
- **designx@257b205** (designx#6): as buscas dos agentes `cartografo-visual` e `auditor-design` viram chamadas das ferramentas Grep e Glob. Esses agentes não têm shell, e a busca de cor com `\|` não achava nada. Toda chamada de Grep declara `output_mode` e `head_limit`: a ferramenta corta em 250 e, sem `output_mode`, só lista arquivos.
  - A animação sem `motion-reduce:animate-none` ou `motion-reduce:transition-none` na mesma `className` é achado.
  - A sessão principal, que no Claude Code 2.1.310 não tem Grep nem Glob, faz a mesma busca com `rg`.
  - O `install.sh --opencode` volta a levar a skill.
- **sprintx@b54d61f** (sprintx#66, DS-202): na F5, um defeito de teste vira um achado só, o do revisor de testes, e o `valida-auditoria` recusa a repetição.
- **runx@a214196** (runx#16, DR-98): o investigador pode escrever o teste temporário da prova 1, em `mktemp -d /tmp/...` fora do projeto.
- **stackx@1c49fba** (stackx#8, D-20): o cartógrafo procura o roteiro na cópia do plugin quando falta o de `.claude/skills`.
- **Não exercitado:** o Claude do Windows de verdade, por decisão do dono, já que o trabalho é no WSL. O resolvedor foi provado com binários falsos sob uma raiz de Windows injetada.

## 0.13.1 — o que a 0.13.0 deixou no consumidor

O Conselhos instalou a 0.13.0 e achou dois defeitos, reproduzidos no pacote publicado. Esta versão os corrige e fecha as pendências pequenas.

- **`expx update` entrega a CLI nova.** Com as skills em dia, a 0.13.0 dizia `em dia`, saía 0 e deixava o lock, o plugin e os hooks do núcleo da CLI anterior; o SessionStart passava pelo mesmo caminho. Agora o lock de uma CLI anterior remonta a instalação com as mesmas skills e os mesmos commits, com a proteção de modificação local de toda remontagem. O `--check` só relata. O `doctor` ganha o aviso `instalacao-de-cli-anterior` (35 verificações).
- **Política ativa com as nove skills.** O `init` dava rc 1 com designx, legadox ou stackx: cinco agentes sem `classe:` e sem `model` classificável davam `sem_classe`. As skills agora declaram a classe de todos os agentes. Os cinco ficam em `raciocinio_normal`: com a política, deixam de herdar o modelo da sessão. Os outros oito declaram a classe que o `model` já dava. Certifica designx@cf5a54d (designx#4), legadox@e43d17e (legadox#5, DL-57), stackx@12b7dd7 (stackx#6, D-19), mergex@67ec8eb (mergex#71, DM-308), sprintx@739e69c (sprintx#65, DS-201) e runx@b52b890 (runx#15, DR-96). Um teste novo resolve, offline e com a política, os agentes do commit certificado de cada skill.
- **A mensagem do `sem_classe` aponta a skill.** Ela mandava declarar `classe:` no agente, que no consumidor é a cópia instalada.
- **Rastro da runx de subpasta** (runx#15, DR-97): os 14 comandos das referências e o `--ocorrencia` partem da raiz do Git.
- **Lembrete sob carga:** a espera pelo lock vai de 50 a 250 ms, abaixo do `timeout: 1` do hook. Sem o lock, o hook emite: repetir o lembrete é aceito, perdê-lo não.
- **Site:** o comando de instalação baixa o pacote em `~/expx-cli/v<versão>`, como o README, e não mais dentro do projeto.
- **Recusa do veredito:** o critério para construí-la está no contrato (§13.5): 20 vereditos em ao menos 5 PRs e 3 configurações de projeto, sem nenhum falso positivo. Nada recusa ainda.
- **Errata da 0.13.0:** "sem `.expx/orquestracao.json`, nada muda" não vale para o evento `integridade_final_verificada`, que ganhou `instancia` também sem a política, porque o hook da integridade final é instalado sempre. O campo é aditivo, e nada decide por ele.
- **Errata do aviso da 0.13.0:** a instalação "por release e PR, como nas anteriores" não funcionava, porque o `update` não entregava a versão. Quem está na 0.13.0 chega à 0.13.1 pelo `update`.
- **Provado com o `claude` 2.1.310 real:** duas chamadas de agente na mesma mensagem, cada uma com envelope próprio; a sessão da SprintX e o `session_id` da `instancia` são o mesmo id. **Não exercitado:** `modelsUsed` sob fallback real (só o payload, em teste) e o Windows nativo, por decisão do dono.

## 0.13.0 — o envelope da invocação: observar antes de recusar

Com a política de orquestração ativa, cada chamada de agente gerenciado passa a deixar registro: quem rodou, em que modelo, como terminou e se saiu da política. **Nada é recusado nesta versão.** Sem `.expx/orquestracao.json`, nada muda.

- **`expx-invocacao.mjs`**, em `PreToolUse`, `PostToolUse` e `PostToolUseFailure` do `Agent`, e em `SessionStart`. Falha aberto: se o hook quebra, o agente roda, e o fechamento registra `sem envelope`. Agente fora do vocabulário do rastro não é observado.
- **Aprovadores em primeiro plano.** O Claude Code roda `Agent` em segundo plano por padrão, e aí só se observa o lançamento. Quem emite `veredito_emitido` passa a rodar em primeiro plano, e **a sessão espera por ele**. Quem implementa segue como pediu.
- **Eventos novos:** `invocacao_fechada` e, em `SessionStart`, `invocacao_abandonada`, com `invocacao`, `instancia`, `estado_invocacao`, `modelos_observados` e `fora_da_politica`.
- **A integridade final se liga à invocação:** `integridade_final_verificada` ganha `instancia`, a mesma conta do fechamento.
- **Piso do Claude Code: 2.1.310**, a versão em que o fluxo foi provado. Esta versão não usa `onFailure`, mas a recusa vai usar, e a 2.1.269 e a 2.1.287 o ignoraram. Abaixo do piso, o `init` instala o resto e avisa, e o `doctor` acusa `claude-abaixo-do-piso`. Com a política ativa e sem o hook, `envelope-nao-instalado`.
- **Provado com o binário real:** `expx init` com política, `claude` 2.1.310 chamando `qa`, que rodou em primeiro plano sem `permissionDecision`, e agente não gerenciado sem envelope.
- **Ficam para depois:** a recusa do veredito, que depende de observar uso real e de ligar `veredito_emitido` à invocação; `expx resolucao` e as camadas 6 e 7; o nível `isolado`, com o regime de transição mantido. O que falta para recusar está em CONTRATO-expx-orquestracao §13.5.

## 0.12.20 — o fechamento da runx no mundo real

O Conselhos exercitou o `gh` real na 0.12.19 (conselhos#236) e achou três defeitos do script novo, reproduzidos antes de corrigir.

- Certifica a MergeX em AxisGov/mergex@b5d9e65 (mergex#70, DM-307):
  - **`branch_base: origin/main`** é forma real no E0 e dava rc 6, com a mensagem falsa de que o PR não era da entrega. Agora vale nome, ref do remoto ou SHA, que precisa estar na base do PR.
  - **Dois E5 ao mesmo tempo:** o perdedor apagava a marca do vencedor, e a retomada falhava. Agora ele não mexe nela.
- Certifica a runx em AxisGov/runx@cdc6034 (runx#14, DR-95): o Passo 0 do E5 parte da raiz do repositório. De uma subpasta, dava rc 127.
- **A CLI do CodeAnt varia entre rodadas.** Medido na 0.5.14, no mesmo commit, sem `[error]` nem `403` no stderr: 3 arquivos deram 2, 2 e 3 achados, e 13 arquivos deram 0 e 2. Dos 9 achados, só um apareceu em duas rodadas. Zero achado não é prova de ausência de defeito, e o contrato de revisão passa a dizer isso com esses números. A causa não foi determinada, e o método não passa a exigir várias rodadas.

## 0.12.19 — o fechamento da runx depois do merge

A primeira runx do Conselhos (OC-2026-0001) fechou por um PR aberto à mão, porque o método não dizia o caminho.

- Certifica a MergeX em AxisGov/mergex@4f9e5cd (mergex#69, DM-306):
  - **`fechamento-pos-merge.sh`.** Prova o merge no serviço e confere se o PR é o desta entrega: URL, branch, base, remoto e commit de merge na base. Só então cria `docs/<OC-ID>-fechamento`, sem rastrear, em worktree próprio. Sem a prova, não cria nada, e o rc diz por quê.
  - **`arquivo-fora-do-plano`.** Nessa branch, com a marca do script e os trailers `Fechamento-de:` e `Merge:` batendo com a entrega, isenta só `ORQUESTRADOR.md`, `tecnico.md`, `uso.md` e `docs/relatorios/INDICE.md`. O resto é desvio, mesmo declarado numa task.
  - **`ENTREGA.md`, validade, catálogo, pre-push e CI não mudam.** `pr_estado` segue com o E9 ou com uma pessoa.
- Certifica a runx em AxisGov/runx@360cdd1 (runx#13, DR-94): o E5 começa pela prova. Com o PR aberto, a ocorrência não fecha. Nos outros erros, o E5 para, e fechar sem a prova é decisão da pessoa. Projeto sem entrega da MergeX segue como antes.
- Certifica a SprintX em AxisGov/sprintx@6bd79ef (sprintx#64, DS-200), e na runx também: o caminho do worktree reparado é gravado relativo ao checkout principal.
- **Limite assumido:** fora do harness, ou com o hook em aviso, alguém pode abrir o mesmo PR sem o script, e o CI não barra. Quem revisa vê a falta dos trailers. O `gh` real ainda não foi exercitado: a bancada usa um falso, com Git real.

## 0.12.18 — duas regressões da 0.12.17

Relatadas no conselhos#230 e reproduzidas antes de corrigir.

- **O `revisar` podia apagar arquivo de outra pessoa.** A limpeza da 0.12.17 removia com `--force` um worktree alheio em `<tmp>/expx-revisao-snapshot-*/checkout`, sem `dono` e com mais de uma hora, e o arquivo não commitado se perdia. Agora o `dono` com PID válido é a prova de que o snapshot é do script, e sem ele nada é tocado, em nenhuma idade. Errata da 0.12.17: "o sem dono com mais de uma hora" deixa de valer. Sobra de versão até a 0.12.16 fica registrada até remoção manual.
- Certifica a SprintX em AxisGov/sprintx@1c40d0c (sprintx#63, DS-199) e a runx em AxisGov/runx@fa78efe (runx#12, DR-93):
  - **Worktree movido inutilizado.** `prunable` também marca worktree movido, e o `git worktree remove` que a 0.12.17 mandava rodar deixava a pasta sem repositório, sem conserto por `git worktree repair`. A F1 e o E1 param e perguntam: pasta movida, `git worktree repair <novo caminho>`, e esse caminho é o gravado; pasta apagada, `git worktree remove <caminho>`.
  - **Só na SprintX:** a sessão que já está no worktree segue para o scaffold, em vez de encerrar a F1 de novo. Não foi medido no OpenCode.
- Certifica a MergeX em AxisGov/mergex@b485623 (mergex#68, DM-305):
  - **`git clean` que não barrava.** `git --config-env=clean.requireForce=F clean`, a forma grudada, passava. A forma com a palavra separada já barrava.
  - **Aspa escapada no frontmatter.** `branch: "a\"b" # nota` mantinha o comentário no valor. As três leituras devolvem `a"b`. Só `\"` e `''` se desfazem: o leitor não é YAML completo.
- **Teste:** o caso do snapshot de processo morto deixa de depender de o Windows não reusar o PID (expxdev#125). Ele reprovou uma vez no CI do merge da 0.12.17 e passou na repetição do job.
- **Adiado:** o fechamento da runx depois do merge passa para a próxima versão.

## 0.12.17 — registro perdido, git clean e worktree

Achados do CodeAnt nos conselhos#227 e #229, reproduzidos antes de corrigir.

- Certifica a MergeX em AxisGov/mergex@c5e72ae (mergex#67, DM-301 a DM-304):
  - **Registro perdido em silêncio.** `commits: [] ` com espaço no fim fazia `--acrescentar` imprimir `seq=1` com rc 0, e o item não entrava. `commits: # lista` com itens em bloco dava rc 1. As duas formas valem agora, e antes de gravar o script prova que o item entrou; senão, rc 1, com o arquivo intacto.
  - **`git clean` que não barrava.** Expansão como `$flags`, subcomando entre aspas, `-C` com espaço no caminho e `git clean` puro com `clean.requireForce` falso, no comando ou no repositório-alvo. A continuação de linha some antes da leitura, em todas as regras do `git-perigoso`, o que fecha também a do `checkout`; `\\` antes da quebra continua separando comandos.
  - **A prévia do `git clean`** é do repositório que o comando limpa. Com expansão no alvo, `--git-dir`, `--work-tree`, `cd` ou dois alvos, a mensagem diz que não há prévia.
  - **Remoção do `RECONCILIACAO-BASE-NNN.md` pelo merge.** Passava pelo inventário com rc 0, e agora dá rc 4.
  - **Comentário de YAML depois do valor.** `trabalho_id: OC-2026-0001 # nota` dava rc 1, porque o comentário ficava no valor. Sai nos dois leitores do frontmatter e no de `branch:` do portão. Entre aspas, `#` é valor.
- Certifica a SprintX em AxisGov/sprintx@209306b (sprintx#62, DS-198) e a runx em AxisGov/runx@4dd006a (runx#11, DR-92):
  - **O worktree nasce irmão do checkout principal.** De uma subpasta, ele nascia dentro do checkout; de outro worktree, ao lado dele.
  - **Registro de worktree sem pasta.** A branch ainda aparecia na lista, e a instrução mandava retomar nela. `git worktree remove <caminho>` tira só esse registro; `git worktree prune` não serve, porque tira também o de worktree movido.
- **O `revisar` remove o snapshot de um processo morto.** `SIGKILL` ou queda da máquina pulavam a limpeza, e o worktree em `/tmp` ficava registrado, segurando o commit. A revisão seguinte remove o de processo morto, o sem dono com mais de uma hora e qualquer um com mais de um dia.
- **O contrato de revisão** registra a rota do HTTP 403, tente o login uma vez e, persistindo, é conta ou serviço, e a regra de mudança de modo: religue `obrigatoria` entre trabalhos, porque a evidência precisa estar no commit da task e rodar `revisar` depois não a cria.
- **Limite assumido:** `GIT_CONFIG_*` no ambiente, `xargs` e alias não são lidos pelo `git-perigoso`. O fechamento da runx depois do merge segue sem caminho oficial e fica para a próxima versão, porque precisa de mudança executável na MergeX.

## 0.12.16 — a runx ao lado da SprintX

Achados da primeira ocorrência da runx num projeto com a SprintX (Conselhos, OC-2026-0001).

- Certifica a SprintX em AxisGov/sprintx@2c89012 (sprintx#61, DS-196 e DS-197):
  - **O plano da ocorrência é da runx.** Depois que o `tasks.md` de `docs/manutencao/OC-*` ficava `em_andamento`, o `escopo-da-task` dava `sessao_ambigua` em tudo, inclusive no próprio plano, e nenhum escritor resolvia. Ele sai do porteiro, e a linha de rastro com `ferramenta: runx` não conta como reivindicação da SprintX. Com feature aberta na mesma árvore, a sessão sem reivindicação continua barrada, pela regra de um escritor por árvore.
- Certifica a runx em AxisGov/runx@6a31b9f (runx#10, DR-88 a DR-91):
  - **Os comandos das referências valem pelo `expx init`.** Eles só citavam `.claude/runx-hooks/`, o destino do `install.sh`. Agora usam esse caminho se a biblioteca está lá, e senão `.claude/hooks/`. `./install.sh --opencode` e a instalação global continuam sem os hooks nos dois caminhos, e o comando manual falha nelas, como já falhava.
  - **Os hooks não deixam `.pyc`.** O `__pycache__` na árvore versionada parava o `fechamento-do-e1` da MergeX com rc 10.
  - **`diagrama_nao_gerado` e `diagrama_nao_atualizado`.** A DR-55 os criou, e o `rastro.py` recusava os dois com rc 2. Entram no contrato `expx-eventos`, no docs-site e no painel.
- Certifica a MergeX em AxisGov/mergex@0e0bf27 (mergex#66, DM-299 e DM-300):
  - **O id curto da ocorrência.** O schema da runx exige `trabalho_id: OC-AAAA-NNNN`, e a MergeX comparava com `<OC-ID>-<slug>`: o `persistir-metodo` parava, e o E3 mandava todos os artefatos a olho humano. Dentro de `docs/manutencao/`, o id exato agora vale, e o completo segue aceito. O `ENTREGA.md` só vale com o completo.
- **A branch nasce sem rastrear a base.** O E1 da runx, a F1 da SprintX e o E0 da MergeX usam `--no-track`: a branch criada de `origin/main` rastreava a `main`, e um `git push` sem argumentos sob `push.default=upstream` ia direto para ela.
- Teste com a SprintX e a runx instaladas juntas pelo `init` real: o fluxo da ocorrência passa, e o que protege a feature continua valendo.
- **Limites assumidos:** trocar o status do plano por shell desliga o `escopo-da-task`, que não vê escrita por shell. O fechamento da runx depois do merge ainda não tem caminho oficial na MergeX, e fica para a próxima versão.

## 0.12.15 — os achados do Conselhos

- Certifica a MergeX em AxisGov/mergex@6e01fc9 (mergex#65, DM-291 a DM-298):
  - **A evidência de revisão na reconciliação de base (DM-291).** O inventário reprovava `docs/entregas/<trabalho>/revisao/<T-NN.MM>.json`, que o E1 commita na feature, e travava a entrega. Agora aceita esse arquivo, deste trabalho, na forma do E1 e como arquivo comum. Temporário, subpasta, link, remoção pelo merge e evidência de outro trabalho seguem reprovados.
  - **O que o servidor já tem não barra o push (DM-293).** Em `por_sprint`, depois de `merge --ff-only main` na feature, um push limpo barrava em um merge que já está no remoto, e o limite de 300 commits fazia o mesmo. Achado ou limite agora consultam o `ls-remote` e recalculam o intervalo uma vez. Se a consulta falhar, o achado e o limite ficam.
  - **Link não desce de faixa (DM-294).** Corrige regressões da DM-288: área atrás de pasta que é link, `base/` que é link e `00-INDICE.md` que é link voltam a pedir olho humano ou a barrar o catálogo. Pasta `sprint-NN` com quebra de linha é ignorada.
  - **A mensagem não se autentica sozinha (DM-295).** Sem trabalho pela branch, o trailer `Trabalho:` só vale com um `ENTREGA.md` real desse trabalho e da branch ativa.
  - **`commits: [] # comentário` (DM-296).** Vale na leitura e na escrita, e a recusa do `--acrescentar` passa a dizer o motivo.
  - **`git clean` (DM-296 e DM-298).** Cada `git clean` do comando é lido por si: `--force`, `-i` e `git -C <dir> clean` passam a barrar, `-n` prevalece, aspas não escondem opção, e a prévia considera `-x` e `-X`.
  - **`senha = ********` continua sem acusação (DM-296).** É decisão: asteriscos e interrogações sozinhos são máscara. Limite assumido: uma senha real feita só desses caracteres passa.
  - **Mutação com teto, no desenvolvimento da MergeX (DM-292).** As bancadas disparavam até 60 mutantes de uma vez e deixavam cópias no `/tmp`. Agora são no máximo quatro ao mesmo tempo, e tudo é removido no fim. Nada muda em quem instala.
- Certifica a SprintX em AxisGov/sprintx@d5acea7 (sprintx#60, DS-195):
  - **O plano é o bloco `tasks:` do frontmatter.** Um id que só aparecia em exemplo depois do frontmatter era aceito por `rastro.sh task-iniciada` e por mais três leitores, e o `escopo-da-task` deixava quem o reivindicasse editar qualquer arquivo. Plano sem frontmatter continua lido por inteiro, como legado.
  - **Task e slug com quebra de linha** são recusados em `bloqueios.sh registrar`.
- **O SessionStart usa as tags do remoto.** Uma tag local `v9.9.9` na ponta da `main` fazia a sincronização escolher a ponta em vez da última release. O `fetch` do cache agora poda e atualiza as tags pelo remoto.
- **Rejector que falha não vira revisão limpa.** Com `[error] Rejector failed` no stderr (visto com HTTP 413 no Conselhos), a CLI devolvia JSON limpo e saída 0 sem as sugestões do lote, e o `revisar` gravava `ok`. Agora qualquer `[error]` no stderr e o `Warning: parsing error in rejector` dão `incompleta:lote-falhou`. O `[warning]` do Risk planner segue sem barrar, porque não perde achado. Evidência gravada antes desta versão não guarda o stderr, então não dá para reavaliá-la. **Limite assumido:** o `ok` com zero achado atesta que a chamada terminou sem erro visível, não que falta defeito. Turno da API encerrado sem `output` e sem erro não é detectável com a CLI 0.5.14. No Conselhos, dois achados de lotes menores sumiram na chamada maior sem nenhum `[error]`, e a causa não está determinada; o contrato registra isso.
- **Errata da 0.12.14:** a entrada sobre o consumidor precoce diz "acima de 64 KB". Não há tamanho seguro: a falha é intermitente e mais provável com saída maior. O Conselhos a viu a partir de 8 KB no WSL2, e `cat` chegou a falhar com 2 KB em máquina sob carga. A correção não muda, e os comentários e as decisões foram corrigidos na origem (DM-297 e DS-195).

## 0.12.14 — a MergeX: dispensa, worktrees e pipefail

- Certifica a MergeX em AxisGov/mergex@7209397:
  - **Dispensa por hash no `sem-segredo` (mergex#63, DM-289).** Refaz a DM-286, revertida na DM-287. O arquivo do framework cujo blob bate com o lock não é varrido, e o commit que instala uma versão nova deixa de pedir a exceção manual do README. O custo é constante: 8 processos com 1 ou 300 arquivos, cerca de 2 s no Windows. Prazo de 4 s para o evento inteiro. Sem `perl`, fora do prazo ou em qualquer falha, a varredura completa roda.
  - **Worktrees entregues (mergex#64, DM-290).** `worktrees-entregues.sh` lista cada worktree com estado e motivo e remove a entregue, sem forçar, mantendo a branch. O E9 o chama depois do merge. Rastro ignorado bloqueia, e o descarte é humano. Exige Git 2.36.
  - **Consumidor precoce sob `pipefail` (mergex#62).** 56 pipelines dos scripts instalados deixam de inverter a decisão acima de 64 KB, e o lint da SprintX entra no CI. Corrige também a mensagem de integração com linha em maiúsculas no heredoc, que perdia os trailers.
- Certifica a SprintX em AxisGov/sprintx@d80c96f (sprintx#59, DS-194): a Regra 21 passa a dizer que a worktree sai pela MergeX.
- Teste de composição da SprintX com a runx em projeto temporário (expxdev#120), no lugar de instalar as duas neste repositório.

## 0.12.13 — a ProdX

- Certifica a ProdX em AxisGov/prodx@06ce57a (AxisGov/prodx#2). A máquina de estados previa o briefing só para `fazer`, embora `fazer_outra_coisa` também o gere, e o fluxo ficava sem próximo passo. O painel da triagem apontava as linhas erradas: utilidade é a quarta linha, e atrito é a terceira.
- A soma do `dist/` lê só arquivo comum: um FIFO ali travaria o SessionStart (CodeAnt no expxdev#119).

## 0.12.12 — a trava do SessionStart e o lembrete

- **A trava do cache do SessionStart sem corrida.** Dois processos podiam ver a mesma trava velha, e um apagava a que o outro acabava de criar. A trava agora nasce inteira, com o dono dentro, e só quem detém `<trava>.recuperacao` remove uma trava velha. Dono vivo nunca perde a trava por idade, e só um processo limpa uma recuperação abandonada.
- **O marcador do build atesta o `dist/`.** `.axis-build-sha` guarda o commit e a soma do `dist/`, que o Git não versiona: `dist/` alterado com o mesmo commit reconstrói o cache. O cache de versões anteriores reconstrói uma vez.
- **O lock é conferido antes de cache e rede.** O hook passa a exigir os campos obrigatórios do esquema (`lock_version`, `cli_version`, `harness`, e `repositorio`, `referencia`, `travado`, `resolvido_em` e `arquivos` de cada skill). Lock fora de forma adia a sincronização sem tocar em cache nem rede.
- **O lembrete descarta carimbo do futuro.** Com o relógio avançado e depois atrasado, um registro ficava além do limite de 24 horas ou 7 dias e suprimia o lembrete. Carimbos até 60 s à frente continuam valendo, para não duplicar o aviso entre processos simultâneos.
- **Limite assumido:** um hook de antes da 0.12.12 parado entre o `mkdir` e a gravação do dono ainda pode dividir a trava com o novo. O pior caso é um build repetido ou que falha no cache, que se reconstrói na sessão seguinte.

## 0.12.11 — o repositório-fonte fora da atualização automática

- **O repositório-fonte do CLI não se atualiza nem troca o plugin global.** O SessionStart rodaria `update --yes` no expxdev a cada release e sujaria a `main`, e o `init` e o `update` trocariam o `expx-local` do escopo do usuário, que é único, por um marketplace com menos skills, afetando todas as sessões da máquina. Na raiz cujo `package.json` tem `name: expxdev` e `repository` em AxisGov/expxdev, o hook sai sem fazer nada e o registro não roda. O `expx update` explícito continua funcionando. Projetos consumidores não mudam.
- O próprio expxdev atualiza a prodx instalada, que estava em `ed7c734` com lock da 0.5.3, para o commit certificado. A sprintx e a runx ficam fora do lock daqui: a instalação delas passa de 100 arquivos e pede vários PRs.
- `session-freeze.test.ts` compara o comando, não o caminho temporário: o termo `npm` casou com a pasta sorteada e derrubou o Ubuntu no CI do merge da 0.12.10.

## 0.12.10 — o commit certificado e os achados do Login e do conselhos

- **O commit certificado de cada skill.** Até a 0.12.9, o `init` e o `update` instalavam a maior tag da skill e, sem tag (nenhuma das nove tem), o topo da `main` dela. O katosmv/login recebeu na 0.12.8 o conteúdo da 0.12.9, com o lock dizendo 0.12.8, e a DM-286 da MergeX chegou a projetos antes de qualquer release do expxdev. Agora o catálogo grava, em `certificado`, o commit de cada skill que a versão do CLI certifica, e da origem canônica é esse commit que se instala. Um merge na `main` de uma skill só chega aos projetos pela próxima release do expxdev.
  - O `update` decide pelo commit. Já no certificado, com lock de antes dele, regrava só o lock ("normalizacao pendente"); adiante do certificado, **recua** para ele e diz quantas mudanças desfaz. `--to <ref>` continua saindo do certificado de propósito.
  - A pasta local (`EXPX_SKILLS_LOCAIS`) e a origem customizada seguem como antes: maior tag ou, sem tag, a branch padrão.
  - O SessionStart (`expx-session-sync`) roda o CLI da **última release** do expxdev, e não a ponta da `main`, com `update --yes`. O `--latest`, que já não mudava nada, continua aceito: os hooks instalados antes seguem o catálogo.
  - A preparação da release confere que cada certificado é ancestral da `main` da skill (`scripts/ci/test-certificados.sh`) e que o `init` instala exatamente esses commits.
  - O `doctor` passa a dizer, para a skill fora do certificado, que um `expx update` a leva ao commit certificado.
- Certifica a SprintX em AxisGov/sprintx@46cbb60 (AxisGov/sprintx#58, **DS-193**), com os achados do CodeAnt no katosmv/login#41 e no katosmv/conselhos-municipais#217. Todos já existiam antes. Onde a regra recusava coisa legítima, ela foi afrouxada com segurança, sem validação nova:
  - `arvore-limpa-antes-da-suite` compara o caminho declarado com `grep -qxF --`: o caminho que começa com `-` deixa de virar opção.
  - `bloqueios.sh registrar` aceita `T-100.01`, como o plano.
  - No item 10 da auditoria, `L1Cache` e `L1Árvore` numa `[granularidade]` não são o limite L1. O `L1` solto continua recusado, também colado a símbolo (`L1—acima`, `L1×acima`).
  - A cláusula `base/<arquivo>` aceita espaço e acento. Continuam recusados `|`, `\`, controle e segmento `..`.
  - `SPRINTX_RAIZ` relativa que começa com `-` funciona nos quatro leitores.
- Certifica a MergeX em AxisGov/mergex@2f72aee (AxisGov/mergex#61, **DM-288**):
  - A credencial em URL com **usuário vazio** passa a ser acusada (CodeAnt no katosmv/login#41). A senha com menos de quatro caracteres continua fora: falso negativo assumido, contra placeholder curto.
  - A área da base pode estar numa **subpasta** de `base/`, no catálogo de método e no E3 (katosmv/conselhos-municipais#216). Continuam fora caminho absoluto, `\`, segmento vazio, `.`, `..` e link simbólico.

## 0.12.9 — a SprintX sob pipefail e o limite de migração

- Certifica a SprintX em AxisGov/sprintx@e3852dc (AxisGov/sprintx#57, **DS-192**). Corrige o "task não está no plano" que o katosmv/login encontrou na 0.12.7. Sob `pipefail`, um consumidor que decide cedo (`grep -q`, `head`) fechava o pipe enquanto o produtor ainda escrevia; acima de 64 KB o produtor levava SIGPIPE (141) e o pipeline falhava, ao contrário do que o consumidor tinha achado. Os scripts e hooks da SprintX passam a usar here-string, `case`, a ferramenta lendo o arquivo direto e `awk 'NR <= n'` no lugar de `head`. No repositório da SprintX, um lint no CI recusa o padrão de volta, com o alcance declarado na DS-192.
- Certifica a MergeX em AxisGov/mergex@307c938 (AxisGov/mergex#60): a mesma árvore da 0.12.8, mais o registro da DM-287.
- **Limite de migração registrado:** o commit que instala uma versão nova é julgado pelo `sem-segredo` da versão antiga, ainda instalado. Da 0.12.5 para a 0.12.8, no katosmv/conselhos-municipais, ele acusou 38 valores em arquivos do próprio framework, que a tabela nova não acusa. O README descreve a exceção estrita: depois de `git add -A`, conferir que o `git diff` está vazio (o índice é o disco conferido), que só os arquivos do `expx update` mudaram, que o `expx doctor` não acusa divergência com o hash do lock e que a tabela nova não acusa nada; então fazer o commit à mão, fora do agente, sem mexer em `.expx/hooks.json` e sem `git push --no-verify`, porque o `pre-push` da versão nova continua varrendo o que o push publica. A dispensa dos arquivos que o lock confere por hash entrou na MergeX (AxisGov/mergex#58, DM-286) e foi revertida antes de qualquer release do expxdev (AxisGov/mergex#60, DM-287): o helper abria cerca de dez processos por arquivo, e num commit com 266 arquivos do framework o `sem-segredo` passava de 3 s para 11 s, acima do timeout de 10 s do hook. Hook morto por timeout não bloqueia, então o commit passaria sem varredura. Até um redesenho com orçamento de tempo, a migração segue a exceção do README.

## 0.12.8 — os achados de segredo do conselhos #211

- Certifica a MergeX em AxisGov/mergex@26df2d0 (AxisGov/mergex#57, **DM-285**), com os achados do CodeAnt na instalação da 0.12.5 no katosmv/conselhos-municipais#211 que seguiam abertos na 0.12.7:
  - **A1 e A5 (regressão da 0.12.5):** na senha de URL, só o valor inteiro é placeholder. Uma senha real seguida de `:placeholder` ou `=placeholder` passava. A senha vai até o último `@` antes do host, e `changeme@` seguido da senha real também barra.
  - **A2:** o valor sem aspa aceita `:` depois do primeiro caractere, e `password=ab:` seguido de uma senha barra. Também barra a senha que começa com `:` depois de `=` ou de `:` com espaço.
  - **A4:** o pre-push lê cada commit no Git uma vez por push. Antes, com achado, a segunda fase relia tudo, chegando a cerca de 1.800 processos em 300 commits.
- **Falsos positivos assumidos** com o `:` no valor, registrados na DM-285 e testados:
  - uma URL como valor da chave;
  - a chave Redis com `secret:` no meio;
  - o exemplo YAML com dois-pontos no valor;
  - a hora como valor da senha;
  - a atribuição em Rust, C++ e PHP com `A::B` seguida de `,` ou `;`.
  O caminho `Token::Nome` solto continua fora. Se a varredura acusar um valor que não é credencial, troque-o por um placeholder inteiro (`<senha>`, `${VAR}`) em vez de desligar o hook.

## 0.12.7 — achados da instalação da 0.12.6 no Login e a integridade final dos aprovadores

- **Achados do katosmv/login#34:** o CodeAnt e o CodeRabbit revisaram a instalação da 0.12.6 no Login. Dos 25 achados, 19 procedem e entram aqui; os 6 que não procedem foram reproduzidos e respondidos lá.
- Certifica a MergeX em AxisGov/mergex@ae256a8 (AxisGov/mergex#56, **DM-284**):
  - **Regra de credencial mais larga:** entre aspas duplas, simples ou tipográficas (`“”`, `‘’`), o valor vai até a aspa de fechamento, e a vírgula deixa de cortar a senha. A regra também acusa a aspa aberta e não fechada, a chave entre aspas (JSON) e o literal entre aspas seguido de `(`. A substituição de comando (`$(...)`, crase) só é referência quando é o valor inteiro: senha colada depois dela barra.
  - **Portão do pre-push:** a identidade do ambiente Git inclui o git-dir, e o `GIT_DIR` de uma worktree irmã deixa de passar. Em branch nova acima do limite de 300 commits, a dica de `git fetch` só aparece quando falta localmente alguma ref do servidor. Ela nunca repete uma URL de remoto.
  - **E7:** só a falha "already exists" do `gh pr create` recupera o PR existente; outra falha sai com o código e o erro literal do `gh`.
  - **E9 e E10:** o PR atual é a `pr_url` na entrega por trabalho e a `atual_url` do item na entrega por sprint.
- Certifica a SprintX em AxisGov/sprintx@69c0d23:
  - **H10 (AxisGov/sprintx#55, DS-190):** os escritores próprios da SprintX gravam `model` e `effort` só como executor observado, como o escritor comum. Sem observação, `null`, nunca o frontmatter. A exceção transitória sai do `CONTRATO-expx-eventos` e do `CONTRATO-expx-orquestracao` §11.1.
  - **Auditoria da F5 (AxisGov/sprintx#56, DS-191):** na migração legada, a linha fora das quatro colunas recusa a auditoria. Todo achado do item 10 declara `[limite:Ln]` ou `[granularidade]`; sem marcador, a F5 recusa. O número do item não aceita zero à esquerda. A tabela lê `\\|` como barra literal seguida do delimitador.
- BuildX (AxisGov/buildx#16, **D-25**):
  - **Seed de demonstração:** só roda com o argumento explícito `--demonstracao`, que nenhum `.env` carrega, e nunca com `NODE_ENV=production`. Antes, rodada de um shell sem `NODE_ENV` contra o banco de produção, criava o admin de demonstração com senha pública.
  - O briefing do B4 normaliza o mapa anterior à D-23. A premissa criada no degrau 4 da F2 entra em `premissas_realizadas`. `consulta_modulex` é o 12º campo do contrato da feature.
- **Integridade final dos agentes de aprovação (F3c, expxdev#104):**
  - O `init` instala o hook do núcleo `expx-integridade-final.sh`, registrado no `SubagentStart` e no `SubagentStop`, com a biblioteca do rastro ao lado (CONTRATO-expx-orquestracao §12). No início de um agente de aprovação — `revisor-diff`, `qa` e `runx-revisor-testes`, lista transitória até a F4 —, ele fotografa a árvore: o `HEAD`, os bytes do `git status --porcelain -z --untracked-files=all` e o tree id da árvore inteira, montado num índice temporário, que cobre também o conteúdo de arquivo não rastreado. No fim, compara as três partes e grava o evento novo `integridade_final_verificada`, com a extra `integridade_final` (`igual`, `divergente` ou `ausente`). A foto mora no git-dir da worktree, nunca na árvore de trabalho, e o índice real não é tocado.
  - `divergente` e `ausente` invalidam o veredito do aprovador: o evento sai `falha`, o painel o destaca e o `doctor` avisa `integridade-final-invalida`. A recusa operacional do veredito depende do envelope da invocação e entra na F3b. É o nível fraco da separação de papéis: não pega editar e reverter, nem arquivo ignorado alterado.
  - O `doctor` ganha também `rastro-nao-ignorado`: com a integridade instalada, `docs/eventos/` fora do `.gitignore` faz a verificação dar `divergente` sem o aprovador ter tocado em nada.
  - O contrato de eventos corrige quem grava `agente_concluido` (o hook `SubagentStop` da SprintX) e marca `agente_iniciado` como reservado: nenhum escritor o grava.
- **Para quem tem a 0.12.6 instalada:** a regra de credencial ficou mais larga e pode acusar texto que antes passava. Se a varredura acusar um valor que não é credencial, troque-o por um placeholder inteiro (`<senha>`, `${VAR}`) em vez de desligar o hook.

## 0.12.6 — a distribuição passa pela varredura de segredo que ela instala

- **Bloqueio da 0.12.5:** a varredura de segredo do pre-push da MergeX barrava o push do commit que instalava a própria 0.12.5 (relato do katosmv/login). As causas eram três:
  - exemplos fictícios de credencial no texto da MergeX;
  - a suíte de teste dos hooks instalada no projeto;
  - a regra de credencial acusava referência de código. Isso pegava o template da BuildX, e um projeto novo seria barrado já no primeiro push.
- Certifica a MergeX em AxisGov/mergex@bef93f0 (AxisGov/mergex#55):
  - **DM-282:** os exemplos do texto distribuído viram placeholders inteiros, e a instalação manual do README deixa de copiar a suíte dos hooks;
  - **DM-283:** na credencial em atribuição, valor sem aspas que é só identificador ou cadeia `a.b.c` sem dígito, seguido de `,` `;` `)` ou `}`, é referência de código (`senha: SENHA_PADRAO,`, `password: process.env.DB_PASS)`), não credencial. No fim da linha (YAML, `.env`), entre aspas, com dígito ou símbolo, continua barrando. Falso negativo assumido: `password: SuperSecret,`.
- BuildX (AxisGov/buildx#15):
  - o template distribuído usa senhas de teste nomeadas;
  - as dependências do template passam a não ter vulnerabilidade alta: prisma 7.10.1, vitest 4.1.12, next 16.4.3, zod 4.6.7.
- O `init` deixa de instalar a suíte de teste dos hooks (`hooks/teste.sh` e `hooks/testes/`) de cada skill, em `.claude/hooks` e no plugin.
- **Mudança no `update`:** o que a instalação anterior gravou em `.claude/hooks/`, `.claude/agents/` e `.claude/skills/<skill do catálogo>/` e saiu do plano é removido, não só o que está em `.claude/agents`, desde que o arquivo esteja como o lock o gravou. Alterado à mão, fica e vira aviso. Fora dessas pastas (`settings.json`, comando ou skill da pessoa), nada é removido, nem com o hash certo no lock. Caminho do lock com segmento que algum sistema reescreve (vazio, `.`, `..`, `\`, `:`, ponto ou espaço no fim, nome de dispositivo do Windows) ou com link simbólico no percurso nunca é removido: o lock é do projeto e pode ter sido editado.
- Um teste offline e um portão na release (`scripts/ci/test-distribuicao-sem-segredo.sh`) rodam o `init` real e varrem inteiro cada arquivo instalado com a tabela da MergeX. O portão roda as nove skills no `main`. Release com achado não sai.
- **Para quem tem a 0.12.5 instalada com um commit ainda não publicado:** a 0.12.6 sozinha não libera esse commit, porque o pre-push varre todos os commits que o remoto não tem. Refaça a instalação a partir da `main`, sem `--no-verify` e sem mudar o modo do hook.

## 0.12.5 — achados do conselhos #208 e #210, registro do plugin numa worktree e executor observado

- Certifica a MergeX em AxisGov/mergex@6fb4ada (AxisGov/mergex#54), com os achados do CodeAnt nas instalações da 0.12.2 e da 0.12.4 (katosmv/conselhos-municipais#208 e #210, katosmv/login#30):
  - **Varredura de segredo no `pre-push` (P3):** o `portao-push.sh` varre o que o push publica — mensagens e linhas adicionadas dos commits que o servidor ainda não tem —, com a mesma tabela do hook `sem-segredo`, agora em `scripts/segredo-tabela.sh`. Numa branch nova, o que o servidor já tem é consultado com `ls-remote`; a ref de rastreio local não conta. Se a consulta falhar, o push é barrado.
  - **Hook `sem-segredo`** (DM-273 a DM-278 e DM-281):
    - varre a mensagem passada por arquivo (`-F`);
    - varre os arquivos não rastreados de `git add … && git commit` e os ignorados de `git add -f`;
    - varre o repositório que o comando realmente atinge (`git -C`, `cd <dir> &&`);
    - deixa de ser enganado por `diff.external`, `textconv` ou atributo `-diff`;
    - barra a troca de repositório, árvore ou índice por opção ou variável;
    - julga o placeholder da URL só pela senha e só quando ele é o valor inteiro.
  - **Portão V12:** comparado sem `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR` e `GIT_INDEX_FILE` (P1).
  - **E9:** lê a URL do PR da sprint atual na entrega por sprint (M10).
  - **E7:** confere `head` e `destino` na mesma shell e mascara a credencial da URL do remoto (P2, P6).
  - **E3:** reconhece `00-PLANEJAMENTO.md`, `00-PREDECESSORES.md`, `PREFLIGHT.md` e `RECONCILIACAO-BASE-NNN.md` como artefatos de método (DM-280).
  - **Comportamento novo:** no modo `bloqueio`, o primeiro push para um remoto vazio com mais de 300 commits é barrado. As saídas são dividir a publicação ou desligar o `sem-segredo` de forma consciente.
- Certifica a SprintX em AxisGov/sprintx@60d9cad:
  - **AxisGov/sprintx#54:** a F3 e a F5 seguem o `expx-fatiamento` v3 — sem teto de linhas; L1 de 40 arquivos por task, L2 de 5.000 linhas e 204.800 bytes por arquivo, L3 de 100 arquivos por PR. A auditoria feita sem o agente também confere o item 10. O achado de limite leva `[item 10][limite:Ln]`, é sempre ALTA, e o `planejamento.sh` recusa o relatório que não seguir isso (DS-189). `docs/eventos/` não entra na conta.
  - **AxisGov/sprintx#53:** a espera da trava da bancada ganha prazo (M7), o limiar do `07-estimativa` passa a ser conferido (M14), e as sub-bancadas ganham a guarda do `$SK`.
- Skills que o `init` e o `update` trazem pela ponta da `main`:
  - **MemoX** (AxisGov/MemoX#3, #4 e #5):
    - escapa o corpo do bloco injetado (M18);
    - `--raiz` explícito vale como está e recusa valor vazio (M11);
    - a coleta usa o `ignorar` da config (M12/M16);
    - lê o `sempre_incluir` (M13/M17);
    - valida a config chave a chave (M15);
    - aceita fonte cujo nome começa com `..` (DM-28).
  - **RunX** (AxisGov/runx#9):
    - confere a ocorrência antes de gravar o estado (M8);
    - aceita o término só no E5 (M9);
    - trava a rotação do rastro (M3).
  - **LegadoX** (AxisGov/legadox#4): os hooks acham o trabalho corrente nos artefatos das skills de origem, e não num `.expx/trabalho-atual.json` que ninguém gravava (M6).
  - **StackX** (AxisGov/stackx#5): a apresentação de conflito admite dois ou mais dialetos (M2).
  - **BuildX** (AxisGov/buildx#14): os candidatos a módulo viram coleção (`modulos_candidatos`, `fatias_candidatas`; D-23), o contrato do `MAPA.md` passa a onze campos, e entra o `premissas_realizadas`.
- O `init` rodado numa worktree registrava o marketplace `expx-local` no settings do usuário com o caminho absoluto da worktree: removida a worktree, o plugin deixava de carregar (`cache-miss`) e os comandos `/expx:` sumiam (relato da janela do conselhos). Agora, numa worktree, o registro aponta para o `.expx/marketplace` do checkout principal quando ele existe, com aviso; sem ele, para o da worktree, com o aviso de que quebra ao removê-la. O registro anterior é removido antes do novo, só no escopo do usuário (sem `--scope`, o `remove` apagaria também a declaração do `.claude/settings.json` do projeto), e depois do `add` o registro é conferido: se o `expx-local` não aponta para o caminho escolhido, a instalação para com erro em vez de dizer sucesso. O `update` que aplicou algo também reinstala o plugin pela mesma regra, e sai 1 quando o registro falha.

- O escritor comum do rastro grava `model` e `effort` só como executor observado (H10 de CONTRATO-expx-orquestracao): `EXPX_MODEL`/`EXPX_EFFORT` do chamador e, no Claude, `$CLAUDE_EFFORT` apenas para o principal. Deixa de completar o subagente do Claude com o frontmatter de `.claude/agents`, o que gravava configuração como execução e deixava de coincidir com `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`, `CLAUDE_CODE_EFFORT_LEVEL` ou um `fallbackModel`. Sem observação, as duas chaves saem `null`. O escritor também grava o `harness` detectado.
- Com a política de orquestração ativa, o `init` grava `.expx/orquestracao-rastro.tsv`, uma projeção plana das resoluções vigentes, e o escritor comum acrescenta à linha do subagente no Claude as chaves da resolução: `resolucao_id`, `classe_declarada`, `classe_resolvida`, `origem_classe`, `alternativa`, `origem_alternativa` e, na exceção do `agentes.json` v1, `materializado`. Sem política, nada muda. O `doctor` ganha `orquestracao-projecao-divergente`.
- O painel mostra a resolução citada como "configuração (não observada)" quando o evento não tem observação, e sinaliza inconsistência quando o registro não se lê ou é de outro agente; sem resolução, mantém o fallback para a configuração instalada, agora também para o `null`/`null` sem observação.
- O contrato de eventos declara as chaves da resolução, `invocacao`, `modelos_observados`, `fora_da_politica` e o evento `invocacao_abandonada`; os quatro últimos ficam para o envelope da invocação (F3b). Os escritores próprios da SprintX ainda completam o subagente com o frontmatter até receberem a mesma mudança.

## 0.12.4 — correções da 0.12.3

- **Errata da 0.12.3:** a DM-270 (a `branch_base` e o título do E7 por arquivo) foi anunciada como incluída, mas não entrou na release. O commit subiu depois do merge do AxisGov/mergex#52 e ficou só na branch, e o E7 instalado pela 0.12.3 ainda cola os dois valores num heredoc, com a injeção aberta. Entra agora.
- Certifica a MergeX em AxisGov/mergex@7ede971 (AxisGov/mergex#53): a DM-270; o `sem-segredo` sem os falsos positivos que barravam o commit do próprio update (placeholder composto como `sk-example-placeholder`; chamada de função como `token: randomUUID()`), varrendo só as linhas adicionadas, de modo que remover um segredo não barra mais, e cobrindo as alterações não preparadas que `git commit -a`, `-i`, `-o` e pathspec levam; o E9 do GitLab lendo o squash sem `merge_commit_sha`; e a tabela da DM-239.
- Certifica a SprintX em AxisGov/sprintx@e93681a (AxisGov/sprintx#52): as seis bancadas sem linha em branco no fim, com o `git diff --check` da árvore no CI; e `predecessores: []` provado também antes do checkpoint da F1 (`pre-checkpoint`).
- A BuildX (AxisGov/buildx#13) passa a exigir os dez campos da feature no critério de saída do B3.
- O `.claude/settings.json` do projeto passa a declarar o marketplace `expx-local` pelo caminho relativo `./.expx/marketplace`, e não pelo absoluto do checkout em que o `init` rodou. Rodado num worktree, o caminho do worktree ia para o commit e quebrava o plugin quando o worktree era removido. O Claude Code resolve o relativo contra o checkout principal do repositório, também de dentro de um worktree. O absoluto gravado antes migra no próximo `init`; o `claude plugin marketplace add` continua usando o absoluto, que vai para o settings do usuário.

## 0.12.3 — correções P1 do Login, update sem deriva e orquestração no Claude

- Atualiza o `zod` para 4.6.7 e o intervalo direto para `^4.6.7`, fechando a GHSA-mrhx-c7xc-m3w5 (alta, `zod < 4.6.6`): validar coleções restritas muito grandes podia esgotar a memória. O `zod` é dependência de execução e ia no pacote publicado.
- Estende a regressão de dependências auditadas ao `zod`, verificando todas as cópias do lockfile e o intervalo direto.
- `expx update <skill>` não move mais a versão das outras skills: as que não estão sendo atualizadas são remontadas no commit travado no lock, e não na ponta da referência (uma skill sem tag, em `main`, andava junto). O comando continua reescrevendo núcleo, hooks, agentes e `settings.json` de todas as skills: não é isolamento.
- `expx update <skill> --to <sha>` com SHA completo de 40 caracteres passa a funcionar (`git clone --branch` não aceita SHA). A busca por commit pede o objeto direto e, se o servidor recusar, cai para a busca completa; commit que não existe mais no remoto falha, sem cair para a ponta. `--to` (tag ou SHA) com origem em pasta local é recusado: a pasta é copiada como árvore de trabalho e não garante a versão pedida. Skill fora do filtro com origem local continua copiada da árvore, agora com aviso de que o commit travado não valeu.
- O `update` não sobrescreve mais modificação local de skill que ele não está atualizando: como o `init` remonta todas, uma skill modificada em qualquer ponto do lock (em dia, bloqueada ou fora do filtro) barra a aplicação inteira, que sai com erro e lista a skill — inclusive quando a única candidata é a modificada. O `init` repete a checagem já sob a trava de operação, antes de escrever.
- O `.claude/settings.json` rastreado e limpo no git não ganha mais a cópia `.backup-AAAA-MM-DD` ao lado, que acabava no commit do projeto; o `init` avisa que o desfazer é pelo versionador. Com edição pendente, não rastreado, link simbólico (o git não guarda o alvo) ou sem git, o backup continua.
- Publica o contrato `expx-orquestracao` v1 (`docs/contrato/CONTRATO-expx-orquestracao.md`): classes canônicas, o arquivo opcional `.expx/orquestracao.json`, a tabela embutida e a matriz de esforço do Claude, a precedência que nunca rebaixa a classe, a função de resolução e o formato do registro e do lock.
- Implementa a leitura e a validação da política e o resolvedor puro, com testes de propriedade sobre o domínio inteiro.
- Aplica a política no adaptador Claude quando `.expx/orquestracao.json` existe: o `init` resolve cada agente e grava o frontmatter com a alternativa, grava cada resolução no registro imutável `.expx/resolucoes/` e o id vigente na seção nova `orquestracao` do lock (`lock_version` continua 2). O `.expx/agentes.json` v1 é aplicado depois, marcado como exceção. Política inválida, classe inválida ou agente sem resolução falham antes de escrever.
- O `doctor` ganha os achados `orquestracao-*`: política inválida, registro ausente ou adulterado (erros); seção sem política, classe inferida, v1 abaixo da classe, variáveis que sobrepõem o frontmatter e `fallbackModel` fora das cadeias (avisos).
- Sem `.expx/orquestracao.json`, nada muda: agentes e lock saem byte a byte iguais. Rastro, painel e hooks de invocação seguem inalterados até as próximas fases.
- Grava o registro de resoluções com temporário `O_EXCL`/`O_NOFOLLOW` publicado por `link`: o registro nunca é sobrescrito nem seguido, inclusive quando outro escritor publica no meio (o `rename` anterior sobrescrevia), e a troca de `.expx` ou `.expx/resolucoes`, por link ou por outro diretório, que persista até a revalidação aborta antes do lock. O limite do Node (sem `openat`) fica declarado no contrato.
- Traz para o núcleo as correções P1 que o Login aplicou na cópia instalada e que nunca chegaram à distribuição: o revisor mata a CLI que não responde em 15 minutos e falha fechado (`indisponivel:tempo-esgotado`), trata como aberto o achado sem vínculo a uma linha de arquivo da task (antes era dado por anterior e ignorado) e encerra os vereditos por `process.exitCode`, sem cortar o stdout assíncrono; o lembrete aceita a base confiável do estado atrás de um link (o scratchpad sob diretório-link) sem liberar link dentro dela; e o fallback em bash do lembrete normaliza maiúscula acentuada também em `LC_ALL=C`. O `verificar-fatiamento.sh` (e a cópia `fatiamento-da-pr.sh` da MergeX) reprova pelo tamanho bruto o arquivo que já passa de L2, sem copiar nem decodificar o blob inteiro.
- Certifica a SprintX em AxisGov/sprintx@280d64e (AxisGov/sprintx#51): segredo com `github_pat_` e borda da chave Google; a base do caller na F1 chega por arquivo gravado pela ferramenta de escrita, fora do corpo do bloco, e não pode mais injetar comando (DS-188); escopo da task com o sufixo do plano inteiro; `predecessores: []` como ausência provada, aceito pelo schema e pela F1, recebendo o primeiro registro; e bancadas com assinatura de commit ligada e controle da geração do mutante 10.
- Certifica a MergeX em AxisGov/mergex@aae80ce (AxisGov/mergex#52): o placeholder não mascara segredo vizinho; a V12 lê a entrega e o modo do mesmo snapshot do HEAD; a V9 aceita `predecessores: []` com ausência provada; o E7 resolve o remoto de upstream, mede contra a base certa e abre o PR no destino, com a origem explícita; o passo 2 só abre o que o passo 1.5 mediu; e a `branch_base` e o título chegam por arquivo, fora do corpo dos blocos (DM-270).
- A BuildX (AxisGov/buildx#12) passa a citar as doze verificações do `mergex-check`; ela é instalada pela ponta da `main` e não tem candidato fixado.

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
