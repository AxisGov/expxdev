import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const AXIS_REPOSITORIO = "https://github.com/AxisGov/expxdev.git";
const CACHE_OWNER = "AxisGov/expxdev\n";

const comandoPadrao = (arquivo, argumentos, opcoes = {}) =>
  execFileSync(arquivo, argumentos, {
    ...opcoes,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function cachePadrao(ambiente) {
  if (ambiente.EXPX_AXIS_CACHE !== undefined) return ambiente.EXPX_AXIS_CACHE;
  const base = ambiente.XDG_CACHE_HOME ?? join(ambiente.HOME ?? homedir(), ".cache");
  return join(base, "axisgov", "expxdev");
}

export function construirComandoNpm(argumentos, plataforma = process.platform, ambiente = process.env) {
  if (plataforma === "win32") {
    return { arquivo: ambiente.ComSpec || "cmd.exe", argumentos: ["/d", "/s", "/c", "npm", ...argumentos] };
  }
  return { arquivo: "npm", argumentos: [...argumentos] };
}

function executarNpm(cache, argumentos, executar) {
  const comando = construirComandoNpm(argumentos);
  executar(comando.arquivo, comando.argumentos, { cwd: cache });
}

function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const LOCK_STALE_MS = 60_000;
const CACHE_METADATA = new Set([".axis-cache-owner", ".axis-build-sha"]);

function cacheEstaSujo(cache, executar) {
  const status = executar("git", ["-C", cache, "status", "--porcelain"]);
  return status.split("\n").some((linha) => {
    if (linha.trim() === "") return false;
    return !CACHE_METADATA.has(linha.slice(3).trim());
  });
}

function adquirirLock(bloqueio) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      mkdirSync(bloqueio);
      writeFileSync(join(bloqueio, "owner.json"), JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
      return;
    } catch {
      if (tentativa > 0) throw new Error("bootstrap em andamento");
      let idade;
      try {
        idade = Date.now() - statSync(bloqueio).mtimeMs;
      } catch {
        throw new Error("bootstrap em andamento");
      }
      try {
        const dono = JSON.parse(readFileSync(join(bloqueio, "owner.json"), "utf8"));
        if (processoVivo(dono.pid)) throw new Error("bootstrap em andamento");
      } catch (erro) {
        if (erro instanceof Error && erro.message === "bootstrap em andamento") throw erro;
        if (idade < LOCK_STALE_MS) throw new Error("bootstrap em andamento");
      }
      try {
        rmSync(bloqueio, { recursive: true, force: true });
      } catch {
        throw new Error("bootstrap em andamento");
      }
    }
  }
}

function buildCache(cache, executar) {
  executarNpm(cache, ["ci"], executar);
  executarNpm(cache, ["run", "build:server"], executar);
  const commit = executar("git", ["-C", cache, "rev-parse", "HEAD"]).trim();
  writeFileSync(join(cache, ".axis-build-sha"), `${commit}\n`);
}

function clonarCache(cache, executar) {
  const temporario = `${cache}.tmp-${process.pid}`;
  rmSync(temporario, { recursive: true, force: true });
  try {
    executar("git", ["clone", "--branch", "main", "--single-branch", AXIS_REPOSITORIO, temporario]);
    writeFileSync(join(temporario, ".axis-cache-owner"), CACHE_OWNER);
    buildCache(temporario, executar);
    renameSync(temporario, cache);
  } catch (erro) {
    rmSync(temporario, { recursive: true, force: true });
    throw erro;
  }
}

