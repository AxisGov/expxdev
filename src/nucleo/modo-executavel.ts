import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InstalacaoTravada } from "./lock.js";

/**
 * O modo executável dos artefatos gerenciados — o do disco E o VERSIONADO.
 *
 * ## O defeito que isto previne
 *
 * O `init` grava cada `.sh` com 0755 (`plano.ts`, `aplicarArtefatos`). Num
 * produto com `core.filemode=false`, o git ignora o bit do filesystem: `git
 * add` registra 100644, e o commit leva 100644. No produto onde a instalação
 * foi feita nada aparece — bytes, hashes, settings e `expx doctor` batem, e o
 * arquivo em disco continua 0755. O primeiro clone ou `git worktree add`
 * materializa 0644, e o hook registrado por EXECUÇÃO DIRETA
 * (`"$CLAUDE_PROJECT_DIR"/.claude/hooks/sprintx/git-perigoso.sh`) morre com
 * 126 (Permission denied): a proteção desaparece sem ninguém saber.
 *
 * Medido: `chmod 0755` + `git add` grava 100644; só `git update-index
 * --chmod=+x` grava 100755.
 *
 * ## O que o ExpxDev faz, e o que NÃO faz
 *
 * Ele detecta e diz o comando exato. Ele **nunca** roda `git add` nem `git
 * update-index`: preparar o índice de quem instalou é mexer num trabalho que
 * não é do instalador, e um `git commit -a` posterior levaria a mudança junto
 * de um commit alheio. O modo versionado é decisão explícita, com commit
 * explícito.
 *
 * Nenhuma função aqui lança: git ausente, pasta que não é repositório, e
 * plataforma onde a consulta não se aplica devolvem "nada a dizer".
 */

/** O modo que o git grava para um arquivo executável. */
export const MODO_EXECUTAVEL = "100755";
/** O modo que `core.filemode=false` grava por engano num arquivo 0755. */
export const MODO_SEM_EXECUCAO = "100644";

/**
 * Os destinos que o plano marcou como executáveis, em ordem canônica.
 *
 * Lock novo: `instalacao.executaveis` é a fonte de verdade — inclui o que é
 * executável por bit de origem, e não só por extensão. Lock antigo (sem o
 * campo) continua válido e cai no fallback da regra que o plano aplica hoje:
 * todo `.sh` é executável (`ehExecutavel` em `plano.ts`). O fallback é seguro
 * porque erra só para menos: um executável sem `.sh` fica de fora da
 * verificação, e nunca vira achado falso.
 */
export function executaveisDoLock(inst: InstalacaoTravada): string[] {
  if (inst.executaveis !== undefined) return [...inst.executaveis].sort();
  return Object.keys(inst.arquivos)
    .filter((rel) => rel.endsWith(".sh"))
    .sort();
}

function comEspaco(caminho: string): string {
  return caminho.includes(" ") ? `"${caminho}"` : caminho;
}

/**
 * O comando que versiona o bit. Literal, para ser copiado e colado: é a pessoa
 * que o executa, no momento em que decidir commitar o modo.
 */
export function comandoDeReparo(caminhos: readonly string[]): string {
  return `git update-index --chmod=+x -- ${caminhos.map(comEspaco).join(" ")}`;
}

function git(raiz: string, args: readonly string[], ambiente?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, {
    cwd: raiz,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    ...(ambiente !== undefined ? { env: ambiente } : {}),
  });
}

/**
 * Todo caminho é NOME DE ARQUIVO, nunca padrão.
 *
 * Os destinos vêm do lock, e um destino é um caminho literal. Sem isto o git
 * trata cada um como pathspec: `x*.sh` casa também `x.sh` e `xy.sh` (e o modo
 * lido passa a ser o de outro arquivo), `q?.sh` arrasta `qa.sh`, `a[b].sh` vira
 * classe de caractere, e um nome que começa por `:` é lido como magia de
 * pathspec — aí o git RECUSA a consulta inteira e o caminho errado passa como
 * "não rastreado". `--literal-pathspecs` é global e precisa vir antes do
 * subcomando; é preferido à variável `GIT_LITERAL_PATHSPECS` porque o ambiente
 * do processo é do chamador (o `init` passa o dele) e não é nosso para mexer.
 */
const LITERAL = "--literal-pathspecs";

/** No `git ls-files --stage`, o estágio sem conflito: o que o commit grava. */
const ESTAGIO_SEM_CONFLITO = "0";

/**
 * O modo de cada caminho NO ÍNDICE, para os que o git rastreia.
 *
 * O índice, e não o `HEAD`: é nele que o `update-index` opera, e é ele que o
 * próximo commit grava. Caminho não rastreado simplesmente não aparece —
 * ausência não é defeito, porque não há modo versionado errado ainda. Para o
 * que já foi COMMITADO, ver `modosNoHead`: o índice sozinho deixa passar o
 * `update-index` feito e não commitado.
 *
 * Durante um merge conflitado o índice não tem estágio 0 e traz 1/2/3 (base,
 * nosso, deles), que podem divergir no modo. Nenhum deles é o modo do próximo
 * commit, então o caminho conta como ausente: um conflito aberto é situação
 * legítima e transitória, e acusar modo no meio dele seria acusar um modo que
 * ninguém escolheu ainda.
 *
 * Os caminhos são relativos à `raiz` e o `git` roda com `cwd` nela, então a
 * chave devolvida é exatamente a que entrou (e a que vai para o comando de
 * reparo, que se roda da raiz do projeto).
 */
