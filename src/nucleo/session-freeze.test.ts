import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The runtime helper is intentionally shipped as a Node module beside the harness adapters.
import { AXIS_REPOSITORIO, sincronizarSessao } from "../../nucleo/hooks/expx-session-sync.mjs";

/**
 * D-03: instalação com origem local (`skills.*.commit` terminando em `-local`)
 * não participa da sincronização automática do SessionStart. O lock congelado
 * vence a conveniência: sem bootstrap do cache Axis, sem fetch, sem npm, sem
 * `expx update` — e o projeto fica intocado.
 *
 * O executor destes testes responde a TUDO como se a rede e o CLI Axis
 * estivessem disponíveis: se o hook não parasse no lock, chegaria ao update.
 * Parar tem de ser decisão do hook, nunca acidente de ambiente.
 */

const SHA_REMOTO = "ed7c7343165fc3b7dcf97895568015632c07457c";

function travada(repositorio: string, commit: string): Record<string, unknown> {
  return { repositorio, referencia: "main", travado: false, commit, resolvido_em: "2026-09-27", arquivos: {} };
}

function lockCom(skills: Record<string, unknown>): Record<string, unknown> {
  return { lock_version: 2, cli_version: "0.7.0", harness: ["claude"], skills };
}

const SPRINTX_LOCAL = travada("/opt/p02-bootstrap-d02/fontes/sprintx", "4e1f7b88d85f-local");
const MERGEX_LOCAL = travada("/opt/p02-bootstrap-d02/fontes/mergex", "d3ca3aa687bd-local");
const SPRINTX_REMOTA = travada("https://github.com/AxisGov/SprintX", SHA_REMOTO);
const MERGEX_REMOTA = travada("https://github.com/AxisGov/MergeX", SHA_REMOTO);

type Cenario = {
  raiz: string;
  lock: string;
  cache: string;
  chamadas: string[][];
  executar: (arquivo: string, argumentos: string[], opcoes?: unknown) => string;
  ambiente: Record<string, string>;
  descartar: () => void;
};

/**
 * Projeto com o lock pedido e um executor que, se deixado seguir, faria o
 * bootstrap Axis completo (clone, npm ci, build) e rodaria o update.
 */
function cenario(lock: Record<string, unknown> | string, opcoes: { sujo?: boolean } = {}): Cenario {
  const raiz = mkdtempSync(join(tmpdir(), "expx-session-freeze-"));
  mkdirSync(join(raiz, ".expx"));
  const bytes = typeof lock === "string" ? lock : `${JSON.stringify(lock, null, 2)}\n`;
  writeFileSync(join(raiz, ".expx", "expx-lock.json"), bytes);
  const cache = join(raiz, "fora-do-projeto", "cache-axis");
  const chamadas: string[][] = [];
  const executar = (arquivo: string, argumentos: string[]): string => {
    chamadas.push([arquivo, ...argumentos]);
    if (argumentos.includes("--show-toplevel")) return `${raiz}\n`;
    if (argumentos.includes("status")) return opcoes.sujo === true ? " M arquivo.txt\n" : "";
    if (argumentos[0] === "clone") {
      mkdirSync(join(argumentos.at(-1)!, "dist", "cli"), { recursive: true });
      writeFileSync(join(argumentos.at(-1)!, "dist", "cli", "expx-bin.js"), "");
      return "";
    }
    if (argumentos.includes("remote")) return `${AXIS_REPOSITORIO}\n`;
    if (argumentos.includes("rev-parse")) return "mesmo\n";
    if (argumentos.includes("branch")) return "main\n";
    if (argumentos.some((a) => a.endsWith("expx-bin.js"))) return "sprintx: main → novo\npara desfazer esta atualizacao, reverta\n";
    return "";
  };
  return {
    raiz,
    lock: bytes,
    cache,
    chamadas,
    executar,
    ambiente: { EXPX_AXIS_CACHE: cache, HOME: raiz },
    descartar: () => rmSync(raiz, { recursive: true, force: true }),
  };
}

function sessao(c: Cenario, source: string, plataforma: "claude" | "codex" = "claude"): string {
  const entrada = JSON.stringify(plataforma === "codex" ? { source, cwd: c.raiz } : { source });
  return sincronizarSessao({ entrada, plataforma, raiz: c.raiz, ambiente: c.ambiente, executar: c.executar });
}

const PROIBIDO = ["clone", "fetch", "npm", "expx-bin.js", "update"];

