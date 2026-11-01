import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ehSuiteDeTesteDeHook } from "../harness/hooks.js";
import {
  ambienteCom,
  arvore,
  bashDosHooks,
  CANDIDATOS,
  fontesCandidatas,
  gitEm,
  jqVisivelCom,
  larIsolado,
  novoProduto,
  pathControlado,
  pathDosHooks,
  pathDosHooksSemJq,
  rodarExpx,
  rodarHook,
  rodarHookComPayload,
  sha256,
  snapshot,
  temporarios,
} from "../teste/candidatos.js";

/**
 * Certificação P0.2: snapshots canônicos de SprintX + MergeX instalados SÓ pelo
 * `expxdev init` real (o binário do `dist/`, num processo novo), a partir dos
 * snapshots fixados em `fixtures/candidatos/`. Nenhum arquivo é copiado,
 * nenhum settings ou hooks.json é montado à mão: o que está no produto é o que
 * o `init` escreveu.
 *
 * Os dois commits são os merges coordenados dos PRs AxisGov/sprintx#17 e
 * AxisGov/mergex#8. A SprintX produz `00-PREDECESSORES.md` com prova pela
 * história Git; a MergeX consome essa prova na V9 e permite retomar uma entrega
 * bloqueada exclusivamente pelos predecessores demonstrados.
 * A fixture SprintX avança com os merges canônicos necessários à composição;
 * o SHA abaixo torna qualquer avanço explícito e auditável.
 *
 * Os dois snapshots são o commit, byte a byte — não há propagação a reaplicar.
 */

type Json = Record<string, any>;

let fontes = "";
/** O HOME descartável de TODO init e doctor desta bancada. */
let lar = "";
let envLar: Record<string, string> = {};
let A = "";
let B = "";
let saidaA: ReturnType<typeof rodarExpx>;

function init(produto: string, skills: string, comJq = true): ReturnType<typeof rodarExpx> {
  return rodarExpx(
    ["init", "--skills", skills, "--yes"],
    produto,
    ambienteCom(pathControlado(comJq), { ...envLar, EXPX_SKILLS_LOCAIS: fontes }),
  );
}

function doctor(produto: string): ReturnType<typeof rodarExpx> {
  return rodarExpx(["doctor"], produto, ambienteCom(pathControlado(true), envLar));
}

function produto(): string {
  return novoProduto();
}

function json(caminho: string): Json {
  return JSON.parse(readFileSync(caminho, "utf8")) as Json;
}

/**
 * O byte ESC, escrito como sequência de escape e não cru.
 *
 * Ele é o assunto de duas provas daqui — a cor de terminal que a classificação
 * da suíte tem de apagar, e o controle que o `detalhe` tem de escapar para a
 * linha continuar JSON —, e nas duas o que importa é o byte que CHEGA ao hook,
 * não como o fonte o escreve. Cru no fonte, ele é invisível em diff, em revisão
 * e no terminal de quem lê o teste.
 */
const ESC = "\u001b";

/** O rastro em que o `rastro-post.sh` grava quando a sessão não reivindica trabalho. */
const RASTRO = "docs/eventos/sem-trabalho.jsonl";

/**
 * Entrega ao `rastro-post.sh` INSTALADO (pelo comando registrado no settings que
 * o `init` escreveu) o PostToolUse de um comando de suíte, e devolve a LINHA crua
 * que ele gravou no jsonl junto com o evento `suite_executada` lido dela.
 *
 * `resposta` vai para `tool_response` na forma em que for dada: string, e também
 * OBJETO — no Bash o Claude Code entrega `{stdout, stderr, interrupted}`, e é
 * essa a forma real que o hook tem de classificar.
 *
 * Duas conferências acontecem aqui, e as duas são prova:
 *
 * - a leitura do jsonl é em UTF-8 ESTRITO: byte inválido lança aqui, como lança
 *   em consumidor estrito. O painel atual não lança — ele troca por U+FFFD;
 * - o `JSON.parse` da linha é estrito quanto a CONTROLE: JSON proíbe
 *   U+0000..U+001F cru dentro de string, e uma linha com ESC cru morre aqui.
 */
function linhaDaSuite(p: string, comando: string, resposta: unknown, path?: string): { linha: string; evento: Json } {
  rmSync(join(p, RASTRO), { force: true });
  const r = rodarHookComPayload(
    p,
    "rastro-post.sh",
    { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: comando }, tool_response: resposta, cwd: p },
    path ?? pathDosHooks(),
  );
  expect(r.status, r.stderr).toBe(0);
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(join(p, RASTRO)));
  const linhas = texto.split("\n").filter((l) => l.trim() !== "");
  expect(linhas).toHaveLength(1);
  const linha = linhas[0] as string;
  const evento = JSON.parse(linha) as Json;
  expect(evento["evento"]).toBe("suite_executada");
  return { linha, evento };
}

function eventoDaSuite(p: string, comando: string, resposta: unknown, path?: string): Json {
  return linhaDaSuite(p, comando, resposta, path).evento;
}

/** Todos os hooks do settings como (evento, matcher, definição). */
function hooksDoSettings(s: Json): Array<{ evento: string; matcher: string; hook: Json }> {
  const saida: Array<{ evento: string; matcher: string; hook: Json }> = [];
  for (const [evento, grupos] of Object.entries((s["hooks"] ?? {}) as Record<string, any[]>)) {
    for (const g of grupos) for (const h of g.hooks ?? []) saida.push({ evento, matcher: g.matcher ?? "", hook: h });
  }
  return saida;
}

/** O conteúdo gerenciado de um produto, com o caminho do próprio produto neutralizado. */
function gerenciado(p: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const rel of arvore(join(p, ".claude"))) {
    let t = readFileSync(join(p, ".claude", rel), "utf8");
    if (rel === "settings.json") t = t.split(JSON.stringify(p).slice(1, -1)).join("<PRODUTO>");
    saida[`.claude/${rel}`] = t;
  }
  for (const rel of arvore(join(p, ".expx"))) {
    let t = readFileSync(join(p, ".expx", rel), "utf8");
    if (rel === "expx-lock.json") {
      const l = JSON.parse(t) as Json;
      for (const s of Object.values(l["skills"] as Record<string, Json>)) delete s["resolvido_em"];
      t = JSON.stringify(l, null, 2);
    }
    saida[`.expx/${rel}`] = t;
  }
  return saida;
}

