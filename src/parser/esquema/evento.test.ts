import { describe, it, expect } from "vitest";
import {
  EVENTOS_COM_IDENTIDADE,
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

/** A identidade da sessão como o escritor da `sprintx` a deriva. */
const IDENTIDADE = { sessao: "claude-code@2f7a1c", harness: "claude-code" };

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
      // O evento da base é `task_concluida`, e na sprintx a reivindicação da task
      // leva a identidade que o escritor dela deriva (ver o bloco da identidade,
      // abaixo). O que este teste cobra é o enum de `ferramenta`, não a extra.
      const r = validarRastro(j(linha({ ferramenta: f, ...(f === "sprintx" ? IDENTIDADE : {}) })));
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

/**
 * A linha que o escritor oficial gravaria para este evento.
 *
 * A reivindicação da task leva a identidade da sessão, porque é o que
 * `scripts/rastro.sh` faz: nos três `task-*` ele exige a identidade e, sem ela,
 * não grava linha nenhuma. Montar aqui uma reivindicação sem identidade seria
 * afirmar válida uma linha que o escritor se recusa a produzir.
 */
function comoOEscritorGrava(evento: string): Record<string, unknown> {
  const exige = (EVENTOS_COM_IDENTIDADE as readonly string[]).includes(evento);
  return linha({ ferramenta: "sprintx", evento, ...(exige ? IDENTIDADE : {}) });
}

describe("catalogo de eventos da sprintx congelada (D-06)", () => {
  it.each(EVENTOS_SPRINTX)(
    "integração: `%s` está no contrato — grava-o %s",
    (evento) => {
      const r = validarRastro(j(comoOEscritorGrava(evento)));
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

/**
 * Revisão do PR #10 — `sessao`/`harness` entraram como extras OPCIONAIS, e
 * "opcional" é metade da regra. O contrato (`CONTRATO-expx-eventos.md`, tabela de
 * chaves extras) e o escritor da `sprintx` congelada (`scripts/rastro.sh`,
 * 4e1f7b88d85f3fe9f87ae578f7789760d92d6829) definem TRÊS estados, não um:
 *
 *  - `task_iniciada`/`task_concluida`/`task_bloqueada` da `sprintx`:
 *    **obrigatórias**. No escritor essas três são as únicas com
 *    `EXIGE_IDENTIDADE=1`, e sem identidade ele sai `3` e **não grava a linha**.
 *    Uma linha dessas sem identidade não saiu do escritor — e os hooks que leem a
 *    reivindicação (`escopo-da-task`, `task-reivindicada`) não reconhecem dono
 *    nenhum nela: a primeira edição da task para com `sessao_ambigua`.
 *  - `fase_iniciada`/`fase_concluida`/`veredito_emitido`: presentes, **`null`**
 *    quando a identidade não existe — é o `else` do mesmo escritor, que grava
 *    `"sessao":null,"harness":null`.
 *  - `scripts/planejamento.sh`, `scripts/bloqueios.sh` e todo hook:
 *    **ausentes**. Nenhum dos três passa extras, e `_rastro_linha`
 *    (`hooks/comum/rastro.sh`) só anexa o que recebe.
 *
 * Por isso a obrigação é condicional, nunca global: global reprovaria a linha
 * legítima de todo hook — exatamente a regressão que o contrato narra na seção
 * das doze chaves.
 */

describe("quando `sessao`/`harness` são obrigatórias (revisão do PR #10)", () => {
  it.each(EVENTOS_COM_IDENTIDADE)(
    "integração: `%s` da sprintx sem identidade é defeito — o escritor falha fechado, não grava assim",
    (evento) => {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", evento, resultado: "ok" })));
      expect(r.defeitos).toHaveLength(1);
      expect(r.defeitos[0]?.motivo).toContain("sessao");
      expect(r.defeitos[0]?.motivo).toContain("harness");
    },
  );

  it.each(EVENTOS_COM_IDENTIDADE)(
    "integração: `%s` com a identidade derivada não tem defeito nem chave desconhecida",
    (evento) => {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", evento, ...IDENTIDADE })));
      expect(r.defeitos).toEqual([]);
      expect(r.desconhecidas).toEqual([]);
    },
  );

  it("funcional: identidade `null` NÃO vale na reivindicação — é o que o escritor se recusa a gravar", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "sprintx", evento: "task_iniciada", sessao: null, harness: null })),
    );
    expect(r.defeitos).toHaveLength(1);
    expect(r.defeitos[0]?.motivo).toContain("sessao");
  });

  it("funcional: identidade vazia não vale — `\"\"` é ausência escrita de outro jeito", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "sprintx", evento: "task_concluida", sessao: "", harness: "" })),
    );
    expect(r.defeitos).toHaveLength(1);
  });

  it("funcional: as duas vêm em par — `sessao` sem `harness` aponta a que falta", () => {
    const r = validarRastro(
      j(linha({ ferramenta: "sprintx", evento: "task_bloqueada", resultado: "bloqueado", sessao: "claude-code@2f7a1c" })),
    );
    expect(r.defeitos).toHaveLength(1);
    // O motivo começa pelas chaves que faltam: só `harness` falta, e a `sessao`
    // aparece depois, na explicação, não na lista.
    expect(r.defeitos[0]?.motivo).toMatch(/^harness: /);
  });

  it("funcional: `fase_*` e `veredito_emitido` levam a identidade `null` — não dependem dela", () => {
    for (const evento of ["fase_iniciada", "fase_concluida", "veredito_emitido"]) {
      const r = validarRastro(
        j(linha({ ferramenta: "sprintx", evento, sessao: null, harness: null })),
      );
      expect(r.defeitos, evento).toEqual([]);
    }
  });

  it("integração: o que `planejamento.sh` e `bloqueios.sh` gravam não leva as extras — ausente é válido", () => {
    for (const evento of [
      "checkpoint_planejamento",
      "task_reaberta",
      "replanejamento_execucao_iniciado",
      "replanejamento_execucao_retomado",
      "replanejamento_execucao_aprovado",
      "replanejamento_execucao_esgotado",
      "replanejamento_execucao_recusado",
      "bloqueio_resolvido",
    ]) {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", evento })));
      expect(r.defeitos, evento).toEqual([]);
    }
  });

  it("integração: a linha gravada por hook não leva identidade, e segue válida — a obrigação não é global", () => {
    for (const evento of [
      "arquivo_alterado",
      "suite_executada",
      "agente_concluido",
      "regra_violada",
      "acao_bloqueada",
    ]) {
      const r = validarRastro(j(linha({ ferramenta: "sprintx", origem: "hook", evento })));
      expect(r.defeitos, evento).toEqual([]);
    }
  });

  it("funcional: a obrigação é da sprintx — a extra é declarada para o escritor dela, não para as nove", () => {
    for (const ferramenta of ["runx", "mergex", "legadox", "stackx", "memox", "prodx", "buildx", "designx"]) {
      const r = validarRastro(j(linha({ ferramenta, evento: "task_concluida" })));
      expect(r.defeitos, ferramenta).toEqual([]);
    }
  });

  it("unitário: são três os eventos de reivindicação — nem o `fase_*` nem o `veredito_emitido` entram", () => {
    expect([...EVENTOS_COM_IDENTIDADE]).toEqual(["task_iniciada", "task_concluida", "task_bloqueada"]);
  });
});

