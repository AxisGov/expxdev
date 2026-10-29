#!/usr/bin/env bash
# portao-push — o validador de push da MergeX, chamado pelo `pre-push` do Git.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13, item 7 (DM-184, DM-185). É a barreira local autoritativa contra
# erro normal: decide só com o que o Git entrega na entrada padrão, nunca com
# texto de comando de shell (um push por `cd`, `bash -c` ou link simbólico
# chega aqui igual).
#
# Uso (pelo pre-push, que repassa a entrada padrão e propaga o código):
#   portao-push.sh --pre-push <remoto> <url>
#
# Entrada padrão: o protocolo do pre-push, uma linha por ref:
#   <ref local> SP <SHA local> SP <ref remota> SP <SHA remoto>
# Cada ref é decidida por pr_decide_ref (portao-regras.sh, com <remoto>) sobre
# o SHA local DAQUELA linha, nunca sobre o HEAD do checkout. As entregas de uma
# ref refs/heads/<b> são a UNIÃO de três parcelas, que só acrescentam e nunca
# isentam (DM-185): (a) a seleção pelo conteúdo contra refs/remotes/<remoto>/HEAD,
# quando resolve para commit (push para URL não tem; nunca se adivinha main ou
# master); (b) a regra legada pelo nome (o ENTREGA.md que declara branch: <b>
# na árvore enviada, na remota anterior ou na ponta local); (c) o trailer
# Trabalho: <id> do commit enviado. Cada entrega é validada sobre o SHA
# enviado e a decisão da ref é a agregada (qualquer barra vence, depois avisa,
# depois passa). Sem a parcela (a) e com (b) e (c) vazias, uma árvore enviada
# com ENTREGA.md canônico só avisa (cobertura_indeterminada): a aplicabilidade
# não está provada, e o push segue. Qualquer ref que barra barra o push
# inteiro, mesmo depois de uma válida. Linha fora do protocolo barra.
#
# Diagnóstico em stderr, uma linha por ref que avisa ou barra; os de
# historia_incompleta (completar a história) e de erro_ambiente (falha do
# ambiente, inclusive o validador ausente) são textos distintos.
#
# MERGEX_PRE_PUSH_SINAL=<arquivo> no ambiente: o sinal da prova funcional do
# E0/E2 (ativacao-pre-push.sh --provar). Depois de decidir cada ref do
# protocolo, acrescenta ao arquivo uma linha
# `mergex-pre-push <SHA local avaliado> <passa|avisa|barra>`, sem mudar a
# decisão. Nada é escrito antes da decisão, nem para linha fora do protocolo:
# um hook que chama o validador sem repassar a entrada não deixa sinal, e a
# prova exige a linha `barra` do SHA do commit solto dela. Um hook escrito de
# propósito para forjar essa linha é contorno deliberado (a barreira é o CI,
# nos limites da spec, seção 15.1, itens 1 e 12).
#
# Códigos: 0 libera; 1 barra; 64 uso. Custo: uma seleção com processos Git
# constantes e uma validade por entrega selecionada, por ref enviada; nenhuma
# varredura de branches. Nenhuma opção de força.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

uso() {
  [ -z "${1:-}" ] || printf 'portao-push: %s\n' "$1" >&2
  printf '%s\n' 'uso: portao-push.sh --pre-push <remoto> <url>' >&2
  exit 64
}

[ "$#" -eq 3 ] || uso 'esperava --pre-push <remoto> <url>'
[ "$1" = --pre-push ] || uso "opção desconhecida: $1"
REMOTO="$2"
REMOTO_URL="$3"

diag() { printf 'mergex pre-push: %s\n' "$1" >&2; }
AMBIENTE='erro de ambiente (erro_ambiente): a validade do portão não pôde ser avaliada'

TMP_DIR=""
encerrar() {
  local rc="$1"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  exit "$rc"
}
trap 'encerrar $?' EXIT
trap 'exit 1' HUP INT TERM

# shellcheck source=portao-regras.sh
if [ ! -r "$AQUI/portao-regras.sh" ] || ! . "$AQUI/portao-regras.sh"; then
  cat >/dev/null 2>&1
  diag "$AMBIENTE: regras indisponíveis em $AQUI (${PR_ERRO:-portao-regras.sh ausente}); push barrado"
  exit 1
