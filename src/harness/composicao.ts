import { readFileSync } from "node:fs";
import { compararSkills, jsonCanonico } from "../plugin/plano.js";

/**
 * Composição dos registros de hook no `.claude/settings.json`.
 *
 * O settings do projeto NÃO é arquivo "a última skill vence": é a soma dos
 * hooks do núcleo do ExpxDev, dos hooks que cada skill publica no próprio
 * `.claude/settings.json`, e do que a pessoa já tinha escrito ali.
 *
 * ## Identidade de uma entrada
 *
 * Um hook é identificado por (evento, matcher, command, args). Duas entradas
 * com a mesma identidade e a mesma definição (type, timeout e o resto) são a
 * MESMA entrada: deduplica. Mesma identidade com definição diferente — o mesmo
 * comando com timeout 10 numa skill e 30 na outra — é conflito: a composição
 * falha, em vez de escolher uma pela ordem. `matcher` ausente e `""` casam
 * tudo no Claude Code, e por isso são a mesma identidade.
 *
 * ## O que é do ExpxDev e o que é da pessoa
 *
 * O lock guarda a lista exata das entradas gerenciadas pela instalação
 * anterior. Numa reinstalação, SÓ essas saem para serem recompostas; qualquer
 * outra entrada do arquivo é da pessoa e fica onde está. Entrada da pessoa com
 * a mesma identidade de uma gerenciada e definição diferente é conflito, e
 * também falha: não há como decidir qual das duas ela quer.
 *
 * ## Ordem
 *
 * As entradas gerenciadas saem em ordem canônica — núcleo primeiro, depois as
 * skills em ordem alfabética, cada uma na ordem em que ela mesma publicou —,
 * então a ordem em que as skills foram escolhidas não muda o arquivo.
 */

/** Um hook como o Claude Code o lê: `{type, command, timeout?, args?, ...}`. */
export type DefinicaoHook = Record<string, unknown> & { type: string; command: string };

export type EntradaHook = {
  /** Dona da entrada: a skill, ou `expx` para o núcleo. */
  skill: string;
  evento: string;
  /** Ausente quando a publicação não declara matcher. */
  matcher?: string;
  hook: DefinicaoHook;
};

/** A forma que vai para o lock: sem a skill, que não muda o que roda. */
export type EntradaGerenciada = { evento: string; matcher?: string; hook: DefinicaoHook };

export type Composicao =
  | { ok: true; conteudo: Record<string, unknown>; gerenciadas: EntradaGerenciada[] }
  | { ok: false; erro: string };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function identidade(evento: string, matcher: string | undefined, hook: Record<string, unknown>): string {
  return jsonCanonico([evento, matcher ?? "", hook["command"] ?? null, hook["args"] ?? null]);
}

function definicao(matcher: string | undefined, hook: Record<string, unknown>): string {
  return jsonCanonico([matcher ?? "", hook]);
}

function descrever(e: { evento: string; matcher?: string | undefined; hook: Record<string, unknown> }): string {
  const m = e.matcher === undefined || e.matcher === "" ? "" : ` [${e.matcher}]`;
  return `${e.evento}${m} ${String(e.hook["command"])}`;
}

/**
 * Os hooks que uma skill publica no `.claude/settings.json` dela, validados.
 * Manifesto fora do formato falha — nunca é pulado em silêncio, porque um hook
 * de segurança que some sem aviso é pior que uma instalação recusada.
 */
export function lerHooksDaSkill(skill: string, caminho: string): { ok: true; entradas: EntradaHook[] } | { ok: false; erro: string } {
  const onde = `${skill} .claude/settings.json`;
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e: unknown) {
    return { ok: false, erro: `manifesto invalido: ${onde}: ${String(e)}` };
  }
  if (!ehObjeto(bruto)) return { ok: false, erro: `manifesto invalido: ${onde}: precisa ser um objeto` };
  const hooks = bruto["hooks"];
  if (hooks === undefined) return { ok: true, entradas: [] };
  if (!ehObjeto(hooks)) return { ok: false, erro: `manifesto invalido: ${onde}: "hooks" precisa ser um objeto` };

  const entradas: EntradaHook[] = [];
  for (const [evento, grupos] of Object.entries(hooks)) {
    if (!Array.isArray(grupos)) return { ok: false, erro: `manifesto invalido: ${onde}: ${evento} precisa ser uma lista` };
    for (const g of grupos) {
      if (!ehObjeto(g) || !Array.isArray(g["hooks"])) {
        return { ok: false, erro: `manifesto invalido: ${onde}: grupo de ${evento} sem lista "hooks"` };
      }
      const matcher = g["matcher"];
      if (matcher !== undefined && typeof matcher !== "string") {
        return { ok: false, erro: `manifesto invalido: ${onde}: matcher de ${evento} precisa ser texto` };
      }
      for (const h of g["hooks"] as unknown[]) {
        if (!ehObjeto(h) || typeof h["type"] !== "string" || typeof h["command"] !== "string" || h["command"] === "") {
          return { ok: false, erro: `manifesto invalido: ${onde}: hook de ${evento} sem type/command` };
        }
        const t = h["timeout"];
        if (t !== undefined && (typeof t !== "number" || !(t > 0))) {
          return { ok: false, erro: `manifesto invalido: ${onde}: timeout de ${String(h["command"])} precisa ser numero positivo` };
        }
        entradas.push({
          skill,
          evento,
          ...(matcher !== undefined ? { matcher } : {}),
          hook: { ...(h as DefinicaoHook) },
        });
      }
    }
  }
  return { ok: true, entradas };
}

