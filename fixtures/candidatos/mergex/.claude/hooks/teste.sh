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
OK=0; FALHOU=0; PULADOS=0; NAOEXEC=0

# Git Bash (MSYS/MINGW) no Windows:
#  - o MSYS converte para caminho do Windows todo argumento que parece caminho
#    Unix quando chama um .exe (o jq): `/usr/bin/git push` virava
#    `C:/Program Files/Git/usr/bin/git push`, e os casos "git por caminho" davam
#    falso negativo no hook. Por isso o comando vai ao jq por STDIN (bash_json,
#    write_json), nunca por argumento. Desligar a conversao no processo inteiro
#    (MSYS_NO_PATHCONV) quebraria o resto: o git.exe deixaria de receber os
#    caminhos convertidos;
#  - o bash do MSYS e ordens de grandeza mais lento que o do Linux em entrada
#    multibyte grande (150 KB de 日 levou 30 s contra 2 s no Linux), entao os
#    limites de tempo escalam (LIMITE_MS) e os casos de >= 150 KB multibyte nao
#    rodam la: viram NAO_EXECUTADO, listados a parte, nunca ok.
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) EH_WINDOWS=1; LIMITE_MS="${LIMITE_MS:-10000}" ;;
  *) EH_WINDOWS=0; LIMITE_MS="${LIMITE_MS:-2000}" ;;
esac
# O texto do limite sai do limite em uso: com "menos de 2 s" fixo, uma execucao de
# 9 s no Git Bash (limite 10 s) passava afirmando uma regra que nao foi conferida.
# Limite que nao e segundo inteiro vai em ms (2500 nao vira "2 s", mais estrito).
case "$LIMITE_MS" in ''|*[!0-9]*) printf 'LIMITE_MS invalido: %s\n' "$LIMITE_MS" >&2; exit 1 ;; esac
LIMITE_MS=$((10#$LIMITE_MS))   # base 10 explicita: 0800 e 800 ms, nao octal invalido
if [ $((LIMITE_MS % 1000)) = 0 ]; then LIMITE_TXT="$((LIMITE_MS / 1000)) s"; else LIMITE_TXT="$LIMITE_MS ms"; fi
# Tempo em milissegundos, nao em $SECONDS: o $SECONDS conta viradas de segundo, e
# uma execucao de 1,1 s que atravessa duas viradas mede 2 e reprova o "menos de 2 s".
# Fontes, da mais barata: $EPOCHREALTIME (bash 5), `date +%N` (GNU), perl
# (presente no macOS, cujo date nao tem %N); so sem nenhuma, o $SECONDS de antes.
agora_ms() {
  local t
  if [ -n "${EPOCHREALTIME:-}" ]; then t="${EPOCHREALTIME/[.,]/}"; echo $((10#$t / 1000)); return; fi
  t="$(date +%s%N 2>/dev/null)"
  case "$t" in ''|*[!0-9]*) ;; *) echo $((t / 1000000)); return ;; esac
  t="$(perl -MTime::HiRes=time -e 'printf "%d", time * 1000' 2>/dev/null)"
  case "$t" in ''|*[!0-9]*) echo $((SECONDS * 1000)) ;; *) echo "$t" ;; esac
}
# Caso que depende de um ambiente ausente (Git for Windows sobre
# \\wsl.localhost): NAO_EXECUTADO, listado a parte, nunca conta como ok.
nao_executado() { NAOEXEC=$((NAOEXEC+1)); printf '  NAO_EXECUTADO: %s\n' "$1"; }

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
WTH_T="${HIST_T}--wt"       # worktree vinculada do repositorio historico
WTM_T="${HIST_T}--main"     # worktree da main do repositorio historico
WTB_T="${HIST_T}--base"     # worktree sem docs/entregas no HEAD
WTX_T="${HIST_T}--outra"    # worktree com o HEAD noutra branch
SEMX_T="$(mktemp -d)"       # repositorio sem MergeX
INT_T="$(mktemp -d)"        # repositorio do merge de integracao da base
BINSW_T="$(mktemp -d)"      # PATH sem `wc` (rodada extra 2 da revisao, N6)
trap 'rm -rf "$RAIZ_T" "$WT_T" "$SEMGIT_T" "$HIST_T" "$WTH_T" "$WTM_T" "$WTB_T" "$WTX_T" "$SEMX_T" "$INT_T" "$BINSW_T"' EXIT
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

# fm_chave <arquivo> <chave> <valor> — grava a chave no frontmatter do arquivo
# no disco (troca a linha existente ou acrescenta antes do `---` que fecha).
# fm_sem_chave <arquivo> <chave> — tira a chave do frontmatter.
fm_chave() {
  awk -v k="$2" -v v="$3" '
    NR == 1 { print; fm = 1; next }
    fm && /^---/ { if (!feito) print k ": " v; fm = 0; print; next }
    fm && index($0, k ":") == 1 { print k ": " v; feito = 1; next }
    { print }' "$1" > "$1.fm" && cat "$1.fm" > "$1" && rm -f "$1.fm"
}
fm_sem_chave() {
  awk -v k="$2" '
    NR == 1 { print; fm = 1; next }
    fm && /^---/ { fm = 0; print; next }
    fm && index($0, k ":") == 1 { next }
    { print }' "$1" > "$1.fm" && cat "$1.fm" > "$1" && rm -f "$1.fm"
}

bash_json() { printf '%s' "$1" | jq -cRs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}'; }
write_json() { printf '%s' "$1" | jq -cRs --arg w "$HOOK_CWD" '{tool_name:"Write",cwd:$w,tool_input:{content:.}}'; }
# Comando grande: vai por stdin do jq (`--arg` nao aceita argumento acima de 128 KB).
json_grande() { printf '%s' "$1" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}'; }
# Linhas de enchimento para os casos de SIGPIPE sob pipefail (rodada extra da
# revisao): mais que o buffer do pipe (64 KB) e bem mais.
LINHAS70="$(yes 'echo xxxxxxxx' | head -n 5600)"      # ~73 KB
LINHAS200="$(yes 'echo xxxxxxxx' | head -n 16000)"    # ~208 KB

echo
echo "sem-segredo — tem que BARRAR"
# As amostras abaixo são montadas em pedaços, de propósito: escritas inteiras
# no arquivo, elas fariam o próprio sem-segredo barrar o commit deste teste —
# o que é o hook funcionando, mas deixaria a suíte impossível de versionar.
# Nenhum valor aqui é real; todos são sintéticos e montados em tempo de teste.
SK="sk-$(printf 'abcdef1234567890QRS')"
FGH="github_pat_$(printf 'A%.0s' {1..40})"
GKEY="AIza$(printf 'A%.0s' {1..35})"
PK="$(printf -- '-----BEGIN RSA %s KEY-----' 'PRIVATE')"
SENHA="$(printf 'pass%s = %sTr0ub4dorZ3x%s' 'word' "'" "'")"
CPF="$(printf 'cliente 123.%s-01' '456.789')"
URL="$(printf 'postgres://u:%s@db/x' 's3nh4sintetica')"

caso "chave sk-"          comum/sem-segredo.sh "$(write_json "const k=\"$SK\"")" 2
caso "chave privada"      comum/sem-segredo.sh "$(write_json "$PK")" 2
caso "senha atribuida"    comum/sem-segredo.sh "$(write_json "$SENHA")" 2
caso "CPF sintetico"      comum/sem-segredo.sh "$(write_json "$CPF")" 2
caso "URL com credencial" comum/sem-segredo.sh "$(write_json "$URL")" 2
# Placeholder no usuario nao dispensa a senha real da URL (conselhos#210, P5).
caso "URL com usuario \${...} e senha real: barra" comum/sem-segredo.sh "$(write_json "$(printf 'postgres://${DB_USER}:%s@db/x' 's3nh4sintetica')")" 2
caso "URL com senha \${...}: passa"                comum/sem-segredo.sh "$(write_json 'postgres://u:${DB_PASS}@db/x')" 0
# So o valor inteiro `${...}`, `{{...}}` ou `<...>` e placeholder; um `${` no meio de uma
# senha real nao dispensa o resto (CodeAnt no mergex#54).
caso "URL com senha real contendo \${...}: barra"  comum/sem-segredo.sh "$(write_json "$(printf 'postgres://u:%s@db/x' 's3nh4${X}sintetica')")" 2
caso "URL com senha <...>: passa"                  comum/sem-segredo.sh "$(write_json 'postgres://u:<senha>@db/x')" 0
# Na senha da URL, so o valor inteiro e placeholder: o corte no primeiro `:`/`=` deixava
# `S:placeholder` e `S=placeholder` passarem (A1 e A5 do CodeAnt no conselhos#211).
caso "URL com senha S:placeholder barra"   comum/sem-segredo.sh "$(write_json "$(printf 'postgres://u:%s@db/x' 's3nh4sintetica:placeholder')")" 2
caso "URL com senha S=placeholder barra"   comum/sem-segredo.sh "$(write_json "$(printf 'postgres://u:%s@db/x' 's3nh4sintetica=placeholder')")" 2
caso "URL com senha changeme inteira: passa" comum/sem-segredo.sh "$(write_json 'postgres://u:changeme@db/x')" 0
# Com `@` cru na senha, o parser de URL fica com o ultimo `@`; o casamento parava no
# primeiro e julgava so `changeme` (CodeAnt no mergex#57).
caso "URL com senha changeme@S barra"      comum/sem-segredo.sh "$(write_json "$(printf 'postgres://u:%s@db/x' 'changeme@s3nh4sintetica')")" 2
caso "URL com usuario e senha <...> e @ no caminho: passa" comum/sem-segredo.sh "$(write_json 'postgres://u:<senha>@db/x?dono=a@b')" 0
# A senha com simbolo tambem e credencial (conselhos#210, P8).
caso "senha comecando com ! barra"       comum/sem-segredo.sh "$(write_json "$(printf 'password: !Abc%s' 'defg123')")" 2
caso "token com @ barra"                 comum/sem-segredo.sh "$(write_json "$(printf 'token=@bcd%s' '1234efgh')")" 2
caso "secret com \$ e ! barra"          comum/sem-segredo.sh "$(write_json "$(printf 'sec%s: p4$$w0%s' 'ret' 'rd!xyz')")" 2
# ...sem abrir falso positivo em referencia (P8): variavel de shell, formatacao, mascara e tag YAML curta.
caso "password=\$VAR passa"            comum/sem-segredo.sh "$(write_json 'password=$DB_PASSWORD')" 0
caso "password: \"%(senha)s\" passa"   comum/sem-segredo.sh "$(write_json 'password: "%(senha)s"')" 0
caso "password: ******** passa"          comum/sem-segredo.sh "$(write_json 'password: ********')" 0
# A palavra reservada vale para o valor, nao so para a ocorrencia com a chave (login#30).
caso "token: \"placeholder\" passa"      comum/sem-segredo.sh "$(write_json 'token: "placeholder"')" 0
caso "password: 'changeme' passa"        comum/sem-segredo.sh "$(write_json "password: 'changeme'")" 0
caso "placeholder colado em valor real barra" comum/sem-segredo.sh "$(write_json "token: \"placeholder-$(printf 'abcd1234efgh')\"")" 2
caso "senha: !Ref Segredo passa"         comum/sem-segredo.sh "$(write_json 'senha: !Ref Segredo')" 0
# A tabela vive em skills/mergex/scripts/segredo-tabela.sh (DM-279): sem ela, o hook de
# seguranca barra (falha fechada), mesmo com conteudo limpo.
SEMTAB_T="$(mktemp -d)"; mkdir -p "$SEMTAB_T/.claude/hooks/comum"
cp "$H/comum/sem-segredo.sh" "$H/comum/base.sh" "$SEMTAB_T/.claude/hooks/comum/"
printf '%s' "$(write_json 'texto limpo')" | bash "$SEMTAB_T/.claude/hooks/comum/sem-segredo.sh" >/dev/null 2>&1; rc_semtab=$?
if [ "$rc_semtab" = 2 ]; then OK=$((OK+1)); printf '  ok    %s\n' "sem a tabela de segredo: barra"
else FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava 2, obteve %s)\n' "sem a tabela de segredo: barra" "$rc_semtab"; fi
rm -rf "$SEMTAB_T"
echo "sem-segredo — tem que PASSAR"
caso "variavel de ambiente" comum/sem-segredo.sh "$(write_json 'const k = process.env.API_KEY')" 0
caso "placeholder <>"       comum/sem-segredo.sh "$(write_json 'password: <coloque-a-senha>')" 0
caso "marcador de template" comum/sem-segredo.sh "$(write_json 'token: {{seu_token}}')" 0
caso "variavel de shell"    comum/sem-segredo.sh "$(write_json 'SECRET=${MINHA_VAR}')" 0
caso "prosa sobre senha"    comum/sem-segredo.sh "$(write_json 'O campo senha e validado no login')" 0
# Falsos positivos da 0.12.3, ao commitar o proprio update (relato do Login): placeholder feito
# de duas palavras reservadas, e chamada de funcao no lugar do valor.
caso "placeholder composto passa"         comum/sem-segredo.sh "$(write_json 'exemplo=sk-example-placeholder')" 0
caso "chamada de funcao nao e credencial" comum/sem-segredo.sh "$(write_json 'const dono = { pid: 1, token: randomUUID(), em: 0 }')" 0
# ...mas valor com digito seguido de `(` continua credencial (CodeAnt no #53); o falso positivo
# de uma funcao com digito e assumido, e valor sem digito seguido de `(` e o limite declarado.
caso "literal com digito seguido de ( barra" comum/sem-segredo.sh "$(write_json "token: $(printf 'abcd1234efgh5678')(x)")" 2
# Referencia de codigo nao e credencial (DM-283): sem aspas, so identificador ou cadeia a.b
# sem digito, seguida de `,` `;` `)` ou `}`. As amostras saem de printf: a chave montada em
# pedacos deixa este arquivo fora da propria regra.
for t in ',' ';' ')' '}'; do
  for v in hashedPassword dados.senha process.env.DB_PASS SENHA_PADRAO; do
    caso "referencia $v seguida de $t passa" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: %s%s' word "$v" "$t")")" 0
  done
done
caso "referencia no fim da linha barra"      comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: hashedPassword' word)")" 2
caso "referencia seguida de ] barra"         comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: hashedPassword]' word)")" 2
caso "valor entre aspas com virgula barra"   comum/sem-segredo.sh "$(write_json "$(printf "sen%s: 'hashedPassword'," ha)")" 2
caso "valor com digito e virgula barra"      comum/sem-segredo.sh "$(write_json "$(printf 'tok%s: abcdefg1,' en)")" 2
caso "valor com simbolo e virgula barra"     comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: Abcdefg!,' word)")" 2
# Valor entre aspas com virgula ou outro simbolo fora do alfabeto (katosmv/login#34): a virgula
# cortava o valor abaixo de oito caracteres, e a senha passava. Entre aspas, o valor vai ate a
# aspa de fechamento; espaco continua fora (prosa entre aspas nao e senha).
caso "senha entre aspas com virgula barra"   comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: "abc,defgh"' word)")" 2
caso "senha entre aspas simples com ; e : barra" comum/sem-segredo.sh "$(write_json "$(printf "sen%s = 'a,b;c:d=e'" ha)")" 2
caso "placeholder <...> entre aspas com virgula passa" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: "<senha,nova>"' word)")" 0
caso "prosa entre aspas com espaco passa"    comum/sem-segredo.sh "$(write_json "$(printf 'sen%s: "nao use a mesma senha"' ha)")" 0
# Revisao do Codex: aspa que nao fecha, aspas tipograficas, chave entre aspas (JSON) e o literal
# entre aspas seguido de `(`, que nao e chamada de funcao.
caso "senha entre aspas que nao fecham barra"  comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: "abc,defgh' word)")" 2
caso "senha entre aspas tipograficas barra"    comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: \xe2\x80\x9cabc,defgh\xe2\x80\x9d' word)")" 2
caso "aspa tipografica aberta e nao fechada barra" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: \xe2\x80\x9cabc,defgh' word)")" 2
caso "chave entre aspas tipograficas barra"   comum/sem-segredo.sh "$(write_json "$(printf '\xe2\x80\x9cpass%s\xe2\x80\x9d: "abc,defgh"' word)")" 2
caso "aspas simples tipograficas barra"       comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: \xe2\x80\x98abc,defgh\xe2\x80\x99' word)")" 2
caso "placeholder entre aspas tipograficas passa" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: \xe2\x80\x9cchangeme\xe2\x80\x9d' word)")" 0
caso "chave JSON entre aspas barra"            comum/sem-segredo.sh "$(write_json "$(printf '{"pass%s": "abc,defgh"}' word)")" 2
caso "substituicao de comando passa"         comum/sem-segredo.sh "$(write_json "$(printf 'SEN%s="$(cat /run/secrets/x)"' HA)")" 0
# ...mas so quando ela e o valor inteiro: senha colada depois da substituicao barra (CodeAnt no mergex#56).
caso "senha depois de substituicao de comando barra" comum/sem-segredo.sh "$(write_json "$(printf 'SEN%s="$(cat/x)S3nh4Real9"' HA)")" 2
caso "senha depois de crase barra"           comum/sem-segredo.sh "$(write_json "$(printf 'SEN%s="`cat/x`S3nh4Real9"' HA)")" 2
caso "substituicao por crase passa"          comum/sem-segredo.sh "$(write_json "$(printf 'SEN%s="`cat /run/secrets/x`"' HA)")" 0
caso "chave JSON com placeholder passa"        comum/sem-segredo.sh "$(write_json "$(printf '{"pass%s": "<senha>"}' word)")" 0
caso "literal entre aspas seguido de ( barra"  comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: "abc,defgh"(x)' word)")" 2
# A mascara mostra os quatro ultimos caracteres do VALOR, sem a aspa de fechamento.
MASC_T="$(printf 'pass%s: "abc,defgh"' word)"
MASC="$(bash -c '. "$1"; ALVO="$2"; segredo_varrer; printf "%s" "$ACHADOS"' _ "$H/../skills/mergex/scripts/segredo-tabela.sh" "$MASC_T")"
case "$MASC" in *'…efgh '*) OK=$((OK+1)); printf '  ok    %s\n' "mascara sem a aspa final" ;;
  *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (%s)\n' "mascara sem a aspa final" "$MASC" ;; esac