beforeAll(() => {
  fontes = fontesCandidatas();
  const isolado = larIsolado();
  lar = isolado.lar;
  envLar = isolado.env;
  A = produto();
  saidaA = init(A, "sprintx,mergex");
  B = produto();
  init(B, "mergex,sprintx");
}, 600000);

/**
 * O ciclo oficial da bancada: tudo que os helpers de `candidatos.ts` criaram
 * nesta execução — fontes, produtos, lar, e TODA pasta de links de PATH montada
 * pelos `init` e `doctor` daqui — sai junto.
 */
afterAll(() => {
  temporarios.descartar();
});

describe("P0.2 — init real de SprintX + MergeX", () => {
  it("integração: wrapper e módulos do lembrete entram no produto, marketplace e lock", () => {
    const lock = json(join(A, ".expx", "expx-lock.json"));
    const arquivos = (lock["instalacao"] as Json)["arquivos"] as Record<string, string>;
    const relativos = [
      ".claude/hooks/expx-lembrete.sh",
      ".claude/hooks/expx-lembrete.mjs",
      ".claude/hooks/expx-lembrete-estado.mjs",
      ".expx/marketplace/plugins/expx/nucleo/hooks/expx-lembrete.sh",
      ".expx/marketplace/plugins/expx/nucleo/hooks/expx-lembrete.mjs",
      ".expx/marketplace/plugins/expx/nucleo/hooks/expx-lembrete-estado.mjs",
    ];

    for (const relativo of relativos) {
      const caminho = join(A, ...relativo.split("/"));
      expect.soft(existsSync(caminho), relativo).toBe(true);
      if (existsSync(caminho)) expect.soft(arquivos[relativo], relativo).toBe(sha256(caminho));
    }
  });

  it("integração: o init real sai 0 e não registra plugin fora da fixture (claude ausente do PATH)", () => {
    expect(saidaA.stderr).toBe("");
    expect(saidaA.status).toBe(0);
    expect(saidaA.stdout).toContain("instaladas: mergex, sprintx");
    expect(saidaA.stdout).toContain("claude plugin marketplace add");
  });

  it("integração: o init não escreve nada no HOME nem no CLAUDE_CONFIG_DIR que recebeu", () => {
    // O `init` de A e B já rodou no beforeAll com este HOME. Se a instalação do
    // plugin tivesse acontecido, `~/.claude/plugins/cache/` estaria aqui — e a
    // bancada estaria mexendo na configuração de quem a roda.
    expect(arvore(lar)).toEqual([]);
    expect(existsSync(join(lar, ".claude"))).toBe(false);
  });

  it("funcional: 1-2 — a árvore de hooks de cada skill está inteira, byte a byte, menos a suíte de teste", () => {
    for (const nome of Object.keys(CANDIDATOS) as Array<keyof typeof CANDIDATOS>) {
      const fonte = join(snapshot(nome), ".claude", "hooks");
      const arquivos = arvore(fonte).filter((r) => r !== "hooks.json");
      expect(arquivos.length).toBeGreaterThan(3);
      for (const rel of arquivos) {
        // a suíte (teste.sh, testes/) carrega amostras de segredo e não é instalada
        if (ehSuiteDeTesteDeHook(rel)) {
          expect(existsSync(join(A, ".claude", "hooks", rel)), `${nome}: ${rel} instalado`).toBe(false);
          continue;
        }
        expect(sha256(join(A, ".claude", "hooks", rel)), `${nome}: ${rel}`).toBe(sha256(join(fonte, rel)));
      }
    }
    expect(existsSync(join(A, ".claude/hooks/sprintx/escopo-da-task.sh"))).toBe(true);
    expect(existsSync(join(A, ".claude/hooks/mergex/commit-por-task.sh"))).toBe(true);
    expect(existsSync(join(A, ".claude/hooks/comum/rastro.sh"))).toBe(true);
    expect(existsSync(join(A, ".claude/hooks/comum/base.sh"))).toBe(true);
  });

  it("funcional: 3-4 — os dois git-perigoso coexistem, com ids distintos", () => {
    const s = sha256(join(A, ".claude/hooks/sprintx/git-perigoso.sh"));
    const m = sha256(join(A, ".claude/hooks/mergex/git-perigoso.sh"));
    expect(s).toBe(sha256(join(snapshot("sprintx"), ".claude/hooks/sprintx/git-perigoso.sh")));
    expect(m).toBe(sha256(join(snapshot("mergex"), ".claude/hooks/mergex/git-perigoso.sh")));
    expect(s).not.toBe(m);
    const modos = json(join(A, ".expx/hooks.json"))["hooks"] as Json;
    expect(modos["sprintx/git-perigoso"]).toEqual({ modo: "bloqueio", tipo: "seguranca" });
    expect(modos["mergex/git-perigoso"]).toEqual({ modo: "bloqueio" });
  });

  it("funcional: 5-6 — o settings registra cada hook das duas skills com evento, matcher, command e timeout", () => {
    const instalados = hooksDoSettings(json(join(A, ".claude/settings.json")));
    for (const nome of Object.keys(CANDIDATOS) as Array<keyof typeof CANDIDATOS>) {
      const publicados = hooksDoSettings(json(join(snapshot(nome), ".claude/settings.json")));
      expect(publicados.length).toBeGreaterThan(3);
      for (const p of publicados) {
        const achados = instalados.filter((i) => i.evento === p.evento && i.matcher === p.matcher && JSON.stringify(i.hook) === JSON.stringify(p.hook));
        expect(achados, `${nome}: ${p.evento} ${p.hook["command"]}`).toHaveLength(1);
      }
    }
    const git = instalados.filter((i) => String(i.hook["command"]).includes("git-perigoso.sh"));
    expect(git.map((g) => [g.evento, g.matcher, g.hook["timeout"]])).toEqual([
      ["PreToolUse", "Bash", 30],
      ["PreToolUse", "Bash", 30],
    ]);
  });

  it("funcional: 7 — o manifesto expx registra todos os ids das duas skills", () => {
    const modos = json(join(A, ".expx/hooks.json"))["hooks"] as Json;
    for (const nome of Object.keys(CANDIDATOS) as Array<keyof typeof CANDIDATOS>) {
      const pub = json(join(snapshot(nome), ".expx/hooks.json"))["hooks"] as Json;
      for (const [id, cfg] of Object.entries(pub)) expect(modos[id], `${nome}: ${id}`).toEqual(cfg);
    }
  });

  it("funcional: 8 — o catálogo de método da MergeX está instalado pelo mecanismo normal", () => {
    const rel = ".claude/skills/mergex/scripts/catalogo-de-metodo.sh";
    expect(CANDIDATOS.sprintx.sha).toBe("d5acea705641f9d8b45ed1d25ec102bc5c612275");
    expect(CANDIDATOS.mergex.sha).toBe("6e01fc9eb3586264ac170a5be8e95bc1feea16c1");
    expect(sha256(join(A, rel))).toBe(sha256(join(snapshot("mergex"), rel)));
    expect(readFileSync(join(A, rel), "utf8")).toContain("PREFLIGHT.md");
  });

  it("integração: o produtor SprintX instalado gera predecessores que a MergeX instalada prova", () => {
    const p = produto();
    expect(init(p, "sprintx,mergex").status).toBe(0);

    const produtor = join(p, ".claude/skills/sprintx/scripts/predecessores.sh");
    const consumidor = join(p, ".claude/skills/mergex/scripts/predecessores-sprintx.sh");
    expect(existsSync(produtor)).toBe(true);
    expect(existsSync(consumidor)).toBe(true);

    mkdirSync(join(p, "docs/superpowers/specs"), { recursive: true });
    mkdirSync(join(p, "docs/superpowers/plans"), { recursive: true });
    mkdirSync(join(p, "docs/sprintx/features/protocolo-predecessores"), { recursive: true });
    writeFileSync(join(p, "docs/superpowers/specs/protocolo-design.md"), "# Especificacao\n");
    writeFileSync(join(p, "docs/superpowers/plans/protocolo.md"), "# Plano\n");
    gitEm(p, "add", "docs/superpowers");
    gitEm(p, "commit", "-q", "-m", "docs: registra predecessores");
    writeFileSync(join(p, "docs/sprintx/features/protocolo-predecessores/00-PLANEJAMENTO.md"), "# Planejamento\n");

    for (const [papel, caminho] of [
      ["especificacao", "docs/superpowers/specs/protocolo-design.md"],
      ["plano", "docs/superpowers/plans/protocolo.md"],
    ] as const) {
      const registro = spawnSync(
        bashDosHooks(),
        [produtor, "--registrar", "protocolo-predecessores", "--origem", "superpowers", "--papel", papel, "--caminho", caminho],
        { cwd: p, encoding: "utf8" },
      );
      expect(registro.status, registro.stderr).toBe(0);
    }

    gitEm(p, "add", "docs/sprintx/features/protocolo-predecessores");
    gitEm(p, "commit", "-q", "-m", "chore(sprintx): nasce planejamento");
    const head = gitEm(p, "rev-parse", "HEAD").trim();
    const prova = spawnSync(
      bashDosHooks(),
      [consumidor, "--verificar", "--rev", head, "--trabalho", "protocolo-predecessores"],
      { cwd: p, encoding: "utf8" },
    );
    expect(prova.status, prova.stderr).toBe(0);
    expect(prova.stdout.split("\n").filter((linha) => linha.startsWith("predecessor\t"))).toHaveLength(2);
    expect(prova.stdout).toContain("resultado=ok\n");
  });

  it("funcional: 9 — os hooks do núcleo continuam instalados e registrados", () => {
    expect(existsSync(join(A, ".claude/hooks/expx-session-sync.mjs"))).toBe(true);
    expect(existsSync(join(A, ".claude/hooks/expx-lembrete.sh"))).toBe(true);
    const hooks = hooksDoSettings(json(join(A, ".claude/settings.json")));
    expect(hooks.some((h) => h.evento === "SessionStart" && h.hook["command"] === "node")).toBe(true);
    expect(hooks.some((h) => h.evento === "UserPromptSubmit" && String(h.hook["command"]).includes("expx-lembrete.sh"))).toBe(true);
  });

  it("funcional: 10 — o lock cobre hooks, helpers, catálogo, settings e hooks.json", () => {
    const l = json(join(A, ".expx/expx-lock.json"));
    const inst = l["instalacao"] as Json;
    for (const rel of [
      ".claude/hooks/sprintx/git-perigoso.sh",
      ".claude/hooks/mergex/git-perigoso.sh",
      ".claude/hooks/comum/base.sh",
      ".claude/hooks/comum/rastro.sh",
      ".claude/hooks/expx-lembrete.sh",
      ".claude/skills/mergex/scripts/catalogo-de-metodo.sh",
      ".claude/skills/sprintx/SKILL.md",
    ]) {
      expect(inst["arquivos"][rel], rel).toBe(sha256(join(A, rel)));
    }
    const entradas = inst["settings"]["entradas"] as Json[];
    expect(entradas.filter((e) => String(e["hook"]["command"]).includes("git-perigoso")).length).toBe(2);
    expect(entradas.length).toBe(hooksDoSettings(json(join(A, ".claude/settings.json"))).length);
    expect(inst["modos"]["hash"]).toBe(sha256(join(A, ".expx/hooks.json")));
    expect(doctor(A).status).toBe(0);
  });

  it("funcional: ordem invertida produz a mesma instalação gerenciada, byte a byte", () => {
    const a = gerenciado(A);
    const b = gerenciado(B);
    expect(Object.keys(b)).toEqual(Object.keys(a));
    for (const k of Object.keys(a)) expect(b[k], k).toBe(a[k]);
  });

  it("funcional: init repetido, na mesma ordem e invertido, não muda nada nem cria backup", () => {
    const p = produto();
    expect(init(p, "sprintx,mergex").status).toBe(0);
    const antes = gerenciado(p);
    expect(init(p, "sprintx,mergex").status).toBe(0);
    expect(gerenciado(p)).toEqual(antes);
    expect(init(p, "mergex,sprintx").status).toBe(0);
    expect(gerenciado(p)).toEqual(antes);
    expect(readdirSync(join(p, ".claude")).filter((f) => f.includes("backup"))).toEqual([]);
  });
});

