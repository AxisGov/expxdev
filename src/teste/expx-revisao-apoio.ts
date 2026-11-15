// Apoio compartilhado dos testes de `nucleo/scripts/expx-revisao.mjs`, divididos em
// expx-revisao-1..N.test.ts para o vitest rodá-los em paralelo: sozinho, o arquivo era o
// caminho crítico da suíte no Windows e estourava o limite do job (2026-11-15).
import { expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { ambienteCom, noPath, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { respostaDoCaso, type CasoConformidade } from "../teste/conformidade.js";
import { chamadasDa, instalarCodeantFalsa, nucleoDeTeste, type CfgFalsa, type Falsa } from "../teste/codeant-falsa.js";
// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
export const SCRIPT = join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-revisao.mjs");
// `FATIA_*` de quem roda a suíte faria todo subcomando sair 64: os filhos herdam o ambiente sem elas
// (o caso de `FATIA_*` as passa de propósito)
for (const k of Object.keys(process.env)) if (k.startsWith("FATIA_")) delete process.env[k];
export const criados: string[] = [];
export const temp = (p: string): string => { const d = mkdtempSync(join(tmpdir(), p)); criados.push(d); return d; };
export function git(d: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: d, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
export const escreve = (d: string, rel: string, conteudo: string): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), conteudo); };
/** Repositório com `src/a.js` (l1..l5) commitado, a `codeant` falsa (pacote npm) configurada por `cfg` e o
 *  núcleo de teste, cujo perfil 0.5.14 tem o manifesto da falsa. */
export type Cenario = { raiz: string; falsa: Falsa; script: string };
export function cenario(cfg: CfgFalsa = {}, autocrlf = "false"): Cenario {
  const raiz = temp("expx-revisao-");
  git(raiz, "init", "-q", "-b", "main");
  git(raiz, "config", "core.autocrlf", autocrlf);
  escreve(raiz, "src/a.js", "l1\nl2\nl3\nl4\nl5\n");
  git(raiz, "add", "-A");
  git(raiz, "commit", "-q", "-m", "base");
  const falsa = instalarCodeantFalsa(temp("expx-codeant-"), cfg);
  return { raiz, falsa, script: nucleoDeTeste(temp("expx-nucleo-"), falsa) };
}
export const PATH = process.env["PATH"] ?? process.env["Path"] ?? "";
export type Arquivo = { blob: string; bytes: number; linhas: number; revisao: string };
export type Ev = { resultado: string; motivo?: string; arquivos: Record<string, Arquivo | null>; chamada: unknown; [k: string]: unknown;
  achados: { identidade: string; arquivo: string; linha: number; estado: string }[]; rejeicoes: { identidade: string }[]; removidos_sem_revisao: string[] };
export function revisar(c: Cenario, arquivos: string, task = "T-01", path = `${c.falsa.path}${delimiter}${PATH}`, extra: Record<string, string> = {}, script = c.script, mais: string[] = []) {
  const r = spawnSync(process.execPath, [script, "revisar", "--trabalho", "w", "--task", task, "--arquivos", arquivos, "--raiz", c.raiz, ...mais],
    { encoding: "utf8", env: ambienteCom(path, extra) });
  const ev = join(c.raiz, "docs", "entregas", "w", "revisao", `${task}.json`);
  return { rc: r.status, out: r.stdout, err: r.stderr, ev: (existsSync(ev) ? JSON.parse(readFileSync(ev, "utf8")) : undefined) as Ev,
    chamadas: chamadasDa(c.falsa).map((x) => x.args), registro: chamadasDa(c.falsa) };
}
/** Uma resposta da CLI para `src/a.js`, com `meta` e o topo trocados. */
export const resp = (meta: object = {}, topo: object = {}) => ({ issues: [], meta: { reviewed_files: ["src/a.js"], total_changed: 1, skipped: [],
  capped: false, max_files: 40, ...meta }, error: null, noFiles: false, ...topo });
export const achado = (arquivo: string, linha: number, label = "security") => ({ issue_content: "x", relevant_file: arquivo, start_line: linha, label });
export const identidade = (label: string, arquivo: string, l: string[]) => createHash("sha256").update([label, arquivo, ...l, "0.5.14"].join("\0")).digest("hex");
export const rejeita = (raiz: string, task: string, ids: string[]) =>
  escreve(raiz, `docs/entregas/w/revisao/${task}.json`, JSON.stringify({ expx_revisao: 1, achados: [], rejeicoes: ids.map((identidade) => ({ identidade, motivo: "fp", em: "x" })) }));
export const altera3 = (raiz: string) => escreve(raiz, "src/a.js", "l1\nl2\nnovo3\nl4\nl5\n");
export const grava = (d: string, rel: string, b: Buffer): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), b); };
/** Põe na raiz os arquivos do caso (só `nomes`, se dados); o apagado é commitado antes e removido. Devolve os nomes. */
export function poeCaso(raiz: string, arquivos: Map<string, Buffer | null>, nomes?: string[]): string[] {
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
export type Resposta = { issues: unknown[]; meta: { reviewed_files: string[]; skipped: { file: string; reason: string }[]; total_changed: number }; error: unknown; noFiles: boolean };
/** O JSON da #60; com `fica`, só as entradas dos arquivos que ficam, e `total_changed` refeito. */
export function doFixture(caso: CasoConformidade, fica?: (f: string) => boolean): Resposta {
  const j = JSON.parse(respostaDoCaso(caso).toString("utf8")) as Resposta;
  if (fica) {
    j.meta.reviewed_files = j.meta.reviewed_files.filter(fica);
    j.meta.skipped = j.meta.skipped.filter((s) => fica(s.file));
    j.meta.total_changed = j.meta.reviewed_files.length + j.meta.skipped.length;
  }
  return j;
}
export const semCodeant = (): string => dirname(noPath("git") ?? "");
export const naoChamou = (r: { chamadas: string[][] }) => expect(r.chamadas.filter((a) => a[0] === "review")).toEqual([]);
export const roda =(raiz: string, ...a: string[]) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...a, "--trabalho", "w", "--raiz", raiz], { encoding: "utf8" });
  return { rc: r.status, out: r.stdout.trim(), err: r.stderr };
};
export const conferir = (raiz: string, modo: string, ...pares: string[]) => roda(raiz, "conferir", "--modo", modo, ...pares.flatMap((p) => ["--task", p]));
export const EV = "docs/entregas/w/revisao/T-01.json";
export const evidencia = (raiz: string): unknown => JSON.parse(readFileSync(join(raiz, EV), "utf8"));
/** O commit da task leva a evidência junto (E1); `soEvidencia` deixa o código fora. */
export const commita = (raiz: string, soEvidencia = false): string => {
  git(raiz, "add", "-A", ...(soEvidencia ? ["docs"] : ["src", "docs"]));
  git(raiz, "commit", "-q", "-m", "task");
  return git(raiz, "rev-parse", "HEAD");
};
