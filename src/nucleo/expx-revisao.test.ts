import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ambienteCom, noPath, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { arquivosDoCaso, respostaDoCaso, type CasoConformidade } from "../teste/conformidade.js";
import { chamadasDa, configurarFalsa, instalarCodeantFalsa, nucleoDeTeste, type CfgFalsa, type Falsa } from "../teste/codeant-falsa.js";

// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
const SCRIPT = join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-revisao.mjs");
// `FATIA_*` de quem roda a suíte faria todo subcomando sair 64: os filhos herdam o ambiente sem elas
// (o caso de `FATIA_*` as passa de propósito)
for (const k of Object.keys(process.env)) if (k.startsWith("FATIA_")) delete process.env[k];
const criados: string[] = [];
afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });
const temp = (p: string): string => { const d = mkdtempSync(join(tmpdir(), p)); criados.push(d); return d; };

function git(d: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: d, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const escreve = (d: string, rel: string, conteudo: string): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), conteudo); };

/** Repositório com `src/a.js` (l1..l5) commitado, a `codeant` falsa (pacote npm) configurada por `cfg` e o
 *  núcleo de teste, cujo perfil 0.5.14 tem o manifesto da falsa. */
type Cenario = { raiz: string; falsa: Falsa; script: string };
function cenario(cfg: CfgFalsa = {}, autocrlf = "false"): Cenario {
  const raiz = temp("expx-revisao-");
  git(raiz, "init", "-q", "-b", "main");
  git(raiz, "config", "core.autocrlf", autocrlf);
  escreve(raiz, "src/a.js", "l1\nl2\nl3\nl4\nl5\n");
  git(raiz, "add", "-A");
  git(raiz, "commit", "-q", "-m", "base");
  const falsa = instalarCodeantFalsa(temp("expx-codeant-"), cfg);
  return { raiz, falsa, script: nucleoDeTeste(temp("expx-nucleo-"), falsa) };
}
const PATH = process.env["PATH"] ?? process.env["Path"] ?? "";
type Arquivo = { blob: string; bytes: number; linhas: number; revisao: string };
type Ev = { resultado: string; motivo?: string; arquivos: Record<string, Arquivo | null>; chamada: unknown; [k: string]: unknown;
  achados: { identidade: string; arquivo: string; linha: number; estado: string }[]; rejeicoes: { identidade: string }[]; removidos_sem_revisao: string[] };
function revisar(c: Cenario, arquivos: string, task = "T-01", path = `${c.falsa.path}${delimiter}${PATH}`, extra: Record<string, string> = {}, script = c.script, mais: string[] = []) {
  const r = spawnSync(process.execPath, [script, "revisar", "--trabalho", "w", "--task", task, "--arquivos", arquivos, "--raiz", c.raiz, ...mais],
    { encoding: "utf8", env: ambienteCom(path, extra) });
  const ev = join(c.raiz, "docs", "entregas", "w", "revisao", `${task}.json`);
  return { rc: r.status, out: r.stdout, err: r.stderr, ev: (existsSync(ev) ? JSON.parse(readFileSync(ev, "utf8")) : undefined) as Ev,
    chamadas: chamadasDa(c.falsa).map((x) => x.args), registro: chamadasDa(c.falsa) };
}
/** Uma resposta da CLI para `src/a.js`, com `meta` e o topo trocados. */
const resp = (meta: object = {}, topo: object = {}) => ({ issues: [], meta: { reviewed_files: ["src/a.js"], total_changed: 1, skipped: [],
  capped: false, max_files: 40, ...meta }, error: null, noFiles: false, ...topo });
const achado = (arquivo: string, linha: number, label = "security") => ({ issue_content: "x", relevant_file: arquivo, start_line: linha, label });
const identidade = (label: string, arquivo: string, l: string[]) => createHash("sha256").update([label, arquivo, ...l, "0.5.14"].join("\0")).digest("hex");
const rejeita = (raiz: string, task: string, ids: string[]) =>
  escreve(raiz, `docs/entregas/w/revisao/${task}.json`, JSON.stringify({ expx_revisao: 1, achados: [], rejeicoes: ids.map((identidade) => ({ identidade, motivo: "fp", em: "x" })) }));
const altera3 = (raiz: string) => escreve(raiz, "src/a.js", "l1\nl2\nnovo3\nl4\nl5\n");

describe("expx-revisao.mjs revisar: a CLI conferida", () => {
  it("funcional: a falsa com o perfil de teste revisa (ok); a evidência registra a versão e a integridade conferida", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", cli: { versao: "0.5.14", integridade: "conferida" } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: a falsa com o perfil real → indisponivel:integridade, nenhuma chamada de review", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, SCRIPT);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "integridade" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: arquivo do pacote editado depois da instalação → indisponivel:integridade, nenhuma chamada", () => {
    const c = cenario();
    altera3(c.raiz);
    writeFileSync(join(c.falsa.pacote, "README.md"), "trocado\n");
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "integridade" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: versão 0.5.15 sem perfil → indisponivel:versao, nenhuma chamada", () => {
    const c = cenario({ versao: "0.5.15" });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "versao" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: PATH sem codeant → indisponivel:cli-ausente", () => {
    const c = cenario();
    altera3(c.raiz);
    expect(revisar(c, "src/a.js", "T-01", dirname(noPath("git") ?? ""))).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "cli-ausente" } });
  });

  it("funcional: a CLI roda pelo node no arquivo conferido, não pelo shim nem pelo link", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.registro).toHaveLength(1);
    expect(r.registro[0]?.shim).toBe(false);
    expect(r.registro[0]?.arquivo.toLowerCase()).toBe(realpathSync(c.falsa.bin).toLowerCase());
  });
});

