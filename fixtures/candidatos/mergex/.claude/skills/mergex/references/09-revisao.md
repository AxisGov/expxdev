# E9 — REVISÃO E MERGE (MANUAL)

Você está no E9. Esta etapa é diferente de todas as outras da mergex.

**O E9 NUNCA executa automaticamente.** Não é encadeado por nenhum fluxo, não é sugerido ao fim de um trabalho, não aparece como "próximo passo" em relatório nenhum, e não é oferecido depois do E8. Ele só roda quando o desenvolvedor chama `/mergex-revisar` explicitamente (regra 16).

Se você chegou aqui por qualquer outro caminho que não uma chamada explícita, **volte**: você está encadeando o que não pode ser encadeado.

O E9 tem uma função: **dar ao desenvolvedor o estado real de cada PR aberto, na ordem que faz o dia render, e conduzir um merge por vez com confirmação.** Ele não decide, não resolve conflito, não aprova.

## Pré-requisitos verificáveis

- Chamada explícita do desenvolvedor.
- Repositório versionado com remoto configurado.
- Ferramenta de linha de comando do serviço presente e autenticada (`gh auth status` / `glab auth status`).

Sem a ferramenta, o E9 não tem como listar nem integrar PRs. Diga isso e encerre — **nunca peça credencial** (regra 12):

```
mergex E9 — não é possível listar os pull requests

Motivo: <ferramenta não instalada | não autenticada>
A revisão e o merge precisam ser feitos pela interface do serviço de hospedagem.
```

## Passo 1 — Listar os pull requests abertos

A lista tem de ser **completa**: o E9 apresenta e avalia todos os PRs abertos. O `gh pr list`
devolve só os 30 mais recentes por padrão, e um `--limit` fixo apenas desloca o corte; por isso
os números vêm da API paginada, percorrida até a última página, e o estado de cada PR vem de uma
leitura por PR:

```
gh api --paginate "repos/{owner}/{repo}/pulls?state=open&per_page=100" --jq '.[].number'
gh pr view <n> --json number,title,author,headRefName,headRefOid,baseRefName,isDraft,mergeable,url,files,statusCheckRollup
```

No GitLab: `glab api --paginate "projects/:id/merge_requests?state=opened&per_page=100"`. Se
alguma página não puder ser obtida, a lista não é completa: diga isso, com o erro literal, e
encerre — nunca apresente a primeira página como se fosse a lista inteira.

Inclui rascunhos: eles aparecem na lista, marcados, mas **nunca são oferecidos para merge**.

Nenhum PR aberto: diga isso e encerre.

## Passo 2 — Reunir o estado de cada PR

Para cada PR, junte **o que estiver disponível**. Fonte ausente vira "não disponível" na apresentação — nunca suposição.

| Dado | Onde buscar | Quando ausente |
|---|---|---|
| Registro de entrega da mergex | `docs/entregas/<trabalho_id>/ENTREGA.md` na branch do PR | "sem registro da mergex" — PR aberto por fora do método |
| Faixa de raio da legadox | `raio` do `ENTREGA.md` | "raio não calculado" |
| Classificação de atenção | `atencao` do `ENTREGA.md`, ou `ATENCAO.md` na branch | "não classificado" |
| Resultado da integração contínua | `statusCheckRollup` do HEAD autoritativo (GitHub); `head_pipeline` do merge request (GitLab) | Resultado ausente **não** é CI ausente. Com configuração de CI no HEAD (`.github/workflows/*.yml` ou `*.yaml`, `.gitlab-ci.yml`), o CI está configurado: `head_pipeline` nulo ou rollup vazio é pipeline que ainda não anexou, e R1 é `NÃO VERIFICÁVEL`, nunca `n/a`. Check reportado é CI configurado: CI externo (Jenkins, CircleCI, app de checks) não deixa arquivo no HEAD, mas aparece no rollup/pipeline, e check não verde ali é R1 `FALHOU`. "sem integração contínua configurada" (`n/a`) só sem nenhuma configuração de CI no HEAD, sem nenhum check reportado para ele **e** sem check obrigatório na proteção da base. CI externo que ainda não reportou é visível só por ali, e no GitHub são dois mecanismos, lidos os dois: a proteção clássica da branch (`gh api repos/<dono>/<repo>/branches/<base>`, `protection.required_status_checks`: `contexts` e `checks`) e os rulesets (`gh api repos/<dono>/<repo>/rules/branches/<base>`, regra `required_status_checks`); um só não basta, porque cada endpoint ignora o outro mecanismo; check obrigatório sem resultado no HEAD é R1 `NÃO VERIFICÁVEL`, e leitura de qualquer dos dois que falha também é R1 `NÃO VERIFICÁVEL`, nunca `n/a`: sem ela, a ausência de check obrigatório não está provada |
| Conflito com a base | `mergeable` do PR | Verifique localmente (passo 5) |
| Arquivos tocados | `files` do PR | `git diff --name-only <base>...<head>` |
| Aberto pela mergex nesta máquina | `pr_url` do `ENTREGA.md` local casa com a URL do PR | Assuma que não |
| Reviews, requested changes, comentários e threads | API do serviço — ver "Operações de review por plataforma", abaixo | Trate como fonte ausente para o REVIEW EVIDENCE GATE — ver "Quando falha" |
| HEAD autoritativo do PR | `headRefOid` do PR (GitHub); `sha` do merge request (GitLab) — ver "HEAD autoritativo", abaixo | R4 não pode ser `OK`. R1 segue a própria regra: sem CI configurado continua `n/a`; com CI configurado, o resultado do HEAD atual não é obtível e R1 é `NÃO VERIFICÁVEL` |

### Trabalho atual no E9

Esta é a **única** definição de "trabalho atual" no E9. Ela decide duas coisas: o destino do
rastro da sessão (ver "Destino do rastro") e se um PR mergeado atualiza `pr_estado` no
`.expx/estado.json` (passo 7, item 7). A fonte é o versionador e o registro da entrega:

1. `git branch --show-current`.
2. Localize `docs/entregas/*/ENTREGA.md`.
3. Há trabalho atual **somente** se existir **exatamente um** `ENTREGA.md` cujo campo `branch`
   seja igual à branch Git atual. O trabalho atual é o `trabalho_id` desse `ENTREGA.md`.

**Trabalho atual = nenhum** quando:

- a branch atual é a principal do repositório (`main` ou equivalente);
- o HEAD está destacado (`git branch --show-current` vazio);
- nenhum `ENTREGA.md` tem `branch` igual à branch atual;
- mais de um `ENTREGA.md` tem essa `branch`;
- houver qualquer dúvida (frontmatter ilegível, `branch` ausente).

Nunca decida o trabalho atual por:

- `.expx/estado.json` — é só **saída** (ver `10-estado.md`): pode ser escrito depois que a
  decisão foi tomada por Git + `ENTREGA.md`, nunca lido para tomá-la;
- o `ENTREGA.md` modificado mais recentemente;
- o PR que está sendo revisado.

### O PR de planejamento (e o da sprint) do trabalho atual

O E9 é o **único** que registra o merge do PR de planejamento (DM-260) e o do PR de cada sprint
da entrega por sprint (DM-264), inclusive o feito fora dele, pelo botão do serviço. Com trabalho
atual, quando `entrega-de-planejamento.sh` diz `sprint_atual=planejamento` ou `sprint_atual=<NN>`
com o item dela ainda não `merged` (`atual_estado=`) e a URL desse item preenchida (`atual_url=`,
nunca o `pr_url` do topo, que fica `null` na entrega por sprint), o E9 lê esse PR no
serviço e, se ele já foi mergeado, grava o registro com `merge_sha` = o commit de merge:

```bash
# E9: o merge do PR de planejamento ou da sprint do trabalho atual (DM-260, DM-264)
entrega="docs/entregas/<trabalho_id>/ENTREGA.md"
marca="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --entrega "$entrega")" || exit 2
reparo=nao; alvo=""; merge_esperado=""
p_merge="$(printf '%s\n' "$marca" | sed -n 's/^planejamento_merge_sha=//p')"
p_base="$(printf '%s\n' "$marca" | sed -n 's/^planejamento_base_sha=//p')"
if [ -n "$p_merge" ] && [ "$p_base" = null ]; then
  # Registro anterior à DM-269: o planejamento já é histórico, mas o E9 ainda
  # consegue completar exclusivamente a base ausente pelo PR gravado no item.
  reparo=sim; alvo=planejamento; merge_esperado="$p_merge"
  pr_url="$(printf '%s\n' "$marca" | sed -n 's/^planejamento_url=//p')"
else
  alvo="$(printf '%s\n' "$marca" | sed -n 's/^sprint_atual=//p')"
  case "$alvo" in planejamento|[0-9][0-9]) ;; *) exit 0 ;; esac
  case "$(printf '%s\n' "$marca" | sed -n 's/^atual_estado=//p')" in merged) exit 0 ;; esac
  pr_url="$(printf '%s\n' "$marca" | sed -n 's/^atual_url=//p')"
fi
case "$pr_url" in ''|null) echo "PR atual sem pr_url: nada a ler no serviço"; exit 0 ;; esac
case "$pr_url" in
  */-/merge_requests/*)   # GitLab: a API do projeto do remoto, como no passo 1
    iid="${pr_url##*/-/merge_requests/}"; iid="${iid%%[!0-9]*}"
    [ -n "$iid" ] || { echo "pr_url do GitLab sem número de MR: nada gravado"; exit 3; }
    command -v glab >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 \
      || { echo "sem glab ou jq: o merge do MR de planejamento não foi lido, nada gravado"; exit 3; }
    mr="$(glab api "projects/:id/merge_requests/$iid")" \
      || { echo "o serviço não respondeu sobre $pr_url: nada gravado"; exit 3; }
    # cada campo lido sozinho: juntos por espaço, o `read` engolia o vazio, e o
    # squash_commit_sha de um squash sem merge_commit_sha caía no lugar do merge
    estado_pr="$(printf '%s\n' "$mr" | jq -r '.state // "" | ascii_upcase')" \
      && merge_api="$(printf '%s\n' "$mr" | jq -r '.merge_commit_sha // ""')" \
      && squash_api="$(printf '%s\n' "$mr" | jq -r '.squash_commit_sha // ""')" \
      || { echo "a resposta do serviço para $pr_url é ilegível: nada gravado"; exit 3; }
    if [ "$estado_pr" != MERGED ]; then
      resposta="$estado_pr  "
    else
      merge_sha="$merge_api"; [ -n "$merge_sha" ] || merge_sha="$squash_api"
      [ -n "$merge_sha" ] || { echo "MERGED sem commit de merge: nada gravado"; exit 3; }
      commit_api="$(glab api "projects/:id/repository/commits/$merge_sha")" \
        || { echo "o commit integrado $merge_sha não foi lido no GitLab: nada gravado"; exit 3; }
      pais="$(printf '%s\n' "$commit_api" | jq -r '.parent_ids[]?')" \
        || { echo "os pais do commit integrado $merge_sha são ilegíveis: nada gravado"; exit 3; }
      n_pais="$(printf '%s\n' "$pais" | grep -c .)"
      base_sha=""
      if [ "$n_pais" -ge 2 ]; then
        base_sha="$(printf '%s\n' "$pais" | sed -n 1p)"
      elif [ "$n_pais" = 1 ] && [ -n "$squash_api" ] && [ "$merge_sha" = "$squash_api" ]; then
        base_sha="$(printf '%s\n' "$pais" | sed -n 1p)"
      elif [ "$n_pais" = 1 ]; then
        commits_api="$(glab api --paginate "projects/:id/merge_requests/$iid/commits?per_page=100")" \
          || { echo "os commits do MR $iid não foram lidos no GitLab: nada gravado"; exit 3; }
        total_comprovavel="$(printf '%s\n' "$commits_api" | jq -sr --arg m "$merge_sha" '
          (if length == 1 and ((.[0] | type) == "array") then .[0] else add end) as $cs
          | if ($cs | length) == 1 and $cs[0].id == $m then 1 else 0 end')" \
          || { echo "a linhagem do MR $iid é ilegível: nada gravado"; exit 3; }
        if [ "$total_comprovavel" = 1 ]; then
          base_sha="$(printf '%s\n' "$pais" | sed -n 1p)"
        else
          echo "base histórica de merge linear com múltiplos commits não comprovável offline: nada gravado"
          exit 3
        fi
      fi
      resposta="$estado_pr $merge_sha $base_sha"
    fi
    ;;
  *)
    command -v gh >/dev/null 2>&1 && command -v jq >/dev/null 2>&1 \
      || { echo "sem gh ou jq: o merge do PR de planejamento não foi lido, nada gravado"; exit 3; }
    repositorio="$(printf '%s\n' "$pr_url" | sed -nE 's#^https://github.com/([^/]+)/([^/]+)/pull/[0-9]+/?$#\1/\2#p')"
    [ -n "$repositorio" ] || { echo "pr_url do GitHub fora da forma /org/repo/pull/N: nada gravado"; exit 3; }
    pr_api="$(gh pr view "$pr_url" --json state,mergeCommit,commits)" \
      || { echo "o serviço não respondeu sobre $pr_url: nada gravado"; exit 3; }
    resposta="$(printf '%s\n' "$pr_api" | jq -r '[.state, (.mergeCommit.oid // ""), (.commits | length)] | join(" ")')" \
      || { echo "o PR do GitHub é ilegível: nada gravado"; exit 3; }
    read -r estado_pr merge_sha total_commits _ <<EOF
$resposta
EOF
    if [ "$estado_pr" = MERGED ]; then
      [ -n "$merge_sha" ] || { echo "MERGED sem commit de merge: nada gravado"; exit 3; }
      commit_api="$(gh api "repos/$repositorio/commits/$merge_sha")" \
        || { echo "o commit integrado $merge_sha não foi lido no GitHub: nada gravado"; exit 3; }
      pais="$(printf '%s\n' "$commit_api" | jq -r '.parents[].sha')" \
        || { echo "pais do commit integrado $merge_sha ilegíveis: nada gravado"; exit 3; }
      n_pais="$(printf '%s\n' "$pais" | grep -c .)"
      base_sha=""
      if [ "$n_pais" -eq 2 ]; then
        # Merge commit: o primeiro pai é a base exata antes da integração.
        base_sha="$(printf '%s\n' "$pais" | sed -n 1p)"
      elif [ "$n_pais" -eq 1 ] && [ "$total_commits" -eq 1 ]; then
        # Um único commit: tanto squash como rebase/fast-forward têm base
        # comprovável no pai desse commit integrado.
        base_sha="$(printf '%s\n' "$pais" | sed -n 1p)"
      else
        # Um PR com vários commits squashados/rebaseados em histórico linear
        # não oferece pelo último commit prova suficiente da base inicial.
        echo "base histórica de merge linear com $total_commits commits não comprovável: nada gravado"
        exit 3
      fi
      resposta="$estado_pr $merge_sha $base_sha"
    fi ;;
esac
read -r estado_pr merge_sha base_sha _ <<EOF
$resposta
EOF
[ "$estado_pr" = MERGED ] || { echo "PR atual ainda não mergeado (${estado_pr:-sem estado}): nada gravado"; exit 0; }
[ -n "$merge_sha" ] || { echo "MERGED sem commit de merge: nada gravado"; exit 3; }
[ -n "$base_sha" ] || { echo "MERGED sem uma base de integração comprovável: nada gravado"; exit 3; }
if [ "$reparo" = sim ]; then
  [ "$merge_sha" = "$merge_esperado" ] \
    || { echo "o serviço devolveu outro merge para o planejamento histórico ($merge_sha != $merge_esperado): nada gravado"; exit 3; }
  bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --completar-base "$alvo" --entrega "$entrega" --merge-sha "$merge_sha" --base-sha "$base_sha"
else
  bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --registrar-merge --entrega "$entrega" --merge-sha "$merge_sha" --base-sha "$base_sha"
fi
```

