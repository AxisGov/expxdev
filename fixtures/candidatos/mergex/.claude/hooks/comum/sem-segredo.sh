#!/usr/bin/env bash
# sem-segredo — PreToolUse em execução de comando e em escrita.
#
# Roda antes de cada commit, não só no portão final. Segredo que entra no
# histórico não sai por reverter o commit.
#
# Compartilhado por todas as skills; é na mergex que ele fecha a porta que
# importa, porque é a skill que commita.
#
# Modo padrão: BLOQUEIO (hook de segurança, falha fechada).

HOOK="sem-segredo"
PADRAO="bloqueio"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=base.sh
. "$DIR/base.sh"

ENTRADA="$(cat)"
FERRAMENTA="$(printf '%s' "$ENTRADA" | jq -r '.tool_name // empty' 2>/dev/null)"
CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null)"
RAIZ="$(expx_raiz "${CWD:-$PWD}")"

MODO="$(expx_modo "$HOOK" "$PADRAO" "$RAIZ")"
[ "$MODO" = "desligado" ] && exit 0

# --------------------------------------------------------------------------
# O que este hook inspeciona
# --------------------------------------------------------------------------
# Bash: só o que vai virar histórico — commit. O resto do terminal não é
#       assunto deste hook (regra 1: casar com precisão).
# Write/Edit: o conteúdo que está sendo escrito no arquivo.
ALVO=""
ORIGEM=""

case "$FERRAMENTA" in
  Bash)
    CMD="$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // empty' 2>/dev/null)"
    [ -n "$CMD" ] || exit 0
    # Só interessa commit. `git commit -m "..."` carrega a mensagem, e o que
    # está em preparação é o que vai para o histórico.
    # Sem `-q`, de propósito: base.sh liga `pipefail`, e um grep que casa na
    # primeira linha e sai dá SIGPIPE ao printf quando o comando passa do buffer
    # do pipe; o pipeline devolvia 141 e este `|| exit 0` pulava a varredura de
    # `git commit -m x` seguido de 70 KB de linhas — com chave privada em
    # preparação (rodada extra da revisão). Sem `-q` o grep lê até o fim.
    # Opções globais antes do subcomando, inclusive as que levam argumento separado
    # (`git -C <dir> commit`, `git -c k=v commit`): sem elas no padrão, o hook saía
    # antes de varrer (revisão do Codex no lote do conselhos#210).
    # O argumento pode vir entre aspas, com espaço (`git -C 'repo x' commit`), e o
    # padrão não pode parar nele (CodeAnt no mergex#54).
    GIT_ANTES='(^|[;&|[:space:]])git([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace|--config-env|--exec-path|--super-prefix)[[:space:]]+("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]+)|[[:space:]]+-[^[:space:]]+)*[[:space:]]+'
    printf '%s' "$CMD" | grep -E "${GIT_ANTES}commit([[:space:]]|\$)" >/dev/null || exit 0
    NL='
'
    MSG_NAO_VARRIDA=""
    # Onde o Git roda, e qual repositório o commit atinge, não é só o cwd do evento:
    # `cd <dir> && git commit` e `git -C <dir> commit` atingem outro diretório, talvez
    # outro repositório (CodeAnt no mergex#54). Duas listas: os diretórios em que o
    # Git pode rodar (resolvem o `-F` relativo) e os repositórios desses diretórios
    # (dão o diff e os não rastreados). Varrer um a mais só arrisca falso positivo.
    # Alvo que não se resolve (variável, `~user`, escape, inexistente): barra.
    CTX_DIRS="$(cd -P -- "${CWD:-$PWD}" 2>/dev/null && pwd -P)"
    [ -n "$CTX_DIRS" ] || CTX_DIRS="${CWD:-$PWD}"
    _ctx_alvo() {
      local t="$1" bases base cand d achou=0 aspas=0
      case "$t" in \"*\") t="${t#\"}"; t="${t%\"}"; aspas=1 ;; \'*\') t="${t#\'}"; t="${t%\'}"; aspas=1 ;; esac
      # Só o `~` sem aspas é o $HOME; entre aspas é o diretório literal `~`.
      if [ "$aspas" = 0 ]; then
        case "$t" in '~') t="$HOME" ;; '~/'*) t="$HOME/${t#\~/}" ;; '~'*) t="" ;; esac
      fi
      case "$t" in ''|-|*'$'*|*'`'*|*\\*)
        MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - diretório que não se resolve: ${1}
