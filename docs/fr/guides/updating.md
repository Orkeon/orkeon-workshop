# Mettre à jour

*[English](../../guides/updating.md) · Français*

Trois choses se mettent à jour, chacune à sa façon : Orkeon et Ollama dans un conteneur, le harnais, et
l'image elle-même.

## Orkeon et Ollama, dans un conteneur

```bash
orkeon-update --check              # version installée et versions disponibles ; rien ne change
orkeon-update --source             # reconstruit la ligne de commande depuis le dernier commit de la branche main d'Orkeon (quelques minutes)
orkeon-update --source <commit>    # depuis une branche, une étiquette ou un commit donnés
orkeon-update --channel dev        # la dernière version de développement publiée (nécessite un jeton GitHub Packages)
orkeon-update --channel release    # revient à la dernière préversion étiquetée
orkeon-update --version <version>  # une version publiée précise (1.0.0-rc.4 est plus ancienne que l'Orkeon construit dans l'image)
orkeon-update --ollama             # met aussi Ollama à niveau et redémarre son serveur
```

L'image contient Orkeon construit à partir des sources de `main` (`orkeon --version` se termine par
`.src.<date>.g<commit>`). Une construction depuis les sources a besoin de github.com et de nuget.org : si le
pare-feu est actif, ajoutez `api.nuget.org` à `FIREWALL_EXTRA_DOMAINS`. Dans Claude Code, le skill
`orkeon-update` pilote le même script — demandez *« mets à jour Orkeon »*. Une mise à jour faite ainsi ne
vaut que pour ce conteneur, et les gabarits .NET gardent les paquets de l'image ; pour tout mettre à jour,
mettez à jour l'image. Sans canal ni version explicites, le script ne revient jamais à une version
antérieure. Utilisez `orkeon-update`, et non `dotnet tool update`, qui ne peut pas remplacer un outil
installé dans une couche de l'image.

## Le harnais

