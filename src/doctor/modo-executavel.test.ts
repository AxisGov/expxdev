import { describe, it, expect, afterEach } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  avisoDeFilemode,
  comandoDeReparo,
  executaveisDoLock,
  filemodeDesligado,
  modosNoIndice,
} from "../nucleo/modo-executavel.js";
import { verificarModoExecutavel, type Achado } from "./verificadores.js";
import { gitEm, novoProduto } from "../teste/candidatos.js";

/**
 * O portão do modo executável, na unidade.
 *
 * O caso que este arquivo cobre não é o disco: é o modo VERSIONADO. Um produto
 * com `core.filemode=false` recebe os `.sh` como 0755 em disco e o `git add`
 * registra 100644 — o clone ou a worktree seguinte materializa 0644 e o hook
 * registrado por execução direta morre com 126 (Permission denied).
 *
 * As sondas são injetadas de propósito: o ramo "a raiz não preserva o bit"
 * (Windows nativo, WSL/DrvFs) não é reproduzível no filesystem da bancada, e
 * um teste que dependesse dele seria não determinista.
 */

const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function temporario(prefixo = "expx-modo-"): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

function arquivo(raiz: string, rel: string, modo: number): void {
  const caminho = join(raiz, ...rel.split("/"));
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(caminho, modo);
}

function achados(
  raiz: string,
  executaveis: readonly string[],
  indice: Record<string, string>,
  preservaBit: boolean,
): Achado[] {
  const saida: Achado[] = [];
  verificarModoExecutavel(raiz, executaveis, (a) => saida.push(a), {
    modosNoIndice: () => new Map(Object.entries(indice)),
    preservaBit: () => preservaBit,
  });
  return saida;
}

describe("executaveisDoLock", () => {
  it("funcional: o lock novo é a fonte de verdade, em ordem canônica", () => {
    const lista = executaveisDoLock({
      arquivos: { ".claude/hooks/a.sh": "h", ".claude/hooks/b.sh": "h", "README.md": "h" },
      executaveis: [".claude/hooks/b.sh", ".claude/hooks/a.sh"],
    });
    expect(lista).toEqual([".claude/hooks/a.sh", ".claude/hooks/b.sh"]);
  });

  it("funcional: lock antigo, sem o campo, cai no fallback dos .sh e continua válido", () => {
    const lista = executaveisDoLock({
      arquivos: {
        ".claude/hooks/sprintx/git-perigoso.sh": "h",
        ".claude/hooks/expx-session-sync.mjs": "h",
        ".claude/skills/sprintx/SKILL.md": "h",
        ".claude/hooks/comum/base.sh": "h",
      },
    });
    expect(lista).toEqual([".claude/hooks/comum/base.sh", ".claude/hooks/sprintx/git-perigoso.sh"]);
  });

  it("funcional: o campo vazio é declaração de que nada é executável, não ausência", () => {
    expect(executaveisDoLock({ arquivos: { "a.sh": "h" }, executaveis: [] })).toEqual([]);
  });
});

describe("comandoDeReparo", () => {
  it("funcional: o comando é exato, com -- antes dos caminhos", () => {
    expect(comandoDeReparo([".claude/hooks/a.sh", ".claude/hooks/b.sh"])).toBe(
      "git update-index --chmod=+x -- .claude/hooks/a.sh .claude/hooks/b.sh",
    );
  });
});

