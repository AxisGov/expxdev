#!/usr/bin/env bash
# reconciliacao-base — registra e verifica a reconciliação de base pós-E8.
#
# Contrato: docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md,
# seções 5 (modelo Git), 6 (as quatro provas), 7 (artefato) e 8 (--registrar,
# --verificar).
#
# Uso:
#   reconciliacao-base.sh --registrar --entrega docs/entregas/<id>/ENTREGA.md \
#     --origem <sprintx|runx> --trabalho <id> [--merge <sha>] -- <caminho>...
#   reconciliacao-base.sh --verificar --entrega docs/entregas/<id>/ENTREGA.md \
#     --origem <sprintx|runx> --trabalho <id>
#
# --registrar
#   M é HEAD, ou o commit dado em --merge (SHA hex, 7 a 40 dígitos, resolvido
#   para o SHA completo); P1 = M^1; B1 = M^2. Na primeira reconciliação, B0 é o
#   base_validada_sha do ENTREGA.md de P1 (origem_base registrada_e0; chave
#   presente vazia, null ou fora de 40 hex: rc 5). Entrega legada (spec, seção
#   14: o ENTREGA.md de P1 sem base_validada_sha, sem origem_base, e nenhum
#   RECONCILIACAO-BASE no histórico de P1; senão rc 5): o 001, e só ele, infere
#   B0 = o merge-base de P1 e B1 e grava origem_base: inferida_legado no
#   artefato e no ENTREGA.md, com as chaves novas que faltam. rc 6, antes de
#   qualquer escrita, quando `git merge-base --all P1 B1` não tem exatamente
#   um resultado, quando a linha de primeiro pai de P1 desde ele contém merge,
#   ou quando ele não é ancestral de B1. Com reconciliações já gravadas (a
#   cadeia, seção 14), B0 é o b1_sha da última e o <início> da prova 2 é o
#   m_sha dela; antes, a cadeia existente (os artefatos do disco, rastreados ou
#   não) passa pela mesma verificação de contrato e de provas do --verificar
#   (sem a cobertura em HEAD), e o ENTREGA.md do disco tem de listá-la.
#   Ordem: M está na linha de primeiro pai de HEAD (rc 4; com --merge, antes
#   de ler o ENTREGA.md de M); M^2 descende do b1_sha da última reconciliação
#   e M é o merge mais antigo ainda não registrado nessa linha (rc 5; um merge
#   que não é de integração e trava a fila é citado pelo SHA). O mesmo M da
#   última reconciliação, com a mesma lista (como conjunto), é reexecução:
#   depois da mesma guarda do ENTREGA.md do disco (rc 3), não grava nada e
#   imprime, no stdout:
#     noop=true
#     [completado=superada]   (só quando completou um registro interrompido)
#     registrado=<RECONCILIACAO-BASE-NNN.md>  b0=  p1=  b1=  m=   (da última)
#   Com outra lista, ou o M de uma reconciliação anterior à última, rc 5.
#   Artefato não rastreado e fora da lista do ENTREGA.md (sobra de registro
#   interrompido antes do ponto de commit) é órfão: rc 5.
#   Registro interrompido depois do ponto de commit (o ENTREGA.md já lista o
#   novo artefato, mas o anterior ainda está `ativa`, talvez com a sobra
#   RECONCILIACAO-BASE-NNN.md.superada.<pid>): o --verificar dá rc 5
#   `registro interrompido: rode --registrar de novo com o mesmo --merge/M`; o
#   --registrar com o mesmo M e a mesma lista verifica a cadeia inteira de
#   novo, marca o anterior `superada` (estado não é assinado), remove a sobra
#   e devolve rc 0 com `noop=true` e `completado=superada`. O resíduo é
#   reconhecido pela estrutura da cadeia, nunca pelo texto de um motivo: todo
#   artefato lido (senão rc 5 `cadeia ilegível`), nenhuma prova reprovada (rc
#   4), e as únicas falhas de contrato são a penúltima com `estado: ativa` e
#   sobras não rastreadas. Sobra rastreada: rc 5 `sobra rastreada: <nome>;
#   remova-a com um commit`. Só é sobra um arquivo regular cujo prefixo é o
#   nome de um artefato da cadeia; diretório, link ou outro tipo: rc 5 `sobra
#   inválida: <nome>; remova-a`; prefixo fora da cadeia: rc 5 `sobra sem
#   artefato na cadeia: <nome>; remova-a`. A conclusão confere tudo antes de
#   qualquer escrita. O anterior `superada` só é preparado depois do
#   ponto de commit; artefato órfão junto de sobra nomeia as duas na
#   instrução.
#   Calcula as condições estruturais, as quatro provas de cada caminho dado e o
#   inventário completo do merge (`git diff --name-only B1 M` contido em união
#   das tasks ∪ catálogo de método ∪ lista ∪ caminho herdado da cadeia ∪ os
#   próprios RECONCILIACAO-BASE-NNN.md da entrega). Tudo aprovado: grava
#   docs/entregas/<id>/RECONCILIACAO-BASE-<NNN>.md (o seguinte da cadeia),
#   marca o anterior como `superada` e imprime `registrado=`, `b0=`, `p1=`,
#   `b1=`, `m=`. Qualquer reprovação: nada é gravado, e cada motivo sai no
#   stderr como `reconciliacao-base: <motivo>`.
#
#   Aprovado, grava também o ENTREGA.md (seção 11): base_validada_sha = B1,
#   reconciliacoes acrescida, e a entrega reaberta (estado aberto, portão e
#   causa zerados, push_feito false, entregue_em null, atualizado_em de hoje).
#   commits, seq e as demais chaves ficam intactos. A gravação parte do
#   ENTREGA.md de M, e só se o do disco for byte a byte o de M (senão rc 3);
#   com cadeia, o do disco pode diferir do de M só nas chaves que o registro
#   grava, com exatamente os valores que a cadeia verificada implica.
#   Gravação: artefato novo; `mv` do ENTREGA.md, que é o ponto de commit; o
#   anterior `superada` por último. Interrompido antes do ponto de commit
#   (o ENTREGA.md no lugar não é o novo), o artefato novo é removido e nada
#   fica; depois dele, o registro está efetivado e só os temporários saem.
#
# --verificar (só leitura: nunca grava, nunca adquire a trava C5, não exige
#   stage vazio nem pasta limpa)
#   Lê os RECONCILIACAO-BASE-NNN.md do disco e, para toda a cadeia, recalcula
#   do Git o que eles afirmam, com as MESMAS funções de prova do registro:
#   schema e assinatura; numeração contínua, `anterior`, `b0_sha` = `b1_sha`
#   da anterior, estados (só a última `ativa`), M em ordem na linha de primeiro
#   pai de HEAD; âncora (o `b0_sha` do 001 é o `base_validada_sha` do
#   ENTREGA.md em P1, o de antes do merge; num 001 `inferida_legado`, o
#   ENTREGA.md em P1 é legado, as três checagens da inferência passam de novo
#   sobre p1_sha/b1_sha e o `b0_sha` é o merge-base único; só o 001 pode ser
#   `inferida_legado`, e o ENTREGA.md do disco diz a mesma origem_base que
#   ele); estrutura (inclusive: o merge não
#   mexe no ENTREGA.md); as quatro provas (plano e catálogo da árvore do M de
#   cada uma, `<início>` da prova 2 = M anterior); status_base, blob_b1,
#   blob_m e diff_b1_m_sha256 de cada caminho; inventário B1..M (um caminho
#   de reconciliação anterior só dispensa a relistagem se a base não o tocou
#   entre b0 e b1 e M tem o blob_m da anterior mais recente que o lista); a
#   lista `reconciliacoes` e o `base_validada_sha` do ENTREGA.md do disco; e,
#   por caminho, `HEAD:<caminho>` com o blob_m e o modo em M da reconciliação
#   mais recente que o lista. Nenhum campo do artefato é aceito sem recálculo.
#   Saída (só stdout): `ok=true` e `coberto<TAB><caminho><TAB><NNN>` por
#   caminho; ou `ok=false` e `motivo<TAB><código><TAB><detalhe>` por falha,
#   todas relatadas. rc 5 se houver falha de contrato, senão 4.
#
# --verificar --checkpoint reconciliacao-base (a barreira que o E2 exige, spec
#   seção 9): o mesmo --verificar e, além dele, o ENTREGA.md e todo artefato da
#   cadeia (os do disco e os listados no ENTREGA.md do disco) em HEAD com
#   exatamente o conteúdo do disco (`git hash-object --no-filters` contra
#   `HEAD:<arquivo>`, nunca pelo índice), e o conjunto de
#   RECONCILIACAO-BASE-NNN.md em HEAD igual ao do disco e ao listado no
#   ENTREGA.md de HEAD. Cada arquivo que falha: `ok=false` e
#   `motivo<TAB>persistencia<TAB><arquivo>`, rc 5. Outro valor de
#   --checkpoint, ou --checkpoint no --registrar: rc 64.
#   Limitação conhecida, que falha fechado: com core.autocrlf e um arquivo
#   que veio do checkout com CRLF, o conteúdo do disco difere do blob de HEAD
#   e a barreira dá rc 5 mesmo com `git status` limpo. É de propósito: aplicar
#   os filtros de checkout reabriria o contorno que `--no-filters` fecha.
#
#   Repositório raso (`--is-shallow-repository` true, ou arquivo `shallow`
#   no diretório Git ou no comum), nos dois modos e com qualquer
#   --checkpoint: rc 4 `estrutura[raso]` antes de qualquer prova, sem gravar
#   nada e sem a trava (no --verificar, `ok=false` e esse único motivo). Clone
#   raso legítimo: `git fetch --unshallow`.
#
#   Toda prova é recalculada do Git; nenhum caminho é aceito por estar listado.
#   Não há opção de força, nem variável de ambiente que relaxe prova.
#
# Códigos: 0 registrado/verificado; 1 ambiente (fora de repositório,
#   temporário, trava não criada); 2 trava C5 ocupada; 3 stage não vazio ou
#   merge em andamento; 4 prova reprovada (estrutura, uma das quatro provas,
#   inventário, campo recalculado, cobertura); 5 contrato do artefato, da cadeia
#   ou do ENTREGA.md inválido, ou reconciliação já registrada; 6 base validada
#   indeterminável; 64 uso.
#
# Bash 3.2 (macOS): sem arrays associativos, mapfile ou recursos de Bash 4+.

set -uo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRAVA_SH="$AQUI/trava-do-e1.sh"
CONTRATO_SH="$AQUI/contrato-de-commit.sh"
CATALOGO_SH="$AQUI/catalogo-de-metodo.sh"
OWNERSHIP_SH="$AQUI/ownership-da-task.sh"
ARTEFATO_SH="$AQUI/reconciliacao-artefato.sh"
ARVORE_SH="$AQUI/reconciliacao-arvore.sh"

for dependencia in "$TRAVA_SH" "$CONTRATO_SH" "$CATALOGO_SH" "$OWNERSHIP_SH" "$ARTEFATO_SH" "$ARVORE_SH"; do
  [ -r "$dependencia" ] || { printf 'reconciliacao-base: dependência indisponível: %s\n' "$dependencia" >&2; exit 1; }
done
# shellcheck source=trava-do-e1.sh
. "$TRAVA_SH"
# shellcheck source=catalogo-de-metodo.sh
. "$CATALOGO_SH"
# shellcheck source=reconciliacao-artefato.sh
. "$ARTEFATO_SH"
# shellcheck source=reconciliacao-arvore.sh
. "$ARVORE_SH"
set +e

# O ambiente Git fixo (reconciliacao-arvore.sh): caminho exatamente como no
# Git, pathspec literal, submódulo nunca ignorado, pais e objetos só do Git.
# Vale também para o rb_diff_sha e para os filhos (contrato-de-commit.sh,
# ownership-da-task.sh), que herdam o ambiente exportado.
arvore_ambiente_git
g() { git -c core.quotepath=false "$@"; }

NL='
'
TAB='	'

MODO=""
ENTREGA=""
ORIGEM=""
TRABALHO=""
SEPARADOR=0
MERGE_ARG=""
CHECKPOINT="" # (verificar) reconciliacao-base: a barreira de persistência (spec, seção 9)

uso() {
  [ -z "${1:-}" ] || printf 'reconciliacao-base: %s\n' "$1" >&2
  printf '%s\n' \
    'uso: reconciliacao-base.sh --registrar --entrega <ENTREGA.md> --origem <sprintx|runx> --trabalho <id> [--merge <sha>] -- <caminho>...' \
    '     reconciliacao-base.sh --verificar [--checkpoint reconciliacao-base] --entrega <ENTREGA.md> --origem <sprintx|runx> --trabalho <id>' >&2
  exit 64
}

TMP_DIR=""
TOKEN=""
LIBERAR_NA_SAIDA=0
TMP_ENTREGA=""
DESTINO=""
ARTEFATO_NOVO=0 # 1 depois de emitido o artefato novo, até o fim da gravação
ENTREGA_NOVO="" # o ENTREGA.md que o registro grava (o ponto de commit)
TMP_ANT=""      # (cadeia) o anterior `superada`, ao lado dele, antes da troca

# As únicas chaves de topo do ENTREGA.md que o registro grava (seq e commits
# nunca entram).
CHAVES_GRAVADAS='base_validada_sha estado portao portao_sha falhas_portao causa push_feito entregue_em atualizado_em' # guarda:SEQ

