# Predecessores SprintX e retomada da V9

`00-PREDECESSORES.md` declara documentos Superpowers efetivamente consumidos antes do nascimento formal do planejamento SprintX. A V9 só aceita cada caminho quando `predecessores-sprintx.sh` prova, pela árvore de um SHA, a ancestralidade estrita e a identidade do blob. O catálogo de método isenta apenas o manifesto; nunca os caminhos que ele declara.

O protocolo novo existe somente no layout canônico emitido pela SprintX,
`docs/sprintx/features/<trabalho>/00-PREDECESSORES.md`. O catálogo continua reconhecendo artefatos
legados em `docs/<trabalho>`, mas não inventa nem migra um manifesto que a SprintX nunca emitiu;
nesses trabalhos, a ausência preserva o comportamento histórico da V9.

Cada caminho precisa ser literal, canônico, estar sob `docs/superpowers/` e ser seguro como
scalar YAML sem aspas: somente ASCII imprimível e sem espaço final. `commit_sha` e `blob_oid` são OIDs completos no formato de objetos do
repositório: 40 hexadecimais em SHA-1 ou 64 em SHA-256. O consumidor rejeita largura misturada,
caminho fora da origem e qualquer saída que não reproduza esse contrato fechado.

## Recuperação terminal

Uma entrega pode sair do E8 bloqueado somente quando o registro commitado contém exatamente `estado: bloqueado`, `portao: bloqueado`, `falhas_portao: [v9]`, `causa: arquivo_fora_do_plano`, nenhuma publicação/PR e nenhuma reconciliação pendente. Os `desvios` precisam ser exatamente os predecessores agora provados, e a V9 precisa retornar `resultado=ok`.

O fluxo tem dois commits de método, nenhum deles task e nenhum deles consumidor de `seq`:

1. `predecessores`: persiste somente `00-PREDECESSORES.md`;
2. `retomar-v9-predecessores`: persiste somente `ENTREGA.md`, reaberto com `portao`, `portao_sha`, `causa` em `null` e listas vazias.

Use primeiro `bash .claude/skills/mergex/scripts/retomar-v9-predecessores.sh --verificar --entrega docs/entregas/<trabalho>/ENTREGA.md --origem sprintx --trabalho <trabalho>`. Só com `ok=true`, repita todos os argumentos com `--aplicar`. A aplicação repete as provas sob a trava, atualiza `atualizado_em`, grava atomicamente com temporário imprevisível no diretório da entrega e termina com `proxima=E2`. A retomada não emite `PRONTO`, não chama E3 e não autoriza publicação. Recomece pela barreira `bash .claude/skills/mergex/scripts/persistir-metodo.sh --verificar --entrega docs/entregas/<trabalho>/ENTREGA.md --origem sprintx --trabalho <trabalho> --checkpoint pre-e2` e execute integralmente V1–V12.

Não existe `--force`. Árvore ou stage sujos, disco divergente de HEAD, schema inconclusivo, desvios adicionais, V9 ainda vermelha ou repetição depois da reabertura são recusados.
