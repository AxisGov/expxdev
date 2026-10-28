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
publicado="$(git rev-parse --verify "refs/remotes/$upstream^{commit}")" || exit 2
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

Descubra o serviço pelo remoto de upstream da branch. Não presuma `origin`: a configuração `branch.<nome>.remote` é a identidade exata gravada por `--set-upstream`. Sem branch simbólica, sem `branch.<nome>.remote`, sem `branch.<nome>.merge` ou com upstream local (`.`), o contrato dos pré-requisitos manda falhar fechado; não existe fallback para outro remote:

```bash
resolver_remoto_upstream() {
  branch_atual="$(git symbolic-ref --quiet --short HEAD)" || { echo "branch atual não é simbólica: o E7 não detecta provedor" >&2; return 1; }
  remoto_atual="$(git config --get "branch.$branch_atual.remote")" || { echo "branch sem remote de upstream: o E7 não detecta provedor" >&2; return 1; }
  git config --get "branch.$branch_atual.merge" >/dev/null || { echo "branch sem merge de upstream: o E7 não detecta provedor" >&2; return 1; }
  case "$remoto_atual" in ""|.) echo "upstream local ou vazio: o E7 não detecta provedor" >&2; return 1 ;; esac
  printf '%s\n' "$remoto_atual"
}
remoto="$(resolver_remoto_upstream)" || exit 1
# A URL pode trazer usuário e token (`https://<usuario>:<token>@...`): a saída vai para o transcript,
# então o que fica entre `://` e `@` sai mascarado. Para detectar o serviço, o host basta.
git remote get-url "$remoto" | sed -E 's#(://)[^/@]*@#\1***@#'
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

Antes de abrir — pelo passo 2 **ou** pelo passo 3, que manda abrir à mão —, meça o PR contra os
limites do revisor automático, L2 e L3 do contrato `expx-fatiamento` do ExpxDev. A base é a
`branch_base` do `ENTREGA.md` **no mesmo remoto do upstream** (`$remoto`, dos pré-requisitos), buscada agora e conferida; uma ref
local antiga, ou de outro remoto (fork), mediria o PR contra a base errada. A exceção é a
`branch_base` que já nomeia o remoto (`upstream/main`, `refs/remotes/upstream/main`, como a base
informada pelo chamador no E0 pode vir): aí vale o remoto dela, e só o nome da branch vai para o
fetch. Quem decide é a ref, não a primeira barra: `refs/remotes/<remoto>/<branch>` sempre nomeia o
remoto e `refs/heads/<branch>` nunca nomeia; no nome curto, o primeiro segmento só vira remoto se
for um remoto configurado (`git remote`) **e** o nome inteiro não for branch do remoto do
upstream — `feature/<slug>` é uma branch válida, e um remoto chamado `feature` não a desvia. Só a
resposta "não há essa branch" (saída `2` do `ls-remote --exit-code`) troca o remoto; uma conferência
que falha (rede, credencial) não prova nada e para o E7. A base medida é o `FETCH_HEAD`, o que acabou de chegar, e não a ref de rastreio: um
`origin/HEAD` buscado não atualiza a ref simbólica local, que mediria contra o alvo antigo. E
`origin/HEAD` normaliza para `bb=HEAD`, que não é branch no serviço: o `$bb` vai para o
`gh pr create --base` e para a instrução manual do passo 3, então o `HEAD` do remoto é resolvido
agora, no remoto, para o nome da branch padrão (`refs/heads/main` → `main`).

Cada bloco de comandos deste reference roda numa chamada própria do shell, e variável de um
bloco não chega ao seguinte: este bloco recalcula o `$remoto` e o `$publicado` dos
pré-requisitos — e busca a branch de novo, conferida, porque a ref remota pode ter andado
desde aquela chamada; a ponta continua tendo de ser o `HEAD` —, e grava o remoto-base `$rb`, o
`$bb` resolvido, o `$upstream` e o `$publicado` medido, nessa ordem, num arquivo de estado do
Git, que o passo 2 lê. O estado só
é gravado quando a medição sai `0`, e o de uma execução anterior é apagado na primeira linha,
antes de qualquer busca ou conferência: qualquer falha do bloco, reprovado (`1`) ou não medido
(`2`), deixa o arquivo ausente, e o passo 2 não tem base para abrir o PR.