encerrar() {
  local rc="$1"
  # Saída (inclusive por sinal) com o artefato novo emitido: decide o
  # CONTEÚDO do ENTREGA.md no lugar. Se ele já é o novo, o ponto de commit
  # passou e o registro está efetivado (o anterior ainda `ativa` é resíduo que
  # o --registrar completa); senão, o artefato novo sai e nada fica.
  if [ "$ARTEFATO_NOVO" = 1 ] && [ -n "$DESTINO" ]; then
    if [ -n "$ENTREGA_NOVO" ] && [ -f "$ENTREGA_NOVO" ] && cmp -s "$ENTREGA" "$ENTREGA_NOVO"; then : # guarda:JANELA
    else rm -f "$DESTINO"; fi
    rm -f "$DESTINO.tmp.$$"
  fi
  [ -z "$TMP_ANT" ] || rm -f "$TMP_ANT"
  [ -z "$TMP_ENTREGA" ] || rm -f "$TMP_ENTREGA"
  [ -z "$TMP_DIR" ] || rm -rf "$TMP_DIR"
  if [ "$LIBERAR_NA_SAIDA" = 1 ] && [ -n "$TOKEN" ]; then
    liberar "$TOKEN" >/dev/null 2>&1
  fi
  exit "$rc"
}
trap 'encerrar $?' EXIT

# para <rc> <motivo> — encerra sem gravar nada.
para() {
  printf 'reconciliacao-base: %s\n' "$2" >&2
  exit "$1"
}

# ---------------------------------------------------------------------------
# Falhas, nos dois modos. O registro para na primeira falha dura e relata
# todas as reprovações de prova no stderr; a verificação acumula cada falha
# como `motivo<TAB><código><TAB><detalhe>` e segue para a reconciliação
# seguinte. Uma implementação de prova, dois modos.
# ---------------------------------------------------------------------------
PREFIXO=""   # (verificar) o artefato em exame, à frente de cada detalhe
MOTIVOS=""   # (verificar) arquivo com as linhas `motivo`
FALHA_5=0    # (verificar) houve falha de contrato
FALHA_4=0    # (verificar) houve falha de prova, estrutura ou cobertura
ENTREGA_D="" # cópia do ENTREGA.md do disco (contexto e lista da cadeia)
CAD_N=0      # número de artefatos da cadeia lida do disco
N_MOT5=0     # (verificar) quantas falhas de contrato
N_MOT4=0     # (verificar) quantas falhas de prova, estrutura ou cobertura
# O resíduo de um registro interrompido depois do ponto de commit, contado
# pela ESTRUTURA da cadeia (nunca pelo texto de um motivo, que pode ecoar
# valores do artefato): RESIDUO_N falhas de contrato que são resíduo (a
# penúltima com `estado: ativa` e as sobras não rastreadas), e RESIDUO_PENULT
# a posição da reconciliação ainda `ativa` seguida de outra.
RESIDUO_N=0
RESIDUO_PENULT=0
INTERROMPIDO='registro interrompido: rode --registrar de novo com o mesmo --merge/M'

# sobra_superada <nome> — RECONCILIACAO-BASE-NNN.md.superada.<pid numérico>:
# o anterior `superada` preparado por um registro interrompido depois do
# ponto de commit
sobra_superada() {
  case "$1" in RECONCILIACAO-BASE-[0-9][0-9][0-9].md.superada.[0-9]*) ;; *) return 1 ;; esac
  case "${1##*.superada.}" in *[!0-9]*) return 1 ;; esac # guarda:SOBRA
  return 0
}

# sobra_valida <pasta> <nome> — a sobra (nome já casado por sobra_superada) é
# um arquivo regular (nunca diretório, link simbólico ou outro tipo) e o
# prefixo é exatamente o nome de um artefato da cadeia na pasta. Senão define
# SOBRA_ERRO e devolve 1: não é resíduo, e nada a remove sozinho.
SOBRA_ERRO=""
sobra_valida() {
  local arq="$1/$2" pre="${2%.superada.*}"
  if [ ! -f "$arq" ] || [ -L "$arq" ]; then SOBRA_ERRO="sobra inválida: $2; remova-a"; return 1; fi # guarda:SOBRA
  if [ ! -e "$1/$pre" ] && [ ! -L "$1/$pre" ]; then # guarda:SOBRA
    SOBRA_ERRO="sobra sem artefato na cadeia: $2; remova-a"; return 1
  fi
  return 0
}

# motivo <rc> <código> <detalhe> — (verificar) acumula uma falha
motivo() {
  printf 'motivo\t%s\t%s\n' "$2" "$(printf '%s%s' "$PREFIXO" "$3" | tr '\t\n\r' '   ')" >> "$MOTIVOS"
  if [ "$1" = 5 ]; then FALHA_5=1; N_MOT5=$((N_MOT5 + 1)); else FALHA_4=1; N_MOT4=$((N_MOT4 + 1)); fi
}

# falha_dura <rc> <código> <mensagem> — falha que impede seguir com a
# reconciliação em exame: o registro encerra; a verificação acumula o motivo,
# e quem chamou devolve 1.
falha_dura() {
  [ "$MODO" = verificar ] || para "$1" "$3"
  motivo "$1" "$2" "$3"
}

# Condição estrutural reprovada: as provas não são calculáveis sobre ela.
estrutura() { falha_dura 4 estrutura "estrutura[$1]: $2"; }

FALHAS=0
reprova() { # <mensagem> [código]
  if [ "$MODO" = verificar ]; then motivo 4 "${2:-prova}" "$1"
  else printf 'reconciliacao-base: %s\n' "$1" >&2; fi
  FALHAS=$((FALHAS + 1))
}

# ---------------------------------------------------------------------------
# Escrita do ENTREGA.md (spec, seção 11). Só mexem em chave de TOPO do
# frontmatter; o corpo depois do `---` de fechamento é copiado byte a byte.
# Trabalham sempre numa cópia (nunca no ENTREGA.md do repositório).
# ---------------------------------------------------------------------------
ENTREGA_ERRO=""

# _entrega_fecha <arquivo> — número da linha do `---` de fechamento
_entrega_fecha() {
  awk '
    NR == 1 { if ($0 !~ /^---[ \t]*\r?$/) exit 1; next }
    /^---[ \t]*\r?$/ { print NR; achou = 1; exit }
    END { exit !achou }
  ' "$1"
}

# _entrega_troca <arquivo> <chave> <texto> — o texto (uma ou mais linhas,
# inclusive a da própria chave) substitui a chave de topo e as linhas de
# continuação dela (indentadas ou `- `); chave ausente: entra antes do `---`
# de fechamento. Chave de topo repetida é recusada. Linha aninhada com o mesmo
# nome não conta: só a coluna 0.
_entrega_troca() {
  local arq="$1" chave="$2" texto="$3" n fm novo
  ENTREGA_ERRO=""
  n="$(_entrega_fecha "$arq")" || { ENTREGA_ERRO="frontmatter ausente ou sem fechamento"; return 1; }
  fm="$arq.fm.$$"; novo="$arq.novo.$$"
  head -n "$n" "$arq" | NOVO="$texto" CHAVE="$chave" awk '
    BEGIN { chave = ENVIRON["CHAVE"]; texto = ENVIRON["NOVO"]; estado = 0 }
    function emite(   i, m, linhas) {
      m = split(texto, linhas, "\n")
      for (i = 1; i <= m; i++) print linhas[i] cr
    }
    NR == 1 { cr = ($0 ~ /\r$/) ? "\r" : ""; print; estado = 1; next }
    estado == 1 && /^---[ \t]*\r?$/ { if (!feito) { emite(); feito = 1 } estado = 2; print; next }
    estado == 1 {
      # chave de topo entre aspas: não é reconhecida como a chave, e inserir
      # outra duplicaria a chave no YAML
      if ($0 ~ /^["\047]/) {
        q = $0; sub(/^["\047]/, "", q); sub(/["\047].*/, "", q)
        if (q == chave) { erro = 1; exit 6 }
      }
      # o bloco de uma chave (como em sequencia-de-commits.sh) só termina na
      # próxima chave de topo ou no fechamento; linha vazia, comentário e linha
      # indentada ou `- ` no meio pertencem a ele
      if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*:/) {
        pula = 0
        if (index($0, chave ":") == 1) {
          if (feito) { erro = 1; exit 4 }
          emite(); feito = 1; pula = 1; next
        }
        print; next
      }
      if (pula) {
        if ($0 ~ /^[ \t]/ || $0 ~ /^#/ || $0 ~ /^[ \t]*\r?$/ || $0 ~ /^-([ \t]|\r?$)/) next
        erro = 1; exit 7
      }
      print; next
    }
    END { if (!erro && estado != 2) exit 5 }
  ' > "$fm"
  case $? in
    0) ;;
    4) rm -f "$fm"; ENTREGA_ERRO="chave de topo repetida: $chave"; return 1 ;;
    6) rm -f "$fm"; ENTREGA_ERRO="chave de topo entre aspas: $chave"; return 1 ;;
    7) rm -f "$fm"; ENTREGA_ERRO="o bloco de $chave tem linha que não se reconhece com segurança"; return 1 ;;
    *) rm -f "$fm"; ENTREGA_ERRO="não foi possível reescrever $chave"; return 1 ;;
  esac
  { cat "$fm"; tail -n "+$((n + 1))" "$arq"; } > "$novo" 2>/dev/null \
    && cat "$novo" > "$arq" 2>/dev/null \
    || { rm -f "$fm" "$novo"; ENTREGA_ERRO="não foi possível gravar $chave"; return 1; }
  rm -f "$fm" "$novo"
}

# entrega_define <arquivo> <chave> <valor>
entrega_define() {
  case "$2" in ''|*[!a-z0-9_]*) ENTREGA_ERRO="chave inválida: $2"; return 1 ;; esac
  case "$3" in *"$NL"*) ENTREGA_ERRO="valor com quebra de linha: $2"; return 1 ;; esac
  _entrega_troca "$1" "$2" "$2: $3"
}

# entrega_reconciliacoes <arquivo> <tsv> — o bloco inteiro da lista. O tsv tem
# `numero<TAB>arquivo<TAB>b1_sha<TAB>m_sha` por linha; vazio grava `[]`.
entrega_reconciliacoes() {
  local texto
  if [ -s "$2" ]; then
    texto="$(awk -F'\t' 'BEGIN { print "reconciliacoes:" }
      NF != 4 { exit 1 }
      { printf "  - numero: %s\n    arquivo: %s\n    b1_sha: %s\n    m_sha: %s\n", $1, $2, $3, $4 }' "$2")" \
      || { ENTREGA_ERRO="reconciliacoes: o tsv exige quatro colunas"; return 1; }
  else
    texto='reconciliacoes: []'
  fi
  _entrega_troca "$1" reconciliacoes "$texto"
}

# _entrega_tem <arquivo> <chave> — a chave de topo existe no frontmatter
_entrega_tem() {
  awk -v c="$2" '
    NR == 1 { next }
    /^---[ \t]*\r?$/ { exit }
    index($0, c ":") == 1 { achou = 1; exit }
    END { exit !achou }
  ' "$1"
}

# entrega_lista_reconciliacoes <arquivo> — a lista `reconciliacoes` do
# frontmatter, na forma que entrega_reconciliacoes grava, como
# `numero<TAB>arquivo<TAB>b1_sha<TAB>m_sha` por item (nada para `[]` ou chave
# ausente). Qualquer outra forma: rc 1.
entrega_lista_reconciliacoes() {
  awk '
    function fecha() {
      if (!item) return
      if (!("arquivo" in it) || !("b1_sha" in it) || !("m_sha" in it)) bad = 1
      print n "\t" it["arquivo"] "\t" it["b1_sha"] "\t" it["m_sha"]
      split("", it); item = 0
    }
    { sub(/\r$/, "") }
    NR == 1 { if ($0 !~ /^---[ \t]*$/) { bad = 1; exit } next }
    /^---[ \t]*$/ { fechou = 1; exit }
    /^[A-Za-z_][A-Za-z0-9_]*:/ {
      if (em) { fecha(); em = 0 }
      if ($0 !~ /^reconciliacoes:/) next
      if (visto) { bad = 1; exit }
      visto = 1
      v = $0; sub(/^reconciliacoes:[ \t]*/, "", v); sub(/[ \t]+$/, "", v)
      if (v == "[]") next
      if (v != "") { bad = 1; exit }
      em = 1; next
    }
    em && /^  - numero: [^ \t]+[ \t]*$/ { fecha(); n = $0; sub(/^  - numero: /, "", n); sub(/[ \t]+$/, "", n); item = 1; next }
    em && item && /^    (arquivo|b1_sha|m_sha): [^ \t]+[ \t]*$/ {
      k = $0; sub(/^    /, "", k); v = k; sub(/:.*/, "", k); sub(/^[^:]*: /, "", v); sub(/[ \t]+$/, "", v)
      if (k in it) { bad = 1; exit }
      it[k] = v; next
    }
    em { bad = 1; exit }
    END { if (em) fecha(); if (bad || !fechou) exit 1 }
  ' "$1"
}

# ---------------------------------------------------------------------------
# Funções de prova (seções 5 e 6), comuns aos dois modos. Nada que esteja só
# no disco entra numa prova: o ENTREGA.md e a pasta do trabalho (plano e
# catálogo) são lidos da árvore de M.
# ---------------------------------------------------------------------------

contem() { grep -Fxq -e "$2" "$1"; }

# modo_em <commit> <caminho> — o modo do caminho na árvore do commit (vazio se ausente)
modo_em() { g ls-tree -z "$1" -- "$2" 2>/dev/null | tr '\0' '\n' | sed -n '1s/ .*//p'; }

# le_entrega_m <M> <destino> — o ENTREGA.md de M em <destino>, com o contexto
# explícito (kind, trabalho, origem) igual ao registrado.
le_entrega_m() {
  local m="$1" dest="$2" modo
  modo="$(modo_em "$m" "$ENTREGA")"
  [ -n "$modo" ] || { falha_dura 5 entrega "$ENTREGA ausente no commit M $m"; return 1; }
  case "$modo" in 100644|100755) ;; *) falha_dura 5 entrega "$ENTREGA não é arquivo regular em M (modo $modo)"; return 1 ;; esac
  g cat-file blob "$m:$ENTREGA" > "$dest" 2>/dev/null || { falha_dura 5 entrega "$ENTREGA ilegível em M"; return 1; }
  [ "$(catalogo_fm "$dest" kind)" = entrega ] || { falha_dura 5 entrega "$ENTREGA não declara kind: entrega"; return 1; }
  [ "$(catalogo_fm "$dest" trabalho_id)" = "$TRABALHO" ] || { falha_dura 5 entrega 'trabalho explícito diverge de ENTREGA.trabalho_id'; return 1; }
  [ "$(catalogo_fm "$dest" expx_tool)" = "$ORIGEM" ] || { falha_dura 5 entrega 'origem explícita diverge de ENTREGA.expx_tool'; return 1; }
}

