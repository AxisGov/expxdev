import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ADAPTADORES, CLASSES, ID_FRONTMATTER, type Politica } from "./tipos.js";

/**
 * `.expx/orquestracao.json`: a forma do arquivo (CONTRATO-expx-orquestracao §4.1).
 *
 * O zod cuida da estrutura; a mensagem é montada aqui, com o caminho da chave,
 * porque o erro bruto do zod não diz à pessoa onde mexer. A validação de
 * `model`/`effort` por adaptador fica em `adaptadores.ts`.
 *
 * Ausente é válido e quer dizer camada inativa (§3). Presente e inválido FALHA:
 * uma política que some em silêncio deixaria o agente no frontmatter quando a
 * pessoa pediu outra coisa — o mesmo motivo de `lerOverridesDoProjeto`.
 */

const ONDE = ".expx/orquestracao.json";
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const NOME_AGENTE = /^[a-z0-9][a-z0-9-]*$/;

const Alternativa = z.strictObject({
  id: z.string().regex(ID, "id fora do padrão ^[a-z0-9][a-z0-9._-]{0,63}$"),
  model: z.string().min(1, "model não pode ser vazio"),
  effort: z.string().optional(),
});

const Cadeia = z
  .array(Alternativa)
  .min(1, "a cadeia não pode ser vazia")
  .superRefine((alts, ctx) => {
    const vistos = new Set<string>();
    alts.forEach((a, i) => {
      if (a.id === ID_FRONTMATTER) ctx.addIssue({ code: "custom", path: [i, "id"], message: `"${ID_FRONTMATTER}" é reservado` });
      if (vistos.has(a.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `id "${a.id}" repetido na cadeia` });
      vistos.add(a.id);
    });
  });

const Classes = z.strictObject(Object.fromEntries(CLASSES.map((c) => [c, Cadeia.optional()])) as Record<(typeof CLASSES)[number], z.ZodOptional<typeof Cadeia>>);

const Adaptadores = z.strictObject(
  Object.fromEntries(ADAPTADORES.map((a) => [a, z.strictObject({ classes: Classes }).optional()])) as Record<
    (typeof ADAPTADORES)[number],
    z.ZodOptional<z.ZodObject<{ classes: typeof Classes }>>
  >,
);

const Agente = z
  .strictObject({
    classe: z.enum(CLASSES, `classe precisa ser uma de ${CLASSES.join(", ")}`),
    justificativa: z.string().optional(),
  })
  .superRefine((a, ctx) => {
    if (a.classe === "profundo_excepcional" && (a.justificativa ?? "").trim() === "") {
      ctx.addIssue({ code: "custom", path: ["justificativa"], message: "profundo_excepcional exige justificativa não vazia" });
    }
  });

const Arquivo = z.strictObject({
  expx_orquestracao: z.literal(1, "expx_orquestracao precisa ser 1"),
  adaptadores: Adaptadores.optional(),
  agentes: z
    .record(z.string(), Agente)
    .optional()
    .superRefine((agentes, ctx) => {
      for (const nome of Object.keys(agentes ?? {})) {
        if (!NOME_AGENTE.test(nome)) ctx.addIssue({ code: "custom", path: [nome], message: `nome de agente "${nome}" fora do padrão ^[a-z0-9][a-z0-9-]*$` });
      }
    }),
});

/** `adaptadores.claude.classes.raciocinio_normal[1].effort` */
function caminho(path: readonly PropertyKey[]): string {
  let s = "";
  for (const p of path) s += typeof p === "number" ? `[${String(p)}]` : `${s === "" ? "" : "."}${String(p)}`;
  return s === "" ? "(raiz)" : s;
}

export type ValidacaoPolitica = { ok: true; politica: Politica } | { ok: false; erro: string };

export function validarPolitica(bruto: unknown): ValidacaoPolitica {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ok: false, erro: `${ONDE} precisa ser um objeto` };
  }
  // Chave de topo começada por `_` é comentário, como em `.expx/agentes.json`.
  const semComentarios = Object.fromEntries(Object.entries(bruto).filter(([k]) => !k.startsWith("_")));
  const r = Arquivo.safeParse(semComentarios);
  if (!r.success) {
    const linhas = r.error.issues.map((i) => {
      const mensagem = i.code === "unrecognized_keys" ? `chave desconhecida: ${i.keys.join(", ")}` : i.message;
      return `  ${caminho(i.path)}: ${mensagem}`;
    });
    return { ok: false, erro: `${ONDE} inválido:\n${linhas.join("\n")}` };
  }
  return { ok: true, politica: semAusentes(r.data) };
}

/**
 * O zod devolve opcional ausente como `undefined` explícito. A política sai
 * sem essas chaves: o tipo pede ausência (`exactOptionalPropertyTypes`), e o
 * `jsonCanonico` do `resolucao_id` gravaria `undefined` como `null`.
 */
function semAusentes(dados: z.infer<typeof Arquivo>): Politica {
  const politica: Politica = { adaptadores: {}, agentes: {} };
  for (const a of ADAPTADORES) {
    const classes = dados.adaptadores?.[a]?.classes;
    if (classes === undefined) continue;
    const cadeias: Politica["adaptadores"][typeof a] = { classes: {} };
    for (const c of CLASSES) {
      const cadeia = classes[c];
      if (cadeia === undefined) continue;
      cadeias.classes[c] = cadeia.map((alt) => (alt.effort === undefined ? { id: alt.id, model: alt.model } : { id: alt.id, model: alt.model, effort: alt.effort }));
    }
    politica.adaptadores[a] = cadeias;
  }
  for (const [nome, ag] of Object.entries(dados.agentes ?? {})) {
    politica.agentes[nome] = ag.justificativa === undefined ? { classe: ag.classe } : { classe: ag.classe, justificativa: ag.justificativa };
  }
  return politica;
}

export type LeituraPolitica =
  | { ok: true; ativa: false }
  | { ok: true; ativa: true; politica: Politica }
  | { ok: false; erro: string };

export function lerPolitica(raiz: string): LeituraPolitica {
  const arquivo = join(raiz, ".expx", "orquestracao.json");
  if (!existsSync(arquivo)) return { ok: true, ativa: false };
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(arquivo, "utf8"));
  } catch (e: unknown) {
    return { ok: false, erro: `${ONDE} não é JSON válido e não será aplicado: ${String(e)}` };
  }
  const v = validarPolitica(bruto);
  return v.ok ? { ok: true, ativa: true, politica: v.politica } : v;
}
