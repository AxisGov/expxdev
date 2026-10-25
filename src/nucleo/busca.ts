import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const exec = promisify(execFile);

/**
 * Traz os arquivos de uma skill para o disco, na referência alvo.
 *
 * Usa o `git` do sistema em vez da API do GitHub: assim a credencial já
 * configurada na máquina atende repositório privado sem que o CLI jamais peça
 * ou armazene token, e não há limite de requisição para esbarrar.
 *
 * Falha de rede ou repositório inacessível NUNCA lança: devolve `ok: false`
 * nomeando a skill, porque uma skill indisponível não pode abortar a
 * instalação das outras quatro.
 */

export type PedidoBusca = {
  nome: string;
  repositorio: string;
  referencia: string;
  /**
   * Origem local em desenvolvimento: copia a pasta em vez de clonar.
   *
   * Com `git clone`, mesmo de um caminho local, só chega o que foi COMMITADO —
   * e o ponto do `EXPX_SKILLS_LOCAIS` é justamente editar a skill e ver o
   * efeito no projeto sem commitar. A cópia é o que torna o ciclo curto.
   */
  local?: boolean;
  /**
   * O commit exato a instalar, quando ele já está decidido (o travado no lock,
   * ou um `--to` com SHA). Sem ele, vale a ponta da `referencia`.
   */
  commit?: string;
};

export type ResultadoBusca =
  | { ok: true; nome: string; caminho: string; commit: string }
  | { ok: false; nome: string; erro: string };

/**
 * Copia a pasta local, com o working tree como está — alteração não commitada
 * inclusive. O `.git` fica de fora: é grande e nada no plugin o usa.
 *
 * O commit registrado no lock é o do HEAD quando há repositório, com o sufixo
 * `-local` para que o lock nunca afirme que aquele conteúdo é o daquele commit
 * (ele pode ter edição por cima). Sem `.git`, `local` sozinho.
 */
async function copiarLocal(p: PedidoBusca, destino: string): Promise<ResultadoBusca> {
  cpSync(p.repositorio, destino, {
    recursive: true,
    filter: (origem) => basename(origem) !== ".git",
  });

  let commit = "local";
  try {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: p.repositorio });
    commit = `${stdout.trim().slice(0, 12)}-local`;
  } catch {
    // pasta sem git é uso legítimo em desenvolvimento
  }
  return { ok: true, nome: p.nome, caminho: destino, commit };
}

/**
 * Traz um commit exato para `destino`.
 *
 * `git clone --branch` não aceita SHA, e a ponta da branch pode já ter andado
 * — é justamente o caso de uma skill sem tag travada num commit antigo. O
 * pedido por SHA com profundidade 1 é o caminho rápido; servidor que recusa
 * pedido de objeto não anunciado cai para a busca completa. Commit que não
 * existe mais no remoto FALHA: cair para a ponta seria a deriva que o lock
 * existe para impedir.
 */
async function trazerCommit(repositorio: string, commit: string, destino: string): Promise<void> {
  await exec("git", ["init", "--quiet", destino]);
  try {
    await exec("git", ["fetch", "--quiet", "--depth", "1", repositorio, commit], { cwd: destino });
  } catch {
    await exec("git", ["fetch", "--quiet", repositorio, "+refs/heads/*:refs/remotes/origem/*", "+refs/tags/*:refs/tags/*"], {
      cwd: destino,
    });
  }
  await exec("git", ["checkout", "--quiet", "--detach", commit], { cwd: destino });
}

/** Clona só a referência pedida, com profundidade 1 — ou o commit pedido. Devolve a pasta temporária. */
export async function buscarSkill(p: PedidoBusca): Promise<ResultadoBusca> {
  const destino = mkdtempSync(join(tmpdir(), `expx-busca-${p.nome}-`));
  try {
    if (p.local === true) return await copiarLocal(p, destino);
    if (p.commit !== undefined) {
      await trazerCommit(p.repositorio, p.commit, destino);
    } else {
      await exec("git", [
        "clone",
        "--quiet",
        "--depth",
        "1",
        "--branch",
        p.referencia,
        p.repositorio,
        destino,
      ]);
    }
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: destino });
    const commit = stdout.trim();
    if (p.commit !== undefined && commit !== p.commit) {
      throw new Error(`o commit ${p.commit} nao foi obtido de ${p.repositorio} (veio ${commit})`);
    }
    return { ok: true, nome: p.nome, caminho: destino, commit };
  } catch (e: unknown) {
    rmSync(destino, { recursive: true, force: true });
    return { ok: false, nome: p.nome, erro: String(e) };
  }
}
