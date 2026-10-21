# Orkeon Workshop

*[English](./README.md) · Français*

[![vérifications](https://github.com/Orkeon/orkeon-workshop/actions/workflows/checks.yml/badge.svg)](https://github.com/Orkeon/orkeon-workshop/actions/workflows/checks.yml)
[![image](https://github.com/Orkeon/orkeon-workshop/actions/workflows/image.yml/badge.svg)](https://github.com/Orkeon/orkeon-workshop/actions/workflows/image.yml)
[![licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)
[![documentation](https://img.shields.io/badge/documentation-orkeon.github.io-blue.svg)](https://orkeon.github.io/orkeon-workshop/index.fr.html)

<p align="center">
  <img src="./docs/assets/kama-workshop.jpg" alt="Kama, le caméléon d'Orkeon Workshop, à son établi avec un plan holographique, devant un engrenage" width="320">
</p>

**Un harnais open source qui met [Claude Code](https://code.claude.com/docs/en/overview) au travail autour
d'[Orkeon](https://github.com/Orkeon/orkeon) : construire et tester vos propres équipes d'agents, et
travailler sur Orkeon lui-même — décrire un problème, le corriger, développer, publier, documenter — avec
une méthode, des garde-fous et une trace.**

Orkeon est un framework .NET pour des équipes d'agents d'IA. Demander une telle équipe à un assistant de
programmation est facile ; savoir si elle fait ce qu'il fallait, ce qu'elle coûte et comment elle se
comporte quand les choses tournent mal ne l'est pas. Il en va de même d'une modification d'Orkeon : un
correctif sans son test, une publication sans ses preuves, une page qui ne dit plus ce que fait le code.
Orkeon Workshop répond aux deux avec un seul **harnais** pour Claude Code — skills, sous-agents, règles et
hooks — et une seule image de conteneur, **`orkeon-workshop`**, qui porte la ligne de commande d'Orkeon,
des modèles locaux sur votre GPU et le harnais ; Claude Code est installé au premier démarrage de l'image
publiée.

## Ce que fait le harnais

```mermaid
flowchart LR
    you(["Vous"]) --> harness["Claude Code + le harnais<br/>une méthode, des garde-fous, une trace ;<br/>vous tapez ce qui committe, publie ou paie"]
    harness --> teams["Construire vos équipes d'agents<br/>dans un dossier d'atelier<br/>besoin → tests → équipe → exécutions → acceptée"]
    harness --> orkeon["Travailler sur Orkeon lui-même<br/>dans une copie de travail git<br/>décrire · corriger · développer · publier · documenter"]
    teams --> studio(["Des équipes qu'Orkeon Studio exécute,<br/>avec leur trace"])
    orkeon --> prs(["Des issues, des pull requests, des publications<br/>et une documentation fiables"])
```

**Construire vos équipes d'agents.** Dans un **atelier** — un dossier à vous, que lit Orkeon Studio —
Claude consigne le besoin, place les critères d'acceptation et les tests en premier, construit l'équipe
(YAML, TypeScript ou C#), la confronte à ce qu'Orkeon et Orkeon Studio acceptent réellement, l'exécute sur
des modèles simulés, locaux puis distants, et la passe en revue et la corrige jusqu'à ce qu'un rapport
prouve qu'elle remplit ses critères. Chaque tentative et chaque décision restent sur disque ; une
exécution payante attend votre accord ; une équipe s'empaquette en archive pour un autre atelier.

**Travailler sur Orkeon lui-même, au niveau où vous intervenez.** Dans une **copie de travail git**
d'Orkeon — ou de ce projet — le même harnais vous aide à **décrire** un échec avec précision (le
reproduire dans un atelier, rédiger l'issue), à le **corriger** (valider le correctif sur sa branche,
préparer la pull request), à **développer** (une spécification, un plan, une implémentation menée par ses
tests, une vérification, avec des sous-agents qui écrivent les tests, implémentent, auditent et attaquent
le résultat, et un rapport qualité), à **publier** (les barrières qualité, le contrôle de préparation, le
dossier de preuves, les notes, la vérification de ce qui a été publié) et à **garder la documentation
fidèle** au code. Ce qui est propre à un dépôt — ses commandes, ses listes de contrôle, ses règles
d'arborescence — vient dans un pack de dépôt : Orkeon et ce projet livrent le leur.

**Les mêmes règles partout.** Claude committe et pousse ce qu'une étape a produit, et ouvre une pull
request après vous avoir demandé (un réglage la rend automatique) ; il ne tague, ne dépose une issue, ne
commente ni ne paie une exécution de lui-même : il prépare le texte et vous remet la commande. Dans une
copie de travail, il n'écrit rien que git suit et garde `git status` propre ; le travail va sous `todo/`,
ou sous le dossier où le dépôt range ses tâches.
Les lectures sont bornées, les secrets restent hors des fichiers, et chaque garde-fou est un hook avec ses
évals.

## Une image, un rôle à la fois

Le harnais est découpé en **packs**, et un **profil** choisit les packs que reçoit le dossier dans lequel
Claude Code travaille. Un dossier est en `user` tant que vous ne choisissez pas autre chose, et un atelier
en `user` reçoit le harnais exactement tel qu'il était avant les profils.

| Vous voulez… | Profil | Où Claude travaille | Packs de skills |
|---|---|---|---|
| **construire des équipes Orkeon** et prouver qu'elles marchent — utilisateur d'Orkeon Studio, ou pour un projet à vous | `user` (par défaut) | un atelier : un dossier d'équipes, versionné avec git ou non | la méthode (`/team-init` … `/team-tests`), les générateurs, `orkeon-bench`, `/deploy`, la visite guidée |
| **décrire et corriger** : contribuer à Orkeon ou à ce projet | `contrib` | un atelier, ou une copie de travail git | l'issue, le correctif validé, la pull request |
| **développer** un dépôt — Orkeon, ce projet, un autre | `dev` | la racine de sa copie de travail git | spécification, plan, implémentation par les tests, vérification, les quatre sous-agents de revue, le rapport qualité |
| **le publier** | `release` | une copie de travail git | les barrières, le contrôle de préparation, le dossier de preuves, les notes, la vérification |
| **garder sa documentation fidèle** | `docs` | une copie de travail git | l'audit des pages contre le code |
| un peu de tout | `all`, ou `custom:<pack>,<pack>` | l'un ou l'autre | les packs qui conviennent à l'espace |

Un profil source ne construit aucune équipe : le développeur qui construit des équipes pour un projet à
lui travaille en `user`, dans un dossier d'équipes. Choisissez avec `/workshop-profile <nom>` dans Claude
Code (ou `workshop-profile <nom>` dans le terminal du conteneur), ou donnez-le au premier démarrage :
`-Profile <nom>` du script de démarrage, ou `-e HARNESS_PROFILE=<nom>` à la main —
[Les profils](./docs/fr/reference/profiles.md), et [Profils et packs](./docs/fr/reference/harness.md#profils-et-packs)
pour la mécanique.

## Le découvrir en discutant

- **Avant d'installer** : collez [ce prompt](./docs/fr/discover-with-claude.md) dans une conversation
  claude.ai ou Claude Desktop. Claude vous présente le projet dans votre langue et vous guide dans
  l'installation.
- **Une fois installé** : ouvrez Claude Code avec `workshop`. Dans un atelier, tapez
  `/workshop-language fr` pour travailler en français, puis `/orkeon-tour` — une visite guidée de votre
  propre atelier, qui peut construire une première équipe avec vous. Dans une copie de travail, ouvrez la
  page de votre rôle ([les workflows](./docs/fr/workflows/overview.md#par-où-commencer-)).

## Démarrer

**Vous êtes dans quel cas ?** Trois lecteurs, trois lignes. Chacun a besoin d'un ordinateur sous
Windows 10/11 ou Linux avec environ 25 Go libres, d'un compte Claude, et de Docker démarré —
[Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) sous Windows, Docker
Engine sous Linux : Docker est le programme qui fait tourner l'atelier dans sa propre boîte étanche, et
l'**image** est cette boîte, téléchargée une fois (environ 19 Go). La ligne se colle dans un terminal de
votre ordinateur — **PowerShell** sous Windows (menu Démarrer, tapez `PowerShell`) —, suivie d'Entrée. Pas à
pas, avec ce que vous devez voir : [Installer](./docs/fr/getting-started/install.md) ; accompagné dans une
conversation : [Le découvrir en discutant](#le-découvrir-en-discutant).

### 1. Vous utilisez Orkeon Studio et voulez un atelier qui marche

Ni programmation ni connaissance de Docker. Sous Windows :

```powershell
irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1 | iex
```

Sous Linux :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop
```

Elle pose une question, le dossier de votre atelier : **appuyez sur Entrée** pour garder `Orkeon` dans
votre dossier utilisateur, celui que lit Orkeon Studio par défaut. Si vos équipes vivent déjà dans ce
dossier, avec ou sans git, elle s'installe à côté d'elles sans y toucher. Puis elle télécharge l'image
(une fois), détecte si vous avez une carte graphique NVIDIA, et démarre l'atelier dans la même fenêtre.
Quand les messages s'arrêtent, tapez :

```text
workshop                 ← ouvre Claude Code dans votre atelier
```

puis, dans Claude Code, `/workshop-language fr` pour travailler en français
([Votre langue](./docs/fr/getting-started/install.md#votre-langue)), et `/orkeon-tour` : la visite guidée,
qui peut construire une première équipe avec vous. **Un autre jour**, collez à nouveau la même ligne : elle
rouvre le même atelier. Pour signaler une panne ou valider un correctif, l'atelier est le même, avec le
profil `contrib` : [Contribuer](./docs/fr/workflows/contribute.md).

### 2. Vous développez et construisez des équipes pour un projet à vous

Les équipes vivent dans un **dossier à vous** — vide, ou contenant déjà `teams/`, versionné avec git ou
non — et vous pouvez faire tourner plusieurs ateliers côte à côte, avec ou sans carte graphique. Le même
script prend des options : un **nom** pour le conteneur de cet atelier — la boîte que Docker fait tourner
pour lui, une par atelier ; un nom, un conteneur : la ligne courte ci-dessus ouvre `my-orkeon-workshop`,
un second dossier prend donc un second nom —, le dossier, et `-NoGpu` quand il n'y a pas de carte NVIDIA
à utiliser. Le profil — l'ensemble des skills que reçoit le dossier — reste `user`, celui qui construit
des équipes ([Les profils](./docs/fr/reference/profiles.md)). Sous Windows :

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name <nom> -Folder "D:\Travail\mon-atelier"
```

Sous Linux :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name <nom> --folder ~/travail/mon-atelier
```

Puis comme ci-dessus : `workshop`, `/orkeon-tour`. Plus tard, la même ligne avec le même nom le rouvre ;
une ligne avec un autre dossier et ce nom est refusée, jamais appliquée en silence. Toutes les options
(modèle, GPU, mise à jour, essai à blanc), une ligne à copier par situation, et ce que les ateliers
partagent : [Les options du script](./docs/fr/getting-started/install.md#les-options-du-script). Orkeon
Studio liste un seul dossier d'équipes : pointez-le sur celui-ci quand vous l'y voulez
([Orkeon Studio le voit](./docs/fr/concepts/workshop.md#orkeon-studio-le-voit)).

### 3. Vous contribuez à Orkeon Workshop lui-même, ou à Orkeon

Le dossier est une **copie de travail git** du dépôt — clonez-la d'abord — et le profil, un profil fait
pour une copie de travail : `dev` pour développer, `release`, `docs`, `contrib`, ou `all` pour ce dépôt
([Les profils](./docs/fr/reference/profiles.md)). Le conteneur reçoit un nom à lui. Sous Windows :

```powershell
git clone https://github.com/Orkeon/orkeon-workshop.git "$env:USERPROFILE\src\orkeon-workshop"
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.ps1))) -Name orkeon-workshop-dev -Folder "$env:USERPROFILE\src\orkeon-workshop" -Profile dev
```

Sous Linux :

```bash
git clone https://github.com/Orkeon/orkeon-workshop.git "$HOME/src/orkeon-workshop"
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Orkeon/orkeon-workshop/main/install/start-workshop.sh)" start-workshop --name orkeon-workshop-dev --folder "$HOME/src/orkeon-workshop" --profile dev
```

Pour Orkeon, le clone est `https://github.com/Orkeon/orkeon.git`. Le harnais se pose dans le `.claude/`
de la copie de travail, listé dans `.git/info/exclude`, jamais dans un fichier suivi
([Dans une copie de travail](./docs/fr/reference/harness.md#dans-une-copie-de-travail)) ; pas de visite
guidée là, et Claude suit la langue de vos messages. Tapez `workshop`, puis ouvrez la page de votre rôle :
[Développer](./docs/fr/workflows/develop.md), [Publier](./docs/fr/workflows/release.md),
[Garder la documentation fidèle](./docs/fr/workflows/keep-docs-true.md),
[Faire vivre Orkeon Workshop](./docs/fr/workflows/maintain-the-workshop.md). Pour construire l'image depuis
la copie de travail : [Construire l'image](./.devcontainer/README.md). Le `docker run` que le script tape
pour vous, pour changer ce qu'il ne propose pas, est dans
[Démarrer à la main](./docs/fr/getting-started/install.md#démarrer-à-la-main).

## Documentation

| | |
|---|---|
| **Démarrer** | [Installer](./docs/fr/getting-started/install.md) · [Votre première équipe](./docs/fr/getting-started/first-team.md) · [VS Code](./docs/fr/getting-started/vs-code.md) |
| **Comprendre** | [L'atelier](./docs/fr/concepts/workshop.md) · [Les équipes](./docs/fr/concepts/teams.md) · [Points de montage](./docs/fr/concepts/mount-points.md) · [Comment se construit une équipe](./docs/fr/concepts/process.md) · [Tester](./docs/fr/concepts/testing.md) |
| **Faire** | [Équipe YAML](./docs/fr/guides/yaml-team.md) · [Équipe TypeScript](./docs/fr/guides/typescript-team.md) · [Outils C#](./docs/fr/guides/csharp-tools.md) · [Modèles](./docs/fr/guides/models.md) · [Modes Docker](./docs/fr/guides/docker-modes.md) · [Mettre à jour](./docs/fr/guides/updating.md) |
| **Rôles** | [Les workflows : qui fait quoi](./docs/fr/workflows/overview.md) · [Contribuer](./docs/fr/workflows/contribute.md) · [Développer](./docs/fr/workflows/develop.md) · [Publier](./docs/fr/workflows/release.md) · [Garder la doc fidèle](./docs/fr/workflows/keep-docs-true.md) · [Faire vivre l'atelier](./docs/fr/workflows/maintain-the-workshop.md) · [Mesurer](./docs/fr/workflows/measure.md) · [Les profils](./docs/fr/reference/profiles.md) · [Profils et packs](./docs/fr/reference/harness.md#profils-et-packs) · [Dans une copie de travail](./docs/fr/reference/harness.md#dans-une-copie-de-travail) · [Les skills des packs](./docs/fr/reference/harness.md#les-skills-des-packs) · [Conception des profils](./docs/profiles-design.md) (en anglais) |
| **Consulter** | [`orkeon-bench`](./docs/fr/reference/orkeon-bench.md) · [Options et variables](./docs/fr/reference/configuration.md) · [Le harnais](./docs/fr/reference/harness.md) · [Dépannage](./docs/fr/reference/troubleshooting.md) · [FAQ](./docs/fr/faq.md) |
| **Construire et concevoir** (en anglais) | [Construire l'image](./.devcontainer/README.md) · [Le plan d'Orkeon Workshop](./docs/orkeon-workshop-plan.md) |

Tout part du [sommaire de la documentation](./docs/fr/README.md) ; la documentation est aussi publiée sous
forme de site, avec un champ de recherche : <https://orkeon.github.io/orkeon-workshop/index.fr.html>.

## Où en est le projet

**Construire des équipes** — les fondations sont construites et vérifiées : l'image, le
harnais et ses garde-fous, les documents de référence, les générateurs d'équipes (`orkeon-crew-yaml`,
`orkeon-crew-typescript`), la visite guidée, `orkeon-bench` et les gabarits .NET, ainsi
qu'`orkeon-studio-check`, qui lit une équipe avec le propre code d'Orkeon Studio. Les premières étapes de
la méthode sont des skills : `/team-init`, `/team-need`, `/team-test-plan`,
`/team-design`, `/team-tests`, `/team-decision` et `/team-status`, et vos validations, tapées sous la forme
`/team-approve …` et enregistrées par un hook ; `/deploy` empaquette une équipe en archive pour un autre
atelier ; le banc vérifie sur le papier les critères, le plan de test et la conception, et exécute les
vérifications statiques d'une équipe et ses scénarios de composant sur un modèle simulé.
**Ensuite** : les skills des étapes suivantes, et les commandes du banc qui exécutent une équipe sur un
modèle local puis distant et la notent.

**Les autres rôles** — les profils et les packs sont livrés : `contrib`, `dev`, `release` et
`docs`, les packs de dépôt d'Orkeon et de ce projet, la bascule entre profils, le déploiement dans une
copie de travail git qui n'écrit rien que git suit, et `cc-usage`, qui mesure ce que coûte une session de
Claude Code (le profil `user` coûte autant qu'avant). **Ensuite** : les skills des packs déroulés de bout
en bout sur une vraie copie de travail d'Orkeon, et un profil qui retire le harnais d'une copie de travail.

La [feuille de route](./docs/fr/README.md#feuille-de-route) liste ce qui est livré et ce qui vient ensuite.

## Remerciements

Orkeon Workshop s'appuie sur le travail d'autres personnes. Le répartiteur Bash du harnais, ses garde-fous de lecture
et de délégation, son lanceur d'évals et, dans les packs, la chaîne de développement viennent du
[claude-code-toolkit](https://github.com/pierrebelin/claude-code-toolkit) de Pierre Belin ; la commande
`cc-usage`, qui mesure ce que coûte une session de Claude Code, est son
[claude-code-token-usage](https://github.com/pierrebelin/claude-code-token-usage). Le devcontainer est
parti du devcontainer de référence d'Anthropic pour Claude Code, et les gabarits .NET partagent leurs
fichiers de convention avec [Orkeon](https://github.com/Orkeon/orkeon). Merci à leurs auteurs.
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md) dit, fichier par fichier, ce qui a été repris et à
quelles conditions.

## Licence

Orkeon Workshop est distribué sous [licence MIT](./LICENSE). [`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md)
recense ce qui vient d'ailleurs : des éléments adaptés de trois projets sous licence MIT, et six fichiers de
devcontainer dérivés du devcontainer de référence d'Anthropic, dont les parties issues d'Anthropic ne sont
pas couvertes par la licence MIT. Les logiciels que l'image installe, à commencer par Claude Code, gardent
leur propre licence ; l'image publiée ne contient pas Claude Code.

Orkeon Workshop n'est ni affilié à Anthropic ni cautionné par cette entreprise. Pour Claude Code lui-même,
consultez sa [documentation](https://code.claude.com/docs/en/overview).
