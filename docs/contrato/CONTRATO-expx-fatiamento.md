# Contrato `expx-fatiamento` — mudanças pequenas, revisáveis, em ordem

Este contrato vale para **todo desenvolvimento** nos repositórios do método —
`expxdev`, `sprintx`, `mergex` e as demais skills — e para quem o conduz, pessoa
ou agente. Ele não trata do formato dos artefatos (isso é `CONVENCOES.md`): trata
do **tamanho e da ordem** em que uma mudança chega ao `main`.

## Por que existe

A revisão automática que o método usa (CodeAnt) **não revisa** PR grande nem
arquivo acima de um limite de tamanho. O limite de arquivo é de cerca de 200 KB,
valor de memória, ainda não confirmado contra a documentação do revisor; por
isso as regras abaixo ficam com folga sob ele. O efeito de ignorá-las é
silencioso: a PR não recebe comentário nenhum, e "sem comentário" é lido como
"sem problema".

Medido em outubro de 2026, antes desta regra:

| Mudança | Tamanho |
|---|---|
| promoção da linha P0.2 da sprintx para o `main` | +19 mil linhas, 61 arquivos, 100 commits |
| promoção da linha P0.2 da mergex para o `main` | +43 mil linhas, 177 arquivos |
| `bancada.sh` da sprintx | 604 KB em um arquivo |
| `test-r1-reconciliacao-base.sh` da mergex | 239 KB em um arquivo |

Parte da linha P0.2 entrou por commits diretos, sem PR: nada nela foi revisado
por quem revisa.

## As regras

Referencie sempre com o prefixo `F` (`F2`, `F4`), para não colidir com as `R` de
`CONVENCOES.md`.

### F1 — Um assunto por PR e por commit

Uma PR responde a uma pergunta só: "o que muda e por quê" cabe em uma frase. Duas
decisões independentes são duas PRs. Correção de revisão entra como commit na PR
que a motivou; se o achado é anterior à PR (o trecho já estava no `main`), vai
para PR própria e a thread original aponta para ela.

### F2 — Tamanho da PR

No máximo **400 linhas alteradas** (adições mais remoções) e **20 arquivos**,
sem contar os arquivos gerados (`FATIA_IGNORAR`: o lock de dependências e os
snapshots de `fixtures/candidatos/`, que entram em commit próprio).

### F3 — Tamanho do commit

No máximo **300 linhas alteradas** por commit. Um commit que o revisor não
consegue ler em uma passada não é revisado.

### F4 — Tamanho de arquivo

Arquivo de texto versionado:

- até **100 KB**: livre;
- de 100 a **150 KB**: aviso — o arquivo está perto do limite;
- acima de **150 KB**: **não cresce**. A PR o divide ou não mexe nele, com a
  tolerância de 2 KB por PR para a edição inevitável (uma linha de tabela).

Quando um arquivo precisa crescer e já está perto do limite, o conteúdo novo vai
para um arquivo novo. Registro cumulativo (`DECISOES-DA-SKILL.md`, bancadas) se
divide por época ou por seção; a divisão é PR própria, mecânica (F6).

### F5 — Linha longa se promove em fatias, na ordem do histórico

Uma linha de trabalho (`p0.2/*`, ou qualquer branch longa) chega ao `main` em
várias PRs, cada uma:

1. dentro de F2 e F3;
2. **na ordem do histórico**, para que cada fatia sobre a anterior e nenhuma
   dependa do que ainda não entrou;
3. **verde sozinha**: a suíte e os validadores passam com só aquela fatia;
4. **revisada**: nenhuma fatia entra por commit direto ou por merge em bloco.

O merge em bloco de uma linha só é aceito quando todas as fatias dela já
passaram por PR revisada em uma base intermediária. Commit direto na linha não
é caminho para escapar da revisão: ele entra na fatia seguinte como qualquer
outro.

### F6 — Exceções declaradas

Duas, e só elas:

- **movimento mecânico**: dividir ou renomear arquivo sem alterar conteúdo, em PR
  que não faz mais nada. Declara-se com `FATIA_EXCECAO=<motivo>`, que rebaixa F2
  e F3 a aviso e imprime o motivo;
- **artefato gerado**: snapshot e fixture regenerados por script, em commit
  separado do código que os motivou, com o comando que os gerou no corpo da PR.

F4 não tem exceção: o limite de arquivo é do revisor, não nosso.

## Como verificar

```bash
bash scripts/verificar-fatiamento.sh <base> <head>
```

Compara `<base>...<head>`, lista as violações com a regra (`F2`, `F3`, `F4`) e
sai com 1 se houver alguma. Os limites vêm das variáveis `FATIA_MAX_LINHAS_PR`,
`FATIA_MAX_ARQUIVOS`, `FATIA_MAX_LINHAS_COMMIT`, `FATIA_MAX_KB_ARQUIVO`,
`FATIA_AVISO_KB`, `FATIA_TOLERANCIA_B` e `FATIA_IGNORAR`, com os valores desta
página como padrão. O `ci.yml` do `expxdev` roda o verificador em toda PR.

## O que é do método, e o que ainda não é

Esta página é a regra. Duas coisas dependem dela e **não foram feitas**:

- o `mergex`, que abre a PR (E7), passa a medir a PR contra F2 a F4 antes de
  abrir e a recusar a abertura com a lista de violações;
- a `sprintx`, que fatia o plano em tasks, passa a tratar F3 como critério de
  tamanho de task.

Até lá, a conferência é do `verificar-fatiamento.sh` e de quem abre a PR.

## Histórico

| Data | Mudança |
|---|---|
| 2026-10-15 | Contrato criado, depois que o CodeAnt deixou de revisar as PRs de promoção da linha P0.2 (+19 mil e +43 mil linhas). |
