import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, cpSync, mkdirSync, renameSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { observar, type Observador } from "./observador.js";
import { lerEstado } from "./estado.js";
import { plataformaAtual } from "../parser/conformidade/falhas-ambiente.js";
import { TipoViolacao } from "../parser/conformidade/regras.js";

let obs: Observador | null = null;
let dir: string | null = null;

afterEach(async () => {
  await obs?.parar();
  obs = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

/**
 * Espera a condição em vez de dormir um tempo fixo: o watcher do Windows pode
 * levar mais que 500 ms para entregar o primeiro evento no runner do CI, e uma
 * espera fixa fazia o teste passar numa rodada e falhar na outra.
 */
async function esperarAte(cond: () => boolean, limiteMs = 5000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (!cond() && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}

function projetoTemporario(): string {
  const d = mkdtempSync(join(tmpdir(), "expx-obs-"));
  cpSync("fixtures/projeto-ok", d, { recursive: true });
  return d;
}

describe.sequential("observador de arquivos", () => {
  it("integração: alterar um arquivo dispara exatamente uma releitura", async () => {
    dir = projetoTemporario();
    let disparos = 0;
    obs = await observar(dir, () => disparos++, 80);

    const alvo = join(dir, "docs/exportacao-csv/ORQUESTRADOR.md");
    writeFileSync(alvo, `${String(Date.now())}\n`, { flag: "a" });

    await new Promise((r) => setTimeout(r, 500));
    expect(disparos).toBe(1);
  });

  it("funcional: três alterações seguidas viram um único disparo", async () => {
    dir = projetoTemporario();
    let disparos = 0;
    obs = await observar(dir, () => disparos++, 150);

    const alvo = join(dir, "docs/exportacao-csv/sprint-01/tasks.md");
    for (let i = 0; i < 3; i++) {
      writeFileSync(alvo, `# ${String(i)}\n`, { flag: "a" });
      await new Promise((r) => setTimeout(r, 20));
    }

    await new Promise((r) => setTimeout(r, 600));
    expect(disparos).toBe(1);
  });
});

// Este arquivo mede AUSENCIA de evento ("nao disparou"), e por isso e o mais
// sensivel a ruido de vizinho: rodando concorrente, o watcher de um teste
// capta a atividade de arquivo que outro teste gera em /tmp, e a assercao
// "disparos === 0" falha de forma intermitente. Em serie, o arquivo e estavel.
describe.sequential("observação de .expx", () => {
  /**
   * Gravar o índice do memox NÃO pode disparar releitura: quem grava é o motor
   * do memox, disparado pelo hook `Stop`, e o painel não tem nada a reler por
   * causa disso além do próprio índice — que ele relê na próxima montagem.
   * Sem isso, reindexar realimenta a recarga (decisão D-06).
   */
  it("integração: gravar em .expx não dispara, gravar em docs dispara", async () => {
    dir = projetoTemporario();
    let disparos = 0;
    obs = await observar(dir, () => disparos++, 80);

    mkdirSync(join(dir, ".expx/memoria"), { recursive: true });
    writeFileSync(join(dir, ".expx/memoria/indice.json"), '{"versao":1}');
    await new Promise((r) => setTimeout(r, 400));
    expect(disparos).toBe(0);

    writeFileSync(join(dir, "docs/exportacao-csv/ORQUESTRADOR.md"), "x\n", { flag: "a" });
    await new Promise((r) => setTimeout(r, 400));
    expect(disparos).toBe(1);
  });

  it("funcional: reescrever o índice várias vezes segue sem disparar", async () => {
    dir = projetoTemporario();
    let disparos = 0;
    obs = await observar(dir, () => disparos++, 80);

    mkdirSync(join(dir, ".expx/memoria"), { recursive: true });
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, ".expx/memoria/indice.json"), `{"versao":1,"n":${String(i)}}`);
    }
    await new Promise((r) => setTimeout(r, 400));
    expect(disparos).toBe(0);
  });
});

/**
 * O caso que a decisão D-06 deixou de fora, e que ninguém cobria.
 *
 * Um painel aberto ANTES da primeira indexação lia `indice.json` inexistente,
 * guardava `memoria: null`, e nunca mais voltava ao disco — `.expx` estava
 * ignorado no watcher. Resultado observado em campo: painel no ar desde as
 * 10:18, índice gravado às 16:15 com sete trabalhos, e a tela seguindo em
 * "sem índice de memória" até alguém reiniciar o processo.
 *
 * O que separa os dois destinos é o que estes testes medem: mudança no índice
 * chega em `aoMudarMemoria` e NÃO em `aoMudar`, senão o laço de realimentação
 * que D-06 evitou volta pela porta dos fundos.
 */
