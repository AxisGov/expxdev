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
`skill`, `comando`, `hook`, `agente`). `settings.json` e `.expx/hooks.json` não são
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
| `.claude/hooks/ponte/*.js` (ponte de hooks, como a `runx-ponte.js`) | além da árvore de hooks, `.opencode/plugins/<arquivo>` com `claude` e `opencode` |
| `.claude/commands/<skill>*.md` | `…/plugins/expx/commands/` (e `.opencode/commands/` com `opencode`) |
| `.claude/agents/*.md` | `.claude/agents/*.md`, com o override de `.expx/agentes.json` aplicado (seção 8) |
| `.claude/settings.json` | **composto** em `.claude/settings.json` |
| `.expx/hooks.json` | **composto** em `.expx/hooks.json` |

A árvore de hooks vai inteira, com a estrutura que a skill publica
(`sprintx/`, `mergex/`, `comum/`): os hooks carregam bibliotecas irmãs por
caminho relativo, e os helpers da skill (por exemplo
`.claude/skills/mergex/scripts/catalogo-de-metodo.sh`) chegam pela cópia da
pasta da skill. Não há caso especial por arquivo.

A única cópia a mais é a da ponte de hooks: o OpenCode não carrega módulos de
`.claude/hooks/ponte/`, só de `.opencode/plugins/`, que é onde o `install.sh`
da runx a põe. Com `claude` e `opencode` no harness, cada `.js` de
`.claude/hooks/ponte/` vai também para `.opencode/plugins/`, com os mesmos
bytes; a cópia da árvore continua, porque é a partir dela que a ponte acha o
despachante e o `hooks.json` do marketplace. Só com `claude`, nada muda. Só com
`opencode`, a árvore de hooks não é instalada e a ponte não teria para onde
despachar: ela não vai, e o `init` avisa. O
MimoCode não é harness do expx: a ponte em `.mimocode/hooks/` continua sendo
instalada apenas pelo `install.sh` da runx. Como os demais artefatos fora de
`.claude/agents/`, a ponte em `.opencode/plugins/` não é removida quando o
`opencode` sai do harness numa reinstalação.

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

O registro do plugin no escopo do usuário (`claude plugin marketplace add`) grava um caminho absoluto. Rodado numa worktree, o `init` (e o `update` que aplicou algo) registra o `.expx/marketplace` do **checkout principal** quando ele existe, porque é contra ele que o Claude Code resolve o `./.expx/marketplace` do projeto, e ele sobrevive à remoção da worktree; sem ele, registra o da worktree e avisa que o registro quebra quando ela for removida. O registro anterior de `expx-local` é removido antes do novo, só no escopo do usuário (`--scope user`; sem ele, o `remove` apagaria também a declaração versionada do projeto), para não ficar apontando para uma worktree antiga. Depois do `add`, `claude plugin marketplace list --json` precisa mostrar o `expx-local` com o caminho escolhido; senão a instalação para com erro antes de reinstalar. No `update`, essa falha faz o comando sair 1; no `init`, o registro é o passo final e a saída segue 0, com o motivo.

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

## 5.1 `.expx/agentes.json` — override de modelo e esforço

Cada agente publicado em `.claude/agents/` declara `model` e `effort` no
próprio frontmatter: é o **piso** do método (um agente de veredito que herda o
modelo de quem chama fica tão fraco quanto a sessão que o chamou). O projeto
que precisa de outro custo sobrepõe de forma consciente e versionada:

```json
{
  "expx_agentes": 1,
  "agentes": {
    "runx-investigador": { "model": "haiku", "effort": "low" }
  }
}
```

- chave = o `name:` do agente; só `model` e `effort` são sobrepostos;
- `model`: alias (`opus`, `sonnet`, `haiku`, `inherit`) ou ID `claude-*`;
  `effort`: `low`, `medium`, `high`, `xhigh`, `max`;
- o Claude Code só lê o frontmatter, então o override é aplicado na
  **instalação**: a cópia em `.claude/agents/` sai com os valores do projeto, e
  o hash dessa cópia final é o que vai para o lock;
- o arquivo é do projeto: o `init`, `add`, `remove` e `update` nunca o
  escrevem, e por isso o override sobrevive a toda reinstalação e vale também
  sobre a versão nova do agente;
