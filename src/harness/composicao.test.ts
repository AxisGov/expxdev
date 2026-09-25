import { describe, it, expect } from "vitest";
import { comporSettings, type EntradaHook } from "./composicao.js";
import { comporModos } from "./modos.js";

const cmd = '"$CLAUDE_PROJECT_DIR"/.claude/hooks/alfa/h.sh';
const entrada = (timeout: number): EntradaHook => ({
  skill: "alfa",
  evento: "PreToolUse",
  matcher: "Bash",
  hook: { type: "command", command: cmd, timeout },
});

describe("recomposição pelo lock anterior", () => {
  it("funcional: nova versão da skill muda o timeout — a entrada antiga gerenciada sai, sem conflito nem duplicata", () => {
    const v1 = comporSettings({}, [entrada(10)]);
    if (!v1.ok) throw new Error(v1.erro);
    const v2 = comporSettings(v1.conteudo, [entrada(30)], v1.gerenciadas);
    if (!v2.ok) throw new Error(v2.erro);
    const texto = JSON.stringify(v2.conteudo);
    expect(texto.split("alfa/h.sh").length - 1).toBe(1);
    expect(texto).toContain('"timeout":30');
  });

  it("funcional: sem o lock, a mesma mudança é conflito com o que está no arquivo", () => {
    const v1 = comporSettings({}, [entrada(10)]);
    if (!v1.ok) throw new Error(v1.erro);
    expect(comporSettings(v1.conteudo, [entrada(30)]).ok).toBe(false);
  });

  it("funcional: recompor com as mesmas entradas devolve o mesmo conteúdo", () => {
    const v1 = comporSettings({ outro: 1 }, [entrada(10)]);
    if (!v1.ok) throw new Error(v1.erro);
    const v2 = comporSettings(v1.conteudo, [entrada(10)], v1.gerenciadas);
    if (!v2.ok) throw new Error(v2.erro);
    expect(JSON.stringify(v2.conteudo)).toBe(JSON.stringify(v1.conteudo));
  });
});

describe("modo em .expx/hooks.json", () => {
  it("funcional: modo igual ao padrão anterior segue a promoção da skill; modo escolhido pela pessoa fica", () => {
    const anteriores = { a: { modo: "aviso" }, b: { modo: "aviso" } };
    const existente = { hooks: { a: { modo: "aviso" }, b: { modo: "desligado" } } };
    const r = comporModos({ a: { modo: "bloqueio" }, b: { modo: "bloqueio" } }, existente, anteriores);
    if (!r.ok) throw new Error(r.erro);
    expect(r.conteudo["hooks"]).toEqual({ a: { modo: "bloqueio" }, b: { modo: "desligado" } });
  });

  it("funcional: id que o ExpxDev gerenciava e cuja skill saiu é removido; id da pessoa fica", () => {
    const r = comporModos({}, { hooks: { velho: { modo: "aviso" }, meu: { modo: "aviso" } } }, { velho: { modo: "aviso" } });
    if (!r.ok) throw new Error(r.erro);
    expect(r.conteudo["hooks"]).toEqual({ meu: { modo: "aviso" } });
  });
});