export function bootstrapAxis(cache, executar = comandoPadrao) {
  const bloqueio = `${cache}.lock`;
  mkdirSync(dirname(cache), { recursive: true });
  adquirirLock(bloqueio);
  const existiaAntes = existsSync(cache);

  try {
    if (!existiaAntes) {
      clonarCache(cache, executar);
      return cache;
    }

    if (!existsSync(join(cache, ".git"))) {
      const ownership = join(cache, ".axis-cache-owner");
      if (!existsSync(ownership) || readFileSync(ownership, "utf8") !== CACHE_OWNER) {
        throw new Error("caminho de cache existente nao e um cache Axis gerenciado");
      }
      rmSync(cache, { recursive: true, force: true });
      clonarCache(cache, executar);
      return cache;
    }
    const remoto = executar("git", ["-C", cache, "remote", "get-url", "origin"]).trim();
    if (remoto !== AXIS_REPOSITORIO) throw new Error("cache nao aponta para AxisGov/expxdev");
    executar("git", ["-C", cache, "fetch", "origin", "main"]);
    const local = executar("git", ["-C", cache, "rev-parse", "HEAD"]).trim();
    const remotoMain = executar("git", ["-C", cache, "rev-parse", "origin/main"]).trim();
    let marcador = "";
    try {
      marcador = readFileSync(join(cache, ".axis-build-sha"), "utf8").trim();
    } catch {
      // marcador ausente: o cache precisa ser reconstruido
    }
    if (local !== remotoMain || marcador !== local || !existsSync(join(cache, "dist", "cli", "expx-bin.js"))) {
      if (cacheEstaSujo(cache, executar)) {
        throw new Error("cache Axis possui alteracoes nao commitadas");
      }
      const branch = executar("git", ["-C", cache, "branch", "--show-current"]).trim();
      if (branch !== "main") throw new Error("cache Axis nao esta na branch main");
      if (local !== remotoMain) {
        try {
          executar("git", ["-C", cache, "merge-base", "--is-ancestor", local, remotoMain]);
        } catch {
          throw new Error("cache Axis possui commits locais");
        }
      }
      executar("git", ["-C", cache, "reset", "--hard", "origin/main"]);
      buildCache(cache, executar);
    }
    return cache;
  } catch (erro) {
    if (!existiaAntes) rmSync(cache, { recursive: true, force: true });
    throw erro;
  } finally {
    rmSync(bloqueio, { recursive: true, force: true });
  }
}

function resposta(contexto) {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: contexto,
    },
  })}\n`;
}

function arvoreSuja(raiz, executar) {
  return executar("git", ["-C", raiz, "status", "--porcelain"]).trim() !== "";
}

function raizGit(cwd, executar) {
  return executar("git", ["-C", cwd, "rev-parse", "--show-toplevel"]).trim();
}

function houveAtualizacao(saida) {
  return saida.includes("para desfazer esta atualizacao");
}

function nomesAtualizados(saida) {
  return [...saida.matchAll(/^([a-z0-9-]+): .*→/gm)].map(([, nome]) => nome).filter(Boolean);
}

export function sincronizarSessao({ entrada, plataforma = "claude", raiz, cwd, ambiente = process.env, executar = comandoPadrao }) {
  try {
    const evento = JSON.parse(entrada);
    const fontes = ["startup", "resume"];
    if (!fontes.includes(evento?.source)) return "";
    const base = plataforma === "codex" ? (cwd ?? evento?.cwd ?? process.cwd()) : (raiz ?? ambiente.CLAUDE_PROJECT_DIR ?? process.cwd());
    if (plataforma === "claude" && !existsSync(join(base, ".expx", "expx-lock.json"))) return "";
      let projeto;
      try {
        projeto = raizGit(base, executar);
      } catch {
        return "";
      }
    if (!existsSync(join(projeto, ".expx", "expx-lock.json"))) return "";
    if (arvoreSuja(projeto, executar)) {
      return resposta("[Expx/Axis] Atualizacao automatica adiada porque o working tree possui alteracoes nao commitadas.");
    }
    const cache = bootstrapAxis(cachePadrao(ambiente), executar);
    const saida = executar(process.execPath, [join(cache, "dist", "cli", "expx-bin.js"), "update", "--latest", "--yes"], { cwd: projeto });
    if (houveAtualizacao(saida)) {
      const nomes = nomesAtualizados(saida);
      const detalhe = nomes.length > 0 ? ` Skills atualizadas: ${nomes.join(", ")}.` : "";
      return resposta(`[Expx/Axis] Distribuicao sincronizada com AxisGov.${detalhe}`);
    }
    return "";
  } catch (erro) {
    return resposta(`[Expx/Axis] Sincronizacao adiada: ${erro instanceof Error ? erro.message : "falha inesperada"}`);
  }
}

if (process.argv[1]?.endsWith("expx-session-sync.mjs") === true) {
  let entrada = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (parte) => { entrada += parte; });
  const plataforma = process.argv.includes("--codex") ? "codex" : "claude";
  process.stdin.on("end", () => process.stdout.write(sincronizarSessao({ entrada, plataforma })));
}