describe("expx-revisao.mjs revisar", () => {
  it("funcional: achado em linha alterada bloqueia", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.rc).toBe(1);
    expect(r.ev).toMatchObject({ resultado: "achados", achados: [{ arquivo: "src/a.js", linha: 3, estado: "aberto", identidade: identidade("security", "src/a.js", ["l2", "novo3", "l4"]) }] });
    expect(r.ev.arquivos["src/a.js"]?.blob).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: achado em linha não alterada é anterior e não bloqueia", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ linha: 1, estado: "anterior" }] } });
  });

  it("funcional: arquivo novo não rastreado: todas as linhas contam como alteradas", () => {
    const c = cenario({ issues: [achado("src/b.js", 2)] });
    escreve(c.raiz, "src/b.js", "b1\nb2\n");
    expect(revisar(c, "src/b.js")).toMatchObject({ rc: 1, ev: { achados: [{ estado: "aberto" }] } });
  });

  it("funcional: chama a CLI com --uncommitted --headless e --include dos arquivos da task; nunca com --fail-on", () => {
    const c = cenario();
    altera3(c.raiz);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(revisar(c, "src/a.js,src/b.js").chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js,src/b.js"]]);
  });

  it.each([
    ["CLI ausente", {}, "cli-ausente"],
    ["versão abaixo de 0.5.14", { versao: "0.5.9" }, "versao"],
    ["error não nulo", { error: "falhou" }, "erro"],
  ])("funcional: %s → indisponivel (rc 2) com motivo", (nome, cfg, motivo) => {
    const c = cenario(cfg);
    altera3(c.raiz);
    expect(revisar(c, "src/a.js", "T-01", nome === "CLI ausente" ? dirname(noPath("git") ?? "") : undefined)).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo } });
  });

  it("funcional: --arquivos sem nenhum caminho (`,,`) é uso errado, nunca ok", () => {
    expect(revisar(cenario(), ",,")).toMatchObject({ rc: 64, ev: undefined });
  });

  it("funcional: HEAD sem commit (git diff HEAD falha): o arquivo no índice conta inteiro como alterado", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] });
    git(c.raiz, "update-ref", "-d", "refs/heads/main");
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 1, ev: { achados: [{ estado: "aberto" }] } });
  });

  it("funcional: vírgula no caminho → indisponivel com motivo caminho-com-virgula, sem revisão parcial", () => {
    const c = cenario();
    escreve(c.raiz, "src/a,b.js", "x\n");
    const r = revisar(c, "src/a,b.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "caminho-com-virgula" } });
    expect(r.chamadas.some((a) => a[0] === "review")).toBe(false);
  });

  it("funcional: espaço na ponta do caminho é parte do nome: nunca aparado (revisaria outro arquivo ou o daria por ausente)", () => {
    const c = cenario({ issues: [achado(" a.js", 1)] });
    escreve(c.raiz, " a.js", "x\n");
    const r = revisar(c, " a.js");
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: " a.js", estado: "aberto" }] } });
    expect(Object.keys(r.ev.arquivos)).toEqual([" a.js"]);
    expect(r.chamadas[0]).toEqual(["review", "--headless", "--uncommitted", "--include", " a.js"]);
  });

  it("funcional: --arquivos só com espaços é um caminho, não uso errado: ausente → indisponivel", () => {
    expect(revisar(cenario(), " ")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-inexistente: " } });
  });

  // no Windows um nome só de espaços não existe: o caso de o arquivo existir só cabe fora dele
  it.skipIf(process.platform === "win32")("funcional: fora do Windows, arquivo cujo nome é só espaços é revisado", () => {
    const c = cenario({ issues: [achado(" ", 1)] });
    escreve(c.raiz, " ", "x\n");
    expect(revisar(c, " ")).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: " ", estado: "aberto" }] } });
  });

  it("funcional: JSON precedido de avisos no stdout é lido", () => {
    const c = cenario({ avisos: "npm warn config {obsoleto}\nnpm notice nova versao\n", issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 1, ev: { resultado: "achados" } });
  });

  it("funcional: arquivo apagado não é revisado, fica null e entra em removidos_sem_revisao", () => {
    const c = cenario();
    rmSync(join(c.raiz, "src/a.js"));
    escreve(c.raiz, "src/b.js", "b\n");
    const r = revisar(c, "src/a.js,src/b.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["src/a.js"], arquivos: { "src/a.js": null } } });
    expect(r.chamadas[0]).toContain("src/b.js");
  });

  it("funcional: rejeição anterior com a mesma identidade vale nesta task", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-00", [identidade("security", "src/a.js", ["l2", "novo3", "l4"])]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: revisar de novo preserva as rejeições da própria task", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    rejeita(c.raiz, "T-01", [id]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: rejeição gravada (rejeitar) enquanto a CLI roda não se perde", () => {
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    const durante = JSON.stringify({ expx_revisao: 1, achados: [], rejeicoes: [{ identidade: id, motivo: "fp", em: "x" }] });
    const c = cenario();
    configurarFalsa(c.falsa, { issues: [achado("src/a.js", 3)], durante: [join(c.raiz, EV), durante] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-00", []);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: rejeição de outra task gravada enquanto o revisar espera a trava não se perde", async () => {
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava, { recursive: true }); // outro processo segura a evidência da T-01
    const ch = join(c.falsa.dir, "chamadas.jsonl");
    const rev = new Promise<number | null>((ok) => spawn(process.execPath, [c.script, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js", "--raiz", c.raiz],
      { env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`), stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    for (const ate = Date.now() + 20000; !(existsSync(ch) && readFileSync(ch, "utf8").includes("review")) && Date.now() < ate;) await espera(50);
    await espera(1500); // o revisar já classificou os achados e espera a trava
    rejeita(c.raiz, "T-00", [id]);
    rmSync(trava, { recursive: true });
    expect(await rev).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: linhas de texto idêntico com vizinhas diferentes têm identidades diferentes", () => {
    const c = cenario({ issues: [achado("src/b.js", 2), achado("src/b.js", 5)] });
    escreve(c.raiz, "src/b.js", "a\nx\nb\nc\nx\nd\n");
    const [um, dois] = revisar(c, "src/b.js").ev.achados;
    expect(um?.identidade).not.toBe(dois?.identidade);
    rejeita(c.raiz, "T-00", [um?.identidade ?? ""]);
    expect(revisar(c, "src/b.js").ev.achados.map((a) => a.estado)).toEqual(["rejeitado", "aberto"]);
  });

  it("funcional: CRLF no checkout (core.autocrlf=true): o blob da evidência é o do commit", () => {
    const c = cenario({}, "true");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\n");
    const r = revisar(c, "src/a.js");
    git(c.raiz, "add", "src/a.js");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(r.ev.arquivos["src/a.js"]?.blob).toBe(git(c.raiz, "rev-parse", "HEAD:src/a.js"));
  });

  // no Windows `\` é separador e não cabe em nome de arquivo: o caso só existe fora dele
  it.skipIf(process.platform === "win32")("funcional: fora do Windows, `\\` é parte do nome: o arquivo é achado e o diff é o dele", () => {
    const f = "src/a\\b.js";
    const c = cenario({ issues: [achado(f, 3)] });
    escreve(c.raiz, f, "l1\nl2\nl3\nl4\nl5\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "com barra invertida");
    escreve(c.raiz, f, "l1\nl2\nnovo3\nl4\nl5\n");
    const r = revisar(c, f);
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: f, linha: 3, estado: "aberto" }] } });
    expect(r.ev.arquivos[f]?.blob).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: a CLI só consegue reescrever o snapshot descartável, não o checkout", () => {
    const c = cenario({ reescreve: "src/a.js" });
    altera3(c.raiz);
    const original = readFileSync(join(c.raiz, "src/a.js"), "utf8");
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
    expect(readFileSync(join(c.raiz, "src/a.js"), "utf8")).toBe(original);
    expect(r.registro.find((x) => x.args[0] === "review")).toMatchObject({ conteudos: { "src/a.js": original } });
  });

  it("funcional: editar e restaurar o checkout durante a CLI não muda os bytes revisados", () => {
    const c = cenario();
    altera3(c.raiz);
    const original = readFileSync(join(c.raiz, "src/a.js"), "utf8");
    configurarFalsa(c.falsa, { oscilaOrigem: [join(c.raiz, "src/a.js"), "conteudo transitorio\n", original] });
    const r = revisar(c, "src/a.js");
    const chamada = r.registro.find((x) => x.args[0] === "review");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
    expect(readFileSync(join(c.raiz, "src/a.js"), "utf8")).toBe(original);
    expect(chamada?.cwd).not.toBe(c.raiz);
    expect(chamada?.conteudos["src/a.js"]).toBe(original);
  });

  it.each([
    [1, "arquivo-inexistente:src/a.js"],
    [2, "arquivo-mudou-durante-revisao"],
  ])("funcional: arquivo apagado entre o hash-object e o open da medida (open nº %i) → indisponivel:%s, com evidência", (n, motivo) => {
    const c = cenario();
    altera3(c.raiz);
    // o openSync do script apaga o arquivo antes de abri-lo na n-ésima vez: a troca entre a conferência e a leitura
    const pre = join(temp("expx-open-"), "pre.mjs");
    writeFileSync(pre, `import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const alvo = ${JSON.stringify(join(c.raiz, "src/a.js"))}, open = fs.openSync; let n = 0;
fs.openSync = (...a) => { if (String(a[0]) === alvo && ++n === ${n}) fs.rmSync(a[0]); return open(...a); };
syncBuiltinESMExports();
`);
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(pre).href, c.script, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js",
      "--raiz", c.raiz], { encoding: "utf8", env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`, {}) });
    expect(existsSync(join(c.raiz, "src/a.js"))).toBe(false);
    expect({ rc: r.status, out: r.stdout }).toEqual({ rc: 2, out: `T-01 indisponivel:${motivo}\n` });
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", motivo });
  });
});

const grava = (d: string, rel: string, b: Buffer): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), b); };
/** Põe na raiz os arquivos do caso (só `nomes`, se dados); o apagado é commitado antes e removido. Devolve os nomes. */
function poeCaso(raiz: string, arquivos: Map<string, Buffer | null>, nomes?: string[]): string[] {
  const sel = [...arquivos].filter(([f]) => !nomes || nomes.includes(f));
  const apagados = sel.filter(([, b]) => b === null).map(([f]) => f);
  if (apagados.length > 0) {
    for (const f of apagados) grava(raiz, f, Buffer.from("x\n"));
    git(raiz, "add", "-A");
    git(raiz, "commit", "-q", "-m", "apagaveis");
    for (const f of apagados) rmSync(join(raiz, f));
  }
  for (const [f, b] of sel) if (b) grava(raiz, f, b);
  return sel.map(([f]) => f);
}
type Resposta = { issues: unknown[]; meta: { reviewed_files: string[]; skipped: { file: string; reason: string }[]; total_changed: number }; error: unknown; noFiles: boolean };
/** O JSON da #60; com `fica`, só as entradas dos arquivos que ficam, e `total_changed` refeito. */
function doFixture(caso: CasoConformidade, fica?: (f: string) => boolean): Resposta {
  const j = JSON.parse(respostaDoCaso(caso).toString("utf8")) as Resposta;
  if (fica) {
    j.meta.reviewed_files = j.meta.reviewed_files.filter(fica);
    j.meta.skipped = j.meta.skipped.filter((s) => fica(s.file));
    j.meta.total_changed = j.meta.reviewed_files.length + j.meta.skipped.length;
  }
  return j;
}
const semCodeant = (): string => dirname(noPath("git") ?? "");
const naoChamou = (r: { chamadas: string[][] }) => expect(r.chamadas.filter((a) => a[0] === "review")).toEqual([]);

