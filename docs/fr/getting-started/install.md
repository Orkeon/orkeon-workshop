# Installer

*[English](../../getting-started/install.md) · Français*

Cette page vous mène de zéro jusqu'à Claude Code ouvert dans le dossier de votre rôle — un atelier, ou
une copie de travail git. Aucune programmation n'est nécessaire : vous copiez quelques commandes dans un
terminal. Comptez 30 à 60 minutes, dont l'essentiel en téléchargements.

> Vous préférez un accompagnement pas à pas ? Collez le prompt de la page [Découvrir avec Claude](../discover-with-claude.md)
> dans une conversation avec Claude, puis dites *« aide-moi à l'installer »*.

## Ce qu'il vous faut

| | |
|---|---|
| Un ordinateur | Windows 10/11 ou Linux, sur un processeur x86-64. macOS n'est pas testé (l'image est construite pour `linux/amd64` uniquement). |
| Docker | [Docker Desktop](https://docs.docker.com/desktop/) sous Windows, avec le moteur WSL 2 (**WSL 2 based engine**, dans Settings → General) ; Docker Engine sous Linux. |
| De l'espace disque | environ 20 Go pour l'image, plus 5 Go pour `qwen3:8b`, le modèle local que la commande ci-dessous télécharge. |
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

## 2. Choisir le dossier

Le dossier que vous montez sur `/workspace`, et le profil de l'étape 3, dépendent de votre rôle
([Une image, un rôle à la fois](../../../README.fr.md#une-image-un-rôle-à-la-fois)) :

| Vous | Ce que vous montez sur `/workspace` | Profil (étape 3) |
|---|---|---|
| construisez des équipes Orkeon | votre **atelier** | `user` |
| signalez une panne, validez un correctif | votre atelier aussi : la reproduction est une équipe | `contrib` |
| développez, publiez ou documentez Orkeon, préparez une pull request | une **copie de travail git d'Orkeon** | `dev`, `release`, `docs` ou `contrib` |
| maintenez Orkeon Workshop lui-même | une **copie de travail de ce dépôt** | `dev`, `docs` ou `all` |

Les commandes ci-dessous gardent le dossier dans une variable, `$folder` sous Windows et `folder` sous
Linux : renseignez-la une fois avec le bloc de votre ligne, et la commande de démarrage de l'étape 3
l'utilise.

**Un atelier** est un dossier de votre ordinateur où vivent vos équipes. Son nom est libre. Si vous avez
déjà des équipes Orkeon, le dossier qui les contient, avec son sous-dossier `teams\`, est votre atelier —
sous Windows, en général `%USERPROFILE%\Orkeon`, le dossier que lit Orkeon Studio par défaut ; rien à
créer, le premier démarrage déploie le harnais à côté de vos équipes sans y toucher. Si vous partez de
zéro, un dossier vide où vous voulez : sous Windows, `%USERPROFILE%\Orkeon` est le choix le plus simple,
puisqu'Orkeon Studio liste les équipes de ce dossier sans aucun réglage ; tout autre dossier convient
aussi, une fois son sous-dossier `teams` indiqué à Studio
([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)).

```powershell
# Windows (PowerShell)
$folder = "$env:USERPROFILE\Orkeon"                          # votre atelier, existant ou nouveau
New-Item -ItemType Directory -Force $folder | Out-Null       # ne le crée que s'il n'existe pas
```

```bash
# Linux
folder="$HOME/Orkeon"                                        # votre atelier, existant ou nouveau
mkdir -p "$folder"                                           # ne le crée que s'il n'existe pas
```

**Une copie de travail git d'Orkeon** est clonée d'abord — ne la créez jamais vide : un dossier vide est
pris pour un nouvel atelier.

```powershell
# Windows (PowerShell)
git clone https://github.com/Orkeon/orkeon.git "$env:USERPROFILE\src\orkeon"
$folder = "$env:USERPROFILE\src\orkeon"
```

```bash
# Linux
git clone https://github.com/Orkeon/orkeon.git "$HOME/src/orkeon"
folder="$HOME/src/orkeon"
```

**Une copie de travail de ce dépôt**, de la même façon :

```powershell
# Windows (PowerShell)
git clone https://github.com/Orkeon/orkeon-workshop.git "$env:USERPROFILE\src\orkeon-workshop"
$folder = "$env:USERPROFILE\src\orkeon-workshop"
```

```bash
# Linux
git clone https://github.com/Orkeon/orkeon-workshop.git "$HOME/src/orkeon-workshop"
folder="$HOME/src/orkeon-workshop"
```

Sous Linux, le conteneur écrit sous l'utilisateur `node` (uid 1000) : si `id -u` affiche un autre
nombre, donnez aussi à cet uid le droit d'écrire dans le dossier, par exemple
`sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX "$folder"`.

Un dossier qui n'est ni vide ni un dossier d'équipes est refusé au premier démarrage, pour que rien ne soit
déployé au mauvais endroit ([Dépannage](../reference/troubleshooting.md#latelier)) — sauf s'il s'agit d'une
copie de travail git démarrée avec un profil fait pour elle (étape 3) : le harnais se pose alors dans son
`.claude/`, listé dans `.git/info/exclude`, et jamais dans un fichier suivi
([Dans une copie de travail](../reference/harness.md#dans-une-copie-de-travail)).

## 3. Démarrer le conteneur

Sous Windows, dans PowerShell (l'accent grave `` ` `` prolonge la commande sur la ligne suivante ;
`${folder}` est le dossier de l'étape 2, `<profil>` le profil de sa table, et `$name` le nom du conteneur,
que prennent ses deux volumes) :

```powershell
$name = "my-orkeon-workshop"                                 # le conteneur ; ses deux volumes prennent son nom
foreach ($v in "${name}-claude", "${name}-worktrees") { docker volume inspect $v *> $null; if ($LASTEXITCODE -ne 0) { docker volume create $v } }

docker run -it --init --name $name --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees `
  -v "${folder}:/workspace" `
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b `
  -e HARNESS_PROFILE=<profil> -e DOCKER_MODE=socket orkeon-workshop
```

Sous Linux :

```bash
name="my-orkeon-workshop"                                    # le conteneur ; ses deux volumes prennent son nom
for v in "${name}-claude" "${name}-worktrees"; do docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v"; done

docker run -it --init --name "$name" --gpus=all \
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway \
  -v /var/run/docker.sock:/var/run/docker-host.sock \
  -v cc-ollama:/home/node/.ollama/models \
  -v "${name}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude \
  -v "${name}-worktrees:/worktrees" -e HARNESS_WORKTREE_ROOT=/worktrees \
  -v "$folder:/workspace" \
  -e OLLAMA_DEFAULT_MODEL=qwen3:8b \
  -e HARNESS_PROFILE=<profil> -e DOCKER_MODE=socket orkeon-workshop
```

**Le profil** est celui de votre ligne à l'étape 2 — `user`, `contrib`, `dev`, `release`, `docs` ou `all` :
la dernière ligne devient par exemple `-e HARNESS_PROFILE=dev -e DOCKER_MODE=socket orkeon-workshop`. C'est
le premier profil du dossier : un dossier qui en a déjà un le garde, et `/workshop-profile` le change plus
tard, dans Claude Code.

> **Pas de carte graphique NVIDIA ?** Retirez `--gpus=all`, sinon le conteneur ne démarrera pas.
>
> **Le démarrage a échoué sur une erreur GPU** (`could not select device driver`, `no adapters were
> found`…) ? Le conteneur a souvent été créé quand même, et `docker start` échouerait de la même façon.
> Supprimez-le avec `docker rm my-orkeon-workshop`, puis relancez la commande, avec le GPU configuré ou
> sans `--gpus=all` — [l'option `--gpus=all`](../reference/troubleshooting.md#loption---gpusall) passe
> chaque erreur en revue.

Le rôle de chaque partie :

| Partie | Pourquoi |
|---|---|
| `--name $name` | le nom de votre conteneur, pour le rouvrir plus tard ; ses deux volumes ci-dessous le suivent. Un deuxième conteneur — un autre dossier — prend un autre nom, et donc ses propres volumes. La ligne avant `docker run` ne crée chaque volume que s'il manque (`docker volume inspect`, sinon `docker volume create`) : relancez-la, rien n'est touché |
| `-v "<your folder>:/workspace"` | **votre atelier, ou votre copie de travail** : dans le conteneur, c'est `/workspace`, et tout ce qui y est écrit arrive dans votre dossier |
| `-e HARNESS_PROFILE=<profil>` | le premier profil du dossier — `user`, `contrib`, `dev`, `release`, `docs` ou `all` (étape 2) ; un dossier qui en a déjà un le garde, et `user` est le défaut quand l'option est omise ([Profils et packs](../reference/harness.md#profils-et-packs)) |
| `-v cc-ollama:/home/node/.ollama/models` | un volume Docker pour les modèles locaux : téléchargés une fois, conservés quand le conteneur est remplacé |
| `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` | le modèle local sur lequel tournent vos équipes, téléchargé en arrière-plan au premier démarrage (environ 5 Go) et inscrit dans les réglages d'Orkeon ; retirez la ligne pour n'en télécharger aucun — vos équipes ont alors besoin d'un modèle avant leur première exécution ([Modèles](../guides/models.md)) |
| `-v "${name}-claude:/home/node/.claude"`, `-e CLAUDE_CONFIG_DIR=…` | un volume pour l'état de Claude Code — votre connexion, votre historique et votre mémoire — afin qu'un nouveau conteneur, après une mise à jour de l'image, le conserve ([Mettre à jour](../guides/updating.md)). **Un par conteneur, nommé d'après lui** : chaque conteneur monte son dossier sur `/workspace`, donc deux conteneurs sur un même volume mêleraient l'historique et la mémoire de leurs projets. Avec le nom par défaut, c'est `my-orkeon-workshop-claude`, le volume des commandes précédentes : un conteneur existant le garde ([Un volume Claude Code par conteneur](../guides/updating.md#un-volume-claude-code-par-conteneur)) |
| `-v "${name}-worktrees:/worktrees"`, `-e HARNESS_WORKTREE_ROOT=/worktrees` | les worktrees de `/dev-batches` sur le disque de Docker plutôt que dans votre dossier : sur un dossier Windows, leurs builds vont deux fois plus vite ; votre dossier est inchangé, et rien d'autre ne change sans lui ([Les worktrees sur un volume](../guides/docker-modes.md#avancé--les-worktrees-sur-un-volume)) |
| `--gpus=all` | permet aux modèles locaux d'utiliser votre GPU NVIDIA |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | nécessaires au pare-feu facultatif, qu'un conteneur lancé avec `docker run` ne démarre pas de lui-même : le `postStartCommand` de VS Code le lance, ou vous ([Pare-feu](../reference/configuration.md#pare-feu)) |
| le socket Docker, `-e DOCKER_MODE=socket`, `--add-host` | Docker depuis l'intérieur du conteneur, pour la pile qualité SonarQube — les équipes n'en ont pas besoin ([Modes Docker](../guides/docker-modes.md)) |

Toutes les options et variables sont décrites dans [Options et variables du conteneur](../reference/configuration.md).

## 4. Ce qui se passe au premier démarrage

Le conteneur se prépare, ce qui prend une ou deux minutes la première fois :

- il installe Claude Code (l'image publiée ne le contient pas : c'est un logiciel d'Anthropic) ;
- il déploie le harnais dans votre dossier — vous verrez des lignes comme
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)` ;
- il démarre le serveur de modèles locaux (Ollama) et télécharge le modèle que la commande nomme, `qwen3:8b`
  (environ 5 Go), **en arrière-plan** : vous pouvez travailler pendant ce temps — rien n'est téléchargé si la
  ligne a été retirée.

Il se termine par une invite de commande dans le conteneur, avec cette ligne parmi les messages (son indice
entre parenthèses apparaît dans un atelier dont le dossier `teams/` est encore vide et où aucune langue
n'est posée) :

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? Francais, Deutsch, Espanol...? Once Claude Code is open, type /workshop-language fr (or de, es, pt-BR...) to work in your language, then /orkeon-tour for a guided tour)
```

Un atelier contient maintenant `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`, `settings/` et
quelques autres : [L'atelier](../concepts/workshop.md) les explique un par un. Une copie de travail reçoit
le harnais de son profil dans `.claude/` et rien d'autre — ni `CLAUDE.md`, ni `teams/` —, la ligne de
résumé `[harness]` se termine par le profil et ses packs, par exemple
`profile dev in a source space (core source dev quality usage)`, et la dernière ligne est
`[entrypoint] Checkout: /workspace — profile dev — open it with: workshop` : ni visite guidée ni conseil de
langue là. Une copie de travail montée depuis Windows est précédée d'une ligne de plus, `[harness] git: /workspace
is owned by another user (a bind mount): added to safe.directory for node.`, qui fait accepter le dossier par git
([Dépannage](../reference/troubleshooting.md#latelier)).

## 5. Vérifier que tout fonctionne

```bash
orkeon-bench doctor
```

```text
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.5.src.20261018.ge258730
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.5.src.20261018.ge258730
PASS  orkeon tool catalogue           94 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
PASS  Ollama reachable                http://127.0.0.1:11434/api/tags
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
PASS  sandboxes left by a killed run  none
Result: OK
```

Dans une copie de travail, les deux vérifications qui concernent l'atelier — `workshop layout`, `stray
settings files` — ne s'appliquent pas ; lisez les autres. Un `WARN` n'est pas une erreur : `Ollama reachable` affiche par exemple un avertissement tant que le
serveur de modèles démarre encore, et `orkeon CLI on PATH` en affiche un quand l'Orkeon de l'image est un
autre commit que celui sur lequel les documents de référence ont été vérifiés — une image construite par
vos soins depuis le dernier commit de la branche `main` d'Orkeon, ou après `orkeon-update` ; l'image
publiée porte le commit vérifié. Les `FAIL` sont expliqués dans
[Dépannage](../reference/troubleshooting.md).

## 6. Ouvrir Claude Code dans l'atelier ou la copie de travail

```bash
workshop
```

La première fois, Claude Code vous demande de vous connecter : il affiche un lien — ouvrez-le dans votre
navigateur, connectez-vous, puis collez dans le terminal le code qui vous est donné. Il vous demande aussi,
une seule fois, d'accepter son mode sans permission, dans lequel `workshop` le lance : lisez
l'avertissement et choisissez d'accepter — le choix sélectionné au départ est celui qui quitte.

Dans une copie de travail, les deux commandes ci-dessous n'existent pas : Claude suit la langue de vos
messages, et votre étape suivante est la page de votre rôle dans
[les workflows](../workflows/overview.md#par-où-commencer-).

### Votre langue

Les commandes sont en anglais ; votre atelier n'a pas à l'être. Avant toute chose, tapez :

```text
/workshop-language fr
```

— `fr`, `de`, `es`, `pt-BR`…, ou le nom de la langue. Dès lors, Claude converse avec vous dans cette
langue, même quand vous ne tapez que des commandes, et y rédige les documents qui décrivent vos équipes :
le besoin, les critères, le plan de test, la conception, les décisions. Ce que lisent les scripts reste en
anglais — les titres des documents, les identifiants. L'équipe elle-même est une autre question : sa
définition, et la langue dans laquelle ses agents écrivent leurs résultats, se décident pour chaque
équipe, dans son besoin. Vous ne tapez la commande qu'une fois : l'atelier s'en souvient, à chaque
session. `/workshop-language` seul affiche la langue en cours, et `/workshop-language default` revient
en arrière. Sans ce réglage, Claude vous répond quand même dans la langue de vos messages, et écrit ses
fichiers en anglais ([en savoir plus](../concepts/process.md)).

### La visite guidée

Tapez ensuite :

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

Dans le conteneur, `/exit` quitte Claude Code et vous rend son terminal ; `workshop` rouvre Claude Code.
Quand Claude vous demande de taper une commande vous-même, il dit dans lequel de ces endroits — Claude Code,
le terminal du conteneur, ou un terminal de votre ordinateur ([FAQ](../faq.md)). Une clé pour un modèle
distant se donne avec `workshop --secret <NOM>`, qui demande la valeur sans l'afficher
([Modèles](../guides/models.md#comment-une-clé-arrive-dans-le-conteneur)). Taper `exit` dans le premier
terminal arrête le conteneur ; votre dossier et le volume des modèles sont conservés. Pour
installer plus tard une image plus récente, voir [Mettre à jour](../guides/updating.md).

## Autres façons de démarrer

- **VS Code** : ouvrez le dossier de l'atelier dans VS Code et lancez *Reopen in Container* —
  [L'atelier dans VS Code](./vs-code.md).
- **Construire l'image vous-même** au lieu de la télécharger : `docker build -t orkeon-workshop .devcontainer`
  depuis un clone du dépôt — [Construire l'image](../../../.devcontainer/README.md) (en anglais).

Suite : [Votre première équipe](./first-team.md).
