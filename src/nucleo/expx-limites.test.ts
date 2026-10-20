import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  homologadas(): string[];
  perfilCli(versao: string): PerfilCli | undefined;
  perfilApp(): { perfil: string; max_arquivos_pr: number; conta: string; fontes: string[] };
  limites(): { perfil_cli: string; l1_arquivos: number; l2_linhas: number; l2_bytes: number; l3_arquivos: number };
  revisavel(caminho: string, perfil: PerfilCli): boolean;
  medir(conteudo: Buffer): { linhas: number; bytes: number };
  motivoAceito(motivo: string, perfil: PerfilCli): boolean;
}
interface PerfilCli {
  perfil: string;
  versao: string;
  max_files: number;
  max_linhas: number;
  max_bytes: number;
  excluidos: { nomes: string[]; extensoes: string[]; sufixos: string[] };
  motivos: { exatos: string[]; padroes: string[] };
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

describe("perfis e limites do CodeAnt", () => {
  it("carrega os perfis homologados e deriva os limites fixos", () => {
    expect(m.homologadas()).toEqual(["0.5.14"]);
    expect(m.perfilCli("inexistente")).toBeUndefined();
    expect(m.perfilCli("0.5.14")).toMatchObject({ perfil: "codeant-cli", versao: "0.5.14", max_files: 40,
      max_linhas: 5000, max_bytes: 204800 });
    expect(m.perfilApp()).toMatchObject({ perfil: "codeant-app", max_arquivos_pr: 100 });
    expect(m.limites()).toEqual({ perfil_cli: "codeant-cli@0.5.14", l1_arquivos: 40, l2_linhas: 5000,
      l2_bytes: 204800, l3_arquivos: 100 });
  });

  it.each([
    ["src/app.js", true], ["README.md", true], ["dados/desconhecido.xyz", true], ["logo.PNG", false],
    ["package-lock.json", false], ["src/package-lock.json", false], ["bundle.min.js", false],
    ["src/bundle.MIN.JS", true], ["manual.pdf", false], ["dados.csv", false],
  ])("revisavel(%s) = %s", (caminho, esperado) => {
    expect(m.revisavel(caminho, m.perfilCli("0.5.14")!)).toBe(esperado);
  });

  it("mede UTF-8, quebra final e byte invalido como a CLI", () => {
    expect(m.medir(Buffer.from("a\nb", "utf8"))).toEqual({ linhas: 2, bytes: 3 });
    expect(m.medir(Buffer.from("a\n", "utf8"))).toEqual({ linhas: 2, bytes: 2 });
    expect(m.medir(Buffer.from([0xff]))).toEqual({ linhas: 1, bytes: 3 });
  });

  it("aceita apenas motivos exatos ou padroes homologados", () => {
    const perfil = m.perfilCli("0.5.14")!;
    for (const motivo of ["binary/generated", "deleted", "excluded by pattern", "exceeded 40-file limit",
      "too large (200 KB, max 200 KB)", "too large (5001 lines, max 5000)"]) {
      expect(m.motivoAceito(motivo, perfil)).toBe(true);
    }
    expect(m.motivoAceito("too large", perfil)).toBe(false);
  });

  it.each([
    ["codeant-cli-0.5.14.json", "max_files", "quarenta"],
    ["codeant-app.json", "max_arquivos_pr", 0],
  ])("recusa perfil malformado citando o campo %s/%s", async (arquivo, campo, valor) => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-perfis-invalidos-"));
    try {
      const scripts = join(raiz, "scripts"), perfis = join(scripts, "perfis");
      mkdirSync(perfis, { recursive: true });
      copyFileSync(join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-limites.mjs"), join(scripts, "expx-limites.mjs"));
      for (const nome of ["codeant-cli-0.5.14.json", "codeant-app.json"]) {
        const origem = join(RAIZ_DO_REPO, "nucleo", "scripts", "perfis", nome);
        const perfil = JSON.parse(readFileSync(origem, "utf8"));
        if (nome === arquivo) perfil[campo] = valor;
        writeFileSync(join(perfis, nome), JSON.stringify(perfil));
      }
      await expect(import(`${pathToFileURL(join(scripts, "expx-limites.mjs")).href}?campo=${campo}`)).rejects.toThrow(campo);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
