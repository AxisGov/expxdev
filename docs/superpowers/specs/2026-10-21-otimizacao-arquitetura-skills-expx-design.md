# Otimização da arquitetura de instruções e execução das skills Expx

Data: 2026-10-21. Repositórios envolvidos: `AxisGov/expxdev` e
`bittencourtthulio/runx`. Estado: **abordagem arquitetural aprovada;
especificação aguardando revisão do usuário; implementação ainda não
iniciada**.

## 1. Objetivo e limites

Reduzir o contexto carregado, as chamadas de agentes e as regravações de
estado sem alterar a sequência semântica do RunX:

```text
E1 INVESTIGAÇÃO → E2 PLANO → E3 FIX → E4 QA → E5 RELATÓRIO
```

A mudança preserva os artefatos determinísticos, o schema, os nomes de estágio,
as regras invioláveis e a retomada pelo estado em disco. Ela não publica
pacote, não faz push, PR ou merge e não modifica consumidores externos.

Ficam fora do escopo:

- mudar o resultado funcional de qualquer estágio;
- eliminar investigação, plano, teste de regressão, QA ou relatório;
- migrar ou reescrever artefatos de ocorrências existentes;
- otimizar outras skills além do roteamento compartilhado que afeta o RunX.

## 2. Fontes canônicas

| Peça | Fonte canônica | Cópias/saídas |
|---|---|---|
| Hook de lembrete | `expxdev/nucleo/hooks/expx-lembrete.sh` e o novo módulo irmão | `.claude/hooks/` e marketplace gerados pelo CLI |
| Instalação do hook | `expxdev/src/harness/hooks.ts` e settings do harness | instalação em projetos |
| RunX para Claude | `runx/.claude/skills/runx/` | árvore instalada pelo `install.sh` |
| RunX para OpenCode | espelho produzido da árvore Claude | `runx/.opencode/skills/runx/` |

A cópia `expxdev/.claude/skills/runx/` não é fonte: é uma instalação histórica e
não será editada como solução. O catálogo de `expxdev/src/nucleo/catalogo.ts`
continua apontando para o repositório RunX. A implementação ocorrerá nas duas
fontes canônicas, em branches/worktrees próprias, sem tocar consumidores.

Hoje o RunX apenas compara os espelhos. A mudança torna
`.claude/skills/runx/` a fonte declarada e acrescenta uma sincronização
determinística para `.opencode/skills/runx/`; o teste de espelho continua sendo
o portão que detecta divergência.

## 3. Medição inicial e mapa de duplicação

### 3.1 Tamanho

A versão canônica corrente do `SKILL.md` mede 20.363 bytes, 276 linhas e cerca
de 5.091 tokens pela aproximação conservadora `ceil(bytes/4)`. A cópia instalada
auditada mede 17.330 bytes, 256 linhas e cerca de 4.333 tokens.

Na cópia instalada, as referências somam 129.323 bytes, 2.029 linhas e cerca
de 32.331 tokens; os templates somam 45.786 bytes, 1.047 linhas e cerca de
11.447 tokens. Eles já são carregados sob demanda e continuarão assim.

Meta verificável para o núcleo canônico: no máximo 8.000 bytes e cerca de 2.000
tokens, redução mínima de 60,7% contra os 20.363 bytes atuais. A meta não será
atingida apagando regra: conteúdo fora das cinco responsabilidades do núcleo
vai para a referência do estágio que o consome.

### 3.2 Duplicação literal encontrada

As inspeções foram feitas uma referência por vez. Na árvore instalada, foram
encontradas estas repetições representativas:

| Trecho/conceito | Ocorrências | Fonte única depois da mudança |
|---|---:|---|
| `Frontmatter obrigatório` | 11 | schema de artefatos |
| `NUNCA omita uma chave` | 11 | schema de artefatos |
| `Substitua os marcadores` | 10 | instrução comum de templates |
| `escopo travado` | 10 | invariante no núcleo; procedimento em E3 |
| `Coincidência de arquivo` | 7 | referência de schema/validação |
| `Toda transição de estágio atualiza` | 5 | política operacional de transição |
| `Diagrama é derivado` | 4 | referência de diagramas |
| `quem implementa não aprova` | 3 | invariante no núcleo |

