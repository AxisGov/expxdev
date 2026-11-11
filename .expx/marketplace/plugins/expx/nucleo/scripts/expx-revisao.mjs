// Revisão por task pela CLI do CodeAnt (contrato expx-revisao), cópia do expxdev.
//   node expx-revisao.mjs revisar --trabalho <slug> --task <T-NN.MM> --arquivos <a,b,...> [--base-commit <sha>] [--raiz <dir>]
//   node expx-revisao.mjs conferir --trabalho <slug> --modo <obrigatoria|se_disponivel|desligada> --task <T-NN.MM>=<sha> [...]
//   node expx-revisao.mjs rejeitar --trabalho <slug> --task <T-NN.MM> --identidade <hex> --motivo <texto>
//   node expx-revisao.mjs listar --trabalho <slug> --task <T-NN.MM>=<sha> [...]
// revisar: grava docs/entregas/<slug>/revisao/<T-NN.MM>.json (evidência v2; v3 na escala para o Codex, com a CodeAnt
// fora); sai 0 (ok), 1 (achado aberto),
// 2 (indisponivel), 3 (incompleta). conferir: 0 (ok), 1 (FALHA), 3 (só AVISO). listar (só leitura): uma linha de JSON
// `expx_revisao_listar: 1` com os rejeitados, as rejeições e os removidos da evidência que o `conferir` aceita; 0
// (todas listadas), 1 (alguma inválida), 3 (alguma ausente). Uso errado, inclusive
// `FATIA_*` no ambiente: 64. Evidência travada: 75. Erro interno (exceção não tratada), em qualquer subcomando: 70. Uma chamada só da CLI (sem lotes), pelo arquivo do pacote conferido; a
// resposta é reconciliada com a task (contrato expx-revisao v2); a evidência guarda as `issues` cruas, e o
// `conferir` deriva delas os achados. Nunca lê credencial da CLI.
// EXPX_REVISAO_TESTE_PAUSA é só para teste: um diretório em que o `revisar` cria `pronto` e espera
// `continuar` entre a releitura e a gravação.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync,
  writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { conferirIntegridade, excluido, EXCLUIDOS_DO_NUCLEO, fatiaNoAmbiente, homologadas, localizarPacote, medir, mensagemFatia,
  motivoAceito, perfilCli, revisavel } from "./expx-limites.mjs";

const OBRIGATORIOS = { revisar: ["task", "arquivos"], conferir: ["modo", "task"], rejeitar: ["task", "identidade", "motivo"], listar: ["task"] };
function uso(msg) {
  process.stderr.write(`expx-revisao: ${msg}\nuso: node expx-revisao.mjs revisar|conferir|rejeitar|listar --trabalho <slug> ... (cabecalho do script)\n`);
  process.exit(64);
}
const [cmd, ...args] = process.argv.slice(2);
// `FATIA_*` são reservados para sempre (emenda de 2026-10-19): nenhum limite nem exclusão vem do ambiente
const fatia = fatiaNoAmbiente(process.env);
if (fatia.length > 0) {
  process.stderr.write(fatia.map((n) => `expx-revisao: ${mensagemFatia(n)}\n`).join(""));
  process.exit(64);
}
if (!Object.hasOwn(OBRIGATORIOS, cmd ?? "")) uso(`subcomando desconhecido: ${cmd ?? "(nenhum)"}`);
const op = { raiz: process.cwd(), tasks: [] };
for (let i = 0; i < args.length; i += 2) {
  if (!/^--(raiz|trabalho|task|arquivos|modo|identidade|motivo|base-commit)$/.test(args[i])) uso(`argumento desconhecido: ${args[i]}`);
  if (args[i + 1] === undefined) uso(`${args[i]} exige valor`);
  op[args[i].slice(2)] = args[i + 1];
  if (args[i] === "--task") op.tasks.push(args[i + 1]);
  // o `listar` não depende do modo nem grava nada: só `--trabalho`, `--task` e `--raiz`
  if (cmd === "listar" && !/^--(raiz|trabalho|task)$/.test(args[i])) uso(`${args[i]} nao vale no listar`);
}
// `--arquivos` não é aparado: espaço é parte do nome
for (const k of ["trabalho", ...OBRIGATORIOS[cmd]]) if (!(k === "arquivos" ? op[k] : op[k]?.trim())) uso(`--${k} obrigatorio`);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(op.trabalho)) uso(`trabalho invalido: ${op.trabalho}`);
// id `T-NN.MM` da sprintx/runx (sprint.task) ou o legado `T-<dígitos>` (como antes); vira nome de arquivo, então nada além disso
const TASK = ["conferir", "listar"].includes(cmd) ? /^T-(\d+|\d{2}\.\d{2})=[^\s:]+$/ : /^T-(\d+|\d{2}\.\d{2})$/;
for (const t of op.tasks) if (!TASK.test(t)) uso(`task invalida: ${t}`);
if (!["conferir", "listar"].includes(cmd) && op.tasks.length > 1) uso("--task uma vez so");
if (cmd === "conferir" && !["obrigatoria", "se_disponivel", "desligada"].includes(op.modo)) uso(`modo invalido: ${op.modo}`);
if (cmd === "rejeitar" && !/^[0-9a-f]{64}$/.test(op.identidade)) uso(`identidade invalida: ${op.identidade}`);
if (op["base-commit"] !== undefined && cmd !== "revisar") uso("--base-commit so no revisar");

const pasta = join(op.raiz, "docs", "entregas", op.trabalho, "revisao");
const caminhoEv = (task) => join(pasta, `${task}.json`);
const le = (f) => { try { return JSON.parse(readFileSync(f, "utf8").replace(/^\uFEFF/, "")); } catch { return undefined; } };
// todo caminho dado ao git é literal: glob (`src/[id].ts`) ou pathspec mágico (`:(top)x`) no nome trariam os
// hunks de outro arquivo, ou nenhum, e o achado em linha alterada viraria `anterior`
const GIT_ENV = { ...process.env, GIT_LITERAL_PATHSPECS: "1" };
// a saída de listas (`diff --name-only`, `ls-tree -r`) passa de 1 MiB, o padrão do `spawnSync`, em commit grande: cortada, o
// git daria por falha (e um commit coberto por não verificável); blob nunca vem por aqui (`blobGit`, limitado)
const git = (...a) => spawnSync("git", a, { cwd: op.raiz, encoding: "utf8", env: GIT_ENV, maxBuffer: 256 << 20 });
// Nada acima de LEITURA_MAXIMA vai inteiro à memória. É muito acima de L2 (204.800 bytes), e a decodificação da CLI
// nunca encolhe o conteúdo (cada sequência UTF-8 inválida, de até 3 bytes, vira um U+FFFD, de 3): o que passa dele já
// reprova L2 só pelo tamanho, e a medida fica o tamanho em bytes, com as linhas desconhecidas (`null`).
const LEITURA_MAXIMA = 1 << 20;
/** O blob `ref`, ou undefined se o git falha ou ele passa de LEITURA_MAXIMA. */
function blobGit(ref) {
  const r = spawnSync("git", ["cat-file", "blob", ref], { cwd: op.raiz, maxBuffer: LEITURA_MAXIMA, env: GIT_ENV });
  return r.error || r.status !== 0 ? undefined : r.stdout;
}
/** A medida da CLI do blob `ref` (`{linhas, bytes}`); acima de LEITURA_MAXIMA, `{linhas: null, bytes: <tamanho>}` sem lê-lo;
 *  undefined se o git não o lê (nunca uma medida de 0 bytes). */
function medirBlob(ref) {
  const r = git("cat-file", "-s", ref);
  const tamanho = r.status === 0 ? Number(r.stdout.trim()) : NaN;
  if (!Number.isSafeInteger(tamanho)) return undefined;
  if (tamanho > LEITURA_MAXIMA) return { linhas: null, bytes: tamanho };
  const conteudo = blobGit(ref);
  return conteudo ? medir(conteudo) : undefined;
}
/** A medida da CLI do arquivo do checkout, pela mesma regra de `medirBlob`: lê no máximo LEITURA_MAXIMA + 1 bytes, mesmo
 *  que o arquivo cresça durante a leitura. Undefined se ele não abre ou não se lê (apagado ou trocado por pasta depois do
 *  `hash-object`): quem mede dá a falta como `arquivo-inexistente` ou `arquivo-mudou-durante-revisao`, nunca uma exceção. */
