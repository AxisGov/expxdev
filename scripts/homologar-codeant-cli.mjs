#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FONTE = "src/utils/reviewApiHelper.js";
const USO = "uso: node scripts/homologar-codeant-cli.mjs --versao <v> --integridade <sha512-…> --git-head <sha> [--tarball <arquivo>] [--packument <arquivo>] [--saida <dir>]";

class Falha extends Error {
  constructor(mensagem, codigo = 1) {
    super(mensagem);
    this.codigo = codigo;
  }
}

function falha(mensagem) {
  throw new Falha(mensagem, 1);
}

function argumentos(lista) {
  const permitidos = new Set(["versao", "integridade", "git-head", "tarball", "packument", "saida"]);
  const op = {};
  if (lista.length % 2 !== 0) throw new Falha(USO, 2);
  for (let i = 0; i < lista.length; i += 2) {
    const chave = lista[i]?.match(/^--(.+)$/)?.[1];
    const valor = lista[i + 1];
    if (!chave || !permitidos.has(chave) || !valor || Object.hasOwn(op, chave)) throw new Falha(USO, 2);
    op[chave] = valor;
  }
  for (const chave of ["versao", "integridade", "git-head"]) if (!op[chave]) throw new Falha(USO, 2);
  if ((op.tarball === undefined) !== (op.packument === undefined)) {
    throw new Falha("--tarball e --packument precisam ser usados juntos\n" + USO, 2);
  }
  return op;
}

async function baixarJson(url) {
  const resposta = await fetch(url, { headers: { accept: "application/json" } });
  if (!resposta.ok) falha(`não foi possível baixar ${url}: HTTP ${resposta.status}`);
  return resposta.json();
}

async function baixarBytes(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) falha(`não foi possível baixar ${url}: HTTP ${resposta.status}`);
  return Buffer.from(await resposta.arrayBuffer());
}

function validarPackument(packument, op) {
  const divergencias = [];
  if (packument?.version !== op.versao) divergencias.push("version");
  if (packument?.gitHead !== op["git-head"]) divergencias.push("gitHead");
  if (packument?.dist?.integrity !== op.integridade) divergencias.push("dist.integrity");
  if (divergencias.length > 0) falha(`packument diverge em: ${divergencias.join(", ")}`);
  if (typeof packument?.dist?.tarball !== "string" && op.tarball === undefined) falha("packument sem dist.tarball");
}

function conferirSha512(bytes, esperada) {
  if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(esperada)) falha("integridade precisa usar sha512 em base64");
  const real = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  if (real !== esperada) falha(`integridade do tarball difere: esperado ${esperada}, obtido ${real}`);
}

function valorInteiro(fonte, nome) {
  const trecho = fonte.match(new RegExp(`(?:const|let|var)\\s+${nome}\\s*=\\s*([0-9]+(?:\\s*\\*\\s*[0-9]+)*)\\s*;`))?.[1];
  if (!trecho) falha(`fonte não reconhecida (${nome}); homologue à mão`);
  const fatores = trecho.split("*").map((parte) => Number(parte.trim()));
  if (fatores.some((n) => !Number.isSafeInteger(n) || n <= 0)) falha(`fonte não reconhecida (${nome}); homologue à mão`);
  return fatores.reduce((total, n) => total * n, 1);
}

function desescaparTexto(corpo, aspas) {
  let saida = "";
  for (let i = 0; i < corpo.length; i += 1) {
    if (corpo[i] !== "\\") {
      saida += corpo[i];
      continue;
    }
    const proximo = corpo[++i];
    if (proximo === undefined) falha("fonte não reconhecida (texto incompleto); homologue à mão");
    const simples = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"' };
    if (Object.hasOwn(simples, proximo)) saida += simples[proximo];
    else falha(`fonte não reconhecida (escape \\${proximo} em ${aspas}); homologue à mão`);
  }
  return saida;
}

function listaDe(fonte, nome) {
  const corpo = fonte.match(new RegExp(`(?:const|let|var)\\s+${nome}\\s*=\\s*(?:new\\s+Set\\s*\\(\\s*)?\\[([\\s\\S]*?)\\]\\s*\\)?\\s*;`))?.[1];
  if (corpo === undefined) falha(`fonte não reconhecida (${nome}); homologue à mão`);
  const valores = [];
  const regex = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  let casamento;
  while ((casamento = regex.exec(corpo)) !== null) valores.push(desescaparTexto(casamento[2], casamento[1]));
  if (valores.length === 0) falha(`fonte não reconhecida (${nome} vazio); homologue à mão`);
  return valores;
}

function sufixosDe(fonte) {
  const valores = [];
  const regex = /\.endsWith\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;
  let casamento;
  while ((casamento = regex.exec(fonte)) !== null) valores.push(desescaparTexto(casamento[2], casamento[1]));
  if (valores.length === 0) falha("fonte não reconhecida (endsWith); homologue à mão");
  return [...new Set(valores)];
}

