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
tapez son nom après un `/`. Les skills `team-*`, `deploy`, `workshop-language` et `workshop-profile` ne se
lancent que lorsque vous les tapez.

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
| `team-build` | prévu | l'équipe, tranche par tranche |
| `team-run`, `team-review` | prévus | une tentative et son rapport ; la revue et son verdict |
| `orkeon-tool-csharp`, `orkeon-crew-csharp` | prévus | outils et équipes en C# |
| `team-release` | prévu | README, carte et lanceurs réalignés, étiquette de version proposée |

## Sous-agents

La session principale confie du travail à des sous-agents, avec un contrat compact, et juge ce qu'ils
rapportent.

| Sous-agent | Fait | Écrit |
|---|---|---|
| `team-test-author` | les tests d'une équipe, avant que l'équipe existe | `tests/<slug>/`, jamais `crew/` |
| `team-implementer` | une tranche d'une équipe, pour que ses tests passent | `crew/`, les outils sur mesure — jamais un test |
| `dataset-synthesizer` | des jeux de données synthétiques : cas nominaux, cas limites, variantes de langue et cas hostiles | les jeux de données |
| `team-reviewer` | audite une tentative : ce qui a été livré, puis sa conformité au plan ; rend le verdict | sa mémoire seulement, `.claude/agent-memory/team-reviewer/` |
| `run-analyst` | résume une exécution : chronologie, appels d'outils, erreurs, jetons, coût | rien |
| `judge` | note des sorties selon une grille d'évaluation versionnée | rien |

