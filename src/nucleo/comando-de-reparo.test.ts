import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { comandoDeReparo, modosNoIndice } from "./modo-executavel.js";
import { bashDosHooks, gitEm, novoProduto } from "../teste/candidatos.js";
import { suportaNomeComCaractereReservado } from "../teste/fs-capacidades.js";

/** Os nomes reservados entram só onde o disco os aceita. */
const NOMES_LIVRES = suportaNomeComCaractereReservado();

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

/**
 * Nomes adversariais que TODA plataforma aceita em disco, gravados 0644 para o
 * índice nascer 100644.
 *
 * Medido no Windows (NTFS): espaço, `'`, `$`, `$(…)`, crase, `;`, `[`, `]` e
 * hífen inicial passam. Cada um destes é significativo no shell, então a
 * certificação funcional continua real em Windows e em POSIX.
 */
const ADVERSARIAIS = [
  "h/com espaco.sh",
  "h/ap'ostrofo.sh",
  "h/$HOME.sh",
  "h/$(touch payload-cmd).sh",
  "h/`touch payload-crase`.sh",
  "h/a;touch payload-pv.sh",
  "h/classe[1].sh",
  "-hifen.sh",
];

/**
 * Nomes que o Windows recusa no disco: medido, `writeFileSync` devolve `ENOENT`
 * para `"`, `*` e newline. Eles são significativos no shell e continuam
 * certificados — em POSIX pelo teste funcional, e em TODA plataforma pela
 * citação, que é função pura e não toca no disco.
 */
const SO_POSIX = ['h/aspas"duplas.sh', "h/glob*.sh", "h/nova\nlinha.sh"];

/**
 * Vizinhos que o shell alcançaria se o caminho saísse cru, e que NÃO podem mudar
 * de modo. `classe[1].sh` tem vizinho portável (`classe1.sh`, alcançado pela
 * classe de caractere); `glob*.sh` só existe em POSIX.
 */
const VIZINHOS = ["h/classe1.sh", "h/com.sh"];
const VIZINHOS_SO_POSIX = ["h/globA.sh"];

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
    // `"` e newline entram aqui de propósito: o disco do Windows não hospeda
    // esses nomes, então é esta asserção — pura, que não toca no disco — que
    // sustenta a afirmação de `SO_POSIX` de que eles seguem cobertos em TODA
    // plataforma. Sem eles na lista, a justificativa não se verificava lá.
    const casos = [
      "h/$HOME.sh",
      "h/$(touch x).sh",
      "h/`x`.sh",
      "h/g*.sh",
      "h/a;b.sh",
      "h/n l.sh",
      "-h.sh",
      'h/aspas"duplas.sh',
      "h/nova\nlinha.sh",
    ];
    for (const c of casos) {
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
    // Os nomes reservados entram só onde o disco os aceita; o resto do cenário é
    // idêntico nas duas plataformas, e cada nome que fica é metacaractere real.
    const nomes = NOMES_LIVRES ? [...ADVERSARIAIS, ...SO_POSIX] : [...ADVERSARIAIS];
    const vizinhos = NOMES_LIVRES ? [...VIZINHOS, ...VIZINHOS_SO_POSIX] : [...VIZINHOS];
    for (const rel of [...nomes, ...vizinhos]) arquivo(p, rel, 0o644);
    gitEm(p, "add", "-A");

    const antes = indice(p);
    for (const rel of [...nomes, ...vizinhos]) expect(antes.get(rel), rel).toBe("100644");

    const comando = comandoDeReparo(nomes);
    // `bashDosHooks()` e não `"bash"`: no Windows o primeiro `bash` do PATH pode
    // ser o do WSL, e o comando é para ser colado no Git Bash — que é o shell em
    // que os hooks do projeto rodam lá.
    const r = spawnSync(bashDosHooks(), ["-c", comando], { cwd: p, encoding: "utf8", timeout: 60000 });
    expect(r.status, `${comando}\n${r.stdout}${r.stderr}`).toBe(0);

    const depois = indice(p);
    for (const rel of nomes) expect(depois.get(rel), rel).toBe("100755");
    for (const rel of vizinhos) expect(depois.get(rel), rel).toBe("100644");
    // e o índice não ganhou nem perdeu caminho
    expect([...depois.keys()].sort()).toEqual([...antes.keys()].sort());

    // nenhum payload de nome de arquivo virou comando
    for (const payload of ["payload-cmd", "payload-crase", "payload-pv.sh"]) {
      expect(existsSync(join(p, payload)), payload).toBe(false);
    }
    // a árvore de trabalho continua com os mesmos arquivos
    expect(gitEm(p, "status", "--porcelain", "--untracked-files=all").includes("??")).toBe(false);
  });

  /**
   * O caminho declarado muda de modo e o vizinho que o shell alcançaria não. Em
   * `[1]` o vizinho é alcançado pela classe de caractere, e o nome é aceito em
   * toda plataforma; em `*` é o glob, e o nome só existe em POSIX.
   */
  function reparoNaoVazaParaOVizinho(alvo: string, vizinho: string, prefixo: string): void {
    const p = novoProduto(prefixo);
    criados.push(p);
    arquivo(p, alvo, 0o644);
    arquivo(p, vizinho, 0o644);
    gitEm(p, "add", "-A");

    const r = spawnSync(bashDosHooks(), ["-c", comandoDeReparo([alvo])], { cwd: p, encoding: "utf8" });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);

    const m = modosNoIndice(p, [alvo, vizinho]);
    expect(m.get(alvo), alvo).toBe("100755");
    expect(m.get(vizinho), vizinho).toBe("100644");
  }

  it("integração: e o modo gravado é o que a consulta ao índice passa a ler", () => {
    reparoNaoVazaParaOVizinho("h/classe[1].sh", "h/classe1.sh", "expx-reparo-classe-");
  });

  it.skipIf(!NOMES_LIVRES)("integração: o mesmo com glob, onde o disco aceita * no nome", () => {
    reparoNaoVazaParaOVizinho("h/glob*.sh", "h/globA.sh", "expx-reparo-glob-");
  });
});
