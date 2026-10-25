import { randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync, type Stats } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { caminhoDoRegistro, DIR_REGISTRO, serializarRegistro } from "./materializar.js";
import type { Resolucao } from "./resolver.js";

/**
 * Escrita do registro `.expx/resolucoes/` (CONTRATO-expx-instalacao §5.3).
 *
 * O que é GARANTIDO, em qualquer intercalação:
 * - o arquivo final nunca é sobrescrito: o temporário nasce com `O_EXCL` e é
 *   publicado com `link`, que falha se o final já existe — inclusive como link;
 * - o temporário é escrito por inteiro (escrita parcial é completada);
 * - em POSIX, o final existente só é aceito se é arquivo regular com os mesmos
 *   bytes, lido com `O_NOFOLLOW`. No Windows (sem `O_NOFOLLOW`) sobra o `lstat`
 *   antes do `open`, com janela.
 *
 * O que é MITIGADO: a troca de `.expx` ou `.expx/resolucoes`, por link ou por
 * outro diretório. Os dois precisam ser diretórios de verdade, sem link, dentro
 * do projeto (`realpath` + `relative`), e manter o (dev, ino) da primeira
 * checagem — conferido logo depois de criar `resolucoes` e de novo antes de
 * publicar. Uma troca ainda presente na revalidação aborta antes do lock.
 *
 * O que NÃO é fechado: o Node não tem `openat`/`linkat`, e toda operação por
 * caminho tem janela. Uma troca DEPOIS da última revalidação pode redirecionar
 * o `link` ou a limpeza; desfazê-la em seguida só apaga a evidência. No Windows
 * não há `O_NOFOLLOW`: a garantia forte é POSIX.
 */

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

type Identidade = { dev: number; ino: number };
const mesma = (a: Identidade, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino;

function erroLink(rel: string): Error {
  return new Error(`${rel} e um link simbolico; o registro de resolucoes nao sai do projeto (gravacao abortada)`);
}

/** O diretório existe como diretório real, sem link e dentro da raiz; devolve a identidade dele. */
function diretorioSeguro(raizReal: string, abs: string, rel: string): Identidade {
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) throw erroLink(rel);
  if (!st.isDirectory()) throw new Error(`${rel} existe e nao e um diretorio (gravacao abortada)`);
  const dentro = relative(raizReal, realpathSync(abs));
  if (dentro.startsWith("..") || isAbsolute(dentro)) throw new Error(`${rel} aponta para fora do projeto (gravacao abortada)`);
  return { dev: st.dev, ino: st.ino };
}

