# E0 — ABERTURA

Você está no E0. Esta etapa roda **quando o trabalho começa**, não no fim: acionada pela `sprintx` no início da F6 e pela `runx` no início do E3, antes da primeira task.

Objetivo: garantir que exista uma branch própria para este trabalho, nascida antes da primeira linha de código, sem passar por cima do trabalho não salvo de ninguém.

**A branch pode já existir, e normalmente existe.** A `sprintx` abre a feature em `feature/<slug>` e em `git worktree` próprio já na F1 (regra 21 dela), muito antes da F6. Quando a skill de origem já criou branch ou worktree, o E0 **adota** o que existe: ele registra e valida a entrega, e **nunca cria uma segunda branch para o mesmo trabalho**.

Você não pergunta nada e não pede autorização. O E0 para em dois casos, e nos dois **para e avisa** — não é pergunta, é bloqueio: árvore suja quando seria preciso criar ou trocar de branch (passo 4, caso C), e branch alvo em uso por outro worktree (passo 4, caso B).

## Pré-requisitos verificáveis

Existe um trabalho em andamento com `trabalho_id` conhecido. Procure o `ORQUESTRADOR.md` nesta ordem, parando no primeiro que existir:

| Origem | Ordem de busca |
|---|---|
| sprintx | 1. `docs/sprintx/features/<slug>/ORQUESTRADOR.md` (canônico) · 2. `docs/<slug>/ORQUESTRADOR.md` (formato antigo) |
| runx | `docs/manutencao/<OC-ID>-<slug>/ORQUESTRADOR.md` |

O canônico da sprintx é `docs/sprintx/features/<slug>/`; `docs/<slug>/` é o formato anterior, que a sprintx continua suportando em pastas já existentes. Registre qual dos dois respondeu — todas as etapas seguintes (E2, E3, E4) leem a **mesma** pasta.

**Nunca mova a pasta legada.** Migrar é decisão do usuário, e mover por conta própria quebraria links e histórico do repositório dele. A mergex trabalha onde a pasta está.

Se nenhum deles existe, não há trabalho para abrir. Diga que a mergex precisa de um trabalho planejado (F4 da sprintx ou E2 da runx) e encerre sem criar nada.

## A entrega de planejamento (`--planejamento`)

O chamador pode pedir ao E0 a **entrega de planejamento** com `--planejamento` (DM-259): o PR que
leva só os artefatos de método do planejamento (tudo sob `^docs/(sprintx|entregas|eventos)/`),
aberto no fim da F5, antes da primeira sprint, com merge do desenvolvedor, nunca automático. Vale
em `por_sprint` e em `por_trabalho`. A sprintx chama E0–E8 com `--planejamento` no fim da F5
(`references/integracao/sprintx.md`). Só a pasta canônica (`docs/sprintx/features/<slug>/`) serve:
a pasta antiga (`docs/<slug>/`) fica fora dos artefatos de método do PR de planejamento, e o E0
`--planejamento` **recusa** o trabalho que só tem a pasta antiga (migrar é decisão do usuário).

**Pré-condição, antes de qualquer escrita:** a pasta canônica existe e o planejamento já está
commitado. Nada sujo nem fora do índice sob a pasta do trabalho — quem commita o planejamento é a
sprintx, antes de chamar o E0; a mergex não amplia o catálogo de método para isso:

```bash
# E0 --planejamento: o planejamento tem de estar commitado (<slug> = o trabalho)
[ -d "docs/sprintx/features/<slug>" ] || {
  printf 'mergex E0 BLOQUEADO — planejamento não commitado: o PR de planejamento só leva a pasta canônica docs/sprintx/features/<slug>/\n' >&2
  exit 1
}
sujo="$(git status --porcelain --untracked-files=all -- "docs/sprintx/features/<slug>/")" || exit 2
if [ -n "$sujo" ]; then
  printf 'mergex E0 BLOQUEADO — planejamento não commitado:\n%s\n' "$sujo" >&2
  exit 1
fi
# git status não mostra artefatos ignorados; só Markdown pertence ao planejamento.
ignorados="$(git ls-files --others --ignored --exclude-standard -- ":(glob)docs/sprintx/features/<slug>/**/*.md")" || exit 2
rastreados="$(git ls-files -- ":(glob)docs/sprintx/features/<slug>/**/*.md")" || exit 2
if [ -n "$ignorados" ] || [ -z "$rastreados" ]; then
  printf 'mergex E0 BLOQUEADO — planejamento ignorado ou sem arquivos rastreados:\n%s\n' "$ignorados" >&2
  exit 1
fi
```

Saída diferente de zero: `mergex E0 BLOQUEADO — planejamento não commitado`, com a lista. O E0
encerra sem escrever nada (nem `ORQUESTRADOR.md`, nem `ENTREGA.md`, nem o `pre-push`).

**Recusas, também antes de escrever:**

- `--planejamento` numa entrega com `commits` não vazio: o trabalho já executou tasks, e o
  planejamento não é mais a primeira entrega.
