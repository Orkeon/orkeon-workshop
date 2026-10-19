# Modes Docker et SonarQube

*[English](../../guides/docker-modes.md) · Français*

Les équipes Orkeon n'ont pas besoin de Docker dans le conteneur. La pile qualité, si : SonarQube tourne sous
la forme d'un petit ensemble de conteneurs. L'image prend en charge trois configurations.

| Mode | Comment | À choisir quand |
|---|---|---|
| **Sans Docker** | `-e DOCKER_MODE=none` (ni socket, ni `--privileged`) | vous ne faites que construire et exécuter des équipes — la configuration VS Code de l'atelier fonctionne ainsi |
| **Socket de l'hôte** (DooD) | `-v /var/run/docker.sock:/var/run/docker-host.sock -e DOCKER_MODE=socket` | le mode qu'utilisent les commandes de ces pages : léger, il partage les images et le cache de construction de votre ordinateur |
| **Docker-in-Docker** (DinD) | `--privileged -e DOCKER_MODE=dind` | vous voulez une isolation complète vis-à-vis du Docker de votre ordinateur |

Au démarrage, `init-docker.sh` lit `DOCKER_MODE` (`dind` s'il n'est pas défini) pour démarrer un démon
Docker dans le conteneur, brancher celui de votre ordinateur, ou ne rien faire (`none`). Sans
`--privileged`, un mode non défini tente Docker-in-Docker, échoue et le signale dans le journal de
démarrage : passez `-e DOCKER_MODE=none` pour éviter cette tentative.

## Socket de l'hôte

Le conteneur réutilise le démon Docker de votre ordinateur. Pas de `--privileged`, pas de démon imbriqué,
rien qui s'accumule dans un volume ; les conteneurs qu'il démarre sont ses *frères* sur votre
ordinateur, et SonarQube reste joignable à `http://localhost:9000` grâce à un relais.

Sous Windows, cela fonctionne sans astuce de chemin, avec le moteur WSL 2 de Docker Desktop
(**WSL 2 based engine**) : le conteneur tourne dans la machine virtuelle Linux de Docker Desktop, où le
socket `/var/run/docker.sock` existe — c'est lui qui est monté, pas un chemin Windows. Le moteur Hyper-V
n'est pas pris en charge.

```powershell
$name = "my-orkeon-workshop"                                 # le conteneur ; ses deux volumes prennent son nom
foreach ($v in "${name}-claude", "${name}-worktrees") { docker volume inspect $v *> $null; if ($LASTEXITCODE -ne 0) { docker volume create $v } }

docker run -it --init --name $name --cap-add=NET_ADMIN --cap-add=NET_RAW `
  --add-host=host.docker.internal:host-gateway --gpus=all `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e DOCKER_MODE=socket orkeon-workshop
```

Depuis Git Bash sous Windows (et non PowerShell), désactivez la conversion des chemins :
`MSYS_NO_PATHCONV=1 docker run … -v //var/run/docker.sock:/var/run/docker-host.sock …`.

Vérifiez depuis l'intérieur du conteneur :

```bash
docker info           # réussit : il parle au démon de votre ordinateur
docker ps             # affiche les conteneurs de votre ordinateur
echo $DOCKER_MODE     # socket
```

| Problème | Solution |
|---|---|
| `docker info` échoue ; le journal de démarrage indique « the host Docker daemon is not responding » | Docker Desktop n'est pas lancé, ou son intégration WSL est désactivée pour cette distribution : vérifiez les deux |
| `/var/run/docker-host.sock is missing` | le montage n'a pas abouti — sans doute à cause du moteur Hyper-V : passez à WSL 2, ou utilisez DinD |
| SonarQube injoignable à `localhost:9000` | le relais réessaie toutes les 2 s une fois SonarQube démarré ; voir `/var/log/sonar-forward.log` et `getent hosts host.docker.internal` |

## Docker-in-Docker

```bash
name="my-orkeon-workshop"                                    # le conteneur ; ses deux volumes prennent son nom
for v in "${name}-claude" "${name}-worktrees"; do docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v"; done

docker run -it --init --privileged --gpus=all --name "$name" \
  -v orkeon-docker:/var/lib/docker \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$HOME/Orkeon:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e DOCKER_MODE=dind orkeon-workshop
```

Dans les deux commandes, la ligne `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` nomme le modèle local téléchargé au
premier démarrage ; retirez-la pour n'en télécharger aucun ([Modèles](./models.md)).

Un `dockerd` tourne dans le conteneur. Ses images sont rangées dans le volume `orkeon-docker`, monté sur
`/var/lib/docker`, qui les conserve d'un conteneur à l'autre — sans volume à cet endroit, le pilote
overlay2 ne peut pas fonctionner et le démon se rabat sur `vfs`, plus lent et plus gourmand en disque. Son
occupation disque est bornée (overlay2, rotation des journaux, cache de construction plafonné à 10 Go,
nettoyage prudent au démarrage), mais les images que vous y téléchargez ou y construisez font tout de même
grossir ce volume. Le mode socket de l'hôte n'a pas ce volume : nettoyez votre ordinateur avec
`docker system prune`, comme d'habitude.

