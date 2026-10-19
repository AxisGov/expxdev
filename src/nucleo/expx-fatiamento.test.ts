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
// a validação ERE só sobrou para os caminhos protegidos do merge automático
const ere = (l: unknown[]) => ({ expx_fatiamento: 2, merge_automatico: { caminhos_protegidos: l } });
const CP = "merge_automatico.caminhos_protegidos";
const PADRAO = ["(^|/)auth/", "(^|/)autenticacao/", "(^|/)login/", "(^|/)(permiss|rls|polic(y|ies))", "(^|/)(migrations?|migracoes?|migrate)/",
  "\\.sql$", "^\\.github/", "^(infra|deploy|terraform|k8s|docker)/", "(^|/)Dockerfile$", "(^|/)\\.env", "(^|/)secrets?/"];
// a calibragem antiga do conselho (versão 1), que a emenda de 2026-10-19 remove
const CONSELHO_V1 = { expx_fatiamento: 1, justificativa: "sprint de ~8 tasks", entrega: "por_sprint",
  legibilidade: { pr_linhas: 2500, pr_arquivos: 80, commit_linhas: 300 }, revisao_por_task: { modo: "obrigatoria" } };
const REMOVIDA = "removida pela emenda de 2026-10-19 (limites do CodeAnt, fixos); apague-a";

