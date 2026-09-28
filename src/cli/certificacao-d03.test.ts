import { describe, it, expect, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The runtime helper is intentionally shipped as a Node module beside the harness adapters.
import { sincronizarSessao } from "../../nucleo/hooks/expx-session-sync.mjs";
import { AVISO_ROLLBACK } from "../update/flags.js";
import {
  ambienteCom,
  arvore,
  CANDIDATOS,
  fontesCandidatas,
  gitEm,
  novoProduto,
  pathControlado,
  RAIZ_DO_REPO,
  rodarExpx,
  sha256,
} from "../teste/candidatos.js";

/**
 * Certificação D-03: o SessionStart não aplica atualização automática a uma
 * instalação que contém origem local (`commit *-local`), e o `expx update`
 * explícito continua funcionando nela.
 *
 * `fixtures/sessao-local/expx-lock.json` é o lock REAL da worktree
 * bootstrap-d02 do Conselho Municipal (sha256 f61efa58…4ca4322, lido sem
 * alteração), com só o caminho das fontes neutralizado: SprintX
 * `4e1f7b88d85f-local` e MergeX `d3ca3aa687bd-local`.
 *
 * Nada aqui usa o GitHub: o ambiente reescreve `https://github.com/` para um
 * caminho inexistente, então um hook que tentasse o bootstrap Axis falharia
 * localmente — e a prova é que ele nem tenta.
 */

const LOCK_P02 = join(RAIZ_DO_REPO, "fixtures", "sessao-local", "expx-lock.json");
const PROIBIDO = ["clone", "fetch", "npm", "expx-bin.js", "update"];

const criados: string[] = [];
afterAll(() => {
  for (const c of criados) rmSync(c, { recursive: true, force: true });
});

function temporario(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

/** Git sem acesso ao GitHub: qualquer URL `https://github.com/` vira caminho inexistente. */
function ambienteHermetico(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${join(tmpdir(), "axis-inexistente-d03")}/.insteadOf`,
    GIT_CONFIG_VALUE_0: "https://github.com/",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

/** Cada arquivo do projeto — `.git` inclusive — com o sha256 dos bytes. */
function bytesDoProjeto(raiz: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const rel of arvore(raiz)) saida[rel] = sha256(join(raiz, rel));
  return saida;
}

/** O executor real do hook (git de verdade), gravando cada chamada. */
function executorEspiao(env: NodeJS.ProcessEnv): { chamadas: string[][]; executar: (a: string, b: string[], o?: object) => string } {
  const chamadas: string[][] = [];
  const executar = (arquivo: string, argumentos: string[], opcoes: object = {}): string => {
    chamadas.push([arquivo, ...argumentos]);
    return execFileSync(arquivo, argumentos, { ...opcoes, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  return { chamadas, executar };
}

function proibidas(chamadas: string[][]): string[][] {
  return chamadas.filter((c) => c.some((v) => PROIBIDO.some((p) => v.includes(p))));
}

function contexto(saida: string): string {
  return (JSON.parse(saida) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
}

function commitarTudo(produto: string, mensagem: string): void {
  gitEm(produto, "add", "-A");
  gitEm(produto, "commit", "-q", "-m", mensagem);
  expect(gitEm(produto, "status", "--porcelain")).toBe("");
}

describe("certificação D-03: freeze local no SessionStart", () => {
  it("integração: lock P0.2 real (SprintX/MergeX -local), árvore limpa, startup — projeto byte a byte igual e nenhum update", () => {
    const lock = JSON.parse(readFileSync(LOCK_P02, "utf8")) as { skills: Record<string, { commit: string }> };
    expect(lock.skills["sprintx"]?.commit).toBe("4e1f7b88d85f-local");
    expect(lock.skills["mergex"]?.commit).toBe("d3ca3aa687bd-local");

    const produto = novoProduto("expx-d03-produto-");
    criados.push(produto);
    mkdirSync(join(produto, ".expx"));
    cpSync(LOCK_P02, join(produto, ".expx", "expx-lock.json"));
    commitarTudo(produto, "instalacao p02 congelada");

    const fora = temporario("expx-d03-cache-");
    const cache = join(fora, "axisgov", "expxdev");
    const env = ambienteHermetico();
    const antes = bytesDoProjeto(produto);
    const lockAntes = sha256(join(produto, ".expx", "expx-lock.json"));

    const { chamadas, executar } = executorEspiao(env);
    const saida = sincronizarSessao({
      entrada: JSON.stringify({ source: "startup" }),
      raiz: produto,
      ambiente: { EXPX_AXIS_CACHE: cache, HOME: fora },
      executar,
    });

    expect(contexto(saida)).toContain("Sincronizacao automatica nao aplicada");
    expect(contexto(saida)).toContain("origem local");
    expect(contexto(saida)).toContain("expx update");
    expect(proibidas(chamadas)).toEqual([]);
    expect(bytesDoProjeto(produto)).toEqual(antes);
    expect(sha256(join(produto, ".expx", "expx-lock.json"))).toBe(lockAntes);
    expect(sha256(join(produto, ".expx", "expx-lock.json"))).toBe(sha256(LOCK_P02));
    expect(existsSync(cache)).toBe(false);
    expect(existsSync(`${cache}.lock`)).toBe(false);
    expect(existsSync(join(fora, "axisgov"))).toBe(false);
  });

  it("integração: expx init real com fontes locais, hook INSTALADO no startup e no resume congela; o update explícito continua aplicando", () => {
    // Fontes locais pelo mecanismo oficial (EXPX_SKILLS_LOCAIS). SprintX ganha
    // a tag v1.0.0 para o update explícito ter para onde ir depois.
    const fontes = fontesCandidatas();
    criados.push(fontes);
    const sprintx = join(fontes, CANDIDATOS.sprintx.pasta);
    gitEm(sprintx, "tag", "v1.0.0");

    const produto = novoProduto("expx-d03-update-");
    criados.push(produto);
    const envCli = ambienteCom(pathControlado(true), { EXPX_SKILLS_LOCAIS: fontes });
    const init = rodarExpx(["init", "--skills", "sprintx,mergex", "--yes"], produto, envCli);
    expect(init.status, `${init.stdout}${init.stderr}`).toBe(0);
    commitarTudo(produto, "instalacao local");

    const lockDe = (): { skills: Record<string, { commit: string; referencia: string }> } =>
      JSON.parse(readFileSync(join(produto, ".expx", "expx-lock.json"), "utf8"));
    const antesLock = lockDe();
    expect(antesLock.skills["sprintx"]?.commit).toMatch(/^[0-9a-f]{12}-local$/);
    expect(antesLock.skills["mergex"]?.commit).toMatch(/^[0-9a-f]{12}-local$/);
    expect(antesLock.skills["sprintx"]?.referencia).toBe("v1.0.0");

    // O hook que o init instalou, rodado como o Claude Code o roda: processo
    // novo, payload no stdin, CLAUDE_PROJECT_DIR apontando o produto.
    const hook = join(produto, ".claude", "hooks", "expx-session-sync.mjs");
    expect(sha256(hook)).toBe(sha256(join(RAIZ_DO_REPO, "nucleo", "hooks", "expx-session-sync.mjs")));
    const fora = temporario("expx-d03-cache-hook-");
    const cache = join(fora, "axisgov", "expxdev");
    const antes = bytesDoProjeto(produto);
    for (const source of ["startup", "resume"]) {
      const r = spawnSync(process.execPath, [hook], {
        cwd: produto,
        input: JSON.stringify({ source, hook_event_name: "SessionStart" }),
        encoding: "utf8",
        env: ambienteHermetico({ CLAUDE_PROJECT_DIR: produto, EXPX_AXIS_CACHE: cache, HOME: fora }),
        timeout: 60000,
      });
      expect(r.status, r.stderr).toBe(0);
      expect(contexto(r.stdout), source).toContain("origem local");
      expect(existsSync(cache), source).toBe(false);
      expect(bytesDoProjeto(produto), source).toEqual(antes);
    }

    // Nova versão publicada na fonte local, e o update EXPLÍCITO pelo CLI real.
    writeFileSync(join(sprintx, "README.md"), `${readFileSync(join(sprintx, "README.md"), "utf8")}\nrevisao d03\n`);
    gitEm(sprintx, "add", "-A");
    gitEm(sprintx, "commit", "-q", "-m", "sprintx: revisao d03");
    gitEm(sprintx, "tag", "v1.1.0");

    const update = rodarExpx(["update", "--latest", "--yes"], produto, envCli);
    expect(update.status, `${update.stdout}${update.stderr}`).toBe(0);
    expect(update.stdout).toContain("sprintx: v1.0.0 → v1.1.0");
    expect(update.stdout).toContain(AVISO_ROLLBACK);
    const depois = lockDe();
    expect(depois.skills["sprintx"]?.referencia).toBe("v1.1.0");
    expect(depois.skills["sprintx"]?.commit).toMatch(/^[0-9a-f]{12}-local$/);
    expect(depois.skills["sprintx"]?.commit).not.toBe(antesLock.skills["sprintx"]?.commit);
    expect(gitEm(produto, "status", "--porcelain")).not.toBe("");
  });
});
