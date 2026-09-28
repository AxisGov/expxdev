import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { lerLock, type InstalacaoTravada } from "../nucleo/lock.js";
import { hashDoArquivo } from "../nucleo/integridade.js";
import {
  comandoDeReparo,
  executaveisDoLock,
  modosNoHead,
  modosNoIndice,
  MODO_EXECUTAVEL,
  MODO_SEM_EXECUCAO,
  raizPreservaBitExecutavel,
  semBitNoDisco,
  type ConsultaAoHead,
} from "../nucleo/modo-executavel.js";
import { jsonCanonico } from "../plugin/plano.js";
import {
  descreverEntrada,
  entradasDivergentes,
  hashDasEntradas,
  type DefinicaoHook,
  type EntradaGerenciada,
} from "../harness/composicao.js";
import { validarRastro } from "../parser/esquema/evento.js";
import { verificarCaminhos } from "../nucleo/caminhos.js";
import { expxNoGitignore } from "../cli/projeto.js";
import { verificarModificacaoLocal, pastaDaSkill } from "../update/modificacao.js";
import { MarketplaceJson, PluginJson, ORIGEM_DO_PLUGIN, NOME_DO_PLUGIN, NOME_DO_MARKETPLACE } from "../plugin/manifestos.js";
import { lerPluginsHabilitados, caminhoDoSettings } from "../harness/settings.js";

/**
 * Diagnóstico de instalação quebrada.
 *
 * Cada achado traz a correção sugerida, porque um diagnóstico que só diz "está
 * errado" transfere o trabalho de volta para quem pediu ajuda.
 *
 * `erro` impede o funcionamento; `aviso` é situação legítima que a pessoa
 * precisa saber (modificação local, skill não travada em versão publicada).
 */

export type Severidade = "erro" | "aviso";

export type Achado = {
  id: string;
  severidade: Severidade;
  problema: string;
  correcao: string;
};

export type Diagnostico = {
  saudavel: boolean;
  achados: Achado[];
};

function lerJson(caminho: string): unknown | undefined {
  if (!existsSync(caminho)) return undefined;
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch {
    return undefined;
  }
}

