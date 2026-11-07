import { describe, expect, it } from "vitest";
import { CABECALHO_PAPEIS, lerPapeis, projetarPapeis } from "./papeis.js";

/** CONTRATO-expx-orquestracao §11.4 (F4): a projeção dos papéis, lida pelos hooks. */

describe("projetarPapeis", () => {
  it("uma linha por agente, em ordem, com agente, skill e papel separados por TAB", () => {
    const r = projetarPapeis([
      { agente: "revisor-diff", skill: "mergex", papel: "revisar" },
      { agente: "qa", skill: "runx", papel: "testar" },
      { agente: "analista-de-conflito", skill: "mergex", papel: "investigar" },
    ]);
    expect(r).toEqual({
      ok: true,
      avisos: [],
      texto: `${CABECALHO_PAPEIS}\nanalista-de-conflito\tmergex\tinvestigar\nqa\trunx\ttestar\nrevisor-diff\tmergex\trevisar\n`,
    });
  });

  it("sem agente com papel, não há projeção", () => {
    expect(projetarPapeis([])).toEqual({ ok: true, avisos: [] });
  });

  it("agente repetido recusa o plano: a skill da linha não teria origem única", () => {
    const r = projetarPapeis([
      { agente: "qa", skill: "runx", papel: "testar" },
      { agente: "qa", skill: "sprintx", papel: "testar" },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("qa");
  });

  it("agente ou skill fora do vocabulário do rastro fica fora, com aviso: o evento dele seria inválido", () => {
    const r = projetarPapeis([
      { agente: "meu-revisor", skill: "mergex", papel: "revisar" },
      { agente: "qa", skill: "outra", papel: "testar" },
      { agente: "principal", skill: "sprintx", papel: "revisar" },
      { agente: "revisor-diff", skill: "mergex", papel: "revisar" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toBe(`${CABECALHO_PAPEIS}\nrevisor-diff\tmergex\trevisar\n`);
    expect(r.avisos).toHaveLength(3);
    for (const a of ["meu-revisor", "qa", "principal"]) expect(r.avisos.join("\n")).toContain(`agente ${a} `);
  });
});

describe("lerPapeis", () => {
  const ok = `${CABECALHO_PAPEIS}\nqa\trunx\ttestar\nrevisor-diff\tmergex\trevisar\n`;

  it("devolve as linhas do arquivo que a projeção escreveu", () => {
    expect(lerPapeis(ok)).toEqual({
      ok: true,
      itens: [
        { agente: "qa", skill: "runx", papel: "testar" },
        { agente: "revisor-diff", skill: "mergex", papel: "revisar" },
      ],
    });
  });

  it("CRLF, do checkout com core.autocrlf, vale como LF, nos três leitores", () => {
    expect(lerPapeis(ok.replace(/\n/g, "\r\n"))).toEqual(lerPapeis(ok));
    expect(lerPapeis(`${CABECALHO_PAPEIS}\nqa\trunx\ttestar\r`)).toMatchObject({ ok: true, itens: [{ agente: "qa", papel: "testar" }] });
  });

  it("agente fora do vocabulário do rastro vale na leitura, como nos hooks: só o init o deixa de fora", () => {
    expect(lerPapeis(`${CABECALHO_PAPEIS}\nmeu-agente\trunx\ttestar\n`).ok).toBe(true);
  });

  it.each([
    ["cabeçalho de outra versão", ok.replace("papeis 1", "papeis 2")],
    ["coluna a mais", `${CABECALHO_PAPEIS}\nqa\trunx\ttestar\textra\n`],
    ["coluna vazia", `${CABECALHO_PAPEIS}\nqa\t\ttestar\n`],
    ["papel fora do vocabulário", `${CABECALHO_PAPEIS}\nqa\trunx\taprovar\n`],
    ["o principal", `${CABECALHO_PAPEIS}\nprincipal\trunx\ttestar\n`],
    ["skill fora do vocabulário do rastro", `${CABECALHO_PAPEIS}\nqa\toutra\ttestar\n`],
    ["agente repetido", `${CABECALHO_PAPEIS}\nqa\trunx\ttestar\nqa\trunx\trevisar\n`],
  ])("recusa %s", (_, texto) => {
    expect(lerPapeis(texto).ok).toBe(false);
  });
});