describe("P0.2 — o que é do projeto sobrevive à composição", () => {
  it("integração: settings, modos e .expx da pessoa são preservados em init e reinit", () => {
    const p = produto();
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(
      join(p, ".claude/settings.json"),
      JSON.stringify({
        permissions: { allow: ["Bash(ls:*)"] },
        hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo meu-hook", timeout: 5 }] }] },
      }),
    );
    mkdirSync(join(p, ".expx/memoria"), { recursive: true });
    writeFileSync(join(p, ".expx/memoria/nota.md"), "minha memoria\n");
    writeFileSync(
      join(p, ".expx/hooks.json"),
      JSON.stringify({ expx_hooks: 1, hooks: { "meu-id": { modo: "aviso" }, "mergex/git-perigoso": { modo: "desligado" } } }),
    );

    for (const ordem of ["sprintx,mergex", "mergex,sprintx"]) {
      expect(init(p, ordem).status).toBe(0);
      const s = json(join(p, ".claude/settings.json"));
      expect(s["permissions"]).toEqual({ allow: ["Bash(ls:*)"] });
      const meu = hooksDoSettings(s).filter((h) => h.hook["command"] === "echo meu-hook");
      expect(meu).toHaveLength(1);
      expect(readFileSync(join(p, ".expx/memoria/nota.md"), "utf8")).toBe("minha memoria\n");
      const modos = json(join(p, ".expx/hooks.json"))["hooks"] as Json;
      expect(modos["meu-id"]).toEqual({ modo: "aviso" });
      expect(modos["mergex/git-perigoso"]).toEqual({ modo: "desligado" });
      expect(modos["sprintx/git-perigoso"]).toEqual({ modo: "bloqueio", tipo: "seguranca" });
    }
    expect(doctor(p).status).toBe(0);
  });
});