No GitHub, **nunca** use `baseRefOid` depois do merge: ele pode refletir a ponta
atual da branch base, avançada por PRs posteriores. O bloco usa os pais do commit
integrado: dois pais indicam merge comum e o primeiro é a base histórica; um
único pai só é aceito quando o PR tinha exatamente **um** commit, pois nesse caso
o pai comprova a base tanto de squash como de rebase/fast-forward. Um PR linear
com múltiplos commits (squash ou rebase) falha fechado enquanto a base exata não
puder ser comprovada independentemente; jamais registra o pai do último commit
como se fosse necessariamente a base inicial.

No GitLab (`pr_url` com `/-/merge_requests/`), o bloco lê o MR pela API do projeto e o commit
integrado pela API de commits. Em merge comum ou squash, a base é o primeiro pai do resultado; em
fast-forward/rebase linear, o pai só é aceito quando o MR tem exatamente um commit. Histórico
linear com múltiplos commits falha fechado: a V9 offline não teria como distinguir a base real de
um `base_sha` forjado dentro da própria linhagem. `diff_refs.start_sha` é só a base da versão
do diff e **não** prova a base no instante do merge (DM-267). O registro é o do passo 7,
item 7: no item atual de `prs`, `estado: merged`, `merge_sha`, `merge: humano` e `base_sha`
(a ponta comprovada da base quando o PR foi integrado), e `pr_estado: merged` no topo — o script
grava só isso e confere a gravação. Num item histórico anterior à DM-269, o E9 usa a URL gravada
nele e `--completar-base` preenche exclusivamente o `base_sha: null`, sem reabrir nem alterar a
sprint atual. **Sem ferramenta, sem resposta,
sem o commit de merge ou sem a base, não grava nada** e diz o motivo; PR ainda aberto também
não grava. A V9 da primeira sprint exige que `base_sha` seja exatamente o primeiro pai de
`merge_sha` e só então confere `base_sha..merge_sha`. O E0 da primeira sprint depende desse
registro (`00-abertura.md`, "Retomada depois do PR de planejamento"), e o da sprint seguinte, do
registro do PR da anterior ("A entrega por sprint"); o E0 nunca consulta o serviço. O item
gravado é o da sprint que o E0 registrou (`sprint_atual`), nunca relida do plano.

**O PR de planejamento nunca tem merge automático**, com qualquer configuração: o merge é do
desenvolvedor, no serviço ou confirmado aqui no passo 7. E o aviso do app de revisão de que
pulou a revisão por passar de 100 arquivos não é finding nem pendência: os artefatos de método
ficam fora da revisão por desenho e são conferidos pelos portões das skills.

### A marcação de trabalho próprio

Se o PR foi aberto pela mergex **na mesma máquina** — a `pr_url` de algum `ENTREGA.md` local casa com a URL do PR —, marque-o na lista:

```
[aberto por esta instalação da mergex — a skill não aprova o próprio trabalho]
```

Não é impedimento: é divulgação. Quem aprova é a pessoa, e ela precisa saber que a máquina que está apresentando o PR é a mesma que o produziu.

## O REVIEW EVIDENCE GATE

Antes de oferecer merge de qualquer PR, o E9 avalia automaticamente o estado do review
daquele PR. Isto **não** fura a regra 16: o gate só roda *dentro* de uma execução do E9 já
iniciada por chamada explícita de `/mergex-revisar` — ele não dispara o comando sozinho, e
continua impossível chamá-lo fora dele.

**MUDANÇA DE CÓDIGO NÃO ENCERRA REVIEW. EVIDÊNCIA ENCERRA REVIEW.**

Um finding de review pode ter gerado uma correção no código; isso sozinho não prova que o
reviewer aceitou a correção, que há evidência publicada, que o CI passou de novo, ou que a
thread foi resolvida. O gate existe para que "o código mudou" nunca seja confundido com "o
review encerrou" — foi exatamente essa confusão que apareceu na prática na PR #5 do
AxisGov/expxdev.

### Contrato genérico de reviewer

Bot e humano são **reviewers equivalentes** para o gate. Nada aqui hardcoda o nome de uma
ferramenta de review — nem CodeRabbit, nem CodeAnt, nem nenhuma outra. O gate consome três
formas de sinal, pela plataforma que existir:

- reviews submetidos, inclusive equivalentes a `CHANGES_REQUESTED` e aprovações;
- comentários inline e review threads, com o estado resolved/unresolved e outdated/current
  quando a plataforma expuser;
- comentários gerais relevantes ao PR.

Plataforma que não expõe uma dessas formas: trate como fonte ausente, do mesmo jeito que o
passo 2 trata qualquer dado que a ferramenta não devolve — nunca suposição.

### HEAD autoritativo

R1 e R4 são avaliados contra o **HEAD autoritativo atual do PR**: o SHA que a plataforma
informa como cabeça do PR — `headRefOid` no GitHub, `sha` do merge request no GitLab, o
equivalente em outro serviço.

- `origin/<head>` é só fallback local, e só vale se `git rev-parse origin/<head>` for **igual**
  ao HEAD autoritativo. Divergiu (push posterior não buscado, ref velha, branch homônima em
  outro repositório): descarte o fallback.
- PR vindo de fork normalmente não tem `origin/<head>`, e o gate nunca depende dele. Para testar
  ancestralidade, busque a cabeça do próprio PR (`pull/<n>/head` no GitHub;
  `merge-requests/<iid>/head` no GitLab) **no repositório base**, e confira que o SHA obtido é o
  autoritativo. O repositório base sai da URL do PR, nunca do nome do remoto: o remoto dele pode
  se chamar `upstream`, ou outro nome, e o `origin` ser o fork, que não tem essa ref. Vale o
  remoto cuja URL configurada tem o `<host>` do PR **como host** (a autoridade de `https://` ou
  `ssh://`, ou o `<host>` de `git@<host>:`; nunca um pedaço do caminho) e o `<dono>/<repo>` do PR
  como caminho inteiro — o mesmo `<dono>/<repo>` noutro serviço é outro repositório —; sem
  nenhum, a própria URL. No GitHub:

```bash
pr_url="$(gh pr view <n> --json url --jq .url)" || exit 1   # https://<host>/<dono>/<repo>/pull/<n>
repo_url="${pr_url%/pull/*}"; alvo="${repo_url#*://}"       # <host>/<dono>/<repo>
remoto_base="$(git config --get-regexp '^remote\..*\.url$' | awk -v h="${alvo%%/*}" -v r="${alvo#*/}" '
  { u = tolower($2); sub(/\/$/, "", u); sub(/\.git$/, "", u)
    if (sub(/^[a-z][a-z0-9+.-]*:\/\//, "", u)) i = index(u, "/")   # https://, ssh://: autoridade até a 1ª /
    else if (u ~ /^[^\/]*:/) i = index(u, ":")                      # git@<host>:<caminho>
    else next                                                        # caminho local
    host = substr(u, 1, i - 1); sub(/^.*@/, "", host); sub(/:[0-9]*$/, "", host)
    if (i > 1 && host == tolower(h) && substr(u, i + 1) == tolower(r)) {
      nome = $1; sub(/^remote\./, "", nome); sub(/\.url$/, "", nome); print nome; exit } }')"
git fetch "${remoto_base:-$repo_url}" "pull/<n>/head" || exit 1
cabeca="$(git rev-parse --verify 'FETCH_HEAD^{commit}')" || exit 1
```

  No GitLab, o mesmo com a URL do `glab mr view <iid> --output json` (campo `web_url`; o
  repositório é o que vem antes de `/-/merge_requests/`) e a ref `merge-requests/<iid>/head`.
- HEAD autoritativo não confirmado: **R4 nunca pode ser `OK`** (finding corrigido fica sem
  evidência válida, e o gate fica `BLOQUEADO` por bloqueio corrigível — não confirmável
  humanamente). **R1 não muda de regra por isso**, e a precedência é esta: sem CI configurado,
  R1 é `n/a`, mesmo com o HEAD não confirmado; com CI configurado, o resultado do HEAD atual
  não pode ser obtido e R1 é `NÃO VERIFICÁVEL`. A definição normativa de R1 está na tabela
  "R1–R6"; esta seção não a redefine.

### Operações de review por plataforma

O gate precisa de quatro capacidades: **ler** (identificar PR, reviews, threads e comentários
com identificador estável), **responder** a um finding, **resolver** uma thread, e **comentar no
PR** (fallback para finding sem thread). Os exemplos abaixo usam só campos e operações que cada
ferramenta oferece; operação que o serviço, o plano ou a permissão não expõe é capacidade
`NÃO VERIFICÁVEL` — nunca simulada, nunca substituída por endpoint inventado.

