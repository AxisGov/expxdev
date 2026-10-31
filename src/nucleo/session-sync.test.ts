import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The runtime helper is intentionally shipped as a Node module beside the harness adapters.
import { AXIS_REPOSITORIO, adquirirLock, bootstrapAxis, construirComandoNpm, lerOrigemDoLock, maiorRelease, marcadorDoBuild, sincronizarSessao } from "../../nucleo/hooks/expx-session-sync.mjs";

function ambiente(raiz: string): Record<string, string> {
  return { EXPX_AXIS_CACHE: join(raiz, "cache"), HOME: raiz };
}

function travada(repositorio: string, commit: string): Record<string, unknown> {
  return { repositorio, referencia: "main", travado: false, commit, resolvido_em: "2026-09-27", arquivos: {} };
}

function lockCom(skills: Record<string, unknown>): Record<string, unknown> {
  return { lock_version: 2, cli_version: "0.7.0", harness: ["claude"], skills };
}

const LOCK_REMOTO = lockCom({ sprintx: travada("https://github.com/AxisGov/SprintX", "ed7c7343165fc3b7dcf97895568015632c07457c") });

/** `null`: projeto sem lock. String: bytes exatos do lock (para lock inválido). */
function projeto(lock: Record<string, unknown> | string | null = LOCK_REMOTO): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-session-sync-"));
  if (lock !== null) {
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(join(raiz, ".expx", "expx-lock.json"), typeof lock === "string" ? lock : `${JSON.stringify(lock, null, 2)}\n`);
  }
  return raiz;
}

describe("lock válido antes de cache e rede", () => {
  const skill = { repositorio: "https://github.com/AxisGov/SprintX", referencia: "main", travado: true, commit: "a".repeat(40), resolvido_em: "2026-10-31", arquivos: {} };
  function ler(lock: unknown): { ok: boolean; motivo?: string } {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-forma-"));
    const caminho = join(raiz, "lock.json");
    writeFileSync(caminho, JSON.stringify(lock));
    const r = lerOrigemDoLock(caminho) as { ok: boolean; motivo?: string };
    rmSync(raiz, { recursive: true, force: true });
    return r;
  }

  it("funcional: lock completo passa", () => {
    expect(ler({ lock_version: 2, cli_version: "0.12.11", harness: ["claude"], skills: { sprintx: skill } }).ok).toBe(true);
  });

  it("funcional: lock só com strings de commit é inválido", () => {
    expect(ler({ lock_version: 2, cli_version: "0.12.11", harness: ["claude"], skills: { sprintx: { commit: "abc" } } }).ok).toBe(false);
  });

  it("funcional: sem lock_version ou harness é inválido", () => {
    expect(ler({ cli_version: "0.12.11", harness: ["claude"], skills: { sprintx: skill } }).ok).toBe(false);
    expect(ler({ lock_version: 2, harness: ["claude"], skills: { sprintx: skill } }).ok).toBe(false);
    expect(ler({ lock_version: 2, cli_version: "0.12.11", skills: { sprintx: skill } }).ok).toBe(false);
  });

  it("funcional: `arquivos` fora de forma é inválido", () => {
    const base = { lock_version: 2, cli_version: "0.12.11", harness: ["claude"] };
    expect(ler({ ...base, skills: { sprintx: { ...skill, arquivos: [] } } }).ok).toBe(false);
    expect(ler({ ...base, skills: { sprintx: { ...skill, travado: "sim" } } }).ok).toBe(false);
    expect(ler({ ...base, skills: { sprintx: { ...skill, referencia: "" } } }).ok).toBe(false);
    expect(ler({ ...base, skills: { sprintx: { ...skill, arquivos: { a: 42 } } } }).ok).toBe(false);
    expect(ler({ ...base, harness: [42], skills: { sprintx: skill } }).ok).toBe(false);
  });
});

