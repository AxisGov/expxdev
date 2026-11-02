import { spawnSync } from "node:child_process";

/**
 * O Claude Code mínimo para o envelope da invocação, por decisão do dono
 * (CONTRATO-expx-orquestracao §13.4).
 */
export const PISO_CLAUDE = "2.1.310";

export type PisoDoClaude = { ok: true; versao: string } | { ok: false; aviso: string };

/** `a` é menor que `b`, em números separados por ponto? */
function menor(a: string, b: string): boolean {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}

/** Lê a versão do `claude` do PATH. Sem `claude`, ou com saída ilegível, não está no piso. */
export function conferirPisoDoClaude(): PisoDoClaude {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 15_000, shell: process.platform === "win32" });
  const versao = r.status === 0 ? /^(\d+\.\d+\.\d+)/.exec(r.stdout.trim())?.[1] : undefined;
  if (versao === undefined) {
    return { ok: false, aviso: `envelope da invocacao nao instalado: nao foi possivel ler a versao do claude (piso ${PISO_CLAUDE})` };
  }
  if (menor(versao, PISO_CLAUDE)) {
    return { ok: false, aviso: `envelope da invocacao nao instalado: claude ${versao}, abaixo do piso ${PISO_CLAUDE}; atualize e rode o expx init de novo` };
  }
  return { ok: true, versao };
}
