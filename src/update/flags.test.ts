import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { lerLock } from "../nucleo/lock.js";
import { pastaDaSkill } from "./modificacao.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { executarInit } from "../cli/init.js";
import { interpretarFlagsUpdate, AVISO_ROLLBACK, executarUpdate } from "./flags.js";

let p: ProjetoTemporario | undefined;
const repos: string[] = [];
afterEach(() => {
  p?.descartar();
  p = undefined;
  for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** Publica uma versão nova na origem, para haver o que aplicar. */
function novaTag(repo: string, tag: string): void {
  writeFileSync(join(repo, ".claude/skills/sprintx/references/01.md"), `# conteudo de ${tag}\n`);
  const env = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };
  execFileSync("git", ["add", "-A"], { cwd: repo, env });
  execFileSync("git", ["commit", "-q", "-m", `publica ${tag}`], { cwd: repo, env });
  execFileSync("git", ["tag", tag], { cwd: repo });
}

describe("flags do update", () => {
  it("integração: as seis formas de invocação são interpretadas", () => {
    expect(interpretarFlagsUpdate([]).ok).toBe(true);
    const a = interpretarFlagsUpdate(["sprintx", "runx"]);
    expect(a.ok && a.opcoes.skills).toEqual(["sprintx", "runx"]);
    const b = interpretarFlagsUpdate(["--check"]);
    expect(b.ok && b.opcoes.check).toBe(true);
    const c = interpretarFlagsUpdate(["sprintx", "--to", "v2.0.0"]);
    expect(c.ok && c.opcoes.to).toBe("v2.0.0");
    const d = interpretarFlagsUpdate(["--latest"]);
    expect(d.ok && d.opcoes.latest).toBe(true);
    const e = interpretarFlagsUpdate(["--yes"]);
    expect(e.ok && e.opcoes.sim).toBe(true);
  });

  it("funcional: --to sem skill nomeada é recusado, porque fixaria todas de uma vez", () => {
    const r = interpretarFlagsUpdate(["--to", "v2.0.0"]);
    expect(r.ok).toBe(false);
  });

  it("funcional: --check não escreve nada em disco", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });

    const lock = join(p.raiz, ".expx/expx-lock.json");
    const antes = readFileSync(lock, "utf8");
    const r = await executarUpdate({ raiz: p.raiz, check: true, origens: { sprintx: repo } });

    expect(r.aplicou).toBe(false);
    expect(readFileSync(lock, "utf8")).toBe(antes);
  });

  it("funcional: toda execução que aplica cita o rollback pelo versionador", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });

    novaTag(repo, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens: { sprintx: repo } });
    expect(r.aplicou).toBe(true);
    expect(r.atualizadas).toEqual(["sprintx"]);
    expect(r.mensagens.join(" ")).toContain(AVISO_ROLLBACK);
    expect(AVISO_ROLLBACK.toLowerCase()).toContain("versionador");
  });

  it("funcional: o aviso de core.filemode=false do init chega à saída do update", async () => {
    // com hook, a instalação tem executável — sem executável não há o que avisar
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"], hooks: ["sprintx-gancho.sh"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    // o produto é um repositório que ignora o bit de execução: é o caso que
    // versiona 100644 e quebra o hook no primeiro clone
    const env = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: p.raiz, env });
    execFileSync("git", ["config", "core.filemode", "false"], { cwd: p.raiz, env });
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });
    // o `git add` é da PESSOA, não do ExpxDev: é ele que faz o índice registrar
    // 100644 e, com isso, o comando de reparo virar promessa cumprível
    execFileSync("git", ["add", "-A"], { cwd: p.raiz, env });

    novaTag(repo, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens: { sprintx: repo } });
    expect(r.aplicou).toBe(true);
    const saida = r.mensagens.join("\n");
    expect(saida).toContain("core.filemode=false");
    expect(saida).toContain("git update-index --chmod=+x -- ");
  });

  it("funcional: sem interatividade e sem --yes, mostra o que faria e não aplica", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });

    novaTag(repo, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, interativo: false, sim: false, origens: { sprintx: repo } });
    expect(r.aplicou).toBe(false);
    expect(r.mensagens.join(" ")).toContain("nada foi aplicado");
  });

  it("funcional: update preserva origem customizada ao aplicar", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });

    novaTag(repo, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, sim: true });

    expect(r.aplicou).toBe(true);
    expect(r.atualizadas).toEqual(["sprintx"]);
    const lock = JSON.parse(readFileSync(join(p.raiz, ".expx/expx-lock.json"), "utf8")) as {
      skills: { sprintx: { repositorio: string } };
    };
    expect(lock.skills.sprintx.repositorio).toBe(repo);
  });

  it("funcional: falha do init nao informa aplicacao nem skill atualizada", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(repo);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });

    rmSync(join(repo, ".claude/skills/sprintx/SKILL.md"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };
    execFileSync("git", ["add", "-A"], { cwd: repo, env });
    execFileSync("git", ["commit", "-q", "-m", "publica layout invalido"], { cwd: repo, env });
    execFileSync("git", ["tag", "v1.1.0"], { cwd: repo, env });

    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens: { sprintx: repo } });
    expect(r.ok).toBe(false);
    expect(r.aplicou).toBe(false);
    expect(r.atualizadas).toEqual([]);
    expect(r.mensagens).not.toContain(AVISO_ROLLBACK);
  });
});

