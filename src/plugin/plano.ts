import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/**
 * O plano de instalação: todo arquivo que o `init` vai escrever, decidido ANTES
 * da primeira escrita.
 *
 * ## Por que existe
 *
 * A instalação copiava skill por skill com `cpSync`, cujo padrão é sobrescrever:
 * duas skills publicando o mesmo destino com bytes diferentes resolviam o
 * conflito pela ORDEM em que foram escolhidas — a última vencia, em silêncio.
 * E como o conflito só aparecia no meio da cópia, não havia como recusar sem
 * deixar o projeto pela metade.
 *
 * Aqui a ordem é: PLANEJAR → VALIDAR → APLICAR. Cada destino sabe de que skill
 * e de que arquivo veio, e o hash do conteúdo. A regra de colisão:
 *
 *   - destino exclusivo                       → instala;
 *   - mesmo destino, mesmo hash               → deduplica (é o mesmo arquivo);
 *   - mesmo destino, hash diferente           → FALHA, antes de escrever.
 *
 * A comparação de destino ignora maiúsculas: no Windows e no macOS `README.md`
 * e `readme.md` são o mesmo arquivo, e um repositório de produto é
 * compartilhado entre sistemas.
 *
 * O resultado é ordenado pelo destino, então não depende da ordem das skills.
 */

export type TipoArtefato = "nucleo" | "skill" | "comando" | "hook";

export type Artefato = {
  /** Relativo à raiz onde o plano é aplicado, sempre com `/`. */
  destino: string;
  /** Caminho absoluto do arquivo de origem. */
  origem: string;
  /** A skill dona; `expx` para o núcleo do próprio CLI. */
  skill: string;
  /** sha256 do conteúdo de origem. */
  hash: string;
  tipo: TipoArtefato;
  /** Precisa do bit de execução: hook sem ele não roda, e não avisa. */
  executavel: boolean;
};

export type FonteDaColisao = { skill: string; origem: string; hash: string };
export type Colisao = { destino: string; fontes: FonteDaColisao[] };

export type Consolidacao =
  | { ok: true; artefatos: Artefato[] }
  | { ok: false; colisoes: Colisao[] };

/** A skill do núcleo vem antes das outras; as outras, em ordem alfabética. */
export const SKILL_DO_NUCLEO = "expx";

export function compararSkills(a: string, b: string): number {
  if (a === b) return 0;
  if (a === SKILL_DO_NUCLEO) return -1;
  if (b === SKILL_DO_NUCLEO) return 1;
  return a < b ? -1 : 1;
}

/** Ordem canônica de uma lista de skills: independe da ordem de escolha. */
export function emOrdemCanonica<T extends { nome: string }>(skills: readonly T[]): T[] {
  return [...skills].sort((a, b) => compararSkills(a.nome, b.nome));
}