export function diagnosticar(raiz: string): Diagnostico {
  const achados: Achado[] = [];
  const push = (a: Achado): void => {
    achados.push(a);
  };

  // O .gitignore é verificado ANTES de exigir o .expx/: um .gitignore que
  // ignora .expx/ é justamente a causa provável de ele não estar ali para quem
  // clonou o repositório. Sair cedo esconderia o defeito que explica o resto.
  if (expxNoGitignore(raiz)) {
    push({
      id: "gitignore-ignora-expx",
      severidade: "erro",
      problema: "o .gitignore esta ignorando .expx/, que precisa ser commitado",
      correcao: "remova a linha .expx do .gitignore: quem clona o projeto depende dela",
    });
  }

  if (!existsSync(join(raiz, ".expx"))) {
    push({
      id: "sem-expx",
      severidade: "erro",
      problema: "este projeto nao tem .expx/",
      correcao: "rode `expx init` para instalar as skills neste projeto",
    });
    return { saudavel: false, achados };
  }

  const l = lerLock(raiz);
  if (!l.ok) {
    push({
      id: "lock-ilegivel",
      severidade: "erro",
      problema: `o lock nao pode ser lido: ${l.erro}`,
      correcao: "rode `expx init` para reconstruir a instalacao",
    });
    return { saudavel: false, achados };
  }
  if (l.incompativel) {
    push({
      id: "lock-futuro",
      severidade: "erro",
      problema: "o .expx/ foi criado por uma versao MAIS NOVA deste CLI",
      correcao: "atualize o CLI (`npx expxdev@latest`) antes de operar este projeto",
    });
  }

  const raizPlugin = join(raiz, ".expx", "marketplace", ORIGEM_DO_PLUGIN);
  const pj = PluginJson.safeParse(lerJson(join(raizPlugin, ".claude-plugin", "plugin.json")));
  if (!pj.success) {
    push({
      id: "plugin-json-invalido",
      severidade: "erro",
      problema: `plugin.json ausente ou fora do formato (esperado name "${NOME_DO_PLUGIN}")`,
      correcao: "rode `expx init` para remontar o plugin",
    });
  }
  const mj = MarketplaceJson.safeParse(
    lerJson(join(raiz, ".expx", "marketplace", ".claude-plugin", "marketplace.json")),
  );
  if (!mj.success) {
    push({
      id: "marketplace-json-invalido",
      severidade: "erro",
      problema: `marketplace.json ausente ou fora do formato (esperado name "${NOME_DO_MARKETPLACE}")`,
      correcao: "rode `expx init` para remontar o marketplace",
    });
  }

  for (const [nome, travada] of Object.entries(l.lock.skills)) {
    const pasta = pastaDaSkill(raiz, nome);
    if (!existsSync(pasta)) {
      push({
        id: "skill-ausente",
        severidade: "erro",
        problema: `${nome} esta no lock mas nao esta em disco`,
        correcao: `rode \`expx init\` ou \`expx add ${nome}\` para reinstalar`,
      });
      continue;
    }

    const fora = verificarCaminhos(pasta);
    if (fora.length > 0) {
      const amostra = fora.slice(0, 3).map((a) => `${a.arquivo}:${String(a.linha)} → ${a.referencia}`);
      push({
        id: "caminho-fora",
        severidade: "erro",
        problema: `${nome} referencia caminho fora da propria pasta: ${amostra.join("; ")}`,
        correcao: "o plugin e copiado para o cache e esse caminho nao resolve la: reporte no repositorio da skill",
      });
    }

    const mod = verificarModificacaoLocal(raiz, nome);
    if (mod.temModificacao) {
      const lista = [...mod.alterados, ...mod.removidos, ...mod.novos].slice(0, 5);
      push({
        id: "modificacao-local",
        severidade: "aviso",
        problema: `${nome} foi modificada localmente: ${lista.join(", ")}`,
        correcao: "o update nao vai sobrescrever; decida manter, substituir ou salvar ao lado",
      });
    }

    if (!travada.travado) {
      push({
        id: "skill-nao-travada",
        severidade: "aviso",
        problema: `${nome} nao esta travada em versao publicada (segue a branch ${travada.referencia})`,
        correcao: "quando o repositorio publicar uma tag, rode `expx update` para travar",
      });
    }
  }

  if (l.lock.harness.includes("claude")) {
    const s = lerJson(caminhoDoSettings(raiz));
    if (s === undefined) {
      push({
        id: "settings-ausente",
        severidade: "erro",
        problema: ".claude/settings.json ausente ou invalido",
        correcao: "rode `expx init` para reescrever a configuracao do harness",
      });
    } else {
      const d = s as Record<string, unknown>;
      const habilitados = lerPluginsHabilitados(d["enabledPlugins"]);
      if (habilitados[`${NOME_DO_PLUGIN}@${NOME_DO_MARKETPLACE}`] !== true) {
        push({
          id: "plugin-nao-habilitado",
          severidade: "erro",
          problema: "o plugin expx nao esta habilitado no .claude/settings.json",
          correcao: "rode `expx init` para habilitar",
        });
      }
    }
  }

  const skillsClaude = join(raiz, ".claude", "skills");
  const skillsOpen = join(raiz, ".opencode", "skills");
  for (const nome of Object.keys(l.lock.skills)) {
    if (existsSync(join(skillsClaude, nome)) && existsSync(join(skillsOpen, nome))) {
      push({
        id: "colisao-de-nome",
        severidade: "erro",
        problema: `${nome} existe em .claude/skills e em .opencode/skills, e o OpenCode le os dois`,
        correcao: "remova a copia em .opencode/skills: o OpenCode le .claude/skills nativamente",
      });
    }
  }

  if (l.lock.instalacao !== undefined) {
    verificarInstalacao(raiz, l.lock.instalacao, push);
    verificarModoExecutavel(raiz, executaveisDoLock(l.lock.instalacao), push);
  }
  verificarHooks(raiz, push);
  verificarRastro(raiz, push);

  return { saudavel: achados.filter((a) => a.severidade === "erro").length === 0, achados };
}

function amostra(lista: readonly string[]): string {
  const resto = lista.length - 5;
  return `${lista.slice(0, 5).join(", ")}${resto > 0 ? ` e mais ${String(resto)}` : ""}`;
}

