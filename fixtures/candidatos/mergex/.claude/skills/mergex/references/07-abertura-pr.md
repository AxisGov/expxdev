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

Serviço sem ferramenta conhecida (Bitbucket, Azure DevOps, Gitea, servidor interno): trate como ausente e vá para o passo 3.

## Passo 2 — Abrir o PR

### Rascunho ou pronto para revisão

| Estado do pacote de QA | Como abrir |
|---|---|
| Ainda **não** aprovado | **Rascunho** (`--draft`) |
| Já aprovado (`QA.md` com `VEREDITO: APROVADO`) | **Pronto para revisão** |

Rascunho é o padrão: no fluxo normal, a mergex entrega antes do QA rodar. Um PR em rascunho diz ao time "isto está pronto tecnicamente, mas ainda não passou pelo QA" — e o E9 nunca faz merge de rascunho.

### O comando

Título: o do trabalho — o mesmo do `ORQUESTRADOR.md`. Corpo: o conteúdo de `PR.md`, integralmente.

```
gh pr create --base <branch-base> --head <branch> --title "<título>" --body-file docs/entregas/<trabalho_id>/PR.md --draft
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

Para abrir o PR: crie o pull request de <branch> para <branch-base> e cole o
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
outras skills, com gravação em temporário e renomeação. Falha de gravação é **silenciosa** e
**não interrompe o E7** — sem linha de rastro, pela lacuna registrada em `10-estado.md`,
"A lacuna".

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
| Comando falhou por permissão | Passo 3, com o erro literal registrado |
| PR já existe | Recupere a URL e registre; é retomada |
| Sem push | O E7 não roda; siga para o E8 |
| Branch sem upstream (`@{u}` não resolve) ou `git fetch` do upstream falhou | O E7 não abre nem retoma o PR; relate o erro literal; a ref remota local não vale como prova do remoto |
| Ponta da ref remota da branch diferente do SHA enviado no E6 (a ref avançou) | O E7 não abre nem retoma o PR; relate os dois SHAs; o E2 e o E6 de novo |
| Portão vencido (`validade-do-portao.sh --rev <SHA publicado>` com `ok=false`) | O E7 não roda; relate o `motivo` e mande rodar o E2 |
| Alguém pediu para forçar a abertura com credencial | Recuse: a skill nunca configura credencial nem armazena segredo |
| `.expx/` não existe | Segue sem gravar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Segue **em silêncio**, sem rastro (`10-estado.md`, "A lacuna"); o E7 continua OK e o PR continua aberto |
