#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  comLock,
  gravarEstadoAtomico,
  lerEstado,
  podarEstado,
  selecionarRaizEstado,
} from "./expx-lembrete-estado.mjs";

const VERSAO_CHAVE = "v1";
const MARCADOR_WRAPPER = "__EXPX_NODE_OK_V1__";

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

export function decidirInjecao(contexto, estadoRecebido = estadoVazio()) {
  const estado = podarEstado({
    versao: 1,
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
  const sessao = hash("sessao", [contexto.sessao]);

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
    tipo: estado.trabalhos.some((item) => item.sessao === sessao) ? "delta" : "completo",
    estado: {
      ...estado,
      eventos: [...estado.eventos, ...registroEvento],
      trabalhos: [
        ...estado.trabalhos,
        { versao: 1, hash: trabalho, skill: contexto.skill, timestamp: contexto.agora, sessao },
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
    let decisao;
    if (!sessao) {
      decisao = decidirInjecao(contexto, estadoVazio());
    } else {
      const raizEstado = selecionarRaizEstado(input, io.estado);
      const execucao = raizEstado
        ? comLock(raizEstado, () => {
          const lido = lerEstado(raizEstado);
          if (lido.hostil) return { conservador: true };
          const calculada = decidirInjecao(contexto, lido.estado);
          const estado = podarEstado(calculada.estado, contexto.agora);
          if ((calculada.mudou || lido.corrompido || lido.normalizado)
            && !gravarEstadoAtomico(raizEstado, estado, { agora: () => contexto.agora })) {
            return { conservador: true };
          }
          return { decisao: { ...calculada, estado } };
        })
        : { adquirido: false };
      decisao = execucao.adquirido && !execucao.erro && execucao.valor?.decisao
        ? execucao.valor.decisao
        : { emitir: true, tipo: "completo" };
    }

    if (decisao.emitir) {
      const texto = decisao.tipo === "delta"
        ? lembreteDelta(classificacao.skill, classificacao.motivo)
        : lembreteCompleto(classificacao.skill, classificacao.motivo);
      saida = serializar(texto);
    }
  } catch {
    saida = "";
  }

  const escrever = io.write ?? ((texto) => process.stdout.write(texto));
  if (saida) escrever(saida);
  return saida;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [maior, menor] = process.versions.node.split(".").map(Number);
  if (maior < 20 || (maior === 20 && menor < 19)) {
    process.exitCode = 78;
  } else {
    const saida = main({ write: () => undefined });
    process.stdout.write(`${MARCADOR_WRAPPER}${saida}`);
  }
}