# materializa_m <M> <dir> — a árvore de M materializada em <dir> só no
# necessário para resolver a pasta do trabalho e ler o plano: as três pastas
# candidatas, blob por blob. Link simbólico ou submódulo dentro delas: o plano
# não é lido (rc 5). Define RAIZ_M (físico) e PASTA (resolvida em M).
materializa_m() {
  # a materialização e as guardas (# guarda:P3) moram em reconciliacao-arvore.sh,
  # comuns ao portao-v9.sh; sem subshell, para ler ARVORE_*
  arvore_materializa "$1" "$2" "$ORIGEM" "$TRABALHO" M 'prova 3: ' \
    || { falha_dura "$ARVORE_RC" "$ARVORE_COD" "$ARVORE_ERRO"; return 1; }
  PASTA="$ARVORE_PASTA"
  RAIZ_M="$ARVORE_RAIZ"
}

# estrutura_m <M> <B0> <ref> — as condições estruturais (seção 5) que valem
# para M em qualquer momento; <ref> dá a linha de primeiro pai. Define P1 e B1.
# (A ponta da ref de base é condição do momento do registro: fica nele.) São
# duas metades: o registro confere a ordem da cadeia entre elas.
estrutura_m() { estrutura_pais "$1" "$2" "$3" && estrutura_resto "$1" "$2"; }

# estrutura_pais <M> <B0> <ref> — B0 é commit; M tem dois pais (P1, B1) e está
# na linha de primeiro pai de <ref>.
estrutura_pais() {
  local m="$1" b0="$2" ref="$3" pais npais
  g cat-file -e "$b0^{commit}" 2>/dev/null || { estrutura b0 "B0 $b0 não é commit deste repositório"; return 1; }
  pais="$(g rev-list --parents -n1 "$m" 2>/dev/null)" || { estrutura m "pais de M ilegíveis"; return 1; }
  npais=$(( $(printf '%s\n' "$pais" | wc -w) - 1 ))
  [ "$npais" = 2 ] || { estrutura pais "M $m tem $npais pai(s); o commit de integração tem exatamente dois"; return 1; } # guarda:EST
  P1="$(g rev-parse --verify -q "$m^1")" || { estrutura m 'M^1 ilegível'; return 1; }
  B1="$(g rev-parse --verify -q "$m^2")" || { estrutura m 'M^2 ilegível'; return 1; }
  g rev-list --first-parent "$ref" > "$TMP_DIR/primeiro-pai" 2>/dev/null || { estrutura primeiro_pai "linha de primeiro pai de $ref ilegível"; return 1; }
  grep -Fxq -e "$m" "$TMP_DIR/primeiro-pai" || { estrutura primeiro_pai "M $m fora da linha de primeiro pai de $ref"; return 1; } # guarda:EST
}

# estrutura_resto <M> <B0> — contrato de integração, ancestralidade de B0 e o
# ENTREGA.md intocado pelo merge (P1 e B1 já definidos por estrutura_pais).
estrutura_resto() {
  local m="$1" b0="$2"
  bash "$CONTRATO_SH" --validar-integracao --trabalho "$TRABALHO" --commit "$m" >/dev/null 2>"$TMP_DIR/contrato.err" || { estrutura contrato "mensagem de M fora do contrato de integração: $(tr '\n' ' ' < "$TMP_DIR/contrato.err")"; return 1; } # guarda:EST
  g merge-base --is-ancestor "$b0" "$B1" 2>/dev/null || { estrutura b0_b1 "B0 $b0 não é ancestral de B1 $B1"; return 1; } # guarda:EST
  g merge-base --is-ancestor "$b0" "$P1" 2>/dev/null || { estrutura b0_p1 "B0 $b0 não é ancestral de P1 $P1"; return 1; } # guarda:EST
  # o merge de integração não mexe no ENTREGA.md: o de M é o de P1 (modo e blob)
  [ "$(modo_em "$m" "$ENTREGA") $(g rev-parse --verify -q "$m:$ENTREGA" 2>/dev/null)" = "$(modo_em "$P1" "$ENTREGA") $(g rev-parse --verify -q "$P1:$ENTREGA" 2>/dev/null)" ] || { estrutura entrega "o merge M $m alterou $ENTREGA (difere de P1 $P1)"; return 1; } # guarda:EST
}

# uniao_e_catalogo <raiz-de-M> <pasta> — união das tasks e catálogo de método
# (prova 3 e inventário) em $UNIAO e $CATALOGO, sobre a árvore de M.
uniao_e_catalogo() {
  bash "$OWNERSHIP_SH" --uniao "$1" "$ORIGEM" "$TRABALHO" > "$UNIAO" 2>"$TMP_DIR/uniao.err" || { falha_dura 4 prova "prova 3: união das tasks não calculável: $(tr '\n' ' ' < "$TMP_DIR/uniao.err")"; return 1; } # guarda:P3
  catalogo_metodo "$1" "$ORIGEM" "$TRABALHO" "$2" e8 > "$CATALOGO" || { falha_dura 4 prova "prova 3: catálogo de método não calculável: $CATALOGO_ERRO"; return 1; } # guarda:P3
}

# provas <lista> <B0> <início> <P1> <B1> <M> — as quatro provas, para cada
# caminho da lista (seção 6). Todas são calculadas e todas as reprovações são
# relatadas; nenhuma falha de cálculo vira aprovação.
provas() {
  local lista="$1" b0="$2" inicio="$3" p1="$4" b1="$5" m="$6" f tb tm st rc_p4
  while IFS= read -r f <&3; do
    # o caminho é de arquivo (blob), nunca de diretório nem submódulo
    case "$f" in */) reprova "arquivo: $f: caminho com barra final não é arquivo"; continue ;; esac # guarda:BLOB
    tb="$(g cat-file -t "$b1:$f" 2>/dev/null)"; tm="$(g cat-file -t "$m:$f" 2>/dev/null)"
    { [ -z "$tb" ] || [ "$tb" = blob ]; } && { [ -z "$tm" ] || [ "$tm" = blob ]; } || reprova "arquivo: $f: não é arquivo (blob) em B1 (${tb:--}) ou em M (${tm:--})" # guarda:BLOB

    # prova 1: f nasceu ou mudou na base entre B0 e B1
    if g diff --no-renames --ignore-submodules=none --name-status -z "$b0" "$b1" -- "$f" > "$SAIDA" 2>/dev/null; then # guarda:SUB
      st="$(tr '\0' '\n' < "$SAIDA" | sed -n 1p)"
      [ -n "$st" ] || reprova "prova 1: $f: a base não criou nem alterou o caminho entre B0 e B1" # guarda:P1
      [ "$st" != D ] || reprova "prova 1: $f: a base removeu o caminho (status D); ressurreição não é ajuste" # guarda:P1D
      case "$st" in A|M|D|'') ;; *) reprova "prova 1: $f: status $st na base fora de A|M (mudança de tipo também reprova)" ;; esac # guarda:P1T
    else
      reprova "prova 1: $f: diff B0..B1 não calculável"
    fi

    # prova 2: a feature não tocou f antes do merge
    if g rev-list --first-parent "$p1" "^$inicio" -- "$f" > "$SAIDA" 2>/dev/null; then # guarda:P2FP
      [ ! -s "$SAIDA" ] || reprova "prova 2: $f: a feature tocou o caminho antes do merge ($(sed -n 1p "$SAIDA"))"
    else
      reprova "prova 2: $f: histórico da feature não calculável"
    fi

    # prova 3: f não consta das tasks nem é artefato de método
    if contem "$UNIAO" "$f" || contem "$CATALOGO" "$f"; then reprova "prova 3: $f: declarado em task ou artefato de método"; fi # guarda:P3

    # prova 4: diferença real entre B1 e M, com f presente em M
    g cat-file -e "$m:$f" 2>/dev/null || reprova "prova 4: $f: ausente em M (a integração removeu o caminho)" # guarda:P4
    g diff --quiet --no-renames --ignore-submodules=none "$b1" "$m" -- "$f" >/dev/null 2>&1; rc_p4=$? # guarda:SUB
    [ "$rc_p4" = 1 ] || reprova "prova 4: $f: sem diferença entre B1 e M (ou diff não calculável, rc=$rc_p4)" # guarda:P4
  done 3< "$lista"
}

# herdado_da_cadeia <B0> <B1> <M> <caminho> <anteriores> — o caminho, de uma
# reconciliação anterior, foi só herdado por este merge: a base não o tocou
# entre B0 e B1 (erro do git não aprova) e M tem exatamente o blob_m e o modo
# (o do m_sha) da reconciliação anterior mais recente que o lista.
# <anteriores>: `caminho<TAB>blob_m<TAB>m_sha` (a mais recente por caminho).
herdado_da_cadeia() {
  local b0="$1" b1="$2" m="$3" p="$4" bm mant
  bm="$(P="$p" awk -F'\t' '$1 == ENVIRON["P"] { b = $2 } END { print b }' "$5")"
  mant="$(P="$p" awk -F'\t' '$1 == ENVIRON["P"] { c = $3 } END { print c }' "$5")"
  { [ -n "$bm" ] && [ -n "$mant" ]; } || return 1
  g diff --quiet --no-renames --ignore-submodules=none "$b0" "$b1" -- "$p" >/dev/null 2>&1 || return 1 # guarda:INV
  { [ "$(g cat-file -t "$m:$p" 2>/dev/null)" = blob ] && [ "$(g rev-parse --verify -q "$m:$p" 2>/dev/null)" = "$bm" ]; } || return 1 # guarda:INV
  [ "$(modo_em "$m" "$p")" = "$(modo_em "$mant" "$p")" ] || return 1 # guarda:INV
}

# anteriores_da_cadeia <cobertura> — `caminho<TAB>blob_m<TAB>m_sha` da
# reconciliação mais recente (a última linha) que lista cada caminho.
anteriores_da_cadeia() {
  awk -F'\t' '{ u[$1] = $3 "\t" $4 } END { for (p in u) print p "\t" u[p] }' "$1"
}

# artefato_da_entrega <caminho> — um RECONCILIACAO-BASE-NNN.md da própria
# entrega (commitado pelo checkpoint reconciliacao-base antes do merge
# seguinte); é artefato de método, não produto.
artefato_da_entrega() {
  case "$1" in "docs/entregas/$TRABALHO/"RECONCILIACAO-BASE-[0-9][0-9][0-9].md) return 0 ;; esac
  return 1
}

# inventario <B0> <B1> <M> <lista> <anteriores> — todo caminho que o merge
# alterou em relação a B1 está na união, no catálogo, na lista, é artefato de
# reconciliação da entrega, ou foi só herdado de uma reconciliação anterior da
# cadeia (herdado_da_cadeia). Fora disso, tem de estar na lista e passar nas
# quatro provas. Não existe registro parcial.
inventario() {
  local b0="$1" b1="$2" m="$3" lista="$4" anteriores="$5" p
  g diff --name-only -z --no-renames --ignore-submodules=none "$b1" "$m" > "$INVENTARIO" 2>/dev/null \
    || { falha_dura 4 inventario 'inventário: diff B1..M não calculável'; return 1; } # guarda:SUB
  while IFS= read -r -d '' p <&3; do
    case "$p" in *"$NL"*) reprova "inventário: caminho com quebra de linha alterado pelo merge" inventario; continue ;; esac
    # submódulo (gitlink) alterado pelo merge e não declarado em task: nunca é
    # catálogo, artefato, herdado nem reconciliável
    if [ "$(modo_em "$m" "$p")" = 160000 ] || [ "$(modo_em "$b1" "$p")" = 160000 ]; then
      contem "$UNIAO" "$p" || reprova "inventário: $p: submódulo (gitlink) alterado pelo merge e não declarado em task" inventario # guarda:SUB
      continue
    fi
    contem "$UNIAO" "$p" || contem "$CATALOGO" "$p" || contem "$lista" "$p" || artefato_da_entrega "$p" || herdado_da_cadeia "$b0" "$b1" "$m" "$p" "$anteriores" || reprova "inventário: $p: alterado pelo merge e não declarado" inventario # guarda:INV
  done 3< "$INVENTARIO"
}

# campos_caminho <B0> <B1> <M> <caminho> — os campos do artefato para o
# caminho, do Git: CAMPO_ST (status B0..B1), CAMPO_BB, CAMPO_BM, CAMPO_DS.
# Todos são calculados; o que não se calcula fica vazio, e CAMPO_ERRO guarda o
# primeiro problema (rc 1).
campos_caminho() {
  local b0="$1" b1="$2" m="$3" f="$4"
  CAMPO_ERRO=""
  CAMPO_ST="$(g diff --no-renames --ignore-submodules=none --name-status -z "$b0" "$b1" -- "$f" 2>/dev/null | tr '\0' '\n' | sed -n 1p)"
  case "$CAMPO_ST" in A|M) ;; *) CAMPO_ERRO="status de $f mudou durante o registro" ;; esac
  CAMPO_BB="$(g rev-parse --verify -q "$b1:$f" 2>/dev/null)" || { CAMPO_BB=""; [ -n "$CAMPO_ERRO" ] || CAMPO_ERRO="blob de $f em B1 ilegível"; }
  CAMPO_BM="$(g rev-parse --verify -q "$m:$f" 2>/dev/null)" || { CAMPO_BM=""; [ -n "$CAMPO_ERRO" ] || CAMPO_ERRO="blob de $f em M ilegível"; }
  RB_ERRO=""
  if rb_diff_sha "$b1" "$m" "$f" > "$SAIDA"; then CAMPO_DS="$(cat "$SAIDA")"
  else CAMPO_DS=""; [ -n "$CAMPO_ERRO" ] || CAMPO_ERRO="$RB_ERRO"; fi
  [ -z "$CAMPO_ERRO" ]
}

