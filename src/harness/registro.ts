import { execFile } from "node:child_process";
import { promisify } from "node:util";
// @ts-expect-error The runtime helper is intentionally shipped as a Node module beside the harness adapters.
import { ehRepositorioFonte } from "../../nucleo/hooks/expx-session-sync.mjs";
import { instalarPlugin, type ResultadoInstalacao } from "./instalar.js";
import { marketplaceParaRegistrar, type AlvoMarketplace } from "./marketplace-alvo.js";

const exec = promisify(execFile);

/**
 * O registro do plugin no Claude Code, o mesmo para o `init` e para o `update`:
 * resolve o marketplace a registrar (o do checkout principal numa worktree,
 * quando ele existe) e roda a sequência de instalação com esse caminho. No
 * repositório-fonte do CLI não registra nada: o `expx-local` do escopo do usuário
 * é único, e o conjunto de skills de lá trocaria o plugin de todas as sessões.
 */
export type DependenciasRegistro = {
  resolver?: (raiz: string) => Promise<AlvoMarketplace>;
  instalar?: (caminho: string) => Promise<ResultadoInstalacao>;
};

/** A raiz Git, para a guarda valer também a partir de uma subpasta. */
async function raizDoProjeto(raiz: string): Promise<string> {
  try {
    return (await exec("git", ["-C", raiz, "rev-parse", "--show-toplevel"])).stdout.trim();
  } catch {
    return raiz;
  }
}

export async function registrarPluginNoClaude(
  raiz: string,
  deps: DependenciasRegistro = {},
): Promise<{ avisos: string[]; instalacao: ResultadoInstalacao }> {
  if (ehRepositorioFonte(await raizDoProjeto(raiz))) {
    return {
      avisos: ["este e o repositorio-fonte do CLI: o plugin nao foi registrado. O registro no escopo do usuario fica com os projetos consumidores."],
      instalacao: { ok: true, executados: [], pulado: true },
    };
  }
  const alvo = await (deps.resolver ?? marketplaceParaRegistrar)(raiz);
  const instalacao = await (deps.instalar ?? instalarPlugin)(alvo.caminho);
  return { avisos: alvo.aviso === undefined ? [] : [alvo.aviso], instalacao };
}

/**
 * O `update` remonta o `.expx/marketplace`, mas o Claude Code roda o plugin de um
 * cache: sem reinstalar, a sessão seguinte carregaria a versão antiga. Registra
 * quando o update aplicou algo, fora do `--check`, e o lock inclui o `claude`.
 */
export function deveRegistrarNoUpdate(
  r: { ok: boolean; aplicou: boolean },
  check: boolean,
  harness: readonly string[],
): boolean {
  return r.ok && r.aplicou && !check && harness.includes("claude");
}
