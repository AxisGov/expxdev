// Regras fixas da emenda "limites do CodeAnt, fixos" (2026-10-19), cópia do expxdev: as exclusões
// da revisão e os `FATIA_*` reservados. Só `node:`; nada é lido do ambiente além do que se passa.

/** Artefatos de método: fora da revisão sempre, sem se declarar no `.expx/fatiamento.json`. */
import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, posix, resolve } from "node:path";

export const EXCLUIDOS_DO_NUCLEO = Object.freeze(["^docs/sprintx/", "^docs/entregas/", "^docs/eventos/"]);
/** Primeiro segmento que é código-fonte: `excluir_da_revisao` nunca começa nele (regra 5 da §5). */
export const RAIZES_DE_CODIGO = Object.freeze(["src", "lib", "app", "apps", "packages", "pkg", "cmd", "internal", "server",
  "client", "web", "api", "test", "tests", "spec", "scripts", ".github", ".claude", ".opencode", ".expx"]);
/** Segmento posterior que libera a raiz de código (`^scripts/ci/fixtures/candidatos/`). */
export const PASTAS_GERADAS = Object.freeze(["fixtures", "snapshots", "__snapshots__", "generated", "gerado"]);

// Pasta literal: `^`, um ou mais segmentos terminados em `/`. No segmento, qualquer caractere menos
// `/`, controle e os metacaracteres de regex; o ponto só escrito `\.`.
const SEGMENTO = /(?:[^/\p{Cc}\\^$.|?*+()[\]{}]|\\\.)+\//uy;

/** Os segmentos já desescapados, ou `null` fora da gramática. */
function segmentos(padrao) {
  if (typeof padrao !== "string" || !padrao.startsWith("^") || padrao.length < 2) return null;
  const lista = [];
  for (let i = 1; i < padrao.length;) {
    SEGMENTO.lastIndex = i;
    const s = SEGMENTO.exec(padrao);
    if (!s) return null;
    const literal = s[0].slice(0, -1).replace(/\\\./g, ".");
    if (literal === "." || literal === "..") return null;
    lista.push(literal);
    i += s[0].length;
  }
  return lista;
}

/** O prefixo literal que o padrão exclui (`^a\.b/` → `a.b/`), ou `null` fora da gramática. */
export function prefixoDe(padrao) {
  const s = segmentos(padrao);
  return s === null ? null : s.map((x) => `${x}/`).join("");
}

/** Algum padrão é começo do caminho. Quem aplica usa o prefixo, nunca regex. */
export function excluido(caminho, padroes) {
  return padroes.some((p) => {
    const prefixo = prefixoDe(p);
    return prefixo !== null && caminho.startsWith(prefixo);
  });
}

/** Começa numa raiz de código e nenhum segmento posterior é pasta gerada. Fora da gramática: `false`. */
export function ehRaizDeCodigo(padrao) {
  const s = segmentos(padrao);
  if (s === null || !RAIZES_DE_CODIGO.includes(s[0])) return false;
  return !s.slice(1).some((x) => PASTAS_GERADAS.includes(x));
}

/** Nomes com prefixo `FATIA_` definidos no ambiente (vazio conta), ordenados. */
export function fatiaNoAmbiente(env) {
  return Object.keys(env).filter((k) => k.startsWith("FATIA_") && env[k] !== undefined).sort();
}

/** `FATIA_*` são reservados para sempre: nenhum limite nem exclusão vem do ambiente. */
const DIRETORIO_PERFIS = new URL("./perfis/", import.meta.url);
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const erroPerfil = (arquivo, campo, motivo) => { throw new Error(`perfil ${arquivo}: ${campo} ${motivo}`); };
const objeto = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

function objetoExato(v, arquivo, campo, chaves) {
  if (!objeto(v)) erroPerfil(arquivo, campo, "deve ser objeto");
  for (const chave of chaves) if (!Object.hasOwn(v, chave)) erroPerfil(arquivo, `${campo}.${chave}`, "obrigatorio");
  for (const chave of Object.keys(v)) if (!chaves.includes(chave)) erroPerfil(arquivo, `${campo}.${chave}`, "desconhecido");
  return v;
}

function texto(v, arquivo, campo, padrao) {
  if (typeof v !== "string" || v === "" || (padrao && !padrao.test(v))) erroPerfil(arquivo, campo, "invalido");
  return v;
}

function inteiro(v, arquivo, campo) {
  if (!Number.isSafeInteger(v) || v <= 0) erroPerfil(arquivo, campo, "deve ser inteiro positivo");
  return v;
}