A `branch_base` é texto do `ENTREGA.md`, e nunca entra no texto do bloco: no shell, um texto
copiado pode virar comando. Antes do bloco, obtenha o caminho com
`git rev-parse --path-format=absolute --git-path mergex-e7-branch-base` e grave nele o valor exato
da `branch_base` **pela ferramenta de escrita de arquivo** do harness — nunca pelo shell (nada de
`echo`, `printf`, heredoc ou redirecionamento com o valor no comando). O bloco lê o arquivo como
dado e o apaga logo em seguida, válido ou não; ausente ou com mais de uma linha (ref nunca tem
quebra de linha), o bloco sai `2`, sem medir. Cada execução exige gravar de novo:

```bash
estado_bb="$(git rev-parse --git-path mergex-e7-base)" && rm -f "$estado_bb" || exit 2   # antes de tudo
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')" || exit 2
remoto="${upstream%%/*}"; ref_remota="${upstream#*/}"
git fetch "$remoto" "$ref_remota" || { echo "busca de $upstream falhou: o E7 não mede nem abre o PR"; exit 2; }
publicado="$(git rev-parse --verify "refs/remotes/$upstream^{commit}")" || exit 2
[ "$publicado" = "$(git rev-parse HEAD)" ] || { echo "a ponta remota ($publicado) não é o HEAD: o E7 não mede nem abre o PR"; exit 2; }
rb="$remoto"
a="$(git rev-parse --path-format=absolute --git-path mergex-e7-branch-base)" || exit 2
bb="$(awk 'NR == 1 { l = $0; sub(/\r$/, "", l) } END { if (NR == 1) print l }' "$a" 2>/dev/null)"; rm -f "$a"
[ -n "$bb" ] || { echo "branch_base ausente ou com mais de uma linha em $a: o E7 não mede nem abre o PR"; exit 2; }
case "$bb" in
  refs/remotes/*/*) bb="${bb#refs/remotes/}"; rb="${bb%%/*}"; bb="${bb#*/}" ;;
  refs/heads/*) bb="${bb#refs/heads/}" ;;
  */*) if git remote | grep -qxF "${bb%%/*}"; then
         git ls-remote --exit-code --heads "$rb" "refs/heads/$bb" >/dev/null 2>&1; rc_ls=$?
         case "$rc_ls" in
           0) ;;
           2) rb="${bb%%/*}"; bb="${bb#*/}" ;;
           *) echo "conferência de $bb em $rb falhou (ls-remote saiu $rc_ls): o E7 não mede nem abre o PR"; exit 2 ;;
         esac
       fi ;;
esac
if [ "$bb" = HEAD ]; then
  bb="$(git ls-remote --symref "$rb" HEAD | awk '$1 == "ref:" && $3 == "HEAD" { sub("^refs/heads/", "", $2); print $2; exit }')"
  [ -n "$bb" ] || { echo "o HEAD de $rb não resolveu para uma branch: o E7 não mede nem abre o PR"; exit 2; }
fi
git fetch "$rb" "$bb" || { echo "busca de $bb em $rb falhou: o E7 não mede nem abre o PR"; exit 2; }
base="$(git rev-parse --verify "FETCH_HEAD^{commit}")" || exit 2
planejamento="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --entrega "docs/entregas/<trabalho_id>/ENTREGA.md" --rev "$publicado")" || { echo "ENTREGA.md ilegível ou incoerente no SHA publicado: o E7 não mede nem abre o PR"; exit 2; }
fatia="$(bash .claude/skills/mergex/scripts/leitor-do-projeto.sh --rev "$publicado")" || { echo "configuração do projeto (.expx/fatiamento.json) não lida: o E7 não mede nem abre o PR"; exit 2; }
set -a; eval "$fatia"; set +a
set --; set -f; ifs_antes="$IFS"; IFS='|'
for parte in $EXPX_EXCLUIR_DA_REVISAO; do [ -n "$parte" ] && set -- "$@" --excluir-da-revisao "$parte"; done
IFS="$ifs_antes"; set +f
case "$planejamento" in planejamento=sim*) set -- --planejamento "$@" ;; esac
bash .claude/skills/mergex/scripts/fatiamento-da-pr.sh "$@" "$base" "$publicado"
rc_fatia=$?; [ "$rc_fatia" = 0 ] && { printf '%s\n%s\n%s\n%s\n' "$rb" "$bb" "$upstream" "$publicado" > "$estado_bb" || exit 2; }; exit "$rc_fatia"
```

