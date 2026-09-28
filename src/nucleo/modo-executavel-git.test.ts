import { describe, it, expect, afterEach } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { modosNoHead, modosNoIndice } from "./modo-executavel.js";
import { gitEm, novoProduto } from "../teste/candidatos.js";
import { suportaNomeComCaractereReservado } from "../teste/fs-capacidades.js";

/**
 * O disco aceita `*`, `?` e `:` no nome? No Windows não — medido: `ENOENT`. O
 * `[`, que é classe de caractere no pathspec do git e no shell, ele aceita, e é
 * por ele que a literalidade do pathspec continua certificada lá.
 */
const NOMES_LIVRES = suportaNomeComCaractereReservado();

/**
 * A consulta ao git, contra o git de verdade.
 *
 * Três coisas que só aparecem aqui, e nunca com sonda injetada:
 *
 * - **pathspec**: os destinos do lock são nomes de arquivo, não padrões. Se o
 *   git os interpretar como glob ou como magia de pathspec, um nome com `*`,
 *   `?`, `[` ou `:` devolve o modo de OUTRO arquivo — ou faz o git recusar a
 *   consulta inteira, e aí o modo errado passa como "não rastreado".
 * - **estágios de merge**: durante um conflito o índice não tem estágio 0, e
 *   traz 1/2/3. Ler o modo de um estágio de conflito é ler um modo que o
 *   próximo commit pode não gravar.
 * - **índice x `HEAD`**: `update-index` e commit são dois passos, e só o
 *   segundo chega a quem clona. Entre eles o índice diz 100755 e o `HEAD` ainda
 *   diz 100644.
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
  it.skipIf(!NOMES_LIVRES)("funcional: nome com * devolve só ele, e nunca o que o glob alcançaria", () => {
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

  it.skipIf(!NOMES_LIVRES)("funcional: nome com ? não arrasta o vizinho de um caractere", () => {
    const p = produto();
    arquivo(p, "h/qa.sh");
    arquivo(p, "h/q?.sh");
    gitEm(p, "add", "-A");

    expect([...modosNoIndice(p, ["h/q?.sh"]).keys()]).toEqual(["h/q?.sh"]);
  });

  // Este é o caso portável: o `[` é aceito no disco em toda plataforma, e sem
  // `--literal-pathspecs` ele viraria classe de caractere. É ele que mantém a
  // literalidade do pathspec certificada no Windows.
  it("funcional: nome com [ ] não vira classe de caractere", () => {
    const p = produto();
    arquivo(p, "h/ab.sh");
    arquivo(p, "h/a[b].sh");
    gitEm(p, "add", "-A");

    expect([...modosNoIndice(p, ["h/a[b].sh"]).keys()]).toEqual(["h/a[b].sh"]);
  });

  it.skipIf(!NOMES_LIVRES)("funcional: nome iniciado por : não é lido como magia de pathspec", () => {
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

describe("modosNoHead — o que está COMMITADO", () => {
  /** O modo do HEAD por caminho literal, com o vizinho que o padrão alcançaria. */
  function headLiteral(comPadrao: string, vizinho: string): void {
    const p = produto();
    arquivo(p, comPadrao);
    arquivo(p, vizinho, 0o644);
    gitEm(p, "add", "-A");
    gitEm(p, "update-index", "--chmod=+x", "--", comPadrao);
    gitEm(p, "commit", "-q", "-m", "base");

    const r = modosNoHead(p, [comPadrao, vizinho]);
    expect(r.tipo).toBe("modos");
    if (r.tipo !== "modos") return;
    expect([...r.modos.keys()].sort()).toEqual([comPadrao, vizinho].sort());
    expect(r.modos.get(comPadrao), comPadrao).toBe("100755");
    expect(r.modos.get(vizinho), vizinho).toBe("100644");
  }

  it("funcional: o modo do HEAD é lido, e o pathspec continua literal", () => {
    headLiteral("h/x[1].sh", "h/x1.sh");
  });

  it.skipIf(!NOMES_LIVRES)("funcional: o mesmo com glob, onde o disco aceita * no nome", () => {
    headLiteral("h/x*.sh", "h/x.sh");
  });

  it("funcional: o update-index sem commit muda o índice e NÃO o HEAD", () => {
    const p = produto();
    gitEm(p, "config", "core.filemode", "false");
    arquivo(p, "h/a.sh");
    gitEm(p, "add", "-A");
    gitEm(p, "commit", "-q", "-m", "instala");
    expect(modosNoIndice(p, ["h/a.sh"]).get("h/a.sh")).toBe("100644");

    gitEm(p, "update-index", "--chmod=+x", "--", "h/a.sh");
    expect(modosNoIndice(p, ["h/a.sh"]).get("h/a.sh")).toBe("100755");

    const antes = modosNoHead(p, ["h/a.sh"]);
    expect(antes.tipo === "modos" && antes.modos.get("h/a.sh")).toBe("100644");

    gitEm(p, "commit", "-q", "-m", "versiona o modo");
    const depois = modosNoHead(p, ["h/a.sh"]);
    expect(depois.tipo === "modos" && depois.modos.get("h/a.sh")).toBe("100755");
  });

  it("funcional: caminho rastreado e nunca commitado não aparece no HEAD", () => {
    const p = produto();
    arquivo(p, "h/a.sh");
    gitEm(p, "add", "-A");

    const r = modosNoHead(p, ["h/a.sh"]);
    expect(r.tipo).toBe("modos");
    if (r.tipo !== "modos") return;
    expect(r.modos.has("h/a.sh")).toBe(false);
  });

  it("funcional: repositório sem nenhum commit é sem-head, não erro", () => {
    const p = mkdtempSync(join(tmpdir(), "expx-sem-head-"));
    criados.push(p);
    gitEm(p, "init", "-q", "-b", "main");
    arquivo(p, "h/a.sh");
    gitEm(p, "add", "-A");

    expect(modosNoHead(p, ["h/a.sh"]).tipo).toBe("sem-head");
  });

  it("funcional: pasta que não é repositório é indisponível, e não lança", () => {
    const p = mkdtempSync(join(tmpdir(), "expx-sem-git-"));
    criados.push(p);
    arquivo(p, "h/a.sh");

    const r = modosNoHead(p, ["h/a.sh"]);
    expect(r.tipo).toBe("indisponivel");
  });

  it("funcional: sem caminho nenhum, nem chama o git", () => {
    const r = modosNoHead("/caminho/que/nao/existe", []);
    expect(r.tipo).toBe("modos");
  });
});