# Um achado por credencial: a forma entre aspas e a sem aspas nao contam duas vezes.
UMA_T="$(printf 'pass%s: "abcdefgh123"' word)"
UMA_N="$(bash -c '. "$1"; ALVO="$2"; segredo_varrer; printf "%s" "$ACHADOS" | grep -c "credencial"' _ "$H/../skills/mergex/scripts/segredo-tabela.sh" "$UMA_T")"
if [ "$UMA_N" = 1 ]; then OK=$((OK+1)); printf '  ok    %s\n' "senha entre aspas: um achado so"
else FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava 1, obteve %s)\n' "senha entre aspas: um achado so" "$UMA_N"; fi
caso "a segunda ocorrencia no fim da linha barra" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: hashedPassword; pass%s: hashedPassword' word word)")" 2
FUNC2="getToken$(printf '2')"   # montada aqui: escrita no caso, o proprio teste.sh barraria no commit
caso "funcao com digito barra (assumido)"   comum/sem-segredo.sh "$(write_json "token: $FUNC2()")" 2
caso "valor sem digito seguido de ( passa (limite)" comum/sem-segredo.sh "$(write_json 'token: abcdefghijkl()')" 0
B64="$(printf 'YWJjMTIzNDU2Nzg5MA')=="   # base64 com padding: o `=` do valor nao e o da atribuicao
caso "base64 com = seguido de ( barra"     comum/sem-segredo.sh "$(write_json "token: $B64()")" 2
caso "token literal sem aspas barra"      comum/sem-segredo.sh "$(write_json "TOKEN=$(printf 'abcd1234efgh5678')")" 2
# `:` no valor sem aspa: o casamento parava nele, e `password=ab:S` passava (A2 do CodeAnt
# no conselhos#211). Uma URL como valor passa a ser acusada: falso positivo assumido.
caso "senha com : depois de dois caracteres barra" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s=ab:%s' word 's3nh4sintetica')")" 2
caso "valor com : seguido de ( barra"     comum/sem-segredo.sh "$(write_json "$(printf 'token: ab:%s()' 's3nh4sintetica9')")" 2
caso "chamada com S:placeholder( barra"   comum/sem-segredo.sh "$(write_json "$(printf 'token=%s:placeholder(' 's3nh4sintetica9')")" 2
caso "token apontando para URL barra (assumido)" comum/sem-segredo.sh "$(write_json "$(printf 'token=%s' 'https://host.example/x')")" 2
caso "caminho Token::Identificador passa"  comum/sem-segredo.sh "$(write_json 'let k = Token::Identificador;')" 0
# `A::B` numa atribuicao nao e referencia de codigo: e indistinguivel de uma senha com `::`
# (DM-285). A atribuicao Rust/C++/PHP barra, falso positivo assumido.
caso "senha com :: seguida de , barra"      comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: Segredo::Producao,' word)")" 2
caso "atribuicao Rust com A::B e virgula barra (assumido)" comum/sem-segredo.sh "$(write_json "$(printf 'tok%s: Token::Identificador,' en)")" 2
caso "atribuicao C++ com A::B e ponto e virgula barra (assumido)" comum/sem-segredo.sh "$(write_json "$(printf 'tok%s = Token::Identificador;' en)")" 2
# Senha que comeca com `:` depois de `=`, ou de `:` com espaco, tambem e credencial; colado
# na chave (`Token::Nome`) continua caminho (DM-285, terceira revisao do Codex).
caso "senha comecando com : depois de = barra"       comum/sem-segredo.sh "$(write_json "$(printf 'pass%s=:%s,' word 's3nh4sintetica')")" 2
caso "senha comecando com :: depois de : e espaco barra" comum/sem-segredo.sh "$(write_json "$(printf 'pass%s: ::%s,' word 'ProducaoMais')")" 2
caso "chave colada em :: continua caminho: passa"    comum/sem-segredo.sh "$(write_json "$(printf 'x = Tok%s::ProducaoMais;' en)")" 0
# Falsos positivos assumidos com o `:` no valor (DM-285): chave Redis, exemplo YAML, hora.
caso "chave Redis secret:key:... barra (assumido)" comum/sem-segredo.sh "$(write_json "$(printf 'sec%s:key:redis-cache' ret)")" 2
caso "exemplo YAML com : no valor barra (assumido)" comum/sem-segredo.sh "$(write_json "$(printf 'api_%s: abc:1234' key)")" 2
caso "hora como valor da senha barra (assumido)"   comum/sem-segredo.sh "$(write_json "$(printf 'pass%s=12:34:56' word)")" 2
caso "palavra reservada colada em valor real barra" comum/sem-segredo.sh "$(write_json "k=sk-example-$(printf 'abcdef1234567890')")" 2
caso "comando comum"        comum/sem-segredo.sh "$(bash_json 'npm test')" 0
# SIGPIPE sob pipefail (rodada extra da revisao): a saida antecipada
# `printf | grep -q … || exit 0` devolvia 141 quando o grep casava na 1a linha e
# o comando passava do buffer do pipe — `git commit -m x` seguido de 70 KB de
# linhas pulava a varredura, e a chave em preparacao passava. O criterio nao
# muda; so o encanamento. A chave e sintetica e montada em pedacos (acima).
printf '%s\n' "$PK" > segredo.pem && git add segredo.pem
caso "commit com chave privada em preparacao: barra"              comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
caso "commit + 70 KB de linhas: a varredura continua, barra"      comum/sem-segredo.sh "$(json_grande "git commit -m x"$'\n'"$LINHAS70")" 2
caso "commit + 200 KB de linhas: barra"                           comum/sem-segredo.sh "$(json_grande "git commit -m x"$'\n'"$LINHAS200")" 2
caso "comando legitimo + 200 KB de linhas: passa"                 comum/sem-segredo.sh "$(json_grande "npm test"$'\n'"$LINHAS200")" 0
git rm -q --cached segredo.pem && rm -f segredo.pem
# So o que ENTRA no historico e varrido: a linha adicionada e a mensagem. A linha removida
# (tirar um segredo) e o contexto do diff nao sao conteudo novo, e barrar a remocao impediria
# a remediacao. Repositorio proprio, para nao mexer no HEAD dos outros casos.
SEG_T="$(mktemp -d)"
git -C "$SEG_T" init -q -b feature/seg
seg_git() { git -C "$SEG_T" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
printf 'antes\n%s\ndepois\n' "$PK" > "$SEG_T/chave.pem"; seg_git add chave.pem; seg_git commit -q -m base
HOOK_CWD_ANTES="$HOOK_CWD"; HOOK_CWD="$SEG_T"
printf 'antes\n%s\ndepois\nmais uma linha\n' "$PK" > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "segredo so no contexto do diff: passa"     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
printf 'antes\ndepois\n' > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "remover o segredo: passa"                  comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
printf 'antes\n%s\ndepois\n' "$SK" > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "trocar por outro segredo: barra"           comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
printf 'antes\n++ %s\ndepois\n' "$SK" > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "linha adicionada que comeca com ++: barra" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
seg_git reset -q --hard
# `-a`, `-i`, `-o` e pathspec levam ao commit o que nao esta no indice (CodeAnt no #53): as linhas
# adicionadas nos arquivos rastreados, preparadas ou nao, sao varridas sempre.
printf 'antes\n%s\ndepois\n' "$SK" > "$SEG_T/chave.pem"
for cmd in 'git commit -m x' 'git commit -a -m x' 'git commit -am x' 'git commit -i chave.pem -m x' \
           'git commit -o chave.pem -m x' 'git commit chave.pem -m x' 'git commit -m x -- chave.pem'; do
  caso "segredo so alterado, sem preparar ($cmd): barra" comum/sem-segredo.sh "$(bash_json "$cmd")" 2
done
seg_git reset -q --hard
# O commit do proprio hook e da propria suite nao pode barrar: foi o que o Login encontrou ao
# commitar o update da 0.12.3. Os valores sinteticos ficam montados em tempo de teste.
cp "$H/teste.sh" "$SEG_T/teste.sh"; cp "$H/comum/sem-segredo.sh" "$SEG_T/sem-segredo.sh"
seg_git add teste.sh sem-segredo.sh
caso "commit do teste.sh e do sem-segredo.sh: passa" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
seg_git reset -q --hard; rm -f "$SEG_T/teste.sh" "$SEG_T/sem-segredo.sh"
caso "segredo na mensagem do commit: barra"      comum/sem-segredo.sh "$(bash_json "git commit -m 'chave $SK'")" 2
# Mensagem por arquivo (`-F`/`--file`) entra no historico como a do `-m` (conselhos#210, P4).
printf 'mensagem com %s\n' "$SK" > "$SEG_T/msg.txt"
for cmd in 'git commit -F msg.txt' 'git commit -Fmsg.txt' 'git commit --file msg.txt' \
           'git commit --file=msg.txt' 'git commit -aF msg.txt'; do
  caso "segredo na mensagem por arquivo ($cmd): barra" comum/sem-segredo.sh "$(bash_json "$cmd")" 2
done
printf 'mensagem comum\n' > "$SEG_T/msg.txt"
caso "mensagem por arquivo sem segredo: passa"   comum/sem-segredo.sh "$(bash_json 'git commit -F msg.txt')" 0
caso "mensagem entre aspas: passa"              comum/sem-segredo.sh "$(bash_json 'git commit -F "msg.txt"')" 0
caso "-F - (stdin): barra, nao se varre"         comum/sem-segredo.sh "$(bash_json 'git commit -F -')" 2
caso "-F de arquivo que nao existe: barra"       comum/sem-segredo.sh "$(bash_json 'git commit -F nao-existe.txt')" 2
caso "segundo -F tambem e varrido: barra"        comum/sem-segredo.sh "$(bash_json 'git commit -F msg.txt -F nao-existe.txt')" 2
# Opcao global com argumento antes do subcomando (`-C <dir>`, `-c k=v`) nao esconde o commit.
printf 'mensagem com %s\n' "$SK" > "$SEG_T/msg.txt"
caso "git -C . commit -F msg.txt: barra"          comum/sem-segredo.sh "$(bash_json 'git -C . commit -F msg.txt')" 2
caso "git -c user.name=x commit -F msg.txt: barra" comum/sem-segredo.sh "$(bash_json 'git -c user.name=x commit -F msg.txt')" 2
rm -f "$SEG_T/msg.txt"
printf 'antes\n%s\ndepois\n' "$SK" > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "git --git-dir=.git -c a=b commit com segredo preparado: barra" comum/sem-segredo.sh "$(bash_json 'git --git-dir=.git -c a=b commit -m x')" 2
caso "git -C . commit com segredo preparado: barra" comum/sem-segredo.sh "$(bash_json 'git -C . commit -m x')" 2
seg_git reset -q --hard
printf 'CHAVE=%s\n' "$SK" > "$SEG_T/novo.env"
caso "git -C . add novo && git -C . commit: barra" comum/sem-segredo.sh "$(bash_json 'git -C . add novo.env && git -C . commit -m x')" 2
rm -f "$SEG_T/novo.env"
# Diff externo ou textconv configurado nao pode esconder o que entra (conselhos#210, P7).
printf 'antes\n%s\ndepois\n' "$SK" > "$SEG_T/chave.pem"; seg_git add chave.pem
seg_git config diff.external /bin/true
caso "diff.external nao esconde o segredo: barra" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
seg_git config --unset diff.external
printf '*.pem diff=vazio\n' > "$SEG_T/.gitattributes"; seg_git config diff.vazio.textconv true
caso "textconv nao esconde o segredo: barra"      comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
seg_git config --unset diff.vazio.textconv; rm -f "$SEG_T/.gitattributes"
seg_git reset -q --hard
# Nao rastreado que o mesmo comando adiciona (`git add ... && git commit`) nao esta em
# nenhum diff na hora do PreToolUse (katosmv/login#30). Com `add` e `commit` no mesmo
# comando, os nao rastreados nao ignorados sao varridos; sem o `add`, nao entram no commit.
printf 'CHAVE=%s\n' "$SK" > "$SEG_T/novo.env"
caso "git add novo && git commit: barra"          comum/sem-segredo.sh "$(bash_json 'git add novo.env && git commit -m x')" 2
caso "git add -A; git commit: barra"              comum/sem-segredo.sh "$(bash_json 'git add -A; git commit -m x')" 2
printf 'linha benigna\n' >> "$SEG_T/chave.pem"; seg_git add chave.pem
caso "nao rastreado sem add no comando: passa"    comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
seg_git reset -q --hard; rm -f "$SEG_T/novo.env"
head -c 1100000 /dev/zero | tr '\0' 'a' > "$SEG_T/grande.txt"
caso "nao rastreado acima de 1 MiB: barra"        comum/sem-segredo.sh "$(bash_json 'git add . && git commit -m x')" 2
rm -f "$SEG_T/grande.txt"
FORA_T="$(mktemp -d)"; printf 'CHAVE=%s\n' "$SK" > "$FORA_T/segredo.txt"
ln -s "$FORA_T/segredo.txt" "$SEG_T/link.txt"
caso "link nao rastreado nao e seguido: passa"    comum/sem-segredo.sh "$(bash_json 'git add -A && git commit -m x')" 0
rm -f "$SEG_T/link.txt"; rm -rf "$FORA_T"
# Binario ou atributo -diff: o diff sairia sem bloco @@ (login#30); --text forca as linhas.
{ printf 'cab\000eca\n'; printf 'CHAVE=%s\n' "$SK"; } > "$SEG_T/dado.bin"; seg_git add dado.bin
caso "segredo depois de NUL (binario): barra"     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
seg_git rm -q --cached dado.bin; rm -f "$SEG_T/dado.bin"
printf '*.txt -diff\n' > "$SEG_T/.gitattributes"; seg_git add .gitattributes; seg_git commit -q -m attrs
printf 'CHAVE=%s\n' "$SK" > "$SEG_T/nota.txt"; seg_git add nota.txt
caso "segredo em arquivo -diff: barra"            comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
seg_git rm -q --cached nota.txt; rm -f "$SEG_T/nota.txt"; seg_git reset -q --hard HEAD~1
# Revisao do CodeAnt no mergex#54. Opcao global entre aspas com espaco (`git -C 'a b'
# commit`) tambem e commit; o repositorio varrido e o que o comando atinge (`-C`, `cd`),
# nao so o do cwd do evento; o `-F` relativo vale para o diretorio em que o Git roda.
mkdir -p "$SEG_T/a b"
printf 'antes\n%s\ndepois\n' "$SK" > "$SEG_T/chave.pem"; seg_git add chave.pem
caso "git -C 'a b' commit (aspas com espaco): barra" comum/sem-segredo.sh "$(bash_json "git -C 'a b' commit -m x")" 2
caso "git -C \"a b\" commit (aspas duplas): barra"   comum/sem-segredo.sh "$(bash_json 'git -C "a b" commit -m x')" 2
seg_git reset -q --hard
OUTRO_T="$(mktemp -d)"; git -C "$OUTRO_T" init -q -b feature/outro
printf 'CHAVE=%s\n' "$SK" > "$OUTRO_T/k.env"; git -C "$OUTRO_T" add k.env
caso "git -C <outro repo> commit com segredo la: barra" comum/sem-segredo.sh "$(bash_json "git -C $OUTRO_T commit -m x")" 2
caso "cd <outro repo> && git commit: barra"             comum/sem-segredo.sh "$(bash_json "cd $OUTRO_T && git commit -m x")" 2
caso "cd sem alvo resolvivel && git commit: barra"      comum/sem-segredo.sh "$(bash_json 'cd "$DESTINO" && git commit -m x')" 2
caso "cd <repo limpo> && git commit: passa"             comum/sem-segredo.sh "$(bash_json "cd '$SEG_T/a b' && git commit -m x")" 0
caso "cd com escape de shell && git commit: barra"      comum/sem-segredo.sh "$(bash_json 'cd a\ b && git commit -m x')" 2
caso "GIT_INDEX_FILE=... git commit: barra"              comum/sem-segredo.sh "$(bash_json 'GIT_INDEX_FILE=/tmp/i git commit -m x')" 2
caso "git --work-tree=. commit: barra"                   comum/sem-segredo.sh "$(bash_json 'git --work-tree=. commit -m x')" 2
caso "git -c core.worktree=. commit: barra"              comum/sem-segredo.sh "$(bash_json 'git -c core.worktree=. commit -m x')" 2
# Chave de configuracao nao diferencia maiusculas, e ha outras portas para ela.
caso "git -c core.WorkTree=. commit: barra"              comum/sem-segredo.sh "$(bash_json 'git -c core.WorkTree=. commit -m x')" 2
caso "GIT_CONFIG_COUNT=1 ... git commit: barra"          comum/sem-segredo.sh "$(bash_json 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.worktree GIT_CONFIG_VALUE_0=. git commit -m x')" 2
caso "git -c include.path=x commit: barra"               comum/sem-segredo.sh "$(bash_json 'git -c include.path=/tmp/x commit -m x')" 2
caso "git --config-env=... commit: barra"                comum/sem-segredo.sh "$(bash_json 'git --config-env=core.worktree=W commit -m x')" 2
# `~` entre aspas e literal no shell: o diretorio `~` dentro do cwd, nao o $HOME.
mkdir -p "$SEG_T/~"; git -C "$SEG_T/~" init -q -b feature/til
printf 'CHAVE=%s\n' "$SK" > "$SEG_T/~/k.env"; git -C "$SEG_T/~" add k.env
caso "git -C '~' commit (til literal): barra"            comum/sem-segredo.sh "$(bash_json "git -C '~' commit -m x")" 2
rm -rf "$SEG_T/~"
rm -rf "$OUTRO_T"
printf 'mensagem comum\n' > "$SEG_T/msg.txt"; printf 'mensagem com %s\n' "$SK" > "$SEG_T/a b/msg.txt"
caso "cd sub && git commit -F msg.txt (o do sub): barra" comum/sem-segredo.sh "$(bash_json "cd 'a b' && git commit -F msg.txt")" 2
caso "git -C sub commit -F msg.txt (o do sub): barra"    comum/sem-segredo.sh "$(bash_json "git -C 'a b' commit -F msg.txt")" 2
rm -f "$SEG_T/msg.txt" "$SEG_T/a b/msg.txt"; rmdir "$SEG_T/a b"
# O link nao e seguido, mas o texto do alvo vira o blob: e varrido.
ln -s "CHAVE=$SK" "$SEG_T/link-alvo"
caso "link nao rastreado com segredo no alvo: barra" comum/sem-segredo.sh "$(bash_json 'git add -A && git commit -m x')" 2
rm -f "$SEG_T/link-alvo"
# Ignorado so entra no commit com `add -f`: so entao e varrido.
printf 'ignorado.env\n.gitignore\n' > "$SEG_T/.gitignore"; printf 'CHAVE=%s\n' "$SK" > "$SEG_T/ignorado.env"
caso "git add -f ignorado && git commit: barra"     comum/sem-segredo.sh "$(bash_json 'git add -f ignorado.env && git commit -m x')" 2
caso "git add --force ignorado && git commit: barra" comum/sem-segredo.sh "$(bash_json 'git add --force ignorado.env && git commit -m x')" 2
caso "git add -fA && git commit: barra"             comum/sem-segredo.sh "$(bash_json 'git add -fA && git commit -m x')" 2
caso "git add -Af && git commit: barra"             comum/sem-segredo.sh "$(bash_json 'git add -Af && git commit -m x')" 2
caso "git add -A com ignorado (sem -f): passa"      comum/sem-segredo.sh "$(bash_json 'git add -A && git commit -m x')" 0
rm -f "$SEG_T/.gitignore" "$SEG_T/ignorado.env"
HOOK_CWD="$HOOK_CWD_ANTES"; rm -rf "$SEG_T"
# O arquivo do framework que o lock da instalacao confere por hash nao e varrido no commit:
# a atualizacao do framework barrava no proprio hook (conselhos, 0.12.5 para 0.12.8; DM-286).
# Vale so para o blob preparado, com o lock v2 do indice, nas pastas do framework.
LCK_T="$(mktemp -d)"
git -C "$LCK_T" init -q -b feature/lock
lck_git() { git -C "$LCK_T" -c user.email=t@t -c user.name=t -c commit.gpgsign=false "$@"; }
lck_sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'; }
# lck_lock <versao> <caminho> <hash> — grava o lock com uma entrada em instalacao.arquivos
lck_lock() { mkdir -p "$LCK_T/.expx"; jq -n --argjson v "$1" --arg p "$2" --arg h "$3" \
  '{lock_version:$v,cli_version:"0.12.9",harness:["claude"],skills:{},instalacao:{arquivos:{($p):$h}}}' > "$LCK_T/.expx/expx-lock.json"; }
printf 'base\n' > "$LCK_T/base.txt"; lck_git add base.txt; lck_git commit -q -m base
HOOK_CWD_ANTES="$HOOK_CWD"; HOOK_CWD="$LCK_T"
FW=".claude/hooks/fw.sh"; mkdir -p "$LCK_T/.claude/hooks"
printf 'K=%s\n' "$SK" > "$LCK_T/$FW"
lck_lock 2 "$FW" "$(lck_sha "$LCK_T/$FW")"; lck_git add -A
caso "lock: arquivo do framework com o hash do lock: passa"     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
caso "lock: segredo na mensagem continua barrando"              comum/sem-segredo.sh "$(bash_json "git commit -m 'chave $SK'")" 2
printf 'K=%s\nT=%s\n' "$SK" "$SK" > "$LCK_T/$FW"
caso "lock: alteracao nao preparada no mesmo arquivo: barra"    comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
lck_git add -A
caso "lock: hash que nao bate: barra"                           comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
lck_lock 2 "$FW" "$(lck_sha "$LCK_T/$FW")"
caso "lock: o lock certo so na arvore, nao no indice: barra"    comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
lck_git add -A; lck_lock 1 "$FW" "$(lck_sha "$LCK_T/$FW")"; lck_git add -A
caso "lock: versao 1 nao dispensa: barra"                       comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
printf '{ nao e json' > "$LCK_T/.expx/expx-lock.json"; lck_git add -A
caso "lock: malformado nao dispensa: barra"                     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
printf 'K=%s\n' "$SK" > "$LCK_T/app.env"; lck_lock 2 "app.env" "$(lck_sha "$LCK_T/app.env")"; lck_git add -A
caso "lock: caminho fora das pastas do framework: barra"        comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
lck_git rm -q --cached app.env; rm -f "$LCK_T/app.env"
printf 'ok\n' > "$LCK_T/$FW"; lck_lock 2 "$FW" "$(lck_sha "$LCK_T/$FW")"
jq --arg n "$SK" '.nota = $n' "$LCK_T/.expx/expx-lock.json" > "$LCK_T/l.tmp" && mv "$LCK_T/l.tmp" "$LCK_T/.expx/expx-lock.json"; lck_git add -A
caso "lock: segredo dentro do proprio lock: barra"              comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
lck_git reset -q --hard; lck_git clean -qfd; mkdir -p "$LCK_T/.claude/hooks"
printf 'K=%s\n' "$SK" > "$LCK_T/$FW"; lck_lock 2 "$FW" "$(lck_sha "$LCK_T/$FW")"
caso "lock: add e commit no mesmo comando nao dispensa: barra"  comum/sem-segredo.sh "$(bash_json 'git add -A && git commit -m x')" 2
ln -s "K=$SK" "$LCK_T/.claude/hooks/link"; printf 'K=%s' "$SK" > "$LCK_T/alvo.txt"
lck_lock 2 ".claude/hooks/link" "$(lck_sha "$LCK_T/alvo.txt")"; rm -f "$LCK_T/alvo.txt" "$LCK_T/$FW"; lck_git add -A
caso "lock: link simbolico nao dispensa: barra"                 comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
# lck_novo <arquivos...> — indice limpo, cada arquivo com um segredo, lock com o hash de cada um
lck_novo() {
  local a; lck_git reset -q --hard; lck_git clean -qfd; mkdir -p "$LCK_T/.expx"
  local ent='{}'
  for a in "$@"; do mkdir -p "$LCK_T/$(dirname "$a")"; printf 'K=%s\n' "$SK" > "$LCK_T/$a"
    ent="$(jq -c --arg p "$a" --arg h "$(lck_sha "$LCK_T/$a")" '. + {($p): $h}' <<<"$ent")"; done
  jq -n --argjson e "$ent" '{lock_version:2,cli_version:"0.12.9",harness:["claude"],skills:{},instalacao:{arquivos:$e}}' > "$LCK_T/.expx/expx-lock.json"
}
# Uma chave malformada invalida o lock inteiro, inclusive a entrada valida ao lado (Codex).
for ruim in $'.claude/hooks/a\nb' $'.claude/hooks/a\tb' '.claude/hooks/a\b' '.claude/hooks/./a' \
            '.claude/hooks/../a' '.claude/hooks//a' '/abs/a'; do
  lck_novo "$FW"
  jq --arg k "$ruim" --arg h "$(printf '%064d' 0)" '.instalacao.arquivos[$k] = $h' "$LCK_T/.expx/expx-lock.json" > "$LCK_T/l.tmp" \
    && mv "$LCK_T/l.tmp" "$LCK_T/.expx/expx-lock.json"; lck_git add -A
  caso "lock: chave malformada $(printf '%q' "$ruim") invalida o lock: barra" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
done
# O caminho e literal na exclusao: `*` e `[` nao alcancam outro arquivo.
ESTR='.claude/hooks/a b"[1]*.sh'
lck_novo "$ESTR"; lck_git add -A
caso "lock: caminho com espaco, aspas, [ e *: passa"            comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
printf 'K=%s\n' "$SK" > "$LCK_T/.claude/hooks/a b\"1-outro.sh"; lck_git add -A
caso "lock: o * do caminho nao dispensa outro arquivo: barra"   comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
# Os limites, baixados pelas variaveis: acima deles, nada e dispensado.
lck_novo "$FW" ".claude/hooks/fw2.sh"; lck_git add -A
caso "lock: dois arquivos dentro dos limites: passa"            comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
export EXPX_SEGREDO_DISP_MAX_ENTRADAS=1
caso "lock: mais entradas que o limite: barra"                  comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
unset EXPX_SEGREDO_DISP_MAX_ENTRADAS; export EXPX_SEGREDO_DISP_MAX_ARQUIVOS=1
caso "lock: mais arquivos dispensaveis que o limite: barra"     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
unset EXPX_SEGREDO_DISP_MAX_ARQUIVOS; export EXPX_SEGREDO_DISP_MAX_BYTES=10
caso "lock: mais bytes que o limite: barra"                     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
unset EXPX_SEGREDO_DISP_MAX_BYTES; export EXPX_SEGREDO_DISP_MAX_LOCK=10
caso "lock: lock maior que o limite: barra"                     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
unset EXPX_SEGREDO_DISP_MAX_LOCK; export EXPX_SEGREDO_DISP_MAX_ARQUIVOS=99999
caso "lock: variavel nao sobe o limite (99999 ainda e 1024): passa" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
unset EXPX_SEGREDO_DISP_MAX_ARQUIVOS
# Sem sha256 que funcione, nada e dispensado.
SEMSHA_T="$(mktemp -d)"; printf '#!/bin/sh\nexit 1\n' > "$SEMSHA_T/sha256sum"; cp "$SEMSHA_T/sha256sum" "$SEMSHA_T/shasum"
chmod +x "$SEMSHA_T/sha256sum" "$SEMSHA_T/shasum"
PATH_ANTES="$PATH"; export PATH="$SEMSHA_T:$PATH"
caso "lock: sem sha256 que funcione: barra"                     comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
export PATH="$PATH_ANTES"; rm -rf "$SEMSHA_T"
# O hash certo com saida de erro tambem nao vale: so o exito do executavel conta (Codex).
SHAERR_T="$(mktemp -d)"
printf '#!/bin/sh\n"%s" "$@"\nexit 1\n' "$(command -v sha256sum || command -v shasum)" > "$SHAERR_T/sha256sum"
cp "$SHAERR_T/sha256sum" "$SHAERR_T/shasum"; chmod +x "$SHAERR_T/sha256sum" "$SHAERR_T/shasum"
export PATH="$SHAERR_T:$PATH"
caso "lock: sha256 que imprime o hash mas sai com erro: barra"  comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 2
# ...nem num chamador sem pipefail: o helper exige o exito por conta propria.
SHA_RC="$(set +o pipefail; . "$H/../skills/mergex/scripts/segredo-dispensa.sh"; printf 'x' | _disp_sha256 >/dev/null 2>&1; echo $?)"
if [ "$SHA_RC" != 0 ]; then OK=$((OK+1)); printf '  ok    %s\n' "lock: _disp_sha256 sem pipefail devolve o erro do executavel"
else FALHOU=$((FALHOU+1)); printf '  FALHA %s (rc %s)\n' "lock: _disp_sha256 sem pipefail devolve o erro do executavel" "$SHA_RC"; fi
export PATH="$PATH_ANTES"; rm -rf "$SHAERR_T"
HOOK_CWD="$HOOK_CWD_ANTES"; rm -rf "$LCK_T"
# Prefixo de chave no meio de um identificador nao e chave. Falso positivo do
# conselho #204: "ta" + "sk-fora-do-plano-..." (nome de um caso da bancada da
# sprintx) casava com sk-, e barrou os commits de instalacao do framework. O
# prefixo so vale no comeco da linha ou depois de caractere fora de [A-Za-z0-9_-].
echo "sem-segredo — prefixo dentro de identificador tem que PASSAR"
IDENT='  n_fora:nfora-task-fora-do-plano-corrente-fail-closed'
caso "sk- dentro de identificador"         comum/sem-segredo.sh "$(write_json "$IDENT")" 0
printf '%s\n' "$IDENT" > ident.sh && git add ident.sh
caso "sk- dentro de identificador no diff" comum/sem-segredo.sh "$(bash_json 'git commit -m x')" 0
git rm -q --cached ident.sh && rm -f ident.sh
caso "ghp_ e AKIA dentro de palavra"       comum/sem-segredo.sh "$(write_json "abcghp_$(printf 'A%.0s' {1..24}) MEUAKIA$(printf 'B%.0s' {1..16})")" 0
echo "sem-segredo — prefixo com limite a esquerda continua BARRANDO"
caso "sk- no comeco da linha"              comum/sem-segredo.sh "$(write_json "$SK")" 2
caso "sk- depois de espaco"                comum/sem-segredo.sh "$(write_json "Bearer $SK")" 2
caso "sk- depois de ="                     comum/sem-segredo.sh "$(write_json "OPENAI=$SK")" 2
caso "sk- depois de aspas"                 comum/sem-segredo.sh "$(write_json "k='$SK'")" 2
caso "sk- depois de :"                     comum/sem-segredo.sh "$(write_json "chave:$SK")" 2
caso "identificador e chave na mesma linha" comum/sem-segredo.sh "$(write_json "${IDENT} $SK")" 2
caso "ghp_ depois de ="                    comum/sem-segredo.sh "$(write_json "GH=ghp_$(printf 'Z9%.0s' {1..12})")" 2
caso "github_pat depois de = barra"             comum/sem-segredo.sh "$(write_json "GH=$FGH")" 2
caso "placeholder anterior nao mascara segredo" comum/sem-segredo.sh "$(write_json "fake=sk-your-key-here-xxxxxxxxxx real=$SK")" 2
caso "example dentro de token real barra"       comum/sem-segredo.sh "$(write_json "GH=github_pat_example$(printf 'A%.0s' {1..32})")" 2
caso "Google exata seguida de virgula barra"     comum/sem-segredo.sh "$(write_json "$GKEY,")" 2
caso "Google seguida de identificador passa"    comum/sem-segredo.sh "$(write_json "${GKEY}X")" 0
caso "placeholder anterior nao mascara AKIA"    comum/sem-segredo.sh "$(write_json "exemplo=sk-example-placeholder chave=AKIA$(printf 'ABCDEFGHIJKLMNOP')")" 2
caso "ghs_ curto barra"                        comum/sem-segredo.sh "$(write_json "T=ghs_$(printf 'A%.0s' {1..20})")" 2
caso "ghu_ curto barra"                        comum/sem-segredo.sh "$(write_json "T=ghu_$(printf 'A%.0s' {1..20})")" 2
caso "ghr_ curto barra"                        comum/sem-segredo.sh "$(write_json "T=ghr_$(printf 'A%.0s' {1..20})")" 2
caso "ghs_ dentro de identificador passa"      comum/sem-segredo.sh "$(write_json "id=prefixoghs_$(printf 'A%.0s' {1..20})")" 0
# AKIA tem fronteira propria (conselho #204, rodada 3): o hifen antes dela nao
# continua identificador, entao "id-AKIA..." e chave; letra, digito ou _ antes
# continuam. O sk- depois de hifen segue passando (task-fora-do-plano).
AK="AKIA$(printf 'QWERTY7ZJ2KLMNPR')"
caso "AKIA depois de hifen: barra"         comum/sem-segredo.sh "$(write_json "id-$AK")" 2
caso "AKIA no comeco da linha: barra"      comum/sem-segredo.sh "$(write_json "$AK")" 2
caso "AKIA logo depois de letra: passa"    comum/sem-segredo.sh "$(write_json "x$AK")" 0
caso "AKIA logo depois de _: passa"        comum/sem-segredo.sh "$(write_json "_$AK")" 0
caso "sk- depois de hifen: passa"          comum/sem-segredo.sh "$(write_json "id-$SK")" 0
# ASIA (chave temporaria do STS) tem a mesma fronteira da AKIA, como na sprintx
AS="ASIA$(printf 'QWERTY7ZJ2KLMNPR')"
caso "ASIA no comeco da linha: barra"      comum/sem-segredo.sh "$(write_json "$AS")" 2
caso "ASIA depois de hifen: barra"         comum/sem-segredo.sh "$(write_json "id-$AS")" 2
caso "ASIA dentro de identificador: passa" comum/sem-segredo.sh "$(write_json "x$AS")" 0
# A chave da AWS tem exatamente 20 caracteres: seguida de mais alfanumericos e um
# identificador mais longo, nao chave (sprintx#38). Fim de linha, espaco, aspas ou
# virgula depois dela fecham a chave, e a mascara mostra so o fim da chave.
caso "AKIA seguida de mais alfanumericos: passa" comum/sem-segredo.sh "$(write_json "${AK}X9")" 0
caso "AKIA seguida de _: passa"                  comum/sem-segredo.sh "$(write_json "${AK}_v2")" 0
caso "AKIA seguida de espaco: barra"             comum/sem-segredo.sh "$(write_json "$AK fim")" 2
caso "AKIA seguida de aspas: barra"              comum/sem-segredo.sh "$(write_json "k=\"$AK\"")" 2
caso "ASIA seguida de virgula: barra"            comum/sem-segredo.sh "$(write_json "$AS,outro")" 2
if [ "$SEM_JQ" = 0 ]; then
  mascara="$(write_json "k=\"$AK\",x" | bash "$H/comum/sem-segredo.sh" 2>&1)"
  case "$mascara" in
    *"API: …MNPR (linha"*) OK=$((OK+1)); printf '  ok    %s\n' "AKIA com limite a direita: a mascara mostra so o fim da chave" ;;
    *) FALHOU=$((FALHOU+1)); printf '  FALHA %s\n' "AKIA com limite a direita: a mascara nao e o fim da chave" ;;
  esac
