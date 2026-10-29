@AGENTS.md

## graphify

Installé le 2026-10-21. Au démarrage de chaque session, `.claude/settings.json` installe graphify s'il manque (`pip install graphifyy`) et reconstruit le graphe du code (`graphify update .`, sans coût d'API). Le dossier `graphify-out/` n'est pas versionné.

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## context-mode

Installé le 2026-10-29 (`.mcp.json`, version fixée 1.0.169, serveur MCP seul, sans crochets). Pour analyser une grosse sortie (journaux Render/Supabase, longues listes de fichiers, pages web), utiliser `ctx_execute` / `ctx_fetch_and_index` et n'afficher que le résumé ; garder Bash, Read et Edit pour les commandes courtes et les modifications de fichiers. Les règles graphify ci-dessus restent prioritaires pour explorer le code.
