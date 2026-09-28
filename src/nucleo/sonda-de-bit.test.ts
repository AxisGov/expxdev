import { describe, it, expect, afterEach } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decidirPreservaBit, raizPreservaBitExecutavel } from "./modo-executavel.js";
import { suportaBitExecutavel } from "../teste/fs-capacidades.js";

/**
 * A sonda que decide se vale cobrar o bit de execução no disco.
 *
 * Ela ESCREVE na pasta do projeto, e por isso tem dois deveres: não deixar
 * resíduo, e não ser chamada quando não há pergunta a responder (isso é
 * verificado no portão, em `doctor/modo-executavel.test.ts`).
 *
 * A decisão em si é de dois tempos, e é o que evita o falso positivo em
 * filesystem que não sabe dizer "não executável". Esse ramo não é reproduzível
 * numa bancada ext4, então ele é medido pela função pura, com os modos que cada
 * plataforma devolve de verdade — e a sonda completa é medida em ext4.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) {
    try {
      chmodSync(c, 0o755);
    } catch {
      // pasta já removida
    }
    rmSync(c, { recursive: true, force: true });
  }
});

function temporario(prefixo = "expx-sonda-"): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

/** Sobras da sonda, em qualquer nível que ela possa ter escrito. */
function residuos(raiz: string): string[] {
  const saida: string[] = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const d = fila.shift() as string;
    for (const e of readdirSync(d)) {
      if (e.startsWith(".modo-")) saida.push(join(d, e));
      const p = join(d, e);
      if (statSync(p).isDirectory()) fila.push(p);
    }
  }
  return saida;
}

describe("decidirPreservaBit — os modos que cada plataforma devolve", () => {
  it("funcional: ext4/APFS distingue os dois modos, e a resposta é confiável", () => {
    expect(decidirPreservaBit(0o100644, 0o100755)).toBe(true);
  });

  it("funcional: Windows nativo — o chmod não muda o modo POSIX, e nada é cobrado", () => {
    // o Node devolve 0o100666 para arquivo gravável no NTFS, antes e depois
    expect(decidirPreservaBit(0o100666, 0o100666)).toBe(false);
  });

  it("funcional: WSL/DrvFs — todo arquivo aparece 0777, e o bit nunca DESAPARECE", () => {
    // o primeiro tempo já reprova: um filesystem que não sabe dizer "não
    // executável" também não sabe acusar a ausência do bit
    expect(decidirPreservaBit(0o100777, 0o100777)).toBe(false);
  });

  it("funcional: bit que aparece sozinho, sem ninguém pedir, também reprova", () => {
    expect(decidirPreservaBit(0o100755, 0o100755)).toBe(false);
  });

  it("funcional: bit que some depois de pedido reprova: a resposta não é confiável", () => {
    expect(decidirPreservaBit(0o100644, 0o100644)).toBe(false);
  });
});

describe("raizPreservaBitExecutavel — a sonda real", () => {
  it("integração: em filesystem POSIX responde true e não deixa resíduo", () => {
    expect(suportaBitExecutavel()).toBe(true); // a bancada precisa ser ext4/APFS
    const raiz = temporario();
    expect(raizPreservaBitExecutavel(raiz)).toBe(true);
    expect(residuos(raiz)).toEqual([]);
    expect(readdirSync(raiz)).toEqual([]);
  });

  it("integração: com .expx/ a sonda mora lá, e também sai sem deixar rastro", () => {
    const raiz = temporario();
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(join(raiz, ".expx", "expx-lock.json"), "{}\n");
    expect(raizPreservaBitExecutavel(raiz)).toBe(true);
    expect(residuos(raiz)).toEqual([]);
    // e a raiz do produto continua com o que era dela
    expect(readdirSync(raiz)).toEqual([".expx"]);
    expect(readdirSync(join(raiz, ".expx"))).toEqual(["expx-lock.json"]);
  });

  it("integração: raiz sem permissão de escrita responde false, sem lançar e sem resíduo", () => {
    if (process.getuid?.() === 0) return; // root escreve em qualquer lugar
    const raiz = temporario();
    chmodSync(raiz, 0o555);
    expect(raizPreservaBitExecutavel(raiz)).toBe(false);
    chmodSync(raiz, 0o755);
    expect(readdirSync(raiz)).toEqual([]);
  });

  it("integração: raiz que não existe responde false, sem lançar", () => {
    expect(raizPreservaBitExecutavel(join(temporario(), "nao", "existe"))).toBe(false);
  });

  it("integração: chamadas repetidas não acumulam nada", () => {
    const raiz = temporario();
    for (let i = 0; i < 5; i++) expect(raizPreservaBitExecutavel(raiz)).toBe(true);
    expect(readdirSync(raiz)).toEqual([]);
  });
});
