# segredo-dispensa — os arquivos do framework que o lock da instalação confere por hash.
#
# A atualização do framework escreve arquivos que a varredura de segredo acusava
# (referência de código, texto das decisões, a própria tabela), e o hook instalado
# barrava o commit da própria atualização (conselhos, 0.12.5 para 0.12.8; DM-286).
# Um arquivo cujo blob bate com o sha256 que o lock v2 registra em
# `instalacao.arquivos` é o que o ExpxDev instalou: não é varrido.
#
# A dispensa é estreita, e qualquer dúvida a desliga (a varredura segue normal):
# - o lock e o blob vêm do MESMO estado que vai para o histórico: o índice no
#   commit, o próprio commit no push; nunca a árvore de trabalho nem o HEAD;
# - só caminhos em .claude/{hooks,skills,commands,agents}/ e .expx/marketplace/,
#   relativos, sem `.`/`..`, segmento vazio, barra invertida ou controle;
# - só blob regular (100644/100755), no estágio 0;
# - lock v2 legível, até 1 MiB e 4.096 entradas, todo hash com 64 hex e toda chave
#   bem formada (uma chave com controle, barra invertida, `.`/`..`, `//` ou absoluta
#   invalida o lock inteiro); até 1.024 arquivos dispensados e 32 MiB de blobs
#   conferidos por estado (a instalação inteira tem cerca de 650 arquivos); no push,
#   64 MiB conferidos no total, que os commits vão consumindo (SEG_DISP_ORCAMENTO,
#   um arquivo com o saldo). As variáveis EXPX_SEGREDO_DISP_MAX_{LOCK,ENTRADAS,
#   ARQUIVOS,BYTES,PUSH} só baixam esses limites (os testes as usam): baixar só
#   reduz a dispensa.
# Quem falsifica o lock para casar com um segredo passa: o hook existe contra o
# vazamento acidental, e o lock é declaração local, não prova de procedência.
#
# Uso (com o diretório de trabalho na raiz do repositório):
#   segredo_dispensaveis_indice        — caminhos do índice, um por linha
#   segredo_dispensaveis_commit <sha> [pai] — caminhos do commit, contra o primeiro pai
#                                        (sem pai: o commit raiz), um por linha
#   segredo_pathspec_excluir           — lê caminhos e escreve `:(top,literal,exclude)<c>`

# _disp_sha256 < bytes — o sha256 em hex. Só o êxito do executável conta, e a saída
# tem de ter a forma de um hash: com qualquer pipefail do chamador, ou sem ele.
_disp_sha256() {
  local h
  if command -v sha256sum >/dev/null 2>&1; then h="$(sha256sum)" || return 1
  elif command -v shasum >/dev/null 2>&1; then h="$(shasum -a 256)" || return 1
  else return 1; fi
  h="${h%%[[:space:]]*}"
  printf '%s' "$h" | grep -Eq '^[0-9a-f]{64}$' || return 1
  printf '%s\n' "$h"
}

# _disp_lim <padrão> <valor da variável> — o menor dos dois; valor fora de número, o padrão
_disp_lim() {
  case "$2" in ''|*[!0-9]*) printf '%s' "$1" ;; *) if [ "$2" -lt "$1" ]; then printf '%s' "$2"; else printf '%s' "$1"; fi ;; esac
}

