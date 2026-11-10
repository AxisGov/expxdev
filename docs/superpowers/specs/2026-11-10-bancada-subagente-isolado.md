# Bancada do subagente isolado — a adoção da worktree do agente (2026-11-10)

Pergunta (pendência 3 do handoff da 0.13.24; decisão do Flávio de suportar o modo; desenho com o
Codex em duas rodadas): o subagente com `isolation: "worktree"` pode adotar a própria worktree como
a do trabalho, em vez de criar outra longe do `cwd` que os hooks recebem? E o Claude Code mantém
essa worktree depois?

## Como

`scripts/bancada-subagente-isolado.sh`, com o `claude` 2.1.319 (Claude Code) real, num projeto
temporário em `/var/tmp`, `--setting-sources project`, `--model haiku`. O projeto tem o
`nucleo/scripts/expx-worktree-isolada.sh` no caminho instalado (`.expx/marketplace/...`), hooks de
projeto em `PostToolUse` (Bash), `SubagentStart` e `SubagentStop` que gravam o payload, o `$PWD` e a
branch do `$PWD`, uma branch `feature/livre` sem worktree e uma `feature/ocupada` numa worktree
humana. O pedido abre quatro subagentes, um de cada vez:

1. comum (sem isolamento): roda o script;
2. isolado: o script, `git switch -c feature/nova --no-track main`, um commit, o script de novo;
3. isolado: o script, `git switch feature/livre`, um commit;
4. isolado: o script, `git switch feature/ocupada`.

Uma rodada anterior, sem o script, mediu que o `<id>` do caminho `.claude/worktrees/agent-<id>` é o
`agent_id` do payload, e que a branch inicial é `worktree-agent-<id>`.

## Resultado

| Subagente | Script | Troca | Worktree no fim |
|---|---|---|---|
| 1, comum, no checkout | sai 1 | — | — |
| 2, isolado, branch nova | `isolada`; depois do switch, sai 1 | `feature/nova` criada na própria worktree, commit nela | mantida, em `feature/nova` |
| 3, isolado, branch livre | `isolada` | `feature/livre` ativada na própria worktree, commit nela | mantida, em `feature/livre` |
| 4, isolado, branch ocupada | `isolada` | `git switch` sai 128: `'feature/ocupada' is already used by worktree at …` | removida pelo Claude Code (sem mudança) |

- Todo `SubagentStart`, `PostToolUse` e `SubagentStop` dos isolados trouxe como `cwd` a worktree do
  agente, antes e depois da troca; a branch lida no `$PWD` do hook já era a do trabalho logo depois
  do `git switch`.
- Nenhuma worktree adicional foi criada. As `worktree-agent-<id>` dos subagentes 2 e 3 sobraram como
  branches sem worktree; o expx não as apaga.
- O haiku separou `bash …; echo rc=$?` em duas chamadas (o Bash recusou a linha composta numa delas);
  o resultado do script não mudou por isso.

## Conclusão

- A adoção funciona: com `isolada`, a branch do trabalho nasce (ou é retomada, se livre) na própria
  worktree do agente, que o Claude Code mantém, e os hooks a seguem. A branch em outra worktree
  para pelo próprio Git, sem mexer em nada (CONTRATO-expx-orquestracao §15.1).
- A mergex não muda: depois da troca, o E0 encontra a branch do trabalho ativa (caso A).
- Não provado: o fluxo F1–F7 da sprintx e E1–E5 da runx inteiros executados pelo modelo nesse modo,
  a integridade final de um aprovador dentro dele e o macOS.