const ENV_GIT = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };

/** Novo commit na branch, sem tag: é a `main` de uma skill não travada andando. */
function avancarMain(repo: string, arquivo: string, conteudo: string): void {
  writeFileSync(join(repo, arquivo), conteudo);
  execFileSync("git", ["add", "-A"], { cwd: repo, env: ENV_GIT });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "main avanca"], { cwd: repo, env: ENV_GIT });
}

/**
 * Origens por URL `file://`: uma pasta local seria COPIADA com a árvore de
 * trabalho (ver `copiarLocal`), e o caminho por clone e por commit nunca rodaria.
 */
function origensPorUrl(repos: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(repos).map(([n, r]) => [n, pathToFileURL(r).href]));
}

describe("update de uma skill e as outras", () => {
  it("funcional: atualizar uma skill não move a versão das outras, mesmo com a main delas andando", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    const runx = criarRepoSkill({ nome: "runx", tags: [], layout: "plano" });
    repos.push(sprintx, runx);
    const origens = origensPorUrl({ sprintx, runx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens })).ok).toBe(true);
    const antes = lerLock(p.raiz);
    if (!antes.ok) throw new Error(antes.erro);
    const arquivoRunx = join(pastaDaSkill(p.raiz, "runx"), "references", "01.md");
    const conteudoRunx = readFileSync(arquivoRunx, "utf8");

    avancarMain(runx, "skill/references/01.md", "# runx depois da instalacao\n");
    novaTag(sprintx, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], sim: true, origens });

    expect(r.ok).toBe(true);
    expect(r.atualizadas).toEqual(["sprintx"]);
    const depois = lerLock(p.raiz);
    if (!depois.ok) throw new Error(depois.erro);
    expect(depois.lock.skills["sprintx"]?.referencia).toBe("v1.1.0");
    // o bloco inteiro: referência, commit, data e hashes
    expect(depois.lock.skills["runx"]).toEqual(antes.lock.skills["runx"]);
    expect(readFileSync(arquivoRunx, "utf8")).toBe(conteudoRunx);
  });

  it("funcional: --to com SHA completo instala exatamente aquele commit", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(sprintx);
    const origens = origensPorUrl({ sprintx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens })).ok).toBe(true);

    novaTag(sprintx, "v1.1.0");
    const alvo = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sprintx, encoding: "utf8" }).trim();
    novaTag(sprintx, "v1.2.0");
    const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], to: alvo, sim: true, origens });

    expect(r.ok).toBe(true);
    expect(r.aplicou).toBe(true);
    const l = lerLock(p.raiz);
    if (!l.ok) throw new Error(l.erro);
    expect(l.lock.skills["sprintx"]?.commit).toBe(alvo);
    // o conteúdo, sem o fim de linha: no Windows o checkout pode trazer CRLF; o commit exato já está no lock
    const conteudo = readFileSync(join(pastaDaSkill(p.raiz, "sprintx"), "references", "01.md"), "utf8");
    expect(conteudo).toContain("conteudo de v1.1.0");
    expect(conteudo).not.toContain("v1.2.0");
  });

  it("funcional: --to com SHA em maiúsculas é o mesmo commit", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(sprintx);
    const origens = origensPorUrl({ sprintx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens })).ok).toBe(true);

    novaTag(sprintx, "v1.1.0");
    const alvo = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sprintx, encoding: "utf8" }).trim();
    novaTag(sprintx, "v1.2.0");
    const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], to: alvo.toUpperCase(), sim: true, origens });

    expect(r.aplicou).toBe(true);
    const l = lerLock(p.raiz);
    if (!l.ok) throw new Error(l.erro);
    expect(l.lock.skills["sprintx"]?.commit).toBe(alvo);
    expect(l.lock.skills["sprintx"]?.referencia).toBe(alvo);
  });

  it("funcional: skill bloqueada por modificação local não é remontada por cima", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    const runx = criarRepoSkill({ nome: "runx", tags: ["v1.0.0"], layout: "plano" });
    repos.push(sprintx, runx);
    const origens = origensPorUrl({ sprintx, runx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens })).ok).toBe(true);
    const ajuste = join(pastaDaSkill(p.raiz, "runx"), "references", "01.md");
    writeFileSync(ajuste, "# ajuste manual\n");

    novaTag(sprintx, "v1.1.0");
    avancarMain(runx, "skill/references/01.md", "# runx v1.1.0\n");
    execFileSync("git", ["tag", "v1.1.0"], { cwd: runx });
    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens });

    expect(r.ok).toBe(false);
    expect(r.aplicou).toBe(false);
    expect(r.bloqueadas.map((b) => b.nome)).toContain("runx");
    expect(readFileSync(ajuste, "utf8")).toBe("# ajuste manual\n");
  });

  it("funcional: skill fora do filtro com modificação local também barra a remontagem", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    const runx = criarRepoSkill({ nome: "runx", tags: ["v1.0.0"], layout: "plano" });
    repos.push(sprintx, runx);
    const origens = origensPorUrl({ sprintx, runx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens })).ok).toBe(true);
    const ajuste = join(pastaDaSkill(p.raiz, "runx"), "references", "01.md");
    writeFileSync(ajuste, "# ajuste manual\n");

    novaTag(sprintx, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], sim: true, origens });

    expect(r.ok).toBe(false);
    expect(r.aplicou).toBe(false);
    expect(r.bloqueadas.map((b) => b.nome)).toEqual(["runx"]);
    expect(readFileSync(ajuste, "utf8")).toBe("# ajuste manual\n");
    const l = lerLock(p.raiz);
    if (!l.ok) throw new Error(l.erro);
    expect(l.lock.skills["sprintx"]?.referencia).toBe("v1.0.0");
  });

  it("funcional: a única candidata, modificada, não aplica e sai com erro", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    repos.push(sprintx);
    const origens = origensPorUrl({ sprintx });
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens })).ok).toBe(true);
    const ajuste = join(pastaDaSkill(p.raiz, "sprintx"), "references", "01.md");
    writeFileSync(ajuste, "# ajuste manual\n");

    novaTag(sprintx, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens });

    expect(r.ok).toBe(false);
    expect(r.aplicou).toBe(false);
    expect(r.bloqueadas.map((b) => b.nome)).toEqual(["sprintx"]);
    expect(readFileSync(ajuste, "utf8")).toBe("# ajuste manual\n");
    // o --check continua só relatório
    const c = await executarUpdate({ raiz: p.raiz, check: true, origens });
    expect(c.ok).toBe(true);
  });

  for (const forma of ["tag", "sha"] as const) {
    it(`funcional: --to (${forma}) com origem local é recusado, sem escrever nada`, async () => {
      const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
      repos.push(sprintx);
      p = projetoTemporario("fixtures/cli/projeto-limpo");
      expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origensPorUrl({ sprintx }) })).ok).toBe(true);
      novaTag(sprintx, "v1.1.0");
      const alvo = forma === "tag" ? "v1.1.0" : execFileSync("git", ["rev-parse", "HEAD"], { cwd: sprintx, encoding: "utf8" }).trim();
      // a árvore de trabalho anda depois do alvo: a cópia local traria isto, e não o alvo
      writeFileSync(join(sprintx, ".claude/skills/sprintx/references/01.md"), "# edicao nao commitada\n");
      const lock = join(p.raiz, ".expx/expx-lock.json");
      const antes = readFileSync(lock, "utf8");

      const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], to: alvo, sim: true, origens: { sprintx } });

      expect(r.ok).toBe(false);
      expect(r.aplicou).toBe(false);
      expect(r.mensagens.join("\n")).toContain("origem local");
      expect(readFileSync(lock, "utf8")).toBe(antes);
    });
  }

  it("funcional: skill fora do filtro com origem local é copiada da árvore, com aviso de que o commit travado não valeu", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    const runx = criarRepoSkill({ nome: "runx", tags: ["v1.0.0"], layout: "plano" });
    repos.push(sprintx, runx);
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens: origensPorUrl({ sprintx, runx }) })).ok).toBe(true);

    novaTag(sprintx, "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, skills: ["sprintx"], sim: true, origens: { ...origensPorUrl({ sprintx }), runx } });

    expect(r.ok).toBe(true);
    expect(r.mensagens.join("\n")).toMatch(/runx: origem local/);
  });
});