# ---------------------------------------------------------------------------
# Base legada (spec, seção 14), comum aos dois modos: o registro do 001 infere
# B0 com estas funções, e a verificação as recalcula sobre o p1_sha e o b1_sha
# do 001. Tudo do Git: o ENTREGA.md lido é sempre o de P1.
# ---------------------------------------------------------------------------
LEG_ERRO=""
LEG_MB=""

# _entrega_chave_qualquer <arquivo> <chave> — reconciliacao-arvore.sh: a chave
# de topo aparece no frontmatter em qualquer forma.

# legado_entrega <ENTREGA.md de P1> <P1> — a entrega em P1 é legada: sem
# base_validada_sha, sem origem_base (o E0 grava as duas juntas) e sem nenhum
# RECONCILIACAO-BASE da entrega no histórico de P1 (base já validada uma vez
# nunca é inferida de novo). Falha: LEG_ERRO e rc 1.
legado_entrega() {
  LEG_ERRO=""
  if _entrega_chave_qualquer "$1" base_validada_sha; then LEG_ERRO="o ENTREGA.md em P1 já tem base_validada_sha: a base não é inferida"; return 1; fi # guarda:LEGE
  if _entrega_chave_qualquer "$1" origem_base; then LEG_ERRO="o ENTREGA.md em P1 tem origem_base sem base_validada_sha: a base não é inferida"; return 1; fi # guarda:LEGE
  g log -m --format= --name-only --no-renames "$2" -- "docs/entregas/$TRABALHO" > "$TMP_DIR/legado-historico" 2>/dev/null \
    || { LEG_ERRO="histórico de P1 ilegível: a base não é inferida"; return 1; }
  if P="docs/entregas/$TRABALHO/RECONCILIACAO-BASE-" awk 'index($0, ENVIRON["P"]) == 1 { f = 1 } END { exit !f }' "$TMP_DIR/legado-historico"; then
    LEG_ERRO="já houve RECONCILIACAO-BASE no histórico de P1: a base não é inferida de novo"; return 1 # guarda:LEGE
  fi
}

# legado_base <P1> <B1> — B0 = o merge-base de P1 e B1, só quando ele é único,
# a linha de primeiro pai de P1 desde ele não tem merge e ele é ancestral de
# B1. Define LEG_MB; base ambígua ou incalculável: LEG_ERRO e rc 1.
legado_base() {
  local p1="$1" b1="$2" n mg
  LEG_MB=""; LEG_ERRO=""
  g merge-base --all "$p1" "$b1" > "$TMP_DIR/legado-mb" 2>/dev/null \
    || { LEG_ERRO="nenhum merge-base calculável entre P1 $p1 e B1 $b1"; return 1; }
  n="$(grep -c . "$TMP_DIR/legado-mb")"
  [ "$n" = 1 ] || { LEG_ERRO="$n merge-bases entre P1 $p1 e B1 $b1 (a inferência exige exatamente um)"; return 1; } # guarda:LEG2
  mg="$(sed -n 1p "$TMP_DIR/legado-mb")"
  grep -Eq '^[0-9a-f]{40}$' <<<"$mg" || { LEG_ERRO="merge-base de P1 e B1 fora de 40 hex: $mg"; return 1; }
  g rev-list --first-parent --merges "$p1" "^$mg" > "$TMP_DIR/legado-merges" 2>/dev/null \
    || { LEG_ERRO="linha de primeiro pai de P1 ilegível"; return 1; }
  [ ! -s "$TMP_DIR/legado-merges" ] || { LEG_ERRO="a linha de primeiro pai de P1 desde o merge-base $mg contém o merge $(sed -n 1p "$TMP_DIR/legado-merges")"; return 1; } # guarda:LEG3
  g merge-base --is-ancestor "$mg" "$b1" 2>/dev/null || { LEG_ERRO="o merge-base $mg não é ancestral de B1 $b1"; return 1; } # guarda:LEG4
  LEG_MB="$mg"
}

# ---------------------------------------------------------------------------
# --verificar
# ---------------------------------------------------------------------------

# _r <índice> <chave> — escalar do artefato lido
_r() { awk -F'\t' -v k="$2" '$1 == "escalar" && $2 == k { print $3; exit }' "$TMP_DIR/r$1.lido"; }

verificar() {
  MOTIVOS="$TMP_DIR/motivos"; : > "$MOTIVOS"
  # nem o refresh oportunista do índice: a verificação não grava nada
  export GIT_OPTIONAL_LOCKS=0

  # história cortada não prova nada: o raso para antes de qualquer prova
  if ! arvore_recusa_raso; then # guarda:EST
    estrutura raso "$ARVORE_ERRO"
    printf 'ok=false\n'
    cat "$MOTIVOS"
    return 4
  fi

  # O ENTREGA.md do disco: contexto e a lista de reconciliações.
  ENTREGA_D=""
  if [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cat "$ENTREGA" > "$TMP_DIR/entrega-disco.md" 2>/dev/null; then
    ENTREGA_D="$TMP_DIR/entrega-disco.md"
    [ "$(catalogo_fm "$ENTREGA_D" kind)" = entrega ] || motivo 5 entrega "$ENTREGA não declara kind: entrega"
    [ "$(catalogo_fm "$ENTREGA_D" trabalho_id)" = "$TRABALHO" ] || motivo 5 entrega 'trabalho explícito diverge de ENTREGA.trabalho_id'
    [ "$(catalogo_fm "$ENTREGA_D" expx_tool)" = "$ORIGEM" ] || motivo 5 entrega 'origem explícita diverge de ENTREGA.expx_tool'
    if ! entrega_lista_reconciliacoes "$ENTREGA_D" > "$TMP_DIR/lista-entrega" 2>/dev/null; then
      motivo 5 entrega "$ENTREGA: reconciliacoes fora da forma {numero, arquivo, b1_sha, m_sha}"
      ENTREGA_D=""
    fi
  else
    motivo 5 entrega "$ENTREGA ausente ou não é arquivo regular"
  fi

  cadeia_le
  cadeia_provas
  [ -z "$ENTREGA_D" ] || cadeia_coerencia
  cadeia_cobertura
  [ "$CHECKPOINT" != reconciliacao-base ] || cadeia_persistida

  if [ "$FALHA_5" = 1 ] || [ "$FALHA_4" = 1 ]; then
    printf 'ok=false\n'
    cat "$MOTIVOS"
    [ "$FALHA_5" = 1 ] && return 5
    return 4
  fi
  printf 'ok=true\n'
  LC_ALL=C sort "$TMP_DIR/cobertos"
  return 0
}

# cadeia_le — os artefatos da pasta da entrega, do disco, em ordem de byte:
# nome no padrão (fora dele, inclusive sobra de gravação, é contrato
# inválido), numeração contínua a partir de 001, schema e assinatura. Define
# CAD_N e, por posição i: $TMP_DIR/nome<i>, $TMP_DIR/r<i>.lido (só se válido)
# e $TMP_DIR/lista<i>.
cadeia_le() {
  local dir="docs/entregas/$TRABALHO" nome arq n num
  : > "$TMP_DIR/artefatos"
  for arq in "$dir"/RECONCILIACAO-BASE-*; do
    [ -e "$arq" ] || [ -L "$arq" ] || continue
    nome="${arq##*/}"
    if sobra_superada "$nome"; then
      PREFIXO="$nome: "
      if g ls-files --error-unmatch -- "$arq" >/dev/null 2>&1; then
        # rastreada: não é resíduo, e nada a remove sozinho
        motivo 5 contrato "sobra rastreada: $nome; remova-a com um commit" # guarda:SOBRA
      elif ! sobra_valida "$dir" "$nome"; then
        # diretório, link, outro tipo ou prefixo fora da cadeia: não é resíduo
        motivo 5 contrato "$SOBRA_ERRO" # guarda:SOBRA
      else
        motivo 5 contrato "sobra de registro interrompido (o anterior superada preparado e não trocado); com a penúltima ainda ativa, $INTERROMPIDO; senão, remova-a"
        RESIDUO_N=$((RESIDUO_N + 1))
      fi
      PREFIXO=""; continue
    fi
    case "$nome" in
      RECONCILIACAO-BASE-[0-9][0-9][0-9].md) printf '%s\n' "$nome" >> "$TMP_DIR/artefatos" ;;
      *) PREFIXO="$nome: "; motivo 5 contrato "nome fora do padrão RECONCILIACAO-BASE-NNN.md"; PREFIXO="" ;;
    esac
  done
  LC_ALL=C sort -o "$TMP_DIR/artefatos" "$TMP_DIR/artefatos"

  # Schema e assinatura de cada um; numeração contínua a partir de 001.
  n=0
  while IFS= read -r nome <&3; do
    n=$((n + 1)); PREFIXO="$nome: "
    printf '%s\n' "$nome" > "$TMP_DIR/nome$n"
    [ "$nome" = "$(printf 'RECONCILIACAO-BASE-%03d.md' "$n")" ] \
      || motivo 5 numeracao "numeração com lacuna: na posição $n esperava $(printf 'RECONCILIACAO-BASE-%03d.md' "$n")"
    arq="$dir/$nome"
    if [ ! -f "$arq" ] || [ -L "$arq" ]; then motivo 5 contrato "não é arquivo regular"; continue; fi
    num="$(printf '%s' "$nome" | sed 's/^RECONCILIACAO-BASE-0*\([0-9][0-9]*\)\.md$/\1/')"
    RB_ERRO=""
    rb_validar "$arq" "$TRABALHO" "$num" || { motivo 5 contrato "$RB_ERRO"; continue; }
    RB_ERRO=""
    rb_ler "$arq" > "$TMP_DIR/r$n.lido" || { rm -f "$TMP_DIR/r$n.lido"; motivo 5 contrato "$RB_ERRO"; continue; }
    awk -F'\t' '$1 == "arquivo" { print $2 }' "$TMP_DIR/r$n.lido" > "$TMP_DIR/lista$n"
  done 3< "$TMP_DIR/artefatos"
  PREFIXO=""
  CAD_N="$n"
}

