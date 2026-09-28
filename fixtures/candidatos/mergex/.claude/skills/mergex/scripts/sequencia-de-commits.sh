#!/usr/bin/env bash
# sequencia-de-commits — a ordem de registro do E1 em `ENTREGA.commits`: ler a
# lista, validar a sequência, calcular o próximo `seq` e acrescentar o item novo.
#
# Contrato: references/00-schema.md, "A ordem de registro — a chave `seq`";
# references/01-commits.md, "Passo 4"; references/02-prontidao.md, "V11".
#
# `commits` guardava a ordem dos fechamentos só pela posição física da lista.
# Posição não tem identidade: não sobrevive a uma reordenação, não distingue
# duas passagens da mesma task e não diz, numa sessão nova, qual foi o último
# registro. `seq` dá identidade a essa ordem — e, de quebra, torna a lista
# prova da própria integridade.
#
#   1. `seq` é a ORDEM DE REGISTRO DO E1. Não é número de task, de sprint, de
#      rodada, nem timestamp, nem quantidade de commits da branch.
#   2. Positivo, monotônico e GLOBAL à ENTREGA. Nunca reutilizado, nunca
#      renumerado, nunca reordenado, nunca escolhido por task.
#   3. PREFIXO LEGADO: item sem `seq` só é aceito ENQUANTO nenhum item com
#      `seq` apareceu. Os N legados do início têm ordem efetiva 1..N pela
#      posição, e o primeiro item moderno vale N+1. Depois do primeiro `seq`,
#      nenhum item posterior pode voltar a omiti-lo.
#   4. A ordem efetiva de um item é a POSIÇÃO dele na lista. A lista é válida
#      quando todo `seq` explícito é igual à posição do seu item — é essa única
#      igualdade que recusa duplicata, buraco, regressão e reordenação.
#   5. NADA de backfill. Item legado nunca ganha `seq` retroativo: a migração
#      em massa está proibida (`references/00-schema.md`, "Regra de migração").
#   6. Sequência inválida é CONTRATO inválido: PARA. Nunca se "conserta"
#      escolhendo outro número — corrida é assunto de outra entrega, e um
#      número escolhido para caber esconderia o registro perdido.
#
# Uso:
#   sequencia-de-commits.sh --ler <ENTREGA.md|->
#       `ordem_efetiva<TAB>seq<TAB>task<TAB>commit`, um item por linha, na ordem
#       do arquivo. LEITURA CRUA: não valida a sequência (é ela que a V11 usa,
#       e a V11 não depende de ordem).
#   sequencia-de-commits.sh --validar <ENTREGA.md|->
#       0 e `commits=<n>` quando a sequência é válida; o motivo em stderr e 1
#       quando não é.
#   sequencia-de-commits.sh --proximo <ENTREGA.md|->
#       o próximo `seq` (maior efetivo + 1). Valida antes: lista inválida não
#       devolve número.
#   sequencia-de-commits.sh --acrescentar <ENTREGA.md> <task> <commit>
#       acrescenta `{seq, task, commit}` ao FIM da lista e imprime `seq=<n>`.
#       Não reordena, não reescreve item nenhum e não toca o resto do arquivo.
#
# Códigos: 0 ok; 1 contrato inválido ou arquivo ilegível; 64 opção inválida.
#
# Bash 3.2 (macOS): nada de mapfile, arrays associativos ou ${v,,}.

set -uo pipefail

ERRO=""

# O separador dos campos internos. TAB é espaço em branco de IFS: `IFS=$'\t'
# read` funde tabulações seguidas, e o campo `seq` VAZIO de um item legado
# empurraria `task` e `commit` uma casa para a esquerda, em silêncio. Por isso
# a linha é fatiada à mão, campo a campo, em vez de lida com `read` e IFS.
TAB=$'\t'

# campos <linha> — quebra `a<TAB>b<TAB>c<TAB>d` em CAMPO1..CAMPO4, preservando
# campo vazio. Quatro campos fixos: o que vier depois do terceiro TAB é o
# quarto, inteiro.
campos() {
  local l="$1" r
  CAMPO1="${l%%$TAB*}"; r="${l#*$TAB}"
  CAMPO2="${r%%$TAB*}"; r="${r#*$TAB}"
  CAMPO3="${r%%$TAB*}"; CAMPO4="${r#*$TAB}"
}

