// Revisão por task pela CLI do CodeAnt (contrato expx-revisao), cópia do expxdev.
//   node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN> --arquivos <a,b,...> [--raiz <dir>]
//   node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN>=<sha> [...]
//   node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN> --identidade <hex> --motivo <texto>
// revisar: grava docs/entregas/<slug>/revisao/<T-NN>.json; sai 0 (ok), 1 (achado aberto),
// 2 (indisponivel). conferir: 0 (ok), 1 (FALHA), 3 (só AVISO). Uso errado: 64. O código
// de saída da CLI não é usado: ele é 0 mesmo com achados (spike 6.0 do desenho); vale o
// JSON. Nunca lê credencial da CLI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSAO_MINIMA = [0, 5, 14];
const OBRIGATORIOS = { revisar: ["task", "arquivos"], conferir: ["modo", "task"], rejeitar: ["task", "identidade", "motivo"] };
function uso(msg) {
  process.stderr.write(`expx-revisao: ${msg}\nuso: node expx-revisao.mjs revisar|conferir|rejeitar --trabalho <slug> ... (cabecalho do script)\n`);
  process.exit(64);
}
const [cmd, ...args] = process.argv.slice(2);
if (!Object.hasOwn(OBRIGATORIOS, cmd ?? "")) uso(`subcomando desconhecido: ${cmd ?? "(nenhum)"}`);
const op = { raiz: process.cwd(), tasks: [] };
for (let i = 0; i < args.length; i += 2) {
  if (!/^--(raiz|trabalho|task|arquivos|modo|identidade|motivo)$/.test(args[i])) uso(`argumento desconhecido: ${args[i]}`);
  if (args[i + 1] === undefined) uso(`${args[i]} exige valor`);
  op[args[i].slice(2)] = args[i + 1];
  if (args[i] === "--task") op.tasks.push(args[i + 1]);
}
for (const k of ["trabalho", ...OBRIGATORIOS[cmd]]) if (!op[k]?.trim()) uso(`--${k} obrigatorio`);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(op.trabalho)) uso(`trabalho invalido: ${op.trabalho}`);
const TASK = cmd === "conferir" ? /^T-\d+=[^\s:]+$/ : /^T-\d+$/;
for (const t of op.tasks) if (!TASK.test(t)) uso(`task invalida: ${t}`);
if (cmd !== "conferir" && op.tasks.length > 1) uso("--task uma vez so");
if (cmd === "conferir" && !["obrigatoria", "se_disponivel", "desligada"].includes(op.modo)) uso(`modo invalido: ${op.modo}`);
if (cmd === "rejeitar" && !/^[0-9a-f]{64}$/.test(op.identidade)) uso(`identidade invalida: ${op.identidade}`);

const pasta = join(op.raiz, "docs", "entregas", op.trabalho, "revisao");
const caminhoEv = (task) => join(pasta, `${task}.json`);
const le = (f) => { try { return JSON.parse(readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return undefined; } };
const git = (...a) => spawnSync("git", a, { cwd: op.raiz, encoding: "utf8" });
const blob = (f) => { const r = git("hash-object", "--", f); return r.status === 0 ? r.stdout.trim() : undefined; };

/** A CLI. No Windows o `codeant` do npm é um `.cmd`, que só roda pelo cmd.exe. */
function codeant(a) {
  if (process.platform !== "win32") return spawnSync("codeant", a, { cwd: op.raiz, encoding: "utf8", maxBuffer: 64 << 20 });
  const linha = ["codeant", ...a].map((x) => `"${x}"`).join(" ");
  return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${linha}"`], { cwd: op.raiz, encoding: "utf8",
    maxBuffer: 64 << 20, windowsVerbatimArguments: true, env: { ...process.env, NoDefaultCurrentDirectoryInExePath: "1" } });
}
/** O JSON da CLI: do primeiro `{` que dá JSON até o último `}` (o npm pode avisar antes e depois). */
function json(texto) {
  for (let i = texto.indexOf("{"); i >= 0; i = texto.indexOf("{", i + 1)) try { return JSON.parse(texto.slice(i, texto.lastIndexOf("}") + 1)); } catch { /* próximo */ }
}
/** Linhas que a task alterou em `f` (Set) ou `true` (arquivo novo: todas). */
function alteradas(f) {
  if (git("ls-files", "--error-unmatch", "--", f).status !== 0) return true;
  const s = new Set();
  const d = git("diff", "-U0", "HEAD", "--", f);
  if (d.status !== 0) return true; // sem HEAD (ou diff que falha): tudo conta, nunca menos
  for (const m of d.stdout.matchAll(/^@@ [^+]*\+(\d+)(?:,(\d+))? @@/gm)) {
    for (let n = 0; n < Number(m[2] ?? 1); n++) s.add(Number(m[1]) + n);
  }
  return s;
}

