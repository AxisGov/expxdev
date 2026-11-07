import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CATALOGO } from "../nucleo/catalogo.js";
import { planejarAgentes } from "../harness/agentes.js";
import { projetarPapeis } from "../orquestracao/papeis.js";
import { validarPolitica } from "../orquestracao/politica.js";
import { APROVACAO } from "../orquestracao/tipos.js";
import type { SkillMontavel } from "../plugin/montagem.js";
import { RAIZ_DO_REPO } from "../teste/candidatos.js";

/**
 * As nove skills certificadas, com a política de orquestração ativa.
 *
 * Na 0.13.0, `expx init` com a política e designx, legadox ou stackx dava rc 1:
 * cinco agentes sem `classe:` e com `model: inherit` ou sem `model` davam
 * `sem_classe` (relato do Conselhos). A prova da release só tinha runx e mergex.
 * Aqui entram os agentes de cada commit certificado, extraídos por
 * `scripts/fixture-agentes-certificados.sh`, e o mesmo `planejarAgentes` do init.
 * A instalação inteira das nove fica na prova de release: os snapshots completos
 * passariam do limite L3 de um PR.
 */

const BASE = join(RAIZ_DO_REPO, "fixtures", "agentes-certificados");

function agentesDa(nome: string): string[] {
  const pasta = join(BASE, nome);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => join(pasta, n));
}

const montaveis = (): SkillMontavel[] =>
  CATALOGO.map((s) => ({ nome: s.nome, raizSkill: join(BASE, s.nome), comandos: [], agentes: agentesDa(s.nome) }));

describe("certificação da orquestração: as nove skills certificadas", () => {
  it("o snapshot de cada skill é do commit que o catálogo certifica", () => {
    for (const s of CATALOGO) {
      const sha = join(BASE, `${s.nome}.sha`);
      expect(existsSync(sha), `rode scripts/fixture-agentes-certificados.sh para ${s.nome}`).toBe(true);
      expect(readFileSync(sha, "utf8").trim(), `${s.nome}: o pin mudou, extraia os agentes de novo`).toBe(s.certificado);
    }
  });

  // Revisão do CodeAnt no expxdev#130: o pin sozinho não prova o conteúdo. O blob
  // de cada agente fica no manifesto, e arquivo editado, a mais ou faltando falha.
  it("cada agente do snapshot é o blob que o manifesto registra, sem arquivo a mais nem faltando", () => {
    const blob = (c: Buffer): string => createHash("sha1").update(`blob ${String(c.length)}\0`).update(c).digest("hex");
    for (const s of CATALOGO) {
      const manifesto = join(BASE, `${s.nome}.MANIFESTO`);
      expect(existsSync(manifesto), `rode scripts/fixture-agentes-certificados.sh para ${s.nome}`).toBe(true);
      const registrado = readFileSync(manifesto, "utf8").split("\n").filter((l) => l !== "").sort();
      const presente = agentesDa(s.nome).map((a) => `${blob(readFileSync(a))}  ${basename(a)}`).sort();
      expect(presente, s.nome).toEqual(registrado);
    }
  });

  it("com a política mínima, todo agente resolve, sem erro e sem nome repetido", () => {
    const politica = validarPolitica({ expx_orquestracao: 1 });
    if (!politica.ok) throw new Error(politica.erro);
    const plano = planejarAgentes(montaveis(), {}, politica.politica);
    expect(plano.erros).toEqual([]);
    const total = CATALOGO.reduce((n, s) => n + agentesDa(s.nome).length, 0);
    expect(total).toBeGreaterThan(0);
    expect(plano.resolucoes).toHaveLength(total);
  });

  it("todo agente certificado declara a classe, em vez de deixá-la ao model", () => {
    const sem: string[] = [];
    for (const s of CATALOGO) {
      for (const a of agentesDa(s.nome)) {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(a, "utf8"))?.[1] ?? "";
        if (!/^classe:\s*\S/m.test(fm)) sem.push(`${s.nome}/${basename(a)}`);
      }
    }
    expect(sem).toEqual([]);
  });

  // F4: o papel decide a integridade final e o primeiro plano, com ou sem política.
  it("todo agente certificado declara o papel, e a projeção traz os seis de aprovação com a skill de cada um", () => {
    const plano = planejarAgentes(montaveis(), {});
    expect(plano.erros).toEqual([]);
    const total = CATALOGO.reduce((n, s) => n + agentesDa(s.nome).length, 0);
    expect(plano.papeis).toHaveLength(total);
    const projecao = projetarPapeis(plano.papeis);
    expect(projecao).toMatchObject({ ok: true, avisos: [] });
    const aprovacao = plano.papeis.filter((p) => APROVACAO.includes(p.papel)).map((p) => `${p.agente}\t${p.skill}\t${p.papel}`).sort();
    expect(aprovacao).toEqual([
      "auditor-design\tdesignx\trevisar",
      "auditor-plano\tsprintx\trevisar",
      "qa\trunx\ttestar",
      "revisor-diff\tmergex\trevisar",
      "runx-revisor-testes\trunx\ttestar",
      "sprintx-revisor-testes\tsprintx\ttestar",
    ]);
  });
});
