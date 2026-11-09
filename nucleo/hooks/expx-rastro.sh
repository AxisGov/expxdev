#!/usr/bin/env bash
# expx-rastro.sh — o rastro de eventos do metodo Expx, uma vez so.
#
# Implementa o contrato `expx-eventos` v1 e as convencoes R1-R14
# (docs/contrato/CONVENCOES.md e CONTRATO-expx-eventos.md).
#
# NAO E EXECUTAVEL: os hooks fazem `source` deste arquivo.
#
# ---------------------------------------------------------------------------
# Por que este arquivo existe
#
# Cada skill tinha a sua propria implementacao do rastro — quatro no total, em
# duas linguagens. Nao eram copias que divergiram: eram reescritas, porque o
# `comum/rastro.sh` de cada repo trazia o nome da ferramenta CRAVADO no codigo
# (`"ferramenta":"sprintx"`) e por isso nao dava para compartilhar. Elas ja
# divergiam em producao: chave extra no meio do objeto, `agente` ora null ora
# "principal", tres estrategias de trabalho_id, dois conjuntos de modos.
#
# Aqui a ferramenta e PARAMETRO. Defina `EXPX_FERRAMENTA` antes do source:
#
#   EXPX_FERRAMENTA=mergex
#   . "$(dirname "$0")/expx-rastro.sh"
#
# ---------------------------------------------------------------------------
# Como este arquivo chega ate um projeto
#
# Por COPIA, nunca por dependencia. O `expx init` copia; cada repositorio
# continua rodando sozinho, com o que tem em disco, sem `npm install` e sem
# runtime compartilhado. A fonte e o plugin; a copia e versionada com a skill.
#
# ---------------------------------------------------------------------------
# Regras do contrato que este arquivo materializa
#   1. Rapido       — sem rede, sem parser externo pesado.
#   3. Falha aberta — toda funcao retorna 0 mesmo sem conseguir gravar.
#   6. Sem estado   — tudo sai de arquivo que ja existe.
#   7. Sempre grava — inclusive quando permite.

# A ferramenta e obrigatoria, mas a ausencia NAO derruba o hook (regra 3):
# cai para "desconhecida", que o validador aponta em vez de sumir em silencio.
: "${EXPX_FERRAMENTA:=desconhecida}"

# ---------------------------------------------------------------- util basica

