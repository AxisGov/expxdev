# E7 — ABERTURA DO PULL REQUEST

Você está no E7. Aqui o pull request é aberto no serviço de hospedagem, **quando isso é possível sem pedir nada a ninguém**.

A regra que governa esta etapa inteira: **ferramenta ausente não é erro** (regra 12). O trabalho está entregue de qualquer jeito — commitado, empurrado e descrito em arquivo. Abrir o PR é conveniência, não é a entrega.

**Nunca peça credencial, token, login ou senha. Nunca configure autenticação.**

## Pré-requisitos verificáveis

- O E6 devolveu `push_feito: true`. Sem push não há o que abrir.
- `docs/entregas/<trabalho_id>/PR.md` existe (E4).
- O portão ainda vale para o que foi **publicado** (DM-181, DM-186): a validade roda sobre o **SHA
  publicado** — a ponta da ref remota da branch, buscada agora —, nunca sobre o `HEAD` do checkout,
  e essa ponta tem de ser o **SHA enviado no E6**. O SHA enviado no E6 é o `HEAD` que o passo 4 do
  E6 confirmou igual à ref remota; nada commita entre o E6 e o E7, então ele continua sendo
  `git rev-parse HEAD`. O remoto e a ref vêm do **upstream da branch** (`@{u}`, o que o E6 gravou
  com `--set-upstream`), nunca de um `origin` fixo; a busca é **conferida**, porque uma busca que
  falha deixa a ref remota local com o SHA antigo e a comparação passaria sem ter olhado o remoto;
  e a divergência **aborta**, não só avisa:

```bash
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')" || exit 1   # ex.: origin/<branch>
remoto="${upstream%%/*}"; ref_remota="${upstream#*/}"
git fetch "$remoto" "$ref_remota" || { echo "busca de $upstream falhou: o E7 não abre nem retoma o PR"; exit 1; }
publicado="$(git rev-parse --verify "refs/remotes/$upstream^{commit}")" || exit 1
enviado="$(git rev-parse HEAD)"
[ "$publicado" = "$enviado" ] || { echo "a ponta remota ($publicado) não é o SHA enviado no E6 ($enviado): o E7 não abre nem retoma o PR"; exit 1; }
bash .claude/skills/mergex/scripts/validade-do-portao.sh --verificar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md --rev "$publicado"
```

Sem upstream configurado, busca que falha, ponta remota diferente do SHA enviado (alguém empurrou
na branch depois do E6), ou validade `ok=false`: o E7 **não abre nem retoma o PR**. Relate os dois
SHAs (ou o erro da busca) e o `motivo` e mande rodar o E2 — e, se a ref avançou, o E6 de novo
sobre o que o E2 aprovar. Abrir ou retomar o PR sobre uma ponta que não foi a validada seria
afirmar um portão para código que ele não avaliou. A validade é a mesma que o `pre-push` do Git aplicou ao SHA enviado no E6 — ele é quem decide o push; o hook do Claude `pr-so-com-portao` é consultivo e não abre nem barra PR. O CI com proteção de merge repete a validade sobre o SHA da cabeça do PR quando o produto o ativar; esta skill não o ativa (`references/12-barreira-de-push.md`).

Se `push_feito: false` (sem remoto, ou sem versionador), o E7 não roda: siga direto para o E8. `PR.md` fica como o documento da entrega.

## Passo 1 — Detecção obrigatória, antes de tentar

**Detecte antes de tentar.** Uma tentativa cega gera erro de autenticação na cara do usuário e, pior, um prompt pedindo credencial.

Descubra o serviço pelo remoto:

```
git remote get-url origin
```

| Serviço no remoto | Ferramenta | Verificação de presença | Verificação de autenticação |
|---|---|---|---|
| github.com | `gh` | `command -v gh` | `gh auth status` |
| gitlab | `glab` | `command -v glab` | `glab auth status` |
| bitbucket | — | — | — |
| outro / desconhecido | — | — | — |

As **duas** verificações precisam passar. Ferramenta instalada mas não autenticada conta como ausente: seguir daria erro ou prompt de credencial.

Serviço sem ferramenta conhecida (Bitbucket, Azure DevOps, Gitea, servidor interno): trate como ausente — o passo 1.5 roda do mesmo jeito, e só depois dele vá para o passo 3.

