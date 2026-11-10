import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sugerirSessao } from "./sessao.js";
import { executarExpx } from "./expx.js";
import { SUBCOMANDOS } from "./subcomandos.js";

// `expx sessao <trabalho>` (CONTRATO-expx-orquestracao §14, escopo (a)): lê a classe declarada no
// 00-OCORRENCIA.md (runx) ou no 00-PLANEJAMENTO.md (sprintx) e imprime o comando de abertura da
// sessão principal. Puro: não grava nada e não chama o `claude`.
const criados: string[] = [];
afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });
// `.native`: no Windows o `realpathSync` em JS mantém o nome curto 8.3 (RUNNER~1) e o git devolve o longo
const temp = (p: string): string => { const d = realpathSync.native(mkdtempSync(join(tmpdir(), p))); criados.push(d); return d; };
function git(d: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], { cwd: d, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}
const escreve = (d: string, rel: string, conteudo: string): void => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), conteudo); };
function repo(nome = "expx-sessao-"): string {
  const d = temp(nome);
  git(d, "init", "-q", "-b", "main");
  git(d, "commit", "-q", "--allow-empty", "-m", "base");
  return d;
}
type Tripla = { classe?: string | null; por?: string | null; justificativa?: string | null };
const yaml = (v: string | null | undefined): string => (v === undefined ? "" : v === null ? "null" : v);
function triplaFm(t: Tripla): string {
  return (t.classe === undefined ? "" : `classe_sessao: ${yaml(t.classe)}\n`)
    + (t.por === undefined ? "" : `classe_sessao_por: ${yaml(t.por)}\n`)
    + (t.justificativa === undefined ? "" : `classe_sessao_justificativa: ${t.justificativa === null ? "null" : JSON.stringify(t.justificativa)}\n`);
}
const ocorrencia = (raiz: string, id: string, t: Tripla): void =>
  escreve(raiz, `docs/manutencao/${id}-x/00-OCORRENCIA.md`, `---\nexpx_schema: 1\nexpx_tool: runx\nkind: ocorrencia\ntrabalho_id: ${id}\n${triplaFm(t)}---\n\n# ${id}\n`);
const planejamento = (raiz: string, slug: string, t: Tripla): void =>
  escreve(raiz, `docs/sprintx/features/${slug}/00-PLANEJAMENTO.md`, `---\nexpx_schema: 1\nexpx_tool: sprintx\nkind: planejamento\ntrabalho_id: ${slug}\n${triplaFm(t)}---\n`);
const NORMAL = { classe: "raciocinio_normal", por: "orquestra", justificativa: null };

describe("expx sessao: o comando de abertura pela classe declarada", () => {
  it("funcional: runx, classe da tabela embutida, cd na raiz do artefato", () => {
    const r = repo();
    ocorrencia(r, "OC-2026-0001", NORMAL);
    expect(sugerirSessao(r, "OC-2026-0001", {})).toEqual({ ok: true, linha: `cd '${r}' && claude --model sonnet --effort medium`, avisos: [] });
  });

  it("funcional: sprintx no caminho canônico (docs/sprintx/features/<slug>)", () => {
    const r = repo();
    planejamento(r, "feat-a", { classe: "mecanico_triagem", por: "flavio", justificativa: null });
    expect(sugerirSessao(r, "feat-a", {})).toMatchObject({ ok: true, linha: `cd '${r}' && claude --model haiku --effort low` });
  });

  it("funcional: o artefato numa outra worktree do repositório: o cd vai para ela", () => {
    const r = repo();
    const wt = join(temp("expx-sessao-wt-"), "oc");
    git(r, "worktree", "add", "-q", "-b", "fix/OC-2026-0002-x", wt);
    ocorrencia(wt, "OC-2026-0002", NORMAL);
    expect(sugerirSessao(r, "OC-2026-0002", {})).toMatchObject({ ok: true, linha: `cd '${wt}' && claude --model sonnet --effort medium` });
  });

  it("funcional: apóstrofo na raiz é escapado para o shell POSIX", () => {
    const r = repo("expx-sessao-d'agua-");
    ocorrencia(r, "OC-2026-0003", NORMAL);
    const s = sugerirSessao(r, "OC-2026-0003", {});
    expect(s).toMatchObject({ ok: true, linha: `cd '${r.replace(/'/g, "'\\''")}' && claude --model sonnet --effort medium` });
  });

  it("funcional: política parcial: a classe sem cadeia no projeto cai na embutida; a com cadeia usa a primeira; sem effort, sem --effort", () => {
    const r = repo();
    escreve(r, ".expx/orquestracao.json", JSON.stringify({ expx_orquestracao: 1, adaptadores: { claude: { classes: {
      profundo_excepcional: [{ id: "opus-sem-esforco", model: "opus" }, { id: "opus-max", model: "opus", effort: "max" }] } } } }));
    ocorrencia(r, "OC-2026-0004", NORMAL);
    ocorrencia(r, "OC-2026-0005", { classe: "profundo_excepcional", por: "flavio", justificativa: "migração de dados" });
    expect(sugerirSessao(r, "OC-2026-0004", {})).toMatchObject({ ok: true, linha: `cd '${r}' && claude --model sonnet --effort medium` });
    expect(sugerirSessao(r, "OC-2026-0005", {})).toMatchObject({ ok: true, linha: `cd '${r}' && claude --model opus` });
  });

  it("funcional: ANTHROPIC_MODEL e CLAUDE_CODE_EFFORT_LEVEL no ambiente viram avisos", () => {
    const r = repo();
    ocorrencia(r, "OC-2026-0006", NORMAL);
    const s = sugerirSessao(r, "OC-2026-0006", { ANTHROPIC_MODEL: "opus", CLAUDE_CODE_EFFORT_LEVEL: "high" });
    expect(s.ok && s.avisos.length).toBe(2);
    expect(s.ok && s.avisos.join("\n")).toMatch(/ANTHROPIC_MODEL[\s\S]*CLAUDE_CODE_EFFORT_LEVEL/);
  });
});

