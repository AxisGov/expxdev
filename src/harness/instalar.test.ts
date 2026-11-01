import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { comandosDeInstalacao, instalarPlugin, instrucaoManual, type Executor } from "./instalar.js";

describe("instalação do plugin no Claude Code", () => {
  it("integração: devolve os comandos, na ordem, com o caminho do marketplace", () => {
    const c = comandosDeInstalacao("/proj/.expx/marketplace");
    // o remove do registro anterior vem primeiro; o add usa o caminho dado. Os dois
    // só no escopo do usuário: sem --scope, o remove apagaria também a declaração
    // versionada do projeto (extraKnownMarketplaces do .claude/settings.json).
    expect(c[0]?.args).toEqual(["plugin", "marketplace", "remove", "--scope", "user", "expx-local"]);
    expect(c[1]?.args).toEqual(["plugin", "marketplace", "add", "--scope", "user", "/proj/.expx/marketplace"]);
    const args = c.map((x) => x.args.join(" "));
    expect(args).toContain("plugin install expx@expx-local");
  });

  /**
   * O Claude Code NÃO carrega o plugin da pasta do projeto: ele copia para
   * `~/.claude/plugins/cache/<marketplace>/<plugin>/<versao>/` e roda de lá.
   *
   * Medido: depois de um `expx init` que montou a 0.5.1, o cache continuava na
   * 0.1.1 — com um conjunto de skills antigo, sem a runx e sem hooks. O
   * `plugin install` num plugin JÁ instalado não recopia, e o
   * `marketplace update` sozinho também não. A sessão seguia carregando a
   * versão velha, e o sintoma era a skill nunca ser acionada.
   *
   * Por isso a sequência desinstala antes de instalar: é o que força a cópia.
   */
  it("funcional: desinstala antes de instalar, para o cache do Claude Code ser recopiado", () => {
    const args = comandosDeInstalacao("/proj/.expx/marketplace").map((x) => x.args.join(" "));
    const uninstall = args.findIndex((a) => a.startsWith("plugin uninstall"));
    const install = args.findIndex((a) => a === "plugin install expx@expx-local");
    expect(uninstall).toBeGreaterThanOrEqual(0);
    expect(uninstall).toBeLessThan(install);
  });

  it("funcional: atualiza o marketplace antes de reinstalar", () => {
    const args = comandosDeInstalacao("/proj/.expx/marketplace").map((x) => x.args.join(" "));
    const update = args.findIndex((a) => a.startsWith("plugin marketplace update"));
    const install = args.findIndex((a) => a === "plugin install expx@expx-local");
    expect(update).toBeGreaterThanOrEqual(0);
    expect(update).toBeLessThan(install);
  });

  it("funcional: a instrução manual cita os dois comandos para quem não tem o binário", () => {
    const t = instrucaoManual("/proj/.expx/marketplace");
    expect(t).toContain("claude plugin marketplace add --scope user /proj/.expx/marketplace");
    expect(t).toContain("claude plugin install expx@expx-local");
  });
});

/**
 * O `remove` e o `add` são tolerantes (nada a remover na primeira vez; `add`
 * repetido), então o erro deles não prova nada. O que prova é a pós-condição:
 * depois do `add`, o `expx-local` registrado aponta para o caminho escolhido.
 * Sem ela, um registro velho (de uma worktree removida) sobreviveria com a
 * instalação dizendo sucesso.
 */
