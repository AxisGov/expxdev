// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
// Parte 2 de 4; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { ambienteCom, noPath } from "../teste/candidatos.js";
import { configurarFalsa } from "../teste/codeant-falsa.js";
import { criados, temp, git, escreve, cenario, PATH, revisar, resp, achado, altera3, naoChamou, roda, conferir, EV, evidencia, commita, type Cenario, type Arquivo, type Ev } from "../teste/expx-revisao-apoio.js";

afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });

describe("expx-revisao.mjs revisar v2: --base-commit", () => {
  it("funcional: chama --base-commit <sha>; linhas alteradas pelo diff desde <sha>", () => {
    const c = cenario({ issues: [achado("src/a.js", 3), achado("src/a.js", 1)] });
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "commit", "-q", "-am", "task");
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "outra");
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r.chamadas).toEqual([["review", "--headless", "--base-commit", base, "--include", "src/a.js"]]);
    expect(r).toMatchObject({ rc: 1, ev: { modo: "base-commit", base_commit: base, resultado: "achados",
      achados: [{ linha: 3, estado: "aberto" }, { linha: 1, estado: "anterior" }] } });
    expect(r.ev.arquivos["src/a.js"]?.blob).toBe(git(c.raiz, "rev-parse", "HEAD:src/a.js"));
  });

  it("funcional: arquivo da task alterado e não commitado → indisponivel:arquivo-nao-commitado:<f>", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-nao-commitado:src/a.js" } });
    naoChamou(r);
  });

  // o caminho é literal para o git: glob e pathspec mágico no nome não trocam os hunks do arquivo
  it.each([false, true])("funcional: src/[id].ts ao lado de src/i.ts: as linhas alteradas são só as dele (--base-commit: %s)", (comBase) => {
    const c = cenario({ issues: [achado("src/[id].ts", 1), achado("src/[id].ts", 3)] });
    for (const f of ["src/[id].ts", "src/i.ts"]) escreve(c.raiz, f, "l1\nl2\nl3\nl4\nl5\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "arquivos");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "src/i.ts", "novo1\nl2\nl3\nl4\nl5\n");
    escreve(c.raiz, "src/[id].ts", "l1\nl2\nnovo3\nl4\nl5\n");
    if (comBase) git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, "src/[id].ts", "T-01", undefined, {}, c.script, comBase ? ["--base-commit", base] : []);
    expect(r).toMatchObject({ rc: 1, ev: { achados: [{ linha: 1, estado: "anterior" }, { linha: 3, estado: "aberto" }] } });
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, nome com pathspec mágico (:(top)x): achado em linha alterada continua aberto", () => {
    const f = ":(top)x";
    const c = cenario({ issues: [achado(f, 3)] });
    escreve(c.raiz, f, "l1\nl2\nl3\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "magico");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, f, "l1\nl2\nnovo3\n");
    git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, f, "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: f, linha: 3, estado: "aberto" }] } });
  });

  it("funcional: CRLF no checkout (core.autocrlf=true) commitado: não é arquivo-nao-commitado e o blob é o do commit", () => {
    const c = cenario({}, "true");
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\n");
    git(c.raiz, "commit", "-q", "-am", "task");
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "src/a.js": { blob: git(c.raiz, "rev-parse", "HEAD:src/a.js"), bytes: 15 } } } });
  });

  it("funcional: a falsa reconfigurada sem fixture deixa de servir a fixture anterior", () => {
    const c = cenario({ fixture: "limite41" });
    configurarFalsa(c.falsa, {});
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
  });

  // com --base-commit, a exclusão que vale é a versionada no HEAD revisado, nunca a da árvore de trabalho
  const exclusaoGerado = JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
    { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] });
  const comGerado = (c: Cenario): string => {
    const base = git(c.raiz, "rev-parse", "HEAD");
    escreve(c.raiz, "gerado/saida.js", "x\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    return base;
  };

  it("funcional: excluir_da_revisao só no disco (fora do HEAD) não vale: o arquivo é revisado", () => {
    const c = cenario();
    const base = comGerado(c);
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "gerado/saida.js": { revisao: "enviado" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--base-commit", base, "--include", "gerado/saida.js"]]);
  });

  it("funcional: excluir_da_revisao no HEAD vale mesmo apagado do disco → incompleta:excluido-declarado", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const base = comGerado(c);
    rmSync(join(c.raiz, ".expx", "fatiamento.json"));
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "excluido-declarado:gerado/saida.js" } });
    naoChamou(r);
  });

  it("funcional: .expx/fatiamento.json do HEAD que não é arquivo → indisponivel:fatiamento-invalido, mesmo válido no disco", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json/x", "x\n");
    const base = comGerado(c);
    rmSync(join(c.raiz, ".expx"), { recursive: true });
    escreve(c.raiz, ".expx/fatiamento.json", exclusaoGerado);
    const r = revisar(c, "gerado/saida.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "fatiamento-invalido" } });
    naoChamou(r);
  });

  it("funcional: arquivo apagado desde <sha> → removido, não arquivo-inexistente", () => {
    const c = cenario();
    const base = git(c.raiz, "rev-parse", "HEAD");
    rmSync(join(c.raiz, "src/a.js"));
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    const r = revisar(c, "src/a.js,src/b.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["src/a.js"], arquivos: { "src/a.js": null } } });
  });
});

