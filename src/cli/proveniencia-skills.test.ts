import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarInit } from "./init.js";
import { buscarNoCatalogo } from "../nucleo/catalogo.js";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";

const SKILLS_AXISGOV = [
  ["runx", "https://github.com/AxisGov/runx"],
  ["mergex", "https://github.com/AxisGov/mergex"],
  ["sprintx", "https://github.com/AxisGov/sprintx"],
  ["buildx", "https://github.com/AxisGov/buildx"],
  ["legadox", "https://github.com/AxisGov/legadox"],
  ["stackx", "https://github.com/AxisGov/stackx"],
  ["designx", "https://github.com/AxisGov/designx"],
] as const;

let projeto: ProjetoTemporario | undefined;
const temporarios: string[] = [];
const gitConfigAnterior = process.env["GIT_CONFIG_GLOBAL"];
const gitNoSystemAnterior = process.env["GIT_CONFIG_NOSYSTEM"];

function redirecionarGit(canonica: string, repo: string): void {
  const pasta = mkdtempSync(join(tmpdir(), "expx-git-config-"));
  temporarios.push(pasta);
  const config = join(pasta, "config");
  execFileSync("git", [
    "config",
    "--file",
    config,
    `url.file://${repo}/.insteadOf`,
    canonica,
  ]);
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
}

afterEach(() => {
  projeto?.descartar();
  projeto = undefined;
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
  if (gitConfigAnterior === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = gitConfigAnterior;
  if (gitNoSystemAnterior === undefined) delete process.env["GIT_CONFIG_NOSYSTEM"];
  else process.env["GIT_CONFIG_NOSYSTEM"] = gitNoSystemAnterior;
});

describe("proveniencia das skills AxisGov", () => {
  it.each(SKILLS_AXISGOV)(
    "integracao: instalacao nova de %s consulta e grava a origem AxisGov sem override do CLI",
    async (nome, canonica) => {
      const repo = criarRepoSkill({ nome, tags: ["v1.0.0"] });
      temporarios.push(repo);
      redirecionarGit(canonica, repo);
      projeto = projetoTemporario("fixtures/cli/projeto-limpo");

      // O certificado do catálogo é um commit real da skill, que a fixture não tem:
      // o da fixture faz o papel dele, e a origem segue sendo a canônica.
      const certificado = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
      const resultado = await executarInit({
        raiz: projeto.raiz,
        skills: [nome],
        harness: ["claude"],
        certificados: { [nome]: certificado },
      });

      expect(resultado.ok, JSON.stringify(resultado)).toBe(true);
      const lock = JSON.parse(
        readFileSync(join(projeto.raiz, ".expx", "expx-lock.json"), "utf8"),
      ) as { skills: Record<string, { repositorio: string }> };
      expect(lock.skills[nome]?.repositorio).toBe(canonica);
    },
  );
});

describe("o commit certificado na instalacao", () => {
  // O katosmv/login recebeu na 0.12.8 o topo da main das skills, e não o que a
  // release certificou. Da origem canônica, o init instala o certificado.
  function cenario(): { repo: string; certificado: string; ponta: string } {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v2.0.0"] });
    temporarios.push(repo);
    redirecionarGit("https://github.com/AxisGov/sprintx", repo);
    const sha = (ref: string): string => execFileSync("git", ["rev-parse", ref], { cwd: repo }).toString().trim();
    return { repo, certificado: sha("v1.0.0"), ponta: sha("HEAD") };
  }

  type Travada = { repositorio: string; referencia: string; travado: boolean; commit: string };
  function lockDe(raiz: string): Record<string, Travada> {
    return (JSON.parse(readFileSync(join(raiz, ".expx", "expx-lock.json"), "utf8")) as { skills: Record<string, Travada> }).skills;
  }

  it("integracao: da origem canonica, instala o certificado e nao a maior tag nem a ponta", async () => {
    const c = cenario();
    projeto = projetoTemporario("fixtures/cli/projeto-limpo");
    const r = await executarInit({ raiz: projeto.raiz, skills: ["sprintx"], harness: ["claude"], certificados: { sprintx: c.certificado } });

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.naoTravadas).toEqual([]);
    expect(lockDe(projeto.raiz)["sprintx"]).toMatchObject({
      repositorio: "https://github.com/AxisGov/sprintx",
      referencia: c.certificado,
      travado: true,
      commit: c.certificado,
    });
    const ref = readFileSync(join(projeto.raiz, ".expx/marketplace/plugins/expx/skills/sprintx/references/01.md"), "utf8");
    expect(ref).toContain("em v1.0.0");
  });

  it("funcional: --to sai do certificado de proposito, e o SHA pedido e o instalado", async () => {
    const c = cenario();
    projeto = projetoTemporario("fixtures/cli/projeto-limpo");
    const r = await executarInit({
      raiz: projeto.raiz, skills: ["sprintx"], harness: ["claude"],
      certificados: { sprintx: c.certificado }, referencias: { sprintx: c.ponta },
    });

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(lockDe(projeto.raiz)["sprintx"]).toMatchObject({ referencia: c.ponta, commit: c.ponta, travado: true });
  });

  it("funcional: sem certificado declarado, vale o do catalogo, que a fixture nao tem: falha, sem cair para a ponta", async () => {
    cenario();
    projeto = projetoTemporario("fixtures/cli/projeto-limpo");
    const r = await executarInit({ raiz: projeto.raiz, skills: ["sprintx"], harness: ["claude"] });

    expect(r.ok).toBe(false);
    expect(r.instaladas).toEqual([]);
    expect(JSON.stringify(r.falhas)).toContain(buscarNoCatalogo("sprintx")?.certificado);
  });
});
