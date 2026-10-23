import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Pacote = {
  devDependencies: Record<string, string>;
};

type Lock = {
  packages: Record<string, { version?: string }>;
};

const pacote = JSON.parse(readFileSync("package.json", "utf8")) as Pacote;
const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as Lock;

function partes(versao: string): number[] {
  return versao.split(".").map((parte) => Number.parseInt(parte, 10));
}

function peloMenos(atual: string, piso: string): boolean {
  const a = partes(atual);
  const p = partes(piso);
  for (let i = 0; i < Math.max(a.length, p.length); i += 1) {
    const diferenca = (a[i] ?? 0) - (p[i] ?? 0);
    if (diferenca !== 0) return diferenca > 0;
  }
  return true;
}

function versoesInstaladas(em: Lock, nome: string): string[] {
  const sufixo = `node_modules/${nome}`;
  return Object.entries(em.packages)
    .filter(([caminho]) => caminho === sufixo || caminho.endsWith(`/${sufixo}`))
    .map(([, instalado]) => instalado.version)
    .filter((versao): versao is string => versao !== undefined);
}

function imagensLinuxConfiguradas(conteudo: string): string[] {
  const documento = parse(conteudo) as {
    jobs?: Record<string, {
      "runs-on"?: unknown;
      strategy?: { matrix?: { os?: unknown } };
    }>;
  };
  const imagens: string[] = [];
  for (const job of Object.values(documento.jobs ?? {})) {
    const runsOn = job["runs-on"];
    if (typeof runsOn === "string" && runsOn.startsWith("ubuntu-")) imagens.push(runsOn);
    const sistemas = job.strategy?.matrix?.os;
    if (!Array.isArray(sistemas)) continue;
    for (const sistema of sistemas) {
      if (typeof sistema === "string" && sistema.startsWith("ubuntu-")) imagens.push(sistema);
    }
  }
  return imagens;
}

describe("pisos corrigidos das dependências auditadas", () => {
  const pisos = [
    ["vite", "8.2.4"],
    ["vitest", "4.1.12"],
    ["@vitest/mocker", "4.1.12"],
    ["source-map-js", "1.2.2"],
  ] as const;

  it.each(pisos)("%s fica fora das faixas vulneráveis", (nome, piso) => {
    const instaladas = versoesInstaladas(lock, nome);
    expect(instaladas.length, `${nome} precisa constar no lockfile`).toBeGreaterThan(0);
    for (const instalada of instaladas) {
      expect(peloMenos(instalada, piso), `${nome}@${instalada} < ${piso}`).toBe(true);
    }
  });

  it("varre também cópias aninhadas no lockfile", () => {
    const artificial = {
      packages: {
        "node_modules/vite": { version: "8.3.5" },
        "node_modules/ferramenta/node_modules/vite": { version: "8.2.3" },
      },
    } satisfies Lock;
    const vulneraveis = versoesInstaladas(artificial, "vite").filter((versao) => !peloMenos(versao, "8.2.4"));
    expect(vulneraveis).toEqual(["8.2.3"]);
  });

  it("os intervalos diretos também começam nas versões corrigidas", () => {
    expect(pacote.devDependencies["vite"]).toBe("^8.3.5");
    expect(pacote.devDependencies["vitest"]).toBe("^4.1.12");
  });
});

describe("Actions oficiais sem runtime Node.js 20", () => {
  const arquivos = [
    ".github/workflows/ci.yml",
    ".github/workflows/pages.yml",
    ".github/workflows/proveniencia.yml",
    ".github/workflows/release.yml",
  ];
  const pisos: Record<string, number> = {
    checkout: 7,
    "setup-node": 7,
    "upload-artifact": 7,
    "download-artifact": 8,
    "configure-pages": 6,
    "upload-pages-artifact": 5,
    "deploy-pages": 5,
  };

  it.each(arquivos)("%s usa majors baseados em Node.js 24", (arquivo) => {
    const yaml = readFileSync(arquivo, "utf8");
    expect(yaml, arquivo + " nao pode depender do rotulo movel ubuntu-latest").not.toContain("ubuntu-latest");
    const imagensLinux = imagensLinuxConfiguradas(yaml);
    expect(imagensLinux.length, arquivo + " precisa declarar ao menos um runner Linux").toBeGreaterThan(0);
    expect(
      [...new Set(imagensLinux)],
      arquivo + " precisa executar somente na imagem Linux homologada",
    ).toEqual(["ubuntu-24.04"]);
    const referencias = [...yaml.matchAll(/uses:\s+actions\/([a-z-]+)@v(\d+)/g)];
    expect(referencias.length, `${arquivo} não contém Action oficial`).toBeGreaterThan(0);
    for (const referencia of referencias) {
      const nome = referencia[1] as string;
      const major = Number(referencia[2]);
      const piso = pisos[nome];
      expect(piso, `declare o piso seguro de actions/${nome}`).toBeDefined();
      expect(major, `actions/${nome}@v${String(major)} ainda usa runtime obsoleto`).toBeGreaterThanOrEqual(
        piso as number,
      );
    }
  });
});
