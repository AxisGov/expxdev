#!/usr/bin/env bash
# Bancada do modo subagente (0.13.22, bloco C): o `cwd` que os hooks recebem de
# dentro de um subagente, com `git -C`/`cd` e com `isolation: "worktree"`.
# Roda o `claude` REAL, só num projeto temporário, com `--setting-sources project`.
# Custa tokens (haiku). Não entra na suíte.
#   bash scripts/bancada-subagente-cwd.sh <dir-de-saida> nucleo/hooks/expx-rastro.sh
# Resultado de 2026-11-09: docs/superpowers/specs/2026-11-09-bancada-subagente-cwd.md
set -euo pipefail
SAIDA="${1:?uso: bancada-subagente-cwd.sh <dir-de-saida> <expx-rastro.sh>}"
RASTRO="${2:?uso: bancada-subagente-cwd.sh <dir-de-saida> <expx-rastro.sh>}"
mkdir -p "$SAIDA"
SAIDA="$(cd "$SAIDA" && pwd)"
P="$(mktemp -d /var/tmp/bancada-subagente.XXXXXX)"
WT="$P-wt"
LOG="$SAIDA/payloads.jsonl"
: > "$LOG"

git -C "$P" init -q -b main
git -C "$P" -c user.name=bancada -c user.email=bancada@exemplo.invalid commit -q --allow-empty -m inicial
git -C "$P" worktree add -q -b outra "$WT"

mkdir -p "$P/.claude"
cp "$RASTRO" "$P/.claude/expx-rastro.sh"
cat > "$P/.claude/grava.sh" <<EOF
#!/usr/bin/env bash
# grava o payload bruto e o \$PWD do processo do hook, uma linha por evento
entrada="\$(cat)"
printf '{"pwd_do_hook":"%s","payload":%s}\n' "\$PWD" "\$entrada" >> "$LOG"
# o escritor REAL do nucleo, com a raiz pelo cwd do payload, como os hooks do expx
. "\$(dirname "\$0")/expx-rastro.sh"
cwd="\$(expx_json_get "\$entrada" cwd)"; [ -n "\$cwd" ] || cwd="\$PWD"
ev="\$(expx_json_get "\$entrada" hook_event_name)"
EXPX_AGENTE="\$(expx_json_get "\$entrada" agent_type | tr -c 'a-z0-9-' '-')"; [ "\$EXPX_AGENTE" != "" ] || EXPX_AGENTE=principal
export EXPX_AGENTE
expx_rastro_grava "\$(expx_raiz "\$cwd")" bancada_hook hook ok "\$ev"
exit 0
EOF
chmod +x "$P/.claude/grava.sh"
H='[{"hooks":[{"type":"command","command":"bash \"$CLAUDE_PROJECT_DIR/.claude/grava.sh\""}]}]'
HM='[{"matcher":"*","hooks":[{"type":"command","command":"bash \"$CLAUDE_PROJECT_DIR/.claude/grava.sh\""}]}]'
cat > "$P/.claude/settings.json" <<EOF
{"hooks":{"SessionStart":$H,"PreToolUse":$HM,"PostToolUse":$HM,"SubagentStart":$H,"SubagentStop":$H}}
EOF
git -C "$P" add .claude && git -C "$P" -c user.name=bancada -c user.email=bancada@exemplo.invalid commit -q -m hooks

PEDIDO="Faça exatamente isto, sem mais nada:
1. Use a ferramenta Agent (subagent_type general-purpose) com o pedido: \"Rode no Bash, um comando por vez: git -C $WT status --short ; depois: cd $WT && pwd ; depois: pwd. Responda só OK.\"
2. Use a ferramenta Agent (subagent_type general-purpose) com isolation \"worktree\" e o pedido: \"Rode no Bash: pwd ; depois crie com a ferramenta Write o arquivo marca.txt (caminho relativo ao diretório atual) com o texto x. Responda só OK.\"
Responda só FIM."

cd "$P"
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION \
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_EFFORT \
  -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_AGENT_SDK_VERSION \
  claude -p --setting-sources project --model haiku \
    --allowedTools "Agent Bash Write" --output-format json "$PEDIDO" > "$SAIDA/resultado.json" 2> "$SAIDA/stderr.txt" || echo "claude saiu $?" >> "$SAIDA/stderr.txt"
claude --version > "$SAIDA/versao.txt"
git -C "$P" worktree list > "$SAIDA/worktrees.txt"
find "$P" "$WT" -name marca.txt > "$SAIDA/marca.txt" 2>/dev/null || true
for d in "$P" "$WT" "$P"/.claude/worktrees/*; do for f in "$d"/docs/eventos/*.jsonl; do [ -f "$f" ] && printf '%s\t%s\n' "$f" "$(wc -l < "$f")"; done; done > "$SAIDA/jsonl.txt" 2>/dev/null || true
find /var/tmp -maxdepth 6 -path "*bancada-subagente*" -name marca.txt >> "$SAIDA/marca.txt" 2>/dev/null || true
printf 'projeto=%s\nworktree=%s\n' "$P" "$WT" > "$SAIDA/caminhos.txt"
echo "ok: $SAIDA"
