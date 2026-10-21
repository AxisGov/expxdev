import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const HOOK = resolve("nucleo/hooks/expx-lembrete.sh");
const GIT_BASH = "C:/Program Files/Git/bin/bash.exe";
const BASH = process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash";
const temporarios: string[] = [];

type Evento = {
  cwd: string; prompt: string; prompt_id?: string; scratchpad_dir: string;
  session_id?: string; session_title?: string; transcript_path?: string;
};
type Projeto = { raiz: string; scratchpad: string };

function definirTrabalho(raiz: string, trabalho: string, fase: string): void {
  const pasta = join(raiz, ".expx");
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, "estado.json"), JSON.stringify({ trabalho, fase }));
}

function criarProjeto(skills: string[] = ["runx"]): Projeto {
  const raiz = mkdtempSync(join(tmpdir(), "expx-lembrete-projeto-"));
  const scratchpad = mkdtempSync(join(tmpdir(), "expx-lembrete-estado-"));
  temporarios.push(raiz, scratchpad);
  for (const skill of skills) {
    const pasta = join(raiz, ".claude", "skills", skill);
    mkdirSync(pasta, { recursive: true });
    writeFileSync(join(pasta, "SKILL.md"), `# ${skill}\n`);
  }
  definirTrabalho(raiz, "OC-2026-0001", "E1");
  return { raiz, scratchpad };
}

function evento(projeto: Projeto, sobrescritas: Partial<Evento> = {}): Evento {
  return {
    cwd: projeto.raiz,
    prompt: "O sistema nao salva o pedido e retorna erro ao confirmar",
    prompt_id: "prompt-1",
    scratchpad_dir: projeto.scratchpad,
    session_id: "sessao-1",
    transcript_path: join(projeto.raiz, "transcript.jsonl"),
    ...sobrescritas,
  };
}

function executarHookBruto(projeto: Projeto, entrada: Evento, ambiente: NodeJS.ProcessEnv = {}): string {
  const resultado = spawnSync(BASH, [HOOK], {
    cwd: projeto.raiz,
    encoding: "utf8",
    env: { ...process.env, ...ambiente, CLAUDE_PROJECT_DIR: projeto.raiz },
    input: JSON.stringify(entrada),
    timeout: 5_000,
  });
  if (resultado.error || resultado.status !== 0) {
    throw new Error(`harness do hook falhou (status=${resultado.status}): ${resultado.error?.message ?? resultado.stderr}`);
  }
  return resultado.stdout;
}

function executarHook(projeto: Projeto, entrada: Evento, ambiente: NodeJS.ProcessEnv = {}): string | null {
  const saida = executarHookBruto(projeto, entrada, ambiente).trim();
  if (!saida) return null;
  const json = JSON.parse(saida) as { hookSpecificOutput?: { additionalContext?: string } };
  return json.hookSpecificOutput?.additionalContext ?? null;
}

function executarHookConcorrente(projeto: Projeto, entrada: Evento): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const processo = spawn(BASH, [HOOK], {
      cwd: projeto.raiz,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projeto.raiz },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    processo.stdout.setEncoding("utf8").on("data", (trecho: string) => { stdout += trecho; });
    processo.stderr.setEncoding("utf8").on("data", (trecho: string) => { stderr += trecho; });
    processo.on("error", reject);
    processo.on("close", (codigo) => {
      if (codigo !== 0) reject(new Error(`hook concorrente saiu ${String(codigo)}: ${stderr}`));
      else resolvePromise(stdout.trim());
    });
    processo.stdin.end(JSON.stringify(entrada));
  });
}

function pathComNodeIncompativel(): { path: string; marcador: string } {
  const pasta = mkdtempSync(join(tmpdir(), "expx-node-incompativel-"));
  temporarios.push(pasta);
  const marcador = join(pasta, "node-foi-consultado");
  const node = join(pasta, "node");
  writeFileSync(node, `#!/bin/sh\nprintf chamado > "$EXPX_NODE_MARCADOR"\nprintf 'v18.0.0\\n'\n`);
  chmodSync(node, 0o755);
  return { path: `${pasta}${delimiter}${process.env.PATH ?? ""}`, marcador };
}

function caminhoEstado(projeto: Projeto): string {
  return join(projeto.scratchpad, "expx", "lembrete-v1", "estado.json");
}

function expirarTimestamps(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(expirarTimestamps);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor).map(([chave, item]) => {
    if (chave === "timestamp") return [chave, typeof item === "number" ? 0 : "2000-01-01T00:00:00.000Z"];
    return [chave, expirarTimestamps(item)];
  }));
}

afterEach(() => {
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { force: true, recursive: true });
});

