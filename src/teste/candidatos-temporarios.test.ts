import { afterAll, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import {
  adotavelPeloCiclo,
  arvore,
  estritamenteDentro,
  fontesCandidatas,
  gitEm,
  larIsolado,
  noPath,
  novoProduto,
  pathControlado,
  pathDosHooksSemJq,
  RAIZ_DO_REPO,
  temporarios,
} from "./candidatos.js";

/**
 * O ciclo de vida dos temporários da bancada de candidatas.
 *
 * A bancada P0.2 monta PATH controlado a cada `init` e a cada `doctor`, e o
 * caminho que `pathControlado` devolve nunca chegava ao `afterAll`: a certificação
 * deixava uma pasta `expx-bin-*` por chamada no temporário do sistema — 36 numa
 * única execução dos dois arquivos de certificação, mais uma `expx-sem-jq-*`. É
 * pasta órfã, de dono nenhum, que ninguém mais vai remover.
 *
 * O que estes testes fixam é o CONTRATO do ciclo, não a contagem:
 *
 *   1. toda pasta que um helper daqui cria nasce sob o ciclo, antes de qualquer
 *      trabalho que possa falhar — então erro e retorno antecipado não deixam órfã;
 *   2. `temporarios.descartar()` remove tudo que está sob o ciclo;
 *   3. o descarte é pela LISTA de caminhos desta execução, nunca por prefixo —
 *      pasta que o helper não criou sobrevive, mesmo com o mesmo prefixo.
 *
 * O TMPDIR é privado em toda prova de ausência: o que aparece nele foi criado
 * pela chamada sob teste, e por mais nada. Nenhuma asserção aqui depende de
 * temporário deixado por execução anterior, nem de varredura do temporário real.
 */

const POSIX = process.platform !== "win32";
/** Root ignora o bit de escrita: a prova que depende de remoção que FALHA não vale lá. */
const COMO_ROOT = process.getuid !== undefined && process.getuid() === 0;

/** Roda `f` com variáveis de ambiente trocadas, e devolve cada uma ao que era. */
function comAmbiente(trocas: Record<string, string>, f: () => void): void {
  const antes = new Map(Object.keys(trocas).map((k) => [k, process.env[k]]));
  Object.assign(process.env, trocas);
  try {
    f();
  } finally {
    for (const [k, v] of antes) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Uma pasta temporária deste arquivo — fora do ciclo, para ser o TMPDIR privado da prova. */
function privado(prefixo: string): string {
  return mkdtempSync(join(tmpdir(), prefixo));
}

afterAll(() => {
  temporarios.descartar();
});

describe("temporários da bancada de candidatas — o ciclo recolhe o que os helpers criam", () => {
  it.skipIf(!POSIX)("funcional: a pasta de links do PATH controlado nasce sob o ciclo e sai no descarte", () => {
    const bin = pathControlado(true);
    expect(temporarios.lista()).toContain(bin);
    expect(existsSync(bin)).toBe(true);
    // o git REAL, alvo do link que está dentro dela
    const git = noPath("git");
    expect(git).toBeDefined();

    temporarios.descartar();

    expect(existsSync(bin)).toBe(false);
    expect(temporarios.lista()).toEqual([]);
    // o descarte levou o link, não o binário: só sai o que o helper criou
    expect(existsSync(git as string)).toBe(true);
  });

  it.skipIf(!POSIX)("funcional: a pasta de links sem jq nasce sob o ciclo e sai no descarte", () => {
    const semJq = pathDosHooksSemJq();
    expect(temporarios.lista()).toContain(semJq);
    expect(readdirSync(semJq).length).toBeGreaterThan(5);

    temporarios.descartar();

    expect(existsSync(semJq)).toBe(false);
    expect(existsSync(noPath("bash") as string)).toBe(true);
  });

  it("funcional: fontes, produto e lar nascem sob o ciclo e saem no descarte", () => {
    const fontes = fontesCandidatas();
    const produto = novoProduto("expx-teste-ciclo-produto-");
    const { lar } = larIsolado();
    for (const c of [fontes, produto, lar]) {
      expect(temporarios.lista(), c).toContain(c);
      expect(existsSync(c), c).toBe(true);
    }
    expect(gitEm(produto, "config", "--get", "maintenance.auto").trim()).toBe("false");
    expect(gitEm(produto, "config", "--get", "gc.auto").trim()).toBe("0");

    temporarios.descartar();

    for (const c of [fontes, produto, lar]) expect(existsSync(c), c).toBe(false);
    expect(temporarios.lista()).toEqual([]);
  }, 120000);

  it("funcional: caminho criado fora dos helpers entra no ciclo por adoção", () => {
    const fora = privado("expx-teste-adotado-");
    expect(temporarios.adotar(fora)).toBe(fora);
    expect(temporarios.lista()).toContain(fora);

    temporarios.descartar();

    expect(existsSync(fora)).toBe(false);
  });

  it("funcional: o descarte é pela lista — pasta de MESMO prefixo que o ciclo não conhece sobrevive", () => {
    // O prefixo de `fontesCandidatas`, numa pasta que o ciclo nunca registrou:
    // um descarte por padrão (`expx-candidatas-*`) a levaria embora.
    const forasteiro = privado("expx-candidatas-");
    try {
      const produto = novoProduto("expx-teste-ciclo-vizinho-");
      temporarios.descartar();

      expect(existsSync(produto)).toBe(false);
      expect(existsSync(forasteiro)).toBe(true);
    } finally {
      rmSync(forasteiro, { recursive: true, force: true });
    }
  });

  it("funcional: descartar duas vezes seguidas é inofensivo", () => {
    const produto = novoProduto("expx-teste-ciclo-duplo-");
    temporarios.descartar();
    expect(existsSync(produto)).toBe(false);
    expect(() => {
      temporarios.descartar();
    }).not.toThrow();
    expect(temporarios.lista()).toEqual([]);
  });
});

describe("temporários da bancada de candidatas — caminho de erro não deixa órfã", () => {
  it.skipIf(!POSIX)("funcional: externo ausente reprova pathDosHooksSemJq sem deixar pasta órfã", () => {
    const completo = pathDosHooksSemJq();
    // A lista NOMEADA de externos, lida do que o próprio helper montou.
    const externos = readdirSync(completo).sort();
    expect(externos.length).toBeGreaterThan(5);
    const ausente = "od";
    expect(externos).toContain(ausente);

    const parcial = privado("expx-teste-path-parcial-");
    const tmp = privado("expx-teste-tmp-sem-jq-");
    try {
      for (const nome of externos) if (nome !== ausente) symlinkSync(join(completo, nome), join(parcial, nome));
      comAmbiente({ PATH: parcial, TMPDIR: tmp }, () => {
        expect(() => pathDosHooksSemJq()).toThrow(/\bod ausente\b/);
      });
      // Nada foi criado: a conferência dos externos acontece ANTES da pasta existir.
      expect(readdirSync(tmp)).toEqual([]);
    } finally {
      rmSync(parcial, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
      temporarios.descartar();
    }
  });

  it.skipIf(!POSIX)("funcional: git ausente reprova fontesCandidatas, e o ciclo recolhe a pasta já criada", () => {
    // Aqui a pasta JÁ existe quando a falha acontece: `fontesCandidatas` copia o
    // snapshot antes de chamar o `git init`. Sem registro no nascimento, essa
    // pasta ficaria órfã — é o retorno antecipado que o ciclo tem de cobrir.
    const vazio = privado("expx-teste-path-vazio-");
    const tmp = privado("expx-teste-tmp-fontes-");
    try {
      comAmbiente({ PATH: vazio, TMPDIR: tmp }, () => {
        expect(() => fontesCandidatas()).toThrow();
      });
      const orfas = readdirSync(tmp);
      expect(orfas).toHaveLength(1);
      expect(temporarios.lista()).toContain(join(tmp, orfas[0] as string));

      temporarios.descartar();

      expect(readdirSync(tmp)).toEqual([]);
    } finally {
      rmSync(vazio, { recursive: true, force: true });
      rmSync(tmp, { recursive: true, force: true });
      temporarios.descartar();
    }
  }, 120000);
});

/**
 * A guarda da adoção.
 *
 * Adotar é agendar um `rm -rf`: o caminho adotado sai do disco no `descartar()`.
 * Numa tentativa anterior de escrever esta bancada, a RAIZ DESTA WORKTREE foi
 * passada a `adotar()` para obter um vermelho, e o ciclo removeu os arquivos
 * rastreados do repositório. A guarda existe por causa disso, e o jeito de
 * testá-la também:
 *
 *   - os caminhos PERIGOSOS (o próprio `tmpdir()`, ancestral dele, HOME, a raiz
 *     do repositório, `/`) são provados contra `adotavelPeloCiclo`, que é função
 *     PURA — ela não registra, não cria e não remove nada, e um vermelho ali não
 *     tem desfecho destrutivo possível;
 *   - `adotar()` só recebe caminho que este teste criou dentro do temporário, ou
 *     recusa cujo caminho é inofensivo mesmo se a guarda sumisse (string vazia e
 *     caminho que não existe no disco).
 *
 * Nenhuma pasta real de fora do temporário é criada, apontada ou removida aqui.
 */
describe("temporários da bancada de candidatas — a adoção é validada antes de qualquer remoção", () => {
  it("funcional: o predicado recusa o próprio tmpdir, ancestral, HOME e raiz de repositório", () => {
    const tmp = tmpdir();
    for (const fora of [
      "",
      tmp,
      `${tmp}${sep}`,
      resolve(tmp, ".."),
      join(tmp, "..", ".."),
      // dentro na forma crua, FORA depois de normalizar: é por isso que a guarda
      // normaliza antes de comparar
      join(tmp, "x", "..", ".."),
      join(tmp, "x", "..", "..", "etc"),
      // vizinho de mesmo prefixo textual: `/tmp-outro` não está dentro de `/tmp`
      `${tmp}-vizinho`,
      sep,
      homedir(),
      join(homedir(), "projetos"),
      RAIZ_DO_REPO,
      join(RAIZ_DO_REPO, "src"),
      // relativos: resolvem contra o diretório de trabalho, que é a raiz do repo
      ".",
      "..",
      "src",
    ]) {
      expect(adotavelPeloCiclo(fora), JSON.stringify(fora)).toBe(false);
    }
  });

  it("funcional: o predicado aceita pasta e arquivo estritamente dentro do temporário", () => {
    const d = privado("expx-teste-dentro-");
    try {
      expect(adotavelPeloCiclo(d)).toBe(true);
      expect(adotavelPeloCiclo(join(d, "filho"))).toBe(true);
      expect(adotavelPeloCiclo(join(d, "filho", "neto"))).toBe(true);
      // o arquivo de mensagem que a bancada da MergeX adota, vizinho do produto
      expect(adotavelPeloCiclo(`${d}.msg`)).toBe(true);
      // forma não normalizada de um caminho que, normalizado, continua dentro
      expect(adotavelPeloCiclo(join(d, "filho", "..", "irmao"))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("funcional: no Windows a caixa não distingue caminho, e os dois separadores abrem o mesmo", () => {
    // A semântica do Windows é verificada AQUI, em POSIX, porque é aqui que a
    // bancada roda: um teste condicionado a `win32` nunca provaria a regra.
    const base = "C:\\Users\\K\\AppData\\Local\\Temp";
    const dentro = [
      "C:\\Users\\K\\AppData\\Local\\Temp\\expx-a",
      "c:\\users\\k\\appdata\\local\\temp\\expx-a",
      "c:/users/k/appdata/local/temp/expx-a",
      "C:\\Users\\K\\AppData\\Local\\Temp\\x\\..\\expx-a",
    ];
    for (const c of dentro) expect(estritamenteDentro(base, c, true), c).toBe(true);
    const fora = [
      base,
      base.toLowerCase(),
      `${base}\\`,
      "C:\\Users\\K\\AppData\\Local",
      "C:\\Users\\K\\AppData\\Local\\Tempest\\x",
      "C:\\Users\\K\\AppData\\Local\\Temp\\..\\x",
      "D:\\expx-a",
      "",
    ];
    for (const c of fora) expect(estritamenteDentro(base, c, true), c).toBe(false);
    // Em POSIX a caixa DISTINGUE: `/tmp/X` não é `/tmp/x`, e a comparação sem
    // caixa do Windows não pode vazar para cá.
    expect(estritamenteDentro("/tmp/base", "/tmp/base/x", false)).toBe(true);
    expect(estritamenteDentro("/tmp/base", "/TMP/BASE/x", false)).toBe(false);
  });

  it("funcional: adotar recusa caminho de fora, e o recusado não entra no ciclo", () => {
    // Só caminho inofensivo é entregue a `adotar`: `""` não é caminho que o
    // `rmSync` resolva, e o segundo não existe. Se a guarda regredisse, o
    // vermelho apareceria aqui sem nada ter sido removido.
    const antes = temporarios.lista();
    for (const fora of ["", join(sep, "expx-teste-caminho-que-nao-existe", "alvo")]) {
      expect(() => temporarios.adotar(fora), JSON.stringify(fora)).toThrow(/adotar recusou/);
      expect(temporarios.lista(), JSON.stringify(fora)).toEqual(antes);
    }
  });

  it("funcional: adotar aceita arquivo temporário, normaliza o caminho e é idempotente", () => {
    const d = privado("expx-teste-adotado-arquivo-");
    const msg = `${d}.msg`;
    writeFileSync(msg, "fix(src): fecha T-01.01\n");
    try {
      expect(temporarios.adotar(msg)).toBe(msg);
      // o MESMO arquivo escrito de outra forma, e o mesmo de novo: entra uma vez
      expect(temporarios.adotar(join(d, "..", basename(msg)))).toBe(msg);
      expect(temporarios.adotar(msg)).toBe(msg);
      expect(temporarios.lista().filter((c) => c === msg)).toEqual([msg]);

      temporarios.descartar();

      expect(existsSync(msg)).toBe(false);
      expect(temporarios.lista()).toEqual([]);
    } finally {
      rmSync(d, { recursive: true, force: true });
      rmSync(msg, { force: true });
    }
  });
});

describe("temporários da bancada de candidatas — o descarte sai do mais novo para o mais velho", () => {
  /**
   * A ordem filho-antes-do-pai, provada pelo DIAGNÓSTICO.
   *
   * Com remoção que dá certo a ordem não é observável: o pai removido primeiro
   * levaria o filho, e o `rmSync` do filho logo depois seria silencioso
   * (`force: true` engole ENOENT). O que torna a ordem visível é a FALHA —
   * `descartar()` relata os caminhos na ordem em que tentou.
   *
   * O cenário é o da promessa, na mesma relação que a bancada tem em uso: a
   * pasta que hospeda (pai) e, adotado DEPOIS dela, um caminho dentro dela — o
   * lugar de uma worktree. Um arquivo que não pode ser desvinculado faz as DUAS
   * remoções falharem, e o relatório mostra que a tentativa do filho veio antes
   * da do pai.
   *
   * De carona, a prova do que a lista faz com o que não saiu: ele continua sob o
   * ciclo, e o descarte seguinte — com a permissão de volta — o recolhe.
   */
  it.skipIf(!POSIX || COMO_ROOT)("funcional: o filho adotado é tentado antes do pai, e o que não sai continua sob o ciclo", () => {
    expect(temporarios.lista(), "o ciclo precisa estar vazio para a ordem ser lida direto da lista").toEqual([]);
    const pai = temporarios.novo("expx-teste-ordem-pai-");
    const filho = join(pai, "worktree");
    mkdirSync(filho);
    writeFileSync(join(filho, "preso.txt"), "conteudo\n");
    expect(temporarios.adotar(filho)).toBe(filho);
    expect(temporarios.lista()).toEqual([pai, filho]);

    try {
      // Sem bit de escrita na pasta, o arquivo de dentro não pode ser
      // desvinculado: falha a remoção do filho e falha a do pai, que teria de
      // remover o mesmo arquivo.
      chmodSync(filho, 0o500);
      let erro: Error | undefined;
      try {
        temporarios.descartar();
      } catch (e) {
        erro = e as Error;
      }
      expect(erro, "as duas remoções eram impossíveis: descartar tinha de reprovar").toBeDefined();
      // O diagnóstico não é engolido, e nomeia cada caminho que ficou.
      const relatadas = (erro as Error).message.split("\n").slice(1);
      expect(relatadas).toHaveLength(2);
      // `startsWith`, e não `toContain`: o caminho do pai é prefixo do do filho,
      // e um `toContain(pai)` casaria com as duas linhas sem distinguir ordem.
      expect(relatadas[0]?.startsWith(`${filho}:`), relatadas.join(" | ")).toBe(true);
      expect(relatadas[1]?.startsWith(`${pai}:`), relatadas.join(" | ")).toBe(true);

      // E o que não saiu continua com dono, na ordem original.
      expect(temporarios.lista()).toEqual([pai, filho]);
      expect(existsSync(join(filho, "preso.txt"))).toBe(true);
    } finally {
      // A permissão volta SEMPRE, senão nem este teste nem o `afterAll` recolhem
      // o que ficou. Não é `catch {}`: se a pasta já tiver saído não há o que
      // devolver, e qualquer outro erro do `chmod` continua subindo.
      if (existsSync(filho)) chmodSync(filho, 0o700);
    }

    // A retentativa é o que o dono preservado compra: a MESMA lista sai agora.
    temporarios.descartar();
    expect(existsSync(pai)).toBe(false);
    expect(temporarios.lista()).toEqual([]);
  });
});

/**
 * A prova estática: quem usa um helper que CRIA temporário tem de fechar o ciclo.
 *
 * Os cinco helpers abaixo registram no ciclo o que criam, e quem fecha o ciclo é
 * o arquivo de teste, no `afterAll`. Arquivo que usa um deles e não fecha deixa
 * pasta órfã no temporário do sistema — foi assim que 36 `expx-bin-*` apareceram
 * numa execução só. Nenhum teste funcional pega isso: a órfã é de OUTRO arquivo,
 * e varrer o temporário real para achá-la é teste que depende do que mais está
 * rodando na máquina. Daí a prova ser estática.
 *
 * Comentário não fecha ciclo: o texto é lido sem comentário de bloco e sem
 * comentário de linha, para um `// temporarios.descartar()` desativado não contar
 * como ciclo fechado.
 */
describe("temporários da bancada de candidatas — nenhum consumidor fica sem fechar o ciclo", () => {
  const HELPERS_QUE_CRIAM = ["novoProduto", "fontesCandidatas", "larIsolado", "pathControlado", "pathDosHooksSemJq"] as const;

  /** O texto sem comentário de bloco e sem comentário de linha. */
  function semComentario(texto: string): string {
    return texto
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => {
        // `//` de comentário abre a linha ou vem depois de espaço; o `//` de uma
        // URL (`https://`) vem depois de `:`, e esse fica.
        const m = /(?:^|[ \t])\/\//.exec(l);
        return m === null ? l : l.slice(0, m.index);
      })
      .join("\n");
  }

  /** Os nomes que este texto importa de `candidatos.js`, de todos os `import` dele. */
  function importadosDeCandidatos(texto: string): string[] {
    const nomes: string[] = [];
    const re = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*candidatos\.js["']/g;
    for (let m = re.exec(texto); m !== null; m = re.exec(texto)) {
      for (const parte of (m[1] as string).split(",")) {
        const nome = (parte.trim().split(/\s+as\s+/)[0] ?? "").trim();
        if (nome !== "") nomes.push(nome);
      }
    }
    return nomes;
  }

  /** Um `afterAll`/`afterEach` deste texto chama `temporarios.descartar()`? */
  function fechaOCiclo(texto: string): boolean {
    const re = /\bafter(?:All|Each)\s*\(/g;
    for (let m = re.exec(texto); m !== null; m = re.exec(texto)) {
      if (texto.slice(m.index, m.index + 400).includes("temporarios.descartar()")) return true;
    }
    return false;
  }

  it("estático: a leitura reconhece import, comentário e ciclo fechado", () => {
    // A própria prova é testada antes de ser usada: uma leitura quebrada acharia
    // consumidor nenhum e ficaria verde por vacuidade.
    const comCiclo = [
      'import { gitEm, novoProduto, temporarios } from "../teste/candidatos.js";',
      "afterAll(() => {",
      "  temporarios.descartar();",
      "});",
    ].join("\n");
    expect(importadosDeCandidatos(comCiclo)).toEqual(["gitEm", "novoProduto", "temporarios"]);
    expect(fechaOCiclo(comCiclo)).toBe(true);

    const comentado = comCiclo.replace("  temporarios.descartar();", "  // temporarios.descartar();");
    expect(fechaOCiclo(semComentario(comentado))).toBe(false);
    const emBloco = comCiclo.replace("  temporarios.descartar();", "  /* temporarios.descartar(); */");
    expect(fechaOCiclo(semComentario(emBloco))).toBe(false);
    // import em várias linhas, com apelido, e sem ciclo nenhum
    const multilinha = 'import {\n  novoProduto,\n  gitEm as git,\n} from "./candidatos.js";\n';
    expect(importadosDeCandidatos(multilinha)).toEqual(["novoProduto", "gitEm"]);
    expect(fechaOCiclo(multilinha)).toBe(false);
    // e a URL com `//` sobrevive à remoção de comentário
    expect(semComentario('const u = "https://exemplo/x"; // nota')).toBe('const u = "https://exemplo/x";');
  });

  it("estático: todo consumidor dos cinco helpers fecha o ciclo", () => {
    const testes = arvore(join(RAIZ_DO_REPO, "src")).filter((r) => r.endsWith(".test.ts"));
    expect(testes.length).toBeGreaterThan(10);

    const consumidores: string[] = [];
    const semCiclo: string[] = [];
    for (const rel of testes) {
      const texto = semComentario(readFileSync(join(RAIZ_DO_REPO, "src", rel), "utf8"));
      const importados = importadosDeCandidatos(texto);
      const usados = HELPERS_QUE_CRIAM.filter((h) => importados.includes(h));
      if (usados.length === 0) continue;
      consumidores.push(rel);
      if (!importados.includes("temporarios") || !fechaOCiclo(texto)) semCiclo.push(`${rel} (${usados.join(", ")})`);
    }

    expect(semCiclo).toEqual([]);
    // Guarda contra prova vazia: a leitura tem de estar vendo os consumidores que
    // existem. Sem isto, um regex quebrado deixaria a prova verde achando nada.
    for (const esperado of [
      "cli/certificacao-d03.test.ts",
      "cli/certificacao-modo-executavel.test.ts",
      "cli/certificacao-p02.test.ts",
      "doctor/modo-executavel.test.ts",
      "nucleo/aviso-de-filemode.test.ts",
      "nucleo/comando-de-reparo.test.ts",
      "nucleo/modo-executavel-git.test.ts",
      "teste/candidatos-temporarios.test.ts",
    ]) {
      expect(consumidores, esperado).toContain(esperado);
    }
  });
});
