import { readFileSync } from "node:fs";
import { compararSkills, jsonCanonico } from "../plugin/plano.js";

/**
 * Composição do `.expx/hooks.json` — o manifesto de MODO de cada hook
 * (`aviso`, `bloqueio`, `desligado`), lido pelos próprios hooks das skills.
 *
 * Cada skill publica o seu. Instalá-los copiando um por cima do outro faz a
 * última skill apagar os modos das anteriores; e desligar um hook passa a
 * depender de qual skill foi escolhida por último. Por isso é composição:
 *
 *   - id exclusivo                                → entra;
 *   - mesmo id, configuração semanticamente igual → deduplica;
 *   - mesmo id, configuração diferente            → FALHA, nada é escrito.
 *
 * Ids com namespace (`sprintx/git-perigoso`, `mergex/git-perigoso`) são ids
 * distintos: desligar um não desliga o outro.
 *
 * ## O modo é decisão da pessoa
 *
 * Um hook promovido de `aviso` a `bloqueio`, ou desligado de propósito, não
 * pode voltar ao padrão da skill por causa de uma reinstalação. O lock guarda o
 * que as skills publicaram na instalação anterior; um `modo` no arquivo que
 * difere desse padrão anterior é escolha da pessoa, e é preservado. Sem lock
 * anterior, qualquer `modo` já presente é preservado — a mesma regra do
 * `install.sh` das skills ("nunca sobrescreve"). Ids que nenhuma skill
 * publica e que o ExpxDev nunca gerenciou são da pessoa e ficam.
 *
 * A saída tem os ids em ordem alfabética: não depende da ordem das skills.
 */

export type ConfigModo = Record<string, unknown>;
export type ModosPublicados = Record<string, ConfigModo>;

const MODOS = new Set(["aviso", "bloqueio", "desligado"]);

const LEIA =
  "Composto pelo expxdev init a partir do .expx/hooks.json de cada skill. O modo de cada hook: " +
  "'aviso' registra no rastro e nao bloqueia; 'bloqueio' barra a acao; 'desligado' desliga so aquele id. " +
  "Mudar o modo aqui e decisao sua e sobrevive a reinstalacao.";

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** O manifesto de uma skill, validado. */
export function lerModosDaSkill(skill: string, caminho: string): { ok: true; modos: ModosPublicados } | { ok: false; erro: string } {
  const onde = `${skill} .expx/hooks.json`;
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e: unknown) {
    return { ok: false, erro: `manifesto invalido: ${onde}: ${String(e)}` };
  }
  if (!ehObjeto(bruto)) return { ok: false, erro: `manifesto invalido: ${onde}: precisa ser um objeto` };
  for (const k of Object.keys(bruto)) {
    if (k === "hooks" || k === "expx_hooks" || k.startsWith("_")) continue;
    return { ok: false, erro: `manifesto invalido: ${onde}: chave desconhecida "${k}"` };
  }
  if (bruto["expx_hooks"] !== undefined && bruto["expx_hooks"] !== 1) {
    return { ok: false, erro: `manifesto invalido: ${onde}: expx_hooks ${String(bruto["expx_hooks"])} nao suportado` };
  }
  const hooks = bruto["hooks"] ?? {};
  if (!ehObjeto(hooks)) return { ok: false, erro: `manifesto invalido: ${onde}: "hooks" precisa ser um objeto` };
  const modos: ModosPublicados = {};
  for (const [id, cfg] of Object.entries(hooks)) {
    if (!ehObjeto(cfg)) return { ok: false, erro: `manifesto invalido: ${onde}: ${id} precisa ser um objeto` };
    if (cfg["modo"] !== undefined && !MODOS.has(String(cfg["modo"]))) {
      return { ok: false, erro: `manifesto invalido: ${onde}: ${id} tem modo "${String(cfg["modo"])}"` };
    }
    modos[id] = cfg;
  }
  return { ok: true, modos };
}

/** Consolida os manifestos das skills entre si. */
export function consolidarModos(
  porSkill: ReadonlyArray<{ skill: string; modos: ModosPublicados }>,
): { ok: true; publicados: ModosPublicados } | { ok: false; erro: string } {
  const dono = new Map<string, string>();
  const publicados: ModosPublicados = {};
  const conflitos: string[] = [];
  for (const { skill, modos } of [...porSkill].sort((a, b) => compararSkills(a.skill, b.skill))) {
    for (const [id, cfg] of Object.entries(modos)) {
      const ja = publicados[id];
      if (ja === undefined) {
        publicados[id] = cfg;
        dono.set(id, skill);
      } else if (jsonCanonico(ja) !== jsonCanonico(cfg)) {
        conflitos.push(`  ${id} — ${String(dono.get(id))}: ${jsonCanonico(ja)} | ${skill}: ${jsonCanonico(cfg)}`);
      }
    }
  }
  if (conflitos.length > 0) {
    return { ok: false, erro: ["conflito de id no .expx/hooks.json (nada foi escrito):", ...conflitos].join("\n") };
  }
  return { ok: true, publicados: ordenarChaves(publicados) };
}

function ordenarChaves<T>(o: Record<string, T>): Record<string, T> {
  const saida: Record<string, T> = {};
  for (const k of Object.keys(o).sort()) saida[k] = o[k] as T;
  return saida;
}

/**
 * O arquivo final: o publicado, com o modo escolhido pela pessoa preservado.
 * `existente` é o conteúdo atual do projeto (já lido e validado como objeto),
 * `anteriores` o que as skills publicavam na instalação anterior (do lock).
 */
export function comporModos(
  publicados: ModosPublicados,
  existente: Record<string, unknown> | undefined,
  anteriores: ModosPublicados | undefined,
): { ok: true; conteudo: Record<string, unknown> } | { ok: false; erro: string } {
  const atuais = existente?.["hooks"];
  if (atuais !== undefined && !ehObjeto(atuais)) {
    return { ok: false, erro: '.expx/hooks.json do projeto tem "hooks" invalido; nada foi escrito' };
  }
  const doProjeto = (atuais ?? {}) as Record<string, unknown>;

  const hooks: Record<string, unknown> = {};
  for (const [id, cfg] of Object.entries(publicados)) {
    const noProjeto = doProjeto[id];
    const modo = ehObjeto(noProjeto) ? noProjeto["modo"] : undefined;
    const padraoAnterior = anteriores?.[id]?.["modo"];
    const escolhido =
      typeof modo === "string" && MODOS.has(modo) && (anteriores?.[id] === undefined ? true : modo !== padraoAnterior);
    hooks[id] = escolhido && modo !== cfg["modo"] ? { ...cfg, modo } : cfg;
  }
  for (const [id, cfg] of Object.entries(doProjeto)) {
    if (id in hooks) continue;
    if (anteriores !== undefined && id in anteriores) continue; // era do ExpxDev, a skill saiu
    hooks[id] = cfg;
  }

  const conteudo: Record<string, unknown> = { expx_hooks: 1, _leia: LEIA, hooks: ordenarChaves(hooks) };
  for (const [k, v] of Object.entries(existente ?? {})) {
    if (k === "expx_hooks" || k === "_leia" || k === "hooks") continue;
    conteudo[k] = v;
  }
  return { ok: true, conteudo };
}
