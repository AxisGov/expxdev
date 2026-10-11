#!/usr/bin/env bash
# reconciliacao-artefato — o artefato RECONCILIACAO-BASE-NNN.md da reconciliação
# de base pós-E8. Biblioteca: é carregada com `.` e não executa nada sozinha.
#
# Funções (todas retornam 0/1 e preenchem RB_ERRO em falha; chame SEM subshell
# para ler RB_ERRO):
#   rb_sha256                         sha256 de stdin (sha256sum ou shasum -a 256)
#   rb_diff_sha <b1> <m> <caminho>    sha256 do diff canônico (spec 7.1; ver a
#                                     função), da raiz, independente do cwd
#   rb_emitir <saida> <tsv-escalares> <tsv-arquivos>
#   rb_ler <arquivo>                  escalar<TAB>chave<TAB>valor
#                                     arquivo<TAB>caminho<TAB>status_base<TAB>blob_b1
#                                       <TAB>blob_m<TAB>diff_sha<TAB>motivo
#   rb_assinatura <arquivo>           sha256 das linhas canônicas (spec 7.1)
#   rb_validar <arquivo> <trabalho> <numero>
#
# Formato do TSV de escalares: `chave<TAB>valor`, uma por linha, com as chaves
# expx_tool trabalho_id numero anterior branch branch_base origem_base b0_sha
# p1_sha b1_sha m_sha estado registrado_em (`anterior` é `null` no 001).
# `expx_schema` e `kind` são fixos. Formato do TSV de arquivos, seis colunas:
# caminho status_base blob_b1 blob_m diff_b1_m_sha256 motivo (vazio = `[]`).
#
# Assinatura: sha256 de `numero=`, `anterior=`, `trabalho_id=`, `b0_sha=`,
# `p1_sha=`, `b1_sha=`, `m_sha=` (nessa ordem, `chave=valor`) seguidas de uma
# linha `caminho<TAB>status_base<TAB>blob_b1<TAB>blob_m<TAB>diff_b1_m_sha256`
# por arquivo, em ordem de byte (LC_ALL=C sort). `motivo`, `estado` e
# `registrado_em` não entram: `estado` muda por desenho quando a reconciliação
# seguinte supera esta, e `motivo` é para o revisor, não é prova.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

RB_ERRO=""

rb_sha256() {
  local h
  if command -v sha256sum >/dev/null 2>&1; then
    h="$(sha256sum | cut -d' ' -f1)" || { RB_ERRO="sha256sum falhou"; return 1; }
  elif command -v shasum >/dev/null 2>&1; then
    h="$(shasum -a 256 | cut -d' ' -f1)" || { RB_ERRO="shasum falhou"; return 1; }
  else
    RB_ERRO="nem sha256sum nem shasum disponível"; return 1
  fi
  printf '%s' "$h" | grep -Eq '^[0-9a-f]{64}$' || { RB_ERRO="hash inválido"; return 1; }
  printf '%s\n' "$h"
}

