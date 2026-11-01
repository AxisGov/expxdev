import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Apoio da bancada P0.2: as skills candidatas fixadas, o binário REAL do
 * `expxdev`, e o runtime em que os hooks instalados rodam.
 *
 * Nada aqui monta instalação à mão: as fontes são entregues ao `init` pelo
 * mecanismo oficial (`EXPX_SKILLS_LOCAIS`), e o `init` é o `dist/cli/expx-bin.js`
 * executado num processo novo.
 */

export const RAIZ_DO_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BINARIO = join(RAIZ_DO_REPO, "dist", "cli", "expx-bin.js");

/**
 * As candidatas fixadas. `sha` é o commit do snapshot, e nada é propagado por cima
 * dele: cada snapshot é o commit, byte a byte.
 */
export const CANDIDATOS = {
  sprintx: { pasta: "SprintX", sha: "2c89012072c9ba83f6f0bf24d148257894fbf0d5" },
  mergex: { pasta: "MergeX", sha: "0e0bf27905e8ff1c1c00e38f9e1cefe67a34e6b9" },
} as const;

export type NomeCandidato = keyof typeof CANDIDATOS;

export function snapshot(nome: NomeCandidato): string {
  return join(RAIZ_DO_REPO, "fixtures", "candidatos", nome);
}

const ehWindows = process.platform === "win32";

/** Os caminhos sob o ciclo, do mais velho ao mais novo. */
const sobOCiclo: string[] = [];