// Arquivo declarado na task e igual ao de partida: a CLI só revisa o que mudou e não o devolve, e enviá-lo dava
// `incompleta:faltante` (Login, frente ui-react-046). Fica `sem-alteracao`, fora do `--include`.
describe("expx-revisao.mjs: arquivo declarado e não alterado (sem-alteracao)", () => {
  const comB = (c: Cenario): string => {
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "b");
    return git(c.raiz, "rev-parse", "HEAD");
  };

  it("funcional: sem --base-commit, src/b.js igual ao HEAD e a CLI devolvendo só o alterado → ok, b sem-alteracao, fora do --include", () => {
    const c = cenario({ resposta: resp() });
    comB(c);
    altera3(c.raiz);
    const r = revisar(c, "src/a.js,src/b.js");
    expect(r).toMatchObject({ rc: 0, out: "T-01 ok\n", ev: { resultado: "ok", arquivos: { "src/a.js": { revisao: "enviado" }, "src/b.js": { revisao: "sem-alteracao" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: só o arquivo não alterado → ok sem procurar a CLI, e o conferir aceita", () => {
    const c = cenario();
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "src/a.js": { revisao: "sem-alteracao" } } } });
    naoChamou(r);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: com --base-commit, src/a.js igual na base e no HEAD → sem-alteracao; o conferir aceita", () => {
    const c = cenario({ resposta: resp({ reviewed_files: ["src/b.js"] }) });
    const base = git(c.raiz, "rev-parse", "HEAD");
    comB(c);
    const r = revisar(c, "src/a.js,src/b.js", "T-01", undefined, {}, c.script, ["--base-commit", base]);
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "src/a.js": { revisao: "sem-alteracao" }, "src/b.js": { revisao: "enviado" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--base-commit", base, "--include", "src/b.js"]]);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: arquivo novo vazio não é sem-alteracao (ausente na partida ≠ blob vazio)", () => {
    const c = cenario({ resposta: resp({ reviewed_files: ["src/vazio.js"] }) });
    escreve(c.raiz, "src/vazio.js", "");
    expect(revisar(c, "src/vazio.js")).toMatchObject({ rc: 0, ev: { arquivos: { "src/vazio.js": { revisao: "enviado" } } } });
  });

  it("funcional: arquivo não revisável igual à partida continua nao-revisavel", () => {
    const c = cenario();
    escreve(c.raiz, "package-lock.json", "{}\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "lock");
    expect(revisar(c, "package-lock.json")).toMatchObject({ rc: 0, ev: { arquivos: { "package-lock.json": { revisao: "nao-revisavel" } } } });
  });

  it("funcional: evidência que dá sem-alteracao a um arquivo alterado → FALHA evidencia-invalida:revisao", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Ev;
    ev.arquivos["src/a.js"] = { ...(ev.arquivos["src/a.js"] as Arquivo), revisao: "sem-alteracao" };
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:revisao" });
  });

  it.each([
    ["o SHA da árvore do HEAD", (raiz: string) => git(raiz, "rev-parse", "HEAD^{tree}")],
    ["um SHA inexistente", () => "0".repeat(40)],
  ])("funcional: sem-alteracao com head = %s, sem nenhum enviado → FALHA evidencia-invalida:revisao", (_nome, head) => {
    const c = cenario();
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), head: head(c.raiz) }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:revisao" });
  });

  it("funcional: o igual marcado enviado sem a chamada da CLI → FALHA (enviado exige a CLI e a reconciliação)", () => {
    const c = cenario();
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Ev;
    ev.arquivos["src/a.js"] = { ...(ev.arquivos["src/a.js"] as Arquivo), revisao: "enviado" };
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
  });

  it("funcional: repositório sem commit → enviado (não há partida)", () => {
    const c = cenario();
    const raiz = temp("expx-revisao-sem-commit-");
    git(raiz, "init", "-q", "-b", "main");
    escreve(raiz, "src/n.js", "n\n");
    expect(revisar({ ...c, raiz }, "src/n.js")).toMatchObject({ rc: 0, ev: { arquivos: { "src/n.js": { revisao: "enviado" } } } });
  });

  it("funcional: com core.autocrlf=true, o checkout em CRLF igual ao HEAD normalizado → sem-alteracao, sem a CLI", () => {
    const c = cenario({}, "true");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nl3\r\nl4\r\nl5\r\n");
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { arquivos: { "src/a.js": { revisao: "sem-alteracao" } } } });
    naoChamou(r);
  });

  it("funcional: excluído do núcleo e igual à partida continua excluido; L1 conta só os enviados", () => {
    const c = cenario({ resposta: resp() });
    escreve(c.raiz, "docs/sprintx/x.md", "x\n");
    for (let i = 0; i < 40; i++) escreve(c.raiz, `src/f${i}.js`, `${i}\n`);
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "mais");
    altera3(c.raiz);
    const lista = ["src/a.js", "docs/sprintx/x.md", ...Array.from({ length: 40 }, (_, i) => `src/f${i}.js`)];
    const r = revisar(c, lista.join(","));
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "docs/sprintx/x.md": { revisao: "excluido" }, "src/f0.js": { revisao: "sem-alteracao" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: o listar lê a evidência com sem-alteracao como as outras", () => {
    const c = cenario();
    revisar(c, "src/a.js");
    const r = roda(c.raiz, "listar", "--task", `T-01=${commita(c.raiz, true)}`);
    expect(r.rc).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ tasks: [{ task: "T-01", listagem: "ok", resultado: "ok" }] });
  });

  it("funcional: arquivo editado entre o revisar (sem-alteracao) e o commit → FALHA evidencia-nao-bate", () => {
    const c = cenario();
    revisar(c, "src/a.js");
    altera3(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/a.js" });
  });
});

