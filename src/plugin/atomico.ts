import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Troca o `.expx/` inteiro de uma vez, ou não troca nada.
 *
 * Montar direto no destino final deixa `.expx/` pela metade se a busca de uma
 * skill falhar no meio — e um `.expx/` pela metade é pior que nenhum, porque o
 * harness carrega um plugin incompleto sem avisar. Montar ao lado e trocar por
 * `rename` mantém a instalação anterior válida até o último instante.
 *
 * O `rename` é a operação que dá a atomicidade, e ele só é atômico dentro do
 * mesmo sistema de arquivos: por isso a pasta temporária fica ao lado do
 * destino, na raiz do projeto, e não em `/tmp`.
 */
export type TrocaPreparada = {
  /** Troca a pasta de destino pela montada. */
  publicar: () => void;
  /** Desiste: apaga a montagem e deixa o destino como estava. */
  descartar: () => void;
};

/**
 * Monta `destino` ao lado e só troca quando `publicar` é chamado.
 *
 * Separar montar de publicar deixa quem chama fazer o resto do trabalho entre
 * os dois: se algo falhar no meio, `descartar` e o destino segue intocado. É o
 * que o `init` usa para `.expx/marketplace/` — a pasta que ele gerencia —
 * sem apagar o resto de `.expx/` (`hooks.json`, `estado.json`, `memoria/`),
 * que não é dele.
 */
export function prepararTroca(destino: string, montar: (pastaTemporaria: string) => void): TrocaPreparada {
  const temporaria = `${destino}.tmp-${String(process.pid)}-${String(Date.now())}`;
  const anterior = `${temporaria}-anterior`;
  mkdirSync(temporaria, { recursive: true });
  try {
    montar(temporaria);
  } catch (e: unknown) {
    rmSync(temporaria, { recursive: true, force: true });
    throw e;
  }
  return {
    publicar: () => {
      const tinhaAnterior = existsSync(destino);
      if (tinhaAnterior) renameSync(destino, anterior);
      try {
        renameSync(temporaria, destino);
      } catch (e: unknown) {
        if (tinhaAnterior) renameSync(anterior, destino);
        rmSync(temporaria, { recursive: true, force: true });
        throw e;
      }
      rmSync(anterior, { recursive: true, force: true });
    },
    descartar: () => {
      rmSync(temporaria, { recursive: true, force: true });
    },
  };
}

/** Escreve um arquivo por inteiro ou não escreve: grava ao lado e renomeia. */
export function escreverArquivoAtomico(caminho: string, conteudo: string): void {
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp-${String(process.pid)}-${String(Date.now())}`;
  writeFileSync(tmp, conteudo);
  try {
    renameSync(tmp, caminho);
  } catch (e: unknown) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

export function escreverAtomico(raizProjeto: string, montar: (pastaTemporaria: string) => void): void {
  const destino = join(raizProjeto, ".expx");
  const temporaria = join(raizProjeto, `.expx.tmp-${String(process.pid)}-${String(Date.now())}`);
  const anterior = `${temporaria}-anterior`;

  mkdirSync(temporaria, { recursive: true });
  try {
    montar(temporaria);
  } catch (e: unknown) {
    rmSync(temporaria, { recursive: true, force: true });
    throw e;
  }

  const tinhaAnterior = existsSync(destino);
  if (tinhaAnterior) renameSync(destino, anterior);
  try {
    renameSync(temporaria, destino);
  } catch (e: unknown) {
    // não conseguiu publicar o novo: devolve o antigo ao lugar
    if (tinhaAnterior) renameSync(anterior, destino);
    rmSync(temporaria, { recursive: true, force: true });
    throw e;
  }
  rmSync(anterior, { recursive: true, force: true });
}