describe("P0.2 — provas funcionais com os hooks instalados", () => {
  const sprintx = ".claude/hooks/sprintx/git-perigoso.sh";
  const mergex = ".claude/hooks/mergex/git-perigoso.sh";
  let P = "";

  beforeAll(() => {
    P = produto();
    expect(init(P, "mergex,sprintx").status).toBe(0);
    gitEm(P, "add", "-A");
    gitEm(P, "commit", "-q", "-m", "instala skills");
  }, 300000);

  function modo(id: string, valor: string | undefined): void {
    const caminho = join(P, ".expx/hooks.json");
    const m = json(caminho);
    if (valor === undefined) m["hooks"][id] = { ...m["hooks"][id], modo: "bloqueio" };
    else m["hooks"][id] = { ...m["hooks"][id], modo: valor };
    writeFileSync(caminho, JSON.stringify(m, null, 2));
  }

  it("funcional: A — comando git inócuo é avaliado e liberado pelos dois", () => {
    for (const h of [sprintx, mergex]) {
      const r = rodarHook(P, h, "git status");
      expect(r.status, `${h}: ${r.stderr}`).toBe(0);
    }
  });

  it("funcional: B — comando proibido pela SprintX é barrado pela SprintX", () => {
    const r = rodarHook(P, sprintx, "git branch -D velha");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("sprintx/git-perigoso");
    expect(rodarHook(P, mergex, "git branch -D velha").status).toBe(0);
  });

  it("funcional: C — comando proibido pela MergeX é barrado pela MergeX", () => {
    const r = rodarHook(P, mergex, "git commit -m direto-na-main");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("mergex/git-perigoso");
    expect(rodarHook(P, sprintx, "git commit -m direto-na-main").status).toBe(0);
  });

  it("funcional: D — desligar só sprintx/git-perigoso mantém a MergeX ativa", () => {
    modo("sprintx/git-perigoso", "desligado");
    try {
      expect(rodarHook(P, sprintx, "git branch -D velha").status).toBe(0);
      expect(rodarHook(P, mergex, "git commit -m direto-na-main").status).toBe(2);
    } finally {
      modo("sprintx/git-perigoso", undefined);
    }
  });

  it("funcional: E — desligar só mergex/git-perigoso mantém a SprintX ativa", () => {
    modo("mergex/git-perigoso", "desligado");
    try {
      expect(rodarHook(P, mergex, "git commit -m direto-na-main").status).toBe(0);
      expect(rodarHook(P, sprintx, "git branch -D velha").status).toBe(2);
    } finally {
      modo("mergex/git-perigoso", undefined);
    }
  });
});

