#!/usr/bin/env bash
# expx-integridade-final.sh — SubagentStart/SubagentStop do nucleo. O nivel
# `integridade_final` da separacao de papeis (CONTRATO-expx-orquestracao §12).
#
# No inicio de um agente de aprovacao, fotografa a arvore de trabalho; no fim,
# fotografa de novo, compara e grava `integridade_final_verificada`. Diferenca ou
# foto que falta invalidam o veredito daquele agente. E o nivel FRACO: so prova
# que o estado final e igual ao inicial — nao pega editar e reverter, nem arquivo
# ignorado alterado. Sozinho, nunca sustenta o papel.
#
# A foto tem tres partes, comparadas byte a byte:
#   head    — `git rev-parse HEAD^{commit}`;
#   status  — os bytes de `git status --porcelain -z --untracked-files=all`;
#   arvore  — o tree id da arvore inteira (rastreado e nao rastreado nao
#             ignorado), montado num indice TEMPORARIO copiado do real. O `git
#             diff HEAD` nao ve o conteudo de arquivo nao rastreado, e editar o
#             arquivo novo que o implementador ainda nao adicionou e o caso comum
#             de revisao. O indice real nunca e tocado.
#
# A foto mora no git-dir da worktree (`git rev-parse --git-path`), nunca na
# arvore: escrever ali mudaria justamente o que se mede. Um diretorio por sessao
# e por instancia (`agent_id`), com nomes que sao hash — id do payload nunca vira
# caminho. O fim sempre remove o diretorio da instancia, inclusive divergente.
#
# O agente de aprovacao e o de papel `revisar` ou `testar` na projecao dos
# papeis (.expx/papeis.tsv, CONTRATO-expx-orquestracao §12.2), que o `init` grava
# com ou sem politica; a `ferramenta` do evento e a skill da mesma linha. Nada vem
# do nome. Fora disso o hook sai sem rodar git.
#
# Falha aberta: sai sempre 0 e nunca imprime. O que falha vira `ausente`, e
# ausente invalida — nunca vira `igual`.
set -u

ENTRADA="$(cat)"

DIR_HOOK="$(dirname "${BASH_SOURCE[0]}")"
[ -f "$DIR_HOOK/expx-rastro.sh" ] || exit 0
# shellcheck source=./expx-rastro.sh
. "$DIR_HOOK/expx-rastro.sh"

EVENTO="$(expx_json_get "$ENTRADA" hook_event_name)"
case "$EVENTO" in
  SubagentStart|SubagentStop) ;;
  *) exit 0 ;;
esac

# Um unico prefixo `expx:` literal, e o nome exato. Substring, outro prefixo ou
# nome parecido nao casam com a linha da projecao.
AGENTE="$(expx_json_get "$ENTRADA" agent_type)"
case "$AGENTE" in
  expx:*) AGENTE="${AGENTE#expx:}" ;;