Os limites são os do CodeAnt, **fixos**: vêm dos perfis do núcleo do expx, e nenhum projeto os
calibra, nem para afrouxar nem para apertar.

- **L2 — arquivo:** cada arquivo revisável alterado ou criado tem no máximo 5.000 linhas e
  204.800 bytes no SHA publicado, contados como a CLI do revisor conta (quebras de linha + 1;
  vale o maior entre o blob e o arquivo do checkout). Acima disso, o arquivo é pulado pela
  revisão, não revisado.
- **L3 — PR:** no máximo 100 arquivos alterados, **todos** contados, como o `changed_files` do
  serviço: código, lock, gerados e artefatos de método. O app do CodeAnt pula a revisão de PR
  com mais de 100 arquivos.

Não há limite de linhas por PR nem por commit. Nenhum limite nem exclusão vem do ambiente:
variável `FATIA_*` no shell, mesmo vazia, faz o leitor e o script falharem, e o bloco sai `2`.

A configuração do projeto, `.expx/fatiamento.json`, é lida pelo `leitor-do-projeto.sh` com o
leitor do núcleo do expx — nunca o JSON cru —, e o arquivo lido é o do **SHA publicado**
(`--rev "$publicado"`), nunca o do disco: um arquivo sujo, diferente do commitado, não muda a
medida do que o revisor vai ler. Sem o arquivo, o helper devolve os padrões sem chamar node. O
`set -a` exporta o que o leitor imprimiu. O `excluir_da_revisao` do projeto
(`EXPX_EXCLUIR_DA_REVISAO`, pastas literais separadas por `|`) vira argumento: um
`--excluir-da-revisao <pasta>` por pasta, inteira mesmo com espaço no nome, sem expansão de
glob; vazio não gera argumento, e o `set --` garante que nenhum parâmetro posicional herdado
chega ao script. A exclusão só tira a pasta de L2, **nunca de L3**.

Os **artefatos de método** — `docs/sprintx/`, `docs/entregas/`, `docs/eventos/`, o que a
`sprintx` e esta skill gravam na branch — ficam fora de L2 pelo próprio script e **contam** em
L3. No CodeAnt, os mesmos três caminhos vão na exclusão de arquivos do painel do projeto (Code
Review → Configuration → Exclusions → Exclude Files), que os tira da revisão do app, mas não da
conta dos 100: o app conta todos os arquivos alterados. A mergex não enxerga o painel: quando o
PR leva artefatos de método, o relato do E7 ao desenvolvedor lembra os três padrões a excluir
lá — o `PR.md` não, que sai do E4 sem essa entrada.

**O PR de planejamento** (DM-259). Antes de medir, o bloco pergunta a
`entrega-de-planejamento.sh` se o `ENTREGA.md` **do SHA publicado** é a entrega de planejamento
(nunca o do disco). Com `planejamento=sim`, o script recebe `--planejamento` e confere de novo os
caminhos: o PR só leva `docs/sprintx/`, `docs/entregas/` e `docs/eventos/`. L3 **não se mede**
nele — se passar de 100 arquivos, o app pula a revisão, e isso é aceito: esses caminhos ficam
fora da revisão por desenho —, e L2 não se aplica, porque nada nele é revisável. Saída `1` com
`--planejamento` é a **recusa**: o E7 não abre o PR, registra a lista das linhas
`VIOLACAO planejamento` e diz ao desenvolvedor que o PR de planejamento só leva `docs/sprintx/`,
`docs/entregas/` e `docs/eventos/` — o código vai nos PRs das sprints, depois do merge dele. Uma
renomeação de `src/a.ts` para `docs/sprintx/...` também é recusada: a origem conta. Entrega
ilegível ou incoerente no SHA publicado: o bloco sai `2`. Numa entrega comum, nada muda: o
script mede L2 e L3 sem `--planejamento`.