_disp_caminho_ok() {
  case "$1" in
    .claude/hooks/?*|.claude/skills/?*|.claude/commands/?*|.claude/agents/?*|.expx/marketplace/?*) ;;
    *) return 1 ;;
  esac
  case "/$1/" in */./*|*/../*|*//*) return 1 ;; esac
  case "$1" in *\\*) return 1 ;; esac
  printf '%s' "$1" | LC_ALL=C grep -q '[[:cntrl:]]' && return 1
  return 0
}

# _disp_lock <objeto do lock> — "caminho<TAB>hash" de cada entrada elegível. Lock
# fora do contrato: nada (e rc 1).
_disp_lock() {
  local obj="$1" tam
  command -v jq >/dev/null 2>&1 || return 1
  tam="$(git cat-file -s "$obj" 2>/dev/null)" || return 1
  [ "$tam" -le "$(_disp_lim 1048576 "${EXPX_SEGREDO_DISP_MAX_LOCK:-}")" ] 2>/dev/null || return 1
  # Toda chave bem formada, ou o lock inteiro sai: uma quebra de linha na chave
  # corromperia a lista "caminho<TAB>hash". Chave bem formada fora das pastas do
  # framework só não é elegível.
  git cat-file blob "$obj" 2>/dev/null | jq -r --argjson max "$(_disp_lim 4096 "${EXPX_SEGREDO_DISP_MAX_ENTRADAS:-}")" '
    def malformada: . == "" or startswith("/") or test("[[:cntrl:]]") or test("\\\\")
      or test("(^|/)\\.{1,2}(/|$)") or test("//");
    if .lock_version == 2 and (.instalacao.arquivos | type) == "object"
       and (.instalacao.arquivos | length) <= $max
       and all(.instalacao.arquivos[]; type == "string" and test("^[0-9a-f]{64}$"))
       and all(.instalacao.arquivos | keys[]; malformada | not)
    then .instalacao.arquivos | to_entries[]
      | select(.key | test("^(\\.claude/(hooks|skills|commands|agents)|\\.expx/marketplace)/."))
      | "\(.key)\t\(.value)"
    else error("fora do contrato") end' 2>/dev/null
}

# _disp_filtra <lock "caminho\thash"> <prefixo do blob> < alterados (NUL)
# Para cada alterado elegível, o blob (de `<prefixo><caminho>`) com sha256 igual ao do
# lock. `<prefixo>` é `:` (índice, estágio 0) ou `<sha>:` (commit). Acima dos limites,
# nada: a lista só sai inteira, no fim.
_disp_filtra() {
  local lock="$1" pref="$2" c esperado modo obj h n=0 soma=0 tam saida="" max_n max_b
  max_n="$(_disp_lim 1024 "${EXPX_SEGREDO_DISP_MAX_ARQUIVOS:-}")"
  max_b="$(_disp_lim 33554432 "${EXPX_SEGREDO_DISP_MAX_BYTES:-}")"
  # O saldo do push, quando há: o estado só confere o que ainda cabe nele.
  local saldo=""
  if [ -n "${SEG_DISP_ORCAMENTO:-}" ]; then
    saldo="$(cat "$SEG_DISP_ORCAMENTO" 2>/dev/null)"
    case "$saldo" in ''|*[!0-9]*) return 1 ;; esac
    max_b="$(_disp_lim "$max_b" "$saldo")"
  fi
  while IFS= read -r -d '' c; do
    _disp_caminho_ok "$c" || continue
    esperado="$(printf '%s\n' "$lock" | awk -F '\t' -v c="$c" '$1 == c { print $2; exit }')"
    [ -n "$esperado" ] || continue
    if [ "$pref" = ":" ]; then
      modo="$(git ls-files -s -z -- ":(top,literal)$c" 2>/dev/null | tr '\0' '\n')"
      [ "$(printf '%s\n' "$modo" | grep -c .)" = 1 ] || continue
      case "$modo" in "100644 "*" 0	$c"|"100755 "*" 0	$c") ;; *) continue ;; esac
      obj="$(printf '%s' "$modo" | awk '{ print $2 }')"
    else
      modo="$(git ls-tree -z --full-tree "${pref%:}" -- "$c" 2>/dev/null | tr '\0' '\n')"
      [ "$(printf '%s\n' "$modo" | grep -c .)" = 1 ] || continue
      case "$modo" in "100644 blob "*"	$c"|"100755 blob "*"	$c") ;; *) continue ;; esac
      obj="$(printf '%s' "$modo" | awk '{ print $3 }')"
    fi
    tam="$(git cat-file -s "$obj" 2>/dev/null)" || continue
    soma=$((soma + tam)); [ "$soma" -le "$max_b" ] || return 1
    h="$(set -o pipefail; git cat-file blob "$obj" 2>/dev/null | _disp_sha256)" || continue
    [ "$h" = "$esperado" ] || continue
    n=$((n + 1)); [ "$n" -le "$max_n" ] || return 1
    saida="${saida}${c}
"
  done
  if [ -n "$saldo" ]; then printf '%s\n' "$((saldo - soma))" > "$SEG_DISP_ORCAMENTO" || return 1; fi
  printf '%s' "$saida"
}

segredo_dispensaveis_indice() {
  local lock
  printf 'x' | _disp_sha256 >/dev/null 2>&1 || return 0
  lock="$(_disp_lock ":.expx/expx-lock.json")" || return 0
  [ -n "$lock" ] || return 0
  git diff --cached --name-only -z 2>/dev/null | _disp_filtra "$lock" ":" || return 0
}

segredo_dispensaveis_commit() {
  local c="$1" pai="${2:-}" lock
  printf 'x' | _disp_sha256 >/dev/null 2>&1 || return 0
  lock="$(_disp_lock "$c:.expx/expx-lock.json")" || return 0
  [ -n "$lock" ] || return 0
  if [ -n "$pai" ]; then
    git diff --name-only -z --no-renames "$pai" "$c" -- 2>/dev/null | _disp_filtra "$lock" "$c:" || return 0
  else
    git diff-tree --no-commit-id --root -r --name-only -z "$c" -- 2>/dev/null | _disp_filtra "$lock" "$c:" || return 0
  fi
}

segredo_pathspec_excluir() {
  local c
  while IFS= read -r c; do
    [ -n "$c" ] && printf ':(top,literal,exclude)%s\n' "$c"
  done
}
