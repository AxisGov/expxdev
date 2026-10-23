# RECONCILIAÇÃO DE BASE PÓS-E8

Contrato: `docs/superpowers/specs/2026-10-07-reconciliacao-base-pos-e8-design.md`, seções 4 a 9,
14, 15, 19 e 20 (DM-178, DM-179, DM-183). A barreira de push que esta etapa alimenta está em
`references/12-barreira-de-push.md` (DM-184).

Este reference cobre o caminho para integrar uma base que avançou **depois** do E8, quando a
resolução semântica dessa integração exige ajustar arquivos que nasceram ou mudaram na base nova e
que nenhuma task do plano declara. O plano continua sendo a fonte do que a feature fez; o que a
integração da base exigiu tem registro próprio, com prova mecânica de origem, revisão humana
obrigatória, gate completo e novo portão.

A base que avança depois do E8 é **evento da entrega, não defeito de plano**: o registro é da
MergeX e nunca altera task (DM-178).

Sincronizar uma **feature redirecionada** com a base nova (a predecessora foi mergeada e o PR
foi redirecionado para a base dela; `references/09-revisao.md`, "Feature redirecionada",
DM-245) é uma integração de base depois do E8 e segue este reference: merge registrado da base
nova, E2 e push, com o portão provado. Nunca pelo botão de atualizar a branch do serviço, que
faz o merge sem o registro e deixa o portão vencido para o `pre-push` e para o CI, e nunca com
um commit vazio, que invalida o portão. O HEAD novo precisa de CI e, com `revisor_bot`
declarado na base, de revisão do bot, ambos depois do redirecionamento.

## Invariantes

1. **Tasks concluídas permanecem congeladas.** Nada aqui grava ou propõe gravar `tasks.md`,
   `sprint.md`, `fases.md` ou `00-PLANEJAMENTO.md`; o plano só é lido, para compor a união da V9 e
   para a prova 3. A reconciliação nunca altera `arquivos` de task nenhuma.
2. **Um commit por task continua verdadeiro.** O merge commit não é E1, não tem `Task:` e não entra
   em `ENTREGA.commits`; o commit de método da reconciliação também não.
3. **Nenhum `seq` novo.** `sequencia-de-commits.sh` não é chamado pela reconciliação; a lista
   `commits` e a V11 ficam idênticas.
4. **Reconciliação não esconde expansão de escopo.** Só é elegível o arquivo que a base nova criou
   ou alterou, que a feature não tocou antes do merge, que nenhuma task declara e que o merge de
   fato mudou em relação à base nova; todo arquivo reconciliado é olho obrigatório no E3 (O10,
   DM-182); qualquer commit de produto posterior invalida o portão.
5. **Falha fechada.** Toda prova que não pode ser calculada reprova. Não existe flag, variável de
   ambiente nem modo de hook **da MergeX** que pule a reconciliação, a V9 executável ou a validade
   do portão. Isso não torna incontornável um mecanismo exclusivamente local: o Git permite ignorar
   o `pre-push` deliberadamente (`git push --no-verify`). A barreira contra esse contorno, e contra
   o contorno pelo nome da branch, é o CI com proteção de merge, quando o produto o ativar, dentro
   dos limites da spec, seção 15.1 (itens 1 e 12); a local é contra erro normal (DM-184, DM-185,
   `references/12-barreira-de-push.md`).

## Modelo Git

| Símbolo | O que é | Como é obtido |
|---|---|---|
| `B0` | Última base validada da entrega | `base_validada_sha` do `ENTREGA.md` (E0, ou a `B1` da reconciliação anterior) |
| `P1` | A feature imediatamente antes do merge | primeiro pai de `M` |
| `B1` | A base nova integrada | segundo pai de `M` |
| `M` | O merge reconciliado | o commit de integração, com exatamente dois pais |

Condições estruturais, todas obrigatórias:

- `M` tem exatamente dois pais; `P1 = M^1`, `B1 = M^2`.
- `B0` é ancestral de `B1` (`git merge-base --is-ancestor B0 B1`).
- `B0` é ancestral de `P1`.
- `M` está na linha de primeiro pai de `HEAD` (o merge pertence à branch do trabalho, não a um
  ramo lateral).
