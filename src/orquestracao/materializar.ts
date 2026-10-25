import { basename } from "node:path";
import { z } from "zod";
import { lerFrontmatter } from "../parser/leitura/frontmatter.js";
import { conferirResolucaoId, type AgenteDaSkill, type Resolucao } from "./resolver.js";
import { ADAPTADORES, CLASSES, type Classe } from "./tipos.js";

/** O mesmo padrão dos nomes em `.expx/orquestracao.json` e do Claude Code: minúsculas, dígitos e hífen. */
const NOME_AGENTE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * A ponte entre o resolvedor e a instalação (CONTRATO-expx-orquestracao §9 e
 * CONTRATO-expx-instalacao §5.3): ler o agente da skill, reescrever o frontmatter
 * com a alternativa e guardar a resolução no registro.
 */

export type LeituraAgente = { ok: true; agente: AgenteDaSkill } | { ok: false; erro: string };

/** `name`, `classe`, `model` e `effort` do frontmatter; `classe` fora do vocabulário é skill inválida. */
export function lerAgenteDaSkill(origem: string, texto: string): LeituraAgente {
  const fm = lerFrontmatter(texto);
  const dados = fm.ok && typeof fm.dados === "object" && fm.dados !== null ? (fm.dados as Record<string, unknown>) : {};
  const campoTexto = (k: string): string | undefined => (typeof dados[k] === "string" && dados[k] !== "" ? dados[k] : undefined);
  const nome = campoTexto("name") ?? basename(origem, ".md");
  // O nome é chave de objeto no lock: `__proto__` trocaria o protótipo em vez de criar a entrada.
  if (!NOME_AGENTE.test(nome)) return { ok: false, erro: `${origem}: name "${nome}" fora do padrão ^[a-z0-9][a-z0-9-]*$` };
  const agente: AgenteDaSkill = { nome };
  if (dados["classe"] !== undefined) {
    const classe = dados["classe"];
    if (typeof classe !== "string" || !(CLASSES as readonly string[]).includes(classe)) {
      return { ok: false, erro: `${origem}: classe "${String(classe)}" fora do vocabulário (${CLASSES.join(", ")})` };
    }
    agente.classe = classe as Classe;
  }
  const model = campoTexto("model");
  const effort = campoTexto("effort");
  if (model !== undefined || effort !== undefined) {
    agente.frontmatter = { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
  }
  return { ok: true, agente };
}

/**
 * Grava `model` e `effort` no frontmatter sem tocar no resto (corpo, outros
 * campos, fim de linha). Sem `effort` na alternativa, a linha `effort` SAI: o
 * arquivo não pode dizer um esforço que a resolução não pediu. Arquivo sem
 * frontmatter volta igual, como em `aplicarOverride`.
 */
export function reescreverModeloEsforco(comBom: string, model: string, effort: string | undefined): string {
  // O leitor de frontmatter aceita o BOM; a reescrita também, e o preserva.
  const bom = comBom.startsWith("\uFEFF") ? "\uFEFF" : "";
  const texto = comBom.slice(bom.length);
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(texto);
  if (m === null) return comBom;
  const eol = m[1]?.endsWith("\r\n") ? "\r\n" : "\n";
  const campo = (c: string) => new RegExp(`^["']?${c}["']?\\s*:`);
  const linhas = (m[2] ?? "").split(eol);
  const saida: string[] = [];
  let pos = { model: false, effort: false };
  for (const linha of linhas) {
    if (campo("model").test(linha)) {
      saida.push(`model: ${model}`);
      pos = { ...pos, model: true };
    } else if (campo("effort").test(linha)) {
      if (effort !== undefined) saida.push(`effort: ${effort}`);
      pos = { ...pos, effort: true };
    } else saida.push(linha);
  }
  if (!pos.model) saida.push(`model: ${model}`);
  if (!pos.effort && effort !== undefined) saida.push(`effort: ${effort}`);
  return `${bom}${m[1] ?? ""}${saida.join(eol)}${m[3] ?? ""}${texto.slice(m[0].length)}`;
}

export const DIR_REGISTRO = ".expx/resolucoes";

export function caminhoDoRegistro(id: string): string {
  return `${DIR_REGISTRO}/${id}.json`;
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (typeof v === "object" && v !== null) {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/**
 * A forma de armazenamento: chaves ordenadas, indentação 2 e quebra final. É
 * só legibilidade: a identidade continua sendo o `jsonCanonico` compacto do
 * `resolucao_id` (§8).
 */
export function serializarRegistro(r: Resolucao): string {
  return `${JSON.stringify(ordenar(r), null, 2)}\n`;
}

const AlternativaRegistrada = z.strictObject({ id: z.string(), model: z.string(), effort: z.string().optional() });
const Classe_ = z.enum(CLASSES);

/**
 * A forma do objeto da seção 8. O hash não é segredo: qualquer um recalcula
 * um `resolucao_id` válido sobre um objeto qualquer, e por isso a forma é
 * conferida antes de alguém confiar em `cadeia` ou `alternativa`.
 */
const ResolucaoRegistrada = z.strictObject({
  versao_resolvedor: z.number().int(),
  tabela_embutida: z.number().int(),
  matriz_effort_claude: z.number().int(),
  adaptador: z.enum(ADAPTADORES),
  agente: z.string().regex(NOME_AGENTE),
  classe_declarada: Classe_,
  origem_classe: z.enum(["declarada", "inferida", "agente", "tarefa"]),
  classe_resolvida: Classe_,
  cadeia: z.array(AlternativaRegistrada).min(1),
  alternativa: AlternativaRegistrada,
  origem_alternativa: z.enum(["projeto", "skill", "embutida", "sessao", "agentes-json-v1"]),
  sobreposta_por: z.literal("agentes-json-v1").optional(),
  materializado: z.strictObject({ model: z.string(), effort: z.string().optional() }).optional(),
  resolucao_id: z.string().regex(/^[0-9a-f]{64}$/),
});

export type LeituraRegistro = { ok: true; resolucao: Resolucao } | { ok: false; erro: string };

/**
 * Aceita só o arquivo exatamente como ele foi gravado: JSON válido, id
 * conferível, igual ao nome do arquivo, e bytes na forma canônica legível. Um
 * arquivo só com espaços diferentes reprova, porque o próximo `init` também o
 * recusaria (o registro é imutável).
 */
export function lerRegistro(id: string, texto: string): LeituraRegistro {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "não é JSON válido" };
  }
  if (!ResolucaoRegistrada.safeParse(bruto).success) return { ok: false, erro: "o objeto não tem a forma de uma resolução" };
  if (!conferirResolucaoId(bruto)) return { ok: false, erro: "o resolucao_id não confere com o conteúdo" };
  const r = bruto as Resolucao;
  if (r.resolucao_id !== id) return { ok: false, erro: `o arquivo se chama ${id}, mas o conteúdo é de ${r.resolucao_id}` };
  if (serializarRegistro(r) !== texto) return { ok: false, erro: "os bytes não estão na forma canônica legível" };
  return { ok: true, resolucao: r };
}
