import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { mesclarSettings, lerPluginsHabilitados, caminhoDoSettings } from "./settings.js";

let p: ProjetoTemporario | undefined;
afterEach(() => {
  p?.descartar();
  p = undefined;
});

function settings(raiz: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(raiz, ".claude", "settings.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

describe("merge do settings.json", () => {
  it("integração: as chaves alheias ao expx sobrevivem ao merge", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    const antes = settings(p.raiz);
    const r = mesclarSettings(p.raiz, "/caminho/do/marketplace");
    expect(r.ok).toBe(true);

    const depois = settings(p.raiz);
    expect(depois["permissions"]).toEqual(antes["permissions"]);
    expect(depois["env"]).toEqual(antes["env"]);
    expect(depois["extraKnownMarketplaces"]).toBeDefined();
  });

  it("funcional: enabledPlugins vindo como array é lido e reescrito como objeto sem perder entrada", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    mesclarSettings(p.raiz, "/caminho/do/marketplace");
    const d = settings(p.raiz);
    const habilitados = d["enabledPlugins"] as Record<string, boolean>;

    expect(Array.isArray(habilitados)).toBe(false);
    expect(habilitados["outro-plugin@outro-marketplace"]).toBe(true);
    expect(habilitados["expx@expx-local"]).toBe(true);
  });

  it("funcional: settings ausente é criado do zero com só as chaves do expx", () => {
    p = projetoTemporario("fixtures/cli/settings-ausente");
    const r = mesclarSettings(p.raiz, "/caminho/do/marketplace");
    expect(r.ok).toBe(true);
    const d = settings(p.raiz);
    expect(Object.keys(d).sort()).toEqual(["enabledPlugins", "extraKnownMarketplaces"]);
  });

  it("funcional: lerPluginsHabilitados aceita as duas formas, array e objeto", () => {
    expect(lerPluginsHabilitados(["a@m"])).toEqual({ "a@m": true });
    expect(lerPluginsHabilitados({ "a@m": true, "b@m": false })).toEqual({ "a@m": true, "b@m": false });
    expect(lerPluginsHabilitados(undefined)).toEqual({});
  });

  it("funcional: rodar o merge duas vezes não duplica nem altera o resultado", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    mesclarSettings(p.raiz, "/caminho/do/marketplace");
    const primeira = settings(p.raiz);
    mesclarSettings(p.raiz, "/caminho/do/marketplace");
    expect(settings(p.raiz)).toEqual(primeira);
  });
});

describe("registro dos hooks no settings", () => {
  /**
   * `mesclarSettings` não conhece a lista de skills instaladas — inferir ali
   * acoplaria o harness ao catálogo. Por isso os hooks chegam por parâmetro
   * (decisão D-22). Sem hooks, o arquivo mantém exatamente a forma de sempre
   * (D-23): um projeto sem memox não ganha chave nova.
   */
  const HOOKS = [
    { skill: "memox", relativo: ".claude/hooks/memox-injetar.sh" },
    { skill: "memox", relativo: ".claude/hooks/memox-reindexar.sh" },
  ];

  it("integração: registra os dois eventos preservando o que já existia", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    const r = mesclarSettings(p.raiz, "/caminho/do/marketplace", HOOKS);
    expect(r.ok).toBe(true);

    const d = settings(p.raiz) as Record<string, any>;
    expect(d["hooks"]["UserPromptSubmit"]).toHaveLength(1);
    expect(d["hooks"]["Stop"]).toHaveLength(1);
    // nada do que já estava no arquivo se perde
    expect(d["extraKnownMarketplaces"]).toBeDefined();
    expect(d["enabledPlugins"]).toBeDefined();
  });

  it("funcional: sem hooks o arquivo mantém só as duas chaves de sempre", () => {
    p = projetoTemporario("fixtures/cli/settings-ausente");
    mesclarSettings(p.raiz, "/caminho/do/marketplace", []);
    const d = settings(p.raiz);
    expect(Object.keys(d).sort()).toEqual(["enabledPlugins", "extraKnownMarketplaces"]);
  });

  it("funcional: rodar duas vezes com os mesmos hooks não duplica a entrada", () => {
    p = projetoTemporario("fixtures/cli/settings-ausente");
    mesclarSettings(p.raiz, "/caminho/do/marketplace", HOOKS);
    const primeira = JSON.stringify(settings(p.raiz));

    mesclarSettings(p.raiz, "/caminho/do/marketplace", HOOKS);
    const d = settings(p.raiz) as Record<string, any>;
    // hook duplicado faria o memox rodar duas vezes por prompt (D-16)
    expect(d["hooks"]["UserPromptSubmit"]).toHaveLength(1);
    expect(d["hooks"]["Stop"]).toHaveLength(1);
    expect(JSON.stringify(d)).toBe(primeira);
  });

  it.each([null, [], "texto"])("funcional: hooks raiz inválido (%s) preserva settings", (valor) => {
    p = projetoTemporario();
    const caminho = caminhoDoSettings(p.raiz);
    mkdirSync(join(p.raiz, ".claude"), { recursive: true });
    const original = JSON.stringify({ hooks: valor, custom: true });
    writeFileSync(caminho, original);
    const r = mesclarSettings(p.raiz, "/tmp/mkt", [
      { skill: "expx", relativo: ".claude/hooks/expx-session-sync.mjs" },
    ]);
    expect(r.ok).toBe(false);
    expect(readFileSync(caminho, "utf8")).toBe(original);
  });

  it("funcional: grupos malformados de SessionStart são preservados", () => {
    p = projetoTemporario();
    const caminho = caminhoDoSettings(p.raiz);
    mkdirSync(join(p.raiz, ".claude"), { recursive: true });
    writeFileSync(caminho, JSON.stringify({ hooks: { SessionStart: [null, "custom", { matcher: "x" }] } }));
    expect(mesclarSettings(p.raiz, "/tmp/mkt", [
      { skill: "expx", relativo: ".claude/hooks/expx-session-sync.mjs" },
    ]).ok).toBe(true);
    const d = settings(p.raiz) as any;
    expect(d.hooks.SessionStart.slice(0, 3)).toEqual([null, "custom", { matcher: "x" }]);
  });
});

