import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOME_DO_MARKETPLACE, NOME_DO_PLUGIN } from "../plugin/manifestos.js";
import { fazerBackup } from "./backup.js";
import type { HookInstalado } from "./hooks.js";
import { comporSettings, type EntradaGerenciada, type EntradaHook } from "./composicao.js";

/**
 * Merge do `.claude/settings.json` — o ponto mais fácil de errar.
 *
 * Regras: faz backup antes de tocar, mescla APENAS as chaves necessárias,
 * preserva todo o resto, e nunca sobrescreve o arquivo inteiro. JSON inválido
 * não é consertado: avisa e sai.
 *
 * Duas formas de `enabledPlugins` circulam: a documentação mostra um array
 * (`["p@m"]`), e o arquivo que o Claude Code realmente escreve usa um objeto
 * (`{"p@m": true}`) — medido em
 * `docs/expx-cli/base/09-validacao-marketplace-local.md`. Ler as duas e
 * escrever a segunda evita corromper o arquivo do usuário.
 *
 * Os hooks são COMPOSTOS (ver `composicao.ts`): núcleo, skills e o que já
 * estava no arquivo. A composição acontece em memória, no `planejarSettings`,
 * antes de qualquer escrita no projeto; o `gravarSettings` só escreve o que o
 * plano decidiu, e só se o conteúdo mudou — um `init` repetido não reescreve o
 * arquivo nem cria backup novo.
 *
 * ATENÇÃO: escrever estas chaves NÃO instala o plugin. Foi testado: cinco
 * sintaxes em `settings.json` de projeto e nenhuma carregou. A instalação de
 * fato é feita pelo `claude plugin install` (ver `src/harness/instalar.ts`).
 */

export type ResultadoMerge =
  | { ok: true; criado: boolean; backup?: string }
  | { ok: false; erro: string };

export type Habilitados = Record<string, boolean>;

/** O evento de cada hook do núcleo ou de skill sem manifesto, deduzido do nome do arquivo. */
function eventoDoHook(relativo: string): "UserPromptSubmit" | "Stop" | "SessionStart" | null {
  if (relativo.includes("expx-session-sync")) return "SessionStart";
  if (relativo.includes("injetar")) return "UserPromptSubmit";
  // O lembrete de skill: `UserPromptSubmit` é o único evento que roda ANTES
  // da primeira ação do modelo, e é disso que ele depende — o problema que ele
  // resolve é a etapa de escolher o processo simplesmente não acontecer
  // quando já existe uma hipótese técnica formada.
  if (relativo.includes("lembrete")) return "UserPromptSubmit";
  if (relativo.includes("reindexar")) return "Stop";
  return null;
}

/**
 * A entrada de um hook do núcleo, ou de skill que não publica
 * `.claude/settings.json` (o memox, com hooks soltos `memox-*.sh`): o evento
 * sai do nome do arquivo. A forma do comando é a de sempre, para que uma
 * instalação anterior seja reconhecida como a mesma entrada e não duplique.
 */
export function entradaPorNome(h: HookInstalado): EntradaHook | null {
  const evento = eventoDoHook(h.relativo);
  if (evento === null) return null;
  const hook = h.relativo.endsWith("expx-session-sync.mjs")
    ? { type: "command", command: "node", args: [`\${CLAUDE_PROJECT_DIR}/${h.relativo}`] }
    : { type: "command", command: `$CLAUDE_PROJECT_DIR/${h.relativo}` };
  return { skill: h.skill, evento, hook };
}

/** Aceita array (documentado) ou objeto (real). Qualquer outra coisa vira `{}`. */
export function lerPluginsHabilitados(valor: unknown): Habilitados {
  if (Array.isArray(valor)) {
    const saida: Habilitados = {};
    for (const item of valor) if (typeof item === "string") saida[item] = true;
    return saida;
  }
  if (typeof valor === "object" && valor !== null) {
    const saida: Habilitados = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (typeof v === "boolean") saida[k] = v;
    }
    return saida;
  }
  return {};
}

