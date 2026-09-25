#!/usr/bin/env bash
# Testes dos hooks da mergex.
#
# Cada caso declara o que TEM que barrar e o que TEM que passar. Os casos de
# "tem que passar" são os mais importantes: hook que dá falso positivo é
# desinstalado, e junto com ele vão os que funcionavam.
#
# Uso: ./hooks/teste.sh

set -uo pipefail
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$H/../.." && pwd)"
# shellcheck source=scripts/ci/lib/fixture-git.sh
. "$REPO_ROOT/scripts/ci/lib/fixture-git.sh" || exit 1
OK=0; FALHOU=0; PULADOS=0

# Os hooks leem o evento do harness com jq. Sem jq, todo hook sai cedo e por
# 0 — o que faria a suite reportar "passou" onde nao verificou nada. Entao os
# casos que dependem de jq sao PULADOS, e ficam visiveis como tal.
# Em CI isso nunca vale: la a ausencia de jq e falha de ambiente, e a suite
# inteira precisa rodar (o workflow instala jq antes).
SEM_JQ=0
if ! command -v jq >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    printf 'jq ausente no ambiente de CI: os hooks dependem dele. Abortando.\n' >&2
    exit 1
  fi
  SEM_JQ=1
  printf 'AVISO: jq ausente nesta maquina. Casos que dependem de jq serao PULADOS.\n'
  printf '       Rode em Linux/CI (ou em container) para cobri-los.\n\n'
fi

RAIZ_T="$(mktemp -d)"
WT_T="${RAIZ_T}--wt"        # worktree derivado: .git e ARQUIVO, nao diretorio
SEMGIT_T="$(mktemp -d)"
HIST_T="$(mktemp -d)"
trap 'rm -rf "$RAIZ_T" "$WT_T" "$SEMGIT_T" "$HIST_T"' EXIT
HOOK_CWD="$RAIZ_T"

cd "$RAIZ_T" || exit 1
git init -q -b main . 2>/dev/null
git config user.email teste@expx.local
git config user.name Teste
mkdir -p docs/sprintx/features/trab/sprint-01 docs/entregas/trab
echo conteudo > arquivo.txt
git add arquivo.txt && git commit -qm inicial

cat > docs/sprintx/features/trab/sprint-01/tasks.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: trab
tasks:
  - id: T-01.01
    titulo: Primeira task
    status: concluida
    arquivos:
      cria: [src/a.ts]
      altera: []
    suite: verde
  - id: T-01.02
    titulo: Segunda task
    status: em_andamento
    arquivos:
      cria: [src/b.ts]
      altera: []
    suite: vermelha
---
YAML
cat > docs/entregas/trab/ENTREGA.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: entrega
trabalho_id: trab
entregue_por: mergex
branch: main
branch_base: main
---
YAML
mkdir -p src && touch src/a.ts src/b.ts

# A árvore precisa nascer limpa: o branch-limpa conta arquivo apenas não
# rastreado como pendência (DM-26), e com razão — pode ser trabalho de alguém.
git add -A && git commit -qm "plano e fontes"

# caso <descricao> <script> <ferramenta-json> <exit esperado>
caso() {
  local desc="$1" script="$2" json="$3" esperado="$4"
  local obtido
  if [ "$SEM_JQ" = "1" ]; then
    PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "$desc"; return 0
  fi
  printf '%s' "$json" | bash "$H/$script" >/dev/null 2>&1
  obtido=$?
  if [ "$obtido" = "$esperado" ]; then
    OK=$((OK+1)); printf '  ok    %s\n' "$desc"
  else
    FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava %s, obteve %s)\n' "$desc" "$esperado" "$obtido"
  fi
}

bash_json() { jq -cn --arg c "$1" --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:$c}}'; }
write_json() { jq -cn --arg c "$1" --arg w "$HOOK_CWD" '{tool_name:"Write",cwd:$w,tool_input:{content:$c}}'; }

