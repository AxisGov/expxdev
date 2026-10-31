import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { executarExpx } from "./expx.js";
import {
  projetoTemporario,
  type ProjetoTemporario,
} from "../teste/projeto-temporario.js";

type Pacote = {
  name: string;
  bin: Record<string, string>;
  files: string[];
  version: string;
  homepage: string;
  repository: { type: string; url: string };
  bugs: { url: string };
};

let p: ProjetoTemporario | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  p?.descartar();
  p = undefined;
});

function pacote(): Pacote {
  return JSON.parse(readFileSync("package.json", "utf8")) as Pacote;
}

describe("pacote publicável", () => {
  it("integração: o pacote declara expxdev com os dois binários", () => {
    const p = pacote();
    expect(p.name).toBe("expxdev");
    expect(p.bin["expx"]).toBe("dist/cli/expx-bin.js");
    expect(p.bin["expx-painel"]).toBe("dist/cli/principal.js");
    expect(p.files).toContain("dist");
    expect(p.files).toContain("ui/dist");
    expect(p.files).toContain("CHANGELOG.md");
  });

  it("integração: package e lock declaram 0.12.12", () => {
    const p = pacote();
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect(p.version).toBe("0.12.12");
    expect(lock.version).toBe(p.version);
    expect(lock.packages[""]?.version).toBe(p.version);
  });

  it("integração: metadados públicos apontam para o repositório canônico AxisGov", () => {
    const p = pacote();
    expect(p.homepage).toBe("https://github.com/AxisGov/expxdev#readme");
    expect(p.repository.url).toBe("git+https://github.com/AxisGov/expxdev.git");
    expect(p.bugs.url).toBe("https://github.com/AxisGov/expxdev/issues");
    const readme = readFileSync("README.md", "utf8");
    expect(readme).not.toContain("bittencourtthulio.github.io/expxdev");
    expect(readme).not.toContain("www.npmjs.com/package/expxdev");
  });

  it("integração: catálogo compilado contém as quatro origens canônicas AxisGov", () => {
    const compilado = readFileSync("dist/nucleo/catalogo.js", "utf8");
    for (const nome of ["runx", "mergex", "sprintx", "buildx"]) {
      expect(compilado).toContain(`https://github.com/AxisGov/${nome}`);
    }
  });

  it("funcional: expx --ajuda lista os seis subcomandos e devolve 0", async () => {
    const linhas: string[] = [];
    const codigo = await executarExpx(["--ajuda"], {
      escrever: (s) => linhas.push(s),
    });
    expect(codigo).toBe(0);
    for (const s of ["init", "panel", "add", "remove", "update", "doctor"]) {
      expect(linhas.join(""), `falta ${s}`).toContain(`expx ${s}`);
    }
  });

  it("funcional: todo subcomando declarado tem executor ligado", async () => {
    p = projetoTemporario();
    vi.spyOn(process, "cwd").mockReturnValue(p.raiz);

    for (const s of ["add", "remove", "update", "doctor"]) {
      const erros: string[] = [];
      await executarExpx([s], {
        escrever: () => {},
        escreverErro: (t) => erros.push(t),
      });
      expect(erros.join(""), `${s} sem executor`).not.toContain(
        "ainda nao esta disponivel",
      );
    }
  });
});
