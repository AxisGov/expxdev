# Changelog

## Próxima versão

- **O commit certificado de cada skill.** Até a 0.12.9, o `init` e o `update` instalavam a maior tag da skill e, sem tag (nenhuma das nove tem), o topo da `main` dela. O katosmv/login recebeu na 0.12.8 o conteúdo da 0.12.9, com o lock dizendo 0.12.8, e a DM-286 da MergeX chegou a projetos antes de qualquer release do expxdev. Agora o catálogo grava, em `certificado`, o commit de cada skill que a versão do CLI certifica, e da origem canônica é esse commit que se instala. Um merge na `main` de uma skill só chega aos projetos pela próxima release do expxdev.
  - O `update` decide pelo commit. Já no certificado, com lock de antes dele, regrava só o lock ("normalizacao pendente"); adiante do certificado, **recua** para ele e diz quantas mudanças desfaz. `--to <ref>` continua saindo do certificado de propósito.
  - A pasta local (`EXPX_SKILLS_LOCAIS`) e a origem customizada seguem como antes: maior tag ou, sem tag, a branch padrão.
  - O SessionStart (`expx-session-sync`) roda o CLI da **última release** do expxdev, e não a ponta da `main`, com `update --yes`. O `--latest`, que já não mudava nada, continua aceito: os hooks instalados antes seguem o catálogo.
  - A preparação da release confere que cada certificado é ancestral da `main` da skill (`scripts/ci/test-certificados.sh`) e que o `init` instala exatamente esses commits.
  - O `doctor` passa a dizer, para a skill fora do certificado, que um `expx update` a leva ao commit certificado.

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
