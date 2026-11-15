// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
// Parte 1 de 4; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ambienteCom, noPath } from "../teste/candidatos.js";
import { arquivosDoCaso } from "../teste/conformidade.js";
import { configurarFalsa, type CfgFalsa } from "../teste/codeant-falsa.js";
import { suportaNomeComCaractereReservado, suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";
import { SCRIPT, criados, temp, git, escreve, cenario, PATH, revisar, resp, achado, identidade, rejeita, altera3, grava, poeCaso, doFixture, semCodeant, naoChamou, conferir, EV, evidencia, commita } from "../teste/expx-revisao-apoio.js";

afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });

describe("expx-revisao.mjs revisar: a CLI conferida", () => {
  it("funcional: a falsa com o perfil de teste revisa (ok); a evidência registra a versão e a integridade conferida", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", cli: { versao: "0.5.14", integridade: "conferida" } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: a falsa com o perfil real → indisponivel:integridade, nenhuma chamada de review", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, {}, SCRIPT);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "integridade+codex-ausente" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: arquivo do pacote editado depois da instalação → indisponivel:integridade, nenhuma chamada", () => {
    const c = cenario();
    altera3(c.raiz);
    writeFileSync(join(c.falsa.pacote, "README.md"), "trocado\n");
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "integridade+codex-ausente" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: versão 0.5.15 sem perfil → indisponivel:versao, nenhuma chamada", () => {
    const c = cenario({ versao: "0.5.15" });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "versao+codex-ausente" } });
    expect(r.chamadas).toEqual([]);
  });

  it("funcional: PATH sem codeant → indisponivel:cli-ausente", () => {
    const c = cenario();
    altera3(c.raiz);
    expect(revisar(c, "src/a.js", "T-01", dirname(noPath("git") ?? ""))).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "cli-ausente+codex-ausente" } });
  });

  it("funcional: a CLI roda pelo node no arquivo conferido, não pelo shim nem pelo link", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.registro).toHaveLength(1);
    expect(r.registro[0]?.shim).toBe(false);
    expect(r.registro[0]?.arquivo.toLowerCase()).toBe(realpathSync(c.falsa.bin).toLowerCase());
  });
});