echo
echo "sem-segredo — tem que BARRAR"
# As amostras abaixo são montadas em pedaços, de propósito: escritas inteiras
# no arquivo, elas fariam o próprio sem-segredo barrar o commit deste teste —
# o que é o hook funcionando, mas deixaria a suíte impossível de versionar.
# Nenhum valor aqui é real; todos são sintéticos e montados em tempo de teste.
SK="sk-$(printf 'abcdef1234567890QRS')"
PK="$(printf -- '-----BEGIN RSA %s KEY-----' 'PRIVATE')"
SENHA="$(printf 'password = %sTr0ub4dorZ3x%s' "'" "'")"
CPF="$(printf 'cliente 123.%s-01' '456.789')"
URL="$(printf 'postgres://u:%s@db/x' 's3nh4sintetica')"

caso "chave sk-"          comum/sem-segredo.sh "$(write_json "const k=\"$SK\"")" 2
caso "chave privada"      comum/sem-segredo.sh "$(write_json "$PK")" 2
caso "senha atribuida"    comum/sem-segredo.sh "$(write_json "$SENHA")" 2
caso "CPF sintetico"      comum/sem-segredo.sh "$(write_json "$CPF")" 2
caso "URL com credencial" comum/sem-segredo.sh "$(write_json "$URL")" 2
echo "sem-segredo — tem que PASSAR"
caso "variavel de ambiente" comum/sem-segredo.sh "$(write_json 'const k = process.env.API_KEY')" 0
caso "placeholder <>"       comum/sem-segredo.sh "$(write_json 'password: <coloque-a-senha>')" 0
caso "marcador de template" comum/sem-segredo.sh "$(write_json 'token: {{seu_token}}')" 0
caso "variavel de shell"    comum/sem-segredo.sh "$(write_json 'SECRET=${MINHA_VAR}')" 0
caso "prosa sobre senha"    comum/sem-segredo.sh "$(write_json 'O campo senha e validado no login')" 0
caso "comando comum"        comum/sem-segredo.sh "$(bash_json 'npm test')" 0

echo
echo "git-perigoso — tem que BARRAR"
caso "push --force"           mergex/git-perigoso.sh "$(bash_json 'git push --force origin main')" 2
caso "push -f"                mergex/git-perigoso.sh "$(bash_json 'git push -f')" 2
caso "push --force-with-lease" mergex/git-perigoso.sh "$(bash_json 'git push --force-with-lease')" 2
caso "push +refspec"          mergex/git-perigoso.sh "$(bash_json 'git push origin +feat:main')" 2
caso "commit na principal"    mergex/git-perigoso.sh "$(bash_json "git commit -m x")" 2
caso "clean -fd"              mergex/git-perigoso.sh "$(bash_json 'git clean -fd')" 2
echo "git-perigoso — tem que PASSAR (falsos positivos)"
caso "git status"             mergex/git-perigoso.sh "$(bash_json 'git status')" 0
caso "git log"                mergex/git-perigoso.sh "$(bash_json 'git log --oneline')" 0
caso "npm run push-notifications" mergex/git-perigoso.sh "$(bash_json 'npm run push-notifications')" 0
caso "echo sobre push --force"    mergex/git-perigoso.sh "$(bash_json "echo 'nao faca push --force'")" 0
caso "grep por push"          mergex/git-perigoso.sh "$(bash_json 'grep -r push src/')" 0
caso "git clean -n (seco)"    mergex/git-perigoso.sh "$(bash_json 'git clean -n')" 0
caso "git fetch"              mergex/git-perigoso.sh "$(bash_json 'git fetch origin')" 0
# Desfazer o stage NAO toca a arvore e nao destroi nada: barrar isso seria o
# falso positivo que atrapalha o dia inteiro. Regressao de um caso real.
caso "restore --staged (so o stage)" mergex/git-perigoso.sh "$(bash_json 'git restore --staged f.txt')" 0
caso "checkout de branch"            mergex/git-perigoso.sh "$(bash_json 'git checkout outra-branch')" 0

