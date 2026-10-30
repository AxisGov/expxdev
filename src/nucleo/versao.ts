import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Resolução de versão alvo de uma skill.
 *
 * Da origem canônica, o alvo é o commit que a release do CLI certifica (o
 * `certificado` do catálogo). Fora dela — a pasta local, a origem que a
 * pessoa configurou —, a MAIOR tag de versão semântica do repositório e, sem
 * nenhuma tag, a branch padrão, marcada como não travada.
 */

export type Alvo = {
  ok: boolean;
  /** Tag escolhida, ou a branch padrão quando não há tag. */
  referencia: string;
  /** `false` quando a referência é branch: a skill não está travada em versão publicada. */
  travado: boolean;
  /**
   * O SHA do HEAD remoto da `referencia`, quando ela é uma branch.
   *
   * Sem tag, "atualizado" não pode significar "o nome da branch não mudou" —
   * `main` sempre se chama `main`. É este commit, e não a `referencia`, que
   * decide se uma skill não travada está em dia (ver `compararComRemoto`).
   */
  commit?: string;
  erro?: string;
};

const BRANCH_PADRAO = "main";

/** `v1.2.3` → [1,2,3]. Pré-lançamento (`-rc.1`) é ignorado: não é versão publicada. */
function partes(tag: string): [number, number, number] | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  if (m === null) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * A maior tag semver da lista, ou `undefined` se nenhuma for semver.
 *
 * Compara número a número — ordenação de string colocaria `v1.10.0` antes de
 * `v1.2.0`, que é o erro clássico e justamente o que o teste cobre.
 */
export function maiorTagSemver(tags: readonly string[]): string | undefined {
  let melhor: { tag: string; p: [number, number, number] } | undefined;
  for (const tag of tags) {
    const p = partes(tag);
    if (p === undefined) continue;
    if (
      melhor === undefined ||
      p[0] > melhor.p[0] ||
      (p[0] === melhor.p[0] && p[1] > melhor.p[1]) ||
      (p[0] === melhor.p[0] && p[1] === melhor.p[1] && p[2] > melhor.p[2])
    ) {
      melhor = { tag, p };
    }
  }
  return melhor?.tag;
}

/** As tags publicadas de um repositório, sem as referências desreferenciadas (`^{}`). */
export async function listarTags(repositorio: string): Promise<string[]> {
  const { stdout } = await exec("git", ["ls-remote", "--tags", repositorio]);
  return stdout
    .split("\n")
    .filter((l) => l.includes("refs/tags/") && !l.endsWith("^{}"))
    .map((l) => l.slice(l.indexOf("refs/tags/") + "refs/tags/".length).trim())
    .filter((t) => t !== "");
}

/** O SHA do HEAD remoto de uma branch, ou `undefined` se ela não existir no remoto. */
export async function commitRemotoDaBranch(repositorio: string, branch: string): Promise<string | undefined> {
  const { stdout } = await exec("git", ["ls-remote", repositorio, `refs/heads/${branch}`]);
  const linha = stdout.split("\n").find((l) => l.trim() !== "");
  return linha?.split("\t")[0]?.trim();
}

export type OpcoesAlvo = {
  /** A referência pedida (`--to`): tag, branch ou SHA. Vence tudo. */
  forcar?: string;
  /**
   * O commit que esta versão do CLI certifica para a skill, quando a origem é a
   * canônica do catálogo. Vence a tag e a `main`: andar para a frente é uma
   * release nova do expxdev, nunca um merge na skill.
   */
  certificado?: string;
};

/** Um SHA-1 completo: pedido assim, é um commit, sem ambiguidade com tag ou branch. */
const SHA_COMPLETO = /^[0-9a-f]{40}$/i;

/**
 * A referência que deve ser instalada.
 *
 * Fixada por SHA (o `--to` com SHA, ou o certificado), a referência é o próprio
 * commit, e o `init` o busca como commit: `git clone --branch` não aceita SHA.
 *
 * Repositório inacessível NÃO lança: devolve `ok: false` com o motivo, porque o
 * método exige que uma skill inacessível não aborte a instalação das demais.
 */
export async function resolverAlvo(repositorio: string, op: OpcoesAlvo = {}): Promise<Alvo> {
  const { forcar, certificado } = op;
  if (forcar !== undefined && forcar !== "") {
    if (SHA_COMPLETO.test(forcar)) {
      const sha = forcar.toLowerCase();
      return { ok: true, referencia: sha, travado: true, commit: sha };
    }
    return { ok: true, referencia: forcar, travado: !forcar.includes(BRANCH_PADRAO) };
  }
  if (certificado !== undefined) return { ok: true, referencia: certificado, travado: true, commit: certificado };
  try {
    const tags = await listarTags(repositorio);
    const maior = maiorTagSemver(tags);
    if (maior !== undefined) return { ok: true, referencia: maior, travado: true };
    // Sem tag, o nome da branch nunca muda — só o commit por trás dela diz se
    // há novidade. Falha ao buscar o SHA não derruba a resolução: a instalação
    // ainda funciona por nome de branch, só a comparação por commit fica sem dado.
    const commit = await commitRemotoDaBranch(repositorio, BRANCH_PADRAO).catch(() => undefined);
    return { ok: true, referencia: BRANCH_PADRAO, travado: false, ...(commit !== undefined ? { commit } : {}) };
  } catch (e: unknown) {
    return { ok: false, referencia: "", travado: false, erro: String(e) };
  }
}
