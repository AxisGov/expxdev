import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const HOOK = resolve("nucleo/hooks/expx-invocacao.mjs");
const RES = "a".repeat(64);
const CADEIA = { cadeia: [{ id: "claude-sonnet", model: "sonnet", effort: "high" }, { id: "claude-opus", model: "opus", effort: "high" }] };
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

const git = (raiz: string, ...a: string[]) => spawnSync("git", ["-C", raiz, ...a], { encoding: "utf8" }).stdout.trim();

function projeto(agentes = ["qa", "stackx-cartografo"]): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-invocacao-"));
  criados.push(raiz);
  spawnSync("git", ["init", "-q", "-b", "main", raiz]);
  mkdirSync(join(raiz, ".expx", "resolucoes"), { recursive: true });
  writeFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), ["# expx-orquestracao-rastro 1", ...agentes.map((a) => `${a}\t${RES}\tsenior\tdeclarada\tsenior\tclaude-sonnet\tembutida\t-\t-`)].join("\n") + "\n");
  writeFileSync(join(raiz, ".expx", "resolucoes", `${RES}.json`), JSON.stringify(CADEIA));
  return raiz;
}

function roda(raiz: string, payload: object) {
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDECODE: "1" };
  delete env["EXPX_SESSAO"];
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: raiz, session_id: "sess-1", ...payload }), encoding: "utf8", env });
}
const antes = (raiz: string, tipo: string, id = "toolu_1", extra: object = {}) =>
  roda(raiz, { hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: id, tool_input: { subagent_type: tipo, prompt: "p", description: "d", ...extra } });
const depois = (raiz: string, tipo: string, resposta: object, id = "toolu_1") =>
  roda(raiz, { hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: id, tool_input: { subagent_type: tipo }, tool_response: resposta });

