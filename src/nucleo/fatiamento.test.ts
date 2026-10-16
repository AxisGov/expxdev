import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { bashDosHooks } from "../teste/candidatos.js";

/**
 * `scripts/verificar-fatiamento.sh` (CONTRATO-expx-fatiamento.md): cada regra
 * tem um caso que a reprova e um que a deixa passar. Sem estes, "a guarda
 * existe" seria afirmação sem prova.
 */

// o bash do Git, nunca o primeiro do PATH: no Windows ele pode ser o do WSL
const BASH = bashDosHooks();
const SCRIPT = join(process.cwd(), "scripts", "verificar-fatiamento.sh");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-fatia-"));
  criados.push(d);
  git(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, "base.txt"), "base\n");
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", "base");
  return d;
}

function escreve(d: string, rel: string, conteudo: string): void {
  mkdirSync(dirname(join(d, rel)), { recursive: true });
  writeFileSync(join(d, rel), conteudo);
}

function commita(d: string, msg: string): void {
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", msg);
}

const linhas = (n: number, prefixo = "linha"): string => Array.from({ length: n }, (_, i) => `${prefixo} ${String(i)}\n`).join("");

function verifica(d: string, env: Record<string, string> = {}) {
  const r = spawnSync(BASH, [SCRIPT, "main", "HEAD"], { cwd: d, encoding: "utf8", env: { ...process.env, ...env } });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

describe("verificar-fatiamento.sh", () => {
  it("funcional: PR pequena e de um assunto passa", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "a.md", linhas(50));
    commita(d, "feat: a");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toContain("0 violacao");
  });

  it("funcional: F2 — PR acima de 400 linhas reprova, mesmo com commits pequenos", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    for (let i = 0; i < 3; i++) {
      escreve(d, `f${String(i)}.md`, linhas(200));
      commita(d, `feat: parte ${String(i)}`);
    }
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F2: a PR altera 600 linhas/);
    expect(r.saida).not.toContain("F3");
  });

  it("funcional: F2 — mais de 20 arquivos reprova", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    for (let i = 0; i < 21; i++) escreve(d, `p/${String(i)}.md`, "x\n");
    commita(d, "feat: muitos");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F2: a PR altera 21 arquivos/);
  });

  it("funcional: F3 — um commit acima de 300 linhas reprova e nomeia o commit", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "grande.md", linhas(350));
    commita(d, "feat: commit grande");
    const r = verifica(d, { FATIA_MAX_LINHAS_PR: "1000" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F3: o commit [0-9a-f]+ altera 350 linhas/);
    expect(r.saida).toContain("feat: commit grande");
  });

  it("funcional: arquivo gerado (FATIA_IGNORAR) não conta para F2 nem F3", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "fixtures/candidatos/x/gerado.txt", linhas(900));
    escreve(d, "src.md", linhas(10));
    commita(d, "chore: snapshot e uso");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
  });

  it("funcional: F4 — arquivo acima de 150 KB reprova ao crescer além da tolerância", () => {
    const d = repo();
    escreve(d, "enorme.md", "x".repeat(160 * 1024) + "\n");
    commita(d, "chore: arquivo grande ja existente");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    escreve(d, "enorme.md", "x".repeat(160 * 1024) + "\n" + linhas(400, "novo-conteudo-longo"));
    commita(d, "feat: engorda");
    const r = verifica(d, { FATIA_MAX_LINHAS_PR: "1000" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F4: os arquivos acima do limite cresceram \d+ bytes/);
    expect(r.saida).toContain("enorme.md");
  });

  it("funcional: F4 — arquivo acima do limite que NÃO cresce só avisa", () => {
    const d = repo();
    escreve(d, "enorme.md", "x".repeat(160 * 1024) + "\n");
    commita(d, "chore: arquivo grande ja existente");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    escreve(d, "enorme.md", "y".repeat(160 * 1024) + "\n");
    commita(d, "fix: troca conteudo sem crescer");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toMatch(/aviso\s+F4: enorme\.md tem 1\d\d KB .*acima do limite/);
  });

  it("funcional: F4 — arquivo novo acima do limite reprova", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "novo-enorme.md", "z".repeat(170 * 1024) + "\n");
    commita(d, "feat: arquivo novo enorme");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F4: os arquivos acima do limite cresceram.*novo-enorme\.md/);
  });

  it("funcional: F4 — entre 100 e 150 KB só avisa", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "medio.md", "m".repeat(120 * 1024) + "\n");
    commita(d, "feat: arquivo medio");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toMatch(/aviso\s+F4: medio\.md tem 12[01] KB .*perto do limite/);
  });

  it("funcional: F4 — arquivo com mais de 4000 linhas reprova ao crescer, mesmo pequeno em KB", () => {
    const d = repo();
    escreve(d, "longo.txt", "a\n".repeat(4100));
    commita(d, "chore: arquivo longo ja existente");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    escreve(d, "longo.txt", "a\n".repeat(4100) + "b\n".repeat(60));
    commita(d, "feat: engorda em linhas");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F4: os arquivos acima do limite cresceram \d+ bytes e 60 linhas.*longo\.txt/);
  });

  it("funcional: F4 — entre 3000 e 4000 linhas só avisa", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "medio.txt", "a\n".repeat(3500));
    commita(d, "feat: arquivo medio em linhas");
    const r = verifica(d, { FATIA_MAX_LINHAS_PR: "5000", FATIA_MAX_LINHAS_COMMIT: "5000" });
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toMatch(/aviso\s+F4: medio\.txt tem \d+ KB e 3500 linhas, perto do limite/);
  });

  it("funcional: F4 — a última linha sem quebra conta (4.001 linhas, não 4.000)", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "sem-quebra.txt", "a\n".repeat(4000) + "b");
    commita(d, "feat: arquivo sem quebra no fim");
    const r = verifica(d, { FATIA_MAX_LINHAS_PR: "9000", FATIA_MAX_LINHAS_COMMIT: "9000" });
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/cresceram \d+ bytes e 4001 linhas.*sem-quebra\.txt/);
  });

  it("funcional: snapshot gerado acima do limite que cresce não viola F4 (fora da revisão)", () => {
    const d = repo();
    escreve(d, "fixtures/candidatos/x/DECISOES.md", "x".repeat(160 * 1024) + "\n");
    commita(d, "chore: snapshot grande ja existente");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    escreve(d, "fixtures/candidatos/x/DECISOES.md", "x".repeat(190 * 1024) + "\n");
    commita(d, "chore: snapshot regenerado");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).not.toContain("DECISOES.md");
  });

  it("funcional: arquivo gerado em caminho com espaço também não conta (FATIA_IGNORAR)", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "fixtures/candidatos/pasta com espaco/gerado.txt", linhas(900));
    escreve(d, "src.md", linhas(10));
    commita(d, "chore: snapshot em pasta com espaco");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toContain("PR com 10 linhas em 1 arquivo");
  });

  it("funcional: F4 — arquivo grande só renomeado não conta como crescimento", () => {
    const d = repo();
    escreve(d, "enorme.md", "x".repeat(160 * 1024) + "\n");
    commita(d, "chore: arquivo grande ja existente");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    git(d, "mv", "enorme.md", "movido.md");
    commita(d, "refactor: so renomeia");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toMatch(/aviso\s+F4: movido\.md/);
  });

  it("funcional: F4 — a tolerância é por PR, somada entre os arquivos acima do limite", () => {
    const d = repo();
    escreve(d, "a.md", "x".repeat(160 * 1024) + "\n");
    escreve(d, "b.md", "y".repeat(160 * 1024) + "\n");
    commita(d, "chore: dois arquivos grandes ja existentes");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "branch", "-f", "main", "HEAD");
    escreve(d, "a.md", "x".repeat(160 * 1024) + "\n" + "n".repeat(1500) + "\n");
    escreve(d, "b.md", "y".repeat(160 * 1024) + "\n" + "n".repeat(1500) + "\n");
    commita(d, "feat: cada um cresce menos que a tolerancia, juntos passam");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/F4: os arquivos acima do limite cresceram 3\d\d\d bytes/);
  });

  it("funcional: F4 — um byte acima de 150 KiB já é acima do limite", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "no-limite.md", "x".repeat(150 * 1024 - 1) + "\n");
    escreve(d, "um-acima.md", "x".repeat(150 * 1024) + "\n");
    commita(d, "feat: exatamente no limite e um byte acima");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toMatch(/aviso\s+F4: no-limite\.md .*perto do limite/);
    expect(r.saida).toMatch(/F4: os arquivos acima do limite cresceram.*um-acima\.md/);
    expect(r.saida).not.toMatch(/cresceram.*no-limite\.md/);
  });

  it("funcional: F6 — a exceção declarada rebaixa F2 e F3 a aviso e imprime o motivo", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "movido.md", linhas(500));
    commita(d, "refactor: move arquivo");
    const r = verifica(d, { FATIA_EXCECAO: "movimento mecanico, sem alterar conteudo" });
    expect(r.codigo, r.saida).toBe(0);
    expect(r.saida).toContain("excecao declarada: movimento mecanico");
  });

  it("funcional: a exceção não vale para F4", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "novo-enorme.md", "z".repeat(170 * 1024) + "\n");
    commita(d, "feat: arquivo novo enorme");
    const r = verifica(d, { FATIA_EXCECAO: "tentando passar" });
    expect(r.codigo).toBe(1);
  });

  // PR com merge de um lado (lado: s1 → s2): base para os casos de medida impossível
  function comMerge(): { d: string; s1: string } {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "b.md", "b\n");
    commita(d, "feat: b");
    git(d, "switch", "-q", "-c", "lado", "main");
    escreve(d, "s.md", "s1\n");
    commita(d, "feat: s1");
    const s1 = spawnSync("git", ["rev-parse", "HEAD"], { cwd: d, encoding: "utf8" }).stdout.trim();
    escreve(d, "s.md", "s1\ns2\n");
    commita(d, "feat: s2");
    git(d, "switch", "-q", "feature");
    git(d, "merge", "-q", "--no-edit", "lado");
    return { d, s1 };
  }

  for (const alvo of ["rev-list", "--name-status"]) {
    it(`funcional: git que falha ao listar (${alvo}) sai com 2, nunca confere lista vazia`, () => {
      const { d } = comMerge();
      const real = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
      const bin = join(d, ".bin");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "git"),
        `#!/usr/bin/env bash\nfor x in "$@"; do [ "$x" = "${alvo}" ] && exit 128; done\nexec "${real}" "$@"\n`,
        { mode: 0o755 },
      );
      // o caminho entra no PATH como o bash o vê (`pwd`): no Git Bash, `C:/...` traria um `:`
      const r = spawnSync(BASH, ["-c", 'PATH="$(cd "$1" && pwd):$PATH" exec bash "$2" main HEAD', "_", bin, SCRIPT], {
        cwd: d,
        encoding: "utf8",
      });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
    });
  }

  it("funcional: commit na fronteira de clone raso sai com 2, nunca é medido como raiz", () => {
    const { d, s1 } = comMerge();
    expect(verifica(d).codigo).toBe(0);
    writeFileSync(join(d, ".git", "shallow"), `${s1}\n`);
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(2);
    expect(r.saida).toContain("fronteira de um clone raso");
  });

  it("funcional: fronteira rasa num GIT_SHALLOW_FILE externo também sai com 2", () => {
    const { d, s1 } = comMerge();
    const fora = join(d, "..", `${d.split(/[\\/]/).pop() ?? "x"}.shallow`);
    criados.push(fora);
    writeFileSync(fora, `${s1}\n`);
    const r = verifica(d, { GIT_SHALLOW_FILE: fora });
    expect(r.codigo, r.saida).toBe(2);
    expect(r.saida).toContain("fronteira de um clone raso");
  });

  it("funcional: F4 — link que vira arquivo de texto acima do limite (mudança de tipo) reprova", () => {
    const d = repo();
    const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: d, input: "alvo", encoding: "utf8" }).stdout.trim();
    git(d, "update-index", "--add", "--cacheinfo", `120000,${blob},grande.md`);
    git(d, "commit", "-q", "-m", "link");
    git(d, "switch", "-q", "-c", "feature");
    // pelo indice, e nao pela arvore: com core.symlinks=false (Windows) o git manteria 120000 e daria M
    const grande = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: d, input: "w".repeat(170 * 1024) + "\n", encoding: "utf8" }).stdout.trim();
    git(d, "update-index", "--cacheinfo", `100644,${grande},grande.md`);
    git(d, "commit", "-q", "-m", "feat: o link vira arquivo grande");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(1);
    expect(r.saida).toMatch(/F4: .*grande\.md/);
  });

  it("funcional: submódulo (gitlink) não é medido como arquivo", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    git(d, "update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},vendor/lib`);
    git(d, "commit", "-q", "-m", "feat: submodulo");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
  });

  it("funcional: F3 — merge que resolve conflito com mais de 300 linhas próprias reprova", () => {
    const d = repo();
    escreve(d, "c.md", "base\n");
    commita(d, "c");
    git(d, "switch", "-q", "-c", "lado");
    escreve(d, "c.md", "lado\n");
    commita(d, "lado");
    git(d, "switch", "-q", "-c", "feature", "main");
    escreve(d, "c.md", "feature\n");
    commita(d, "feature");
    spawnSync("git", ["merge", "-q", "--no-edit", "lado"], { cwd: d, encoding: "utf8" });
    escreve(d, "c.md", linhas(350, "resolucao"));
    git(d, "add", "-A");
    git(d, "-c", "core.editor=true", "commit", "-q", "--no-edit");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(1);
    expect(r.saida).toMatch(/F3: o merge \w+ resolve \d+ linhas próprias|F3: o merge \w+ resolve \d+ linhas proprias/);
  });

  it("funcional: F4 — nome de arquivo com quebra de linha é medido, não vira saída 2", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    const blob = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: d, input: "x\n", encoding: "utf8" }).stdout.trim();
    // direto nos objetos: o indice e a arvore de trabalho do Git for Windows recusam \n no caminho
    const sh = (args: string[], input?: string): string => {
      const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: d, input, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout;
    };
    const arvore = sh(["mktree", "-z"], `${sh(["ls-tree", "-z", "HEAD"])}100644 blob ${blob}\tlinha\nquebrada.md\0`).trim();
    const commit = sh(["commit-tree", arvore, "-p", "HEAD", "-m", "feat: nome com quebra"]).trim();
    sh(["update-ref", "refs/heads/feature", commit]);
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(0);
  });

  it("funcional: uso incorreto sai com 2", () => {
    const r = spawnSync(BASH, [SCRIPT], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});