# Forma canônica (spec 7.1): flags explícitas tornam o valor independente da
# configuração local e do clone (prefixos, algoritmo, contexto, textconv,
# abreviação — a linha `index` sai com SHA completo), da raiz do repositório,
# com pathspec literal e sem variáveis de ambiente de diff ou de pathspec do
# chamador. Limitação conhecida: o atributo `-diff`/`binary` não tem flag que
# o desligue.
rb_diff_sha() { # <b1> <m> <caminho>
  [ "$#" -eq 3 ] || { RB_ERRO="rb_diff_sha: uso <b1> <m> <caminho>"; return 1; }
  local tmp h raiz
  raiz="$(git rev-parse --show-toplevel 2>/dev/null)" || { RB_ERRO="rb_diff_sha: fora de um repositório Git"; return 1; }
  [ -n "$raiz" ] || { RB_ERRO="rb_diff_sha: fora de uma árvore de trabalho Git"; return 1; }
  tmp="$(mktemp)" || { RB_ERRO="mktemp falhou"; return 1; }
  if ! (
    unset GIT_DIFF_OPTS GIT_EXTERNAL_DIFF GIT_GLOB_PATHSPECS GIT_ICASE_PATHSPECS GIT_NOGLOB_PATHSPECS
    GIT_LITERAL_PATHSPECS=1; export GIT_LITERAL_PATHSPECS
    # objetos e pais só do Git, sem refs/replace nem .git/info/grafts locais
    GIT_NO_REPLACE_OBJECTS=1; GIT_GRAFT_FILE=/dev/null; export GIT_NO_REPLACE_OBJECTS GIT_GRAFT_FILE # guarda:EST
    git -C "$raiz" -c core.commitGraph=false -c core.quotepath=false -c diff.noprefix=false -c diff.mnemonicPrefix=false \
      -c diff.suppressBlankEmpty=false -c diff.relative=false \
      diff --no-ext-diff --no-textconv --no-color --binary --full-index --no-renames --no-relative --ignore-submodules=none \
      --src-prefix=a/ --dst-prefix=b/ -U3 --inter-hunk-context=0 --diff-algorithm=myers \
      --indent-heuristic "$1" "$2" -- "$3"
  ) > "$tmp" 2>/dev/null; then
    rm -f "$tmp"; RB_ERRO="git diff falhou para $1 $2 -- $3"; return 1
  fi
  rb_sha256 < "$tmp" > "$tmp.h" || { rm -f "$tmp" "$tmp.h"; return 1; }
  h="$(cat "$tmp.h")"; rm -f "$tmp.h"
  rm -f "$tmp"
  printf '%s\n' "$h"
}

# Uma linha de frontmatter por vez, com aspas e escapes de YAML (só \ e ").
# rb_ler a desfaz byte a byte.
_rb_ler_awk() {
  awk '
    function unq(v,   n, i, c, out) {
      sub(/[ \t]+$/, "", v)
      if (substr(v, 1, 1) != "\"") return v
      n = length(v)
      if (n < 2 || substr(v, n, 1) != "\"") { bad = "aspas sem fechamento: " v; return "" }
      out = ""; i = 2
      while (i < n) {
        c = substr(v, i, 1)
        if (c == "\\") {
          i++; c = substr(v, i, 1)
          if (i >= n || (c != "\\" && c != "\"")) { bad = "escape inválido: " v; return "" }
        } else if (c == "\"") { bad = "aspas soltas: " v; return "" }
        out = out c; i++
      }
      return out
    }
    function flush() {
      if (!em_item) return
      printf "arquivo\t%s\t%s\t%s\t%s\t%s\t%s\n", it["caminho"], it["status_base"], \
        it["blob_b1"], it["blob_m"], it["diff_b1_m_sha256"], it["motivo"]
      em_item = 0
      split("", it)
    }
    function item_chave(k, v) {
      if (k !~ /^(caminho|status_base|blob_b1|blob_m|diff_b1_m_sha256|motivo)$/) { bad = "chave de item desconhecida: " k; return }
      if (k in it) { bad = "chave de item repetida: " k; return }
      v = unq(v)
      if (v ~ /\t/) { bad = "tabulação em " k; return }
      it[k] = v
    }
    {
      linha = $0; sub(/\r$/, "", linha)
      if (NR == 1) { if (linha !~ /^---[ \t]*$/) { print "ERRO\tsem frontmatter"; fim = 1; exit } ; next }
      if (linha ~ /^---[ \t]*$/) { fechou = 1; exit }
      if (linha ~ /^[ \t]*$/) next
      if (linha ~ /^[A-Za-z_][A-Za-z0-9_]*:/) {
        flush(); em_lista = 0
        k = linha; sub(/:.*/, "", k)
        v = linha; sub(/^[^:]*:[ \t]*/, "", v)
        if (k in visto) { bad = "chave repetida: " k }
        visto[k] = 1
        if (k == "arquivos") {
          sub(/[ \t]+$/, "", v)
          if (v == "[]") print "escalar\tarquivos\t[]"
          else if (v == "") { em_lista = 1; print "escalar\tarquivos\tlista" }
          else bad = "arquivos deve ser [] ou lista"
        } else {
          v = unq(v)
          if (v ~ /\t/) bad = "tabulação em " k
          else print "escalar\t" k "\t" v
        }
      } else if (em_lista && linha ~ /^  - [a-z_0-9]+:/) {
        flush(); em_item = 1
        r = linha; sub(/^  - /, "", r)
        k = r; sub(/:.*/, "", k); v = r; sub(/^[^:]*:[ \t]*/, "", v)
        item_chave(k, v)
      } else if (em_lista && em_item && linha ~ /^    [a-z_0-9]+:/) {
        r = linha; sub(/^    /, "", r)
        k = r; sub(/:.*/, "", k); v = r; sub(/^[^:]*:[ \t]*/, "", v)
        item_chave(k, v)
      } else bad = "linha não reconhecida: " linha
      if (bad != "") { print "ERRO\t" bad; fim = 1; exit }
    }
    END {
      if (fim) exit 1
      if (!fechou) { print "ERRO\tfrontmatter sem fechamento"; exit 1 }
      flush()
      if (bad != "") { print "ERRO\t" bad; exit 1 }
    }
  ' "$1"
}

