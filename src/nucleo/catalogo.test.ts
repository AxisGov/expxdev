import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOGO, buscarNoCatalogo, ehCamada, NOMES, resolverOrigem } from "./catalogo.js";
import { CANDIDATOS, RAIZ_DO_REPO } from "../teste/candidatos.js";

const SKILLS_AXISGOV = [
  ["runx", "https://github.com/AxisGov/runx", "https://github.com/bittencourtthulio/runx"],
  ["mergex", "https://github.com/AxisGov/mergex", "https://github.com/bittencourtthulio/mergex"],
  ["sprintx", "https://github.com/AxisGov/sprintx", "https://github.com/bittencourtthulio/sprintx"],
  ["buildx", "https://github.com/AxisGov/buildx", "https://github.com/bittencourtthulio/buildx"],
  ["legadox", "https://github.com/AxisGov/legadox", "https://github.com/bittencourtthulio/legadox"],
  ["stackx", "https://github.com/AxisGov/stackx", "https://github.com/bittencourtthulio/stackx"],
  ["designx", "https://github.com/AxisGov/designx", "https://github.com/bittencourtthulio/designx"],
  ["memox", "https://github.com/AxisGov/MemoX", "https://github.com/bittencourtthulio/MemoX"],
  ["prodx", "https://github.com/AxisGov/prodx", "https://github.com/bittencourtthulio/prodx"],
] as const;

describe("catálogo das skills", () => {
  it("integração: tem as nove skills do catalogo e nenhuma URL repetida", () => {
    expect(CATALOGO).toHaveLength(9);
    const urls = CATALOGO.map((s) => s.repositorio);
    expect(new Set(urls).size).toBe(9);
    expect(NOMES).toEqual([
      "sprintx",
      "runx",
      "legadox",
      "stackx",
      "mergex",
      "memox",
      "prodx",
      "buildx",
      "designx",
    ]);
  });

  it("funcional: memox aponta para o repositório do MemoX e é camada", () => {
    // o memox não tem fluxo próprio: só produz o índice que as outras consultam
    expect(buscarNoCatalogo("memox")?.repositorio).toBe("https://github.com/AxisGov/MemoX");
    expect(ehCamada("memox")).toBe(true);
  });

  it("funcional: dado o nome legadox, devolve a URL do repositório correspondente", () => {
    const s = buscarNoCatalogo("legadox");
    expect(s?.repositorio).toBe("https://github.com/AxisGov/legadox");
    expect(buscarNoCatalogo("inexistente")).toBeUndefined();
  });

  it("funcional: prodx aponta para o repositório do prodx e é camada", () => {
    // o prodx roda ANTES do plano: ele decide se existe trabalho, não como fazê-lo
    expect(buscarNoCatalogo("prodx")?.repositorio).toBe("https://github.com/AxisGov/prodx");
    expect(ehCamada("prodx")).toBe(true);
  });

  it("funcional: legadox e stackx são camadas; sprintx e runx não são", () => {
    expect(ehCamada("legadox")).toBe(true);
    expect(ehCamada("stackx")).toBe(true);
    expect(ehCamada("sprintx")).toBe(false);
    expect(ehCamada("runx")).toBe(false);
  });

  it("funcional: buildx aponta para o repositório do buildx e não é camada", () => {
    // a buildx ORQUESTRA sprintx e mergex feature a feature — não modifica o
    // comportamento delas, que é o que define uma camada. Sem elas ela não roda,
    // e é a própria skill que avisa: o `init` não modela dependência entre skills.
    expect(buscarNoCatalogo("buildx")?.repositorio).toBe(
      "https://github.com/AxisGov/buildx",
    );
    expect(ehCamada("buildx")).toBe(false);
  });

  it.each(SKILLS_AXISGOV)("funcional: %s aponta exclusivamente para AxisGov", (nome, canonica) => {
    expect(buscarNoCatalogo(nome)?.repositorio).toBe(canonica);
  });


  it.each(SKILLS_AXISGOV)(
    "funcional: origem legada de %s, com ou sem .git, migra para AxisGov",
    (nome, canonica, legada) => {
      expect(resolverOrigem(nome, legada)).toBe(canonica);
      expect(resolverOrigem(nome, `${legada}.git`)).toBe(canonica);
      expect(resolverOrigem(nome, undefined, legada)).toBe(canonica);
    },
  );

  it.each(SKILLS_AXISGOV)("funcional: origem customizada permitida de %s permanece", (nome) => {
    expect(resolverOrigem(nome, `https://git.example/${nome}`)).toBe(`https://git.example/${nome}`);
  });

  it("funcional: origem explícita customizada vence a origem gerenciada", () => {
    expect(
      resolverOrigem(
        "sprintx",
        "https://github.com/AxisGov/sprintx",
        "https://git.example/sprintx",
      ),
    ).toBe("https://git.example/sprintx");
  });

  it("funcional: designx aponta para o repositório do designx e é camada", () => {
    // o designx cartografa e audita o design system: modifica o comportamento
    // da sprintx/runx quando o projeto tem UI, não age por conta própria.
    expect(buscarNoCatalogo("designx")?.repositorio).toBe(
      "https://github.com/AxisGov/designx",
    );
    expect(ehCamada("designx")).toBe(true);
  });

  it("funcional: skill fora do catálogo preserva a origem já gravada no lock", () => {
    expect(
      resolverOrigem(
        "skill-antiga",
        "https://github.com/exemplo/skill-antiga",
      ),
    ).toBe("https://github.com/exemplo/skill-antiga");
  });
});

