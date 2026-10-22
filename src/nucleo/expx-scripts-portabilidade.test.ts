import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error scripts Node ficam fora de src e expõem helpers de teste determinísticos.
import { ambienteSemNode, BASH as BASH_BENCHMARK } from "../../scripts/benchmark-expx-lembrete.mjs";
// @ts-expect-error scripts Node ficam fora de src e expõem helpers de teste determinísticos.
import {
  ambienteFallback,
  BASH as BASH_DIAGNOSTICO,
  estadoLeituraDiagnostico,
  estadoEscritaDiagnostico,
} from "../../scripts/diagnosticar-expx-lembrete.mjs";
// @ts-expect-error módulo ESM distribuído ao lado do wrapper.
import { gravarEstadoAtomico, lerEstado } from "../../nucleo/hooks/expx-lembrete-estado.mjs";

const temporarios: string[] = [];

function pasta(prefixo: string): string {
  const caminho = mkdtempSync(join(tmpdir(), prefixo));
  temporarios.push(caminho);
  return caminho;
}

afterEach(() => {
  for (const caminho of temporarios.splice(0)) rmSync(caminho, { recursive: true, force: true });
});

function provarFallback(bash: string, env: NodeJS.ProcessEnv): void {
  expect(spawnSync(bash, ["-lc", ":"], { env }).status).toBe(0);
  expect(spawnSync(bash, ["-lc", "command -v node"], { env }).status).not.toBe(0);
}

describe("scripts de benchmark e diagnostico do lembrete", () => {
  it("mantem o launcher Bash executavel e torna Node indisponivel no benchmark", () => {
    provarFallback(BASH_BENCHMARK, ambienteSemNode(pasta("expx-benchmark-sem-node-teste-")));
  });

  it("mantem o launcher Bash executavel e torna Node indisponivel no diagnostico", () => {
    provarFallback(BASH_DIAGNOSTICO, ambienteFallback(pasta("expx-diag-sem-node-teste-")));
  });

  it("usa o schema real nas medicoes de leitura e escrita do estado", () => {
    const raizLeitura = pasta("expx-diag-leitura-teste-");
    gravarEstadoAtomico(raizLeitura, estadoLeituraDiagnostico(1_000));
    const leitura = lerEstado(raizLeitura);
    expect.soft(leitura.corrompido).toBe(false);
    expect.soft(leitura.normalizado).toBe(false);
    expect.soft(leitura.estado.eventos).toHaveLength(0);
    expect.soft(leitura.estado.trabalhos).toHaveLength(0);

    const escrita = estadoEscritaDiagnostico(3, 2_000);
    expect(escrita).toMatchObject({ versao: 1 });
    expect(escrita.eventos).toHaveLength(1);
    expect(escrita.trabalhos).toHaveLength(0);
  });
});