function eventos(raiz: string): Record<string, unknown>[] {
  const dir = join(raiz, "docs", "eventos");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => readFileSync(join(dir, n), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
}
const envelopes = (raiz: string): string[] => {
  const p = join(raiz, git(raiz, "rev-parse", "--git-path", "expx/invocacoes/v1"));
  return existsSync(p) ? readdirSync(p) : [];
};

describe("expx-invocacao: observa a chamada do agente gerenciado", () => {
  it("funcional: agente que nenhuma skill instalou passa sem envelope, sem saída e sem evento", () => {
    const raiz = projeto();
    expect(antes(raiz, "general-purpose")).toMatchObject({ status: 0, stdout: "" });
    expect(envelopes(raiz)).toEqual([]);
    expect(depois(raiz, "general-purpose", { status: "completed", resolvedModel: "x" }).status).toBe(0);
    expect(eventos(raiz)).toEqual([]);
  });

  it("funcional: sem projeção não há gerenciado, nem aprovador forçado", () => {
    const raiz = projeto();
    rmSync(join(raiz, ".expx", "orquestracao-rastro.tsv"));
    expect(antes(raiz, "qa").stdout).toBe("");
  });

  it("funcional: aprovador vai para o primeiro plano com todo o input; gerenciado comum não recebe nada", () => {
    const raiz = projeto();
    const saida = JSON.parse(antes(raiz, "qa").stdout) as { hookSpecificOutput: { updatedInput: object; permissionDecision?: string } };
    expect(saida.hookSpecificOutput.updatedInput).toEqual({ subagent_type: "qa", prompt: "p", description: "d", run_in_background: false });
    expect(saida.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(JSON.parse(antes(raiz, "expx:qa", "toolu_2").stdout).hookSpecificOutput.updatedInput.subagent_type).toBe("expx:qa");
    expect(antes(raiz, "stackx-cartografo", "toolu_3").stdout).toBe("");
    expect(antes(raiz, "qa", "toolu_4", { run_in_background: false }).stdout).toBe("");
    expect(envelopes(raiz)).toHaveLength(4);
  });

  it("funcional: dois prefixos não são o agente, e nome parecido não vira aprovador", () => {
    const raiz = projeto();
    expect(antes(raiz, "expx:expx:qa").stdout).toBe("");
    expect(antes(raiz, "qa-falso", "toolu_2").stdout).toBe("");
  });

  it("funcional: `completed` dentro da cadeia fecha como concluida, com os modelos, e remove o envelope", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5", agentId: "ag-1" });
    const [e, ...resto] = eventos(raiz);
    expect(resto).toEqual([]);
    expect(e).toMatchObject({ evento: "invocacao_fechada", ferramenta: "runx", agente: "qa", resultado: "ok", invocacao: "toolu_1", estado_invocacao: "concluida", modelos_observados: ["claude-sonnet-5-5"], model: "claude-sonnet-5-5", resolucao_id: RES });
    expect(e?.["fora_da_politica"]).toBeUndefined();
    expect(envelopes(raiz)).toEqual([]);
  });

  it("funcional: modelo fora da cadeia marca fora_da_politica, e modelsUsed vale sobre resolvedModel", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5", modelsUsed: ["claude-sonnet-5-5", "claude-haiku-5-5"], agentId: "ag-1" });
    expect(eventos(raiz)[0]).toMatchObject({ fora_da_politica: true, modelos_observados: ["claude-sonnet-5-5", "claude-haiku-5-5"] });
  });

  // §13.5: o fallback real só ocorre sob sobrecarga, e não há como provocá-lo barato.
  // Este é o payload que ele produz: o primário e a alternativa seguinte da cadeia.
  it("funcional: fallback para a alternativa seguinte da cadeia fica dentro da política, com os dois modelos", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-opus-5-5", modelsUsed: ["claude-sonnet-5-5", "claude-opus-5-5"], agentId: "ag-1" });
    const e = eventos(raiz)[0];
    expect(e).toMatchObject({ estado_invocacao: "concluida", modelos_observados: ["claude-sonnet-5-5", "claude-opus-5-5"] });
    expect(e?.["fora_da_politica"]).toBeUndefined();
  });

  it.each([[[]], [[1]], ["x"]])("funcional: modelsUsed inválido (%j) não significa dentro da política: cai em resolvedModel", (usados) => {
    const raiz = projeto();
    antes(raiz, "qa");
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-haiku-5-5", modelsUsed: usados });
    expect(eventos(raiz)[0]).toMatchObject({ fora_da_politica: true, modelos_observados: ["claude-haiku-5-5"] });
  });

  it("funcional: registro ilegível ou nada observado não julga, e não vira dentro nem fora", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    rmSync(join(raiz, ".expx", "resolucoes", `${RES}.json`));
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-haiku-5-5" });
    antes(raiz, "qa", "toolu_2");
    depois(raiz, "qa", { status: "completed" }, "toolu_2");
    const [a, b] = eventos(raiz);
    expect(a?.["fora_da_politica"]).toBeUndefined();
    expect(b?.["fora_da_politica"]).toBeUndefined();
    expect(b?.["modelos_observados"]).toBeUndefined();
  });

  it("funcional: async_launched marca lançamento, sem julgar, mesmo fora da cadeia", () => {
    const raiz = projeto();
    antes(raiz, "stackx-cartografo");
    depois(raiz, "stackx-cartografo", { status: "async_launched", resolvedModel: "claude-haiku-5-5", agentId: "ag-1" });
    const e = eventos(raiz)[0];
    expect(e).toMatchObject({ estado_invocacao: "lancada", resultado: "ok" });
    expect(e?.["fora_da_politica"]).toBeUndefined();
  });

  it("funcional: PostToolUseFailure fecha como falha", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    roda(raiz, { hook_event_name: "PostToolUseFailure", tool_name: "Agent", tool_use_id: "toolu_1", tool_input: { subagent_type: "qa" }, error: "x" });
    expect(eventos(raiz)[0]).toMatchObject({ estado_invocacao: "falha", resultado: "falha" });
    expect(envelopes(raiz)).toEqual([]);
  });

  it("funcional: sem envelope, o fechamento aparece e diz isso", () => {
    const raiz = projeto();
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    expect(String(eventos(raiz)[0]?.["detalhe"])).toContain("sem envelope");
  });

  it("funcional: envelope já tomado por outro handler não fecha de novo", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    const pasta = join(raiz, git(raiz, "rev-parse", "--git-path", "expx/invocacoes/v1"));
    const nome = readdirSync(pasta)[0] ?? "";
    writeFileSync(join(pasta, `${nome}.fechando`), "{}");
    rmSync(join(pasta, nome));
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    expect(eventos(raiz)).toEqual([]);
    expect(readdirSync(pasta)).toEqual([`${nome}.fechando`]);
  });

  it("funcional: chamada aninhada fecha pelo próprio tool_use_id e pela instância do filho", () => {
    const raiz = projeto();
    antes(raiz, "qa", "toolu_pai");
    roda(raiz, { hook_event_name: "PreToolUse", agent_id: "ag-pai", tool_use_id: "toolu_filho", tool_input: { subagent_type: "stackx-cartografo" } });
    roda(raiz, { hook_event_name: "PostToolUse", agent_id: "ag-pai", tool_use_id: "toolu_filho", tool_input: { subagent_type: "stackx-cartografo" }, tool_response: { status: "completed", resolvedModel: "claude-sonnet-5-5", agentId: "ag-filho" } });
    const [e] = eventos(raiz);
    expect(e).toMatchObject({ invocacao: "toolu_filho", agente: "stackx-cartografo" });
    const esperada = spawnSync("git", ["-C", raiz, "hash-object", "--stdin"], { input: "sess-1\nag-filho", encoding: "utf8" }).stdout.trim();
    expect(e?.["instancia"]).toBe(esperada);
    expect(envelopes(raiz)).toHaveLength(1);
  });

  it("funcional: tool_use_id hostil não vira caminho", () => {
    const raiz = projeto();
    antes(raiz, "qa", "../../../fora");
    expect(existsSync(join(raiz, "..", "fora"))).toBe(false);
    expect(envelopes(raiz)[0]).toMatch(/^[0-9a-f]{64}\.json$/);
  });

  it("robustez: payload inválido e pasta impossível falham aberto, e o aprovador ainda vai para o primeiro plano", () => {
    const raiz = projeto();
    expect(spawnSync(process.execPath, [HOOK], { input: "nao-e-json", encoding: "utf8" })).toMatchObject({ status: 0, stdout: "" });
    const pasta = join(raiz, ".git", "expx");
    writeFileSync(pasta, "arquivo no lugar da pasta");
    const r = antes(raiz, "qa");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.run_in_background).toBe(false);
  });

  it("funcional: agente na projeção, mas fora do vocabulário do rastro, não é observado", () => {
    const raiz = projeto(["constructor"]);
    expect(antes(raiz, "constructor")).toMatchObject({ status: 0, stdout: "" });
    expect(envelopes(raiz)).toEqual([]);
    depois(raiz, "constructor", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    expect(eventos(raiz)).toEqual([]);
  });

  it("funcional: a projeção que sai durante o agente não deixa o envelope aberto", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    rmSync(join(raiz, ".expx", "orquestracao-rastro.tsv"));
    depois(raiz, "qa", { status: "async_launched", resolvedModel: "claude-sonnet-5-5" });
    expect(eventos(raiz)[0]).toMatchObject({ evento: "invocacao_fechada", estado_invocacao: "lancada" });
    expect(envelopes(raiz)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("robustez: sem bash, o envelope não some: fica para a recuperação, que grava depois", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    const semBash = mkdtempSync(join(tmpdir(), "expx-sem-bash-"));
    criados.push(semBash);
    const gitReal = spawnSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).stdout.trim();
    symlinkSync(gitReal, join(semBash, "git"));
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ cwd: raiz, session_id: "sess-1", hook_event_name: "PostToolUse", tool_use_id: "toolu_1", tool_input: { subagent_type: "qa" }, tool_response: { status: "completed", resolvedModel: "claude-sonnet-5-5" } }),
      encoding: "utf8",
      env: { ...process.env, PATH: semBash },
    });
    expect(r.status).toBe(0);
    expect(eventos(raiz)).toEqual([]);
    expect(envelopes(raiz)).toHaveLength(1);
    expect(envelopes(raiz)[0]).toMatch(/\.fechando$/);
    roda(raiz, { hook_event_name: "SessionStart", source: "resume" });
    expect(eventos(raiz).map((e) => e["evento"])).toEqual(["invocacao_abandonada"]);
    expect(envelopes(raiz)).toEqual([]);
  });

  it("funcional: a saída grande chega inteira pelo pipe, sem corte no fim do processo", () => {
    const raiz = projeto();
    const prompt = "x".repeat(500_000);
    const r = antes(raiz, "qa", "toolu_1", { prompt });
    expect(JSON.parse(r.stdout).hookSpecificOutput.updatedInput.prompt).toHaveLength(prompt.length);
  });

  it("funcional: GIT_DIR herdado não leva o envelope para outro repositório", () => {
    const raiz = projeto();
    const outro = projeto();
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ cwd: raiz, session_id: "s", hook_event_name: "PreToolUse", tool_use_id: "t", tool_input: { subagent_type: "qa" } }),
      encoding: "utf8",
      env: { ...process.env, GIT_DIR: join(outro, ".git") },
    });
    expect(r.status).toBe(0);
    expect(envelopes(raiz)).toHaveLength(1);
    expect(envelopes(outro)).toEqual([]);
  });

  it("funcional: se a vigente mudou no meio, o evento cita a resolução da chamada", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    const outra = "b".repeat(64);
    writeFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), `# expx-orquestracao-rastro 1\nqa\t${outra}\tsenior\tdeclarada\tsenior\tx\tembutida\t-\t-\n`);
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    const e = eventos(raiz)[0];
    expect(e?.["resolucao_id"]).toBe(RES);
    expect(e?.["fora_da_politica"]).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")("robustez: rastro impossível de gravar não apaga o envelope, embora o escritor saia 0", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    writeFileSync(join(raiz, "docs"), "arquivo no lugar da pasta");
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    expect(envelopes(raiz)[0]).toMatch(/\.fechando$/);
    rmSync(join(raiz, "docs"));
    roda(raiz, { hook_event_name: "SessionStart", source: "resume" });
    expect(eventos(raiz).map((x) => x["evento"])).toEqual(["invocacao_abandonada"]);
    expect(envelopes(raiz)).toEqual([]);
  });

  it("recuperação: startup e resume abandonam o que é desta sessão; compactar não", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    roda(raiz, { hook_event_name: "SessionStart", source: "compact" });
    expect(eventos(raiz)).toEqual([]);
    expect(envelopes(raiz)).toHaveLength(1);
    roda(raiz, { hook_event_name: "SessionStart", source: "resume" });
    expect(eventos(raiz)).toHaveLength(1);
    expect(eventos(raiz)[0]).toMatchObject({ evento: "invocacao_abandonada", resultado: "falha", invocacao: "toolu_1", agente: "qa" });
    expect(envelopes(raiz)).toEqual([]);
  });

  it("recuperação: envelope de outra sessão fica até um dia, e depois sai", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    roda(raiz, { hook_event_name: "SessionStart", source: "startup", session_id: "outra" });
    expect(envelopes(raiz)).toHaveLength(1);
    const pasta = join(raiz, git(raiz, "rev-parse", "--git-path", "expx/invocacoes/v1"));
    const velho = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(join(pasta, envelopes(raiz)[0] ?? ""), velho, velho);
    roda(raiz, { hook_event_name: "SessionStart", source: "startup", session_id: "outra" });
    expect(eventos(raiz)).toHaveLength(1);
  });

  it("recuperação: fechamento interrompido depois do evento não vira abandono", () => {
    const raiz = projeto();
    antes(raiz, "qa");
    const pasta = join(raiz, git(raiz, "rev-parse", "--git-path", "expx/invocacoes/v1"));
    const nome = readdirSync(pasta)[0] ?? "";
    const conteudo = readFileSync(join(pasta, nome));
    depois(raiz, "qa", { status: "completed", resolvedModel: "claude-sonnet-5-5" });
    writeFileSync(join(pasta, `${nome}.fechando`), conteudo);
    roda(raiz, { hook_event_name: "SessionStart", source: "resume" });
    expect(eventos(raiz).map((e) => e["evento"])).toEqual(["invocacao_fechada"]);
    expect(envelopes(raiz)).toEqual([]);
  });
});