O teste não proíbe vocabulário necessário em contextos distintos. Ele proíbe
blocos normativos idênticos: cada regra tem uma fonte normativa; referências e
templates apontam para ela sem copiá-la.

## 4. Núcleo mínimo do RunX

O `SKILL.md` passa a conter somente:

1. frontmatter e gatilho da skill;
2. invariantes invioláveis;
3. máquina de estados e retornos permitidos;
4. tabela de roteamento do estágio atual para uma única referência e os
   templates necessários;
5. condição de término.

Saem do núcleo: exemplos completos, schemas de frontmatter, contratos de task,
fase e sprint, layout detalhado de diretórios, procedimentos de hooks, formato
de eventos, instruções de preenchimento, exemplos de agentes e templates.

### 4.1 Alocação normativa

| Conteúdo | Destino |
|---|---|
| enums, schema, chaves obrigatórias e compatibilidade | `references/00-schema.md` |
| descoberta/criação da ocorrência e entrada | `references/01-investigacao.md` |
| prova de causa e investigação | `references/01-investigacao.md` |
| decomposição, contratos e plano | `references/02-plano.md` |
| TDD, execução, bloqueios e revisão do teste | `references/03-fix.md` |
| lote de QA, veredito e retorno E4→E3 | `references/04-qa.md` |
| relatórios e encerramento | `references/05-relatorio.md` |
| transição, estado, handoff, eventos e política de sessão | `references/06-estado.md` |
| diagramas derivados | `references/07-diagrama.md` |
| forma concreta dos documentos | `assets/TEMPLATE-*` |

O roteador manda ler apenas a referência do estágio atual. `00-schema` e
`06-estado` são lidas quando uma operação daquele estágio realmente precisa
validar ou transicionar um artefato; não viram prólogo obrigatório. O template
é lido somente antes de criar o arquivo correspondente.

### 4.2 Invariantes preservados e novos freios operacionais

Permanecem no núcleo, em formulação única: evidência antes de hipótese; bug não
avança sem causa demonstrada; plano antes do fix; regressão primeiro; escopo
travado; task só fecha verde; suíte completa em E4; implementador não aprova;
QA não corrige; bloqueios são registrados; artefatos e transições continuam
determinísticos.

Também ficam no núcleo por serem freios globais:

- `usage_limit_reached` encerra a execução imediatamente; não há repetição,
  continuação automática nem abertura de agente;
- uma sessão atende uma ocorrência; outra ocorrência começa em nova sessão;
- nenhum revisor de “segunda leitura” roda sem mudança do artefato que revisa.

A conclusão continua exigindo E5 encerrado, relatórios produzidos e estado da
ocorrência concluído. Reduzir contexto não cria atalho de término.

## 5. Hook idempotente

### 5.1 Contrato real

O evento `UserPromptSubmit` é emitido a cada turno, antes de o modelo processar
a entrada. Em 2026-10-21, o contrato documentado do Claude Code fornece os
campos comuns `session_id`, `prompt_id`, `transcript_path`, `cwd` e, desde a
versão 2.1.257, `scratchpad_dir`; o evento acrescenta `prompt` e pode acrescentar
`session_title`. `prompt_id` é o UUID do prompt corrente e pode estar ausente
antes da primeira entrada. O hook continua retornando
`hookSpecificOutput.additionalContext` e sempre sai 0. Referência normativa:
<https://code.claude.com/docs/en/hooks>.

O shell vira um adaptador fino: lê stdin uma vez, verifica a disponibilidade do
runtime e, quando possível, chama um módulo `.mjs` testável. A prioridade e os
padrões atuais de classificação permanecem iguais. O módulo separa parse,
classificação, identidade, decisão de injeção e persistência.

