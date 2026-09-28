import { basename } from "node:path";
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
 */
export function artefatosOpenCode(skills: readonly SkillMontavel[]): Artefato[] {
  const saida: Artefato[] = [];
  for (const s of emOrdemCanonica(skills)) {
    // O nome da pasta precisa continuar igual ao `name` do frontmatter: o
    // OpenCode exige que os dois batam para descobrir a skill.
    saida.push(...artefatosDaArvore(s.raizSkill, `.claude/skills/${s.nome}`, s.nome, "skill"));
    for (const c of s.comandos) saida.push(artefato(c, `.opencode/commands/${basename(c)}`, s.nome, "comando"));
  }
  return saida;
}

export function materializarOpenCode(raizProjeto: string, skills: readonly SkillMontavel[]): void {
  const c = consolidar(artefatosOpenCode(skills));
  if (!c.ok) throw new Error(descreverColisoes(c.colisoes));
  aplicarArtefatos(raizProjeto, c.artefatos);
}
