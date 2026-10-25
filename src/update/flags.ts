import { caminhoDoLock, lerLock, type Lock } from "../nucleo/lock.js";
import { repositorioCanonico, resolverOrigem } from "../nucleo/catalogo.js";
import { executarInit } from "../cli/init.js";
import { compararComRemoto, type ItemComparacao } from "./comparar.js";
import { verificarModificacaoLocal } from "./modificacao.js";
import { escreverArquivoAtomico } from "../plugin/atomico.js";
import { adquirirBloqueioOperacao } from "../nucleo/bloqueio-operacao.js";

/**
 * O `update`: descobre, mostra, confirma e aplica — nessa ordem.
 *
 * Rollback ficou por conta do versionador, e não por cópia da versão anterior
 * dentro de `.expx/`. Como `.expx/` é commitado, `git checkout` devolve a
 * versão antiga; em troca dessa simplificação, o CLI é OBRIGADO a dizer isso em
 * toda execução que aplica alguma coisa, para que ninguém descubra a ausência
 * do comando de desfazer no pior momento.
 */

/** Um SHA-1 completo: só ele é buscado como commit, sem ambiguidade com tag ou branch. */
const SHA_COMPLETO = /^[0-9a-f]{40}$/i;

export const AVISO_ROLLBACK =
  "para desfazer esta atualizacao, reverta o .expx/ pelo versionador (ex.: git checkout -- .expx)";

export type OpcoesUpdateCli = {
  skills: string[];
  check: boolean;
  to?: string;
  latest: boolean;
  sim: boolean;
};

export type ResultadoFlagsUpdate =
  | { ok: true; opcoes: OpcoesUpdateCli }
  | { ok: false; erro: string };

export function interpretarFlagsUpdate(argv: readonly string[]): ResultadoFlagsUpdate {
  const opcoes: OpcoesUpdateCli = { skills: [], check: false, latest: false, sim: false };

  for (let i = 0; i < argv.length; i++) {
    const bruto = argv[i] ?? "";
    const igual = bruto.indexOf("=");
    const nome = igual === -1 ? bruto : bruto.slice(0, igual);
    const embutido = igual === -1 ? undefined : bruto.slice(igual + 1);
    const proximo = (): string | undefined => embutido ?? argv[++i];

    switch (nome) {
      case "--check":
        opcoes.check = true;
        break;
      case "--latest":
        opcoes.latest = true;
        break;
      case "--yes":
      case "--sim":
        opcoes.sim = true;
        break;
      case "--to": {
        const v = proximo();
        if (v === undefined || v === "") return { ok: false, erro: "--to exige uma tag ou commit" };
        opcoes.to = v;
        break;
      }
      default:
        if (nome.startsWith("-")) return { ok: false, erro: `opcao desconhecida em update: ${nome}` };
        opcoes.skills.push(nome);
    }
  }

  if (opcoes.to !== undefined && opcoes.skills.length !== 1) {
    return { ok: false, erro: "--to exige exatamente uma skill nomeada" };
  }
  return { ok: true, opcoes };
}

export type OpcoesUpdate = {
  raiz: string;
  skills?: readonly string[];
  check?: boolean;
  to?: string;
  latest?: boolean;
  sim?: boolean;
  interativo?: boolean;
  origens?: Record<string, string>;
};

export type ResultadoUpdate = {
  ok: boolean;
  aplicou: boolean;
  atualizadas: string[];
  emDia: string[];
  bloqueadas: Array<{ nome: string; motivo: string }>;
  mensagens: string[];
};

function migrarProveniencias(
  lock: Lock,
  somente?: readonly string[],
): { lock: Lock; migradas: string[] } {
  const filtro = somente !== undefined && somente.length > 0 ? new Set(somente) : undefined;
  let skills = lock.skills;
  const migradas: string[] = [];

  for (const [nome, travada] of Object.entries(lock.skills)) {
    if (filtro !== undefined && !filtro.has(nome)) continue;
    const canonica = repositorioCanonico(nome, travada.repositorio);
    if (canonica === undefined || canonica === travada.repositorio) continue;
    if (skills === lock.skills) skills = { ...lock.skills };
    skills[nome] = { ...travada, repositorio: canonica };
    migradas.push(nome);
  }

  return {
    lock: skills === lock.skills ? lock : { ...lock, skills },
    migradas,
  };
}

