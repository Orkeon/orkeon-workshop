# `orkeon-bench`

*[English](../../reference/orkeon-bench.md) · Français*

L'outil en ligne de commande du harnais : la logique typée et testée qu'appellent les skills, les hooks et
vous-même, au lieu de bouts de script shell. Il lit une équipe de l'atelier — `teams/<slug>/`, avec son cahier
et ses tests dans `workbooks/<slug>/` et `tests/<slug>/` — et répond en texte ou, avec `--json`, en JSON.

```bash
orkeon-bench --help
orkeon-bench <command> --help
```

`<team>` est soit un slug, cherché sous `<workshop>/teams/` (`notes-digest`), soit le chemin d'un dossier
d'équipe (tout ce qui contient `/` ou commence par `.`). L'atelier est `$ORKEON_WORKSHOP` — `/workspace` dans
le conteneur. Une équipe existe dès que son dossier, son cahier ou ses tests existent : `/team-init` crée
`workbooks/<slug>/` et `tests/<slug>/`, et le dossier de l'équipe arrive avec la première tranche de
construction ; `status` et `profile` fonctionnent donc dès le début, tandis que `mounts` et `scaffold` ont besoin
du `mounts.json` du dossier de l'équipe.

| Code de sortie | Signification |
|---|---|
| `0` | terminé, et ce qui a été vérifié est conforme |
| `1` | vérifié, et ce n'est pas conforme |
| `2` | mauvaise utilisation ou entrée invalide : équipe inconnue, fichier manquant, JSON mal formé, jeu de dossiers ou profil inconnu |
| `3` | pas encore implémenté |