/**
 * O lembrete de skill precisa chegar ao `settings.json` como UserPromptSubmit.
 *
 * É o único evento que roda ANTES da primeira ação do modelo — e o problema
 * que ele resolve é exatamente a etapa de escolher o processo não acontecer.
 */
describe("hook de lembrete das skills", () => {
  it("funcional: expx-lembrete usa timeout 1 sem declarar onFailure", () => {
    const p = projetoTemporario();
    try {
      const r = mesclarSettings(p.raiz, "/tmp/mkt", [
        { skill: "runx", relativo: ".claude/hooks/expx-lembrete.sh" },
      ]);
      expect(r.ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(p.raiz), "utf8")) as {
        hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
      };
      const lembrete = (s.hooks["UserPromptSubmit"] ?? [])
        .flatMap((grupo) => grupo.hooks)
        .find((hook) => String(hook["command"]).includes("expx-lembrete.sh"));
      expect.soft(lembrete?.["timeout"]).toBe(1);
      expect(Object.prototype.hasOwnProperty.call(lembrete ?? {}, "onFailure")).toBe(false);
    } finally {
      p.descartar();
    }
  });

  it("funcional: expx-lembrete executa quando CLAUDE_PROJECT_DIR contém espaços", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx projeto com espacos-"));
    try {
      const relativo = ".claude/hooks/expx-lembrete.sh";
      const caminho = join(raiz, ...relativo.split("/"));
      mkdirSync(join(raiz, ".claude", "hooks"), { recursive: true });
      writeFileSync(caminho, "#!/usr/bin/env bash\nprintf caminho-com-espacos-ok\n");
      chmodSync(caminho, 0o755);
      const r = mesclarSettings(raiz, "/tmp/mkt", [{ skill: "runx", relativo }]);
      expect(r.ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(raiz), "utf8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      const command = s.hooks["UserPromptSubmit"]?.[0]?.hooks[0]?.command ?? "";
      const bash = process.platform === "win32" && existsSync("C:/Program Files/Git/bin/bash.exe")
        ? "C:/Program Files/Git/bin/bash.exe"
        : "/bin/bash";
      const execucao = spawnSync(bash, ["-lc", command], {
        cwd: raiz,
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
      });
      expect(execucao.status, execucao.stderr).toBe(0);
      expect(execucao.stdout).toBe("caminho-com-espacos-ok");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: expx-lembrete é registrado em UserPromptSubmit", () => {
    const p = projetoTemporario();
    try {
      const r = mesclarSettings(p.raiz, "/tmp/mkt", [
        { skill: "runx", relativo: ".claude/hooks/expx-lembrete.sh" },
      ]);
      expect(r.ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(p.raiz), "utf8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      const cmds = (s.hooks["UserPromptSubmit"] ?? []).flatMap((g) =>
        g.hooks.map((h) => h.command),
      );
      expect(cmds.some((c) => c.includes("expx-lembrete.sh"))).toBe(true);
    } finally {
      p.descartar();
    }
  });

  it("funcional: expx-integridade-final é registrado em SubagentStart e SubagentStop, sem matcher, timeout 30, sem duplicar", () => {
    const p = projetoTemporario();
    try {
      const h = [{ skill: "expx", relativo: ".claude/hooks/expx-integridade-final.sh" }];
      expect(mesclarSettings(p.raiz, "/tmp/mkt", h).ok).toBe(true);
      expect(mesclarSettings(p.raiz, "/tmp/mkt", h).ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(p.raiz), "utf8")) as {
        hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;
      };
      for (const evento of ["SubagentStart", "SubagentStop"]) {
        const grupos = (s.hooks[evento] ?? []).filter((g) => g.hooks.some((x) => String(x["command"]).includes("expx-integridade-final.sh")));
        expect(grupos, evento).toHaveLength(1);
        expect(grupos[0]?.matcher, evento).toBeUndefined();
        expect(grupos[0]?.hooks).toEqual([
          { type: "command", command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/expx-integridade-final.sh"', timeout: 30 },
        ]);
      }
    } finally {
      p.descartar();
    }
  });

  it("funcional: expx-session-sync é registrado em SessionStart sem duplicar", () => {
    const p = projetoTemporario();
    try {
      const hook = { skill: "expx", relativo: ".claude/hooks/expx-session-sync.mjs" };
      mesclarSettings(p.raiz, "/tmp/mkt", [hook]);
      mesclarSettings(p.raiz, "/tmp/mkt", [hook]);
      const s = JSON.parse(readFileSync(caminhoDoSettings(p.raiz), "utf8")) as {
        hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
      };
      expect(s.hooks["SessionStart"]).toHaveLength(1);
      expect(s.hooks["SessionStart"][0]?.hooks[0]?.command).toBe("node");
      expect(s.hooks["SessionStart"][0]?.hooks[0]?.args).toEqual([
        "${CLAUDE_PROJECT_DIR}/.claude/hooks/expx-session-sync.mjs",
      ]);
    } finally {
      p.descartar();
    }
  });
});

