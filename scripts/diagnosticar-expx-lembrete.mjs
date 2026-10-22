#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  comLock,
  gravarEstadoAtomico,
  lerEstado,
} from "../nucleo/hooks/expx-lembrete-estado.mjs";

const WARMUPS = 5;
const SAMPLES = 30;
const HOOK = resolve("nucleo/hooks/expx-lembrete.sh");
const MODULE = resolve("nucleo/hooks/expx-lembrete.mjs");
const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
export const BASH = process.platform === "win32" && existsSync(GIT_BASH)
  ? GIT_BASH
  : [process.env.BASH, "/usr/bin/bash", "/bin/bash"].find((caminho) => caminho && existsSync(caminho)) ?? "bash";
const temporarios = [];

function temporario(prefixo) {
  const caminho = mkdtempSync(join(tmpdir(), prefixo));
  temporarios.push(caminho);
  return caminho;
}

function projeto() {
  const raiz = temporario("expx-diag-projeto-");
  const scratchpad = temporario("expx-diag-estado-");
  mkdirSync(join(raiz, ".claude", "skills", "runx"), { recursive: true });
  mkdirSync(join(raiz, ".expx"), { recursive: true });
  writeFileSync(join(raiz, ".claude", "skills", "runx", "SKILL.md"), "# runx\n");
  writeFileSync(join(raiz, ".expx", "estado.json"), JSON.stringify({ trabalho: "OC-DIAG", fase: "E1" }));
  return { raiz, scratchpad };
}

function evento(p, sessao, promptId) {
  return {
    cwd: p.raiz,
    prompt: "O sistema nao salva o pedido e retorna erro ao confirmar",
    prompt_id: promptId,
    scratchpad_dir: p.scratchpad,
    session_id: sessao,
    transcript_path: join(p.raiz, "transcript.jsonl"),
  };
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.ceil(p * ordenados.length) - 1] ?? 0;
}

function spawn(command, args, options = {}) {
  const inicio = performance.now();
  const resultado = spawnSync(command, args, { encoding: "utf8", timeout: 5_000, ...options });
  const ms = performance.now() - inicio;
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`${command} falhou (status=${resultado.status}): ${resultado.error?.message ?? resultado.stderr}`);
  }
  return ms;
}

function medir(nome, preparar, amostra) {
  const contexto = preparar();
  for (let i = 0; i < WARMUPS; i += 1) amostra(contexto, i, true);
  const valores = [];
  for (let i = 0; i < SAMPLES; i += 1) valores.push(amostra(contexto, i, false));
  return [nome, {
    samples: SAMPLES,
    p50_ms: Number(percentil(valores, 0.50).toFixed(3)),
    p95_ms: Number(percentil(valores, 0.95).toFixed(3)),
  }];
}

function executarHook(p, entrada, env = process.env) {
  return spawn(BASH, [HOOK], {
    cwd: p.raiz,
    env: { ...env, CLAUDE_PROJECT_DIR: p.raiz },
    input: JSON.stringify(entrada),
  });
}

export function ambienteFallback(pathVazio = temporario("expx-diag-sem-node-")) {
  return { ...process.env, PATH: pathVazio };
}

export function estadoLeituraDiagnostico() {
  return { versao: 1, eventos: [], trabalhos: [] };
}

export function estadoEscritaDiagnostico(indice, agora = Date.now()) {
  return {
    versao: 1,
    eventos: [{
      versao: 1,
      hash: String(indice).padStart(64, "0"),
      skill: "runx",
      timestamp: agora,
    }],
    trabalhos: [],
  };
}

function main() {
try {
  const noopDir = temporario("expx-diag-noop-");
  const noop = join(noopDir, "noop.sh");
  writeFileSync(noop, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(noop, 0o755);

  const componentes = Object.fromEntries([
    medir("harness_overhead", () => null, () => {
      const inicio = performance.now();
      return performance.now() - inicio;
    }),
    medir("empty_process", () => null, () => process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/c", "exit", "0"])
      : spawn("true", [])),
    medir("git_bash_init", () => null, () => spawn(BASH, ["-c", ":"])),
    medir("noop_shell_script", () => null, () => spawn(BASH, [noop])),
    medir("node_eval_empty", () => null, () => spawn(process.execPath, ["-e", ""])),
    medir("node_version", () => null, () => spawn(process.execPath, ["--version"])),
    medir("direct_esm", projeto, (p, i, warmup) => spawn(process.execPath, [MODULE], {
      cwd: p.raiz,
      env: { ...process.env, CLAUDE_PROJECT_DIR: p.raiz },
      input: JSON.stringify(evento(p, `esm-${warmup ? "w" : "s"}-${i}`, `p-${i}`)),
    })),
    medir("wrapper_first", projeto, (p, i, warmup) =>
      executarHook(p, evento(p, `wrapper-${warmup ? "w" : "s"}-${i}`, `p-${i}`))),
    medir("wrapper_repetition", () => {
      const p = projeto();
      const entrada = evento(p, "repeticao", "mesmo-prompt");
      executarHook(p, entrada);
      return { p, entrada };
    }, ({ p, entrada }) => executarHook(p, entrada)),
    medir("fallback_shell", () => ({ p: projeto(), env: ambienteFallback() }),
      ({ p, env }, i, warmup) =>
        executarHook(p, evento(p, `fallback-${warmup ? "w" : "s"}-${i}`, `p-${i}`), env)),
    medir("state_lock", () => temporario("expx-diag-lock-"), (raiz) => {
      const inicio = performance.now();
      comLock(raiz, () => undefined);
      return performance.now() - inicio;
    }),
    medir("state_read", () => {
      const raiz = temporario("expx-diag-read-");
      gravarEstadoAtomico(raiz, estadoLeituraDiagnostico());
      return raiz;
    }, (raiz) => {
      const inicio = performance.now();
      lerEstado(raiz);
      return performance.now() - inicio;
    }),
    medir("state_fsync_rename", () => temporario("expx-diag-write-"), (raiz, i) => {
      const inicio = performance.now();
      gravarEstadoAtomico(raiz, estadoEscritaDiagnostico(i));
      return performance.now() - inicio;
    }),
  ]);

  process.stdout.write(`${JSON.stringify({
    schema: 1,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    bash: BASH,
    warmups: WARMUPS,
    samples: SAMPLES,
    componentes,
    process_model: {
      direct_esm: { total: 1, processes: ["node"] },
      wrapper_node: { total: 2, processes: ["bash", "node bootstrap + module"], node_invocations: 1 },
      fallback_shell_minimum: { total: 1, processes: ["bash"], node_invocations: 0 },
    },
  }, null, 2)}\n`);
} finally {
  for (const caminho of temporarios.reverse()) rmSync(caminho, { recursive: true, force: true });
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
