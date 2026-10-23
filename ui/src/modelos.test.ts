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
  it("unitário: snapshot parcial ou nulo continua histórico e nunca é completado pela configuração atual", () => {
    expect(execucaoDoEvento({ ...base, model: "openai/gpt-5.4", effort: null }, [instalado])).toEqual({
      texto: "sprintx-investigador · openai/gpt-5.4 · esforço não informado",
      fonte: "histórico",
    });
    expect(execucaoDoEvento({ ...base, model: null, effort: null }, [instalado])).toEqual({
      texto: "sprintx-investigador · modelo não informado · esforço não informado",
      fonte: "histórico",
    });
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
