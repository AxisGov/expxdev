import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";

/**
 * `nucleo/hooks/expx-rastro.sh`, a biblioteca de rastro que o plugin distribui
 * e os hooks carregam com `source`. Cada caso roda a função de verdade no bash
 * dos hooks: a raiz do repositório, o escape de JSON, as chaves `fase`/`task` e
 * a escolha do trabalho.
 */

// o bash do Git, nunca o primeiro do PATH: no Windows ele pode ser o do WSL
const BASH = bashDosHooks();
const RASTRO = join(RAIZ_DO_REPO, "nucleo", "hooks", "expx-rastro.sh").replace(/\\/g, "/");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-rastro-"));
  criados.push(d);
  return d;
}

/** Roda `corpo` num bash que já fez `source` do rastro, em `cwd`. */
function roda(cwd: string, corpo: string, env: Record<string, string> = {}): string {
  const semExpx: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("EXPX_")) semExpx[k] = v;
  const r = spawnSync(BASH, ["-c", `. "$1"\n${corpo}`, "rastro", RASTRO], {
    cwd,
    encoding: "utf8",
    env: { ...semExpx, ...env },
  });
  if (r.status !== 0) throw new Error(`bash saiu ${String(r.status)}: ${r.stderr}`);
  return r.stdout;
}

function git(dir: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** As linhas de `docs/eventos/*.jsonl`, por arquivo. */
function eventos(raiz: string): Record<string, string[]> {
  const dir = join(raiz, "docs", "eventos");
  const out: Record<string, string[]> = {};
  for (const f of readdirSync(dir)) out[f] = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => l !== "");
  return out;
}

describe("expx_raiz", () => {
  it("funcional: numa worktree vinculada (.git é ARQUIVO), de um subdiretório, devolve a raiz da worktree", () => {
    const raiz = temp();
    writeFileSync(join(raiz, ".git"), "gitdir: /em/outro/lugar/.git/worktrees/w\n");
    const sub = join(raiz, "src", "fundo");
    mkdirSync(sub, { recursive: true });

    const out = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd ../.. && pwd)"');
    const [achada, esperada] = out.split("\n");
    expect(achada).toBe(esperada);
  });

  it("funcional: com .git diretório continua achando a raiz", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    const sub = join(raiz, "a");
    mkdirSync(sub);
    const [achada, esperada] = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd .. && pwd)"').split("\n");
    expect(achada).toBe(esperada);
  });
});