- ausente → vale o frontmatter; presente e inválido → **falha antes de
  qualquer escrita**;
- override de agente que nenhuma skill instalada publica → aviso, não erro;
- agente com o mesmo destino que **não** foi instalado pelo expx (não está no lock) e tem bytes diferentes é do projeto: o `init` **falha antes de escrever**, em vez de sobrescrevê-lo;
- agente que o lock anterior gravou e que saiu do plano (skill removida, ou que deixou de publicá-lo) é **removido**, desde que o arquivo ainda tenha o hash do lock; editado à mão, fica e vira aviso;
- agente que é link simbólico no repositório da skill é recusado (a skill falha), para não copiar para o projeto o conteúdo de um arquivo de fora dela;
- **OpenCode**: fora do escopo. Os agentes de `.opencode/agent/` não são
  instalados pelo `init` e o override não os alcança.

## 5.2 `.expx/fatiamento.json` — decisões de fatiamento do projeto

O arquivo registra somente as decisões que continuam configuráveis pelo
projeto. Os limites do CodeAnt são fixos e não aparecem aqui. O formato atual é
a versão 2:

```json
{
  "expx_fatiamento": 2,
  "revisao_por_task": { "modo": "obrigatoria" },
  "entrega": "por_sprint",
  "merge_automatico": { "ativo": true, "caminhos_protegidos": ["^src/pagamentos/"] },
  "revisor_bot": ["codeant-ai[bot]"],
  "excluir_da_revisao": [
    {
      "padrao": "^fixtures/candidatos/",
      "classe": "copia",
      "origem": "scripts/atualizar-candidatos.sh",
      "motivo": "cópia das skills candidatas, revisada no repositório de origem"
    }
  ]
}
```

- `revisao_por_task.modo`: `se_disponivel` quando ausente; aceita também
  `obrigatoria` e `desligada`;
- `entrega`: `por_trabalho` quando ausente; aceita também `por_sprint`;
- `merge_automatico.ativo`: `false` quando ausente. A decisão é independente do
  modo da revisão por task. `caminhos_protegidos` soma à lista padrão, nunca a
  substitui, e usa ERE compatível com o Git Bash e o macOS. A lista padrão é:
  - autenticação: `(^|/)auth/`, `(^|/)autenticacao/`, `(^|/)login/` — diretório inteiro, em qualquer nível;
  - permissões e RLS: `(^|/)(permiss|rls|polic(y|ies))` — começo de diretório ou arquivo (`permissions.ts`, `permissoes/`, `rls.sql`, `policy.ts`, `policies/`); `policies?` não serviria: casa `policie`/`policies`, não `policy`;
  - migrations: `(^|/)(migrations?|migracoes?|migrate)/` — `migrate/` cobre o `db/migrate/` do Rails, cujas migrations não são `.sql`;
  - SQL: `\.sql$` — de propósito amplo: fora de `migrations/` o `.sql` costuma ser esquema, função, política ou seed (`schema.sql`, `seed.sql`), e o leitor não sabe distinguir uma consulta inofensiva disso. O custo é o projeto com muito SQL de consulta (dbt, sqlc) não ter merge automático nesses arquivos, o que é a falha segura;
  - CI e infraestrutura: `^\.github/`, `^(infra|deploy|terraform|k8s|docker)/` (na raiz), `(^|/)Dockerfile$`;
  - segredos: `(^|/)\.env` — cobre `.env`, `.env.*` (o mesmo conjunto que o hook `segredo` da sprintx varre) e também `.envrc`; `(^|/)secrets?/`;
- `revisor_bot`: lista vazia quando ausente. Cada login casa
  `^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$`, sem repetição; a comparação feita
  pela mergex é exata e independente de `merge_automatico`;
- `excluir_da_revisao`: lista vazia quando ausente. Ela substitui `ignorar` e
  serve somente para classes de artefato, nunca para código-fonte.

Cada item de `excluir_da_revisao` obedece a estas seis regras:

1. É um objeto com exatamente `padrao`, `classe`, `origem` e `motivo`; padrão
   repetido é inválido.
