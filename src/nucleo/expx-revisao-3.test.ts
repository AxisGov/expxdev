// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
// Parte 3 de 4; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { arquivosDoCaso, respostaDoCaso } from "../teste/conformidade.js";
import { criados, git, escreve, cenario, revisar, achado, identidade, rejeita, altera3, grava, poeCaso, doFixture, roda, conferir, EV, evidencia, commita, type Cenario } from "../teste/expx-revisao-apoio.js";

afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });

let grandeBlob = "";
const blobs: Record<string, string> = {};

describe("expx-revisao.mjs conferir v2", () => {
  /** Uma evidência ok de `src/a.js` revisada e commitada, e a troca `muda` aplicada a ela num commit só de evidência. */
  function forjada(muda: (ev: Record<string, any>) => void, antes?: (raiz: string) => void): { raiz: string; sha: string } {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    commita(c.raiz);
    antes?.(c.raiz);
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "forjada");
    return { raiz: c.raiz, sha: git(c.raiz, "rev-parse", "HEAD") };
  }
  const reprova = (f: { raiz: string; sha: string }, campo: string) =>
    expect(conferir(f.raiz, "se_disponivel", `T-01=${f.sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });

  it("funcional: evidência v1 → FALHA evidencia-invalida:versao", () => {
    reprova(forjada((ev) => { ev["expx_revisao"] = 1; }), "versao");
  });

  it("funcional: incompleta é FALHA em obrigatoria e em se_disponivel", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["linhas-5001.js"]);
    revisar(c, "linhas-5001.js");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    const sha = git(c.raiz, "rev-parse", "HEAD");
    for (const modo of ["obrigatoria", "se_disponivel"]) {
      expect(conferir(c.raiz, modo, `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA incompleta:L2:linhas-5001.js" });
    }
  });

  it.each([
    ["cli.integridade diferente de conferida", (ev: Record<string, any>) => { ev["cli"].integridade = null; }, "integridade"],
    ["max_files 15 forjado", (ev: Record<string, any>) => { ev["chamada"].meta.max_files = 15; }, "perfil"],
    ["meta ausente", (ev: Record<string, any>) => { ev["chamada"].meta = null; }, "perfil"],
    ["pulo com motivo fora do perfil", (ev: Record<string, any>) => { ev["chamada"].meta.skipped = [{ file: "x.js", reason: "too big" }]; }, "perfil"],
    ["falha de lote registrada", (ev: Record<string, any>) => { ev["chamada"].falhas_de_lote = ["[error] Failed to review src/a.js: 500"]; }, "lote-falhou"],
    ["falha do Rejector registrada", (ev: Record<string, any>) => { ev["chamada"].falhas_de_lote = ["[error] Rejector failed for batch 2: HTTP error 413"]; }, "lote-falhou"],
    ["enviado fora de reviewed_files", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = []; }, "cobertura"],
    ["enviado pulado", (ev: Record<string, any>) => { ev["chamada"].meta.skipped = [{ file: "src/a.js", reason: "too large (5001 lines, max 5000)" }]; }, "cobertura"],
    ["enviado com linhas menores que as do blob", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].linhas = 1; }, "L2"],
    ["enviado com bytes menores que os do blob", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].bytes = 1; }, "L2"],
    // sem enviado, nada da CLI seria conferido: a classificação de cada arquivo é refeita
    ["revisável marcado excluido", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "excluido"; }, "revisao"],
    ["revisável marcado nao-revisavel", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "nao-revisavel"; }, "revisao"],
    ["revisao desconhecida", (ev: Record<string, any>) => { ev["arquivos"]["src/a.js"].revisao = "foo"; }, "revisao"],
    ["chamada com error não nulo", (ev: Record<string, any>) => { ev["chamada"].error = "falhou"; }, "chamada"],
    ["include diferente dos enviados", (ev: Record<string, any>) => { ev["chamada"].include = ["src/a.js", "src/b.js"]; }, "cobertura"],
    ["revisado repetido", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = ["src/a.js", "src/a.js"]; }, "cobertura"],
    ["sobra em reviewed_files", (ev: Record<string, any>) => { ev["chamada"].meta.reviewed_files = ["src/a.js", "src/z.js"]; }, "cobertura"],
  ])("funcional: ok com %s → FALHA evidencia-invalida:<campo>", (_nome, muda, campo) => {
    reprova(forjada(muda), campo);
  });

  it("funcional: ok com enviado de 5.001 linhas forjado → FALHA evidencia-invalida:L2", () => {
    const grande = Array.from({ length: 5001 }, (_, i) => `l${i}`).join("\n");
    reprova(forjada((ev) => {
      ev["arquivos"]["src/a.js"] = { ...ev["arquivos"]["src/a.js"], blob: grandeBlob, linhas: 5001, bytes: Buffer.byteLength(grande) };
    }, (raiz) => { escreve(raiz, "src/a.js", grande); grandeBlob = git(raiz, "hash-object", "src/a.js"); }), "L2");
  });

  it("funcional: blob do enviado ilegível para o git (objeto apagado) → FALHA evidencia-invalida:blob-ilegivel:<arquivo> (antes, L2), nunca medida de 0 bytes", () => {
    const f = forjada(() => undefined);
    const blob = git(f.raiz, "rev-parse", `${f.sha}:src/a.js`);
    rmSync(join(f.raiz, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });
    reprova(f, "blob-ilegivel:src/a.js");
  });

  it("funcional: ok com enviado acima da leitura máxima forjado pequeno → FALHA evidencia-invalida:L2", () => {
    reprova(forjada((ev) => {
      ev["arquivos"]["src/a.js"] = { ...ev["arquivos"]["src/a.js"], blob: grandeBlob, linhas: 2, bytes: 4 };
    }, (raiz) => { escreve(raiz, "src/a.js", "x".repeat(1024 * 1024 + 1)); grandeBlob = git(raiz, "hash-object", "src/a.js"); }), "L2");
  });

  it("funcional: ok com mais de 40 enviados forjado → FALHA evidencia-invalida:L1", () => {
    const nomes = Array.from({ length: 41 }, (_, i) => `src/f${i}.js`);
    reprova(forjada((ev) => {
      for (const f of nomes) ev["arquivos"][f] = { blob: blobs[f], bytes: 2, linhas: 2, revisao: "enviado" };
      ev["chamada"].include = ["src/a.js", ...nomes];
      ev["chamada"].meta = { ...ev["chamada"].meta, reviewed_files: ["src/a.js", ...nomes], total_changed: 42 };
    }, (raiz) => { for (const f of nomes) { escreve(raiz, f, "x\n"); blobs[f] = git(raiz, "hash-object", f); } }), "L1");
  });

  it("funcional: rejeitar não tira a evidência de incompleta", () => {
    const c = cenario();
    escreve(c.raiz, EV, JSON.stringify({ expx_revisao: 2, trabalho: "w", task: "T-01", resultado: "incompleta", motivo: "L1:41",
      arquivos: {}, achados: [{ identidade: "a".repeat(64), estado: "aberto" }], rejeicoes: [] }));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp")).toMatchObject({ rc: 0, out: "T-01 incompleta:L1:41" });
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "incompleta", motivo: "L1:41", achados: [{ estado: "rejeitado" }] });
  });
});