- `--planejamento` numa entrega cujo planejamento já `merged` (`entrega-de-planejamento.sh`
  diz `estado=merged`, ou a retomada já o fechou): o PR de planejamento é um só.
- Entrega ilegível para `scripts/entrega-de-planejamento.sh` (saída 2): relate o motivo.

Com `--planejamento`, o passo 5 grava as chaves da marca (caso 1); na retomada do próprio
planejamento (caso 2 com `--planejamento`), preserva o item de `prs` como está.

### Retomada depois do PR de planejamento

A F6 da primeira sprint chama o E0 **sem** `--planejamento` numa entrega cujo primeiro item de
`prs` é o planejamento. O E0 só segue com estas pré-condições, conferidas antes de qualquer
escrita:

1. `entrega-de-planejamento.sh --entrega docs/entregas/<trabalho_id>/ENTREGA.md` diz
   `planejamento=sim` com `estado=merged` e um `merge_sha` (o item de `prs` com `estado: merged`);
2. o `merge_sha` é ancestral da base buscada (`git fetch` da base;
   `git merge-base --is-ancestor <merge_sha> <base>`);
3. a base buscada é ancestral do `HEAD` (a branch foi atualizada a partir da main depois do merge).

Então grava `sprint_atual: null` e volta `pr_url`/`pr_estado` a `null`; o item de planejamento
fica em `prs` como histórico. **Sem o registro do merge** (`estado` diferente de `merged`), o E0
recusa e manda rodar o E9, que lê o PR no serviço e registra o merge, inclusive o feito pelo botão
do serviço (`09-revisao.md`). O E0 nunca consulta o serviço. Branch sem a main: recusa, e a
sprintx atualiza a branch antes de chamar de novo.

Na mesma gravação, o E0 **reancora a base validada** (DM-261): `base_validada_sha` passa a ser
`git merge-base HEAD <base>` (a main atualizada, que contém o `merge_sha`) e `origem_base` passa a
`registrada_sprint`. Sem isso, a V9 da primeira sprint não tem base: a antiga traz no diff tudo o
que veio da main, e uma base nova sem a marca contém o commit do planejamento (a pasta do trabalho
e o `Trabalho: <id>`), que a V9 recusa. Com `registrada_sprint`, a V9 lê o `merge_sha` da entrega
e só desconta das guardas da base o que ele contém (`02-prontidao.md`, V9). Vale em `por_sprint`
e em `por_trabalho`. Entrega com `reconciliacoes` não vazio (a main entrou na branch do
planejamento por reconciliação) não é reancorada: a base dela vem da cadeia, e o E0 recusa.

As três pré-condições e a base nova, em toda retomada sem `--planejamento` (`<base>` é a base
buscada, por exemplo `origin/main`). Saída 0 com as duas linhas: grave-as. Saída 0 sem nada: não
é a primeira sprint depois do planejamento, e a base fica como está. Saída 1: recusa, sem escrever
nada. Saída 2: entrega ilegível ou base inexistente; relate o motivo.

```bash
# E0, retomada sem --planejamento: a base da primeira sprint depois do planejamento
marca="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --entrega "docs/entregas/<trabalho_id>/ENTREGA.md")" || exit 2
case "$marca" in planejamento=sim*) ;; *) exit 0 ;; esac
estado="$(printf '%s\n' "$marca" | sed -n 's/^estado=//p')"
merge_sha="$(printf '%s\n' "$marca" | sed -n 's/^merge_sha=//p')"
if [ "$estado" != merged ]; then
  printf 'mergex E0 BLOQUEADO — o merge do PR de planejamento não está registrado: rode o E9, que o lê no serviço e o registra\n' >&2
  exit 1
fi
# com reconciliação registrada, a base vem da cadeia: reancorar a deixaria sem âncora
rec="$(awk 'NR == 1 { next } /^---/ { exit } /^reconciliacoes:/ { sub(/^reconciliacoes:[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print "v=" $0; exit }' "docs/entregas/<trabalho_id>/ENTREGA.md")"
case "$rec" in ''|'v=[]') ;; *)
  printf 'mergex E0 BLOQUEADO — a entrega já tem reconciliacoes: a base da primeira sprint não é reancorada sobre uma cadeia de reconciliação\n' >&2
  exit 1 ;;
esac
base_sha="$(git rev-parse --verify -q "<base>^{commit}")" || { printf 'mergex E0: base <base> inexistente\n' >&2; exit 2; }
git merge-base --is-ancestor "$merge_sha" "$base_sha" 2>/dev/null || {
  printf 'mergex E0 BLOQUEADO — a base <base> não contém o merge do planejamento (%s): busque a base de novo\n' "$merge_sha" >&2
  exit 1
}
git merge-base --is-ancestor "$base_sha" HEAD 2>/dev/null || {
  printf 'mergex E0 BLOQUEADO — a branch não foi atualizada a partir de <base> depois do merge do planejamento\n' >&2
  exit 1
}
printf 'base_validada_sha=%s\norigem_base=registrada_sprint\n' "$(git merge-base HEAD "$base_sha")"
```

