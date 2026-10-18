// Revisão por task pela CLI do CodeAnt (contrato expx-revisao), cópia do expxdev.
//   node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN.MM> --arquivos <a,b,...> [--raiz <dir>]
//   node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN.MM>=<sha> [...]
//   node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN.MM> --identidade <hex> --motivo <texto>
// revisar: grava docs/entregas/<slug>/revisao/<T-NN.MM>.json; sai 0 (ok), 1 (achado aberto),
// 2 (indisponivel). conferir: 0 (ok), 1 (FALHA), 3 (só AVISO). Uso errado: 64. O código
// de saída da CLI não é usado: ele é 0 mesmo com achados (spike 6.0 do desenho); vale o
// JSON. Nunca lê credencial da CLI. EXPX_REVISAO_TESTE_PAUSA é só para teste: um diretório
// em que o `revisar` cria `pronto` e espera `continuar` entre a releitura e a gravação.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
// id `T-NN.MM` da sprintx/runx (sprint.task) ou o legado `T-<dígitos>` (como antes); vira nome de arquivo, então nada além disso
const TASK = cmd === "conferir" ? /^T-(\d+|\d{2}\.\d{2})=[^\s:]+$/ : /^T-(\d+|\d{2}\.\d{2})$/;
for (const t of op.tasks) if (!TASK.test(t)) uso(`task invalida: ${t}`);
if (cmd !== "conferir" && op.tasks.length > 1) uso("--task uma vez so");
if (cmd === "conferir" && !["obrigatoria", "se_disponivel", "desligada"].includes(op.modo)) uso(`modo invalido: ${op.modo}`);
if (cmd === "rejeitar" && !/^[0-9a-f]{64}$/.test(op.identidade)) uso(`identidade invalida: ${op.identidade}`);

