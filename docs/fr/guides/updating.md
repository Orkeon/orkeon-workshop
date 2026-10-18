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
| `.claude/` (skills, agents, règles, hooks, gabarits, évals, `settings.json`, `harness/`), `references/`, `library/examples/` | **Propriété de l'image** : les fichiers nouveaux ou modifiés sont copiés, ceux que l'image a retirés sont supprimés. Le contenu de `.claude/` suit le profil actif : avec `user`, exactement ce que ces pages décrivent ; un autre profil ajoute ou retire des packs, et un fichier que le nouveau profil laisse de côté est retiré comme un fichier que l'image ne livre plus. Un fichier que vous avez modifié est d'abord sauvegardé sous `.claude/harness-backup/<stamp>/`. |
| `CLAUDE.md`, `.gitignore`, `.gitattributes`, `.claude/settings.local.json`, `.devcontainer/devcontainer.json`, `settings/README.md`, les rayons de `library/` | **Créés une seule fois**, s'ils manquent : jamais mis à jour — sauf les clés de `.claude/settings.local.json` que `/workshop-profile` possède (les interrupteurs `env` des packs, `skillOverrides`). |
| `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.<name>/`, `archive/`, `.claude/local/` (votre langue et votre profil), `.claude/agent-memory/` (la mémoire du relecteur), `references/local/`, tout ce que vous ajoutez | **À vous** : jamais touchés. |

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
- Le profil de l'espace (`.claude/local/profile`, écrit par `/workshop-profile`) survit à la mise à jour de
  l'image et décide des packs que le nouveau harnais déploie ; quand il n'est pas `user`, la ligne de résumé
  se termine par ` - profile <name> in a <space> space (<packs>)`. Dans une copie de travail git, la même
  synchronisation n'écrit rien de ce que git suit, et refuse en bloc (sortie 2) un déploiement qui le ferait
  ([Dans une copie de travail](../reference/harness.md#dans-une-copie-de-travail)).
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
`my-orkeon-workshop` : si vous avez donné un autre nom au vôtre, remplacez-le partout, `$name` de l'étape 5
compris (`docker ps -a` liste vos conteneurs). Le plus long est le téléchargement, jusqu'à 19 Go environ.

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
et votre dossier de l'étape 2 dans la variable ; la ligne `-e OLLAMA_DEFAULT_MODEL` comme à votre premier
démarrage, ou retirée — les modèles déjà dans le volume `cc-ollama` restent dans les deux cas. Les deux volumes
suivent `$name` : avec le nom par défaut, `"${name}-claude"` est `my-orkeon-workshop-claude`, le volume de
l'étape 2, et le nouveau conteneur garde donc l'état de Claude Code ; `"${name}-worktrees"` est créé vide si
l'ancien conteneur n'en avait pas ([Les worktrees sur un volume](./docker-modes.md#avancé--les-worktrees-sur-un-volume)).
Si la ligne `:/home/node/.claude` de l'étape 2 nomme un autre volume que `<le nom de votre conteneur>-claude`,
mettez ce volume sur la ligne à la place — sauf si un autre conteneur le monte aussi : voyez alors
[Un volume Claude Code par conteneur](#un-volume-claude-code-par-conteneur). Sous Windows, dans PowerShell :

```powershell
$name = "my-orkeon-workshop"                                 # le conteneur ; ses deux volumes prennent son nom
$folder = "$env:USERPROFILE\Orkeon"                          # votre dossier : celui de l'étape 2 d'Installer
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

docker run -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop
```

Sous Linux :

```bash
name="my-orkeon-workshop"                                    # le conteneur ; ses deux volumes prennent son nom
folder="$HOME/Orkeon"                                        # votre dossier : celui de l'étape 2 d'Installer
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

docker run -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
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

Un conteneur créé sans volume sur `/home/node/.claude` garde l'état de Claude Code —
`~/.claude` et `~/.claude.json` : votre connexion, votre historique et votre mémoire — dans sa propre
couche en écriture, et **un nouveau conteneur n'hérite pas de la couche en écriture de l'ancien**. Après
les étapes 1 à 4, à la place de l'étape 5, créez le nouveau conteneur sans le démarrer, copiez-y l'état,
puis démarrez-le. Sous Windows, dans PowerShell :

```powershell
$name = "my-orkeon-workshop"                                 # le conteneur ; ses deux volumes prennent son nom
$folder = "$env:USERPROFILE\Orkeon"                          # votre dossier : celui de l'étape 2 d'Installer
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

# Créer le nouveau conteneur, sans le démarrer (la ligne du modèle comme au premier démarrage, ou retirée)
docker create -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop

# Copier l'état de Claude Code de l'ancien conteneur vers le nouveau
cmd /c "docker cp ${name}-old:/home/node/.claude - | docker cp - ${name}:/home/node/"
cmd /c "docker cp ${name}-old:/home/node/.claude.json - | docker cp - ${name}:/home/node/.claude/"

# Le démarrer
docker start -ai $name
```

Sous Linux :

```bash
name="my-orkeon-workshop"                                    # le conteneur ; ses deux volumes prennent son nom
folder="$HOME/Orkeon"                                        # votre dossier : celui de l'étape 2 d'Installer
docker volume create "${name}-claude"
docker volume create "${name}-worktrees"

# Créer le nouveau conteneur, sans le démarrer (la ligne du modèle comme au premier démarrage, ou retirée)
docker create -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e DOCKER_MODE=socket orkeon-workshop

# Copier l'état de Claude Code de l'ancien conteneur vers le nouveau
docker cp "${name}-old:/home/node/.claude" - | docker cp - "${name}:/home/node/"
docker cp "${name}-old:/home/node/.claude.json" - | docker cp - "${name}:/home/node/.claude/"

# Le démarrer
docker start -ai "$name"
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

### Un volume Claude Code par conteneur

Le volume monté sur `/home/node/.claude` garde l'état de Claude Code — votre connexion, vos réglages, l'historique, les
transcriptions et la mémoire — d'un conteneur à son remplaçant. Il appartient à **un** conteneur : Claude Code range
l'historique et la mémoire d'un projet sous son chemin, et chaque conteneur monte son dossier sur `/workspace` ; deux
conteneurs qui partagent le volume mêlent donc l'historique et la mémoire de leurs projets, et deux d'entre eux ouverts
en même temps écrivent les mêmes fichiers. Les commandes de la page [Installer](../getting-started/install.md) et de
l'étape 5 le nomment d'après le conteneur, `"${name}-claude"` : un par conteneur. Un conteneur créé avant elles peut
en partager un : les commandes précédentes écrivaient `-v my-orkeon-workshop-claude:…` quel que soit le nom du
conteneur, si bien qu'un deuxième conteneur fait avec elles partage le volume du premier.

Pour donner son propre volume à un conteneur qui en partage un, en gardant ce qu'il contient : arrêtez chaque
conteneur qui monte le volume partagé, créez le nouveau, copiez-y l'état avec un conteneur jetable, puis recréez le
conteneur dessus. En PowerShell, pour un conteneur `orkeon-dev` :

```powershell
docker stop orkeon-dev
```

```powershell
docker volume create orkeon-dev-claude
```

```powershell
docker run --rm --user root --entrypoint sh -v my-orkeon-workshop-claude:/from:ro -v orkeon-dev-claude:/to orkeon-workshop -c "cp -a /from/. /to/"
```

Puis les étapes 2 et 4 à 7 de [Migrer un conteneur vers une nouvelle image](#migrer-un-conteneur-vers-une-nouvelle-image),
avec `orkeon-dev` à la place de `my-orkeon-workshop` : l'étape 2 donne le dossier de l'atelier dont l'étape 5 a besoin ;
l'ancien conteneur est mis de côté ; le nouveau est créé avec `$name = "orkeon-dev"`, dont le `"${name}-claude"` est
exactement `orkeon-dev-claude`, le volume qui vient d'être rempli, à la place du volume partagé ; il est vérifié ;
l'ancien est supprimé. La copie emporte tout ce que contenait le volume partagé, projets des autres conteneurs compris :
ils étaient tous sous le même `/workspace`, impossible de les séparer. Pour repartir de zéro, sautez la copie — le
conteneur vous demande alors de vous connecter une fois. Le volume partagé reste tel quel pour les autres conteneurs ;
`docker volume rm` quand plus aucun ne s'en sert.

## VS Code

Avec la configuration VS Code de l'atelier ([L'atelier dans VS Code](../getting-started/vs-code.md)),
téléchargez la nouvelle image — les trois commandes de l'étape 3 ci-dessus — puis lancez **Dev Containers:
Rebuild Container** depuis la palette de commandes (`Ctrl+Shift+P`) : le conteneur est recréé sur l'image
`orkeon-workshop` actuelle. L'état de Claude Code vit dans un volume et survit à l'opération.

Suite : [Options et variables du conteneur](../reference/configuration.md).
