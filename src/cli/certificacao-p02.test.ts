import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ambienteCom,
  arvore,
  bashDosHooks,
  CANDIDATOS,
  fontesCandidatas,
  gitEm,
  novoProduto,
  pathControlado,
  pathDosHooks,
  rodarExpx,
  rodarHook,
  sha256,
  snapshot,
} from "../teste/candidatos.js";

/**
 * Certificação P0.2: SprintX 253b592 + MergeX 25d4797 instaladas SÓ pelo
 * `expxdev init` real (o binário do `dist/`, num processo novo), a partir dos
 * snapshots fixados em `fixtures/candidatos/`. Nenhum arquivo é copiado,
 * nenhum settings ou hooks.json é montado à mão: o que está no produto é o que
 * o `init` escreveu.
 */

type Json = Record<string, any>;

const criados: string[] = [];
let fontes = "";
let A = "";
let B = "";
let saidaA: ReturnType<typeof rodarExpx>;

function init(produto: string, skills: string, comJq = true): ReturnType<typeof rodarExpx> {
  return rodarExpx(["init", "--skills", skills, "--yes"], produto, ambienteCom(pathControlado(comJq), { EXPX_SKILLS_LOCAIS: fontes }));
}

function doctor(produto: string): ReturnType<typeof rodarExpx> {
  return rodarExpx(["doctor"], produto, ambienteCom(pathControlado(true)));
}

function produto(): string {
  const p = novoProduto();
  criados.push(p);
  return p;
}

function json(caminho: string): Json {
  return JSON.parse(readFileSync(caminho, "utf8")) as Json;
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
  criados.push(fontes);
  A = produto();
  saidaA = init(A, "sprintx,mergex");
  B = produto();
  init(B, "mergex,sprintx");
}, 600000);

afterAll(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

describe("P0.2 — init real de SprintX + MergeX", () => {
  it("integração: o init real sai 0 e não registra plugin fora da fixture (claude ausente do PATH)", () => {
    expect(saidaA.stderr).toBe("");
    expect(saidaA.status).toBe(0);
    expect(saidaA.stdout).toContain("instaladas: mergex, sprintx");
    expect(saidaA.stdout).toContain("claude plugin marketplace add");
  });

  it("funcional: 1-2 — a árvore de hooks de cada skill está inteira, byte a byte", () => {
    for (const nome of Object.keys(CANDIDATOS) as Array<keyof typeof CANDIDATOS>) {
      const fonte = join(snapshot(nome), ".claude", "hooks");
      const arquivos = arvore(fonte).filter((r) => r !== "hooks.json");
      expect(arquivos.length).toBeGreaterThan(3);
      for (const rel of arquivos) {
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
    expect(sha256(join(A, rel))).toBe(sha256(join(snapshot("mergex"), rel)));
  });

  it("funcional: 9 — os hooks do núcleo continuam instalados e registrados", () => {
    expect(existsSync(join(A, ".claude/hooks/expx-session-sync.mjs"))).toBe(true);
    expect(existsSync(join(A, ".claude/hooks/expx-lembrete.sh"))).toBe(true);
    const hooks = hooksDoSettings(json(join(A, ".claude/settings.json")));
    expect(hooks.some((h) => h.evento === "SessionStart" && h.hook["command"] === "node")).toBe(true);
    expect(hooks.some((h) => h.evento === "UserPromptSubmit" && String(h.hook["command"]).endsWith("expx-lembrete.sh"))).toBe(true);
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
    criados.push(msg);
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
