import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario } from "../teste/projeto-temporario.js";
import { detectarLayout } from "../nucleo/layout.js";
import { instalarHooks } from "./hooks.js";
import { executarInit } from "../cli/init.js";
import { suportaBitExecutavel } from "../teste/fs-capacidades.js";

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function projeto(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-hooks-"));
  criados.push(d);
  return d;
}

/**
 * O hook do memox resolve o motor como `DIR_HOOK/../skills/memox/assets/memox.py`.
 * Se hook e skill não forem irmãos em `.claude/`, o hook sai `0` em silêncio e a
 * instalação quebrada fica indistinguível de "projeto sem artefatos" (D-15).
 */
describe("instalação dos hooks pelo init", () => {
  it("integração: instala o wrapper e os dois módulos do lembrete como uma unidade", async () => {
    const repo = criarRepoSkill({
      nome: "memox",
      tags: [],
      hooks: ["memox-injetar.sh"],
      assets: { "memox.py": "print('memox')\n" },
    });
    criados.push(repo);
    const raiz = projeto();
    const resultado = await executarInit({
      raiz,
      skills: ["memox"],
      harness: ["claude"],
      origens: { memox: repo },
    });
    expect.soft(resultado.instaladas).toContain("memox");
    for (const nome of ["expx-lembrete.sh", "expx-lembrete.mjs", "expx-lembrete-estado.mjs"]) {
      expect.soft(existsSync(join(raiz, ".claude", "hooks", nome)), nome).toBe(true);
    }
  });

  it("integração: a integridade final (F3c) chega executável com a biblioteca do rastro ao lado, nas duas cópias, e registrada no início e no fim do subagente", async () => {
    const repo = criarRepoSkill({
      nome: "memox",
      tags: [],
      hooks: ["memox-injetar.sh"],
      assets: { "memox.py": "print('memox')\n" },
    });
    criados.push(repo);
    const raiz = projeto();
    const r = await executarInit({ raiz, skills: ["memox"], harness: ["claude"], origens: { memox: repo } });
    expect(r.instaladas).toContain("memox");
    for (const base of [".claude/hooks", ".expx/marketplace/plugins/expx/nucleo/hooks"]) {
      for (const nome of ["expx-integridade-final.sh", "expx-rastro.sh"]) {
        expect.soft(existsSync(join(raiz, base, nome)), `${base}/${nome}`).toBe(true);
      }
    }
    if (suportaBitExecutavel()) {
      expect(statSync(join(raiz, ".claude/hooks/expx-integridade-final.sh")).mode & 0o100).toBe(0o100);
      expect(statSync(join(raiz, ".claude/hooks/expx-rastro.sh")).mode & 0o100).toBe(0);
    }
    const s = JSON.parse(readFileSync(join(raiz, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string; timeout?: number }> }>>;
    };
    for (const evento of ["SubagentStart", "SubagentStop"]) {
      const hooks = (s.hooks[evento] ?? []).flatMap((g) => g.hooks).filter((h) => h.command.includes("expx-integridade-final.sh"));
      expect(hooks, evento).toHaveLength(1);
      expect(hooks[0]?.timeout, evento).toBe(30);
    }
    // a biblioteca é só `source`: nunca vira entrada de hook
    expect(JSON.stringify(s.hooks)).not.toContain("expx-rastro.sh");
    const lock = JSON.parse(readFileSync(join(raiz, ".expx", "expx-lock.json"), "utf8")) as {
      instalacao: { arquivos: Record<string, string>; executaveis?: string[] };
    };
    expect(Object.keys(lock.instalacao.arquivos)).toContain(".claude/hooks/expx-integridade-final.sh");
    expect(Object.keys(lock.instalacao.arquivos)).toContain(".claude/hooks/expx-rastro.sh");
    expect(lock.instalacao.executaveis ?? []).toContain(".claude/hooks/expx-integridade-final.sh");
    expect(lock.instalacao.executaveis ?? []).not.toContain(".claude/hooks/expx-rastro.sh");
  });

  it("integração: depois do init, hook e motor existem como irmãos", async () => {
    const repo = criarRepoSkill({
      nome: "memox",
      tags: [],
      hooks: ["memox-injetar.sh", "memox-reindexar.sh"],
      assets: { "memox.py": "print('memox')\n" },
    });
    criados.push(repo);
    const raiz = projeto();

    const r = await executarInit({
      raiz,
      skills: ["memox"],
      harness: ["claude"],
      origens: { memox: repo },
    });
    expect(r.instaladas).toContain("memox");

    // a asserção é DEPOIS do retorno: o init apaga os clones temporários no
    // final, e uma cópia feita tarde demais leria pasta já removida (D-26)
    expect(existsSync(join(raiz, ".claude/hooks/memox-injetar.sh"))).toBe(true);
    expect(existsSync(join(raiz, ".claude/skills/memox/assets/memox.py"))).toBe(true);
  });

  it("funcional: o hook fica executável e o hook de núcleo existe sem skill com hook", async () => {
    const comHook = criarRepoSkill({
      nome: "memox",
      tags: [],
      hooks: ["memox-injetar.sh"],
      assets: { "memox.py": "print('memox')\n" },
    });
    criados.push(comHook);
    const raiz = projeto();
    await executarInit({ raiz, skills: ["memox"], harness: ["claude"], origens: { memox: comHook } });
    const hook = join(raiz, ".claude/hooks/memox-injetar.sh");
    expect(existsSync(hook)).toBe(true);

    if (suportaBitExecutavel()) {
      expect(statSync(hook).mode & 0o100).toBe(0o100);
    }

    const semHook = criarRepoSkill({ nome: "sprintx", tags: [] });
    criados.push(semHook);
    const outra = projeto();
    await executarInit({ raiz: outra, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: semHook } });
    expect(existsSync(join(outra, ".claude/hooks/expx-session-sync.mjs"))).toBe(true);
  });
});

