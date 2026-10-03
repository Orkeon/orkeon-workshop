# Installer

*[English](../../getting-started/install.md) · Français*

Cette page vous mène de zéro jusqu'à Claude Code ouvert dans votre atelier. Aucune programmation n'est
nécessaire : vous copiez quelques commandes dans un terminal. Comptez 30 à 60 minutes, dont l'essentiel en
téléchargements.

> Vous préférez un accompagnement pas à pas ? Collez le prompt de la page [Découvrir avec Claude](../discover-with-claude.md)
> dans une conversation avec Claude, puis dites *« aide-moi à l'installer »*.

## Ce qu'il vous faut

| | |
|---|---|
| Un ordinateur | Windows 10/11 ou Linux, sur un processeur x86-64. macOS n'est pas testé (l'image est construite pour `linux/amd64` uniquement). |
| Docker | [Docker Desktop](https://docs.docker.com/desktop/) sous Windows, avec le moteur WSL 2 (**WSL 2 based engine**, dans Settings → General) ; Docker Engine sous Linux. |
| De l'espace disque | environ 20 Go pour l'image, plus 5 Go pour le modèle local par défaut. |
| Un compte Claude | un compte qui donne accès à Claude Code — voir [la documentation de Claude Code](https://code.claude.com/docs/en/overview). |
| Une carte graphique (facultative) | un GPU NVIDIA rend les modèles locaux rapides. Sans GPU, ils tournent sur le processeur, plus lentement. |

## 1. Récupérer l'image

Ouvrez un terminal — **PowerShell** sous Windows (menu Démarrer → « PowerShell »), n'importe quel terminal
sous Linux — et exécutez :

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

La première ligne télécharge l'image (environ 19 Go, cela prend donc un moment). La seconde lui donne le
nom court `orkeon-workshop`, qu'utilisent toutes les autres commandes.

## 2. Créer le dossier de l'atelier

L'**atelier** est un dossier de votre ordinateur où vivront vos équipes. Créez-le une fois pour toutes :

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force "$env:USERPROFILE\Orkeon" | Out-Null
```

```bash
# Linux
mkdir -p ~/Orkeon
```

Sous Linux, le conteneur écrit sous l'utilisateur `node` (uid 1000) : si `id -u` affiche un autre
nombre, donnez aussi à cet uid le droit d'écrire dans le dossier, par exemple
`sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX ~/Orkeon`.

Sous Windows, `%USERPROFILE%\Orkeon` est le bon emplacement : Orkeon Studio liste les équipes de son
dossier `teams\`. Tout autre dossier convient aussi — Studio ne verra simplement pas les équipes.

## 3. Démarrer le conteneur

Sous Windows, dans PowerShell (l'accent grave `` ` `` prolonge la commande sur la ligne suivante) :

```powershell
docker run -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop
```

Sous Linux :

```bash
docker run -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$HOME/Orkeon:/workspace" \
  -e DOCKER_MODE=socket orkeon-workshop
```

> **Pas de carte graphique NVIDIA ?** Retirez `--gpus=all`, sinon le conteneur ne démarrera pas.

Le rôle de chaque partie :

| Partie | Pourquoi |
|---|---|
| `--name my-orkeon-workshop` | le nom de votre conteneur, pour le rouvrir plus tard |
| `-v "<your folder>:/workspace"` | **votre atelier** : dans le conteneur, c'est `/workspace`, et tout ce qui y est écrit arrive dans votre dossier |
| `-v cc-ollama:/home/node/.ollama/models` | un volume Docker pour les modèles locaux : téléchargés une fois, conservés quand le conteneur est remplacé |
| `-v my-orkeon-workshop-claude:/home/node/.claude`, `-e CLAUDE_CONFIG_DIR=…` | un volume pour l'état de Claude Code — votre connexion, votre historique et votre mémoire — afin qu'un nouveau conteneur, après une mise à jour de l'image, le conserve ([Mettre à jour](../guides/updating.md)) |
| `--gpus=all` | permet aux modèles locaux d'utiliser votre GPU NVIDIA |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | nécessaires au pare-feu facultatif |
| le socket Docker, `-e DOCKER_MODE=socket`, `--add-host` | Docker depuis l'intérieur du conteneur, pour la pile qualité SonarQube — les équipes n'en ont pas besoin ([Modes Docker](../guides/docker-modes.md)) |

Toutes les options et variables sont décrites dans [Options et variables du conteneur](../reference/configuration.md).

## 4. Ce qui se passe au premier démarrage

Le conteneur se prépare, ce qui prend une ou deux minutes la première fois :

- il installe Claude Code (l'image publiée ne le contient pas : c'est un logiciel d'Anthropic) ;
- il déploie le harnais dans votre atelier — vous verrez des lignes comme
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)` ;
- il démarre le serveur de modèles locaux (Ollama) et télécharge le modèle par défaut, `qwen3:8b` (environ
  5 Go), **en arrière-plan** : vous pouvez travailler pendant ce temps.

Il se termine par une invite de commande dans le conteneur, avec cette ligne parmi les messages :

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? then type /orkeon-tour in Claude Code)
```

Votre dossier d'atelier contient maintenant `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`,
`settings/` et quelques autres : [L'atelier](../concepts/workshop.md) les explique un par un.

## 5. Vérifier que tout fonctionne

```bash
orkeon-bench doctor
```

```text
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20261003.ga2bb6c3
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20261003.ga2bb6c3
PASS  orkeon tool catalogue           83 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
PASS  Ollama reachable                http://127.0.0.1:11434/api/tags
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
Result: OK
```

Un `WARN` n'est pas une erreur : `Ollama reachable` affiche par exemple un avertissement tant que le
serveur de modèles démarre encore, et `orkeon CLI on PATH` en affiche un quand l'Orkeon de l'image est un
autre commit que celui sur lequel les documents de référence ont été vérifiés — une image construite par
vos soins depuis le dernier commit de la branche `main` d'Orkeon, ou après `orkeon-update` ; l'image
publiée porte le commit vérifié. Les `FAIL` sont expliqués dans
[Dépannage](../reference/troubleshooting.md).

## 6. Ouvrir Claude Code dans l'atelier

```bash
workshop
```

La première fois, Claude Code vous demande de vous connecter : il affiche un lien — ouvrez-le dans votre
navigateur, connectez-vous, puis collez dans le terminal le code qui vous est donné. Tapez ensuite :

```text
/orkeon-tour
```

et laissez la visite guidée vous présenter les lieux. Ou demandez directement une équipe — voir
[Votre première équipe](./first-team.md).

## Plus tard : rouvrir, ajouter un terminal, arrêter

```powershell
docker start -ai my-orkeon-workshop                    # rouvrir le conteneur (puis : workshop)
docker exec -it --user node my-orkeon-workshop zsh     # un second terminal dans le même conteneur
```

Taper `exit` dans le premier terminal arrête le conteneur ; votre dossier d'atelier et le volume des
modèles sont conservés. Pour installer plus tard une image plus récente, voir
[Mettre à jour](../guides/updating.md).

## Autres façons de démarrer

- **VS Code** : ouvrez le dossier de l'atelier dans VS Code et lancez *Reopen in Container* —
  [L'atelier dans VS Code](./vs-code.md).
- **Construire l'image vous-même** au lieu de la télécharger : `docker build -t orkeon-workshop .devcontainer`
  depuis un clone du dépôt — [Construire l'image](../../../.devcontainer/README.md) (en anglais).

Suite : [Votre première équipe](./first-team.md).