| Capacidade | GitHub (`gh`) | GitLab (`glab`) |
|---|---|---|
| Estado do PR | `gh pr view <n> --json headRefOid,isDraft,statusCheckRollup,reviewDecision,reviews,latestReviews` | `glab api projects/:id/merge_requests/:iid` (`sha`, `draft`, `head_pipeline`); aprovações em `projects/:id/merge_requests/:iid/approvals`; estado de pedido de mudança dos reviewers em `projects/:id/merge_requests/:iid/reviewers`, quando a instância expuser — sem isso, R2 `NÃO VERIFICÁVEL` |
| Identificar threads | `gh api graphql` em `pullRequest.reviewThreads`: `id`, `isResolved`, `isOutdated`, `resolvedBy { login }`, `path`, `line`, `comments { id url createdAt author { login } body }` | `glab api projects/:id/merge_requests/:iid/discussions`: `id` da discussion; em cada note, `id`, `author`, `created_at`, `resolvable`, `resolved`, `resolved_by`, e `resolved_at` quando a instância devolver |
| Identificar review/comentário geral | `gh api graphql` em `pullRequest.reviews { id url state submittedAt author { login } body }` e `pullRequest.comments { id url createdAt author { login } body }` | notes sem discussion resolvível em `projects/:id/merge_requests/:iid/notes` (`id`, `author`, `created_at`, `body`) |
| Ler reações | REST, paginado: `gh api repos/<owner>/<repo>/pulls/comments/<comment_id>/reactions --paginate` (comentário de review) ou `.../issues/comments/<comment_id>/reactions` (comentário geral): `content`, `created_at`, `user.login`, `user.type` | `glab api projects/:id/merge_requests/:iid/notes/:note_id/award_emoji`, paginado: `name`, `user`, `created_at` |
| Responder thread | mutation `addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId, body})` | `glab api -X POST projects/:id/merge_requests/:iid/discussions/:discussion_id/notes -f body=...` |
| Resolver thread | mutation `resolveReviewThread(input: {threadId})` | `glab api -X PUT projects/:id/merge_requests/:iid/discussions/:discussion_id -f resolved=true` |
| Comentar no PR | `gh pr comment <n> --body-file <arquivo>` | `glab api -X POST projects/:id/merge_requests/:iid/notes -f body=...` |

Regras:

- **Leitura completa, página por página.** `reviewThreads`, `reviews` e `comments` (GitHub) e
  `discussions` e `notes` (GitLab) são coleções paginadas — e, no GraphQL, os `comments` de
  cada thread também. As leituras que alimentam R2, R3, R5 e R6 percorrem **todas** as páginas
  até o fim: no GraphQL, pedindo `pageInfo { hasNextPage endCursor }` e repetindo com
  `after: <endCursor>` até `hasNextPage` ser `false` (`gh api graphql --paginate` faz isso
  quando a consulta declara `$endCursor` e `pageInfo`); na API REST, seguindo a paginação do
  provider (`gh api --paginate`; `glab api --paginate`, ou os cabeçalhos de próxima página do
  GitLab). A primeira página nunca é tratada como coleção completa, e o `--json` resumido do
  `gh pr view` não é prova de completude. Se qualquer página necessária não puder ser obtida,
  os critérios que dependem daquela coleção ficam `NÃO VERIFICÁVEL` e `REVIEW EVIDENCE`
  permanece `BLOQUEADO`.
- **Escrita só conta quando a plataforma confirma.** Resposta ou comentário é considerado
  publicado quando a chamada devolve o objeto criado (ID/URL); thread é considerada resolvida
  quando a releitura mostra `isResolved: true`/`resolved: true`. O ID/URL vai para o rastro.
- **Capacidade técnica não é autorização.** Resolver thread continua sujeito à ordem de sete
  passos e a R6 (ver abaixo); poder chamar `resolveReviewThread` não encerra finding nenhum.
- **Serviço sem ferramenta que exponha a operação** (outro provider, plano sem API, token sem
  escopo): a capacidade é `NÃO VERIFICÁVEL`. Sem leitura, os critérios que dependem dela ficam
  `NÃO VERIFICÁVEL`; sem resposta, R5 não pode ser produzido nesta execução; sem resolução, a
  thread fica aberta; sem nenhum canal de escrita, vale "Nenhum canal de escrita" em "Quando
  falha".

### Quando um comentário é finding

Um comentário ou review é **finding** quando contém pedido verificável de mudança ou afirma um
risco/defeito concreto no código, configuração, teste, contrato ou comportamento da entrega.
Antes das seis situações, todo comentário é classificado:

| Classe | Quando | Efeito |
|---|---|---|
| `ACTIONABLE` | Pede mudança; aponta possível defeito; aponta violação de contrato ou regra; exige investigação cuja resposta pode alterar a elegibilidade do PR | É finding e entra nas seis situações |
| `NON_ACTIONABLE` | Elogio; informação; resumo automático; comentário puramente editorial sem pedido de mudança; status de bot ("review em andamento", notas de release, walkthrough) | Não é finding; não conta em R3 |
| `OUTDATED_NON_BLOCKING` | Está preso a trecho substituído **e** não existe finding equivalente no código atual **e** nenhuma revisão ou thread atual mantém a mesma preocupação | Situação final, não bloqueia. `isOutdated` sozinho não basta |

**Na dúvida, `ACTIONABLE` — e o finding começa em `ACTIONABLE_UNRESOLVED`.**

Comentário com vários pedidos gera um finding por pedido. Resumo de bot que só repete findings
inline já existentes não gera finding duplicado; item que só existe no resumo é finding
próprio. Finding sem arquivo/linha (corpo de review, comentário geral) é identificado pela
origem: ID ou URL do review/comentário, mais o índice do item quando houver vários.

### R5 e R6 — ordem temporal e identidade

R5 afirma que a evidência veio **antes** da resolução; R6 depende de **quem**, de fato,
confirmou ou resolveu. Quando a plataforma fornecer, colete:

- `createdAt`/`created_at` da resposta de evidência;
- `resolvedBy` (GitHub) / `resolved_by` (GitLab) — a **conta de plataforma** que resolveu;
- timestamp da resolução **só se o provider expuser** (`resolved_at` no GitLab, quando
  devolvido). O GitHub não expõe horário de resolução de review thread: não o invente;
- reviews e comentários posteriores do reviewer, com seus timestamps.

**Conta de plataforma não é proveniência da ação.** Em projeto de uma pessoa só, a mesma conta
do GitHub/GitLab é usada à mão pelo operador e pelas execuções automatizadas da mergex e dos
agentes. O login, sozinho, nunca decide se uma ação foi humana, da fábrica ou externa. A
classificação é pela **proveniência da ação**:

| Proveniência | O que é |
|---|---|
| **FÁBRICA** | Ação executada por agente ou automação da fábrica produtora (a mergex, os executores de origem), inclusive quando usa a mesma conta autenticada do operador humano |
| **HUMANO OPERADOR** | Confirmação explícita dada pela pessoa no fluxo interativo, em resposta a uma pergunta específica, registrada como confirmação humana desta execução. O operador não é a fábrica |
| **REVIEWER/BOT EXTERNO** | Reviewer ou bot cuja ação de review ou closure é externa à fábrica produtora |

Como decidir a proveniência:

- **Ação feita nesta execução pela mergex** — por exemplo `resolveReviewThread` com a conta do
  operador — é **FÁBRICA**; o rastro desta execução registra a chamada.
- **Ação com rastro de execução anterior da mergex** mostrando que ela a executou é **FÁBRICA**,
  mesmo que `resolvedBy` seja a conta pessoal do operador.
- **Resposta explícita do operador à pergunta específica da mergex**, nesta execução, é
  **HUMANO OPERADOR**.
- **Ação de conta que nem a fábrica nem o operador usam** é **REVIEWER/BOT EXTERNO**.
- **Conta que pode ser tanto do operador quanto da automação, sem rastro que prove a origem**:
  proveniência **indeterminável**. Nunca infira "humano" nem "fábrica" só pelo login.

Política:

- **A. A execução atual fez a sequência** resposta → validação/CI/re-review → resolução: a ordem
  registrada no rastro desta execução, com os IDs/URLs devolvidos pela plataforma em cada
  escrita, prova R5.
- **B. Thread já resolvida antes desta execução:** R5 só é `OK` com prova de que a evidência
  antecedeu a resolução (timestamp de resolução posterior ao `createdAt` da evidência, ou rastro
  de uma execução anterior da mergex com a sequência registrada). Sem dado suficiente, R5 é
  `NÃO VERIFICÁVEL`.
