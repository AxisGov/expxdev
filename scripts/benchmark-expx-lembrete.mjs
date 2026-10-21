#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const WARMUPS = 10;
const SAMPLES = 200;
const HOOK = resolve("nucleo/hooks/expx-lembrete.sh");
const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
const BASH = process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash";
const temporarios = [];

function temporario(prefixo) {
  const caminho = mkdtempSync(join(tmpdir(), prefixo));
  temporarios.push(caminho);
  return caminho;
}

function criarScript(nome, conteudo) {
  const pasta = temporario(`expx-benchmark-${nome}-`);
  const caminho = join(pasta, `${nome}.sh`);
  writeFileSync(caminho, conteudo);
  chmodSync(caminho, 0o755);
  return caminho;
}

function projeto() {
  const raiz = temporario("expx-benchmark-projeto-");
  const scratchpad = temporario("expx-benchmark-estado-");
  mkdirSync(join(raiz, ".claude", "skills", "runx"), { recursive: true });
  mkdirSync(join(raiz, ".expx"), { recursive: true });
  writeFileSync(join(raiz, ".claude", "skills", "runx", "SKILL.md"), "# runx\n");
  writeFileSync(join(raiz, ".expx", "estado.json"), JSON.stringify({ trabalho: "OC-BENCH", fase: "E1" }));
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

function executar(script, p, entrada, env = process.env) {
  const inicio = performance.now();
  const resultado = spawnSync(BASH, [script], {
    cwd: p.raiz,
    encoding: "utf8",
    env: { ...env, CLAUDE_PROJECT_DIR: p.raiz },
    input: JSON.stringify(entrada),
    timeout: 5_000,
  });
  const ms = performance.now() - inicio;
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`${script} falhou (status=${resultado.status}): ${resultado.error?.message ?? resultado.stderr}`);
  }
  return { ms, bytes: Buffer.byteLength(resultado.stdout, "utf8") };
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.ceil(p * ordenados.length) - 1] ?? 0;
}

function resumo(valores) {
  return {
    p50_ms: Number(percentil(valores, 0.50).toFixed(3)),
    p95_ms: Number(percentil(valores, 0.95).toFixed(3)),
  };
}

function medirPar(nome, preparar, medirHook, medirBaseline, processos) {
  const contexto = preparar();
  const executarPar = (indice, aquecimento) => {
    let hook;
    let baseline;
    if (indice % 2 === 0) {
      baseline = medirBaseline(contexto, indice, aquecimento);
      hook = medirHook(contexto, indice, aquecimento);
    } else {
      hook = medirHook(contexto, indice, aquecimento);
      baseline = medirBaseline(contexto, indice, aquecimento);
    }
    return { hook, baseline, delta: hook.ms - baseline.ms };
  };
  for (let i = 0; i < WARMUPS; i += 1) executarPar(i, true);
  const pares = [];
  for (let i = 0; i < SAMPLES; i += 1) pares.push(executarPar(i, false));
  const bytes = pares.map(({ hook }) => hook.bytes);
  const absolute = resumo(pares.map(({ hook }) => hook.ms));
  const baseline = resumo(pares.map(({ baseline }) => baseline.ms));
  return [nome, {
    samples: SAMPLES,
    absolute,
    baseline,
    incremental_p95_ms: Math.max(0, Number((absolute.p95_ms - baseline.p95_ms).toFixed(3))),
    paired_delta: resumo(pares.map(({ delta }) => delta)),
    bytes_min: Math.min(...bytes),
    bytes_max: Math.max(...bytes),
    processes: processos,
  }];
}

function ambienteSemNode() {
  return { ...process.env, PATH: temporario("expx-benchmark-sem-node-") };
}

export function codigoSaidaDoGate(gate) {
  return gate.passed ? 0 : 1;
}

function main() {
try {
  const moduloNoopDir = temporario("expx-benchmark-node-module-");
  const moduloNoop = join(moduloNoopDir, "noop.mjs");
  writeFileSync(moduloNoop, "import { readFileSync } from 'node:fs';\nreadFileSync(0, 'utf8');\n");
  const moduloNoopBash = moduloNoop.replaceAll("\\", "/");
  const baselineNode = criarScript("node-noop", `#!/usr/bin/env bash
EVENTO=""
IFS= read -r -d '' EVENTO || true
SAIDA="$(node "${moduloNoopBash}" <<< "$EVENTO" 2>/dev/null)"
printf '%s' "$SAIDA"
exit 0
`);
  const baselineShell = criarScript("shell-noop", "#!/usr/bin/env bash\nexit 0\n");

  const scenarios = Object.fromEntries([
    medirPar("first_injection", projeto,
      (p, i, aquecimento) => executar(HOOK, p, evento(p, `primeira-${aquecimento ? "w" : "s"}-${i}`, `p-${aquecimento ? "w" : "s"}-${i}`)),
      (p, i, aquecimento) => executar(baselineNode, p, evento(p, `base-primeira-${aquecimento ? "w" : "s"}-${i}`, `bp-${aquecimento ? "w" : "s"}-${i}`)),
      { baseline: 2, hook: 2, node_invocations: 1 }),
    medirPar("repetition", () => {
      const p = projeto();
      const entrada = evento(p, "repeticao", "mesmo-prompt");
      executar(HOOK, p, entrada);
      return { p, entrada };
    }, ({ p, entrada }) => executar(HOOK, p, entrada),
    ({ p, entrada }) => executar(baselineNode, p, entrada),
    { baseline: 2, hook: 2, node_invocations: 1 }),
    medirPar("fallback", () => ({ p: projeto(), env: ambienteSemNode() }),
      ({ p, env }, i) => executar(HOOK, p, evento(p, `fallback-${i}`, `p-${i}`), env),
      ({ p, env }, i) => executar(baselineShell, p, evento(p, `base-fallback-${i}`, `bp-${i}`), env),
      { baseline: 1, hook: 1, node_invocations: 0 }),
  ]);

  const gate = process.platform === "win32" && BASH === GIT_BASH
    ? {
      kind: "percentile_difference_p95_ms",
      limit_ms: 100,
      passed: Object.values(scenarios).every((cenario) => cenario.incremental_p95_ms <= 100),
    }
    : {
      kind: "absolute_p95_ms",
      limit_ms: 100,
      passed: Object.values(scenarios).every((cenario) => cenario.absolute.p95_ms <= 100),
    };

  const resultado = {
    schema: 2,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    launcher: BASH,
    wrapper: HOOK,
    warmups: WARMUPS,
    samples: SAMPLES,
    pairing: "alternating",
    gate,
    scenarios,
  };
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(resultado)}\n`);
  else {
    process.stdout.write(`Expx lembrete — ${SAMPLES} pares após ${WARMUPS} aquecimentos\n`);
    for (const [nome, dados] of Object.entries(scenarios)) {
      process.stdout.write(`${nome}: abs p50=${dados.absolute.p50_ms}ms p95=${dados.absolute.p95_ms}ms; incremental p95=${dados.incremental_p95_ms}ms; paired delta p50=${dados.paired_delta.p50_ms}ms p95=${dados.paired_delta.p95_ms}ms; bytes=${dados.bytes_min}-${dados.bytes_max}\n`);
    }
  }
  process.exitCode = codigoSaidaDoGate(gate);
} finally {
  for (const caminho of temporarios.reverse()) rmSync(caminho, { recursive: true, force: true });
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