Saída `0`: siga para o passo 2 (ou 3, sem ferramenta). Saída `1`: o E7 **não abre o PR**. Um PR
acima do limite não recebe revisão automática, e PR sem revisão que parece revisado é pior que
PR não aberto. Registre o motivo com a lista de violações, deixe `pr_estado` em `null` e diga ao
desenvolvedor como resolver: em L2, uma task anterior divide o arquivo, deixando o original e as
partes abaixo do limite; em L3, divida a sprint (`entrega: por_sprint`) ou o trabalho
(`por_trabalho`). Nunca force a revisão do app nem abra à mão: no passo 3 vale igual, o `PR.md`
não manda abrir à mão um PR que reprovou aqui.

Saída `2` (ou qualquer outra que não `0` nem `1`): o E7 **não abre o PR**. O script não conseguiu
medir — ref inexistente, sem ancestral comum entre a base e o SHA publicado, objeto ausente,
`git diff` que falhou — e PR não medido não é PR dentro do limite. Registre o erro literal,
deixe `pr_estado` em `null` e diga ao desenvolvedor o que impediu a medição; no passo 3 vale
igual. Também é saída `2`, nunca violação nem os padrões: variável `FATIA_*` no ambiente
(remova-a: os limites são fixos), `.expx/fatiamento.json` inválido (o leitor diz a chave; a
versão 1 pede a migração para a 2), ou presente sem o leitor do núcleo, com o núcleo antigo (sem
`expx-limites.mjs` ou sem `perfis/`), com o núcleo versionado no commit diferente do instalado,
ou sem node (atualize o expx: `expx update`). Medir com os padrões um projeto que declarou os
seus seria medir outra coisa.

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
O destino é o projeto do remoto-base `$rb` medido, e a origem é o projeto do remoto do upstream;
os dois são passados explicitamente à CLI. O comando roda noutra chamada do shell, então `$rb` e
`$bb` vêm do arquivo de estado que o passo 1.5 gravou (sem eles, o passo 1.5 não chegou à
medição, e o PR não abre), e a branch vem do upstream. O passo 2 só abre o que foi medido: o
upstream e o `HEAD` têm de ser os do estado, e a ponta remota (`git ls-remote`), o SHA medido.
Trocar de branch, commitar ou ver a branch remota andar entre as duas chamadas recusa a abertura;
meça de novo pelo passo 1.5. URLs HTTP(S), SSH e SCP são normalizadas
para `HOST/OWNER/REPO`; formato desconhecido falha fechado em vez de abrir no projeto errado. O
`gh` aceita essa forma no `--repo`; o `glab` não a documenta (lê `HOST/…` como grupo), e por isso
recebe a URL completa, `https://HOST/OWNER/REPO`, no `--repo` e no `--head`.

O título é texto do `ORQUESTRADOR.md`, não comando, e nunca entra no texto do bloco: um `$(...)`,
uma crase ou uma quebra de linha nele rodariam na abertura do PR. Antes do bloco, obtenha o
caminho com `git rev-parse --path-format=absolute --git-path mergex-e7-titulo` e grave nele o título
exato, numa linha, **pela ferramenta de escrita de arquivo** do harness — nunca pelo shell. O bloco
o lê como dado, o apaga logo em seguida e o passa ao `gh`/`glab` como `"$titulo"`, literal; ausente
ou com mais de uma linha, o bloco sai `1` sem abrir. Cada tentativa de abertura exige gravar de
novo.