2. `padrao` descreve uma pasta literal: começa com `^`, tem um ou mais
   segmentos e termina em `/`. Controles e metacaracteres de regex são
   proibidos; ponto só aparece como `\.`, e os segmentos `.` e `..` são
   inválidos. Não há glob, extensão, nome de arquivo nem alternativa.
3. `classe` é `gerado` (produzido por script) ou `copia` (cópia versionada de
   outro repositório e revisada na origem).
4. `origem` e `motivo` são textos não vazios. A origem identifica o comando
   gerador ou o repositório de onde veio a cópia.
5. O primeiro segmento não pode ser uma raiz de código: `src`, `lib`, `app`,
   `apps`, `packages`, `pkg`, `cmd`, `internal`, `server`, `client`, `web`,
   `api`, `test`, `tests`, `spec`, `scripts`, `.github`, `.claude`, `.opencode`
   ou `.expx`. A exceção exige um segmento posterior `fixtures`, `snapshots`,
   `__snapshots__`, `generated` ou `gerado`: `^scripts/ci/fixtures/candidatos/`
   passa; `^src/` e `^scripts/` não. Essas listas só crescem por PR no expxdev.
6. Quando o bloco C integrar as exclusões à revisão, arquivo declarado em
   `cria` ou `altera` de uma task e coberto por um item tornará a revisão
   `incompleta:excluido-declarado`; gerar o artefato será um commit próprio,
   fora das tasks.

As exclusões do projeto somam às do núcleo: `^docs/sprintx/`,
`^docs/entregas/` e `^docs/eventos/`. O projeto não as declara. Os blocos A1 a
A3 entregam a leitura, a validação e o diagnóstico dessa configuração. O bloco
B entrega as medidas e o verificador; o bloco C aplicará as exclusões e os
portões na revisão. Nessa integração, o método testará o prefixo literal antes
de montar `--include`; a sintaxe glob do `--exclude` da CLI não participará. Um
arquivo coberto ficará fora da revisão por task, de L1 e de L2, mas continuará
contado em L3. Como `.expx/fatiamento.json` é caminho sempre protegido, ampliar
a lista espera o desenvolvedor.

`legibilidade`, `arquivo`, `justificativa` e `capacidade` foram removidas. Na
versão 2, cada uma falha com
`<chave>: removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a`.
`ignorar` falha com
`` ignorar: substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato ``.
Nenhuma delas cai no erro genérico de chave desconhecida. A versão 1 falha
com `versão 1: migre para 2 (emenda de 2026-10-19)` e uma linha para cada
chave removida ainda presente.

Todo nome `FATIA_*` fica reservado para sempre. Se qualquer um estiver definido
no ambiente, mesmo vazio, o leitor sai 1 e o doctor emite o erro
`fatia-no-ambiente`, com
`` `FATIA_<nome>` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente ``.
Nenhum limite, caminho ou exclusão vem do ambiente.

O leitor único é
`.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs`:

- `node <L>` imprime somente `EXPX_REVISAO_POR_TASK`, `EXPX_ENTREGA`,
  `EXPX_MERGE_AUTOMATICO`, `EXPX_CAMINHOS_PROTEGIDOS`, `EXPX_REVISOR_BOT`,
  `EXPX_EXCLUIR_DA_REVISAO`, `EXPX_FATIAMENTO_ORIGEM`, `EXPX_PERFIL_CLI`,
  `EXPX_L1_ARQUIVOS`, `EXPX_L2_LINHAS`, `EXPX_L2_BYTES` e
  `EXPX_L3_ARQUIVOS`, em formato seguro para `eval`;
- `node <L> --formato json` imprime as mesmas decisões como `origem`,
  `revisao_por_task`, `entrega`, `merge_automatico`, `revisor_bot`,
  `excluir_da_revisao` e `limites`;
- `node <L> --validar` apenas valida. Arquivo ausente usa os padrões; presente
  e inválido sai 1 sem stdout, nunca cai silenciosamente nos padrões. BOM e
  CRLF são aceitos. O arquivo pertence ao projeto: `init`, `add`, `remove` e
  `update` não o escrevem.

