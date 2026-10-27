import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { SkillMontavel } from "../plugin/montagem.js";
import { artefato, artefatoComConteudo, emOrdemCanonica, hashDeBytes, type Artefato } from "../plugin/plano.js";
import { lerAgenteDaSkill, reescreverModeloEsforco } from "../orquestracao/materializar.js";
import { resolver, sobreporV1, type Resolucao } from "../orquestracao/resolver.js";
import type { Politica } from "../orquestracao/tipos.js";

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
 *     "agentes": { "runx-investigador": { "model": "haiku", "effort": "low" } } }
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
  const agentes = Object.prototype.hasOwnProperty.call(bruto, "agentes") ? bruto["agentes"] : {};
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
    // a chave pode vir entre aspas (`"model": opus` é YAML válido)
    const re = new RegExp(`^["']?${campo}["']?\s*:.*$`, "m");
    corpo = re.test(corpo) ? corpo.replace(re, `${campo}: ${valor}`) : `${corpo}${eol}${campo}: ${valor}`;
  }
  return `${m[1] ?? ""}${corpo}${m[3] ?? ""}${texto.slice(m[0].length)}`;
}

export type PlanoDeAgentes = {
  artefatos: Artefato[];
  avisos: string[];
  /** Agente que a política não consegue resolver, ou skill com `classe:` inválida. */
  erros: string[];
  /** Uma por agente, só com a política ativa (CONTRATO-expx-orquestracao §9). */
  resolucoes: Resolucao[];
};

/**
 * Os agentes das skills, com o override aplicado. Independe de a skill trazer
 * hook: agente não é hook, e uma skill só com agentes também instala.
 *
 * Override para agente que nenhuma skill selecionada publica não é erro — o
 * projeto pode ter o arquivo pronto antes de instalar a skill, ou ter saído
 * dela —, mas vira aviso, porque também é o jeito de um typo passar batido.
 *
 * Com a política de orquestração ativa (`politica`), cada agente é RESOLVIDO
 * primeiro e o frontmatter recebe a alternativa; o override v1 vem depois, como
 * exceção marcada na resolução (CONTRATO-expx-orquestracao §7.4). Sem
 * política, nada muda.
 */
