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

/**
 * Os caracteres que atravessam um shell POSIX sem significado nenhum.
 *
 * Fora desta lista, o caminho vai entre aspas SIMPLES. Aspas duplas não servem:
 * dentro delas `$VAR`, `$(…)` e crase continuam valendo, e um nome de arquivo
 * com `$(touch x)` EXECUTARIA ao ser colado. Dentro de aspas simples nada é
 * interpretado — nem `$`, nem crase, nem `;`, nem `*`, nem newline — e o único
 * caractere que precisa de tratamento é a própria aspa simples, que fecha a
 * citação, sai crua com barra invertida e reabre: `'…'\''…'`.
 */
const SEM_SIGNIFICADO_NO_SHELL = /^[A-Za-z0-9_./@:%+=,-]+$/;

/**
 * Um caminho pronto para ser colado num shell.
 *
 * Caminho que começa por `-` também é citado. Não é o shell que o confunde com
 * opção — é o leitor humano, e o `--` do comando já protege o git; citar deixa
 * o argumento visivelmente um caminho.
 */
export function citarParaShell(caminho: string): string {
  if (SEM_SIGNIFICADO_NO_SHELL.test(caminho) && !caminho.startsWith("-")) return caminho;
  return `'${caminho.split("'").join(`'\\''`)}'`;
}

/**
 * O comando que versiona o bit. Literal, para ser copiado e colado: é a pessoa
 * que o executa, no momento em que decidir commitar o modo.
 *
 * O `--` não é enfeite: sem ele, um caminho que começa por `-` viraria opção do
 * git.
 */
export function comandoDeReparo(caminhos: readonly string[]): string {
  return `git update-index --chmod=+x -- ${caminhos.map(citarParaShell).join(" ")}`;
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
 * O resultado da consulta ao `HEAD`, com os três desfechos separados.
 *
 * Separar `sem-head` de `indisponivel` é o que evita as duas falhas opostas:
 * tratar "repositório sem commit nenhum" como erro de git esconde um estado
 * legítimo, e tratar "o git falhou" como "não está commitado" acusa sem prova.
 */
export type ConsultaAoHead =
  | { tipo: "modos"; modos: Map<string, string> }
  | { tipo: "sem-head" }
  | { tipo: "indisponivel"; motivo: string };

/**
 * O modo de cada caminho NO `HEAD` — o que está de fato COMMITADO.
 *
 * O índice não basta: `git update-index --chmod=+x` grava 100755 nele e o
 * commit é um passo separado. Entre os dois, o índice diz 100755, o `doctor`
 * diria "resolvido", e o clone ou worktree seguinte — que materializa a partir
 * do `HEAD`, não do índice — continuaria nascendo 0644 com o hook morto em 126.
 * É verde que só vale na máquina onde o `update-index` foi rodado.
 *
 * `ls-tree -r` porque o pathspec é o caminho completo; `--literal-pathspecs`
 * pela mesma razão de `modosNoIndice`. Caminho que nunca foi commitado
 * simplesmente não aparece no mapa (o git devolve saída vazia e sucesso).
 */
export function modosNoHead(
  raiz: string,
  caminhos: readonly string[],
  ambiente?: NodeJS.ProcessEnv,
): ConsultaAoHead {
  if (caminhos.length === 0) return { tipo: "modos", modos: new Map() };
  try {
    git(raiz, ["rev-parse", "--verify", "--quiet", "HEAD"], ambiente);
  } catch {
    // Sem HEAD resolvível. Repositório recém-criado (nada commitado ainda) é
    // estado legítimo; qualquer outra causa deixa a verificação inconclusiva.
    try {
      const dentro = git(raiz, ["rev-parse", "--is-inside-work-tree"], ambiente).trim();
      return dentro === "true" ? { tipo: "sem-head" } : { tipo: "indisponivel", motivo: "HEAD nao resolvivel" };
    } catch {
      return { tipo: "indisponivel", motivo: "git ausente, ou esta pasta nao e um repositorio git" };
    }
  }
  let bruto: string;
  try {
    bruto = git(raiz, [LITERAL, "ls-tree", "-r", "HEAD", "-z", "--", ...caminhos], ambiente);
  } catch {
    return { tipo: "indisponivel", motivo: "git ls-tree HEAD falhou" };
  }
  const modos = new Map<string, string>();
  for (const registro of bruto.split("\0")) {
    if (registro === "") continue;
    const tab = registro.indexOf("\t");
    if (tab < 0) continue;
    // `<modo> <tipo> <objeto>\t<caminho>`
    const campos = registro.slice(0, tab).split(" ");
    if (campos.length !== 3) continue;
    modos.set(registro.slice(tab + 1), campos[0] as string);
  }
  return { tipo: "modos", modos };
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
 * A decisão da sonda, a partir dos dois modos que ela mediu.
 *
 * Pura, e exportada, porque os ramos que importam não são reproduzíveis numa
 * bancada ext4 — e um teste que dependesse de estar rodando no Windows ou num
 * `/mnt/c` seria um teste que nunca roda:
 *
 * - Windows nativo: `chmod` não muda o modo POSIX (o Node devolve 0666 antes e
 *   depois), o bit nunca aparece → false;
 * - WSL/DrvFs (`/mnt/c`): todo arquivo aparece 0777, o bit nunca DESAPARECE →
 *   false, porque um filesystem que não sabe dizer "não executável" também não
 *   sabe acusar a ausência do bit;
 * - ext4/APFS: 0644 sem bit, 0755 com bit → true.
 *
 * Os dois tempos são conjunção: o bit tem de ESTAR AUSENTE quando não foi pedido
 * e PRESENTE quando foi. Só assim "sem bit" é uma afirmação, e não um artefato
 * do filesystem.
 */
export function decidirPreservaBit(modoSemPedir: number, modoDepoisDePedir: number): boolean {
  if ((modoSemPedir & 0o111) !== 0) return false;
  return (modoDepoisDePedir & 0o111) !== 0;
}

/**
 * O filesystem DESTE projeto distingue arquivo executável de não executável?
 *
 * A pergunta é sobre a raiz do projeto, e por isso a sonda é escrita ali —
 * nunca em `os.tmpdir()`, que pode estar em outro filesystem com outras regras
 * (é o caso comum no Windows e no WSL).
 *
 * **Ela escreve, então só deve ser chamada quando há pergunta a responder.** O
 * chamador calcula os candidatos primeiro e sonda só se houver algum: no
 * caminho saudável — o normal, em toda execução de `expx doctor` — nada é
 * escrito na árvore de quem pediu o diagnóstico. Ver `verificarModoExecutavel`.
 *
 * Qualquer erro (raiz somente leitura, sem permissão, raiz inexistente) devolve
 * `false`: sem prova, sem achado. E o `finally` remove a pasta da sonda em todos
 * os caminhos, inclusive nos de saída antecipada.
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
    const semPedir = statSync(sonda).mode;
    chmodSync(sonda, 0o755);
    return decidirPreservaBit(semPedir, statSync(sonda).mode);
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

/** Poucos caminhos por extenso; o resto por contagem. Aviso não é relatório. */
function amostraDeCaminhos(lista: readonly string[]): string {
  const resto = lista.length - 5;
  return `${lista.slice(0, 5).join(", ")}${resto > 0 ? ` e mais ${String(resto)}` : ""}`;
}

/**
 * O aviso do `init` quando o repositório ignora o bit de execução.
 *
 * `undefined` quando não há o que avisar: sem executáveis, sem git, fora de
 * repositório, `core.filemode` diferente de `false`, ou todo executável já
 * registrado como 100755 no índice — nesse último caso o modo JÁ está
 * versionado e repetir o aviso só ensinaria a ignorá-lo.
 *
 * ## Por que os dois casos são separados
 *
 * O aviso entrega um comando para copiar e colar, e `git update-index` é
 * ATÔMICO: um caminho fora do índice derruba o comando inteiro, e nem os
 * caminhos que estavam certos são tocados. Medido: `error: <caminho>: cannot add
 * to the index - missing --add option?` e `fatal: Unable to process path`.
 * Logo depois do primeiro `init` é exatamente esse o estado — nada rastreado.
 * Um comando que falha ensina a ignorar o aviso, e aí o defeito que ele
 * denuncia volta a passar em silêncio.
 *
 * Então: só o que está rastreado como 100644 entra no comando. O que não tem
 * entrada 100644 no índice (não rastreado, ou em conflito de merge) ganha
 * instrução — adicionar conscientemente e voltar pelo `expx doctor`. Sem
 * `--add` no `update-index` e sem o ExpxDev preparar índice: o índice é o
 * trabalho em curso de quem instalou, e um `git commit -a` depois levaria a
 * mudança junto de um commit alheio.
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
  const comComando = pendentes.filter((c) => modos.get(c) === MODO_SEM_EXECUCAO);
  const semComando = pendentes.filter((c) => modos.get(c) !== MODO_SEM_EXECUCAO);
  const quantos =
    pendentes.length === 1
      ? "1 executavel gerenciado foi gravado"
      : `${String(pendentes.length)} executaveis gerenciados foram gravados`;
  const linhas = [
    `core.filemode=false neste repositorio: ${quantos} 0755 no disco,`,
    "mas o git registra 100644 — e um clone ou worktree novo materializa 0644, em que o hook",
    "registrado por execucao direta falha com 126 (Permission denied). O ExpxDev nao toca no indice.",
  ];
  // Primeiro o que NÃO tem comando, para o comando ficar na última linha,
  // sozinho: é o que se copia e cola, e prosa depois dele vira argumento colado.
  if (semComando.length > 0) {
    linhas.push(
      `Ainda sem entrada 100644 no indice (nao rastreado, ou em conflito de merge): ${amostraDeCaminhos(semComando)}`,
      "  para estes o `git update-index` falharia e derrubaria o comando inteiro. Adicione-os ao indice",
      "  quando decidir versiona-los e rode `expx doctor`: ele entrega o comando exato do que estiver rastreado.",
    );
  }
  if (comComando.length > 0) {
    linhas.push(
      "Rastreados como 100644 — rode exatamente isto na raiz do projeto e commite o resultado:",
      `  ${comandoDeReparo(comComando)}`,
    );
  }
  return linhas.join("\n");
}
