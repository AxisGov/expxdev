#!/usr/bin/env bash
# portao-regras — a regra única da barreira de push (DM-184, DM-185).
# Biblioteca: é carregada com `.` e não executa nada sozinha.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seção 13, itens 5 a 8. As três camadas da barreira (o pre-push do Git, o hook
# do Claude `pr-so-com-portao` e o CI) decidem por estas funções: a mesma
# validade (validade-do-portao.sh --rev), o mesmo modo de `portao: null` e a
# mesma falha fechada por entrega selecionada. A SELEÇÃO das entregas difere
# por desenho (DM-185): o CI seleciona pelo conteúdo do PR; o pre-push, por um
# superconjunto local (conteúdo contra refs/remotes/<remoto>/HEAD, o nome e o
# trailer Trabalho:); o hook do Claude continua pelo nome, consultivo. O nome
# da branch nunca seleciona nem isenta no CI e no pre-push. Decidem só pelo
# que o Git entrega (refs, SHAs, árvores, commits); nada aqui lê texto de
# comando de shell. Nenhuma opção de força.
#
# Quem carrega fixa antes o ambiente Git (arvore_ambiente_git, de
# reconciliacao-arvore.sh, que esta biblioteca também carrega).
#
# Funções (rc 0 ou 1; em falha, PR_ERRO descreve o motivo):
#
#   pr_modo_null <raiz>
#       Imprime bloqueio|aviso|desligado: o modo de `pr-so-com-portao` em
#       <raiz>/.expx/hooks.json (`.hooks["pr-so-com-portao"].modo`; a forma
#       antiga `.modos["pr-so-com-portao"]` também, como em expx_modo). Sem o
#       arquivo, ou sem a chave (ou com ela `null`): aviso, o padrão do
#       repositório. Falha fechada: arquivo presente que não se lê, jq ausente,
#       JSON inválido ou vazio, ou modo fora de bloqueio|aviso|desligado (texto
#       desconhecido, número, booleano, objeto) imprime bloqueio e rc 1.
#
#   pr_entregas_do_intervalo <raiz> <base> <sha>
#       A seleção pelo conteúdo (spec 13.5). Imprime, um por linha, ordenados e
#       sem repetição, os docs/entregas/<id>/ENTREGA.md que são a união de:
#         (a) os com qualquer status (A, M, D, T) em
#             `git diff-tree -r --no-renames -z MB <sha>`; e
#         (b) os tocados por algum commit não-merge de
#             `git log --full-history --no-merges --no-renames -z MB..<sha>`.
#       MB é o merge-base de <base> e <sha> (`git merge-base --all`): mais de
#       um é rc 1 com PR_SEL_MOTIVO=base_ambigua. Sem merge-base: em clone
#       completo a base é a árvore vazia do formato de hash do repositório
#       (`git hash-object -t tree /dev/null`), o que seleciona toda a história
#       de <sha>; em clone raso, historia_incompleta. Só o caminho canônico
#       conta (docs/entregas/<id>/ENTREGA.md, <id> sem `/`); a leitura é
#       NUL-safe; caminho com caractere de controle sob docs/entregas é rc 1
#       com caminho_com_controle (PR_CTRL=1). <base> ou <sha> que não é commit
#       aqui, ou objeto que falta no meio, é historia_incompleta (PR_FALTA=1);
#       falha do ambiente é erro_ambiente. Merges ficam fora de (b) para que o
#       merge de integração da base não selecione entregas de outros
#       trabalhos; o que o próprio merge altera aparece em (a). Custo: um
#       número constante de processos Git, qualquer que seja o número de
#       entregas ou de commits.
#
#   pr_decide_entrega <raiz> <sha> <entrega>
#       Decide UMA entrega para o SHA: validade-do-portao.sh --verificar
#       --entrega <entrega> --rev <sha> (o SHA enviado ou o da cabeça do PR,
#       nunca o HEAD do checkout). Imprime decisao=, motivo= e entrega=, deixa
#       PR_DIAG, PR_DEC e PR_MOT; rc 1 quando barra.
#           ok=true: passa, portao_valido;
#           portao: null (o ENTREGA.md do SHA é arquivo regular, kind:
#             entrega, trabalho_id do caminho, expx_tool sprintx|runx e
#             `portao: null`): segue pr_modo_null — bloqueio barra, aviso
#             avisa, desligado passa (motivo portao_null);
#           todo o resto barra, em qualquer modo, com o motivo da validade:
#             pronto vencido, ausente (inclusive a entrega selecionada que não
#             existe no SHA: portao_nao_pronto), inconsistente ou ilegível,
#             historia_incompleta, erro_ambiente (inclusive o validador
#             ausente ou saída inesperada).
#
#   pr_decide_entregas <raiz> <sha> [entrega...]
#       Decide uma lista de entregas para o SHA. Imprime, por entrega,
#       entrega[<i>]=, decisao[<i>]= e motivo[<i>]= (<i> a partir de 1) e, uma
#       única vez no fim, o resumo decisao=, motivo=, entrega= (o caminho com
#       uma entrega; `-` com nenhuma ou mais de uma) e quantidade_entregas=.
#       Agregação: qualquer barra vence; depois avisa; depois passa. O motivo
#       do resumo é o da primeira entrega que barra, senão o da que decide.
#       Lista vazia: passa, ref_nao_aplicavel. PR_DIAG reúne os diagnósticos
#       das entregas que avisam ou barram; rc 1 quando o resumo barra.
#
#   pr_entrega_da_ref <raiz> <ref_remota> <sha_local> <sha_remoto>
#       A regra legada pelo nome. Imprime o caminho do
#       docs/entregas/<id>/ENTREGA.md (arquivo regular) que declara
#       `branch: <b>` para a ref refs/heads/<b>, lido das árvores do SHA
#       enviado, do SHA remoto anterior (quando o objeto existe aqui) e da
#       ponta local de refs/heads/<b>. Nada (rc 0) quando nenhuma dessas
#       árvores declara a branch, ou a ref é de outro namespace. rc 1: caminho
#       sob docs/entregas com caractere de controle (TAB, LF, CR...) numa das
#       árvores (PR_CTRL=1; a decisão barra com caminho_com_controle), SHA
#       enviado sem objeto, árvore ou blob que não se lê (com PR_FALTA=1
#       quando é objeto Git ausente), ou mais de um ENTREGA.md diferente
#       declarando a branch (ambíguo; inclusive reúso de nome de branch por
#       uma entrega antiga). `branch:` é lido como catalogo_fm lê, mas com um
#       ls-tree e um cat-file --batch por árvore: o número de processos não
#       cresce com as entregas da árvore.
#
#   pr_decide_ref <raiz> <ref_local> <sha_local> <ref_remota> <sha_remoto> [remoto]
#       Decide uma ref do protocolo do pre-push. Imprime decisao=, motivo= e
#       entrega= (sem <remoto>) ou a saída indexada de pr_decide_entregas
#       (com <remoto>), e deixa em PR_DIAG o diagnóstico legível (vazio quando
#       passa sem nada a dizer). rc 0 para passa/avisa, rc 1 para barra
#       (PR_ERRO = PR_DIAG).
#       - exclusão (SHA local nulo): passa, motivo exclusao;
#       - tag (refs/tags/*): passa, motivo tag;
#       - SEM <remoto> (o hook do Claude, consultivo): a regra legada pelo
#         nome, só ela — ref não aplicável (pr_entrega_da_ref vazio) passa
#         com ref_nao_aplicavel; aplicável, pr_decide_entrega sobre o SHA
#         local;
#       - COM <remoto> (o pre-push; spec 13.7, DM-185): as entregas da ref
#         refs/heads/<b> são a UNIÃO de três parcelas, que só acrescentam e
#         nunca isentam:
#           (a) pr_entregas_do_intervalo com <base> = refs/remotes/<remoto>/HEAD,
#               quando resolve para commit (push para URL não tem; nunca se
#               adivinha main ou master);
#           (b) a regra legada pelo nome (pr_entrega_da_ref);
#           (c) o trailer `Trabalho: <id>` do commit enviado, que seleciona
#               docs/entregas/<id>/ENTREGA.md.
#         União não vazia: pr_decide_entregas sobre o SHA local, com a
#         agregação. União vazia: sem a parcela (a) e com algum ENTREGA.md
#         canônico na árvore enviada, avisa com cobertura_indeterminada (a
#         aplicabilidade não está provada, não barra); senão passa com
#         ref_nao_aplicavel. Falha de seleção barra: base_ambigua,
#         caminho_com_controle, historia_incompleta (inclusive objeto ausente
#         já na leitura das entregas da ref), erro_ambiente,
#         entrega_indeterminada (a regra pelo nome ambígua).
#       Os diagnósticos de historia_incompleta e de erro_ambiente são
#       distintos: o primeiro manda completar a história, o segundo descreve a
#       falha do ambiente.
#
# Custo: uma validade por entrega selecionada; nenhuma varredura de branches;
# um número constante de processos Git por árvore lida e por seleção.
#
# Versão do Git: a parcela (c) do pre-push lê o trailer com
# `git log -1 --format='%(trailers:key=Trabalho,valueonly,unfold)'`: `unfold`
# existe desde o Git 2.15 e `key=`/`valueonly` desde o 2.22 (RelNotes 2.22.0:
# "pick trailers selectively by keyword, show only values"). Num Git anterior o
# placeholder sai literal, reprova na gramática do id e a parcela (c) não
# seleciona nada — ela só acrescenta, e as parcelas (a) e (b) continuam. O
# restante (`--path-format=absolute`, Git >= 2.31) é o que os demais scripts da
# skill já exigem.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