/**
 * O estado instalado ainda é o que o lock travou?
 *
 * O lock cobria só a cópia das skills dentro do plugin; os hooks instalados
 * em `.claude/hooks/`, os helpers que eles chamam (como o
 * `catalogo-de-metodo.sh` da mergex) e o settings composto podiam mudar sem
 * que nada acusasse — e um hook de segurança editado à mão é exatamente o que
 * precisa aparecer. Aqui cada arquivo é conferido pelo hash, cada hook
 * gerenciado precisa estar no settings com a definição exata, e o
 * `.expx/hooks.json` precisa ser o que foi escrito.
 *
 * Mudar só o `modo` de um id é decisão legítima da pessoa: vira aviso, não
 * erro. Qualquer outra divergência é erro.
 */
function verificarInstalacao(raiz: string, inst: InstalacaoTravada, push: (a: Achado) => void): void {
  const ausentes: string[] = [];
  const alterados: string[] = [];
  const copiaDoPlugin = `.expx/marketplace/${ORIGEM_DO_PLUGIN.replace(/^\.\//, "")}/skills/`;
  for (const [rel, hash] of Object.entries(inst.arquivos)) {
    // A cópia da skill dentro do plugin já é conferida por `modificacao-local`,
    // com a semântica que o `update` usa (aviso: decidir manter ou substituir).
    if (rel.startsWith(copiaDoPlugin)) continue;
    const caminho = join(raiz, ...rel.split("/"));
    if (!existsSync(caminho)) ausentes.push(rel);
    else if (hashDoArquivo(caminho) !== hash) alterados.push(rel);
  }
  if (ausentes.length > 0) {
    push({
      id: "artefato-ausente",
      severidade: "erro",
      problema: `arquivo instalado removido: ${amostra(ausentes)}`,
      correcao: "rode `expx init` para reinstalar; hook ou helper ausente desliga a protecao em silencio",
    });
  }
  if (alterados.length > 0) {
    push({
      id: "artefato-alterado",
      severidade: "erro",
      problema: `arquivo instalado difere do lock: ${amostra(alterados)}`,
      correcao: "a alteracao manual nao e a versao travada: corrija na origem da skill e rode `expx init`",
    });
  }

  if (inst.settings !== undefined) {
    const entradas: EntradaGerenciada[] = inst.settings.entradas.map((e) => ({
      evento: e.evento,
      ...(e.matcher !== undefined ? { matcher: e.matcher } : {}),
      hook: e.hook as DefinicaoHook,
    }));
    if (hashDasEntradas(entradas) !== inst.settings.hash) {
      push({
        id: "lock-adulterado",
        severidade: "erro",
        problema: "as entradas de settings do lock nao batem com o hash registrado",
        correcao: "rode `expx init` para reconstruir o lock",
      });
    }
    const faltam = entradasDivergentes(lerJson(caminhoDoSettings(raiz)), entradas);
    if (faltam.length > 0) {
      push({
        id: "settings-divergente",
        severidade: "erro",
        problema: `hook gerenciado ausente ou alterado no .claude/settings.json: ${amostra(faltam.map(descreverEntrada))}`,
        correcao: "rode `expx init` para recompor o settings; as entradas que sao suas ficam onde estao",
      });
    }
  }

  if (inst.modos !== undefined) {
    const caminho = join(raiz, ".expx", "hooks.json");
    if (!existsSync(caminho)) {
      push({
        id: "modos-ausente",
        severidade: "erro",
        problema: ".expx/hooks.json ausente: os hooks caem no modo padrao de cada um",
        correcao: "rode `expx init` para recompor o manifesto de modos",
      });
    } else if (hashDoArquivo(caminho) !== inst.modos.hash) {
      const atual = lerJson(caminho) as { hooks?: Record<string, unknown> } | undefined;
      const hooks = atual?.hooks;
      const estruturais: string[] = [];
      const deModo: string[] = [];
      for (const [id, cfg] of Object.entries(inst.modos.publicados)) {
        const noArquivo = hooks?.[id];
        if (typeof noArquivo !== "object" || noArquivo === null) {
          estruturais.push(id);
          continue;
        }
        const { modo: _m1, ...resto } = noArquivo as Record<string, unknown>;
        const { modo: _m2, ...restoPublicado } = cfg;
        if (jsonCanonico(resto) !== jsonCanonico(restoPublicado)) estruturais.push(id);
        else if ((noArquivo as Record<string, unknown>)["modo"] !== cfg["modo"]) deModo.push(id);
      }
      if (atual === undefined || estruturais.length > 0) {
        push({
          id: "modos-divergente",
          severidade: "erro",
          problema: `.expx/hooks.json difere do composto travado${estruturais.length > 0 ? `: ${amostra(estruturais)}` : " (arquivo ilegivel)"}`,
          correcao: "rode `expx init` para recompor; o modo que voce escolheu para cada id e preservado",
        });
      } else {
        push({
          id: "modo-alterado",
          severidade: "aviso",
          problema: `modo alterado localmente em .expx/hooks.json: ${amostra(deModo.length > 0 ? deModo : ["(ids fora das skills)"])}`,
          correcao: "se foi de proposito, rode `expx init` para travar o arquivo com a sua escolha",
        });
      }
    }
  }
}

