import { Agente } from "../parser/esquema/evento.js";
import { Ferramenta } from "../parser/esquema/enums.js";
import { PAPEIS, type Papel } from "./tipos.js";

/**
 * A projeção dos papéis (CONTRATO-expx-orquestracao §11.4, F4): uma linha por
 * agente instalado que declara `papel:`, com a skill que o publica. Os hooks da
 * integridade final e do envelope a leem para saber quem é de aprovação e com
 * que `ferramenta` gravar, sem inferir nada do nome.
 *
 * Existe com ou sem política, porque a integridade final roda nos dois regimes;
 * por isso não é uma coluna de `.expx/orquestracao-rastro.tsv`. Não é fonte de
 * nada: o `init` a regrava a cada plano, e o `doctor` a confere contra os
 * agentes instalados.
 */
export const CAMINHO_PAPEIS = ".expx/papeis.tsv";
export const CABECALHO_PAPEIS = "# expx-papeis 1";

export type PapelProjetado = { agente: string; skill: string; papel: Papel };

export type ResultadoPapeis = { ok: true; texto?: string; avisos: string[] } | { ok: false; erro: string };

/** Só os agentes que o rastro aceita: fora do vocabulário, o evento deles seria inválido. */
export const agenteDoRastro = (a: string): boolean => a !== "principal" && Agente.safeParse(a).success;
const skillDoRastro = (s: string): boolean => Ferramenta.safeParse(s).success;
/**
 * A leitura usa as mesmas regras dos hooks (`expx_papel_de` e `papelDe`): o agente
 * no alfabeto de nome e diferente de `principal`, a skill no vocabulário do rastro.
 * O vocabulário de agentes fica só na escrita (`projetarPapeis`): os hooks não
 * guardam lista de nomes de agente.
 */
const agenteLegivel = (a: string): boolean => /^[a-z0-9-]+$/.test(a) && a !== "principal";

export function projetarPapeis(itens: readonly PapelProjetado[]): ResultadoPapeis {
  const avisos: string[] = [];
  const linhas = [CABECALHO_PAPEIS];
  const vistos = new Set<string>();
  for (const i of [...itens].sort((a, b) => a.agente.localeCompare(b.agente))) {
    if (vistos.has(i.agente)) return { ok: false, erro: `projecao dos papeis: agente ${i.agente} publicado por mais de uma skill` };
    vistos.add(i.agente);
    if (!agenteDoRastro(i.agente) || !skillDoRastro(i.skill)) {
      avisos.push(
        `agente ${i.agente} (skill ${i.skill}, papel ${i.papel}) fora do vocabulario do rastro: ` +
          "fica fora de .expx/papeis.tsv e nao passa pela integridade final nem pelo primeiro plano",
      );
      continue;
    }
    linhas.push(`${i.agente}\t${i.skill}\t${i.papel}`);
  }
  return linhas.length === 1 ? { ok: true, avisos } : { ok: true, texto: `${linhas.join("\n")}\n`, avisos };
}

export type LeituraPapeis = { ok: true; itens: PapelProjetado[] } | { ok: false; erro: string };

/**
 * As mesmas regras dos hooks: o arquivo inteiro vale, ou não vale nada. O CR no
 * fim da linha sai, como no `read` do shell: a projeção é versionada com o `.expx/`,
 * e o checkout com `core.autocrlf` a entrega em CRLF.
 */
export function lerPapeis(texto: string): LeituraPapeis {
  const linhas = texto.split("\n").map((l) => l.replace(/\r$/, ""));
  if (linhas.at(-1) === "") linhas.pop();
  if (linhas[0] !== CABECALHO_PAPEIS) return { ok: false, erro: `cabecalho diferente de "${CABECALHO_PAPEIS}"` };
  const itens: PapelProjetado[] = [];
  const vistos = new Set<string>();
  for (const [n, linha] of linhas.slice(1).entries()) {
    const campos = linha.split("\t");
    const [agente = "", skill = "", papel = ""] = campos;
    if (campos.length !== 3) return { ok: false, erro: `linha ${n + 2}: ${campos.length} colunas, esperadas 3` };
    if (!agenteLegivel(agente)) return { ok: false, erro: `linha ${n + 2}: agente "${agente}" fora do alfabeto de nome, ou o principal` };
    if (!skillDoRastro(skill)) return { ok: false, erro: `linha ${n + 2}: skill "${skill}" fora do vocabulario do rastro` };
    if (!(PAPEIS as readonly string[]).includes(papel)) return { ok: false, erro: `linha ${n + 2}: papel "${papel}" fora do vocabulario` };
    if (vistos.has(agente)) return { ok: false, erro: `linha ${n + 2}: agente ${agente} repetido` };
    vistos.add(agente);
    itens.push({ agente, skill, papel: papel as Papel });
  }
  return { ok: true, itens };
}