fi
set +e

arvore_ambiente_git
export GIT_OPTIONAL_LOCKS=0

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-push.XXXXXX")" \
  || { TMP_DIR=""; cat >/dev/null 2>&1; diag "$AMBIENTE: não foi possível criar diretório temporário; push barrado"; exit 1; }
# a entrada inteira antes de decidir: o Git não fica preso escrevendo
cat > "$TMP_DIR/entrada" || { diag "$AMBIENTE: entrada padrão ilegível; push barrado"; exit 1; }

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { diag "$AMBIENTE: fora de um repositório Git com árvore de trabalho; push barrado"; exit 1; }

# --------------------------------------------------------------------------
# Segredo no que o push publica (conselhos#210, P3; DM-279)
# --------------------------------------------------------------------------
# O PreToolUse do sem-segredo vê o commit antes de ele existir e não vê o que o
# próprio comando gera nem o commit feito por fora; o V10 do portão é instrução,
# não script. Aqui, com a MESMA tabela (segredo-tabela.sh), varre-se o que o push
# publica: a mensagem e as linhas adicionadas (contra o primeiro pai, também em
# merge: a resolução de conflito publica conteúdo) de cada commit que o remoto
# não tem, e a mensagem da tag anotada. Modo: o do `sem-segredo` em
# .expx/hooks.json, pela expx_modo do base.sh (nasce bloqueio); `desligado` não
# varre e não exige a tabela. Sem base.sh, o modo não se lê: vale bloqueio.
# Qualquer falha de leitura (tabela, rev-list, objeto, diff) em modo ativo não
# libera: barra em bloqueio, avisa em aviso. Acima de 300 commits, a varredura
# não roda e isso também barra em bloqueio — dividir a publicação ou desligar
# conscientemente; não existe varredura manual que libere o push.
SEG_LIMITE=300
SEG_MODO=bloqueio
BASE_SH="$AQUI/../../../hooks/comum/base.sh"
# shellcheck source=../../../hooks/comum/base.sh
# Numa subshell: o base.sh liga opções do shell e define funções, e nada disso deve
# vazar para o portão; só o modo volta.
if [ -r "$BASE_SH" ]; then
  SEG_MODO="$( . "$BASE_SH" 2>/dev/null && command -v expx_modo >/dev/null 2>&1 \
    && expx_modo sem-segredo bloqueio "$RAIZ")" || SEG_MODO=bloqueio
  case "$SEG_MODO" in aviso|bloqueio|desligado) ;; *) SEG_MODO=bloqueio ;; esac
fi
SEG_TABELA_OK=1
SEG_DISP_OK=0
if [ "$SEG_MODO" != desligado ]; then
  # shellcheck source=segredo-tabela.sh
  { [ -r "$AQUI/segredo-tabela.sh" ] && . "$AQUI/segredo-tabela.sh" && command -v segredo_varrer >/dev/null 2>&1; } \
    || SEG_TABELA_OK=0
  # O arquivo do framework que o lock v2 do próprio commit confere não é varrido
  # (DM-286). Sem o helper, nada é dispensado.
  # shellcheck source=segredo-dispensa.sh
  { [ -r "$AQUI/segredo-dispensa.sh" ] && . "$AQUI/segredo-dispensa.sh" \
    && command -v segredo_dispensaveis_commit >/dev/null 2>&1; } && SEG_DISP_OK=1
fi
# O saldo de bytes conferidos pela dispensa vale para o push inteiro (CodeAnt no mergex#58).
# Sem gravar o saldo, nada é dispensado.
SEG_DISP_ORCAMENTO=""
if [ "$SEG_DISP_OK" = 1 ]; then
  SEG_DISP_ORCAMENTO="$TMP_DIR/disp-orcamento"
  _disp_lim 67108864 "${EXPX_SEGREDO_DISP_MAX_PUSH:-}" > "$SEG_DISP_ORCAMENTO" 2>/dev/null || SEG_DISP_OK=0
