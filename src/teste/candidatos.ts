import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Apoio da bancada P0.2: as skills candidatas fixadas, o binário REAL do
 * `expxdev`, e o runtime em que os hooks instalados rodam.
 *
 * Nada aqui monta instalação à mão: as fontes são entregues ao `init` pelo
 * mecanismo oficial (`EXPX_SKILLS_LOCAIS`), e o `init` é o `dist/cli/expx-bin.js`
 * executado num processo novo.
 */

export const RAIZ_DO_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BINARIO = join(RAIZ_DO_REPO, "dist", "cli", "expx-bin.js");

/**
 * As candidatas fixadas. `sha` é o commit BASE do snapshot — a SprintX tem correção
 * propagada por cima dele, registrada em `fixtures/candidatos/sprintx.PROPAGACOES.md`.
 */
export const CANDIDATOS = {
  sprintx: { pasta: "SprintX", sha: "253b59233e6d7a225a05f011cf52668b708e448b" },
  mergex: { pasta: "MergeX", sha: "25d479725b0d91d7b794899c9e25e214bb55fb04" },
} as const;

export type NomeCandidato = keyof typeof CANDIDATOS;

export function snapshot(nome: NomeCandidato): string {
  return join(RAIZ_DO_REPO, "fixtures", "candidatos", nome);
}

const ehWindows = process.platform === "win32";

export function sha256(caminho: string): string {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

/** Arquivos de uma árvore, relativos, com `/`, ordenados. */
export function arvore(raiz: string, ignorar: (rel: string) => boolean = () => false): string[] {
  const saida: string[] = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const d = fila.shift() as string;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const rel = relative(raiz, p).split(sep).join("/");
      if (ignorar(rel)) continue;
      if (statSync(p).isDirectory()) fila.push(p);
      else saida.push(rel);
    }
  }
  return saida.sort();
}

/**
 * O snapshot está coerente consigo? Confere o commit BASE declarado e cada arquivo
 * contra o manifesto gerado por `scripts/fixture-candidatos.sh`.
 *
 * Coerência, não procedência: o snapshot pode ter correção propagada por cima da
 * base (`fixtures/candidatos/<nome>.PROPAGACOES.md`), e nada aqui vai à SprintX
 * conferir bytes — a bancada não usa rede. Quem prova que a propagação continua no
 * snapshot é teste de comportamento sobre o hook instalado, não este manifesto.
 */
export function conferirSnapshot(nome: NomeCandidato): void {
  const base = snapshot(nome);
  const sha = readFileSync(`${base}.sha`, "utf8").trim();
  if (sha !== CANDIDATOS[nome].sha) throw new Error(`${nome}: snapshot em ${sha}, esperado ${CANDIDATOS[nome].sha}`);
  const esperado = readFileSync(`${base}.MANIFESTO.sha256`, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [hash, ...resto] = l.split("  ");
      return [resto.join("  "), hash] as const;
    });
  const noDisco = arvore(base);
  const listados = esperado.map(([f]) => f).sort();
  if (JSON.stringify(noDisco) !== JSON.stringify(listados)) throw new Error(`${nome}: arquivos do snapshot divergem do manifesto`);
  for (const [f, hash] of esperado) {
    if (sha256(join(base, f)) !== hash) throw new Error(`${nome}: ${f} diverge do manifesto`);
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "expx",
      GIT_AUTHOR_EMAIL: "expx@example.invalid",
      GIT_COMMITTER_NAME: "expx",
      GIT_COMMITTER_EMAIL: "expx@example.invalid",
    },
  });
}

export function gitEm(cwd: string, ...args: string[]): string {
  return git(cwd, ...args);
}

/**
 * A pasta que `EXPX_SKILLS_LOCAIS` aponta: um repositório por candidata, com
 * os bytes do snapshot. É repositório porque o `init` resolve a versão com
 * `git ls-remote` na origem, como faria com a remota.
 */
export function fontesCandidatas(): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-candidatas-"));
  for (const nome of Object.keys(CANDIDATOS) as NomeCandidato[]) {
    conferirSnapshot(nome);
    const destino = join(raiz, CANDIDATOS[nome].pasta);
    cpSync(snapshot(nome), destino, { recursive: true });
    git(destino, "init", "-q", "-b", "main");
    git(destino, "config", "core.autocrlf", "false");
    git(destino, "add", "-A");
    git(destino, "commit", "-q", "-m", `${nome} @ ${CANDIDATOS[nome].sha}`);
  }
  return raiz;
}

/** Um produto Git novo, com um commit na principal. */
export function novoProduto(prefixo = "expx-produto-"): string {
  const raiz = mkdtempSync(join(tmpdir(), prefixo));
  git(raiz, "init", "-q", "-b", "main");
  git(raiz, "config", "core.autocrlf", "false");
  git(raiz, "config", "user.email", "produto@example.invalid");
  git(raiz, "config", "user.name", "Produto");
  git(raiz, "commit", "-q", "--allow-empty", "-m", "produto: inicio");
  return raiz;
}

/** O binário no PATH deste processo, ou `undefined`. */
export function noPath(bin: string): string | undefined {
  const dirs = (process.env["PATH"] ?? process.env["Path"] ?? "").split(delimiter).filter((d) => d !== "");
  for (const d of dirs) {
    for (const nome of ehWindows ? [`${bin}.exe`] : [bin]) {
      const p = join(d, nome);
      try {
        if (statSync(p).isFile()) return p;
      } catch {
        // próximo
      }
    }
  }
  return undefined;
}

function obrigatorio(bin: string): string {
  const p = noPath(bin);
  if (p === undefined) throw new Error(`${bin} ausente do PATH desta bancada: ela exige o binario real`);
  return p;
}