function lista(v, arquivo, campo, validar) {
  if (!Array.isArray(v)) erroPerfil(arquivo, campo, "deve ser lista");
  const vistos = new Set();
  v.forEach((item, i) => {
    validar(item, `${campo}[${i}]`);
    if (vistos.has(item)) erroPerfil(arquivo, `${campo}[${i}]`, "duplicado");
    vistos.add(item);
  });
  return v;
}

function lerJson(arquivo) {
  try { return JSON.parse(readFileSync(new URL(arquivo, DIRETORIO_PERFIS), "utf8")); }
  catch (e) { erroPerfil(arquivo, "JSON", `invalido (${e.message})`); }
}

function compararSemver(a, b) {
  const pa = SEMVER.exec(a), pb = SEMVER.exec(b);
  for (let i = 1; i <= 3; i += 1) {
    const diferenca = Number(pa[i]) - Number(pb[i]);
    if (diferenca !== 0) return diferenca;
  }
  const preA = pa[4]?.split("."), preB = pb[4]?.split(".");
  if (!preA || !preB) return preA ? -1 : preB ? 1 : 0;
  for (let i = 0; i < Math.max(preA.length, preB.length); i += 1) {
    if (preA[i] === undefined || preB[i] === undefined) return preA[i] === undefined ? -1 : 1;
    if (preA[i] === preB[i]) continue;
    const numA = /^[0-9]+$/.test(preA[i]), numB = /^[0-9]+$/.test(preB[i]);
    if (numA && numB) return Number(preA[i]) - Number(preB[i]);
    if (numA !== numB) return numA ? -1 : 1;
    return preA[i].localeCompare(preB[i]);
  }
  return 0;
}

function caminhoDeManifesto(v, arquivo) {
  texto(v, arquivo, `manifesto.${v}`);
  const partes = v.split("/");
  if (v.includes("\\") || posix.isAbsolute(v) || /^[A-Za-z]:\//.test(v) || posix.normalize(v) !== v
    || partes.some((parte) => parte === "" || parte === "." || parte === "..")) {
    erroPerfil(arquivo, `manifesto.${v}`, "deve ser caminho POSIX relativo normalizado");
  }
}

