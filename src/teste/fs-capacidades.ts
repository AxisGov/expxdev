import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Detecta se o filesystem usado pelos testes preserva o bit POSIX de execução.
 *
 * Windows/NTFS aceita chmodSync, mas stat().mode continua sem expor 0o100.
 * Em filesystems POSIX o bit precisa ser preservado.
 */
export function suportaBitExecutavel(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "expx-mode-"));
  const arquivo = join(dir, "probe.sh");

  try {
    writeFileSync(arquivo, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(arquivo, 0o755);
    return (statSync(arquivo).mode & 0o100) === 0o100;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}