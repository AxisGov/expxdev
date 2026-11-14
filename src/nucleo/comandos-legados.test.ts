import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hashNormalizado,
  planejarRemocaoDeComandosLegados,
  type ManifestoDeComandos,
} from "./comandos-legados.js";
import { CATALOGO } from "./catalogo.js";
import { MANIFESTO_DE_COMANDOS } from "./comandos-legados-manifesto.js";
import { suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";

/*
 * Os comandos legados em `.claude/commands/` (conselhos-municipais, 2026-11-14):
 * uma cópia manual do "framework p0", anterior ao expxdev, que o init nunca gravou
 * e o lock não conhece. Sem prefixo, `/mergex-check` rodava o texto antigo. O init
 * remove o arquivo só quando o homônimo está no plugin e o conteúdo é uma versão
 * que o fork AxisGov publicou naquele caminho (o manifesto embarcado). O lock não
 * autoriza nada aqui: ele é editável (f5846c8).
 */

const temporarios: string[] = [];
afterEach(() => {
  for (const t of temporarios.splice(0)) rmSync(t, { recursive: true, force: true });
});
function projeto(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-legados-"));
  temporarios.push(d);
  mkdirSync(join(d, ".claude", "commands"), { recursive: true });
  return d;
}
const V1 = "# /mergex-check\n\nVersao publicada pelo fork.\n";
const V2 = "# /sprintx\n\nOutra versao publicada.\n";
const manifesto: ManifestoDeComandos = {
  versao: 1,
  fontes: [],
  comandos: {
    "mergex-check.md": [hashNormalizado(Buffer.from(V1))],
    "sprintx.md": [hashNormalizado(Buffer.from(V2))],
  },
};
const plugin = new Set(["mergex-check.md", "sprintx.md", "mergex.md"]);

describe("hashNormalizado", () => {
  it("é o sha256 do conteúdo com CRLF trocado por LF", () => {
    expect(hashNormalizado(Buffer.from("a\r\nb\r\n"))).toBe(hashNormalizado(Buffer.from("a\nb\n")));
    expect(hashNormalizado(Buffer.from("a\nb\n"))).toMatch(/^[0-9a-f]{64}$/);
    expect(hashNormalizado(Buffer.from("a\nb"))).not.toBe(hashNormalizado(Buffer.from("a\nb\n")));
  });
});

describe("planejarRemocaoDeComandosLegados", () => {
  it("remove a versão publicada com homônimo no plugin, em LF e em CRLF", () => {
    const r = projeto();
    writeFileSync(join(r, ".claude", "commands", "mergex-check.md"), V1);
    writeFileSync(join(r, ".claude", "commands", "sprintx.md"), V2.replace(/\n/g, "\r\n"));
    const p = planejarRemocaoDeComandosLegados(r, plugin, manifesto);
    expect(p.remover).toEqual([".claude/commands/mergex-check.md", ".claude/commands/sprintx.md"]);
    expect(p.mantidos).toEqual([]);
  });

  it("conteúdo alterado à mão fica, e é listado como mantido", () => {
    const r = projeto();
    writeFileSync(join(r, ".claude", "commands", "mergex-check.md"), `${V1}\nnota minha\n`);
    const p = planejarRemocaoDeComandosLegados(r, plugin, manifesto);
    expect(p.remover).toEqual([]);
    expect(p.mantidos).toEqual([".claude/commands/mergex-check.md"]);
  });

  it("sem homônimo no plugin, o comando é da pessoa: nem remove nem avisa", () => {
    const r = projeto();
    writeFileSync(join(r, ".claude", "commands", "meu-comando.md"), V1);
    const sem = new Set(["sprintx.md"]);
    const p = planejarRemocaoDeComandosLegados(r, sem, { ...manifesto, comandos: { ...manifesto.comandos, "meu-comando.md": [hashNormalizado(Buffer.from(V1))] } });
    expect(p).toEqual({ remover: [], mantidos: [] });
  });

  it("o hash conta só para o próprio nome: a versão de outro comando não autoriza", () => {
    const r = projeto();
    writeFileSync(join(r, ".claude", "commands", "mergex.md"), V1);
    const p = planejarRemocaoDeComandosLegados(r, plugin, manifesto);
    expect(p.remover).toEqual([]);
    expect(p.mantidos).toEqual([".claude/commands/mergex.md"]);
  });

  it("subpasta, nome parecido e arquivo fora de .claude/commands não entram", () => {
    const r = projeto();
    mkdirSync(join(r, ".claude", "commands", "sub"), { recursive: true });
    writeFileSync(join(r, ".claude", "commands", "sub", "mergex-check.md"), V1);
    writeFileSync(join(r, ".claude", "commands", "mergex-check.md.bak"), V1);
    writeFileSync(join(r, ".claude", "mergex-check.md"), V1);
    expect(planejarRemocaoDeComandosLegados(r, plugin, manifesto)).toEqual({ remover: [], mantidos: [] });
  });

  it("sem .claude/commands, nada a fazer", () => {
    const r = mkdtempSync(join(tmpdir(), "expx-legados-"));
    temporarios.push(r);
    expect(planejarRemocaoDeComandosLegados(r, plugin, manifesto)).toEqual({ remover: [], mantidos: [] });
  });

  it.runIf(suportaSymlinkDeDiretorio())("link no percurso ou no arquivo nunca é removido", () => {
    const r = projeto();
    const fora = mkdtempSync(join(tmpdir(), "expx-legados-fora-"));
    temporarios.push(fora);
    writeFileSync(join(fora, "mergex-check.md"), V1);
    symlinkSync(join(fora, "mergex-check.md"), join(r, ".claude", "commands", "mergex-check.md"));
    expect(planejarRemocaoDeComandosLegados(r, plugin, manifesto)).toEqual({ remover: [], mantidos: [] });

    const r2 = mkdtempSync(join(tmpdir(), "expx-legados-"));
    temporarios.push(r2);
    mkdirSync(join(r2, ".claude"), { recursive: true });
    mkdirSync(join(fora, "commands"));
    writeFileSync(join(fora, "commands", "sprintx.md"), V2);
    symlinkSync(join(fora, "commands"), join(r2, ".claude", "commands"));
    expect(planejarRemocaoDeComandosLegados(r2, plugin, manifesto)).toEqual({ remover: [], mantidos: [] });
  });
});

describe("o manifesto embarcado", () => {
  it("foi gerado dos commits certificados do catálogo, exatamente (rode scripts/comandos-legados.sh ao mover um pin)", () => {
    // a lista inteira, na ordem do catálogo: fonte a mais, a menos ou velha é manifesto desatualizado
    const certificadas = MANIFESTO_DE_COMANDOS.fontes.filter((f) => f.papel === "certificado").map((f) => `${f.skill} ${f.commit}`);
    expect(certificadas).toEqual(CATALOGO.map((s) => `${s.nome} ${s.certificado}`));
    // o conteúdo é cobrado pelo scripts/ci/test-manifesto-de-comandos.sh (--check sobre clones dos forks, no CI)
  });

  it("tem as duas versões da buildx que só existem em ramos do fork", () => {
    const extras = MANIFESTO_DE_COMANDOS.fontes.filter((f) => f.papel === "historico").map((f) => f.commit);
    expect(extras).toEqual(expect.arrayContaining(["5364de54af90663eb0e64bf8264ad47d6b5481dd", "174c044313878330a79831fb55d6bf8cc0499325"]));
  });

  it("é ordenado e só tem sha256", () => {
    const nomes = Object.keys(MANIFESTO_DE_COMANDOS.comandos);
    expect(nomes).toEqual([...nomes].sort());
    for (const n of nomes) {
      expect(n).toMatch(/^[a-z0-9][a-z0-9-]*\.md$/);
      const hs = MANIFESTO_DE_COMANDOS.comandos[n] ?? [];
      expect(hs.length).toBeGreaterThan(0);
      expect(hs).toEqual([...new Set(hs)].sort());
      for (const h of hs) expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