describe("expx-revisao.mjs revisar", () => {
  // achado do CodeAnt no katosmv/login#73: a exceção saía 1, o código de `achados`, e a F6 e o E3 a liam como achado
  it("funcional: exceção não tratada no despacho sai 70 (erro interno), nunca 1, e não imprime a linha de resultado", () => {
    const arquivo = join(temp("expx-revisao-raiz-"), "nao-e-pasta");
    writeFileSync(arquivo, "");
    const r = spawnSync(process.execPath, [SCRIPT, "revisar", "--trabalho", "w", "--task", "T-01.01", "--arquivos", "a.js", "--raiz", arquivo],
      { encoding: "utf8" });
    expect(r.status).toBe(70);
    expect(r.stderr).toContain("expx-revisao: erro interno");
    expect(r.stdout).toBe("");
  });

  it("funcional: achado em linha alterada bloqueia", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.rc).toBe(1);
    expect(r.ev).toMatchObject({ resultado: "achados", achados: [{ arquivo: "src/a.js", linha: 3, estado: "aberto", identidade: identidade("security", "src/a.js", ["l2", "novo3", "l4"]) }] });
    expect(r.ev.arquivos["src/a.js"]?.blob).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: achado em linha não alterada é anterior e não bloqueia", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ linha: 1, estado: "anterior" }] } });
  });

  it("funcional: arquivo novo não rastreado: todas as linhas contam como alteradas", () => {
    const c = cenario({ issues: [achado("src/b.js", 2)] });
    escreve(c.raiz, "src/b.js", "b1\nb2\n");
    expect(revisar(c, "src/b.js")).toMatchObject({ rc: 1, ev: { achados: [{ estado: "aberto" }] } });
  });

  it("funcional: chama a CLI com --uncommitted --headless e --include dos arquivos da task; nunca com --fail-on", () => {
    const c = cenario();
    altera3(c.raiz);
    escreve(c.raiz, "src/b.js", "b\n");
    expect(revisar(c, "src/a.js,src/b.js").chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js,src/b.js"]]);
  });

  it.each([
    ["CLI ausente", {}, "cli-ausente"],
    ["versão abaixo de 0.5.14", { versao: "0.5.9" }, "versao"],
    ["error não nulo", { error: "falhou" }, "erro"],
  ])("funcional: %s → indisponivel (rc 2) com motivo", (nome, cfg, motivo) => {
    const c = cenario(cfg);
    altera3(c.raiz);
    // sem o Codex (o ausente do ambiente de teste), a escala também não revisa: os dois motivos
    expect(revisar(c, "src/a.js", "T-01", nome === "CLI ausente" ? dirname(noPath("git") ?? "") : undefined)).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: `${motivo}+codex-ausente` } });
  });

  it("funcional: --arquivos sem nenhum caminho (`,,`) é uso errado, nunca ok", () => {
    expect(revisar(cenario(), ",,")).toMatchObject({ rc: 64, ev: undefined });
  });

  it("funcional: HEAD sem commit (git diff HEAD falha): o arquivo no índice conta inteiro como alterado", () => {
    const c = cenario({ issues: [achado("src/a.js", 1)] });
    git(c.raiz, "update-ref", "-d", "refs/heads/main");
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 1, ev: { achados: [{ estado: "aberto" }] } });
  });

  it("funcional: vírgula no caminho → indisponivel com motivo caminho-com-virgula, sem revisão parcial", () => {
    const c = cenario();
    escreve(c.raiz, "src/a,b.js", "x\n");
    const r = revisar(c, "src/a,b.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "caminho-com-virgula" } });
    expect(r.chamadas.some((a) => a[0] === "review")).toBe(false);
  });

  it("funcional: espaço na ponta do caminho é parte do nome: nunca aparado (revisaria outro arquivo ou o daria por ausente)", () => {
    const c = cenario({ issues: [achado(" a.js", 1)] });
    escreve(c.raiz, " a.js", "x\n");
    const r = revisar(c, " a.js");
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: " a.js", estado: "aberto" }] } });
    expect(Object.keys(r.ev.arquivos)).toEqual([" a.js"]);
    expect(r.chamadas[0]).toEqual(["review", "--headless", "--uncommitted", "--include", " a.js"]);
  });

  it("funcional: --arquivos só com espaços é um caminho, não uso errado: ausente → indisponivel", () => {
    expect(revisar(cenario(), " ")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-inexistente: " } });
  });

  // no Windows um nome só de espaços não existe: o caso de o arquivo existir só cabe fora dele
  it.skipIf(process.platform === "win32")("funcional: fora do Windows, arquivo cujo nome é só espaços é revisado", () => {
    const c = cenario({ issues: [achado(" ", 1)] });
    escreve(c.raiz, " ", "x\n");
    expect(revisar(c, " ")).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: " ", estado: "aberto" }] } });
  });

  it("funcional: JSON precedido de avisos no stdout é lido", () => {
    const c = cenario({ avisos: "npm warn config {obsoleto}\nnpm notice nova versao\n", issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 1, ev: { resultado: "achados" } });
  });

  it("funcional: arquivo apagado não é revisado, fica null e entra em removidos_sem_revisao", () => {
    const c = cenario();
    rmSync(join(c.raiz, "src/a.js"));
    escreve(c.raiz, "src/b.js", "b\n");
    const r = revisar(c, "src/a.js,src/b.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["src/a.js"], arquivos: { "src/a.js": null } } });
    expect(r.chamadas[0]).toContain("src/b.js");
  });

  it("funcional: rejeição anterior com a mesma identidade vale nesta task", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-00", [identidade("security", "src/a.js", ["l2", "novo3", "l4"])]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: revisar de novo preserva as rejeições da própria task", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const id = revisar(c, "src/a.js").ev.achados[0]?.identidade ?? "";
    rejeita(c.raiz, "T-01", [id]);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: rejeição gravada (rejeitar) enquanto a CLI roda não se perde", () => {
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    const durante = JSON.stringify({ expx_revisao: 1, achados: [], rejeicoes: [{ identidade: id, motivo: "fp", em: "x" }] });
    const c = cenario();
    configurarFalsa(c.falsa, { issues: [achado("src/a.js", 3)], durante: [join(c.raiz, EV), durante] });
    altera3(c.raiz);
    rejeita(c.raiz, "T-00", []);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", rejeicoes: [{ identidade: id }], achados: [{ estado: "rejeitado" }] } });
  });

  it("funcional: rejeição de outra task gravada enquanto o revisar espera a trava não se perde", async () => {
    const id = identidade("security", "src/a.js", ["l2", "novo3", "l4"]);
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    const trava = join(c.raiz, `${EV}.trava`);
    mkdirSync(trava, { recursive: true }); // outro processo segura a evidência da T-01
    const ch = join(c.falsa.dir, "chamadas.jsonl");
    const rev = new Promise<number | null>((ok) => spawn(process.execPath, [c.script, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js", "--raiz", c.raiz],
      { env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`), stdio: "ignore" }).on("close", ok));
    const espera = async (ms: number) => new Promise((ok) => setTimeout(ok, ms));
    for (const ate = Date.now() + 20000; !(existsSync(ch) && readFileSync(ch, "utf8").includes("review")) && Date.now() < ate;) await espera(50);
    await espera(1500); // o revisar já classificou os achados e espera a trava
    rejeita(c.raiz, "T-00", [id]);
    rmSync(trava, { recursive: true });
    expect(await rev).toBe(0);
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "ok", achados: [{ estado: "rejeitado" }] });
  });

  it("funcional: linhas de texto idêntico com vizinhas diferentes têm identidades diferentes", () => {
    const c = cenario({ issues: [achado("src/b.js", 2), achado("src/b.js", 5)] });
    escreve(c.raiz, "src/b.js", "a\nx\nb\nc\nx\nd\n");
    const [um, dois] = revisar(c, "src/b.js").ev.achados;
    expect(um?.identidade).not.toBe(dois?.identidade);
    rejeita(c.raiz, "T-00", [um?.identidade ?? ""]);
    expect(revisar(c, "src/b.js").ev.achados.map((a) => a.estado)).toEqual(["rejeitado", "aberto"]);
  });

  it("funcional: CRLF no checkout (core.autocrlf=true): o blob da evidência é o do commit", () => {
    const c = cenario({}, "true");
    escreve(c.raiz, "src/a.js", "l1\r\nl2\r\nnovo3\r\n");
    const r = revisar(c, "src/a.js");
    git(c.raiz, "add", "src/a.js");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(r.ev.arquivos["src/a.js"]?.blob).toBe(git(c.raiz, "rev-parse", "HEAD:src/a.js"));
  });

  // no Windows `\` é separador e não cabe em nome de arquivo: o caso só existe fora dele
  it.skipIf(process.platform === "win32")("funcional: fora do Windows, `\\` é parte do nome: o arquivo é achado e o diff é o dele", () => {
    const f = "src/a\\b.js";
    const c = cenario({ issues: [achado(f, 3)] });
    escreve(c.raiz, f, "l1\nl2\nl3\nl4\nl5\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "com barra invertida");
    escreve(c.raiz, f, "l1\nl2\nnovo3\nl4\nl5\n");
    const r = revisar(c, f);
    expect(r).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ arquivo: f, linha: 3, estado: "aberto" }] } });
    expect(r.ev.arquivos[f]?.blob).toMatch(/^[0-9a-f]{40}$/);
  });

  it("funcional: o snapshot de processo morto sai na revisão seguinte; o que pode estar em uso ou não tem dono fica", () => {
    const c = cenario();
    altera3(c.raiz);
    const antigo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
    const velho = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    // PID alto demais para estar em uso: o de um filho encerrado o Windows reusa logo, e o dono pareceria vivo.
    const morto = 2 ** 31 - 4;
    const snapshot = (dono?: number, tempo?: number): string => {
      const base = mkdtempSync(join(tmpdir(), "expx-revisao-snapshot-"));
      // A ordem do `revisar`: o dono existe antes de o worktree ser registrado.
      if (dono !== undefined) writeFileSync(join(base, "dono"), String(dono));
      git(c.raiz, "worktree", "add", "-q", "--detach", join(base, "checkout"), "HEAD");
      if (tempo !== undefined) utimesSync(base, tempo, tempo);
      return base;
    };
    const saem = { morto: snapshot(morto), velho: snapshot(process.pid, velho) };
    const ficam = [snapshot(process.pid), snapshot(undefined)];
    // Sem `dono` válido não é deste script, em nenhuma idade, e o arquivo de quem o usa fica.
    const semProva = [snapshot(undefined, velho), snapshot(undefined, antigo)];
    const donoInvalido = mkdtempSync(join(tmpdir(), "expx-revisao-snapshot-"));
    writeFileSync(join(donoInvalido, "dono"), "x");
    git(c.raiz, "worktree", "add", "-q", "--detach", join(donoInvalido, "checkout"), "HEAD");
    utimesSync(donoInvalido, velho, velho);
    semProva.push(donoInvalido);
    for (const base of semProva) writeFileSync(join(base, "checkout", "de-alguem.txt"), "nao commitado\n");
    // Outro worktree do repositório nunca é assunto do `revisar`, mesmo antigo.
    const alheio = mkdtempSync(join(tmpdir(), "expx-worktree-alheio-"));
    git(c.raiz, "worktree", "add", "-q", "--detach", join(alheio, "checkout"), "HEAD");
    utimesSync(alheio, velho, velho);
    // Nome igual fora do temporário e snapshot travado: o Git recusa, e nada é apagado.
    const fora = join(mkdtempSync(join(tmpdir(), "expx-fora-")), "expx-revisao-snapshot-z");
    mkdirSync(fora);
    git(c.raiz, "worktree", "add", "-q", "--detach", join(fora, "checkout"), "HEAD");
    utimesSync(fora, velho, velho);
    const travado = snapshot(morto);
    git(c.raiz, "worktree", "lock", join(travado, "checkout"));
    try {
      expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
      const lista = git(c.raiz, "worktree", "list", "--porcelain");
      expect(Object.entries(saem).filter(([, base]) => existsSync(base)).map(([caso]) => caso)).toEqual([]);
      for (const base of Object.values(saem)) expect(lista).not.toContain(base.split(/[\\/]/).pop());
      for (const base of [...ficam, alheio, fora, travado]) expect(existsSync(join(base, "checkout")), base).toBe(true);
      for (const base of semProva) expect(readFileSync(join(base, "checkout", "de-alguem.txt"), "utf8"), base).toBe("nao commitado\n");
    } finally {
      git(c.raiz, "worktree", "unlock", join(travado, "checkout"));
      for (const base of [...Object.values(saem), ...ficam, ...semProva, alheio, dirname(fora), travado]) rmSync(base, { recursive: true, force: true });
      git(c.raiz, "worktree", "prune");
    }
  });

  it("funcional: a CLI só consegue reescrever o snapshot descartável, não o checkout", () => {
    const c = cenario({ reescreve: "src/a.js" });
    altera3(c.raiz);
    const original = readFileSync(join(c.raiz, "src/a.js"), "utf8");
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
    expect(readFileSync(join(c.raiz, "src/a.js"), "utf8")).toBe(original);
    expect(r.registro.find((x) => x.args[0] === "review")).toMatchObject({ conteudos: { "src/a.js": original } });
  });

  it("funcional: editar e restaurar o checkout durante a CLI não muda os bytes revisados", () => {
    const c = cenario();
    altera3(c.raiz);
    const original = readFileSync(join(c.raiz, "src/a.js"), "utf8");
    configurarFalsa(c.falsa, { oscilaOrigem: [join(c.raiz, "src/a.js"), "conteudo transitorio\n", original] });
    const r = revisar(c, "src/a.js");
    const chamada = r.registro.find((x) => x.args[0] === "review");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
    expect(readFileSync(join(c.raiz, "src/a.js"), "utf8")).toBe(original);
    expect(chamada?.cwd).not.toBe(c.raiz);
    expect(chamada?.conteudos["src/a.js"]).toBe(original);
  });

  it.each([
    [1, "arquivo-inexistente:src/a.js"],
    [2, "arquivo-mudou-durante-revisao"],
  ])("funcional: arquivo apagado entre o hash-object e o open da medida (open nº %i) → indisponivel:%s, com evidência", (n, motivo) => {
    const c = cenario();
    altera3(c.raiz);
    // o openSync do script apaga o arquivo antes de abri-lo na n-ésima vez: a troca entre a conferência e a leitura
    const pre = join(temp("expx-open-"), "pre.mjs");
    writeFileSync(pre, `import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const alvo = ${JSON.stringify(join(c.raiz, "src/a.js"))}, open = fs.openSync; let n = 0;
fs.openSync = (...a) => { if (String(a[0]) === alvo && ++n === ${n}) fs.rmSync(a[0]); return open(...a); };
syncBuiltinESMExports();
`);
    const r = spawnSync(process.execPath, ["--import", pathToFileURL(pre).href, c.script, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js",
      "--raiz", c.raiz], { encoding: "utf8", env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`, {}) });
    expect(existsSync(join(c.raiz, "src/a.js"))).toBe(false);
    expect({ rc: r.status, out: r.stdout }).toEqual({ rc: 2, out: `T-01 indisponivel:${motivo}\n` });
    expect(evidencia(c.raiz)).toMatchObject({ resultado: "indisponivel", motivo });
  });
});

