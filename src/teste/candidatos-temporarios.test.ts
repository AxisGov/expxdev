import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fontesCandidatas,
  larIsolado,
  noPath,
  novoProduto,
  pathControlado,
  pathDosHooksSemJq,
  temporarios,
} from "./candidatos.js";

/**
 * O ciclo de vida dos temporários da bancada de candidatas.
 *
 * A bancada P0.2 monta PATH controlado a cada `init` e a cada `doctor`, e o
 * caminho que `pathControlado` devolve nunca chegava ao `afterAll`: a certificação
 * deixava uma pasta `expx-bin-*` por chamada no temporário do sistema — 36 numa
 * única execução dos dois arquivos de certificação, mais uma `expx-sem-jq-*`. É
 * pasta órfã, de dono nenhum, que ninguém mais vai remover.
 *
 * O que estes testes fixam é o CONTRATO do ciclo, não a contagem:
 *
 *   1. toda pasta que um helper daqui cria nasce sob o ciclo, antes de qualquer
 *      trabalho que possa falhar — então erro e retorno antecipado não deixam órfã;
 *   2. `temporarios.descartar()` remove tudo que está sob o ciclo;
 *   3. o descarte é pela LISTA de caminhos desta execução, nunca por prefixo —
 *      pasta que o helper não criou sobrevive, mesmo com o mesmo prefixo.
 *
 * O TMPDIR é privado em toda prova de ausência: o que aparece nele foi criado
 * pela chamada sob teste, e por mais nada. Nenhuma asserção aqui depende de
 * temporário deixado por execução anterior, nem de varredura do temporário real.
 */

const POSIX = process.platform !== "win32";

/** Roda `f` com variáveis de ambiente trocadas, e devolve cada uma ao que era. */
function comAmbiente(trocas: Record<string, string>, f: () => void): void {
  const antes = new Map(Object.keys(trocas).map((k) => [k, process.env[k]]));
  Object.assign(process.env, trocas);
  try {
    f();
  } finally {
    for (const [k, v] of antes) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Uma pasta temporária deste arquivo — fora do ciclo, para ser o TMPDIR privado da prova. */
function privado(prefixo: string): string {
  return mkdtempSync(join(tmpdir(), prefixo));
}

afterAll(() => {
  temporarios.descartar();
});

describe("temporários da bancada de candidatas — o ciclo recolhe o que os helpers criam", () => {
  it.skipIf(!POSIX)("funcional: a pasta de links do PATH controlado nasce sob o ciclo e sai no descarte", () => {
    const bin = pathControlado(true);
    expect(temporarios.lista()).toContain(bin);
    expect(existsSync(bin)).toBe(true);
    // o git REAL, alvo do link que está dentro dela
    const git = noPath("git");
    expect(git).toBeDefined();

    temporarios.descartar();

    expect(existsSync(bin)).toBe(false);
    expect(temporarios.lista()).toEqual([]);
    // o descarte levou o link, não o binário: só sai o que o helper criou
    expect(existsSync(git as string)).toBe(true);
  });

  it.skipIf(!POSIX)("funcional: a pasta de links sem jq nasce sob o ciclo e sai no descarte", () => {
    const semJq = pathDosHooksSemJq();
    expect(temporarios.lista()).toContain(semJq);
    expect(readdirSync(semJq).length).toBeGreaterThan(5);

    temporarios.descartar();

    expect(existsSync(semJq)).toBe(false);
    expect(existsSync(noPath("bash") as string)).toBe(true);
  });

  it("funcional: fontes, produto e lar nascem sob o ciclo e saem no descarte", () => {
    const fontes = fontesCandidatas();
    const produto = novoProduto("expx-teste-ciclo-produto-");
    const { lar } = larIsolado();
    for (const c of [fontes, produto, lar]) {
      expect(temporarios.lista(), c).toContain(c);
      expect(existsSync(c), c).toBe(true);
    }

    temporarios.descartar();

    for (const c of [fontes, produto, lar]) expect(existsSync(c), c).toBe(false);
    expect(temporarios.lista()).toEqual([]);
  }, 120000);

  it("funcional: caminho criado fora dos helpers entra no ciclo por adoção", () => {
    const fora = privado("expx-teste-adotado-");
    expect(temporarios.adotar(fora)).toBe(fora);
    expect(temporarios.lista()).toContain(fora);

    temporarios.descartar();

    expect(existsSync(fora)).toBe(false);
  });

  it("funcional: o descarte é pela lista — pasta de MESMO prefixo que o ciclo não conhece sobrevive", () => {
    // O prefixo de `fontesCandidatas`, numa pasta que o ciclo nunca registrou:
    // um descarte por padrão (`expx-candidatas-*`) a levaria embora.
    const forasteiro = privado("expx-candidatas-");
    try {
      const produto = novoProduto("expx-teste-ciclo-vizinho-");
      temporarios.descartar();

      expect(existsSync(produto)).toBe(false);
      expect(existsSync(forasteiro)).toBe(true);
    } finally {
      rmSync(forasteiro, { recursive: true, force: true });
    }
  });

  it("funcional: descartar duas vezes seguidas é inofensivo", () => {
    const produto = novoProduto("expx-teste-ciclo-duplo-");
    temporarios.descartar();
    expect(existsSync(produto)).toBe(false);
    expect(() => {
      temporarios.descartar();
    }).not.toThrow();
    expect(temporarios.lista()).toEqual([]);
  });
});

describe("temporários da bancada de candidatas — caminho de erro não deixa órfã", () => {
  it.skipIf(!POSIX)("funcional: externo ausente reprova pathDosHooksSemJq sem deixar pasta órfã", () => {
    const completo = pathDosHooksSemJq();
    // A lista NOMEADA de externos, lida do que o próprio helper montou.
    const externos = readdirSync(completo).sort();
    expect(externos.length).toBeGreaterThan(5);
    const ausente = "od";
    expect(externos).toContain(ausente);

    const parcial = privado("expx-teste-path-parcial-");
    const tmp = privado("expx-teste-tmp-sem-jq-");
    try {
      for (const nome of externos) if (nome !== ausente) symlinkSync(join(completo, nome), join(parcial, nome));
      comAmbiente({ PATH: parcial, TMPDIR: tmp }, () => {
        expect(() => pathDosHooksSemJq()).toThrow(/\bod ausente\b/);
      });
      // Nada foi criado: a conferência dos externos acontece ANTES da pasta existir.
      expect(readdirSync(tmp)).toEqual([]);
    } finally {
      rmSync(parcial, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
      temporarios.descartar();
    }
  });

  it.skipIf(!POSIX)("funcional: git ausente reprova fontesCandidatas, e o ciclo recolhe a pasta já criada", () => {
    // Aqui a pasta JÁ existe quando a falha acontece: `fontesCandidatas` copia o
    // snapshot antes de chamar o `git init`. Sem registro no nascimento, essa
    // pasta ficaria órfã — é o retorno antecipado que o ciclo tem de cobrir.
    const vazio = privado("expx-teste-path-vazio-");
    const tmp = privado("expx-teste-tmp-fontes-");
    try {
      comAmbiente({ PATH: vazio, TMPDIR: tmp }, () => {
        expect(() => fontesCandidatas()).toThrow();
      });
      const orfas = readdirSync(tmp);
      expect(orfas).toHaveLength(1);
      expect(temporarios.lista()).toContain(join(tmp, orfas[0] as string));

      temporarios.descartar();

      expect(readdirSync(tmp)).toEqual([]);
    } finally {
      rmSync(vazio, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
      temporarios.descartar();
    }
  }, 120000);
});