Esse bloco é o da entrega `por_trabalho`. Na entrega por sprint, a F6 chama o E0 com `--sprint`, e
quem abre a primeira sprint depois do planejamento é o bloco abaixo.

## A entrega por sprint (`--sprint <NN>`)

*Desenho de 2026-10-18, 4.3; DM-264.* Com `entrega: por_sprint`, o trabalho continua um só (mesmo
slug, mesma branch, mesmo `ENTREGA.md`), mas cada sprint vai num PR próprio, **um por vez**: a sprint
N+1 só abre depois do merge do PR da N, com a branch atualizada a partir da main. A F6 chama o E0 no
início de cada sprint com `--sprint <NN>`, o id fixo da sprint (`01`, `02`, ...), que o E0 grava;
nenhuma etapa seguinte relê a sprint do plano.

**O modo efetivo é fixado uma vez.** O E0 lê `entrega:` do frontmatter do `00-PLANEJAMENTO.md` do
trabalho, que sobrescreve o `EXPX_ENTREGA` do `leitor-do-projeto.sh` (o padrão do projeto); valor
fora de `por_trabalho | por_sprint` faz o E0 parar. Gravado o modo na entrega (`entrega:`), ele não muda
mais, nem com o `00-PLANEJAMENTO.md` alterado depois: quem o lê é
`entrega-de-planejamento.sh --modo-efetivo`. A configuração atual do projeto só é lida se nem a
entrega nem o plano já decidirem o modo; uma entrega registrada continua definitiva mesmo se
`.expx/fatiamento.json` estiver depois ausente ou inválido. `--sprint` num trabalho `por_trabalho`
é recusa. Na entrega `por_trabalho`, o E0 grava `entrega: por_trabalho` no caso 1 (e na primeira
retomada de um arquivo sem a chave), com o modo que o mesmo `--modo-efetivo` disser.

**A sequência**, conferida antes de qualquer escrita (a gravação é de
`entrega-de-planejamento.sh --abrir-sprint`, o escritor único de `entrega`, `sprint_atual` e `prs`):

1. a sprint 01 só abre com o PR de planejamento `merged` (`prs[0]`); a sprint N+1, com o PR da N
   `merged` — sem o registro do merge, o E0 recusa e manda rodar o E9, que o lê no serviço;
2. a sprint pedida é a seguinte à última de `prs`: fora de sequência, recusa;
3. o `merge_sha` do último PR fechado é ancestral da base buscada, e a base buscada é ancestral do
   `HEAD` (a branch foi atualizada a partir da main depois do merge);
4. com `reconciliacoes` não vazio, a atualização da branch a partir da main nova já foi
   registrada como a reconciliação seguinte e a cadeia passa em `reconciliacao-base.sh
   --verificar`; a `base_validada_sha` da cadeia é a base buscada (DM-266). Sem cadeia, nada muda.

Então grava `entrega: por_sprint`, `sprint_atual: <NN>`, o item novo `{sprint: <NN>, url: null,
estado: null, merge_sha: null, merge: null, base_sha: null}` no fim de `prs`, volta `pr_url` e
`pr_estado` a `null`, e **reancora a base validada**: `base_validada_sha` = `git merge-base HEAD
<base>` e `origem_base: registrada_sprint` (a mesma exceção da retomada depois do planejamento,
DM-261). Com `--sprint <NN>` igual à `sprint_atual` e o PR dela ainda não `merged`, é retomada da
mesma sprint: nada disso muda. **Sprint fechada é imutável:** `--sprint <NN>` de uma sprint já
`merged` é recusa — defeito achado depois do merge vira task da sprint seguinte ou correção
própria, nunca reabertura.

Saída 0: aberta (ou retomada). Saída 1: recusa, sem escrever nada. Saída 2: entrega ou configuração
ilegível, ou base inexistente. `$sprint` é o `<NN>` que a F6 passou; `<base>` é a base buscada:

