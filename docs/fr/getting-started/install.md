# Installer

*[English](../../getting-started/install.md) · Français*

Cette page vous mène de zéro jusqu'à Claude Code ouvert dans votre atelier. Inutile de savoir programmer
ou de connaître Docker : vous installez un programme, vous collez une ligne et vous répondez à une
question. Comptez 30 à 60 minutes, dont l'essentiel en téléchargements.

Elle suit le cas le plus simple : un atelier, sur le dossier que lit Orkeon Studio. Un dossier à vous, un
second atelier, pas de carte graphique, pas de modèle local, une copie de travail git sur laquelle
travailler — la même ligne prend des options : [Les options du script](#les-options-du-script).

> Vous préférez un accompagnement pas à pas ? Collez le prompt de la page [Découvrir avec Claude](../discover-with-claude.md)
> dans une conversation avec Claude, puis dites *« aide-moi à l'installer »*.

## Avant de commencer

### Trois endroits où taper

Les pages de cette documentation disent toujours où va une commande. Il y a trois endroits :

| Endroit | Ce que c'est | Comment l'ouvrir |
|---|---|---|
| **Un terminal de votre ordinateur** | une fenêtre où vous tapez des commandes pour votre ordinateur : **PowerShell** sous Windows, le **Terminal** sous Linux | Windows : menu Démarrer, tapez `PowerShell`, Entrée. Linux : l'application *Terminal* |
| **Le terminal du conteneur** | la même fenêtre, une fois l'atelier démarré dedans : les messages commencent par `[entrypoint]` ou `[harness]`, et les commandes que vous tapez s'exécutent désormais dans l'atelier | il s'ouvre de lui-même à la fin de l'étape 1 |
| **Claude Code** | la conversation avec Claude : vous tapez des messages, et des commandes qui commencent par `/` | tapez `workshop` dans le terminal du conteneur ; `/exit` le quitte |

Pour coller dans un terminal : clic droit, ou `Ctrl+V` (PowerShell) / `Ctrl+Maj+V` (Linux). Puis Entrée.

### Les mots que vous croiserez

- **L'atelier** — un dossier de votre ordinateur où vivent vos équipes (`Orkeon` dans votre dossier
  utilisateur, sauf si vous en choisissez un autre). Tout ce que Claude écrit pour vous y arrive : rien
  n'est jamais perdu.
- **Docker** — le programme qui fait tourner l'atelier dans sa propre boîte fermée, sans rien installer
  d'autre sur votre ordinateur.
- **L'image** — ce que Docker télécharge une fois : la boîte avec tout ce qu'il faut dedans (environ 19 Go).
- **Le conteneur** — la boîte qui tourne sur votre ordinateur, faite à partir de l'image. Son nom est
  `my-orkeon-workshop`.
- **Un volume** — un espace de stockage que Docker garde pour le conteneur : votre connexion à Claude et
  les modèles locaux y restent quand le conteneur est remplacé.

### Ce qu'il vous faut

