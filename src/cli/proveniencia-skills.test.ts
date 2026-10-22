import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarInit } from "./init.js";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";

const SKILLS_AXISGOV = [
  ["runx", "https://github.com/AxisGov/runx"],
  ["mergex", "https://github.com/AxisGov/mergex"],
  ["sprintx", "https://github.com/AxisGov/sprintx"],
  ["buildx", "https://github.com/AxisGov/buildx"],
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

      const resultado = await executarInit({
        raiz: projeto.raiz,
        skills: [nome],
        harness: ["claude"],
      });

      expect(resultado.ok, JSON.stringify(resultado)).toBe(true);
      const lock = JSON.parse(
        readFileSync(join(projeto.raiz, ".expx", "expx-lock.json"), "utf8"),
      ) as { skills: Record<string, { repositorio: string }> };
      expect(lock.skills[nome]?.repositorio).toBe(canonica);
    },
  );
});
