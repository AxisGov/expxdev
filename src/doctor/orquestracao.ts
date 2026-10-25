import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lock } from "../nucleo/lock.js";
import { classeDoModeloClaude, correspondeClaude } from "../orquestracao/adaptadores.js";
import { caminhoDoRegistro, lerRegistro } from "../orquestracao/materializar.js";
import { lerPolitica } from "../orquestracao/politica.js";
import type { Resolucao } from "../orquestracao/resolver.js";
import { posto } from "../orquestracao/tipos.js";
import type { Achado } from "./verificadores.js";

/**
 * Achados `orquestracao-*` (CONTRATO-expx-instalacao §5.3). Só falam quando a
 * camada existe: política presente ou seção `orquestracao` no lock.
 *
 * Erro é o que torna a resolução não reproduzível (política inválida, registro
 * ausente ou adulterado). O resto é aviso: a configuração vale, mas algo pode
 * fazer o executor sair dela.
 */

const lista = (xs: readonly string[]): string => xs.join(", ");

/**
 * `fallbackModel` vem inteiro da fonte de maior precedência que o declara,
 * sem mescla (code.claude.com/docs/en/settings). Só as fontes que o doctor
 * consegue ler: local do projeto, projeto e usuário. Settings gerenciados e
 * `--fallback-model` de outra sessão ficam fora — esses só a observação do
 * executor (F3) pega.
 */
function fallbackPersistido(raiz: string, env: NodeJS.ProcessEnv): { origem: string; modelos: string[] } | undefined {
  const home = env["HOME"] ?? env["USERPROFILE"];
  const fontes: Array<[string, string]> = [
    [".claude/settings.local.json", join(raiz, ".claude", "settings.local.json")],
    [".claude/settings.json", join(raiz, ".claude", "settings.json")],
    ...(home !== undefined && home !== "" ? ([["~/.claude/settings.json", join(home, ".claude", "settings.json")]] as Array<[string, string]>) : []),
  ];
  for (const [origem, caminho] of fontes) {
    if (!existsSync(caminho)) continue;
    let dados: unknown;
    try {
      dados = JSON.parse(readFileSync(caminho, "utf8"));
    } catch {
      continue;
    }
    if (typeof dados !== "object" || dados === null || !("fallbackModel" in dados)) continue;
    const valor = (dados as Record<string, unknown>)["fallbackModel"];
    const modelos = (Array.isArray(valor) ? valor : [valor]).filter((m): m is string => typeof m === "string");
    return { origem, modelos };
  }
  return undefined;
}