# Raiz do repositorio: sobe ate achar .git; sem .git, o cwd.
#
# `[ -e ]`, nao `[ -d ]`: numa worktree vinculada `.git` e ARQUIVO ("gitdir:
# <principal>/.git/worktrees/<nome>"). Com `[ -d ]` a busca pulava a raiz da
# worktree e, de um subdiretorio, devolvia o proprio subdiretorio — e o rastro
# ia para um `docs/eventos` no lugar errado.
#
# O pai sai por expansao de parametro, nao por `dirname`: um processo a menos
# por nivel, e caminho relativo (sem barra) termina a subida em vez de girar
# para sempre em ".".
#
# A subida parte do caminho FISICO. Um cwd que e link simbolico, de fora, para
# um subdiretorio do repositorio subia pelo lado de fora: nao achava `.git` e
# devolvia o proprio link. `cd -P` + `pwd -P` sao POSIX e existem no bash 3.2
# do macOS, que nao tem `realpath` nem `readlink -f`. Um subshell por chamada,
# nao por nivel. `CDPATH=` porque, com CDPATH, o `cd` imprime o destino. Se o
# `cd` falha (caminho que nao existe), sobe pelo caminho como veio. A raiz
# achada sai fisica (no macOS, /private/tmp em vez de /tmp): mesmo lugar.
# O `x` depois do `pwd -P` protege o nome que termina em newline: o `$(...)`
# corta newline do fim, e sem a sentinela levaria junto o do proprio caminho.
expx_raiz() {
  local d p
  d="$(CDPATH='' cd -P -- "${1:-$PWD}" 2>/dev/null && pwd -P && printf x)" || d=""
  d="${d%?x}"
  [ -n "$d" ] || d="${1:-$PWD}"
  while [ "$d" != "/" ]; do
    [ -e "$d/.git" ] && { printf '%s' "$d"; return 0; }
    case "$d" in
      */) p="${d%/}" ;;
      */*) p="${d%/*}"; [ -n "$p" ] || p=/ ;;
      *) p=. ;;
    esac
    [ "$p" = "$d" ] && break
    d="$p"
  done
  printf '%s' "${1:-$PWD}"
}

# Escapa uma string para caber num JSON string literal.
# A barra invertida vem primeiro, senao escapamos o que ja foi escapado.
#
# JSON proibe controle CRU dentro de string (U+0000..U+001F). Escapar so TAB,
# CR e LF deixava o resto passar — um detalhe com cor de terminal (ESC) gravava
# uma linha que nao e JSON e o leitor perdia o arquivo dali em diante. Os cinco
# com forma curta saem como `\b \t \n \f \r`; o resto, como `\u00XX`. O NUL nao
# chega aqui: nao cabe numa variavel de shell.
#
# O `case` guarda o laco: texto normal nao tem controle exotico, e nesse
# caminho a funcao continua sendo so substituicao em massa, sem processo.
EXPX_CTRL_EXOTICOS=$'\001\002\003\004\005\006\007\013\016\017\020\021\022\023\024\025\026\027\030\031\032\033\034\035\036\037'
expx_json_escape() {
  local s="$1" _i _b _hex
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\b'/\\b}"
  s="${s//	/\\t}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\f'/\\f}"
  s="${s//$'\r'/\\r}"
  case "$s" in
    *["$EXPX_CTRL_EXOTICOS"]*)
      for _i in 1 2 3 4 5 6 7 11 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31; do
        printf -v _hex '%02x' "$_i"
        printf -v _b '\\%03o' "$_i"; printf -v _b '%b' "$_b"
        s="${s//"$_b"/\\u00$_hex}"
      done ;;
  esac
  printf '%s' "$s"
}

# expx_utf8 <var> <code point> — o caractere em UTF-8, montado byte a byte com as
# escapas octais do FORMATO do printf (POSIX, presentes no bash 3.2). Sem `\u`/`\U`
# (so no bash 4.2+) e sem depender de locale. U+0000 nao cabe numa variavel: vazio.
expx_utf8() {
  local _cp="$2" _f
  if [ "$_cp" -lt 128 ]; then
    printf -v _f '\\%03o' "$_cp"
  elif [ "$_cp" -lt 2048 ]; then
    printf -v _f '\\%03o\\%03o' $((192 | _cp >> 6)) $((128 | (_cp & 63)))
  elif [ "$_cp" -lt 65536 ]; then
    printf -v _f '\\%03o\\%03o\\%03o' $((224 | _cp >> 12)) $((128 | (_cp >> 6 & 63))) $((128 | (_cp & 63)))
  else
    printf -v _f '\\%03o\\%03o\\%03o\\%03o' $((240 | _cp >> 18)) $((128 | (_cp >> 12 & 63))) \
      $((128 | (_cp >> 6 & 63))) $((128 | (_cp & 63)))
  fi
  printf -v "$1" "$_f"
}

# Sem jq: o valor string da primeira ocorrencia de "<chave>", lido e DECODIFICADO
# como JSON, so com builtins. Um grep de `[^"]*` parava na primeira aspa escapada e
# devolvia as escapas cruas — `C:\\Users\\x` chegava com a barra dobrada, que nao e
# caminho nenhum. Valor que nao e string: vazio.
expx_json_str() {
  local s="$1" k="$2" r="" c i n hi lo cp
  # A chave e o "<chave>" seguido de `:`; um valor igual ao nome da chave
  # ({"a":"file_path", ...}) nao e ela — siga para a proxima ocorrencia.
  while :; do
    case "$s" in *"\"$k\""*) ;; *) return 0 ;; esac
    s="${s#*\"$k\"}"
    s="${s#"${s%%[![:space:]]*}"}"
    [ "${s:0:1}" = ":" ] && break
  done
  s="${s:1}"; s="${s#"${s%%[![:space:]]*}"}"; [ "${s:0:1}" = '"' ] || return 0
  s="${s:1}"; n=${#s}; i=0
  while [ "$i" -lt "$n" ]; do
    c="${s:i:1}"
    case "$c" in
      '"') break ;;
      \\) i=$((i + 1)); c="${s:i:1}"
          case "$c" in
            n) r+=$'\n' ;; t) r+=$'\t' ;; r) r+=$'\r' ;; b) r+=$'\b' ;; f) r+=$'\f' ;;
            # \uXXXX sai em UTF-8 qualquer que seja a locale do processo (hook nao herda
            # uma) e sem o `\u` do printf, que o bash 3.2 do contrato nao conhece: os
            # bytes saem de expx_utf8. Par substituto (\uD8xx\uDCxx) e UM caractere
            # fora do plano basico: junte os dois; substituto sem par vira U+FFFD, como
            # no jq. Escapa malformada nao derruba o hook: o `u` segue como texto.
            u) hi="${s:i+1:4}"; lo="${s:i+7:4}"
               case "$hi" in
                 [0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) ;;
                 *) r+="u"; i=$((i + 1)); continue ;;
               esac
               cp=$((16#$hi)); i=$((i + 4))
               if [ "$cp" -ge 55296 ] && [ "$cp" -le 57343 ]; then
                 case "$hi${s:i+1:2}$lo" in
                   [dD][89aAbB][0-9a-fA-F][0-9a-fA-F]'\u'[dD][c-fC-F][0-9a-fA-F][0-9a-fA-F])
                     cp=$((0x10000 + ((cp - 0xD800) << 10) + (16#$lo - 0xDC00))); i=$((i + 6)) ;;
                   *) cp=65533 ;;
                 esac
               fi
               expx_utf8 c "$cp"; r+="$c" ;;
            *) r+="$c" ;;
          esac ;;
      *) r+="$c" ;;
    esac
    i=$((i + 1))
  done
  printf '%s' "$r"
}

# Le uma chave de topo do JSON que o harness manda no stdin do hook.
# Com jq quando existe; sem jq, o leitor de string acima. Nunca falha.
expx_json_get() {
  local json="$1" chave="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg k "$chave" '.[$k] // empty' 2>/dev/null
    return 0
  fi
  expx_json_str "$json" "$chave"
}

# Le uma chave aninhada em tool_input (ex.: file_path).
expx_tool_input_get() {
  local json="$1" chave="$2"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg k "$chave" '.tool_input[$k] // empty' 2>/dev/null
    return 0
  fi
  expx_json_str "$json" "$chave"
}

# ------------------------------------------------------------- trabalho_id

# O trabalho corrente.
#
# UMA estrategia, em ordem de autoridade — antes eram tres, uma por skill, que
# davam respostas diferentes no mesmo repositorio na mesma execucao:
#
#   1. EXPX_TRABALHO_ID, quando a skill ja sabe qual e
#   2. .expx/expx-lock.json, que o CLI mantem
#   3. a branch do checkout (`feature/<slug>`, `fix/<OC-ID>-<slug>`), quando a
#      pasta com esse nome tem ORQUESTRADOR.md, ou ainda so o 00-PLANEJAMENTO.md
#      (sprintx, F1 a F3) ou o 00-OCORRENCIA.md (runx, E1)
#   4. o UNICO trabalho com ORQUESTRADOR.md, nos dois layouts de pasta; os dois
#      marcadores do planejamento nao contam aqui, para planejamento abandonado
#      nao tornar ambiguo o repositorio de um trabalho so
#   5. "sem-trabalho" — inclusive com dois ou mais trabalhos e nada acima
#      decidindo: o mtime NAO escolhe (decisao do usuario, AxisGov/login#2)
#
# Nos passos 3 e 4 o id e o `trabalho_id` do frontmatter da pasta
# (`expx_id_da_pasta`), e so sem ele o nome da pasta; os passos 1 e 2 mantem a
# sanitizacao de sempre. A runx grava `OC-AAAA-NNNN` numa pasta
# `OC-AAAA-NNNN-<slug>`, e o rastro dela e o painel usam o id: com o nome da
# pasta, os eventos do nucleo de uma ocorrencia iam para outro arquivo, fora do
# painel.
#
# O nome do lock e `expx-lock.json` (src/nucleo/lock.ts). Ler `lock.json` sem
# o prefixo devolve "sem-trabalho" para sempre, em silencio — a falha aqui e
# aberta por desenho, entao o erro nunca se anuncia.
#
# O passo 3 vem antes do mtime porque, com duas features ativas, o
# ORQUESTRADOR.md mexido por ultimo pode ser o da OUTRA: a worktree/branch e o
# contexto desta sessao, o disco nao. So vale quando o ultimo segmento da
# branch casa com uma pasta de trabalho existente. "Ativo" nao tem criterio
# proprio aqui: conta todo ORQUESTRADOR.md que a busca acha.

# expx_branch_atual_em <var> <raiz> — a branch do checkout em <raiz>, lida do
# HEAD sem chamar o git (regra 1). Numa worktree vinculada `.git` e arquivo e
# aponta o gitdir dela. HEAD destacado ou ilegivel: vazio.
expx_branch_atual_em() {
  local _g="$2/.git" _h=""
  printf -v "$1" '%s' ""
  if [ -f "$_g" ]; then
    IFS= read -r _h < "$_g" 2>/dev/null || [ -n "$_h" ] || return 0
    _h="${_h%$'\r'}"
    case "$_h" in "gitdir: "*) _g="${_h#gitdir: }" ;; *) return 0 ;; esac
    case "$_g" in /*|[A-Za-z]:*) ;; *) _g="$2/$_g" ;; esac
  fi
  [ -f "$_g/HEAD" ] || return 0
  _h=""
  IFS= read -r _h < "$_g/HEAD" 2>/dev/null || [ -n "$_h" ] || return 0
  _h="${_h%$'\r'}"
  case "$_h" in "ref: refs/heads/"?*) printf -v "$1" '%s' "${_h#ref: refs/heads/}" ;; esac
}

expx_trabalho_id() {
  local raiz="$1" v=""

  if [ -n "${EXPX_TRABALHO_ID:-}" ]; then
    printf '%s' "$EXPX_TRABALHO_ID" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-64
    return 0
  fi

  local lock="$raiz/.expx/expx-lock.json"
  if [ -f "$lock" ]; then
    if command -v jq >/dev/null 2>&1; then
      v="$(jq -r '.trabalho_id // empty' "$lock" 2>/dev/null)"
    else
      v="$(grep -o '"trabalho_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$lock" 2>/dev/null \
           | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
    fi
    if [ -n "$v" ]; then
      printf '%s' "$v" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-64
      return 0
    fi
  fi

  # Os dois layouts: o novo (docs/<skill>/features|ocorrencias/<slug>/) e o
  # antigo (docs/<slug>/), que as skills declaram continuar suportando.
  #
  # `find` em vez de glob: no zsh um padrao sem match ABORTA a funcao (nomatch),
  # e o hook perderia o trabalho_id no shell de metade dos usuarios. O -maxdepth
  # 4 cobre os dois layouts sem varrer o repositorio inteiro.
  local f p d unico="" unico_p="" ambiguo="" br slug="" da_branch=""
  expx_branch_atual_em br "$raiz"
  [ -n "$br" ] && slug="${br##*/}"
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    p="${f%/*}"; d="${p##*/}"
    # a pasta com dois marcadores aparece duas vezes: vale a primeira
    [ -n "$slug" ] && [ "$d" = "$slug" ] && [ -z "$da_branch" ] && da_branch="$p"
    case "$f" in */ORQUESTRADOR.md) ;; *) continue ;; esac
    # o mesmo slug nos dois layouts e o MESMO trabalho (mesmo arquivo de eventos)
    if [ -z "$unico" ]; then unico="$d"; unico_p="$p"; elif [ "$d" != "$unico" ]; then ambiguo=1; fi
  done <<EOF