describe("repositório-fonte do CLI no SessionStart", () => {
  const FONTE = { name: "expxdev", repository: { type: "git", url: "git+https://github.com/AxisGov/expxdev.git" } };

  function sincronizar(pacote: string): { saida: string; chamadas: string[][] } {
    const raiz = projeto();
    writeFileSync(join(raiz, "package.json"), pacote);
    const chamadas: string[][] = [];
    const executar = (arquivo: string, argumentos: string[]) => {
      chamadas.push([arquivo, ...argumentos]);
      if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
      if (argumentos.includes("status")) throw new Error("parou aqui");
      return "";
    };
    const saida = sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, ambiente: ambiente(raiz), executar });
    rmSync(raiz, { recursive: true, force: true });
    return { saida, chamadas };
  }

  it("funcional: na fonte, nada de status, rede ou update, e nenhuma mensagem", () => {
    const { saida, chamadas } = sincronizar(JSON.stringify(FONTE));
    expect(saida).toBe("");
    expect(chamadas.filter((c) => !c.includes("--show-toplevel"))).toEqual([]);
  });

  it("funcional: o `expxdev` de outro autor segue o fluxo comum", () => {
    const { chamadas } = sincronizar(JSON.stringify({ name: "expxdev", repository: "https://github.com/outro/expxdev.git" }));
    expect(chamadas.some((c) => c.includes("status"))).toBe(true);
  });

  it("funcional: package.json ilegível não é a fonte", () => {
    const { chamadas } = sincronizar("{ nao e json");
    expect(chamadas.some((c) => c.includes("status"))).toBe(true);
  });
});