Les packs apportent leurs propres sous-agents : `dev-test-author`, `dev-implementer`,
`dev-auditor-conformance` (la passe mécanique d'un audit, D72), `dev-auditor` (sa passe de jugement),
`adversarial-reviewer` et `dev-batch` (le contexte où tourne une tranche, dans son propre worktree, pour
`/dev-batches`, D70) avec le pack `dev`, et les trois dans lesquels s'exécutent les skills « fork » —
`ws-runner` (`repo-orkeon-workshop`, en lecture seule), `contrib-validator` (`contrib`) et `quality-runner`
(`quality`). Comme `team-reviewer`, `dev-auditor` et `adversarial-reviewer` gardent une mémoire du dépôt
sous `.claude/agent-memory/<agent>/` : ce qui épargne une recherche à l'audit suivant, en quelques lignes
datées — jamais un verdict, un tableau d'écarts, du code ou un secret.

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
| `memory-scope` | chaque écriture de fichier par un sous-agent | une écriture, par un agent dont la charte n'a ni Write ni Edit, hors de son dossier de mémoire, `.claude/agent-memory/<agent>/` : la mémoire est le seul endroit où il écrit, un constat va dans son rapport |
| `make-executable` | chaque écriture de fichier, après coup | rien n'est refusé : un script que Claude vient d'écrire (`*.sh`, ou `*.py` avec shebang) reçoit aussitôt son bit exécutable ; un script écrit avec des fins de ligne Windows est signalé à Claude, qui le réécrit |
| `delegation-guard` | chaque lancement de sous-agent | une délégation sans description ou sans modèle explicite ; ajoute le contrat de rapport ; avec le pack `dev`, un agent générique chargé d'implémenter une tranche ou le plan de la chaîne dev — une tranche tourne dans un agent `dev-batch` (D75) |
| `subagent-report-shape` | la fin d'un sous-agent | renvoie un rapport auquel manquent ses lignes obligatoires |
| `status-check` | la fin d'un tour | après un skill `team-*`, rappelle une fois de mettre à jour `STATUS.md` (`team-status` et `team-approve` en sont dispensés) |
| `read-bounds` | chaque lecture de fichier | une lecture non bornée d'un gros fichier, et fournit son plan à la place — la lecture entière voulue se dit par `offset` 1 et une `limit` couvrant le fichier, jamais par le même Read répété ; avec le pack `dev`, tout fichier source ou de test au pilote d'une tranche (D75) |
| `bash-dispatch` | chaque commande shell | aucune validation écrite par le shell (`gate_passed` dans un `STATUS.md`), `cat` et `diff` bornés (un vidage voulu entier se dit par `HARNESS_FORCE_READ=1` devant la commande, jamais par la répétition ; le refus d'un fichier de code nomme `ast-grep outline` et `rtk read -m 40` avant toute plage), un `grep` ou `rg` récursif de plus de quatre motifs renvoyé sous sa forme `-l`, aucun fichier source ou de test au pilote d'une tranche (pack `dev`, D75), réécritures économes en jetons via `rtk`, un garde-fou git facultatif ; dans une copie de travail dont le pack de dépôt les nomme, une suite d'intégration lancée entière (`dotnet test` sur `Orkeon.sln` avec `Category=Integration` ou `Slow` sans restriction : un seul projet ou `FullyQualifiedName~` à la place), et l'`orkeon` de l'image dans une copie de travail d'Orkeon (le CLI de la copie de travail s'exécute depuis ses sources : `dotnet run --project src/scripting/Orkeon.Scripting.Cli -- …`, cité par le refus) |
| `session-cleanup` | le début de session | supprime les fichiers temporaires de la session |
| `session-doctor` | le début de session | dans un atelier, lance `orkeon-bench doctor` en mode silencieux et indique à Claude les vérifications en échec, pour qu'il le dise avant de s'appuyer dessus ; dans une copie de travail git, vérifie le harnais lui-même — les binaires dont ses hooks ont besoin (`jq`, `git`, `python3`, PyYAML, `ast-grep` avec le pack `dev`), les hooks enregistrés, chaque `repo.yaml` lisible, le bloc de `.git/info/exclude`, le dossier de mémoire des auditeurs accessible en écriture ; muet quand tout va bien |
| `workshop-language` | le début de session | quand l'atelier a une langue (`.claude/local/language`), indique à Claude de converser dans cette langue et d'y écrire le texte des cahiers ; muet sinon |
| `workshop-profile` | le début de session | quand le dossier a un autre profil que `user`, indique à Claude, en une ligne, ce profil et ses packs ; muet sur `user` |
| `dev-batch-guard` | la ligne que vous tapez, chaque lancement de skill | une deuxième tranche `/dev-implement` en ligne dans le même contexte — `/dev-batches` en lance plusieurs, chacune dans son agent ; `/clear` d'abord pour une de plus ici ; la correction d'une tranche close passe, et le même lancement répété aussi. Dans un sous-agent il lit le transcript de cet agent, jamais celui de la conversation principale (D70). Inactif sauf si le pack `dev` est actif |
| `worktree-create` | chaque worktree que Claude Code crée — `claude --worktree`, un sous-agent dans son propre worktree comme `dev-batch`, une session d'arrière-plan | rien n'est refusé : le crée lui-même sous `.claude/worktrees/<nom>`, depuis la branche où vous êtes (jamais la branche par défaut), sur `<préfixe>/<nom>` quand le pack de dépôt nomme un motif de branche (`feature/<nom>` pour Orkeon), et relie les dossiers non suivis partagés du dépôt (`repo.yaml` `layout.shared`, `packages` pour Orkeon ; votre `HARNESS_WORKTREE_SHARED`) à ceux de la copie principale, pour qu'une seule restauration serve tous les worktrees ; un dossier que git suit est refusé et rien n'est créé (D70) |
| `worktree-remove` | la suppression d'un worktree créé par le hook ci-dessus | une suppression qui perdrait du travail : des fichiers non committés, ou des commits qu'aucune autre branche ne porte ; sinon retire les liens, le worktree et sa branche |
| `dev-compact` | la compaction du contexte, et le début de session qui la suit | rien n'est refusé : avant la compaction, écrit l'état d'une tranche `/dev-implement` ouverte — les étapes ouvertes de la fiche, les cycles clos, les délégations faites, l'arbre de travail — dans `todo/<code>/<CODE>-STATE-F<n>.md` ; après, indique à Claude de lire d'abord ce fichier et de reprendre à la première étape ouverte. Inactif sauf si le pack `dev` est actif |
| `context-log` | chaque fichier d'instructions qui entre dans le contexte | rien n'est refusé : une ligne par `CLAUDE.md`, règle ou import chargé, avec sa taille, dans `.claude/local/context.log`. Inactif sauf si le pack `usage` est actif |
| `clear-nudge` | la ligne que vous tapez ; une délégation faite dans un sous-agent | rien n'est refusé : une ligne quand le contexte que le tour suivant renverra dépasse 150 000 jetons, puis 300 000…, pour suggérer `/clear` ; dans un agent `dev-batch`, lue sur la transcription propre de l'agent, le chiffre à rapporter. Inactif sauf si le pack `usage` est actif |

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
| `orkeon-yaml` | `teams/*/crew/**/*.yaml` et `*.yml`, `library/agents/**/*.yaml`, `library/examples/teams/*/crew/**/*.yaml` |
| `orkeon-ts` | `teams/*/crew/**/*.ts`, `library/tools/ts/**`, `library/examples/teams/*/crew/**/*.ts` |
| `orkeon-csharp` | `library/tools/csharp/**`, `teams/*/crew/**/*.cs` et `*.csproj`, `library/examples/teams/*/crew/**/*.cs` |
| `team-tests` | `tests/*/**`, `library/datasets/**`, `library/examples/tests/*/**` |
| `workbook` | `workbooks/*/**`, `library/tools/csharp/*/workbook/**`, `library/examples/workbooks/*/**` |
| `markdown-output` | tout fichier Markdown (`**/*.md`) |
| `bench-ts` | les sources de `orkeon-bench` (`.devcontainer/bench/**`, `bench/**`) |

## Gabarits et documents de référence

- `.claude/templates/` contient la forme de chaque document de travail : `NEED.md`, `ACCEPTANCE.md`,
  `TEST-PLAN.md`, `DESIGN.md`, `PLAN.md`, `STATUS.md`, `DECISION.md`, `REPORT.md`, `ANALYSIS.md`,
  `FIX-PLAN.md`, le manifeste de tentative, `report.schema.json`, `bench.config.json`, `scenario.json`, le
  manifeste de jeu de données, et le `mounts.json` générique.
- `references/` contient les documents que Claude lit avant d'agir : Orkeon (`orkeon/` : la référence, la
  ligne de commande — ses commandes, ses codes de sortie et son protocole d'événements (`cli.md`) —, le
  schéma YAML, le langage TypeScript, la structure d'équipe attendue par Studio, les modèles, la reprise et la
  mémoire, C#), la méthode (`process/` : le déroulé du travail, les artefacts, une liste de contrôle par
  validation), la conception d'une équipe (`design/`), sa fiabilité dans la durée (`reliability/`), les tests
  (`testing/`), les conventions du dépôt Orkeon (`csharp/`) et la Clean Architecture pour TypeScript
  (`typescript/`) ; les vôtres vont dans `references/local/`. `references/README.md` les répertorie.

## Profils et packs

Le harnais est découpé en **packs** — des skills, des sous-agents, des règles et les interrupteurs qui
activent certains hooks —, et un **profil** est une liste de packs. Le profil décide de ce qui est déployé
dans le dossier où travaille Claude Code, son **espace** : un atelier, ou la copie de travail git d'un dépôt
(un espace **source**). Un dossier a le profil `user` tant que vous n'en choisissez pas un autre, et un
atelier en `user` reçoit le harnais que décrit cette page, exactement comme avant l'arrivée des profils. À
quoi sert chaque profil, étape par étape : les [pages des workflows](../workflows/overview.md) ; cette
section en est la mécanique.

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
aussitôt ; quand des fichiers ont changé, il demande de redémarrer Claude Code (`/exit`, puis `workshop`, ou
`claude` dans une copie de travail) pour charger les skills, les sous-agents et les règles du profil. Ces fichiers appartiennent au changement de
profil : ne les modifiez pas à la main. Un profil à vous est un fichier `.claude/local/profiles/<name>.yaml`,
au format décrit dans le [README des profils](../../../.devcontainer/harness/profiles/README.md) (en anglais).

### Dans une copie de travail

Montez la copie de travail là où irait un atelier (`/workspace`, ou `ORKEON_WORKSHOP`) et choisissez un
profil fait pour elle : `dev`, `release`, `docs`, `contrib`, `all` ou un profil `custom`. Le harnais y :

- **n'écrit rien de ce que git suit** : un déploiement qui écrirait un seul fichier suivi est refusé en
  entier, et nomme le fichier ;
- **garde `git status` propre** : ce qu'il a déployé, `.claude/local/`, `.claude/.harness-*`,
  `.claude/settings.local.json`, `.claude/agent-memory/` et `todo/` sont listés dans un bloc de `.git/info/exclude`, réécrit à chaque démarrage — le `.gitignore` du
  dépôt n'est pas touché ;
- **ne déploie pas d'atelier** : ni `CLAUDE.md`, ni `teams/` ou `workbooks/`, ni skill `team-*` ; les hooks
  faits pour un atelier (`run-gate`, `guard-phase`, `team-approve`, `status-check`, `workshop-language`)
  restent muets, `session-doctor` vérifie le harnais de la copie de travail au lieu d'une équipe, et le
  `CLAUDE.md` et les conventions du dépôt régissent son code ;
- **exécute le produit depuis ses sources** : dans une copie de travail d'Orkeon, l'`orkeon` du PATH est la
  construction que l'image embarque à son propre commit ; une commande qui l'exécute est refusée, et le
  refus cite la commande de la copie de travail, lue dans `repo.yaml`
  (`dotnet run --project src/scripting/Orkeon.Scripting.Cli -- …`) ;
- **range le travail sous le dossier de travail** : une spécification, un plan, un audit, un rapport de
  qualité, le dossier d'une version, le texte d'un ticket ou d'une pull request vont dans
  `<work>/<code>/`. `<work>` est `todo/` à la racine de la copie de travail, tenu hors de git, sauf si le
  pack du dépôt nomme un dossier du dépôt (`repo.yaml` `layout.work` et l'interrupteur `HARNESS_WORK_DIR`,
  la même valeur ; pour Orkeon `backstage/tasks/`, où vivent ses tâches et son backlog) : ce dossier
  appartient au dépôt, git le voit et c'est vous qui le validez. Vous pouvez en nommer un vous-même dans
  `.claude/settings.local.json`. La première ligne de la session dit lequel s'applique ; un dossier nommé
  mais absent de la copie de travail — un sous-module non extrait — retombe sur `todo/`, et la ligne le
  dit ; dans un worktree git lié qui ne l'a pas, c'est le dossier du worktree principal qui s'applique,
  nommé en chemin absolu (D69). Avant sa première écriture sous un dossier nommé par le dépôt, Claude lit le `CLAUDE.md` de
  ce dossier (ou de son sous-module), puisque Claude Code ne charge un `CLAUDE.md` imbriqué qu'à la
  première lecture ou écriture dans celui-ci. `todo/` dans cette page et dans les pages de workflows
  désigne ce défaut ;
- **committe et pousse ce qu'un workflow a produit** (D71) : les fichiers qu'une tranche a touchés, avec un
  message à la forme du dépôt (`contrib.commit`), sur une branche nommée comme le dépôt nomme les siennes,
  puis `git push` (`/dev-batches` diffère, D79 : ses agents committent sans jamais pousser, la conversation
  fusionne chaque tranche valide dans votre branche et pousse cette branche une seule fois) ; avec l'identité que git a déjà — sa configuration ou `workshop --git-identity` — et
  quand il n'en a pas, il s'arrête avant le commit et vous donne cette commande ou les deux lignes
  `git config` ; une pull request est ouverte, depuis `/dev-implement`, `/dev-verify`, `/dev-batches` et
  `/contrib-pr` pareillement, après `gh auth status` et après vous avoir demandé une fois
  (`HARNESS_PR_AUTO=1` l'ouvre sans demander), vers la branche par défaut du dépôt — une seule pour toute l'exécution de `/dev-batches`. Un tag, une publication, un ticket,
  un commentaire de pull request et la fusion d'une branche restent les vôtres : Claude les prépare et
  vous donne la commande ;
- **donne à un worktree ce qu'il lui faut** (D70) : un worktree que Claude Code demande — `claude
  --worktree`, les agents `dev-batch` de `/dev-batches` — est créé par le harnais sous
  `.claude/worktrees/<nom>`, depuis la branche où vous êtes, avec les dossiers non suivis partagés du dépôt
  (`layout.shared`, `packages` pour Orkeon) reliés à ceux de la copie principale plutôt que remplis à
  nouveau ; `bash .claude/scripts/worktree-create.sh --link <worktree>` fait de même pour un worktree que
  vous avez fait à la main, `--remove <worktree>` le retire avec sa branche une fois son travail committé
  ou fusionné (`/dev-batches` le fait en arrière-plan, `--background`, juste après avoir fusionné une
  tranche), `--space` liste l'espace libre, la taille d'un worktree construit (`layout.worktree_gb`) et
  chaque worktree, fusionné ou non ;
- **fait accepter le dossier par git** : une copie de travail montée depuis Windows appartient à root dans
  le conteneur, et git lancé en tant que `node` la refuse (« dubious ownership ») ; la synchronisation
  ajoute ce seul dossier au `safe.directory` de git au premier démarrage, et le dit dans une ligne
  `[harness] git:`.

### Les skills des packs

Chacun ne se lance que lorsque vous le tapez, sauf `/token-usage`, que Claude peut aussi utiliser quand
vous demandez ce qu'a coûté une session.

| Pack | Skills | Ce qu'ils font |
|---|---|---|
| `contrib` | `/contrib-issue`, `/contrib-validate`, `/contrib-pr` | consigner un échec reproduit dans un atelier (`contrib/<slug>/RECORD.md`) et rédiger son ticket sur le modèle du dépôt ; valider un correctif proposé — Orkeon construit depuis la branche de la pull request, la reproduction relancée ; préparer une pull request depuis une copie de travail : la liste de contrôle de contribution, la construction et les tests, `todo/pr-<slug>/PR.md` ; `/contrib-validate` s'exécute dans un sous-agent « fork » du pack, `contrib-validator` : la construction et la reproduction y restent, la conversation reçoit le rapport |
| `dev` | `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-batches`, `/dev-verify`, `/dev-learn`, `/dev-unit-tests`, `/dev-integration-tests` | une spécification testable — ou, pour un bogue, un refactor ou une amélioration de performance, une fiche faite de preuves (une reproduction exécutée, une mesure, ce qui ne doit pas changer) —, puis un plan découpé en tranches, chacun mis à l'épreuve par le sous-agent `adversarial-reviewer` ; une tranche par contexte en TDD strict (`dev-test-author` écrit les tests qui échouent, `dev-implementer` les fait passer), en ligne avec `/dev-implement` ou plusieurs à la fois avec `/dev-batches`, chacune dans un agent `dev-batch` dans son propre worktree, la conversation orchestrant et écrivant les fiches (D70) ; chaque tranche committée et poussée sur sa branche (D71) — ou, avec `/dev-batches`, committée en local et fusionnée dans votre branche, poussée une fois avec une seule pull request (D79) ; un audit en lecture seule de chaque tranche par `dev-auditor` ; les deux auditeurs gardent une mémoire du dépôt sous `.claude/agent-memory/` ; les écarts que les audits retrouvent sans cesse transformés en règles ; tests unitaires et d'intégration dans les conventions du dépôt |
| `quality` | `/quality-report` | la construction, les tests, la couverture et Sonar (quand un serveur est joignable) du dépôt, dans un rapport vérifié, `todo/quality-<date>/` ; s'exécute dans un sous-agent « fork » du pack, `quality-runner` : la sortie des commandes y reste, la conversation reçoit le rapport |
| `release` | `/release-prepare`, `/release-evidence`, `/release-verify` | une version vérifiée prête à étiqueter, ses notes rédigées ; les preuves d'installation d'une version candidate ; ce qui a été publié, vérifié canal par canal — le tout dans `todo/release-<version>/`, la commande d'étiquetage vous étant confiée |
| `docs-audit` | `/docs-audit` | la documentation confrontée au code, dans un sous-agent à part : les vérifications de documentation du dépôt, les liens et les ancres, chaque affirmation des pages modifiées ; `todo/docs-audit-<date>/REPORT.md`, sans rien corriger |
| `usage` | `/token-usage` | ce qu'a coûté une session et ce qui a rempli son contexte, lu avec `cc-usage`, une commande de l'image ; active les hooks `context-log` et `clear-nudge` |
| `repo-orkeon-workshop` | `/ws-check`, `/ws-docs`, `/ws-image`, `/ws-migrate` | pour la copie de travail de ce projet : ses vérifications, sa documentation bilingue, la construction de l'image et le suivi de la CI après un push, la migration vers le dernier `main` d'Orkeon ; les quatre s'exécutent dans un sous-agent « fork » du pack, `ws-runner`, en lecture seule : la sortie des commandes y reste, la conversation reçoit le rapport ; et ses règles pour le banc, la documentation et les hooks |
| `repo-orkeon` | — | pour la copie de travail d'Orkeon : ses règles d'organisation, et les commandes, listes de contrôle et canaux que lisent les skills génériques |

## Évals

Les évals vérifient que les hooks et les scripts font exactement ce qu'attend le reste du harnais. Elles
s'exécutent à chaque construction de l'image, et vous pouvez les lancer dans l'atelier :

```bash
bash /workspace/.claude/evals/run.sh
```

Le script affiche `PASS`, `FAIL` ou `SKIP` pour chaque cas, puis le total (`… passed, 0 failed`, avec les cas
ignorés comptés à part — un cas est ignoré, et dit pourquoi, quand un outil dont il a besoin, comme
`orkeon-bench`, est absent), et se termine avec un code de sortie non nul au moindre échec ; avec `HARNESS_EVALS_STRICT=1`, comme lors de la
construction de l'image, un cas ignoré compte aussi comme un échec. Chaque cas de hook est chronométré : un hook
dont la médiane sur ses cas dépasse `HARNESS_EVALS_LATENCY_MS` (1000 ms) fait échouer l'exécution, et le hook
le plus lent est affiché avant le total.

## Interrupteurs

Les hooks se règlent avec des variables `HARNESS_*`, dans la section `env` de `.claude/settings.local.json`,
que l'image n'écrase jamais ; `/workshop-profile` n'y écrit que les interrupteurs de ses packs :

| Interrupteur | Effet |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | des hôtes supplémentaires considérés comme locaux par la barrière de budget et par le banc (une machine à GPU de votre réseau) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | si la barrière de budget lit les fichiers de réglages d'Orkeon ; quel fichier remplace pour elle `~/.config/Orkeon/appsettings.json` ; où elle consigne les exécutions |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | désactiver le garde-fou des clés, changer ses dossiers, autoriser un motif, ajouter des motifs |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | le rappel de mise à jour de `STATUS.md` |
| `HARNESS_TEAM_APPROVE`, `HARNESS_TEAM_APPROVE_BENCH_TIMEOUT` | `0` arrête l'enregistrement de vos lignes `/team-approve …` : rien n'est alors validé, et Claude le dit ; le temps que peut prendre l'enregistrement d'une exécution payante par `orkeon-bench`, en secondes (20) |
| `HARNESS_SESSION_DOCTOR`, `HARNESS_SESSION_DOCTOR_TIMEOUT` | désactiver le diagnostic de début de session ; le temps qu'il peut prendre, en secondes (20) |
| `HARNESS_WORKSHOP_LANGUAGE` | `0` arrête le rappel de la langue de l'atelier en début de session |
| `HARNESS_WORKSHOP_PROFILE` | `0` arrête la ligne qui nomme le profil en début de session |
| `HARNESS_MAKE_EXECUTABLE` | `0` ne donne plus son bit exécutable à un script que Claude écrit |
| `HARNESS_MEMORY_SCOPE` | `0` laisse un agent dont la charte n'a ni Write ni Edit écrire hors de son dossier de mémoire, `.claude/agent-memory/<agent>/` |
| `HARNESS_DEV_BATCH_GUARD` | `1` refuse une deuxième tranche `/dev-implement` en ligne dans un même contexte, et un agent générique chargé d'implémenter une tranche ou le plan ; le pack `dev` le règle |
| `HARNESS_PILOT_GUARD` | `1` refuse au pilote d'une tranche — un agent `dev-batch`, ou la session principale tant qu'une tranche `/dev-implement` y est ouverte — tout fichier source ou de test, par le shell ou par Read ; le pack `dev` le règle (D75) |
| `HARNESS_GREP_PATTERNS_MAX` | au-delà de combien de motifs un `grep` ou `rg` récursif est renvoyé sous sa forme `-l` (4) ; `0` le désactive (D75) |
| `HARNESS_DEV_BATCHES_MAX` | combien d'agents `dev-batch` `/dev-batches` fait tourner à la fois (4), les autres tranches en file dans l'ordre du plan (D70) |
| `HARNESS_DEV_BATCH_MODEL` | le modèle des agents `dev-batch` que `/dev-batches` lance : vide (le défaut) garde l'`opus` de la charte, `sonnet` en essaie un moins cher ; les rôles qu'une tranche délègue gardent leurs modèles et l'audit reste sur Opus (D75) |
| `HARNESS_WORKTREE_SHARED` | d'autres dossiers non suivis qu'un worktree créé par le harnais relie à ceux de la copie principale, séparés par `:`, en plus de ceux que nomme le pack de dépôt (`repo.yaml` `layout.shared`) ; un dossier que git suit est refusé (D70) |
| `HARNESS_PR_AUTO` | `1` laisse le harnais ouvrir une pull request sans vous demander d'abord ; `0` demande une fois (D71) |
| `HARNESS_DEV_COMPACT` | `1` écrit l'état d'une tranche `/dev-implement` ouverte à chaque compaction du contexte, `todo/<code>/<CODE>-STATE-F<n>.md` ; le pack `dev` le règle |
| `HARNESS_INTEGRATION_PROJECTS`, `HARNESS_INTEGRATION_CATEGORIES` | les cibles dont la suite d'intégration ne s'exécute jamais entière (un projet de test, ou une solution), et les catégories qui font d'une exécution sur toute la solution une telle suite ; vides, le garde-fou est inactif ; le pack de dépôt les règle (`Orkeon.sln` ; `Integration Slow`) |
| `HARNESS_WORK_DIR` | le dossier de travail d'une copie de travail, relatif à sa racine, à la place de `todo/` : là où les skills des packs écrivent les artefacts d'un workflow ; vide, ou un dossier absent de la copie de travail, `todo/` s'applique ; le pack du dépôt le fixe (`backstage/tasks` pour Orkeon), ou vous (D69) |
| `HARNESS_GUARD_RESTORE` | `0` désactive le garde-fou du restore unique par tranche : un sous-agent de rôle de la chaîne dev (`dev-test-author`, `dev-implementer`, les deux auditeurs) se voit refuser un `dotnet restore`, et un `dotnet build` ou `dotnet test` sans `--no-restore` / `--no-build` sur un projet déjà restauré ; dans votre session ou un agent `dev-batch`, un second restore est seulement signalé (plan B, 2026-10-12) |
| `HARNESS_SOURCE_CLI_NAMES`, `HARNESS_SOURCE_CLI` | les commandes que l'image installe pour le produit, refusées dans une copie de travail de ce produit, et la commande qui exécute à la place la construction de la copie de travail ; vides, le garde-fou est inactif ; le pack de dépôt les règle (`orkeon` ; `dotnet run --project src/scripting/Orkeon.Scripting.Cli --`) |
| `HARNESS_CONTEXT_LOG`, `HARNESS_CLEAR_NUDGE` | `1` active le journal des fichiers d'instructions chargés et la suggestion de `/clear` ; le pack `usage` règle les deux |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | les limites de lecture : les lignes et les octets d'une lecture complète, les lignes d'un diff, la longueur du plan fourni à la place, et la taille d'un plan, en proportion du fichier, à partir de laquelle le fichier est jugé plat (un plan n'aiderait pas) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | au bout de combien de fichiers lus directement la session principale se voit rappeler de déléguer (6 ; puis à chaque doublement) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | la longueur des rapports des sous-agents ; le modèle des sous-agents d'exploration |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_WINDOW`, `HARNESS_BATCHING_SAMPLE`, `HARNESS_BATCHING_COOLDOWN`, `HARNESS_RTK_BIN` | les modules shell : `1` refuse toute commande git qui modifie quelque chose, Claude vous confie alors la commande (`0`) ; le rappel de regroupement des appels — au bout de combien de tours consécutifs à un seul appel d'outil il se déclenche (6), un appel sur combien il examine (3), combien de tours avec appels d'outils avant de se déclencher à nouveau (6) ; le binaire `rtk` qu'utilisent les réécritures (`rtk`) |

Pour le conteneur lui-même : `HARNESS_SYNC=off` désactive la synchronisation au démarrage, et
`HARNESS_PROFILE` nomme le premier profil d'un dossier ([configuration](./configuration.md)).

Suite : [Dépannage](./troubleshooting.md).