PR_AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PR_VALIDADE="$PR_AQUI/validade-do-portao.sh"
PR_ERRO=""
PR_DIAG=""
PR_DEC=""
PR_MOT=""
PR_MODO=""
PR_ENTREGA=""
PR_SEL_MOTIVO=""
PR_FALTA=0
PR_CTRL=0

if [ ! -r "$PR_AQUI/catalogo-de-metodo.sh" ] || [ ! -r "$PR_AQUI/reconciliacao-arvore.sh" ]; then
  PR_ERRO="dependência indisponível ao lado de $PR_AQUI/portao-regras.sh"
  return 1 2>/dev/null || exit 1
fi
# shellcheck source=catalogo-de-metodo.sh
. "$PR_AQUI/catalogo-de-metodo.sh"
# shellcheck source=reconciliacao-arvore.sh
. "$PR_AQUI/reconciliacao-arvore.sh"

_pr_g() { git -c core.quotepath=false "$@"; }
_pr_nulo() { grep -Eq '^0+$' <<<"$1"; }

# _pr_modo <raiz> — PR_MODO (sem subshell, para ler PR_ERRO)
_pr_modo() {
  local arq="$1/.expx/hooks.json" v
  PR_ERRO=""; PR_MODO=aviso
  if [ ! -e "$arq" ] && [ ! -L "$arq" ]; then return 0; fi
  if [ ! -f "$arq" ] || [ ! -r "$arq" ]; then
    PR_MODO=bloqueio; PR_ERRO="$arq não se lê: modo de pr-so-com-portao tratado como bloqueio"; return 1
  fi
  command -v jq >/dev/null 2>&1 \
    || { PR_MODO=bloqueio; PR_ERRO="jq ausente: modo de pr-so-com-portao tratado como bloqueio"; return 1; }
  v="$(jq -c 'if (.hooks["pr-so-com-portao"].modo) != null then .hooks["pr-so-com-portao"].modo else .modos["pr-so-com-portao"] end' "$arq" 2>/dev/null)" \
    || { PR_MODO=bloqueio; PR_ERRO="$arq ilegível: modo de pr-so-com-portao tratado como bloqueio"; return 1; }
  case "$v" in
    '"bloqueio"') PR_MODO=bloqueio ;;
    '"aviso"') PR_MODO=aviso ;;
    '"desligado"') PR_MODO=desligado ;;
    null) PR_MODO=aviso ;;
    *) PR_MODO=bloqueio; PR_ERRO="modo de pr-so-com-portao inválido em $arq (${v:-vazio}): tratado como bloqueio"; return 1 ;;
  esac
  return 0
}

