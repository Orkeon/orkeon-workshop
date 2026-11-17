# Les outils d'Orkeon dans Claude Code

*[English](../../guides/orkeon-tools.md) · Français*

Orkeon porte des outils que Claude Code n'a pas : un index de code, des lecteurs de
documents bureautiques, un client HTTP, des extracteurs de pages web, une recherche documentaire.
L'atelier les donne à Claude Code par MCP (Model Context Protocol), au travers d'un serveur nommé `orkeon`
(D112). Ils ne demandent **ni modèle ni clé** : avec un abonnement Claude seul, Claude Code est le modèle,
et Orkeon lui donne des outils.

Dans Claude Code, ils s'appellent `mcp__orkeon__<outil>` : `mcp__orkeon__codebase_search`,
`mcp__orkeon__pdf_reader`… Vous ne les appelez pas vous-même : Claude s'en sert quand le travail le
demande, et `/mcp` dans Claude Code liste le serveur et ses outils.

## Comment c'est mis en place

Rien à faire. Au démarrage du conteneur, la synchronisation du harnais :

- enregistre le serveur dans le `.mcp.json` de votre dossier :

  ```json
  { "mcpServers": { "orkeon": { "command": "orkeon-mcp", "args": [] } } }
  ```

- l'active dans `.claude/settings.local.json` (`"enabledMcpjsonServers": ["orkeon"]`), pour que Claude
  Code le lance sans poser de question.

Un atelier créé avant novembre 2026 reçoit les deux à son premier démarrage sur la nouvelle image. La
synchronisation laisse en l'état :

| Ce qu'elle trouve | Ce qu'elle fait |
|---|---|
| vos propres serveurs dans `.mcp.json` | les garde, ajoute `orkeon` à côté |
| une entrée `orkeon` déjà présente, modifiée ou non | la garde telle quelle |
| `orkeon` dans `disabledMcpjsonServers` de `.claude/settings.local.json` | n'active rien : c'est votre non |
| un `.mcp.json` suivi par git, dans une copie de travail | n'y touche pas, et dit quelle entrée ajouter vous-même |
| un `.mcp.json` ou un `settings.local.json` qui n'est pas un objet JSON, ou un lien symbolique | n'y touche pas, et le dit |

Pour désactiver toute l'étape, posez `HARNESS_ORKEON_MCP=0` sur le conteneur (`-e HARNESS_ORKEON_MCP=0`).
Pour désactiver le serveur dans un dossier, listez `orkeon` dans `disabledMcpjsonServers` ; retirer
l'entrée de `.mcp.json` ne tient que jusqu'à la synchronisation suivante (une nouvelle image, ou
`sync-harness.sh --force`), qui la remet.

## Ce qui est servi

`orkeon-mcp` se termine en `orkeon mcp serve`, avec le dossier de la session monté en lecture et écriture
sur `/workspace` et une courte liste d'outils — 40 sur l'Orkeon de l'image (`main` à 4709278, D115), sur
les 111 que le serveur peut servir :

| Groupe | Outils |
|---|---|
| l'index de code | `index_codebase`, `index_status`, `incremental_reindex`, `is_path_indexed`, `codebase_search`, `codebase_map`, `symbol_source`, `symbol_detail`, `node_outline`, `node_read`, `dependency_graph`, `sub_graph`, `impact_analysis`, `affected_tests`, `flow_trace`, `package_summary`, `complexity_report`, `structural_search`, `graph_schema`, `access_cost`, `documented_in`, `documents_of`, `statement_query`, `list_mounts` |
| les lecteurs de documents | `csv_reader`, `pdf_reader`, `docx_reader`, `xlsx_reader`, `json_tool`, `xml_parser`, `email_parser`, `pdf_search`, `txt_search`, `mdx_search` |
| non servis | `docx_writer`, `xlsx_writer`, `rag_ingest` : ils écrivent des fichiers que les hooks du harnais ne voient pas ; `local_embed_text` : sa réponse est faite de vecteurs, sans usage pour un modèle |
| le réseau | `http_api`, `web_scrape`, `scrape_element` |
| la recherche documentaire (RAG) | `rag_search`, `rag_eval`, `semantic_search` — sur une collection remplie depuis un terminal par `orkeon rag ingest` |
| avec une clé dans l'environnement | `web_search` avec `TAVILY_API_KEY`, `brave_search` avec `BRAVE_API_KEY` |

**Jamais servis par défaut** : les outils de fichiers, d'édition et de shell d'Orkeon. Claude Code a les
siens, et les hooks du harnais ne voient que ceux-là. Ni les outils d'e-mail et de stockage en ligne, les
bases de données, le bus d'événements.

```bash
orkeon-mcp --print-tools           # la liste que ce conteneur servirait, un nom par ligne
```

Les outils lisent et écrivent des chemins sous `/workspace` : `/workspace/src/app.ts` est le `src/app.ts`
de votre dossier.

### Changer la liste

