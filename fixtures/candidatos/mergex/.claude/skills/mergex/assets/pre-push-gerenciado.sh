#!/usr/bin/env bash
# mergex: pre-push gerenciado
#
# Chamador do pre-push gerenciado pela MergeX (DM-184), instalado pelo E0
# (`ativacao-pre-push.sh --instalar`) no diretório de hooks efetivo do Git
# (`git rev-parse --git-path hooks`). Só chama o validador de push da skill
# (`portao-push.sh`), com os argumentos e a entrada padrão que o Git entregou,
# e propaga exatamente o código de saída dele. Não tem regra própria. Antes de
# chamar, confere que o validador existe neste checkout: sem ele (branch
# anterior à instalação da skill, skill removida), barra com instrução em vez
# do erro cru do bash (DM-185, minor M3).
#
# Não edite este arquivo: a reversão (`ativacao-pre-push.sh --reverter`) o
# reconhece pelo marcador da segunda linha e o remove. Para combinar a MergeX
# com um pre-push próprio, componha à mão: references/12-barreira-de-push.md.
#
# Este é o modelo versionado; a instalação troca __MERGEX_PORTAO_PUSH__ pelo
# caminho do validador e dá o bit de execução à cópia instalada.
MERGEX_RAIZ="$(git rev-parse --show-toplevel)" || exit 1
MERGEX_PORTAO_PUSH=__MERGEX_PORTAO_PUSH__
[ -r "$MERGEX_PORTAO_PUSH" ] || { printf '%s\n' "mergex pre-push: validador ausente neste checkout ($MERGEX_PORTAO_PUSH): push barrado; reinstale a skill ou rode ativacao-pre-push.sh --reverter" >&2; exit 1; } # guarda:M3CHAM
exec bash "$MERGEX_PORTAO_PUSH" --pre-push "$@"
