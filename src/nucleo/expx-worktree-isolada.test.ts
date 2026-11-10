import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";

/**
 * `nucleo/scripts/expx-worktree-isolada.sh` — a detecção da worktree que o Claude Code cria para um subagente com
 * `isolation: "worktree"` (CONTRATO-expx-orquestracao §15): `<raiz>/.claude/worktrees/agent-<id>`, na branch
 * `worktree-agent-<id>`. A F1 da sprintx e o E1 da runx a consultam antes de criar a worktree do trabalho. Cada caso
 * roda o script de verdade no bash dos hooks, num repositório temporário — nunca o `claude`.
 */

const BASH = bashDosHooks();
const SCRIPT = join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-worktree-isolada.sh").replace(/\\/g, "/");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}
/** Um repositório com um commit; `realpathSync.native` para o nome 8.3 do Windows. */
function repo(prefixo = "expx-isolada-"): string {
  const d = realpathSync.native(mkdtempSync(join(tmpdir(), prefixo)));
  criados.push(d);
  git(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, "a.txt"), "a\n");
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", "base");
  return d;
}
/** Uma worktree em `caminho` (relativo à raiz), na branch nova `branch`. */
const worktree = (raiz: string, caminho: string, branch: string): string => {
  git(raiz, "worktree", "add", "-q", "-b", branch, join(raiz, caminho));
  return join(raiz, caminho);
};
const roda = (cwd: string) => {
  const r = spawnSync(BASH, [SCRIPT], { cwd, encoding: "utf8" });
  return { rc: r.status, out: r.stdout };
};

describe("expx-worktree-isolada.sh", () => {
  it("funcional: a worktree do Claude Code (.claude/worktrees/agent-<id>, branch worktree-agent-<id>) → isolada, 0", () => {
    const raiz = repo();
    expect(roda(worktree(raiz, ".claude/worktrees/agent-a458f386d073e6132", "worktree-agent-a458f386d073e6132"))).toEqual({ rc: 0, out: "isolada\n" });
  });

  it("funcional: o checkout principal com espaço no caminho → isolada (o porcelain -z lido inteiro)", () => {
    const raiz = repo("expx isolada com espaço-");
    expect(roda(worktree(raiz, ".claude/worktrees/agent-abc123", "worktree-agent-abc123"))).toEqual({ rc: 0, out: "isolada\n" });
  });

  it("funcional: de uma subpasta da worktree do agente → isolada (vale a raiz dela)", () => {
    const raiz = repo();
    const wt = worktree(raiz, ".claude/worktrees/agent-abc123", "worktree-agent-abc123");
    mkdirSync(join(wt, "sub"));
    expect(roda(join(wt, "sub"))).toEqual({ rc: 0, out: "isolada\n" });
  });

  it.each([
    ["o checkout principal", (raiz: string) => raiz],
    ["worktree humana em outro caminho, com a branch do agente", (raiz: string) => worktree(raiz, "fora/agent-abc123", "worktree-agent-abc123")],
    ["o caminho reservado com outra branch", (raiz: string) => worktree(raiz, ".claude/worktrees/agent-abc123", "feature/x")],
    ["a branch de outro agente", (raiz: string) => worktree(raiz, ".claude/worktrees/agent-abc123", "worktree-agent-def456")],
    ["id fora da forma", (raiz: string) => worktree(raiz, ".claude/worktrees/agent-a.b", "worktree-agent-a.b")],
    ["outra pasta sob .claude/worktrees", (raiz: string) => worktree(raiz, ".claude/worktrees/x/agent-abc123", "worktree-agent-abc123")],
  ])("funcional: %s → 1, sem imprimir", (_nome, onde) => {
    const raiz = repo();
    expect(roda(onde(raiz))).toEqual({ rc: 1, out: "" });
  });

  it("funcional: depois do switch para a branch do trabalho → 1 (a adoção já aconteceu)", () => {
    const raiz = repo();
    const wt = worktree(raiz, ".claude/worktrees/agent-abc123", "worktree-agent-abc123");
    git(wt, "switch", "-q", "-c", "feature/trabalho", "--no-track", "main");
    expect(roda(wt)).toEqual({ rc: 1, out: "" });
  });

  it("funcional: fora de um repositório Git → 1", () => {
    const d = realpathSync.native(mkdtempSync(join(tmpdir(), "expx-isolada-sem-git-")));
    criados.push(d);
    expect(roda(d)).toEqual({ rc: 1, out: "" });
  });

  it("funcional: pasta comum com o nome reservado, sem ser worktree → 1", () => {
    const raiz = repo();
    const d = join(raiz, ".claude", "worktrees", "agent-abc123");
    mkdirSync(d, { recursive: true });
    expect(roda(d)).toEqual({ rc: 1, out: "" });
  });
});
