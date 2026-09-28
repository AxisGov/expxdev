# Contrato `expx-instalacao` — composição multi-skill pelo `expxdev init`

Este contrato define como o `expxdev init` instala várias skills no mesmo
projeto. Ele vale para o `init`, e para o `add`, `remove` e `update`, que
remontam a instalação pelo mesmo caminho.

## 1. Quem é o dono da composição

O `expxdev init` é o **único** dono da instalação multi-skill. A instalação é
**declarativa**: o `init` lê o que cada skill publica e decide, sozinho, o que
vai para o projeto.

O fluxo é sempre:

```
BUSCAR (pasta temporária) → PLANEJAR → VALIDAR → APLICAR → TRAVAR
```

Nenhum arquivo do projeto é escrito antes de o plano inteiro estar validado.

### Fronteira com o `install.sh` das skills

Algumas skills trazem um `install.sh` na raiz do repositório. Ele é o
instalador **manual/legado de uma skill só**, e o `init` **nunca o executa**:

- ele apaga pastas inteiras que outras skills também ocupam (por exemplo
  `rm -rf .claude/agents`), destruindo o que outra skill instalou;
- a ordem em que cada `install.sh` rodasse decidiria o resultado.

O `install.sh` continua existindo no repositório da skill para quem instala
à mão uma skill isolada. Ele não é instalado no projeto e não participa do
`init`.

## 2. O plano

Cada arquivo a instalar vira um **artefato** com: skill de origem, arquivo de
origem, destino (relativo à raiz do projeto), hash sha256 e tipo (`nucleo`,
`skill`, `comando`, `hook`). `settings.json` e `.expx/hooks.json` não são
artefatos: são **entradas de composição** (seções 4 e 5).

Tudo é processado em **ordem canônica**: o núcleo (`expx`) primeiro, depois as
skills em ordem alfabética. A ordem em que as skills foram pedidas não muda o
resultado: `sprintx,mergex` e `mergex,sprintx` produzem a mesma instalação,
byte a byte, em tudo que o ExpxDev gera.

## 3. Arquivos simples — regra de colisão

| Situação | Resultado |
|---|---|
| destino exclusivo | instala |
| mesmo destino, mesmo hash | deduplica (é o mesmo arquivo) |
| mesmo destino, hash diferente | **falha antes de qualquer escrita** |
| destino que é arquivo numa skill e pasta noutra | **falha antes de qualquer escrita** |

A comparação de destino ignora maiúsculas (`README.md` e `readme.md` são o
mesmo arquivo no Windows e no macOS). A mensagem de falha mostra o destino, as
skills envolvidas e o hash e a origem de cada fonte. Não existe "a última skill
vence".

### Onde cada coisa vai (harness `claude`)

| Origem no repositório da skill | Destino no projeto |
|---|---|
| pasta do `SKILL.md` | `.claude/skills/<skill>/…` e `.expx/marketplace/plugins/expx/skills/<skill>/…` |
| `.claude/hooks/**` (árvore inteira, menos `hooks.json`) | `.claude/hooks/**` e `…/plugins/expx/hooks/**` |
| `.claude/commands/<skill>*.md` | `…/plugins/expx/commands/` (e `.opencode/commands/` com `opencode`) |
| `.claude/settings.json` | **composto** em `.claude/settings.json` |
| `.expx/hooks.json` | **composto** em `.expx/hooks.json` |

A árvore de hooks vai inteira, com a estrutura que a skill publica
(`sprintx/`, `mergex/`, `comum/`): os hooks carregam bibliotecas irmãs por
caminho relativo, e os helpers da skill (por exemplo
`.claude/skills/mergex/scripts/catalogo-de-metodo.sh`) chegam pela cópia da
pasta da skill. Não há caso especial por arquivo.

### Arquivos privados da skill