describe("expx sessao: o que não sugere nada", () => {
  const recusa = (raiz: string, id: string, trecho: RegExp): void => {
    const s = sugerirSessao(raiz, id, {});
    expect(s.ok, JSON.stringify(s)).toBe(false);
    if (!s.ok) expect(s.erro).toMatch(trecho);
  };

  it("funcional: sem classe declarada (nula ou ausente)", () => {
    const r = repo();
    ocorrencia(r, "OC-2026-0010", { classe: null, por: null, justificativa: null });
    ocorrencia(r, "OC-2026-0011", {});
    recusa(r, "OC-2026-0010", /sem classe declarada/);
    recusa(r, "OC-2026-0011", /sem classe declarada/);
  });

  it("funcional: trabalho não encontrado", () => {
    recusa(repo(), "OC-2026-0099", /nao encontrado/);
  });

  it("funcional: mais de um artefato com o mesmo trabalho_id, na mesma árvore ou não, é ambíguo", () => {
    const r = repo();
    ocorrencia(r, "dup", NORMAL);
    planejamento(r, "dup", NORMAL);
    recusa(r, "dup", /ambiguo[\s\S]*00-OCORRENCIA[\s\S]*00-PLANEJAMENTO/);
  });

  // CodeAnt no expxdev#158: sem a lista das worktrees, um id duplicado noutra árvore passaria por único
  it.skipIf(process.platform === "win32")("funcional: git worktree list falhando num repositório recusa, em vez de procurar só na atual", () => {
    const r = repo();
    ocorrencia(r, "OC-2026-0013", NORMAL);
    const bin = temp("expx-sessao-git-");
    const real = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(join(bin, "git"), `#!/bin/sh\nfor a in "$@"; do [ "$a" = worktree ] && exit 128; done\nexec "${real}" "$@"\n`, { mode: 0o755 });
    const antes = process.env["PATH"];
    process.env["PATH"] = `${bin}:${antes ?? ""}`;
    try {
      recusa(r, "OC-2026-0013", /worktrees/);
    } finally {
      process.env["PATH"] = antes;
    }
  });

  it("funcional: política inválida", () => {
    const r = repo();
    escreve(r, ".expx/orquestracao.json", "{");
    ocorrencia(r, "OC-2026-0012", NORMAL);
    recusa(r, "OC-2026-0012", /orquestracao\.json/);
  });

  it("funcional: declarações incoerentes", () => {
    const r = repo();
    const casos: [string, Tripla][] = [
      ["OC-2026-0020", { classe: "profundo_excepcional", por: "flavio", justificativa: null }],
      ["OC-2026-0021", { classe: "profundo_excepcional", por: "flavio", justificativa: "  " }],
      ["OC-2026-0022", { classe: "raciocinio_normal", por: "flavio", justificativa: "não cabe aqui" }],
      ["OC-2026-0023", { classe: null, por: "flavio", justificativa: null }],
      ["OC-2026-0024", { classe: null, por: null, justificativa: "sem classe" }],
      ["OC-2026-0025", { classe: "medio", por: "flavio", justificativa: null }],
      ["OC-2026-0026", { classe: "raciocinio_normal", por: null, justificativa: null }],
      ["OC-2026-0027", { classe: "raciocinio_normal", por: "Flavio Kato", justificativa: null }],
    ];
    for (const [id, t] of casos) ocorrencia(r, id, t);
    for (const [id] of casos) recusa(r, id, /declaracao invalida/);
  });
});

describe("expx sessao: a CLI", () => {
  it("funcional: é um subcomando; sai 0 com a linha no stdout e 1 com o erro no stderr", async () => {
    expect(SUBCOMANDOS).toContain("sessao");
    const r = repo();
    ocorrencia(r, "OC-2026-0030", NORMAL);
    const cwd = process.cwd();
    process.chdir(r);
    try {
      let out = "", err = "";
      const saida = { escrever: (t: string) => { out += t; }, escreverErro: (t: string) => { err += t; } };
      expect(await executarExpx(["sessao", "OC-2026-0030"], saida)).toBe(0);
      expect(out).toBe(`cd '${r}' && claude --model sonnet --effort medium\n`);
      out = ""; err = "";
      expect(await executarExpx(["sessao", "OC-2026-0099"], saida)).toBe(1);
      expect(out).toBe("");
      expect(err).toMatch(/nao encontrado/);
      expect(await executarExpx(["sessao"], saida)).toBe(1);
    } finally {
      process.chdir(cwd);
    }
  });
});