O `package.json` do ExpxDev exige Node `>=20.19.0`, portanto a instalação pelo
CLI prova Node naquele processo de instalação. Ela não prova que `node` estará
no `PATH` quando o Claude Code executar o hook dias depois. O wrapper segue
estas regras:

1. com `node >=20.19.0` disponível, executa o módulo sem dependência externa;
2. sem Node, executa o classificador shell atual em modo stateless, sem
   persistência, e emite o mesmo lembrete curto para cada correspondência;
3. falha ou versão incompatível nunca instala pacote nem bloqueia o prompt;
4. o settings fixa timeout de 1 segundo e deixa `onFailure` ausente. Assim,
   falha ou timeout permanece não bloqueante: o Claude Code descarta a saída e
   entrega o prompt sem contexto adicional. `onFailure: "block"` é explicitamente
   proibido para este hook.

O caminho sem Node conserva a disciplina do método, embora não obtenha a
economia de deduplicação. A documentação da instalação registra essa capacidade
reduzida. O doctor pode comprovar Node apenas no processo em que ele próprio
roda e não afirma que o `PATH` de uma sessão futura será igual.

### 5.2 Identidades e decisão

A identidade de sessão é derivada, em ordem, de `session_id` não vazio e do
caminho absoluto normalizado de `transcript_path`. Sem ambos, o hook entra em
modo anônimo fail-open: não persiste e injeta em toda correspondência relevante.

Há duas chaves distintas, ambas com hash SHA-256 e versão do algoritmo:

| Chave | Forma lógica | Finalidade |
|---|---|---|
| evento | `sessão + prompt_id + skill + versão` | impedir que a mesma emissão de `UserPromptSubmit` seja processada duas vezes |
| trabalho | `sessão + cwd normalizado + trabalho + skill` | impedir reinjeção em prompts/fases diferentes do mesmo trabalho |

Quando `session_id` falta mas `transcript_path` existe, a identidade derivada do
transcript ocupa o campo lógico `sessão`. Sem `prompt_id`, não há deduplicação
de evento; a chave de trabalho ainda suprime a reinjeção quando existe uma
identidade de sessão segura.

`cwd` vem do evento; se ausente, usa `CLAUDE_PROJECT_DIR` e depois o diretório
corrente. A normalização resolve caminho absoluto e `.`/`..`, usa `realpath`
quando o alvo existe, normaliza separadores e caixa da letra de unidade no
Windows e remove separador final, salvo na raiz. Só o hash é persistido.

A identidade `trabalho` vem de `.expx/estado.json.trabalho`, quando válida. Sem
ela, usa o literal `implicit`. O prompt não participa de nenhuma chave, não é
guardado nem tem trecho, tamanho ou hash persistido.

Depois de classificar a skill prioritária e confirmar que ela está instalada:

1. chave de evento já vista: não emite nem altera a decisão do trabalho;
2. evento novo e chave de trabalho já vista: registra apenas a deduplicação do
   evento e não emite;
3. chave de trabalho nova: emite o lembrete curto e registra evento e trabalho;
4. mudança de skill ou de trabalho produz outra chave de trabalho e emite um
   lembrete delta, nunca o núcleo ou o `SKILL.md` integral.

Um novo `prompt_id` no mesmo trabalho/skill é evento novo, mas não causa nova
injeção. Repetir o mesmo `prompt_id` é suprimido pela chave de evento. Mudança de
fase, inclusive E4→E3, conserva a chave de trabalho e não reinjeta. Nova sessão
injeta uma vez, mesmo no mesmo cwd e trabalho. Dois cwd na mesma sessão têm
chaves de trabalho distintas.

### 5.3 Eventos não digitados pelo usuário

O Claude Code documenta que `UserPromptSubmit` também dispara para tarefa
agendada da sessão (inclusive `/loop`), retorno de subagente em background e
mensagem enviada por outra sessão. O schema publicado não fornece um campo de
origem que distinga de forma confiável esses três casos de um prompt digitado.
`agent_id` identifica contextos de agente em alguns eventos, mas não é garantia
de origem para o handback entregue ao pai.