echo
echo "branch-limpa"
caso "troca com arvore limpa"  comum/branch-limpa.sh "$(bash_json 'git switch outra')" 0
echo modificado >> arquivo.txt
caso "troca com arvore suja"   comum/branch-limpa.sh "$(bash_json 'git switch outra')" 2
# Descarte so e perigoso quando ha o que perder: aqui a arvore esta suja.
caso "restore sem flag"   mergex/git-perigoso.sh "$(bash_json 'git restore arquivo.txt')" 2
caso "restore --worktree" mergex/git-perigoso.sh "$(bash_json 'git restore --worktree arquivo.txt')" 2
caso "switch -c com suja"      comum/branch-limpa.sh "$(bash_json 'git switch -c nova')" 2
caso "checkout -- nao e troca" comum/branch-limpa.sh "$(bash_json 'git checkout -- arquivo.txt')" 0
caso "npm run switch"          comum/branch-limpa.sh "$(bash_json 'npm run switch')" 0
git checkout -q -- arquivo.txt

echo
echo "commit-por-task (modo aviso: nunca barra, so avisa)"
echo "mudanca a" >> src/a.ts; echo "mudanca b" >> src/b.ts
git add src/a.ts
caso "uma task concluida/verde" mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
git add src/b.ts
caso "duas tasks misturadas"    mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
echo "commit-por-task (modo bloqueio)"
mkdir -p .expx
# Formato do ecossistema: hooks.<nome>.modo
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"bloqueio"}}}' > .expx/hooks.json
caso "duas tasks, em bloqueio"  mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 2
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"desligado"}}}' > .expx/hooks.json
caso "desligado nao age"        mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
# Forma antiga, aceita para não quebrar arquivo já escrito à mão
echo '{"expx_hooks":1,"modos":{"commit-por-task":"bloqueio"}}' > .expx/hooks.json
caso "forma antiga (.modos)"    mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 2
# Arquivo ausente: valem os padrões; segurança nunca é rebaixada
rm -f .expx/hooks.json
caso "sem arquivo: metodo em aviso" mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
rm -f .expx/hooks.json

echo
echo "commit-por-task — arquivo de task irma (a quarta situacao do E1)"
# Duas tasks CONCLUIDAS, para que o que esta em jogo seja so o ownership: nem
# status, nem suite, nem mistura acidental de trabalho inacabado.
git reset -q
mkdir -p docs/sprintx/features/trab/sprint-07
cat > docs/sprintx/features/trab/sprint-07/tasks.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: trab
tasks:
  - id: T-07.01
    titulo: A task que esta fechando agora
    status: concluida
    arquivos:
      cria: [src/atual.ts]
      altera: []
    suite: verde
  - id: T-07.02
    titulo: A task irma, ja fechada antes
    status: concluida
    arquivos:
      cria: [src/irma.ts]
      altera: []
    suite: verde
---
YAML
echo "atual" > src/atual.ts; echo "irma" > src/irma.ts
git add -A && git commit -qm "plano com duas tasks concluidas"
echo "mudanca" >> src/atual.ts; echo "mudanca" >> src/irma.ts

# O rodape `Task:` e o que declara qual task esta fechando. O contrato do E1
# ja o exige em toda mensagem de commit de task.
MSG_ATUAL='git commit -m "feat(ui): a task atual

Task: T-07.01
Trabalho: trab"'

git add src/atual.ts
caso "so o arquivo da task atual"        mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 0
git add src/irma.ts
caso "atual + irma: falha fechada"       mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 2
git reset -q && git add src/irma.ts
caso "so o arquivo da irma: falha fechada" mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 2

# O ponto do C1: esta condicao falha FECHADA mesmo com o hook em aviso, que e
# o modo padrao. Deixa-la passar produziria o commit parcial enganoso da task.
mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"aviso"}}}' > .expx/hooks.json
caso "em aviso, ainda barra"             mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 2
# `desligado` continua desligando o hook inteiro: e a valvula de escape do time.
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"desligado"}}}' > .expx/hooks.json
caso "desligado desliga tambem esta"     mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 0
rm -f .expx/hooks.json

# A mensagem tambem chega por arquivo (`git commit -F`), que e como o E1 a
# escreve para preservar as quebras de linha do corpo.
printf 'feat(ui): a task atual\n\nTask: T-07.01\nTrabalho: trab\n' > .git/MENSAGEM
caso "mensagem por -F"                   mergex/commit-por-task.sh "$(bash_json 'git commit -F .git/MENSAGEM')" 2
rm -f .git/MENSAGEM

