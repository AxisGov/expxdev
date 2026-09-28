import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ambienteCom,
  gitEm,
  novoProduto,
  pathControlado,
  rodarExpx,
  rodarHook,
  fontesCandidatas,
} from "../teste/candidatos.js";
import { suportaBitExecutavel } from "../teste/fs-capacidades.js";

/**
 * Certificação do portão de modo executável: um produto com
 * `core.filemode=false` instalado SÓ pelo `expxdev init` real.
 *
 * O defeito certificado aqui é de classe D: o `init` grava os `.sh` como 0755
 * no disco, mas `git add` registra 100644, porque `core.filemode=false` manda o
 * git ignorar o bit do filesystem. A instalação parece perfeita no produto
 * onde foi feita — hashes, bytes, settings e `expx doctor` verdes — e a
 * primeira worktree ou clone novo materializa 0644: o hook registrado por
 * execução direta (`"$CLAUDE_PROJECT_DIR"/.claude/hooks/…/git-perigoso.sh`)
 * morre com 126 (Permission denied) e a proteção desaparece em silêncio.
 *
 * Nada aqui prepara o índice do usuário: o comando de reparo é EXTRAÍDO da
 * saída do `doctor` e executado pelo teste, no papel da pessoa. O ExpxDev
 * nunca roda `git add` nem `git update-index`.
 */

const criados: string[] = [];
let fontes = "";
/** O produto de referência: `core.filemode=false`, instalado e commitado. */
let A = "";
let indiceAposCommit = "";

const SPRINTX = ".claude/hooks/sprintx/git-perigoso.sh";

