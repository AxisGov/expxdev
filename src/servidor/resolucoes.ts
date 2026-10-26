import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { caminhoDoRegistro, lerRegistro } from "../orquestracao/materializar.js";
import type { LinhaEvento } from "../parser/esquema/evento.js";

/** O que o painel mostra de uma resolução citada por um evento sem observação. */
export type ResolucaoNoPainel = {
  agente: string;
  /** O que foi materializado: o `materializado` na exceção do v1, senão a alternativa. */
  model: string;
  effort: string | null;
};

const ID = /^[0-9a-f]{64}$/;

/**
 * As resoluções que os eventos citam, lidas do registro `.expx/resolucoes/`.
 *
 * O id vem do rastro, que qualquer escritor alcança: fora do formato ele nunca
 * vira caminho. O arquivo precisa ser regular (link é recusado) e passar pelo
 * `lerRegistro`, que confere o id e a forma canônica. Ausente, ilegível ou
 * adulterado vira `null` — a inconsistência que o painel sinaliza, sem inventar
 * configuração.
 */
export function lerResolucoesCitadas(raiz: string, eventos: Readonly<Record<string, readonly LinhaEvento[]>>): Record<string, ResolucaoNoPainel | null> {
  const ids = new Set<string>();
  for (const linhas of Object.values(eventos)) {
    for (const e of linhas) {
      const id = (e as Record<string, unknown>)["resolucao_id"];
      if (typeof id === "string" && ID.test(id)) ids.add(id);
    }
  }
  const saida: Record<string, ResolucaoNoPainel | null> = {};
  for (const id of [...ids].sort()) saida[id] = lerUma(raiz, id);
  return saida;
}

function lerUma(raiz: string, id: string): ResolucaoNoPainel | null {
  const caminho = join(raiz, ...caminhoDoRegistro(id).split("/"));
  try {
    if (!lstatSync(caminho).isFile()) return null;
    const r = lerRegistro(id, readFileSync(caminho, "utf8"));
    if (!r.ok) return null;
    const m = r.resolucao.materializado;
    return m !== undefined
      ? { agente: r.resolucao.agente, model: m.model, effort: m.effort ?? null }
      : { agente: r.resolucao.agente, model: r.resolucao.alternativa.model, effort: r.resolucao.alternativa.effort ?? null };
  } catch {
    return null;
  }
}
