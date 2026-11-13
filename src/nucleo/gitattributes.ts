/**
 * O bloco do expx no `.gitattributes` da raiz do projeto.
 *
 * O lock guarda o hash dos bytes de cada arquivo instalado. Um checkout com `core.autocrlf=true` (o padrão do Git
 * para Windows) os converte para CRLF, e o hash deixa de bater: o `update` recusa "modificacao local" e o `doctor`
 * acusa artefato alterado, sem que ninguém tenha mexido em nada (conselhos-municipais, 0.14.6). `-text` tira esses
 * caminhos da conversão: o que está no commit é o que chega ao disco, em qualquer máquina.
 *
 * O bloco fica entre marcadores, como as entradas gerenciadas do `.claude/settings.json`: as regras da pessoa ficam
 * onde estão. O lock trava o hash do bloco, não o do arquivo.
 */

export const CAMINHO_GITATTRIBUTES = ".gitattributes";

const ABRE = "# >>> expx: gerenciado pelo expx init/update; não edite entre estes marcadores";
const FECHA = "# <<< expx";

/** As pastas que o `init` escreve. `-text`, e não `text eol=lf`: o requisito é o byte igual ao do lock, sem conversão. */
const CAMINHOS = [".expx", ".claude/skills", ".claude/hooks", ".claude/agents", ".opencode/commands", ".opencode/plugins", ".codex/hooks"];

export const BLOCO_GITATTRIBUTES = [
  ABRE,
  "# Os arquivos instalados vão byte a byte, sem conversão de fim de linha: o lock guarda o hash deles.",
  ...CAMINHOS.map((c) => `${c}/** -text`),
  FECHA,
  "",
].join("\n");

/** O trecho do bloco no texto em LF (início, fim exclusivo), ou undefined. */
function trecho(lf: string): { de: number; ate: number } | undefined {
  const linhas = lf.split("\n");
  const de = linhas.indexOf(ABRE);
  if (de < 0) return undefined;
  const fim = linhas.indexOf(FECHA, de + 1);
  if (fim < 0) return undefined;
  const offset = (n: number): number => linhas.slice(0, n).reduce((s, l) => s + l.length + 1, 0);
  return { de: offset(de), ate: Math.min(lf.length, offset(fim + 1)) };
}

/** O bloco do expx como está no arquivo, em LF (o hash não depende do checkout), ou undefined. */
export function blocoDoExpx(texto: string): string | undefined {
  const lf = texto.replace(/\r\n/g, "\n");
  const t = trecho(lf);
  if (t === undefined) return undefined;
  const bloco = lf.slice(t.de, t.ate);
  return bloco.endsWith("\n") ? bloco : `${bloco}\n`;
}

/**
 * O `.gitattributes` com o bloco atual: troca o bloco no lugar, ou o acrescenta ao fim, separado por uma linha em
 * branco. O arquivo que estava em CRLF continua em CRLF; o git lê os dois.
 */
export function comBlocoDoExpx(atual: string | undefined): string {
  if (atual === undefined || atual === "") return BLOCO_GITATTRIBUTES;
  const crlf = atual.includes("\r\n");
  const lf = crlf ? atual.replace(/\r\n/g, "\n") : atual;
  const t = trecho(lf);
  const novo = t === undefined
    ? `${lf}${lf.endsWith("\n") ? "\n" : "\n\n"}${BLOCO_GITATTRIBUTES}`
    : `${lf.slice(0, t.de)}${BLOCO_GITATTRIBUTES}${lf.slice(t.ate)}`;
  return crlf ? novo.replace(/\n/g, "\r\n") : novo;
}