- **C. Quem encerrou (R6), por proveniência:**
  - **REVIEWER/BOT EXTERNO** confirmou explicitamente a correção (inclusive por reação positiva
    verificável, ver abaixo), ou resolveu o finding com
    closure verificável: confirmação externa normal (R6 caso A). Resposta que só pede
    esclarecimento, questiona ou rejeita a correção **não** satisfaz R6.
  - **FÁBRICA** resolveu — inclusive com a conta pessoal do operador: não conta sozinha como
    confirmação externa. Só vale se houver confirmação anterior de reviewer/bot externo
    (resposta explícita, aprovação, ou reação positiva verificável conforme "Reação positiva
    verificável", abaixo), ou closure histórico comprovado de confirmação humana específica
    (ver "Closure histórico comprovado", abaixo); sem uma das duas, o finding volta a
    `AWAITING_REREVIEW`.
  - **HUMANO OPERADOR** confirmou, nesta execução, a pergunta específica da mergex (por exemplo,
    uma rejeição sem resposta): pode satisfazer o caso C de R6 (`OK (confirmação humana)`), só
    nesta execução e separado da confirmação final de merge.
  - **Proveniência indeterminável** (thread já resolvida antes da execução, `resolvedBy` de conta
    que pode ser operador ou automação, campo ausente, sem rastro que prove a origem): R6 é
    `NÃO VERIFICÁVEL`, confirmável humanamente.

**Reação positiva verificável.** Reação não vale por ser emoji. Ela só satisfaz R6 caso A, como
confirmação explícita do **REVIEWER/BOT EXTERNO**, quando **todas** estas condições valem:

1. o autor da reação é o reviewer/bot externo responsável pelo finding, ou claramente
   participante daquele review (proveniência externa, conforme acima);
2. a reação está no comentário específico de evidência daquele finding (`Fixed in <commit>` ou
   `Not applicable` com evidência);
3. o provider expõe, de forma verificável, o autor, o tipo, o comentário alvo e o timestamp da
   reação (ver "Ler reações" em "Operações de review por plataforma");
4. a reação é posterior à publicação da evidência;
5. a semântica é de concordância positiva inequívoca — hoje, só `+1` (`thumbsup`, o equivalente
   no GitLab);
6. depois dela não há resposta contraditória, novo pedido de mudança equivalente, reabertura da
   thread nem finding novo com a mesma preocupação.

Não é closure: emoji de qualquer outra pessoa; reação da fábrica; reação do operador que não é
reviewer externo; `eyes`, `laugh`, `heart` ou qualquer reação que não seja `+1`; `+1` em
comentário genérico do PR; `+1` anterior à evidência; reação cuja autoria, alvo ou timestamp não
possam ser verificados. **Reação genérica ou ambígua não satisfaz R6**: o finding fica em
`AWAITING_REREVIEW`, ou R6 fica `NÃO VERIFICÁVEL` quando o dado não é verificável, conforme as
regras acima.

**Closure histórico comprovado.** Confirmação humana **não persiste como autorização**: a
próxima execução nunca a usa como override genérico, nem para outro finding. O **encerramento**
que ela produziu, porém, é evidência histórica durável **daquele** finding. Numa execução
futura, o finding continua `RESOLVED` e R6 é `OK` — sem perguntar de novo ao operador — quando
**todas** estas condições valem:

1. o rastro de uma execução anterior da mergex, em `docs/eventos/`, registra para aquele
   finding (ID/URL da thread ou da origem) a confirmação humana específica e, **depois** dela, a
   resolução feita pela fábrica, com o identificador devolvido pela plataforma;
2. a thread continua resolvida na leitura atual — não foi reaberta;
3. não surgiu finding equivalente novo, e nenhum review ou thread atual mantém a mesma
   preocupação;
4. o finding atual é inequivocamente o mesmo que foi encerrado (mesmo identificador de thread
   ou de origem).

Se qualquer condição falhar — thread reaberta, finding equivalente novo, review atual com a
mesma preocupação, rastro que não comprova finding + confirmação + resolução, relação ambígua
entre o finding atual e o encerrado, confirmação antiga de outro finding —, não reaproveite:
avalie normalmente e bloqueie ou peça a confirmação de novo, quando cabível. Finding equivalente
novo é avaliado de forma independente. Resolução da fábrica sem esse rastro segue as regras
acima.

Isto não muda a proveniência: quem resolveu continua sendo a **FÁBRICA**. O rastro só prova que
ela resolveu **depois** de uma confirmação humana específica — é evidência de closure, não
reutilização de autorização.

A limitação aparece no próprio bloco, com o motivo — por exemplo
`R5 review reply: NÃO VERIFICÁVEL — plataforma não expõe horário de resolução` — e no rastro.

**R2 usa o ESTADO BLOQUEANTE EFETIVO informado pela plataforma, nunca o histórico completo
nem "o último review de qualquer tipo".** Semanticamente, em qualquer serviço: um pedido de
mudança (`CHANGES_REQUESTED` no GitHub, ou o equivalente — "request changes", "needs work",
aprovação revogada, bloqueio de merge por reviewer) permanece ativo **até a plataforma indicar
que ele foi substituído por aprovação, dismissado, retirado pelo próprio reviewer, ou
equivalente**. Um review posterior meramente de comentário (`COMMENTED` no GitHub, ou nota sem
decisão em outro serviço) **não** retira, por si só, um pedido de mudança anterior ainda
ativo.

Ordem de fonte:

1. **Decisão efetiva do PR, quando o serviço expõe** — no GitHub, `reviewDecision`
   (`CHANGES_REQUESTED` bloqueia; `APPROVED`/`REVIEW_REQUIRED`/vazio não é bloqueio de R2 por
   si só); em outro serviço, o campo que diz se há pedido de mudança ativo no merge request.
   `REVIEW_REQUIRED` não muda R2, mas o serviço recusaria o merge: a aprovação que a proteção da
   branch exige ainda não veio. O PR vai para os inelegíveis do passo 4 com o motivo `review
   obrigatório pendente` — a mergex não aprova e não pede confirmação de um merge que vai falhar.
2. **Reconstrução por reviewer**, quando a decisão efetiva não existir ou não cobrir o caso
   (por exemplo, repositório sem regra de review obrigatório): a partir de `latestReviews` e
   `reviews` (ou equivalente), para cada reviewer, o último review **com decisão**
   (aprovação, pedido de mudança, dismiss) é o que vale; reviews só de comentário depois dele
   são ignorados para R2. Um `CHANGES_REQUESTED` com estado `DISMISSED`, ou seguido de
   `APPROVED` do mesmo reviewer, deixa de bloquear.
3. Nenhuma das duas obtível: R2 é `NÃO VERIFICÁVEL`.

Isto mantém a regra de que histórico antigo **realmente superado** não bloqueia para sempre —
aprovação ou dismiss posterior encerram o bloqueio —, sem tratar um comentário qualquer como
retirada de um pedido de mudança.

**PR sem nenhum review, comentário ou thread** satisfaz R2 e R3 por ausência de matéria — o
gate não exige que exista review, só que o review que existir não fique pendente.

### As seis situações de um finding ou thread

Cada finding ou thread de review cai em exatamente uma:

| Situação | Definição |
|---|---|
| `ACTIONABLE_UNRESOLVED` | Finding válido e ainda não tratado. |
| `FIXED_AWAITING_EVIDENCE` | Houve alteração, mas falta commit, teste, resposta ao review, ou CI. |
| `AWAITING_REREVIEW` | Correção e evidência já publicadas; aguardando confirmação ou re-review. |
| `REJECTED_WITH_EVIDENCE` | Finding considerado falso positivo ou não aplicável, com justificativa verificável publicada. |
| `RESOLVED` | O reviewer ou o bot externo confirmou ou resolveu, com proveniência externa verificada (ver "R5 e R6 — ordem temporal e identidade"), ou a mergex resolveu depois dessa confirmação, ou há closure histórico comprovado de confirmação humana específica (ver "Closure histórico comprovado"). |
| `OUTDATED_NON_BLOCKING` | Preso a trecho substituído, sem finding equivalente no código atual e sem revisão atual com a mesma preocupação (ver "Quando um comentário é finding"). |

**Na dúvida entre duas situações, classifique como `ACTIONABLE_UNRESOLVED`.** É a mesma
disciplina da classificação de atenção humana (E3, regra 8): ausência de prova não é prova de
segurança, e a situação mais rigorosa é a que bloqueia.

### R1–R6 — os seis critérios do gate

Esta é a definição normativa dos seis critérios. Ela existe **uma única vez**, aqui; qualquer
outro ponto da skill que cite R1–R6 está referenciando esta tabela, não redefinindo.

| # | Critério | Satisfeito quando |
|---|---|---|
| R1 | CI | O HEAD autoritativo atual do PR (ver "HEAD autoritativo") está com CI verde. Valores: `OK` (CI configurado, HEAD atual verde), `FALHOU` (CI configurado, HEAD atual não verde), `n/a` (sem CI configurado: nenhuma configuração de CI no HEAD e nenhum check reportado pela plataforma para ele, nem check obrigatório na proteção da base, lida com sucesso na proteção clássica e nos rulesets — check reportado pela plataforma para o HEAD também é CI configurado, mesmo sem arquivo de CI), `NÃO VERIFICÁVEL` (CI configurado, mas o resultado do HEAD atual não pôde ser obtido — inclusive o pipeline que ainda não anexou ao HEAD). |
| R2 | Blocking reviews | Nenhum pedido de mudança está ativo no estado bloqueante efetivo da plataforma (ver "R2 usa o ESTADO BLOQUEANTE EFETIVO", acima). |
| R3 | Actionable threads | Zero findings válidos em `ACTIONABLE_UNRESOLVED`. |
| R4 | Fix evidence | Todo finding corrigido tem evidência mínima: commit existente e ancestral do HEAD autoritativo atual, resumo preciso da correção, cobertura de regressão relevante, e a validação executada. |
| R5 | Review reply | A evidência foi publicada no próprio thread — ou no comentário do PR, para finding sem thread — **antes** de ele ser resolvido, provado conforme "R5 e R6 — ordem temporal e identidade"; sem prova, `NÃO VERIFICÁVEL`. |
| R6 | Closure | `OK` só em um destes casos: **(A)** o reviewer/bot confirmou a correção ou resolveu o finding; **(B)** o reviewer/bot aprovou estado posterior que efetivamente encerra o bloqueio; **(C)** caso confirmável humanamente nesta execução — rejeição sem resposta, ou critério `NÃO VERIFICÁVEL` permitido —, com a confirmação específica obtida e o gate recalculado (`OK (confirmação humana)`); **(D)** closure histórico comprovado — execução anterior registrou no rastro a confirmação humana específica daquele finding seguida da resolução, e o finding não foi reaberto nem substituído por equivalente (ver "Closure histórico comprovado"). CI verde, commit novo ou re-review sem confirmação de closure **não** bastam. |

O gate devolve **só** um destes dois vereditos — `SATISFEITO` ou `BLOQUEADO` —, **sempre** com
R1–R6 individuais, inclusive quando `SATISFEITO`. `SATISFEITO` exige que todo critério seja
`OK`, `OK (confirmação humana)` ou `n/a`; qualquer `FALHOU` ou `NÃO VERIFICÁVEL` dá `BLOQUEADO`.
Critério que não
se aplica ao estado atual do PR (por exemplo R4–R6 quando não há nenhum finding corrigido
ainda) vai como `n/a`, nunca omitido — mesma disciplina do `n/a` do portão de prontidão
(`references/02-prontidao.md`).

**O commit de R4 precisa pertencer ao HEAD autoritativo.** `Fixed in <commit>` só é evidência
válida quando esse commit existe no repositório e é ancestral do HEAD autoritativo atual do PR
(`git merge-base --is-ancestor <commit> <headRefOid>`, depois de buscar esse SHA — ver "HEAD
autoritativo") — não precisa ser o
próprio HEAD, mas um commit de um push que foi descartado (force-push, branch errada, PR
fechado) não serve como prova de nada no PR aberto. Sem ancestralidade confirmável, o finding
fica em `FIXED_AWAITING_EVIDENCE`.

### NÃO VERIFICÁVEL não é SATISFEITO

Ausência de capacidade da plataforma (API que o `gh`/`glab` não expõe, serviço que não é
GitHub nem GitLab, plano que não inclui reviews) não é a mesma coisa que ausência de review.
R2, R3, R5 e R6 dependem de dados que a plataforma pode simplesmente não devolver — e isso tem
que aparecer como um terceiro valor, nunca como `OK` nem como `FALHOU` por omissão:

```
R2 blocking reviews: NÃO VERIFICÁVEL
```

Um critério `NÃO VERIFICÁVEL` bloqueia o merge, do mesmo jeito que `FALHOU`.

R1 segue a mesma política, sem exceção: sem integração contínua configurada é `n/a` (o
critério não se aplica — nem arquivo de CI no HEAD, nem check reportado para ele); CI configurado com HEAD atual verde é `OK`; CI configurado com HEAD
atual não verde é `FALHOU`; CI configurado cujo resultado do HEAD atual não pôde ser obtido é
`NÃO VERIFICÁVEL`.

### Dois tipos de bloqueio

Todo `REVIEW EVIDENCE: BLOQUEADO` é de um destes dois tipos — a distinção é derivada dos
valores de R1–R6 e das situações dos findings, não é um veredito novo nem um enum persistido:

| Tipo | Quando | Consequência |
|---|---|---|
| **BLOQUEIO CORRIGÍVEL POR REMEDIAÇÃO** | Existe qualquer `FALHOU` em R1–R6 (exceto R6 não satisfeito unicamente por `REJECTED_WITH_EVIDENCE` sem resposta do reviewer); ou R1 `NÃO VERIFICÁVEL`; ou finding `ACTIONABLE_UNRESOLVED`, `FIXED_AWAITING_EVIDENCE`, ou `AWAITING_REREVIEW` que não seja rejeição sem resposta; ou evidência faltante; ou `REVIEW PENDENTE` | Inelegível. Não entra no passo 7 de forma nenhuma. Só sai por ação fora desta execução (novo commit, novo CI, resposta do reviewer) e uma nova chamada de `/mergex-revisar` |
| **BLOQUEIO CONFIRMÁVEL HUMANAMENTE NESTA EXECUÇÃO** | **Todos** os critérios não `OK`/`n/a` são apenas: R2, R3, R5 ou R6 `NÃO VERIFICÁVEL` por limitação da plataforma; e/ou R6 não satisfeito unicamente por finding `REJECTED_WITH_EVIDENCE` sem resposta do reviewer | Entra no passo 7 em **condução limitada**: pede cada confirmação específica, recalcula o gate, e só segue se o novo resultado for `SATISFEITO` |
| Mistura dos dois | Qualquer item do primeiro tipo presente | Vale o primeiro tipo: inelegível. Confirmação humana não compensa CI vermelho, rascunho, finding acionável ou evidência faltante |

R1 `NÃO VERIFICÁVEL` **não** é confirmável humanamente: CI é prova de máquina, e a recusa dura
nº 1 não aceita "a pessoa disse que está verde" no lugar do resultado.

### Confirmação humana — transição e recálculo

A confirmação humana **não** leva direto ao merge. Ela só troca o valor de um critério e manda
recalcular o gate:

1. **Pedido específico.** Uma pergunta por critério ou por finding, nunca uma confirmação única
   para vários:
   - R2/R3/R5/R6 `NÃO VERIFICÁVEL`: "a API não expõe {{o que falta}}; você confirma que não há
     {{pedido de mudança ativo | thread acionável | resposta faltando | thread sem
     encerramento}} neste PR?"
   - `REJECTED_WITH_EVIDENCE` sem resposta: "o finding {{arquivo:linha — texto}} foi rejeitado
     com a evidência {{link}}, sem resposta do reviewer; você concorda com a rejeição?"
2. **Transição.** Confirmado, aquele critério passa a `OK (confirmação humana)` **somente nesta
   execução**. Recusa, silêncio ou resposta que revela pendência real ("na verdade tem uma
   thread aberta") mantêm o critério bloqueando — e, no último caso, o PR passa a bloqueio
   corrigível por remediação.
3. **Recálculo.** Com todas as confirmações respondidas, o gate é recalculado. Só
   `REVIEW EVIDENCE: SATISFEITO` segue para as próximas perguntas do passo 7 (OLHO OBRIGATÓRIO,
   confirmação do merge daquele PR). Qualquer outro resultado: não oferece o merge (recusa dura
   nº 6) e segue para o próximo PR.

A confirmação humana:

- é **específica** de um critério ou de um finding, de um PR;
- **não persiste como override**: a próxima chamada de `/mergex-revisar` tenta de novo pela API
  e não herda confirmação anterior como autorização. O que persiste é só o encerramento
  comprovado daquele finding, como evidência histórica (ver "Closure histórico comprovado");
- **não altera a fonte remota**: não dismissa review, não aprova, não comenta em nome da
  pessoa. A única escrita remota decorrente é, no caso de `REJECTED_WITH_EVIDENCE` confirmado, a
  resolução da thread pela ordem de sete passos (ver "A ordem de resolução de thread"), quando a
  plataforma permitir;
- **aparece na saída e no rastro** desta execução — o bloco R1–R6 recalculado mostra
  `OK (confirmação humana)` no critério, e o evento do rastro (ver "O rastro do comando manual")
  nomeia cada confirmação dada;
- **não fura a recusa dura nº 6**: ela não faz merge de nada; só permite recalcular o gate, e
  merge continua exigindo `SATISFEITO` e a confirmação final específica do PR.

```
REVIEW EVIDENCE: SATISFEITO

R1 CI: OK
R2 blocking reviews: OK
R3 actionable threads: OK
R4 fix evidence: OK
R5 review reply: OK
R6 closure: OK
```

```
REVIEW EVIDENCE — BLOQUEADO

R1 CI: OK
R2 blocking reviews: OK
R3 actionable threads: FALHOU — 2 findings
R4 fix evidence: n/a
R5 review reply: n/a
R6 closure: n/a

Findings pendentes:
  src/foo.ts:84 — possível perda de configuração
  src/bar.ts:120 — cleanup não garantido
```

Recalculado depois de confirmação humana, na mesma execução:

```
REVIEW EVIDENCE — SATISFEITO (recalculado nesta execução)

R1 CI: n/a
R2 blocking reviews: OK (confirmação humana)
R3 actionable threads: OK
R4 fix evidence: OK
R5 review reply: OK
R6 closure: OK (confirmação humana)

Confirmações humanas nesta execução:
  R2 — não há pedido de mudança ativo (API não expõe decisão de review)
  R6 — src/baz.ts:12 — concorda com a rejeição publicada
```

### A resposta ao review — o padrão que prova a correção

Nunca responda a um finding só com "fixed", "done" ou "resolved". Toda resposta segue um dos
dois formatos:

Finding corrigido:

```
Fixed in <commit>.

<resumo preciso da correção>

Regression coverage:
- <teste/caso>
- <teste/caso>

Validation:
- <check relevante>
```

Finding rejeitado (falso positivo ou não aplicável):

```
Not applicable.

<explicação objetiva sustentada pelo código, contrato, teste ou documentação>

Evidence:
- <fonte verificável>
```

Sem essa estrutura, o finding não sai de `FIXED_AWAITING_EVIDENCE` — a resposta sozinha não é
R4 nem R5.

### A ordem de resolução de thread — nunca resolver logo depois de editar código

1. Corrigir ou rejeitar o finding.
2. Testar.
3. Commit e push.
4. Publicar a evidência no review, no formato acima.
5. Esperar o CI.
6. Esperar a confirmação de closure do reviewer/bot (R6 caso A ou B) — ou, só nos casos
   confirmáveis, a confirmação humana específica desta execução (R6 caso C). Plataforma que não
   expõe confirmação não pula este passo: R6 fica `NÃO VERIFICÁVEL`.
7. Resolver a thread.

Se o bot ou o reviewer resolver a thread automaticamente depois da evidência publicada, aceite
esse estado — é `RESOLVED` por confirmação externa, desde que a proveniência externa da
resolução seja verificável, e não só o login (ver "R5 e R6 — ordem temporal e identidade"). Se a thread continuar aberta, ela continua
`AWAITING_REREVIEW` ou `FIXED_AWAITING_EVIDENCE`: **nunca esconda, nunca contorne, nunca
resolva por conta própria fora desta ordem.**

### Falso positivo não é autoaprovação

A mergex faz parte da mesma fábrica que produziu o código sendo revisado — ela não pode ser a
única a decidir que a própria rejeição de um finding encerra o review. O operador humano não é
a fábrica, e ação automatizada não vira humana por usar a conta dele (ver "R5 e R6 — ordem
temporal e identidade").

- **Reviewer ou bot concordou** com a rejeição (respondeu concordando, aprovou estado posterior,
  ou resolveu a thread com proveniência externa verificada): o finding vai para `RESOLVED` normalmente, R6
  satisfeito. Reação genérica ou ambígua não satisfaz R6; só conta a reação descrita em "Reação
  positiva verificável".
- **Reviewer não respondeu** à rejeição publicada: o finding fica em `AWAITING_REREVIEW` e R6
  **não** é satisfeito por conta própria. É bloqueio confirmável humanamente (ver "Dois tipos
  de bloqueio"): o passo 7 do E9 pergunta, especificamente para aquele finding, se o
  desenvolvedor concorda com a rejeição. Confirmado, R6 conta como `OK (confirmação humana)`
  nesta execução, o gate é recalculado e, quando a plataforma permitir, a thread é resolvida
  seguindo a ordem de sete passos — a mesma disciplina da confirmação de OLHO OBRIGATÓRIO,
  aplicada aqui ao próprio veredito da mergex, não ao merge.

Isto mantém a intervenção humana baixa: a pessoa só entra quando existe desacordo — ou
silêncio — entre o reviewer e a fábrica, nunca em todo finding rejeitado.

### A fronteira: o que a mergex pode e o que ela não pode

A mergex **pode**: ler reviews, validar findings contra o código atual, reunir evidência,
responder thread, verificar CI, verificar re-review, classificar a situação de cada finding,
resolver thread quando R4–R6 estiverem satisfeitos, e conduzir o merge depois da confirmação
humana do passo 7.

A mergex **não pode**: editar código de produto para satisfazer um review; inventar
justificativa para um finding; marcar finding válido como resolvido sem evidência publicada.

### O pacote de remediação — quando o finding é válido

Finding válido que exige mudança **não é corrigido pela mergex**. Ela valida o finding contra
o código atual, monta este pacote, e devolve à skill de origem do trabalho (sprintx, runx ou
buildx): a do `expx_tool` do `ENTREGA.md` na branch do PR.

PR aberto fora do método — sem `ENTREGA.md` ("sem registro da mergex", passo 2) — não tem skill
de origem. O destinatário é então o **autor do PR** na plataforma (`author.login` no GitHub,
`author.username` no GitLab), e o `Destino:` do pacote diz isso; a persistência abaixo é a mesma.
Nunca escolha uma skill para ele por palpite.

```
REVIEW REMEDIATION

Destino:
<skill de origem, do expx_tool do ENTREGA.md | autor do PR (@<login>): PR sem ENTREGA.md, sem skill de origem>

Finding:
<texto normalizado>

Origem:
<ID ou URL estável do review/comentário de origem>

Arquivo:
<caminho/linha>

Validação:
<por que é válido>

Correção esperada:
<comportamento, não implementação inventada>

Regressão necessária:
<teste que deve provar a correção>

Review reply esperada:
<template de evidência>
```

**A entrega do pacote precisa sobreviver à sessão atual.** Nem todo finding tem thread
respondível — o gate aceita findings de review thread, comentário inline, review submetido e
comentário geral. A persistência segue esta ordem, obrigatória:

1. **Existe thread respondível** (review thread, discussão inline): publique o pacote
   `REVIEW REMEDIATION` completo como resposta nela — a mesma capacidade que já publica
   `Fixed in <commit>`/`Not applicable` (ver "A resposta ao review", acima).
2. **Não existe thread** (review submetido só com corpo, comentário geral, finding sem canal
   de resposta): publique um **comentário durável no próprio PR** contendo:
   - o ID ou a URL do review/comentário de origem, quando houver;
   - arquivo e linha, quando houver;
   - o finding normalizado;
   - o pacote `REVIEW REMEDIATION` completo.
3. **A plataforma não permite nenhum canal de escrita** (sem permissão, API ausente, falha na
   publicação): o handoff é `NÃO VERIFICÁVEL` e o PR segue `BLOQUEADO`. Diga isso na saída,
   com o motivo literal, e mostre o pacote completo no texto desta execução para quem for
   repassar à mão. **Nunca** diga que o pacote foi persistido sem a publicação ter sido
   confirmada pela plataforma.

É o que garante que qualquer sessão futura, do executor ou de uma pessoa, encontre o pacote
completo no próprio PR, sem precisar reconstruir contexto.

Isto reaproveita um mecanismo que a mergex já tem (responder thread, comentar no PR) em vez de
criar um artefato novo — nem arquivo local, nem escrita em artefato de outra skill. A mergex **não** grava o pacote em `BLOQUEIOS.md`/`00-BLOQUEIOS.md` da
sprintx/runx: a única escrita dela em artefato de outra skill continua sendo a linha do
`ORQUESTRADOR.md` no E0 (ver `references/integracao/runx.md` e
`references/integracao/sprintx.md`) — inventar uma segunda escrita ali romperia essa fronteira
só para resolver um problema que a thread do próprio PR já resolve.

Depois de entregar o pacote, o PR é marcado **REVIEW PENDENTE** e **não é oferecido para
merge** nesta passagem do E9 — nem na fila principal, nem com confirmação (vai para os
inelegíveis do passo 4). Quando o executor corrigir e houver novo commit e push, a próxima
chamada de `/mergex-revisar` reavalia o PR do zero.

**A mergex nunca escreve a correção de código dentro dela mesma** — isso seria alterar código
de produto para caber na entrega, o que as regras 6 e 18 já proíbem.

## Passo 3 — Detectar sobreposição entre PRs

Cruze as listas de arquivos de **todos** os PRs abertos, dois a dois.

Dois ou mais PRs tocando o mesmo arquivo vão **destacados no topo da lista**, com os dois identificados e os arquivos em comum nomeados:

```
SOBREPOSIÇÃO — dois PRs abertos tocam os mesmos arquivos

  #482 "Corrigir base de cálculo do ICMS-ST" (fix/OC-2026-0184-...)
  #479 "Extrair formatador de nota fiscal" (feature/formatador-nota)
  Em comum:
    src/fiscal/base_calculo.py

Isto não é um bloqueio e não há conflito ainda. É informação para decidir a
ordem: o segundo a entrar vai precisar rebasear ou resolver conflito.
```

**Isto não é prevenção de colisão.** A mergex não previne colisão entre desenvolvedores, não reserva arquivo e não resolve conflito. É informação para quem decide a ordem.

## Passo 4 — Ordenar do MENOR para o MAIOR impacto

**Menor primeiro**, por duas razões que devem ser declaradas na saída:

1. Cada merge fácil que entra **reduz a superfície do próximo** — menos PRs abertos, menos sobreposição possível.
2. **Adiar o difícil não o piora; adiar o fácil sim** — o fácil vai acumulando divergência com a base enquanto espera.

### O critério, na ordem de desempate

Some, em ordem lexicográfica de prioridade (o primeiro critério que difere decide):

| # | Critério | Menor impacto ← → Maior impacto |
|---|---|---|
| 1 | Faixa de raio | sem raio / baixo → médio → alto |
| 2 | Arquivos em OLHO OBRIGATÓRIO | zero → poucos → muitos |
| 3 | Sobreposição com outro PR aberto | nenhuma → com um → com vários |
| 4 | Conflito com a base | sem conflito → com conflito |
| 5 | Quantidade de arquivos tocados | poucos → muitos |
| 6 | Número do PR | menor → maior (desempate final, estável) |

**Declare o critério na saída**, sempre. A ordem sem o critério é opinião; com o critério, é auditável.

### Antes do impacto: PRs empilhados

Um PR cuja base (`baseRefName`; no GitLab, `target_branch`) é a branch de outro PR aberto
(`headRefName`; no GitLab, `source_branch`) está **empilhado** sobre ele. Mergeá-lo primeiro
levaria o diff dele para a branch da predecessora, e o PR dela passaria a carregar código que
ninguém revisou ali. Por isso a ordem é **topológica antes de ser de impacto**: a ordem de
impacto vale só entre PRs sem essa dependência, e o empilhado vai **depois** da predecessora (e
de toda a cadeia abaixo dela), qualquer que seja o impacto de cada um.

Enquanto a predecessora estiver aberta, o empilhado fica nos inelegíveis com o motivo
`empilhado sobre #<n>`. Ele só chega ao passo 7 se, na vez dele, a base relida no serviço não for
a branch de um PR aberto nem a de um PR mergeado nesta passagem — depois do merge da
predecessora, a base tem de ter sido redirecionada para a base dela, pelo serviço ou pelo
desenvolvedor. Senão continua inelegível, com o motivo. Redirecionado, ele ainda tem de
cumprir as condições de "Feature redirecionada", abaixo.

PRs **inelegíveis para merge** — rascunho, integração contínua vermelha, review obrigatório pendente (`reviewDecision: REVIEW_REQUIRED` no GitHub; aprovações exigidas ainda não dadas no GitLab), `empilhado sobre #<n>` (ver "Antes do impacto: PRs empilhados", acima), feature redirecionada sem as condições dela (`não sincronizado com a base nova`, `CI anterior ao redirecionamento`, `revisão do revisor_bot ausente no HEAD atual`, ou o redirecionamento não verificável; ver "Feature redirecionada", abaixo), conflito com a base (inclusive o "conflito não verificado", que conta como conflito), ou `REVIEW EVIDENCE: BLOQUEADO` por **bloqueio corrigível por remediação** (ver "Dois tipos de bloqueio", acima) — aparecem na lista, **no fim**, marcados com o motivo, e **não entram na condução do passo 7**.

PRs com `REVIEW EVIDENCE: BLOQUEADO` **apenas** por **bloqueio confirmável humanamente nesta execução**, e sem nenhum outro impedimento (não rascunho, CI não vermelha, sem conflito com a base), ficam na fila pela mesma ordem de impacto, marcados `confirmação humana necessária`, e entram no passo 7 **só** na condução limitada: pedir as confirmações específicas, recalcular o gate, e seguir apenas se o resultado for `SATISFEITO`.

### Feature redirecionada

Um PR cuja base foi trocada (a predecessora foi mergeada e o PR foi redirecionado para a base
dela, pelo serviço ou pelo desenvolvedor) traz um verde que pode não valer mais: o CI rodou
contra a base antiga, e o HEAD pode nem ter mudado, quando a base nova já era ancestral dele
(predecessora mergeada por fast-forward). Um verde de antes do redirecionamento, como o
`fora-de-main` do gate do conselho, não rodou a suíte contra a base atual (desenho de
2026-10-18, 4.4; DM-245). Por isso, sobre o `headRefOid` **atual**, ele só é elegível se:

- **está sincronizado:** a ponta da base atual (`baseRefOid`) é ancestral do `headRefOid`;
  senão, inelegível com `não sincronizado com a base nova`;
- **o CI é de depois do redirecionamento:** há check do `headRefOid`, e todo check dele
  **nasceu** depois do evento de troca de base do serviço (o último, se houve mais de
  um): o check run, pela criação da execução do workflow (`checkSuite.workflowRun.createdAt`;
  fora do Actions, a do `checkSuite`), e o status, pela criação dele. A conclusão não basta:
  a re-execução de uma execução antiga repete o evento antigo, com o merge da base antiga, e
  termina depois do redirecionamento sem ter rodado contra a base atual. De cada check (o app, o
  workflow pelo id, nunca pelo nome, e o nome do check; status, pelo contexto) vale só o da
  execução mais nova, e a lista inteira tem de
  caber numa página. Senão — nenhum check nesse HEAD, só os de um HEAD anterior, ou algum
  nascido antes do redirecionamento —, inelegível com `CI anterior ao redirecionamento`.
  Check nascido depois e ainda em andamento passa aqui: esperar por ele é do R1, como a cor
  dos checks, que tem de estar verde como para qualquer PR;
- **o bot revisou o HEAD novo:** com `revisor_bot` declarado no `.expx/fatiamento.json` **da
  base** (`EXPX_REVISOR_BOT`, lido por `leitor-do-projeto.sh --rev <baseRefOid>
  --nucleo-da-rev`, que executa o leitor do núcleo da árvore da base, nunca o do disco nem o
  da branch do PR), há uma revisão de um desses logins, comparado exatamente (sem prefixo e
  sem diferença de caixa), cujo commit é o `headRefOid` e que foi submetida depois do
  redirecionamento; senão, inelegível com `revisão do revisor_bot ausente no HEAD atual`. O
  `revisor_bot` que a branch do PR acrescenta ou tira não vale: vale o da base. Base com o
  arquivo e sem a pasta do núcleo versionada (o leitor sai 3) ou com a configuração inválida:
  inelegível com `configuração da base não lida`;
- **o R1–R6 inteiro foi recalculado** sobre esse `headRefOid` depois do redirecionamento,
  com todas as páginas, como em qualquer avaliação do gate: nenhuma avaliação de antes dele
  é reaproveitada.

No GitHub, depois do bloco do HEAD autoritativo (acima, com `$cabeca` e a fonte da base):

```bash
# E9: feature redirecionada (DM-245); depois do bloco do HEAD autoritativo ($cabeca, $repo_url, $remoto_base)
set -o pipefail
export GIT_NO_REPLACE_OBJECTS=1   # refs/replace local não muda ancestralidade nem árvore da base
nv() { echo "redirecionado=nao_verificavel: $1"; exit 1; }
command -v jq >/dev/null 2>&1 || nv 'sem jq'
dono_repo="${repo_url#*://*/}"                                   # <dono>/<repo>
pr="$(gh pr view <n> --json baseRefName,baseRefOid,headRefOid)" || nv 'o PR não foi lido'
base_nome="$(printf '%s' "$pr" | jq -r .baseRefName)" && base_oid="$(printf '%s' "$pr" | jq -r .baseRefOid)" \
  && head_oid="$(printf '%s' "$pr" | jq -r .headRefOid)" || nv 'o PR não foi lido'
redir="$(gh api graphql -F n=<n> -f o="${dono_repo%%/*}" -f r="${dono_repo#*/}" -f query='
  query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { pullRequest(number: $n) {
    timelineItems(itemTypes: [BASE_REF_CHANGED_EVENT], last: 1) { nodes { ... on BaseRefChangedEvent { createdAt } } } } } }' \
  | jq -r '.data.repository.pullRequest.timelineItems.nodes
           | if type == "array" then (.[0].createdAt // "") else error("sem a linha do tempo") end')" \
  || nv 'a linha do tempo do PR não foi lida'
[ -n "$redir" ] || { echo 'redirecionado=nao'; exit 0; }
[ "$cabeca" = "$head_oid" ] || nv 'a cabeça buscada não é o headRefOid'
git fetch -q "${remoto_base:-$repo_url}" "refs/heads/$base_nome" \
  && [ "$(git rev-parse --verify 'FETCH_HEAD^{commit}')" = "$base_oid" ] || nv 'a ponta da base não é o baseRefOid'
motivos=''
git merge-base --is-ancestor "$base_oid" "$head_oid"; rc=$?
case "$rc" in 0) ;; 1) motivos="${motivos}não sincronizado com a base nova
" ;; *) nv 'a ancestralidade não foi calculada' ;; esac
ci="$(gh api graphql -f h="$head_oid" -f o="${dono_repo%%/*}" -f r="${dono_repo#*/}" -f query='
  query($o: String!, $r: String!, $h: GitObjectID!) { repository(owner: $o, name: $r) { object(oid: $h) { ... on Commit {
    statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes { __typename
      ... on CheckRun { name status completedAt checkSuite { createdAt app { slug } workflowRun { createdAt workflow { id } } } }
      ... on StatusContext { context state createdAt } } } } } } } }' \
  | jq -r --arg r "$redir" '.data.repository.object.statusCheckRollup as $s
      | if $s == null then [] elif $s.contexts.pageInfo.hasNextPage then error("mais de uma página de checks")
        else $s.contexts.nodes end
      | map(if .__typename == "CheckRun"
              then {k: ("run:" + (.checkSuite.app.slug // "") + "/" + (.checkSuite.workflowRun.workflow.id // "") + "/" + .name),
                    nasceu: (.checkSuite.workflowRun.createdAt // .checkSuite.createdAt // "")}
              else {k: ("status:" + .context), nasceu: (.createdAt // "")} end)
      | group_by(.k) | map(max_by(.nasceu))
      | if length > 0 and all(.[]; .nasceu > $r) then "depois" else "antes" end')" || nv 'os checks não foram lidos'
[ "$ci" = depois ] || motivos="${motivos}CI anterior ao redirecionamento
"
cfg="$(bash .claude/skills/mergex/scripts/leitor-do-projeto.sh --rev "$base_oid" --nucleo-da-rev)"; rc=$?
if [ "$rc" != 0 ]; then motivos="${motivos}configuração da base não lida (leitor-do-projeto saiu $rc)
"
else
  bots="$(eval "$cfg" && printf '%s' "${EXPX_REVISOR_BOT:-}")" || nv 'a saída do leitor não foi lida'  # o consumo do leitor, num subshell
  if [ -n "$bots" ]; then
    revs="$(gh api --paginate "repos/$dono_repo/pulls/<n>/reviews?per_page=100")" || nv 'as revisões não foram lidas'
    n_bot="$(printf '%s' "$revs" | jq -s -r --arg b "$bots" --arg h "$head_oid" --arg r "$redir" '
      ($b | split(",")) as $bots | [add // [] | .[] | (.user.login // "") as $l
        | select(any($bots[]; . == $l) and .commit_id == $h and (.submitted_at // "") > $r)] | length')" \
      || nv 'as revisões não foram lidas'
    [ "$n_bot" -gt 0 ] || motivos="${motivos}revisão do revisor_bot ausente no HEAD atual
"
  fi
fi
[ -n "$motivos" ] || { echo 'redirecionado=sim elegivel'; exit 0; }
echo 'redirecionado=sim inelegivel'; printf '%s' "$motivos" | sed 's/^/motivo: /'; exit 1
```

Saída: `redirecionado=nao` (sem troca de base: as condições não se aplicam),
`redirecionado=sim elegivel`, ou `redirecionado=sim inelegivel` seguido de uma linha
`motivo: <motivo>` por condição que falta (saída 1); leitura que falha é
`redirecionado=nao_verificavel: <o quê>` (saída 1), e o PR fica inelegível com
`redirecionamento não verificável`. Os horários são os do serviço, comparados estritamente:
nascido no mesmo segundo do redirecionamento não é depois dele. O bloco roda do checkout da
base (ou da skill instalada), nunca de um checkout da branch do PR, que traria o próprio
`leitor-do-projeto.sh` dela. No GitLab, o mesmo com: o
evento é a última nota de sistema `changed target branch from … to …` do MR
(`glab api --paginate projects/:id/merge_requests/<iid>/notes`, `system: true`, `created_at`);
a ponta da base, `target_branch` buscada no repositório base e conferida com
`projects/:id/repository/branches/<target_branch>` (`commit.id`); o CI, o `head_pipeline` do
MR, com `sha` igual ao `sha` do MR (no pipeline de resultado de merge, o commit de merge cujo
segundo pai é o `sha` do MR) e `created_at` depois do evento (o retry de um job fica no
pipeline antigo e não conta); a revisão do bot, uma nota
de diff de um dos logins (`author.username`) com `position.head_sha` igual ao `sha` do MR e
`created_at` depois do evento. O GitLab não prende uma revisão sem nota de diff a um commit: sem
essa nota, `revisão do revisor_bot ausente no HEAD atual`.

**Orientação ao desenvolvedor.** Para sincronizar, a reconciliação de base
(`references/11-reconciliacao-base.md`: merge registrado da base nova, E2 e push), que mantém
o portão provado e dá um HEAD novo, com CI e revisão novos. O botão de atualizar a branch do
serviço faz o mesmo merge sem o registro, e o portão aparece vencido para o `pre-push` e para
o CI. Sincronizado, com `CI anterior ao redirecionamento`, dispare o CI de novo pelo serviço
com um evento novo, que use a base atual — por exemplo, fechar e reabrir o PR; o botão de
re-executar repete o evento antigo, com a base antiga, e não conta — e peça a revisão do bot
de novo — **nunca com commit vazio**, que invalidaria o portão.

## Passo 5 — Analisar conflitos (relatar, nunca resolver)

Para cada PR marcado com conflito, esta análise é **o que o E9 tem de mais útil**. É trabalho que ninguém mais faz e que economiza a parte mais cara do dia do revisor.

Levante o conflito sem alterar nada da árvore de trabalho:

```
git fetch origin <base> <head>
git merge-tree $(git merge-base origin/<base> origin/<head>) origin/<base> origin/<head>
```

`merge-tree` calcula o merge **sem tocar na árvore de trabalho e sem criar commit**. Nunca faça um merge de verdade para "ver o conflito".

### Delegue a análise ao agente `analista-de-conflito`

**Passe o conflito ao agente `analista-de-conflito`.** Ele recebe o conflito e
explica o que cada lado pretendia, segundo a mensagem de commit e o plano de
cada trabalho.

Ele é a peça mais útil deste comando, e a que mais se beneficia de contexto
próprio: **ele lê os dois trabalhos sem estar comprometido com nenhum.** Quem
escreveu um dos lados tende a achar que a intenção dele é a óbvia, e a do outro
é o desvio.

**As ferramentas dele são somente de leitura — `Read`, `Grep` e `Glob`, sem
execução de comando.** Não é uma promessa de que ele não vai resolver o
conflito: é impossibilidade técnica. Ele não tem como fazer checkout, merge, nem
escrever no arquivo.

Passe a ele: o conflito calculado com `merge-tree`, a mensagem de commit de cada
lado, e o `tasks.md` (mais o `01-CAUSA-RAIZ.md`, quando é da runx) de cada
trabalho.

**Restrição herdada:** este agente só é acionado por este comando manual. Nada
no fluxo automático da mergex pode chamá-lo.

Para cada arquivo em conflito, relate quatro coisas:

1. **Onde**: arquivo e trechos (as linhas ou a função).
2. **O que este PR pretendia ali**, segundo a mensagem de commit da task e o plano do trabalho.
3. **O que o outro lado pretendia ali** — a base, ou o outro PR — pela mesma fonte.
4. **Por que os dois se cruzaram**: mesma função, mesma linha, ou mudanças adjacentes que o versionador não consegue juntar.

```
CONFLITO — #482 contra main

  src/fiscal/base_calculo.py, função calcular_base_st(), linhas 40–58

  O que #482 pretendia:
    "Excluir o desconto incondicional da base de ST, conforme a regra vigente."
    (T-01.02, fix/OC-2026-0184-icms-st-base-desconto)

  O que entrou na base depois:
    "Extrair o rateio por item para um método próprio."
    (#479, mesclado em 2026-08-28)

  Por que se cruzaram:
    Os dois reescreveram o corpo de calcular_base_st(). Um mudou a fórmula, o
    outro mudou a estrutura. As duas intenções são compatíveis; a junção não é
    automática porque tocam as mesmas linhas.

  O que perguntar a quem decidir:
    A nova fórmula do desconto deve ser aplicada antes ou depois do rateio por
    item? A ordem muda o resultado quando o desconto é proporcional.

  A mergex não resolve conflito. Resolver isto é decisão humana: as duas
  intenções precisam coexistir no código final.
```

**Nunca resolva.** Não escolha um lado, não sugira o texto final do arquivo, não faça checkout de versão, não rode `git checkout --ours/--theirs`, não peça ao versionador que decida. Relatar as duas intenções é o limite — e é o ponto (regra 17).

Acrescente, por trecho, **o que perguntar a quem decidir** (campo obrigatório do
bloco, também no `TEMPLATE-revisao.md`): a pergunta que
destrava a decisão, não a resposta. É o que o `analista-de-conflito` devolve, e
é o que faz a análise valer o tempo de quem lê — ela nomeia a decisão que só
uma pessoa com contexto de negócio pode tomar.

## Passo 6 — Apresentar a lista

Use `assets/TEMPLATE-revisao.md`. Nesta ordem:

1. **Sobreposições** entre PRs abertos, destacadas no topo (passo 3).
2. **O critério de ordenação**, declarado.
3. **Os PRs elegíveis**, do menor para o maior impacto.
4. **Os inelegíveis**, no fim, com o motivo.

Por PR, exatamente estes campos:

```
#482 — Corrigir base de cálculo do ICMS-ST com desconto incondicional
  Autor: <autor>
  Trabalho: OC-2026-0184-icms-st-base-desconto (runx, regra-de-calculo)
  Impacto: raio ALTO — 3 arquivos em olho obrigatório
  Arquivos: 9 (src/fiscal/ 3, src/relatorios/ 1, tests/ 5)
  Integração contínua: verde
  Conflito: não
  Review Evidence: SATISFEITO
  Reviews: 0 actionable, 0 aguardando evidência, 0 aguardando re-review, 1 rejeitado com evidência, 4 resolvidos, 2 obsoletos
  [aberto por esta instalação da mergex — a skill não aprova o próprio trabalho]
  Recomendação: revisar os 3 arquivos de olho obrigatório antes de integrar;
                é o de maior impacto da fila.
```

A **recomendação é uma linha** e é derivada do estado, não de opinião. Ela nunca diz "pode integrar sem olhar".

**Todo PR** — `SATISFEITO` ou `BLOQUEADO` — mostra o bloco do REVIEW EVIDENCE GATE com R1–R6
individuais. PR `BLOQUEADO` acrescenta os findings pendentes e o tipo de bloqueio, e não recebe
recomendação de merge. Bloqueio corrigível por remediação entra nos inelegíveis do passo 4, com o
motivo `REVIEW EVIDENCE: BLOQUEADO`; bloqueio confirmável humanamente fica na fila marcado
`confirmação humana necessária`, com as confirmações que serão pedidas nomeadas.

## Passo 7 — Conduzir, um PR por vez

Na ordem apresentada, **um de cada vez**. Nunca em lote, nunca uma confirmação única para vários (regra 17).

Para cada PR elegível **e cada PR bloqueado apenas por critério confirmável humanamente** (ver
"Dois tipos de bloqueio" e o passo 4). PR com bloqueio corrigível por remediação nunca chega
aqui.

1. Apresente o bloco do PR de novo, resumido, com R1–R6. Se, entre a apresentação (passo 6) e
   este momento, uma revisão nova mudou o veredito do REVIEW EVIDENCE GATE para bloqueio
   corrigível por remediação — comentário novo, CI que voltou a falhar —, **pare e não ofereça
   o merge** (recusa dura 6): diga o que mudou e passe para o próximo PR.
2. **Condução limitada — só se o gate estiver `BLOQUEADO` por critério confirmável
   humanamente.** Antes de qualquer pergunta sobre merge:
   - **A.** Peça **cada** confirmação específica necessária, uma por critério `NÃO VERIFICÁVEL`
     (R2/R3/R5/R6) e uma por finding `REJECTED_WITH_EVIDENCE` sem resposta do reviewer (ver
     "Confirmação humana — transição e recálculo" e "Falso positivo não é autoaprovação").
   - **B.** Recalcule o REVIEW EVIDENCE GATE com os critérios confirmados como
     `OK (confirmação humana)` e mostre o bloco R1–R6 recalculado, com as confirmações listadas.
   - **C.** Só continue se o novo resultado for `REVIEW EVIDENCE: SATISFEITO`. Qualquer
     confirmação recusada, sem resposta, ou que revele pendência real: não ofereça o merge
     (recusa dura 6), registre o motivo e passe para o próximo PR.

   Com `SATISFEITO` recalculado, se houver `REJECTED_WITH_EVIDENCE` confirmado e a plataforma
   permitir, resolva a thread seguindo a ordem de sete passos. PR que já chegou `SATISFEITO`
   pula este item.
3. Se houver arquivo em **OLHO OBRIGATÓRIO** ou o raio for **ALTO**, a confirmação é dupla: antes de perguntar sobre o merge, pergunte se o desenvolvedor **revisou os arquivos daquela faixa**, listando-os por nome:

```
Este PR tem 3 arquivos em OLHO OBRIGATÓRIO:
  src/fiscal/calculo_icms_st.py — zona de risco fiscal, altera base de cálculo
  src/fiscal/base_calculo.py — zona de risco fiscal, raio ALTO
  migrations/0042_ajusta_precisao_st.sql — migração de banco

Você revisou esses três arquivos? (o merge não segue sem esta confirmação)
```

Sem essa confirmação, **não ofereça o merge** deste PR. Passe para o próximo.

4. **Peça confirmação explícita daquele PR específico.** "Confirma o merge do #482?" — nunca "posso seguir com os três?". Esta pergunta só existe com `REVIEW EVIDENCE: SATISFEITO` (original ou recalculado no item 2); confirmação de critério do gate não substitui esta confirmação final.
5. **Revalidação obrigatória imediatamente antes do merge.** Depois das confirmações de Review
   Evidence (item 2), de OLHO OBRIGATÓRIO (item 3) e da confirmação final daquele PR (item 4), e
   **antes** da operação de merge, releia da plataforma: HEAD autoritativo (`headRefOid` ou
   equivalente); estado de rascunho; CI/status checks desse HEAD; decisão de review e pedidos de
   mudança ativos (`reviewDecision` ou equivalente); threads e findings relevantes; a base
   (`baseRefName`; no GitLab, `target_branch`), que não pode ser a branch de um PR aberto nem a
   de um PR mergeado nesta passagem (ver "Antes do impacto: PRs empilhados", no passo 4); e
   o bloco de "Feature redirecionada" (passo 4), de novo, sobre o HEAD relido: a base pode ter
   andado ou sido trocada depois da primeira avaliação, e o PR só segue com `redirecionado=nao`
   ou `redirecionado=sim elegivel`. A confirmação humana final **não congela** o estado do PR.

   A releitura **recalcula o gate R1–R6 inteiro**, com as mesmas regras e todas as páginas
   (threads, reviews, comentários e checks, inclusive os não obrigatórios), e não só o HEAD:
   o `--match-head-commit` abaixo prende o SHA, mas não um finding novo de bot nem um check
   que muda no **mesmo** SHA. Compare o resultado com o que foi confirmado: os valores de
   R1–R6, as seis contagens do bloco `Reviews` e os findings nomeados. **Qualquer mudança no
   resultado do gate entre a releitura e o merge invalida a passagem** — mesmo a que não
   chega a bloquear: não faça o merge, mostre o bloco recalculado e siga para o próximo PR.
   - **HEAD mudou** desde a confirmação: invalide todas as confirmações associadas ao estado
     anterior (Review Evidence, OLHO OBRIGATÓRIO e merge), recalcule o gate, e **não faça o
     merge nesta passagem**. Diga o SHA anterior e o novo, registre no rastro e siga para o
     próximo PR.
   - **HEAD igual, mas algum critério passou a bloquear** (virou rascunho, CI deixou de estar
     verde, pedido de mudança novo, finding novo ou reaberto, base que passou a ser a branch de
     outro PR aberto ou mergeado nesta passagem, feature redirecionada que deixou de cumprir
     as condições dela): não faça o merge; diga
     exatamente o que mudou.
   - **HEAD igual e gate igual no bloqueio, mas resultado diferente** (contagem do bloco
     `Reviews` mudou, finding novo já classificado, check novo verde): não faça o merge nesta
     passagem; diga o que mudou.
   - **Releitura impossível** (alguma página do gate não obtida): trate como mudança; não faça o
     merge.

   **Merge atomicamente preso ao HEAD revalidado — obrigatório.** O merge só é executado com um
   mecanismo do serviço que faça a própria operação falhar se o HEAD do PR mudou depois da
   revalidação: `gh pr merge <n> --match-head-commit <headRefOid>` no GitHub; parâmetro `sha`
   no merge do GitLab; em outro serviço, garantia equivalente comprovável. Sem mecanismo atômico
   desse tipo, **a mergex não executa o merge**: informe que o serviço não oferece merge atômico
   seguro (safe atomic merge) para a automação, mantenha o PR aberto e registre no rastro. Nunca
   degrade para "reli e vou tentar rápido" — releitura sem amarra atômica não impede que um push
   entre a releitura e o merge integre código não revalidado. A confirmação humana específica
   do PR continua obrigatória e não substitui a garantia atômica.

   **O resto do gate não tem amarra atômica** — nenhum dos serviços prende o merge às threads ou
   aos checks não obrigatórios. Por isso: (a) o merge é a operação **seguinte** à releitura, sem
   pergunta, outro PR ou trabalho entre as duas; (b) logo depois do merge, releia o gate do
   mesmo HEAD mais uma vez. Finding, review ou check criado ou concluído antes do instante do
   merge e ausente da releitura é mudança no resultado do gate entre a releitura e o merge; num
   PR redirecionado, também a base que andou entre as duas (o `--match-head-commit` prende o
   HEAD, não a base): o pai, na base, do que o merge pôs nela (o primeiro pai do commit de
   merge; no squash, o pai do commit; no rebase, o do primeiro commit reaplicado) tem de ser o `baseRefOid` revalidado. Em qualquer desses
   casos a passagem fica invalidada — diga ao desenvolvedor exatamente o que mudou e que o merge já foi
   feito, registre no rastro, **encerre a passagem** sem oferecer os PRs seguintes e nunca
   reverta por conta própria (a decisão de reverter é humana). **Releitura posterior
   impossível** (falha, ou alguma página do gate não obtida) é tratada como mudança, com a
   mesma conduta: sem ela, não há como provar que nada mudou. Encerrar a passagem não pula o
   item 7 **deste** PR: o merge aconteceu, e `pr_estado: merged` registra o fato — o que se
   encerra é a oferta dos PRs seguintes. Check obrigatório e resolução
   de conversa exigidos pela proteção da base o serviço já barra na própria operação; isso
   reduz a janela, mas não dispensa (a) nem (b).
6. Revalidado sem mudança **e com o merge atomicamente preso ao HEAD revalidado** (item 5), faça o merge com a estratégia que o repositório usa (detecte em `CONVENCOES.md` da stackx ou nos merges anteriores; na ausência, use o padrão do serviço). Nunca force, nunca reescreva histórico já enviado.
7. Atualize `pr_estado: merged` no `ENTREGA.md` correspondente, quando ele existir localmente.
   Se esse `ENTREGA.md` é a entrega de planejamento ou a de uma sprint (`entrega-de-planejamento.sh`
   diz `sprint_atual=planejamento` ou `sprint_atual=<NN>`), o registro é o do script, que grava
   também o item dela em `prs`
   (`estado: merged`, `merge_sha` = o commit de merge, `merge: humano`, `base_sha` = a ponta da
   base no merge, relida no serviço como no bloco):
   `entrega-de-planejamento.sh --registrar-merge --entrega <ENTREGA.md> --merge-sha <commit de merge> --base-sha <base>`
   ("O PR de planejamento (e o da sprint) do trabalho atual", no passo 2).

   **E, somente se o PR mergeado for o do trabalho atual**, grave `pr_estado: merged`
   também em `.expx/estado.json`. O E9 percorre PRs de vários trabalhos e de outras
   pessoas; a barra mostra **um** trabalho, o que está em andamento nesta sessão. Mergear o
   PR de outro trabalho não muda o estado do seu.

   O PR é do trabalho atual quando existe trabalho atual (ver "Trabalho atual no E9", no
   passo 2) e a URL do PR mergeado casa com a `pr_url` do `ENTREGA.md` desse trabalho. Sem
   trabalho atual, ou se a correspondência não for certa, **não grave nada** — na dúvida,
   deixe a barra como está. O `estado.json` só é escrito depois dessa decisão; nunca é lido
   para tomá-la.

   Não toque em `branch`. O procedimento é o de `10-estado.md`, e falha de gravação vai
   para o rastro (`artefato_gravado` com `resultado: falha`) sem interromper a condução dos
   PRs seguintes.
8. Recusa ou silêncio: **não faça o merge**, siga para o próximo, e registre que ele ficou pendente.

### As seis recusas duras

Não faça merge, em nenhuma hipótese:

| # | Nunca faça merge | Por quê |
|---|---|---|
| 1 | Com integração contínua vermelha | A máquina já provou que algo quebrou |
| 2 | De PR em rascunho | Rascunho declara que ainda não está pronto |
| 3 | Sem confirmação **daquele** PR específico | Confirmação em lote não é confirmação |
| 4 | Com faixa OLHO OBRIGATÓRIO sem a confirmação de que os arquivos foram revisados | É o propósito inteiro da classificação |
| 5 | Resolvendo conflito | A resolução é humana |
| 6 | Com `REVIEW EVIDENCE` diferente de `SATISFEITO` | Mudança de código não encerra review — evidência encerra review (ver "O REVIEW EVIDENCE GATE") |

A confirmação humana específica do gate não é exceção à recusa 6: ela só permite **recalcular**
o gate nesta execução. Merge exige o resultado recalculado `SATISFEITO`, a confirmação final
daquele PR **e** a revalidação do item 5 imediatamente antes da operação, com o merge
atomicamente preso ao HEAD revalidado. Nenhuma confirmação
humana substitui CI vermelho (`FALHOU`) nem CI não verificável (R1 `NÃO VERIFICÁVEL`).

## Critério de saída

- [ ] Todos os PRs abertos foram listados, inclusive rascunhos e inelegíveis.
- [ ] Sobreposições estão no topo, com os PRs identificados e os arquivos em comum.
- [ ] O critério de ordenação está declarado.
- [ ] A ordem vai do menor para o maior impacto, depois da ordem dos empilhados: nenhum PR empilhado foi oferecido antes da predecessora.
- [ ] Nenhum PR redirecionado foi oferecido sem `redirecionado=sim elegivel` sobre o HEAD atual (sincronizado, CI e revisão do `revisor_bot` da base depois do redirecionamento).
- [ ] PRs com integração vermelha, rascunhos e `REVIEW EVIDENCE` diferente de `SATISFEITO` não foram oferecidos para merge.
- [ ] Todo PR mostrou `Review Evidence: SATISFEITO | BLOQUEADO`, R1–R6 individuais e o bloco `Reviews` com as seis contagens.
- [ ] Todo merge feito passou pela revalidação imediatamente anterior (HEAD, rascunho, CI, decisão de review, threads, base), com o gate R1–R6 recalculado e igual ao confirmado; HEAD alterado invalidou as confirmações e barrou o merge nesta passagem, e qualquer mudança no resultado do gate entre a releitura e o merge invalidou a passagem.
- [ ] Depois de cada merge, o gate do mesmo HEAD foi relido; mudança anterior ao instante do merge, ou releitura posterior impossível, foi dita ao desenvolvedor, registrada no rastro e encerrou a passagem, depois do item 7 daquele PR.
- [ ] Toda escrita de review (resposta, resolução, comentário) foi contada só com ID/URL ou releitura devolvidos pela plataforma.
- [ ] PR bloqueado mostrou os findings pendentes nomeados e o tipo de bloqueio.
- [ ] PR com bloqueio confirmável só chegou à pergunta de merge depois das confirmações específicas e do gate recalculado `SATISFEITO`; as confirmações aparecem na saída e no rastro.
- [ ] Finding válido virou pacote `REVIEW REMEDIATION` devolvido à skill de origem; a mergex não corrigiu o código do produto. O pacote foi persistido na thread do finding ou em comentário durável do PR — ou, se não havia canal de escrita, a saída informou explicitamente o handoff como `NÃO PERSISTIDO` (`NÃO VERIFICÁVEL`), com o pacote completo.
- [ ] Conflitos foram relatados com as duas intenções, sem resolução.
- [ ] Cada merge feito teve confirmação específica; os de OLHO OBRIGATÓRIO tiveram a confirmação dupla.
- [ ] PRs abertos por esta instalação da mergex estão marcados.
- [ ] `pr_estado: merged` foi para o `.expx/estado.json` **apenas** se o PR mergeado era o do trabalho atual; PR de outro trabalho não alterou a barra.
- [ ] O rastro da sessão foi para o stream do trabalho atual ou, sem trabalho atual certo, para `docs/eventos/sem-trabalho.jsonl` — nunca para o stream do trabalho de um PR revisado.

Ao fim, um resumo: o que foi integrado, o que ficou pendente e por quê.

## O rastro do comando manual

Grave em `docs/eventos/<trabalho_id>.jsonl`: **a lista de PRs avaliados, a ordem
apresentada, as confirmações humanas do gate dadas nesta execução (cada uma com o identificador
do finding e da thread), as escritas de review feitas
(com o ID/URL devolvido pela plataforma), as revalidações pré-merge que barraram merge, o que
foi mergeado e os merges recusados.**

### Destino do rastro — a sessão de revisão, não os PRs revisados

O rastro do E9 é da **sessão de revisão**. Ele nunca é atribuído a um dos PRs revisados só
porque o PR pertence a um trabalho.

| Situação | Destino |
|---|---|
| Existe trabalho atual (ver "Trabalho atual no E9", no passo 2: um único `ENTREGA.md` com `branch` igual à branch Git atual) | `docs/eventos/<trabalho_id>.jsonl` desse trabalho, como hoje |
| Trabalho atual = nenhum (branch principal, HEAD destacado, nenhuma ou mais de uma correspondência, dúvida) | `docs/eventos/sem-trabalho.jsonl`, com `"trabalho_id":"sem-trabalho"` |

`sem-trabalho` já existe como identificador sentinela no mecanismo `expx-eventos` v1: o helper
`expx_trabalho_id`, em `.claude/hooks/comum/base.sh`, devolve o trabalho do `ENTREGA.md`
modificado mais recentemente quando existe algum, e `sem-trabalho` só quando não existe nenhum
`ENTREGA.md`. O E9 reutiliza esse identificador e o mesmo mecanismo de arquivo — mesmo
diretório, mesmo formato de linha, mesmo `.gitignore` e mesma rotação —, mas **não** a
heurística do helper: decide usar `sem-trabalho` pela própria regra autoritativa (ver "Trabalho
atual no E9": branch Git + exatamente um `ENTREGA.md` correspondente) e nunca pelo `ENTREGA.md`
mais recente. Não é um trabalho fictício
— não tem forma de slug de feature nem de OC-ID — e nenhuma skill de execução o usa como
`trabalho_id`. O caminho é fixo, portanto recuperável em outra sessão.

Regras:

- **Nunca grave a sessão no stream de um PR revisado.** Revisar ou mergear o PR de outro
  trabalho não leva o evento para `docs/eventos/<trabalho daquele PR>.jsonl`; o evento vai para
  o destino da tabela acima, e o PR aparece só no `detalhe`.
- **Não use o `ENTREGA.md` modificado mais recentemente** para escolher o destino, como faz o
  hook: no E9, o `ENTREGA.md` mais recente pode ser justamente o de outro trabalho em revisão.
- **Na dúvida, `sem-trabalho`** — a mesma disciplina do item 7 do passo 7 ("na dúvida, deixe a
  barra como está").
- PR aberto fora do método (sem `ENTREGA.md`) entra no `detalhe` como qualquer outro, sem
  alterar o destino.

```json
{"ts":"<ISO-8601 UTC>","expx_eventos":1,"trabalho_id":"<id>","ferramenta":"mergex","origem":"skill","evento":"veredito_emitido","fase":"e9","task":null,"agente":"analista-de-conflito","resultado":"ok","detalhe":"PRs avaliados: #479, #482; ordem: #479 < #482; confirmações humanas: #482 R2 (API não expõe decisão de review); mergeado: #479","arquivos":[]}
```

O registro é do que **uma pessoa decidiu**, não do que a skill decidiu: a
mergex **nunca faz merge por conta própria, em nenhum caminho**. Cada merge da
lista teve confirmação explícita daquele PR específico.

## Quando falha

| Situação | O que fazer |
|---|---|
| Ferramenta ausente ou não autenticada | Encerra dizendo que a revisão precisa ser feita pela interface; nunca pede credencial |
| Nenhum PR aberto | Diz e encerra |
| PR sem registro da mergex | Apresenta com o que houver e marca "sem registro da mergex" |
| Integração contínua não configurada | Marca "sem integração contínua"; não é impedimento, mas entra na recomendação |
| `mergeable` desconhecido | Verifica localmente com `merge-tree`; se não der, marca "conflito não verificado" e trata como conflito |
| Merge falha no serviço | Relata o erro literal e segue para o próximo PR; nunca tenta contornar |
| Usuário pede para resolver o conflito | Recusa: a mergex relata as duas intenções; a resolução é humana (regra 17) |
| Usuário pede merge em lote | Recusa: um por vez, com confirmação de cada (regra 17) |
| Ferramenta lista o PR mas não expõe reviews/threads | Marca os critérios afetados (R2/R3/R5/R6, conforme o dado ausente) como `NÃO VERIFICÁVEL` — `REVIEW EVIDENCE: BLOQUEADO`, confirmável humanamente se não houver outro bloqueio. No passo 7, pede a confirmação específica de cada um e recalcula; sem confirmação, continua `BLOQUEADO` — mesmo critério conservador do `mergeable` desconhecido |
| CI configurado, mas o resultado do HEAD atual não pode ser obtido | R1 `NÃO VERIFICÁVEL`; `REVIEW EVIDENCE: BLOQUEADO` corrigível (não confirmável humanamente) — o PR fica inelegível nesta execução |
| HEAD autoritativo não confirmado (`headRefOid` ausente, fork sem cabeça buscável, fallback `origin/<head>` divergente) | R4 não pode ser `OK`; com finding corrigido, `BLOQUEADO` corrigível, inelegível nesta execução. R1: `n/a` sem CI configurado; `NÃO VERIFICÁVEL` com CI configurado |
| Leitura paginada incompleta (alguma página de `reviewThreads`, `reviews`, `comments`, `discussions` ou `notes` não obtida) | Critérios que dependem da coleção (R2/R3/R5/R6) ficam `NÃO VERIFICÁVEL`; `REVIEW EVIDENCE` permanece `BLOQUEADO`; nunca conclui a partir da primeira página |
| Plataforma não expõe responder, resolver ou comentar no PR | Capacidade `NÃO VERIFICÁVEL`; nada é simulado; R5 não é produzido nesta execução e a thread fica aberta |
| Plataforma não expõe quem resolveu ou quando | Thread resolvida antes da execução: R5 continua podendo ser `OK` se um rastro anterior da mergex comprovar evidência publicada e, depois, a resolução; R5 só é `NÃO VERIFICÁVEL` quando não há timestamp suficiente da plataforma nem rastro histórico suficiente. Proveniência da resolução indeterminável (conta que pode ser operador ou automação, sem rastro que prove a origem): R6 `NÃO VERIFICÁVEL`, nunca inferido pelo login. Ambos confirmáveis humanamente, com recálculo |
| Serviço sem merge atômico preso ao HEAD (sem `--match-head-commit`, sem `sha` no merge, sem garantia equivalente comprovável) | Não executa o merge; informa que o serviço não oferece merge atômico seguro para a automação; mantém o PR aberto e registra no rastro |
| Revalidação pré-merge detecta mudança ou não consegue reler | Não faz o merge nesta passagem; HEAD novo invalida as confirmações anteriores; diz o que mudou |
| Gate muda no mesmo HEAD (finding novo de bot, check não obrigatório que muda) | Antes do merge: o gate R1–R6 recalculado na releitura difere do confirmado — não faz o merge nesta passagem. Depois do merge (a releitura posterior acha mudança anterior ao instante do merge): passagem invalidada; diz o que mudou e que o merge foi feito, registra no rastro, faz o item 7 deste PR (o merge aconteceu), encerra a passagem e não reverte por conta própria. Releitura posterior impossível (falha ou página não obtida) tem a mesma conduta |
| Nenhum canal de escrita para publicar `REVIEW REMEDIATION` | Handoff `NÃO VERIFICÁVEL`, PR segue `BLOQUEADO`; informa o motivo literal e mostra o pacote completo na saída; nunca diz que persistiu |
| Plataforma não expõe estado resolved/outdated de uma thread | Trata como fonte ausente para aquele campo; o finding correspondente não passa de `FIXED_AWAITING_EVIDENCE` — nunca vira `RESOLVED` sem confirmação verificável |
| Usuário pede para resolver thread ou marcar finding sem evidência publicada | Recusa: sem R4/R5, o finding fica onde está; a mergex não maquia review encerrado |
