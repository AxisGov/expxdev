import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { basename, dirname } from "node:path";

/**
 * Cópia datada antes de qualquer escrita em arquivo do usuário.
 *
 * O `settings.json` costuma conter configuração que a pessoa ajustou à mão e
 * que não está em lugar nenhum além dali. Um merge com defeito sem backup é
 * perda de trabalho irrecuperável.
 */

/** `AAAA-MM-DD` do relógio do sistema. */
export function hojeISO(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

/**
 * Copia para `<arquivo>.backup-AAAA-MM-DD[-N]`. Devolve o caminho criado.
 * Se já existe backup do dia, cria um sufixo numérico em vez de sobrescrever —
 * o backup de ontem não pode ser destruído pelo erro de hoje.
 */
export function fazerBackup(arquivo: string, agora: Date = new Date()): string {
  const base = `${arquivo}.backup-${hojeISO(agora)}`;
  let destino = base;
  let n = 1;
  while (existsSync(destino)) {
    destino = `${base}-${String(n)}`;
    n += 1;
  }
  copyFileSync(arquivo, destino);
  return destino;
}

/**
 * O arquivo está rastreado pelo git e igual ao que o HEAD e o índice guardam.
 *
 * Só nesse caso a cópia ao lado é redundante: o versionador já desfaz a
 * escrita, e a cópia `.backup-*` acabaria no commit do projeto. Rastreado com
 * edição pendente NÃO conta — a edição manual só existe no disco. Qualquer
 * dúvida (sem git, `safe.directory`, arquivo fora da árvore) devolve `false`, e
 * o backup acontece como sempre.
 */
export function rastreadoELimpo(arquivo: string): boolean {
  const opcoes = { cwd: dirname(arquivo), encoding: "utf8" as const, stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"] };
  const nome = basename(arquivo);
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", nome], opcoes);
    return execFileSync("git", ["status", "--porcelain", "--", nome], opcoes).trim() === "";
  } catch {
    return false;
  }
}
