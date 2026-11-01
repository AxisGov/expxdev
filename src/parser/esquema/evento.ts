import { z } from "zod";
import { CLASSES } from "../../orquestracao/tipos.js";
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
 * liga a edição à task aberta. Opcionais no esquema porque têm TRÊS estados, e
 * `EVENTOS_COM_IDENTIDADE` (abaixo) é o único em que a ausência é defeito.
 */
export const EXTRAS_EVENTO = [
  "hook",
  "faixa",
  "sessao",
  "harness",
  "model",
  "effort",
  // A resolução da orquestração (CONTRATO-expx-orquestracao §11.1): o escritor
  // comum grava as sete primeiras desde a F3a; `invocacao`,
  // `modelos_observados` e `fora_da_politica` são do envelope da F3b.
  "resolucao_id",
  "classe_declarada",
  "classe_resolvida",
  "origem_classe",
  "alternativa",
  "origem_alternativa",
  "materializado",
  "invocacao",
  "modelos_observados",
  "fora_da_politica",
  // CONTRATO-expx-orquestracao §12.3 (F3c): só em `integridade_final_verificada`.
  "integridade_final",
] as const;

/**
 * Os eventos em que `sessao`/`harness` são OBRIGATÓRIAS — a reivindicação da task.
 *
 * Os três estados da identidade, pelo escritor da `sprintx` congelada
 * (`scripts/rastro.sh`, 4e1f7b88d85f3fe9f87ae578f7789760d92d6829) e pela tabela de
 * chaves extras do `CONTRATO-expx-eventos.md`:
 *
 *  - **obrigatórias** nestes três: são as únicas com `EXIGE_IDENTIDADE=1`, e sem
 *    identidade o escritor sai `3` e NÃO grava a linha. Uma delas sem identidade
 *    não reivindica nada, e a primeira edição da task para em `sessao_ambigua`
 *    (`hooks/sprintx/escopo-da-task.sh`) — é defeito de quem gravou, não dado
 *    faltando;
 *  - **`null`** em `fase_iniciada`/`fase_concluida`/`veredito_emitido`: o `else`
 *    do mesmo escritor grava `"sessao":null,"harness":null`;
 *  - **ausentes** no que `scripts/planejamento.sh`, `scripts/bloqueios.sh` e os
 *    hooks gravam: nenhum passa extras, e `_rastro_linha` só anexa o que recebe.
 *
 * Por isso a exigência é condicional, nunca global: global reprovaria a linha
 * legítima de todo hook — a mesma regressão que a nota das doze chaves narra.
 *
 * Condicionada também à `ferramenta`: a extra é declarada no contrato para o
 * escritor da `sprintx`. Outra skill que venha a emitir a reivindicação segue o
 * contrato dela, e nenhuma emite hoje.
 */
export const EVENTOS_COM_IDENTIDADE = ["task_iniciada", "task_concluida", "task_bloqueada"] as const;

/** A ferramenta cujo escritor deriva a identidade (contrato `expx-eventos`). */
const FERRAMENTA_COM_IDENTIDADE = "sprintx";

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
  // mergex (DM-227): a gravação de um artefato DERIVADO falhou — hoje o
  // `.expx/estado.json` da barra, no E0, E7, E8 e E9. Sai com `resultado: falha`
  // e `agente: principal`, e nunca interrompe a etapa. Entrou aqui para que o
  // rastro legítimo da mergex não seja contado como fora do contrato.
  "artefato_gravado",
  // CONTRATO-expx-orquestracao §8.2, passo 3: o envelope de uma invocação de
  // agente que nunca fechou. Declarado na F3a; quem o emite é a F3b.
  "invocacao_abandonada",
  // CONTRATO-expx-orquestracao §12 (F3c): o hook do núcleo
  // `expx-integridade-final.sh` compara a foto do início de um agente de
  // aprovação com a do fim. Evento próprio, e não `agente_concluido`: esse já é
  // gravado pela SprintX para todo subagente, e o aprovador ficaria com dois.
  "integridade_final_verificada",
  // runx (DR-55 e DR-91): o diagrama da ocorrência não foi gerado, por contradição
  // no E1 ou no E2, ou não foi atualizado no E3. O erro é registrado e ignorado.
  "diagrama_nao_gerado",
  "diagrama_nao_atualizado",
]);

export const Agente = z.enum([
  "principal",
  "auditor-plano",
  "sprintx-revisor-testes",
  "sprintx-investigador",
  "runx-revisor-testes",
  "runx-investigador",
  "qa",
  "legadox-cartografo",
  "avaliador-de-raio",
  "stackx-cartografo",
  "revisor-diff",
  "analista-de-conflito",
  "auditor-design",
  "cartografo-visual",
]);

/** Timestamp do rastro: ISO-8601 em UTC, com `Z` (R4). */
export const TimestampUtc = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "ts deve ser AAAA-MM-DDTHH:MM:SSZ");

/**
 * Os agentes de aprovação da lista transitória (CONTRATO-expx-orquestracao
 * §12.2) e a ferramenta com que o hook grava cada um. A F4 troca a lista pelo
 * `papel` da política.
 */
export const APROVADORES_INTEGRIDADE: Readonly<Record<string, string>> = {
  "revisor-diff": "mergex",
  qa: "runx",
  "runx-revisor-testes": "runx",
};

