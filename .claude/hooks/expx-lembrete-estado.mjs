import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const TTL_EVENTO_MS = 24 * 60 * 60 * 1_000;
const TTL_TRABALHO_MS = 7 * 24 * 60 * 60 * 1_000;
const LIMITE_POR_TIPO = 64;
const ESPERA_LOCK_MS = 50;
const STALE_LOCK_MS = 30_000;
const PREFIXO_TEMPORARIO = ".estado.";

function estadoVazio() {
  return { versao: 1, eventos: [], trabalhos: [] };
}

function dentroDe(base, candidato) {
  const trecho = relative(resolve(base), resolve(candidato));
  return trecho === "" || (!trecho.startsWith(`..${sep}`) && trecho !== ".." && !isAbsolute(trecho));
}

function semSymlink(base, caminho) {
  const trecho = relative(resolve(base), resolve(caminho));
  if (trecho === ".." || trecho.startsWith(`..${sep}`) || isAbsolute(trecho)) return false;
  let atual = realpathSync(resolve(base));
  for (const parte of trecho.split(/[\\/]+/).filter(Boolean)) {
    atual = join(atual, parte);
    try {
      if (lstatSync(atual).isSymbolicLink()) return false;
    } catch (erro) {
      if (erro?.code === "ENOENT") continue;
      return false;
    }
  }
  return true;
}

function prepararDiretorio(base, caminho) {
  try {
    if (!isAbsolute(caminho) || !semSymlink(base, caminho)) return false;
    mkdirSync(caminho, { recursive: true, mode: 0o700 });
    if (!semSymlink(base, caminho) || !lstatSync(caminho).isDirectory()) return false;
    if (process.platform !== "win32") chmodSync(caminho, 0o700);
    return true;
  } catch {
    return false;
  }
}