O `doctor` valida com o leitor do próprio pacote, nunca com a cópia gravável do
checkout. Leitor ou módulo de limites ausente produz `fatiamento-sem-leitor`.
Nos planos seguintes, a mergex E7 e a sprintx F3/F6 passarão a consumir o
leitor.

## 5.3 `.expx/orquestracao.json` — política de orquestração (F2)

O formato, a validação e a resolução estão em `CONTRATO-expx-orquestracao.md`.
Aqui fica o que a instalação faz com eles. Tudo vale **só com o harness
`claude` e com o arquivo presente**. Sem `.expx/orquestracao.json`, nada desta
seção acontece, e agentes e lock saem byte a byte iguais aos de uma instalação
sem orquestração.

- **Materialização.** Cada agente de `.claude/agents/` é resolvido no
  adaptador `claude`, sem tarefa nem sessão. O frontmatter da cópia recebe o
  `model` e o `effort` da alternativa. Se a alternativa não tem `effort`, a
  linha `effort` **sai**, porque o arquivo não pode dizer um esforço que a
  resolução não pediu. O resto do arquivo não muda.
- **`.expx/agentes.json` v1, depois.** Um override do v1 é aplicado sobre a
  resolução e marcado nela (`sobreposta_por`, `materializado`). É a exceção de
  compatibilidade da §7.4 do contrato de orquestração.
- **Registro.** Cada resolução é gravada em
  `.expx/resolucoes/<resolucao_id>.json` com chaves ordenadas, indentação 2 e
  quebra final. Essa forma é só legibilidade: a identidade continua sendo o
  JSON canônico compacto do `resolucao_id`. O registro é gravado **antes** dos
  agentes e do lock; um arquivo que já existe com os mesmos bytes fica como está. O registro **não** entra em
  `instalacao.arquivos`: não é artefato gerenciado, a limpeza nunca o alcança e
  ele nunca é apagado, nem quando a política sai.
- **Lock.** A seção opcional `orquestracao` (seção 9) guarda as versões e o
  `resolucao_id` vigente por agente.
- **Escrita do registro.** O temporário, de nome aleatório, nasce com `O_EXCL`
  (e `O_NOFOLLOW` onde existe), recebe `fsync` e é publicado com `link`, nunca
  com `rename`. O `link` falha se o final já existe, inclusive como link
  simbólico. Então:
  - **garantido:** o registro nunca é sobrescrito, e o temporário é escrito por
    inteiro (escrita parcial é completada). Dois `init` simultâneos publicam o
    mesmo conteúdo, e o segundo aceita o do primeiro. Em POSIX, um final
    existente só é aceito se for arquivo regular com os mesmos bytes, lido com
    `O_NOFOLLOW`. No Windows, sem `O_NOFOLLOW`, sobra um `lstat` antes do
    `open`, com janela entre os dois;
  - **mitigado:** `.expx` e `.expx/resolucoes` precisam ser diretórios de
    verdade, sem link e dentro do projeto (`realpath` + `relative`), e manter o
    (dev, ino) da primeira checagem. Os dois são conferidos depois de criar
    `resolucoes` e de novo antes de publicar. Uma troca, por link ou por outro
    diretório, ainda presente na revalidação aborta antes do lock. A
    revalidação vale também quando o registro já existia: a leitura passa pelo
    caminho dos diretórios, e o `O_NOFOLLOW` só protege o componente final. O `mkdir`
    pode ter acontecido antes da detecção. O temporário de um diretório que
    mudou não é limpo: um órfão é preferível a remover por um caminho talvez
    redirecionado;
  - **não fechado:** o Node não tem `openat`/`linkat`, e toda operação por
    caminho tem janela. Uma troca **depois** da última revalidação pode
    redirecionar o `link` ou a limpeza; desfazê-la em seguida só apaga a
    evidência. Ela exige escrita concorrente no projeto, que já permite editar
    hooks. No Windows não há `O_NOFOLLOW`: a garantia forte é POSIX. Eliminar a
    classe exige primitivas relativas a descritor de diretório.
- **Identidade.** O nome do agente é o `name:` lido como YAML (como o Claude
  Code o lê), e é a chave da política, do override v1, do registro e do lock.