/**
 * As três sondas que o portão de modo executável usa: o índice, o `HEAD`, e a
 * capacidade do filesystem.
 *
 * Injetáveis porque dois estados que importam não são reproduzíveis na bancada:
 * "a raiz não distingue executável de não executável" (Windows nativo,
 * WSL/DrvFs) e "a consulta ao `HEAD` falhou por motivo inesperado". Um teste que
 * dependesse deles seria não determinista — ou não rodaria nunca. As consultas
 * reais ao git são medidas contra o git de verdade em
 * `nucleo/modo-executavel-git.test.ts`, e a sonda real em
 * `nucleo/sonda-de-bit.test.ts`.
 */
export type SondasDeModo = {
  modosNoIndice: (raiz: string, caminhos: readonly string[]) => Map<string, string>;
  modosNoHead: (raiz: string, caminhos: readonly string[]) => ConsultaAoHead;
  preservaBit: (raiz: string) => boolean;
};

const SONDAS: SondasDeModo = {
  modosNoIndice: (raiz, caminhos) => modosNoIndice(raiz, caminhos),
  modosNoHead: (raiz, caminhos) => modosNoHead(raiz, caminhos),
  preservaBit: raizPreservaBitExecutavel,
};

/**
 * O bit de execução dos artefatos gerenciados — em disco e, principalmente,
 * VERSIONADO.
 *
 * O caso que o lock e o resto do `doctor` não pegavam: eles conferem BYTES.
 * Num produto com `core.filemode=false`, os `.sh` ficam 0755 em disco e o git
 * registra 100644; hash, settings e modos batem, o `doctor` fica verde, e é a
 * primeira worktree ou clone novo que materializa 0644 e mata o hook com 126
 * (Permission denied). Um verde que só vale na máquina onde a instalação foi
 * feita é pior que um vermelho.
 *
 * São achados independentes, porque os reparos são diferentes:
 *
 * - modo 100644 no índice → `git update-index --chmod=+x`, feito pela pessoa,
 *   com commit explícito. O `expx init` NÃO resolve isto, e a mensagem diz.
 * - 100755 no índice e não no `HEAD` → falta COMMITAR. O `update-index` já foi
 *   rodado, e parar aqui era o falso verde mais fácil de cair: o índice diz
 *   100755 e o `doctor` calava, mas clone e `git worktree add` materializam a
 *   partir do `HEAD` — a worktree nova continuava nascendo 0644.
 * - a consulta ao `HEAD` falhar → **aviso**, nunca acusação: sem prova do modo
 *   commitado, dizer que não está commitado seria inventar. E calar também não
 *   serve, porque a verificação ficou inconclusiva e ninguém saberia.
 * - bit ausente no disco → `expx init`, que regrava 0755.
 *
 * O ExpxDev nunca executa o `update-index` nem commita: ver
 * `nucleo/modo-executavel.ts`.
 */
