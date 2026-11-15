import { describe, it, expect } from "vitest";
import { dicaDePortaOcupada } from "./principal.js";

/*
 * Com a porta ocupada, o painel sugere subir numa porta livre. A dica repetia só a
 * porta e descartava o `--dir` da chamada: copiada, ela subia o painel em `./docs`,
 * não na pasta pedida (CodeRabbit no expxdev#172). O `principal` escolhe sozinho a
 * porta seguinte (escolherPorta), então a dica só aparece numa corrida; o texto é
 * testado direto.
 */

describe("dica de porta ocupada", () => {
  it("repete o --dir da chamada e sugere a porta seguinte", () => {
    const t = dicaDePortaOcupada(4000, "./docs/painel");
    expect(t).toContain("a porta 4000 ja esta em uso");
    expect(t).toContain("expx panel --dir ./docs/painel --porta 4001");
  });

  it("pasta com espaço ou aspas sai entre aspas simples, pronta para copiar", () => {
    expect(dicaDePortaOcupada(4000, "/tmp/minha pasta")).toContain("expx panel --dir '/tmp/minha pasta' --porta 4001");
    expect(dicaDePortaOcupada(4000, "/tmp/d'agua")).toContain(`expx panel --dir '/tmp/d'\\''agua' --porta 4001`);
    // o `~` literal recebido não pode virar o HOME de quem copiar a dica
    expect(dicaDePortaOcupada(4000, "~/docs")).toContain("expx panel --dir '~/docs' --porta 4001");
  });
});
