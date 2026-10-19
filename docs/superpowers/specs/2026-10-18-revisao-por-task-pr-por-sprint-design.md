# Revisão por task, PR por sprint e limites por projeto — desenho

Data: 2026-10-17. Repositórios: AxisGov/expxdev (contrato e núcleo), AxisGov/sprintx, AxisGov/mergex.
Estado de partida: expxdev d623daa, sprintx 1f1f957, mergex 3c15ed2 (mais o que a rodada 3 de achados da #204 trouxer).

> **Emenda de 2026-10-19 — limites do CodeAnt, fixos:** [`2026-10-19-limites-do-codeant-emenda.md`](2026-10-19-limites-do-codeant-emenda.md). Os limites deixam de ser calibráveis: valem os do CodeAnt (task ≤ 40 arquivos revisáveis, cada um ≤ 5.000 linhas e ≤ 200 KB; PR ≤ 100 arquivos, todos contados: o painel não desconta), sem legibilidade e sem `FATIA_*`. Ela substitui o O3, o segundo anti-objetivo, o item da CLI na seção 3, a maior parte da 4.1, os lotes da 4.2 e da 6.0 e a seção 5. Onde este texto e a emenda divergem, vale a emenda.

## 1. Por que

O contrato `expx-fatiamento` nasceu para os repositórios do método, depois das PRs P0.2 (+19 mil e +43 mil linhas), e o seu único limite medido do revisor é o de 100 arquivos por PR no CodeAnt. Os 20 arquivos e 400 linhas por PR são legibilidade "nossa" (contrato :59-60). Aplicados a um projeto consumidor, eles travam o ciclo: a Onda 0b do conselho (4 sprints, 32 tasks, ~104 arquivos de código) teria de virar 14 a 40 trabalhos, cada um com F1–F5, PR e merge humano, e as ondas 1 a 8 batem no mesmo muro.

A revisão do CodeAnt tem valor provado no conselho (#202: falhas Critical/Security de permissão achadas e verificadas por ele). O objetivo é **não perder essa revisão e tirar dela o papel de forçar PRs minúsculas**: revisar cedo e pequeno (por task, pela CLI) e entregar em fatias naturais (por sprint), com limites que o projeto calibra e que as duas skills leem da mesma fonte.

## 2. Objetivos, não-objetivos e anti-objetivos

Objetivos
- O1. Cada task passa pela revisão da CLI do CodeAnt antes do commit; achado aberto em linha alterada pela task não deixa a task fechar.
- O2. Um trabalho pode entregar um PR por sprint, um de cada vez, sem virar vários trabalhos, e sem os agentes esperarem o merge quando o PR é de baixo risco (merge automático, 4.6).
- O3. Limites de fatiamento calibráveis por projeto, num arquivo versionado, lidos igualmente pela sprintx (F3 e auditor) e pela mergex (E7).
- O4. PR empilhado nunca chega à main com um verde que não rodou a suíte contra a base real.
- O5. Testes que provam que sprintx e mergex julgam igual o mesmo plano/diff.

Não-objetivos
- Mudar o CI ou o painel do CodeAnt de um projeto (o método só exige e registra evidência).
- Substituir a revisão de PR do CodeAnt: ela continua no E9 (R1–R6), agora sobre fatias que cabem nela.
- Revisão por task na runx (fica para depois; o desenho não a impede).

Anti-objetivos (falharia mesmo "funcionando")
- O agente configurar credencial do CodeAnt, de qualquer forma.
- Limite relaxado sem revisão por task registrada: seria só afrouxar o fatiamento.
- PR de sprint verde por um gate que não rodou a suíte (o caso `fora-de-main` do conselho).
- sprintx e mergex com números diferentes para o mesmo projeto.
- Quebrar o projeto que não adotou nada: sem o arquivo de configuração e sem a CLI, tudo segue como hoje.

## 3. O que já existe e pesa no desenho

- Os números 300/400/20/F4 estão fixos no texto da sprintx (`03-plano.md:73`, `auditor-plano.md:44,91-94` nas cópias `.claude` e `.opencode`, DS-182..184). Na mergex só o `fatiamento-da-pr.sh` lê `FATIA_*`, e só do ambiente (`07-abertura-pr.md:101-104`); o expxdev tem o mesmo corpo em `scripts/verificar-fatiamento.sh`.
- Hoje 1 trabalho = 1 branch `feature/<slug>` = 1 `ENTREGA.md` = 1 PR. O E0 para se a entrega declara outra branch (`00-abertura.md:244-246`); V1/V2/V11 do E2 leem todas as `sprint-*/tasks.md`; o texto proíbe usar sprints para caber no limite (`03-plano.md:73`).
- PR empilhado já existe entre **features** (DS-183/185 na sprintx: `expxBase`/`expxBaseNascimento`; DM-233/234 na mergex: fila topológica e revalidação da base).
- O E2 tem V1–V11; nenhuma verificação olha revisão. A V11 (commit por task via `prova-de-commit.sh`) é o molde para uma V12.
- O rastro (`docs/eventos/*.jsonl`) não é versionado e evento novo exige mudança coordenada no expxdev (DS-180); portão não depende de rastro.
- `.expx/agentes.json` é o precedente de configuração **do projeto** dentro de `.expx/`: o contrato de instalação garante que `init`, `add`, `remove` e `update` nunca o escrevem; o `init` só troca `.expx/marketplace/`.
- CLI do CodeAnt (docs.codeant.ai/cli/review): `--uncommitted|--staged|--last-commit|--last-n-commits ≤5|--base|--base-commit`; `--headless` (JSON no stdout, schema não publicado: array `suggestions` com `severity`); `--fail-on BLOCKER|CRITICAL|MAJOR|MINOR|INFO` (padrão CRITICAL; exit 0/1); `--include/--exclude` por glob; 10 arquivos únicos e 5.000 linhas por arquivo por revisão; login por navegador (`~/.codeant/config.json`) ou `CODEANT_API_TOKEN` (CI). Custo por revisão não é publicado.
- Gate do conselho (`docs/engineering/ci-gates-codeant.md`): PR com base ≠ main fica verde como `fora-de-main` sem rodar a suíte; redirecionado para a main sem push novo, um verde reaproveitado pode valer.

## 4. O desenho

### 4.1 Configuração do projeto: `.expx/fatiamento.json`

*Superada em parte pela emenda de 2026-10-19 (ver o topo): saem capacidade × legibilidade, `justificativa`, o afrouxamento, `capacidade.excluido_no_painel` e as duas medidas no E7; ficam o arquivo do projeto e o leitor único.*

Arquivo versionado, **do projeto** (o CLI nunca o escreve, como o `agentes.json`). Ausente = padrões do contrato, e tudo como hoje.

```json
{
  "expx_fatiamento": 1,
  "justificativa": "texto obrigatório quando algum limite difere do padrão",
  "legibilidade": { "pr_linhas": 2500, "pr_arquivos": 80, "commit_linhas": 300 },
  "arquivo": { "kb": 150, "linhas": 4000 },
  "ignorar": ["^gerado/"],
  "revisao_por_task": { "modo": "obrigatoria" },
  "entrega": "por_sprint"
}
```

- **Capacidade do revisor (obrigatória, não calibrável):** `pr_arquivos ≤ 100`; `arquivo.linhas ≤ 5000`. Valor acima é arquivo inválido.
- **Legibilidade (calibrável):** `pr_linhas`, `pr_arquivos`, `commit_linhas` e os de arquivo dentro da capacidade; qualquer valor diferente do padrão exige `justificativa`.
- **Afrouxamento condicionado à revisão por task** *(decisão minha)*: limites de legibilidade acima do padrão (400/20) só são válidos com `revisao_por_task.modo: obrigatoria`. Com `se_disponivel` ou `desligada`, o arquivo é **inválido** se afrouxar algum desses limites (o script recusa e o doctor aponta). Assim o plano e o E7 usam o mesmo conjunto, sem surpresa no fim: em `obrigatoria` nenhuma task fecha sem revisão passada — CLI ausente, abaixo da versão mínima ou com revisão incompleta (`indisponivel`) impede a task de fechar, que vira bloqueio (classe de recurso externo) até a CLI voltar —, então o PR nunca chega ao E7 com task sem revisão. "Passou" = nenhum achado aberto em linha alterada pela task (`ok`, ou só achados `anterior`/`rejeitado`, pela regra de 4.2).
- **Duas medidas no E7** *(decisão minha)*: **legibilidade** (exclui artefatos de método e `ignorar`, como hoje) e **capacidade** (≤ 100 arquivos, contando tudo menos o que o projeto declara excluído no painel do CodeAnt em `capacidade.excluido_no_painel`, cujo padrão são os três diretórios de artefato de método que o E7 já manda excluir no painel). O script imprime os limites efetivos das duas.
- **Onde o script está** *(decisão minha)*: caminho fixo `.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs` (o `init` instala o núcleo ali). Arquivo de configuração presente e script ausente é **erro** com a instrução de atualizar o expx, nunca queda calada nos padrões (seria divergência entre as skills). Sem arquivo de configuração, as skills nem procuram o script e usam os padrões, como hoje — instalações antigas não quebram.
- **Divergência atual do contrato** *(decisão minha)*: o padrão do `verificar-fatiamento.sh` passa a excluir os artefatos de método, como o contrato já diz.
- `ignorar` **soma** aos padrões (como o `FATIA_IGNORAR` do E7 já faz), nunca os substitui.
- `entrega`: `por_trabalho` (padrão) ou `por_sprint` (4.3); o plano pode sobrescrever por trabalho.

Leitura única: um script no **núcleo** do expxdev (`nucleo/scripts/expx-fatiamento.mjs`), que o CLI já copia para todo projeto. Ele valida o arquivo e imprime os `FATIA_*` efetivos (formato `export`), e é a única fonte para: mergex E7 (exporta antes do `fatiamento-da-pr.sh`), sprintx F3 e auditor (leem o resultado, não o JSON cru) e `scripts/verificar-fatiamento.sh` do expxdev. O `doctor` valida o arquivo. Por que `.expx/` e não `CONVENCOES.md`: o `CONVENCOES.md` é da stackx/buildx e a sprintx não pode escrevê-lo; é prosa, não máquina; e `.expx/` já tem o precedente do `agentes.json` com a garantia de preservação no contrato de instalação.

### 4.2 Revisão por task na F6 (mudança principal)

Na ordem obrigatória da F6 (`06-execucao.md:123`), entre "aceite" e `status: concluida`:

teste → implementação → suíte afetada → revisor-testes → aceite → **revisão CodeAnt** → `status: concluida` → `tasks.md` → E1

- Comando: `codeant review --uncommitted --headless`, restrito aos `arquivos` da task com `--include` (CLI ≥ 0.5.14). O código de saída não é usado: o método lê o JSON (ver 6.0). Task com mais arquivos que o `meta.max_files` informado revisa em lotes (`--include` por lote); a task passa só se todos os lotes passam.
- Achado aberto em linha alterada pela task: a task **não fecha**; a correção entra na mesma task e a revisão roda de novo. Não há limiar de severidade: a CLI não informa severidade (6.0), então todo achado nessas linhas conta; achado em linha não alterada segue a regra 6 abaixo.
- **Achado que persiste ou falso positivo** *(decisão do usuário, 2026-10-18, depois de segunda opinião do Codex)*:
  1. Até 2 tentativas de correção; o agente pode escalar antes quando diagnosticar que o problema é de desenho e não cabe na task.
  2. Duas classes de bloqueio novas: `revisao_defeito` (achado real que não cabe na task) e `revisao_contestada` (o agente argumenta falso positivo, com o argumento registrado). CLI indisponível não é bloqueio por achado: em `se_disponivel` é aviso, em `obrigatoria` impede a task de fechar como bloqueio de recurso externo (4.1); nunca é aprovação.
  3. O agente nunca aceita risco: classifica, deduplica e contesta, nada além.
  4. Só o desenvolvedor destrava: corrige, ou rejeita o achado com motivo no bloqueio, o que libera a execução. A rejeição gravada em arquivo não basta, porque o agente pode escrevê-lo: todo achado rejeitado vira **confirmação obrigatória no PR**, e o E9 não mergeia sem a confirmação explícita do desenvolvedor no PR para cada um (prova fora de qualquer arquivo que o agente escreva). A V12 aceita o achado rejeitado; a descrição do PR o lista.
  5. Rejeição vale para o mesmo achado nas tasks seguintes enquanto o trecho não mudar: identidade = sha256 de `label` do achado + arquivo + conteúdo da linha apontada e das linhas vizinhas (anterior e seguinte, sem espaços nas pontas) + versão da CLI; as vizinhas separam linhas de texto idêntico no mesmo arquivo sem depender do número da linha; linha alterada ou CLI nova reabre.
  6. Achado em linha que a task não alterou não bloqueia: vai para a evidência como achado anterior e para PR própria (F1 do contrato).
  7. Tasks que dependem (`depende_de`) da bloqueada param; as independentes seguem.
  Não adotado: confirmar a correção com duas execuções seguidas sem o achado (dobra o custo por task; a revisão de PR do CodeAnt no PR da sprint, dentro dos 100 arquivos, cobre o diff integrado e o que escapar por não determinismo).
- Evidência versionada: `docs/entregas/<trabalho>/revisao/<task>.json` (o JSON da CLI normalizado + metadados: versão da CLI, lotes, blob de cada arquivo revisado; formato no contrato da revisão por task), commitada pelo E1 no mesmo commit da task (é artefato de método: fora de F2/F3 e da revisão de PR). No item de `ENTREGA.commits`, um campo `revisao: ok | achados | indisponivel:<motivo>`.
- Portão: **V12** no E2, no molde da V11, chamando `node …/nucleo/scripts/expx-revisao.mjs conferir`: toda task `concluida` do escopo tem evidência; `ok` passa; `indisponivel` é AVISO em `modo: se_disponivel` e FALHA em `modo: obrigatoria`; evidência cujo blob não bate com o arquivo no commit da task é FALHA.
- Sem CLI, sem login, abaixo da versão mínima ou CLI que falha: evidência `indisponivel:<motivo>`, nunca aprovação. Em `se_disponivel` é aviso e o método segue como hoje; em `obrigatoria` a task não fecha (4.1). O agente nunca roda `codeant login`, `set-codeant-api-key` nem define `CODEANT_API_TOKEN`.
- Rastro: sem evento novo; o resultado vai no detalhe do `task-concluida` (DS-180). O portão não lê rastro.
- Hook: o `task-so-fecha-verde.sh` passa a exigir a evidência quando o modo for `obrigatoria` (é o único hook de evidência; fica no modo dele, aviso por padrão).

### 4.3 Um PR por sprint, sequencial

*Decisão do usuário, 2026-10-18, revista depois do rascunho do plano da mergex e de segunda opinião do Codex: a forma empilhada (uma branch e uma entrega por sprint, PRs abertos ao mesmo tempo) custava 5 PRs só na mergex e deixava sem resposta a correção na sprint N com a N+1 andando, o squash quebrando a pilha e os consumidores que leem `docs/entregas/<trabalho>/ENTREGA.md`. Fica a forma sequencial; a empilhada sai do desenho.*

Opt-in (`entrega: por_sprint` na configuração; o plano pode sobrescrever por trabalho). O trabalho continua um só: mesmo slug, mesmo plano, um F1–F5.

- **Um PR por vez.** Ao fechar a sprint N (critério de saída e suíte inteira verde, portão de sprint da F6), a sprintx aciona E2–E8 só com as tasks da sprint N. A sprint N+1 **só executa depois do merge do PR da N**: a branch do trabalho é atualizada a partir da main (que já contém a N) e a execução segue.
- **Mesma branch e mesma entrega.** `feature/<slug>` e `docs/entregas/<slug>/ENTREGA.md` continuam os de hoje. O `ENTREGA.md` ganha `sprint_atual` e `prs: [{sprint, url, estado, merge_sha}]`; o `pr_url`/`pr_estado` de topo passam a ser os da sprint atual.
- **Portão por sprint:** V1, V2, V3, V7, V9, V10, V11 e V12 restritos às tasks e à união de arquivos da sprint atual; a V6 continua sobre o trabalho. V2: a suíte inteira da sprint é **FALHA se ausente**. Um arquivo pode reaparecer numa sprint seguinte quando estiver declarado numa task dela.
- **Sprint fechada é imutável.** Correção pedida no PR da sprint N **enquanto ele está aberto** entra nele, como hoje (a N+1 ainda não começou). Defeito achado depois do merge vira task da sprint seguinte ou correção própria, nunca reabertura da N.
- **Artefatos de fim de trabalho** (`FECHAMENTO.md`, `HISTORICO.md`, `arquivos_alterados` do ORQUESTRADOR, o `kind: entrega` do memox): só no PR da última sprint.
- **F2 do plano:** com `por_sprint`, o auditor soma por sprint; "não em mais sprints do mesmo trabalho" vale só para `por_trabalho`.
- **Sem pilha:** cada PR de sprint tem a main como base; squash ou merge comum não quebram nada, porque a sprint seguinte nasce da main depois do merge.
- **A espera pelo merge** é o custo desta forma; o merge automático (4.6) o elimina quando o PR é de baixo risco.

### 4.4 Prova por fatia e features empilhadas

1. **Prova por fatia:** cada PR de sprint carrega a suíte inteira verde no HEAD dele, registrada no `sprint.md` (V2 como FALHA se ausente, 4.3). É o "verde sozinha" da F5 do contrato.
2. **Features empilhadas (DS-183, entre trabalhos):** continuam como hoje. Um PR cuja base mudou desde o último CI (redirecionado depois do merge da predecessora) só é elegível no E9 com um check do projeto **executado depois do redirecionamento e contra a base atual**, e com a revisão do bot no HEAD atual feita depois do redirecionamento; sem isso, inelegível com o motivo `CI anterior ao redirecionamento`, e a orientação de disparar o CI pelo serviço (re-run que use a base atual) — nunca um commit vazio, que invalidaria o portão.

### 4.5 Testes de consistência e registro

- O mesmo `.expx/fatiamento.json`, o mesmo plano e o mesmo diff julgados igualmente: a bancada P0.2 do expxdev (que já instala sprintx e mergex juntas pelo `init` real) ganha casos que comparam (a) os limites efetivos que o auditor da sprintx cita com os que o E7 da mergex mede — os dois vindos do mesmo script do núcleo; (b) exclusões (`ignorar` + artefatos de método); (c) a união de arquivos por sprint calculada pela sprintx (`planejamento.sh`) e pela V9 da mergex.
- Contrato `expx-fatiamento` v2: seção "capacidade × legibilidade", a configuração por projeto, a revisão por task como condição do afrouxamento, e o histórico preenchido (hoje tem uma linha só para 8 mudanças). Corrigir também a divergência atual: o contrato diz que os artefatos de método ficam fora da medida, mas o padrão do `verificar-fatiamento.sh` os mede.
- Decisões novas: DS-186.. na sprintx, DM-235.. na mergex, e a decisão de contrato no expxdev.

### 4.6 Merge automático e decisões com o Codex

*Decisão do usuário, 2026-10-18 (nenhum projeto tem deploy automático da main; lista padrão de caminhos protegidos aceita; rejeitar achado continua sempre do desenvolvedor), depois de segunda opinião do Codex.*

**Desligado por padrão.** O leitor do núcleo (`nucleo/scripts/expx-fatiamento.mjs`) passa a aceitar a chave e a emitir `EXPX_MERGE_AUTOMATICO` e `EXPX_CAMINHOS_PROTEGIDOS` (PR pequena no expxdev, antes da mergex). O projeto liga em `.expx/fatiamento.json`: `"merge_automatico": { "ativo": true, "caminhos_protegidos": [...] }` (a lista do projeto soma à padrão). Desligar é mudar a chave; vale na próxima passagem.

**O E9 faz o merge sem perguntar só quando TODAS valem** (todas mecânicas, no HEAD exato que vai ser mergeado, com o merge preso a esse SHA como já é):
1. CI do projeto verde e suíte inteira da sprint verde registrada.
2. Gate R1–R6 `SATISFEITO`; nenhuma thread ou comentário de revisão sem resposta; nenhum review pedindo mudança.
3. Branch atualizada com a base e sem conflito.
4. **Sem perda de teste** contra a base: nenhum arquivo de teste apagado; nenhum `skip`/`only`/`todo`/`xfail` (e equivalentes da stack) novo no diff; a contagem de testes da suíte não cai.
5. **Sem remoção fora do plano:** todo arquivo removido está declarado como removido numa task da sprint.
6. **Nenhum achado de revisão rejeitado** no PR (rejeição é sempre do desenvolvedor).
7. **Nenhum arquivo em caminho protegido.** Padrão: autenticação, permissões e RLS, migrations de banco, CI e infraestrutura, configuração de segredos; o projeto acrescenta caminhos.

**Qualquer condição falha → o merge espera o desenvolvedor**, com o motivo dito.

**Trilha e aviso:** cada merge automático grava no `ENTREGA.md` a base, o HEAD, os checks e as condições conferidas, e avisa o desenvolvedor.

**Decisões no caminho.** O agente só para quando precisa de uma decisão. Antes de levá-la ao desenvolvedor, discute com o Codex (`codex exec`, só leitura). Os dois podem **fechar sozinhos** só decisões técnicas reversíveis e de baixo impacto, dentro do que o plano já define: escolher entre implementações equivalentes, diagnosticar uma falha com base nos testes, corrigir sem mudar contrato. **Nunca fecham**, mesmo concordando (vira recomendação ao desenvolvedor): rejeitar achado, aceitar risco, regra de negócio ou critério de aceite, dados e migrations, permissões e segurança, contrato público, exceção ao portão. Se os dois discordam, ou o Codex não está disponível, vai ao desenvolvedor. A decisão e os pareceres ficam registrados no bloqueio.

## 5. Calibragem inicial do conselho (exemplo; o valor final é seu)

*Superada pela emenda de 2026-10-19: não há o que calibrar.*

- `pr_arquivos: 80` (abaixo dos 100 do revisor, com folga para os artefatos que o painel não exclui).
- `pr_linhas: 2500`: uma sprint típica da Onda 0b tem ~8 tasks; com F3 em 300 linhas por commit, 8 × 300 = 2.400. O PR de sprint fica dentro do que o CodeAnt revisa por arquivos (≤80) e cada linha já passou pela CLI na task.
- `commit_linhas: 300` (mantido); F4 como está.
- `revisao_por_task: { modo: obrigatoria }` (é o que torna o afrouxamento válido); `entrega: por_sprint`.
- Com isso, as 5 ALTA da reauditoria somem se cada sprint ficar ≤80 arquivos e ≤2.500 linhas e as 4 tasks acima de 300 linhas forem divididas (F3 não muda).

## 6. O que fica para quem constrói

6.0 **Resultado do spike (2026-10-18, WSL, repositório descartável com 3 injeções de SQL num arquivo alterado e num novo):**
- `--uncommitted` inclui arquivo não rastreado; `--include` restringe (o resto sai em `meta.skipped` como "excluded by pattern").
- JSON real: `{issues:[{issue_content, relevant_file, start_line, label}], meta:{reviewed_files, total_changed, skipped, capped, max_files}, error, noFiles}`. **Não há severidade.**
- **`--fail-on MAJOR` não barra**: código de saída 0 com as 3 injeções, nas versões 0.5.1 e 0.5.14. O portão não pode depender do código de saída nem de severidade.
- 0.5.1 (instalada desde julho): achou as 3, mas com `issue_content` vazio. 0.5.14 (atual): achou as 3, com explicação, e o mesmo resultado em duas execuções seguidas. Num repositório incoerente (módulo importado ausente) a 0.5.14 relatou só o erro de import e não as injeções.
- `max_files`: 15 na 0.5.1, 40 na 0.5.14 (a documentação diz 10).
- Tempo: ~90 s por revisão (2 arquivos pequenos) na 0.5.14.
- Cota/custo: a CLI não informa; conferir no painel do CodeAnt.

**Mudanças no 4.2 por causa do spike:**
- O portão é do método, não da CLI: **todo achado em linha alterada pela task bloqueia** (regra 6 do achado que insiste); `falha_em` sai da configuração; o `label` vai para a evidência. Falso positivo segue a regra de contestação.
- Versão mínima da CLI: **0.5.14** (a 0.5.1 não explica o achado). Versão menor = aviso `indisponivel:versao`, com a orientação de atualizar (`npm i -g codeant-cli@latest`); o agente não instala nem atualiza a CLI.
- Lotes pelo `meta.max_files` informado pela CLI, não por número fixo; `meta.capped: true` ou arquivo da task em `meta.skipped` sem ser por padrão de exclusão = revisão incompleta (`indisponivel`).
- `error` não nulo ou JSON ilegível = `indisponivel`, nunca aprovação.

6.1 **Spike da CLI antes de fechar o 4.2** (precisa do seu login, feito por você): `--uncommitted` inclui arquivo novo não rastreado? Formato real do JSON (`suggestions`, `severity`, arquivo/linha)? Roda no Windows (Git Bash) e no WSL? Quanto tempo e quanto da cota uma revisão de task consome? `--include` com 10 caminhos explícitos funciona? O resultado decide `--uncommitted` × `--staged` e o formato da evidência. E o bot de PR: revisa PR com base ≠ main? Revisa de novo depois do redirecionamento?
6.5 A rodada 3 de achados da #204 mexe em `03-plano.md`, auditor, E7 e E2: o plano das fatias da sprintx e da mergex começa depois do merge dela.
6.2 Formato exato do hash que liga a evidência ao commit da task.
6.3 Nomes dos scripts novos e onde cada bancada recebe os casos.
6.4 Divisão em PRs por assunto dentro dos limites do contrato.

## 7. Ordem de entrega

1. Spike da CLI (6.1), sem PR.
2. expxdev: contrato v2, `nucleo/scripts/expx-fatiamento.mjs`, doctor; release.
3. mergex: E7 lê a configuração; V12; entrega por sprint (E0, V1/V2/V9/V11 por escopo, E7 contra a sprint anterior); E9 com a revalidação ao chegar à main.
4. sprintx: F3 e auditor pela configuração; passo de revisão por task na F6; entrega por sprint no portão de sprint; hook.
5. expxdev: repin das candidatas e os testes de consistência (4.5); release.
6. Conselho adota (arquivo de configuração, atualização das skills, CLI e login).
