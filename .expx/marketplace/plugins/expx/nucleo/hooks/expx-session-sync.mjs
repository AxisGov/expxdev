import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const AXIS_REPOSITORIO = "https://github.com/AxisGov/expxdev.git";
const CACHE_OWNER = "AxisGov/expxdev\n";

const comandoPadrao = (arquivo, argumentos, opcoes = {}) =>
  execFileSync(arquivo, argumentos, {
    ...opcoes,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function cachePadrao(ambiente) {
  if (ambiente.EXPX_AXIS_CACHE !== undefined) return ambiente.EXPX_AXIS_CACHE;
  const base = ambiente.XDG_CACHE_HOME ?? join(ambiente.HOME ?? homedir(), ".cache");
  return join(base, "axisgov", "expxdev");
}

export function construirComandoNpm(argumentos, plataforma = process.platform, ambiente = process.env) {
  if (plataforma === "win32") {
    return { arquivo: ambiente.ComSpec || "cmd.exe", argumentos: ["/d", "/s", "/c", "npm", ...argumentos] };
  }
  return { arquivo: "npm", argumentos: [...argumentos] };
}

function executarNpm(cache, argumentos, executar) {
  const comando = construirComandoNpm(argumentos);
  executar(comando.arquivo, comando.argumentos, { cwd: cache });
}

function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const LOCK_STALE_MS = 60_000;
const CACHE_METADATA = new Set([".axis-cache-owner", ".axis-build-sha"]);

function cacheEstaSujo(cache, executar) {
  const status = executar("git", ["-C", cache, "status", "--porcelain"]);
  return status.split("\n").some((linha) => {
    if (linha.trim() === "") return false;
    return !CACHE_METADATA.has(linha.slice(3).trim());
  });
}

/** A trava pertence a alguém: dono vivo ou, sem dono legível, criada há pouco. */
function travaOcupada(trava) {
  let idade;
  try {
    idade = Date.now() - statSync(trava).mtimeMs;
  } catch {
    return true;
  }
  try {
    return processoVivo(JSON.parse(readFileSync(join(trava, "owner.json"), "utf8")).pid);
  } catch {
    return idade < LOCK_STALE_MS;
  }
}

function removerSemFalhar(caminho) {
  try {
    rmSync(caminho, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // no Windows o arquivo pode estar em uso; o dono morto a libera depois
  }
}

/**
 * A trava nasce inteira: a pasta é montada ao lado, com o dono dentro, e entra no
 * lugar por `rename`. Não há instante em que ela exista sem dono, nem trava parcial
 * quando a gravação falha. Devolve false se o nome já estava ocupado.
 *
 * Limite assumido na transição: um hook de antes da 0.12.12 parado entre o `mkdir` e
 * a gravação do dono ainda pode dividir a trava com este. A janela é mínima, o pior
 * caso é um build repetido ou que falha no cache, que se reconstrói na sessão seguinte.
 */
function criarTrava(trava, gravar) {
  if (existsSync(trava)) return false;
  const montagem = `${trava}.novo-${process.pid}-${randomBytes(4).toString("hex")}`;
  mkdirSync(montagem);
  try {
    gravar(join(montagem, "owner.json"), JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
    renameSync(montagem, trava);
    return true;
  } catch (erro) {
    removerSemFalhar(montagem);
    // No Windows o rename sobre pasta existente devolve EPERM: sem a trava, o erro é outro.
    if (existsSync(trava)) return false;
    throw erro;
  }
}

/** Só um processo limpa a recuperação abandonada: dois apagariam a que outro acabou de criar. */
function limparRecuperacao(recuperacao, gravar) {
  const limpeza = `${recuperacao}.limpeza`;
  if (!criarTrava(limpeza, gravar)) {
    if (!travaOcupada(limpeza)) removerSemFalhar(limpeza);
    return;
  }
  try {
    if (!travaOcupada(recuperacao)) removerSemFalhar(recuperacao);
  } finally {
    removerSemFalhar(limpeza);
  }
}

/**
 * Só quem detém `<trava>.recuperacao` remove uma trava velha, e decide isso já com
 * ela nas mãos: enquanto a velha existe, ninguém cria a nova, e dois processos não
 * veem a mesma trava velha para um apagar a que o outro acabou de criar. Recuperação
 * de dono morto sai aqui, e quem a retoma é a sessão seguinte. Dono vivo nunca sai,
 * mesmo parado: é a idade que abriria a corrida de novo.
 */
function recuperarTrava(trava, gravar) {
  const recuperacao = `${trava}.recuperacao`;
  if (!criarTrava(recuperacao, gravar)) {
    limparRecuperacao(recuperacao, gravar);
    throw new Error("bootstrap em andamento");
  }
  try {
    if (travaOcupada(trava)) throw new Error("bootstrap em andamento");
    rmSync(trava, { recursive: true, force: true });
    if (!criarTrava(trava, gravar)) throw new Error("bootstrap em andamento");
  } finally {
    removerSemFalhar(recuperacao);
  }
}

export function adquirirLock(trava, gravar = writeFileSync) {
  if (!criarTrava(trava, gravar)) recuperarTrava(trava, gravar);
}

/** Soma de `dist/`: caminhos em ordem e bytes, para valer igual em toda máquina. */
function somaDoDist(cache) {
  const soma = createHash("sha256");
  const visitar = (pasta, prefixo) => {
    const entradas = readdirSync(pasta, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entrada of entradas) {
      const relativo = `${prefixo}${entrada.name}`;
      if (entrada.isDirectory()) {
        visitar(join(pasta, entrada.name), `${relativo}/`);
      } else {
        soma.update(`${relativo}\0`);
        soma.update(readFileSync(join(pasta, entrada.name)));
        soma.update("\0");
      }
    }
  };
  if (existsSync(join(cache, "dist"))) visitar(join(cache, "dist"), "");
  return soma.digest("hex");
}

/** O commit do build e a soma do `dist/`, que o Git não versiona. */
export function marcadorDoBuild(cache, commit) {
  return `${commit} ${somaDoDist(cache)}`;
}

function buildCache(cache, executar) {
  executarNpm(cache, ["ci"], executar);
  executarNpm(cache, ["run", "build:server"], executar);
  const commit = executar("git", ["-C", cache, "rev-parse", "HEAD"]).trim();
  writeFileSync(join(cache, ".axis-build-sha"), `${marcadorDoBuild(cache, commit)}\n`);
}

/** `v1.2.3` → [1,2,3]. Pré-lançamento e qualquer outro nome não são release. */
function partesDaRelease(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim());
  return m === null ? undefined : [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** As tags de release, da maior para a menor, comparadas número a número (`v0.10.0` vence `v0.9.9`). */
function releasesEmOrdem(tags) {
  return tags
    .map((tag) => ({ tag: tag.trim(), p: partesDaRelease(tag) }))
    .filter((r) => r.p !== undefined)
    .sort((a, b) => b.p[0] - a.p[0] || b.p[1] - a.p[1] || b.p[2] - a.p[2])
    .map((r) => r.tag);
}

/** A maior tag de release, comparada número a número. */
export function maiorRelease(tags) {
  return releasesEmOrdem(tags)[0];
}

/**
 * O commit da última release do ExpxDev, no cache. O CLI que o SessionStart roda
 * é o da release, nunca a ponta da main: é a release que certifica os commits
 * das skills, e o que está na main ainda não foi liberado. Só vale a tag cujo
 * commit está na main revisada: o `fetch --tags` traz também a tag de um commit
 * que nunca entrou nela (CodeAnt no expxdev#111).
 */
function commitDaRelease(cache, executar) {
  for (const tag of releasesEmOrdem(executar("git", ["-C", cache, "tag", "--list"]).split("\n"))) {
    const commit = executar("git", ["-C", cache, "rev-parse", `${tag}^{commit}`]).trim();
    try {
      executar("git", ["-C", cache, "merge-base", "--is-ancestor", commit, "origin/main"]);
      return commit;
    } catch {
      // tag fora da main: a próxima
    }
  }
  throw new Error("nenhuma release do expxdev na main do cache Axis");
}

function clonarCache(cache, executar) {
  const temporario = `${cache}.tmp-${process.pid}`;
  rmSync(temporario, { recursive: true, force: true });
  try {
    executar("git", ["clone", "--branch", "main", "--single-branch", AXIS_REPOSITORIO, temporario]);
    executar("git", ["-C", temporario, "reset", "--hard", commitDaRelease(temporario, executar)]);
    writeFileSync(join(temporario, ".axis-cache-owner"), CACHE_OWNER);
    buildCache(temporario, executar);
    renameSync(temporario, cache);
  } catch (erro) {
    rmSync(temporario, { recursive: true, force: true });
    throw erro;
  }
}

export function bootstrapAxis(cache, executar = comandoPadrao) {
  const bloqueio = `${cache}.lock`;
  mkdirSync(dirname(cache), { recursive: true });
  adquirirLock(bloqueio);
  const existiaAntes = existsSync(cache);

  try {
    if (!existiaAntes) {
      clonarCache(cache, executar);
      return cache;
    }

    if (!existsSync(join(cache, ".git"))) {
      const ownership = join(cache, ".axis-cache-owner");
      if (!existsSync(ownership) || readFileSync(ownership, "utf8") !== CACHE_OWNER) {
        throw new Error("caminho de cache existente nao e um cache Axis gerenciado");
      }
      rmSync(cache, { recursive: true, force: true });
      clonarCache(cache, executar);
      return cache;
    }
    const remoto = executar("git", ["-C", cache, "remote", "get-url", "origin"]).trim();
    if (remoto !== AXIS_REPOSITORIO) throw new Error("cache nao aponta para AxisGov/expxdev");
    executar("git", ["-C", cache, "fetch", "--tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
    const local = executar("git", ["-C", cache, "rev-parse", "HEAD"]).trim();
    const alvo = commitDaRelease(cache, executar);
    let marcador = "";
    try {
      marcador = readFileSync(join(cache, ".axis-build-sha"), "utf8").trim();
    } catch {
      // marcador ausente: o cache precisa ser reconstruido
    }
    if (local !== alvo || !existsSync(join(cache, "dist", "cli", "expx-bin.js")) || marcador !== marcadorDoBuild(cache, local)) {
      if (cacheEstaSujo(cache, executar)) {
        throw new Error("cache Axis possui alteracoes nao commitadas");
      }
      const branch = executar("git", ["-C", cache, "branch", "--show-current"]).trim();
      if (branch !== "main") throw new Error("cache Axis nao esta na branch main");
      // O HEAD tem de estar publicado na main: commit só local no cache não se perde.
      // A release pode estar atrás do HEAD (cache de antes, que seguia a main).
      const remotoMain = executar("git", ["-C", cache, "rev-parse", "origin/main"]).trim();
      if (local !== remotoMain) {
        try {
          executar("git", ["-C", cache, "merge-base", "--is-ancestor", local, remotoMain]);
        } catch {
          throw new Error("cache Axis possui commits locais");
        }
      }
      executar("git", ["-C", cache, "reset", "--hard", alvo]);
      buildCache(cache, executar);
    }
    return cache;
  } catch (erro) {
    if (!existiaAntes) rmSync(cache, { recursive: true, force: true });
    throw erro;
  } finally {
    rmSync(bloqueio, { recursive: true, force: true });
  }
}

function resposta(contexto) {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: contexto,
    },
  })}\n`;
}

function arvoreSuja(raiz, executar) {
  return executar("git", ["-C", raiz, "status", "--porcelain"]).trim() !== "";
}

function raizGit(cwd, executar) {
  return executar("git", ["-C", cwd, "rev-parse", "--show-toplevel"]).trim();
}

/**
 * O próprio repositório do CLI. Ele não se atualiza sozinho, porque o `update`
 * sujaria a `main` a cada release, nem registra o plugin no escopo do usuário,
 * que é único e pertence aos projetos consumidores. Um fork que mantenha os dois
 * campos também cai aqui, e isso é aceitável: ele também não deve fazer nenhum
 * dos dois. Leitura falha conta como projeto comum.
 */
export function ehRepositorioFonte(raiz) {
  try {
    const pacote = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
    const url = typeof pacote?.repository === "string" ? pacote.repository : pacote?.repository?.url;
    return pacote?.name === "expxdev" && typeof url === "string" && url.replace(/^git\+/, "") === AXIS_REPOSITORIO;
  } catch {
    return false;
  }
}

/**
 * Origem local no lock: o sinal durável que `copiarLocal` grava no commit —
 * `<sha>-local`, ou `local` quando a fonte não tem git. O caminho do
 * repositório não decide nada.
 */
export function origemLocal(commit) {
  return commit === "local" || commit.endsWith("-local");
}

/**
 * Lê do disco, sem rede e sem o CLI Axis, o que o lock diz sobre a origem de
 * cada skill (D-03). Quem decide se o projeto está congelado é o próprio
 * projeto — nunca um executável vindo de AxisGov/main.
 *
 * Nunca lança: um lock que não prova, skill por skill, um commit legível é
 * inválido, e inválido não autoriza atualização automática.
 */
export function lerOrigemDoLock(caminho) {
  const invalido = (motivo) => ({ ok: false, motivo });
  let lock;
  try {
    lock = JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return invalido("lock ilegivel");
  }
  if (!Number.isInteger(lock?.lock_version) || typeof lock?.cli_version !== "string" || lock.cli_version === "" || !Array.isArray(lock?.harness) || lock.harness.some((h) => typeof h !== "string")) {
    return invalido("lock sem versao ou harness");
  }
  const skills = lock.skills;
  if (skills === null || typeof skills !== "object" || Array.isArray(skills)) {
    return invalido("lock sem mapa de skills");
  }
  const locais = [];
  for (const [nome, skill] of Object.entries(skills)) {
    const commit = skill?.commit;
    if (typeof commit !== "string" || commit === "") return invalido(`lock sem commit legivel para ${nome}`);
    const { repositorio, referencia, travado, resolvido_em: resolvido, arquivos } = skill;
    const textos = [repositorio, referencia, resolvido].every((v) => typeof v === "string" && v !== "");
    const mapa = arquivos !== null && typeof arquivos === "object" && !Array.isArray(arquivos) && Object.values(arquivos).every((v) => typeof v === "string");
    if (!textos || typeof travado !== "boolean" || !mapa) {
      return invalido(`lock fora de forma para ${nome}`);
    }
    if (origemLocal(commit)) locais.push(nome);
  }
  return { ok: true, locais };
}

function houveAtualizacao(saida) {
  return saida.includes("para desfazer esta atualizacao");
}

function nomesAtualizados(saida) {
  return [...saida.matchAll(/^([a-z0-9-]+): .*→/gm)].map(([, nome]) => nome).filter(Boolean);
}

export function sincronizarSessao({ entrada, plataforma = "claude", raiz, cwd, ambiente = process.env, executar = comandoPadrao }) {
  try {
    const evento = JSON.parse(entrada);
    const fontes = ["startup", "resume"];
    if (!fontes.includes(evento?.source)) return "";
    const base = plataforma === "codex" ? (cwd ?? evento?.cwd ?? process.cwd()) : (raiz ?? ambiente.CLAUDE_PROJECT_DIR ?? process.cwd());
    if (plataforma === "claude" && !existsSync(join(base, ".expx", "expx-lock.json"))) return "";
      let projeto;
      try {
        projeto = raizGit(base, executar);
      } catch {
        return "";
      }
    if (ehRepositorioFonte(projeto)) return "";
    const caminhoLock = join(projeto, ".expx", "expx-lock.json");
    if (!existsSync(caminhoLock)) return "";
    // D-03: o lock é lido antes de status, cache Axis, rede ou update. Lock
    // inválido ou com origem local encerra aqui, sem tocar o projeto.
    const origem = lerOrigemDoLock(caminhoLock);
    if (!origem.ok) {
      return resposta(`[Expx/Axis] Sincronizacao adiada: ${origem.motivo}; nenhuma atualizacao automatica aplicada.`);
    }
    if (origem.locais.length > 0) {
      return resposta(
        `[Expx/Axis] Sincronizacao automatica nao aplicada: instalacao contem origem local travada pelo lock (${origem.locais.join(", ")}). Use \`expx update\` explicitamente para alterar a distribuicao.`,
      );
    }
    if (arvoreSuja(projeto, executar)) {
      return resposta("[Expx/Axis] Atualizacao automatica adiada porque o working tree possui alteracoes nao commitadas.");
    }
    const cache = bootstrapAxis(cachePadrao(ambiente), executar);
    const saida = executar(process.execPath, [join(cache, "dist", "cli", "expx-bin.js"), "update", "--yes"], { cwd: projeto });
    if (houveAtualizacao(saida)) {
      const nomes = nomesAtualizados(saida);
      const detalhe = nomes.length > 0 ? ` Skills atualizadas: ${nomes.join(", ")}.` : "";
      return resposta(`[Expx/Axis] Distribuicao sincronizada com AxisGov.${detalhe}`);
    }
    return "";
  } catch (erro) {
    return resposta(`[Expx/Axis] Sincronizacao adiada: ${erro instanceof Error ? erro.message : "falha inesperada"}`);
  }
}

if (process.argv[1]?.endsWith("expx-session-sync.mjs") === true) {
  let entrada = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (parte) => { entrada += parte; });
  const plataforma = process.argv.includes("--codex") ? "codex" : "claude";
  process.stdin.on("end", () => process.stdout.write(sincronizarSessao({ entrada, plataforma })));
}