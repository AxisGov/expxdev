import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mesclarCodexHooks, materializarCodex } from "./codex.js";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { executarInit } from "../cli/init.js";
import { projetoTemporario } from "../teste/projeto-temporario.js";

function ler(raiz: string): Record<string, any> {
  return JSON.parse(readFileSync(join(raiz, ".codex/hooks.json"), "utf8")) as Record<string, any>;
}

describe("harness Codex", () => {
  it("integração: preserva configuração, usuário e não duplica o hook Expx", () => {
    const p = projetoTemporario();
    try {
      const caminho = join(p.raiz, ".codex/hooks.json");
      const existente = {
        description: "configuração do projeto",
        hooks: {
          SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "user-hook" }] }],
          Stop: [{ matcher: "*", hooks: [{ type: "command", command: "stop-hook" }] }],
        },
        campoDesconhecido: true,
      };
      mkdirSync(join(p.raiz, ".codex"), { recursive: true });
      writeFileSync(caminho, `${JSON.stringify(existente)}\n`);
      mesclarCodexHooks(p.raiz);
      const primeira = ler(p.raiz);
      mesclarCodexHooks(p.raiz);
      expect(ler(p.raiz)).toEqual(primeira);
      expect(primeira.description).toBe(existente.description);
      expect(primeira.campoDesconhecido).toBe(true);
      expect(primeira.hooks.Stop).toEqual(existente.hooks.Stop);
      expect(primeira.hooks.SessionStart).toHaveLength(2);
      expect(primeira.hooks.SessionStart[1].matcher).toBe("startup|resume");
      expect(primeira.hooks.SessionStart[1].hooks[0].commandWindows).toContain("powershell.exe -NoProfile");
      expect(primeira.hooks.SessionStart[1].hooks[0].command).toContain("git rev-parse --show-toplevel");
      expect(JSON.stringify(primeira)).not.toContain(process.cwd());
    } finally {
      p.descartar();
    }
  });

  it("funcional: materializa runtime e aviso de trust apenas na criação", () => {
    const p = projetoTemporario();
    try {
      expect(materializarCodex(p.raiz)).toContain("revise e confie");
      expect(materializarCodex(p.raiz)).toBeUndefined();
      expect(readFileSync(join(p.raiz, ".codex/hooks/expx-session-sync.mjs"), "utf8")).toContain("bootstrapAxis");
    } finally {
      p.descartar();
    }
  });

  it("funcional: substitui somente a versão antiga do hook Expx e preserva usuário", () => {
    const p = projetoTemporario();
    try {
      mkdirSync(join(p.raiz, ".codex"), { recursive: true });
      writeFileSync(join(p.raiz, ".codex/hooks.json"), JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "startup|resume", hooks: [{ type: "command", command: "user" }] },
            { matcher: "startup|resume", hooks: [{ type: "command", command: "node old/.codex/hooks/expx-session-sync.mjs" }] },
          ],
        },
      }));
      expect(materializarCodex(p.raiz)).toContain("revise e confie");
      const s = ler(p.raiz);
      expect(s.hooks.SessionStart).toHaveLength(2);
      expect(s.hooks.SessionStart[0].hooks[0].command).toBe("user");
      expect(s.hooks.SessionStart.filter((x: any) => JSON.stringify(x).includes(".codex/hooks/expx-session-sync.mjs"))).toHaveLength(1);
      expect(s.hooks.SessionStart[1].hooks[0].commandWindows).toContain("powershell.exe -NoProfile");
    } finally {
      p.descartar();
    }
  });

  it("funcional: hook atual não gera novo aviso e JSON inválido é preservado", () => {
    const p = projetoTemporario();
    try {
      materializarCodex(p.raiz);
      expect(materializarCodex(p.raiz)).toBeUndefined();
      const caminho = join(p.raiz, ".codex/hooks.json");
      writeFileSync(caminho, "{ invalido\n");
      const antes = readFileSync(caminho);
      expect(materializarCodex(p.raiz)).toContain("hooks.json invalido");
      expect(readFileSync(caminho)).toEqual(antes);
    } finally {
      p.descartar();
    }
  });

  it("funcional: init com codex materializa Codex e sem codex não cria .codex", async () => {
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    const p = projetoTemporario();
    const q = projetoTemporario();
    try {
      const r = await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude", "codex"], origens: { sprintx: repo } });
      expect(r.avisos.some((a) => a.includes("Codex:") && a.includes("/hooks"))).toBe(true);
      expect(readFileSync(join(p.raiz, ".codex/hooks.json"), "utf8")).toContain('"matcher": "startup|resume"');
      await executarInit({ raiz: q.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });
      expect(() => readFileSync(join(q.raiz, ".codex/hooks.json"))).toThrow();
    } finally {
      p.descartar();
      q.descartar();
      rmSync(repo, { recursive: true, force: true });
    }
  });
});