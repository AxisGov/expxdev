import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { montarPluginJson, montarMarketplaceJson, ORIGEM_DO_PLUGIN } from "./manifestos.js";
import {
  aplicarArtefatos,
  artefato,
  artefatosDaArvore,
  consolidar,
  descreverColisoes,
  emOrdemCanonica,
  jsonCanonico,
  type Artefato,
} from "./plano.js";

/**
 * Monta a árvore do plugin local com as skills selecionadas.
 *
 * A estrutura respeita a regra da documentação de que apenas `plugin.json` fica
 * dentro de `.claude-plugin/`; `skills/` e `commands/` ficam na raiz do plugin.
 */

export type SkillMontavel = {
  nome: string;
  /** Pasta que contém o `SKILL.md`, já normalizada pelo detector de layout. */
  raizSkill: string;
  /** Arquivos de comando da skill, no repositório de origem. */
  comandos: readonly string[];
  /**
   * Arquivos de hook da skill, no repositório de origem. Opcional de propósito:
   * `montagem.test.ts` e `opencode.test.ts` constroem este objeto por literal, e
   * o `tsconfig` exclui `**\/*.test.ts` — um campo obrigatório não seria
   * acusado pelo typecheck e quebraria só em runtime.
   */
  hooks?: readonly string[];
  /**
   * A pasta `.claude/hooks/` do repositório da skill, inteira. Ver
   * `montarHooks`: é ela que carrega os hooks de verdade.
   */
  arvoreHooks?: string;
  /** `.claude/settings.json` publicado pela skill (ver `harness/composicao.ts`). */
  settings?: string;
  /** `.expx/hooks.json` publicado pela skill (ver `harness/modos.ts`). */
  modos?: string;
};

/**
 * O núcleo compartilhado (`nucleo/hooks/`), distribuído por CÓPIA.
 *
 * Cópia, e não dependência, porque cada projeto precisa rodar sozinho: nenhum
 * repositório de skill tem `package.json`, então não há como depender do
 * `expxdev` por npm. A fonte é uma só; o que chega ao projeto é um arquivo.
 *
 * Resolvido a partir do `dist/` em execução — daí o `../..`.
 */
function raizDoNucleo(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "nucleo");
}

/** O `hooks.json` de um plugin, no formato que o Claude Code carrega. */
type ManifestoHooks = { hooks: Record<string, unknown[]> };

/**
 * Leva os hooks das skills para dentro do plugin e consolida o `hooks.json`.
 *
 * ## Por que isto existe
 *
 * O plugin montado tinha `skills/`, `commands/` e `nucleo/` — e nenhum hook.
 * Como todo caminho de erro do rastro é falha aberta (regra 3 do contrato
 * `expx-eventos`), nada avisava: `docs/eventos/` nunca era escrito, e o painel
 * e o `expx watch` ficavam sem a seção de eventos e sem o rodapé de atividade.
 * O sintoma que chega à pessoa é uma tela parada.
 *
 * ## Como o Claude Code carrega isto
 *
 * `hooks/hooks.json` na raiz do plugin, detectado automaticamente quando o
 * plugin está habilitado — não precisa ser declarado no `plugin.json`. Os
 * comandos usam `${CLAUDE_PLUGIN_ROOT}`, que resolve para a pasta do plugin
 * instalado, e é por isso que a ÁRVORE toda precisa viajar: o despachante
 * chama `comum/rastro`, `runx/escopo-da-ocorrencia` e afins por caminho
 * relativo, e um arquivo solto não resolveria nenhum deles.
 *
 * ## Conflito entre skills
 *
 * Cada skill traz o seu `hooks.json` e todas caem na mesma pasta. Os arquivos
 * são projetados sob o namespace que a própria skill já usa (`comum/`,
 * `runx/`, `sprintx/`) e passam pelo plano (`plano.ts`): o mesmo caminho com
 * bytes iguais é deduplicado, com bytes diferentes FALHA — nunca "a última
 * skill vence". Os eventos dos manifestos são concatenados em ordem canônica
 * (por skill), sem repetir grupo idêntico.
 */
export type PlanoDoPlugin =
  | { ok: true; artefatos: Artefato[]; manifestoHooks?: ManifestoHooks }
  | { ok: false; erro: string };

/** Nome do manifesto de hooks do plugin: consolidado, nunca copiado. */
const MANIFESTO_HOOKS = "hooks.json";

/**
 * O que o plugin recebe das skills, sem escrever nada. O `init` chama isto na
 * fase de validação, antes de tocar o projeto; `montarPlugin` chama de novo na
 * aplicação.
 */
