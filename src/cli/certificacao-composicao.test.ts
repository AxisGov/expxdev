import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CATALOGO } from "../nucleo/catalogo.js";
import { ambienteCom, bashDosHooks, comandoRegistrado, larIsolado, novoProduto, pathControlado, pathDosHooks, rodarExpx, temporarios } from "../teste/candidatos.js";

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

  it.skipIf(process.platform === "win32")("funcional: a ocorrência da runx anda ao lado da SprintX, e a feature continua protegida", () => {
    const isolado = larIsolado();
    const produto = novoProduto("expx-composicao-fluxo-");
    const instalar = rodarExpx(["init", "--skills", "sprintx,runx", "--harness", "claude", "--yes"], produto, ambienteCom(pathControlado(true), isolado.env));
    expect(instalar.status, `${instalar.stdout}\n${instalar.stderr}`).toBe(0);

    const ambiente = ambienteCom(pathDosHooks(), { CLAUDE_PROJECT_DIR: produto, EXPX_SESSAO: "claude@fluxo" });
    const escreve = (rel: string, texto: string): void => {
      mkdirSync(dirname(join(produto, rel)), { recursive: true });
      writeFileSync(join(produto, rel), texto);
    };
    const escopo = (rel: string): { rc: number | null; saida: string } => {
      const payload = { hook_event_name: "PreToolUse", tool_name: "Edit", cwd: produto, tool_input: { file_path: join(produto, rel), old_string: "a", new_string: "b" } };
      const r = spawnSync(bashDosHooks(), ["-c", comandoRegistrado(produto, "sprintx/escopo-da-task.sh")], { cwd: produto, input: JSON.stringify(payload), encoding: "utf8", env: ambiente, timeout: 60000 });
      return { rc: r.status, saida: `${r.stdout}${r.stderr}` };
    };

    const OC = "docs/manutencao/OC-2026-0001-sonda";
    escreve(`${OC}/00-OCORRENCIA.md`, "---\nkind: ocorrencia\ntrabalho_id: OC-2026-0001\nstatus: em_andamento\n---\n");
    escreve(`${OC}/sprint-01/tasks.md`, "---\nkind: tasks\ntrabalho_id: OC-2026-0001\nstatus: em_andamento\ntasks:\n  - id: T-01.01\n    status: em_andamento\n    arquivos:\n      cria: []\n      altera: [infra/a.sh]\n---\n");

    // A linha de rastro vem do escritor real da runx, pelo caminho que o `expx init` instala.
    const rastro = spawnSync("python3", [".claude/hooks/comum/rastro.py", "--evento", "task_iniciada", "--fase", "e3", "--task", "T-01.01"], { cwd: produto, encoding: "utf8", env: ambiente });
    expect(rastro.status, rastro.stderr).toBe(0);
    expect(readFileSync(join(produto, "docs/eventos/OC-2026-0001.jsonl"), "utf8")).toContain("T-01.01");
    // O `.pyc` do framework pararia o fechamento da task na MergeX.
    expect(existsSync(join(produto, ".claude/hooks/comum/__pycache__"))).toBe(false);

    // Os três passos do fluxo: o plano para em andamento, o arquivo da task, o plano para concluída.
    for (const rel of [`${OC}/sprint-01/tasks.md`, "infra/a.sh", `${OC}/sprint-01/tasks.md`]) {
      const r = escopo(rel);
      expect(r.rc, `${rel}: ${r.saida}`).toBe(0);
      expect(r.saida, rel).not.toContain("sessao_ambigua");
    }

    // Feature aberta na mesma árvore: a sessão sem reivindicação da SprintX continua barrada. O leitor
    // da SprintX não vê a linha da runx de propósito (DS-196); se visse, daria plano_corrente_ausente.
    const FEATURE = "docs/sprintx/features/fq";
    escreve(`${FEATURE}/ORQUESTRADOR.md`, "---\nexpx_schema: 1\nexpx_tool: sprintx\nkind: orquestrador\ntrabalho_id: fq\n---\n");
    escreve(`${FEATURE}/sprint-01/tasks.md`, "---\nkind: tasks\ntrabalho_id: fq\nsprint_id: sprint-01\ntasks:\n  - id: T-01.01\n    status: em_andamento\n    arquivos:\n      cria: [src/f.ts]\n      altera: []\n---\n");
    const barrada = escopo("infra/a.sh");
    expect(barrada.rc, barrada.saida).toBe(2);
    expect(barrada.saida).toContain("sessao_ambigua");

    // Com a task da feature reivindicada pelo escritor real da SprintX, ela edita o que é dela,
    // e não o que é da ocorrência, com o hook em bloqueio.
    const reivindica = spawnSync(bashDosHooks(), [".claude/skills/sprintx/scripts/rastro.sh", "task-iniciada", "fq", "T-01.01"], { cwd: produto, encoding: "utf8", env: ambiente });
    expect(reivindica.status, reivindica.stderr).toBe(0);
    writeFileSync(join(produto, ".expx/hooks.json"), JSON.stringify({ hooks: { "escopo-da-task": { modo: "bloqueio" } } }));
    expect(escopo("src/f.ts").rc).toBe(0);
    expect(escopo("infra/a.sh").rc).toBe(2);
    expect(escopo(`${OC}/sprint-01/tasks.md`).rc).toBe(2);
  }, 300000);
});
