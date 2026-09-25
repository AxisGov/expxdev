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

## 6. O que o `init` não apaga

Só `.expx/marketplace/` é trocada de uma vez. O restante de `.expx/`
(`estado.json`, `memoria/`, …) não é do `init` e fica intocado.
