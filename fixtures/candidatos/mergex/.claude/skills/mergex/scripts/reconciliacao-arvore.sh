#!/usr/bin/env bash
# reconciliacao-arvore — o que reconciliacao-base.sh e portao-v9.sh leem do Git
# do mesmo jeito: o ambiente Git fixo, a árvore da pasta do trabalho num commit
# e a presença de uma chave de topo. Biblioteca: é carregada com `.` e não
# executa nada sozinha. Exige catalogo-de-metodo.sh já carregado
# (catalogo_pasta_do_trabalho).
#
# Funções:
#   arvore_ambiente_git
#       Fixa o ambiente Git do processo (e dos filhos): caminho exatamente como
#       no Git (sem quotepath, pathspec literal); diff.ignoreSubmodules=none,
#       que só neutraliza o diff.ignoreSubmodules do repositório — NÃO vence o
#       `ignore` do .gitmodules: só a flag --ignore-submodules=none mostra o
#       gitlink, e todo diff de conjunto ou prova a passa; mensagens de commit
#       sempre em UTF-8 (i18n.logOutputEncoding, que senão herda o
#       i18n.commitEncoding local e esconde um trailer do --grep); pais e
#       objetos só do Git (sem refs/replace, .git/info/grafts, commit-graph
#       local nem GIT_SHALLOW_FILE).
#   arvore_recusa_raso
#       rc 1 (ARVORE_ERRO) num repositório raso; chamada logo depois do cd
#       para a raiz, antes de qualquer prova.
#   _entrega_chave_qualquer <arquivo> <chave>
#       A chave de topo aparece no frontmatter em qualquer forma (entre aspas,
#       espaço antes dos dois-pontos): presença que não se lê com segurança
#       nunca vira ausência.
#   arvore_materializa <commit> <dir> <origem> <trabalho> <rótulo> <prefixo>
#       A árvore do commit materializada em <dir>, só no necessário para
#       resolver a pasta do trabalho e ler o plano: as três pastas candidatas
#       (docs/sprintx/features/<t>, docs/<t>, docs/manutencao/<t>), blob por
#       blob. Caminho com caractere de controle, componente vazio, `.` ou `..`,
#       link simbólico ou submódulo: o plano não é lido. Sucesso: ARVORE_RAIZ
#       (físico) e ARVORE_PASTA (resolvida no commit). Falha: rc 1 e
#       ARVORE_RC (1 ambiente, 4 prova, 5 árvore inválida), ARVORE_COD
#       (ambiente | prova | arvore) e ARVORE_ERRO; <rótulo> nomeia o commit
#       nas mensagens (M, HEAD) e <prefixo> antecede as de ARVORE_RC 4.
#       Escreve <dir>.lista e <dir>.pasta ao lado de <dir>. Chame SEM subshell.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

ARVORE_RC=0
ARVORE_COD=""
ARVORE_ERRO=""
ARVORE_RAIZ=""
ARVORE_PASTA=""

arvore_ambiente_git() {
  unset GIT_GLOB_PATHSPECS GIT_ICASE_PATHSPECS GIT_NOGLOB_PATHSPECS
  export GIT_LITERAL_PATHSPECS=1
  # (advice.graftFileDeprecated: o GIT_GRAFT_FILE abaixo não polui o stderr;
  # core.commitGraph=false: os pais vêm dos objetos, não de um commit-graph local;
  # diff.ignoreSubmodules=none: neutraliza a do repositório, não a do
  # .gitmodules (para esta, a flag --ignore-submodules=none em cada diff);
  # i18n.logOutputEncoding=UTF-8: o --grep de trailer vê a mensagem em UTF-8)
  export GIT_CONFIG_COUNT=5 GIT_CONFIG_KEY_0=core.quotepath GIT_CONFIG_VALUE_0=false \
    GIT_CONFIG_KEY_1=advice.graftFileDeprecated GIT_CONFIG_VALUE_1=false \
    GIT_CONFIG_KEY_2=core.commitGraph GIT_CONFIG_VALUE_2=false
  export GIT_CONFIG_KEY_3=diff.ignoreSubmodules GIT_CONFIG_VALUE_3=none # guarda:SUB
  export GIT_CONFIG_KEY_4=i18n.logOutputEncoding GIT_CONFIG_VALUE_4=UTF-8 # guarda:ENC
  # Ancestralidade e objetos só do Git, nunca de enxertos locais: refs/replace e
  # .git/info/grafts falsificariam os pais. Exportado, para que os filhos herdem.
  export GIT_NO_REPLACE_OBJECTS=1 GIT_GRAFT_FILE=/dev/null # guarda:EST
  # O raso que vale é o do repositório, nunca um GIT_SHALLOW_FILE do ambiente
  # (que cortaria a história sem deixar .git/shallow).
  unset GIT_SHALLOW_FILE # guarda:EST
}

