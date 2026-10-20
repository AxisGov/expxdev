import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ_DO_REPO } from "./candidatos.js";

export type CasoConformidade = "limite40" | "limite41" | "pulos" | "pulos-uncommitted";

const funcao = (id: number): Buffer => Buffer.from(`export function soma${id}(a) {\n  return a + ${id};\n}\n`);

function linhas(n: number, semQuebraFinal: boolean): Buffer {
  let texto = "";
  for (let i = 1; i <= n; i++) texto += `export const v${i} = ${i};${i === n && semQuebraFinal ? "" : "\n"}`;
  return Buffer.from(texto);
}

function bytes(extra: number): Buffer {
  const corpo = "x".repeat(2024);
  let texto = "";
  for (let i = 100; i < 199; i++) texto += `export const s${i} = "${corpo}";\n`;
  texto += `export const s199 = "${corpo}${"x".repeat(extra)}";\n`;
  return Buffer.from(texto);
}

export function arquivosDoCaso(caso: CasoConformidade): Map<string, Buffer | null> {
  const arquivos = new Map<string, Buffer | null>();
  if (caso === "limite40") {
    for (let i = 1; i <= 38; i++) arquivos.set(`f${String(i).padStart(2, "0")}.js`, funcao(i));
    arquivos.set("linhas-5000.js", linhas(5000, true));
    arquivos.set("bytes-204800.js", bytes(0));
    return arquivos;
  }
  if (caso === "limite41") {
    for (let i = 1; i <= 41; i++) arquivos.set(`f${String(i).padStart(2, "0")}.js`, funcao(i));
    return arquivos;
  }
  arquivos.set("linhas-5000-quebra-final.js", linhas(5000, false));
  arquivos.set("linhas-5001.js", linhas(5001, true));
  arquivos.set("bytes-204801.js", bytes(1));
  arquivos.set("package-lock.json", Buffer.from('{"lockfileVersion": 3, "packages": {"": {"name": "x"}}}\n'));
  arquivos.set("logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]));
  arquivos.set("manual.pdf", Buffer.from("%PDF-1.4\n%conformidade\n"));
  if (caso === "pulos") arquivos.set("notas.md", Buffer.from("# Notas\n\nDocumento de teste.\n"));
  arquivos.set("apagado.js", null);
  arquivos.set("gerado/saida.js", funcao(99));
  return arquivos;
}

export function respostaDoCaso(caso: CasoConformidade): Buffer {
  return readFileSync(join(RAIZ_DO_REPO, "fixtures", "conformidade", "codeant-cli-0.5.14", `${caso}.json`));
}