No GitHub (`gh`, do passo 1):

```bash
estado_bb="$(git rev-parse --git-path mergex-e7-base)"
rb="$(sed -n '1p' "$estado_bb")"; bb="$(sed -n '2p' "$estado_bb")"
upstream_medido="$(sed -n '3p' "$estado_bb")"; publicado="$(sed -n '4p' "$estado_bb")"
[ -n "$rb" ] && [ -n "$bb" ] && [ -n "$upstream_medido" ] && [ -n "$publicado" ] \
  || { echo "sem remoto, base, upstream e SHA medidos no passo 1.5: o E7 não abre o PR"; exit 1; }
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')" || exit 1
[ "$upstream" = "$upstream_medido" ] && [ "$(git rev-parse HEAD)" = "$publicado" ] \
  || { echo "a branch ou o HEAD mudaram desde a medição do passo 1.5: o E7 não abre o PR"; exit 1; }
remoto="${upstream%%/*}"; ref_remota="refs/heads/${upstream#*/}"
ponta="$(git ls-remote "$remoto" "$ref_remota" | awk -v r="$ref_remota" '$2 == r { print $1; exit }')"
[ "$ponta" = "$publicado" ] || { echo "a ponta de $upstream não é mais o SHA medido ($publicado): o E7 não abre o PR"; exit 1; }
identidade_remota() {
  local url resto autoridade host caminho
  url="$(git remote get-url "$1")" || return 1
  case "$url" in
    http://*|https://*|git://*)
      resto="${url#*://}"; host="${resto%%/*}"; caminho="${resto#*/}" ;;
    ssh://*)
      resto="${url#ssh://}"; resto="${resto#*@}"; autoridade="${resto%%/*}"
      [ "$autoridade" != "$resto" ] || return 1
      host="${autoridade%%:*}"; caminho="${resto#*/}" ;;
    *:*)
      resto="${url#*@}"; host="${resto%%:*}"; caminho="${resto#*:}" ;;
    *) return 1 ;;
  esac
  caminho="${caminho#/}"; caminho="${caminho%.git}"
  case "$host" in ''|*[!A-Za-z0-9.:-]*) return 1 ;; esac
  case "$caminho" in ''|*[!A-Za-z0-9._/-]*) return 1 ;; esac
  printf '%s/%s\n' "$host" "$caminho"
}
destino="$(identidade_remota "$rb")" || { echo "remoto-base não normalizável: o E7 não abre o PR"; exit 1; }
fonte="$(identidade_remota "$remoto")" || { echo "remoto da origem não normalizável: o E7 não abre o PR"; exit 1; }
[ "${destino%%/*}" = "${fonte%%/*}" ] || { echo "origem e destino estão em hosts distintos: o E7 não abre o PR"; exit 1; }
opcao_rascunho=(--draft)
qa="docs/manutencao/<trabalho_id>/QA.md"
if [ -f "$qa" ] && grep -qF 'VEREDITO: APROVADO' "$qa"; then opcao_rascunho=(); fi
a="$(git rev-parse --path-format=absolute --git-path mergex-e7-titulo)" || exit 1
titulo="$(awk 'NR == 1 { l = $0; sub(/\r$/, "", l) } END { if (NR == 1) print l }' "$a" 2>/dev/null)"; rm -f "$a"
[ -n "$titulo" ] || { echo "título ausente ou com mais de uma linha em $a: o E7 não abre o PR"; exit 1; }
head="${upstream#*/}"
if [ "$fonte" != "$destino" ]; then
  projeto_fonte="${fonte#*/}"; dono_fonte="${projeto_fonte%%/*}"
  [ -n "$dono_fonte" ] && [ "${projeto_fonte#*/}" != "$projeto_fonte" ] || { echo "projeto da origem inválido: o E7 não abre o PR"; exit 1; }
  head="$dono_fonte:$head"
fi
saida_pr="$(gh pr create --repo "$destino" --base "$bb" --head "$head" --title "$titulo" --body-file docs/entregas/<trabalho_id>/PR.md "${opcao_rascunho[@]}" 2>&1)"; rc_pr=$?
printf '%s\n' "$saida_pr"
if [ "$rc_pr" != 0 ]; then
  # Só "PR já existe para esta branch" vira retomada, e aqui mesmo, onde `head` e `destino`
  # existem — numa chamada de shell separada eles não sobrevivem (katosmv/login#34). Outra
  # falha (rede, permissão, base) sai com o código e o erro literal do gh, para o passo 3.
  case "$saida_pr" in
    *"already exists"*) ;;
    *) echo "gh pr create falhou (rc $rc_pr): registre o erro literal acima no passo 3 e siga"; exit "$rc_pr" ;;
  esac
  pr_url="$(gh pr view "$head" --repo "$destino" --json url --jq '.url')" || { echo "PR existente não recuperado no destino"; exit 1; }
  linhas_url="$(printf '%s\n' "$pr_url" | awk 'END { print NR }')"
  [ -n "$pr_url" ] && [ "$linhas_url" = 1 ] || { echo "recuperação do PR retornou zero ou múltiplas URLs"; exit 1; }
  echo "PR existente retomado: $pr_url"
fi
```

