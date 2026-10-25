import { describe, expect, it } from "vitest";
import { classeDoModeloClaude, niveisDeEsforcoClaude, validarAlternativa as validarComCampo } from "./adaptadores.js";
import { validarPolitica } from "./politica.js";
import { TABELA_EMBUTIDA } from "./tabela.js";
import { ADAPTADORES, CLASSES } from "./tipos.js";

/** CONTRATO-expx-orquestracao §4.2 (validação por adaptador), §5 (tabela) e §6 (matriz). */

/** O motivo, para os casos que só conferem o texto; o campo tem teste próprio. */
const validarAlternativa = (...args: Parameters<typeof validarComCampo>) => validarComCampo(...args)?.motivo ?? null;

describe("classeDoModeloClaude — a família contida no nome", () => {
  it.each([
    ["haiku", "mecanico_triagem"],
    ["sonnet", "raciocinio_normal"],
    ["opus", "profundo_excepcional"],
    ["claude-opus-5-5", "profundo_excepcional"],
    ["claude-haiku-4-5-20251001", "mecanico_triagem"],
    ["claude-3-5-sonnet-20241022", "raciocinio_normal"],
  ] as const)("%s → %s", (model, classe) => {
    expect(classeDoModeloClaude(model)).toBe(classe);
  });

  it.each(["inherit", "fable", "claude-fable-5-1", "claude-desconhecido-9", "gpt-5", "claude-opus-sonnet-1", "opusplan", ""])(
    "%s não se classifica",
    (model) => {
      expect(classeDoModeloClaude(model)).toBeNull();
    },
  );
});

describe("niveisDeEsforcoClaude — matriz v1", () => {
  const TODOS = ["low", "medium", "high", "xhigh", "max"];

  it("modelos 5.x, Opus 4.8 e 4.7 têm os cinco níveis, com ou sem sufixo de data", () => {
    for (const m of ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1", "claude-opus-5-5-20260101"]) {
      expect(niveisDeEsforcoClaude(m), m).toEqual(TODOS);
    }
  });

  it("Opus 4.6 e Sonnet 4.6 não têm xhigh", () => {
    expect(niveisDeEsforcoClaude("claude-opus-4-6")).toEqual(["low", "medium", "high", "max"]);
    expect(niveisDeEsforcoClaude("claude-sonnet-4-6")).toEqual(["low", "medium", "high", "max"]);
  });

  it("modelo fora da matriz não aceita esforço", () => {
    expect(niveisDeEsforcoClaude("claude-haiku-4-5")).toEqual([]);
    expect(niveisDeEsforcoClaude("claude-sonnet-4-5-20250929")).toEqual([]);
  });

  it("alias é validado como na API da Anthropic (suposição declarada no contrato)", () => {
    expect(niveisDeEsforcoClaude("haiku")).toEqual(TODOS);
    expect(niveisDeEsforcoClaude("opus")).toEqual(TODOS);
  });
});

describe("validarAlternativa — claude", () => {
  const alt = (model: string, effort?: string) => (effort === undefined ? { id: "x", model } : { id: "x", model, effort });

  it("aceita modelo da classe ou acima dela", () => {
    expect(validarAlternativa("claude", "raciocinio_normal", alt("sonnet", "high"))).toBeNull();
    expect(validarAlternativa("claude", "raciocinio_normal", alt("opus", "medium"))).toBeNull();
    expect(validarAlternativa("claude", "mecanico_triagem", alt("claude-haiku-4-5"))).toBeNull();
  });

  it("diz qual campo reprovou", () => {
    expect(validarComCampo("claude", "profundo_excepcional", alt("haiku"))?.campo).toBe("model");
    expect(validarComCampo("claude", "profundo_excepcional", alt("claude-opus-4-6", "xhigh"))?.campo).toBe("effort");
    expect(validarComCampo("claude", "mecanico_triagem", alt("claude-haiku-4-5", "low"))?.campo).toBe("effort");
    expect(validarComCampo("codex", "raciocinio_normal", { id: "x", model: "Gpt 6" })?.campo).toBe("model");
  });

  it("recusa modelo abaixo da classe", () => {
    expect(validarAlternativa("claude", "profundo_excepcional", alt("haiku", "low"))).toMatch(/não satisfaz/);
  });

  it("recusa inherit, modelo sem classe e sintaxe fora do adaptador", () => {
    expect(validarAlternativa("claude", "raciocinio_normal", alt("inherit"))).toMatch(/inherit/);
    expect(validarAlternativa("claude", "raciocinio_normal", alt("claude-fable-5-1", "high"))).toMatch(/sem classe/);
    expect(validarAlternativa("claude", "raciocinio_normal", alt("openai/gpt-5.4"))).toMatch(/model/);
  });

  it("recusa esforço que o modelo não suporta, em vez de deixar o Claude rebaixar", () => {
    expect(validarAlternativa("claude", "profundo_excepcional", alt("claude-opus-4-6", "xhigh"))).toMatch(/xhigh/);
    expect(validarAlternativa("claude", "mecanico_triagem", alt("claude-haiku-4-5", "low"))).toMatch(/não aceita esforço/);
    expect(validarAlternativa("claude", "raciocinio_normal", alt("sonnet", "turbo"))).toMatch(/turbo/);
  });
});