$(find "$raiz/docs" -maxdepth 4 \( -name ORQUESTRADOR.md -o -name 00-PLANEJAMENTO.md -o -name 00-OCORRENCIA.md \) -type f 2>/dev/null)
EOF
  if [ -n "$da_branch" ]; then
    expx_id_da_pasta "$da_branch"
    return 0
  fi
  # Mais de um trabalho e nada que decida entre eles: sem-trabalho, nunca o
  # mtime. O ORQUESTRADOR.md mexido por ultimo pode ser o da OUTRA feature, e
  # evento atribuido ao trabalho errado e pior que evento sem trabalho.
  if [ -n "$unico" ] && [ -z "$ambiguo" ]; then
    expx_id_da_pasta "$unico_p"
    return 0
  fi

  printf 'sem-trabalho'
}

# expx_id_da_pasta <pasta> — o id do trabalho da pasta: o `trabalho_id` seguro
# do primeiro de ORQUESTRADOR.md, 00-OCORRENCIA.md e 00-PLANEJAMENTO.md que o
# tiver, e o nome da pasta quando nenhum tem. Marcador sem id seguro nao barra
# o seguinte. A ordem e a de autoridade do painel: o plano vence a ocorrencia.
expx_id_da_pasta() {
  local _a _id=""
  for _a in ORQUESTRADOR.md 00-OCORRENCIA.md 00-PLANEJAMENTO.md; do
    [ -f "$1/$_a" ] || continue
    expx_id_do_frontmatter _id "$1/$_a"
    if [ -n "$_id" ]; then printf '%s' "$_id"; return 0; fi
  done
  printf '%s' "${1##*/}"
}