"; return ;;
      esac
      case "$t" in /*) bases="/" ;; *) bases="$CTX_DIRS" ;; esac
      while IFS= read -r base; do
        [ -n "$base" ] || continue
        case "$t" in /*) cand="$t" ;; *) cand="$base/$t" ;; esac
        d="$(cd -P -- "$cand" 2>/dev/null && pwd -P)" || continue
        [ -n "$d" ] || continue
        achou=1
        case "$NL$CTX_DIRS$NL" in *"$NL$d$NL"*) ;; *) CTX_DIRS="$CTX_DIRS$NL$d" ;; esac
      done <<EXPX_BASES
$bases
EXPX_BASES
      [ "$achou" = 1 ] || MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - diretório que não se resolve: ${1}
"
    }
    ARG_SH="(\"[^\"]*\"|'[^']*'|[^[:space:];&|)]+)"
    while IFS= read -r alvo_cd; do
      [ -n "$alvo_cd" ] && _ctx_alvo "$alvo_cd"
    done <<EXPX_CD
$(printf '%s' "$CMD" | grep -aEo -e "(^|[;&|(])[[:space:]]*(cd|pushd)[[:space:]]+$ARG_SH" | sed -E 's/^[;&|([:space:]]*(cd|pushd)[[:space:]]+//')
EXPX_CD
    while IFS= read -r alvo_c; do
      [ -n "$alvo_c" ] && _ctx_alvo "$alvo_c"
    done <<EXPX_C
$(printf '%s' "$CMD" | grep -aEo -e "$GIT_ANTES" | grep -aEo -e "-C[[:space:]]+$ARG_SH" | sed -E 's/^-C[[:space:]]+//')
EXPX_C
    # O que troca o repositório, a árvore ou o índice por outro caminho não é
    # resolvido aqui (resolver só `--git-dir` deixaria `--work-tree` e o índice
    # alternativo de fora): barra. A chave de configuração não diferencia
    # maiúsculas (`core.WorkTree`), e entra também por `--config-env`,
    # `GIT_CONFIG_*` e `include.path`/`includeIf`: sem distinguir maiúsculas.
    if printf '%s' "$CMD" | grep -aiE -e '--git-dir|--work-tree|--config-env|core\.worktree|include\.path|includeif\.|(^|[^A-Za-z0-9_])GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|CONFIG[A-Z0-9_]*)=' >/dev/null; then
      MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - o comando troca o repositório, a árvore ou o índice do Git (--git-dir, --work-tree, GIT_DIR, GIT_INDEX_FILE...)
"
    fi
    CTX_REPOS="$RAIZ"
    while IFS= read -r d; do
      [ -n "$d" ] || continue
      topo="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" || continue
      [ -n "$topo" ] || continue
      case "$NL$CTX_REPOS$NL" in *"$NL$topo$NL"*) ;; *) CTX_REPOS="$CTX_REPOS$NL$topo" ;; esac
    done <<EXPX_DIRS
$CTX_DIRS
EXPX_DIRS
    # A varredura é sobre o que ENTRA no histórico: as linhas adicionadas do que
    # está preparado. A removida (tirar um segredo é a remediação) e o contexto
    # do diff não são conteúdo novo. Só dentro de um bloco `@@` uma linha com `+`
    # é conteúdo — fora dele, `+++ b/<arquivo>` é cabeçalho, e uma linha
    # adicionada que começa com `++ ` também chega como `+++ `. O `+` inicial
    # sai, para os limites à esquerda valerem.
    # O índice não basta: `-a`, `-i`, `-o` e pathspec levam ao commit o que só
    # está na árvore de trabalho, e reconhecer cada forma do comando seria
    # frágil. As alterações não preparadas dos arquivos rastreados entram sempre:
    # na dúvida, o hook barra (um segredo não preparado de outro arquivo também).
    # --no-ext-diff e --no-textconv: um diff.external, GIT_EXTERNAL_DIFF ou textconv
    # configurado trocaria o texto do diff (com /bin/true, por nada) e o segredo
    # passaria sem ser visto (conselhos#210, P7). --text: arquivo binário ou com
    # atributo -diff sairia como "Binary files differ", sem bloco @@ (login#30).
    ALVO=""
    while IFS= read -r repo; do
      [ -n "$repo" ] || continue
      ALVO="$ALVO
$( { git -C "$repo" diff --cached --text --no-ext-diff --no-textconv --no-color -U0
     git -C "$repo" diff --text --no-ext-diff --no-textconv --no-color -U0; } 2>/dev/null \
      | awk '/^diff --git / { h = 0; next } /^@@/ { h = 1; next } h && /^\+/ { print substr($0, 2) }')"
    done <<EXPX_REPOS
$CTX_REPOS
EXPX_REPOS
    # Some a mensagem inline, que também vai para o histórico.
    ALVO="$ALVO
$CMD"
    # E a mensagem por arquivo (`-F <arq>`, `-F<arq>`, `--file <arq>`,
    # `--file=<arq>`, `-F` ao fim de opções curtas sem argumento, como `-aF`),
    # todas as ocorrências (conselhos#210, P4). O caminho relativo vale para o
    # diretório em que o Git roda, que pode não ser o cwd do evento (`cd sub &&`):
    # é lido em cada diretório candidato, e todos os que existem são varridos — um
    # homônimo inócuo no cwd não mascara o outro (CodeAnt no mergex#54). `-F -`
    # (stdin), nenhum legível ou forma que não se resolve: na dúvida, barra — a
    # mensagem iria para o histórico sem ser vista.
    while IFS= read -r arg_f; do
      [ -n "$arg_f" ] || continue
      arq_f="${arg_f#--file=}"; arq_f="${arq_f#--file}"
      case "$arq_f" in -*F*) arq_f="${arq_f#*F}" ;; esac
      arq_f="${arq_f#"${arq_f%%[![:space:]]*}"}"
      case "$arq_f" in \"*\") arq_f="${arq_f#\"}"; arq_f="${arq_f%\"}" ;; \'*\') arq_f="${arq_f#\'}"; arq_f="${arq_f%\'}" ;; esac
      case "$arq_f" in ''|-) MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - ${arg_f}
"; continue ;; esac
      lido_f=0
      while IFS= read -r base_f; do
        [ -n "$base_f" ] || continue
        case "$arq_f" in /*) cand_f="$arq_f" ;; *) cand_f="$base_f/$arq_f" ;; esac
        if [ -f "$cand_f" ] && [ -r "$cand_f" ]; then
          ALVO="$ALVO
$(cat -- "$cand_f" 2>/dev/null)"
          lido_f=1
        fi
        case "$arq_f" in /*) break ;; esac
      done <<EXPX_BASES_F
$CTX_DIRS
EXPX_BASES_F
      [ "$lido_f" = 1 ] || MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - ${arg_f}
"
    done <<EXPX_ARQ_F
$(printf '%s' "$CMD" | grep -aEo -e "(^|[[:space:]])(--file(=|[[:space:]]+)|-[aeinopqsvz]*F[[:space:]]*)(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" | sed 's/^[[:space:]]*//')
EXPX_ARQ_F
    # Não rastreado que o MESMO comando adiciona (`git add novo.env && git commit`)
    # não está em diff nenhum quando este hook roda (login#30). Com `add` e `commit`
    # no comando, os não rastreados e não ignorados de cada repositório entram na
    # varredura, todos (o pathspec do add não é interpretado: na dúvida, varre). Com
    # `add -f`/`--force`, os ignorados também, que só assim entram no commit (CodeAnt
    # no mergex#54). Link não é seguido (o commit leva o texto do alvo, que é
    # varrido). Acima de 1 MiB por arquivo, ou de 8 MiB somados, barra: o que não
    # se lê não passa. Sem `add`, não rastreado não entra.
    if printf '%s' "$CMD" | grep -E "${GIT_ANTES}add([[:space:]]|\$)" >/dev/null; then
      FORCA_ADD=0
      printf '%s' "$CMD" | grep -E "${GIT_ANTES}add[[:space:]]([^;&|]*[[:space:]])?(-[A-Za-z]*f[A-Za-z]*|--force)([[:space:]]|\$|[;&|])" >/dev/null && FORCA_ADD=1
      total_nr=0
      while IFS= read -r repo; do
        [ -n "$repo" ] || continue
        while IFS= read -r -d '' nr; do
          caminho_nr="$repo/$nr"
          # Link não é seguido, mas o texto do alvo é o que o blob guarda: entra.
          if [ -L "$caminho_nr" ]; then
            ALVO="$ALVO
