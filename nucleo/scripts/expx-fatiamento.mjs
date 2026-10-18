// Leitor único de `.expx/fatiamento.json` (contrato expx-instalacao §5.2); cópia
// do expxdev, chamada por sprintx, mergex e o doctor, para a regra existir uma vez só.
//
//   node expx-fatiamento.mjs [--raiz <dir>] [--formato env|json] [--validar]
//
// Sem arquivo: os padrões. Inválido: sai 1, uma linha `expx-fatiamento: <chave>:
// <motivo>` por erro no stderr, nada no stdout — nunca os padrões. Uso errado: 2.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LEGIBILIDADE = { pr_linhas: 400, pr_arquivos: 20, commit_linhas: 300 };
const ARQUIVO = { kb: 150, linhas: 4000 };
const CAP_ARQUIVOS = 100; // capacidade do revisor: não calibrável
const TETOS = { legibilidade: { pr_arquivos: CAP_ARQUIVOS }, arquivo: { linhas: 5000 } };
const EXCLUIDO_PADRAO = ["^docs/(sprintx|entregas|eventos)/"];
const MODOS = ["obrigatoria", "se_disponivel", "desligada"];
const ENTREGAS = ["por_trabalho", "por_sprint"];
const CHAVES = ["expx_fatiamento", "justificativa", "legibilidade", "arquivo", "ignorar", "capacidade", "revisao_por_task", "entrega"];

function uso(msg) {
  process.stderr.write(`expx-fatiamento: ${msg}\nuso: node expx-fatiamento.mjs [--raiz <dir>] [--formato env|json] [--validar]\n`);
  process.exit(2);
}
const op = { raiz: process.cwd(), formato: "env", validar: false };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--validar") op.validar = true;
  else if (a !== "--raiz" && a !== "--formato") uso(`argumento desconhecido: ${a}`);
  else if (args[i + 1] === undefined) uso(`${a} exige valor`);
  else op[a.slice(2)] = args[++i];
}
if (op.formato !== "env" && op.formato !== "json") uso(`formato desconhecido: ${op.formato}`);

const erros = [];
const erro = (chave, motivo) => erros.push(`expx-fatiamento: ${chave}: ${motivo}`);
const ehObjeto = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Objeto de um nível com só as chaves conhecidas; `{}` se ausente ou inválido. */
function bloco(cfg, nome, conhecidas) {
  const v = cfg[nome];
  if (v === undefined) return {};
  if (!ehObjeto(v)) return erro(nome, "deve ser um objeto"), {};
  for (const k of Object.keys(v)) if (!conhecidas.includes(k)) erro(`${nome}.${k}`, "chave desconhecida");
  return v;
}

/** Inteiros positivos dentro da capacidade; os ausentes ficam com o padrão. */
function limites(cfg, nome, padrao) {
  const v = bloco(cfg, nome, Object.keys(padrao));
  const r = { ...padrao };
  for (const k of Object.keys(padrao)) {
    const teto = TETOS[nome][k];
    if (v[k] === undefined) continue;
    if (!Number.isInteger(v[k]) || v[k] <= 0 || v[k] > 2 ** 31 - 1) erro(`${nome}.${k}`, "deve ser inteiro entre 1 e 2^31-1");
    else if (teto !== undefined && v[k] > teto) erro(`${nome}.${k}`, `acima da capacidade do revisor (${teto})`);
    else r[k] = v[k];
  }
  return r;
}

function regexes(v, nome) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return erro(nome, "deve ser uma lista de expressoes regulares"), [];
  v.forEach((p, i) => {
    if (typeof p !== "string" || p === "") return erro(`${nome}[${i}]`, "deve ser texto nao vazio");
    // quem aplica é o bash (`[[ =~ ]]`, ERE): `(?…)`, `\d`, `\w`, `\1` só existem no JavaScript
    if (/\(\?|\\[A-Za-z0-9]/.test(p)) return erro(`${nome}[${i}]`, "fora do ERE do verificador ((?...), \\d, \\w, \\1)");
    try { new RegExp(p); } catch (e) { erro(`${nome}[${i}]`, `expressao regular invalida (${e.message})`); }
  });
  return v;
}

