#!/usr/bin/env bash
# integracao-da-mensagem — biblioteca (carregada com `.`) dos hooks de commit.
#
# Reconhece a classe "integração de base" pela MENSAGEM do commit, nunca pelo
# estado do Git: só vale a mensagem que declara `Integra-base:` como trailer
# isolado e limpo. O que a leitura não isola (aspas soltas, lixo depois dos 40
# hex, trailers que o Git não acha) é classe "nenhuma": regras de sempre.
# Bloquear só com prova.
#
# Requer RAIZ (raiz do repositório) definida pelo chamador.

# integracao_le_m <comando> — a(s) mensagem(ns) de `-m "..."`, cada uma cortada
# na aspa de fechamento; `-m "a" -m "b"` vira dois parágrafos. Vazio se não há.
integracao_le_m() {
  local rest out="" seg
  case "$1" in *' -m "'*) ;; *) return 0 ;; esac
  rest="${1#*' -m "'}"
  while :; do
    seg="${rest%%\"*}"
    out="${out:+$out$'\n\n'}$seg"
    [ "$seg" = "$rest" ] && break
    rest="${rest#*\"}"
    case "$rest" in
      ' -m "'*) rest="${rest#' -m "'}" ;;
      *) break ;;
    esac
  done
  printf '%s' "$out"
}

# integracao_arquivo_do_comando <comando> — o caminho de `-F <arquivo>` ou
# `--file=<arquivo>`, absoluto ou resolvido contra a RAIZ; vazio se o comando
# não os tem. As formas entre aspas (`-F "com espaço/msg"`, `-F '…'`,
# `--file="…"`, `--file='…'`) são lidas ANTES da forma sem aspas, que para no
# primeiro espaço e devolvia `"com` — caminho ilegível, mensagem vazia, e o
# merge de integração checado como commit comum (CodeAnt 4235529198). É a única
# leitura do -F dos hooks: commit-por-task.sh e arquivo-fora-do-plano.sh usam
# esta função, não um sed próprio.
integracao_arquivo_do_comando() {
  local arq
  arq="$(printf '%s' "$1" | sed -n \
    -e 's/.*[[:space:]]-F[[:space:]]*"\([^"]*\)".*/\1/p' \
    -e "s/.*[[:space:]]-F[[:space:]]*'\([^']*\)'.*/\1/p" \
    -e 's/.*--file="\([^"]*\)".*/\1/p' \
    -e "s/.*--file='\([^']*\)'.*/\1/p" \
    -e 's/.*[[:space:]]-F[[:space:]]*\([^[:space:]]*\).*/\1/p' \
    -e 's/.*--file=\([^[:space:]]*\).*/\1/p' | awk 'NR == 1')"
  [ -n "$arq" ] || return 0
  arq="$(printf '%s' "$arq" | sed "s/^['\"]//; s/['\"]$//")"
  case "$arq" in /*) : ;; *) arq="$RAIZ/$arq" ;; esac
  printf '%s' "$arq"
}

# integracao_mensagem_do_comando <comando> — o conteúdo de `-F`/`--file`
# (integracao_arquivo_do_comando) ou a mensagem de `-m`; vazio se o hook não
# consegue ler a mensagem (arquivo ilegível, nem -F nem -m).
integracao_mensagem_do_comando() {
  local arq
  arq="$(integracao_arquivo_do_comando "$1")"
  if [ -n "$arq" ]; then
    [ -r "$arq" ] && cat "$arq" 2>/dev/null
    return 0
  fi
  integracao_le_m "$1"
}

# integracao_da_mensagem <mensagem-lida> <trabalho-da-branch> <contrato>
# Variável opcional INT_SEM_CONTRATO: `invalida` (padrão) ou `nenhuma` — o que
# fazer quando o contrato-de-commit.sh não está instalado.
# Define INT_CLASSE (nenhuma | valida | invalida) e INT_SAIDA.
integracao_da_mensagem() {
  INT_CLASSE=nenhuma; INT_SAIDA=""
  local txt tr integra trab tmp mh rc
  # Invólucro do heredoc `-m "$(cat <<'EOF' ... EOF)"`.
  txt="$(awk 'NR==1 && /^\$\(cat[[:space:]]*<</ { h=$0; tab=(h ~ /<<-/); sub(/^\$\(cat[[:space:]]*<<-?[[:space:]]*/, "", h); gsub(/[\047"\\[:space:]]/, "", h); next } h != "" { t=$0; if (tab) sub(/^\t+/, "", t); if (t == h) exit } { print }' <<<"$1")"
  tr="$(printf '%s\n' "$txt" | git interpret-trailers --parse 2>/dev/null)"
  # Sem `-q` (sob `pipefail`, um grep que sai cedo dá SIGPIPE ao printf e o
  # pipeline devolve 141 — rodada extra da revisão): o grep lê até o fim.
  printf '%s\n' "$tr" | grep -E '^Integra-base:' >/dev/null || return 0
  integra="$(printf '%s\n' "$tr" | sed -n 's/^Integra-base:[[:space:]]*//p' | awk 'NR == 1')"
  # Lixo depois dos 40 hex: a leitura não isolou o trailer.
  printf '%s' "$integra" | grep -E '^[0-9a-f]{40}[^0-9a-f]' >/dev/null && return 0
  trab="$2"
  [ -n "$trab" ] || trab="$(printf '%s\n' "$tr" | sed -n 's/^Trabalho:[[:space:]]*//p' | awk 'NR == 1')"
  if [ ! -r "$3" ]; then
    if [ "${INT_SEM_CONTRATO:-invalida}" = invalida ]; then
      INT_CLASSE=invalida; INT_SAIDA="instalação MergeX incompleta: $3"
    fi
    return 0
  fi
  tmp="$(mktemp)" || { INT_CLASSE=invalida; INT_SAIDA="sem arquivo temporário"; return 0; }
  printf '%s\n' "$txt" > "$tmp"
  INT_SAIDA="$(bash "$3" --validar-integracao --trabalho "${trab:-?}" --arquivo "$tmp" 2>&1)"; rc=$?
  rm -f "$tmp"
  if [ "$rc" != 0 ]; then INT_CLASSE=invalida; return 0; fi
  mh="$(git -C "$RAIZ" rev-parse -q --verify MERGE_HEAD 2>/dev/null)"
  if [ "$integra" != "$mh" ]; then
    INT_CLASSE=invalida
    INT_SAIDA="Integra-base diverge de MERGE_HEAD: mensagem=$integra MERGE_HEAD=$mh"
    return 0
  fi
  INT_CLASSE=valida
}
