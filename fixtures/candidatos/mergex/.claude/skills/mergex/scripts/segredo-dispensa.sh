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
# O custo não cresce com o número de arquivos (DM-289; a DM-286 abria dez processos por
# arquivo e o hook passava do timeout de 10 s): o estado é lido uma vez, os blobs crus vêm
# de um único `git cat-file --batch`, e um único perl calcula os hashes. Blob cru, nunca
# `checkout-index` nem `archive`: filtro e atributo fariam o hash casar com o lock num blob
# diferente. Sem perl com Digest::SHA, nada é dispensado. O prazo SEG_DISP_PRAZO (`date +%s`
# de 4 s à frente) vale para o evento inteiro; estourou, nada é dispensado e a varredura
# completa roda.
#
# Uso (com o diretório de trabalho na raiz do repositório):
#   segredo_dispensaveis_indice        — caminhos do índice, um por linha
#   segredo_dispensaveis_commit <sha> [pai] — caminhos do commit, contra o primeiro pai
#                                        (sem pai: o commit raiz), um por linha
#   segredo_pathspec_excluir           — lê caminhos e escreve `:(top,literal,exclude)<c>`

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
  local LC_ALL=C
  case "$1" in *[[:cntrl:]]*) return 1 ;; esac
  return 0
}

_disp_tem_perl() {
  command -v perl >/dev/null 2>&1 && perl -MDigest::SHA -e 1 >/dev/null 2>&1
}

# _disp_prazo_ok — ainda há tempo. Sem prazo definido pelo chamador, conta daqui.
_disp_prazo_ok() {
  : "${SEG_DISP_PRAZO:=$(($(date +%s) + 4))}"
  [ -z "${SEG_DISP_TESTE_PRAZO:-}" ] || SEG_DISP_PRAZO=0
  [ "$(date +%s)" -lt "$SEG_DISP_PRAZO" ]
}