$(readlink -- "$caminho_nr" 2>/dev/null)"
            continue
          fi
          [ -f "$caminho_nr" ] || continue
          tam_nr="$(wc -c < "$caminho_nr" 2>/dev/null | tr -d ' ')"
          case "$tam_nr" in ''|*[!0-9]*) MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - não rastreado ilegível: ${nr}
"; continue ;; esac
          if [ "$tam_nr" -gt 1048576 ]; then
            MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - não rastreado grande demais para varrer: ${nr}
"; continue
          fi
          total_nr=$((total_nr + tam_nr))
          if [ "$total_nr" -gt 8388608 ]; then
            # Um aviso e para: com `add -f`, os ignorados podem ser milhares.
            MSG_NAO_VARRIDA="${MSG_NAO_VARRIDA}  - não rastreados somam mais de 8 MiB a partir de: ${nr}
"; break
          fi
          ALVO="$ALVO
$(cat -- "$caminho_nr" 2>/dev/null | tr -d '\000')"
        done < <(if [ "$FORCA_ADD" = 1 ]; then git -C "$repo" ls-files -o -z 2>/dev/null
                 else git -C "$repo" ls-files -o --exclude-standard -z 2>/dev/null; fi)
      done <<EXPX_REPOS_NR
$CTX_REPOS
EXPX_REPOS_NR
    fi
    if [ -n "$MSG_NAO_VARRIDA" ]; then
      expx_barra "$MODO" "$RAIZ" "$HOOK" "conteúdo do commit não varrido" \