# ---------------------------------------------------------------------------
# Leitura do frontmatter. O bloco é a primeira coisa do arquivo, delimitado por
# `---`, e CR de fim de linha some.
# ---------------------------------------------------------------------------

# bloco <arquivo> <chave de topo> — as linhas indentadas sob a chave, dentro do
# frontmatter. Imprime `\001<valor inline>` na primeira linha quando a chave
# trouxe valor na mesma linha (`commits: []`).
bloco() {
  awk -v chave="$2" '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[[:space:]]*$/) { print "\002sem-frontmatter"; exit }; fm = 1; next }
    fm && /^---[[:space:]]*$/ { fechado = 1; exit }
    !fm { next }
    # Chave de topo (coluna 0). A indentada não abre nem fecha bloco nenhum.
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      nome = $0; sub(/:.*/, "", nome)
      if (nome == chave) {
        dentro = 1; visto = 1
        inline = $0; sub(/^[^:]*:[[:space:]]*/, "", inline); sub(/[[:space:]]+$/, "", inline)
        print "\001" inline
        next
      }
      dentro = 0; next
    }
    dentro { print }
    END {
      if (fm && !fechado) print "\002aberto"
      else if (!visto) print "\002sem-chave"
    }
  ' "$1"
}

# confere_bloco <saída de bloco> — traduz o marcador \002 em ERRO
confere_bloco() {
  case "$1" in
    *$'\002'sem-frontmatter*) ERRO="o arquivo não começa com frontmatter"; return 1 ;;
    *$'\002'aberto*)          ERRO="o frontmatter não foi fechado"; return 1 ;;
    *$'\002'sem-chave*)       ERRO="chave ausente no frontmatter"; return 1 ;;
  esac
  return 0
}

# escalar <arquivo> <chave de topo> — o valor de uma chave escalar de topo
escalar() {
  awk -v chave="$2" '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; fm = 1; next }
    fm && /^---[[:space:]]*$/ { exit }
    !fm { next }
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      nome = $0; sub(/:.*/, "", nome)
      if (nome != chave) next
      v = $0; sub(/^[^:]*:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
      print v; exit
    }
  ' "$1"
}

legivel() { # <arquivo>
  if [ "$1" = - ]; then return 0; fi
  [ -f "$1" ] && [ -r "$1" ] && return 0
  ERRO="arquivo ilegível: $1"; return 1
}

limpa() { # <valor> — tira aspas e espaço das pontas
  local v="$1"
  v="${v%"${v##*[![:space:]]}"}"; v="${v#"${v%%[![:space:]]*}"}"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s\n' "$v"
}

# ---------------------------------------------------------------------------
# A prova: um identificador de commit válido.
#
# O E1 registra o que `git rev-parse --short HEAD` devolveu — hexadecimal
# minúsculo, do tamanho curto do versionador ao SHA-1 inteiro. Vazio, `null`,
# marcador de template e qualquer coisa fora disso NÃO é prova.
# ---------------------------------------------------------------------------
sha_valido() { # <valor>
  case "$1" in
    ''|null|'~') return 1 ;;
    *[!0-9a-f]*) return 1 ;;
  esac
  case "${#1}" in
    7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# itens_de <ENTREGA.md> — `posicao<TAB>seq<TAB>task<TAB>commit` de CADA item de
