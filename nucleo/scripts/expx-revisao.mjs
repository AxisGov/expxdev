// Revisão por task pela CLI do CodeAnt (contrato expx-revisao), cópia do expxdev.
//   node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN.MM> --arquivos <a,b,...> [--base-commit <sha>] [--raiz <dir>]
//   node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN.MM>=<sha> [...]
//   node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN.MM> --identidade <hex> --motivo <texto>
// revisar: grava docs/entregas/<slug>/revisao/<T-NN.MM>.json (evidência v2); sai 0 (ok), 1 (achado aberto),
// 2 (indisponivel), 3 (incompleta). conferir: 0 (ok), 1 (FALHA), 3 (só AVISO). Uso errado, inclusive
// `FATIA_*` no ambiente: 64. Uma chamada só da CLI (sem lotes), pelo arquivo do pacote conferido; a
// resposta é reconciliada com a task (contrato expx-revisao v2). Nunca lê credencial da CLI.
// EXPX_REVISAO_TESTE_PAUSA é só para teste: um diretório em que o `revisar` cria `pronto` e espera
// `continuar` entre a releitura e a gravação.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { conferirIntegridade, excluido, EXCLUIDOS_DO_NUCLEO, fatiaNoAmbiente, homologadas, localizarPacote, medir, mensagemFatia,
  motivoAceito, perfilCli, revisavel } from "./expx-limites.mjs";

const OBRIGATORIOS = { revisar: ["task", "arquivos"], conferir: ["modo", "task"], rejeitar: ["task", "identidade", "motivo"] };
function uso(msg) {
  process.stderr.write(`expx-revisao: ${msg}\nuso: node expx-revisao.mjs revisar|conferir|rejeitar --trabalho <slug> ... (cabecalho do script)\n`);
  process.exit(64);
}
const [cmd, ...args] = process.argv.slice(2);
// `FATIA_*` são reservados para sempre (emenda de 2026-10-19): nenhum limite nem exclusão vem do ambiente
const fatia = fatiaNoAmbiente(process.env);
if (fatia.length > 0) {
  process.stderr.write(fatia.map((n) => `expx-revisao: ${mensagemFatia(n)}\n`).join(""));
  process.exit(64);
}
if (!Object.hasOwn(OBRIGATORIOS, cmd ?? "")) uso(`subcomando desconhecido: ${cmd ?? "(nenhum)"}`);
const op = { raiz: process.cwd(), tasks: [] };
for (let i = 0; i < args.length; i += 2) {
  if (!/^--(raiz|trabalho|task|arquivos|modo|identidade|motivo|base-commit)$/.test(args[i])) uso(`argumento desconhecido: ${args[i]}`);
  if (args[i + 1] === undefined) uso(`${args[i]} exige valor`);
  op[args[i].slice(2)] = args[i + 1];
  if (args[i] === "--task") op.tasks.push(args[i + 1]);
}
// `--arquivos` não é aparado: espaço é parte do nome
for (const k of ["trabalho", ...OBRIGATORIOS[cmd]]) if (!(k === "arquivos" ? op[k] : op[k]?.trim())) uso(`--${k} obrigatorio`);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(op.trabalho)) uso(`trabalho invalido: ${op.trabalho}`);
// id `T-NN.MM` da sprintx/runx (sprint.task) ou o legado `T-<dígitos>` (como antes); vira nome de arquivo, então nada além disso
const TASK = cmd === "conferir" ? /^T-(\d+|\d{2}\.\d{2})=[^\s:]+$/ : /^T-(\d+|\d{2}\.\d{2})$/;
for (const t of op.tasks) if (!TASK.test(t)) uso(`task invalida: ${t}`);
if (cmd !== "conferir" && op.tasks.length > 1) uso("--task uma vez so");
if (cmd === "conferir" && !["obrigatoria", "se_disponivel", "desligada"].includes(op.modo)) uso(`modo invalido: ${op.modo}`);
if (cmd === "rejeitar" && !/^[0-9a-f]{64}$/.test(op.identidade)) uso(`identidade invalida: ${op.identidade}`);
if (op["base-commit"] !== undefined && cmd !== "revisar") uso("--base-commit so no revisar");