Por isso o hook não infere origem pelo texto. Todos os `UserPromptSubmit` seguem
o mesmo algoritmo de evento/trabalho. Um evento autônomo novo no mesmo
trabalho/skill não reinjeta; uma mudança real de skill/trabalho emite somente o
lembrete delta limitado. Se um evento autônomo for o primeiro evento relevante,
ele pode receber esse lembrete uma vez. Essa limitação é registrada e testada.
Um futuro campo explícito `source` só entra no adaptador depois de documentado e
testado; não muda silenciosamente o contrato central.

### 5.4 Estado local e concorrência

O diretório do estado segue esta precedência:

1. `<scratchpad_dir>/expx/lembrete-v1`, quando o runtime o fornece e o caminho é
   absoluto, utilizável e seguro;
2. `<temp-seguro-do-sistema>/expx-<principal>/lembrete-v1`, em que
   `<principal>` é o uid numérico quando disponível e, no Windows, um hash da
   identidade local devolvida pelo sistema;
3. modo anônimo sem persistência quando não há identidade ou diretório seguro.

O diretório é criado com permissão `0700` e os arquivos com `0600` em sistemas
POSIX; no Windows, usa ACL herdada do diretório temporário da pessoa e não
relaxa permissões. Antes de ler ou escrever, `lstat` recusa diretório, lock ou
estado que seja symlink. Quando disponível, a abertura usa `O_NOFOLLOW`; no
fallback, `lstat`, abertura e `fstat` precisam identificar o mesmo arquivo. O
caminho resolvido precisa continuar contido na raiz temporária escolhida.

A exclusão mútua usa `mkdir` atômico de um diretório `lock`. Quem encontra o
lock faz tentativas limitadas por até 50 ms. Lock com mais de 30 segundos só é
removido após nova validação de que é diretório não-symlink contido na raiz. Se
o lock continuar ocupado ou qualquer validação falhar, o hook não toca o estado,
injeta conservadoramente quando houver classificação e sai 0.

Sob o lock, a escrita ocorre em arquivo novo no mesmo diretório, aberto com
criação exclusiva, permissão restrita, flush e rename atômico. Temporários
órfãos expirados são removidos apenas dentro da raiz validada. JSON corrompido
é descartado sob o lock, o evento recebe a injeção conservadora e um estado
novo começa; o conteúdo corrompido nunca é interpretado parcialmente.

Há duas listas limitadas: até 64 identidades de evento com TTL de 24 horas e
até 64 identidades de trabalho com TTL de 7 dias. A limpeza remove primeiro os
expirados e depois os mais antigos até cada limite. Um registro contém somente
versão, hashes, skill e timestamp. Duas execuções concorrentes normais para o
mesmo evento resultam em uma injeção; contenção que exceda o limite preserva o
fail-open e pode gerar uma duplicata, mas nunca corrupção nem bloqueio.

### 5.5 Latência e volume

O benchmark roda o evento completo, incluindo wrapper, processo Node,
classificação, lock e estado, em três cenários: primeira injeção, repetição
suprimida e fallback sem Node. Para cada ambiente suportado são 10 aquecimentos
e 200 amostras do cenário e do piso equivalente, com ordem intercalada ou
randomizada, medindo relógio monotônico e reportando p50/p95 absolutos, a
diferença entre os p95 e o p95 dos deltas pareados.

A medição oficial roda em processo dedicado, fora da suíte paralela, para que
outros testes não disputem o scheduler com o candidato e sua baseline. A suíte
funcional mantém o caso disponível para execução explícita; o gate canônico é
o comando dedicado do benchmark.

Critérios:

- p95 absoluto de até 100 ms em POSIX/WSL quando o launcher permitir esse
  orçamento;