# `ENTREGA.commits`, na ordem do arquivo. É a interpretação mecânica única da
# lista: quem precisa dela não reabre o YAML por conta própria.
#
# A posição conta TODO item, inclusive o malformado: é ela que dá a ordem
# efetiva, e pular um item aqui faria a sequência fechar sobre um buraco.
# O campo `seq` sai VAZIO no item legado — quem interpreta o vazio é quem chama.
# As chaves podem vir em qualquer ordem dentro do item.
# ---------------------------------------------------------------------------
itens_de() {
  local arq="$1" b
  legivel "$arq" || return 1
  b="$(bloco "$arq" commits)"
  confere_bloco "$b" || return 1
  # `commits: []` (inline) é lista vazia declarada: legítima, sem nenhum item.
  case "$(printf '%s\n' "$b" | head -1)" in
    $'\001'|$'\001'\[\]) ;;
    $'\001'*) ERRO="commits não é lista de itens: $(printf '%s\n' "$b" | head -1 | cut -c2-)"; return 1 ;;
  esac
  printf '%s\n' "$b" | awk '
    function chave(l,   k, v) {
      sub(/^[[:space:]]+/, "", l)
      if (l !~ /^[A-Za-z_][A-Za-z0-9_]*:/) return
      k = l; sub(/:.*/, "", k)
      v = l; sub(/^[^:]*:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
      gsub(/^["'"'"']|["'"'"']$/, "", v)
      if (k == "seq") s = v
      else if (k == "task") t = v
      else if (k == "commit") c = v
    }
    function emite() { if (aberto) { n++; printf "%d\t%s\t%s\t%s\n", n, s, t, c } }
    /^\001/ { next }
    { sub(/\r$/, "") }
    /^[[:space:]]*-/ {
      emite()
      s = ""; t = ""; c = ""; aberto = 1
      linha = $0; sub(/^[[:space:]]*-[[:space:]]*/, "", linha)
      chave(linha)
      next
    }
    aberto { chave($0) }
    END { emite() }
  '
}

# ler <ENTREGA.md> — `ordem_efetiva<TAB>seq<TAB>task<TAB>commit`.
# No item legado, `seq` é a ordem efetiva derivada da posição (regra 3).
ler() {
  local arq="$1" its linha
  its="$(itens_de "$arq")" || return 1
  [ -n "$its" ] || return 0
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    campos "$linha"
    printf '%s\t%s\t%s\t%s\n' "$CAMPO1" "${CAMPO2:-$CAMPO1}" "$CAMPO3" "$CAMPO4"
  done <<EOF
$its
EOF
}

inteiro_positivo() { # <valor>
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
  [ "$1" -gt 0 ] 2>/dev/null
}

# ---------------------------------------------------------------------------
# validar <ENTREGA.md> — a sequência inteira, numa única igualdade.
#
# Depois de considerar o prefixo legado como 1..N, os itens modernos precisam
# continuar exatamente N+1, N+2, N+3... Como a ordem efetiva de um item É a
# posição dele, isso equivale a: todo `seq` explícito é igual à sua posição.
# Duplicata, buraco, regressão e reordenação quebram essa igualdade — e é por
# isso que a mesma comparação recusa as quatro.
# ---------------------------------------------------------------------------
validar() {
  local arq="$1" its linha pos seq modernos=0 vistos=" " n=0
  its="$(itens_de "$arq")" || return 1
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    campos "$linha"; pos="$CAMPO1"; seq="$CAMPO2"
    n="$pos"
    if [ -z "$seq" ]; then
      if [ "$modernos" = 1 ]; then
        ERRO="item sem seq na posição $pos, depois de um item com seq: o prefixo legado terminou e não recomeça"
        return 1
      fi
      continue
    fi
    modernos=1
    inteiro_positivo "$seq" \
      || { ERRO="seq não é inteiro positivo na posição $pos: $seq"; return 1; }
    # A igualdade abaixo já recusaria o duplicado (duas posições nunca são o
    # mesmo número). O que este ramo acrescenta é o DIAGNÓSTICO: "seq duplicado"
    # manda procurar o item repetido; "fora da sequência" mandaria procurar um
    # buraco que não existe. Duplicata é caso nomeado do contrato e merece nome.
    case "$vistos" in
      *" $seq "*) ERRO="seq duplicado: $seq"; return 1 ;;
    esac
    [ "$seq" = "$pos" ] \
      || { ERRO="seq fora da sequência de registro: o item na posição $pos traz seq=$seq, esperado $pos"; return 1; }
    vistos="$vistos$seq "
  done <<EOF
$its
EOF
  printf 'commits=%s\n' "$n"
  return 0
}

# proximo <ENTREGA.md> — o maior seq efetivo + 1. Numa lista válida, o maior
# efetivo é a quantidade de itens: o prefixo legado ocupa 1..N e os modernos
# continuam a contagem. Lista inválida não devolve número nenhum.
proximo() {
  local arq="$1" n
  validar "$arq" >/dev/null || return 1
  n="$(itens_de "$arq" | wc -l | tr -d '[:space:]')"
  printf '%s\n' "$((n + 1))"
}