function temporario(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

function init(produto: string): ReturnType<typeof rodarExpx> {
  return rodarExpx(
    ["init", "--skills", "sprintx,mergex", "--yes"],
    produto,
    ambienteCom(pathControlado(true), { EXPX_SKILLS_LOCAIS: fontes }),
  );
}

function doctor(produto: string): ReturnType<typeof rodarExpx> {
  return rodarExpx(["doctor"], produto, ambienteCom(pathControlado(true)));
}

/** O índice inteiro, com modo e sha de cada caminho: a prova de "nada foi preparado". */
function indice(produto: string): string {
  return gitEm(produto, "ls-files", "--stage");
}

function modoNoIndice(produto: string, rel: string): string {
  const linha = indice(produto)
    .split("\n")
    .find((l) => l.endsWith(`\t${rel}`));
  if (linha === undefined) throw new Error(`${rel} nao esta no indice de ${produto}`);
  return linha.slice(0, 6);
}

/** O comando de reparo, exatamente como o `doctor` o escreveu. */
function comandoSugerido(saida: string): string[] {
  const m = /git update-index --chmod=\+x -- ([^\n]+)/.exec(saida);
  if (m === null) throw new Error(`a saida do doctor nao traz o comando de reparo:\n${saida}`);
  return ["update-index", "--chmod=+x", "--", ...(m[1] as string).trim().split(" ")];
}

beforeAll(() => {
  fontes = fontesCandidatas();
  criados.push(fontes);
  A = novoProduto("expx-modo-A-");
  criados.push(A);
  // o produto real que reproduz o defeito: o git deste repositório ignora o bit
  gitEm(A, "config", "core.filemode", "false");
  const r = init(A);
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  gitEm(A, "add", "-A");
  gitEm(A, "commit", "-q", "-m", "instala skills pelo expxdev");
  indiceAposCommit = indice(A);
}, 600000);

afterAll(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe("modo executável — o defeito, medido", () => {
  it("integração: o init grava 0755 no disco e o git registra 100644", () => {
    expect(suportaBitExecutavel()).toBe(true); // a bancada precisa de filesystem POSIX
    expect(statSync(join(A, SPRINTX)).mode & 0o111).not.toBe(0);
    expect(modoNoIndice(A, SPRINTX)).toBe("100644");
    expect(gitEm(A, "status", "--porcelain")).toBe("");
  });

  it("funcional: o doctor falha nomeando o modo versionado, com o comando exato e sem executá-lo", () => {
    const r = doctor(A);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stdout).toContain("100644");
    expect(r.stdout).toContain(SPRINTX);
    expect(r.stdout).toContain("git update-index --chmod=+x -- ");
    expect(r.stdout).toContain("expx init");
    expect(r.stdout).toContain("126");
    // o disco está certo: o que está errado é só o modo versionado
    expect(r.stdout).not.toContain("sem o bit de execucao no disco");
    // o diagnóstico não mexe no índice de quem pediu ajuda
    expect(indice(A)).toBe(indiceAposCommit);
  });

  it("funcional: checkout novo materializa 0644, o hook direto morre com 126 e o doctor acusa", () => {
    const nova = join(temporario("expx-modo-wt-"), "checkout");
    gitEm(A, "worktree", "add", "-q", "-b", "checkout-quebrado", nova);
    criados.push(nova);

    expect(statSync(join(nova, SPRINTX)).mode & 0o111).toBe(0);
    const hook = rodarHook(nova, SPRINTX, "git branch -D velha");
    expect(hook.status).toBe(126);
    expect(`${hook.stdout}${hook.stderr}`).toMatch(/[Pp]ermission denied|permissão/);

    const r = doctor(nova);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stdout).toContain(SPRINTX);
  });

  it("funcional: lock antigo, sem o campo executaveis, continua acusando pelo fallback dos .sh", () => {
    const caminho = join(A, ".expx", "expx-lock.json");
    const original = readFileSync(caminho, "utf8");
    const lock = JSON.parse(original) as { instalacao: { executaveis?: string[] } };
    expect(lock.instalacao.executaveis?.includes(SPRINTX)).toBe(true);
    delete lock.instalacao.executaveis;
    writeFileSync(caminho, `${JSON.stringify(lock, null, 2)}\n`);
    try {
      const r = doctor(A);
      expect(r.status, r.stdout).toBe(1);
      expect(r.stdout).toContain(SPRINTX);
      expect(r.stdout).toContain("git update-index --chmod=+x -- ");
    } finally {
      writeFileSync(caminho, original);
    }
    expect(gitEm(A, "status", "--porcelain")).toBe("");
  });

  it("funcional: o init avisa com o comando pronto, é idempotente e não prepara o índice", () => {
    const r = init(A);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(r.stdout).toContain("core.filemode=false");
    expect(r.stdout).toContain("git update-index --chmod=+x -- ");
    expect(r.stdout).toContain(SPRINTX);
    // nada reescrito, nada preparado: o índice e a árvore continuam onde estavam
    expect(indice(A)).toBe(indiceAposCommit);
    expect(gitEm(A, "status", "--porcelain")).toBe("");
    // e o doctor repetido diz sempre o mesmo
    expect(doctor(A).stdout).toBe(doctor(A).stdout);
  });
});

describe("modo executável — o reparo explícito", () => {
  it("funcional: aplicado o comando sugerido e commitado, a worktree nova bloqueia e o doctor fica verde", () => {
    const sugerido = comandoSugerido(doctor(A).stdout);
    expect(sugerido).toContain(SPRINTX);
    gitEm(A, ...sugerido);
    expect(modoNoIndice(A, SPRINTX)).toBe("100755");
    gitEm(A, "commit", "-q", "-m", "chore: versiona o modo executavel dos hooks");

    const verde = doctor(A);
    expect(verde.status, verde.stdout).toBe(0);
    expect(verde.stdout).not.toContain("update-index");

    const nova = join(temporario("expx-modo-wt-ok-"), "checkout");
    gitEm(A, "worktree", "add", "-q", "-b", "checkout-reparado", nova);
    criados.push(nova);

    expect(statSync(join(nova, SPRINTX)).mode & 0o111).not.toBe(0);
    const bloqueio = rodarHook(nova, SPRINTX, "git branch -D velha");
    expect(bloqueio.status, `${bloqueio.stdout}${bloqueio.stderr}`).toBe(2);
    expect(bloqueio.stderr).toContain("sprintx/git-perigoso");
    expect(rodarHook(nova, SPRINTX, "git status").status).toBe(0);

    const doctorNaWorktree = doctor(nova);
    expect(doctorNaWorktree.status, doctorNaWorktree.stdout).toBe(0);
    expect(existsSync(join(nova, ".expx", "expx-lock.json"))).toBe(true);
  });
});
