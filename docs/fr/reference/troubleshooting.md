# Dépannage

*[English](../../reference/troubleshooting.md) · Français*

Commencez par `orkeon-bench doctor` dans le conteneur : il vérifie la ligne de commande d'Orkeon et son
catalogue d'outils, esbuild, PyYAML, le serveur de modèles locaux et sa limite de requêtes simultanées,
les définitions de types, l'organisation de l'atelier et les fichiers de réglages égarés.

## Obtenir l'image et démarrer

| Problème | Que faire |
|---|---|
| `docker pull` demande une connexion, ou dit que l'image n'existe pas | le paquet n'est pas encore public : construisez l'image vous-même (`docker build -t orkeon-workshop .devcontainer` depuis un clone du dépôt) |
| `could not select device driver "" with capabilities: [[gpu]]`, `nvidia-container-cli: initialization error: …` | Docker ne peut pas fournir de GPU au conteneur : voir [l'option `--gpus=all`](#loption---gpusall) ci-dessous — et supprimez le conteneur laissé par le démarrage raté avant de réessayer |
| `docker: invalid reference format` dans PowerShell | une continuation de ligne est mal faite : chaque ligne, sauf la dernière, doit se terminer par un accent grave `` ` ``, sans rien après |
| `Conflict. The container name "/my-orkeon-workshop" is already in use` | le conteneur existe déjà : `docker start -ai my-orkeon-workshop` le rouvre. Si son dernier démarrage a échoué — sur une erreur GPU, par exemple — `docker start` échoue de la même façon, car un conteneur garde les options de sa création : supprimez-le avec `docker rm my-orkeon-workshop`, puis relancez `docker run` |
| le conteneur démarre, mais `workshop` affiche `claude: command not found` | le premier démarrage n'a pas pu télécharger Claude Code (pas de réseau) : `workshop` réessaie à chaque appel ; vérifiez la connexion |

## L'option `--gpus=all`

`--gpus=all` demande à Docker de confier votre GPU NVIDIA au conteneur. Quand Docker ne le peut pas,
`docker run` s'arrête sur l'une des erreurs ci-dessous. **Quelle que soit l'erreur, vérifiez d'abord si le
conteneur a été créé quand même** : Docker le crée avant de le démarrer, et l'échec survient en général au
démarrage.

```bash
docker ps -a --filter name=my-orkeon-workshop
```

Si `my-orkeon-workshop` apparaît, supprimez-le avant toute chose — `docker start` échouerait exactement de
la même façon, car un conteneur garde les options de sa création :

```bash
docker rm my-orkeon-workshop
```

Rien n'est perdu : votre dossier d'atelier et les deux volumes (modèles locaux, état de Claude Code)
survivent à `docker rm`. Relancez ensuite la commande `docker run`, soit avec le GPU configuré comme
l'indique le tableau, soit **sans `--gpus=all`** : les modèles locaux tournent alors sur le processeur,
plus lentement, et tout le reste fonctionne pareil ([Modèles](../guides/models.md#utiliser-le-gpu)). Pour
tester le GPU sans créer le conteneur : `docker run --rm --gpus=all --entrypoint nvidia-smi orkeon-workshop`
affiche le tableau des GPU quand tout va bien, et la même erreur sinon.

| Erreur | Cause | Que faire |
|---|---|---|
| `could not select device driver "" with capabilities: [[gpu]]` | Docker n'a aucun runtime GPU. Linux : le NVIDIA Container Toolkit n'est pas installé, ou pas déclaré à Docker. Windows : Docker Desktop n'utilise pas le moteur basé sur WSL 2 | Linux : installez le [toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), puis `sudo nvidia-ctk runtime configure --runtime=docker` et `sudo systemctl restart docker`. Windows : Settings → General → *Use the WSL 2 based engine*, redémarrez Docker Desktop. Ou retirez `--gpus=all` |
| `nvidia-container-cli: initialization error: WSL environment detected but no adapters were found` (Windows, Docker Desktop ; précédé de `error running prestart hook`) | WSL ne voit aucun GPU NVIDIA : l'ordinateur n'en a pas (une carte AMD ou Intel ne compte pas), le pilote NVIDIA Windows est absent ou trop ancien pour WSL, ou WSL lui-même n'est pas à jour | Dans PowerShell : `nvidia-smi` — s'il échoue, il n'y a pas de GPU NVIDIA utilisable : retirez `--gpus=all`. S'il fonctionne : `wsl --update`, puis `wsl -- nvidia-smi` ; si celui-ci échoue, mettez à jour le pilote NVIDIA *depuis Windows* (jamais dans WSL), redémarrez Docker Desktop et réessayez |
| `nvidia-container-cli: initialization error: nvml error: driver not loaded`, ou `Driver/library version mismatch` (Linux) | le pilote NVIDIA du noyau n'est pas chargé, ou vient d'être mis à jour et l'ancien tourne encore | `nvidia-smi` sur l'hôte doit afficher le tableau des GPU ; après une mise à jour du pilote, redémarrez |
| `Conflict. The container name "/my-orkeon-workshop" is already in use`, juste après l'une des erreurs ci-dessus | le `docker run` raté avait créé le conteneur | `docker rm my-orkeon-workshop`, puis `docker run` à nouveau |
| le conteneur démarre, mais `nvidia-smi: command not found` à l'intérieur, ou `ollama ps` affiche `100% CPU` sur un ordinateur doté d'un GPU NVIDIA | le conteneur a été créé sans `--gpus=all` ; l'option ne s'ajoute pas après coup | recréez-le avec `--gpus=all` ([Mettre à jour](../guides/updating.md#migrer-un-conteneur-vers-une-nouvelle-image)) ; les volumes conservent les modèles et l'état de Claude Code |

## L'atelier

| Problème | Que faire |
|---|---|
| `[harness] /workspace is not an Orkeon workshop … Nothing deployed.` | le dossier monté sur `/workspace` contient autre chose — un projet de code source ? Montez plutôt votre dossier Orkeon, ou lancez une fois `sync-harness.sh --adopt` si ce dossier doit vraiment servir d'atelier |
| `workshop: no harness in /workspace` | même cause : le harnais n'y a pas été déployé |
| mes fichiers dans `.claude/` ont été remplacés | `.claude/` appartient à l'image : votre version précédente est dans `.claude/harness-backup/<stamp>/`. Mettez vos propres réglages dans `.claude/settings.local.json`, et vos ajouts dans `.claude/local/` |
| `orkeon-bench doctor` : `FAIL workshop layout` | `ORKEON_WORKSHOP` désigne un dossier qui n'existe pas, ou l'atelier n'a pas été monté |

## Équipes

| Problème | Que faire |
|---|---|
| Orkeon Studio ne liste pas mon équipe | la liste ne dépend pas du contenu du dossier : l'équipe doit être un dossier du dossier d'équipes de Studio — `%USERPROFILE%\Orkeon\teams`, sauf si un autre dossier a été indiqué à Studio. « Réglages › Studio » (Settings › Studio), carte « Dossier des équipes » (Teams folder), montre le dossier en vigueur et d'où il vient : pour un atelier placé dans un autre dossier, donnez-lui `<workshop>\teams` et redémarrez Studio ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). Le nom du dossier de l'équipe ne doit pas commencer par un point, et ce dossier ne doit être ni Caché ni Système ; une équipe archivée se trouve sous « Archives ». Studio relit la liste à l'ouverture de « Mes équipes » (My teams) |
| Studio liste l'équipe mais ne trouve pas de crew, exécute autre chose que prévu, ou le lancement échoue sur `config.yaml (or crew.yaml) not found` | Studio lit `crew/` en premier, et c'est seulement quand `crew/` ne contient aucun crew qu'il puisse exécuter — il est vide, un `*.ork.ts` s'y trouve à côté d'un crew YAML, ou il contient plusieurs scripts sans `crew.ork.ts` — qu'il se rabat sur la racine de l'équipe : un dossier `agents/` ou `tasks/` qui s'y trouve (y compris le dossier d'un point de montage) ou le trio à plat `crew.yaml` + `agents.yaml` + `tasks.yaml` fait alors prendre à Studio le dossier de l'équipe pour le crew, un `crew.ork.ts` est exécuté, et tout autre `*.ork.ts` fait demander à Studio quel script exécuter. `orkeon-studio-check <slug>` indique la cause |
| Studio lance l'équipe sans ses dossiers | Studio n'a pas pu lire `studio-team.json` (un commentaire, une virgule finale, un type incorrect) et l'a ignoré : `orkeon-studio-check <slug>` donne l'erreur d'analyse |
| Studio refuse le lancement avec `Rien à lire : le dossier de l'équipe « … » (point de montage /x) n'existe pas` (`Nothing to read: the team's folder '…' (mount point /x) does not exist`) | un dossier en lecture seule de l'équipe manque (un clone tout neuf ne conserve aucun dossier vide) : créez-le et placez-y les entrées, ou lancez `orkeon-bench scaffold <team>`, qui recrée les dossiers et leur `.gitkeep`. Un dossier en écriture manquant est créé par Studio au lancement |
| `Crew configuration references unknown tool(s): x` | le nom d'outil n'existe pas dans le catalogue d'Orkeon (`orkeon run --list-tools`), ou c'est un outil en plugin : exécutez l'équipe avec `orkeon-harness-run` ([Outils C#](../guides/csharp-tools.md)) |
| `run.sh: <folder> does not exist (mount point /x)` | un dossier en lecture seule de l'équipe manque : créez-le, ou relancez `orkeon-bench scaffold <team>` |
| `run.sh: no mount set 'x' for this team` | créez `mounts.x/<team>/` dans l'atelier, avec un dossier par point de montage |
| Studio refuse de lancer l'équipe à cause d'un dossier | Studio n'accepte que des dossiers situés dans l'équipe (jamais le dossier de l'équipe lui-même), ou des dossiers déclarés, au caractère près, dans « Réglages › Dossiers autorisés » (Settings › Authorized folders) |
| `orkeon-bench scaffold` : `error: mounts.json: /x is bound to …` | le dossier de ce point de montage fait partie de ceux que les agents de l'équipe ne doivent jamais atteindre (le dossier de l'équipe, `crew/` ou un nom réservé à sa racine ; hors de l'équipe, les dossiers propres à l'atelier, un dossier de réglages que lit Orkeon, un dossier caché du dossier personnel, `/proc`, une autre équipe) : donnez à ce point un dossier bien à lui ([Points de montage](../concepts/mount-points.md#ce-quun-point-de-montage-ne-peut-pas-ouvrir)) |
| `orkeon-bench doctor` : `FAIL stray settings files`, ou un `[harness] WARNING` à propos d'un `appsettings.json` au démarrage | un fichier de réglages se trouve là où Orkeon cherche de lui-même : dans `appsettings/` ou `_shared/` au-dessus des crews, il remplace les réglages de la machine pour chaque exécution qui n'en nomme aucun — dans Studio, le lancement de toute équipe qui n'a pas de fichier de réglages propre, à moins qu'un fichier ne soit épinglé en mode « Expert » ; dans le `crew/` d'une équipe, de même. Supprimez-le ; les réglages propres à une équipe se trouvent dans `settings/<slug>/appsettings.json` |
| le modèle ou le compte e-mail d'une équipe n'est pas le même dans Studio | Studio ne transmet de lui-même `settings/<slug>/appsettings.json` qu'à une équipe du dossier d'équipes qu'il liste — l'écran « Exécuter » (Run) montre alors une ligne « Fichier de réglages de l'équipe » (Team settings file) ; une équipe lancée depuis un dossier choisi à la main s'exécute avec les réglages de Studio. Le réglage de modèle que nomme la carte (`"profile"`, orthographié exactement comme dans Studio) s'applique par-dessus la section `Llm` du fichier, et un fichier épinglé dans « Exécuter › Options avancées » (Run › Advanced options), en mode « Expert », remplace celui de l'équipe |
| `run-gate: remote run refused` | l'exécution solliciterait un modèle distant payant sans accord : c'est voulu — un profil nommé distant dans les réglages compte aussi, même à côté d'un modèle par défaut local, car n'importe quel agent peut le nommer. Utilisez le modèle local ; pour une exécution payante, l'accord est enregistré dans la tentative ouverte une fois que vous avez donné votre oui explicite ([Modèles](../guides/models.md#laccord-pour-les-exécutions-payantes)) — ou lancez l'exécution vous-même, dans un terminal ou avec `!` |
| une écriture est refusée par `guard-phase` | la méthode autorise ce dossier à une autre phase ou à un autre rôle ; le message le précise. Suivez-le plutôt que de le contourner |

## Modèles locaux

| Problème | Que faire |
|---|---|
| `orkeon-bench doctor` : `WARN Ollama reachable … ECONNREFUSED` | le serveur de modèles est en train de démarrer, ou `OLLAMA_MODE=off` ; consultez `/var/log/ollama.log` |
| le modèle n'a jamais été téléchargé | le dossier des modèles n'est pas un volume : démarrez le conteneur avec `-v cc-ollama:/home/node/.ollama/models`, ou définissez `OLLAMA_AUTO_PULL=1` |
| une équipe est très lente | vérifiez où tourne le modèle avec `orkeon-update --check` et `ollama ps` — l'objectif est `100% GPU` ([Modèles](../guides/models.md)) |
| le téléchargement d'un modèle échoue quand le pare-feu est actif | ajoutez les hôtes d'Ollama à `FIREWALL_EXTRA_DOMAINS` ([configuration](./configuration.md#pare-feu)) |

## .NET

| Problème | Que faire |
|---|---|
| une restauration tente nuget.org et échoue | le paquet n'est pas dans le cache du conteneur : ouvrez `api.nuget.org` dans le pare-feu, ou restez sur les paquets qu'utilisent les gabarits |
| une compilation échoue avec `ORKVFS00x` | un outil a utilisé `System.IO` : passez par le système de fichiers virtuel d'Orkeon |
| des sorties de compilation venues de Windows cassent la compilation | `clean-restore.sh <project folder>` |

Le problème persiste ? Demandez à Claude dans l'atelier — Claude peut lire les journaux et les fichiers — ou
ouvrez un ticket (issue) sur le dépôt.