describe("validarAlternativa — opencode e codex (só forma)", () => {
  it("opencode exige provedor/modelo", () => {
    expect(validarAlternativa("opencode", "raciocinio_normal", { id: "x", model: "openai/gpt-5.4", effort: "high" })).toBeNull();
    expect(validarAlternativa("opencode", "raciocinio_normal", { id: "x", model: "gpt-5.4" })).toMatch(/provedor/);
  });

  it("codex exige slug", () => {
    expect(validarAlternativa("codex", "raciocinio_normal", { id: "x", model: "gpt-6.1-sol", effort: "xhigh" })).toBeNull();
    expect(validarAlternativa("codex", "raciocinio_normal", { id: "x", model: "Gpt 6" })).toMatch(/slug/);
  });

  it("effort só como forma, sem inventar níveis válidos", () => {
    expect(validarAlternativa("codex", "raciocinio_normal", { id: "x", model: "gpt-6", effort: "HIGH" })).toMatch(/effort/);
    expect(validarAlternativa("opencode", "raciocinio_normal", { id: "x", model: "a/b", effort: "qualquer" })).toBeNull();
  });
});

describe("tabela embutida v1", () => {
  it("só o claude tem entradas, e cada uma satisfaz a própria classe", () => {
    for (const c of CLASSES) {
      const cadeia = TABELA_EMBUTIDA.claude[c];
      expect(cadeia?.length, c).toBeGreaterThan(0);
      for (const alt of cadeia ?? []) {
        expect(alt.id.startsWith("embutida-"), alt.id).toBe(true);
        expect(validarAlternativa("claude", c, alt), alt.id).toBeNull();
      }
    }
    for (const a of ADAPTADORES.filter((x) => x !== "claude")) expect(TABELA_EMBUTIDA[a]).toEqual({});
  });
});

describe("validarPolitica — validação por adaptador, com o caminho", () => {
  it("aponta a alternativa que não satisfaz a classe", () => {
    const r = validarPolitica({
      expx_orquestracao: 1,
      adaptadores: { claude: { classes: { profundo_excepcional: [{ id: "barato", model: "haiku", effort: "low" }] } } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("adaptadores.claude.classes.profundo_excepcional[0]");
  });

  it("o caminho chega ao campo, e a mensagem é exatamente a do contrato", () => {
    const r = validarPolitica({
      expx_orquestracao: 1,
      adaptadores: {
        claude: {
          classes: {
            profundo_excepcional: [
              { id: "o46", model: "claude-opus-4-6", effort: "xhigh" },
              { id: "barato", model: "haiku" },
            ],
          },
        },
      },
    });
    expect(r).toEqual({
      ok: false,
      erro:
        ".expx/orquestracao.json inválido:\n" +
        '  adaptadores.claude.classes.profundo_excepcional[0].effort: effort "xhigh" não é suportado por "claude-opus-4-6" (aceitos: low, medium, high, max)\n' +
        '  adaptadores.claude.classes.profundo_excepcional[1].model: model "haiku" (mecanico_triagem) não satisfaz a classe profundo_excepcional',
    });
  });

  it("aponta o effort fora da matriz", () => {
    const r = validarPolitica({
      expx_orquestracao: 1,
      adaptadores: { claude: { classes: { profundo_excepcional: [{ id: "o46", model: "claude-opus-4-6", effort: "xhigh" }] } } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("xhigh");
  });
});
