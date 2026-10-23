#!/usr/bin/env bash
#
# Le a configuracao do projeto (`.expx/fatiamento.json`) pelo nucleo do expx e imprime as
# variaveis efetivas, uma `CHAVE=valor` por linha, no formato que o shell le. Nenhum limite
# de fatiamento sai daqui como variavel do ambiente: os limites do CodeAnt sao fixos (emenda
# de 2026-10-19), e `FATIA_*` no ambiente e erro.
#
# Uso: leitor-do-projeto.sh [--raiz <dir>] [--rev <commit> [--nucleo-da-rev]]
#   --raiz  raiz do projeto (padrao: `git rev-parse --show-toplevel`)
#   --rev   le o arquivo deste commit, nunca o do disco (o E7 passa o SHA publicado; o
#           merge automatico e o E9, o da base)
#   --nucleo-da-rev  (so com --rev; o E9 da feature redirecionada e o merge automatico, com
#           a base protegida) executa o leitor do nucleo da arvore de <commit>, nunca o
#           instalado nem o do disco: a pasta do nucleo e materializada do commit, blob a
#           blob, num temporario, e conferida inteira (so arquivos comuns, os mesmos
#           caminhos, o mesmo conteudo) antes de rodar. Commit com o arquivo e sem a pasta:
#           sai 3 ("a base nao versiona o nucleo"). Nunca passe um commit de branch de PR.
#
# - `FATIA_*` no ambiente (mesmo vazia): sai 1, uma linha por variavel, antes de tudo
#   (depois so do uso), com ou sem arquivo e sem precisar de node.
# - Arquivo ausente (no commit, com --rev; no disco, sem): os padroes, sem chamar node.
# - Arquivo presente: o leitor do nucleo, a pasta
#   `<raiz>/.expx/marketplace/plugins/expx/nucleo/scripts/` (expx-fatiamento.mjs, que
#   importa expx-limites.mjs, que le perfis/), com o stdout repassado byte a byte. Sem
#   --nucleo-da-rev, roda sempre o instalado, nunca codigo do commit; com --rev, se o commit
#   versiona essa pasta, ela tem de ser igual a instalada (os mesmos arquivos, com o mesmo
#   conteudo). Com --nucleo-da-rev, roda a pasta do commit, materializada.
#
# Saidas: 0 leu; 1 arquivo invalido (stderr do leitor, stdout vazio) ou `FATIA_*` no
# ambiente; 2 a revisao ou a raiz nao resolvem; 3 arquivo presente e nucleo ausente ou
# antigo (sem expx-limites.mjs ou sem perfis/), nucleo do commit diferente do instalado,
# com --nucleo-da-rev o commit sem a pasta do nucleo ou com entrada que nao e arquivo comum,
# node ausente, leitor que o node nao carrega, que nao imprime todas as chaves ou que
# imprime `FATIA_*`; 64 uso. Fora do 0, nunca os padroes e nada no stdout.
#
# Consumo: `fatia="$(bash leitor-do-projeto.sh ...)" || <falha>; set -a; eval "$fatia"; set +a`.
# Nenhum `eval` aqui dentro.

set -uo pipefail

uso() { printf 'leitor-do-projeto: %s\nuso: leitor-do-projeto.sh [--raiz <dir>] [--rev <commit> [--nucleo-da-rev]]\n' "$1" >&2; exit 64; }
raiz=''; rev=''; da_rev=0
while [ $# -gt 0 ]; do
  case "$1" in
    --raiz|--rev) [ $# -ge 2 ] && [ -n "$2" ] || uso "$1 exige valor"
                  if [ "$1" = --raiz ]; then raiz="$2"; else rev="$2"; fi; shift 2 ;;
    --nucleo-da-rev) da_rev=1; shift ;;
    *) uso "argumento desconhecido: $1" ;;
  esac
done
[ "$da_rev" = 0 ] || [ -n "$rev" ] || uso '--nucleo-da-rev exige --rev'
# o codigo que roda e o da arvore do proprio commit: uma ref local de substituicao
# (refs/replace) nao troca a arvore
[ "$da_rev" = 0 ] || export GIT_NO_REPLACE_OBJECTS=1

# `FATIA_*` sao reservados para sempre: nunca lidos, nunca ignorados em silencio
fatia_no_ambiente=0
for nome in $(compgen -e); do
  case "$nome" in
    FATIA_*) printf 'leitor-do-projeto: `%s` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente\n' "$nome" >&2
             fatia_no_ambiente=1 ;;
  esac
done
[ "$fatia_no_ambiente" = 0 ] || exit 1

if [ -z "$raiz" ]; then
  raiz="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo 'leitor-do-projeto: fora de um repositorio git (use --raiz)' >&2; exit 2; }
