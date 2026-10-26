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
#   3. a branch do checkout (`feature/<slug>`), quando existe ORQUESTRADOR.md
#      numa pasta com esse slug
#   4. o UNICO trabalho com ORQUESTRADOR.md, nos dois layouts de pasta
#   5. "sem-trabalho" — inclusive com dois ou mais trabalhos e nada acima
#      decidindo: o mtime NAO escolhe (decisao do usuario, AxisGov/login#2)
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
  local f d unico="" ambiguo="" br slug="" da_branch=""
  expx_branch_atual_em br "$raiz"
  [ -n "$br" ] && slug="${br##*/}"
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    d="${f%/ORQUESTRADOR.md}"; d="${d##*/}"
    [ -n "$slug" ] && [ "$d" = "$slug" ] && da_branch="$slug"
    # o mesmo slug nos dois layouts e o MESMO trabalho (mesmo arquivo de eventos)
    if [ -z "$unico" ]; then unico="$d"; elif [ "$d" != "$unico" ]; then ambiguo=1; fi
  done <<EOF
$(find "$raiz/docs" -maxdepth 4 -name ORQUESTRADOR.md -type f 2>/dev/null)
EOF
  if [ -n "$da_branch" ]; then
    printf '%s' "$da_branch"
    return 0
  fi
  # Mais de um trabalho e nada que decida entre eles: sem-trabalho, nunca o
  # mtime. O ORQUESTRADOR.md mexido por ultimo pode ser o da OUTRA feature, e
  # evento atribuido ao trabalho errado e pior que evento sem trabalho.
  if [ -n "$unico" ] && [ -z "$ambiguo" ]; then
    printf '%s' "$unico"
    return 0
  fi

  printf 'sem-trabalho'
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

# As chaves da resolucao do agente (CONTRATO-expx-orquestracao §11.1), lidas da
# projecao plana que o `expx init` grava com a politica ativa
# (.expx/orquestracao-rastro.tsv). Imprime o fragmento JSON ou nada: sem
# projecao, com cabecalho, id ou campo fora do formato, ou com o agente fora
# dela. Falha aberta — a linha sai sem as chaves, nunca com evidencia parcial.
# Os campos so aceitam o que dispensa escape em JSON, entao entram literais.
expx_resolucao_extras() {
  local arq="$1/.expx/orquestracao-rastro.tsv" agente="$2" cab=""
  [ -f "$arq" ] || return 0
  IFS= read -r cab < "$arq" || true
  [ "${cab%$'\r'}" = "# expx-orquestracao-rastro 1" ] || return 0
  local ag id cd oc cr alt oa mm me resto v out
  while IFS=$'\t' read -r ag id cd oc cr alt oa mm me resto || [ -n "$ag" ]; do
    [ "$ag" = "$agente" ] || continue
    me="${me%$'\r'}"
    [ -z "$resto" ] || return 0
    case "$id" in ""|*[!0-9a-f]*) return 0 ;; esac
    [ "${#id}" -eq 64 ] || return 0
    for v in "$cd" "$oc" "$cr" "$alt" "$oa" "$mm" "$me"; do
      case "$v" in ""|*[!A-Za-z0-9._:/-]*) return 0 ;; esac
    done
    out="\"resolucao_id\":\"$id\",\"classe_declarada\":\"$cd\",\"classe_resolvida\":\"$cr\""
    out="$out,\"origem_classe\":\"$oc\",\"alternativa\":\"$alt\",\"origem_alternativa\":\"$oa\""
    # materializado so na excecao do agentes.json v1 (8.3); `-` e ausencia
    if [ "$mm" != - ]; then
      if [ "$me" != - ]; then out="$out,\"materializado\":{\"model\":\"$mm\",\"effort\":\"$me\"}"
      else out="$out,\"materializado\":{\"model\":\"$mm\"}"
      fi
    fi
    printf '%s' "$out"
    return 0
  done < "$arq"
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
        if [ "$agente" != principal ]; then
          local resolucao; resolucao="$(expx_resolucao_extras "$raiz" "$agente")"
          [ -n "$resolucao" ] && linha="$linha,$resolucao"
        fi
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
