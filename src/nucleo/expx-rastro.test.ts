import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";

/**
 * `nucleo/hooks/expx-rastro.sh`, a biblioteca de rastro que o plugin distribui
 * e os hooks carregam com `source`. Cada caso roda a função de verdade no bash
 * dos hooks: a raiz do repositório, o escape de JSON, as chaves `fase`/`task` e
 * a escolha do trabalho.
 */

// o bash do Git, nunca o primeiro do PATH: no Windows ele pode ser o do WSL
const BASH = bashDosHooks();
const RASTRO = join(RAIZ_DO_REPO, "nucleo", "hooks", "expx-rastro.sh").replace(/\\/g, "/");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-rastro-"));
  criados.push(d);
  return d;
}

/** Roda `corpo` num bash que já fez `source` do rastro, em `cwd`. */
function roda(cwd: string, corpo: string, env: Record<string, string> = {}): string {
  const semExpx: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("EXPX_")) semExpx[k] = v;
  const r = spawnSync(BASH, ["-c", `. "$1"\n${corpo}`, "rastro", RASTRO], {
    cwd,
    encoding: "utf8",
    env: { ...semExpx, ...env },
  });
  if (r.status !== 0) throw new Error(`bash saiu ${String(r.status)}: ${r.stderr}`);
  return r.stdout;
}

function git(dir: string, ...args: string[]): void {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
}

/** As linhas de `docs/eventos/*.jsonl`, por arquivo. */
function eventos(raiz: string): Record<string, string[]> {
  const dir = join(raiz, "docs", "eventos");
  const out: Record<string, string[]> = {};
  for (const f of readdirSync(dir)) out[f] = readFileSync(join(dir, f), "utf8").split("\n").filter((l) => l !== "");
  return out;
}

describe("expx_raiz", () => {
  it("funcional: numa worktree vinculada (.git é ARQUIVO), de um subdiretório, devolve a raiz da worktree", () => {
    const raiz = temp();
    writeFileSync(join(raiz, ".git"), "gitdir: /em/outro/lugar/.git/worktrees/w\n");
    const sub = join(raiz, "src", "fundo");
    mkdirSync(sub, { recursive: true });

    const out = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd ../.. && pwd)"');
    const [achada, esperada] = out.split("\n");
    expect(achada).toBe(esperada);
  });

  it("funcional: com .git diretório continua achando a raiz", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    const sub = join(raiz, "a");
    mkdirSync(sub);
    const [achada, esperada] = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd .. && pwd)"').split("\n");
    expect(achada).toBe(esperada);
  });
});

describe("expx_json_escape", () => {
  it("funcional: todo controle U+0001–U+001F sai escapado, e a string volta igual pelo JSON", () => {
    const d = temp();
    // todos os controles que cabem numa variavel de shell (o NUL nao cabe)
    const out = roda(d, "s=''; for i in $(seq 1 31); do printf -v o '\\\\%03o' \"$i\"; printf -v c '%b' \"$o\"; s=\"$s$c\"; done; expx_json_escape \"a${s}z\\\\\\\"\"");
    expect(out).not.toMatch(/[\u0000-\u001f]/);
    const original = `a${Array.from({ length: 31 }, (_, i) => String.fromCharCode(i + 1)).join("")}z\\"`;
    expect(JSON.parse(`"${out}"`)).toBe(original);
  });

  it("integração: detalhe com ESC (cor de terminal) grava uma linha JSON válida", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    roda(raiz, "EXPX_TRABALHO_ID=t expx_rastro_grava \"$PWD\" acao_permitida hook permitido $'\\033[31mvermelho\\033[0m\\001'");
    const [linha] = eventos(raiz)["t.jsonl"] ?? [];
    expect((JSON.parse(linha ?? "") as { detalhe: string }).detalhe).toBe("\u001b[31mvermelho\u001b[0m\u0001");
  });
});

describe("fase e task", () => {
  it("funcional: EXPX_FASE e EXPX_TASK saem como string JSON; ausentes, null", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x', {
      EXPX_TRABALHO_ID: "t",
      EXPX_FASE: "f6",
      EXPX_TASK: 'T-01.01 "x"',
    });
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido y', { EXPX_TRABALHO_ID: "t" });
    const [com, sem] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as { fase: unknown; task: unknown });
    expect(com).toMatchObject({ fase: "f6", task: 'T-01.01 "x"' });
    expect(sem).toMatchObject({ fase: null, task: null });
  });
});

