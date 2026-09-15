import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type CodexHook = {
  type: "command";
  command: string;
  commandWindows: string;
};

type CodexSettings = Record<string, unknown> & {
  hooks?: Record<string, unknown>;
};

const comandoUnix = "gitRoot=$(git rev-parse --show-toplevel) && node \"$gitRoot/.codex/hooks/expx-session-sync.mjs\" --codex";
const comandoWindows = "powershell.exe -NoProfile -Command \"$gitRoot = git rev-parse --show-toplevel; node (Join-Path $gitRoot '.codex/hooks/expx-session-sync.mjs') --codex\"";

export function mesclarCodexHooks(raizProjeto: string): { criou: boolean; alterou: boolean; erro?: string } {
  const dir = join(raizProjeto, ".codex");
  const caminho = join(dir, "hooks.json");
  const existia = existsSync(caminho);
  let atual: CodexSettings = {};
  if (existia) {
    try {
      atual = JSON.parse(readFileSync(caminho, "utf8")) as CodexSettings;
    } catch {
      return { criou: false, alterou: false, erro: "Codex: .codex/hooks.json invalido; arquivo preservado." };
    }
    if (typeof atual !== "object" || atual === null || Array.isArray(atual)) {
      return { criou: false, alterou: false, erro: "Codex: .codex/hooks.json deve conter um objeto; arquivo preservado." };
    }
    if (Object.prototype.hasOwnProperty.call(atual, "hooks") &&
      (typeof atual.hooks !== "object" || atual.hooks === null || Array.isArray(atual.hooks))) {
      return { criou: false, alterou: false, erro: "Codex: .codex/hooks.json possui hooks invalido; arquivo preservado." };
    }
  }

  const hooks = { ...(atual.hooks ?? {}) };
  if (Object.prototype.hasOwnProperty.call(hooks, "SessionStart") && !Array.isArray(hooks.SessionStart)) {
    return { criou: false, alterou: false, erro: "Codex: .codex/hooks.json possui SessionStart invalido; arquivo preservado." };
  }
  const atuais: unknown[] = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const gerenciado = {
    matcher: "startup|resume",
    hooks: [{ type: "command", command: comandoUnix, commandWindows: comandoWindows } satisfies CodexHook],
  };
  const isGerenciado = (hook: unknown): boolean =>
    typeof hook === "object" && hook !== null && JSON.stringify(hook).includes(".codex/hooks/expx-session-sync.mjs");
  const semGerenciado = atuais.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [item];
    const registro = item as Record<string, unknown>;
    if (!Array.isArray(registro.hooks)) return [item];
    const hooksRestantes = registro.hooks.filter((hook) => !isGerenciado(hook));
    return hooksRestantes.length > 0 ? [{ ...registro, hooks: hooksRestantes }] : [];
  });
  hooks.SessionStart = [...semGerenciado, gerenciado];
  const alterou = !existia || JSON.stringify(atuais) !== JSON.stringify(hooks.SessionStart);
  writeFileSync(caminho, `${JSON.stringify({ ...atual, hooks }, null, 2)}\n`);
  return { criou: !existia, alterou };
}

export function materializarCodex(raizProjeto: string): string | undefined {
  const origem = fileURLToPath(new URL("../../nucleo/hooks/expx-session-sync.mjs", import.meta.url));
  const destinoDir = join(raizProjeto, ".codex", "hooks");
  const destino = join(destinoDir, "expx-session-sync.mjs");
  const novoRuntime = readFileSync(origem);
  let runtimeAlterado = true;
  try {
    runtimeAlterado = !readFileSync(destino).equals(novoRuntime);
  } catch {
    // runtime ausente: será materializado abaixo
  }
  mkdirSync(destinoDir, { recursive: true });
  writeFileSync(destino, novoRuntime);
  const r = mesclarCodexHooks(raizProjeto);
  return r.erro ?? (r.alterou || runtimeAlterado ? "Codex: revise e confie os hooks locais com /hooks antes do primeiro uso." : undefined);
}