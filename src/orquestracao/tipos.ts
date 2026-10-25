/**
 * Vocabulário do contrato `expx-orquestracao` v1
 * (`docs/contrato/CONTRATO-expx-orquestracao.md`).
 */

/** Em ordem crescente: só as classes têm ordem, nunca os modelos. */
export const CLASSES = ["mecanico_triagem", "raciocinio_normal", "profundo_excepcional"] as const;
export type Classe = (typeof CLASSES)[number];

/** Os mesmos de `HARNESS_VALIDOS`. Só o `claude` tem suporte operacional na v1. */
export const ADAPTADORES = ["claude", "opencode", "codex"] as const;
export type Adaptador = (typeof ADAPTADORES)[number];

export function posto(c: Classe): number {
  return CLASSES.indexOf(c);
}

export type Alternativa = { id: string; model: string; effort?: string };
export type Cadeias = Partial<Record<Classe, Alternativa[]>>;

export type Politica = {
  adaptadores: Partial<Record<Adaptador, { classes: Cadeias }>>;
  agentes: Record<string, { classe: Classe; justificativa?: string }>;
};

/** Id reservado para a alternativa sintética que vem do frontmatter da skill. */
export const ID_FRONTMATTER = "frontmatter-da-skill";