# _disp_selecao <lock "caminho\thash"> <alterados> < registros NUL de `ls-files -s -z` ou
# `ls-tree -r -z` — "oid<TAB>hash<TAB>caminho" de cada alterado que o lock confere, blob
# regular no estágio 0. As duas listas só têm caminho sem controle (`_disp_caminho_ok`).
_disp_selecao() {
  perl -e '
    my (%h, %a, %o, %fora);
    open(my $l, "<", $ARGV[0]) or exit 1;
    while (<$l>) { chomp; my ($c, $v) = split /\t/; $h{$c} = $v }
    open(my $f, "<", $ARGV[1]) or exit 1;
    while (<$f>) { chomp; $a{$_} = 1 }
    binmode STDIN; local $/ = "\0";
    while (<STDIN>) {
      chomp;
      /\A(\d{6}) (?:blob )?([0-9a-f]{40,64})(?: (\d))?\t(.*)\z/s or next;
      my ($m, $o, $e, $c) = ($1, $2, $3 // 0, $4);
      if ($e != 0) { $fora{$c} = 1; next }
      $o{$c} = $o if ($m eq "100644" || $m eq "100755") && $a{$c} && $h{$c};
    }
    print "$o{$_}\t$h{$_}\t$_\n" for grep { !$fora{$_} } sort keys %o;
  ' "$1" "$2"
}

# _disp_hashes <máximo de bytes> < saída de `git cat-file --batch` — "oid<TAB>sha256" de
# cada blob e, por último, "#soma<TAB>bytes". Passou do limite ou do prazo, sai 1.
_disp_hashes() {
  MAX="$1" PRAZO="$SEG_DISP_PRAZO" perl -MDigest::SHA=sha256_hex -e '
    binmode STDIN; binmode STDOUT;
    my ($soma, $max, $prazo) = (0, $ENV{MAX}, $ENV{PRAZO});
    while (defined(my $l = <STDIN>)) {
      my ($o, $t, $n) = split " ", $l;
      exit 1 unless defined $n && $t eq "blob" && time() < $prazo;
      $soma += $n; exit 1 if $soma > $max;
      my ($b, $lido) = ("", 0);
      while ($lido < $n) {
        my $r = read(STDIN, $b, $n - $lido, $lido);
        exit 1 unless $r; $lido += $r;
      }
      read(STDIN, my $fim, 1) == 1 or exit 1;
      print "$o\t", sha256_hex($b), "\n";
    }
    exit 1 unless time() < $prazo;
    print "#soma\t$soma\n";'
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
    else error("fora do contrato") end' 2>/dev/null | tr -d '\r'
}

# _disp_filtra <lock "caminho\thash"> <commit, ou vazio para o índice> < alterados (NUL)
# Cada alterado elegível cujo blob tem o sha256 do lock. Acima dos limites ou fora do
# prazo, nada: a lista só sai inteira, no fim.
_disp_filtra() (
  set -o pipefail
  lock="$1"; commit="$2"
  max_n="$(_disp_lim 1024 "${EXPX_SEGREDO_DISP_MAX_ARQUIVOS:-}")"
  max_b="$(_disp_lim 33554432 "${EXPX_SEGREDO_DISP_MAX_BYTES:-}")"
  saldo=""
  if [ -n "${SEG_DISP_ORCAMENTO:-}" ]; then
    saldo="$(cat "$SEG_DISP_ORCAMENTO" 2>/dev/null)"
    case "$saldo" in ''|*[!0-9]*) return 1 ;; esac
    max_b="$(_disp_lim "$max_b" "$saldo")"
  fi
  _disp_prazo_ok || return 1
  alterados=""
  while IFS= read -r -d '' c; do
    _disp_caminho_ok "$c" && alterados="${alterados}${c}
"
  done
  [ -n "$alterados" ] || return 0
  # Estado que vai para o histórico, lido uma vez. Os registros ficam separados por NUL até
  # a seleção: caminho com TAB ou quebra de linha não pode se passar por outro.
  if [ -n "$commit" ]; then
    estado=(git ls-tree -r -z --full-tree "$commit")
  else
    estado=(git ls-files -s -z)
  fi
  pares="$("${estado[@]}" 2>/dev/null | _disp_selecao <(printf '%s\n' "$lock") <(printf '%s' "$alterados"))" || return 1
  [ -n "$pares" ] || return 0
  [ "$(awk 'END { print NR }' <<<"$pares")" -le "$max_n" ] || return 1
  hashes="$(cut -f1 <<<"$pares" | git cat-file --batch 2>/dev/null | _disp_hashes "$max_b")" || return 1
  soma="$(awk -F '\t' '$1 == "#soma" { print $2 }' <<<"$hashes")"
  [ -n "$soma" ] || return 1
  if [ -n "$saldo" ]; then printf '%s\n' "$((saldo - soma))" > "$SEG_DISP_ORCAMENTO" || return 1; fi
  awk -F '\t' 'NR == FNR { h[$1] = $2; next } h[$1] == $2 { print $3 }' <(printf '%s\n' "$hashes") <(printf '%s\n' "$pares")
)

segredo_dispensaveis_indice() {
  local lock
  _disp_tem_perl || return 0
  lock="$(_disp_lock ":.expx/expx-lock.json")" || return 0
  [ -n "$lock" ] || return 0
  git diff --cached --name-only -z 2>/dev/null | _disp_filtra "$lock" "" || return 0
}

segredo_dispensaveis_commit() {
  local c="$1" pai="${2:-}" lock
  _disp_prazo_ok || return 0
  _disp_tem_perl || return 0
  lock="$(_disp_lock "$c:.expx/expx-lock.json")" || return 0
  [ -n "$lock" ] || return 0
  if [ -n "$pai" ]; then
    git diff --name-only -z --no-renames "$pai" "$c" -- 2>/dev/null | _disp_filtra "$lock" "$c" || return 0
  else
    git diff-tree --no-commit-id --root -r --name-only -z "$c" -- 2>/dev/null | _disp_filtra "$lock" "$c" || return 0
  fi
}

segredo_pathspec_excluir() {
  local c
  while IFS= read -r c; do
    [ -n "$c" ] && printf ':(top,literal,exclude)%s\n' "$c"
  done
}
