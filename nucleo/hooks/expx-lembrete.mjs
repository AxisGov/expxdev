#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSAO_CHAVE = "v1";
const TTL_EVENTO_MS = 24 * 60 * 60 * 1_000;
const TTL_TRABALHO_MS = 7 * 24 * 60 * 60 * 1_000;

const REGRAS = [
  ["memox", "a pergunta e sobre o passado do codigo", /(ja (aconteceu|deu|teve|foi) (antes|isso)|e recorrente|voltou a (acontecer|dar)|historico (do|da|de)|quem mexeu|ja foi (decidido|tentado|descartado)|regressao)/],
  ["stackx", "a pergunta e sobre a convencao tecnica do repositorio", /(qual o padrao|como (escrevo|faco) (o )?teste|onde (coloco|fica|ponho)|convencao|esta no padrao|padroes do projeto)/],
  ["mergex", "e trabalho de entrega e revisao", /(abrir? (o )?pr\b|pull request|criar? (a )?branch|commitar|versionar|subir o trabalho|mandar para revisao|pronto para (entregar|revisao)|pacote (do|de) qa)/],
  ["prodx", "e um pedido cru, e decidir SE vira trabalho vem antes de planejar", /(seria bom se|seria legal se|poderia (ter|fazer)|vale a pena|ja existe (no sistema|isso)|ideia de|gostaria de ter|queria (uma|um) (tela|relatorio|campo) nov)/],
  ["runx", "e um defeito em algo que ja existe", /(\bbug\b|defeito|nao funciona|parou de funcionar|nao esta funcionando|nao acompanha|nao segue o padrao|(esta|ta|vindo|vem|veio|calculando|somando|mostrando|exibindo) errad|valor errado|(errado|divergente|incorret)|nao responde|nao carrega|nao salva|nao aparece|trava|travando|quebrou|quebrado|erro ao|falha ao|deveria .* mas)/],
  ["sprintx", "e trabalho de construcao", /(implementar|construir|criar (uma|um) (feature|funcionalidade|integracao)|adicionar (uma|um) (feature|funcionalidade)|integrar com|refatorar|migrar (para|de))/],
];