export async function executarUpdate(op: OpcoesUpdate): Promise<ResultadoUpdate> {
  const mensagens: string[] = [];
  const bloqueadas: Array<{ nome: string; motivo: string }> = [];

  const l = lerLock(op.raiz);
  if (!l.ok) {
    return { ok: false, aplicou: false, atualizadas: [], emDia: [], bloqueadas: [], mensagens: [l.erro] };
  }
  const migracao = migrarProveniencias(l.lock, op.skills);

  // o git aceita SHA em maiúsculas, mas devolve e grava em minúsculas: sem
  // normalizar, o lock e a conferência do commit buscado divergiriam
  const to = op.to !== undefined && SHA_COMPLETO.test(op.to) ? op.to.toLowerCase() : op.to;
  const referencias = to !== undefined && op.skills?.[0] !== undefined ? { [op.skills[0]]: to } : undefined;
  const origens: Record<string, string> = {};
  for (const [nome, travada] of Object.entries(l.lock.skills)) {
    const origem = resolverOrigem(nome, travada.repositorio, op.origens?.[nome]);
    if (origem !== undefined) origens[nome] = origem;
  }
  const comparacao = await compararComRemoto({
    raiz: op.raiz,
    ...(op.skills !== undefined ? { somente: op.skills } : {}),
    origens,
    ...(referencias !== undefined ? { referencias } : {}),
  });
  if (!comparacao.ok) {
    return { ok: false, aplicou: false, atualizadas: [], emDia: [], bloqueadas: [], mensagens: [comparacao.erro] };
  }

  const emDia = comparacao.itens.filter((i) => i.emDia).map((i) => i.nome);
  const candidatas: ItemComparacao[] = [];
  const modificadas: string[] = [];
  const bloquearSeModificada = (nome: string): boolean => {
    const mod = verificarModificacaoLocal(op.raiz, nome);
    if (!mod.temModificacao) return false;
    bloqueadas.push({ nome, motivo: `modificacao local em: ${[...mod.alterados, ...mod.removidos].join(", ")}` });
    modificadas.push(nome);
    return true;
  };

  for (const item of comparacao.aAplicar) {
    // Trabalho manual nunca é sobrescrito por um comando de rotina.
    if (bloquearSeModificada(item.nome)) continue;
    candidatas.push(item);
  }
  // O `init` remonta TODAS as skills do lock, não só as candidatas: uma
  // modificação local em qualquer outra — em dia, ou fora do filtro — também
  // seria sobrescrita.
  if (candidatas.length > 0) {
    const vistas = new Set(comparacao.aAplicar.map((i) => i.nome));
    for (const nome of Object.keys(l.lock.skills)) {
      if (!vistas.has(nome)) bloquearSeModificada(nome);
    }
  }

  for (const i of comparacao.itens) {
    if (i.erro !== undefined) bloqueadas.push({ nome: i.nome, motivo: i.erro });
  }
  for (const i of candidatas) {
    // Sem tag, `atual`/`nova` são o mesmo nome de branch: o que mudou é o
    // commit, e é ele que precisa aparecer, senão a mensagem lê "main → main".
    const versoes =
      i.commitAtual !== undefined && i.commitNovo !== undefined
        ? `${i.atual} (${i.commitAtual.slice(0, 9)}) → ${i.commitNovo.slice(0, 9)}`
        : `${i.atual} → ${i.nova}`;
    mensagens.push(`${i.nome}: ${versoes}${i.mudancas.length > 0 ? ` (${String(i.mudancas.length)} mudanca(s))` : ""}`);
  }

  const podeAplicar = (op.sim ?? false) || (op.interativo ?? false);
  if (migracao.migradas.length > 0) {
    mensagens.push(`proveniencia canonica pendente: ${migracao.migradas.join(", ")}`);
  }
  if (op.check === true || !podeAplicar) {
    if (op.check !== true && (candidatas.length > 0 || migracao.migradas.length > 0) && !podeAplicar) {
      mensagens.push("sem confirmacao disponivel: nada foi aplicado (use --yes para aplicar sem perguntar)");
    }
    return { ok: true, aplicou: false, atualizadas: [], emDia, bloqueadas, mensagens };
  }
  if (candidatas.length === 0) {
    if (migracao.migradas.length === 0) {
      return { ok: true, aplicou: false, atualizadas: [], emDia, bloqueadas, mensagens };
    }
    const bloqueio = adquirirBloqueioOperacao(op.raiz);
    if (!bloqueio.ok) {
      return { ok: false, aplicou: false, atualizadas: [], emDia, bloqueadas, mensagens: [...mensagens, bloqueio.erro] };
    }
    let migracaoAtual: ReturnType<typeof migrarProveniencias>;
    try {
      const atual = lerLock(op.raiz);
      if (!atual.ok) {
        return { ok: false, aplicou: false, atualizadas: [], emDia, bloqueadas, mensagens: [...mensagens, atual.erro] };
      }
      migracaoAtual = migrarProveniencias(atual.lock, op.skills);
      if (migracaoAtual.migradas.length === 0) {
        return {
          ok: true,
          aplicou: false,
          atualizadas: [],
          emDia,
          bloqueadas,
          mensagens: mensagens.filter((m) => !m.startsWith("proveniencia canonica pendente:")),
        };
      }
      escreverArquivoAtomico(
        caminhoDoLock(op.raiz),
        `${JSON.stringify(migracaoAtual.lock, null, 2)}\n`,
      );
    } finally {
      bloqueio.liberar();
    }
    mensagens.push(AVISO_ROLLBACK);
    return {
      ok: true,
      aplicou: true,
      atualizadas: migracaoAtual.migradas,
      emDia,
      bloqueadas,
      mensagens,
    };
  }

  if (modificadas.length > 0) {
    mensagens.push(
      `nada foi aplicado: o update remonta todas as skills e sobrescreveria a modificacao local em ${modificadas.join(", ")}`,
    );
    return { ok: false, aplicou: false, atualizadas: [], emDia, bloqueadas, mensagens };
  }

  // Remonta do zero com as versões novas, mantendo a seleção e o harness. As
  // skills que não estão sendo atualizadas voltam no commit travado: pela
  // referência, uma skill em `main` seria resolvida de novo na ponta.
  const selecao = Object.keys(l.lock.skills);
  const alvos: Record<string, string> = {};
  const commits: Record<string, string> = {};
  for (const c of candidatas) alvos[c.nome] = c.nova;
  for (const [nome, travada] of Object.entries(l.lock.skills)) {
    if (alvos[nome] !== undefined) continue;
    alvos[nome] = travada.referencia;
    // origem em disco grava `local` ou `<sha>-local`: não há commit a buscar
    if (travada.commit !== "local" && !travada.commit.endsWith("-local")) commits[nome] = travada.commit;
  }
  // `--to <sha>`: `git clone --branch` não aceita SHA, então ele vai como commit
  const nomeada = op.skills?.[0];
  if (to !== undefined && nomeada !== undefined && SHA_COMPLETO.test(to)) commits[nomeada] = to;

  const init = await executarInit({
    raiz: op.raiz,
    skills: selecao,
    harness: l.lock.harness,
    referencias: alvos,
    commits,
    origens,
  });

  // O `update` remonta pelo `init`, então os avisos dele são os mesmos avisos —
  // inclusive o do `core.filemode=false`, que vale para os arquivos que acabaram
  // de ser reescritos. Engoli-los aqui esconderia o defeito justamente no
  // comando que traz artefato novo.
  mensagens.push(...init.avisos);
  if (init.ok) mensagens.push(AVISO_ROLLBACK);
  return {
    ok: init.ok,
    aplicou: init.ok,
    atualizadas: init.ok ? [...new Set([...candidatas.map((c) => c.nome), ...migracao.migradas])] : [],
    emDia,
    bloqueadas,
    mensagens,
  };
}
