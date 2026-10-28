import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { validarRastro } from "../parser/esquema/evento.js";

/**
 * `nucleo/hooks/expx-integridade-final.sh` — a `integridade_final` da F3c
 * (CONTRATO-expx-orquestracao §12). No `SubagentStart` de um agente de aprovação
 * ele fotografa a árvore; no `SubagentStop` compara e grava
 * `integridade_final_verificada`. Cada caso roda o hook de verdade no bash dos
 * hooks, com o payload fabricado no stdin e um repositório temporário — nunca o
 * `claude`.
 */

const BASH = bashDosHooks();
const HOOK = join(RAIZ_DO_REPO, "nucleo", "hooks", "expx-integridade-final.sh").replace(/\\/g, "/");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** Um repositório com um commit e o rastro ignorado, como o contrato de eventos pede. */
function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-integridade-"));
  criados.push(d);
  git(d, "init", "-q", "-b", "main");
  writeFileSync(join(d, ".gitignore"), "docs/eventos/\nignorado.txt\n");
  writeFileSync(join(d, "a.txt"), "um\n");
  git(d, "add", "-A");
  git(d, "commit", "-q", "-m", "inicio");
  return d;
}

type Payload = { evento: "SubagentStart" | "SubagentStop"; agente: string; id: string; sessao?: string };

/** Roda o hook com o payload no stdin. O hook sempre sai 0 (falha aberta). */
function hook(raiz: string, p: Payload, extra: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("EXPX_") && !k.startsWith("GIT_") && k !== "CLAUDECODE") env[k] = v;
  const payload = JSON.stringify({
    session_id: p.sessao ?? "sessao-1",
    hook_event_name: p.evento,
    agent_id: p.id,
    agent_type: p.agente,
    cwd: raiz,
  });
  const r = spawnSync(BASH, [HOOK], { cwd: raiz, input: payload, encoding: "utf8", env: { ...env, CLAUDECODE: "1", ...extra } });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const inicio = (raiz: string, agente: string, id: string, sessao?: string) =>
  hook(raiz, { evento: "SubagentStart", agente, id, ...(sessao !== undefined ? { sessao } : {}) });
const fim = (raiz: string, agente: string, id: string, sessao?: string) =>
  hook(raiz, { evento: "SubagentStop", agente, id, ...(sessao !== undefined ? { sessao } : {}) });

type Linha = {
  evento: string;
  ferramenta: string;
  agente: string;
  resultado: string;
  integridade_final?: { estado: string; diferencas: string[] };
};

/** As linhas `integridade_final_verificada` do rastro, na ordem gravada. */
function verificacoes(raiz: string): Linha[] {
  const dir = join(raiz, "docs", "eventos");
  if (!existsSync(dir)) return [];
  const linhas: Linha[] = [];
  for (const f of readdirSync(dir).sort()) {
    for (const l of readFileSync(join(dir, f), "utf8").split("\n")) {
      if (l === "") continue;
      const o = JSON.parse(l) as Linha;
      if (o.evento === "integridade_final_verificada") linhas.push(o);
    }
  }
  return linhas;
}

/** O diretório de estado da F3c no git-dir da worktree. */
function estado(raiz: string): string {
  const p = git(raiz, "rev-parse", "--git-path", "expx/integridade-final/v1").trim();
  return isAbsolute(p) ? p : join(raiz, p);
}

/** Todo arquivo sob o estado, relativo a ele. */
function arquivosDoEstado(raiz: string): string[] {
  const base = estado(raiz);
  if (!existsSync(base)) return [];
  return (readdirSync(base, { recursive: true, withFileTypes: true }) as { isFile(): boolean; name: string; parentPath?: string; path?: string }[])
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath ?? e.path ?? "", e.name));
}

