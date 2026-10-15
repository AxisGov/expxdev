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

  it("funcional: uso incorreto sai com 2", () => {
    const r = spawnSync(BASH, [SCRIPT], { encoding: "utf8" });
    expect(r.status).toBe(2);
  });
});
