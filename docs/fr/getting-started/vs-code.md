# L'atelier dans VS Code

*[English](../../getting-started/vs-code.md) · Français*

Vous pouvez travailler dans l'atelier depuis VS Code plutôt que depuis un terminal : VS Code lance alors
le même conteneur, avec votre dossier d'atelier sur `/workspace`, et ses terminaux s'ouvrent à l'intérieur.

## Ce qu'il vous faut

- VS Code avec l'extension [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) ;
- l'image sous son nom court `orkeon-workshop` (étape 1 de la page [Installer](./install.md)) ;
- le dossier de l'atelier, où le harnais a été déployé une fois (voir ci-dessous).

## Ouvrir l'atelier

1. **Déployez le harnais une fois.** Le harnais écrit `.devcontainer/devcontainer.json` dans l'atelier lors
   de son premier déploiement. Si vous avez déjà démarré un conteneur sur ce dossier
   ([Installer](./install.md), étape 3), le fichier est là. Sinon, déployez le harnais sans rien démarrer :

   ```powershell
   docker run --rm --user node --entrypoint sync-harness.sh -v "$env:USERPROFILE\Orkeon:/workspace" orkeon-workshop
   ```

2. **Ouvrez le dossier** `%USERPROFILE%\Orkeon` dans VS Code (File → Open Folder).
3. Lancez **Dev Containers: Reopen in Container** depuis la palette de commandes (`Ctrl+Shift+P`).

VS Code démarre le conteneur et exécute les scripts de démarrage : installation de Claude Code s'il manque,
synchronisation du harnais, configuration d'Orkeon et d'Ollama, pare-feu. Ouvrez ensuite un terminal
(`` Ctrl+` ``) — il est déjà dans `/workspace` — et tapez `workshop`, ou utilisez l'extension Claude Code ;
tapez ensuite `/workshop-language fr` pour travailler en français ([Votre langue](./install.md#votre-langue)).

Quand le pare-feu est actif, le modèle par défaut ne peut pas être téléchargé : ses hôtes ne figurent pas
dans la liste des hôtes autorisés, et le téléchargement démarre en arrière-plan juste avant que le pare-feu
ne se ferme. Démarrez une fois le conteneur avec `docker run` ([Installer](./install.md), étape 3 — même
volume `cc-ollama`), ou ajoutez les hôtes d'Ollama donnés dans
[Options du conteneur](../reference/configuration.md#pare-feu) à `FIREWALL_EXTRA_DOMAINS`, dans
`containerEnv`.

## Le fichier de configuration

`.devcontainer/devcontainer.json` appartient à votre atelier : le harnais le crée une fois et ne le modifie
plus jamais, adaptez-le donc librement. Ce qu'il définit :

| Réglage | Valeur | À changer quand |
|---|---|---|
| `image` | `orkeon-workshop` | vous n'avez pas donné de nom court à l'image : écrivez `ghcr.io/orkeon/orkeon-workshop:latest` |
| `runArgs` | `--gpus=all`, et les capacités dont le pare-feu a besoin | votre ordinateur n'a pas de GPU NVIDIA : retirez `--gpus=all`, sinon le conteneur ne démarrera pas |
| `workspaceMount`, `workspaceFolder` | le dossier ouvert, sur `/workspace` | jamais : le harnais attend l'atelier à cet endroit |
| `mounts` | un volume pour l'état de Claude Code, `cc-ollama` pour les modèles | vous voulez d'autres noms de volumes |
| `postStartCommand` | les scripts de démarrage | rarement |

Le conteneur n'a pas accès à Docker : on y construit et on y exécute des équipes, pas la pile SonarQube
([Modes Docker](../guides/docker-modes.md)).

## Les configurations du dépôt

Le dépôt d'Orkeon Workshop contient trois `devcontainer.json` qui lui sont propres (`.devcontainer/`,
`.devcontainer/dind/`, `.devcontainer/host-socket/`). Ils servent à **travailler sur l'image elle-même** :
VS Code ouvre le dépôt sur `/workspace`, construit l'image à partir de ses sources, et le harnais n'y est
pas déployé — le dépôt n'est pas un atelier, comme le dit le message de démarrage. Pour construire des
équipes, ouvrez votre dossier d'atelier comme expliqué plus haut.

Suite : [L'atelier](../concepts/workshop.md).
