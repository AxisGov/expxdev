import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { fazerBackup, hojeISO } from "./backup.js";
import { mesclarSettings, caminhoDoSettings } from "./settings.js";

let p: ProjetoTemporario | undefined;
afterEach(() => {
  p?.descartar();
  p = undefined;
});

describe("backup e recusa de JSON inválido", () => {
  it("integração: settings inválido não é alterado e o merge devolve erro", () => {
    p = projetoTemporario("fixtures/cli/settings-invalido");
    const caminho = caminhoDoSettings(p.raiz);
    const antes = readFileSync(caminho, "utf8");

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("JSON valido");

    expect(readFileSync(caminho, "utf8")).toBe(antes);
    expect(readdirSync(join(p.raiz, ".claude")).filter((a) => a.includes("backup"))).toHaveLength(0);
  });

  it("funcional: settings válido gera cópia com a data no nome antes da escrita", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    const caminho = caminhoDoSettings(p.raiz);
    const original = readFileSync(caminho, "utf8");

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup).toBeDefined();
    expect(r.backup).toContain(hojeISO());
    expect(readFileSync(r.backup ?? "", "utf8")).toBe(original);
  });

  it("funcional: dois backups no mesmo dia não se sobrescrevem", () => {
    p = projetoTemporario();
    const arquivo = join(p.raiz, "config.json");
    writeFileSync(arquivo, "primeiro");
    const b1 = fazerBackup(arquivo);
    writeFileSync(arquivo, "segundo");
    const b2 = fazerBackup(arquivo);

    expect(b1).not.toBe(b2);
    expect(readFileSync(b1, "utf8")).toBe("primeiro");
    expect(readFileSync(b2, "utf8")).toBe("segundo");
    expect(existsSync(b1)).toBe(true);
  });
});

/** O projeto vira repositório com o settings.json commitado: o git já guarda a versão anterior. */
function versionarSettings(raiz: string): void {
  const env = { ...process.env, GIT_AUTHOR_NAME: "e", GIT_AUTHOR_EMAIL: "e@e.invalid", GIT_COMMITTER_NAME: "e", GIT_COMMITTER_EMAIL: "e@e.invalid" };
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: raiz, env });
  execFileSync("git", ["add", "--", ".claude/settings.json"], { cwd: raiz, env });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "settings"], { cwd: raiz, env });
}

function backupsEm(raiz: string): string[] {
  return readdirSync(join(raiz, ".claude")).filter((a) => a.includes("backup"));
}

describe("backup do settings.json versionado", () => {
  it("funcional: rastreado e limpo não ganha cópia ao lado, porque o versionador já desfaz", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    versionarSettings(p.raiz);

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup).toBeUndefined();
    expect(r.backupOmitidoPorGitLimpo).toBe(true);
    expect(backupsEm(p.raiz)).toHaveLength(0);
  });

  it("funcional: rastreado com edição pendente ganha cópia, porque a edição não está no git", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    versionarSettings(p.raiz);
    const caminho = caminhoDoSettings(p.raiz);
    const editado = readFileSync(caminho, "utf8").replace(/\}\s*$/, ', "ajusteManual": true }\n');
    writeFileSync(caminho, editado);

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backupOmitidoPorGitLimpo).toBeUndefined();
    expect(readFileSync(r.backup ?? "", "utf8")).toBe(editado);
  });

  it("funcional: não rastreado num repositório git ganha cópia", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: p.raiz });

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backupOmitidoPorGitLimpo).toBeUndefined();
    expect(r.backup).toBeDefined();
  });

  // sem privilégio, o Windows não cria link simbólico; o CI Linux roda o caso
  it.skipIf(process.platform === "win32")("funcional: rastreado como link simbólico ganha cópia, porque o git não guarda o alvo", () => {
    p = projetoTemporario("fixtures/cli/settings-valido");
    const caminho = caminhoDoSettings(p.raiz);
    const original = readFileSync(caminho, "utf8");
    renameSync(caminho, join(p.raiz, "settings-real.json"));
    symlinkSync("../settings-real.json", caminho);
    versionarSettings(p.raiz);

    const r = mesclarSettings(p.raiz, "/qualquer/caminho");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backupOmitidoPorGitLimpo).toBeUndefined();
    expect(readFileSync(r.backup ?? "", "utf8")).toBe(original);
  });
});