```bash
# E0 --sprint <NN>: o modo efetivo, a sequência e a base da sprint (DM-264)
sprint="${sprint:?o E0 --sprint recebe o id da sprint}"
entrega="docs/entregas/<trabalho_id>/ENTREGA.md"
plano="docs/sprintx/features/<slug>/00-PLANEJAMENTO.md"
modo="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --modo-efetivo --entrega "$entrega" --plano "$plano" --projeto por_trabalho)"
case $? in
  0) ;;
  1) printf 'mergex E0 BLOQUEADO — entrega: no frontmatter de %s fora de por_trabalho | por_sprint\n' "$plano" >&2; exit 1 ;;
  *) exit 2 ;;
esac
if printf '%s\n' "$modo" | grep -qx 'origem=projeto'; then
  fatia="$(bash .claude/skills/mergex/scripts/leitor-do-projeto.sh)" \
    || { printf 'mergex E0: configuração do projeto (.expx/fatiamento.json) não lida\n' >&2; exit 2; }
  projeto="$(printf '%s\n' "$fatia" | sed -n 's/^EXPX_ENTREGA=//p')"
  modo="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --modo-efetivo \
    --entrega "$entrega" --plano "$plano" --projeto "${projeto:-por_trabalho}")"
  case $? in
    0) ;;
    1) printf 'mergex E0 BLOQUEADO — entrega: no frontmatter de %s fora de por_trabalho | por_sprint\n' "$plano" >&2; exit 1 ;;
    *) exit 2 ;;
  esac
fi
case "$modo" in entrega=por_sprint*) ;; *)
  printf 'mergex E0 BLOQUEADO — --sprint num trabalho por_trabalho (%s)\n' "$(printf '%s\n' "$modo" | tr '\n' ' ')" >&2; exit 1 ;;
esac
marca="$(bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --entrega "$entrega")" || exit 2
atual="$(printf '%s\n' "$marca" | sed -n 's/^sprint_atual=//p')"
fechada_sha="$(printf '%s\n' "$marca" | sed -n 's/^fechada_merge_sha=//p')"
base_sha="$(git rev-parse --verify -q "<base>^{commit}")" || { printf 'mergex E0: base <base> inexistente\n' >&2; exit 2; }
nova="$(git merge-base HEAD "$base_sha")" || { printf 'mergex E0: nenhum merge-base entre HEAD e <base>\n' >&2; exit 2; }
if [ "$atual" != "$sprint" ] && [ -n "$fechada_sha" ]; then
  rec="$(awk 'NR == 1 { next } /^---/ { exit } /^reconciliacoes:/ { sub(/^reconciliacoes:[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print "v=" $0; exit }' "$entrega")"
  case "$rec" in
    ''|'v=[]') ;;
    *)
      prova="$(bash .claude/skills/mergex/scripts/reconciliacao-base.sh --verificar \
        --entrega "$entrega" --origem sprintx --trabalho <trabalho_id>)" || {
        printf 'mergex E0 BLOQUEADO — a cadeia de reconciliação não foi verificada antes da sprint %s\n' "$sprint" >&2
        exit 1
      }
      [ "$(printf '%s\n' "$prova" | sed -n 1p)" = ok=true ] || {
        printf 'mergex E0 BLOQUEADO — a cadeia de reconciliação respondeu sem ok=true\n' >&2
        exit 1
      }
      base_da_cadeia="$(awk 'NR == 1 { next } /^---/ { exit } /^base_validada_sha:/ { sub(/^base_validada_sha:[[:space:]]*/, ""); sub(/[[:space:]]+$/, ""); print; exit }' "$entrega")"
      [ "$base_da_cadeia" = "$nova" ] || {
        printf 'mergex E0 BLOQUEADO — registre a atualização da branch a partir da main como a próxima reconciliação; a cadeia termina em %s, não em %s\n' "${base_da_cadeia:-base ausente}" "$nova" >&2
        exit 1
      } ;;
  esac
  git merge-base --is-ancestor "$fechada_sha" "$base_sha" 2>/dev/null || {
    printf 'mergex E0 BLOQUEADO — a base <base> não contém o merge do último PR fechado (%s): busque a base de novo\n' "$fechada_sha" >&2
    exit 1
  }
  git merge-base --is-ancestor "$base_sha" HEAD 2>/dev/null || {
    printf 'mergex E0 BLOQUEADO — a branch não foi atualizada a partir de <base> depois do merge do último PR fechado\n' >&2
    exit 1
  }
fi
bash .claude/skills/mergex/scripts/entrega-de-planejamento.sh --abrir-sprint "$sprint" --entrega "$entrega" --base-validada-sha "$nova" || {
  rc=$?; [ "$rc" = 1 ] && printf 'mergex E0 BLOQUEADO — a sprint %s não abre (motivo acima)\n' "$sprint" >&2; exit "$rc"
}
```

## Passo 1 — Detectar se o repositório usa versionamento

```
git rev-parse --is-inside-work-tree
```

**Se o comando falhar ou não houver `git`:** o repositório não usa versionamento. Registre no `ENTREGA.md` (passo 5) `versionado: false` e **siga o trabalho normalmente, sem nenhuma operação de versionamento**. Ausência de versionador nunca é erro nem bloqueio (regra 15).

Nesse modo, E0, E1, E6 e E7 não têm o que fazer; E2, E3, E4, E5 e E8 continuam valendo — a classificação de atenção é feita sobre os arquivos declarados nas tasks em vez do diff, e o revisor recebe `PR.md` como documento.

Confirme também a raiz do repositório, que ancora `docs/entregas/`:

```
git rev-parse --show-toplevel
```

Num `git worktree`, isso devolve a raiz **do worktree** — que é onde o trabalho está acontecendo, e onde `docs/entregas/` deve nascer.

## Passo 2 — Determinar o nome da branch do trabalho

Convenção padrão da mergex:

| Origem | Padrão |
|---|---|
| trabalho da sprintx | `feature/<slug>` |
| `tipo: bug` da runx | `fix/<OC-ID>-<slug>` |
| demais tipos da runx (melhoria, campo novo, novo relatório, regra de cálculo) | `chore/<OC-ID>-<slug>` |

