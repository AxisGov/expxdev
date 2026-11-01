import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * As nove skills do ecossistema Expx.
 *
 * Fonte única do que o CLI sabe instalar. `papel` é o texto mostrado na seleção
 * do `init`; `camada` marca as skills que, sozinhas, não fazem nada — elas
 * modificam o comportamento da sprintx/runx em vez de agir por conta própria
 * (ver `docs/expx-cli/base/08-repositorios-reais.md`).
 *
 * A buildx não é camada, e também não é irmã das outras: ela ORQUESTRA a
 * sprintx e a mergex feature a feature. Sem elas instaladas não roda — mas o
 * `init` não modela dependência entre skills, e criar esse conceito por uma
 * única aresta custaria mais do que a skill avisar em tempo de execução, que é
 * o que ela faz.
 */

export type Skill = {
  nome: string;
  repositorio: string;
  origensLegadas?: readonly string[];
  /**
   * O commit da skill que esta versão do CLI certifica, e que o `init` e o
   * `update` instalam da origem canônica. Andar para a frente é uma release nova
   * do expxdev, nunca um merge na `main` da skill.
   */
  certificado: string;
  papel: string;
  camada: boolean;
};

export const CATALOGO: readonly Skill[] = [
  {
    nome: "sprintx",
    repositorio: "https://github.com/AxisGov/sprintx",
    origensLegadas: ["https://github.com/bittencourtthulio/sprintx"],
    certificado: "2c89012072c9ba83f6f0bf24d148257894fbf0d5",
    papel: "planeja e executa features novas",
    camada: false,
  },
  {
    nome: "runx",
    repositorio: "https://github.com/AxisGov/runx",
    origensLegadas: ["https://github.com/bittencourtthulio/runx"],
    certificado: "6a31b9f6b07e5ad222aa997f273059c93e1a2224",
    papel: "ocorrencias de manutencao do dia a dia",
    camada: false,
  },
  {
    nome: "legadox",
    repositorio: "https://github.com/AxisGov/legadox",
    origensLegadas: ["https://github.com/bittencourtthulio/legadox"],
    certificado: "4b92ec47da1d075224f74aa8c3fc928fdb72230d",
    papel: "camada para projetos legados",
    camada: true,
  },
  {
    nome: "stackx",
    repositorio: "https://github.com/AxisGov/stackx",
    origensLegadas: ["https://github.com/bittencourtthulio/stackx"],
    certificado: "79200ec5761f26adef1f9b3cf66ec039f031e163",
    papel: "descobre o dialeto tecnico do repositorio",
    camada: true,
  },
  {
    nome: "mergex",
    repositorio: "https://github.com/AxisGov/mergex",
    origensLegadas: ["https://github.com/bittencourtthulio/mergex"],
    certificado: "0e0bf27905e8ff1c1c00e38f9e1cefe67a34e6b9",
    papel: "versionamento, entrega e revisao de pull requests",
    camada: false,
  },
  {
    nome: "memox",
    repositorio: "https://github.com/AxisGov/MemoX",
    origensLegadas: ["https://github.com/bittencourtthulio/MemoX"],
    certificado: "897408f6bf60d0c9f4c0ed6b5cb12d6db8e8cdd4",
    papel: "memoria do projeto, indexa os artefatos ja fechados",
    camada: true,
  },
  {
    nome: "prodx",
    repositorio: "https://github.com/AxisGov/prodx",
    origensLegadas: ["https://github.com/bittencourtthulio/prodx"],
    certificado: "06ce57a42db8eaae3f98ea60fc3895f1536383c5",
    papel: "camada de produto, decide se o pedido vira trabalho",
    camada: true,
  },
  {
    nome: "buildx",
    repositorio: "https://github.com/AxisGov/buildx",
    origensLegadas: ["https://github.com/bittencourtthulio/buildx"],
    certificado: "caf4fbe9dfac60a0ae8f34d7a36e9eb779c3cb0b",
    papel: "orquestra um projeto inteiro, da descricao ao sistema pronto",
    camada: false,
  },
  {
    nome: "designx",
    repositorio: "https://github.com/AxisGov/designx",
    origensLegadas: ["https://github.com/bittencourtthulio/designx"],
    certificado: "389a42897dff438152b06d8054d00c9490c46c87",
    papel: "camada de design, cartografa e audita o design system",
    camada: true,
  },
] as const;

/** Os nomes na ordem em que a seleção do `init` os apresenta. */
export const NOMES: readonly string[] = CATALOGO.map((s) => s.nome);