/**
 * Os hooks soltos do memox não têm manifesto: o comando é montado aqui. Sem
 * aspas, `$CLAUDE_PROJECT_DIR` com espaço quebra a palavra e o hook não roda.
 */
describe("hooks soltos com caminho entre aspas", () => {
  const MEMOX = [
    { skill: "memox", relativo: ".claude/hooks/memox-injetar.sh", evento: "UserPromptSubmit" },
    { skill: "memox", relativo: ".claude/hooks/memox-reindexar.sh", evento: "Stop" },
  ] as const;
  type Settings = { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> };

  it("funcional: os hooks do memox executam quando CLAUDE_PROJECT_DIR contém espaços", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx projeto com espacos-"));
    try {
      mkdirSync(join(raiz, ".claude", "hooks"), { recursive: true });
      for (const h of MEMOX) {
        const caminho = join(raiz, ...h.relativo.split("/"));
        writeFileSync(caminho, `#!/usr/bin/env bash\nprintf ${h.evento}-ok\n`);
        chmodSync(caminho, 0o755);
      }
      expect(mesclarSettings(raiz, "/tmp/mkt", MEMOX.map(({ skill, relativo }) => ({ skill, relativo }))).ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(raiz), "utf8")) as Settings;
      const bash = process.platform === "win32" && existsSync("C:/Program Files/Git/bin/bash.exe")
        ? "C:/Program Files/Git/bin/bash.exe"
        : "/bin/bash";
      for (const h of MEMOX) {
        const command = s.hooks[h.evento]?.[0]?.hooks[0]?.command ?? "";
        expect(command).toBe(`"$CLAUDE_PROJECT_DIR/${h.relativo}"`);
        const execucao = spawnSync(bash, ["-lc", command], {
          cwd: raiz,
          encoding: "utf8",
          env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
        });
        expect(execucao.status, execucao.stderr).toBe(0);
        expect(execucao.stdout).toBe(`${h.evento}-ok`);
      }
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: a forma sem aspas de uma instalação anterior é substituída, sem duplicar, mesmo sem lock", () => {
    const p = projetoTemporario();
    try {
      const daPessoa = { type: "command", command: "echo da-pessoa" };
      mkdirSync(join(p.raiz, ".claude"), { recursive: true });
      writeFileSync(caminhoDoSettings(p.raiz), JSON.stringify({
        hooks: {
          UserPromptSubmit: [{ hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/.claude/hooks/memox-injetar.sh" }, daPessoa] }],
          Stop: [{ hooks: [{ type: "command", command: "$CLAUDE_PROJECT_DIR/.claude/hooks/memox-reindexar.sh" }] }],
        },
      }));
      expect(mesclarSettings(p.raiz, "/tmp/mkt", MEMOX.map(({ skill, relativo }) => ({ skill, relativo }))).ok).toBe(true);
      const s = JSON.parse(readFileSync(caminhoDoSettings(p.raiz), "utf8")) as Settings;
      for (const h of MEMOX) {
        const cmds = (s.hooks[h.evento] ?? []).flatMap((g) => g.hooks.map((x) => x.command)).filter((c) => c.includes(h.relativo));
        expect(cmds).toEqual([`"$CLAUDE_PROJECT_DIR/${h.relativo}"`]);
      }
      const doUsuario = (s.hooks["UserPromptSubmit"] ?? []).flatMap((g) => g.hooks).filter((x) => x.command === "echo da-pessoa");
      expect(doUsuario).toHaveLength(1);
    } finally {
      p.descartar();
    }
  });
});
