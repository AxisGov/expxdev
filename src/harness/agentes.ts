import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { SkillMontavel } from "../plugin/montagem.js";
import { artefato, artefatoComConteudo, emOrdemCanonica, type Artefato } from "../plugin/plano.js";

/**
 * Agentes das skills em `.claude/agents/`, com o modelo e o esforço que o
 * projeto escolheu.
 *
 * ## O piso é da skill, o override é do projeto
 *
 * Cada agente publica `model` e `effort` no próprio frontmatter: é o piso do
 * método. Um agente de veredito que herda o modelo de quem chama fica tão fraco
 * quanto a sessão que o chamou, e o rebaixamento é silencioso. O projeto que
 * precisa de outro custo rebaixa (ou sobe) de forma consciente e versionada em
 * `.expx/agentes.json`:
 *
 *   { "expx_agentes": 1,
 *     "agentes": { "investigador": { "model": "haiku", "effort": "low" } } }
 *
 * O Claude Code só lê o frontmatter do arquivo, então o override é aplicado na
 * INSTALAÇÃO: a cópia em `.claude/agents/` sai com os valores do projeto. O
 * `.expx/agentes.json` é do projeto e nunca é escrito pelo `init`; por isso
 * `expx update` reaplica o mesmo override sobre a versão nova do agente.
 *
 * Só `model` e `effort` são sobrepostos: o resto do agente (ferramentas,
 * descrição, instruções) é o da skill.
 *
 * OpenCode: os agentes de `.opencode/agent/` não são instalados pelo `init` e o
 * override não os alcança — declarado fora do escopo em
 * `docs/contrato/CONTRATO-expx-instalacao.md`.
 */

export type OverrideDeAgente = { model?: string; effort?: string };
export type Overrides = Record<string, OverrideDeAgente>;

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const ALIAS_DE_MODELO = new Set(["opus", "sonnet", "haiku", "inherit"]);

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Alias (`opus`) ou ID completo (`claude-opus-4-5`). Texto livre não passa. */
function modeloValido(v: string): boolean {
  return ALIAS_DE_MODELO.has(v) || /^claude-[a-z0-9.-]+$/.test(v);
}

export type LeituraOverrides = { ok: true; overrides: Overrides } | { ok: false; erro: string };

/**
 * `.expx/agentes.json` do projeto. Ausente é válido (vale o frontmatter);
 * presente e fora do formato FALHA — um override que some em silêncio deixaria
 * o agente no piso quando a pessoa pediu outra coisa.
 */
export function lerOverridesDoProjeto(raiz: string): LeituraOverrides {
  const caminho = join(raiz, ".expx", "agentes.json");
  if (!existsSync(caminho)) return { ok: true, overrides: {} };
  const onde = ".expx/agentes.json";
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e: unknown) {
    return { ok: false, erro: `${onde} nao e JSON valido e nao sera aplicado: ${String(e)}` };
  }
  if (!ehObjeto(bruto)) return { ok: false, erro: `${onde} precisa ser um objeto` };
  for (const k of Object.keys(bruto)) {
    if (k === "expx_agentes" || k === "agentes" || k.startsWith("_")) continue;
    return { ok: false, erro: `${onde}: chave desconhecida "${k}"` };
  }
  if (bruto["expx_agentes"] !== undefined && bruto["expx_agentes"] !== 1) {
    return { ok: false, erro: `${onde}: expx_agentes ${String(bruto["expx_agentes"])} nao suportado` };
  }
  const agentes = bruto["agentes"] ?? {};
  if (!ehObjeto(agentes)) return { ok: false, erro: `${onde}: "agentes" precisa ser um objeto` };

  const overrides: Overrides = {};
  for (const [nome, cfg] of Object.entries(agentes)) {
    if (!ehObjeto(cfg)) return { ok: false, erro: `${onde}: ${nome} precisa ser um objeto` };
    for (const k of Object.keys(cfg)) {
      if (k !== "model" && k !== "effort") return { ok: false, erro: `${onde}: ${nome} tem chave desconhecida "${k}"` };
    }
    const o: OverrideDeAgente = {};
    if (cfg["model"] !== undefined) {
      if (typeof cfg["model"] !== "string" || !modeloValido(cfg["model"])) {
        return { ok: false, erro: `${onde}: ${nome} tem model invalido (use opus, sonnet, haiku, inherit ou um ID claude-*)` };
      }
      o.model = cfg["model"];
    }
    if (cfg["effort"] !== undefined) {
      if (typeof cfg["effort"] !== "string" || !(EFFORTS as readonly string[]).includes(cfg["effort"])) {
        return { ok: false, erro: `${onde}: ${nome} tem effort invalido (use ${EFFORTS.join(", ")})` };
      }
      o.effort = cfg["effort"];
    }
    overrides[nome] = o;
  }
  return { ok: true, overrides };
}

