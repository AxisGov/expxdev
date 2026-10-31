#!/usr/bin/env python3
"""Mantém estado e handoff derivados somente nos marcos da RunX."""

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expx_rastro as R  # noqa: E402
import rastro as CLI_RASTRO  # noqa: E402


PADRAO = {
    "expx_estado": 1,
    "atualizado_em": None,
    "trabalho": None,
    "ferramenta": "runx",
    "titulo_curto": None,
    "fase": None,
    "task": None,
    "tasks_concluidas": 0,
    "tasks_total": 0,
    "raio": None,
    "orcamento_arquivos": None,
    "orcamento_linhas": None,
    "branch": None,
    "pr_estado": None,
    "bloqueios": 0,
}
TIPOS = {"transicao", "bloqueio", "decisao", "termino"}
# O OC-ID tem forma fixa (references/01-investigacao.md): OC-<AAAA>-<NNNN>.
OC_ID = re.compile(r"OC-[0-9]{4}-[0-9]{4}")
TRANSICOES = {
    ("e1", "e2"), ("e2", "e3"), ("e3", "e1"),
    ("e3", "e4"), ("e4", "e3"), ("e4", "e5"),
}


def agora_padrao():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def escrever_atomico(caminho, conteudo, modo=0o600):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    fd, temporario = tempfile.mkstemp(
        dir=os.path.dirname(caminho), prefix=os.path.basename(caminho) + ".", suffix=".tmp"
    )
    try:
        os.chmod(temporario, modo)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as arquivo:
            arquivo.write(conteudo)
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(temporario, caminho)
    finally:
        try:
            os.unlink(temporario)
        except FileNotFoundError:
            pass


def ler_estado(caminho):
    estado = dict(PADRAO)
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            anterior = json.load(arquivo)
        if isinstance(anterior, dict):
            estado.update(anterior)
    except (OSError, ValueError):
        pass
    return estado


def trabalho_da_ocorrencia(raiz, ocorrencia):
    """O `trabalho_id` da ocorrencia, conferido; ValueError antes de qualquer escrita.

    A pasta precisa ser filha direta de docs/manutencao/ e existir. O id vem da
    mesma fonte que `artefatos` le: o ORQUESTRADOR.md, ou, antes do E2, o
    00-OCORRENCIA.md. Tem de ser um OC-ID completo, e a pasta tem de se chamar
    `<id>` ou `<id>-<slug>`. Nunca se inventa o id a partir do nome da pasta: o
    antigo `basename.split("-")[0]` dava "OC" e regravava o estado com ele.
    """
    base = os.path.realpath(os.path.join(raiz, "docs", "manutencao"))
    if os.path.dirname(ocorrencia) != base:
        raise ValueError("a ocorrencia precisa ser uma pasta de docs/manutencao/")
    if not os.path.isdir(ocorrencia):
        raise ValueError("ocorrencia inexistente: %s" % os.path.basename(ocorrencia))
    fonte = os.path.join(ocorrencia, "ORQUESTRADOR.md")
    if not os.path.isfile(fonte):
        fonte = os.path.join(ocorrencia, "00-OCORRENCIA.md")
    if not os.path.isfile(fonte):
        raise ValueError("ocorrencia sem ORQUESTRADOR.md nem 00-OCORRENCIA.md")
    trabalho = R.texto(R.frontmatter(fonte).get("trabalho_id"))
    if not trabalho or not OC_ID.fullmatch(trabalho):
        raise ValueError("trabalho_id ausente ou fora da forma OC-AAAA-NNNN em %s" % os.path.basename(fonte))
    nome = os.path.basename(ocorrencia)
    if nome != trabalho and not nome.startswith(trabalho + "-"):
        raise ValueError("a pasta %s nao e da ocorrencia %s" % (nome, trabalho))
    return trabalho


def ocorrencia_aberta(ocorrencia):
    fm = R.frontmatter(os.path.join(ocorrencia, "ORQUESTRADOR.md"))
    return not (R.texto(fm.get("status")) == "concluido"
                or R.texto(fm.get("concluido_em")) not in (None, "", "null"))


def artefatos(ocorrencia):
    orquestrador = os.path.join(ocorrencia, "ORQUESTRADOR.md")
    fm_orq = R.frontmatter(orquestrador)
    if not fm_orq:
        fm_orq = R.frontmatter(os.path.join(ocorrencia, "00-OCORRENCIA.md"))
        fm_orq.setdefault("estagio", "e1")
    tasks = []
    for base, _, nomes in os.walk(ocorrencia):
        for nome in nomes:
            if nome != "tasks.md":
                continue
            fm = R.frontmatter(os.path.join(base, nome))
            tasks.extend(R.lista(fm.get("tasks")))
    tasks = [R.mapa(task) for task in tasks]
    concluidas = sum(task.get("status") == "concluida" for task in tasks)
    corrente = next((str(task.get("id")) for task in tasks if task.get("status") == "em_andamento"), None)
    bloqueios = R.lista(R.frontmatter(os.path.join(ocorrencia, "BLOQUEIOS.md")).get("bloqueios"))
    abertos = sum(R.mapa(item).get("resolvido_em") in (None, "") for item in bloqueios)
    return fm_orq, tasks, concluidas, corrente, abertos