/** Uma única chamada: entre "existe?" e "o que é?" o arquivo pode sumir. */
function lstatOuNada(caminho: string): Stats | undefined {
  try {
    return lstatSync(caminho);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

function existe(caminho: string): boolean {
  return lstatOuNada(caminho) !== undefined;
}

/** O diretório continua sendo o mesmo (dev, ino), sem link e dentro da raiz. */
function conferirIdentidade(raizReal: string, raiz: string, rel: string, antes: Identidade): void {
  const agora = diretorioSeguro(raizReal, join(raiz, ...rel.split("/")), rel);
  if (agora.dev !== antes.dev || agora.ino !== antes.ino) throw new Error(`${rel} foi trocado durante a gravacao (nada foi publicado)`);
}

/** Cria um nível por vez, para cada componente passar pela mesma checagem. */
function garantirDiretorio(raizReal: string, raiz: string, rel: string): Identidade {
  const abs = join(raiz, ...rel.split("/"));
  if (!existe(abs)) mkdirSync(abs);
  return diretorioSeguro(raizReal, abs, rel);
}

/**
 * Lê o final sem seguir link e confere os bytes. O `lstat` antes do `open` é a
 * defesa que sobra no Windows, onde não há `O_NOFOLLOW` (com janela entre os dois).
 */
function conferirExistente(caminho: string, rel: string, texto: string): void {
  if (lstatOuNada(caminho)?.isSymbolicLink() === true) throw erroLink(rel);
  let fd: number;
  try {
    fd = openSync(caminho, constants.O_RDONLY | NOFOLLOW);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ELOOP") throw erroLink(rel);
    throw e;
  }
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${rel} nao e arquivo regular; o registro de resolucoes e imutavel`);
    if (readFileSync(fd, "utf8") !== texto) throw new Error(`${rel} ja existe com outro conteudo; o registro de resolucoes e imutavel`);
  } finally {
    closeSync(fd);
  }
}

/** Remove o temporário só se o caminho ainda leva ao arquivo que criamos; senão, órfão é melhor que apagar no lugar errado. */
function limpar(tmp: string, id: Identidade): void {
  try {
    if (mesma(id, lstatSync(tmp))) unlinkSync(tmp);
  } catch {
    // já não existe, ou não dá para provar que é o nosso
  }
}

function sincronizarDiretorio(dir: string): void {
  try {
    const fd = openSync(dir, constants.O_RDONLY);
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // plataforma sem fsync de diretório (Windows)
  }
}

export type OpcoesDeTeste = {
  /** Chamado no meio da operação (antes de ler o existente, ou depois de criar o temporário) e antes da revalidação: simula a corrida. */
  antesDaRevalidacao?: () => void;
  /** Nome fixo do temporário, para provar o `O_EXCL`. */
  nomeTemporario?: string;
  /** Máximo de bytes por `writeSync`, para provar que escrita parcial é completada. */
  limiteDeEscrita?: number;
};

/** Para o planejamento: o que já impede gravar sem sair do projeto. Vazio quando está tudo ausente ou seguro. */
export function destinoDoRegistroInseguro(raiz: string, ids: readonly string[]): string[] {
  let raizReal: string;
  try {
    raizReal = realpathSync(raiz);
  } catch {
    return [];
  }
  for (const rel of [".expx", DIR_REGISTRO]) {
    const abs = join(raiz, ...rel.split("/"));
    if (!existe(abs)) return [];
    try {
      diretorioSeguro(raizReal, abs, rel);
    } catch (e: unknown) {
      return [e instanceof Error ? e.message : String(e)];
    }
  }
  return ids
    .map(caminhoDoRegistro)
    .filter((rel) => lstatOuNada(join(raiz, ...rel.split("/")))?.isSymbolicLink() === true)
    .map((rel) => erroLink(rel).message);
}

/**
 * Grava uma resolução. Ausente: publica. Presente e idêntica: nada a fazer.
 * Qualquer outra coisa FALHA, e o `init` aborta antes do lock.
 */
export function gravarNoRegistro(raiz: string, r: Resolucao, teste?: OpcoesDeTeste): void {
  const raizReal = realpathSync(raiz);
  const idExpx = garantirDiretorio(raizReal, raiz, ".expx");
  const idDir = garantirDiretorio(raizReal, raiz, DIR_REGISTRO);
  // O `mkdir` de `resolucoes` passou pelo caminho de `.expx`: ele ainda é o mesmo?
  conferirIdentidade(raizReal, raiz, ".expx", idExpx);
  const dir = join(raiz, ...DIR_REGISTRO.split("/"));
  const rel = caminhoDoRegistro(r.resolucao_id);
  const caminho = join(raiz, ...rel.split("/"));
  const texto = serializarRegistro(r);

  const revalidar = (): void => {
    conferirIdentidade(raizReal, raiz, ".expx", idExpx);
    conferirIdentidade(raizReal, raiz, DIR_REGISTRO, idDir);
  };

  if (existe(caminho)) {
    // O `O_NOFOLLOW` só protege o componente final: a leitura passou pelo
    // caminho dos diretórios, que precisam continuar os mesmos.
    teste?.antesDaRevalidacao?.();
    conferirExistente(caminho, rel, texto);
    revalidar();
    return;
  }

  const tmp = join(dir, teste?.nomeTemporario ?? `.${r.resolucao_id}.${randomBytes(16).toString("hex")}.tmp`);
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
  let idTmp: Identidade;
  try {
    // `writeSync` pode escrever menos que o pedido sem lançar: escreve até o fim.
    const bytes = Buffer.from(texto, "utf8");
    for (let feito = 0; feito < bytes.length; ) {
      const n = writeSync(fd, bytes, feito, Math.min(bytes.length - feito, teste?.limiteDeEscrita ?? bytes.length));
      if (n <= 0) throw new Error(`${rel}: a escrita do temporario nao progrediu`);
      feito += n;
    }
    fsyncSync(fd);
    const st = fstatSync(fd);
    idTmp = { dev: st.dev, ino: st.ino };
  } finally {
    closeSync(fd);
  }

  // Revalidação: o diretório é o mesmo de antes, e o temporário é o nosso. Se
  // não for, nem a limpeza é confiável: o temporário fica órfão.
  teste?.antesDaRevalidacao?.();
  revalidar();
  if (!mesma(idTmp, lstatSync(tmp))) throw new Error(`${DIR_REGISTRO} foi trocado durante a gravacao (nada foi publicado)`);

  try {
    linkSync(tmp, caminho);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
      limpar(tmp, idTmp);
      throw e;
    }
    // Outro escritor publicou primeiro: vale se é o mesmo conteúdo, lido pelos mesmos diretórios.
    try {
      conferirExistente(caminho, rel, texto);
      revalidar();
    } finally {
      limpar(tmp, idTmp);
    }
    return;
  }
  limpar(tmp, idTmp);
  sincronizarDiretorio(dir);
}
