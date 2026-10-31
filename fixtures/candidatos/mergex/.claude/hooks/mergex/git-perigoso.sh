#!/usr/bin/env bash
# git-perigoso — PreToolUse em execução de comando.
#
# Barra as operações onde o erro não tem volta:
#   - push forçado, em qualquer forma
#   - push ou commit direto na branch principal
#   - reescrita de histórico já enviado
#   - descarte de alteração local
#   - limpeza destrutiva de arquivo não rastreado
#
# O falso positivo aqui é raro; o custo do falso negativo é o trabalho de
# outra pessoa perdido.
#
# Modo padrão: BLOQUEIO (hook de segurança, falha fechada).
#
# Regra 1 do desenho: casar com PRECISÃO. Uma regra frouxa que barre qualquer
# coisa contendo "push" atrapalha o dev o dia inteiro. Todo casamento aqui
# exige `git` como programa e a forma real da opção.
#
# Caminho e id com o namespace da skill (DM-171): `.claude/hooks/mergex/
# git-perigoso.sh`, modo em `.expx/hooks.json` sob `mergex/git-perigoso`. A
# sprintx publica um hook de mesmo nome, com regras próprias, em
# `.claude/hooks/sprintx/git-perigoso.sh` sob `sprintx/git-perigoso`: nenhum
# dos dois sobrescreve o outro, e o modo de um nunca desliga o outro. O id sem
# namespace (`git-perigoso`) não é lido: um "desligado" antigo não rebaixa
# este hook.

HOOK="mergex/git-perigoso"
PADRAO="bloqueio"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../comum/base.sh
. "$DIR/../comum/base.sh"

ENTRADA="$(cat)"

# jq é dependência declarada dos hooks (hooks/README.md): é ele que lê o
# payload. Sem jq, o `tool_name` sairia vazio e o hook devolveria sucesso sem
# ter avaliado nada — falha aberta silenciosa num hook de segurança (DM-171).
# Aqui não há parser alternativo: se o payload cru menciona `git`, a chamada
# é barrada por contrato de instalação; o resto segue, porque não é assunto
# deste hook. Sem jq, o modo em `.expx/hooks.json` também não pode ser lido —
# nem o "desligado".
if ! command -v jq >/dev/null 2>&1; then
  printf '%s' "$ENTRADA" | grep -E '(^|[^A-Za-z0-9_./\\-])git([[:space:]]|\\[nrt]|"|$)' >/dev/null || exit 0
  printf '%s\n' \
"mergex/git-perigoso — dependência ausente: jq

Este hook de segurança lê o comando pelo jq, e o jq não está no PATH. Sem ele
não há como provar que o comando git é seguro, então a chamada foi barrada em
vez de passar sem avaliação.

O que fazer:
  - Instale o jq (https://jqlang.org) e confira com: jq --version
  - Os hooks da mergex dependem de bash, jq, git e utilitários POSIX
    (.claude/hooks/README.md, \"Dependências\")." >&2
  exit 2
fi

[ "$(printf '%s' "$ENTRADA" | jq -r '.tool_name // empty' 2>/dev/null)" = "Bash" ] || exit 0

CMD="$(printf '%s' "$ENTRADA" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$CMD" ] || exit 0

# Sem `git` em nenhuma grafia, este hook não tem assunto — e sai ANTES de
# normalizar, só com builtins, a custo constante. É o que mantém o custo perto
# de zero na maioria esmagadora das chamadas: um `cat > arquivo <<EOF` de 10 KB
# sem git pagava a normalização inteira (re-revisão da rodada 1).
case "$CMD" in *git*|*GIT*) ;; *) exit 0 ;; esac

