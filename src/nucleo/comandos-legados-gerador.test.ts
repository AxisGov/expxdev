import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashNormalizado } from "./comandos-legados.js";

/*
 * O gerador do manifesto (scripts/comandos-legados.sh) sobre um repositório de skill
 * de verdade: a história alcançável do commit certificado, cada versão de cada
 * comando, o hash normalizado (CRLF→LF), a saída estável e o --check que acusa
 * divergência.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const SCRIPT = join(RAIZ, "scripts", "comandos-legados.sh");
const temporarios: string[] = [];
afterEach(() => {
  for (const t of temporarios.splice(0)) rmSync(t, { recursive: true, force: true });
});
const tmp = (p: string): string => {
  const d = mkdtempSync(join(tmpdir(), p));
  temporarios.push(d);
  return d;
};
const git = (cwd: string, ...a: string[]): string =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...a], { cwd, encoding: "utf8" }).trim();

const V1 = "# /fx\r\n\r\nprimeira versao, em CRLF\r\n";
const V2 = "# /fx\n\nsegunda versao\n";
const FORA = "# /fx\n\nnum ramo que o certificado nao alcanca\n";

function cenario(): { repo: string; certificado: string; ramo: string; catalogo: string; saida: string } {
  const repo = tmp("expx-gerador-repo-");
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, ".claude", "commands"), { recursive: true });
  writeFileSync(join(repo, ".claude", "commands", "fx.md"), V1);
  writeFileSync(join(repo, ".claude", "commands", "NaoComando.txt"), "fora do padrao de nome\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "v1");
  writeFileSync(join(repo, ".claude", "commands", "fx.md"), V2);
  git(repo, "commit", "-q", "-am", "v2");
  const certificado = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "-q", "-c", "lateral", "HEAD~1");
  writeFileSync(join(repo, ".claude", "commands", "fx.md"), FORA);
  git(repo, "commit", "-q", "-am", "lateral");
  const ramo = git(repo, "rev-parse", "HEAD");
  const d = tmp("expx-gerador-saida-");
  const catalogo = join(d, "catalogo.ts");
  writeFileSync(catalogo, `  {\n    nome: "fx",\n    certificado: "${certificado}",\n  },\n`);
  return { repo, certificado, ramo, catalogo, saida: join(d, "manifesto.ts") };
}

function roda(c: ReturnType<typeof cenario>, historico: string, ...extra: string[]): { rc: number; out: string } {
  const r = spawnSync("bash", [SCRIPT, ...extra, `fx=${c.repo}`], {
    encoding: "utf8",
    env: { ...process.env, EXPX_CATALOGO: c.catalogo, EXPX_MANIFESTO_SAIDA: c.saida, EXPX_HISTORICO: historico },
  });
  return { rc: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

describe("scripts/comandos-legados.sh", () => {
  it("coleta as versões da história certificada, com o hash normalizado, e só elas", () => {
    const c = cenario();
    expect(roda(c, "").rc).toBe(0);
    const m = readFileSync(c.saida, "utf8");
    expect(m).toContain(`{ skill: "fx", commit: "${c.certificado}", papel: "certificado" }`);
    expect(m).toContain(hashNormalizado(Buffer.from(V1)));
    expect(m).toContain(hashNormalizado(Buffer.from(V2)));
    expect(m).not.toContain(hashNormalizado(Buffer.from(FORA)));
    expect(m).not.toContain("NaoComando");
  });

  it("o commit histórico explícito acrescenta a versão do ramo", () => {
    const c = cenario();
    expect(roda(c, `fx ${c.ramo}`).rc).toBe(0);
    const m = readFileSync(c.saida, "utf8");
    expect(m).toContain(`papel: "historico"`);
    expect(m).toContain(hashNormalizado(Buffer.from(FORA)));
  });

  it("a saída é estável, e o --check acusa o manifesto mexido", () => {
    const c = cenario();
    roda(c, "");
    const primeira = readFileSync(c.saida, "utf8");
    expect(roda(c, "").rc).toBe(0);
    expect(readFileSync(c.saida, "utf8")).toBe(primeira);
    expect(roda(c, "", "--check").rc).toBe(0);
    writeFileSync(c.saida, primeira.replace(hashNormalizado(Buffer.from(V2)), "0".repeat(64)));
    expect(roda(c, "", "--check").rc).toBe(1);
  });

  it("sem o clone de uma skill do catálogo, falha (2) sem escrever", () => {
    const c = cenario();
    const r = spawnSync("bash", [SCRIPT], { encoding: "utf8", env: { ...process.env, EXPX_CATALOGO: c.catalogo, EXPX_MANIFESTO_SAIDA: c.saida, EXPX_HISTORICO: "" } });
    expect(r.status).toBe(2);
    expect(`${r.stderr}`).toContain("falta o clone de fx");
  });
});
