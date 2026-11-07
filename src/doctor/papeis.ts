import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lock } from "../nucleo/lock.js";
import { lerPapelDoAgente } from "../orquestracao/materializar.js";
import { agenteDoRastro, CAMINHO_PAPEIS, lerPapeis } from "../orquestracao/papeis.js";
import { hashDeBytes } from "../plugin/plano.js";
import type { Achado } from "./verificadores.js";

/**
 * `papeis-projecao-divergente` (CONTRATO-expx-instalacao §5.3, F4): a projeção
 * dos papéis confere com os agentes que o `init` instalou. Fala com ou sem
 * política, porque a integridade final roda nos dois regimes.
 *
 * O esperado sai das cópias em `.claude/agents/` que o lock travou e que ainda
 * batem com o hash dele: a cópia alterada já é `artefato-alterado`, e o papel
 * escrito nela não é o do plano, então ela não decide nada aqui. O lock não guarda
 * a skill de cada agente: a coluna da skill é provada pelo hash da projeção que o
 * plano escreveu (`instalacao.papeis`). No lock anterior à F4, sem o hash, ela só
 * precisa ser uma skill do lock. O agente fora do vocabulário do rastro, que o
 * plano deixa de fora, também fica fora do esperado.
 */
export function verificarPapeis(raiz: string, lock: Lock | undefined, push: (a: Achado) => void): void {
  const arquivos = lock?.instalacao?.arquivos;
  if (arquivos === undefined) return;
  const esperado = new Map<string, string>();
  const incertos = new Set<string>();
  for (const [rel, hash] of Object.entries(arquivos)) {
    if (!/^\.claude\/agents\/[^/]+\.md$/.test(rel)) continue;
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(raiz, ...rel.split("/")));
    } catch {
      continue;
    }
    const lido = lerPapelDoAgente(rel, bytes.toString("utf8"));
    if (!lido.ok) continue;
    if (hashDeBytes(bytes) !== hash) incertos.add(lido.nome);
    else if (lido.papel !== undefined && agenteDoRastro(lido.nome)) esperado.set(lido.nome, lido.papel);
  }

  const caminho = join(raiz, ...CAMINHO_PAPEIS.split("/"));
  const correcao = "rode `expx init`, que regrava a projecao a partir dos agentes das skills; nao a edite a mao";
  if (!existsSync(caminho)) {
    if (esperado.size > 0) {
      push({
        id: "papeis-projecao-divergente",
        severidade: "erro",
        problema: `${CAMINHO_PAPEIS} ausente, com agente de papel instalado (${[...esperado.keys()].sort().join(", ")}): a integridade final e o primeiro plano deixam de valer para eles`,
        correcao,
      });
    }
    return;
  }
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch {
    texto = "";
  }
  const lida = lerPapeis(texto);
  if (!lida.ok) {
    push({ id: "papeis-projecao-divergente", severidade: "erro", problema: `${CAMINHO_PAPEIS} ilegivel: ${lida.erro}`, correcao });
    return;
  }
  const travado = lock?.instalacao?.papeis?.hash;
  if (travado !== undefined && hashDeBytes(texto) !== travado) {
    push({
      id: "papeis-projecao-divergente",
      severidade: "erro",
      problema: `${CAMINHO_PAPEIS} difere da que o init escreveu (hash do lock): a skill ou o papel de algum agente foi trocado`,
      correcao,
    });
    return;
  }
  if (esperado.size === 0 && incertos.size === 0) {
    push({
      id: "papeis-projecao-divergente",
      severidade: "aviso",
      problema: `${CAMINHO_PAPEIS} sobrou sem nenhum agente de papel instalado: um hook leria papel de agente que nao existe`,
      correcao,
    });
    return;
  }
  const skills = new Set(Object.keys(lock?.skills ?? {}));
  const divergencias: string[] = [];
  const naProjecao = new Set<string>();
  for (const i of lida.itens) {
    naProjecao.add(i.agente);
    if (incertos.has(i.agente)) continue;
    const quer = esperado.get(i.agente);
    if (quer === undefined) divergencias.push(`${i.agente}: na projecao, sem papel nos agentes instalados`);
    else if (quer !== i.papel) divergencias.push(`${i.agente}: papel ${i.papel} na projecao, ${quer} no agente`);
    if (!skills.has(i.skill)) divergencias.push(`${i.agente}: skill ${i.skill} fora do lock`);
  }
  for (const agente of [...esperado.keys()].sort()) {
    if (!naProjecao.has(agente)) divergencias.push(`${agente}: papel ${esperado.get(agente) ?? ""} no agente, fora da projecao`);
  }
  if (divergencias.length > 0) {
    push({
      id: "papeis-projecao-divergente",
      severidade: "erro",
      problema: `${CAMINHO_PAPEIS} diverge dos agentes instalados: ${divergencias.join("; ")}`,
      correcao,
    });
  }
}
