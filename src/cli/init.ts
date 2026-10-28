import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { repositorioCanonico, resolverOrigem } from "../nucleo/catalogo.js";
import { resolverAlvo } from "../nucleo/versao.js";
import { buscarSkill } from "../nucleo/busca.js";
import { detectarLayout } from "../nucleo/layout.js";
import { verificarCaminhos } from "../nucleo/caminhos.js";
import { hashearPasta } from "../nucleo/integridade.js";
import {
  caminhoDoLock,
  lerLock,
  versaoDoCli,
  VERSAO_LOCK,
  type InstalacaoTravada,
  type Lock,
  type SkillTravada,
} from "../nucleo/lock.js";
import { verificarRuntime } from "../nucleo/runtime.js";
import { avisoDeFilemode } from "../nucleo/modo-executavel.js";
import { escreverArquivoAtomico, prepararTroca } from "../plugin/atomico.js";
import { montarMarketplace, planejarPlugin, type SkillMontavel } from "../plugin/montagem.js";
import {
  aplicarArtefatos,
  compararSkills,
  consolidar,
  descreverColisoes,
  hashDeBytes,
  SKILL_DO_NUCLEO,
  verificarDestinos,
  type Artefato,
} from "../plugin/plano.js";
import { artefatosOpenCode, pontesDeHooks } from "../harness/opencode.js";
import { entradasPorNome, formaSemAspas, gravarSettings, planejarSettings, type PlanoSettings } from "../harness/settings.js";
import { verificarModificacaoLocal } from "../update/modificacao.js";
import { artefatosDeHooks, comHooks, hooksPorNome } from "../harness/hooks.js";
import {
  caminhosReferenciados,
  hashDasEntradas,
  lerHooksDaSkill,
  type DefinicaoHook,
  type EntradaGerenciada,
  type EntradaHook,
} from "../harness/composicao.js";
import { comporModos, consolidarModos, lerModosDaSkill, type ModosPublicados } from "../harness/modos.js";
import { ORIGEM_DO_PLUGIN } from "../plugin/manifestos.js";
import { materializarCodex } from "../harness/codex.js";
import { lerOverridesDoProjeto, planejarAgentes, planejarLimpeza } from "../harness/agentes.js";
import { lerPolitica } from "../orquestracao/politica.js";
import { caminhoDoRegistro, serializarRegistro } from "../orquestracao/materializar.js";
import { destinoDoRegistroInseguro, gravarNoRegistro } from "../orquestracao/registro.js";
import { VERSAO_RESOLVEDOR, type Resolucao } from "../orquestracao/resolver.js";
import { VERSAO_TABELA } from "../orquestracao/tabela.js";
import { VERSAO_MATRIZ_EFFORT_CLAUDE } from "../orquestracao/adaptadores.js";
import { CAMINHO_PROJECAO, serializarProjecao } from "../orquestracao/projecao.js";
import type { OrquestracaoTravada } from "../nucleo/lock.js";
import { adquirirBloqueioOperacao } from "../nucleo/bloqueio-operacao.js";

/** O marketplace no `.claude/settings.json` do projeto (ver `planejarSettings`). */
export const CAMINHO_MARKETPLACE_NO_PROJETO = "./.expx/marketplace";