- `B1` é ancestral da ponta atual da ref de base (`branch_base`) no momento do registro.
- A mensagem de `M` tem exatamente um `Trabalho: <trabalho_id>` igual ao da `ENTREGA.md`, um
  `Integra-base:` seguido do SHA completo de `B1`, e nenhum `Task:` nem `Metodo:` (a classe
  "integração de base" de `references/01-commits.md`).

`M` não é criado pela MergeX: é o merge que a pessoa (ou o agente, sob autorização) concluiu. A
MergeX valida e registra. A integração continua humana.

## As quatro provas de elegibilidade

Para cada caminho `f` declarado na reconciliação, com renomeação desligada (`--no-renames`):

| # | Prova | Comando de referência | Reprova quando |
|---|---|---|---|
| 1 | `f` nasceu ou mudou na base entre `B0` e `B1` | `git diff --no-renames --name-status B0 B1 -- f` | vazio; ou status `D` (a base removeu `f`); ou mudança de tipo (`T`), que também reprova |
| 2 | A feature não tocou `f` antes do merge | `git rev-list --first-parent P1 ^<início> -- f` | não vazio, salvo merges de reconciliações anteriores que já listam `f` |
| 3 | `f` não consta das tasks | união de `arquivos.cria` + `arquivos.altera` do plano corrente, e catálogo de método | `f` está na união ou é artefato de método |
| 4 | Existe diferença real entre `B1` e `M` | `git diff --quiet --no-renames B1 M -- f` | sem diferença; ou `f` ausente em `M` (a integração removeu `f`) |

`<início>` da prova 2 é `B0` na primeira reconciliação e o `M` da reconciliação anterior nas
seguintes.

Consequências deliberadas:

- Renomeação na base vale como remoção mais criação: só o caminho novo pode ser elegível.
- Arquivo removido pela base e mantido pela integração é ressurreição, não ajuste: reprova.
- Arquivo da base removido pela integração é perda de cobertura: reprova.
- Arquivo que já está nas tasks não precisa de reconciliação: o registro o recusa, para que nada
  seja coberto por dois caminhos.

Arquivo reconciliado só com as quatro provas e o inventário completo do merge; sem registro
parcial e sem bypass (DM-179).

## O artefato `RECONCILIACAO-BASE-NNN.md`

`docs/entregas/<trabalho_id>/RECONCILIACAO-BASE-NNN.md`, com `NNN` de três dígitos, a partir de
`001`, contínuo e sem lacunas. Um arquivo por merge de base integrado. É artefato de método da
MergeX: entra no catálogo, nunca no commit de uma task. Quem o grava é só o `--registrar`; nunca o
escreva nem o edite à mão.

### Frontmatter — `kind: reconciliacao_base`

| Chave | Tipo | Regra |
|---|---|---|
| `expx_schema` | inteiro | `1` |
| `expx_tool` | enum | origem do trabalho, igual ao `ENTREGA.md`: `sprintx` \| `runx` |
| `kind` | enum | `reconciliacao_base` |
| `trabalho_id` | texto | igual ao `ENTREGA.md` |
| `numero` | inteiro | `1`, `2`, ... igual ao `NNN` do nome do arquivo |
| `anterior` | texto ou nulo | o nome do artefato anterior da cadeia, `RECONCILIACAO-BASE-<NNN-1>.md`; `null` só no `001` |
| `branch` | texto | igual a `ENTREGA.branch` |
| `branch_base` | texto | nome da ref de base, só informativo; as provas usam os SHAs |
| `origem_base` | enum | `registrada_e0` \| `inferida_legado` (só no `001`) \| `reconciliacao_anterior` (do `002` em diante) |
| `b0_sha` | SHA-1, 40 hex | `B0` |
| `p1_sha` | SHA-1, 40 hex | `P1` |
| `b1_sha` | SHA-1, 40 hex | `B1` |
| `m_sha` | SHA-1, 40 hex | `M` |
| `estado` | enum | `ativa` \| `superada` |
| `arquivos` | lista | um item por caminho reconciliado; `[]` quando a integração não exigiu ajuste |
| `arquivos[].caminho` | texto | caminho relativo à raiz, exatamente como no Git |
| `arquivos[].status_base` | enum | `A` (nasceu entre `B0` e `B1`) \| `M` (mudou entre `B0` e `B1`) |
| `arquivos[].blob_b1` | SHA-1, 40 hex | `git rev-parse B1:<caminho>` |
| `arquivos[].blob_m` | SHA-1, 40 hex | `git rev-parse M:<caminho>` |
| `arquivos[].diff_b1_m_sha256` | sha256, 64 hex | ver abaixo |
| `arquivos[].motivo` | texto | uma linha: o que da feature tornou o ajuste necessário |
| `registrado_em` | data ISO | data do sistema no registro |
| `assinatura` | sha256, 64 hex | ver abaixo |