def atualizar_orquestrador(caminho, fase, tipo, agora):
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            texto = arquivo.read()
    except OSError:
        raise ValueError("ORQUESTRADOR.md ausente")
    data = agora[:10]
    texto = re.sub(r"(?m)^estagio:.*$", f"estagio: {fase}", texto, count=1)
    texto = re.sub(r"(?m)^atualizado_em:.*$", f"atualizado_em: {data}", texto, count=1)
    if tipo == "termino":
        texto = re.sub(r"(?m)^status:.*$", "status: concluido", texto, count=1)
        texto = re.sub(r"(?m)^concluido_em:.*$", f"concluido_em: {data}", texto, count=1)
    escrever_atomico(caminho, texto, 0o644)


def caminhos_handoff(raiz, ocorrencia):
    candidatos = [
        "ORQUESTRADOR.md", "01-CAUSA-RAIZ.md", "BLOQUEIOS.md",
        "00-DECISOES.md", "QA.md",
    ]
    candidatos.extend(
        os.path.relpath(os.path.join(base, nome), ocorrencia)
        for base, _, nomes in os.walk(ocorrencia)
        for nome in nomes if nome == "tasks.md"
    )
    saida = []
    for relativo in candidatos:
        absoluto = os.path.join(ocorrencia, relativo)
        if os.path.isfile(absoluto):
            saida.append(os.path.relpath(absoluto, raiz).replace(os.sep, "/"))
    return saida


def derivar(raiz, ocorrencia, agora, marco_tipo=None, marco_id=None, fase_forcada=None):
    trabalho, fase, escritas = planejar_derivado(raiz, ocorrencia, agora, marco_tipo, marco_id, fase_forcada)
    gravar(escritas)
    return trabalho, fase


def gravar(escritas):
    for caminho, conteudo in escritas:
        escrever_atomico(caminho, conteudo)


def planejar_derivado(raiz, ocorrencia, agora, marco_tipo=None, marco_id=None, fase_forcada=None):
    """Estado e handoff derivados, ja conferidos contra os limites, sem gravar nada."""
    orquestrador = os.path.join(ocorrencia, "ORQUESTRADOR.md")
    fm, tasks, concluidas, corrente, bloqueios = artefatos(ocorrencia)
    fase = fase_forcada or R.texto(fm.get("estagio"))
    trabalho = trabalho_da_ocorrencia(raiz, ocorrencia)
    titulo = " ".join((R.texto(fm.get("titulo")) or trabalho).split())[:30]
    estado_path = os.path.join(raiz, ".expx", "estado.json")
    estado = ler_estado(estado_path)
    encerrado = (
        marco_tipo == "termino"
        or R.texto(fm.get("status")) == "concluido"
        or R.texto(fm.get("concluido_em")) not in (None, "", "null")
    )
    estado.update({
        "expx_estado": 1,
        "atualizado_em": agora,
        "trabalho": None if encerrado else trabalho,
        "ferramenta": "runx",
        "titulo_curto": titulo,
        "fase": None if encerrado else fase,
        "task": None if encerrado else corrente,
        "tasks_concluidas": concluidas,
        "tasks_total": len(tasks),
        "bloqueios": bloqueios,
    })
    if os.path.isdir(os.path.join(raiz, ".expx")):
        bruto = json.dumps(estado, ensure_ascii=False, separators=(",", ":")) + "\n"
        if len(bruto.encode("utf-8")) >= 1024:
            raise ValueError("estado excede 1 KB")

        linhas = [
            "# Handoff RunX",
            f"- trabalho: {trabalho}",
            f"- estágio: {fase}",
            f"- task: {corrente or 'nenhuma'}",
            f"- progresso: {concluidas}/{len(tasks)}",
        ]
        if marco_tipo:
            linhas.append(f"- último marco: {marco_tipo}/{marco_id}")
        linhas.append("- artefatos:")
        linhas.extend(f"  - `{p}`" for p in caminhos_handoff(raiz, ocorrencia))
        linhas.append(f"- próximo comando: `estado.py reconstruir --ocorrencia {os.path.relpath(ocorrencia, raiz).replace(os.sep, '/')}`")
        handoff = "\n".join(linhas) + "\n"
        if len(handoff.encode("utf-8")) > 2000:
            raise ValueError("handoff excede 500 tokens")
        # Os dois limites sao conferidos antes de qualquer escrita: falhar no
        # handoff depois de gravar o estado deixaria um sem o outro.
        return trabalho, fase, [(estado_path, bruto), (os.path.join(raiz, ".expx", "handoff.md"), handoff)]
    return trabalho, fase, []


