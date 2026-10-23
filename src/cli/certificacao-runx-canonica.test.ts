import { afterAll, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ambienteCom,
  larIsolado,
  novoProduto,
  pathControlado,
  rodarExpx,
  sha256,
  temporarios,
} from "../teste/candidatos.js";

type Json = Record<string, any>;

function json(caminho: string): Json {
  return JSON.parse(readFileSync(caminho, "utf8")) as Json;
}

function hooksDoSettings(s: Json): Array<{ hook: Json }> {
  const saida: Array<{ hook: Json }> = [];
  for (const grupos of Object.values((s["hooks"] ?? {}) as Record<string, any[]>)) {
    for (const grupo of grupos) {
      for (const hook of grupo.hooks ?? []) saida.push({ hook });
    }
  }
  return saida;
}

afterAll(() => {
  temporarios.descartar();
});

describe("P1 — integração com RunX canônica", () => {
  it("integração: init e reinstalação usam AxisGov sem override e certificam Claude/OpenCode", () => {
    const isolado = larIsolado();
    const projeto = novoProduto("expx-integracao-runx-");
    const env = ambienteCom(pathControlado(true), isolado.env);
    const instalar = (): ReturnType<typeof rodarExpx> => rodarExpx(
      ["init", "--skills", "runx", "--harness", "claude,opencode", "--yes"],
      projeto,
      env,
    );

    const primeira = instalar();
    expect(primeira.status, `${primeira.stdout}\n${primeira.stderr}`).toBe(0);

    for (const nome of ["expx-lembrete.sh", "expx-lembrete.mjs", "expx-lembrete-estado.mjs"]) {
      const fonte = join(process.cwd(), "nucleo", "hooks", nome);
      const instalado = join(projeto, ".claude", "hooks", nome);
      const marketplace = join(projeto, ".expx", "marketplace", "plugins", "expx", "nucleo", "hooks", nome);
      expect(sha256(instalado), nome).toBe(sha256(fonte));
      expect(sha256(marketplace), `marketplace/${nome}`).toBe(sha256(fonte));
    }

    const settings = json(join(projeto, ".claude", "settings.json"));
    const lembrete = hooksDoSettings(settings).find((item) =>
      String(item.hook["command"]).includes("expx-lembrete.sh"),
    );
    expect(lembrete?.hook["timeout"]).toBe(1);
    expect(lembrete?.hook).not.toHaveProperty("onFailure");

    const instaladaSkill = join(projeto, ".claude", "skills", "runx");
    const lock = json(join(projeto, ".expx", "expx-lock.json"));
    expect(lock["skills"]["runx"]["repositorio"]).toBe("https://github.com/AxisGov/runx");
    expect(readFileSync(join(instaladaSkill, "SKILL.md"), "utf8")).toContain("usage_limit_reached");
    expect(readFileSync(join(instaladaSkill, "references", "06-estado.md"), "utf8")).toContain("mecanico_triagem");
    expect(readFileSync(join(projeto, ".claude", "agents", "runx-revisor-testes.md"), "utf8")).toContain("model: haiku");
    expect(Buffer.byteLength(readFileSync(join(instaladaSkill, "SKILL.md")))).toBeLessThanOrEqual(8000);
    for (const prefixo of ["00", "01", "02", "03", "04", "05", "06", "07"]) {
      expect(
        readdirSync(join(instaladaSkill, "references")).some((nome) => nome.startsWith(`${prefixo}-`)),
        `reference ${prefixo}`,
      ).toBe(true);
    }
    for (const comando of ["runx.md", "runx-causa.md", "runx-plano.md", "runx-fix.md", "runx-qa.md", "runx-relatar.md"]) {
      expect(existsSync(join(projeto, ".opencode", "commands", comando)), comando).toBe(true);
    }

    appendFileSync(join(instaladaSkill, "SKILL.md"), "\nCOPIA-OBSOLETA\n");
    const segunda = instalar();
    expect(segunda.status, `${segunda.stdout}\n${segunda.stderr}`).toBe(0);
    expect(readFileSync(join(instaladaSkill, "SKILL.md"), "utf8")).not.toContain("COPIA-OBSOLETA");
  }, 600000);
});
