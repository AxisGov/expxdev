import { montarProjeto, type Projeto } from "../parser/projeto/montar.js";
import { verificarConformidade, type Violacao } from "../parser/conformidade/regras.js";
import type { LinhaEvento } from "../parser/esquema/evento.js";
import { lerRastro } from "../watch/fontes/rastro.js";
import { lerConfiguracoesAgentes, type ConfiguracaoAgente } from "./agentes.js";

/** O estado que o painel serve: o projeto lido do disco mais as violações derivadas. */
export type EstadoPainel = Projeto & {
  violacoes: Violacao[];
  eventos: Record<string, LinhaEvento[]>;
  agentes: ConfiguracaoAgente[];
};

export type OpcoesEstado = {
  raiz: string;
  diasBloqueio: number;
};

/**
 * Relê o projeto inteiro do disco (decisão D-27). Releitura total, não
 * incremental: as regras de conformidade cruzam referências entre arquivos,
 * então uma visão parcial produziria violação falsa de referência quebrada.
 */
export function lerEstado(op: OpcoesEstado, agora: Date = new Date()): EstadoPainel {
  const projeto = montarProjeto(op.raiz, agora);
  const violacoes = verificarConformidade(projeto, {
    hoje: agora,
    diasBloqueio: op.diasBloqueio,
  });
  // O rastro continua sendo escrito exclusivamente pelas skills. O painel só
  // projeta uma cauda limitada do contrato existente; não cria estado paralelo.
  const eventos = Object.fromEntries(
    projeto.trabalhos
      .filter((trabalho) => trabalho.branch === null)
      .map((trabalho) => [trabalho.trabalho_id, lerRastro(op.raiz, trabalho.trabalho_id, 200)]),
  );
  const agentes = lerConfiguracoesAgentes(op.raiz);
  return { ...projeto, violacoes, eventos, agentes };
}
