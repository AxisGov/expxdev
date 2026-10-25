import { posto, type Adaptador, type Alternativa, type Classe } from "./tipos.js";

/**
 * Validação de `model`/`effort` por adaptador (CONTRATO-expx-orquestracao §4.2)
 * e a matriz de esforço do Claude (§6).
 *
 * Só o Claude é validado contra o modelo. OpenCode e Codex são validados na
 * forma: não há manifesto comprovado dos níveis de esforço deles, e inventar
 * uma lista "válida" daria ao projeto uma garantia que ninguém verificou.
 */

export const VERSAO_MATRIZ_EFFORT_CLAUDE = 1;

const FAMILIAS: ReadonlyArray<readonly [string, Classe]> = [
  ["haiku", "mecanico_triagem"],
  ["sonnet", "raciocinio_normal"],
  ["opus", "profundo_excepcional"],
];

/**
 * A classe pela família contida no nome: o alias, ou um segmento de um ID
 * `claude-*` (`claude-3-5-sonnet-…` também é Sonnet). `inherit`, `fable`, um ID
 * sem família e um nome com duas famílias não se classificam.
 */
export function classeDoModeloClaude(model: string): Classe | null {
  const segmentos = model.startsWith("claude-") ? model.split("-") : [model];
  const achadas = FAMILIAS.filter(([familia]) => segmentos.includes(familia));
  return achadas.length === 1 ? (achadas[0]?.[1] ?? null) : null;
}

const TODOS = ["low", "medium", "high", "xhigh", "max"] as const;
const SEM_XHIGH = ["low", "medium", "high", "max"] as const;

/** code.claude.com/docs/en/model-config, acesso em 2026-10-24. */
const MATRIZ: Readonly<Record<string, readonly string[]>> = {
  "claude-opus-5-5": TODOS,
  "claude-sonnet-5-5": TODOS,
  "claude-haiku-5-5": TODOS,
  "claude-opus-5": TODOS,
  "claude-sonnet-5": TODOS,
  "claude-opus-4-8": TODOS,
  "claude-opus-4-7": TODOS,
  "claude-fable-5-1": TODOS,
  "claude-fable-5": TODOS,
  "claude-opus-4-6": SEM_XHIGH,
  "claude-sonnet-4-6": SEM_XHIGH,
};

/**
 * O alias depende do provedor; a v1 o valida como a API da Anthropic o resolve
 * e o contrato declara a suposição. Outro provedor é pego pela observação do
 * executor (F3), não aqui.
 */
const ALIAS_NA_API_ANTHROPIC: Readonly<Record<string, string>> = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};

/** Níveis aceitos; lista vazia = o modelo não aceita esforço. */
export function niveisDeEsforcoClaude(model: string): readonly string[] {
  const id = ALIAS_NA_API_ANTHROPIC[model] ?? model.replace(/-\d{8}$/, "");
  return MATRIZ[id] ?? [];
}

const MODELO_CLAUDE = /^(opus|sonnet|haiku|inherit|claude-[a-z0-9.-]+)$/;
const MODELO_OPENCODE = /^[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MODELO_CODEX = /^[a-z0-9][a-z0-9._-]*$/;
const FORMA_EFFORT = /^[a-z]+$/;

function validarClaude(classe: Classe, alt: Alternativa): string | null {
  if (!MODELO_CLAUDE.test(alt.model)) return `model "${alt.model}" não é alias (opus, sonnet, haiku) nem ID claude-*`;
  if (alt.model === "inherit") return "model inherit não se classifica e não pode entrar numa cadeia";
  const doModelo = classeDoModeloClaude(alt.model);
  if (doModelo === null) return `model "${alt.model}" está sem classe na v1 (família não reconhecida)`;
  if (posto(doModelo) < posto(classe)) return `model "${alt.model}" (${doModelo}) não satisfaz a classe ${classe}`;
  if (alt.effort !== undefined) {
    const niveis = niveisDeEsforcoClaude(alt.model);
    if (niveis.length === 0) return `model "${alt.model}" não aceita esforço; remova effort`;
    if (!niveis.includes(alt.effort)) return `effort "${alt.effort}" não é suportado por "${alt.model}" (aceitos: ${niveis.join(", ")})`;
  }
  return null;
}

function validarForma(alt: Alternativa, modelo: RegExp, descricao: string): string | null {
  if (!modelo.test(alt.model)) return `model "${alt.model}" precisa ser ${descricao}`;
  if (alt.effort !== undefined && !FORMA_EFFORT.test(alt.effort)) return `effort "${alt.effort}" fora da forma ^[a-z]+$`;
  return null;
}

/** `null` quando a alternativa vale para a classe naquele adaptador; senão, o motivo. */
export function validarAlternativa(adaptador: Adaptador, classe: Classe, alt: Alternativa): string | null {
  switch (adaptador) {
    case "claude":
      return validarClaude(classe, alt);
    case "opencode":
      return validarForma(alt, MODELO_OPENCODE, "provedor/modelo");
    case "codex":
      return validarForma(alt, MODELO_CODEX, "um slug ^[a-z0-9][a-z0-9._-]*$");
  }
}