## Passo 1.5 — O PR cabe numa revisão (`expx-fatiamento`)

Antes de abrir — pelo passo 2 **ou** pelo passo 3, que manda abrir à mão —, meça o PR contra F2,
F3 e F4 do contrato `expx-fatiamento` do ExpxDev. A base é a `branch_base` do `ENTREGA.md` **no
mesmo remoto do upstream** (`$remoto`, dos pré-requisitos), buscada agora e conferida; uma ref
local antiga, ou de outro remoto (fork), mediria o PR contra a base errada. A exceção é a
`branch_base` que já nomeia o remoto (`upstream/main`, `refs/remotes/upstream/main`, como a base
informada pelo chamador no E0 pode vir): aí vale o remoto dela, e só o nome da branch vai para o
fetch. A base medida é o `FETCH_HEAD`, o que acabou de chegar, e não a ref de rastreio: um
`origin/HEAD` buscado não atualiza a ref simbólica local, que mediria contra o alvo antigo. E
`origin/HEAD` normaliza para `bb=HEAD`, que não é branch no serviço: o `$bb` vai para o
`gh pr create --base` e para a instrução manual do passo 3, então o `HEAD` do remoto é resolvido
agora, no remoto, para o nome da branch padrão (`refs/heads/main` → `main`):

```bash
rb="$remoto"; bb="<branch_base>"; bb="${bb#refs/remotes/}"; bb="${bb#refs/heads/}"
if [ "${bb%%/*}" != "$bb" ] && git remote | grep -qxF "${bb%%/*}"; then rb="${bb%%/*}"; bb="${bb#*/}"; fi
if [ "$bb" = HEAD ]; then
  bb="$(git ls-remote --symref "$rb" HEAD | awk '$1 == "ref:" && $3 == "HEAD" { sub("^refs/heads/", "", $2); print $2; exit }')"
  [ -n "$bb" ] || { echo "o HEAD de $rb não resolveu para uma branch: o E7 não mede nem abre o PR"; exit 1; }
fi
git fetch "$rb" "$bb" || { echo "busca de $bb em $rb falhou: o E7 não mede nem abre o PR"; exit 1; }
base="$(git rev-parse --verify "FETCH_HEAD^{commit}")" || exit 1
e7_ignorar='(^|/)package-lock\.json$|^docs/(sprintx|entregas|eventos)/'
FATIA_IGNORAR="${FATIA_IGNORAR:+$FATIA_IGNORAR|}$e7_ignorar" \
  bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh "$base" "$publicado"
```

O `FATIA_IGNORAR` vai explícito porque o padrão do script é o do ExpxDev, que também tira
`fixtures/candidatos/` da conta; no projeto do desenvolvedor esse caminho pode ser código
revisado. Gerado que o projeto exclui da revisão automática entra aqui só se o desenvolvedor
declarar o padrão — e o padrão dele **soma** ao do E7, nunca o substitui: os artefatos de
método saem da medida sempre.

Os **artefatos de método** — `docs/sprintx/`, `docs/entregas/`, `docs/eventos/`, o que a
`sprintx` e esta skill gravam na branch — ficam fora da medida (exceção "artefato de método"
do F6 do `expx-fatiamento`). Eles entram no PR para rastreabilidade, mas o planejamento de uma
feature sozinho passa de centenas de arquivos e dezenas de milhares de linhas: medi-los
reprovaria todo PR, e o que o revisor precisa ler é o código. Fora da medida também deve ser
fora da revisão automática: no CodeAnt, os mesmos três caminhos vão na exclusão de arquivos
do painel do projeto (Code Review → Configuration → Exclusions → Exclude Files). A mergex
não enxerga o painel: quando o PR leva artefatos de método, o relato do E7 ao desenvolvedor
lembra os três padrões a excluir lá — o `PR.md` não, que sai do E4 sem essa entrada.

Saída `0`: siga para o passo 2 (ou 3, sem ferramenta); avisos (arquivo perto do limite) vão para a seção de atenção do
`PR.md`, sem impedir. Saída `1`: o E7 **não abre o PR**. Um PR acima do limite não recebe
revisão automática (o CodeAnt pula PR com mais de 100 arquivos e documenta 5.000 linhas por
arquivo), e PR sem revisão que parece revisado é pior que PR não aberto. Registre o motivo com a
lista de violações, deixe `pr_estado` em `null` e diga ao desenvolvedor como dividir: por
assunto (F1), um PR por fatia, na ordem das tasks. No passo 3 vale igual: o `PR.md` não manda
abrir à mão um PR que reprovou aqui. A exceção de movimento mecânico (F6) só vale
quando **o desenvolvedor** a declara (`FATIA_EXCECAO=<motivo>`), nunca por decisão do E7.

