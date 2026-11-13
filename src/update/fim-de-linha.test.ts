import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { executarInit } from "../cli/init.js";
import { lerLock } from "../nucleo/lock.js";
import { BLOCO_GITATTRIBUTES, blocoDoExpx, comBlocoDoExpx } from "../nucleo/gitattributes.js";
import { hashDeBytes } from "../plugin/plano.js";
import { diagnosticar } from "../doctor/verificadores.js";
import { executarUpdate } from "./flags.js";
import { pastaDaSkill, verificarModificacaoLocal } from "./modificacao.js";

/**
 * conselhos-municipais, 0.14.6 no Windows (core.autocrlf=true): o checkout punha CRLF nos arquivos instalados, o
 * hash deixava de bater com o lock e o update recusava "modificacao local" em todas as skills. O init passa a manter
 * um bloco no .gitattributes que tira esses caminhos da conversão de fim de linha (decisão do Flávio, 2026-11-13).
 */

let p: ProjetoTemporario | undefined;
const temporarios: string[] = [];
afterEach(() => {
  p?.descartar();
  p = undefined;
  for (const r of temporarios.splice(0)) rmSync(r, { recursive: true, force: true });
});

const ENV_GIT = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };
const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, env: ENV_GIT, encoding: "utf8" });
function origens(nomes: string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const n of nomes) {
    const repo = criarRepoSkill({ nome: n, tags: ["v1.0.0"], layout: n === "runx" ? "plano" : "embutido" });
    temporarios.push(repo);
    saida[n] = pathToFileURL(repo).href;
  }
  return saida;
}
/** Todos os arquivos de uma pasta, recursivo. */
function arquivos(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).map((r) => join(dir, r)).filter((f) => statSync(f).isFile());
}

describe("o bloco do expx no .gitattributes", () => {
  it("unitário: sem arquivo, só o bloco; com regras da pessoa, elas ficam e o bloco vai ao fim; de novo, nada muda", () => {
    expect(comBlocoDoExpx(undefined)).toBe(BLOCO_GITATTRIBUTES);
    const daPessoa = "*.sh text eol=lf\n*.png binary\n";
    const um = comBlocoDoExpx(daPessoa);
    expect(um.startsWith(daPessoa)).toBe(true);
    expect(um.endsWith(BLOCO_GITATTRIBUTES)).toBe(true);
    expect(comBlocoDoExpx(um)).toBe(um);
    expect(comBlocoDoExpx("*.sh text eol=lf")).toBe(`*.sh text eol=lf\n\n${BLOCO_GITATTRIBUTES}`);
  });

  it("unitário: o bloco alterado ou antigo é trocado no lugar; o que está fora dele fica", () => {
    const linhas = BLOCO_GITATTRIBUTES.split("\n");
    const velho = [linhas[0], ".expx/** text", linhas.at(-2), ""].join("\n");
    const texto = `antes text\n${velho}depois -text\n`;
    expect(comBlocoDoExpx(texto)).toBe(`antes text\n${BLOCO_GITATTRIBUTES}depois -text\n`);
  });

  it("unitário: o bloco é lido igual de um arquivo em CRLF", () => {
    const crlf = `*.sh text\r\n${BLOCO_GITATTRIBUTES.replace(/\n/g, "\r\n")}`;
    expect(blocoDoExpx(crlf)).toBe(BLOCO_GITATTRIBUTES);
    expect(blocoDoExpx("*.sh text\n")).toBeUndefined();
  });

  it("unitário: o bloco tira da conversão as pastas que o init escreve", () => {
    for (const c of [".expx/**", ".claude/skills/**", ".claude/hooks/**", ".claude/agents/**", ".opencode/commands/**", ".opencode/plugins/**", ".codex/hooks/**"]) {
      expect(BLOCO_GITATTRIBUTES).toContain(`${c} -text\n`);
    }
  });
});