# Teto de tamanho, falha FECHADA. A normalização e as regras são lineares, mas
# têm custo por BYTE, e acima de certo tamanho um comando com `git` passaria a
# disputar com o tempo limite do harness (30 s) — e hook morto pelo tempo
# limite NÃO bloqueia: o comando rodaria (re-revisão da rodada 2: 125 KB de
# `git;` + push forçado, morto aos 30 s, push liberado). Então, acima do teto,
# o hook não avalia: barra e pede para dividir o comando.
#
# O teto é medido em BYTES, não em caracteres: `${#CMD}` conta caracteres na
# locale do harness (C.UTF-8 no WSL e na maioria dos Linux), e 500 000 × `日`
# são 500 000 caracteres mas 1,5 MB — passavam do teto por baixo, a
# normalização levava 21 s e, com `; git push --force` no fim, o hook morria
# no tempo limite: push liberado (re-revisão da rodada 3, N2). A conta é feita
# por `tamanho_em_bytes`, em `LC_ALL=C` local, sem processo externo.
#
# Medido no hook inteiro, em bytes, nas duas locales — C e C.UTF-8 dão o mesmo
# (a normalização já roda em C; WSL, bash 5.3): `git ` denso (uma palavra git a
# cada 4 bytes) 128 KB 1,2 s; 256 KB 2,5 s; 512 KB 4,9-5,3 s; `git;` denso +
# push forçado em 512 KB 5,1-5,9 s; `é git `, `😀 git ` e `git 日;` densos em
# 512 KB 4,4-6,0 s; palavra única sem separador de 512 KB (ASCII ou `日`)
# seguida de `; git push` 2,6-3,3 s; esparso (um `git` por 25 bytes) com push
# no fim, 1 MB sem teto, 0,9 s. Acima do teto: 0,1-0,4 s, barra (1,5 MB de
# `日`: 0,4 s). Sem `git`: ~15 ms (saída antecipada acima). O teto fica em
# 512 KB: a normalização e as regras por regex decidem em até ~6 s nesse
# tamanho. O que este teto NÃO limita é a leitura por TOKEN dos segmentos com
# `push`: ela custa por token e por segmento, não por byte do comando, e tem
# tetos próprios (PUSH_BYTES_TETO e PUSH_TETO, abaixo) — era o pior caso real
# (80 KB em 16 000 linhas `push`: 39 s; 16 KB de tokens num push: 33 s;
# re-revisões da rodada extra, N4 e N5).
#
# Fora deste teto ficava a leitura por token do segmento com `push`
# (comum/base.sh), que era quadrática no tamanho de UM token:
# `${v##*[[:space:]]}` em `expx_sem_descritor`, `${tok##*/}` em `expx_push_le`
# e, em UTF-8, `${v#[\"\']}` em `expx_sem_aspas` tentavam cada prefixo — uma
# palavra de 32 KB terminada em `push` custava 14 s (C) a 67 s (C.UTF-8), e um
# push forçado seguido de `; <32 KB>push` morria no tempo limite, abaixo deste
# teto (achado N3 da rodada 4). Corrigido na rodada 5: essas leituras são
# lineares (uma passada por token), e o teste.sh cobre 32 KB e 128 KB em C e
# C.UTF-8. O mesmo vale para `destino_do_refspec` abaixo.
GIT_TETO=524288
# tamanho_em_bytes <texto> — CMD_BYTES recebe o tamanho de <texto> em bytes,
# qualquer que seja a locale de quem chamou. (A locale é ajustada no `local`;
# a medida vem na linha seguinte: os argumentos do `local` expandem antes dele.)
tamanho_em_bytes() {
  local LC_ALL=C
  CMD_BYTES=${#1}
}
tamanho_em_bytes "$CMD"
if [ "$CMD_BYTES" -gt "$GIT_TETO" ]; then
  CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null)"
  RAIZ="$(expx_raiz "${CWD:-$PWD}")"
  MODO="$(expx_modo "$HOOK" "$PADRAO" "$RAIZ")"
  [ "$MODO" = "desligado" ] && exit 0
  expx_barra "$MODO" "$RAIZ" "$HOOK" "comando com git grande demais para avaliar" \
"mergex/git-perigoso — comando com git acima do teto de avaliação

