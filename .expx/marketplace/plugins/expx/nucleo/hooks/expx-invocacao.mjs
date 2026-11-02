#!/usr/bin/env node
// expx-invocacao.mjs — o envelope da chamada de agente (CONTRATO-expx-orquestracao §8.2),
// em PreToolUse, PostToolUse e PostToolUseFailure do `Agent`, e em SessionStart.
//
// Nesta versao o envelope SO OBSERVA: registra quem rodou, em que modelo e como
// terminou, e nada e recusado. Por isso falha aberta: qualquer erro aqui sai 0 e sem
// imprimir, e o agente roda. A falta do envelope aparece no fechamento.
//
// O envelope mora no git-dir, como a foto da integridade final: escrever na arvore
// durante outro aprovador daria `divergente` falso. Instalado so com a politica ativa
// (§7.3), le a resolucao vigente da projecao que o `expx init` grava, sem CLI.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// Quem emite `veredito_emitido`: precisa ser observado do inicio ao fim, e so o
// primeiro plano permite isso (§10.2). Transitoria: a F4 a troca pelo `papel`.
const APROVADORES = new Set(["auditor-plano", "sprintx-revisor-testes", "revisor-diff", "qa", "runx-revisor-testes"]);
// A `ferramenta` do evento, que o esquema exige. Agente fora daqui nao grava evento.
const FERRAMENTA = new Map([
  ["auditor-plano", "sprintx"], ["sprintx-revisor-testes", "sprintx"], ["sprintx-investigador", "sprintx"],
  ["runx-revisor-testes", "runx"], ["runx-investigador", "runx"], ["qa", "runx"],
  ["revisor-diff", "mergex"], ["analista-de-conflito", "mergex"],
  ["legadox-cartografo", "legadox"], ["avaliador-de-raio", "legadox"],
  ["stackx-cartografo", "stackx"], ["auditor-design", "designx"], ["cartografo-visual", "designx"],
]);
const UM_DIA = 24 * 60 * 60 * 1000;
const RASTRO = join(dirname(fileURLToPath(import.meta.url)), "expx-rastro.sh");

const git = (raiz, args, input) => spawnSync("git", ["-C", raiz, ...args], { encoding: "utf8", input });
const hash = (texto) => createHash("sha256").update(texto).digest("hex");

/** Um unico prefixo `expx:` literal; o resto e o nome exato. */
const nomeDoAgente = (t) => (typeof t === "string" && t.startsWith("expx:") ? t.slice(5) : t);

function raizDe(cwd) {
  const r = git(cwd, ["rev-parse", "--show-toplevel"]);
  return r.status === 0 ? r.stdout.trim() : cwd;
}

/** A pasta dos envelopes: no git-dir de cada worktree; sem Git, em `.expx/`. */
function pastaDe(raiz) {
  const r = git(raiz, ["rev-parse", "--git-path", "expx/invocacoes/v1"]);
  if (r.status !== 0 || r.stdout.trim() === "") return join(raiz, ".expx", "invocacoes");
  const p = r.stdout.trim();
  return isAbsolute(p) ? p : join(raiz, p);
}

/** O `resolucao_id` vigente do agente, da projecao; vazio se ele nao e gerenciado. */
function resolucaoDe(raiz, agente) {
  let linhas;
  try {
    linhas = readFileSync(join(raiz, ".expx", "orquestracao-rastro.tsv"), "utf8").split(/\r?\n/);
  } catch {
    return "";
  }
  if (linhas[0] !== "# expx-orquestracao-rastro 1") return "";
  const dele = linhas.slice(1).filter((l) => l.split("\t")[0] === agente);
  if (dele.length !== 1) return "";
  const id = dele[0].split("\t")[1] ?? "";
  return /^[0-9a-f]{64}$/.test(id) ? id : "";
}

/** Os dois hooks calculam a instancia pela mesma conta, com o formato de hash do repositorio. */
function instanciaDe(raiz, sessao, agentId) {
  if (typeof sessao !== "string" || typeof agentId !== "string" || agentId === "") return "";
  const r = git(raiz, ["hash-object", "--stdin"], `${sessao}\n${agentId}`);
  return r.status === 0 ? r.stdout.trim() : "";
}

