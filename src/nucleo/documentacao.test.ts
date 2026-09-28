import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A contagem de skills está escrita em prosa em vários lugares, e prosa
 * desatualizada não quebra teste nenhum — ela só mente. Este teste é a guarda.
 *
 * Cuidado deliberado: "cinco estágios" fala dos estágios E1–E5 da runx e
 * NÃO deve ser trocado. Só a contagem de skills muda: hoje são nove.
 *
 * A contagem de verificações do `doctor` tem o mesmo problema, e provou ter:
 * ela ficou desatualizada duas vezes seguidas, em lugares diferentes, porque
 * cada revisão encontrava uma cópia e a corrigia sozinha. Aqui a fonte de
 * verdade é o CÓDIGO — os achados declarados em `doctor/verificadores.ts` — e a
 * prosa e as tabelas precisam bater com ele.
 */

const ARQUIVOS = ["README.md", "src/nucleo/catalogo.ts", "src/nucleo/catalogo.test.ts"];

/** Os achados que o `doctor` pode emitir: a fonte de verdade da contagem. */
function verificacoesDoDoctor(): number {
  const fonte = readFileSync("src/doctor/verificadores.ts", "utf8");
  const fixos = fonte.match(/\bid: "/g)?.length ?? 0;
  // `id: \`${skill}-sem-motor\`` é um achado só, com id montado por skill
  const montados = fonte.match(/\bid: `/g)?.length ?? 0;
  return fixos + montados;
}

/**
 * O número por extenso, como a prosa o escreve. Janela estreita de propósito: se
 * a contagem sair dela, o teste manda estender o mapa em vez de adivinhar.
 */
const EXTENSO: Record<number, string> = {
  25: "Vinte e cinco",
  26: "Vinte e seis",
  27: "Vinte e sete",
  28: "Vinte e oito",
  29: "Vinte e nove",
  30: "Trinta",
};

function extenso(n: number): string {
  const e = EXTENSO[n];
  if (e === undefined) throw new Error(`adicione ${String(n)} ao mapa EXTENSO deste teste`);
  return e;
}

/** As linhas de uma tabela markdown da seção que começa em `titulo`. */
function linhasDaTabela(markdown: string, titulo: string): number {
  const i = markdown.indexOf(titulo);
  if (i < 0) throw new Error(`secao ausente no README: ${titulo}`);
  const resto = markdown.slice(i + titulo.length);
  const fim = resto.indexOf("\n## ");
  const secao = fim < 0 ? resto : resto.slice(0, fim);
  // `|` cru, e não `"| "`: a linha separadora é `|---|---|`, sem espaço.
  // Menos o cabeçalho e menos o separador.
  return secao.split("\n").filter((l) => l.startsWith("|")).length - 2;
}

describe("contagem de skills na documentação", () => {
  it("integração: nenhum arquivo ainda diz 'cinco skills' nem 'seis skills'", () => {
    for (const a of ARQUIVOS) {
      const conteudo = readFileSync(a, "utf8");
      expect(conteudo).not.toContain("cinco skills");
      expect(conteudo).not.toContain("seis skills");
    }
  });

  it("funcional: o README diz nove skills e preserva 'cinco estágios'", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("nove skills");
    // os estágios da runx continuam sendo cinco: E1 a E5
    expect(readme).toContain("cinco estágios");
  });
});

describe("contagem de verificações do doctor na documentação", () => {
  const n = verificacoesDoDoctor();

  it("funcional: o README diz a contagem do código, e a tabela tem essa quantidade de linhas", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain(`${extenso(n)} verificações, cada uma com severidade`);
    expect(linhasDaTabela(readme, "## O que o `doctor` verifica")).toBe(n);
  });

  it("funcional: a árvore de pastas do README não repete a contagem — número ali só envelhece", () => {
    const readme = readFileSync("README.md", "utf8");
    const linha = /^ {2}doctor\/ +(.*)$/m.exec(readme);
    expect(linha, "a arvore de src/ perdeu a linha do doctor/").not.toBeNull();
    const descricao = (linha as RegExpExecArray)[1] as string;
    for (const palavra of Object.values(EXTENSO)) {
      expect(descricao.toLowerCase()).not.toContain(palavra.toLowerCase());
    }
    expect(descricao).not.toMatch(/quatorze|catorze|dezesseis|\d/);
  });

  it("funcional: o docs-site diz a mesma contagem na prosa, no cartão e na tabela", () => {
    const site = readFileSync("docs-site/index.html", "utf8");
    expect(site).toContain(`${extenso(n)} verificações, cada uma com severidade`);
    expect(site).toContain(
      `<div class="cartao__num">${String(n)}</div><div class="cartao__rot">verificações do doctor</div>`,
    );
    const i = site.indexOf('<section class="secao" id="doctor"');
    const tabela = site.slice(i, site.indexOf("</section>", i));
    expect(tabela.split("<tr><td><code>").length - 1).toBe(n);
  });

  it("funcional: a apresentação diz a mesma contagem no número e no cartão do doctor", () => {
    const apre = readFileSync("docs-site/apresentacao.html", "utf8");
    const i = apre.indexOf("VERIFICAÇÕES DO DOCTOR");
    expect(i, "a apresentacao perdeu o indicador de verificacoes do doctor").toBeGreaterThan(0);
    expect(apre.slice(Math.max(0, i - 200), i)).toContain(`<div class="stat-value">${String(n)}</div>`);
    expect(apre).toContain(`Diagnostica uma instalação quebrada, ${String(n)} verificações.`);
  });
});
