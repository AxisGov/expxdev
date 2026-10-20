import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { RAIZ_DO_REPO } from "../teste/candidatos.js";

const temporarios: string[] = [];
const SCRIPT = join(RAIZ_DO_REPO, "scripts", "homologar-codeant-cli.mjs");
const VERSAO = "0.5.14";
const GIT_HEAD = "475f9793969c3c86cb0dae04acc64884af2ee1f1";
const TAR = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";

const FONTE = `
import path from 'node:path';
const MAX_REVIEW_FILES = 40;
const MAX_FILE_LINES = 5000;
const MAX_FILE_SIZE_BYTES = 200 * 1024;
const EXCLUDED_FILENAMES = new Set([
  'package-lock.json',
  'go.sum',
]);
const EXCLUDED_EXTENSIONS = new Set([
  '.png',
  '.pdf',
]);
function isReviewableFile(filePath) {
  const basename = path.basename(filePath);
  if (EXCLUDED_FILENAMES.has(basename)) return false;
  const ext = path.extname(basename).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) return false;
  if (basename.endsWith('.min.js') || basename.endsWith('.min.css')) return false;
  return true;
}
const motivoBytes = \`too large (\${fileSizeKB} KB, max \${MAX_FILE_SIZE_BYTES / 1024} KB)\`;
const motivoLinhas = \`too large (\${lineCount} lines, max \${MAX_FILE_LINES})\`;
const motivoCorte = \`exceeded \${MAX_REVIEW_FILES}-file limit\`;
`;

type Cenario = {
  raiz: string;
  tarball: string;
  packument: string;
  saida: string;
  integridade: string;
  arquivos: Record<string, Buffer>;
};

afterEach(() => {
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
});