# cadeia_provas — a cadeia lida por cadeia_le, reconciliação a reconciliação,
# com as funções do registro: contrato da cadeia, estrutura, âncora, ordem,
# quatro provas, campos recalculados e inventário. Acumula
# $TMP_DIR/cobertura (`caminho<TAB>NNN<TAB>blob_m<TAB>m_sha`, em ordem).
cadeia_provas() {
  local n="$CAD_N" i j nome nnn b0 p1 b1 m ob est ant ex br inicio prev bv lm lp f st bb bm ds
  : > "$TMP_DIR/cobertura"
  i=0
  while [ "$i" -lt "$n" ]; do
    i=$((i + 1)); j=$((i - 1))
    # os caminhos das reconciliações anteriores, com o blob_m e o m_sha da mais
    # recente que os lista (para o inventário desta: herdado_da_cadeia)
    anteriores_da_cadeia "$TMP_DIR/cobertura" > "$TMP_DIR/anteriores"
    [ -f "$TMP_DIR/r$i.lido" ] || continue
    nome="$(cat "$TMP_DIR/nome$i")"; PREFIXO="$nome: "
    nnn="$(printf '%s' "$nome" | sed 's/^RECONCILIACAO-BASE-\([0-9]*\)\.md$/\1/')"
    b0="$(_r "$i" b0_sha)"; p1="$(_r "$i" p1_sha)"; b1="$(_r "$i" b1_sha)"; m="$(_r "$i" m_sha)"
    ob="$(_r "$i" origem_base)"; est="$(_r "$i" estado)"; ant="$(_r "$i" anterior)"
    ex="$(_r "$i" expx_tool)"; br="$(_r "$i" branch)"
    awk -F'\t' -v nnn="$nnn" -v m="$m" '$1 == "arquivo" { print $2 "\t" nnn "\t" $5 "\t" m }' "$TMP_DIR/r$i.lido" >> "$TMP_DIR/cobertura"

    [ "$ex" = "$ORIGEM" ] || motivo 5 contrato "expx_tool ($ex) diverge da origem $ORIGEM"
    if [ -n "$ENTREGA_D" ]; then
      [ "$br" = "$(catalogo_fm "$ENTREGA_D" branch)" ] || motivo 5 contrato "branch ($br) diverge de ENTREGA.branch"
    fi
    if [ "$i" = "$n" ]; then
      [ "$est" = ativa ] || motivo 5 estado "a última reconciliação da cadeia tem de estar ativa (está $est)"
    elif [ "$i" = $((n - 1)) ] && [ "$est" = ativa ]; then
      # a penúltima ainda ativa: o registro da última passou do ponto de
      # commit (o ENTREGA.md já a lista) e foi interrompido antes de marcar
      # esta `superada`
      motivo 5 estado "reconciliação seguida de outra tem de estar superada (está ativa); $INTERROMPIDO"
      RESIDUO_N=$((RESIDUO_N + 1)); RESIDUO_PENULT="$i" # guarda:COMPLETA
    else
      [ "$est" = superada ] || motivo 5 estado "reconciliação seguida de outra tem de estar superada (está $est)"
    fi

    if [ "$i" = 1 ]; then
      case "$ob" in
        registrada_e0|inferida_legado) ;;
        *) motivo 5 origem_base "origem_base $ob não abre a cadeia"; continue ;;
      esac
      inicio="$b0"
    else
      [ "$ob" = reconciliacao_anterior ] || motivo 5 origem_base "origem_base $ob fora de reconciliacao_anterior"
      [ -f "$TMP_DIR/r$j.lido" ] || continue
      prev="$(cat "$TMP_DIR/nome$j")"
      [ "$ant" = "$prev" ] || motivo 5 anterior "anterior ($ant) não é $prev"
      [ "$b0" = "$(_r "$j" b1_sha)" ] || motivo 5 cadeia "b0_sha ($b0) diverge do b1_sha de $prev ($(_r "$j" b1_sha))" # guarda:CAD
      inicio="$(_r "$j" m_sha)"
    fi

    # o ENTREGA.md de M (contexto)
    le_entrega_m "$m" "$TMP_DIR/entrega-m$i.md" || continue

    # estrutura: os pais de M são os do artefato; o merge não mexeu no
    # ENTREGA.md; M na linha de primeiro pai de HEAD, depois do M anterior
    estrutura_m "$m" "$b0" HEAD || continue
    [ "$P1" = "$p1" ] || { estrutura p1 "p1_sha ($p1) não é o primeiro pai de M ($P1)"; continue; }
    [ "$B1" = "$b1" ] || { estrutura b1 "b1_sha ($b1) não é o segundo pai de M ($B1)"; continue; }

    # âncora da cadeia: o base_validada_sha do ENTREGA.md de P1 (o de antes
    # do merge), com P1 já conferido como M^1. Num 001 inferida_legado: o
    # ENTREGA.md de P1 é legado, a inferência recalculada sobre P1 e B1 passa
    # e o b0_sha é o merge-base único. Falha de âncora é contrato (rc 5):
    # P1 e B1 são commits fixos, então uma inferência ambígua agora já era
    # ambígua no registro, e o 001 que a afirma foi forjado.
    if [ "$i" = 1 ] && [ "$ob" = inferida_legado ]; then
      if ! g cat-file blob "$P1:$ENTREGA" > "$TMP_DIR/entrega-p1-$i.md" 2>/dev/null; then
        motivo 5 ancora "inferida_legado: $ENTREGA ilegível em P1"
      elif ! legado_entrega "$TMP_DIR/entrega-p1-$i.md" "$P1"; then
        motivo 5 ancora "inferida_legado: $LEG_ERRO" # guarda:LEGV
      elif ! legado_base "$P1" "$B1"; then
        motivo 5 ancora "inferida_legado: base legada indeterminável: $LEG_ERRO" # guarda:LEGV
      else
        [ "$b0" = "$LEG_MB" ] || motivo 5 ancora "inferida_legado: b0_sha ($b0) não é o merge-base único de P1 e B1 ($LEG_MB)" # guarda:LEGV
      fi
    elif [ "$i" = 1 ]; then
      g cat-file blob "$P1:$ENTREGA" > "$TMP_DIR/entrega-p1-$i.md" 2>/dev/null || : > "$TMP_DIR/entrega-p1-$i.md"
      bv="$(catalogo_fm "$TMP_DIR/entrega-p1-$i.md" base_validada_sha)"
      [ "$b0" = "$bv" ] || motivo 5 ancora "b0_sha ($b0) diverge da base_validada_sha da entrega em P1 (${bv:-ausente})" # guarda:ANCORA
    fi
    if [ "$i" -gt 1 ]; then
      lm="$(grep -Fxn -e "$m" "$TMP_DIR/primeiro-pai" | sed -n '1s/:.*//p')"
      lp="$(grep -Fxn -e "$inicio" "$TMP_DIR/primeiro-pai" | sed -n '1s/:.*//p')"
      { [ -n "$lp" ] && [ "$lm" -lt "$lp" ]; } || motivo 5 cadeia "M não é posterior ao M de $prev na linha de primeiro pai de HEAD" # guarda:CAD
    fi

    # as quatro provas, com o plano e o catálogo da árvore deste M
    materializa_m "$m" "$TMP_DIR/arvore-m$i" || continue
    uniao_e_catalogo "$RAIZ_M" "$PASTA" || continue
    provas "$TMP_DIR/lista$i" "$b0" "$inicio" "$P1" "$B1" "$m"

    # cada campo gravado é recalculado do Git
    while IFS="$TAB" read -r f st bb bm ds <&4; do
      [ -n "$f" ] || continue
      campos_caminho "$b0" "$B1" "$m" "$f"
      [ "$st" = "$CAMPO_ST" ] || motivo 4 campo "$f: status_base registrado $st, recalculado ${CAMPO_ST:-vazio}" # guarda:CAMPO
      [ "$bb" = "$CAMPO_BB" ] || motivo 4 campo "$f: blob_b1 registrado $bb, recalculado ${CAMPO_BB:-ilegível}" # guarda:CAMPO
      [ "$bm" = "$CAMPO_BM" ] || motivo 4 campo "$f: blob_m registrado $bm, recalculado ${CAMPO_BM:-ilegível}" # guarda:CAMPO
      [ "$ds" = "$CAMPO_DS" ] || motivo 4 campo "$f: diff_b1_m_sha256 registrado $ds, recalculado ${CAMPO_DS:-incalculável}" # guarda:CAMPO
    done 4<<EOF
$(awk -F'\t' '$1 == "arquivo" { print $2 "\t" $3 "\t" $4 "\t" $5 "\t" $6 }' "$TMP_DIR/r$i.lido")
EOF

    inventario "$b0" "$B1" "$m" "$TMP_DIR/lista$i" "$TMP_DIR/anteriores"
  done
  PREFIXO=""
}

# cadeia_coerencia — o ENTREGA.md do disco ($ENTREGA_D, com a lista em
# $TMP_DIR/lista-entrega) lista exatamente a cadeia, e o base_validada_sha
# dele é o b1_sha da última.
cadeia_coerencia() {
  local n="$CAD_N" j numero arquivo eb1 em idx nome bv eob ob1
  j=0
  while IFS="$TAB" read -r numero arquivo eb1 em <&3; do
    [ -n "$numero$arquivo" ] || continue
    j=$((j + 1))
    idx="$(grep -Fxn -e "$arquivo" "$TMP_DIR/artefatos" | sed -n '1s/:.*//p')"
    if [ -z "$idx" ]; then motivo 5 ausente "artefato ausente: $arquivo (listado em ENTREGA.reconciliacoes)"; continue; fi # guarda:COERENCIA
    { [ "$numero" = "$j" ] && [ "$idx" = "$j" ]; } || motivo 5 entrega "ENTREGA.reconciliacoes: o item $j ($numero, $arquivo) não segue a ordem da cadeia"
    [ -f "$TMP_DIR/r$idx.lido" ] || continue
    [ "$eb1" = "$(_r "$idx" b1_sha)" ] || motivo 5 entrega "ENTREGA.reconciliacoes: b1_sha de $arquivo diverge do artefato" # guarda:COERENCIA
    [ "$em" = "$(_r "$idx" m_sha)" ] || motivo 5 entrega "ENTREGA.reconciliacoes: m_sha de $arquivo diverge do artefato" # guarda:COERENCIA
  done 3< "$TMP_DIR/lista-entrega"
  while IFS= read -r nome <&3; do
    cut -f2 "$TMP_DIR/lista-entrega" | grep -Fx -e "$nome" >/dev/null || motivo 5 orfao "artefato órfão: $nome (fora de ENTREGA.reconciliacoes)" # guarda:COERENCIA
  done 3< "$TMP_DIR/artefatos"
  if [ "$n" -gt 0 ] && [ -f "$TMP_DIR/r$n.lido" ]; then
    bv="$(catalogo_fm "$ENTREGA_D" base_validada_sha)"
    [ "$bv" = "$(_r "$n" b1_sha)" ] || motivo 5 entrega "ENTREGA.base_validada_sha (${bv:-ausente}) não é o b1_sha da última reconciliação" # guarda:COERENCIA
  fi
  # base inferida: o ENTREGA.md e o 001 dizem a mesma origem, nos dois sentidos
  if [ "$n" -gt 0 ] && [ -f "$TMP_DIR/r1.lido" ]; then
    eob="$(catalogo_fm "$ENTREGA_D" origem_base)"; ob1="$(_r 1 origem_base)"
    if [ "$ob1" = inferida_legado ] || [ "$eob" = inferida_legado ]; then
      [ "$eob" = "$ob1" ] || motivo 5 entrega "ENTREGA.origem_base (${eob:-ausente}) diverge da origem_base do 001 ($ob1)" # guarda:LEGC
    fi
  fi
}

# cadeia_cobertura — por caminho, a reconciliação mais recente que o lista; o
# conteúdo em HEAD tem de ser o blob_m dela, com o mesmo modo que em M.
# Grava $TMP_DIR/cobertos.
cadeia_cobertura() {
  local f nnn bm mm h
  awk -F'\t' '{ if (!($1 in u)) o[++k] = $1; u[$1] = $0 } END { for (i = 1; i <= k; i++) print u[o[i]] }' \
    "$TMP_DIR/cobertura" > "$TMP_DIR/cobertura.ultima"
  : > "$TMP_DIR/cobertos"
  while IFS="$TAB" read -r f nnn bm mm <&3; do
    h="$(g rev-parse --verify -q "HEAD:$f" 2>/dev/null)" || h=""
    [ "$h" = "$bm" ] || { motivo 4 cobertura "$f: o conteúdo em HEAD (${h:-ausente}) não é o blob_m de RECONCILIACAO-BASE-$nnn.md ($bm)"; continue; } # guarda:BLOBM
    [ "$(modo_em HEAD "$f")" = "$(modo_em "$mm" "$f")" ] || { motivo 4 cobertura "$f: o modo em HEAD ($(modo_em HEAD "$f")) não é o de M em RECONCILIACAO-BASE-$nnn.md ($(modo_em "$mm" "$f"))"; continue; } # guarda:BLOBM
    printf 'coberto\t%s\t%s\n' "$f" "$nnn" >> "$TMP_DIR/cobertos"
  done 3< "$TMP_DIR/cobertura.ultima"
}

# cadeia_persistida — (--verificar --checkpoint reconciliacao-base, spec 9) o
# ENTREGA.md e todo artefato da cadeia (os do disco e os que o ENTREGA.md do
# disco lista) existem em HEAD como arquivo regular com exatamente o conteúdo
# do disco — comparado por conteúdo (`git hash-object --no-filters` contra
# `HEAD:<arquivo>`), nunca pelo índice, que assume-unchanged e skip-worktree
# enganam; e o conjunto de RECONCILIACAO-BASE-NNN.md em HEAD é o do disco e o
# que o ENTREGA.md de HEAD lista. Cada arquivo que falha, uma vez:
# `motivo<TAB>persistencia<TAB><arquivo>` (rc 5).
cadeia_persistida() {
  local f h d dir="docs/entregas/$TRABALHO"
  {
    printf '%s\n' "$ENTREGA"
    sed "s#^#$dir/#" "$TMP_DIR/artefatos"
    [ ! -f "$TMP_DIR/lista-entrega" ] || cut -f2 "$TMP_DIR/lista-entrega" | sed '/^$/d' | sed "s#^#$dir/#"
  } | awk '!visto[$0]++' > "$TMP_DIR/persistidos"
  : > "$TMP_DIR/nao-persistidos"
  while IFS= read -r f <&3; do
    h="$(g rev-parse --verify -q "HEAD:$f" 2>/dev/null)" || h=""
    d=""
    case "$(modo_em HEAD "$f")" in
      100644|100755) { [ -f "$f" ] && [ ! -L "$f" ]; } && d="$(g hash-object --no-filters -- "$f" 2>/dev/null)" ;;
    esac
    { [ -n "$h" ] && [ "$d" = "$h" ]; } || printf '%s\n' "$f" >> "$TMP_DIR/nao-persistidos" # guarda:PERSIST
  done 3< "$TMP_DIR/persistidos"
  # o conjunto de artefatos: HEAD, disco e a lista do ENTREGA.md de HEAD
  g ls-tree -z --name-only HEAD -- "$dir/" 2>/dev/null | tr '\0' '\n' | sed 's#.*/##' \
    | grep -E '^RECONCILIACAO-BASE-[0-9]{3}\.md$' | LC_ALL=C sort > "$TMP_DIR/artefatos-head"
  LC_ALL=C sort "$TMP_DIR/artefatos" > "$TMP_DIR/artefatos-disco"
  LC_ALL=C comm -3 "$TMP_DIR/artefatos-head" "$TMP_DIR/artefatos-disco" | tr -d '\t' | sed "s#^#$dir/#" >> "$TMP_DIR/nao-persistidos" # guarda:PERSET
  if g cat-file blob "HEAD:$ENTREGA" > "$TMP_DIR/entrega-head.md" 2>/dev/null \
      && entrega_lista_reconciliacoes "$TMP_DIR/entrega-head.md" > "$TMP_DIR/lista-head" 2>/dev/null; then
    cut -f2 "$TMP_DIR/lista-head" | sed '/^$/d' | LC_ALL=C sort | cmp -s - "$TMP_DIR/artefatos-disco" \
      || printf '%s\n' "$ENTREGA" >> "$TMP_DIR/nao-persistidos" # guarda:PERSET
  else
    printf '%s\n' "$ENTREGA" >> "$TMP_DIR/nao-persistidos"
  fi
  awk '!visto[$0]++' "$TMP_DIR/nao-persistidos" > "$TMP_DIR/nao-persistidos.u"
  while IFS= read -r f <&3; do
    motivo 5 persistencia "$f"
  done 3< "$TMP_DIR/nao-persistidos.u"
}

# ---------------------------------------------------------------------------
# ENTREGA.md do disco no encadeamento (--registrar com cadeia)
# ---------------------------------------------------------------------------

# _entrega_sem_gravadas <arquivo> [chave-extra] — o arquivo sem os blocos
# (linha da chave e as seguintes até a próxima chave de topo) das chaves que o
# registro grava (e da extra, se dada); o resto do frontmatter e o corpo, byte
# a byte.
_entrega_sem_gravadas() {
  CHS=" $CHAVES_GRAVADAS reconciliacoes ${2:-} " awk '
    BEGIN { chs = ENVIRON["CHS"] }
    NR == 1 { print; fm = 1; next }
    fm && /^---[ \t]*\r?$/ { fm = 0; print; next }
    fm && /^[A-Za-z_][A-Za-z0-9_]*:/ { k = $0; sub(/:.*/, "", k); pula = (index(chs, " " k " ") > 0); if (pula) next; print; next }
    fm && pula { next }
    { print }
  ' "$1"
}

