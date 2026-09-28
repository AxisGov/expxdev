import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { criarRepoSkill } from "../teste/repo-fixture.js";
import { arvore } from "../teste/candidatos.js";
import { executarInit } from "./init.js";

/**
 * Colisões e conflitos artificiais: duas skills sintéticas publicando o mesmo
 * destino, o mesmo id, o mesmo hook. A regra é uma só — igual deduplica,
 * diferente FALHA antes de qualquer escrita — e vale em qualquer ordem.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function skill(nome: string, arquivos: Record<string, string>): string {
  const repo = criarRepoSkill({ nome, tags: [] });
  criados.push(repo);
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), conteudo);
  }
  return repo;
}

function produto(): string {
  const p = mkdtempSync(join(tmpdir(), "expx-p02-"));
  criados.push(p);
  writeFileSync(join(p, "AGENTS.md"), "# agentes do produto\n");
  return p;
}

/** Tudo no produto, com o conteúdo: o "antes" que uma falha não pode alterar. */
function foto(p: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const rel of arvore(p)) saida[rel] = readFileSync(join(p, rel), "utf8");
  return saida;
}

function settingsCom(comandos: Array<{ command: string; timeout?: number }>): string {
  return JSON.stringify({
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: comandos.map((c) => ({ type: "command", ...c })) }] },
  });
}

async function instalar(p: string, origens: Record<string, string>, ordem: string[]) {
  return executarInit({ raiz: p, skills: ordem, harness: ["claude"], origens });
}

describe("I — colisão de arquivo entre skills", () => {
  it("funcional: mesmo destino com bytes diferentes falha antes de escrever, nas duas ordens", async () => {
    const origens = {
      alfa: skill("alfa", { ".claude/hooks/comum/util.sh": "echo alfa\n" }),
      beta: skill("beta", { ".claude/hooks/comum/util.sh": "echo beta\n" }),
    };
    const mensagens: string[] = [];
    for (const ordem of [["alfa", "beta"], ["beta", "alfa"]]) {
      const p = produto();
      const antes = foto(p);
      const r = await instalar(p, origens, ordem);
      expect(r.ok).toBe(false);
      const erro = r.erros.join("\n");
      expect(erro).toContain(".claude/hooks/comum/util.sh");
      expect(erro).toContain("alfa");
      expect(erro).toContain("beta");
      expect(erro).toMatch(/alfa: [0-9a-f]{12}/);
      expect(foto(p)).toEqual(antes);
      mensagens.push(erro.replace(/expx-busca-[a-z]+-[A-Za-z0-9]+/g, "<tmp>"));
    }
    expect(mensagens[1]).toBe(mensagens[0]);
  });

  it("funcional: mesmo destino com os mesmos bytes deduplica e instala", async () => {
    const origens = {
      alfa: skill("alfa", { ".claude/hooks/comum/util.sh": "echo comum\n" }),
      beta: skill("beta", { ".claude/hooks/comum/util.sh": "echo comum\n" }),
    };
    const p = produto();
    const r = await instalar(p, origens, ["beta", "alfa"]);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(p, ".claude/hooks/comum/util.sh"), "utf8")).toBe("echo comum\n");
  });
});

