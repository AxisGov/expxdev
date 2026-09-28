import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { avisoDeFilemode, modosNoIndice } from "./modo-executavel.js";
import { gitEm, novoProduto } from "../teste/candidatos.js";

/**
 * O aviso do `init`, e a promessa que ele faz.
 *
 * O aviso entrega um comando para COPIAR E COLAR, e `git update-index` é
 * atômico: um único caminho fora do índice derruba o comando inteiro, e os
 * caminhos que estavam certos também não são tocados (medido: `error: <caminho>:
 * cannot add to the index - missing --add option?` e `fatal: unable to process
 * path <caminho>`). Logo depois do primeiro
 * `init` é exatamente esse o estado — nada rastreado ainda. Um aviso que
 * prometia o comando ali ensinava a rodar algo que falha, e o segundo efeito é
 * pior que o primeiro: a pessoa conclui que o aviso está errado e o ignora.
 *
 * Por isso os dois casos são separados na mensagem: rastreado como 100644 ganha
 * o comando exato; o que ainda não está no índice ganha a instrução de adicionar
 * conscientemente e voltar pelo `expx doctor`. O ExpxDev não prepara índice.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

/** Um produto com `core.filemode=false`: o repositório que ignora o bit. */
function produto(): string {
  const p = novoProduto("expx-aviso-");
  criados.push(p);
  gitEm(p, "config", "core.filemode", "false");
  return p;
}

function arquivo(raiz: string, rel: string): void {
  const caminho = join(raiz, ...rel.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(caminho, 0o755);
}

/** O comando do aviso, exatamente como ele o escreveu (linha indentada, sozinha). */
function comandoDoAviso(aviso: string | undefined): string | undefined {
  if (aviso === undefined) return undefined;
  const m = /^ {2}(git update-index .*)$/m.exec(aviso);
  return m === null ? undefined : (m[1] as string);
}

/** Cola o comando num bash de verdade, na raiz do produto. */
function colar(raiz: string, comando: string): { status: number | null; saida: string } {
  const r = spawnSync("bash", ["-c", comando], { cwd: raiz, encoding: "utf8", timeout: 60000 });
  return { status: r.status, saida: `${r.stdout}${r.stderr}` };
}

const A = ".claude/hooks/sprintx/a.sh";
const B = ".claude/hooks/comum/b.sh";

describe("avisoDeFilemode — somente rastreados", () => {
  it("integração: o comando prometido roda e versiona os dois", () => {
    const p = produto();
    arquivo(p, A);
    arquivo(p, B);
    gitEm(p, "add", "-A");

    const aviso = avisoDeFilemode(p, [A, B]);
    expect(aviso).toContain("core.filemode=false");
    const comando = comandoDoAviso(aviso);
    expect(comando, aviso).toBeDefined();

    const r = colar(p, comando as string);
    expect(r.status, `${comando as string}\n${r.saida}`).toBe(0);

    const m = modosNoIndice(p, [A, B]);
    expect(m.get(A)).toBe("100755");
    expect(m.get(B)).toBe("100755");
    // resolvido: o aviso para de aparecer
    expect(avisoDeFilemode(p, [A, B])).toBeUndefined();
  });
});

describe("avisoDeFilemode — somente fora do índice", () => {
  it("integração: não promete comando, manda adicionar e voltar pelo doctor", () => {
    const p = produto();
    arquivo(p, A);

    const aviso = avisoDeFilemode(p, [A]);
    expect(aviso).toContain("core.filemode=false");
    expect(aviso).toContain(A);
    expect(aviso).toContain("expx doctor");
    // nenhum comando copiável, porque este comando falharia
    expect(comandoDoAviso(aviso)).toBeUndefined();
    expect(aviso).not.toContain("update-index --chmod=+x --");
    // e nunca a saída fácil de mandar o próprio update-index adicionar
    expect(aviso).not.toContain("--add");

    // a prova de que o comando falharia: o git recusa caminho fora do índice
    const r = colar(p, `git update-index --chmod=+x -- ${A}`);
    expect(r.status).not.toBe(0);
    expect(r.saida).toContain("cannot add to the index");
    expect(r.saida).toContain("fatal: Unable to process path");
    // e o ExpxDev não preparou índice nenhum: o caminho continua fora
    expect(modosNoIndice(p, [A]).size).toBe(0);
  });
});

describe("avisoDeFilemode — misto", () => {
  it("integração: o comando cobre só o rastreado, roda, e o resto vira instrução", () => {
    const p = produto();
    arquivo(p, A);
    arquivo(p, B);
    gitEm(p, "add", "--", A);

    const aviso = avisoDeFilemode(p, [A, B]);
    const comando = comandoDoAviso(aviso);
    expect(comando, aviso).toBeDefined();
    expect(comando).toContain(A);
    expect(comando).not.toContain(B);
    // o que está fora do índice aparece como instrução, com o caminho nomeado
    expect(aviso).toContain(B);
    expect(aviso).toContain("expx doctor");

    const r = colar(p, comando as string);
    expect(r.status, `${comando as string}\n${r.saida}`).toBe(0);
    expect(modosNoIndice(p, [A]).get(A)).toBe("100755");
    expect(modosNoIndice(p, [B]).size).toBe(0);

    // resolvido o rastreado, o aviso continua — por causa do que falta adicionar
    const resto = avisoDeFilemode(p, [A, B]);
    expect(resto).toContain(B);
    expect(comandoDoAviso(resto)).toBeUndefined();
  });

  it("integração: em conflito de merge o caminho não ganha comando prometido", () => {
    const p = produto();
    arquivo(p, A);
    gitEm(p, "add", "-A");
    gitEm(p, "commit", "-q", "-m", "base");
    gitEm(p, "checkout", "-q", "-b", "outro");
    writeFileSync(join(p, ...A.split("/")), "#!/usr/bin/env bash\necho outro\n");
    gitEm(p, "commit", "-q", "-a", "-m", "outro");
    gitEm(p, "checkout", "-q", "main");
    writeFileSync(join(p, ...A.split("/")), "#!/usr/bin/env bash\necho main\n");
    gitEm(p, "commit", "-q", "-a", "-m", "main");
    try {
      gitEm(p, "merge", "--no-edit", "outro");
      throw new Error("o merge precisava conflitar");
    } catch {
      // conflito: é o estado que o teste quer
    }

    const aviso = avisoDeFilemode(p, [A]);
    expect(comandoDoAviso(aviso)).toBeUndefined();
    expect(aviso).toContain(A);
  });
});