/** Devolve se o escritor rodou: sem ele, o envelope fica para a proxima recuperacao. */
function grava(raiz, agente, evento, resultado, detalhe, extras, modelo) {
  const ferramenta = FERRAMENTA.get(agente);
  if (ferramenta === undefined || !existsSync(RASTRO)) return false;
  const env = { ...process.env, EXPX_FERRAMENTA: ferramenta, EXPX_AGENTE: agente };
  env.EXPX_HARNESS = env.EXPX_HARNESS || "claude-code";
  if (modelo) env.EXPX_MODEL = modelo;
  const corpo = Object.entries(extras).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",");
  const r = spawnSync("bash", ["-c", '. "$0"; expx_rastro_grava "$1" "$2" hook "$3" "$4" "[]" "$5"', RASTRO, raiz, evento, resultado, detalhe, corpo], { env, stdio: "ignore" });
  return r.error === undefined && r.status === 0;
}

/** Modelos observados: `modelsUsed` so como lista de texto nao vazia, senao `resolvedModel`. */
function modelosDe(resposta) {
  const usados = resposta?.modelsUsed;
  if (Array.isArray(usados) && usados.length > 0 && usados.every((m) => typeof m === "string" && m !== "")) return usados;
  return typeof resposta?.resolvedModel === "string" && resposta.resolvedModel !== "" ? [resposta.resolvedModel] : [];
}

/** ID completo casa com o mesmo ID ou com o alias da familia contida nele (§10.2). */
function corresponde(observado, autorizado) {
  return observado === autorizado || (/^[a-z]+$/.test(autorizado) && observado.split(/[-.[\]]/).includes(autorizado));
}

/**
 * Algum modelo saiu do autorizado? `null` quando nao ha como julgar: registro
 * ilegivel ou nada observado nunca viram "dentro da politica".
 */
function foraDaPolitica(raiz, resolucaoId, modelos) {
  if (modelos.length === 0 || !/^[0-9a-f]{64}$/.test(resolucaoId ?? "")) return null;
  let r;
  try {
    r = JSON.parse(readFileSync(join(raiz, ".expx", "resolucoes", `${resolucaoId}.json`), "utf8"));
  } catch {
    return null;
  }
  const autorizados = r?.materializado?.model ? [r.materializado.model] : (r?.cadeia ?? []).flatMap((a) => [a?.id, a?.model]);
  const validos = autorizados.filter((a) => typeof a === "string" && a !== "");
  if (validos.length === 0) return null;
  return modelos.some((m) => !validos.some((a) => corresponde(m, a)));
}

function antes(d) {
  const raiz = raizDe(d.cwd || process.cwd());
  const entrada = d.tool_input;
  const agente = nomeDoAgente(entrada?.subagent_type);
  // Agente fora do vocabulario do rastro nao teria evento valido: nao e observado.
  const resolucaoId = FERRAMENTA.has(agente) ? resolucaoDe(raiz, agente) : "";
  if (resolucaoId === "") return;
  try {
    const pasta = pastaDe(raiz);
    mkdirSync(pasta, { recursive: true });
    const fd = openSync(join(pasta, `${hash(String(d.tool_use_id))}.json`), "wx");
    writeSync(fd, JSON.stringify({ invocacao: d.tool_use_id, resolucao_id: resolucaoId, agente, session_id: d.session_id }));
    closeSync(fd);
  } catch {
    // falha aberta: o aprovador ainda vai para o primeiro plano
  }
  if (APROVADORES.has(agente) && entrada.run_in_background !== false) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { ...entrada, run_in_background: false } } }));
  }
}

/** Toma o envelope para si: dois handlers nao fecham a mesma invocacao. */
function tomar(arquivo) {
  const fechando = `${arquivo}.fechando`;
  try {
    renameSync(arquivo, fechando);
  } catch (e) {
    return e?.code === "ENOENT" && !existsSync(fechando) ? { envelope: null, fechando: null } : null;
  }
  try {
    return { envelope: JSON.parse(readFileSync(fechando, "utf8")), fechando };
  } catch {
    return { envelope: null, fechando };
  }
}

