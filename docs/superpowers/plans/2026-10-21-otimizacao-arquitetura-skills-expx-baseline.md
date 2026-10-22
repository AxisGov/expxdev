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

## Benchmark interrompido — Task 15

Comando: `node scripts/benchmark-expx-lembrete.mjs --json`, Windows x64,
Node `v24.18.0`, wrapper real pelo Git Bash, 10 aquecimentos e 200 amostras por
cenário.

| Cenário | p50 | p95 | Bytes |
|---|---:|---:|---:|
| primeira injeção | 462,787 ms | 694,976 ms | 227 |
| repetição suprimida | 486,451 ms | 676,537 ms | 0 |
| fallback shell stateless | 928,886 ms | 1.143,977 ms | 493 |

O volume atende ao limite de 768 bytes e a supressão produz zero byte, mas os
três p95 excedem o orçamento imutável de 100 ms. Conforme a condição de parada
da Task 15, o limite não foi elevado, a Task 16 não começou e nenhuma revisão,
push ou PR foi executada.

### Decomposição do piso — investigação autorizada

Diagnóstico rápido feito pelo mesmo `spawnSync`, com 5 aquecimentos e 30
amostras por componente, sem alteração de produção:

| Componente | p50 | p95 | Processos externos por caminho |
|---|---:|---:|---:|
| overhead do harness | 0,000 ms | 0,000 ms | 0 |
| processo vazio (`cmd /c exit 0`) | 13,118 ms | 14,862 ms | 1 |
| inicialização Git Bash (`bash -c :`) | 40,137 ms | 167,561 ms | 1 |
| script shell no-op | 41,239 ms | 60,531 ms | 1 |
| `node -e ""` | 46,620 ms | 53,483 ms | 1 |
| `node --version` | 25,008 ms | 154,360 ms | 1 |
| módulo ESM direto, com estado | 60,509 ms | 68,588 ms | 1 |
| wrapper, primeira injeção | 280,733 ms | 651,896 ms | 5 |
| wrapper, repetição suprimida | 373,845 ms | 651,866 ms | 5 |
| fallback shell | 726,484 ms | 1.392,229 ms | mínimo 12 |
| lock por `mkdir` | 0,471 ms | 0,680 ms | 0 adicionais |
| leitura do estado | 0,060 ms | 0,098 ms | 0 adicionais |
| fsync + rename atômico | 1,936 ms | 2,666 ms | 0 adicionais |

O caminho normal inicia `bash`, `cat`, `dirname`, `node --version` e o Node do
módulo. O fallback acrescenta parsing/normalização/classificação por processos
externos (`jq`, Python e cinco `grep` neste cenário). O estado seguro não é a
causa dominante: lock, leitura e escrita atômica somam poucos milissegundos,
enquanto o encadeamento de processos explica o custo incremental do wrapper.

Como a primeira medição do Bash contrastou com o no-op, o piso foi confirmado
isoladamente pelo mesmo mecanismo: 10 aquecimentos e 50 amostras de
`bash -c :` deram p50 39,566 ms, p95 154,539 ms e faixa 34,108–270,015 ms.
Portanto, o custo inevitável anterior ao hook já viola o orçamento p95 de
100 ms. Esse diagnóstico motivou a decisão humana posterior de manter 100 ms
absolutos em POSIX/WSL e usar delta pareado de 100 ms no Windows/Git Bash.

Proposta formal, não aplicada: preferir execução nativa do módulo ESM sem Git
Bash, pois o caminho direto mediu p95 68,588 ms e preserva o motor e o estado
seguro. Alternativas que também exigem decisão explícita são orçamento por
plataforma, orçamento incremental acima do piso de spawn ou processo
persistente que elimine um spawn por prompt.

### Gate incremental pareado — decisão humana e duas tentativas

A especificação e o plano passaram a exigir 10 aquecimentos e 200 amostras
intercaladas. A decisão humana final definiu o gate do Windows/Git Bash como
`max(0, p95 candidato - p95 baseline equivalente) <= 100 ms`. O p95 dos
deltas amostra a amostra permanece publicado apenas como diagnóstico dos picos
não correlacionados do scheduler.

A primeira tentativa removeu `cat`, `dirname`, `node --version`, `jq`, Python,
`grep`, `sed` e `awk` do wrapper. O caminho normal caiu de cinco executáveis
para Bash + um Node, com saída capturada antes de publicação; o fallback caiu
para apenas Bash. O commit local é `011371e`.

| Tentativa 1 | Absoluto p50/p95 | Baseline p50/p95 | Incremental p95 | Delta pareado p50/p95 | Bytes |
|---|---:|---:|---:|---:|---:|
| primeira injeção | 142,575/240,811 ms | 118,632/225,180 ms | 15,631 ms | 21,948/126,293 ms | 0–226* |
| repetição | 135,787/247,574 ms | 117,556/219,347 ms | 28,227 ms | 19,067/127,958 ms | 0 |
| fallback | 37,273/50,972 ms | 34,217/44,048 ms | 6,924 ms | 2,999/8,650 ms | 467 |

\* O primeiro benchmark reutilizou dez identidades de aquecimento nas amostras;
isso explicou os zeros e foi corrigido antes da segunda medição, sem mudar o
gate da tentativa.