# arvore_recusa_raso — rc 0 com a história completa; rc 1 (ARVORE_ERRO) num
# repositório raso: `--is-shallow-repository` diferente de false, ou um
# arquivo `shallow` no diretório Git ou no comum (worktree vinculada). A
# história cortada esconde commits (e versões do ENTREGA.md): nada se prova.
# Clone raso legítimo falha fechado: `git fetch --unshallow`.
arvore_recusa_raso() {
  local gd gc
  ARVORE_ERRO="repositório raso: história incompleta"
  [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = false ] || return 1 # guarda:EST
  gd="$(git rev-parse --git-dir 2>/dev/null)" || return 1
  gc="$(git rev-parse --git-common-dir 2>/dev/null)" || return 1
  for gd in "$gd/shallow" "$gc/shallow"; do
    { [ -e "$gd" ] || [ -L "$gd" ]; } && return 1 # guarda:EST
  done
  ARVORE_ERRO=""
  return 0
}

_entrega_chave_qualquer() {
  awk -v c="$2" '
    NR == 1 { next }
    /^---[ \t]*\r?$/ { exit }
    {
      l = $0; sub(/\r$/, "", l); q = ""
      if (l ~ /^["\047]/) { q = substr(l, 1, 1); l = substr(l, 2) }
      if (index(l, c) != 1) next
      r = substr(l, length(c) + 1)
      if (q != "" && substr(r, 1, 1) == q) r = substr(r, 2)
      if (r ~ /^[ \t]*:/) { achou = 1; exit }
    }
    END { exit !achou }
  ' "$1"
}

_arvore_falha() { ARVORE_RC="$1"; ARVORE_COD="$2"; ARVORE_ERRO="$3"; }

arvore_materializa() {
  local m="$1" dir="$2" origem="$3" trabalho="$4" rot="$5" p3="$6" raiz item modo caminho destino nl tab
  nl='
'
  tab='	'
  ARVORE_RC=0; ARVORE_COD=""; ARVORE_ERRO=""; ARVORE_RAIZ=""; ARVORE_PASTA=""
  mkdir -p "$dir" 2>/dev/null || { _arvore_falha 1 ambiente "não foi possível criar a árvore temporária de $rot"; return 1; }
  # caminho absoluto físico: é o prefixo que todo destino da materialização tem
  raiz="$(cd "$dir" && pwd -P)" || { _arvore_falha 1 ambiente "árvore temporária de $rot inacessível"; return 1; }
  git -c core.quotepath=false ls-tree -r -z --full-tree "$m" -- "docs/sprintx/features/$trabalho" "docs/$trabalho" "docs/manutencao/$trabalho" \
    > "$raiz.lista" 2>/dev/null || { _arvore_falha 4 prova "${p3}árvore de $rot ilegível"; return 1; }
  while IFS= read -r -d '' item <&3; do
    modo="${item%% *}"; caminho="${item#*	}"
    # a união separa os tasks.md por linha: um nome com quebra de linha (ou
    # outro caractere de controle) desviaria a leitura para o disco
    case "$caminho" in *"$nl"*|*"$tab"*|*[[:cntrl:]]*) _arvore_falha 5 arvore "pasta do trabalho em $rot com caminho inválido: $(printf '%s' "$caminho" | tr '[:cntrl:]' '?')"; return 1 ;; esac # guarda:P3
    # componente vazio, `.` ou `..` (árvore forjada com git mktree) escreveria
    # fora da árvore temporária: recusado antes de qualquer escrita
    case "/$caminho/" in */./*|*/../*|*//*) _arvore_falha 5 arvore "pasta do trabalho em $rot com caminho inválido (componente vazio, . ou ..): $caminho"; return 1 ;; esac # guarda:P3
    case "$modo" in
      100644|100755) ;;
      *) _arvore_falha 5 arvore "pasta do trabalho em $rot tem link simbólico ou submódulo (modo $modo): $caminho"; return 1 ;; # guarda:P3
    esac
    mkdir -p "$raiz/$(dirname "$caminho")" 2>/dev/null || { _arvore_falha 4 prova "${p3}não foi possível materializar $caminho de $rot"; return 1; }
    destino="$(cd "$raiz/$(dirname "$caminho")" && pwd -P)" || { _arvore_falha 4 prova "${p3}não foi possível materializar $caminho de $rot"; return 1; }
    # defesa em profundidade: o diretório de destino, resolvido, fica dentro do temporário
    case "$destino/" in "$raiz"/*) ;; *) _arvore_falha 5 arvore "pasta do trabalho em $rot: destino fora da árvore temporária: $caminho"; return 1 ;; esac # guarda:P3
    git -c core.quotepath=false cat-file blob "$m:$caminho" > "$destino/${caminho##*/}" 2>/dev/null \
      || { _arvore_falha 4 prova "${p3}não foi possível ler $caminho de $rot"; return 1; }
  done 3< "$raiz.lista"
  # Sem subshell: o CATALOGO_ERRO da função chega à mensagem.
  catalogo_pasta_do_trabalho "$raiz" "$origem" "$trabalho" > "$raiz.pasta" \
    || { _arvore_falha 4 prova "${p3}pasta do trabalho não determinável em $rot: $CATALOGO_ERRO"; return 1; }
  ARVORE_PASTA="$(cat "$raiz.pasta")"
  ARVORE_RAIZ="$raiz"
}