describe("expx-revisao.mjs revisar v2: portões antes da CLI", () => {
  it("funcional: caminho de --arquivos fora da raiz (../ ou absoluto) é erro de uso; nada é lido, copiado nem apagado fora do checkout", () => {
    const c = cenario();
    const fora = temp("expx-fora-");
    const alvo = join(fora, "alvo.js");
    writeFileSync(alvo, "segredo\n");
    const relativo = `../${fora.split(/[\\/]/).pop() ?? ""}/alvo.js`;
    expect(existsSync(join(c.raiz, relativo)), "o caminho relativo alcança o arquivo de fora").toBe(true);
    for (const pedido of [relativo, `src/../${relativo}`, alvo, `src/a.js,${relativo}`]) {
      const r = revisar(c, pedido);
      expect(r.rc, pedido).toBe(64);
      expect(r.err, pedido).toContain("fora da raiz do projeto");
      expect(r.chamadas, pedido).toEqual([]);
      expect(r.ev, pedido).toBeUndefined();
    }
    expect(readFileSync(alvo, "utf8")).toBe("segredo\n");
  });

  it("funcional: limite40.json: 40 revisáveis, com 5.000 linhas sem quebra final e 204.800 bytes → ok; uma chamada com os 40", () => {
    const c = cenario({ fixture: "limite40" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite40"));
    const r = revisar(c, nomes.join(","));
    expect(r).toMatchObject({ rc: 0, out: "T-01 ok\n", ev: { expx_revisao: 2, resultado: "ok", modo: "uncommitted", base_commit: null,
      cli: { versao: "0.5.14", integridade: "conferida" } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", nomes.join(",")]]);
    expect(r.ev.arquivos["linhas-5000.js"]).toMatchObject({ linhas: 5000, revisao: "enviado", blob: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(r.ev.arquivos["bytes-204800.js"]).toMatchObject({ bytes: 204800, linhas: 101, revisao: "enviado" });
    expect(r.ev.chamada).toMatchObject({ include: nomes, error: null, falhas_de_lote: [], meta: { max_files: 40, total_changed: 40 } });
  });

  it("funcional: 41 revisáveis → incompleta:L1:41 (rc 3), sem chamar a CLI; sem codeant no PATH, também rc 3, nunca 2", () => {
    const c = cenario();
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41"));
    const r = revisar(c, nomes.join(","));
    expect(r).toMatchObject({ rc: 3, out: "T-01 incompleta:L1:41\n", ev: { resultado: "incompleta", motivo: "L1:41", cli: null, chamada: null } });
    naoChamou(r);
    expect(revisar(c, nomes.join(","), "T-01", semCodeant())).toMatchObject({ rc: 3, ev: { motivo: "L1:41" } });
  });

  it("funcional: 5.000 linhas com quebra final → incompleta:L2:<f>, sem chamar a CLI", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["linhas-5000-quebra-final.js"]);
    const r = revisar(c, "src/a.js,linhas-5000-quebra-final.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:linhas-5000-quebra-final.js" } });
    expect(r.ev.arquivos["linhas-5000-quebra-final.js"]).toMatchObject({ linhas: 5001, revisao: "enviado" });
    naoChamou(r);
  });

  it("funcional: 204.801 bytes → incompleta:L2:<f>", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["bytes-204801.js"]);
    expect(revisar(c, "bytes-204801.js")).toMatchObject({ rc: 3, ev: { motivo: "L2:bytes-204801.js" } });
  });

  it("funcional: CRLF no checkout acima de 204.800 bytes com o blob abaixo → incompleta:L2 (vale o maior)", () => {
    const c = cenario({}, "true");
    const linha = `${"x".repeat(98)}\r\n`;
    grava(c.raiz, "src/grande.js", Buffer.from(linha.repeat(2060)));
    const r = revisar(c, "src/grande.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:src/grande.js" } });
    expect(r.ev.arquivos["src/grande.js"]).toMatchObject({ bytes: 2060 * 100, linhas: 2061 });
    expect(Number(git(c.raiz, "cat-file", "-s", r.ev.arquivos["src/grande.js"]?.blob ?? ""))).toBe(2060 * 99);
  });

  it("funcional: acima da leitura máxima (1 MiB), nem blob nem checkout são lidos → incompleta:L2, bytes do tamanho e linhas null", () => {
    const c = cenario();
    escreve(c.raiz, "src/enorme.js", "x\n".repeat(512 * 1024) + "x");
    const r = revisar(c, "src/enorme.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:src/enorme.js" } });
    expect(r.ev.arquivos["src/enorme.js"]).toMatchObject({ bytes: 1024 * 1024 + 1, linhas: null, revisao: "enviado" });
    naoChamou(r);
  });

  it("funcional: notas.md, manual.pdf, logo.png, package-lock.json e apagado.js → --include só notas.md; a resposta da CLI para eles → ok", () => {
    const tarefa = ["notas.md", "manual.pdf", "logo.png", "package-lock.json", "apagado.js"];
    const c = cenario({ resposta: doFixture("pulos", (f) => tarefa.includes(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), tarefa);
    const r = revisar(c, tarefa.join(","));
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["apagado.js"], arquivos: { "apagado.js": null,
      "notas.md": { revisao: "enviado" }, "manual.pdf": { revisao: "nao-revisavel" }, "logo.png": { revisao: "nao-revisavel" },
      "package-lock.json": { revisao: "nao-revisavel" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "notas.md"]]);
  });

  it("funcional: sem arquivo revisável → ok sem localizar nem chamar a CLI (cli e chamada nulos)", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["manual.pdf"]);
    const r = revisar(c, "manual.pdf", "T-01", semCodeant());
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", cli: null, chamada: null } });
    naoChamou(r);
  });

  it("funcional: arquivo da task em excluir_da_revisao do projeto → incompleta:excluido-declarado:<f>", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    escreve(c.raiz, "gerado/saida.js", "x\n");
    const r = revisar(c, "src/a.js,gerado/saida.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "excluido-declarado:gerado/saida.js" } });
    naoChamou(r);
  });

  it("funcional: arquivo da task em ^docs/entregas/ fica fora do --include, revisao excluido, e não bloqueia", () => {
    const c = cenario();
    altera3(c.raiz);
    escreve(c.raiz, "docs/entregas/w/ENTREGA.md", "# entrega\n");
    const r = revisar(c, "src/a.js,docs/entregas/w/ENTREGA.md");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "docs/entregas/w/ENTREGA.md": { revisao: "excluido" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: arquivo apagado em pasta excluída pelo projeto não bloqueia", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    poeCaso(c.raiz, new Map([["gerado/velho.js", null]]));
    altera3(c.raiz);
    expect(revisar(c, "src/a.js,gerado/velho.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["gerado/velho.js"] } });
  });

  it("funcional: .expx/fatiamento.json inválido → indisponivel:fatiamento-invalido, sem chamar a CLI", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 1 }));
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "fatiamento-invalido" } });
    naoChamou(r);
  });

  it("funcional: FATIA_X no ambiente → rc 64 com a mensagem, sem evidência, nos quatro subcomandos", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, { FATIA_X: "" });
    expect(r).toMatchObject({ rc: 64, ev: undefined });
    expect(r.err).toContain("`FATIA_X` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente");
    naoChamou(r);
    const env = ambienteCom(PATH, { FATIA_X: "1" });
    for (const a of [["conferir", "--modo", "obrigatoria", "--task", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`],
      ["rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp"], ["listar", "--task", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`]]) {
      const s = spawnSync(process.execPath, [c.script, ...a, "--trabalho", "w", "--raiz", c.raiz], { encoding: "utf8", env });
      expect([s.status, s.stderr.includes("`FATIA_X` não é mais lida")]).toEqual([64, true]);
    }
  });
});