export function verificarOrquestracao(raiz: string, lock: Lock | undefined, env: NodeJS.ProcessEnv, push: (a: Achado) => void): void {
  const politica = lerPolitica(raiz);
  const secao = lock?.orquestracao;
  const ativa = !politica.ok || politica.ativa;
  if (!ativa && secao === undefined) return;

  if (!politica.ok) {
    push({
      id: "orquestracao-invalida",
      severidade: "erro",
      problema: politica.erro,
      correcao: "corrija .expx/orquestracao.json (CONTRATO-expx-orquestracao §4) e rode `expx init`",
    });
  } else if (!politica.ativa && secao !== undefined) {
    push({
      id: "orquestracao-lock-sem-politica",
      severidade: "aviso",
      problema: "o lock tem a secao orquestracao, mas .expx/orquestracao.json foi removido",
      correcao: "rode `expx init`: a secao sai do lock e o registro .expx/resolucoes/ fica como historico",
    });
  }

  // O registro de cada resolução vigente.
  const resolucoes: Resolucao[] = [];
  const ausentes: string[] = [];
  const adulterados: string[] = [];
  for (const [agente, porAdaptador] of Object.entries(secao?.agentes ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const id = porAdaptador.claude;
    const caminho = join(raiz, ...caminhoDoRegistro(id).split("/"));
    if (!existsSync(caminho)) {
      ausentes.push(`${agente} (${id})`);
      continue;
    }
    let texto: string;
    try {
      texto = readFileSync(caminho, "utf8");
    } catch {
      adulterados.push(`${agente} (${id}): ilegivel`);
      continue;
    }
    const r = lerRegistro(id, texto);
    if (!r.ok) adulterados.push(`${agente} (${id}): ${r.erro}`);
    else if (r.resolucao.agente !== agente || r.resolucao.adaptador !== "claude") {
      adulterados.push(`${agente} (${id}): o registro e de ${r.resolucao.agente}/${r.resolucao.adaptador}, nao de ${agente}/claude`);
    } else resolucoes.push(r.resolucao);
  }
  if (ausentes.length > 0) {
    push({
      id: "orquestracao-resolucao-ausente",
      severidade: "erro",
      problema: `o lock cita resolucao sem arquivo em .expx/resolucoes/: ${lista(ausentes)}`,
      correcao: "restaure o registro pelo git; sem ele, os eventos que citam esse id perdem a intencao",
    });
  }
  if (adulterados.length > 0) {
    push({
      id: "orquestracao-registro-adulterado",
      severidade: "erro",
      problema: `registro de resolucao fora do que foi gravado: ${lista(adulterados)}`,
      correcao: "o registro e imutavel: restaure o arquivo pelo git, sem reformatar",
    });
  }

  const inferidas = resolucoes.filter((r) => r.origem_classe === "inferida").map((r) => r.agente);
  if (inferidas.length > 0) {
    push({
      id: "orquestracao-classe-inferida",
      severidade: "aviso",
      problema: `agente sem classe declarada, inferida do model do frontmatter: ${lista(inferidas)}`,
      correcao: "a skill deve declarar `classe:` no frontmatter do agente (o Claude Code ignora o campo)",
    });
  }

  const abaixo = resolucoes
    .filter((r) => {
      if (r.sobreposta_por === undefined || r.materializado === undefined) return false;
      const classe = classeDoModeloClaude(r.materializado.model);
      return classe === null || posto(classe) < posto(r.classe_declarada);
    })
    .map((r) => `${r.agente} (${r.materializado?.model ?? "?"} para ${r.classe_declarada})`);
  if (abaixo.length > 0) {
    push({
      id: "orquestracao-v1-abaixo-da-classe",
      severidade: "aviso",
      problema: `o .expx/agentes.json v1 pos agente abaixo da classe declarada: ${lista(abaixo)}`,
      correcao: "o v1 ainda pode rebaixar por compatibilidade (H9); prefira uma cadeia em .expx/orquestracao.json",
    });
  }

  const forcadas: string[] = [];
  const forcar = env["CLAUDE_CODE_SUBAGENT_MODEL_FORCE"];
  if (forcar !== undefined && forcar !== "" && forcar !== "0" && forcar.toLowerCase() !== "false") forcadas.push("CLAUDE_CODE_SUBAGENT_MODEL_FORCE");
  if ((env["CLAUDE_CODE_EFFORT_LEVEL"] ?? "") !== "") forcadas.push("CLAUDE_CODE_EFFORT_LEVEL");
  if (forcadas.length > 0) {
    push({
      id: "orquestracao-variavel-sobrepoe",
      severidade: "aviso",
      problema: `no ambiente do doctor, ${lista(forcadas)} faz o Claude Code ignorar o model ou o effort dos agentes`,
      correcao: "remova a variavel do ambiente em que o Claude Code roda, ou a resolucao materializada nao e a executada",
    });
  }

  const fallback = fallbackPersistido(raiz, env);
  if (fallback !== undefined && fallback.modelos.length > 0) {
    const fora: string[] = [];
    for (const r of resolucoes) {
      // A cadeia é o que a política autoriza; com o v1, o materializado é a
      // exceção aceita (CONTRATO-expx-orquestracao §7.4). Os dois valem.
      const aceitos = [...r.cadeia.map((a) => a.model), ...(r.materializado !== undefined ? [r.materializado.model] : [])];
      const estranhos = fallback.modelos.filter((m) => !aceitos.some((a) => correspondeClaude(m, a)));
      if (estranhos.length > 0) fora.push(`${r.agente}: ${lista(estranhos)}`);
    }
    if (fora.length > 0) {
      push({
        id: "orquestracao-fallback-fora",
        severidade: "aviso",
        problema: `fallbackModel de ${fallback.origem} pode levar subagente para fora da cadeia: ${lista(fora)}`,
        correcao: "o fallback do Claude Code vale para a sessao inteira; ajuste-o ou inclua os modelos nas cadeias (o expx nao escreve fallbackModel, H11)",
      });
    }
  }
}