function revisar() {
  const arquivos = op.arquivos.split(",").map((f) => f.trim().replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
  if (arquivos.length === 0) uso("--arquivos sem nenhum caminho");
  const anterior = le(caminhoEv(op.task));
  const ev = { expx_revisao: 1, trabalho: op.trabalho, task: op.task, cli: { versao: null }, executada_em: new Date().toISOString(),
    arquivos: {}, lotes: [], resultado: "ok", achados: [], rejeicoes: Array.isArray(anterior?.rejeicoes) ? anterior.rejeicoes : [], removidos_sem_revisao: [] };
  const indisponivel = (motivo) => Object.assign(ev, { resultado: "indisponivel", motivo });
  const head = new Set(git("ls-tree", "-r", "-z", "--name-only", "HEAD").stdout.split("\0"));
  const existe = (f) => head.has(f) || existsSync(join(op.raiz, f));
  // `--arquivos` e o `--include` da CLI separam por vírgula: um caminho com vírgula
  // chegaria partido, e cada pedaço seria revisado (ou dado por removido) sozinho
  const virgula = arquivos.some((_, i) => arquivos.slice(i + 1).some((__, j) => existe(arquivos.slice(i, i + j + 2).join(","))));
  const presentes = arquivos.filter((f) => existsSync(join(op.raiz, f)));
  const removidos = arquivos.filter((f) => !presentes.includes(f));
  for (const f of removidos) { ev.arquivos[f] = null; ev.removidos_sem_revisao.push(f); }
  for (const f of presentes) ev.arquivos[f] = blob(f) ?? null;
  const ver = codeant(["--version"]);
  const v = /(\d+)\.(\d+)\.(\d+)/.exec(ver.stdout ?? "");
  const cmp = v ? v.slice(1).map(Number).map((n, i) => n - VERSAO_MINIMA[i]).find((d) => d !== 0) ?? 0 : -1;
  if (v) ev.cli.versao = v.slice(1).join(".");
  if (virgula) indisponivel("caminho-com-virgula");
  else if (removidos.some((f) => !existe(f))) indisponivel(`arquivo-inexistente:${removidos.find((f) => !existe(f))}`);
  else if (ver.error || [127, 9009].includes(ver.status) || (ver.status !== 0 && !v)) indisponivel("cli-ausente");
  else if (cmp < 0) indisponivel("versao");
  else if (presentes.length > 0) {
    const roda = (include) => {
      const r = codeant(["review", "--uncommitted", "--headless", "--include", include.join(",")]);
      const j = json(r.stdout ?? "");
      return { include, meta: j?.meta ?? null, error: j ? j.error ?? null : `json ilegivel (rc ${r.status})`, issues: j?.issues ?? [], noFiles: j?.noFiles === true };
    };
    let lotes = [roda(presentes)];
    const max = lotes[0].meta?.max_files;
    if (Number.isInteger(max) && max > 0 && presentes.length > max) {
      lotes = [];
      for (let i = 0; i < presentes.length; i += max) lotes.push(roda(presentes.slice(i, i + max)));
    }
    ev.lotes = lotes.map(({ include, meta, error }) => ({ include, meta, error }));
    const cita = (s, f) => (typeof s === "string" ? s.includes(f) : [s?.file, s?.path].includes(f));
    const porPadrao = (s) => /pattern/i.test(typeof s === "string" ? s : String(s?.reason ?? ""));
    // incompleta: cortada, arquivo da task pulado sem ser por padrão, ou menos revisados que pedidos
    const incompleta = ({ include, meta, noFiles }) => {
      const sk = Array.isArray(meta.skipped) ? meta.skipped : [];
      if (meta.capped || sk.some((s) => !porPadrao(s) && include.some((f) => cita(s, f)))) return true;
      const pedidos = include.filter((f) => !sk.some((s) => porPadrao(s) && cita(s, f))).length;
      const revistos = noFiles ? 0 : Array.isArray(meta.reviewed_files) ? meta.reviewed_files.length : Number(meta.reviewed_files);
      return !(revistos >= pedidos);
    };
    if (lotes.some((l) => l.error !== null || !l.meta)) indisponivel("erro");
    else if (lotes.some(incompleta)) indisponivel("incompleta");
    else if (presentes.some((f) => blob(f) !== ev.arquivos[f])) indisponivel("arquivo-mudou-durante-revisao");
    else achados(lotes.flatMap((l) => l.issues), ev);
  }
  mkdirSync(pasta, { recursive: true });
  writeFileSync(caminhoEv(op.task), `${JSON.stringify(ev, null, 2)}\n`);
  const abertos = ev.achados.filter((a) => a.estado === "aberto").length;
  process.stdout.write(`${op.task} ${ev.resultado === "indisponivel" ? `indisponivel:${ev.motivo}` : `${ev.resultado} (${abertos} abertos, ${ev.achados.length} achados)`}\n`);
  process.exit(ev.resultado === "indisponivel" ? 2 : abertos > 0 ? 1 : 0);
}

/** Classifica os achados: rejeitado (por esta ou outra task do trabalho), aberto (linha alterada) ou anterior. */
function achados(issues, ev) {
  const rejeitadas = new Set(ev.rejeicoes.map((r) => r.identidade));
  for (const n of existsSync(pasta) ? readdirSync(pasta) : []) {
    for (const r of n.endsWith(".json") ? le(join(pasta, n))?.rejeicoes ?? [] : []) rejeitadas.add(r?.identidade);
  }
  const cache = {};
  for (const i of issues) {
    const arquivo = String(i.relevant_file ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
    const linha = Number(i.start_line);
    const c = (cache[arquivo] ??= { alt: arquivo in ev.arquivos ? alteradas(arquivo) : new Set(),
      linhas: existsSync(join(op.raiz, arquivo)) ? readFileSync(join(op.raiz, arquivo), "utf8").split(/\r?\n/) : [] });
    const viz = [linha - 2, linha - 1, linha].map((k) => (c.linhas[k] ?? "").trim());
    const label = String(i.label ?? "");
    const identidade = createHash("sha256").update([label, arquivo, ...viz, ev.cli.versao].join("\0")).digest("hex");
    const estado = rejeitadas.has(identidade) ? "rejeitado" : c.alt === true || c.alt.has(linha) ? "aberto" : "anterior";
    ev.achados.push({ identidade, arquivo, linha, label, texto: String(i.issue_content ?? ""), estado });
  }
  if (ev.achados.some((a) => a.estado === "aberto")) ev.resultado = "achados";
}

/** O veredito de uma task: a evidência tem de existir, bater com o commit e não ter achado aberto. */
function veredito(task, sha) {
  if (op.modo === "desligada") return "ok";
  const nivel = op.modo === "obrigatoria" ? "FALHA" : "AVISO";
  const ev = le(caminhoEv(task));
  if (ev === undefined) return `${nivel} evidencia-ausente`;
  if (ev.expx_revisao !== 1 || ev.task !== task || ev.trabalho !== op.trabalho || typeof ev.arquivos !== "object"
    || !["ok", "achados", "indisponivel"].includes(ev.resultado)) return "FALHA evidencia-invalida";
  if (git("rev-parse", "--verify", "-q", `${sha}^{commit}`).status !== 0) return `FALHA commit-inexistente:${sha}`;
  for (const [f, b] of Object.entries(ev.arquivos ?? {})) {
    const r = git("rev-parse", "--verify", "-q", `${sha}:${f}`);
    if ((r.status === 0 ? r.stdout.trim() : null) !== b) return `FALHA evidencia-nao-bate:${f}`;
  }
  if (ev.resultado === "indisponivel") return `${nivel} indisponivel:${ev.motivo}`;
  const abertos = (ev.achados ?? []).filter((a) => a.estado === "aberto").length;
  return abertos > 0 ? `FALHA achados-abertos:${abertos}` : "ok";
}

function conferir() {
  const linhas = op.tasks.map((p) => { const [task, sha] = p.split("="); return `${task} ${veredito(task, sha)}`; });
  process.stdout.write(`${linhas.join("\n")}\n`);
  process.exit(linhas.some((l) => l.includes(" FALHA ")) ? 1 : linhas.some((l) => l.includes(" AVISO ")) ? 3 : 0);
}

function rejeitar() {
  const ev = le(caminhoEv(op.task));
  const alvo = (ev?.achados ?? []).filter((a) => a.identidade === op.identidade);
  if (alvo.length === 0) {
    process.stderr.write(`expx-revisao: ${ev ? "achado nao encontrado" : "evidencia ausente"}: ${op.task} ${op.identidade}\n`);
    process.exit(1);
  }
  for (const a of alvo) a.estado = "rejeitado";
  ev.rejeicoes = [...(Array.isArray(ev.rejeicoes) ? ev.rejeicoes : []), { identidade: op.identidade, motivo: op.motivo, em: new Date().toISOString() }];
  if (ev.resultado !== "indisponivel") ev.resultado = ev.achados.some((a) => a.estado === "aberto") ? "achados" : "ok";
  writeFileSync(caminhoEv(op.task), `${JSON.stringify(ev, null, 2)}\n`);
  process.stdout.write(`${op.task} ${ev.resultado === "indisponivel" ? `indisponivel:${ev.motivo}` : ev.resultado}\n`);
}

({ revisar, conferir, rejeitar })[cmd]();