# Commit de método é uma classe própria: Trabalho + Metodo, sem Task. A
# gramática das três chaves de controle falha fechada mesmo com o hook em aviso.
git reset -q
mkdir -p docs/entregas/trab
printf 'metodo\n' > docs/entregas/trab/PR.md
git add docs/entregas/trab/PR.md
MSG_METODO='git commit -m "chore(mergex): persiste metodo pre-e2

Trabalho: trab
Metodo: pre-e2"'
caso "metodo valido nao e E1 invalido" mergex/commit-por-task.sh "$(bash_json "$MSG_METODO")" 0
caso "Task + Metodo e classe hibrida" mergex/commit-por-task.sh \
  "$(bash_json 'git commit -m "x

Task: T-07.01
Trabalho: trab
Metodo: pre-e2"')" 2
caso "Metodo duplicado e invalido" mergex/commit-por-task.sh \
  "$(bash_json 'git commit -m "x

Trabalho: trab
Metodo: pre-e2
Metodo: pre-e2"')" 2
caso "Trabalho duplicado em metodo e invalido" mergex/commit-por-task.sh \
  "$(bash_json 'git commit -m "x

Trabalho: trab
Trabalho: trab
Metodo: pre-e2"')" 2
caso "Metodo fora do enum e invalido" mergex/commit-por-task.sh \
  "$(bash_json 'git commit -m "x

Trabalho: trab
Metodo: outro"')" 2
git reset -q
rm -f docs/entregas/trab/PR.md
git add src/irma.ts

# Sem dono declarado, nada e inferido: vale o comportamento de sempre (aviso).
caso "sem rodape Task: nao infere dono"  mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
caso "dois rodapes Task: e invalido"      mergex/commit-por-task.sh \
  "$(bash_json 'git commit -m "x

Task: T-07.01
Task: T-07.02
Trabalho: trab"')" 2

# V9 nao muda: ela pergunta se o arquivo foi planejado NA FEATURE, pela uniao.
caso "V9 (uniao) aceita o arquivo da irma" mergex/arquivo-fora-do-plano.sh "$(bash_json "$MSG_ATUAL")" 0

# Replanejado: a task atual passa a declarar o arquivo, e o fechamento segue.
sed -i.bak 's#cria: \[src/atual.ts\]#cria: [src/atual.ts, src/irma.ts]#' docs/sprintx/features/trab/sprint-07/tasks.md
rm -f docs/sprintx/features/trab/sprint-07/tasks.md.bak
caso "replanejado: a atual declara, e passa" mergex/commit-por-task.sh "$(bash_json "$MSG_ATUAL")" 0

git reset -q
git checkout -q -- src/atual.ts src/irma.ts docs/sprintx/features/trab/sprint-07/tasks.md 2>/dev/null
rm -rf docs/sprintx/features/trab/sprint-07 src/atual.ts src/irma.ts
git add -A && git commit -qm "limpa o cenario da task irma"

echo
echo "arquivo-fora-do-plano"
git reset -q && git add src/a.ts
caso "arquivo declarado"        mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
mkdir -p src/fora && echo x > src/fora/surpresa.ts && git add -f src/fora/surpresa.ts
caso "arquivo nao declarado (aviso)" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
git reset -q

echo
echo "pr-so-com-portao"
caso "sem ENTREGA.md nao e assunto" mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin f')" 0
mkdir -p docs/entregas/t1
printf 'portao: pronto\n' > docs/entregas/t1/ENTREGA.md
caso "portao pronto libera"     mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin f')" 0
caso "pr create com pronto"     mergex/pr-so-com-portao.sh "$(bash_json 'gh pr create --fill')" 0
printf 'portao: bloqueado\n' > docs/entregas/t1/ENTREGA.md
echo '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"bloqueio"}}}' > .expx/hooks.json
caso "portao bloqueado barra"   mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin f')" 2
caso "build nao e push"         mergex/pr-so-com-portao.sh "$(bash_json 'npm run build')" 0
rm -f .expx/hooks.json

