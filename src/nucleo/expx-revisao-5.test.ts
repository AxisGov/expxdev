// `nucleo/scripts/expx-revisao.mjs`: o modo retroativo (`revisar --retroativa --commits`), para tasks commitadas antes do
// E0 sem evidência. A revisão é feita agora sobre o HEAD e vai num commit só de evidências; o `conferir` cobra que nada de
// produto mudou depois do HEAD revisado e a cobertura pelos commits da task.
// Parte 5; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { ambienteCom, noPath } from "../teste/candidatos.js";
import { chamadasDa } from "../teste/codeant-falsa.js";
import { chamadasDoCodex, instalarCodexFalso, type CfgCodex } from "../teste/codex-falso.js";
import { criados, temp, git, escreve, cenario, PATH, revisar, altera3, conferir, EV, evidencia, commita, type Cenario, type Ev } from "../teste/expx-revisao-apoio.js";

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

  it("funcional: task que só toca arquivo não revisável (manual.pdf) ganha evidência sem a CLI e confere, em vez de uso 64", () => {
    const c = cenario();
    escreve(c.raiz, "docs/manual.pdf", "%PDF-1.4\n");
    const c1 = commit(c.raiz, "pdf");
    const r = retro(c, c1);
    expect(r.rc).toBe(0);
    expect(Object.keys(r.ev.arquivos)).toEqual(["docs/manual.pdf"]);
    expect(r.ev.arquivos["docs/manual.pdf"]?.revisao).toBe("nao-revisavel");
    expect(r.chamadas.some((a) => a[0] === "review")).toBe(false);
    const sha = commita(c.raiz, true);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
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

describe("expx-revisao.mjs: o sandbox do Codex no Windows", () => {
  const SEM_CODEANT = dirname(noPath("git") ?? "");
  /** A escala com o Codex falso (`cfg`), sem a CodeAnt no PATH, e o CODEX_HOME com o `config.toml` dado (null: sem arquivo). */
  function escalaComConfig(cfg: CfgCodex, config: string | null, plataforma = "win32") {
    const c = cenario();
    const codex = instalarCodexFalso(temp("expx-codex-"), cfg);
    const home = temp("expx-codex-home-");
    if (config !== null) writeFileSync(join(home, "config.toml"), config);
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", `${codex.path}${delimiter}${SEM_CODEANT}`, { CODEX_HOME: home, EXPX_REVISAO_TESTE_PLATAFORMA: plataforma });
    const args = chamadasDoCodex(codex)[0]?.args ?? [];
    return { r, sandbox:args.filter((a, i) => args[i - 1] === "-c" && a.startsWith("windows.sandbox")) };
  }
  const vazia = { resposta: { arquivos_revisados: [], issues: [] } };

  it.each<[string, string | null, string, string[]]>([
    ["tabela [windows] com comentário", '[windows]\nsandbox = "elevated" # o padrão recusa processos\n[outra]\nx = "y"\n', "win32", ['windows.sandbox="elevated"']],
    ["chave pontuada no topo", 'model = "o3"\nwindows.sandbox = "unelevated"\n', "win32", ['windows.sandbox="unelevated"']],
    ["chave só comentada ou em outra tabela", '# windows.sandbox = "elevated"\n[outra]\nsandbox = "elevated"\n[windows.mais]\nsandbox = "elevated"\n', "win32", []],
    ["valor inválido", '[windows]\nsandbox = "Elevated; x"\n', "win32", []],
    ["config ausente", null, "win32", []],
    ["fora do Windows", '[windows]\nsandbox = "elevated"\n', "linux", []],
  ])("funcional: %s → -c windows.sandbox repassado só quando a chave é válida no Windows", (_n, config, plataforma, esperado) => {
    const { r, sandbox } = escalaComConfig({ resposta: { arquivos_revisados: ["src/a.js"], issues: [] } }, config, plataforma);
    expect(r).toMatchObject({ rc: 0, ev: { expx_revisao: 3, resultado: "ok" } });
    expect(sandbox).toEqual(esperado);
  });

  it("funcional: \"blocked by policy\" e resposta vazia → indisponivel:<CodeAnt>+codex-sandbox-bloqueado, que o conferir aceita", () => {
    const c = cenario();
    const codex = instalarCodexFalso(temp("expx-codex-"), { ...vazia, stderr: "exec_command failed: CreateProcess rejected: blocked by policy\n" });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", `${codex.path}${delimiter}${SEM_CODEANT}`, { CODEX_HOME: temp("expx-codex-home-") });
    expect(r.rc).toBe(2);
    expect(r.out.trim()).toBe("T-01 indisponivel:cli-ausente+codex-sandbox-bloqueado");
    expect(r.ev).toMatchObject({ expx_revisao: 3, resultado: "indisponivel", motivo: "cli-ausente+codex-sandbox-bloqueado", escala: { de: "codeant", motivo: "cli-ausente" } });
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA indisponivel:cli-ausente+codex-sandbox-bloqueado" });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:cli-ausente+codex-sandbox-bloqueado" });
  });

  it("funcional: resposta vazia sem \"blocked by policy\" continua codex-saida-invalida", () => {
    const c = cenario();
    const codex = instalarCodexFalso(temp("expx-codex-"), vazia);
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", `${codex.path}${delimiter}${SEM_CODEANT}`, { CODEX_HOME: temp("expx-codex-home-") });
    expect(r).toMatchObject({ rc: 2, ev: { motivo: "cli-ausente+codex-saida-invalida" } });
  });
});
