import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { arquivosDoCaso, respostaDoCaso, type CasoConformidade } from "../teste/conformidade.js";
import { RAIZ_DO_REPO } from "../teste/candidatos.js";

interface PerfilCli {
  max_files: number; max_linhas: number; max_bytes: number;
  excluidos: { nomes: string[]; extensoes: string[]; sufixos: string[] };
  motivos: { exatos: string[]; padroes: string[] };
}
interface Limites {
  perfilCli(versao: string): PerfilCli | undefined;
  revisavel(caminho: string, perfil: PerfilCli): boolean;
  medir(conteudo: Buffer): { linhas: number; bytes: number };
  motivoAceito(motivo: string, perfil: PerfilCli): boolean;
}
interface Resposta {
  meta: { reviewed_files: string[]; skipped: { file: string; reason: string }[]; max_files: number };
}
const m = (await import(pathToFileURL(join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-limites.mjs")).href)) as Limites;
const perfil = m.perfilCli("0.5.14")!;
const casos: CasoConformidade[] = ["limite40", "limite41", "pulos", "pulos-uncommitted"];

describe("conformidade gravada do codeant-cli 0.5.14", () => {
  it.each(casos)("reconcilia todos os caminhos e motivos de %s", (caso) => {
    const arquivos = arquivosDoCaso(caso);
    const resposta = JSON.parse(respostaDoCaso(caso).toString("utf8")) as Resposta;
    expect(resposta.meta.max_files).toBe(perfil.max_files);
    for (const caminho of resposta.meta.reviewed_files) {
      const conteudo = arquivos.get(caminho);
      expect(conteudo, caminho).toBeInstanceOf(Buffer);
      expect(m.revisavel(caminho, perfil), caminho).toBe(true);
      const medida = m.medir(conteudo as Buffer);
      expect(medida.linhas, caminho).toBeLessThanOrEqual(perfil.max_linhas);
      expect(medida.bytes, caminho).toBeLessThanOrEqual(perfil.max_bytes);
    }
    for (const { file, reason } of resposta.meta.skipped) {
      expect(arquivos.has(file), file).toBe(true);
      expect(m.motivoAceito(reason, perfil), `${file}: ${reason}`).toBe(true);
      const conteudo = arquivos.get(file);
      if (reason === "deleted") expect(conteudo).toBeNull();
      else if (reason === "binary/generated") expect(m.revisavel(file, perfil)).toBe(false);
      else if (reason === "excluded by pattern") expect(file).toMatch(/^gerado\//);
      else if (reason.startsWith("too large")) {
        expect(m.revisavel(file, perfil)).toBe(true);
        const medida = m.medir(conteudo as Buffer);
        expect(medida.linhas > perfil.max_linhas || medida.bytes > perfil.max_bytes).toBe(true);
      } else if (reason === "exceeded 40-file limit") {
        expect(m.revisavel(file, perfil)).toBe(true);
        const medida = m.medir(conteudo as Buffer);
        expect(medida.linhas).toBeLessThanOrEqual(perfil.max_linhas);
        expect(medida.bytes).toBeLessThanOrEqual(perfil.max_bytes);
        expect([...arquivos.keys()].filter((x) => m.revisavel(x, perfil)).indexOf(file)).toBeGreaterThanOrEqual(perfil.max_files);
      }
    }
  });

  it("fixa as bordas de linhas e bytes reproduzidas pelo gerador", () => {
    const limite40 = arquivosDoCaso("limite40");
    expect(m.medir(limite40.get("linhas-5000.js") as Buffer)).toEqual({ linhas: 5000, bytes: 132785 });
    expect(m.medir(limite40.get("bytes-204800.js") as Buffer)).toEqual({ linhas: 101, bytes: 204800 });
    const pulos = arquivosDoCaso("pulos");
    expect(m.medir(pulos.get("linhas-5000-quebra-final.js") as Buffer).linhas).toBe(5001);
    expect(m.medir(pulos.get("linhas-5001.js") as Buffer).linhas).toBe(5001);
    expect(m.medir(pulos.get("bytes-204801.js") as Buffer).bytes).toBe(204801);
  });
});