Regras:

- Todas as chaves sempre presentes; lista vazia é `[]`. Um merge de base sem arquivo a reconciliar
  gera o artefato com `arquivos: []`: é ele que avança a base validada.
- SHAs sempre completos (40 hex), nunca nome de ref.
- `motivo` é texto de uma linha, não vazio, sem marcador de template; é para o revisor, não entra
  em prova.
- `diff_b1_m_sha256` é o sha256 da saída de
  `git -c core.quotepath=false -c diff.noprefix=false -c diff.mnemonicPrefix=false -c diff.suppressBlankEmpty=false -c diff.relative=false diff --no-ext-diff --no-textconv --no-color --binary --full-index --no-renames --no-relative --src-prefix=a/ --dst-prefix=b/ -U3 --inter-hunk-context=0 --diff-algorithm=myers --indent-heuristic B1 M -- <caminho>`,
  rodado da raiz do repositório, com pathspec literal. As flags explícitas tornam o valor
  independente da configuração local e do clone (a linha `index` sai com SHA completo). Limitação
  conhecida: os atributos `-diff`/`binary` (de `.gitattributes`, `info/attributes` ou
  `core.attributesFile`) não têm flag que os desligue e ainda alteram a saída, trocando o patch
  textual por `GIT binary patch`. Isso muda o hash entre clones com atributos diferentes, e o
  efeito só pode ser falhar fechado no `--verificar`.
- `assinatura` é o sha256 das linhas canônicas, em ordem de byte: `numero`, `anterior`,
  `trabalho_id`, `b0_sha`, `p1_sha`, `b1_sha`, `m_sha`, e uma linha por arquivo
  `caminho\tstatus_base\tblob_b1\tblob_m\tdiff_b1_m_sha256`. `motivo`, `estado` e `registrado_em`
  não entram. Editar o artefato à mão quebra a assinatura.

### Estados

| Estado | Significado | Quem grava |
|---|---|---|
| `ativa` | Última reconciliação da cadeia | `--registrar` |
| `superada` | Uma reconciliação seguinte da mesma entrega já a encadeou | `--registrar` da seguinte |

Não existe estado editável à mão nem estado "aceita com ressalva". `superada` não remove cobertura:
os arquivos de uma reconciliação superada continuam cobertos enquanto o conteúdo em `HEAD` for o
`blob_m` registrado.

### Prosa

Abaixo do frontmatter: um parágrafo com a base integrada e o merge que a integrou, e uma tabela por
arquivo (caminho, status na base, motivo). Sem frontmatter extra, sem cópia de diff. O frontmatter
não tem número de pull request, e a prosa não cita um.

## Comandos

O executável é `scripts/reconciliacao-base.sh`. Não existe `--force`, nem `--sem-prova`, nem
variável de ambiente que relaxe prova.

### `--registrar`

```bash
bash .claude/skills/mergex/scripts/reconciliacao-base.sh --registrar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id> \
  [--merge <sha>] -- <caminho-1> <caminho-2> ...
```

- Sem `--merge`, `M` é `HEAD`. Com `--merge <sha>`, registra um merge anterior ainda não publicado
  (`M` na linha de primeiro pai de `HEAD`, entre a base validada e `HEAD`), para encadear merges
  concluídos antes de a MergeX nova estar instalada.
- Exige: stage vazio; nenhum merge em andamento (`MERGE_HEAD` ausente); branch ativa igual a
  `ENTREGA.branch`; contexto explícito igual a `ENTREGA.trabalho_id`/`expx_tool`; a trava C5 do
  índice adquirida.