Tamanho: $CMD_BYTES bytes (teto: $GIT_TETO bytes; ${#CMD} caracteres)

Este hook lê o comando inteiro antes de decidir. Acima deste tamanho a leitura
disputaria com o tempo limite do harness, e um hook morto pelo tempo limite não
bloqueia nada — então ele não avalia: barra.

O que fazer:
  - Divida o comando em partes menores, e deixe o git numa parte só dele.
  - Conteúdo grande (heredoc, dados) vai para um arquivo, numa chamada sem git."
  exit 0
fi

# A palavra do programa git, normalizada UMA vez para a grafia `git` — antes do
# pré-filtro, da leitura do push e das regras por regex, que leem CMD_N; as
# mensagens continuam mostrando CMD como foi escrito. Somem: as aspas pareadas
# (`"git"`, `'/usr/bin/git'`), o caminho (`/usr/bin/git`, `./git`), a barra que
# pula alias (`\git`) e o `.exe`. É o mesmo programa; sem isto `"git" push -f`
# saía no pré-filtro (a aspa de fechamento colada no `git`) e `git.exe commit`
# passava pelas regras 2-5, que casam só a grafia `git` (CodeAnt 4235529191 e
# revisão). Um caminho que termina em `git` como ARGUMENTO (`ls ./tools/git`,
# `git log -- src/git`) também vira `git`, mas não é programa do segmento nem é
# seguido de subcomando perigoso: nenhuma regra dispara. Não resolve variável,
# substituição de comando, alias nem caminho com espaço: o hook lê texto, não
# valor (follow-up declarado).
#
# Só expansões do bash: este hook não invoca sed (test-m4a 6.18 — com sed
# ausente ou BSD a decisão não pode mudar de lado), e um utilitário que falhasse
# deixaria CMD_N vazio e o hook sairia por 0 antes das regras.
GIT_SEP='[[:space:];&|`(){}]'
# normaliza_git <comando> — CMD_N recebe o comando com cada palavra que é o
# programa git reduzida a `git`; separadores (GIT_SEP, a quebra de linha
# inclusive) e as demais palavras ficam como estão, byte a byte. Palavra é um
# trecho máximo sem separador. Linear no tamanho, sem processo externo:
#   - toda expansão `${s:i:k}` do bash custa O(tamanho de s) — ele recalcula o
#     comprimento a cada uma, mesmo em LC_ALL=C (medido: 25 mil índices numa
#     string de 100 KB, 2,6 s) —, então NADA indexa a string inteira: ela é
#     cortada UMA vez em pedaços de 4 KB (`${s:off:4096}`, uma extração por
#     pedaço) e todo índice é dentro do pedaço;
#   - no pedaço, `read -a` com IFS = GIT_SEP dá as palavras de uma vez, em C (um
#     campo vazio do read — dois separadores não brancos colados — não é
#     palavra e é pulado); um índice `p` anda pelo pedaço, os separadores antes
#     de cada palavra são copiados por posição, a palavra é decidida pela regra
#     abaixo, e os pedaços de saída vão para um array que `printf -v` junta de
#     uma vez. Nunca se copia o resto da string por ocorrência — era isso
#     (`${rest:n+3}`) que dava O(ocorrências × tamanho): 125 KB de `git;`
#     levavam 35 s e estouravam o timeout do harness, que não bloqueia
#     (re-revisão da rodada 2);
#   - a última palavra de um pedaço pode continuar no seguinte: quando o pedaço
#     termina em byte que não é separador, essa palavra (a última que o `read`
#     devolveu) não é emitida — fica pendente (`pend`) e abre o próximo pedaço,
#     para ser decidida inteira. Nenhum padrão com `*` toca o pedaço: `${c##*…}`
#     numa palavra de 70 KB sem separador tentava cada prefixo e era quadrático.
# LC_ALL=C local: índice por byte; byte de continuação UTF-8 nunca é separador
# (um caractere partido entre pedaços cai dentro da palavra pendente e volta
# inteiro). A saída é byte a byte a mesma das versões anteriores (fuzz
# diferencial, 12 mil entradas, C e C.UTF-8). Medido no hook inteiro: ver o
# teto acima.
normaliza_git() {
  local LC_ALL=C s="$1" off=0 c nc pend="" W P w t p j m k=0 n nw i
  n=${#s}                          # (fora do `local`: os argumentos dele expandem antes de qualquer atribuição)
  CMD_N=""
  P=()
  while [ "$off" -lt "$n" ] || [ -n "$pend" ]; do
    if [ "$off" -lt "$n" ]; then c="$pend${s:off:4096}"; off=$((off + 4096)); else c="$pend"; fi
    pend=""
    [ -n "$c" ] || continue
    IFS=$' \t\n\v\f\r;&|`(){}' read -r -d '' -a W <<<"$c"
    nw=${#W[@]}
    if [ "$off" -lt "$n" ]; then
      # o pedaço termina dentro de uma palavra: a última fica pendente
      case "${c: -1}" in $GIT_SEP) ;; *) nw=$((nw - 1)); pend="${W[nw]}" ;; esac
    fi
    nc=${#c}; p=0; i=0
    # pedaço sem `git` na parte a emitir: copiado inteiro, sem laço por palavra
    # (num comando grande e esparso, só os pedaços com `git` pagam o laço)
    case "${c:0:nc-${#pend}}" in
      *git*) ;;
      *) P[k]="${c:0:nc-${#pend}}"; k=$((k + 1)); continue ;;
    esac
    while [ "$i" -lt "$nw" ]; do
      w="${W[i]}"; i=$((i + 1))
      [ -n "$w" ] || continue
      j=$p                         # pula os separadores antes da palavra
      while [ "$j" -lt "$nc" ]; do case "${c:j:1}" in $GIT_SEP) j=$((j + 1)) ;; *) break ;; esac; done
      m=${#w}; t="$w"
      case "$t" in
        \"?*\") t="${t#\"}"; t="${t%\"}" ;;
        \'?*\') t="${t#\'}"; t="${t%\'}" ;;
      esac
      t="${t#\\}"
      # aspa que sobrou sem par (a de abertura de um embrulho ou de um `echo
      # "..."`) e `=` (atribuição `GIT=/usr/bin/git`, opção `--git-dir=…/git`)
      # não são programa: a palavra fica como está
      case "$t" in
        *[\"\'=]*) ;;
        git|*/git|git.exe|*/git.exe) w=git ;;
      esac
      P[k]="${c:p:j-p}$w"; k=$((k + 1))
      p=$((j + m))
    done
    # os separadores depois da última palavra emitida (até a pendente, se houver)
    P[k]="${c:p:nc-${#pend}-p}"; k=$((k + 1))
  done
  [ "$k" -gt 0 ] || return 0
  printf -v CMD_N '%s' "${P[@]}"
}
normaliza_git "$CMD"

# Saída antecipada: se não invoca git, este hook não tem assunto.
# É o que mantém o custo perto de zero na maioria esmagadora das chamadas.
#
# A aspa entra na lista de caracteres que podem vir ANTES do `git` porque
# `bash -c "git push"`, `sh -c '...'` e `eval "..."` embrulham o comando num
# argumento: a primeira letra do programa passa a encostar na aspa de abertura.
# Sem ela, esta linha saía com sucesso antes de qualquer regra rodar, e
# embrulhar o comando desligava o hook inteiro — não só o push. A saída sem jq
# (acima) sempre enxergou essa forma; era esta lista que estava mais estreita
# do que a de lá, e a diferença entre as duas era o bypass.
#
# A barra e `.exe` continuam na lista para o git por caminho DENTRO de um
# embrulho (`bash -c "/usr/bin/git push"`), que a normalização acima não reduz
# (a aspa de abertura não é a do programa); a leitura do push (comum/base.sh,
# expx_e_git) lê essa forma por token.
#
# Sem `-q`, de propósito — aqui e em todo grep sobre CMD_N abaixo: comum/base.sh
# liga `pipefail`, e um grep que casa na primeira linha e sai dá SIGPIPE ao
# printf quando o comando passa do buffer do pipe; o pipeline devolvia 141 e
# este `|| exit 0` liberava um push forçado seguido de milhares de linhas
# (rodada 5 da revisão). Sem `-q` o grep lê até o fim, e o status é só dele.
printf '%s' "$CMD_N" | grep -E '(^|[;&|`(){}'\''"[:space:]/\\])git(\.exe)?([[:space:]]|$)' >/dev/null || exit 0

CWD="$(printf '%s' "$ENTRADA" | jq -r '.cwd // empty' 2>/dev/null)"
RAIZ="$(expx_raiz "${CWD:-$PWD}")"

MODO="$(expx_modo "$HOOK" "$PADRAO" "$RAIZ")"
[ "$MODO" = "desligado" ] && exit 0

# Qual é a branch principal deste repositório: pergunta ao repositório,
# não adivinha. Sem estado próprio (regra 6 do contrato).
principal() {
  local p
  p="$(git -C "$RAIZ" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"
  p="${p#origin/}"
  if [ -z "$p" ]; then
    for c in main master; do
      if git -C "$RAIZ" show-ref --verify --quiet "refs/heads/$c"; then p="$c"; break; fi
    done
  fi
  printf '%s\n' "${p:-main}"
}

barra() { expx_barra "$MODO" "$RAIZ" "$HOOK" "$1" "$2"; }

# A principal e a branch ativa são lidas antes das regras porque a leitura do
# push (logo abaixo) já precisa das duas para resolver `HEAD` e reconhecer o
# destino.
PRINCIPAL="$(principal)"
ATUAL="$(git -C "$RAIZ" branch --show-current 2>/dev/null)"

# --------------------------------------------------------------------------
# 0. Leitura do push — o segmento normalizado, não a linha inteira
# --------------------------------------------------------------------------
# Regex sobre a linha inteira erra dos dois lados, e os dois erros são falha
# ABERTA num hook de segurança:
#
#   - "sem destino" virava uma FORMA de linha (opções, uma palavra solta, fim
#     do comando). Redirecionar a saída, encanar num tee ou escrever uma opção
#     DEPOIS do remoto desfazia a forma, e o push implícito em main passava;
#   - `git -C <path> push` e `git -c <k>=<v> push` deixavam de ser reconhecidos
#     como push, porque o VALOR da opção global entra numa palavra separada
#     entre `git` e `push`. Com isso saía a seção inteira — inclusive o forçado.
#
# Aqui o comando é quebrado nos separadores de segmento e cada segmento que
# começa em `git` e chega em `push` é lido POR TOKEN, como o próprio git lê:
# opções globais (algumas com valor separado), subcomando, opções do push
# (algumas com valor separado), remoto e refspecs.
#
# Não é um parser de shell: não expande variável, não resolve substituição de
# comando, não entende agrupamento e só tira um par de aspas das pontas do
# token. O que ele não classificar POSITIVAMENTE não é liberado — é barrado
# (PUSH_OBSCURO). Provar que o destino não é a principal é obrigação do hook.
#
# Todo segmento de push é lido, não só o primeiro: em `git push origin
# feature/x && git push origin main` o perigo está no segundo, e a regra
# anterior — que varria a linha inteira — já o enxergava. Ler só o primeiro
# devolveria essa cobertura para trás.

PUSH_VISTO=0        # o comando contém pelo menos um `git ... push`
PUSH_FORCA=0        # --force, -f (inclusive colado), --force-*, +refspec
PUSH_AMPLO=0        # --all, --mirror: alcança refs que o comando não nomeia
PUSH_PRINCIPAL=0    # algum destino nomeado É a principal
PUSH_SEM_DESTINO=0  # nenhum refspec: o destino é o upstream da branch ativa
PUSH_OBSCURO=0      # há destino, mas ele não foi classificado

# A leitura por token mora em comum/base.sh (expx_push_segmentos e
# expx_push_le), compartilhada com o pr-so-com-portao. As decisões dela, que
# continuam valendo aqui:
#
#   - aspas: uma em cada ponta do token, e só. Sem isto `origin "main"` não era
#     a principal; e a aspa sai ANTES de qualquer comparação, porque quando o
#     comando vem embrulhado a aspa de fechamento cola na última palavra, que
#     costuma ser uma opção (`bash -c "git push --all"` dá `--all"`);
#   - executor: `bash -c "git push origin main"` executa o push; `echo "git
#     push origin main"` só imprime o texto. O `git` só é procurado adiante
#     quando o programa do segmento RODA o argumento. Um lançador fora da
#     lista (ex.: `find -exec`) não é lido como execução de push: troca
#     consciente, para não barrar toda linha que apenas MENCIONA um push;
#   - descritor: o número que abre um redirecionamento é descritor só quando é
#     uma palavra inteira de dígitos. `git push origin main2>/tmp/log` empurra
#     para `main2`, que é outra branch — cortar o dígito transformava `main2`
#     na principal `main`;
#   - continuação de linha: o par barra-invertida+quebra é emendado ANTES da
#     quebra em segmentos (para o shell ele não separa nada), e só quando a
#     barra NÃO está escapada — a paridade da corrida de barras decide. Sem
#     emendar, o destino escrito na linha seguinte deixava de ser lido; sem
#     contar a paridade, `\\` + quebra fundia dois comandos e o push da linha
#     de baixo sumia. As mensagens seguem mostrando o comando como foi escrito;
#   - segmentos: `&&`, `||`, `;`, `|`, `&`, subshell, crase e redirecionamento
#     separam comandos, pela troca do `tr` (o `\n` no lado direito do `sed` é
#     extensão GNU: no BSD os segmentos grudavam e o push sumia).

# Destino de um refspec: o lado direito do `:` quando ele existe, o próprio
# refspec quando não existe. `HEAD` e `@` são a branch ativa.
destino_do_refspec() {
  local r d
  r="$(expx_sem_aspas "$1")"
  r="${r#+}"
  # o que vem depois do último `:`, numa passada: `${r%:*}` para no último `:`
  # (`${r##*:}` tentava cada prefixo — quadrático num refspec longo; rodada 5)
  case "$r" in *:*) d="${r%:*}"; r="${r:${#d}+1}" ;; esac
  r="$(expx_sem_aspas "$r")"
  r="${r#refs/heads/}"
  case "$r" in HEAD|@) r="$ATUAL" ;; esac
  printf '%s' "$r"
}

