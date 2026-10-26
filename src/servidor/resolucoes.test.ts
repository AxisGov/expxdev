import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolucaoId, type Resolucao } from "../orquestracao/resolver.js";
import { serializarRegistro } from "../orquestracao/materializar.js";
import type { LinhaEvento } from "../parser/esquema/evento.js";
import { lerResolucoesCitadas } from "./resolucoes.js";

/** O painel lê do registro só as resoluções que os eventos citam (F3a). */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function resolucao(agente: string, extra: Partial<Resolucao> = {}): Resolucao {
  const semId = {
    versao_resolvedor: 1,
    tabela_embutida: 1,
    matriz_effort_claude: 1,
    adaptador: "claude" as const,
    agente,
    classe_declarada: "raciocinio_normal" as const,
    origem_classe: "declarada" as const,
    classe_resolvida: "raciocinio_normal" as const,
    cadeia: [{ id: "skill", model: "sonnet", effort: "high" }],
    alternativa: { id: "skill", model: "sonnet", effort: "high" },
    origem_alternativa: "skill" as const,
    ...extra,
  };
  return { ...semId, resolucao_id: resolucaoId(semId) } as Resolucao;
}

function projeto(rs: Resolucao[]): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-painel-res-"));
  criados.push(raiz);
  mkdirSync(join(raiz, ".expx", "resolucoes"), { recursive: true });
  for (const r of rs) writeFileSync(join(raiz, ".expx", "resolucoes", `${r.resolucao_id}.json`), serializarRegistro(r));
  return raiz;
}

const evento = (resolucao_id: unknown): LinhaEvento => ({ evento: "veredito_emitido", agente: "auditor", resolucao_id } as unknown as LinhaEvento);

describe("lerResolucoesCitadas", () => {
  it("funcional: lê só o que os eventos citam, com a alternativa e, na exceção v1, o materializado", () => {
    const a = resolucao("auditor");
    const v1 = resolucao("triagem", { origem_alternativa: "agentes-json-v1", sobreposta_por: "agentes-json-v1", materializado: { model: "haiku" } });
    const fora = resolucao("outro");
    const raiz = projeto([a, v1, fora]);
    const m = lerResolucoesCitadas(raiz, { t: [evento(a.resolucao_id), evento(v1.resolucao_id), evento(undefined)] });
    expect(m).toEqual({
      [a.resolucao_id]: { agente: "auditor", model: "sonnet", effort: "high" },
      [v1.resolucao_id]: { agente: "triagem", model: "haiku", effort: null },
    });
  });

  it("funcional: id fora do formato não vira caminho; ausente, adulterado ou link é null", () => {
    const a = resolucao("auditor");
    const raiz = projeto([a]);
    const adulterado = resolucao("b");
    writeFileSync(join(raiz, ".expx", "resolucoes", `${adulterado.resolucao_id}.json`), serializarRegistro({ ...adulterado, agente: "c" }));
    const ausente = "e".repeat(64);
    const m = lerResolucoesCitadas(raiz, { t: [evento("../../etc/passwd"), evento(adulterado.resolucao_id), evento(ausente)] });
    expect(Object.keys(m)).not.toContain("../../etc/passwd");
    expect(m[adulterado.resolucao_id]).toBeNull();
    expect(m[ausente]).toBeNull();
  });

  it.skipIf(process.platform === "win32")("funcional: registro que é link simbólico é null, mesmo apontando para conteúdo válido", () => {
    const a = resolucao("auditor");
    const fora = mkdtempSync(join(tmpdir(), "expx-painel-fora-"));
    criados.push(fora);
    writeFileSync(join(fora, "r.json"), serializarRegistro(a));
    const raiz = projeto([]);
    symlinkSync(join(fora, "r.json"), join(raiz, ".expx", "resolucoes", `${a.resolucao_id}.json`));
    expect(lerResolucoesCitadas(raiz, { t: [evento(a.resolucao_id)] })[a.resolucao_id]).toBeNull();
  });
});
