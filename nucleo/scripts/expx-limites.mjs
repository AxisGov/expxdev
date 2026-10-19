// Regras fixas da emenda "limites do CodeAnt, fixos" (2026-10-19), cópia do expxdev: as exclusões
// da revisão e os `FATIA_*` reservados. Só `node:`; nada é lido do ambiente além do que se passa.

/** Artefatos de método: fora da revisão sempre, sem se declarar no `.expx/fatiamento.json`. */
export const EXCLUIDOS_DO_NUCLEO = Object.freeze(["^docs/sprintx/", "^docs/entregas/", "^docs/eventos/"]);
/** Primeiro segmento que é código-fonte: `excluir_da_revisao` nunca começa nele (regra 5 da §5). */
export const RAIZES_DE_CODIGO = Object.freeze(["src", "lib", "app", "apps", "packages", "pkg", "cmd", "internal", "server",
  "client", "web", "api", "test", "tests", "spec", "scripts", ".github", ".claude", ".opencode", ".expx"]);
/** Segmento posterior que libera a raiz de código (`^scripts/ci/fixtures/candidatos/`). */
export const PASTAS_GERADAS = Object.freeze(["fixtures", "snapshots", "__snapshots__", "generated", "gerado"]);

// Pasta literal: `^`, um ou mais segmentos terminados em `/`. No segmento, qualquer caractere menos
// `/`, controle e os metacaracteres de regex; o ponto só escrito `\.`.
const SEGMENTO = /(?:[^/\p{Cc}\\^$.|?*+()[\]{}]|\\\.)+\//uy;

/** Os segmentos já desescapados, ou `null` fora da gramática. */
function segmentos(padrao) {
  if (typeof padrao !== "string" || !padrao.startsWith("^") || padrao.length < 2) return null;
  const lista = [];
  for (let i = 1; i < padrao.length;) {
    SEGMENTO.lastIndex = i;
    const s = SEGMENTO.exec(padrao);
    if (!s) return null;
    const literal = s[0].slice(0, -1).replace(/\\\./g, ".");
    if (literal === "." || literal === "..") return null;
    lista.push(literal);
    i += s[0].length;
  }
  return lista;
}

/** O prefixo literal que o padrão exclui (`^a\.b/` → `a.b/`), ou `null` fora da gramática. */
export function prefixoDe(padrao) {
  const s = segmentos(padrao);
  return s === null ? null : s.map((x) => `${x}/`).join("");
}

/** Algum padrão é começo do caminho. Quem aplica usa o prefixo, nunca regex. */
export function excluido(caminho, padroes) {
  return padroes.some((p) => {
    const prefixo = prefixoDe(p);
    return prefixo !== null && caminho.startsWith(prefixo);
  });
}

/** Começa numa raiz de código e nenhum segmento posterior é pasta gerada. Fora da gramática: `false`. */
export function ehRaizDeCodigo(padrao) {
  const s = segmentos(padrao);
  if (s === null || !RAIZES_DE_CODIGO.includes(s[0])) return false;
  return !s.slice(1).some((x) => PASTAS_GERADAS.includes(x));
}

/** Nomes com prefixo `FATIA_` definidos no ambiente (vazio conta), ordenados. */
export function fatiaNoAmbiente(env) {
  return Object.keys(env).filter((k) => k.startsWith("FATIA_") && env[k] !== undefined).sort();
}

/** `FATIA_*` são reservados para sempre: nenhum limite nem exclusão vem do ambiente. */
export function mensagemFatia(nome) {
  return `\`${nome}\` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente`;
}