pr_modo_null() {
  local rc
  _pr_modo "$1"; rc=$?
  printf '%s\n' "$PR_MODO"
  return "$rc"
}

# _pr_falta_objeto <raiz> <rev> — rc 0 se falta algum objeto (árvore ou blob)
# da árvore de <rev>. Só nos caminhos de falha.
_pr_falta_objeto() {
  local o
  o="$(_pr_g -C "$1" rev-list --objects --no-walk --missing=print "$2" 2>/dev/null)" || return 0
  grep -q '^?' <<<"$o"
}

# _pr_raso <raiz> — rc 0 num repositório raso (como arvore_recusa_raso, pelo
# caminho): `--is-shallow-repository` diferente de false, ou um arquivo
# `shallow` no diretório Git ou no comum (worktree vinculada). A história
# cortada esconde commits e versões do ENTREGA.md: nada se prova.
_pr_raso() {
  local raiz="$1" gd gc
  [ "$(_pr_g -C "$raiz" rev-parse --is-shallow-repository 2>/dev/null)" = false ] || return 0
  gd="$(_pr_g -C "$raiz" rev-parse --path-format=absolute --git-dir 2>/dev/null)" || return 0
  gc="$(_pr_g -C "$raiz" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 0
  for gd in "$gd/shallow" "$gc/shallow"; do
    { [ -e "$gd" ] || [ -L "$gd" ]; } && return 0
  done
  return 1
}

# Leitura de `branch:` igual à de catalogo_fm, num fluxo `git cat-file --batch`
# inteiro: cada blob começa por `<sha> blob <tamanho>` (ou `<sha> missing`),
# seguido de exatamente <tamanho> bytes e de uma quebra de linha. Para cada
# blob, o frontmatter só existe se a primeira linha é `---` (espaços e CR no
# fim aceitos); vale a primeira linha que começa por `branch:` antes do `---`
# seguinte (sem CR, sem um par de aspas nas pontas, sem espaços no fim).
# Imprime o número de ordem de cada blob cujo valor é a branch, FALTA para um
# objeto ausente e ERRO para um cabeçalho que não se entende.
_PR_AWK_BRANCH='
  est == 0 {
    if ($0 ~ / missing$/) { print "FALTA"; i++; next }
    if (split($0, h, " ") != 3 || h[2] != "blob") { print "ERRO"; exit }
    i++; resta = h[3] + 0; nl = 0; para = 0
    est = (resta == 0) ? 2 : 1
    next
  }
  est == 2 { est = 0; next }
  {
    resta -= length($0) + 1; nl++
    if (!para) {
      if (nl == 1) { if ($0 !~ /^---[[:space:]]*\r?$/) para = 1 }
      else if ($0 ~ /^---[[:space:]]*\r?$/) para = 1
      else {
        linha = $0; gsub(/\r/, "", linha)
        if (index(linha, "branch:") == 1) {
          sub(/^[^:]*:[[:space:]]*/, "", linha)
          gsub(/^["\047]|["\047]$/, "", linha)
          gsub(/[[:space:]]+$/, "", linha)
          if (linha == b) print i
          para = 1
        }
      }
    }
    if (resta == 0) est = 2
    else if (resta < 0) est = 0
  }
'