// Código só movido (Login, ui-react-046: um teste dividido em dois arquivos): o trecho que a task removeu de um arquivo
// seu e pôs noutro, igual byte a byte, não é linha alterada (`derivacao: 2`). O achado nele vira `anterior`.
describe("expx-revisao.mjs: código só movido (derivacao 2)", () => {
  const TESTE = 'const a = require("a");\ndescribe("x", () => {\n  it("um", () => {\n    expect(soma(1, 2)).toBe(3);\n  });\n'
    + '  it("dois", () => {\n    expect(soma(2, 2)).toBe(4);\n  });\n});\n';
  const SEM_DOIS = 'const a = require("a");\ndescribe("x", () => {\n  it("um", () => {\n    expect(soma(1, 2)).toBe(3);\n  });\n});\n';
  const PARTE2 = 'import { soma } from "./soma";\ndescribe("y", () => {\n  it("dois", () => {\n    expect(soma(2, 2)).toBe(4);\n  });\n});\n';
  /** Commita `antes`, aplica `depois` (`null` apaga) e revisa os caminhos de `depois` com as `issues` dadas. */
  function movido(antes: Record<string, string>, depois: Record<string, string | null>, issues: object[], mais: string[] = []) {
    const c = cenario({ issues });
    for (const [f, t] of Object.entries(antes)) escreve(c.raiz, f, t);
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "antes");
    const base = git(c.raiz, "rev-parse", "HEAD");
    for (const [f, t] of Object.entries(depois)) if (t === null) rmSync(join(c.raiz, f)); else escreve(c.raiz, f, t);
    if (mais.includes("--base-commit")) { git(c.raiz, "add", "-A"); git(c.raiz, "commit", "-q", "-m", "task"); }
    const r = revisar(c, Object.keys(depois).join(","), "T-01", undefined, {}, c.script, mais.includes("--base-commit") ? ["--base-commit", base] : []);
    return { c, r, estados: r.ev.achados.map((a) => `${a.arquivo}:${a.linha}=${a.estado}`) };
  }

  it("funcional: teste dividido em dois arquivos → o trecho movido é anterior, a linha nova é aberta; o conferir refaz igual", () => {
    const { c, r, estados } = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 },
      [achado("src/t2.js", 4), achado("src/t2.js", 1)]);
    expect(estados).toEqual(["src/t2.js:4=anterior", "src/t2.js:1=aberto"]);
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", derivacao: 3 } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it("funcional: só o achado no trecho movido → ok, e o conferir aceita (com --base-commit também)", () => {
    for (const mais of [[], ["--base-commit"]]) {
      const { c, r, estados } = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, [achado("src/t2.js", 4)], mais);
      expect(estados).toEqual(["src/t2.js:4=anterior"]);
      expect(r.rc).toBe(0);
      expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    }
  });

  it("funcional: arquivo de origem apagado pela task também paga o movimento", () => {
    const { estados } = movido({ "src/t.js": TESTE }, { "src/t.js": null, "src/t2.js": TESTE }, [achado("src/t2.js", 7)]);
    expect(estados).toEqual(["src/t2.js:7=anterior"]);
  });

  it("funcional: cópia (o trecho continua na origem) não recebe crédito", () => {
    const { estados } = movido({ "src/t.js": TESTE }, { "src/t.js": TESTE.replace("um", "um!"), "src/t2.js": PARTE2 }, [achado("src/t2.js", 4)]);
    expect(estados).toEqual(["src/t2.js:4=aberto"]);
  });

  it("funcional: uma linha removida paga uma adição só; uma linha substantiva basta", () => {
    const { estados } = movido({ "src/m.js": "l1\nl2\nl3\nl4\nl5\n" }, { "src/m.js": "l1\nl2\nl4\nl5\n", "src/b.js": "x9\nl3\nl3\n" },
      [achado("src/b.js", 3), achado("src/b.js", 2), achado("src/b.js", 1)]);
    expect(estados).toEqual(["src/b.js:3=aberto", "src/b.js:2=anterior", "src/b.js:1=aberto"]);
  });

  it("funcional: linha movida com espaço no fim, só pontuação ou só import não recebe crédito", () => {
    const { estados } = movido({ "src/a.js": 'l1\nl2\nl3\n});\nimport { z } from "z";\nl6\n' },
      { "src/a.js": "l1\nl2\nl6\n", "src/b.js": 'l3 \n});\nimport { z } from "z";\n' },
      [achado("src/b.js", 1), achado("src/b.js", 2), achado("src/b.js", 3)]);
    expect(estados).toEqual(["src/b.js:1=aberto", "src/b.js:2=aberto", "src/b.js:3=aberto"]);
  });

  it("funcional: o fim de linha conta: `foo` sem \\n no fim não paga `foo\\n`", () => {
    const sem = movido({ "src/d.js": "foo" }, { "src/d.js": null, "src/e.js": "foo\n" }, [achado("src/e.js", 1)]);
    const com = movido({ "src/d.js": "foo\n" }, { "src/d.js": null, "src/e.js": "foo\n" }, [achado("src/e.js", 1)]);
    expect([sem.estados, com.estados]).toEqual([["src/e.js:1=aberto"], ["src/e.js:1=anterior"]]);
  });

  it("funcional: o maior trecho primeiro (A B }); X A B → destinos A B e A B });): os cinco recebem crédito", () => {
    const { estados } = movido({ "src/f.js": "A1\nB1\n});\nX1\nA1\nB1\n" }, { "src/f.js": null, "src/g.js": "A1\nB1\nY9\nA1\nB1\n});\n" },
      [1, 2, 3, 4, 5, 6].map((l) => achado("src/g.js", l)));
    expect(estados).toEqual(["src/g.js:1=anterior", "src/g.js:2=anterior", "src/g.js:3=aberto", "src/g.js:4=anterior", "src/g.js:5=anterior", "src/g.js:6=anterior"]);
  });

  it("funcional: com os dois lados no git, o `\\ No newline` e o conteúdo que começa com --- e +++ são lidos certo", () => {
    const { estados } = movido({ "src/p.js": "keep\n--- separador\n+++ mais\nfim", "src/q.js": "x\n" },
      { "src/p.js": "keep\n", "src/q.js": "x\n--- separador\n+++ mais\nfim\n" }, [2, 3, 4].map((l) => achado("src/q.js", l)));
    expect(estados).toEqual(["src/q.js:2=anterior", "src/q.js:3=anterior", "src/q.js:4=aberto"]);
  });

  it("funcional: a origem não revisável declarada na task paga o movimento", () => {
    const { estados } = movido({ "package-lock.json": "{}\nsegredo1 = calcula(1);\n" },
      { "package-lock.json": "{}\n", "src/b.js": "segredo1 = calcula(1);\n" }, [achado("src/b.js", 1)]);
    expect(estados).toEqual(["src/b.js:1=anterior"]);
  });

  it("funcional: a origem acima de 1 MiB, com os dois lados no git, não paga nada", () => {
    const enchimento = "y\n".repeat(600_000);
    const { estados } = movido({ "package-lock.json": `${enchimento}segredo1 = calcula(1);\n` },
      { "package-lock.json": enchimento, "src/b.js": "segredo1 = calcula(1);\n" }, [achado("src/b.js", 1)]);
    expect(estados).toEqual(["src/b.js:1=aberto"]);
  });

  it("funcional: mais de 1.000.000 de linhas nos diffs (blobs antigos grandes, cada um abaixo de 1 MiB) → nenhum crédito", () => {
    const grande = "y\n".repeat(500_001);
    const { estados } = movido({ "src/g1.txt": grande, "src/g2.txt": grande, "src/m.js": "l1\nsegredo1 = calcula(1);\n" },
      { "src/g1.txt": null, "src/g2.txt": null, "src/m.js": "l1\n", "src/b.js": "segredo1 = calcula(1);\n" }, [achado("src/b.js", 1)]);
    expect(estados).toEqual(["src/b.js:1=aberto"]);
  });

  it("funcional: `objeto = require(...)` sozinho não prova movimento", () => {
    const { estados } = movido({ "src/m.js": 'l1\nobjeto = require("x");\nl3\n' },
      { "src/m.js": "l1\nl3\n", "src/b.js": 'objeto = require("x");\n' }, [achado("src/b.js", 1)]);
    expect(estados).toEqual(["src/b.js:1=aberto"]);
  });

  it("funcional: repositório sem commit → nada a pagar, o arquivo novo inteiro alterado", () => {
    const c = cenario({ issues: [achado("src/n.js", 1)] });
    const raiz = temp("expx-revisao-sem-commit-");
    git(raiz, "init", "-q", "-b", "main");
    escreve(raiz, "src/n.js", "n = 1;\n");
    expect(revisar({ ...c, raiz }, "src/n.js")).toMatchObject({ rc: 1, ev: { derivacao: 3, achados: [{ estado: "aberto" }] } });
  });

  it("funcional: evidência sem derivacao, que a regra 1 deriva igual, é aceita pelo conferir", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as Record<string, unknown>;
    delete ev["derivacao"];
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: a ordem das issues não muda o estado de nenhuma", () => {
    const issues = [1, 2, 3, 4, 5, 6].map((l) => achado("src/t2.js", l));
    const ida = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, issues).estados;
    const volta = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, [...issues].reverse()).estados;
    expect([...volta].reverse()).toEqual(ida);
  });

  it.each([
    ["4", 4],
    ["o texto \"2\"", "2"],
  ])("funcional: derivacao %s → FALHA evidencia-invalida:derivacao", (_nome, valor) => {
    const { c } = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, [achado("src/t2.js", 4)]);
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), derivacao: valor }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:derivacao" });
  });

  it("funcional: evidência sem derivacao é a regra 1 (o arquivo novo inteiro alterado): o anterior gravado diverge", () => {
    const { c } = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, [achado("src/t2.js", 4)]);
    const ev = evidencia(c.raiz) as Record<string, unknown>;
    delete ev["derivacao"];
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:achados" });
  });

  it("funcional: evidência com derivacao 1 e o achado aberto (regra antiga) continua conferível", () => {
    const { c } = movido({ "src/t.js": TESTE }, { "src/t.js": SEM_DOIS, "src/t2.js": PARTE2 }, [achado("src/t2.js", 4)]);
    const ev = evidencia(c.raiz) as Ev;
    escreve(c.raiz, EV, JSON.stringify({ ...ev, derivacao: 1, resultado: "achados", achados: ev.achados.map((a) => ({ ...a, estado: "aberto" })) }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });
});

