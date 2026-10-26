import { describe, expect, it } from "vitest";
import { CABECALHO_PROJECAO, serializarProjecao } from "./projecao.js";
import type { Resolucao } from "./resolver.js";

/** A projeção plana das resoluções que o escritor do rastro lê em bash (F3a). */

const base = (agente: string, extra: Partial<Resolucao> = {}): Resolucao => ({
  versao_resolvedor: 1,
  tabela_embutida: 1,
  matriz_effort_claude: 1,
  adaptador: "claude",
  agente,
  classe_declarada: "raciocinio_normal",
  origem_classe: "declarada",
  classe_resolvida: "raciocinio_normal",
  cadeia: [{ id: "skill", model: "sonnet", effort: "high" }],
  alternativa: { id: "skill", model: "sonnet", effort: "high" },
  origem_alternativa: "skill",
  resolucao_id: (agente === "b" ? "b" : "a").repeat(64),
  ...extra,
});

describe("serializarProjecao", () => {
  it("funcional: cabeçalho, uma linha por agente em ordem, nove campos e `-` sem materializado", () => {
    const r = serializarProjecao([base("b"), base("a")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [cab, a, b, fim] = r.texto.split("\n");
    expect(cab).toBe(CABECALHO_PROJECAO);
    expect(a).toBe(["a", "a".repeat(64), "raciocinio_normal", "declarada", "raciocinio_normal", "skill", "skill", "-", "-"].join("\t"));
    expect(b?.startsWith("b\t")).toBe(true);
    expect(fim).toBe("");
  });

  it("funcional: na exceção do v1, materializado com e sem effort", () => {
    const com = serializarProjecao([base("a", { origem_alternativa: "agentes-json-v1", sobreposta_por: "agentes-json-v1", materializado: { model: "haiku", effort: "low" } })]);
    const sem = serializarProjecao([base("a", { origem_alternativa: "agentes-json-v1", sobreposta_por: "agentes-json-v1", materializado: { model: "haiku" } })]);
    expect(com.ok && com.texto.split("\n")[1]?.split("\t").slice(7)).toEqual(["haiku", "low"]);
    expect(sem.ok && sem.texto.split("\n")[1]?.split("\t").slice(7)).toEqual(["haiku", "-"]);
  });

  it("funcional: valor com tab, quebra de linha, espaço, aspa ou igual a `-` é recusado", () => {
    for (const ruim of ["a\tb", "a\nb", "a b", 'a"b', "-", ""]) {
      expect(serializarProjecao([base("a", { alternativa: { id: ruim, model: "sonnet" } })]).ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  it("funcional: agente repetido é recusado", () => {
    expect(serializarProjecao([base("a"), base("a")]).ok).toBe(false);
  });
});
