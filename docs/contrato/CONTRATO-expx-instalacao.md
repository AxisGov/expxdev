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
