#!/usr/bin/env bash
# persistir-metodo — catálogo e lifecycle versionado dos artefatos de método.
#
# O trabalho corrente vem exclusivamente dos argumentos explícitos, conferidos
# contra ENTREGA.md. A branch ativa é somente uma prova de consistência.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_SH="$AQUI/../../../hooks/comum/base.sh"
TRAVA_SH="$AQUI/trava-do-e1.sh"
CONTRATO_SH="$AQUI/contrato-de-commit.sh"
SEGREDO_SH="$AQUI/../../../hooks/comum/sem-segredo.sh"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
PROVA_SH="$AQUI/prova-de-commit.sh"
# Só nos checkpoints pre-e6 e e8 com `portao: pronto`: sem ele (ou sem o
# validador ao lado), a prova falha e o checkpoint é recusado (falha fechada).
ATIVACAO_SH="$AQUI/ativacao-pre-push.sh"

for dependencia in "$BASE_SH" "$TRAVA_SH" "$CONTRATO_SH" "$SEGREDO_SH" "$CATALOGO_SH" "$PROVA_SH"; do
  [ -r "$dependencia" ] || { printf 'persistir-metodo: dependência indisponível: %s\n' "$dependencia" >&2; exit 1; }
done
# shellcheck source=../../../hooks/comum/base.sh
. "$BASE_SH"
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
set +e

MODO=""
ENTREGA=""
ORIGEM=""
TRABALHO=""
CHECKPOINT=""

uso() {
  printf '%s\n' \
    'uso: persistir-metodo.sh --listar|--persistir|--verificar --entrega <ENTREGA.md> --origem <sprintx|runx> --trabalho <id> --checkpoint <pre-e2|reconciliacao-base|predecessores|retomar-v9-predecessores|pre-e6|e8>' >&2
  exit 64
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --listar) [ -z "$MODO" ] || uso; MODO=listar; shift ;;
    --persistir) [ -z "$MODO" ] || uso; MODO=persistir; shift ;;
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    --checkpoint) [ "$#" -ge 2 ] || uso; CHECKPOINT="$2"; shift 2 ;;
    *) uso ;;
  esac
done

case "$MODO" in listar|persistir|verificar) ;; *) uso ;; esac
case "$ORIGEM" in sprintx|runx) ;; *) uso ;; esac
case "$CHECKPOINT" in pre-e2|reconciliacao-base|predecessores|retomar-v9-predecessores|pre-e6|e8) ;; *) uso ;; esac
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto) uso ;;
esac

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  printf 'persistir-metodo: fora de um repositório Git\n' >&2
  exit 1
}

fm() { expx_frontmatter_valor "$1" "$2"; }

para() {
  printf 'persistir-metodo: %s\n' "$1" >&2
  exit 1
}

TOKEN=""
LIBERAR_NA_SAIDA=0
TMP_LISTA=""
TMP_MSG=""
TMP_CATALOGO=""
TMP_HIST=""
TMP_STATUS=""

encerrar() {
  local rc="$1"
  [ -z "$TMP_LISTA" ] || rm -f "$TMP_LISTA"
  [ -z "$TMP_MSG" ] || rm -f "$TMP_MSG"
  [ -z "$TMP_CATALOGO" ] || rm -f "$TMP_CATALOGO"
  [ -z "$TMP_HIST" ] || rm -rf "$TMP_HIST"
  [ -z "$TMP_STATUS" ] || rm -f "$TMP_STATUS"
  [ -z "${TMP_PROVA:-}" ] || rm -f "$TMP_PROVA"
  if [ "$LIBERAR_NA_SAIDA" = 1 ] && [ -n "$TOKEN" ]; then
    liberar "$TOKEN" >/dev/null 2>&1
  fi
  exit "$rc"
}
trap 'encerrar $?' EXIT

if [ "$MODO" = persistir ]; then
  SAIDA_TRAVA="$(adquirir "metodo:$CHECKPOINT")"; RC_TRAVA=$?
  if [ "$RC_TRAVA" = 2 ]; then
    printf 'persistir-metodo: índice ocupado pela trava C5\n' >&2
    exit 2
  fi
  [ "$RC_TRAVA" = 0 ] || para 'não foi possível adquirir a trava C5 do índice'
  TOKEN="$(printf '%s\n' "$SAIDA_TRAVA" | awk -F= '$1 == "token" { print $2 }')"
  [ -n "$TOKEN" ] || para 'a trava C5 foi criada sem token'
  LIBERAR_NA_SAIDA=1
fi

if [ "$MODO" = persistir ] || [ "$MODO" = verificar ]; then
  if [ -n "$(git diff --cached --name-only 2>/dev/null)" ]; then
    para 'o stage já estava preenchido; nada foi limpo ou adotado'
  fi
fi

# O caminho da entrega também é evidência explícita: ele não é procurado por
# branch, mtime ou glob. Aceita apenas a forma canônica relativa ao repositório.
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
ENTREGA_ESPERADA="docs/entregas/$TRABALHO/ENTREGA.md"
[ "$ENTREGA" = "$ENTREGA_ESPERADA" ] || para "--entrega deve ser $ENTREGA_ESPERADA"
[ -f "$RAIZ/$ENTREGA" ] && [ ! -L "$RAIZ/$ENTREGA" ] || para "$ENTREGA não é arquivo regular"
[ "$(fm "$RAIZ/$ENTREGA" kind)" = entrega ] || para "$ENTREGA não declara kind: entrega"
[ "$(fm "$RAIZ/$ENTREGA" trabalho_id)" = "$TRABALHO" ] || para "trabalho explícito diverge de ENTREGA.trabalho_id"
[ "$(fm "$RAIZ/$ENTREGA" expx_tool)" = "$ORIGEM" ] || para "origem explícita diverge de ENTREGA.expx_tool"