describe("P0.2 — o rastro do hook instalado é UTF-8 válido no corte do detalhe", () => {
  /**
   * O `rastro-post.sh` instalado corta `suite_executada.detalhe` em 120 BYTES —
   * o limite que o contrato `expx-eventos` impõe ao campo. Cortar por byte é o
   * único corte estável (o `-c` do `cut` é byte no GNU coreutils e caractere em
   * outras implementações), e por isso o corte tem de APARAR a sequência UTF-8
   * multibyte que ficar incompleta no fim: um byte-líder sem os bytes de
   * continuação que ele anuncia é byte inválido, e um único deles corrompe a
   * linha — e o arquivo — para quem lê o jsonl como UTF-8: o leitor do painel
   * hoje é tolerante e troca por U+FFFD, e um consumidor estrito lança.
   *
   * A tabela roda o HOOK REAL, pelo comando registrado no `settings.json` que o
   * `init` escreveu, uma vez por fronteira: o corte de 120 cai exatamente depois
   * de `k` bytes do primeiro caractere de `largura` bytes.
   *
   *   k <  largura → sequência incompleta no fim: tem de sumir inteira
   *   k == largura → sequência completa no fim: tem de ser preservada
   *
   * A regressão observada em campo é `largura=2, k=1`: byte-líder `0xc3` de um
   * `ã` pendurado sozinho no fim do `detalhe`.
   */
  let P = "";

  beforeAll(() => {
    P = produto();
    expect(init(P, "sprintx,mergex").status).toBe(0);
  }, 300000);

  /** O prefixo ASCII que faz o corte de 120 bytes cair depois de `k` bytes do caractere seguinte. */
  function prefixoDe(k: number): string {
    // `npm test -- ` tem 12 bytes e é o que faz o hook reconhecer uma suíte.
    return `npm test -- ${"x".repeat(120 - k - 12)}`;
  }

  function detalheDaSuite(comando: string, path?: string): string {
    return eventoDaSuite(P, comando, "Test Files  1 passed (1)", path)["detalhe"] as string;
  }

  /** Uma fronteira da tabela: corte depois de `k` bytes de um caractere de `largura` bytes. */
  function fronteira(char: string, largura: number, k: number, path?: string): void {
    const prefixo = prefixoDe(k);
    const esperado = k === largura ? `${prefixo}${char}` : prefixo;
    const detalhe = detalheDaSuite(`${prefixo}${char.repeat(3)}`, path);
    expect(detalhe).toBe(esperado);
    expect(Buffer.byteLength(detalhe, "utf8")).toBeLessThanOrEqual(120);
  }

  const LARGURAS: Array<[string, string, number]> = [
    ["2 bytes (á)", "á", 2],
    ["3 bytes (€)", "€", 3],
    ["4 bytes (🚀)", "🚀", 4],
  ];

  it("integração: o hook registrado grava o evento de suíte e o jsonl decodifica como UTF-8", () => {
    expect(detalheDaSuite("npm test -- --run")).toBe("npm test -- --run");
  });

  for (const [nome, char, largura] of LARGURAS) {
    for (let k = 1; k < largura; k++) {
      it(`funcional: sequência de ${nome} cortada depois de ${String(k)} byte(s) desaparece inteira`, () => {
        fronteira(char, largura, k);
      });
    }
    it(`funcional: sequência de ${nome} que termina no byte 120 é preservada`, () => {
      fronteira(char, largura, largura);
    });
  }

  it("funcional: ASCII no byte 120 continua cortado em 120 — o corte não apara a mais", () => {
    fronteira("Z", 1, 1);
  });

  it("funcional: comando de várias linhas vira UMA linha no detalhe, e ainda cabe em 120 bytes", () => {
    // O `cut -c1-120` do defeito era orientado a LINHA: num comando multilinha ele
    // cortava cada linha em 120 e devolvia TODAS, e o `detalhe` passava longe do
    // limite — e ainda ficava multilinha. É a forma exata do registro corrompido
    // observado em campo, onde o corte caiu no meio de um `ã` na 64ª linha de um
    // heredoc.
    //
    // `detalhe` é UMA linha pelo contrato: o hook normaliza CRLF, CR e LF para um
    // espaço ANTES de cortar. Por isso o esperado é o mesmo nas duas plataformas,
    // sem medir o jq: o LF que o jq materializa como CRLF no Windows e LF em POSIX
    // some igual nos dois, virando um espaço só.
    const prefixo = "npm test -- ";
    // 12 (prefixo) + 1 (o LF virado espaço) + 106 = 119 bytes: o byte 120 é o
    // byte-líder do `á` seguinte, e a sequência incompleta sai inteira.
    const enchimento = "x".repeat(120 - prefixo.length - 1 - 1);
    const esperado = `${prefixo} ${enchimento}`;
    expect(Buffer.byteLength(esperado, "utf8")).toBe(119);
    const detalhe = detalheDaSuite(`${prefixo}\n${enchimento}${"á".repeat(3)}`);
    expect(detalhe).toBe(esperado);
    expect(detalhe).not.toMatch(/[\r\n]/);
    expect(Buffer.byteLength(detalhe, "utf8")).toBe(119);
  });

  /**
   * O `detalhe` é texto que o USUÁRIO escolheu — o comando de suíte —, e JSON
   * proíbe caractere de controle CRU dentro de string (U+0000..U+001F). Um
   * `npm test` com cor de terminal (ESC), com barra de progresso ou com separador
   * de registro no meio punha o byte cru na linha, e a linha deixava de ser JSON:
   * o mesmo estrago do byte UTF-8 partido que o corte evita — o leitor do rastro
   * perde o arquivo a partir dali.
   *
   * Escapar só TAB, CR e LF deixava todo o resto passar inteiro. A prova é
   * CAUSAL pelo parser: `JSON.parse` de uma linha com ESC cru é SyntaxError
   * (`linhaDaSuite` o faz), então a linha só nasce legível se o hook escapar o
   * controle. E a volta pelo `detalhe` prova que o escape é reversível: o que o
   * comando dizia não foi trocado nem perdido no caminho.
   *
   * As duas rotas de leitura entram, porque elas NÃO são a mesma: sem jq, quem lê
   * o comando é `rastro_json_campo_em`, que esconde a barra escapada atrás do byte
   * 0x01 enquanto decodifica — e `` do payload decodifica para exatamente
   * esse byte. É o caso em que marcador interno e dado do usuário colidem, e por
   * isso o comando abaixo traz 0x01, barra invertida e aspas juntos.
   */
  const CONTROLES_CRUS = `${ESC}[1;31m\b\f\t\\"fim`;

  function controleNoDetalhe(path?: string): void {
    const comando = `npm test -- ${CONTROLES_CRUS}`;
    expect(Buffer.byteLength(comando, "utf8")).toBeLessThanOrEqual(120);
    const { linha, evento } = linhaDaSuite(P, comando, "Test Files  1 passed (1)", path);
    // o detalhe volta IGUAL ao comando: nada foi trocado nem perdido
    expect(evento["detalhe"]).toBe(comando);
    // e no disco não há controle cru nenhum — o que está lá é o escape
    expect(/[ -]/.test(linha), linha).toBe(false);
    for (const escapado of ["\\u001b", "\\u0001", "\\u0007", "\\u000b", "\\u001f", "\\b", "\\f", "\\t", "\\\\", '\\"']) {
      expect(linha, escapado).toContain(escapado);
    }
  }

  it("funcional: comando com ESC e controle crus grava jsonl parseável, e o detalhe volta inteiro", () => {
    controleNoDetalhe();
  });

  it("funcional: SEM jq, o mesmo comando — e o 0x01 do payload não vira a barra do marcador", () => {
    const semJq = pathDosHooksSemJq();
    expect(jqVisivelCom(semJq)).toBe("");
    expect(jqVisivelCom(pathDosHooks())).not.toBe("");
    controleNoDetalhe(semJq);
  });

  it("funcional: SEM jq no PATH do hook, o corte de 120 bytes continua sem sequência partida", () => {
    // O fallback sem jq é contrato (`rastro_json_get`, `rastro_tool_input_get`): o
    // hook roda em PostToolUse e não pode exigir jq para gravar o rastro. O corte
    // é feito pelo bash, sem processo, então ele NÃO deveria depender do jq — e é
    // isso que esta prova fixa, porque "não deveria" não é prova.
    //
    // A ausência do jq é afirmativa, não inferida da montagem do PATH: quem
    // responde é o mesmo `command -v jq` que o hook usa para decidir.
    const semJq = pathDosHooksSemJq();
    expect(jqVisivelCom(semJq)).toBe("");
    // Controle: o resto do ferramental do fallback ESTÁ lá. Sem isto, um hook que
    // falhasse por falta de `grep` passaria por "fallback funcionando".
    expect(jqVisivelCom(pathDosHooks())).not.toBe("");
    // `largura=2, k=1` é a regressão observada em campo: o byte-líder `0xc3` de um
    // `ã` pendurado sozinho no fim do `detalhe`.
    fronteira("á", 2, 1, semJq);
    fronteira("á", 2, 2, semJq);
    fronteira("🚀", 4, 3, semJq);
  });
});

