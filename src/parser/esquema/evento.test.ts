import { describe, it, expect } from "vitest";
import {
  EXTRAS_EVENTO,
  CHAVES_EVENTO,
  chavesDesconhecidas,
  chavesFaltando,
  validarRastro,
} from "./evento.js";

/** Linha completa e válida; cada teste altera só o que precisa. */
function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: "2026-08-29T14:32:10Z",
    expx_eventos: 1,
    trabalho_id: "OC-2026-0142",
    ferramenta: "runx",
    origem: "hook",
    evento: "task_concluida",
    fase: "e3",
    task: "T-01.02",
    agente: "principal",
    resultado: "ok",
    detalhe: "suite verde, 14 testes",
    arquivos: ["src/frete/calculo.ts"],
    ...extra,
  };
}

const j = (o: Record<string, unknown>) => JSON.stringify(o);

describe("as doze chaves", () => {
  it("funcional: linha completa não tem defeito", () => {
    const r = validarRastro(j(linha()));
    expect(r.defeitos).toEqual([]);
    expect(r.linhas).toBe(1);
  });

  it("funcional: chave omitida é apontada pelo nome, com o número da linha", () => {
    const sem = linha();
    delete sem["agente"];
    const r = validarRastro(j(sem));
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.linha).toBe(1);
    expect(r.defeitos[0]?.motivo).toContain("agente");
  });

  it("funcional: valor null satisfaz a R6 — é a ausência omitida que viola", () => {
    const r = validarRastro(j(linha({ fase: null, task: null })));
    expect(r.defeitos).toEqual([]);
  });
});

describe("chaves extras", () => {
  // A regressão que motivou este módulo: um validador de igualdade estrita
  // reprovava toda linha da mergex e da legadox, que usam extras declaradas.
  it("integração: a linha da mergex, com `hook`, é válida", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "mergex", evento: "acao_bloqueada", resultado: "bloqueado", hook: "git-perigoso" })),
    );
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it("integração: a linha da legadox, com `hook` e `faixa`, é válida", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "legadox", evento: "regra_violada", resultado: "aviso", hook: "raio", faixa: "alta" })),
    );
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it("funcional: chave não declarada é avisada, mas não reprova a linha", () => {
    const r = validarRastro(j(linha({ gadget: "?" })));
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual(["gadget"]);
  });
});

describe("ferramenta e agente", () => {
  it("integração: as nove skills do método emitem rastro válido", () => {
    for (const f of ["sprintx", "runx", "mergex", "legadox", "stackx", "memox", "prodx", "buildx", "designx"]) {
      const r = validarRastro(j(linha({ ferramenta: f })));
      expect(r.defeitos, `ferramenta ${f}`).toEqual([]);
    }
  });

  it("funcional: `ferramenta` desconhecida é defeito", () => {
    const r = validarRastro(j(linha({ ferramenta: "inventada" })));
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.motivo).toContain("ferramenta");
  });

  it("funcional: os agentes que a mergex e a legadox gravam são válidos", () => {
    for (const a of ["revisor-diff", "analista-de-conflito", "avaliador-de-raio"]) {
      const r = validarRastro(j(linha({ agente: a })));
      expect(r.defeitos, `agente ${a}`).toEqual([]);
    }
  });
});

describe("formato do arquivo", () => {
  it("funcional: linha em branco é ignorada, não contada", () => {
    const r = validarRastro(`${j(linha())}\n\n${j(linha())}\n`);
    expect(r.linhas).toBe(2);
    expect(r.defeitos).toEqual([]);
  });

  it("funcional: JSON quebrado aponta a linha certa e não derruba as outras", () => {
    const r = validarRastro(`${j(linha())}\n{quebrado\n${j(linha())}`);
    expect(r.linhas).toBe(3);
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.linha).toBe(2);
  });

  it("funcional: `ts` fora do formato ISO-8601 UTC é defeito", () => {
    const r = validarRastro(j(linha({ ts: "2026-08-29 14:32:10" })));
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.motivo).toContain("ts");
  });
});

describe("as funcoes de chave", () => {
  it("unitário: chavesFaltando lista só o que falta", () => {
    const sem = linha();
    delete sem["detalhe"];
    delete sem["arquivos"];
    expect(chavesFaltando(sem).sort()).toEqual(["arquivos", "detalhe"]);
  });

  it("unitário: chavesDesconhecidas ignora as doze e as extras declaradas", () => {
    expect(chavesDesconhecidas(linha({ hook: "x", faixa: "alta" }))).toEqual([]);
  });

  it("unitário: o contrato tem exatamente doze chaves obrigatórias", () => {
    expect(CHAVES_EVENTO).toHaveLength(12);
  });
});

/**
 * D-06 — o contrato aceitava só 14 eventos e declarava só `hook`/`faixa`. O
 * catálogo da `sprintx` congelada tem vinte, oito deles fora do enum, e duas
 * extras que ninguém havia declarado. O `doctor` do replay C7-C reprovou 8 de 24
 * linhas de um rastro legítimo e chamou `sessao`/`harness` de chaves fora do
 * contrato.
 *
 * Fonte do catálogo: `references/08-rastro.md` da sprintx congelada
 * (4e1f7b88d85f3fe9f87ae578f7789760d92d6829), tabela "O que a skill grava".
 * Cada nome abaixo tem escritor oficial — não é fixture nem evento inventado.
 */
