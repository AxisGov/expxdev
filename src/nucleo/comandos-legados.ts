import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Os comandos legados em `.claude/commands/` (conselhos-municipais, 2026-11-14).
 *
 * Antes do expxdev, projetos copiavam à mão a pasta `.claude/` das skills (o
 * "framework p0"), comandos inclusive. O init nunca gravou em `.claude/commands/`
 * (os comandos vão para o plugin e para `.opencode/commands/`), então o lock não
 * conhece esses arquivos e a limpeza do lock não os alcança, de propósito: o lock
 * é editável, e um lock forjado apagaria um comando da pessoa (f5846c8). Sem
 * prefixo, o comando antigo seguia rodando o texto velho (`/mergex-check` com 11
 * verificações, enquanto `/expx:mergex-check` tem 12).
 *
 * A remoção aqui tem outra autoridade, embarcada no CLI e não no projeto: o
 * manifesto das versões que o fork AxisGov publicou em `.claude/commands/<nome>`
 * (ou `commands/<nome>`), gerado na certificação por `scripts/comandos-legados.sh`.
 * Um arquivo só sai quando: o caminho é exatamente `.claude/commands/<nome>.md`,
 * nenhum link no percurso, arquivo comum, o homônimo está no plugin montado, e o
 * sha256 do conteúdo (CRLF→LF) é uma versão publicada daquele mesmo nome. O resto
 * fica: o conteúdo não reconhecido é listado em `mantidos`; o nome sem homônimo é
 * comando da pessoa e não aparece.
 */

export type FonteDoManifesto = {
  skill: string;
  commit: string;
  /** `certificado`: o commit do catálogo; `historico`: uma versão fora da história dele. */
  papel: "certificado" | "historico";
};

export type ManifestoDeComandos = {
  versao: 1;
  fontes: readonly FonteDoManifesto[];
  /** Nome do comando (`mergex-check.md`) → os sha256 normalizados publicados. */
  comandos: Readonly<Record<string, readonly string[]>>;
};

export type RemocaoDeComandosLegados = {
  /** Relativos à raiz, `.claude/commands/<nome>.md`, em ordem. */
  remover: string[];
  /** Homônimos do plugin com conteúdo que não é versão publicada: ficam. */
  mantidos: string[];
};

/** sha256 do conteúdo com CRLF trocado por LF: o mesmo texto em qualquer plataforma. */
export function hashNormalizado(bytes: Buffer): string {
  const lf = Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  return createHash("sha256").update(lf).digest("hex");
}

function pastaDeVerdade(caminho: string): boolean {
  try {
    return lstatSync(caminho).isDirectory();
  } catch {
    return false;
  }
}

export function planejarRemocaoDeComandosLegados(
  raiz: string,
  comandosDoPlugin: ReadonlySet<string>,
  manifesto: ManifestoDeComandos,
): RemocaoDeComandosLegados {
  const remover: string[] = [];
  const mantidos: string[] = [];
  const claude = join(raiz, ".claude");
  const pasta = join(claude, "commands");
  // `.claude` e `commands` pastas de verdade: um link levaria a remoção para fora do projeto
  if (!pastaDeVerdade(claude) || !pastaDeVerdade(pasta)) return { remover, mantidos };
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return { remover, mantidos };
  }
  for (const nome of nomes.sort()) {
    if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(nome) || !comandosDoPlugin.has(nome)) continue;
    const arquivo = join(pasta, nome);
    let bytes: Buffer;
    try {
      if (!lstatSync(arquivo).isFile()) continue;
      bytes = readFileSync(arquivo);
    } catch {
      continue;
    }
    const rel = `.claude/commands/${nome}`;
    if ((manifesto.comandos[nome] ?? []).includes(hashNormalizado(bytes))) remover.push(rel);
    else mantidos.push(rel);
  }
  return { remover, mantidos };
}

/**
 * A reconferência imediatamente antes de remover: entre o plano e a remoção (depois
 * do lock), a pessoa pode ter editado o comando, ou o caminho pode ter virado link.
 * Só remove o que continua exatamente como o plano autorizou: as duas pastas de
 * verdade, o arquivo comum, e o conteúdo ainda uma versão publicada daquele nome.
 */
export function aindaRemovivel(raiz: string, rel: string, manifesto: ManifestoDeComandos): boolean {
  const m = /^\.claude\/commands\/([a-z0-9][a-z0-9-]*\.md)$/.exec(rel);
  if (m === null) return false;
  const nome = m[1] ?? "";
  if (!pastaDeVerdade(join(raiz, ".claude")) || !pastaDeVerdade(join(raiz, ".claude", "commands"))) return false;
  const arquivo = join(raiz, ".claude", "commands", nome);
  try {
    if (!lstatSync(arquivo).isFile()) return false;
    return (manifesto.comandos[nome] ?? []).includes(hashNormalizado(readFileSync(arquivo)));
  } catch {
    return false;
  }
}