**Convenção detectada no repositório ou declarada no `CONVENCOES.md` da stackx vence a padrão acima** (regra 14). Para detectar, olhe os prefixos das branches existentes:

```
git branch -a --format='%(refname:short)'
```

Se a maioria das branches de trabalho usa outro prefixo ou outro separador, siga o que o repositório faz e registre a decisão no `ENTREGA.md`.

O `<slug>` é o mesmo já usado pela skill de origem — não gere um novo.

**Se a skill de origem já abriu a branch do trabalho**, o nome dela vence esta convenção: é o nome que já está no repositório. A `sprintx` registra o worktree na chave `worktree` do `ORQUESTRADOR.md`, e a branch na prosa dele; `git branch --show-current` confirma. Renomear a branch de alguém não é assunto do E0.

## Passo 3 — Determinar a branch base

Nesta ordem, parando no primeiro que responder:

1. **Base informada pelo chamador** — a skill que acionou o E0 declarou explicitamente de qual base este trabalho deve sair.
2. **Convenção declarada:** `docs/stack/CONVENCOES.md` da stackx, se existir, na seção de versionamento. Ponto marcado como `PROPOSTA` **não governa**: vira aviso, não regra.
3. **Convenção detectada no repositório:** a branch padrão do remoto —
   ```
   git symbolic-ref refs/remotes/origin/HEAD
   ```
4. **A principal atual:** a branch em que o repositório está agora (`git branch --show-current`), se ela for `main`, `master`, `develop` ou equivalente detectada.

### Quando a base é informada pelo chamador

Ela é a mais alta porque é a única que carrega informação que o repositório não tem: qual árvore este trabalho precisa enxergar. Duas exigências, e nenhuma é negociável:

- **Valide que a ref existe**, antes de usá-la:
  ```
  git rev-parse --verify --quiet <base-informada>
  ```
- **Ref inexistente ou ambígua não vira outra base em silêncio.** Pare, diga qual base foi pedida e que ela não existe, e encerre o E0 sem criar nem trocar branch. Cair para `origin/HEAD` sem avisar faria o trabalho nascer de uma árvore diferente da que o chamador pediu — e ninguém descobriria até o diff da entrega vir errado. Valide a ref e **nunca substitua silenciosamente por outra** base.

```
mergex E0 BLOQUEADO — base informada não existe

Base pedida pelo chamador: <base>
git rev-parse --verify não a encontrou neste repositório.

Nenhuma branch foi criada nem trocada. Crie a base, ou chame o E0 sem base
explícita para usar a convenção do repositório.
```

Registre qual das quatro respondeu. A base efetiva vai para `branch_base` no `ENTREGA.md`, e é ela que o E2 (V10), o E3 e o E4 usam no `git diff <branch-base>...HEAD`. A V9 não usa o nome: usa a base validada **por SHA**, `base_validada_sha`, que o passo 5 grava (`references/11-reconciliacao-base.md`). Um nome de ref que avançou ou ficou parado muda o resultado de um diff; um SHA, não.

Se a branch atual **não** for a base determinada e já for uma branch de trabalho de outra coisa, use a base determinada como ponto de partida — nunca ramifique um trabalho de dentro de outro sem que isso esteja declarado.

## Passo 4 — Adotar, criar ou trocar a branch

Verifique **antes** de qualquer operação:

```
git branch --show-current
git rev-parse --verify --quiet <nome-da-branch>
git worktree list --porcelain
```

Os três casos abaixo são exaustivos e mutuamente exclusivos. Resolva o primeiro que se aplicar.

### Caso A — a branch ativa já é a branch do trabalho

A skill de origem já abriu a branch e a sessão já está dentro dela — é o caminho normal quando a `sprintx` criou o worktree na F1.

**Adote.** Nesse caso:

- **não execute `git switch`** — não há para onde ir, e trocar para a branch em que já se está é operação sem efeito que só pode falhar;
- não crie branch nenhuma;
- **não exija árvore limpa.** Reconhecer que o processo já está na branch certa não mexe em arquivo nenhum, e os artefatos de F1 a F5 do próprio trabalho estão ali, ainda não commitados, exatamente como deveriam estar;
- registre no `ENTREGA.md` que a branch foi **adotada** da skill de origem, com a base efetiva.

Siga direto para o passo 5.

### Caso B — a branch alvo existe e está em uso por outro worktree

`git worktree list --porcelain` lista, para cada worktree, o `worktree <caminho>` e o `branch refs/heads/<nome>`. Se a branch alvo aparece num worktree que **não** é o atual, ela está em uso lá.

**Pare e avise.** Não troque, não crie outra, **nunca remova o worktree de ninguém**, nunca force:

