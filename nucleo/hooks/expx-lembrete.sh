#!/usr/bin/env bash
# expx-lembrete.sh — o gatilho que garante que a skill seja CONSIDERADA.
#
# UserPromptSubmit: roda antes da primeira acao do modelo, e o que ele
# escreve no stdout entra no contexto daquele turno.
#
# ---------------------------------------------------------------------------
# Por que este arquivo existe
#
# Uma descricao de skill so compete depois que o modelo decide procurar uma.
# Quando ele forma hipotese tecnica direto do relato — "sei o que provavelmente
# e isso" — a etapa de escolher o processo simplesmente nao acontece, e a
# descricao, por melhor que seja, nunca e lida.
#
# Foi medido: um relato de defeito nao acionou a runx em SEIS sessoes
# seguidas, com a descricao reescrita tres vezes (910, 1020 e 287 caracteres),
# sem concorrente, sem cache velho e com a palavra "bug" literal no pedido. A
# propria sessao, ao ser questionada, respondeu: "nao e que eu li a descricao
# e julguei que nao se aplicava — eu nao a li".
#
# O que resolve nao e descricao melhor: e uma instrucao imperativa injetada
# ANTES da primeira acao. E o mecanismo que o plugin superpowers usava, e a
# razao de ele vencer as skills do metodo mesmo sem descricao superior.
#
# ---------------------------------------------------------------------------
# Regras que este arquivo respeita
#
#   1. Rapido       — so casamento de padrao em shell, sem rede, sem parser.
#   2. Falha aberta — qualquer erro sai 0 e nao injeta nada. Nunca bloqueia.
#   3. Um lembrete  — no maximo UMA skill por prompt, a de maior prioridade.
#                     Injetar tres sugestoes e o mesmo que nao injetar nenhuma.
#   4. So o que esta instalado — nao sugere skill ausente do projeto.

set -u

# Sem stdin utilizavel, nao ha o que fazer. `read -d ''` consome ate EOF sem
# abrir `cat`; o `|| true` preserva fail-open porque EOF e o caso normal.
EVENTO=""
IFS= read -r -d '' EVENTO || true
[ -z "$EVENTO" ] && exit 0