/**
 * O fluxo do `init`: busca, PLANEJA, VALIDA, aplica e trava.
 *
 * O `init` é o dono da composição das skills no projeto. Nenhum arquivo do
 * projeto é escrito enquanto ainda há o que descobrir: primeiro todas as
 * skills são buscadas para pasta temporária, depois o plano inteiro é montado
 * em memória — cada arquivo com skill de origem, destino e hash; o
 * `.claude/settings.json` composto; o `.expx/hooks.json` composto — e só
 * então, sem nenhuma colisão nem conflito, o projeto é tocado.
 *
 * A ordem em que as skills são pedidas não muda nada: tudo é processado em
 * ordem canônica (ver `plano.ts`).
 *
 * Tudo que é previsível falha antes da primeira escrita: skill que não chegou,
 * colisão, conflito, manifesto inválido, destino bloqueado, e `git`/`jq`
 * ausentes do PATH deste processo quando há hook de skill a registrar. O lock
 * é gravado por último e cobre o estado instalado inteiro.
 *
 * O `install.sh` que algumas skills trazem NÃO é executado: ele é o instalador
 * manual/legado de UMA skill, e roda `rm -rf` em pastas que outras skills
 * também ocupam. A instalação multi-skill é declarativa e feita só aqui
 * (contrato em `docs/contrato/CONTRATO-expx-instalacao.md`).
 *
 * `.expx/marketplace/` é trocada de uma vez (`prepararTroca`): ou aparece
 * completa, ou a anterior permanece. O resto de `.expx/` não é do `init` e
 * não é apagado.
 */

export type OpcoesInit = {
  raiz: string;
  skills: readonly string[];
  harness: readonly string[];
  /** Origem de cada skill. Nos testes, repositórios locais; em produção, o catálogo. */
  origens?: Record<string, string>;
  /** Referência fixa por skill, quando o usuário pediu uma específica. */
  referencias?: Record<string, string>;
  /**
   * Commit exato por skill. O `update` passa o travado no lock para as skills
   * que não está atualizando: sem ele, uma skill em `main` seria resolvida de
   * novo na ponta e andaria junto. A `referencia` gravada no lock não muda.
   */
  commits?: Record<string, string>;
  /**
   * Recusa a escrita se alguma skill do lock anterior diverge do disco. O
   * `update` passa: a checagem dele roda antes da busca, e esta, sob a trava.
   */
  recusarModificacaoLocal?: boolean;
  /**
   * O ambiente em que as dependências de runtime são provadas. Padrão: o do
   * próprio processo, que é o que importa — ver `nucleo/runtime.ts`.
   */
  ambiente?: NodeJS.ProcessEnv;
};

export type Falha = { nome: string; erro: string };

export type ResultadoInit = {
  ok: boolean;
  instaladas: string[];
  falhas: Falha[];
  /** Erros de plano (colisão, conflito, manifesto inválido): nada foi escrito. */
  erros: string[];
  naoTravadas: string[];
  avisos: string[];
};

/**
 * A origem é uma pasta em disco, e não uma URL de repositório?
 *
 * `git clone` aceita as duas, mas só a pasta pode ser copiada com o working
 * tree. A checagem é sobre o disco, não sobre a forma do texto: um caminho que
 * não existe cai no clone e produz a mensagem de erro do git, que é mais útil
 * que um erro de cópia.
 */
export function ehCaminhoLocal(origem: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(origem) || origem.includes("@")) return false;
  try {
    return statSync(origem).isDirectory();
  } catch {
    return false;
  }
}

function origemDe(nome: string, origens?: Record<string, string>): string | undefined {
  return resolverOrigem(nome, undefined, origens?.[nome]);
}

/** O que a fase de plano decidiu. Nada disto foi escrito ainda. */
type Plano = {
  projeto: Artefato[];
  /** Os arquivos do plugin, relativos a `.expx/marketplace/plugins/expx/`. */
  plugin: Artefato[];
  settings?: PlanoSettings;
  /** Conteúdo final de `.expx/hooks.json`, quando alguma skill publica modos. */
  modos?: { texto: string; publicados: ModosPublicados };
  /** Os hooks registrados vêm de alguma skill: exigem git e jq no runtime. */
  hooksDeSkill: boolean;
  /** Avisos de plano (override de agente sem agente correspondente). */
  avisos: string[];
  /** Agentes de instalação anterior que saíram do plano (relativos à raiz). */
  remover: string[];
  /**
   * Só com a política de orquestração ativa: uma resolução por agente, para o
   * registro `.expx/resolucoes/` e a seção `orquestracao` do lock.
   */
  resolucoes?: Resolucao[];
  /** A projeção plana das resoluções para o escritor do rastro; sem política, ausente. */
  projecao?: string;
};