function validarPerfilCli(arquivo, esperado) {
  const p = objetoExato(lerJson(arquivo), arquivo, "raiz", ["perfil", "versao", "integridade", "git_head", "fonte", "max_files",
    "max_linhas", "max_bytes", "excluidos", "motivos", "package_json", "manifesto"]);
  if (p.perfil !== "codeant-cli") erroPerfil(arquivo, "perfil", "deve ser codeant-cli");
  texto(p.versao, arquivo, "versao", SEMVER);
  if (p.versao !== esperado) erroPerfil(arquivo, "versao", `difere do nome do arquivo (${esperado})`);
  texto(p.integridade, arquivo, "integridade", /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  texto(p.git_head, arquivo, "git_head", /^[0-9a-f]{40}$/);
  texto(p.fonte, arquivo, "fonte");
  inteiro(p.max_files, arquivo, "max_files");
  inteiro(p.max_linhas, arquivo, "max_linhas");
  inteiro(p.max_bytes, arquivo, "max_bytes");
  const excluidos = objetoExato(p.excluidos, arquivo, "excluidos", ["nomes", "extensoes", "sufixos"]);
  lista(excluidos.nomes, arquivo, "excluidos.nomes", (v, c) => texto(v, arquivo, c));
  lista(excluidos.extensoes, arquivo, "excluidos.extensoes", (v, c) => {
    texto(v, arquivo, c); if (!v.startsWith(".") || v !== v.toLowerCase()) erroPerfil(arquivo, c, "deve ser extensao minuscula iniciada por ponto");
  });
  lista(excluidos.sufixos, arquivo, "excluidos.sufixos", (v, c) => {
    texto(v, arquivo, c); if (!v.startsWith(".")) erroPerfil(arquivo, c, "deve iniciar por ponto");
  });
  const motivos = objetoExato(p.motivos, arquivo, "motivos", ["exatos", "padroes"]);
  lista(motivos.exatos, arquivo, "motivos.exatos", (v, c) => texto(v, arquivo, c));
  lista(motivos.padroes, arquivo, "motivos.padroes", (v, c) => {
    texto(v, arquivo, c); try { new RegExp(v); } catch (e) { erroPerfil(arquivo, c, `regex invalida (${e.message})`); }
  });
  const pacote = objetoExato(p.package_json, arquivo, "package_json", ["name", "version", "bin"]);
  texto(pacote.name, arquivo, "package_json.name");
  if (pacote.name !== "codeant-cli") erroPerfil(arquivo, "package_json.name", "deve ser codeant-cli");
  texto(pacote.version, arquivo, "package_json.version");
  if (pacote.version !== p.versao) erroPerfil(arquivo, "package_json.version", "difere de versao");
  const bin = objetoExato(pacote.bin, arquivo, "package_json.bin", ["codeant"]);
  texto(bin.codeant, arquivo, "package_json.bin.codeant");
  if (!objeto(p.manifesto) || Object.keys(p.manifesto).length === 0) erroPerfil(arquivo, "manifesto", "deve ser objeto nao vazio");
  for (const [caminho, sha] of Object.entries(p.manifesto)) {
    caminhoDeManifesto(caminho, arquivo);
    texto(sha, arquivo, `manifesto.${caminho}`, /^[0-9a-f]{64}$/);
  }
  return p;
}

function validarPerfilApp() {
  const arquivo = "codeant-app.json";
  const p = objetoExato(lerJson(arquivo), arquivo, "raiz", ["perfil", "max_arquivos_pr", "conta", "fontes"]);
  if (p.perfil !== "codeant-app") erroPerfil(arquivo, "perfil", "deve ser codeant-app");
  inteiro(p.max_arquivos_pr, arquivo, "max_arquivos_pr");
  texto(p.conta, arquivo, "conta");
  lista(p.fontes, arquivo, "fontes", (v, c) => texto(v, arquivo, c));
  if (p.fontes.length === 0) erroPerfil(arquivo, "fontes", "deve ser lista nao vazia");
  return p;
}

const VERSOES = readdirSync(DIRETORIO_PERFIS).map((nome) => /^codeant-cli-(.+)\.json$/.exec(nome)).filter(Boolean)
  .map((m) => m[1]);
for (const versao of VERSOES) if (!SEMVER.test(versao)) erroPerfil(`codeant-cli-${versao}.json`, "versao", "deve ser SemVer");
VERSOES.sort(compararSemver);
if (VERSOES.length === 0) erroPerfil("perfis", "codeant-cli", "ausente");
const PERFIS_CLI = new Map(VERSOES.map((versao) => [versao, validarPerfilCli(`codeant-cli-${versao}.json`, versao)]));
const PERFIL_APP = validarPerfilApp();

export function homologadas() { return [...VERSOES]; }
export function perfilCli(versao) { return PERFIS_CLI.get(versao); }
export function perfilApp() { return PERFIL_APP; }

const decisoes = (p) => JSON.stringify({ max_files: p.max_files, max_linhas: p.max_linhas, max_bytes: p.max_bytes,
  excluidos: p.excluidos, motivos: p.motivos });

export function limites() {
  const perfis = [...PERFIS_CLI.values()];
  const referencia = decisoes(perfis[0]);
  for (const p of perfis.slice(1)) if (decisoes(p) !== referencia) erroPerfil(`codeant-cli-${p.versao}.json`, "limites", "divergem das outras versoes homologadas");
  const atual = perfis.at(-1);
  return { perfil_cli: `codeant-cli@${atual.versao}`, l1_arquivos: atual.max_files, l2_linhas: atual.max_linhas,
    l2_bytes: atual.max_bytes, l3_arquivos: PERFIL_APP.max_arquivos_pr };
}

export function revisavel(caminho, perfil) {
  const nome = posix.basename(caminho);
  if (perfil.excluidos.nomes.includes(nome)) return false;
  if (perfil.excluidos.extensoes.includes(posix.extname(nome).toLowerCase())) return false;
  return !perfil.excluidos.sufixos.some((sufixo) => nome.endsWith(sufixo));
}

export function medir(conteudo) {
  if (!Buffer.isBuffer(conteudo)) throw new TypeError("medir: conteudo deve ser Buffer");
  const textoDecodificado = conteudo.toString("utf8");
  return { linhas: textoDecodificado.split("\n").length, bytes: Buffer.byteLength(textoDecodificado, "utf8") };
}

export function motivoAceito(motivo, perfil) {
  return perfil.motivos.exatos.includes(motivo) || perfil.motivos.padroes.some((padrao) => new RegExp(padrao).test(motivo));
}

const ehArquivo = (f) => { try { return statSync(f).isFile(); } catch { return false; } };
const executavel = (f) => { try { accessSync(f, constants.X_OK); return true; } catch { return false; } };
// o alvo do shim do npm (cmd-shim): `"%dp0%\node_modules\codeant-cli\src\index.js"` ou `"$basedir/node_modules/codeant-cli/src/index.js"`
const ALVO_DO_SHIM = /node_modules[\\/]codeant-cli[\\/]([^"'\s%]+)/;
const ehShim = (f, plataforma) => (plataforma === "win32" && [".cmd", ".bat"].includes(extname(f).toLowerCase()))
  || /^#![^\n]*\bsh\b/.test(readFileSync(f, "latin1").slice(0, 200));

/** O `codeant` que o shell rodaria: o primeiro do `PATH` (no Windows, com cada extensão do `PATHEXT`, como o `cmd.exe`). */
function noPath(env, plataforma) {
  const win = plataforma === "win32";
  const valor = (nome) => Object.entries(env).find(([k]) => (win ? k.toUpperCase() === nome : k === nome))?.[1];
  const exts = win ? (valor("PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const d of (valor("PATH") ?? "").split(win ? ";" : ":").filter(Boolean)) {
    for (const e of exts) {
      const f = join(d, `codeant${e}`);
      if (ehArquivo(f) && (win || executavel(f))) return f;
    }
  }
}

/**
 * O pacote `codeant-cli` do `codeant` do `PATH`: segue o link, lê o shim do npm, sobe até o `package.json`
 * de nome `codeant-cli` e exige que o `bin` dele seja o arquivo resolvido. Nada roda aqui.
 */
export function localizarPacote(env, plataforma) {
  const achado = noPath(env, plataforma);
  if (!achado) return { ok: false, motivo: "cli-ausente", detalhe: "codeant fora do PATH" };
  const falha = (detalhe) => ({ ok: false, motivo: "integridade", detalhe });
  try {
    let alvo = realpathSync(achado);
    if (ehShim(alvo, plataforma)) {
      const m = ALVO_DO_SHIM.exec(readFileSync(alvo, "utf8"));
      if (!m) return falha(`executavel que nao e o shim do pacote: ${achado}`);
      // o shim `.cmd` separa por `\`: os segmentos são juntados pelo separador do sistema que roda
      alvo = realpathSync(join(dirname(alvo), "node_modules", "codeant-cli", ...m[1].split(/[\\/]/)));
    }
    for (let d = dirname(alvo); ; d = dirname(d)) {
      const pj = join(d, "package.json");
      if (ehArquivo(pj)) {
        const pkg = JSON.parse(readFileSync(pj, "utf8"));
        if (pkg?.name === "codeant-cli") {
          const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.codeant;
          if (typeof bin !== "string") return falha(`package.json sem bin: ${pj}`);
          const declarado = resolve(d, bin);
          const mesmo = plataforma === "win32" ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
          if (!ehArquivo(declarado) || !mesmo(realpathSync(declarado), alvo)) return falha(`bin do pacote nao e o executavel: ${alvo}`);
          if (typeof pkg.version !== "string") return falha(`package.json sem version: ${pj}`);
          return { ok: true, bin: alvo, pacote: d, versao: pkg.version };
        }
      }
      if (dirname(d) === d) return falha(`fora do pacote codeant-cli: ${alvo}`);
    }
  } catch (e) {
    return falha(`nao conferivel: ${e.message}`);
  }
}

/** `null` se o pacote instalado é o do manifesto do perfil; senão o detalhe. `node_modules` não é conferido (emenda, 6). */
export function conferirIntegridade(pacote, perfil) {
  const manifesto = perfil?.manifesto;
  if (!manifesto || typeof manifesto !== "object" || Object.keys(manifesto).length === 0) return "manifesto-ausente";
  for (const [c, sha] of Object.entries(manifesto)) {
    if (c === "package.json") continue;
    let conteudo;
    try { conteudo = readFileSync(join(pacote, ...c.split("/"))); } catch { return `arquivo-ausente:${c}`; }
    if (createHash("sha256").update(conteudo).digest("hex") !== sha) return `arquivo-diferente:${c}`;
  }
  try {
    const pkg = JSON.parse(readFileSync(join(pacote, "package.json"), "utf8"));
    const esperado = perfil.package_json;
    if (pkg.name !== esperado.name || pkg.version !== esperado.version || JSON.stringify(pkg.bin) !== JSON.stringify(esperado.bin)) return "package-json";
  } catch {
    return "package-json";
  }
  return null;
}

export function mensagemFatia(nome) {
  return `\`${nome}\` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente`;
}