describe("sincronização Axis no SessionStart", () => {
  it("integração: bootstrap fixa o repositório AxisGov e a branch main", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    const chamadas: Array<{ arquivo: string; argumentos: string[] }> = [];
    const executar = (arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      chamadas.push({ arquivo, argumentos });
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("rev-parse")) return "mesmo\n";
      return "";
    };
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "mesmo")}\n`);
    bootstrapAxis(cache, executar);
    expect(chamadas.some((c) => c.argumentos.includes(AXIS_REPOSITORIO))).toBe(false);
    // A refspec explícita atualiza origin/main sempre: a guarda de commit local
    // compara o HEAD com ela, e uma origin/main velha recusaria o cache à toa.
    expect(chamadas).toContainEqual({ arquivo: "git", argumentos: ["-C", cache, "fetch", "--tags", "origin", "+refs/heads/main:refs/remotes/origin/main"] });
    expect(AXIS_REPOSITORIO).toBe("https://github.com/AxisGov/expxdev.git");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("integração: bootstrap novo clona AxisGov/main e constrói o servidor", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-novo-"));
    const cache = join(raiz, "cache", "axisgov", "expxdev");
    const chamadas: Array<{ arquivo: string; argumentos: string[] }> = [];
    const executar = (arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      chamadas.push({ arquivo, argumentos });
      if (argumentos[0] === "clone") mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      return "";
    };
    bootstrapAxis(cache, executar);
    expect(chamadas[0]?.arquivo).toBe("git");
    expect(chamadas[0]?.argumentos.slice(0, -1)).toEqual(["clone", "--branch", "main", "--single-branch", AXIS_REPOSITORIO]);
    expect(chamadas[0]?.argumentos.at(-1)).toContain(`${cache}.tmp-`);
    expect(chamadas.some((c) => c.argumentos.includes("ci"))).toBe(true);
    expect(chamadas.some((c) => c.argumentos.includes("build:server"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  // O CLI do SessionStart é o da última release, e não a ponta da main do
  // expxdev: é a release que certifica os commits das skills.
  it("funcional: a maior release é escolhida número a número, sem pré-lançamento", () => {
    expect(maiorRelease(["v0.9.9", "v0.12.9", "v0.12.10-rc.1", "nao-release", "v0.10.0", ""])).toBe("v0.12.9");
    expect(maiorRelease(["main", ""])).toBeUndefined();
  });

  it("integração: cache que seguia a main vai para a maior release, e o build é refeito", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-release-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "ponta")}\n`);
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("tag")) return "v0.9.9\nv0.12.9\nv0.12.10-rc.1\n";
      if (argumentos.includes("v0.12.9^{commit}")) return "release\n";
      if (argumentos.includes("rev-parse")) return "ponta\n";
      if (argumentos.includes("branch")) return "main\n";
      return "";
    };
    bootstrapAxis(cache, executar);
    expect(chamadas).toContainEqual(["-C", cache, "reset", "--hard", "release"]);
    expect(chamadas.some((a) => a.includes("origin/main") && a.includes("reset"))).toBe(false);
    expect(chamadas.some((a) => a.includes("build:server"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it.each([
    ["o cache atrás da main", false],
    // Sem a refspec configurada, só a refspec explícita do fetch atualiza origin/main;
    // com ela velha, o HEAD publicado à frente seria recusado como commit local.
    ["o cache sem refspec configurada, com o HEAD publicado à frente de origin/main", true],
  ] as const)("integração: com git real, %s vai para a maior release, e origin/main é atualizada", (_caso, semRefspec) => {
    // O git roda de verdade; só a URL do remoto (o cache aponta para um repositório
    // local, não para o GitHub) e o npm (o build) são simulados.
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-git-real-"));
    const fonte = join(raiz, "fonte");
    const cache = join(raiz, "cache");
    const ambienteGit = { ...process.env, GIT_AUTHOR_NAME: "a", GIT_AUTHOR_EMAIL: "a@a.invalid", GIT_COMMITTER_NAME: "a", GIT_COMMITTER_EMAIL: "a@a.invalid", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, env: ambienteGit, encoding: "utf8" }).trim();
    try {
      mkdirSync(fonte);
      git(fonte, "init", "-q", "-b", "main");
      const commit = (msg: string): string => { git(fonte, "commit", "-q", "--allow-empty", "-m", msg); return git(fonte, "rev-parse", "HEAD"); };
      // como no expxdev, o build fica fora do versionamento
      writeFileSync(join(fonte, ".gitignore"), "dist/\nnode_modules/\n");
      git(fonte, "add", ".gitignore");
      commit("1");
      git(fonte, "tag", "v0.1.0");
      const doisNoCache = commit("2");
      execFileSync("git", ["clone", "-q", "--branch", "main", "--single-branch", fonte, cache], { env: ambienteGit });
      mkdirSync(join(cache, "dist", "cli"), { recursive: true });
      writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
      writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, doisNoCache)}\n`);
      // depois do cache: a release v0.2.0 e mais um commit na main, ainda não liberado
      const release = commit("3");
      git(fonte, "tag", "v0.2.0");
      const ponta = commit("4");
      // uma tag de release fora da main revisada (branch lateral): nunca é escolhida
      git(fonte, "checkout", "-q", "-b", "lateral", release);
      commit("lateral");
      git(fonte, "tag", "v0.3.0");
      git(fonte, "checkout", "-q", "main");
      if (semRefspec) {
        git(cache, "config", "--unset", "remote.origin.fetch");
        git(cache, "fetch", "-q", "origin", "main");
        git(cache, "reset", "-q", "--hard", "FETCH_HEAD");
        writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, ponta)}\n`);
      }
      expect(git(cache, "rev-parse", "origin/main")).toBe(doisNoCache);

      const executar = (arquivo: string, argumentos: string[], opcoes: { cwd?: string } = {}): string => {
        if (argumentos.includes("remote") && argumentos.includes("get-url")) return `${AXIS_REPOSITORIO}\n`;
        if (arquivo !== "git") {
          // o build: o CLI montado aparece no cache
          mkdirSync(join(opcoes.cwd ?? cache, "dist", "cli"), { recursive: true });
          writeFileSync(join(opcoes.cwd ?? cache, "dist", "cli", "expx-bin.js"), "");
          return "";
        }
        return execFileSync("git", argumentos, { env: ambienteGit, encoding: "utf8", ...opcoes });
      };
      bootstrapAxis(cache, executar);

      expect(git(cache, "rev-parse", "HEAD")).toBe(release);
      expect(git(cache, "rev-parse", "origin/main")).toBe(ponta);
      expect(git(cache, "tag", "--list").split("\n").sort()).toEqual(["v0.1.0", "v0.2.0", "v0.3.0"]);
      expect(readFileSync(join(cache, ".axis-build-sha"), "utf8").trim()).toBe(marcadorDoBuild(cache, release));
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("funcional: a maior release fora da main é ignorada, e vale a maior que está nela", () => {
    // CodeAnt no expxdev#111: o `fetch --tags` traz qualquer tag vX.Y.Z, inclusive de
    // commit que nunca entrou na main revisada.
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-release-fora-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "");
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "ponta")}\n`);
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("tag")) return "v0.12.9\nv0.13.0\n";
      if (argumentos.includes("v0.13.0^{commit}")) return "fora\n";
      if (argumentos.includes("v0.12.9^{commit}")) return "release\n";
      if (argumentos.includes("merge-base") && argumentos.includes("fora")) throw new Error("nao e ancestral");
      if (argumentos.includes("rev-parse")) return "ponta\n";
      if (argumentos.includes("branch")) return "main\n";
      return "";
    };
    bootstrapAxis(cache, executar);
    expect(chamadas).toContainEqual(["-C", cache, "reset", "--hard", "release"]);
    expect(chamadas.some((a) => a.includes("reset") && a.includes("fora"))).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: clone novo vai para a release antes do build", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-release-novo-"));
    const cache = join(raiz, "cache");
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      chamadas.push(argumentos);
      if (argumentos[0] === "clone") mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      if (argumentos.includes("tag")) return "v0.12.8\nv0.12.9\n";
      if (argumentos.includes("v0.12.9^{commit}")) return "release\n";
      return "";
    };
    bootstrapAxis(cache, executar);
    const reset = chamadas.findIndex((a) => a.includes("reset") && a.includes("release"));
    const build = chamadas.findIndex((a) => a.includes("ci"));
    expect(reset).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(reset);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: sem release publicada, o cache não muda e a sincronização adia", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-bootstrap-sem-release-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("tag")) return "";
      if (argumentos.includes("rev-parse")) return "ponta\n";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("nenhuma release do expxdev");
    expect(chamadas.some((a) => a.includes("reset"))).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: existência do cache é observada depois do lock", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-lock-"));
    const cache = join(raiz, "cache");
    let clones = 0;
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos[0] === "clone") {
        clones++;
        mkdirSync(join(argumentos.at(-1)!, ".git", "refs"), { recursive: true });
        mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      }
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "same\n";
      if (argumentos.includes("branch")) return "main\n";
      if (argumentos.includes("merge-base")) return "";
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
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos[0] === "clone") {
        mkdirSync(argumentos.at(-1)!, { recursive: true });
        if (primeira) {
          primeira = false;
          throw new Error("clone interrompido");
        }
        mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      }
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      return "commit\n";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("clone interrompido");
    expect(existsSync(cache)).toBe(false);
    expect(() => bootstrapAxis(cache, executar)).not.toThrow();
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: diretório arbitrário sem ownership não é apagado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-parcial-"));
    const cache = join(raiz, "cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "resto.tmp"), "parcial");
    expect(() => bootstrapAxis(cache, () => "")).toThrow("caminho de cache existente nao e um cache Axis gerenciado");
    expect(existsSync(join(cache, "resto.tmp"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache parcial com ownership Axis é recuperado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-parcial-axis-"));
    const cache = join(raiz, "cache");
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, ".axis-cache-owner"), "AxisGov/expxdev\n");
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos[0] === "clone") mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      return "commit\n";
    };
    expect(() => bootstrapAxis(cache, executar)).not.toThrow();
    expect(existsSync(join(cache, ".axis-cache-owner"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache com origin diferente não é apagado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-outro-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    writeFileSync(join(cache, "preservar.txt"), "nao apagar");
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos.includes("remote")) return "https://example.invalid/outro.git\n";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("cache nao aponta para AxisGov/expxdev");
    expect(existsSync(join(cache, "preservar.txt"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: dist alterado com o mesmo commit reconstrói o cache", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-dist-alterado-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "original");
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "mesmo")}\n`);
    writeFileSync(join(cache, "dist", "cli", "expx-bin.js"), "alterado");
    let construiu = false;
    bootstrapAxis(cache, (_arquivo, argumentos) => {
      // no Windows o npm roda pelo cmd.exe: quem identifica o build são os argumentos
      if (argumentos.includes("build:server")) construiu = true;
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
      if (argumentos.includes("rev-parse")) return "mesmo\n";
      if (argumentos.includes("--show-current")) return "main\n";
      return "";
    });
    expect(construiu).toBe(true);
    expect(readFileSync(join(cache, ".axis-build-sha"), "utf8").trim()).toBe(marcadorDoBuild(cache, "mesmo"));
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: a recuperação em curso de outro processo não é atropelada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-recuperacao-"));
    const cache = join(raiz, "cache");
    mkdirSync(`${cache}.lock`, { recursive: true });
    writeFileSync(join(`${cache}.lock`, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    mkdirSync(`${cache}.lock.recuperacao`);
    expect(() => bootstrapAxis(cache, () => "")).toThrow("bootstrap em andamento");
    expect(existsSync(`${cache}.lock`)).toBe(true);
    expect(existsSync(`${cache}.lock.recuperacao`)).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: recuperação abandonada sai, e a sessão seguinte retoma", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-recuperacao-velha-"));
    const bloqueio = join(raiz, "cache.lock");
    mkdirSync(bloqueio);
    writeFileSync(join(bloqueio, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    mkdirSync(`${bloqueio}.recuperacao`);
    const antigo = new Date(Date.now() - 120_000);
    utimesSync(`${bloqueio}.recuperacao`, antigo, antigo);
    expect(() => adquirirLock(bloqueio)).toThrow("bootstrap em andamento");
    expect(existsSync(`${bloqueio}.recuperacao`)).toBe(false);
    expect(() => adquirirLock(bloqueio)).not.toThrow();
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: recuperação de dono vivo não sai, mesmo velha", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-recuperacao-viva-"));
    const bloqueio = join(raiz, "cache.lock");
    mkdirSync(bloqueio);
    writeFileSync(join(bloqueio, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    mkdirSync(`${bloqueio}.recuperacao`);
    writeFileSync(join(`${bloqueio}.recuperacao`, "owner.json"), JSON.stringify({ pid: process.pid, timestamp: 1 }));
    const antigo = new Date(Date.now() - 120_000);
    utimesSync(`${bloqueio}.recuperacao`, antigo, antigo);
    expect(() => adquirirLock(bloqueio)).toThrow("bootstrap em andamento");
    expect(existsSync(`${bloqueio}.recuperacao`)).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: recuperação de dono morto sai, e a sessão seguinte retoma", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-recuperacao-morta-"));
    const bloqueio = join(raiz, "cache.lock");
    mkdirSync(bloqueio);
    writeFileSync(join(bloqueio, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    mkdirSync(`${bloqueio}.recuperacao`);
    writeFileSync(join(`${bloqueio}.recuperacao`, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    expect(() => adquirirLock(bloqueio)).toThrow("bootstrap em andamento");
    expect(() => adquirirLock(bloqueio)).not.toThrow();
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: erro real no rename não vira bootstrap em andamento", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-erro-"));
    const bloqueio = join(raiz, "sem-pasta", "cache.lock");
    expect(() => adquirirLock(bloqueio)).toThrow(/ENOENT/);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: a trava nasce com dono, sem pasta de montagem sobrando", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-atomica-"));
    const bloqueio = join(raiz, "cache.lock");
    adquirirLock(bloqueio);
    expect(JSON.parse(readFileSync(join(bloqueio, "owner.json"), "utf8")).pid).toBe(process.pid);
    expect(readdirSync(raiz)).toEqual(["cache.lock"]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: falha ao gravar o dono não deixa trava parcial", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-parcial-"));
    const bloqueio = join(raiz, "cache.lock");
    const falhar = (): never => { throw new Error("disco cheio"); };
    expect(() => adquirirLock(bloqueio, falhar)).toThrow("disco cheio");
    expect(readdirSync(raiz)).toEqual([]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("integração: processos simultâneos sobre trava velha não se sobrepõem", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-corrida-"));
    const bloqueio = join(raiz, "cache.lock");
    mkdirSync(bloqueio);
    writeFileSync(join(bloqueio, "owner.json"), JSON.stringify({ pid: 999999, timestamp: 1 }));
    const hook = new URL("../../nucleo/hooks/expx-session-sync.mjs", import.meta.url).href;
    const secao = join(raiz, "secao");
    const script = `
      import { mkdirSync, rmdirSync } from "node:fs";
      const { adquirirLock } = await import(${JSON.stringify(hook)});
      try { adquirirLock(${JSON.stringify(bloqueio)}); } catch { process.exit(0); }
      mkdirSync(${JSON.stringify(secao)});
      await new Promise((r) => setTimeout(r, 300));
      rmdirSync(${JSON.stringify(secao)});
    `;
    const codigos = await Promise.all(Array.from({ length: 6 }, () => new Promise<number | null>((resolve) => {
      spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: "ignore" }).on("close", resolve);
    })));
    expect(codigos).toEqual([0, 0, 0, 0, 0, 0]);
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
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos[0] === "clone") mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
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
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos[0] === "clone") mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
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
      if (argumentos.includes("tag")) return "v0.12.9\n";
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "new-commit\n";
      if (argumentos.includes("branch")) return "main\n";
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
      if (argumentos.includes("tag")) return "v0.12.9\n";
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

  it("funcional: somente metadata Axis deixa o cache limpo", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-meta-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, ".axis-cache-owner"), "AxisGov/expxdev\n");
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "old")}\n`);
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "new\n";
      if (argumentos.includes("status")) return "?? .axis-cache-owner\n?? .axis-build-sha\n";
      if (argumentos.includes("branch")) return "main\n";
      if (argumentos.includes("merge-base")) return "";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).not.toThrow();
    expect(chamadas.some((a) => a.includes("reset"))).toBe(true);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: cache em branch diferente não executa reset", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-branch-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "old")}\n`);
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("rev-parse")) return "new\n";
      if (argumentos.includes("branch")) return "feature\n";
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("cache Axis nao esta na branch main");
    expect(chamadas.some((a) => a.includes("reset"))).toBe(false);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("funcional: commits locais divergentes não executam reset", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-cache-commit-local-"));
    const cache = join(raiz, "cache");
    mkdirSync(join(cache, ".git"), { recursive: true });
    mkdirSync(join(cache, "dist", "cli"), { recursive: true });
    writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "old")}\n`);
    const chamadas: string[][] = [];
    const executar = (_arquivo: string, argumentos: string[]) => {
      if (argumentos.includes("tag")) return "v0.12.9\n";
      chamadas.push(argumentos);
      if (argumentos.includes("remote")) return AXIS_REPOSITORIO;
      if (argumentos.includes("origin/main")) return "remote-commit\n";
      if (argumentos.includes("rev-parse")) return "local-commit\n";
      if (argumentos.includes("branch")) return "main\n";
      if (argumentos.includes("merge-base") && argumentos.includes("local-commit")) throw new Error("divergente");
      return "";
    };
    expect(() => bootstrapAxis(cache, executar)).toThrow("cache Axis possui commits locais");
    expect(chamadas.some((a) => a.includes("reset"))).toBe(false);
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
      writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "same")}\n`);
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
      writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "same")}\n`);
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
      writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, "same")}\n`);
      const chamadas: string[][] = [];
      const executar = (_arquivo: string, argumentos: string[]) => {
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
    const raiz = projeto(null);
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
        chamadas.push({ arquivo, argumentos });
        if (argumentos.includes("rev-parse") && argumentos.includes("--show-toplevel")) return `${raiz}\n`;
        if (argumentos.includes("status")) return "";
        if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
        if (argumentos.includes("rev-parse")) return "mesmo\n";
        if (argumentos.includes("branch")) return "main\n";
        if (argumentos.includes("merge-base")) return "";
        if (argumentos.some((argumento) => argumento.endsWith("expx-bin.js"))) return "sprintx: main → novo\npara desfazer esta atualizacao, reverta\n";
        return "";
      };
      const saida = sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, ambiente: ambiente(raiz), executar });
      expect(saida).toContain("Skills atualizadas: sprintx.");
      expect(Object.keys(JSON.parse(saida).hookSpecificOutput).sort()).toEqual(["additionalContext", "hookEventName"]);
      expect(saida).not.toContain("reloadSkills");
      const cli = chamadas.find((c) => c.argumentos.some((argumento) => argumento.endsWith("expx-bin.js")));
      expect(cli?.arquivo).toMatch(/node/);
      expect(cli?.argumentos.slice(-2)).toEqual(["update", "--yes"]);
      expect(cli?.argumentos).not.toContain("--latest");
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
        if (argumentos.includes("tag")) return "v0.12.9\n";
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