# Options et variables du conteneur

*[English](../../reference/configuration.md) · Français*

## Options de `docker run`

| Option | À quoi elle sert |
|---|---|
| `-v "<folder>:/workspace"` | **Obligatoire : l'atelier.** Le harnais y est déployé, Claude Code s'y ouvre, vos équipes y vivent. N'importe quel dossier convient ; `%USERPROFILE%\Orkeon` est celui dont Orkeon Studio liste le dossier `teams\` par défaut ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). |
| `--name <name>` | le nom du conteneur, pour `docker start -ai <name>` et `docker exec` |
| `-it --init` | un terminal interactif, et un petit processus d'initialisation qui nettoie les processus terminés lancés dans le conteneur |
| `-v cc-ollama:/home/node/.ollama/models` | les modèles locaux dans un volume : téléchargés une seule fois, partagés par tous les conteneurs, conservés quand un conteneur est remplacé. Sans volume, le modèle que nomme `OLLAMA_DEFAULT_MODEL` n'est pas téléchargé automatiquement. |
| `--gpus=all` | le GPU NVIDIA, pour les modèles locaux ([Modèles](../guides/models.md#utiliser-le-gpu)). Retirez cette option sur un ordinateur qui n'en a pas, sinon le conteneur ne démarrera pas. |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | ce dont le pare-feu facultatif a besoin |
| `-v /var/run/docker.sock:/var/run/docker-host.sock`, `-e DOCKER_MODE=socket`, `--add-host=host.docker.internal:host-gateway` | Docker depuis l'intérieur du conteneur, à travers le démon de votre ordinateur, pour la pile SonarQube ([Modes Docker](../guides/docker-modes.md)) |
| `--privileged -e DOCKER_MODE=dind -v orkeon-docker:/var/lib/docker` | Docker-in-Docker à la place, ses images dans un volume |
| `-v "<name>-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude` | conserve l'état de Claude Code (connexion, historique, mémoire) dans un volume nommé d'après le conteneur, un par conteneur, pour qu'il survive à un nouveau conteneur ([Mettre à jour](../guides/updating.md#un-volume-claude-code-par-conteneur)) |
| `-v "<name>-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees` | les worktrees de `claude --worktree` et des sous-agents dans un volume nommé d'après le conteneur, hors du montage lent de votre dossier ; sans lui, ils restent sous `.claude/worktrees/` dans votre dossier ([Modes Docker](../guides/docker-modes.md#avancé--les-worktrees-sur-un-volume), D85) |
| `-v <file>:/run/secrets/github_packages_token:ro` | un jeton pour mettre à jour Orkeon dans le conteneur depuis le canal de développement, sans qu'il apparaisse dans `docker inspect` (`-e GITHUB_PACKAGES_TOKEN` fonctionne aussi) |

## Variables de l'image

Définissez-les avec `-e NAME=value` sur la commande `docker run`, ou dans le `containerEnv` d'un
`devcontainer.json` ; `-e NAME` sans valeur transmet la variable du terminal qui lance `docker run`, et c'est
ainsi qu'une clé arrive dans le conteneur sans figurer dans aucune commande ni aucun fichier
([Modèles](../guides/models.md#comment-une-clé-arrive-dans-le-conteneur) ; l'autre chemin, une clé gardée
dans l'atelier par `workshop setup keys`, est dans [Les clés des modèles](../guides/keys.md)).
`WORKSHOP_SKIP_PERMISSIONS` et `WORKSHOP_TEAMMATE_MODE` sont lues par la commande `workshop` à chaque
lancement : on peut donc aussi les définir pour un seul appel, `WORKSHOP_TEAMMATE_MODE=tmux workshop`.
Cette commande lance `claude --dangerously-skip-permissions --teammate-mode in-process`, suivi de ce que
vous ajoutez ; une option que vous donnez vous-même (`workshop --permission-mode plan`) remplace celle
par défaut ; `workshop --secret NOM` demande d'abord la valeur d'une variable sans l'afficher et la définit
pour la session ([Modèles](../guides/models.md#comment-une-clé-arrive-dans-le-conteneur)) ;
`workshop --git-identity "<nom>" <email>` donne à git l'identité avec laquelle Claude committe (D71), par
les quatre variables `GIT_AUTHOR_*`/`GIT_COMMITTER_*` et rien sur le disque. En root, l'option
de permission est retirée, puisque Claude Code la refuse dans ce cas — sauf si `IS_SANDBOX=1` dit que le
conteneur est un bac à sable.

| Variable | Valeur par défaut | Ce qu'elle fait |
|---|---|---|
| `ORKEON_WORKSHOP` | `/workspace` | le chemin de l'atelier dans le conteneur : `-v "<folder>:/orkeon" -e ORKEON_WORKSHOP=/orkeon` |
| `HARNESS_SYNC` | activé | `off` : ne pas synchroniser l'atelier avec le harnais au démarrage |
| `HARNESS_PROFILE` | `user` | le premier [profil](./harness.md#profils-et-packs) d'un dossier qui n'en a pas encore, appliqué au démarrage : `contrib` ou `all` pour un atelier ; `dev`, `release`, `docs`, `contrib` ou `all` pour la copie de travail git d'un dépôt montée à sa place ; ou `custom:<pack>,<pack>`. Une fois que le dossier a un profil, `/workshop-profile` le change |
| `CLAUDE_CODE_VERSION` | `latest` | pour une image sans Claude Code (celle qui est publiée) : la version installée au premier démarrage ; `none` n'installe rien |
| `WORKSHOP_SKIP_PERMISSIONS` | activé | `workshop` lance Claude Code avec `--dangerously-skip-permissions`, l'option qui lui permet d'agir sans demander ; `0` — ou toute valeur autre que `1`, `on`, `yes`, `true` — retire l'option, et Claude Code demande alors la permission pour ce que les réglages de l'atelier n'autorisent pas. Dans un dossier sans le harnais, l'option est retirée sauf si cette variable vaut `1` |
| `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` | non définies | l'identité avec laquelle git committe, lue par git avant toute configuration : définissez les quatre sur `docker run` pour la garder pour le conteneur, ou donnez-la pour une session avec `workshop --git-identity "<nom>" <email>` (D71). Sans elles et sans `git config`, Claude s'arrête avant un commit et vous la demande |
| `WORKSHOP_TEAMMATE_MODE` | `in-process` | `workshop` lance Claude Code avec `--teammate-mode in-process` (les coéquipiers d'une équipe d'agents tournent dans le même terminal) ; un autre mode accepté par Claude Code (`auto`, `tmux`, `iterm2`) est transmis tel quel, et `off` retire l'option — Claude Code choisit alors lui-même |
| `OLLAMA_MODE` | `local` | `local`, `host` (l'Ollama de votre ordinateur ; ajoutez `--add-host=host.docker.internal:host-gateway`), `off` |
| `OLLAMA_DEFAULT_MODEL` | — | le modèle local téléchargé au premier démarrage et inscrit dans les réglages d'Orkeon (`qwen3:8b` dans les exemples) ; vide, rien n'est téléchargé et aucun fichier de réglages n'est écrit (D76) |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | la fenêtre de contexte du serveur de modèles locaux |
| `OLLAMA_AUTO_PULL` | — | `0` : ne jamais télécharger · `1` : télécharger même quand le dossier des modèles n'est pas un volume |
| `OLLAMA_MODELS` | `/home/node/.ollama/models` | le dossier des modèles locaux : là où le script de démarrage attend le volume (`-v cc-ollama:<dossier>`) et télécharge le modèle par défaut |
| `KEV_MODE` | `off` | `host` : joindre un serveur de modèle de décision de votre ordinateur — Kev, ou les poids d1 de Liquid servis comme Kev — sur `127.0.0.1:<KEV_PORT>` dans le conteneur (ajoutez `--add-host=host.docker.internal:host-gateway`) ([Modèles](../guides/models.md#modèle-de-décision)) |
| `KEV_PORT` | `8009` | le port de ce serveur, le même sur votre ordinateur et dans le conteneur : de 1024 à 65535, pas un port que le conteneur utilise déjà (11434, 9000, 8080) |
| `DOCKER_MODE` | `dind` | `dind`, `socket` ou `none` (sans Docker ; sans `--privileged`, `dind` échoue et le signale) ([Modes Docker](../guides/docker-modes.md)) |
| `HARNESS_ORKEON_MCP` | actif | `0` : la synchronisation n'enregistre pas le serveur MCP d'Orkeon dans le `.mcp.json` du dossier, et ne l'active pas dans `.claude/settings.local.json` ([Les outils d'Orkeon dans Claude Code](../guides/orkeon-tools.md)) |
| `WORKSHOP_MCP_TOOLS` | la liste courte | les outils que le serveur MCP d'Orkeon donne à Claude Code : une liste séparée par des virgules qui remplace la liste par défaut, ou `all` pour tout ce qu'Orkeon sert — ses outils de fichiers et de shell compris, que les hooks ne voient pas |
| `WORKSHOP_MCP_EXTRA_TOOLS` | vide | une liste d'outils séparée par des virgules, ajoutée à la liste par défaut |
| `ORKEON_STUDIO_TEAMS_ROOT` | `/workspace/teams` | posée par l'image : le dossier dont `orkeon-studio-run` liste les équipes ([Orkeon Code et les applications de terminal de Studio](../guides/orkeon-code.md#les-applications-de-terminal-de-studio)) ; changez-la avec `ORKEON_WORKSHOP` quand l'atelier est monté ailleurs |
| `FIREWALL_EXTRA_DOMAINS` | vide | des hôtes supplémentaires pour le pare-feu (plus bas) |
| `TZ` | UTC | le fuseau horaire, par exemple `Europe/Paris` |

**N'inventez pas de variables `ORKEON_*`.** Orkeon charge toute variable dont le nom commence par `ORKEON_`
dans sa configuration et dans son fournisseur de secrets. N'utilisez que les siennes (`ORKEON_Llm__Model`,
`ORKEON_Llm__BaseUrl`…, `ORKEON_Llm__Profiles__<id>__BaseUrl`… pour un profil nommé, et
`ORKEON_Orkeon__Decision__Provider`, `ORKEON_Orkeon__Kev__BaseUrl`… pour le modèle de décision) et les trois que
l'image pose, `ORKEON_WORKSHOP`, `ORKEON_HARNESS_OFFLINE` (`1` dans l'image : pas d'audit de vulnérabilités NuGet
pour les gabarits) et l'`ORKEON_STUDIO_TEAMS_ROOT` de Studio, qu'Orkeon ignore. C'est pourquoi les variables
du serveur MCP d'Orkeon s'appellent `WORKSHOP_MCP_*`, et pourquoi `workshop setup keys` refuse une variable
de clé qui commence par `ORKEON_`. Elles l'emportent sur le fichier
de réglages, profils compris : la barrière de budget les lit aussi
([Modèles](../guides/models.md#laccord-pour-les-exécutions-payantes)).

Les lanceurs d'une équipe en lisent une de plus : `TEAM_ENV=<set>` exécute l'équipe sur le jeu de dossiers
`mounts.<set>/<slug>/`
([Points de montage](../concepts/mount-points.md#jeux-de-dossiers--la-même-équipe-sur-dautres-dossiers)).
Les interrupteurs des hooks du harnais, `HARNESS_*`, sont listés dans [Le harnais](./harness.md#interrupteurs) —
parmi eux `HARNESS_MCP_LOG`, qui n'est pas une variable du conteneur : `0` dans le bloc `env` de
`.claude/settings.local.json` arrête le journal des appels que Claude Code fait aux outils MCP d'Orkeon
(`.claude/local/mcp-calls.tsv`).

## Pare-feu

`init-firewall.sh` limite ce que le conteneur peut joindre à une liste d'hôtes autorisés : les plages
d'adresses de GitHub, `registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, trois hôtes de
VS Code, `packages.microsoft.com` et `download.docker.com` — pas nuget.org. Il laisse aussi passer le DNS, le
SSH sortant (tcp/22), le réseau de votre ordinateur (son /24) et les ponts Docker (172.17–19.0.0/16),
SonarQube sur tcp/9000 (localhost toujours, tout hôte en mode `socket`), Ollama sur tcp/11434 en mode `host` et Kev sur tcp/`KEV_PORT` avec `KEV_MODE=host`, tous deux vers la seule adresse que donne `host.docker.internal` ; le script fait foi. La
configuration VS Code de l'atelier le lance ; après un `docker run`, lancez-le à la main :

```bash
sudo --preserve-env=FIREWALL_EXTRA_DOMAINS,OLLAMA_MODE,KEV_MODE,KEV_PORT,DOCKER_MODE /usr/local/bin/init-firewall.sh
```

`FIREWALL_EXTRA_DOMAINS` (hôtes séparés par des espaces ou des virgules) ajoute des hôtes :

| Besoin | Hôtes |
|---|---|
| restaurations NuGet, Orkeon depuis nuget.org | `api.nuget.org` |
| versions de développement d'Orkeon | `nugetregistryv2prod.blob.core.windows.net` |
| téléchargement des modèles Ollama | `registry.ollama.ai dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com` |
| un fournisseur de modèles distants autre qu'Anthropic | son hôte d'API, par exemple `api.openai.com` |
| un modèle de décision hébergé : Jev (TypeSafe), Liquid | `api.typesafe.ai`, `api.liquid.ai` |

Ces noms pointent souvent vers des adresses de CDN partagées avec des sites sans rapport : chaque entrée élargit
donc ce que le conteneur peut joindre. Pour les modèles, l'autre solution est de les télécharger une fois pour
toutes dans le volume `cc-ollama`, depuis un conteneur démarré sans le pare-feu.

## Où trouver quoi dans le conteneur

| Chemin | Contenu |
|---|---|
| `/workspace` | l'atelier |
| `~/.config/Orkeon/appsettings.json` | les réglages d'Orkeon : le modèle qu'utilisent vos équipes |
| `/workspace/settings/<slug>/appsettings.json` | les réglages Orkeon propres à une équipe, utilisés à la place de la ligne précédente par ses lanceurs et par `orkeon-harness-run` — par Orkeon Studio aussi, à la place de son propre fichier de réglages ; `orkeon-bench run`, sur le modèle simulé, en utilise une copie dont les réglages de modèle sont remplacés ([L'atelier](../concepts/workshop.md)) |
| `/workspace/.claude/settings.local.json` | vos interrupteurs du harnais et, en mode `keys`, vos clés de modèles ([Les clés des modèles](../guides/keys.md)) |
| `/workspace/.mcp.json` | les serveurs MCP du dossier ; `orkeon` donne à Claude Code les outils d'Orkeon ([Les outils d'Orkeon dans Claude Code](../guides/orkeon-tools.md)) |
| `/usr/local/lib/orkeon-code/` | Orkeon Code ; `~/.orkeon-code/` contient ses dossiers de confiance et son état, dans le conteneur |
| `/usr/local/share/orkeon-studio/` | les deux applications de terminal d'Orkeon Studio |
| `/home/node/.ollama/models` | les modèles locaux (le volume `cc-ollama`) |
| `/var/log/ollama.log` | le journal du serveur de modèles locaux |
| `/usr/local/share/claude-harness/` | le harnais fourni par l'image (déployé dans l'atelier) |
| `/usr/local/share/cc-usage/` | `cc-usage`, qui dit ce qu'a coûté une session de Claude Code et ce qui a rempli son contexte ; la commande `cc-usage` le lance |
| `/usr/local/share/claude-usage/` | `claude-usage`, un tableau de bord web de votre consommation Claude Code ; `entrypoint.sh` le lance à chaque démarrage sous le nom `claude-usage-dashboard` (`cli.py dashboard --host 0.0.0.0`, port `PORT` ou 8080), journal dans `/var/log/claude-usage.log`. Aucune configuration ne publie ce port : `-p 8080:8080` sur `docker run` l'ouvre à `http://localhost:8080` |
| `/usr/local/share/orkeon-harness/csharp/` | les gabarits .NET |
| `/usr/local/share/orkeon/packages` | le flux NuGet local des paquets Orkeon |
| `/usr/local/share/orkeon/typings/orkeon.d.ts` | les définitions de types du langage de script TypeScript |

Suite : [Le harnais](./harness.md).
