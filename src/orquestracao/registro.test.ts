import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializarRegistro } from "./materializar.js";
import { destinoDoRegistroInseguro, gravarNoRegistro } from "./registro.js";
import { resolver } from "./resolver.js";

/**
 * Escrita do registro `.expx/resolucoes/` (CONTRATO-expx-instalacao §5.3): nunca
 * sobrescreve nem segue o arquivo final, e detecta a troca de diretório que
 * persiste até a revalidação. Sem `openat` no Node, a janela depois da última
 * revalidação continua aberta — estes testes provam só o que é garantido.
 */

const POSIX = process.platform !== "win32";
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});
function temp(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

const r = resolver({ agente: { nome: "auditor", classe: "raciocinio_normal" }, adaptador: "claude", politica: { adaptadores: {}, agentes: {} } });
if (!r.ok) throw new Error(r.mensagem);
const resolucao = r.resolucao;
const ID = resolucao.resolucao_id;
const TEXTO = serializarRegistro(resolucao);
const dirReg = (raiz: string) => join(raiz, ".expx", "resolucoes");
const final = (raiz: string) => join(dirReg(raiz), `${ID}.json`);
const temporarios = (raiz: string) => (existsSync(dirReg(raiz)) ? readdirSync(dirReg(raiz)).filter((f) => f.endsWith(".tmp")) : []);

describe("gravarNoRegistro", () => {
  it("cria .expx e o diretório, grava e não deixa temporário", () => {
    const raiz = temp("expx-reg-");
    gravarNoRegistro(raiz, resolucao);
    expect(readFileSync(final(raiz), "utf8")).toBe(TEXTO);
    expect(temporarios(raiz)).toEqual([]);
  });

  it("existente idêntico é aceito; diferente é imutável", () => {
    const raiz = temp("expx-reg-");
    gravarNoRegistro(raiz, resolucao);
    gravarNoRegistro(raiz, resolucao);
    writeFileSync(final(raiz), "{}");
    expect(() => gravarNoRegistro(raiz, resolucao)).toThrow(/imutavel/);
    expect(temporarios(raiz)).toEqual([]);
  });

  it("dois escritores legítimos: o segundo recebe EEXIST, lê bytes iguais e conclui", () => {
    const raiz = temp("expx-reg-");
    gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: () => writeFileSync(final(raiz), TEXTO) });
    expect(readFileSync(final(raiz), "utf8")).toBe(TEXTO);
    expect(temporarios(raiz)).toEqual([]);
  });

  it("outro escritor publicou bytes diferentes no meio: imutável, sem sobrescrever", () => {
    const raiz = temp("expx-reg-");
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: () => writeFileSync(final(raiz), "{}") })).toThrow(/imutavel/);
    expect(readFileSync(final(raiz), "utf8")).toBe("{}");
    expect(temporarios(raiz)).toEqual([]);
  });

  it("colisão do temporário: O_EXCL falha e o arquivo existente não é truncado", () => {
    const raiz = temp("expx-reg-");
    mkdirSync(dirReg(raiz), { recursive: true });
    writeFileSync(join(dirReg(raiz), "colisao.tmp"), "de outro processo");
    expect(() => gravarNoRegistro(raiz, resolucao, { nomeTemporario: "colisao.tmp" })).toThrow();
    expect(readFileSync(join(dirReg(raiz), "colisao.tmp"), "utf8")).toBe("de outro processo");
    expect(existsSync(final(raiz))).toBe(false);
  });

  it(".expx/resolucoes que não é diretório é recusado", () => {
    const raiz = temp("expx-reg-");
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(dirReg(raiz), "arquivo");
    expect(() => gravarNoRegistro(raiz, resolucao)).toThrow(/diretorio/);
  });

  it.skipIf(!POSIX)("arquivo final que é link para fora não é seguido nem alterado", () => {
    const raiz = temp("expx-reg-");
    const fora = join(temp("expx-fora-"), "alvo.json");
    writeFileSync(fora, "alvo intacto");
    mkdirSync(dirReg(raiz), { recursive: true });
    symlinkSync(fora, final(raiz));
    expect(() => gravarNoRegistro(raiz, resolucao)).toThrow(/link simbolico|nao e arquivo regular/);
    expect(readFileSync(fora, "utf8")).toBe("alvo intacto");
  });

  it.skipIf(!POSIX)("troca do diretório por link antes da revalidação: aborta e nada vai para fora", () => {
    const raiz = temp("expx-reg-");
    const fora = temp("expx-fora-");
    const aparte = join(raiz, ".expx", "resolucoes-original");
    const trocar = () => {
      renameSync(dirReg(raiz), aparte);
      symlinkSync(fora, dirReg(raiz));
    };
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: trocar })).toThrow(/trocad|link simbolico/);
    expect(readdirSync(fora)).toEqual([]);
  });

  it("troca do diretório por OUTRO diretório real (sem link) também é detectada pela identidade", () => {
    const raiz = temp("expx-reg-");
    const trocar = () => {
      renameSync(dirReg(raiz), join(raiz, ".expx", "resolucoes-original"));
      mkdirSync(dirReg(raiz));
    };
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: trocar })).toThrow(/trocado/);
    expect(existsSync(final(raiz))).toBe(false);
  });

  it.skipIf(!POSIX)(".expx trocado por link INTERNO para o original (resolucoes intacto) é detectado", () => {
    const raiz = temp("expx-reg-");
    const trocar = () => {
      renameSync(join(raiz, ".expx"), join(raiz, ".expx-original"));
      symlinkSync(join(raiz, ".expx-original"), join(raiz, ".expx"));
    };
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: trocar })).toThrow(/\.expx/);
    expect(existsSync(join(raiz, ".expx-original", "resolucoes", `${ID}.json`))).toBe(false);
  });

  it.skipIf(!POSIX)(".expx trocado por link EXTERNO com o mesmo resolucoes dentro é detectado", () => {
    const raiz = temp("expx-reg-");
    const fora = temp("expx-fora-");
    const trocar = () => {
      renameSync(dirReg(raiz), join(fora, "resolucoes"));
      rmSync(join(raiz, ".expx"), { recursive: true });
      symlinkSync(fora, join(raiz, ".expx"));
    };
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: trocar })).toThrow();
    expect(existsSync(join(fora, "resolucoes", `${ID}.json`))).toBe(false);
  });

  it(".expx trocado por outro diretório real, levando o mesmo resolucoes, é detectado pela identidade", () => {
    const raiz = temp("expx-reg-");
    const trocar = () => {
      renameSync(join(raiz, ".expx"), join(raiz, ".expx-original"));
      mkdirSync(join(raiz, ".expx"));
      renameSync(join(raiz, ".expx-original", "resolucoes"), dirReg(raiz));
    };
    expect(() => gravarNoRegistro(raiz, resolucao, { antesDaRevalidacao: trocar })).toThrow(/\.expx foi trocado/);
  });

  it.skipIf(!POSIX)(".expx como link é recusado antes de qualquer escrita", () => {
    const raiz = temp("expx-reg-");
    const fora = temp("expx-fora-");
    symlinkSync(fora, join(raiz, ".expx"));
    expect(() => gravarNoRegistro(raiz, resolucao)).toThrow(/link simbolico/);
    expect(readdirSync(fora)).toEqual([]);
  });
});

describe("destinoDoRegistroInseguro", () => {
  it("ausente não é problema; arquivo no lugar de diretório é", () => {
    const raiz = temp("expx-reg-");
    expect(destinoDoRegistroInseguro(raiz, [ID])).toEqual([]);
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(dirReg(raiz), "x");
    expect(destinoDoRegistroInseguro(raiz, [ID]).join("\n")).toContain("diretorio");
  });
});