/** O nome do agente: `name:` do frontmatter, ou o do arquivo. */
export function nomeDoAgente(origem: string, texto: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  const linha = fm === null ? null : /^name:\s*(.+?)\s*$/m.exec(fm[1] ?? "");
  const nome = linha?.[1]?.replace(/^["']|["']$/g, "");
  return nome !== undefined && nome !== "" ? nome : basename(origem, ".md");
}

/**
 * Reescreve `model`/`effort` no frontmatter, sem tocar no resto do arquivo
 * (corpo, outros campos, fim de linha). Campo ausente é inserido ao fim do
 * frontmatter. Arquivo sem frontmatter é devolvido como está: o `init` não
 * inventa cabeçalho num agente que a skill publicou sem ele.
 */
export function aplicarOverride(texto: string, o: OverrideDeAgente): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---)/.exec(texto);
  if (m === null) return texto;
  const eol = m[1]?.endsWith("\r\n") ? "\r\n" : "\n";
  let corpo = m[2] ?? "";
  for (const campo of ["model", "effort"] as const) {
    const valor = o[campo];
    if (valor === undefined) continue;
    const re = new RegExp(`^${campo}:.*$`, "m");
    corpo = re.test(corpo) ? corpo.replace(re, `${campo}: ${valor}`) : `${corpo}${eol}${campo}: ${valor}`;
  }
  return `${m[1] ?? ""}${corpo}${m[3] ?? ""}${texto.slice(m[0].length)}`;
}

export type PlanoDeAgentes = { artefatos: Artefato[]; avisos: string[] };

/**
 * Os agentes das skills, com o override aplicado. Independe de a skill trazer
 * hook: agente não é hook, e uma skill só com agentes também instala.
 *
 * Override para agente que nenhuma skill selecionada publica não é erro — o
 * projeto pode ter o arquivo pronto antes de instalar a skill, ou ter saído
 * dela —, mas vira aviso, porque também é o jeito de um typo passar batido.
 */
export function planejarAgentes(skills: readonly SkillMontavel[], overrides: Overrides): PlanoDeAgentes {
  const artefatos: Artefato[] = [];
  const conhecidos = new Set<string>();
  for (const s of emOrdemCanonica(skills)) {
    for (const origem of s.agentes ?? []) {
      const destino = `.claude/agents/${basename(origem)}`;
      const texto = readFileSync(origem, "utf8");
      const nome = nomeDoAgente(origem, texto);
      conhecidos.add(nome);
      const o = overrides[nome];
      if (o === undefined || (o.model === undefined && o.effort === undefined)) {
        artefatos.push(artefato(origem, destino, s.nome, "agente"));
        continue;
      }
      const final = aplicarOverride(texto, o);
      artefatos.push(
        final === texto
          ? artefato(origem, destino, s.nome, "agente")
          : artefatoComConteudo(origem, destino, s.nome, "agente", Buffer.from(final, "utf8")),
      );
    }
  }
  const avisos: string[] = [];
  for (const nome of Object.keys(overrides).sort()) {
    if (!conhecidos.has(nome)) {
      avisos.push(`.expx/agentes.json: "${nome}" nao e agente de nenhuma skill instalada; o override nao foi aplicado`);
    }
  }
  return { artefatos, avisos };
}