```
mergex E0 — a branch deste trabalho está em outro worktree

Branch: <nome-da-branch>
Worktree: <caminho que o git worktree list devolveu>

O git não permite duas árvores na mesma branch, e a mergex não mexe na árvore
de ninguém. Continue o trabalho de dentro daquele diretório: rode /mergex-abrir
lá, e o E0 adota a branch normalmente (caso A).
```

E encerre o E0 sem alterar nada.

### Caso C — criar ou trocar branch

Só aqui a mergex mexe na posição da árvore: a branch do trabalho não existe (criar), ou existe e não está ativa nem em outro worktree (trocar).

**Exija árvore limpa primeiro:**

```
git status --porcelain
```

**Saída vazia:** siga.

**Qualquer linha na saída:** há alteração não commitada pendente. **PARE.** Não crie branch, não troque de branch, não commite, não guarde em stash, não descarte nada (regra 2).

```
mergex E0 BLOQUEADO — árvore de trabalho suja

Há alteração não commitada em:
  <lista dos arquivos de git status --porcelain>

A mergex não cria nem troca branch por cima de trabalho não salvo.
Commite, guarde em stash ou descarte essas alterações e rode /mergex-abrir de novo.
```

E encerre o E0. Quem decide o destino daquele trabalho é a pessoa, não a skill.

Arquivo apenas não rastreado (`??`) também conta: pode ser trabalho de alguém. A skill não julga o conteúdo.

**Árvore limpa é pré-condição para criar ou trocar branch, não para reconhecer que o processo já está na branch certa.** É o que a regra 2 diz literalmente — o risco que ela existe para evitar é o de uma troca de branch carregar ou destruir trabalho não salvo, e adotar (caso A) não troca nada.

Com a árvore limpa:

| Situação | Comando |
|---|---|
| A branch já existe | `git switch <nome>` — **retome nela, nunca crie outra** |
| A branch não existe | `git switch -c <nome-da-branch> <branch-base>` |

Confirme depois com `git branch --show-current`. Se a operação falhou, relate o erro do versionador literalmente e encerre — não tente contornar.

## Passo 5 — Registrar

Três gravações: duas de método, e uma terceira que é só exibição.

**1. No `ORQUESTRADOR.md` do trabalho** (da sprintx ou da runx, na pasta que os pré-requisitos encontraram), acrescente ou atualize a linha da branch, na prosa:

```
Branch do trabalho: <nome-da-branch> (base: <branch-base>) — <aberta | retomada | adotada> em <AAAA-MM-DD> pela mergex
```

`adotada` é o caso A: a branch é da skill de origem, e a mergex só a registrou. Obtenha a data com `date +%Y-%m-%d` do sistema, nunca de memória. Não reescreva mais nada do `ORQUESTRADOR.md`: a mergex só acrescenta essa linha.

**2. `docs/entregas/<trabalho_id>/ENTREGA.md` — criar ou retomar.**

O E0 é chamado no **início de toda F6**, inclusive quando a mesma feature volta do
replanejamento (portão bloqueado → replaneja → F3/F4/F5 → F6 de novo → E0 de novo). Por isso ele
é **idempotente**: nunca recria do zero um registro que já existe, e nunca apaga história.

**CASO 1 — o arquivo não existe.** Crie a partir de `assets/TEMPLATE-ENTREGA.md`, com estado **aberto**:

- `estado: aberto`
- `branch` e `branch_base` preenchidos — `branch_base` é a **base efetiva** determinada no passo 3
- `versionado: true` (ou `false`, se o passo 1 assim determinou)
- `commits: []` — a lista cresce no E1, e o primeiro item dela recebe `seq: 1`. **Não existe `seq` de topo**: o próximo número sai da própria lista (`00-schema.md`, "A ordem de registro")
- `portao: null`, `falhas_portao: []`, `causa: null`, `push_feito: false`, `pr_url: null`, `pr_estado: null`
- `base_validada_sha` com o SHA completo (40 hex) de `git merge-base HEAD <branch_base>`, e `origem_base: registrada_e0` — a base em que o trabalho é validado, fixada por SHA, nunca por nome de ref
- `reconciliacoes: []` e `portao_sha: null` — a lista só cresce pelo `reconciliacao-base.sh --registrar`, e `portao_sha` só é gravado pelo E2 (`registrar-portao.sh`)
- `criado_em` e `atualizado_em` com a data de hoje
- `sprint_atual` e `prs`: sem `--planejamento`, `sprint_atual: null` e `prs: []`. **Com
  `--planejamento`**, `sprint_atual: planejamento` e `prs` em YAML de bloco com um item só —
  `sprint: planejamento`, `url: null`, `estado: null`, `merge_sha: null`, `merge: null`,
  `base_sha: null`
  (`00-schema.md`, "A entrega de planejamento"). Confira a gravação com
  `entrega-de-planejamento.sh --entrega docs/entregas/<trabalho_id>/ENTREGA.md`: tem de dizer
  `planejamento=sim`

Repositório sem versionador (passo 1): `base_validada_sha` e `origem_base` ficam `null`, como `branch` e `branch_base`.

