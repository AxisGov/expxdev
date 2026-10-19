import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ambienteCom, noPath, RAIZ_DO_REPO } from "../teste/candidatos.js";

// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa vem
// antes no PATH, responde `--version` e um JSON fixo no `review`, e registra os argumentos recebidos.
const SCRIPT = join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-revisao.mjs");
const criados: string[] = [];
afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });
const temp = (p: string): string => { const d = mkdtempSync(join(tmpdir(), p)); criados.push(d); return d; };

function git(d: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: d, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
const escreve = (d: string, rel: string, conteudo: string): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), conteudo); };

/** Repositório com `src/a.js` (l1..l5) commitado e a `codeant` falsa configurada por `cfg`. */
function cenario(cfg: object = {}, autocrlf = "false"): { raiz: string; falsa: string } {
  const raiz = temp("expx-revisao-");
  git(raiz, "init", "-q", "-b", "main");
  git(raiz, "config", "core.autocrlf", autocrlf);
  escreve(raiz, "src/a.js", "l1\nl2\nl3\nl4\nl5\n");
  git(raiz, "add", "-A");
  git(raiz, "commit", "-q", "-m", "base");
  const falsa = temp("expx-codeant-");
  writeFileSync(join(falsa, "cfg.json"), JSON.stringify({ versao: "0.5.14", issues: [], ...cfg }));
  writeFileSync(join(falsa, "codeant.mjs"), `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const dir = ${JSON.stringify(falsa)}, a = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(dir + "/cfg.json", "utf8"));
appendFileSync(dir + "/chamadas.jsonl", JSON.stringify(a) + "\\n");
if (a[0] === "--version") { console.log(cfg.versao); process.exit(0); }
const inc = a[a.indexOf("--include") + 1].split(",");
if (cfg.durante) writeFileSync(cfg.durante[0], cfg.durante[1]);
if (cfg.reescreve) writeFileSync(cfg.reescreve, "mudou\\n");
process.stdout.write((cfg.avisos ?? "") + JSON.stringify({ issues: cfg.issues.filter((i) => inc.includes(i.relevant_file)),
  meta: { reviewed_files: cfg.reviewed_files ?? inc.length, total_changed: inc.length, skipped: cfg.skipped ?? [], capped: cfg.capped ?? false, max_files: cfg.max_files ?? 40 },
  error: cfg.error ?? null, noFiles: cfg.noFiles ?? false }));
`);
  writeFileSync(join(falsa, "codeant"), `#!/bin/sh\nexec "${process.execPath}" "${falsa}/codeant.mjs" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(falsa, "codeant.cmd"), `@"${process.execPath}" "${join(falsa, "codeant.mjs")}" %*\r\n`);
  return { raiz, falsa };
}
const PATH = process.env["PATH"] ?? process.env["Path"] ?? "";
type Ev = { resultado: string; motivo?: string; arquivos: Record<string, string | null>; lotes: { include: string[] }[];
  achados: { identidade: string; arquivo: string; linha: number; estado: string }[]; rejeicoes: { identidade: string }[]; removidos_sem_revisao: string[] };
function revisar(c: { raiz: string; falsa: string }, arquivos: string, task = "T-01", path = `${c.falsa}${delimiter}${PATH}`, extra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, "revisar", "--trabalho", "w", "--task", task, "--arquivos", arquivos, "--raiz", c.raiz],
    { encoding: "utf8", env: ambienteCom(path, extra) });
  const ev = join(c.raiz, "docs", "entregas", "w", "revisao", `${task}.json`);
  const ch = join(c.falsa, "chamadas.jsonl");
  return { rc: r.status, out: r.stdout, err: r.stderr, ev: (existsSync(ev) ? JSON.parse(readFileSync(ev, "utf8")) : undefined) as Ev,
    chamadas: existsSync(ch) ? readFileSync(ch, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]) : [] };
}
const achado = (arquivo: string, linha: number, label = "security") => ({ issue_content: "x", relevant_file: arquivo, start_line: linha, label });
const identidade = (label: string, arquivo: string, l: string[]) => createHash("sha256").update([label, arquivo, ...l, "0.5.14"].join("\0")).digest("hex");
const rejeita = (raiz: string, task: string, ids: string[]) =>
  escreve(raiz, `docs/entregas/w/revisao/${task}.json`, JSON.stringify({ expx_revisao: 1, achados: [], rejeicoes: ids.map((identidade) => ({ identidade, motivo: "fp", em: "x" })) }));
const altera3 = (raiz: string) => escreve(raiz, "src/a.js", "l1\nl2\nnovo3\nl4\nl5\n");

describe("expx-revisao.mjs revisar", () => {
  it("funcional: achado em linha alterada bloqueia", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.rc).toBe(1);
    expect(r.ev).toMatchObject({ resultado: "achados", achados: [{ arquivo: "src/a.js", linha: 3, estado: "aberto", identidade: identidade("security", "src/a.js", ["l2", "novo3", "l4"]) }] });
    expect(r.ev.arquivos["src/a.js"]).toMatch(/^[0-9a-f]{40}$/);
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
    expect(revisar(c, "src/a.js,src/b.js").chamadas).toEqual([["--version"], ["review", "--uncommitted", "--headless", "--include", "src/a.js,src/b.js"]]);
  });

  it("funcional: lotes pelo meta.max_files; passa só se todos os lotes passam", () => {
    const c = cenario({ max_files: 2, issues: [achado("src/c.js", 1)] });
    for (const f of ["a", "b", "c"]) escreve(c.raiz, `src/${f}.js`, `${f}\n`);
    const r = revisar(c, "src/a.js,src/b.js,src/c.js");
    expect(r.rc).toBe(1);
    expect(r.ev.lotes.map((l) => l.include)).toEqual([["src/a.js", "src/b.js"], ["src/c.js"]]);
  });

  it.each([
    ["CLI ausente", {}, "cli-ausente"],
    ["versão abaixo de 0.5.14", { versao: "0.5.9" }, "versao"],
    ["error não nulo", { error: "falhou" }, "erro"],
    ["capped", { capped: true }, "incompleta"],
    ["noFiles", { noFiles: true }, "incompleta"],
    ["meta.reviewed_files abaixo dos arquivos pedidos", { reviewed_files: 0 }, "incompleta"],
    ["arquivo da task em skipped sem ser por padrão", { skipped: [{ file: "src/a.js", reason: "too large" }] }, "incompleta"],
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
    expect(r.chamadas[1]).toEqual(["review", "--uncommitted", "--headless", "--include", " a.js"]);
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
    expect(r.chamadas[1]).toContain("src/b.js");
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
    const c = cenario({ issues: [achado("src/a.js", 3)], durante: [EV, durante] });
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
    const ch = join(c.falsa, "chamadas.jsonl");
    const rev = new Promise<number | null>((ok) => spawn(process.execPath, [SCRIPT, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js", "--raiz", c.raiz],
      { env: ambienteCom(`${c.falsa}${delimiter}${PATH}`), stdio: "ignore" }).on("close", ok));
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
    expect(r.ev.arquivos["src/a.js"]).toBe(git(c.raiz, "rev-parse", "HEAD:src/a.js"));
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
    expect(r.ev.arquivos[f]).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: arquivo alterado durante a chamada da CLI → indisponivel", () => {
    const c = cenario({ reescreve: "src/a.js" }); // a falsa reescreve o arquivo antes de responder
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-mudou-durante-revisao" } });
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
    ["lotes vazio com arquivo presente", { lotes: [] }, "lotes"],
    ["sem lotes", { lotes: undefined }, "lotes"],
    ["lote sem meta", { lotes: [{ include: ["src/a.js"], error: null }] }, "lotes"],
    ["lote com erro",{ lotes: [{ include: ["src/a.js"], meta: {}, error: "x" }] }, "lotes"],
    ["lotes que não incluem o arquivo presente", { lotes: [{ include: ["src/b.js"], meta: {}, error: null }] }, "lotes"],
  ])("funcional: ok sem sinal de que a CLI rodou (%s) é FALHA evidencia-invalida nomeando o campo", (_nome, troca, campo) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), ...troca }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });
  });

  it("funcional: achados sem cli.versao é evidencia-invalida; versão 0.10.0 compara por número e passa", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), cli: {} }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
    const d = cenario({ versao: "0.10.0" });
    altera3(d.raiz);
    revisar(d, "src/a.js");
    expect(conferir(d.raiz, "obrigatoria", `T-01=${commita(d.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: indisponivel não exige cli.versao, executada_em nem lotes", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01", dirname(noPath("git") ?? ""));
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", motivo: "cli-ausente", cli: { versao: null }, lotes: [] });
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
      spawn(process.execPath, [SCRIPT, ...a, "--trabalho", "w", "--raiz", c.raiz], { env, stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const rev = filho(["revisar", "--task", "T-01", "--arquivos", "src/a.js"], ambienteCom(`${c.falsa}${delimiter}${PATH}`, { EXPX_REVISAO_TESTE_PAUSA: dir }));
    for (const ate = Date.now() + 20000; !existsSync(join(dir, "pronto")) && Date.now() < ate;) await espera(50);
    const rej = filho(["rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp"]);
    await espera(1500); // sem a trava, o rejeitar grava aqui, com o revisar parado, e o revisar o apaga
    writeFileSync(join(dir, "continuar"), "");
    expect([await rev, await rej]).toEqual([1, 0]);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: trava velha: quem a julgou abandonada não remove a trava nova de outro processo", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava);
    utimesSync(trava, new Date(0), new Date(0)); // de processo que morreu
    const [pb, pa] = [temp("expx-pausa-"), temp("expx-pausa-")];
    // o rejeitar para logo depois do primeiro stat que acha a trava velha, antes de removê-la
    writeFileSync(join(pb, "pre.mjs"), `import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const dir = ${JSON.stringify(pb)}, stat = fs.statSync; let uma = false;
fs.statSync = (...a) => { const r = stat(...a);
  if (!uma && String(a[0]).endsWith(".trava") && Date.now() - r.mtimeMs > 120000) { uma = true; fs.writeFileSync(dir + "/pronto", "");
    for (const ate = Date.now() + 20000; Date.now() < ate && !fs.existsSync(dir + "/continuar");) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  return r; };
syncBuiltinESMExports();
`);
    const filho = (a: string[], env?: NodeJS.ProcessEnv) => new Promise<number | null>((ok) =>
      spawn(process.execPath, [...a, "--trabalho", "w", "--raiz", c.raiz], { env, stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const pronto = async (d: string) => { for (const ate = Date.now() + 20000; !existsSync(join(d, "pronto")) && Date.now() < ate;) await espera(50); };
    const rej = filho(["--import", pathToFileURL(join(pb, "pre.mjs")).href, SCRIPT, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp"]);
    await pronto(pb);
    // o revisar remove a trava velha, toma a sua e para entre a releitura e a gravação
    const rev = filho([SCRIPT, "revisar", "--task", "T-01", "--arquivos", "src/a.js"], ambienteCom(`${c.falsa}${delimiter}${PATH}`, { EXPX_REVISAO_TESTE_PAUSA: pa }));
    await pronto(pa);
    writeFileSync(join(pb, "continuar"), "");
    await espera(1500); // sem a correção, o rejeitar remove aqui a trava do revisar, grava, e o revisar o apaga
    writeFileSync(join(pa, "continuar"), "");
    expect([await rev, await rej]).toEqual([1, 0]);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] });
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
