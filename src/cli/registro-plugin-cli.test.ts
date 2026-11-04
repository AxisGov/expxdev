import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A CLI chama o registro do plugin pela regra comum (worktree -> checkout
 * principal) no `init` e no `update` que aplicou algo — não basta a função
 * existir, ela precisa estar ligada aos dois comandos. O que toca disco e rede
 * (montagem, update, lock) é substituído; o registro é espiado.
 */
const registro = vi.hoisted(() => ({
  chamadas: [] as string[],
  instalacao: { ok: true, executados: [] } as { ok: boolean; executados: string[]; instrucao?: string; erro?: string; pulado?: boolean },
}));

vi.mock("../harness/registro.js", async (original) => {
  const real = await original<typeof import("../harness/registro.js")>();
  return {
    ...real,
    registrarPluginNoClaude: vi.fn(async (raiz: string) => {
      registro.chamadas.push(raiz);
      return { avisos: ["AVISO-DA-WORKTREE"], instalacao: registro.instalacao };
    }),
  };
});

// Nenhuma rodada deste teste pode executar o binário `claude` de verdade.
vi.mock("../harness/instalar.js", async (original) => {
  const real = await original<typeof import("../harness/instalar.js")>();
  return { ...real, instalarPlugin: vi.fn(async () => ({ ok: true, executados: [] })) };
});

vi.mock("./init.js", async (original) => {
  const real = await original<typeof import("./init.js")>();
  return {
    ...real,
    executarInit: vi.fn(async () => ({ ok: true, instaladas: ["mergex"], avisos: [], falhas: [], erros: [] })),
  };
});

const update = vi.hoisted(() => ({ aplicou: true }));
vi.mock("../update/flags.js", async (original) => {
  const real = await original<typeof import("../update/flags.js")>();
  return {
    ...real,
    executarUpdate: vi.fn(async () => ({
      ok: true, aplicou: update.aplicou, atualizadas: ["mergex"], emDia: [], bloqueadas: [], mensagens: [],
    })),
  };
});

vi.mock("../nucleo/lock.js", async (original) => {
  const real = await original<typeof import("../nucleo/lock.js")>();
  return { ...real, lerLock: vi.fn(() => ({ ok: true, lock: { harness: ["claude"] } })) };
});

import { executarExpx } from "./expx.js";

function saida(): { texto: string[]; escrever: (s: string) => void; escreverErro: (s: string) => void } {
  const texto: string[] = [];
  return { texto, escrever: (s) => texto.push(s), escreverErro: (s) => texto.push(s) };
}

describe("a CLI registra o plugin pela regra comum", () => {
  beforeEach(() => {
    registro.chamadas.length = 0;
    registro.instalacao = { ok: true, executados: [] };
    update.aplicou = true;
  });

  it("init: registra pela raiz do projeto e repassa o aviso", async () => {
    const s = saida();
    const rc = await executarExpx(["init", "--skills", "mergex", "--yes"], s);
    expect(rc).toBe(0);
    expect(registro.chamadas).toEqual([process.cwd()]);
    expect(s.texto.join("")).toContain("aviso: AVISO-DA-WORKTREE");
  });

  it("init: quando o registro foi pulado, nao diz que o plugin foi registrado", async () => {
    registro.instalacao = { ok: true, executados: [], pulado: true };
    const s = saida();
    const rc = await executarExpx(["init", "--skills", "mergex", "--yes"], s);
    expect(rc).toBe(0);
    expect(s.texto.join("")).not.toContain("plugin registrado");
  });

  it("update que aplicou: registra pela mesma regra", async () => {
    const s = saida();
    const rc = await executarExpx(["update", "--yes"], s);
    expect(rc).toBe(0);
    expect(registro.chamadas).toEqual([process.cwd()]);
    expect(s.texto.join("")).toContain("aviso: AVISO-DA-WORKTREE");
  });

  it("update que nao aplicou, ou --check: nao registra", async () => {
    update.aplicou = false;
    await executarExpx(["update", "--yes"], saida());
    update.aplicou = true;
    await executarExpx(["update", "--check"], saida());
    expect(registro.chamadas).toEqual([]);
  });
});