- Calcula as condições estruturais e as quatro provas para cada caminho dado.
- **Inventário completo:** calcula também o conjunto `git diff --name-only --no-renames B1 M` e
  exige que todo caminho desse conjunto esteja na união das tasks, no catálogo de método ou na
  lista dada. Um caminho alterado pelo merge e não declarado reprova o registro inteiro: não existe
  registro parcial.
- Grava o artefato `NNN` seguinte, marca o anterior como `superada` e atualiza o `ENTREGA.md`
  (`base_validada_sha` passa a `B1`, `reconciliacoes` ganha o item, e a entrega é reaberta — ver
  "O `ENTREGA.md` depois do registro"). **Não faz commit:** quem persiste é o checkpoint
  `reconciliacao-base`.
- **Reexecução:** o mesmo `M` da última reconciliação, com a mesma lista, não grava nada e devolve
  `0` com `noop=true`; com outra lista, código `5`.

### `--verificar`

```bash
bash .claude/skills/mergex/scripts/reconciliacao-base.sh --verificar \
  --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id>
```

Só leitura: nunca grava e nunca adquire a trava. Para toda a cadeia `001..NNN`:

- numeração contínua, `anterior` encadeado, `b0_sha` de cada uma igual ao `b1_sha` da anterior, e o
  `b0_sha` do `001` igual ao `base_validada_sha` original da entrega;
- assinatura recalculada igual à gravada;
- condições estruturais e as quatro provas recalculadas sobre o histórico atual;
- para cada caminho coberto: o conteúdo em `HEAD` é o `blob_m` da reconciliação mais recente que o
  lista. Arquivo reconciliado alterado depois de `M` deixa de estar coberto, e a verificação
  reprova.

Saída: `ok=true` e uma linha `coberto\t<caminho>\t<NNN>` por arquivo; ou `ok=false` e uma linha
`motivo\t<código>\t<detalhe>` por falha. Nenhum campo do artefato é aceito sem recálculo.

### `--verificar --checkpoint reconciliacao-base` — a barreira do E2

```bash
bash .claude/skills/mergex/scripts/reconciliacao-base.sh --verificar \
  --checkpoint reconciliacao-base --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
  --origem <sprintx|runx> --trabalho <trabalho_id>
```

Faz tudo o que `--verificar` faz e exige ainda que a reconciliação esteja **persistida**:

- o `ENTREGA.md` e cada artefato listado em `reconciliacoes` estão rastreados, e o conteúdo do disco
  de cada um é igual ao de `HEAD`. A comparação é por conteúdo
  (`git rev-parse HEAD:<f>` contra `git hash-object --no-filters <f>`), não pelo que o índice
  informa, para que `assume-unchanged` e `skip-worktree` não a enganem;
- o conjunto de `RECONCILIACAO-BASE-NNN.md` em `HEAD`, o do disco e o listado no `ENTREGA.md` de
  `HEAD` são o mesmo.

Falha de persistência: `ok=false` com `motivo\tpersistencia\t<arquivo>`, código `5`. Outro valor de
`--checkpoint`, ou `--checkpoint` no `--registrar`: código `64`. Limite conhecido: com
`core.autocrlf` convertendo o checkout, a comparação sem filtros reprova mesmo com o `git status`
limpo. É falha fechada, e usar os filtros reabriria o contorno que `--no-filters` fecha.

## Códigos de saída

Os mesmos nos dois modos:

| Código | Significado |
|---|---|
| 0 | registrado / verificado (inclusive `noop=true` na reexecução) |
| 1 | ambiente: fora de repositório, temporário ou trava que não se cria |
| 2 | trava C5 ocupada |
| 3 | stage não vazio ou merge em andamento |
| 4 | prova reprovada (estrutura, uma das quatro provas, inventário incompleto, campo recalculado, cobertura); também histórico que não prova: repositório raso (`estrutura[raso]`) ou objeto Git ausente, antes de qualquer prova e sem gravar nada |
| 5 | contrato do artefato, da cadeia ou do `ENTREGA.md` inválido (numeração, encadeamento, assinatura), reconciliação já registrada com outra lista; persistência (barreira) |
| 6 | base validada indeterminável (legado ambíguo) |
| 64 | uso incorreto |

