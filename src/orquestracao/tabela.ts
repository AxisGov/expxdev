import type { Adaptador, Cadeias } from "./tipos.js";

/**
 * Tabela embutida v1 (CONTRATO-expx-orquestracao §5). Só o Claude tem
 * entradas: escolher provedor e modelo por OpenCode e Codex seria adivinhar uma
 * credencial que o ExpxDev não conhece. Mudar a tabela é mudar a versão, e com
 * ela todo `resolucao_id`.
 */
export const VERSAO_TABELA = 1;

export const TABELA_EMBUTIDA: Readonly<Record<Adaptador, Cadeias>> = {
  claude: {
    mecanico_triagem: [{ id: "embutida-haiku-low", model: "haiku", effort: "low" }],
    raciocinio_normal: [{ id: "embutida-sonnet-medium", model: "sonnet", effort: "medium" }],
    profundo_excepcional: [{ id: "embutida-opus-high", model: "opus", effort: "high" }],
  },
  opencode: {},
  codex: {},
};