describe.sequential("índice do memox que nasce com o painel no ar", () => {
  it("integração: o índice nascer dispara aoMudarMemoria, não aoMudar", async () => {
    dir = projetoTemporario();
    let docs = 0;
    let memoria = 0;
    obs = await observar(dir, {
      aoMudar: () => docs++,
      aoMudarMemoria: () => memoria++,
      debounceMs: 80,
    });

    // o índice não existia quando o painel subiu — este é o ponto do teste
    mkdirSync(join(dir, ".expx/memoria"), { recursive: true });
    writeFileSync(join(dir, ".expx/memoria/indice.json"), '{"versao":1}');

    await esperarAte(() => memoria > 0);
    // o evento chegou; uma folga curta mostra que foi UM disparo, e não vários
    await new Promise((r) => setTimeout(r, 250));
    expect(memoria).toBe(1);
    expect(docs).toBe(0);
  });

  it("funcional: mudança em docs segue sem tocar o caminho da memória", async () => {
    dir = projetoTemporario();
    let docs = 0;
    let memoria = 0;
    obs = await observar(dir, {
      aoMudar: () => docs++,
      aoMudarMemoria: () => memoria++,
      debounceMs: 80,
    });

    writeFileSync(join(dir, "docs/exportacao-csv/ORQUESTRADOR.md"), "x\n", { flag: "a" });

    await new Promise((r) => setTimeout(r, 500));
    expect(docs).toBe(1);
    expect(memoria).toBe(0);
  });

  it("funcional: reescrever o índice reindexado dispara de novo", async () => {
    dir = projetoTemporario();
    mkdirSync(join(dir, ".expx/memoria"), { recursive: true });
    writeFileSync(join(dir, ".expx/memoria/indice.json"), '{"versao":1,"n":0}');

    let memoria = 0;
    obs = await observar(dir, {
      aoMudar: () => undefined,
      aoMudarMemoria: () => memoria++,
      debounceMs: 80,
    });
    await new Promise((r) => setTimeout(r, 300));
    const inicial = memoria;

    // o motor grava de forma atômica: temporário + rename troca o inode, e um
    // watcher preso ao ARQUIVO pararia de ver mudança a partir daqui
    const tmp = join(dir, ".expx/memoria/.indice.tmp");
    writeFileSync(tmp, '{"versao":1,"n":1}');
    renameSync(tmp, join(dir, ".expx/memoria/indice.json"));

    await new Promise((r) => setTimeout(r, 500));
    expect(memoria).toBeGreaterThan(inicial);
  });
});

/**
 * A lista de falhas de ambiente muda a conformidade, mas vive em `.expx`, que
 * o watcher ignorava. Painel no ar e TSV gravado depois: a task vermelha só
 * por ambiente seguia acusada de `concluida_sem_verde` até reiniciar.
 */
describe.sequential("lista de falhas de ambiente com o painel no ar", () => {
  const TSV = ".expx/falhas-de-ambiente.tsv";

  // T-01.01 da fixture ruim fecha com suite vermelha; aqui ela declara a falha.
  function projetoVermelhoSoDeAmbiente(): string {
    const d = mkdtempSync(join(tmpdir(), "expx-obs-"));
    cpSync("fixtures/projeto-ruim", d, { recursive: true });
    const tasks = join(d, "docs/violacoes/sprint-01/tasks.md");
    const texto = readFileSync(tasks, "utf8").replace(
      /( {4}suite: vermelha)(\r?\n)/,
      "$1$2    suite_falhas: [src/a.test.ts]$2",
    );
    writeFileSync(tasks, texto);
    return d;
  }

  function semVerde(raiz: string): boolean {
    return lerEstado({ raiz, diasBloqueio: 7 }).violacoes.some(
      (v) => v.tipo === TipoViolacao.ConcluidaSemVerde && v.alvo === "T-01.01",
    );
  }

  it("integração: gravar e apagar o TSV recomputa concluida_sem_verde", async () => {
    dir = projetoVermelhoSoDeAmbiente();
    const raiz = dir;
    let acusada = semVerde(raiz);
    expect(acusada).toBe(true);
    obs = await observar(raiz, { aoMudar: () => { acusada = semVerde(raiz); }, debounceMs: 80 });

    mkdirSync(join(raiz, ".expx"), { recursive: true });
    writeFileSync(join(raiz, TSV), `src/a.test.ts\t${plataformaAtual()}\tsymlink exige admin\t2026-11-27\n`);
    await esperarAte(() => !acusada);
    expect(acusada).toBe(false);

    unlinkSync(join(raiz, TSV));
    await esperarAte(() => acusada);
    expect(acusada).toBe(true);
  });

  it("funcional: alterar o TSV já existente também recomputa", async () => {
    dir = projetoVermelhoSoDeAmbiente();
    const raiz = dir;
    mkdirSync(join(raiz, ".expx"), { recursive: true });
    writeFileSync(join(raiz, TSV), "# vazio por enquanto\n");
    let acusada = semVerde(raiz);
    expect(acusada).toBe(true);
    obs = await observar(raiz, { aoMudar: () => { acusada = semVerde(raiz); }, debounceMs: 80 });

    writeFileSync(join(raiz, TSV), `src/a.test.ts\t${plataformaAtual()}\tsem wsl\t2026-11-27\n`, { flag: "a" });
    await esperarAte(() => !acusada);
    expect(acusada).toBe(false);
  });

  it("funcional: outro arquivo de .expx segue sem disparar", async () => {
    dir = projetoTemporario();
    let disparos = 0;
    obs = await observar(dir, { aoMudar: () => disparos++, debounceMs: 80 });

    mkdirSync(join(dir, ".expx"), { recursive: true });
    writeFileSync(join(dir, ".expx/estado.json"), "{}");
    await new Promise((r) => setTimeout(r, 400));
    expect(disparos).toBe(0);
  });
});