# expx_id_do_frontmatter <var> <arquivo> — poe em <var> o `trabalho_id` do
# frontmatter, ou vazio. So vale o bloco que abre na primeira linha com `---`
# (depois de um BOM UTF-8, se houver) e fecha na proxima linha que comeca com
# `---`, em ate 50 linhas, com a chave na coluna 0 (nua ou entre aspas); a
# chave repetida invalida, e a linha indentada logo depois dela, que nao seja so
# comentario, tambem. O valor perde o comentario YAML
# (o # depois de espaco ou tab, fora das aspas), as aspas e os espacos das
# pontas, e so vale com o alfabeto de um nome de arquivo em docs/eventos/, ate
# 64 caracteres (o `trabalho_seguro` da runx). NUL em qualquer ponto ou arquivo
# ilegivel: vazio. Uma leitura, sem fork. <var> so vale como nome de variavel:
# o `printf -v` avaliaria o indice de `v[$(comando)]`.
expx_id_do_frontmatter() {
  case "$1" in ""|[!A-Za-z_]*|*[!A-Za-z0-9_]*) return 0 ;; esac
  local _c="" _l _v="" _n=0 _aberto="" _visto="" _q="" _r _t
  # sem aspas, o YAML do painel le estes como booleano, nulo ou numero, nunca string
  local _nao_string='^(true|True|TRUE|false|False|FALSE|null|Null|NULL|[0-9]+|0o[0-7]+|0x[0-9A-Fa-f]+|[0-9]+[.][0-9]*([eE][-+]?[0-9]+)?|[0-9]+[eE][-+]?[0-9]+)$'
  printf -v "$1" '%s' ""
  # `read -d ''` so sai 0 quando acha um NUL; no fim do arquivo sai 1 com tudo
  # lido. O 2>/dev/null vem antes do <: a falha de abrir tambem fica muda.
  IFS= read -r -d '' _c 2>/dev/null < "$2" && return 0
  # um BOM UTF-8 no inicio sai antes do `---`, como no painel (D-25)
  _c="${_c#$'\357\273\277'}"
  while IFS= read -r _l || [ -n "$_l" ]; do
    _l="${_l%$'\r'}"
    if [ -z "$_aberto" ]; then
      [ "$_l" = "---" ] || return 0
      _aberto=1
      continue
    fi
    # fecha em qualquer linha que comece com `---`, como o painel (`\n---`)
    case "$_l" in ---*) printf -v "$1" '%s' "$_v"; return 0 ;; esac
    _n=$((_n + 1))
    [ "$_n" -le 50 ] || return 0
    # a linha indentada logo depois da chave continua o valor no YAML do painel
    # (`OC-2026-` + `  0007` e `OC-2026- 0007`): o valor de uma linha nao vale
    # mesmo depois de linhas vazias, que o escalar atravessa. A linha indentada que so tem
    # comentario e comentario, e o valor fica (conselhos#292)
    if [ "$_visto" = 1 ]; then
      [ -n "$_l" ] || continue
      # so comentario, indentado ou na coluna 0: a proxima linha ainda pode continuar o valor
      case "${_l#"${_l%%[![:blank:]]*}"}" in \#*) continue ;; esac
      case "$_l" in [[:blank:]]*) _v="" ;; esac
      _visto=2
    fi
    # depois da chave, so interessa se ela se repete: o YAML do painel recusa o arquivo
    # com chave repetida (Map keys must be unique), e o hook tambem
    if [ -n "$_visto" ]; then
      case "$_l" in
        \"trabalho_id\"*) _t="${_l#\"trabalho_id\"}" ;;
        \'trabalho_id\'*) _t="${_l#\'trabalho_id\'}" ;;
        trabalho_id*) _t="${_l#trabalho_id}" ;;
        *) continue ;;
      esac
      _t="${_t#"${_t%%[![:blank:]]*}"}"
      case "$_t" in :*) _v="" ;; esac
      continue
    fi
    # a chave, nua ou entre aspas, com espacos antes dos dois-pontos e espaco
    # depois deles, como o YAML do painel a le; `trabalho_id:x` nao e chave
    case "$_l" in
      \"trabalho_id\"*) _v="${_l#\"trabalho_id\"}" ;;
      \'trabalho_id\'*) _v="${_l#\'trabalho_id\'}" ;;
      trabalho_id*) _v="${_l#trabalho_id}" ;;
      *) continue ;;
    esac
    _v="${_v#"${_v%%[![:blank:]]*}"}"
    case "$_v" in :*) _visto=1; _v="${_v#:}" ;; *) _v=""; continue ;; esac
    case "$_v" in ""|[[:blank:]]*) ;; *) _v="" ;; esac
    _v="${_v#"${_v%%[![:space:]]*}"}"
    case "$_v" in
      \"*|\'*)
        # entre aspas o # e texto; depois do fecho, so espacos e o comentario,
        # que pede espaco antes (conselhos#283, r4514531691)
        _q="${_v%"${_v#?}"}"; _r="${_v#?}"
        case "$_r" in
          *"$_q"*) _v="${_r%%"$_q"*}"; _r="${_r#*"$_q"}" ;;
          *) _v=""; _r="" ;;
        esac
        _t="${_r#"${_r%%[![:blank:]]*}"}"
        case "$_t" in
          "") ;;
          \#*) [ "$_t" != "$_r" ] || _v="" ;;
          *) _v="" ;;
        esac
        ;;
      *) _v="${_v%%[[:blank:]]#*}" ;;
    esac
    # o painel apara o valor (z.string().trim()), inclusive o de dentro das aspas
    _v="${_v#"${_v%%[![:space:]]*}"}"
    _v="${_v%"${_v##*[![:space:]]}"}"
    if [ -z "$_q" ] && [[ $_v =~ $_nao_string ]]; then _v=""; fi
    case "$_v" in ""|[!A-Za-z0-9]*|*[!A-Za-z0-9._-]*) _v="" ;; esac
    [ "${#_v}" -le 64 ] || _v=""
  done <<EXPX_FRONTMATTER