# _pr_entregas_em <raiz> <rev> <branch> <arquivo de saída> — acrescenta ao
# arquivo os ENTREGA.md da árvore de <rev> que declaram `branch: <branch>`.
# Custo constante em processos: um ls-tree e um cat-file --batch por árvore,
# qualquer que seja o número de entregas. Objeto ausente: PR_FALTA=1.
# Escreve arquivos auxiliares ao lado da saída (<saída>.lista, .cand, .batch,
# .idx) e não os apaga: quem chama põe a saída num diretório temporário só seu
# e o remove inteiro (_pr_entrega).
_pr_entregas_em() {
  local raiz="$1" rev="$2" b="$3" saida="$4"
  _pr_g -C "$raiz" ls-tree -r -z "$rev" -- docs/entregas > "$saida.lista" 2>/dev/null \
    || { _pr_falta_objeto "$raiz" "$rev" && PR_FALTA=1; PR_ERRO="árvore de $rev não se lê"; return 1; }
  # caminho sob docs/entregas com caractere de controle (TAB, LF, CR...): falha
  # fechada, sem ler mais nada (o filtro abaixo o ignoraria e a ref passaria).
  # Só builtins: o custo continua constante em processos.
  local cab p
  while IFS= read -r -d '' cab; do
    p="${cab#*	}"
    case "$p" in *[[:cntrl:]]*) PR_CTRL=1; PR_ERRO="caminho com caractere de controle sob docs/entregas em $rev"; return 1 ;; esac # guarda:PPCTRL
  done < "$saida.lista"
  # candidatos: `<sha> <caminho>` dos docs/entregas/<id>/ENTREGA.md regulares
  tr '\0' '\n' < "$saida.lista" | LC_ALL=C awk -F'\t' '
    NF == 2 && $2 ~ "^docs/entregas/[^/[:cntrl:]]+/ENTREGA[.]md$" && $1 ~ "^100(644|755) blob [0-9a-f]+$" {
      split($1, m, " "); print m[3] " " $2 }' > "$saida.cand" \
    || { PR_ERRO="árvore de $rev não se lê"; return 1; }
  [ -s "$saida.cand" ] || return 0
  cut -d' ' -f1 "$saida.cand" | _pr_g -C "$raiz" cat-file --batch > "$saida.batch" 2>/dev/null \
    || { PR_ERRO="entregas de $rev não se leem"; return 1; }
  LC_ALL=C awk -v b="$b" "$_PR_AWK_BRANCH" "$saida.batch" > "$saida.idx" \
    || { PR_ERRO="entregas de $rev não se leem"; return 1; }
  if grep -qx FALTA "$saida.idx"; then PR_FALTA=1; PR_ERRO="ENTREGA.md de $rev com objeto Git ausente"; return 1; fi
  grep -qx ERRO "$saida.idx" && { PR_ERRO="entregas de $rev não se leem"; return 1; }
  awk 'NR == FNR { q[$1] = 1; next } (FNR in q) { sub(/^[^ ]* /, ""); print }' "$saida.idx" "$saida.cand" >> "$saida"
  return 0
}

# _pr_entrega <raiz> <ref_remota> <sha_local> <sha_remoto> — PR_ENTREGA (a
# regra legada pelo nome)
_pr_entrega() {
  local raiz="$1" rr="$2" sl="$3" sr="$4" b tmp rev ponta n rc=0 vistos=""
  PR_ERRO=""; PR_ENTREGA=""; PR_FALTA=0; PR_CTRL=0
  case "$rr" in refs/heads/?*) b="${rr#refs/heads/}" ;; *) return 0 ;; esac
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-regras.XXXXXX")" || { PR_ERRO="não foi possível criar diretório temporário"; return 1; }
  : > "$tmp/achados"
  ponta="$(_pr_g -C "$raiz" rev-parse -q --verify "refs/heads/$b^{commit}" 2>/dev/null)" || ponta=""
  for rev in "$sl" "$sr" "$ponta"; do
    [ -n "$rev" ] && ! _pr_nulo "$rev" || continue
    case " $vistos " in *" $rev "*) continue ;; esac
    vistos="$vistos $rev"
    if ! _pr_g -C "$raiz" cat-file -e "$rev^{commit}" 2>/dev/null; then
      # o remoto pode ter avançado além do que este repositório conhece
      [ "$rev" = "$sr" ] && [ "$rev" != "$sl" ] && continue
      PR_ERRO="o commit $rev não está no repositório"; rc=1; break
    fi
    : > "$tmp/um"
    _pr_entregas_em "$raiz" "$rev" "$b" "$tmp/um" || { rc=1; break; }
    n="$(wc -l < "$tmp/um" | tr -d ' ')"
    [ "$n" -le 1 ] || { PR_ERRO="mais de um ENTREGA.md declara branch: $b em $rev"; rc=1; break; }
    cat "$tmp/um" >> "$tmp/achados"
  done
  if [ "$rc" = 0 ]; then
    n="$(sort -u "$tmp/achados" | wc -l | tr -d ' ')"
    if [ "$n" -gt 1 ]; then
      PR_ERRO="ENTREGA.md diferentes declaram branch: $b ($(sort -u "$tmp/achados" | tr '\n' ' '))"; rc=1
    else
      PR_ENTREGA="$(sed -n 1p "$tmp/achados")"
    fi
  fi
  rm -rf "$tmp"
  return "$rc"
}

pr_entrega_da_ref() {
  _pr_entrega "$1" "$2" "$3" "$4" || return 1
  [ -z "$PR_ENTREGA" ] || printf '%s\n' "$PR_ENTREGA"
  return 0
}

# ---------------------------------------------------------------------------
# Seleção pelo conteúdo (DM-185, spec 13.5)
# ---------------------------------------------------------------------------

# _pr_canonico <caminho> — rc 0 para docs/entregas/<id>/ENTREGA.md com <id> sem `/`
_pr_canonico() {
  local id
  case "$1" in docs/entregas/*/ENTREGA.md) ;; *) return 1 ;; esac
  id="${1#docs/entregas/}"; id="${id%/ENTREGA.md}"
  case "$id" in ''|*/*) return 1 ;; esac
  return 0
}

# _pr_sel_falha <raiz> <rev> <mensagem> — a falha de um comando Git depois de
# resolvidas as revisões: objeto ausente é historia_incompleta, o resto é
# erro_ambiente. Só nos caminhos de falha.
_pr_sel_falha() {
  if _pr_falta_objeto "$1" "$2"; then PR_FALTA=1; PR_SEL_MOTIVO=historia_incompleta
  else PR_SEL_MOTIVO=erro_ambiente; fi
  PR_ERRO="$3"
  return 1
}

