import { describe, it, expect } from "vitest";
import { interpretarFalhasDeAmbiente, lerFalhasDeAmbiente, plataformaAtual } from "./falhas-ambiente.js";

const TSV = [
  "# caminho\tplataforma\tmotivo\tdesde",
  "src/a.test.ts\twin32\tsymlink exige admin\t2026-11-20",
  "src/b.test.ts\tlinux\tsem git no runner\t2026-11-21",
  "src/c.test.ts\twin32\t\t2026-11-22",
  "src/d.test.ts\twin32\t   \t2026-11-22",
  "",
].join("\r\n");

describe("falhas de ambiente: leitura do tsv", () => {
  it("funcional: só entra o caminho da plataforma pedida, com CRLF tolerado", () => {
    expect([...interpretarFalhasDeAmbiente(TSV, "win32")]).toEqual(["src/a.test.ts"]);
    expect([...interpretarFalhasDeAmbiente(TSV, "linux")]).toEqual(["src/b.test.ts"]);
    expect([...interpretarFalhasDeAmbiente(TSV, "darwin")]).toEqual([]);
  });

  it("funcional: motivo vazio ou só espaços invalida a linha", () => {
    const s = interpretarFalhasDeAmbiente(TSV, "win32");
    expect(s.has("src/c.test.ts")).toBe(false);
    expect(s.has("src/d.test.ts")).toBe(false);
  });

  it("funcional: linha comentada não vale", () => {
    expect(interpretarFalhasDeAmbiente("#src/a.test.ts\twin32\tm\t2026-11-20", "win32").size).toBe(0);
  });

  it("funcional: EXPX_PLATAFORMA vence process.platform", () => {
    expect(plataformaAtual({ EXPX_PLATAFORMA: "linux" }, "win32")).toBe("linux");
    expect(plataformaAtual({}, "darwin")).toBe("darwin");
    expect(plataformaAtual({ EXPX_PLATAFORMA: "  " }, "win32")).toBe("win32");
  });

  it("integração: arquivo ausente devolve lista vazia sem lançar", () => {
    expect(lerFalhasDeAmbiente("fixtures/projeto-ok", "win32").size).toBe(0);
  });
});
