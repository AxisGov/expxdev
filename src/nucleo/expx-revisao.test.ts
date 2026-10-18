import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
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
function revisar(c: { raiz: string; falsa: string }, arquivos: string, task = "T-01", path = `${c.falsa}${delimiter}${PATH}`) {
  const r = spawnSync(process.execPath, [SCRIPT, "revisar", "--trabalho", "w", "--task", task, "--arquivos", arquivos, "--raiz", c.raiz],
    { encoding: "utf8", env: ambienteCom(path) });
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

  it("funcional: arquivo alterado durante a chamada da CLI → indisponivel", () => {
    const c = cenario({ reescreve: "src/a.js" }); // a falsa reescreve o arquivo antes de responder
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-mudou-durante-revisao" } });
  });
});
