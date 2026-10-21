# Les profils

*[English](../../reference/profiles.md) · Français*

Un **profil** nomme les packs du harnais — skills, sous-agents, règles, les interrupteurs de certains
hooks — que reçoit le dossier dans lequel Claude Code travaille. Tout dossier est en `user` tant que vous
ne choisissez pas autre chose : avec lui, un atelier reçoit le harnais exactement tel que le décrit
[Le harnais](./harness.md). Les autres profils existent pour qui travaille sur un dépôt — Orkeon, ce
projet, ou un autre — dans une **copie de travail git**. Cette page dit, pour chaque profil, à qui il
s'adresse, ce qu'il change et dans quel dossier il s'applique ; la mécanique (packs, interrupteurs, le
déploiement dans une copie de travail) est dans [Profils et packs](./harness.md#profils-et-packs), et le
pas à pas de chaque rôle dans [les workflows](../workflows/overview.md).

## Les profils

Les faits ci-dessous sont lus dans les définitions que livre l'image (`profiles/*.yaml`,
`profiles/packs/*.yaml` du harnais) et dans ce qui les déploie (`sync-harness.sh`, `workshop-profile.py`).

| Profil | Pour qui | Ce qu'il change | Dans quel dossier |
|---|---|---|---|
| `user` (par défaut) | qui **construit des équipes Orkeon** : un utilisateur d'Orkeon Studio, ou un développeur qui construit des équipes pour un projet à lui | le harnais de l'atelier : la méthode (`/team-init` … `/team-tests`, `/team-approve`), les générateurs, `orkeon-bench`, `/deploy`, `/orkeon-tour`, `/workshop-language`, les garde-fous de l'atelier | un **atelier** — un dossier d'équipes : un dossier qui contient `teams/`, un dossier où le harnais a déjà été déployé, ou un dossier vide. Git peut le versionner ([la règle](../concepts/workshop.md#dans-un-atelier-ou-dans-une-copie-de-travail-git)) |
| `contrib` | un **contributeur extérieur** à Orkeon ou à ce projet : reproduire une panne, la signaler, valider un correctif, préparer une pull request | le harnais de l'atelier **plus** le pack contrib (`/contrib-*` : l'issue, le correctif validé, la pull request) et le pack usage (`/token-usage`) | un atelier, **ou** la racine d'une copie de travail git (sans les packs de l'atelier là) |
| `dev` | un **développeur du cœur** d'un dépôt | la chaîne de développement dans une copie de travail : `/dev-spec`, `/dev-change`, `/dev-plan`, `/dev-implement`, `/dev-batches`, `/dev-verify`, les sous-agents de revue et de test, `/quality-report`, `/token-usage` ; **aucun skill d'équipe, pas de `teams/`** | la racine d'une copie de travail git seulement |
| `release` | qui **publie** un dépôt | les barrières qualité, le contrôle de préparation, le dossier de preuves, les notes, la vérification de ce qui a été publié, l'audit de la documentation | la racine d'une copie de travail git seulement |
| `docs` | qui **garde la documentation fidèle** au code | l'audit des pages contre le code | la racine d'une copie de travail git seulement |
| `all` | le mainteneur qui fait un peu de tout | tous les packs qui conviennent au dossier : dans un atelier, `user` plus `contrib` et le pack usage ; dans une copie de travail, tous les packs source | l'un ou l'autre |
| `custom:<pack>,<pack>` | tout le reste | les packs que vous nommez, et `core` (les garde-fous, le commutateur, les évals) toujours | l'un ou l'autre, quand l'un des packs lui convient |

Deux faits règlent les questions courantes :

- **Les profils source ne sont pas liés à ce dépôt.** `dev`, `release`, `docs` et `contrib` s'appliquent
  à la racine de n'importe quelle copie de travail git : leurs skills sont génériques et lisent ce qui est
  propre à un dépôt — commandes, listes de contrôle, règles de disposition — dans un **pack de dépôt**, qui
  rejoint le profil quand le remote `origin` est ce dépôt. Il en existe deux : `repo-orkeon` pour Orkeon
  et `repo-orkeon-workshop` pour ce projet. Dans un autre dépôt, les skills demandent ce qui leur manque.
- **Un profil source ne construit aucune équipe.** Dans une copie de travail, ni `teams/`, ni workbook,
  ni skill `team-*` : les hooks faits pour un atelier restent silencieux et le `CLAUDE.md` du dépôt
  gouverne son code ([Dans une copie de travail](./harness.md#dans-une-copie-de-travail)). Le
  développeur qui construit des équipes pour un projet à lui travaille donc en `user`, dans un **dossier
  d'équipes** à lui — qui peut être un dépôt git, versionné dès son premier commit — et garde le code du
  projet dans un autre dossier : pour le voir depuis l'atelier, montez-le à côté de l'atelier à la main
  (`-v "<projet>:/projects/<nom>"`, [Démarrer à la main](../getting-started/install.md#démarrer-à-la-main)).

Ce que `user` refuse, et le message qu'il donne, est dans
[Dans un atelier, ou dans une copie de travail git](../concepts/workshop.md#dans-un-atelier-ou-dans-une-copie-de-travail-git).

## En choisir un

- **Au premier démarrage** : `-Profile <nom>` du script de démarrage (`--profile <nom>` sous Linux), ou
  `-e HARNESS_PROFILE=<nom>` sur un `docker run` tapé à la main. C'est le **premier** profil du dossier :
  un dossier qui en a déjà un le garde. Les autres options du script — le dossier, le nom du conteneur,
  le modèle, le GPU, la mise à jour — sont dans
  [Les options du script](../getting-started/install.md#les-options-du-script).
- **Plus tard** : `/workshop-profile <nom>` dans Claude Code, ou `workshop-profile <nom>` dans un terminal
  du conteneur ; `workshop-profile --list` montre quels profils conviennent au dossier, `--show` le profil
  actif. Un profil qui n'est pas fait pour le dossier est refusé, avec ceux qui conviennent : `dev` dans un
  atelier, `user` dans une copie de travail.

Une ligne du script de démarrage est **un conteneur nommé** (`-Name`, `my-orkeon-workshop` par défaut) :
un `-Profile` donné avec le nom d'un conteneur créé sur un autre profil est refusé, pas appliqué — donnez
au nouveau dossier un conteneur à lui, ou changez le profil de l'intérieur avec `workshop-profile`
([Plus tard : rouvrir, ajouter un terminal, arrêter](../getting-started/install.md#plus-tard--rouvrir-ajouter-un-terminal-arrêter)).