const pasta = join(op.raiz, "docs", "entregas", op.trabalho, "revisao");
const caminhoEv = (task) => join(pasta, `${task}.json`);
const le = (f) => { try { return JSON.parse(readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return undefined; } };
const git = (...a) => spawnSync("git", a, { cwd: op.raiz, encoding: "utf8" });

// `\` é separador só no Windows; fora dele é parte do nome, e trocá-lo daria por ausente um arquivo que existe
const caminho = (f) => (process.platform === "win32" ? f.replace(/\\/g, "/") : f).replace(/^\.\//, "");
const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const velha = (d) => { try { return Date.now() - statSync(d).mtimeMs > 120000; } catch { return false; /* sumiu */ } };
/** Remove a trava velha conferindo de novo sob `<trava>.quebra` (`mkdir` exclusivo): sem isso, quem a viu
 *  velha antes de outro removê-la e criar a sua removeria a trava nova. A `.quebra` nunca é removida por
 *  idade (isso traria a mesma corrida de volta): se um processo morreu com ela, a saída 75 a nomeia. */
function quebra(trava) {
  const q = `${trava}.quebra`;
  try { mkdirSync(q); } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return;
  }
  try { if (velha(trava)) rmSync(trava, { recursive: true, force: true }); } catch { /* sumiu */ } finally { rmSync(q, { recursive: true, force: true }); }
}
/** Trava por evidência (`mkdir` é exclusivo): quem relê e regrava a evidência o faz dentro dela. */
function comTrava(task, fn) {
  mkdirSync(pasta, { recursive: true });
  const trava = `${caminhoEv(task)}.trava`;
  for (const ate = Date.now() + 30000; ; pausa(50)) {
    try { mkdirSync(trava); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      // trava de processo que morreu: mais velha que 2 min é abandonada
      if (velha(trava)) quebra(trava);
      if (Date.now() > ate) {
        const q = velha(`${trava}.quebra`) ? ` (remova a mao, se nenhum processo esta rodando: ${trava}.quebra)` : "";
        process.stderr.write(`expx-revisao: evidencia travada por outro processo: ${trava}${q}\n`);
        process.exit(75);
      }
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
/** A CLI: o arquivo do pacote conferido, pelo `node`; nunca o `codeant` do PATH depois da conferência. */
const codeant = (bin, a) => spawnSync(process.execPath, [bin, ...a], { cwd: op.raiz, encoding: "utf8", maxBuffer: 64 << 20 });
const ORIENTACAO = "instale a homologada (npm i -g codeant-cli@0.5.14)";
/** O pacote do `codeant` do PATH, homologado e íntegro (`{bin, versao, perfil}`), ou o motivo de `indisponivel`. */
function cliConferida() {
  const loc = localizarPacote(process.env, process.platform);
  if (!loc.ok) {
    process.stderr.write(`expx-revisao: ${loc.motivo}: ${loc.detalhe}; ${ORIENTACAO}\n`);
    return { motivo: loc.motivo };
  }
  const perfil = perfilCli(loc.versao);
  if (!perfil) {
    process.stderr.write(`expx-revisao: versao ${loc.versao} nao homologada; ${ORIENTACAO} ou homologue a nova\n`);
    return { motivo: "versao", versao: loc.versao };
  }
  const diferenca = conferirIntegridade(loc.pacote, perfil);
  if (diferenca) {
    process.stderr.write(`expx-revisao: integridade: ${diferenca} em ${loc.pacote}; ${ORIENTACAO}\n`);
    return { motivo: "integridade", versao: loc.versao };
  }
  return { bin: loc.bin, versao: loc.versao, perfil };
}
/** O JSON da CLI: do primeiro `{` que dá JSON até o último `}` (o npm pode avisar antes e depois). */
function json(texto) {
  for (let i = texto.indexOf("{"); i >= 0; i = texto.indexOf("{", i + 1)) try { return JSON.parse(texto.slice(i, texto.lastIndexOf("}") + 1)); } catch { /* próximo */ }
}
/** Linhas que a task alterou em `f` (Set) ou `true` (arquivo novo: todas), desde o `HEAD` ou desde `--base-commit`. */
function alteradas(f) {
  const base = op["base-commit"];
  const novo = base ? git("cat-file", "-e", `${base}:./${f}`).status !== 0 : git("ls-files", "--error-unmatch", "--", f).status !== 0;
  if (novo) return true;
  const s = new Set();
  const d = base ? git("diff", "-U0", base, "HEAD", "--", f) : git("diff", "-U0", "HEAD", "--", f);
  if (d.status !== 0) return true; // sem HEAD (ou diff que falha): tudo conta, nunca menos
  for (const m of d.stdout.matchAll(/^@@ [^+]*\+(\d+)(?:,(\d+))? @@/gm)) {
    for (let n = 0; n < Number(m[2] ?? 1); n++) s.add(Number(m[1]) + n);
  }
  return s;
}

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Os `padrao` de `excluir_da_revisao` do projeto, pelo leitor irmão (nunca do ambiente); `null` se ele falha. */
function exclusoesDoProjeto() {
  const r = spawnSync(process.execPath, [join(AQUI, "expx-fatiamento.mjs"), "--formato", "json", "--raiz", op.raiz], { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(r.stderr ?? "");
    return null;
  }
  try {
    const lista = JSON.parse(r.stdout).excluir_da_revisao;
    return Array.isArray(lista) ? lista.map((x) => x.padrao) : null;
  } catch {
    return null;
  }
}
const arvore = (ref) => new Set(git("ls-tree", "-r", "-z", "--name-only", ref).stdout.split("\0").filter(Boolean));
const idDe = (...a) => { const r = git(...a); return r.status === 0 ? r.stdout.trim() : undefined; };
/** O blob que vai ao commit (sem `--base-commit`: `hash-object -w`; com: o de `HEAD`) e as medidas da CLI no blob e no
 *  checkout, valendo o maior; `disco` é o `hash-object` do checkout (o que mudaria se o arquivo fosse editado). */
function medida(f) {
  const disco = idDe("hash-object", "--", f);
  const blob = (op["base-commit"] && idDe("rev-parse", "--verify", "-q", `HEAD:./${f}`)) || idDe("hash-object", "-w", "--", f);
  if (!blob || !disco) return undefined;
  const conteudo = spawnSync("git", ["cat-file", "blob", blob], { cwd: op.raiz, maxBuffer: 1 << 30 }).stdout;
  const a = medir(conteudo);
  const b = medir(readFileSync(join(op.raiz, f)));
  return { blob, bytes: Math.max(a.bytes, b.bytes), linhas: Math.max(a.linhas, b.linhas), disco };
}
/** A resposta fora da forma do perfil (emenda, 6): topo, `meta`, `max_files`, a conta e os motivos. */
function foraDoPerfil(j, perfil, status) {
  const m = j.meta;
  const texto = (v) => typeof v === "string";
  return !(Array.isArray(j.issues) && j.error === null && typeof j.noFiles === "boolean" && ehMapa(m)
    && Array.isArray(m.reviewed_files) && m.reviewed_files.every(texto) && Number.isSafeInteger(m.total_changed)
    && Array.isArray(m.skipped) && m.skipped.every((s) => ehMapa(s) && texto(s.file) && texto(s.reason)) && typeof m.capped === "boolean"
    && m.max_files === perfil.max_files && m.total_changed === m.reviewed_files.length + m.skipped.length
    && m.skipped.every((s) => motivoAceito(s.reason, perfil)) && status === 0);
}
// os filtros que a #60 mostrou virem antes do `--include`: pulado fora da task só por eles
const ANTES_DO_INCLUDE = ["binary/generated", "deleted", "excluded by pattern"];
/** O motivo de `incompleta` da reconciliação entre os enviados (`I`) e a resposta, ou undefined. */
function reconciliar(I, meta) {
  const vistos = new Set();
  for (const f of [...meta.reviewed_files, ...meta.skipped.map((s) => s.file)]) {
    if (vistos.has(f)) return `repetido:${f}`;
    vistos.add(f);
  }
  const enviado = new Set(I);
  for (const f of meta.reviewed_files) if (!enviado.has(f)) return `sobra:${f}`;
  for (const s of meta.skipped) if (!enviado.has(s.file) && !ANTES_DO_INCLUDE.includes(s.reason)) return `sobra:${s.file}`;
  const pulados = new Set(meta.skipped.map((s) => s.file));
  for (const f of I) if (pulados.has(f)) return `pulado:${f}`;
  const revisados = new Set(meta.reviewed_files);
  for (const f of I) if (!revisados.has(f)) return `faltante:${f}`;
}

function revisar() {
  // sem aparar: espaço na ponta é parte do nome, e aparado o caminho seria outro arquivo (ou nenhum)
  const arquivos = op.arquivos.split(",").map(caminho).filter(Boolean);
  if (arquivos.length === 0) uso("--arquivos sem nenhum caminho");
  if (op["base-commit"] !== undefined) {
    const sha = idDe("rev-parse", "--verify", "-q", `${op["base-commit"]}^{commit}`);
    if (!sha) uso(`base-commit inexistente: ${op["base-commit"]}`);
    op["base-commit"] = sha;
  }
  const base = op["base-commit"] ?? null;
  const anterior = le(caminhoEv(op.task));
  const ev = { expx_revisao: 2, trabalho: op.trabalho, task: op.task, modo: base ? "base-commit" : "uncommitted", base_commit: base, cli: null,
    executada_em: new Date().toISOString(), arquivos: {}, chamada: null, resultado: "ok", achados: [],
    rejeicoes: Array.isArray(anterior?.rejeicoes) ? anterior.rejeicoes : [], removidos_sem_revisao: [] };
  const fim = (resultado, motivo) => Object.assign(ev, { resultado, motivo });
  const head = arvore("HEAD");
  const naBase = base ? arvore(base) : new Set();
  const existe = (f) => head.has(f) || naBase.has(f) || existsSync(join(op.raiz, f));
  // `--arquivos` e o `--include` da CLI separam por vírgula: um caminho com vírgula
  // chegaria partido, e cada pedaço seria revisado (ou dado por removido) sozinho
  const virgula = arquivos.some((_, i) => arquivos.slice(i + 1).some((__, j) => existe(arquivos.slice(i, i + j + 2).join(","))));
  const presentes = arquivos.filter((f) => existsSync(join(op.raiz, f)));
  const removidos = arquivos.filter((f) => !presentes.includes(f));
  for (const f of removidos) { ev.arquivos[f] = null; ev.removidos_sem_revisao.push(f); }
  const exclusoes = virgula ? [] : exclusoesDoProjeto();
  // os portões antes da CLI não dependem da versão instalada: os números são iguais em todas as homologadas
  const perfil = perfilCli(homologadas().at(-1));
  const medidas = {};
  for (const f of presentes) {
    const m = (medidas[f] = medida(f));
    const fora = excluido(f, EXCLUIDOS_DO_NUCLEO) || excluido(f, exclusoes ?? []);
    ev.arquivos[f] = { blob: m?.blob ?? null, bytes: m?.bytes ?? null, linhas: m?.linhas ?? null,
      revisao: fora ? "excluido" : revisavel(f, perfil) ? "enviado" : "nao-revisavel" };
  }
  const enviados = presentes.filter((f) => ev.arquivos[f].revisao === "enviado");
  const naoCommitado = (f) => (presentes.includes(f) ? medidas[f]?.disco !== idDe("rev-parse", "--verify", "-q", `HEAD:./${f}`) : head.has(f));
  (() => {
    // 1. o pedido não se revisa como está
    if (virgula) return fim("indisponivel", "caminho-com-virgula");
    const inexistente = removidos.find((f) => !existe(f));
    if (inexistente !== undefined) return fim("indisponivel", `arquivo-inexistente:${inexistente}`);
    if (exclusoes === null) return fim("indisponivel", "fatiamento-invalido");
    const semMedida = presentes.find((f) => !medidas[f]);
    if (semMedida !== undefined) return fim("indisponivel", `arquivo-inexistente:${semMedida}`);
    const pendente = base ? arquivos.find(naoCommitado) : undefined;
    if (pendente !== undefined) return fim("indisponivel", `arquivo-nao-commitado:${pendente}`);
    // 2. os portões antes da CLI, em qualquer modo
    const declarado = presentes.find((f) => excluido(f, exclusoes));
    if (declarado !== undefined) return fim("incompleta", `excluido-declarado:${declarado}`);
    if (enviados.length > perfil.max_files) return fim("incompleta", `L1:${enviados.length}`);
    const grande = enviados.find((f) => ev.arquivos[f].linhas > perfil.max_linhas || ev.arquivos[f].bytes > perfil.max_bytes);
    if (grande !== undefined) return fim("incompleta", `L2:${grande}`);
    // 3. nada a revisar: a CLI nem é procurada
    if (enviados.length === 0) return undefined;
    // 4. a CLI homologada e íntegra
    const cli = cliConferida();
    if (cli.motivo) {
      if (cli.versao) ev.cli = { versao: cli.versao, integridade: null };
      return fim("indisponivel", cli.motivo);
    }
    ev.cli = { versao: cli.versao, integridade: "conferida" };
    // 5. uma chamada só, sem lotes
    const r = codeant(cli.bin, ["review", "--headless", ...(base ? ["--base-commit", base] : ["--uncommitted"]), "--include", enviados.join(",")]);
    const j = json(r.stdout ?? "");
    const falhas = String(r.stderr ?? "").split(/\r?\n/).filter((l) => l.startsWith("[error] Failed to review "));
    ev.chamada = { include: enviados, meta: j?.meta ?? null, error: j === undefined ? `json ilegivel (rc ${r.status})` : j.error ?? null, falhas_de_lote: falhas };
    // 6-9. a resposta cobre a task inteira
    if (falhas.length > 0) return fim("incompleta", "lote-falhou");
    if (j === undefined || (j.error !== null && j.error !== undefined)) return fim("indisponivel", "erro");
    if (foraDoPerfil(j, cli.perfil, r.status)) return fim("incompleta", "perfil");
    const falta = reconciliar(enviados, j.meta);
    if (falta) return fim("incompleta", falta);
    // 10. o que foi revisado é o que vai ao commit
    for (const f of enviados) {
      const m = medida(f);
      if (!m || ["blob", "bytes", "linhas", "disco"].some((k) => m[k] !== medidas[f][k])) return fim("indisponivel", "arquivo-mudou-durante-revisao");
    }
    return achados(j.issues, ev);
  })();
  // rejeição gravada (rejeitar) enquanto a CLI rodava não se perde: releitura e gravação sob a trava;
  // as de outras tasks do trabalho também são relidas aqui, não só antes da espera pela trava
  const abertos = comTrava(op.task, () => {
    const agora = le(caminhoEv(op.task))?.rejeicoes;
    const doTrabalho = rejeitadasDoTrabalho();
    pausaDeTeste();
    for (const r of Array.isArray(agora) ? agora : []) {
      if (!ev.rejeicoes.some((x) => x?.identidade === r?.identidade)) ev.rejeicoes.push(r);
    }
    for (const a of ev.achados) if (doTrabalho.has(a.identidade) || ev.rejeicoes.some((r) => r?.identidade === a.identidade)) a.estado = "rejeitado";
    if (ev.resultado === "achados" && !ev.achados.some((a) => a.estado === "aberto")) ev.resultado = "ok";
    grava(op.task, ev);
    return ev.achados.filter((a) => a.estado === "aberto").length;
  });
  process.stdout.write(`${op.task} ${ev.resultado}${ev.motivo ? `:${ev.motivo}` : ""}\n`);
  process.exit({ indisponivel: 2, incompleta: 3 }[ev.resultado] ?? (abertos > 0 ? 1 : 0));
}

/** As identidades rejeitadas em qualquer evidência do trabalho. */
function rejeitadasDoTrabalho() {
  const rejeitadas = new Set();
  for (const n of existsSync(pasta) ? readdirSync(pasta) : []) {
    for (const r of n.endsWith(".json") ? le(join(pasta, n))?.rejeicoes ?? [] : []) rejeitadas.add(r?.identidade);
  }
  return rejeitadas;
}
/** Classifica os achados: rejeitado (por esta ou outra task do trabalho), aberto (linha alterada) ou anterior. */
function achados(issues, ev) {
  const rejeitadas = new Set([...ev.rejeicoes.map((r) => r.identidade), ...rejeitadasDoTrabalho()]);
  const cache = {};
  for (const i of issues) {
    const arquivo = caminho(String(i.relevant_file ?? ""));
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
/** Em `ok`/`achados`, o campo que falta para provar que a CLI rodou (ou undefined): `executada_em` ISO 8601 e,
 *  se algum arquivo foi enviado, versão homologada e a chamada. */
function semSinalDaCli(ev) {
  const enviados = Object.values(ev.arquivos).filter((a) => ehMapa(a) && a.revisao === "enviado");
  if (enviados.length > 0 && (typeof ev.cli?.versao !== "string" || !perfilCli(ev.cli.versao))) return "cli.versao";
  const iso = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/
    .exec(typeof ev.executada_em === "string" ? ev.executada_em : "");
  // o Date normaliza 30/02 para 02/03: a data tem de voltar igual
  const dia = iso && new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  if (!iso || dia.getUTCMonth() !== Number(iso[2]) - 1 || dia.getUTCDate() !== Number(iso[3])) return "executada_em";
  if (enviados.length > 0 && !ehMapa(ev.chamada)) return "chamada";
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
  if (!ehMapa(ev) || ev.expx_revisao !== 2 || ev.task !== task || ev.trabalho !== op.trabalho || !ehMapa(ev.arquivos)
    || Object.keys(ev.arquivos).length === 0 || !Object.values(ev.arquivos).every((a) => a === null || ehMapa(a)) || !Array.isArray(ev.achados)
    || !ev.achados.every((a) => ehMapa(a) && /^[0-9a-f]{64}$/.test(a.identidade) && ["aberto", "anterior", "rejeitado"].includes(a.estado))
    || !["ok", "achados", "indisponivel", "incompleta"].includes(ev.resultado)) return "FALHA evidencia-invalida";
  const falta = ["indisponivel", "incompleta"].includes(ev.resultado) ? undefined : semSinalDaCli(ev);
  if (falta) return `FALHA evidencia-invalida:${falta}`;
  for (const [f, a] of Object.entries(ev.arquivos)) {
    const r = git("rev-parse", "--verify", "-q", `${sha}:./${f}`);
    if ((r.status === 0 ? r.stdout.trim() : null) !== (a === null ? null : a.blob)) return `FALHA evidencia-nao-bate:${f}`;
  }
  if (ev.resultado === "indisponivel") return `${nivel} indisponivel:${ev.motivo}`;
  if (ev.resultado === "incompleta") return `FALHA incompleta:${ev.motivo}`;
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