/**
 * Os caminhos de projeto que um comando de hook referencia
 * (`.claude/hooks/...`, `.claude/skills/...`). Serve para recusar skill
 * incompleta: registrar um hook que a própria skill não publica.
 */
export function caminhosReferenciados(hook: DefinicaoHook): string[] {
  const texto = [hook.command, ...(Array.isArray(hook["args"]) ? (hook["args"] as unknown[]).map(String) : [])].join(" ");
  return [...texto.matchAll(/\.claude\/(?:hooks|skills)\/[A-Za-z0-9._/-]+/g)].map((m) => m[0]);
}

/** Consolida as entradas das fontes entre si: dedupe ou conflito. */
function consolidarEntradas(entradas: readonly EntradaHook[]): { ok: true; unicas: EntradaHook[] } | { ok: false; erro: string } {
  // estável: a ordem interna de cada skill é preservada
  const ordenadas = entradas
    .map((e, i) => ({ e, i }))
    .sort((a, b) => compararSkills(a.e.skill, b.e.skill) || a.i - b.i)
    .map((x) => x.e);

  const porId = new Map<string, EntradaHook>();
  const unicas: EntradaHook[] = [];
  const conflitos: string[] = [];
  for (const e of ordenadas) {
    const id = identidade(e.evento, e.matcher, e.hook);
    const ja = porId.get(id);
    if (ja === undefined) {
      porId.set(id, e);
      unicas.push(e);
      continue;
    }
    if (definicao(ja.matcher, ja.hook) !== definicao(e.matcher, e.hook)) {
      conflitos.push(
        `  ${descrever(e)} — ${ja.skill}: ${jsonCanonico(ja.hook)} | ${e.skill}: ${jsonCanonico(e.hook)}`,
      );
    }
  }
  if (conflitos.length > 0) {
    return {
      ok: false,
      erro: ["conflito de composicao no .claude/settings.json (nada foi escrito):", ...conflitos].join("\n"),
    };
  }
  return { ok: true, unicas };
}

/** Remove do settings atual as entradas que a instalação anterior gerenciava. */
function semAnteriores(hooks: Record<string, unknown>, anteriores: readonly EntradaGerenciada[]): Record<string, unknown> {
  if (anteriores.length === 0) return hooks;
  const alvo = new Set(anteriores.map((a) => `${identidade(a.evento, a.matcher, a.hook)}|${definicao(a.matcher, a.hook)}`));
  const saida: Record<string, unknown> = {};
  for (const [evento, grupos] of Object.entries(hooks)) {
    if (!Array.isArray(grupos)) {
      saida[evento] = grupos;
      continue;
    }
    let removeu = false;
    const novos: unknown[] = [];
    for (const g of grupos) {
      if (!ehObjeto(g) || !Array.isArray(g["hooks"])) {
        novos.push(g);
        continue;
      }
      const matcher = typeof g["matcher"] === "string" ? g["matcher"] : undefined;
      const restantes = (g["hooks"] as unknown[]).filter((h) => {
        if (!ehObjeto(h)) return true;
        const sai = alvo.has(`${identidade(evento, matcher, h)}|${definicao(matcher, h)}`);
        if (sai) removeu = true;
        return !sai;
      });
      if (restantes.length === (g["hooks"] as unknown[]).length) novos.push(g);
      else if (restantes.length > 0) novos.push({ ...g, hooks: restantes });
    }
    if (novos.length > 0 || !removeu) saida[evento] = novos;
  }
  return saida;
}

/** As entradas presentes no settings, indexadas pela identidade. */
function presentes(hooks: Record<string, unknown>): Map<string, { matcher?: string; hook: Record<string, unknown> }> {
  const m = new Map<string, { matcher?: string; hook: Record<string, unknown> }>();
  for (const [evento, grupos] of Object.entries(hooks)) {
    if (!Array.isArray(grupos)) continue;
    for (const g of grupos) {
      if (!ehObjeto(g) || !Array.isArray(g["hooks"])) continue;
      const matcher = typeof g["matcher"] === "string" ? g["matcher"] : undefined;
      for (const h of g["hooks"] as unknown[]) {
        if (!ehObjeto(h)) continue;
        const id = identidade(evento, matcher, h);
        if (!m.has(id)) m.set(id, matcher !== undefined ? { matcher, hook: h } : { hook: h });
      }
    }
  }
  return m;
}

