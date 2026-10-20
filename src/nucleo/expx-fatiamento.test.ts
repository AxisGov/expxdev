import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bashDosHooks, RAIZ_DO_REPO } from "../teste/candidatos.js";
import { suportaSymlinkDeDiretorio } from "../teste/fs-capacidades.js";

// hermético: `FATIA_*` do shell de quem roda (reservadas, emenda de 2026-10-19) não vazam para os casos
for (const k of Object.keys(process.env)) if (k.startsWith("FATIA_")) delete process.env[k];
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
    for (const l of ["EXPX_REVISAO_POR_TASK=se_disponivel", "EXPX_ENTREGA=por_trabalho", "EXPX_FATIAMENTO_ORIGEM=padrao",
      "EXPX_PERFIL_CLI=codeant-cli@0.5.14", "EXPX_L1_ARQUIVOS=40", "EXPX_L2_LINHAS=5000", "EXPX_L2_BYTES=204800",
      "EXPX_L3_ARQUIVOS=100"]) expect(linhas).toContain(l);
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
    // a migração primeiro, depois uma linha por chave removida, na ordem do arquivo; nenhuma "chave desconhecida"
    expect(r.err).toBe(["expx-fatiamento: expx_fatiamento: versão 1: migre para 2 (emenda de 2026-10-19)",
      `expx-fatiamento: justificativa: ${REMOVIDA}`, `expx-fatiamento: legibilidade: ${REMOVIDA}`, ""].join("\n"));
    expect(r.err).not.toContain("chave desconhecida");
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
    ["regex só do JavaScript (o merge automático usa ERE)", ere(["^a/", "(?=src/)", "\\d"]), `${CP}[1]`],
    // o Git Bash e o macOS recusam ("repetition-operator operand invalid") e o caminho protegido não protege nada
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
      merge_automatico: { ativo: false, caminhos_protegidos: PADRAO }, revisor_bot: [], excluir_da_revisao: [],
      limites: { perfil_cli: "codeant-cli@0.5.14", l1_arquivos: 40, l2_linhas: 5000, l2_bytes: 204800, l3_arquivos: 100 } });
    expect(roda(raiz, "--validar")).toMatchObject({ rc: 0, out: "" });
    expect(roda(raiz, "--formato", "yaml").rc).toBe(2);
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
      const script = 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")" || exit 9; printf "%s\\n" "$EXPX_MERGE_AUTOMATICO" "$EXPX_CAMINHOS_PROTEGIDOS"; '
        + 'while IFS= read -r c; do if [[ $c =~ $EXPX_CAMINHOS_PROTEGIDOS ]]; then echo "P $c"; else echo "L $c (rc $?)"; fi; done <<< "$CAMINHOS"';
      // caminhos por env: no Windows o Node junta argumentos com aspas simples e o bash os remonta errado
      const r = spawnSync(bashDosHooks(), ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz), CAMINHOS: [...protegidos, ...livres].join("\n") },
      });
      expect(r.stderr).toBe("");
      // o valor chega inteiro ao bash (espaço e aspa simples), e cada padrão casa
      expect(r.stdout.split("\n").filter(Boolean)).toEqual(["sim", [...PADRAO, "^a b/", "^x'y/"].join("|"), ...protegidos.map((c) => `P ${c}`), ...livres.map((c) => `L ${c} (rc 1)`)]);
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
  describe("excluir_da_revisao", () => {
    // o exemplo da §5 da emenda
    const ITEM = { padrao: "^fixtures/candidatos/", classe: "copia", origem: "scripts/atualizar-candidatos.sh",
      motivo: "cópia das skills candidatas, revisada no repositório de origem" };
    const lista = (l: unknown) => ({ expx_fatiamento: 2, excluir_da_revisao: l });
    const EXCL = "excluir_da_revisao";

    it("funcional: o exemplo da emenda é válido (env e json)", () => {
      const raiz = projeto({ expx_fatiamento: 2, revisao_por_task: { modo: "obrigatoria" }, entrega: "por_sprint",
        merge_automatico: { ativo: true, caminhos_protegidos: ["^src/pagamentos/"] }, revisor_bot: ["codeant-ai[bot]"], excluir_da_revisao: [ITEM] });
      const r = roda(raiz);
      expect(r).toMatchObject({ rc: 0, err: "" });
      expect(r.out.split("\n")).toContain("EXPX_EXCLUIR_DA_REVISAO=^fixtures/candidatos/");
      expect(JSON.parse(roda(raiz, "--formato", "json").out).excluir_da_revisao).toEqual([ITEM]);
    });

    it("funcional: sem lista, EXPX_EXCLUIR_DA_REVISAO vazio e json [] (o núcleo não se declara)", () => {
      for (const raiz of [projeto(), projeto({ expx_fatiamento: 2 }), projeto(lista([]))]) {
        expect(roda(raiz).out.split("\n")).toContain("EXPX_EXCLUIR_DA_REVISAO=");
        expect(JSON.parse(roda(raiz, "--formato", "json").out).excluir_da_revisao).toEqual([]);
      }
    });

    it("funcional: raiz de código liberada por pasta gerada e ponto escapado são válidos; o env é seguro para eval", () => {
      const raiz = projeto(lista([{ ...ITEM, padrao: "^scripts/ci/fixtures/candidatos/" }, { ...ITEM, padrao: "^a\\.b c/", classe: "gerado" }]));
      const script = 'eval "$("$NODE" "$SCRIPT" --raiz "$RAIZ")" || exit 9; printf %s "$EXPX_EXCLUIR_DA_REVISAO"';
      const r = spawnSync(bashDosHooks(), ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, NODE: barra(process.execPath), SCRIPT: barra(SCRIPT), RAIZ: barra(raiz) },
      });
      expect(r.stderr).toBe("");
      expect(r.stdout).toBe("^scripts/ci/fixtures/candidatos/|^a\\.b c/");
    });

    it.each([
      ["não lista", ITEM, EXCL],
      ["item que não é objeto", ["^fixtures/"], `${EXCL}[0]`],
      ["chave a mais", [{ ...ITEM, extra: 1 }], `${EXCL}[0].extra`],
      ["chave a menos", [{ padrao: ITEM.padrao, classe: "copia", origem: "x" }], `${EXCL}[0].motivo`],
      ["padrão com glob", [ITEM, { ...ITEM, padrao: "^a/*/" }], `${EXCL}[1].padrao`],
      ["padrão sem / no fim", [{ ...ITEM, padrao: "^gerado" }], `${EXCL}[0].padrao`],
      ["padrão com alternativa", [{ ...ITEM, padrao: "^(a|b)/" }], `${EXCL}[0].padrao`],
      ["padrão que não é texto", [{ ...ITEM, padrao: 7 }], `${EXCL}[0].padrao`],
      ["raiz de código ^src/", [{ ...ITEM, padrao: "^src/" }], `${EXCL}[0].padrao`],
      ["raiz de código ^scripts/", [{ ...ITEM, padrao: "^scripts/" }], `${EXCL}[0].padrao`],
      ["raiz de código ^\\.github/", [{ ...ITEM, padrao: "^\\.github/" }], `${EXCL}[0].padrao`],
      ["padrão repetido", [ITEM, { ...ITEM, classe: "gerado" }], `${EXCL}[1].padrao`],
      ["classe fora de gerado|copia", [{ ...ITEM, classe: "codigo" }], `${EXCL}[0].classe`],
      ["origem só com espaço", [{ ...ITEM, origem: " " }], `${EXCL}[0].origem`],
      ["motivo vazio", [{ ...ITEM, motivo: "" }], `${EXCL}[0].motivo`],
      ["motivo que não é texto", [{ ...ITEM, motivo: ["x"] }], `${EXCL}[0].motivo`],
    ])("funcional: %s é inválido (rc 1, cita a chave)", (_nome, l, chave) => {
      const r = roda(projeto(lista(l)));
      expect(r).toMatchObject({ rc: 1, out: "" });
      expect(r.err).toContain(`expx-fatiamento: ${chave}: `);
      // a chave é conhecida: nunca a "chave desconhecida" genérica
      expect(r.err).not.toContain(`${EXCL}: chave desconhecida`);
    });

    it("funcional: o padrão repetido cita o primeiro", () => {
      const r = roda(projeto(lista([ITEM, { ...ITEM, classe: "gerado" }])));
      expect(r.err).toBe(`expx-fatiamento: ${EXCL}[1].padrao: deve aparecer uma vez (repete o item 0)\n`);
    });
  });

  describe("FATIA_* reservados", () => {
    const MSG = (n: string) => `expx-fatiamento: \`${n}\` não é mais lida (limites do CodeAnt, fixos: emenda de 2026-10-19); remova-a do ambiente\n`;
    const comEnv = (env: Record<string, string>, raiz: string, ...args: string[]) => {
      const r = spawnSync(process.execPath, [SCRIPT, "--raiz", raiz, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
      return { rc: r.status, out: r.stdout, err: r.stderr };
    };

    it("funcional: FATIA_MAX_LINHAS_PR=400 no ambiente falha com a mensagem exata, também sem arquivo e com --validar", () => {
      for (const raiz of [projeto({ expx_fatiamento: 2 }), projeto()]) {
        for (const args of [[], ["--validar"], ["--formato", "json"]]) {
          expect(comEnv({ FATIA_MAX_LINHAS_PR: "400" }, raiz, ...args)).toEqual({ rc: 1, out: "", err: MSG("FATIA_MAX_LINHAS_PR") });
        }
      }
    });

    it("funcional: FATIA_ vazia também falha, uma linha por variável, ordenadas", () => {
      expect(comEnv({ FATIA_Z: "", FATIA_A: "" }, projeto())).toEqual({ rc: 1, out: "", err: MSG("FATIA_A") + MSG("FATIA_Z") });
    });

    it("funcional: com FATIA_* e arquivo inválido, os dois problemas aparecem", () => {
      const r = comEnv({ FATIA_X: "1" }, projeto({ expx_fatiamento: 2, limites: {} }));
      expect(r).toEqual({ rc: 1, out: "", err: MSG("FATIA_X") + "expx-fatiamento: limites: chave desconhecida\n" });
    });

    it("funcional: com FATIA_* e JSON malformado, os dois problemas aparecem", () => {
      const r = comEnv({ FATIA_X: "1" }, projeto('{"expx_fatiamento": 2,'));
      expect(r).toMatchObject({ rc: 1, out: "" });
      expect(r.err).toMatch(/^expx-fatiamento: `FATIA_X`[^\n]+\nexpx-fatiamento: \.expx\/fatiamento\.json: ilegivel ou JSON invalido \(.+\)\n$/);
    });
  });
});