echo
echo "expx_raiz — raiz do repositorio, inclusive em worktree"
# A raiz ancora docs/entregas/ e docs/eventos/. Num `git worktree`, `.git` e
# ARQUIVO ("gitdir: ..."), nao diretorio: uma busca por [ -d ] sobe demais e
# devolve a raiz errada — o mesmo achado que a sprintx registrou na DS-106.
# shellcheck source=comum/base.sh
. "$H/comum/base.sh"
git -C "$RAIZ_T" worktree add -q -b wt-teste "$WT_T" main >/dev/null 2>&1
mkdir -p "$WT_T/sub" "$RAIZ_T/src/sub"

# Normaliza os dois lados: em Git Bash, `git rev-parse --show-toplevel` devolve
# caminho no estilo do sistema, e a comparacao crua daria falso negativo.
norm() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }
valor() {
  local desc="$1" obtido="$2" esperado="$3"
  if [ "$obtido" = "$esperado" ]; then
    OK=$((OK+1)); printf '  ok    %s\n' "$desc"
  else
    FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava %s, obteve %s)\n' "$desc" "$esperado" "$obtido"
  fi
}

valor "checkout normal"            "$(norm "$(expx_raiz "$RAIZ_T")")"         "$(norm "$RAIZ_T")"
valor "subdiretorio do checkout"   "$(norm "$(expx_raiz "$RAIZ_T/src/sub")")" "$(norm "$RAIZ_T")"
valor "worktree (.git arquivo)"    "$(norm "$(expx_raiz "$WT_T")")"           "$(norm "$WT_T")"
valor "subdiretorio do worktree"   "$(norm "$(expx_raiz "$WT_T/sub")")"       "$(norm "$WT_T")"
valor "fora de repositorio"        "$(norm "$(expx_raiz "$SEMGIT_T")")"       "$(norm "$SEMGIT_T")"

echo
echo "semantica de suite por task (sprintx: parcial na task, inteira ao fechar a sprint)"
mkdir -p docs/sprintx/features/exportacao-csv/sprint-01 docs/entregas/exportacao-csv
cat > docs/sprintx/features/exportacao-csv/sprint-01/tasks.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: exportacao-csv
tasks:
  - id: T-02.01
    titulo: Task fechada com o subconjunto afetado
    status: concluida
    arquivos:
      cria: [src/p.ts]
      altera: []
    suite: parcial
  - id: T-02.02
    titulo: Task fechada com suite vermelha
    status: concluida
    arquivos:
      cria: [src/v.ts]
      altera: []
    suite: vermelha
  - id: T-02.03
    titulo: Task fechada sem rodar teste
    status: concluida
    arquivos:
      cria: [src/n.ts]
      altera: []
    suite: nao_executada
---
YAML
# A branch ativa casa com exatamente uma ENTREGA: recência não escolhe trabalho.
rm -f docs/entregas/trab/ENTREGA.md
cat > docs/entregas/exportacao-csv/ENTREGA.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: entrega
trabalho_id: exportacao-csv
entregue_por: mergex
branch: main
branch_base: main
portao: null
---
YAML
touch src/p.ts src/v.ts src/n.ts
git add -A >/dev/null 2>&1 && git commit -qm "plano da segunda feature"

mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"bloqueio"},"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json

git reset -q; echo p >> src/p.ts; git add src/p.ts
caso "suite parcial e registro valido" mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 0
git reset -q; echo v >> src/v.ts; git add src/v.ts
caso "suite vermelha barra"            mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 2
git reset -q; echo n >> src/n.ts; git add src/n.ts
caso "suite nao_executada barra"       mergex/commit-por-task.sh "$(bash_json 'git commit -m x')" 2