else
  PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "AKIA com limite a direita: mascara"
fi

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
# O valor de -o (e de aglomerado terminado em o) nao e o remoto.
caso "push -o main origin feature"  mergex/git-perigoso.sh "$(bash_json 'git push -o main origin feature')" 0
caso "push -uo main origin feature" mergex/git-perigoso.sh "$(bash_json 'git push -uo main origin feature')" 0
# Prefixo de ambiente qualquer (nao so GIT_*) continua sendo push.
caso "FOO=1 git push origin main"   mergex/git-perigoso.sh "$(bash_json 'FOO=1 git push origin main')" 2
# Desfazer o stage NAO toca a arvore e nao destroi nada: barrar isso seria o
# falso positivo que atrapalha o dia inteiro. Regressao de um caso real.
caso "restore --staged (so o stage)" mergex/git-perigoso.sh "$(bash_json 'git restore --staged f.txt')" 0
caso "checkout de branch"            mergex/git-perigoso.sh "$(bash_json 'git checkout outra-branch')" 0
# git por caminho (/usr/bin/git, ./git), git.exe e `\git` (que pula alias) sao o
# MESMO programa: nenhuma dessas formas pode sair no pre-filtro antes das regras,
# senao o hook inteiro e contornado (CodeAnt 4235529191). /usr/lib/git-core/git-push
# fica para follow-up.
echo "git-perigoso — git invocado por caminho, git.exe e \\git"
caso "/usr/bin/git push --force barra"      mergex/git-perigoso.sh "$(bash_json '/usr/bin/git push --force origin feature/x')" 2
caso "./git push --force barra"             mergex/git-perigoso.sh "$(bash_json './git push --force origin feature/x')" 2
caso "\\git push --force barra"             mergex/git-perigoso.sh "$(bash_json '\git push --force origin feature/x')" 2
caso "git.exe push --force barra"           mergex/git-perigoso.sh "$(bash_json 'git.exe push --force origin feature/x')" 2
caso "/usr/bin/git push origin main barra"  mergex/git-perigoso.sh "$(bash_json '/usr/bin/git push origin main')" 2
caso "/usr/bin/git push feature/x:main barra" mergex/git-perigoso.sh "$(bash_json '/usr/bin/git push origin feature/x:main')" 2
caso "sudo /usr/bin/git push --force barra" mergex/git-perigoso.sh "$(bash_json 'sudo /usr/bin/git push --force origin feature/x')" 2
caso "/usr/bin/git push na feature passa"   mergex/git-perigoso.sh "$(bash_json '/usr/bin/git push origin feature/x')" 0
caso "/usr/bin/git log passa"               mergex/git-perigoso.sh "$(bash_json '/usr/bin/git log --oneline')" 0
caso "echo sobre /usr/bin/git push --force passa" mergex/git-perigoso.sh "$(bash_json 'echo "/usr/bin/git push --force"')" 0
# A palavra do programa e normalizada UMA vez (CMD_N: sem aspas pareadas, sem
# caminho, sem `\`, sem .exe) antes do pre-filtro e de TODAS as regras: a forma
# entre aspas nao sai no pre-filtro, e git.exe cai nas regras 2-5 como git
# (rodada 1 da revisao: I1 e I2). Sem falso bloqueio: caminho que termina em
# `git` como argumento nao e programa.
echo "git-perigoso — programa normalizado: aspas, git.exe nas regras 2-5, sem falso bloqueio"
caso "\"/usr/bin/git\" push --force barra"   mergex/git-perigoso.sh "$(bash_json '"/usr/bin/git" push --force origin feature/x')" 2
caso "'/usr/bin/git' push --force barra"     mergex/git-perigoso.sh "$(bash_json "'/usr/bin/git' push --force origin feature/x")" 2
caso "\"git\" push -f barra"                 mergex/git-perigoso.sh "$(bash_json '"git" push -f')" 2
caso "\"git.exe\" push -f barra"             mergex/git-perigoso.sh "$(bash_json '"git.exe" push -f')" 2
caso "\"/usr/bin/git\" push origin main barra" mergex/git-perigoso.sh "$(bash_json '"/usr/bin/git" push origin main')" 2
caso "git.exe commit na principal barra"     mergex/git-perigoso.sh "$(bash_json 'git.exe commit -m x')" 2
caso "\"/usr/bin/git\" commit na principal barra" mergex/git-perigoso.sh "$(bash_json '"/usr/bin/git" commit -m x')" 2
caso "git.exe clean -fd barra"               mergex/git-perigoso.sh "$(bash_json 'git.exe clean -fd')" 2
caso "\"git\" clean -fd barra"               mergex/git-perigoso.sh "$(bash_json '"git" clean -fd')" 2
caso "git.exe status passa"                  mergex/git-perigoso.sh "$(bash_json 'git.exe status')" 0
caso "\"git\" status passa"                  mergex/git-perigoso.sh "$(bash_json '"git" status')" 0
caso "git.exe clean -n passa"                mergex/git-perigoso.sh "$(bash_json 'git.exe clean -n')" 0
caso "ls ./tools/git passa"                  mergex/git-perigoso.sh "$(bash_json 'ls ./tools/git')" 0
caso "cat src/git passa"                     mergex/git-perigoso.sh "$(bash_json 'cat src/git')" 0
caso "cat src/git push --force passa"        mergex/git-perigoso.sh "$(bash_json 'cat src/git push --force')" 0
caso "git log -- src/git passa"              mergex/git-perigoso.sh "$(bash_json 'git log -- src/git')" 0
caso "git add tools/git push passa"          mergex/git-perigoso.sh "$(bash_json 'git add tools/git push')" 0
caso "which git passa"                       mergex/git-perigoso.sh "$(bash_json 'which git')" 0
caso "cat .gitignore passa"                  mergex/git-perigoso.sh "$(bash_json 'cat .gitignore')" 0
caso "cat foo/digit passa"                   mergex/git-perigoso.sh "$(bash_json 'cat foo/digit')" 0
# Atribuicao com valor entre aspas e espaco antes do programa: a leitura do push
# (comum/base.sh) pula o resto do valor ate a aspa fechar (rodada 2 da revisao).
caso "FOO=\"a b\" git push --force barra"          mergex/git-perigoso.sh "$(bash_json 'FOO="a b" git push --force origin feature/x')" 2
caso "FOO=\"a b\" /usr/bin/git push --force barra" mergex/git-perigoso.sh "$(bash_json 'FOO="a b" /usr/bin/git push --force origin feature/x')" 2
caso "FOO='a b c' git push origin main barra"      mergex/git-perigoso.sh "$(bash_json "FOO='a b c' git push origin main")" 2
caso "FOO=\"a b\" git push na feature passa"       mergex/git-perigoso.sh "$(bash_json 'FOO="a b" git push origin feature/x')" 0
# Custo: comando grande SEM git sai antes de normalizar (so builtins); com git
# no fim, a normalizacao e linear. Limite folgado: menos de LIMITE_MS cada (2 s;
# 10 s no Git Bash), e a descricao do caso diz o limite em uso, nunca outro.
# (rodada 2 da revisao: a normalizacao O(n^2) antes do pre-filtro levava 0,5-3 s em 10 KB)
echo "git-perigoso — custo em comando de 10 KB"
GRANDE=""; while [ "${#GRANDE}" -lt 10240 ]; do GRANDE="${GRANDE}echo aaaa bbbb; x y z; "; done
custo_ok() { # <desc> <json> <rc esperado> — rc certo e abaixo de LIMITE_MS
  local desc="$1" json="$2" esperado="$3" ini fim rc ms
  if [ "$SEM_JQ" = "1" ]; then PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "$desc"; return 0; fi
  # agora_ms, nao `date +%s%N`: sem o %N (macOS) o tempo virava 0 e o limite nunca reprovava
  ini="$(agora_ms)"
  # O limite de 30 s espelha o do harness: um caso que o estoura e morto (rc 124)
  # e falha, em vez de travar a suite por minutos (rodada 5 da revisao).
  if command -v timeout >/dev/null 2>&1; then
    printf '%s' "$json" | timeout 30 bash "$H/mergex/git-perigoso.sh" >/dev/null 2>&1; rc=$?
  else
    printf '%s' "$json" | bash "$H/mergex/git-perigoso.sh" >/dev/null 2>&1; rc=$?
  fi
  fim="$(agora_ms)"
  ms=$(( fim - ini ))
  if [ "$rc" = "$esperado" ] && [ "$ms" -lt "$LIMITE_MS" ]; then
    OK=$((OK+1)); printf '  ok    %s (%s ms)\n' "$desc" "$ms"
  else
    FALHOU=$((FALHOU+1)); printf '  FALHA %s (rc %s, esperava %s; %s ms, limite %s)\n' "$desc" "$rc" "$esperado" "$ms" "$LIMITE_MS"
  fi
}
custo_ok "10 KB sem git: passa em menos de $LIMITE_TXT"                     "$(bash_json "$GRANDE")" 0
custo_ok "10 KB com git push --force no fim: barra em menos de $LIMITE_TXT" "$(bash_json "${GRANDE}git push --force origin feature/x")" 2
# Denso em git (rodada 3 da revisao): ~100 KB de `git;` e um push forcado no fim.
# A normalizacao tem de ser linear no tamanho: em a8b63b8 custava 19 s e, com
# 125 KB, estourava o timeout de 30 s do harness, que NAO bloqueia (falha aberta).
# O JSON vai por stdin do jq: --arg nao aceita argumento desse tamanho.
DENSO=""; while [ "${#DENSO}" -lt 102400 ]; do DENSO="${DENSO}git;git;git;git;git;git;git;git;git;git;git;git;git;git;git;git;"; done
custo_ok "100 KB de git; + git push --force no fim: barra em menos de $LIMITE_TXT" \
  "$(printf '%s' "${DENSO}git push --force origin feature/x" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 2
