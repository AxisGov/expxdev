import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The runtime helper is intentionally shipped as a Node module beside the harness adapters.
import { AXIS_REPOSITORIO, bootstrapAxis, construirComandoNpm, sincronizarSessao } from "../../nucleo/hooks/expx-session-sync.mjs";

function ambiente(raiz: string): Record<string, string> {
  return { EXPX_AXIS_CACHE: join(raiz, "cache"), HOME: raiz };
}

function projeto(comLock = true): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-session-sync-"));
  if (comLock) {
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(join(raiz, ".expx", "expx-lock.json"), "{}\n");
  }
  return raiz;
}

describe("sincronização Axis no SessionStart", () => {
  it("integração: bootstrap fixa o repositório AxisGov e a branch main", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    const chamadas: Array<{ arquivo: string; argumentos: string[] }> = [];
    const executar = (arquivo: string, argumentos: string[]) => {
      chamadas.push({ arquivo, argumentos });
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("rev-parse")) return "mesmo\n";
      return "";
    };
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
    writeFileSync(join(cache, ".axis-build-sha"), "mesmo\n");
    bootstrapAxis(cache, executar);
    expect(chamadas.some((c) => c.argumentos.includes(AXIS_REPOSITORIO))).toBe(false);
    expect(chamadas).toContainEqual({ arquivo: "git", argumentos: ["-C", cache, "fetch", "origin", "main"] });
    expect(AXIS_REPOSITORIO).toBe("https://github.com/AxisGov/expxdev.git");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("integração: bootstrap novo clona AxisGov/main e constrói o servidor", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-novo-"));
    const cache = join(raiz, "cache", "axisgov", "expxdev");
    const chamadas: Array<{ arquivo: string; argumentos: string[] }> = [];
    const executar = (arquivo: string, argumentos: string[]) => {
      chamadas.push({ arquivo, argumentos });
      if (argumentos[0] === "clone") mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      return "";
    };
    bootstrapAxis(cache, executar);
    expect(chamadas[0]).toEqual({
      arquivo: "git",
      argumentos: ["clone", "--branch", "main", "--single-branch", AXIS_REPOSITORIO, cache],
    });
    expect(chamadas.some((c) => c.argumentos.includes("ci"))).toBe(true);
    expect(chamadas.some((c) => c.argumentos.includes("build:server"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: existência do cache é observada depois do lock", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-lock-"));
    const cache = join(raiz, "cache");
    let clones = 0;
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos[0] === "clone") {
        clones++;
        mkdirSync(join(cache, ".git", "refs"), { recursive: true });
        mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      }
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "same\n";
      return "";
    };
    bootstrapAxis(cache, executar);
    bootstrapAxis(cache, executar);
    expect(clones).toBe(1);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: npm usa cmd.exe no Windows e npm direto em Unix", () => {
    expect(construirComandoNpm(["ci"], "win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" })).toEqual({
      arquivo: "C:\\Windows\\System32\\cmd.exe",
      argumentos: ["/d", "/s", "/c", "npm", "ci"],
    });
    expect(construirComandoNpm(["run", "build:server"], "linux", {})).toEqual({
      arquivo: "npm",
      argumentos: ["run", "build:server"],
    });
  });

  it("funcional: clone inicial parcial é removido e pode recomeçar", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-clone-parcial-"));
    const cache = join(raiz, "cache");
    let primeira = true;
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos[0] === "clone") {
        mkdirSync(cache, { recursive: true });
        if (primeira) {
          primeira = false;
          throw new Error("clone interrompido");
        }
        mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      }
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      return "commit\n";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("clone interrompido");
    expect(existsSync(cache)).toBe(false);
    expect(() => bootstrapAxis(cache, executar)).not.toThrow();
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache existente sem .git é tratado como parcial", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-parcial-"));
    const cache = join(raiz, "cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "resto.tmp"), "parcial");
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos[0] === "clone") mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      return "commit\n";
    };
    bootstrapAxis(cache, executar);
    expect(existsSync(join(cache, "resto.tmp"))).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache com origin diferente não é apagado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-outro-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    writeFileSync(join(cache, "preservar.txt"), "nao apagar");
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("remote")) return "https://example.invalid/outro.git\n";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("cache nao aponta para AxisGov/expxdev");
    expect(existsSync(join(cache, "preservar.txt"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: lock abandonado de processo morto é recuperado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-abandonado-"));
    const cache = join(raiz, "cache");
    mkdirSync(`${cache}.lock`, { recursive: true });
    writeFileSync(join(`${cache}.lock`, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    const chamadas: string[][] = [];
    bootstrapAxis(cache, (_arquivo, argumentos) => {
      chamadas.push(argumentos);
      if (argumentos[0] === "clone") mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      return "";
    });
    expect(chamadas[0]).toContain("clone");
    expect(existsSync(`${cache}.lock`)).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: lock de processo ativo não é quebrado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-ativo-"));
    const cache = join(raiz, "cache");
    mkdirSync(`${cache}.lock`, { recursive: true });
    writeFileSync(join(`${cache}.lock`, "owner.json"), JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
    expect(() => bootstrapAxis(cache, () => "")).toThrow("bootstrap em andamento");
    expect(existsSync(`${cache}.lock`)).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: lock recente sem owner não é removido", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-recente-"));
    const cache = join(raiz, "cache");
    mkdirSync(`${cache}.lock`, { recursive: true });
    expect(() => bootstrapAxis(cache, () => "")).toThrow("bootstrap em andamento");
    expect(existsSync(`${cache}.lock`)).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: lock antigo sem owner pode ser recuperado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-antigo-"));
    const cache = join(raiz, "cache");
    mkdirSync(`${cache}.lock`, { recursive: true });
    const antigo = new Date(Date.now() - 120_000);
    utimesSync(`${cache}.lock`, antigo, antigo);
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos[0] === "clone") mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      return "commit\n";
    };
    expect(() => bootstrapAxis(cache, executar)).not.toThrow();
    expect(existsSync(`${cache}.lock`)).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: marcador stale reconstrói e não avança se o build falhar", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-build-stale-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    mkdirSync(join(cache, ".git"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "old");
    writeFileSync(join(cache, ".axis-build-sha"), "old-commit\n");
    const executar = (arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "new-commit\n";
      if (argumentos.includes("ci") || argumentos.includes("build:server")) throw new Error("build interrompido");
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("build interrompido");
    expect(existsSync(join(cache, ".axis-build-sha"))).toBe(true);
    expect(readFileSync(join(cache, ".axis-build-sha"), "utf8")).toBe("old-commit\n");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache Axis sujo não executa reset", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-sujo-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    writeFileSync(join(cache, "local.txt"), "preservar");
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "novo\n";
      if (argumentos.includes("status")) return " M local.txt\n";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("cache Axis possui alteracoes nao commitadas");
    expect(chamadas.some((a) => a.includes("reset"))).toBe(false);
    expect(existsSync(join(cache, "local.txt"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: clear e compact não tentam sincronizar", () => {
    const raiz = projeto();
    try {
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => { chamadas.push(argumentos); return ""; };
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "clear" }), raiz, executar })).toBe("");
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "compact" }), raiz, executar })).toBe("");
      expect(chamadas).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: fork não é source válido no Claude", () => {
    const raiz = projeto();
    try {
      const cache = join(raiz, "cache");
      mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      mkdirSync(join(cache, ".git"), { recursive: true });
      writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
      writeFileSync(join(cache, ".axis-build-sha"), "same\n");
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        chamadas.push(argumentos);
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
        if (argumentos.includes("rev-parse")) return "same\n";
        return "";
      };
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "fork" }), raiz, ambiente: ambiente(raiz), executar })).toBe("");
      expect(chamadas).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: resume executa o mesmo fluxo do startup", () => {
    const raiz = projeto();
    try {
      const cache = join(raiz, "cache");
      mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      mkdirSync(join(cache, ".git"), { recursive: true });
      writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
      writeFileSync(join(cache, ".axis-build-sha"), "same\n");
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        chamadas.push(argumentos);
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
        if (argumentos.includes("rev-parse")) return "same\n";
        return "";
      };
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "resume" }), raiz, ambiente: ambiente(raiz), executar })).toBe("");
      expect(chamadas.some((a) => a.some((v) => v.endsWith("expx-bin.js")))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("integração: Codex resolve cwd em subpasta e não emite reloadSkills", () => {
    const raiz = projeto();
    const subpasta = join(raiz, "src");
    mkdirSync(subpasta);
    try {
      const cache = join(raiz, "cache");
      mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      mkdirSync(join(cache, ".git"), { recursive: true });
      writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
      writeFileSync(join(cache, ".axis-build-sha"), "same\n");
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        chamadas.push(argumentos);
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
        if (argumentos.includes("rev-parse")) return "same\n";
        if (argumentos.some((v) => v.endsWith("expx-bin.js"))) return "sprintx: main -> novo\npara desfazer esta atualizacao, reverta\n";
        return "";
      };
      const saida = sincronizarSessao({
        plataforma: "codex",
        entrada: JSON.stringify({ source: "startup", cwd: subpasta }),
        ambiente: ambiente(raiz),
        executar,
      });
      expect(saida).toContain("additionalContext");
      expect(saida).not.toContain("reloadSkills");
      expect(chamadas.some((a) => a.some((v) => v.endsWith("expx-bin.js")))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: working tree sujo impede update no Codex", () => {
    const raiz = projeto();
    try {
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        chamadas.push(argumentos);
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return " M arquivo.txt\n";
        throw new Error("nao deveria continuar");
      };
      const saida = sincronizarSessao({ plataforma: "codex", entrada: JSON.stringify({ source: "resume", cwd: raiz }), executar });
      expect(saida).toContain("working tree possui alteracoes");
      expect(chamadas.some((a) => a.some((v) => v.endsWith("expx-bin.js")))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: falha de bootstrap/update no Codex não propaga exceção", () => {
    const raiz = projeto();
    try {
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        throw new Error("sem rede");
      };
      expect(() => sincronizarSessao({ plataforma: "codex", entrada: JSON.stringify({ source: "startup", cwd: raiz }), ambiente: ambiente(raiz), executar })).not.toThrow();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: falha no git status é fail-open", () => {
    const raiz = projeto();
    try {
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) throw new Error("git indisponivel");
        throw new Error("nao deveria continuar");
      };
      expect(() => sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, executar })).not.toThrow();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: projeto sem lock não tenta sync", () => {
    const raiz = projeto(false);
    try {
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => { chamadas.push(argumentos); return ""; };
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, executar })).toBe("");
      expect(chamadas).toEqual([]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: working tree sujo adia sem bootstrap nem update", () => {
    const raiz = projeto();
    try {
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        chamadas.push(argumentos);
        if (argumentos.includes("rev-parse")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "?? arquivo-novo\n";
        return "";
      };
      const saida = sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, executar });
      expect(saida).toContain("working tree possui alteracoes");
      expect(chamadas.some((a) => a.includes("clone"))).toBe(false);
      expect(chamadas.some((a) => a.includes("expx-bin.js"))).toBe(false);
      expect(chamadas.some((a) => ["reset", "clean", "checkout", "pull"].some((proibido) => a.includes(proibido)))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: projeto limpo chama o CLI Axis por caminho explícito sem campos inventados", () => {
    const raiz = projeto();
    try {
      const cache = join(raiz, "cache");
      mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      mkdirSync(join(cache, ".git"), { recursive: true });
      writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
      const chamadas: Array<{ arquivo: string; argumentos: string[] }> = [];
      const executar = (arquivo: string, argumentos: string[]) => {
        chamadas.push({ arquivo, argumentos });
        if (argumentos.includes("rev-parse") && argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
        if (argumentos.includes("rev-parse")) return "mesmo\n";
        if (argumentos.some((argumento) => argumento.endsWith("expx-bin.js"))) return "sprintx: main → novo\npara desfazer esta atualizacao, reverta\n";
        return "";
      };
      const saida = sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, ambiente: ambiente(raiz), executar });
      expect(saida).toContain("Skills atualizadas: sprintx.");
      expect(Object.keys(JSON.parse(saida).hookSpecificOutput).sort()).toEqual(["additionalContext", "hookEventName"]);
      expect(saida).not.toContain("reloadSkills");
      const cli = chamadas.find((c) => c.argumentos.some((argumento) => argumento.endsWith("expx-bin.js")));
      expect(cli?.arquivo).toMatch(/node/);
      expect(cli?.argumentos.slice(-3)).toEqual(["update", "--latest", "--yes"]);
      expect(cli?.argumentos[0]).toBe(join(cache, "dist", "cli", "expx-bin.js"));
      expect(saida).not.toContain("npx expxdev");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: falha de bootstrap é fail-open com contexto", () => {
    const raiz = projeto();
    try {
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("rev-parse") && argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        throw new Error("sem rede");
      };
      const saida = sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, ambiente: ambiente(raiz), executar });
      expect(saida).toContain("Sincronizacao adiada");
      expect(() => JSON.parse(saida)).not.toThrow();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});