fi
_seg_nulo() { case "$1" in *[!0]*) return 1 ;; esac; return 0; }
_seg_mais() { awk '/^diff --git / { h = 0; next } /^@@/ { h = 1; next } h && /^\+/ { print substr($0, 2) }'; }
# _seg_commit <sha> — mensagem e linhas adicionadas do commit, contra o primeiro pai
_seg_commit() {
  local c="$1" pai ps escopo=()
  git log -1 --format=%B "$c" -- 2>/dev/null || return 1
  pai="$(git rev-list --parents -n 1 "$c" 2>/dev/null)" || return 1
  pai="$(printf '%s' "$pai" | awk '{ print $2 }')"
  if [ "$SEG_DISP_OK" = 1 ]; then
    while IFS= read -r ps; do escopo+=("$ps"); done \
      < <(segredo_dispensaveis_commit "$c" "$pai" | segredo_pathspec_excluir)
    [ "${#escopo[@]}" -gt 0 ] && escopo=(":(top)" "${escopo[@]}")
  fi
  if [ -n "$pai" ]; then
    git diff --text --no-ext-diff --no-textconv --no-color -U0 "$pai" "$c" -- ${escopo[@]+"${escopo[@]}"} 2>/dev/null | _seg_mais
  else
    git diff-tree --root -p --text --no-ext-diff --no-textconv --no-color -U0 "$c" -- ${escopo[@]+"${escopo[@]}"} 2>/dev/null | _seg_mais
  fi
  [ "${PIPESTATUS[0]}" = 0 ]
}
# _seg_anunciados — "^<sha>" de cada ref (branch e tag) que o servidor anuncia e que
# existe aqui, em $TMP_DIR/anunciados; uma consulta por push. Falha: devolve 1.
SEG_ANUNC=""
_seg_anunciados() {
  if [ -z "$SEG_ANUNC" ]; then
    local brutos
    if brutos="$(git ls-remote --heads --tags "${REMOTO_URL:-$REMOTO}" 2>/dev/null)"; then
      # O que falta aqui fica contado: so entao buscar o remoto muda o intervalo.
      printf '%s\n' "$brutos" | awk 'NF { print $1 "^{commit}" }' \
        | git cat-file --batch-check='%(objectname)' > "$TMP_DIR/checados" 2>/dev/null \
        && awk '$2 != "missing" && NF == 1 { print "^" $1 }' "$TMP_DIR/checados" | sort -u > "$TMP_DIR/anunciados" \
        && awk '$2 == "missing" { n++ } END { print n + 0 }' "$TMP_DIR/checados" > "$TMP_DIR/ausentes" \
        && SEG_ANUNC=ok || SEG_ANUNC=falhou
    else
      SEG_ANUNC=falhou
    fi
  fi
  [ "$SEG_ANUNC" = ok ]
}
# segredo_da_ref <ref remota> <sha local> <sha remoto> — SEG_RES: limpo | achou | erro | grande;
# SEG_DIAG: o que dizer
segredo_da_ref() {
  local rr="$1" sl="$2" sr="$3" tipo alvo_commit lista n c curto texto_tag="" achados_ref=""
  SEG_RES=limpo; SEG_DIAG=""
  _seg_nulo "$sl" && return 0
  # `file:///dev/null` não é repositório: o push não publica nada ali (o Git
  # falha depois do hook), e não há servidor a consultar. É o destino da prova
  # funcional do E0 (ativacao-pre-push.sh), que sobe commits soltos sobre o HEAD:
  # sem isto, a consulta falharia e barraria o controle positivo — e, antes da
  # consulta, a história inteira do HEAD batia o limite num repositório maduro.
  [ "${REMOTO_URL:-}" = file:///dev/null ] && return 0
  [ "$SEG_TABELA_OK" = 1 ] || { SEG_RES=erro; SEG_DIAG="a tabela de segredo (segredo-tabela.sh) não está disponível ao lado do portão"; return 0; }
  tipo="$(git cat-file -t "$sl" 2>/dev/null)" || { SEG_RES=erro; SEG_DIAG="o objeto $sl não se lê"; return 0; }
  case "$tipo" in
    commit) alvo_commit="$sl" ;;
    tag)
      # Toda a cadeia de tags anotadas é publicada: a mensagem de cada uma entra,
      # não só a da externa (tag que aponta para tag). Profundidade limitada.
      local obj="$sl" passo=0 corpo_tag
      while [ "$(git cat-file -t "$obj" 2>/dev/null)" = tag ]; do
        passo=$((passo + 1))
        [ "$passo" -le 10 ] || { SEG_RES=erro; SEG_DIAG="cadeia de tags anotadas longa demais a partir de $sl"; return 0; }
        corpo_tag="$(git cat-file tag "$obj" 2>/dev/null)" || { SEG_RES=erro; SEG_DIAG="a tag $obj não se lê"; return 0; }
        texto_tag="$texto_tag
