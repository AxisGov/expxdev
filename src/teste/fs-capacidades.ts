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
/**
 * O filesystem aceita nome de arquivo com caractere que o Windows reserva?
 *
 * Medido no Windows (NTFS, node 24 nativo): `writeFileSync` devolve `ENOENT`
 * para `"`, `*`, `?`, `:` e newline no nome; `[`, `]`, espaço, `'`, `$`, `;`,
 * `-` e crase passam.
 *
 * A sonda grava UM nome com `"`, `*` e `?` — três representantes, e não um teste
 * por caractere. O que se quer saber é se ESTE disco hospeda nome reservado, e
 * `:` e newline caem do mesmo lado que os três nas duas plataformas medidas.
 *
 * A pergunta é feita ao DISCO, não a `process.platform`, porque é o disco que
 * responde — e é ele que os testes vão usar.
 *
 * Serve para condicionar de forma estreita só os casos que precisam desses
 * nomes. O que é verificável sem eles (a citação, que é função pura, e o
 * pathspec com `[`, que o Windows aceita) continua rodando em toda plataforma.
 */
export function suportaNomeComCaractereReservado(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "expx-nome-"));
  try {
    writeFileSync(join(dir, 'a"b*c?.sh'), "x\n");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