function medirArquivo(f) {
  let fd;
  try { fd = openSync(join(op.raiz, f), "r"); } catch { return undefined; }
  try {
    const buf = Buffer.alloc(LEITURA_MAXIMA + 1);
    let n = 0;
    for (let k; n < buf.length && (k = readSync(fd, buf, n, buf.length - n, null)) > 0;) n += k;
    return n > LEITURA_MAXIMA ? { linhas: null, bytes: Math.max(n, fstatSync(fd).size) } : medir(buf.subarray(0, n));
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

// `\` é separador só no Windows; fora dele é parte do nome, e trocá-lo daria por ausente um arquivo que existe
const caminho = (f) => (process.platform === "win32" ? f.replace(/\\/g, "/") : f).replace(/^\.\//, "");
/** O primeiro diretório de `f` (relativo a `raiz`) que é link simbólico: por ele o caminho sairia da raiz. */
function linkNoCaminho(raiz, f) {
  const partes = f.split("/");
  for (let i = 1; i < partes.length; i++) {
    const d = join(raiz, ...partes.slice(0, i));
    try { if (lstatSync(d).isSymbolicLink()) return partes.slice(0, i).join("/"); } catch { return undefined; }
  }
  return undefined;
}
const pausa = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const velha = (d) => { try { return Date.now() - statSync(d).mtimeMs > 120000; } catch { return false; /* sumiu */ } };
const caminhoDono = (trava) => join(trava, "dono.json");
function donoDaTrava(trava) {
  try {
    const d = JSON.parse(readFileSync(caminhoDono(trava), "utf8"));
    return Number.isSafeInteger(d.pid) && d.pid > 0 && typeof d.token === "string" ? d : undefined;
  } catch { return undefined; }
}
function processoVivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code !== "ESRCH"; }
}
/** Só uma trava velha com dono identificável e comprovadamente morto pode ser quebrada.
 *  Trava sem dono legível pode ser de um processo entre mkdir e a gravação: falha fechado. */
function abandonada(trava) {
  if (!velha(trava)) return undefined;
  const dono = donoDaTrava(trava);
  return dono && !processoVivo(dono.pid) ? dono : undefined;
}
/** Serializa a quebra e relê dono+token sob a trava auxiliar. Nunca remove uma trava viva ou substituída. */
function quebra(trava) {
  const antes = abandonada(trava);
  if (!antes) return;
  const q = `${trava}.quebra`;
  try { mkdirSync(q); } catch (e) {
    if (e.code !== "EEXIST") throw e;
    return;
  }
  try {
    const depois = abandonada(trava);
    if (depois?.token === antes.token) rmSync(trava, { recursive: true, force: true });
  } finally {
    rmSync(q, { recursive: true, force: true });
  }
}
/** Trava por evidência (`mkdir` é exclusivo): dono vivo nunca é removido por idade. */
function comTrava(task, fn) {
  mkdirSync(pasta, { recursive: true });
  const trava = `${caminhoEv(task)}.trava`;
  const meuDono = { pid: process.pid, token: randomUUID(), iniciado_em: new Date().toISOString() };
  for (const ate = Date.now() + 30000; ; pausa(50)) {
    try {
      mkdirSync(trava);
      try { writeFileSync(caminhoDono(trava), JSON.stringify(meuDono)); }
      catch (e) { rmSync(trava, { recursive: true, force: true }); throw e; }
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (abandonada(trava)) quebra(trava);
      if (Date.now() > ate) {
        const detalhe = existsSync(`${trava}.quebra`) ? `${trava}.quebra` : trava;
        process.stderr.write(`expx-revisao: evidencia travada por outro processo: ${detalhe} (remova a mao somente se nenhum processo estiver rodando)\n`);
        process.exit(75);
      }
    }
  }
  try { return fn(); } finally {
    if (donoDaTrava(trava)?.token === meuDono.token) rmSync(trava, { recursive: true, force: true });
  }
}
// Só para teste (cabeçalho): nada do ambiente é executado; valor que não é diretório é ignorado.
function pausaDeTeste() {
  const dir = process.env.EXPX_REVISAO_TESTE_PAUSA;
  if (!dir || !statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return;
  writeFileSync(join(dir, "pronto"), "");
  for (const ate = Date.now() + 10000; Date.now() < ate && !existsSync(join(dir, "continuar"));) pausa(50);
}
/** Grava por arquivo temporário + rename: ninguém lê evidência pela metade. */
function grava(task, ev) {
  const tmp = `${caminhoEv(task)}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ev, null, 2)}\n`);
  renameSync(tmp, caminhoEv(task));
}
/** A CLI: o arquivo do pacote conferido, pelo `node`; nunca o `codeant` do PATH depois da conferência. */
// EXPX_REVISAO_TESTE_TEMPO_CLI é só para teste: o prazo da CLI em milissegundos, no lugar dos 15 minutos.
const TEMPO_DA_CLI = Number(process.env.EXPX_REVISAO_TESTE_TEMPO_CLI) > 0 ? Number(process.env.EXPX_REVISAO_TESTE_TEMPO_CLI) : 15 * 60 * 1_000;
/** A CLI que não responde no prazo é morta e a revisão falha fechado, em vez de esperar para sempre. */
const codeant = (bin, a, cwd = op.raiz) => spawnSync(process.execPath, [bin, ...a], {
  cwd, maxBuffer: 64 << 20, timeout: TEMPO_DA_CLI, killSignal: "SIGKILL",
});
const SNAPSHOT_PREFIXO = "expx-revisao-snapshot-";
const UMA_HORA = 60 * 60 * 1_000;
/** O `dono` é a prova de que o snapshot é deste script: nasce antes do `worktree add`, e sem ele nada se apaga,
 *  porque o `--force` levaria arquivo de quem usou o mesmo nome. Com dono: o processo vive, até um dia, porque o
 *  PID pode ter sido reusado e a CLI morre em 15 minutos. */
function snapshotAbandonado(base) {
  let idade, dono;
  try {
    idade = Date.now() - statSync(base).mtimeMs;
    dono = Number(readFileSync(join(base, "dono"), "utf8"));
  } catch { return false; }
  if (!Number.isSafeInteger(dono) || dono <= 0) return false;
  if (idade > 24 * UMA_HORA) return true;
  try { process.kill(dono, 0); return false; } catch (e) { return e?.code === "ESRCH"; }
}
/** SIGKILL ou queda da máquina pulam o `finally`, e o worktree fica registrado, segurando o commit. */
function limparSnapshotsAbandonados() {
  const lista = git("worktree", "list", "--porcelain");
  if (lista.status !== 0) return;
  const real = (c) => { try { const r = realpathSync.native(c); return process.platform === "win32" ? r.toLowerCase() : r; } catch { return undefined; } };
  const temporario = real(tmpdir());
  for (const linha of lista.stdout.split(/\r?\n/)) {
    if (!linha.startsWith("worktree ")) continue;
    const raiz = linha.slice("worktree ".length);
    const base = dirname(raiz);
    if (basename(raiz) !== "checkout" || !basename(base).startsWith(SNAPSHOT_PREFIXO)) continue;
    // Só o que este script cria: outro worktree com nome parecido, fora do temporário, não é assunto daqui.
    if (temporario === undefined || real(dirname(base)) !== temporario || !snapshotAbandonado(base)) continue;
    // O Git recusa o travado, e a pasta fica: apagar deixaria o registro para trás.
    if (git("worktree", "remove", "--force", raiz).status !== 0) continue;
    rmSync(base, { recursive: true, force: true });
  }
}
/** Materializa o HEAD capturado em worktree descartável e sobrepõe os blobs medidos.
 *  A CLI nunca lê o checkout mutável que o usuário pode editar e restaurar durante a revisão. */
function snapshotDaRevisao(head, blobs) {
  limparSnapshotsAbandonados();
  const base = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIXO));
  const raiz = join(base, "checkout");
  writeFileSync(join(base, "dono"), String(process.pid));
  let vinculado = false;
  const limpar = () => {
    if (vinculado) git("worktree", "remove", "--force", raiz);
    rmSync(base, { recursive: true, force: true });
    git("worktree", "prune");
  };
  if (head) {
    const add = git("worktree", "add", "--detach", raiz, head);
    if (add.status !== 0) {
      process.stderr.write(`expx-revisao: snapshot do HEAD não criado: ${add.stderr ?? ""}`);
      limpar();
      return undefined;
    }
    vinculado = true;
  } else {
    const init = spawnSync("git", ["init", "-q", raiz], { cwd: base, encoding: "utf8" });
    if (init.status !== 0) {
      process.stderr.write(`expx-revisao: snapshot sem HEAD não criado: ${init.stderr ?? ""}`);
      limpar();
      return undefined;
    }
  }
  try {
    for (const [f, oid] of blobs) {
      const conteudo = blobGit(oid);
      if (conteudo === undefined) throw new Error(`blob ilegível: ${f}`);
      const destino = join(raiz, f);
      const rel = relative(raiz, destino);
      if (rel === "" || rel.split(/[\\/]/)[0] === ".." || isAbsolute(rel)) throw new Error(`caminho fora do snapshot: ${f}`);
      // um diretório versionado como link levaria o rmSync e a escrita para fora do snapshot
      if (linkNoCaminho(raiz, f) !== undefined) throw new Error(`caminho atravessa link no snapshot: ${f}`);
      rmSync(destino, { recursive: true, force: true });
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, conteudo);
    }
    return { raiz, limpar };
  } catch (e) {
    process.stderr.write(`expx-revisao: snapshot incompleto: ${e?.message ?? e}\n`);
    limpar();
    return undefined;
  }
}
const ORIENTACAO = "instale a homologada (npm i -g codeant-cli@0.5.14)";
/** O pacote do `codeant` do PATH, homologado e íntegro (`{bin, versao, perfil}`), ou o motivo de `indisponivel`. */
function cliConferida() {
  const loc = localizarPacote(process.env, process.platform);
  if (!loc.ok) {
    process.stderr.write(`expx-revisao: ${loc.motivo}: ${loc.detalhe}; ${ORIENTACAO}\n`);
    return { motivo: loc.motivo };
  }
  const perfil = perfilCli(loc.versao);
  if (!perfil) {
    process.stderr.write(`expx-revisao: versao ${loc.versao} nao homologada; ${ORIENTACAO} ou homologue a nova\n`);
    return { motivo: "versao", versao: loc.versao };
  }
  const diferenca = conferirIntegridade(loc.pacote, perfil);
  if (diferenca) {
    process.stderr.write(`expx-revisao: integridade: ${diferenca} em ${loc.pacote}; ${ORIENTACAO}\n`);
    return { motivo: "integridade", versao: loc.versao };
  }
  return { bin: loc.bin, versao: loc.versao, perfil };
}
// Escala (contrato expx-revisao, "Escala para o Codex"): a CodeAnt fora por um destes motivos, o Codex revisa o mesmo
// snapshot. Erro de quem chama, snapshot, corrida de arquivo e cobertura parcial (`incompleta`) nunca escalam.
const ESCALAVEIS = ["cli-ausente", "versao", "integridade", "acesso-negado", "tempo-esgotado", "erro"];
const MODELO_CODEX = "gpt-5.6-terra";
// os dois fora: `<motivo da CodeAnt>+<um destes>`, e só estes
const MOTIVOS_CODEX = ["codex-ausente", "codex-sem-login", "codex-erro", "codex-tempo-esgotado", "codex-saida-invalida"];
// 2 (0.14.2): a mensagem entra na identidade (login#81); a 1 (0.14.0 e 0.14.1) continua conferida pela regra dela
const FORMATO_CODEX = 2;
// a severidade é só informação: todo achado em linha alterada conta, como na CodeAnt
const SEVERIDADES = ["critica", "alta", "media", "baixa"];
const SCHEMA_CODEX = { type: "object", additionalProperties: false, required: ["arquivos_revisados", "issues"], properties: {
  arquivos_revisados: { type: "array", items: { type: "string" } },
  issues: { type: "array", items: { type: "object", additionalProperties: false, required: ["arquivo", "linha", "severidade", "mensagem"], properties: {
    arquivo: { type: "string" }, linha: { type: "integer" }, severidade: { type: "string", enum: SEVERIDADES }, mensagem: { type: "string" } } } } } };
/** O pedido fixo ao Codex: o mesmo texto no `revisar` e no `conferir` (o `prompt_sha256` o amarra). `base` é o
 *  `--base-commit`, `HEAD` sem ele, ou `null` no repositório sem commit. */