describe("J — colisão de id no .expx/hooks.json", () => {
  const hook = (n: string) => ({ [`.claude/hooks/${n}/h.sh`]: "exit 0\n" });

  it("funcional: mesmo id com configuração diferente falha antes de escrever", async () => {
    const origens = {
      alfa: skill("alfa", { ...hook("alfa"), ".expx/hooks.json": JSON.stringify({ expx_hooks: 1, hooks: { comum: { modo: "aviso" } } }) }),
      beta: skill("beta", { ...hook("beta"), ".expx/hooks.json": JSON.stringify({ expx_hooks: 1, hooks: { comum: { modo: "bloqueio" } } }) }),
    };
    for (const ordem of [["alfa", "beta"], ["beta", "alfa"]]) {
      const p = produto();
      const antes = foto(p);
      const r = await instalar(p, origens, ordem);
      expect(r.ok).toBe(false);
      expect(r.erros.join("\n")).toContain("conflito de id no .expx/hooks.json");
      expect(r.erros.join("\n")).toContain("comum");
      expect(foto(p)).toEqual(antes);
    }
  });

  it("funcional: mesmo id com configuração igual (chaves em outra ordem) deduplica", async () => {
    const origens = {
      alfa: skill("alfa", { ...hook("alfa"), ".expx/hooks.json": JSON.stringify({ hooks: { comum: { modo: "aviso", tipo: "metodo" } } }) }),
      beta: skill("beta", { ...hook("beta"), ".expx/hooks.json": JSON.stringify({ hooks: { comum: { tipo: "metodo", modo: "aviso" } } }) }),
    };
    const p = produto();
    const r = await instalar(p, origens, ["alfa", "beta"]);
    expect(r.ok).toBe(true);
    const m = JSON.parse(readFileSync(join(p, ".expx/hooks.json"), "utf8")) as { hooks: Record<string, unknown> };
    expect(m.hooks["comum"]).toEqual({ modo: "aviso", tipo: "metodo" });
  });

  it("funcional: manifesto de modos inválido falha antes de escrever", async () => {
    const origens = { alfa: skill("alfa", { ...hook("alfa"), ".expx/hooks.json": "{ quebrado" }) };
    const p = produto();
    const antes = foto(p);
    const r = await instalar(p, origens, ["alfa"]);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("manifesto invalido: alfa .expx/hooks.json");
    expect(foto(p)).toEqual(antes);
  });
});