/**
 * A cópia em `.claude/skills/` não pode ficar órfã.
 *
 * Medido em produção: um projeto tinha DUAS runx — a do plugin, atualizada, e
 * uma em `.claude/skills/runx/` de uma instalação anterior, com a descrição
 * antiga. As duas competem na mesma sessão, e a velha nunca era reescrita.
 *
 * A causa foi uma regressão desta função: ela só roda para skills com hooks em
 * ARQUIVO SOLTO (`comHooks`), e quando a detecção passou a usar a árvore de
 * hooks (`arvoreHooks`), `hooks` virou `[]` para todas as skills reais. O
 * `instalarHooks` deixou de rodar, e as cópias antigas viraram lixo permanente
 * — sem nenhum aviso, porque nada falha.
 */
describe("a cópia da skill em .claude/skills não fica para trás", () => {
  it("funcional: skill com árvore de hooks também materializa a cópia da skill", () => {
    const p = projetoTemporario();
    try {
      const repo = criarRepoSkill({ nome: "runx", tags: [], layout: "embutido" });
      try {
        // o layout real: hooks em PASTA, nenhum arquivo solto com o prefixo
        mkdirSync(join(repo, ".claude/hooks/runx"), { recursive: true });
        writeFileSync(join(repo, ".claude/hooks/runx/escopo.py"), "# hook\n");

        const l = detectarLayout(repo, "runx");
        if (!l.ok) throw new Error(l.erro);
        expect(l.hooks).toEqual([]); // é exatamente o caso que quebrava
        expect(l.arvoreHooks).toBeDefined();

        instalarHooks(p.raiz, [
          {
            nome: "runx",
            raizSkill: l.raizSkill,
            comandos: l.comandos,
            hooks: l.hooks,
            ...(l.arvoreHooks !== undefined ? { arvoreHooks: l.arvoreHooks } : {}),
          },
        ]);

        expect(existsSync(join(p.raiz, ".claude/skills/runx/SKILL.md"))).toBe(true);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    } finally {
      p.descartar();
    }
  });
});