Na prosa, a linha da branch diz como ela chegou até aqui — `aberta pela mergex`, `retomada` ou `adotada da skill de origem` — e de onde saiu a base (chamador, `CONVENCOES.md`, `origin/HEAD` ou principal atual). É o que permite, depois, entender um diff que não bate com `main`.

Crie a pasta `docs/entregas/<trabalho_id>/` se não existir. Leia o contrato do frontmatter em `08-registro.md` antes de gravar.

**CASO 2 — o arquivo existe, é do mesmo `trabalho_id` e declara a mesma branch: é RETOMADA.**
Atualize **somente o necessário** para abrir uma nova tentativa de entrega:

| Campo | Na retomada |
|---|---|
| `estado` | volta para `aberto` |
| `portao` | volta para `null` — o veredito da tentativa anterior não vale para esta |
| `falhas_portao`, `causa` | voltam para `[]` e `null`, junto com o veredito. Arquivo anterior a estas chaves ganha as duas agora (`00-schema.md`, "A causa do bloqueio"); a causa da tentativa anterior continua no histórico da branch, nunca é copiada para esta |
| `push_feito` | volta para `false` |
| `commits` | **preservado. Nunca zere** — é o histórico de execução (ver `01-commits.md`). A série de `seq` **continua de onde parou**: a retomada nunca reinicia em 1 nem renumera o que já está gravado |
| `criado_em` | preservado |
| `desvios` | preservado enquanto continuar verdadeiro |
| `pr_url`, `pr_estado` | **preservados como estão.** O E0 não verifica e não afirma que aquele PR ainda vale; quem confirma é o E7, que já trata "PR já existe" como retomada. **Nunca abra um segundo PR e nunca recrie a branch** |
| `branch`, `branch_base` | coerentes com a branch adotada e com a base efetiva do passo 3 |
| `sprint_atual`, `prs` | **preservados**, com uma exceção: a primeira retomada sem `--planejamento` depois do PR de planejamento `merged` grava `sprint_atual: null` e volta `pr_url`/`pr_estado` a `null` ("Retomada depois do PR de planejamento"). Com `--planejamento`, o item de planejamento fica como está. Arquivo anterior às chaves ganha `sprint_atual: null` e `prs: []` |
| `portao_sha` | volta para `null`, junto com `portao` |
| `base_validada_sha`, `origem_base` | **preservados como estão.** O E0 de retomada **nunca acrescenta nem troca `base_validada_sha`** num `ENTREGA.md` existente, com uma única exceção: a primeira retomada sem `--planejamento` depois do PR de planejamento `merged` os reancora na main atualizada, com `origem_base: registrada_sprint` ("Retomada depois do PR de planejamento", DM-261). Fora dela, a base validada só muda pelo `reconciliacao-base.sh --registrar`, e uma entrega legada sem a chave só a ganha, uma única vez, na primeira reconciliação (`origem_base: inferida_legado`, `references/11-reconciliacao-base.md`) |
| `reconciliacoes` | preservado — a cadeia de reconciliações é histórico da entrega |
| `atualizado_em` | a data de hoje |
| prosa | acrescente que **esta é uma retomada** — e, quando for o caso, que a tentativa anterior parou no portão |

Nunca apague, na retomada: `commits`, `criado_em`, a prosa que ainda é válida, e os desvios que
continuam verdadeiros. Recriar o arquivo do zero apagaria o histórico de execução de um trabalho
que só voltou para o começo da entrega, não para o começo do mundo.

**CASO 3 — o arquivo existe mas declara outra branch.** Não é retomada desta branch. **Pare e
relate**, sem reescrever nada: ou o `trabalho_id` está sendo reaproveitado por outro trabalho, ou
alguém trocou a branch por fora — as duas coisas são decisão humana.

**3. Ative o `pre-push` da MergeX** — depois de criar ou retomar o `ENTREGA.md` (casos 1 e 2):

```bash
bash .claude/skills/mergex/scripts/ativacao-pre-push.sh --instalar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md
```

O script resolve o diretório de hooks efetivo pelo próprio Git (respeita `core.hooksPath` e a
worktree vinculada, **nunca altera `core.hooksPath`**), instala o chamador gerenciado quando não há
`pre-push`, não muda nada quando ele já é o gerenciado, e **nunca sobrescreve, renomeia ou edita**
um `pre-push` de terceiro. Em todos os casos termina com a prova funcional
(`references/12-barreira-de-push.md`). Quando o diretório efetivo está
**fora da árvore de trabalho e do diretório Git comum** (um `core.hooksPath` global, compartilhado
por vários repositórios), o script **não instala** o chamador (DM-186): sai `3` com a instrução de
composição, para quem mantém aquele diretório — instalado ali, o chamador viraria o `pre-push` de
todos os repositórios da máquina, preso ao validador deste checkout. Um `pre-push` já presente ali
segue a regra do hook de terceiro: só a prova funcional o aceita.

