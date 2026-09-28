import { describe, it, expect, afterEach } from "vitest";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { artefatosDaArvore, decidirExecutavel } from "./plano.js";
import { suportaBitExecutavel } from "../teste/fs-capacidades.js";

/**
 * O disco expressa o bit de execução? No Windows não — medido em NTFS:
 * `chmodSync` não altera `stat().mode`, que fica 0666 para qualquer modo pedido,
 * 0777 inclusive, e `cpSync` não transporta nada. Lá o defeito do DrvFs não é
 * alcançável, e a degradação é segura: sem bit expressável, `decidirExecutavel`
 * só classifica `.sh` — que é o que o Windows precisa, porque lá quem decide
 * execução é o Git Bash, pelo shebang, e não o modo do arquivo.
 *
 * A MATRIZ da decisão continua rodando em toda plataforma: ela é pura e recebe o
 * modo como número, então não depende do que o disco consegue guardar.
 */
const BIT_NO_DISCO = suportaBitExecutavel();

/**
 * Quem ganha o bit de execução, e por que o modo da origem não basta.
 *
 * A regra lia `mode & 0o111` da ORIGEM para todo arquivo que não é `.sh`. O
 * problema é de onde esse modo vem. `EXPX_SKILLS_LOCAIS` não clona: `copiarLocal`
 * usa `cpSync`, que **preserva o modo**. Numa origem hospedada em DrvFs
 * (`/mnt/c`, o caso comum de quem edita a skill no Windows e roda no WSL) todo
 * arquivo aparece 0777 — e o `cpSync` grava 0777 de verdade na cópia em ext4.
 * Daí em diante o 0777 não é mais artefato de filesystem: é o modo real do
 * arquivo que o plano vai medir.
 *
 * O efeito era `SKILL.md` e `.json` entrarem em `instalacao.executaveis`, e o
 * `doctor` exigir `git update-index --chmod=+x` para a instalação INTEIRA —
 * documentação incluída — como erro que derruba o diagnóstico.
 *
 * Nada aqui finge semântica de plataforma: 0777 é modo legítimo de ext4, e é
 * exatamente o número que o `cpSync` transporta. O mesmo vale para uma origem
 * com `SKILL.md` em 0755 por umask ou por cópia de FAT.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function temporario(prefixo = "expx-exec-"): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

function arquivo(raiz: string, rel: string, conteudo: string): void {
  const caminho = join(raiz, ...rel.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
}

/** Uma skill como ela chega de uma origem local: com o modo que a origem tinha. */
function skillDeOrigem(modo: number): string {
  const raiz = temporario("expx-exec-origem-");
  arquivo(raiz, "SKILL.md", "---\nname: sprintx\n---\n\n# SprintX\n");
  arquivo(raiz, "hooks/git-perigoso.sh", "#!/usr/bin/env bash\nexit 0\n");
  arquivo(raiz, "hooks/motor.py", "#!/usr/bin/env python3\nraise SystemExit(0)\n");
  arquivo(raiz, "assets/dados.json", '{"a":1}\n');
  arquivo(raiz, "assets/tabela.md", "# tabela\n");
  for (const rel of ["SKILL.md", "hooks/git-perigoso.sh", "hooks/motor.py", "assets/dados.json", "assets/tabela.md"]) {
    chmodSync(join(raiz, ...rel.split("/")), modo);
  }
  return raiz;
}

function executaveis(raiz: string): string[] {
  return artefatosDaArvore(raiz, ".claude/skills/sprintx", "sprintx", "skill")
    .filter((a) => a.executavel)
    .map((a) => a.destino)
    .sort();
}

describe("decidirExecutavel — o modo da origem é sinal ruidoso", () => {
  it("funcional: .sh é executável pela extensão, com bit ou sem bit", () => {
    expect(decidirExecutavel("h/x.sh", 0o100644, false)).toBe(true);
    expect(decidirExecutavel("h/x.sh", 0o100755, true)).toBe(true);
    // até sem stat nenhum: o plano grava 0755 para .sh de qualquer jeito
    expect(decidirExecutavel("h/x.sh", 0, false)).toBe(true);
  });

  it("funcional: DrvFs — 0777 em documentação NÃO faz dela executável", () => {
    expect(decidirExecutavel("s/SKILL.md", 0o100777, false)).toBe(false);
    expect(decidirExecutavel("s/dados.json", 0o100777, false)).toBe(false);
    expect(decidirExecutavel("s/tabela.md", 0o100777, false)).toBe(false);
  });

  it("funcional: executável de verdade sem .sh continua executável — bit E shebang", () => {
    expect(decidirExecutavel("h/motor.py", 0o100755, true)).toBe(true);
    expect(decidirExecutavel("h/motor", 0o100755, true)).toBe(true);
  });

  it("funcional: shebang sem bit não promove: a origem não marcou o arquivo", () => {
    expect(decidirExecutavel("h/motor.py", 0o100644, true)).toBe(false);
  });

  it("funcional: bit sem shebang não promove: é o caso que o DrvFs fabrica", () => {
    expect(decidirExecutavel("h/motor.py", 0o100755, false)).toBe(false);
  });
});

describe.skipIf(!BIT_NO_DISCO)("artefatosDaArvore — origem local com o modo de DrvFs", () => {
  it("integração: cpSync transporta o 0777 da origem para a cópia em ext4", () => {
    const origem = skillDeOrigem(0o777);
    const destino = join(temporario("expx-exec-copia-"), "copia");
    // é o que `copiarLocal` faz com EXPX_SKILLS_LOCAIS
    cpSync(origem, destino, { recursive: true });
    expect(statSync(join(destino, "SKILL.md")).mode & 0o111).not.toBe(0);
  });

  it("integração: árvore 0777 declara executável só o .sh e o que tem shebang", () => {
    expect(executaveis(skillDeOrigem(0o777))).toEqual([
      ".claude/skills/sprintx/hooks/git-perigoso.sh",
      ".claude/skills/sprintx/hooks/motor.py",
    ]);
  });

  it("integração: SKILL.md em 0755 por umask ou cópia de FAT também não entra", () => {
    expect(executaveis(skillDeOrigem(0o755))).not.toContain(".claude/skills/sprintx/SKILL.md");
  });

});

describe("artefatosDaArvore — o caso sem bit, que vale em toda plataforma", () => {
  it("integração: árvore 0644, o caso normal, declara executável só o .sh", () => {
    expect(executaveis(skillDeOrigem(0o644))).toEqual([".claude/skills/sprintx/hooks/git-perigoso.sh"]);
  });

  // No Windows este é o cenário real de QUALQUER árvore, 0777 inclusive: é a
  // degradação segura, e é o que mantém a instalação de lá funcionando — o bit
  // não é o que faz o hook rodar no Git Bash. `skipIf` e não `return`, para o
  // relatório dizer "pulado" em vez de "passou" onde ele não foi verificado.
  it.skipIf(BIT_NO_DISCO)("integração: onde o disco não expressa o bit, a degradação é só o .sh", () => {
    expect(executaveis(skillDeOrigem(0o777))).toEqual([".claude/skills/sprintx/hooks/git-perigoso.sh"]);
  });
});