Saída `2` (ou qualquer outra que não `0` nem `1`): o E7 **não abre o PR**. O script não conseguiu
medir — ref inexistente, sem ancestral comum entre a base e o SHA publicado, `git diff` que
falhou — e PR não medido não é PR dentro do limite. Registre o erro literal, deixe `pr_estado` em
`null` e diga ao desenvolvedor o que impediu a medição; no passo 3 vale igual.

## Passo 2 — Abrir o PR

### Rascunho ou pronto para revisão

| Estado do pacote de QA | Como abrir |
|---|---|
| Ainda **não** aprovado | **Rascunho** (`--draft`) |
| Já aprovado (`QA.md` com `VEREDITO: APROVADO`) | **Pronto para revisão** |

Rascunho é o padrão: no fluxo normal, a mergex entrega antes do QA rodar. Um PR em rascunho diz ao time "isto está pronto tecnicamente, mas ainda não passou pelo QA" — e o E9 nunca faz merge de rascunho.

### O comando

Título: o do trabalho — o mesmo do `ORQUESTRADOR.md`. Corpo: o conteúdo de `PR.md`, integralmente.
A base é o `$bb` do passo 1.5 — a `branch_base` já sem o remoto e sem `refs/...` —, nunca a
`branch_base` crua: o serviço não conhece `upstream/main` como branch, e a abertura falharia.

```
gh pr create --base "$bb" --head <branch> --title "<título>" --body-file docs/entregas/<trabalho_id>/PR.md --draft
```

Sem `--draft` quando o QA já aprovou.

Não adicione revisor, etiqueta, marco ou responsável por conta própria: nada disso está declarado em artefato nenhum, e inventar destinatário é criar conteúdo novo (regra 7). Se o `CONVENCOES.md` da stackx declarar essas convenções, siga-o.

### Se o comando falhar

Qualquer falha — sem permissão, PR já existe, base inválida, rede fora — **não interrompe a entrega**. Vá para o passo 3, registre o erro literal do comando, e siga.

Se a falha for "PR já existe para esta branch", recupere a URL existente (`gh pr view --json url`) e registre-a: é uma retomada, não uma falha. É o caso normal depois de uma reconciliação de base (`references/11-reconciliacao-base.md`): o PR existente é retomado, **nunca um segundo PR**.

## Passo 3 — Quando a ferramenta não está disponível

Não falhe, não pergunte, não peça credencial. Faça três coisas:

1. **`PR.md` já está gravado** pelo E4 — confirme que existe e está completo.
2. **Informe que o push foi feito** e que a branch está no remoto.
3. **Diga ao desenvolvedor que basta abrir o PR manualmente**, com o que ele precisa para isso.

```
mergex E7 — pull request não aberto automaticamente

Motivo: <ferramenta de linha de comando não instalada | não autenticada | serviço não suportado>

O trabalho está entregue:
  branch <branch> empurrada para o remoto
  descrição pronta em docs/entregas/<trabalho_id>/PR.md
  pacote de QA em docs/entregas/<trabalho_id>/QA-PACOTE.md

Para abrir o PR: crie o pull request de <branch> para <$bb do passo 1.5> e cole o
conteúdo de PR.md na descrição.
```

Registre `pr_url: null` e `pr_estado: null` no `ENTREGA.md`. **Isto não é uma falha da entrega** — não relate como erro.

**No `.expx/estado.json`, `pr_estado` permanece `null`.** Não houve pull request: a
descrição está num arquivo, e arquivo não é PR. Não invente estado de PR que não existe —
`rascunho` na barra significa "existe um PR em rascunho no serviço de hospedagem", e usá-lo
aqui faria a barra mentir para quem confia nela.

Como `null` é o valor que o campo já tem desde o E0, na prática **não há o que gravar**.
`branch` também fica como está.

## Passo 4 — Registrar

Sucesso: grave no `ENTREGA.md` a `pr_url` devolvida pelo comando e `pr_estado` (`rascunho` ou `aberto`). Reescreva `atualizado_em`.