$corpo_tag"
        obj="$(printf '%s\n' "$corpo_tag" | sed -n 's/^object //p' | head -1)"
        [ -n "$obj" ] || { SEG_RES=erro; SEG_DIAG="a tag $sl tem um elo sem objeto"; return 0; }
      done
      alvo_commit="$(git rev-parse --verify --quiet "$sl^{commit}")" \
        || { SEG_RES=erro; SEG_DIAG="a tag $sl não aponta para um commit (objeto não suportado na varredura)"; return 0; } ;;
    *) SEG_RES=erro; SEG_DIAG="objeto $tipo ($sl) não suportado na varredura"; return 0 ;;
  esac
  # O que o servidor já tem, e não entra: o SHA remoto do protocolo, quando há um
  # e ele existe aqui. As refs de rastreio (`refs/remotes/<remoto>`) não contam:
  # são cache local, podem estar velhas ou vir de outra URL, e esconderiam commit
  # que o servidor atual não tem (CodeAnt no mergex#54). Na branch nova (SHA remoto
  # zero), ou com um SHA remoto que não existe aqui, vale o que o servidor anuncia
  # agora (`ls-remote` na URL do push), filtrado pelo que existe aqui. Consulta
  # que falha não libera. Nada anunciado aqui: toda a ancestralidade é varrida.
  : > "$TMP_DIR/excluir"
  local busca=""
  if ! _seg_nulo "$sr" && git cat-file -e "$sr^{commit}" 2>/dev/null; then
    printf '^%s\n' "$sr" > "$TMP_DIR/excluir"
  else
    _seg_anunciados || { SEG_RES=erro; SEG_DIAG="a consulta ao servidor das refs que ele já tem (ls-remote) falhou: sem ela, o intervalo publicado não se delimita"; return 0; }
    cat "$TMP_DIR/anunciados" > "$TMP_DIR/excluir"
    # Num clone defasado, o que o servidor tem e falta aqui não delimita nada: dividir o
    # push não muda a conta, buscar muda (katosmv/login#34). Só quando falta algo: com
    # tudo aqui, buscar não muda nada (CodeAnt no mergex#56).
    # Push direto para uma URL: o Git a passa como nome do remoto, e ela pode trazer
    # credencial — o diagnóstico só repete um nome de remoto, nunca uma URL.
    [ "$(cat "$TMP_DIR/ausentes" 2>/dev/null || echo 0)" -gt 0 ] 2>/dev/null && case "$REMOTO" in
      *[!A-Za-z0-9._-]*|'') busca="busque o remoto antes (git fetch pelo nome do remote; o que o servidor já tem e ainda não está aqui não delimita o intervalo); se continuar, " ;;
      *) busca="rode git fetch $REMOTO antes (o que o servidor já tem e ainda não está aqui não delimita o intervalo); se continuar, " ;;
    esac
  fi
  lista="$(git rev-list --stdin "$alvo_commit" < "$TMP_DIR/excluir" 2>/dev/null)" || { SEG_RES=erro; SEG_DIAG="o intervalo publicado não se lê (rev-list)"; return 0; }
  n="$(printf '%s' "$lista" | grep -c .)"
  if [ "$n" -gt "$SEG_LIMITE" ]; then
    SEG_RES=grande
    SEG_DIAG="intervalo grande demais para varrer segredo ($n commits, limite $SEG_LIMITE): ${busca}divida a publicação em pushes menores ou, conscientemente, ponha sem-segredo em desligado"
    return 0
  fi
  # Uma varredura do intervalo inteiro; só com achado, commit a commit, para dizer onde.
  # Cada commit é lido no Git uma vez por push e guardado por SHA (que não muda): a
  # segunda fase e as outras refs do mesmo push leem dali (A4 no conselhos#211).
  mkdir -p "$TMP_DIR/seg-commit" || { SEG_RES=erro; SEG_DIAG="o cache dos commits não se cria"; return 0; }
  ALVO="$texto_tag"
  for c in $lista; do
    if [ ! -f "$TMP_DIR/seg-commit/$c" ]; then
      _seg_commit "$c" > "$TMP_DIR/seg-commit/$c.parcial" \
        && mv "$TMP_DIR/seg-commit/$c.parcial" "$TMP_DIR/seg-commit/$c" \
        || { SEG_RES=erro; SEG_DIAG="o commit $c não se lê ou não se guarda no diretório temporário (${TMPDIR:-/tmp} cheio?)"; return 0; }
    fi
    texto="$(cat "$TMP_DIR/seg-commit/$c")" || { SEG_RES=erro; SEG_DIAG="o commit $c não se lê"; return 0; }
    ALVO="$ALVO