## Checkpoint de método `reconciliacao-base`

O enum de `persistir-metodo.sh`, `contrato-de-commit.sh` e `catalogo-de-metodo.sh` é
`pre-e2 | reconciliacao-base | predecessores | retomar-v9-predecessores | pre-e6 | e8`.

- Catálogo do checkpoint: `docs/entregas/<trabalho_id>/ENTREGA.md` e os
  `RECONCILIACAO-BASE-NNN.md` de `ENTREGA.reconciliacoes`, sujos. Nada de produto, de teste ou de
  plano.
- É ação explícita, depois do `--registrar` e antes do E2:

  ```bash
  bash .claude/skills/mergex/scripts/persistir-metodo.sh --persistir \
    --entrega docs/entregas/<trabalho_id>/ENTREGA.md \
    --origem <sprintx|runx> --trabalho <trabalho_id> --checkpoint reconciliacao-base
  ```

- Mensagem:

  ```
  chore(mergex): persiste metodo reconciliacao-base

  Trabalho: <trabalho_id>
  Metodo: reconciliacao-base
  ```

- Mesma trava, mesma varredura de segredo, mesmo stage vazio na entrada, sem commit vazio.
- Não entra em `ENTREGA.commits`, não consome `seq`, não satisfaz V11.
- `--verificar --checkpoint reconciliacao-base` é a barreira que o E2 exige quando a entrega tem
  reconciliação (`reconciliacoes` não vazia): artefatos e `ENTREGA.md` persistidos e a verificação
  com `ok=true`. Sem essa barreira aprovada, o E2 não emite `PRONTO`
  (`references/02-prontidao.md`).
- Um commit `Metodo: reconciliacao-base` depois de `portao_sha` invalida o portão: o registro já o
  devolveu a `null`, e só `pre-e6` e `e8` mantêm a validade (DM-181).

## O `ENTREGA.md` depois do registro

O `--registrar` reabre a entrega como a retomada do E0 já faz: `estado: aberto`, `portao: null`,
`portao_sha: null`, `falhas_portao: []`, `causa: null`, `push_feito: false`, `entregue_em: null`;
preserva `commits`, `criado_em`, `pr_url`, `pr_estado`, `desvios`. `base_validada_sha` passa ao
`b1_sha` registrado e `reconciliacoes` ganha `{numero, arquivo, b1_sha, m_sha}`. As chaves estão em
`references/00-schema.md`.

## Compatibilidade e base legada

- **Execução nova:** o E0 grava `base_validada_sha = git merge-base HEAD <branch_base>` e
  `origem_base: registrada_e0` (`references/00-abertura.md`).
- **Primeira sprint depois do PR de planejamento:** a retomada do E0 reancora a base com
  `origem_base: registrada_sprint` (DM-261). Uma reconciliação sobre ela abre a cadeia como sobre
  qualquer base registrada: o `001` grava `origem_base: registrada_e0`. O E0 não reancora uma
  entrega que já tem `reconciliacoes`.
- **Entrega anterior a esta versão** (sem `base_validada_sha`): na primeira reconciliação, e só
  nela, o `--registrar` infere `B0 = git merge-base P1 B1` e grava `origem_base: inferida_legado`
  no `ENTREGA.md` e no artefato `001`. A inferência falha fechada (código `6`) quando:
  - há mais de um merge-base (`git merge-base --all` com mais de um resultado);
  - a linha de primeiro pai de `P1` desde o merge-base já contém algum merge commit;
  - o merge-base não é ancestral de `B1`.
- Depois de gravada, a base nunca é inferida de novo: as seguintes vêm da cadeia (DM-183).
- **Múltiplas reconciliações:** cada merge de base gera o `NNN` seguinte; `b0_sha` do novo é o
  `b1_sha` do anterior; o anterior vira `superada`. Merges concluídos antes da instalação podem ser
  registrados em ordem com `--merge <sha>`, um por vez, do mais antigo para o mais novo.
- **Entrega sem reconciliação:** comportamento idêntico ao anterior, com a base fixada por SHA.

## Fluxo completo depois de uma reconciliação