/** A raiz da instalação do Git no Windows, pelo `--exec-path` do próprio git. */
function raizDoGitWindows(): string {
  const exec = execFileSync(obrigatorio("git"), ["--exec-path"], { encoding: "utf8" }).trim();
  return resolve(exec, "..", "..", "..");
}

/**
 * O bash que roda os hooks. No Windows, o Git Bash — derivado da instalação do
 * git, NUNCA o primeiro `bash` do PATH, que pode ser o do WSL.
 */
export function bashDosHooks(): string {
  if (!ehWindows) return obrigatorio("bash");
  const b = join(raizDoGitWindows(), "bin", "bash.exe");
  if (!existsSync(b)) throw new Error(`Git Bash nao encontrado em ${b}`);
  return b;
}

/** Ambiente com o PATH trocado — removendo toda variante de caixa (`Path`). */
export function ambienteCom(path: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== "PATH") env[k] = v;
  env["PATH"] = path;
  return { ...env, ...extra };
}

/**
 * Um PATH controlado para o `expxdev`: git sempre, jq só se pedido, e NUNCA o
 * `claude` — o `init` não pode registrar o plugin no Claude Code de quem roda
 * a bancada. Monta uma pasta de links onde o sistema permite (Linux); no
 * Windows, usa só as pastas da instalação do Git, conferindo que o jq não
 * está nelas.
 */
export function pathControlado(comJq: boolean): string {
  const jq = obrigatorio("jq");
  if (ehWindows) {
    const g = raizDoGitWindows();
    const dirs = [join(g, "cmd"), join(g, "mingw64", "bin"), join(g, "usr", "bin")];
    for (const d of dirs) {
      if (existsSync(join(d, "jq.exe")) || existsSync(join(d, "claude.exe"))) {
        throw new Error(`${d} contem jq/claude: nao da para controlar o PATH`);
      }
    }
    return [...dirs, ...(comJq ? [dirname(jq)] : [])].join(delimiter);
  }
  const bin = mkdtempSync(join(tmpdir(), "expx-bin-"));
  mkdirSync(bin, { recursive: true });
  symlinkSync(obrigatorio("git"), join(bin, "git"));
  if (comJq) symlinkSync(jq, join(bin, "jq"));
  return bin;
}

/**
 * Como o `jq` dos hooks MATERIALIZA, no stdout, o `\n` de dentro de uma string
 * JSON: `\r\n` no Windows — onde o stdout do jq abre em modo texto e a CRT
 * traduz cada LF — e `\n` em POSIX.
 *
 * Quem corta o `detalhe` não vê o payload: vê o comando já decodificado pelo jq.
 * É aqui, e não no hook, que a representação da quebra de linha é decidida — por
 * isso a medição é feita no próprio jq. Um teste que perguntasse ao hook qual
 * quebra esperar seria o hook se auditando.
 */
export function novaLinhaDoJq(): string {
  const r = spawnSync(obrigatorio("jq"), ["-r", ".n"], {
    input: Buffer.from(JSON.stringify({ n: "a\nb" }), "utf8"),
    encoding: "utf8",
    timeout: 60000,
  });
  const m = /^a(\r?\n)b/.exec(r.stdout ?? "");
  if (m === null) throw new Error(`jq nao devolveu 'a<quebra>b': ${JSON.stringify(r.stdout)}`);
  return m[1] as string;
}

/** O PATH em que os hooks instalados rodam: o do processo, com jq garantido. */
export function pathDosHooks(): string {
  const jq = obrigatorio("jq");
  return [dirname(jq), process.env["PATH"] ?? process.env["Path"] ?? ""].join(delimiter);
}

/** Roda o `expxdev` REAL (o `dist/`) num processo novo. */
export function rodarExpx(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  if (!existsSync(BINARIO)) throw new Error(`${BINARIO} ausente: rode npm run build:server`);
  return spawnSync(process.execPath, [BINARIO, ...args], { cwd, env, encoding: "utf8", timeout: 180000 });
}

/**
 * O comando REGISTRADO no `.claude/settings.json` instalado para o script —
 * exatamente o texto que o Claude Code executa. Rodar o script por outro
 * caminho não provaria o registro.
 */
export function comandoRegistrado(produto: string, script: string): string {
  const s = JSON.parse(readFileSync(join(produto, ".claude", "settings.json"), "utf8")) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  };
  const achados = Object.values(s.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks ?? [])
    .map((h) => h.command ?? "")
    .filter((c) => c.includes(script));
  const unicos = [...new Set(achados)];
  if (unicos.length !== 1) throw new Error(`${script}: ${String(unicos.length)} comandos registrados`);
  return unicos[0] as string;
}

/**
 * Roda um hook instalado, pelo comando registrado, com um payload do Claude Code
 * no stdin. O payload vai em UTF-8, que é o que o harness entrega: hook que corta
 * texto precisa receber os mesmos bytes que receberia em uso.
 */
export function rodarHookComPayload(produto: string, script: string, payload: unknown): SpawnSyncReturns<string> {
  return spawnSync(bashDosHooks(), ["-c", comandoRegistrado(produto, script)], {
    cwd: produto,
    input: Buffer.from(JSON.stringify(payload), "utf8"),
    encoding: "utf8",
    env: ambienteCom(pathDosHooks(), { CLAUDE_PROJECT_DIR: produto }),
    timeout: 60000,
  });
}

/** Roda um hook instalado, pelo comando registrado, com o payload PreToolUse de um comando Bash. */
export function rodarHook(produto: string, script: string, comando: string): SpawnSyncReturns<string> {
  return rodarHookComPayload(produto, script, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: comando },
    cwd: produto,
  });
}