$_c
EXPX_FRONTMATTER
  return 0
}

# ------------------------------------------------------------------ modo

# Modo de um hook: aviso | bloqueio | desligado.
#
# Uso: expx_modo <raiz> <hook> [tipo]     tipo: metodo (padrao) | seguranca
#
# Os TRES modos sao obrigatorios. Reconhecer so dois e cair no padrao diante do
# terceiro faz o hook continuar rodando depois de alguem pedir para desliga-lo.
#
# O padrao sai do `tipo`: hook de seguranca nasce em bloqueio e NUNCA e
# rebaixado por ausencia de configuracao; hook de metodo nasce em aviso. So um
# "desligado" explicito desliga um hook de seguranca.
expx_modo() {
  local raiz="$1" hook="$2" tipo="${3:-metodo}" m=""
  local cfg="$raiz/.expx/hooks.json"
  local padrao='aviso'
  [ "$tipo" = "seguranca" ] && padrao='bloqueio'

  [ -f "$cfg" ] || { printf '%s' "$padrao"; return 0; }

  if command -v jq >/dev/null 2>&1; then
    # `.modos[...]` e a forma antiga, aceita para nao quebrar quem escreveu o
    # arquivo a mao antes do formato atual.
    m="$(jq -r --arg h "$hook" '.hooks[$h].modo // .modos[$h] // empty' "$cfg" 2>/dev/null)"
  else
    m="$(grep -o "\"$hook\"[[:space:]]*:[[:space:]]*{[^}]*}" "$cfg" 2>/dev/null \
         | grep -o '"modo"[[:space:]]*:[[:space:]]*"[^"]*"' \
         | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
    # forma antiga sem jq: `"modos": {"<hook>": "<modo>"}`, o valor e string, nao objeto
    [ -n "$m" ] || m="$(grep -o "\"$hook\"[[:space:]]*:[[:space:]]*\"[a-z]*\"" "$cfg" 2>/dev/null \
         | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
  fi

  case "$m" in
    aviso|bloqueio|desligado) printf '%s' "$m" ;;
    *)                       printf '%s' "$padrao" ;;
  esac
}