describe("P0.2 — o resultado da suíte que o hook instalado grava", () => {
  /**
   * `suite_executada.resultado` é o que o painel lê para dizer se a suíte passou.
   * Cada família de suíte anuncia a falha com o seu vocabulário, e o Maven é o
   * caso que não usa nenhuma das palavras das outras: ele falha com `[ERROR]` nas
   * linhas e com `BUILD FAILURE` no fim, nunca com `FAILED`, `FAIL` ou
   * `N failed`. Sem reconhecer esses dois, uma suíte Maven vermelha entrava no
   * rastro como `ok` — falso verde no painel.
   */
  let P = "";

  beforeAll(() => {
    P = produto();
    expect(init(P, "sprintx,mergex").status).toBe(0);
  }, 300000);

  function resultado(resposta: unknown, path?: string): string {
    return eventoDaSuite(P, "mvn test", resposta, path)["resultado"] as string;
  }

  /**
   * A resposta como o Claude Code a entrega na ferramenta Bash: um OBJETO, não
   * uma string.
   *
   * `interrupted` entra junto de propósito: é campo que não é texto, e as duas
   * rotas de leitura têm de passar por cima dele sem tropeçar — com jq, a
   * recursão seleciona só `type == "string"`; sem jq, só as chaves de texto que o
   * contrato nomeia são lidas.
   */
  function respostaDoBash(stdout: string, stderr = ""): Json {
    return { stdout, stderr, interrupted: false };
  }

  it("funcional: Maven com [ERROR] na saída é gravado como falha", () => {
    expect(resultado("[ERROR] Tests run: 3, Failures: 1, Errors: 0, Skipped: 0")).toBe("falha");
  });

  it("funcional: Maven com BUILD FAILURE é gravado como falha", () => {
    expect(resultado("[INFO] ------------------------------------\n[INFO] BUILD FAILURE\n[INFO] ----")).toBe("falha");
  });

  it("funcional: controle — Maven verde (BUILD SUCCESS) continua ok", () => {
    expect(resultado("[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0\n[INFO] BUILD SUCCESS")).toBe("ok");
  });

  /**
   * O achado do candidato anterior, certificado no pin novo (SprintX 796895a):
   * os dois padrões de Maven exigem fronteira de ESPAÇO em branco ao redor do
   * marcador, e Maven colorido cola a sequência ANSI nos dois lados — `…[1;31m`
   * imediatamente antes de `[ERROR]`, `…[m` imediatamente depois. Sem apagar a
   * cor ANTES de classificar, nenhum dos dois padrões casa e a suíte vermelha
   * entra no rastro como `ok`: falso verde no painel, exatamente o defeito que
   * o reconhecimento do Maven existia para fechar.
   */

  it("funcional: Maven COLORIDO com [ERROR] é gravado como falha — a cor não apaga o marcador", () => {
    expect(resultado(`${ESC}[1;31m[ERROR]${ESC}[m Tests run: 3, Failures: 1, Errors: 0, Skipped: 0`)).toBe("falha");
  });

  it("funcional: Maven COLORIDO com BUILD FAILURE é gravado como falha", () => {
    expect(resultado(`${ESC}[1;34m[INFO]${ESC}[m ----\n${ESC}[1;31mBUILD FAILURE${ESC}[m\n${ESC}[1;34m[INFO]${ESC}[m ----`)).toBe("falha");
  });

  it("funcional: controle — Maven verde COLORIDO continua ok: a cor não inventa falha", () => {
    expect(resultado(`${ESC}[1;34m[INFO]${ESC}[m Tests run: 3, Failures: 0\n${ESC}[1;32mBUILD SUCCESS${ESC}[m`)).toBe("ok");
  });

  /**
   * As provas acima entregam `tool_response` como STRING, e nenhuma suíte real
   * chega assim pela ferramenta Bash: ali o Claude Code entrega um OBJETO
   * (`{"stdout":…,"stderr":…,"interrupted":…}`). Lido como string, o objeto dava
   * dois desfechos — e os dois eram falso verde:
   *
   *   - com jq, `.tool_response` de um objeto sai IMPRESSO como JSON, onde a
   *     quebra de linha aparece escapada (`\n` literal) e o marcador perde a
   *     fronteira de espaço em branco que os padrões do Maven exigem;
   *   - sem jq, NADA: o casamento de `"chave": "valor"` não casa objeto, e a
   *     saída vinha vazia — nenhuma suíte era classificada como falha nessa rota.
   *
   * Por isso o objeto é provado nas DUAS rotas, com o Maven colorido (que soma a
   * cor ao problema da forma) e com o verde como controle: sem o controle, um
   * classificador que respondesse `falha` para tudo passaria por "corrigido".
   *
   * O `stderr` entra num caso de propósito: é onde a saída vermelha costuma
   * estar, e um leitor que só olhasse `stdout` ficaria verde nos outros casos.
   */
  const COLORIDO_ERROR = `${ESC}[1;31m[ERROR]${ESC}[m Tests run: 3, Failures: 1, Errors: 0, Skipped: 0`;
  const COLORIDO_FAILURE = `${ESC}[1;34m[INFO]${ESC}[m ----\n${ESC}[1;31mBUILD FAILURE${ESC}[m\n${ESC}[1;34m[INFO]${ESC}[m ----`;
  const COLORIDO_VERDE = `${ESC}[1;34m[INFO]${ESC}[m Tests run: 3, Failures: 0\n${ESC}[1;32mBUILD SUCCESS${ESC}[m`;

  /** As três classificações do objeto, na rota de leitura dada. */
  function objetoDoBash(path?: string): void {
    expect(resultado(respostaDoBash(COLORIDO_ERROR), path), "[ERROR] colorido no stdout").toBe("falha");
    expect(resultado(respostaDoBash(COLORIDO_FAILURE), path), "BUILD FAILURE colorido no stdout").toBe("falha");
    expect(resultado(respostaDoBash("", COLORIDO_ERROR), path), "[ERROR] colorido no stderr").toBe("falha");
    expect(resultado(respostaDoBash(COLORIDO_VERDE), path), "controle verde").toBe("ok");
  }

  it("funcional: tool_response no formato OBJETO do Bash classifica o Maven colorido — com jq", () => {
    expect(jqVisivelCom(pathDosHooks())).not.toBe("");
    objetoDoBash();
  });

  it("funcional: o mesmo objeto SEM jq no PATH do hook — a rota em que a saída vinha vazia", () => {
    const semJq = pathDosHooksSemJq();
    expect(jqVisivelCom(semJq)).toBe("");
    objetoDoBash(semJq);
  });
});

