#!/usr/bin/env node
// Mutações da decisão D-03 (SessionStart não atualiza instalação com origem local).
//
//   node scripts/mutacao-d03.mjs            todas
//   node scripts/mutacao-d03.mjs 3 7        só estas
//
// Mesmo método do mutacao-p02.mjs: copia a árvore de trabalho (rastreados e
// não ignorados) para uma pasta temporária, roda o CONTROLE (sem mutação: a
// bancada tem de passar) e, para cada mutante, aplica substituições exatas —
// cada trecho tem de ocorrer UMA vez —, recompila e roda a bancada. O mutante
// tem de MORRER. Mutante que não compila (tsc, ou `node --check` no hook) é
// inválido, não "morto": o runner para.
//
// A bancada é a do D-03: testes unitários do hook, e a certificação com o
// init e o update reais. Precisa de git, jq e bash no PATH; não usa o GitHub.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BANCADA = ["src/nucleo/session-freeze.test.ts", "src/nucleo/session-sync.test.ts", "src/cli/certificacao-d03.test.ts"];

const HOOK = "nucleo/hooks/expx-session-sync.mjs";
const UPDATE = "src/update/flags.ts";

const MUTANTES = [
  {
    id: 1,
    nome: "remove a deteccao de -local",
    trocas: [[HOOK, '  return commit === "local" || commit.endsWith("-local");', "  return false;"]],
  },
  {
    id: 2,
    nome: "verifica so a SprintX",
    trocas: [[HOOK, "    if (origemLocal(commit)) locais.push(nome);", '    if (nome === "sprintx" && origemLocal(commit)) locais.push(nome);']],
  },
  {
    id: 3,
    nome: "mistura local + remota permite update",
    trocas: [[HOOK, "if (origem.locais.length > 0) {", 'if (origem.locais.length > 0 && origem.locais.length === Object.keys(JSON.parse(readFileSync(caminhoLock, "utf8")).skills).length) {']],
  },
  {
    id: 4,
    nome: "local ainda chama bootstrapAxis",
    trocas: [[HOOK, "    if (origem.locais.length > 0) {\n      return resposta(", "    if (origem.locais.length > 0) {\n      bootstrapAxis(cachePadrao(ambiente), executar);\n      return resposta("]],
  },
  {
    id: 5,
    nome: "local ainda chama expx-bin update",
    trocas: [[HOOK, "    if (origem.locais.length > 0) {\n      return resposta(", '    if (origem.locais.length > 0) {\n      executar(process.execPath, [join(cachePadrao(ambiente), "dist", "cli", "expx-bin.js"), "update", "--latest", "--yes"], { cwd: projeto });\n      return resposta(']],
  },
  {
    id: 6,
    nome: "lock invalido permite update",
    trocas: [[HOOK, "  const invalido = (motivo) => ({ ok: false, motivo });", "  const invalido = (motivo) => ({ ok: true, locais: [], motivo });"]],
  },
  {
    id: 7,
    nome: "resume ignora o freeze",
    trocas: [[HOOK, "if (origem.locais.length > 0) {", 'if (origem.locais.length > 0 && evento.source !== "resume") {']],
  },
  {
    id: 8,
    nome: "update manual deixa de funcionar em instalacao local",
    trocas: [
      [
        UPDATE,
        "  const referencias = op.to !== undefined",
        '  if (Object.values(l.lock.skills).some((s) => s.commit.endsWith("-local"))) {\n    return { ok: true, aplicou: false, atualizadas: [], emDia: [], bloqueadas: [], mensagens: ["origem local: nada a fazer"] };\n  }\n  const referencias = op.to !== undefined',
      ],
    ],
  },
  {
    id: 9,
    nome: "o lock e lido depois do git status",
    trocas: [[HOOK, "    const origem = lerOrigemDoLock(caminhoLock);", "    arvoreSuja(projeto, executar);\n    const origem = lerOrigemDoLock(caminhoLock);"]],
  },
];

function copiarArvore(destino) {
  const lista = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter((f) => f !== "");
  for (const f of lista) {
    mkdirSync(dirname(join(destino, f)), { recursive: true });
    try {
      cpSync(join(REPO, f), join(destino, f));
    } catch {
      // removido na árvore de trabalho e ainda listado
    }
  }
  symlinkSync(join(REPO, "node_modules"), join(destino, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}

function compilar(raiz) {
  const r = spawnSync(process.execPath, [join(raiz, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: raiz, encoding: "utf8" });
  if (r.status !== 0) return `${r.stdout}${r.stderr}`;
  const h = spawnSync(process.execPath, ["--check", join(raiz, HOOK)], { encoding: "utf8" });
  return h.status === 0 ? undefined : `${h.stdout}${h.stderr}`;
}

function bancada(raiz) {
  const r = spawnSync(process.execPath, [join(raiz, "node_modules/vitest/vitest.mjs"), "run", "--bail=1", ...BANCADA], {
    cwd: raiz,
    encoding: "utf8",
    timeout: 1800000,
  });
  const resumo = `${r.stdout}${r.stderr}`.split("\n").filter((l) => /(FAIL|Tests |Test Files)/.test(l)).slice(0, 4).join(" | ");
  return { status: r.status, resumo };
}

const pedidos = process.argv.slice(2).map(Number);
const alvos = pedidos.length > 0 ? MUTANTES.filter((m) => pedidos.includes(m.id)) : MUTANTES;

const raiz = mkdtempSync(join(tmpdir(), "expx-mutacao-d03-"));
let falhou = false;
try {
  copiarArvore(raiz);
  const originais = new Map();
  for (const m of MUTANTES) for (const [f] of m.trocas) if (!originais.has(f)) originais.set(f, readFileSync(join(raiz, f), "utf8"));

  const errC = compilar(raiz);
  if (errC !== undefined) throw new Error(`controle nao compila:\n${errC}`);
  const controle = bancada(raiz);
  console.log(`controle: ${controle.status === 0 ? "PASSA" : "FALHA"} — ${controle.resumo}`);
  if (controle.status !== 0) throw new Error("o controle precisa passar");

  for (const m of alvos) {
    for (const [f, texto] of originais) writeFileSync(join(raiz, f), texto);
    for (const [f, de, para] of m.trocas) {
      const atual = readFileSync(join(raiz, f), "utf8");
      const n = atual.split(de).length - 1;
      if (n !== 1) throw new Error(`mutante ${m.id}: trecho ocorre ${n} vez(es) em ${f}`);
      writeFileSync(join(raiz, f), atual.replace(de, para));
    }
    const err = compilar(raiz);
    if (err !== undefined) throw new Error(`mutante ${m.id} nao compila (invalido):\n${err}`);
    const r = bancada(raiz);
    const morreu = r.status !== 0;
    if (!morreu) falhou = true;
    console.log(`mutante ${String(m.id).padStart(2)} ${morreu ? "MORREU  " : "SOBREVIVEU"} — ${m.nome} — ${r.resumo}`);
  }
  for (const [f, texto] of originais) writeFileSync(join(raiz, f), texto);
} finally {
  // o link primeiro, sem recursão: apagar através dele levaria o node_modules real
  try {
    rmSync(join(raiz, "node_modules"));
  } catch {
    // sem link: nada a desfazer
  }
  rmSync(raiz, { recursive: true, force: true });
}
process.exit(falhou ? 1 : 0);