# Lê o frontmatter para <destino>, sem subshell: RB_ERRO chega ao chamador.
_rb_ler_arq() { # <arquivo> <destino>
  [ -r "${1:-}" ] || { RB_ERRO="artefato ilegível: ${1:-}"; return 1; }
  local erro
  _rb_ler_awk "$1" > "$2" 2>/dev/null
  erro="$(sed -n 's/^ERRO	//p' "$2" | head -n1)"
  if [ -n "$erro" ]; then RB_ERRO="frontmatter inválido: $erro"; return 1; fi
  return 0
}

rb_ler() { # <arquivo>
  local tmp
  tmp="$(mktemp)" || { RB_ERRO="mktemp falhou"; return 1; }
  _rb_ler_arq "$1" "$tmp" || { rm -f "$tmp"; return 1; }
  cat "$tmp"; rm -f "$tmp"
}

# Imprime a assinatura e a deixa em RB_ASSIN; chame sem subshell para ler RB_ERRO.
RB_ASSIN=""
rb_assinatura() { # <arquivo>
  local tmp lido cab arqs
  tmp="$(mktemp)" || { RB_ERRO="mktemp falhou"; return 1; }
  _rb_ler_arq "$1" "$tmp" || { rm -f "$tmp"; return 1; }
  lido="$(cat "$tmp")"
  cab="$(printf '%s\n' "$lido" | awk -F'\t' '
    $1 == "escalar" { v[$2] = $3 }
    END {
      m = split("numero anterior trabalho_id b0_sha p1_sha b1_sha m_sha", ch, " ")
      for (i = 1; i <= m; i++) printf "%s=%s\n", ch[i], v[ch[i]]
    }')"
  arqs="$(printf '%s\n' "$lido" | awk -F'\t' '$1 == "arquivo" { print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $6 }' | LC_ALL=C sort)"
  { printf '%s\n' "$cab"; [ -z "$arqs" ] || printf '%s\n' "$arqs"; } > "$tmp"
  rb_sha256 < "$tmp" > "$tmp.h" || { rm -f "$tmp" "$tmp.h"; return 1; }
  RB_ASSIN="$(cat "$tmp.h")"; rm -f "$tmp" "$tmp.h"
  printf '%s\n' "$RB_ASSIN"
}

# Escapa \ e " e envolve em aspas duplas (stdin -> stdout, sem quebra final).
_rb_aspas() {
  awk '
    { n = length($0); out = ""
      for (i = 1; i <= n; i++) { c = substr($0, i, 1); if (c == "\\" || c == "\"") out = out "\\"; out = out c }
      printf "\"%s\"", out }
  '
}

_rb_q() { printf '%s' "$1" | _rb_aspas; }

# Cela de tabela Markdown: só a prosa; o frontmatter é a fonte.
_rb_cela() { printf '%s' "$1" | sed -e 's/|/\\|/g' -e 's/`/'"'"'/g'; }