BRANCH="$(git branch --show-current 2>/dev/null)" || BRANCH=""
[ -n "$BRANCH" ] || para 'HEAD destacado: branch não pode provar consistência'
[ "$(fm "$RAIZ/$ENTREGA" branch)" = "$BRANCH" ] || para "branch ativa diverge de ENTREGA.branch"

catalogo_pasta_do_trabalho "$RAIZ" "$ORIGEM" "$TRABALHO" >/dev/null || para "$CATALOGO_ERRO" # guarda:PASTA-CATALOGO
PASTA="$CATALOGO_PASTA"

ORQUESTRADOR="$RAIZ/$PASTA/ORQUESTRADOR.md"
[ -f "$ORQUESTRADOR" ] && [ ! -L "$ORQUESTRADOR" ] || para "$PASTA/ORQUESTRADOR.md não é arquivo regular"
[ "$(fm "$ORQUESTRADOR" kind)" = orquestrador ] || para "$PASTA/ORQUESTRADOR.md não declara kind: orquestrador"
[ "$(fm "$ORQUESTRADOR" trabalho_id)" = "$TRABALHO" ] || para "ORQUESTRADOR.md pertence a outro trabalho"

TMP_LISTA="$(mktemp "${TMPDIR:-/tmp}/mergex-metodo.XXXXXX")" || para 'não foi possível criar lista temporária'

sujo() {
  [ -n "$(git -C "$RAIZ" status --porcelain=v1 --untracked-files=all -- "$1" 2>/dev/null)" ]
}

adiciona() {
  local caminho="$1"
  [ -f "$RAIZ/$caminho" ] && [ ! -L "$RAIZ/$caminho" ] || return 0
  sujo "$caminho" || return 0
  printf '%s\n' "$caminho" >> "$TMP_LISTA"
}

HISTORICO_GLOBAL='docs/sprintx/estimativas/HISTORICO.md'