No GitLab (`glab`, do passo 1), o equivalente é o merge request; o `--yes` pula a confirmação
interativa do `glab`, que de outro modo esperaria uma resposta:

```bash
estado_bb="$(git rev-parse --git-path mergex-e7-base)"
rb="$(sed -n '1p' "$estado_bb")"; bb="$(sed -n '2p' "$estado_bb")"
upstream_medido="$(sed -n '3p' "$estado_bb")"; publicado="$(sed -n '4p' "$estado_bb")"
[ -n "$rb" ] && [ -n "$bb" ] && [ -n "$upstream_medido" ] && [ -n "$publicado" ] \
  || { echo "sem remoto, base, upstream e SHA medidos no passo 1.5: o E7 não abre o PR"; exit 1; }
upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')" || exit 1
[ "$upstream" = "$upstream_medido" ] && [ "$(git rev-parse HEAD)" = "$publicado" ] \
  || { echo "a branch ou o HEAD mudaram desde a medição do passo 1.5: o E7 não abre o PR"; exit 1; }
remoto="${upstream%%/*}"; ref_remota="refs/heads/${upstream#*/}"
ponta="$(git ls-remote "$remoto" "$ref_remota" | awk -v r="$ref_remota" '$2 == r { print $1; exit }')"
[ "$ponta" = "$publicado" ] || { echo "a ponta de $upstream não é mais o SHA medido ($publicado): o E7 não abre o PR"; exit 1; }
identidade_remota() {
  local url resto autoridade host caminho
  url="$(git remote get-url "$1")" || return 1
  case "$url" in
    http://*|https://*|git://*)
      resto="${url#*://}"; host="${resto%%/*}"; caminho="${resto#*/}" ;;
    ssh://*)
      resto="${url#ssh://}"; resto="${resto#*@}"; autoridade="${resto%%/*}"
      [ "$autoridade" != "$resto" ] || return 1
      host="${autoridade%%:*}"; caminho="${resto#*/}" ;;
    *:*)
      resto="${url#*@}"; host="${resto%%:*}"; caminho="${resto#*:}" ;;
    *) return 1 ;;
  esac
  caminho="${caminho#/}"; caminho="${caminho%.git}"
  case "$host" in ''|*[!A-Za-z0-9.:-]*) return 1 ;; esac
  case "$caminho" in ''|*[!A-Za-z0-9._/-]*) return 1 ;; esac
  printf '%s/%s\n' "$host" "$caminho"
}
destino="$(identidade_remota "$rb")" || { echo "remoto-base não normalizável: o E7 não abre o PR"; exit 1; }
fonte="$(identidade_remota "$remoto")" || { echo "remoto da origem não normalizável: o E7 não abre o PR"; exit 1; }
[ "${destino%%/*}" = "${fonte%%/*}" ] || { echo "origem e destino estão em hosts distintos: o E7 não abre o PR"; exit 1; }
opcao_rascunho=(--draft)
qa="docs/manutencao/<trabalho_id>/QA.md"
if [ -f "$qa" ] && grep -qF 'VEREDITO: APROVADO' "$qa"; then opcao_rascunho=(); fi
a="$(git rev-parse --path-format=absolute --git-path mergex-e7-titulo)" || exit 1
titulo="$(awk 'NR == 1 { l = $0; sub(/\r$/, "", l) } END { if (NR == 1) print l }' "$a" 2>/dev/null)"; rm -f "$a"
[ -n "$titulo" ] || { echo "título ausente ou com mais de uma linha em $a: o E7 não abre o PR"; exit 1; }
branch_fonte="${upstream#*/}"; projeto_fonte="${fonte#*/}"
projeto_fonte_codificado="$(node -p 'encodeURIComponent(process.argv[1])' "$projeto_fonte")" || exit 1
fonte_id="$(glab api "projects/$projeto_fonte_codificado" | node -e 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync(0,"utf8")); if(!Number.isSafeInteger(v.id)) process.exit(2); process.stdout.write(String(v.id))')" || { echo "projeto fonte não resolvido"; exit 1; }
pagina=1; por_pagina=100; quantidade=0; pr_url=""
while :; do
  pagina_json="$(glab mr list --repo "https://$destino" --source-branch "$branch_fonte" --target-branch "$bb" --output json --page "$pagina" --per-page "$por_pagina")" || { echo "MRs abertas não listadas no destino"; exit 1; }
  pagina_lida="$(printf '%s' "$pagina_json" | node -e 'const fs=require("fs"); const b=process.argv[1], id=process.argv[2], target=process.argv[3]; const xs=JSON.parse(fs.readFileSync(0,"utf8")); if(!Array.isArray(xs)) process.exit(2); const ms=xs.filter(x => x.source_branch===b && String(x.source_project_id)===id && x.target_branch===target); process.stdout.write(String(xs.length)+"\n"+String(ms.length)+"\n"+(ms.length===1 ? String(ms[0].web_url||"") : ""))' "$branch_fonte" "$fonte_id" "$bb")" || exit 1
  quantidade_pagina="$(printf '%s\n' "$pagina_lida" | sed -n '1p')"
  encontradas_pagina="$(printf '%s\n' "$pagina_lida" | sed -n '2p')"
  url_pagina="$(printf '%s\n' "$pagina_lida" | sed -n '3p')"
  quantidade=$((quantidade + encontradas_pagina))
  [ -z "$url_pagina" ] || [ -n "$pr_url" ] || pr_url="$url_pagina"
  [ "$quantidade_pagina" -lt "$por_pagina" ] && break
  pagina=$((pagina + 1))
done
case "$quantidade" in
  0) glab mr create --repo "https://$destino" --head "https://$fonte" --target-branch "$bb" --source-branch "$branch_fonte" --title "$titulo" --description "$(cat docs/entregas/<trabalho_id>/PR.md)" "${opcao_rascunho[@]}" --yes ;;
  1) [ -n "$pr_url" ] || { echo "MR única sem web_url"; exit 1; } ;;
  *) echo "mais de uma MR aberta para $projeto_fonte:$branch_fonte no destino"; exit 1 ;;
esac
```

