// Leitor único de `.expx/fatiamento.json` (contrato expx-instalacao §5.2), cópia do expxdev.
//   node expx-fatiamento.mjs [--raiz <dir>] [--formato env|json] [--validar]
// Sem arquivo: os padrões. Inválido: sai 1, uma linha `expx-fatiamento: <chave>:
// <motivo>` por erro no stderr, nada no stdout — nunca os padrões. Uso errado: 2.
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ehRaizDeCodigo, fatiaNoAmbiente, limites as limitesFixos, mensagemFatia, prefixoDe } from "./expx-limites.mjs";

const MODOS = ["obrigatoria", "se_disponivel", "desligada"];
const ENTREGAS = ["por_trabalho", "por_sprint"];
const VERSAO = 2;
const CHAVES = ["expx_fatiamento", "revisao_por_task", "entrega", "merge_automatico", "revisor_bot", "excluir_da_revisao"];
// Os limites são os do CodeAnt, fixos (emenda de 2026-10-19): a chave removida tem mensagem
// própria, nunca a "chave desconhecida" genérica, e nunca é ignorada.
const REMOVIDA = "removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a";
const REMOVIDAS = {
  legibilidade: REMOVIDA, arquivo: REMOVIDA, justificativa: REMOVIDA, capacidade: REMOVIDA,
  ignorar: "substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato",
};
// Login do bot revisor de PR: o do GitHub (alfanumérico e hífen), com `[bot]` só no fim.
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]*(\[bot\])?$/;
// Caminhos que nunca entram em merge automático (E9 da mergex). O projeto soma; nunca substitui.
// Cada item e o porquê estão no contrato expx-instalacao §5.2.
const PROTEGIDOS_PADRAO = [
  "(^|/)auth/", "(^|/)autenticacao/", "(^|/)login/", // autenticação
  "(^|/)(permiss|rls|polic(y|ies))", // permissões e RLS
  "(^|/)(migrations?|migracoes?|migrate)/", "\\.sql$", // migrations e SQL de banco
  "^\\.github/", "^(infra|deploy|terraform|k8s|docker)/", "(^|/)Dockerfile$", // CI e infraestrutura
  "(^|/)\\.env", "(^|/)secrets?/", // configuração de segredos
];

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

/**
 * O que o `new RegExp` aceita e o ERE do Git Bash e do macOS recusa: o `[[ =~ ]]` do merge
 * automático (E9 da mergex) sai com 2 e o caminho protegido não protege nada. Só vale para
 * `caminhos_protegidos`: `excluir_da_revisao` é pasta literal (`expx-limites.mjs`). Na dúvida entre
 * o glibc e o Git Bash/macOS, vale o mais estrito. Não olha o escapado nem o que está em classe
 * (no ERE, `\` dentro de `[...]` é literal). Devolve o motivo, ou `null`.
 */
function foraDoEre(p) {
  let quant = false;
  let ramo = "inicio"; // inicio: começo ou depois de `(`; alt: depois de `|`; cheio: ramo com conteúdo
  let ancora = false; // o último token foi `^`
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "|" || c === ")") {
      if (ramo === "alt" || (c === "|" && ramo === "inicio")) return "alternativa vazia (a|, |a, (|a), a||b)";
      ramo = c === "|" ? "alt" : "cheio"; quant = ancora = false; continue;
    }
    if (c === "(") {
      // `(?…)` só existe no JavaScript; `\(?` (parêntese escapado e opcional) é ERE válido
      if (p[i + 1] === "?") return "grupo (?...) do JavaScript";
      ramo = "inicio"; quant = ancora = false; continue;
    }
    // `{` sem operando (no começo, depois de `(`, `|` ou `^`) é recusado, mesmo sendo literal no JavaScript
    if (c === "{" && (ramo !== "cheio" || ancora)) return CHAVE;
    ramo = "cheio";
    ancora = c === "^";
    if (c === "\\") {
      // `\d`, `\w`, `\1` só existem no JavaScript; em classe (`[\w]`) a barra é literal e não chega aqui
      if (/[A-Za-z0-9]/.test(p[i + 1] ?? "")) return "escape do JavaScript (\\d, \\w, \\1)";
      i++; quant = false; continue;
    }
    if (c === "[") {
      let j = i + 1;
      if (p[j] === "^") j++;
      if (p[j] === "]") j++;
      for (; j < p.length && p[j] !== "]"; j++) {
        // em classe, `[:`, `[.` e `[=` só abrem uma das 12 classes POSIX ou um elemento de um caractere
        // (`[:alpha:]`, `[.a.]`, `[=a=]`); o resto o Git Bash e o glibc recusam. Busca de tamanho fixo: linear
        if (p[j] !== "[" || !":.=".includes(p[j + 1] ?? "x")) continue;
        ELEMENTO.lastIndex = j;
        const el = ELEMENTO.exec(p);
        if (!el) return "classe POSIX ou elemento de colacao invalido ([[:alpha:]], [[.a.]], [[=a=]])";
        j += el[0].length - 1;
      }
      // `[[:alpha:]`: no JavaScript o `]` do elemento fecha a classe; no ERE ela fica aberta
      if (j >= p.length) return "classe sem ] de fechamento";
      i = j; quant = false; continue;
    }
    if (c === "*" || c === "+" || c === "?" || c === "{") {
      if (quant) return REPETIDO;
      quant = true;
      if (c === "{") {
        // no ERE, `{` abre intervalo: o que não fecha `{n}`, `{n,}` ou `{n,m}` (n <= m <= 255) é recusado
        const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
        if (!m) return CHAVE;
        const n = Number(m[1]), aberto = m[2] !== undefined && m[3] === "";
        const max = aberto || m[2] === undefined ? n : Number(m[3]);
        // `{0}` e `{0,0}`: o Git Bash e o macOS recusam ("empty (sub)expression")
        if (n > 255 || max > 255 || max < n || (!aberto && max === 0)) return CHAVE;
        i += m[0].length - 1;
      }
      continue;
    }
    quant = false;
  }
  return ramo === "alt" ? "alternativa vazia (a|, |a, (|a), a||b)" : null;
}
const REPETIDO = "quantificador repetido (a+?, a*+, x{2}?)";
const ELEMENTO = /\[(?::(?:alnum|alpha|blank|cntrl|digit|graph|lower|print|punct|space|upper|xdigit):|\.[^]\.|=[^]=)\]/y;
const CHAVE = "chave que nao forma intervalo ({, a{, a{1, a{,3}, a{0}, a{256})";

