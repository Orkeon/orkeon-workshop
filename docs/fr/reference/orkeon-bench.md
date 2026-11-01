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
construction ; `status`, `profile`, `check` et `attempt` fonctionnent donc dès le début, tandis que `mounts`,
`scaffold`, `run` et `deploy` ont besoin du dossier de l'équipe et de son `mounts.json`.

| Code de sortie | Signification |
|---|---|
| `0` | terminé, et ce qui a été vérifié est conforme |
| `1` | vérifié, et ce n'est pas conforme |
| `2` | mauvaise utilisation ou entrée invalide : équipe inconnue, fichier manquant, JSON mal formé, jeu de dossiers ou profil inconnu |
| `130` | arrêt demandé (Ctrl-C, une limite de temps) |

`run` a des cas de plus, listés [avec elle](#run-team---level-ln--les-niveaux-de-test).

## `doctor` — tout est-il en place ?

```console
$ orkeon-bench doctor
orkeon-bench 0.1.0 — references established on Orkeon 1.0.0-rc.6.src.20261101.gc727c06
PASS  orkeon CLI on PATH              orkeon 1.0.0-rc.6.src.20261101.gc727c06
PASS  orkeon tool catalogue           94 tools
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
`--list-tools`, `orkeon doctor`, `orkeon email`, `orkeon drive` et `orkeon mcp serve` lancés depuis ce dossier lisent encore
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

Lit `workbooks/<slug>/STATUS.md` et indique sa phase (`spec`, `tests`, `build`, `run`, `review`,
`accepted`, `published`), la dernière validation franchie (`team`, `tests`, `build`, `review`, ou aucune),
l'itération (le nombre de verdicts `ITERATE` jusqu'ici), la tentative, la tranche, le verdict et la
prochaine action ; un statut incohérent (une validation en avance sur la phase, `accepted` sans le verdict
`ACCEPTED`…) est signalé par des avertissements.

```console
$ orkeon-bench status demo
team: demo (/workspace/teams/demo)
phase: tests
gate_passed: team
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
les autres noms viennent de `tests/<slug>/bench.config.json`, où un profil distant porte aussi son
`price` (`input_per_million`, `output_per_million`) pour `estimate` et le coût d'une exécution L4. Les secrets ne sont jamais affichés,
seulement les noms des variables. Un profil est distant, sauf si son URL de base désigne un hôte local
(`localhost`, `::1`, `0.0.0.0`, `127.0.0.0/8`, `host.docker.internal`, ou un hôte listé dans
`HARNESS_LOCAL_LLM_HOSTS`). Une configuration sans URL de base est elle aussi distante, car Orkeon
choisit alors lui-même un fournisseur hébergé. Chaque profil nommé des réglages (`Llm:Profiles:<id>`) est
jugé de la même façon, et l'exécution est distante dès que l'un d'eux l'est. Le modèle simulé et un profil
nommé du banc sont injectés à la place du modèle par défaut et de chaque profil nommé. Une exécution
qui appellerait un fournisseur de décision — TypeSafe, Liquid ou Kev, nommé par
`Orkeon:Decision:Provider`, ou TypeSafe ou Liquid déduit de sa section dans une couche quelconque ou de sa
variable `TYPESAFE_API_KEY` ou `LIQUID_API_KEY` — est elle aussi distante, sauf si la `BaseUrl` de ce
fournisseur désigne un hôte local, de même qu'une configuration qu'Orkeon refuserait (`remote_reason` :
`decision-model`, avec `decision_model` dans le JSON) : ses tâches de décision, son outil `system_one_decide` et son garde d'entrée l'appellent, et
`--no-decision` n'arrête que les tâches de décision. Un profil nommé du banc garde le modèle de décision de
la machine, sauf si `bench.config.json` porte un bloc `decision` pour le niveau (voir `run`) ;
l'exécution simulée n'en a aucun. `--level <level>` juge le profil avec le bloc de ce niveau
(`decision_block` et `decision_variables` dans le JSON : `key_env` est un nom de variable, jamais une
clé). La barrière de budget applique la même règle.

## `report validate <file>` — un rapport est-il valide ?

Vérifie un `report.json` au regard de son schéma (version 1.0) et de la règle du verdict : accepté ⇔ chaque
critère d'acceptation passe à son niveau, chaque invariant est respecté, chaque indicateur est dans sa plage.

```bash
orkeon-bench report validate workbooks/notes-digest/attempts/ATT-0001/report.json
```

## `check team <team> [--tests]` — `TEAM.md` tient-il sur le papier ?

Une vérification lit le cahier d'une équipe avant qu'on vous demande de le valider. Elle n'écrit rien,
ne coûte rien, et prend en charge ce qu'un script peut trancher — la forme du document — pour que votre
validation porte sur son contenu.

```bash
orkeon-bench check team mail-triage            # avant /team-approve team
orkeon-bench check team mail-triage --tests    # après /team-tests : la traçabilité des tests
```

Elle lit `workbooks/<slug>/TEAM.md` et `tests/<slug>/bench.config.json` : les quatre sections `## Need`,
`## Acceptance`, `## Design`, `## Plan` et leurs titres, dans l'ordre ; chaque critère a un identifiant
qui lui est propre, un jeu de données que les critères listent, un résultat attendu et un niveau de
test ; chaque indicateur a un seuil chiffré et un sens de comparaison (`>=` ou `<=`) ; les invariants dont
toute équipe a besoin sont là ; le budget est celui de la configuration, et chaque profil de modèle nommé
y figure ; chaque outil confié à un agent existe dans l'Orkeon installé (`orkeon run --list-tools`),
aucun agent ne lit des e-mails tout en pouvant en envoyer, une tâche dépend de toutes les tâches dont
elle lit le résultat, chaque livrable est sous un point de montage accessible en écriture, chaque critère
est couvert par une tranche, chaque tranche a sa fiche (`### B<n>`, ses parties dans l'ordre, ses étapes
et leurs ancres — les fichiers que chaque étape crée). Avec `--tests`, elle vérifie aussi que chaque test
de `tests/<slug>/` cite un identifiant déclaré, que chaque critère actif et chaque invariant a un test à
son niveau, et que les scénarios se lisent.

````console
$ orkeon-bench check team mail-triage
check team: mail-triage — FAIL (2 errors, 1 warning)
  error   TEAM.md § Design § Agents — agent `reader`: unknown tool `email_parse` (not listed by `orkeon run --list-tools`, not declared custom in `### Tools`)
  error   TEAM.md § Plan § Batches — `AC-02` is covered by no batch
  warning TEAM.md § Design § Tasks and DAG — no ```mermaid block: the diagram is drawn from the table
````

Une **erreur** (`error`) doit être corrigée avant de demander la validation ; un **avertissement**
(`warning`) est corrigé ou expliqué ; une ligne `skipped` nomme une vérification qui n'a pas pu être faite
— les noms d'outils, sans `orkeon` — et qui se fait alors à la main. Code de sortie `0` sans erreur, `1`
avec une erreur, `2` quand `TEAM.md` n'existe pas encore (`TEAM.md not found: <path> — /team-init writes
it`). `--json` donne chaque constat avec son code. `/team-spec` et `/team-tests` lancent eux-mêmes cette
vérification avant de vous rendre la main. Les codes sont listés dans le
[README](../../../.devcontainer/bench/README.md#checks-of-the-workbook) du banc (en anglais).

## `deploy <team>` — l'équipe sous forme d'archive, pour un autre atelier

```bash
orkeon-bench deploy notes-digest --with-settings              # deployments/notes-digest-20261010.zip
orkeon-bench deploy notes-digest --without-settings --format tar.gz
```

Écrit `deployments/<slug>-<yyyymmdd>.zip` (date UTC ; `-2`, `-3`… pour une deuxième archive le même jour) à
la racine de l'atelier — ou `.tar.gz` avec `--format tar.gz`, ou dans un autre dossier avec `--into
<dossier>`. L'archive contient l'équipe **telle qu'Orkeon Studio l'exécute**, sous `teams/<slug>/` :
`crew/`, `mounts.json`, la carte, les lanceurs, le README, `tsconfig.json` et `typings/` pour un crew
TypeScript, et le dossier de chaque point de montage réduit à son `.gitkeep` — les données qu'une équipe
lit, écrit et conserve restent dans l'atelier, comme `node_modules/`, `bin/` et `obj/`. Quand l'équipe a
son propre fichier de réglages, `settings/<slug>/appsettings.json`, vous dites s'il part avec elle :
`--with-settings` le place à côté de l'équipe, `--without-settings` le laisse, et sans l'un ni l'autre la
commande s'arrête et pose la question. L'archive se décompresse à la racine d'un atelier (`~/Orkeon`,
`%USERPROFILE%\Orkeon`) : l'équipe entre dans le catalogue de Studio et ses lanceurs retrouvent leurs
réglages deux niveaux plus haut, exactement comme ici ; `run.sh` ressort exécutable d'`unzip` et de tout
extracteur Unix d'un `.tar.gz`. Le commentaire de l'archive — celui du zip, ou un en-tête pax du tar — dit
ce qu'elle contient : équipe, date, versions d'Orkeon et du banc, présence ou non des réglages.

```console
$ orkeon-bench deploy notes-digest --with-settings
notes-digest: /workspace/deployments/notes-digest-20261010.zip (12 files, 6.8 KB)
settings: included (settings/notes-digest/appsettings.json)
left out: the data of notes/ (14), reports/ (3)
unzip it at the root of a workshop (~/Orkeon): teams/notes-digest/ lands in Studio's catalogue, and its launchers find the settings beside it
```

Refusé, avec le code de sortie `2` et sans rien écrire : un dossier d'équipe qui contient un fichier de
réglages qu'Orkeon lirait (`appsettings*.json` à sa racine ou dans `crew/`, un dossier `appsettings/` ou
`_shared/`) ou un `.env` ; un fichier de réglages qui contient un secret — une clé, un mot de passe, un
jeton avec une valeur —, car un déploiement n'en transporte jamais : nommez plutôt la variable qui le
détient (`ApiKeyEnvVar`). Un lanceur ou une carte manquants valent un avertissement : lancez `scaffold`
d'abord. `/deploy` lance cette commande après `./run.sh --validate`, et vous pose la seule question — les
réglages.

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
généré ainsi, régénéré pour Orkeon `main` au commit ce9ec1f, conservé à c39c5fa, qui ne change aucun fichier source, à ad6dc63, qui change le schéma de cinq outils du bus d'événements mais aucun nom, description ni argument, à 5668c54, qui ne change aucun outil, à f59446b, qui n'en change aucun non plus, à 13461ea, qui ajoute les onze outils `drive_*`, à 63be532, qui n'en change aucun, à e258730, qui n'en change aucun non plus (seulement l'accès que les outils web et RAG déclarent à la barrière de permissions des scripts), et à acd59d6, qui n'en change aucun (un nouveau verbe, `orkeon quickstart`, rien sous `src/tools/`) — leurs lignes sont écrites d'après les sources jusqu'à la régénération du relevé (la construction de l'image le compare à `orkeon run --list-tools`). Un outil dont le schéma parvient vide au
modèle affiche `none in the schema`.

Orkeon ne présente les outils `email_*` et `drive_*` à un agent qu'avec un compte prêt : l'exécution
jetable déclare donc sa propre boîte aux lettres et son propre compte OneDrive de sonde — des points
d'accès locaux injoignables, un fichier de jeton factice dans le dossier temporaire de l'exécution,
supprimé avec lui — et retire les variables `Orkeon__Tools__Email__*` et `Orkeon__Tools__Drive__*` de
l'appelant : aucun compte n'est contacté. Les variables de décision sont retirées aussi, si bien que
`system_one_decide`, enregistré seulement à côté d'un fournisseur de décision actif, n'est pas listé —
110 outils à Orkeon c727c06.

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
  `remote-approval.json`. Vous ne l'appelez pas : vous tapez `/team-approve remote <slug> <usd>` dans
  Claude Code, après que `/team-run` a chiffré l'exécution avec `estimate`, et un hook l'appelle avec ce
  que vous avez tapé
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
port (n'importe lequel sauf 11434, celui d'Ollama), `--log <file>` ajoute chaque échange à la fin d'un fichier. `--scenario` accepte un fichier de
scénario (son `llm_stub`) ou un script de réponses seul. À l'arrêt, elle indique combien de requêtes elle
a reçues et ce qui n'allait pas — une requête à laquelle aucune règle ne répond, un appel d'outil que
l'outil refuserait, une requête abandonnée en cours de route. Aucun modèle n'est appelé, rien n'est
payé.

## `run <team> [--level L<n>]` — les niveaux de test

Exécute les niveaux de test dans l'ordre, dans la tentative ouverte de l'équipe, jusqu'à celui que vous
nommez — ou, sans `--level`, jusqu'au plus haut que `tests/<slug>/bench.config.json` déclare
(`e2e_remote` → L4, `e2e_local` → L3, sinon L2). Elle s'arrête au premier niveau rouge.

```console
$ orkeon-bench run notes-digest --level L3
notes-digest: ATT-0001
L0 static: pass
L1 unit: skipped (skipped: no tests/notes-digest/unit folder)
L2 component: pass
L3 e2e local: pass (pass@k 2/3)
verdict input: all_ac_pass=true all_inv_pass=true indicators_in_range=true
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
runs: RUN-20261030-1843-stub RUN-20261030-1851-machine …
```

| Niveau | Ce qui s'exécute |
|---|---|
| L0 statique | `mounts.json` et les dossiers que ses points de montage ont le droit d'atteindre, la disposition de `crew/`, les lanceurs et la carte comparés à `mounts.json`, `bench.config.json`, le fichier de réglages que l'exécution lirait (il doit être du JSON strict : ni commentaire, ni virgule finale, ni clé écrite deux fois — le message nomme le fichier et la ligne), les scénarios (chacun se lit, a une vérification pour ce qu'il prétend prouver, et se trouve là où une exécution le prend), le script de vérification du skill générateur, `orkeon run --validate` |
| L1 unitaire | `npx vitest run tests/<slug>/unit --reporter json` depuis la racine de l'atelier (vitest est dans l'image) ; `skipped` quand l'équipe n'a pas de dossier `tests/<slug>/unit/`, avec un avertissement quand `vitest` est introuvable |
| L2 composant | chaque `tests/<slug>/component/*.scenario.json`, sur le modèle simulé : le crew entier s'exécute une fois par scénario, **chaque** point de montage — ceux en lecture seule aussi — lié à une copie temporaire du jeu de données du scénario ; puis les vérifications du scénario sont jugées — un fichier existe, un texte est présent ou absent, un fichier correspond à l'attendu, un fichier JSON respecte un schéma, un outil a été appelé ou non, un agent a reçu un texte, les dossiers en lecture seule sont inchangés. Un jeu de données ne contient que des fichiers et des dossiers ordinaires : un lien symbolique y fait échouer le scénario, et un lien laissé par une exécution n'est ni suivi ni archivé. Une équipe sans aucun scénario est **rouge** à ce niveau, et non ignorée |
| L3 de bout en bout, local | chaque `tests/<slug>/e2e/*.scenario.json` de niveau `L3`, sur le profil de `levels.e2e_local` (`machine` par défaut, ou `--profile <name>`), chacun répété `repeat` fois ; le niveau passe quand au moins `pass_at` exécutions de chaque scénario passent, et le rapport note `pass_at_k` sous la forme `k/n`. Un scénario avec une `sequence` exécute ses étapes dans le même bac à sable, tue l'équipe après la tâche qu'il nomme et la relance, puis juge ses vérifications |
| L4 de bout en bout, distant | les scénarios `L4` sur le profil de `levels.e2e_remote` ; refusé sans `remote-approval.json` dans la tentative ouverte (`remote level needs an approval: run orkeon-bench attempt approve <team> first`) ; le coût est lu dans les événements `cost.updated` de chaque exécution et chiffré avec `profiles.<name>.price` (`input_per_million`, `output_per_million`), affiché `cost: <usd> USD (cap <cap>)` et conservé dans le rapport |

Chaque scénario laisse une exécution sous `workbooks/<slug>/runs/RUN-<date>-<heure>-<profil>/` — le flux
d'événements, les journaux, les échanges avec le modèle, un instantané de ce qui a été écrit, un manifeste
avec ses jetons, son coût, son itération et ses étapes — et la tentative reçoit `report.json` et
`REPORT.md`.

**Le modèle de décision d'un niveau (D96).** `tests/<slug>/bench.config.json` peut porter un bloc
`decision`, au premier niveau — pour L3 et L4 — ou sous `levels.e2e_local` ou `levels.e2e_remote`, qui le
remplace ; `null` à un niveau n'y injecte rien. L0, L1 et L2 n'en prennent jamais.

```json
"decision": { "provider": "kev", "base_url": "http://127.0.0.1:8009/v1", "model": "kev-latest", "key_env": "KEV_API_KEY", "price_per_call": 0.002 }
```

`provider` vaut `typesafe`, `liquid` ou `kev` ; `base_url`, `model`, `key_env` et `price_per_call` (USD,
pour `estimate`) sont facultatifs, et toute autre clé est refusée. `key_env` est le **nom** de la
variable qui détient la clé : une valeur qui ressemble à une clé est refusée, comme le `keyEnv` des
profils. Le banc injecte `ORKEON_Orkeon__Decision__Provider` et
`ORKEON_Orkeon__<TypeSafe|Liquid|Kev>__BaseUrl`, `__Model` et `__ApiKeyEnvVar` dans l'environnement de
chaque exécution du niveau — jamais dans un fichier, jamais dans une exécution sur le modèle simulé — et
l'exécution est distante quand le point d'accès du fournisseur injecté n'est pas local. `run
--no-decision` transmet `--no-decision` à chaque `orkeon run` : les tâches de décision répondent par leur
repli, tandis que `system_one_decide` et le garde d'entrée appellent toujours le modèle de décision. Le
manifeste de chaque exécution enregistre ses `decision_calls`.

Trois vérifications lisent les tâches de décision dans le flux d'événements : `decision-answered`
(`task`) — le modèle de décision a répondu, pas le repli (`defaulted`) ; `decision-chose` (`task`,
`question`, `option`) ; et `task-skipped` (`task`) — une tâche que sa condition a écartée. Les
événements ne portent pas la clé des tâches : `task` désigne une tâche de décision par son rôle, son agent
ou son identifiant de tâche, ou par la clé que cite le `skipReason` d'une tâche qu'elle conditionne.
`decision-answered` est refusée dans un scénario L2 : sur le modèle simulé, une décision répond toujours
par son repli, ce que vérifie `decision-chose`.

**Ce que prouve le rapport.** Un critère passe quand `TEAM.md` le déclare à un niveau que le banc a
exécuté et qu'un scénario vert de ce niveau le couvre ; sinon il reste `not_run`, et `REPORT.md` dit
pourquoi sous « Not run, so not proven: ». Une ligne dont le statut commence par `dropped` est laissée
hors du rapport ; un scénario qui la couvre encore reçoit un avertissement. Un **invariant** est évalué
par le banc à partir des exécutions qui le couvrent — `INV-FS` d'après les empreintes des dossiers en
lecture seule, `INV-SECRETS` d'après les sorties et les événements, `INV-TOOLS` d'après les appels d'outils
comparés aux déclarations du crew, `INV-SCHEMA` d'après les vérifications par schéma, `INV-EMAIL` d'après
l'absence d'`email_send`, `INV-BUDGET` d'après les jetons et le coût, `INV-INJECTION` d'après les jeux de
données adverses, `INV-IDEMP`, `INV-RESUME` et `INV-INCR` d'après les scénarios avec une `sequence` ;
celui qu'aucun scénario ne couvre est `not run: no scenario covers this invariant`. Un **indicateur** est
la moyenne de la mesure que les scénarios déclarent pour lui (`duration_seconds`, `tokens_total`, `usd`,
`tool_calls`, `human_inputs`, `pass_rate`, `decision_defaulted_rate` — la part, de 0 à 1, des tâches de
décision qui ont répondu par leur repli —, `decision_confidence_min` — la plus faible confiance de leurs
réponses —, ou `judge:J-<n>`, rempli par `evaluate`), comparée au seuil de la table des critères ; les
deux mesures de décision ne comptent que les exécutions qui ont achevé une tâche de décision, et sont
`not_run` sans elle. Le `cost` du rapport ajoute alors `decision_tasks`, `decision_defaulted` et
`decision_confidence_min`, et `REPORT.md` une ligne pour eux. **Un juge hors limite bloque le verdict
(D97) :** `indicators_in_range` n'est vrai que si chaque indicateur et chaque juge de `report.judges`
respecte son seuil.

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
réglages de modèle. Une exécution sur un profil nommé injecte de la même façon les variables de ce
profil, la clé lue dans la variable d'environnement que `keyEnv` nomme, jamais dans un fichier.

La commande a besoin du dossier de l'équipe et d'une tentative ouverte (`attempt open`), et s'arrête
après un L0 rouge, sauf avec `--continue`. Un scénario qui vise une tâche exécutée seule, ou des réponses
à une personne, n'est pas servi : il s'exécute et **échoue** plutôt que de passer sans être vérifié.

| Code de sortie de `run` | Signification |
|---|---|
| `0` | aucun niveau n'est rouge |
| `1` | un niveau est rouge — y compris L2 sans scénario |
| `2` | mauvaise utilisation, `--level` ou `--profile` donné deux fois, un niveau distant sans accord, ou tentative close pendant l'exécution : rien n'y est alors écrit |
| `130` | arrêt demandé (Ctrl-C, une limite de temps) : les processus de l'équipe sont tués, la copie temporaire supprimée, l'exécution conservée avec `status: interrupted` dans son manifeste, et aucun rapport écrit |

## `evaluate <team> --judgements <file>` — les notes des juges dans le rapport

`/team-run` fait noter par un sous-agent Claude chaque sortie pour laquelle un scénario nomme un juge,
d'après la grille de `tests/<slug>/judges/`, et assemble les notes dans un fichier
(`{"judgements": [{judge, rubric_version, output, score, justification, quotes}]}`). `evaluate` le copie
dans la tentative ouverte sous `judgements.json`, remplit `report.judges` et les indicateurs de la forme
`judge:J-<n>`, et réécrit `report.json` et `REPORT.md` :

```console
$ orkeon-bench evaluate notes-digest --judgements /tmp/notes-digest-judgements.json
notes-digest: ATT-0001
judges: J-1=0.82 (>= 0.7) pass
report: /workspace/workbooks/notes-digest/attempts/ATT-0001/report.json
```

Les appels successifs s'additionnent, juge par juge : un juge que le fichier note remplace ses notes
précédentes, les autres que le rapport porte déjà restent, dans `judgements.json` comme dans
`report.judges`. Une exécution qui réécrit le rapport le recommence sans juge, et les notes du rapport
qu'elle remplace partent avec lui. Un juge dont le seuil est l'identifiant d'un indicateur (`IND-<n>`)
en prend aussi le sens : sous `<=`, il passe au seuil ou en dessous (`J-3=0.5 (<= 1)`). Code de sortie
`1` quand un juge de l'ensemble fusionné est hors limite — `indicators_in_range` est alors faux, et le
verdict bloqué (D97) ; `--json` donne la note, le seuil, le sens et
le statut de chaque juge, et l'entrée du verdict.

## `estimate <team> [--profile <name>]` — que coûterait une exécution distante ?

Avant toute exécution payante, chiffre les scénarios L4 sur un profil distant, avec le `price` du profil,
fois `repeat`, fois un facteur de sécurité de 1,3. Un scénario L4 exécute le scénario L3 de même
identifiant sur le profil distant : il est chiffré d'après la moyenne des jetons des exécutions de ce
scénario L3 sur le profil local (`runs/RUN-*-<profil local>/`), en ne comptant que celles qui ont abouti
(`pass` ou `fail`, jetons comptés) de la dernière tentative à laquelle elles appartiennent :

```console
$ orkeon-bench estimate notes-digest
estimate: 0.84 USD for 4 scenario(s) × 1 on claude (claude-sonnet-5-5) — cap 2 USD
```

Code de sortie `1` au-dessus du plafond `budget.remote_usd_max` ; `2` sans ce plafond écrit dans
`bench.config.json` (comme pour `attempt approve`, aucune valeur par défaut n'en tient lieu), sans
exécution locale d'où chiffrer (`no local e2e run archived yet: run orkeon-bench run <team> --level L3
first`), avec un scénario L4 qu'aucune exécution L3 aboutie de même identifiant ne chiffre (nommé, jamais
déduit des autres), ou avec un profil sans `price`. `/team-run` met le montant dans `next_action: /team-approve remote <slug> <usd>`, et votre
ligne enregistre l'accord.

Le modèle de décision est chiffré aussi (D96) : la moyenne des appels de décision par passage des
exécutions locales — leurs tâches de décision, répondues ou par repli, et leurs appels de
`system_one_decide`, d'après le `decision_calls` du manifeste ou à défaut les événements ; ceux du garde
d'entrée ne se voient pas — fois le `price_per_call` du bloc `decision` du niveau L4 (`decision_calls`,
`decision_price_per_call` et `decision_usd` dans le JSON). Code de sortie `2` quand ces appels
atteindraient un modèle de décision distant sans `price_per_call` indiqué ; un modèle local ne coûte
rien.

## `capture <team>` — ce que lit le relecteur

Écrit `attempts/ATT-nnnn/capture.md` dans la tentative ouverte : le statut, le diff de `crew/` par rapport
à l'instantané de conception de la tentative précédente (plafonné à 1200 lignes), `REPORT.md`, les erreurs
et les tâches échouées des exécutions que le rapport cite, et les vingt premières et dernières lignes de
leur `stderr`. `/team-review` remet ce fichier au sous-agent `team-reviewer` à la place de l'archive.

## `release <team>` — l'équipe acceptée rendue durable

Refuse sans une tentative close au verdict `ACCEPTED`, ou quand `crew/` ou `mounts.json` diffère de
l'instantané de conception de cette tentative. Puis relance `scaffold`, garde `retention.runs_keep`
exécutions plus celles qu'un rapport cite (les exécutions de ses scénarios et celles du rapport qu'il a
remplacé) ou qu'un manifeste de tentative liste, déplace les autres vers `archive/runs/<slug>/`, et
affiche la version et la commande d'étiquetage, qui reste à vous de taper :

```console
$ orkeon-bench release notes-digest
notes-digest: release v1 ready
runs kept: RUN-20261030-1851-machine …
runs archived: 6 → archive/runs/notes-digest/
tag: git tag team/notes-digest/v1 && git push origin team/notes-digest/v1
```

Code de sortie `1`, sans rien déplacer ni écrire, quand un `report.json` d'une tentative ne peut pas être
lu : les exécutions qu'il cite ne se distinguent plus des autres. Chacun de ces rapports est nommé ;
réparez-le ou supprimez-le (`report validate <file>`), puis relancez la livraison.

Les fichiers que lit le banc (`mounts.json`, `STATUS.md`, `bench.config.json`, `report.json`) et son
architecture sont décrits dans son [README](../../../.devcontainer/bench/README.md) (en anglais).
