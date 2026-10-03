# Documentation d'Orkeon Workshop

*[English](../README.md) · Français*

Orkeon Workshop est une image de conteneur qui fait de Claude Code un atelier pour construire des équipes
d'agents [Orkeon](https://github.com/Orkeon/orkeon), et pour les tester, les mesurer et les expliquer. Ces
pages expliquent comment l'installer, comment l'utiliser et comment il fonctionne, avec des exemples.

## Vous débutez ? Découvrez-le en discutant

Inutile de tout lire avant de commencer. Voici trois façons de suivre une visite guidée, dans votre langue :

| Où | Comment | Idéal si |
|---|---|---|
| **Dans l'atelier** | ouvrez Claude Code avec `workshop`, puis tapez `/orkeon-tour` | vous l'avez installé : la visite montre *votre* dossier et peut construire une première équipe avec vous |
| **Dans n'importe quelle conversation avec Claude** | copiez le prompt de la page [Découvrir avec Claude](./discover-with-claude.md) dans claude.ai ou Claude Desktop | vous n'avez encore rien installé, ou vous voulez de l'aide pour l'installer |
| **Sur une page de conversation partagée** | ouvrez le lien que partagent les mainteneurs du projet | quelqu'un vous a envoyé le lien |

## Démarrer

| Page | Ce que vous allez faire |
|---|---|
| [Installer](./getting-started/install.md) | récupérer l'image, créer le dossier de l'atelier, démarrer le conteneur, ouvrir Claude Code — pas à pas, pour Windows et Linux |
| [Votre première équipe](./getting-started/first-team.md) | demander une petite équipe à Claude, regarder ce qu'il a produit, l'exécuter sur un modèle local, la voir dans Orkeon Studio |
| [L'atelier dans VS Code](./getting-started/vs-code.md) | ouvrir le même atelier depuis VS Code plutôt que depuis un terminal |

## Comprendre

| Page | Ce qu'elle explique |
|---|---|
| [L'atelier](./concepts/workshop.md) | le dossier où tout se trouve, ce qui vous appartient et ce que l'image tient à jour |
| [Les équipes](./concepts/teams.md) | de quoi se compose une équipe Orkeon, et ce dont Orkeon Studio a besoin pour l'exécuter |
| [Points de montage et jeux de dossiers](./concepts/mount-points.md) | les dossiers qu'une équipe lit et écrit, et comment l'exécuter sur d'autres dossiers |
| [Comment se construit une équipe](./concepts/process.md) | la méthode pas à pas : besoin, plan de test, conception, tests, construction, exécution, revue |
| [Tester une équipe](./concepts/testing.md) | les cinq niveaux de test, des gratuits (modèles simulés et locaux) aux payants (modèles distants) |

## Faire

| Guide | Pour |
|---|---|
| [Une équipe YAML](./guides/yaml-team.md) | le type d'équipe le plus courant, généré et vérifié par le skill `orkeon-crew-yaml` |
| [Une équipe TypeScript](./guides/typescript-team.md) | une équipe qui a besoin d'outils sur mesure, écrits en code |
| [Outils C#](./guides/csharp-tools.md) | des outils Orkeon en C# : les gabarits, les plugins, la compilation sans réseau |
| [Modèles : locaux et distants](./guides/models.md) | Ollama et le GPU, les fournisseurs distants, les clés, l'accord avant toute exécution payante |
| [Modes Docker et SonarQube](./guides/docker-modes.md) | Docker dans le conteneur, ou le Docker de l'hôte ; la pile qualité |
| [Mettre à jour](./guides/updating.md) | les nouvelles versions d'Orkeon, d'Ollama et de l'image ; migrer un conteneur |

## Consulter

| Référence | Contenu |
|---|---|
| [`orkeon-bench`](./reference/orkeon-bench.md) | chaque commande de l'outil en ligne de commande du harnais, avec des exemples |
| [Options et variables du conteneur](./reference/configuration.md) | les options de `docker run`, les variables d'environnement, le pare-feu |
| [Le harnais](./reference/harness.md) | skills, sous-agents, hooks, règles, gabarits, évals, interrupteurs |
| [Dépannage](./reference/troubleshooting.md) | que faire quand quelque chose ne fonctionne pas |
| [FAQ](./faq.md) | des réponses courtes : coût, données, GPU, Studio, git, licence… |

## Approfondir

Ces documents sont en anglais.

- [Construire l'image](../../.devcontainer/README.md) — les arguments de construction, les canaux
  d'Orkeon, l'image publiée, ce que vérifie une construction.
- Les README des composants : [le harnais](../../.devcontainer/harness/README.md),
  [`orkeon-bench`](../../.devcontainer/bench/README.md), [les gabarits .NET](../../.devcontainer/csharp/README.md).
- [Le plan d'Orkeon Workshop](../orkeon-workshop-plan.md) — le document de conception : principes,
  arborescences de dossiers, processus, formats des artefacts, stratégie de test, lots et décisions (`D1`,
  `D2`…).

## Où en est le projet

Les fondations sont construites et vérifiées (lots 0 et 1) : l'image, le harnais et ses garde-fous, les
documents de référence, les skills générateurs, la visite guidée, `orkeon-bench` (état, points de montage,
lanceurs, profils, validation des rapports, catalogue des outils), les gabarits .NET, et
`orkeon-studio-check`, qui lit une équipe avec le propre code d'Orkeon Studio. Viendront ensuite les skills
`team-*`, qui conduisent la méthode pas à pas, et les commandes du banc qui exécutent et notent une équipe,
d'abord sur un modèle simulé. Les pages signalent ce qui est **prévu** partout où cela compte.

## Feuille de route

Le travail est découpé en lots. Le premier objectif est la boucle complète — du besoin à l'équipe
acceptée — avec un modèle simulé puis un modèle local, sur une équipe pilote en YAML (lots 1 à 7). Le
[plan](../orkeon-workshop-plan.md) (en anglais) détaille les lots (§ 11) et consigne les décisions (§ 13).

| Lot | Contenu | État |
|---|---|---|
| 0 | image, squelette du harnais, hooks et évals, base d'`orkeon-bench`, gabarits .NET, visite guidée | terminé |
| 1 | documents de référence ; le catalogue des outils, régénéré à partir des schémas réels des outils | terminé |
| 2 | `team-init` (avec `--adopt` pour un prototype, et la piste allégée), `team-need`, `team-decision`, `team-status` ; le hook `/team-approve` | à venir (gabarits, règle et hook `status-check` prêts) |
| 3 | `team-test-plan`, `team-design` | à venir (gabarits et listes de contrôle prêts) |
| 4 | `orkeon-bench` : jeux de données, modèle simulé, exécution, évaluation, rapport, tentatives ; les orphelins et `team rename\|remove` | partiel : `scaffold`, `status`, `mounts`, `profile`, `report validate`, `tools dump`, `doctor` |
| 5 | `team-tests` : jeux de données, scénarios, juges | à venir |
| 6 | `team-build` | partiel : les générateurs écrivent une équipe et ses lanceurs via `scaffold` |
| 7 | `team-run`, `team-review`, la boucle jusqu'à l'acceptation | à venir (le hook `run-gate` est prêt) |
| 8 | C# : `orkeon-tool-csharp`, `orkeon-crew-csharp`, des équipes C# mesurées par le banc | partiel : les gabarits .NET, `orkeon-harness-run` et `orkeon-studio-check` |
| 9 | modèles distants derrière la barrière de budget ; `team-release` | à venir (la règle des modèles distants dans la barrière de budget, `run-gate`, est prête) |
| 10 | évals de chaque skill et de chaque hook, équipes pilotes complètes, documentation mise à jour | à venir |

Un lot est **terminé** quand le critère que le plan lui fixe (§ 11) est rempli et que sa preuve — tests,
évals, vérification sur l'image — est consignée au § 11.1 ; **partiel** précise ce qui est déjà livré.