describe("expx-revisao.mjs revisar v2: depois da CLI", () => {
  it("funcional: limite41.json servido a uma task com f01–f40 → incompleta:sobra:f41.js", () => {
    const c = cenario({ fixture: "limite41" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41")).slice(0, 40);
    expect(revisar(c, nomes.join(","))).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "sobra:f41.js" } });
  });

  it("funcional: pulos.json inteiro servido à task de notas.md → incompleta:sobra:bytes-204801.js", () => {
    const c = cenario({ fixture: "pulos" });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["notas.md"]);
    expect(revisar(c, "notas.md")).toMatchObject({ rc: 3, ev: { motivo: "sobra:bytes-204801.js" } });
  });

  it("funcional: pulos-uncommitted.json (noFiles), sem as entradas de tamanho, servido à task de notas.md → incompleta:faltante:notas.md", () => {
    const c = cenario({ resposta: doFixture("pulos-uncommitted", (f) => !/^(bytes|linhas)-/.test(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["notas.md"]);
    expect(revisar(c, "notas.md")).toMatchObject({ rc: 3, ev: { motivo: "faltante:notas.md" } });
  });

  it.each([
    ["JSON limpo", {}],
    ["error não nulo", { error: "falhou" }],
  ])("funcional: stderr com \"[error] Failed to review\" e %s → incompleta:lote-falhou (rc 3)", (_nome, topo) => {
    const c = cenario({ stderr: "aviso qualquer\n[error] Failed to review src/a.js: 500\n", resposta: resp({}, topo) });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou",
      chamada: { falhas_de_lote: ["[error] Failed to review src/a.js: 500"] } } });
  });

  it.each([
    ["max_files 15", { resposta: resp({ max_files: 15 }) }],
    ["reason fora do perfil", { resposta: resp({ skipped: [{ file: "x.js", reason: "too big" }], total_changed: 2 }) }],
    ["total_changed errado", { resposta: resp({ total_changed: 3 }) }],
    ["meta ausente", { resposta: { issues: [], error: null, noFiles: false } }],
    ["noFiles que não é booleano", { resposta: resp({}, { noFiles: "x" }) }],
    ["reviewed_files que não é lista", { resposta: resp({ reviewed_files: 1 }) }],
    ["skipped sem reason", { resposta: resp({ skipped: [{ file: "x.js" }], total_changed: 2 }) }],
    ["saída 1 com error nulo", { resposta: resp(), saida: 1 }],
    ["issue que não é objeto", { resposta: resp({}, { issues: [null] }) }],
  ])("funcional: %s → incompleta:perfil", (_nome, cfg) => {
    const c = cenario(cfg as CfgFalsa);
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "perfil" } });
  });

  it("funcional: arquivo da task em skipped com \"too large (200 KB, max 200 KB)\" → incompleta:pulado:<f>", () => {
    const c = cenario({ resposta: resp({ reviewed_files: [], skipped: [{ file: "src/a.js", reason: "too large (200 KB, max 200 KB)" }] }) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { motivo: "pulado:src/a.js" } });
  });

  it("funcional: arquivo repetido na resposta → incompleta:repetido:<f>", () => {
    const c = cenario({ resposta: resp({ reviewed_files: ["src/a.js", "src/a.js"], total_changed: 2 }) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { motivo: "repetido:src/a.js" } });
  });

  it("funcional: src/[id].ts na task e resposta sem ele (o --include o tomou por glob) → incompleta:faltante:src/[id].ts", () => {
    const c = cenario({ resposta: resp({ reviewed_files: [], total_changed: 0 }, { noFiles: true }) });
    escreve(c.raiz, "src/[id].ts", "export const id = 1;\n");
    expect(revisar(c, "src/[id].ts")).toMatchObject({ rc: 3, ev: { motivo: "faltante:src/[id].ts" } });
  });
});

describe("expx-revisao.mjs revisar v2: --base-commit", () => {
  it("funcional: chama --base-commit <sha>; linhas alteradas pelo diff desde <sha>", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "outra");
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r.chamadas).toEqual([["review", "--headless", "--base-commit", base, "--include", "src/a.js"]]);
    expect(r).toMatchObject({ rc: 1, ev: { modo: "base-commit", base_commit: base, resultado: "achados",
      achados: [{ linha: 3, estado: "aberto" }, { linha: 1, estado: "anterior" }] } });
    expect(r.ev.arquivos["src/a.js"]?.blob).toBe(git(c.raiz, "rev-parse", "HEAD:src/a.js"));
  });

  it("funcional: arquivo da task alterado e não commitado → indisponivel:arquivo-nao-commitado:<f>", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-nao-commitado:src/a.js" } });
    naoChamou(r);
  });

  // o caminho é literal para o git: glob e pathspec mágico no nome não trocam os hunks do arquivo
  it.each([false, true])("funcional: src/[id].ts ao lado de src/i.ts: as linhas alteradas são só as dele (--base-commit: %s)", (comBase) => {
    const c = cenario({ issues: [achado("src/[id].ts", 1), achado("src/[id].ts", 3)] });
    for (const f of ["src/[id].ts", "src/i.ts"]) escreve(c.raiz, f, "l1\nl2\nl3\nl4\nl5\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "arquivos");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "src/i.ts", "novo1\nl2\nl3\nl4\nl5\n");
    escreve(c.raiz, "src/[id].ts", "l1\nl2\nnovo3\nl4\nl5\n");
    if (comBase) git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, "src/[id].ts", "T-01", undefined, {}, c.script, comBase ? ["--base-commit", base] : []);
    expect(r).toMatchObject({ rc: 1, ev: { achados: [{ linha: 1, estado: "anterior" }, { linha: 3, estado: "aberto" }] } });
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, nome com pathspec mágico (:(top)x): achado em linha alterada continua aberto", () => {
    const f = ":(top)x";
    const c = cenario({ issues: [achado(f, 3)] });
    escreve(c.raiz, f, "l1\nl2\nl3\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "magico");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, f, "l1\nl2\nnovo3\n");
    git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, f, "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: f, linha: 3, estado: "aberto" }] } });
  });

  it("funcional: CRLF no checkout (core.autocrlf=true) commitado: não é arquivo-nao-commitado e o blob é o do commit", () => {
    const c = cenario({}, "true");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\n");
    git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "src/a.js": { blob: git(c.raiz, "rev-parse", "HEAD:src/a.js"), bytes: 15 } } } });
  });

  it("funcional: a falsa reconfigurada sem fixture deixa de servir a fixture anterior", () => {
    const c = cenario({ fixture: "limite41" });
    configurarFalsa(c.falsa, {});
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
  });

  // com --base-commit, a exclusão que vale é a versionada no HEAD revisado, nunca a da árvore de trabalho
  const exclusaoGerado = JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
    { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] });
  const comGerado = (c: Cenario): string => {
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "gerado/saida.js", "x\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    return base;
  };

  it("funcional: excluir_da_revisao só no disco (fora do HEAD) não vale: o arquivo é revisado", () => {
    const c = cenario();
    const base = comGerado(c);
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "gerado/saida.js": { revisao: "enviado" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--base-commit", base, "--include", "gerado/saida.js"]]);
  });

  it("funcional: excluir_da_revisao no HEAD vale mesmo apagado do disco → incompleta:excluido-declarado", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const base = comGerado(c);
    rmSync(join(c.raiz, ".expx", "fatiamento.json"));
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "excluido-declarado:gerado/saida.js" } });
    naoChamou(r);
  });

  it("funcional: .expx/fatiamento.json do HEAD que não é arquivo → indisponivel:fatiamento-invalido, mesmo válido no disco", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json/x", "x\n");
    const base = comGerado(c);
    rmSync(join(c.raiz, ".expx"), { recursive: true });
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "fatiamento-invalido" } });
    naoChamou(r);
  });

  it("funcional: arquivo apagado desde <sha> → removido, não arquivo-inexistente", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    rmSync(join(c.raiz, "src/a.js"));
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    const r = revisar(c, "src/a.js,src/b.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["src/a.js"], arquivos: { "src/a.js": null } } });
  });
});

const roda = (raiz: string, ...a: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...a, "--trabalho", "w", "--raiz", raiz], { encoding: "utf8" });
  return { rc: r.status, out: r.stdout.trim(), err: r.stderr };
};
const conferir = (raiz: string, modo: string, ...pares: string[]) => roda(raiz, "conferir", "--modo", modo, ...pares.flatMap((p) => ["--task", p]));
const EV = "docs/entregas/w/revisao/T-01.json";
const evidencia = (raiz: string): unknown => JSON.parse(readFileSync(join(raiz, EV), "utf8"));
/** O commit da task leva a evidência junto (E1); `soEvidencia` deixa o código fora. */
const commita = (raiz: string, soEvidencia = false): string => {
  git(raiz, "add", "-A", ...(soEvidencia ? ["docs"] : ["src", "docs"]));
  git(raiz, "commit", "-q", "-m", "task");
  return git(raiz, "rev-parse", "HEAD");
};