echo
echo "artefato de metodo: o trabalho corrente sai da BRANCH, nunca da recencia"
# Este bloco historico usa repositorio proprio: nenhuma sujeira produzida pelos
# casos anteriores pode influenciar selecao de trabalho, E8 ou HISTORICO.
cd "$HIST_T" || exit 1
HOOK_CWD="$HIST_T"
git init -q -b main . 2>/dev/null || exit 1
git config user.email teste@expx.local
git config user.name Teste
mkdir -p docs/sprintx/features/ft-01 docs/sprintx/features/ft-02/sprint-01 docs/ft-legado src/fora
printf 'b\n' > docs/sprintx/features/ft-01/00-BLOQUEIOS.md
printf 'b\n' > docs/sprintx/features/ft-02/00-BLOQUEIOS.md
printf 'b\n' > docs/ft-legado/00-BLOQUEIOS.md
printf 'base\n' > src/base.ts
cat > docs/sprintx/features/ft-02/sprint-01/tasks.md <<'YAML'
---
expx_schema: 1
expx_tool: sprintx
kind: plano
trabalho_id: ft-02
tasks:
  - id: T-01.01
    status: concluida
    arquivos:
      cria: [src/base.ts]
      altera: []
    suite: verde
---
YAML
git add -A >/dev/null 2>&1 && git commit -qm "base da fixture historica" || exit 1
# Numa arvore integrada (varias features ja entregues no mesmo checkout),
# docs/entregas/ tem uma pasta por trabalho. Qual delas e o trabalho de AGORA
# nao se decide por mtime: decide-se pela branch ativa casada com o `branch:`
# do frontmatter de EXATAMENTE UM ENTREGA.md. Zero, dois ou mais, ou HEAD
# destacado: nenhuma isencao (conservador).
entrega() { # entrega <trabalho_id> <branch>
  mkdir -p "docs/entregas/$1"
  printf -- '---\nexpx_schema: 1\nexpx_tool: sprintx\nkind: entrega\ntrabalho_id: %s\nentregue_por: mergex\nbranch: %s\nbranch_base: main\n---\n\n# Entrega\n' \
    "$1" "$2" > "docs/entregas/$1/ENTREGA.md"
}

# Os artefatos usados depois de varias trocas ja nascem tracked em todas as
# branches da fixture. Assim, switch nenhum depende de sujeira residual.
entrega ft-01 feature/ft-01
entrega ft-02 feature/ft-02
entrega ft-legado feature/ft-legado
git add docs/entregas >/dev/null 2>&1 && git commit -qm "entregas da fixture historica" || exit 1

fixture_switch_exato feature/ft-02 -c feature/ft-02 || exit 1
mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json

# A — uma ENTREGA, declarando a branch atual
entrega ft-02 feature/ft-02
git reset -q; printf 'novo\n' >> docs/sprintx/features/ft-02/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-02/00-BLOQUEIOS.md
caso "A: ENTREGA da branch atual isenta a pasta dela" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0

# B — FT-01 passa a ser a ENTREGA mais recente; a branch atual continua sendo FT-02
entrega ft-01 feature/ft-01
caso "B: ENTREGA mais recente nao rouba o trabalho atual" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0

# C — a pasta da ENTREGA mais recente NAO e isenta: recencia nao decide nada
git reset -q; printf 'novo\n' >> docs/sprintx/features/ft-01/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-01/00-BLOQUEIOS.md
caso "C: pasta da ENTREGA mais recente nao e isenta" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2

# D — duas ENTREGA declarando a MESMA branch atual: ambiguo
entrega ft-03 feature/ft-02
git reset -q; printf 'novo\n' >> docs/sprintx/features/ft-02/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-02/00-BLOQUEIOS.md
caso "D: duas ENTREGA na mesma branch => sem isencao" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
rm -rf docs/entregas/ft-03

# E — nenhuma ENTREGA declara a branch atual
fixture_restaurar_tracked docs/sprintx/features/ft-01/00-BLOQUEIOS.md docs/sprintx/features/ft-02/00-BLOQUEIOS.md || exit 1
fixture_switch_exato feature/sem-entrega -c feature/sem-entrega || exit 1
printf 'novo\n' >> docs/sprintx/features/ft-02/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-02/00-BLOQUEIOS.md
caso "E: nenhuma ENTREGA para a branch => sem isencao" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2

# F — HEAD destacado: nao ha branch para casar
fixture_restaurar_tracked docs/sprintx/features/ft-02/00-BLOQUEIOS.md || exit 1
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
git checkout -q --detach || exit 1
printf 'novo\n' >> docs/sprintx/features/ft-02/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-02/00-BLOQUEIOS.md
caso "F: detached HEAD => sem isencao" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
fixture_restaurar_tracked docs/sprintx/features/ft-02/00-BLOQUEIOS.md || exit 1
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1

