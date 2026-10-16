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

describe("expx_json_escape", () => {
  it("funcional: todo controle U+0001–U+001F sai escapado, e a string volta igual pelo JSON", () => {
    const d = temp();
    // todos os controles que cabem numa variavel de shell (o NUL nao cabe)
    const out = roda(d, "s=''; for i in $(seq 1 31); do printf -v o '\\\\%03o' \"$i\"; printf -v c '%b' \"$o\"; s=\"$s$c\"; done; expx_json_escape \"a${s}z\\\\\\\"\"");
    expect(out).not.toMatch(/[\u0000-\u001f]/);
    const original = `a${Array.from({ length: 31 }, (_, i) => String.fromCharCode(i + 1)).join("")}z\\"`;
    expect(JSON.parse(`"${out}"`)).toBe(original);
  });

  it("integração: detalhe com ESC (cor de terminal) grava uma linha JSON válida", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    roda(raiz, "EXPX_TRABALHO_ID=t expx_rastro_grava \"$PWD\" acao_permitida hook permitido $'\\033[31mvermelho\\033[0m\\001'");
    const [linha] = eventos(raiz)["t.jsonl"] ?? [];
    expect((JSON.parse(linha ?? "") as { detalhe: string }).detalhe).toBe("\u001b[31mvermelho\u001b[0m\u0001");
  });
});

describe("fase e task", () => {
  it("funcional: EXPX_FASE e EXPX_TASK saem como string JSON; ausentes, null", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x', {
      EXPX_TRABALHO_ID: "t",
      EXPX_FASE: "f6",
      EXPX_TASK: 'T-01.01 "x"',
    });
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido y', { EXPX_TRABALHO_ID: "t" });
    const [com, sem] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as { fase: unknown; task: unknown });
    expect(com).toMatchObject({ fase: "f6", task: 'T-01.01 "x"' });
    expect(sem).toMatchObject({ fase: null, task: null });
  });
});

describe("expx_trabalho_id", () => {
  /** Repositório com duas features ativas; `a` é a mais recente por mtime. */
  function duasFeatures(branch: string): string {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", branch);
    for (const [slug, quando] of [["a", 2_000_000_000], ["b", 1_000_000_000]] as const) {
      const dir = join(raiz, "docs", "sprintx", "features", slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "ORQUESTRADOR.md"), `# ${slug}\n`);
      utimesSync(join(dir, "ORQUESTRADOR.md"), quando, quando);
    }
    return raiz;
  }

  it("funcional: na branch feature/<slug> o trabalho é o slug, não o ORQUESTRADOR.md mais recente", () => {
    const raiz = duasFeatures("feature/b");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("b");
  });

  it("funcional: numa worktree vinculada a branch vem do HEAD dela", () => {
    const raiz = duasFeatures("main");
    git(raiz, "add", "-A");
    git(raiz, "commit", "-q", "-m", "base");
    const wt = join(temp(), "wt");
    git(raiz, "worktree", "add", "-q", "-b", "feature/b", wt);
    utimesSync(join(wt, "docs", "sprintx", "features", "a", "ORQUESTRADOR.md"), 2_000_000_000, 2_000_000_000);
    expect(roda(join(wt, "docs"), 'expx_trabalho_id "$(expx_raiz)"').trimEnd()).toBe("b");
  });

  it("funcional: dois trabalhos e branch que não casa vão para sem-trabalho, nunca para o mais recente", () => {
    const raiz = duasFeatures("main");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("sem-trabalho");
  });

  it("integração: com dois trabalhos e sem branch que case, o evento grava em sem-trabalho.jsonl", () => {
    const raiz = duasFeatures("main");
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x');
    expect(Object.keys(eventos(raiz))).toEqual(["sem-trabalho.jsonl"]);
  });

  it("funcional: com um trabalho só, mesmo sem branch que case, o evento vai para ele", () => {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", "main");
    mkdirSync(join(raiz, "docs", "sprintx", "features", "unico"), { recursive: true });
    writeFileSync(join(raiz, "docs", "sprintx", "features", "unico", "ORQUESTRADOR.md"), "# unico\n");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("unico");
  });

  it("funcional: sem ORQUESTRADOR.md nenhum, sem-trabalho", () => {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", "feature/x");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("sem-trabalho");
  });

  it("funcional: EXPX_TRABALHO_ID continua vencendo a branch", () => {
    const raiz = duasFeatures("feature/b");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"', { EXPX_TRABALHO_ID: "outro" }).trimEnd()).toBe("outro");
  });
});