const EVENTOS_SPRINTX: Array<[evento: string, escritor: string]> = [
  ["fase_iniciada", "scripts/rastro.sh fase-iniciada"],
  ["fase_concluida", "scripts/rastro.sh fase-concluida"],
  ["task_iniciada", "scripts/rastro.sh task-iniciada"],
  ["task_concluida", "scripts/rastro.sh task-concluida"],
  ["task_bloqueada", "scripts/rastro.sh task-bloqueada"],
  ["veredito_emitido", "scripts/rastro.sh veredito-emitido"],
  ["checkpoint_planejamento", "scripts/planejamento.sh (rastro)"],
  ["replanejamento_execucao_iniciado", "scripts/planejamento.sh"],
  ["replanejamento_execucao_retomado", "scripts/planejamento.sh"],
  ["replanejamento_execucao_aprovado", "scripts/planejamento.sh"],
  ["replanejamento_execucao_esgotado", "scripts/planejamento.sh"],
  ["replanejamento_execucao_recusado", "scripts/planejamento.sh"],
  ["task_reaberta", "scripts/planejamento.sh"],
  ["bloqueio_resolvido", "scripts/bloqueios.sh resolver"],
  ["agente_iniciado", "reservado no contrato"],
  ["agente_concluido", "hooks/comum/rastro-subagente.sh"],
  ["suite_executada", "hooks/comum/rastro-post.sh"],
  ["arquivo_alterado", "hooks/comum/rastro-post.sh"],
  ["regra_violada", "hooks/sprintx/*.sh, modo aviso"],
  ["acao_bloqueada", "hooks/comum/segredo.sh, hooks/sprintx/*.sh"],
];

describe("catalogo de eventos da sprintx congelada (D-06)", () => {
  it.each(EVENTOS_SPRINTX)(
    "integração: `%s` está no contrato — grava-o %s",
    (evento) => {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", evento })));
      expect(r.defeitos).toEqual([]);
    },
  );

  it("funcional: os dois eventos que o replay C7-C reprovou passam a valer", () => {
    for (const evento of ["checkpoint_planejamento", "bloqueio_resolvido"]) {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", evento })));
      expect(r.defeitos, evento).toEqual([]);
    }
  });

  it("funcional: evento inventado continua sendo defeito — o enum não virou texto livre", () => {
    const r = validarRastro(j(linha({ evento: "replanejamento_execucao_inventado" })));
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.motivo).toContain("evento");
  });

  it("funcional: `artefato_gravado` segue fora — é evento da mergex, não deste catálogo", () => {
    const r = validarRastro(j(linha({ ferramenta: "mergex", evento: "artefato_gravado" })));
    expect(r.defeitos).toHaveLength(1);
  });
});

describe("`sessao` e `harness` como extras declaradas (D-06)", () => {
  it("integração: a linha do escritor oficial `scripts/rastro.sh` não tem defeito nem chave desconhecida", () => {
    // Byte a byte na ordem em que `_rastro_linha` (hooks/comum/rastro.sh) monta
    // a linha, com as duas extras depois das doze — como manda o contrato.
    const bruta =
      '{"ts":"2026-09-22T10:14:00Z","expx_eventos":1,"trabalho_id":"menu",' +
      '"ferramenta":"sprintx","origem":"skill","evento":"task_iniciada","fase":"f6",' +
      '"task":"T-04.03","agente":"principal","resultado":"ok","detalhe":"T-04.03 aberta",' +
      '"arquivos":[],"sessao":"claude-code@2f7a1c","harness":"claude-code"}';
    const r = validarRastro(bruta);
    expect(r.linhas).toBe(1);
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it("funcional: `sessao`/`harness` nulas valem — evento que não depende da identidade", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "sprintx", evento: "fase_iniciada", sessao: null, harness: null })),
    );
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it("unitário: as duas extras entram em EXTRAS_EVENTO, sem tirar `hook` e `faixa`", () => {
    expect([...EXTRAS_EVENTO]).toEqual(expect.arrayContaining(["hook", "faixa", "sessao", "harness"]));
  });

  it("funcional: a tolerância a extra NÃO declarada continua — aviso, nunca defeito", () => {
    const r = validarRastro(j(linha({ sessao: "x@1", harness: "x", gadget: "?" })));
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual(["gadget"]);
  });
});

describe("os contratos das demais skills seguem de pé (D-06)", () => {
  it("integração: a linha da mergex com `hook`, e os eventos que só ela grava", () => {
    for (const evento of ["commit_criado", "pr_aberto"]) {
      const r = validarRastro(
        j(linha({ ferramenta: "mergex", evento, hook: "pr-so-com-portao" })),
      );
      expect(r.defeitos, evento).toEqual([]);
      expect(r.desconhecidas, evento).toEqual([]);
    }
  });

  it("integração: a linha da legadox com `hook` e `faixa` segue válida", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "legadox", evento: "regra_violada", resultado: "aviso", hook: "raio", faixa: "alta" })),
    );
    expect(r.defeitos).toEqual([]);
    expect(r.desconhecidas).toEqual([]);
  });

  it("unitário: continuam sendo doze as chaves obrigatórias — extra nova não promove ninguém", () => {
    expect(CHAVES_EVENTO).toHaveLength(12);
    for (const extra of ["sessao", "harness"]) {
      expect(chavesFaltando(linha()), extra).toEqual([]);
    }
  });
});
