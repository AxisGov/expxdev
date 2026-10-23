import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lerConfiguracoesAgentes } from "./agentes.js";
import { lerEstado } from "./estado.js";

let temporario: string | null = null;

afterEach(() => {
  if (temporario !== null) rmSync(temporario, { recursive: true, force: true });
  temporario = null;
});

describe("projeções descartáveis do painel", () => {
  it("integração: reutiliza o rastro rotacionado e o entrega do mais novo ao mais antigo", () => {
    const estado = lerEstado(
      { raiz: "fixtures/watch/com-estado", diasBloqueio: 7 },
      new Date("2026-08-29T15:00:00Z"),
    );

    const eventos = estado.eventos["exportacao-csv"];
    expect(eventos).toHaveLength(7);
    expect(eventos?.[0]?.ts).toBe("2026-08-29T14:32:00Z");
    expect(eventos?.at(-1)?.ts).toBe("2026-08-28T09:00:00Z");
  });

  it("funcional: lê modelo e esforço do agente efetivamente instalado", () => {
    temporario = mkdtempSync(join(tmpdir(), "expx-agentes-painel-"));
    const dir = join(temporario, ".claude", "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "investigador.md"),
      [
        "---",
        "name: sprintx-investigador",
        "description: investiga",
        "model: sonnet",
        "effort: medium",
        "---",
        "",
        "Instruções.",
      ].join("\n"),
    );
    writeFileSync(join(dir, "invalido.md"), "sem frontmatter");

    expect(lerConfiguracoesAgentes(temporario)).toEqual([
      {
        nome: "sprintx-investigador",
        model: "sonnet",
        effort: "medium",
        arquivo: ".claude/agents/investigador.md",
      },
    ]);
  });

  it("funcional: projeto sem agentes instalados falha aberto", () => {
    temporario = mkdtempSync(join(tmpdir(), "expx-sem-agentes-"));
    expect(lerConfiguracoesAgentes(temporario)).toEqual([]);
  });
});
