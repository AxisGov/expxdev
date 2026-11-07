/**
 * Vocabulário do contrato `expx-orquestracao` v1
 * (`docs/contrato/CONTRATO-expx-orquestracao.md`).
 */

/** Em ordem crescente: só as classes têm ordem, nunca os modelos. */
export const CLASSES = ["mecanico_triagem", "raciocinio_normal", "profundo_excepcional"] as const;
export type Classe = (typeof CLASSES)[number];

/**
 * O que o agente faz (§2.2). Não entra na resolução: decide só quem passa pela
 * integridade final e roda em primeiro plano (`APROVACAO`).
 */
export const PAPEIS = ["planejar", "implementar", "investigar", "testar", "revisar"] as const;
export type Papel = (typeof PAPEIS)[number];
/** Os papéis que precisam provar que não escreveram no projeto (§12). */
export const APROVACAO: readonly Papel[] = ["testar", "revisar"];

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