/** Dois caminhos são o mesmo para o filesystem? No Windows a caixa não distingue. */
function mesmoCaminho(a: string, b: string): boolean {
  return ehWindows ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * `caminho` está ESTRITAMENTE dentro de `base`?
 *
 * Os dois são NORMALIZADOS antes de comparar, porque é a forma normalizada que o
 * `rmSync` alcança: `base/x/../..` é o avô de `base`, não um filho dele, e
 * comparar texto cru deixaria o avô passar. No Windows a normalização também
 * troca `\` por `/` — os dois separadores abrem o mesmo caminho lá.
 *
 * O prefixo comparado TERMINA em separador, e o alvo tem de ser mais longo que
 * ele. São as duas pontas do "estritamente": `base` não está dentro de si mesma,
 * e `base-vizinho` não está dentro de `base`.
 *
 * `janela` escolhe a semântica de comparação em vez de `process.platform` para
 * que a regra do Windows — onde a caixa NÃO distingue caminho, e comparar com
 * caixa deixaria `C:\TEMP\x` passar por fora de `C:\Temp\` — seja verificável na
 * plataforma em que a bancada roda.
 *
 * Caminho relativo é resolvido contra o diretório de trabalho do processo, como o
 * `rmSync` faria. Vazio nunca está dentro de nada: `resolve("")` devolveria o
 * diretório de trabalho — a raiz do repositório, quando a bancada roda.
 */
export function estritamenteDentro(base: string, caminho: string, janela = ehWindows): boolean {
  if (base === "" || caminho === "") return false;
  const p = janela ? win32 : posix;
  const raiz = p.resolve(base);
  const alvo = p.resolve(caminho);
  const prefixo = raiz.endsWith(p.sep) ? raiz : `${raiz}${p.sep}`;
  const a = janela ? alvo.toLowerCase() : alvo;
  const b = janela ? prefixo.toLowerCase() : prefixo;
  return a.startsWith(b) && a.length > b.length;
}

/**
 * O ciclo pode adotar este caminho?
 *
 * Adotar é entregar um caminho ao `rmSync -r`, então a pergunta é destrutiva e a
 * resposta é fail-closed: só passa o que se PROVA estritamente dentro do
 * temporário do sistema. Raiz de repositório, HOME, o próprio `tmpdir()` e
 * qualquer ancestral dele ficam de fora, e nenhum deles é caminho que um teste
 * tenha criado para si.
 *
 * `tmpdir()` é lido a cada chamada, e não fixado na carga do módulo: é dele que
 * `temporarios.novo` deriva o que cria, e um teste que troca `TMPDIR` para medir
 * o que aparece no temporário precisa que as duas pontas concordem.
 */
export function adotavelPeloCiclo(caminho: string): boolean {
  return estritamenteDentro(tmpdir(), caminho);
}

/**
 * O ciclo de vida dos temporários desta bancada.
 *
 * Todo helper daqui que cria pasta temporária a registra no ciclo no instante em
 * que ela NASCE — antes de qualquer trabalho que possa falhar. Com isso o dono é
 * sempre conhecido: erro no meio da montagem e retorno antecipado não deixam
 * pasta órfã, porque o registro já aconteceu. Quem fecha o ciclo é o `afterAll`
 * da bancada, com `descartar()`.
 *
 * O descarte é pela LISTA de caminhos desta execução, NUNCA por prefixo: só sai
 * do disco o que `mkdtempSync` devolveu aqui, ou o que foi adotado de propósito.
 * Temporário de execução anterior, de outro arquivo de teste rodando em paralelo
 * ou de outro processo qualquer nunca é alcançado — e um `rm -rf` de padrão
 * (`expx-*`) jamais acontece.
 *
 * A adoção é o único jeito de um caminho de fora entrar nessa lista, e por isso é
 * validada: `adotar` só aceita caminho estritamente dentro do temporário do
 * sistema (`adotavelPeloCiclo`). Raiz de repositório, HOME e ancestral de
 * `tmpdir()` reprovam com exceção — adotar é agendar um `rm -rf` para o
 * `afterAll`, e nenhum desses caminhos foi criado por um teste para ser removido.
 */
export const temporarios = {
  /** Uma pasta temporária nova, já sob o ciclo. */
  novo(prefixo: string): string {
    const d = mkdtempSync(join(tmpdir(), prefixo));
    sobOCiclo.push(d);
    return d;
  },

  /**
   * Põe sob o ciclo um caminho criado FORA daqui — uma worktree, um arquivo de
   * mensagem.
   *
   * A adoção é VALIDADA, e validada antes de qualquer mudança de estado: o ciclo
   * remove recursivamente o que adota, e um caminho adotado por engano é um
   * `rm -rf` agendado para o `afterAll`. Só entra o que `adotavelPeloCiclo`
   * aprova; o resto reprova com exceção, nunca em silêncio — quem precisa de
   * caminho de fora precisa saber que ele não tem dono aqui.
   *
   * O que entra na lista é o caminho NORMALIZADO: é a forma que o `rmSync`
   * alcança, e é a que a validação aprovou. Adotar duas vezes é idempotente — o
   * caminho não entra duas vezes, e o descarte não volta a um caminho que já saiu
   * do disco.
   */
  adotar(caminho: string): string {
    if (!adotavelPeloCiclo(caminho)) {
      throw new Error(
        `temporarios.adotar recusou ${JSON.stringify(caminho)}: o ciclo REMOVE o que adota, e so adota ` +
          `caminho estritamente dentro de ${tmpdir()}`,
      );
    }
    const alvo = resolve(caminho);
    if (!sobOCiclo.some((d) => mesmoCaminho(d, alvo))) sobOCiclo.push(alvo);
    return alvo;
  },

  /** O que está sob o ciclo agora, do mais velho ao mais novo. */
  lista(): readonly string[] {
    return [...sobOCiclo];
  },

  /**
   * Remove o que está sob o ciclo, do mais novo ao mais velho — uma worktree
   * adotada depois do produto que a hospeda sai antes dele.
   *
   * Uma remoção que falhe não cala nem interrompe as outras: todas são tentadas,
   * e o que não saiu é reportado no fim, na ordem em que foi tentado.
   *
   * O caminho que NÃO saiu continua sob o ciclo. A lista só muda depois da
   * varredura, e só pelo que o disco confirmou: tirar o caminho da lista antes
   * (um `splice` na entrada) deixava órfã justamente a pasta cuja remoção falhou
   * — ela perdia o dono no instante em que provou precisar de outra tentativa, e
   * nenhuma chamada seguinte voltaria a ela.
   */
  descartar(): void {
    const falhas: string[] = [];
    const presos: string[] = [];
    for (const d of [...sobOCiclo].reverse()) {
      try {
        // `maxRetries`/`retryDelay`: no Windows a remoção esbarra em EBUSY, EPERM
        // e ENOTEMPTY transitórios enquanto o antivírus, o indexador ou o
        // processo de git que acabou de sair ainda seguram um handle do que está
        // dentro da pasta. O Node repete só esses, com espera crescente; EACCES e
        // o resto continuam reprovando de primeira, sem segurar a bancada.
        rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      } catch (e) {
        falhas.push(`${d}: ${String(e)}`);
        presos.push(d);
      }
    }
    sobOCiclo.length = 0;
    // De volta na ordem original (do mais velho ao mais novo), para a próxima
    // tentativa continuar saindo do mais novo para o mais velho.
    sobOCiclo.push(...presos.reverse());
    if (falhas.length > 0) throw new Error(`temporarios da bancada nao removidos:\n${falhas.join("\n")}`);
  },
};

export function sha256(caminho: string): string {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

/** Arquivos de uma árvore, relativos, com `/`, ordenados. */
export function arvore(raiz: string, ignorar: (rel: string) => boolean = () => false): string[] {
  const saida: string[] = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const d = fila.shift() as string;
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const rel = relative(raiz, p).split(sep).join("/");
      if (ignorar(rel)) continue;
      if (statSync(p).isDirectory()) fila.push(p);
      else saida.push(rel);
    }
  }
  return saida.sort();
}

/**
 * O snapshot está coerente consigo? Confere o commit declarado e cada arquivo
 * contra o manifesto gerado por `scripts/fixture-candidatos.sh`.
 *
 * Coerência, não procedência: nada aqui vai à origem conferir bytes — a bancada
 * não usa rede, e o manifesto só diz que o snapshot no disco é o que o gerador
 * extraiu. Quem prova que a correção do commit novo chegou é teste de
 * comportamento sobre o hook INSTALADO, não este manifesto.
 */
export function conferirSnapshot(nome: NomeCandidato): void {
  const base = snapshot(nome);
  const sha = readFileSync(`${base}.sha`, "utf8").trim();
  if (sha !== CANDIDATOS[nome].sha) throw new Error(`${nome}: snapshot em ${sha}, esperado ${CANDIDATOS[nome].sha}`);
  const esperado = readFileSync(`${base}.MANIFESTO.sha256`, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [hash, ...resto] = l.split("  ");
      return [resto.join("  "), hash] as const;
    });
  const noDisco = arvore(base);
  const listados = esperado.map(([f]) => f).sort();
  if (JSON.stringify(noDisco) !== JSON.stringify(listados)) throw new Error(`${nome}: arquivos do snapshot divergem do manifesto`);
  for (const [f, hash] of esperado) {
    if (sha256(join(base, f)) !== hash) throw new Error(`${nome}: ${f} diverge do manifesto`);
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "expx",
      GIT_AUTHOR_EMAIL: "expx@example.invalid",
      GIT_COMMITTER_NAME: "expx",
      GIT_COMMITTER_EMAIL: "expx@example.invalid",
    },
  });
}

/**
 * Repositórios descartáveis não podem iniciar manutenção em segundo plano:
 * além de mudar a árvore enquanto a bancada a compara, o processo destacado
 * pode manter `.git` ocupado durante o descarte. As duas chaves cobrem o
 * `git maintenance run --auto` atual e o `git gc --auto` legado.
 */
function desativarManutencaoAutomatica(cwd: string): void {
  git(cwd, "config", "maintenance.auto", "false");
  git(cwd, "config", "gc.auto", "0");
}

export function gitEm(cwd: string, ...args: string[]): string {
  return git(cwd, ...args);
}

/**
 * A pasta que `EXPX_SKILLS_LOCAIS` aponta: um repositório por candidata, com
 * os bytes do snapshot. É repositório porque o `init` resolve a versão com
 * `git ls-remote` na origem, como faria com a remota.
 */
export function fontesCandidatas(): string {
  const raiz = temporarios.novo("expx-candidatas-");
  for (const nome of Object.keys(CANDIDATOS) as NomeCandidato[]) {
    conferirSnapshot(nome);
    const destino = join(raiz, CANDIDATOS[nome].pasta);
    cpSync(snapshot(nome), destino, { recursive: true });
    git(destino, "init", "-q", "-b", "main");
    git(destino, "config", "core.autocrlf", "false");
    desativarManutencaoAutomatica(destino);
    git(destino, "add", "-A");
    git(destino, "commit", "-q", "-m", `${nome} @ ${CANDIDATOS[nome].sha}`);
  }
  return raiz;
}

/** Um produto Git novo, com um commit na principal. */
export function novoProduto(prefixo = "expx-produto-"): string {
  const raiz = temporarios.novo(prefixo);
  git(raiz, "init", "-q", "-b", "main");
  git(raiz, "config", "core.autocrlf", "false");
  desativarManutencaoAutomatica(raiz);
  git(raiz, "config", "user.email", "produto@example.invalid");
  git(raiz, "config", "user.name", "Produto");
  git(raiz, "commit", "-q", "--allow-empty", "-m", "produto: inicio");
  return raiz;
}

/** O binário no PATH deste processo, ou `undefined`. */
export function noPath(bin: string): string | undefined {
  const dirs = (process.env["PATH"] ?? process.env["Path"] ?? "").split(delimiter).filter((d) => d !== "");
  for (const d of dirs) {
    for (const nome of ehWindows ? [`${bin}.exe`] : [bin]) {
      const p = join(d, nome);
      try {
        if (statSync(p).isFile()) return p;
      } catch {
        // próximo
      }
    }
  }
  return undefined;
}

function obrigatorio(bin: string): string {
  const p = noPath(bin);
  if (p === undefined) throw new Error(`${bin} ausente do PATH desta bancada: ela exige o binario real`);
  return p;
}

/** A raiz da instalação do Git no Windows, pelo `--exec-path` do próprio git. */
function raizDoGitWindows(): string {
  const exec = execFileSync(obrigatorio("git"), ["--exec-path"], { encoding: "utf8" }).trim();
  return resolve(exec, "..", "..", "..");
}

/**
 * O bash que roda os hooks. No Windows, o Git Bash — derivado da instalação do
 * git, NUNCA o primeiro `bash` do PATH, que pode ser o do WSL.
 */
export function bashDosHooks(): string {
  if (!ehWindows) return obrigatorio("bash");
  const b = join(raizDoGitWindows(), "bin", "bash.exe");
  if (!existsSync(b)) throw new Error(`Git Bash nao encontrado em ${b}`);
  return b;
}

/** Ambiente com o PATH trocado — removendo toda variante de caixa (`Path`). */
export function ambienteCom(path: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== "PATH") env[k] = v;
  env["PATH"] = path;
  return { ...env, ...extra };
}

/**
 * Um PATH controlado para o `expxdev`: git sempre, jq só se pedido, e NUNCA o
 * `claude` — o `init` não pode registrar o plugin no Claude Code de quem roda
 * a bancada. Monta uma pasta de links onde o sistema permite (Linux); no
 * Windows, usa só as pastas da instalação do Git, conferindo que o jq não
 * está nelas.
 *
 * A bancada chama isto a cada `init` e a cada `doctor`, então a pasta de links
 * nasce sob o ciclo (`temporarios`) e some no `afterAll`. No Windows nada é
 * criado: o retorno são as pastas da INSTALAÇÃO do Git, que o ciclo não conhece
 * e, portanto, nunca remove.
 */
export function pathControlado(comJq: boolean): string {
  const jq = obrigatorio("jq");
  if (ehWindows) {
    const g = raizDoGitWindows();
    const dirs = [join(g, "cmd"), join(g, "mingw64", "bin"), join(g, "usr", "bin")];
    for (const d of dirs) {
      if (existsSync(join(d, "jq.exe")) || existsSync(join(d, "claude.exe"))) {
        throw new Error(`${d} contem jq/claude: nao da para controlar o PATH`);
      }
    }
    return [...dirs, ...(comJq ? [dirname(jq)] : [])].join(delimiter);
  }
  // Os alvos primeiro, a pasta depois: externo que falte reprova ANTES de existir
  // pasta para ficar órfã.
  const gitBin = obrigatorio("git");
  const bin = temporarios.novo("expx-bin-");
  symlinkSync(gitBin, join(bin, "git"));
  if (comJq) symlinkSync(jq, join(bin, "jq"));
  return bin;
}

/**
 * Um HOME descartável para o `expxdev init`.
 *
 * O PATH controlado já tira o `claude` de vista, e sem o binário a instalação
 * do plugin só IMPRIME a instrução manual. Mas isso é garantia por ausência:
 * quem lê a bancada precisa inferir, do PATH, que `~/.claude` do operador não
 * pode ser tocado. Aqui a garantia fica positiva — o processo recebe um HOME
 * (e um `CLAUDE_CONFIG_DIR`) vazio, em pasta temporária, e o teste confere
 * depois que nada foi escrito nele.
 *
 * `USERPROFILE` acompanha o `HOME` porque é dele que o Node deriva `homedir()`
 * no Windows, e as três XDG porque é por elas que um cache de plugin escaparia
 * do HOME em Linux.
 */
export function larIsolado(): { lar: string; env: Record<string, string> } {
  const lar = temporarios.novo("expx-lar-");
  return {
    lar,
    env: {
      HOME: lar,
      USERPROFILE: lar,
      XDG_CONFIG_HOME: join(lar, ".config"),
      XDG_CACHE_HOME: join(lar, ".cache"),
      XDG_DATA_HOME: join(lar, ".local", "share"),
      CLAUDE_CONFIG_DIR: join(lar, ".claude"),
    },
  };
}

/** O PATH em que os hooks instalados rodam: o do processo, com jq garantido. */
export function pathDosHooks(): string {
  const jq = obrigatorio("jq");
  return [dirname(jq), process.env["PATH"] ?? process.env["Path"] ?? ""].join(delimiter);
}

/**
 * Os externos que os hooks do rastro usam quando NÃO há jq — o caminho de
 * fallback do contrato (`rastro_json_get`, `rastro_tool_input_get`) e o que
 * `rastro_grava` precisa para escrever o jsonl. `bash` entra porque o hook é
 * executado pelo próprio shebang (`#!/usr/bin/env bash`), que resolve `bash`
 * no PATH.
 *
 * A lista é NOMEADA de propósito: ferramenta que falte reprova alto, em vez de
 * fazer o hook cair calado num resultado que pareceria o do fallback.
 */
const EXTERNOS_DOS_HOOKS = [
  "bash", "git", "grep", "sed", "head", "tail", "awk", "sort",
  "mkdir", "date", "mv", "wc", "tr", "cut", "od", "ps", "cat", "dirname",
] as const;

/**
 * Um PATH para os hooks instalados em que o jq NÃO existe.
 *
 * Filtrar o PATH do processo não serve: o jq mora junto do `grep`, do `sed` e
 * do `date` (`/usr/bin`), e tirar a pasta tiraria também eles — o hook falharia
 * por falta de ferramenta em vez de exercitar o fallback sem jq. Aqui a pasta é
 * montada por adição, com links só para o que está declarado acima.
 *
 * No Windows link exige privilégio: ali o PATH controlado do `init` já é, por
 * construção, as pastas da instalação do Git CONFERIDAS sem jq — e são elas que
 * trazem o mesmo conjunto POSIX.
 */
export function pathDosHooksSemJq(): string {
  if (ehWindows) return pathControlado(false);
  // Resolve a lista INTEIRA antes de criar a pasta: ferramenta que falte reprova
  // alto, e reprova sem deixar pasta pela metade no temporário do sistema.
  const alvos = EXTERNOS_DOS_HOOKS.map((nome) => [nome, obrigatorio(nome)] as const);
  const bin = temporarios.novo("expx-sem-jq-");
  for (const [nome, alvo] of alvos) symlinkSync(alvo, join(bin, nome));
  return bin;
}

/**
 * O `jq` que um processo com este PATH vê, pelo mesmo `command -v` que os hooks
 * usam para decidir. Vazio quando não há — e é isso que torna a ausência do jq
 * uma garantia AFIRMATIVA, e não inferida da montagem do PATH.
 */
export function jqVisivelCom(path: string): string {
  const r = spawnSync(bashDosHooks(), ["-c", "command -v jq || true"], {
    encoding: "utf8",
    env: ambienteCom(path),
    timeout: 60000,
  });
  return (r.stdout ?? "").trim();
}

/** Roda o `expxdev` REAL (o `dist/`) num processo novo. */
export function rodarExpx(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  if (!existsSync(BINARIO)) throw new Error(`${BINARIO} ausente: rode npm run build:server`);
  return spawnSync(process.execPath, [BINARIO, ...args], { cwd, env, encoding: "utf8", timeout: 180000 });
}

/**
 * O comando REGISTRADO no `.claude/settings.json` instalado para o script —
 * exatamente o texto que o Claude Code executa. Rodar o script por outro
 * caminho não provaria o registro.
 */
export function comandoRegistrado(produto: string, script: string): string {
  const s = JSON.parse(readFileSync(join(produto, ".claude", "settings.json"), "utf8")) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
  };
  const achados = Object.values(s.hooks ?? {})
    .flat()
    .flatMap((g) => g.hooks ?? [])
    .map((h) => h.command ?? "")
    .filter((c) => c.includes(script));
  const unicos = [...new Set(achados)];
  if (unicos.length !== 1) throw new Error(`${script}: ${String(unicos.length)} comandos registrados`);
  return unicos[0] as string;
}

/**
 * Roda um hook instalado, pelo comando registrado, com um payload do Claude Code
 * no stdin. O payload vai em UTF-8, que é o que o harness entrega: hook que corta
 * texto precisa receber os mesmos bytes que receberia em uso.
 */
export function rodarHookComPayload(
  produto: string,
  script: string,
  payload: unknown,
  path: string = pathDosHooks(),
): SpawnSyncReturns<string> {
  return spawnSync(bashDosHooks(), ["-c", comandoRegistrado(produto, script)], {
    cwd: produto,
    input: Buffer.from(JSON.stringify(payload), "utf8"),
    encoding: "utf8",
    env: ambienteCom(path, { CLAUDE_PROJECT_DIR: produto }),
    timeout: 60000,
  });
}

/** Roda um hook instalado, pelo comando registrado, com o payload PreToolUse de um comando Bash. */
export function rodarHook(produto: string, script: string, comando: string): SpawnSyncReturns<string> {
  return rodarHookComPayload(produto, script, {
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: comando },
    cwd: produto,
  });
}
