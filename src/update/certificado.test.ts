import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executarInit } from "../cli/init.js";
import { executarUpdate } from "./flags.js";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";

// O update segue o commit que a release do CLI certifica, e não a main da skill
// (o katosmv/login recebeu na 0.12.8 o conteúdo da 0.12.9). O certificado real é
// um commit que a fixture não tem: `certificados` troca o valor, não a regra.

const CANONICA = "https://github.com/AxisGov/sprintx";
let projeto: ProjetoTemporario | undefined;
const temporarios: string[] = [];
const gitConfigAnterior = process.env["GIT_CONFIG_GLOBAL"];
const gitNoSystemAnterior = process.env["GIT_CONFIG_NOSYSTEM"];

afterEach(() => {
  projeto?.descartar();
  projeto = undefined;
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
  if (gitConfigAnterior === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = gitConfigAnterior;
  if (gitNoSystemAnterior === undefined) delete process.env["GIT_CONFIG_NOSYSTEM"];
  else process.env["GIT_CONFIG_NOSYSTEM"] = gitNoSystemAnterior;
});

type Travada = { repositorio: string; referencia: string; travado: boolean; commit: string; arquivos: Record<string, string> };
type LockJson = { cli_version: string; skills: Record<string, Travada> };

const caminhoDoLock = (raiz: string): string => join(raiz, ".expx", "expx-lock.json");
const lerLockJson = (raiz: string): LockJson => JSON.parse(readFileSync(caminhoDoLock(raiz), "utf8")) as LockJson;
const referenciaInstalada = (raiz: string): string =>
  readFileSync(join(raiz, ".expx/marketplace/plugins/expx/skills/sprintx/references/01.md"), "utf8");

/** Fixture com v1 e v2, a canônica redirecionada para ela, e a skill instalada em `em`. */
async function instalado(em: "v1.0.0" | "v2.0.0", legado: boolean): Promise<{ raiz: string; v1: string; v2: string }> {
  const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0", "v2.0.0"] });
  temporarios.push(repo);
  const pasta = mkdtempSync(join(tmpdir(), "expx-certificado-"));
  temporarios.push(pasta);
  const config = join(pasta, "config");
  execFileSync("git", ["config", "--file", config, `url.file://${repo}/.insteadOf`, CANONICA]);
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  const sha = (ref: string): string => execFileSync("git", ["rev-parse", ref], { cwd: repo }).toString().trim();
  const v1 = sha("v1.0.0");
  const v2 = sha("v2.0.0");

  projeto = projetoTemporario("fixtures/cli/projeto-limpo");
  const r = await executarInit({ raiz: projeto.raiz, skills: ["sprintx"], harness: ["claude"], referencias: { sprintx: em === "v1.0.0" ? v1 : v2 } });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  if (legado) {
    // o lock que o CLI de antes gravava: a main, não travada, no commit da ponta de então
    const lock = lerLockJson(projeto.raiz);
    const s = lock.skills["sprintx"];
    if (s === undefined) throw new Error("sprintx fora do lock");
    lock.skills["sprintx"] = { ...s, referencia: "main", travado: false };
    writeFileSync(caminhoDoLock(projeto.raiz), `${JSON.stringify(lock, null, 2)}\n`);
  }
  return { raiz: projeto.raiz, v1, v2 };
}

describe("update pelo commit certificado", () => {
  it("integracao: no certificado, o lock antigo da main so e normalizado, sem remontar a arvore", async () => {
    const c = await instalado("v1.0.0", true);
    const antes = lerLockJson(c.raiz);
    const plugin = referenciaInstalada(c.raiz);

    const check = await executarUpdate({ raiz: c.raiz, check: true, certificados: { sprintx: c.v1 } });
    expect(check.aplicou).toBe(false);
    expect(check.emDia).toEqual(["sprintx"]);
    expect(check.mensagens.join("\n")).toContain("normalizacao pendente: sprintx");
    expect(lerLockJson(c.raiz)).toEqual(antes);

    const r = await executarUpdate({ raiz: c.raiz, sim: true, certificados: { sprintx: c.v1 } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.aplicou).toBe(true);
    expect(r.atualizadas).toEqual(["sprintx"]);
    const depois = lerLockJson(c.raiz);
    expect(depois.skills["sprintx"]).toEqual({ ...antes.skills["sprintx"], referencia: c.v1, travado: true });
    expect(referenciaInstalada(c.raiz)).toBe(plugin);

    const bytes = readFileSync(caminhoDoLock(c.raiz), "utf8");
    const segunda = await executarUpdate({ raiz: c.raiz, sim: true, certificados: { sprintx: c.v1 } });
    expect(segunda.aplicou).toBe(false);
    expect(readFileSync(caminhoDoLock(c.raiz), "utf8")).toBe(bytes);
  });

  it("integracao: lock adiante do certificado recua para ele, e a saida diz que e recuo", async () => {
    const c = await instalado("v2.0.0", true);
    expect(referenciaInstalada(c.raiz)).toContain("em v2.0.0");

    const check = await executarUpdate({ raiz: c.raiz, check: true, certificados: { sprintx: c.v1 } });
    const texto = check.mensagens.join("\n");
    expect(texto).toContain(`sprintx: main (${c.v2.slice(0, 9)}) → ${c.v1.slice(0, 9)}`);
    expect(texto).toContain("recuo para o certificado");
    expect(texto).toContain("1 mudanca(s) desfeita(s)");

    const r = await executarUpdate({ raiz: c.raiz, sim: true, certificados: { sprintx: c.v1 } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(lerLockJson(c.raiz).skills["sprintx"]).toMatchObject({ referencia: c.v1, travado: true, commit: c.v1 });
    expect(referenciaInstalada(c.raiz)).toContain("em v1.0.0");
  });

  it("integracao: certificado novo avanca a skill, pelo commit", async () => {
    const c = await instalado("v1.0.0", false);

    const check = await executarUpdate({ raiz: c.raiz, check: true, certificados: { sprintx: c.v2 } });
    const texto = check.mensagens.join("\n");
    expect(texto).toContain(`sprintx: ${c.v1} (${c.v1.slice(0, 9)}) → ${c.v2.slice(0, 9)} (1 mudanca(s))`);
    expect(texto).not.toContain("recuo");

    const r = await executarUpdate({ raiz: c.raiz, sim: true, certificados: { sprintx: c.v2 } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(lerLockJson(c.raiz).skills["sprintx"]).toMatchObject({ referencia: c.v2, travado: true, commit: c.v2 });
    expect(referenciaInstalada(c.raiz)).toContain("em v2.0.0");
  });

  it("funcional: travada no certificado, esta em dia e nada e aplicado nem anunciado", async () => {
    const c = await instalado("v1.0.0", false);
    const bytes = readFileSync(caminhoDoLock(c.raiz), "utf8");

    const r = await executarUpdate({ raiz: c.raiz, sim: true, certificados: { sprintx: c.v1 } });
    expect(r.ok).toBe(true);
    expect(r.aplicou).toBe(false);
    expect(r.emDia).toEqual(["sprintx"]);
    expect(r.mensagens).toEqual([]);
    expect(readFileSync(caminhoDoLock(c.raiz), "utf8")).toBe(bytes);
  });
});