# Teto que falha FECHADO: acima de GIT_TETO bytes (512 KB) com git, o hook nao
# avalia e barra (um hook morto pelo timeout do harness nao bloqueia). Mesmo um
# comando inofensivo (git status) barra ali; e o limite de tempo prova que ele
# nem tentou. Sem git, o tamanho nao importa: passa.
TETO=""; while [ "${#TETO}" -lt 524289 ]; do TETO="${TETO}${TETO:-echo aaaa bbbb cccc dddd; }"; done
custo_ok "acima do teto (>512 KB) com git: barra sem avaliar, em menos de $LIMITE_TXT" \
  "$(printf '%s' "${TETO}git status" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 2
custo_ok "acima do teto (>512 KB) sem git: passa, em menos de $LIMITE_TXT" \
  "$(printf '%s' "$TETO" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 0
# O teto conta BYTES, nao caracteres (re-revisao da rodada 3, N2). Em locale
# UTF-8 `${#CMD}` conta caracteres, e o custo da normalizacao e por byte:
# 500 000 x `日` sao 500 000 caracteres e 1,5 MB — passavam do teto por baixo, a
# normalizacao levava 21 s e, com push forcado no fim, o hook morria no timeout
# do harness (rc 124), que nao bloqueia: push liberado. Os casos rodam em
# C.UTF-8 de proposito (e a locale padrao do WSL e da maioria dos Linux); sem
# ela nesta maquina, ficam NAO_EXECUTADO. O texto e montado por byte (yes/head/
# tr), para o tamanho nao depender da locale de quem roda a suite.
if [ "$EH_WINDOWS" = 1 ]; then
  nao_executado "multibyte em C.UTF-8: bash do MSYS e quadratico em entrada multibyte de 150 KB ou mais (30 s contra 2 s no Linux); coberto no Linux e no macOS (5 casos)"
elif LC_ALL=C.UTF-8 bash -c 'x=é; [ "${#x}" = 1 ]' 2>/dev/null; then
  LC_ANTES="${LC_ALL-__nao_definida__}"
  export LC_ALL=C.UTF-8
  MULTI="$(yes '日' | head -n 500000 | tr -d '\n')"   # 500 000 caracteres, 1 500 000 bytes
  custo_ok "multibyte em C.UTF-8: 500 000 x 日 (1,5 MB) + git status: barra pelo teto em bytes, em menos de $LIMITE_TXT" \
    "$(printf '%s' "${MULTI} git status" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 2
  custo_ok "multibyte em C.UTF-8: 500 000 x 日 (1,5 MB); git push --force: barra sem disputar com o timeout" \
    "$(printf '%s' "${MULTI}; git push --force origin feature/x" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 2
  MULTI="$(yes '日' | head -n 50000 | tr -d '\n')"    # 50 000 caracteres, 150 000 bytes: abaixo do teto
  custo_ok "multibyte em C.UTF-8: 50 000 x 日 (150 KB) sem git: passa" \
    "$(printf '%s' "$MULTI" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 0
  custo_ok "multibyte em C.UTF-8: 50 000 x 日 (150 KB) + git status: abaixo do teto, avalia e passa" \
    "$(printf '%s' "${MULTI} git status" | jq -Rs --arg w "$HOOK_CWD" '{tool_name:"Bash",cwd:$w,tool_input:{command:.}}')" 0
  # Fronteira exata em bytes com multibyte (rodada extra): 174 760 x 日 = 524 280 B;
  # + ' git sta' (8 B) = 524 288 = teto, avalia (sem limite de tempo: ~3 s de
  # leitura legitima); + ' git stat' (9 B) = 524 289, barra sem avaliar.
  MULTI="$(yes '日' | head -n 174760 | tr -d '\n')"
  caso "multibyte em C.UTF-8: 524 288 bytes exatos (174 760 x 日 + ' git sta'): no teto, avalia e passa" \
    mergex/git-perigoso.sh "$(json_grande "${MULTI} git sta")" 0
  custo_ok "multibyte em C.UTF-8: 524 289 bytes (174 760 x 日 + ' git stat'): um acima, barra em menos de $LIMITE_TXT" \
    "$(json_grande "${MULTI} git stat")" 2
  if [ "$LC_ANTES" = "__nao_definida__" ]; then unset LC_ALL; else LC_ALL="$LC_ANTES"; fi
  unset MULTI LC_ANTES
else
  nao_executado "multibyte em C.UTF-8: locale indisponivel nesta maquina (4 casos)"
fi
# Leitura linear do push (rodada 5 da revisao, achado N3). A leitura por token de
# um segmento com `push` (comum/base.sh: expx_sem_descritor, expx_push_le,
# expx_sem_aspas) era quadratica no tamanho de UM token: um push forcado seguido
# de `; <32 KB>push` levava 15 s em C e mais de 40 s em C.UTF-8 — morto pelo
# timeout do harness, o push passava. E o pre-filtro `printf | grep -q` sob
# `pipefail` devolvia 141 (SIGPIPE) quando o grep casava cedo numa entrada maior
# que o buffer do pipe: `git push --force …; <100 KB>` saia por 0 sem avaliar.
# Cada caso roda em C e, quando a locale existe, em C.UTF-8.
TOKEN32="$(yes a | head -n 32768 | tr -d '\n')"                    # 32 KB sem separador
TOKEN128="${TOKEN32}${TOKEN32}${TOKEN32}${TOKEN32}"               # 128 KB
CAUDA="$(yes 'echo aaaa bbbb' | head -n 8000)"                     # ~120 KB em 8 000 linhas, sem `push`
LINHAS="$(yes 'git aaaaaaaaaaaa' | head -n 10000)"                 # 10 000 linhas `git …` (160 KB: mais que o buffer do pipe)
PUSHES16K="$(yes push | head -n 16000)"                            # 16 000 segmentos com `push` (80 KB)
TOKENS2K="$(yes a | head -n 2047 | tr '\n' ' ')"                   # 2 047 tokens de 1 byte (4 KB) num so segmento
TOKENS8K="$(yes a | head -n 8191 | tr '\n' ' ')"                   # 8 191 tokens (16 KB)
# PATH sem `wc`: tudo de /usr/bin e /bin por symlink, menos o wc (rodada extra 2, N6).
# No Windows o git e o jq nao moram em /usr/bin nem em /bin (mingw64, chocolatey):
# as pastas deles entram tambem, ou o PATH "sem wc" ficaria sem git e o caso mediria
# outra coisa. No Linux sao as mesmas pastas e nada muda.
DIR_GIT="$(dirname "$(command -v git)")"; DIR_JQ="$(dirname "$(command -v jq 2>/dev/null || echo /usr/bin/jq)")"
for f in /usr/bin/* /bin/* "$DIR_GIT"/* "$DIR_JQ"/*; do b="${f##*/}"; [ "$b" = wc ] || [ -e "$BINSW_T/$b" ] || ln -s "$f" "$BINSW_T/$b"; done 2>/dev/null
LOCALES="C"
LC_ALL=C.UTF-8 bash -c 'x=é; [ "${#x}" = 1 ]' 2>/dev/null && LOCALES="C C.UTF-8"
for LOC in $LOCALES; do
  LC_ANTES="${LC_ALL-__nao_definida__}"; export LC_ALL="$LOC"
  custo_ok "[$LOC] push forcado; token de 32 KB terminado em push: barra em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x; ${TOKEN32}push")" 2
  custo_ok "[$LOC] push forcado; token de 128 KB terminado em push: barra em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x; ${TOKEN128}push")" 2
  # Ate a rodada extra 2 este caso lia o segmento inteiro e decidia 0 (git e
  # argumento do programa desconhecido) em 0,5-0,9 s. Com o teto de bytes dos
  # segmentos com push (N5), um segmento de 128 KB com `push` nao e lido: barra,
  # falha fechada, em vez de pagar a leitura por token.
  if [ "$EH_WINDOWS" = 1 ]; then
    # Bash do MSYS: este caso passa de 30 s, o timeout do harness (DM-228)
    nao_executado "[$LOC] token de 128 KB como programa + git push --force: no Git Bash passa de 30 s (DM-228)"
  else
  custo_ok "[$LOC] token de 128 KB como programa + git push --force: segmento com push acima do teto de bytes, barra em menos de $LIMITE_TXT" \
    "$(json_grande "${TOKEN128} git push --force origin feature/x")" 2
  fi
  custo_ok "[$LOC] push forcado na 1a linha + 120 KB em 8 000 linhas sem push (pre-filtro sob pipefail): barra" \
    "$(json_grande "git push --force origin feature/x"$'\n'"${CAUDA}")" 2
  custo_ok "[$LOC] 10 000 linhas 'git …' (160 KB) + push forcado na ultima (pre-filtro sob pipefail): barra" \
    "$(json_grande "${LINHAS}"$'\n'"git push --force origin feature/x")" 2
  # Teto de segmentos com push (rodada extra da revisao, N4): cada segmento com
  # `push` custa ~2,4 ms de leitura por token, e o teto de bytes nao limita isso
  # — um push forcado seguido de 16 000 linhas `push` (80 KB) levava 39 s em
  # C.UTF-8: morto pelo timeout do harness, o push passava. Acima de PUSH_TETO
  # segmentos com `push` o hook nao le: barra, falha fechada.
  custo_ok "[$LOC] push forcado + 16 000 linhas 'push': barra pelo teto de segmentos, em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x"$'\n'"$PUSHES16K")" 2
  custo_ok "[$LOC] push forcado + 32 000 linhas 'push': barra pelo teto de segmentos, em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x"$'\n'"$PUSHES16K"$'\n'"$PUSHES16K")" 2
  custo_ok "[$LOC] tres pushes legitimos em tres linhas: passa, em menos de $LIMITE_TXT" \
    "$(json_grande "git push origin feature/x"$'\n'"git push origin feature/x"$'\n'"git push origin feature/x")" 0
  caso "[$LOC] push forcado + 400 linhas 'push': abaixo do teto, le e barra" \
    mergex/git-perigoso.sh "$(json_grande "git push --force origin feature/x"$'\n'"$(yes push | head -n 400)")" 2
  # O custo e por TOKEN (rodada extra 2 da revisao, N5): ~3,5-4 ms por token de um
  # segmento com `push`, em C.UTF-8. Um push forcado seguido de um push com 2 000
  # tokens (4 KB) levava 8,5 s e com 8 000 tokens 33 s — abaixo dos tetos de bytes
  # (512 KB) e de segmentos (500): morto pelo timeout, o push forcado passava.
  # Teto estrutural: bytes somados dos segmentos com `push`, medidos antes da
  # leitura por token.
  custo_ok "[$LOC] push forcado; push com 2 047 tokens (4 KB): barra pelo teto de bytes dos segmentos, em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x; git push origin feature/x ${TOKENS2K}")" 2
  custo_ok "[$LOC] push forcado; push com 8 191 tokens (16 KB): barra pelo teto de bytes dos segmentos, em menos de $LIMITE_TXT" \
    "$(json_grande "git push --force origin feature/x; git push origin feature/x ${TOKENS8K}")" 2
  custo_ok "[$LOC] push legitimo com 20 refspecs e PR em seguida: passa, em menos de $LIMITE_TXT" \
    "$(json_grande "git push -u origin feature/x $(yes feature/x | head -n 20 | tr '\n' ' ')&& gh pr create --fill")" 0
  if [ "$LC_ANTES" = "__nao_definida__" ]; then unset LC_ALL; else LC_ALL="$LC_ANTES"; fi
done
# Sem `wc` no PATH (rodada extra 2 da revisao, N6): a contagem de segmentos por
# `wc -l` virava 0 em silencio, o teto sumia e `wc: command not found` vazava no
# stderr. A contagem e a medida sao so com expansoes do bash: sem utilitario, sem
# ruido, e um push forcado seguido de 16 000 linhas `push` barra rapido.
PATH="$BINSW_T" custo_ok "[C] sem wc no PATH: push forcado + 16 000 linhas 'push' barra pelo teto, em menos de $LIMITE_TXT" \
  "$(json_grande "git push --force origin feature/x"$'\n'"$PUSHES16K")" 2