describe("expx-revisao.mjs id de task", () => {
  it("funcional: T-NN.MM (o id da sprintx e da runx) é aceito nos três subcomandos e a evidência vai para revisao/T-NN.MM.json", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01.03");
    expect(r).toMatchObject({ rc: 1, ev: { task: "T-01.03", resultado: "achados" } });
    const id = r.ev.achados[0]?.identidade ?? "";
    expect(roda(c.raiz, "rejeitar", "--task", "T-01.03", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01.03=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01.03 ok" });
    expect(git(c.raiz, "ls-files", "docs")).toBe("docs/entregas/w/revisao/T-01.03.json");
  });

  it.each(["T-01..03", "T-01/03", "T-01\\03", "../x", "T-1.03", "T-01.3", "T-01.03.04", ""])(
    "funcional: id de task %j é uso errado (64) nos três subcomandos e nada é gravado", (task) => {
      const c = cenario();
      const sha = git(c.raiz, "rev-parse", "HEAD");
      expect(revisar(c, "src/a.js", task).rc).toBe(64);
      expect(conferir(c.raiz, "se_disponivel", `${task}=${sha}`).rc).toBe(64);
      expect(roda(c.raiz, "rejeitar", "--task", task, "--identidade", "a".repeat(64), "--motivo", "fp").rc).toBe(64);
      expect(existsSync(join(c.raiz, "docs"))).toBe(false);
    });

  it("funcional: T-NN (legado) continua aceito", () => {
    const c = cenario();
    const sha = git(c.raiz, "rev-parse", "HEAD");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO evidencia-ausente" });
  });
});

describe("expx-revisao.mjs evidência com as issues da CLI: o conferir deriva os achados", () => {
  const sha256 = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");
  /** `src/a.js` com um achado aberto (linha 3) e um anterior (linha 1), revisado e commitado com a task. */
  function revisada(): { c: Cenario; sha: string } {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js").rc).toBe(1);
    return { c, sha: commita(c.raiz) };
  }
  /** A evidência commitada em `revisada`, editada por `muda` num commit só dela. */
  function editada(muda: (ev: Record<string, any>) => void): { raiz: string; sha: string } {
    const { c } = revisada();
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    return { raiz: c.raiz, sha: commita(c.raiz, true) };
  }
  const reprova = (f: { raiz: string; sha: string }, campo: string) =>
    expect(conferir(f.raiz, "obrigatoria", `T-01=${f.sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });

  it("funcional: o revisar grava as issues cruas, o sha256 do stdout byte a byte e o HEAD", () => {
    const c = cenario({ avisos: "npm warn x\n", issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }] });
    altera3(c.raiz);
    const head = git(c.raiz, "rev-parse", "HEAD");
    const r = revisar(c, "src/a.js");
    const stdout = `npm warn x\n${JSON.stringify({ issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }],
      meta: { reviewed_files: ["src/a.js"], total_changed: 1, skipped: [], capped: false, max_files: 40 }, error: null, noFiles: false })}`;
    expect(r.ev).toMatchObject({ head, chamada: { issues: [{ ...achado("src/a.js", 3), extra: { a: 1 } }], stdout_sha256: sha256(stdout) } });
  });

  it("funcional: limite40.json servido byte a byte: stdout_sha256 é o do arquivo da conformidade, e o conferir passa", () => {
    const c = cenario({ fixture: "limite40" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite40"));
    expect(revisar(c, nomes.join(",")).ev.chamada).toMatchObject({ issues: [], stdout_sha256: sha256(respostaDoCaso("limite40")) });
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: evidência íntegra: aberto reprova por achados-abertos; o anterior sozinho passa", () => {
    const { c, sha } = revisada();
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    const c2 = cenario({ issues: [achado("src/a.js", 1)] });
    altera3(c2.raiz);
    expect(revisar(c2, "src/a.js").rc).toBe(0);
    expect(conferir(c2.raiz, "obrigatoria", `T-01=${commita(c2.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it.each([
    ["achado aberto apagado de achados", (ev: Record<string, any>) => { ev["achados"] = ev["achados"].filter((a: any) => a.estado !== "aberto"); ev["resultado"] = "ok"; }],
    ["achado aberto virou anterior", (ev: Record<string, any>) => { ev["achados"][0].estado = "anterior"; ev["resultado"] = "ok"; }],
    ["achado aberto rejeitado sem rejeição gravada", (ev: Record<string, any>) => { ev["achados"][0].estado = "rejeitado"; ev["resultado"] = "ok"; }],
    ["achados vazio", (ev: Record<string, any>) => { ev["achados"] = []; ev["resultado"] = "ok"; }],
    ["linha do achado trocada", (ev: Record<string, any>) => { ev["achados"][0].linha = 1; }],
    ["texto do achado trocado", (ev: Record<string, any>) => { ev["achados"][1].texto = "outro"; }],
    ["achado a mais", (ev: Record<string, any>) => { ev["achados"].push({ ...ev["achados"][1] }); }],
    ["resultado ok com achado aberto", (ev: Record<string, any>) => { ev["resultado"] = "ok"; }],
  ])("funcional: %s → FALHA evidencia-invalida:achados", (_nome, muda) => {
    reprova(editada(muda), "achados");
  });

  it.each([
    ["sem issues", (ev: Record<string, any>) => { delete ev["chamada"].issues; }],
    ["issues que não é lista", (ev: Record<string, any>) => { ev["chamada"].issues = {}; }],
    ["issue nula", (ev: Record<string, any>) => { ev["chamada"].issues = [null]; }],
    ["sem stdout_sha256", (ev: Record<string, any>) => { delete ev["chamada"].stdout_sha256; }],
  ])("funcional: %s (v2 sem as issues) → FALHA evidencia-invalida:chamada", (_nome, muda) => {
    reprova(editada(muda), "chamada");
  });

  it.each([
    ["head ausente", (ev: Record<string, any>) => { delete ev["head"]; }],
    ["head que não é sha", (ev: Record<string, any>) => { ev["head"] = "HEAD"; }],
    ["head inexistente", (ev: Record<string, any>) => { ev["head"] = "0".repeat(40); }],
  ])("funcional: %s → FALHA evidencia-invalida:head", (_nome, muda) => {
    reprova(editada(muda), "head");
  });

  it("funcional: apagar a issue junto com o achado passa: o limite aceito (a defesa é o diff da evidência no PR)", () => {
    const f = editada((ev) => {
      ev["chamada"].issues = ev["chamada"].issues.filter((i: any) => i.start_line !== 3);
      ev["achados"] = ev["achados"].filter((a: any) => a.estado !== "aberto");
      ev["resultado"] = "ok";
    });
    expect(conferir(f.raiz, "obrigatoria", `T-01=${f.sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: rejeição gravada na evidência de outra task do trabalho, no commit, vale para o achado", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-02", [identidade("security", "src/a.js", ["l2", "novo3", "l4"])]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ estado: "rejeitado" }] } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("segurança: evidência aninhada não pode forjar a rejeição de outra task", () => {
    const f = editada((ev) => {
      ev["achados"][0].estado = "rejeitado";
      ev["resultado"] = "ok";
    });
    const ev = evidencia(f.raiz) as Record<string, any>;
    escreve(f.raiz, "docs/entregas/w/revisao/sub/T-02.json", JSON.stringify({
      rejeicoes: [{ identidade: ev["achados"][0].identidade, motivo: "forjada", em: "x" }],
    }));
    const sha = commita(f.raiz, true);
    reprova({ raiz: f.raiz, sha }, "achados");
  });

  it("funcional: --base-commit: o conferir deriva as linhas alteradas desde base_commit", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(1);
    const sha = commita(c.raiz, true);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    const ev = evidencia(c.raiz) as Record<string, any>;
    ev["achados"][0].estado = "anterior";
    ev["resultado"] = "ok";
    escreve(c.raiz, EV, JSON.stringify(ev));
    reprova({ raiz: c.raiz, sha: commita(c.raiz, true) }, "achados");
  });

  it("funcional: CRLF no checkout (core.autocrlf=true): a derivação pelo blob do commit bate com a do disco", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] }, "true");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\nl4\r\nl5\r\n");
    expect(revisar(c, "src/a.js").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });
});

describe("expx-revisao.mjs conferir: a evidência cobre o commit da task", () => {
  const cobre = (raiz: string, sha: string, falta?: string) => expect(conferir(raiz, "obrigatoria", `T-01=${sha}`))
    .toMatchObject(falta ? { rc: 1, out: `T-01 FALHA evidencia-invalida:cobertura:${falta}` } : { rc: 0, out: "T-01 ok" });
  const todos = (raiz: string, msg = "task"): string => { git(raiz, "add", "-A"); git(raiz, "commit", "-q", "-m", msg); return git(raiz, "rev-parse", "HEAD"); };

  it("funcional: segunda passagem com arquivo novo sem revisar → FALHA cobertura:<f>, em qualquer modo; com novo revisar → ok", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const primeira = commita(c.raiz);
    cobre(c.raiz, primeira);
    escreve(c.raiz, "src/b.js", "b\n");
    const sem = commita(c.raiz);
    cobre(c.raiz, sem, "src/b.js");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sem}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura:src/b.js" });
    git(c.raiz, "reset", "-q", "--hard", primeira);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(revisar(c, "src/b.js").rc).toBe(0);
    cobre(c.raiz, commita(c.raiz));
  });

  it("funcional: não revisável, exclusão do núcleo e excluir_da_revisao do commit saem da conta; revisável fora da evidência não", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    todos(c.raiz, "config");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, "logo.png", "png\n");
    escreve(c.raiz, "docs/sprintx/estado.md", "# estado\n");
    escreve(c.raiz, "gerado/saida.js", "x\n");
    cobre(c.raiz, todos(c.raiz));
    escreve(c.raiz, "src/b.js", "b\n");
    cobre(c.raiz, todos(c.raiz, "mais"), "src/b.js");
  });

  it("funcional: arquivo apagado pelo commit e fora da evidência → FALHA cobertura:<f>", () => {
    const c = cenario();
    escreve(c.raiz, "src/b.js", "b\n");
    todos(c.raiz, "b");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    rmSync(join(c.raiz, "src/b.js"));
    cobre(c.raiz, commita(c.raiz), "src/b.js");
  });

  it("funcional: merge como commit da task conta tudo o que ele traz ao primeiro pai", () => {
    const c = cenario();
    git(c.raiz, "checkout", "-q", "-b", "lado");
    escreve(c.raiz, "src/c.js", "c\n");
    todos(c.raiz, "lado");
    git(c.raiz, "checkout", "-q", "main");
    altera3(c.raiz);
    revisar(c, "src/a.js");
    cobre(c.raiz, commita(c.raiz));
    git(c.raiz, "merge", "-q", "--no-ff", "-m", "merge", "lado");
    cobre(c.raiz, git(c.raiz, "rev-parse", "HEAD"), "src/c.js");
  });

  it("funcional: --base-commit: conta também o que mudou desde base_commit, não só o commit da evidência", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(0);
    cobre(c.raiz, commita(c.raiz, true));
    git(c.raiz, "reset", "-q", "--hard", "HEAD~1");
    escreve(c.raiz, "src/b.js", "b\n");
    todos(c.raiz, "outra");
    expect(revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]).rc).toBe(0);
    cobre(c.raiz, commita(c.raiz, true), "src/b.js");
  });
});

describe("expx-revisao.mjs listar: o que a mergex lê da evidência no commit", () => {
  type Listada = { task: string; commit: string; listagem: string; causa: string | null; resultado: string | null; motivo: string | null;
    rejeitados: unknown[]; rejeicoes: unknown[]; removidos_sem_revisao: string[] };
  const listar = (raiz: string, ...pares: string[]) => {
    const r = roda(raiz, "listar", ...pares.flatMap((p) => ["--task", p]));
    return { rc: r.rc, err: r.err, out: r.out, j: (r.rc === 64 ? undefined : JSON.parse(r.out)) as { expx_revisao_listar: number; trabalho: string; tasks: Listada[] } };
  };
  const vazia = { resultado: null, motivo: null, rejeitados: [], rejeicoes: [], removidos_sem_revisao: [] };
  const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

  it("funcional: achado rejeitado com a rejeição da própria evidência: a saída exata, uma linha de JSON, sai 0", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "falso positivo").rc).toBe(0);
    const sha = commita(c.raiz);
    const r = listar(c.raiz, `T-01=${sha}`);
    expect(r.out.split("\n")).toHaveLength(1);
    expect(r).toMatchObject({ rc: 0, j: { expx_revisao_listar: 1, trabalho: "w", tasks: [{ task: "T-01", commit: sha, listagem: "ok", causa: null,
      resultado: "ok", motivo: null, removidos_sem_revisao: [],
      rejeicoes: [{ identidade: id, motivo: "falso positivo", em: ISO }],
      rejeitados: [{ identidade: id, arquivo: "src/a.js", linha: 3, label: "security", texto: "x", rejeicao: { task: "T-01", motivo: "falso positivo", em: ISO } }] }] } });
    expect(Object.keys(r.j.tasks[0] ?? {})).toEqual(["task", "commit", "listagem", "causa", "resultado", "motivo", "rejeitados", "rejeicoes", "removidos_sem_revisao"]);
  });

  it("funcional: rejeição gravada na evidência de outra task do trabalho: rejeicao aponta a task dela", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    rejeita(c.raiz, "T-02", [id]);
    revisar(c, "src/a.js");
    expect(listar(c.raiz, `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok", resultado: "ok", rejeicoes: [],
      rejeitados: [{ identidade: id, rejeicao: { task: "T-02", motivo: "fp", em: "x" } }] }] } });
  });

  it("funcional: pulos.json (notas.md, manual.pdf, logo.png, package-lock.json, apagado.js) → removidos_sem_revisao [apagado.js]", () => {
    const tarefa = ["notas.md", "manual.pdf", "logo.png", "package-lock.json", "apagado.js"];
    const c = cenario({ resposta: doFixture("pulos", (f) => tarefa.includes(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), tarefa);
    expect(revisar(c, tarefa.join(",")).rc).toBe(0);
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(listar(c.raiz, `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok", resultado: "ok",
      rejeitados: [], rejeicoes: [], removidos_sem_revisao: ["apagado.js"] }] } });
  });

  it("funcional: limite41.json a uma task com f01–f40 → listada, resultado incompleta e motivo sobra:f41.js", () => {
    const c = cenario({ fixture: "limite41" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41")).slice(0, 40);
    expect(revisar(c, nomes.join(",")).rc).toBe(3);
    git(c.raiz, "add", "--", ...nomes, "docs");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(listar(c.raiz, `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, j: { tasks: [{ listagem: "ok",
      resultado: "incompleta", motivo: "sobra:f41.js", rejeitados: [] }] } });
  });

  it("funcional: evidência inválida para o conferir nunca é listada: listagem invalida com a causa do conferir, listas vazias, sai 1", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Record<string, any>;
    ev["achados"][0].estado = "rejeitado"; // sem a rejeição gravada
    ev["resultado"] = "ok";
    escreve(c.raiz, EV, JSON.stringify(ev));
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:achados" });
    expect(listar(c.raiz, `T-01=${sha}`)).toMatchObject({ rc: 1, j: { tasks: [{ task: "T-01", commit: sha, listagem: "invalida",
      causa: "evidencia-invalida:achados", ...vazia }] } });
  });

  it("funcional: segunda passagem sem novo revisar: invalida por cobertura, como no conferir", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    commita(c.raiz);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(listar(c.raiz, `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, j: { tasks: [{ listagem: "invalida", causa: "evidencia-invalida:cobertura:src/b.js" }] } });
  });

  it("funcional: ausente sai 3; commit inexistente é invalida e sai 1; várias tasks na ordem dada", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(listar(c.raiz, `T-01=${sha}`, `T-02=${sha}`)).toMatchObject({ rc: 3, j: { tasks: [{ task: "T-01", listagem: "ok" },
      { task: "T-02", listagem: "ausente", causa: "evidencia-ausente", ...vazia }] } });
    const zero = "0".repeat(40);
    expect(listar(c.raiz, `T-02=${sha}`, `T-01=${zero}`)).toMatchObject({ rc: 1, j: { tasks: [{ task: "T-02", listagem: "ausente" },
      { task: "T-01", commit: zero, listagem: "invalida", causa: `commit-inexistente:${zero}` }] } });
  });

  it.each([
    ["rejeição sem motivo", (ev: Record<string, any>) => { ev["rejeicoes"] = [{ identidade: "a".repeat(64), em: "x" }]; }, "rejeicoes"],
    ["rejeicoes que não é lista", (ev: Record<string, any>) => { ev["rejeicoes"] = {}; }, "rejeicoes"],
    ["removido que não está nulo em arquivos", (ev: Record<string, any>) => { ev["removidos_sem_revisao"] = ["src/a.js"]; }, "removidos_sem_revisao"],
    ["removidos_sem_revisao ausente", (ev: Record<string, any>) => { delete ev["removidos_sem_revisao"]; }, "removidos_sem_revisao"],
  ])("funcional: %s → conferir FALHA evidencia-invalida:<campo> e listar invalida", (_nome, muda, campo) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Record<string, any>;
    muda(ev);
    escreve(c.raiz, EV, JSON.stringify(ev));
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });
    expect(listar(c.raiz, `T-01=${sha}`)).toMatchObject({ rc: 1, j: { tasks: [{ listagem: "invalida", causa: `evidencia-invalida:${campo}` }] } });
  });

  it.each([
    ["sem --task", []],
    ["--modo (o listar não depende do modo)", ["--modo", "obrigatoria", "--task", "T-01=abc"]],
    ["task sem sha", ["--task", "T-01"]],
    ["--identidade", ["--task", "T-01=abc", "--identidade", "a".repeat(64)]],
  ])("funcional: uso errado (%s) → 64, sem saída", (_nome, a) => {
    const c = cenario();
    expect(roda(c.raiz, "listar", ...a)).toMatchObject({ rc: 64, out: "" });
  });
});