pr_entregas_do_intervalo() {
  local raiz="$1" base="$2" sha="$3" tmp mb n st p alvo aceito rc
  PR_ERRO=""; PR_SEL_MOTIVO=""; PR_FALTA=0; PR_CTRL=0
  for p in "$base" "$sha"; do
    _pr_g -C "$raiz" cat-file -e "$p^{commit}" 2>/dev/null \
      || { PR_FALTA=1; PR_SEL_MOTIVO=historia_incompleta; PR_ERRO="o commit $p não está no repositório"; return 1; }
  done
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-selecao.XXXXXX")" \
    || { PR_SEL_MOTIVO=erro_ambiente; PR_ERRO="não foi possível criar diretório temporário"; return 1; }
  _pr_g -C "$raiz" merge-base --all "$base" "$sha" > "$tmp/mb" 2>/dev/null; rc=$?
  case "$rc" in
    0|1) ;;
    *) rm -rf "$tmp"; _pr_sel_falha "$raiz" "$sha" "merge-base entre $base e $sha não calculável"; return 1 ;;
  esac
  n="$(grep -c . "$tmp/mb")"
  [ "$n" -le 1 ] || { PR_SEL_MOTIVO=base_ambigua; PR_ERRO="mais de um merge-base entre $base e $sha ($(tr '\n' ' ' < "$tmp/mb" | sed 's/ $//'))"; rm -rf "$tmp"; return 1; } # guarda:CIMBALL
  if [ "$n" = 1 ]; then
    mb="$(sed -n 1p "$tmp/mb")"; alvo="$mb..$sha"
  else
    # sem ancestral comum: num clone completo, a base é a árvore vazia e a
    # história de <sha> inteira entra; num clone raso, nada se prova
    if _pr_raso "$raiz"; then
      PR_SEL_MOTIVO=historia_incompleta; PR_ERRO="sem merge-base entre $base e $sha num clone raso: a história está cortada"; rm -rf "$tmp"; return 1
    fi
    mb="$(_pr_g -C "$raiz" hash-object -t tree /dev/null 2>/dev/null)" \
      || { PR_SEL_MOTIVO=erro_ambiente; PR_ERRO="a árvore vazia não se calcula"; rm -rf "$tmp"; return 1; }
    alvo="$sha"
  fi
  : > "$tmp/brutos"
  # (a) o diff de árvores entre o merge-base e o SHA, com qualquer status
  : > "$tmp/a"
  _pr_g -C "$raiz" diff-tree -r --no-renames --name-status -z "$mb" "$sha" -- docs/entregas > "$tmp/a" 2>/dev/null || { rm -rf "$tmp"; _pr_sel_falha "$raiz" "$sha" "diff-tree $mb $sha não calculável"; return 1; } # guarda:CIDIFF
  while IFS= read -r -d '' st && IFS= read -r -d '' p; do
    case "$p" in *[[:cntrl:]]*) PR_CTRL=1; PR_SEL_MOTIVO=caminho_com_controle; PR_ERRO="caminho com caractere de controle sob docs/entregas entre $mb e $sha"; rm -rf "$tmp"; return 1 ;; esac
    aceito=0
    case "$st" in A|M|D|T) aceito=1 ;; esac # guarda:CIDEL
    [ "$aceito" = 1 ] || continue
    _pr_canonico "$p" && printf '%s\n' "$p" >> "$tmp/brutos"
  done < "$tmp/a"
  # (b) os commits não-merge do intervalo que tocam docs/entregas, sem
  # simplificação da história (um merge que restaura a versão de um pai não
  # esconde o commit que a alterou) e sem detecção de renomeação (o caminho
  # antigo continua listado)
  set -- log --no-merges --no-renames --format= --name-only -z
  set -- "$@" --full-history # guarda:CIFULL2
  : > "$tmp/b"
  _pr_g -C "$raiz" "$@" "$alvo" -- docs/entregas > "$tmp/b" 2>/dev/null || { rm -rf "$tmp"; _pr_sel_falha "$raiz" "$sha" "log $alvo não calculável"; return 1; } # guarda:CIHIST
  while IFS= read -r -d '' p; do
    [ -n "$p" ] || continue
    case "$p" in *[[:cntrl:]]*) PR_CTRL=1; PR_SEL_MOTIVO=caminho_com_controle; PR_ERRO="caminho com caractere de controle sob docs/entregas em $alvo"; rm -rf "$tmp"; return 1 ;; esac
    _pr_canonico "$p" && printf '%s\n' "$p" >> "$tmp/brutos"
  done < "$tmp/b"
  LC_ALL=C sort -u "$tmp/brutos"
  rm -rf "$tmp"
  return 0
}

# _pr_id_valido <id> — rc 0 se <id> pode nomear um trabalho: a gramática de
# validade-do-portao.sh (não vazio, só [A-Za-z0-9._-], não começa por `.`,
# nenhum nome reservado)
_pr_id_valido() {
  case "$1" in
    ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto) return 1 ;;
  esac
  return 0
}

# _pr_trailer_trabalho <raiz> <sha> — imprime docs/entregas/<id>/ENTREGA.md
# para cada trailer `Trabalho: <id>` da mensagem do commit <sha> (um
# processo Git: `%(trailers:key=Trabalho,valueonly,unfold)`, Git >= 2.22; num
# Git sem as opções o placeholder sai literal, não passa na gramática e a
# parcela não seleciona nada — ela só acrescenta, (a) e (b) continuam). Um
# <id> fora da gramática (_pr_id_valido) é ignorado: não nomeia entrega
# nenhuma.
_pr_trailer_trabalho() {
  local id
  _pr_g -C "$1" log -1 --format='%(trailers:key=Trabalho,valueonly,unfold)' "$2" 2>/dev/null \
    | while IFS= read -r id; do
        id="$(printf '%s' "$id" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
        _pr_id_valido "$id" || continue
        printf 'docs/entregas/%s/ENTREGA.md\n' "$id"
      done
}

