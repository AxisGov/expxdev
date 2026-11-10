#!/usr/bin/env bash
# Bancada do subagente com `isolation: "worktree"` (0.13.26; CONTRATO-expx-orquestracao §15.1): o
# `expx-worktree-isolada.sh` do núcleo de dentro de um subagente comum e de subagentes isolados, a
# adoção da worktree do agente (branch nova e branch livre), a branch ocupada, e o que o Claude Code
# faz com a worktree depois.
# Roda o `claude` REAL, só num projeto temporário, com `--setting-sources project`.
# Custa tokens (haiku). Não entra na suíte.
#   bash scripts/bancada-subagente-isolado.sh <dir-de-saida> nucleo/scripts/expx-worktree-isolada.sh
# Resultado de 2026-11-10: docs/superpowers/specs/2026-11-10-bancada-subagente-isolado.md
set -euo pipefail
SAIDA="${1:?uso: bancada-subagente-isolado.sh <dir-de-saida> <expx-worktree-isolada.sh>}"
DETECTA="${2:?uso: bancada-subagente-isolado.sh <dir-de-saida> <expx-worktree-isolada.sh>}"
mkdir -p "$SAIDA"
SAIDA="$(cd "$SAIDA" && pwd)"
P="$(mktemp -d /var/tmp/bancada-isolado.XXXXXX)"
LOG="$SAIDA/payloads.jsonl"
: > "$LOG"
G=(-c user.name=bancada -c user.email=bancada@exemplo.invalid)
N=.expx/marketplace/plugins/expx/nucleo/scripts

git -C "$P" init -q -b main
git -C "$P" "${G[@]}" commit -q --allow-empty -m inicial
mkdir -p "$P/.claude" "$P/$N"
cp "$DETECTA" "$P/$N/expx-worktree-isolada.sh"
cat > "$P/.claude/grava.sh" <<EOF
#!/usr/bin/env bash
# o payload bruto, o \$PWD e a branch no \$PWD, uma linha por evento
entrada="\$(cat)"
b="\$(git branch --show-current 2>/dev/null)"
printf '{"pwd_do_hook":"%s","branch":"%s","payload":%s}\n' "\$PWD" "\$b" "\$entrada" >> "$LOG"
exit 0
EOF
chmod +x "$P/.claude/grava.sh"
H='[{"hooks":[{"type":"command","command":"bash \"$CLAUDE_PROJECT_DIR/.claude/grava.sh\""}]}]'
HM='[{"matcher":"Bash","hooks":[{"type":"command","command":"bash \"$CLAUDE_PROJECT_DIR/.claude/grava.sh\""}]}]'
cat > "$P/.claude/settings.json" <<EOF
{"hooks":{"PostToolUse":$HM,"SubagentStart":$H,"SubagentStop":$H}}
EOF
git -C "$P" add .claude .expx && git -C "$P" "${G[@]}" commit -q -m hooks
# a branch livre (sem worktree) e a ocupada (numa worktree humana)
git -C "$P" branch feature/livre
git -C "$P" worktree add -q -b feature/ocupada "$P-ocupada"

D="bash $N/expx-worktree-isolada.sh; echo rc=\$?"
C="git -c user.name=b -c user.email=b@exemplo.invalid commit -q -m"
PEDIDO="Faça exatamente isto, um passo de cada vez, esperando cada subagente terminar antes de abrir o próximo (nunca dois ao mesmo tempo), sem mais nada:
1. Ferramenta Agent (subagent_type general-purpose), SEM isolation, com o pedido: \"Rode no Bash: $D. Responda só com a saída.\"
2. Ferramenta Agent (subagent_type general-purpose) com isolation \"worktree\" e o pedido: \"Rode no Bash, um comando por vez, sem mudar nenhum: $D ; git status --porcelain ; git switch -c feature/nova --no-track main ; printf 'x\\\\n' > nova.txt ; git add nova.txt ; $C nova ; git branch --show-current ; $D. Responda só com as saídas, na ordem.\"
3. Ferramenta Agent (subagent_type general-purpose) com isolation \"worktree\" e o pedido: \"Rode no Bash, um comando por vez, sem mudar nenhum: $D ; git switch feature/livre ; printf 'y\\\\n' > livre.txt ; git add livre.txt ; $C livre ; git branch --show-current. Responda só com as saídas, na ordem.\"
4. Ferramenta Agent (subagent_type general-purpose) com isolation \"worktree\" e o pedido: \"Rode no Bash, um comando por vez, sem mudar nenhum: $D ; git switch feature/ocupada; echo rc=\$? ; git branch --show-current. Responda só com as saídas, na ordem.\"
Responda com as quatro respostas, numeradas."

cd "$P"
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION \
  -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID -u CLAUDE_EFFORT \
  -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_AGENT_SDK_VERSION \
  claude -p --setting-sources project --model haiku \
    --allowedTools "Agent Bash" --output-format json "$PEDIDO" > "$SAIDA/resultado.json" 2> "$SAIDA/stderr.txt" || echo "claude saiu $?" >> "$SAIDA/stderr.txt"
claude --version > "$SAIDA/versao.txt"
git -C "$P" worktree list --porcelain > "$SAIDA/worktrees.txt"
git -C "$P" branch -a -v --no-abbrev > "$SAIDA/branches.txt"
git -C "$P" log --all --oneline --graph > "$SAIDA/log.txt"
printf 'projeto=%s\nocupada=%s\n' "$P" "$P-ocupada" > "$SAIDA/caminhos.txt"
echo "ok: $SAIDA"