describe("classifica, identifica, deduplica e emite delta no hook expx-lembrete", () => {
  it("injeta primeiro e suprime outro prompt do mesmo trabalho e skill (casos 1 e 2)", () => {
    const projeto = criarProjeto();
    expect.soft(executarHook(projeto, evento(projeto))).toContain("runx");
    expect(executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" }))).toBeNull();
  });

  it("suprime a repeticao do mesmo evento (caso 3)", () => {
    const projeto = criarProjeto();
    const entrada = evento(projeto);
    expect.soft(executarHook(projeto, entrada)).toContain("runx");
    expect(executarHook(projeto, entrada)).toBeNull();
  });

  it("emite somente delta curto quando a skill sugerida muda (caso 4)", () => {
    const projeto = criarProjeto(["runx", "sprintx"]);
    executarHook(projeto, evento(projeto));
    const delta = executarHook(projeto, evento(projeto, {
      prompt: "Implementar uma funcionalidade nova de exportacao dos dados", prompt_id: "prompt-2",
    }));
    expect.soft(delta).toContain("sprintx");
    expect(delta).not.toContain("ANTES de ler codigo");
  });

  it("suprime o mesmo trabalho e volta a injetar em trabalho novo (caso 5)", () => {
    const projeto = criarProjeto();
    expect.soft(executarHook(projeto, evento(projeto))).not.toBeNull();
    expect.soft(executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" }))).toBeNull();
    definirTrabalho(projeto.raiz, "OC-2026-0002", "E1");
    expect(executarHook(projeto, evento(projeto, { prompt_id: "prompt-3" }))).not.toBeNull();
  });

  it("isola dois cwd na mesma sessao e deduplica cada um (caso 6)", () => {
    const a = criarProjeto(); const b = criarProjeto();
    expect.soft(executarHook(a, evento(a))).not.toBeNull();
    expect.soft(executarHook(b, evento(b))).not.toBeNull();
    expect(executarHook(a, evento(a, { prompt_id: "prompt-2" }))).toBeNull();
  });

  it("isola duas sessoes no mesmo cwd e deduplica cada uma (caso 7)", () => {
    const projeto = criarProjeto();
    const a = evento(projeto, { session_id: "sessao-a" });
    const b = evento(projeto, { prompt_id: "prompt-2", session_id: "sessao-b" });
    expect.soft(executarHook(projeto, a)).not.toBeNull();
    expect.soft(executarHook(projeto, b)).not.toBeNull();
    expect(executarHook(projeto, { ...a, prompt_id: "prompt-3" })).toBeNull();
  });

  it("preserva a supressao ao retomar a mesma sessao (caso 8)", () => {
    const projeto = criarProjeto();
    executarHook(projeto, evento(projeto));
    expect(executarHook(projeto, evento(projeto, { prompt_id: "prompt-retomado" }))).toBeNull();
  });

  it("usa transcript_path como identidade segura sem session_id (casos 9 e 10)", () => {
    const projeto = criarProjeto(); const entrada = evento(projeto, { session_id: undefined });
    expect.soft(executarHook(projeto, entrada)).not.toBeNull();
    expect(executarHook(projeto, { ...entrada, prompt_id: "prompt-2" })).toBeNull();
  });

  it("fica stateless somente sem sessao e transcript (caso 11)", () => {
    const projeto = criarProjeto();
    const anonimo = evento(projeto, { session_id: undefined, transcript_path: undefined });
    expect.soft(executarHook(projeto, anonimo)).not.toBeNull();
    expect.soft(executarHook(projeto, anonimo)).not.toBeNull();
    const identificado = evento(projeto, { prompt_id: "prompt-3", session_id: undefined, transcript_path: join(projeto.raiz, "retomada.jsonl") });
    executarHook(projeto, identificado);
    expect(executarHook(projeto, { ...identificado, prompt_id: "prompt-4" })).toBeNull();
  });

  it("nao reinjeta na transicao E4 para E3 do mesmo trabalho (caso 12)", () => {
    const projeto = criarProjeto();
    definirTrabalho(projeto.raiz, "OC-2026-0001", "E4");
    executarHook(projeto, evento(projeto));
    definirTrabalho(projeto.raiz, "OC-2026-0001", "E3");
    expect(executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" }))).toBeNull();
  });

  it("suprime dentro do TTL e permite depois da expiracao (caso 13)", () => {
    const projeto = criarProjeto();
    executarHook(projeto, evento(projeto));
    expect.soft(executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" }))).toBeNull();
    const estado = caminhoEstado(projeto);
    expect.soft(existsSync(estado)).toBe(true);
    if (existsSync(estado)) {
      const conteudo = JSON.parse(readFileSync(estado, "utf8")) as unknown;
      writeFileSync(estado, JSON.stringify(expirarTimestamps(conteudo)));
    }
    expect(executarHook(projeto, evento(projeto, { prompt_id: "prompt-3" }))).not.toBeNull();
  });

  it("deduplica texto de automacao e subagente sem heuristica textual (caso 17)", () => {
    const projeto = criarProjeto();
    executarHook(projeto, evento(projeto, { prompt: "Tarefa agendada: o sistema nao salva o pedido" }));
    expect(executarHook(projeto, evento(projeto, {
      prompt: "Retorno do subagente: o sistema nao salva o pedido", prompt_id: "prompt-2",
    }))).toBeNull();
  });

  it("nao persiste prompt nem hash do prompt (caso 20)", () => {
    const projeto = criarProjeto(); const segredo = "segredo-unico-do-prompt-982734";
    const prompt = `O sistema nao salva ${segredo}`;
    executarHook(projeto, evento(projeto, { prompt }));
    const estado = caminhoEstado(projeto);
    expect.soft(existsSync(estado)).toBe(true);
    const conteudo = existsSync(estado) ? readFileSync(estado, "utf8") : "";
    expect.soft(conteudo).not.toContain(segredo);
    expect(conteudo).not.toContain(createHash("sha256").update(prompt).digest("hex"));
  });

  it("injeta uma vez por trabalho e skill e somente deltas nas trocas (caso 22)", () => {
    const projeto = criarProjeto(["runx", "sprintx"]);
    const contextos = [
      executarHook(projeto, evento(projeto)),
      executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" })),
      executarHook(projeto, evento(projeto, { prompt: "Implementar uma funcionalidade nova de exportacao", prompt_id: "prompt-3" })),
      executarHook(projeto, evento(projeto, { prompt: "Implementar outra funcionalidade nova de importacao", prompt_id: "prompt-4" })),
    ];
    expect.soft(contextos.filter(Boolean)).toHaveLength(2);
    expect(contextos[2]).not.toContain("ANTES de ler codigo");
  });

  it("preserva prioridade da classificacao e ainda deduplica (caso 24)", () => {
    const projeto = criarProjeto(["memox", "runx"]);
    const entrada = evento(projeto, { prompt: "Isso ja aconteceu antes? O sistema nao salva o pedido" });
    expect.soft(executarHook(projeto, entrada)).toContain("memox");
    expect(executarHook(projeto, entrada)).toBeNull();
  });

});

describe("estado seguro e concorrencia pendentes", () => {

  it("reconstroi JSON corrompido e injeta de modo conservador (caso 14)", () => {
    const projeto = criarProjeto();
    const estado = caminhoEstado(projeto);
    mkdirSync(dirname(estado), { recursive: true });
    writeFileSync(estado, "{json-corrompido");

    expect.soft(executarHook(projeto, evento(projeto))).not.toBeNull();
    expect(() => JSON.parse(readFileSync(estado, "utf8"))).not.toThrow();
  });

  it("duas execucoes concorrentes do mesmo evento emitem exatamente uma vez (caso 15)", async () => {
    const projeto = criarProjeto();
    const entrada = evento(projeto);
    const saidas = await Promise.all([
      executarHookConcorrente(projeto, entrada),
      executarHookConcorrente(projeto, entrada),
    ]);

    expect(saidas.filter((saida) => saida !== "")).toHaveLength(1);
  });

  it("recusa raiz de estado symlink sem tocar o alvo e usa fail-open (caso 16)", () => {
    const projeto = criarProjeto();
    executarHook(projeto, evento(projeto));
    const raizEstado = dirname(caminhoEstado(projeto));

    if (!existsSync(raizEstado)) {
      expect(existsSync(raizEstado)).toBe(true);
      return;
    }

    rmSync(raizEstado, { recursive: true, force: true });
    const alvo = mkdtempSync(join(tmpdir(), "expx-alvo-symlink-"));
    temporarios.push(alvo);
    const sentinela = join(alvo, "sentinela.txt");
    writeFileSync(sentinela, "intacto\n");
    symlinkSync(alvo, raizEstado, process.platform === "win32" ? "junction" : "dir");

    expect.soft(lstatSync(raizEstado).isSymbolicLink()).toBe(true);
    expect.soft(executarHook(projeto, evento(projeto, { prompt_id: "prompt-2" }))).not.toBeNull();
    expect(readFileSync(sentinela, "utf8")).toBe("intacto\n");
    expect(readdirSync(alvo)).toEqual(["sentinela.txt"]);
  });

});

describe("fallback do wrapper", () => {

  it("consulta Node incompatível e usa o fallback shell stateless (caso 18)", () => {
    const projeto = criarProjeto();
    const falso = pathComNodeIncompativel();
    const ambiente = { PATH: falso.path, EXPX_NODE_MARCADOR: falso.marcador };
    const controle = spawnSync(BASH, ["-lc", "node --version"], { encoding: "utf8", env: { ...process.env, ...ambiente } });
    expect.soft(controle.status).toBe(0);
    expect.soft(controle.stdout.trim()).toBe("v18.0.0");
    rmSync(falso.marcador, { force: true });

    expect.soft(executarHook(projeto, evento(projeto), ambiente)).toContain("runx");
    expect(existsSync(falso.marcador)).toBe(true);
  });

});

describe("volume com estado seguro pendente", () => {

  it("limita a injecao a 768 bytes e emite zero bytes ao suprimir (caso 21)", () => {
    const projeto = criarProjeto();
    const primeira = executarHookBruto(projeto, evento(projeto));
    const repetida = executarHookBruto(projeto, evento(projeto, { prompt_id: "prompt-2" }));

    expect.soft(Buffer.byteLength(primeira, "utf8")).toBeLessThanOrEqual(768);
    expect(repetida).toBe("");
  });
});
