import { hashDeBytes, jsonCanonico } from "../plugin/plano.js";
import { classeDoModeloClaude, modeloClaudeBemFormado, validarAlternativa, VERSAO_MATRIZ_EFFORT_CLAUDE } from "./adaptadores.js";
import type { LeituraPolitica } from "./politica.js";
import { TABELA_EMBUTIDA, VERSAO_TABELA } from "./tabela.js";
import { ID_FRONTMATTER, posto, type Adaptador, type Alternativa, type Cadeias, type Classe, type Politica } from "./tipos.js";

/**
 * Resolvedor do contrato `expx-orquestracao` v1 (§7 e §8): função pura que dá,
 * para um agente num adaptador, a classe resolvida, a cadeia, a alternativa e
 * o `resolucao_id`. Não lê disco nem ambiente — tudo entra por parâmetro, para
 * que as mesmas entradas deem a mesma saída byte a byte.
 */

export const VERSAO_RESOLVEDOR = 1;

/** Só o Claude opera na v1 (H6); OpenCode e Codex entram na F6/F7. */
const COM_SUPORTE: ReadonlySet<Adaptador> = new Set(["claude"]);

export type AgenteDaSkill = {
  nome: string;
  classe?: Classe;
  frontmatter?: { model?: string; effort?: string };
};

export type EntradaResolucao = {
  agente: AgenteDaSkill;
  adaptador: Adaptador;
  politica: Politica;
  tarefa?: { classe: Classe; justificativa?: string };
  sessao?: { alternativa: string };
};

export type OrigemClasse = "declarada" | "inferida" | "agente" | "tarefa";
export type OrigemAlternativa = "projeto" | "skill" | "embutida" | "sessao" | "agentes-json-v1";

export type Resolucao = {
  versao_resolvedor: number;
  tabela_embutida: number;
  matriz_effort_claude: number;
  adaptador: Adaptador;
  agente: string;
  classe_declarada: Classe;
  origem_classe: OrigemClasse;
  classe_resolvida: Classe;
  cadeia: Alternativa[];
  alternativa: Alternativa;
  origem_alternativa: OrigemAlternativa;
  sobreposta_por?: "agentes-json-v1";
  materializado?: { model: string; effort?: string };
  resolucao_id: string;
};

export type MotivoRecusa =
  | "sem_suporte_operacional"
  | "sem_classe"
  | "rebaixamento"
  | "justificativa_ausente"
  | "frontmatter_fora_da_classe"
  | "frontmatter_invalido"
  | "sem_resolucao"
  | "alternativa_fora_da_cadeia"
  | "politica_invalida";

export type ResultadoResolucao = { ok: true; resolucao: Resolucao } | { ok: false; motivo: MotivoRecusa; mensagem: string };

export type TabelaEmbutida = { versao: number; cadeias: Readonly<Record<Adaptador, Cadeias>> };
const TABELA_PADRAO: TabelaEmbutida = { versao: VERSAO_TABELA, cadeias: TABELA_EMBUTIDA };

function recusa(motivo: MotivoRecusa, mensagem: string): ResultadoResolucao {
  return { ok: false, motivo, mensagem };
}

function copiar(a: Alternativa): Alternativa {
  return a.effort === undefined ? { id: a.id, model: a.model } : { id: a.id, model: a.model, effort: a.effort };
}

/** O SHA-256 do JSON canônico do objeto SEM o campo `resolucao_id` (§8). */
export function resolucaoId(r: Omit<Resolucao, "resolucao_id"> | Resolucao): string {
  const semId: Record<string, unknown> = { ...r };
  delete semId["resolucao_id"];
  return hashDeBytes(jsonCanonico(semId));
}

export function conferirResolucaoId(r: unknown): boolean {
  if (typeof r !== "object" || r === null || Array.isArray(r)) return false;
  const id = (r as Record<string, unknown>)["resolucao_id"];
  if (typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) return false;
  return resolucaoId(r as Resolucao) === id;
}

function comId(semId: Omit<Resolucao, "resolucao_id">): Resolucao {
  return { ...semId, resolucao_id: resolucaoId(semId) };
}

/** Pedido de classe nas camadas 5 e 6: recusa rebaixamento e elevação sem justificativa. */
function elevar(
  vigente: Classe,
  pedido: { classe: Classe; justificativa?: string } | undefined,
  quem: string,
): { ok: true; classe: Classe; elevou: boolean } | { ok: false; resultado: ResultadoResolucao } {
  if (pedido === undefined || pedido.classe === vigente) return { ok: true, classe: vigente, elevou: false };
  if (posto(pedido.classe) < posto(vigente)) {
    return { ok: false, resultado: recusa("rebaixamento", `${quem} pede ${pedido.classe}, abaixo da classe vigente ${vigente}; a política nunca rebaixa`) };
  }
  if (pedido.classe === "profundo_excepcional" && (pedido.justificativa ?? "").trim() === "") {
    return { ok: false, resultado: recusa("justificativa_ausente", `${quem} eleva a profundo_excepcional sem justificativa`) };
  }
  return { ok: true, classe: pedido.classe, elevou: true };
}

