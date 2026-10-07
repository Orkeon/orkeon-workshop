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
construction ; `status`, `profile` et `attempt` fonctionnent donc dès le début, tandis que `mounts`,
`scaffold` et `run` ont besoin du dossier de l'équipe et de son `mounts.json`.

| Code de sortie | Signification |
|---|---|
| `0` | terminé, et ce qui a été vérifié est conforme |
| `1` | vérifié, et ce n'est pas conforme |
| `2` | mauvaise utilisation ou entrée invalide : équipe inconnue, fichier manquant, JSON mal formé, jeu de dossiers ou profil inconnu |
| `3` | pas encore implémenté : une commande prévue, ou la partie de `run` qu'un lot ultérieur apporte |

`run` a deux cas de plus, listés [avec elle](#run-team---level-l0l2--les-premiers-niveaux-de-test).

## `doctor` — tout est-il en place ?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.4.src.20261007.g80fdefe
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.4.src.20261007.g80fdefe
PASS  orkeon tool catalogue           83 tools
PASS  esbuild on PATH                 0.25.12
PASS  PyYAML importable by python3    python3 ok
WARN  Ollama reachable                http://127.0.0.1:11434/api/tags: ECONNREFUSED (OLLAMA_MODE=off?)
PASS  local model concurrency         localhost: one request at a time, QueueLimit 32
PASS  orkeon.d.ts typings             /usr/local/share/orkeon/typings/orkeon.d.ts
PASS  workshop layout                 /workspace
PASS  stray settings files            none in the teams, nor above /workspace/teams
PASS  sandboxes left by a killed run  none
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
trouvent dans `settings/<slug>/appsettings.json`. La vérification `sandboxes left by a killed run`
avertit, en les nommant, quand une exécution de test tuée a laissé son dossier temporaire (une exécution
arrêtée par Ctrl-C supprime le sien ; un arrêt forcé que rien ne peut intercepter ne le fait pas, et peut
aussi laisser le processus `orkeon` de l'équipe) : le banc ne les supprime jamais de lui-même, et
l'exécution suivante (`run`) avertit elle aussi. Un
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
`stub` est le modèle simulé (`llm-stub serve`, que `run` lance de lui-même au niveau L2) ;
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
généré ainsi, et régénéré pour Orkeon `main` au commit 80fdefe. Un outil dont le schéma parvient vide au
modèle affiche `none in the schema`.

## `attempt` — ouvrir, clore, et l'accord pour une exécution payante

Une **tentative** est un essai pour faire passer l'équipe : `workbooks/<slug>/attempts/ATT-nnnn/`, que
seul le banc écrit. Elle contient un manifeste, un instantané de la conception (`crew/` et `mounts.json`),
le rapport de sa dernière exécution et, quand vous en avez donné un, l'accord pour une exécution payante.

```console
$ orkeon-bench attempt open notes-digest
notes-digest: opened ATT-0001 (/workspace/workbooks/notes-digest/attempts/ATT-0001)
$ orkeon-bench attempt close notes-digest --verdict ITERATE
notes-digest: closed ATT-0001 (ITERATE)
```

- `attempt open <team> [--by <skill>]` a besoin du cahier, pas du dossier de l'équipe : la tentative peut
  s'ouvrir avant la première construction. L'instantané de la conception est pris à l'ouverture, puis de
  nouveau à **chaque** exécution (`run`) : c'est toujours la conception que la dernière exécution a
  mesurée. Une seule tentative est ouverte à la fois : de deux `attempt open` lancés ensemble, l'un
  l'ouvre et l'autre en est informé.
- `attempt close <team> [--verdict ACCEPTED|ITERATE|BLOCKED]` la clôt ; une tentative close ne change plus.
  `--verdict ACCEPTED` est refusé tant que la tentative ne contient pas un rapport qui accepte :

  ```console
  $ orkeon-bench attempt close notes-digest --verdict ACCEPTED
  error: ATT-0001 cannot be closed ACCEPTED: its report does not accept — all_ac_pass=false all_inv_pass=false indicators_in_range=true
  ```

  La commande clôt aussi, comme abandonnée, une tentative qu'une commande interrompue aurait laissée
  sans manifeste, et une tentative dont le manifeste est illisible (le fichier illisible est conservé sous
  le nom `manifest.broken.json`). Un simple fichier nommé `ATT-nnnn` dans `attempts/` arrête toutes les
  commandes, qui le signalent : déplacez-le.
- `attempt approve <team> --usd <amount>` écrit l'accord pour une exécution payante,
  `remote-approval.json`. Vous ne l'appelez pas : vous tapez `/team-approve remote <usd>` dans Claude
  Code, et un hook l'appelle avec ce que vous avez tapé
  ([Les modèles](../guides/models.md#laccord-pour-les-exécutions-payantes)). Elle refuse un montant
  supérieur au plafond `budget.remote_usd_max` de `tests/<slug>/bench.config.json`, et une équipe sans
  plafond déclaré :

```console
$ orkeon-bench attempt approve notes-digest --usd 5
error: 5 USD is above the cap of 2 USD (budget.remote_usd_max of bench.config.json): raise the cap with a decision first, or approve a lower amount
```

## `llm-stub serve` — le modèle simulé

```bash
orkeon-bench llm-stub serve --scenario tests/notes-digest/component/ac-01-digest-written.scenario.json
```

Sert un **script de réponses** sur `127.0.0.1` jusqu'à Ctrl-C : pour chaque agent, les réponses que le
« modèle » donne dans l'ordre — un texte final, ou des appels d'outils, qu'`orkeon run` exécute ensuite
avec les **vrais** outils. La commande affiche l'adresse d'écoute et les trois variables à exporter
(`ORKEON_Llm__BaseUrl`, `ORKEON_Llm__Model=stub-model`, `ORKEON_Llm__ApiKey=stub`) ; `--port` fixe le
port, `--log <file>` ajoute chaque échange à la fin d'un fichier. `--scenario` accepte un fichier de
scénario (son `llm_stub`) ou un script de réponses seul. À l'arrêt, elle indique combien de requêtes elle
a reçues et ce qui n'allait pas — une requête à laquelle aucune règle ne répond, un appel d'outil que
l'outil refuserait, une requête abandonnée en cours de route. Aucun modèle n'est appelé, rien n'est
payé. `llm-stub record` et `replay` sont prévus.

## `run <team> --level <L0|L2>` — les premiers niveaux de test

Exécute les niveaux de test dans l'ordre, jusqu'à celui que vous nommez, dans la tentative ouverte de
l'équipe :

```console
$ orkeon-bench run notes-digest --level L2
notes-digest: ATT-0001
L0 static: pass
L1 unit: skipped (not run: L1 is not implemented yet (lot 4))
L2 component: pass
verdict input: all_ac_pass=false all_inv_pass=false indicators_in_range=true
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
runs: RUN-20261006-2143-stub
warning: INV-FS not proven: no check of an invariant exists in this version of the bench — all_inv_pass stays false
```

| Niveau | Ce qui s'exécute aujourd'hui |
|---|---|
| L0 statique | `mounts.json` et les dossiers que ses points de montage ont le droit d'atteindre, la disposition de `crew/`, les lanceurs et la carte comparés à `mounts.json`, `bench.config.json`, le fichier de réglages que l'exécution lirait (il doit être du JSON strict : ni commentaire, ni virgule finale, ni clé écrite deux fois — le message nomme le fichier et la ligne), les scénarios (chacun se lit, a une vérification pour ce qu'il prétend prouver, et se trouve là où une exécution le prend), le script de vérification du skill générateur, `orkeon run --validate` |
| L1 unitaire | rien pour l'instant : le niveau est rapporté `skipped` dans une exécution L2 ; `--level L1` lui-même est refusé (code de sortie 3) |
| L2 composant | chaque `tests/<slug>/component/*.scenario.json`, sur le modèle simulé : le crew entier s'exécute une fois par scénario, **chaque** point de montage — ceux en lecture seule aussi — lié à une copie temporaire du jeu de données du scénario ; puis les vérifications du scénario sont jugées — un fichier existe, un texte est présent ou absent, un fichier correspond à l'attendu, un outil a été appelé ou non, un agent a reçu un texte, les dossiers en lecture seule sont inchangés. Un jeu de données ne contient que des fichiers et des dossiers ordinaires : un lien symbolique y fait échouer le scénario, et un lien laissé par une exécution n'est ni suivi ni archivé. Une équipe sans aucun scénario est **rouge** à ce niveau, et non ignorée |

Chaque scénario laisse une exécution sous `workbooks/<slug>/runs/RUN-<date>-<heure>-stub/` — le flux
d'événements, les journaux, chaque échange avec le modèle simulé, un instantané de ce qui a été écrit — et
la tentative reçoit `report.json` et `REPORT.md`.

**Ce que prouve le rapport.** Ci-dessus, les deux niveaux passent et l'équipe n'est pourtant pas
acceptée ; `REPORT.md` dit pourquoi, sous « Not run, so not proven: » :

```text
- AC-02 — requires L3 (e2e_local), which did not run
- INV-FS — not checked: no check of this invariant exists in this version of the bench, and a green scenario that lists it in `covers` does not prove it
```

Un critère ne passe que si `ACCEPTANCE.md` le déclare à un niveau que le banc a exécuté et qu'un scénario
vert de ce niveau le couvre ; sans `ACCEPTANCE.md`, ou avec un niveau que le banc ne sait pas lire, il
reste `not_run`. Une ligne dont le statut commence par `dropped` est laissée hors du rapport et des trois
résultats ci-dessus ; un scénario qui la couvre encore reçoit un avertissement. **Aucun invariant ne
passe encore** et aucun indicateur n'est mesuré : chacun de ceux
que l'équipe déclare, ou qu'un scénario couvre, est `not_run`, si bien que `all_inv_pass` et
`indicators_in_range` sont faux dès qu'il en existe un. Une exécution L0–L2 ne peut accepter qu'une
équipe dont tous les critères sont au niveau L2 et qui ne déclare ni l'un ni l'autre.

**Le rapport d'une tentative est celui de sa dernière exécution.** Une exécution ultérieure le remplace,
quel que soit le niveau qu'elle atteint : `REPORT.md` dit ce qui a été demandé et ce qu'il remplace, et
le banc avertit quand une exécution plus basse en remplace une plus haute —

```console
$ orkeon-bench run notes-digest --level L0
…
warning: this run reached L0 and replaces the report of 2026-10-06T21:43:44.176Z, which reached L2: the report of an attempt is that of its last run — its evidence stays in /workspace/workbooks/notes-digest/runs/RUN-20261006-2143-stub
```

**Une exécution sur le modèle simulé ne peut pas atteindre un autre modèle.** Le banc ne transmet pas à
Orkeon le fichier de réglages de l'équipe tel quel : il en génère une copie dans le dossier temporaire de
l'exécution et transmet celle-ci — le fichier que l'exécution aurait lu (le
`settings/<slug>/appsettings.json` de l'équipe, à défaut celui de la machine), ses réglages de modèle
remplacés par le modèle simulé pour le modèle par défaut et pour chaque profil nommé, tout le reste
conservé (une boîte aux lettres, les options des outils, les limites). Il retire aussi de
l'environnement de l'exécution toutes les variables où Orkeon lit ses réglages de modèle. Il ne retient
ni les autres vrais outils qu'un script appelle (un appel HTTP, une recherche web, une boîte aux lettres
que les réglages de l'équipe déclarent), ni un secret qu'un fichier de réglages porte en dehors de ses
réglages de modèle.

La commande a besoin du dossier de l'équipe et d'une tentative ouverte (`attempt open`), et s'arrête
après un L0 rouge, sauf avec `--continue`. Un scénario qui utilise une fonction que le banc ne sert pas
encore — une tâche exécutée seule, des réponses à une personne, des juges, une vérification par schéma —
s'exécute et **échoue** plutôt que de passer sans être vérifié.

| Code de sortie de `run` | Signification |
|---|---|
| `0` | aucun niveau n'est rouge |
| `1` | un niveau est rouge — y compris L2 sans scénario |
| `2` | mauvaise utilisation, `--level` ou `--profile` donné deux fois, ou tentative close pendant l'exécution : rien n'y est alors écrit |
| `3` | pas encore servi : `--level L1`, L3, L4, pas de `--level`, un `--profile` autre que `stub` |
| `130` | arrêt demandé (Ctrl-C, une limite de temps) : les processus de l'équipe sont tués, la copie temporaire supprimée, l'exécution conservée avec `status: interrupted` dans son manifeste, et aucun rapport écrit |

## Commandes prévues

Ces commandes existent déjà et répondent `not implemented yet`, avec le code de sortie 3 :

| Commande | Lot | Servira à |
|---|---|---|
| `datasets build <team> [<set>]` | 4 | matérialiser les jeux de données synthétiques d'une équipe |
| `llm-stub record`, `llm-stub replay` | 4 | enregistrer une exécution locale réussie et la rejouer sans modèle |
| `run <team> --level L1`, `L3`, `L4`, `--profile <name>` | 4, 9 | exécuter les tests unitaires des outils, une équipe sur un modèle local, puis sur un modèle distant derrière la barrière de budget ; vérifier les invariants |
| `evaluate`, `capture` | 4 | recalculer un rapport avec les indicateurs et les notes des juges, préparer la capture destinée au relecteur |
| `team rename`, `team remove` | 4 | déplacer ou supprimer ensemble les cinq arborescences d'une équipe : son dossier, son cahier, ses tests, ses réglages et ses jeux de dossiers |
| `check design` | 3 | confronter une conception aux pièges connus |
| `estimate`, `release` | 9 | estimer le coût d'une exécution distante ; réaligner la carte et les lanceurs, proposer l'étiquette de version |

Prévu (lot 4) : `doctor` listera aussi les orphelins : un cahier, des tests, des réglages ou un jeu de dossiers
restés sans `teams/<slug>/` — après un dossier d'équipe déplacé ou supprimé à la main : dans un atelier, les
actions « Renommer » (Rename) et « Supprimer » (Delete) de Studio les emportent avec l'équipe.

Les fichiers que lit le banc (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) et son
architecture sont décrits dans son [README](../../../.devcontainer/bench/README.md) (en anglais).
