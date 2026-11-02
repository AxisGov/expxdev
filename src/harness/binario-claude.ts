import { accessSync, constants, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, join, resolve, sep } from "node:path";

/**
 * Qual `claude` o CLI roda.
 *
 * No WSL, o PATH herda o do Windows, e o `claude` de `/mnt/c/...` também aparece
 * nele. Esse binário registra o plugin no Claude do Windows, não no do Linux, e o
 * `marketplace list --json` dele não volta como JSON: no Login, o `remove` e o
 * `add` rodaram nele antes de a conferência falhar (0.13.1). Fora do WSL nada
 * muda: o nome vai para o PATH do sistema, como sempre foi.
 */

export type ResolucaoClaude =
  | { ok: true; caminho: string }
  | { ok: false; motivo: "ausente" | "so-windows" };

export type OpcoesResolucao = {
  ambiente?: NodeJS.ProcessEnv;
  /** Força a detecção; sem ela, `ehWsl`. */
  wsl?: boolean;
  /** Onde o WSL monta o Windows. Injetável só para o teste. */
  raizWindows?: string;
  /** A pasta da entrada vazia do PATH; sem ela, a do processo. */
  cwd?: string;
};

/** WSL pela variável que ele define, ou pelo kernel da Microsoft. */
export function ehWsl(ambiente: NodeJS.ProcessEnv = process.env, lerVersao: () => string = () => readFileSync("/proc/version", "utf8")): boolean {
  if (process.platform === "win32") return false;
  if ((ambiente["WSL_DISTRO_NAME"] ?? "") !== "") return true;
  try {
    return /microsoft/i.test(lerVersao());
  } catch {
    return false;
  }
}

function dentro(raiz: string, caminho: string): boolean {
  const r = resolve(raiz);
  return caminho === r || caminho.startsWith(r.endsWith(sep) ? r : r + sep);
}

function executavel(caminho: string): boolean {
  try {
    if (!statSync(caminho).isFile()) return false;
    accessSync(caminho, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolverClaude(op: OpcoesResolucao = {}): ResolucaoClaude {
  const ambiente = op.ambiente ?? process.env;
  const wsl = op.wsl ?? ehWsl(ambiente);
  if (!wsl) return { ok: true, caminho: "claude" };
  const raizWindows = op.raizWindows ?? "/mnt";
  let doWindows = false;
  // Em ordem: o primeiro do Linux vence, como o PATH faria sem o do Windows.
  for (const entrada of (ambiente["PATH"] ?? "").split(delimiter)) {
    // No POSIX, a entrada vazia é a pasta atual, como no execvp (CodeAnt no #132).
    const pasta = entrada === "" ? (op.cwd ?? process.cwd()) : entrada;
    // O Windows pode expor só o `claude.exe`, que o WSL roda pelo interop: é do Windows.
    if (dentro(raizWindows, resolve(pasta)) && executavel(join(resolve(pasta), "claude.exe"))) doWindows = true;
    const candidato = join(resolve(pasta), "claude");
    if (!executavel(candidato)) continue;
    let real: string;
    try {
      real = realpathSync(candidato);
    } catch {
      continue;
    }
    // A entrada e o alvo real: um link no Linux para o .exe do Windows também cai.
    if (dentro(raizWindows, resolve(pasta)) || dentro(raizWindows, real)) {
      doWindows = true;
      continue;
    }
    return { ok: true, caminho: candidato };
  }
  return { ok: false, motivo: doWindows ? "so-windows" : "ausente" };
}