Rien à faire : le harnais — les skills, les agents, les règles, les hooks et le `.claude/settings.json`
qui les déclare — voyage dans l'image, et à chaque démarrage le conteneur lance `sync-harness.sh`, qui
aligne l'atelier sur le harnais de son image. Une nouvelle image apporte un nouveau harnais : recréez le
conteneur sur elle ([ci-dessous](#limage)), et son premier démarrage met à jour l'atelier qu'il monte.

L'image porte un manifeste de son harnais, une empreinte par fichier, et l'atelier garde le manifeste de
ce qui a été déployé la dernière fois (`.claude/.harness-manifest`). Quand les deux sont identiques, rien
n'est fait. Sinon, chaque fichier suit la règle de son emplacement :

| Dans l'atelier | Avec une nouvelle image |
|---|---|
| `.claude/` (skills, agents, règles, hooks, gabarits, évals, `settings.json`, `harness/`), `references/`, `library/examples/` | **Propriété de l'image** : les fichiers nouveaux ou modifiés sont copiés, ceux que l'image a retirés sont supprimés. Un fichier que vous avez modifié est d'abord sauvegardé sous `.claude/harness-backup/<stamp>/`. |
| `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.claude/settings.local.json`, `.devcontainer/devcontainer.json`, `settings/README.md`, les rayons de `library/` | **Créés une seule fois**, s'ils manquent : jamais mis à jour. |
| `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.<name>/`, `archive/`, `.claude/local/`, `references/local/`, tout ce que vous ajoutez | **À vous** : jamais touchés. |

Votre `CLAUDE.md` n'est jamais réécrit, et pourtant les consignes suivent : sa première ligne importe
`.claude/harness/HARNESS.md`, qui appartient à l'image. [L'atelier](../concepts/workshop.md#ce-qui-appartient-à-qui)
donne les règles en entier.

```bash
sync-harness.sh --dry-run   # ce que la synchronisation changerait ; rien ne change
sync-harness.sh --force     # synchroniser de nouveau, même si l'image n'a pas changé
```

- Un atelier est mis à jour quand un conteneur qui le monte démarre : avec plusieurs dossiers d'atelier,
  chacun suit au prochain démarrage de son propre conteneur.
- C'est l'image qui décide, quelle que soit la plus récente : un conteneur resté sur une image antérieure
  qui démarre sur le même dossier y remet son propre harnais. Passez tous les conteneurs d'un atelier à la
  nouvelle image.
- Dans un atelier [versionné avec git](../concepts/workshop.md#le-versionner-avec-git), `.claude/` l'est
  aussi : après une mise à jour, `git status` montre ce que le nouveau harnais a changé — committez-le.
- `-e HARNESS_SYNC=off` désactive la synchronisation pour un conteneur.

## L'image

Un conteneur garde l'image à partir de laquelle il a été créé. Mettre à jour, c'est donc deux choses :
télécharger la nouvelle image, puis remplacer votre conteneur par un nouveau, créé à partir d'elle. Rien
de ce qui est à vous ne vit dans le conteneur lui-même — votre atelier est un dossier de votre ordinateur,
les modèles locaux et l'état de Claude Code (votre connexion, votre historique et votre mémoire) sont dans
des volumes Docker — donc rien n'est perdu, et l'ancien conteneur est gardé jusqu'à ce que le nouveau
fonctionne.

### Migrer un conteneur vers une nouvelle image

Les commandes se tapent dans un terminal **de votre ordinateur** — PowerShell sous Windows, n'importe quel
terminal sous Linux — et non dans le terminal du conteneur. Elles sont les mêmes sur les deux, sauf à
l'étape 5. Elles utilisent le nom de conteneur de la page [Installer](../getting-started/install.md),
`my-orkeon-workshop` : si vous avez donné un autre nom au vôtre, remplacez-le partout (`docker ps -a` liste
vos conteneurs). Le plus long est le téléchargement, jusqu'à 19 Go environ.

**1. Arrêtez le conteneur.** Terminez d'abord ce qui est en cours : laissez finir un test, quittez Claude
Code (`/exit`). Puis tapez `exit` dans le terminal du conteneur, ou, depuis un autre terminal :

```powershell
docker stop my-orkeon-workshop
```

**2. Lisez comment il a été créé.**

```powershell
docker inspect -f "{{range .HostConfig.Binds}}{{println .}}{{end}}" my-orkeon-workshop
```

```text
/var/run/docker.sock:/var/run/docker-host.sock
cc-ollama:/home/node/.ollama/models
my-orkeon-workshop-claude:/home/node/.claude
C:\Users\vous\Orkeon:/workspace
```

Deux lignes comptent :

- celle qui finit par `:/workspace` commence par **votre dossier d'atelier** — ici `C:\Users\vous\Orkeon`.
  L'étape 5 en a besoin ;
- celle qui finit par `:/home/node/.claude` est le volume de l'état de Claude Code. **Pas de ligne de ce
  genre ?** Votre conteneur a été créé sans ce volume : faites les étapes 3 et 4, puis
  [Sans le volume de Claude Code](#sans-le-volume-de-claude-code) à la place de l'étape 5.

**3. Téléchargez la nouvelle image.**

```powershell
docker tag orkeon-workshop orkeon-workshop:previous      # garde l'image que vous aviez, pour y revenir
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

`Status: Image is up to date`, à la fin de la deuxième commande, dit qu'il n'y a pas d'image plus récente
que celle que vous avez téléchargée la dernière fois.

**4. Mettez l'ancien conteneur de côté.** Il est renommé, pas supprimé : il reste entier, pour y revenir.

```powershell
docker rename my-orkeon-workshop my-orkeon-workshop-old
```

**5. Créez le nouveau conteneur**, avec la commande de la page [Installer](../getting-started/install.md)
et votre dossier de l'étape 2 dans la variable. Sous Windows, dans PowerShell :

```powershell
$workshop = "$env:USERPROFILE\Orkeon"                        # votre dossier d'atelier : celui de l'étape 2

docker run -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${workshop}:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop
```

Sous Linux :

```bash
workshop="$HOME/Orkeon"                                      # votre dossier d'atelier : celui de l'étape 2

docker run -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$workshop:/workspace" \
  -e DOCKER_MODE=socket orkeon-workshop
```

Pas de carte graphique NVIDIA ? Retirez `--gpus=all`, comme à l'installation
([l'option `--gpus=all`](../reference/troubleshooting.md#loption---gpusall)).

**6. Vérifiez le nouveau conteneur.** Son premier démarrage prend une minute ou deux : il installe de
nouveau Claude Code — votre connexion est dans le volume, elle n'est pas redemandée. Parmi les messages,
le harnais de la nouvelle image arrive dans votre atelier ([Le harnais](#le-harnais)) :

```text
[harness] synchronised into /workspace: 3 added, 41 updated, 1 removed, 0 seeded, 0 saved (image update)
```

— ou `[harness] up to date (/workspace)` quand la nouvelle image porte le même harnais. Puis, dans le
conteneur :

```bash
orkeon-bench doctor      # se termine par « Result: OK »
workshop                 # ouvre Claude Code dans votre atelier
```

**7. Supprimez l'ancien conteneur**, une fois que le nouveau fonctionne :

```powershell
docker rm my-orkeon-workshop-old
docker rmi orkeon-workshop:previous      # libère l'espace disque de l'image précédente
```

**Pour revenir en arrière**, avant l'étape 7 : l'ancien conteneur reprend son nom, sur l'image à partir de
laquelle il a été créé, et son démarrage remet le harnais de cette image dans l'atelier.

```powershell
docker rm -f my-orkeon-workshop
docker rename my-orkeon-workshop-old my-orkeon-workshop
docker tag orkeon-workshop:previous orkeon-workshop
docker start -ai my-orkeon-workshop
```

Les mêmes étapes, sans l'étape 3, recréent un conteneur pour lui donner ce qui ne s'ajoute pas après
coup : `--gpus=all`, un volume, une variable.

### Sans le volume de Claude Code

Un conteneur créé sans `-v my-orkeon-workshop-claude:/home/node/.claude` garde l'état de Claude Code —
`~/.claude` et `~/.claude.json` : votre connexion, votre historique et votre mémoire — dans sa propre
couche en écriture, et **un nouveau conteneur n'hérite pas de la couche en écriture de l'ancien**. Après
les étapes 1 à 4, à la place de l'étape 5, créez le nouveau conteneur sans le démarrer, copiez-y l'état,
puis démarrez-le. Sous Windows, dans PowerShell :

```powershell
$workshop = "$env:USERPROFILE\Orkeon"                        # votre dossier d'atelier : celui de l'étape 2

# Créer le nouveau conteneur, sans le démarrer
docker create -it --init --name my-orkeon-workshop --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${workshop}:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop

# Copier l'état de Claude Code de l'ancien conteneur vers le nouveau
cmd /c "docker cp my-orkeon-workshop-old:/home/node/.claude - | docker cp - my-orkeon-workshop:/home/node/"
cmd /c "docker cp my-orkeon-workshop-old:/home/node/.claude.json - | docker cp - my-orkeon-workshop:/home/node/.claude/"

# Le démarrer
docker start -ai my-orkeon-workshop
```

Sous Linux :

```bash
workshop="$HOME/Orkeon"                                      # votre dossier d'atelier : celui de l'étape 2

# Créer le nouveau conteneur, sans le démarrer
docker create -it --init --name my-orkeon-workshop --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$workshop:/workspace" \
  -e DOCKER_MODE=socket orkeon-workshop

# Copier l'état de Claude Code de l'ancien conteneur vers le nouveau
docker cp my-orkeon-workshop-old:/home/node/.claude - | docker cp - my-orkeon-workshop:/home/node/
docker cp my-orkeon-workshop-old:/home/node/.claude.json - | docker cp - my-orkeon-workshop:/home/node/.claude/

# Le démarrer
docker start -ai my-orkeon-workshop
```

Puis continuez à l'étape 6.

- La copie fait passer une archive d'un conteneur à l'autre, ce qui conserve les propriétaires et les
  droits des fichiers. Sous Windows elle passe par `cmd` parce que Windows PowerShell 5 corrompt les données
  binaires dans un tube (PowerShell 7.4 et `bash` n'en ont pas besoin).
- Avec `CLAUDE_CONFIG_DIR`, `.claude.json` se trouve dans `~/.claude`, d'où sa destination.
- `docker diff my-orkeon-workshop-old` liste tout ce que l'ancien conteneur a modifié d'autre ; la même
  paire de `docker cp` le transfère.

La fois suivante, le volume est en place : les étapes ci-dessus suffisent, avec l'étape 5 telle qu'elle
est écrite.

## VS Code

Avec la configuration VS Code de l'atelier ([L'atelier dans VS Code](../getting-started/vs-code.md)),
téléchargez la nouvelle image — les trois commandes de l'étape 3 ci-dessus — puis lancez **Dev Containers:
Rebuild Container** depuis la palette de commandes (`Ctrl+Shift+P`) : le conteneur est recréé sur l'image
`orkeon-workshop` actuelle. L'état de Claude Code vit dans un volume et survit à l'opération.

Suite : [Options et variables du conteneur](../reference/configuration.md).
