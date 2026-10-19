import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ_DO_REPO } from "../teste/candidatos.js";

interface Limites {
  EXCLUIDOS_DO_NUCLEO: readonly string[];
  RAIZES_DE_CODIGO: readonly string[];
  PASTAS_GERADAS: readonly string[];
  prefixoDe(padrao: string): string | null;
  excluido(caminho: string, padroes: readonly string[]): boolean;
  ehRaizDeCodigo(padrao: string): boolean;
  fatiaNoAmbiente(env: Record<string, string | undefined>): string[];
  mensagemFatia(nome: string): string;
}
// o módulo é do núcleo (ESM puro, copiado para os projetos): importado pelo caminho, como as skills o usam
const m = (await import(pathToFileURL(join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-limites.mjs")).href)) as Limites;

describe("expx-limites.mjs", () => {
  it.each([
    ["^fixtures/candidatos/", "fixtures/candidatos/"],
    ["^a\\.b/", "a.b/"],
    ["^dados de teste/", "dados de teste/"],
    ["^\\.github/", ".github/"],
    ["^a/\\.\\.\\./", "a/.../"],
  ])("funcional: prefixoDe(%s) é o prefixo literal", (padrao, prefixo) => {
    expect(m.prefixoDe(padrao)).toBe(prefixo);
  });

  it.each(["fixtures/", "^src", "^a/*/", "^(a|b)/", "^./", "^../x/", "^\\./", "^\\.\\./x/", "^a//", "^a.b/", "^", "^/", "^a/b", "^a$/", "^a\tb/", "^a\\d/", "^a\\/", ""])(
    "funcional: prefixoDe(%j) está fora da gramática", (padrao) => {
      expect(m.prefixoDe(padrao)).toBeNull();
    });

  it("funcional: exclusões do núcleo são as pastas de método, por prefixo literal", () => {
    expect(m.EXCLUIDOS_DO_NUCLEO).toEqual(["^docs/sprintx/", "^docs/entregas/", "^docs/eventos/"]);
    for (const p of m.EXCLUIDOS_DO_NUCLEO) expect(m.prefixoDe(p)).not.toBeNull();
    expect(m.excluido("docs/eventos/x.jsonl", m.EXCLUIDOS_DO_NUCLEO)).toBe(true);
    expect(m.excluido("docs/sprintx/s1/plano.md", m.EXCLUIDOS_DO_NUCLEO)).toBe(true);
    expect(m.excluido("docs/eventosx/a", m.EXCLUIDOS_DO_NUCLEO)).toBe(false);
    expect(m.excluido("a/docs/eventos/x", m.EXCLUIDOS_DO_NUCLEO)).toBe(false);
    // o ponto escapado é ponto literal, nunca "qualquer caractere"
    expect(m.excluido("a.b/c", ["^a\\.b/"])).toBe(true);
    expect(m.excluido("axb/c", ["^a\\.b/"])).toBe(false);
  });

  it("funcional: listas da emenda (raízes de código e pastas geradas)", () => {
    expect(m.RAIZES_DE_CODIGO).toEqual(["src", "lib", "app", "apps", "packages", "pkg", "cmd", "internal", "server", "client", "web", "api",
      "test", "tests", "spec", "scripts", ".github", ".claude", ".opencode", ".expx"]);
    expect(m.PASTAS_GERADAS).toEqual(["fixtures", "snapshots", "__snapshots__", "generated", "gerado"]);
  });

  it.each(["^src/", "^scripts/", "^\\.github/", "^\\.expx/", "^lib/vendor/", "^src/a/b/", "^tests/src/x/"])(
    "funcional: %s é raiz de código", (padrao) => {
      expect(m.ehRaizDeCodigo(padrao)).toBe(true);
    });

  it.each(["^scripts/ci/fixtures/candidatos/", "^src/__snapshots__/", "^fixtures/candidatos/", "^tests/gerado/", "^docs/src/", "^srcs/"])(
    "funcional: %s não é raiz de código", (padrao) => {
      expect(m.ehRaizDeCodigo(padrao)).toBe(false);
    });

  it("funcional: fatiaNoAmbiente devolve os FATIA_* ordenados, definidos mesmo vazios", () => {
    expect(m.fatiaNoAmbiente({ FATIA_X: "", PATH: "x", FATIA_A: "1", XFATIA_B: "1", FATIA_U: undefined })).toEqual(["FATIA_A", "FATIA_X"]);
    expect(m.fatiaNoAmbiente({ PATH: "x" })).toEqual([]);
  });

  it("funcional: mensagemFatia é o texto exato da emenda", () => {
    expect(m.mensagemFatia("FATIA_X")).toBe("`FATIA_X` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente");
  });
});