# _pr_tem_entrega_canonica <raiz> <sha> — rc 0 se a árvore de <sha> tem algum
# docs/entregas/<id>/ENTREGA.md regular (um processo Git)
_pr_tem_entrega_canonica() {
  _pr_g -C "$1" ls-tree -r -z "$2" -- docs/entregas 2>/dev/null | tr '\0' '\n' | LC_ALL=C awk -F'\t' '
    NF == 2 && $2 ~ "^docs/entregas/[^/[:cntrl:]]+/ENTREGA[.]md$" && $1 ~ "^100(644|755) blob " { f = 1; exit }
    END { exit !f }'
}

# ---------------------------------------------------------------------------
# Decisão por entrega e por lista
# ---------------------------------------------------------------------------

# _pr_portao_null <raiz> <sha> <entrega> — o ENTREGA.md do SHA é legível,
# consistente e declara `portao: null` (o E2 ainda não autorizou)
_pr_portao_null() {
  local raiz="$1" sha="$2" e="$3" id tmp modo r=1
  id="${e#docs/entregas/}"; id="${id%/ENTREGA.md}"
  modo="$(_pr_g -C "$raiz" ls-tree -z "$sha" -- "$e" 2>/dev/null | tr '\0' '\n' | sed -n '1s/ .*//p')"
  case "$modo" in 100644|100755) ;; *) return 1 ;; esac
  tmp="$(mktemp "${TMPDIR:-/tmp}/mergex-portao-null.XXXXXX")" || return 1
  if _pr_g -C "$raiz" cat-file blob "$sha:$e" > "$tmp" 2>/dev/null \
    && [ "$(catalogo_fm "$tmp" kind)" = entrega ] \
    && [ "$(catalogo_fm "$tmp" trabalho_id)" = "$id" ] \
    && case "$(catalogo_fm "$tmp" expx_tool)" in sprintx|runx) true ;; *) false ;; esac \
    && [ "$(catalogo_fm "$tmp" portao)" = null ]; then r=0; fi
  rm -f "$tmp"
  return "$r"
}

# _pr_sai <decisao> <motivo> <entrega> <diagnóstico>
_pr_sai() {
  PR_DIAG="$4"; PR_DEC="$1"; PR_MOT="$2"
  printf 'decisao=%s\nmotivo=%s\nentrega=%s\n' "$1" "$2" "${3:--}"
  if [ "$1" = barra ]; then PR_ERRO="$4"; return 1; fi
  return 0
}

# _pr_diag_invalido <motivo> <primeiro_commit> — o diagnóstico de cada motivo
# que barra (ou avisa)
_pr_diag_invalido() {
  case "$1" in
    historia_incompleta)
      printf '%s' "história incompleta (historia_incompleta): clone raso ou objeto Git ausente; complete a história com 'git fetch --unshallow' ou busque os objetos que faltam, e repita o push" ;;
    erro_ambiente)
      printf '%s' "erro de ambiente (erro_ambiente): a validade do portão não pôde ser avaliada; corrija o ambiente e repita o push" ;;
    portao_sha_ausente)
      printf '%s' "portão pronto sem portao_sha válido (portao_sha_ausente): rode o E2 (/mergex-check) de novo para regravar o portão" ;;
    portao_nao_pronto)
      printf '%s' "ENTREGA.md ausente, ilegível, inconsistente ou com portão não pronto no SHA enviado (portao_nao_pronto): rode o E2 (/mergex-check) de novo" ;;
    entrega_indeterminada)
      printf '%s' "não foi possível determinar o ENTREGA.md da ref (entrega_indeterminada)" ;;
    base_ambigua)
      printf '%s' "mais de um merge-base entre a base e o SHA (base_ambigua): a seleção pelo conteúdo não tem uma base única; integre a base numa só linha (merge da base atual) e repita" ;;
    caminho_com_controle)
      printf '%s' "caminho com caractere de controle (TAB, quebra de linha, CR) sob docs/entregas (caminho_com_controle): renomeie o diretório da entrega" ;;
    cobertura_indeterminada)
      printf '%s' "a árvore enviada tem ENTREGA.md, mas nenhuma parcela da seleção a alcança (cobertura_indeterminada): sem refs/remotes/<remoto>/HEAD, sem ENTREGA.md que declare a branch e sem trailer Trabalho: no commit enviado; o push segue sem prova do portão — confira a branch de destino ou rode 'git remote set-head <remoto> --auto'" ;;
    *)
      printf 'portão inválido para o SHA enviado (%s' "$1"
      [ "${2:--}" = - ] || printf ', primeiro commit %s' "$2"
      printf '%s' "): rode o E2 (/mergex-check) de novo" ;;
  esac
}

