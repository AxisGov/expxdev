import type { Resolucao } from "./resolver.js";

/**
 * A projeção plana das resoluções vigentes que o escritor comum do rastro lê
 * (`nucleo/hooks/expx-rastro.sh`, em bash e sem jq): uma linha por agente, com
 * as chaves da seção 11.1 de CONTRATO-expx-orquestracao que vão também no
 * evento. É derivada do mesmo plano que grava o registro e o lock, e não é
 * fonte de nada: o `doctor` a confere contra os dois, e o `init` a remove
 * quando a política sai.
 *
 * Campos separados por TAB, sempre preenchidos: o `read` do bash trata TAB como
 * espaço em branco e juntaria dois separadores seguidos, então o ausente é `-`.
 */
export const CAMINHO_PROJECAO = ".expx/orquestracao-rastro.tsv";
export const CABECALHO_PROJECAO = "# expx-orquestracao-rastro 1";
const AUSENTE = "-";
/** O que o escritor aceita sem escapar para JSON: sem espaço, aspa, barra invertida, TAB ou quebra. */
const CAMPO = /^[A-Za-z0-9._:/-]+$/;

export type ResultadoProjecao = { ok: true; texto: string } | { ok: false; erro: string };

/** As colunas, na ordem em que o escritor as lê. */
export function camposDaProjecao(r: Resolucao): string[] {
  return [
    r.agente,
    r.resolucao_id,
    r.classe_declarada,
    r.origem_classe,
    r.classe_resolvida,
    r.alternativa.id,
    r.origem_alternativa,
    r.materializado?.model ?? AUSENTE,
    r.materializado?.effort ?? AUSENTE,
  ];
}

export function serializarProjecao(resolucoes: readonly Resolucao[]): ResultadoProjecao {
  const ordenadas = [...resolucoes].sort((a, b) => a.agente.localeCompare(b.agente));
  const linhas = [CABECALHO_PROJECAO];
  const vistos = new Set<string>();
  for (const r of ordenadas) {
    if (vistos.has(r.agente)) return { ok: false, erro: `projecao do rastro: agente repetido: ${r.agente}` };
    vistos.add(r.agente);
    const campos = camposDaProjecao(r);
    // `-` só é marcador nas duas colunas do materializado: valor de verdade igual a ele seria ambíguo
    const ruim = campos.find((c, i) => !CAMPO.test(c) || (c === AUSENTE && i < 7) || (i === 8 && c !== AUSENTE && campos[7] === AUSENTE));
    if (ruim !== undefined) return { ok: false, erro: `projecao do rastro: valor que o escritor nao le com seguranca em ${r.agente}: ${JSON.stringify(ruim)}` };
    linhas.push(campos.join("\t"));
  }
  return { ok: true, texto: `${linhas.join("\n")}\n` };
}