`AGENTS.md`, `README.md` e `LICENSE` da **raiz** do repositório da skill não
são instalados: não pertencem a nenhuma das origens acima. Os que ficam
**dentro** da pasta da skill vão para `.claude/skills/<skill>/`, com namespace
próprio, e não colidem. O `init` não faz merge textual de prosa e não toca o
`AGENTS.md`/`README.md`/`LICENSE` do produto. Se duas skills publicarem bytes
diferentes para o mesmo destino compartilhado (por exemplo
`.claude/hooks/README.md`), vale a regra da seção 3: falha.

## 4. `.claude/settings.json` — composição

Entradas: os hooks do núcleo do ExpxDev (`expx-session-sync`, `expx-lembrete`),
os hooks que cada skill publica no próprio `.claude/settings.json` (skill sem
esse manifesto, como o memox, tem os hooks soltos `<skill>-*.sh` registrados
pelo nome do arquivo), e o que o projeto já tinha.

- Identidade de um hook: `(evento, matcher, command, args)`. `matcher`
  ausente e `""` são a mesma identidade.
- Mesma identidade, mesma definição (type, timeout, …) → deduplica.
- Mesma identidade, definição diferente → **erro de composição**, nada é
  escrito.
- Um comando de hook que referencia `.claude/hooks/…` ou `.claude/skills/…`
  que a skill não publica → **skill incompleta**, nada é escrito.
- Evento, matcher, command e timeout são preservados como a skill publicou.
- Entradas gerenciadas saem em ordem canônica, um grupo por
  (evento, skill, matcher).
- Tudo o mais do arquivo (outras chaves, hooks da pessoa) é preservado. Um
  hook da pessoa com a identidade de um gerenciado e definição diferente é
  conflito: falha, em vez de escolher.
- O arquivo só é reescrito (e só ganha backup) quando o conteúdo muda.

## 5. `.expx/hooks.json` — composição

É o manifesto de modo (`aviso`, `bloqueio`, `desligado`) lido pelos hooks.

- id exclusivo → entra;
- mesmo id, configuração semanticamente igual → deduplica;
- mesmo id, configuração diferente → **falha**, nada é escrito.

Ids com namespace são distintos: `sprintx/git-perigoso` e
`mergex/git-perigoso` coexistem, e desligar um não desliga o outro. Os ids saem
em ordem alfabética.

O `modo` que a pessoa escolheu no arquivo do projeto sobrevive à
reinstalação. Ids que nenhuma skill publica e que o ExpxDev não gerenciava são
preservados.

A preservação usa o lock anterior: um `modo` que difere do que as skills
publicavam na instalação anterior é escolha da pessoa e fica; um `modo` igual
ao padrão anterior segue o padrão novo da skill (é assim que uma promoção de
`aviso` para `bloqueio` chega ao projeto). Sem lock anterior, qualquer `modo`
presente é preservado. Um id que o ExpxDev gerenciava e cuja skill saiu da
seleção é removido.

## 6. O que o `init` não apaga

Só `.expx/marketplace/` é trocada de uma vez. O restante de `.expx/`
(`estado.json`, `memoria/`, …) não é do `init` e fica intocado.

## 7. Dependências de runtime

Quando a instalação registra hooks de skill (harness `claude`), o `init`
executa `git --version` e `jq --version` **no ambiente do próprio processo**
(o PATH que o `expxdev` herdou) antes de tocar o projeto. Binário instalado mas
fora desse PATH conta como ausente: o `init` falha, com mensagem que diz o que
instalar e como conferir, e nada é escrito. Não há parser JSON alternativo.

`bash` não é verificado: no Windows o primeiro `bash` do PATH pode ser o do
WSL enquanto o Claude Code roda os hooks no Git Bash, e uma checagem por
`where bash` seria enganosa.

## 8. Sem instalação parcial

Falham **antes da primeira escrita**, sem alterar o projeto:

- skill fora do catálogo, fonte inacessível, layout inválido (o `init` não
  instala "as outras" — ou todas, ou nenhuma);
