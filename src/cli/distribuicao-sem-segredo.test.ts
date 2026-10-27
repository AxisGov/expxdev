import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ambienteCom,
  arvore,
  bashDosHooks,
  fontesCandidatas,
  larIsolado,
  novoProduto,
  pathControlado,
  rodarExpx,
  sha256,
  temporarios,
} from "../teste/candidatos.js";

/**
 * O que o `init` instala vai para o commit do projeto, e o pre-push da MergeX
 * (DM-279) varre o que o push publica. Na 0.12.5, exemplos fictícios do texto da
 * MergeX e a suíte de teste dos hooks barraram o push do commit que instalava a
 * versão no katosmv/login. Aqui o `init` real (o binário do `dist/`) monta SprintX
 * e MergeX dos candidatos fixados. Cada arquivo que o lock registra é conferido
 * contra o hash, e cada arquivo que a instalação deixou — `.claude/`,
 * `.expx/marketplace/` e `.expx/hooks.json`, inclusive o que o lock não registra
 * (núcleo, manifestos do plugin, `hooks.json` consolidado) — é varrido INTEIRO com
 * a tabela de segredo da MergeX instalada (mais estrito que o pre-push, que olha só
 * as linhas adicionadas). A distribuição completa, com as nove skills
 * no `main`, passa pelo mesmo crivo no portão da release
 * (`scripts/ci/test-distribuicao-sem-segredo.sh`).
 */

let produto = "";
let arquivos: Record<string, string> = {};
/** Tudo o que a instalação deixou nas pastas dela, relativo ao produto. */
let instalados: string[] = [];
const TABELA = ".claude/skills/mergex/scripts/segredo-tabela.sh";

/** Os achados da tabela instalada, arquivo por arquivo; vazio quando não há nenhum. */
function varre(caminhos: readonly string[]): string {
  const script = [
    '. "$1"',
    'while IFS= read -r f; do',
    '  [ -f "$f" ] && [ -r "$f" ] || { printf "== %s\\n  - ilegivel\\n" "$f"; continue; }',
    '  ALVO="$(cat "$f")"; segredo_varrer',
    '  [ -z "$ACHADOS" ] || printf "== %s\\n%s" "$f" "$ACHADOS"',
    "done",
  ].join("\n");
  const r = spawnSync(bashDosHooks(), ["-c", script, "varre", join(produto, TABELA)], {
    input: caminhos.join("\n") + "\n",
    encoding: "utf8",
  });
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

beforeAll(() => {
  const fontes = fontesCandidatas();
  const { env } = larIsolado();
  produto = novoProduto();
  const r = rodarExpx(
    ["init", "--skills", "sprintx,mergex", "--yes"],
    produto,
    ambienteCom(pathControlado(true), { ...env, EXPX_SKILLS_LOCAIS: fontes }),
  );
  expect(r.status, r.stderr).toBe(0);
  const lock = JSON.parse(readFileSync(join(produto, ".expx", "expx-lock.json"), "utf8")) as {
    instalacao: { arquivos: Record<string, string> };
  };
  arquivos = lock.instalacao.arquivos;
  instalados = [
    ...arvore(join(produto, ".claude")).map((r) => `.claude/${r}`),
    ...arvore(join(produto, ".expx", "marketplace")).map((r) => `.expx/marketplace/${r}`),
    ...(existsSync(join(produto, ".expx", "hooks.json")) ? [".expx/hooks.json"] : []),
  ];
}, 600000);

afterAll(() => {
  temporarios.descartar();
});

describe("a distribuição instalada passa pela varredura de segredo da MergeX", () => {
  it("integração: o lock registra as duas cópias, e cada arquivo tem o hash registrado", () => {
    const caminhos = Object.keys(arquivos);
    expect(caminhos.some((c) => c.startsWith(".claude/skills/mergex/"))).toBe(true);
    expect(caminhos.some((c) => c.startsWith(".expx/marketplace/"))).toBe(true);
    for (const [rel, hash] of Object.entries(arquivos)) {
      expect(sha256(join(produto, ...rel.split("/"))), rel).toBe(hash);
    }
  });

  it("funcional: a varredura acusa segredo real e arquivo ausente, e deixa passar placeholder", () => {
    const dir = temporarios.novo("expx-varre-");
    const real = join(dir, "real.txt");
    const ph = join(dir, "ph.txt");
    writeFileSync(real, `DB=postgres://app:${["s3nh4", "real", "Qx9"].join("-")}@db/x\n`);
    writeFileSync(ph, "DB=postgres://app:<senha>@db/x\npassword: \"<senha>\"\n");
    expect(varre([real])).toContain("credencial em URL");
    expect(varre([join(dir, "nao-existe.txt")])).toContain("ilegivel");
    expect(varre([ph])).toBe("");
  });

  it("integração: a árvore instalada contém o lock e mais o que ele não registra", () => {
    for (const rel of Object.keys(arquivos)) expect(instalados, rel).toContain(rel);
    expect(instalados.some((r) => r.startsWith(".expx/marketplace/plugins/expx/nucleo/"))).toBe(true);
  });

  it("funcional: nenhum arquivo instalado tem achado, varrido inteiro", () => {
    expect(varre(instalados.map((rel) => join(produto, ...rel.split("/"))))).toBe("");
  });

  it("funcional: a suíte de teste dos hooks não chega ao projeto", () => {
    const suite = instalados.filter((c) => /(^|\/)hooks\/(teste\.sh$|testes\/)/.test(c));
    expect(suite).toEqual([]);
  });
});
