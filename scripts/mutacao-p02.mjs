#!/usr/bin/env node
// Mutações da certificação P0.2 (contrato expx-instalacao).
//
//   node scripts/mutacao-p02.mjs            todas
//   node scripts/mutacao-p02.mjs 3 9 15     só estas
//
// Copia a árvore de trabalho (arquivos rastreados e não ignorados) para uma
// pasta temporária, roda o CONTROLE (sem mutação: a bancada tem de passar) e,
// para cada mutante, aplica substituições exatas — cada trecho tem de ocorrer
// UMA vez —, recompila e roda a bancada. O mutante tem de MORRER (bancada
// falha). Mutante que não compila é inválido, não "morto": o runner para.
//
// A bancada é a do P0.2: init real com SprintX+MergeX, colisões artificiais,
// recomposição pelo lock. Precisa de git, jq e bash no PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BANCADA = ["src/cli/certificacao-p02.test.ts", "src/cli/composicao-p02.test.ts", "src/harness/composicao.test.ts"];

const INIT = "src/cli/init.ts";
const PLANO = "src/plugin/plano.ts";
const HOOKS = "src/harness/hooks.ts";
const MODOS = "src/harness/modos.ts";
const COMPOSICAO = "src/harness/composicao.ts";

const MUTANTES = [
  {
    id: 1,
    nome: "volta o last-wins (a ultima skill vence a colisao)",
    trocas: [[PLANO, "const primeiro = ordenada[0] as Artefato;\n    if (ordenada.some(", "const primeiro = ordenada[ordenada.length - 1] as Artefato;\n    if (false && ordenada.some("]],
  },
  {
    id: 2,
    nome: "nao instala os hooks das skills",
    trocas: [[HOOKS, "if (s.arvoreHooks !== undefined && existsSync(s.arvoreHooks)) {\n      saida.push(...artefatosDaArvore(s.arvoreHooks,", "if (false) {\n      saida.push(...artefatosDaArvore(s.arvoreHooks as string,"]],
  },
  {
    id: 3,
    nome: "ignora o settings de uma skill (mergex)",
    trocas: [[INIT, "if (s.settings === undefined) continue;", 'if (s.settings === undefined || s.nome === "mergex") continue;']],
  },
  {
    id: 4,
    nome: "ignora o hooks.json de uma skill (sprintx)",
    trocas: [[INIT, "if (sk.modos === undefined) continue;", 'if (sk.modos === undefined || sk.nome === "sprintx") continue;']],
  },
  {
    id: 5,
    nome: "colisao com bytes diferentes passa",
    trocas: [[PLANO, "if (ordenada.some((a) => a.hash !== primeiro.hash || a.destino !== primeiro.destino)) {", "if (ordenada.some(() => false)) {"]],
  },
  {
    id: 6,
    nome: "a ordem das skills muda o resultado",
    trocas: [[PLANO, "  return a < b ? -1 : 1;\n}", "  return 0;\n}"]],
  },
  {
    id: 7,
    nome: "o lock ignora os hooks",
    trocas: [[INIT, "...plano.projeto.map((a) => [a.destino, a.hash] as const),", '...plano.projeto.filter((a) => a.tipo !== "hook").map((a) => [a.destino, a.hash] as const),']],
  },
  {
    id: 8,
    nome: "o lock ignora o catalogo de metodo",
    trocas: [[INIT, "...plano.projeto.map((a) => [a.destino, a.hash] as const),", '...plano.projeto.filter((a) => !a.destino.endsWith("catalogo-de-metodo.sh")).map((a) => [a.destino, a.hash] as const),']],
  },
  {
    id: 9,
    nome: "jq ausente permite a instalacao",
    trocas: [[INIT, 'verificarRuntime(["git", "jq"], op.ambiente ?? process.env)', "verificarRuntime([], op.ambiente ?? process.env)"]],
  },
  {
    id: 10,
    nome: "falha depois de comecar a escrever (copia antes de validar)",
    trocas: [
      [INIT, 'import { existsSync, readFileSync, rmSync, statSync } from "node:fs";', 'import { cpSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";'],
      [INIT, "  // PLANEJAR e VALIDAR: nenhuma escrita no projeto até aqui.\n", '  for (const s of montaveis) if (s.arvoreHooks !== undefined) cpSync(s.arvoreHooks, join(op.raiz, ".claude", "hooks"), { recursive: true });\n'],
    ],
  },
  {
    id: 11,
    nome: "mesmo id incompativel escolhe o ultimo",
    trocas: [[MODOS, "} else if (jsonCanonico(ja) !== jsonCanonico(cfg)) {\n        conflitos.push(", "} else if (jsonCanonico(ja) !== jsonCanonico(cfg)) {\n        publicados[id] = cfg;\n      } else if (false) {\n        conflitos.push("]],
  },
  {
    id: 12,
    nome: "init repetido duplica hook",
    trocas: [
      [COMPOSICAO, "  if (anteriores.length === 0) return hooks;", "  if (anteriores.length >= 0) return hooks;"],
      [COMPOSICAO, "const ja = doArquivo.get(identidade(e.evento, e.matcher, e.hook));", "const ja = undefined as { matcher?: string; hook: Record<string, unknown> } | undefined;"],
    ],
  },
  {
    id: 13,
    nome: "o hook do nucleo e perdido",
    trocas: [[HOOKS, "if (existsSync(sync)) saida.push(", "if (existsSync(sync) && false) saida.push("]],
  },
  {
    id: 14,
    nome: "um git-perigoso sobrescreve o outro (id sem namespace)",
    trocas: [[MODOS, "    for (const [id, cfg] of Object.entries(modos)) {\n      const ja = publicados[id];", '    for (const [idBruto, cfg] of Object.entries(modos)) {\n      const id = idBruto.replace(/^[a-z]+\\//, "");\n      const ja = publicados[id];\n      if (ja !== undefined) { publicados[id] = cfg; continue; }']],
  },
  {
    id: 15,
    nome: "o install.sh destrutivo da skill roda no fluxo oficial",
    trocas: [
      [INIT, 'import { existsSync, readFileSync, rmSync, statSync } from "node:fs";', 'import { existsSync, readFileSync, rmSync, statSync } from "node:fs";\nimport { spawnSync } from "node:child_process";'],
      [INIT, "    temporarios.push(busca.caminho);\n", '    temporarios.push(busca.caminho);\n    if (existsSync(join(busca.caminho, "install.sh"))) spawnSync("bash", [join(busca.caminho, "install.sh")], { cwd: op.raiz });\n'],
    ],
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
  return r.status === 0 ? undefined : `${r.stdout}${r.stderr}`;
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

const raiz = mkdtempSync(join(tmpdir(), "expx-mutacao-p02-"));
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
