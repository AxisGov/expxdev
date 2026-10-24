import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { SkillMontavel } from "../plugin/montagem.js";
import {
  aplicarArtefatos,
  artefato,
  artefatosDaArvore,
  consolidar,
  descreverColisoes,
  emOrdemCanonica,
  type Artefato,
} from "../plugin/plano.js";

/**
 * Materializa as skills e comandos onde o OpenCode os encontra.
 *
 * O namespace de plugin é do Claude Code; no OpenCode ele não existe. Por isso
 * os comandos vão sem prefixo — e é exatamente onde duas skills podem publicar
 * o mesmo nome de arquivo. Passam pelo plano: mesmo nome com bytes diferentes
 * falha antes de escrever, em vez de a última skill vencer.
 *
 * As skills vão SOMENTE para `.claude/skills/`, que o OpenCode lê nativamente.
 * Copiar também para `.opencode/skills/` criaria duas cópias do mesmo `name`
 * nas pastas que o OpenCode varre, e a duplicata é resolvida por
 * last-writer-wins com apenas um aviso no log — ou seja, silenciosamente. O
 * `doctor` detecta essa colisão caso ela apareça por outro caminho.
 *
 * `commands/` no plural é a forma documentada. Os repositórios reais divergem
 * entre `.opencode/command/` e `.opencode/commands/`; normalizar aqui evita
 * projetos inconsistentes.
 *
 * A ponte de hooks (`.claude/hooks/ponte/*.js`, a `runx-ponte.js` da runx) só é
 * carregada pelo OpenCode a partir de `.opencode/plugins/`, como o `install.sh`
 * da runx a instala. Ela continua indo também com a árvore de hooks, e é dali
 * que acha o despachante e o `hooks.json` do marketplace — por isso só vai
 * quando a árvore de hooks também vai (`comPonte`, o harness inclui `claude`).
 */
export function artefatosOpenCode(skills: readonly SkillMontavel[], comPonte = true): Artefato[] {
  const saida: Artefato[] = [];
  for (const s of emOrdemCanonica(skills)) {
    // O nome da pasta precisa continuar igual ao `name` do frontmatter: o
    // OpenCode exige que os dois batam para descobrir a skill.
    saida.push(...artefatosDaArvore(s.raizSkill, `.claude/skills/${s.nome}`, s.nome, "skill"));
    for (const c of s.comandos) saida.push(artefato(c, `.opencode/commands/${basename(c)}`, s.nome, "comando"));
    if (!comPonte) continue;
    for (const ponte of pontesDeHooks(s)) saida.push(artefato(ponte, `.opencode/plugins/${basename(ponte)}`, s.nome, "hook"));
  }
  return saida;
}

/** Os `.js` de `.claude/hooks/ponte/` da skill, em ordem estável. */
export function pontesDeHooks(s: SkillMontavel): string[] {
  if (s.arvoreHooks === undefined) return [];
  const pasta = join(s.arvoreHooks, "ponte");
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => join(pasta, e.name))
    .sort();
}

export function materializarOpenCode(raizProjeto: string, skills: readonly SkillMontavel[]): void {
  const c = consolidar(artefatosOpenCode(skills));
  if (!c.ok) throw new Error(descreverColisoes(c.colisoes));
  aplicarArtefatos(raizProjeto, c.artefatos);
}