esac
CWD="$(expx_json_get "$ENTRADA" cwd)"
[ -n "$CWD" ] || CWD="$PWD"
# ha_foto_pendente <raiz> — ha alguma foto de inicio no git-dir, achado sem rodar
# git (`.git` pasta, ou arquivo `gitdir:` de worktree)
ha_foto_pendente() {
  local gd="$1/.git" linha=""
  if [ -f "$gd" ]; then
    IFS= read -r linha < "$gd" || true
    gd="${linha#gitdir: }"
    case "$gd" in /*|[A-Za-z]:[\\/]*) ;; *) gd="$1/$gd" ;; esac
  fi
  [ -d "$gd/expx/integridade-final/v1" ] && [ -n "$(ls -A "$gd/expx/integridade-final/v1" 2>/dev/null)" ]
}

# A raiz pela procura do `.git`, sem rodar git: quem nao e de aprovacao sai aqui.
# No fim, a foto de um inicio em que ele ERA de aprovacao (a projecao mudou no
# meio) ainda precisa ser comparada e removida: so entao o git roda.
RAIZ_SEM_GIT="$(expx_raiz "$CWD")"
SKILL_PAPEL="$(expx_papel_de "$RAIZ_SEM_GIT" "$AGENTE")"
case "$SKILL_PAPEL" in
  *$'\t'revisar|*$'\t'testar) APROVADOR=1 ;;
  *) APROVADOR=""; SKILL_PAPEL="" ;;
esac
if [ -z "$APROVADOR" ]; then
  [ "$EVENTO" = SubagentStop ] && ha_foto_pendente "$RAIZ_SEM_GIT" || exit 0
fi

AGENT_ID="$(expx_json_get "$ENTRADA" agent_id)"
SESSAO="$(expx_json_get "$ENTRADA" session_id)"

# Variaveis locais do Git herdadas do ambiente (GIT_DIR, GIT_WORK_TREE,
# GIT_INDEX_FILE...) apontariam a foto para outro repositorio, e o fim daria
# `igual` com a worktree do payload alterada. A lista vem do proprio git; a fixa
# cobre o git que nao responde. A configuracao passada pelo ambiente
# (`GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`/`_KEY_n`/`_VALUE_n`)
# fica: ela nao escolhe repositorio, e sem ela a foto ignoraria `safe.directory`,
# `core.excludesFile` ou filtro que o projeto depende.
for v in $(git rev-parse --local-env-vars 2>/dev/null) GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE \
  GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_NAMESPACE GIT_PREFIX; do
  case "$v" in
    GIT_CONFIG*) ;;
    *) unset "$v" ;;
  esac
done
# O status e a foto nao podem refrescar o indice real.
export GIT_OPTIONAL_LOCKS=0

RAIZ="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null)" || RAIZ=""

# caminho_git <relativo> — `git rev-parse --git-path`, absoluto. Sem o
# `--path-format=absolute`, que so existe a partir do git 2.31: o relativo que o
# git devolve e relativo ao `-C`, a raiz.
caminho_git() {
  local p
  p="$(git -C "$RAIZ" rev-parse --git-path "$1" 2>/dev/null)" || return 1
  [ -n "$p" ] || return 1
  case "$p" in
    /*|[A-Za-z]:[\\/]*) ;;
    *) p="$RAIZ/$p" ;;
  esac
  printf '%s' "$p"
}

# grava <estado> <diferencas, separadas por espaco>
grava() {
  local estado="$1" lista="" d resultado=falha
  for d in $2; do lista="$lista${lista:+,}\"$d\""; done
  [ "$estado" = igual ] && resultado=ok
  local raiz="$RAIZ"
  [ -n "$raiz" ] || raiz="$(expx_raiz "$CWD")"
  # A mesma conta do fechamento da invocacao (expx-invocacao.mjs): o `agent_id` sozinho
  # pode repetir entre sessoes, e ligaria a integridade a invocacao errada.
  local inst="" ext=""
  [ -n "$AGENT_ID" ] && inst="$(printf '%s\n%s' "$SESSAO" "$AGENT_ID" | git -C "$raiz" hash-object --stdin 2>/dev/null)"
  [ -n "$inst" ] && ext=",\"instancia\":\"$inst\""
  # o papel do inicio, guardado com a foto: a projecao e o estado presente (F5)
  ext="$ext,\"papel\":\"$PAPEL\""
  EXPX_AGENTE="$AGENTE" expx_rastro_grava "$raiz" integridade_final_verificada hook "$resultado" \
    "integridade final de $AGENTE: $estado${2:+ ($2)}" '[]' \
    "\"integridade_final\":{\"estado\":\"$estado\",\"diferencas\":[$lista]}$ext"
}

# hash <texto> — o nome de diretorio de um id do payload
hash_id() { printf '%s' "$1" | git hash-object --stdin 2>/dev/null; }

# foto <dir> — head, status.z e arvore em <dir>; 1 se alguma parte falhou
foto() {
  local d="$1" idx
  git -C "$RAIZ" rev-parse -q --verify 'HEAD^{commit}' > "$d/head" 2>/dev/null || return 1
  git -C "$RAIZ" status --porcelain -z --untracked-files=all > "$d/status.z" 2>/dev/null || return 1
  idx="$(caminho_git index)" || return 1
  rm -f "$d/indice" "$d/indice.lock"
  if [ -f "$idx" ]; then cp "$idx" "$d/indice" 2>/dev/null || return 1; fi
  # A copia leva os bits `assume-unchanged` e `skip-worktree` do indice real, e
  # com eles o `git add` nao le o arquivo: a edicao escondida do status passaria
  # como `igual`. Limpos so na copia, um bit por vez: numa chamada so, o
  # `update-index` aplica apenas uma das duas opcoes. O `skip-worktree` sai so de
  # quem esta no disco: num sparse checkout, o que ficou fora do cone continua
  # marcado e fora da foto, e o `add` roda com o sparse desligado na copia — ha
  # versoes do git que recusam o `add -A` com entrada fora da definicao.
  GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" ls-files -z 2>/dev/null \
    | GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" update-index -z --no-assume-unchanged --stdin >/dev/null 2>&1 \
    || return 1
  local f
  GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" ls-files -z 2>/dev/null \
    | while IFS= read -r -d '' f; do
        if [ -e "$RAIZ/$f" ] || [ -L "$RAIZ/$f" ]; then printf '%s\0' "$f"; fi
      done \
    | GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" update-index -z --no-skip-worktree --stdin >/dev/null 2>&1 \
    || return 1
  GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" -c core.fsmonitor=false -c core.sparseCheckout=false -c index.sparse=false \
    add -A -- . >/dev/null 2>&1 || return 1
  GIT_INDEX_FILE="$d/indice" git -C "$RAIZ" write-tree > "$d/arvore" 2>/dev/null || return 1
  rm -f "$d/indice" "$d/indice.lock"
  return 0
}

INSTANCIA=""
if [ -n "$RAIZ" ] && [ -n "$AGENT_ID" ]; then
  BASE="$(caminho_git expx/integridade-final/v1)" || BASE=""
  HS="$(hash_id "$SESSAO")"
  HA="$(hash_id "$AGENT_ID")"
  [ -n "$BASE" ] && [ -n "$HS" ] && [ -n "$HA" ] && INSTANCIA="$BASE/$HS/$HA"
fi

umask 077

if [ "$EVENTO" = SubagentStart ]; then
  [ -n "$INSTANCIA" ] || exit 0
  rm -rf "$INSTANCIA" 2>/dev/null
  mkdir -p "$INSTANCIA" 2>/dev/null || exit 0
  # foto incompleta nao fica: o fim a le como ausente. O papel e a skill do inicio
  # ficam com ela: o fim vale por eles, mesmo se a projecao mudar no meio
  { foto "$INSTANCIA" && printf '%s\n' "$SKILL_PAPEL" > "$INSTANCIA/papel"; } || rm -rf "$INSTANCIA" 2>/dev/null
  exit 0
fi

# SubagentStop: o papel guardado no inicio vence o da projecao de agora. Sem ele
# (inicio de antes da F4), vale a projecao; e quem nao era nem e de aprovacao sai.
if [ -n "$INSTANCIA" ] && [ -f "$INSTANCIA/papel" ]; then
  IFS= read -r GUARDADO < "$INSTANCIA/papel" || GUARDADO=""
  case "$GUARDADO" in
    sprintx$'\t'*|runx$'\t'*|mergex$'\t'*|legadox$'\t'*|stackx$'\t'*|memox$'\t'*|prodx$'\t'*|buildx$'\t'*|designx$'\t'*)
      case "$GUARDADO" in *$'\t'revisar|*$'\t'testar) SKILL_PAPEL="$GUARDADO" ;; esac ;;
  esac
fi
[ -n "$SKILL_PAPEL" ] || exit 0
PAPEL="${SKILL_PAPEL#*$'\t'}"
EXPX_FERRAMENTA="${SKILL_PAPEL%%$'\t'*}"

# SubagentStop
if [ -z "$INSTANCIA" ] || [ ! -f "$INSTANCIA/head" ] || [ ! -f "$INSTANCIA/status.z" ] || [ ! -f "$INSTANCIA/arvore" ]; then
  [ -n "$INSTANCIA" ] && rm -rf "$INSTANCIA" 2>/dev/null
  [ -n "$INSTANCIA" ] && rmdir "${INSTANCIA%/*}" 2>/dev/null
  grava ausente ""
  exit 0
fi

mkdir -p "$INSTANCIA/fim" 2>/dev/null
if ! foto "$INSTANCIA/fim"; then
  rm -rf "$INSTANCIA" 2>/dev/null
  rmdir "${INSTANCIA%/*}" 2>/dev/null
  grava ausente ""
  exit 0
fi

DIFERENCAS=""
cmp -s "$INSTANCIA/head" "$INSTANCIA/fim/head" || DIFERENCAS="$DIFERENCAS head"
cmp -s "$INSTANCIA/status.z" "$INSTANCIA/fim/status.z" || DIFERENCAS="$DIFERENCAS status"
cmp -s "$INSTANCIA/arvore" "$INSTANCIA/fim/arvore" || DIFERENCAS="$DIFERENCAS arvore"
DIFERENCAS="${DIFERENCAS# }"

rm -rf "$INSTANCIA" 2>/dev/null
rmdir "${INSTANCIA%/*}" 2>/dev/null

if [ -z "$DIFERENCAS" ]; then grava igual ""; else grava divergente "$DIFERENCAS"; fi
exit 0