function depois(d, evento) {
  const raiz = raizDe(d.cwd || process.cwd());
  const nome = nomeDoAgente(d.tool_input?.subagent_type);
  const gerenciado = FERRAMENTA.has(nome) && resolucaoDe(raiz, nome) !== "";
  // O envelope vem primeiro: a projecao pode ter saido durante um agente em segundo plano.
  const tomado = tomar(join(pastaDe(raiz), `${hash(String(d.tool_use_id))}.json`));
  if (tomado === null || (tomado.envelope === null && !gerenciado)) return;
  const agente = tomado.envelope?.agente ?? nome;
  const resposta = d.tool_response;
  const estado = evento === "PostToolUseFailure" ? "falha" : resposta?.status === "async_launched" ? "lancada" : "concluida";
  const modelos = modelosDe(resposta);
  const extras = { invocacao: d.tool_use_id, estado_invocacao: estado };
  const instancia = instanciaDe(raiz, d.session_id, resposta?.agentId);
  if (instancia) extras.instancia = instancia;
  if (modelos.length > 0) extras.modelos_observados = modelos;
  // `lancada` so prova o lancamento: nao ha execucao inteira para julgar.
  const julgamento = estado === "concluida" ? foraDaPolitica(raiz, tomado.envelope?.resolucao_id ?? resolucaoDe(raiz, agente), modelos) : null;
  if (julgamento === true) extras.fora_da_politica = true;
  const semEnvelope = tomado.envelope === null ? " (sem envelope)" : "";
  const resultado = estado === "falha" ? "falha" : "ok";
  const gravou = grava(raiz, agente, "invocacao_fechada", resultado, `invocacao de ${agente}: ${estado}${semEnvelope}`, extras, modelos.at(-1));
  if (gravou && tomado.fechando) rmSync(tomado.fechando, { force: true });
}

/** O evento dessa invocacao ja saiu? Um fechamento interrompido nao vira abandono em dobro. */
function jaRegistrada(raiz, invocacao) {
  const dir = join(raiz, "docs", "eventos");
  let nomes;
  try {
    nomes = readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return false;
  }
  const chave = `"invocacao":${JSON.stringify(invocacao)}`;
  return nomes.some((n) => {
    try {
      return readFileSync(join(dir, n), "utf8").includes(chave);
    } catch {
      return false;
    }
  });
}

/**
 * O que ficou para tras vira abandono. `startup` e `resume` comecam um processo novo,
 * entao todo envelope desta sessao e de antes dele, mesmo com o `session_id` igual. O de
 * outra sessao so depois de um dia: ela pode estar viva. Compactar nao conta: a sessao
 * continua a mesma, com agente rodando.
 */
function recuperar(d) {
  if (d.source !== "startup" && d.source !== "resume") return;
  const raiz = raizDe(d.cwd || process.cwd());
  const pasta = pastaDe(raiz);
  if (!existsSync(pasta)) return;
  for (const nome of readdirSync(pasta)) {
    if (!/\.json(\.fechando(\.\d+)?)?$/.test(nome)) continue;
    const arquivo = join(pasta, nome);
    try {
      const envelope = JSON.parse(readFileSync(arquivo, "utf8"));
      if (envelope.session_id !== d.session_id && Date.now() - statSync(arquivo).mtimeMs <= UM_DIA) continue;
      // Tomada exclusiva tambem do que ficou em fechamento: dois inicios nao abandonam em dobro.
      const meu = `${arquivo.replace(/\.fechando(\.\d+)?$/, "").replace(/\.json$/, "")}.json.fechando.${process.pid}`;
      renameSync(arquivo, meu);
      const gravou = jaRegistrada(raiz, envelope.invocacao)
        || grava(raiz, envelope.agente, "invocacao_abandonada", "falha", `invocacao de ${envelope.agente} sem fechamento`, { invocacao: envelope.invocacao });
      if (gravou) rmSync(meu, { force: true });
    } catch {
      // um envelope ruim nao impede os outros
    }
  }
}

try {
  const d = JSON.parse(readFileSync(0, "utf8"));
  const evento = d.hook_event_name;
  if (evento === "PreToolUse") antes(d);
  else if (evento === "PostToolUse" || evento === "PostToolUseFailure") depois(d, evento);
  else if (evento === "SessionStart") recuperar(d);
} catch {
  // falha aberta: observar nunca trava o agente
}
process.exit(0);