/** A seção `orquestracao` do lock: as versões e o `resolucao_id` vigente por agente. */
function orquestracaoTravada(resolucoes: readonly Resolucao[]): OrquestracaoTravada {
  const agentes: OrquestracaoTravada["agentes"] = {};
  for (const r of [...resolucoes].sort((a, b) => a.agente.localeCompare(b.agente))) agentes[r.agente] = { claude: r.resolucao_id };
  return { versao_resolvedor: VERSAO_RESOLVEDOR, tabela_embutida: VERSAO_TABELA, matriz_effort_claude: VERSAO_MATRIZ_EFFORT_CLAUDE, agentes };
}

/**
 * O registro é imutável (CONTRATO-expx-orquestracao §9): um arquivo que já
 * existe precisa ter exatamente os bytes da resolução. Diferente é corrupção, e
 * o `init` falha antes de escrever qualquer coisa.
 */
function conferirRegistroExistente(raiz: string, resolucoes: readonly Resolucao[]): string[] {
  const erros: string[] = [];
  for (const r of resolucoes) {
    const rel = caminhoDoRegistro(r.resolucao_id);
    const caminho = join(raiz, ...rel.split("/"));
    if (!existsSync(caminho)) continue;
    let atual: string | undefined;
    try {
      atual = readFileSync(caminho, "utf8");
    } catch {
      atual = undefined;
    }
    if (atual !== serializarRegistro(r)) {
      erros.push(`${rel} ja existe com outro conteudo; o registro de resolucoes e imutavel: restaure o arquivo pelo git (nada foi escrito)`);
    }
  }
  return erros;
}

/** O que a instalação anterior gerenciava, segundo o lock dela. */
function anterioresDoLock(raiz: string): { settings: EntradaGerenciada[]; modos?: ModosPublicados } {
  const l = lerLock(raiz);
  if (!l.ok || l.lock.instalacao === undefined) return { settings: [] };
  const inst = l.lock.instalacao;
  const settings = (inst.settings?.entradas ?? []).map((e) => ({
    evento: e.evento,
    ...(e.matcher !== undefined ? { matcher: e.matcher } : {}),
    hook: e.hook as DefinicaoHook,
  }));
  return inst.modos !== undefined ? { settings, modos: inst.modos.publicados } : { settings };
}

const PREFIXO_DO_PLUGIN = `.expx/marketplace/${ORIGEM_DO_PLUGIN.replace(/^\.\//, "")}`;

/** Os destinos executáveis do plano, em ordem canônica. */
function executaveisDoPlano(plano: Plano): string[] {
  return [
    ...plano.projeto.filter((a) => a.executavel).map((a) => a.destino),
    ...plano.plugin.filter((a) => a.executavel).map((a) => `${PREFIXO_DO_PLUGIN}/${a.destino}`),
  ].sort();
}

/** O bloco `instalacao` do lock, em ordem canônica e sem data. */
function instalacaoTravada(plano: Plano): InstalacaoTravada {
  const arquivos: Record<string, string> = {};
  const todos = [
    ...plano.projeto.map((a) => [a.destino, a.hash] as const),
    ...plano.plugin.map((a) => [`${PREFIXO_DO_PLUGIN}/${a.destino}`, a.hash] as const),
  ].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  for (const [d, h] of todos) arquivos[d] = h;
  // Quem precisa do bit de execução é decisão do PLANO, não da extensão do
  // arquivo: travar a lista aqui é o que permite ao `doctor` conferir o modo
  // versionado sem reinventar a regra (ver `nucleo/modo-executavel.ts`).
  const inst: InstalacaoTravada = { arquivos, executaveis: executaveisDoPlano(plano) };
  if (plano.settings !== undefined) {
    inst.settings = { hash: hashDasEntradas(plano.settings.gerenciadas), entradas: plano.settings.gerenciadas };
  }
  if (plano.modos !== undefined) {
    inst.modos = { hash: hashDeBytes(plano.modos.texto), publicados: plano.modos.publicados };
  }
  return inst;
}