describe("expx-revisao.mjs revisar v2: portões antes da CLI", () => {
  it("funcional: caminho de --arquivos fora da raiz (../ ou absoluto) é erro de uso; nada é lido, copiado nem apagado fora do checkout", () => {
    const c = cenario();
    const fora = temp("expx-fora-");
    const alvo = join(fora, "alvo.js");
    writeFileSync(alvo, "segredo\n");
    const relativo = `../${fora.split(/[\\/]/).pop() ?? ""}/alvo.js`;
    expect(existsSync(join(c.raiz, relativo)), "o caminho relativo alcança o arquivo de fora").toBe(true);
    for (const pedido of [relativo, `src/../${relativo}`, alvo, `src/a.js,${relativo}`]) {
      const r = revisar(c, pedido);
      expect(r.rc, pedido).toBe(64);
      expect(r.err, pedido).toContain("fora da raiz do projeto");
      expect(r.chamadas, pedido).toEqual([]);
      expect(r.ev, pedido).toBeUndefined();
    }
    expect(readFileSync(alvo, "utf8")).toBe("segredo\n");
  });

  // CodeAnt no expxdev#171: com `caminho(f, plataforma)`, o `.map(caminho)` passava o índice como plataforma, e no
  // Windows o `\` do pedido não virava `/`: o `..\` escapava da checagem da raiz
  it.runIf(process.platform === "win32")("funcional: no Windows, barra invertida no --arquivos: `..\\` é fora da raiz, e `src\\a.js` é `src/a.js` (expxdev#171)", () => {
    const c = cenario();
    const fora = temp("expx-fora-");
    writeFileSync(join(fora, "alvo.js"), "segredo\n");
    const r = revisar(c, `..\\${fora.split(/[\\/]/).pop() ?? ""}\\alvo.js`);
    expect([r.rc, r.err.includes("fora da raiz do projeto"), r.chamadas]).toEqual([64, true, []]);
    altera3(c.raiz);
    expect(Object.keys(revisar(c, "src\\a.js").ev.arquivos)).toEqual(["src/a.js"]);
  });

  const comLink = suportaSymlinkDeDiretorio();
  it.skipIf(!comLink)(`funcional: caminho que atravessa diretório-link para fora da raiz é erro de uso${comLink ? "" : " [pulado: sem link de diretório]"}`, () => {
    const c = cenario();
    const fora = temp("expx-fora-link-");
    writeFileSync(join(fora, "alvo.js"), "segredo\n");
    symlinkSync(fora, join(c.raiz, "link"), "dir");
    const r = revisar(c, "link/alvo.js");
    expect(r).toMatchObject({ rc: 64, chamadas: [] });
    expect(r.err).toContain("fora da raiz do projeto: link/alvo.js");
    expect(readFileSync(join(fora, "alvo.js"), "utf8")).toBe("segredo\n");
  });

  // `C:foo.js` só é caminho de drive no Windows; no POSIX é nome de arquivo e é revisado.
  const comNome = process.platform !== "win32" && suportaNomeComCaractereReservado();
  it.skipIf(!comNome)(`funcional: no POSIX, \`C:foo.js\` é nome de arquivo e é revisado${comNome ? "" : " [pulado: Windows]"}`, () => {
    const c = cenario();
    escreve(c.raiz, "C:foo.js", "l1\n");
    const r = revisar(c, "C:foo.js");
    expect(r.rc).not.toBe(64);
    expect(r.ev.arquivos["C:foo.js"]).toMatchObject({ revisao: "enviado" });
  });

  it("funcional: limite40.json: 40 revisáveis, com 5.000 linhas sem quebra final e 204.800 bytes → ok; uma chamada com os 40", () => {
    const c = cenario({ fixture: "limite40" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite40"));
    const r = revisar(c, nomes.join(","));
    expect(r).toMatchObject({ rc: 0, out: "T-01 ok\n", ev: { expx_revisao: 2, resultado: "ok", modo: "uncommitted", base_commit: null,
      cli: { versao: "0.5.14", integridade: "conferida" } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", nomes.join(",")]]);
    expect(r.ev.arquivos["linhas-5000.js"]).toMatchObject({ linhas: 5000, revisao: "enviado", blob: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(r.ev.arquivos["bytes-204800.js"]).toMatchObject({ bytes: 204800, linhas: 101, revisao: "enviado" });
    expect(r.ev.chamada).toMatchObject({ include: nomes, error: null, falhas_de_lote: [], meta: { max_files: 40, total_changed: 40 } });
  });

  it("funcional: 41 revisáveis → incompleta:L1:41 (rc 3), sem chamar a CLI; sem codeant no PATH, também rc 3, nunca 2", () => {
    const c = cenario();
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41"));
    const r = revisar(c, nomes.join(","));
    expect(r).toMatchObject({ rc: 3, out: "T-01 incompleta:L1:41\n", ev: { resultado: "incompleta", motivo: "L1:41", cli: null, chamada: null } });
    naoChamou(r);
    expect(revisar(c, nomes.join(","), "T-01", semCodeant())).toMatchObject({ rc: 3, ev: { motivo: "L1:41" } });
  });

  it("funcional: 5.000 linhas com quebra final → incompleta:L2:<f>, sem chamar a CLI", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["linhas-5000-quebra-final.js"]);
    const r = revisar(c, "src/a.js,linhas-5000-quebra-final.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:linhas-5000-quebra-final.js" } });
    expect(r.ev.arquivos["linhas-5000-quebra-final.js"]).toMatchObject({ linhas: 5001, revisao: "enviado" });
    naoChamou(r);
  });

  it("funcional: 204.801 bytes → incompleta:L2:<f>", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["bytes-204801.js"]);
    expect(revisar(c, "bytes-204801.js")).toMatchObject({ rc: 3, ev: { motivo: "L2:bytes-204801.js" } });
  });

  it("funcional: CRLF no checkout acima de 204.800 bytes com o blob abaixo → incompleta:L2 (vale o maior)", () => {
    const c = cenario({}, "true");
    const linha = `${"x".repeat(98)}\r\n`;
    grava(c.raiz, "src/grande.js", Buffer.from(linha.repeat(2060)));
    const r = revisar(c, "src/grande.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:src/grande.js" } });
    expect(r.ev.arquivos["src/grande.js"]).toMatchObject({ bytes: 2060 * 100, linhas: 2061 });
    expect(Number(git(c.raiz, "cat-file", "-s", r.ev.arquivos["src/grande.js"]?.blob ?? ""))).toBe(2060 * 99);
  });

  it("funcional: acima da leitura máxima (1 MiB), nem blob nem checkout são lidos → incompleta:L2, bytes do tamanho e linhas null", () => {
    const c = cenario();
    escreve(c.raiz, "src/enorme.js", "x\n".repeat(512 * 1024) + "x");
    const r = revisar(c, "src/enorme.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "L2:src/enorme.js" } });
    expect(r.ev.arquivos["src/enorme.js"]).toMatchObject({ bytes: 1024 * 1024 + 1, linhas: null, revisao: "enviado" });
    naoChamou(r);
  });

  it("funcional: notas.md, manual.pdf, logo.png, package-lock.json e apagado.js → --include só notas.md; a resposta da CLI para eles → ok", () => {
    const tarefa = ["notas.md", "manual.pdf", "logo.png", "package-lock.json", "apagado.js"];
    const c = cenario({ resposta: doFixture("pulos", (f) => tarefa.includes(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), tarefa);
    const r = revisar(c, tarefa.join(","));
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["apagado.js"], arquivos: { "apagado.js": null,
      "notas.md": { revisao: "enviado" }, "manual.pdf": { revisao: "nao-revisavel" }, "logo.png": { revisao: "nao-revisavel" },
      "package-lock.json": { revisao: "nao-revisavel" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "notas.md"]]);
  });

  it("funcional: sem arquivo revisável → ok sem localizar nem chamar a CLI (cli e chamada nulos)", () => {
    const c = cenario();
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["manual.pdf"]);
    const r = revisar(c, "manual.pdf", "T-01", semCodeant());
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", cli: null, chamada: null } });
    naoChamou(r);
  });

  it("funcional: arquivo da task em excluir_da_revisao do projeto → incompleta:excluido-declarado:<f>", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    escreve(c.raiz, "gerado/saida.js", "x\n");
    const r = revisar(c, "src/a.js,gerado/saida.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "excluido-declarado:gerado/saida.js" } });
    naoChamou(r);
  });

  it("funcional: arquivo da task em ^docs/entregas/ fica fora do --include, revisao excluido, e não bloqueia", () => {
    const c = cenario();
    altera3(c.raiz);
    escreve(c.raiz, "docs/entregas/w/ENTREGA.md", "# entrega\n");
    const r = revisar(c, "src/a.js,docs/entregas/w/ENTREGA.md");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", arquivos: { "docs/entregas/w/ENTREGA.md": { revisao: "excluido" } } } });
    expect(r.chamadas).toEqual([["review", "--headless", "--uncommitted", "--include", "src/a.js"]]);
  });

  it("funcional: arquivo apagado em pasta excluída pelo projeto não bloqueia", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 2, excluir_da_revisao: [
      { padrao: "^gerado/", classe: "gerado", origem: "scripts/gera.sh", motivo: "saída do gerador" }] }));
    poeCaso(c.raiz, new Map([["gerado/velho.js", null]]));
    altera3(c.raiz);
    expect(revisar(c, "src/a.js,gerado/velho.js")).toMatchObject({ rc: 0, ev: { resultado: "ok", removidos_sem_revisao: ["gerado/velho.js"] } });
  });

  it("funcional: .expx/fatiamento.json inválido → indisponivel:fatiamento-invalido, sem chamar a CLI", () => {
    const c = cenario();
    escreve(c.raiz, ".expx/fatiamento.json", JSON.stringify({ expx_fatiamento: 1 }));
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "fatiamento-invalido" } });
    naoChamou(r);
  });

  it("funcional: FATIA_X no ambiente → rc 64 com a mensagem, sem evidência, nos quatro subcomandos", () => {
    const c = cenario();
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", undefined, { FATIA_X: "" });
    expect(r).toMatchObject({ rc: 64, ev: undefined });
    expect(r.err).toContain("`FATIA_X` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente");
    naoChamou(r);
    const env = ambienteCom(PATH, { FATIA_X: "1" });
    for (const a of [["conferir", "--modo", "obrigatoria", "--task", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`],
      ["rejeitar", "--task", "T-01", "--identidade", "a".repeat(64), "--motivo", "fp"], ["listar", "--task", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`]]) {
      const s = spawnSync(process.execPath, [c.script, ...a, "--trabalho", "w", "--raiz", c.raiz], { encoding: "utf8", env });
      expect([s.status, s.stderr.includes("`FATIA_X` não é mais lida")]).toEqual([64, true]);
    }
  });
});