function sha256(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

function montar(
  fonte = FONTE,
  packument?: Record<string, unknown>,
  packageJson: Record<string, unknown> = { name: "codeant-cli", version: VERSAO, bin: { codeant: "src/index.js" } },
): Cenario {
  const raiz = mkdtempSync(join(tmpdir(), "expx-homologar-codeant-"));
  temporarios.push(raiz);
  const pacote = join(raiz, "conteudo", "package");
  mkdirSync(join(pacote, "src", "utils"), { recursive: true });
  const arquivos: Record<string, Buffer> = {
    "package.json": Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`),
    "src/index.js": Buffer.from("#!/usr/bin/env node\n"),
    "src/utils/reviewApiHelper.js": Buffer.from(fonte),
  };
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const caminho = join(pacote, ...relativo.split("/"));
    mkdirSync(join(caminho, ".."), { recursive: true });
    writeFileSync(caminho, conteudo);
  }

  const tarball = join(raiz, "codeant-cli.tgz");
  const tar = spawnSync(TAR, ["-czf", tarball, "-C", join(raiz, "conteudo"), "package"], { encoding: "utf8" });
  expect(tar.status, `${tar.stdout}${tar.stderr}`).toBe(0);
  const integridade = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
  const packumentFinal = packument ?? {
    version: VERSAO,
    gitHead: GIT_HEAD,
    dist: { integrity: integridade, tarball: "https://registry.example/codeant-cli.tgz" },
  };
  const caminhoPackument = join(raiz, "packument.json");
  writeFileSync(caminhoPackument, `${JSON.stringify(packumentFinal)}\n`);
  return { raiz, tarball, packument: caminhoPackument, saida: join(raiz, "saida"), integridade, arquivos };
}

function rodar(c: Cenario, extras: string[] = []) {
  return spawnSync(process.execPath, [
    SCRIPT,
    "--versao", VERSAO,
    "--integridade", c.integridade,
    "--git-head", GIT_HEAD,
    "--tarball", c.tarball,
    "--packument", c.packument,
    "--saida", c.saida,
    ...extras,
  ], { encoding: "utf8" });
}

describe("homologar-codeant-cli.mjs", () => {
  it("funcional: grava limites, exclusões, motivos, identidade e manifesto ordenado", () => {
    const c = montar();
    const r = rodar(c);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);

    const perfil = JSON.parse(readFileSync(join(c.saida, "codeant-cli-0.5.14.json"), "utf8")) as Record<string, unknown>;
    expect(perfil).toMatchObject({
      perfil: "codeant-cli",
      versao: VERSAO,
      integridade: c.integridade,
      git_head: GIT_HEAD,
      fonte: "src/utils/reviewApiHelper.js",
      max_files: 40,
      max_linhas: 5000,
      max_bytes: 204800,
      excluidos: { nomes: ["package-lock.json", "go.sum"], extensoes: [".png", ".pdf"], sufixos: [".min.js", ".min.css"] },
      motivos: {
        exatos: ["binary/generated", "deleted", "excluded by pattern", "exceeded 40-file limit"],
        padroes: ["^too large \\([0-9]+ KB, max 200 KB\\)$", "^too large \\([0-9]+ lines, max 5000\\)$"],
      },
      package_json: { name: "codeant-cli", version: VERSAO, bin: { codeant: "src/index.js" } },
    });
    expect(perfil["manifesto"]).toEqual({
      "package.json": sha256(c.arquivos["package.json"]),
      "src/index.js": sha256(c.arquivos["src/index.js"]),
      "src/utils/reviewApiHelper.js": sha256(c.arquivos["src/utils/reviewApiHelper.js"]),
    });
    expect(Object.keys(perfil["manifesto"] as object)).toEqual(["package.json", "src/index.js", "src/utils/reviewApiHelper.js"]);
  });

  it("funcional: integridade diferente sai 1 e não grava perfil", () => {
    const c = montar();
    writeFileSync(c.tarball, Buffer.concat([readFileSync(c.tarball), Buffer.from("alterado")]));
    const r = rodar(c);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("integridade do tarball difere");
    expect(existsSync(join(c.saida, "codeant-cli-0.5.14.json"))).toBe(false);
  });

  it.each([
    ["gitHead", (c: Cenario) => ({ version: VERSAO, gitHead: "outro", dist: { integrity: c.integridade } })],
    ["dist.integrity", (c: Cenario) => ({ version: VERSAO, gitHead: GIT_HEAD, dist: { integrity: "sha512-outro" } })],
    ["version", (c: Cenario) => ({ version: "0.5.15", gitHead: GIT_HEAD, dist: { integrity: c.integridade } })],
  ])("funcional: packument com %s diferente sai 1 antes de gravar", (_campo, alterar) => {
    const base = montar();
    const packument = alterar(base);
    writeFileSync(base.packument, `${JSON.stringify(packument)}\n`);
    const r = rodar(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("packument diverge");
    expect(existsSync(join(base.saida, "codeant-cli-0.5.14.json"))).toBe(false);
  });

  it.each([
    ["MAX_REVIEW_FILES", "const MAX_REVIEW_FILES = 40;"],
    ["EXCLUDED_EXTENSIONS", "const EXCLUDED_EXTENSIONS = new Set(["],
    ["too large", "too large ("],
    ["file limit", "-file limit"],
  ])("funcional: fonte sem %s exige homologação manual e não grava", (_nome, trecho) => {
    const fonte = trecho === "too large (" ? FONTE.replaceAll(trecho, "REMOVIDO") : FONTE.replace(trecho, "REMOVIDO");
    const c = montar(fonte);
    const r = rodar(c);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("homologue à mão");
    expect(existsSync(join(c.saida, "codeant-cli-0.5.14.json"))).toBe(false);
  });

  it("funcional: forma do predicado diferente da emenda exige homologação manual", () => {
    const c = montar(FONTE.replace("path.extname(basename).toLowerCase()", "path.extname(basename)"));
    const r = rodar(c);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("homologue à mão");
  });

  it.each([
    ["resultado invertido", FONTE.replace("return false;", "return true;")],
    ["exclusao adicional", FONTE.replace("  return true;", "  if (basename === 'extra.js') return false;\n  return true;")],
    ["ramos reordenados", FONTE.replace(
      "  if (EXCLUDED_FILENAMES.has(basename)) return false;\n  const ext = path.extname(basename).toLowerCase();\n  if (EXCLUDED_EXTENSIONS.has(ext)) return false;",
      "  const ext = path.extname(basename).toLowerCase();\n  if (EXCLUDED_EXTENSIONS.has(ext)) return false;\n  if (EXCLUDED_FILENAMES.has(basename)) return false;",
    )],
  ])("funcional: predicado com %s exige homologacao manual", (_caso, fonte) => {
    const r = rodar(montar(fonte));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("homologue");
  });

  it("funcional: endsWith fora do predicado nao altera os sufixos homologados", () => {
    const c = montar(`${FONTE}\nconst irrelevante = nome.endsWith('.fora');\n`);
    const r = rodar(c);
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    const perfil = JSON.parse(readFileSync(join(c.saida, "codeant-cli-0.5.14.json"), "utf8"));
    expect(perfil.excluidos.sufixos).toEqual([".min.js", ".min.css"]);
  });

  it("funcional: predicado comentado nao mascara uma implementacao divergente", () => {
    const predicado = FONTE.match(/function isReviewableFile[\s\S]*?\n}/)![0];
    const divergente = FONTE.replace("return false;", "return true;");
    const r = rodar(montar(`/* ${predicado} */\n${divergente}`));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("homologue");
  });

  it("funcional: duas declaracoes do predicado exigem homologacao manual", () => {
    const duplicado = `${FONTE}\nfunction isReviewableFile(filePath) { return true; }\n`;
    const r = rodar(montar(duplicado));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("homologue");
  });

  it.each([
    ["string", "src/index.js"],
    ["objeto vazio", {}],
    ["comando extra", { codeant: "src/index.js", outro: "src/index.js" }],
    ["alvo nao textual", { codeant: 42 }],
  ])("funcional: package.json bin %s e recusado", (_caso, bin) => {
    const c = montar(FONTE, undefined, { name: "codeant-cli", version: VERSAO, bin });
    const r = rodar(c);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("package.json");
    expect(existsSync(join(c.saida, "codeant-cli-0.5.14.json"))).toBe(false);
  });

  it("funcional: argumentos incompletos saem 2 sem escrever", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--versao", VERSAO], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("uso:");
  });
});