PATH="$BINSW_T" custo_ok "[C] sem wc no PATH: git push origin feature/x passa" "$(bash_json 'git push origin feature/x')" 0
if [ "$SEM_JQ" = "0" ]; then
  SAIDA_SW="$(json_grande "git push --force origin feature/x"$'\n'"$PUSHES16K" | PATH="$BINSW_T" timeout 30 bash "$H/mergex/git-perigoso.sh" 2>&1 >/dev/null)"; RC_SW=$?
  case "$RC_SW:$SAIDA_SW" in
    2:*"not found"*|2:*"nao encontrado"*|2:*"não encontrado"*)
      FALHOU=$((FALHOU+1)); printf '  FALHA sem wc no PATH: barra, mas "command not found" vazou no stderr\n' ;;
    2:*) OK=$((OK+1)); printf '  ok    sem wc no PATH: barra sem ruido de utilitario ausente no stderr\n' ;;
    *)   FALHOU=$((FALHOU+1)); printf '  FALHA sem wc no PATH: esperava rc 2 sem ruido, obteve rc %s\n' "$RC_SW" ;;
  esac
  unset SAIDA_SW RC_SW
fi
unset TOKEN32 TOKEN128 CAUDA LINHAS PUSHES16K TOKENS2K TOKENS8K LOCALES LC_ANTES
unset GRANDE DENSO TETO

echo
echo "branch-limpa"
caso "troca com arvore limpa"  comum/branch-limpa.sh "$(bash_json 'git switch outra')" 0
echo modificado >> arquivo.txt
caso "troca com arvore suja"   comum/branch-limpa.sh "$(bash_json 'git switch outra')" 2
# Descarte so e perigoso quando ha o que perder: aqui a arvore esta suja.
caso "restore sem flag"   mergex/git-perigoso.sh "$(bash_json 'git restore arquivo.txt')" 2
caso "restore --worktree" mergex/git-perigoso.sh "$(bash_json 'git restore --worktree arquivo.txt')" 2
# git.exe e a forma entre aspas sao o mesmo git tambem na regra de descarte
caso "git.exe restore barra"            mergex/git-perigoso.sh "$(bash_json 'git.exe restore arquivo.txt')" 2
caso "git.exe checkout -- barra"        mergex/git-perigoso.sh "$(bash_json 'git.exe checkout -- arquivo.txt')" 2
caso "\"/usr/bin/git\" restore barra"   mergex/git-perigoso.sh "$(bash_json '"/usr/bin/git" restore arquivo.txt')" 2
caso "git.exe restore --staged passa"   mergex/git-perigoso.sh "$(bash_json 'git.exe restore --staged arquivo.txt')" 0
caso "switch -c com suja"      comum/branch-limpa.sh "$(bash_json 'git switch -c nova')" 2
caso "checkout -- nao e troca" comum/branch-limpa.sh "$(bash_json 'git checkout -- arquivo.txt')" 0
caso "npm run switch"          comum/branch-limpa.sh "$(bash_json 'npm run switch')" 0
# SIGPIPE sob pipefail (rodada extra da revisao): `git switch -c y` seguido de
# mais de 64 KB de linhas liberava a troca com a arvore suja — a saida
# antecipada `printf | grep -q … || exit 0` devolvia 141. Criterio igual.
caso "switch -c + 70 KB de linhas, suja: barra"    comum/branch-limpa.sh "$(json_grande "git switch -c nova"$'\n'"$LINHAS70")" 2
caso "switch -c + 200 KB de linhas, suja: barra"   comum/branch-limpa.sh "$(json_grande "git switch -c nova"$'\n'"$LINHAS200")" 2
caso "checkout -b + 200 KB de linhas, suja: barra" comum/branch-limpa.sh "$(json_grande "git checkout -b nova"$'\n'"$LINHAS200")" 2
caso "npm test + 200 KB de linhas: passa"          comum/branch-limpa.sh "$(json_grande "npm test"$'\n'"$LINHAS200")" 0
caso "git status + 200 KB de linhas: passa"        comum/branch-limpa.sh "$(json_grande "git status"$'\n'"$LINHAS200")" 0
unset LINHAS70 LINHAS200
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
# Os casos de portão `pronto` moram no repositório histórico (mais abaixo, em
# "pr-so-com-portao — validade"): lá o portão é montado com portao_sha e
# commits de método de verdade. Aqui a branch `main` casa com a entrega
# `trab`, que não registrou portão. O trabalho sai da branch EMPURRADA e o
# portão do ENTREGA.md commitado na revisão empurrada — nunca do disco.
fm_chave docs/entregas/trab/ENTREGA.md portao null
git add docs/entregas/trab/ENTREGA.md && git commit -qm "registra portao null"
caso "portao null, modo aviso: nao barra" mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin main')" 0
# Uma ENTREGA sem frontmatter (sem `branch:`), não rastreada, não é o trabalho.
mkdir -p docs/entregas/t1
printf 'portao: pronto\n' > docs/entregas/t1/ENTREGA.md
caso "ENTREGA sem branch: nao decide"   mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin main')" 0
rm -rf docs/entregas/t1
fm_chave docs/entregas/trab/ENTREGA.md portao bloqueado
git add docs/entregas/trab/ENTREGA.md && git commit -qm "registra portao bloqueado"
echo '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"bloqueio"}}}' > .expx/hooks.json
caso "portao bloqueado barra"   mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin main')" 2
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
# Caminho relativo no fallback: `dirname .` e `.`, e a subida por dirname nunca
# chegava a `/` — laco infinito com cwd "." fora de repositorio (ou sem git). Cada
# caso roda em segundo plano com prazo de 5 s: o codigo antigo nao trava a suite,
# vira LACO e falha. <cwd> <arg> [sem-git]; imprime a raiz normalizada a partir de <cwd>.
raiz_com_prazo() {
  local saida="$SEMGIT_T.raiz" pid i
  (
    cd "$1" || exit 1
    if [ "${3:-}" = sem-git ]; then git() { return 127; }; fi
    expx_raiz "$2"
  ) > "$saida" 2>/dev/null &
  pid=$!
  for i in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; rm -f "$saida"; printf 'LACO'; return 0
  fi
  wait "$pid" 2>/dev/null
  (cd "$1" && norm "$(cat "$saida")"); rm -f "$saida"
}
mkdir -p "$SEMGIT_T/a/b"
valor "cwd '.' fora de repositorio termina"         "$(raiz_com_prazo "$SEMGIT_T" .)"   "$(norm "$SEMGIT_T")"
valor "cwd relativo 'a/b' fora de repositorio termina" "$(raiz_com_prazo "$SEMGIT_T" a/b)" "$(norm "$SEMGIT_T/a/b")"
valor "sem git, cwd '.' no subdiretorio: sobe ate a raiz" "$(raiz_com_prazo "$RAIZ_T/src/sub" . sem-git)" "$(norm "$RAIZ_T")"
valor "sem git, cwd relativo 'sub': sobe ate a raiz"   "$(raiz_com_prazo "$RAIZ_T/src" sub sem-git)"  "$(norm "$RAIZ_T")"
rm -rf "$SEMGIT_T/a"

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

# merge_em_andamento_com_ajuste <branch> — no cwd (repositorio da fixture de
# integracao): a main ganha um arquivo novo (src/da-base.ts) e muda um arquivo
# de cada task; na <branch> roda `git merge --no-ff --no-commit main`, a
# resolucao combina os dois lados e acrescenta um ajuste ao arquivo da task.
# Deixa MERGE_HEAD e a resolucao no indice, e grava as duas mensagens:
# msg-integracao.txt (Trabalho + Integra-base = SHA de MERGE_HEAD) e
# msg-integracao-com-task.txt (os mesmos trailers + Task).
merge_em_andamento_com_ajuste() {
  local b="$1" t="${1##*/}" sha
  fixture_switch_exato main main || return 1
  printf 'base muda a tarefa
' >> src/tarefa.ts
  printf 'base muda a outra
' >> src/outra.ts
  printf 'novo da base
' > src/da-base.ts
  git add src/tarefa.ts src/outra.ts src/da-base.ts && git commit -qm "a base avanca" || return 1
  fixture_switch_exato "$b" "$b" || return 1
  git merge -q --no-ff --no-commit main >/dev/null 2>&1 || return 1
  printf 'ajuste da resolucao
' >> src/tarefa.ts
  git add src/tarefa.ts || return 1
  sha="$(git rev-parse -q --verify MERGE_HEAD)" || return 1
  printf 'merge(mergex): integra a base

Trabalho: %s
Integra-base: %s
' "$t" "$sha" > msg-integracao.txt
  printf 'merge(mergex): integra a base

Task: T-01.01
Trabalho: %s
Integra-base: %s
' "$t" "$sha" > msg-integracao-com-task.txt
}

# Validade do portão: o push só segue com `portao: pronto` se o portão VALE
# para a revisão empurrada (validade-do-portao.sh). Os helpers montam o portão
# como o E2 e o checkpoint pre-e6 montam: `portao_sha` no ENTREGA.md commitado
# por um commit de método. O trabalho é o último segmento da branch
# (`feature/ft-02` => `ft-02`). Rodam no cwd (o repositório da fixture).
MSG_PORTAO="$SEMGIT_T/mensagem-portao"
metodo_commit() { # <trabalho> <assunto> — commita o índice como pre-e6
  printf '%s\n\nTrabalho: %s\nMetodo: pre-e6\n' "$2" "$1" > "$MSG_PORTAO" || return 1
  git commit -q -F "$MSG_PORTAO"
}
_portao_registra() { # <trabalho> <sha|-> — portao: pronto (+ portao_sha), commitado
  local e="docs/entregas/$1/ENTREGA.md"
  fm_chave "$e" portao pronto || return 1
  if [ "$2" = - ]; then fm_sem_chave "$e" portao_sha; else fm_chave "$e" portao_sha "$2"; fi || return 1
  git add -- "$e" && metodo_commit "$1" "docs(mergex): registra o portao"
}
portao_valido_com_metodo() { # <branch> — portão em HEAD, depois um commit só de método
  local t="${1##*/}"
  fixture_switch_exato "$1" "$1" || return 1
  _portao_registra "$t" "$(git rev-parse HEAD)" || return 1
  printf 'pacote do pr\n' >> "docs/entregas/$t/PR.md"
  git add -- "docs/entregas/$t/PR.md" && metodo_commit "$t" "docs(mergex): pacote do pr"
}
portao_vencido_por_merge() { # <branch> — portão válido, depois um merge da base
  portao_valido_com_metodo "$1" || return 1
  fixture_switch_exato main main || return 1
  printf 'a base avancou\n' >> src/base-avanca.ts
  git add src/base-avanca.ts && git commit -qm "a base avanca" || return 1
  fixture_switch_exato "$1" "$1" || return 1
  git merge -q --no-ff -m "integra a base" main
}
portao_sem_sha() { # <branch> — `portao: pronto` sem portao_sha (entrega legada)
  fixture_switch_exato "$1" "$1" || return 1
  _portao_registra "${1##*/}" -
}
portao_commita() { # <branch> <valor> — commita `portao: <valor>` (null, bloqueado)
  local t="${1##*/}" e
  e="docs/entregas/${1##*/}/ENTREGA.md"
  fixture_switch_exato "$1" "$1" || return 1
  fm_chave "$e" portao "$2" || return 1
  git add -- "$e" && metodo_commit "$t" "docs(mergex): registra portao $2"
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

# 4 — publicar o fechamento e push: o portao continua mandando, e o `pronto`
# precisa valer para a revisao empurrada (portao_sha + so commits de metodo)
git reset -q
portao_valido_com_metodo feature/ft-02 || exit 1
caso "publicacao do fechamento com portao pronto" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02')" 0
portao_commita feature/ft-02 bloqueado || exit 1
echo '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"bloqueio"}}}' > .expx/hooks.json
caso "publicacao do fechamento com portao bloqueado barra" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02')" 2

# 5 — forcar a publicacao do fechamento continua proibido
caso "fechamento final: push --force barra"            mergex/git-perigoso.sh "$(bash_json 'git push --force origin feature/ft-02')" 2
caso "fechamento final: push --force-with-lease barra" mergex/git-perigoso.sh "$(bash_json 'git push --force-with-lease origin feature/ft-02')" 2

git reset -q; rm -f .expx/hooks.json
git restore --worktree -- docs/entregas/ft-02/ENTREGA.md 2>/dev/null || true
fixture_switch_exato main main || exit 1

echo
echo "pr-so-com-portao — aviso antecipado (bloqueia so com prova)"
# DM-184 (spec 13.8): o hook do Claude e so aviso antecipado, nunca fronteira
# de seguranca. Bloqueia (exit 2) so o `git push` simples, lido sem ambiguidade
# no repositorio do cwd, cuja ref pr_decide_ref barra (a mesma regra do
# pre-push), e o `--no-verify` num push reconhecido. Comando composto, cwd que
# o Git nao le, refspec que nao resolve, validade que nao termina no orcamento:
# aviso e exit 0 — quem decide e o pre-push. Nenhuma varredura de branches.
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
mkdir -p .expx
modo_portao() { printf '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"%s"}}}\n' "$1" > .expx/hooks.json; }
PUSH_FT='git push origin feature/ft-02'
# saida_hook <json> [env...] — roda o hook; SAIDA_H (stderr) e RC_H
SAIDA_H=""; RC_H=""
saida_hook() {
  local json="$1"; shift
  SAIDA_H="$(printf '%s' "$json" | env "$@" bash "$H/mergex/pr-so-com-portao.sh" 2>&1 >/dev/null)"; RC_H=$?
}
# mensagem_cita <desc> <json> <trecho>... — o stderr do hook cita cada trecho
mensagem_cita() {
  local desc="$1" json="$2" t
  shift 2
  if [ "$SEM_JQ" = "1" ]; then PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "$desc"; return 0; fi
  saida_hook "$json"
  for t in "$@"; do
    case "$SAIDA_H" in
      *"$t"*) ;;
      *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (a mensagem nao cita: %s)\n' "$desc" "$t"; return 0 ;;
    esac
  done
  OK=$((OK+1)); printf '  ok    %s\n' "$desc"
}
# caso_aviso <desc> <json> [env...] — exit 0 COM o aviso do hook no stderr
AVISO_H='mergex/pr-so-com-portao — aviso'
caso_aviso() {
  local desc="$1" json="$2"
  shift 2
  if [ "$SEM_JQ" = "1" ]; then PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "$desc"; return 0; fi
  saida_hook "$json" "$@"
  case "$RC_H:$SAIDA_H" in
    0:*"$AVISO_H"*) OK=$((OK+1)); printf '  ok    %s\n' "$desc" ;;
    *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava exit 0 com aviso, obteve %s: %s)\n' "$desc" "$RC_H" "$(printf '%s' "$SAIDA_H" | head -1)" ;;
  esac
}
# caso_calado <desc> <json> — exit 0 sem nada no stderr (passa sem aviso)
caso_calado() {
  local desc="$1" json="$2"
  if [ "$SEM_JQ" = "1" ]; then PULADOS=$((PULADOS+1)); printf '  pulado %s (sem jq)\n' "$desc"; return 0; fi
  saida_hook "$json"
  if [ "$RC_H" = 0 ] && [ -z "$SAIDA_H" ]; then OK=$((OK+1)); printf '  ok    %s\n' "$desc"
  else FALHOU=$((FALHOU+1)); printf '  FALHA %s (esperava exit 0 calado, obteve %s: %s)\n' "$desc" "$RC_H" "$(printf '%s' "$SAIDA_H" | head -1)"; fi
}
# em_todos_os_modos <desc> <json> <exit> — aviso, bloqueio e desligado
em_todos_os_modos() {
  local m
  for m in aviso bloqueio desligado; do
    modo_portao "$m"
    caso "$1 [$m]" mergex/pr-so-com-portao.sh "$2" "$3"
  done
  modo_portao aviso
}
# em_todos_os_modos_avisa <desc> <json> — avisa e sai 0 em aviso e bloqueio
# (o hook nunca bloqueia o que nao prova); em desligado, calado
em_todos_os_modos_avisa() {
  modo_portao aviso;     caso_aviso "$1 [aviso]" "$2"
  modo_portao bloqueio;  caso_aviso "$1 [bloqueio]" "$2"
  modo_portao desligado; caso_calado "$1 [desligado]" "$2"
  modo_portao aviso
}

# Repositorio sem MergeX (branch dev), para os comandos que o citam
git -C "$SEMX_T" init -q -b dev . 2>/dev/null
git -C "$SEMX_T" config user.email teste@expx.local
git -C "$SEMX_T" config user.name Teste
printf 'x\n' > "$SEMX_T/x.txt"
git -C "$SEMX_T" add x.txt && git -C "$SEMX_T" commit -qm inicial

# ENTREGA de outro trabalho, mais recente e `pronto`, nao decide pela branch
# (ft-02, aqui com portao null commitado).
portao_commita feature/ft-02 null || exit 1
entrega outro feature/outro
fm_chave docs/entregas/outro/ENTREGA.md portao pronto
touch -t 203001010000 docs/entregas/outro/ENTREGA.md
modo_portao bloqueio
caso "entrega de outro trabalho mais recente nao libera" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
modo_portao aviso
caso_aviso "entrega de outro trabalho mais recente nao barra (null em aviso)" "$(bash_json "$PUSH_FT")"
rm -rf docs/entregas/outro

# ---------------------------------------------------------------------------
# Portao vencido por merge da base
# ---------------------------------------------------------------------------
portao_vencido_por_merge feature/ft-02 || exit 1
MERGE_T="$(git rev-parse HEAD)"
caso "portao vencido barra mesmo em aviso" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
em_todos_os_modos "push simples com portao vencido bloqueia" "$(bash_json "$PUSH_FT")" 2
mensagem_cita "portao vencido: a mensagem nomeia branch, motivo, primeiro commit e o E2" "$(bash_json "$PUSH_FT")" \
  feature/ft-02 commit_merge "$MERGE_T" /mergex-check
# Comando composto: o hook nao le o shell como fronteira; avisa e o pre-push decide
caso_aviso "comando composto avisa e sai 0: cd <repo> && git push" "$(bash_json "cd $HIST_T && $PUSH_FT")"
caso_aviso "comando composto avisa e sai 0: bash -c 'git push'"    "$(bash_json "bash -c '$PUSH_FT'")"
caso_aviso "comando composto avisa e sai 0: xargs git push"        "$(bash_json 'echo feature/ft-02 | xargs git push origin')"
mensagem_cita "comando composto: o aviso manda ao pre-push" "$(bash_json "cd $HIST_T && $PUSH_FT")" \
  "pre-push" "/mergex-check"