describe("expx-revisao.mjs revisar v2: depois da CLI", () => {
  it("funcional: limite41.json servido a uma task com f01–f40 → incompleta:sobra:f41.js", () => {
    const c = cenario({ fixture: "limite41" });
    const nomes = poeCaso(c.raiz, arquivosDoCaso("limite41")).slice(0, 40);
    expect(revisar(c, nomes.join(","))).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "sobra:f41.js" } });
  });

  it("funcional: pulos.json inteiro servido à task de notas.md → incompleta:sobra:bytes-204801.js", () => {
    const c = cenario({ fixture: "pulos" });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["notas.md"]);
    expect(revisar(c, "notas.md")).toMatchObject({ rc: 3, ev: { motivo: "sobra:bytes-204801.js" } });
  });

  it("funcional: pulos-uncommitted.json (noFiles), sem as entradas de tamanho, servido à task de notas.md → incompleta:faltante:notas.md", () => {
    const c = cenario({ resposta: doFixture("pulos-uncommitted", (f) => !/^(bytes|linhas)-/.test(f)) });
    poeCaso(c.raiz, arquivosDoCaso("pulos"), ["notas.md"]);
    expect(revisar(c, "notas.md")).toMatchObject({ rc: 3, ev: { motivo: "faltante:notas.md" } });
  });

  it.each([
    ["JSON limpo", {}],
    ["error não nulo", { error: "falhou" }],
  ])("funcional: stderr com \"[error] Failed to review\" e %s → incompleta:lote-falhou (rc 3)", (_nome, topo) => {
    const c = cenario({ stderr: "aviso qualquer\n[error] Failed to review src/a.js: 500\n", resposta: resp({}, topo) });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou",
      chamada: { falhas_de_lote: ["[error] Failed to review src/a.js: 500"] } } });
  });

  it.each([
    ["o Rejector falhou", "[error] Rejector failed for batch 2: HTTP error 413"],
    ["a resposta do Rejector não foi entendida", "Warning: parsing error in rejector response"],
    ["outra mensagem de erro", "[error] algo novo"],
  ])("funcional: %s, JSON limpo e zero achado → incompleta:lote-falhou (rc 3)", (_nome, linha) => {
    const c = cenario({ stderr: `[progress] Fetching diff...\n${linha}\n` });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou", chamada: { falhas_de_lote: [linha] } } });
  });

  // Conselhos na 0.13.1, T-01.04: o 403 da CLI só no stderr dava `incompleta:lote-falhou`,
  // FALHA nos dois modos, e o mesmo 403 no JSON dá `indisponivel:erro`. A forma das linhas é a
  // real da CLI 0.5.14, que repete nomes e põe um arquivo em dois lotes, e o `reviewed_files`
  // repete os enviados mesmo com todos os lotes negados.
  const negado = (arquivos: string) => `[error] Failed to review ${arquivos}: Access denied (403). Please run \`codeant logout\` and then \`codeant login\` to re-authenticate.`;
  const doisArquivos = (raiz: string) => { altera3(raiz); escreve(raiz, "src/b.js", "novo\n"); };

  it("funcional: os 403 cobrem todos os enviados, sem achado → indisponivel:acesso-negado (rc 2), mesmo com o reviewed_files cheio", () => {
    const c = cenario({ stderr: `[progress] Fetching diff...\n${negado("src/a.js, src/a.js, src/b.js")}\n${negado("src/b.js")}\n`, resposta: resp({ reviewed_files: ["src/a.js", "src/b.js"], total_changed: 2 }) });
    doisArquivos(c.raiz);
    expect(revisar(c, "src/a.js,src/b.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "acesso-negado+codex-ausente" } });
  });

  it("funcional: os 403 não cobrem um dos enviados → continua incompleta:lote-falhou, porque ele pode ter sido revisado", () => {
    const c = cenario({ stderr: `${negado("src/a.js")}\n`, resposta: resp({ reviewed_files: ["src/a.js", "src/b.js"], total_changed: 2 }) });
    doisArquivos(c.raiz);
    expect(revisar(c, "src/a.js,src/b.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou" } });
  });

  // conselhos-municipais-91, onda-2 T-01.01: no Windows, a CLI 0.5.14 escreve os caminhos da linha de 403, do
  // `reviewed_files` e do `skipped` com `\`, e a linha de 403 repete cada arquivo (a, a, b, b). Fora do Windows
  // o `\` é parte do nome e nada muda.
  it.runIf(process.platform === "win32")("funcional: no Windows, os 403 com `\\` e repetição cobrem os enviados → indisponivel:acesso-negado (conselhos-municipais-91)", () => {
    const c = cenario({ stderr: `[files] Reviewing 2 file(s)\n${negado("src\\a.js, src\\a.js, src\\b.js, src\\b.js")}\n`,
      resposta: resp({ reviewed_files: ["src\\a.js", "src\\b.js"], total_changed: 2 }) });
    doisArquivos(c.raiz);
    expect(revisar(c, "src/a.js,src/b.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "acesso-negado+codex-ausente" } });
  });

  it.runIf(process.platform === "win32")("funcional: no Windows, a revisão com `reviewed_files` e `skipped` em `\\` é ok, e o conferir aceita (conselhos-municipais-91)", () => {
    const c = cenario({ resposta: resp({ reviewed_files: ["src\\a.js"], skipped: [{ file: "src\\c.js", reason: "excluded by pattern" }], total_changed: 2 }) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 0, ev: { resultado: "ok" } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it.runIf(process.platform === "win32").each([
    ["`./` na frente não se tira", { reviewed_files: [".\\src\\a.js"] }, /^sobra:/],
    ["o mesmo arquivo com `\\` e com `/` é repetido", { reviewed_files: ["src\\a.js", "src/a.js"], total_changed: 2 }, /^repetido:/],
    ["o mesmo arquivo revisado e pulado é repetido", { skipped: [{ file: "src\\a.js", reason: "excluded by pattern" }], total_changed: 2 }, /^repetido:/],
  ])("funcional: no Windows, %s → incompleta", (_nome, meta, motivo) => {
    const c = cenario({ resposta: resp(meta) });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 3, ev: { resultado: "incompleta" } });
    expect(r.ev.motivo).toMatch(motivo);
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, o `\\` da CLI é nome: o 403 de `src\\a.js` não cobre `src/a.js`, e o `reviewed_files` com ele sobra", () => {
    const c = cenario({ stderr: `${negado("src\\a.js")}\n` });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou" } });
    const d = cenario({ resposta: resp({ reviewed_files: ["src\\a.js"] }) });
    altera3(d.raiz);
    expect(revisar(d, "src/a.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "sobra:src\\a.js" } });
  });

  it.each([
    ["junto de outro erro", (l: string) => `${l}\n[error] Failed to review src/a.js: 500\n`, {}],
    ["fora do formato literal", () => "[error] Failed to review batch 1: Access denied (403)\n", {}],
    ["com achado", (l: string) => `${l}\n`, { issues: [achado("src/a.js", 3)] }],
    ["sem issues", (l: string) => `${l}\n`, { issues: undefined }],
    ["com error no JSON", (l: string) => `${l}\n`, { error: "falhou" }],
    ["sem error no JSON", (l: string) => `${l}\n`, { error: undefined }],
    ["com sufixo depois do formato", (l: string) => `${l} (tentativa 2)\n`, {}],
  ])("funcional: 403 %s continua incompleta:lote-falhou", (_nome, stderr, topo) => {
    const c = cenario({ stderr: stderr(negado("src/a.js")), resposta: resp({}, topo) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou" } });
  });

  it("funcional: indisponivel:acesso-negado é AVISO em se_disponivel e FALHA em obrigatoria", () => {
    const c = cenario({ stderr: `${negado("src/a.js")}\n` });
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01");
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: "T-01 AVISO indisponivel:acesso-negado+codex-ausente" });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA indisponivel:acesso-negado+codex-ausente" });
  });

  it("borda: o Risk planner que falha só degrada a revisão, e ela segue", () => {
    const c = cenario({ stderr: "[warning] Risk planner failed; continuing without hypotheses: 500\n[progress] Analyzing 1 file...\n" });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r).toMatchObject({ rc: 0, ev: { resultado: "ok", chamada: { falhas_de_lote: [] } } });
  });

  it.each([
    ["max_files 15", { resposta: resp({ max_files: 15 }) }],
    ["reason fora do perfil", { resposta: resp({ skipped: [{ file: "x.js", reason: "too big" }], total_changed: 2 }) }],
    ["total_changed errado", { resposta: resp({ total_changed: 3 }) }],
    ["meta ausente", { resposta: { issues: [], error: null, noFiles: false } }],
    ["noFiles que não é booleano", { resposta: resp({}, { noFiles: "x" }) }],
    ["reviewed_files que não é lista", { resposta: resp({ reviewed_files: 1 }) }],
    ["skipped sem reason", { resposta: resp({ skipped: [{ file: "x.js" }], total_changed: 2 }) }],
    ["saída 1 com error nulo", { resposta: resp(), saida: 1 }],
    ["issue que não é objeto", { resposta: resp({}, { issues: [null] }) }],
  ])("funcional: %s → incompleta:perfil", (_nome, cfg) => {
    const c = cenario(cfg as CfgFalsa);
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "perfil" } });
  });

  it("funcional: arquivo da task em skipped com \"too large (200 KB, max 200 KB)\" → incompleta:pulado:<f>", () => {
    const c = cenario({ resposta: resp({ reviewed_files: [], skipped: [{ file: "src/a.js", reason: "too large (200 KB, max 200 KB)" }] }) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { motivo: "pulado:src/a.js" } });
  });

  it("funcional: arquivo repetido na resposta → incompleta:repetido:<f>", () => {
    const c = cenario({ resposta: resp({ reviewed_files: ["src/a.js", "src/a.js"], total_changed: 2 }) });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 3, ev: { motivo: "repetido:src/a.js" } });
  });

  it("funcional: src/[id].ts na task e resposta sem ele (o --include o tomou por glob) → incompleta:faltante:src/[id].ts", () => {
    const c = cenario({ resposta: resp({ reviewed_files: [], total_changed: 0 }, { noFiles: true }) });
    escreve(c.raiz, "src/[id].ts", "export const id = 1;\n");
    expect(revisar(c, "src/[id].ts")).toMatchObject({ rc: 3, ev: { motivo: "faltante:src/[id].ts" } });
  });
});