export function modosNoIndice(
  raiz: string,
  caminhos: readonly string[],
  ambiente?: NodeJS.ProcessEnv,
): Map<string, string> {
  const saida = new Map<string, string>();
  if (caminhos.length === 0) return saida;
  let bruto: string;
  try {
    bruto = git(raiz, [LITERAL, "ls-files", "--stage", "-z", "--", ...caminhos], ambiente);
  } catch {
    return saida; // sem git, ou fora de repositório
  }
  for (const registro of bruto.split("\0")) {
    if (registro === "") continue;
    const tab = registro.indexOf("\t");
    if (tab < 0) continue;
    // `<modo> <objeto> <estagio>\t<caminho>`
    const campos = registro.slice(0, tab).split(" ");
    if (campos.length !== 3) continue;
    if (campos[2] !== ESTAGIO_SEM_CONFLITO) continue;
    saida.set(registro.slice(tab + 1), campos[0] as string);
  }
  return saida;
}

/**
 * `core.filemode` está desligado neste repositório?
 *
 * Só `false` explícito conta. Config ausente, git ausente e pasta que não é
 * repositório devolvem `false`: a consulta não se aplica, e um aviso baseado
 * em palpite é pior que nenhum aviso.
 */
export function filemodeDesligado(raiz: string, ambiente?: NodeJS.ProcessEnv): boolean {
  try {
    return git(raiz, ["config", "--get", "core.filemode"], ambiente).trim() === "false";
  } catch {
    return false;
  }
}

/**
 * O filesystem DESTE projeto distingue arquivo executável de não executável?
 *
 * A pergunta é sobre a raiz do projeto, e por isso a sonda é escrita ali —
 * nunca em `os.tmpdir()`, que pode estar em outro filesystem com outras regras
 * (é o caso comum no Windows e no WSL).
 *
 * A sonda é de DOIS tempos, e é isso que evita o falso positivo:
 *
 * - Windows nativo: `chmod` não muda o modo POSIX, o bit nunca aparece → false;
 * - WSL/DrvFs (`/mnt/c`): todo arquivo aparece 0777, o bit nunca DESAPARECE →
 *   false, porque um filesystem que não sabe dizer "não executável" também não
 *   sabe acusar a ausência do bit;
 * - ext4/APFS: 0644 sem bit, 0755 com bit → true.
 *
 * Qualquer erro (raiz somente leitura, sem permissão) devolve `false`: sem
 * prova, sem achado.
 */
export function raizPreservaBitExecutavel(raiz: string): boolean {
  if (process.platform === "win32") return false;
  // A sonda mora em `.expx/` quando existe: é o espaço do próprio ExpxDev, e
  // não polui a raiz do produto se o processo morrer no meio.
  const base = existsSync(join(raiz, ".expx")) ? join(raiz, ".expx") : raiz;
  let dir: string | undefined;
  try {
    dir = mkdtempSync(join(base, ".modo-"));
    const sonda = join(dir, "sonda.sh");
    writeFileSync(sonda, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(sonda, 0o644);
    if ((statSync(sonda).mode & 0o111) !== 0) return false;
    chmodSync(sonda, 0o755);
    return (statSync(sonda).mode & 0o111) !== 0;
  } catch {
    return false;
  } finally {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
}

/** Dos declarados, os que existem em disco SEM nenhum bit de execução. */
export function semBitNoDisco(raiz: string, caminhos: readonly string[]): string[] {
  const saida: string[] = [];
  for (const rel of caminhos) {
    const caminho = join(raiz, ...rel.split("/"));
    try {
      const m = statSync(caminho);
      if (!m.isFile()) continue;
      if ((m.mode & 0o111) === 0) saida.push(rel);
    } catch {
      continue; // ausente é `artefato-ausente`, não achado de modo
    }
  }
  return saida;
}

/**
 * O aviso do `init` quando o repositório ignora o bit de execução.
 *
 * `undefined` quando não há o que avisar: sem executáveis, sem git, fora de
 * repositório, `core.filemode` diferente de `false`, ou todo executável já
 * registrado como 100755 no índice — nesse último caso o modo JÁ está
 * versionado e repetir o aviso só ensinaria a ignorá-lo.
 *
 * Avisa também sobre o que ainda não foi rastreado: é o caso normal logo
 * depois do primeiro `init`, e é exatamente aí que o `git add` seguinte
 * gravaria 100644.
 */
export function avisoDeFilemode(
  raiz: string,
  executaveis: readonly string[],
  ambiente?: NodeJS.ProcessEnv,
): string | undefined {
  if (executaveis.length === 0) return undefined;
  if (!filemodeDesligado(raiz, ambiente)) return undefined;
  const modos = modosNoIndice(raiz, executaveis, ambiente);
  const pendentes = executaveis.filter((c) => modos.get(c) !== MODO_EXECUTAVEL);
  if (pendentes.length === 0) return undefined;
  const quantos =
    pendentes.length === 1
      ? "1 executavel gerenciado foi gravado"
      : `${String(pendentes.length)} executaveis gerenciados foram gravados`;
  // O comando fica na ÚLTIMA linha, sozinho: é o que se copia e cola.
  return [
    `core.filemode=false neste repositorio: ${quantos} 0755 no disco,`,
    "mas o git vai registrar 100644 — e um clone ou worktree novo materializa 0644, em que o hook",
    "registrado por execucao direta falha com 126 (Permission denied). O ExpxDev nao toca no indice:",
    "depois do `git add`, rode exatamente isto e commite o resultado:",
    `  ${comandoDeReparo(pendentes)}`,
  ].join("\n");
}
