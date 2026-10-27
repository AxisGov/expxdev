import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Qual `.expx/marketplace` registrar no escopo do usuário (`claude plugin
 * marketplace add`), e o que dizer sobre isso.
 *
 * O registro grava um caminho ABSOLUTO. Numa worktree, o caminho dela some
 * quando ela é removida, e o plugin deixa de carregar (`cache-miss`): os
 * comandos /expx: desaparecem, embora o settings do projeto já use
 * `./.expx/marketplace` — que o Claude Code resolve contra o checkout principal
 * (`src/cli/init.ts`, `planejarSettings`). Relato da janela do conselhos,
 * 2026-10-26.
 *
 * - Fora de worktree, ou sem conseguir ler o Git: o da própria raiz, sem aviso.
 * - Worktree ligada com o marketplace montado no checkout principal: o do
 *   principal, que é o que o settings do projeto já resolve, com aviso.
 * - Worktree ligada sem marketplace no principal: o da worktree (funciona
 *   agora), com o aviso de que o registro quebra quando ela for removida.
 */
export type AlvoMarketplace = { caminho: string; aviso?: string };
export type ExecutorGit = (args: string[]) => Promise<string>;

const gitPadrao: ExecutorGit = async (args) => (await exec("git", args)).stdout;

export async function marketplaceParaRegistrar(
  raiz: string,
  git: ExecutorGit = gitPadrao,
): Promise<AlvoMarketplace> {
  const local = join(raiz, ".expx", "marketplace");
  let saida: string;
  try {
    saida = await git(["-C", raiz, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"]);
  } catch {
    return { caminho: local };
  }
  const [gitDir, comum] = saida.split(/\r?\n/).map((l) => l.trim());
  // Só o layout reconhecido muda o destino: dois caminhos absolutos, distintos,
  // e o comum sendo o `.git` de um checkout (não um repositório bare).
  if (gitDir === undefined || comum === undefined || !isAbsolute(gitDir) || !isAbsolute(comum)) {
    return { caminho: local };
  }
  if (gitDir === comum || basename(comum) !== ".git") return { caminho: local };

  // `resolve` normaliza as barras: no Windows o Git devolve `C:/...`, e o aviso
  // precisa citar o caminho na forma do sistema, como o `join` já faz no destino.
  const principal = dirname(resolve(comum));
  const doPrincipal = join(principal, ".expx", "marketplace");
  if (existsSync(join(doPrincipal, ".claude-plugin", "marketplace.json"))) {
    return {
      caminho: doPrincipal,
      aviso:
        `esta e uma worktree: registrado o marketplace do checkout principal (${principal}). ` +
        "E contra ele que o Claude Code resolve o ./.expx/marketplace do projeto, e ele sobrevive a remocao desta worktree. " +
        "Ate esta branch ser mesclada e o checkout principal atualizado, os comandos /expx: sao os da versao que esta la.",
    };
  }
  return {
    caminho: local,
    aviso:
      "esta e uma worktree, e o checkout principal nao tem .expx/marketplace: o registro aponta para esta worktree e quebra quando ela for removida. " +
      `Depois do merge, rode \`expx init\` no checkout principal (ou \`claude plugin marketplace remove --scope user expx-local\` e \`claude plugin marketplace add --scope user ${doPrincipal}\`).`,
  };
}