# O motor Node concentra identidade e decisao. O classificador shell abaixo e
# o fallback stateless para runtime ausente/incompativel ou pacote incompleto.
CAMINHO_HOOK="${0//\\//}"
case "$CAMINHO_HOOK" in
  */*) DIR_HOOK="${CAMINHO_HOOK%/*}" ;;
  *) DIR_HOOK="." ;;
esac
if command -v node >/dev/null 2>&1 && [ -n "$DIR_HOOK" ] && [ -f "$DIR_HOOK/expx-lembrete.mjs" ]; then
  MARCADOR_NODE="__EXPX_NODE_OK_V1__"
  SAIDA_NODE="$(node "$DIR_HOOK/expx-lembrete.mjs" <<< "$EVENTO" 2>/dev/null)"
  STATUS_NODE=$?
  if [ "$STATUS_NODE" -eq 0 ]; then
    case "$SAIDA_NODE" in
      "$MARCADOR_NODE"*)
        printf '%s' "${SAIDA_NODE#"$MARCADOR_NODE"}"
        exit 0
        ;;
    esac
  fi
fi

# O fallback evita processos auxiliares: extracao suficiente para o JSON do
# evento, normalizacao e classificacao usam apenas builtins do Bash.
PROMPT=""
if [[ "$EVENTO" =~ \"prompt\"[[:space:]]*:[[:space:]]*\"(([^\"\\]|\\.)*)\" ]]; then
  PROMPT="${BASH_REMATCH[1]}"
  PROMPT="${PROMPT//\\\"/\"}"
  PROMPT="${PROMPT//\\n/$'\n'}"
  PROMPT="${PROMPT//\\r/$'\r'}"
  PROMPT="${PROMPT//\\t/$'\t'}"
  PROMPT="${PROMPT//\\\\/\\}"
fi
[ -z "$PROMPT" ] && exit 0

# Prompt curto e saudacao nao disparam nada.
[ "${#PROMPT}" -lt 12 ] && exit 0

# Minusculas e SEM acento: a pessoa digita "nao acompanha", "codigo", "calculo"
# tanto quanto as formas acentuadas, e um padrao que so casa com acento perde
# metade dos relatos reais.
P="${PROMPT,,}"
P="${P//á/a}"; P="${P//à/a}"; P="${P//â/a}"; P="${P//ã/a}"; P="${P//ä/a}"
P="${P//é/e}"; P="${P//è/e}"; P="${P//ê/e}"; P="${P//ë/e}"
P="${P//í/i}"; P="${P//ì/i}"; P="${P//î/i}"; P="${P//ï/i}"
P="${P//ó/o}"; P="${P//ò/o}"; P="${P//ô/o}"; P="${P//õ/o}"; P="${P//ö/o}"
P="${P//ú/u}"; P="${P//ù/u}"; P="${P//û/u}"; P="${P//ü/u}"; P="${P//ç/c}"

RAIZ="${CLAUDE_PROJECT_DIR:-$PWD}"

# A skill esta instalada NESTE projeto?
instalada() {
  [ -f "$RAIZ/.claude/skills/$1/SKILL.md" ] && return 0
  [ -d "$RAIZ/.expx/marketplace/plugins/expx/skills/$1" ] && return 0
  return 1
}

casa() { [[ "$P" =~ $1 ]]; }

# ------------------------------------------------------------------ gatilhos
#
# A ordem E a prioridade, e ela segue o fluxo do metodo: decidir se ha trabalho
# (prodx) vem antes de planejar (sprintx) e de corrigir (runx); entregar
# (mergex) vem depois. Consultas (memox, stackx) sao as mais especificas e
# ficam no topo por isso — quem pergunta "isso ja aconteceu antes?" nao quer
# que a resposta seja abrir uma ocorrencia.

SKILL=""
MOTIVO=""

# memox — pergunta sobre o passado
if casa '(ja (aconteceu|deu|teve|foi) (antes|isso)|e recorrente|voltou a (acontecer|dar)|historico (do|da|de)|quem mexeu|ja foi (decidido|tentado|descartado)|regressao)'; then
  SKILL="memox"; MOTIVO="a pergunta e sobre o passado do codigo"

# stackx — pergunta sobre convencao do projeto
elif casa '(qual o padrao|como (escrevo|faco) (o )?teste|onde (coloco|fica|ponho)|convencao|esta no padrao|padroes do projeto)'; then
  SKILL="stackx"; MOTIVO="a pergunta e sobre a convencao tecnica do repositorio"

# mergex — entrega
elif casa '(abrir? (o )?pr\b|pull request|criar? (a )?branch|commitar|versionar|subir o trabalho|mandar para revisao|pronto para (entregar|revisao)|pacote (do|de) qa)'; then
  SKILL="mergex"; MOTIVO="e trabalho de entrega e revisao"

# prodx — pedido cru, ainda por decidir
elif casa '(seria bom se|seria legal se|poderia (ter|fazer)|vale a pena|ja existe (no sistema|isso)|ideia de|gostaria de ter|queria (uma|um) (tela|relatorio|campo) nov)'; then
  SKILL="prodx"; MOTIVO="e um pedido cru, e decidir SE vira trabalho vem antes de planejar"

# runx — defeito no que ja existe
elif casa '((^|[^[:alnum:]_])bug([^[:alnum:]_]|$)|defeito|nao funciona|parou de funcionar|nao esta funcionando|nao acompanha|nao segue o padrao|(esta|ta|vindo|vem|veio|calculando|somando|mostrando|exibindo) errad|valor errado|(errado|divergente|incorret)|nao responde|nao carrega|nao salva|nao aparece|trava|travando|quebrou|quebrado|erro ao|falha ao|deveria .* mas)'; then
  SKILL="runx"; MOTIVO="e um defeito em algo que ja existe"

# sprintx — construir algo novo
elif casa '(implementar|construir|criar (uma|um) (feature|funcionalidade|integracao)|adicionar (uma|um) (feature|funcionalidade)|integrar com|refatorar|migrar (para|de))'; then
  SKILL="sprintx"; MOTIVO="e trabalho de construcao"
fi

[ -z "$SKILL" ] && exit 0
instalada "$SKILL" || exit 0

# A instrucao. Imperativa e curta: ela existe para que a etapa de ESCOLHER o
# processo aconteca, nao para descrever a skill — isso a descricao ja faz.
TEXTO="[Expx] Este pedido casa com a skill \`$SKILL\` ($MOTIVO).

ANTES de ler codigo, formar hipotese ou editar qualquer arquivo: leia a descricao da skill \`$SKILL\` e decida explicitamente se ela se aplica. Se aplicar, use-a. Se nao aplicar, diga em uma linha por que nao.

Hipotese tecnica forte nao dispensa esta checagem — e justamente quando ela mais protege."

ESC="${TEXTO//\\/\\\\}"
ESC="${ESC//\"/\\\"}"
ESC="${ESC//$'\n'/\\n}"
ESC="${ESC//$'\r'/\\r}"
ESC="${ESC//$'\t'/\\t}"
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}\n' "$ESC"
exit 0