Sem `--draft` quando o QA já aprovou.

Não adicione revisor, etiqueta, marco ou responsável por conta própria: nada disso está declarado em artefato nenhum, e inventar destinatário é criar conteúdo novo (regra 7). Se o `CONVENCOES.md` da stackx declarar essas convenções, siga-o.

### Se o comando falhar

Qualquer falha — sem permissão, PR já existe, base inválida, rede fora — **não interrompe a entrega**. Vá para o passo 3, registre o erro literal do comando, e siga.

Se a falha for "PR já existe para esta branch" no GitHub (a saída do `gh pr create` diz `already exists`), o próprio bloco do passo 2 recupera a URL escalar no **projeto de destino**, exigindo exatamente uma linha: a recuperação mora no mesmo bloco que tenta criar, porque `head` e `destino` só existem ali. Qualquer outra falha sai do bloco com o erro literal do `gh pr create`, sem consultar o PR, e esse erro vai para o passo 3.

No GitLab, a consulta exata por projeto fonte e branch já ocorre antes do `glab mr create`: zero cria, uma retoma e mais de uma falha fechado. É uma retomada, não uma falha. É o caso normal depois de uma reconciliação de base (`references/11-reconciliacao-base.md`): a solicitação existente é retomada, **nunca uma segunda solicitação**.