describe("init e update: o .gitattributes e o lock", () => {
  it("funcional: o init grava o bloco, guarda as regras da pessoa e trava o hash do bloco no lock; o segundo init não muda o arquivo", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    writeFileSync(join(p.raiz, ".gitattributes"), "*.sh text eol=lf\n");
    const o = origens(["sprintx"]);
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: o })).ok).toBe(true);
    const texto = readFileSync(join(p.raiz, ".gitattributes"), "utf8");
    expect(texto).toBe(`*.sh text eol=lf\n\n${BLOCO_GITATTRIBUTES}`);
    const l = lerLock(p.raiz);
    expect(l.ok && l.lock.instalacao?.gitattributes).toEqual({ hash: hashDeBytes(BLOCO_GITATTRIBUTES) });
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: o })).ok).toBe(true);
    expect(readFileSync(join(p.raiz, ".gitattributes"), "utf8")).toBe(texto);
  });

  it("integração: projeto commitado e clonado com core.autocrlf=true → os arquivos instalados chegam como o lock diz", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    git(p.raiz, "init", "-q");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx", "runx"], harness: ["claude"], origens: origens(["sprintx", "runx"]) })).ok).toBe(true);
    git(p.raiz, "add", "-A");
    git(p.raiz, "commit", "-q", "-m", "expx");
    const clone = join(mkdtempSync(join(tmpdir(), "expx-clone-crlf-")), "c");
    temporarios.push(clone);
    git(p.raiz, "-c", "core.autocrlf=true", "clone", "-q", "-c", "core.autocrlf=true", p.raiz, clone);
    for (const n of ["sprintx", "runx"]) expect(verificarModificacaoLocal(clone, n)).toMatchObject({ temModificacao: false });
    expect(arquivos(join(clone, ".expx")).filter((f) => readFileSync(f).includes("\r\n"))).toEqual([]);
  });

  it("integração: no clone com core.autocrlf=true, os artefatos fora do .expx (.claude, .opencode) também batem com o lock (Codex)", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    git(p.raiz, "init", "-q");
    const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"], hooks: ["sprintx-hook.sh"] });
    temporarios.push(repo);
    const r = await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude", "opencode"], origens: { sprintx: pathToFileURL(repo).href } });
    expect(r.ok, r.erros.join("\n")).toBe(true);
    const l = lerLock(p.raiz);
    const travados = Object.keys((l.ok && l.lock.instalacao?.arquivos) || {});
    for (const pasta of [".claude/", ".opencode/"]) expect(travados.some((f) => f.startsWith(pasta)), pasta).toBe(true);
    git(p.raiz, "add", "-A");
    git(p.raiz, "commit", "-q", "-m", "expx");
    const clone = join(mkdtempSync(join(tmpdir(), "expx-clone-crlf-")), "c");
    temporarios.push(clone);
    git(p.raiz, "-c", "core.autocrlf=true", "clone", "-q", "-c", "core.autocrlf=true", p.raiz, clone);
    const ids = diagnosticar(clone).achados.map((a) => a.id);
    expect(ids).not.toContain("artefato-alterado");
    expect(ids).not.toContain("gitattributes-sem-bloco");
    // o settings.json fica fora do bloco: é da pessoa, e o lock trava as entradas gerenciadas, não os bytes
    expect(travados.filter((f) => readFileSync(join(clone, f)).includes("\r\n"))).toEqual([]);
  });

  it("funcional: arquivo instalado que só mudou de fim de linha → o update recusa e diz que é fim de linha, com o caminho da migração", async () => {
    const sprintx = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
    temporarios.push(sprintx);
    const o = { sprintx: pathToFileURL(sprintx).href };
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: o })).ok).toBe(true);
    const skill = join(pastaDaSkill(p.raiz, "sprintx"), "SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace(/\n/g, "\r\n"));
    expect(verificarModificacaoLocal(p.raiz, "sprintx")).toMatchObject({ temModificacao: true, soFimDeLinha: true });
    writeFileSync(join(sprintx, ".claude/skills/sprintx/references/01.md"), "# v1.1.0\n");
    git(sprintx, "add", "-A");
    git(sprintx, "commit", "-q", "-m", "v1.1.0");
    git(sprintx, "tag", "v1.1.0");
    const r = await executarUpdate({ raiz: p.raiz, sim: true, origens: o });
    expect(r.ok).toBe(false);
    expect(r.bloqueadas).toEqual([{ nome: "sprintx", motivo: expect.stringContaining("so fim de linha") }]);
    expect(r.bloqueadas[0]?.motivo).toContain("git restore");
  });

  it("funcional: a modificação de conteúdo não é dada por fim de linha", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origens(["sprintx"]) })).ok).toBe(true);
    const skill = join(pastaDaSkill(p.raiz, "sprintx"), "SKILL.md");
    writeFileSync(skill, `${readFileSync(skill, "utf8").replace(/\n/g, "\r\n")}mais\r\n`);
    expect(verificarModificacaoLocal(p.raiz, "sprintx")).toMatchObject({ temModificacao: true, soFimDeLinha: false });
  });

  it("funcional: o doctor acusa o bloco que o lock declara e o .gitattributes não tem", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origens(["sprintx"]) })).ok).toBe(true);
    expect(diagnosticar(p.raiz).achados.map((a) => a.id)).not.toContain("gitattributes-sem-bloco");
    writeFileSync(join(p.raiz, ".gitattributes"), "*.sh text eol=lf\n");
    expect(diagnosticar(p.raiz).achados).toContainEqual(expect.objectContaining({ id: "gitattributes-sem-bloco", severidade: "erro" }));
    rmSync(join(p.raiz, ".gitattributes"));
    expect(diagnosticar(p.raiz).achados).toContainEqual(expect.objectContaining({ id: "gitattributes-sem-bloco", severidade: "erro" }));
  });

  it("funcional: num repositório git, o .expx/ no índice sem o bloco é aviso: o clone novo não o recebe (CodeAnt no expxdev#171)", async () => {
    p = projetoTemporario("fixtures/cli/projeto-limpo");
    git(p.raiz, "init", "-q");
    expect((await executarInit({ raiz: p.raiz, skills: ["sprintx"], harness: ["claude"], origens: origens(["sprintx"]) })).ok).toBe(true);
    const doBloco = () => diagnosticar(p!.raiz).achados.filter((a) => a.id === "gitattributes-sem-bloco");
    // logo depois do init, nada no índice: nada a cobrar
    expect(doBloco()).toEqual([]);
    git(p.raiz, "add", ".expx");
    expect(doBloco()).toEqual([expect.objectContaining({ severidade: "aviso" })]);
    git(p.raiz, "add", ".gitattributes");
    expect(doBloco()).toEqual([]);
  });
});
