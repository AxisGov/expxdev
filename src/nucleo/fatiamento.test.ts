import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";

interface PerfilCli {
  excluidos: { nomes: string[]; extensoes: string[]; sufixos: string[] };
}
interface Limites {
  EXCLUIDOS_DO_NUCLEO: readonly string[];
  limites(): { l2_linhas: number; l2_bytes: number; l3_arquivos: number };
  perfilCli(versao: string): PerfilCli | undefined;
  revisavel(caminho: string, perfil: PerfilCli): boolean;
  medir(conteudo: Buffer): { linhas: number; bytes: number };
}

const BASH = bashDosHooks();
const SCRIPT = join(RAIZ_DO_REPO, "scripts", "verificar-fatiamento.sh");
const MODULO = (await import(pathToFileURL(join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-limites.mjs")).href)) as Limites;
const PERFIL = MODULO.perfilCli("0.5.14")!;
const criados: string[] = [];

afterEach(() => {
  for (const caminho of criados.splice(0)) rmSync(caminho, { recursive: true, force: true });
});

function git(diretorio: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd: diretorio, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function repo(): string {
  const diretorio = mkdtempSync(join(tmpdir(), "expx-fatia-"));
  criados.push(diretorio);
  git(diretorio, "init", "-q", "-b", "main");
  escreve(diretorio, "base.txt", "base\n");
  commita(diretorio, "base");
  return diretorio;
}

function escreve(diretorio: string, relativo: string, conteudo: string | Buffer): void {
  mkdirSync(dirname(join(diretorio, relativo)), { recursive: true });
  writeFileSync(join(diretorio, relativo), conteudo);
}

function commita(diretorio: string, mensagem: string): void {
  git(diretorio, "add", "-A");
  git(diretorio, "commit", "-q", "-m", mensagem);
}

function ambiente(livres: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const nome of Object.keys(env)) if (nome.startsWith("FATIA_")) delete env[nome];
  return { ...env, ...livres };
}

function verifica(diretorio: string, op: { excluir?: string[]; env?: Record<string, string> } = {}) {
  const args = (op.excluir ?? []).flatMap((padrao) => ["--excluir-da-revisao", padrao]);
  const r = spawnSync(BASH, [SCRIPT, ...args, "main", "HEAD"], { cwd: diretorio, encoding: "utf8", env: ambiente(op.env) });
  return { codigo: r.status, saida: `${r.stdout}${r.stderr}` };
}

const semQuebra = (n: number): string => Array.from({ length: n }, (_, i) => `linha ${i + 1}`).join("\n");
const blob = (d: string, conteudo: string | Buffer): string => {
  const r = spawnSync("git", ["hash-object", "-w", "--stdin"], { cwd: d, input: conteudo, encoding: typeof conteudo === "string" ? "utf8" : undefined });
  if (r.status !== 0) throw new Error(String(r.stderr));
  return String(r.stdout).trim();
};

function commitDeArvore(d: string, entradas: Array<[string, string]>, mensagem: string): void {
  const base = git(d, "rev-parse", "HEAD:base.txt");
  const todas: Array<[string, string]> = [["base.txt", base], ...entradas].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const dados = todas.map(([nome, sha]) => `100644 blob ${sha}\t${nome}\0`).join("");
  const arvore = spawnSync("git", ["mktree", "-z"], { cwd: d, input: dados, encoding: "utf8" }).stdout.trim();
  const commit = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit-tree", arvore, "-p", "HEAD", "-m", mensagem],
    { cwd: d, encoding: "utf8" }).stdout.trim();
  git(d, "update-ref", "refs/heads/feature", commit);
}

describe("verificar-fatiamento.sh — limites fixos L2 e L3", () => {
  it("L3: 100 arquivos passam e 101 reprovam, sem qualquer desconto", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    for (let i = 0; i < 97; i++) escreve(d, `src/f${i}.png`, "x\n");
    escreve(d, "package-lock.json", "{}\n");
    escreve(d, "docs/entregas/e.md", "x\n");
    escreve(d, "fixtures/candidatos/c.md", "x\n");
    commita(d, "cem");
    expect(verifica(d)).toMatchObject({ codigo: 0, saida: expect.stringContaining("PR com 100 arquivo(s)") });
    escreve(d, "logo.png", "x");
    commita(d, "cento e um");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(1);
    expect(r.saida).toContain("VIOLACAO L3: a PR altera 101 arquivos, todos contados (limite 100 do app do CodeAnt); divida a PR");
  });

  it("L3: uma renomeacao conta um arquivo", () => {
    const d = repo();
    escreve(d, "antes.md", "x\n");
    commita(d, "arquivo");
    git(d, "switch", "-q", "-c", "feature");
    git(d, "mv", "antes.md", "depois.md");
    commita(d, "renomeia");
    expect(verifica(d)).toMatchObject({ codigo: 0, saida: expect.stringContaining("PR com 1 arquivo(s)") });
  });

  it("nao limita linhas da PR nem do commit", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "a.md", semQuebra(2000));
    commita(d, "duas mil");
    for (const nome of ["b", "c", "d", "e"]) escreve(d, `${nome}.md`, semQuebra(250));
    commita(d, "mais mil");
    expect(verifica(d).codigo).toBe(0);
  });

  it("L2: usa split por quebra nas bordas de 5.000 linhas", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "passa.txt", semQuebra(5000));
    escreve(d, "quebra-final.txt", `${semQuebra(5000)}\n`);
    escreve(d, "cinco-mil-e-uma.txt", semQuebra(5001));
    commita(d, "bordas de linhas");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).not.toMatch(/VIOLACAO L2: passa\.txt/);
    expect(r.saida).toMatch(/VIOLACAO L2: quebra-final\.txt tem 5001 linhas/);
    expect(r.saida).toMatch(/VIOLACAO L2: cinco-mil-e-uma\.txt tem 5001 linhas/);
  });

  it("L2: 204.800 bytes passam e 204.801 reprovam", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "passa.txt", "x".repeat(204800));
    escreve(d, "reprova.txt", "x".repeat(204801));
    commita(d, "bordas de bytes");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).not.toMatch(/VIOLACAO L2: passa\.txt/);
    expect(r.saida).toMatch(/VIOLACAO L2: reprova\.txt tem 1 linhas e 204801 bytes/);
  });

  it("L2: mede o maior entre blob e checkout CRLF somente quando representam o mesmo blob", () => {
    const d = repo();
    git(d, "config", "core.autocrlf", "true");
    git(d, "switch", "-q", "-c", "feature");
    escreve(d, "crlf.txt", `${"x".repeat(203)}\n`.repeat(1000));
    commita(d, "arquivo LF no blob");
    rmSync(join(d, "crlf.txt"));
    git(d, "checkout", "--", "crlf.txt");
    expect(statSync(join(d, "crlf.txt")).size).toBeGreaterThan(204800);
    expect(verifica(d).saida).toMatch(/VIOLACAO L2: crlf\.txt .* 205000 bytes/);
    escreve(d, "crlf.txt", `${readFileSync(join(d, "crlf.txt"), "utf8")}alterado`);
    expect(verifica(d).codigo).toBe(0);
  });

  it("L2: UTF-8 invalido e medido depois da decodificacao da CLI", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    const grande = Buffer.concat([Buffer.alloc(68000, 0xff), Buffer.alloc(2000, 0x61)]);
    const pequeno = Buffer.concat([Buffer.from([0xff]), Buffer.alloc(999, 0x61)]);
    escreve(d, "grande.dat", grande);
    escreve(d, "pequeno.dat", pequeno);
    commita(d, "utf8 invalido");
    const r = verifica(d);
    expect(r.codigo, r.saida).toBe(1);
    expect(r.saida).toContain(`VIOLACAO L2: grande.dat tem ${MODULO.medir(grande).linhas} linhas e ${MODULO.medir(grande).bytes} bytes`);
    expect(r.saida).not.toMatch(/VIOLACAO L2: pequeno\.dat/);
  });

  it("L2 exclui o perfil, o nucleo e o argumento; inclui Markdown e extensao desconhecida", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    const grande = "x".repeat(204801);
    for (const nome of ["package-lock.json", "logo.png", "manual.pdf", "app.min.js", "docs/sprintx/x.md", "gerado/x.js",
      "notas.md", "dados.bin2"]) escreve(d, nome, grande);
    commita(d, "predicado");
    const r = verifica(d, { excluir: ["^gerado/"] });
    expect(r.codigo).toBe(1);
    const violacoes = [...r.saida.matchAll(/VIOLACAO L2: ([^ ]+)/g)].map((m) => m[1]).sort();
    expect(violacoes).toEqual(["dados.bin2", "notas.md"]);
  });

  it("L2 ignora apagado e mede renomeado no caminho novo", () => {
    const d = repo();
    escreve(d, "apagado.md", "x".repeat(204801));
    escreve(d, "antes.md", "x".repeat(204801));
    commita(d, "grandes");
    git(d, "switch", "-q", "-c", "feature");
    rmSync(join(d, "apagado.md"));
    git(d, "mv", "antes.md", "depois.md");
    commita(d, "apaga e renomeia");
    const r = verifica(d);
    expect(r.saida).toMatch(/VIOLACAO L2: depois\.md/);
    expect(r.saida).not.toContain("apagado.md tem");
  });

  it.each(["^gerado", "(a|b)/"])("padrao fora da gramatica (%s) sai 2", (padrao) => {
    const d = repo();
    expect(verifica(d, { excluir: [padrao] }).codigo).toBe(2);
  });

  it("aceita ponto escapado em pasta literal", () => {
    const d = repo();
    expect(verifica(d, { excluir: ["^a\\.b/"] }).codigo).toBe(0);
  });

  it("qualquer FATIA_* sai 2 com a mensagem reservada", () => {
    const d = repo();
    const r = verifica(d, { env: { FATIA_MAX_LINHAS_PR: "1" } });
    expect(r.codigo).toBe(2);
    expect(r.saida).toContain("`FATIA_MAX_LINHAS_PR` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente");
  });

  it("as constantes do Bash sao as dos perfis validados", () => {
    const script = readFileSync(SCRIPT, "utf8");
    const fixos = MODULO.limites();
    expect(script).toContain(`MAX_ARQUIVOS_PR=${fixos.l3_arquivos}\n`);
    expect(script).toContain(`MAX_LINHAS=${fixos.l2_linhas}\n`);
    expect(script).toContain(`MAX_BYTES=${fixos.l2_bytes}\n`);
    const lista = (nome: string): string[] => new RegExp(`^${nome}=\\(([^\\n]*)\\)$`, "m").exec(script)![1].split(" ");
    expect(lista("NOMES_EXCLUIDOS")).toEqual(PERFIL.excluidos.nomes);
    expect(lista("EXTENSOES_EXCLUIDAS")).toEqual(PERFIL.excluidos.extensoes);
    expect(lista("SUFIXOS_EXCLUIDOS")).toEqual(PERFIL.excluidos.sufixos);
    expect(lista("EXCLUIDOS_DO_NUCLEO")).toEqual(MODULO.EXCLUIDOS_DO_NUCLEO.map((p) => p.slice(1)));
  });

  it("o predicado do Bash coincide com o modulo", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    const nomes = ["a.PNG", ".png", "..png", "a.", "x.min.js", "x.MIN.JS", "a.tar.gz", "Thumbs.db", "go.sum", "notas.md"];
    const sha = blob(d, "x".repeat(204801));
    commitDeArvore(d, nomes.map((nome) => [nome, sha]), "tabela do predicado");
    const r = verifica(d);
    const medidos = new Set([...r.saida.matchAll(/VIOLACAO L2: ([^ ]+)/g)].map((x) => x[1]));
    expect([...medidos].sort()).toEqual(nomes.filter((nome) => MODULO.revisavel(nome, PERFIL)).sort());
  });

  it("submodulo nao e medido e mudanca de tipo para arquivo e", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    git(d, "update-index", "--add", "--cacheinfo", `160000,${"a".repeat(40)},vendor/lib`);
    git(d, "commit", "-q", "-m", "submodulo");
    expect(verifica(d).codigo).toBe(0);
    const link = blob(d, "alvo");
    git(d, "update-index", "--add", "--cacheinfo", `120000,${link},grande.md`);
    git(d, "commit", "-q", "-m", "link");
    git(d, "branch", "-f", "main", "HEAD");
    const grande = blob(d, "x".repeat(204801));
    git(d, "update-index", "--cacheinfo", `100644,${grande},grande.md`);
    git(d, "commit", "-q", "-m", "arquivo");
    expect(verifica(d).saida).toMatch(/VIOLACAO L2: grande\.md/);
  });

  it("nome com quebra e metacaractere de pathspec permanecem caminhos literais", () => {
    const d = repo();
    git(d, "switch", "-q", "-c", "feature");
    const pequeno = blob(d, "x\n"), grande = blob(d, "x".repeat(204801));
    commitDeArvore(d, [["linha\nquebrada.md", pequeno], ["g?.md", grande]], "nomes especiais");
    const r = verifica(d);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain("g?.md");
    expect(r.saida).not.toContain("nao foi possivel");
  });

  it("falha do git e uso incorreto saem 2", () => {
    expect(spawnSync(BASH, [SCRIPT], { encoding: "utf8", env: ambiente() }).status).toBe(2);
    const d = repo();
    const real = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    const bin = join(d, ".bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), `#!/usr/bin/env bash\nfor x in "$@"; do [ "$x" = "--name-only" ] && exit 128; done\nexec "${real}" "$@"\n`, { mode: 0o755 });
    const r = spawnSync(BASH, ["-c", 'PATH="$(cd "$1" && pwd):$PATH" exec bash "$2" main HEAD', "_", bin, SCRIPT],
      { cwd: d, encoding: "utf8", env: ambiente() });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(2);
  });
});