# Os dois leitores de projecao abaixo abrem o arquivo UMA vez: o
# `IFS= read -r -d '' conteudo` o le inteiro para a memoria, e o parse sai da
# variavel. Reabrir deixaria uma troca concorrente entrar entre a conferencia e o
# parse (login#69). O `read -d ''` so termina com sucesso ao achar um NUL, que o
# `read` linha a linha descartaria em silencio e o leitor Node da mesma projecao
# nao: com NUL, o arquivo nao vale nada. Sem NUL, chega ao fim e falha, com o
# conteudo inteiro. Tira-se uma quebra final porque o heredoc a devolve.

# As chaves da resolucao do agente (CONTRATO-expx-orquestracao §11.1), lidas da
# projecao plana que o `expx init` grava com a politica ativa
# (.expx/orquestracao-rastro.tsv). Imprime o fragmento JSON ou nada: sem
# projecao, com NUL em qualquer ponto, com cabecalho, id ou campo fora do
# formato, ou com o agente fora dela. Falha aberta — a linha sai sem as chaves,
# nunca com evidencia parcial.
# Os campos so aceitam o que dispensa escape em JSON, entao entram literais.
expx_resolucao_extras() {
  local arq="$1/.expx/orquestracao-rastro.tsv" agente="$2" cab="" conteudo=""
  [ -f "$arq" ] || return 0
  IFS= read -r -d '' conteudo < "$arq" && return 0
  conteudo="${conteudo%$'\n'}"
  # o nome do agente no alfabeto de nome: fora dele, nem consigo mesmo casa
  case "$agente" in ""|*[!A-Za-z0-9._-]*) return 0 ;; esac
  local linha tabs ag id cd oc cr alt oa mm me v out="" achadas=0
  {
    IFS= read -r cab || true
    [ "${cab%$'\r'}" = "# expx-orquestracao-rastro 1" ] || return 0
    while IFS= read -r linha || [ -n "$linha" ]; do
      linha="${linha%$'\r'}"
      case "$linha" in "$agente"$'\t'*) ;; *) continue ;; esac
      # agente repetido: a projecao nao vale para ele (o plano a recusaria). So se
      # sabe no fim do arquivo: conta e segue lendo; a decisao vem depois do laco.
      achadas=$((achadas + 1))
      [ "$achadas" -eq 1 ] || continue
      # Exatamente oito TABs, contados na linha crua: o `read` com IFS de TAB
      # trata TAB como espaco em branco e juntaria coluna vazia ou TAB no fim.
      tabs="${linha//[!$'\t']/}"
      [ "${#tabs}" -eq 8 ] || return 0
      IFS=$'\t' read -r ag id cd oc cr alt oa mm me <<EXPX_PROJECAO
$linha
EXPX_PROJECAO
      case "$id" in ""|*[!0-9a-f]*) return 0 ;; esac
      [ "${#id}" -eq 64 ] || return 0
      # nove campos cheios: um vazio teria deslocado os demais e deixado o ultimo vazio
      for v in "$ag" "$cd" "$oc" "$cr" "$alt" "$oa" "$mm" "$me"; do
        case "$v" in ""|*[!A-Za-z0-9._:/-]*) return 0 ;; esac
      done
      # `-` so e ausencia nas duas colunas do materializado, e o materializado so
      # existe na excecao do agentes.json v1, sempre com model
      for v in "$cd" "$oc" "$cr" "$alt" "$oa"; do [ "$v" != - ] || return 0; done
      [ "$mm" != - ] || [ "$me" = - ] || return 0
      [ "$mm" = - ] || [ "$oa" = agentes-json-v1 ] || return 0
      out="\"resolucao_id\":\"$id\",\"classe_declarada\":\"$cd\",\"classe_resolvida\":\"$cr\""
      out="$out,\"origem_classe\":\"$oc\",\"alternativa\":\"$alt\",\"origem_alternativa\":\"$oa\""
      if [ "$mm" != - ]; then
        if [ "$me" != - ]; then out="$out,\"materializado\":{\"model\":\"$mm\",\"effort\":\"$me\"}"
        else out="$out,\"materializado\":{\"model\":\"$mm\"}"
        fi
      fi
    done
  } <<EXPX_CONTEUDO