export function planejarAgentes(skills: readonly SkillMontavel[], overrides: Overrides, politica?: Politica): PlanoDeAgentes {
  const artefatos: Artefato[] = [];
  const conhecidos = new Set<string>();
  const erros: string[] = [];
  const resolucoes: Resolucao[] = [];
  // Com a política, o nome é a chave do lock e do registro: dois agentes com o
  // mesmo `name:` deixariam só o último no lock.
  const donoDoNome = new Map<string, string>();
  for (const s of emOrdemCanonica(skills)) {
    for (const origem of s.agentes ?? []) {
      const destino = `.claude/agents/${basename(origem)}`;
      const texto = readFileSync(origem, "utf8");
      if (politica !== undefined) {
        const lido = lerAgenteDaSkill(`${s.nome}/${basename(origem)}`, texto);
        if (!lido.ok) {
          erros.push(lido.erro);
          continue;
        }
        // A identidade vem do YAML, como o Claude Code a lê: `name: x # nota` é `x`.
        const id = lido.agente.nome;
        conhecidos.add(id);
        const dono = donoDoNome.get(id);
        if (dono !== undefined) {
          erros.push(`agente ${id} publicado pelas skills ${dono} e ${s.nome}; com a politica de orquestracao, o name precisa ser unico`);
          continue;
        }
        donoDoNome.set(id, s.nome);
        const r = resolver({ agente: lido.agente, adaptador: "claude", politica });
        if (!r.ok) {
          erros.push(`agente ${id} (skill ${s.nome}) sem resolucao: ${r.motivo} — ${r.mensagem}`);
          continue;
        }
        const ov = Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : undefined;
        const final = ov === undefined ? r.resolucao : sobreporV1(r.resolucao, ov);
        resolucoes.push(final);
        const alvo = final.materializado ?? final.alternativa;
        const reescrito = reescreverModeloEsforco(texto, alvo.model, alvo.effort);
        artefatos.push(
          reescrito === texto
            ? artefato(origem, destino, s.nome, "agente")
            : artefatoComConteudo(origem, destino, s.nome, "agente", Buffer.from(reescrito, "utf8")),
        );
        continue;
      }
      // Sem política: o nome e o override como sempre foram.
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
  return { artefatos, avisos, erros, resolucoes };
}

export type Limpeza = {
  erros: string[];
  avisos: string[];
  /** Arquivos de `.claude/` que a instalação anterior gravou e que saíram do plano. */
  remover: string[];
};

function hashDoArquivo(caminho: string): string | undefined {
  try {
    if (!statSync(caminho).isFile()) return undefined;
    return hashDeBytes(readFileSync(caminho));
  } catch {
    return undefined;
  }
}

/**
 * Cada pasta do caminho, a partir da primeira, é pasta de verdade e o fim é
 * arquivo comum — nenhum link simbólico no percurso. O `stat` e o `rm` seguem o
 * link, e uma pasta-link levaria a remoção para fora do projeto.
 */
function semLinkNoPercurso(raiz: string, segmentos: readonly string[]): boolean {
  try {
    for (let i = 1; i <= segmentos.length; i++) {
      const s = lstatSync(join(raiz, ...segmentos.slice(0, i)));
      if (i < segmentos.length ? !s.isDirectory() : !s.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * O que o plano de agentes faz com o que JÁ está em `.claude/agents/`.
 *
 * - Destino que existe, tem bytes diferentes e NÃO é do lock anterior é arquivo
 *   do projeto (ou de uma instalação manual): sobrescrevê-lo destruiria o
 *   trabalho da pessoa. Falha antes de qualquer escrita.
 * - Arquivo de `.claude/` que o lock anterior gravou e que saiu do plano (a skill
 *   foi removida, deixou de publicá-lo, ou ele deixou de ser instalado, como a
 *   suíte de teste dos hooks) é removido — mas só se ainda tem o hash do lock.
 *   Editado à mão, fica e vira aviso.
 */
export function planejarLimpeza(
  raiz: string,
  agentes: readonly Artefato[],
  destinosDoPlano: ReadonlySet<string>,
  anteriores: Readonly<Record<string, string>>,
): Limpeza {
  const erros: string[] = [];
  const avisos: string[] = [];
  const remover: string[] = [];
  for (const a of agentes) {
    if (a.destino in anteriores) continue;
    const atual = hashDoArquivo(join(raiz, ...a.destino.split("/")));
    if (atual !== undefined && atual !== a.hash) {
      erros.push(
        `${a.destino} ja existe e nao foi instalado pelo expx (skill ${a.skill}); ` +
          "renomeie ou remova o arquivo do projeto e rode o init de novo",
      );
    }
  }
  // Tudo o que a instalação anterior gravou em `.claude/` e saiu do plano — agente,
  // hook, arquivo de skill — sai do projeto se ainda está como o lock o gravou; o
  // alterado à mão fica, com aviso. Arquivo, nunca pasta. O `.expx/marketplace` é
  // trocado inteiro pela montagem e não passa por aqui.
  for (const [destino, hash] of Object.entries(anteriores).sort()) {
    if (!destino.startsWith(".claude/") || destinosDoPlano.has(destino)) continue;
    // O lock é do projeto e pode ter sido editado: caminho com segmento vazio, `.`
    // ou `..` não é destino que a instalação gravou, e o `join` o levaria para
    // fora de `.claude/`. Nunca é removido.
    const segmentos = destino.split("/");
    if (segmentos.some((p) => p === "" || p === "." || p === "..")) continue;
    if (!semLinkNoPercurso(raiz, segmentos)) continue;
    const atual = hashDoArquivo(join(raiz, ...segmentos));
    if (atual === undefined) continue;
    if (atual === hash) remover.push(destino);
    else avisos.push(`${destino} saiu da instalacao mas foi alterado a mao; nao foi removido`);
  }
  return { erros, avisos, remover };
}