export function planejarPlugin(skills: readonly SkillMontavel[]): PlanoDoPlugin {
  const artefatos: Artefato[] = [];
  const consolidado: ManifestoHooks = { hooks: {} };
  const vistos = new Map<string, Set<string>>();

  for (const s of emOrdemCanonica(skills)) {
    // O nome da pasta tem que continuar igual ao `name` do frontmatter: o
    // OpenCode exige isso para descobrir a skill.
    artefatos.push(...artefatosDaArvore(s.raizSkill, `skills/${s.nome}`, s.nome, "skill"));
    for (const c of s.comandos) artefatos.push(artefato(c, `commands/${basename(c)}`, s.nome, "comando"));

    if (s.arvoreHooks === undefined || !existsSync(s.arvoreHooks)) continue;
    artefatos.push(
      ...artefatosDaArvore(s.arvoreHooks, "hooks", s.nome, "hook", (rel) => rel !== MANIFESTO_HOOKS),
    );

    const manifesto = join(s.arvoreHooks, MANIFESTO_HOOKS);
    if (!existsSync(manifesto)) continue;
    let lido: unknown;
    try {
      lido = JSON.parse(readFileSync(manifesto, "utf8"));
    } catch (e: unknown) {
      return { ok: false, erro: `manifesto invalido: ${s.nome} ${MANIFESTO_HOOKS}: ${String(e)}` };
    }
    const hooks = (lido as { hooks?: unknown } | null)?.hooks;
    if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
      return { ok: false, erro: `manifesto invalido: ${s.nome} ${MANIFESTO_HOOKS}: "hooks" precisa ser um objeto` };
    }
    for (const [evento, grupos] of Object.entries(hooks as Record<string, unknown>)) {
      if (!Array.isArray(grupos)) {
        return { ok: false, erro: `manifesto invalido: ${s.nome} ${MANIFESTO_HOOKS}: evento ${evento} precisa ser uma lista` };
      }
      const ja = vistos.get(evento) ?? new Set<string>();
      vistos.set(evento, ja);
      for (const g of grupos) {
        const chave = jsonCanonico(g);
        if (ja.has(chave)) continue;
        ja.add(chave);
        consolidado.hooks[evento] = [...(consolidado.hooks[evento] ?? []), g];
      }
    }
  }

  const c = consolidar(artefatos);
  if (!c.ok) return { ok: false, erro: descreverColisoes(c.colisoes) };
  return Object.keys(consolidado.hooks).length > 0
    ? { ok: true, artefatos: c.artefatos, manifestoHooks: consolidado }
    : { ok: true, artefatos: c.artefatos };
}

/** Monta só o plugin, em `destino`. */
export function montarPlugin(
  destino: string,
  skills: readonly SkillMontavel[],
  versao: string,
): void {
  mkdirSync(join(destino, ".claude-plugin"), { recursive: true });
  mkdirSync(join(destino, "skills"), { recursive: true });
  mkdirSync(join(destino, "commands"), { recursive: true });

  // O núcleo viaja com o plugin. Ausente (checkout parcial, empacotamento sem
  // a pasta), a montagem segue: as skills têm a própria cópia em disco e o
  // projeto continua funcionando — falha aberta, como todo hook.
  //
  // `nucleo/commands/` é excluído desta cópia e tratado à parte logo abaixo:
  // ele não é núcleo de HOOK (o que `nucleo/` documenta e os testes
  // verificam), é comando fixo do plugin — precisa cair em `commands/` na
  // raiz do plugin, não em `nucleo/commands/`, ou o Claude Code nunca o
  // descobre.
  const nucleo = raizDoNucleo();
  if (existsSync(nucleo)) {
    cpSync(nucleo, join(destino, "nucleo"), {
      recursive: true,
      filter: (origem) => basename(origem) !== "commands",
    });
  }

  // `/expx:onboarding` é comando fixo do plugin, não de uma skill: nenhum
  // repositório de skill o traz em `comandos`, porque ele não pertence a
  // nenhuma camada — só orquestra as que já existem. Viaja sempre, do mesmo
  // jeito que o resto do núcleo; o próprio comando avisa e para quando
  // nenhuma camada de mapeamento está instalada, em vez de a montagem
  // decidir isso por antecipação.
  const comandosFixos = join(nucleo, "commands");
  if (existsSync(comandosFixos)) {
    cpSync(comandosFixos, join(destino, "commands"), { recursive: true });
  }

  writeFileSync(
    join(destino, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(montarPluginJson(versao), null, 2)}\n`,
  );

  // Skills, comandos e hooks passam pelo plano: colisão entre skills falha
  // aqui, antes de escrever qualquer um deles. Sem os hooks o plugin sobe sem
  // hook nenhum e o rastro nunca é escrito.
  const plano = planejarPlugin(skills);
  if (!plano.ok) throw new Error(plano.erro);
  aplicarArtefatos(destino, plano.artefatos);
  if (plano.manifestoHooks !== undefined) {
    mkdirSync(join(destino, "hooks"), { recursive: true });
    writeFileSync(join(destino, "hooks", MANIFESTO_HOOKS), `${JSON.stringify(plano.manifestoHooks, null, 2)}\n`);
  }
}

/**
 * Monta marketplace e plugin, com o plugin DENTRO do marketplace.
 *
 * A hierarquia não é estética: um `source` relativo que sobe de diretório é
 * rejeitado na instalação (ver `manifestos.ts`).
 */
export function montarMarketplace(
  raizMarketplace: string,
  skills: readonly SkillMontavel[],
  versao: string,
): void {
  mkdirSync(join(raizMarketplace, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(raizMarketplace, ".claude-plugin", "marketplace.json"),
    `${JSON.stringify(montarMarketplaceJson(), null, 2)}\n`,
  );
  montarPlugin(join(raizMarketplace, ORIGEM_DO_PLUGIN), skills, versao);
}