function pedidoAoCodex(base, arquivos) {
  return [
    "Revise as mudanças de uma task de código neste repositório. Só leitura: não altere nenhum arquivo e não rode comando que escreva.",
    base
      ? `As mudanças são as desde ${base}: \`git diff ${base} -- <arquivo>\` para o arquivo que existe em ${base}; o que não existe nele é novo, e o arquivo inteiro é a mudança.`
      : "O repositório não tem commit: cada arquivo é novo, e o arquivo inteiro é a mudança.",
    "Os arquivos da task, e só eles:",
    ...arquivos.map((f) => `- ${f}`),
    "Aponte só defeito de correção, de segurança ou regressão que a mudança introduz. Nunca estilo, nome, formatação, comentário ou preferência. Na dúvida, não aponte.",
    "Responda só com o JSON do schema: `arquivos_revisados` com exatamente os arquivos da lista que você revisou, e `issues` com um item por defeito: `arquivo` (um da lista), `linha` (o número da linha no arquivo como está agora), `severidade` (critica, alta, media ou baixa) e `mensagem` (o defeito e o porquê, em uma ou duas frases). Sem defeito, `issues` vazia.",
  ].join("\n");
}
const baseDoPedido = (ev) => (ev.modo === "base-commit" ? ev.base_commit : ev.head ? "HEAD" : null);
/** A resposta do Codex na forma do schema, ou undefined: texto livre e campo a mais ou a menos nunca passam. */
function respostaDoCodex(r) {
  const chaves = (o, k) => Object.keys(o).sort().join() === k;
  return ehMapa(r) && chaves(r, "arquivos_revisados,issues") && Array.isArray(r.arquivos_revisados) && r.arquivos_revisados.every((f) => typeof f === "string")
    && Array.isArray(r.issues) && r.issues.every((i) => ehMapa(i) && chaves(i, "arquivo,linha,mensagem,severidade") && typeof i.arquivo === "string"
      && Number.isSafeInteger(i.linha) && SEVERIDADES.includes(i.severidade) && typeof i.mensagem === "string") ? r : undefined;
}
/** As `issues` do Codex na forma da CodeAnt, para o `derivar`: a identidade não depende da severidade. */
/** Toda issue do Codex num arquivo enviado (o pedido só nomeia esses). */
const issuesNaTask = (issues, enviados) => issues.every((i) => enviados.includes(i.arquivo));
// no formato 2, o hash da mensagem entra na identidade: o `label` é sempre `codex`, e dois defeitos na mesma linha colidiam
// (um `rejeitar` calava os dois). O custo, aceito: o Codex que redescreve o ponto reabre o achado, nunca o cala
const issuesDoCodex = (issues) => issues.map((i) => ({ relevant_file: i.arquivo, start_line: i.linha, label: "codex", issue_content: i.mensagem }));
/** A parte extra da identidade do Codex no `formato` (o sha256 da mensagem no 2), ou nenhuma: a issue crua nunca a dá. */
const extraDoCodex = (formato) => (formato >= 2 ? (i) => sha256(String(i.issue_content)) : undefined);
const versaoDoRevisor = (r) => `codex:${r.versao}:${r.modelo}:${r.formato}`;
const mesmosArquivos = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === a.length && b.every((f) => a.includes(f));
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/** O `codex` que o shell rodaria, achado aqui para rodar e medir o mesmo arquivo: o primeiro do `PATH` (no POSIX, o
 *  `codex` executável; no Windows, `codex.com` ou `codex.exe`, senão o alvo do `codex.cmd` do npm,
 *  `node_modules/@openai/codex/...`, que roda pelo `node`, como a CodeAnt). `{exe, antes, caminho}` (`caminho` real, o
 *  que se mede) ou undefined. Não há gancho de teste (conselhos#315): o teste põe o falso no `PATH`. */
function localizarCodex() {
  const win = process.platform === "win32";
  const path = Object.entries(process.env).find(([k]) => (win ? k.toUpperCase() === "PATH" : k === "PATH"))?.[1] ?? "";
  const real = (f) => { try { return realpathSync(f); } catch { return undefined; } };
  const executavel = (f) => { try { const e = statSync(f); return e.isFile() && (win || (e.mode & 0o111) !== 0); } catch { return false; } };
  for (const d of path.split(win ? ";" : ":").filter(Boolean)) {
    for (const nome of win ? ["codex.com", "codex.exe"] : ["codex"]) {
      const f = real(join(d, nome));
      if (!f || !executavel(f)) continue;
      // o script do npm (`#!/usr/bin/env node`) entregaria o interpretador ao PATH: roda pelo node deste processo
      return scriptDeNode(f) ? { exe: process.execPath, antes: [f], caminho: f } : { exe: f, antes: [], caminho: f };
    }
    if (!win) continue;
    let texto;
    try { texto = readFileSync(join(d, "codex.cmd"), "utf8"); } catch { continue; }
    const m = /node_modules[\\/]@openai[\\/]codex[\\/]([^"'\s%]+)/.exec(texto);
    const alvo = m && real(join(d, "node_modules", "@openai", "codex", ...m[1].split(/[\\/]/)));
    return alvo ? { exe: process.execPath, antes: [alvo], caminho: alvo } : undefined;
  }
}
/** O arquivo começa com um shebang que roda o node. */
function scriptDeNode(f) {
  let fd;
  try {
    fd = openSync(f, "r");
    const b = Buffer.alloc(200);
    const linha = b.subarray(0, readSync(fd, b, 0, 200, 0)).toString("latin1").split("\n")[0];
    return /^#!.*\bnode(js)?\b/.test(linha);
  } catch { return false; } finally { if (fd !== undefined) closeSync(fd); }
}
// O que injeta código num processo sem mudar o arquivo que se mede: `NODE_OPTIONS=--require`, `NODE_PATH` e todo o
// carregador dinâmico por prefixo (`LD_*`, `DYLD_*`: `LD_LIBRARY_PATH` e os primos do macOS, os de hoje e os que vierem;
// CodeAnt no katosmv/login#83). O Codex nunca o herda; o resto do ambiente (proxy, certificado, `CODEX_*`) passa
const INJETA = /^(LD_|DYLD_)|^(NODE_OPTIONS|NODE_PATH)$/i;
const ambienteDoCodex = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !INJETA.test(k)));
/** sha256 do arquivo, lido em blocos (o binário do Codex passa de 100 MB), ou undefined. */
function sha256DoArquivo(f) {
  let fd;
  try {
    fd = openSync(f, "r");
    const h = createHash("sha256");
    const bloco = Buffer.alloc(1 << 20);
    for (let n; (n = readSync(fd, bloco, 0, bloco.length, null)) > 0;) h.update(bloco.subarray(0, n));
    return h.digest("hex");
  } catch { return undefined; } finally { if (fd !== undefined) closeSync(fd); }
}
/** O Codex revisa o snapshot: `{motivo}` (`codex-*`, nada revisado) ou `{versao, pedido, bruto, resposta}`, com
 *  `resposta` undefined se a saída não é o JSON do schema. Uma tentativa só, no prazo da CLI. */