# _entrega_bloco <arquivo> <chave> — o bloco da chave de topo (linha da chave
# e as seguintes até a próxima chave), sem CR; rc 1 se a chave não aparece
# exatamente uma vez no frontmatter.
_entrega_bloco() {
  awk -v c="$2" '
    { sub(/\r$/, "") }
    NR == 1 { next }
    /^---[ \t]*$/ { exit }
    /^[A-Za-z_][A-Za-z0-9_]*:/ { k = $0; sub(/:.*/, "", k); em = (k == c); if (em) { n++; b = $0 } next }
    em { b = b "\n" $0 }
    END { if (n != 1) exit 1; print b }
  ' "$1"
}

# entrega_disco_tolerado <b1-da-última> — o ENTREGA.md do disco difere do de M
# só nas chaves que o registro grava (resto do frontmatter e corpo byte a
# byte iguais), e cada uma delas, uma vez só, tem o valor que a cadeia
# verificada implica: a reabertura de um registro anterior, nada mais. A
# lista `reconciliacoes` e a base são conferidas contra a cadeia antes
# (cadeia_coerencia). Falha: ENTREGA_ERRO.
entrega_disco_tolerado() {
  local b1u="$1" chave esperado bloco extra=""
  ENTREGA_ERRO=""
  # base legada: o 001 inferida_legado gravou origem_base, que o ENTREGA.md de
  # M (ainda o legado, sem o checkpoint) não tem; só então ela é tolerada, e
  # só com esse valor
  if [ "$(_r 1 origem_base)" = inferida_legado ] && ! _entrega_chave_qualquer "$ENTREGA_M" origem_base; then extra=origem_base; fi # guarda:LEGT
  _entrega_sem_gravadas "$ENTREGA" "$extra" > "$TMP_DIR/disco.resto" 2>/dev/null \
    && _entrega_sem_gravadas "$ENTREGA_M" "$extra" > "$TMP_DIR/m.resto" 2>/dev/null \
    || { ENTREGA_ERRO='não foi possível comparar com o de M'; return 1; }
  cmp -s "$TMP_DIR/disco.resto" "$TMP_DIR/m.resto" || { ENTREGA_ERRO='difere do de M fora das chaves que o registro grava'; return 1; } # guarda:DISCO
  if [ -n "$extra" ]; then
    bloco="$(_entrega_bloco "$ENTREGA" origem_base)" || { ENTREGA_ERRO="origem_base ausente ou repetida"; return 1; }
    [ "$bloco" = "origem_base: inferida_legado" ] || { ENTREGA_ERRO="origem_base não tem o valor que a cadeia implica (inferida_legado)"; return 1; } # guarda:LEGT
  fi
  for chave in $CHAVES_GRAVADAS; do
    case "$chave" in
      base_validada_sha) esperado="$b1u" ;;
      estado) esperado=aberto ;;
      portao|portao_sha|causa|entregue_em) esperado=null ;;
      falhas_portao) esperado='[]' ;;
      push_feito) esperado=false ;;
      atualizado_em) esperado='' ;;
      *) ENTREGA_ERRO="chave fora da lista que o registro grava: $chave"; return 1 ;;
    esac
    bloco="$(_entrega_bloco "$ENTREGA" "$chave")" || { ENTREGA_ERRO="$chave ausente ou repetida"; return 1; }
    if [ "$chave" = atualizado_em ]; then
      case "$bloco" in *"$NL"*) ENTREGA_ERRO="atualizado_em em mais de uma linha"; return 1 ;; esac
      grep -Eqx 'atualizado_em: [0-9]{4}-[0-9]{2}-[0-9]{2}' <<<"$bloco" || { ENTREGA_ERRO="atualizado_em fora de AAAA-MM-DD"; return 1; } # guarda:DISCO
    else
      [ "$bloco" = "$chave: $esperado" ] || { ENTREGA_ERRO="$chave não tem o valor que a cadeia implica ($esperado)"; return 1; } # guarda:DISCO
    fi
  done
}

# confere_disco_cadeia — (registro com cadeia) o ENTREGA.md do disco é o de M,
# ou difere dele só na reabertura que a cadeia verificada implica; senão rc 3.
confere_disco_cadeia() {
  { [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ]; } || para 3 'ENTREGA.md com alteração não commitada'
  cmp -s "$ENTREGA" "$ENTREGA_M" || entrega_disco_tolerado "$ULT_B1" \
    || para 3 "ENTREGA.md com alteração não commitada ($ENTREGA_ERRO)" # guarda:DISCO
}

# prepara_superada <artefato> <numero> — o artefato com `estado: superada` em
# TMP_ANT, ao lado dele (mesmo modo): só a linha `estado: ativa` de topo muda;
# `estado` não entra na assinatura, que continua a mesma e válida.
prepara_superada() {
  local arq="$1" num="$2" nome="${1##*/}"
  awk '
    NR == 1 { print; fm = 1; next }
    fm && /^---[ \t]*\r?$/ { fm = 0 }
    fm && /^estado: ativa\r?$/ { sub(/ativa/, "superada"); n++ }
    { print }
    END { exit (n != 1) }
  ' "$arq" > "$TMP_DIR/anterior-superada.md" 2>/dev/null || para 5 "$nome: estado ativa não encontrado uma vez só"
  RB_ERRO=""
  _rb_validar_conteudo "$TMP_DIR/anterior-superada.md" "$TRABALHO" "$num" || para 5 "$nome superada não valida: $RB_ERRO"
  [ "$(sed -n 's/^assinatura: //p' "$arq")" = "$(sed -n 's/^assinatura: //p' "$TMP_DIR/anterior-superada.md")" ] \
    || para 5 "$nome: a assinatura mudaria ao marcar superada"
  TMP_ANT="$arq.superada.$$"
  { cp -p "$arq" "$TMP_ANT" && cat "$TMP_DIR/anterior-superada.md" > "$TMP_ANT"; } 2>/dev/null \
    || para 1 'não foi possível preparar o anterior superada na pasta da entrega'
}

# cadeia_reprovada <rc> <mensagem> — (registro) relata os motivos da cadeia
# existente no stderr e encerra sem gravar nada.
cadeia_reprovada() {
  local codigo detalhe
  while IFS="$TAB" read -r _ codigo detalhe; do
    printf 'reconciliacao-base: cadeia existente: %s (%s)\n' "$detalhe" "$codigo" >&2
  done < "$MOTIVOS"
  para "$1" "$2"
}

# completa_interrompido — (reexecução do mesmo M, cadeia só com o resíduo de
# um registro interrompido depois do ponto de commit, reconhecido pela
# estrutura) remove as sobras `.superada.<pid>` e marca a penúltima
# `superada`. Defesa em profundidade: cadeia_le só conta como resíduo a sobra
# não rastreada, regular e de um artefato da cadeia; aqui todas as condições
# são conferidas de novo ANTES de qualquer escrita (rc 5, nada gravado). As
# sobras saem antes da marcação: depois do `mv` da penúltima nada mais falha,
# então nenhum erro deixa a penúltima `superada` com rc ≠ 0. Define COMPLETADO.
completa_interrompido() {
  local k=$((N_CAD - 1)) arq sobra nome
  [ "$(_r "$k" estado)" = ativa ] || para 5 "$(cat "$TMP_DIR/nome$k") não está ativa; nada foi completado"
  arq="$ENTREGA_DIR/$(cat "$TMP_DIR/nome$k")"
  : > "$TMP_DIR/sobras"
  for sobra in "$ENTREGA_DIR"/RECONCILIACAO-BASE-*; do
    nome="${sobra##*/}"
    sobra_superada "$nome" || continue
    g ls-files --error-unmatch -- "$sobra" >/dev/null 2>&1 && para 5 "sobra rastreada: $nome; remova-a com um commit; nada foi completado" # guarda:COMPLETA
    sobra_valida "$ENTREGA_DIR" "$nome" || para 5 "$SOBRA_ERRO; nada foi completado" # guarda:COMPLETA
    printf '%s\n' "$sobra" >> "$TMP_DIR/sobras"
  done
  while IFS= read -r sobra; do
    rm -f "$sobra" || para 1 "não foi possível remover a sobra ${sobra##*/}; $INTERROMPIDO"
  done < "$TMP_DIR/sobras"
  prepara_superada "$arq" "$k"
  mv "$TMP_ANT" "$arq" 2>/dev/null || para 1 "não foi possível marcar ${arq##*/} como superada; $INTERROMPIDO" # guarda:COMPLETA
  TMP_ANT=""
  COMPLETADO=superada
}

# base_do_registro — (registro sem cadeia) B0 e ORIGEM_BASE, do ENTREGA.md de
# P1 = M^1, nunca do disco nem de M (o próprio merge poderia reescrevê-lo; a
# estrutura exige depois que M e P1 tenham o mesmo). Com a chave
# base_validada_sha, em qualquer forma: o valor gravado (registrada_e0), que
# tem de ser SHA de 40 hex (vazio, null ou ilegível: rc 5). Sem ela, a entrega
# legada (spec, seção 14) infere B0 = o merge-base de P1 e B1, uma única vez
# (inferida_legado): P1 que não é legado, rc 5; base ambígua, rc 6. Tudo antes
# de qualquer escrita; `para` libera a trava.
base_do_registro() {
  local p1 b1 pais npais modo p1_com_entrega=0
  p1="$(g rev-parse --verify -q "$M^1")" || estrutura m 'M^1 ilegível'
  ENTREGA_P1="$TMP_DIR/entrega-p1.md"
  modo="$(modo_em "$p1" "$ENTREGA")"
  case "$modo" in
    100644|100755) g cat-file blob "$p1:$ENTREGA" > "$ENTREGA_P1" 2>/dev/null && p1_com_entrega=1 ;; # guarda:LEGF
  esac
  # P1 sem o ENTREGA.md (pais trocados, por exemplo): B0 do de M só para as
  # condições estruturais, que reprovam de qualquer forma — no mínimo a guarda
  # estrutura[entrega], já que M tem o ENTREGA.md (le_entrega_m) e P1 não.
  [ "$p1_com_entrega" = 1 ] || cp "$ENTREGA_M" "$ENTREGA_P1"
  if _entrega_chave_qualquer "$ENTREGA_P1" base_validada_sha; then
    B0="$(catalogo_fm "$ENTREGA_P1" base_validada_sha)"
    grep -Eq '^[0-9a-f]{40}$' <<<"$B0" || para 5 "ENTREGA.base_validada_sha não é SHA de 40 hex: ${B0:-vazia ou ilegível}"
    ORIGEM_BASE=registrada_e0
    return 0
  fi
  # entrega legada: a base é inferida só no 001, e só sobre o histórico de P1
  [ "$p1_com_entrega" = 1 ] || estrutura entrega "P1 $p1 sem $ENTREGA regular: a base legada não é inferível"
  legado_entrega "$ENTREGA_P1" "$p1" || para 5 "$LEG_ERRO; nada foi gravado"
  pais="$(g rev-list --parents -n1 "$M" 2>/dev/null)" || estrutura m 'pais de M ilegíveis'
  npais=$(( $(printf '%s\n' "$pais" | wc -w) - 1 ))
  [ "$npais" = 2 ] || estrutura pais "M $M tem $npais pai(s); o commit de integração tem exatamente dois"
  b1="$(g rev-parse --verify -q "$M^2")" || estrutura m 'M^2 ilegível'
  legado_base "$p1" "$b1" || para 6 "base legada indeterminável: $LEG_ERRO; nada foi gravado"
  B0="$LEG_MB"
  ORIGEM_BASE=inferida_legado
}

# ---------------------------------------------------------------------------
# Argumentos. Os caminhos vêm depois de `--`, um por argumento, sem word
# splitting; vão para um arquivo, um por linha, depois de recusar os que não
# cabem numa linha.
# ---------------------------------------------------------------------------
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mergex-reconciliacao.XXXXXX")" \
  || { printf 'reconciliacao-base: não foi possível criar diretório temporário\n' >&2; exit 1; }
LISTA="$TMP_DIR/lista"
: > "$LISTA"
UNIAO="$TMP_DIR/uniao"
CATALOGO="$TMP_DIR/catalogo"
INVENTARIO="$TMP_DIR/inventario"
SAIDA="$TMP_DIR/saida"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --registrar) [ -z "$MODO" ] || uso; MODO=registrar; shift ;;
    --verificar) [ -z "$MODO" ] || uso; MODO=verificar; shift ;;
    --entrega) [ "$#" -ge 2 ] || uso; ENTREGA="$2"; shift 2 ;;
    --origem) [ "$#" -ge 2 ] || uso; ORIGEM="$2"; shift 2 ;;
    --trabalho) [ "$#" -ge 2 ] || uso; TRABALHO="$2"; shift 2 ;;
    --merge) [ "$#" -ge 2 ] && [ -n "$2" ] && [ -z "$MERGE_ARG" ] || uso '--merge exige um SHA, uma vez só'; MERGE_ARG="$2"; shift 2 ;;
    --checkpoint) [ "$#" -ge 2 ] && [ -z "$CHECKPOINT" ] || uso '--checkpoint exige um valor, uma vez só'; CHECKPOINT="$2"; shift 2 ;;
    --) SEPARADOR=1; shift; break ;;
    *) uso "opção desconhecida: $1" ;;
  esac
done

case "$MODO" in
  registrar)
    [ "$SEPARADOR" = 1 ] || uso 'falta -- antes da lista de caminhos'
    [ -z "$CHECKPOINT" ] || uso '--registrar não recebe --checkpoint' ;;
  verificar)
    [ "$SEPARADOR" = 0 ] || uso '--verificar não recebe lista de caminhos'
    [ -z "$MERGE_ARG" ] || uso '--verificar não recebe --merge'
    case "$CHECKPOINT" in ''|reconciliacao-base) ;; *) uso "--checkpoint só aceita reconciliacao-base: $CHECKPOINT" ;; esac ;;
  *) uso 'falta --registrar ou --verificar' ;;
