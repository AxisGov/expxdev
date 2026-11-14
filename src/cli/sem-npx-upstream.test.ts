import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { diagnosticar } from "../doctor/verificadores.js";

/*
 * `npx expxdev` instala o pacote `expxdev` do npm, que é do upstream (0.9.0), e não
 * este CLI: a linha AxisGov não publica no npm (README, "Instalar a partir da
 * release"). As mensagens do CLI mandavam a pessoa rodá-lo, e o doctor sugeria
 * `npx expxdev@latest` para atualizar (conselhos-municipais, 2026-11-14). O bin do
 * fork é `expx`; o CLI desatualizado se atualiza pela GitHub Release.
 */

const RAIZ = join(import.meta.dirname, "..", "..");

function fontes(dir: string): string[] {
  const saida: string[] = [];
  for (const n of readdirSync(dir)) {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) saida.push(...fontes(c));
    else if (/\.(ts|tsx|mjs|js)$/.test(n) && !/\.test\.tsx?$/.test(n)) saida.push(c);
  }
  return saida;
}

describe("o CLI nunca manda instalar o pacote do upstream", () => {
  it("nenhum código do CLI (src/ e nucleo/) cita npx expxdev", () => {
    const comNpx = [...fontes(join(RAIZ, "src")), ...fontes(join(RAIZ, "nucleo"))]
      .filter((f) => /npx\s+expxdev/.test(readFileSync(f, "utf8")))
      .map((f) => relative(RAIZ, f));
    expect(comNpx).toEqual([]);
  });

  it("o doctor manda atualizar o CLI pela release do fork, não pelo npm", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-lock-futuro-"));
    try {
      mkdirSync(join(raiz, ".expx"));
      writeFileSync(join(raiz, ".expx", "expx-lock.json"), `${JSON.stringify({ lock_version: 999, cli_version: "99.0.0", harness: ["claude"], skills: {} })}\n`);
      const futuro = diagnosticar(raiz).achados.find((a) => a.id === "lock-futuro");
      expect(futuro?.correcao).toContain("https://github.com/AxisGov/expxdev#instalar-a-partir-da-release");
      expect(futuro?.correcao).not.toMatch(/npx|@latest/);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