describe("expx-fatiamento.mjs", () => {
  it("funcional: sem arquivo, sai 0, só EXPX_*", () => {
    const r = roda(projeto());
    expect(r.rc).toBe(0);
    const linhas = r.out.split("\n");
    expect(linhas.filter((l) => l.startsWith("FATIA_"))).toEqual([]);
    for (const l of ["EXPX_REVISAO_POR_TASK=se_disponivel", "EXPX_ENTREGA=por_trabalho", "EXPX_FATIAMENTO_ORIGEM=padrao"]) expect(linhas).toContain(l);
  });

  it("funcional: versão 2 mínima é válida", () => {
    const r = roda(projeto({ expx_fatiamento: 2, entrega: "por_sprint" }));
    expect(r).toMatchObject({ rc: 0, err: "" });
    expect(r.out.split("\n")).toContain("EXPX_ENTREGA=por_sprint");
    expect(r.out.split("\n")).toContain("EXPX_FATIAMENTO_ORIGEM=projeto");
  });

  it("funcional: versão 1 dá a mensagem de migração e lista as chaves removidas", () => {
    const r = roda(projeto(CONSELHO_V1));
    expect(r).toMatchObject({ rc: 1, out: "" });
    expect(r.err).toContain("expx-fatiamento: expx_fatiamento: versão 1: migre para 2 (emenda de 2026-10-19)\n");
    expect(r.err).toContain(`expx-fatiamento: legibilidade: ${REMOVIDA}\n`);
    expect(r.err).toContain(`expx-fatiamento: justificativa: ${REMOVIDA}\n`);
  });

  it.each([
    ["legibilidade", { pr_linhas: 400 }],
    ["arquivo", { kb: 150 }],
    ["justificativa", "x"],
    ["capacidade", { excluido_no_painel: ["^docs/"] }],
  ])("funcional: %s na versão 2 é chave removida, com mensagem própria", (chave, valor) => {
    const r = roda(projeto({ expx_fatiamento: 2, [chave]: valor }));
    expect(r).toMatchObject({ rc: 1, out: "" });
    expect(r.err).toBe(`expx-fatiamento: ${chave}: ${REMOVIDA}\n`);
  });

  it("funcional: ignorar na versão 2 foi substituída por excluir_da_revisao", () => {
    const r = roda(projeto({ expx_fatiamento: 2, ignorar: ["^gerado/"] }));
    expect(r).toMatchObject({ rc: 1, out: "" });
    expect(r.err).toBe("expx-fatiamento: ignorar: substituída por `excluir_da_revisao`, só para classes de artefato; ver o contrato\n");
  });

  it.each([["3", { expx_fatiamento: 3 }], ["texto \"2\"", { expx_fatiamento: "2" }], ["ausente", { entrega: "por_sprint" }]])(
    "funcional: versão %s é desconhecida", (_nome, conteudo) => {
      const r = roda(projeto(conteudo));
      expect(r).toMatchObject({ rc: 1, out: "" });
      expect(r.err).toBe("expx-fatiamento: expx_fatiamento: versão desconhecida (esperada 2)\n");
    });

  it("funcional: chave desconhecida continua inválida", () => {
    const r = roda(projeto({ expx_fatiamento: 2, limites: {} }));
    expect(r).toMatchObject({ rc: 1, out: "" });
    expect(r.err).toBe("expx-fatiamento: limites: chave desconhecida\n");
  });

  it.each([
    ["regex inválida", ere(["(sem-fechar"]), `${CP}[0]`],
    ["regex só do JavaScript (o verificador usa ERE)", ere(["^a/", "(?=src/)", "\\d"]), `${CP}[1]`],
    // o Git Bash e o macOS recusam ("repetition-operator operand invalid") e a exclusão não exclui nada
    ["quantificador repetido a+?", ere(["^a/", "a+?"]), `${CP}[1]`],
    ["quantificador repetido a*+", ere(["^b/", "^c/", "a*+"]), `${CP}[2]`],
    ["quantificador repetido x{2}?", ere(["x{2}?"]), `${CP}[0]`],
    ["quantificador repetido após barra escapada", ere(["^a/", "a\\\\+?"]), `${CP}[1]`],
    // alternativa vazia: o Git Bash e o macOS recusam ("empty (sub)expression"); o glibc aceita, vale o mais estrito
    ...["a|", "|a", "(|a)", "a||b"].map((p) => [`alternativa vazia ${p}`, ere(["^a/", p]), `${CP}[1]`]),
    // chave que não forma intervalo: literal no JavaScript, recusada pelo Git Bash e pelo macOS
    ...["{", "a{", "a{1", "a{,3}", "a{x}", "({)", "a|{b", "a{0}", "a{256}"].map((p) => [`chave ${p}`, ere(["^a/", p]), `${CP}[1]`]),
    // grupo do JavaScript continua inválido depois de a checagem passar a ignorar o parêntese escapado
    ...["(?:a)", "(?=a)", "x(?!a)"].map((p) => [`grupo ${p}`, ere(["\\(?", p]), `${CP}[1]`]),
    // em classe, só as 12 classes POSIX em minúsculas e elemento de um caractere (Git Bash e glibc recusam o resto)
    ...["[[:not_a_class:]]", "[[:ALPHA:]]", "[[.ab.]]", "[[=ab=]]", "[[:alpha]]", "[a[.b]", "[[:alpha:]"].map((p) => [`classe ${p}`, ere(["^a/", p]), `${CP}[1]`]),
  ])("funcional: %s é inválido (rc 1, stderr cita a chave, stdout vazio)", (_nome, conteudo, chave) => {
    const r = roda(projeto(conteudo));
    expect(r.rc).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toContain(`expx-fatiamento: ${chave}:`);
  });

  it("funcional: ERE que o Git Bash aceita continua válido", () => {
    const lista = ["[+?]", "\\+?", "a+|b?", "()", "^|a", "a|$", "(^a|b$)", "a{0,}", "a{0,1}", "a{1,255}", "(){1}", "\\{", "[{]", "a}", "\\(?", "[(?]", "a\\(?b\\)?", "[\\w]", "[\\d]", "a\\\\d", "[[:alpha:]]", "[a[:xdigit:]_]", "[[.a.]]", "[[=a=]]", "[[.].]]", "[:alpha:]"];
    const r = roda(projeto(ere(lista)), "--formato", "json");
    expect(r).toMatchObject({ rc: 0, err: "" });
    expect(JSON.parse(r.out).merge_automatico.caminhos_protegidos).toEqual([...PADRAO, ...lista]);
  });

  it("funcional: classe com muitos `[:` é validada em tempo linear", () => {
    // antes, cada `[:` buscava o `:]` até o fim do texto: 300 mil caracteres levavam dezenas de segundos
    for (const [classe, rc] of [[`[${"[:a".repeat(100_000)}]`, 1], [`[${"[:alpha:]:a".repeat(30_000)}]`, 0]] as const) {
      const t = Date.now();
      expect(roda(projeto(ere([classe])), "--validar").rc).toBe(rc);
      expect(Date.now() - t).toBeLessThan(5000);
    }
  });

  it("funcional: JSON com BOM e CRLF (editor do Windows) é lido", () => {
    const texto = "\uFEFF" + JSON.stringify({ expx_fatiamento: 2, entrega: "por_sprint" }, null, 2).replace(/\n/g, "\r\n") + "\r\n";
    const r = roda(projeto(texto));
    expect(r.rc).toBe(0);
    expect(r.out.split("\n")).toContain("EXPX_ENTREGA=por_sprint");
  });

  it("funcional: JSON malformado é inválido, nunca os padrões", () => {
    expect(roda(projeto('{"expx_fatiamento": 2,'))).toMatchObject({ rc: 1, out: "", err: expect.stringContaining("expx-fatiamento: ") });
  });

  // sem privilégio de link (Windows sem modo desenvolvedor) o caso roda no CI Linux/macOS
  it.skipIf(!suportaSymlinkDeDiretorio())("funcional: link simbólico quebrado é arquivo presente e inválido, nunca os padrões", () => {
    const raiz = projeto();
    symlinkSync(join(raiz, "nao-existe.json"), join(raiz, ".expx", "fatiamento.json"));
    expect(roda(raiz)).toMatchObject({ rc: 1, out: "", err: expect.stringContaining("expx-fatiamento: ") });
  });

  it("funcional: --formato json traz só as chaves da versão 2, com os padrões; --validar não imprime nada", () => {
    const raiz = projeto({ expx_fatiamento: 2 });
    expect(JSON.parse(roda(raiz, "--formato", "json").out)).toEqual({ origem: "projeto", revisao_por_task: { modo: "se_disponivel" }, entrega: "por_trabalho",
      merge_automatico: { ativo: false, caminhos_protegidos: PADRAO }, revisor_bot: [] });
    expect(roda(raiz, "--validar")).toMatchObject({ rc: 0, out: "" });
    expect(roda(raiz, "--formato", "yaml").rc).toBe(2);
  });

  it("funcional: o env é seguro para eval no bash", () => {
    const raiz = projeto({ expx_fatiamento: 2, merge_automatico: { caminhos_protegidos: ["^a b/", "^x'y/"] } });
    // caminhos por env: argumento com `\` passado ao bash pelo Node é mutilado no Windows
    const r = spawnSync(bashDosHooks(), ["-c", 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")"; printf %s "$EXPX_CAMINHOS_PROTEGIDOS"'], {
      encoding: "utf8",
      env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz) },
    });
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe([...PADRAO, "^a b/", "^x'y/"].join("|"));
  });

  describe("merge_automatico", () => {
    it("funcional: ausente, desligado e com a lista padrão (env e json)", () => {
      const raiz = projeto({ expx_fatiamento: 2 });
      const linhas = roda(raiz).out.split("\n");
      expect(linhas).toContain("EXPX_MERGE_AUTOMATICO=nao");
      expect(linhas).toContain(`EXPX_CAMINHOS_PROTEGIDOS='${PADRAO.join("|")}'`);
      expect(JSON.parse(roda(raiz, "--formato", "json").out).merge_automatico).toEqual({ ativo: false, caminhos_protegidos: PADRAO });
      expect(roda(projeto()).out.split("\n")).toContain("EXPX_MERGE_AUTOMATICO=nao");
    });

    it("funcional: ativo com lista do projeto soma à padrão, nunca a substitui", () => {
      const raiz = projeto({ expx_fatiamento: 2, merge_automatico: { ativo: true, caminhos_protegidos: ["^src/pagamentos/"] } });
      expect(roda(raiz).out.split("\n")).toContain("EXPX_MERGE_AUTOMATICO=sim");
      expect(JSON.parse(roda(raiz, "--formato", "json").out).merge_automatico).toEqual({ ativo: true, caminhos_protegidos: [...PADRAO, "^src/pagamentos/"] });
    });

    it.each([
      ["ativo não booleano", { ativo: "sim" }, "merge_automatico.ativo"],
      ["regex fora do ERE", { ativo: true, caminhos_protegidos: ["^a/", "(?=src/)"] }, `${CP}[1]`],
      ["caminhos_protegidos que não é lista", { caminhos_protegidos: "^a/" }, CP],
      ["chave desconhecida dentro", { ativo: false, liberar: true }, "merge_automatico.liberar"],
      ["não objeto", true, "merge_automatico"],
    ])("funcional: %s é inválido", (_nome, merge_automatico, chave) => {
      const r = roda(projeto({ expx_fatiamento: 2, merge_automatico }));
      expect(r).toMatchObject({ rc: 1, out: "" });
      expect(r.err).toContain(`expx-fatiamento: ${chave}:`);
    });

    it("funcional: o env é seguro para eval e os padrões casam no ERE do bash", () => {
      const raiz = projeto({ expx_fatiamento: 2, merge_automatico: { ativo: true, caminhos_protegidos: ["^a b/", "^x'y/"] } });
      const protegidos = ["src/auth/x.ts", "a/autenticacao/b", "login/p.tsx", "src/permissoes.ts", "lib/rls.ts", "supabase/policies/a", "src/policy.ts", "db/migrate/1.rb",
        "supabase/migrations/1.sql", "consultas/a.sql", ".github/workflows/ci.yml", "infra/main.tf", "api/Dockerfile", ".env.local", "config/secrets/k", "a b/c", "x'y/z"];
      const livres = ["src/app.ts", "docs/authors.md", "src/mylogin/a.ts", "src/infra/a.ts", "Dockerfile.md", "a/b.sqlite"];
      const script = 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")" || exit 9; printf "%s\\n" "$EXPX_MERGE_AUTOMATICO"; '
        + 'while IFS= read -r c; do if [[ $c =~ $EXPX_CAMINHOS_PROTEGIDOS ]]; then echo "P $c"; else echo "L $c (rc $?)"; fi; done <<< "$CAMINHOS"';
      // caminhos por env: no Windows o Node junta argumentos com aspas simples e o bash os remonta errado
      const r = spawnSync(bashDosHooks(), ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz), CAMINHOS: [...protegidos, ...livres].join("\n") },
      });
      expect(r.stderr).toBe("");
      expect(r.stdout.split("\n").filter(Boolean)).toEqual(["sim", ...protegidos.map((c) => `P ${c}`), ...livres.map((c) => `L ${c} (rc 1)`)]);
    });
  });
  describe("revisor_bot", () => {
    it("funcional: ausente ou vazia, nenhum (env vazio, json [])", () => {
      for (const raiz of [projeto(), projeto({ expx_fatiamento: 2 }), projeto({ expx_fatiamento: 2, revisor_bot: [] })]) {
        expect(roda(raiz).out.split("\n")).toContain("EXPX_REVISOR_BOT=");
        expect(JSON.parse(roda(raiz, "--formato", "json").out).revisor_bot).toEqual([]);
      }
    });

    it("funcional: lista válida sai unida por vírgula, sem exigir merge_automatico", () => {
      const raiz = projeto({ expx_fatiamento: 2, revisor_bot: ["codeant-ai[bot]", "outro-bot"] });
      expect(roda(raiz).out.split("\n")).toContain("EXPX_REVISOR_BOT='codeant-ai[bot],outro-bot'");
      expect(JSON.parse(roda(raiz, "--formato", "json").out).revisor_bot).toEqual(["codeant-ai[bot]", "outro-bot"]);
    });

    it.each([
      ["login com espaço", ["ok", "codeant ai"], "revisor_bot[1]"],
      ["[bot] no meio", ["codeant[bot]-ai"], "revisor_bot[0]"],
      ["login vazio", ["ok", "x", ""], "revisor_bot[2]"],
      ["começa com hífen", ["-bot"], "revisor_bot[0]"],
      ["item que não é texto", [7], "revisor_bot[0]"],
      ["duplicata", ["outro-bot", "outro-bot"], "revisor_bot[1]"],
      ["não lista", "codeant-ai[bot]", "revisor_bot"],
      ["objeto", { login: "a" }, "revisor_bot"],
    ])("funcional: %s é inválido", (_nome, revisor_bot, chave) => {
      const r = roda(projeto({ expx_fatiamento: 2, revisor_bot }));
      expect(r).toMatchObject({ rc: 1, out: "" });
      // a chave é conhecida: o erro é do formato, nunca "chave desconhecida"
      expect(r.err).toContain(`expx-fatiamento: ${chave}: deve `);
    });

    it("funcional: lista longa é validada em tempo linear", () => {
      // antes, cada login procurava a duplicata do começo da lista: 100 mil levavam ~12 s
      const t = Date.now();
      const r = roda(projeto({ expx_fatiamento: 2, revisor_bot: Array.from({ length: 100_000 }, (_, i) => `bot-${i}`) }), "--validar");
      expect(r.rc).toBe(0);
      expect(Date.now() - t).toBeLessThan(5000);
    });

    it("funcional: o env é seguro para eval e separa os logins por vírgula", () => {
      const raiz = projeto({ expx_fatiamento: 2, revisor_bot: ["codeant-ai[bot]", "outro-bot"] });
      const script = 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")" || exit 9; IFS=, read -ra l <<< "$EXPX_REVISOR_BOT"; printf "%s\\n" "${l[@]}"';
      const r = spawnSync(bashDosHooks(), ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz) },
      });
      expect(r.stderr).toBe("");
      expect(r.stdout).toBe("codeant-ai[bot]\noutro-bot\n");
    });
  });
});