describe("composição de settings entre skills", () => {
  it("funcional: o mesmo hook com timeout diferente em duas skills é conflito, não escolha", async () => {
    const cmd = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/comum/x.sh';
    const origens = {
      alfa: skill("alfa", { ".claude/hooks/comum/x.sh": "exit 0\n", ".claude/settings.json": settingsCom([{ command: cmd, timeout: 10 }]) }),
      beta: skill("beta", { ".claude/hooks/comum/x.sh": "exit 0\n", ".claude/settings.json": settingsCom([{ command: cmd, timeout: 30 }]) }),
    };
    const p = produto();
    const antes = foto(p);
    const r = await instalar(p, origens, ["beta", "alfa"]);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("conflito de composicao no .claude/settings.json");
    expect(foto(p)).toEqual(antes);
  });

  it("funcional: o mesmo hook idêntico em duas skills é registrado uma vez", async () => {
    const cmd = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/comum/x.sh';
    const origens = {
      alfa: skill("alfa", { ".claude/hooks/comum/x.sh": "exit 0\n", ".claude/settings.json": settingsCom([{ command: cmd, timeout: 10 }]) }),
      beta: skill("beta", { ".claude/hooks/comum/x.sh": "exit 0\n", ".claude/settings.json": settingsCom([{ command: cmd, timeout: 10 }]) }),
    };
    const p = produto();
    expect((await instalar(p, origens, ["alfa", "beta"])).ok).toBe(true);
    const texto = readFileSync(join(p, ".claude/settings.json"), "utf8");
    expect(texto.split("comum/x.sh").length - 1).toBe(1);
  });

  it("funcional: hook registrado que a skill não publica é skill incompleta", async () => {
    const origens = {
      alfa: skill("alfa", {
        ".claude/hooks/alfa/existe.sh": "exit 0\n",
        ".claude/settings.json": settingsCom([{ command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/alfa/sumiu.sh' }]),
      }),
    };
    const p = produto();
    const antes = foto(p);
    const r = await instalar(p, origens, ["alfa"]);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("skill incompleta: alfa registra .claude/hooks/alfa/sumiu.sh");
    expect(foto(p)).toEqual(antes);
  });

  it("funcional: entrada do projeto com a identidade de um hook gerenciado e outro timeout falha", async () => {
    const cmd = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/alfa/h.sh';
    const origens = { alfa: skill("alfa", { ".claude/hooks/alfa/h.sh": "exit 0\n", ".claude/settings.json": settingsCom([{ command: cmd, timeout: 10 }]) }) };
    const p = produto();
    mkdirSync(join(p, ".claude"), { recursive: true });
    writeFileSync(join(p, ".claude/settings.json"), settingsCom([{ command: cmd, timeout: 99 }]));
    const antes = foto(p);
    const r = await instalar(p, origens, ["alfa"]);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain("conflito entre o .claude/settings.json do projeto e um hook gerenciado");
    expect(foto(p)).toEqual(antes);
  });
});

describe("K — AGENTS.md, README.md e LICENSE de duas skills", () => {
  const privados = (n: string) => ({
    "AGENTS.md": `# agentes de ${n}\n`,
    "README.md": `# ${n}\n`,
    "LICENSE": `licenca de ${n}\n`,
    [`.claude/skills/${n}/README.md`]: `# leia-me privado de ${n}\n`,
    [`.claude/hooks/${n}/h.sh`]: "exit 0\n",
  });

  it("funcional: os da raiz não são instalados, os da skill ficam no namespace dela, o do produto fica intocado", async () => {
    const origens = { alfa: skill("alfa", privados("alfa")), beta: skill("beta", privados("beta")) };
    for (const ordem of [["alfa", "beta"], ["beta", "alfa"]]) {
      const p = produto();
      const r = await instalar(p, origens, ordem);
      expect(r.ok, r.erros.join("\n")).toBe(true);
      expect(readFileSync(join(p, "AGENTS.md"), "utf8")).toBe("# agentes do produto\n");
      expect(existsSync(join(p, "README.md"))).toBe(false);
      expect(existsSync(join(p, "LICENSE"))).toBe(false);
      expect(readFileSync(join(p, ".claude/skills/alfa/README.md"), "utf8")).toBe("# leia-me privado de alfa\n");
      expect(readFileSync(join(p, ".claude/skills/beta/README.md"), "utf8")).toBe("# leia-me privado de beta\n");
      const todos = arvore(p);
      expect(todos.filter((f) => /(^|\/)(AGENTS\.md|LICENSE)$/.test(f))).toEqual(["AGENTS.md"]);
    }
  });

  it("funcional: README compartilhado em .claude/hooks/ com bytes diferentes falha, sem last-wins", async () => {
    const origens = {
      alfa: skill("alfa", { ".claude/hooks/README.md": "# hooks da alfa\n" }),
      beta: skill("beta", { ".claude/hooks/README.md": "# hooks da beta\n" }),
    };
    const p = produto();
    const antes = foto(p);
    const r = await instalar(p, origens, ["alfa", "beta"]);
    expect(r.ok).toBe(false);
    expect(r.erros.join("\n")).toContain(".claude/hooks/README.md");
    expect(foto(p)).toEqual(antes);
  });
});

describe("install.sh das skills", () => {
  it("funcional: o init nunca executa o install.sh destrutivo de uma skill", async () => {
    const origens = {
      alfa: skill("alfa", {
        ".claude/hooks/alfa/h.sh": "exit 0\n",
        "install.sh": '#!/usr/bin/env bash\nrm -rf .claude/agents .claude/hooks\ntouch INSTALL_SH_RODOU\n',
      }),
    };
    const p = produto();
    mkdirSync(join(p, ".claude/agents"), { recursive: true });
    writeFileSync(join(p, ".claude/agents/meu.md"), "# meu agente\n");
    const r = await instalar(p, origens, ["alfa"]);
    expect(r.ok, r.erros.join("\n")).toBe(true);
    expect(readFileSync(join(p, ".claude/agents/meu.md"), "utf8")).toBe("# meu agente\n");
    expect(existsSync(join(p, "INSTALL_SH_RODOU"))).toBe(false);
    expect(arvore(p).filter((f) => f.endsWith("install.sh"))).toEqual([]);
  });
});
