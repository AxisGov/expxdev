import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { basename, join } from "node:path";
import { lerFrontmatter } from "../parser/leitura/frontmatter.js";

/** Configuração efetiva que o `init` materializou no agente instalado. */
export type ConfiguracaoAgente = {
  nome: string;
  model: string | null;
  effort: string | null;
  arquivo: string;
};

function comoObjeto(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Lê a saída do instalador, não o catálogo das skills nem os overrides.
 *
 * Assim o painel continua descartável: `planejarAgentes` permanece sendo o
 * único lugar que decide piso + override, e esta projeção só mostra o resultado
 * efetivamente instalado. Arquivo ausente ou inválido falha aberto.
 */
export function lerConfiguracoesAgentes(raiz: string): ConfiguracaoAgente[] {
  const dir = join(raiz, ".claude", "agents");
  if (!existsSync(dir)) return [];

  let entradas: Dirent[];
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const agentes: ConfiguracaoAgente[] = [];
  for (const entrada of entradas) {
    if (!entrada.isFile() || !entrada.name.endsWith(".md")) continue;
    const caminho = join(dir, entrada.name);
    let lido;
    try {
      lido = lerFrontmatter(readFileSync(caminho, "utf8"));
    } catch {
      continue;
    }
    if (!lido.ok) continue;
    const dados = comoObjeto(lido.dados);
    if (dados === null) continue;
    agentes.push({
      nome: texto(dados["name"]) ?? basename(entrada.name, ".md"),
      model: texto(dados["model"]),
      effort: texto(dados["effort"]),
      arquivo: `.claude/agents/${entrada.name}`,
    });
  }
  return agentes.sort((a, b) => a.nome.localeCompare(b.nome));
}