/** As partes da foto, na ordem em que `diferencas` as lista. */
export const PARTES_INTEGRIDADE = ["head", "status", "arvore"] as const;

/**
 * A extra `integridade_final` (CONTRATO-expx-orquestracao §12.3). `igual` e
 * `ausente` não têm diferença; `divergente` tem ao menos uma, sem repetição e na
 * ordem de `PARTES_INTEGRIDADE` — duas linhas do mesmo fato saem iguais.
 */
export const IntegridadeFinal = z
  .strictObject({
    estado: z.enum(["igual", "divergente", "ausente"]),
    diferencas: z.array(z.enum(PARTES_INTEGRIDADE)),
  })
  .refine(
    (i) => {
      const canonica = PARTES_INTEGRIDADE.filter((p) => i.diferencas.includes(p));
      const ordenada = canonica.length === i.diferencas.length && canonica.every((p, n) => i.diferencas[n] === p);
      return i.estado === "divergente" ? i.diferencas.length > 0 && ordenada : i.diferencas.length === 0;
    },
    { message: "diferencas: vazia em igual e ausente; em divergente, head, status, arvore nessa ordem e sem repetir" },
  );

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
    model: z.string().min(1).nullable().optional(),
    effort: z.string().min(1).nullable().optional(),
    resolucao_id: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    classe_declarada: z.enum(CLASSES).optional(),
    classe_resolvida: z.enum(CLASSES).optional(),
    origem_classe: z.enum(["declarada", "inferida", "agente", "tarefa"]).optional(),
    alternativa: z.string().min(1).optional(),
    origem_alternativa: z.enum(["projeto", "skill", "embutida", "sessao", "agentes-json-v1"]).optional(),
    materializado: z.strictObject({ model: z.string().min(1), effort: z.string().min(1).optional() }).optional(),
    invocacao: z.string().min(1).optional(),
    modelos_observados: z.array(z.string().min(1)).optional(),
    // presente só quando o executor saiu da cadeia; ausente nos demais casos
    fora_da_politica: z.literal(true).optional(),
    integridade_final: IntegridadeFinal.optional(),
  })
  // Extras declaradas passam; o que não é declarado é reportado por
  // `chavesDesconhecidas`, não rejeitado — o rastro nunca trava trabalho.
  .passthrough()
  // `materializado` só existe na exceção do `.expx/agentes.json` v1
  // (CONTRATO-expx-orquestracao §7.4): fora dela, é linha incoerente.
  .refine((l) => l.materializado === undefined || l.origem_alternativa === "agentes-json-v1", {
    message: "materializado só com origem_alternativa agentes-json-v1",
    path: ["materializado"],
  })
  // A verificação sem o resultado não diz nada; o resultado fora dela não tem dono.
  .refine((l) => (l.evento === "integridade_final_verificada") === (l.integridade_final !== undefined), {
    message: "integridade_final é obrigatória em integridade_final_verificada e só existe nele",
    path: ["integridade_final"],
  })
  // §12.3: `igual` é `ok`; `divergente` e `ausente` são `falha`, que invalida o veredito.
  .refine(
    (l) => l.integridade_final === undefined || l.resultado === (l.integridade_final.estado === "igual" ? "ok" : "falha"),
    { message: "resultado de integridade_final_verificada: ok com igual, falha com divergente ou ausente", path: ["resultado"] },
  )
  // §12.2: só os aprovadores da lista, cada um com a ferramenta dele.
  .refine((l) => l.evento !== "integridade_final_verificada" || APROVADORES_INTEGRIDADE[l.agente] === l.ferramenta, {
    message: "integridade_final_verificada só para revisor-diff (mergex), qa e runx-revisor-testes (runx)",
    path: ["agente"],
  });

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

/**
 * A identidade que ESTA linha exige e não traz.
 *
 * Vazio quando a linha não exige identidade — e aí ausente e `null` são os dois
 * estados válidos, não omissão. `""` conta como ausência: é o mesmo dado que
 * falta, escrito de outro jeito.
 */
export function identidadeFaltando(obj: Record<string, unknown>): string[] {
  if (obj["ferramenta"] !== FERRAMENTA_COM_IDENTIDADE) return [];
  if (!EVENTOS_COM_IDENTIDADE.includes(obj["evento"] as (typeof EVENTOS_COM_IDENTIDADE)[number])) {
    return [];
  }
  return ["sessao", "harness"].filter((k) => {
    const v = obj[k];
    return typeof v !== "string" || v === "";
  });
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

    // A identidade da reivindicação: condição do contrato, não estrutura da
    // linha — por isso aqui, e não no `LinhaEvento`. O painel (`lerRastro`)
    // descarta o que o esquema reprova, e sumir com a linha que diz quem abriu a
    // task esconderia justamente o que ela existe para contar. Aqui o `doctor`
    // avisa quem gravou, e a linha segue na tela.
    const semIdentidade = faltando.length === 0 ? identidadeFaltando(mapa) : [];
    if (semIdentidade.length > 0) {
      defeitos.push({
        linha: n,
        motivo:
          `${semIdentidade.join(", ")}: a reivindicacao da task exige a identidade da ` +
          `sessao, que scripts/rastro.sh deriva (sem ela ele nao grava a linha)`,
      });
    }

    const r = LinhaEvento.safeParse(mapa);
    // Causas independentes contam separado: a identidade que falta não esconde um
    // `ts` fora do formato na mesma linha.
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
