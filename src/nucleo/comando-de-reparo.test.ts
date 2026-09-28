import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { comandoDeReparo, modosNoIndice } from "./modo-executavel.js";
import { gitEm, novoProduto } from "../teste/candidatos.js";

/**
 * O comando de reparo é para COPIAR E COLAR num shell.
 *
 * Isso muda a natureza do texto: ele não é descrição, é entrada de um
 * interpretador. Um caminho com espaço parte em dois argumentos; um com `$`,
 * `$(…)` ou crase é EXECUTADO pelo shell de quem colou; `;` encerra o comando e
 * começa outro; `*` e `[` são expandidos pelo shell antes de o git ver;
 * aspas e newline desalinham o resto da linha. Aqui o teste cola o comando num
 * bash de verdade e mede duas coisas: que só os modos esperados mudaram, e que
 * nenhum payload embutido em nome de arquivo executou.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

/** Nomes adversariais, todos gravados 0644 para o índice nascer 100644. */
const ADVERSARIAIS = [
  "h/com espaco.sh",
  "h/ap'ostrofo.sh",
  'h/aspas"duplas.sh',
  "h/$HOME.sh",
  "h/$(touch payload-cmd).sh",
  "h/`touch payload-crase`.sh",
  "h/glob*.sh",
  "h/a;touch payload-pv.sh",
  "h/nova\nlinha.sh",
  "-hifen.sh",
];

/** Vizinhos que o glob do shell alcançaria, e que NÃO podem mudar de modo. */
const VIZINHOS = ["h/globA.sh", "h/com.sh"];

function arquivo(raiz: string, rel: string, modo: number): void {
  const caminho = join(raiz, ...rel.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(caminho, modo);
}

/** O índice inteiro, caminho → modo, com `-z` para não depender de aspas do git. */
function indice(raiz: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of gitEm(raiz, "--literal-pathspecs", "ls-files", "--stage", "-z").split("\0")) {
    if (r === "") continue;
    const tab = r.indexOf("\t");
    m.set(r.slice(tab + 1), r.slice(0, 6));
  }
  return m;
}

describe("comandoDeReparo — citação", () => {
  it("funcional: caminho simples continua sem aspas, e o comando começa com --", () => {
    expect(comandoDeReparo([".claude/hooks/a.sh", ".claude/hooks/b.sh"])).toBe(
      "git update-index --chmod=+x -- .claude/hooks/a.sh .claude/hooks/b.sh",
    );
  });

  it("funcional: aspas simples no nome são fechadas e reabertas, nunca deixadas cruas", () => {
    expect(comandoDeReparo(["h/ap'ostrofo.sh"])).toBe(`git update-index --chmod=+x -- 'h/ap'\\''ostrofo.sh'`);
  });

  it("funcional: metacaractere de shell nunca sai cru", () => {
    for (const c of ["h/$HOME.sh", "h/$(touch x).sh", "h/`x`.sh", "h/g*.sh", "h/a;b.sh", "h/n l.sh", "-h.sh"]) {
      const cmd = comandoDeReparo([c]);
      const argumento = cmd.slice("git update-index --chmod=+x -- ".length);
      expect(argumento.startsWith("'"), `${c} saiu como ${argumento}`).toBe(true);
      expect(argumento.endsWith("'"), `${c} saiu como ${argumento}`).toBe(true);
    }
  });
});

describe("comandoDeReparo — colado num bash de verdade", () => {
  it("integração: só os caminhos declarados viram 100755, e nenhum payload executa", () => {
    const p = novoProduto("expx-reparo-");
    criados.push(p);
    for (const rel of [...ADVERSARIAIS, ...VIZINHOS]) arquivo(p, rel, 0o644);
    gitEm(p, "add", "-A");

    const antes = indice(p);
    for (const rel of [...ADVERSARIAIS, ...VIZINHOS]) expect(antes.get(rel), rel).toBe("100644");

    const comando = comandoDeReparo(ADVERSARIAIS);
    const r = spawnSync("bash", ["-c", comando], { cwd: p, encoding: "utf8", timeout: 60000 });
    expect(r.status, `${comando}\n${r.stdout}${r.stderr}`).toBe(0);

    const depois = indice(p);
    for (const rel of ADVERSARIAIS) expect(depois.get(rel), rel).toBe("100755");
    for (const rel of VIZINHOS) expect(depois.get(rel), rel).toBe("100644");
    // e o índice não ganhou nem perdeu caminho
    expect([...depois.keys()].sort()).toEqual([...antes.keys()].sort());

    // nenhum payload de nome de arquivo virou comando
    for (const payload of ["payload-cmd", "payload-crase", "payload-pv.sh"]) {
      expect(existsSync(join(p, payload)), payload).toBe(false);
    }
    // a árvore de trabalho continua com os mesmos arquivos
    expect(gitEm(p, "status", "--porcelain", "--untracked-files=all").includes("??")).toBe(false);
  });

  it("integração: e o modo gravado é o que a consulta ao índice passa a ler", () => {
    const p = novoProduto("expx-reparo-leitura-");
    criados.push(p);
    arquivo(p, "h/glob*.sh", 0o644);
    arquivo(p, "h/globA.sh", 0o644);
    gitEm(p, "add", "-A");

    const r = spawnSync("bash", ["-c", comandoDeReparo(["h/glob*.sh"])], { cwd: p, encoding: "utf8" });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);

    const m = modosNoIndice(p, ["h/glob*.sh", "h/globA.sh"]);
    expect(m.get("h/glob*.sh")).toBe("100755");
    expect(m.get("h/globA.sh")).toBe("100644");
  });
});
