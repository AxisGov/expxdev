# Baseline da otimização da arquitetura das skills Expx

Data: 2026-10-21. Escopo executado: somente Fase 1 / Task 1 do plano
`2026-10-21-otimizacao-arquitetura-skills-expx.md`.

## Ambiente efetivo

- executor: Codex, sem Claude e sem subagentes;
- modelo exato e esforço: não expostos pelo runtime desta sessão;
- sistema: Windows, PowerShell, Git Bash e Bash/WSL para as suítes RunX;
- Node: `v24.18.0`;
- npm: `11.16.0`;
- Python: `3.13.15`.

## Bases e worktrees

| Repositório | Base | Branch | Worktree |
|---|---|---|---|
| `AxisGov/expxdev` | `5cb817ba7899585ecbe59bfeee904f062c95ca1a` | `feat/otimiza-skills-expx` | `F:/Projetos/.worktrees/expxdev-otimiza-skills` |
| `bittencourtthulio/runx` | `4480d7817da730f743c3cd2c0c6199addcd87bb1` | `feat/otimiza-skills-expx` | `F:/Projetos/.worktrees/runx-otimiza-skills` |

O ExpxDev parte do commit que contém o plano aprovado. O RunX parte do `HEAD`
de `main` confirmado no remoto canônico e no clone local. A worktree aninhada
`F:/Projetos/expxdev/node_modules/.worktrees/otimiza-skills-expx` não foi
modificada, movida ou removida.

## Preparação registrada

| Comando | Diretório | Exit | Duração | Resultado |
|---|---|---:|---:|---|
| `git ls-remote https://github.com/bittencourtthulio/runx.git HEAD refs/heads/main` | `F:/Projetos` | 0 | 0,725 s | confirmou `4480d78` para HEAD e main |
| `git clone --branch main --single-branch ... F:/Projetos/runx` | `F:/Projetos` | 0 | 1,443 s | clone administrativo criado |
| `git worktree add ...expxdev-otimiza-skills -b feat/otimiza-skills-expx 5cb817b` | `F:/Projetos/expxdev` | 0 | 0,884 s | worktree ExpxDev criada |
| `git worktree add ...runx-otimiza-skills -b feat/otimiza-skills-expx 4480d78` | `F:/Projetos/runx` | 0 | 0,475 s | worktree RunX criada |
| `npm.cmd ci` | worktree ExpxDev | 0 | 9,819 s | 220 pacotes instalados a partir do lockfile |

O `npm ci` informou 6 vulnerabilidades do lockfile (4 moderadas e 2 altas).
Nenhum `npm audit fix` foi executado.

## Baseline ExpxDev

| Comando | Diretório | Exit | Duração | Resultado | Classificação |
|---|---|---:|---:|---|---|
| `npm.cmd test` | `F:/Projetos/.worktrees/expxdev-otimiza-skills` | 0 | 522,555 s | 130 arquivos passaram, 1 ignorado; 1.320 testes passaram, 31 ignorados | verde |
| `npm.cmd run typecheck` | `F:/Projetos/.worktrees/expxdev-otimiza-skills` | 0 | 5,672 s | dois projetos TypeScript sem erro | verde |

Os avisos LF/CRLF e mensagens `not a git repository` foram emitidos por
fixtures durante a suíte, sem reprovação.

## Baseline RunX

| Comando | Diretório | Exit | Duração | Resultado | Classificação |
|---|---|---:|---:|---|---|
| `bash .claude/hooks/testes/testar.sh` — primeira tentativa | worktree RunX | 2 | 0,293 s | Bash recusou scripts convertidos para CRLF | causada pela preparação |
| mesmo comando após `checkout-index` | worktree RunX | 2 | 0,375 s | checkout físico ainda continha CRLF | causada pela preparação |
| mesmo comando após recriar a worktree com `core.autocrlf=false` | worktree RunX | 0 | 11,336 s | 86 casos, 0 falhas | verde |
| `bash .claude/hooks/testes/testar-conteudo.sh` | worktree RunX | 0 | 0,688 s | 33 casos, 0 falhas | verde |
| `bash .claude/hooks/testes/testar-espelho.sh` | worktree RunX | 0 | 0,369 s | 2 casos, 0 falhas | verde |

A correção ambiental foi local e reversível: `core.autocrlf=false` no clone
RunX e recriação somente da worktree nova e limpa. A suíte de hooks emite um
aviso preexistente sobre as chaves extras `harness` e `sessao` no rastro, mas
termina com exit 0 e `86 ok, 0 falhas`.

## Integração cruzada local — Task 14

- Fonte ExpxDev: esta worktree, com o hook empacotado no commit `45af739`.
- Fonte RunX: `F:/Projetos/.worktrees/runx-otimiza-skills`, fornecida
  explicitamente por `EXPX_RUNX_CANONICA`; a bancada cria somente uma cópia Git
  descartável sob o temporário do teste para o mecanismo oficial
  `EXPX_SKILLS_LOCAIS`.
- RED: apontar apenas para o diretório pai da worktree resolveu a origem remota,
  não a worktree local; o teste falhou antes do alias temporário.
- GREEN ExpxDev: `npm.cmd test -- src/cli/certificacao-p02.test.ts` com a variável
  explícita — 52/52 testes, exit 0, 155,75 s.
- GREEN RunX: `bash .claude/hooks/testes/testar-instalacao.sh` — 6/6 controles,
  exit 0.
- A instalação temporária recebeu os três artefatos do lembrete, `timeout: 1`
  sem `onFailure`, núcleo RunX ≤8 KB, referências e agentes novos. Uma segunda
  instalação removeu uma adulteração deliberada e restaurou o hash canônico.
- Nenhum consumidor real e nenhuma cópia RunX dentro do ExpxDev foram alterados.

## Comparação com os critérios da Fase 1

- worktrees externas aos `node_modules`: atendido;
- bases registradas: atendido;
- ExpxDev `npm.cmd test`: verde;
- ExpxDev `npm.cmd run typecheck`: verde;
- RunX `testar.sh`: verde;
- RunX `testar-conteudo.sh`: verde;
- RunX `testar-espelho.sh`: verde;
- nenhuma correção de produto, teste ou contrato: atendido;
- nenhuma tarefa RED da Fase 2 iniciada: atendido.

## P1-FASE-1-BASELINE

Decisão: **APTO PARA A FASE 2**, condicionada a autorização explícita em nova
retomada. A próxima ação exata é iniciar a Task 2 no worktree ExpxDev, escrevendo
os testes RED de classificação, identidades e deduplicação. Esta execução para
antes disso.