/**
 * Nitpick da revisão: o enum de `evento` é global, então `ferramenta: "mergex"`
 * com `evento: "checkpoint_planejamento"` passa.
 *
 * É **preexistente e deliberado**, não defeito deste PR. O contrato não declara
 * nenhuma regra cruzando `ferramenta` com `evento`: a coluna "Quem grava" da
 * tabela do vocabulário é descritiva, e a regra de validação que o contrato
 * escreve é a oposta de estrita — "verifica que as doze estão **contidas** na
 * linha, nunca igualdade exata de conjunto", porque foi a igualdade estrita que
 * fez a verificação da `runx` reprovar toda linha da `mergex` e da `legadox`.
 * Antes deste PR `commit_criado`/`pr_aberto` (mergex) já passavam com
 * `ferramenta: "sprintx"` pelo mesmo enum global.
 *
 * Fica fixado como característica, não redesenhado: cruzar os dois é mudança de
 * contrato, e contrato não se muda por inferência de um leitor.
 */
describe("o enum de `evento` é global por contrato, não por descuido", () => {
  it("funcional: nenhuma regra cruza `ferramenta` com `evento` — nos dois sentidos", () => {
    const cruzados = validarRastro(j(linha({ ferramenta: "mergex", evento: "checkpoint_planejamento" })));
    expect(cruzados.defeitos).toEqual([]);
    const inverso = validarRastro(j(linha({ ferramenta: "sprintx", evento: "pr_aberto" })));
    expect(inverso.defeitos).toEqual([]);
  });
});
