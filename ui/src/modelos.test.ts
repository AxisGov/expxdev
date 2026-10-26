import { describe, expect, it } from "vitest";
import { execucaoDoEvento } from "./modelos.js";
import type { ConfiguracaoAgente, Evento } from "./tipos.js";

const base: Evento = {
  ts: "2026-08-29T14:32:10Z",
  expx_eventos: 1,
  trabalho_id: "t",
  ferramenta: "sprintx",
  origem: "agente",
  evento: "agente_concluido",
  fase: "f6",
  task: "T-01.01",
  agente: "sprintx-investigador",
  resultado: "ok",
  detalhe: "x",
  arquivos: [],
};

const instalado: ConfiguracaoAgente = {
  nome: "sprintx-investigador",
  model: "sonnet",
  effort: "medium",
  arquivo: ".claude/agents/sprintx-investigador.md",
};

describe("execucaoDoEvento", () => {
  it("unitário: observação parcial continua histórico e nunca é completada pela configuração", () => {
    expect(execucaoDoEvento({ ...base, model: "openai/gpt-5.4", effort: null }, [instalado])).toEqual({
      texto: "sprintx-investigador · openai/gpt-5.4 · esforço não informado",
      fonte: "histórico",
    });
    expect(execucaoDoEvento({ ...base, model: null, effort: "high" }, [instalado])).toEqual({
      texto: "sprintx-investigador · modelo não informado · high",
      fonte: "histórico",
    });
  });

  it("unitário: sem observação e sem resolução, o fallback de sempre (H10: null/null não é mais histórico)", () => {
    expect(execucaoDoEvento({ ...base, model: null, effort: null }, [instalado])).toEqual({
      texto: "sprintx-investigador · sonnet · medium",
      fonte: "configuração atual",
    });
    expect(execucaoDoEvento({ ...base, model: null, effort: null, harness: "opencode" }, [instalado]).fonte).toBe("histórico indisponível");
  });

  it("unitário: sem observação, a resolução citada aparece como configuração não observada, nunca como histórico", () => {
    const id = "c".repeat(64);
    const resolucoes = { [id]: { agente: "sprintx-investigador", model: "claude-opus-4-6", effort: "high" } };
    expect(execucaoDoEvento({ ...base, model: null, effort: null, resolucao_id: id }, [instalado], resolucoes)).toEqual({
      texto: "sprintx-investigador · claude-opus-4-6 · high",
      fonte: "configuração (não observada)",
    });
    // a observação vence a resolução
    expect(execucaoDoEvento({ ...base, model: "sonnet", effort: null, resolucao_id: id }, [instalado], resolucoes).fonte).toBe("histórico");
  });

  it("unitário: resolução ilegível, ausente do mapa ou de outro agente é inconsistência, sem inventar", () => {
    const id = "d".repeat(64);
    for (const resolucoes of [{ [id]: null }, {}, { [id]: { agente: "auditor-plano", model: "opus", effort: null } }]) {
      const r = execucaoDoEvento({ ...base, model: null, effort: null, resolucao_id: id }, [instalado], resolucoes);
      expect(r.fonte, JSON.stringify(resolucoes)).toBe("inconsistência");
      expect(r.texto).toContain("dddddddd");
      expect(r.texto).not.toContain("sonnet");
    }
  });

  it("unitário: evento antigo sem harness usa a configuração instalada, rotulada como atual", () => {
    expect(execucaoDoEvento(base, [instalado])).toEqual({
      texto: "sprintx-investigador · sonnet · medium",
      fonte: "configuração atual",
    });
  });

  it("unitário: o harness derivado da sessão também impede o fallback Claude", () => {
    expect(execucaoDoEvento({ ...base, harness: null, sessao: "opencode@123" }, [instalado]).fonte).toBe(
      "histórico indisponível",
    );
    expect(execucaoDoEvento({ ...base, sessao: "claude-code@abc" }, [instalado]).fonte).toBe("configuração atual");
  });

  it("unitário: agente instalado sem model nem effort (null, como o servidor serve) é histórico indisponível", () => {
    expect(execucaoDoEvento(base, [{ ...instalado, model: null, effort: null }])).toEqual({
      texto: "sprintx-investigador · modelo/esforço não informados",
      fonte: "histórico indisponível",
    });
  });
});