export function caminhoDoSettings(raizProjeto: string): string {
  return join(raizProjeto, ".claude", "settings.json");
}

export type PlanoSettings = {
  caminho: string;
  existia: boolean;
  /** O texto final; igual ao atual quando nada muda. */
  texto: string;
  mudou: boolean;
  gerenciadas: EntradaGerenciada[];
};

/**
 * Compõe o settings em memória. Não escreve nada.
 *
 * `caminhoMarketplace` é absoluto de propósito: é o que o `claude plugin
 * marketplace add` grava, e um caminho relativo não é resolvido aqui.
 */
export function planejarSettings(
  raizProjeto: string,
  caminhoMarketplace: string,
  entradas: readonly EntradaHook[],
  anteriores: readonly EntradaGerenciada[] = [],
): { ok: true; plano: PlanoSettings } | { ok: false; erro: string } {
  const caminho = caminhoDoSettings(raizProjeto);
  const existia = existsSync(caminho);
  let bruto = "";
  let atual: Record<string, unknown> = {};
  if (existia) {
    bruto = readFileSync(caminho, "utf8");
    let lido: unknown;
    try {
      lido = JSON.parse(bruto);
    } catch (e: unknown) {
      return { ok: false, erro: `${caminho} nao e JSON valido e nao sera alterado: ${String(e)}` };
    }
    if (typeof lido !== "object" || lido === null || Array.isArray(lido)) {
      return { ok: false, erro: `${caminho} nao contem um objeto JSON` };
    }
    atual = lido as Record<string, unknown>;
  }

  const c = comporSettings(atual, entradas, anteriores);
  if (!c.ok) return { ok: false, erro: `${caminho}: ${c.erro}` };

  const marketplaces = {
    ...((atual["extraKnownMarketplaces"] as Record<string, unknown> | undefined) ?? {}),
    [NOME_DO_MARKETPLACE]: { source: { source: "directory", path: caminhoMarketplace } },
  };
  const habilitados: Habilitados = {
    ...lerPluginsHabilitados(atual["enabledPlugins"]),
    [`${NOME_DO_PLUGIN}@${NOME_DO_MARKETPLACE}`]: true,
  };
  const novo: Record<string, unknown> = {
    ...c.conteudo,
    extraKnownMarketplaces: marketplaces,
    enabledPlugins: habilitados,
  };
  // `hooks` depois das duas chaves do ExpxDev, como sempre foi — salvo quando
  // o arquivo já o tinha, e então fica onde a pessoa o pôs.
  if (!Object.prototype.hasOwnProperty.call(atual, "hooks") && "hooks" in novo) {
    const h = novo["hooks"];
    delete novo["hooks"];
    novo["hooks"] = h;
  }
  const texto = `${JSON.stringify(novo, null, 2)}\n`;
  return { ok: true, plano: { caminho, existia, texto, mudou: texto !== bruto, gerenciadas: c.gerenciadas } };
}

/** Escreve o que o plano decidiu. Backup só quando um arquivo existente muda. */
export function gravarSettings(plano: PlanoSettings): ResultadoMerge {
  if (!plano.mudou) return { ok: true, criado: false };
  const backup = plano.existia ? fazerBackup(plano.caminho) : undefined;
  mkdirSync(join(plano.caminho, ".."), { recursive: true });
  writeFileSync(plano.caminho, plano.texto);
  return backup === undefined ? { ok: true, criado: !plano.existia } : { ok: true, criado: !plano.existia, backup };
}

/**
 * Acrescenta o marketplace local, habilita o plugin e registra hooks por nome
 * de arquivo, preservando o resto. Planeja e grava de uma vez.
 */
export function mesclarSettings(
  raizProjeto: string,
  caminhoMarketplace: string,
  hooks: readonly HookInstalado[] = [],
): ResultadoMerge {
  const entradas = hooks.map(entradaPorNome).filter((e): e is EntradaHook => e !== null);
  const p = planejarSettings(raizProjeto, caminhoMarketplace, entradas);
  if (!p.ok) return p;
  return gravarSettings(p.plano);
}
