import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { buscarSkill } from "./busca.js";

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe("busca da skill por clone raso", () => {
  it("integração: clona na tag alvo e o SKILL.md existe no destino", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v1.2.0"] });
    criados.push(repo);
    const r = await buscarSkill({ nome: "sprintx", repositorio: repo, referencia: "v1.2.0" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    expect(existsSync(join(r.caminho, ".claude/skills/sprintx/SKILL.md"))).toBe(true);
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: a tag pedida traz o conteúdo daquela tag, não o da mais recente", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v1.2.0"] });
    criados.push(repo);
    const r = await buscarSkill({ nome: "sprintx", repositorio: repo, referencia: "v1.0.0" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    const ref = readFileSync(join(r.caminho, ".claude/skills/sprintx/references/01.md"), "utf8");
    expect(ref).toContain("v1.0.0");
    expect(ref).not.toContain("v1.2.0");
  });

  it("funcional: repositório inexistente devolve falha nomeando a skill, sem lançar", async () => {
    const r = await buscarSkill({
      nome: "fantasma",
      repositorio: "/caminho/inexistente/x.git",
      referencia: "main",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.nome).toBe("fantasma");
    expect(r.erro).not.toBe("");
  });
});

/**
 * Desenvolvimento das skills: pegar o que está EM DISCO, não o commitado.
 *
 * Com `git clone` a alteração só chega depois do commit — e o ponto do
 * `EXPX_SKILLS_LOCAIS` é justamente poder editar a skill e testar no projeto
 * sem commitar nada. Por isso a origem local é copiada, não clonada.
 */
describe("origem local: o working tree, sem commit", () => {
  it("funcional: alteração não commitada chega ao destino", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: [] });
    criados.push(repo);
    // edita sem commitar, que é o caso de uso inteiro
    const skill = join(repo, ".claude/skills/sprintx/SKILL.md");
    writeFileSync(skill, `${readFileSync(skill, "utf8")}\nMARCA-NAO-COMMITADA\n`);

    const r = await buscarSkill({ nome: "sprintx", repositorio: repo, referencia: "main", local: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    const lido = readFileSync(join(r.caminho, ".claude/skills/sprintx/SKILL.md"), "utf8");
    expect(lido).toContain("MARCA-NAO-COMMITADA");
  });

  it("funcional: a cópia local não leva o .git junto", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: [] });
    criados.push(repo);
    const r = await buscarSkill({ nome: "sprintx", repositorio: repo, referencia: "main", local: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    // o `.git` de um repositório real é grande e nada no plugin o usa
    expect(existsSync(join(r.caminho, ".git"))).toBe(false);
  });

  it("funcional: sem `local`, continua clonando — o commitado", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: [] });
    criados.push(repo);
    const skill = join(repo, ".claude/skills/sprintx/SKILL.md");
    writeFileSync(skill, `${readFileSync(skill, "utf8")}\nMARCA-NAO-COMMITADA\n`);

    const r = await buscarSkill({ nome: "sprintx", repositorio: repo, referencia: "main" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    const lido = readFileSync(join(r.caminho, ".claude/skills/sprintx/SKILL.md"), "utf8");
    expect(lido).not.toContain("MARCA-NAO-COMMITADA");
  });
});

describe("busca de um commit exato", () => {
  /** O commit de uma tag que já não é a ponta: é o caso do lock travado num commit antigo. */
  function commitDe(repo: string, ref: string): string {
    return execFileSync("git", ["rev-parse", `${ref}^{commit}`], { cwd: repo, encoding: "utf8" }).trim();
  }

  it("funcional: traz o commit pedido, não a ponta da referência", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v1.2.0"] });
    criados.push(repo);
    const alvo = commitDe(repo, "v1.0.0");
    const r = await buscarSkill({ nome: "sprintx", repositorio: pathToFileURL(repo).href, referencia: "main", commit: alvo });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.caminho);
    expect(r.commit).toBe(alvo);
    expect(readFileSync(join(r.caminho, ".claude/skills/sprintx/references/01.md"), "utf8")).toContain("v1.0.0");
  });

  it("funcional: servidor que recusa pedido por SHA cai para a busca completa", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v1.2.0"] });
    criados.push(repo);
    // o commit inicial: nenhuma branch ou tag aponta para ele, então o servidor
    // não o anuncia — e no protocolo v0, sem allowReachableSHA1InWant, recusa o pedido
    const alvo = commitDe(repo, "v1.0.0~1");
    const antes = { ...process.env };
    Object.assign(process.env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "protocol.version", GIT_CONFIG_VALUE_0: "0" });
    try {
      const r = await buscarSkill({ nome: "sprintx", repositorio: pathToFileURL(repo).href, referencia: "main", commit: alvo });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      criados.push(r.caminho);
      expect(r.commit).toBe(alvo);
    } finally {
      for (const k of ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]) {
        if (antes[k] === undefined) Reflect.deleteProperty(process.env, k);
        else process.env[k] = antes[k];
      }
    }
  });

  it("funcional: commit que não existe no remoto falha, sem cair para a ponta", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    criados.push(repo);
    const r = await buscarSkill({ nome: "sprintx", repositorio: pathToFileURL(repo).href, referencia: "main", commit: "0".repeat(40) });
    expect(r.ok).toBe(false);
  });
});
