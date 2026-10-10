# Le harnais

*[English](../../reference/harness.md) · Français*

Le harnais est ce qui fait travailler Claude Code à la manière de l'atelier. À chaque démarrage, l'image le
déploie dans les dossiers `.claude/`, `references/` et `library/examples/` de l'atelier. Chaque session charge
`CLAUDE.md`, qui importe le point d'entrée `.claude/harness/HARNESS.md` : l'organisation des dossiers, la
méthode et les règles du jeu, en quelques écrans. C'est le profil `user`, celui d'un atelier tant que vous
n'en choisissez pas un autre : les autres [profils](#profils-et-packs) ajoutent des packs de skills pour
contribuer à un dépôt, le développer, le publier ou garder sa documentation fidèle au code, et peuvent se
déployer dans une copie de travail git plutôt que dans un atelier.

## Skills

Un skill est une procédure prête à l'emploi que Claude suit quand votre demande y correspond, ou quand vous
tapez son nom après un `/`. Les skills `team-*`, `workshop-language` et `workshop-profile` ne se lancent que
lorsque vous les tapez.

| Skill | État | Ce qu'il fait |
|---|---|---|
| `workshop-language` | disponible | affiche ou règle la langue de l'atelier (`/workshop-language fr`) : la conversation et le texte des cahiers ; `default` revient au comportement par défaut, où Claude suit la langue de vos messages et écrit les fichiers en anglais |
| `workshop-profile` | disponible | affiche, liste ou change le [profil](#profils-et-packs) du dossier : les packs du harnais qu'il déploie (`/workshop-profile --list`, `/workshop-profile dev`) ; c'est aussi une commande du conteneur, `workshop-profile` |
| `orkeon-tour` | disponible | une visite guidée interactive de l'atelier, avec des mots simples, adaptée à votre niveau |
| `orkeon-crew-yaml` | disponible | conçoit, écrit et vérifie une équipe YAML ([guide](../guides/yaml-team.md)) |
| `orkeon-crew-typescript` | disponible | la même chose pour une équipe TypeScript dotée d'outils sur mesure ([guide](../guides/typescript-team.md)) |
| `orkeon-update` | disponible | met à jour Orkeon et Ollama dans le conteneur ([Mettre à jour](../guides/updating.md)) |
| `clean-restore` | disponible | nettoie les dossiers `bin/` et `obj/` d'un projet .NET et restaure ses paquets |
| `team-init` | disponible | fait entrer une équipe dans la méthode : crée son cahier (`STATUS.md`, une première décision) et son dossier de tests — `--adopt` pour un prototype existant, `--light` pour la piste allégée |
| `team-need` | disponible | l'entretien qui rédige `NEED.md`, une question pour une décision ; reprend là où il s'était arrêté |
| `team-test-plan` | disponible | à partir du besoin, rédige `ACCEPTANCE.md` (critères, indicateurs, invariants) et `TEST-PLAN.md` (niveaux, jeux de données, modèles, budget), puis `tests/<slug>/bench.config.json` ; vous demande les seuils et le budget, une question à la fois ; fait vérifier les trois fichiers par `orkeon-bench check test-plan` avant de vous les soumettre |
| `team-design` | disponible | à partir du besoin, des critères et du plan de test, rédige `DESIGN.md` (format, agents, tâches, outils, points de montage, livrables) et `PLAN.md` (les tranches, chacune avec les fichiers à créer) ; rien de l'équipe n'est encore écrit ; fait vérifier les deux par `orkeon-bench check design`, face aux pièges connus, avant de vous les soumettre |
| `team-decision` | disponible | consigne un changement sous forme de décision datée, marque ce qui doit être révisé, et renvoie l'équipe à l'étape que le changement rouvre |
| `team-status` | disponible | dit où en est une équipe et ce qui vient ensuite — une ligne par équipe quand aucune n'est nommée ; réaligne `STATUS.md` quand les fichiers disent autre chose |
| `team-approve` | disponible | la ligne que vous tapez à une validation (`need`, `test-plan`, `design`, `remote <usd>`) ; son hook l'enregistre, le skill se contente d'en rendre compte |
| `deploy` | disponible | empaquette une équipe dans `deployments/<slug>-<date>.zip` (ou `.tar.gz`) pour l'installer dans un autre atelier : le dossier de l'équipe tel que Studio l'exécute, sans les données de ses points de montage, et son fichier de réglages si vous le dites — la seule question qu'il pose ; jamais de clé ([`orkeon-bench deploy`](./orkeon-bench.md#deploy-team--léquipe-sous-forme-darchive-pour-un-autre-atelier)) |
| `team-tests` | disponible | à partir des critères, du plan de test, de la conception et du plan, fait écrire par les deux sous-agents de test les jeux de données, les scénarios, les grilles des juges et les tests unitaires des outils sur mesure prévus dans `tests/<slug>/`, chacun citant le critère qu'il prouve ; fait vérifier la traçabilité par `orkeon-bench check design --tests`, puis enregistre lui-même la validation « tests rouges » : chaque test existe, cite un identifiant, et échoue, puisque l'équipe n'existe pas encore |
| `team-build` | prévu, lot 6 | l'équipe, tranche par tranche |
| `team-run`, `team-review` | prévus, lot 7 | une tentative et son rapport ; la revue et son verdict |
| `orkeon-tool-csharp`, `orkeon-crew-csharp` | prévus, lot 8 | outils et équipes en C# |
| `team-release` | prévu, lot 9 | README, carte et lanceurs réalignés, étiquette de version proposée |

## Sous-agents

La session principale confie du travail à des sous-agents, avec un contrat compact, et juge ce qu'ils
rapportent.

| Sous-agent | Fait | Écrit |
|---|---|---|
| `team-test-author` | les tests d'une équipe, avant que l'équipe existe | `tests/<slug>/`, jamais `crew/` |
| `team-implementer` | une tranche d'une équipe, pour que ses tests passent | `crew/`, les outils sur mesure — jamais un test |
| `dataset-synthesizer` | des jeux de données synthétiques : cas nominaux, cas limites, variantes de langue et cas hostiles | les jeux de données |
| `team-reviewer` | audite une tentative : ce qui a été livré, puis sa conformité au plan ; rend le verdict | rien |
| `run-analyst` | résume une exécution : chronologie, appels d'outils, erreurs, jetons, coût | rien |
| `judge` | note des sorties selon une grille d'évaluation versionnée | rien |

## Hooks : les garde-fous

Les hooks se déclenchent sur les événements de Claude Code et font respecter une partie de la méthode, **quel
que soit le mode de permission** — et `workshop` lance Claude Code avec `--dangerously-skip-permissions`,
dans un atelier dont le `.claude/settings.local.json` créé par le harnais autorise toutes les commandes et
toutes les modifications, si bien que les hooks sont les garde-fous ; pour que Claude Code vous demande de
nouveau la permission, voyez [L'atelier](../concepts/workshop.md#ce-qui-appartient-à-qui). Un refus dit
toujours pourquoi, et quoi faire à la place.

| Hook | Surveille | Refuse ou fait |
|---|---|---|
| `run-gate` | chaque `orkeon run`, `orkeon-harness-run`, `./run.sh`, `orkeon-bench run` | une exécution sur un modèle distant sans accord enregistré ; consigne chaque exécution dans `.claude/run-log.tsv` |
| `guard-phase` | chaque écriture de fichier | les écritures dans un dossier qui ne correspond pas à la phase : `crew/` seulement pendant la construction, `tests/<slug>/` jamais pendant celle-ci, `runs/` jamais, une tentative close jamais ; une de vos validations (`need`, `test-plan`, `design`) écrite dans `STATUS.md` ; chaque sous-agent est tenu à son périmètre, et aucun n'écrit les réglages d'une équipe, `settings/<slug>/` |
| `team-approve` | la ligne que vous tapez, `/team-approve …` | enregistre votre validation avant que Claude ne la lise : une validation dans `STATUS.md`, un accord pour une exécution payante dans la tentative ouverte (par `orkeon-bench`) ; refuse, en disant pourquoi, une validation pour une équipe qui ne l'attend pas, dont le document manque, ou dont l'étape ne l'a pas encore soumise (un entretien en pause, par exemple) |
| `secret-guard` | chaque écriture de fichier | une chaîne qui a la forme d'une clé, sous `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/`, `.claude/` |
| `make-executable` | chaque écriture de fichier, après coup | rien n'est refusé : un script que Claude vient d'écrire (`*.sh`, ou `*.py` avec shebang) reçoit aussitôt son bit exécutable ; un script écrit avec des fins de ligne Windows est signalé à Claude, qui le réécrit |
| `delegation-guard` | chaque lancement de sous-agent | une délégation sans description ou sans modèle explicite ; ajoute le contrat de rapport |
| `subagent-report-shape` | la fin d'un sous-agent | renvoie un rapport auquel manquent ses lignes obligatoires |
| `status-check` | la fin d'un tour | après un skill `team-*`, rappelle une fois de mettre à jour `STATUS.md` (`team-status` et `team-approve` en sont dispensés) |
| `read-bounds` | chaque lecture de fichier | une lecture non bornée d'un gros fichier, et fournit son plan à la place |
| `bash-dispatch` | chaque commande shell | aucune validation écrite par le shell (`gate_passed` dans un `STATUS.md`), `cat` et `diff` bornés, réécritures économes en jetons via `rtk`, un garde-fou git facultatif |
| `session-cleanup` | le début de session | supprime les fichiers temporaires de la session |
| `session-doctor` | le début de session | lance `orkeon-bench doctor` en mode silencieux et indique à Claude les vérifications en échec, pour qu'il le dise avant de s'appuyer dessus ; muet quand tout va bien |
| `workshop-language` | le début de session | quand l'atelier a une langue (`.claude/local/language`), indique à Claude de converser dans cette langue et d'y écrire le texte des cahiers ; muet sinon |
| `workshop-profile` | le début de session | quand le dossier a un autre profil que `user`, indique à Claude, en une ligne, ce profil et ses packs ; muet sur `user` |
| `dev-batch-guard` | la ligne que vous tapez, chaque lancement de skill | une deuxième tranche `/dev-implement` dans la même session — faites d'abord `/clear` ; la correction d'une tranche close passe, et le même lancement répété aussi. Inactif sauf si le pack `dev` est actif |
| `context-log` | chaque fichier d'instructions qui entre dans le contexte | rien n'est refusé : une ligne par `CLAUDE.md`, règle ou import chargé, avec sa taille, dans `.claude/local/context.log`. Inactif sauf si le pack `usage` est actif |
| `clear-nudge` | la ligne que vous tapez | rien n'est refusé : une ligne quand le contexte que le tour suivant renverra dépasse 150 000 jetons, puis 300 000…, pour suggérer `/clear`. Inactif sauf si le pack `usage` est actif |

Leur comportement exact, leurs limites et leurs réglages sont décrits dans le
[README du harnais](../../../.devcontainer/harness/README.md) (en anglais).

Les vérifications d'une équipe (`check_crew.py`, `check_team.py`, et `orkeon-bench scaffold` pour les points
de montage) ajoutent ce que les hooks ne peuvent pas voir : un point de montage lié à un dossier que les agents
de l'équipe ne doivent jamais atteindre, un secret ou un réglage valable pour toute la machine dans le fichier
de réglages d'une équipe, un fichier de réglages qu'Orkeon trouverait de lui-même au-dessus des crews, l'outil
`shell_command` confié à un agent ; et, dans l'image, l'équipe telle qu'Orkeon Studio la lit, grâce à
`orkeon-studio-check` :

```bash
orkeon-studio-check [--authorized <appsettings.json>] [<team folder or slug>...]
```

Sans argument, il vérifie toutes les équipes de l'atelier ; `--authorized` prend une copie des réglages de
Studio (`%APPDATA%\Orkeon\appsettings.json`), dont il lit les « Dossiers autorisés » (Authorized folders)
comme le fait Studio — sans cette option, tout dossier situé hors d'une équipe est signalé comme refusé.
Code de sortie 0 quand toutes les équipes passent, 1 quand l'une d'elles échoue, 2 en cas d'erreur
d'utilisation. Dans le conteneur, il compare les chemins en tenant compte de la casse, là où Studio sous
Windows l'ignore, et il ne voit pas les attributs Caché et Système de Windows.

## Règles

Une règle regroupe les conventions d'un type de fichier ; elle n'est chargée que lorsqu'un tel fichier est lu
ou modifié.

| Règle | Chargée pour |
|---|---|
| `orkeon-yaml` | les crews YAML (`teams/*/crew/**/*.yaml`), les agents de la bibliothèque |
| `orkeon-ts` | les crews et les outils TypeScript |
| `orkeon-csharp` | les outils et les crews C# |
| `team-tests` | `tests/<slug>/`, `library/datasets/` |
| `workbook` | `workbooks/<slug>/` |
| `markdown-output` | tout fichier Markdown |
| `bench-ts` | les sources de `orkeon-bench` |

## Gabarits et documents de référence

- `.claude/templates/` contient la forme de chaque document de travail : `NEED.md`, `ACCEPTANCE.md`,
  `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md`, `STATUS.md`, `DECISION.md`, `REPORT.md`, `ANALYSIS.md`,
  `FIX-PLAN.md`, le manifeste de tentative, `report.schema.json`, `bench.config.json`, `scenario.json`, le
  manifeste de jeu de données, et le `mounts.json` générique.
- `references/` contient les documents que Claude lit avant d'agir : Orkeon (`orkeon/` : la référence, le
  schéma YAML, le langage TypeScript, la structure d'équipe attendue par Studio, les modèles, la reprise et la
  mémoire, C#), la méthode (`process/` : le déroulé du travail, les artefacts, une liste de contrôle par
  validation), la conception d'une équipe (`design/`), sa fiabilité dans la durée (`reliability/`), les tests
  (`testing/`) ; les vôtres vont dans `references/local/`. `references/README.md` les répertorie.

## Profils et packs

Le harnais est découpé en **packs** — des skills, des sous-agents, des règles et les interrupteurs qui
activent certains hooks —, et un **profil** est une liste de packs. Le profil décide de ce qui est déployé
dans le dossier où travaille Claude Code, son **espace** : un atelier, ou la copie de travail git d'un dépôt
(un espace **source**). Un dossier a le profil `user` tant que vous n'en choisissez pas un autre, et un
atelier en `user` reçoit le harnais que décrit cette page, exactement comme avant l'arrivée des profils.

| Profil | Packs | Atelier | Copie de travail | Pour |
|---|---|:-:|:-:|---|
| `user` | core, workshop | ✓ | — | qui construit des équipes Orkeon dans un atelier : le harnais ci-dessus |
| `contrib` | core, workshop, source, contrib, usage | ✓ | ✓ | un contributeur extérieur : reproduit un échec dans un atelier et ouvre le ticket, valide un correctif ; prépare une pull request dans une copie de travail |
| `dev` | core, source, dev, quality, usage | — | ✓ | un développeur du cœur du dépôt |
| `release` | core, source, quality, release, docs-audit | — | ✓ | qui publie ses versions |
| `docs` | core, source, docs-audit | — | ✓ | qui garde sa documentation fidèle au code |
| `all` | tous les packs | ✓ | ✓ | le mainteneur qui touche à tout |
| `custom:<pack>,<pack>` | les packs que vous nommez, et core | ✓ | ✓ | tout autre besoin |

- `core` fait partie de tous les profils : tous les hooks, `settings.json`, `/workshop-profile` et les évals.
  `workshop` est le harnais de l'atelier ; `source` est une règle pour une copie de travail.
- Un pack qui ne convient pas à l'espace est laissé de côté : `contrib` dans une copie de travail n'a pas le
  pack `workshop`, `all` dans un atelier n'a pas `dev`. Un profil qui n'est pas fait pour l'espace — `dev`
  dans un atelier, `user` dans une copie de travail — est refusé, avec la liste des profils qui conviennent.
- Dans une copie de travail, un **pack de dépôt** rejoint un profil qui contient `contrib`, `dev`,
  `quality`, `release` ou `docs-audit` quand le dépôt distant `origin` est le sien : `repo-orkeon` pour
  Orkeon lui-même, `repo-orkeon-workshop` pour ce projet. Il contient ce qui est propre à ce dépôt — ses
  commandes, ses listes de contrôle, ses règles d'organisation —, que les skills génériques lisent au lieu
  de le supposer ; dans tout autre dépôt, ils demandent ce qui leur manque.

### Choisir un profil

- **Au premier démarrage d'un conteneur** : `-e HARNESS_PROFILE=dev` sur `docker run`
  ([variables](./configuration.md#variables-de-limage)). Cela ne vaut que pour un dossier qui n'a pas
  encore de profil.
- **À tout moment ensuite** : `/workshop-profile` dans Claude Code, ou `workshop-profile` dans un terminal
  du conteneur — la porte d'entrée d'une copie de travail qui n'a pas encore de harnais.

```bash
workshop-profile --list              # les profils, et ceux qui conviennent à ce dossier
workshop-profile                     # le profil actif, ses packs et ses interrupteurs (--show)
workshop-profile dev --dry-run       # ce qu'un changement écrirait, sans rien écrire
workshop-profile dev                 # change de profil, puis synchronise le harnais
workshop-profile custom:contrib,usage
```

Un changement de profil écrit `.claude/local/profile` (une ligne), seulement les clés qui lui appartiennent
dans `.claude/settings.local.json` — les interrupteurs `HARNESS_*` de ses packs et la visibilité des skills
du harnais (`skillOverrides`) —, et `.claude/local/profile.owned.json`, la liste de ces clés, pour que le
changement suivant défasse exactement celles-là ; puis il déploie les packs. Les interrupteurs s'appliquent
aussitôt ; quand des fichiers ont changé, il demande de redémarrer Claude Code (`/exit`, puis `claude`) pour
charger les skills, les sous-agents et les règles du profil. Ces fichiers appartiennent au changement de
profil : ne les modifiez pas à la main. Un profil à vous est un fichier `.claude/local/profiles/<name>.yaml`,
au format décrit dans le [README des profils](../../../.devcontainer/harness/profiles/README.md) (en anglais).

### Dans une copie de travail

Montez la copie de travail là où irait un atelier (`/workspace`, ou `ORKEON_WORKSHOP`) et choisissez un
profil fait pour elle : `dev`, `release`, `docs`, `contrib`, `all` ou un profil `custom`. Le harnais y :

- **n'écrit rien de ce que git suit** : un déploiement qui écrirait un seul fichier suivi est refusé en
  entier, et nomme le fichier ;
- **garde `git status` propre** : ce qu'il a déployé, `.claude/local/`, `.claude/settings.local.json` et
  `todo/` sont listés dans un bloc de `.git/info/exclude`, réécrit à chaque démarrage — le `.gitignore` du
  dépôt n'est pas touché ;
- **ne déploie pas d'atelier** : ni `CLAUDE.md`, ni `teams/` ou `workbooks/`, ni skill `team-*` ; les hooks
  faits pour un atelier (`run-gate`, `guard-phase`, `team-approve`, `status-check`, `session-doctor`,
  `workshop-language`) restent muets, et le `CLAUDE.md` et les conventions du dépôt régissent son code ;
- **range le travail sous `todo/`** : une spécification, un plan, un audit, un rapport de qualité, le
  dossier d'une version, le texte d'un ticket ou d'une pull request vont dans `todo/<code>/` ;
- **vous confie les commandes** : Claude ne fait ni commit, ni push, ni étiquette, n'ouvre ni ticket ni pull
  request ; il prépare le message ou le texte et vous donne la commande à taper.

### Les skills des packs

Chacun ne se lance que lorsque vous le tapez, sauf `/token-usage`, que Claude peut aussi utiliser quand
vous demandez ce qu'a coûté une session.

| Pack | Skills | Ce qu'ils font |
|---|---|---|
| `contrib` | `/contrib-issue`, `/contrib-validate`, `/contrib-pr` | consigner un échec reproduit dans un atelier (`contrib/<slug>/RECORD.md`) et rédiger son ticket sur le modèle du dépôt ; valider un correctif proposé — Orkeon construit depuis la branche de la pull request, la reproduction relancée ; préparer une pull request depuis une copie de travail : la liste de contrôle de contribution, la construction et les tests, `todo/pr-<slug>/PR.md` |
| `dev` | `/dev-spec`, `/dev-plan`, `/dev-implement`, `/dev-verify`, `/dev-learn`, `/dev-unit-tests`, `/dev-integration-tests` | une spécification testable, puis un plan découpé en tranches, chacun mis à l'épreuve par le sous-agent `adversarial-reviewer` ; une tranche par session en TDD strict (`dev-test-author` écrit les tests qui échouent, `dev-implementer` les fait passer) ; un audit en lecture seule de chaque tranche par `dev-auditor` ; les écarts que les audits retrouvent sans cesse transformés en règles ; tests unitaires et d'intégration dans les conventions du dépôt |
| `quality` | `/quality-report` | la construction, les tests, la couverture et Sonar (quand un serveur est joignable) du dépôt, dans un rapport vérifié, `todo/quality-<date>/` |
| `release` | `/release-prepare`, `/release-evidence`, `/release-verify` | une version vérifiée prête à étiqueter, ses notes rédigées ; les preuves d'installation d'une version candidate ; ce qui a été publié, vérifié canal par canal — le tout dans `todo/release-<version>/`, la commande d'étiquetage vous étant confiée |
| `docs-audit` | `/docs-audit` | la documentation confrontée au code, dans un sous-agent à part : les vérifications de documentation du dépôt, les liens et les ancres, chaque affirmation des pages modifiées ; `todo/docs-audit-<date>/REPORT.md`, sans rien corriger |
| `usage` | `/token-usage` | ce qu'a coûté une session et ce qui a rempli son contexte, lu avec `cc-usage`, une commande de l'image ; active les hooks `context-log` et `clear-nudge` |
| `repo-orkeon-workshop` | `/ws-check`, `/ws-docs`, `/ws-image`, `/ws-migrate` | pour la copie de travail de ce projet : ses vérifications, sa documentation bilingue, la construction de l'image et le suivi de la CI après un push, la migration vers le dernier `main` d'Orkeon |
| `repo-orkeon` | — | pour la copie de travail d'Orkeon : ses règles d'organisation, et les commandes, listes de contrôle et canaux que lisent les skills génériques |

## Évals

Les évals vérifient que les hooks et les scripts font exactement ce qu'attend le reste du harnais. Elles
s'exécutent à chaque construction de l'image, et vous pouvez les lancer dans l'atelier :

```bash
bash /workspace/.claude/evals/run.sh
```

Le script affiche `PASS` ou `FAIL` pour chaque cas, puis le total (`… passed, 0 failed`, avec les cas ignorés
comptés à part — un cas est ignoré quand un outil dont il a besoin, comme `orkeon-bench`, est absent), et se
termine avec un code de sortie non nul au moindre échec ; avec `HARNESS_EVALS_STRICT=1`, comme lors de la
construction de l'image, un cas ignoré compte aussi comme un échec.

## Interrupteurs

Les hooks se règlent avec des variables `HARNESS_*`, dans la section `env` de `.claude/settings.local.json`,
que l'image n'écrase jamais ; `/workshop-profile` n'y écrit que les interrupteurs de ses packs :

| Interrupteur | Effet |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | des hôtes supplémentaires considérés comme locaux par la barrière de budget et par le banc (une machine à GPU de votre réseau) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | si la barrière de budget lit les fichiers de réglages d'Orkeon ; quel fichier remplace pour elle `~/.config/Orkeon/appsettings.json` ; où elle consigne les exécutions |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | désactiver le garde-fou des clés, changer ses dossiers, autoriser un motif, ajouter des motifs |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | le rappel de mise à jour de `STATUS.md` |
| `HARNESS_TEAM_APPROVE` | `0` arrête l'enregistrement de vos lignes `/team-approve …` : rien n'est alors validé, et Claude le dit |
| `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` | désactiver le diagnostic de début de session ; le temps qu'il peut prendre, en secondes (20) |
| `HARNESS_WORKSHOP_LANGUAGE` | `0` arrête le rappel de la langue de l'atelier en début de session |
| `HARNESS_WORKSHOP_PROFILE` | `0` arrête la ligne qui nomme le profil en début de session |
| `HARNESS_DEV_BATCH_GUARD` | `1` refuse une deuxième tranche `/dev-implement` dans une même session ; le pack `dev` le règle |
| `HARNESS_CONTEXT_LOG`, `HARNESS_CLEAR_NUDGE` | `1` active le journal des fichiers d'instructions chargés et la suggestion de `/clear` ; le pack `usage` règle les deux |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | les limites de lecture : les lignes et les octets d'une lecture complète, les lignes d'un diff, la longueur du plan fourni à la place, et la taille d'un plan, en proportion du fichier, à partir de laquelle le fichier est jugé plat (un plan n'aiderait pas) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | au bout de combien de fichiers lus directement la session principale se voit rappeler de déléguer (6 ; puis à chaque doublement) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | la longueur des rapports des sous-agents ; le modèle des sous-agents d'exploration |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_*`, `HARNESS_RTK_BIN` | les modules shell |

Pour le conteneur lui-même : `HARNESS_SYNC=off` désactive la synchronisation au démarrage, et
`HARNESS_PROFILE` nomme le premier profil d'un dossier ([configuration](./configuration.md)).

Suite : [Dépannage](./troubleshooting.md).