/** Toda chamada que tocaria rede, cache Axis ou o CLI de update. */
function proibidas(chamadas: string[][]): string[][] {
  return chamadas.filter((c) => c.some((v) => PROIBIDO.some((p) => v.includes(p))));
}

/** Nada de rede, nada de update, nada escrito — nem no projeto, nem no cache. */
function esperarCongelado(c: Cenario): void {
  expect(proibidas(c.chamadas)).toEqual([]);
  expect(readFileSync(join(c.raiz, ".expx", "expx-lock.json"), "utf8")).toBe(c.lock);
  expect(existsSync(c.cache)).toBe(false);
  expect(existsSync(`${c.cache}.lock`)).toBe(false);
}

function contexto(saida: string): string {
  return (JSON.parse(saida) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
}

describe("D-03: SessionStart não atualiza instalação com origem local", () => {
  it("funcional: SprintX <sha>-local não faz bootstrap nem update", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL }));
    try {
      const saida = sessao(c, "startup");
      expect(contexto(saida)).toContain("origem local");
      expect(contexto(saida)).toContain("sprintx");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: MergeX <sha>-local não faz bootstrap nem update", () => {
    const c = cenario(lockCom({ mergex: MERGEX_LOCAL }));
    try {
      expect(contexto(sessao(c, "startup"))).toContain("mergex");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: duas skills locais não fazem bootstrap nem update", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL, mergex: MERGEX_LOCAL }));
    try {
      const texto = contexto(sessao(c, "startup"));
      expect(texto).toContain("sprintx");
      expect(texto).toContain("mergex");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: mistura local + remota — a local vence, nenhum auto-update (nas duas ordens)", () => {
    for (const skills of [
      { sprintx: SPRINTX_REMOTA, mergex: MERGEX_LOCAL },
      { mergex: MERGEX_LOCAL, sprintx: SPRINTX_REMOTA },
      { sprintx: SPRINTX_LOCAL, mergex: MERGEX_REMOTA },
    ]) {
      const c = cenario(lockCom(skills));
      try {
        expect(contexto(sessao(c, "startup"))).toContain("origem local");
        esperarCongelado(c);
      } finally {
        c.descartar();
      }
    }
  });

  it("funcional: startup com árvore limpa — o lock é lido antes de qualquer git status, rede ou update", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL, mergex: MERGEX_LOCAL }));
    try {
      sessao(c, "startup");
      // A única chamada é descobrir a raiz Git: o freeze não depende nem do
      // status da árvore, e muito menos do CLI remoto.
      expect(c.chamadas).toEqual([["git", "-C", c.raiz, "rev-parse", "--show-toplevel"]]);
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: árvore suja com lock local continua sem rede nem update", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL }), { sujo: true });
    try {
      expect(sessao(c, "startup")).not.toBe("");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: árvore suja com lock remoto continua adiando sem update", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_REMOTA }), { sujo: true });
    try {
      expect(contexto(sessao(c, "startup"))).toContain("working tree possui alteracoes");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: resume com lock local não atualiza", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL, mergex: MERGEX_LOCAL }));
    try {
      expect(contexto(sessao(c, "resume"))).toContain("origem local");
      expect(c.chamadas).toEqual([["git", "-C", c.raiz, "rev-parse", "--show-toplevel"]]);
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: Codex (startup e resume) com lock local não atualiza", () => {
    for (const source of ["startup", "resume"]) {
      const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL }));
      try {
        expect(contexto(sessao(c, source, "codex"))).toContain("origem local");
        esperarCongelado(c);
      } finally {
        c.descartar();
      }
    }
  });

  it("funcional: clear, compact e fork com lock local continuam sem sync e sem mensagem", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_LOCAL }));
    try {
      for (const source of ["clear", "compact", "fork"]) expect(sessao(c, source)).toBe("");
      expect(c.chamadas).toEqual([]);
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: o sinal é o commit, não o caminho — `-local` com repositório URL congela", () => {
    const c = cenario(lockCom({ sprintx: travada("https://github.com/AxisGov/SprintX", "4e1f7b88d85f-local") }));
    try {
      expect(contexto(sessao(c, "startup"))).toContain("origem local");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: origem local sem git (`commit: local`, gravado por copiarLocal) também congela", () => {
    const c = cenario(lockCom({ sprintx: travada("/opt/fontes/sprintx", "local") }));
    try {
      expect(contexto(sessao(c, "startup"))).toContain("origem local");
      esperarCongelado(c);
    } finally {
      c.descartar();
    }
  });

  it("funcional: sufixo parecido que não é `-local` não congela", () => {
    const c = cenario(lockCom({ sprintx: travada("https://github.com/AxisGov/SprintX", "4e1f7b88d85f-locale") }));
    try {
      sessao(c, "startup");
      expect(c.chamadas.some((a) => a.some((v) => v.endsWith("expx-bin.js")))).toBe(true);
    } finally {
      c.descartar();
    }
  });

  it("funcional: lock inválido falha fechado — sem update, sem mutação, sessão não quebra", () => {
    const invalidos = [
      "{\"skills\": {",
      "",
      "null",
      "[]",
      "\"texto\"",
      "{}\n",
      JSON.stringify({ skills: [] }),
      JSON.stringify({ skills: null }),
      JSON.stringify({ skills: "sprintx" }),
      JSON.stringify(lockCom({ sprintx: null })),
      JSON.stringify(lockCom({ sprintx: { repositorio: "x" } })),
      JSON.stringify(lockCom({ sprintx: { ...SPRINTX_REMOTA, commit: 42 } })),
      JSON.stringify(lockCom({ sprintx: { ...SPRINTX_REMOTA, commit: "" } })),
      JSON.stringify(lockCom({ sprintx: SPRINTX_REMOTA, mergex: [] })),
    ];
    for (const bruto of invalidos) {
      const c = cenario(bruto);
      try {
        let saida = "";
        expect(() => { saida = sessao(c, "startup"); }).not.toThrow();
        expect(contexto(saida), bruto).toContain("Sincronizacao adiada");
        esperarCongelado(c);
      } finally {
        c.descartar();
      }
    }
  });

  it("funcional: lock ilegível no disco (diretório no lugar do arquivo) falha fechado", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_REMOTA }));
    try {
      rmSync(join(c.raiz, ".expx", "expx-lock.json"));
      mkdirSync(join(c.raiz, ".expx", "expx-lock.json"));
      expect(contexto(sessao(c, "startup"))).toContain("Sincronizacao adiada");
      expect(proibidas(c.chamadas)).toEqual([]);
      expect(existsSync(c.cache)).toBe(false);
    } finally {
      c.descartar();
    }
  });

  it("funcional: lock remoto normal mantém o fluxo legado — bootstrap Axis e update --latest --yes", () => {
    const c = cenario(lockCom({ sprintx: SPRINTX_REMOTA, mergex: MERGEX_REMOTA }));
    try {
      const saida = sessao(c, "startup");
      expect(contexto(saida)).toContain("Skills atualizadas: sprintx.");
      expect(c.chamadas[0]).toEqual(["git", "-C", c.raiz, "rev-parse", "--show-toplevel"]);
      expect(c.chamadas[1]).toEqual(["git", "-C", c.raiz, "status", "--porcelain"]);
      expect(c.chamadas.some((a) => a[1] === "clone" && a.includes(AXIS_REPOSITORIO))).toBe(true);
      const cli = c.chamadas.find((a) => a.some((v) => v.endsWith("expx-bin.js")));
      expect(cli?.slice(-3)).toEqual(["update", "--latest", "--yes"]);
    } finally {
      c.descartar();
    }
  });

  it("funcional: lock remoto com origem em caminho absoluto (SHA completo) também segue o fluxo legado", () => {
    const c = cenario(lockCom({ sprintx: travada("/opt/fontes/sprintx", SHA_REMOTO) }));
    try {
      sessao(c, "resume");
      expect(c.chamadas.some((a) => a.some((v) => v.endsWith("expx-bin.js")))).toBe(true);
    } finally {
      c.descartar();
    }
  });

  it("funcional: instalação sem lock não sincroniza", () => {
    const raiz = mkdtempSync(join(tmpdir(), "expx-session-freeze-sem-lock-"));
    try {
      const chamadas: string[][] = [];
      const executar = (arquivo: string, argumentos: string[]) => { chamadas.push([arquivo, ...argumentos]); return `${raiz}\n`; };
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "startup" }), raiz, executar })).toBe("");
      expect(sincronizarSessao({ entrada: JSON.stringify({ source: "resume" }), raiz, executar })).toBe("");
      expect(chamadas).toEqual([]);
      expect(existsSync(join(raiz, ".expx"))).toBe(false);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