- no Windows/Git Bash, `incremental_p95 = max(0, p95 absoluto do candidato -
  p95 absoluto da baseline equivalente)` de até 100 ms; a baseline é Git Bash
  iniciando um Node no-op para o caminho Node e Git Bash executando um script
  no-op para o fallback;
- a latência absoluta continua obrigatória no relatório mesmo quando não é o
  gate da plataforma;
- nenhuma dependência externa nova e nenhuma rede;
- saída total de uma injeção ou delta de no máximo 768 bytes; supressão emite
  zero bytes;
- timeout configurado em 1 segundo e fail-open comprovado;
- a diferença de percentis é o gate no Windows/Git Bash; o p95 dos deltas
  amostra a amostra continua publicado apenas como diagnóstico, pois os dois
  processos independentes sofrem picos não correlacionados do scheduler;
- um piso absoluto acima de 100 ms no Windows/Git Bash não aumenta o limite:
  muda somente o gate para a diferença de percentis definida acima.

## 6. Política de agentes

Os três papéis são opcionais e mutuamente exclusivos: nunca há investigador,
revisor de teste e QA ativos ao mesmo tempo.

| Papel | Única condição de abertura | Repetição |
|---|---|---|
| `investigador` | a sessão principal já reuniu evidência local e ainda não consegue demonstrar a causa raiz | só após evidência material nova ou nova pergunta de investigação |
| `revisor-testes` | teste de regressão está vermelho e estabilizado, imediatamente antes do fix final | só se o conteúdo/digest do teste mudar |
| `qa` | uma vez no E4 para um lote coerente concluído | só depois de correção que altere o digest do lote |

O limite antigo baseado em quantidade de arquivos não decide investigação. A
decisão usa suficiência de evidência.

A política canônica é independente de fornecedor:

| Classe canônica | Uso |
|---|---|
| `mecanico_triagem` | classificação estreita, inventário ou veredito binário com evidência pronta |
| `raciocinio_normal` | execução, investigação delimitada, revisão e QA usuais |
| `profundo_excepcional` | causa realmente ambígua ou arquitetura transversal |

Adaptação por runtime:

| Classe | Claude | Codex | Outros runtimes |
|---|---|---|---|
| `mecanico_triagem` | Haiku | low | equivalente econômico configurado |
| `raciocinio_normal` | Sonnet | medium | equivalente padrão configurado |
| `profundo_excepcional` | Opus | high | equivalente profundo configurado |

Agentes read-only usam a menor classe que cumpra o papel. O revisor de testes
binário pode usar `mecanico_triagem`; investigador e QA usam
`raciocinio_normal` quando precisam correlacionar evidências. A classe
`profundo_excepcional` exige justificativa registrada como decisão antes da
abertura. Herdar silenciosamente modelo ou esforço acima da classe é proibido.

O RunX registra o digest do artefato/lote revisado. Sem mudança de digest, uma
segunda leitura é suprimida. `usage_limit_reached` impede qualquer tentativa
automática, inclusive trocar modelo ou recriar agente.

## 7. Menos churn de estado

`ORQUESTRADOR.md`, handoff e `.expx/estado.json` só são atualizados em quatro
classes de marco:

1. transição de estágio, inclusive E4→E3;
2. bloqueio;
3. decisão;
4. término.

Abrir/fechar comando, ler arquivo, rodar busca, atualizar percentual ou outro
evento mecânico não reescreve esses três artefatos. Contadores de task no
`estado.json` continuam no schema, mas são consolidados no próximo marco, não
gravados a cada movimento.

Um helper determinístico recebe o tipo do marco, valida a transição e atualiza
atomicamente os artefatos derivados. Eventos mecânicos continuam sendo gravados
por script no JSONL do contrato `expx-eventos`, sem chamada extra de LLM e sem
prosa gerada.

O handoff é local e descartável, em `.expx/handoff.md`. Ele contém apenas:

- trabalho, skill, estágio e último marco;
- bloqueio ou decisão pendente por identificador, se houver;
- ponteiros para `ORQUESTRADOR.md`, causa/impacto, plano, `BLOQUEIOS.md`,
  `QA.md` e relatórios existentes.

