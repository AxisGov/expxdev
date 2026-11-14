import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { executarInit } from "./init.js";
import { hashNormalizado, type ManifestoDeComandos } from "../nucleo/comandos-legados.js";

/*
 * O init remove a cópia manual antiga de um comando em `.claude/commands/` quando
 * o homônimo está no plugin e o conteúdo é uma versão publicada pelo fork (o
 * manifesto embarcado; aqui, injetado). Conselhos-municipais, 2026-11-14: sem
 * prefixo, `/mergex-check` rodava o texto antigo, sem a V12.
 */

let p: ProjetoTemporario | undefined;
const repos: string[] = [];
afterEach(() => {
  p?.descartar();
  p = undefined;
  for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

function origens(nomes: readonly string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const n of nomes) {
    const repo = criarRepoSkill({ nome: n, tags: ["v1.0.0"], layout: n === "runx" ? "plano" : "embutido" });
    repos.push(repo);
    saida[n] = repo;
  }
  return saida;
}

// o texto que a fixture publica em `sprintx.md`, numa versão antiga, em CRLF (cópia vinda do Windows)
const ANTIGO_SPRINTX = "---\r\ndescription: comando sprintx (versao antiga)\r\n---\r\n\r\nInvoque a skill `sprintx`.\r\n";
const manifesto: ManifestoDeComandos = {
  versao: 1,
  fontes: [],
  comandos: { "sprintx.md": [hashNormalizado(Buffer.from(ANTIGO_SPRINTX))], "runx.md": [hashNormalizado(Buffer.from("versao publicada do runx\n"))] },
};

function comLegados(raiz: string): void {
  mkdirSync(join(raiz, ".claude", "commands"), { recursive: true });
  writeFileSync(join(raiz, ".claude", "commands", "sprintx.md"), ANTIGO_SPRINTX);
  writeFileSync(join(raiz, ".claude", "commands", "runx.md"), "versao publicada do runx\ncom uma nota minha\n");
  writeFileSync(join(raiz, ".claude", "commands", "meu-comando.md"), "comando da pessoa\n");
}

describe("init: comandos legados em .claude/commands/", () => {
  it("remove a versão publicada com homônimo, mantém a alterada e não toca o comando da pessoa", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    comLegados(p.raiz);
    const r = await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens: origens(["sprintx", "runx"]), manifestoDeComandos: manifesto });
    expect(r.ok).toBe(true);
    expect(existsSync(join(p.raiz, ".claude", "commands", "sprintx.md"))).toBe(false);
    expect(existsSync(join(p.raiz, ".claude", "commands", "runx.md"))).toBe(true);
    expect(existsSync(join(p.raiz, ".claude", "commands", "meu-comando.md"))).toBe(true);
    expect(r.avisos).toContain(
      "removido: .claude/commands/sprintx.md (copia antiga de uma versao publicada; o comando vem do plugin como /expx:sprintx); desfaca com git restore -- .claude/commands/sprintx.md",
    );
    expect(r.avisos).toContain("mantido: .claude/commands/runx.md (conteudo nao e uma versao publicada pelo fork)");
    expect(r.avisos.join("\n")).not.toContain("meu-comando");
    // nunca foram do expxdev: o lock não os registra
    const lock = readFileSync(join(p.raiz, ".expx", "expx-lock.json"), "utf8");
    expect(lock).not.toContain(".claude/commands");
  });

  it("só com o harness opencode, .claude/commands não é consultado", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    comLegados(p.raiz);
    const r = await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["opencode"], origens: origens(["sprintx"]), manifestoDeComandos: manifesto });
    expect(r.ok).toBe(true);
    expect(existsSync(join(p.raiz, ".claude", "commands", "sprintx.md"))).toBe(true);
    expect(r.avisos.join("\n")).not.toMatch(/removido: \.claude\/commands|mantido: \.claude\/commands/);
  });

  it("falha na aplicação, depois de publicar o plugin e antes do lock: o legado fica", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    comLegados(p.raiz);
    const init = executarInit({
      raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origens(["sprintx"]), manifestoDeComandos: manifesto,
      aposPublicar: () => {
        throw new Error("falha injetada antes do lock");
      },
    });
    await expect(init).rejects.toThrow("falha injetada antes do lock");
    expect(existsSync(join(p.raiz, ".claude", "commands", "sprintx.md"))).toBe(true);
  });

  it("o init que falha não remove nada", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    comLegados(p.raiz);
    // settings.json ilegível: o plano falha antes de qualquer escrita
    writeFileSync(join(p.raiz, ".claude", "settings.json"), "{ nao e json");
    const r = await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origens(["sprintx"]), manifestoDeComandos: manifesto });
    expect(r.ok).toBe(false);
    expect(existsSync(join(p.raiz, ".claude", "commands", "sprintx.md"))).toBe(true);
    expect(r.avisos.join("\n")).not.toContain("removido:");
  });
});