describe("P0.2 — a MergeX com DM-185 chega inteira ao produto", () => {
  /**
   * Os artefatos que a DM-185 acrescentou à MergeX: a reconciliação de base
   * pós-E8, a barreira de `pre-push` (ativação + o hook gerenciado), o
   * template e o validador do portão no CI, e o ownership por `Trabalho:`.
   *
   * A lista é NOMEADA de propósito. Uma varredura da árvore do snapshot se
   * compara consigo mesma: ela fica verde com qualquer pin, inclusive o
   * anterior, e não distingue "instalou tudo" de "o candidato não tem nada
   * disso". Nomear o que a DM-185 trouxe é o que faz o pin velho reprovar.
   */
  const DM185 = [
    ".claude/hooks/comum/integracao-da-mensagem.sh",
    ".claude/skills/mergex/assets/ci/mergex-portao.yml",
    ".claude/skills/mergex/assets/pre-push-gerenciado.sh",
    ".claude/skills/mergex/references/11-reconciliacao-base.md",
    ".claude/skills/mergex/references/12-barreira-de-push.md",
    ".claude/skills/mergex/scripts/ativacao-pre-push.sh",
    ".claude/skills/mergex/scripts/ownership-da-task.sh",
    ".claude/skills/mergex/scripts/portao-ci.sh",
    ".claude/skills/mergex/scripts/portao-push.sh",
    ".claude/skills/mergex/scripts/portao-regras.sh",
    ".claude/skills/mergex/scripts/portao-v9.sh",
    ".claude/skills/mergex/scripts/reconciliacao-artefato.sh",
    ".claude/skills/mergex/scripts/reconciliacao-arvore.sh",
    ".claude/skills/mergex/scripts/reconciliacao-base.sh",
    ".claude/skills/mergex/scripts/registrar-portao.sh",
    ".claude/skills/mergex/scripts/validade-do-portao.sh",
  ];

  it("funcional: cada artefato da DM-185 está no snapshot e no produto, byte a byte", () => {
    for (const rel of DM185) {
      const fonte = join(snapshot("mergex"), rel);
      expect(existsSync(fonte), `ausente no snapshot: ${rel}`).toBe(true);
      expect(existsSync(join(A, rel)), `nao instalado: ${rel}`).toBe(true);
      expect(sha256(join(A, rel)), rel).toBe(sha256(fonte));
    }
  });

  it("funcional: a árvore inteira da skill mergex chega ao produto, sem arquivo a menos", () => {
    const fonte = join(snapshot("mergex"), ".claude", "skills", "mergex");
    const arquivos = arvore(fonte);
    expect(arquivos.length).toBeGreaterThan(DM185.length);
    for (const rel of arquivos) {
      expect(sha256(join(A, ".claude/skills/mergex", rel)), rel).toBe(sha256(join(fonte, rel)));
    }
  });

  /**
   * `.sh` é executável pela EXTENSÃO (`decidirExecutavel`), e é isso que mantém
   * os scripts novos da DM-185 executáveis mesmo onde o bit da origem não
   * sobrevive. O `.yml` do CI é o controle: ele não pode entrar em
   * `instalacao.executaveis`, ou o doctor passaria a exigir `--chmod=+x` para
   * um template de workflow.
   */
  it("funcional: os scripts novos entram como executáveis e o template de CI não", () => {
    const executaveis = new Set((json(join(A, ".expx/expx-lock.json"))["instalacao"]["executaveis"] as string[]) ?? []);
    for (const rel of DM185.filter((r) => r.endsWith(".sh"))) {
      expect(executaveis.has(rel), `deveria ser executavel: ${rel}`).toBe(true);
    }
    expect(executaveis.has(".claude/skills/mergex/assets/ci/mergex-portao.yml")).toBe(false);
  });
});