esac
# --merge é um SHA (nunca nome de ref): hex, de 7 a 40 dígitos
if [ -n "$MERGE_ARG" ]; then
  case "$MERGE_ARG" in *[!0-9a-f]*) uso "--merge exige um SHA hexadecimal: $MERGE_ARG" ;; esac
  { [ "${#MERGE_ARG}" -ge 7 ] && [ "${#MERGE_ARG}" -le 40 ]; } || uso "--merge exige um SHA de 7 a 40 dígitos: $MERGE_ARG"
fi
case "$ORIGEM" in sprintx|runx) ;; *) uso "origem inválida: ${ORIGEM:-ausente}" ;; esac
case "$TRABALHO" in
  ''|*[!A-Za-z0-9._-]*|.*|sprintx|manutencao|entregas|eventos|relatorios|legado|stack|projeto)
    uso "trabalho inválido: ${TRABALHO:-ausente}" ;;
esac
case "$ENTREGA" in ./*) ENTREGA="${ENTREGA#./}" ;; esac
[ "$ENTREGA" = "docs/entregas/$TRABALHO/ENTREGA.md" ] || uso "--entrega deve ser docs/entregas/$TRABALHO/ENTREGA.md"

for caminho in "$@"; do
  case "$caminho" in
    ''|*"$NL"*|*"$TAB"*) uso "caminho vazio ou com quebra de linha/tabulação" ;;
    /*|./*|..|../*|*/../*|*/..|*/./*|*/.|*//*) uso "caminho fora da forma do Git (relativo à raiz, sem . ou ..): $caminho" ;;
  esac
  grep -Fxq -e "$caminho" "$LISTA" && uso "caminho repetido na lista: $caminho"
  printf '%s\n' "$caminho" >> "$LISTA"
done

RAIZ="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || { printf 'reconciliacao-base: fora de um repositório Git\n' >&2; exit 1; }
cd "$RAIZ" || { printf 'reconciliacao-base: raiz inacessível: %s\n' "$RAIZ" >&2; exit 1; }

# Só leitura: nenhuma trava, nenhuma pré-condição de stage ou pasta limpa.
if [ "$MODO" = verificar ]; then
  verificar
  exit $?
fi

# ---------------------------------------------------------------------------
# --registrar. Pré-condições: trava C5, stage vazio, nenhum merge em andamento.
# ---------------------------------------------------------------------------
# história cortada não prova nada: o raso para antes da trava e de qualquer prova
arvore_recusa_raso || para 4 "estrutura[raso]: $ARVORE_ERRO" # guarda:EST
SAIDA_TRAVA="$(adquirir reconciliacao-base)"; RC_TRAVA=$?
[ "$RC_TRAVA" != 2 ] || para 2 'índice ocupado pela trava C5'
[ "$RC_TRAVA" = 0 ] || para 1 'não foi possível adquirir a trava C5 do índice'
TOKEN="$(printf '%s\n' "$SAIDA_TRAVA" | awk -F= '$1 == "token" { print $2 }')"
[ -n "$TOKEN" ] || para 1 'a trava C5 foi criada sem token'
LIBERAR_NA_SAIDA=1

if g rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  para 3 'merge em andamento (MERGE_HEAD presente): conclua o commit de integração antes de registrar'
fi
g diff --cached --quiet --ignore-submodules=none 2>/dev/null || para 3 'o stage não está vazio; nada foi limpo ou adotado'

# ---------------------------------------------------------------------------
# M e o que alimenta as provas. Nada que esteja só no disco entra numa prova:
# o ENTREGA.md, a pasta do trabalho (plano e catálogo) são lidos do commit M.
# M é HEAD ou o commit de --merge, sempre como SHA completo.
# ---------------------------------------------------------------------------
if [ -n "$MERGE_ARG" ]; then
  M="$(g rev-parse --verify -q "$MERGE_ARG^{commit}")" || estrutura m "M $MERGE_ARG não é commit deste repositório (ou é ambíguo)"
  # a linha de primeiro pai de HEAD fala antes de qualquer leitura de M (um
  # commit da base ou um merge de PR nem tem o ENTREGA.md)
  g rev-list --first-parent HEAD > "$TMP_DIR/primeiro-pai-head" 2>/dev/null \
    || estrutura primeiro_pai 'linha de primeiro pai de HEAD ilegível'
  grep -Fxq -e "$M" "$TMP_DIR/primeiro-pai-head" \
    || estrutura primeiro_pai "M $M fora da linha de primeiro pai de HEAD" # guarda:EST
else
  M="$(g rev-parse --verify -q HEAD)" || estrutura m 'HEAD ilegível'
fi

# ENTREGA.md (versão de M): contexto explícito igual ao registrado.
ENTREGA_M="$TMP_DIR/entrega-m.md"
le_entrega_m "$M" "$ENTREGA_M" || exit 1
fm() { catalogo_fm "$ENTREGA_M" "$1"; }
BRANCH="$(g branch --show-current 2>/dev/null)" || BRANCH=""
[ -n "$BRANCH" ] || para 5 'HEAD destacado: a branch não prova o trabalho'
[ "$(fm branch)" = "$BRANCH" ] || para 5 "branch ativa ($BRANCH) diverge de ENTREGA.branch"
BRANCH_BASE="$(fm branch_base)"
[ -n "$BRANCH_BASE" ] || para 5 'ENTREGA.branch_base ausente'

materializa_m "$M" "$TMP_DIR/arvore-m" || exit 1

# A pasta do trabalho resolvida em M; no disco ela tem de estar igual a M, sem
# alteração nem arquivo não rastreado (defesa em profundidade).
g status --porcelain=v1 -z --untracked-files=all -- "$PASTA" > "$TMP_DIR/sujo" 2>/dev/null \
  || para 3 'não foi possível verificar se a pasta do trabalho está limpa'
[ ! -s "$TMP_DIR/sujo" ] || para 3 "pasta do trabalho com alteração não commitada: $(tr '\0' ' ' < "$TMP_DIR/sujo" | cut -c1-200)" # guarda:LIMPA

# Na pasta da entrega, só o que o próprio registro grava pode estar pendente
# (antes do checkpoint reconciliacao-base): ENTREGA.md alterado na árvore e
# RECONCILIACAO-BASE-NNN.md não rastreado ou alterado. Caminho casado exato.
ENTREGA_DIR="docs/entregas/$TRABALHO"
g status --porcelain=v1 -z --untracked-files=all -- "$ENTREGA_DIR" > "$TMP_DIR/sujo-entrega" 2>/dev/null \
  || para 3 'não foi possível verificar se a pasta da entrega está limpa'
while IFS= read -r -d '' registro <&3; do
  xy="${registro:0:2}"; p="${registro:3}"; tolerado=0
  if [ "$xy" = ' M' ] && [ "$p" = "$ENTREGA_DIR/ENTREGA.md" ]; then tolerado=1; fi # guarda:LIMPA
  case "$xy:$p" in "??:$ENTREGA_DIR/"RECONCILIACAO-BASE-[0-9][0-9][0-9].md|" M:$ENTREGA_DIR/"RECONCILIACAO-BASE-[0-9][0-9][0-9].md) tolerado=1 ;; esac # guarda:LIMPA
  # a sobra do anterior `superada` de um registro interrompido depois do ponto
  # de commit: só o --registrar do mesmo M a remove (a cadeia a reprova antes)
  if [ "$xy" = '??' ] && [ "${p%/*}" = "$ENTREGA_DIR" ] && sobra_superada "${p##*/}"; then tolerado=1; fi # guarda:LIMPA
  [ "$tolerado" = 1 ] || para 3 "pasta do trabalho com alteração não commitada (entrega, fora do que o registro grava): $xy $p" # guarda:LIMPA
done 3< "$TMP_DIR/sujo-entrega"

# ---------------------------------------------------------------------------
# A cadeia já gravada (seção 14, múltiplas reconciliações). Os artefatos do
# disco, rastreados ou não, são a cadeia; antes de servirem de B0 eles passam
# pela mesma verificação de contrato e de provas do --verificar (sem a
# cobertura em HEAD), e o ENTREGA.md do disco tem de listá-los. Nada do disco
# entra sem esse recálculo.
# ---------------------------------------------------------------------------
N_CAD=0
TEM_ARTEFATO=0
for existente in "$ENTREGA_DIR"/RECONCILIACAO-BASE-*; do
  [ -e "$existente" ] || [ -L "$existente" ] || continue
  TEM_ARTEFATO=1
done

