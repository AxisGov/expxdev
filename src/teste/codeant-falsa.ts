import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { RAIZ_DO_REPO } from "./candidatos.js";
import { respostaDoCaso, type CasoConformidade } from "./conformidade.js";

/**
 * A CLI do CodeAnt falsa, instalada como o npm instala um pacote global: o pacote `codeant-cli` com o
 * `package.json` e o `src/index.js`, e o executável `codeant` no `PATH` (link no POSIX, shim `.cmd` no
 * Windows). A revisão a localiza, confere a integridade pelo manifesto e a roda pelo `node`, como faria
 * com a real. Cada chamada vai para `<base>/chamadas.jsonl`: os argumentos, o `process.argv[1]` e se ela
 * veio pelo shim.
 */
export interface CfgFalsa {
  versao?: string;
  /** Serve o JSON da #60 cru (o stdout da CLI real, byte a byte). */
  fixture?: CasoConformidade;
  /** Um JSON montado, no lugar da resposta padrão. */
  resposta?: object;
  stderr?: string;
  /** Sem `fixture` nem `resposta`: os achados devolvidos, filtrados pelo `--include`. */
  issues?: object[];
  /** Escreve `[caminho, conteúdo]` (relativo à raiz do projeto) durante a chamada. */
  durante?: [string, string];
  /** Reescreve o arquivo durante a chamada. */
  reescreve?: string;
  /** Altera e restaura um caminho absoluto do checkout original enquanto a revisão lê o snapshot. */
  oscilaOrigem?: [string, string, string];
  /** Texto antes do JSON no stdout (avisos do npm). */
  avisos?: string;
  /** Código de saída; sem ele, 1 se `error` não é nulo e 0 senão. */
  saida?: number;
  /** Milissegundos de espera no `review`, para simular a CLI que trava. */
  dorme?: number;
}

export type LayoutFalsa = "link" | "cmd" | "sh";

export interface Falsa {
  /** A pasta que vai no `PATH`. */
  path: string;
  /** A pasta da falsa (configuração e chamadas). */
  dir: string;
  /** A pasta do pacote `codeant-cli` e o arquivo do `bin` dele. */
  pacote: string;
  bin: string;
  manifesto: Record<string, string>;
  packageJson: { name: string; version: string; bin: { codeant: string } };
}

export interface Chamada {
  args: string[];
  arquivo: string;
  shim: boolean;
  cwd: string;
  conteudos: Record<string, string>;
}

const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function programa(dir: string): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const dir = ${JSON.stringify(dir)};
const a = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(dir + "/cfg.json", "utf8"));
const i = a.indexOf("--include");
const inc = i >= 0 ? a[i + 1].split(",") : [];
if (a[0] === "review" && cfg.oscilaOrigem) fs.writeFileSync(cfg.oscilaOrigem[0], cfg.oscilaOrigem[1]);
const conteudos = Object.fromEntries(inc.map((f) => [f, fs.readFileSync(f, "utf8")]));
fs.appendFileSync(dir + "/chamadas.jsonl", JSON.stringify({ args: a, arquivo: process.argv[1], shim: process.env.EXPX_FALSA_PELO_SHIM === "1", cwd: process.cwd(), conteudos }) + "\\n");
if (a[0] === "review" && cfg.oscilaOrigem) fs.writeFileSync(cfg.oscilaOrigem[0], cfg.oscilaOrigem[2]);
if (a[0] === "--version") { process.stdout.write(cfg.versao + "\\n"); process.exit(0); }
if (a[0] === "review" && cfg.dorme) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cfg.dorme);
if (cfg.durante) fs.writeFileSync(cfg.durante[0], cfg.durante[1]);
if (cfg.reescreve) fs.writeFileSync(cfg.reescreve, "mudou\\n");
if (cfg.stderr) process.stderr.write(cfg.stderr);
let erro = cfg.error ?? null;
let out;
if (fs.existsSync(dir + "/resposta.bin")) out = fs.readFileSync(dir + "/resposta.bin");
else if (cfg.resposta) { out = JSON.stringify(cfg.resposta); erro = cfg.resposta.error ?? null; }
else out = JSON.stringify({ issues: (cfg.issues ?? []).filter((x) => inc.includes(x.relevant_file)),
  meta: { reviewed_files: inc, total_changed: inc.length, skipped: [], capped: false, max_files: 40 }, error: erro, noFiles: inc.length === 0 });