# ---------------------------------------------------------------------------
# acrescentar <ENTREGA.md> <task> <commit> — o item novo, no FIM, com seq.
#
# É o escritor canônico do E1 (e do E1 tardio). Ele NUNCA reescreve item
# existente, nunca reordena e nunca acrescenta item legado: gravação nova
# sempre leva `seq`. `atualizado_em` continua sendo do E1 — este helper mexe
# só na lista `commits`.
# ---------------------------------------------------------------------------
acrescentar() {
  local arq="$1" task="$2" commit="$3" seq tmp
  [ "$arq" != - ] || { ERRO="--acrescentar precisa de um arquivo, não de stdin"; return 1; }
  legivel "$arq" || return 1
  [ -w "$arq" ] || { ERRO="arquivo sem permissão de escrita: $arq"; return 1; }
  task="$(limpa "$task")"
  commit="$(limpa "$commit")"
  [ -n "$task" ] || { ERRO="item novo sem task: não há o que registrar"; return 1; }
  sha_valido "$commit" \
    || { ERRO="item novo com commit que não é prova: ${commit:-<vazio>}"; return 1; }
  seq="$(proximo "$arq")" || return 1

  tmp="$arq.seq.$$"
  awk -v seq="$seq" -v task="$task" -v commit="$commit" '
    function novo(cr) {
      printf "  - seq: %s%s\n    task: %s%s\n    commit: %s%s\n", seq, cr, task, cr, commit, cr
    }
    { linha = $0; nu = linha; sub(/\r$/, "", nu); cr = (linha == nu) ? "" : "\r" }
    NR == 1 { print; fm = 1; next }
    fm && !feito && nu ~ /^---[[:space:]]*$/ {
      if (dentro) { novo(cr); dentro = 0; feito = 1 }
      print; fm = 0; next
    }
    !fm { print; next }
    !feito && nu ~ /^commits:/ {
      inline = nu; sub(/^commits:[[:space:]]*/, "", inline)
      if (inline == "[]" || inline == "") {
        printf "commits:%s\n", cr
        if (inline == "[]") { novo(cr); feito = 1 } else { dentro = 1 }
        next
      }
      print; next
    }
    dentro && nu ~ /^[A-Za-z_][A-Za-z0-9_]*:/ { novo(cr); dentro = 0; feito = 1; print; next }
    { print }
    END { if (dentro && !feito) novo(cr) }
  ' "$arq" > "$tmp" || { rm -f "$tmp"; ERRO="falha ao reescrever $arq"; return 1; }

  mv "$tmp" "$arq" || { rm -f "$tmp"; ERRO="falha ao substituir $arq"; return 1; }
  printf 'seq=%s\n' "$seq"
}

# ---------------------------------------------------------------------------
# Executado como script: o CLI. Carregado com `.`: só as funções acima, para
# que exista UMA interpretação mecânica de `commits` no repositório inteiro.
# ---------------------------------------------------------------------------
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    --ler)
      [ "$#" -eq 2 ] || { printf 'sequencia-de-commits: --ler <ENTREGA.md|->\n' >&2; exit 64; }
      ler "$2" && exit 0
      printf 'sequencia-de-commits: %s\n' "$ERRO" >&2; exit 1 ;;
    --validar)
      [ "$#" -eq 2 ] || { printf 'sequencia-de-commits: --validar <ENTREGA.md|->\n' >&2; exit 64; }
      validar "$2" && exit 0
      printf 'sequencia-de-commits: %s\n' "$ERRO" >&2; exit 1 ;;
    --proximo)
      [ "$#" -eq 2 ] || { printf 'sequencia-de-commits: --proximo <ENTREGA.md|->\n' >&2; exit 64; }
      proximo "$2" && exit 0
      printf 'sequencia-de-commits: %s\n' "$ERRO" >&2; exit 1 ;;
    --acrescentar)
      [ "$#" -eq 4 ] || { printf 'sequencia-de-commits: --acrescentar <ENTREGA.md> <task> <commit>\n' >&2; exit 64; }
      acrescentar "$2" "$3" "$4" && exit 0
      printf 'sequencia-de-commits: %s\n' "$ERRO" >&2; exit 1 ;;
    *) printf 'sequencia-de-commits: opção desconhecida: %s\n' "${1:-}" >&2; exit 64 ;;
  esac
fi