describe("expx-integridade-final: a foto do início contra o fim, por instância de subagente", () => {
  it("funcional: nada mudou — igual, resultado ok, e o estado da instância é removido", () => {
    const raiz = repo();
    expect(inicio(raiz, "qa", "ag-1").status).toBe(0);
    expect(arquivosDoEstado(raiz).length).toBeGreaterThan(0);
    expect(fim(raiz, "qa", "ag-1").status).toBe(0);
    const [v, ...resto] = verificacoes(raiz);
    expect(resto).toEqual([]);
    expect(v).toMatchObject({ ferramenta: "runx", agente: "qa", resultado: "ok" });
    expect(v?.integridade_final).toEqual({ estado: "igual", diferencas: [] });
    expect(arquivosDoEstado(raiz)).toEqual([]);
  });

  it("funcional: arquivo rastreado alterado — divergente em status e arvore, falha, e o estado também sai", () => {
    const raiz = repo();
    inicio(raiz, "revisor-diff", "ag-1");
    writeFileSync(join(raiz, "a.txt"), "dois\n");
    fim(raiz, "revisor-diff", "ag-1");
    const [v] = verificacoes(raiz);
    expect(v).toMatchObject({ ferramenta: "mergex", agente: "revisor-diff", resultado: "falha" });
    expect(v?.integridade_final).toEqual({ estado: "divergente", diferencas: ["status", "arvore"] });
    expect(arquivosDoEstado(raiz)).toEqual([]);
  });

  it("funcional: arquivo NÃO rastreado que já existia, editado — só a arvore diverge", () => {
    const raiz = repo();
    writeFileSync(join(raiz, "novo.txt"), "do implementador\n");
    inicio(raiz, "runx-revisor-testes", "ag-1");
    writeFileSync(join(raiz, "novo.txt"), "do revisor\n");
    fim(raiz, "runx-revisor-testes", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "divergente", diferencas: ["arvore"] });
  });

  it("funcional: arquivo não rastreado criado — status e arvore divergem", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-1");
    writeFileSync(join(raiz, "criado.txt"), "x\n");
    fim(raiz, "qa", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "divergente", diferencas: ["status", "arvore"] });
  });

  it("funcional: commit durante o subagente — head e arvore divergem, o status limpo continua limpo", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-1");
    writeFileSync(join(raiz, "a.txt"), "commitado\n");
    git(raiz, "commit", "-q", "-am", "durante");
    fim(raiz, "qa", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "divergente", diferencas: ["head", "arvore"] });
  });

  it("funcional: arquivo ignorado alterado não conta — o limite declarado do nível fraco", () => {
    const raiz = repo();
    writeFileSync(join(raiz, "ignorado.txt"), "antes\n");
    inicio(raiz, "qa", "ag-1");
    writeFileSync(join(raiz, "ignorado.txt"), "depois\n");
    fim(raiz, "qa", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "igual", diferencas: [] });
  });

  it("funcional: o índice real não é tocado — o que estava preparado continua preparado", () => {
    const raiz = repo();
    writeFileSync(join(raiz, "a.txt"), "preparado\n");
    git(raiz, "add", "a.txt");
    writeFileSync(join(raiz, "solto.txt"), "fora do indice\n");
    const antes = git(raiz, "diff", "--cached", "--name-only");
    inicio(raiz, "qa", "ag-1");
    fim(raiz, "qa", "ag-1");
    expect(git(raiz, "diff", "--cached", "--name-only")).toBe(antes);
    expect(git(raiz, "status", "--porcelain")).toContain("?? solto.txt");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "igual", diferencas: [] });
  });

  it("funcional: fim sem início — ausente, falha; nunca vira igual", () => {
    const raiz = repo();
    expect(fim(raiz, "qa", "ag-sem-inicio").status).toBe(0);
    const [v] = verificacoes(raiz);
    expect(v).toMatchObject({ agente: "qa", resultado: "falha" });
    expect(v?.integridade_final).toEqual({ estado: "ausente", diferencas: [] });
  });

  it("funcional: estado corrompido entre o início e o fim — ausente", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-1");
    for (const f of arquivosDoEstado(raiz)) if (f.endsWith("arvore")) rmSync(f);
    fim(raiz, "qa", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "ausente", diferencas: [] });
    expect(arquivosDoEstado(raiz)).toEqual([]);
  });

  it("funcional: repositório sem commit — ausente", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-integridade-"));
    criados.push(raiz);
    git(raiz, "init", "-q", "-b", "main");
    writeFileSync(join(raiz, ".gitignore"), "docs/eventos/\n");
    inicio(raiz, "qa", "ag-1");
    fim(raiz, "qa", "ag-1");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "ausente", diferencas: [] });
  });

  it("funcional: duas instâncias intercaladas não colidem — cada uma compara a própria foto", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-a");
    inicio(raiz, "qa", "ag-b");
    fim(raiz, "qa", "ag-a");
    writeFileSync(join(raiz, "a.txt"), "depois de a\n");
    fim(raiz, "qa", "ag-b");
    expect(verificacoes(raiz).map((v) => v.integridade_final?.estado)).toEqual(["igual", "divergente"]);
    expect(arquivosDoEstado(raiz)).toEqual([]);
  });

  it("funcional: o mesmo agent_id em sessões diferentes não colide", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-1", "sessao-a");
    inicio(raiz, "qa", "ag-1", "sessao-b");
    fim(raiz, "qa", "ag-1", "sessao-a");
    fim(raiz, "qa", "ag-1", "sessao-b");
    expect(verificacoes(raiz).map((v) => v.integridade_final?.estado)).toEqual(["igual", "igual"]);
  });

  it("funcional: `expx:qa` é o qa; agente fora da lista não fotografa nem grava", () => {
    const raiz = repo();
    inicio(raiz, "expx:qa", "ag-1");
    fim(raiz, "expx:qa", "ag-1");
    expect(verificacoes(raiz)[0]).toMatchObject({ agente: "qa", ferramenta: "runx" });

    for (const fora of ["Explore", "outro:qa", "qa-extra", "expx:expx:qa", "revisor-diff ", ""]) {
      const r = repo();
      expect(inicio(r, fora, "ag-1").status).toBe(0);
      expect(arquivosDoEstado(r)).toEqual([]);
      expect(fim(r, fora, "ag-1").status).toBe(0);
      expect(verificacoes(r), fora).toEqual([]);
    }
  });

  it("funcional: agent_id e session_id hostis não escapam do estado nem viram caminho", () => {
    const raiz = repo();
    const hostil = "../../../fora";
    inicio(raiz, "qa", hostil, "../../sessao");
    const base = estado(raiz);
    for (const f of arquivosDoEstado(raiz)) expect(f.startsWith(base), f).toBe(true);
    expect(existsSync(join(raiz, "..", "fora"))).toBe(false);
    fim(raiz, "qa", hostil, "../../sessao");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "igual", diferencas: [] });
  });

  it("funcional: payload sem agent_id — ausente no fim, sem estado no início", () => {
    const raiz = repo();
    inicio(raiz, "qa", "");
    expect(arquivosDoEstado(raiz)).toEqual([]);
    fim(raiz, "qa", "");
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "ausente", diferencas: [] });
  });

  it("integração: o rastro gravado passa pelo validador do contrato de eventos", () => {
    const raiz = repo();
    inicio(raiz, "qa", "ag-1");
    writeFileSync(join(raiz, "a.txt"), "x\n");
    fim(raiz, "qa", "ag-1");
    fim(raiz, "revisor-diff", "sem-inicio");
    const dir = join(raiz, "docs", "eventos");
    for (const f of readdirSync(dir)) {
      const r = validarRastro(readFileSync(join(dir, f), "utf8"));
      expect(r.linhas).toBe(2);
      expect(r.defeitos).toEqual([]);
      expect(r.desconhecidas).toEqual([]);
    }
  });

  it("funcional: GIT_DIR, GIT_WORK_TREE e GIT_INDEX_FILE herdados não desviam a foto para outro repositório", () => {
    const raiz = repo();
    const outro = repo();
    const herdado = { GIT_DIR: join(outro, ".git"), GIT_WORK_TREE: outro, GIT_INDEX_FILE: join(outro, ".git", "index") };
    hook(raiz, { evento: "SubagentStart", agente: "qa", id: "ag-1" }, herdado);
    writeFileSync(join(raiz, "a.txt"), "mudou no repositorio do payload\n");
    hook(raiz, { evento: "SubagentStop", agente: "qa", id: "ag-1" }, herdado);
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "divergente", diferencas: ["status", "arvore"] });
    expect(existsSync(join(outro, "docs", "eventos"))).toBe(false);
  });

  it("funcional: a configuração do Git passada pelo ambiente (GIT_CONFIG_COUNT) continua valendo na foto", () => {
    const raiz = repo();
    const fora = mkdtempSync(join(tmpdir(), "expx-excludes-"));
    criados.push(fora);
    writeFileSync(join(fora, "excludes"), "gerado.txt\n");
    const config = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.excludesFile", GIT_CONFIG_VALUE_0: join(fora, "excludes").replace(/\\/g, "/") };
    hook(raiz, { evento: "SubagentStart", agente: "qa", id: "ag-1" }, config);
    writeFileSync(join(raiz, "gerado.txt"), "ignorado pela configuracao do ambiente\n");
    hook(raiz, { evento: "SubagentStop", agente: "qa", id: "ag-1" }, config);
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "igual", diferencas: [] });
  });

  // O wrapper é script sh no PATH: no Windows o Git Bash do teste resolveria o git.exe antes dele.
  it.skipIf(process.platform === "win32")("funcional: com um git anterior ao --path-format (2.31), a foto ainda funciona", () => {
    const raiz = repo();
    const bin = mkdtempSync(join(tmpdir(), "expx-git-antigo-"));
    criados.push(bin);
    const real = spawnSync(BASH, ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\nfor a in "$@"; do case "$a" in --path-format*) echo "unknown option: $a" >&2; exit 129;; esac; done\nexec "${real}" "$@"\n`,
      { mode: 0o755 },
    );
    const antigo = { PATH: `${bin}:${process.env["PATH"] ?? ""}` };
    hook(raiz, { evento: "SubagentStart", agente: "qa", id: "ag-1" }, antigo);
    writeFileSync(join(raiz, "a.txt"), "x\n");
    hook(raiz, { evento: "SubagentStop", agente: "qa", id: "ag-1" }, antigo);
    expect(verificacoes(raiz)[0]?.integridade_final).toEqual({ estado: "divergente", diferencas: ["status", "arvore"] });
    expect(arquivosDoEstado(raiz)).toEqual([]);
  });

  it("funcional: o hook não escreve na árvore de trabalho além do rastro ignorado", () => {
    const raiz = repo();
    mkdirSync(join(raiz, "docs"), { recursive: true });
    const antes = git(raiz, "status", "--porcelain", "-z", "--untracked-files=all", "--ignored");
    inicio(raiz, "qa", "ag-1");
    const durante = git(raiz, "status", "--porcelain", "-z", "--untracked-files=all", "--ignored");
    expect(durante).toBe(antes);
  });
});