describe("expx-revisao.mjs conferir e rejeitar", () => {
  it("funcional: evidência ok que bate com o commit passa; desligada aceita tudo", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    expect(conferir(c.raiz, "desligada", `T-09=${sha}`)).toMatchObject({ rc: 0, out: "T-09 ok" });
  });

  it("funcional: evidência ausente é FALHA em obrigatoria e AVISO em se_disponivel; commit inexistente é sempre FALHA", () => {
    const c = cenario();
    const sha = git(c.raiz, "rev-parse", "HEAD");
    expect(conferir(c.raiz, "obrigatoria", `T-09=${sha}`)).toMatchObject({ rc: 1, out: "T-09 FALHA evidencia-ausente" });
    expect(conferir(c.raiz, "se_disponivel", `T-09=${sha}`)).toMatchObject({ rc: 3, out: "T-09 AVISO evidencia-ausente" });
    expect(conferir(c.raiz, "se_disponivel", `T-09=${"0".repeat(40)}`)).toMatchObject({ rc: 1, out: `T-09 FALHA commit-inexistente:${"0".repeat(40)}` });
  });

  it("funcional: a evidência vale como está no commit, não como está no disco", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const sha = commita(c.raiz);
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it.each([
    ["arquivos nulo", { arquivos: null }],
    ["arquivos vazio", { arquivos: {} }],
    ["achados ausente", { achados: undefined }],
    ["resultado achados sem achado aberto", { resultado: "achados" }],
    ["achado nulo", { achados: [null] }],
    ["achado com estado desconhecido", { achados: [{ identidade: "a".repeat(64), arquivo: "src/a.js", linha: 1, estado: "aceito" }] }],
  ])("funcional: evidência malformada (%s) é FALHA, nunca ok", (_nome, troca) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), ...troca }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: expect.stringMatching(/^T-01 FALHA /) });
  });

  it.each([
    ["sem cli", { cli: undefined }, "cli.versao"],
    ["cli.versao nula", { cli: { versao: null } }, "cli.versao"],
    ["cli.versao abaixo da mínima", { cli: { versao: "0.5.13" } }, "cli.versao"],
    ["cli.versao que não é semver", { cli: { versao: "0.5" } }, "cli.versao"],
    ["cli.versao com zero à esquerda", { cli: { versao: "00.5.14" } }, "cli.versao"],
    ["cli.versao com zero à esquerda no patch", { cli: { versao: "0.5.014" } }, "cli.versao"],
    ["sem executada_em", { executada_em: undefined }, "executada_em"],
    ["executada_em que não é ISO 8601", { executada_em: "ontem" }, "executada_em"],
    ["executada_em em data impossível", { executada_em: "2026-02-30T10:00:00Z" }, "executada_em"],
    ["executada_em em hora impossível", { executada_em: "2026-02-10T24:30:00Z" }, "executada_em"],
    ["chamada nula com arquivo enviado", { chamada: null }, "chamada"],
    ["sem chamada", { chamada: undefined }, "chamada"],
  ])("funcional: ok sem sinal de que a CLI rodou (%s) é FALHA evidencia-invalida nomeando o campo", (_nome, troca, campo) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), ...troca }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: `T-01 FALHA evidencia-invalida:${campo}` });
  });

  it("funcional: achados sem cli.versao, ou com versão acima da homologada, é evidencia-invalida", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as object;
    escreve(c.raiz, EV, JSON.stringify({ ...ev, cli: {} }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
    escreve(c.raiz, EV, JSON.stringify({ ...ev, cli: { versao: "0.10.0", integridade: "conferida" } }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cli.versao" });
  });

  it("funcional: indisponivel não exige cli.versao, executada_em nem chamada", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01", dirname(noPath("git") ?? ""));
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", motivo: "cli-ausente+codex-ausente", cli: null, chamada: null });
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), executada_em: undefined }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:cli-ausente+codex-ausente" });
  });

  it("funcional: indisponivel é FALHA em obrigatoria e AVISO em se_disponivel", () => {
    const c = cenario({ error: "falhou" });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA indisponivel:erro+codex-ausente" });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:erro+codex-ausente" });
  });

  it("funcional: achado aberto reprova; rejeitar um achado aberto faz conferir passar", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "f".repeat(64), "--motivo", "fp").rc).toBe(1);
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "falso positivo").rc).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", achados: [{ estado: "rejeitado" }], rejeicoes: [{ identidade: id, motivo: "falso positivo" }] });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: arquivo da task que mudou depois do revisar → rejeitar recusa (sai 1), nomeia o arquivo e não grava", () => {
    for (const mais of [[], ["--base-commit"]]) {
      const c = cenario({ issues: [achado("src/a.js", 3)] });
      const base = git(c.raiz, "rev-parse", "HEAD");
      altera3(c.raiz);
      if (mais.length) { git(c.raiz, "add", "-A"); git(c.raiz, "commit", "-q", "-m", "task"); }
      const id = revisar(c, "src/a.js", "T-01", undefined, {}, c.script, mais.length ? ["--base-commit", base] : []).ev.achados[0]?.identidade ?? "";
      expect(id).not.toBe("");
      const antes = evidencia(c.raiz);
      escreve(c.raiz, "src/a.js", "l1\nl2\nnovo3 editado\nl4\nl5\n");
      const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
      expect([r.rc, r.err.includes("evidencia desatualizada: src/a.js")]).toEqual([1, true]);
      expect(evidencia(c.raiz)).toEqual(antes);
    }
  });

  it("funcional: arquivo dado por removido na revisão e que voltou → rejeitar recusa", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    escreve(c.raiz, "src/b.js", "b1\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "b");
    rmSync(join(c.raiz, "src/b.js"));
    altera3(c.raiz);
    const id = revisar(c, "src/a.js,src/b.js").ev.achados[0]?.identidade ?? "";
    expect(id).not.toBe("");
    escreve(c.raiz, "src/b.js", "b1\n");
    const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
    expect([r.rc, r.err.includes("evidencia desatualizada: src/b.js")]).toEqual([1, true]);
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, o removido que voltou como link quebrado → rejeitar recusa (Codex)", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    escreve(c.raiz, "src/b.js", "b1\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "b");
    rmSync(join(c.raiz, "src/b.js"));
    altera3(c.raiz);
    const id = revisar(c, "src/a.js,src/b.js").ev.achados[0]?.identidade ?? "";
    expect(id).not.toBe("");
    symlinkSync("nao-existe.js", join(c.raiz, "src/b.js"));
    const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
    expect([r.rc, r.err.includes("evidencia desatualizada: src/b.js")]).toEqual([1, true]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("funcional: fora do Windows, removido que não se pode ver (pasta sem permissão) não conta como ausente → rejeitar recusa (CodeAnt)", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    escreve(c.raiz, "d/b.js", "b1\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "b");
    rmSync(join(c.raiz, "d/b.js"));
    altera3(c.raiz);
    const id = revisar(c, "src/a.js,d/b.js").ev.achados[0]?.identidade ?? "";
    expect(id).not.toBe("");
    escreve(c.raiz, "d/b.js", "b1\n");
    chmodSync(join(c.raiz, "d"), 0o000);
    try {
      const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
      expect([r.rc, r.err.includes("evidencia desatualizada: d/b.js")]).toEqual([1, true]);
    } finally { chmodSync(join(c.raiz, "d"), 0o755); }
  });

  it("funcional: rejeitar entre a releitura e a gravação do revisar não se perde (trava por evidência)", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const dir = temp("expx-pausa-");
    const filho = (a: string[], env?: NodeJS.ProcessEnv) => new Promise<number | null>((ok) =>
      spawn(process.execPath, [c.script, ...a, "--trabalho", "w", "--raiz", c.raiz], { env, stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const rev = filho(["revisar", "--task", "T-01", "--arquivos", "src/a.js"], ambienteCom(`${c.falsa.path}${delimiter}${PATH}`, { EXPX_REVISAO_TESTE_PAUSA: dir }));
    for (const ate = Date.now() + 20000; !existsSync(join(dir, "pronto")) && Date.now() < ate;) await espera(50);
    const rej = filho(["rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp"]);
    await espera(1500); // sem a trava, o rejeitar grava aqui, com o revisar parado, e o revisar o apaga
    writeFileSync(join(dir, "continuar"), "");
    expect([await rev, await rej]).toEqual([1, 0]);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: arquivo da task que muda entre a conferência e a gravação do rejeitar → sai 1 e a evidência fica como estava (CodeAnt no katosmv/login#79)", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const antes = readFileSync(join(c.raiz, EV), "utf8");
    const dir = temp("expx-pausa-");
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    const rej = new Promise<number | null>((ok) => spawn(process.execPath,
      [c.script, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp", "--trabalho", "w", "--raiz", c.raiz],
      { env: { ...process.env, EXPX_REVISAO_TESTE_PAUSA: dir }, stdio: "ignore" }).on("close", ok));
    for (const ate = Date.now() + 20000; !existsSync(join(dir, "pronto")) && Date.now() < ate;) await espera(50);
    escreve(c.raiz, "src/a.js", "l1\nl2\nnovo3 editado\nl4\nl5\n");
    writeFileSync(join(dir, "continuar"), "");
    expect(await rej).toBe(1);
    expect(readFileSync(join(c.raiz, EV), "utf8")).toBe(antes);
  });

  it("funcional: trava velha de processo vivo não é removida por idade", async () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava);
    writeFileSync(join(trava, "dono.json"), JSON.stringify({ pid: process.pid, token: "viva" }));
    utimesSync(trava, new Date(0), new Date(0));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    let fechou = false;
    const rej = new Promise<number | null>((ok) => spawn(process.execPath,
      [c.script, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp", "--trabalho", "w", "--raiz", c.raiz],
      { stdio: "ignore" }).on("close", (rc) => { fechou = true; ok(rc); }));
    await espera(1200);
    expect([existsSync(trava), fechou]).toEqual([true, false]);
    rmSync(trava, { recursive: true });
    expect(await rej).toBe(0);
  });

  it("funcional: trava velha com dono comprovadamente morto é recuperada", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava);
    writeFileSync(join(trava, "dono.json"), JSON.stringify({ pid: 2147483647, token: "morta" }));
    utimesSync(trava, new Date(0), new Date(0));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp").rc).toBe(0);
    expect(existsSync(trava)).toBe(false);
  });

  it("funcional: .quebra velha nunca é removida sozinha: sai 75 nomeando-a, e a trava fica", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    const trava = join(c.raiz, `${EV}.trava`);
    for (const d of [trava, `${trava}.quebra`]) { mkdirSync(d); utimesSync(d, new Date(0), new Date(0)); } // morreu ao quebrar
    const r = roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", id, "--motivo", "fp");
    expect(r).toMatchObject({ rc: 75, err: expect.stringContaining(`${trava}.quebra`) });
    expect([existsSync(trava), existsSync(`${trava}.quebra`)]).toEqual([true, true]);
  }, 60000);

  it("funcional: rejeitar não muda o resultado de indisponivel", () => {
    const c = cenario();
    escreve(c.raiz, EV, JSON.stringify({ expx_revisao: 1, trabalho: "w", task: "T-01", resultado: "indisponivel", motivo: "erro",
      arquivos: {}, achados: [{ identidade: "a".repeat(64), estado: "aberto" }], rejeicoes: [] }));
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp").rc).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: evidência que não bate com o commit reprova nomeando o arquivo", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, "src/a.js", "editado depois da revisao\n");
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/a.js" });
  });

  it("funcional: arquivo removido na evidência: aceito se o commit o remove, FALHA se o commit o tem", () => {
    const c = cenario();
    rmSync(join(c.raiz, "src/a.js"));
    revisar(c, "src/a.js");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-nao-bate:src/a.js" });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });
});
