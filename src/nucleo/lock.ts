import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * O lock: o que está instalado, e em que versão exata.
 *
 * É commitado junto com `.expx/`. Quem clona o projeto recebe as skills já em
 * disco e não precisa de rede nem de rodar o `init` para trabalhar — a
 * instalação é travada por este arquivo, e só o `update` o reescreve.
 *
 * `arquivos` guarda o hash de cada arquivo instalado: é o que permite detectar
 * modificação local e recusar sobrescrever trabalho manual (ver `integridade.ts`).
 */

/**
 * 2: ganhou `instalacao` — o estado instalado FORA do plugin (hooks, cópias
 * das skills, settings composto, `.expx/hooks.json`). Lock 1 continua legível:
 * `instalacao` é opcional, e o doctor só confere o que o lock declara.
 */
export const VERSAO_LOCK = 2;

export const SkillTravada = z.object({
  repositorio: z.string().min(1),
  referencia: z.string().min(1),
  /** `false` quando a referência é branch: a skill não está em versão publicada. */
  travado: z.boolean(),
  commit: z.string().min(1),
  resolvido_em: z.string().min(1),
  arquivos: z.record(z.string(), z.string()),
});
export type SkillTravada = z.infer<typeof SkillTravada>;

/** Um hook gerenciado no `.claude/settings.json`, exatamente como foi escrito. */
export const EntradaTravada = z.object({
  evento: z.string().min(1),
  matcher: z.string().optional(),
  hook: z.record(z.string(), z.unknown()),
});
export type EntradaTravada = z.infer<typeof EntradaTravada>;

/**
 * O estado instalado que o `init` gerencia fora de `skills[].arquivos`.
 *
 * - `arquivos`: destino (relativo à raiz do projeto) → sha256, de TODO arquivo
 *   que o plano escreveu — `.claude/hooks/**` (hooks e helpers de cada skill),
 *   `.claude/skills/**` (inclusive scripts como `catalogo-de-metodo.sh`),
 *   comandos, e o plugin em `.expx/marketplace/`.
 * - `executaveis`: dos destinos acima, os que o plano marcou como executáveis
 *   — a fonte de verdade do que precisa do bit de execução, em disco e
 *   VERSIONADO. Opcional: lock antigo continua válido e cai no fallback dos
 *   `.sh` (ver `nucleo/modo-executavel.ts`), que é a regra que o plano aplica.
 * - `settings`: as entradas de hook que o ExpxDev gerencia no
 *   `.claude/settings.json`, e o hash delas. Entrada da pessoa não entra: o
 *   ExpxDev não a gerencia.
 * - `modos`: o que as skills publicaram para `.expx/hooks.json` e o hash do
 *   arquivo composto que foi escrito.
 *
 * Tudo em ordem canônica e sem data: duas instalações das mesmas skills, em
 * qualquer ordem, produzem o mesmo bloco.
 */
export const InstalacaoTravada = z.object({
  arquivos: z.record(z.string(), z.string()),
  executaveis: z.array(z.string()).optional(),
  settings: z.object({ hash: z.string(), entradas: z.array(EntradaTravada) }).optional(),
  modos: z.object({ hash: z.string(), publicados: z.record(z.string(), z.record(z.string(), z.unknown())) }).optional(),
});
export type InstalacaoTravada = z.infer<typeof InstalacaoTravada>;

export const Lock = z.object({
  lock_version: z.number().int(),
  cli_version: z.string().min(1),
  harness: z.array(z.string()),
  skills: z.record(z.string(), SkillTravada),
  instalacao: InstalacaoTravada.optional(),
});
export type Lock = z.infer<typeof Lock>;

export type LeituraLock =
  | { ok: true; lock: Lock; incompativel: boolean }
  | { ok: false; erro: string };

export function caminhoDoLock(raizProjeto: string): string {
  return join(raizProjeto, ".expx", "expx-lock.json");
}

export function escreverLock(raizProjeto: string, lock: Lock): void {
  const destino = caminhoDoLock(raizProjeto);
  mkdirSync(join(destino, ".."), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(lock, null, 2)}\n`);
}

/**
 * Compara duas versões `x.y.z`. Devolve >0 se `a` é maior.
 *
 * Usado para detectar estrutura criada por CLI MAIS NOVO que o em execução —
 * caso em que o método manda parar com mensagem clara, nunca adivinhar.
 */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * A versão deste CLI, lida do package.json do próprio pacote.
 *
 * Fixar a versão em literal faria o lock "do futuro" ser detectado errado a
 * cada publicação — o valor tem que vir da mesma fonte que o npm publica.
 */
export function versaoDoCli(): string {
  for (const rel of ["../../package.json", "../package.json"]) {
    try {
      const p = join(dirname(fileURLToPath(import.meta.url)), rel);
      const d = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
      if (typeof d.version === "string") return d.version;
    } catch {
      // tenta o próximo candidato
    }
  }
  return "0.0.0";
}

/** Lê o lock. Ausente ou inválido devolve `ok: false` — nunca lança. */
export function lerLock(raizProjeto: string, versaoCliAtual = versaoDoCli()): LeituraLock {
  const caminho = caminhoDoLock(raizProjeto);
  if (!existsSync(caminho)) return { ok: false, erro: `lock nao encontrado em ${caminho}` };
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e: unknown) {
    return { ok: false, erro: `lock ilegivel: ${String(e)}` };
  }
  const r = Lock.safeParse(bruto);
  if (!r.success) return { ok: false, erro: `lock fora do formato: ${r.error.message}` };
  return {
    ok: true,
    lock: r.data,
    incompativel: compararVersoes(r.data.cli_version, versaoCliAtual) > 0,
  };
}
