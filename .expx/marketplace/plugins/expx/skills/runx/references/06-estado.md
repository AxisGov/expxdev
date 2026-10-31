# Estado, marcos, agentes e retomada

Leia esta referência somente ao registrar um marco, delegar uma leitura independente ou retomar uma ocorrência. O estado local é derivado e descartável; decisões continuam nos artefatos versionados da ocorrência.

## Política operacional

- Uma sessão por ocorrência. Uma nova ocorrência começa em sessão nova.
- `usage_limit_reached` interrompe a execução e qualquer tentativa automática. Não tente novamente, não troque de agente e não crie sessão substituta.
- Investigador, revisor de testes e QA são mutuamente exclusivos: nunca ficam ativos simultaneamente.
- Um digest SHA-256 dos artefatos de entrada identifica cada leitura. Digest inalterado suprime segunda leitura; não existe revisor de “segunda opinião” sem mudança do artefato.
- Agentes read-only usam a menor classe capaz de executar o papel.

| Papel | Quando abrir | Quando repetir | Classe |
|---|---|---|---|
| runx-investigador | somente quando a causa raiz ainda não estiver demonstrada por evidência local | apenas após nova evidência material ou nova pergunta causal | `raciocinio_normal` |
| runx-revisor-testes | uma vez, depois que o teste de regressão vermelho estabilizar e antes do fix final | somente quando mudar o digest do teste | `mecanico_triagem` |
| qa | uma vez no E4 por lote coerente | somente depois de correção que mude o digest do lote | `raciocinio_normal` |

As classes são independentes do fornecedor:

| Classe canônica | Claude | Codex | Uso |
|---|---|---|---|
| `mecanico_triagem` | Haiku | low | classificação, triagem e leitura delimitada |
| `raciocinio_normal` | Sonnet | medium | execução e revisão usuais |
| `profundo_excepcional` | Opus | high | investigação realmente ambígua ou arquitetura transversal |

`profundo_excepcional` exige justificativa registrada no marco de decisão antes da abertura. Adaptadores de runtime escolhem o modelo disponível dessa classe; nunca herdam silenciosamente o modelo da sessão.

## Quatro classes de marco

`ORQUESTRADOR.md`, `.expx/estado.json` e `.expx/handoff.md` mudam somente nestas quatro classes de marco:

1. transição de estágio, inclusive o retorno E4→E3;
2. bloqueio criado, resolvido ou materialmente alterado;
3. decisão humana ou arquitetural registrada;
4. término da ocorrência.

Toda transição de estágio atualiza os três artefatos derivados no mesmo marco. Abrir ou fechar task, rodar comando, iniciar agente e outros eventos mecânicos não os reescrevem. Esses eventos vão ao JSONL por script determinístico, sem chamada adicional de LLM; contadores de tasks são consolidados no marco seguinte.

Os eventos operacionais existentes — `uma-ocorrencia-por-arvore`, `task-reivindicada` e `arvore-limpa-antes-da-suite` — continuam no rastro. Cada linha inclui `sessao` e `harness` quando disponíveis.

## Contrato `expx-estado` v1

Local: `.expx/estado.json`, ignorado pelo versionador. Se `.expx/` não existir, não crie; siga sem erro ou aviso. Em worktree novo, o E1 só herda `.expx/hooks.json` e inicializa o estado quando o checkout principal já possui `.expx/`.

O arquivo mantém as quinze chaves públicas:

```json
{
  "expx_estado": 1,
  "atualizado_em": null,
  "trabalho": null,
  "ferramenta": "runx",
  "titulo_curto": null,
  "fase": null,
  "task": null,
  "tasks_concluidas": 0,
  "tasks_total": 0,
  "raio": null,
  "orcamento_arquivos": null,
  "orcamento_linhas": null,
  "branch": null,
  "pr_estado": null,
  "bloqueios": 0
}
```

RunX só altera `trabalho`, `ferramenta`, `titulo_curto`, `fase`, `task`, `tasks_concluidas`, `tasks_total` e `bloqueios`, além de `atualizado_em`. Campos de legadox e mergex sobrevivem semanticamente à atualização. O título é normalizado e cortado em 30 caracteres; o JSON permanece abaixo de 1 KB.

A gravação é atômica: leia o anterior, derive valores dos artefatos versionados, escreva temporário no mesmo diretório, faça flush e rename. Ausência ou JSON inválido parte do objeto padrão. Falha é fail-open, registrada no rastro, e nunca decide o fluxo.

## Handoff mínimo

`.expx/handoff.md` é derivado no mesmo marco e tem no máximo 500 tokens (limite conservador de 2.000 bytes). Ele contém apenas:

- ocorrência, estágio, task corrente e contadores;
- tipo e id do último marco;
- caminhos relativos para `ORQUESTRADOR.md`, causa/impacto, plano, bloqueios e QA que realmente existam;
- próximo comando determinístico.

Não copie causa raiz, plano, decisões, saída de comandos ou logs. O handoff aponta aos artefatos; não os substitui.

## Recuperação

No `SessionStart` do Claude Code, no `shell.env` inicial da ponte
OpenCode/MimoCode e antes de qualquer transição, reconstrua estado e handoff a
partir de `ORQUESTRADOR.md`, `tasks.md`, `BLOQUEIOS.md`, `00-DECISOES.md` e
`QA.md`. Esses arquivos são a fonte; estado e handoff são cache. Uma queda
depois de persistir uma task não causa escrita imediata: a reconstrução
consolida os contadores na abertura ou no próximo marco.

Use o helper instalado, que não produz stdout:

```bash
python3 .claude/runx-hooks/comum/estado.py reconstruir --ocorrencia docs/manutencao/<OC-ID>-<slug>
python3 .claude/runx-hooks/comum/estado.py marco --ocorrencia docs/manutencao/<OC-ID>-<slug> \
  --tipo <transicao|bloqueio|decisao|termino> --id <identificador> --resultado <resultado>
```

O primeiro comando é executado automaticamente ao retomar pelo `SessionStart`
ou pela ponte; `marco` reconstrói dos artefatos antes de validar e persistir a
mudança. Relógio injetável é reservado às fixtures de teste.

O helper recusa, antes de qualquer escrita, com código diferente de zero e o
motivo em stderr (`estado.py: <motivo>`; stdout continua vazio):

- `--ocorrencia` que não é uma pasta existente de `docs/manutencao/`, ou cujo
  `trabalho_id` (do `ORQUESTRADOR.md`, ou do `00-OCORRENCIA.md` antes do E2)
  falta, não tem a forma `OC-<AAAA>-<NNNN>` ou não casa com o nome da pasta
  (`<OC-ID>` ou `<OC-ID>-<slug>`). O id nunca é deduzido do nome da pasta (DR-85);
- `--tipo termino` fora do E5, o último estágio (DR-86).

No `SessionStart` (e na ponte), a ocorrência é a aberta mais recente em
`docs/manutencao/`, pelos artefatos versionados — nunca o `trabalho` do
`estado.json`, que é só exibição. Ocorrência encerrada não é reconstruída, e
uma recusa da validação não trava a sessão: o helper sai 0 sem gravar (DR-85).

Antes de concluir o marco, confirme: quinze chaves presentes; campos alheios preservados; E4→E3 representado; estado e JSONL abaixo de 1 KB; handoff abaixo de 500 tokens e só com caminhos existentes; stdout do helper vazio.
