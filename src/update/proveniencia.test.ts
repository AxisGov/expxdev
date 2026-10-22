import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarUpdate } from "./flags.js";
import { escreverLock, versaoDoCli, VERSAO_LOCK, type Lock } from "../nucleo/lock.js";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { caminhoDoBloqueioOperacao } from "../nucleo/bloqueio-operacao.js";

const SKILLS_AXISGOV = [
  ["runx", "https://github.com/AxisGov/runx", "https://github.com/bittencourtthulio/runx"],
  ["mergex", "https://github.com/AxisGov/mergex", "https://github.com/bittencourtthulio/mergex"],
  ["sprintx", "https://github.com/AxisGov/sprintx", "https://github.com/bittencourtthulio/sprintx"],
  ["buildx", "https://github.com/AxisGov/buildx", "https://github.com/bittencourtthulio/buildx"],
] as const;

let projeto: ProjetoTemporario | undefined;
const temporarios: string[] = [];
const gitConfigAnterior = process.env["GIT_CONFIG_GLOBAL"];
const gitNoSystemAnterior = process.env["GIT_CONFIG_NOSYSTEM"];
const gitTraceAnterior = process.env["GIT_TRACE"];

function redirecionarGit(canonica: string, repo: string): string {
  const pasta = mkdtempSync(join(tmpdir(), "expx-update-proveniencia-"));
  temporarios.push(pasta);
  const config = join(pasta, "config");
  const trace = join(pasta, "git.trace");
  execFileSync("git", ["config", "--file", config, `url.file://${repo}/.insteadOf`, canonica]);
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  process.env["GIT_TRACE"] = trace;
  return trace;
}

function lockLegado(
  nome: string,
  legada: string,
  commit: string,
): Lock {
  return {
    lock_version: VERSAO_LOCK,
    cli_version: versaoDoCli(),
    harness: ["claude"],
    skills: {
      [nome]: {
        repositorio: legada,
        referencia: "v1.0.0",
        travado: true,
        commit,
        resolvido_em: "2026-10-01",
        arquivos: { "SKILL.md": "hash-preservado" },
      },
    },
    instalacao: {
      arquivos: { [`.claude/skills/${nome}/SKILL.md`]: "hash-preservado" },
      executaveis: [],
    },
  };
}

afterEach(() => {
  projeto?.descartar();
  projeto = undefined;
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
  if (gitConfigAnterior === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = gitConfigAnterior;
  if (gitNoSystemAnterior === undefined) delete process.env["GIT_CONFIG_NOSYSTEM"];
  else process.env["GIT_CONFIG_NOSYSTEM"] = gitNoSystemAnterior;
  if (gitTraceAnterior === undefined) delete process.env["GIT_TRACE"];
  else process.env["GIT_TRACE"] = gitTraceAnterior;
});

describe("migracao idempotente de proveniencia", () => {
  it("funcional: operacao concorrente bloqueia migracao antes de sobrescrever o lock", async () => {
    const [nome, canonica, legada] = SKILLS_AXISGOV[0];
    const repo = criarRepoSkill({ nome, tags: ["v1.0.0"] });
    temporarios.push(repo);
    const commit = execFileSync("git", ["rev-list", "-n", "1", "v1.0.0"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    redirecionarGit(canonica, repo);
    projeto = projetoTemporario("fixtures/cli/projeto-limpo");
    const anterior = lockLegado(nome, legada, commit);
    escreverLock(projeto.raiz, anterior);
    const caminho = join(projeto.raiz, ".expx", "expx-lock.json");
    const bloqueio = caminhoDoBloqueioOperacao(projeto.raiz);
    writeFileSync(bloqueio, "outra operacao\n");

    const resultado = await executarUpdate({ raiz: projeto.raiz, sim: true });

    expect(resultado.ok).toBe(false);
    expect(resultado.aplicou).toBe(false);
    expect(resultado.atualizadas).toEqual([]);
    expect(resultado.mensagens.join(" ")).toContain("outra operacao");
    expect(JSON.parse(readFileSync(caminho, "utf8"))).toEqual(anterior);
  });

  it.each(SKILLS_AXISGOV)(
    "integracao: update de %s usa AxisGov, altera so a proveniencia e a segunda execucao nao muda",
    async (nome, canonica, legada) => {
      const repo = criarRepoSkill({ nome, tags: ["v1.0.0"] });
      temporarios.push(repo);
      const commit = execFileSync("git", ["rev-list", "-n", "1", "v1.0.0"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
      const trace = redirecionarGit(canonica, repo);
      projeto = projetoTemporario("fixtures/cli/projeto-limpo");
      const anterior = lockLegado(nome, legada, commit);
      escreverLock(projeto.raiz, anterior);
      const caminho = join(projeto.raiz, ".expx", "expx-lock.json");

      const check = await executarUpdate({ raiz: projeto.raiz, check: true });
      expect(check.aplicou).toBe(false);
      expect(JSON.parse(readFileSync(caminho, "utf8"))).toEqual(anterior);

      const primeira = await executarUpdate({ raiz: projeto.raiz, sim: true });
      expect(primeira.ok).toBe(true);
      expect(primeira.aplicou).toBe(true);
      expect(primeira.atualizadas).toEqual([nome]);

      const depois = JSON.parse(readFileSync(caminho, "utf8")) as Lock;
      expect(depois).toEqual({
        ...anterior,
        skills: {
          [nome]: {
            ...anterior.skills[nome],
            repositorio: canonica,
          },
        },
      });
      const bytesDepois = readFileSync(caminho, "utf8");

      const segunda = await executarUpdate({ raiz: projeto.raiz, sim: true });
      expect(segunda.aplicou).toBe(false);
      expect(readFileSync(caminho, "utf8")).toBe(bytesDepois);

      const operacoesGit = readFileSync(trace, "utf8");
      expect(operacoesGit).toContain(canonica);
      expect(operacoesGit).not.toContain(legada);
    },
  );

  it.each(SKILLS_AXISGOV)(
    "funcional: configuracao local permitida de %s e preservada",
    async (nome) => {
      const repo = criarRepoSkill({ nome, tags: ["v1.0.0"] });
      temporarios.push(repo);
      const commit = execFileSync("git", ["rev-list", "-n", "1", "v1.0.0"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
      projeto = projetoTemporario("fixtures/cli/projeto-limpo");
      const customizado = lockLegado(nome, repo, commit);
      escreverLock(projeto.raiz, customizado);

      const resultado = await executarUpdate({ raiz: projeto.raiz, sim: true });
      expect(resultado.aplicou).toBe(false);
      expect(
        JSON.parse(readFileSync(join(projeto.raiz, ".expx", "expx-lock.json"), "utf8")),
      ).toEqual(customizado);
    },
  );
});