describe("verificarModoExecutavel", () => {
  it("funcional: executável rastreado como 100644 é erro, com o comando pronto e sem executá-lo", () => {
    const raiz = temporario();
    arquivo(raiz, ".claude/hooks/sprintx/git-perigoso.sh", 0o755);
    arquivo(raiz, ".claude/hooks/comum/base.sh", 0o755);
    const r = achados(
      raiz,
      [".claude/hooks/comum/base.sh", ".claude/hooks/sprintx/git-perigoso.sh"],
      { ".claude/hooks/comum/base.sh": "100644", ".claude/hooks/sprintx/git-perigoso.sh": "100755" },
      true,
    );
    expect(r).toHaveLength(1);
    const a = r[0] as Achado;
    expect(a.id).toBe("modo-executavel-nao-versionado");
    expect(a.severidade).toBe("erro");
    expect(a.problema).toContain("100644");
    expect(a.problema).toContain(".claude/hooks/comum/base.sh");
    // só o que está errado entra no comando
    expect(a.correcao).toContain("git update-index --chmod=+x -- .claude/hooks/comum/base.sh");
    expect(a.correcao).not.toContain("git-perigoso.sh");
    expect(a.correcao).toContain("expx init");
    expect(a.correcao).toContain("126");
  });

  it("funcional: executável ainda não rastreado não é erro: não há modo versionado errado", () => {
    const raiz = temporario();
    arquivo(raiz, ".claude/hooks/a.sh", 0o755);
    expect(achados(raiz, [".claude/hooks/a.sh"], {}, true)).toEqual([]);
  });

  it("funcional: sem o bit no disco, com raiz que preserva o bit, o reparo é o expx init", () => {
    const raiz = temporario();
    arquivo(raiz, ".claude/hooks/a.sh", 0o644);
    const r = achados(raiz, [".claude/hooks/a.sh"], { ".claude/hooks/a.sh": "100755" }, true);
    expect(r).toHaveLength(1);
    const a = r[0] as Achado;
    expect(a.id).toBe("modo-executavel-sem-bit");
    expect(a.severidade).toBe("erro");
    expect(a.problema).toContain(".claude/hooks/a.sh");
    expect(a.correcao).toContain("expx init");
  });

  it("funcional: raiz sem suporte confiável ao bit não produz achado de disco", () => {
    const raiz = temporario();
    arquivo(raiz, ".claude/hooks/a.sh", 0o644);
    expect(achados(raiz, [".claude/hooks/a.sh"], { ".claude/hooks/a.sh": "100755" }, false)).toEqual([]);
    // o modo versionado, esse continua sendo conferido: não depende do filesystem
    const r = achados(raiz, [".claude/hooks/a.sh"], { ".claude/hooks/a.sh": "100644" }, false);
    expect(r.map((a) => a.id)).toEqual(["modo-executavel-nao-versionado"]);
  });

  it("funcional: executável declarado e ausente do disco não vira achado de modo (é artefato-ausente)", () => {
    const raiz = temporario();
    expect(achados(raiz, [".claude/hooks/a.sh"], { ".claude/hooks/a.sh": "100755" }, true)).toEqual([]);
  });

  it("funcional: nada declarado, nada a dizer", () => {
    expect(achados(temporario(), [], {}, true)).toEqual([]);
  });
});

describe("consulta ao git", () => {
  it("integração: pasta que não é repositório git não produz modo nenhum e não lança", () => {
    const raiz = temporario();
    arquivo(raiz, ".claude/hooks/a.sh", 0o755);
    expect(modosNoIndice(raiz, [".claude/hooks/a.sh"]).size).toBe(0);
    expect(filemodeDesligado(raiz)).toBe(false);
    expect(avisoDeFilemode(raiz, [".claude/hooks/a.sh"])).toBeUndefined();
  });

  it("integração: com core.filemode=false, o índice registra 100644 e o aviso do init traz o comando", () => {
    const p = novoProduto("expx-modo-produto-");
    criados.push(p);
    gitEm(p, "config", "core.filemode", "false");
    arquivo(p, ".claude/hooks/a.sh", 0o755);

    expect(filemodeDesligado(p)).toBe(true);
    // ainda não rastreado: o aviso do init já vale, porque o commit é o próximo passo
    const antes = avisoDeFilemode(p, [".claude/hooks/a.sh"]);
    expect(antes).toContain("core.filemode=false");
    expect(antes).toContain("git update-index --chmod=+x -- .claude/hooks/a.sh");

    gitEm(p, "add", "-A");
    expect(modosNoIndice(p, [".claude/hooks/a.sh"]).get(".claude/hooks/a.sh")).toBe("100644");

    gitEm(p, "update-index", "--chmod=+x", "--", ".claude/hooks/a.sh");
    expect(modosNoIndice(p, [".claude/hooks/a.sh"]).get(".claude/hooks/a.sh")).toBe("100755");
    // resolvido no índice: o aviso some, mesmo com core.filemode ainda falso
    expect(avisoDeFilemode(p, [".claude/hooks/a.sh"])).toBeUndefined();
  });

  it("integração: com core.filemode=true o aviso não aparece", () => {
    const p = novoProduto("expx-modo-produto-");
    criados.push(p);
    gitEm(p, "config", "core.filemode", "true");
    arquivo(p, ".claude/hooks/a.sh", 0o755);
    expect(filemodeDesligado(p)).toBe(false);
    expect(avisoDeFilemode(p, [".claude/hooks/a.sh"])).toBeUndefined();
  });
});