## `doctor` — tout est-il en place ?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20261005.gfb26364
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20261005.gfb26364
PASS  orkeon tool catalogue           83 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
WARN  Ollama reachable                http://127.0.0.1:11434/api/tags: ECONNREFUSED (OLLAMA_MODE=off?)
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
Result: OK
```

La vérification `stray settings files` échoue quand Orkeon trouverait de lui-même un fichier de réglages. Un
`appsettings/appsettings.json` ou un `_shared/appsettings.json` situé au-dessus des équipes, dans un dossier
d'équipe ou dans son `crew/`, ou encore un `crew/appsettings.json`, est lu **à la place des** réglages de la
machine pour toute exécution qui ne nomme aucun fichier de réglages — et Orkeon Studio n'en nomme aucun
pour une équipe qui n'a pas de fichier de réglages propre, à moins qu'un fichier ne soit épinglé en mode
« Expert ». (Depuis Orkeon `main` au commit
a2bb6c3, une exécution de l'équipe ne lit plus les `appsettings*.json` à la racine de son dossier ; seuls
`--list-tools`, `orkeon doctor`, `orkeon email` et `orkeon mcp serve` lancés depuis ce dossier lisent encore
`appsettings.json`.) Les réglages propres à une équipe se
trouvent dans `settings/<slug>/appsettings.json`. Un
avertissement ne fait pas échouer le résultat. `--quiet` n'affiche rien, sauf si une vérification échoue (une
ligne par échec, sur stderr) : c'est la forme à utiliser dans les scripts. `--json` donne toutes les
vérifications.

## `status <team>` — où en est une équipe ?

Lit `workbooks/<slug>/STATUS.md` et indique la phase, la dernière validation franchie, la piste (`full`, ou
`light` pour une petite équipe), l'itération (le nombre de verdicts `ITERATE` jusqu'ici), la tentative, la
tranche, le verdict et la prochaine action. Un statut incohérent (une validation en avance sur la phase,
`accepted` sans le verdict `ACCEPTED`…) est signalé par des avertissements. Un cahier écrit avant `track` et
`iteration` se lit comme `full` et `0`.

```console
$ orkeon-bench status demo
team: demo (/workspace/teams/demo)
phase: design
gate_passed: design
track: full
iteration: 0
…
```

## `mounts <team> [--env <set>]` — quels dossiers une exécution va-t-elle monter ?

Affiche les arguments de montage pour `orkeon run`, tirés de `mounts.json` : les dossiers propres à l'équipe
ou, avec `--env <set>`, le jeu de dossiers `mounts.<set>/<slug>/`.

```console
$ orkeon-bench mounts notes-digest
--mount /workspace/teams/notes-digest/notes:/notes:ro /workspace/teams/notes-digest/reports:/reports:rw
$ orkeon-bench mounts notes-digest --env test
--mount /workspace/mounts.test/notes-digest/notes:/notes:ro /workspace/mounts.test/notes-digest/reports:/reports:rw --allow-external-mounts
```

La commande refuse les mêmes dossiers que `scaffold` (plus bas) et affiche ses avertissements sur stderr, sous
la forme `warning: …`. Tous les montages passent par **une seule** option `--mount` ; placez donc la cible
avant elle, et lancez la ligne depuis le dossier de l'équipe, par rapport auquel `orkeon run` décide de ce qui
est extérieur : `cd teams/notes-digest && orkeon run crew $(orkeon-bench mounts notes-digest)`. Un chemin qui
contient un `;`, ou un `:` autre que celui d'une lettre de lecteur, est mis entre guillemets, comme l'exige la
syntaxe de montage d'Orkeon (`"/srv/a:b":/notes:ro`). `--json` ajoute le dossier du jeu et les `mounts` de la
carte Studio.

## `scaffold <team>` — écrire ce qui découle de `mounts.json`

Écrit les lanceurs `run.sh` (exécutable) et `run.cmd` (fins de ligne Windows), les `mounts` de
`studio-team.json` (ses autres champs sont conservés ; la carte est créée si elle manque), les dossiers des
points de montage situés dans l'équipe, avec un `.gitkeep` dans chacun, et le `.gitignore` de l'équipe, qui
tient hors de git ce que l'équipe lit et écrit. Relancez la commande après toute modification de
`mounts.json`. Les lanceurs transmettent aussi le fichier de réglages propre à l'équipe,
`settings/<slug>/appsettings.json` dans l'atelier, avec `--settings`, quand ce fichier existe et que la ligne
de commande n'en désigne pas d'autre. Studio laisse ces lanceurs tels quels — il lance l'équipe à partir de
sa carte —, mais son action **Changer les dossiers** réécrit les `mounts` de la carte : reportez le
changement dans `mounts.json` et relancez `scaffold`.

```console
$ orkeon-bench scaffold notes-digest
notes-digest: yaml crew, launchers start crew
wrote run.sh, run.cmd, studio-team.json, .gitignore
mounts: ./notes:/notes:ro ./reports:/reports:rw
created notes/ reports/
```

La commande lit `crew/` comme le fait `orkeon run` : un `config.yaml` à côté d'un dossier `agents/` ou
`tasks/` forme un crew YAML, dont les lanceurs exécutent le dossier ; `crew.ork.ts` est un crew TypeScript,
dont ils exécutent le script. Elle refuse un `crew/` qui ne contient ni l'un ni l'autre, et un crew YAML placé
à côté d'un fichier `*.ork.ts` ou `*.ork.js`, qu'`orkeon run` refuse comme ambigu.

Elle refuse aussi un point de montage dont le dossier ne doit jamais être atteint par les agents de l'équipe :
le dossier de l'équipe lui-même, `crew/` ou un dossier nommé `appsettings` ou `_shared` à
sa racine, et, hors de l'équipe, un dossier qui contient — ou qui se trouve dans — ce que conservent
l'atelier, le dossier personnel ou une autre équipe ; la règle complète se trouve dans
[Points de montage](../concepts/mount-points.md#ce-quun-point-de-montage-ne-peut-pas-ouvrir). Un point de
montage `/plugins` doit être en lecture seule. Tout autre dossier situé hors de l'équipe est accepté, avec un
avertissement sur stderr : Studio ne lance l'équipe qu'une fois ce dossier déclaré, au caractère près, dans
ses « Dossiers autorisés » (Authorized folders).

```console
$ orkeon-bench scaffold notes-digest        # avec "default": "." dans mounts.json
error: mounts.json: /notes is bound to the team folder itself: its agents would reach crew/, the launchers and mounts.json, and on a writable point leave an appsettings.json that the next run reads — bind a sub-folder such as ./notes
```

## `profile <team> <name>` — qu'injecterait un profil, et est-il distant ?

```console
$ orkeon-bench profile notes-digest machine
profile: machine (machine)
  settings file: /home/node/.config/Orkeon/appsettings.json
  base URL from: /home/node/.config/Orkeon/appsettings.json
  Llm section from: /home/node/.config/Orkeon/appsettings.json
remote: no (localhost: local host)
variables to inject: none (machine settings apply)
```

Avec un profil nommé dans les réglages (`Llm:Profiles:claude` dont la `BaseUrl` est distante), l'exécution
compte comme distante même si le modèle par défaut est local, car n'importe quel agent de l'équipe peut
nommer ce profil :

```console
  named profile claude: api.anthropic.com: host is not local, remote
