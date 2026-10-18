import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";

const SCRIPT = join(RAIZ_DO_REPO, "nucleo", "scripts", "expx-fatiamento.mjs");
const criados: string[] = [];
afterEach(() => {
  for (const c of criados.splice(0)) rmSync(c, { recursive: true, force: true });
});

/** Projeto temporário; `conteudo` (texto cru ou objeto) vira `.expx/fatiamento.json`. */
function projeto(conteudo?: string | object): string {
  const raiz = mkdtempSync(join(tmpdir(), "expx-fatiamento-"));
  criados.push(raiz);
  mkdirSync(join(raiz, ".expx"));
  const texto = typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo);
  if (conteudo !== undefined) writeFileSync(join(raiz, ".expx", "fatiamento.json"), texto);
  return raiz;
}

function roda(raiz: string, ...args: string[]): { rc: number | null; out: string; err: string } {
  const r = spawnSync(process.execPath, [SCRIPT, "--raiz", raiz, ...args], { encoding: "utf8" });
  return { rc: r.status, out: r.stdout, err: r.stderr };
}
const barra = (c: string): string => c.replace(/\\/g, "/");
const CONSELHO = { expx_fatiamento: 1, justificativa: "sprint de ~8 tasks", entrega: "por_sprint",
  legibilidade: { pr_linhas: 2500, pr_arquivos: 80, commit_linhas: 300 }, revisao_por_task: { modo: "obrigatoria" } };

