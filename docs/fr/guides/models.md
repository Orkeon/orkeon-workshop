# Modèles : locaux et distants

*[English](../../guides/models.md) · Français*

Deux sortes de modèles d'IA travaillent dans l'atelier, et ce ne sont pas les mêmes :

| | Quel modèle | Payé par |
|---|---|---|
| **Claude Code**, le bâtisseur | Claude, via votre compte Claude | votre abonnement Claude ou votre compte API |
| **Vos équipes**, quand elles s'exécutent | le modèle des réglages d'Orkeon : un modèle Ollama **local** par défaut, ou un fournisseur **distant** que vous configurez | local : rien d'autre que du temps machine · distant : le fournisseur, au jeton |

Cette page traite du second : le modèle qu'utilisent vos équipes.

## Modèles locaux (Ollama)

L'image fait tourner [Ollama](https://ollama.com) dans le conteneur et configure Orkeon pour l'utiliser :
au premier démarrage, elle écrit `~/.config/Orkeon/appsettings.json` (Ollama sur `http://localhost:11434`,
modèle `qwen3:8b`, 600 secondes par appel, 120 secondes de silence au plus entre deux fragments d'une
réponse en flux, une requête à la fois) et télécharge le modèle en arrière-plan
quand le dossier des modèles est un volume (`-v cc-ollama:/home/node/.ollama/models`).

| Variable | Valeur par défaut | Ce qu'elle fait |
|---|---|---|
| `OLLAMA_MODE` | `local` | `local` : un serveur dans le conteneur · `host` : utiliser l'Ollama de votre ordinateur (un seul serveur et une seule copie du modèle pour tous les conteneurs ; ajoutez `--add-host=host.docker.internal:host-gateway`) · `off` : ne rien démarrer |
| `OLLAMA_DEFAULT_MODEL` | `qwen3:8b` | le modèle téléchargé au premier démarrage et écrit dans les réglages d'Orkeon (environ 5 Go) |
| `OLLAMA_CONTEXT_LENGTH` | `8192` | la fenêtre de contexte. Sous 24 Go de VRAM, Ollama prend lui-même 4096 par défaut, une fenêtre qu'un agent avec des outils dépasse sans le signaler ; `8192` garde `qwen3:8b` entièrement sur un GPU de 8 Go |
| `OLLAMA_AUTO_PULL` | — | `0` : ne télécharge jamais · `1` : télécharge même sans volume |

Définissez-les sur le conteneur : `-e OLLAMA_MODE=host`. Les journaux sont dans `/var/log/ollama.log`.

```bash
orkeon-update --check     # les versions, et où le modèle est chargé : GPU, CPU ou une part de chacun
ollama ps                 # le modèle chargé et sa répartition CPU/GPU
```

### Utiliser le GPU

Ollama utilise un GPU NVIDIA quand le conteneur a été **créé** avec `--gpus=all`. Rien à installer dans le
conteneur.

| Hôte | Prérequis |
|---|---|
| Windows, Docker Desktop | un GPU NVIDIA, un pilote NVIDIA à jour, un noyau WSL 2 à jour (`wsl --update`), le moteur basé sur WSL 2. Voir la [documentation de Docker](https://docs.docker.com/desktop/features/gpu/). |
| Linux, Docker Engine | le pilote NVIDIA et le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html), puis `sudo nvidia-ctk runtime configure --runtime=docker` et `sudo systemctl restart docker` |

Vérifiez que Docker peut confier le GPU à un conteneur, puis que le modèle tourne vraiment dessus :

```bash
docker run --rm --gpus=all --entrypoint nvidia-smi orkeon-workshop    # sur votre ordinateur : le tableau des GPU
ollama run qwen3:8b --think=false "Reply with OK"                       # dans le conteneur
ollama ps                                                               # PROCESSOR: 100% GPU
```