# Abertura de PR nao e push: o hook so le `git push`
caso_calado "nao e push: gh pr create"           "$(bash_json 'gh pr create --fill')"
caso_calado "nao e push: gh -R o/r pr create"    "$(bash_json 'gh -R o/r pr create --fill')"
caso_calado "nao e push: gh --repo o/r pr create" "$(bash_json 'gh --repo o/r pr create')"
caso_calado "nao e push: gh pr new"              "$(bash_json 'gh pr new --fill')"
caso_calado "nao e push: glab mr new"            "$(bash_json 'glab mr new --fill')"
# Outras formas de publicar: avisam
caso_aviso "send-pack avisa"                     "$(bash_json 'git send-pack origin refs/heads/feature/ft-02')"
caso_aviso "subtree push avisa"                  "$(bash_json 'git subtree push --prefix src origin feature/ft-02')"
caso_aviso "/usr/lib/git-core/git-push avisa"    "$(bash_json '/usr/lib/git-core/git-push origin feature/ft-02')"
caso_aviso "\"\$(git --exec-path)\"/git-push avisa" "$(bash_json '"$(git --exec-path)"/git-push origin feature/ft-02')"
caso_aviso "git-send-pack avisa"                 "$(bash_json 'git-send-pack origin refs/heads/feature/ft-02')"
caso_calado "git-subtree --help nao publica"     "$(bash_json "'/usr/lib/git-core/git-subtree' --help")"
caso_calado "sem push: npm run git-push-notifications" "$(bash_json 'npm run git-push-notifications')"
# Tag com o mesmo nome da branch: a origem HEAD e a branch atual, sem ambiguidade
git tag feature/ft-02 main >/dev/null 2>&1
caso "tag homonima da branch: push -u origin HEAD barra" mergex/pr-so-com-portao.sh "$(bash_json 'git push -u origin HEAD')" 2
caso_aviso "tag homonima da branch: refspec ambiguo avisa" "$(bash_json 'git push origin feature/ft-02')"
git tag -d feature/ft-02 >/dev/null 2>&1
# Um .git que nao se resolve: o hook avisa (antes, barrava)
mkdir -p "$SEMGIT_T/quebrado"
printf 'gitdir: %s/nao-existe\n' "$SEMGIT_T" > "$SEMGIT_T/quebrado/.git"
HOOK_CWD="$SEMGIT_T"
caso_aviso "repositorio com .git que nao se resolve avisa" "$(bash_json "cd $SEMGIT_T/quebrado && git push origin feature/ft-02")"
HOOK_CWD="$SEMGIT_T/quebrado"
caso_aviso "cwd com .git que nao se resolve avisa"         "$(bash_json 'git push origin feature/ft-02')"
HOOK_CWD="$SEMGIT_T"
caso_aviso "fora de repositorio: git push avisa"           "$(bash_json 'git push')"
HOOK_CWD="$HIST_T"
rm -rf "$SEMGIT_T/quebrado"
entrega outro feature/outro
touch -t 203001010000 docs/entregas/outro/ENTREGA.md
caso "vencido: entrega de outro trabalho mais recente nao libera" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
rm -rf docs/entregas/outro

# O disco nunca decide: o ENTREGA da ponta da branch vale
fm_chave docs/entregas/ft-02/ENTREGA.md portao null
caso "disco null com a ponta pronto vencida barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
fm_chave docs/entregas/ft-02/ENTREGA.md portao bloqueado
caso "disco bloqueado com a ponta pronto vencida barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
fixture_restaurar_tracked docs/entregas/ft-02/ENTREGA.md || exit 1
rm -f docs/entregas/ft-02/ENTREGA.md
caso "ENTREGA removido do disco: a ponta vencida barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
fixture_restaurar_tracked docs/entregas/ft-02/ENTREGA.md || exit 1
entrega falso feature/ft-02
caso "ENTREGA falso nao rastreado na mesma branch nao muda nada" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
rm -rf docs/entregas/falso

# Formas que o hook nao le sem ambiguidade: avisam em qualquer modo (o
# desligado silencia), nunca bloqueiam
em_todos_os_modos_avisa "git -C . push"               "$(bash_json 'git -C . push origin feature/ft-02')"
em_todos_os_modos_avisa "git -c k=v push"             "$(bash_json 'git -c core.x=y push origin feature/ft-02')"
em_todos_os_modos_avisa "git --work-tree . push"      "$(bash_json 'git --work-tree . push origin feature/ft-02')"
em_todos_os_modos_avisa "sh -c 'git push'"            "$(bash_json "sh -c 'git push'")"
em_todos_os_modos_avisa "push de tags; \\git push"    "$(bash_json 'git push origin --tags; \git push origin feature/ft-02')"
em_todos_os_modos_avisa "-c remote.origin.push="      "$(bash_json 'git -c remote.origin.push=refs/heads/feature/ft-02:refs/heads/feature/ft-02 push origin')"
git tag v1 >/dev/null 2>&1
caso_aviso "push de tag && /usr/bin/git push"     "$(bash_json 'git push origin v1 && /usr/bin/git push origin feature/ft-02')"
caso_aviso "push benigno && find -exec git push"  "$(bash_json 'git push origin main && find . -maxdepth 0 -exec git push origin feature/ft-02 \;')"
caso_aviso "push benigno; flock git push"         "$(bash_json 'git push origin main; flock /tmp/l git push origin feature/ft-02')"
caso_aviso "(cd outro); git push"                 "$(bash_json "(cd $SEMX_T); git push origin")"
caso_aviso "false && cd outro; git push"          "$(bash_json "false && cd $SEMX_T; git push")"
caso_aviso "funcao que empurra"                   "$(bash_json 'f(){ git push origin feature/ft-02; }; f')"
caso_aviso "prefixo de ambiente qualquer"         "$(bash_json "FOO=1 $PUSH_FT")"
caso_aviso "push com mais de uma linha"           "$(bash_json "git status
$PUSH_FT")"
caso_aviso "refspec entre aspas"                  "$(bash_json 'git push origin "feature/ft-02"')"
caso_aviso "push --all"                           "$(bash_json 'git push --all origin')"
caso_aviso "push --dry-run"                       "$(bash_json 'git push --dry-run origin feature/ft-02')"

# Citacao e outros programas: calados (o gatilho e o git como programa)
caso_calado "echo push nao e push"                "$(bash_json 'echo push')"
caso_calado "git log --grep push nao e push"      "$(bash_json 'git log --grep push')"
caso_calado "push de outra branch (nao aplicavel) passa" "$(bash_json 'git push origin main')"
caso_calado "sem push: git status"                "$(bash_json 'git status')"
caso_calado "sem push: npm run push-notifications" "$(bash_json 'npm run push-notifications')"
caso_calado "sem push: docker push"               "$(bash_json 'docker push img')"

# Outra arvore, outro diretorio, primeiro trabalho MergeX
fixture_switch_exato main main || exit 1
git worktree add -q "$WTM_T" -b fixture-main-wt main >/dev/null 2>&1 || exit 1
git worktree add -q "$WTB_T" -b fixture-sem-entregas "$(git rev-list --max-parents=0 HEAD)" >/dev/null 2>&1 || exit 1
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
HOOK_CWD="$WTM_T"
caso "cwd em outra branch: push da branch vencida barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
caso_aviso "xargs acrescenta o refspec"         "$(bash_json 'echo feature/ft-02 | xargs git push origin')"
caso_aviso "-c remote.origin.push= da main"     "$(bash_json 'git -c remote.origin.push=refs/heads/feature/ft-02:refs/heads/feature/ft-02 push origin')"
caso_aviso "cd com expansao && push"            "$(bash_json "cd \$DIR_X && $PUSH_FT")"
git -C "$WTM_T" config remote.origin.push refs/heads/feature/ft-02:refs/heads/feature/ft-02
caso_aviso "remote.origin.push configurado: push sem refspec avisa" "$(bash_json 'git push origin')"
git -C "$WTM_T" config --unset remote.origin.push
HOOK_CWD="$WTB_T"
[ ! -e "$WTB_T/docs/entregas" ] && caso "controle: o HEAD da arvore nao tem docs/entregas" mergex/pr-so-com-portao.sh "$(bash_json 'git status')" 0
caso "sem entregas no HEAD: push simples da branch vencida barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
caso_aviso "sem entregas no HEAD: funcao"       "$(bash_json 'f(){ git push origin feature/ft-02; }; f')"
caso_aviso "sem entregas no HEAD: ./git push"   "$(bash_json './git push origin feature/ft-02')"
caso_aviso "sem entregas no HEAD: GIT_DIR=x git push" "$(bash_json 'GIT_DIR=x git push origin feature/ft-02')"
caso_aviso "sem entregas no HEAD: xargs -I"     "$(bash_json 'echo feature/ft-02 | xargs -I{} git push origin {}')"
# Diretorio de outro repositorio citado no comando: avisa
HOOK_CWD="$SEMGIT_T"
caso_aviso "fora de repositorio: cd literal && push"   "$(bash_json "cd $HIST_T && $PUSH_FT")"
caso_aviso "fora de repositorio: git -C <dir> push"    "$(bash_json "git -C $HIST_T push origin feature/ft-02")"
caso_aviso "fora de repositorio: env -C <dir> git push" "$(bash_json "env -C $HIST_T git push origin feature/ft-02")"
caso_aviso "fora de repositorio: GIT_DIR=<dir>/.git"   "$(bash_json "GIT_DIR=$HIST_T/.git git push origin feature/ft-02")"
caso_aviso "fora de repositorio: --git-dir=<dir>/.git" "$(bash_json "git --git-dir=$HIST_T/.git push origin feature/ft-02")"
HOOK_CWD="$SEMX_T"
caso_aviso "repo sem MergeX: env -C <dir vencido> git push" "$(bash_json "env -C $HIST_T git push")"
caso_calado "repo sem MergeX: push proprio passa"           "$(bash_json 'git push origin dev')"
caso_aviso "repo sem MergeX: cd -- <wt> && push"           "$(bash_json "cd -- $WTM_T && $PUSH_FT")"
caso_aviso "repo sem MergeX: cd -P <wt> && push"           "$(bash_json "cd -P $WTM_T && $PUSH_FT")"
caso_aviso "repo sem MergeX: cd -L <wt>; push"             "$(bash_json "cd -L $WTM_T; $PUSH_FT")"
caso_aviso "repo sem MergeX: cd -eP -- <wt> && push"       "$(bash_json "cd -eP -- $WTM_T && $PUSH_FT")"
caso_aviso "repo sem MergeX: pushd -n <wt> && push"        "$(bash_json "pushd -n $WTM_T && $PUSH_FT")"
PAI_WTM="$(dirname "$WTM_T")"; BASE_WTM="$(basename "$WTM_T")"; BASE_HIST="$(basename "$HIST_T")"
caso_aviso "git -C <pai> -C <wt> push"            "$(bash_json "git -C $PAI_WTM -C $BASE_WTM push origin feature/ft-02")"
caso_aviso "git -C .. -C <wt> push"               "$(bash_json "git -C .. -C $BASE_WTM push origin feature/ft-02")"
caso_aviso "cd <pai> && GIT_DIR=<repo>/.git push" "$(bash_json "cd $PAI_WTM && GIT_DIR=$BASE_HIST/.git git push origin feature/ft-02")"
caso_aviso "cd .. && cd <wt> && push"             "$(bash_json "cd .. && cd $BASE_WTM && $PUSH_FT")"
caso_aviso "cd <pai> && cd <wt> && push"          "$(bash_json "cd $PAI_WTM && cd $BASE_WTM && $PUSH_FT")"
caso_aviso "cd <pai>; git -C <wt> push"           "$(bash_json "cd $PAI_WTM; git -C $BASE_WTM push origin feature/ft-02")"
caso_aviso "cd <pai> && git --git-dir=<repo>/.git push" "$(bash_json "cd $PAI_WTM && git --git-dir=$BASE_HIST/.git push origin feature/ft-02")"
caso_aviso "cd <pai> && env -C <wt> git push"     "$(bash_json "cd $PAI_WTM && env -C $BASE_WTM git push origin feature/ft-02")"
caso_aviso "cd / && cd <relativo> && push"        "$(bash_json "cd / && cd ${WTM_T#/} && $PUSH_FT")"
caso_aviso "cd / && cd ~/<wt> && push"            "$(bash_json "cd / && cd ~/$BASE_WTM && $PUSH_FT")"
caso_aviso "cd && cd <wt> && push"                "$(bash_json "cd && cd $BASE_WTM && $PUSH_FT")"
caso_aviso "GIT_DIR=~/<repo>/.git push"           "$(bash_json "GIT_DIR=~/$BASE_HIST/.git git push origin feature/ft-02")"
caso_aviso "( cd X ); git push"                   "$(bash_json "( cd $WTM_T ); git push origin feature/ft-02")"
GD_WTM="$(git -C "$WTM_T" rev-parse --absolute-git-dir)"
HOOK_CWD="$SEMGIT_T"
caso_aviso "fora de repositorio: GIT_DIR=<gitdir de worktree vinculada>"     "$(bash_json "GIT_DIR=$GD_WTM git push origin feature/ft-02")"
caso_aviso "fora de repositorio: --git-dir=<gitdir de worktree vinculada>"   "$(bash_json "git --git-dir=$GD_WTM push origin feature/ft-02")"
HOOK_CWD="$HIST_T"
git worktree remove --force "$WTM_T" || exit 1
git worktree remove --force "$WTB_T" || exit 1
git branch -q -D fixture-main-wt fixture-sem-entregas

# cwd que nao e repositorio, em forma UNC: aviso rapido, sem laco de subida de
# diretorio (`dirname //` e `//` em alguns sistemas); tempo por agora_ms
for CWD_UNC in '//' '//wsl.localhost/mergex-nao-existe/x'; do
  HOOK_CWD="$CWD_UNC"
  T0_UNC="$(agora_ms)"
  caso_aviso "cwd UNC sem repositorio nao entra em laco ($CWD_UNC)" "$(bash_json "$PUSH_FT")"
  MS_UNC=$(( $(agora_ms) - T0_UNC ))
  valor "cwd UNC sem repositorio: termina em menos de $LIMITE_TXT ($CWD_UNC, ${MS_UNC} ms)" "$([ "$MS_UNC" -lt "$LIMITE_MS" ] && echo sim || echo nao)" sim
done
HOOK_CWD="$HIST_T"

# dubious ownership: o Git recusa o repositorio do cwd (dono diferente, sem
# safe.directory). Config global VAZIA e temporaria, e a de SISTEMA desligada:
# com safe.directory=* na config de sistema (o runner do GitHub falhou aqui por
# isso) o Git aceita o repositorio e o caso nao mede nada. So no processo do hook.
GLOBAL_VAZIA_T="$SEMGIT_T/global-vazia"
: > "$GLOBAL_VAZIA_T"
caso_aviso "dubious ownership avisa e sai 0" "$(bash_json "$PUSH_FT")" \
  GIT_CONFIG_GLOBAL="$GLOBAL_VAZIA_T" GIT_CONFIG_NOSYSTEM=1 GIT_TEST_ASSUME_DIFFERENT_OWNER=1
case "$SAIDA_H" in
  *safe.directory*) OK=$((OK+1)); printf '  ok    %s\n' "dubious ownership: o aviso cita safe.directory na config global" ;;
  *) FALHOU=$((FALHOU+1)); printf '  FALHA %s\n' "dubious ownership: o aviso nao cita safe.directory" ;;
esac
GIT_CONFIG_GLOBAL="$GLOBAL_VAZIA_T" GIT_CONFIG_NOSYSTEM=1 GIT_TEST_ASSUME_DIFFERENT_OWNER=1 git -C "$HIST_T" rev-parse --show-toplevel >/dev/null 2>&1 \
  && { FALHOU=$((FALHOU+1)); printf '  FALHA %s\n' "controle: o Git aceitou o repositorio com dono diferente"; } \
  || { OK=$((OK+1)); printf '  ok    %s\n' "controle: o Git recusa o repositorio (dubious ownership)"; }

# Entrega legada: pronto sem portao_sha nunca libera
portao_sem_sha feature/ft-02 || exit 1
caso "pronto legado sem portao_sha barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
mensagem_cita "pronto legado: a mensagem nomeia portao_sha_ausente" "$(bash_json "$PUSH_FT")" portao_sha_ausente /mergex-check

# ---------------------------------------------------------------------------
# Portao valido seguido so de commit de metodo: o uso comum passa
# ---------------------------------------------------------------------------
portao_valido_com_metodo feature/ft-02 || exit 1
caso "portao valido com commit so de metodo libera" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 0
caso_calado "push simples com portao valido passa" "$(bash_json "$PUSH_FT")"
for C in 'git push' 'git push -u origin feature/ft-02' 'git push origin HEAD:feature/ft-02' \
         'git push origin HEAD:refs/heads/feature/ft-02' 'git push origin feature/ft-02:feature/ft-02' \
         'git push origin refs/heads/feature/ft-02' 'git push -o main origin feature/ft-02' \
         'git push -uo main origin feature/ft-02' 'git push origin main' 'git push origin v1' \
         'git push origin :feature/velha' 'git push --follow-tags origin feature/ft-02' \
         'git commit -m "antes do git push"' 'echo "git push origin feature/ft-02"' \
         'grep -rn "git push origin feature/ft-02" .' 'gh pr create --body "rode git push origin feature/ft-02"' \
         'find . -maxdepth 0 -exec echo git push \;'; do
  caso_calado "portao valido: $C" "$(bash_json "$C")"
done
for C in 'git -C . push origin feature/ft-02' "sh -c 'git push'" 'gh pr create --fill' 'gh -R o/r pr create --fill' \
         'gh pr new --fill' 'glab mr new --fill' 'git push --tags' 'git push --all origin' \
         'GIT_DIR=.git git push origin feature/ft-02' 'cd $DIR_X && git push origin feature/ft-02' \
         "cd $HIST_T && git push origin feature/ft-02" 'echo push' 'git log --grep push' 'docker push img' \
         '/usr/lib/git-core/git-push origin feature/ft-02' '"$(git --exec-path)"/git-push origin feature/ft-02' \
         "cd -P $HIST_T && git push origin feature/ft-02" "cd -- $HIST_T && git push origin feature/ft-02"; do
  caso "portao valido: $C" mergex/pr-so-com-portao.sh "$(bash_json "$C")" 0
done