describe("P0.2 — o lock e o doctor acusam alteração", () => {
  it("funcional: F — hook instalado alterado ou removido invalida a verificação", () => {
    const p = produto();
    expect(init(p, "sprintx,mergex").status).toBe(0);
    expect(doctor(p).status).toBe(0);
    appendFileSync(join(p, ".claude/hooks/mergex/git-perigoso.sh"), "exit 0\n");
    const r = doctor(p);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(".claude/hooks/mergex/git-perigoso.sh");
    unlinkSync(join(p, ".claude/hooks/sprintx/git-perigoso.sh"));
    expect(doctor(p).stdout).toContain("arquivo instalado removido: .claude/hooks/sprintx/git-perigoso.sh");
  });

  it("funcional: G — catálogo de método alterado ou removido invalida a verificação", () => {
    const p = produto();
    expect(init(p, "sprintx,mergex").status).toBe(0);
    const cat = join(p, ".claude/skills/mergex/scripts/catalogo-de-metodo.sh");
    appendFileSync(cat, "# editado\n");
    const r = doctor(p);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("catalogo-de-metodo.sh");
    unlinkSync(cat);
    expect(doctor(p).stdout).toContain("arquivo instalado removido: .claude/skills/mergex/scripts/catalogo-de-metodo.sh");
  });

  it("funcional: hook gerenciado alterado no settings é acusado; modo alterado é só aviso", () => {
    const p = produto();
    expect(init(p, "sprintx,mergex").status).toBe(0);
    const caminho = join(p, ".expx/hooks.json");
    const m = json(caminho);
    m["hooks"]["sprintx/git-perigoso"]["modo"] = "desligado";
    writeFileSync(caminho, JSON.stringify(m, null, 2));
    const aviso = doctor(p);
    expect(aviso.status).toBe(0);
    expect(aviso.stdout).toContain("[aviso] modo alterado localmente em .expx/hooks.json: sprintx/git-perigoso");

    const sc = join(p, ".claude/settings.json");
    writeFileSync(sc, readFileSync(sc, "utf8").replace('"timeout": 30', '"timeout": 1'));
    const erro = doctor(p);
    expect(erro.status).toBe(1);
    expect(erro.stdout).toContain("hook gerenciado ausente ou alterado");
  });
});

describe("P0.2 — runtime", () => {
  it("funcional: H — sem jq no PATH do processo, o init falha antes de tocar o produto", () => {
    const p = produto();
    writeFileSync(join(p, "README.md"), "produto\n");
    const antes = arvore(p, (r) => r === ".git" || r.startsWith(".git/"));
    const r = init(p, "sprintx,mergex", false);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("dependencia de runtime ausente no PATH deste processo: jq");
    expect(arvore(p, (x) => x === ".git" || x.startsWith(".git/"))).toEqual(antes);
  });
});

describe("P0.2 — E1 da MergeX na instalação feita só pelo ExpxDev", () => {
  const TASKS = "docs/sprintx/features/ft-m4/sprint-01/tasks.md";
  const ENTREGA = "docs/entregas/ft-m4/ENTREGA.md";

  /** O cenário da bancada M4-B da própria MergeX, num produto instalado pelo init. */
  function trabalho(semCatalogo: boolean): { p: string; r: ReturnType<typeof spawnSync> } {
    const p = produto();
    gitEm(p, "switch", "-q", "-c", "feature/ft-m4");
    expect(init(p, "sprintx,mergex").status).toBe(0);
    if (semCatalogo) unlinkSync(join(p, ".claude/skills/mergex/scripts/catalogo-de-metodo.sh"));
    mkdirSync(join(p, "src"), { recursive: true });
    for (const f of ["a", "b"]) writeFileSync(join(p, `src/${f}.js`), `base ${f}\n`);
    mkdirSync(join(p, "docs/sprintx/features/ft-m4/sprint-01"), { recursive: true });
    writeFileSync(
      join(p, TASKS),
      [
        "---", "expx_schema: 1", "expx_tool: sprintx", "kind: plano", "trabalho_id: ft-m4", "tasks:",
        "  - id: T-01.01", "    titulo: Task atual", "    status: concluida", "    suite: parcial",
        "    arquivos:", "      cria: []", "      altera: [src/a.js]",
        "    teste_integracao: cobre integracao", "    teste_funcional: cobre fluxo",
        "  - id: T-01.02", "    titulo: Task irma", "    status: pendente", "    suite: nao_executada",
        "    arquivos:", "      cria: []", "      altera: [src/b.js]",
        "    teste_integracao: cobre integracao", "    teste_funcional: cobre fluxo",
        "---", "",
      ].join("\n"),
    );
    writeFileSync(join(p, "docs/sprintx/features/ft-m4/ORQUESTRADOR.md"), "---\nkind: orquestrador\ntrabalho_id: ft-m4\n---\n");
    mkdirSync(join(p, "docs/entregas/ft-m4"), { recursive: true });
    writeFileSync(
      join(p, ENTREGA),
      [
        "---", "expx_schema: 1", "expx_tool: sprintx", "kind: entrega", "trabalho_id: ft-m4", "entregue_por: mergex",
        "estado: aberto", "versionado: true", "branch: feature/ft-m4", "branch_base: main", "commits: []", "desvios: []",
        "criado_em: 2026-09-25", "atualizado_em: 2026-09-25", "---", "",
      ].join("\n"),
    );
    gitEm(p, "add", "-A");
    gitEm(p, "commit", "-q", "-m", "chore: base");
    writeFileSync(join(p, "src/a.js"), "base a\nalterado\n");
    const msg = join(p, "..", `${p.split(/[\\/]/).pop() ?? "p"}.msg`);
    writeFileSync(msg, "fix(src): fecha T-01.01\n\nObjetivo da task.\n\nTask: T-01.01\nTrabalho: ft-m4\n");
    temporarios.adotar(msg);
    const r = spawnSync(
      bashDosHooks(),
      [join(p, ".claude/skills/mergex/scripts/fechamento-do-e1.sh"), "--fechar", "--entrega", ENTREGA, "--task", "T-01.01", "--mensagem", msg, "--", "src/a.js"],
      { cwd: p, encoding: "utf8", env: ambienteCom(pathDosHooks()), timeout: 120000 },
    );
    return { p, r };
  }

  it("funcional: com a instalação do init, o E1 fecha a task — não há 'instalação incompleta'", () => {
    const { p, r } = trabalho(false);
    const saida = `${String(r.stdout)}${String(r.stderr)}`;
    expect(saida).not.toContain("instalação MergeX incompleta");
    expect(r.status, saida).toBe(0);
    expect(gitEm(p, "log", "-1", "--format=%s").trim()).toBe("fix(src): fecha T-01.01");
  });

  it("funcional: controle — sem o catálogo, o mesmo E1 para como instalação incompleta", () => {
    const { r } = trabalho(true);
    const saida = `${String(r.stdout)}${String(r.stderr)}`;
    expect(r.status).toBe(9);
    expect(saida).toContain("instalação MergeX incompleta");
  });
});
