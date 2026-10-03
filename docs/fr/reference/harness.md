# Le harnais

*[English](../../reference/harness.md) · Français*

Le harnais est ce qui fait travailler Claude Code à la manière de l'atelier. À chaque démarrage, l'image le
déploie dans les dossiers `.claude/`, `references/` et `library/examples/` de l'atelier. Chaque session charge
`CLAUDE.md`, qui importe le point d'entrée `.claude/harness/HARNESS.md` : l'organisation des dossiers, la
méthode et les règles du jeu, en quelques écrans.

## Skills

Un skill est une procédure prête à l'emploi que Claude suit quand votre demande y correspond, ou quand vous
tapez son nom après un `/`.

| Skill | État | Ce qu'il fait |
|---|---|---|
| `orkeon-tour` | disponible | une visite guidée interactive de l'atelier, avec des mots simples, adaptée à votre niveau |
| `orkeon-crew-yaml` | disponible | conçoit, écrit et vérifie une équipe YAML ([guide](../guides/yaml-team.md)) |
| `orkeon-crew-typescript` | disponible | la même chose pour une équipe TypeScript dotée d'outils sur mesure ([guide](../guides/typescript-team.md)) |
| `orkeon-update` | disponible | met à jour Orkeon et Ollama dans le conteneur ([Mettre à jour](../guides/updating.md)) |
| `clean-restore` | disponible | nettoie les dossiers `bin/` et `obj/` d'un projet .NET et restaure ses paquets |
| `team-init`, `team-need`, `team-decision`, `team-status` | prévus, lot 2 | démarrer une équipe, rédiger son besoin, consigner une décision, dire où elle en est |
| `team-test-plan`, `team-design` | prévus, lot 3 | critères, indicateurs et invariants ; la conception et son plan |
| `team-tests` | prévu, lot 5 | jeux de données, scénarios et juges, écrits avant l'équipe |
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
que soit le mode de permission** — et le `.claude/settings.local.json` que le harnais crée dans l'atelier
dispense Claude Code de demander la permission (`"defaultMode": "bypassPermissions"`), si bien que les hooks
sont les garde-fous ; retirez-en `defaultMode` pour que Claude Code vous la demande de nouveau. Un refus dit
toujours pourquoi, et quoi faire à la place.

| Hook | Surveille | Refuse ou fait |
|---|---|---|
| `run-gate` | chaque `orkeon run`, `orkeon-harness-run`, `./run.sh`, `orkeon-bench run` | une exécution sur un modèle distant sans accord enregistré ; consigne chaque exécution dans `.claude/run-log.tsv` |
| `guard-phase` | chaque écriture de fichier | les écritures dans un dossier qui ne correspond pas à la phase : `crew/` seulement pendant la construction, `tests/<slug>/` jamais pendant celle-ci, `runs/` jamais, une tentative close jamais ; chaque sous-agent est tenu à son périmètre, et aucun n'écrit les réglages d'une équipe, `settings/<slug>/` |
| `secret-guard` | chaque écriture de fichier | une chaîne qui a la forme d'une clé, sous `teams/`, `workbooks/`, `tests/`, `settings/`, `mounts.*/`, `library/`, `references/` |
| `delegation-guard` | chaque lancement de sous-agent | une délégation sans description ou sans modèle explicite ; ajoute le contrat de rapport |
| `subagent-report-shape` | la fin d'un sous-agent | renvoie un rapport auquel manquent ses lignes obligatoires |
| `status-check` | la fin d'un tour | après un skill `team-*`, rappelle une fois de mettre à jour `STATUS.md` |
| `read-bounds` | chaque lecture de fichier | une lecture non bornée d'un gros fichier, et fournit son plan à la place |
| `bash-dispatch` | chaque commande shell | `cat` et `diff` bornés, réécritures économes en jetons via `rtk`, un garde-fou git facultatif |
| `session-cleanup` | le début de session | supprime les fichiers temporaires de la session |

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
que l'image n'écrase jamais :

| Interrupteur | Effet |
|---|---|
| `HARNESS_LOCAL_LLM_HOSTS` | des hôtes supplémentaires considérés comme locaux par la barrière de budget et par le banc (une machine à GPU de votre réseau) |
| `HARNESS_RUN_GATE_READ_SETTINGS`, `HARNESS_ORKEON_SETTINGS`, `HARNESS_RUN_LOG` | si la barrière de budget lit les fichiers de réglages d'Orkeon ; quel fichier remplace pour elle `~/.config/Orkeon/appsettings.json` ; où elle consigne les exécutions |
| `HARNESS_SECRET_GUARD`, `HARNESS_SECRET_GUARD_SCOPE`, `HARNESS_SECRET_ALLOW`, `HARNESS_SECRET_GUARD_EXTRA` | désactiver le garde-fou des clés, changer ses dossiers, autoriser un motif, ajouter des motifs |
| `HARNESS_STATUS_CHECK`, `HARNESS_STATUS_CHECK_EXEMPT`, `HARNESS_STATUS_CHECK_BASH` | le rappel de mise à jour de `STATUS.md` |
| `HARNESS_READ_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_BYTES`, `HARNESS_DIFF_BOUNDS_LINES`, `HARNESS_READ_BOUNDS_OUTLINE`, `HARNESS_BOUNDS_FLAT_PCT` | les limites de lecture : les lignes et les octets d'une lecture complète, les lignes d'un diff, la longueur du plan fourni à la place, et la taille d'un plan, en proportion du fichier, à partir de laquelle le fichier est jugé plat (un plan n'aiderait pas) |
| `HARNESS_DELEGATION_NUDGE_THRESHOLD` | au bout de combien de fichiers lus directement la session principale se voit rappeler de déléguer (6 ; puis à chaque doublement) |
| `HARNESS_REPORT_MAX_LINES`, `HARNESS_EXPLORE_MODEL` | la longueur des rapports des sous-agents ; le modèle des sous-agents d'exploration |
| `HARNESS_GUARD_GIT`, `HARNESS_BATCHING_*`, `HARNESS_RTK_BIN` | les modules shell |

Pour le conteneur lui-même : `HARNESS_SYNC=off` désactive la synchronisation au démarrage
([configuration](./configuration.md)).

Suite : [Dépannage](./troubleshooting.md).
