import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { projetoTemporario, type ProjetoTemporario } from "../teste/projeto-temporario.js";
import { executarInit } from "../cli/init.js";
import { diagnosticar } from "./verificadores.js";

/**
 * O `doctor` e a integridade final (CONTRATO-expx-orquestracao §12.1, F3c): a
 * verificação que deu `divergente` ou `ausente` invalida o veredito do aprovador,
 * e o rastro que não está ignorado entra na foto que a integridade compara.
 */

// hermético: `FATIA_*` do shell de quem roda não vazam para os casos
for (const k of Object.keys(process.env)) if (k.startsWith("FATIA_")) delete process.env[k];
let p: ProjetoTemporario | undefined;
const repos: string[] = [];
afterEach(() => {
  p?.descartar();
  p = undefined;
  for (const r of repos.splice(0)) rmSync(r, { recursive: true, force: true });
});

async function projeto(): Promise<ProjetoTemporario> {
  const repo = criarRepoSkill({ nome: "sprintx", tags: ["v1.0.0"] });
  repos.push(repo);
  const t = projetoTemporario("fixtures/cli/projeto-limpo");
  await executarInit({ raiz: t.raiz, skills: ["sprintx"], harness: ["claude"], origens: { sprintx: repo } });
  const r = spawnSync("git", ["init", "-q", "-b", "main"], { cwd: t.raiz, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return t;
}

function linha(evento: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ts: "2026-10-27T12:00:00Z",
    expx_eventos: 1,
    trabalho_id: "F-1",
    ferramenta: "runx",
    origem: "hook",
    evento,
    fase: null,
    task: null,
    agente: "qa",
    resultado: "ok",
    detalhe: "x",
    arquivos: [],
    ...extra,
  });
}

const verificada = (estado: string, diferencas: string[] = []) =>
  linha("integridade_final_verificada", { resultado: estado === "igual" ? "ok" : "falha", integridade_final: { estado, diferencas } });

function rastro(raiz: string, linhas: string[]): void {
  mkdirSync(join(raiz, "docs", "eventos"), { recursive: true });
  writeFileSync(join(raiz, "docs", "eventos", "F-1.jsonl"), linhas.join("\n") + "\n");
}

const ids = (raiz: string) => diagnosticar(raiz, {}).achados.map((a) => a.id);

describe("doctor: integridade final", () => {
  it("funcional: verificação divergente ou ausente é aviso integridade-final-invalida, com a contagem", async () => {
    p = await projeto();
    writeFileSync(join(p.raiz, ".gitignore"), "docs/eventos/\n");
    rastro(p.raiz, [verificada("igual"), verificada("divergente", ["status", "arvore"]), verificada("ausente"), linha("agente_concluido")]);
    const d = diagnosticar(p.raiz, {});
    const invalida = d.achados.filter((a) => a.id === "integridade-final-invalida");
    expect(invalida).toHaveLength(1);
    expect(invalida[0]?.severidade).toBe("aviso");
    expect(invalida[0]?.problema).toContain("2 de 3");
    expect(invalida[0]?.problema).toContain("F-1.jsonl");
    expect(d.achados.map((a) => a.id)).not.toContain("rastro-fora-do-contrato");
    expect(d.achados.map((a) => a.id)).not.toContain("rastro-chave-nao-declarada");
  });

  it("funcional: só igual, ou linha antiga sem a chave, não avisa", async () => {
    p = await projeto();
    writeFileSync(join(p.raiz, ".gitignore"), "docs/eventos/\n");
    rastro(p.raiz, [verificada("igual"), linha("agente_concluido")]);
    expect(ids(p.raiz)).not.toContain("integridade-final-invalida");
  });

  it("funcional: com o hook da integridade instalado, rastro não ignorado é aviso rastro-nao-ignorado", async () => {
    p = await projeto();
    mkdirSync(join(p.raiz, ".claude", "hooks"), { recursive: true });
    writeFileSync(join(p.raiz, ".claude", "hooks", "expx-integridade-final.sh"), "#!/usr/bin/env bash\n");
    expect(ids(p.raiz)).toContain("rastro-nao-ignorado");
    writeFileSync(join(p.raiz, ".gitignore"), "docs/eventos/\n");
    expect(ids(p.raiz)).not.toContain("rastro-nao-ignorado");
  });

  it("funcional: rastro já versionado avisa mesmo com o .gitignore certo — o arquivo rastreado continua mudando o status", async () => {
    p = await projeto();
    mkdirSync(join(p.raiz, ".claude", "hooks"), { recursive: true });
    writeFileSync(join(p.raiz, ".claude", "hooks", "expx-integridade-final.sh"), "#!/usr/bin/env bash\n");
    rastro(p.raiz, [linha("agente_concluido")]);
    const add = spawnSync("git", ["add", "-f", "docs/eventos/F-1.jsonl"], { cwd: p.raiz, encoding: "utf8" });
    expect(add.status, add.stderr).toBe(0);
    writeFileSync(join(p.raiz, ".gitignore"), "docs/eventos/\n");
    const achado = diagnosticar(p.raiz, {}).achados.find((a) => a.id === "rastro-nao-ignorado");
    expect(achado?.problema).toContain("docs/eventos/F-1.jsonl");
  });

  it("funcional: GIT_DIR e GIT_WORK_TREE herdados do shell não desviam a sonda para outro repositório", async () => {
    p = await projeto();
    mkdirSync(join(p.raiz, ".claude", "hooks"), { recursive: true });
    writeFileSync(join(p.raiz, ".claude", "hooks", "expx-integridade-final.sh"), "#!/usr/bin/env bash\n");
    // outro repositório, em que docs/eventos/ está ignorado: a sonda nele diria "tudo certo"
    const outro = projetoTemporario();
    try {
      spawnSync("git", ["init", "-q", "-b", "main"], { cwd: outro.raiz });
      writeFileSync(join(outro.raiz, ".gitignore"), "docs/eventos/\n");
      const antes = { dir: process.env["GIT_DIR"], arvore: process.env["GIT_WORK_TREE"] };
      process.env["GIT_DIR"] = join(outro.raiz, ".git");
      process.env["GIT_WORK_TREE"] = outro.raiz;
      try {
        expect(ids(p.raiz)).toContain("rastro-nao-ignorado");
      } finally {
        if (antes.dir === undefined) delete process.env["GIT_DIR"];
        else process.env["GIT_DIR"] = antes.dir;
        if (antes.arvore === undefined) delete process.env["GIT_WORK_TREE"];
        else process.env["GIT_WORK_TREE"] = antes.arvore;
      }
    } finally {
      outro.descartar();
    }
  });

  it("funcional: sem o hook da integridade, ou fora de um repositório git, não avisa rastro-nao-ignorado", async () => {
    p = await projeto();
    expect(ids(p.raiz)).not.toContain("rastro-nao-ignorado");
    rmSync(join(p.raiz, ".git"), { recursive: true, force: true });
    mkdirSync(join(p.raiz, ".claude", "hooks"), { recursive: true });
    writeFileSync(join(p.raiz, ".claude", "hooks", "expx-integridade-final.sh"), "#!/usr/bin/env bash\n");
    expect(ids(p.raiz)).not.toContain("rastro-nao-ignorado");
  });
});