function principalLocal() {
  try {
    if (typeof process.getuid === "function") return String(process.getuid());
    const identidade = `${userInfo().username}\0${process.env.USERDOMAIN ?? ""}`;
    if (identidade === "\0") return null;
    return createHash("sha256").update(identidade).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

export function selecionarRaizEstado(input = {}, opcoes = {}) {
  const scratchpad = typeof input?.scratchpad_dir === "string" ? input.scratchpad_dir : "";
  if (scratchpad && isAbsolute(scratchpad)) {
    const raizScratchpad = join(resolve(scratchpad), "expx", "lembrete-v1");
    if (dentroDe(scratchpad, raizScratchpad) && prepararDiretorio(scratchpad, raizScratchpad)) return raizScratchpad;
  }

  const principal = opcoes.principal ?? principalLocal();
  const temporario = opcoes.tmpdir ?? tmpdir();
  if (!principal || !isAbsolute(temporario)) return null;
  const seguro = String(principal).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!seguro) return null;
  const raizTemporaria = join(resolve(temporario), `expx-${seguro}`, "lembrete-v1");
  return dentroDe(temporario, raizTemporaria) && prepararDiretorio(temporario, raizTemporaria)
    ? raizTemporaria
    : null;
}

function esperar(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockStaleSeguro(caminho, agora) {
  try {
    const primeiro = lstatSync(caminho);
    if (primeiro.isSymbolicLink() || !primeiro.isDirectory()) return false;
    if (agora - primeiro.mtimeMs <= STALE_LOCK_MS) return false;
    const segundo = lstatSync(caminho);
    if (segundo.isSymbolicLink() || primeiro.dev !== segundo.dev || primeiro.ino !== segundo.ino) return false;
    rmdirSync(caminho);
    return true;
  } catch {
    return false;
  }
}

export function comLock(raiz, acao, opcoes = {}) {
  if (!prepararDiretorio(raiz, raiz)) return { adquirido: false };
  const caminho = join(raiz, "lock");
  if (!dentroDe(raiz, caminho)) return { adquirido: false };
  const inicio = typeof opcoes.agora === "function" ? opcoes.agora() : Date.now();
  let adquirido = false;
  let identidade;

  while (true) {
    try {
      mkdirSync(caminho, { mode: 0o700 });
      identidade = lstatSync(caminho);
      if (identidade.isSymbolicLink() || !identidade.isDirectory()) return { adquirido: false };
      adquirido = true;
      break;
    } catch (erro) {
      if (erro?.code !== "EEXIST") return { adquirido: false };
      const agora = typeof opcoes.agora === "function" ? opcoes.agora() : Date.now();
      if (lockStaleSeguro(caminho, agora)) continue;
      const decorrido = agora - inicio;
      if (decorrido >= ESPERA_LOCK_MS) return { adquirido: false };
      esperar(Math.min(5, ESPERA_LOCK_MS - decorrido));
    }
  }

  try {
    return { adquirido: true, valor: acao() };
  } catch {
    return { adquirido: true, erro: true };
  } finally {
    if (adquirido) {
      try {
        const atual = lstatSync(caminho);
        if (!atual.isSymbolicLink() && atual.dev === identidade.dev && atual.ino === identidade.ino) {
          rmdirSync(caminho);
        }
      } catch {
        // O hook e fail-open; nunca remove um lock que deixou de ser o nosso.
      }
    }
  }
}

function registroValido(item) {
  return item && item.versao === 1 && /^[a-f0-9]{64}$/.test(item.hash)
    && typeof item.skill === "string" && Number.isFinite(item.timestamp)
    && (item.sessao === undefined || /^[a-f0-9]{64}$/.test(item.sessao));
}

function registroSanitizado({ versao, hash, skill, timestamp, sessao }) {
  return sessao === undefined
    ? { versao, hash, skill, timestamp }
    : { versao, hash, skill, timestamp, sessao };
}

function sanitizar(estado) {
  if (!estado || estado.versao !== 1 || !Array.isArray(estado.eventos) || !Array.isArray(estado.trabalhos)) {
    throw new Error("estado invalido");
  }
  return {
    versao: 1,
    eventos: estado.eventos.filter(registroValido).map(registroSanitizado),
    trabalhos: estado.trabalhos.filter(registroValido).map(registroSanitizado),
  };
}

export function lerEstado(raiz) {
  const caminho = join(raiz, "estado.json");
  let descritor;
  try {
    const antes = lstatSync(caminho);
    if (antes.isSymbolicLink() || !antes.isFile()) return { estado: estadoVazio(), hostil: true };
    descritor = openSync(caminho, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const aberto = fstatSync(descritor);
    if (antes.dev !== aberto.dev || antes.ino !== aberto.ino) return { estado: estadoVazio(), hostil: true };
    const original = JSON.parse(readFileSync(descritor, "utf8"));
    const estado = sanitizar(original);
    return { estado, normalizado: JSON.stringify(original) !== JSON.stringify(estado), corrompido: false };
  } catch (erro) {
    if (erro?.code === "ENOENT") return { estado: estadoVazio(), corrompido: false };
    return { estado: estadoVazio(), corrompido: true };
  } finally {
    if (descritor !== undefined) closeSync(descritor);
  }
}

function limitar(itens, ttl, agora) {
  return itens
    .filter(registroValido)
    .filter((item) => agora - item.timestamp <= ttl)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-LIMITE_POR_TIPO);
}

export function podarEstado(estado, agora = Date.now()) {
  return {
    versao: 1,
    eventos: limitar(Array.isArray(estado?.eventos) ? estado.eventos : [], TTL_EVENTO_MS, agora),
    trabalhos: limitar(Array.isArray(estado?.trabalhos) ? estado.trabalhos : [], TTL_TRABALHO_MS, agora),
  };
}

function removerTemporariosStale(raiz, agora) {
  try {
    for (const nome of readdirSync(raiz)) {
      if (!nome.startsWith(PREFIXO_TEMPORARIO)) continue;
      const caminho = join(raiz, nome);
      if (!dentroDe(raiz, caminho)) continue;
      const info = lstatSync(caminho);
      if (!info.isSymbolicLink() && info.isFile() && agora - info.mtimeMs > STALE_LOCK_MS) unlinkSync(caminho);
    }
  } catch {
    // Limpeza oportunista; nao compromete a escrita corrente.
  }
}

export function gravarEstadoAtomico(raiz, estado, opcoes = {}) {
  if (!prepararDiretorio(raiz, raiz)) return false;
  const destino = join(raiz, "estado.json");
  try {
    const atual = lstatSync(destino);
    if (atual.isSymbolicLink() || !atual.isFile()) return false;
  } catch (erro) {
    if (erro?.code !== "ENOENT") return false;
  }

  removerTemporariosStale(raiz, typeof opcoes.agora === "function" ? opcoes.agora() : Date.now());
  const temporario = join(raiz, `${PREFIXO_TEMPORARIO}${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let descritor;
  try {
    descritor = openSync(
      temporario,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descritor, `${JSON.stringify(estado)}\n`, "utf8");
    fsyncSync(descritor);
    closeSync(descritor);
    descritor = undefined;
    renameSync(temporario, destino);
    if (process.platform !== "win32") chmodSync(destino, 0o600);
    return true;
  } catch {
    return false;
  } finally {
    if (descritor !== undefined) {
      try { closeSync(descritor); } catch { /* fail-open */ }
    }
    try {
      const info = lstatSync(temporario);
      if (!info.isSymbolicLink() && info.isFile()) unlinkSync(temporario);
    } catch {
      // O rename bem-sucedido ja removeu o temporario.
    }
  }
}