# --no-verify num push reconhecido: bloqueia em qualquer modo (o pre-push
# seria pulado; o CI e a barreira contra esse contorno)
caso "--no-verify reconhecido bloqueia"                    mergex/pr-so-com-portao.sh "$(bash_json 'git push --no-verify origin feature/ft-02')" 2
em_todos_os_modos "--no-verify no fim do push bloqueia"    "$(bash_json 'git push origin feature/ft-02 --no-verify')" 2
caso "--no-verify em comando composto bloqueia"            mergex/pr-so-com-portao.sh "$(bash_json "cd $HIST_T && git push --no-verify origin feature/ft-02")" 2
caso "--no-verify dentro de sh -c bloqueia"                mergex/pr-so-com-portao.sh "$(bash_json "sh -c 'git push --no-verify'")" 2
caso "--no-verify com /usr/bin/git bloqueia"               mergex/pr-so-com-portao.sh "$(bash_json '/usr/bin/git push --no-verify origin feature/ft-02')" 2
caso "--no-verify com opcao global bloqueia"               mergex/pr-so-com-portao.sh "$(bash_json 'git -c core.x=y push --no-verify')" 2
caso "--no-verify com git-push bloqueia"                   mergex/pr-so-com-portao.sh "$(bash_json '/usr/lib/git-core/git-push --no-verify origin feature/ft-02')" 2
caso "--no-verify fora de repositorio bloqueia"            mergex/pr-so-com-portao.sh "$(jq -cn --arg c 'git push --no-verify' --arg w "$SEMGIT_T" '{tool_name:"Bash",cwd:$w,tool_input:{command:$c}}')" 2
mensagem_cita "--no-verify: a mensagem explica o pre-push pulado e o CI" "$(bash_json 'git push --no-verify origin feature/ft-02')" \
  "--no-verify" "pula" "pre-push" "CI" "/mergex-check"
caso_calado "--no-verify em git commit nao e push"         "$(bash_json 'git commit --no-verify -m x')"
caso_calado "git log --grep=--no-verify nao bloqueia"      "$(bash_json 'git log --grep=--no-verify')"
# Prefixos unicos que o Git aceita para --no-verify (--no-ver colide com
# --no-verbose e o proprio Git recusa)
caso "prefixo --no-verif bloqueia"                         mergex/pr-so-com-portao.sh "$(bash_json 'git push --no-verif origin feature/ft-02')" 2
caso "prefixo --no-veri bloqueia"                          mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02 --no-veri')" 2
mensagem_cita "prefixo --no-verif: a mesma mensagem do --no-verify" "$(bash_json 'git push --no-verif origin feature/ft-02')" \
  "push com --no-verify barrado" "pre-push" "CI"
caso_aviso "--no-ver (ambiguo para o Git) nao bloqueia: avisa" "$(bash_json 'git push --no-ver origin feature/ft-02')"
# Formas reais de push com --no-verify: bloqueiam
for C in 'git push --no-verify' 'git push origin x --no-verify&' '(git push --no-verify)' 'git push --no-verify|cat' \
         '{ git push --no-verify; }' 'time git push --no-verify' 'command git push --no-verify' 'nice -n 5 git push --no-verify' \
         'git push "--no-verify"' 'git push --no-""verify' 'bash -c "git push --no-verify"' 'git push origin x --no-verify 2>&1' \
         'git --no-pager push --no-verify' 'GIT_TRACE=1 git push --no-verify' 'git push -n --no-verify'; do
  caso "forma real de push com --no-verify bloqueia: $C" mergex/pr-so-com-portao.sh "$(bash_json "$C")" 2
done
# Citacao do --no-verify em comando que nao publica: calado, nunca bloqueia
for C in 'git commit -m "docs: o hook barra git push --no-verify"' 'git log --grep "git push --no-verify"' \
         'git tag -a v9 -m "nunca git push --no-verify"' 'gh pr create --body "nao use git push --no-verify"' \
         'echo "git push --no-verify"' 'grep -rn "git push --no-verify" .'; do
  caso_calado "nao publica, so cita --no-verify: $C" "$(bash_json "$C")"
done

# Origem explicita: a validade roda sobre o SHA enviado
fixture_switch_exato fixture-produto -c fixture-produto || exit 1
printf 'produto solto\n' > src/solto.ts
git add src/solto.ts && git commit -qm "feat: produto solto" || exit 1
SHA_PROD="$(git rev-parse HEAD)"
fixture_switch_exato feature/ft-02 feature/ft-02 || exit 1
git branch -q -D fixture-produto
caso "origem explicita: <sha de produto>:feature/ft-02 barra" mergex/pr-so-com-portao.sh "$(bash_json "git push origin $SHA_PROD:feature/ft-02")" 2
mensagem_cita "origem explicita: a mensagem nomeia a origem, o motivo e o E2" "$(bash_json "git push origin $SHA_PROD:feature/ft-02")" \
  "$SHA_PROD" commit_de_produto /mergex-check
modo_portao desligado
caso "origem explicita: barra tambem em desligado" mergex/pr-so-com-portao.sh "$(bash_json "git push origin $SHA_PROD:refs/heads/feature/ft-02")" 2
modo_portao aviso
caso "origem explicita: HEAD~1:refs/heads/feature/ft-02 validada pela origem" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin HEAD~1:refs/heads/feature/ft-02')" 0
caso "origem explicita: feature/ft-02:feature/ft-02 ok" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin feature/ft-02:feature/ft-02')" 0
caso "origem explicita: SHA da propria ponta ok" mergex/pr-so-com-portao.sh "$(bash_json "git push origin $(git rev-parse HEAD):feature/ft-02")" 0
caso "origem explicita: outra branch (main) barra" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin main:feature/ft-02')" 2
caso_aviso "origem explicita que nao se resolve avisa (o git recusa sozinho)" "$(bash_json 'git push origin nao-existe:feature/ft-02')"
# A ponta da branch decide, nao o HEAD de outra arvore
git branch -q fixture-vencida HEAD
git worktree add -q "$WTX_T" fixture-vencida >/dev/null 2>&1 || exit 1
printf 'produto na outra arvore\n' > "$WTX_T/src/outra-arvore.ts"
git -C "$WTX_T" add src/outra-arvore.ts && git -C "$WTX_T" commit -qm "feat: produto na outra arvore" || exit 1
HOOK_CWD="$WTX_T"
caso "outra arvore com HEAD vencido nao decide pela ponta valida" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 0
HOOK_CWD="$HIST_T"
git worktree remove --force "$WTX_T" || exit 1
git branch -q -D fixture-vencida

# Commit de produto depois do portao: vencido
printf 'produto depois do portao\n' > src/depois.ts
git add src/depois.ts && git commit -qm "feat: produto depois do portao" || exit 1
caso "produto depois do portao barra o push da branch" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
mensagem_cita "produto depois do portao: commit_de_produto no proprio commit" "$(bash_json "$PUSH_FT")" \
  commit_de_produto "$(git rev-parse HEAD)"
modo_portao bloqueio
caso "portao vencido em bloqueio tambem barra"     mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
# o modo nunca afrouxa o portao vencido (a mesma regra do pre-push)
modo_portao desligado
caso "desligado nao pula a validade do portao"     mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2

# null e bloqueado (commitados): pr_decide_ref decide, como no pre-push
portao_commita feature/ft-02 null || exit 1
modo_portao aviso
caso_aviso "null em aviso: avisa e passa"                "$(bash_json "$PUSH_FT")"
caso_aviso "null em aviso: push --all avisa"             "$(bash_json 'git push --all origin')"
modo_portao bloqueio
caso "null em bloqueio: barra"                          mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
caso "null em bloqueio: push de outra branch nao e do trabalho" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin main')" 0
caso "null em bloqueio: citacao nao e push da branch"   mergex/pr-so-com-portao.sh "$(bash_json 'echo push')" 0
caso "null em bloqueio: grep 'gh pr create' nao e PR"   mergex/pr-so-com-portao.sh "$(bash_json "grep -n 'gh pr create' README.md")" 0
caso "null em bloqueio: gh pr create nao e push"        mergex/pr-so-com-portao.sh "$(bash_json 'gh pr create --fill')" 0
modo_portao desligado
caso_calado "null com o hook desligado: nao age"        "$(bash_json "$PUSH_FT")"
portao_commita feature/ft-02 bloqueado || exit 1
modo_portao bloqueio
caso "bloqueado em bloqueio: barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
modo_portao aviso
caso "bloqueado em aviso: barra (o modo so vale para null)" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
# o disco pronto nao promove nada: vale o bloqueado da ponta
fm_chave docs/entregas/ft-02/ENTREGA.md portao pronto
modo_portao bloqueio
caso "disco pronto com a ponta bloqueada: barra" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
fixture_restaurar_tracked docs/entregas/ft-02/ENTREGA.md || exit 1
modo_portao aviso

# ---------------------------------------------------------------------------
# Instalacao: as regras ao lado dos hooks, e a validade substituida
# ---------------------------------------------------------------------------
portao_valido_com_metodo feature/ft-02 || exit 1
caso "controle: portao valido de novo libera"      mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 0
INST_R="$SEMGIT_T/instalacao/.claude"
INST_T="$INST_R/hooks"
mkdir -p "$INST_T/comum" "$INST_T/mergex"
cp "$H/comum/base.sh" "$INST_T/comum/base.sh"
cp "$H/mergex/pr-so-com-portao.sh" "$INST_T/mergex/pr-so-com-portao.sh"
H_REAL="$H"; H="$INST_T"
caso_aviso "regras ausentes ao lado dos hooks: avisa" "$(bash_json "$PUSH_FT")"
mensagem_cita "regras ausentes: o aviso nomeia portao-regras.sh" "$(bash_json "$PUSH_FT")" portao-regras.sh
caso "regras ausentes: --no-verify continua barrado" mergex/pr-so-com-portao.sh "$(bash_json 'git push --no-verify origin feature/ft-02')" 2

# Com os scripts da skill copiados, a validade vira um substituto
mkdir -p "$INST_R/skills/mergex"
cp -R "$REPO_ROOT/.claude/skills/mergex/scripts" "$INST_R/skills/mergex/scripts"
STUB_T="$INST_R/skills/mergex/scripts/validade-do-portao.sh"
CHAMADAS_T="$SEMGIT_T/chamadas-validade"
# O hook passa --rev com o SHA enviado (a ponta da branch empurrada)
cat > "$STUB_T" <<'STUB'
#!/usr/bin/env bash
esperado="$(git rev-parse HEAD)"; rev=""
while [ "$#" -gt 0 ]; do case "$1" in --rev) rev="${2:-}"; shift 2 ;; *) shift ;; esac; done
[ "$rev" = "$esperado" ] && { printf 'ok=true\nprimeiro_commit=-\n'; exit 0; }
printf 'ok=false\nmotivo=commit_de_produto\nprimeiro_commit=-\n'; exit 1
STUB
caso_calado "o hook passa --rev com a ponta (push)"       "$(bash_json "$PUSH_FT")"
caso "o hook passa --rev com a origem explicita: HEAD~1 barra pelo substituto" mergex/pr-so-com-portao.sh "$(bash_json 'git push origin HEAD~1:refs/heads/feature/ft-02')" 2
printf '#!/usr/bin/env bash\nprintf "ok=false\\nmotivo=erro_ambiente\\nprimeiro_commit=-\\naviso=sem git\\n"; exit 1\n' > "$STUB_T"
caso_aviso "validade com erro_ambiente avisa (nao prova nada)" "$(bash_json "$PUSH_FT")"
printf '#!/usr/bin/env bash\nexit 64\n' > "$STUB_T"
caso_aviso "validade com uso invalido avisa"          "$(bash_json "$PUSH_FT")"
printf '#!/usr/bin/env bash\nprintf "ok=true\\nprimeiro_commit=-\\n"; exit 1\n' > "$STUB_T"
caso_aviso "validade ok=true com rc 1 avisa"          "$(bash_json "$PUSH_FT")"
printf '#!/usr/bin/env bash\nprintf "ok=false\\nmotivo=commit_de_produto\\nprimeiro_commit=-\\n"; exit 1\n' > "$STUB_T"
caso "validade ok=false barra (prova)"                mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2

# Sem `timeout` funcional: avisa sem chamar a validade
: > "$CHAMADAS_T"
printf '#!/usr/bin/env bash\necho x >> %s\nprintf "ok=true\\nprimeiro_commit=-\\n"; exit 0\n' "$CHAMADAS_T" > "$STUB_T"
SEM_TIMEOUT_T="$SEMGIT_T/sem-timeout"
mkdir -p "$SEM_TIMEOUT_T"
IFS=: read -r -a DIRS_PATH_T <<<"$PATH"
for D_T in "${DIRS_PATH_T[@]}"; do
  case "$D_T" in /mnt/*|'') continue ;; esac   # WSL: pastas do Windows (lentas)
  for F_T in "$D_T"/*; do
    N_T="${F_T##*/}"
    case "$N_T" in timeout|gtimeout) continue ;; esac
    [ -x "$F_T" ] && [ ! -e "$SEM_TIMEOUT_T/$N_T" ] && ln -s "$F_T" "$SEM_TIMEOUT_T/$N_T"
  done
done
valor "controle: o PATH da bancada nao tem timeout" "$(PATH="$SEM_TIMEOUT_T" command -v timeout || echo ausente)" ausente
caso_aviso "sem timeout no PATH: avisa e sai 0" "$(bash_json "$PUSH_FT")" PATH="$SEM_TIMEOUT_T"
valor "sem timeout no PATH: a validade nao e chamada" "$(wc -l < "$CHAMADAS_T" | tr -d ' ')" 0
# um `timeout` que nao mata (so executa o comando) nao e funcional
printf '#!/usr/bin/env bash\n[ "$1" = -k ] && shift 2\nshift\nexec "$@"\n' > "$SEM_TIMEOUT_T/timeout"
chmod +x "$SEM_TIMEOUT_T/timeout"
caso_aviso "timeout que nao mata: avisa e sai 0" "$(bash_json "$PUSH_FT")" PATH="$SEM_TIMEOUT_T"
valor "timeout que nao mata: a validade nao e chamada" "$(wc -l < "$CHAMADAS_T" | tr -d ' ')" 0
rm -rf "$SEM_TIMEOUT_T"

# hook nao varre branches: 50 branches entregues com `pronto`, uma validade so
BASE_50="$(git rev-parse main)"
I_T=1
while [ "$I_T" -le 50 ]; do
  B_T="$(printf -- '---\nexpx_schema: 1\nexpx_tool: sprintx\nkind: entrega\ntrabalho_id: b%s\nentregue_por: mergex\nbranch: feature/b%s\nbranch_base: main\nportao: pronto\nportao_sha: %s\n---\n' "$I_T" "$I_T" "$BASE_50" | git hash-object -w --stdin)" || exit 1
  rm -f "$SEMGIT_T/idx-50"
  GIT_INDEX_FILE="$SEMGIT_T/idx-50" git read-tree "$BASE_50" || exit 1
  GIT_INDEX_FILE="$SEMGIT_T/idx-50" git update-index --add --cacheinfo "100644,$B_T,docs/entregas/b$I_T/ENTREGA.md" || exit 1
  C_T="$(git commit-tree "$(GIT_INDEX_FILE="$SEMGIT_T/idx-50" git write-tree)" -p "$BASE_50" -m "entrega b$I_T")" || exit 1
  git update-ref "refs/heads/feature/b$I_T" "$C_T" || exit 1
  I_T=$((I_T + 1))
done
rm -f "$SEMGIT_T/idx-50"
valor "controle: 50 branches entregues com portao pronto" "$(git for-each-ref --format=x 'refs/heads/feature/b*' | wc -l | tr -d ' ')" 50
: > "$CHAMADAS_T"
caso_calado "hook nao varre branches: push da branch valida passa" "$(bash_json "$PUSH_FT")"
valor "hook nao varre branches: no maximo uma chamada da validade" "$([ "$(wc -l < "$CHAMADAS_T" | tr -d ' ')" -le 1 ] && echo sim || echo "nao: $(wc -l < "$CHAMADAS_T" | tr -d ' ')")" sim
: > "$CHAMADAS_T"
caso_calado "hook nao varre branches: push de outra branch calado" "$(bash_json 'git push origin main')"
valor "hook nao varre branches: ref nao aplicavel, nenhuma chamada" "$(wc -l < "$CHAMADAS_T" | tr -d ' ')" 0
for I_T in $(git for-each-ref --format='%(refname)' 'refs/heads/feature/b*'); do git update-ref -d "$I_T"; done

# validade lenta nao segura o comando: a substituta dorme 120 s; o hook sai 0
# com aviso dentro do orcamento, sem processo orfao; e o push real seguinte e
# barrado pelo pre-push (que usa a validade de verdade)
printf 'produto vencido para o push real\n' > src/lento.ts
git add src/lento.ts && git commit -qm "feat: produto para o push real" || exit 1
printf '#!/usr/bin/env bash\nsleep 3119\nprintf "ok=true\\nprimeiro_commit=-\\n"; exit 0\n' > "$STUB_T"
T0_LENTO="$(agora_ms)"
caso_aviso "validade lenta nao segura o comando: avisa e sai 0" "$(bash_json "$PUSH_FT")"
DUR_LENTO=$(( $(agora_ms) - T0_LENTO ))
valor "validade lenta nao segura o comando: menos de 9 s (${DUR_LENTO} ms)" "$([ "$DUR_LENTO" -lt 9000 ] && echo sim || echo nao)" sim
case "$SAIDA_H" in
  *"orçamento de 8 s"*) OK=$((OK+1)); printf '  ok    %s\n' "validade lenta: o aviso nomeia o orcamento de 8 s" ;;
  *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (%s)\n' "validade lenta: o aviso nao nomeia o orcamento" "$(printf '%s' "$SAIDA_H" | head -1)" ;;
esac
N_T=0; while [ "$N_T" -lt 5 ] && pgrep -f '^sleep 3119$' >/dev/null 2>&1; do sleep 1; N_T=$((N_T + 1)); done
if pgrep -f '^sleep 3119$' >/dev/null 2>&1; then
  FALHOU=$((FALHOU+1)); printf '  FALHA %s\n' "validade lenta: processo orfao da validade"; pkill -f '^sleep 3119$'
else OK=$((OK+1)); printf '  ok    %s\n' "validade lenta: nenhum processo orfao"; fi
H="$H_REAL"
REMOTO_LENTO_T="$SEMGIT_T/remoto-lento.git"
git init -q --bare "$REMOTO_LENTO_T"
ATV_T="$REPO_ROOT/.claude/skills/mergex/scripts/ativacao-pre-push.sh"
GIT_CONFIG_GLOBAL="$GLOBAL_VAZIA_T" bash "$ATV_T" --instalar --entrega docs/entregas/ft-02/ENTREGA.md >/dev/null 2>&1
valor "controle: pre-push instalado pelo E0 (ativacao-pre-push --instalar)" "$?" 0
GIT_CONFIG_GLOBAL="$GLOBAL_VAZIA_T" git push -q "$REMOTO_LENTO_T" feature/ft-02 >/dev/null 2>&1
valor "validade lenta: o git push real seguinte e barrado pelo pre-push" "$?" 1
valor "validade lenta: nada chegou ao remoto" "$(git -C "$REMOTO_LENTO_T" for-each-ref | wc -l | tr -d ' ')" 0
GIT_CONFIG_GLOBAL="$GLOBAL_VAZIA_T" bash "$ATV_T" --reverter --entrega docs/entregas/ft-02/ENTREGA.md >/dev/null 2>&1
rm -rf "$REMOTO_LENTO_T"
rm -rf "$SEMGIT_T/instalacao"