/**
 * `--sem-registro`: instala ou atualiza sem rodar nenhum `claude plugin ...`, para
 * quem não pode tocar o registro do escopo do usuário (Conselhos na 0.13.6, com um
 * `claude` que só responde a versão). O rc é o da instalação, e o aviso só sai
 * quando um registro foi de fato suprimido.
 */
describe("a CLI com --sem-registro", () => {
  beforeEach(() => {
    registro.chamadas.length = 0;
    registro.instalacao = { ok: false, executados: [], erro: "o expx-local nao ficou registrado com o caminho local /x" };
    update.aplicou = true;
  });
  const AVISO = "o plugin nao foi registrado no Claude Code (--sem-registro)";

  it("init: nao registra, sai 0 e avisa, sem dizer que registrou", async () => {
    const s = saida();
    const rc = await executarExpx(["init", "--skills", "mergex", "--yes", "--sem-registro"], s);
    expect(rc).toBe(0);
    expect(registro.chamadas).toEqual([]);
    expect(s.texto.join("")).toContain(AVISO);
    expect(s.texto.join("")).not.toContain("plugin registrado");
  });

  it("update que aplicou: nao registra, sai 0 e avisa", async () => {
    const s = saida();
    const rc = await executarExpx(["update", "--yes", "--sem-registro"], s);
    expect(rc).toBe(0);
    expect(registro.chamadas).toEqual([]);
    expect(s.texto.join("")).toContain(AVISO);
  });

  it("update que nao aplicou: nada a suprimir, sem aviso", async () => {
    update.aplicou = false;
    const s = saida();
    expect(await executarExpx(["update", "--yes", "--sem-registro"], s)).toBe(0);
    expect(s.texto.join("")).not.toContain(AVISO);
  });

  it("update --check --json: aceita, e a saida e so a linha de JSON", async () => {
    const s = saida();
    expect(await executarExpx(["update", "--check", "--json", "--sem-registro"], s)).toBe(0);
    expect(registro.chamadas).toEqual([]);
    const texto = s.texto.join("");
    expect(texto.trim().split("\n")).toHaveLength(1);
    expect(() => JSON.parse(texto) as unknown).not.toThrow();
  });
});

/**
 * No `update`, registrar é o que ativa a versão nova no cache do Claude Code:
 * se o registro falha, o update não cumpriu o que prometia e sai 1. Binário
 * ausente tem saída manual explícita e continua 0. No `init`, o registro é o
 * passo final, que a instrução manual completa: segue 0.
 */
describe("a CLI e a falha do registro", () => {
  beforeEach(() => {
    registro.chamadas.length = 0;
    update.aplicou = true;
  });

  it("update com erro no registro: sai 1 e diz o motivo", async () => {
    registro.instalacao = { ok: false, executados: [], erro: "o expx-local registrado aponta para /velho" };
    const s = saida();
    const rc = await executarExpx(["update", "--yes"], s);
    expect(rc).toBe(1);
    expect(s.texto.join("")).toContain("/velho");
  });

  it("update sem o binario claude: instrucao manual e 0", async () => {
    registro.instalacao = { ok: false, executados: [], instrucao: "INSTRUCAO-MANUAL" };
    const s = saida();
    const rc = await executarExpx(["update", "--yes"], s);
    expect(rc).toBe(0);
    expect(s.texto.join("")).toContain("INSTRUCAO-MANUAL");
  });

  it("init com erro no registro: continua 0, com o motivo", async () => {
    registro.instalacao = { ok: false, executados: [], erro: "o expx-local registrado aponta para /velho" };
    const s = saida();
    const rc = await executarExpx(["init", "--skills", "mergex", "--yes"], s);
    expect(rc).toBe(0);
    expect(s.texto.join("")).toContain("/velho");
  });
});