Deux variables du conteneur, lues par `orkeon-mcp` :

| Variable | Effet |
|---|---|
| `WORKSHOP_MCP_EXTRA_TOOLS` | une liste séparée par des virgules, ajoutée à la liste par défaut |
| `WORKSHOP_MCP_TOOLS` | une liste séparée par des virgules, qui remplace la liste par défaut ; `all` sert tout ce qu'Orkeon sert |

Un nom que cet Orkeon n'a pas est laissé de côté, avec une ligne sur la sortie d'erreur. `all` sert aussi
les outils de fichiers et de shell d'Orkeon, que les hooks du harnais ne voient pas : choisissez-le en
connaissance de cause. Pour servir une équipe comme un outil, modifiez vous-même l'entrée de `.mcp.json` —
`"args": ["--crew", "<le fichier de crew de l'équipe>"]` : les arguments vont à `orkeon mcp serve`, qui
sert l'équipe sous l'outil `run_crew_<nom>` ; une équipe lancée ainsi appelle son modèle.

Une clé de recherche est un secret d'outil, hors des deux [modes des clés de modèles](./keys.md) :
`workshop --secret TAVILY_API_KEY`, puis l'outil apparaît au prochain démarrage de Claude Code.

## Les limites

- **Les arguments de type tableau demandent l'Orkeon de l'image.** Par MCP, Orkeon 1.2.0 répond
  `Parameter '<name>' has invalid type. Expected: array` à un argument qui est un tableau (`edge_kinds` de
  `dependency_graph`, par exemple), et `rag_ingest` n'ingère rien quand on lui en donne un (V-60, V-62).
  Le `main` d'Orkeon le corrige à 4709278 ([Orkeon#402](https://github.com/Orkeon/orkeon/issues/402)),
  le commit que l'image construit tant qu'aucune release ne porte la correction (D115, V-63) : un Orkeon
  1.2.0 remis par `orkeon-update` ramène le refus.
- **L'index de code écrit dans votre dossier.** Son cache va sous `.orkeon/`, à la racine du dossier. Le
  `.gitignore` de l'atelier le liste ; un atelier versionné avec git avant novembre 2026 reçoit la ligne à
  son prochain démarrage ([Mettre à jour](./updating.md#le-harnais)), et dans une copie de travail le
  harnais liste `.orkeon/` dans `.git/info/exclude`.
- **Les outils réseau atteignent ce que le pare-feu autorise.** `http_api` et les extracteurs passent par
  le pare-feu du conteneur : un hôte hors de sa liste demande `FIREWALL_EXTRA_DOMAINS`
  ([configuration](../reference/configuration.md#pare-feu)).
- **Ces outils sont journalisés, pas gardés.** Les garde-fous du harnais surveillent les outils de fichiers de
  Claude Code et son shell. Un appel à un outil d'Orkeon est seulement noté : une ligne dans
  `.claude/local/mcp-calls.tsv` — l'heure (UTC), la session, le type du sous-agent ou `main`, le nom de
  l'outil — et rien de ses arguments, qui peuvent contenir un chemin ou un texte que vous ne vouliez pas
  garder. `HARNESS_MCP_LOG=0` dans le bloc `env` de `.claude/settings.local.json` arrête le journal. C'est pourquoi ce qui écrit un fichier — `docx_writer`, `xlsx_writer`,
  `rag_ingest` — n'est pas servi par défaut : ajoutés avec `WORKSHOP_MCP_EXTRA_TOOLS`, ils écriraient sous
  `/workspace` sans le garde-fou de phase ni celui des clés. Le Guardian d'Orkeon contrôle toujours chaque appel (traversée de chemin,
  SSRF).
- **Ce qui a été mesuré** (V-60) : le serveur qui démarre sans réglages ni modèle, la liste, le montage,
  `index_codebase` et `codebase_search` sur un dossier d'un seul fichier. Non mesuré : l'index sur un
  vrai dépôt, et si son modèle d'embeddings est porté par l'outil ou téléchargé au premier usage.

## Quand un outil manque

| Vous voyez | Cause | À faire |
|---|---|---|
| aucun serveur `orkeon` sous `/mcp` | le conteneur tourne avec `HARNESS_ORKEON_MCP=0`, l'entrée est listée dans `disabledMcpjsonServers`, ou le `.mcp.json` est celui du dépôt | lisez la ligne `[harness] .mcp.json…` du démarrage ; ajoutez l'entrée à la main dans une copie de travail |
| le serveur est listé en échec | `orkeon-mcp` n'a pas pu démarrer : `orkeon` absent, ou `orkeon run --list-tools` en échec | lancez `orkeon-mcp --print-tools` dans un terminal du conteneur et lisez son erreur |
| `web_search` répond `Secret 'TAVILY_API_KEY' was not found` | la clé n'est pas dans l'environnement | `workshop --secret TAVILY_API_KEY` |

Suite : [Orkeon Code et les applications de terminal de Studio](./orkeon-code.md).