Essa gravação fica na árvore de trabalho: quem a leva ao histórico, junto com o estado final da
entrega, é o fechamento final do E8 (`references/08-registro.md`). O E7 não commita e não faz
push.

### Atualize `.expx/estado.json`

Só quando o PR foi de fato aberto (passo 2). Grave **um campo**:

| Como o PR foi aberto | `pr_estado` |
|---|---|
| Rascunho (`--draft`) — o QA ainda não aprovou | `rascunho` |
| Pronto para revisão — `QA.md` com `VEREDITO: APROVADO` | `aberto` |

É o mesmo valor que foi para o `ENTREGA.md`, no mesmo enum minúsculo e sem acento. **Não
toque em `branch`**: ela já está lá desde o E0 e não mudou.

Na retomada de um PR que já existia ("PR já existe para esta branch"), grave o estado real
que a ferramenta devolveu — é retomada, não abertura nova.

O procedimento é o de `10-estado.md`: só se `.expx/` existir, preservando os campos das
outras skills, com gravação em temporário e renomeação. Falha de gravação
**não interrompe o E7**, mas é registrada: `artefato_gravado` com `resultado: falha`, conforme
`10-estado.md`, "Falha de gravação é rastreada".

### Grave o evento no rastro

Acrescente uma linha em `docs/eventos/<trabalho_id>.jsonl`:

```json
{"ts":"<ISO-8601 UTC>","expx_eventos":1,"trabalho_id":"<id>","ferramenta":"mergex","origem":"skill","evento":"pr_aberto","fase":"e7","task":null,"agente":"principal","resultado":"ok","detalhe":"<url do PR>","arquivos":[]}
```

É o `pr_aberto` que permite ao painel mostrar o que aguarda revisão e há quanto
tempo. PR não aberto (ferramenta ausente): não grave `pr_aberto` — não houve.

**`agente` nunca é `null`**: o E7 roda no modelo principal, e o valor é
`principal`. A chave `task` é que vai `null` aqui — a abertura do PR é do
trabalho, não de uma task.

## Critério de saída

Uma das duas, e as duas são sucesso:

- PR aberto, `pr_url` e `pr_estado` registrados no `ENTREGA.md` e `pr_estado` no `.expx/estado.json`; ou
- PR não aberto, motivo registrado, `PR.md` completo, o desenvolvedor informado do que fazer, e `pr_estado` **permanecendo `null`** nos dois lugares.

Siga para o E8.

## Quando falha

| Situação | O que fazer |
|---|---|
| Ferramenta não instalada | Passo 3. Não é erro |
| Ferramenta não autenticada | Passo 3. **Nunca** rode `gh auth login` nem equivalente |
| Serviço não suportado | Passo 3 |
| `fatiamento-da-pr.sh` saiu `1` (PR acima de F2, F3 ou F4) | O E7 **não abre o PR**: registra as violações, `pr_estado` fica `null`, e o desenvolvedor recebe como dividir |
| `fatiamento-da-pr.sh` saiu `2` ou outro código (não mediu: ref inexistente, sem ancestral comum, `git diff` falhou) | O E7 **não abre o PR**: registra o erro literal, `pr_estado` fica `null`; não medido não é dentro do limite |
| Comando falhou por permissão | Passo 3, com o erro literal registrado |
| PR já existe | Recupere a URL e registre; é retomada |
| Sem push | O E7 não roda; siga para o E8 |
| Branch sem upstream (`@{u}` não resolve) ou `git fetch` do upstream falhou | O E7 não abre nem retoma o PR; relate o erro literal; a ref remota local não vale como prova do remoto |
| Ponta da ref remota da branch diferente do SHA enviado no E6 (a ref avançou) | O E7 não abre nem retoma o PR; relate os dois SHAs; o E2 e o E6 de novo |
| Portão vencido (`validade-do-portao.sh --rev <SHA publicado>` com `ok=false`) | O E7 não roda; relate o `motivo` e mande rodar o E2 |
| Alguém pediu para forçar a abertura com credencial | Recuse: a skill nunca configura credencial nem armazena segredo |
| `.expx/` não existe | Segue sem gravar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Segue, registrando `artefato_gravado` com `resultado: falha` (`10-estado.md`); o E7 continua OK e o PR continua aberto |