- colisão de destino (seção 3) e conflito de id (seção 5);
- manifesto de skill inválido (`.claude/settings.json`, `.expx/hooks.json`,
  `hooks/hooks.json`);
- `.claude/settings.json` ou `.expx/hooks.json` do projeto ilegível, ou
  impossível de compor;
- skill incompleta (hook registrado que ela não publica);
- destino bloqueado (um arquivo onde precisa haver pasta);
- dependência de runtime ausente (seção 7).

A aplicação escreve os arquivos do projeto, o settings e o `.expx/hooks.json`,
troca `.expx/marketplace/` de uma vez, e grava o lock **por último**: ele é a
afirmação de que a instalação está completa. Uma falha de sistema de arquivos
no meio da aplicação (disco cheio, permissão) não é revertida; o `doctor` a
acusa pelo lock.

## 9. O lock (`.expx/expx-lock.json`, versão 2)

Além de `skills` (versão e hash da cópia de cada skill no plugin), o lock tem
`instalacao`:

- `arquivos`: destino → sha256 de todo arquivo que o plano escreveu —
  `.claude/hooks/**`, `.claude/skills/**` (helpers como
  `catalogo-de-metodo.sh` inclusive), comandos e o plugin;
- `executaveis`: dos destinos acima, os que o plano marcou como executáveis, em
  ordem canônica. Campo **opcional**: lock escrito por versão anterior continua
  válido, e a verificação cai no fallback da regra do plano (todo `.sh` é
  executável), que erra só para menos;
- `settings`: as entradas de hook gerenciadas no `.claude/settings.json`,
  exatamente como escritas, e o hash delas;
- `modos`: o que as skills publicaram para `.expx/hooks.json` e o hash do
  arquivo composto.

Tudo em ordem canônica. O único campo que varia entre duas instalações das
mesmas skills é `skills.<nome>.resolvido_em` (a data da resolução), que já
existia no lock 1 e é mantido como registro; comparações de equivalência o
ignoram. `skills.<nome>.repositorio` é a origem usada e, para uma origem
local, o caminho dela.

O `expx doctor` confere o lock contra o disco: arquivo ausente ou alterado,
hook gerenciado ausente ou alterado no settings, `.expx/hooks.json` diferente
do composto — erro. Só o `modo` de um id alterado é aviso: é decisão da
pessoa, e rodar o `init` de novo trava o arquivo com a escolha dela.

## 10. SessionStart e instalação com origem local (D-03)

O hook do núcleo `expx-session-sync` roda no `startup`/`resume` e, numa
instalação comum com árvore limpa, sincroniza a distribuição com o ExpxDev da
AxisGov (`bootstrap` do cache a partir de `main` e `expx update --latest
--yes`). Essa sincronização é **conveniência**, e não pode romper uma
instalação congelada.

**SessionStart não aplica atualização automática a instalações que contenham
origem local (`commit *-local`). O lock congelado vence a conveniência de
sincronização. Atualização dessas instalações exige ação explícita.**

- **Sinal:** qualquer `skills.<nome>.commit` terminado em `-local` — o que
  `EXPX_SKILLS_LOCAIS` grava (`<sha>-local`; `local` quando a fonte não tem
  git). O caminho em `repositorio` não decide nada. Uma única skill local
  basta: local + remota congela a instalação inteira.
- **Ordem:** o hook lê o lock do disco, sem rede e sem o CLI Axis, logo depois
  de achar a raiz Git — antes de `git status`, do cache Axis, de `clone`,
  `fetch`, `npm` e do `update`. Quem decide se o projeto está congelado é o
  próprio projeto, nunca um executável vindo de `main`.
- **Congelado:** nada de cache, rede ou update; o projeto (lock, settings,
  skills, marketplace) fica intocado. O hook devolve só contexto informativo.