function textoNormalizado(valor) {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function caminhoNormalizado(valor) {
  let caminho = resolve(String(valor));
  try {
    caminho = realpathSync.native(caminho);
  } catch {
    // Caminho ainda inexistente: resolve() ja removeu os segmentos relativos.
  }
  caminho = caminho.replaceAll("\\", "/");
  if (/^[A-Z]:/.test(caminho)) caminho = `${caminho[0].toLowerCase()}${caminho.slice(1)}`;
  const raiz = parse(caminho).root.replaceAll("\\", "/");
  while (caminho.length > raiz.length && caminho.endsWith("/")) caminho = caminho.slice(0, -1);
  return caminho;
}

function hash(tipo, partes) {
  return createHash("sha256")
    .update([VERSAO_CHAVE, tipo, ...partes].join("\0"))
    .digest("hex");
}

function skillInstalada(skill, raiz, existe = existsSync) {
  return (
    existe(join(raiz, ".claude", "skills", skill, "SKILL.md")) ||
    existe(join(raiz, ".expx", "marketplace", "plugins", "expx", "skills", skill))
  );
}

export function classificarEntrada(input, ambiente = {}) {
  const prompt = String(input?.prompt ?? "");
  if (prompt.length < 12) return null;
  const normalizado = textoNormalizado(prompt);
  const raiz = caminhoNormalizado(
    input?.cwd ?? ambiente.env?.CLAUDE_PROJECT_DIR ?? ambiente.cwd ?? process.cwd(),
  );
  const instalada = ambiente.instalada ?? ((skill) => skillInstalada(skill, raiz, ambiente.existe));
  for (const [skill, motivo, padrao] of REGRAS) {
    if (padrao.test(normalizado) && instalada(skill)) return { skill, motivo };
  }
  return null;
}

export function identificarSessao(input) {
  const sessao = typeof input?.session_id === "string" ? input.session_id.trim() : "";
  if (sessao) return `session:${sessao}`;
  const transcript = typeof input?.transcript_path === "string" ? input.transcript_path.trim() : "";
  if (transcript) return `transcript:${caminhoNormalizado(transcript)}`;
  return null;
}

export function identificarTrabalho(_input, cwd) {
  try {
    const lido = JSON.parse(readFileSync(join(cwd, ".expx", "estado.json"), "utf8"));
    if (typeof lido?.trabalho === "string" && lido.trabalho.trim()) return lido.trabalho.trim();
  } catch {
    // Estado de trabalho ausente ou invalido usa a identidade implicita.
  }
  return "implicit";
}

function estadoVazio() {
  return { versao: 1, eventos: [], trabalhos: [] };
}

function podar(estado, agora) {
  return {
    versao: 1,
    eventos: estado.eventos.filter((item) => agora - item.timestamp <= TTL_EVENTO_MS),
    trabalhos: estado.trabalhos.filter((item) => agora - item.timestamp <= TTL_TRABALHO_MS),
  };
}

export function decidirInjecao(contexto, estadoRecebido = estadoVazio()) {
  const estado = podar({
    eventos: Array.isArray(estadoRecebido?.eventos) ? estadoRecebido.eventos : [],
    trabalhos: Array.isArray(estadoRecebido?.trabalhos) ? estadoRecebido.trabalhos : [],
  }, contexto.agora);

  if (!contexto.sessao) return { emitir: true, tipo: "completo", estado, mudou: false };

  const evento = contexto.promptId
    ? hash("evento", [contexto.sessao, contexto.promptId, contexto.skill])
    : null;
  const trabalho = hash("trabalho", [
    contexto.sessao,
    contexto.cwd,
    contexto.trabalho,
    contexto.skill,
  ]);

  if (evento && estado.eventos.some((item) => item.hash === evento)) {
    return { emitir: false, tipo: "nenhum", estado, mudou: false };
  }

  const registroEvento = evento
    ? [{ versao: 1, hash: evento, skill: contexto.skill, timestamp: contexto.agora }]
    : [];
  if (estado.trabalhos.some((item) => item.hash === trabalho)) {
    return {
      emitir: false,
      tipo: "nenhum",
      estado: { ...estado, eventos: [...estado.eventos, ...registroEvento] },
      mudou: registroEvento.length > 0,
    };
  }

  return {
    emitir: true,
    tipo: estado.trabalhos.length === 0 ? "completo" : "delta",
    estado: {
      ...estado,
      eventos: [...estado.eventos, ...registroEvento],
      trabalhos: [
        ...estado.trabalhos,
        { versao: 1, hash: trabalho, skill: contexto.skill, timestamp: contexto.agora },
      ],
    },
    mudou: true,
  };
}

function lembreteCompleto(skill, motivo) {
  return `[Expx] Este pedido casa com a skill \`${skill}\` (${motivo}).\n\nANTES de ler codigo, formar hipotese ou editar qualquer arquivo: leia a descricao da skill \`${skill}\` e decida explicitamente se ela se aplica. Se aplicar, use-a. Se nao aplicar, diga em uma linha por que nao.\n\nHipotese tecnica forte nao dispensa esta checagem — e justamente quando ela mais protege.`;
}

function lembreteDelta(skill, motivo) {
  return `[Expx] O contexto agora casa com a skill \`${skill}\` (${motivo}). Leia a descricao e decida explicitamente se ela se aplica.`;
}

function serializar(texto) {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: texto,
    },
  })}\n`;
}

function caminhoDoEstado(input) {
  const scratchpad = typeof input?.scratchpad_dir === "string" ? input.scratchpad_dir : "";
  if (!scratchpad || !isAbsolute(scratchpad)) return null;
  return join(scratchpad, "expx", "lembrete-v1", "estado.json");
}

function lerEstadoMinimo(caminho) {
  if (!existsSync(caminho)) return { estado: estadoVazio(), corrompido: false };
  try {
    const estado = JSON.parse(readFileSync(caminho, "utf8"));
    if (!Array.isArray(estado?.eventos) || !Array.isArray(estado?.trabalhos)) throw new Error("estado invalido");
    return { estado, corrompido: false };
  } catch {
    return { estado: estadoVazio(), corrompido: true };
  }
}

function gravarEstadoMinimo(caminho, estado) {
  mkdirSync(resolve(caminho, ".."), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(estado)}\n`);
}

export function main(io = {}) {
  let saida = "";
  try {
    const entrada = io.input ?? readFileSync(0, "utf8");
    const input = JSON.parse(String(entrada));
    const env = io.env ?? process.env;
    const cwd = caminhoNormalizado(input.cwd ?? env.CLAUDE_PROJECT_DIR ?? io.cwd ?? process.cwd());
    const classificacao = classificarEntrada(input, { env, cwd, existe: io.existe });
    if (!classificacao) return "";

    const sessao = identificarSessao(input);
    const contexto = {
      ...classificacao,
      sessao,
      promptId: typeof input.prompt_id === "string" && input.prompt_id.trim() ? input.prompt_id.trim() : null,
      cwd,
      trabalho: identificarTrabalho(input, cwd),
      agora: typeof io.agora === "function" ? io.agora() : Date.now(),
    };
    const caminhoEstado = sessao ? caminhoDoEstado(input) : null;
    const lido = caminhoEstado ? lerEstadoMinimo(caminhoEstado) : { estado: estadoVazio(), corrompido: false };

    if (lido.corrompido) {
      saida = serializar(lembreteCompleto(classificacao.skill, classificacao.motivo));
    } else {
      const decisao = decidirInjecao(contexto, lido.estado);
      if (caminhoEstado && decisao.mudou) gravarEstadoMinimo(caminhoEstado, decisao.estado);
      if (decisao.emitir) {
        const texto = decisao.tipo === "delta"
          ? lembreteDelta(classificacao.skill, classificacao.motivo)
          : lembreteCompleto(classificacao.skill, classificacao.motivo);
        saida = serializar(texto);
      }
    }
  } catch {
    saida = "";
  }

  const escrever = io.write ?? ((texto) => process.stdout.write(texto));
  if (saida) escrever(saida);
  return saida;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