$conteudo
EXPX_CONTEUDO
  # o arquivo inteiro lido: so entao se sabe que o agente nao se repete
  [ "$achadas" -eq 1 ] || return 0
  printf '%s' "$out"
  return 0
}

# O papel do agente e a skill que o publica (CONTRATO-expx-orquestracao §11.4),
# lidos da projecao que o `expx init` grava com ou sem politica
# (.expx/papeis.tsv). Imprime "skill<TAB>papel" ou nada. O arquivo inteiro vale
# ou nao vale nada, pelas mesmas regras do `lerPapeis` do CLI: NUL em qualquer
# ponto, cabecalho diferente, linha sem exatamente dois TABs, campo fora do alfabeto, o
# `principal`, skill fora do vocabulario `ferramenta` do rastro, papel fora do
# vocabulario ou agente repetido deixam todo agente sem papel. Falha
# aberta: sem papel, o agente nao e de aprovacao. Nunca le o papel do nome.
expx_papel_de() {
  local arq="$1/.expx/papeis.tsv" agente="$2" cab="" conteudo="" linha tabs ag sk pa achado="" vistos=$'\n'
  [ -f "$arq" ] || return 0
  IFS= read -r -d '' conteudo < "$arq" && return 0
  conteudo="${conteudo%$'\n'}"
  case "$agente" in ""|*[!a-z0-9-]*) return 0 ;; esac
  {
    # o CR do fim sai: o checkout com core.autocrlf entrega a projecao em CRLF
    IFS= read -r cab || return 0
    [ "${cab%$'\r'}" = "# expx-papeis 1" ] || return 0
    while IFS= read -r linha || [ -n "$linha" ]; do
      linha="${linha%$'\r'}"
      tabs="${linha//[!$'\t']/}"
      [ "${#tabs}" -eq 2 ] || return 0
      IFS=$'\t' read -r ag sk pa <<EXPX_PAPEIS
$linha
EXPX_PAPEIS
      case "$ag" in ""|*[!a-z0-9-]*|principal) return 0 ;; esac
      case "$sk" in sprintx|runx|mergex|legadox|stackx|memox|prodx|buildx|designx) ;; *) return 0 ;; esac
      case "$pa" in planejar|implementar|investigar|testar|revisar) ;; *) return 0 ;; esac
      case "$vistos" in *$'\n'"$ag"$'\n'*) return 0 ;; esac
      vistos="$vistos$ag"$'\n'
      [ "$ag" = "$agente" ] && achado="$sk"$'\t'"$pa"
    done
  } <<EXPX_CONTEUDO
$conteudo
EXPX_CONTEUDO
  [ -n "$achado" ] && printf '%s' "$achado"
  return 0
}

# ---------------------------------------------------------------- gravacao

