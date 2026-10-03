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
docker run -it --init --name my-orkeon-workshop --cap-add=NET_ADMIN --cap-add=NET_RAW `
  --add-host=host.docker.internal:host-gateway --gpus=all `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
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
docker run -it --init --privileged --gpus=all --name my-orkeon-workshop \
  -v orkeon-docker:/var/lib/docker \
  -v cc-ollama:/home/node/.ollama/models \
  -v my-orkeon-workshop-claude:/home/node/.claude -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "$HOME/Orkeon:/workspace" \
  -e DOCKER_MODE=dind orkeon-workshop
```

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
(en anglais).

## Dans VS Code

Les trois configurations VS Code du dépôt correspondent à ces trois modes — *Orkeon Workshop* (sans
Docker), *Docker-in-Docker (DinD)* et *Host Socket (DooD)* — et servent à travailler sur l'image elle-même ;
les deux dernières mettent Docker en place à chaque démarrage (`init-docker.sh`), puis SonarQube. La
configuration propre à l'atelier n'a pas accès à Docker ([L'atelier dans VS Code](../getting-started/vs-code.md)) :
pour la pile qualité, utilisez un conteneur lancé avec `docker run` en mode socket de l'hôte.

Suite : [Mettre à jour](./updating.md).