| | |
|---|---|
| Un ordinateur | Windows 10/11 ou Linux, sur un processeur x86-64 (Intel ou AMD). macOS n'est pas testé. |
| De l'espace disque | environ 25 Go libres : 19 Go pour l'image, 5 Go pour le modèle local. |
| Un compte Claude | un compte qui donne accès à Claude Code — voir [la documentation de Claude Code](https://code.claude.com/docs/en/overview). |
| Une carte graphique (facultative) | une carte graphique NVIDIA rend les modèles locaux rapides. Sans elle, ils tournent sur le processeur, plus lentement. Rien à faire dans un cas comme dans l'autre : l'étape 1 le détecte seule. |

### Installer Docker

**Sous Windows** :

1. Téléchargez **Docker Desktop for Windows** depuis
   [docs.docker.com](https://docs.docker.com/desktop/setup/install/windows-install/) et lancez
   l'installateur.
2. Laissez cochée l'option **Use WSL 2 instead of Hyper-V**, si elle est proposée. WSL 2 est la partie de
   Windows qui lui permet de faire tourner des programmes Linux.
3. Redémarrez l'ordinateur quand l'installateur le demande.
4. Ouvrez **Docker Desktop** depuis le menu Démarrer. Acceptez ses conditions ; vous pouvez passer la
   connexion à Docker. Attendez que sa fenêtre affiche **Engine running** (en bas à gauche).

**Sous Linux** : installez Docker Engine pour votre distribution
([docs.docker.com](https://docs.docker.com/engine/install/)), puis autorisez votre utilisateur à s'en
servir : `sudo usermod -aG docker $USER`, et fermez puis rouvrez votre session. Avec une carte graphique
NVIDIA, installez aussi le
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html).

**Vérifiez** : dans un terminal de votre ordinateur, tapez

```powershell
docker version
```

La réponse a deux parties, `Client:` et `Server:`. **Pas de partie `Server:`**, ou une erreur ? Sous
Windows, Docker Desktop n'est pas encore démarré, ou démarre encore ; sous Linux, Docker ne tourne pas.
Quand Docker Desktop se plaint de WSL ou de la virtualisation, voir
[Dépannage](../reference/troubleshooting.md#installer-et-démarrer).

## 1. Démarrer l'atelier

Dans un terminal de votre ordinateur, collez cette ligne et appuyez sur Entrée.

Sous **Windows**, dans PowerShell :

```powershell
irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1 | iex
```

Sous **Linux** :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop
```

La ligne télécharge un petit script et l'exécute. Vous pouvez
[lire le script](https://github.com/Orkeon/orkeon-workshop/tree/main/install) d'abord. Il vous pose une
question (en anglais) :

```text
[workshop] The folder of your workshop, where your teams live [C:\Users\you\Orkeon] (Enter keeps it):
```

Appuyez sur **Entrée** pour garder le dossier proposé, ou tapez-en un autre. Si vous avez déjà des
équipes Orkeon, donnez le dossier qui contient leur sous-dossier `teams` ; sous Windows, Orkeon Studio lit
`C:\Users\<vous>\Orkeon` par défaut ([L'atelier](../concepts/workshop.md#orkeon-studio-le-voit)). Ensuite,
il travaille seul et dit ce qu'il fait :

```text
[workshop] Creating the folder C:\Users\you\Orkeon
[workshop] Downloading the image (about 19 GB the first time: it takes a while)...
[workshop] NVIDIA GPU found: the local models will use it.
[workshop] Creating my-orkeon-workshop on C:\Users\you\Orkeon (profile user). The first start takes a minute or two.
```

— ou `No usable NVIDIA GPU: the local models will run on the processor, more slowly.` (pas de GPU NVIDIA
utilisable : les modèles locaux tourneront sur le processeur), qui n'est pas une erreur. Le
téléchargement est la partie longue. Quand le script s'arrête avant la fin, sa dernière ligne dit
pourquoi et quoi faire, par exemple `Docker does not answer. Open Docker Desktop (Start menu), wait until
it says 'Engine running', then type this line again.` (Docker ne répond pas : ouvrez Docker Desktop,
attendez *Engine running*, puis retapez la ligne).

Ce que fait le script, dans l'ordre : il vérifie que Docker répond, crée le dossier s'il n'existe pas,
télécharge l'image, essaie la carte graphique, puis crée le conteneur `my-orkeon-workshop` avec la
commande de [Démarrer à la main](#démarrer-à-la-main). Un dossier qui contient déjà d'autres fichiers — un
projet — est refusé, pour que rien n'arrive au mauvais endroit ; un dossier d'équipes versionné avec git
est un atelier comme un autre ([ce qui fait d'un dossier un atelier](../concepts/workshop.md#dans-un-atelier-ou-dans-une-copie-de-travail-git)).

## 2. Ce qui se passe au premier démarrage

La même fenêtre est devenue **le terminal du conteneur**. Le conteneur se prépare, ce qui prend une ou
deux minutes la première fois :

- il installe Claude Code (l'image publiée ne le contient pas : c'est un logiciel d'Anthropic) ;
- il pose le harnais — les skills et les règles avec lesquels Claude travaille — dans votre dossier, à
  côté de vos équipes, sans y toucher. Vous verrez des lignes comme
  `[harness] synchronised into /workspace: … added, 0 updated, 0 removed, … seeded, 0 saved (first deployment)`.
  `/workspace` est le nom de votre dossier dans le conteneur ;
- il démarre le serveur de modèles locaux (Ollama) et télécharge le modèle `qwen3:8b` (environ 5 Go)
  **en arrière-plan** : vous pouvez travailler pendant ce temps.

Il se termine avec cette ligne parmi les messages (la partie entre parenthèses apparaît dans un nouvel
atelier) :

```text
[entrypoint] Workshop: /workspace — open it with: workshop (new here? Francais, Deutsch, Espanol...? Once Claude Code is open, type /workshop-language fr (or de, es, pt-BR...) to work in your language, then /orkeon-tour for a guided tour)
```

Votre dossier contient maintenant `CLAUDE.md`, `.claude/`, `teams/`, `workbooks/`, `tests/`, `settings/`
et quelques autres : [L'atelier](../concepts/workshop.md) les explique un par un.

## 3. Vérifier que tout fonctionne

Dans le terminal du conteneur, tapez :

```bash
orkeon-bench doctor
```

```text
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.5.src.20261020.gacd59d6
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.5.src.20261020.gacd59d6
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

C'est la dernière ligne qui compte : `Result: OK`. Un `WARN` n'est pas une erreur : `Ollama reachable`
affiche par exemple un avertissement tant que le serveur de modèles démarre encore — retapez la commande
une minute plus tard. Les `FAIL` sont expliqués dans [Dépannage](../reference/troubleshooting.md).

## 4. Ouvrir Claude Code

Dans le terminal du conteneur, tapez :

```bash
workshop
```

La première fois, Claude Code vous demande de vous connecter : il affiche un lien. Ouvrez-le dans votre
navigateur, connectez-vous, puis collez dans le terminal le code qui vous est donné. Il vous demande aussi,
une seule fois, d'accepter son mode sans permission (*bypass permissions*), dans lequel `workshop` le
lance : lisez l'avertissement et choisissez d'accepter — le choix sélectionné au départ est celui qui
quitte.

### Votre langue

Les commandes sont en anglais ; votre atelier n'a pas à l'être. Avant toute chose, tapez dans Claude
Code :

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

- **Rouvrir l'atelier**, un autre jour : démarrez Docker Desktop, puis collez **la même ligne qu'à
  l'étape 1** dans un terminal de votre ordinateur. Le conteneur existe déjà : le script le redémarre,
  sans question ni téléchargement. Tapez ensuite `workshop`.
- **Un second terminal** dans l'atelier en marche — pour regarder un fichier pendant que Claude
  travaille : la même ligne encore, dans une nouvelle fenêtre de terminal de votre ordinateur.
- **Quitter Claude Code** : `/exit`. Vous revenez au terminal du conteneur ; `workshop` rouvre Claude
  Code.
- **Arrêter l'atelier** : tapez `exit` dans le terminal du conteneur. Votre dossier, votre connexion et
  les modèles sont conservés.
- **Une ligne, un conteneur nommé.** Le script retrouve le conteneur par son nom — `-Name`,
  `my-orkeon-workshop` si vous n'en avez pas donné d'autre —, jamais par le dossier : la même ligne rouvre
  le même conteneur, quel que soit le dossier depuis lequel vous la tapez. Un `-Folder` ou un `-Profile`
  donné avec le nom d'un conteneur qui travaille ailleurs est refusé avec un message, jamais appliqué en
  silence : un autre dossier, c'est un autre `-Name` ([Une ligne, un conteneur nommé](#une-ligne-un-conteneur-nommé)).

La même chose sans le script, dans un terminal de votre ordinateur :

```powershell
docker start -ai my-orkeon-workshop                    # rouvrir le conteneur (puis : workshop)
docker exec -it --user node my-orkeon-workshop zsh     # un second terminal dans le même conteneur
```

Quand Claude vous demande de taper une commande vous-même, il dit dans lequel des trois endroits
([plus haut](#trois-endroits-où-taper)). Une clé pour un modèle distant se donne avec
`workshop --secret <NOM>`, qui demande la valeur sans l'afficher
([Modèles](../guides/models.md#comment-une-clé-arrive-dans-le-conteneur)). Pour installer plus tard une
image plus récente, voir [Mettre à jour](../guides/updating.md) : une ligne aussi.

## Les options du script

La ligne de l'étape 1 lance le script sans option : `irm … | iex` passe le texte du script à PowerShell
tel quel, et rien ne peut se taper après. Pour donner des options, on demande d'abord à PowerShell de faire
une commande de ce texte — une ligne, plus longue, avec les options à la fin :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <nom> -Folder <chemin> -Profile <profil>
```

Sous Linux, la ligne de l'étape 1 prend les options après `start-workshop` :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <nom> --folder <chemin> --profile <profil>
```

| Windows | Linux | Ce qu'elle fait |
|---|---|---|
| `-Folder <chemin>` | `--folder <chemin>` | le dossier de l'atelier — ou de la copie de travail —, monté sur `/workspace`. Demandé quand elle manque, `Orkeon` dans votre dossier utilisateur par défaut |
| `-Name <nom>` | `--name <nom>` | le nom du conteneur, `my-orkeon-workshop` par défaut. **Un nom, un conteneur** : la même ligne le rouvre ; un second dossier prend un second nom |
| `-Profile <nom>` | `--profile <nom>` | le premier profil du dossier : `user` par défaut, pour un dossier d'équipes ; `dev`, `release`, `docs`, `contrib` ou `all` pour une copie de travail git sur laquelle vous travaillez ([Les profils](../reference/profiles.md)) |
| `-Model <nom>` | `--model <nom>` | le modèle local téléchargé au premier démarrage, `qwen3:8b` par défaut ([Modèles](../guides/models.md)) |
| `-NoModel` | `--no-model` | pas de modèle local : rien n'est téléchargé, et vos équipes ont besoin d'un modèle avant leur première exécution |
| `-NoGpu` | `--no-gpu` | ne pas essayer la carte graphique NVIDIA : les modèles locaux tournent sur le processeur |
| `-Update` | `--update` | passer le conteneur à la dernière image ; l'ancien est gardé sous `<nom>-old` jusqu'au nettoyage ([Mettre à jour](../guides/updating.md)) |
| `-CleanUp` | `--clean-up` | supprimer `<nom>-old` et l'image précédente, une fois que le conteneur mis à jour fonctionne |
| `-DryRun` | `--dry-run` | afficher les commandes qui changeraient quelque chose, sans en exécuter aucune |

Une option est lue sur la ligne qui **crée** le conteneur, qui la garde. Les lignes suivantes nomment le
conteneur (`-Name`) et n'ont besoin de rien d'autre : `-Folder` et `-Profile` répétés à l'identique sont
acceptés, changés ils sont refusés ([Une ligne, un conteneur nommé](#une-ligne-un-conteneur-nommé)).

### Recettes

Chaque ligne est complète : copiez-la et remplacez ce qui est entre `<…>`. Windows d'abord, Linux dessous.

**Un second atelier, sur un dossier à moi** — un dossier d'équipes, vide ou contenant déjà `teams/`,
versionné avec git ou non ; le profil reste `user`. Orkeon Studio liste un seul dossier d'équipes : pour y
voir celui-ci, pointez-le sur son sous-dossier `teams` ([Orkeon Studio le voit](../concepts/workshop.md#orkeon-studio-le-voit)).

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <nom> -Folder "D:\Travail\mon-atelier"
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <nom> --folder ~/travail/mon-atelier
```

**Sans carte graphique**, ou sans l'utiliser — les modèles locaux tournent sur le processeur :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -NoGpu
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --no-gpu
```

**Sans modèle local** — rien de téléchargé au-delà de l'image ; un modèle distant, ou `ollama pull` plus tard :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -NoModel
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --no-model
```

**Mettre à jour, puis nettoyer** — la première ligne passe le conteneur à la dernière image et garde
l'ancien sous `my-orkeon-workshop-old` ; une fois que le nouveau fonctionne, la seconde supprime l'ancien.
Un conteneur d'un autre nom ajoute son `-Name` aux deux :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Update
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -CleanUp
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --update
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --clean-up
```

**Voir ce que ferait la ligne, sans rien faire** — les commandes sont affichées précédées d'un `+`, rien
n'est créé, téléchargé ni changé ; le dossier doit tout de même être acceptable :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -DryRun -Name <nom> -Folder "D:\Travail\mon-atelier"
```

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --dry-run --name <nom> --folder ~/travail/mon-atelier
```

### Ce que les ateliers partagent

L'image et le volume `cc-ollama` des modèles locaux sont partagés par tous les conteneurs : un modèle est
téléchargé une fois. Chaque conteneur a son propre dossier, son propre volume de l'état de Claude Code —
`<nom>-claude` : la connexion, l'historique, la mémoire — et son propre volume de worktrees,
`<nom>-worktrees` ([ce que fait chaque partie de la commande](#démarrer-à-la-main)).

### Une ligne, un conteneur nommé

Le script retrouve le conteneur par son `-Name`, jamais par le dossier : la même ligne rouvre le même
conteneur, et un conteneur garde le dossier et le profil de sa création. Taper la ligne avec un autre
`-Folder`, ou un autre `-Profile`, et le nom d'un conteneur existant — en attendant un nouveau conteneur —
est refusé, avec quoi faire :

```text
[workshop] my-orkeon-workshop already works on C:\Users\you\Orkeon, not on D:\Work\other: one line opens one named container, whatever -Folder says.
[workshop] For another folder, give it another name: -Name <other-name> -Folder "D:\Work\other" - or remove this container first: docker rm my-orkeon-workshop (your folder and the volumes are kept).
```

(« `my-orkeon-workshop` travaille déjà sur `C:\Users\you\Orkeon`, pas sur `D:\Work\other` : une ligne ouvre un
conteneur nommé, quoi que dise `-Folder`. Pour un autre dossier, donnez-lui un autre nom — ou supprimez
d'abord ce conteneur : `docker rm my-orkeon-workshop` ; votre dossier et les volumes sont conservés. »)

Le même dossier écrit autrement — `C:/Users/you/Orkeon/`, une autre casse, ou la forme sous laquelle
Docker Desktop l'enregistre — est le même dossier, et la ligne ouvre le conteneur. Le profil est comparé
à celui de la création du conteneur ; `workshop-profile <nom>` dans le conteneur le change, et un
conteneur créé à la main sans profil est ouvert avec une ligne disant que le profil n'a pas été vérifié.

## Pour une copie de travail git

Cette section s'adresse à qui travaille sur un dépôt : pour développer, publier ou documenter Orkeon, ce
projet ou un autre dépôt, le dossier du conteneur est la racine d'une **copie de travail git**, pas un
atelier, et il prend un profil fait pour elle — les profils source ne construisent aucune équipe
([Les profils](../reference/profiles.md)) :

| Vous | Le dossier | Profil |
|---|---|---|
| signalez une panne, validez un correctif | votre atelier : la reproduction est une équipe | `contrib` |
| développez, publiez ou documentez un dépôt, préparez une pull request | la racine de sa **copie de travail git** — Orkeon, ce projet, ou un autre : son pack de dépôt la rejoint quand il en a un | `dev`, `release`, `docs` ou `contrib` |
| maintenez Orkeon Workshop lui-même | une **copie de travail de ce dépôt** | `dev`, `docs` ou `all` ; pour construire l'image : [Construire l'image](../../../.devcontainer/README.md) |

Clonez-la d'abord — ne la créez jamais vide : un dossier vide est pris pour un nouvel atelier. Donnez
ensuite au script le dossier, le profil et un nom à elle, pour qu'elle ait son propre conteneur à côté de
celui de votre atelier. Sous Windows, dans PowerShell :

```powershell
git clone https://github.com/Orkeon/orkeon.git "$env:USERPROFILE\src\orkeon"
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Folder "$env:USERPROFILE\src\orkeon" -Profile dev -Name orkeon-dev
```

Sous Linux :

```bash
git clone https://github.com/Orkeon/orkeon.git "$HOME/src/orkeon"
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --folder "$HOME/src/orkeon" --profile dev --name orkeon-dev
```

Pour ce dépôt, le clone est `https://github.com/Orkeon/orkeon-workshop.git`. Le même script avec le même
`-Name` rouvre ce conteneur plus tard ; les autres options sont [plus haut](#les-options-du-script).
Démarrée en `user` — l'option oubliée —, une copie de travail de ce dépôt se le voit dire, `… is a git
checkout: give it a profile made for one, for instance -Profile dev …`, et la copie de travail de tout
autre projet est refusée comme un dossier d'autres fichiers, avec la même indication
([Dépannage](../reference/troubleshooting.md#installer-et-démarrer)).

Une copie de travail reçoit le harnais de son profil dans `.claude/` et rien d'autre — ni `CLAUDE.md`, ni
`teams/` —, listé dans `.git/info/exclude` et jamais dans un fichier suivi
([Dans une copie de travail](../reference/harness.md#dans-une-copie-de-travail)). La ligne de résumé
`[harness]` se termine par le profil et ses packs, par exemple
`profile dev in a source space (core source dev quality usage)`, et la dernière ligne est
`[entrypoint] Checkout: /workspace — profile dev — open it with: workshop` : ni visite guidée ni conseil
de langue là ; Claude suit la langue de vos messages, et votre étape suivante est la page de votre rôle
dans [les workflows](../workflows/overview.md#par-où-commencer-). Une copie de travail montée depuis
Windows est précédée d'une ligne de plus, `[harness] git: /workspace is owned by another user (a bind
mount): added to safe.directory for node.`, qui fait accepter le dossier par git
([Dépannage](../reference/troubleshooting.md#latelier)). Dans `orkeon-bench doctor`, les deux
vérifications qui concernent l'atelier — `workshop layout`, `stray settings files` — ne s'appliquent pas.
`orkeon CLI on PATH` affiche un avertissement quand l'Orkeon de l'image est un autre commit que celui sur
lequel les documents de référence ont été vérifiés — une image construite par vos soins depuis le dernier
commit de la branche `main` d'Orkeon, ou après `orkeon-update` ; l'image publiée porte le commit vérifié.

## Démarrer à la main

Le script exécute les commandes ci-dessous ; vous pouvez les taper vous-même, pour changer une option que
le script ne propose pas. Elles se tapent dans un terminal de votre ordinateur, dans une même fenêtre de
haut en bas : les variables `$name` et `$folder` (Windows) ou `name` et `folder` (Linux) ne survivent pas
à la fenêtre.

**Récupérer l'image.**

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

La première ligne télécharge l'image (environ 19 Go). La seconde lui donne le nom court
`orkeon-workshop`, qu'utilisent toutes les autres commandes.

**Choisir le dossier** — votre atelier, ou une copie de travail clonée avant
([Pour une copie de travail git](#pour-une-copie-de-travail-git)) :

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

Sous Linux, le conteneur écrit sous l'utilisateur `node` (uid 1000) : si `id -u` affiche un autre
nombre, donnez aussi à cet uid le droit d'écrire dans le dossier, par exemple
`sudo setfacl -R -m u:1000:rwX -m d:u:1000:rwX "$folder"`.

Un dossier qui n'est ni vide ni un dossier d'équipes est refusé au premier démarrage, pour que rien ne soit
déployé au mauvais endroit ([Dépannage](../reference/troubleshooting.md#latelier)) — sauf s'il s'agit d'une
copie de travail git démarrée avec un profil fait pour elle : le harnais se pose alors dans son
`.claude/`, listé dans `.git/info/exclude`, et jamais dans un fichier suivi
([Dans une copie de travail](../reference/harness.md#dans-une-copie-de-travail)). Un dossier d'équipes
versionné avec git, ou un dépôt qui ne contient que son README et sa licence à côté de `.git`, est un
atelier comme un autre ([la règle](../concepts/workshop.md#dans-un-atelier-ou-dans-une-copie-de-travail-git)).

**Démarrer le conteneur.** Sous Windows, dans PowerShell (l'accent grave `` ` `` prolonge la commande sur
la ligne suivante ; `${folder}` est le dossier ci-dessus, `<profil>` le profil — `user` pour un atelier —
et `$name` le nom du conteneur, que prennent ses deux volumes) :

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

**Le profil** est celui de votre ligne — `user`, `contrib`, `dev`, `release`, `docs` ou `all` : la
dernière ligne devient par exemple `-e HARNESS_PROFILE=dev -e DOCKER_MODE=socket orkeon-workshop`. C'est
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
| `-e HARNESS_PROFILE=<profil>` | le premier profil du dossier — `user`, `contrib`, `dev`, `release`, `docs` ou `all` ; un dossier qui en a déjà un le garde, et `user` est le défaut quand l'option est omise ([Profils et packs](../reference/harness.md#profils-et-packs)) |
| `-v cc-ollama:/home/node/.ollama/models` | un volume Docker pour les modèles locaux : téléchargés une fois, conservés quand le conteneur est remplacé |
| `-e OLLAMA_DEFAULT_MODEL=qwen3:8b` | le modèle local sur lequel tournent vos équipes, téléchargé en arrière-plan au premier démarrage (environ 5 Go) et inscrit dans les réglages d'Orkeon ; retirez la ligne pour n'en télécharger aucun — vos équipes ont alors besoin d'un modèle avant leur première exécution ([Modèles](../guides/models.md)) |
| `-v "${name}-claude:/home/node/.claude"`, `-e CLAUDE_CONFIG_DIR=…` | un volume pour l'état de Claude Code — votre connexion, votre historique et votre mémoire — afin qu'un nouveau conteneur, après une mise à jour de l'image, le conserve ([Mettre à jour](../guides/updating.md)). **Un par conteneur, nommé d'après lui** : chaque conteneur monte son dossier sur `/workspace`, donc deux conteneurs sur un même volume mêleraient l'historique et la mémoire de leurs projets. Avec le nom par défaut, c'est `my-orkeon-workshop-claude`, le volume des commandes précédentes : un conteneur existant le garde ([Un volume Claude Code par conteneur](../guides/updating.md#un-volume-claude-code-par-conteneur)) |
| `-v "${name}-worktrees:/worktrees"`, `-e HARNESS_WORKTREE_ROOT=/worktrees` | les worktrees de `/dev-batches` sur le disque de Docker plutôt que dans votre dossier : sur un dossier Windows, leurs builds vont deux fois plus vite ; votre dossier est inchangé, et rien d'autre ne change sans lui ([Les worktrees sur un volume](../guides/docker-modes.md#avancé--les-worktrees-sur-un-volume)) |
| `--gpus=all` | permet aux modèles locaux d'utiliser votre GPU NVIDIA |
| `--cap-add=NET_ADMIN --cap-add=NET_RAW` | nécessaires au pare-feu facultatif, qu'un conteneur lancé avec `docker run` ne démarre pas de lui-même : le `postStartCommand` de VS Code le lance, ou vous ([Pare-feu](../reference/configuration.md#pare-feu)) |
| le socket Docker, `-e DOCKER_MODE=socket`, `--add-host` | Docker depuis l'intérieur du conteneur, pour la pile qualité SonarQube — les équipes n'en ont pas besoin ([Modes Docker](../guides/docker-modes.md)) |

Toutes les options et variables sont décrites dans [Options et variables du conteneur](../reference/configuration.md).

## Autres façons de démarrer

- **VS Code** : ouvrez le dossier de l'atelier dans VS Code et lancez *Reopen in Container* —
  [L'atelier dans VS Code](./vs-code.md).
- **Construire l'image vous-même** au lieu de la télécharger : `docker build -t orkeon-workshop .devcontainer`
  depuis un clone du dépôt — [Construire l'image](../../../.devcontainer/README.md) (en anglais).

Suite : [Votre première équipe](./first-team.md).
