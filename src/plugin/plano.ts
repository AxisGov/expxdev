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

export function hashDeBytes(bytes: Buffer): string {
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

function ehExecutavel(origem: string, rel: string): boolean {
  if (rel.endsWith(".sh")) return true;
  try {
    return (statSync(origem).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** Um arquivo como artefato. */
export function artefato(origem: string, destino: string, skill: string, tipo: TipoArtefato): Artefato {
  return {
    destino,
    origem,
    skill,
    hash: hashDeBytes(readFileSync(origem)),
    tipo,
    executavel: ehExecutavel(origem, destino),
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