"mergex/sem-segredo — parte do que entra no commit não pôde ser varrida

${MSG_NAO_VARRIDA}
A mensagem vem de stdin (\`-F -\`) ou de um arquivo que não se lê a partir
do diretório do comando; ou um arquivo não rastreado que o mesmo comando
adiciona é grande demais para varrer; ou o comando muda para um diretório que
não se resolve (variável, escape) ou troca o repositório, a árvore ou o índice
do Git. Isso iria para o histórico sem passar pela varredura.

O que fazer: grave a mensagem num arquivo legível e passe o caminho em -F, ou
use -m; adicione o arquivo grande num comando separado, depois de conferido;
rode o commit com o caminho literal (\`git -C <dir> commit\`), sem trocar o
repositório nem o índice por opção ou variável."
    fi
    ORIGEM="o que está em preparação ou alterado nos arquivos rastreados"
    ;;
  Write|Edit|NotebookEdit)
    ALVO="$(printf '%s' "$ENTRADA" | jq -r '
      [.tool_input.content?, .tool_input.new_string?, .tool_input.new_source?]
      | map(select(. != null)) | join("\n")' 2>/dev/null)"
    [ -n "$ALVO" ] || exit 0
    ORIGEM="o conteúdo sendo escrito"
    ;;
  *) exit 0 ;;
esac

[ -n "$ALVO" ] || exit 0

# --------------------------------------------------------------------------
# Os sinais — a tabela única, em skills/mergex/scripts/segredo-tabela.sh
# --------------------------------------------------------------------------
# A mesma do pre-push (portao-push.sh, DM-279). Sem ela, o hook de segurança
# barra: falha fechada.
TABELA="$DIR/../../skills/mergex/scripts/segredo-tabela.sh"
# shellcheck source=../../skills/mergex/scripts/segredo-tabela.sh
if [ ! -r "$TABELA" ] || ! . "$TABELA" || ! command -v segredo_varrer >/dev/null 2>&1; then
  expx_barra "$MODO" "$RAIZ" "$HOOK" "tabela de segredo indisponível" \
"mergex/sem-segredo — a tabela de sinais de segredo não está disponível

Esperada em: $TABELA

Sem ela, nada do que $ORIGEM traz pode ser varrido. Reinstale a mergex
(o hook e a skill vêm juntos) antes de continuar."
fi
segredo_varrer


if [ -n "$ACHADOS" ]; then
  expx_barra "$MODO" "$RAIZ" "$HOOK" "segredo em $ORIGEM" \
"mergex/sem-segredo — segredo encontrado em $ORIGEM

$ACHADOS
Segredo que entra no histórico não sai por reverter o commit.

O que fazer:
  1. Tire o valor do arquivo e ponha em variável de ambiente ou cofre.
  2. Deixe no código só a referência (ex.: process.env.API_KEY).
  3. Se o valor é fictício, torne isso óbvio (xxxx, <coloque-aqui>, example).
  4. Se já foi commitado antes, rotacione a credencial — reverter não basta.

Valores acima estão mascarados de propósito."
fi

expx_permite "$RAIZ" "$HOOK" "sem segredo em $ORIGEM"
