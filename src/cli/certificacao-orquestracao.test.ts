import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOGO } from "../nucleo/catalogo.js";
import { planejarAgentes } from "../harness/agentes.js";
import { validarPolitica } from "../orquestracao/politica.js";
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
        if (!/^classe:\s*\S/m.test(fm)) sem.push(`${s.nome}/${a.slice(a.lastIndexOf("/") + 1)}`);
      }
    }
    expect(sem).toEqual([]);
  });
});