Ele não copia causa raiz, plano, saída de testes ou logs. O helper rejeita
handoff acima de 500 tokens pela mesma estimativa conservadora `ceil(bytes/4)`.
O arquivo é não versionado, derivado e opcional; apagá-lo não altera decisões.

Uma transição não injeta contexto no modelo: o helper emite zero bytes de
`additionalContext`. A validação mede separadamente os bytes do JSONL mecânico e
do handoff; a linha de evento fica abaixo de 1 KB e o handoff continua limitado
a 500 tokens. Assim, “atualizar estágio” não vira outra chamada ou carga de LLM.

### 7.1 Recuperação após interrupção

Reduzir as escritas do estado derivado não pode perder progresso. As fontes de
retomada permanecem os artefatos versionados:

- estágio: máquina de estados aplicada a `ORQUESTRADOR.md` e à presença/estado
  dos artefatos do estágio;
- tasks concluídas e total: `tasks.md` da sprint;
- bloqueios e decisões: `BLOQUEIOS.md` e `00-DECISOES.md` aplicáveis;
- auditoria mecânica: JSONL de eventos, usado para conferir sequência, não como
  única fonte de verdade.

No `SessionStart` e antes de cada transição, um comando determinístico
`reconstruir` compara `.expx/estado.json` e handoff com essas fontes. Arquivo
ausente, inválido ou atrasado é refeito atomicamente, sem LLM. Se o processo
cair depois de uma task ser persistida em `tasks.md` e antes do próximo marco,
a retomada recompõe os contadores e a task corrente a partir do artefato; não
depende do último valor exibido na barra.

## 8. Compatibilidade

- nomes E1–E5 e seus retornos não mudam;
- frontmatters, enums, caminhos e templates públicos continuam compatíveis;
- ocorrências antigas retomam pelos mesmos artefatos;
- `.expx/estado.json` mantém o contrato v1 e todas as chaves;
- o JSONL de eventos mantém o contrato existente;
- `.expx/handoff.md` é derivado novo, não uma fonte de decisão;
- instalação e sincronização devem produzir exatamente a versão nova, sem
  restaurar o núcleo ou hook anterior;
- o OpenCode recebe espelho byte a byte, sem semântica divergente.

## 9. Estratégia TDD e validação

### 9.1 ExpxDev

Antes do módulo do hook, testes vermelhos cobrem:

1. primeira correspondência da sessão injeta;
2. novo `prompt_id` no mesmo trabalho/skill é suprimido pela chave de trabalho;
3. evento repetido com o mesmo `prompt_id` é suprimido pela chave de evento;
4. troca de skill injeta somente o delta;
5. trabalho/ocorrência nova injeta;
6. dois cwd na mesma sessão têm identidades independentes;
7. duas sessões no mesmo cwd injetam uma vez cada;
8. sessão retomada com a mesma identidade conserva a supressão;
9. `transcript_path` substitui `session_id` ausente;
10. ausência isolada de `session_id` não ativa modo anônimo se há transcript;
11. ausência simultânea de `session_id` e `transcript_path` ativa o fallback
    stateless;
12. E4→E3 da mesma ocorrência e skill não injeta;
13. TTL expirado volta a permitir uma injeção;
14. JSON corrompido sai 0, injeta conservadoramente e é reconstruído;
15. duas execuções concorrentes normais do mesmo evento emitem uma vez;
16. tentativa de symlink não lê nem escreve o alvo e usa fail-open;
17. tarefa agendada, retorno de subagente e mensagem entre sessões seguem a
    política uniforme, sem heurística textual de origem;
18. ausência ou versão incompatível de Node usa o fallback shell;
19. timeout sai fail-open;
20. estado não contém prompt nem hash do prompt;
21. hook respeita 768 bytes por injeção/delta e supressão emite zero; transição
    emite zero bytes de contexto, JSONL abaixo de 1 KB e handoff até 500 tokens;