function lerModosDoProjeto(raiz: string): { ok: true; conteudo?: Record<string, unknown> } | { ok: false; erro: string } {
  const caminho = join(raiz, ".expx", "hooks.json");
  if (!existsSync(caminho)) return { ok: true };
  try {
    const v = JSON.parse(readFileSync(caminho, "utf8")) as unknown;
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      return { ok: false, erro: `${caminho} nao contem um objeto JSON e nao sera alterado` };
    }
    return { ok: true, conteudo: v as Record<string, unknown> };
  } catch (e: unknown) {
    return { ok: false, erro: `${caminho} nao e JSON valido e nao sera alterado: ${String(e)}` };
  }
}

function planejar(op: OpcoesInit, montaveis: readonly SkillMontavel[]): { ok: true; plano: Plano } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const claude = op.harness.includes("claude");

  // 1. Arquivos: plugin e projeto. Colisão aqui é colisão de verdade entre skills.
  const plugin = planejarPlugin(montaveis);
  if (!plugin.ok) erros.push(plugin.erro);

  const candidatos: Artefato[] = [];
  const avisosDoPlano: string[] = [];
  const agentesDoPlano: Artefato[] = [];
  let resolucoes: Resolucao[] | undefined;
  let projecao: string | undefined;
  if (claude) {
    candidatos.push(...artefatosDeHooks(montaveis));
    // Política de orquestração: ausente, a camada não existe e nada muda.
    const pol = lerPolitica(op.raiz);
    if (!pol.ok) erros.push(pol.erro);
    const politica = pol.ok && pol.ativa ? pol.politica : undefined;
    // Agentes resolvidos pela política (se houver) e com o override do projeto
    // (`.expx/agentes.json`) aplicado.
    const ov = lerOverridesDoProjeto(op.raiz);
    if (!ov.ok) erros.push(ov.erro);
    else if (pol.ok) {
      const ag = planejarAgentes(montaveis, ov.overrides, politica);
      candidatos.push(...ag.artefatos);
      agentesDoPlano.push(...ag.artefatos);
      avisosDoPlano.push(...ag.avisos);
      erros.push(...ag.erros);
      if (politica !== undefined) {
        resolucoes = ag.resolucoes;
        const inseguro = destinoDoRegistroInseguro(op.raiz, resolucoes.map((r) => r.resolucao_id));
        erros.push(...(inseguro.length > 0 ? inseguro : conferirRegistroExistente(op.raiz, resolucoes)));
        const proj = serializarProjecao(resolucoes);
        if (proj.ok) projecao = proj.texto;
        else erros.push(proj.erro);
      }
    }
  }
  if (op.harness.includes("opencode")) {
    candidatos.push(...artefatosOpenCode(montaveis, claude));
    // A ponte despacha para a árvore de hooks, que só é instalada com `claude`.
    const semDespachante = claude ? [] : montaveis.filter((s) => pontesDeHooks(s).length > 0).map((s) => s.nome);
    if (semDespachante.length > 0) {
      avisosDoPlano.push(`ponte de hooks de ${semDespachante.join(", ")} nao instalada em .opencode/plugins: ` +
        "ela despacha para .claude/hooks, que so e instalada com o harness claude (use --harness claude,opencode)");
    }
  }
  const c = consolidar(candidatos);
  if (!c.ok) {
    erros.push(descreverColisoes(c.colisoes));
    return { ok: false, erros };
  }
  const plano: Plano = {
    projeto: c.artefatos,
    plugin: plugin.ok ? plugin.artefatos : [],
    hooksDeSkill: false,
    avisos: avisosDoPlano,
    remover: [],
    ...(resolucoes !== undefined ? { resolucoes } : {}),
    ...(projecao !== undefined ? { projecao } : {}),
  };
  if (claude) {
    const lk = lerLock(op.raiz);
    const anteriores = lk.ok ? (lk.lock.instalacao?.arquivos ?? {}) : {};
    const lim = planejarLimpeza(op.raiz, agentesDoPlano, new Set(c.artefatos.map((a) => a.destino)), anteriores);
    erros.push(...lim.erros);
    plano.avisos.push(...lim.avisos);
    plano.remover = lim.remover;
  }

  // Destino bloqueado (arquivo onde precisa haver pasta) é previsível: falha aqui.
  const bloqueados = verificarDestinos(op.raiz, [
    ...c.artefatos.map((a) => a.destino),
    ".expx/marketplace/x",
    ".expx/expx-lock.json",
    ...(claude ? [".claude/settings.json", ".expx/hooks.json"] : []),
    ...(resolucoes !== undefined && resolucoes.length > 0 ? [caminhoDoRegistro("x")] : []),
    ...(projecao !== undefined ? [CAMINHO_PROJECAO] : []),
  ]);
  if (bloqueados.length > 0) erros.push(`destino impossivel de escrever (nada foi escrito):\n  ${bloqueados.join("\n  ")}`);
  if (!claude) return erros.length > 0 ? { ok: false, erros } : { ok: true, plano };
  const anteriores = anterioresDoLock(op.raiz);

  // 2. Registros de hook: núcleo e hooks soltos por nome; skills pelo manifesto.
  const destinos = new Set(c.artefatos.map((a) => a.destino));
  const entradas: EntradaHook[] = [];
  const legadas: EntradaGerenciada[] = [];
  for (const h of hooksPorNome(c.artefatos, montaveis)) {
    for (const e of entradasPorNome(h)) {
      entradas.push(e);
      const l = formaSemAspas(e);
      if (l !== null) legadas.push(l);
    }
  }
  const comHook = comHooks(montaveis);
  for (const s of comHook) {
    if (s.settings === undefined) continue;
    const lidos = lerHooksDaSkill(s.nome, s.settings);
    if (!lidos.ok) {
      erros.push(lidos.erro);
      continue;
    }
    for (const e of lidos.entradas) {
      for (const ref of caminhosReferenciados(e.hook)) {
        if (!destinos.has(ref)) erros.push(`skill incompleta: ${s.nome} registra ${ref}, que ela nao publica`);
      }
    }
    entradas.push(...lidos.entradas);
  }
  plano.hooksDeSkill = entradas.some((e) => e.skill !== SKILL_DO_NUCLEO);

  // Relativo: o settings do projeto vai no commit, e o Claude Code resolve o
  // caminho relativo de um marketplace `directory` contra o checkout principal do
  // repositório (também de dentro de um worktree). O absoluto de quem rodou o
  // init quebraria quando aquele checkout sumisse. O `claude plugin marketplace
  // add` continua recebendo o absoluto, no settings do usuário.
  const s = planejarSettings(op.raiz, CAMINHO_MARKETPLACE_NO_PROJETO, entradas, [...anteriores.settings, ...legadas]);
  if (!s.ok) erros.push(s.erro);
  else plano.settings = s.plano;

  // 3. Modos: composição dos `.expx/hooks.json` das skills com o do projeto.
  const publicadosPorSkill: Array<{ skill: string; modos: ModosPublicados }> = [];
  for (const sk of comHook) {
    if (sk.modos === undefined) continue;
    const m = lerModosDaSkill(sk.nome, sk.modos);
    if (!m.ok) erros.push(m.erro);
    else publicadosPorSkill.push({ skill: sk.nome, modos: m.modos });
  }
  if (publicadosPorSkill.length > 0) {
    const pub = consolidarModos(publicadosPorSkill);
    const existente = lerModosDoProjeto(op.raiz);
    if (!pub.ok) erros.push(pub.erro);
    else if (!existente.ok) erros.push(existente.erro);
    else {
      const final = comporModos(pub.publicados, existente.conteudo, anteriores.modos);
      if (!final.ok) erros.push(final.erro);
      else plano.modos = { texto: `${JSON.stringify(final.conteudo, null, 2)}\n`, publicados: pub.publicados };
    }
  }

  return erros.length > 0 ? { ok: false, erros } : { ok: true, plano };
}