function resolver(cfg, origem) {
  if (!ehObjeto(cfg)) return erro(".expx/fatiamento.json", "deve ser um objeto JSON"), undefined;
  if (origem === "projeto") {
    for (const k of Object.keys(cfg)) if (!CHAVES.includes(k)) erro(k, "chave desconhecida");
    if (cfg.expx_fatiamento !== 1) erro("expx_fatiamento", "versao desconhecida (esperada 1)");
  }
  const legibilidade = limites(cfg, "legibilidade", LEGIBILIDADE);
  const arquivo = limites(cfg, "arquivo", ARQUIVO);
  const ignorar = regexes(cfg.ignorar, "ignorar") ?? [];
  const cap = bloco(cfg, "capacidade", ["excluido_no_painel"]);
  const excluido = regexes(cap.excluido_no_painel, "capacidade.excluido_no_painel") ?? EXCLUIDO_PADRAO;
  const r = bloco(cfg, "revisao_por_task", ["modo"]);
  const modo = r.modo === undefined ? "se_disponivel" : r.modo;
  if (!MODOS.includes(modo)) erro("revisao_por_task.modo", `deve ser ${MODOS.join(", ")}`);
  const entrega = cfg.entrega === undefined ? "por_trabalho" : cfg.entrega;
  if (!ENTREGAS.includes(entrega)) erro("entrega", `deve ser ${ENTREGAS.join(", ")}`);
  const just = cfg.justificativa;
  if (just !== undefined && typeof just !== "string") erro("justificativa", "deve ser texto");
  const difere = (v, p) => Object.keys(p).some((k) => v[k] !== p[k]);
  if ((difere(legibilidade, LEGIBILIDADE) || difere(arquivo, ARQUIVO)) && !(typeof just === "string" && just.trim())) {
    erro("justificativa", "obrigatoria quando algum limite difere do padrao");
  }
  const afrouxados = Object.keys(LEGIBILIDADE).filter((k) => legibilidade[k] > LEGIBILIDADE[k]);
  if (afrouxados.length > 0 && modo !== "obrigatoria") {
    erro("revisao_por_task.modo", `afrouxar ${afrouxados.join(", ")} acima do padrao exige "obrigatoria"`);
  }
  const capacidade = { pr_arquivos: CAP_ARQUIVOS, excluido_no_painel: excluido };
  return { origem, legibilidade, arquivo, ignorar, capacidade, revisao_por_task: { modo }, entrega, justificativa: just ?? null };
}

const caminho = join(op.raiz, ".expx", "fatiamento.json");
let lido = {};
try {
  if (existsSync(caminho)) lido = JSON.parse(readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
} catch (e) {
  erro(".expx/fatiamento.json", `JSON invalido (${e.message})`);
}
const e = erros.length > 0 ? undefined : resolver(lido, existsSync(caminho) ? "projeto" : "padrao");
if (erros.length > 0 || e === undefined) {
  process.stderr.write(`${erros.join("\n")}\n`);
  process.exit(1);
}
if (op.validar) process.exit(0);

// Aspas simples quando o valor tem algo além do que o shell lê literalmente.
const shell = (v) => (/^[A-Za-z0-9_./:^=+-]*$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, "'\\''")}'`);
const env = {
  FATIA_MAX_LINHAS_PR: e.legibilidade.pr_linhas,
  FATIA_MAX_ARQUIVOS: e.legibilidade.pr_arquivos,
  FATIA_MAX_LINHAS_COMMIT: e.legibilidade.commit_linhas,
  FATIA_MAX_KB_ARQUIVO: e.arquivo.kb,
  FATIA_MAX_LINHAS_ARQUIVO: e.arquivo.linhas,
  FATIA_IGNORAR_PROJETO: e.ignorar.join("|"),
  FATIA_CAPACIDADE_ARQUIVOS: e.capacidade.pr_arquivos,
  FATIA_CAPACIDADE_EXCLUIDO: e.capacidade.excluido_no_painel.join("|"),
  EXPX_REVISAO_POR_TASK: e.revisao_por_task.modo,
  EXPX_ENTREGA: e.entrega,
  EXPX_FATIAMENTO_ORIGEM: e.origem,
};
const texto = Object.entries(env).map(([k, v]) => `${k}=${shell(v)}\n`).join("");
process.stdout.write(op.formato === "json" ? `${JSON.stringify(e, null, 2)}\n` : texto);