pr_decide_entrega() {
  local raiz="$1" sha="$2" ent="$3" out rc okv mot pri avisos nulo d id
  PR_ERRO=""; PR_DIAG=""
  # o <id> do caminho tem de poder nomear um trabalho; fora da gramática (espaço,
  # acento, nome reservado) a entrega é indeterminada — motivo próprio, nunca
  # erro de ambiente, e a validade nem roda
  id="${ent#docs/entregas/}"; id="${id%/ENTREGA.md}"
  _pr_id_valido "$id" \
    || { _pr_sai barra entrega_indeterminada "$ent" "não foi possível determinar o ENTREGA.md da entrega (entrega_indeterminada): o id '$id' em $ent está fora da gramática de trabalho ([A-Za-z0-9._-], sem começar por '.', sem nome reservado); renomeie o diretório da entrega"; return; }
  [ -r "$PR_VALIDADE" ] \
    || { _pr_sai barra erro_ambiente "$ent" "$(_pr_diag_invalido erro_ambiente): validador ausente: $PR_VALIDADE"; return; }
  set -- --verificar --entrega "$ent"
  set -- "$@" --rev "$sha" # guarda:PPSHA
  out="$(cd "$raiz" && bash "$PR_VALIDADE" "$@" 2>/dev/null)"; rc=$?
  okv="$(printf '%s\n' "$out" | sed -n 1p)"
  mot="$(printf '%s\n' "$out" | sed -n 's/^motivo=//p' | sed -n 1p)"
  pri="$(printf '%s\n' "$out" | sed -n 's/^primeiro_commit=//p' | sed -n 1p)"
  avisos="$(printf '%s\n' "$out" | sed -n 's/^aviso=//p' | tr '\n' ';' | sed 's/;$//; s/;/; /g')"
  if [ "$rc" = 0 ] && [ "$okv" = ok=true ]; then
    _pr_sai passa portao_valido "$ent" ""; return
  fi
  if [ "$rc" != 1 ] || [ "$okv" != ok=false ] || [ -z "$mot" ]; then
    _pr_sai barra erro_ambiente "$ent" "$(_pr_diag_invalido erro_ambiente): a validade devolveu uma saída inesperada (rc=$rc)"; return
  fi
  d="$(_pr_diag_invalido "$mot" "$pri")"
  [ -z "$avisos" ] || d="$d [$avisos]"

  nulo=0
  [ "$mot" = portao_nao_pronto ] && _pr_portao_null "$raiz" "$sha" "$ent" && nulo=1
  # o modo nunca afrouxa pronto vencido, ausente, inconsistente ou ilegível,
  # nem historia_incompleta ou erro_ambiente
  [ "$nulo" = 1 ] || { _pr_sai barra "$mot" "$ent" "$d"; return; } # guarda:PPMODO

  _pr_modo "$raiz"
  d="portão ainda não autorizado pelo E2 (portao: null em $ent); modo $PR_MODO de pr-so-com-portao"
  [ -z "$PR_ERRO" ] || d="$d ($PR_ERRO)"
  case "$PR_MODO" in
    desligado) _pr_sai passa portao_null "$ent" "" ;;
    aviso) _pr_sai avisa portao_null "$ent" "$d: o push segue; rode o E2 (/mergex-check) antes do PR" ;;
    *) _pr_sai barra portao_null "$ent" "$d: o push fica barrado; rode o E2 (/mergex-check)" ;;
  esac
}

# _pr_vence <agregada> <decisao> — rc 0 se <decisao> passa a ser a agregada:
# barra vence tudo (a primeira que barra fica); avisa vence passa
_pr_vence() {
  case "$1:$2" in
    barra:*) return 1 ;;
    avisa:barra) return 0 ;;
    avisa:*) return 1 ;;
    passa:barra|passa:avisa) return 0 ;;
    *) return 1 ;;
  esac
}

pr_decide_entregas() {
  local raiz="$1" sha="$2" i=0 n agg="" mot="" ent d m diag="" e
  shift 2
  n="$#"
  PR_ERRO=""; PR_DIAG=""
  for e in "$@"; do
    i=$((i + 1))
    pr_decide_entrega "$raiz" "$sha" "$e" >/dev/null
    d="$PR_DEC"; m="$PR_MOT"
    printf 'entrega[%s]=%s\ndecisao[%s]=%s\nmotivo[%s]=%s\n' "$i" "$e" "$i" "$d" "$i" "$m"
    [ -z "$PR_DIAG" ] || diag="${diag:+$diag; }$e: $PR_DIAG"
    [ -n "$agg" ] || { agg="$d"; mot="$m"; }
    if _pr_vence "$agg" "$d"; then agg="$d"; mot="$m"; fi # guarda:CIAGREG
  done
  [ "$n" -gt 0 ] || { agg=passa; mot=ref_nao_aplicavel; }
  if [ "$n" = 1 ]; then ent="$1"; else ent=-; fi
  PR_DIAG="$diag"; PR_DEC="$agg"; PR_MOT="$mot"
  printf 'decisao=%s\nmotivo=%s\nentrega=%s\nquantidade_entregas=%s\n' "$agg" "$mot" "$ent" "$n"
  if [ "$agg" = barra ]; then PR_ERRO="$PR_DIAG"; return 1; fi
  return 0
}

# _pr_barra_selecao <motivo> <erro> — a falha de pr_entregas_do_intervalo como
# decisão que barra
_pr_barra_selecao() {
  case "$1" in
    historia_incompleta|erro_ambiente|base_ambigua|caminho_com_controle) _pr_sai barra "$1" - "$(_pr_diag_invalido "$1") [$2]" ;;
    *) _pr_sai barra erro_ambiente - "$(_pr_diag_invalido erro_ambiente): seleção pelo conteúdo falhou [$2]" ;;
  esac
}

# _pr_nota_base <remoto> <base> — a decisão do pre-push que barra ou avisa passa
# a citar a base da parcela (a): refs/remotes/<remoto>/HEAD e o SHA dela. Se a
# base está defasada ou não é a base de integração da branch, entregas trazidas
# pela base podem ter sido selecionadas (falso bloqueio, nunca aprovação). Só
# acrescenta texto ao diagnóstico: a decisão não muda.
_pr_nota_base() {
  case "${PR_DEC:-}" in barra|avisa) ;; *) return 0 ;; esac
  PR_DIAG="$PR_DIAG [base da seleção: refs/remotes/$1/HEAD = $2; se essa base está defasada ou não é a base de integração desta branch, entregas trazidas pela base podem ter sido selecionadas: rode 'git fetch $1' e 'git remote set-head $1 -a' antes de rodar o E2 (/mergex-check) de novo]"
  if [ "$PR_DEC" = barra ]; then PR_ERRO="$PR_DIAG"; fi
  return 0
}

