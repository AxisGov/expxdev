import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { suportaNomeComCaractereReservado, suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";
import { lerFrontmatter } from "../parser/leitura/frontmatter.js";

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
  // CLAUDECODE identifica o Claude Code: herdá-la do executor mudaria o harness do caso
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("EXPX_") && k !== "CLAUDECODE") semExpx[k] = v;
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

    // a raiz sai FÍSICA: no Git Bash do CI Windows o /tmp é montagem e no macOS
    // é link para /private/tmp, então o esperado também é `pwd -P`
    const out = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd -P ../.. && pwd -P)"');
    const [achada, esperada] = out.split("\n");
    expect(achada).toBe(esperada);
  });

  it("funcional: com .git diretório continua achando a raiz", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    const sub = join(raiz, "a");
    mkdirSync(sub);
    const [achada, esperada] = roda(sub, 'printf "%s\\n%s" "$(expx_raiz)" "$(cd -P .. && pwd -P)"').split("\n");
    expect(achada).toBe(esperada);
  });

  // Sem privilégio, o Windows recusa link simbólico de diretório (EPERM); o CI
  // Linux roda o caso. O nome diz por que pulou, para não passar por verde.
  const comLink = suportaSymlinkDeDiretorio();
  const seLink = comLink ? "" : " [pulado: este sistema não cria link simbólico de diretório]";

  it.skipIf(!comLink)(
    `funcional: cwd é link simbólico de FORA para um subdiretório do repositório: devolve a raiz física${seLink}`,
    () => {
      for (const gitArquivo of [false, true]) {
        const raiz = join(temp(), "repo");
        mkdirSync(join(raiz, "a", "b"), { recursive: true });
        if (gitArquivo) writeFileSync(join(raiz, ".git"), "gitdir: /em/outro/lugar/.git/worktrees/w\n");
        else mkdirSync(join(raiz, ".git"));
        const fora = temp();
        const link = join(fora, "atalho");
        symlinkSync(join(raiz, "a", "b"), link, "dir");

        // o hook recebe o cwd do evento como argumento, sem resolver
        const corpo = 'printf "%s\\n%s" "$(expx_raiz "$LINK")" "$(cd -P "$RAIZ" && pwd -P)"';
        const [achada, esperada] = roda(fora, corpo, { LINK: link, RAIZ: raiz }).split("\n");
        expect(achada, gitArquivo ? ".git arquivo" : ".git diretório").toBe(esperada);
      }
    },
  );

  // O Windows não aceita newline em nome de arquivo; Linux e macOS aceitam. O
  // `$(...)` corta newline do FIM da saída, então o que expõe o corte é um link
  // que aponta direto para a raiz cujo nome termina em newline.
  const comNewline = comLink && suportaNomeComCaractereReservado();
  const seNewline = comNewline ? "" : " [pulado: sem link de diretório ou sem newline em nome de arquivo]";

  it.skipIf(!comNewline)(
    `funcional: link para a raiz cujo nome termina em newline não perde o newline ao resolver${seNewline}`,
    () => {
      const raiz = join(temp(), "repo\n");
      mkdirSync(join(raiz, ".git"), { recursive: true });
      const link = join(temp(), "atalho");
      symlinkSync(raiz, link, "dir");
      expect(roda(raiz, 'expx_raiz "$LINK"', { LINK: link })).toBe(realpathSync(raiz));
    },
  );

  it("funcional: fora de repositório devolve o próprio caminho recebido", () => {
    const solto = join(temp(), "solto");
    mkdirSync(solto);
    expect(roda(solto, 'expx_raiz "$PWD"')).toBe(roda(solto, 'printf "%s" "$PWD"'));
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

  it("integração: model/effort são só o executor observado; o frontmatter instalado nunca vira observação (H10)", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    mkdirSync(join(raiz, ".claude", "agents"), { recursive: true });
    writeFileSync(
      join(raiz, ".claude", "agents", "runx-investigador.md"),
      "---\nname: runx-investigador\nmodel: sonnet\neffort: medium\n---\n",
    );
    const sub = { EXPX_TRABALHO_ID: "t", EXPX_AGENTE: "runx-investigador" };

    roda(raiz, 'expx_rastro_grava "$PWD" agente_iniciado agente ok claude-sem-observacao', { ...sub, EXPX_HARNESS: "claude" });
    roda(raiz, 'expx_rastro_grava "$PWD" agente_iniciado agente ok claudecode-sem-observacao', { ...sub, CLAUDECODE: "1" });
    roda(raiz, 'expx_rastro_grava "$PWD" agente_iniciado agente ok parcial-claude', { ...sub, EXPX_MODEL: "opus", EXPX_HARNESS: "claude-code" });
    roda(raiz, 'expx_rastro_grava "$PWD" agente_iniciado agente ok explicito', {
      ...sub,
      EXPX_MODEL: "openai/gpt-5.4",
      EXPX_EFFORT: "xhigh",
      EXPX_HARNESS: "opencode",
    });
    roda(raiz, 'expx_rastro_grava "$PWD" agente_iniciado agente ok codex-sem-metadado', { ...sub, EXPX_HARNESS: "codex" });

    const [claude, claudecode, parcialClaude, explicito, codex] = (eventos(raiz)["t.jsonl"] ?? [])
      .map((l) => JSON.parse(l) as { model: unknown; effort: unknown });
    expect(claude).toMatchObject({ model: null, effort: null });
    expect(claudecode).toMatchObject({ model: null, effort: null });
    expect(parcialClaude).toMatchObject({ model: "opus", effort: null });
    expect(explicito).toMatchObject({ model: "openai/gpt-5.4", effort: "xhigh" });
    expect(codex).toMatchObject({ model: null, effort: null });
  });

  it("integração: $CLAUDE_EFFORT é observação só do principal no Claude; nunca de subagente nem de outro harness", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    const base = { EXPX_TRABALHO_ID: "t", CLAUDE_EFFORT: "high" };

    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok principal', { ...base, CLAUDECODE: "1" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok subagente', { ...base, CLAUDECODE: "1", EXPX_AGENTE: "auditor-plano" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok opencode', { ...base, EXPX_HARNESS: "opencode" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok explicito-vence', { ...base, CLAUDECODE: "1", EXPX_EFFORT: "low" });

    const [principal, subagente, opencode, explicito] = (eventos(raiz)["t.jsonl"] ?? [])
      .map((l) => JSON.parse(l) as { model: unknown; effort: unknown });
    expect(principal).toMatchObject({ model: null, effort: "high" });
    expect(subagente).toMatchObject({ effort: null });
    expect(opencode).toMatchObject({ effort: null });
    expect(explicito).toMatchObject({ effort: "low" });
  });

  it("integração: com a projeção da política, a linha do subagente no Claude leva as chaves da resolução", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    mkdirSync(join(raiz, ".expx"));
    const id = "c".repeat(64);
    writeFileSync(
      join(raiz, ".expx", "orquestracao-rastro.tsv"),
      ["# expx-orquestracao-rastro 1",
        ["auditor", id, "raciocinio_normal", "declarada", "profundo_excepcional", "opus-high", "projeto", "-", "-"].join("\t"),
        ["revisor", "d".repeat(64), "raciocinio_normal", "agente", "raciocinio_normal", "skill", "agentes-json-v1", "haiku", "low"].join("\t"),
        ""].join("\n"),
    );
    const base = { EXPX_TRABALHO_ID: "t", CLAUDECODE: "1" };
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok auditor', { ...base, EXPX_AGENTE: "auditor" });
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok revisor', { ...base, EXPX_AGENTE: "revisor" });
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok fora', { ...base, EXPX_AGENTE: "outro" });
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok principal', base);
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok opencode', { EXPX_TRABALHO_ID: "t", EXPX_HARNESS: "opencode", EXPX_AGENTE: "auditor" });

    const [auditor, revisor, fora, principal, opencode] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(auditor).toMatchObject({
      model: null,
      effort: null,
      resolucao_id: id,
      classe_declarada: "raciocinio_normal",
      classe_resolvida: "profundo_excepcional",
      origem_classe: "declarada",
      alternativa: "opus-high",
      origem_alternativa: "projeto",
    });
    expect(auditor).not.toHaveProperty("materializado");
    expect(revisor).toMatchObject({ origem_alternativa: "agentes-json-v1", materializado: { model: "haiku", effort: "low" } });
    for (const sem of [fora, principal, opencode]) expect(sem).not.toHaveProperty("resolucao_id");
  });

  it("integração: projeção ilegível (cabeçalho, id, campo a mais ou caractere fora) não acrescenta nada", () => {
    const linha = (campos: string[]) => campos.join("\t");
    const ok = ["auditor", "c".repeat(64), "raciocinio_normal", "declarada", "raciocinio_normal", "skill", "skill", "-", "-"];
    const casos = [
      ["# outra coisa 1", linha(ok)],
      ["# expx-orquestracao-rastro 1", linha(["auditor", "c".repeat(63), ...ok.slice(2)])],
      ["# expx-orquestracao-rastro 1", linha([...ok, "extra"])],
      ["# expx-orquestracao-rastro 1", linha([...ok.slice(0, 5), 'sk"ill', ...ok.slice(6)])],
      // TAB a mais no fim: o `read` com IFS de TAB juntaria a coluna vazia e aceitaria a linha
      ["# expx-orquestracao-rastro 1", `${linha(ok)}\t`],
      // coluna vazia no meio: dois TABs seguidos
      ["# expx-orquestracao-rastro 1", linha([...ok.slice(0, 5), "", ...ok.slice(6)])],
      // `-` só é ausência nas colunas do materializado
      ["# expx-orquestracao-rastro 1", linha([...ok.slice(0, 5), "-", ...ok.slice(6)])],
      // effort materializado sem model
      ["# expx-orquestracao-rastro 1", linha([...ok.slice(0, 7), "-", "low"])],
      // materializado fora da exceção do v1
      ["# expx-orquestracao-rastro 1", linha([...ok.slice(0, 7), "haiku", "-"])],
      // agente repetido: a projeção não vale para ele
      ["# expx-orquestracao-rastro 1", linha(ok), linha([ok[0] as string, "d".repeat(64), ...ok.slice(2)])],
    ];
    for (const conteudo of casos) {
      const raiz = temp();
      mkdirSync(join(raiz, ".git"));
      mkdirSync(join(raiz, ".expx"));
      writeFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), `${conteudo.join("\n")}\n`);
      roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok x', { EXPX_TRABALHO_ID: "t", CLAUDECODE: "1", EXPX_AGENTE: "auditor" });
      const [ev] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(ev, conteudo.join(" | ")).not.toHaveProperty("resolucao_id");
    }
    // agente fora do alfabeto de nome nunca casa, nem consigo mesmo na projeção
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), `# expx-orquestracao-rastro 1\n${linha(["audi*", ...ok.slice(1)])}\n`);
    roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok x', { EXPX_TRABALHO_ID: "t", CLAUDECODE: "1", EXPX_AGENTE: "audi*" });
    const [ev] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(ev).not.toHaveProperty("resolucao_id");
  });

  it("integração: projeção com NUL em qualquer ponto não acrescenta nada — o `read` do shell o descartaria em silêncio", () => {
    const linha = (campos: string[]) => campos.join("\t");
    const ok = ["auditor", "c".repeat(64), "raciocinio_normal", "declarada", "raciocinio_normal", "skill", "skill", "-", "-"];
    const casos = [
      `# expx-orquestracao-\0rastro 1\n${linha(ok)}\n`,
      `# expx-orquestracao-rastro 1\n${linha([...ok.slice(0, 2), "raciocinio_\0normal", ...ok.slice(3)])}\n`,
      `# expx-orquestracao-rastro 1\n${linha(["audi\0tor", ...ok.slice(1)])}\n`,
      // NUL na linha de outro agente: o arquivo inteiro deixa de valer, como no hook
      `# expx-orquestracao-rastro 1\n${linha(ok)}\n${linha(["qa\0", ...ok.slice(1)])}\n`,
      // depois da última quebra de linha
      `# expx-orquestracao-rastro 1\n${linha(ok)}\n\0`,
    ];
    for (const conteudo of [`# expx-orquestracao-rastro 1\n${linha(ok)}\n`, ...casos]) {
      const raiz = temp();
      mkdirSync(join(raiz, ".git"));
      mkdirSync(join(raiz, ".expx"));
      writeFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), conteudo);
      roda(raiz, 'expx_rastro_grava "$PWD" veredito_emitido agente ok x', { EXPX_TRABALHO_ID: "t", CLAUDECODE: "1", EXPX_AGENTE: "auditor" });
      const [ev] = (eventos(raiz)["t.jsonl"] ?? []).map((l) => JSON.parse(l) as Record<string, unknown>);
      // o controle, sem NUL, leva a resolução; todo caso com NUL, não
      if (conteudo.includes("\0")) expect(ev, JSON.stringify(conteudo)).not.toHaveProperty("resolucao_id");
      else expect(ev).toHaveProperty("resolucao_id", "c".repeat(64));
    }
  });

  // A projeção trocada no meio da leitura (login#69): o `read` sobrescrito troca o
  // arquivo logo depois da primeira abertura. Quem abre uma vez só fica com o
  // arquivo de antes; quem reabre lê o novo, e o Bash descartaria o NUL dele.
  it("funcional: cada leitor de projeção abre o arquivo uma vez — a troca no meio da leitura não entra", () => {
    const linha = (campos: string[]) => campos.join("\t");
    const ok = ["auditor", "c".repeat(64), "raciocinio_normal", "declarada", "raciocinio_normal", "skill", "skill", "-", "-"];
    const casos = [
      {
        arquivo: "papeis.tsv",
        antes: "# expx-papeis 1\nrevisor-diff\tmergex\trevisar\n",
        depois: ["# expx-papeis 1\nq\0a\trunx\ttestar\n", "# expx-papeis 1\nqa\trunx\ttestar\n"],
        le: "expx_papel_de \"$PWD\" qa",
      },
      {
        arquivo: "orquestracao-rastro.tsv",
        antes: `# expx-orquestracao-rastro 1\n${linha(["qa", ...ok.slice(1)])}\n`,
        depois: [
          `# expx-orquestracao-rastro 1\n${linha([...ok.slice(0, 2), "raciocinio_\0normal", ...ok.slice(3)])}\n`,
          `# expx-orquestracao-rastro 1\n${linha(ok)}\n`,
        ],
        le: "expx_resolucao_extras \"$PWD\" auditor",
      },
    ];
    for (const c of casos) {
      for (const depois of c.depois) {
        const raiz = temp();
        mkdirSync(join(raiz, ".expx"));
        writeFileSync(join(raiz, ".expx", c.arquivo), c.antes);
        writeFileSync(join(raiz, "troca.tsv"), depois);
        const corpo = [
          'read() { if [ -z "${TROCOU:-}" ]; then TROCOU=1; mv troca.tsv ".expx/$ARQ"; fi; builtin read "$@"; }',
          `printf '[%s]' "$(${c.le})"`,
        ].join("\n");
        // o agente lido não está no arquivo de antes: nada sai, com ou sem NUL no novo
        expect(roda(raiz, corpo, { ARQ: c.arquivo }), JSON.stringify(depois)).toBe("[]");
      }
    }
  });

  it("funcional: a leitura única vale como a linha a linha — sem quebra final, quebra dupla no fim e CRLF", () => {
    const linha = ["auditor", "c".repeat(64), "raciocinio_normal", "declarada", "raciocinio_normal", "skill", "skill", "-", "-"].join("\t");
    const casos: [string, string, string, boolean][] = [
      ["papeis.tsv", 'expx_papel_de "$PWD" qa', "# expx-papeis 1\nqa\trunx\ttestar", true],
      ["papeis.tsv", 'expx_papel_de "$PWD" qa', "# expx-papeis 1\nqa\trunx\ttestar\n\n", false],
      ["papeis.tsv", 'expx_papel_de "$PWD" qa', "# expx-papeis 1\r\nqa\trunx\ttestar\r", true],
      ["orquestracao-rastro.tsv", 'expx_resolucao_extras "$PWD" auditor', `# expx-orquestracao-rastro 1\n${linha}`, true],
      ["orquestracao-rastro.tsv", 'expx_resolucao_extras "$PWD" auditor', `# expx-orquestracao-rastro 1\n${linha}\n\n`, true],
      ["orquestracao-rastro.tsv", 'expx_resolucao_extras "$PWD" auditor', `# expx-orquestracao-rastro 1\r\n${linha}\r`, true],
    ];
    for (const [arquivo, le, conteudo, vale] of casos) {
      const raiz = temp();
      mkdirSync(join(raiz, ".expx"));
      writeFileSync(join(raiz, ".expx", arquivo), conteudo);
      const saida = roda(raiz, le);
      // a linha vazia invalida a dos papéis inteira; na do rastro, só não casa com o agente
      if (vale) expect(saida, JSON.stringify(conteudo)).toMatch(arquivo === "papeis.tsv" ? /^runx\ttestar$/ : /"resolucao_id":"c{64}"/);
      else expect(saida, JSON.stringify(conteudo)).toBe("");
    }
  });

  it("integração: o harness detectado vai na linha, sem duplicar o que o chamador já mandou nas extras", () => {
    const raiz = temp();
    mkdirSync(join(raiz, ".git"));
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok declarado', { EXPX_TRABALHO_ID: "t", EXPX_HARNESS: "opencode" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok claudecode', { EXPX_TRABALHO_ID: "t", CLAUDECODE: "1" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok sem-sinal', { EXPX_TRABALHO_ID: "t" });
    roda(raiz, 'expx_rastro_grava "$PWD" fase_iniciada skill ok extras \'[]\' \'"sessao":"claude@1","harness":"claude"\'', {
      EXPX_TRABALHO_ID: "t",
      CLAUDECODE: "1",
    });

    const linhas = eventos(raiz)["t.jsonl"] ?? [];
    const [declarado, claudecode, semSinal, extras] = linhas.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(declarado).toMatchObject({ harness: "opencode" });
    expect(claudecode).toMatchObject({ harness: "claude-code" });
    expect(semSinal).not.toHaveProperty("harness");
    expect(extras).toMatchObject({ harness: "claude", sessao: "claude@1" });
    expect((linhas[3] ?? "").match(/"harness":/g)).toHaveLength(1);
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

describe("expx_trabalho_id antes do ORQUESTRADOR.md e pelo frontmatter", () => {
  const fm = (id: string): string => `---\nkind: x\ntrabalho_id: ${id}\n---\n# t\n`;

  /** Repositório na `branch`, com os arquivos dados (caminho relativo a `docs/` → conteúdo). */
  function repo(branch: string, arquivos: Record<string, string | Buffer>): string {
    const raiz = temp();
    git(raiz, "init", "-q", "-b", branch);
    for (const [rel, conteudo] of Object.entries(arquivos)) {
      const f = join(raiz, "docs", rel);
      mkdirSync(join(f, ".."), { recursive: true });
      writeFileSync(f, conteudo);
    }
    return raiz;
  }

  const id = (raiz: string): string => roda(raiz, 'expx_trabalho_id "$PWD"').trimEnd();

  /** Duas ocorrências fechadas da runx, que não podem decidir pela nova. */
  const OCS_ANTIGAS = {
    "manutencao/OC-2026-0005-z/ORQUESTRADOR.md": fm("OC-2026-0005"),
    "manutencao/OC-2026-0006-y/ORQUESTRADOR.md": fm("OC-2026-0006"),
  };

  it("funcional: na F1 da sprintx, só com 00-PLANEJAMENTO.md na pasta da branch, o trabalho é o dela", () => {
    const raiz = repo("feature/nova", {
      "sprintx/features/a/ORQUESTRADOR.md": fm("a"),
      "sprintx/features/b/ORQUESTRADOR.md": fm("b"),
      "sprintx/features/nova/00-PLANEJAMENTO.md": fm("nova"),
    });
    expect(id(raiz)).toBe("nova");
  });

  it("funcional: no E1 da runx, só com 00-OCORRENCIA.md, o trabalho é o id do frontmatter, sem o slug", () => {
    const raiz = repo("fix/OC-2026-0007-x", {
      ...OCS_ANTIGAS,
      "manutencao/OC-2026-0007-x/00-OCORRENCIA.md": fm("OC-2026-0007"),
    });
    expect(id(raiz)).toBe("OC-2026-0007");
  });

  it("funcional: depois do E2 da runx, com ORQUESTRADOR.md e 00-OCORRENCIA.md, o id é o do frontmatter", () => {
    const raiz = repo("fix/OC-2026-0007-x", {
      ...OCS_ANTIGAS,
      "manutencao/OC-2026-0007-x/ORQUESTRADOR.md": fm("OC-2026-0007"),
      "manutencao/OC-2026-0007-x/00-OCORRENCIA.md": fm("OC-2026-0007"),
    });
    expect(id(raiz)).toBe("OC-2026-0007");
  });

  it("funcional: a pasta com dois marcadores conta uma vez, e o único trabalho sai pelo frontmatter", () => {
    const raiz = repo("main", {
      "manutencao/OC-2026-0007-x/ORQUESTRADOR.md": fm("OC-2026-0007"),
      "manutencao/OC-2026-0007-x/00-OCORRENCIA.md": fm("OC-2026-0007"),
    });
    expect(id(raiz)).toBe("OC-2026-0007");
  });

  it("funcional: os marcadores do planejamento não contam sem a branch — o único ORQUESTRADOR.md continua decidindo", () => {
    expect(
      id(
        repo("main", {
          "sprintx/features/unico/ORQUESTRADOR.md": fm("unico"),
          "sprintx/features/abandonada/00-PLANEJAMENTO.md": fm("abandonada"),
          "manutencao/OC-2026-0009-w/00-OCORRENCIA.md": fm("OC-2026-0009"),
        }),
      ),
    ).toBe("unico");
    expect(id(repo("main", { "sprintx/features/so-planejada/00-PLANEJAMENTO.md": fm("so-planejada") }))).toBe(
      "sem-trabalho",
    );
  });

  it("funcional: a sprintx grava trabalho_id igual ao slug, e a pasta da branch devolve o slug", () => {
    const raiz = repo("feature/nova", {
      "sprintx/features/a/ORQUESTRADOR.md": fm("a"),
      "sprintx/features/nova/ORQUESTRADOR.md": fm("nova"),
      "sprintx/features/nova/00-PLANEJAMENTO.md": fm("nova"),
    });
    expect(id(raiz)).toBe("nova");
  });

  const BOM = String.fromCharCode(0xfeff);
  const linhas50 = Array.from({ length: 50 }, (_, i) => `k${String(i)}: v`).join("\n");

  /** Frontmatter com id seguro: o hook devolve OC-2026-0007. */
  const VALIDOS: string[] = [
    "---\r\nkind: x\r\ntrabalho_id: OC-2026-0007\r\n---\r\n",
    '---\ntrabalho_id: "OC-2026-0007"\n---\n',
    "---\ntrabalho_id: 'OC-2026-0007'\n---\n",
    "---\ntrabalho_id:    OC-2026-0007   \n---\n",
    "---\ntrabalho_id: OC-2026-0007\n\nkind: x\n---\n",
    "---\ntrabalho_id: OC-2026-0007\n# comentario\nkind: x\n---\n",
    // o BOM do início sai antes do `---`, como no painel (D-25)
    `${BOM}---\ntrabalho_id: OC-2026-0007\n---\n`,
    `${BOM}---\r\ntrabalho_id: OC-2026-0007\r\n---\r\n`,
    // o comentário YAML (espaço ou tab antes do #) sai, como no painel (conselhos#283)
    fm("OC-2026-0007 # comentario"),
    "---\ntrabalho_id: OC-2026-0007\t# comentario\n---\n",
    // a linha indentada só com comentário, logo depois da chave, é comentário, não continuação
    "---\ntrabalho_id: OC-2026-0007\n  # nota\n---\n",
    "---\ntrabalho_id: OC-2026-0007\n\t# nota\nkind: x\n---\n",
    "---\ntrabalho_id: OC-2026-0007\n\n  # nota\n---\n",
    // entre aspas, o mesmo texto é string
    '---\ntrabalho_id: "OC-2026-0007"\nkind: "0123"\n---\n',
    // parece número, mas o YAML lê string
    "---\ntrabalho_id: OC-2026-0007\n---\n",
    '---\ntrabalho_id: "OC-2026-0007" # comentario\n---\n',
    "---\ntrabalho_id: 'OC-2026-0007'\t# comentario\n---\n",
    // dentro das aspas, # é texto, e o painel apara os espaços (z.string().trim())
    '---\ntrabalho_id: " OC-2026-0007 "\n---\n',
    // a chave com espaço antes dos dois-pontos, ou entre aspas, é a mesma para o YAML
    "---\ntrabalho_id : OC-2026-0007\n---\n",
    '---\n"trabalho_id": OC-2026-0007\n---\n',
    "---\n'trabalho_id': OC-2026-0007\n---\n",
    // chave com escape que decodifica para OUTRO nome não zera o id (CodeAnt no conselhos#293)
    '---\ntrabalho_id: OC-2026-0007\n"outro\\\\campo": x\n---\n',
    '---\n"outro\\\\campo": x\ntrabalho_id: OC-2026-0007\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"t\\x72abalho": x\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"trabalho\\_id": x\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"a\\":b": x\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"titulo": "a \\"b\\""\n---\n',
  ];

  /** Frontmatter sem id seguro: o hook cai para o nome da pasta. */
  const INVALIDOS: (string | Buffer)[] = [
    fm("../x"),
    fm(""),
    fm("a b"),
    fm("-comeca-com-hifen"),
    fm("x".repeat(65)),
    // limite declarado no contrato: o hook lê o subconjunto que as skills escrevem, não um
    // YAML inteiro; âncora, tag, mapa em fluxo e escalar em bloco valem como sem id
    "---\nid_comum: &id OC-2026-0007\ntrabalho_id: *id\n---\n",
    "---\ntrabalho_id: !!str OC-2026-0007\n---\n",
    "---\n{trabalho_id: OC-2026-0007}\n---\n",
    "---\ntrabalho_id: >\n  OC-2026-0007\n---\n",
    '---\ntrabalho_id: "OC-2026-\\x30\\x30\\x30\\x37"\n---\n',
    "---\ntrabalho_id: 'OC-2026-''0007'\n---\n",
    // outra chave que começa igual, e dois-pontos sem espaço depois (não é chave para o YAML)
    "---\ntrabalho_idx: OC-2026-0007\n---\n",
    "---\ntrabalho_id:OC-2026-0007\n---\n",
    // sem aspas, o YAML do painel lê booleano, nulo e número, e o painel recusa o arquivo
    fm("true"),
    fm("False"),
    fm("null"),
    fm("0123"),
    fm("1.5"),
    fm("1e3"),
    fm("0x1F"),
    fm("0o17"),
    fm(".5"),
    // sem espaço antes, o # é parte do valor
    fm("OC-2026-0007#comentario"),
    '---\ntrabalho_id: "OC-2026-0007 # dentro das aspas"\n---\n',
    // aspas sem fecho, ou texto colado depois delas
    '---\ntrabalho_id: "OC-2026-0007\n---\n',
    '---\ntrabalho_id: "OC-2026-0007"x\n---\n',
    "kind: x\ntrabalho_id: OC-2026-0007\n",
    "# titulo\n---\ntrabalho_id: OC-2026-0007\n---\n",
    // só o BOM do início sai: em dobro, ou no meio do arquivo, ele é preâmbulo
    `${BOM}${BOM}---\ntrabalho_id: OC-2026-0007\n---\n`,
    `---\n${BOM}trabalho_id: OC-2026-0007\n---\n`,
    // a linha indentada depois da chave continua o valor no YAML do painel
    "---\ntrabalho_id: OC-2026-\n  0007\n---\n",
    "---\ntrabalho_id: OC-2026-0007\n\tx\n---\n",
    "---\ntrabalho_id: OC-2026-\n\n\n  0007\n---\n",
    // depois do comentário indentado, a continuação ainda invalida (o painel recusa o arquivo)
    "---\ntrabalho_id: OC-2026-\n  # nota\n  0007\n---\n",
    "---\ntrabalho_id: OC-2026-\n# nota\n  0007\n---\n",
    // chave repetida: o YAML do painel recusa o arquivo (Map keys must be unique)
    "---\ntrabalho_id: OC-2026-0007\ntrabalho_id: OC-B\n---\n",
    "---\ntrabalho_id: OC-2026-0007\nkind: x\n\"trabalho_id\": OC-B\n---\n",
    // chave com escape, que o YAML do painel decodifica: pode ser a mesma, e o painel recusa
    '---\ntrabalho_id: OC-2026-0007\n"trabalho\\u005fid": OC-B\n---\n',
    '---\n"trabalho\\u005fid": OC-A\ntrabalho_id: OC-2026-0007\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"\\x74rabalho_id": OC-B\n---\n',
    '---\ntrabalho_id: OC-2026-0007\n"trabalho\\U0000005Fid": OC-B\n---\n',
    "---\nkind: x\n---\ntrabalho_id: OC-2026-0007\n",
    "---\n  trabalho_id: OC-2026-0007\n---\n",
    `---\n${linhas50}\ntrabalho_id: OC-2026-0007\n---\n`,
    Buffer.from("---\ntrabalho_id: OC-2026-\u00000007\n---\n"),
    Buffer.from("---\nkind: x\u0000\ntrabalho_id: OC-2026-0007\n---\n"),
  ];

  const naPasta = (conteudo: string | Buffer): string =>
    repo("fix/OC-2026-0007-x", { ...OCS_ANTIGAS, "manutencao/OC-2026-0007-x/ORQUESTRADOR.md": conteudo });

  it("funcional: o valor válido sai com CRLF, aspas e espaços das pontas", () => {
    for (const conteudo of VALIDOS) {
      const raiz = naPasta(conteudo);
      expect(id(raiz), JSON.stringify(conteudo)).toBe("OC-2026-0007");
      // e é o id que o leitor do painel lê no mesmo arquivo
      const lido = lerFrontmatter(conteudo);
      const dados = lido.ok ? (lido.dados as Record<string, unknown> | null) : null;
      expect(typeof dados?.["trabalho_id"] === "string" ? dados["trabalho_id"].trim() : null, JSON.stringify(conteudo)).toBe(
        "OC-2026-0007",
      );
      // o BOM sai por bytes: vale também fora de um locale UTF-8
      expect(roda(raiz, 'expx_trabalho_id "$PWD"', { LC_ALL: "C" }).trimEnd(), JSON.stringify(conteudo)).toBe("OC-2026-0007");
    }
  });

  it("funcional: frontmatter sem id seguro cai para o nome da pasta", () => {
    for (const conteudo of INVALIDOS) {
      expect(id(naPasta(conteudo)), JSON.stringify(conteudo.toString())).toBe("OC-2026-0007-x");
    }
  });

  it("funcional: quando o hook e o painel aceitam o id, é o mesmo id", () => {
    // Além dos casos acima, formas que o YAML lê de outro jeito que o olho. Hook que
    // recusa cai no nome da pasta, como antes da 0.13.19; painel que recusa (número,
    // booleano, chave repetida) não mostra o trabalho, e o id do arquivo não importa.
    const sondas = [
      "---\ntrabalho_id: 0123\n---\n",
      "---\ntrabalho_id: true\n---\n",
      "---\ntrabalho_id: 0x1F\n---\n",
      "---\ntrabalho_id:\tOC-2026-0007\n---\n",
      "---\ntrabalho_id: OC-2026-0007\ntrabalho_id: OC-B\n---\n",
      "---\ntrabalho_id: OC-2026-0007\n  # comentario indentado\n---\n",
      // o painel fecha o bloco em qualquer linha que comece com `---`
      "---\n trabalho_id: OC-A\n--- texto\ntrabalho_id: OC-B\n---\n",
      "---\nkind: x\n----\ntrabalho_id: OC-B\n---\n",
    ];
    for (const conteudo of [...VALIDOS, ...INVALIDOS, ...sondas]) {
      const doHook = id(naPasta(conteudo));
      if (doHook === "OC-2026-0007-x") continue;
      const lido = lerFrontmatter(conteudo.toString());
      const dados = lido.ok ? (lido.dados as Record<string, unknown> | null) : null;
      const doPainel = typeof dados?.["trabalho_id"] === "string" ? dados["trabalho_id"].trim() : null;
      if (doPainel === null) continue;
      expect(doHook, JSON.stringify(conteudo.toString())).toBe(doPainel);
    }
  });

  it("funcional: frontmatters gerados de peças soltas também concordam com o painel", () => {
    const pecas = [
      "---", "--- x", "----", "trabalho_id: OC-A", " trabalho_id: OC-B", "trabalho_id: 'OC-C'", 'trabalho_id: "OC-D"',
      "trabalho_id: OC-E # c", "trabalho_id:", "trabalho_id:\tOC-F", "  cont", "\tcont", "", "# c", "  # c", "kind: x",
      "lista:", "  - item", "texto: |", "  trabalho_id: OC-G",
    ];
    let semente = 20261109;
    // LCG em 32 bits (Math.imul não perde precisão), sorteado pelos bits altos
    const sorteia = (n: number): number => {
      semente = (Math.imul(semente, 1103515245) + 12345) >>> 0;
      return (semente >>> 16) % n;
    };
    const raiz = naPasta("");
    const orq = join(raiz, "docs", "manutencao", "OC-2026-0007-x", "ORQUESTRADOR.md");
    let comparados = 0;
    for (let i = 0; i < 150; i++) {
      const linhas = ["---", ...Array.from({ length: 1 + sorteia(6) }, () => pecas[sorteia(pecas.length)] ?? "")];
      if (sorteia(3) > 0) linhas.push("---");
      const fim = sorteia(4) === 0 ? "\r\n" : "\n";
      const conteudo = (sorteia(5) === 0 ? BOM : "") + linhas.join(fim) + fim;
      writeFileSync(orq, conteudo);
      const doHook = id(raiz);
      if (doHook === "OC-2026-0007-x") continue;
      const lido = lerFrontmatter(conteudo);
      const dados = lido.ok ? (lido.dados as Record<string, unknown> | null) : null;
      const doPainel = typeof dados?.["trabalho_id"] === "string" ? dados["trabalho_id"].trim() : null;
      if (doPainel === null) continue;
      expect(doHook, JSON.stringify(conteudo)).toBe(doPainel);
      comparados++;
    }
    // a semente fixa tem de chegar a casos em que os dois aceitam, senão o teste não prova nada
    expect(comparados).toBeGreaterThanOrEqual(10);
  });

  it("funcional: arquivo ilegível cai para o próximo marcador e, sem ele, para o nome da pasta", () => {
    if (process.platform === "win32" || process.getuid?.() === 0) return;
    const raiz = repo("fix/OC-2026-0007-x", { ...OCS_ANTIGAS, "manutencao/OC-2026-0007-x/ORQUESTRADOR.md": fm("OC-2026-0007") });
    const orq = join(raiz, "docs", "manutencao", "OC-2026-0007-x", "ORQUESTRADOR.md");
    spawnSync("chmod", ["000", orq]);
    try {
      expect(id(raiz)).toBe("OC-2026-0007-x");
      // o arquivo ilegível não suja o stderr de cada chamada de hook
      const r = spawnSync(BASH, ["-c", '. "$1"; expx_trabalho_id "$PWD"', "rastro", RASTRO], { cwd: raiz, encoding: "utf8" });
      expect(r.stderr).toBe("");
      writeFileSync(join(raiz, "docs", "manutencao", "OC-2026-0007-x", "00-OCORRENCIA.md"), fm("OC-2026-0007"));
      expect(id(raiz)).toBe("OC-2026-0007");
    } finally {
      spawnSync("chmod", ["644", orq]);
    }
  });

  it("funcional: precedência ORQUESTRADOR > 00-OCORRENCIA > 00-PLANEJAMENTO, e o inválido não barra o seguinte", () => {
    const pasta = "manutencao/OC-2026-0007-x";
    const caso = (arquivos: Record<string, string>): string =>
      id(
        repo("fix/OC-2026-0007-x", {
          ...OCS_ANTIGAS,
          ...Object.fromEntries(Object.entries(arquivos).map(([f, c]) => [`${pasta}/${f}`, c])),
        }),
      );
    expect(caso({ "ORQUESTRADOR.md": fm("OC-A"), "00-OCORRENCIA.md": fm("OC-B"), "00-PLANEJAMENTO.md": fm("OC-C") })).toBe("OC-A");
    expect(caso({ "00-OCORRENCIA.md": fm("OC-B"), "00-PLANEJAMENTO.md": fm("OC-C") })).toBe("OC-B");
    expect(caso({ "ORQUESTRADOR.md": fm("../x"), "00-OCORRENCIA.md": fm("OC-B") })).toBe("OC-B");
    expect(caso({ "ORQUESTRADOR.md": "# sem frontmatter\n", "00-OCORRENCIA.md": "---\n---\n", "00-PLANEJAMENTO.md": fm("OC-C") })).toBe("OC-C");
    // a primeira chave decide: a segunda não conserta a primeira inválida
    const duasChaves = "---\ntrabalho_id: ../x\ntrabalho_id: OC-A\n---\n";
    expect(caso({ "ORQUESTRADOR.md": duasChaves, "00-OCORRENCIA.md": fm("OC-B") })).toBe("OC-B");
    expect(caso({ "ORQUESTRADOR.md": duasChaves })).toBe("OC-2026-0007-x");
  });

  it("funcional: expx_id_do_frontmatter só escreve num nome de variável do shell", () => {
    const raiz = repo("main", { "x/ORQUESTRADOR.md": fm("OC-A") });
    const arq = join(raiz, "docs", "x", "ORQUESTRADOR.md").replace(/\\/g, "/");
    const marca = join(raiz, "marca").replace(/\\/g, "/");
    const saida = roda(raiz, `expx_id_do_frontmatter 'v[$(: > "${marca}")]' "${arq}"; ok=$?; expx_id_do_frontmatter id "${arq}"; printf '%s|%s' "$ok" "$id"`);
    expect(saida).toBe("0|OC-A");
    expect(readdirSync(raiz)).not.toContain("marca");
  });

  it("integração: numa worktree da runx o evento do núcleo cai no rastro do id da ocorrência", () => {
    const raiz = repo("main", {
      ...OCS_ANTIGAS,
      "manutencao/OC-2026-0007-x/ORQUESTRADOR.md": fm("OC-2026-0007"),
    });
    git(raiz, "add", "-A");
    git(raiz, "commit", "-q", "-m", "base");
    const wt = join(temp(), "wt");
    git(raiz, "worktree", "add", "-q", "-b", "fix/OC-2026-0007-x", wt);
    roda(wt, 'expx_rastro_grava "$PWD" acao_permitida hook permitido x');
    const ev = eventos(wt);
    expect(Object.keys(ev)).toEqual(["OC-2026-0007.jsonl"]);
    expect(JSON.parse(ev["OC-2026-0007.jsonl"]?.[0] ?? "{}")).toMatchObject({ trabalho_id: "OC-2026-0007" });
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
