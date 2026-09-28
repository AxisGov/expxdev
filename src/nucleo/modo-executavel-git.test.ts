import { describe, it, expect, afterEach } from "vitest";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { modosNoIndice } from "./modo-executavel.js";
import { gitEm, novoProduto } from "../teste/candidatos.js";

/**
 * A consulta ao git, contra o git de verdade.
 *
 * Dois defeitos que só aparecem aqui, e nunca com sonda injetada:
 *
 * - **pathspec**: os destinos do lock são nomes de arquivo, não padrões. Se o
 *   git os interpretar como glob ou como magia de pathspec, um nome com `*`,
 *   `?`, `[` ou `:` devolve o modo de OUTRO arquivo — ou faz o git recusar a
 *   consulta inteira, e aí o modo errado passa como "não rastreado".
 * - **estágios de merge**: durante um conflito o índice não tem estágio 0, e
 *   traz 1/2/3. Ler o modo de um estágio de conflito é ler um modo que o
 *   próximo commit pode não gravar.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function produto(): string {
  const p = novoProduto("expx-modo-git-");
  criados.push(p);
  return p;
}

function arquivo(raiz: string, rel: string, modo = 0o755): void {
  const caminho = join(raiz, ...rel.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(caminho, modo);
}

describe("modosNoIndice — pathspec literal", () => {
  it("funcional: nome com * devolve só ele, e nunca o que o glob alcançaria", () => {
    const p = produto();
    arquivo(p, "h/x.sh");
    arquivo(p, "h/xy.sh");
    arquivo(p, "h/x*.sh");
    gitEm(p, "add", "-A");
    gitEm(p, "update-index", "--chmod=+x", "--", "h/x*.sh");

    const m = modosNoIndice(p, ["h/x*.sh"]);
    expect([...m.keys()]).toEqual(["h/x*.sh"]);
    expect(m.get("h/x*.sh")).toBe("100755");
  });

  it("funcional: nome com ? não arrasta o vizinho de um caractere", () => {
    const p = produto();
    arquivo(p, "h/qa.sh");
    arquivo(p, "h/q?.sh");
    gitEm(p, "add", "-A");

    expect([...modosNoIndice(p, ["h/q?.sh"]).keys()]).toEqual(["h/q?.sh"]);
  });

  it("funcional: nome com [ ] não vira classe de caractere", () => {
    const p = produto();
    arquivo(p, "h/ab.sh");
    arquivo(p, "h/a[b].sh");
    gitEm(p, "add", "-A");

    expect([...modosNoIndice(p, ["h/a[b].sh"]).keys()]).toEqual(["h/a[b].sh"]);
  });

  it("funcional: nome iniciado por : não é lido como magia de pathspec", () => {
    const p = produto();
    arquivo(p, ":x.sh");
    arquivo(p, "h/n:m.sh", 0o644);
    gitEm(p, "add", "-A");
    gitEm(p, "update-index", "--chmod=+x", "--", ":x.sh");

    const m = modosNoIndice(p, [":x.sh", "h/n:m.sh"]);
    expect([...m.keys()].sort()).toEqual([":x.sh", "h/n:m.sh"]);
    expect(m.get(":x.sh")).toBe("100755");
    expect(m.get("h/n:m.sh")).toBe("100644");
  });
});

describe("modosNoIndice — estágios de merge", () => {
  it("funcional: em conflito com modos divergentes, nenhum estágio vira modo válido", () => {
    const p = produto();
    arquivo(p, "h/a.sh");
    gitEm(p, "add", "-A");
    gitEm(p, "commit", "-q", "-m", "base");

    gitEm(p, "checkout", "-q", "-b", "sem-bit");
    writeFileSync(join(p, "h", "a.sh"), "#!/usr/bin/env bash\necho sem-bit\n");
    gitEm(p, "add", "-A");
    gitEm(p, "commit", "-q", "-m", "sem bit");

    gitEm(p, "checkout", "-q", "main");
    writeFileSync(join(p, "h", "a.sh"), "#!/usr/bin/env bash\necho com-bit\n");
    gitEm(p, "add", "-A");
    gitEm(p, "update-index", "--chmod=+x", "--", "h/a.sh");
    gitEm(p, "commit", "-q", "-m", "com bit");

    let conflitou = false;
    try {
      gitEm(p, "merge", "--no-edit", "sem-bit");
    } catch {
      conflitou = true;
    }
    expect(conflitou).toBe(true);

    // o índice tem 1/2/3 e nenhum estágio 0: é o que a consulta precisa enxergar
    const estagios = gitEm(p, "ls-files", "--stage", "--", "h/a.sh")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => (l.split("\t")[0] as string).split(" ")[2]);
    expect(estagios.sort()).toEqual(["1", "2", "3"]);

    expect(modosNoIndice(p, ["h/a.sh"]).has("h/a.sh")).toBe(false);
  });
});