1. Merge normal da base nova, resolução semântica, testes focados e revisão da resolução.
2. Commit de integração `M` (classe integração de base, `references/01-commits.md`).
   Nesse commit o `arquivo-fora-do-plano` acusa os caminhos que a reconciliação vai cobrir (o arquivo
   da base ajustado na resolução está fora do plano por definição). Com o hook em `bloqueio`, quem faz
   o commit de `M` precisa do hook em `aviso` para esse commit; a cobertura vem depois, pelo `--registrar`.
3. Gate completo do repositório (o do `ORQUESTRADOR.md`) sobre `HEAD`.
4. `reconciliacao-base.sh --registrar` com os caminhos ajustados.
5. Checkpoint `reconciliacao-base`.
6. E2 completo: barreira `reconciliacao-base` + V1–V12 com a V9 executável + `pre-push` da MergeX
   comprovadamente ativo; grava `portao` e `portao_sha`. `BLOQUEADO` encerra como sempre (E8
   bloqueado, sem push).
7. E3 sobre o delta, com O10 para os reconciliados.
8. E4 e E5 regravados (lista de arquivos, testes, colaterais).
9. Checkpoint `pre-e6`.
10. E6: push, exigindo portão válido; quem decide é o `pre-push`, sobre o SHA enviado.
11. E7: retomada do PR existente (nunca um segundo PR).
12. E8 e checkpoint `e8`; push final do registro.

## Falhas fechadas

| Situação | Resultado |
|---|---|
| Merge em andamento ao registrar ou persistir | Código 3; nada gravado |
| `M` com número de pais diferente de 2, pais trocados, ou fora da linha de primeiro pai | Código 4 |
| Qualquer uma das quatro provas reprovada | Código 4; nenhum artefato |
| Caminho alterado pelo merge e não declarado (inventário) | Código 4; nenhum artefato |
| Artefato editado à mão (assinatura) ou cadeia quebrada | `--verificar` código 5; V9 `v9_sem_prova` |
| Arquivo reconciliado alterado depois de `M` | Deixa de estar coberto; V9 `FALHA` |
| Base legada ambígua | Código 6; nada gravado |
| Portão vencido, ausente, inconsistente ou ilegível no push de uma ref aplicável | `pre-push` barra o push inteiro, em qualquer modo; o CI, quando ativo no produto, reprova o PR |
| Repositório raso ou objeto Git ausente | Validade `historia_incompleta`; V9 `v9_sem_prova`; reconciliação código 4 (`estrutura[raso]`); `pre-push` e CI barram, com diagnóstico de história incompleta |
| Ambiente impede a avaliação (dependência ausente, fora de repositório, temporário, validador ausente) | Validade `erro_ambiente`; `pre-push` e CI barram, com diagnóstico de ambiente |
| `pre-push` efetivo que não chama a MergeX, não propaga o código de saída ou não bloqueia a ref inválida da prova controlada | E2 não emite `PRONTO` |
| Reconciliação registrada e não persistida, ou persistência adulterada | Barreira código 5 (`persistencia`); E2 não emite `PRONTO` |
| Push com `--no-verify` | Hook do Claude bloqueia quando identifica com certeza; o CI, quando ativo no produto, reprova o PR |
| Hook do Claude incapaz de determinar o push | Avisa; a decisão fica com o `pre-push` |
| Ferramenta ausente (`git`, `jq`) | Reprova; nunca degrada para aprovado |

As linhas da barreira de push (ativação, composição com hook de terceiro, prova funcional, modo de
`portao: null`) estão detalhadas em `references/12-barreira-de-push.md`.

Não existe flag de bypass em nenhum dos executáveis. O validador de contrato procura e reprova
qualquer opção de força nesses scripts.

### Riscos residuais conhecidos

Limites de desenho que o Git local não distingue, encontrados durante a implementação e aceitos.
Cada item que pode ser montado em fixture tem um teste que fixa o comportamento atual; os demais
estão documentados no cabeçalho do executável afetado:

