import { z } from "zod";
import { Ferramenta } from "./enums.js";

/**
 * Contrato `expx-eventos` v1 — a linha do rastro.
 *
 * Fonte única da regra das doze chaves. Ela já esteve escrita à mão em dois
 * lugares (`runx/hooks/testes/testar.sh` e `stackx/hooks/stackx/_rastro.py`),
 * e as duas listas divergiram do que as skills realmente gravam.
 */

/** As doze chaves obrigatórias, na ordem do contrato. */
export const CHAVES_EVENTO = [
  "ts",
  "expx_eventos",
  "trabalho_id",
  "ferramenta",
  "origem",
  "evento",
  "fase",
  "task",
  "agente",
  "resultado",
  "detalhe",
  "arquivos",
] as const;

/**
 * Chaves extras que o contrato declara, por skill. Extras existem porque a
 * alternativa — espremer a informação em `detalhe` — perde o dado para sempre.
 *
 * `sessao`/`harness` são a identidade que o escritor da `sprintx`
 * (`scripts/rastro.sh`) deriva do harness — é por ela que o hook `escopo-da-task`
 * liga a edição à task aberta. Linha gravada por hook não as leva, e evento que
 * não depende da identidade as leva `null`: por isso são opcionais, nunca
 * obrigatórias.
 */
export const EXTRAS_EVENTO = ["hook", "faixa", "sessao", "harness"] as const;

export const Origem = z.enum(["hook", "skill", "agente"]);

/**
 * O vocabulário de `evento`, para as nove skills.
 *
 * Fonte única: `docs/contrato/CONTRATO-expx-eventos.md` é conferido contra este
 * enum por `src/nucleo/documentacao.test.ts` — a lista mora aqui e a tabela do
 * contrato precisa bater com ela, nunca o contrário.
 *
 * O bloco do planejamento e do replanejamento da execução entrou pelo catálogo
 * da `sprintx` congelada (`references/08-rastro.md`, "O que a skill grava"), que
 * já os gravava por `scripts/planejamento.sh` e `scripts/bloqueios.sh` enquanto
 * este enum reprovava a linha — um rastro legítimo contado como fora do contrato.
 */
export const EventoNome = z.enum([
  "fase_iniciada",
  "fase_concluida",
  "task_iniciada",
  "task_concluida",
  "task_bloqueada",
  // `scripts/planejamento.sh`: a task do B-NN volta de bloqueada a pendente
  // quando a rodada de replanejamento fecha.
  "task_reaberta",
  // `scripts/planejamento.sh`: o checkpoint do plano (fim de F2/F3/F4, cada
  // veredito da F5, e cada transição de replanejamento da execução).
  "checkpoint_planejamento",
  "replanejamento_execucao_iniciado",
  "replanejamento_execucao_retomado",
  "replanejamento_execucao_aprovado",
  "replanejamento_execucao_esgotado",
  "replanejamento_execucao_recusado",
  // `scripts/bloqueios.sh resolver`, ao gravar `resolvido_em`.
  "bloqueio_resolvido",
  "suite_executada",
  "arquivo_alterado",
  "regra_violada",
  "acao_bloqueada",
  "agente_iniciado",
  "agente_concluido",
  "veredito_emitido",
  "commit_criado",
  "pr_aberto",
]);

export const Agente = z.enum([
  "principal",
  "auditor-plano",
  "revisor-testes",
  "qa",
  "investigador",
  "cartografo",
  "revisor-diff",
  "analista-de-conflito",
  "avaliador-de-raio",
]);

/** Timestamp do rastro: ISO-8601 em UTC, com `Z` (R4). */
export const TimestampUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "ts deve ser AAAA-MM-DDTHH:MM:SSZ");

export const LinhaEvento = z
  .object({
    ts: TimestampUtc,
    expx_eventos: z.literal(1),
    trabalho_id: z.string().min(1),
    ferramenta: Ferramenta,
    origem: Origem,
    evento: EventoNome,
    fase: z.string().nullable(),
    task: z.string().nullable(),
    agente: Agente,
    resultado: z.string().min(1),
    detalhe: z.string(),
    arquivos: z.array(z.string()),
    hook: z.string().nullable().optional(),
    faixa: z.string().nullable().optional(),
    sessao: z.string().nullable().optional(),
    harness: z.string().nullable().optional(),
  })
  // Extras declaradas passam; o que não é declarado é reportado por
  // `chavesDesconhecidas`, não rejeitado — o rastro nunca trava trabalho.
  .passthrough();

export type LinhaEvento = z.infer<typeof LinhaEvento>;

export type DefeitoEvento = {
  linha: number;
  motivo: string;
};

/**
 * As doze chaves estão CONTIDAS na linha?
 *
 * Contenção, nunca igualdade de conjunto: um validador estrito reprova as
 * skills que usam extras legítimas — foi assim que a verificação da runx
 * passou a reprovar toda linha da mergex e da legadox.
 */
export function chavesFaltando(obj: Record<string, unknown>): string[] {
  return CHAVES_EVENTO.filter((c) => !(c in obj));
}

/** Chaves presentes que o contrato não declara — aviso, não erro. */
export function chavesDesconhecidas(obj: Record<string, unknown>): string[] {
  const conhecidas = new Set<string>([...CHAVES_EVENTO, ...EXTRAS_EVENTO]);
  return Object.keys(obj).filter((k) => !conhecidas.has(k));
}

export type ResultadoRastro = {
  linhas: number;
  defeitos: DefeitoEvento[];
  desconhecidas: string[];
};

/** Valida um arquivo `.jsonl` inteiro. Linha em branco é ignorada. */
export function validarRastro(conteudo: string): ResultadoRastro {
  const defeitos: DefeitoEvento[] = [];
  const desconhecidas = new Set<string>();
  let linhas = 0;

  conteudo.split("\n").forEach((bruta, i) => {
    if (!bruta.trim()) return;
    linhas += 1;
    const n = i + 1;

    let obj: unknown;
    try {
      obj = JSON.parse(bruta);
    } catch {
      defeitos.push({ linha: n, motivo: "JSON invalido" });
      return;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      defeitos.push({ linha: n, motivo: "a linha nao e um objeto JSON" });
      return;
    }

    const mapa = obj as Record<string, unknown>;
    const faltando = chavesFaltando(mapa);
    if (faltando.length > 0) {
      defeitos.push({
        linha: n,
        motivo: `chave omitida: ${faltando.join(", ")} (use null; R6)`,
      });
    }
    for (const k of chavesDesconhecidas(mapa)) desconhecidas.add(k);

    const r = LinhaEvento.safeParse(mapa);
    if (!r.success && faltando.length === 0) {
      const p = r.error.issues[0];
      const caminho = p?.path.join(".") ?? "";
      defeitos.push({
        linha: n,
        motivo: `${caminho ? caminho + ": " : ""}${p?.message ?? "estrutura invalida"}`,
      });
    }
  });

  return { linhas, defeitos, desconhecidas: [...desconhecidas].sort() };
}