function conferirPredicado(fonte) {
  const exigidos = [
    /(?:const|let|var)\s+basename\s*=\s*path\.basename\s*\(\s*filePath\s*\)/,
    /EXCLUDED_FILENAMES\.has\s*\(\s*basename\s*\)/,
    /(?:const|let|var)\s+ext\s*=\s*path\.extname\s*\(\s*basename\s*\)\.toLowerCase\s*\(\s*\)/,
    /EXCLUDED_EXTENSIONS\.has\s*\(\s*ext\s*\)/,
    /basename\.endsWith\s*\(/,
  ];
  if (exigidos.some((regex) => !regex.test(fonte))) falha("fonte não reconhecida (isReviewableFile); homologue à mão");
  if (!fonte.includes("too large (") || !fonte.includes("-file limit")) {
    falha("fonte não reconhecida (motivos de pulo); homologue à mão");
  }
}

function arquivosRegulares(raiz) {
  const saida = [];
  const fila = [raiz];
  while (fila.length > 0) {
    const pasta = fila.shift();
    for (const nome of readdirSync(pasta).sort()) {
      const caminho = join(pasta, nome);
      const estado = lstatSync(caminho);
      if (estado.isDirectory()) fila.push(caminho);
      else if (estado.isFile()) saida.push(caminho);
    }
  }
  return saida.sort((a, b) => a.localeCompare(b));
}

function manifestoDe(pacote) {
  return Object.fromEntries(arquivosRegulares(pacote).map((caminho) => [
    relative(pacote, caminho).split(sep).join("/"),
    createHash("sha256").update(readFileSync(caminho)).digest("hex"),
  ]));
}

async function executar() {
  const op = argumentos(process.argv.slice(2));
  const temporario = mkdtempSync(join(tmpdir(), "expx-homologacao-"));
  try {
    const packument = op.packument === undefined
      ? await baixarJson(`https://registry.npmjs.org/codeant-cli/${encodeURIComponent(op.versao)}`)
      : JSON.parse(readFileSync(resolve(op.packument), "utf8"));
    validarPackument(packument, op);

    const bytes = op.tarball === undefined
      ? await baixarBytes(packument.dist.tarball)
      : readFileSync(resolve(op.tarball));
    conferirSha512(bytes, op.integridade);
    const tarball = join(temporario, "pacote.tgz");
    writeFileSync(tarball, bytes);

    const extraido = join(temporario, "extraido");
    mkdirSync(extraido);
    const tar = spawnSync("tar", ["-xzf", tarball, "-C", extraido], { encoding: "utf8" });
    if (tar.status !== 0) falha(`não foi possível extrair o tarball: ${String(tar.stderr).trim()}`);
    const pacote = join(extraido, "package");
    const packageJson = JSON.parse(readFileSync(join(pacote, "package.json"), "utf8"));
    if (packageJson?.name !== "codeant-cli" || packageJson?.version !== op.versao || !(typeof packageJson?.bin === "string" || typeof packageJson?.bin === "object")) {
      falha("package.json do tarball não identifica o codeant-cli homologado");
    }

    const fonte = readFileSync(join(pacote, ...FONTE.split("/")), "utf8");
    conferirPredicado(fonte);
    const maxFiles = valorInteiro(fonte, "MAX_REVIEW_FILES");
    const maxLinhas = valorInteiro(fonte, "MAX_FILE_LINES");
    const maxBytes = valorInteiro(fonte, "MAX_FILE_SIZE_BYTES");
    const nomes = listaDe(fonte, "EXCLUDED_FILENAMES");
    const extensoes = listaDe(fonte, "EXCLUDED_EXTENSIONS");
    const sufixos = sufixosDe(fonte);

    const perfil = {
      perfil: "codeant-cli",
      versao: op.versao,
      integridade: op.integridade,
      git_head: op["git-head"],
      fonte: FONTE,
      max_files: maxFiles,
      max_linhas: maxLinhas,
      max_bytes: maxBytes,
      excluidos: { nomes, extensoes, sufixos },
      motivos: {
        exatos: ["binary/generated", "deleted", "excluded by pattern", `exceeded ${maxFiles}-file limit`],
        padroes: [
          `^too large \\([0-9]+ KB, max ${maxBytes / 1024} KB\\)$`,
          `^too large \\([0-9]+ lines, max ${maxLinhas}\\)$`,
        ],
      },
      package_json: { name: packageJson.name, version: packageJson.version, bin: packageJson.bin },
      manifesto: manifestoDe(pacote),
    };
    const saida = resolve(op.saida ?? fileURLToPath(new URL("../nucleo/scripts/perfis/", import.meta.url)));
    mkdirSync(saida, { recursive: true });
    const destino = join(saida, `codeant-cli-${op.versao}.json`);
    writeFileSync(destino, `${JSON.stringify(perfil, null, 2)}\n`);
    process.stdout.write(`${destino}\n`);
  } finally {
    rmSync(temporario, { recursive: true, force: true });
  }
}

executar().catch((erro) => {
  const codigo = erro instanceof Falha ? erro.codigo : 1;
  process.stderr.write(`homologar-codeant-cli: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exit(codigo);
});
