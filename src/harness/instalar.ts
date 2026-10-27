import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Quem roda o binário: o `execFile` de verdade, ou um falso nos testes. */
export type Executor = (bin: string, args: string[]) => Promise<{ stdout: string }>;

const executorPadrao: Executor = (bin, args) => exec(bin, args);

/**
 * A instalação de fato do plugin no Claude Code.
 *
 * Declarar o marketplace em `.claude/settings.json` NÃO instala nada: cinco
 * sintaxes foram testadas em execução e nenhuma carregou o plugin (o
 * experimento está em `docs/expx-cli/base/09-validacao-marketplace-local.md`).
 * Quem instala é o próprio `claude`, por estes dois comandos.
 *
 * Consequência para quem clona o repositório: como o `marketplace add` grava um
 * caminho ABSOLUTO no settings do usuário, esse passo não viaja no commit —
 * cada pessoa roda o `expx init` na própria máquina.
 */

export type ComandoExterno = { bin: string; args: string[] };

/**
 * O Claude Code roda o plugin de um CACHE, não da pasta do projeto.
 *
 * A cópia vive em `~/.claude/plugins/cache/<marketplace>/<plugin>/<versao>/`, e
 * é dela que saem as skills, os comandos e os hooks da sessão. Montar um
 * `.expx/` novo no projeto não mexe nesse cache.
 *
 * Medido: depois de um `expx init` que montou a 0.5.1, o cache seguia na 0.1.1
 * — com um conjunto de skills antigo, SEM a runx e sem hooks. O efeito para
 * quem usa é a skill simplesmente nunca ser acionada, sem nenhum erro: o
 * modelo não vê a descrição que faria o gatilho disparar, então parte para o
 * trabalho manual.
 *
 * `plugin install` num plugin já instalado não recopia, e `marketplace update`
 * sozinho também não. Desinstalar antes é o que força a cópia nova.
 *
 * O `uninstall` roda em modo tolerante: na primeira instalação não há nada
 * para remover, e o erro dele é esperado — ver `instalarPlugin`.
 */
export function comandosDeInstalacao(caminhoMarketplace: string): ComandoExterno[] {
  return [
    // Remove antes de adicionar: com o `expx-local` já registrado em outro caminho
    // (por exemplo, uma worktree antiga), o `add` falharia como "já conhecido" e o
    // registro velho ficaria — o plugin deixaria de carregar quando ela sumisse.
    // Só no escopo do usuário: sem `--scope`, o `remove` apaga a declaração de
    // todos os escopos, inclusive a do projeto (`extraKnownMarketplaces` do
    // `.claude/settings.json`, que vai no commit).
    { bin: "claude", args: ["plugin", "marketplace", "remove", "--scope", "user", "expx-local"] },
    { bin: "claude", args: ["plugin", "marketplace", "add", "--scope", "user", caminhoMarketplace] },
    { bin: "claude", args: ["plugin", "marketplace", "update", "expx-local"] },
    { bin: "claude", args: ["plugin", "uninstall", "expx@expx-local"] },
    { bin: "claude", args: ["plugin", "install", "expx@expx-local"] },
  ];
}

/**
 * Comandos cuja falha não interrompe a sequência.
 *
 * `marketplace remove` e `uninstall` falham quando não há o que remover (a
 * primeira instalação), e `marketplace add` quando o marketplace já é conhecido.
 * São o caminho normal de uma primeira instalação e de uma reinstalação —
 * tratá-los como erro faria o `init` parar justamente nos casos mais comuns.
 */
function tolerante(args: readonly string[]): boolean {
  const s = args.join(" ");
  return s.startsWith("plugin uninstall") || s.startsWith("plugin marketplace add")
    || s.startsWith("plugin marketplace remove");
}