22. uma sessão com vários prompts e fases do mesmo trabalho/skill tem uma única
    injeção curta; só skill ou trabalho novos acrescentam delta;
23. benchmark reporta p50/p95 antes/depois e cumpre o orçamento;
24. prioridade e classificação anteriores permanecem iguais.

Testes do harness provam que wrapper e módulo são instalados juntos, entram no
lock e no marketplace e que o settings aponta para o wrapper. Um init/sync
feito a partir da fonte canônica deve comparar byte a byte com a versão nova.

### 9.2 RunX

Antes de editar instruções, testes vermelhos fixam:

- limite de 8.000 bytes do núcleo e suas cinco responsabilidades;
- presença de todas as invariantes;
- roteamento lazy por estágio;
- ausência dos blocos literais duplicados;
- condições e exclusão mútua dos agentes;
- classes canônicas de capacidade, adaptadores de runtime e
  `usage_limit_reached`;
- marcos que podem atualizar estado/handoff;
- handoff por ponteiros e limite de 500 tokens;
- helper determinístico, escrita atômica e E4→E3;
- interrupção abrupta depois de task persistida e antes do marco, seguida de
  reconstrução determinística de estado e handoff;
- espelho Claude/OpenCode;
- instalação a partir da fonte nova.

Depois do green, rodam os testes completos de conteúdo, espelho e instalação.
A medição final registra bytes, linhas, estimativa de tokens, redução absoluta e
percentual do `SKILL.md` antes/depois.

### 9.3 Linha de base local

Em 2026-10-21, antes de qualquer mudança de produção, `npm.cmd test` compilou o
servidor e iniciou o Vitest, mas a execução completa não é uma baseline verde
nesta worktree aninhada. Testes preexistentes falharam porque fixtures não
enxergaram um repositório Git ou árvores candidatas e o ambiente negou acesso a
`C:\Users\flavi\.config\git\ignore`. A execução foi interrompida após mais de
três minutos sem progresso. Nenhum arquivo de produção havia sido alterado.

O plano de implementação deve começar criando novas worktrees fora de
`node_modules/.worktrees`, em localização que preserve as premissas das
fixtures, para ExpxDev e RunX. A implementação não continuará na worktree
aninhada atual. Antes do primeiro teste RED, as novas worktrees precisam obter
baseline verde; falhas não podem ser aceitas como regressões conhecidas sem
reprodução controlada.

## 10. Critérios de aceite

A entrega só está completa quando:

- testes do hook, harness, conteúdo, espelho e instalação estão verdes;
- toda a matriz da seção 9.1 está demonstrada, inclusive identidades de evento
  e trabalho, eventos autônomos, concorrência, symlink, TTL, recuperação e
  latência;
- falha de estado comprova fail-open sem prompt persistido;
- p95 local é de até 100 ms e a saída respeita 768 bytes;
- núcleo canônico tem no máximo 8.000 bytes e preserva invariantes;
- referências continuam carregadas apenas no estágio que as usa;
- sincronização/instalação não restaura a versão antiga;
- nenhum consumidor externo foi alterado;
- houve no máximo um revisor final, read-only, depois de todos os artefatos
  estabilizados;
- não houve publicação, push, PR ou merge.

## 11. Formato da entrega final

O relatório final trará:

- diff por fonte canônica;
- comandos e resultados de testes;
- bytes/tokens antes e depois;
- comportamento do hook antes/depois;
- política de agentes efetivamente aplicada;
- observações de compatibilidade e sincronização;
- um bloco literal `BASELINE-POS-MUDANCA` com commit local, medidas, suítes,
  fixtures, estado do espelho e pendências reais.

## 12. Governança desta revisão

O commit local isolado `b334e07` é válido e permanece intacto; não houve
violação de instrução ao criá-lo. Esta rodada altera somente este documento de
especificação e deixa o diff sem commit para nova revisão do usuário. Não altera
hook, RunX, espelhos ou consumidores; não cria plano TDD, novo commit, push, PR
ou merge.

