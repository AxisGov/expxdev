import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { artefatosDeHooks, ehSuiteDeTesteDeHook } from "./hooks.js";
import { planejarPlugin, type SkillMontavel } from "../plugin/montagem.js";
import { planejarLimpeza } from "./agentes.js";
import { suportaNomeComCaractereReservado, suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";

/**
 * A suíte de teste dos hooks de uma skill (`teste.sh` e `testes/`) carrega
 * amostras de segredo de propósito. Instalada no projeto, ela ia para o commit
 * dele, e o pre-push da MergeX (DM-279) barrava o push — na 0.12.5, junto com os
 * exemplos do texto da MergeX (relato do katosmv/login). Ela fica no repositório
 * da skill: não vai para `.claude/hooks` nem para o plugin, e o `update` tira do
 * projeto a cópia que uma instalação anterior deixou.
 */
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

function temporario(prefixo: string): string {
  const d = mkdtempSync(join(tmpdir(), prefixo));
  criados.push(d);
  return d;
}

function escreve(raiz: string, rel: string, conteudo: string): void {
  mkdirSync(join(raiz, ...rel.split("/").slice(0, -1)), { recursive: true });
  writeFileSync(join(raiz, ...rel.split("/")), conteudo);
}

/** Uma skill com a árvore de hooks real: hooks, README e a suíte. */
function skillComSuite(): SkillMontavel {
  const repo = temporario("expx-suite-");
  escreve(repo, ".claude/skills/mergex/SKILL.md", "---\nname: mergex\n---\n");
  for (const rel of ["comum/sem-segredo.sh", "mergex/git-perigoso.sh", "README.md", "teste.sh", "testes/bancada.sh", "comum/teste.sh"]) {
    escreve(repo, `.claude/hooks/${rel}`, `# ${rel}\n`);
  }
  return {
    nome: "mergex",
    raizSkill: join(repo, ".claude", "skills", "mergex"),
    comandos: [],
    arvoreHooks: join(repo, ".claude", "hooks"),
  };
}

const sha = (s: string): string => createHash("sha256").update(s).digest("hex");

describe("a suíte de teste dos hooks não é instalada", () => {
  it("unitário: só o teste.sh do topo e o que está sob testes/ são a suíte", () => {
    expect(ehSuiteDeTesteDeHook("teste.sh")).toBe(true);
    expect(ehSuiteDeTesteDeHook("testes/bancada.sh")).toBe(true);
    expect(ehSuiteDeTesteDeHook("comum/teste.sh")).toBe(false);
    expect(ehSuiteDeTesteDeHook("testes.sh")).toBe(false);
    expect(ehSuiteDeTesteDeHook("comum/sem-segredo.sh")).toBe(false);
  });

  it("integração: a cópia para .claude/hooks leva os hooks e o README, sem a suíte", () => {
    const destinos = artefatosDeHooks([skillComSuite()]).map((a) => a.destino);
    expect(destinos).toContain(".claude/hooks/comum/sem-segredo.sh");
    expect(destinos).toContain(".claude/hooks/mergex/git-perigoso.sh");
    expect(destinos).toContain(".claude/hooks/README.md");
    expect(destinos).toContain(".claude/hooks/comum/teste.sh");
    expect(destinos).not.toContain(".claude/hooks/teste.sh");
    expect(destinos.filter((d) => d.startsWith(".claude/hooks/testes/"))).toEqual([]);
  });

  it("integração: o plugin leva os hooks e o README, sem a suíte", () => {
    const plano = planejarPlugin([skillComSuite()]);
    if (!plano.ok) throw new Error(`plano do plugin falhou: ${plano.erro}`);
    const destinos = plano.artefatos.map((a) => a.destino);
    expect(destinos).toContain("hooks/comum/sem-segredo.sh");
    expect(destinos).toContain("hooks/README.md");
    expect(destinos).not.toContain("hooks/teste.sh");
    expect(destinos.filter((d) => d.startsWith("hooks/testes/"))).toEqual([]);
  });
});

describe("o update tira do projeto o que saiu da instalação", () => {
  it("funcional: arquivo de .claude/ que saiu do plano é removido se está como o lock o gravou; alterado, fica com aviso", () => {
    const raiz = temporario("expx-limpeza-");
    escreve(raiz, ".claude/hooks/teste.sh", "suite\n");
    escreve(raiz, ".claude/hooks/testes/bancada.sh", "bancada\n");
    escreve(raiz, ".claude/skills/mergex/antigo.md", "editado a mao\n");
    escreve(raiz, ".claude/hooks/comum/sem-segredo.sh", "hook\n");
    const anteriores = {
      ".claude/hooks/teste.sh": sha("suite\n"),
      ".claude/hooks/testes/bancada.sh": sha("bancada\n"),
      ".claude/skills/mergex/antigo.md": sha("como o lock gravou\n"),
      ".claude/hooks/comum/sem-segredo.sh": sha("hook\n"),
      ".claude/hooks/sumiu.sh": sha("ja nao existe\n"),
      ".expx/marketplace/plugins/expx/hooks/teste.sh": sha("suite\n"),
    };
    const lim = planejarLimpeza(raiz, [], new Set([".claude/hooks/comum/sem-segredo.sh"]), anteriores);
    expect(lim.erros).toEqual([]);
    expect([...lim.remover].sort()).toEqual([".claude/hooks/teste.sh", ".claude/hooks/testes/bancada.sh"]);
    expect(lim.avisos.join("\n")).toContain(".claude/skills/mergex/antigo.md");
  });

  it("funcional: caminho do lock com `.`, `..` ou vazio nunca é removido, mesmo com o hash certo", () => {
    const raiz = temporario("expx-limpeza-");
    escreve(raiz, "fora.txt", "do projeto\n");
    escreve(raiz, ".claude/x/dentro.txt", "do projeto\n");
    const anteriores = {
      ".claude/../fora.txt": sha("do projeto\n"),
      ".claude/./x/dentro.txt": sha("do projeto\n"),
      ".claude//x/dentro.txt": sha("do projeto\n"),
    };
    const lim = planejarLimpeza(raiz, [], new Set(), anteriores);
    expect(lim.remover).toEqual([]);
  });

  it("funcional: segmento com `\\` nunca é removido — no Windows o `join` o lê como separador", () => {
    const raiz = temporario("expx-limpeza-");
    // no Windows resolve para `<raiz>/fora.txt`; no Linux é um nome literal dentro de `.claude/`
    const rel = ".claude/x\\..\\..\\fora.txt";
    escreve(raiz, rel, "do projeto\n");
    expect(planejarLimpeza(raiz, [], new Set(), { [rel]: sha("do projeto\n") }).remover).toEqual([]);
  });

  it.skipIf(!suportaNomeComCaractereReservado())("funcional: segmento com `:` nunca é removido — letra de unidade e fluxo alternativo no Windows", () => {
    const raiz = temporario("expx-limpeza-");
    const rel = ".claude/hooks/C:fora.txt";
    escreve(raiz, rel, "do projeto\n");
    expect(planejarLimpeza(raiz, [], new Set(), { [rel]: sha("do projeto\n") }).remover).toEqual([]);
  });

  it("funcional: segmento com ponto ou espaço no fim nunca é removido — no Windows `.. ` vira `..`", () => {
    const raiz = temporario("expx-limpeza-");
    // no Windows `.. ` e `x.` são normalizados; no Linux são nomes literais dentro de `.claude/`
    const anteriores = {
      ".claude/.. /fora.txt": sha("do projeto\n"),
      ".claude/hooks/velho.sh.": sha("do projeto\n"),
      ".claude/hooks/velho.sh ": sha("do projeto\n"),
    };
    for (const rel of Object.keys(anteriores)) escreve(raiz, rel, "do projeto\n");
    expect(planejarLimpeza(raiz, [], new Set(), anteriores).remover).toEqual([]);
  });

  it.skipIf(!suportaNomeComCaractereReservado())("funcional: nome de dispositivo do Windows nunca é removido", () => {
    const raiz = temporario("expx-limpeza-");
    const anteriores = { ".claude/hooks/nul.txt": sha("x\n"), ".claude/hooks/COM1": sha("x\n") };
    for (const rel of Object.keys(anteriores)) escreve(raiz, rel, "x\n");
    expect(planejarLimpeza(raiz, [], new Set(), anteriores).remover).toEqual([]);
  });

  it("funcional: nome com parênteses, colchetes e espaço no meio continua sendo removido", () => {
    const raiz = temporario("expx-limpeza-");
    const anteriores = {
      ".claude/skills/buildx/template/src/app/(sistema)/page.tsx": sha("x\n"),
      ".claude/skills/buildx/template/src/app/[id]/meu arquivo.tsx": sha("x\n"),
      ".claude/skills/buildx/.gitkeep": sha("x\n"),
    };
    for (const rel of Object.keys(anteriores)) escreve(raiz, rel, "x\n");
    expect([...planejarLimpeza(raiz, [], new Set(), anteriores).remover].sort()).toEqual(Object.keys(anteriores).sort());
  });

  it.skipIf(!suportaSymlinkDeDiretorio())("funcional: caminho do lock que passa por link simbólico nunca é removido, mesmo com o hash certo", () => {
    const raiz = temporario("expx-limpeza-");
    const fora = temporario("expx-fora-");
    escreve(fora, "alvo.txt", "de fora\n");
    escreve(raiz, ".claude/real/arquivo.txt", "de fora\n");
    escreve(raiz, ".claude/hooks/velho.sh", "velho\n");
    symlinkSync(fora, join(raiz, ".claude", "pasta-link"), "dir");
    symlinkSync(join(fora, "alvo.txt"), join(raiz, ".claude", "real", "arquivo-link.txt"));
    const anteriores = {
      ".claude/pasta-link/alvo.txt": sha("de fora\n"),
      ".claude/real/arquivo-link.txt": sha("de fora\n"),
      ".claude/hooks/velho.sh": sha("velho\n"),
    };
    const lim = planejarLimpeza(raiz, [], new Set(), anteriores);
    expect(lim.remover).toEqual([".claude/hooks/velho.sh"]);

    // o próprio `.claude/` como link: nada dele é removido
    const raiz2 = temporario("expx-limpeza-");
    symlinkSync(join(raiz, ".claude"), join(raiz2, ".claude"), "dir");
    expect(planejarLimpeza(raiz2, [], new Set(), { ".claude/hooks/velho.sh": sha("velho\n") }).remover).toEqual([]);
  });
});