function codexRevisa(raiz, base, enviados) {
  const loc = localizarCodex();
  if (!loc) return { motivo: "codex-ausente" };
  // o arquivo medido é o que roda: o caminho real, achado uma vez
  const executavel = { caminho: loc.caminho, sha256: sha256DoArquivo(loc.caminho) };
  if (!executavel.sha256) return { motivo: "codex-erro" };
  const env = ambienteDoCodex();
  const codexRoda = (a, opcoes) => spawnSync(loc.exe, [...loc.antes, ...a], { ...opcoes, env });
  const versao = codexRoda(["--version"], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  const v = /\d+\.\d+\.\d+\S*/.exec(String(versao.stdout ?? ""))?.[0];
  if (versao.error || versao.status !== 0 || !v) return { motivo: "codex-erro" };
  const login = codexRoda(["login", "status"], { encoding: "utf8", timeout: 60_000, killSignal: "SIGKILL" });
  if (login.error || login.status !== 0) return { motivo: "codex-sem-login" };
  const dir = mkdtempSync(join(tmpdir(), "expx-revisao-codex-"));
  try {
    const schema = join(dir, "schema.json");
    const saida = join(dir, "resposta.json");
    writeFileSync(schema, JSON.stringify(SCHEMA_CODEX));
    const pedido = pedidoAoCodex(base, enviados);
    const r = codexRoda(["exec", "--ephemeral", "--ignore-user-config", "-s", "read-only", "-m", MODELO_CODEX, "-c", "model_reasoning_effort=\"high\"",
      "-C", raiz, "--output-schema", schema, "-o", saida, "-"], { cwd: raiz, input: pedido, maxBuffer: 64 << 20, timeout: TEMPO_DA_CLI, killSignal: "SIGKILL" });
    if (r.error?.code === "ETIMEDOUT") return { motivo: "codex-tempo-esgotado" };
    if (r.error || r.status !== 0) {
      process.stderr.write(`expx-revisao: codex saiu ${r.status ?? r.error?.code}: ${String(r.stderr ?? "").slice(-2000)}\n`);
      return { motivo: "codex-erro" };
    }
    // medido de novo depois de rodar: o arquivo trocado no meio não deixa a evidência atestar outro binário (a janela de
    // trocar e destrocar entre as duas medidas é limite declarado no contrato)
    if (sha256DoArquivo(loc.caminho) !== executavel.sha256) {
      process.stderr.write(`expx-revisao: o executavel do codex mudou durante a revisao: ${loc.caminho}\n`);
      return { motivo: "codex-erro" };
    }
    let bruto;
    try { bruto = readFileSync(saida); } catch { return { motivo: "codex-saida-invalida" }; }
    let resposta;
    try { resposta = respostaDoCodex(JSON.parse(bruto.toString("utf8"))); } catch { /* texto livre */ }
    return { versao: v, executavel, pedido, bruto, resposta };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** O JSON da CLI: do primeiro `{` que dá JSON até o último `}` (o npm pode avisar antes e depois). */
function json(texto) {
  for (let i = texto.indexOf("{"); i >= 0; i = texto.indexOf("{", i + 1)) try { return JSON.parse(texto.slice(i, texto.lastIndexOf("}") + 1)); } catch { /* próximo */ }
}
/** Linhas que a task alterou em `f` desde o commit `de` até `ate` (sem `ate`, o checkout): Set, ou `true` (todas) se
 *  `de` é null (sem commit), `f` não existe em `de` (arquivo novo) ou o diff falha. A mesma regra no `revisar` e no `conferir`. */
function alteradas(f, de, ate) {
  if (de === null || git("cat-file", "-e", `${de}:./${f}`).status !== 0) return true;
  const s = new Set();
  const d = git("diff", "-U0", de, ...(ate ? [ate] : []), "--", f);
  if (d.status !== 0) return true; // diff que falha: tudo conta, nunca menos
  for (const m of d.stdout.matchAll(/^@@ [^+]*\+(\d+)(?:,(\d+))? @@/gm)) {
    for (let n = 0; n < Number(m[2] ?? 1); n++) s.add(Number(m[1]) + n);
  }
  return s;
}

// Derivação 2: o trecho que a task removeu de um arquivo seu e pôs noutro lugar, igual byte a byte (com o fim de linha),
// não é linha alterada. Prova de proveniência textual, não de equivalência: o trecho movido para outro escopo também conta.
/** As linhas de um blob, cada uma com o `\n` que tiver (bytes como latin1), ou undefined: blob que o git não dá, acima de
 *  LEITURA_MAXIMA ou com NUL (binário, como o git o vê). */
function linhasDoBlob(id) {
  const b = blobGit(id);
  if (!b || b.includes(0)) return undefined;
  return b.toString("latin1").match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
/** Os hunks de `git diff -U0` entre dois blobs (`{inicio, menos, mais}`, as linhas com o `\n` que tiverem), ou undefined
 *  se o diff falha ou é binário. Algoritmo e heurística fixos: a configuração do usuário não muda os hunks. */
function hunksEntre(a, b) {
  const r = spawnSync("git", ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--diff-algorithm=myers", "--indent-heuristic", "-U0", a, b],
    { cwd: op.raiz, env: GIT_ENV, maxBuffer: 256 << 20 });
  if (r.error || r.status !== 0) return undefined;
  const hunks = [];
  let ultima;
  for (const l of r.stdout.toString("latin1").split("\n")) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) hunks.push({ inicio: Number(h[1]), menos: [], mais: [] });
    else if (/^Binary files /.test(l)) return undefined;
    else if (hunks.length && (l[0] === "-" || l[0] === "+")) (ultima = l[0] === "-" ? hunks.at(-1).menos : hunks.at(-1).mais).push(`${l.slice(1)}\n`);
    else if (hunks.length && l[0] === "\\" && ultima?.length) ultima[ultima.length - 1] = ultima.at(-1).slice(0, -1);
  }
  return hunks;
}
// Linha que sozinha não prova movimento: sem letra nem dígito (vazia, só pontuação) ou import. Pode estar num trecho movido
// que tenha outra, substantiva.
const IMPORTACAO = /^(?:import\b|from\s+\S+\s+import\b|export\s.*\sfrom\s|using\s|#include\b|require\s*\(|.*=\s*require\s*\()/;
const substantiva = (l) => { const t = l.replace(/^[ \t\r\n\f\v]+|[ \t\r\n\f\v]+$/g, ""); return /[A-Za-z0-9\x80-\xff]/.test(t) && !IMPORTACAO.test(t); };
/** O `alt` do `derivar` na derivação 2: as linhas alteradas de todos os caminhos, calculadas uma vez, na primeira consulta. */
function movidasPor(caminhos, de, pos) {
  let mapa;
  return (f) => (mapa ??= alteradasMovidas(caminhos, de, pos)).get(f) ?? new Set();
}
// teto de comparações da busca dos trechos: passou, nenhum crédito (nunca menos linha alterada)
const TETO_MOVIDAS = 5_000_000;
// teto das linhas reunidas dos hunks (as `+` e as `-` de todos os caminhos), antes da busca: o blob antigo só tem o limite
// de LEITURA_MAXIMA, e 40 deles enchiam a memória antes do teto de comparações. Passou, nenhum crédito
const TETO_LINHAS_MOVIDAS = 1_000_000;
/** As linhas alteradas de cada caminho na derivação 2 (Map: Set, ou `true` se o diff do caminho falha): as `+` do diff entre
 *  `de(f)` e `pos(f)` (blob, ou undefined se ausente), menos as dos trechos movidos. Trecho movido: uma sequência de `+`
 *  contígua num hunk, igual a uma sequência de `-` contígua num hunk de qualquer caminho, com ao menos uma linha
 *  substantiva; cada `-` paga uma `+` só. Os trechos se escolhem do maior para o menor (Greedy String Tiling): a cada
 *  rodada, os de comprimento máximo, por (posição da `+`, posição da `-`), sem sobrepor; as posições seguem os caminhos
 *  em ordem de bytes. A ordem das `issues` não entra. */
function alteradasMovidas(caminhos, de, pos) {
  const res = new Map();
  const mais = [];
  const menos = [];
  let trecho = 0;
  let linhas = 0;
  for (const f of [...caminhos].sort((x, y) => (Buffer.compare(Buffer.from(x), Buffer.from(y))))) {
    const a = de(f);
    const b = pos(f);
    if (a === b) { res.set(f, new Set()); continue; }
    // os dois lados lidos, mesmo com o diff do git: acima de LEITURA_MAXIMA ou binário, o caminho inteiro alterado e nenhuma
    // remoção dele paga. Ausente de um lado: o arquivo inteiro é um hunk, como o git o mostraria
    const la = a === undefined ? [] : linhasDoBlob(a);
    const lb = b === undefined ? [] : linhasDoBlob(b);
    const hunks = !la || !lb ? undefined : a === undefined || b === undefined ? [{ inicio: 1, menos: la, mais: lb }] : hunksEntre(a, b);
    if (!hunks) { res.set(f, true); continue; }
    const s = new Set();
    for (const h of hunks) linhas += h.menos.length + h.mais.length;
    // acima do teto, só as `+` do caminho, sem guardar nada para a busca
    if (linhas > TETO_LINHAS_MOVIDAS) { for (const h of hunks) h.mais.forEach((_, k) => s.add(h.inicio + k)); res.set(f, s); continue; }
    for (const h of hunks) {
      trecho++;
      for (const l of h.menos) menos.push({ chave: l, trecho });
      trecho++;
      h.mais.forEach((l, k) => { s.add(h.inicio + k); mais.push({ f, linha: h.inicio + k, chave: l, trecho }); });
    }
    res.set(f, s);
  }
  if (linhas > TETO_LINHAS_MOVIDAS) return res;
  const semCredito = new Map([...res].map(([f, s]) => [f, s === true ? true : new Set(s)]));
  // todo trecho válido tem uma linha substantiva: a busca parte só delas (a âncora), e o par de linhas iguais só pontuação,
  // que se repete aos milhares, nunca é visitado
  const ancora = mais.map((m) => substantiva(m.chave));
  const indice = new Map();
  menos.forEach((m, p) => { if (substantiva(m.chave)) { if (!indice.has(m.chave)) indice.set(m.chave, []); indice.get(m.chave).push(p); } });
  const usadaMais = new Uint8Array(mais.length);
  const usadaMenos = new Uint8Array(menos.length);
  // (x, y) livre, no trecho de (i, p) e igual
  const segue = (x, y, i, p) => x >= 0 && y >= 0 && x < mais.length && y < menos.length && !usadaMais[x] && !usadaMenos[y]
    && mais[x].trecho === mais[i].trecho && menos[y].trecho === menos[p].trecho && mais[x].chave === menos[y].chave;
  let comparacoes = 0;
  for (;;) {
    let maior = 0;
    let trechos = [];
    // a diagonal de um trecho já achado nesta rodada não se percorre de novo a partir de outra âncora dele
    const vistos = new Set();
    for (let i = 0; i < mais.length; i++) {
      if (usadaMais[i] || !ancora[i]) continue;
      for (const p of indice.get(mais[i].chave) ?? []) {
        // toda visita conta, inclusive a que se descarta: o teto limita o trabalho inteiro, não só as extensões
        if (++comparacoes > TETO_MOVIDAS) return semCredito;
        if (usadaMenos[p] || vistos.has(i * menos.length + p)) continue;
        let a = 0;
        while (segue(i - a - 1, p - a - 1, i, p)) a++;
        let n = 1;
        while (segue(i + n, p + n, i, p)) n++;
        const [i0, p0, total] = [i - a, p - a, a + n];
        comparacoes += total;
        if (comparacoes > TETO_MOVIDAS) return semCredito;
        for (let k = 0; k < total; k++) vistos.add((i0 + k) * menos.length + p0 + k);
        if (total < maior) continue;
        if (total > maior) { maior = total; trechos = []; }
        trechos.push([i0, p0]);
      }
    }
    if (maior === 0) break;
    trechos.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    for (const [i, p] of trechos) {
      if (![...Array(maior).keys()].every((k) => !usadaMais[i + k] && !usadaMenos[p + k])) continue;
      for (let k = 0; k < maior; k++) { usadaMais[i + k] = 1; usadaMenos[p + k] = 1; res.get(mais[i + k].f).delete(mais[i + k].linha); }
    }
  }
  return res;
}

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Uma pasta temporária com o `.expx/fatiamento.json` do commit `rev` (o `HEAD` revisado, com `--base-commit`; o da task,
 *  no `conferir`), para o leitor: ausente no commit, a pasta fica sem ele (os padrões, como o ausente no disco); entrada que
 *  não é arquivo comum (pasta, link, submódulo) ou `ls-tree` que falha: `null` (inválido, nunca os padrões). */
function raizDoFatiamentoNoCommit(rev) {
  const r = git("ls-tree", "-z", rev, "--", ".expx/fatiamento.json");
  const entrada = r.status === 0 ? r.stdout.split("\0")[0] : undefined;
  const [modo, tipo, oid] = (entrada ?? "").split("\t")[0].split(" ");
  if (entrada === undefined || (entrada !== "" && (tipo !== "blob" || !["100644", "100755"].includes(modo)))) {
    process.stderr.write(`expx-revisao: .expx/fatiamento.json de ${rev} nao e arquivo comum legivel\n`);
    return null;
  }
  const raiz = mkdtempSync(join(tmpdir(), "expx-fatiamento-"));
  if (entrada !== "") {
    mkdirSync(join(raiz, ".expx"));
    writeFileSync(join(raiz, ".expx", "fatiamento.json"), blobGit(oid) ?? Buffer.alloc(0));
  }
  return raiz;
}
/** Os `padrao` de `excluir_da_revisao` do projeto, pelo leitor irmão (nunca do ambiente); `null` se ele falha. Com `rev`
 *  (`--base-commit`: o `HEAD` revisado; no `conferir`: o commit da task), os do commit, nunca os da árvore de trabalho. */
function exclusoesDoProjeto(rev) {
  const temporaria = rev ? raizDoFatiamentoNoCommit(rev) : undefined;
  if (temporaria === null) return null;
  try {
    const r = spawnSync(process.execPath, [join(AQUI, "expx-fatiamento.mjs"), "--formato", "json", "--raiz", temporaria ?? op.raiz], { encoding: "utf8" });
    if (r.status !== 0) {
      process.stderr.write(r.stderr ?? "");
      return null;
    }
    const lista = JSON.parse(r.stdout).excluir_da_revisao;
    return Array.isArray(lista) ? lista.map((x) => x.padrao) : null;
  } catch {
    return null;
  } finally {
    if (temporaria) rmSync(temporaria, { recursive: true, force: true });
  }
}
const arvore = (ref) => new Set(git("ls-tree", "-r", "-z", "--name-only", ref).stdout.split("\0").filter(Boolean));
const idDe = (...a) => { const r = git(...a); return r.status === 0 ? r.stdout.trim() : undefined; };
/** O blob de `f` em `rev`, ou undefined (ausente, ou `rev` que não resolve). */
const blobEm = (rev, f) => idDe("rev-parse", "--verify", "-q", `${rev}:./${f}`);
/** O blob que vai ao commit (sem `--base-commit`: `hash-object -w`; com: o de `HEAD`) e as medidas da CLI no blob e no
 *  checkout, valendo o maior; `disco` é o `hash-object` do checkout (o que mudaria se o arquivo fosse editado). */
function medida(f) {
  const disco = idDe("hash-object", "--", f);
  const blob = (op["base-commit"] && idDe("rev-parse", "--verify", "-q", `HEAD:./${f}`)) || idDe("hash-object", "-w", "--", f);
  if (!blob || !disco) return undefined;
  const a = medirBlob(blob);
  if (!a) return undefined;
  const b = medirArquivo(f);
  if (!b) return undefined;
  const linhas = a.linhas === null || b.linhas === null ? null : Math.max(a.linhas, b.linhas);
  return { blob, bytes: Math.max(a.bytes, b.bytes), linhas, disco };
}
/** A resposta fora da forma do perfil (emenda, 6): topo, `meta`, `max_files`, a conta e os motivos. */
function foraDoPerfil(j, perfil, status) {
  const m = j.meta;
  const texto = (v) => typeof v === "string";
  return !(Array.isArray(j.issues) && j.issues.every(ehMapa) && j.error === null && typeof j.noFiles === "boolean" && ehMapa(m)
    && Array.isArray(m.reviewed_files) && m.reviewed_files.every(texto) && Number.isSafeInteger(m.total_changed)
    && Array.isArray(m.skipped) && m.skipped.every((s) => ehMapa(s) && texto(s.file) && texto(s.reason)) && typeof m.capped === "boolean"
    && m.max_files === perfil.max_files && m.total_changed === m.reviewed_files.length + m.skipped.length
    && m.skipped.every((s) => motivoAceito(s.reason, perfil)) && status === 0);
}
// os filtros que a #60 mostrou virem antes do `--include`: pulado fora da task só por eles
const ANTES_DO_INCLUDE = ["binary/generated", "deleted", "excluded by pattern"];
/** O motivo de `incompleta` da reconciliação entre os enviados (`I`) e a resposta, ou undefined. */
function reconciliar(I, meta) {
  const vistos = new Set();
  for (const f of [...meta.reviewed_files, ...meta.skipped.map((s) => s.file)]) {
    if (vistos.has(f)) return `repetido:${f}`;
    vistos.add(f);
  }
  const enviado = new Set(I);
  for (const f of meta.reviewed_files) if (!enviado.has(f)) return `sobra:${f}`;
  for (const s of meta.skipped) if (!enviado.has(s.file) && !ANTES_DO_INCLUDE.includes(s.reason)) return `sobra:${s.file}`;
  const pulados = new Set(meta.skipped.map((s) => s.file));
  for (const f of I) if (pulados.has(f)) return `pulado:${f}`;
  const revisados = new Set(meta.reviewed_files);
  for (const f of I) if (!revisados.has(f)) return `faltante:${f}`;
}

function revisar() {
  // sem aparar: espaço na ponta é parte do nome, e aparado o caminho seria outro arquivo (ou nenhum)
  const arquivos = op.arquivos.split(",").map(caminho).filter(Boolean);
  if (arquivos.length === 0) uso("--arquivos sem nenhum caminho");
  // o caminho é relativo à raiz e fica dentro dela: com `..` ou absoluto, o snapshot apagaria e
  // reescreveria um caminho fora do checkout temporário
  // (`C:foo.js` só é caminho de drive no Windows; fora dele é nome de arquivo)
  const fora = arquivos.find((f) => isAbsolute(f) || (process.platform === "win32" && /^[A-Za-z]:/.test(f))
    || posix.normalize(f).split("/")[0] === ".." || linkNoCaminho(op.raiz, f) !== undefined);
  if (fora !== undefined) uso(`--arquivos fora da raiz do projeto: ${fora}`);
  if (op["base-commit"] !== undefined) {
    const sha = idDe("rev-parse", "--verify", "-q", `${op["base-commit"]}^{commit}`);
    if (!sha) uso(`base-commit inexistente: ${op["base-commit"]}`);
    op["base-commit"] = sha;
  }
  const base = op["base-commit"] ?? null;
  const anterior = le(caminhoEv(op.task));
  // o HEAD da revisão: sem `--base-commit`, as linhas alteradas são as do checkout desde ele (o `conferir` as refaz até o commit)
  const headDaRevisao = idDe("rev-parse", "--verify", "-q", "HEAD^{commit}") ?? null;
  const ev = { expx_revisao: 2, derivacao: 3, trabalho: op.trabalho, task: op.task, modo: base ? "base-commit" : "uncommitted", base_commit: base, head: headDaRevisao, cli: null,
    executada_em: new Date().toISOString(), arquivos: {}, chamada: null, resultado: "ok", achados: [],
    rejeicoes: Array.isArray(anterior?.rejeicoes) ? anterior.rejeicoes : [], removidos_sem_revisao: [] };
  const fim = (resultado, motivo) => Object.assign(ev, { resultado, motivo });
  const head = arvore("HEAD");
  const naBase = base ? arvore(base) : new Set();
  const existe = (f) => head.has(f) || naBase.has(f) || existsSync(join(op.raiz, f));
  // `--arquivos` e o `--include` da CLI separam por vírgula: um caminho com vírgula
  // chegaria partido, e cada pedaço seria revisado (ou dado por removido) sozinho
  const virgula = arquivos.some((_, i) => arquivos.slice(i + 1).some((__, j) => existe(arquivos.slice(i, i + j + 2).join(","))));
  const presentes = arquivos.filter((f) => existsSync(join(op.raiz, f)));
  const removidos = arquivos.filter((f) => !presentes.includes(f));
  for (const f of removidos) { ev.arquivos[f] = null; ev.removidos_sem_revisao.push(f); }
  const exclusoes = virgula ? [] : exclusoesDoProjeto(op["base-commit"] ? "HEAD" : undefined);
  // os portões antes da CLI não dependem da versão instalada: os números são iguais em todas as homologadas
  const perfil = perfilCli(homologadas().at(-1));
  const medidas = {};
  for (const f of presentes) {
    const m = (medidas[f] = medida(f));
    const fora = excluido(f, EXCLUIDOS_DO_NUCLEO) || excluido(f, exclusoes ?? []);
    // igual ao da partida (a base, ou o HEAD sem `--base-commit`): a CLI só revisa o que mudou e não o devolveria
    // (`faltante`). Ausente na partida nunca é igual, nem vazio
    const igual = m !== undefined && m.blob === blobEm(base ?? "HEAD", f);
    ev.arquivos[f] = { blob: m?.blob ?? null, bytes: m?.bytes ?? null, linhas: m?.linhas ?? null,
      revisao: fora ? "excluido" : !revisavel(f, perfil) ? "nao-revisavel" : igual ? "sem-alteracao" : "enviado" };
  }
  let raizRevisao = op.raiz;
  let limparSnapshot;
  const enviados = presentes.filter((f) => ev.arquivos[f].revisao === "enviado");
  const naoCommitado = (f) => (presentes.includes(f) ? medidas[f]?.disco !== idDe("rev-parse", "--verify", "-q", `HEAD:./${f}`) : head.has(f));
  /** O snapshot dos enviados, um só por revisão (a CodeAnt e, na escala, o Codex leem o mesmo). */
  const abreSnapshot = () => {
    if (limparSnapshot) return true;
    const snapshot = snapshotDaRevisao(headDaRevisao, enviados.map((f) => [f, medidas[f].blob]));
    if (!snapshot) return false;
    raizRevisao = snapshot.raiz;
    limparSnapshot = snapshot.limpar;
    return true;
  };
  /** 10. O que foi revisado é o que vai ao commit, e os achados das `issues` (na forma da CodeAnt) do revisor `versao`. */
  const concluir = (issues, versao, extra) => {
    // todo arquivo presente da task, não só os enviados: o `sem-alteracao` que muda durante a chamada gravaria o blob da
    // partida (conselhos#312)
    for (const f of presentes) {
      const m = medida(f);
      if (!m || ["blob", "bytes", "linhas", "disco"].some((k) => m[k] !== medidas[f][k])) return fim("indisponivel", "arquivo-mudou-durante-revisao");
    }
    const rejeitadas = new Set([...ev.rejeicoes.map((r) => r?.identidade), ...rejeitadasDoTrabalho()]);
    const lido = (f) => { try { return readFileSync(join(raizRevisao, f), "utf8"); } catch { return ""; } };
    // derivação 2: do blob da partida ao blob que vai ao commit, os mesmos do `conferir`, que não dependem do checkout
    const partida = base ?? headDaRevisao;
    ev.achados = derivar(issues, ev.arquivos, versao,
      movidasPor(Object.keys(ev.arquivos), (f) => (partida ? blobEm(partida, f) : undefined), (f) => ev.arquivos[f]?.blob ?? undefined), lido, ev.derivacao, extra)
      .map((a) => ({ ...a, estado: rejeitadas.has(a.identidade) ? "rejeitado" : a.estado }));
    if (ev.achados.some((a) => a.estado === "aberto")) ev.resultado = "achados";
    return undefined;
  };
  /** A CodeAnt fora por um motivo escalável (`ESCALAVEIS`): o Codex revisa o mesmo snapshot, e a evidência vira v3, com a
   *  tentativa da CodeAnt guardada. Os dois fora: `indisponivel:<CodeAnt>+<Codex>`. */
  const escalar = (motivo) => {
    Object.assign(ev, { expx_revisao: 3, escala: { de: "codeant", motivo }, revisor: null, chamada_codex: null });
    if (!abreSnapshot()) return fim("indisponivel", "snapshot");
    process.stderr.write(`expx-revisao: CodeAnt fora (${motivo}): a revisao escala para o Codex\n`);
    const cx = codexRevisa(raizRevisao, baseDoPedido(ev), enviados);
    if (cx.motivo) return fim("indisponivel", `${motivo}+${cx.motivo}`);
    ev.revisor = { nome: "codex", versao: cx.versao, modelo: MODELO_CODEX, formato: FORMATO_CODEX, executavel: cx.executavel };
    ev.chamada_codex = { include: enviados, arquivos_revisados: cx.resposta?.arquivos_revisados ?? null, issues: cx.resposta?.issues ?? null,
      stdout_sha256: sha256(cx.bruto), prompt_sha256: sha256(cx.pedido) };
    // texto livre, fora do schema, sem a task inteira ou com issue fora dela (nunca se lê um caminho que o modelo inventou,
    // como `../../dev/zero`): nada revisado
    if (!cx.resposta || !mesmosArquivos(cx.resposta.arquivos_revisados, enviados) || !issuesNaTask(cx.resposta.issues, enviados)) {
      return fim("indisponivel", `${motivo}+codex-saida-invalida`);
    }
    return concluir(issuesDoCodex(cx.resposta.issues), versaoDoRevisor(ev.revisor), extraDoCodex(FORMATO_CODEX));
  };
  try { (() => {
    // 1. o pedido não se revisa como está
    if (virgula) return fim("indisponivel", "caminho-com-virgula");
    const inexistente = removidos.find((f) => !existe(f));
    if (inexistente !== undefined) return fim("indisponivel", `arquivo-inexistente:${inexistente}`);
    if (exclusoes === null) return fim("indisponivel", "fatiamento-invalido");
    const semMedida = presentes.find((f) => !medidas[f]);
    if (semMedida !== undefined) return fim("indisponivel", `arquivo-inexistente:${semMedida}`);
    const pendente = base ? arquivos.find(naoCommitado) : undefined;
    if (pendente !== undefined) return fim("indisponivel", `arquivo-nao-commitado:${pendente}`);
    // 2. os portões antes da CLI, em qualquer modo
    const declarado = presentes.find((f) => excluido(f, exclusoes));
    if (declarado !== undefined) return fim("incompleta", `excluido-declarado:${declarado}`);
    if (enviados.length > perfil.max_files) return fim("incompleta", `L1:${enviados.length}`);
    const grande = enviados.find((f) => ev.arquivos[f].linhas > perfil.max_linhas || ev.arquivos[f].bytes > perfil.max_bytes);
    if (grande !== undefined) return fim("incompleta", `L2:${grande}`);
    // 3. nada a revisar: a CLI nem é procurada
    if (enviados.length === 0) return undefined;
    // 4. a CLI homologada e íntegra
    const cli = cliConferida();
    if (cli.motivo) {
      if (cli.versao) ev.cli = { versao: cli.versao, integridade: null };
      return escalar(cli.motivo);
    }
    ev.cli = { versao: cli.versao, integridade: "conferida" };
    // 5. uma chamada só, sem lotes
    if (!abreSnapshot()) return fim("indisponivel", "snapshot");
    const r = codeant(cli.bin, ["review", "--headless", ...(base ? ["--base-commit", base] : ["--uncommitted"]), "--include", enviados.join(",")], raizRevisao);
    if (r.error?.code === "ETIMEDOUT") return escalar("tempo-esgotado");
    const stdout = r.stdout ?? Buffer.alloc(0);
    const j = json(stdout.toString("utf8"));
    // só o stderr diz que um lote se perdeu: o JSON sai limpo, com saída 0. Qualquer `[error]` conta, e a resposta
    // do Rejector que não se entendeu também; o `[warning]` do Risk planner só tira as hipóteses da revisão.
    const falhas = String(r.stderr ?? "").split(/\r?\n/).filter((l) => l.startsWith("[error]") || l.startsWith("Warning: parsing error in rejector"));
    ev.chamada = { include: enviados, meta: j?.meta ?? null, error: j === undefined ? `json ilegivel (rc ${r.status})` : j.error ?? null, falhas_de_lote: falhas,
      issues: j?.issues ?? null, stdout_sha256: createHash("sha256").update(stdout).digest("hex") };
    // 6-9. a resposta cobre a task inteira
    // 403 em todo lote: a revisão não aconteceu, e é indisponibilidade, como o mesmo 403 vindo em
    // `error` no JSON (Conselhos na 0.13.1, T-01.04). O `reviewed_files` não prova nada: na CLI
    // 0.5.14 ele repete os enviados mesmo com todos os lotes em 403. A prova são as linhas
    // `[error] Failed to review <arquivos>: Access denied (403)`: a união dos arquivos que elas
    // citam cobre todos os enviados, sem outro erro, com `issues` vazia e `error` nulo. Linha 403
    // fora desse formato não prova cobertura, e continua `incompleta`.
    const negados = new Set();
    const todos403 = falhas.length > 0 && falhas.every((l) => {
      // a linha inteira, como a CLI 0.5.14 a escreve; o caminho com vírgula já foi recusado antes
      const m = /^\[error\] Failed to review (.+?): Access denied \(403\)\. Please run `codeant logout` and then `codeant login` to re-authenticate\.$/.exec(l);
      if (!m) return false;
      for (const f of m[1].split(", ")) negados.add(f);
      return true;
    });
    if (todos403 && enviados.every((f) => negados.has(f)) && Array.isArray(j?.issues) && j.issues.length === 0 && j.error === null) {
      return escalar("acesso-negado");
    }
    if (falhas.length > 0) return fim("incompleta", "lote-falhou");
    if (j === undefined || (j.error !== null && j.error !== undefined)) return escalar("erro");
    if (foraDoPerfil(j, cli.perfil, r.status)) return fim("incompleta", "perfil");
    const falta = reconciliar(enviados, j.meta);
    if (falta) return fim("incompleta", falta);
    return concluir(j.issues, ev.cli.versao);
  })(); } finally { limparSnapshot?.(); }
  // rejeição gravada (rejeitar) enquanto a CLI rodava não se perde: releitura e gravação sob a trava;
  // as de outras tasks do trabalho também são relidas aqui, não só antes da espera pela trava
  const abertos = comTrava(op.task, () => {
    const agora = le(caminhoEv(op.task))?.rejeicoes;
    const doTrabalho = rejeitadasDoTrabalho();
    pausaDeTeste();
    for (const r of Array.isArray(agora) ? agora : []) {
      if (!ev.rejeicoes.some((x) => x?.identidade === r?.identidade)) ev.rejeicoes.push(r);
    }
    for (const a of ev.achados) if (doTrabalho.has(a.identidade) || ev.rejeicoes.some((r) => r?.identidade === a.identidade)) a.estado = "rejeitado";
    if (ev.resultado === "achados" && !ev.achados.some((a) => a.estado === "aberto")) ev.resultado = "ok";
    grava(op.task, ev);
    return ev.achados.filter((a) => a.estado === "aberto").length;
  });
  process.stdout.write(`${op.task} ${ev.resultado}${ev.motivo ? `:${ev.motivo}` : ""}\n`);
  // exitCode, não exit(): o stdout pode ser assíncrono (pipe no macOS, TTY no Windows) e a linha se perderia
  process.exitCode = { indisponivel: 2, incompleta: 3 }[ev.resultado] ?? (abertos > 0 ? 1 : 0);
}

/** As identidades rejeitadas em qualquer evidência do trabalho. */
function rejeitadasDoTrabalho() {
  const rejeitadas = new Set();
  for (const n of existsSync(pasta) ? readdirSync(pasta) : []) {
    for (const r of n.endsWith(".json") ? le(join(pasta, n))?.rejeicoes ?? [] : []) rejeitadas.add(r?.identidade);
  }
  return rejeitadas;
}
/** Os achados das `issues` da CLI, sem rejeição: `aberto` (linha alterada) ou `anterior`. `alt(f)` dá as linhas alteradas
 *  de um arquivo da task (Set, ou `true` para todas) e `texto(f)` o conteúdo (ou ""). A mesma regra no `revisar` (checkout)
 *  e no `conferir` (commit da task), para que `achados` seja derivável das `issues` gravadas. */
function derivar(issues, arquivos, versao, alt, texto, derivacao = 1, extra = undefined) {
  const cache = new Map();
  return issues.map((i) => {
    const arquivo = caminho(String(i.relevant_file ?? ""));
    const linha = Number(i.start_line);
    // na 3, o arquivo fora da task nunca é lido: o caminho vem do revisor (`../../dev/zero` travava a leitura)
    const daTask = Object.hasOwn(arquivos, arquivo);
    if (!cache.has(arquivo)) cache.set(arquivo, { alt: daTask ? alt(arquivo) : new Set(), linhas: daTask || derivacao < 3 ? texto(arquivo).split(/\r?\n/) : [] });
    const c = cache.get(arquivo);
    const viz = [linha - 2, linha - 1, linha].map((k) => (c.linhas[k] ?? "").trim());
    const label = String(i.label ?? "");
    const identidade = createHash("sha256").update([label, arquivo, ...viz, versao, ...(extra ? [extra(i)] : [])].join("\0")).digest("hex");
    // Achado que não se liga a uma linha de um arquivo da task não pode ser dado por anterior: fica aberto.
    // na 3, a linha além do fim do arquivo também não se liga a nada. A 1 e a 2 ficam como eram: mudá-las mudaria os achados
    // das evidências já gravadas
    const ultima = c.linhas.length - (c.linhas.at(-1) === "" ? 1 : 0);
    const semVinculo = !daTask || !Number.isSafeInteger(linha) || linha < 1 || (derivacao >= 3 && linha > ultima);
    return { identidade, arquivo, linha, label, texto: String(i.issue_content ?? ""), estado: semVinculo || c.alt === true || c.alt.has(linha) ? "aberto" : "anterior" };
  });
}

const ehMapa = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** `executada_em` não é ISO 8601 (ou é data impossível). */
function semData(ev) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/
    .exec(typeof ev.executada_em === "string" ? ev.executada_em : "");
  // o Date normaliza 30/02 para 02/03: a data tem de voltar igual
  const dia = iso && new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return !iso || dia.getUTCMonth() !== Number(iso[2]) - 1 || dia.getUTCDate() !== Number(iso[3]);
}
/** Em `ok`/`achados` com algum arquivo enviado, o campo que não prova a revisão completa pela CLI homologada
 *  (ou undefined): versão, integridade, a chamada, o perfil, falha de lote, L1, L2 (medido de novo no blob do
 *  commit) e a cobertura de cada enviado. */
function semSinalDaCli(ev, sha) {
  // a classificação é refeita: sem ela, um revisável marcado `excluido` dispensaria todo o resto. Em `ok`/`achados`
  // só há `excluido` do núcleo (o do projeto dá `incompleta:excluido-declarado`)
  const homologado = perfilCli(homologadas().at(-1));
  // `sem-alteracao` só com o blob do commit igual ao da partida (`base_commit`, ou o `head` da revisão), refeito aqui;
  // `enviado` também vale para o igual (a CLI o revisou, e a reconciliação abaixo o cobra)
  const de = ev.modo === "base-commit" ? ev.base_commit : ev.head;
  // `de` tem de ser commit: o SHA de uma árvore também resolve `<de>:<arquivo>`, e sem `enviado` nada mais confere o `head`
  const igual = (f) => { const p = ehCommit(de) ? blobEm(de, f) : undefined; return p !== undefined && p === blobEm(sha, f); };
  const esperada = (f) => (excluido(f, EXCLUIDOS_DO_NUCLEO) ? "excluido" : !revisavel(f, homologado) ? "nao-revisavel" : igual(f) ? "sem-alteracao" : "enviado");
  const aceita = (f, revisao) => revisao === esperada(f) || (revisao === "enviado" && esperada(f) === "sem-alteracao");
  if (Object.entries(ev.arquivos).some(([f, a]) => a !== null && !aceita(f, a.revisao))) return "revisao";
  const enviados = Object.keys(ev.arquivos).filter((f) => ev.arquivos[f]?.revisao === "enviado");
  if (enviados.length === 0) return undefined;
  if (ev.expx_revisao === 3) return semSinalDoCodex(ev, sha, enviados, homologado);
  const perfil = typeof ev.cli?.versao === "string" ? perfilCli(ev.cli.versao) : undefined;
  if (!perfil) return "cli.versao";
  if (ev.cli.integridade !== "conferida") return "integridade";
  if (!ehMapa(ev.chamada) || ev.chamada.error !== null || !Array.isArray(ev.chamada.issues) || !ev.chamada.issues.every(ehMapa)
    || !/^[0-9a-f]{64}$/.test(ev.chamada.stdout_sha256)) return "chamada";
  const meta = ev.chamada.meta;
  const pulados = ehMapa(meta) && Array.isArray(meta.skipped) ? meta.skipped : undefined;
  if (!pulados || meta.max_files !== perfil.max_files || !Array.isArray(meta.reviewed_files) || !meta.reviewed_files.every((f) => typeof f === "string")
    || !pulados.every((s) => ehMapa(s) && typeof s.file === "string" && typeof s.reason === "string" && motivoAceito(s.reason, perfil))) return "perfil";
  if (!Array.isArray(ev.chamada.falhas_de_lote) || ev.chamada.falhas_de_lote.length > 0) return "lote-falhou";
  if (enviados.length > perfil.max_files) return "L1";
  for (const f of enviados) {
    const a = ev.arquivos[f];
    const m = medirBlob(`${sha}:./${f}`);
    if (!m || !Number.isSafeInteger(a.bytes) || !Number.isSafeInteger(a.linhas) || a.bytes > perfil.max_bytes || a.linhas > perfil.max_linhas
      || a.bytes < m.bytes || a.linhas < m.linhas) return "L2";
  }
  // a mesma reconciliação do `revisar`, com o `--include` igual aos enviados
  const include = Array.isArray(ev.chamada.include) ? ev.chamada.include : [];
  if (include.length !== enviados.length || !enviados.every((f) => include.includes(f)) || reconciliar(enviados, meta)) return "cobertura";
}

/** O `semSinalDaCli` da evidência v3 (a escala): o revisor, a chamada do Codex (o pedido refeito, a resposta na forma do
 *  schema), L1, L2 pelo perfil homologado e a cobertura (`include` e `arquivos_revisados` iguais aos enviados). */
function semSinalDoCodex(ev, sha, enviados, perfil) {
  const r = ev.revisor;
  if (!ehMapa(r) || r.nome !== "codex" || typeof r.versao !== "string" || r.modelo !== MODELO_CODEX || ![1, FORMATO_CODEX].includes(r.formato)
    || !ehMapa(r.executavel) || typeof r.executavel.caminho !== "string" || r.executavel.caminho === "" || !/^[0-9a-f]{64}$/.test(r.executavel.sha256)) return "revisor";
  const ch = ev.chamada_codex;
  if (!ehMapa(ch) || !Array.isArray(ch.include) || !ch.include.every((f) => typeof f === "string")
    || !respostaDoCodex({ arquivos_revisados: ch.arquivos_revisados, issues: ch.issues }) || !issuesNaTask(ch.issues, enviados)
    || !/^[0-9a-f]{64}$/.test(ch.stdout_sha256)
    || ch.prompt_sha256 !== sha256(pedidoAoCodex(baseDoPedido(ev), ch.include))) return "chamada";
  if (enviados.length > perfil.max_files) return "L1";
  for (const f of enviados) {
    const a = ev.arquivos[f];
    const m = medirBlob(`${sha}:./${f}`);
    if (!m || !Number.isSafeInteger(a.bytes) || !Number.isSafeInteger(a.linhas) || a.bytes > perfil.max_bytes || a.linhas > perfil.max_linhas
      || a.bytes < m.bytes || a.linhas < m.linhas) return "L2";
  }
  if (!mesmosArquivos(ch.include, enviados) || !mesmosArquivos(ch.arquivos_revisados, enviados)) return "cobertura";
}

/** O primeiro arquivo que o commit da task altera e a evidência não cobre (fora das chaves de `arquivos`), `""` se o
 *  diff falha, ou undefined. Alterados: o diff de `sha` contra o primeiro pai (no merge, tudo o que ele traz à linha; na
 *  raiz, a árvore inteira) e, com `--base-commit`, também desde `base_commit` (a task inteira, não só o commit da
 *  evidência); sem renomeação (o nome antigo e o novo contam), sem submódulo. Saem da conta, como no `revisar`: o não
 *  revisável pelo predicado do perfil, as exclusões do núcleo (a própria evidência entre elas) e as de `excluir_da_revisao`
 *  do `.expx/fatiamento.json` do commit (leitor que falha: nenhuma, nunca menos conta). */
function naoCoberto(ev, sha) {
  const opcoes = ["--no-ext-diff", "--no-renames", "--ignore-submodules=all", "--name-only", "-z"];
  // o pai pelo cabeçalho do commit, não por `<sha>^1`: num clone raso o pai existe mas não foi baixado, e o diff falha
  // (não verificável), em vez de o commit passar por raiz e cobrar a árvore inteira
  const cabecalho = git("cat-file", "commit", sha);
  if (cabecalho.status !== 0) return "";
  const pai = /^parent ([0-9a-f]+)$/m.exec(cabecalho.stdout.split(/\r?\n\r?\n/)[0])?.[1];
  const diffs = [pai ? git("diff", ...opcoes, pai, sha) : git("diff-tree", "--root", "-r", "--no-commit-id", ...opcoes, sha)];
  // `modo` fora dos dois, ou `base_commit` que não é commit (em `indisponivel`/`incompleta` nada mais os confere): não verificável
  if (ev.modo === "base-commit" ? !ehCommit(ev.base_commit) : ev.modo !== "uncommitted") return "";
  if (ev.modo === "base-commit") diffs.push(git("diff", ...opcoes, ev.base_commit, sha));
  if (diffs.some((d) => d.status !== 0)) return "";
  const homologado = perfilCli(homologadas().at(-1));
  const exclusoes = exclusoesDoProjeto(sha) ?? [];
  const contam = (f) => revisavel(f, homologado) && !excluido(f, EXCLUIDOS_DO_NUCLEO) && !excluido(f, exclusoes);
  return diffs.flatMap((d) => d.stdout.split("\0")).find((f) => f !== "" && contam(f) && !Object.hasOwn(ev.arquivos, f));
}

/** `rejeicoes` ou `removidos_sem_revisao` fora da forma que o `listar` devolve (o nome do campo), ou undefined:
 *  `rejeicoes` lista de `{identidade, motivo, em}` (hex de 64, texto, texto); `removidos_sem_revisao` lista de textos sem
 *  repetição, exatamente os arquivos `null` de `arquivos` (o `revisar` grava os dois juntos). */
function semListas(ev) {
  if (!Array.isArray(ev.rejeicoes) || !ev.rejeicoes.every((r) => ehMapa(r) && /^[0-9a-f]{64}$/.test(r.identidade)
    && typeof r.motivo === "string" && typeof r.em === "string")) return "rejeicoes";
  const removidos = ev.removidos_sem_revisao;
  const nulos = Object.keys(ev.arquivos).filter((f) => ev.arquivos[f] === null);
  if (!Array.isArray(removidos) || !removidos.every((f) => typeof f === "string") || new Set(removidos).size !== removidos.length
    || removidos.length !== nulos.length || !nulos.every((f) => removidos.includes(f))) return "removidos_sem_revisao";
}

/** A evidência da task no commit, pela validação do `conferir` (a mesma no `listar`): `{ausente: true}`, `{falha: <motivo>}`
 *  (FALHA em qualquer modo) ou `{ev}`, válida, com qualquer `resultado`. */
function avaliar(task, sha) {
  const falha = (motivo) => ({ falha: motivo });
  if (git("rev-parse", "--verify", "-q", `${sha}^{commit}`).status !== 0) return { falha: `commit-inexistente:${sha}` };
  // a evidência que vale é a do commit da task (o E1 a commita junto), nunca a do disco
  const doCommit = git("show", `${sha}:./docs/entregas/${op.trabalho}/revisao/${task}.json`);
  // ausente é a que não está na árvore do commit; a que está e o git não lê (objeto apagado ou corrompido) é inválida
  if (doCommit.status !== 0) {
    const naArvore = git("ls-tree", "-z", "--name-only", sha, "--", `docs/entregas/${op.trabalho}/revisao/${task}.json`);
    return naArvore.status === 0 && naArvore.stdout === "" ? { ausente: true } : falha("evidencia-invalida");
  }
  let ev;
  try { ev = JSON.parse(doCommit.stdout.replace(/^\uFEFF/, "")); } catch { return falha("evidencia-invalida"); }
  // 2: a CodeAnt revisou (ou não houve escala); 3: a escala para o Codex (contrato, "Escala para o Codex")
  if (ehMapa(ev) && ev.expx_revisao !== 2 && ev.expx_revisao !== 3) return falha("evidencia-invalida:versao");
  if (!ehMapa(ev) || ev.task !== task || ev.trabalho !== op.trabalho || !ehMapa(ev.arquivos)
    || Object.keys(ev.arquivos).length === 0 || !Object.values(ev.arquivos).every((a) => a === null || ehMapa(a)) || !Array.isArray(ev.achados)
    || !ev.achados.every((a) => ehMapa(a) && /^[0-9a-f]{64}$/.test(a.identidade) && ["aberto", "anterior", "rejeitado"].includes(a.estado))
    || !["ok", "achados", "indisponivel", "incompleta"].includes(ev.resultado)) return falha("evidencia-invalida");
  const lista = semListas(ev);
  if (lista) return falha(`evidencia-invalida:${lista}`);
  // a escala só parte de uma CodeAnt fora por motivo escalável; os dois fora, o motivo junta os dois
  if (ev.expx_revisao === 3 && (!ehMapa(ev.escala) || ev.escala.de !== "codeant" || !ESCALAVEIS.includes(ev.escala.motivo)
    || (ev.resultado === "indisponivel" && !["snapshot", "arquivo-mudou-durante-revisao", ...MOTIVOS_CODEX.map((m) => `${ev.escala.motivo}+${m}`)].includes(ev.motivo)))) {
    return falha("evidencia-invalida:escala");
  }
  // ausente é a 1 (a evidência de antes da 0.13.26); só o inteiro 1, 2 ou 3 (a 3 desde a 0.14.1)
  if (Object.hasOwn(ev, "derivacao") && ![1, 2, 3].includes(ev.derivacao)) return falha("evidencia-invalida:derivacao");
  const concluida = ["ok", "achados"].includes(ev.resultado);
  if (concluida && semData(ev)) return falha("evidencia-invalida:executada_em");
  for (const [f, a] of Object.entries(ev.arquivos)) {
    const r = git("rev-parse", "--verify", "-q", `${sha}:./${f}`);
    if ((r.status === 0 ? r.stdout.trim() : null) !== (a === null ? null : a.blob)) return falha(`evidencia-nao-bate:${f}`);
  }
  const descoberto = naoCoberto(ev, sha);
  if (descoberto !== undefined) return falha(`evidencia-invalida:cobertura${descoberto ? `:${descoberto}` : ""}`);
  // indisponivel e incompleta: nada da CLI a conferir (o `veredito` as reprova ou avisa pelo motivo)
  if (!concluida) return { ev };
  const falta = semSinalDaCli(ev, sha) ?? achadosDivergem(ev, sha);
  return falta ? falha(`evidencia-invalida:${falta}`) : { ev };
}

/** O veredito de uma task: a evidência tem de existir, bater com o commit e não ter achado aberto. */
function veredito(task, sha) {
  if (op.modo === "desligada") return "ok";
  const nivel = op.modo === "obrigatoria" ? "FALHA" : "AVISO";
  const { ausente, falha, ev } = avaliar(task, sha);
  if (ausente) return `${nivel} evidencia-ausente`;
  if (falha) return `FALHA ${falha}`;
  if (ev.resultado === "indisponivel") return `${nivel} indisponivel:${ev.motivo}`;
  // a mudança que a CLI não cobre não depende do modo
  if (ev.resultado === "incompleta") return `FALHA incompleta:${ev.motivo}`;
  const abertos = ev.achados.filter((a) => a.estado === "aberto").length;
  return abertos > 0 ? `FALHA achados-abertos:${abertos}` : "ok";
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const ehCommit = (x) => typeof x === "string" && SHA.test(x) && git("cat-file", "-e", `${x}^{commit}`).status === 0;
/** As rejeições da própria evidência e das do trabalho, como estão no commit da task: identidade → `{task, motivo, em}`,
 *  a primeira de cada (as da própria evidência antes; `motivo` e `em` que não são texto, `null`). */
function rejeicoesNoCommit(ev, sha) {
  const m = new Map();
  const texto = (v) => (typeof v === "string" ? v : null);
  const poe = (task, lista) => {
    for (const r of Array.isArray(lista) ? lista : []) if (ehMapa(r) && !m.has(r.identidade)) m.set(r.identidade, { task, motivo: texto(r.motivo), em: texto(r.em) });
  };
  poe(ev.task, ev.rejeicoes);
  const dir = `docs/entregas/${op.trabalho}/revisao/`;
  const evidenciaDeTask = (n) =>
    /^T-(?:\d+|\d{2}\.\d{2})\.json$/.test(n.slice(dir.length));
  for (const n of git("ls-tree", "-z", "--name-only", sha, "--", dir).stdout.split("\0").filter(evidenciaDeTask)) {
    try {
      const outra = n.slice(dir.length, -".json".length);
      const lista = JSON.parse(git("show", `${sha}:./${n}`).stdout.replace(/^\uFEFF/, "")).rejeicoes;
      poe(outra, lista);
    } catch { /* evidência ilegível de outra task: não rejeita nada */ }
  }
  return m;
}
/** Em `ok`/`achados`, o campo que impede derivar os `achados` gravados das `issues` gravadas (`head`, `base_commit`),
 *  `achados` se eles (ou o `resultado`) não batem com a derivação, ou undefined. Rejeitado só vale com a identidade em
 *  `rejeicoes` da evidência ou de outra do trabalho no commit. */
function achadosDivergem(ev, sha) {
  const enviados = Object.values(ev.arquivos).some((a) => a?.revisao === "enviado");
  let derivados = [];
  if (enviados) {
    if (ev.head !== null && !ehCommit(ev.head)) return "head";
    if (ev.modo === "base-commit" ? !ehCommit(ev.base_commit) : ev.modo !== "uncommitted" || ev.base_commit !== null) return "base_commit";
    const de = ev.modo === "base-commit" ? ev.base_commit : ev.head;
    const texto = (f) => (blobGit(`${sha}:./${f}`) ?? Buffer.alloc(0)).toString("utf8");
    // a regra da evidência, não a deste script: sem `derivacao`, a 1 (o diff por arquivo, sem trecho movido)
    const alt = ev.derivacao >= 2 ? movidasPor(Object.keys(ev.arquivos), (f) => blobEm(de, f), (f) => blobEm(sha, f)) : (f) => alteradas(f, de, sha);
    // pelo JSON, como foi gravado (`NaN` vira `null`)
    const [issues, versao, extra] = ev.expx_revisao === 3
      ? [issuesDoCodex(ev.chamada_codex.issues), versaoDoRevisor(ev.revisor), extraDoCodex(ev.revisor.formato)] : [ev.chamada.issues, ev.cli.versao, undefined];
    derivados = JSON.parse(JSON.stringify(derivar(issues, ev.arquivos, versao, alt, texto, ev.derivacao ?? 1, extra)));
  }
  const rejeitadas = rejeicoesNoCommit(ev, sha);
  if (ev.achados.length !== derivados.length || derivados.some((d, k) => {
    const a = ev.achados[k];
    return ["identidade", "arquivo", "linha", "label", "texto"].some((c) => a[c] !== d[c])
      || !(a.estado === d.estado || (a.estado === "rejeitado" && rejeitadas.has(d.identidade)));
  })) return "achados";
  if (ev.achados.some((a) => a.estado === "aberto") !== (ev.resultado === "achados")) return "achados";
}

function conferir() {
  const linhas = op.tasks.map((p) => { const [task, sha] = p.split("="); return `${task} ${veredito(task, sha)}`; });
  process.stdout.write(`${linhas.join("\n")}\n`);
  process.exitCode = linhas.some((l) => l.includes(" FALHA ")) ? 1 : linhas.some((l) => l.includes(" AVISO ")) ? 3 : 0;
}

/** O que a mergex lê das evidências (D1, D2, condição 6 da M2), só da evidência que o `conferir` aceita: uma linha de JSON
 *  `{expx_revisao_listar: 1, trabalho, tasks: [...]}`, uma entrada por `--task`, na ordem dada. Sai 0 (todas listadas),
 *  1 (alguma `invalida`) ou 3 (alguma `ausente`, nenhuma `invalida`). Só leitura. */
function listar() {
  const texto = (v) => (typeof v === "string" ? v : null);
  const tasks = op.tasks.map((p) => {
    const [task, sha] = p.split("=");
    const { ausente, falha, ev } = avaliar(task, sha);
    if (!ev) {
      return { task, commit: sha, listagem: ausente ? "ausente" : "invalida", causa: ausente ? "evidencia-ausente" : falha, resultado: null, motivo: null,
        rejeitados: [], rejeicoes: [], removidos_sem_revisao: [] };
    }
    const rejeicoes = rejeicoesNoCommit(ev, sha);
    return { task, commit: sha, listagem: "ok", causa: null, resultado: ev.resultado,
      motivo: ["incompleta", "indisponivel"].includes(ev.resultado) ? texto(ev.motivo) : null,
      rejeitados: ev.achados.filter((a) => a.estado === "rejeitado").map((a) => ({ identidade: a.identidade, arquivo: texto(a.arquivo),
        linha: Number.isSafeInteger(a.linha) ? a.linha : null, label: texto(a.label), texto: texto(a.texto), rejeicao: rejeicoes.get(a.identidade) ?? null })),
      rejeicoes: ev.rejeicoes.map((r) => ({ identidade: r.identidade, motivo: r.motivo, em: r.em })),
      removidos_sem_revisao: [...ev.removidos_sem_revisao] };
  });
  process.stdout.write(`${JSON.stringify({ expx_revisao_listar: 1, trabalho: op.trabalho, tasks })}\n`);
  // `exitCode`, não `exit`: o JSON numa linha só é inteiro mesmo num pipe assíncrono (Windows)
  process.exitCode = tasks.some((t) => t.listagem === "invalida") ? 1 : tasks.some((t) => t.listagem === "ausente") ? 3 : 0;
}

/** `f` está no checkout, link quebrado inclusive (o `existsSync` segue o link e o daria por ausente; o git o commitaria).
 *  Só a ausência provada (`ENOENT`, `ENOTDIR`) é ausência: permissão ou E/S que falha não prova nada e conta como presente. */
function presenteSemSeguirLink(f) {
  try { lstatSync(join(op.raiz, f)); return true; } catch (e) { return !["ENOENT", "ENOTDIR"].includes(e?.code); }
}

function rejeitar() {
  const erro = comTrava(op.task, () => {
    let original;
    try { original = readFileSync(caminhoEv(op.task)); } catch { /* ausente: o `le` abaixo dá undefined */ }
    const ev = le(caminhoEv(op.task));
    const alvo = (ev?.achados ?? []).filter((a) => a.identidade === op.identidade);
    if (alvo.length === 0) return ev ? "achado nao encontrado" : "evidencia ausente";
    // o arquivo da task que mudou depois do `revisar` (ou o removido que voltou): a rejeição valeria para um conteúdo que
    // não vai ao commit, e o `conferir` reprovaria (`evidencia-nao-bate`). O `revisar` gravou o blob igual ao do checkout
    const arquivos = Object.entries(ehMapa(ev.arquivos) ? ev.arquivos : {});
    const desatualizado = () => arquivos.find(([f, m]) => (m === null ? presenteSemSeguirLink(f) : ehMapa(m) && m.blob !== idDe("hash-object", "--", f)))?.[0];
    const erroDe = (f) => `evidencia desatualizada: ${f} mudou depois do revisar; rode o revisar de novo`;
    const mudou = desatualizado();
    if (mudou !== undefined) return erroDe(mudou);
    pausaDeTeste();
    for (const a of alvo) a.estado = "rejeitado";
    ev.rejeicoes = [...(Array.isArray(ev.rejeicoes) ? ev.rejeicoes : []), { identidade: op.identidade, motivo: op.motivo, em: new Date().toISOString() }];
    // rejeitar um achado não muda o que a revisão não pôde fazer (indisponivel) nem o que ela não cobriu (incompleta)
    if (!["indisponivel", "incompleta"].includes(ev.resultado)) ev.resultado = ev.achados.some((a) => a.estado === "aberto") ? "achados" : "ok";
    grava(op.task, ev);
    // a trava só protege a evidência: o arquivo que mudou entre a conferência e a gravação (CodeAnt no katosmv/login#79)
    // desfaz a gravação, e a evidência fica como estava
    const depois = desatualizado();
    if (depois !== undefined) {
      const tmp = `${caminhoEv(op.task)}.${process.pid}.tmp`;
      writeFileSync(tmp, original);
      renameSync(tmp, caminhoEv(op.task));
      return erroDe(depois);
    }
    process.stdout.write(`${op.task} ${ev.resultado}${["indisponivel", "incompleta"].includes(ev.resultado) ? `:${ev.motivo}` : ""}\n`);
    return undefined;
  });
  if (erro) {
    process.stderr.write(`expx-revisao: ${erro}: ${op.task} ${op.identidade}\n`);
    process.exit(1);
  }
}

// Exceção não tratada sairia 1, o código de `achados` no `revisar` e de FALHA no `conferir` (CodeAnt no katosmv/login#73):
// sai 70 (EX_SOFTWARE). `process.exit` (64, 75) não é exceção e não passa por aqui. Limite aceito: erro antes do despacho
// (import que falha) continua 1 do Node; quem chama só lê `achados` com a linha `<T-NN.MM> achados`.
try { ({ revisar, conferir, rejeitar, listar })[cmd](); } catch (e) {
  process.stderr.write(`expx-revisao: erro interno: ${e?.stack ?? e}\n`);
  process.exitCode = 70;
}