# ler_historico <arquivo> — o leitor limitado ÚNICO do HISTORICO global
# (DM-174, DM-175). A primeira criação, a versão de HEAD e a versão da working
# tree passam por ele, então as três têm exatamente a mesma interpretação. Não
# é parser YAML geral: é a gramática fechada de `estimativa_historico`.
#
# O frontmatter é a fonte de máquina (contrato expx-schema da sprintx); a
# prosa abaixo dele é representação humana. O leitor lê os valores efetivos do
# YAML — comentário de linha inteira não existe para o YAML, e comentário ao
# fim da linha só começa num "#" precedido de espaço, fora de aspas — e não
# procura task nem trabalho em texto livre. No corpo, só as linhas de dados
# das duas tabelas oficiais ("## Entradas" e calibração) viram fato; parágrafo,
# heading, exemplo, código e tabela humana ficam fora. Marcador "{{...}}" do
# template barra no frontmatter e nas linhas de dados oficiais; na prosa ele é
# texto — o próprio template diz "Substitua TODOS os marcadores `{{...}}`".
#
# Escalar entre aspas vale pelo valor, não pela grafia (DM-176): todo escalar
# do frontmatter — cabeçalho, campos, identidade e itens de sinais — passa
# pelo decodificador único `decodifica`. Aspas simples só desdobram ''; aspas
# duplas decodificam o subconjunto suportado. Escape cujo valor não caiba num
# campo de uma linha, ou que o leitor não suporte, barra: nunca é conservado
# como texto. Caractere de controle nunca entra na saída, que usa TAB, \034 e
# \037 como separadores.
#
# Saída, só quando o arquivo é válido: um fato por linha, campos por TAB.
#   E <trabalho_id> <task_id> <tipo_task> <area> <sinais> <estimado_min>
#     <estimado_max> <estimado_media> <real> <duracao_observada> <desvio>
#     <registrado_em>
#   C <tipo_task> <entradas> <desvio_medio> <fator_ativo>
#   L <trabalho> <task>     linha de dados da tabela oficial de "## Entradas"
#   K <tipo>                linha de dados da tabela oficial de calibração
# De tipo_task em diante (E) e de entradas em diante (C), cada valor sai no
# tipo YAML efetivo, independente de aspas, ordem de chaves, comentário ou
# forma da lista: `s:texto`, `n:número canônico`, `b:true|false`, `null`,
# `l:` com os itens separados por \037, e `-` quando a chave falta.
# Inválido: rc 1 e o motivo, numa linha, na saída.
ler_historico() { # <arquivo>
  awk '
    function erro(m) { if (!falhou) print m; falhou = 1; exit 1 }
    function apara(v) { sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v); return v }
    function recuo_de(l) { return match(l, /[^ ]/) - 1 }
    function marcador(   p) {
      p = index($0, "{{")
      return p && index(substr($0, p + 2), "}}")
    }
    function controle(s,   i) {
      for (i = 1; i <= length(s); i++) if (index(CONTROLE, substr(s, i, 1))) return 1
      return 0
    }
    # \xHH do subconjunto: só ASCII imprimível (20–7E). Controle, DEL e byte
    # fora de ASCII (que o YAML leria como outro code point) barram.
    function ascii_hexa(h, v,   a, b) {
      a = index("0123456789abcdef", tolower(substr(h, 1, 1)))
      b = index("0123456789abcdef", tolower(substr(h, 2, 1)))
      if (length(h) != 2 || !a || !b) erro("escape \\x sem dois dígitos hexadecimais: " v)
      a = (a - 1) * 16 + b - 1
      if (a < 32 || a > 126) erro("escape \\x fora de ASCII imprimível (campos são de uma linha): " v)
      return sprintf("%c", a)
    }
    # O decodificador ÚNICO de escalar entre aspas (DM-176): recebe o token
    # com as aspas, como sem_comentario o devolve, e dá o valor efetivo ou
    # barra. Não é parser YAML geral.
    function decodifica(v,   q, s, r, i, c) {
      q = substr(v, 1, 1); s = substr(v, 2, length(v) - 2); r = ""
      if (q == "\047") {
        # Aspas simples: a barra invertida é texto; só a aspa dobrada vira uma.
        gsub("\047\047", "\047", s)
        r = s
      } else for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c != "\\") { r = r c; continue }
        c = substr(s, ++i, 1)
        if (c == "") erro("escape inválido em texto entre aspas duplas: " v)
        else if (c == "\"") r = r "\""
        else if (c == "\\") r = r "\\"
        else if (c == "/") r = r "/"
        else if (c == " ") r = r " "
        else if (c == "x") { r = r ascii_hexa(substr(s, i + 1, 2), v); i += 2 }
        else if (c == "\t" || index("0abtnvfreNLP", c)) erro("escape que produz controle ou quebra de linha (campos são de uma linha): " v)
        else if (c == "u" || c == "U" || c == "_") erro("escape YAML fora do subconjunto suportado pelo leitor: " v)
        else erro("escape inválido em texto entre aspas duplas: " v)
      }
      if (controle(r)) erro("caractere de controle no valor (campos são de uma linha): " v)
      return r
    }
    # Separa o escalar do comentário. Entre aspas devolve o token com as
    # aspas (decodifica dá o valor); aspas abertas e não fechadas seriam
    # texto multilinha, que o contrato proíbe (regra 8): barra.
    function sem_comentario(v,   q, i, c, fim, resto) {
      v = apara(v); aspas = 0
      if (controle(v)) erro("caractere de controle no valor (campos são de uma linha): " v)
      q = substr(v, 1, 1)
      if (q == "\"" || q == "\047") {
        fim = 0
        for (i = 2; i <= length(v); i++) {
          c = substr(v, i, 1)
          if (q == "\"" && c == "\\") { i++; continue }
          if (c != q) continue
          if (q == "\047" && substr(v, i + 1, 1) == "\047") { i++; continue }
          fim = i; break
        }
        if (!fim) erro("texto entre aspas sem fechamento na mesma linha: " v)
        resto = substr(v, fim + 1)
        if (resto !~ /^[[:space:]]*$/ && resto !~ /^[[:space:]]+#/) erro("conteúdo depois das aspas: " v)
        aspas = 1
        return substr(v, 1, fim)
      }
      if (q == "#") return ""
      if (match(v, /[[:space:]]#/)) v = substr(v, 1, RSTART - 1)
      return apara(v)
    }
    function escalar(v) {
      v = sem_comentario(v)
      if (aspas) return decodifica(v)
      if (v ~ /^[|>]/) erro("texto multilinha fora do contrato (campos são de uma linha): " v)
      return v
    }
    # Tipo efetivo de um escalar sem aspas (YAML core): nulo, booleano,
    # número em forma canônica (3.50 = 3.5) ou texto.
    function tipado(v,   s) {
      if (v == "" || v == "~" || v == "null" || v == "Null" || v == "NULL") return "null"
      if (v == "true" || v == "True" || v == "TRUE") return "b:true"
      if (v == "false" || v == "False" || v == "FALSE") return "b:false"
      if (v !~ /^[-+]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/) return "s:" v
      s = ""
      if (substr(v, 1, 1) == "+") v = substr(v, 2)
      else if (substr(v, 1, 1) == "-") { s = "-"; v = substr(v, 2) }
      if (index(v, ".")) { sub(/0+$/, "", v); sub(/\.$/, "", v) }
      sub(/^0+/, "", v)
      if (v == "" || substr(v, 1, 1) == ".") v = "0" v
      if (v == "0") s = ""
      return "n:" s v
    }
    function efetivo(v) {
      v = sem_comentario(v)
      if (aspas) return "s:" decodifica(v)
      return tipado(v)
    }
    # Um sinal é um escalar simples: sem estrutura aninhada, sem vírgula que
    # torne a lista ambígua, sem par chave:valor.
    function sinal_valido(v) {
      v = sem_comentario(v)
      if (aspas) return decodifica(v) != ""
      if (v == "") return 0
      if (index("-?:,#&*!|>%@`[]{}", substr(v, 1, 1))) return 0
      if (index(v, "[") || index(v, "]") || index(v, "{") || index(v, "}") || index(v, ",")) return 0
      if (v ~ /:[[:space:]]/ || v ~ /:$/) return 0
      return 1
    }
    # sinais: [a, b] | sinais: [] | sinais: seguido de itens "- a" mais
    # recuados que a chave. Qualquer outra forma barra. As três formas da
    # mesma lista produzem o mesmo valor.
    function trata_sinais(valor, coluna,   v, interior, n, it, i) {
      v = sem_comentario(valor)
      if (!aspas && v == "") {
        sinais_aberto = 1; sinais_recuo = coluna; sinais_item_recuo = -1; sinais_n = 0; sinais_val = ""
        return
      }
      if (aspas || v !~ /^\[.*\]$/) erro("sinais fora do formato de lista: " v)
      val["sinais"] = "l:"
      interior = substr(v, 2, length(v) - 2)
      if (apara(interior) == "") return
      n = split(interior, it, ",")
      for (i = 1; i <= n; i++) {
        if (!sinal_valido(it[i])) erro("sinais com item inválido ou ambíguo: " v)
        val["sinais"] = val["sinais"] (i > 1 ? "\037" : "") efetivo(it[i])
      }
    }
    function item_sinal(   r, v) {
      r = recuo_de($0)
      if (sinais_item_recuo < 0) sinais_item_recuo = r
      else if (r != sinais_item_recuo) erro("sinais com recuo inconsistente: " $0)
      v = $0; sub(/^ +- /, "", v)
      if (!sinal_valido(v)) erro("sinais com item inválido ou ambíguo: " apara(v))
      sinais_val = sinais_val (sinais_n ? "\037" : "") efetivo(v)
      sinais_n++
    }
    function fecha_sinais() {
      if (!sinais_aberto) return
      sinais_aberto = 0
      if (sinais_n == 0) erro("sinais sem lista (lista vazia é [])")
      val["sinais"] = "l:" sinais_val
    }
    function valor_de(k) { return (k in val) ? val[k] : "-" }
    function fecha_item(   k, i, linha) {
      if (!item) return
      if (secao == "entradas" && !("trabalho_id" in tem)) erro("entrada sem trabalho_id")
      if (secao == "entradas" && !("task_id" in tem)) erro("entrada sem task_id")
      if (secao == "calibracao" && !("tipo_task" in tem)) erro("calibração sem tipo_task")
      if (secao == "entradas") {
        k = bruto["trabalho_id"] SUBSEP bruto["task_id"]
        if (k in registrada) erro("entrada duplicada: " bruto["trabalho_id"] " " bruto["task_id"])
        registrada[k] = 1
        linha = "E\t" bruto["trabalho_id"] "\t" bruto["task_id"]
        for (i = 3; i <= n_entrada; i++) linha = linha "\t" valor_de(ordem_entrada[i])
      } else {
        linha = "C\t" bruto["tipo_task"]
        for (i = 2; i <= n_calibracao; i++) linha = linha "\t" valor_de(ordem_calibracao[i])
      }
      fatos[++n_fatos] = linha
      for (k in tem) delete tem[k]
      for (k in val) delete val[k]
      for (k in bruto) delete bruto[k]
      item = 0
    }
    function campo(chave, valor, coluna,   v) {
      if (secao == "entradas") {
        if (!(chave in campo_entrada)) erro("entrada com chave fora do contrato: " chave)
      } else if (secao == "calibracao") {
        if (!(chave in campo_calibracao)) erro("calibração com chave fora do contrato: " chave)
      } else erro("item fora de entradas/calibracao")
      if (chave in tem) erro("chave repetida no mesmo item: " chave)
      tem[chave] = 1
      if (chave == "sinais") { trata_sinais(valor, coluna); return }
      v = escalar(valor)
      bruto[chave] = v
      val[chave] = aspas ? "s:" v : tipado(v)
      if (chave == "tipo_task" && !(v in tipo)) erro("tipo_task fora do enum: " v)
    }
    function titulo(   nivel, texto) {
      match($0, /^#+/); nivel = RLENGTH
      texto = apara(substr($0, nivel + 1)); sub(/[[:space:]]+#+$/, "", texto)
      tabela = ""; separador = 0
      if (nivel > 2) return
      secao_corpo = ""
      if (texto == "Entradas") { secao_corpo = "entradas"; oficial_vista = 0 }
      else if (index(texto, "Calibração") == 1) secao_corpo = "calibracao"
    }
    # Tabela oficial: a de "## Entradas" (cabeçalho publicado começa por
    # Trabalho) e a de calibração (Tipo de task). Qualquer outra é humana.
    function linha_tabela(   partes, c1, c2) {
      split($0, partes, "|")
      c1 = apara(partes[2]); c2 = apara(partes[3])
      if (tabela == "") {
        if (secao_corpo == "entradas" && c1 == "Trabalho") tabela = "entradas"
        else if (secao_corpo == "entradas" && !oficial_vista)
          erro("a tabela de ## Entradas não tem o cabeçalho publicado: " c1)
        else if (secao_corpo == "calibracao" && c1 == "Tipo de task") tabela = "calibracao"
        else tabela = "humana"
        if (secao_corpo == "entradas") oficial_vista = 1
        separador = (tabela != "humana"); return
      }
      if (tabela == "humana") return
      if (separador) {
        if ($0 !~ /^[[:space:]]*\|([[:space:]]*:?-+:?[[:space:]]*\|)+[[:space:]]*$/)
          erro("tabela sem linha separadora")
        separador = 0; return
      }
      if (marcador()) erro("marcador do template não substituído em linha oficial de dados: " apara($0))
      if (controle(c1) || controle(c2)) erro("caractere de controle em linha oficial de dados: " apara($0))
      if (tabela == "entradas") {
        if ((c1 SUBSEP c2) in linha_vista) erro("linha duplicada na tabela de entradas: " c1 " " c2)
        linha_vista[c1 SUBSEP c2] = 1
        fatos[++n_fatos] = "L\t" c1 "\t" c2
      } else {
        if (!(c1 in tipo)) erro("linha da tabela de calibração fora do enum tipo_task: " c1)
        fatos[++n_fatos] = "K\t" c1
      }
    }
    BEGIN {
      n = split("expx_schema expx_tool kind trabalho_id atualizado_em unidade entradas calibracao", lista, " ")
      for (i = 1; i <= n; i++) { topo[lista[i]] = 1; ordem[i] = lista[i] }
      n_topo = n
      n_entrada = split("trabalho_id task_id tipo_task area sinais estimado_min estimado_max estimado_media real duracao_observada desvio registrado_em", ordem_entrada, " ")
      for (i = 1; i <= n_entrada; i++) campo_entrada[ordem_entrada[i]] = 1
      n_calibracao = split("tipo_task entradas desvio_medio fator_ativo", ordem_calibracao, " ")
      for (i = 1; i <= n_calibracao; i++) campo_calibracao[ordem_calibracao[i]] = 1
      n = split("config client dominio persistencia api ui integracao_externa teste infra refatoracao", lista, " ")
      for (i = 1; i <= n; i++) tipo[lista[i]] = 1
      # C0 e DEL: nenhum cabe num campo de uma linha, e TAB, \034 e \037
      # separam a saída. NUL nem chega a string portável de awk.
      CONTROLE = ""
      for (i = 1; i < 32; i++) CONTROLE = CONTROLE sprintf("%c", i)
      CONTROLE = CONTROLE sprintf("%c", 127)
      estado = "inicio"
    }
    { sub(/\r$/, "") }
    estado == "inicio" {
      if ($0 !~ /^---[[:space:]]*$/) erro("não começa por frontmatter")
      estado = "fm"; next
    }
    estado == "fm" && marcador() { erro("marcador do template não substituído no frontmatter: " apara($0)) }
    estado == "fm" && /^---[[:space:]]*$/ { fecha_sinais(); fecha_item(); estado = "corpo"; next }
    estado == "fm" {
      if ($0 ~ /^[[:space:]]*$/) next
      if ($0 ~ /^ *#/) next
      if ($0 ~ /\t/) erro("frontmatter com tabulação")
      if (sinais_aberto) {
        if ($0 ~ /^ +- / && recuo_de($0) > sinais_recuo) { item_sinal(); next }
        fecha_sinais()
      }
      if ($0 ~ /^[a-z0-9_]+:$/ || $0 ~ /^[a-z0-9_]+: /) {
        fecha_item()
        chave = $0; sub(/:.*/, "", chave)
        valor = $0; sub(/^[^:]*:/, "", valor)
        if (!(chave in topo)) erro("chave de topo fora do contrato: " chave)
        if (chave in visto) erro("chave de topo repetida: " chave)
        visto[chave] = 1; valor_topo[chave] = escalar(valor)
        secao = ""; recuo_secao = -1
        if (chave == "entradas" || chave == "calibracao") {
          if (valor_topo[chave] == "") secao = chave
          else if (valor_topo[chave] != "[]") erro(chave " fora do formato de lista")
        }
        next
      }
      if ($0 ~ /^ +- [a-z0-9_]+:$/ || $0 ~ /^ +- [a-z0-9_]+: /) {
        fecha_item(); item = 1
        recuo = recuo_de($0)
        if (recuo_secao < 0) recuo_secao = recuo
        else if (recuo != recuo_secao) erro("item com recuo inconsistente: " $0)
        resto = $0; sub(/^ +- /, "", resto)
        chave = resto; sub(/:.*/, "", chave)
        valor = resto; sub(/^[^:]*:/, "", valor)
        campo(chave, valor, recuo + 2); next
      }
      if ($0 ~ /^ +[a-z0-9_]+:$/ || $0 ~ /^ +[a-z0-9_]+: /) {
        if (!item || recuo_de($0) != recuo + 2) erro("linha fora de item: " $0)
        chave = $0; sub(/^ +/, "", chave); sub(/:.*/, "", chave)
        valor = $0; sub(/^[^:]*:/, "", valor)
        campo(chave, valor, recuo + 2); next
      }
      erro("linha não reconhecida no frontmatter: " $0)
    }
    estado == "corpo" {
      if ($0 ~ /^[[:space:]]*```/) { cerca = !cerca; tabela = ""; separador = 0; next }
      if (cerca) next
      if ($0 ~ /^#+[[:space:]]/) { titulo(); next }
      if ($0 ~ /^[[:space:]]*\|/) { linha_tabela(); next }
      # Tabela sem a barra inicial também renderiza: em "## Entradas" ela
      # escaparia da prova das linhas de dados, então barra.
      if (secao_corpo == "entradas" && $0 ~ /\|/ && $0 ~ /^[[:space:]]*:?-+:?[[:space:]]*(\|[[:space:]]*:?-+:?[[:space:]]*)+\|?[[:space:]]*$/)
        erro("tabela de ## Entradas sem a barra inicial do formato publicado")
      tabela = ""; separador = 0
    }
    END {
      if (falhou) exit 1
      if (estado != "corpo") { print "frontmatter não fechado"; exit 1 }
      for (i = 1; i <= n_topo; i++)
        if (!(ordem[i] in visto)) { print "falta a chave " ordem[i]; exit 1 }
      if (valor_topo["expx_schema"] != "1") { print "expx_schema não é 1"; exit 1 }
      if (valor_topo["expx_tool"] != "sprintx") { print "expx_tool não é sprintx"; exit 1 }
      if (valor_topo["kind"] != "estimativa_historico") { print "kind não é estimativa_historico"; exit 1 }
      if (valor_topo["trabalho_id"] != "null") { print "trabalho_id do cabeçalho não é null"; exit 1 }
      if (valor_topo["unidade"] != "h") { print "unidade não é h"; exit 1 }
      if (valor_topo["atualizado_em"] !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) {
        print "atualizado_em fora de AAAA-MM-DD"; exit 1
      }
      for (i = 1; i <= n_fatos; i++) print fatos[i]
    }
  ' "$1" 2>&1
}

# Tasks concluídas do trabalho corrente, pelo leitor único da V11, sobre os
# tasks.md que o catálogo reconhece como sprints deste trabalho.
CONCLUIDAS=""
tasks_concluidas() {
  local dir nome
  set --
  for dir in "$RAIZ/$PASTA"/sprint-*; do
    [ -d "$dir" ] || continue
    nome="$(basename "$dir")"
    printf '%s\n' "$nome" | grep -Eq '^sprint-[0-9]{2,}$' || continue
    [ -f "$dir/tasks.md" ] && set -- "$@" "$dir/tasks.md"
  done
  CONCLUIDAS=""
  [ "$#" -gt 0 ] || return 0
  CONCLUIDAS="$(bash "$PROVA_SH" --concluidas "$@" 2>/dev/null)" || return 1
  CONCLUIDAS="$(printf '%s\n' "$CONCLUIDAS" | cut -f1 | LC_ALL=C sort -u)"
}

# confere_ownership_historico <base> <final> — compara duas saídas de
# ler_historico (DM-175). A base é a versão de HEAD; na primeira criação ela é
# vazia, e a mesma regra vira a prova integral da DM-174.
#
# O HISTORICO é append-only quanto às ENTRADAS, não quanto aos bytes:
#   - toda entrada da base continua existindo, com o mesmo trabalho_id e
#     task_id e o mesmo valor efetivo em todos os campos;
#   - toda entrada que não estava na base é do trabalho corrente, de task
#     concluída dele, e está no schema da sprintx (duplicata já barrou no
#     leitor);
#   - toda linha da tabela oficial de Entradas da base continua lá, e toda
#     linha final corresponde a uma entrada do frontmatter final;
#   - calibracao é derivada: pode mudar, mas termina estruturalmente válida e
#     coerente com as entradas finais. O valor exato de desvio_medio não é
#     provado aqui: a sprintx não fixa agregação nem arredondamento.
# atualizado_em, a tabela de calibração e a prosa podem mudar à vontade.
confere_ownership_historico() { # <base> <final>
  HIST_TRABALHO="$TRABALHO" HIST_CONCLUIDAS="$CONCLUIDAS" awk '
    function erro(m) { if (!falhou) print m; falhou = 1; exit 1 }
    function chave(t, k) { return t SUBSEP k }
    function registro(   i, r) { r = $4; for (i = 5; i <= NF; i++) r = r "\t" $i; return r }
    function numero(v) { return v ~ /^n:[0-9]/ }
    function numero_ou_nulo(v) { return v == "null" || numero(v) }
    # Entrada nova: do trabalho corrente, de task concluída dele, no schema
    # de estimativa_historico (06-execucao e 00-schema da sprintx).
    function propria() {
      if ($2 != trabalho) erro("entrada de outro trabalho: " $2 " " $3)
      if (!($3 in concluida)) erro("entrada de task que não é concluída do trabalho corrente: " $3)
      if ($4 == "-") erro("entrada sem tipo_task: " $3)
      if ($5 == "-" || $5 == "null" || $5 == "s:") erro("entrada sem area: " $3)
      if ($6 !~ /^l:/) erro("entrada sem sinais: " $3)
      if (!numero_ou_nulo($7) || !numero_ou_nulo($8) || !numero_ou_nulo($9))
        erro("estimado fora do contrato (número ou null): " $3)
      if (!numero($10)) erro("real ausente ou não numérico: " $3)
      if ($11 != "-" && !numero_ou_nulo($11)) erro("duracao_observada fora do contrato: " $3)
      if (!numero_ou_nulo($12)) erro("desvio fora do contrato (número ou null): " $3)
      if ($13 != "-" && $13 !~ /^s:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/)
        erro("registrado_em fora de AAAA-MM-DD: " $3)
    }
    # fator_ativo é true a partir de 3 entradas (06-execucao, DS-43). A conta
    # não passa do que o HISTORICO final tem daquele tipo.
    function confere_calibracao(   i, f, n) {
      for (i = 1; i <= n_cal; i++) {
        split(cal[i], f, "\t")
        if (f[2] in tipo_visto) erro("calibração repetida para o tipo: " f[2])
        tipo_visto[f[2]] = 1
        if (f[3] !~ /^n:[0-9]+$/) erro("calibração com entradas fora de inteiro: " f[2])
        n = substr(f[3], 3) + 0
        if (n > por_tipo["s:" f[2]] + 0) erro("calibração conta mais entradas do que o HISTORICO tem: " f[2])
        if (!numero(f[4])) erro("calibração com desvio_medio fora de número: " f[2])
        if (f[5] != "b:true" && f[5] != "b:false") erro("calibração com fator_ativo fora de booleano: " f[2])
        if ((f[5] == "b:true") != (n >= 3)) erro("calibração com fator_ativo incoerente com as entradas: " f[2])
      }
    }
    BEGIN {
      FS = "\t"
      trabalho = ENVIRON["HIST_TRABALHO"]
      n = split(ENVIRON["HIST_CONCLUIDAS"], lista, "\n")
      for (i = 1; i <= n; i++) if (lista[i] != "") concluida[lista[i]] = 1
    }
    FILENAME == ARGV[1] && $1 == "E" { antiga[chave($2, $3)] = registro(); nome[chave($2, $3)] = $2 " " $3; n_antiga++; next }
    FILENAME == ARGV[1] && $1 == "L" { linha_antiga[chave($2, $3)] = $2 " " $3; next }
    FILENAME == ARGV[1] { next }
    $1 == "E" {
      k = chave($2, $3); final[k] = registro(); por_tipo[$4]++
      if (!(k in antiga)) nova[++n_nova] = $0
      next
    }
    $1 == "L" { linha_final[chave($2, $3)] = $2 " " $3; next }
    $1 == "C" { cal[++n_cal] = $0; next }
    # Evidência antiga primeiro: trocar o trabalho_id de uma entrada antiga é
    # remoção dela, antes de ser uma entrada nova sem dono.
    END {
      if (falhou) exit 1
      for (k in antiga) {
        if (!(k in final)) erro("remove ou reescreve evidência existente: entrada " nome[k] " removida")
        if (final[k] != antiga[k]) erro("remove ou reescreve evidência existente: entrada " nome[k] " reescrita")
      }
      for (i = 1; i <= n_nova; i++) { $0 = nova[i]; propria() }
      for (k in linha_antiga)
        if (!(k in linha_final)) erro("remove ou reescreve evidência existente: linha " linha_antiga[k] " da tabela de Entradas removida")
      for (k in linha_final)
        if (!(k in final)) erro("linha da tabela de Entradas sem entrada no frontmatter: " linha_final[k])
      confere_calibracao()
    }
  ' "$1" "$2" 2>&1
}

confere_caminho_historico() { # <rótulo>
  local parcial="$RAIZ" componente
  for componente in docs sprintx estimativas HISTORICO.md; do
    parcial="$parcial/$componente"
    [ ! -L "$parcial" ] || para "$1 passa por link simbólico"
  done
}

# Primeira criação do HISTORICO global (DM-174). Sem versão em HEAD não existe
# evidência antiga a proteger: a base é vazia, e a prova é sobre o ARQUIVO
# INTEIRO, que falha fechado. Só depois dela o arquivo entra no commit de
# método, e dali em diante ele é tracked e cai em confere_historico_versionado.
confere_historico_inicial() {
  local caminho="$HISTORICO_GLOBAL" presenca motivo
  git -C "$RAIZ" rev-parse -q --verify 'HEAD^{commit}' >/dev/null 2>&1 \
    || para 'HISTORICO global inicial sem HEAD para provar a ausência da versão anterior'
  presenca="$(git -C "$RAIZ" ls-tree --name-only HEAD -- "$caminho" 2>/dev/null)" \
    || para 'não foi possível provar a ausência do HISTORICO global em HEAD'
  [ -z "$presenca" ] \
    || para 'HISTORICO global existe em HEAD, mas está fora do índice; estado anômalo não é primeira criação'

  confere_caminho_historico 'HISTORICO global inicial'
  [ -f "$RAIZ/$caminho" ] || para 'HISTORICO global inicial não é arquivo regular'
  tasks_concluidas || para 'HISTORICO global inicial: tasks do trabalho ilegíveis'

  : > "$TMP_HIST/base" || para 'não foi possível preparar a base vazia do HISTORICO'
  ler_historico "$RAIZ/$caminho" > "$TMP_HIST/final" \
    || para "HISTORICO global inicial sem ownership integral: $(head -n 1 "$TMP_HIST/final")"
  motivo="$(confere_ownership_historico "$TMP_HIST/base" "$TMP_HIST/final")" \
    || para "HISTORICO global inicial sem ownership integral: ${motivo:-leitura falhou}"
  return 0
}

# HISTORICO já versionado (DM-175). A prova não é diff textual: HEAD e working
# tree passam pelo mesmo leitor e as representações são comparadas. Entrada
# anterior é imutável; entrada nova só do trabalho corrente; atualizado_em,
# calibracao e prosa podem ser recalculados.
confere_historico_versionado() {
  local caminho="$HISTORICO_GLOBAL" modo motivo
  modo="$(git -C "$RAIZ" ls-tree HEAD -- "$caminho" 2>/dev/null | awk '{ print $1 }')"
  case "$modo" in
    100644|100755) ;;
    '') para 'HISTORICO global está no índice, mas não em HEAD; estado anômalo sem base para provar' ;;
    *) para 'HISTORICO global em HEAD não é arquivo regular' ;;
  esac
  git -C "$RAIZ" cat-file blob "HEAD:$caminho" > "$TMP_HIST/head.md" 2>/dev/null \
    || para 'não foi possível ler o HISTORICO global de HEAD'
  ler_historico "$TMP_HIST/head.md" > "$TMP_HIST/base" \
    || para "HISTORICO global em HEAD fora do contrato; sem base estruturada para provar a versão nova: $(head -n 1 "$TMP_HIST/base")"

  confere_caminho_historico 'HISTORICO global'
  [ -e "$RAIZ/$caminho" ] || para 'HISTORICO global remove ou reescreve evidência existente: o arquivo foi apagado'
  [ -f "$RAIZ/$caminho" ] || para 'HISTORICO global não é arquivo regular'
  tasks_concluidas || para 'HISTORICO global: tasks do trabalho ilegíveis'

  ler_historico "$RAIZ/$caminho" > "$TMP_HIST/final" \
    || para "HISTORICO global fora do contrato: $(head -n 1 "$TMP_HIST/final")"
  motivo="$(confere_ownership_historico "$TMP_HIST/base" "$TMP_HIST/final")" \
    || para "HISTORICO global sem prova de ownership: ${motivo:-leitura falhou}"
  return 0
}

confere_historico_corrente() {
  local caminho="$HISTORICO_GLOBAL"
  sujo "$caminho" || return 0
  TMP_HIST="$(mktemp -d "${TMPDIR:-/tmp}/mergex-historico.XXXXXX")" \
    || para 'não foi possível criar área temporária do HISTORICO'
  if ! git -C "$RAIZ" ls-files --error-unmatch -- "$caminho" >/dev/null 2>&1; then
    confere_historico_inicial
    return 0
  fi
  confere_historico_versionado
}

# Os caminhos vêm do catálogo compartilhado (catalogo-de-metodo.sh), o mesmo
# que o E1 usa para separar método de produto. Aqui cada um só entra se
# existe, é arquivo regular e está dirty.
TMP_CATALOGO="$(mktemp "${TMPDIR:-/tmp}/mergex-catalogo.XXXXXX")" || para 'não foi possível criar catálogo temporário'
catalogo_metodo "$RAIZ" "$ORIGEM" "$TRABALHO" "$PASTA" "$CHECKPOINT" > "$TMP_CATALOGO" || para "$CATALOGO_ERRO"
# Os checkpoints estreitos de recuperação nunca levam o HISTORICO global.
case "$ORIGEM:$CHECKPOINT" in
  sprintx:pre-e2|sprintx:pre-e6|sprintx:e8) confere_historico_corrente ;;
esac
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  adiciona "$caminho"
done < "$TMP_CATALOGO"

LC_ALL=C sort -u -o "$TMP_LISTA" "$TMP_LISTA"

if [ "$MODO" = listar ]; then
  cat "$TMP_LISTA"
  exit 0
fi

# O checkpoint de predecessores é atômico e estreito: enquanto ele prepara ou
# verifica o manifesto, nenhum outro caminho pode estar dirty. O status em NUL
# preserva nomes arbitrários; o prefixo XY e o espaço são removidos sem
# interpretar o caminho. O stage já foi recusado acima, antes desta leitura.
if [ "$CHECKPOINT" = predecessores ]; then
  MANIFESTO_PREDECESSORES="$PASTA/00-PREDECESSORES.md"
  [ -f "$RAIZ/$MANIFESTO_PREDECESSORES" ] && [ ! -L "$RAIZ/$MANIFESTO_PREDECESSORES" ] \
    || para "$MANIFESTO_PREDECESSORES deve existir como arquivo regular"

  # `--verificar` prova o checkpoint já persistido. `--persistir` aceita um
  # manifesto novo somente enquanto ele está dirty; um noop só é válido quando
  # HEAD já contém o artefato como blob regular. Isso impede que ausência,
  # remoção ou troca por symlink sejam tratadas como lista vazia bem-sucedida.
  MANIFESTO_EM_HEAD="$(git -C "$RAIZ" ls-tree HEAD -- "$MANIFESTO_PREDECESSORES" 2>/dev/null \
    | awk '$1 != "120000" && $2 == "blob" { print "sim" }')"
  if [ "$MODO" = verificar ]; then
    [ "$MANIFESTO_EM_HEAD" = sim ] \
      || para "$MANIFESTO_PREDECESSORES ainda não foi persistido em HEAD"
  elif ! sujo "$MANIFESTO_PREDECESSORES"; then
    [ "$MANIFESTO_EM_HEAD" = sim ] \
      || para "$MANIFESTO_PREDECESSORES ausente de HEAD e sem mudança para persistir"
  fi

  TMP_STATUS="$(mktemp "${TMPDIR:-/tmp}/mergex-status.XXXXXX")" \
    || para 'não foi possível preparar a prova da árvore'
  git -C "$RAIZ" status --porcelain=v1 -z --untracked-files=all > "$TMP_STATUS" 2>/dev/null \
    || para 'não foi possível provar a árvore do checkpoint predecessores'
  while IFS= read -r -d '' registro; do
    caminho_sujo="${registro#???}"
    [ "$caminho_sujo" = "$PASTA/00-PREDECESSORES.md" ] \
      || para "árvore suja fora do artefato esperado: $caminho_sujo"
  done < "$TMP_STATUS"
fi

# DM-184: nos checkpoints pre-e6 e e8, um ENTREGA.md com `portao: pronto` (lido
# como a validade do portão o lê) só é persistido — ou aceito pelo --verificar
# — com a prova funcional do pre-push efetivo (ativacao-pre-push.sh --provar).
# Sem essa persistência, o `pronto` nunca chega ao SHA que o pre-push avalia.
# A prova roda antes de qualquer `git add`: reprovada, nada entra no stage e
# nenhum commit é criado. Os outros checkpoints, e o portão que não é
# `pronto`, seguem como antes.
TMP_PROVA=""
prova_pre_push() {
  case "$CHECKPOINT" in pre-e6|e8) ;; *) return 0 ;; esac
  [ "$(catalogo_fm "$RAIZ/$ENTREGA" portao)" = pronto ] || return 0
  TMP_PROVA="$(mktemp "${TMPDIR:-/tmp}/mergex-metodo-prova.XXXXXX")" || return 1
  ( cd "$RAIZ" && bash "$ATIVACAO_SH" --provar --entrega "$ENTREGA" ) > "$TMP_PROVA" 2>&1 && return 0
  sed 's/^/  /' "$TMP_PROVA" >&2
  return 1
}
prova_pre_push || para "pre-push sem prova funcional: checkpoint $CHECKPOINT recusado com portao: pronto; nada foi preparado nem commitado. Rode o E0 (ativacao-pre-push.sh --instalar) e o E2 de novo" # guarda:E2SEMHOOK

if [ "$MODO" = verificar ]; then
  if [ -s "$TMP_LISTA" ]; then
    printf 'persistir-metodo: checkpoint %s pendente; artefatos de método dirty:\n' "$CHECKPOINT" >&2
    sed 's/^/  - /' "$TMP_LISTA" >&2
    exit 1
  fi
  printf 'ok=true\n'
  exit 0
fi

if [ ! -s "$TMP_LISTA" ]; then
  printf 'noop=true\n'
  exit 0
fi

# O stage nasce vazio sob a trava. Cada path vem do catálogo fechado acima;
# nenhum diretório, glob ou `git add -A` participa desta operação.
while IFS= read -r caminho; do
  [ -n "$caminho" ] || continue
  git add -- "$caminho" || para "falha ao preparar $caminho; stage preservado"
done < "$TMP_LISTA"

STAGED="$(git diff --cached --name-only 2>/dev/null | LC_ALL=C sort -u)"
ESPERADO="$(cat "$TMP_LISTA")"
[ -n "$STAGED" ] || para 'nenhuma mudança elegível entrou no stage'
[ "$STAGED" = "$ESPERADO" ] || para 'o staged diff diverge do catálogo exato; stage preservado'

# Reutiliza literalmente o gate de segurança dos hooks sobre o staged diff.
# Falha de jq ou do hook também é fechada: método não ganha atalho de segredo.
command -v jq >/dev/null 2>&1 || para 'jq indisponível para o gate de segredo'
ENTRADA_SEGREDO="$(jq -cn --arg w "$RAIZ" \
  '{tool_name:"Bash",cwd:$w,tool_input:{command:"git commit"}}' 2>/dev/null)"
[ -n "$ENTRADA_SEGREDO" ] || para 'não foi possível preparar o gate de segredo'
printf '%s' "$ENTRADA_SEGREDO" | bash "$SEGREDO_SH" \
  || para 'gate de segredo reprovou; nenhum commit foi criado e o stage foi preservado'

TMP_MSG="$(mktemp "${TMPDIR:-/tmp}/mergex-metodo-msg.XXXXXX")" || para 'não foi possível criar a mensagem do commit'
{
  printf 'chore(mergex): persiste metodo %s\n\n' "$CHECKPOINT"
  printf 'Trabalho: %s\n' "$TRABALHO"
  printf 'Metodo: %s\n' "$CHECKPOINT"
} > "$TMP_MSG" || para 'não foi possível escrever a mensagem do commit'

bash "$CONTRATO_SH" --validar-metodo --trabalho "$TRABALHO" \
  --checkpoint "$CHECKPOINT" --arquivo "$TMP_MSG" >/dev/null 2>&1 \
  || para 'mensagem de método não satisfaz o contrato'

git commit -F "$TMP_MSG" >/dev/null \
  || para 'git commit falhou; nenhum estado foi limpo automaticamente'

bash "$CONTRATO_SH" --validar-metodo --trabalho "$TRABALHO" \
  --checkpoint "$CHECKPOINT" --commit HEAD >/dev/null 2>&1 \
  || para 'commit criado não satisfaz o contrato de método'

SHA="$(git rev-parse HEAD 2>/dev/null)"
printf '%s\n' "$SHA" | grep -Eq '^[0-9a-f]{40}$' || para 'commit criado sem SHA completo legível'
printf 'commit=%s\n' "$SHA"
