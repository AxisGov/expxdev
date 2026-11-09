import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { lerFrontmatter } from "../parser/leitura/frontmatter.js";
import { lerPolitica } from "../orquestracao/politica.js";
import { TABELA_EMBUTIDA } from "../orquestracao/tabela.js";
import { CLASSES, type Alternativa, type Classe } from "../orquestracao/tipos.js";

/**
 * `expx sessao <trabalho>` (CONTRATO-expx-orquestracao §14, escopo (a) da política da
 * sessão principal). O Claude Code não troca o modelo de uma sessão que já roda; então a
 * classe do trabalho, declarada por quem chamou a skill, vira o comando de ABERTURA:
 * `cd '<worktree>' && claude --model <m> [--effort <e>]`.
 *
 * Puro: não grava nada e não chama o `claude`. O trabalho é procurado em todas as worktrees
 * do repositório (a atual primeiro), no 00-OCORRENCIA.md da runx e no 00-PLANEJAMENTO.md da
 * sprintx, pelo `trabalho_id`. A cadeia é a do projeto para a classe, quando a política
 * está ativa e a traz; senão a embutida (o algoritmo do §7). Vale a primeira alternativa.
 */
export type Sugestao = { ok: true; linha: string; avisos: string[] } | { ok: false; erro: string };

const ARTEFATOS = [
  { pasta: ["docs", "manutencao"], arquivo: "00-OCORRENCIA.md" },
  { pasta: ["docs", "sprintx", "features"], arquivo: "00-PLANEJAMENTO.md" },
] as const;
// o `orcamento_declarado_por` da sprintx: identificador minúsculo
const DECLARANTE = /^[a-z][a-z0-9_-]*$/;
// passam por cima do que o comando escolhe (documentação do Claude Code)
const SOBREPOEM = [
  ["ANTHROPIC_MODEL", "--model"],
  ["CLAUDE_CODE_EFFORT_LEVEL", "--effort"],
] as const;

/** As raízes das worktrees do repositório de `raiz`, a atual primeiro; fora do git, só ela. */
function worktrees(raiz: string): string[] {
  const r = spawnSync("git", ["-C", raiz, "worktree", "list", "--porcelain", "-z"], { encoding: "utf8" });
  const top = spawnSync("git", ["-C", raiz, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const atual = top.status === 0 ? top.stdout.trim() : raiz;
  const todas = r.status !== 0 ? [] : r.stdout.split("\0").filter((l) => l.startsWith("worktree ")).map((l) => l.slice("worktree ".length));
  return [atual, ...todas.filter((w) => w !== atual)].filter((w) => existsSync(w));
}

type Candidato = { raiz: string; caminho: string; dados: Record<string, unknown> };

function candidatos(raiz: string, trabalho: string): Candidato[] {
  const achados: Candidato[] = [];
  for (const wt of worktrees(raiz)) {
    for (const a of ARTEFATOS) {
      const base = join(wt, ...a.pasta);
      let pastas: string[];
      try {
        pastas = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
      } catch {
        continue;
      }
      for (const p of pastas) {
        const caminho = join(base, p, a.arquivo);
        let texto: string;
        try {
          texto = readFileSync(caminho, "utf8");
        } catch {
          continue;
        }
        const lido = lerFrontmatter(texto);
        if (!lido.ok || lido.dados === null || typeof lido.dados !== "object") continue;
        const dados = lido.dados as Record<string, unknown>;
        if (typeof dados["trabalho_id"] === "string" && dados["trabalho_id"].trim() === trabalho) achados.push({ raiz: wt, caminho, dados });
      }
    }
  }
  return achados;
}

type Declaracao = { ok: true; classe: Classe | null } | { ok: false; motivo: string };

/** A tripla `classe_sessao*`: ausente vale `null`; incoerente é recusada, nunca corrigida. */
export function lerDeclaracao(dados: Record<string, unknown>): Declaracao {
  const valor = (k: string): unknown => (Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null);
  const classe = valor("classe_sessao");
  const por = valor("classe_sessao_por");
  const justificativa = valor("classe_sessao_justificativa");
  if (classe === null) {
    if (por !== null || justificativa !== null) return { ok: false, motivo: "classe_sessao nula com classe_sessao_por ou justificativa preenchidas" };
    return { ok: true, classe: null };
  }
  if (typeof classe !== "string" || !(CLASSES as readonly string[]).includes(classe)) {
    return { ok: false, motivo: `classe_sessao precisa ser uma de ${CLASSES.join(", ")} ou null` };
  }
  if (typeof por !== "string" || !DECLARANTE.test(por)) return { ok: false, motivo: "classe_sessao_por precisa ser um identificador minusculo" };
  if (classe === "profundo_excepcional") {
    if (typeof justificativa !== "string" || justificativa.trim() === "" || /[\r\n]/.test(justificativa)) {
      return { ok: false, motivo: "profundo_excepcional exige classe_sessao_justificativa nao vazia, numa linha" };
    }
  } else if (justificativa !== null) {
    return { ok: false, motivo: "classe_sessao_justificativa so vale em profundo_excepcional" };
  }
  return { ok: true, classe: classe as Classe };
}

/** Aspas simples do shell POSIX; o apóstrofo vira `'\''`. */
const aspas = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
const argumento = (s: string): string => (/^[A-Za-z0-9._:/@+=-]+$/.test(s) ? s : aspas(s));

export function sugerirSessao(raiz: string, trabalho: string, env: NodeJS.ProcessEnv = process.env): Sugestao {
  const achados = candidatos(raiz, trabalho);
  if (achados.length === 0) return { ok: false, erro: `trabalho nao encontrado: ${trabalho}` };
  if (achados.length > 1) {
    return { ok: false, erro: `trabalho ambiguo: ${trabalho} em ${achados.map((a) => a.caminho).join(", ")}` };
  }
  const alvo = achados[0] as Candidato;
  const onde = relative(alvo.raiz, alvo.caminho);
  const d = lerDeclaracao(alvo.dados);
  if (!d.ok) return { ok: false, erro: `declaracao invalida em ${onde}: ${d.motivo}` };
  if (d.classe === null) return { ok: false, erro: `sem classe declarada em ${onde}: nada a sugerir` };

  const politica = lerPolitica(alvo.raiz);
  if (!politica.ok) return { ok: false, erro: `politica invalida: ${politica.erro}` };
  const doProjeto = politica.ativa ? politica.politica.adaptadores.claude?.classes[d.classe] : undefined;
  const cadeia = doProjeto ?? TABELA_EMBUTIDA.claude[d.classe];
  const alt = cadeia?.[0] as Alternativa | undefined;
  if (alt === undefined) return { ok: false, erro: `nenhuma cadeia para ${d.classe} no adaptador claude` };

  let raizReal = alvo.raiz;
  try {
    raizReal = realpathSync(alvo.raiz);
  } catch {
    // a raiz que o git deu
  }
  const linha = `cd ${aspas(raizReal)} && claude --model ${argumento(alt.model)}${alt.effort === undefined ? "" : ` --effort ${argumento(alt.effort)}`}`;
  const avisos = SOBREPOEM.filter(([v]) => (env[v] ?? "") !== "").map(([v, flag]) => `${v} no ambiente passa por cima do ${flag} deste comando`);
  return { ok: true, linha, avisos };
}