const pasta = join(op.raiz, "docs", "entregas", op.trabalho, "revisao");
const caminhoEv = (task) => join(pasta, `${task}.json`);
const le = (f) => { try { return JSON.parse(readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return undefined; } };
const git = (...a) => spawnSync("git", a, { cwd: op.raiz, encoding: "utf8" });
const blob = (f) => { const r = git("hash-object", "--", f); return r.status === 0 ? r.stdout.trim() : undefined; };

const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** Trava por evidência (`mkdir` é exclusivo): quem relê e regrava a evidência o faz dentro dela. */
function comTrava(task, fn) {
  mkdirSync(pasta, { recursive: true });
  const trava = `${caminhoEv(task)}.trava`;
  for (const ate = Date.now() + 30000; ; pausa(50)) {
    try { mkdirSync(trava); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // trava de processo que morreu: mais velha que 2 min é abandonada
      try { if (Date.now() - statSync(trava).mtimeMs > 120000) rmSync(trava, { recursive: true, force: true }); } catch { /* sumiu */ }
      if (Date.now() > ate) { process.stderr.write(`expx-revisao: evidencia travada por outro processo: ${trava}\n`); process.exit(75); }
    }
  }
  try { return fn(); } finally { rmSync(trava, { recursive: true, force: true }); }
}
// Só para teste (cabeçalho): nada do ambiente é executado; valor que não é diretório é ignorado.
function pausaDeTeste() {
  const dir = process.env.EXPX_REVISAO_TESTE_PAUSA;
  if (!dir || !statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;
  writeFileSync(join(dir, "pronto"), "");
  for (const ate = Date.now() + 10000; Date.now() < ate && !existsSync(join(dir, "continuar"));) pausa(50);
}
/** Grava por arquivo temporário + rename: ninguém lê evidência pela metade. */
function grava(task, ev) {
  const tmp = `${caminhoEv(task)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ev, null, 2)}\n`);
  renameSync(tmp, caminhoEv(task));
}
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
  // rejeição gravada (rejeitar) enquanto a CLI rodava não se perde: releitura e gravação sob a trava
  const abertos = comTrava(op.task, () => {
    const agora = le(caminhoEv(op.task))?.rejeicoes;
    pausaDeTeste();
    for (const r of Array.isArray(agora) ? agora : []) {
      if (!ev.rejeicoes.some((x) => x?.identidade === r?.identidade)) ev.rejeicoes.push(r);
      for (const a of ev.achados) if (a.identidade === r?.identidade) a.estado = "rejeitado";
    }
    if (ev.resultado === "achados" && !ev.achados.some((a) => a.estado === "aberto")) ev.resultado = "ok";
    grava(op.task, ev);
    return ev.achados.filter((a) => a.estado === "aberto").length;
  });
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

const ehMapa = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** Em `ok`/`achados`, o campo que falta para provar que a CLI rodou (ou undefined): versão ≥ mínima,
 *  `executada_em` ISO 8601 e, se há arquivo presente, lotes com `meta` e sem erro que o incluem. */
function semSinalDaCli(ev) {
  const v = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(typeof ev.cli?.versao === "string" ? ev.cli.versao : "");
  if (!v || (v.slice(1).map(Number).map((n, i) => n - VERSAO_MINIMA[i]).find((d) => d !== 0) ?? 0) < 0) return "cli.versao";
  const iso = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/
    .exec(typeof ev.executada_em === "string" ? ev.executada_em : "");
  // o Date normaliza 30/02 para 02/03: a data tem de voltar igual
  const dia = iso && new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (!iso || dia.getUTCMonth() !== Number(iso[2]) - 1 || dia.getUTCDate() !== Number(iso[3])) return "executada_em";
  const presentes = Object.keys(ev.arquivos).filter((f) => ev.arquivos[f] !== null);
  if (!Array.isArray(ev.lotes) || (presentes.length > 0 && ev.lotes.length === 0)
    || !ev.lotes.every((l) => ehMapa(l) && ehMapa(l.meta) && Array.isArray(l.include) && l.error === null)
    || !presentes.every((f) => ev.lotes.some((l) => l.include.includes(f)))) return "lotes";
}

/** O veredito de uma task: a evidência tem de existir, bater com o commit e não ter achado aberto. */
function veredito(task, sha) {
  if (op.modo === "desligada") return "ok";
  const nivel = op.modo === "obrigatoria" ? "FALHA" : "AVISO";
  if (git("rev-parse", "--verify", "-q", `${sha}^{commit}`).status !== 0) return `FALHA commit-inexistente:${sha}`;
  // a evidência que vale é a do commit da task (o E1 a commita junto), nunca a do disco
  const doCommit = git("show", `${sha}:./docs/entregas/${op.trabalho}/revisao/${task}.json`);
  if (doCommit.status !== 0) return `${nivel} evidencia-ausente`;
  let ev;
  try { ev = JSON.parse(doCommit.stdout.replace(/^\uFEFF/, "")); } catch { return "FALHA evidencia-invalida"; }
  if (!ehMapa(ev) || ev.expx_revisao !== 1 || ev.task !== task || ev.trabalho !== op.trabalho || !ehMapa(ev.arquivos)
    || Object.keys(ev.arquivos).length === 0 || !Array.isArray(ev.achados)
    || !ev.achados.every((a) => ehMapa(a) && /^[0-9a-f]{64}$/.test(a.identidade) && ["aberto", "anterior", "rejeitado"].includes(a.estado))
    || !["ok", "achados", "indisponivel"].includes(ev.resultado)) return "FALHA evidencia-invalida";
  const falta = ev.resultado === "indisponivel" ? undefined : semSinalDaCli(ev);
  if (falta) return `FALHA evidencia-invalida:${falta}`;
  for (const [f, b] of Object.entries(ev.arquivos)) {
    const r = git("rev-parse", "--verify", "-q", `${sha}:./${f}`);
    if ((r.status === 0 ? r.stdout.trim() : null) !== b) return `FALHA evidencia-nao-bate:${f}`;
  }
  if (ev.resultado === "indisponivel") return `${nivel} indisponivel:${ev.motivo}`;
  const abertos = ev.achados.filter((a) => a?.estado === "aberto").length;
  return abertos > 0 || ev.resultado === "achados" ? `FALHA achados-abertos:${abertos}` : "ok";
}

function conferir() {
  const linhas = op.tasks.map((p) => { const [task, sha] = p.split("="); return `${task} ${veredito(task, sha)}`; });
  process.stdout.write(`${linhas.join("\n")}\n`);
  process.exit(linhas.some((l) => l.includes(" FALHA ")) ? 1 : linhas.some((l) => l.includes(" AVISO ")) ? 3 : 0);
}

function rejeitar() {
  const erro = comTrava(op.task, () => {
    const ev = le(caminhoEv(op.task));
    const alvo = (ev?.achados ?? []).filter((a) => a.identidade === op.identidade);
    if (alvo.length === 0) return ev ? "achado nao encontrado" : "evidencia ausente";
    for (const a of alvo) a.estado = "rejeitado";
    ev.rejeicoes = [...(Array.isArray(ev.rejeicoes) ? ev.rejeicoes : []), { identidade: op.identidade, motivo: op.motivo, em: new Date().toISOString() }];
    if (ev.resultado !== "indisponivel") ev.resultado = ev.achados.some((a) => a.estado === "aberto") ? "achados" : "ok";
    grava(op.task, ev);
    process.stdout.write(`${op.task} ${ev.resultado === "indisponivel" ? `indisponivel:${ev.motivo}` : ev.resultado}\n`);
    return undefined;
  });
  if (erro) {
    process.stderr.write(`expx-revisao: ${erro}: ${op.task} ${op.identidade}\n`);
    process.exit(1);
  }
}

({ revisar, conferir, rejeitar })[cmd]();