fi
[ -d "$raiz" ] || { echo "leitor-do-projeto: raiz inexistente: $raiz" >&2; exit 2; }
if [ -n "$rev" ]; then
  commit="$(git -C "$raiz" rev-parse --verify --quiet "$rev^{commit}")" \
    || { echo "leitor-do-projeto: revisao inexistente: $rev" >&2; exit 2; }
fi

config='.expx/fatiamento.json'
# presente e qualquer entrada, como o `lstat` do leitor do nucleo: link quebrado, pasta e
# gitlink sem objeto sao presentes (e invalidos); `.expx` que nao e pasta (ENOTDIR) ou
# que nao se atravessa (EACCES) tambem
expx_pasta=1
if [ -n "$rev" ]; then
  entrada="$(git -C "$raiz" ls-tree --full-tree "$commit" -- "$config")" \
    && e_expx="$(git -C "$raiz" ls-tree --full-tree "$commit" -- .expx)" || exit 2
  case "$e_expx" in ''|'040000 '*) ;; *) expx_pasta=0 ;; esac
else
  entrada=''; { [ -e "$raiz/$config" ] || [ -L "$raiz/$config" ]; } && entrada=1
  [ -e "$raiz/.expx" ] && { [ ! -d "$raiz/.expx" ] || [ ! -x "$raiz/.expx" ]; } && expx_pasta=0
fi

if [ -z "$entrada" ] && [ "$expx_pasta" = 1 ]; then
  # os padroes do leitor do nucleo, na ordem dele, com os numeros dos perfis (o teste os
  # compara). EXPX_CAMINHOS_PROTEGIDOS vazio: com o merge automatico desligado a lista nao e lida
  cat <<'EOF'
EXPX_REVISAO_POR_TASK=se_disponivel
EXPX_ENTREGA=por_trabalho
EXPX_MERGE_AUTOMATICO=nao
EXPX_CAMINHOS_PROTEGIDOS=
EXPX_REVISOR_BOT=
EXPX_EXCLUIR_DA_REVISAO=
EXPX_FATIAMENTO_ORIGEM=padrao
EXPX_PERFIL_CLI=codeant-cli@0.5.14
EXPX_L1_ARQUIVOS=40
EXPX_L2_LINHAS=5000
EXPX_L2_BYTES=204800
EXPX_L3_ARQUIVOS=100
EOF
  exit 0
fi

desatualizado() { echo "leitor-do-projeto: expx-fatiamento ausente ou incompleto: atualize o expx (expx update)${1:+ ($1)}" >&2; exit 3; }
nucleo_rel='.expx/marketplace/plugins/expx/nucleo/scripts'; nucleo="$raiz/$nucleo_rel"
tmp="$(mktemp -d)" || exit 2
trap 'rm -rf "$tmp"' EXIT