Na entrega `por_sprint`, isso só é retomada quando o PR existente é o da `sprint_atual` que o
E0 registrou. Um PR `merged` da sprint anterior é histórico em `prs`, **não é retomada**: depois
de o E0 abrir a sprint seguinte, o E7 abre o PR novo dessa sprint. Nunca associe à sprint atual a
URL do PR já fechado da anterior.

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
| `fatiamento-da-pr.sh` saiu `1` (L2: arquivo revisável acima de 5.000 linhas ou 204.800 bytes; L3: mais de 100 arquivos) | O E7 **não abre o PR**: registra as violações, `pr_estado` fica `null`, e o desenvolvedor recebe como dividir (L2: uma task anterior divide o arquivo; L3: dividir a sprint ou o trabalho); nunca força a revisão do app |
| `fatiamento-da-pr.sh` saiu `2` ou outro código (não mediu: ref inexistente, sem ancestral comum, objeto ausente, `git diff` falhou; ou `FATIA_*` no ambiente) | O E7 **não abre o PR**: registra o erro literal, `pr_estado` fica `null`; não medido não é dentro do limite. Com `FATIA_*` no ambiente, o desenvolvedor remove a variável |
| `leitor-do-projeto.sh` falhou (`FATIA_*` no ambiente, `.expx/fatiamento.json` inválido ou na versão 1, ou presente sem o leitor do núcleo, com núcleo antigo — sem `expx-limites.mjs` ou `perfis/` —, com o núcleo do commit diferente do instalado, ou sem node): o bloco sai `2` | O E7 **não abre o PR**: registra o erro literal (a variável a remover, a chave inválida, ou `expx update`), `pr_estado` fica `null`; nunca mede com os padrões |
| PR de planejamento com arquivo fora de `docs/sprintx/`, `docs/entregas/` e `docs/eventos/` (`fatiamento-da-pr.sh --planejamento` saiu `1`, linhas `VIOLACAO planejamento`) | O E7 **recusa**: não abre o PR, registra a lista, `pr_estado` fica `null`, e diz que o PR de planejamento só leva os artefatos de método; L3 não se mede nele |
| `entrega-de-planejamento.sh` falhou no SHA publicado (`ENTREGA.md` ausente, ilegível ou com `sprint_atual` e `prs` incoerentes): o bloco sai `2` | O E7 **não abre o PR**: registra o motivo, `pr_estado` fica `null` |
| Comando falhou por permissão | Passo 3, com o erro literal registrado |
| PR já existe | Recupere a URL e registre; é retomada |
| Sem push | O E7 não roda; siga para o E8 |
| Branch sem upstream (`@{u}` não resolve) ou `git fetch` do upstream falhou | O E7 não abre nem retoma o PR; relate o erro literal; a ref remota local não vale como prova do remoto |
| Ponta da ref remota da branch diferente do SHA enviado no E6 (a ref avançou) | O E7 não abre nem retoma o PR; relate os dois SHAs; o E2 e o E6 de novo |
| Portão vencido (`validade-do-portao.sh --rev <SHA publicado>` com `ok=false`) | O E7 não roda; relate o `motivo` e mande rodar o E2 |
| Alguém pediu para forçar a abertura com credencial | Recuse: a skill nunca configura credencial nem armazena segredo |
| `.expx/` não existe | Segue sem gravar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Segue, registrando `artefato_gravado` com `resultado: falha` (`10-estado.md`); o E7 continua OK e o PR continua aberto |