if [ "$TEM_ARTEFATO" = 1 ]; then
  { [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cat "$ENTREGA" > "$TMP_DIR/entrega-disco.md"; } 2>/dev/null \
    || para 3 'ENTREGA.md com alteração não commitada'
  ENTREGA_D="$TMP_DIR/entrega-disco.md"
  entrega_lista_reconciliacoes "$ENTREGA_D" > "$TMP_DIR/lista-entrega" 2>/dev/null \
    || para 5 "$ENTREGA: reconciliacoes fora da forma {numero, arquivo, b1_sha, m_sha}"
  # sobra de registro interrompido: não rastreado e fora da lista do disco;
  # se houver também sobras `.superada.<pid>`, a instrução as nomeia
  SOBRAS=""
  for existente in "$ENTREGA_DIR"/RECONCILIACAO-BASE-*; do
    [ -e "$existente" ] || [ -L "$existente" ] || continue
    nome="${existente##*/}"
    if sobra_superada "$nome"; then SOBRAS="$SOBRAS e $nome"; fi
  done
  for existente in "$ENTREGA_DIR"/RECONCILIACAO-BASE-*; do
    [ -e "$existente" ] || [ -L "$existente" ] || continue
    nome="${existente##*/}"
    sobra_superada "$nome" && continue
    cut -f2 "$TMP_DIR/lista-entrega" | grep -Fx -e "$nome" >/dev/null && continue
    [ -n "$(g ls-files -z -- "$existente" 2>/dev/null)" ] && continue
    [ -z "$SOBRAS" ] || para 5 "artefato órfão de registro interrompido: $nome; remova $nome$SOBRAS e registre de novo" # guarda:ORFAO
    para 5 "artefato órfão de registro interrompido: $nome; remova-o e registre de novo" # guarda:ORFAO
  done

  # a mesma verificação do --verificar, acumulando os motivos
  RAIZ_M_REG="$RAIZ_M"; PASTA_REG="$PASTA"
  MODO=verificar; MOTIVOS="$TMP_DIR/motivos"; : > "$MOTIVOS"; FALHA_4=0; FALHA_5=0
  cadeia_le
  cadeia_provas
  cadeia_coerencia
  MODO=registrar; FALHAS=0; RAIZ_M="$RAIZ_M_REG"; PASTA="$PASTA_REG"
  # Registro interrompido depois do ponto de commit, reconhecido pela
  # ESTRUTURA (contadores de cadeia_le/cadeia_provas, nunca pelo texto de um
  # motivo): todos os artefatos lidos; nenhuma falha de prova; as falhas de
  # contrato são exatamente o resíduo (a penúltima com `estado: ativa` e as
  # sobras não rastreadas), e há a penúltima `ativa`; o M é o da última.
  # Então a reexecução completa o registro; qualquer outra falha, ou outro M,
  # para aqui.
  COMPLETAR=0
  if [ "$FALHA_5" = 1 ] || [ "$FALHA_4" = 1 ]; then
    # todo artefato da cadeia tem de ter sido lido (schema e assinatura)
    i=0
    while [ "$i" -lt "$CAD_N" ]; do
      i=$((i + 1))
      [ -f "$TMP_DIR/r$i.lido" ] || cadeia_reprovada 5 "cadeia ilegível: $(cat "$TMP_DIR/nome$i") não pôde ser lido (schema ou assinatura); nada foi gravado" # guarda:COMPLETA
    done
    if [ "$N_MOT5" -gt 0 ] && [ "$N_MOT5" = "$RESIDUO_N" ] && [ "$CAD_N" -ge 2 ] && [ "$RESIDUO_PENULT" = $((CAD_N - 1)) ]; then
      # só resíduo entre as falhas de contrato: uma falha de prova fala por si
      [ "$N_MOT4" = 0 ] || cadeia_reprovada 4 'a cadeia de reconciliações existente não verifica; nada foi gravado' # guarda:COMPLETA
      [ "$(_r "$CAD_N" m_sha)" = "$M" ] && COMPLETAR=1 # guarda:COMPLETA
    fi
    if [ "$COMPLETAR" = 0 ]; then
      [ "$FALHA_5" = 1 ] && cadeia_reprovada 5 'a cadeia de reconciliações existente não verifica; nada foi gravado' # guarda:CAD
      cadeia_reprovada 4 'a cadeia de reconciliações existente não verifica; nada foi gravado' # guarda:CAD
    fi
  fi
  N_CAD="$CAD_N"
  ULT_NOME="$(cat "$TMP_DIR/nome$N_CAD")"
  ULT_B1="$(_r "$N_CAD" b1_sha)"
  ULT_M="$(_r "$N_CAD" m_sha)"

  # O ENTREGA.md do disco: igual ao de M, ou diferente só na reabertura que a
  # cadeia implica. Antes do noop, para que ele nunca mascare edição alheia.
  confere_disco_cadeia

  # Reexecução: o mesmo M da última, com a mesma lista (como conjunto), não
  # grava nada (salvo completar um registro interrompido); com outra lista, ou
  # o M de uma anterior à última, rc 5.
  if [ "$M" = "$ULT_M" ]; then
    LC_ALL=C sort "$LISTA" > "$TMP_DIR/lista.noop"
    LC_ALL=C sort "$TMP_DIR/lista$N_CAD" > "$TMP_DIR/lista.ultima"
    cmp -s "$TMP_DIR/lista.noop" "$TMP_DIR/lista.ultima" \
      || para 5 "reconciliação já registrada para M $M em $ULT_NOME, com outra lista de caminhos; nada foi gravado" # guarda:NOOP
    COMPLETADO=""
    if [ "$COMPLETAR" = 1 ]; then completa_interrompido; fi
    printf 'noop=true\n'
    [ -z "$COMPLETADO" ] || printf 'completado=%s\n' "$COMPLETADO"
    printf 'registrado=%s\n' "$ULT_NOME"
    printf 'b0=%s\n' "$(_r "$N_CAD" b0_sha)"
    printf 'p1=%s\n' "$(_r "$N_CAD" p1_sha)"
    printf 'b1=%s\n' "$ULT_B1"
    printf 'm=%s\n' "$ULT_M"
    exit 0
  fi
  i=0
  while [ "$i" -lt "$N_CAD" ]; do
    i=$((i + 1))
    [ "$(_r "$i" m_sha)" != "$M" ] \
      || para 5 "reconciliação já registrada: M $M é o de $(cat "$TMP_DIR/nome$i"), anterior à última ($ULT_NOME); só a última pode ser reexecutada" # guarda:NOOP
  done

  # B0 é o b1_sha da última (verificada), nunca o ENTREGA.md do disco; o
  # <início> da prova 2 e o limite da ordem são o M dela.
  B0="$ULT_B1"
  INICIO="$ULT_M"
  LIMITE="$ULT_M"
  ORIGEM_BASE=reconciliacao_anterior
  # a origem da base da entrega é a do 001 (nunca inferida de novo)
  ENTREGA_ORIGEM="$(_r 1 origem_base)"
  anteriores_da_cadeia "$TMP_DIR/cobertura" > "$TMP_DIR/anteriores"
else
  # B0 vem do ENTREGA.md de P1 (o de antes do merge), gravado ou, na entrega
  # legada, inferido uma única vez (base_do_registro).
  base_do_registro
  ENTREGA_ORIGEM="$ORIGEM_BASE"
  INICIO="$B0"
  LIMITE="$B0"
  : > "$TMP_DIR/anteriores"
fi

# ---------------------------------------------------------------------------
# Condições estruturais (seção 5). A linha de primeiro pai é a da branch (a
# ativa, HEAD); a ponta da ref de base é condição do momento do registro.
# Entre as duas metades, a ordem da cadeia (rc 5): M^2 descende do b1_sha da
# última reconciliação, e M é o merge mais antigo ainda não registrado na
# linha de primeiro pai de HEAD (depois do M da última, ou de B0 no 001).
# ---------------------------------------------------------------------------
estrutura_pais "$M" "$B0" "$BRANCH" || exit 1
if [ "$N_CAD" -gt 0 ]; then
  g merge-base --is-ancestor "$B0" "$B1" 2>/dev/null \
    || para 5 "ordem: o segundo pai de M ($B1) não descende do b1_sha da última reconciliação, $ULT_NOME ($B0)" # guarda:ORDEM
fi
g rev-list --first-parent --merges --reverse "$LIMITE..HEAD" > "$TMP_DIR/merges" 2>/dev/null \
  || estrutura ordem "merges da linha de primeiro pai de HEAD ilegíveis"
PROXIMO="$(sed -n 1p "$TMP_DIR/merges")"
if [ "$PROXIMO" != "$M" ]; then
  # o que trava a fila é um merge que não é de integração da base: nomeá-lo
  if [ -n "$PROXIMO" ] && ! bash "$CONTRATO_SH" --validar-integracao --trabalho "$TRABALHO" --commit "$PROXIMO" >/dev/null 2>&1; then
    para 5 "ordem: o merge $PROXIMO, anterior a M $M na linha de primeiro pai de HEAD, não é um commit de integração da base (Trabalho:/Integra-base:); ele precisa ser registrado ou resolvido antes de M" # guarda:ORDEM
  fi
  para 5 "ordem: M $M não é o merge mais antigo ainda não registrado na linha de primeiro pai de HEAD (o próximo é ${PROXIMO:-nenhum}); registre os merges um por vez, do mais antigo, com --merge" # guarda:ORDEM
fi
estrutura_resto "$M" "$B0" || exit 1
PONTA_BASE="$(g rev-parse --verify -q "$BRANCH_BASE^{commit}")" || estrutura base "ref de base $BRANCH_BASE ilegível"
g merge-base --is-ancestor "$B1" "$PONTA_BASE" 2>/dev/null || estrutura base "B1 $B1 não é ancestral da ponta de $BRANCH_BASE ($PONTA_BASE)" # guarda:EST

# União das tasks e catálogo de método, as quatro provas e o inventário.
uniao_e_catalogo "$RAIZ_M" "$PASTA" || exit 1
provas "$LISTA" "$B0" "$INICIO" "$P1" "$B1" "$M"
inventario "$B0" "$B1" "$M" "$LISTA" "$TMP_DIR/anteriores" || exit 1

[ "$FALHAS" = 0 ] || para 4 "$FALHAS reprovação(ões); nada foi gravado"

# ---------------------------------------------------------------------------
# Artefato (seção 7). Só depois de tudo aprovado.
# ---------------------------------------------------------------------------
NUM=$((N_CAD + 1))
NOME="$(printf 'RECONCILIACAO-BASE-%03d.md' "$NUM")"
DESTINO="docs/entregas/$TRABALHO/$NOME"
if [ "$N_CAD" -gt 0 ]; then ANTERIOR="$ULT_NOME"; else ANTERIOR=null; fi
ESC="$TMP_DIR/escalares.tsv"
ARQ="$TMP_DIR/arquivos.tsv"
{
  printf 'expx_tool\t%s\n' "$ORIGEM"
  printf 'trabalho_id\t%s\n' "$TRABALHO"
  printf 'numero\t%s\n' "$NUM"
  printf 'anterior\t%s\n' "$ANTERIOR"
  printf 'branch\t%s\n' "$BRANCH"
  printf 'branch_base\t%s\n' "$BRANCH_BASE"
  printf 'origem_base\t%s\n' "$ORIGEM_BASE"
  printf 'b0_sha\t%s\n' "$B0"
  printf 'p1_sha\t%s\n' "$P1"
  printf 'b1_sha\t%s\n' "$B1"
  printf 'm_sha\t%s\n' "$M"
  printf 'estado\tativa\n'
  printf 'registrado_em\t%s\n' "$(date +%Y-%m-%d)"
} > "$ESC" || para 1 'não foi possível montar os escalares do artefato'
: > "$ARQ"
LC_ALL=C sort "$LISTA" > "$TMP_DIR/lista.ord" || para 1 'não foi possível ordenar a lista'
while IFS= read -r f <&3; do
  campos_caminho "$B0" "$B1" "$M" "$f" || para 4 "artefato: $CAMPO_ERRO"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$f" "$CAMPO_ST" "$CAMPO_BB" "$CAMPO_BM" "$CAMPO_DS" \
    "ajuste exigido pela integração da base: ver o diff B1..M deste caminho" >> "$ARQ"
done 3< "$TMP_DIR/lista.ord"

[ -d "docs/entregas/$TRABALHO" ] || para 5 "pasta da entrega ausente: docs/entregas/$TRABALHO"

# ---------------------------------------------------------------------------
# ENTREGA.md novo (seção 11). A gravação parte do ENTREGA.md de M, e só se o do
# disco for byte a byte o de M — ou, com cadeia, se diferir dele só nas chaves
# que o registro grava, com os valores que a cadeia verificada implica: nunca
# se sobrescreve edição alheia. Tudo é montado numa cópia; o repositório só
# muda no fim (artefato, anterior e ENTREGA.md, ou nada).
# ---------------------------------------------------------------------------
# (com cadeia, o ENTREGA.md do disco já passou por confere_disco_cadeia)
if [ "$N_CAD" = 0 ]; then
  { [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cmp -s "$ENTREGA" "$ENTREGA_M"; } \
    || para 3 'ENTREGA.md com alteração não commitada' # guarda:DISCO
fi

# sem cadeia, a lista de reconciliações do ENTREGA.md só pode estar vazia: não
# há o que acrescentar a entradas sem artefato
if [ "$N_CAD" = 0 ]; then
  RECONC_ATUAL="$(fm reconciliacoes)"
  if [ -n "$RECONC_ATUAL" ] && [ "$RECONC_ATUAL" != '[]' ]; then
    para 5 'ENTREGA.reconciliacoes não está vazia e não há artefato registrado'
  elif [ -z "$RECONC_ATUAL" ] && _entrega_tem "$ENTREGA_M" reconciliacoes; then
    para 5 'ENTREGA.reconciliacoes não está vazia e não há artefato registrado'
  fi
fi

ENTREGA_NOVO="$TMP_DIR/entrega-novo.md"
cp "$ENTREGA_M" "$ENTREGA_NOVO" || para 1 'não foi possível preparar o ENTREGA.md novo'
# Entrega legada (base inferida no 001): as chaves novas que faltam no
# ENTREGA.md de M entram juntas, antes do fechamento, na ordem em que o E0 as
# grava; os valores definitivos vêm logo abaixo. As demais chaves e o corpo
# ficam como estão.
if [ "$ENTREGA_ORIGEM" = inferida_legado ]; then
  for chave in base_validada_sha origem_base reconciliacoes portao_sha; do
    _entrega_chave_qualquer "$ENTREGA_NOVO" "$chave" && continue
    case "$chave" in
      base_validada_sha) valor="$B1" ;;
      origem_base) valor=inferida_legado ;;
      reconciliacoes) valor='[]' ;;
      portao_sha) valor=null ;;
    esac
    entrega_define "$ENTREGA_NOVO" "$chave" "$valor" || para 5 "ENTREGA.md: $ENTREGA_ERRO"
  done
fi
for chave in $CHAVES_GRAVADAS; do
  case "$chave" in
    base_validada_sha) valor="$B1" ;;
    estado) valor=aberto ;;
    portao|portao_sha|causa|entregue_em) valor=null ;;
    falhas_portao) valor='[]' ;;
    push_feito) valor=false ;;
    atualizado_em) valor="$(date +%Y-%m-%d)" ;;
    *) para 5 "ENTREGA.md: chave fora da lista que o registro grava: $chave" ;;
  esac
  entrega_define "$ENTREGA_NOVO" "$chave" "$valor" || para 5 "ENTREGA.md: $ENTREGA_ERRO"
done
# a lista inteira: a cadeia verificada, na ordem, e a reconciliação nova
: > "$TMP_DIR/reconciliacoes.tsv"
i=0
while [ "$i" -lt "$N_CAD" ]; do
  i=$((i + 1))
  printf '%s\t%s\t%s\t%s\n' "$i" "$(cat "$TMP_DIR/nome$i")" "$(_r "$i" b1_sha)" "$(_r "$i" m_sha)" >> "$TMP_DIR/reconciliacoes.tsv"
done
printf '%s\t%s\t%s\t%s\n' "$NUM" "$NOME" "$B1" "$M" >> "$TMP_DIR/reconciliacoes.tsv"
entrega_reconciliacoes "$ENTREGA_NOVO" "$TMP_DIR/reconciliacoes.tsv" || para 5 "ENTREGA.md: $ENTREGA_ERRO"

# Gravação: o ENTREGA.md novo fica ao lado do atual (mesma pasta, mesmo modo);
# o artefato é emitido; o `mv` do ENTREGA.md é o PONTO DE COMMIT; o anterior
# `superada` vem por último. Antes do ponto de commit, qualquer falha ou sinal
# remove o artefato novo e nada fica (encerrar decide pelo conteúdo do
# ENTREGA.md no lugar). Depois dele, o registro está efetivado: um anterior
# ainda `ativa` é resíduo que o --registrar do mesmo M completa.
TMP_ENTREGA="$ENTREGA.registro.$$"
{ cp -p "$ENTREGA" "$TMP_ENTREGA" && cat "$ENTREGA_NOVO" > "$TMP_ENTREGA"; } 2>/dev/null \
  || para 1 'não foi possível preparar o ENTREGA.md novo na pasta da entrega'
RB_ERRO=""
ARTEFATO_NOVO=1 # guarda:JANELA
rb_emitir "$DESTINO" "$ESC" "$ARQ" || para 5 "artefato não emitido: $RB_ERRO"
# Imediatamente antes da troca, o disco é reconferido com a MESMA conferência
# de antes: a leitura lá em cima e o `mv` aqui não são atômicos entre si, e uma
# edição salva nesse intervalo não pode ser substituída pela cópia. Mudou: rc
# 3, como a conferência original; o encerrar remove o artefato novo e nada
# fica (CodeAnt 4235534531).
if [ "$N_CAD" = 0 ]; then
  { [ -f "$ENTREGA" ] && [ ! -L "$ENTREGA" ] && cmp -s "$ENTREGA" "$ENTREGA_M"; } \
    || para 3 'ENTREGA.md mudou durante o registro; nada foi gravado'
else confere_disco_cadeia; fi
if ! mv "$TMP_ENTREGA" "$ENTREGA" 2>/dev/null; then
  para 1 'não foi possível atualizar o ENTREGA.md; o artefato foi removido e nada foi gravado'
fi
TMP_ENTREGA=""
# Depois do ponto de commit: o anterior `superada` é preparado só agora (uma
# sobra `.superada.<pid>` nunca existe sem o registro efetivado) e trocado.
if [ "$N_CAD" -gt 0 ]; then
  prepara_superada "$ENTREGA_DIR/$ULT_NOME" "$N_CAD" # guarda:JANELA
  mv "$TMP_ANT" "$ENTREGA_DIR/$ULT_NOME" 2>/dev/null \
    || para 1 "registro efetivado ($NOME), mas não foi possível marcar $ULT_NOME como superada; $INTERROMPIDO"
  TMP_ANT=""
fi
ARTEFATO_NOVO=0 # guarda:JANELA

printf 'registrado=%s\n' "$NOME"
printf 'b0=%s\n' "$B0"
printf 'p1=%s\n' "$P1"
printf 'b1=%s\n' "$B1"
printf 'm=%s\n' "$M"
exit 0