describe("expx_trabalho_id", () => {
  /** Repositório com duas features ativas; `a` é a mais recente por mtime. */
  function duasFeatures(branch: string): string {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", branch);
    for (const [slug, quando] of [["a", 2_000_000_000], ["b", 1_000_000_000]] as const) {
      const dir = join(raiz, "docs", "sprintx", "features", slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "ORQUESTRADOR.md"), `# ${slug}\n`);
      utimesSync(join(dir, "ORQUESTRADOR.md"), quando, quando);
    }
    return raiz;
  }

  it("funcional: na branch feature/<slug> o trabalho é o slug, não o ORQUESTRADOR.md mais recente", () => {
    const raiz = duasFeatures("feature/b");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("b");
  });

  it("funcional: numa worktree vinculada a branch vem do HEAD dela", () => {
    const raiz = duasFeatures("main");
    git(raiz, "add", "-A");
    git(raiz, "commit", "-q", "-m", "base");
    const wt = join(temp(), "wt");
    git(raiz, "worktree", "add", "-q", "-b", "feature/b", wt);
    utimesSync(join(wt, "docs", "sprintx", "features", "a", "ORQUESTRADOR.md"), 2_000_000_000, 2_000_000_000);
    expect(roda(join(wt, "docs"), 'expx_trabalho_id "$(expx_raiz)"').trimEnd()).toBe("b");
  });

  it("funcional: dois trabalhos e branch que não casa vão para sem-trabalho, nunca para o mais recente", () => {
    const raiz = duasFeatures("main");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("sem-trabalho");
  });

  it("integração: com dois trabalhos e sem branch que case, o evento grava em sem-trabalho.jsonl", () => {
    const raiz = duasFeatures("main");
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x');
    expect(Object.keys(eventos(raiz))).toEqual(["sem-trabalho.jsonl"]);
  });

  it("funcional: com um trabalho só, mesmo sem branch que case, o evento vai para ele", () => {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", "main");
    mkdirSync(join(raiz, "docs", "sprintx", "features", "unico"), { recursive: true });
    writeFileSync(join(raiz, "docs", "sprintx", "features", "unico", "ORQUESTRADOR.md"), "# unico\n");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("unico");
  });

  it("funcional: sem ORQUESTRADOR.md nenhum, sem-trabalho", () => {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", "feature/x");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd()).toBe("sem-trabalho");
  });

  it("funcional: EXPX_TRABALHO_ID continua vencendo a branch", () => {
    const raiz = duasFeatures("feature/b");
    expect(roda(raiz, 'expx_trabalho_id "$PWD"', { EXPX_TRABALHO_ID: "outro" }).trimEnd()).toBe("outro");
  });
});

describe("expx_modo sem jq", () => {
  // sem jq o hook cai no parser de grep; `command -v jq` falhando simula a ausência
  const SEM_JQ = 'command() { [ "$1 $2" = "-v jq" ] && return 1; builtin command "$@"; }\n';

  it("funcional: a forma antiga (modos com valor string) é lida, e desligado desliga", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".expx"), { recursive: true });
    writeFileSync(join(raiz, ".expx", "hooks.json"), '{"modos": {"meu-hook": "desligado"}}\n');
    expect(roda(raiz, `${SEM_JQ}expx_modo "$PWD" meu-hook`).trimEnd()).toBe("desligado");
  });

  it("funcional: a forma atual (hooks com objeto) continua valendo sem jq", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".expx"), { recursive: true });
    writeFileSync(join(raiz, ".expx", "hooks.json"), '{"hooks": {"meu-hook": {"modo": "bloqueio"}}}\n');
    expect(roda(raiz, `${SEM_JQ}expx_modo "$PWD" meu-hook`).trimEnd()).toBe("bloqueio");
  });
});