remote: yes (api.anthropic.com: host is not local, named profile claude)
warning: the named profile Llm:Profiles:claude is remote (api.anthropic.com): any agent of the crew may name it, so the run counts as remote
```

`machine` reprend ce qu'Orkeon lirait pour une exécution de l'équipe par ses lanceurs ou par le banc
(Studio transmet lui aussi le fichier de réglages de l'équipe, sinon il lit les siens) : les variables
`ORKEON_Llm__*`, le fichier
`settings/<slug>/appsettings.json` de l'équipe (à défaut, un fichier de réglages à côté du crew ou dans
un dossier `appsettings/` — ou l'ancien `_shared/` — situé au-dessus de lui ; à défaut encore, le
`~/.config/Orkeon/appsettings.json` du conteneur), puis les variables `Llm__*`.
`stub` est le modèle simulé, prévu pour le lot 4 (aujourd'hui, `llm-stub` répond `not implemented yet`) ;
les autres noms viennent de `tests/<slug>/bench.config.json`. Les secrets ne sont jamais affichés,
seulement les noms des variables. Un profil est distant, sauf si son URL de base désigne un hôte local
(`localhost`, `::1`, `0.0.0.0`, `127.0.0.0/8`, `host.docker.internal`, ou un hôte listé dans
`HARNESS_LOCAL_LLM_HOSTS`). Une configuration sans URL de base est elle aussi distante, car Orkeon
choisit alors lui-même un fournisseur hébergé. Chaque profil nommé des réglages (`Llm:Profiles:<id>`) est
jugé de la même façon, et l'exécution est distante dès que l'un d'eux l'est. Le modèle simulé et un profil
nommé du banc sont injectés à la place du modèle par défaut et de chaque profil nommé. La barrière de
budget applique la même règle.

## `report validate <file>` — un rapport est-il valide ?

Vérifie un `report.json` au regard de son schéma (version 1.0) et de la règle du verdict : accepté ⇔ chaque
critère d'acceptation passe à son niveau, chaque invariant est respecté, chaque indicateur est dans sa plage.

```bash
orkeon-bench report validate workbooks/notes-digest/attempts/ATT-0001/report.json
```

## `tools dump` — le vrai schéma de chaque outil

Enregistre le schéma de chaque outil que liste `orkeon run --list-tools`, exactement tel que `orkeon run`
l'envoie au modèle. Pour cela, un crew jetable, dont l'unique agent liste tous les outils, s'exécute une fois
face à un enregistreur local qui répond `OK` : aucun modèle n'est appelé, rien n'est payé. La commande affiche
un tableau Markdown (les arguments obligatoires en gras) ou, avec `--json`, les entrées telles qu'envoyées.
Elle se termine avec le code 1 quand un outil listé n'a jamais atteint le modèle.

```console
$ orkeon-bench tools dump | head -n 4
| Tool | Arguments | What it does |
|---|---|---|
| `arcadedb_query` | **`bolt_uri`**, **`database`**, `username`, `password`, **`query`**, `parameters`, `query_language`, `max_results` | Execute Cypher or SQL queries on ArcadeDB via Bolt protocol |
| `cache_search` | **`query`**, `source`, `url_filter`, `top_k`, `min_score` | Semantic search over content previously stored in the RAG cache … |
```

Relancez-la après un changement de version d'Orkeon : le § 5 de `references/orkeon/orkeon-reference.md` a été
généré ainsi, et régénéré pour Orkeon `main` au commit fb26364. Un outil dont le schéma parvient vide au
modèle affiche `none in the schema`.

## Commandes prévues

Ces commandes existent déjà et répondent `not implemented yet`, avec le code de sortie 3 :

| Commande | Lot | Servira à |
|---|---|---|
| `datasets build <team> [<set>]` | 4 | matérialiser les jeux de données synthétiques d'une équipe |
| `llm-stub serve --scenario <file>` | 4 | servir le modèle simulé |
| `run <team> [--level L0…L4]` | 4 | exécuter les niveaux de test et écrire le rapport |
| `evaluate`, `capture`, `attempt open/close` | 4 | recalculer un rapport, préparer la capture destinée au relecteur, gérer les tentatives |
| `team rename`, `team remove` | 4 | déplacer ou supprimer ensemble les cinq arborescences d'une équipe : son dossier, son cahier, ses tests, ses réglages et ses jeux de dossiers |
| `check design` | 3 | confronter une conception aux pièges connus |
| `estimate`, `release` | 9 | estimer le coût d'une exécution distante ; réaligner la carte et les lanceurs, proposer l'étiquette de version |

À partir du lot 4, `doctor` liste aussi les orphelins : un cahier, des tests, des réglages ou un jeu de dossiers
restés sans `teams/<slug>/` — après un dossier d'équipe déplacé ou supprimé à la main : dans un atelier, les
actions « Renommer » (Rename) et « Supprimer » (Delete) de Studio les emportent avec l'équipe.

Les fichiers que lit le banc (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) et son
architecture sont décrits dans son [README](../../../.devcontainer/bench/README.md) (en anglais).