# I — pasta legada do trabalho certo, quando nao existe a canonica
entrega ft-legado feature/ft-legado
fixture_switch_exato feature/ft-legado -c feature/ft-legado || exit 1
git reset -q; printf 'novo\n' >> docs/ft-legado/00-BLOQUEIOS.md
git add -f docs/ft-legado/00-BLOQUEIOS.md
caso "I: pasta legada do trabalho certo e isenta" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0

# G — pasta de OUTRO trabalho continua sendo desvio
git reset -q; printf 'novo\n' >> docs/sprintx/features/ft-01/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-01/00-BLOQUEIOS.md
caso "G: pasta de outro trabalho e desvio" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2

# H — arquivo de produto fora do plano continua sendo desvio
fixture_restaurar_tracked docs/ft-legado/00-BLOQUEIOS.md docs/sprintx/features/ft-01/00-BLOQUEIOS.md || exit 1
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
printf 'produto nao planejado\n' > src/fora/surpresa2.ts
git add -f src/fora/surpresa2.ts
caso "H: produto fora do plano e desvio" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2

git reset -q; rm -f src/fora/surpresa2.ts .expx/hooks.json
fixture_switch_exato main main || exit 1

echo
echo "runx — a estrutura da runx nao regride"
# Mesma regra de trabalho corrente, outro formato de caminho: a pasta da
# ocorrencia em curso e isenta; a de outro trabalho continua sendo desvio.
mkdir -p docs/manutencao/OC-2026-0001-erro
printf 'b\n' > docs/manutencao/OC-2026-0001-erro/BLOQUEIOS.md
git add -A >/dev/null 2>&1 && git commit -qm "ocorrencia da runx"
fixture_switch_exato fix/OC-2026-0001-erro -c fix/OC-2026-0001-erro || exit 1
mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json
entrega OC-2026-0001-erro fix/OC-2026-0001-erro
git reset -q; printf 'novo\n' >> docs/manutencao/OC-2026-0001-erro/BLOQUEIOS.md
git add -f docs/manutencao/OC-2026-0001-erro/BLOQUEIOS.md
caso "runx: pasta da ocorrencia corrente e isenta" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
git reset -q; printf 'novo\n' >> docs/sprintx/features/ft-01/00-BLOQUEIOS.md
git add -f docs/sprintx/features/ft-01/00-BLOQUEIOS.md
caso "runx: pasta de outro trabalho e desvio"     mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
# A isencao do HISTORICO e da sprintx: a runx nao a herda.
git reset -q; mkdir -p docs/sprintx/estimativas; printf 'h\n' >> docs/sprintx/estimativas/HISTORICO.md
git add -f docs/sprintx/estimativas/HISTORICO.md
caso "runx NAO ganha a isencao do HISTORICO"      mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
fixture_restaurar_tracked docs/manutencao/OC-2026-0001-erro/BLOQUEIOS.md docs/sprintx/features/ft-01/00-BLOQUEIOS.md || exit 1
rm -f .expx/hooks.json
fixture_switch_exato main main || exit 1

echo
echo "E8 — fechamento final (o registro da entrega vai para o historico)"
# O E8 fecha commitando o ENTREGA.md final: sem isso, a branch integrada leva um
# registro defasado e o estado final morre com o worktree. Os hooks precisam
# deixar esse commit passar, SEM afrouxar nada do resto.
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json

# 1 — so o artefato final da entrega deste trabalho
git reset -q
printf 'estado: entregue\n' >> docs/entregas/ft-02/ENTREGA.md
git add -f docs/entregas/ft-02/ENTREGA.md
caso "fechamento final: ENTREGA.md deste trabalho entra" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0

# 2 — produto fora do plano NAO pega carona no fechamento
printf 'produto nao planejado\n' > src/fora/surpresa3.ts
git add -f src/fora/surpresa3.ts
caso "fechamento final nao carrega produto fora do plano" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
git reset -q; rm -f src/fora/surpresa3.ts