function regexes(v, nome) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return erro(nome, "deve ser uma lista de expressoes regulares"), [];
  v.forEach((p, i) => {
    if (typeof p !== "string" || p === "") return erro(`${nome}[${i}]`, "deve ser texto nao vazio");
    // quem aplica é o bash do merge automático (`[[ =~ ]]`, ERE): o que só existe no JavaScript, ou que o Git Bash recusa, fica com `foraDoEre`
    const motivo = foraDoEre(p);
    if (motivo) return erro(`${nome}[${i}]`, `${motivo}, que o ERE do bash recusa`);
    try { new RegExp(p); } catch (e) { erro(`${nome}[${i}]`, `expressao regular invalida (${e.message})`); }
  });
  return v;
}

/** Logins exatos, sem duplicata: a duplicata é erro, não se deduplica em silêncio. */
function logins(v, nome) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return erro(nome, "deve ser uma lista de logins"), [];
  const primeiro = new Map(); // login → índice da primeira vez: tempo linear mesmo em lista longa
  v.forEach((l, i) => {
    if (typeof l !== "string" || !LOGIN.test(l)) erro(`${nome}[${i}]`, "deve ser login (letras, digitos e hifen, [bot] so no fim)");
    else if (primeiro.has(l)) erro(`${nome}[${i}]`, `deve aparecer uma vez (repete o item ${primeiro.get(l)})`);
    else primeiro.set(l, i);
  });
  return v;
}

const CAMPOS = ["padrao", "classe", "origem", "motivo"];
const CLASSES = ["gerado", "copia"];

/**
 * Exclusões da revisão (emenda de 2026-10-19, §5): só classes de artefato, cada uma uma pasta
 * literal, nunca raiz de código. Somam às do núcleo, que não se declaram.
 */
function exclusoes(v, nome) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return erro(nome, "deve ser uma lista de objetos {padrao, classe, origem, motivo}"), [];
  const primeiro = new Map(); // padrão → índice da primeira vez
  v.forEach((item, i) => {
    const k = `${nome}[${i}]`;
    if (!ehObjeto(item)) return erro(k, "deve ser um objeto {padrao, classe, origem, motivo}");
    for (const c of Object.keys(item)) if (!CAMPOS.includes(c)) erro(`${k}.${c}`, "chave desconhecida");
    for (const c of CAMPOS) if (!Object.hasOwn(item, c)) erro(`${k}.${c}`, "obrigatória");
    const p = item.padrao;
    if (p !== undefined) {
      if (typeof p !== "string" || prefixoDe(p) === null) erro(`${k}.padrao`, "deve ser pasta literal: ^, segmentos terminados em /, sem metacaractere de regex (o ponto só escapado)");
      else if (ehRaizDeCodigo(p)) erro(`${k}.padrao`, "é raiz de código-fonte; só pasta de fixtures, snapshots, __snapshots__, generated ou gerado dentro dela");
      else if (primeiro.has(p)) erro(`${k}.padrao`, `deve aparecer uma vez (repete o item ${primeiro.get(p)})`);
      else primeiro.set(p, i);
    }
    if (item.classe !== undefined && !CLASSES.includes(item.classe)) erro(`${k}.classe`, `deve ser ${CLASSES.join(", ")}`);
    for (const c of ["origem", "motivo"]) {
      if (item[c] !== undefined && (typeof item[c] !== "string" || item[c].trim() === "")) erro(`${k}.${c}`, "deve ser texto não vazio");
    }
  });
  return v;
}