describe("expx-revisao.mjs conferir e rejeitar", () => {
  it("funcional: evidência ok que bate com o commit passa; desligada aceita tudo", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    expect(conferir(c.raiz, "desligada", `T-09=${sha}`)).toMatchObject({ rc: 0, out: "T-09 ok" });
  });

  it("funcional: evidência ausente é FALHA em obrigatoria e AVISO em se_disponivel; commit inexistente é sempre FALHA", () => {
    const c = cenario();
    const sha = git(c.raiz, "rev-parse", "HEAD");
    expect(conferir(c.raiz, "obrigatoria", `T-09=${sha}`)).toMatchObject({ rc: 1, out: "T-09 FALHA evidencia-ausente" });
    expect(conferir(c.raiz, "se_disponivel", `T-09=${sha}`)).toMatchObject({ rc: 3, out: "T-09 AVISO evidencia-ausente" });
    expect(conferir(c.raiz, "se_disponivel", `T-09=${"0".repeat(40)}`)).toMatchObject({ rc: 1, out: `T-09 FALHA commit-inexistente:${"0".repeat(40)}` });
  });

  it("funcional: a evidência vale como está no commit, não como está no disco", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const sha = commita(c.raiz);
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it.each([
    ["arquivos nulo", { arquivos: null }],
    ["arquivos vazio", { arquivos: {} }],
    ["achados ausente", { achados: undefined }],
    ["resultado achados sem achado aberto", { resultado: "achados" }],
    ["achado nulo", { achados: [null] }],
    ["achado com estado desconhecido", { achados: [{ identidade: "a".repeat(64), arquivo: "src/a.js", linha: 1, estado: "aceito" }] }],
  ])("funcional: evidência malformada (%s) é FALHA, nunca ok", (_nome, troca) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), ...troca }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: expect.stringMatching(/^T-01 FALHA /) });
  });

  it.each([
    ["sem cli", { cli: undefined }, "cli.versao"],
    ["cli.versao nula", { cli: { versao: null } }, "cli.versao"],
    ["cli.versao abaixo da mínima", { cli: { versao: "0.5.13" } }, "cli.versao"],
    ["cli.versao que não é semver", { cli: { versao: "0.5" } }, "cli.versao"],
    ["cli.versao com zero à esquerda", { cli: { versao: "00.5.14" } }, "cli.versao"],
    ["cli.versao com zero à esquerda no patch", { cli: { versao: "0.5.014" } }, "cli.versao"],
    ["sem executada_em", { executada_em: undefined }, "executada_em"],
    ["executada_em que não é ISO 8601", { executada_em: "ontem" }, "executada_em"],
    ["executada_em em data impossível", { executada_em: "2026-02-30T10:00:00Z" }, "executada_em"],
    ["executada_em em hora impossível", { executada_em: "2026-02-10T24:30:00Z" }, "executada_em"],
    ["chamada nula com arquivo enviado", { chamada: null }, "chamada"],
    ["sem chamada", { chamada: undefined }, "chamada"],
  ])("funcional: ok sem sinal de que a CLI rodou (%s) é FALHA evidencia-invalida nomeando o campo", (_nome, troca, campo) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), ...troca }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });
  });

  it("funcional: achados sem cli.versao, ou com versão acima da homologada, é evidencia-invalida", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as object;
    escreve(c.raiz, EV, JSON.stringify({ ...ev, cli: {} }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
    escreve(c.raiz, EV, JSON.stringify({ ...ev, cli: { versao: "0.10.0", integridade: "conferida" } }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
  });

  it("funcional: indisponivel não exige cli.versao, executada_em nem chamada", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01", dirname(noPath("git") ?? ""));
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", motivo: "cli-ausente", cli: null, chamada: null });
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), executada_em: undefined }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:cli-ausente" });
  });

  it("funcional: indisponivel é FALHA em obrigatoria e AVISO em se_disponivel", () => {
    const c = cenario({ error: "falhou" });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA indisponivel:erro" });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:erro" });
  });

  it("funcional: achado aberto reprova; rejeitar um achado aberto faz conferir passar", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "f".repeat(64), "--motivo", "fp").rc).toBe(1);
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "falso positivo").rc).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", achados: [{ estado: "rejeitado" }], rejeicoes: [{ identidade: id, motivo: "falso positivo" }] });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: rejeitar entre a releitura e a gravação do revisar não se perde (trava por evidência)", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const dir = temp("expx-pausa-");
    const filho = (a: string[], env?: NodeJS.ProcessEnv) => new Promise<number | null>((ok) =>
      spawn(process.execPath, [c.script, ...a, "--trabalho", "w", "--raiz", c.raiz], { env, stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const rev = filho(["revisar", "--task", "T-01", "--arquivos", "src/a.js"], ambienteCom(`${c.falsa.path}${delimiter}${PATH}`, { EXPX_REVISAO_TESTE_PAUSA: dir }));
    for (const ate = Date.now() + 20000; !existsSync(join(dir, "pronto")) && Date.now() < ate;) await espera(50);
    const rej = filho(["rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp"]);
    await espera(1500); // sem a trava, o rejeitar grava aqui, com o revisar parado, e o revisar o apaga
    writeFileSync(join(dir, "continuar"), "");
    expect([await rev, await rej]).toEqual([1, 0]);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: trava velha de processo vivo não é removida por idade", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava);
    writeFileSync(join(trava, "dono.json"), JSON.stringify({ pid: process.pid, token: "viva" }));
    utimesSync(trava, new Date(0), new Date(0));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    let fechou = false;
    const rej = new Promise<number | null>((ok) => spawn(process.execPath,
      [c.script, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp", "--trabalho", "w", "--raiz", c.raiz],
      { stdio: "ignore" }).on("close", (rc) => { fechou = true; ok(rc); }));
    await espera(1200);
    expect([existsSync(trava), fechou]).toEqual([true, false]);
    rmSync(trava, { recursive: true });
    expect(await rej).toBe(0);
  });

  it("funcional: trava velha com dono comprovadamente morto é recuperada", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava);
    writeFileSync(join(trava, "dono.json"), JSON.stringify({ pid: 2147483647, token: "morta" }));
    utimesSync(trava, new Date(0), new Date(0));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(existsSync(trava)).toBe(false);
  });

  it("funcional: .quebra velha nunca é removida sozinha: sai 75 nomeando-a, e a trava fica", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    for (const d of [trava, `${trava}.quebra`]) { mkdirSync(d); utimesSync(d, new Date(0), new Date(0)); } // morreu ao quebrar
    const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
    expect(r).toMatchObject({ rc: 75, err: expect.stringContaining(`${trava}.quebra`) });
    expect([existsSync(trava), existsSync(`${trava}.quebra`)]).toEqual([true, true]);
  }, 60000);

  it("funcional: rejeitar não muda o resultado de indisponivel", () => {
    const c = cenario();
    escreve(c.raiz, EV, JSON.stringify({ expx_revisao: 1, trabalho: "w", task: "T-01", resultado: "indisponivel", motivo: "erro",
      arquivos: {}, achados: [{ identidade: "a".repeat(64), estado: "aberto" }], rejeicoes: [] }));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp").rc).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: evidência que não bate com o commit reprova nomeando o arquivo", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, "src/a.js", "editado depois da revisao\n");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/a.js" });
  });

  it("funcional: arquivo removido na evidência: aceito se o commit o remove, FALHA se o commit o tem", () => {
    const c = cenario();
    rmSync(join(c.raiz, "src/a.js"));
    revisar(c, "src/a.js");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/a.js" });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });
});

