import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type BloqueioOperacao =
  | { ok: true; liberar: () => void }
  | { ok: false; erro: string };

export function caminhoDoBloqueioOperacao(raiz: string): string {
  return join(raiz, ".expx", ".operacao.lock");
}

/**
 * Serializa a fase de escrita de init/update entre processos.
 *
 * O modo wx faz a decisão atômica: somente um processo cria o arquivo. Falhar
 * fechado evita que uma migração baseada num snapshot antigo sobrescreva um
 * lock mais novo produzido por outra execução.
 */
export function adquirirBloqueioOperacao(raiz: string): BloqueioOperacao {
  const caminho = caminhoDoBloqueioOperacao(raiz);
  mkdirSync(join(raiz, ".expx"), { recursive: true });

  let descritor: number;
  try {
    descritor = openSync(caminho, "wx");
  } catch (erro: unknown) {
    const codigo = erro instanceof Error && "code" in erro ? String(erro.code) : "";
    if (codigo === "EEXIST") {
      return {
        ok: false,
        erro: `outra operacao do ExpxDev esta em andamento (bloqueio: ${caminho})`,
      };
    }
    throw erro;
  }

  try {
    writeFileSync(descritor, `pid=${String(process.pid)}\n`);
  } catch (erro: unknown) {
    closeSync(descritor);
    rmSync(caminho, { force: true });
    throw erro;
  }

  let liberado = false;
  return {
    ok: true,
    liberar: () => {
      if (liberado) return;
      liberado = true;
      closeSync(descritor);
      rmSync(caminho, { force: true });
    },
  };
}