/**
 * JSON com as chaves de objeto ordenadas: a forma de comparar duas definições
 * "semanticamente" sem depender da ordem em que o autor escreveu as chaves.
 */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (typeof valor === "object" && valor !== null) {
    const chaves = Object.keys(valor).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonCanonico((valor as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

export function hashDeBytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const IGNORADAS = new Set([".git"]);

/** Os arquivos da árvore, relativos à raiz, com `/`, em ordem estável. */
export function listarArquivos(raiz: string): string[] {
  const saida: string[] = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const dir = fila.shift();
    if (dir === undefined) break;
    for (const e of readdirSync(dir)) {
      if (IGNORADAS.has(e)) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) fila.push(p);
      else saida.push(relative(raiz, p).split(sep).join("/"));
    }
  }
  return saida.sort();
}

/** O arquivo começa com `#!`? O sinal de "isto é feito para ser executado". */
function temShebang(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21;
}

/**
 * Quem recebe o bit de execução, decidido sem tocar no disco.
 *
 * `.sh` é executável pela extensão, sempre: é o que os hooks registram, e não
 * depende de como a origem chegou.
 *
 * Para o resto, o bit da ORIGEM é **necessário mas não suficiente**, porque ele
 * é sinal ruidoso. `EXPX_SKILLS_LOCAIS` não clona — `copiarLocal` usa `cpSync`,
 * que PRESERVA o modo. Numa origem hospedada em DrvFs (`/mnt/c`, quem edita a
 * skill no Windows e roda no WSL) todo arquivo aparece 0777, e o `cpSync` grava
 * 0777 de verdade na cópia; daí em diante não é mais artefato de filesystem, é o
 * modo real do arquivo. Sem esta guarda, `SKILL.md` e `.json` entravam em
 * `instalacao.executaveis` e o `doctor` exigia `git update-index --chmod=+x`
 * para a instalação inteira, documentação incluída, como erro. O mesmo acontecia
 * com uma origem cujo `SKILL.md` ficou 0755 por umask ou por cópia de FAT.
 *
 * O shebang é o segundo sinal, e é de CONTEÚDO: nenhum filesystem o fabrica. Um
 * `.md` 0777 não tem `#!`; um `motor.py` que a skill quer executar tem.
 *
 * Preço aceito: um executável compilado (sem shebang e sem `.sh`) deixaria de
 * ser marcado, e o plano o gravaria 0644. Nenhuma skill do catálogo traz binário
 * — os 35 executáveis de hoje são `.sh`, todos com shebang, e o único `.mjs`
 * roda por `node` e já é declarado não executável em `harness/hooks.ts`. Se um
 * dia houver binário, é aqui que a regra precisa crescer.
 */
export function decidirExecutavel(rel: string, modo: number, shebang: boolean): boolean {
  if (rel.endsWith(".sh")) return true;
  if ((modo & 0o111) === 0) return false;
  return shebang;
}

function ehExecutavel(origem: string, rel: string, bytes: Buffer): boolean {
  let modo = 0;
  try {
    modo = statSync(origem).mode;
  } catch {
    modo = 0; // sem stat, sem bit: `.sh` ainda decide pela extensão
  }
  return decidirExecutavel(rel, modo, temShebang(bytes));
}

/** Um arquivo como artefato. */
export function artefato(origem: string, destino: string, skill: string, tipo: TipoArtefato): Artefato {
  // Os bytes são lidos UMA vez: o hash e a decisão do bit usam os mesmos.
  const bytes = readFileSync(origem);
  return {
    destino,
    origem,
    skill,
    hash: hashDeBytes(bytes),
    tipo,
    executavel: ehExecutavel(origem, destino, bytes),
  };
}

/** Cada arquivo de `raizOrigem` projetado sob `prefixo`. */
export function artefatosDaArvore(
  raizOrigem: string,
  prefixo: string,
  skill: string,
  tipo: TipoArtefato,
  incluir: (rel: string) => boolean = () => true,
): Artefato[] {
  return listarArquivos(raizOrigem)
    .filter(incluir)
    .map((rel) => artefato(join(raizOrigem, ...rel.split("/")), `${prefixo}/${rel}`, skill, tipo));
}

function chaveDeDestino(destino: string): string {
  return destino.toLowerCase();
}

/**
 * Aplica a regra de colisão. Não escreve nada: devolve o plano deduplicado e
 * ordenado, ou TODAS as colisões encontradas.
 *
 * Também é colisão um destino que é arquivo para uma skill e pasta para outra
 * (`a` e `a/b`): nenhuma ordem de escrita satisfaz as duas.
 */
export function consolidar(artefatos: readonly Artefato[]): Consolidacao {
  const porDestino = new Map<string, Artefato[]>();
  for (const a of artefatos) {
    const k = chaveDeDestino(a.destino);
    const lista = porDestino.get(k);
    if (lista === undefined) porDestino.set(k, [a]);
    else lista.push(a);
  }

  const colisoes: Colisao[] = [];
  const unicos: Artefato[] = [];
  for (const lista of porDestino.values()) {
    const ordenada = [...lista].sort((x, y) => compararSkills(x.skill, y.skill) || (x.origem < y.origem ? -1 : x.origem > y.origem ? 1 : 0));
    const primeiro = ordenada[0] as Artefato;
    if (ordenada.some((a) => a.hash !== primeiro.hash || a.destino !== primeiro.destino)) {
      colisoes.push({
        destino: primeiro.destino,
        fontes: ordenada.map((a) => ({ skill: a.skill, origem: a.origem, hash: a.hash })),
      });
      continue;
    }
    unicos.push(primeiro);
  }

  for (const a of unicos) {
    const partes = a.destino.split("/");
    for (let i = 1; i < partes.length; i++) {
      const ancestral = partes.slice(0, i).join("/");
      const outro = porDestino.get(chaveDeDestino(ancestral));
      if (outro === undefined) continue;
      colisoes.push({
        destino: ancestral,
        fontes: [
          ...outro.map((o) => ({ skill: o.skill, origem: o.origem, hash: o.hash })),
          { skill: a.skill, origem: a.origem, hash: `pasta de ${a.destino}` },
        ],
      });
    }
  }

  if (colisoes.length > 0) {
    colisoes.sort((x, y) => (x.destino < y.destino ? -1 : x.destino > y.destino ? 1 : 0));
    return { ok: false, colisoes };
  }
  unicos.sort((x, y) => (x.destino < y.destino ? -1 : x.destino > y.destino ? 1 : 0));
  return { ok: true, artefatos: unicos };
}

/**
 * Os destinos podem ser escritos? Um ancestral que já existe como ARQUIVO (um
 * `.opencode` que não é pasta), ou um destino que já existe como PASTA, faria a
 * escrita falhar no meio — com parte do projeto já alterada. É previsível, então
 * é verificado antes. Devolve a lista de problemas; vazia = pode aplicar.
 */
export function verificarDestinos(raiz: string, destinos: readonly string[]): string[] {
  const problemas = new Set<string>();
  const vistos = new Map<string, boolean>();
  const ehPasta = (rel: string): boolean | undefined => {
    if (vistos.has(rel)) return vistos.get(rel);
    let r: boolean | undefined;
    try {
      r = statSync(join(raiz, ...rel.split("/"))).isDirectory();
    } catch {
      r = undefined;
    }
    vistos.set(rel, r as boolean);
    return r;
  };
  for (const d of destinos) {
    const partes = d.split("/");
    for (let i = 1; i < partes.length; i++) {
      const anc = partes.slice(0, i).join("/");
      if (ehPasta(anc) === false) problemas.add(`${anc} existe e nao e pasta (necessario para ${d})`);
    }
    if (ehPasta(d) === true) problemas.add(`${d} existe como pasta e precisa ser arquivo`);
  }
  return [...problemas].sort();
}

/** A mensagem de uma colisão: destino, skills envolvidas e o hash de cada fonte. */
export function descreverColisoes(colisoes: readonly Colisao[]): string {
  const linhas = ["colisao de destino entre skills (nada foi escrito):"];
  for (const c of colisoes) {
    const skills = [...new Set(c.fontes.map((f) => f.skill))].join(", ");
    linhas.push(`  ${c.destino} — skills: ${skills}`);
    for (const f of c.fontes) linhas.push(`    ${f.skill}: ${f.hash.slice(0, 12)} ← ${f.origem}`);
  }
  linhas.push("nenhuma ordem de selecao decide qual versao vence: resolva a divergencia na origem das skills");
  return linhas.join("\n");
}

/**
 * Escreve o plano sob `raiz`.
 *
 * O conteúdo é relido e conferido contra o hash planejado: o que vai para o
 * disco é exatamente o que o plano (e, depois, o lock) afirma. Destino que já
 * tem os mesmos bytes não é reescrito — rodar o `init` de novo não mexe em
 * arquivo que não mudou.
 */
export function aplicarArtefatos(raiz: string, artefatos: readonly Artefato[]): void {
  for (const a of artefatos) {
    const bytes = readFileSync(a.origem);
    if (hashDeBytes(bytes) !== a.hash) {
      throw new Error(`${a.origem} mudou entre o plano e a aplicacao`);
    }
    const destino = join(raiz, ...a.destino.split("/"));
    let igual = false;
    if (existsSync(destino)) {
      try {
        igual = hashDeBytes(readFileSync(destino)) === a.hash;
      } catch {
        igual = false;
      }
    }
    if (!igual) {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, bytes);
    }
    if (a.executavel) chmodSync(destino, 0o755);
  }
}
