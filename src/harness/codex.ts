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
  }

  const hooks = { ...(atual.hooks ?? {}) };
  const atuais = Array.isArray(hooks.SessionStart) ? hooks.SessionStart as Array<Record<string, unknown>> : [];
  const gerenciado = {
    matcher: "startup|resume",
    hooks: [{ type: "command", command: comandoUnix, commandWindows: comandoWindows } satisfies CodexHook],
  };
  const isGerenciado = (item: Record<string, unknown>): boolean =>
    Array.isArray(item.hooks) && item.hooks.some((h) => JSON.stringify(h).includes(".codex/hooks/expx-session-sync.mjs"));
  const semGerenciado = atuais
    .map((item) => ({ ...item, hooks: Array.isArray(item.hooks) ? item.hooks.filter((h) => !isGerenciado({ hooks: [h] })) : item.hooks }))
    .filter((item) => !Array.isArray(item.hooks) || item.hooks.length > 0);
  const jaAtual = atuais.some((item) => item.matcher === gerenciado.matcher && JSON.stringify(item.hooks) === JSON.stringify(gerenciado.hooks));
  hooks.SessionStart = [...semGerenciado, gerenciado];
  const alterou = !existia || JSON.stringify(atuais) !== JSON.stringify(hooks.SessionStart);
  writeFileSync(caminho, `${JSON.stringify({ ...atual, hooks }, null, 2)}\n`);
  return { criou: !existia, alterou };
}

export function materializarCodex(raizProjeto: string): string | undefined {
  const origem = fileURLToPath(new URL("../../nucleo/hooks/expx-session-sync.mjs", import.meta.url));
  const destinoDir = join(raizProjeto, ".codex", "hooks");
  mkdirSync(destinoDir, { recursive: true });
  writeFileSync(join(destinoDir, "expx-session-sync.mjs"), readFileSync(origem));
  const r = mesclarCodexHooks(raizProjeto);
  return r.erro ?? (r.alterou ? "Codex: revise e confie os hooks locais com /hooks antes do primeiro uso." : undefined);
}