process.stdout.write(cfg.avisos ?? "");
process.stdout.write(out);
process.exitCode = cfg.saida ?? (erro === null ? 0 : 1);
`;
}

/** O shim `.cmd` que o npm (cmd-shim) grava no Windows, marcando a chamada que passa por ele. */
const shimCmd = (alvo: string): string => ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL",
  "CALL :find_dp0", "", "IF EXIST \"%dp0%\\node.exe\" (", "  SET \"_prog=%dp0%\\node.exe\"", ") ELSE (",
  "  SET \"_prog=node\"", "  SET PATHEXT=%PATHEXT:;.JS;=;%", ")", "",
  `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set \"EXPX_FALSA_PELO_SHIM=1\" & "%_prog%"  "%dp0%\\node_modules\\codeant-cli\\${alvo.replace(/\//g, "\\")}" %*`, ""].join("\r\n");

/** O shim `sh` do cmd-shim. */
const shimSh = (alvo: string): string => `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
EXPX_FALSA_PELO_SHIM=1; export EXPX_FALSA_PELO_SHIM
exec node  "$basedir/node_modules/codeant-cli/${alvo}" "$@"
`;

function manifestoDe(pacote: string): Record<string, string> {
  const m: Record<string, string> = {};
  const anda = (d: string): void => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) anda(p);
      else m[relative(pacote, p).split("\\").join("/")] = sha256(readFileSync(p));
    }
  };
  anda(pacote);
  return m;
}

/** Grava a configuração (de novo, para mudar a falsa entre chamadas). */
export function configurarFalsa(falsa: Falsa, cfg: CfgFalsa): void {
  writeFileSync(join(falsa.dir, "cfg.json"), JSON.stringify({ versao: falsa.packageJson.version, ...cfg }));
  // a fixture anterior não sobrevive a uma configuração sem ela
  if (cfg.fixture) writeFileSync(join(falsa.dir, "resposta.bin"), respostaDoCaso(cfg.fixture));
  else rmSync(join(falsa.dir, "resposta.bin"), { force: true });
}

export function instalarCodeantFalsa(base: string, cfg: CfgFalsa = {}, layout: LayoutFalsa = process.platform === "win32" ? "cmd" : "link"): Falsa {
  const prefixo = join(base, "prefixo");
  const pacote = layout === "link" ? join(prefixo, "lib", "node_modules", "codeant-cli") : join(prefixo, "node_modules", "codeant-cli");
  const packageJson = { name: "codeant-cli", version: cfg.versao ?? "0.5.14", bin: { codeant: "src/index.js" } };
  mkdirSync(join(pacote, "src"), { recursive: true });
  writeFileSync(join(pacote, "package.json"), `${JSON.stringify({ ...packageJson, description: "falsa" }, null, 2)}\n`);
  const bin = join(pacote, "src", "index.js");
  writeFileSync(bin, programa(base), { mode: 0o755 });
  writeFileSync(join(pacote, "README.md"), "# codeant-cli falsa\n");
  let path = prefixo;
  if (layout === "link") {
    path = join(prefixo, "bin");
    mkdirSync(path, { recursive: true });
    symlinkSync("../lib/node_modules/codeant-cli/src/index.js", join(path, "codeant"));
  } else if (layout === "cmd") writeFileSync(join(prefixo, "codeant.cmd"), shimCmd("src/index.js"));
  else writeFileSync(join(prefixo, "codeant"), shimSh("src/index.js"), { mode: 0o755 });
  const falsa: Falsa = { path, dir: base, pacote, bin, manifesto: manifestoDe(pacote), packageJson };
  configurarFalsa(falsa, cfg);
  return falsa;
}

/** As chamadas registradas pela falsa. */
export function chamadasDa(falsa: Falsa): Chamada[] {
  try {
    return readFileSync(join(falsa.dir, "chamadas.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Chamada);
  } catch {
    return [];
  }
}

/**
 * Uma cópia de `nucleo/scripts/` em `<base>/nucleo/scripts/` cujo perfil 0.5.14 tem o manifesto e o
 * `package.json` da falsa (a versão fica a do perfil). Devolve o caminho do `expx-revisao.mjs` copiado.
 * Nenhuma variável de ambiente troca o perfil: a falsa só passa na integridade com esta cópia.
 */
export function nucleoDeTeste(base: string, falsa: Falsa): string {
  const scripts = join(base, "nucleo", "scripts");
  mkdirSync(dirname(scripts), { recursive: true });
  cpSync(join(RAIZ_DO_REPO, "nucleo", "scripts"), scripts, { recursive: true });
  const arquivo = join(scripts, "perfis", "codeant-cli-0.5.14.json");
  const perfil = JSON.parse(readFileSync(arquivo, "utf8")) as Record<string, unknown>;
  perfil["manifesto"] = falsa.manifesto;
  perfil["package_json"] = { ...falsa.packageJson, version: "0.5.14" };
  writeFileSync(arquivo, `${JSON.stringify(perfil, null, 2)}\n`);
  return join(scripts, "expx-revisao.mjs");
}