/** A mesma resolução: mesma origem, referência, commit e bytes da skill. */
function mesmaResolucao(nome: string, a: Omit<SkillTravada, "resolvido_em">, b: SkillTravada): boolean {
  const hashes = (x: Record<string, string>): string => JSON.stringify(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0)));
  return (
    repositorioCanonico(nome, a.repositorio) === repositorioCanonico(nome, b.repositorio) &&
    a.referencia === b.referencia &&
    a.travado === b.travado &&
    a.commit === b.commit &&
    hashes(a.arquivos) === hashes(b.arquivos)
  );
}

/**
 * A data da resolução de uma skill. Se o lock já travava EXATAMENTE esta
 * resolução, a data dele é mantida: um `init` repetido não resolveu nada novo,
 * e reescrever a data sujaria a árvore só porque o dia virou.
 */
function dataDaResolucao(
  nome: string,
  nova: Omit<SkillTravada, "resolvido_em">,
  anterior: SkillTravada | undefined,
): string {
  // só uma data de verdade é preservada: o schema aceita qualquer texto, e
  // manter um valor inválido o perpetuaria em todo `init` seguinte
  if (
    anterior !== undefined &&
    dataIsoValida(anterior.resolvido_em) &&
    mesmaResolucao(nome, nova, anterior)
  ) {
    return anterior.resolvido_em;
  }
  return new Date().toISOString().slice(0, 10);
}

function dataIsoValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (partes === null) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date("2000-01-01T00:00:00.000Z");
  data.setUTCFullYear(ano, mes - 1, dia);
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export async function executarInit(op: OpcoesInit): Promise<ResultadoInit> {
  const lockAnterior = lerLock(op.raiz);
  const travadasAntes = lockAnterior.ok ? lockAnterior.lock.skills : {};
  const instaladas: string[] = [];
  const falhas: Falha[] = [];
  const naoTravadas: string[] = [];
  const avisos: string[] = [];
  const montaveis: SkillMontavel[] = [];
  const travadas: Record<string, SkillTravada> = {};
  const temporarios: string[] = [];
  const pedidas = [...new Set(op.skills)].sort(compararSkills);

  try {
  for (const nome of pedidas) {
    const repositorio = origemDe(nome, op.origens);
    if (repositorio === undefined) {
      falhas.push({ nome, erro: "skill fora do catalogo" });
      continue;
    }

    const alvo = await resolverAlvo(repositorio, op.referencias?.[nome]);
    if (!alvo.ok) {
      falhas.push({ nome, erro: alvo.erro ?? "nao foi possivel resolver a versao" });
      continue;
    }
    if (!alvo.travado) naoTravadas.push(nome);

    // Origem em disco (EXPX_SKILLS_LOCAIS, ou `--origem` apontando para uma
    // pasta) é COPIADA, não clonada: o clone traria só o commitado, e o ciclo
    // de desenvolvimento de skill deixaria de ser curto.
    const commit = op.commits?.[nome];
    const local = ehCaminhoLocal(repositorio);
    // a pasta local é copiada como está: o commit travado não vale, e isso é dito
    if (local && commit !== undefined) {
      avisos.push(`${nome}: origem local — instalada a arvore de trabalho de ${repositorio}, nao o commit travado ${commit.slice(0, 12)}`);
    }
    const busca = await buscarSkill({
      nome,
      repositorio,
      referencia: alvo.referencia,
      ...(local ? { local: true } : commit !== undefined ? { commit } : {}),
    });
    if (!busca.ok) {
      falhas.push({ nome, erro: busca.erro });
      continue;
    }
    temporarios.push(busca.caminho);

    const layout = detectarLayout(busca.caminho, nome);
    if (!layout.ok) {
      falhas.push({ nome, erro: layout.erro });
      continue;
    }

    // A skill não pode referenciar nada fora da própria pasta: o plugin é
    // copiado para o cache e um `../` deixaria de resolver silenciosamente.
    const fora = verificarCaminhos(layout.raizSkill);
    if (fora.length > 0) {
      const lista = fora.slice(0, 3).map((a) => `${a.arquivo}:${String(a.linha)} → ${a.referencia}`);
      falhas.push({
        nome,
        erro: `a skill referencia caminho fora da propria pasta: ${lista.join("; ")}`,
      });
      continue;
    }

    montaveis.push({
      nome,
      raizSkill: layout.raizSkill,
      comandos: layout.comandos,
      hooks: layout.hooks,
      // A árvore inteira: é ela que leva os hooks de verdade para o plugin,
      // e sem ela o rastro nunca é escrito (ver `montarHooks`).
      ...(layout.arvoreHooks !== undefined ? { arvoreHooks: layout.arvoreHooks } : {}),
      ...(layout.settings !== undefined ? { settings: layout.settings } : {}),
      ...(layout.modos !== undefined ? { modos: layout.modos } : {}),
      ...(layout.agentes !== undefined ? { agentes: layout.agentes } : {}),
    });
    const resolucao = {
      repositorio,
      referencia: alvo.referencia,
      travado: alvo.travado,
      commit: busca.commit,
      arquivos: hashearPasta(layout.raizSkill),
    };
    // ordem das chaves igual à de sempre: o lock é comparado byte a byte no git
    travadas[nome] = {
      repositorio: resolucao.repositorio,
      referencia: resolucao.referencia,
      travado: resolucao.travado,
      commit: resolucao.commit,
      resolvido_em: dataDaResolucao(nome, resolucao, travadasAntes[nome]),
      arquivos: resolucao.arquivos,
    };
    instaladas.push(nome);
  }

  // Skill que não chegou inteira (fora do catálogo, repositório inacessível,
  // layout inválido) recusa a instalação TODA, antes de qualquer escrita. Antes
  // o `init` seguia com as outras; mas instalar sprintx sem a mergex que ela
  // aciona é exatamente a instalação parcial que parece funcionar e não
  // funciona. Declarar a falha e não mexer no projeto é o que dá para confiar.
  if (falhas.length > 0 || montaveis.length === 0) {
    return { ok: false, instaladas: [], falhas, erros: [], naoTravadas, avisos };
  }

  // PLANEJAR e VALIDAR: nenhuma escrita no projeto até aqui.
  const p = planejar(op, montaveis);
  if (!p.ok) {
    return { ok: false, instaladas: [], falhas, erros: p.erros, naoTravadas, avisos };
  }
  if (p.plano.hooksDeSkill) {
    const rt = await verificarRuntime(["git", "jq"], op.ambiente ?? process.env);
    if (!rt.ok) return { ok: false, instaladas: [], falhas, erros: [rt.erro], naoTravadas, avisos };
  }

  avisos.push(...p.plano.avisos);

  // APLICAR e TRAVAR.
  const lock: Lock = {
    lock_version: VERSAO_LOCK,
    cli_version: versaoDoCli(),
    harness: [...op.harness],
    skills: travadas,
    instalacao: instalacaoTravada(p.plano),
    ...(p.plano.resolucoes !== undefined ? { orquestracao: orquestracaoTravada(p.plano.resolucoes) } : {}),
  };
  const bloqueio = adquirirBloqueioOperacao(op.raiz);
  if (!bloqueio.ok) {
    return { ok: false, instaladas: [], falhas, erros: [bloqueio.erro], naoTravadas, avisos };
  }
  try {
    if (op.recusarModificacaoLocal === true) {
      const modificadas = Object.keys(travadasAntes).filter((n) => verificarModificacaoLocal(op.raiz, n).temModificacao);
      if (modificadas.length > 0) {
        return {
          ok: false,
          instaladas: [],
          falhas,
          erros: [`modificacao local em ${modificadas.join(", ")}: nada foi escrito`],
          naoTravadas,
          avisos,
        };
      }
    }
    const troca = prepararTroca(join(op.raiz, ".expx", "marketplace"), (tmp) => {
      montarMarketplace(tmp, montaveis, versaoDoCli());
    });
    try {
      // O registro antes dos agentes e do lock: uma falha no meio deixa no
      // máximo resoluções órfãs, inofensivas e reaproveitadas pelo próximo init.
      for (const r of p.plano.resolucoes ?? []) gravarNoRegistro(op.raiz, r);
      // a projeção acompanha a política: com ela, regravada; sem ela, some
      if (p.plano.projecao !== undefined) escreverArquivoAtomico(join(op.raiz, ...CAMINHO_PROJECAO.split("/")), p.plano.projecao);
      else rmSync(join(op.raiz, ...CAMINHO_PROJECAO.split("/")), { force: true });
      aplicarArtefatos(op.raiz, p.plano.projeto);
      for (const rel of p.plano.remover) rmSync(join(op.raiz, ...rel.split("/")), { force: true });
      if (p.plano.settings !== undefined) {
        const s = gravarSettings(p.plano.settings);
        // sem a cópia ao lado, a pessoa precisa saber onde está o desfazer
        if (s.ok && s.backupOmitidoPorGitLimpo === true) {
          avisos.push(".claude/settings.json rastreado e limpo no git: sem backup ao lado; desfaca pelo versionador (ex.: git checkout -- .claude/settings.json)");
        }
      }
      if (op.harness.includes("codex")) {
        try {
          const aviso = materializarCodex(op.raiz);
          if (aviso !== undefined) avisos.push(aviso);
        } catch (erro) {
          avisos.push(`Codex: nao foi possivel materializar os hooks: ${erro instanceof Error ? erro.message : "falha de filesystem"}`);
        }
      }
      if (p.plano.modos !== undefined) escreverArquivoAtomico(join(op.raiz, ".expx", "hooks.json"), p.plano.modos.texto);
      troca.publicar();
    } catch (e: unknown) {
      troca.descartar();
      throw e;
    }
    // O lock por último: ele é a afirmação de que a instalação está completa.
    escreverArquivoAtomico(caminhoDoLock(op.raiz), `${JSON.stringify(lock, null, 2)}\n`);
  } finally {
    bloqueio.liberar();
  }

  // O bit de execução foi gravado em disco, mas num repositório com
  // `core.filemode=false` o git NÃO vai versioná-lo — e o próximo clone ou
  // worktree recebe 0644, em que o hook por execução direta morre com 126.
  // O `init` avisa e entrega o comando pronto; o índice é da pessoa, e ele não
  // encosta nele (ver `nucleo/modo-executavel.ts`).
  const aviso = avisoDeFilemode(op.raiz, lock.instalacao?.executaveis ?? [], op.ambiente ?? process.env);
  if (aviso !== undefined) avisos.push(aviso);

  // Skill sem tag NÃO vira aviso na instalação. Hoje nenhum dos seis
  // repositórios publica tag, então o aviso disparava para todas, em toda
  // instalação — e um aviso que aparece sempre deixa de ser lido, levando
  // junto os avisos que realmente pedem atenção (settings.json em conflito,
  // skill que falhou).
  //
  // O fato continua registrado onde é procurado de propósito: `travado: false`
  // no lock, e o achado `skill-nao-travada` do `doctor`. Some o ruído da
  // instalação, não a informação.
  return { ok: true, instaladas, falhas, erros: [], naoTravadas, avisos };
  } finally {
    for (const t of temporarios) rmSync(t, { recursive: true, force: true });
  }
}

export { ORIGEM_DO_PLUGIN };
