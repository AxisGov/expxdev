import { execFile } from "node:child_process";

/**
 * As dependências de runtime dos hooks, provadas no ambiente DESTE processo.
 *
 * Os hooks das skills leem o payload com `jq` e consultam o repositório com
 * `git`. Já aconteceu nesta máquina: `jq` instalado (winget), encontrado num
 * terminal, mas ausente do PATH do processo que roda os hooks — e o hook de
 * segurança passou a barrar tudo, ou a não avaliar nada. Arquivo no disco,
 * `where jq` em outro terminal, `~/.bash_profile`: nada disso prova que o
 * processo consegue executar o binário.
 *
 * A prova aqui é executar de verdade (`jq --version`, `git --version`) com o
 * mesmo ambiente que o `expxdev` herdou. Falhou, o `init` para ANTES de tocar
 * o projeto.
 *
 * `bash` NÃO é verificado: no Windows o primeiro `bash` do PATH pode ser o do
 * WSL (`C:\Windows\System32\bash.exe`), enquanto o Claude Code roda os hooks
 * no Git Bash. Uma checagem por `where bash` daria resposta errada nos dois
 * sentidos, então fica de fora até existir uma prova inequívoca do runtime.
 */

export type Dependencia = "git" | "jq";

export type ResultadoRuntime =
  | { ok: true; versoes: Record<string, string> }
  | { ok: false; erro: string; faltando: Dependencia[] };

const INSTRUCAO: Record<Dependencia, string> = {
  git: "instale o git (https://git-scm.com) e confira com: git --version",
  jq: "instale o jq (https://jqlang.org) e confira com: jq --version",
};

function versao(bin: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { env, windowsHide: true, timeout: 15000 }, (erro, stdout) => {
      if (erro !== null) resolve(undefined);
      else resolve(String(stdout).trim().split("\n")[0] ?? "");
    });
  });
}

export async function verificarRuntime(
  requisitos: readonly Dependencia[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResultadoRuntime> {
  const versoes: Record<string, string> = {};
  const faltando: Dependencia[] = [];
  for (const dep of [...new Set(requisitos)].sort()) {
    const v = await versao(dep, env);
    if (v === undefined) faltando.push(dep);
    else versoes[dep] = v;
  }
  if (faltando.length === 0) return { ok: true, versoes };
  return {
    ok: false,
    faltando,
    erro: [
      `dependencia de runtime ausente no PATH deste processo: ${faltando.join(", ")} (nada foi escrito)`,
      "os hooks das skills executam estes binarios; sem eles o hook de seguranca nao consegue avaliar o comando.",
      ...faltando.map((d) => `  - ${INSTRUCAO[d]}`),
      "a prova precisa ser no MESMO ambiente que roda o expxdev: um jq so visivel em outro terminal nao conta.",
    ].join("\n"),
  };
}