# 2b — fechamento BLOQUEADO: o registro do bloqueio tambem precisa ser persistido
git reset -q
printf 'portao: bloqueado\nestado: bloqueado\n' >> docs/entregas/ft-02/ENTREGA.md
git add -f docs/entregas/ft-02/ENTREGA.md
caso "fechamento bloqueado: registro do bloqueio entra" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
git reset -q; git checkout -q -- docs/entregas/ft-02/ENTREGA.md 2>/dev/null

# 2c — HISTORICO global da sprintx: excecao EXATA, so na origem sprintx
git reset -q
mkdir -p docs/sprintx/estimativas
printf 'historico\n' >> docs/sprintx/estimativas/HISTORICO.md
git add -f docs/sprintx/estimativas/HISTORICO.md
caso "HISTORICO global da sprintx nao e desvio" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
git reset -q
printf 'outro\n' > docs/sprintx/estimativas/CALIBRAGEM.md
git add -f docs/sprintx/estimativas/CALIBRAGEM.md
caso "outro arquivo em estimativas/ NAO e isento" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 2
git reset -q; rm -f docs/sprintx/estimativas/CALIBRAGEM.md

# 3 — a varredura de segredo vale igual no artefato de metodo
caso "fechamento final: segredo no artefato barra" comum/sem-segredo.sh "$(write_json "token: \"$SK\"")" 2

# 4 — publicar o fechamento e push: o portao continua mandando
printf 'portao: pronto\n' >> docs/entregas/ft-02/ENTREGA.md
caso "publicacao do fechamento com portao pronto" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02')" 0
printf 'portao: bloqueado\n' > docs/entregas/ft-02/ENTREGA.md
echo '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"bloqueio"}}}' > .expx/hooks.json
caso "publicacao do fechamento com portao bloqueado barra" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02')" 2

# 5 — forcar a publicacao do fechamento continua proibido
caso "fechamento final: push --force barra"            mergex/git-perigoso.sh "$(bash_json 'git push --force origin feature/ft-02')" 2
caso "fechamento final: push --force-with-lease barra" mergex/git-perigoso.sh "$(bash_json 'git push --force-with-lease origin feature/ft-02')" 2

git reset -q; rm -f .expx/hooks.json
git restore --worktree -- docs/entregas/ft-02/ENTREGA.md 2>/dev/null || true
fixture_switch_exato main main || exit 1

cd "$RAIZ_T" || exit 1
HOOK_CWD="$RAIZ_T"

echo
echo "plano task-based ausente/ilegivel — ownership manual falha fechado"
git add -A && git commit -qm "isola cenario de plano invalido"
fixture_switch_exato hook-plano-invalido -c hook-plano-invalido || exit 1
sed -i.bak 's/^branch: .*/branch: hook-plano-invalido/' docs/entregas/exportacao-csv/ENTREGA.md
rm -f docs/entregas/exportacao-csv/ENTREGA.md.bak
MSG_PLANO_INVALIDO='git commit -m "fix(csv): fecha task

Task: T-02.01
Trabalho: exportacao-csv"'
printf 'lixo \x00 nao-yaml' > docs/sprintx/features/exportacao-csv/sprint-01/tasks.md
printf 'mudanca para ownership\n' >> src/a.ts
git add src/a.ts
caso "tasks.md corrompido barra ownership" mergex/commit-por-task.sh "$(bash_json "$MSG_PLANO_INVALIDO")" 2
caso "tasks.md corrompido (escopo)" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m x')" 0
rm -f docs/sprintx/features/exportacao-csv/sprint-01/tasks.md
caso "tasks.md ausente barra ownership" mergex/commit-por-task.sh "$(bash_json "$MSG_PLANO_INVALIDO")" 2

echo
echo "---------------------------------------------"
printf '%d ok, %d falha(s), %d pulado(s)\n' "$OK" "$FALHOU" "$PULADOS"
[ "$PULADOS" = "0" ] || printf 'ATENCAO: %d caso(s) nao foram verificados nesta maquina.\n' "$PULADOS"
[ "$FALHOU" = "0" ]