export function verificarModoExecutavel(
  raiz: string,
  executaveis: readonly string[],
  push: (a: Achado) => void,
  sondas: SondasDeModo = SONDAS,
): void {
  if (executaveis.length === 0) return;

  const modos = sondas.modosNoIndice(raiz, executaveis);
  const naoVersionados = executaveis.filter((c) => modos.get(c) === MODO_SEM_EXECUCAO);
  if (naoVersionados.length > 0) {
    push({
      id: "modo-executavel-nao-versionado",
      severidade: "erro",
      problema:
        `executavel gerenciado rastreado como ${MODO_SEM_EXECUCAO} no indice do git ` +
        `(o bit de execucao nao esta versionado): ${amostra(naoVersionados)}`,
      // O comando fica na ÚLTIMA linha, sozinho: é o que se copia e cola. Prosa
      // depois dele na mesma linha vira argumento colado sem ninguém notar.
      correcao:
        "`expx init` conserta o bit no disco, mas NAO o modo versionado: um clone ou worktree novo " +
        "materializa 0644 e o hook registrado por execucao direta falha com 126 (Permission denied). " +
        "O ExpxDev nunca executa este comando nem prepara o indice por voce — rode exatamente isto na " +
        `raiz do projeto e commite o resultado:\n  ${comandoDeReparo(naoVersionados)}`,
    });
  }

  // O `update-index` já rodado, mas o commit não: o índice diz 100755 e o HEAD
  // não. É o estado em que o falso verde aparecia.
  const preparados = executaveis.filter((c) => modos.get(c) === MODO_EXECUTAVEL);
  if (preparados.length > 0) verificarModoNoHead(raiz, preparados, push, sondas);

  // Os candidatos ANTES da sonda, nesta ordem e não na inversa: a sonda ESCREVE
  // na árvore de quem pediu o diagnóstico, e no caminho saudável — o normal, em
  // toda execução — não há nada para ela responder. Um `doctor` que escreve na
  // raiz do projeto para dizer "está tudo bem" também falha onde a raiz é
  // somente leitura, e sem motivo nenhum.
  const semBit = semBitNoDisco(raiz, executaveis);
  if (semBit.length === 0) return;

  // O disco só é cobrado onde a resposta é confiável: num filesystem que não
  // distingue os dois modos, "sem bit" não quer dizer nada.
  if (!sondas.preservaBit(raiz)) return;

  push({
    id: "modo-executavel-sem-bit",
    severidade: "erro",
    problema: `executavel gerenciado sem o bit de execucao no disco: ${amostra(semBit)}`,
    correcao:
      "rode `expx init` para regravar o bit (este filesystem preserva o bit POSIX); se o modo tambem nao " +
      "estiver versionado, o achado modo-executavel-nao-versionado diz como versiona-lo",
  });
}

/**
 * Dos que já estão 100755 NO ÍNDICE, quais ainda não estão assim no `HEAD`.
 *
 * O `git update-index --chmod=+x` e o commit são dois passos, e só o segundo
 * chega a quem clona. Enquanto o `HEAD` não tiver 100755, o diagnóstico fica
 * não saudável: é a única forma de o "resolvido" não valer apenas na máquina
 * onde o `update-index` foi rodado.
 */
function verificarModoNoHead(
  raiz: string,
  preparados: readonly string[],
  push: (a: Achado) => void,
  sondas: SondasDeModo,
): void {
  const head = sondas.modosNoHead(raiz, preparados);
  if (head.tipo === "indisponivel") {
    push({
      id: "modo-executavel-head-indisponivel",
      severidade: "aviso",
      problema:
        "nao foi possivel conferir no HEAD o modo commitado dos executaveis gerenciados " +
        `(${head.motivo}): a verificacao do modo COMMITADO fica inconclusiva`,
      correcao:
        "confira a mao com `git ls-tree -r HEAD -- <caminho>`: o modo commitado precisa ser " +
        `${MODO_EXECUTAVEL}. Fica como aviso porque acusar sem prova seria pior que avisar`,
    });
    return;
  }
  const semHead = head.tipo === "sem-head";
  const naoCommitados = semHead ? [...preparados] : preparados.filter((c) => head.modos.get(c) !== MODO_EXECUTAVEL);
  if (naoCommitados.length === 0) return;
  push({
    id: "modo-executavel-nao-commitado",
    severidade: "erro",
    problema:
      `executavel gerenciado com ${MODO_EXECUTAVEL} preparado no indice mas ainda nao no HEAD` +
      `${semHead ? " (este repositorio nao tem nenhum commit ainda)" : ""}: ${amostra(naoCommitados)}`,
    correcao:
      "o modo ja esta preparado no indice; o que falta e COMMITAR. Um clone ou `git worktree add` " +
      "materializa a partir do HEAD, nao do indice: sem o commit a worktree nova continua nascendo 0644 " +
      "e o hook registrado por execucao direta falha com 126 (Permission denied). O ExpxDev nao commita por voce",
  });
}