# Git for Windows sobre \\wsl.localhost\...: o hook roda pelo Git Bash do
# Windows, com o cwd UNC. Sem o ambiente: NAO_EXECUTADO (nunca conta como ok).
gfw_hook() { # <desc> <com|sem> — exige exit 0; deixa a saida em GFW_SAIDA
  local desc="$1" safe="$2" gb="/mnt/c/Program Files/Git/bin/bash.exe" w hk j r
  GFW_SAIDA=""
  command -v wslpath >/dev/null 2>&1 || { nao_executado "$desc — sem wslpath (fora do WSL)"; return 1; }
  [ -f "$gb" ] || { nao_executado "$desc — Git Bash do Windows ausente ($gb)"; return 1; }
  "$gb" -c 'command -v git >/dev/null && command -v jq >/dev/null' >/dev/null 2>&1 \
    || { nao_executado "$desc — o Git Bash do Windows nao executa pelo interop, ou sem git/jq nele"; return 1; }
  w="$(wslpath -w "$HIST_T")"; hk="$(wslpath -w "$H/mergex/pr-so-com-portao.sh" | tr '\\' '/')"
  case "$w" in '\\'*) ;; *) nao_executado "$desc — o cenario nao tem caminho UNC ($w)"; return 1 ;; esac
  j="$SEMGIT_T/gfw.json"; r="$SEMGIT_T/gfw-roda.sh"
  jq -cn --arg c "$PUSH_FT" --arg w "$w" '{tool_name:"Bash",cwd:$w,tool_input:{command:$c}}' > "$j"
  cat > "$r" <<'EOF'
# Git Bash do Windows: <hook> <json> <com|sem> <repositorio UNC com />
# Config global TEMPORARIA so neste processo (GIT_CONFIG_GLOBAL): a config
# global do usuario nao e lida nem escrita.
g="$(mktemp)" || exit 91
if [ "$3" = com ]; then printf '[safe]\n\tdirectory = %%(prefix)/%s\n' "$4" > "$g"; else : > "$g"; fi
export GIT_CONFIG_GLOBAL="$(cygpath -m "$g")"
e="$(mktemp)" || exit 92
ini=$SECONDS
bash "$1" < "$2" > /dev/null 2> "$e"; rc=$?
printf 'uname=%s\nrc=%s\nt=%s\n' "$(uname -s)" "$rc" "$((SECONDS - ini))"
sed 's/^/err=/' "$e"
rm -f "$g" "$e"
EOF
  GFW_SAIDA="$("$gb" "$(wslpath -w "$r")" "$hk" "$(wslpath -w "$j")" "$safe" "$(printf '%s' "$w" | tr '\\' '/')" 2>&1)"
  rm -f "$j" "$r"
  case "$(printf '%s\n' "$GFW_SAIDA" | sed -n 's/^uname=//p')" in
    MINGW*|MSYS*) ;;
    *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (nao rodou no Git Bash: %s)\n' "$desc" "$(printf '%s' "$GFW_SAIDA" | tr '\n' '|')"; return 1 ;;
  esac
  if [ "$(printf '%s\n' "$GFW_SAIDA" | sed -n 's/^rc=//p')" = 0 ]; then
    OK=$((OK+1)); printf '  ok    %s (%s s)\n' "$desc" "$(printf '%s\n' "$GFW_SAIDA" | sed -n 's/^t=//p')"; return 0
  fi
  FALHOU=$((FALHOU+1)); printf '  FALHA %s (%s)\n' "$desc" "$(printf '%s' "$GFW_SAIDA" | tr '\n' '|')"; return 1
}
portao_valido_com_metodo feature/ft-02 || exit 1
caso "controle: portao valido para o push legitimo do Git for Windows" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 0
if gfw_hook "git for windows sobre UNC: aviso sem bloqueio (sem safe.directory)" sem; then
  case "$GFW_SAIDA" in
    *"err=mergex/pr-so-com-portao — aviso"*safe.directory*) OK=$((OK+1)); printf '  ok    %s\n' "git for windows sobre UNC: dubious ownership avisa e cita safe.directory na config global" ;;
    *) FALHOU=$((FALHOU+1)); printf '  FALHA %s (%s)\n' "git for windows sobre UNC: o aviso nao cita safe.directory" "$(printf '%s' "$GFW_SAIDA" | tr '\n' '|')" ;;
  esac
fi
[ -z "${MERGEX_GFW_SAIDA:-}" ] || printf '%s\n' "$GFW_SAIDA" > "$MERGEX_GFW_SAIDA.sem"
if gfw_hook "regressao do falso bloqueio desta maquina: portao valido sobre UNC passa (com safe.directory)" com; then
  case "$GFW_SAIDA" in
    *"barrado"*) FALHOU=$((FALHOU+1)); printf '  FALHA %s\n' "git for windows: mensagem de bloqueio num push legitimo" ;;
    *) OK=$((OK+1)); printf '  ok    %s\n' "git for windows sobre UNC: nenhuma mensagem de bloqueio no push legitimo" ;;
  esac
fi
[ -z "${MERGEX_GFW_SAIDA:-}" ] || printf '%s\n' "$GFW_SAIDA" > "$MERGEX_GFW_SAIDA.com"

# Worktree vinculada (.git e arquivo): mesma regra
rm -f .expx/hooks.json
fixture_switch_exato main main || exit 1
git worktree add -q "$WTH_T" feature/ft-02 >/dev/null 2>&1 || exit 1
HOOK_CWD="$WTH_T"
caso "worktree vinculada: portao valido libera"    mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 0
printf 'produto na worktree\n' > "$WTH_T/src/na-worktree.ts"
git -C "$WTH_T" add src/na-worktree.ts && git -C "$WTH_T" commit -qm "feat: produto na worktree" || exit 1
caso "worktree vinculada: portao vencido barra em aviso" mergex/pr-so-com-portao.sh "$(bash_json "$PUSH_FT")" 2
mkdir -p "$WTH_T/.expx"
for MODO_WT in aviso bloqueio; do
  printf '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"%s"}}}\n' "$MODO_WT" > "$WTH_T/.expx/hooks.json"
  caso_aviso "worktree vinculada: git -C . push vencido avisa [$MODO_WT]" "$(bash_json 'git -C . push origin feature/ft-02')"
done
printf '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"desligado"}}}\n' > "$WTH_T/.expx/hooks.json"
caso_calado "worktree vinculada: git -C . push vencido calado [desligado]" "$(bash_json 'git -C . push origin feature/ft-02')"
rm -rf "$WTH_T/.expx"
HOOK_CWD="$HIST_T"
git worktree remove --force "$WTH_T" || exit 1

# Repositorio sem MergeX nunca bloqueia, nem em modo bloqueio
mkdir -p "$SEMX_T/.expx"
printf '{"expx_hooks":1,"hooks":{"pr-so-com-portao":{"modo":"bloqueio"}}}\n' > "$SEMX_T/.expx/hooks.json"
HOOK_CWD="$SEMX_T"
for C in 'git push' 'git push origin dev' 'git push -u origin dev' 'gh pr create --fill' 'echo push' \
         "sh -c 'git push'" 'git push origin $(git branch --show-current)' \
         '/usr/lib/git-core/git-push origin dev' '"$(git --exec-path)"/git-push origin dev' 'git-send-pack origin refs/heads/dev' \
         'cd -P . && git push origin dev'; do
  caso "sem MergeX em bloqueio: $C" mergex/pr-so-com-portao.sh "$(bash_json "$C")" 0
done
HOOK_CWD="$HIST_T"

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
echo "merge de integração da base (MERGE_HEAD)"
# Repositorio proprio: a main ganha commits aqui e nao pode mexer nas fixtures
# dos blocos anteriores. Duas tasks no plano: a T-01.02 nao esta concluida, de
# modo que, sem o reconhecimento da integracao, o que a base traz de
# src/outra.ts viraria mistura de tasks e task nao concluida.
cd "$INT_T" || exit 1
HOOK_CWD="$INT_T"
git init -q -b main . 2>/dev/null || exit 1
git config user.email teste@expx.local
git config user.name Teste
mkdir -p docs/sprintx/features/ft-02/sprint-01 src
printf 'l1
l2
l3
l4
l5
' > src/tarefa.ts
printf 'o1
' > src/outra.ts
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
      cria: [src/tarefa.ts]
      altera: []
    suite: verde
  - id: T-01.02
    status: em_andamento
    arquivos:
      cria: [src/outra.ts]
      altera: []
    suite: vermelha
---
YAML
entrega ft-02 feature/ft-02
git add -A >/dev/null 2>&1 && git commit -qm "base da integracao" || exit 1
fixture_switch_exato feature/ft-02 -c feature/ft-02 || exit 1
printf 'trabalho muda a tarefa
' | cat - src/tarefa.ts > src/tarefa.novo && mv src/tarefa.novo src/tarefa.ts
git add src/tarefa.ts && git commit -qm "feat: a tarefa" || exit 1
mkdir -p .expx
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"bloqueio"},"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json

merge_em_andamento_com_ajuste feature/ft-02 || exit 1
caso "integração não é mistura de tasks" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-integracao.txt')" 0
caso "integração com Task: barra" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-integracao-com-task.txt')" 2
MSG_INT_M="git commit -m \"merge(mergex): integra a base

Trabalho: ft-02
Integra-base: $(git rev-parse -q --verify MERGE_HEAD)\""
caso "integração por -m válida passa" mergex/commit-por-task.sh "$(bash_json "$MSG_INT_M")" 0
caso "-m sem Integra-base segue as regras de sempre (bloqueio: mistura)" mergex/commit-por-task.sh "$(bash_json 'git commit -m "integra a base"')" 2
caso "fora-do-plano não acusa o que veio da base" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -F msg-integracao.txt')" 0
# -F/--file com caminho entre aspas e espaco (CodeAnt 4235529198): a mensagem tem
# de ser lida inteira. Truncada no espaco, a integracao virava commit comum:
# commit-por-task via mistura de tasks e fora-do-plano acusava o que veio da base.
mkdir -p "com espaco" && cp msg-integracao.txt "com espaco/msg.txt"
caso "integração por -F \"caminho com espaço\" (commit-por-task)"       mergex/commit-por-task.sh "$(bash_json 'git commit -F "com espaco/msg.txt"')" 0
caso "integração por -F 'caminho com espaço' (commit-por-task)"         mergex/commit-por-task.sh "$(bash_json "git commit -F 'com espaco/msg.txt'")" 0
caso "integração por --file=\"caminho com espaço\" (commit-por-task)"   mergex/commit-por-task.sh "$(bash_json 'git commit --file="com espaco/msg.txt"')" 0
caso "integração por -F \"caminho absoluto com espaço\" (commit-por-task)" mergex/commit-por-task.sh "$(bash_json "git commit -F \"$INT_T/com espaco/msg.txt\"")" 0
caso "integração por -F \"caminho com espaço\" (fora-do-plano)"         mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -F "com espaco/msg.txt"')" 0
caso "integração por --file='caminho com espaço' (fora-do-plano)"       mergex/arquivo-fora-do-plano.sh "$(bash_json "git commit --file='com espaco/msg.txt'")" 0
rm -rf "com espaco"
# Sem isto o caso acima nao distingue "avalia o diff contra MERGE_HEAD" de
# "nao avalia nada": produto que a base NAO trouxe e o plano NAO declara
# continua desvio, mesmo dentro da integracao.
printf 'produto nao planejado
' > src/fora-do-plano.ts
git add src/fora-do-plano.ts
caso "integração: produto fora do plano e fora da base continua acusado" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -F msg-integracao.txt')" 2
git rm -q --cached src/fora-do-plano.ts; rm -f src/fora-do-plano.ts

echo "merge de integração: a classe vem da mensagem, não do estado do Git"
SHA_MH="$(git rev-parse -q --verify MERGE_HEAD)"
# (b) mensagem valida lida pelas formas que o recorte do comando suja
MSG_HEREDOC="git commit -m \"\$(cat <<'EOF'
merge(mergex): integra a base

Trabalho: ft-02
Integra-base: $SHA_MH
EOF
)\""
caso "integração válida via heredoc" mergex/commit-por-task.sh "$(bash_json "$MSG_HEREDOC")" 0
MSG_DOIS_M="git commit -m \"merge(mergex): integra a base\" -m \"Trabalho: ft-02
Integra-base: $SHA_MH\""
caso "integração válida via -m a -m b" mergex/commit-por-task.sh "$(bash_json "$MSG_DOIS_M")" 0
caso "integração válida via heredoc (fora-do-plano)" mergex/arquivo-fora-do-plano.sh "$(bash_json "$MSG_HEREDOC")" 0
# comando com aspas DEPOIS da mensagem: o recorte fecha na aspa certa
MSG_ECO="git commit -m \"merge(mergex): integra a base

Trabalho: ft-02
Integra-base: $SHA_MH\" && echo \"ok\""
MSG_LOG="git commit -m \"merge(mergex): integra a base\" -m \"Trabalho: ft-02
Integra-base: $SHA_MH\" && git log --format=\"%h\""
caso "integração válida + && echo \"ok\"" mergex/commit-por-task.sh "$(bash_json "$MSG_ECO")" 0
caso "integração válida (-m -m) + && git log --format=\"%h\"" mergex/commit-por-task.sh "$(bash_json "$MSG_LOG")" 0
caso "integração válida + && echo (fora-do-plano)" mergex/arquivo-fora-do-plano.sh "$(bash_json "$MSG_ECO")" 0
# (c) Integra-base tem de ser o MERGE_HEAD
ZEROS="0000000000000000000000000000000000000000"
printf 'merge(mergex): integra a base\n\nTrabalho: ft-02\nIntegra-base: %s\n' "$ZEROS" > msg-zeros.txt
printf 'merge(mergex): integra a base\n\nTrabalho: ft-02\nIntegra-base: %s\n' "$(git rev-parse HEAD)" > msg-outro-sha.txt
caso "Integra-base com 40 zeros barra" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-zeros.txt')" 2
caso "Integra-base de outro SHA barra" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-outro-sha.txt')" 2
# integração inválida não reduz o escopo do fora-do-plano
caso "Integra-base errado nao reduz o escopo" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -F msg-zeros.txt')" 2
# (d) arquivo que veio da base, alterado na resolucao e fora do plano
printf 'resolucao mexe no que veio da base\n' >> src/da-base.ts
git add src/da-base.ts
caso "base alterada na resolução e fora do plano é acusada" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -F msg-integracao.txt')" 2
git checkout -q MERGE_HEAD -- src/da-base.ts
# merge comum (mensagem sem Integra-base): escopo de sempre
caso "fora-do-plano: merge sem Integra-base avalia tudo" mergex/arquivo-fora-do-plano.sh "$(bash_json 'git commit -m "Merge branch main"')" 2
# (e) mensagem ilegivel: regras de sempre (aqui, mistura de tasks em bloqueio)
caso "git commit sem -m segue as regras de sempre" mergex/commit-por-task.sh "$(bash_json 'git commit')" 2
caso "git commit --no-edit segue as regras de sempre" mergex/commit-por-task.sh "$(bash_json 'git commit --no-edit')" 2
# (a) modo aviso: merge conflitado fora da integracao nunca bloqueia
printf 'Merge branch main\n' > msg-plana.txt
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"aviso"}}}' > .expx/hooks.json
caso "aviso: -m Merge branch main nao bloqueia" mergex/commit-por-task.sh "$(bash_json 'git commit -m "Merge branch main"')" 0
caso "aviso: -m x nao bloqueia" mergex/commit-por-task.sh "$(bash_json 'git commit -m "x"')" 0
caso "aviso: -F sem trailers nao bloqueia" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-plana.txt')" 0
caso "aviso: integração com Task: ainda barra (Integra-base declarado)" mergex/commit-por-task.sh "$(bash_json 'git commit -F msg-integracao-com-task.txt')" 2
caso "aviso: integração válida + && echo \"ok\" não bloqueia" mergex/commit-por-task.sh "$(bash_json "$MSG_ECO")" 0
caso "aviso: integração válida (-m -m) + && git log não bloqueia" mergex/commit-por-task.sh "$(bash_json "$MSG_LOG")" 0
# trailers que a leitura nao isola (lixo depois dos 40 hex): regras de sempre
MSG_LIXO="git commit -m \"merge(mergex): integra a base

Trabalho: ft-02
Integra-base: ${SHA_MH}XYZ\""
caso "aviso: Integra-base com lixo apos os 40 hex nao bloqueia" mergex/commit-por-task.sh "$(bash_json "$MSG_LIXO")" 0
echo '{"expx_hooks":1,"hooks":{"commit-por-task":{"modo":"bloqueio"},"arquivo-fora-do-plano":{"modo":"bloqueio"}}}' > .expx/hooks.json
rm -f msg-zeros.txt msg-outro-sha.txt msg-plana.txt
git merge --abort >/dev/null 2>&1 || exit 1
rm -f msg-integracao.txt msg-integracao-com-task.txt .expx/hooks.json
cd "$RAIZ_T" || exit 1
HOOK_CWD="$RAIZ_T"

echo
echo "registro dos hooks — tempo do pr-so-com-portao"
# O hook e consultivo e cabe no proprio orcamento (8 s): o timeout dele volta a
# 10 s, como os demais, nos dois harnesses (sem limite proprio no OpenCode).
valor "settings.json: timeout do pr-so-com-portao e 10" \
  "$(jq -r '.. | objects | select(has("command")) | select(.command | contains("mergex/pr-so-com-portao.sh")) | .timeout' "$REPO_ROOT/.claude/settings.json")" 10
valor "OpenCode: nenhum limite proprio por hook (o pr-so-com-portao fica nos 10 s)" \
  "$(grep -c 'TEMPO_POR_HOOK\|60_000' "$REPO_ROOT/.opencode/plugin/mergex.ts")" 0
valor "OpenCode: limite unico de 10 s" "$(grep -c '^const TEMPO_LIMITE = 10_000$' "$REPO_ROOT/.opencode/plugin/mergex.ts")" 1
valor "hook: orcamento interno de 8 s" "$(grep -c '^ORCAMENTO=8$' "$H/mergex/pr-so-com-portao.sh")" 1

echo
echo "---------------------------------------------"
printf '%d ok, %d falha(s), %d pulado(s)\n' "$OK" "$FALHOU" "$PULADOS"
[ "$PULADOS" = "0" ] || printf 'ATENCAO: %d caso(s) nao foram verificados nesta maquina.\n' "$PULADOS"
# NAO_EXECUTADO nunca conta como ok: fica listado a parte
[ "$NAOEXEC" = "0" ] || printf '%d caso(s) NAO_EXECUTADO (nao contados como ok)\n' "$NAOEXEC"
[ "$FALHOU" = "0" ]