describe("expx-revisao.mjs conferir v2", () => {
  /** Uma evidência ok de `src/a.js` revisada e commitada, e a troca `muda` aplicada a ela num commit só de evidência. */
  function forjada(muda: (ev: Record<string, any>) => void, antes?: (raiz: string) => void): { raiz: string; sha: string } {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    commita(c.raiz);
    antes?.(c.raiz);
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "forjada");
    return { raiz: c.raiz, sha: git(c.raiz, "rev-parse", "HEAD") };
  }
  const reprova = (f: { raiz: string; sha: string }, campo: string) =>
    expect(conferir(f.raiz, "se_disponivel", `T-01=${f.sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });

  it("funcional: evidência v1 → FALHA evidencia-invalida:versao", () => {
    reprova(forjada((ev) => { ev["expx_revisao"] = 1; }), "versao");
  });

  it("funcional: incompleta é FALHA em obrigatoria e em se_disponivel", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["linhas-5001.js"]);
    revisar(c, "linhas-5001.js");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    const sha = git(c.raiz, "rev-parse", "HEAD");
    for (const modo of ["obrigatoria", "se_disponivel"]) {
      expect(conferir(c.raiz, modo, `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA incompleta:L2:linhas-5001.js" });
    }
  });

  it.each([
    ["cli.integridade diferente de conferida", (ev: Record<string, any>) => { ev["cli"].integridade = null; }, "integridade"],
    ["max_files 15 forjado", (ev: Record<string, any>) => { ev["chamada"].meta.max_files = 15; }, "perfil"],
    ["meta ausente", (ev: Record<string, any>) => { ev["chamada"].meta = null; }, "perfil"],
    ["pulo com motivo fora do perfil", (ev: Record<string, any>) => { ev["chamada"].meta.skipped = [{ file: "x.js", reason: "too big" }]; }, "perfil"],
    ["falha de lote registrada", (ev: Record<string, any>) => { ev["chamada"].falhas_de_lote = ["[error] Failed to review src/a.js: 500"]; }, "lote-falhou"],
    ["enviado fora de reviewed_files", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = []; }, "cobertura"],
    ["enviado pulado", (ev: Record<string, any>) => { ev["chamada"].meta.skipped = [{ file: "src/a.js", reason: "too large (5001 lines, max 5000)" }]; }, "cobertura"],
    ["enviado com linhas menores que as do blob", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].linhas = 1; }, "L2"],
    ["enviado com bytes menores que os do blob", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].bytes = 1; }, "L2"],
    // sem enviado, nada da CLI seria conferido: a classificação de cada arquivo é refeita
    ["revisável marcado excluido", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "excluido"; }, "revisao"],
    ["revisável marcado nao-revisavel", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "nao-revisavel"; }, "revisao"],
    ["revisao desconhecida", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "foo"; }, "revisao"],
    ["chamada com error não nulo", (ev: Record<string, any>) => { ev["chamada"].error = "falhou"; }, "chamada"],
    ["include diferente dos enviados", (ev: Record<string, any>) => { ev["chamada"].include = ["src/a.js", "src/b.js"]; }, "cobertura"],
    ["revisado repetido", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = ["src/a.js", "src/a.js"]; }, "cobertura"],
    ["sobra em reviewed_files", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = ["src/a.js", "src/z.js"]; }, "cobertura"],
  ])("funcional: ok com %s → FALHA evidencia-invalida:<campo>", (_nome, muda, campo) => {
    reprova(forjada(muda), campo);
  });

  it("funcional: ok com enviado de 5.001 linhas forjado → FALHA evidencia-invalida:L2", () => {
    const grande = Array.from({ length: 5001 }, (_, i) => `l${i}`).join("\n");
    reprova(forjada((ev) => {
      ev["arquivos"]["src/a.js"] = { ...ev["arquivos"]["src/a.js"], blob: grandeBlob, linhas: 5001, bytes: Buffer.byteLength(grande) };
    }, (raiz) => { escreve(raiz, "src/a.js", grande); grandeBlob = git(raiz, "hash-object", "src/a.js"); }), "L2");
  });

  it("funcional: blob do enviado ilegível para o git (objeto apagado) → FALHA evidencia-invalida:L2, nunca medida de 0 bytes", () => {
    const f = forjada(() => undefined);
    const blob = git(f.raiz, "rev-parse", `${f.sha}:src/a.js`);
    rmSync(join(f.raiz, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });
    reprova(f, "L2");
  });

  it("funcional: ok com enviado acima da leitura máxima forjado pequeno → FALHA evidencia-invalida:L2", () => {
    reprova(forjada((ev) => {
      ev["arquivos"]["src/a.js"] = { ...ev["arquivos"]["src/a.js"], blob: grandeBlob, linhas: 2, bytes: 4 };
    }, (raiz) => { escreve(raiz, "src/a.js", "x".repeat(1024 * 1024 + 1)); grandeBlob = git(raiz, "hash-object", "src/a.js"); }), "L2");
  });

  it("funcional: ok com mais de 40 enviados forjado → FALHA evidencia-invalida:L1", () => {
    const nomes = Array.from({ length: 41 }, (_, i) => `src/f${i}.js`);
    reprova(forjada((ev) => {
      for (const f of nomes) ev["arquivos"][f] = { blob: blobs[f], bytes: 2, linhas: 2, revisao: "enviado" };
      ev["chamada"].include = ["src/a.js", ...nomes];
      ev["chamada"].meta = { ...ev["chamada"].meta, reviewed_files: ["src/a.js", ...nomes], total_changed: 42 };
    }, (raiz) => { for (const f of nomes) { escreve(raiz, f, "x\n"); blobs[f] = git(raiz, "hash-object", f); } }), "L1");
  });

  it("funcional: rejeitar não tira a evidência de incompleta", () => {
    const c = cenario();
    escreve(c.raiz, EV, JSON.stringify({ expx_revisao: 2, trabalho: "w", task: "T-01", resultado: "incompleta", motivo: "L1:41",
      arquivos: {}, achados: [{ identidade: "a".repeat(64), estado: "aberto" }], rejeicoes: [] }));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp")).toMatchObject({ rc: 0, out: "T-01 incompleta:L1:41" });
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "incompleta", motivo: "L1:41", achados: [{ estado: "rejeitado" }] });
  });
});
let grandeBlob = "";
const blobs: Record<string, string> = {};