/**
 * O rastro de eventos obedece ao contrato `expx-eventos`?
 *
 * Aviso, nunca erro: rastro malformado não impede o método de funcionar, e um
 * `doctor` que reprova a instalação por causa de linha antiga em disco é um
 * doctor que as pessoas param de rodar. As quatro skills que escrevem o rastro
 * têm implementações independentes — é justamente onde a divergência aparece.
 */
function verificarRastro(raiz: string, push: (a: Achado) => void): void {
  const dir = join(raiz, "docs", "eventos");
  if (!existsSync(dir)) return;

  let arquivos: string[];
  try {
    arquivos = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return;
  }

  for (const nome of arquivos) {
    let conteudo: string;
    try {
      conteudo = readFileSync(join(dir, nome), "utf8");
    } catch {
      continue;
    }
    const r = validarRastro(conteudo);

    if (r.defeitos.length > 0) {
      const primeiro = r.defeitos[0];
      const resto = r.defeitos.length - 1;
      push({
        id: "rastro-fora-do-contrato",
        severidade: "aviso",
        problema:
          `docs/eventos/${nome}: ${r.defeitos.length} de ${r.linhas} linhas fora do ` +
          `contrato expx-eventos (L${primeiro?.linha}: ${primeiro?.motivo}` +
          `${resto > 0 ? `, e mais ${resto}` : ""})`,
        correcao:
          "o rastro e append-only e nao se edita a mao: corrija quem grava (o hook da skill) " +
          "e deixe as linhas antigas onde estao",
      });
    }

    if (r.desconhecidas.length > 0) {
      push({
        id: "rastro-chave-nao-declarada",
        severidade: "aviso",
        problema: `docs/eventos/${nome}: chaves fora do contrato: ${r.desconhecidas.join(", ")}`,
        correcao:
          "chave extra e permitida, mas precisa ser declarada em CONTRATO-expx-eventos.md " +
          "e vir depois das doze obrigatorias",
      });
    }
  }
}

/**
 * Hook instalado sem o motor ao lado.
 *
 * Todo caminho de erro dos hooks do memox termina em `exit 0`, de propósito:
 * falha aberta nunca trava o prompt de quem está trabalhando. O preço é que
 * uma instalação quebrada fica indistinguível de um projeto sem artefatos —
 * silêncio dos dois lados. Este verificador é o único lugar onde a diferença
 * aparece (decisão D-17).
 *
 * O caminho conferido é exatamente o que o hook resolve por conta própria:
 * `DIR_HOOK/../skills/<skill>/assets/`.
 */
function verificarHooks(raiz: string, push: (a: Achado) => void): void {
  const dirHooks = join(raiz, ".claude", "hooks");
  if (!existsSync(dirHooks)) return;

  let arquivos: string[];
  try {
    arquivos = readdirSync(dirHooks);
  } catch {
    return;
  }

  // uma entrada por skill dona de hook, para não repetir o achado por arquivo.
  // Só conta o hook solto `<skill>-<nome>.sh`: `doctor.sh`/`teste.sh` são
  // ferramentas da árvore de hooks, e `expx-*` é o núcleo, que não tem motor.
  const skills = new Set(
    arquivos
      .filter((a) => a.endsWith(".sh") && a.includes("-"))
      .map((a) => a.split("-")[0] ?? "")
      .filter((n) => n !== "" && n !== "expx"),
  );

  for (const skill of skills) {
    const motor = join(raiz, ".claude", "skills", skill, "assets");
    if (existsSync(motor)) continue;
    push({
      id: `${skill}-sem-motor`,
      severidade: "erro",
      problema:
        `o hook de ${skill} esta em .claude/hooks mas o motor nao esta em ` +
        `.claude/skills/${skill}/assets: o hook sai 0 em silencio e nao faz nada`,
      correcao: `rode \`expx init\` incluindo ${skill}: o hook e a skill precisam ser instalados juntos`,
    });
  }
}