describe("leitura do JSON sem jq", () => {
  const SEM_JQ = 'command() { [ "$1 $2" = "-v jq" ] && return 1; builtin command "$@"; }\n';

  // o JSON vai por variavel de ambiente: na linha de comando do Windows, a releitura
  // do MSYS comeria as barras invertidas antes de o bash ver o argumento

  it("funcional: file_path com barra invertida e aspa escapadas chega decodificado", () => {
    const raiz = temp();
    const caminho = String.raw`C:\Users\a"b\x.ts`;
    const json = JSON.stringify({ tool_input: { file_path: caminho, outro: 1 } });
    expect(roda(raiz, `${SEM_JQ}expx_tool_input_get "$JSON_TESTE" file_path`, { JSON_TESTE: json })).toBe(caminho);
  });

  it("funcional: valor igual ao nome da chave não esconde a chave de verdade", () => {
    const raiz = temp();
    const json = JSON.stringify({ a: "file_path", tool_input: { file_path: "real.ts" } });
    expect(roda(raiz, `${SEM_JQ}expx_tool_input_get "$JSON_TESTE" file_path`, { JSON_TESTE: json })).toBe("real.ts");
  });

  it("funcional: par substituto (\\ud83d\\ude00) vira um caractere só", () => {
    const raiz = temp();
    const json = '{"a":"x\\ud83d\\ude00y"}';
    expect(roda(raiz, `${SEM_JQ}expx_json_get "$JSON_TESTE" a`, { JSON_TESTE: json })).toBe("x\u{1F600}y");
  });

  it("funcional: quebra, tabulação e \\u00e9 são decodificados; valor que não é string sai vazio", () => {
    const raiz = temp();
    const json = JSON.stringify({ a: "x\ny\tz é", n: 3 }).replace("é", "\\u00e9");
    expect(roda(raiz, `${SEM_JQ}expx_json_get "$JSON_TESTE" a`, { JSON_TESTE: json })).toBe("x\ny\tz é");
    expect(roda(raiz, `${SEM_JQ}expx_json_get "$JSON_TESTE" n`, { JSON_TESTE: json })).toBe("");
  });

  // O contrato dos hooks e o bash 3.2 do macOS, cujo `printf` nao conhece as escapas
  // de code point (vieram no bash 4.2) e as devolve cruas. Nao ha bash 3.2 na bancada:
  // este `printf` faz o mesmo, dobrando a barra dessas escapas antes do builtin quando
  // o formato as interpretaria (o proprio formato ou um %b). E roda sem locale UTF-8
  // (LC_ALL=C), que o macOS nem tem com o nome C.UTF-8.
  const PRINTF_32 = [
    "printf() {",
    '  local f="$1"; [ "$1" = -v ] && f="$3"',
    '  case "$f" in *%s*) ;; *) set -- "${@//"\\u"/"\\\\\\\\u"}"; set -- "${@//"\\U"/"\\\\\\\\U"}" ;; esac',
    '  builtin printf "$@"',
    "}",
    "",
  ].join("\n");
  // vai por variavel de ambiente, como o JSON: na linha de comando as barras se perdem
  const COMO_32 = { LC_ALL: "C", LANG: "C", PRINTF_32 };

  it("funcional: printf de bash 3.2 e locale C, file_path com \\u00e9 e par substituto chega em UTF-8", () => {
    const raiz = temp();
    const json = '{"tool_input":{"file_path":"docs/caf\\u00e9/\\u4e2d\\ud83d\\ude00.md"}}';
    const out = roda(raiz, `${SEM_JQ}eval "$PRINTF_32"\nexpx_tool_input_get "$JSON_TESTE" file_path`, { ...COMO_32, JSON_TESTE: json });
    expect(out).toBe("docs/caf\u00e9/\u4e2d\u{1F600}.md");
  });

  it("funcional: printf de bash 3.2, escapa de aspa/barra/% e substituto solto saem certos", () => {
    const raiz = temp();
    const json = '{"a":"\\u0022\\u005c\\u0025s\\u0041|\\ud83d|\\ude00|\\u00zz"}';
    const out = roda(raiz, `${SEM_JQ}eval "$PRINTF_32"\nexpx_json_get "$JSON_TESTE" a`, { ...COMO_32, JSON_TESTE: json });
    // substituto sem par vira U+FFFD, como no jq; escapa malformada nao derruba o hook
    expect(out).toBe('"\\%sA|\uFFFD|\uFFFD|u00zz');
  });
});

describe("rotação do rastro", () => {
  function comArquivoGrande(): string {
    const raiz = temp();
    mkdirSync(join(raiz, "docs", "eventos"), { recursive: true });
    writeFileSync(join(raiz, "docs", "eventos", "t.jsonl"), "x".repeat(5 * 1024 * 1024 + 10) + "\n");
    writeFileSync(join(raiz, "docs", "eventos", "t.1.jsonl"), "antigo\n");
    return raiz;
  }

  it("funcional: acima de 5 MB, quem pega a trava rotaciona para .1.jsonl", () => {
    const raiz = comArquivoGrande();
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x', { EXPX_TRABALHO_ID: "t" });
    expect(readFileSync(join(raiz, "docs", "eventos", "t.1.jsonl"), "utf8").length).toBeGreaterThan(5 * 1024 * 1024);
    expect(readdirSync(join(raiz, "docs", "eventos")).filter((f) => f.startsWith("."))).toEqual([]);
  });

  it("funcional: trava velha também segura a rotação — ninguém a remove, nada se perde", () => {
    const raiz = comArquivoGrande();
    const trava = join(raiz, "docs", "eventos", ".t.rotacao");
    mkdirSync(trava);
    const antes = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(trava, antes, antes);
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x', { EXPX_TRABALHO_ID: "t" });
    expect(readFileSync(join(raiz, "docs", "eventos", "t.1.jsonl"), "utf8")).toBe("antigo\n");
  });

  it("funcional: com a trava de outro gravador, não rotaciona e o .1.jsonl fica intacto", () => {
    const raiz = comArquivoGrande();
    mkdirSync(join(raiz, "docs", "eventos", ".t.rotacao"));
    roda(raiz, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x', { EXPX_TRABALHO_ID: "t" });
    expect(readFileSync(join(raiz, "docs", "eventos", "t.1.jsonl"), "utf8")).toBe("antigo\n");
  });
});
