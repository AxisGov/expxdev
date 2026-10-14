# Pins coordenados do protocolo de predecessores

## Objetivo

Certificar no ExpxDev, como um único par compatível, os merges que introduzem o protocolo de predecessores verificáveis entre SprintX e MergeX.

## Decisão

Uma única PR atualiza os dois candidatos:

- SprintX `08d61730e3280a92837083ff0271fb89d167380c`;
- MergeX `ccee68c5c11b530836cc26efc6058aba150e0436`.

Os dois pins mudam juntos porque formam um contrato produtor/consumidor. A SprintX registra `00-PREDECESSORES.md`; a MergeX prova o manifesto na V9 e oferece a retomada de uma entrega bloqueada exclusivamente por predecessores. Não haverá estado intermediário certificado com apenas um lado novo.

## Implementação

Os snapshots de `fixtures/candidatos/` serão regenerados exclusivamente por `scripts/fixture-candidatos.sh`, a partir dos objetos Git dos dois merges. Os arquivos `.sha`, `MANIFESTO.sha256` e `src/teste/candidatos.ts` devem concordar com esses commits.

A certificação P0.2 continuará instalando as candidatas pelo `expxdev init` real em HOME isolado. Além das provas existentes, ela criará um repositório descartável, registrará especificação e plano pelo produtor SprintX instalado, fará nascer o planejamento e verificará o mesmo `00-PREDECESSORES.md` pelo consumidor MergeX instalado. A prova deve usar os scripts efetivamente instalados, não as fontes externas.

## Limites

- BuildX não muda: não consome o novo protocolo.
- Conselhos Municipais não muda: o PR #192 já foi integrado.
- Cache, marketplace e instalação global não são alterados por esta PR.
- Nenhum snapshot é corrigido manualmente. Divergência entre produtor e consumidor bloqueia a entrega.

## Portões

- teste da certificação P0.2, incluindo o ciclo produtor/consumidor;
- suíte completa do ExpxDev;
- typecheck;
- build;
- revisão independente do diff antes da abertura da PR.
