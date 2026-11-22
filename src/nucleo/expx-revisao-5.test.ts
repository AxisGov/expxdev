// `nucleo/scripts/expx-revisao.mjs`: o modo retroativo (`revisar --retroativa --commits`), para tasks commitadas antes do
// E0 sem evidência. A revisão é feita agora sobre o HEAD e vai num commit só de evidências; o `conferir` cobra que nada de
// produto mudou depois do HEAD revisado e a cobertura pelos commits da task.
// Parte 5; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { delimiter, join } from "node:path";
import { ambienteCom } from "../teste/candidatos.js";
import { chamadasDa } from "../teste/codeant-falsa.js";
import { criados, git, escreve, cenario, PATH, revisar, altera3, conferir, EV, evidencia, commita, type Cenario, type Ev } from "../teste/expx-revisao-apoio.js";

afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });

const commit = (raiz: string, msg: string, ...caminhos: string[]): string => {
  git(raiz, "add", ...(caminhos.length > 0 ? caminhos : ["-A"]));
  git(raiz, "commit", "-q", "-m", msg);
  return git(raiz, "rev-parse", "HEAD");
};
/** `revisar --retroativa` (com `--commits` se dado) e a evidência da `task`. */
function retro(c: Cenario, commits: string | null, mais: string[] = [], task = "T-01") {
  const r = spawnSync(process.execPath, [c.script, "revisar", "--trabalho", "w", "--task", task, "--retroativa",
    ...(commits === null ? [] : ["--commits", commits]), "--raiz", c.raiz, ...mais], { encoding: "utf8", env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`, {}) });
  const ev = join(c.raiz, "docs", "entregas", "w", "revisao", `${task}.json`);
  return { rc: r.status, out: r.stdout, err: r.stderr, ev: (existsSync(ev) ? JSON.parse(readFileSync(ev, "utf8")) : undefined) as Ev,
    chamadas: chamadasDa(c.falsa).map((x) => x.args) };
}
/** A task de dois commits (c1: `src/a.js`, `src/b.js` novo e uma nota em `docs/entregas`; c2: `src/b.js`), já no HEAD. */
function tarefa() {
  const c = cenario();
  const base = git(c.raiz, "rev-parse", "HEAD");
  altera3(c.raiz);
  escreve(c.raiz, "src/b.js", "b1\n");
  escreve(c.raiz, "docs/entregas/w/notas.md", "n\n");
  const c1 = commit(c.raiz, "c1");
  escreve(c.raiz, "src/b.js", "b1\nb2\n");
  const c2 = commit(c.raiz, "c2");
  return { c, base, c1, c2 };
}
const reescreve = (raiz: string, muda: (ev: Record<string, any>) => void) => {
  const ev = evidencia(raiz) as Record<string, any>;
  muda(ev);
  escreve(raiz, EV, JSON.stringify(ev, null, 2));
};

describe("expx-revisao.mjs revisar --retroativa", () => {
  it("funcional: grava modo retroativa, commits_da_task (sha completo, na ordem dada), base_commit (1o pai do 1o) e head; arquivos = união dos diffs menos os excluídos", () => {
    const { c, base, c1, c2 } = tarefa();
    const r = retro(c, `${c1.slice(0, 10)},${c2}`);
    expect(r.rc).toBe(0);
    expect(r.out.trim()).toBe("T-01 ok");
    expect(r.ev).toMatchObject({ modo: "retroativa", commits_da_task: [c1, c2], base_commit: base, head: c2, resultado: "ok" });
    expect(Object.keys(r.ev.arquivos).sort()).toEqual(["src/a.js", "src/b.js"]);
    expect(r.ev.arquivos["src/b.js"]?.blob).toBe(git(c.raiz, "rev-parse", `${c2}:src/b.js`));
    const review = r.chamadas.find((a) => a[0] === "review") ?? [];
    expect(review[review.indexOf("--base-commit") + 1]).toBe(base);
  });

  it("funcional: conferir e listar aceitam a evidência num commit só de evidência sobre o HEAD revisado", () => {
    const { c, c1, c2 } = tarefa();
    expect(retro(c, `${c1},${c2}`).rc).toBe(0);
    const sha = commita(c.raiz, true);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    const l = spawnSync(process.execPath, [c.script, "listar", "--trabalho", "w", "--task", `T-01=${sha}`, "--raiz", c.raiz], { encoding: "utf8" });
    expect(l.status).toBe(0);
    expect(JSON.parse(l.stdout)).toMatchObject({ tasks: [{ listagem: "ok", resultado: "ok" }] });
  });

  it("funcional: commit posterior ao HEAD revisado que muda produto fora da evidência → FALHA evidencia-invalida:retroativa-produto:<arquivo>", () => {
    const { c, c1, c2 } = tarefa();
    retro(c, `${c1},${c2}`);
    escreve(c.raiz, "src/z.js", "z\n");
    commit(c.raiz, "depois", "src");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:retroativa-produto:src/z.js" });
  });

  it("funcional: commit posterior que muda um arquivo revisado → FALHA evidencia-nao-bate", () => {
    const { c, c1, c2 } = tarefa();
    retro(c, `${c1},${c2}`);
    escreve(c.raiz, "src/b.js", "b1\nb2\nb3\n");
    commit(c.raiz, "depois", "src");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/b.js" });
  });

  it("funcional: evidência sem um arquivo que os commits da task tocam → FALHA evidencia-invalida:cobertura:<arquivo>", () => {
    const { c, c1, c2 } = tarefa();
    retro(c, `${c1},${c2}`);
    reescreve(c.raiz, (ev) => { delete ev.arquivos["src/b.js"]; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura:src/b.js" });
  });

  it("funcional: commits_da_task com commit que não é ancestral do head → FALHA evidencia-invalida:retroativa-commits", () => {
    const { c, base, c1, c2 } = tarefa();
    retro(c, `${c1},${c2}`);
    const lado = git(c.raiz, "commit-tree", `${base}^{tree}`, "-p", base, "-m", "lado");
    reescreve(c.raiz, (ev) => { ev.commits_da_task = [lado, c2]; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:retroativa-commits" });
  });

  it("funcional: uso 64 com --retroativa e --arquivos, sem --commits, com merge na lista ou commit fora do HEAD; nada gravado", () => {
    const { c, base, c1, c2 } = tarefa();
    expect(retro(c, `${c1},${c2}`, ["--arquivos", "src/a.js"])).toMatchObject({ rc: 64, ev: undefined });
    expect(retro(c, `${c1},${c2}`, ["--base-commit", base])).toMatchObject({ rc: 64, ev: undefined });
    expect(retro(c, null)).toMatchObject({ rc: 64, ev: undefined });
    const lado = git(c.raiz, "commit-tree", `${base}^{tree}`, "-p", base, "-m", "lado");
    expect(retro(c, `${c1},${lado}`)).toMatchObject({ rc: 64, ev: undefined });
    git(c.raiz, "merge", "-q", "--no-ff", "-m", "merge", lado);
    const merge = git(c.raiz, "rev-parse", "HEAD");
    const r = retro(c, `${c1},${c2},${merge}`);
    expect(r).toMatchObject({ rc: 64, ev: undefined });
    expect(r.err).toContain("merge");
  });

  it("funcional: ao lado da retroativa, os modos uncommitted e base-commit continuam como eram (sem commits_da_task) e conferem", () => {
    const { c, base, c1, c2 } = tarefa();
    expect(retro(c, `${c1},${c2}`, [], "T-02")).toMatchObject({ rc: 0, ev: { modo: "retroativa" } });
    const comBase = revisar(c, "src/a.js,src/b.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(comBase).toMatchObject({ rc: 0, ev: { modo: "base-commit", base_commit: base, head: c2 } });
    expect(comBase.ev).not.toHaveProperty("commits_da_task");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    escreve(c.raiz, "src/c.js", "c\n");
    const semBase = revisar(c, "src/c.js", "T-03");
    expect(semBase).toMatchObject({ rc: 0, ev: { modo: "uncommitted", base_commit: null } });
    expect(semBase.ev).not.toHaveProperty("commits_da_task");
    expect(conferir(c.raiz, "obrigatoria", `T-03=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-03 ok" });
  });
});