describe("expx-fatiamento.mjs", () => {
  it("funcional: sem arquivo, sai 0 com os padrões", () => {
    const r = roda(projeto());
    expect(r.rc).toBe(0);
    const esperado = "FATIA_MAX_LINHAS_PR=400 FATIA_MAX_ARQUIVOS=20 FATIA_MAX_LINHAS_COMMIT=300 FATIA_CAPACIDADE_ARQUIVOS=100";
    for (const l of `${esperado} EXPX_REVISAO_POR_TASK=se_disponivel EXPX_ENTREGA=por_trabalho EXPX_FATIAMENTO_ORIGEM=padrao`.split(" ")) expect(r.out.split("\n")).toContain(l);
  });

  it("funcional: a calibragem do conselho é válida", () => {
    const r = roda(projeto(CONSELHO));
    expect(r.rc).toBe(0);
    for (const l of ["FATIA_MAX_LINHAS_PR=2500", "FATIA_MAX_ARQUIVOS=80", "EXPX_ENTREGA=por_sprint"]) expect(r.out.split("\n")).toContain(l);
  });

  it.each([
    ["afrouxar sem revisão obrigatória", { ...CONSELHO, revisao_por_task: { modo: "se_disponivel" } }, "revisao_por_task.modo"],
    ["limite diferente do padrão sem justificativa", { ...CONSELHO, justificativa: " " }, "justificativa"],
    ["pr_arquivos acima de 100", { ...CONSELHO, legibilidade: { pr_arquivos: 101 } }, "legibilidade.pr_arquivos"],
    ["arquivo.linhas acima de 5000", { ...CONSELHO, arquivo: { linhas: 5001 } }, "arquivo.linhas"],
    ["chave desconhecida", { expx_fatiamento: 1, limites: {} }, "limites"],
    ["versão desconhecida", { expx_fatiamento: 2 }, "expx_fatiamento"],
    ["inteiro que estoura a aritmética do bash", { ...CONSELHO, arquivo: { kb: 2 ** 53 } }, "arquivo.kb"],
    ["ignorar com regex inválida", { expx_fatiamento: 1, ignorar: ["(sem-fechar"] }, "ignorar[0]"],
    ["regex só do JavaScript (o verificador usa ERE)", { expx_fatiamento: 1, ignorar: ["^a/", "(?=src/)", "\\d"] }, "ignorar[1]"],
    // o Git Bash e o macOS recusam ("repetition-operator operand invalid") e a exclusão não exclui nada
    ["quantificador repetido a+?", { expx_fatiamento: 1, ignorar: ["^a/", "a+?"] }, "ignorar[1]"],
    ["quantificador repetido a*+", { expx_fatiamento: 1, capacidade: { excluido_no_painel: ["^b/", "^c/", "a*+"] } }, "capacidade.excluido_no_painel[2]"],
    ["quantificador repetido x{2}?", { expx_fatiamento: 1, ignorar: ["x{2}?"] }, "ignorar[0]"],
    ["quantificador repetido após barra escapada", { expx_fatiamento: 1, ignorar: ["^a/", "a\\\\+?"] }, "ignorar[1]"],
    // alternativa vazia: o Git Bash e o macOS recusam ("empty (sub)expression"); o glibc aceita, vale o mais estrito
    ...["a|", "|a", "(|a)", "a||b"].map((p) => [`alternativa vazia ${p}`, { expx_fatiamento: 1, ignorar: ["^a/", p] }, "ignorar[1]"]),
    // chave que não forma intervalo: literal no JavaScript, recusada pelo Git Bash e pelo macOS
    ...["{", "a{", "a{1", "a{,3}", "a{x}", "({)", "a|{b", "a{0}", "a{256}"].map((p) => [`chave ${p}`, { expx_fatiamento: 1, ignorar: ["^a/", p] }, "ignorar[1]"]),
  ])("funcional: %s é inválido (rc 1, stderr cita a chave, stdout vazio)", (_nome, conteudo, chave) => {
    const r = roda(projeto(conteudo));
    expect(r.rc).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toContain(`expx-fatiamento: ${chave}:`);
  });

  it("funcional: ERE que o Git Bash aceita continua válido", () => {
    const ignorar = ["[+?]", "\\+?", "a+|b?", "()", "^|a", "a|$", "(^a|b$)", "a{0,}", "a{0,1}", "a{1,255}", "(){1}", "\\{", "[{]", "a}"];
    const r = roda(projeto({ expx_fatiamento: 1, ignorar }), "--formato", "json");
    expect(r).toMatchObject({ rc: 0, err: "" });
    expect(JSON.parse(r.out).ignorar).toEqual(ignorar);
  });

  it("funcional: ignorar soma aos padrões e sai em FATIA_IGNORAR_PROJETO", () => {
    const r = roda(projeto({ expx_fatiamento: 1, ignorar: ["^gerado/"] }));
    expect(r.rc).toBe(0);
    expect(r.out.split("\n")).toContain("FATIA_IGNORAR_PROJETO=^gerado/");
  });

  it("funcional: JSON com BOM e CRLF (editor do Windows) é lido", () => {
    const texto = "\uFEFF" + JSON.stringify(CONSELHO, null, 2).replace(/\n/g, "\r\n") + "\r\n";
    const r = roda(projeto(texto));
    expect(r.rc).toBe(0);
    expect(r.out.split("\n")).toContain("FATIA_MAX_LINHAS_PR=2500");
  });

  it("funcional: JSON malformado é inválido, nunca os padrões", () => {
    expect(roda(projeto('{"expx_fatiamento": 1,'))).toMatchObject({ rc: 1, out: "", err: expect.stringContaining("expx-fatiamento: ") });
  });

  // sem privilégio de link (Windows sem modo desenvolvedor) o caso roda no CI Linux/macOS
  it.skipIf(!suportaSymlinkDeDiretorio())("funcional: link simbólico quebrado é arquivo presente e inválido, nunca os padrões", () => {
    const raiz = projeto();
    symlinkSync(join(raiz, "nao-existe.json"), join(raiz, ".expx", "fatiamento.json"));
    expect(roda(raiz)).toMatchObject({ rc: 1, out: "", err: expect.stringContaining("expx-fatiamento: ") });
  });

  it("funcional: --formato json traz os padrões preenchidos; --validar não imprime nada", () => {
    const raiz = projeto({ expx_fatiamento: 1, ignorar: ["^gerado/"] });
    expect(JSON.parse(roda(raiz, "--formato", "json").out)).toMatchObject({ origem: "projeto", ignorar: ["^gerado/"], revisao_por_task: { modo: "se_disponivel" }, entrega: "por_trabalho",
      legibilidade: { pr_linhas: 400, pr_arquivos: 20, commit_linhas: 300 }, arquivo: { kb: 150, linhas: 4000 },
      capacidade: { pr_arquivos: 100, excluido_no_painel: ["^docs/(sprintx|entregas|eventos)/"] } });
    expect(roda(raiz, "--validar")).toMatchObject({ rc: 0, out: "" });
    expect(roda(raiz, "--formato", "yaml").rc).toBe(2);
  });

  it("funcional: o env é seguro para eval no bash", () => {
    const raiz = projeto({ expx_fatiamento: 1, ignorar: ["^a b/", "^x'y/"] });
    // caminhos por env: argumento com `\` passado ao bash pelo Node é mutilado no Windows
    const r = spawnSync(bashDosHooks(), ["-c", 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")"; printf %s "$FATIA_IGNORAR_PROJETO"'], {
      encoding: "utf8",
      env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz) },
    });
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("^a b/|^x'y/");
  });
});
