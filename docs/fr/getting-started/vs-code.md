# L'atelier dans VS Code

*[English](../../getting-started/vs-code.md) · Français*

Vous pouvez travailler dans l'atelier depuis VS Code plutôt que depuis un terminal : VS Code lance alors
le même conteneur, avec votre dossier d'atelier sur `/workspace`, et ses terminaux s'ouvrent à l'intérieur.

## Ce qu'il vous faut

- **Docker**, démarré, comme pour [Installer](./install.md#installer-docker) ;
- **VS Code** ([code.visualstudio.com](https://code.visualstudio.com/)) avec son extension
  **Dev Containers**. Pour installer l'extension : dans VS Code, ouvrez la vue Extensions
  (`Ctrl+Shift+X`), tapez `Dev Containers` dans la zone de recherche, choisissez celle de Microsoft
  ([sa page](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)), et
  cliquez sur **Install** ;
- l'image, sous son nom court `orkeon-workshop`, et votre dossier d'atelier où le harnais a été déployé
  une fois. **Démarrez l'atelier une fois avec la ligne de l'étape 1 d'[Installer](./install.md#1-démarrer-latelier)** :
  elle fait les deux ; tapez ensuite `exit` dans le terminal du conteneur pour l'arrêter.

## Ouvrir l'atelier

1. **Ouvrez votre dossier d'atelier** dans VS Code — File → Open Folder, puis `%USERPROFILE%\Orkeon` sous
   Windows par défaut.
2. VS Code propose **Reopen in Container** dans une notification en bas à droite : cliquez dessus. Sans
   notification, ouvrez la palette de commandes (`Ctrl+Shift+P`), tapez `Reopen in Container` et
   choisissez **Dev Containers: Reopen in Container**.

VS Code démarre le conteneur et exécute les scripts de démarrage : installation de Claude Code s'il manque,
synchronisation du harnais, configuration d'Orkeon et d'Ollama, pare-feu. La première fois prend une ou
deux minutes. Ouvrez ensuite un terminal (`` Ctrl+` ``) — c'est le terminal du conteneur, déjà dans
`/workspace` — et tapez `workshop`, ou utilisez l'extension Claude Code ; tapez ensuite
`/workshop-language fr` pour travailler en français ([Votre langue](./install.md#votre-langue)).

**Pas encore de harnais dans le dossier**, et vous préférez ne pas démarrer l'atelier avec l'étape 1
d'Installer ? Le harnais écrit `.devcontainer/devcontainer.json` dans l'atelier lors de son premier
déploiement ; ces lignes le déploient sans rien démarrer, dans PowerShell sur votre ordinateur, l'image
déjà téléchargée ([Démarrer à la main](./install.md#démarrer-à-la-main)) :

```powershell
$folder = "$env:USERPROFILE\Orkeon"                          # votre atelier
docker run --rm --user node --entrypoint sync-harness.sh -v "${folder}:/workspace" orkeon-workshop
```

## Avancé

### Le fichier de configuration

`.devcontainer/devcontainer.json` appartient à votre atelier : le harnais le crée une fois et ne le modifie
plus jamais, adaptez-le donc librement. Ce qu'il définit :

| Réglage | Valeur | À changer quand |
|---|---|---|
| `image` | `orkeon-workshop` | vous n'avez pas donné de nom court à l'image : écrivez `ghcr.io/orkeon/orkeon-workshop:latest` |
| `runArgs` | `--gpus=all`, et les capacités dont le pare-feu a besoin | votre ordinateur n'a pas de GPU NVIDIA : retirez `--gpus=all`, sinon le conteneur ne démarrera pas |
| `workspaceMount`, `workspaceFolder` | le dossier ouvert, sur `/workspace` | jamais : le harnais attend l'atelier à cet endroit |
| `mounts` | un volume pour l'état de Claude Code, `cc-ollama` pour les modèles | vous voulez d'autres noms de volumes |
| `containerEnv` | `CLAUDE_CONFIG_DIR` ; l'image ne nomme aucun modèle local | vous en voulez un téléchargé au premier démarrage : ajoutez `"OLLAMA_DEFAULT_MODEL": "qwen3:8b"` (la ligne en commentaire) |
| `postStartCommand` | les scripts de démarrage | rarement |

Quand le pare-feu est actif, le modèle que nomme `containerEnv` ne peut pas être téléchargé : ses hôtes ne figurent pas
dans la liste des hôtes autorisés, et le téléchargement démarre en arrière-plan juste avant que le pare-feu
ne se ferme. Démarrez une fois l'atelier avec la ligne de l'étape 1 d'[Installer](./install.md#1-démarrer-latelier)
— elle télécharge le modèle dans le même volume `cc-ollama` —, ou ajoutez les hôtes d'Ollama donnés dans
[Options du conteneur](../reference/configuration.md#pare-feu) à `FIREWALL_EXTRA_DOMAINS`, dans
`containerEnv`.

Le conteneur n'a pas accès à Docker : on y construit et on y exécute des équipes, pas la pile SonarQube
([Modes Docker](../guides/docker-modes.md)).

### Les configurations du dépôt

Le dépôt d'Orkeon Workshop contient trois `devcontainer.json` qui lui sont propres (`.devcontainer/`,
`.devcontainer/dind/`, `.devcontainer/host-socket/`). Ils servent à **travailler sur l'image elle-même** :
VS Code ouvre le dépôt sur `/workspace`, construit l'image à partir de ses sources, et le harnais n'y est
pas déployé — le dépôt n'est pas un atelier, comme le dit le message de démarrage — sauf si vous donnez à
la copie de travail un profil source (`-e HARNESS_PROFILE=dev`, ou `workshop-profile dev` dans un
terminal) : elle reçoit alors les skills de développement de ce profil
([Dans une copie de travail](../reference/harness.md#dans-une-copie-de-travail)). Pour construire des
équipes, ouvrez votre dossier d'atelier comme expliqué plus haut.

Suite : [L'atelier](../concepts/workshop.md).
