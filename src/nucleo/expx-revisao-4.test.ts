// `nucleo/scripts/expx-revisao.mjs`. A CLI do CodeAnt nunca é chamada de verdade: uma `codeant` falsa, instalada
// como pacote npm, vem antes no PATH, responde um JSON e registra os argumentos recebidos.
// Parte 4 de 4; o apoio compartilhado está em src/teste/expx-revisao-apoio.ts.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ambienteCom, noPath } from "../teste/candidatos.js";
import { chamadasDa, configurarFalsa, type CfgFalsa } from "../teste/codeant-falsa.js";
import { chamadasDoCodex, instalarCodexFalso, type CfgCodex } from "../teste/codex-falso.js";
import { SCRIPT, criados, temp, git, escreve, cenario, PATH, revisar, resp, achado, identidade, altera3, grava, semCodeant, roda, conferir, EV, evidencia, commita } from "../teste/expx-revisao-apoio.js";

afterEach(() => { for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true }); });

describe("expx-revisao.mjs conferir e listar: casos de borda da cobertura e da saída", () => {
  it("funcional: clone raso sem o pai do commit da task: FALHA evidencia-invalida:cobertura (não verificável), nunca a árvore inteira", () => {
    const c = cenario();
    escreve(c.raiz, "src/c.js", "c\n");
    expect(revisar(c, "src/c.js").rc).toBe(0);
    commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
    const raso = join(temp("expx-raso-"), "r");
    git(tmpdir(), "clone", "-q", "--depth", "1", pathToFileURL(c.raiz).href, raso);
    expect(conferir(raso, "obrigatoria", `T-01=${git(raso, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });

  it("funcional: listar dá motivo null em ok mesmo com motivo gravado", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    escreve(c.raiz, EV, JSON.stringify({ ...(evidencia(c.raiz) as object), motivo: "x" }));
    const r = roda(c.raiz, "listar", "--task", `T-01=${commita(c.raiz)}`);
    expect(r.rc).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ tasks: [{ listagem: "ok", resultado: "ok", motivo: null }] });
  });
});

describe("expx-revisao.mjs conferir: commit com lista de caminhos acima de 1 MiB", () => {
  it("funcional: 5.000 caminhos longos excluídos pelo núcleo (diff > 1 MiB) e o revisável coberto → ok, não cobertura", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    git(c.raiz, "add", "src", "docs");
    const blob = git(c.raiz, "hash-object", "-w", "src/a.js");
    const nome = "n".repeat(200);
    const linhas = Array.from({ length: 5000 }, (_, i) => `100644 ${blob}\tdocs/entregas/w/gerado/${i}-${nome}.txt`).join("\n");
    const r = spawnSync("git", ["update-index", "--index-info"], { cwd: c.raiz, input: `${linhas}\n`, encoding: "utf8" });
    expect(r.status).toBe(0);
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${git(c.raiz, "rev-parse", "HEAD")}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  }, 60000);
});

describe("expx-revisao.mjs conferir: evidência que não se lê e base_commit que não é commit", () => {
  it("funcional: evidência no commit cujo blob o git não lê → FALHA evidencia-invalida em qualquer modo, nunca AVISO evidencia-ausente", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    const blob = git(c.raiz, "rev-parse", `${sha}:${EV}`);
    rmSync(join(c.raiz, ".git", "objects", blob.slice(0, 2), blob.slice(2)), { force: true });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida" });
  });

  it("funcional: indisponivel com modo base-commit e base_commit que não é commit → FALHA evidencia-invalida:cobertura, não AVISO", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js", "T-01", semCodeant());
    const ev = evidencia(c.raiz) as Record<string, any>;
    expect(ev).toMatchObject({ resultado: "indisponivel", motivo: "cli-ausente+codex-ausente" });
    escreve(c.raiz, EV, JSON.stringify({ ...ev, modo: "base-commit", base_commit: "0".repeat(40) }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });
});

describe("expx-revisao.mjs: correções P1 do Login (falha fechada)", () => {
  it("funcional: CLI que não responde no tempo → indisponivel:tempo-esgotado (rc 2), sem esperar a CLI terminar", () => {
    const c = cenario({ dorme: 20_000 });
    altera3(c.raiz);
    const inicio = Date.now();
    const r = revisar(c, "src/a.js", "T-01", undefined, { EXPX_REVISAO_TESTE_TEMPO_CLI: "500" });
    expect(Date.now() - inicio).toBeLessThan(15_000);
    expect(r.rc).toBe(2);
    expect(r.ev.resultado).toBe("indisponivel");
    expect(r.ev.motivo).toBe("tempo-esgotado+codex-ausente");
  });

  it.each([
    ["arquivo fora da task", achado("src/outro.js", 3)],
    ["linha zero", achado("src/a.js", 0)],
    ["linha não numérica", { ...achado("src/a.js", 3), start_line: "x" }],
  ])("funcional: achado sem vínculo (%s) fica aberto e bloqueia, em vez de virar anterior", (_n, issue) => {
    const c = cenario({ resposta: resp({}, { issues: [issue] }) });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.ev.achados.map((a) => a.estado)).toEqual(["aberto"]);
    expect(r.ev.resultado).toBe("achados");
    expect(r.rc).toBe(1);
  });

  it("os vereditos de revisar e conferir saem por process.exitCode, sem cortar o stdout assíncrono", () => {
    // Em pipe no macOS e em TTY no Windows o stdout do Node é assíncrono: process.exit logo depois do
    // write pode encerrar antes de a linha do veredito sair. No Linux o pipe é síncrono, e o defeito não
    // se reproduz por execução; por isso a garantia é sobre o código, conferida contra mutação.
    const fonte = readFileSync(SCRIPT, "utf8");
    const depoisDoVeredito = [...fonte.matchAll(/process\.stdout\.write\(`\$\{(?:op\.task|linhas\.join)[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*(process\.[a-zA-Z]+)/g)].map((m) => m[1]);
    expect(depoisDoVeredito).toEqual(["process.exitCode", "process.exitCode"]);
  });
});

describe("expx-revisao.mjs: escala para o Codex (CodeAnt fora)", () => {
  it("estrutural: o núcleo não tem gancho que troque o Codex (conselhos#315), e o PATH da suíte não tem `codex` de verdade", () => {
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/EXPX_REVISAO_TESTE_CODEX|process\.env\.[A-Z_]*CODEX/);
    // a chave do PATH em qualquer caixa (`Path` no Windows)
    const chave = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
    const comCodex = (process.env[chave] ?? "").split(delimiter).filter((d) => ["codex", "codex.exe", "codex.com", "codex.cmd"].some((n) => existsSync(join(d, n))));
    expect(comCodex).toEqual([]);
  });

  const SEM_CODEANT = dirname(noPath("git") ?? "");
  /** O cenário com o Codex falso (`cfg`); `codeant` dá a falsa da CodeAnt, ou nenhuma no PATH. */
  function escala(cfg: CfgCodex, codeant: CfgFalsa | null = null) {
    const c = cenario(codeant ?? {});
    const codex = instalarCodexFalso(temp("expx-codex-"), cfg);
    // o Codex falso na frente do PATH, como o `codex` que o núcleo acha; sem a CodeAnt, só o git atrás dele
    const path = `${codex.path}${delimiter}${codeant ? `${c.falsa.path}${delimiter}${PATH}` : SEM_CODEANT}`;
    const rev = (arquivos = "src/a.js", mais: string[] = [], extra: Record<string, string> = {}) => revisar(c, arquivos, "T-01", path, extra, c.script, mais);
    return { c, codex, rev, path };
  }
  const resposta = (issues: object[] = [], revisados = ["src/a.js"]) => ({ arquivos_revisados: revisados, issues });
  const doCodex = (arquivo: string, linha: number, mensagem = "defeito") => ({ arquivo, linha, severidade: "alta", mensagem });

  it("funcional: CodeAnt ausente → o Codex revisa: evidência v3 com a escala, achado em linha alterada aberto; conferir e rejeitar como sempre", () => {
    const { c, codex, rev } = escala({ resposta: resposta([doCodex("src/a.js", 3), doCodex("src/a.js", 1)]) });
    altera3(c.raiz);
    const r = rev();
    expect(r.rc).toBe(1);
    expect(r.out).toContain("T-01 achados");
    expect(r.ev).toMatchObject({ expx_revisao: 3, resultado: "achados", escala: { de: "codeant", motivo: "cli-ausente" },
      revisor: { nome: "codex", versao: "0.163.0", formato: 2 }, chamada_codex: { include: ["src/a.js"], arquivos_revisados: ["src/a.js"] } });
    expect(r.ev.achados.map((a) => `${a.linha}=${a.estado}`)).toEqual(["3=aberto", "1=anterior"]);
    expect(chamadasDoCodex(codex)).toHaveLength(1);
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", r.ev.achados[0]?.identidade ?? "", "--motivo", "fp").out).toBe("T-01 ok");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: a chamada do Codex: só leitura, sem configuração do usuário, modelo fixo, schema, sobre o snapshot; o pedido nomeia os arquivos e a base", () => {
    const { c, codex, rev } = escala({ resposta: resposta() });
    altera3(c.raiz);
    expect(rev().rc).toBe(0);
    const [ch] = chamadasDoCodex(codex);
    const a = ch?.args ?? [];
    expect(a.slice(0, 3)).toEqual(["exec", "--ephemeral", "--ignore-user-config"]);
    expect(a[a.indexOf("-s") + 1]).toBe("read-only");
    expect(a[a.indexOf("-m") + 1]).toMatch(/\S/);
    expect(a).toContain("--output-schema");
    expect(a.at(-1)).toBe("-");
    expect(a[a.indexOf("-C") + 1]).toContain("expx-revisao-snapshot-");
    expect(ch?.cwd).toContain("expx-revisao-snapshot-");
    expect(ch?.stdin).toContain("src/a.js");
    expect(ch?.stdin).toContain("HEAD");
  });

  it("funcional: CodeAnt com erro (JSON com error) → o Codex revisa", () => {
    const { c, rev } = escala({ resposta: resposta() }, { error: "falhou" });
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 0, ev: { expx_revisao: 3, resultado: "ok", escala: { de: "codeant", motivo: "erro" } } });
  });

  it("funcional: CodeAnt com o pacote editado (integridade) → o Codex revisa", () => {
    const { c, rev } = escala({ resposta: resposta() }, {});
    writeFileSync(c.falsa.bin, `${readFileSync(c.falsa.bin, "utf8")}\n// editado\n`);
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 0, ev: { expx_revisao: 3, resultado: "ok", escala: { de: "codeant", motivo: "integridade" } } });
  });

  it("funcional: CodeAnt que funciona → o Codex nunca é chamado, e a evidência continua v2", () => {
    const { c, codex, rev } = escala({ resposta: resposta() }, {});
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 0, ev: { expx_revisao: 2, resultado: "ok" } });
    expect(rev().ev).not.toHaveProperty("escala");
    expect(chamadasDoCodex(codex)).toHaveLength(0);
  });

  it("funcional: o que não é indisponibilidade da CodeAnt não escala (incompleta, arquivo não commitado)", () => {
    const um = escala({ resposta: resposta() }, { stderr: "[error] lote" });
    altera3(um.c.raiz);
    expect(um.rev()).toMatchObject({ rc: 3, ev: { resultado: "incompleta", motivo: "lote-falhou" } });
    expect(chamadasDoCodex(um.codex)).toHaveLength(0);
    const dois = escala({ resposta: resposta() });
    const base = git(dois.c.raiz, "rev-parse", "HEAD");
    altera3(dois.c.raiz);
    expect(dois.rev("src/a.js", ["--base-commit", base])).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-nao-commitado:src/a.js" } });
    expect(chamadasDoCodex(dois.codex)).toHaveLength(0);
  });

  it.each<[string, CfgCodex | null, string]>([
    ["ausente", null, "codex-ausente"],
    ["sem login", { logado: false }, "codex-sem-login"],
    ["que sai com erro", { saida: 3 }, "codex-erro"],
    ["com texto livre", { resposta: "Revisei e está tudo certo." }, "codex-saida-invalida"],
    ["fora do schema", { resposta: { arquivos_revisados: ["src/a.js"], issues: [{ arquivo: "src/a.js", linha: "3", mensagem: "x" }] } }, "codex-saida-invalida"],
    ["que não revisou a task inteira", { resposta: { arquivos_revisados: [], issues: [] } }, "codex-saida-invalida"],
  ])("funcional: CodeAnt e Codex %s fora → indisponivel:<CodeAnt>+<Codex> (rc 2), FALHA em obrigatoria e AVISO em se_disponivel", (_n, cfg, codexMotivo) => {
    const { c, rev } = escala(cfg ?? {});
    altera3(c.raiz);
    // ausente: o PATH sem o Codex falso (o da suíte não tem nenhum)
    const r = cfg === null ? revisar(c, "src/a.js", "T-01", SEM_CODEANT) : rev();
    expect(r.rc).toBe(2);
    expect(r.out.trim()).toBe(`T-01 indisponivel:cli-ausente+${codexMotivo}`);
    expect(r.ev).toMatchObject({ expx_revisao: 3, resultado: "indisponivel", motivo: `cli-ausente+${codexMotivo}`, escala: { de: "codeant", motivo: "cli-ausente" }, achados: [] });
    const sha = commita(c.raiz);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${sha}`)).toMatchObject({ rc: 1, out: `T-01 FALHA indisponivel:cli-ausente+${codexMotivo}` });
    expect(conferir(c.raiz, "se_disponivel", `T-01=${sha}`)).toMatchObject({ rc: 3, out: `T-01 AVISO indisponivel:cli-ausente+${codexMotivo}` });
  });

  it.each([
    ["que sai da raiz", "../../../../dev/zero"],
    ["fora da task", "src/outro.js"],
  ])("funcional: issue do Codex com arquivo %s → codex-saida-invalida, sem ler o arquivo (CodeAnt no expxdev#164)", (_n, arquivo) => {
    const { c, rev } = escala({ resposta: resposta([doCodex(arquivo, 1)]) });
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "cli-ausente+codex-saida-invalida" } });
  });

  it("funcional: issue do Codex numa linha além do fim do arquivo fica aberta, nunca anterior (CodeAnt no expxdev#164)", () => {
    const { c, rev } = escala({ resposta: resposta([doCodex("src/a.js", 99)]) });
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 1, ev: { resultado: "achados", achados: [{ linha: 99, estado: "aberto" }] } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it("funcional: Codex que não responde no tempo → codex-tempo-esgotado, sem esperar ele terminar", () => {
    const { c, rev } = escala({ dorme: 20_000, resposta: resposta() });
    altera3(c.raiz);
    const inicio = Date.now();
    const r = rev("src/a.js", [], { EXPX_REVISAO_TESTE_TEMPO_CLI: "500" });
    expect(Date.now() - inicio).toBeLessThan(15_000);
    expect(r).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "cli-ausente+codex-tempo-esgotado" } });
  });

  it("funcional: conferir recusa a evidência v3 adulterada", () => {
    const { c, rev } = escala({ resposta: resposta([doCodex("src/a.js", 3)]) });
    altera3(c.raiz);
    rev();
    const original = evidencia(c.raiz) as Record<string, Record<string, unknown>>;
    const casos: [string, (ev: Record<string, Record<string, unknown>>) => void][] = [
      ["evidencia-invalida:escala", (ev) => { ev["escala"] = { de: "codeant", motivo: "lote-falhou" }; }],
      ["evidencia-invalida:escala", (ev) => { ev["escala"] = { de: "codeant", motivo: "arquivo-nao-commitado:src/a.js" }; }],
      ["evidencia-invalida:revisor", (ev) => { ev["revisor"] = { ...ev["revisor"], nome: "outro" }; }],
      ["evidencia-invalida:chamada", (ev) => { ev["chamada_codex"] = { ...ev["chamada_codex"], prompt_sha256: "0".repeat(64) }; }],
      ["evidencia-invalida:cobertura", (ev) => { ev["chamada_codex"] = { ...ev["chamada_codex"], arquivos_revisados: [] }; }],
      ["evidencia-invalida:chamada", (ev) => {
        const ch = ev["chamada_codex"] as { issues: { arquivo: string }[] };
        ev["chamada_codex"] = { ...ch, issues: ch.issues.map((i) => ({ ...i, arquivo: "src/outro.js" })) };
      }],
      ["evidencia-invalida:achados", (ev) => { (ev["achados"] as unknown as { estado: string }[])[0]!.estado = "anterior"; }],
    ];
    for (const [esperado, muda] of casos) {
      const ev = JSON.parse(JSON.stringify(original)) as Record<string, Record<string, unknown>>;
      muda(ev);
      escreve(c.raiz, EV, JSON.stringify(ev));
      expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`).out, esperado).toBe(`T-01 FALHA ${esperado}`);
    }
  });

  it("funcional: a v3 grava o executável que revisou (caminho real e sha256), e o conferir recusa a v3 sem ele (conselhos#315)", () => {
    const { c, codex, rev } = escala({ resposta: resposta() });
    altera3(c.raiz);
    const r = rev();
    const sha = createHash("sha256").update(readFileSync(codex.executavel)).digest("hex");
    expect(r.ev).toMatchObject({ revisor: { executavel: { caminho: realpathSync(codex.executavel), sha256: sha } } });
    const ev = evidencia(c.raiz) as Record<string, Record<string, unknown>>;
    escreve(c.raiz, EV, JSON.stringify({ ...ev, revisor: { ...ev["revisor"], executavel: undefined } }));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:revisor" });
  });

  it("funcional: o Codex roda sem NODE_OPTIONS do ambiente (código injetado não passaria no caminho e no hash gravados; Codex no #315)", () => {
    const { c, codex, rev } = escala({ resposta: resposta() });
    altera3(c.raiz);
    expect(rev("src/a.js", [], { NODE_OPTIONS: "--max-old-space-size=4096" }).rc).toBe(0);
    expect(chamadasDoCodex(codex)[0]?.nodeOptions).toBeNull();
  });

  it("funcional: o Codex não herda o que injeta código ou muda o que os comandos dele veem (LD_*, DYLD_*, GCONV_PATH, BASH_ENV, GIT_*...), e o resto passa (CodeAnt no katosmv/login#83; Codex)", () => {
    const { c, codex, rev } = escala({ resposta: resposta() });
    altera3(c.raiz);
    const fora = temp("expx-libs-");
    const injeta = Object.fromEntries(["LD_LIBRARY_PATH", "LD_QUALQUER", "DYLD_FRAMEWORK_PATH", "DYLD_FALLBACK_LIBRARY_PATH", "GCONV_PATH", "BASH_ENV", "ENV",
      "NODE_PATH", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "PYTHONUSERBASE", "PERL5OPT", "PERL5LIB", "PERLLIB", "PERL5DB", "RUBYOPT", "RUBYLIB",
      "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS", "DOTNET_STARTUP_HOOKS", "CORECLR_PROFILER", "CORECLR_PROFILER_PATH",
      "CORECLR_ENABLE_PROFILING", "LUA_INIT", "LUA_INIT_5_4", "GIT_QUALQUER", "npm_config_node_options", "NPM_CONFIG_SCRIPT_SHELL",
      "npm_config_userconfig", "YARN_YARN_PATH", "YARN_RC_FILENAME"].map((k) => [k, fora]));
    // a configuração legítima dos mesmos runtimes passa (Codex no #167: os prefixos de família tiravam o `JAVA_HOME`)
    const legitimas = { JAVA_HOME: fora, PYTHONIOENCODING: "utf-8", PERL_MM_OPT: "INSTALL_BASE=x" };
    // `GIT_*` que não quebram o git do próprio núcleo (um `GIT_DIR` trocaria o repositório dele também): o prefixo é o que se prova
    const r = rev("src/a.js", [], { ...injeta, ...legitimas, GIT_TRACE: "0", HTTPS_PROXY: "http://proxy.exemplo.invalid:3128" });
    expect(r.rc).toBe(0);
    // a ausência das bloqueadas e a presença do proxy, não a igualdade: o ambiente de quem roda a suíte pode ter `https_proxy` (CodeAnt no #167)
    const recebido = chamadasDoCodex(codex)[0]?.ambiente ?? {};
    expect(Object.keys(recebido).filter((k) => Object.hasOwn(injeta, k) || /^(GIT_|LD_|DYLD_|NPM_CONFIG_|YARN_)/i.test(k))).toEqual([]);
    expect(recebido["HTTPS_PROXY"]).toBe("http://proxy.exemplo.invalid:3128");
    expect(Object.fromEntries(Object.keys(legitimas).map((k) => [k, recebido[k]]))).toEqual(legitimas);
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, o `codex` com `#!/usr/bin/env node` roda pelo node do núcleo, nunca pelo `node` do PATH (Codex no #315)", () => {
    const c = cenario();
    const codex = instalarCodexFalso(temp("expx-codex-"), { resposta: resposta() }, "env");
    const falso = temp("expx-node-falso-");
    const marca = join(falso, "rodou");
    writeFileSync(join(falso, "node"), `#!/bin/sh\necho rodou > ${JSON.stringify(marca)}\nexit 1\n`, { mode: 0o755 });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", `${falso}${delimiter}${codex.path}${delimiter}${SEM_CODEANT}`);
    expect([r.rc, existsSync(marca)]).toEqual([0, false]);
    expect(chamadasDoCodex(codex)).toHaveLength(1);
  });

  it("funcional: o executável do Codex que muda durante a revisão → codex-erro, nada revisado (Codex no #315)", () => {
    const { c, rev } = escala({ resposta: resposta(), alteraSiMesmo: true });
    altera3(c.raiz);
    expect(rev()).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "cli-ausente+codex-erro" } });
  });

  it("funcional: dois defeitos do Codex na mesma linha têm identidades diferentes, e rejeitar um não cala o outro (CodeAnt no katosmv/login#81)", () => {
    const { c, rev } = escala({ resposta: resposta([doCodex("src/a.js", 3, "divide por zero"), doCodex("src/a.js", 3, "vaza o token no log")]) });
    altera3(c.raiz);
    const r = rev();
    expect(r.ev).toMatchObject({ revisor: { formato: 2 }, achados: [{ estado: "aberto" }, { estado: "aberto" }] });
    const [um, dois] = r.ev.achados;
    expect(um?.identidade).not.toBe(dois?.identidade);
    expect(roda(c.raiz, "rejeitar", "--task", "T-01", "--identidade", um?.identidade ?? "", "--motivo", "fp").out).toBe("T-01 achados");
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it("funcional: a evidência v3 com formato 1 (0.14.1, que já grava o executavel) continua conferida pela regra dela, sem a mensagem na identidade", () => {
    const { c, rev } = escala({ resposta: resposta([doCodex("src/a.js", 3)]) });
    altera3(c.raiz);
    rev();
    const ev = evidencia(c.raiz) as { revisor: { formato: number; versao: string; modelo: string }; achados: { identidade: string }[] };
    ev.revisor.formato = 1;
    const versao = `codex:${ev.revisor.versao}:${ev.revisor.modelo}:1`;
    ev.achados[0]!.identidade = createHash("sha256").update(["codex", "src/a.js", "l2", "novo3", "l4", versao].join("\0")).digest("hex");
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it("funcional: conferir recusa o motivo do Codex fora dos cinco do contrato (Codex)", () => {
    const { c, rev } = escala({ logado: false });
    altera3(c.raiz);
    rev();
    const ev = evidencia(c.raiz) as Record<string, unknown>;
    expect(ev["motivo"]).toBe("cli-ausente+codex-sem-login");
    escreve(c.raiz, EV, JSON.stringify({ ...ev, motivo: "cli-ausente+codex-inventado" }));
    expect(conferir(c.raiz, "se_disponivel", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:escala" });
  });

  it("funcional: com --base-commit, o pedido nomeia o base_commit, e o conferir refaz igual", () => {
    const { c, codex, rev } = escala({ resposta: resposta([doCodex("src/a.js", 3)]) });
    const base = git(c.raiz, "rev-parse", "HEAD");
    altera3(c.raiz);
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "task");
    expect(rev("src/a.js", ["--base-commit", base])).toMatchObject({ rc: 1, ev: { expx_revisao: 3, modo: "base-commit", achados: [{ estado: "aberto" }] } });
    expect(chamadasDoCodex(codex)[0]?.stdin).toContain(base);
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz, true)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });
});

describe("expx-revisao.mjs: derivacao 3 (a issue que não se liga a uma linha da task fica aberta, para a CodeAnt e o Codex)", () => {
  it("funcional: um campo `chave_extra` na issue crua da CodeAnt não muda a identidade (só o Codex de formato 2 põe a mensagem nela; Codex na 0.14.2)", () => {
    const c = cenario({ resposta: resp({}, { issues: [{ ...achado("src/a.js", 3), chave_extra: "da-cli" }] }) });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js");
    expect(r.ev.achados[0]?.identidade).toBe(identidade("security", "src/a.js", ["l2", "novo3", "l4"]));
  });

  it("funcional: issue da CodeAnt numa linha além do fim do arquivo fica aberta; a evidência grava derivacao 3 e o conferir refaz igual", () => {
    const c = cenario({ issues: [achado("src/a.js", 99)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 1, ev: { derivacao: 3, achados: [{ linha: 99, estado: "aberto" }] } });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it.skipIf(process.platform === "win32")("funcional: issue da CodeAnt num caminho que sai da raiz (`../../../../dev/zero`) não é lida e fica aberta", () => {
    // a resposta montada: a falsa filtraria a issue pelo `--include`, e a leitura nunca aconteceria
    const c = cenario({ resposta: resp({}, { issues: [achado("../../../../dev/zero", 1)] }) });
    altera3(c.raiz);
    const inicio = Date.now();
    const r = spawnSync(process.execPath, [c.script, "revisar", "--trabalho", "w", "--task", "T-01", "--arquivos", "src/a.js", "--raiz", c.raiz],
      { encoding: "utf8", env: ambienteCom(`${c.falsa.path}${delimiter}${PATH}`), timeout: 30_000 });
    expect(Date.now() - inicio).toBeLessThan(30_000);
    expect(r.status).toBe(1);
    expect(evidencia(c.raiz)).toMatchObject({ derivacao: 3, achados: [{ estado: "aberto" }] });
  });

  it("funcional: a evidência com derivacao 2 continua conferida pela regra dela (a linha além do fim, anterior)", () => {
    const c = cenario({ issues: [achado("src/a.js", 99)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const ev = evidencia(c.raiz) as { derivacao: number; resultado: string; achados: { estado: string }[] };
    ev.derivacao = 2;
    ev.resultado = "ok";
    ev.achados[0]!.estado = "anterior";
    escreve(c.raiz, EV, JSON.stringify(ev));
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: arquivo sem-alteracao da task que muda durante a chamada → arquivo-mudou-durante-revisao (conselhos#312)", () => {
    const c = cenario();
    // caminho absoluto: a falsa roda com o cwd no snapshot, e o que muda é o checkout
    configurarFalsa(c.falsa, { durante: [join(c.raiz, "src/b.js"), "mudou\n"] });
    escreve(c.raiz, "src/b.js", "b\n");
    git(c.raiz, "add", "-A");
    git(c.raiz, "commit", "-q", "-m", "b");
    altera3(c.raiz);
    expect(revisar(c, "src/a.js,src/b.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-mudou-durante-revisao" } });
  });
});

describe("expx-revisao.mjs: 0.14.4 (conselhos#315 e #316)", () => {
  it.skipIf(process.platform === "win32")("funcional: fora do Windows, o arquivo executável da task chega executável ao snapshot (conselhos#315)", () => {
    const c = cenario();
    altera3(c.raiz);
    chmodSync(join(c.raiz, "src/a.js"), 0o755);
    expect(revisar(c, "src/a.js").rc).toBe(0);
    expect(chamadasDa(c.falsa).at(-1)?.executaveis).toEqual({ "src/a.js": true });
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, o arquivo da task que é link para um alvo executável não chega executável (o git o guarda como 120000; CodeAnt no katosmv/login#85)", () => {
    const c = cenario();
    const alvo = join(temp("expx-alvo-"), "roda.sh");
    writeFileSync(alvo, "#!/bin/sh\n", { mode: 0o755 });
    rmSync(join(c.raiz, "src/a.js"));
    symlinkSync(alvo, join(c.raiz, "src/a.js"));
    expect(revisar(c, "src/a.js").rc).toBe(0);
    expect(chamadasDa(c.falsa).at(-1)?.executaveis).toEqual({ "src/a.js": false });
  });

  it.skipIf(process.platform === "win32")("funcional: com core.fileMode=false, o bit do disco não vale: o snapshot leva o modo do índice, como o commit (Codex na 0.14.4)", () => {
    const c = cenario();
    git(c.raiz, "config", "core.fileMode", "false");
    altera3(c.raiz);
    chmodSync(join(c.raiz, "src/a.js"), 0o755);
    expect(revisar(c, "src/a.js").rc).toBe(0);
    expect(chamadasDa(c.falsa).at(-1)?.executaveis).toEqual({ "src/a.js": false });
  });

  it.skipIf(process.platform === "win32")("funcional: o modo que muda durante a chamada → arquivo-mudou-durante-revisao (Codex na 0.14.4)", () => {
    const c = cenario();
    configurarFalsa(c.falsa, { chmodDurante: [join(c.raiz, "src/a.js"), 0o755] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js")).toMatchObject({ rc: 2, ev: { resultado: "indisponivel", motivo: "arquivo-mudou-durante-revisao" } });
  });

  it.skipIf(process.platform === "win32")("funcional: blob que o git não lê no conferir → FALHA evidencia-invalida:blob-ilegivel:<arquivo>, não L2 (conselhos#316)", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    const sha = commita(c.raiz);
    const falso = temp("expx-git-falso-");
    writeFileSync(join(falso, "git"), `#!/bin/sh\n[ "$1" = "cat-file" ] && [ "$2" = "-s" ] && exit 128\nexec ${JSON.stringify(noPath("git") ?? "git")} "$@"\n`, { mode: 0o755 });
    const r = spawnSync(process.execPath, [SCRIPT, "conferir", "--trabalho", "w", "--modo", "obrigatoria", "--task", `T-01=${sha}`, "--raiz", c.raiz],
      { encoding: "utf8", env: ambienteCom(`${falso}${delimiter}${PATH}`) });
    expect(r.stdout.trim()).toBe("T-01 FALHA evidencia-invalida:blob-ilegivel:src/a.js");
  });
});

// CodeAnt no AxisGov/login#88 (r4566897200): a evidência gravada no Windows guarda o `meta` e as `issues` da CLI com `\`.
// Conferida fora dele, a troca de `\` por `/` segue a plataforma da evidência, não a da máquina que confere.
describe("expx-revisao.mjs: a plataforma da evidência (0.14.7)", () => {
  /** Reescreve a evidência da T-01 no disco, antes do commit. */
  const mudaEv = (raiz: string, muda: (ev: Record<string, any>) => void) => {
    const ev = evidencia(raiz) as Record<string, any>;
    muda(ev);
    writeFileSync(join(raiz, EV), JSON.stringify(ev, null, 2));
  };
  const comoWindows = (ev: Record<string, any>) => {
    ev.chamada.meta.reviewed_files = ["src\\a.js"];
    ev.chamada.meta.skipped = [{ file: "src\\c.js", reason: "excluded by pattern" }];
    ev.chamada.meta.total_changed = 2;
  };

  it("estrutural: `caminho` e `daCli` não vão a `map` sem lambda: o índice cairia na plataforma (CodeAnt no expxdev#171)", () => {
    expect(readFileSync(SCRIPT, "utf8")).not.toMatch(/\.map\((caminho|daCli)\)/);
  });

  it("funcional: o revisar grava a plataforma em que rodou", () => {
    const c = cenario();
    altera3(c.raiz);
    expect(revisar(c, "src/a.js").ev).toMatchObject({ resultado: "ok", plataforma: process.platform });
  });

  it("funcional: evidência do Windows (meta com `\\`) conferida em qualquer máquina → ok", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    mudaEv(c.raiz, (ev) => { ev.plataforma = "win32"; comoWindows(ev); });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 0, out: "T-01 ok" });
  });

  it("funcional: a mesma evidência dizendo linux → o `\\` é nome, e o conferir dá FALHA evidencia-invalida:cobertura", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    mudaEv(c.raiz, (ev) => { ev.plataforma = "linux"; comoWindows(ev); });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });

  it.skipIf(process.platform === "win32")("funcional: fora do Windows, a evidência sem plataforma (anterior à 0.14.7) segue a máquina, como antes: `\\` é nome", () => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    mudaEv(c.raiz, (ev) => { delete ev.plataforma; comoWindows(ev); });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:cobertura" });
  });

  it("funcional: achado de evidência do Windows (relevant_file com `\\`) → o conferir deriva a mesma identidade", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    expect(revisar(c, "src/a.js").rc).toBe(1);
    mudaEv(c.raiz, (ev) => { ev.plataforma = "win32"; comoWindows(ev); ev.chamada.issues[0].relevant_file = "src\\a.js"; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });

  it("funcional: o mesmo achado dizendo linux → o arquivo `src\\a.js` não é da task, e os achados divergem", () => {
    const c = cenario({ issues: [achado("src/a.js", 3)] });
    altera3(c.raiz);
    revisar(c, "src/a.js");
    mudaEv(c.raiz, (ev) => { ev.plataforma = "linux"; ev.chamada.issues[0].relevant_file = "src\\a.js"; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:achados" });
  });

  it.each([["número", 1], ["texto vazio", ""], ["nulo", null]])("funcional: plataforma %s → FALHA evidencia-invalida:plataforma", (_nome, valor) => {
    const c = cenario();
    altera3(c.raiz);
    revisar(c, "src/a.js");
    mudaEv(c.raiz, (ev) => { ev.plataforma = valor; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA evidencia-invalida:plataforma" });
  });

  it("funcional: na escala para o Codex (v3), a evidência também grava a plataforma, e a do Windows confere", () => {
    const c = cenario({ stderr: "[error] Failed to review src/a.js: Access denied (403). Please run `codeant logout` and then `codeant login` to re-authenticate.\n" });
    const codex = instalarCodexFalso(temp("expx-codex-"), { resposta: { arquivos_revisados: ["src/a.js"], issues: [{ arquivo: "src/a.js", linha: 3, severidade: "alta", mensagem: "x" }] } });
    altera3(c.raiz);
    const r = revisar(c, "src/a.js", "T-01", `${codex.path}${delimiter}${c.falsa.path}${delimiter}${PATH}`);
    expect(r.ev).toMatchObject({ expx_revisao: 3, resultado: "achados", plataforma: process.platform });
    mudaEv(c.raiz, (ev) => { ev.plataforma = "win32"; });
    expect(conferir(c.raiz, "obrigatoria", `T-01=${commita(c.raiz)}`)).toMatchObject({ rc: 1, out: "T-01 FALHA achados-abertos:1" });
  });
});