$texto"
  done
  segredo_varrer
  [ -n "$ACHADOS" ] || return 0
  if [ -n "$texto_tag" ]; then
    ALVO="$texto_tag"; segredo_varrer
    [ -z "$ACHADOS" ] || achados_ref="${achados_ref}  na tag ${sl:0:12}:
$ACHADOS"
  fi
  for c in $lista; do
    ALVO="$(cat "$TMP_DIR/seg-commit/$c")"; segredo_varrer
    curto="${c:0:12}"
    [ -z "$ACHADOS" ] || achados_ref="${achados_ref}  no commit ${curto}:
$ACHADOS"
  done
  SEG_RES=achou
  SEG_DIAG="segredo no que o push publica (valores mascarados):
${achados_ref}  Segredo publicado não sai por reverter o commit: reescreva o intervalo local e rotacione a credencial"
}

BARRA=0
while IFS=' ' read -r ref_local sha_local ref_remota sha_remoto resto <&3; do
  [ -n "$ref_local$sha_local$ref_remota$sha_remoto$resto" ] || continue
  if [ -n "$resto" ] || [ -z "$sha_remoto" ] \
    || printf '%s\n%s\n' "$sha_local" "$sha_remoto" | grep -Evqx '[0-9a-f]{40}|[0-9a-f]{64}'; then
    diag "linha fora do protocolo pre-push para $REMOTO: '$ref_local $sha_local $ref_remota $sha_remoto${resto:+ $resto}'; push barrado"
    BARRA=1; continue
  fi
  : > "$TMP_DIR/decisao"
  pr_decide_ref "$RAIZ" "$ref_local" "$sha_local" "$ref_remota" "$sha_remoto" "$REMOTO" > "$TMP_DIR/decisao" # guarda:PPSHA
  decisao="$(sed -n 's/^decisao=//p' "$TMP_DIR/decisao")"
  # a varredura de segredo entra na decisão da ref antes do sinal (DM-279)
  if [ "$SEG_MODO" != desligado ]; then
    segredo_da_ref "$ref_remota" "$sha_local" "$sha_remoto"
    if [ "$SEG_RES" != limpo ]; then
      if [ "$SEG_MODO" = aviso ]; then
        diag "$ref_remota: sem-segredo (aviso, o push segue): $SEG_DIAG"
        [ "$decisao" != passa ] || { decisao=avisa; PR_DIAG="segredo no que o push publica (aviso, ver acima)"; }
      else
        diag "$ref_remota: sem-segredo: $SEG_DIAG; push barrado"
        decisao=barra; PR_DIAG="${PR_DIAG:-segredo no que o push publica}"
      fi
    fi
  fi
  case "$decisao" in
    passa) ;;
    avisa) diag "$ref_remota: $PR_DIAG" ;;
    *) diag "$ref_remota: ${PR_DIAG:-$AMBIENTE: decisão indeterminada}" ;;
  esac
  [ "$decisao" = passa ] || [ "$decisao" = avisa ] || BARRA=1 # guarda:PPMULTI
  # o sinal da prova funcional: só depois da decisão, amarrado ao SHA avaliado
  if [ -n "${MERGEX_PRE_PUSH_SINAL:-}" ]; then
    case "$decisao" in passa|avisa) ;; *) decisao=barra ;; esac
    printf 'mergex-pre-push %s %s\n' "$sha_local" "$decisao" >> "$MERGEX_PRE_PUSH_SINAL" 2>/dev/null || true
  fi
done 3< "$TMP_DIR/entrada"

[ "$BARRA" = 0 ] || diag "push barrado: uma ref inválida barra o push inteiro"
exit "$BARRA"
