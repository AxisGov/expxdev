import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O Codex falso da escala (contrato expx-revisao, "Escala para o Codex"), instalado como o `codex` que o núcleo acha no
 * `PATH`, sem gancho no núcleo: no POSIX, o executável `codex` com o `node` absoluto no shebang; no Windows, o
 * `codex.cmd` do npm com o alvo `node_modules/@openai/codex/bin/codex.js`, que o núcleo roda pelo `node`. Responde a
 * `--version`, a `login status` e a `exec`; no `exec`, grava a resposta configurada no arquivo do `-o`. Cada chamada vai
 * para `<base>/chamadas.jsonl`: os argumentos, o `cwd` e o texto recebido no stdin.
 */
export interface CfgCodex {
  versao?: string;
  /** `false`: `login status` sai 1. */
  logado?: boolean;
  /** A resposta do `exec`: objeto vira JSON; texto vai como está. */
  resposta?: object | string;
  /** Código de saída do `exec`. */
  saida?: number;
  /** Milissegundos de espera no `exec`, para simular o Codex que trava. */
  dorme?: number;
}

export interface Codex {
  /** A pasta que vai no `PATH`. */
  path: string;
  /** O arquivo que o núcleo roda e mede (o executável no POSIX, o alvo do shim no Windows). */
  executavel: string;
  dir: string;
}

export interface ChamadaCodex {
  args: string[];
  cwd: string;
  stdin: string;
}

const programa = (dir: string): string => `const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
const cfg = JSON.parse(fs.readFileSync(path.join(dir, "cfg.json"), "utf8"));
const a = process.argv.slice(2);
if (a[0] === "--version") { process.stdout.write("codex-cli " + (cfg.versao ?? "0.163.0") + "\\n"); process.exit(0); }
if (a[0] === "login" && a[1] === "status") process.exit(cfg.logado === false ? 1 : 0);
if (a[0] !== "exec") process.exit(2);
const stdin = fs.readFileSync(0, "utf8");
fs.appendFileSync(path.join(dir, "chamadas.jsonl"), JSON.stringify({ args: a, cwd: process.cwd(), stdin }) + "\\n");
if (cfg.dorme) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cfg.dorme);
if (cfg.saida) process.exit(cfg.saida);
const o = a[a.indexOf("-o") + 1];
const r = cfg.resposta ?? { arquivos_revisados: [], issues: [] };
fs.writeFileSync(o, typeof r === "string" ? r : JSON.stringify(r));
`;

export function instalarCodexFalso(base: string, cfg: CfgCodex = {}): Codex {
  const path = join(base, "bin");
  mkdirSync(path, { recursive: true });
  let executavel: string;
  if (process.platform === "win32") {
    const alvo = join(path, "node_modules", "@openai", "codex", "bin");
    mkdirSync(alvo, { recursive: true });
    executavel = join(alvo, "codex.js");
    writeFileSync(executavel, programa(base));
    writeFileSync(join(path, "codex.cmd"), '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n');
  } else {
    executavel = join(path, "codex");
    writeFileSync(executavel, `#!${process.execPath}\n${programa(base)}`, { mode: 0o755 });
  }
  const codex = { path, executavel, dir: base };
  configurarCodex(codex, cfg);
  return codex;
}

export function configurarCodex(codex: Codex, cfg: CfgCodex): void {
  writeFileSync(join(codex.dir, "cfg.json"), JSON.stringify(cfg));
}

export function chamadasDoCodex(codex: Codex): ChamadaCodex[] {
  try {
    return readFileSync(join(codex.dir, "chamadas.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as ChamadaCodex);
  } catch {
    return [];
  }
}