describe("instalação: o registro é conferido depois do add", () => {
  const CAMINHO = "/proj/.expx/marketplace";
  type Falha = { em: string; erro: string };

  function executorFalso(lista: () => string, falhas: Falha[] = []): { chamadas: string[]; executar: Executor } {
    const chamadas: string[] = [];
    const executar: Executor = async (_bin, args) => {
      const a = args.join(" ");
      chamadas.push(a);
      const f = falhas.find((x) => a.startsWith(x.em));
      if (f !== undefined) throw new Error(f.erro);
      if (a === "plugin marketplace list --json") return { stdout: lista() };
      return { stdout: "" };
    };
    return { chamadas, executar };
  }
  const listaCom = (path: string) => () =>
    JSON.stringify([{ name: "outro", source: "github" }, { name: "expx-local", source: "directory", path }]);
  const depoisDoAdd = (chamadas: string[]) =>
    chamadas.filter((a) => /^plugin (marketplace update|uninstall|install)/.test(a));

  it("integração: caminho confirmado -> segue até o install", async () => {
    const { chamadas, executar } = executorFalso(listaCom(CAMINHO));
    const r = await instalarPlugin(CAMINHO, executar);
    expect(r.ok).toBe(true);
    const list = chamadas.indexOf("plugin marketplace list --json");
    const add = chamadas.findIndex((a) => a.startsWith("plugin marketplace add"));
    const install = chamadas.indexOf("plugin install expx@expx-local");
    expect(add).toBeLessThan(list);
    expect(list).toBeLessThan(install);
  });

  it("funcional: o expx-local registrado aponta para outro caminho -> erro, e nada depois do add roda", async () => {
    const { chamadas, executar } = executorFalso(listaCom("/worktree-velha/.expx/marketplace"));
    const r = await instalarPlugin(CAMINHO, executar);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("/worktree-velha/.expx/marketplace");
    expect(depoisDoAdd(chamadas)).toEqual([]);
  });

  it("funcional: o remove falhou e o add disse 'já conhecido', mas a lista confirma o caminho -> segue", async () => {
    const { executar } = executorFalso(listaCom(CAMINHO), [
      { em: "plugin marketplace remove", erro: "Marketplace not found" },
      { em: "plugin marketplace add", erro: "Marketplace 'expx-local' already exists" },
    ]);
    const r = await instalarPlugin(CAMINHO, executar);
    expect(r.ok).toBe(true);
  });

  it("funcional: o list falha, não é JSON ou não tem o expx-local -> erro, e nada depois do add roda", async () => {
    const casos: Array<{ lista: () => string; falhas?: Falha[] }> = [
      { lista: () => "", falhas: [{ em: "plugin marketplace list", erro: "unknown option --json" }] },
      { lista: () => "isto nao e json" },
      { lista: () => JSON.stringify([{ name: "outro", source: "github" }]) },
      { lista: () => JSON.stringify([{ name: "expx-local", source: "github", repo: "x/y" }]) },
    ];
    for (const c of casos) {
      const { chamadas, executar } = executorFalso(c.lista, c.falhas);
      const r = await instalarPlugin(CAMINHO, executar);
      expect(r.ok).toBe(false);
      expect(r.erro).toBeDefined();
      expect(depoisDoAdd(chamadas)).toEqual([]);
    }
  });

  it("funcional: o remove nunca sai do escopo do usuário", async () => {
    const { chamadas, executar } = executorFalso(listaCom(CAMINHO));
    await instalarPlugin(CAMINHO, executar);
    const removes = chamadas.filter((a) => a.startsWith("plugin marketplace remove"));
    expect(removes).toEqual(["plugin marketplace remove --scope user expx-local"]);
  });

  it("funcional: link simbólico ou caminho relativo para o mesmo diretório contam como o mesmo caminho", async () => {
    const base = mkdtempSync(join(tmpdir(), "expx-inst-"));
    try {
      const real = join(base, "real", ".expx", "marketplace");
      mkdirSync(real, { recursive: true });
      const link = join(base, "link");
      symlinkSync(join(base, "real"), link, "junction");
      for (const registrado of [join(link, ".expx", "marketplace"), relative(process.cwd(), real)]) {
        const { executar } = executorFalso(listaCom(registrado));
        const r = await instalarPlugin(real, executar);
        expect(r.ok).toBe(true);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("funcional: binário ausente -> instrução manual, sem erro", async () => {
    const { executar } = executorFalso(listaCom(CAMINHO), [{ em: "plugin", erro: "spawn claude ENOENT" }]);
    const r = await instalarPlugin(CAMINHO, executar);
    expect(r.ok).toBe(false);
    expect(r.instrucao).toBeDefined();
    expect(r.erro).toBeUndefined();
  });
});
