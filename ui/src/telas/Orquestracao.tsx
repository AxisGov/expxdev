import type { JSX } from "react";
import type { Evento, ResolucaoNoPainel } from "../tipos.js";
import { Etiqueta } from "../comuns.js";
import { visaoDaOrquestracao, type Destaque, type IntegridadeNaVisao, type LinhaInvocacao } from "../orquestracao.js";

const ROTULO_ESTADO: Record<LinhaInvocacao["estado"], string> = {
  concluida: "concluída", lancada: "lançada", falha: "falha", abandonada: "abandonada", repetida: "repetida",
};

function instante(ts: string): string {
  return ts.replace("T", " ").replace(/Z$/, " UTC");
}

function Destaques({ destaques }: { destaques: readonly Destaque[] }): JSX.Element | null {
  if (destaques.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
      {destaques.map((d) => <Etiqueta key={d.texto} tipo={d.nivel}>{d.texto}</Etiqueta>)}
    </div>
  );
}

function textoIntegridade(i: IntegridadeNaVisao | null): string {
  if (i === null) return "—";
  return i.diferencas.length > 0 ? `${i.estado}: ${i.diferencas.join(", ")}` : i.estado;
}

function Declarada({ l }: { l: LinhaInvocacao }): JSX.Element {
  if (l.declarada === null) return <span className="dep">—</span>;
  return (
    <>
      <div className="mono">{l.declarada.classe}</div>
      {l.declarada.inferida ? <div className="dep">inferida do modelo do frontmatter</div> : null}
    </>
  );
}

function Resolvida({ l }: { l: LinhaInvocacao }): JSX.Element {
  const r = l.resolvida;
  if (r === null) return <span className="dep">—</span>;
  const elevada = r.origem_classe === "agente" || r.origem_classe === "tarefa";
  return (
    <>
      <div className="mono">{r.classe}{elevada ? ` (elevada por ${r.origem_classe})` : ""}</div>
      <div className="mono">{[r.alternativa.id, r.alternativa.model, r.alternativa.effort].filter(Boolean).join(" · ")}</div>
      <div className="dep">origem: {r.origem_alternativa}</div>
      {r.materializado !== null ? (
        <div className="dep">materializado: {[r.materializado.model, r.materializado.effort].filter(Boolean).join(" · ")}</div>
      ) : null}
    </>
  );
}

function Observada({ l }: { l: LinhaInvocacao }): JSX.Element {
  if (l.observada === null) return <span className="dep">{l.estado === "abandonada" || l.estado === "repetida" ? "—" : "não informado"}</span>;
  return <div className="mono">{l.observada.join(", ")}</div>;
}

/**
 * A visão da invocação (CONTRATO-expx-orquestracao §11.5), recolhível dentro do
 * Detalhe. Só aparece quando o rastro do trabalho tem invocação ou integridade
 * final; abre sozinha quando há destaque vermelho.
 */
export function SecaoOrquestracao({
  eventos,
  resolucoes,
}: {
  eventos: readonly Evento[];
  resolucoes: Readonly<Record<string, ResolucaoNoPainel | null>>;
}): JSX.Element | null {
  const { invocacoes, orfas } = visaoDaOrquestracao(eventos, resolucoes);
  if (invocacoes.length === 0 && orfas.length === 0) return null;
  const todos = [...invocacoes, ...orfas].flatMap((x) => x.destaques);
  const vermelhos = todos.filter((d) => d.nivel === "bug").length;

  return (
    <details className="painel-det" open={vermelhos > 0} {...(vermelhos > 0 ? { style: { borderColor: "var(--alerta)" } } : {})}>
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 560 }}>
        Orquestração
        <span className="dep">
          {" "}· {invocacoes.length} invocação(ões)
          {orfas.length > 0 ? ` · ${String(orfas.length)} integridade(s) sem invocação` : ""}
          {vermelhos > 0 ? ` · ${String(vermelhos)} destaque(s)` : ""}
        </span>
      </summary>
      <div className="dep" style={{ marginTop: 9, marginBottom: 7 }}>
        Declarada e resolvida vêm do registro <code>.expx/resolucoes/</code>; observada é o que o
        runtime informou. O painel não rejulga a política. Só a janela do rastro que o painel lê
        entra aqui: um par que não aparece pode estar fora dela.
      </div>
      {invocacoes.length === 0 ? (
        <div className="dep">Sem envelope da invocação neste rastro (política inativa ou nenhuma chamada gerenciada); só as integridades finais.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Invocação</th>
              <th>Declarada</th>
              <th>Resolvida</th>
              <th>Observada</th>
              <th>Integridade final</th>
            </tr>
          </thead>
          <tbody>
            {invocacoes.map((l) => (
              <tr key={l.invocacao}>
                <td>
                  <div><strong style={{ fontWeight: 560 }}>{l.agente}</strong>{l.papel !== null ? <span className="dep"> · {l.papel}</span> : null}</div>
                  <div className="dep">{ROTULO_ESTADO[l.estado]} · <time dateTime={l.ts}>{instante(l.ts)}</time></div>
                  <Destaques destaques={l.destaques} />
                </td>
                <td><Declarada l={l} /></td>
                <td><Resolvida l={l} /></td>
                <td><Observada l={l} /></td>
                <td className="mono">{textoIntegridade(l.integridade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {orfas.length > 0 ? (
        <>
          <h4 style={{ margin: "13px 0 6px", fontSize: 12.5 }}>Integridades finais sem invocação na janela</h4>
          {orfas.map((o, i) => (
            <div key={`${o.ts}-${String(i)}`} style={{ fontSize: 13, marginBottom: 6 }}>
              <strong style={{ fontWeight: 560 }}>{o.agente}</strong>
              {o.papel !== null ? <span className="dep"> · {o.papel}</span> : null}
              <span className="dep"> · <time dateTime={o.ts}>{instante(o.ts)}</time></span>
              <span className="mono"> · {textoIntegridade(o.integridade)}</span>
              <Destaques destaques={o.destaques} />
            </div>
          ))}
        </>
      ) : null}
    </details>
  );
}
