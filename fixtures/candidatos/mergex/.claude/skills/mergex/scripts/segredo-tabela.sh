#!/usr/bin/env bash
# segredo-tabela — a tabela de sinais de segredo da MergeX, uma só.
#
# Carregada pelo hook `sem-segredo` (PreToolUse: o que vai entrar num commit) e
# pelo `portao-push.sh` (pre-push: o que vai ser publicado), para os dois
# decidirem com a mesma tabela (conselhos#210, P3; DM-279). Mesma tabela do
# 01-commits.md e do V10 do portão.
#
# Uso: ALVO="<texto>"; segredo_varrer; [ -n "$ACHADOS" ] && ...
# `segredo_varrer` zera ACHADOS, lê só o ALVO e devolve os achados mascarados
# (só os quatro últimos caracteres do valor), uma linha por achado:
#   "  - <categoria>: …<fim> (linha <n>)"
# Não decide, não imprime e não sai: quem carrega aplica o modo.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

# --------------------------------------------------------------------------
# Os sinais — mesma tabela do 01-commits.md
# --------------------------------------------------------------------------
# Quatro categorias. Placeholder óbvio não é segredo. Na dúvida, trata como
# segredo (a assimetria é a única segura: falso negativo vaza credencial).

eh_placeholder() {
  local v="$1"
  # O valor depois do primeiro `:` ou `=` (na credencial em atribuição o candidato
  # traz a chave junto), sem aspas: variável de shell sem chaves, formatação e
  # máscara são referência, não valor (conselhos#210, P8).
  local cauda="${v#*[:=]}"
  cauda="${cauda#"${cauda%%[![:space:]\'\"]*}"}"; cauda="${cauda%[\'\"]}"
  # `${...}`, `{{...}}` e `<...>` só são referência quando são o valor inteiro: um
  # `${X}` no meio de uma senha real não a dispensa (CodeAnt no mergex#54).
  printf '%s\n%s\n' "$v" "$cauda" \
    | grep -aEq -e '^(\$\{[^}]*\}|\{\{[^}]*\}\}|<[^<>]*>)$' && return 0
  case "$cauda" in '%s'|'%('*')s') return 0 ;; esac
  printf '%s' "$cauda" | grep -aEq -e '^(\$[A-Za-z_][A-Za-z0-9_]*|[*]+|[?]+)$' && return 0
  # Palavras reservadas só dispensam o valor inteiro, não uma credencial real
  # que por acaso contenha "example", "sample" ou outro fragmento. O valor pode
  # juntar mais de uma (`sk-example-placeholder`), mas só delas é feito.
  local w='(x{4,}|0{4,}|your[-_](key|token|secret)([-_]here)?([-_](x{4,}|0{4,}))?|example|changeme|troque|placeholder|dummy|fake|sample|redacted|test[-_]?key|coloque)'
  # O valor inteiro (chave de API, sem `:`/`=`) ou só a cauda (credencial em
  # atribuição, que chega com a chave junto: `token: "placeholder`) — login#30.
  local alvo_w
  for alvo_w in "$v" "$cauda"; do
    printf '%s' "$alvo_w" | grep -aEiq -e "^(sk-|gh[pousr]_|github_pat_|xox[baprs]-)?$w([-_]$w)*\$" && return 0
  done
  return 1
}

achou() {
  # achou <categoria> <regex estendida> [limite a esquerda] [limite a direita]
  # Os limites (opcionais) exigem o que vem antes e depois do valor: prefixo de
  # chave no meio de um identificador nao e chave, nem chave de tamanho fixo
  # seguida de mais caracteres. Entram na busca, nunca no valor mostrado.
  local cat="$1" re="${3:-}$2${4:-}" esq="${3:-}${4:-}" linha valor fim ph
  # Examine todos os candidatos: placeholder anterior nunca dispensa segredo posterior.
  while IFS= read -r linha; do
    [ -n "$linha" ] || continue
    while IFS= read -r valor; do
      [ -n "$valor" ] || continue
      [ -n "$esq" ] && valor="$(printf '%s' "$valor" | grep -aEo -e "$2" | head -1)"
      [ -n "$valor" ] || continue
      # Placeholder dispensa somente este candidato. Na URL, só a senha decide:
      # um `${USER}` no usuário não torna placeholder a senha real (conselhos#210, P5).
      ph="$valor"
      if [ "$cat" = "credencial em URL" ]; then ph="${valor#*://}"; ph="${ph#*:}"; ph="${ph%@}"; fi
      eh_placeholder "$ph" && continue
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

segredo_varrer() {
  ACHADOS=""
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
  # 2. Credencial em atribuição. O valor seguido de `(` é chamada de função
  # (`token: randomUUID()`), não credencial: o limite a direita o exclui...
  # O alfabeto do valor e o do limite a direita sao o mesmo, com os simbolos que
  # senha tem (`!@#$%^&*~?`): sem eles uma senha que começa com `!` passava, e com o
  # limite diferente o valor seria cortado no meio (conselhos#210, P8).
  CREDENCIAL='([Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]|[Ss][Ee][Nn][Hh][Aa]|[Ss][Ee][Cc][Rr][Ee][Tt]|[Tt][Oo][Kk][Ee][Nn]|[Aa][Pp][Ii]_?[Kk][Ee][Yy])[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9/+_.=!@#$%^&*~?-]{8,}'
  achou "credencial"          "$CREDENCIAL" '' '($|[^A-Za-z0-9/+_.=!@#$%^&*~?(-])'
  # ...salvo quando o valor tem dígito: identificador de função comum não tem
  # (`randomUUID`, `getToken`), e um valor aleatório quase sempre tem. Uma função
  # com dígito (`getToken2()`) barra — falso positivo assumido; valor sem dígito
  # seguido de `(` é o limite declarado.
  while IFS= read -r chamada; do
    [ -n "$chamada" ] || continue
    valor="${chamada%(}"; valor="${valor#*[:=]}"; valor="${valor#"${valor%%[![:space:]\'\"]*}"}"
    case "$valor" in *[0-9]*) ;; *) continue ;; esac
    eh_placeholder "$valor" && continue
    ACHADOS="${ACHADOS}  - credencial: …${valor: -4}
"
  done <<EXPX_CHAMADAS
$(printf '%s' "$ALVO" | grep -aEo -e "$CREDENCIAL\(")
EXPX_CHAMADAS
  # 3. Chave privada
  achou "chave privada"       '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  # 4. Conexão com credencial embutida
  achou "credencial em URL"   '[a-zA-Z][a-zA-Z0-9+.-]*://[^/[:space:]:]+:[^@[:space:]]{4,}@'
  # 5. Dado real de cliente — CPF/CNPJ formatado
  achou "dado real de cliente" '([0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2})'
  return 0
}
