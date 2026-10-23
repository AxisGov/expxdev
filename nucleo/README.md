# Núcleo compartilhado

O que as skills do método precisam ter **igual**, escrito uma vez só — mais
o que o **plugin como um todo** precisa ter, independente de quais skills
foram selecionadas.

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `hooks/expx-rastro.sh` | O rastro de eventos, os modos de hook e o `trabalho_id` |
| `scripts/expx-fatiamento.mjs` | O leitor único de `.expx/fatiamento.json` (seção `scripts/` abaixo) |
| `scripts/expx-limites.mjs` | As exclusões do núcleo, a gramática de `excluir_da_revisao` e a regra dos nomes `FATIA_*` reservados |
| `scripts/expx-revisao.mjs` | A revisão por task pela CLI do CodeAnt: `revisar`, `conferir`, `rejeitar`, `listar` (seção `scripts/` abaixo) |
| `commands/onboarding.md` | `/expx:onboarding` — orquestra o mapeamento inicial (stackx, designx, legadox, memox, prodx) das camadas instaladas. Não é núcleo de hook: `montarPlugin` o copia à parte, direto para `commands/` na raiz do plugin — não para dentro de `nucleo/` — porque é assim que o Claude Code descobre um comando. |

## Como chega até um projeto

Por **cópia**, nunca por dependência.

Nenhum dos repositórios de skill tem `package.json` — eles são plugins
instalados sozinhos, e cada projeto precisa rodar de forma independente. Uma
biblioteca importada em tempo de execução quebraria exatamente isso.

Então: a fonte é este diretório, o `expx init` copia (`montarPlugin` leva
`nucleo/` junto com o plugin), e o que chega ao projeto é um arquivo em disco.
Sem `npm install`, sem runtime compartilhado, sem rede.

## Como usar num hook

A ferramenta é **parâmetro**, definido antes do `source`:

```sh
EXPX_FERRAMENTA=mergex
. "$(dirname "$0")/../nucleo/hooks/expx-rastro.sh"

MODO="$(expx_modo "$RAIZ" git-perigoso seguranca)"
[ "$MODO" = "desligado" ] && exit 0

expx_rastro_grava "$RAIZ" acao_bloqueada hook bloqueado "commit na main" '[]' \
  '"hook":"git-perigoso"'
```

Variáveis que o rastro lê, todas opcionais:

| Variável | Efeito |
|---|---|
| `EXPX_FERRAMENTA` | o campo `ferramenta` da linha (**defina sempre**) |
| `EXPX_TRABALHO_ID` | vence a detecção automática |
| `EXPX_FASE` / `EXPX_TASK` | preenchem `fase` e `task` (JSON: com aspas) |
| `EXPX_AGENTE` | o subagente; sem ela, `principal` |
| `EXPX_MODEL` / `EXPX_EFFORT` | o modelo e o esforço efetivos informados pelo runtime; vencem qualquer fallback |
| `EXPX_HARNESS` | o harness; só `claude`/`claude-code` (ou, sem ela, `CLAUDECODE`) permitem o fallback de `.claude/agents/` |

## `scripts/`

Ferramentas Node (ESM, só `node:`), copiadas daqui como o resto do núcleo e
chamadas por caminho. `expx-limites.mjs` concentra as regras fixas (exclusões,
`FATIA_*` reservados, perfis em `perfis/`, predicado de revisável, medidas da CLI,
localização e integridade do pacote da CLI), importadas pelo leitor e pela
revisão. O módulo não lê o ambiente por conta própria.

`expx-fatiamento.mjs` (formato no contrato de instalação, §5.2): `node <L>`
imprime somente `EXPX_*` para `eval`; `--formato json` imprime as decisões
efetivas; `--validar` só valida. Arquivo inválido ou qualquer `FATIA_*` no
ambiente sai 1. `<L>` é
`.expx/marketplace/plugins/expx/nucleo/scripts/expx-fatiamento.mjs`. O `doctor`
o usa hoje; nos planos seguintes, sprintx (F3/F6) e mergex (E7) passarão a
chamá-lo.

`expx-revisao.mjs` (contrato em `docs/contrato/CONTRATO-expx-revisao.md`):
`revisar` confere que o `codeant` do `PATH` é o pacote homologado e íntegro
(`npm i -g codeant-cli@0.5.14`), aplica as exclusões e os limites L1 e L2, roda a
CLI uma vez (`--uncommitted` ou `--base-commit <sha>`) pelo arquivo conferido,
reconcilia a resposta com a task e grava a evidência v2 em
`docs/entregas/<trabalho>/revisao/<T-NN.MM>.json`; sai 0 (`ok`), 1 (achado aberto),
2 (`indisponivel`) ou 3 (`incompleta`). `conferir` é a regra da V12 da mergex
(`incompleta` é FALHA em qualquer modo, e a evidência tem de cobrir os arquivos
que o commit da task altera); `rejeitar` registra a rejeição de um
achado pelo desenvolvedor; `listar` devolve, em JSON, os achados rejeitados, as
rejeições e os removidos da evidência que o `conferir` aceita. Qualquer `FATIA_*` no ambiente sai 64. A sprintx
(passo de revisão da F6) e a mergex (E2, V12) passam a chamá-lo nos planos delas.

## Por que existe

Cada skill tinha a sua implementação do rastro — quatro no total, em duas
linguagens. Não eram cópias que divergiram: eram **reescritas**, porque o
`comum/rastro.sh` de cada repositório trazia o nome da ferramenta cravado no
código (`"ferramenta":"sprintx"`), e um arquivo que se identifica não pode ser
compartilhado.

E já divergiam em produção, antes mesmo de o painel ler o rastro:

- chave extra no meio do objeto, quebrando a verificação de uma skill irmã
- `agente` ora `null`, ora `"principal"`, para o mesmo caso
- três estratégias diferentes para descobrir o `trabalho_id`
- dois conjuntos de modos: uma skill não conhecia `desligado` e continuava
  rodando depois de alguém pedir para desligá-la
- um leitor de lock com o nome do arquivo errado, falhando em silêncio

## Adoção

Incremental, uma skill por vez. Uma skill migra quando trocar o `source` do seu
`comum/rastro.sh` por este arquivo e renomear as chamadas (`rastro_*` →
`expx_*`). Enquanto não migra, continua com a cópia própria — que é o ponto de
distribuir por cópia: nada quebra enquanto a migração não acontece.

O que garante que as duas não divirjam no meio do caminho é o validador:
`expx doctor` lê `docs/eventos/*.jsonl` e aponta toda linha fora do contrato,
seja qual for a implementação que a escreveu.

## Contratos

- [`CONVENCOES.md`](../docs/contrato/CONVENCOES.md) — R1 a R14, o documento raiz
- [`CONTRATO-expx-eventos.md`](../docs/contrato/CONTRATO-expx-eventos.md) — a linha do rastro, hooks e agentes
- [`CONTRATO-expx-schema-v1.md`](../docs/contrato/CONTRATO-expx-schema-v1.md) — o frontmatter de estado