function gerenciada(e: EntradaHook): EntradaGerenciada {
  return e.matcher !== undefined ? { evento: e.evento, matcher: e.matcher, hook: e.hook } : { evento: e.evento, hook: e.hook };
}

/** As entradas do lock em ordem estável pela identidade. */
function ordenarGerenciadas(l: EntradaGerenciada[]): EntradaGerenciada[] {
  return l.sort((a, b) => {
    const x = identidade(a.evento, a.matcher, a.hook);
    const y = identidade(b.evento, b.matcher, b.hook);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/**
 * Compõe o settings. Não escreve nada: devolve o conteúdo novo ou o erro.
 *
 * `extras` são as chaves de topo do ExpxDev (marketplace e plugin habilitado),
 * que continuam sendo mescladas por quem chama.
 */
export function comporSettings(
  atual: Record<string, unknown>,
  entradas: readonly EntradaHook[],
  anteriores: readonly EntradaGerenciada[] = [],
): Composicao {
  if (Object.prototype.hasOwnProperty.call(atual, "hooks") && !ehObjeto(atual["hooks"])) {
    return { ok: false, erro: ".claude/settings.json contem hooks invalido" };
  }
  const c = consolidarEntradas(entradas);
  if (!c.ok) return c;

  const originais = (atual["hooks"] as Record<string, unknown> | undefined) ?? {};
  const desejadas = new Set(c.unicas.map((e) => `${identidade(e.evento, e.matcher, e.hook)}|${definicao(e.matcher, e.hook)}`));
  const aposRemocao = semAnteriores(
    originais,
    anteriores.filter((a) => !desejadas.has(`${identidade(a.evento, a.matcher, a.hook)}|${definicao(a.matcher, a.hook)}`)),
  );

  // O que sobrou é da pessoa (ou já é a própria entrada desejada).
  const doArquivo = presentes(aposRemocao);
  const conflitos: string[] = [];
  const faltam: EntradaHook[] = [];
  for (const e of c.unicas) {
    const ja = doArquivo.get(identidade(e.evento, e.matcher, e.hook));
    if (ja === undefined) {
      faltam.push(e);
      continue;
    }
    if (definicao(ja.matcher, ja.hook) !== definicao(e.matcher, e.hook)) {
      conflitos.push(`  ${descrever(e)} — projeto: ${jsonCanonico(ja.hook)} | ${e.skill}: ${jsonCanonico(e.hook)}`);
    }
  }
  if (conflitos.length > 0) {
    return {
      ok: false,
      erro: [
        "conflito entre o .claude/settings.json do projeto e um hook gerenciado (nada foi escrito):",
        ...conflitos,
        "ajuste ou remova a entrada do projeto e rode o init de novo",
      ].join("\n"),
    };
  }

  const gerenciadas = ordenarGerenciadas(c.unicas.map(gerenciada));
  const conteudo: Record<string, unknown> = { ...atual };
  if (c.unicas.length === 0 && !Object.prototype.hasOwnProperty.call(atual, "hooks")) {
    return { ok: true, conteudo, gerenciadas };
  }

  // Evento do projeto que não é lista não pode receber entrada: reescrevê-lo
  // apagaria o que a pessoa escreveu ali.
  for (const e of faltam) {
    const v = aposRemocao[e.evento];
    if (v !== undefined && !Array.isArray(v)) {
      return { ok: false, erro: `.claude/settings.json: hooks.${e.evento} nao e uma lista; nada foi escrito` };
    }
  }

  // Um grupo por (evento, skill, matcher), na ordem canônica.
  const eventos: Record<string, unknown> = {};
  for (const [evento, grupos] of Object.entries(aposRemocao)) eventos[evento] = Array.isArray(grupos) ? [...grupos] : grupos;
  let grupoAtual: { chave: string; grupo: { matcher?: string; hooks: DefinicaoHook[] } } | undefined;
  for (const e of faltam) {
    const chave = jsonCanonico([e.evento, e.skill, e.matcher ?? null]);
    if (grupoAtual?.chave !== chave) {
      const grupo: { matcher?: string; hooks: DefinicaoHook[] } = e.matcher !== undefined ? { matcher: e.matcher, hooks: [] } : { hooks: [] };
      grupoAtual = { chave, grupo };
      const lista = eventos[e.evento];
      if (Array.isArray(lista)) lista.push(grupo);
      else eventos[e.evento] = [grupo];
    }
    grupoAtual.grupo.hooks.push(e.hook);
  }
  conteudo["hooks"] = eventos;
  return { ok: true, conteudo, gerenciadas };
}
