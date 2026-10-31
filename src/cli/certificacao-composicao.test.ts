import { afterAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGO } from "../nucleo/catalogo.js";
import { ambienteCom, larIsolado, novoProduto, pathControlado, rodarExpx, temporarios } from "../teste/candidatos.js";

type Json = Record<string, any>;

function json(caminho: string): Json {
  return JSON.parse(readFileSync(caminho, "utf8")) as Json;
}

/** Os comandos de hook do settings, em ordem estável, por evento. */
function hooks(projeto: string): Record<string, string[]> {
  const settings = json(join(projeto, ".claude", "settings.json"));
  const saida: Record<string, string[]> = {};
  for (const [evento, grupos] of Object.entries((settings["hooks"] ?? {}) as Record<string, any[]>)) {
    saida[evento] = grupos.flatMap((g) => g.hooks.map((h: Json) => JSON.stringify({ matcher: g.matcher, ...h }))).sort();
  }
  return saida;
}

function resumo(projeto: string): { arquivos: Json; skills: Record<string, Json>; hooks: Record<string, string[]> } {
  const lock = json(join(projeto, ".expx", "expx-lock.json"));
  const skills: Record<string, Json> = {};
  for (const [nome, s] of Object.entries(lock["skills"] as Record<string, Json>)) {
    skills[nome] = { ...s, resolvido_em: "" };
  }
  return { arquivos: lock["instalacao"]["arquivos"], skills, hooks: hooks(projeto) };
}

afterAll(() => {
  temporarios.descartar();
});

/**
 * O expxdev não instala SprintX e runx na própria árvore: cada uma passa do limite de 100
 * arquivos por PR. A composição das duas se prova aqui, em projeto temporário: as duas
 * ordens dão o mesmo resultado, e reinstalar não muda nada. Busca os certificados na rede,
 * como a certificação da runx, e fica fora do Windows: são quatro instalações num job de 15 min.
 */
describe("composição SprintX e runx", () => {
  it.skipIf(process.platform === "win32")("integração: as duas ordens compõem o mesmo lock e o mesmo settings", () => {
    const isolado = larIsolado();
    const env = ambienteCom(pathControlado(true), isolado.env);
    const rodar = (args: string[], cwd: string): void => {
      const r = rodarExpx(args, cwd, env);
      expect(r.status, `${args.join(" ")}\n${r.stdout}\n${r.stderr}`).toBe(0);
    };

    const juntas = novoProduto("expx-composicao-juntas-");
    rodar(["init", "--skills", "sprintx,runx", "--harness", "claude", "--yes"], juntas);

    const emSequencia = novoProduto("expx-composicao-sequencia-");
    rodar(["init", "--skills", "runx", "--harness", "claude", "--yes"], emSequencia);
    rodar(["add", "sprintx"], emSequencia);

    const a = resumo(juntas);
    const b = resumo(emSequencia);
    expect(b.skills).toEqual(a.skills);
    expect(b.arquivos).toEqual(a.arquivos);
    expect(b.hooks).toEqual(a.hooks);

    for (const nome of ["sprintx", "runx"]) {
      expect(a.skills[nome]?.["commit"], nome).toBe(CATALOGO.find((s) => s.nome === nome)?.certificado);
    }
    // As duas de fato: uma composição vazia passaria nas comparações acima.
    const caminhos = Object.keys(a.arquivos as Record<string, string>);
    for (const nome of ["sprintx", "runx"]) {
      expect(caminhos.filter((c) => c.startsWith(`.claude/hooks/${nome}/`)).length, nome).toBeGreaterThan(0);
      expect(existsSync(join(juntas, ".claude", "skills", nome, "SKILL.md")), nome).toBe(true);
    }
    // A SprintX liga os hooks no settings; a runx, no hooks.json do plugin.
    expect(Object.values(a.hooks).flat().join("\n")).toContain(".claude/hooks/sprintx/");
    expect(readFileSync(join(juntas, ".expx", "marketplace", "plugins", "expx", "hooks", "hooks.json"), "utf8")).toContain("runx/");
    for (const caminho of caminhos) {
      expect(existsSync(join(juntas, caminho)), caminho).toBe(true);
      expect(existsSync(join(emSequencia, caminho)), caminho).toBe(true);
    }
    // O doctor pede o rastro ignorado, e isso é do projeto, não da instalação.
    writeFileSync(join(juntas, ".gitignore"), "docs/eventos/\n");
    const doctor = rodarExpx(["doctor"], juntas, env);
    expect(doctor.status, doctor.stdout).toBe(0);
    expect(doctor.stdout).toContain("nenhum problema encontrado");

    rodar(["init", "--skills", "sprintx,runx", "--harness", "claude", "--yes"], juntas);
    expect(resumo(juntas)).toEqual(a);
  }, 600000);
});