1. **Portão reposicionado por commit de método.** O `ENTREGA.md` está no catálogo de `pre-e6` e
   `e8`. Um commit classificado como método pode regravar `portao_sha` para um commit posterior,
   até um de produto, e o portão volta a valer. Pelos dados atuais, isso é indistinguível do fluxo
   legítimo em que o E2 avalia esse commit e o `pre-e6` persiste o resultado: mesmo grafo e mesmo
   conteúdo. A validade prova que nada mudou depois de `portao_sha`, não que um E2 rodou nele.
2. **Entrega legada sem reconciliação.** Uma ref de base movida para um commit sem nenhuma marca do
   trabalho é aceita, porque a V9 lê a ref nesse caso. Também não é detectada uma âncora
   originalmente incorreta: o `ENTREGA.md` que já nasce com `base_validada_sha` num commit só de
   produto, inclusive o renomeado para o caminho canônico num ramo montado do zero.
3. **B1 lateral.** Com reconciliação, a cadeia não reconfere `b1_sha` contra a base real. Um `B1`
   forjado, que descende de `B0` e traz produto, com a ref movida no registro, desloca a base.
4. **Clone raso legítimo falha fechado.** CI ou máquina com `--depth` recebe `historia_incompleta`
   ou `v9_sem_prova` e precisa de `git fetch --unshallow` antes do E2 e do push.
5. **Isenção por prefixo.** A V9 isenta `docs/entregas/<id>/` por prefixo, como a regra existente,
   então um arquivo de produto colocado ali não é apontado pela V9. A validade do portão continua
   barrando esse arquivo depois do portão (`metodo_fora_do_catalogo`).
6. **`core.autocrlf` na barreira.** A comparação sem filtros reprova com o `git status` limpo.
   Falha fechado.
7. **Hash do diff com atributos `-diff`/`binary`.** Pode divergir entre clones, e o `--verificar`
   falha fechado.
8. **Escala resolvida pela DM-184.** A primeira implementação da barreira de push varria todas as
   branches entregues do repositório a cada comando, e com dezenas delas estourava o prazo. O
   `pre-push` avalia só as refs do push: o custo deixou de depender das branches existentes.

Os riscos residuais da própria barreira de push — o autor do PR que controla o modo e os scripts do
CI, o PR sem `ENTREGA.md`, várias entregas no mesmo PR, a base do evento defasada e o hook
consultivo diante de caminho UNC — estão em `references/12-barreira-de-push.md` e em
`.claude/hooks/README.md`. O contorno pelo nome da branch foi fechado pela DM-185: a entrega é
selecionada pelo conteúdo do que é enviado.

## Reversão

- Reverter a MergeX é voltar o pin para o commit anterior e reinstalar. Não há migração de dados:
  as chaves novas do `ENTREGA.md` e os artefatos ficam como documentação.
- Uma entrega que dependia de reconciliação volta a reprovar na V9 da versão antiga — falha
  fechada, nunca aprovação indevida.
- O hook de push antigo volta a ler o portão por data; a reversão reabre o defeito do portão sem
  vínculo com commit, e isso deve constar do PR de reversão.
- O `pre-push` ativado pelo E0 continua chamando o executável da MergeX. A reversão remove apenas o
  chamador gerenciado pela MergeX, reconhecido pelo marcador, e nunca toca num hook de terceiro.
  Quem compôs um hook próprio com a MergeX desfaz a composição por conta própria, e o PR de reversão
  explica o passo (`references/12-barreira-de-push.md`, "Reversão").

## Fora de escopo

- Qualquer mudança na SprintX, inclusive a brecha observada de `defeito_de_plano` com `task: null`
  abrir rodada sem task bloqueada (`planejamento.sh`), que fica registrada para a SprintX tratar.
- Qualquer mudança de código no BuildX ou no ExpxDev.
- Suporte do painel ao `kind: reconciliacao_base`.
- Rebase, cherry-pick ou squash da base; reconciliação de renomeação como tal; ressurreição ou
  remoção de arquivos da base.
- Merge automático da base pela MergeX: a integração continua humana.
- Publicação automática: nada desta etapa faz push fora do E6/E8.
- Ativação do CI e da proteção de merge em qualquer produto, e o empacotamento do `pre-push` e do
  template de CI pelo ExpxDev: handoffs posteriores e separados (DM-184).
- Interpretar texto de comando de shell como fronteira de segurança do push (rejeitado pela DM-184).
