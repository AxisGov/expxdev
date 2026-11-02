import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `expx update --check --json`: o relatório que o SessionStart lê para avisar, sem
 * interpretar texto (0.13.2). Uma linha de JSON, sem registro de plugin.
 */
const update = vi.hoisted(() => ({ pendencias: [] as string[], bloqueadas: [] as Array<{ nome: string; motivo: string }>, ok: true }));
vi.mock("../update/flags.js", async (original) => {
  const real = await original<typeof import("../update/flags.js")>();
  return {
    ...real,
    executarUpdate: vi.fn(async () => ({
      ok: update.ok, aplicou: false, atualizadas: [], emDia: ["runx"], bloqueadas: update.bloqueadas, mensagens: ["texto que nao entra no JSON"], pendencias: update.pendencias,
    })),
  };
});
const registro = vi.hoisted(() => ({ chamadas: 0 }));
vi.mock("../harness/registro.js", async (original) => {
  const real = await original<typeof import("../harness/registro.js")>();
  return { ...real, registrarPluginNoClaude: vi.fn(async () => { registro.chamadas += 1; return { avisos: [], instalacao: { ok: true, executados: [] } }; }) };
});

import { executarExpx } from "./expx.js";

function rodar(argv: string[]): Promise<{ rc: number; texto: string }> {
  const partes: string[] = [];
  return executarExpx(argv, { escrever: (t) => partes.push(t), escreverErro: (t) => partes.push(t) }).then((rc) => ({ rc, texto: partes.join("") }));
}

describe("update --check --json", () => {
  beforeEach(() => {
    update.pendencias = [];
    update.bloqueadas = [];
    update.ok = true;
    registro.chamadas = 0;
  });

  it("funcional: com pendência, uma linha de JSON diz o que há a aplicar", async () => {
    update.pendencias = ["skill:mergex", "cli:0.13.1"];
    const { rc, texto } = await rodar(["update", "--check", "--json"]);
    expect(rc).toBe(0);
    expect(texto.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(texto)).toEqual({ ok: true, pendente: true, pendencias: ["skill:mergex", "cli:0.13.1"], bloqueadas: [] });
    expect(registro.chamadas).toBe(0);
  });

  it("funcional: em dia, pendente é false, e a saída continua JSON", async () => {
    const { rc, texto } = await rodar(["update", "--check", "--json"]);
    expect(rc).toBe(0);
    expect(JSON.parse(texto)).toMatchObject({ ok: true, pendente: false, pendencias: [] });
  });

  it("funcional: falha do check sai 1, ainda em JSON", async () => {
    update.ok = false;
    update.bloqueadas = [{ nome: "runx", motivo: "modificacao local" }];
    const { rc, texto } = await rodar(["update", "--check", "--json"]);
    expect(rc).toBe(1);
    expect(JSON.parse(texto)).toMatchObject({ ok: false, bloqueadas: [{ nome: "runx", motivo: "modificacao local" }] });
  });
});