/** O que dizer quando o binário `claude` não está disponível. */
export function instrucaoManual(caminhoMarketplace: string): string {
  return [
    "O binario `claude` nao foi encontrado no PATH.",
    "O .expx/ foi montado e esta pronto; falta apenas registrar o plugin:",
    "",
    "  claude plugin marketplace remove --scope user expx-local   (pode falhar na primeira vez: e esperado)",
    `  claude plugin marketplace add --scope user ${caminhoMarketplace}`,
    "  claude plugin marketplace update expx-local",
    "  claude plugin uninstall expx@expx-local",
    "  claude plugin install expx@expx-local",
    "",
    "Rode os comandos acima e o namespace /expx: ficara disponivel.",
    "Os dois do meio nao sao opcionais: o Claude Code roda o plugin de um",
    "cache proprio, e sem eles a sessao continua carregando a versao antiga.",
  ].join("\n");
}

export type ResultadoInstalacao = {
  ok: boolean;
  executados: string[];
  /** Quando o binário falta, o texto que o usuário precisa ver. */
  instrucao?: string;
  erro?: string;
};

/** O caminho como o sistema o vê: resolvido, sem link nem nome curto 8.3. */
function normalizar(caminho: string): string {
  let r = resolve(caminho);
  try {
    r = realpathSync.native(r);
  } catch {
    // inexistente: fica o resolvido
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

/**
 * A pós-condição do `add`: o `expx-local` registrado aponta para o caminho
 * escolhido. O `remove` e o `add` são tolerantes, então o erro deles não prova
 * nada — sem esta conferência, um registro velho (de uma worktree removida)
 * sobreviveria com a instalação dizendo sucesso. A lista não traz o escopo;
 * traz o caminho, que é o que importa.
 */
async function conferirRegistro(executar: Executor, caminhoMarketplace: string): Promise<string | undefined> {
  let saida: string;
  try {
    saida = (await executar("claude", ["plugin", "marketplace", "list", "--json"])).stdout;
  } catch (e: unknown) {
    return `nao foi possivel conferir o registro do expx-local (claude plugin marketplace list --json): ${String(e)}`;
  }
  let lista: unknown;
  try {
    lista = JSON.parse(saida);
  } catch {
    return "nao foi possivel conferir o registro do expx-local: a saida de `claude plugin marketplace list --json` nao e JSON";
  }
  const item = Array.isArray(lista)
    ? (lista as Array<Record<string, unknown>>).find((m) => m?.["name"] === "expx-local")
    : undefined;
  const registrado = item?.["path"];
  if (typeof registrado !== "string") {
    return `o expx-local nao ficou registrado com o caminho local ${caminhoMarketplace}`;
  }
  if (normalizar(registrado) !== normalizar(caminhoMarketplace)) {
    return `o expx-local registrado aponta para ${registrado}, nao para ${caminhoMarketplace}`;
  }
  return undefined;
}

/**
 * Roda a sequência. Binário ausente NÃO é falha fatal: o `.expx/` já está
 * montado e a instalação pode ser concluída à mão. Depois do `add`, confere o
 * registro; se ele não aponta para o caminho escolhido, para antes de
 * reinstalar.
 */
export async function instalarPlugin(
  caminhoMarketplace: string,
  executar: Executor = executorPadrao,
): Promise<ResultadoInstalacao> {
  const executados: string[] = [];
  for (const c of comandosDeInstalacao(caminhoMarketplace)) {
    try {
      await executar(c.bin, c.args);
      executados.push(`${c.bin} ${c.args.join(" ")}`);
    } catch (e: unknown) {
      const msg = String(e);
      if (msg.includes("ENOENT")) {
        return { ok: false, executados, instrucao: instrucaoManual(caminhoMarketplace) };
      }
      // Nada a remover, marketplace já conhecido, ou nada a desinstalar: é o
      // caminho normal, não um defeito. Seguir é o que torna o `init` repetível.
      if (!tolerante(c.args)) return { ok: false, executados, erro: msg };
    }
    if (c.args[1] === "marketplace" && c.args[2] === "add") {
      const erro = await conferirRegistro(executar, caminhoMarketplace);
      if (erro !== undefined) return { ok: false, executados, erro };
    }
  }
  return { ok: true, executados };
}