def executar(args):
    if args.comando == "session-start":
        # A ocorrencia sai dos artefatos versionados, como nos demais hooks da
        # RunX, nunca do `trabalho` do estado.json: o contrato expx-estado o
        # reserva a exibicao. Encerrada nao e reconstruida (o termino ja zerou o
        # estado). Recusa da validacao nao trava a sessao: sai 0 sem gravar.
        evento = R.ler_evento()
        raiz = R.raiz_repo(evento.get("cwd") if isinstance(evento, dict) else None)
        ocorrencia = R.pasta_ocorrencia(raiz)
        if ocorrencia and ocorrencia_aberta(ocorrencia):
            try:
                derivar(raiz, os.path.realpath(ocorrencia), agora_padrao())
            except ValueError as erro:
                sys.stderr.write("estado.py: %s\n" % erro)
        return 0

    raiz = R.raiz_repo()
    ocorrencia = os.path.realpath(args.ocorrencia)
    if os.path.commonpath((raiz, ocorrencia)) != raiz:
        raise ValueError("ocorrencia fora da raiz")
    agora = args.agora or agora_padrao()

    if args.comando == "reconstruir":
        derivar(raiz, ocorrencia, agora)
        return 0

    if args.tipo not in TIPOS:
        raise ValueError("tipo de marco invalido")
    caminho_orquestrador = os.path.join(ocorrencia, "ORQUESTRADOR.md")
    fm = R.frontmatter(caminho_orquestrador)
    fase_atual = R.texto(fm.get("estagio")) or "e1"
    fase_nova = fase_atual
    # O termino so existe no E5, o ultimo estagio (references/05-relatorio.md);
    # em outro estagio ele gravaria `status: concluido` numa ocorrencia aberta.
    if args.tipo == "termino" and fase_atual != "e5":
        raise ValueError("termino so no e5 (estagio atual: %s)" % fase_atual)
    if args.tipo == "transicao":
        fase_nova = args.resultado
        if (fase_atual, fase_nova) not in TRANSICOES:
            raise ValueError("transicao invalida")
    tem_orquestrador = os.path.isfile(caminho_orquestrador)
    if not tem_orquestrador and not (args.tipo == "transicao" and fase_atual == "e1" and fase_nova == "e2"):
        raise ValueError("ORQUESTRADOR.md ausente")
    # Tudo o que recusa o marco (transicao, limites do estado e do handoff) e conferido
    # antes da primeira escrita: recusado depois de gravar o ORQUESTRADOR.md, o marco
    # deixaria a etapa nova com estado e handoff velhos. O derivado nao depende do que
    # atualizar_orquestrador muda: a etapa vem de fase_nova e o termino, do tipo.
    trabalho, fase, escritas = planejar_derivado(raiz, ocorrencia, agora, args.tipo, args.id, fase_nova)
    if tem_orquestrador:
        atualizar_orquestrador(caminho_orquestrador, fase_nova, args.tipo, agora)
    gravar(escritas)
    CLI_RASTRO.gravar_mecanico(
        tipo=args.tipo, trabalho=trabalho, fase=fase, identificador=args.id,
        resultado=args.resultado, raiz=raiz,
    )
    return 0


def parser():
    p = argparse.ArgumentParser(description="mantém estado derivado da RunX")
    sub = p.add_subparsers(dest="comando", required=True)
    marco = sub.add_parser("marco")
    marco.add_argument("--ocorrencia", required=True)
    marco.add_argument("--tipo", required=True, choices=sorted(TIPOS))
    marco.add_argument("--id", required=True)
    marco.add_argument("--resultado", required=True)
    marco.add_argument("--agora")
    reconstruir = sub.add_parser("reconstruir")
    reconstruir.add_argument("--ocorrencia", required=True)
    reconstruir.add_argument("--agora")
    sub.add_parser("session-start")
    return p


def main():
    # stdout fica vazio sempre (contrato do helper); o motivo da recusa vai ao
    # stderr, para quem chamou saber o que corrigir.
    try:
        return executar(parser().parse_args())
    except Exception as erro:
        sys.stderr.write("estado.py: %s\n" % erro)
        return 1


if __name__ == "__main__":
    sys.exit(main())