describe("expx-revisao.mjs id de task", () => {
  it("funcional: T-NN.MM (o id da sprintx e da runx) é aceito nos três subcomandos e a evidência vai para revisao/T-NN.MM.json", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01.03");
    expect(r).toMatchObject({ rc: 1, ev: { task: "T-01.03", resultado: "achados" } });
    const id = r.ev.achados[0]?.identidade ?? "";
    expect(roda(c.raiz, "rejeitar", "--task", "T-01.03", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01.03=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01.03 ok" });
    expect(git(c.raiz, "ls-files", "docs")).toBe("docs/entregas/w/revisao/T-01.03.json");
  });

  it.each(["T-01..03", "T-01/03", "T-01\\03", "../x", "T-1.03", "T-01.3", "T-01.03.04", ""])(
    "funcional: id de task %j é uso errado (64) nos três subcomandos e nada é gravado", (task) => {
      const c = cenario();
      const sha = git(c.raiz, "rev-parse", "HEAD");
      expect(revisar(c, "src/a.js", task).rc).toBe(64);
      expect(conferir(c.raiz, "se_disponivel", `${task}=${sha}`).rc).toBe(64);
      expect(roda(c.raiz, "rejeitar", "--task", task, "--identidade", "a".repeat(64), "--motivo", "fp").rc).toBe(64);
      expect(existsSync(join(c.raiz, "docs"))).toBe(false);
    });

  it("funcional: T-NN (legado) continua aceito", () => {
    const c = cenario();
    const sha = git(c.raiz, "rev-parse", "HEAD");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO evidencia-ausente" });
  });
});

describe("expx-revisao.mjs evidência com as issues da CLI: o conferir deriva os achados", () => {
  const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");
  /** `src/a.js` com um achado aberto (linha 3) e um anterior (linha 1), revisado e commitado com a task. */
  function revisada(): { c: Cenario; sha: string } {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js").rc).toBe(1);
    return { c, sha: commita(c.raiz) };
  }
  /** A evidência commitada em `revisada`, editada por `muda` num commit só dela. */
  function editada(muda: (ev: Record<string, any>) => void): { raiz: string; sha: string } {
    const { c } = revisada();
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    return { raiz: c.raiz, sha: commita(c.raiz, true) };
  }
  const reprova = (f: { raiz: string; sha: string }, campo: string) =>
    expect(conferir(f.raiz, "obrigatoria", `T-01=${f.sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });

  it("funcional: o revisar grava as issues cruas, o sha256 do stdout byte a byte e o HEAD", () => {
    const c = cenario({ avisos: "npm warn x\n", issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }] });
    altera3(c.raiz);
    const head = git(c.raiz, "rev-parse", "HEAD");
    const r = revisar(c, "src/a.js");
    const stdout = `npm warn x\n${JSON.stringify({ issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }],
      meta: { reviewed_files: ["src/a.js"], total_changed: 1, skipped: [], capped: false, max_files: 40 }, error: null, noFiles: false })}`;
    expect(r.ev).toMatchObject({ head, chamada: { issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }], stdout_sha256: sha256(stdout) } });
  });

  it("funcional: limite40.json servido byte a byte: stdout_sha256 é o do arquivo da conformidade, e o conferir passa", () => {
    const c = cenario({ fixture: "limite40" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite40"));
    expect(revisar(c, nomes.join(",")).ev.chamada).toMatchObject({ issues: [], stdout_sha256: sha256(respostaDoCaso("limite40")) });
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: evidência íntegra: aberto reprova por achados-abertos; o anterior sozinho passa", () => {
    const { c, sha } = revisada();
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    const c2 = cenario({ issues: [achado("src/a.js", 1)] });
    altera3(c2.raiz);
    expect(revisar(c2, "src/a.js").rc).toBe(0);
    expect(conferir(c2.raiz, "obrigatoria", `T-01=${commita(c2.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it.each([
    ["achado aberto apagado de achados", (ev: Record<string, any>) => { ev["achados"] = ev["achados"].filter((a: any) => a.estado !== "aberto"); ev["resultado"] = "ok"; }],
    ["achado aberto virou anterior", (ev: Record<string, any>) => { ev["achados"][0].estado = "anterior"; ev["resultado"] = "ok"; }],
    ["achado aberto rejeitado sem rejeição gravada", (ev: Record<string, any>) => { ev["achados"][0].estado = "rejeitado"; ev["resultado"] = "ok"; }],
    ["achados vazio", (ev: Record<string, any>) => { ev["achados"] = []; ev["resultado"] = "ok"; }],
    ["linha do achado trocada", (ev: Record<string, any>) => { ev["achados"][0].linha = 1; }],
    ["texto do achado trocado", (ev: Record<string, any>) => { ev["achados"][1].texto = "outro"; }],
    ["achado a mais", (ev: Record<string, any>) => { ev["achados"].push({ ...ev["achados"][1] }); }],
    ["resultado ok com achado aberto", (ev: Record<string, any>) => { ev["resultado"] = "ok"; }],
  ])("funcional: %s → FALHA evidencia-invalida:achados", (_nome, muda) => {
    reprova(editada(muda), "achados");
  });

  it.each([
    ["sem issues", (ev: Record<string, any>) => { delete ev["chamada"].issues; }],
    ["issues que não é lista", (ev: Record<string, any>) => { ev["chamada"].issues = {}; }],
    ["issue nula", (ev: Record<string, any>) => { ev["chamada"].issues = [null]; }],
    ["sem stdout_sha256", (ev: Record<string, any>) => { delete ev["chamada"].stdout_sha256; }],
  ])("funcional: %s (v2 sem as issues) → FALHA evidencia-invalida:chamada", (_nome, muda) => {
    reprova(editada(muda), "chamada");
  });

  it.each([
    ["head ausente", (ev: Record<string, any>) => { delete ev["head"]; }],
    ["head que não é sha", (ev: Record<string, any>) => { ev["head"] = "HEAD"; }],
    ["head inexistente", (ev: Record<string, any>) => { ev["head"] = "0".repeat(40); }],
  ])("funcional: %s → FALHA evidencia-invalida:head", (_nome, muda) => {
    reprova(editada(muda), "head");
  });

  it("funcional: apagar a issue junto com o achado passa: o limite aceito (a defesa é o diff da evidência no PR)", () => {
    const f = editada((ev) => {
      ev["chamada"].issues = ev["chamada"].issues.filter((i: any) => i.start_line !== 3);
      ev["achados"] = ev["achados"].filter((a: any) => a.estado !== "aberto");
      ev["resultado"] = "ok";
    });
    expect(conferir(f.raiz, "obrigatoria", `T-01=${f.sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: rejeição gravada na evidência de outra task do trabalho, no commit, vale para o achado", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-02", [identidade("security", "src/a.js", ["l2", "novo3", "l4"])]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ estado: "rejeitado" }] } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("segurança: evidência aninhada não pode forjar a rejeição de outra task", () => {
    const f = editada((ev) => {
      ev["achados"][0].estado = "rejeitado";
      ev["resultado"] = "ok";
    });
    const ev = evidencia(f.raiz) as Record<string, any>;
    escreve(f.raiz, "docs/entregas/w/revisao/sub/T-02.json", JSON.stringify({
      rejeicoes: [{ identidade: ev["achados"][0].identidade, motivo: "forjada", em: "x" }],
    }));
    const sha = commita(f.raiz, true);
    reprova({ raiz: f.raiz, sha }, "achados");
  });

  it("funcional: --base-commit: o conferir deriva as linhas alteradas desde base_commit", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(1);
    const sha = commita(c.raiz, true);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    const ev = evidencia(c.raiz) as Record<string, any>;
    ev["achados"][0].estado = "anterior";
    ev["resultado"] = "ok";
    escreve(c.raiz, EV, JSON.stringify(ev));
    reprova({ raiz: c.raiz, sha: commita(c.raiz, true) }, "achados");
  });

  it("funcional: CRLF no checkout (core.autocrlf=true): a derivação pelo blob do commit bate com a do disco", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] }, "true");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\nl4\r\nl5\r\n");
    expect(revisar(c, "src/a.js").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });
});

describe("expx-revisao.mjs conferir: a evidência cobre o commit da task", () => {
  const cobre = (raiz: string, sha: string, falta?: string) => expect(conferir(raiz, "obrigatoria", `T-01=${sha}`))
    .toMatchObject(falta ? { rc: 1, out: `T-01 FALHA evidencia-invalida:cobertura:${falta}` } : { rc: 0, out: "T-01 ok" });
  const todos = (raiz: string, msg = "task"): string => { git(raiz, "add", "-A"); git(raiz, "commit", "-q", "-m", msg); return git(raiz, "rev-parse", "HEAD"); };

  it("funcional: segunda passagem com arquivo novo sem revisar → FALHA cobertura:<f>, em qualquer modo; com novo revisar → ok", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const primeira = commita(c.raiz);
    cobre(c.raiz, primeira);
    escreve(c.raiz, "src/b.js", "b\n");
    const sem = commita(c.raiz);
    cobre(c.raiz, sem, "src/b.js");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sem}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura:src/b.js" });
    git(c.raiz, "reset", "-q", "--hard", primeira);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(revisar(c, "src/b.js").rc).toBe(0);
    cobre(c.raiz, commita(c.raiz));
  });

  it("funcional: não revisável, exclusão do núcleo e excluir_da_revisao do commit saem da conta; revisável fora da evidência não", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    todos(c.raiz, "config");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, "logo.png", "png\n");
    escreve(c.raiz, "docs/sprintx/estado.md", "# estado\n");
    escreve(c.raiz, "gerado/saida.js", "x\n");
    cobre(c.raiz, todos(c.raiz));
    escreve(c.raiz, "src/b.js", "b\n");
    cobre(c.raiz, todos(c.raiz, "mais"), "src/b.js");
  });

  it("funcional: arquivo apagado pelo commit e fora da evidência → FALHA cobertura:<f>", () => {
    const c = cenario();
    escreve(c.raiz, "src/b.js", "b\n");
    todos(c.raiz, "b");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    rmSync(join(c.raiz, "src/b.js"));
    cobre(c.raiz, commita(c.raiz), "src/b.js");
  });

  it("funcional: merge como commit da task conta tudo o que ele traz ao primeiro pai", () => {
    const c = cenario();
    git(c.raiz, "checkout", "-q", "-b", "lado");
    escreve(c.raiz, "src/c.js", "c\n");
    todos(c.raiz, "lado");
    git(c.raiz, "checkout", "-q", "main");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    cobre(c.raiz, commita(c.raiz));
    git(c.raiz, "merge", "-q", "--no-ff", "-m", "merge", "lado");
    cobre(c.raiz, git(c.raiz, "rev-parse", "HEAD"), "src/c.js");
  });

  it("funcional: --base-commit: conta também o que mudou desde base_commit, não só o commit da evidência", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(0);
    cobre(c.raiz, commita(c.raiz, true));
    git(c.raiz, "reset", "-q", "--hard", "HEAD~1");
    escreve(c.raiz, "src/b.js", "b\n");
    todos(c.raiz, "outra");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(0);
    cobre(c.raiz, commita(c.raiz, true), "src/b.js");
  });
});

describe("expx-revisao.mjs listar: o que a mergex lê da evidência no commit", () => {
  type Listada = { task: string; commit: string; listagem: string; causa: string | null; resultado: string | null; motivo: string | null;
    rejeitados: unknown[]; rejeicoes: unknown[]; removidos_sem_revisao: string[] };
  const listar = (raiz: string, ...pares: string[]) => {
    const r = roda(raiz, "listar", ...pares.flatMap((p) => ["--task", p]));
    return { rc: r.rc, err: r.err, out: r.out, j: (r.rc === 64 ? undefined : JSON.parse(r.out)) as { expx_revisao_listar: number; trabalho: string; tasks: Listada[] } };
  };
  const vazia = { resultado: null, motivo: null, rejeitados: [], rejeicoes: [], removidos_sem_revisao: [] };
  const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

  it("funcional: achado rejeitado com a rejeição da própria evidência: a saída exata, uma linha de JSON, sai 0", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "falso positivo").rc).toBe(0);
    const sha = commita(c.raiz);
    const r = listar(c.raiz, `T-01=${sha}`);
    expect(r.out.split("\n")).toHaveLength(1);
    expect(r).toMatchObject({ rc: 0, j: { expx_revisao_listar: 1, trabalho: "w", tasks: [{ task: "T-01", commit: sha, listagem: "ok", causa: null,
      resultado: "ok", motivo: null, removidos_sem_revisao: [],
      rejeicoes: [{ identidade: id, motivo: "falso positivo", em: ISO }],
      rejeitados: [{ identidade: id, arquivo: "src/a.js", linha: 3, label: "security", texto: "x", rejeicao: { task: "T-01", motivo: "falso positivo", em: ISO } }] }] } });
    expect(Object.keys(r.j.tasks[0] ?? {})).toEqual(["task", "commit", "listagem", "causa", "resultado", "motivo", "rejeitados", "rejeicoes", "removidos_sem_revisao"]);
  });

  it("funcional: rejeição gravada na evidência de outra task do trabalho: rejeicao aponta a task dela", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    rejeita(c.raiz, "T-02", [id]);
    revisar(c, "src/a.js");
    expect(listar(c.raiz, `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok", resultado: "ok", rejeicoes: [],
      rejeitados: [{ identidade: id, rejeicao: { task: "T-02", motivo: "fp", em: "x" } }] }] } });
  });

  it("funcional: pulos.json (notas.md, manual.pdf, logo.png, package-lock.json, apagado.js) → removidos_sem_revisao [apagado.js]", () => {
    const tarefa = ["notas.md", "manual.pdf", "logo.png", "package-lock.json", "apagado.js"];
    const c = cenario({ resposta: doFixture("pulos", (f) => tarefa.includes(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), tarefa);
    expect(revisar(c, tarefa.join(",")).rc).toBe(0);
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(listar(c.raiz, `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok", resultado: "ok",
      rejeitados: [], rejeicoes: [], removidos_sem_revisao: ["apagado.js"] }] } });
  });

  it("funcional: limite41.json a uma task com f01–f40 → listada, resultado incompleta e motivo sobra:f41.js", () => {
    const c = cenario({ fixture: "limite41" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41")).slice(0, 40);
    expect(revisar(c, nomes.join(",")).rc).toBe(3);
    git(c.raiz, "add", "--", ...nomes, "docs");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(listar(c.raiz, `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok",
      resultado: "incompleta", motivo: "sobra:f41.js", rejeitados: [] }] } });
  });

  it("funcional: evidência inválida para o conferir nunca é listada: listagem invalida com a causa do conferir, listas vazias, sai 1", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Record<string, any>;
    ev["achados"][0].estado = "rejeitado"; // sem a rejeição gravada
    ev["resultado"] = "ok";
    escreve(c.raiz, EV, JSON.stringify(ev));
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:achados" });
    expect(listar(c.raiz, `T-01=${sha}`)).toMatchObject({ rc: 1, j: { tasks: [{ task: "T-01", commit: sha, listagem: "invalida",
      causa: "evidencia-invalida:achados", ...vazia }] } });
  });

  it("funcional: segunda passagem sem novo revisar: invalida por cobertura, como no conferir", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    commita(c.raiz);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(listar(c.raiz, `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, j: { tasks: [{ listagem: "invalida", causa: "evidencia-invalida:cobertura:src/b.js" }] } });
  });

  it("funcional: ausente sai 3; commit inexistente é invalida e sai 1; várias tasks na ordem dada", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(listar(c.raiz, `T-01=${sha}`, `T-02=${sha}`)).toMatchObject({ rc: 3, j: { tasks: [{ task: "T-01", listagem: "ok" },
      { task: "T-02", listagem: "ausente", causa: "evidencia-ausente", ...vazia }] } });
    const zero = "0".repeat(40);
    expect(listar(c.raiz, `T-02=${sha}`, `T-01=${zero}`)).toMatchObject({ rc: 1, j: { tasks: [{ task: "T-02", listagem: "ausente" },
      { task: "T-01", commit: zero, listagem: "invalida", causa: `commit-inexistente:${zero}` }] } });
  });

  it.each([
    ["rejeição sem motivo", (ev: Record<string, any>) => { ev["rejeicoes"] = [{ identidade: "a".repeat(64), em: "x" }]; }, "rejeicoes"],
    ["rejeicoes que não é lista", (ev: Record<string, any>) => { ev["rejeicoes"] = {}; }, "rejeicoes"],
    ["removido que não está nulo em arquivos", (ev: Record<string, any>) => { ev["removidos_sem_revisao"] = ["src/a.js"]; }, "removidos_sem_revisao"],
    ["removidos_sem_revisao ausente", (ev: Record<string, any>) => { delete ev["removidos_sem_revisao"]; }, "removidos_sem_revisao"],
  ])("funcional: %s → conferir FALHA evidencia-invalida:<campo> e listar invalida", (_nome, muda, campo) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });
    expect(listar(c.raiz, `T-01=${sha}`)).toMatchObject({ rc: 1, j: { tasks: [{ listagem: "invalida", causa: `evidencia-invalida:${campo}` }] } });
  });

  it.each([
    ["sem --task", []],
    ["--modo (o listar não depende do modo)", ["--modo", "obrigatoria", "--task", "T-01=abc"]],
    ["task sem sha", ["--task", "T-01"]],
    ["--identidade", ["--task", "T-01=abc", "--identidade", "a".repeat(64)]],
  ])("funcional: uso errado (%s) → 64, sem saída", (_nome, a) => {
    const c = cenario();
    expect(roda(c.raiz, "listar", ...a)).toMatchObject({ rc: 64, out: "" });
  });
});

describe("expx-revisao.mjs conferir e listar: casos de borda da cobertura e da saída", () => {
  it("funcional: clone raso sem o pai do commit da task: FALHA evidencia-invalida:cobertura (não verificável), nunca a árvore inteira", () => {
    const c = cenario();
    escreve(c.raiz, "src/c.js", "c\n");
    expect(revisar(c, "src/c.js").rc).toBe(0);
    commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    const raso = join(temp("expx-raso-"), "r");
    git(tmpdir(), "clone", "-q", "--depth", "1", pathToFileURL(c.raiz).href, raso);
    expect(conferir(raso, "obrigatoria", `T-01=${git(raso, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });

  it("funcional: listar dá motivo null em ok mesmo com motivo gravado", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), motivo: "x" }));
    const r = roda(c.raiz, "listar", "--task", `T-01=${commita(c.raiz)}`);
    expect(r.rc).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ tasks: [{ listagem: "ok", resultado: "ok", motivo: null }] });
  });
});