rb_emitir() { # <saida> <tsv-escalares> <tsv-arquivos>
  [ "$#" -eq 3 ] || { RB_ERRO="rb_emitir: uso <saida> <tsv-escalares> <tsv-arquivos>"; return 1; }
  local saida="$1" esc="$2" arq="$3" tmp k v n lido
  [ -r "$esc" ] || { RB_ERRO="TSV de escalares ilegível: $esc"; return 1; }
  [ -r "$arq" ] || { RB_ERRO="TSV de arquivos ilegível: $arq"; return 1; }
  for k in expx_tool trabalho_id numero anterior branch branch_base origem_base b0_sha p1_sha b1_sha m_sha estado registrado_em; do
    awk -F'\t' -v k="$k" '$1 == k { f = 1 } END { exit !f }' "$esc" \
      || { RB_ERRO="escalar ausente: $k"; return 1; }
  done
  if awk -F'\t' '$1 !~ /^(expx_tool|trabalho_id|numero|anterior|branch|branch_base|origem_base|b0_sha|p1_sha|b1_sha|m_sha|estado|registrado_em)$/ && $1 != "" { f = 1 } END { exit !f }' "$esc"; then
    RB_ERRO="escalar desconhecido no TSV"; return 1
  fi
  if awk -F'\t' 'NF != 6 { f = 1 } END { exit !f }' "$arq"; then
    RB_ERRO="TSV de arquivos exige seis colunas por linha"; return 1
  fi
  tmp="${saida}.tmp.$$"
  {
    printf -- '---\n'
    printf 'expx_schema: 1\n'
    _rb_esc() { awk -F'\t' -v k="$1" '$1 == k { sub(/^[^\t]*\t/, ""); print; exit }' "$esc"; }
    printf 'expx_tool: %s\n' "$(_rb_esc expx_tool)"
    printf 'kind: reconciliacao_base\n'
    printf 'trabalho_id: %s\n' "$(_rb_q "$(_rb_esc trabalho_id)")"
    printf 'numero: %s\n' "$(_rb_esc numero)"
    v="$(_rb_esc anterior)"
    if [ "$v" = null ]; then printf 'anterior: null\n'; else printf 'anterior: %s\n' "$(_rb_q "$v")"; fi
    printf 'branch: %s\n' "$(_rb_q "$(_rb_esc branch)")"
    printf 'branch_base: %s\n' "$(_rb_q "$(_rb_esc branch_base)")"
    for k in origem_base b0_sha p1_sha b1_sha m_sha estado; do printf '%s: %s\n' "$k" "$(_rb_esc "$k")"; done
    if [ ! -s "$arq" ]; then
      printf 'arquivos: []\n'
    else
      printf 'arquivos:\n'
      awk -F'\t' '
        function q(s,   n, i, c, out) {
          n = length(s); out = ""
          for (i = 1; i <= n; i++) { c = substr(s, i, 1); if (c == "\\" || c == "\"") out = out "\\"; out = out c }
          return "\"" out "\""
        }
        { printf "  - caminho: %s\n    status_base: %s\n    blob_b1: %s\n    blob_m: %s\n    diff_b1_m_sha256: %s\n    motivo: %s\n", \
            q($1), $2, $3, $4, $5, q($6) }
      ' "$arq"
    fi
    printf 'registrado_em: %s\n' "$(_rb_esc registrado_em)"
    printf 'assinatura: %s\n' "0000000000000000000000000000000000000000000000000000000000000000"
    printf -- '---\n\n'
    printf 'Reconciliação de base %s do trabalho `%s`: a base `%s` (`%s`) foi integrada à branch `%s` no merge `%s`, anterior à abertura do pull request desta entrega.\n' \
      "$(_rb_esc numero)" "$(_rb_cela "$(_rb_esc trabalho_id)")" "$(_rb_cela "$(_rb_esc branch_base)")" \
      "$(_rb_esc b1_sha)" "$(_rb_cela "$(_rb_esc branch)")" "$(_rb_esc m_sha)"
    if [ -s "$arq" ]; then
      printf '\n| Caminho | Status na base | Motivo |\n|---|---|---|\n'
      awk -F'\t' '
        function c(s) { gsub(/\|/, "\\|", s); gsub(/`/, "\047", s); return s }
        { printf "| %s | %s | %s |\n", c($1), $2, c($6) }
      ' "$arq"
    else
      printf '\nA integração não exigiu ajuste em nenhum arquivo.\n'
    fi
  } > "$tmp" 2>/dev/null || { rm -f "$tmp"; RB_ERRO="não foi possível gravar $saida"; return 1; }
  rb_assinatura "$tmp" >/dev/null || { rm -f "$tmp"; return 1; }
  v="$RB_ASSIN"
  sed -i.bak "s/^assinatura: .*/assinatura: $v/" "$tmp" && rm -f "$tmp.bak" \
    || { rm -f "$tmp" "$tmp.bak"; RB_ERRO="não foi possível gravar a assinatura"; return 1; }
  n="$(_rb_esc numero)"
  if ! _rb_validar_conteudo "$tmp" "$(_rb_esc trabalho_id)" "$n"; then
    rm -f "$tmp"; return 1
  fi
  mv "$tmp" "$saida" || { rm -f "$tmp"; RB_ERRO="não foi possível gravar $saida"; return 1; }
}

_rb_hex() { printf '%s' "$2" | grep -Eq "^[0-9a-f]{$1}\$"; }

# Schema e assinatura; não olha o nome do arquivo.
_rb_validar_conteudo() { # <arquivo> <trabalho> <numero>
  local tl tipo arq="$1" trab="$2" num="$3" lido k v ant esperada n_arq l st bb bm ds mo caminho_vistos="" assin
  tl="$(mktemp)" || { RB_ERRO="mktemp falhou"; return 1; }
  _rb_ler_arq "$arq" "$tl" || { rm -f "$tl"; return 1; }
  lido="$(cat "$tl")"; rm -f "$tl"
  _rb_tem() { printf '%s\n' "$lido" | awk -F'\t' -v k="$1" '$1 == "escalar" && $2 == k { f = 1 } END { exit !f }'; }
  _rb_val() { printf '%s\n' "$lido" | awk -F'\t' -v k="$1" '$1 == "escalar" && $2 == k { print $3; exit }'; }
  for k in expx_schema expx_tool kind trabalho_id numero anterior branch branch_base origem_base \
           b0_sha p1_sha b1_sha m_sha estado arquivos registrado_em assinatura; do
    _rb_tem "$k" || { RB_ERRO="chave ausente: $k"; return 1; }
  done
  [ "$(_rb_val expx_schema)" = 1 ] || { RB_ERRO="expx_schema deve ser 1"; return 1; }
  case "$(_rb_val expx_tool)" in sprintx|runx) ;; *) RB_ERRO="expx_tool inválido: $(_rb_val expx_tool)"; return 1 ;; esac
  [ "$(_rb_val kind)" = reconciliacao_base ] || { RB_ERRO="kind deve ser reconciliacao_base"; return 1; }
  [ "$(_rb_val trabalho_id)" = "$trab" ] || { RB_ERRO="trabalho_id diverge de $trab"; return 1; }
  v="$(_rb_val numero)"
  printf '%s' "$v" | grep -Eq '^[1-9][0-9]*$' || { RB_ERRO="numero inválido: $v"; return 1; }
  [ "$v" = "$num" ] || { RB_ERRO="numero $v diverge do esperado $num"; return 1; }
  ant="$(_rb_val anterior)"
  if [ "$v" = 1 ]; then
    [ "$ant" = null ] || { RB_ERRO="anterior do 001 deve ser null"; return 1; }
  else
    esperada="$(printf 'RECONCILIACAO-BASE-%03d.md' $((v - 1)))"
    [ "$ant" = "$esperada" ] || { RB_ERRO="anterior deve ser $esperada (achou $ant)"; return 1; }
  fi
  [ -n "$(_rb_val branch)" ] || { RB_ERRO="branch vazio"; return 1; }
  [ -n "$(_rb_val branch_base)" ] || { RB_ERRO="branch_base vazio"; return 1; }
  case "$(_rb_val origem_base)" in registrada_e0|inferida_legado|reconciliacao_anterior) ;; *) RB_ERRO="origem_base inválida: $(_rb_val origem_base)"; return 1 ;; esac
  for k in b0_sha p1_sha b1_sha m_sha; do
    _rb_hex 40 "$(_rb_val "$k")" || { RB_ERRO="$k não é SHA de 40 hex"; return 1; }
  done
  case "$(_rb_val estado)" in ativa|superada) ;; *) RB_ERRO="estado inválido: $(_rb_val estado)"; return 1 ;; esac
  printf '%s' "$(_rb_val registrado_em)" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9:.+Z-]+)?$' \
    || { RB_ERRO="registrado_em não é data ISO"; return 1; }
  v="$(_rb_val arquivos)"
  n_arq="$(printf '%s\n' "$lido" | grep -c '^arquivo	')"
  case "$v" in
    '[]') [ "$n_arq" = 0 ] || { RB_ERRO="arquivos: [] com itens"; return 1; } ;;
    lista) [ "$n_arq" -ge 1 ] || { RB_ERRO="arquivos sem itens (use [])"; return 1; } ;;
    *) RB_ERRO="arquivos inválido"; return 1 ;;
  esac
  while IFS=$'\t' read -r tipo caminho st bb bm ds mo; do
    [ "$tipo" = arquivo ] || continue
    [ -n "$caminho" ] || { RB_ERRO="arquivo sem caminho"; return 1; }
    case "$caminho" in /*|..|../*|*/../*|*/..) RB_ERRO="caminho inválido: $caminho"; return 1 ;; esac
    case "
$caminho_vistos
" in *"
$caminho
"*) RB_ERRO="caminho repetido: $caminho"; return 1 ;; esac
    caminho_vistos="$caminho_vistos
$caminho"
    case "$st" in A|M) ;; *) RB_ERRO="status_base inválido em $caminho: '$st'"; return 1 ;; esac
    _rb_hex 40 "$bb" || { RB_ERRO="blob_b1 de $caminho não é SHA de 40 hex"; return 1; }
    _rb_hex 40 "$bm" || { RB_ERRO="blob_m de $caminho não é SHA de 40 hex"; return 1; }
    _rb_hex 64 "$ds" || { RB_ERRO="diff_b1_m_sha256 de $caminho não é sha256"; return 1; }
    [ -n "$mo" ] || { RB_ERRO="motivo vazio em $caminho"; return 1; }
    case "$mo" in *'{{'*) RB_ERRO="motivo com marcador de template em $caminho"; return 1 ;; esac
  done <<EOF
$(printf '%s\n' "$lido" | grep '^arquivo	')
EOF
  _rb_hex 64 "$(_rb_val assinatura)" || { RB_ERRO="assinatura não é sha256"; return 1; }
  rb_assinatura "$arq" >/dev/null || return 1
  assin="$RB_ASSIN"
  [ "$assin" = "$(_rb_val assinatura)" ] || { RB_ERRO="assinatura não confere: o artefato foi editado depois de gravado"; return 1; } # guarda:ASS
  return 0
}

rb_validar() { # <arquivo> <trabalho> <numero esperado>
  [ "$#" -eq 3 ] || { RB_ERRO="rb_validar: uso <arquivo> <trabalho> <numero>"; return 1; }
  local nome nnn
  nome="$(basename "$1")"
  printf '%s' "$nome" | grep -Eq '^RECONCILIACAO-BASE-[0-9]{3}\.md$' \
    || { RB_ERRO="nome fora do padrão RECONCILIACAO-BASE-NNN.md: $nome"; return 1; }
  nnn="$(printf '%s' "$nome" | sed 's/^RECONCILIACAO-BASE-0*\([0-9][0-9]*\)\.md$/\1/')"
  [ "$nnn" = "$3" ] || { RB_ERRO="NNN do nome ($nnn) diverge do número esperado ($3)"; return 1; }
  _rb_validar_conteudo "$1" "$2" "$3"
}