- **Lock inválido** (JSON ilegível, sem mapa `skills`, skill sem `commit`
  legível): falha fechado quanto à atualização — sincronização adiada, zero
  mutação. O hook continua fail-open quanto à sessão: nunca impede o harness
  de iniciar.
- **Lock sem origem local:** comportamento anterior, inclusive a precedência da
  árvore suja (sincronização adiada).
- **`expx update` explícito:** inalterado, inclusive em instalação local.

## 11. O bit de execução, em disco e VERSIONADO (D-20)

Os hooks são registrados por **execução direta**
(`"$CLAUDE_PROJECT_DIR"/.claude/hooks/sprintx/git-perigoso.sh`), e o `init`
grava cada executável com 0755. Num repositório com `core.filemode=false` isso
não basta: o git ignora o bit do filesystem, `git add` registra `100644` e o
commit leva `100644`. No produto onde a instalação foi feita tudo bate — bytes,
hashes, settings, modos — e o primeiro `git clone`/`git worktree add`
materializa 0644: o hook morre com **126 (Permission denied)** e a proteção
desaparece em silêncio. Medido: `chmod 0755` + `git add` grava `100644`; só
`git update-index --chmod=+x` grava `100755`.

**O ExpxDev nunca roda `git add` nem `git update-index`, e nunca prepara o
índice de quem instalou.** Versionar o modo é decisão explícita, com commit
explícito. O que o ExpxDev faz:

- **`expx init`**: avisa quando o repositório tem `core.filemode=false` e algum
  executável gerenciado ainda não está `100755` no índice. O aviso separa dois
  casos, porque `git update-index` é **atômico** e um caminho fora do índice
  derrubaria o comando inteiro (`error: <caminho>: cannot add to the index -
  missing --add option?`, `fatal: Unable to process path <caminho>`):
  - **rastreado como `100644`**: recebe o comando exato
    `git update-index --chmod=+x -- <caminhos>`, na **última linha** do aviso,
    sozinho — é o que se copia e cola, e prosa depois dele na mesma linha viraria
    argumento colado;
  - **sem entrada `100644` no índice** (não rastreado ainda, ou em conflito de
    merge): **nenhum comando**. O aviso nomeia os caminhos e pede que sejam
    adicionados ao índice quando a pessoa decidir versioná-los, e que
    `expx doctor` seja rodado depois. Sem `--add` no `update-index`, e sem o
    ExpxDev preparar índice.

  Sem git, fora de repositório, `core.filemode` diferente de `false`, ou modo já
  versionado em todos: nenhum aviso. O mesmo aviso sai no `expx update`, que
  remonta pelo `init`.
- **`expx doctor`**, achado `modo-executavel-nao-versionado` (**erro**):
  executável gerenciado rastreado como `100644` no índice. A mensagem traz
  `git update-index --chmod=+x -- <caminhos>` com a lista exata, diz que o
  `expx init` conserta o disco mas **não** o modo versionado, e não executa
  nada. Executável ainda não rastreado não é achado: não há modo versionado
  errado.
- **`expx doctor`**, achado `modo-executavel-nao-commitado` (**erro**):
  executável com `100755` no índice e **ainda não no `HEAD`**. O `update-index`
  e o commit são dois passos, e só o segundo chega a quem clona: `git clone` e
  `git worktree add` materializam a partir do `HEAD`, não do índice. Parar no
  índice era falso verde — a worktree nova continuava nascendo 0644 com o hook
  morto em 126. **O diagnóstico fica não saudável até o `HEAD` conter `100755`.**
  A correção diz o que falta — COMMITAR — e não repete o `update-index`, que já
  foi feito; o ExpxDev também não commita. Repositório sem nenhum commit entra no
  mesmo achado, nomeando a causa.
