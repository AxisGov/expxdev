import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// O PATH de quem roda, sem as pastas que têm um `codex` (o nome que o núcleo procura em cada sistema), na mesma chave
// (`Path` no Windows).
const CHAVE_DO_PATH = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const PATH_SEM_CODEX = (process.env[CHAVE_DO_PATH] ?? "")
  .split(delimiter)
  .filter((d) => !["codex", "codex.exe", "codex.com", "codex.cmd"].some((n) => existsSync(join(d, n))))
  .join(delimiter);

export default defineConfig({
  test: {
    projects: [
      {
        // Parser e servidor do painel: rodam em Node de verdade, tocando o disco.
        test: {
          name: "servidor",
          include: ["src/**/*.test.ts"],
          exclude: ["src/cli/**", "src/teste/**", "src/nucleo/**", "src/plugin/**", "src/harness/**", "src/update/**", "src/doctor/**", "src/watch/ink/**"],
          environment: "node",
          testTimeout: 20000,
        },
      },
      {
        // Componentes Ink do watch: renderizam para string via ink-testing-library,
        // sem DOM — só precisam do plugin React para transformar o JSX.
        plugins: [react()],
        test: {
          name: "watch-ink",
          include: ["src/watch/ink/**/*.test.tsx"],
          environment: "node",
          testTimeout: 20000,
        },
      },
      {
        // CLI: escreve em disco de verdade, em pasta temporária, e chama o git.
        test: {
          name: "cli",
          include: [
            "src/cli/**/*.test.ts",
            "src/teste/**/*.test.ts",
            "src/nucleo/**/*.test.ts",
            "src/plugin/**/*.test.ts",
            "src/harness/**/*.test.ts",
            "src/update/**/*.test.ts",
            "src/doctor/**/*.test.ts",
          ],
          environment: "node",
          // A escala do `expx-revisao` nunca chama o `codex` de verdade num teste: o PATH da suíte não tem nenhuma pasta
          // com `codex`, e o teste que precisa dele põe o falso na frente (src/teste/codex-falso.ts).
          env: { [CHAVE_DO_PATH]: PATH_SEM_CODEX },
          // Estes testes clonam repositorios git de verdade em pasta temporaria.
          // Sob a carga da suite completa em paralelo, 30s nao bastam: o teste
          // falhava por timeout, nunca por assercao.
          testTimeout: 120000,
        },
      },
      {
        // Telas: precisam de DOM.
        plugins: [react()],
        test: {
          name: "ui",
          include: ["ui/src/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          testTimeout: 20000,
        },
      },
    ],
  },
});