/**
 * Desenvolvimento das skills: apontar o `init` para o clone LOCAL.
 *
 * Sem isto, testar uma alteração de skill num projeto real exigia commitar e
 * publicar a cada tentativa, porque o `init` só sabia clonar do GitHub. O
 * `git clone` aceita caminho de sistema de arquivos como origem, então o
 * override não precisa de nenhum caminho de código novo na busca.
 */
describe("commit certificado de cada skill", () => {
  // A release do expxdev certifica um commit de cada skill, e o init e o update
  // instalam esse commit: um merge na main da skill só chega ao projeto pela
  // próxima release (o katosmv/login recebeu na 0.12.8 o conteúdo da 0.12.9).
  it("integração: as nove têm um SHA-1 completo, em minúsculas e distinto", () => {
    for (const s of CATALOGO) expect(s.certificado, s.nome).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(CATALOGO.map((s) => s.certificado)).size).toBe(9);
  });

  it("integração: as candidatas da bancada são os certificados do catálogo", () => {
    for (const nome of ["sprintx", "mergex"] as const) {
      const certificado = buscarNoCatalogo(nome)?.certificado;
      expect(CANDIDATOS[nome].sha, nome).toBe(certificado);
      const fixture = readFileSync(join(RAIZ_DO_REPO, "fixtures", "candidatos", `${nome}.sha`), "utf8").trim();
      expect(fixture, nome).toBe(certificado);
    }
  });

  it("integração: a tabela pública de proveniência lista exatamente os certificados", () => {
    const doc = readFileSync(join(RAIZ_DO_REPO, "docs", "expx-cli", "base", "10-proveniencia-skills.md"), "utf8");
    const linhas = [...doc.matchAll(/^\| `AxisGov\/([^`]+)` \| `([0-9a-f]{40})` \|$/gm)];
    const tabela = new Map(linhas.map((m) => [`https://github.com/AxisGov/${m[1] ?? ""}`, m[2]]));
    expect(tabela.size).toBe(9);
    for (const s of CATALOGO) expect(tabela.get(s.repositorio), s.nome).toBe(s.certificado);
  });
});

describe("origem local das skills", () => {
  const salvo = process.env["EXPX_SKILLS_LOCAIS"];
  const criados: string[] = [];
  afterEach(() => {
    if (salvo === undefined) delete process.env["EXPX_SKILLS_LOCAIS"];
    else process.env["EXPX_SKILLS_LOCAIS"] = salvo;
    for (const d of criados.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** Raiz de mentira, para o teste não depender das pastas desta máquina. */
  function raizCom(pasta: string): string {
    const raiz = mkdtempSync(join(tmpdir(), "expx-locais-"));
    criados.push(raiz);
    mkdirSync(join(raiz, pasta), { recursive: true });
    return raiz;
  }

  it("funcional: sem a variável, o catálogo aponta para o GitHub", () => {
    delete process.env["EXPX_SKILLS_LOCAIS"];
    expect(buscarNoCatalogo("runx")?.repositorio).toBe("https://github.com/AxisGov/runx");
  });

  it("funcional: com a variável, a skill existente na pasta vem do disco", () => {
    const raiz = raizCom("runx");
    process.env["EXPX_SKILLS_LOCAIS"] = raiz;
    expect(buscarNoCatalogo("runx")?.repositorio).toBe(join(raiz, "runx"));
  });

  it("funcional: acha a pasta pela capitalização real do repositório", () => {
    // os repositórios reais são `RunX`, `MemoX`, `Legadox` — não `runx`
    const raiz = raizCom("RunX");
    process.env["EXPX_SKILLS_LOCAIS"] = raiz;
    expect(buscarNoCatalogo("runx")?.repositorio).toBe(join(raiz, "RunX"));
  });

  it("funcional: skill sem pasta local continua vindo do GitHub", () => {
    const raiz = raizCom("runx");
    process.env["EXPX_SKILLS_LOCAIS"] = raiz;
    // mexendo só na runx: a sprintx não está na raiz local
    expect(buscarNoCatalogo("sprintx")?.repositorio).toBe(
      "https://github.com/AxisGov/sprintx",
    );
  });

  it("funcional: variável vazia é tratada como ausente", () => {
    process.env["EXPX_SKILLS_LOCAIS"] = "   ";
    expect(buscarNoCatalogo("runx")?.repositorio).toBe("https://github.com/AxisGov/runx");
  });
});
