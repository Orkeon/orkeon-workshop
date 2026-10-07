# Options et variables du conteneur

*[English](../../reference/configuration.md) · Français*

## Options de `docker run`

| Option | À quoi elle sert |
|---|---|
| `-v "<folder>:/workspace"` | **Obligatoire : l'atelier.** Le harnais y est déployé, Claude Code s'y ouvre, vos équipes y vivent. N'importe quel dossier convient ; `%USERPROFILE%\Orkeon` est celui dont Orkeon Studio liste le dossier `teams\` par défaut ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). |
| `--name <name>` | le nom du conteneur, pour `docker start -ai <name>` et `docker exec` |
| `-it --init` | un terminal interactif, et un petit processus d'initialisation qui nettoie les processus terminés lancés dans le conteneur |
| `-v cc-ollama:/home/node/.ollama/models` | les modèles locaux dans un volume : téléchargés une seule fois, partagés par tous les conteneurs, conservés quand un conteneur est remplacé. Sans volume, le modèle par défaut n'est pas téléchargé automatiquement. |
| `--gpus=all` | le GPU NVIDIA, pour les modèles locaux ([Modèles](../guides/models.md#utiliser-le-gpu)). Retirez cette option sur un ordinateur qui n'en a pas, sinon le conteneur ne démarrera pas. |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | ce dont le pare-feu facultatif a besoin |
| `-v /var/run/docker.sock:/var/run/docker-host.sock`, `-e DOCKER_MODE=socket`, `--add-host=host.docker.internal:host-gateway` | Docker depuis l'intérieur du conteneur, à travers le démon de votre ordinateur, pour la pile SonarQube ([Modes Docker](../guides/docker-modes.md)) |
| `--privileged -e DOCKER_MODE=dind -v orkeon-docker:/var/lib/docker` | Docker-in-Docker à la place, ses images dans un volume |
| `-v "<name>-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude` | conserve l'état de Claude Code (connexion, historique, mémoire) dans un volume, pour qu'il survive à un nouveau conteneur ([Mettre à jour](../guides/updating.md)) |
| `-v <file>:/run/secrets/github_packages_token:ro` | un jeton pour mettre à jour Orkeon dans le conteneur depuis le canal de développement, sans qu'il apparaisse dans `docker inspect` (`-e GITHUB_PACKAGES_TOKEN` fonctionne aussi) |

## Variables de l'image

Définissez-les avec `-e NAME=value` sur la commande `docker run`, ou dans le `containerEnv` d'un
`devcontainer.json`.

| Variable | Valeur par défaut | Ce qu'elle fait |
|---|---|---|
| `ORKEON_WORKSHOP` | `/workspace` | le chemin de l'atelier dans le conteneur : `-v "<folder>:/orkeon" -e ORKEON_WORKSHOP=/orkeon` |
| `HARNESS_SYNC` | activé | `off` : ne pas synchroniser l'atelier avec le harnais au démarrage |
| `CLAUDE_CODE_VERSION` | `latest` | pour une image sans Claude Code (celle qui est publiée) : la version installée au premier démarrage ; `none` n'installe rien |
| `OLLAMA_MODE` | `local` | `local`, `host` (l'Ollama de votre ordinateur ; ajoutez `--add-host=host.docker.internal:host-gateway`), `off` |
| `OLLAMA_DEFAULT_MODEL` | `qwen3:8b` | le modèle téléchargé au premier démarrage et inscrit dans les réglages d'Orkeon |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | la fenêtre de contexte du serveur de modèles locaux |
| `OLLAMA_AUTO_PULL` | — | `0` : ne jamais télécharger · `1` : télécharger même quand le dossier des modèles n'est pas un volume |
| `DOCKER_MODE` | `dind` | `dind`, `socket` ou `none` (sans Docker ; sans `--privileged`, `dind` échoue et le signale) ([Modes Docker](../guides/docker-modes.md)) |
| `FIREWALL_EXTRA_DOMAINS` | vide | des hôtes supplémentaires pour le pare-feu (plus bas) |
| `TZ` | UTC | le fuseau horaire, par exemple `Europe/Paris` |

**N'inventez pas de variables `ORKEON_*`.** Orkeon charge toute variable dont le nom commence par `ORKEON_`
dans sa configuration et dans son fournisseur de secrets. N'utilisez que les siennes (`ORKEON_Llm__Model`,
`ORKEON_Llm__BaseUrl`…, et `ORKEON_Llm__Profiles__<id>__BaseUrl`… pour un profil nommé) et les deux du
harnais, `ORKEON_WORKSHOP` et `ORKEON_HARNESS_OFFLINE`, qu'Orkeon ignore. Elles l'emportent sur le fichier
de réglages, profils compris : la barrière de budget les lit aussi
([Modèles](../guides/models.md#laccord-pour-les-exécutions-payantes)).

Les lanceurs d'une équipe en lisent une de plus : `TEAM_ENV=<set>` exécute l'équipe sur le jeu de dossiers
`mounts.<set>/<slug>/`
([Points de montage](../concepts/mount-points.md#jeux-de-dossiers--la-même-équipe-sur-dautres-dossiers)).
Les interrupteurs des hooks du harnais, `HARNESS_*`, sont listés dans [Le harnais](./harness.md#interrupteurs).

## Pare-feu

`init-firewall.sh` limite ce que le conteneur peut joindre à une liste d'hôtes autorisés : GitHub, npm,
Anthropic, VS Code et les serveurs de paquets de Microsoft. La configuration VS Code de l'atelier le lance ;
après un `docker run`, lancez-le à la main :

```bash
sudo --preserve-env=FIREWALL_EXTRA_DOMAINS,OLLAMA_MODE,DOCKER_MODE /usr/local/bin/init-firewall.sh
```

`FIREWALL_EXTRA_DOMAINS` (hôtes séparés par des espaces ou des virgules) ajoute des hôtes :

| Besoin | Hôtes |
|---|---|
| restaurations NuGet, Orkeon depuis nuget.org | `api.nuget.org` |
| versions de développement d'Orkeon | `nugetregistryv2prod.blob.core.windows.net` |
| téléchargement des modèles Ollama | `registry.ollama.ai dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com` |
| un fournisseur de modèles distants autre qu'Anthropic | son hôte d'API, par exemple `api.openai.com` |

Ces noms pointent souvent vers des adresses de CDN partagées avec des sites sans rapport : chaque entrée élargit
donc ce que le conteneur peut joindre. Pour les modèles, l'autre solution est de les télécharger une fois pour
toutes dans le volume `cc-ollama`, depuis un conteneur démarré sans le pare-feu.

## Où trouver quoi dans le conteneur

| Chemin | Contenu |
|---|---|
| `/workspace` | l'atelier |
| `~/.config/Orkeon/appsettings.json` | les réglages d'Orkeon : le modèle qu'utilisent vos équipes |
| `/workspace/settings/<slug>/appsettings.json` | les réglages Orkeon propres à une équipe, utilisés à la place de la ligne précédente par ses lanceurs et par `orkeon-harness-run` — par Orkeon Studio aussi, à la place de son propre fichier de réglages ; `orkeon-bench run`, sur le modèle simulé, en utilise une copie dont les réglages de modèle sont remplacés ([L'atelier](../concepts/workshop.md)) |
| `/home/node/.ollama/models` | les modèles locaux (le volume `cc-ollama`) |
| `/var/log/ollama.log` | le journal du serveur de modèles locaux |
| `/usr/local/share/claude-harness/` | le harnais fourni par l'image (déployé dans l'atelier) |
| `/usr/local/share/orkeon-harness/csharp/` | les gabarits .NET |
| `/usr/local/share/orkeon/packages` | le flux NuGet local des paquets Orkeon |
| `/usr/local/share/orkeon/typings/orkeon.d.ts` | les définitions de types du langage de script TypeScript |

Suite : [Le harnais](./harness.md).