# _pr_decide_push <raiz> <sha_local> <ref_remota> <sha_remoto> <remoto> — a
# ref refs/heads/<b> do pre-push: a união das parcelas (a), (b) e (c)
_pr_decide_push() {
  local raiz="$1" sl="$2" rr="$3" sr="$4" remoto="$5" b tmp base tem_a=0 rcb=0 motivo erro e rcd
  case "$rr" in refs/heads/?*) b="${rr#refs/heads/}" ;; *) _pr_sai passa ref_nao_aplicavel - ""; return ;; esac
  : "$b"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mergex-portao-push-sel.XXXXXX")" \
    || { _pr_sai barra erro_ambiente - "$(_pr_diag_invalido erro_ambiente): não foi possível criar diretório temporário"; return; }
  : > "$tmp/lista"
  # (a) o conteúdo contra refs/remotes/<remoto>/HEAD, quando resolve para
  # commit; sem ela a parcela não existe (nunca se adivinha main ou master)
  base="$(_pr_g -C "$raiz" rev-parse -q --verify "refs/remotes/$remoto/HEAD^{commit}" 2>/dev/null)" || base=""
  if [ -n "$base" ]; then
    tem_a=1
    pr_entregas_do_intervalo "$raiz" "$base" "$sl" >> "$tmp/lista" || { motivo="$PR_SEL_MOTIVO"; erro="$PR_ERRO"; rm -rf "$tmp"; _pr_barra_selecao "$motivo" "$erro"; _pr_nota_base "$remoto" "$base"; return 1; } # guarda:PPBASE
  fi
  # (b) a regra legada pelo nome
  PR_ENTREGA=""; PR_FALTA=0; PR_CTRL=0
  _pr_entrega "$raiz" "$rr" "$sl" "$sr" || rcb=1 # guarda:PPLEG
  if [ "$rcb" = 1 ]; then
    erro="$PR_ERRO"; rm -rf "$tmp"
    [ "$PR_CTRL" != 1 ] || { _pr_sai barra caminho_com_controle - "$(_pr_diag_invalido caminho_com_controle); o push fica barrado [$erro]"; return; }
    # objeto ausente nas entregas da ref: história incompleta, não ambiente
    [ "$PR_FALTA" != 1 ] || { _pr_sai barra historia_incompleta - "$(_pr_diag_invalido historia_incompleta) [$erro]"; return; } # guarda:VALOBJ
    _pr_sai barra entrega_indeterminada - "$(_pr_diag_invalido entrega_indeterminada): $erro"; return
  fi
  [ -z "$PR_ENTREGA" ] || printf '%s\n' "$PR_ENTREGA" >> "$tmp/lista"
  # (c) o trailer Trabalho: do commit enviado
  _pr_trailer_trabalho "$raiz" "$sl" >> "$tmp/lista" # guarda:PPTRL
  LC_ALL=C sort -u "$tmp/lista" > "$tmp/entregas"
  if [ ! -s "$tmp/entregas" ]; then
    rm -rf "$tmp"
    if [ "$tem_a" = 0 ] && _pr_tem_entrega_canonica "$raiz" "$sl"; then _pr_sai avisa cobertura_indeterminada - "$(_pr_diag_invalido cobertura_indeterminada)"; return; fi # guarda:PPCOB
    _pr_sai passa ref_nao_aplicavel - ""; return
  fi
  set --
  while IFS= read -r e; do [ -n "$e" ] && set -- "$@" "$e"; done < "$tmp/entregas"
  rm -rf "$tmp"
  pr_decide_entregas "$raiz" "$sl" "$@"; rcd=$?
  [ "$tem_a" = 0 ] || _pr_nota_base "$remoto" "$base"
  return "$rcd"
}

pr_decide_ref() {
  local raiz="$1" rl="$2" sl="$3" rr="$4" sr="$5" remoto="${6:-}" ent
  PR_ERRO=""; PR_DIAG=""
  : "$rl" # a ref local não decide: decidem o destino e o SHA enviado
  _pr_nulo "$sl" && { _pr_sai passa exclusao - ""; return; }
  case "$rr" in refs/tags/*) _pr_sai passa tag - ""; return ;; esac
  if [ -n "$remoto" ]; then _pr_decide_push "$raiz" "$sl" "$rr" "$sr" "$remoto"; return; fi

  # sem <remoto>: só a regra legada pelo nome (o hook do Claude, consultivo)
  if ! _pr_entrega "$raiz" "$rr" "$sl" "$sr"; then
    [ "$PR_CTRL" != 1 ] || { _pr_sai barra caminho_com_controle - "$(_pr_diag_invalido caminho_com_controle); o push fica barrado [$PR_ERRO]"; return; }
    # objeto ausente nas entregas da ref: história incompleta, não ambiente
    [ "$PR_FALTA" != 1 ] || { _pr_sai barra historia_incompleta - "$(_pr_diag_invalido historia_incompleta) [$PR_ERRO]"; return; } # guarda:VALOBJ
    _pr_sai barra entrega_indeterminada - "$(_pr_diag_invalido entrega_indeterminada): $PR_ERRO"; return
  fi
  ent="$PR_ENTREGA"
  [ -n "$ent" ] || { _pr_sai passa ref_nao_aplicavel - ""; return; }
  pr_decide_entrega "$raiz" "$sl" "$ent"
}
