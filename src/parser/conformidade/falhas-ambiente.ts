import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Lista de falhas de ambiente: testes que falham por causa da máquina (sistema
 * operacional, ferramenta ausente), e não do código da task.
 *
 * O arquivo vive em `.expx/falhas-de-ambiente.tsv`, na raiz do projeto, uma
 * entrada por linha:
 *
 *   caminho<TAB>plataforma<TAB>motivo<TAB>desde
 *
 * `#` no início comenta a linha. Motivo vazio invalida a entrada: falha
 * aceita sem explicação vira esconderijo de defeito real. O casamento do
 * caminho é exato e CRLF é tolerado.
 *
 * A leitura falha ABERTA como o resto do painel (D-05): arquivo ausente ou
 * ilegível devolve lista vazia, o que mantém a regra no seu rigor original.
 */

export function caminhoDasFalhasDeAmbiente(raiz: string): string {
  return join(raiz, ".expx", "falhas-de-ambiente.tsv");
}

/** `EXPX_PLATAFORMA` quando definida; senão a plataforma do Node (win32, linux, darwin). */
export function plataformaAtual(
  env: Record<string, string | undefined> = process.env,
  plataforma: string = process.platform,
): string {
  const daEnv = env.EXPX_PLATAFORMA?.trim();
  return daEnv ? daEnv : plataforma;
}

/** Os caminhos do texto TSV que valem para `plataforma`. */
export function interpretarFalhasDeAmbiente(texto: string, plataforma: string): Set<string> {
  const caminhos = new Set<string>();
  for (const bruta of texto.split("\n")) {
    const linha = bruta.replace(/\r$/, "");
    if (linha.trim() === "" || linha.trimStart().startsWith("#")) continue;
    const [caminho, plat, motivo] = linha.split("\t");
    if (!caminho || !plat || !motivo || motivo.trim() === "") continue;
    if (plat.trim() !== plataforma) continue;
    caminhos.add(caminho);
  }
  return caminhos;
}

export function lerFalhasDeAmbiente(raiz: string, plataforma: string = plataformaAtual()): Set<string> {
  const caminho = caminhoDasFalhasDeAmbiente(raiz);
  if (!existsSync(caminho)) return new Set();
  try {
    return interpretarFalhasDeAmbiente(readFileSync(caminho, "utf8"), plataforma);
  } catch {
    return new Set();
  }
}
