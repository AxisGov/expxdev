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
    printf '%s' "$CMD" | grep -E '(^|[;&|[:space:]])git([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)' >/dev/null || exit 0
    # A varredura é sobre o que está preparado, não sobre a linha de comando.
    ALVO="$(git -C "$RAIZ" diff --cached 2>/dev/null)"
    # Some a mensagem inline, que também vai para o histórico.
    ALVO="$ALVO
$CMD"
    ORIGEM="o que está em preparação para commit"
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
# Os sinais — mesma tabela do 01-commits.md
# --------------------------------------------------------------------------
# Quatro categorias. Placeholder óbvio não é segredo. Na dúvida, trata como
# segredo (a assimetria é a única segura: falso negativo vaza credencial).
ACHADOS=""

eh_placeholder() {
  local v="$1"
  case "$v" in
    *'${'*|*'{{'*|*\<*\>*) return 0 ;;
  esac
  # Palavras reservadas só dispensam o valor inteiro, não uma credencial real
  # que por acaso contenha "example", "sample" ou outro fragmento.
  printf '%s' "$v" | grep -aEiq -e '^(sk-|gh[pousr]_|github_pat_|xox[baprs]-)?(x{4,}|0{4,}|your[-_](key|token|secret)([-_]here)?([-_](x{4,}|0{4,}))?|example|changeme|troque|placeholder|dummy|fake|sample|redacted|test[-_]?key|coloque)$'
}

achou() {
  # achou <categoria> <regex estendida> [limite a esquerda] [limite a direita]
  # Os limites (opcionais) exigem o que vem antes e depois do valor: prefixo de
  # chave no meio de um identificador nao e chave, nem chave de tamanho fixo
  # seguida de mais caracteres. Entram na busca, nunca no valor mostrado.
  local cat="$1" re="${3:-}$2${4:-}" esq="${3:-}${4:-}" linha valor fim
  # Examine todos os candidatos: placeholder anterior nunca dispensa segredo posterior.
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    while IFS= read -r valor; do
      [ -n "$valor" ] || continue
      [ -n "$esq" ] && valor="$(printf '%s' "$valor" | grep -aEo -e "$2" | head -1)"
      [ -n "$valor" ] || continue
      # Placeholder dispensa somente este candidato.
      eh_placeholder "$valor" && continue
      fim="${valor: -4}"
      ACHADOS="${ACHADOS}  - ${cat}: …${fim} (linha ${linha%%:*})
"
    done <<EXPX_MATCHES
$(printf '%s' "${linha#*:}" | grep -aEo -e "$re")
EXPX_MATCHES
  done <<EXPX_LINHAS
$(printf '%s' "$ALVO" | grep -aEn -e "$re")
EXPX_LINHAS
}

# 1. Chave de API — o prefixo so vale no comeco da linha ou depois de caractere
# que nao continua um identificador: "task-fora-do-plano" nao e chave "sk-"
# (falso positivo que barrou a instalacao do framework no conselho #204).
# `grep -E` nao tem limite de palavra portavel nem lookbehind: dai o grupo explicito.
achou "chave de API"        '(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})' '(^|[^A-Za-z0-9_-])'
achou "chave de API"        'AIza[0-9A-Za-z_-]{35}' '(^|[^A-Za-z0-9_-])' '($|[^A-Za-z0-9_-])'
# A chave de acesso da AWS (AKIA; ASIA, a temporaria do STS) tem fronteira propria:
# o hifen antes dela nao continua identificador nenhum ("id-AKIA..." e chave), so
# letra, digito ou _ continuam. A chave tem exatamente 20 caracteres: seguida de
# letra, digito ou _ e identificador mais longo, nao chave. Mesmo padrao do
# segredo.sh da sprintx.
achou "chave de API"        'A[KS]IA[0-9A-Z]{16}' '(^|[^A-Za-z0-9_])' '($|[^A-Za-z0-9_])'
# 2. Credencial em atribuição
achou "credencial"          '([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Ss][Ee][Nn][Hh][Aa]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Aa][Pp][Ii]_?[Kk][Ee][Yy])[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9/+_.=-]{8,}'
# 3. Chave privada
achou "chave privada"       '-----BEGIN [A-Z ]*PRIVATE KEY-----'
# 4. Conexão com credencial embutida
achou "credencial em URL"   '[a-zA-Z][a-zA-Z0-9+.-]*://[^/[:space:]:]+:[^@[:space:]]{4,}@'
# 5. Dado real de cliente — CPF/CNPJ formatado
achou "dado real de cliente" '([0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2})'

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