# Lê um segmento. Devolve 0 se ele era mesmo um `git ... push`.
le_push() {
  local tok d i
  expx_push_le "$1" || return 1
  PUSH_VISTO=1

  i=0
  while [ "$i" -lt "${#EXPX_PUSH_OPCOES[@]}" ]; do
    tok="${EXPX_PUSH_OPCOES[$i]}"; i=$((i + 1))
    case "$tok" in
      --force|--force-*) PUSH_FORCA=1 ;;
      --all|--mirror)    PUSH_AMPLO=1 ;;
      --*) ;;
      -*) # Aglomerado curto: `-fu` é tão forçado quanto `-f`.
          case "$tok" in *f*) PUSH_FORCA=1 ;; esac ;;
    esac
  done

  # Primeiro posicional é o remoto; os seguintes são refspecs.
  if [ "$EXPX_PUSH_TEM_REMOTO" = 1 ] && [ "$EXPX_PUSH_REMOTO" = "$PRINCIPAL" ]; then
    PUSH_PRINCIPAL=1
  fi
  i=0
  while [ "$i" -lt "${#EXPX_PUSH_REFSPECS[@]}" ]; do
    tok="${EXPX_PUSH_REFSPECS[$i]}"; i=$((i + 1))
    case "$tok" in +*) PUSH_FORCA=1 ;; esac
    d="$(destino_do_refspec "$tok")"
    if [ "$d" = "$PRINCIPAL" ]; then
      PUSH_PRINCIPAL=1
    elif ! printf '%s' "$d" | grep -E '^[A-Za-z0-9@][A-Za-z0-9._/@-]*$' >/dev/null; then
      PUSH_OBSCURO=1
    fi
  done

  [ "${#EXPX_PUSH_REFSPECS[@]}" = 0 ] && PUSH_SEM_DESTINO=1
  return 0
}