- **`expx doctor`**, achado `modo-executavel-head-indisponivel` (**aviso**): a
  consulta do modo commitado ao `HEAD` falhou por motivo inesperado. É **aviso**,
  e não erro, porque acusar sem prova seria pior; e não é silêncio, porque a
  verificação ficou inconclusiva e isso precisa aparecer. A correção diz como
  conferir à mão (`git ls-tree -r HEAD -- <caminho>`).
- **`expx doctor`**, achado `modo-executavel-sem-bit` (**erro**): executável
  gerenciado sem bit de execução no disco. Reparo: `expx init`. Só é cobrado
  quando a **raiz do projeto** prova preservar o bit — uma sonda de dois tempos
  (0644 sem bit, depois 0755 com bit) escrita ali, nunca em `os.tmpdir()`, que
  pode estar em outro filesystem. Windows nativo (o `chmod` não muda o modo) e
  WSL/DrvFs (todo arquivo aparece 0777) reprovam a sonda e o disco não é
  cobrado — é assim que o falso positivo é evitado.

### Quem ganha o bit de execução

O `init` grava 0755 apenas nos artefatos que o plano marcou como executáveis, e
essa marca é o que o lock trava em `instalacao.executaveis`. A regra:

- **`.sh` é executável pela extensão, sempre.** É o que os hooks registram, e não
  depende de como a origem chegou à máquina.
- **Para o resto, o bit da origem é necessário mas NÃO suficiente:** é preciso
  também que o arquivo comece com `#!`.

O segundo sinal existe porque o primeiro é ruidoso, e de forma que atravessa
filesystem. `EXPX_SKILLS_LOCAIS` **não clona** — a origem local é copiada com
`cpSync`, que **preserva o modo**. Numa origem hospedada em DrvFs (`/mnt/c`, o
caso de quem edita a skill no Windows e roda no WSL) todo arquivo aparece 0777, e
a cópia recebe 0777 de verdade: a partir dali o 0777 não é mais artefato de
filesystem, é o modo real do arquivo que o plano vai medir. Sem a guarda,
`SKILL.md` e `.json` entravam em `executaveis` e o `doctor` exigia
`git update-index --chmod=+x` para a instalação **inteira**, documentação
incluída, como erro que derruba o diagnóstico. O mesmo acontecia com uma origem
cujo `SKILL.md` ficou 0755 por umask ou por cópia de FAT.

O shebang é sinal de **conteúdo**: nenhum filesystem o fabrica. Preço aceito: um
executável compilado (sem `.sh` e sem shebang) deixaria de ser marcado e seria
gravado 0644. Nenhuma skill do catálogo traz binário — os executáveis de hoje são
todos `.sh` com shebang, e o único `.mjs` roda por `node` e já é declarado não
executável. Se um dia houver binário, é esta regra que precisa crescer.

### A fronteira de plataforma

O defeito tem uma metade POSIX e uma metade portável, e confundir as duas leva a
conclusão errada sobre o que o portão garante em cada sistema.

- **Portável, porque é dado do git:** o índice registrar `100644`, o `doctor`
  acusar, o `git update-index --chmod=+x` da pessoa corrigir o índice, o commit
  levar o modo ao `HEAD`, e o diagnóstico ficar verde só depois disso. Vale igual
  no Linux e no Windows, e é certificado nos dois.
- **Só POSIX:** o **126**. No Windows o hook não morre por falta de bit — quem o
  executa é o Git Bash, que decide por shebang e não pelo modo do arquivo, e ele
  bloqueia com 2 mesmo sem bit. Medido em NTFS: `chmodSync` não altera
  `stat().mode` (fica 0666 para qualquer modo pedido, 0777 inclusive), então
  "0644 materializado" não é estado alcançável lá.

Por isso o portão **não cobra o disco no Windows** (a sonda reprova de saída), e
por isso `instalacao.executaveis` de uma instalação feita no Windows contém
apenas os `.sh`: sem bit expressável, a regra do bit não promove nada. É
degradação segura — no Windows o bit não é o que faz o hook rodar. A consequência
a registrar é que a lista pode diferir entre quem instalou no Windows e quem
instalou em POSIX, se algum dia uma skill trouxer executável sem `.sh`. Nenhuma
traz hoje.