A segunda tentativa removeu o bootstrap `node -e` e o import dinâmico: a
checagem de versão e o marcador de sucesso foram para o entrypoint do módulo,
que passou a ser executado diretamente pelo único Node.

| Tentativa 2 | Absoluto p50/p95 | Baseline p50/p95 | Incremental p95 | Delta pareado p50/p95 | Bytes |
|---|---:|---:|---:|---:|---:|
| primeira injeção | 137,717/242,785 ms | 120,721/227,975 ms | 14,810 ms | 15,260/122,156 ms | 226 |
| repetição | 133,252/241,652 ms | 120,528/219,921 ms | 21,731 ms | 14,283/120,674 ms | 0 |
| fallback | 36,955/47,111 ms | 34,591/43,652 ms | 3,459 ms | 2,401/10,174 ms | 467 |

Esses números anteriores são somente diagnóstico e não serão reutilizados como
prova final. A Task 15 exige uma medição fresca pela fórmula corrigida antes de
qualquer commit de benchmark ou início da Task 16.

### Medição fresca — gate corrigido

Comando: `node scripts/benchmark-expx-lembrete.mjs --json`, Windows x64,
Node `v24.18.0`, Git Bash, 10 aquecimentos e 200 amostras intercaladas por
cenário e baseline equivalente. Esta é a medição usada para a decisão.
Ela foi executada em processo dedicado; a suíte paralela não repete o gate,
pois sua contenção altera a configuração do experimento.

| Cenário | Absoluto p50/p95 | Baseline p50/p95 | Incremental p95 | Delta pareado p50/p95 | Bytes |
|---|---:|---:|---:|---:|---:|
| primeira injeção | 134,216/244,875 ms | 118,888/345,366 ms | **0,000 ms** | 13,814/122,460 ms | 226 |
| repetição | 152,468/355,697 ms | 136,807/306,432 ms | **49,265 ms** | 14,924/178,623 ms | 0 |
| fallback | 37,281/151,987 ms | 34,830/147,851 ms | **4,136 ms** | 2,256/110,696 ms | 467 |

O gate `percentile_difference_p95_ms` ficou verde nos três cenários. O p95
dos deltas pareados permanece visível como diagnóstico, sem participar do
veredito. O caminho normal usa Bash + um Node; o fallback usa somente Bash.
O volume permanece dentro de 768 bytes e a supressão emite zero byte.

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

## BASELINE-POS-MUDANCA

- ExpxDev: base `5cb817b`; Task 15 em `4dda809`; correção da revisão em
  `aed93c0`; suíte final com 131 arquivos verdes, 1 arquivo deliberadamente
  opt-in, 1.348 testes verdes e 32 pulados; typecheck e `git diff --check`
  verdes.
- RunX: base `4480d78`; implementação e correção da revisão até `b9b1041`;
  bancadas finais `90/90`, `50/50`, `12/12`, `4/4` e `7/7`, ponte `11/11`,
  com `git diff --check` verde.
- Núcleo RunX: 20.363 → 5.169 bytes, redução de 15.194 bytes (74,6%);
  estimativa de tokens 5.091 → 1.293. O limite de 8.000 bytes e a redução
  mínima de 60,7% foram atendidos.
- Matriz: 24/24. Casos 1–18, 20, 22 e 24 estão nomeados em
  `src/nucleo/expx-lembrete.test.ts`; caso 19 está em
  `src/harness/settings.test.ts`; caso 21 também cobre transição/JSONL/handoff
  em `.claude/hooks/testes/testar-estado.sh`; caso 23 é o benchmark dedicado.
- Benchmark oficial Windows/Git Bash: 10 aquecimentos + 200 amostras
  intercaladas; incremental p95 de 0,000 ms na primeira injeção, 49,265 ms na
  repetição e 4,136 ms no fallback. Os três cenários atendem ≤100 ms; absolutos
  e deltas pareados diagnósticos permanecem registrados na seção anterior.
- Volume: 226 bytes na primeira injeção, zero na supressão e 467 bytes no
  fallback. Caminho normal com Bash + um Node; fallback somente Bash.
- O comando dedicado retorna exit 1 quando `gate.passed` é falso; essa decisão
  tem teste unitário e não exige repetir as 200 amostras.
- Fontes canônicas e instalação: espelhos idênticos, três artefatos do hook
  preservados byte a byte e sincronização sem restauração da versão antiga.
- Revisão final única: 0 Critical e 5 Important, todos fechados em uma rodada
  TDD, sem segunda leitura. Foram cobertos bootstrap E1→E2, término após
  reconstrução, recuperação no Claude/OpenCode/MimoCode, regras de caminho e
  exit code do benchmark.

### Ocorrência de fatiamento na validação da PR #73

- A falha integral de `L3: 100 arquivos passam e 101 reprovam, sem qualquer
  desconto` não foi reproduzida: o caso isolado passou, o arquivo completo
  passou com 21/21 testes e o lote focal passou com 115 testes e 2 ignorados.
- Nenhum processo órfão de Node, Bash, Git ou Vitest e nenhum temporário do
  fatiamento permaneceu após as três execuções.
- Classificação provisória: **C — provável contenção da suíte paralela**. A
  decisão é não alterar `fatiamento.test.ts`, `verificar-fatiamento.sh`,
  `expx-limites.mjs` nem `candidatos.ts`; a CI limpa em Windows e Ubuntu é o
  gate integral da P1.