export function resolver(e: EntradaResolucao, tabela: TabelaEmbutida = TABELA_PADRAO): ResultadoResolucao {
  const { agente, adaptador, politica } = e;
  if (!COM_SUPORTE.has(adaptador)) {
    return recusa("sem_suporte_operacional", `o adaptador ${adaptador} não tem suporte operacional na v1 do contrato`);
  }

  // Classe declarada: a da skill vence a inferida do frontmatter.
  const fm = agente.frontmatter;
  let declarada: Classe;
  let origemClasse: OrigemClasse;
  if (agente.classe !== undefined) {
    declarada = agente.classe;
    origemClasse = "declarada";
  } else {
    const inferida = fm?.model === undefined ? null : classeDoModeloClaude(fm.model);
    if (inferida === null) {
      return recusa("sem_classe", `o agente ${agente.nome} não declara classe e o frontmatter não a permite inferir; declare classe: no agente`);
    }
    declarada = inferida;
    origemClasse = "inferida";
  }

  const doAgente = elevar(declarada, politica.agentes[agente.nome], `agentes.${agente.nome}`);
  if (!doAgente.ok) return doAgente.resultado;
  if (doAgente.elevou) origemClasse = "agente";
  const daTarefa = elevar(doAgente.classe, e.tarefa, "a tarefa");
  if (!daTarefa.ok) return daTarefa.resultado;
  if (daTarefa.elevou) origemClasse = "tarefa";
  const resolvida = daTarefa.classe;

  // Cadeia: projeto > frontmatter (sem elevação) > embutida > nenhuma. Sem mescla.
  let cadeia: Alternativa[];
  let origemAlternativa: OrigemAlternativa;
  const doProjeto = politica.adaptadores[adaptador]?.classes[resolvida];
  const embutida = tabela.cadeias[adaptador][resolvida];
  if (doProjeto !== undefined) {
    cadeia = doProjeto.map(copiar);
    origemAlternativa = "projeto";
  } else if (resolvida === declarada && fm?.model !== undefined && fm.model !== "inherit") {
    const alt: Alternativa = fm.effort === undefined ? { id: ID_FRONTMATTER, model: fm.model } : { id: ID_FRONTMATTER, model: fm.model, effort: fm.effort };
    const doModelo = classeDoModeloClaude(fm.model);
    if (modeloClaudeBemFormado(fm.model) && (doModelo === null || posto(doModelo) < posto(declarada))) {
      return recusa("frontmatter_fora_da_classe", `o frontmatter de ${agente.nome} usa "${fm.model}", que não satisfaz a classe declarada ${declarada}`);
    }
    const falha = validarAlternativa(adaptador, declarada, alt);
    if (falha !== null) return recusa("frontmatter_invalido", `frontmatter de ${agente.nome}, ${falha.campo}: ${falha.motivo}`);
    cadeia = [alt];
    origemAlternativa = "skill";
  } else if (embutida !== undefined) {
    cadeia = embutida.map(copiar);
    origemAlternativa = "embutida";
  } else {
    return recusa("sem_resolucao", `nenhuma cadeia para ${resolvida} no adaptador ${adaptador}`);
  }

  let alternativa = cadeia[0] as Alternativa;
  if (e.sessao !== undefined) {
    const pedida = cadeia.find((a) => a.id === e.sessao?.alternativa);
    if (pedida === undefined) {
      return recusa("alternativa_fora_da_cadeia", `a alternativa "${e.sessao.alternativa}" não está na cadeia de ${resolvida} (${cadeia.map((a) => a.id).join(", ")})`);
    }
    alternativa = pedida;
    origemAlternativa = "sessao";
  }

  return {
    ok: true,
    resolucao: comId({
      versao_resolvedor: VERSAO_RESOLVEDOR,
      tabela_embutida: tabela.versao,
      matriz_effort_claude: VERSAO_MATRIZ_EFFORT_CLAUDE,
      adaptador,
      agente: agente.nome,
      classe_declarada: declarada,
      origem_classe: origemClasse,
      classe_resolvida: resolvida,
      cadeia,
      alternativa: copiar(alternativa),
      origem_alternativa: origemAlternativa,
    }),
  };
}

/** Opt-in (§3): sem política, a camada não existe e nada é resolvido. */
export function resolverNoProjeto(
  leitura: LeituraPolitica,
  e: Omit<EntradaResolucao, "politica">,
): { ativa: false } | { ativa: true; resultado: ResultadoResolucao } {
  if (!leitura.ok) return { ativa: true, resultado: recusa("politica_invalida", leitura.erro) };
  if (!leitura.ativa) return { ativa: false };
  return { ativa: true, resultado: resolver({ ...e, politica: leitura.politica }) };
}

/**
 * A exceção do `.expx/agentes.json` v1 (§7.4): o override pode rebaixar, então
 * a resolução passa a dizer que foi sobreposta e o que de fato foi
 * materializado. Cadeia e alternativa ficam como estavam. Override que não muda
 * nada devolve a mesma resolução.
 */
export function sobreporV1(r: Resolucao, o: { model?: string; effort?: string }): Resolucao {
  const model = o.model ?? r.alternativa.model;
  const effort = o.effort ?? r.alternativa.effort;
  if (model === r.alternativa.model && effort === r.alternativa.effort) return r;
  const { resolucao_id: _, ...semId } = r;
  return comId({
    ...semId,
    origem_alternativa: "agentes-json-v1",
    sobreposta_por: "agentes-json-v1",
    materializado: effort === undefined ? { model } : { model, effort },
  });
}