| Symptôme | Signification |
|---|---|
| `could not select device driver "" with capabilities: [[gpu]]` | Docker ne peut pas fournir de GPU : consultez les prérequis, ou retirez `--gpus=all` pour tourner sur le CPU. Le `docker run` raté a en général créé le conteneur : `docker rm my-orkeon-workshop` avant de réessayer ([Dépannage](../reference/troubleshooting.md#loption---gpusall)) |
| `nvidia-container-cli: initialization error: WSL environment detected but no adapters were found` | Docker Desktop sous Windows, et WSL ne voit aucun GPU NVIDIA : pas de carte NVIDIA, pilote absent ou trop ancien, ou WSL pas à jour. `nvidia-smi` dans PowerShell, `wsl --update`, `wsl -- nvidia-smi` disent lequel ; le même `docker rm` s'applique ([Dépannage](../reference/troubleshooting.md#loption---gpusall)) |
| `nvidia-smi: command not found` dans le conteneur | il a été créé sans `--gpus=all`, ce qui ne s'ajoute pas après coup — recréez-le ([Mettre à jour](./updating.md#migrer-un-conteneur-vers-une-nouvelle-image)) |
| `ollama ps` affiche une répartition comme `41%/59% CPU/GPU` | le modèle et son contexte ne tiennent pas dans la VRAM libre : baissez `OLLAMA_CONTEXT_LENGTH`, prenez un modèle plus petit ou libérez la carte (chaque conteneur en mode `local` charge sa propre copie — `OLLAMA_MODE=host` en partage une seule) |
| `100% GPU`, et pourtant lent | l'hôte bride le GPU (profil d'alimentation ou thermique d'un ordinateur portable) |

### Une requête à la fois

Un modèle local répond à une requête à la fois. Plusieurs requêtes simultanées — un crew `parallel`, un
superviseur et ses équipiers — saturent le GPU et les ralentissent toutes. Un modèle local tourne donc
avec `RateLimiting.MaxConcurrentRequests` à 1 : Orkeon met alors les autres appels en file d'attente,
jusqu'à `QueueLimit` (32 ici ; la valeur par défaut, 5, refuse les appels au-delà). L'image écrit
`"RateLimiting": { "MaxConcurrentRequests": 1, "QueueLimit": 32 }` dans `~/.config/Orkeon/appsettings.json`.
À chaque démarrage, elle remet aussi la limite à 1 dans ce fichier quand il vise le modèle local sans en
fixer — après un `orkeon init`, par exemple ; une limite absente, nulle ou négative signifie « illimité ».
Une limite de 1 ou plus que vous fixez vous-même est conservée. Quand l'URL de base est locale,
`orkeon-bench doctor` échoue si le fichier de la machine ne fixe pas de limite, et les vérifications
refusent un fichier de réglages propre à une équipe (`settings/<slug>/appsettings.json`) qui n'en fixe
pas — rien ne réécrit ce fichier à votre place, et il remplace le fichier de la machine.

### Quand une équipe est lente

`qwen3` réfléchit avant de répondre, ce qui multiplie les jetons à générer — d'où les 600 secondes par
appel. Une réponse en flux qui cesse d'arriver — un modèle bloqué, une connexion perdue — échoue après
120 secondes de silence au lieu de pendre jusqu'au délai d'expiration : c'est `Llm.StreamIdleSeconds`, que
l'image écrit pour le modèle local et remet à chaque démarrage quand le fichier ne l'a pas ; une valeur que
vous fixez vous-même est conservée. Une machine lente qui reste silencieuse plus longtemps pendant qu'elle
lit une longue consigne demande une valeur plus haute, ou la suppression de la clé. Pour échanger du
raisonnement contre de la vitesse, ajoutez `"Thinking": { "Enabled": false }` à la
section `Llm` de `~/.config/Orkeon/appsettings.json`, ou définissez `ORKEON_Llm__Thinking__Enabled=false`
pour une seule exécution.

## Modèles distants

Un fournisseur distant (Anthropic, OpenAI, Mistral…) se configure à la manière d'Orkeon, jamais dans le
dossier d'une équipe :

- pour tout le conteneur : `orkeon init` écrit `~/.config/Orkeon/appsettings.json` ;
- pour une équipe : son propre fichier de réglages, `settings/<slug>/appsettings.json` dans l'atelier (ses
  lanceurs, `orkeon-harness-run` et Orkeon Studio le transmettent à la place de celui de la machine ; une
  exécution de test sur le modèle simulé, `orkeon-bench run`, en utilise une copie dont les réglages de
  modèle sont remplacés — [L'atelier](../concepts/workshop.md)) ;
- pour une exécution : les variables d'Orkeon `ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model`,
  `ORKEON_Llm__ApiKeyEnvVar` ;
- pour certains agents seulement : un **profil nommé** `Llm:Profiles:<id>` dans l'un de ces réglages, avec
  les mêmes clés que `Llm` (`BaseUrl`, `Model`, `ApiKeyEnvVar`…). Un agent ou la crew le prend avec
  `llm: { profile: <id> }` en YAML ou `llm.profile("<id>")` en TypeScript, une tâche avec
  `llmOverride: { profile: <id> }` ou `.withProfile("<id>")` ; `orkeon run --llm-profile <id>` exécute toute
  la crew dessus. Un profil fait partie des réglages de la machine ou de l'équipe : une équipe qui en nomme
  un doit l'y trouver ;
- dans Orkeon Studio : les réglages propres à Studio pour une équipe qui n'a pas de fichier de réglages
  propre, et le réglage de modèle que nomme la carte de l'équipe (`"profile"` dans `studio-team.json`, écrit
  exactement comme le réglage s'appelle dans Studio), qui l'emporte sur les deux fichiers ;
- dans le banc : un profil nommé de `tests/<slug>/bench.config.json`
  ([Tester une équipe](../concepts/testing.md#modèles-locaux-et-distants)).

**Les clés ne vont jamais sur le disque** dans l'atelier : un hook refuse d'écrire ce qui a la forme d'une
clé sous `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/` ou `.claude/`, et les
vérifications refusent un fichier de réglages d'équipe qui en contient une — sous `Secrets:`, dans un
`…ApiKey`, `…Password`, `…Secret` ou `…Token`, ou dans une chaîne de connexion. Gardez les clés dans des
variables d'environnement ; les réglages nomment la variable (`"ApiKeyEnvVar": "ANTHROPIC_API_KEY"` sous
`Llm` ou un profil nommé, `"keyEnv"` dans un profil du banc), jamais la clé. Un agent qui dispose de l'outil `shell_command` lit, quels que soient ses points de montage, les
réglages de la machine, les jetons OAuth des comptes e-mail, les identifiants de Claude Code et, par
`/proc`, la clé de son exécution : les vérifications le signalent, et le refusent dans une équipe qui a un
compte e-mail. Ne donnez cet outil à aucun agent qui lit des entrées non fiables — un e-mail, une page
web, un document.

### Comment une clé arrive dans le conteneur

Les réglages nomment la variable ; la valeur arrive dans le conteneur par l'un de trois chemins, et jamais
par la conversation avec Claude — il la garderait. Claude dit lequel, où le taper, et rien d'autre :

| Pour | Vous tapez | Dure |
|---|---|---|
| **cette session** | dans le terminal du conteneur, après `/exit` : `workshop --secret ANTHROPIC_API_KEY` — la commande demande la valeur, ne l'affiche pas pendant la frappe, ne la garde pas (pas dans l'historique du shell non plus), et ouvre Claude Code avec la variable définie | jusqu'à la sortie du conteneur |
| **le conteneur** | sur votre ordinateur, à la création du conteneur : définissez la variable dans ce terminal (`$env:ANTHROPIC_API_KEY = "…"` en PowerShell, `export ANTHROPIC_API_KEY=…` sous Linux), puis ajoutez `-e ANTHROPIC_API_KEY` (sans valeur) à la commande `docker run` d'[Installer](../getting-started/install.md#3-démarrer-le-conteneur) — Docker transmet la variable, la commande ne contient aucune valeur | la vie du conteneur : `docker start` la conserve |
| **VS Code** | dans le `.devcontainer/devcontainer.json` de l'atelier : `"remoteEnv": { "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}" }`, la variable étant définie sur votre ordinateur | chaque conteneur que VS Code ouvre |

Une ligne dans le `~/.zshrc` du conteneur est votre choix : elle disparaît quand le conteneur est remplacé
([Mettre à jour](./updating.md)), et elle se tape en clair. Claude n'écrit jamais une clé nulle part, et ne
vous en demande jamais ([Le harnais](../reference/harness.md)) ; `orkeon doctor` dit si la variable que les
réglages nomment est définie, sans l'afficher.

Le pare-feu, quand il est actif, autorise `api.anthropic.com` ; tout autre fournisseur doit avoir son hôte
dans `FIREWALL_EXTRA_DOMAINS` ([configuration](../reference/configuration.md#pare-feu)).

## L'accord pour les exécutions payantes

Un modèle distant coûte de l'argent : Claude Code n'en lance donc jamais un de lui-même. La **barrière de
budget** — un hook qui surveille chaque `orkeon run`, `orkeon-harness-run`, `./run.sh` et
`orkeon-bench run` — classe chaque exécution :

| L'exécution | Barrière |
|---|---|
| `--validate`, le modèle simulé, un modèle sur un hôte local (`localhost`, `host.docker.internal`, un hôte listé dans `HARNESS_LOCAL_LLM_HOSTS`) | autorisée |
| tout ce qui atteindrait un hôte distant — y compris une configuration sans URL de base, où Orkeon choisit lui-même un fournisseur hébergé | refusée, sauf si la tentative ouverte de l'équipe contient un accord |

La barrière lit ce qu'Orkeon lit pour l'exécution : les variables `ORKEON_Llm__*`, puis le
`settings/<slug>/appsettings.json` de l'équipe quand son lanceur le transmet (sinon un `appsettings.json`
dans le dossier `crew/` ou dans un dossier `appsettings/` situé plus haut, sinon
`~/.config/Orkeon/appsettings.json`), puis les variables `Llm__*` sans préfixe. Elle juge le modèle par
défaut **et chaque profil nommé** : un seul profil distant rend l'exécution distante, même à côté d'un
modèle par défaut local, car n'importe quel agent peut le nommer. Donnez toujours une URL de base, au
modèle par défaut comme à chaque profil : Orkeon n'a pas de réglage de fournisseur — il refuse de démarrer
sur une clé `Llm:Provider` — et, sans URL de base, choisit un fournisseur hébergé.

L'accord est un petit fichier dans la tentative ouverte
(`workbooks/<slug>/attempts/ATT-n/remote-approval.json` : qui a donné son accord, quand, l'estimation, le
plafond). La méthode ne l'enregistre qu'après vous avoir annoncé l'estimation et le plafond : vous donnez
votre accord en tapant `/team-approve remote <usd>` (D36), et un hook fait écrire le fichier par
`orkeon-bench` à partir de cette ligne ; `orkeon-bench` refuse un montant supérieur au plafond. Claude ne
l'écrit jamais. Chaque exécution est consignée dans `.claude/run-log.tsv`. Les commandes que vous tapez
vous-même avec `!` dans Claude Code ne sont pas contrôlées.

`orkeon-bench profile <team> <profile>` indique, avant toute exécution, si un profil est distant.

Suite : [Modes Docker et SonarQube](./docker-modes.md).