# --nucleo-da-rev: a pasta do nucleo sai do commit (a base protegida), nunca do disco nem da
# branch do PR. Blob a blob (`cat-file`, sem filtro de fim de linha nem atributo de exportacao),
# so arquivo comum de nome simples, e a pasta materializada tem de ser exatamente a do commit
if [ "$da_rev" = 1 ]; then
  nao_comum() { echo "leitor-do-projeto: a pasta do núcleo de $rev tem entrada que não é arquivo comum de nome simples: $1" >&2; exit 3; }
  nucleo="$tmp/nucleo"; mkdir -p "$nucleo" || exit 2
  git -C "$raiz" ls-tree -r -z --full-tree "$commit" -- "$nucleo_rel" > "$tmp/arvore" || exit 2
  [ -s "$tmp/arvore" ] || { echo "leitor-do-projeto: a base não versiona o núcleo ($nucleo_rel ausente em $rev): o leitor da base não pode ser executado" >&2; exit 3; }
  tab="$(printf '\t')"; : > "$tmp/lista"
  while IFS= read -r -d '' linha; do
    caminho="${linha#*"$tab"}"; set -- ${linha%%"$tab"*} # <modo> <tipo> <objeto>
    case "$1 $2" in '100644 blob'|'100755 blob') ;; *) nao_comum "$caminho ($1 $2)" ;; esac
    f="${caminho#"$nucleo_rel"/}"
    case "/$f/" in "/$caminho/"|*[!A-Za-z0-9._/-]*|*/../*|*/./*|*//*) nao_comum "$caminho" ;; esac
    mkdir -p "$nucleo/$(dirname -- "$f")" && git -C "$raiz" cat-file blob "$3" > "$nucleo/$f" || exit 2
    [ "$(git -C "$raiz" hash-object --no-filters -- "$nucleo/$f")" = "$3" ] \
      || { echo "leitor-do-projeto: o núcleo materializado de $rev não confere: $f" >&2; exit 3; }
    printf '%s\n' "$f" >> "$tmp/lista"
  done < "$tmp/arvore"
  # a pasta inteira: nada a mais nem a menos (nome que so difere na caixa colide no Windows)
  [ "$(cd "$nucleo" && find . ! -type d | sed 's|^\./||' | LC_ALL=C sort)" = "$(LC_ALL=C sort "$tmp/lista")" ] \
    || { echo "leitor-do-projeto: o núcleo materializado de $rev não confere com a árvore" >&2; exit 3; }
fi
mjs="$nucleo/expx-fatiamento.mjs"
[ -f "$mjs" ] || desatualizado "sem $mjs"
# nucleo antigo (so o leitor v1): sem a pasta inteira, o leitor diria "versao desconhecida"
[ -f "$nucleo/expx-limites.mjs" ] && [ -d "$nucleo/perfis" ] \
  || desatualizado "nucleo antigo: sem expx-limites.mjs ou sem perfis/ em $nucleo"

# com --rev, se o commit versiona a pasta do nucleo e ela difere da instalada (arquivo a
# mais, a menos ou com outro conteudo), nenhum dos dois decide; com --nucleo-da-rev, o
# instalado nao entra
if [ -n "$rev" ] && [ "$da_rev" = 0 ]; then
  no_commit="$(git -C "$raiz" -c core.quotepath=off ls-tree -r --full-tree "$commit" -- "$nucleo_rel")" || exit 2
  if [ -n "$no_commit" ]; then
    # cada arquivo do commit e igual ao instalado se o blob e o do arquivo pelo filtro de fim de
    # linha (blob LF, checkout CRLF com autocrlf) ou byte a byte (blob versionado com CRLF)
    versionado="$(printf '%s\n' "$no_commit" | while IFS="$(printf '\t')" read -r meta caminho; do
                    set -- $meta; f="${caminho#"$nucleo_rel"/}"
                    h="$(git -C "$raiz" hash-object -- "$nucleo_rel/$f" 2>/dev/null)" || h=ilegivel
                    b="$(git -C "$raiz" hash-object --no-filters -- "$nucleo_rel/$f" 2>/dev/null)" || b=ilegivel
                    if [ "$3" = "$h" ] || [ "$3" = "$b" ]; then printf '%s\n' "$f"; else printf '%s (difere)\n' "$f"; fi
                  done | LC_ALL=C sort)"
    instalado="$(cd "$nucleo" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)"
    [ "$versionado" = "$instalado" ] || desatualizado 'o nucleo do commit difere do instalado'
  fi
fi
command -v node >/dev/null 2>&1 || desatualizado 'node ausente'

leia="$raiz"
if [ -n "$rev" ]; then
  # materializa a entrada do commit: blob vira arquivo (de um link, o texto do alvo, JSON
  # invalido); pasta, gitlink ou `.expx` que nao e pasta vira pasta, que o leitor recusa
  # como ilegivel (um `.expx` arquivo nao serve: o lstat do Windows da ENOENT, nao ENOTDIR)
  leia="$tmp/raiz"; mkdir -p "$leia/.expx" || exit 2
  set -- $entrada # <modo> <tipo> <objeto> <caminho>; vazio com `.expx` que nao e pasta
  if [ "${2:-}" = blob ]; then git -C "$raiz" cat-file blob "$3" > "$leia/$config" || exit 2
  else mkdir "$leia/$config" || exit 2; fi
fi
# node nativo no Windows nao entende o caminho do MSYS
if command -v cygpath >/dev/null 2>&1; then leia="$(cygpath -w "$leia")"; mjs="$(cygpath -w "$mjs")"; fi

node "$mjs" --raiz "$leia" --formato env > "$tmp/env" 2> "$tmp/err"; rc=$?
# arquivo invalido e o 1 do leitor, que comeca o stderr com `expx-fatiamento: ` (o contrato
# dele); o 1 do node que nao carregou o leitor (sintaxe, modulo) comeca com outra coisa
IFS= read -r primeira < "$tmp/err"
case "$rc:${primeira:-}" in 1:'expx-fatiamento: '*) cat "$tmp/err" >&2; exit 1 ;; esac
[ "$rc" = 0 ] || { cat "$tmp/err" >&2; desatualizado "o leitor saiu $rc"; }
grep -qx 'EXPX_FATIAMENTO_ORIGEM=projeto' "$tmp/env" || desatualizado 'o leitor nao confirmou a origem projeto'
# o leitor de antes da emenda imprime limites `FATIA_*`: o E7 nao os le, e nao mede com eles
! grep -q '^FATIA_' "$tmp/env" || desatualizado 'o leitor imprime FATIA_ (leitor antigo)'
for k in EXPX_REVISAO_POR_TASK EXPX_ENTREGA EXPX_MERGE_AUTOMATICO EXPX_CAMINHOS_PROTEGIDOS \
         EXPX_REVISOR_BOT EXPX_EXCLUIR_DA_REVISAO EXPX_PERFIL_CLI EXPX_L1_ARQUIVOS \
         EXPX_L2_LINHAS EXPX_L2_BYTES EXPX_L3_ARQUIVOS; do
  grep -q "^$k=" "$tmp/env" || desatualizado "o leitor nao imprime $k"
done
cat "$tmp/env"
