import { spawnSync } from "node:child_process";
import { resolverClaude, type ResolucaoClaude } from "./binario-claude.js";

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
export function conferirPisoDoClaude(resolver: () => ResolucaoClaude = resolverClaude): PisoDoClaude {
  // No WSL, o `claude` do Windows não é o que vai rodar o hook: fica de fora (0.13.2).
  const claude = resolver();
  if (!claude.ok) {
    const motivo = claude.motivo === "so-windows" ? "so o claude do Windows (sob /mnt/) esta no PATH do WSL" : "nao foi possivel ler a versao do claude";
    return { ok: false, aviso: `envelope da invocacao nao instalado: ${motivo} (piso ${PISO_CLAUDE})` };
  }
  const r = spawnSync(claude.caminho, ["--version"], { encoding: "utf8", timeout: 15_000, shell: process.platform === "win32" });
  const versao = r.status === 0 ? /^(\d+\.\d+\.\d+)/.exec(r.stdout.trim())?.[1] : undefined;
  if (versao === undefined) {
    return { ok: false, aviso: `envelope da invocacao nao instalado: nao foi possivel ler a versao do claude (piso ${PISO_CLAUDE})` };
  }
  if (menor(versao, PISO_CLAUDE)) {
    return { ok: false, aviso: `envelope da invocacao nao instalado: claude ${versao}, abaixo do piso ${PISO_CLAUDE}; atualize e rode o expx init de novo` };
  }
  return { ok: true, versao };
}
