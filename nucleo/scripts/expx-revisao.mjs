// Revisão por task pela CLI do CodeAnt (contrato expx-revisao), cópia do expxdev.
//   node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN> --arquivos <a,b,...> [--raiz <dir>]
// revisar: grava docs/entregas/<slug>/revisao/<T-NN>.json; sai 0 (ok), 1 (achado aberto),
// 2 (indisponivel). Uso errado: 64. O código de saída da CLI não é usado: ele é 0
// mesmo com achados (spike 6.0 do desenho); vale o JSON. Nunca lê credencial da CLI.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSAO_MINIMA = [0, 5, 14];
function uso(msg) {
  process.stderr.write(`expx-revisao: ${msg}\nuso: node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN> --arquivos <a,b,...> [--raiz <dir>]\n`);
  process.exit(64);
}
const [cmd, ...args] = process.argv.slice(2);
if (cmd !== "revisar") uso(`subcomando desconhecido: ${cmd ?? "(nenhum)"}`);
const op = { raiz: process.cwd() };
for (let i = 0; i < args.length; i += 2) {
  if (!/^--(raiz|trabalho|task|arquivos)$/.test(args[i])) uso(`argumento desconhecido: ${args[i]}`);
  if (args[i + 1] === undefined) uso(`${args[i]} exige valor`);
  op[args[i].slice(2)] = args[i + 1];
}
for (const k of ["trabalho", "task", "arquivos"]) if (!op[k]) uso(`--${k} obrigatorio`);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(op.trabalho)) uso(`trabalho invalido: ${op.trabalho}`);
if (!/^T-\d+$/.test(op.task)) uso(`task invalida: ${op.task}`);

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
  for (const m of git("diff", "-U0", "HEAD", "--", f).stdout.matchAll(/^@@ [^+]*\+(\d+)(?:,(\d+))? @@/gm)) {
    for (let n = 0; n < Number(m[2] ?? 1); n++) s.add(Number(m[1]) + n);
  }
  return s;
}

function revisar() {
  const arquivos = op.arquivos.split(",").map((f) => f.trim().replace(/\\/g, "/").replace(/^\.\//, "")).filter(Boolean);
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
      return { include, meta: j?.meta ?? null, error: j ? j.error ?? null : `json ilegivel (rc ${r.status})`, issues: j?.issues ?? [] };
    };
    let lotes = [roda(presentes)];
    const max = lotes[0].meta?.max_files;
    if (Number.isInteger(max) && max > 0 && presentes.length > max) {
      lotes = [];
      for (let i = 0; i < presentes.length; i += max) lotes.push(roda(presentes.slice(i, i + max)));
    }
    ev.lotes = lotes.map(({ include, meta, error }) => ({ include, meta, error }));
    const pulado = (s, f) => (typeof s === "string" ? s.includes(f) && !/pattern/i.test(s) : [s?.file, s?.path].includes(f) && !/pattern/i.test(s?.reason ?? ""));
    if (lotes.some((l) => l.error !== null || !l.meta)) indisponivel("erro");
    else if (lotes.some((l) => l.meta.capped || (l.meta.skipped ?? []).some((s) => l.include.some((f) => pulado(s, f))))) indisponivel("incompleta");
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

if (cmd === "revisar") revisar();
