import { instalarPlugin, type ResultadoInstalacao } from "./instalar.js";
import { marketplaceParaRegistrar, type AlvoMarketplace } from "./marketplace-alvo.js";

/**
 * O registro do plugin no Claude Code, o mesmo para o `init` e para o `update`:
 * resolve o marketplace a registrar (o do checkout principal numa worktree,
 * quando ele existe) e roda a sequência de instalação com esse caminho.
 */
export type DependenciasRegistro = {
  resolver?: (raiz: string) => Promise<AlvoMarketplace>;
  instalar?: (caminho: string) => Promise<ResultadoInstalacao>;
};

export async function registrarPluginNoClaude(
  raiz: string,
  deps: DependenciasRegistro = {},
): Promise<{ avisos: string[]; instalacao: ResultadoInstalacao }> {
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