- **Projeção do rastro.** Com a política ativa, `.expx/orquestracao-rastro.tsv`
  leva, por agente, as chaves da resolução que o escritor comum do rastro grava
  no evento (CONTRATO-expx-orquestracao §11.1): cabeçalho
  `# expx-orquestracao-rastro 1` e uma linha por agente em ordem, com nove
  campos separados por TAB (`agente`, `resolucao_id`, `classe_declarada`,
  `origem_classe`, `classe_resolvida`, o `id` da `alternativa`,
  `origem_alternativa`, `model` e `effort` do `materializado`, `-` quando
  ausente). Sai do mesmo plano que o registro e o lock, é gravada de forma
  atômica e removida quando a política sai. Não é fonte: valor fora do alfabeto
  que o escritor lê sem escapar (`[A-Za-z0-9._:/-]`) recusa o plano.
- **Falhas antes de escrever** (seção 8): política inválida; `classe:` fora do
  vocabulário num agente da skill; dois agentes com o mesmo `name:` (só o
  último ficaria no lock); agente que a política não resolve, com o motivo do
  resolvedor; arquivo do registro que já existe com outros bytes (o registro é
  imutável).

O `expx doctor` só fala da orquestração quando há política ou seção no lock.
São **erro**: `orquestracao-invalida`, `orquestracao-resolucao-ausente` (o
lock cita um id sem arquivo) e `orquestracao-registro-adulterado` (o arquivo
não confere com o id ou não está na forma canônica legível, inclusive só nos
espaços, ou um registro válido de outro agente ou adaptador) e
`orquestracao-projecao-divergente` com a política ativa (a projeção ausente ou
diferente da que sai do lock e do registro; só é conferida com todo registro
legível). Com ela sobrando sem política nem seção no lock, o mesmo id é
**aviso**. São **aviso**: `orquestracao-lock-sem-politica`,
`orquestracao-classe-inferida`, `orquestracao-v1-abaixo-da-classe`,
`orquestracao-variavel-sobrepoe` (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` ou
`CLAUDE_CODE_EFFORT_LEVEL` no ambiente do doctor) e
`orquestracao-fallback-fora`. Este último lê o `fallbackModel` da fonte de
maior precedência que o doctor consegue ler (`.claude/settings.local.json`,
`.claude/settings.json`, `~/.claude/settings.json`), inteira e sem mescla, e
cita a origem. Settings gerenciados e `--fallback-model` de outra sessão ficam
fora: só a observação do executor os pega.

## 6. O que o `init` não apaga

Só `.expx/marketplace/` é trocada de uma vez. O restante de `.expx/`
(`estado.json`, `memoria/`, `agentes.json`, `fatiamento.json`,
`orquestracao.json`, …) não é do `init` e fica intocado. Em
`.expx/resolucoes/` o `init` só acrescenta arquivos novos: nunca reescreve nem
apaga um existente (seção 5.3).

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
- dependência de runtime ausente (seção 7);
- política de orquestração inválida, agente que ela não resolve, `classe:`
  inválida ou registro de resolução adulterado (seção 5.3).

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

Com a política de orquestração ativa (seção 5.3), o lock tem também
`orquestracao`: `versao_resolvedor`, `tabela_embutida`, `matriz_effort_claude`
e, por agente, `{ "claude": <resolucao_id> }` — o id **vigente**. A seção é
opcional e aditiva, e o `lock_version` continua 2: sem política ela não
aparece e o lock não muda. **Limite de downgrade:** uma versão do `expxdev`
anterior à F2 aceita o lock, mas, se rodar o `init`, regrava-o sem a seção. O
próximo `init` de uma versão com F2 a recompõe a partir da política, e o
registro continua lá.

Tudo em ordem canônica. O único campo que varia entre duas instalações das
mesmas skills é `skills.<nome>.resolvido_em` (a data da resolução), que já
existia no lock 1 e é mantido como registro; comparações de equivalência o
ignoram. Um `init` repetido que resolve a mesma coisa (mesma origem,
referência, commit e hashes da skill) mantém a data que já estava no lock: só
uma resolução nova grava a data do dia, e repetir a instalação não suja a
árvore porque o dia virou. `skills.<nome>.repositorio` é a origem usada e, para uma origem
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