describe("expx-revisao.mjs conferir: commit com lista de caminhos acima de 1 MiB", () => {
  it("funcional: 5.000 caminhos longos excluídos pelo núcleo (diff > 1 MiB) e o revisável coberto → ok, não cobertura", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    git(c.raiz, "add", "src", "docs");
    const blob = git(c.raiz, "hash-object", "-w", "src/a.js");
    const nome = "n".repeat(200);
    const linhas = Array.from({ length: 5000 }, (_, i) => `100644 ${blob}\tdocs/entregas/w/gerado/${i}-${nome}.txt`).join("\n");
    const r = spawnSync("git", ["update-index", "--index-info"], { cwd: c.raiz, input: `${linhas}\n`, encoding: "utf8" });
    expect(r.status).toBe(0);
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  }, 60000);
});

describe("expx-revisao.mjs conferir: evidência que não se lê e base_commit que não é commit", () => {
  it("funcional: evidência no commit cujo blob o git não lê → FALHA evidencia-invalida em qualquer modo, nunca AVISO evidencia-ausente", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    const blob = git(c.raiz, "rev-parse", `${sha}:${EV}`);
    rmSync(join(c.raiz, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida" });
  });

  it("funcional: indisponivel com modo base-commit e base_commit que não é commit → FALHA evidencia-invalida:cobertura, não AVISO", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01", semCodeant());
    const ev = evidencia(c.raiz) as Record<string, any>;
    expect(ev).toMatchObject({ resultado: "indisponivel", motivo: "cli-ausente" });
    escreve(c.raiz, EV, JSON.stringify({ ...ev, modo: "base-commit", base_commit: "0".repeat(40) }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });
});
