import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { lerLock } from "../nucleo/lock.js";
import { compararComHashes } from "../nucleo/integridade.js";
import { ORIGEM_DO_PLUGIN } from "../plugin/manifestos.js";

/**
 * Impede que o `update` apague trabalho manual.
 *
 * Quem ajustou uma skill à mão não pode perder o ajuste por rodar um comando de
 * rotina. Quando o disco diverge do lock, o update NÃO sobrescreve: lista os
 * arquivos e devolve a decisão para quem está no comando.
 */

export type OpcaoDecisao = { id: string; rotulo: string };

/** As três saídas oferecidas quando há modificação local. */
export const OPCOES_DE_DECISAO: readonly OpcaoDecisao[] = [
  { id: "manter", rotulo: "manter o local e nao atualizar esta skill" },
  { id: "substituir", rotulo: "substituir pelo novo, descartando a alteracao local" },
  { id: "salvar-ao-lado", rotulo: "salvar o local ao lado antes de substituir" },
] as const;

export type Verificacao = {
  temModificacao: boolean;
  alterados: string[];
  removidos: string[];
  novos: string[];
  /**
   * A modificação é só de fim de linha: nada sumiu nem apareceu, e cada alterado volta ao hash do lock com o CRLF
   * trocado por LF. É o checkout com `core.autocrlf` sem o bloco do `.gitattributes` (ver `nucleo/gitattributes.ts`),
   * e o update continua recusando: só a mensagem muda, para dizer o caminho.
   */
  soFimDeLinha?: boolean;
  erro?: string;
};

/** O que o update diz da modificação só de fim de linha. */
export const MIGRACAO_FIM_DE_LINHA =
  "so fim de linha (o checkout converteu para CRLF): commite o bloco do expx no .gitattributes " +
  "(veja \"Fim de linha no Windows\" no README do expxdev), confira com `git diff --ignore-cr-at-eol` que nada mais mudou e " +
  "rode `git restore -- .expx` antes do update";

/** O alterado volta ao hash do lock com o CRLF trocado por LF. */
function soCrlf(pasta: string, rel: string, esperado: string | undefined): boolean {
  if (esperado === undefined) return false;
  let bruto: Buffer;
  // o arquivo que sumiu ou virou pasta depois da comparação não é só fim de linha (CodeAnt no expxdev#171)
  try {
    bruto = readFileSync(join(pasta, rel));
  } catch {
    return false;
  }
  if (!bruto.includes("\r\n")) return false;
  const lf = Buffer.from(bruto.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  return createHash("sha256").update(lf).digest("hex") === esperado;
}

/** A pasta onde a skill instalada vive dentro do projeto. */
export function pastaDaSkill(raizProjeto: string, nome: string): string {
  return join(raizProjeto, ".expx", "marketplace", ORIGEM_DO_PLUGIN, "skills", nome);
}

export function verificarModificacaoLocal(raizProjeto: string, nome: string): Verificacao {
  const vazio: Verificacao = { temModificacao: false, alterados: [], removidos: [], novos: [] };

  const l = lerLock(raizProjeto);
  if (!l.ok) return { ...vazio, erro: l.erro };

  const travada = l.lock.skills[nome];
  if (travada === undefined) return { ...vazio, erro: `${nome} nao esta no lock deste projeto` };

  const pasta = pastaDaSkill(raizProjeto, nome);
  if (!existsSync(pasta)) {
    return { ...vazio, temModificacao: true, erro: `${nome} esta no lock mas nao esta em disco` };
  }

  const d = compararComHashes(pasta, travada.arquivos);
  const soFimDeLinha = d.alterados.length > 0 && d.removidos.length === 0 && d.novos.length === 0
    && d.alterados.every((rel) => soCrlf(pasta, rel, travada.arquivos[rel.split(sep).join("/")]));
  return {
    temModificacao: !d.limpo,
    alterados: d.alterados,
    removidos: d.removidos,
    novos: d.novos,
    soFimDeLinha,
  };
}