function resolver(cfg, origem) {
  if (!ehObjeto(cfg)) return erro(".expx/fatiamento.json", "deve ser um objeto JSON"), undefined;
  if (origem === "projeto") {
    // versão 1: a migração vem primeiro, seguida de uma linha por chave removida que o arquivo ainda tem
    if (cfg.expx_fatiamento === 1) erro("expx_fatiamento", `versão 1: migre para ${VERSAO} (emenda de 2026-10-19)`);
    else if (cfg.expx_fatiamento !== VERSAO) erro("expx_fatiamento", `versão desconhecida (esperada ${VERSAO})`);
    for (const k of Object.keys(cfg)) {
      if (Object.hasOwn(REMOVIDAS, k)) erro(k, REMOVIDAS[k]);
      else if (!CHAVES.includes(k)) erro(k, "chave desconhecida");
    }
  }
  const r = bloco(cfg, "revisao_por_task", ["modo"]);
  const modo = r.modo === undefined ? "se_disponivel" : r.modo;
  if (!MODOS.includes(modo)) erro("revisao_por_task.modo", `deve ser ${MODOS.join(", ")}`);
  const entrega = cfg.entrega === undefined ? "por_trabalho" : cfg.entrega;
  if (!ENTREGAS.includes(entrega)) erro("entrega", `deve ser ${ENTREGAS.join(", ")}`);
  // independente de revisao_por_task: quem decide cada merge são as condições do E9
  const m = bloco(cfg, "merge_automatico", ["ativo", "caminhos_protegidos"]);
  if (m.ativo !== undefined && typeof m.ativo !== "boolean") erro("merge_automatico.ativo", "deve ser true ou false");
  const protegidos = regexes(m.caminhos_protegidos, "merge_automatico.caminhos_protegidos") ?? [];
  const merge = { ativo: m.ativo === true, caminhos_protegidos: [...new Set([...PROTEGIDOS_PADRAO, ...protegidos])] };
  // independente de merge_automatico: o E9 da mergex reconhece a revisão do bot no PR redirecionado
  const revisor = logins(cfg.revisor_bot, "revisor_bot");
  const excluir = exclusoes(cfg.excluir_da_revisao, "excluir_da_revisao");
  return { origem, revisao_por_task: { modo }, entrega, merge_automatico: merge, revisor_bot: revisor,
    excluir_da_revisao: excluir, limites: limitesFixos() };
}

// `FATIA_*` são reservados para sempre: falham antes do arquivo, com ou sem ele, também no --validar
for (const nome of fatiaNoAmbiente(process.env)) erros.push(`expx-fatiamento: ${mensagemFatia(nome)}`);
const caminho = join(op.raiz, ".expx", "fatiamento.json");
// presente = qualquer entrada (link quebrado, diretório): ilegível é inválido, nunca os padrões
const presente = (() => { try { return lstatSync(caminho), true; } catch (e) { return e.code !== "ENOENT"; } })();
let lido = {};
let legivel = true;
try {
  if (presente) lido = JSON.parse(readFileSync(caminho, "utf8").replace(/^\uFEFF/, ""));
} catch (e) {
  legivel = false;
  erro(".expx/fatiamento.json", `ilegivel ou JSON invalido (${e.message})`);
}
const e = !legivel ? undefined : resolver(lido, presente ? "projeto" : "padrao");
if (erros.length > 0 || e === undefined) {
  process.stderr.write(`${erros.join("\n")}\n`);
  process.exit(1);
}
if (op.validar) process.exit(0);

// Aspas simples quando o valor tem algo além do que o shell lê literalmente.
const shell = (v) => (/^[A-Za-z0-9_./:@^=+-]*$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, "'\\''")}'`);
// nenhuma `FATIA_*`: nenhum limite nem exclusão vem do ambiente (emenda de 2026-10-19)
const env = {
  EXPX_REVISAO_POR_TASK: e.revisao_por_task.modo,
  EXPX_ENTREGA: e.entrega,
  EXPX_MERGE_AUTOMATICO: e.merge_automatico.ativo ? "sim" : "nao",
  EXPX_CAMINHOS_PROTEGIDOS: e.merge_automatico.caminhos_protegidos.join("|"),
  EXPX_REVISOR_BOT: e.revisor_bot.join(","), // vírgula: login não tem vírgula
  EXPX_EXCLUIR_DA_REVISAO: e.excluir_da_revisao.map((x) => x.padrao).join("|"), // só as do projeto; | não é de pasta literal
  EXPX_FATIAMENTO_ORIGEM: e.origem,
  EXPX_PERFIL_CLI: e.limites.perfil_cli,
  EXPX_L1_ARQUIVOS: e.limites.l1_arquivos,
  EXPX_L2_LINHAS: e.limites.l2_linhas,
  EXPX_L2_BYTES: e.limites.l2_bytes,
  EXPX_L3_ARQUIVOS: e.limites.l3_arquivos,
};
const texto = Object.entries(env).map(([k, v]) => `${k}=${shell(v)}\n`).join("");
process.stdout.write(op.formato === "json" ? `${JSON.stringify(e, null, 2)}\n` : texto);
