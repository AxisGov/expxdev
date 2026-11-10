# Bancada do modo subagente — o `cwd` dos hooks dentro de um subagente (2026-11-09)

Pergunta (handoff da 0.13.21, bloco C; parecer do Codex de 2026-11-09): a opção **B** existe? Isto
é, há um subagente que entra de fato numa worktree e recebe o `cwd` dela no payload dos hooks?

## Como

`scripts/bancada-subagente-cwd.sh`, duas rodadas, com o `claude` 2.1.319 (Claude Code) real, num
projeto temporário em `/var/tmp`, `--setting-sources project`, `--model haiku` (US$ 0,006 cada).
O projeto tem uma worktree `outra` e hooks de projeto em `SessionStart`, `PreToolUse`,
`PostToolUse`, `SubagentStart` e `SubagentStop` que gravam o payload bruto e o `$PWD` do processo
e chamam o `expx_rastro_grava` **real** do núcleo (`nucleo/hooks/expx-rastro.sh`), com a raiz pelo
`expx_raiz` do `cwd` do payload, como os hooks do expx. O pedido manda a sessão abrir dois
subagentes `general-purpose`:

1. comum, que roda `git -C <wt> status --short`, `cd <wt> && pwd` e `pwd`;
2. com `isolation: "worktree"`, que roda `pwd` e escreve `marca.txt` pelo `Write`.

## Resultado

| Evento | `cwd` do payload | `$PWD` do hook | `agent_id` |
|---|---|---|---|
| `SessionStart`, `PreToolUse`/`PostToolUse` do `Agent` | checkout | checkout | — |
| subagente 1: `SubagentStart`, `Pre`/`PostToolUse` (Bash `git -C`, `cd … && pwd`, `pwd`), `SubagentStop` | checkout | checkout | o do 1 |
| subagente 2: `SubagentStart`, `Pre`/`PostToolUse` (Bash `pwd`, `Write`), `SubagentStop` | `<checkout>/.claude/worktrees/agent-<id>` | a mesma | o do 2 |

- O escritor real gravou **13** eventos em `<checkout>/docs/eventos/sem-trabalho.jsonl` (o
  principal e todo o subagente 1) e **6** em
  `<checkout>/.claude/worktrees/agent-<id>/docs/eventos/sem-trabalho.jsonl` (todo o subagente 2).
- A worktree do subagente 2 é criada pelo Claude Code a partir do `HEAD`, na branch
  `worktree-agent-<id>`; o `marca.txt` ficou nela.
- Correlação: o `PostToolUse` do `Agent` traz `tool_response.agentId`, igual ao `agent_id` do
  `SubagentStart`; o `tool_use_id` só aparece no `Pre`/`PostToolUse` do `Agent`, não no
  `SubagentStart`.

## Conclusão

- **A opção A vale:** com o subagente comum, `git -C` e `cd` não mudam o `cwd` do payload, e todo
  hook do expx resolve o checkout da sessão. A runx e a sprintx não rodam assim
  (CONTRATO-expx-orquestracao §15).
- **A B existe só como compatibilidade de `cwd`:** com `isolation: "worktree"`, o payload e o
  processo do hook seguem a worktree do subagente, e o rastro cai nela. Não é suportado: o E0 da
  mergex não adota a branch `worktree-agent-<id>` (exige a branch do trabalho já ativa,
  `mergex/references/00-abertura.md`, caso C), e o fluxo E0–E5 inteiro, a integridade final e o
  OpenCode não foram provados nesse modo.
- A D (vínculo por `(session_id, agent_id)`) não foi aberta: só se o dono disser que o modo
  subagente é requisito do produto.