## SonarQube

L'image contient la pile SonarQube et ses scanners. SonarQube a besoin de Docker (dans l'un ou l'autre
mode) et présente son interface à l'adresse `http://localhost:9000`. Dans un conteneur lancé avec
`docker run`, démarrez la pile dès que `docker info` répond :

```bash
init-sonarqube.sh     # démarre la pile, applique le profil Creedengo, écrit un jeton dans ~/.sonar-token
```

Ce jeton appartient à cette instance locale (`admin`/`admin` tant que vous ne changez pas ce mot de passe,
joignable depuis cette machine uniquement) ; c'est le seul identifiant que l'image écrit sur le disque. La
configuration et l'analyse d'un projet sont décrites dans [SONARQUBE.md](../../../.devcontainer/SONARQUBE.md)
(en anglais). Le skill `/quality-report` (pack `quality`, dans les profils `dev`, `release` et `all`) lance
Sonar quand un serveur répond ([les skills des packs](../reference/harness.md#les-skills-des-packs)).

## Avancé : les worktrees sur un volume

Les commandes de démarrage du [README](../../../README.fr.md#démarrer), d'[Installer](../getting-started/install.md#démarrer-à-la-main)
et de cette page créent ce volume et le montent par défaut : `-v "${name}-worktrees:/worktrees"` avec
`-e HARNESS_WORKTREE_ROOT=/worktrees`, un volume par conteneur, nommé d'après lui (D85). Il compte quand votre
dossier est un dossier Windows (le `-v …:/workspace` des commandes : un montage 9p sous WSL 2) et que vous lancez
`/dev-batches`. Votre dossier reste où il est, partagé avec Windows ; seuls les worktrees des tranches, et leur
cache de paquets (`packages` pour Orkeon), vivent sur le volume, sur le disque propre de Docker. Mesuré sur Orkeon
(V-40) : une construction de la solution deux fois plus rapide, une construction incrémentale d'un projet de test
4,5 fois, un worktree créé 70 fois plus vite, et plus aucune des erreurs de lecture que le montage donne sous
charge. Vérifiez depuis le conteneur : le préflight de `/dev-batches` affiche
`ok    worktree root: /worktrees, a mount of its own`.

Ce que vous cédez : le worktree d'une tranche n'est pas visible depuis Windows avant sa fusion dans votre dossier ;
les worktrees lisent toujours leur historique git dans votre dossier ; le volume grossit d'environ 30 Go par
worktree construit — le harnais retire chacun une fois fusionné, et `docker system df -v` montre la taille du
volume. Supprimer le volume (`docker volume rm <nom>-worktrees`, le conteneur arrêté et supprimé d'abord) efface
les worktrees qui s'y trouvent encore avec leur travail non fusionné, et le cache de paquets, rempli à nouveau à
la tranche suivante.

**Pour s'en passer**, omettez la ligne `-v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees` et
`"${name}-worktrees"` de la ligne qui crée les volumes : rien d'autre ne change, les worktrees restent sous `.claude/worktrees/` dans votre
dossier (D85). Avec `HARNESS_WORKTREE_ROOT` posé mais sans volume, le préflight prévient que les worktrees
mourraient avec le conteneur ; un dossier inutilisable est refusé, jamais remplacé en silence.

**Un conteneur créé avant**, sans les deux options, reçoit le volume en étant recréé comme le dit
[Migrer un conteneur vers une nouvelle image](./updating.md#migrer-un-conteneur-vers-une-nouvelle-image) (étapes 1 à
7, sans l'étape 3 ni, à l'étape 7, `docker rmi orkeon-workshop:previous`, qui demande son étiquette) : la commande
de son étape 5 crée et monte le volume, et votre dossier et son volume Claude Code sont conservés (l'étape 5 dit
quoi faire quand l'étape 2 montre un autre volume Claude Code).

Les trois configurations VS Code du dépôt — `.devcontainer/devcontainer.json`, `.devcontainer/host-socket/` et
`.devcontainer/dind/` — et le `devcontainer.json` de l'atelier ([L'atelier dans VS Code](../getting-started/vs-code.md))
ne le montent pas. Pour l'ajouter, mettez
`"source=orkeon-worktrees-${devcontainerId},target=/worktrees,type=volume"` dans `mounts`, à côté des autres, et
`"HARNESS_WORKTREE_ROOT": "/worktrees"` dans le `containerEnv` existant.

## Dans VS Code

Les trois configurations VS Code du dépôt correspondent à ces trois modes — *Orkeon Workshop* (sans
Docker), *Orkeon Workshop - Docker-in-Docker (DinD)* et *Orkeon Workshop - Host Socket (DooD)* — et servent à
travailler sur l'image elle-même ;
les deux dernières mettent Docker en place à chaque démarrage (`init-docker.sh`), puis SonarQube. La
configuration propre à l'atelier n'a pas accès à Docker ([L'atelier dans VS Code](../getting-started/vs-code.md)) :
pour la pile qualité, utilisez un conteneur lancé avec `docker run` en mode socket de l'hôte.

Suite : [Mettre à jour](./updating.md).
