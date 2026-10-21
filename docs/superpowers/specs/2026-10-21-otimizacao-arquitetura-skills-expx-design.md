# Otimização da arquitetura de instruções e execução das skills Expx

Data: 2026-10-21. Repositórios envolvidos: `AxisGov/expxdev` e
`bittencourtthulio/runx`. Estado: **desenho aprovado pelo usuário em
2026-10-21; implementação ainda não iniciada**.

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

O evento `UserPromptSubmit` é emitido a cada prompt. O contrato documentado do
Claude Code fornece `session_id`, `cwd`, `prompt` e `transcript_path`. O hook
continua retornando `hookSpecificOutput.additionalContext` e sempre sai 0.
Referência normativa: <https://code.claude.com/docs/en/hooks>.

O shell vira um adaptador fino: lê stdin uma vez, chama um módulo `.mjs`
testável e imprime a resposta. A prioridade e os padrões atuais de classificação
permanecem iguais. O módulo separa parse, classificação, identidade, decisão de
injeção e persistência.

### 5.2 Identidades e decisão

Identidade de sessão, em ordem:

1. hash de `session_id` não vazio;
2. hash do caminho absoluto de `transcript_path` não vazio;
3. sem ambos, modo anônimo fail-open: não persiste e injeta em toda
   correspondência relevante. Esse fallback gasta mais tokens, mas não perde a
   proteção do método e fica explicitamente documentado.

`cwd` vem do evento; se ausente, usa `CLAUDE_PROJECT_DIR` e depois o diretório
corrente. O valor persistido é somente seu hash.

A identidade do trabalho vem de `.expx/estado.json.trabalho`, quando válida.
Sem estado, o trabalho implícito é a combinação sessão + cwd. Ao mudar o campo
`trabalho`, a ocorrência muda. O prompt não é usado como identificador e nunca
é guardado.

Depois de classificar a skill prioritária e confirmar que ela está instalada,
o hook injeta somente quando:

- não existe registro para sessão + cwd + trabalho;
- a skill classificada difere da última skill registrada; ou
- o trabalho/ocorrência difere.

Repetição de prompt ou mudança de fase com a mesma skill e trabalho não injeta.
Assim, inclusive um retorno E4→E3 não repete o lembrete. Nova sessão injeta uma
vez, mesmo para o mesmo trabalho. Nova ocorrência deve começar em nova sessão;
se o estado mudar antes disso, a troca ainda é detectada.

### 5.3 Estado local

O estado fica sob o diretório temporário do sistema, em
`expx/lembrete-v1/`, nunca no repositório. Um registro contém apenas versão,
hashes de sessão/cwd/trabalho, skill e timestamp. Limites:

- TTL de 7 dias;
- no máximo 128 registros, removendo os expirados e depois os mais antigos;
- escrita atômica por temporário + rename;
- permissões restritas quando suportadas;
- nenhuma cópia integral ou parcial do prompt.

JSON inválido, diretório sem permissão, corrida, falha de leitura ou escrita não
bloqueia o prompt. Se a classificação foi possível, a falha de estado resulta
em uma injeção conservadora e saída 0. Falha de parse/classificação sai 0 sem
injeção, preservando o fail-open atual.

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

Sonnet é o padrão para execução e raciocínio. Haiku atende somente
classificação/triagem estreita, inclusive uma checagem mecânica cujo resultado
seja binário. Agentes read-only usam o menor modelo que cumpra o papel: Haiku
para triagem; Sonnet quando investigação ou QA exige raciocínio. Opus/high só
é permitido para causa realmente ambígua ou arquitetura transversal, com a
justificativa registrada como decisão antes da abertura. Herdar Opus por acaso
é proibido.

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
2. prompt repetido na mesma sessão/trabalho é suprimido;
3. troca de skill injeta;
4. sessão nova injeta;
5. trabalho/ocorrência nova injeta;
6. E4→E3 da mesma ocorrência e skill não injeta;
7. falha de estado sai 0 e injeta conservadoramente;
8. estado não contém prompt;
9. ausência de identidade segura usa o fallback documentado;
10. prioridade e classificação anteriores permanecem iguais.

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
- política Sonnet/Haiku/Opus e `usage_limit_reached`;
- marcos que podem atualizar estado/handoff;
- handoff por ponteiros e limite de 500 tokens;
- helper determinístico, escrita atômica e E4→E3;
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

O plano de implementação deve criar as worktrees em localização que preserve
as premissas dessas fixtures ou ajustar somente o ambiente de teste, e então
obter uma baseline verde antes do primeiro RED. Essas falhas não podem ser
aceitas como regressões conhecidas sem reprodução controlada.

## 10. Critérios de aceite

A entrega só está completa quando:

- testes do hook, harness, conteúdo, espelho e instalação estão verdes;
- as seis fixtures operacionais exigidas estão demonstradas: primeira injeção,
  repetição, troca de skill, sessão nova, ocorrência nova e E4→E3;
- falha de estado comprova fail-open sem prompt persistido;
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