/**
 * As pastas em que uma skill pode estar, dentro da raiz de desenvolvimento.
 *
 * Os repositórios reais não seguem uma capitalização só (`RunX`, `MemoX`,
 * `SprintX`, mas `Legadox` e `ProdX`), e o macOS não diferencia maiúscula de
 * minúscula enquanto o Linux diferencia. Tentar as variações torna o override
 * previsível nos dois sistemas.
 */
function candidatasLocais(nome: string): string[] {
  const capitalizado = nome.charAt(0).toUpperCase() + nome.slice(1);
  const camelX = capitalizado.replace(/x$/, "X");
  return [...new Set([nome, capitalizado, camelX])];
}

/**
 * A raiz onde procurar clones locais das skills, quando definida.
 *
 * Serve ao desenvolvimento das próprias skills: sem isto, testar uma alteração
 * num projeto real exige commitar e publicar a cada tentativa, porque o `init`
 * só sabe clonar do GitHub.
 *
 *     EXPX_SKILLS_LOCAIS=~/Documents/Projetos npx expxdev init --skills runx --yes
 *
 * Não é um caminho de código novo na busca: `git clone` aceita caminho de
 * sistema de arquivos como origem, então a skill local percorre exatamente o
 * mesmo fluxo da remota — mesmo clone, mesmo commit registrado no lock, mesma
 * montagem. O que muda é só a origem.
 */
function raizLocal(): string | undefined {
  const v = process.env["EXPX_SKILLS_LOCAIS"];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

function origemDoCatalogo(skill: Skill): string {
  const raiz = raizLocal();
  if (raiz === undefined) return skill.repositorio;

  let entradas: string[];
  try {
    entradas = readdirSync(raiz);
  } catch {
    return skill.repositorio;
  }
  for (const c of candidatasLocais(skill.nome)) {
    if (!entradas.includes(c)) continue;
    const caminho = join(raiz, c);
    try {
      if (statSync(caminho).isDirectory()) return caminho;
    } catch {
      continue;
    }
  }
  return skill.repositorio;
}

function normalizarOrigem(origem: string): string {
  return origem.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}

/**
 * Canonicaliza apenas origens que pertencem ao catálogo.
 *
 * Uma origem customizada (inclusive caminho local) é configuração da pessoa e
 * permanece intacta. O sufixo opcional `.git` não cria uma segunda identidade
 * para o mesmo remoto legado.
 */
export function repositorioCanonico(nome: string, origemAtual?: string): string | undefined {
  const skill = CATALOGO.find((x) => x.nome === nome);
  if (skill === undefined) return origemAtual;
  if (origemAtual === undefined) return skill.repositorio;

  const atual = normalizarOrigem(origemAtual);
  const gerenciadas = [skill.repositorio, ...(skill.origensLegadas ?? [])].map(normalizarOrigem);
  return gerenciadas.includes(atual) ? skill.repositorio : origemAtual;
}

/** Resolve a origem sem trocar uma customizacao por uma origem gerenciada. */
export function resolverOrigem(
  nome: string,
  origemAtual?: string,
  origemExplicita?: string,
): string | undefined {
  if (origemExplicita !== undefined) return repositorioCanonico(nome, origemExplicita);
  const skill = CATALOGO.find((x) => x.nome === nome);
  if (skill === undefined) return origemAtual;
  const resolvida = repositorioCanonico(nome, origemAtual);
  if (resolvida !== skill.repositorio) return resolvida;
  return origemDoCatalogo(skill);
}

/**
 * O commit certificado da skill, quando `origem` é a canônica do catálogo. A
 * pasta local e a origem customizada não têm certificado: o que vem delas não é
 * o que a release provou. `substituto` troca o valor, nunca a regra (bancada).
 */
export function certificadoDa(nome: string, origem: string, substituto?: string): string | undefined {
  const skill = CATALOGO.find((x) => x.nome === nome);
  if (skill === undefined || normalizarOrigem(origem) !== normalizarOrigem(skill.repositorio)) return undefined;
  return substituto ?? skill.certificado;
}

export function buscarNoCatalogo(nome: string): Skill | undefined {
  const s = CATALOGO.find((x) => x.nome === nome);
  if (s === undefined) return undefined;
  return { ...s, repositorio: origemDoCatalogo(s) };
}

/** Camada é skill que sozinha não faz nada: precisa de sprintx ou runx junto. */
export function ehCamada(nome: string): boolean {
  return buscarNoCatalogo(nome)?.camada ?? false;
}