# Todo segmento que pode ser um push é lido — até dois tetos, falha FECHADA. A
# leitura por token (expx_push_le: um subshell de expx_sem_aspas por token)
# custa ~3-4 ms por TOKEN em C.UTF-8, mais ~2,4 ms de piso por segmento, e o
# teto de bytes do comando (512 KB) não limita isso: um push forçado seguido de
# um push com 2 000 tokens de 1 byte (4 KB) levava 6-8,5 s, com 8 000 tokens
# 25-33 s, e 16 000 linhas `push` 39 s — mortos pelo tempo limite do harness,
# o push passava (re-revisões da rodada extra: N4, N5). Então, ANTES de ler:
#   - PUSH_BYTES_TETO: bytes somados dos segmentos que contêm `push`. Um push
#     legítimo tem menos de 200 B; `git push -u origin feature/x` com 20
#     refspecs e `&& gh pr create` tem ~250 B. O pior caso abaixo do teto são
#     tokens de 1 byte (teto/2 tokens) — medido no hook inteiro, C.UTF-8 (C é
#     ~10% mais rápido): 512 tokens 1,7 s; 1 024 3,3 s; 1 536 5,0 s; 2 048
#     (4 KB) 6,7 s; 4 096 13,9 s. Com o teto em 4 096 B o pior caso decide em
#     6,4-6,7 s (1,5x de folga para 10 s, 4x para o tempo limite); 4 096 B
#     exatos leem, 4 099 barram em 0,2 s. Tokens multibyte (`日`: 1 024 em 4 KB,
#     3,7 s) e entre aspas custam o mesmo por token e cabem em menos tokens;
#     opções (`-f`) custam menos (400 em 1,2 KB: 0,3 s).
#   - PUSH_TETO: número desses segmentos (cada um custa ~2,4 ms mesmo com uma
#     palavra: 400 linhas `push`, 2 KB, 1,0 s; 4 KB de `push\n` seriam 819
#     segmentos, ~2 s). 150 pushes completos em 150 linhas (3,9 KB) decidem em
#     1,0 s; 157 (4 082 B) leem, 158 (4 108 B) barram pelo teto de bytes.
# As duas medidas são só expansões do bash em LC_ALL=C (índice por byte; a
# troca `${v//…}` é linear em C e quadrática em UTF-8, e só roda sobre o que já
# cabe no teto de bytes). Sem utilitário: com `wc -l`, PATH sem `wc` dava
# contagem 0 em silêncio, o teto sumia e `wc: command not found` vazava (N6).
PUSH_BYTES_TETO=4096
PUSH_TETO=500
# mede_push_segs <segmentos> — PUSH_BYTES recebe o tamanho em bytes; PUSH_N, o
# número de linhas (segmentos), contado só quando os bytes já cabem no teto.
mede_push_segs() {
  local LC_ALL=C nl=$'\n' so
  PUSH_BYTES=${#1}
  PUSH_N=0
  [ "$PUSH_BYTES" -le "$PUSH_BYTES_TETO" ] || return 0
  if [ -n "$1" ]; then so="${1//[!$nl]/}"; PUSH_N=$(( ${#so} + 1 )); fi
}
PUSH_SEGS="$(expx_push_segmentos "$CMD_N")"
mede_push_segs "$PUSH_SEGS"
if [ "$PUSH_BYTES" -gt "$PUSH_BYTES_TETO" ]; then
  barra "comando com segmentos de push grandes demais para avaliar" \
"mergex/git-perigoso — segmentos de push maiores do que o hook avalia

Bytes nos segmentos com push: $PUSH_BYTES (teto: $PUSH_BYTES_TETO)

Este hook lê por token cada segmento que pode ser um push, e o custo é por
token. Acima deste tamanho a leitura disputaria com o tempo limite do harness,
e um hook morto pelo tempo limite não bloqueia nada — então ele não avalia:
barra.

O que fazer:
  - Divida o comando: um push por chamada, só com remoto e refspec.
  - Texto que só cita push (documentação, dados) vai para um arquivo, numa
    chamada sem git."
  exit 0
fi
if [ "$PUSH_N" -gt "$PUSH_TETO" ]; then
  barra "comando com segmentos de push demais para avaliar" \
"mergex/git-perigoso — comando com mais segmentos de push do que o hook avalia

Segmentos com push: $PUSH_N (teto: $PUSH_TETO)

Este hook lê por token cada segmento que pode ser um push. Acima deste número a
leitura disputaria com o tempo limite do harness, e um hook morto pelo tempo
limite não bloqueia nada — então ele não avalia: barra.

O que fazer:
  - Divida o comando em partes menores, com poucos pushes em cada uma.
  - Texto que só cita push (documentação, dados) vai para um arquivo, numa
    chamada sem git."
  exit 0
fi
while IFS= read -r SEG; do
  le_push "$SEG" || true
done <<<"$PUSH_SEGS"

# --------------------------------------------------------------------------
# 1. Push forçado — em qualquer forma
# --------------------------------------------------------------------------
# --force, -f, --force-with-lease, --force-if-includes e o +refspec.
if [ "$PUSH_FORCA" = 1 ]; then
  barra "push forcado" \
"mergex/git-perigoso — push forçado

Comando: $CMD

Push forçado reescreve o que já está no remoto. O commit de outra pessoa que
estiver naquela branch desaparece do histórico, e ela só descobre no próximo
pull — quando já perdeu o trabalho.

Isto é bloqueado em qualquer forma: --force, -f, --force-with-lease e +refspec.

O que fazer:
  - Divergiu da base? Rebaseie ou faça merge da base na sua branch e empurre
    normalmente.
  - Precisa desfazer algo já enviado? Faça um commit que reverte (git revert).
    O histórico cresce, mas ninguém perde nada.
  - É mesmo necessário reescrever? É decisão humana, fora da mergex."
fi

# --------------------------------------------------------------------------
# 2. Push ou commit direto na branch principal
# --------------------------------------------------------------------------
# commit: barra quando a branch ativa É a principal
if printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' >/dev/null; then
  if [ -n "$ATUAL" ] && [ "$ATUAL" = "$PRINCIPAL" ]; then
    barra "commit na branch principal" \
"mergex/git-perigoso — commit direto na branch principal

Branch ativa: $ATUAL (a principal deste repositório)

O trabalho da mergex nasce numa branch própria (E0), antes da primeira linha
de código. Commit direto na principal pula a revisão inteira: não há PR, não
há classificação de atenção humana, não há portão.

O que fazer:
  - Crie a branch do trabalho e commite nela:
      git switch -c <tipo>/<trabalho_id>-<slug>
  - Ou acione /mergex-abrir, que faz isso registrando a branch no ENTREGA.md."
  fi
fi

# push para a principal — três perguntas, e nenhuma cobre a outra:
#
#   a) o push alcança refs que ele NÃO nomeia? `--all` e `--mirror` empurram a
#      principal junto, de qualquer branch. Barra sempre. (Refspec com curinga
#      cai em (d): o hook não consegue dizer o que ele alcança.)
#
#   b) o comando NOMEIA a principal como destino? Então barra, qualquer que
#      seja a branch ativa. O destino é o lado direito do `:` quando ele
#      existe (`HEAD:main`, `:main`, `feature/x:main`, `:refs/heads/main`) e o
#      próprio refspec quando não existe — o `+` do forçado e um par de aspas
#      saem antes da comparação.
#
#   c) o comando NÃO nomeia destino nenhum (`git push`, `git push origin`,
#      `git push origin --all`, `git -C <path> push`)? Então o destino é o
#      upstream da branch ativa, e só nesse caso "estou na principal" é motivo
#      suficiente. `HEAD` e `@` não caem aqui: são destino nomeado, e (b) os
#      resolve para a branch ativa.
#
#   d) o destino existe mas é ILEGÍVEL (variável, substituição de comando,
#      curinga)? Barra: o hook não provou que ele não é a principal.
#
# Aplicar (c) a qualquer push era o falso positivo: barrava `git push origin
# feature/x`, `git push origin --delete feature/x` e `git push origin
# :refs/heads/feature/x` estando em main — destinos que não tocam a principal
# e são exatamente o trabalho legítimo de quem nunca saiu dela.
#
# "Sem destino" é a AUSÊNCIA de refspec no segmento lido, não uma forma de
# linha: redirecionamento, cano e opção depois do remoto não transformam um
# push implícito em push com destino.
if [ "$PUSH_VISTO" = 1 ] && [ "$PUSH_AMPLO" = 1 ]; then
  barra "push de alcance amplo" \
"mergex/git-perigoso — push que alcança refs não nomeadas

Comando: $CMD

--all e --mirror não empurram só o que o comando escreve: empurram o conjunto
de refs do repositório, e a principal ($PRINCIPAL) está nele. --mirror ainda
apaga no remoto o que não existe aqui.

Estar fora da principal não muda isso — o alcance é do comando, não da branch.

O que fazer:
  - Empurre o que você quer empurrar, pelo nome:
      git push -u origin <sua-branch>
  - Espelhar ou empurrar tudo é decisão humana, fora da mergex."
fi

if [ "$PUSH_VISTO" = 1 ]; then
  if [ "$PUSH_PRINCIPAL" = 1 ] \
  || { [ -n "$ATUAL" ] && [ "$ATUAL" = "$PRINCIPAL" ] && [ "$PUSH_SEM_DESTINO" = 1 ]; }; then
    barra "push na branch principal" \
"mergex/git-perigoso — push direto na branch principal

Alvo: $PRINCIPAL

Código entra na principal por pull request revisado, não por push direto.
Integrar é decisão humana (regra 16 da mergex).

O que fazer:
  - Empurre a branch do trabalho e abra o PR:
      git push -u origin <sua-branch>
  - Ou acione /mergex-pr, que sobe a branch e abre o PR pelos artefatos."
  fi
fi

# Destino ilegível: variável, substituição de comando, aspas aninhadas. O hook
# vê o texto, não o valor que o shell vai produzir — não há como provar que o
# destino não é a principal, e o que não se prova não passa (falha fechada).
if [ "$PUSH_VISTO" = 1 ] && [ "$PUSH_OBSCURO" = 1 ]; then
  barra "destino de push nao classificado" \
"mergex/git-perigoso — destino de push que o hook não consegue ler

Comando: $CMD

O destino deste push só existe depois que o shell expande a linha: variável,
substituição de comando ou aspas dentro do token. O hook lê o texto, então não
tem como provar que o alvo não é a principal ($PRINCIPAL) — e um hook de
segurança não libera o que não provou.

O que fazer:
  - Escreva o destino por extenso:
      git push -u origin <sua-branch>
  - Ou acione /mergex-pr, que sobe a branch e abre o PR pelos artefatos."
fi

# --------------------------------------------------------------------------
# 3. Reescrita de histórico já enviado
# --------------------------------------------------------------------------
if printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+(rebase|filter-branch|filter-repo)([[:space:]]|$)' >/dev/null \
|| printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit[^|;&]*[[:space:]]--amend([[:space:]]|$)' >/dev/null \
|| printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+reset[^|;&]*[[:space:]]--hard([[:space:]]|$)' >/dev/null; then
  # Só é perigoso se o que seria reescrito já foi enviado ao remoto.
  # Sem upstream, é histórico local: não barra (precisão, regra 1).
  UP="$(git -C "$RAIZ" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"
  if [ -n "$UP" ]; then
    JA_ENVIADO="$(git -C "$RAIZ" rev-list --count "$UP..HEAD" 2>/dev/null || echo 0)"
    # HEAD == upstream => todo commit local já está no remoto: reescrever mexe
    # no que os outros já têm.
    if [ "${JA_ENVIADO:-0}" = "0" ]; then
      barra "reescrita de historico ja enviado" \
"mergex/git-perigoso — reescrita de histórico já enviado

Comando: $CMD
Branch:  ${ATUAL:-?} (acompanha $UP)

Todos os commits desta branch já estão no remoto. Reescrevê-los troca os
identificadores do que outras pessoas já baixaram — e a reconciliação delas
vira conflito ou perda.

O que fazer:
  - Desfazer algo já enviado: git revert <commit> (novo commit, nada some).
  - Ajustar só o que ainda é local: confira com
      git log --oneline $UP..HEAD
    Se estiver vazio, não há nada local para ajustar.
  - Reescrever mesmo assim é decisão humana, fora da mergex."
    fi
  fi
fi

# --------------------------------------------------------------------------
# 4. Descarte de alteração local
# --------------------------------------------------------------------------
# git checkout -- <path> / git restore <path> / git stash drop|clear
DESCARTA=0
if printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+checkout[^|;&]*[[:space:]]--([[:space:]]|$)' >/dev/null; then
  DESCARTA=1
elif printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+rest''ore([[:space:]]|$)' >/dev/null; then
  # Só desfazer o stage nao toca a arvore de trabalho e nao destroi nada.
  # Barrar isso seria o falso positivo que atrapalha o dia inteiro.
  if printf '%s' "$CMD_N" | grep -E '[[:space:]]--worktree([[:space:]]|=|$)' >/dev/null; then
    DESCARTA=1
  elif printf '%s' "$CMD_N" | grep -E '[[:space:]]--staged([[:space:]]|=|$)' >/dev/null; then
    DESCARTA=0
  else
    DESCARTA=1
  fi
elif printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+stash[[:space:]]+(drop|clear)([[:space:]]|$)' >/dev/null; then
  DESCARTA=1
fi
if [ "$DESCARTA" = "1" ]; then
  SUJO="$(git -C "$RAIZ" status --porcelain 2>/dev/null | awk 'NR <= 20')"
  if [ -n "$SUJO" ]; then
    barra "descarte de alteracao local" \
"mergex/git-perigoso — descarte de alteração local

Comando: $CMD

Há alteração não commitada na árvore. Este comando a joga fora, e o
versionador não guarda cópia do que nunca foi commitado — não há como voltar.

A alteração pode não ser sua: pode ser trabalho de quem estava na máquina.

Pendente agora:
$SUJO

O que fazer:
  - Guardar antes de descartar:  git stash push -m 'antes de descartar'
  - Ver o que exatamente se perde: git diff
  - Descartar mesmo assim é decisão humana, fora da mergex."
  fi
fi

# --------------------------------------------------------------------------
# 5. Limpeza destrutiva de arquivo não rastreado
# --------------------------------------------------------------------------
if printf '%s' "$CMD_N" | grep -E 'git([[:space:]]+-[^[:space:]]+)*[[:space:]]+clean([[:space:]]|$)' >/dev/null; then
  if printf '%s' "$CMD_N" | grep -E '[[:space:]]-[a-zA-Z]*[fdx]' >/dev/null; then
    ALVOS="$(git -C "$RAIZ" clean -nd 2>/dev/null | awk 'NR <= 20')"
    barra "limpeza destrutiva" \
"mergex/git-perigoso — limpeza destrutiva de arquivos não rastreados

Comando: $CMD

git clean apaga arquivo que o versionador nunca viu. Não há histórico, não há
stash, não há recuperação. Arquivo de ambiente, dado local e trabalho ainda
não commitado de outra pessoa somem juntos.

Seria removido:
${ALVOS:-  (não foi possível pré-visualizar)}

O que fazer:
  - Veja antes, sempre:  git clean -nd
  - Remova só o que você conhece, pelo caminho, com rm.
  - Limpar em bloco é decisão humana, fora da mergex."
  fi
fi

expx_permite "$RAIZ" "$HOOK" "comando git sem operacao destrutiva"