### Como o git é consultado

- **Caminho é nome de arquivo, nunca padrão.** Toda consulta usa
  `--literal-pathspecs`. Sem isso o git leria os destinos do lock como pathspec:
  `x*.sh` casaria também `x.sh` (devolvendo o modo de outro arquivo), `q?.sh`
  arrastaria `qa.sh`, `a[b].sh` viraria classe de caractere, e um nome iniciado
  por `:` faria o git **recusar a consulta inteira** — e o caminho errado
  passaria como "não rastreado".
- **Só o estágio 0 do índice conta.** Em merge conflitado o índice traz os
  estágios 1/2/3 (base, nosso, deles), que podem divergir no modo, e nenhum deles
  é o modo do próximo commit. O caminho conta como ausente: conflito aberto é
  estado legítimo e transitório, e acusar modo no meio dele seria acusar um modo
  que ninguém escolheu ainda.
- **A raiz do projeto é somente leitura no caminho saudável.** A única escrita
  que o `doctor` faria ali é a sonda do bit — e ela só roda quando existe
  candidato sem bit no disco. Instalação saudável não escreve nada no projeto de
  quem pediu o diagnóstico, e o `doctor` não falha em raiz somente leitura por
  causa de uma sonda que não tinha pergunta a responder. Qualquer erro da sonda
  (sem permissão, raiz inexistente) devolve "sem prova, sem achado", e a pasta da
  sonda é removida em todos os caminhos de saída.
- **Erro de git não é escondido, e git ausente não é erro.** Sem git no PATH e
  fora de repositório, a consulta ao índice devolve vazio: nenhum executável é
  declarado com modo errado, nenhum aviso de `core.filemode` sai, e a consulta ao
  `HEAD` nem chega a acontecer (ela só é feita para caminhos que o índice
  reportou como `100755`). O silêncio é **apenas quanto ao modo versionado**, e é
  o desenho pretendido: um projeto sem git não tem modo versionado para estar
  errado. A dimensão do DISCO continua valendo sem git nenhum — onde a raiz prova
  preservar o bit e falta bit em executável gerenciado, `modo-executavel-sem-bit`
  sai normalmente, porque essa pergunta não depende de repositório.
  Quando o índice responde mas a consulta ao `HEAD` falha, aí sim a verificação
  do modo commitado fica inconclusiva, e isso sai como **aviso**
  (`modo-executavel-head-indisponivel`), na severidade proporcional: não derruba
  a saída, e não deixa ninguém achar que foi conferido.
- **Entrada que não é arquivo comum (`120000`, `160000`) não é acusada.** Medido:
  um symlink aparece como `120000` no estágio 0, tanto no índice quanto no
  `HEAD`. Como não é `100644` nem `100755`, ele não entra em nenhum dos dois
  achados de modo versionado, e o portão fica calado a respeito dele — não há
  comando de reparo correto a sugerir, porque `--chmod=+x` não descreve um
  symlink. A verificação de integridade cobre esse caso **só em parte**, e a
  fronteira importa: o hash é lido SEGUINDO o link, então o symlink é detectado
  apenas quando o alvo tem bytes diferentes do travado (`artefato-alterado`) ou
  não é legível — alvo ausente ou link quebrado (`artefato-ausente`). Um symlink
  cujo alvo tem exatamente os bytes esperados **não é detectado por ninguém**:
  nem pelo modo, nem pela integridade. É limitação conhecida, e não efeito do
  portão de modo. No aviso do
  `init` a entrada cai no bloco **sem comando**, junto do não rastreado — pode
  ficar redundante ali, e continua sem prometer comando que falharia. O plano
  nunca cria destino desse tipo: ele escreve arquivos comuns.