**Código diferente de zero: `mergex E0 BLOQUEADO — pre-push`.** O E0 encerra ali — não siga para o
item 4 nem devolva o controle como OK — e mostre ao usuário a instrução que o script imprimiu. Com
hook de terceiro (código `3`), a instrução é a de composição: o `pre-push` existente chama
`portao-push.sh --pre-push "$@"`, repassa a entrada padrão e propaga exatamente o código de saída
dele. A composição é feita à mão pelo responsável do hook; depois dela, o E0 roda de novo e a
prova decide. Repositório sem versionador (passo 1): não há `pre-push` a ativar; pule este item —
e, se o script rodar fora de um repositório Git, ele próprio sai `0` sem instalar nada (DM-186;
o critério é o Git real, nunca o campo `versionado`).

**4. Atualize `.expx/estado.json`**, o arquivo que a barra de status lê:

- `branch`: o nome da branch, **completo e sem corte** — a criada agora, a retomada ou a adotada;
- `pr_estado`: `null` — no E0 nunca existe pull request, inclusive na retomada de uma branch
  cujo PR já tenha sido aberto antes. Se ele já existia, o E7 o repõe.

**Repositório sem versionador (passo 1): não grave nada.** Os dois campos ficam `null`, que
é o valor que já têm.

O procedimento é o de `10-estado.md`: só se `.expx/` existir, alterando apenas estes dois
campos e preservando os das outras skills, com gravação em temporário e renomeação. Falha de
gravação **não interrompe o E0** — a barra nunca barra trabalho — mas é registrada: grava
`artefato_gravado` com `resultado: falha` (`10-estado.md`, "Falha de gravação é rastreada"), e
o `estado.json` não gravado não é tratado como gravado.

## Critério de saída

O E0 terminou quando **todas** são verdade:

- [ ] A detecção de versionamento foi feita e registrada.
- [ ] O `ORQUESTRADOR.md` do trabalho foi localizado, e a pasta encontrada (canônica ou legada) está registrada.
- [ ] A branch do trabalho existe e está ativa — criada agora, retomada ou adotada da skill de origem.
- [ ] Nenhuma segunda branch foi criada para este trabalho.
- [ ] `git status --porcelain` estava vazio na hora de criar ou trocar a branch (ou o repositório não é versionado, ou a branch foi adotada sem troca).
- [ ] `ORQUESTRADOR.md` tem a linha da branch.
- [ ] `docs/entregas/<trabalho_id>/ENTREGA.md` existe com `estado: aberto` e frontmatter válido.
- [ ] Numa entrega nova, `base_validada_sha` é um SHA de 40 hex com `origem_base: registrada_e0`; numa retomada, os dois estão exatamente como estavam, salvo a primeira depois do PR de planejamento `merged`, que os grava com a saída do bloco da retomada (`origem_base: registrada_sprint`).
- [ ] O `pre-push` efetivo está ativo: `ativacao-pre-push.sh --instalar` saiu `0` (chamador gerenciado instalado ou já presente, ou integração externa válida), sem alterar `core.hooksPath` nem hook de terceiro — ou o repositório não é versionado.
- [ ] `.expx/estado.json` tem `branch` e `pr_estado: null` — **ou** `.expx/` não existe, ou o repositório não é versionado, e nesses casos nada foi gravado. Este item nunca reprova o E0.

Devolva ao chamador uma linha só: `mergex E0 OK — branch <nome> (base <base>, <criada | retomada | adotada>), entrega registrada.` E devolva o controle: quem executa as tasks é a skill de origem.

## Quando falha

| Situação | O que fazer |
|---|---|
| Sem `git` / sem repositório | `versionado: false`, segue sem versionamento, sem erro (regra 15) |
| Branch ativa já é a do trabalho | Adota: não troca, não cria, não exige árvore limpa (caso A) |
| Branch alvo em outro worktree | Informa o caminho e encerra; nunca troca, nunca remove worktree (caso B) |
| Árvore suja ao criar ou trocar | PARA e avisa, sem criar nem trocar branch (regra 2) |
| Branch já existe e está livre | Retoma nela, não cria outra |
| Base informada pelo chamador não existe | PARA e avisa; nunca cai para outra base em silêncio |
| Branch base não determinável | Usa a branch atual, registra a incerteza como aviso no `ENTREGA.md` |
| `git switch -c` falha | Relata o erro literal e encerra; nunca força, nunca descarta nada |
| Sem trabalho planejado | Diz o que falta (F4 da sprintx / E2 da runx) e encerra |
| Pasta do trabalho em formato antigo | Trabalha nela onde está; **nunca move**, e registra qual pasta usou |
| `.expx/` não existe | Segue sem gravar o estado da barra, sem erro e sem aviso; **nunca cria o diretório** |
| Gravação do `estado.json` falhou | Segue, registrando `artefato_gravado` com `resultado: falha` (`10-estado.md`); o E0 continua OK |
| `ativacao-pre-push.sh --instalar` saiu diferente de zero | `mergex E0 BLOQUEADO — pre-push`: encerra o E0 e mostra a instrução do script (com hook de terceiro, a de composição); nunca edita o hook nem `core.hooksPath` |
