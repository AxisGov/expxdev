import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillMontavel } from "../plugin/montagem.js";
import {
  aplicarArtefatos,
  artefato,
  artefatosDaArvore,
  consolidar,
  descreverColisoes,
  emOrdemCanonica,
  SKILL_DO_NUCLEO,
  type Artefato,
} from "../plugin/plano.js";

/**
 * Materializa hooks de skill em `.claude/hooks/`, com a skill ao lado em
 * `.claude/skills/`.
 *
 * Os dois andam juntos por imposição do próprio hook: o do memox resolve o
 * motor como `DIR_HOOK/../skills/<nome>/assets/...`, e o da mergex chama
 * `DIR_HOOK/../../skills/mergex/scripts/...`. Copiar o hook sem copiar a skill
 * produz um hook que sai `0` em silêncio — e como TODO caminho de erro dele sai
 * `0`, a instalação quebrada fica indistinguível de um projeto sem artefatos.
 * É por isso que a cópia da skill aqui é incondicional, e não depende de o
 * harness incluir `opencode` (decisões D-14 e D-15).
 *
 * A árvore de hooks da skill vai INTEIRA, com a estrutura que ela publica
 * (`sprintx/`, `mergex/`, `comum/`): os hooks chamam bibliotecas irmãs por
 * caminho relativo (`../comum/rastro.sh`), e copiar só o que o settings cita
 * deixaria cada um deles sem o que carregar. O `hooks.json` da árvore é
 * manifesto do PLUGIN, não arquivo de projeto, e fica de fora.
 *
 * Nada aqui escreve direto: tudo vira artefato do plano (`plano.ts`), e a
 * colisão entre skills falha antes da primeira escrita.
 *
 * Hooks são mecanismo do Claude Code. No OpenCode isso é lacuna declarada, não
 * paridade garantida.
 */

export type HookInstalado = {
  skill: string;
  /** Caminho do hook relativo à raiz do projeto, como vai para o settings.json. */
  relativo: string;
};

/**
 * As skills que trazem hook. Sem nenhuma, nada é criado — nem a pasta.
 *
 * A árvore de hooks conta tanto quanto o arquivo solto. Quando a detecção
 * passou a usar `arvoreHooks`, o `hooks` virou `[]` para TODAS as skills reais
 * — elas guardam os hooks em subpasta — e esta função deixou de devolver
 * qualquer coisa. O efeito não foi "nada é instalado": foi pior, porque a
 * cópia da skill em `.claude/skills/` de instalações anteriores ficou órfã,
 * com a descrição velha, competindo para sempre com a do plugin.
 */
export function comHooks(skills: readonly SkillMontavel[]): SkillMontavel[] {
  return skills.filter((s) => (s.hooks?.length ?? 0) > 0 || s.arvoreHooks !== undefined);
}

const PASTA_DO_NUCLEO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "nucleo", "hooks");

/**
 * Os hooks do núcleo.
 *
 * O lembrete NÃO pertence a nenhuma skill: é do método. Uma descrição de skill
 * só compete depois que o modelo decide procurar uma, e quando ele forma
 * hipótese técnica direto do relato essa decisão não acontece — a descrição,
 * por melhor que seja, nunca é lida. Medido em seis sessões seguidas com três
 * descrições diferentes. O `UserPromptSubmit` é o único ponto que roda antes
 * disso. Só vai quando alguma skill traz hook.
 *
 * O `expx-session-sync` vai sempre. Núcleo ausente (checkout parcial) é falha
 * aberta: o hook simplesmente não é instalado.
 */
function artefatosDoNucleo(comLembrete: boolean): Artefato[] {
  const saida: Artefato[] = [];
  const sync = join(PASTA_DO_NUCLEO, "expx-session-sync.mjs");
  if (existsSync(sync)) saida.push({ ...artefato(sync, ".claude/hooks/expx-session-sync.mjs", SKILL_DO_NUCLEO, "nucleo"), executavel: false });
  const lembrete = join(PASTA_DO_NUCLEO, "expx-lembrete.sh");
  if (comLembrete && existsSync(lembrete)) saida.push(artefato(lembrete, ".claude/hooks/expx-lembrete.sh", SKILL_DO_NUCLEO, "nucleo"));
  return saida;
}

/** Os artefatos de `.claude/` para o harness Claude Code. */
export function artefatosDeHooks(skills: readonly SkillMontavel[]): Artefato[] {
  const alvos = emOrdemCanonica(comHooks(skills));
  const saida = artefatosDoNucleo(alvos.length > 0);
  for (const s of alvos) {
    // a skill vai junto: é o que o hook procura ao lado de si mesmo
    saida.push(...artefatosDaArvore(s.raizSkill, `.claude/skills/${s.nome}`, s.nome, "skill"));
    if (s.arvoreHooks !== undefined && existsSync(s.arvoreHooks)) {
      saida.push(...artefatosDaArvore(s.arvoreHooks, ".claude/hooks", s.nome, "hook", (rel) => rel !== "hooks.json"));
    }
    // arquivo solto fora de uma árvore detectada (não acontece com os layouts
    // atuais, mas a detecção os devolve separados)
    for (const origem of s.hooks ?? []) {
      if (s.arvoreHooks !== undefined && origem.startsWith(s.arvoreHooks)) continue;
      saida.push(artefato(origem, `.claude/hooks/${basename(origem)}`, s.nome, "hook"));
    }
  }
  return saida;
}

/**
 * Os hooks de registro por NOME de arquivo: núcleo, e skill que não publica
 * `.claude/settings.json` (o memox). Skill que publica o manifesto tem os
 * hooks registrados por ele, não por aqui.
 */
export function hooksPorNome(artefatos: readonly Artefato[], skills: readonly SkillMontavel[]): HookInstalado[] {
  const semManifesto = new Map(skills.map((s) => [s.nome, s.settings === undefined]));
  const saida: HookInstalado[] = [];
  for (const a of artefatos) {
    if (a.tipo !== "nucleo" && a.tipo !== "hook") continue;
    if (a.tipo === "hook" && semManifesto.get(a.skill) !== true) continue;
    // só o nível de cima de `.claude/hooks/`: é onde mora hook solto
    const rel = a.destino.slice(".claude/hooks/".length);
    if (rel.includes("/")) continue;
    if (a.tipo === "hook" && !(rel.startsWith(`${a.skill}-`) || rel.startsWith(`${a.skill}.`))) continue;
    saida.push({ skill: a.skill, relativo: a.destino });
  }
  return saida;
}

/**
 * Copia hooks e skills para `.claude/`. Devolve os hooks de registro por nome.
 * Colisão entre skills lança ANTES de escrever.
 */
export function instalarHooks(raizProjeto: string, skills: readonly SkillMontavel[]): HookInstalado[] {
  const c = consolidar(artefatosDeHooks(skills));
  if (!c.ok) throw new Error(descreverColisoes(c.colisoes));
  aplicarArtefatos(raizProjeto, c.artefatos);
  return hooksPorNome(c.artefatos, skills);
}