# expx_rastro_grava <raiz> <evento> <origem> <resultado> <detalhe> [arquivos_json] [extras_json]
#
# Grava UMA linha em docs/eventos/<trabalho_id>.jsonl.
#
# As DOZE chaves obrigatorias saem sempre todas, na ordem do contrato, e chave
# sem valor vai como null — nunca omitida (R6). model e effort sao o executor
# OBSERVADO e saem em toda linha nova: null quando o runtime nao informou, e
# nunca preenchidos com configuracao (frontmatter, resolucao ou alternativa) —
# CONTRATO-expx-orquestracao, H10. A intencao vai pelas chaves da resolucao, e
# quem decide mostra-la e o leitor. As demais extras vêm em extras_json.
#
# Falha aberta: erro aqui e engolido. Um hook nunca trava o trabalho por nao
# conseguir escrever o proprio rastro.
expx_rastro_grava() {
  local raiz="$1" evento="$2" origem="$3" resultado="$4" detalhe="$5"
  local arquivos="${6:-[]}" extras="${7:-}"

  {
    local dir="$raiz/docs/eventos"
    mkdir -p "$dir" 2>/dev/null || return 0

    local agente="${EXPX_AGENTE:-principal}"
    # EXPX_MODEL/EXPX_EFFORT: o que o chamador observou no payload do runtime
    # (no Claude, `effort.level`) para o executor EXPX_AGENTE.
    local model="${EXPX_MODEL:-}" effort="${EXPX_EFFORT:-}"
    # O harness declarado, ou, sem ele, a CLAUDECODE que o Claude Code exporta.
    local harness="${EXPX_HARNESS:-}"
    [ -z "$harness" ] && [ -n "${CLAUDECODE:-}" ] && harness=claude-code
    # $CLAUDE_EFFORT e o esforco da sessao: observacao do principal, e so dele.
    # Num hook disparado dentro de um subagente ele nao descreve o subagente, e
    # atribui-lo seria gravar configuracao alheia como executor.
    case "$harness" in
      claude|claude-code)
        [ -z "$effort" ] && [ "$agente" = principal ] && effort="${CLAUDE_EFFORT:-}"
        ;;
    esac
    local model_json=null effort_json=null
    [ -n "$model" ] && model_json="\"$(expx_json_escape "$model")\""
    [ -n "$effort" ] && effort_json="\"$(expx_json_escape "$effort")\""

    local tid; tid="$(expx_trabalho_id "$raiz")"
    local arq="$dir/$tid.jsonl"

    # Rotacao: acima de 5 MB o arquivo vira <trabalho_id>.1.jsonl (contrato).
    # So quem pega a trava (mkdir e atomico) rotaciona, e confere o tamanho de novo
    # ja com ela: dois gravadores que viram o arquivo grande ao mesmo tempo nao podem
    # os dois mover — o segundo moveria o arquivo NOVO por cima do .1 e perderia os
    # eventos antigos. Trava presente: ninguem rotaciona, e o arquivo so cresce. Nao ha
    # remocao de trava velha: ela abriria a mesma corrida (um gravador apagaria a trava
    # NOVA do outro). Trava so sobra se o processo morrer entre o mkdir e o rmdir — e o
    # efeito e um arquivo grande, nunca evento perdido.
    if [ -f "$arq" ]; then
      local tam trava="$dir/.$tid.rotacao"
      tam=$(wc -c < "$arq" 2>/dev/null | tr -d ' ')
      if [ -n "$tam" ] && [ "$tam" -gt 5242880 ] 2>/dev/null; then
        if mkdir "$trava" 2>/dev/null; then
          tam=$(wc -c < "$arq" 2>/dev/null | tr -d ' ')
          if [ -n "$tam" ] && [ "$tam" -gt 5242880 ] 2>/dev/null; then
            mv -f "$arq" "$dir/$tid.1.jsonl" 2>/dev/null || true
          fi
          rmdir "$trava" 2>/dev/null
        fi
      fi
    fi

    local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    local linha
    linha="{\"ts\":\"$ts\""
    linha="$linha,\"expx_eventos\":1"
    linha="$linha,\"trabalho_id\":\"$(expx_json_escape "$tid")\""
    linha="$linha,\"ferramenta\":\"$EXPX_FERRAMENTA\""
    linha="$linha,\"origem\":\"$origem\""
    linha="$linha,\"evento\":\"$evento\""
    # `fase` e `task` sao string JSON (`"f6"`, `"T-01.01"`), escapadas; `null`
    # so na ausencia. Sem aspas a linha saia `"fase":f6`, que nao e JSON.
    local fase=null task=null
    [ -n "${EXPX_FASE:-}" ] && fase="\"$(expx_json_escape "$EXPX_FASE")\""
    [ -n "${EXPX_TASK:-}" ] && task="\"$(expx_json_escape "$EXPX_TASK")\""
    linha="$linha,\"fase\":$fase"
    linha="$linha,\"task\":$task"
    # Sem subagente o valor e "principal", nunca null: "foi o principal" e
    # informacao, nao ausencia.
    linha="$linha,\"agente\":\"$(expx_json_escape "$agente")\""
    linha="$linha,\"resultado\":\"$resultado\""
    linha="$linha,\"detalhe\":\"$(expx_json_escape "$detalhe")\""
    linha="$linha,\"arquivos\":$arquivos"
    linha="$linha,\"model\":$model_json"
    linha="$linha,\"effort\":$effort_json"
    # o harness detectado, salvo quando o chamador ja o mandou nas extras
    if [ -n "$harness" ]; then
      case "$extras" in
        *'"harness":'*) ;;
        *) linha="$linha,\"harness\":\"$(expx_json_escape "$harness")\"" ;;
      esac
    fi
    # a resolucao vigente do subagente, so no Claude: a projecao e do adaptador claude
    case "$harness" in
      claude|claude-code)
        # salvo se o chamador ja a mandou: a da chamada, quando a vigente mudou no meio
        case "$extras" in
          *'"resolucao_id":'*) ;;
          *)
            if [ "$agente" != principal ]; then
              local resolucao; resolucao="$(expx_resolucao_extras "$raiz" "$agente")"
              [ -n "$resolucao" ] && linha="$linha,$resolucao"
            fi
            ;;
        esac
        ;;
    esac
    [ -n "$extras" ] && linha="$linha,$extras"
    linha="$linha}"

    printf '%s\n' "$linha" >> "$arq" 2>/dev/null || true
  } 2>/dev/null || true
  return 0
}

# ------------------------------------------------------------------- saida

# Aviso que CHEGA ao modelo em PostToolUse.
#
# Ali o exit 2 nao bloqueia e o stderr NAO volta ao modelo — verificado na
# documentacao oficial. O unico canal e JSON no stdout. Escrever em stderr num
# PostToolUse e falha silenciosa.
expx_aviso_ao_modelo() {
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
    "$1" "$(expx_json_escape "$2")"
}

# Bloqueio em PreToolUse: exit 2 com o motivo no stderr, que vira a mensagem
# que o modelo le. Mensagem acionavel: diga o que fazer, nao so o que esta
# errado.
expx_bloqueia() {
  printf '%s\n' "$1" >&2
  exit 2
}
