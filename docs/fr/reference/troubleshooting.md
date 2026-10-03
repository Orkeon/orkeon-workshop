# Dépannage

*[English](../../reference/troubleshooting.md) · Français*

Commencez par `orkeon-bench doctor` dans le conteneur : il vérifie la ligne de commande d'Orkeon et son
catalogue d'outils, esbuild, PyYAML, le serveur de modèles locaux et sa limite de requêtes simultanées,
les définitions de types, l'organisation de l'atelier et les fichiers de réglages égarés.

## Obtenir l'image et démarrer

| Problème | Que faire |
|---|---|
| `docker pull` demande une connexion, ou dit que l'image n'existe pas | le paquet n'est pas encore public : construisez l'image vous-même (`docker build -t orkeon-workshop .devcontainer` depuis un clone du dépôt) |
| `could not select device driver "" with capabilities: [[gpu]]` | Docker ne peut pas fournir de GPU au conteneur : retirez `--gpus=all`, ou configurez le GPU ([Modèles](../guides/models.md#utiliser-le-gpu)) |
| `docker: invalid reference format` dans PowerShell | une continuation de ligne est mal faite : chaque ligne, sauf la dernière, doit se terminer par un accent grave `` ` ``, sans rien après |
| `Conflict. The container name "/my-orkeon-workshop" is already in use` | le conteneur existe déjà : relancez-le avec `docker start -ai my-orkeon-workshop`, ou supprimez-le d'abord avec `docker rm my-orkeon-workshop` |
| le conteneur démarre, mais `workshop` affiche `claude: command not found` | le premier démarrage n'a pas pu télécharger Claude Code (pas de réseau) : `workshop` réessaie à chaque appel ; vérifiez la connexion |

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
| Orkeon Studio ne liste pas mon équipe | la liste ne dépend pas du contenu du dossier : l'équipe doit être un dossier de `%USERPROFILE%\Orkeon\teams` — votre atelier est-il bien `%USERPROFILE%\Orkeon` lui-même ? Le nom du dossier de l'équipe ne doit pas commencer par un point, et ce dossier ne doit être ni Caché ni Système ; une équipe archivée se trouve sous « Archives ». Studio relit la liste à l'ouverture de « Mes équipes » (My teams) |
| Studio liste l'équipe mais ne trouve pas de crew, exécute autre chose que prévu, ou le lancement échoue sur `config.yaml (or crew.yaml) not found` | à la racine de l'équipe, un dossier `agents/` ou `tasks/` (y compris le dossier d'un point de montage) ou le trio à plat `crew.yaml` + `agents.yaml` + `tasks.yaml` fait prendre à Studio le dossier de l'équipe pour le crew, un `crew.ork.ts` est exécuté à la place de `crew/`, et tout autre `*.ork.ts` fait demander à Studio quel script exécuter ; un `*.ork.ts` placé à côté d'un crew YAML le masque. `orkeon-studio-check <slug>` indique la cause |
| Studio lance l'équipe sans ses dossiers | Studio n'a pas pu lire `studio-team.json` (un commentaire, une virgule finale, un type incorrect) et l'a ignoré : `orkeon-studio-check <slug>` donne l'erreur d'analyse |
| l'exécution lancée depuis Studio s'arrête sur `mount source directory does not exist` | un dossier de l'équipe manque (un clone tout neuf ne conserve aucun dossier vide) : lancez `orkeon-bench scaffold <team>`, qui recrée les dossiers et leur `.gitkeep` |
| `Crew configuration references unknown tool(s): x` | le nom d'outil n'existe pas dans le catalogue d'Orkeon (`orkeon run --list-tools`), ou c'est un outil en plugin : exécutez l'équipe avec `orkeon-harness-run` ([Outils C#](../guides/csharp-tools.md)) |
| `run.sh: <folder> does not exist (mount point /x)` | un dossier en lecture seule de l'équipe manque : créez-le, ou relancez `orkeon-bench scaffold <team>` |
| `run.sh: no mount set 'x' for this team` | créez `mounts.x/<team>/` dans l'atelier, avec un dossier par point de montage |
| Studio refuse de lancer l'équipe à cause d'un dossier | Studio n'accepte que des dossiers situés dans l'équipe (jamais le dossier de l'équipe lui-même), ou des dossiers déclarés, au caractère près, dans « Réglages › Dossiers autorisés » (Settings › Authorized folders) |
| `orkeon-bench scaffold` : `error: mounts.json: /x is bound to …` | le dossier de ce point de montage fait partie de ceux que les agents de l'équipe ne doivent jamais atteindre (le dossier de l'équipe, `crew/` ou un nom réservé à sa racine ; hors de l'équipe, les dossiers propres à l'atelier, un dossier de réglages que lit Orkeon, un dossier caché du dossier personnel, `/proc`, une autre équipe) : donnez à ce point un dossier bien à lui ([Points de montage](../concepts/mount-points.md#ce-quun-point-de-montage-ne-peut-pas-ouvrir)) |
| `orkeon-bench doctor` : `FAIL stray settings files`, ou un `[harness] WARNING` à propos d'un `appsettings.json` au démarrage | un fichier de réglages se trouve là où Orkeon cherche de lui-même : dans `appsettings/` ou `_shared/` au-dessus des crews, il remplace les réglages de la machine pour chaque exécution qui n'en nomme aucun — donc pour chaque lancement depuis Studio, à moins qu'un fichier ne soit épinglé en mode « Expert » ; dans le `crew/` d'une équipe, de même. Supprimez-le ; les réglages propres à une équipe se trouvent dans `settings/<slug>/appsettings.json` |
| le modèle ou le compte e-mail d'une équipe n'est pas le même dans Studio | Studio ne lit pas `settings/<slug>/` : il exécute l'équipe avec ses propres réglages, ou avec le réglage de modèle que nomme la carte (orthographié exactement comme dans Studio). Pour un lancement qui en a besoin, épinglez ce fichier dans « Exécuter › Options avancées » (Run › Advanced options), en mode « Expert » |
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
