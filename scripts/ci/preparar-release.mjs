#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function falha(mensagem) {
  throw new Error(mensagem);
}

function executar(comando, argumentos, opcoes = {}) {
  const resultado = spawnSync(comando, argumentos, {
    cwd: opcoes.cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (resultado.error) falha(`${comando} não iniciou: ${resultado.error.message}`);
  return resultado;
}

function exigirSucesso(comando, argumentos, opcoes = {}) {
  const resultado = executar(comando, argumentos, opcoes);
  if (resultado.status !== 0) {
    falha(`${comando} ${argumentos.join(" ")} falhou (${resultado.status}): ${(resultado.stderr || resultado.stdout).trim()}`);
  }
  return resultado.stdout.trim();
}

function argumentosDaCli(argv) {
  const valores = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const chave = argv[i];
    const valor = argv[i + 1];
    if (!chave?.startsWith("--") || valor === undefined) falha(`argumentos inválidos: ${argv.join(" ")}`);
    valores.set(chave.slice(2), valor);
  }
  for (const obrigatorio of ["repo", "github-repo", "version", "sha", "output"]) {
    if (!valores.has(obrigatorio)) falha(`argumento obrigatório ausente: --${obrigatorio}`);
  }
  return Object.fromEntries(valores);
}

function jsonArquivo(caminho) {
  return JSON.parse(readFileSync(caminho, "utf8"));
}

function versoesDoLock(lock) {
  return [lock.version, lock.packages?.[""]?.version];
}

function sha256(caminho) {
  return createHash("sha256").update(readFileSync(caminho)).digest("hex");
}

function conferirVersoes(repo, versao, sha) {
  const pacote = jsonArquivo(join(repo, "package.json"));
  const lock = jsonArquivo(join(repo, "package-lock.json"));
  const [lockRaiz, lockPacote] = versoesDoLock(lock);
  if (pacote.name !== "expxdev") falha(`pacote inesperado: ${pacote.name}`);
  if (pacote.version !== versao || lockRaiz !== versao || lockPacote !== versao) {
    falha(`versões divergentes: solicitada=${versao} package=${pacote.version} lock=${lockRaiz} lock.packages=${lockPacote}`);
  }

  const pacoteNoSha = JSON.parse(exigirSucesso("git", ["show", `${sha}:package.json`], { cwd: repo }));
  const lockNoSha = JSON.parse(exigirSucesso("git", ["show", `${sha}:package-lock.json`], { cwd: repo }));
  const [lockRaizNoSha, lockPacoteNoSha] = versoesDoLock(lockNoSha);
  if (pacoteNoSha.version !== versao || lockRaizNoSha !== versao || lockPacoteNoSha !== versao) {
    falha(`o SHA ${sha} não contém a versão ${versao} em package.json e package-lock.json`);
  }
}

function conferirTagInedita(repo, versao) {
  const tag = `v${versao}`;
  const local = executar("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: repo });
  if (local.status === 0) falha(`tag local já existe: ${tag}`);
  if (local.status !== 1) falha(`não foi possível consultar a tag local ${tag}`);

  const remota = executar("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], { cwd: repo });
  if (remota.status === 0) falha(`tag remota já existe: ${tag}`);
  if (remota.status !== 2) falha(`não foi possível consultar a tag remota ${tag}: ${remota.stderr.trim()}`);
  return tag;
}

function conferirReleaseInedita(githubRepo, tag) {
  const consulta = executar("gh", ["release", "view", tag, "-R", githubRepo, "--json", "tagName"]);
  if (consulta.status === 0) falha(`GitHub Release já existe: ${tag}`);
  const mensagem = `${consulta.stdout}\n${consulta.stderr}`.toLowerCase();
  if (!mensagem.includes("release not found")) {
    falha(`não foi possível confirmar ausência da release ${tag}: ${mensagem.trim()}`);
  }
}

function conferirChecks(githubRepo, sha) {
  for (const workflow of ["ci.yml", "proveniencia.yml"]) {
    const bruto = exigirSucesso("gh", [
      "run", "list", "-R", githubRepo, "--workflow", workflow,
      "--commit", sha, "--event", "push", "--limit", "20",
      "--json", "status,conclusion,headSha",
    ]);
    let runs;
    try {
      runs = JSON.parse(bruto);
    } catch {
      falha(`resposta inválida ao consultar checks de ${workflow}`);
    }
    const verde = runs.some((run) =>
      run.headSha === sha && run.status === "completed" && run.conclusion === "success",
    );
    if (!verde) falha(`check obrigatório sem execução verde para ${sha}: ${workflow}`);
  }
}

function empacotar(repo, destino, versao) {
  mkdirSync(destino, { recursive: true });
  const bruto = exigirSucesso("npm", ["pack", "--json", "--pack-destination", destino], { cwd: repo });
  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    falha("npm pack não devolveu JSON válido");
  }
  if (!Array.isArray(dados) || dados.length !== 1) falha("npm pack deve produzir exatamente um pacote");
  const item = dados[0];
  const nomeEsperado = `expxdev-${versao}.tgz`;
  if (item.name !== "expxdev" || item.version !== versao || item.filename !== nomeEsperado) {
    falha(`metadata do npm pack diverge: ${JSON.stringify({ name: item.name, version: item.version, filename: item.filename })}`);
  }
  const tgz = join(destino, nomeEsperado);
  if (!existsSync(tgz)) falha(`npm pack não criou ${nomeEsperado}`);
  const metadata = JSON.parse(exigirSucesso("tar", ["-xOf", tgz, "package/package.json"]));
  if (metadata.name !== "expxdev" || metadata.version !== versao) {
    falha(`package.json interno diverge: ${metadata.name}@${metadata.version}`);
  }
  return { tgz, nome: nomeEsperado, hash: sha256(tgz) };
}

function escreverSaidasGithub(valores) {
  const caminho = process.env.GITHUB_OUTPUT;
  if (!caminho) return;
  appendFileSync(caminho, Object.entries(valores).map(([k, v]) => `${k}=${v}\n`).join(""));
}

function main() {
  const opcoes = argumentosDaCli(process.argv.slice(2));
  const repo = resolve(opcoes.repo);
  const saida = resolve(opcoes.output);
  const versao = opcoes.version;
  const sha = opcoes.sha.toLowerCase();
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(versao)) falha(`versão SemVer inválida: ${versao}`);
  if (!/^[0-9a-f]{40}$/.test(sha)) falha(`SHA completo obrigatório: ${opcoes.sha}`);

  const head = exigirSucesso("git", ["rev-parse", "HEAD"], { cwd: repo });
  if (head !== sha) falha(`checkout está em ${head}, não no SHA selecionado ${sha}`);
  const estado = exigirSucesso("git", ["status", "--porcelain"], { cwd: repo });
  if (estado !== "") falha(`working tree não está limpa antes do build: ${estado}`);
  const ancestral = executar("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: repo });
  if (ancestral.status !== 0) falha(`${sha} não pertence a origin/main`);

  conferirVersoes(repo, versao, sha);
  const tag = conferirTagInedita(repo, versao);
  conferirReleaseInedita(opcoes["github-repo"], tag);
  conferirChecks(opcoes["github-repo"], sha);

  if (existsSync(saida) && readdirSync(saida).length !== 0) falha(`diretório de saída não está vazio: ${saida}`);
  mkdirSync(saida, { recursive: true });
  const temporario = mkdtempSync(join(tmpdir(), "expxdev-release-"));
  try {
    const primeiro = empacotar(repo, join(temporario, "a"), versao);
    const segundo = empacotar(repo, join(temporario, "b"), versao);
    if (primeiro.hash !== segundo.hash) {
      falha(`npm pack não determinístico: ${primeiro.hash} != ${segundo.hash}`);
    }
    const destinoTgz = join(saida, primeiro.nome);
    const destinoChecksum = `${destinoTgz}.sha256`;
    if (existsSync(destinoTgz) || existsSync(destinoChecksum)) falha(`artefato de saída já existe: ${primeiro.nome}`);
    copyFileSync(primeiro.tgz, destinoTgz);
    writeFileSync(destinoChecksum, `${primeiro.hash}  ${primeiro.nome}\n`, "utf8");

    const headDepois = exigirSucesso("git", ["rev-parse", "HEAD"], { cwd: repo });
    const estadoDepois = exigirSucesso("git", ["status", "--porcelain"], { cwd: repo });
    if (headDepois !== sha || estadoDepois !== "") falha("checkout mudou durante build/pack");

    escreverSaidasGithub({
      tag,
      sha,
      version: versao,
      tgz: destinoTgz,
      checksum: destinoChecksum,
      sha256: primeiro.hash,
    });
    process.stdout.write(`${JSON.stringify({ tag, sha, version: versao, tgz: destinoTgz, checksum: destinoChecksum, sha256: primeiro.hash })}\n`);
  } finally {
    rmSync(temporario, { recursive: true, force: true });
  }
}

try {
  main();
} catch (erro) {
  process.stderr.write(`preflight de release: ${erro instanceof Error ? erro.message : String(erro)}\n`);
  process.exitCode = 1;
}
