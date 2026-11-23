# Documentation d'Orkeon Workshop

*[English](../README.md) · Français*

Orkeon Workshop est une image de conteneur qui fait de Claude Code un atelier pour construire des équipes
d'agents [Orkeon](https://github.com/Orkeon/orkeon), et pour les tester, les mesurer et les expliquer — et,
selon le profil, un établi pour qui contribue à Orkeon, le développe, le publie ou garde sa documentation
fidèle au code ([Qui fait quoi](./workflows/overview.md)). Ces
pages expliquent comment l'installer, comment l'utiliser et comment il fonctionne, avec des exemples. Elles
sont aussi publiées sous forme de site, avec un champ de recherche :
<https://orkeon.github.io/orkeon-workshop/index.fr.html>.

## Vous débutez ? Découvrez-le en discutant

Inutile de tout lire avant de commencer. Voici trois façons de suivre une visite guidée, dans votre langue :

| Où | Comment | Idéal si |
|---|---|---|
| **Dans l'atelier** | ouvrez Claude Code avec `workshop`, réglez votre langue (`/workshop-language fr`), puis tapez `/orkeon-tour` | vous l'avez installé : la visite montre *votre* dossier et peut construire une première équipe avec vous |
| **Dans n'importe quelle conversation avec Claude** | copiez le prompt de la page [Découvrir avec Claude](./discover-with-claude.md) dans claude.ai ou Claude Desktop | vous n'avez encore rien installé, ou vous voulez de l'aide pour l'installer |
| **Sur une page de conversation partagée** | ouvrez le lien que partagent les mainteneurs du projet | quelqu'un vous a envoyé le lien |

**Vous n'êtes pas à l'aise en anglais ?** Dans l'atelier, tapez `/workshop-language fr` avant toute chose :
Claude converse alors avec vous en français et rédige en français les documents qui décrivent vos équipes
(besoin, critères, plan de test, conception) — [Votre langue](./getting-started/install.md#votre-langue).

## Votre rôle, vos workflows

Le harnais est un ensemble de workflows, un par rôle ; chacun est une pièce qui tient seule, et les
pièces s'enchaînent en la façon dont le projet Orkeon vit. [Qui fait quoi](./workflows/overview.md) les
montre ensemble et dit par où commencer.

| Page | Pour |
|---|---|
| [Qui fait quoi](./workflows/overview.md) | les pièces, qui joue chacune, où, avec quel profil ; un échec suivi de bout en bout |
| [Contribuer](./workflows/contribute.md) | signaler un échec reproduit dans un atelier, valider un correctif sur sa branche, ouvrir une pull request |
| [Développer une fonctionnalité](./workflows/develop.md) | développer un dépôt depuis le conteneur : la chaîne spécification, plan, tranches et audit d'Orkeon Code, ce que le harnais garde autour, ce qu'il faut |
| [Publier une version](./workflows/release.md) | le rapport qualité, la préparation, les preuves d'installation, le tag que vous poussez, ce qui a atteint chaque canal |
| [Garder la documentation fidèle](./workflows/keep-docs-true.md) | les pages auditées face au code, affirmation par affirmation, rien n'est corrigé à votre place |
| [Faire vivre Orkeon Workshop lui-même](./workflows/maintain-the-workshop.md) | les vérifications de ce projet, sa documentation bilingue, la construction de l'image, la migration vers la dernière version publiée d'Orkeon |
| [Mesurer ce que coûte une session](./workflows/measure.md) | ce qu'une session a coûté et ce qui a rempli son contexte |

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
| [Une équipe YAML](./guides/yaml-team.md) | le type d'équipe le plus courant, généré et vérifié par le skill `orkeon-crew` |
| [Une équipe TypeScript](./guides/typescript-team.md) | une équipe qui a besoin d'outils sur mesure, écrits en code |
| [Outils C#](./guides/csharp-tools.md) | des outils Orkeon en C# : les gabarits, les plugins, la compilation sans réseau |
| [Modèles : locaux et distants](./guides/models.md) | Ollama et le GPU, les fournisseurs distants, les clés, l'accord avant toute exécution payante |
| [Les clés des modèles : les deux modes](./guides/keys.md) | `subscription` (aucune clé sur le disque, les équipes sur le modèle local) ou `keys` (`workshop setup keys`) : qui paie quoi, ce qui est écrit et où, les limites, le retour |
| [Les outils d'Orkeon dans Claude Code](./guides/orkeon-tools.md) | le serveur MCP `orkeon` : l'index de code, les lecteurs et rédacteurs de documents, les outils réseau — sans modèle et sans clé |
| [Orkeon Code et les applications de terminal de Studio](./guides/orkeon-code.md) | l'agent de code que l'image embarque (`orkeon-code`, `/orkeon-code`, `orkeon-code-run`), `orkeon-studio-config` et `orkeon-studio-run` |
| [Modes Docker et SonarQube](./guides/docker-modes.md) | Docker dans le conteneur, ou le Docker de l'hôte ; la pile qualité |
| [Mettre à jour](./guides/updating.md) | les nouvelles versions d'Orkeon, d'Ollama et de l'image ; migrer un conteneur |
| [Une longue session autonome](./guides/long-session.md) | une exécution qui passe la nuit : ce que Claude Code et Orkeon Code font d'une limite de débit et d'un redémarrage, l'hôte éveillé, le disque |

## Consulter

| Référence | Contenu |
|---|---|
| [`orkeon-bench`](./reference/orkeon-bench.md) | chaque commande de l'outil en ligne de commande du harnais, avec des exemples |
| [Options et variables du conteneur](./reference/configuration.md) | les options de `docker run`, les variables d'environnement, le pare-feu |
| [Le harnais](./reference/harness.md) | skills, sous-agents, hooks, règles, gabarits, évals, interrupteurs, profils et packs |
| [Les profils](./reference/profiles.md) | à qui s'adresse chaque profil, ce qu'il change, dans quel dossier il s'applique ; comment en choisir un |
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
- [Profils et packs de contribution](../profiles-design.md) (en anglais) — la conception des profils : packs,
  profils, la bascule, le déploiement dans une copie de travail git, et le coût de démarrage de chaque profil.

## Où en est le projet

Les fondations sont construites et vérifiées : l'image, le harnais et ses garde-fous, les
documents de référence, le skill générateur `orkeon-crew`, la visite guidée, `orkeon-bench`, les gabarits
.NET, et `orkeon-studio-check`, qui lit une équipe avec le propre code d'Orkeon Studio. Chaque étape de la
méthode est un skill : `/team-init`, `/team-spec`, votre validation tapée sous la forme
`/team-approve team <slug>` et enregistrée par un hook, `/team-loop` (tests, construction, exécution,
revue, jusqu'à ce que l'équipe soit acceptée), `/team-release`, `/team-decision` et `/team-status` ;
`/workshop-language` règle la langue dans laquelle Claude converse et écrit les cahiers, et `/deploy`
empaquette une équipe en archive pour un autre atelier. Le banc vérifie `TEAM.md` sur le papier avant que
vous le validiez, ouvre les tentatives, exécute les cinq niveaux de test — statique, unitaire, composant
sur un modèle simulé, de bout en bout sur le modèle local, puis sur un modèle distant derrière votre
accord —, évalue les invariants et les indicateurs, intègre les notes des juges, capture une tentative
pour la revue et publie une équipe acceptée. Les profils
permettent à la même image de servir qui contribue à un dépôt, le développe, le publie ou garde sa
documentation fidèle au code, dans un atelier ou dans une copie de travail git : `/workshop-profile` choisit
les packs de skills que reçoit un dossier ([Le harnais](./reference/harness.md#profils-et-packs)). Les pages signalent ce qui
est **prévu** partout où cela compte.

## Feuille de route

Le travail est découpé en lots. Le premier objectif est la boucle complète — du besoin à l'équipe
acceptée — avec un modèle simulé puis un modèle local, sur une équipe pilote en YAML (lots 1 à 7) ; elle est réalisée dans sa seconde forme
(décisions D89 à D95 du 2026-10-30 : un seul document, une seule porte, chaque niveau exécutable). Le
[plan](../orkeon-workshop-plan.md) (en anglais) détaille les lots (§ 11) et consigne les décisions (§ 13).

| Lot | Contenu | État |
|---|---|---|
| 0 | image, squelette du harnais, hooks et évals, base d'`orkeon-bench`, gabarits .NET, visite guidée | terminé |
| 1 | documents de référence ; le catalogue des outils, régénéré à partir des schémas réels des outils | terminé |
| 2 | `team-init` (avec `--adopt` pour un prototype), `team-decision`, `team-status` ; le hook `/team-approve` | terminé |
| 3 | `team-spec` — l'unique document amont `TEAM.md` et sa validation `team` (D89, remplace `team-need`, `team-test-plan`, `team-design`) ; `orkeon-bench check team` | terminé ; le `TEAM.md` de l'équipe pilote est en cours |
| 4 | `orkeon-bench` : modèle simulé, exécution à tous les niveaux, évaluation, estimation, capture, rapport, tentatives (D91 ; `datasets build`, `llm-stub record\|replay` et `team rename\|remove` abandonnés, D93) | terminé |
| 5 | `team-tests` : jeux de données, scénarios, juges | terminé |
| 6 | `team-build` | terminé |
| 7 | `team-run`, `team-review`, `team-loop` — la boucle jusqu'à l'acceptation (D94) | terminé ; l'équipe pilote `mail-triage` la parcourt |
| 8 | C# : `orkeon-tool-csharp`, `orkeon-crew-csharp`, des équipes C# mesurées par le banc | fait : les gabarits .NET, `orkeon-harness-run`, `orkeon-studio-check`, les deux skills, `new-team.sh` ; le banc mesure une équipe C# à travers son hôte (L0 à L4) |
| 9 | modèles distants derrière la barrière de budget (`orkeon-bench estimate`, `/team-approve remote`, L4 avec son coût) ; `team-release` et `orkeon-bench release` | terminé |
| 10 | évals de chaque skill et de chaque hook, équipes pilotes complètes, documentation mise à jour | à venir |
| 11 | profils et packs de contribution : le harnais en packs composés en profils, pour un atelier ou une copie de travail git | terminé |
| 12 | skills en fork, mémoire des agents et état à la compaction : les skills qui lisent et rapportent tournent dans un sous-agent de leur pack, les auditeurs gardent une mémoire du dépôt, une tranche ouverte survit à une compaction | terminé ; la part de la chaîne dev retirée en novembre 2026 (D114) |
| 13 | instruments du pack dev : le coût d'accès d'une tranche mesuré sur l'arbre syntaxique, un test relié à la règle qu'il prouve par un trait que la barrière vérifie, une suite d'intégration jamais lancée entière, le diagnostic d'une copie de travail, un budget de latence sur les hooks, le produit exécuté depuis sa copie de travail et jamais depuis l'image, une entrée technique (`/dev-change`) pour un bogue, un refactor ou une amélioration de performance | terminé ; les instruments propres à la chaîne retirés en novembre 2026, la chaîne étant celle d'Orkeon Code (D114), et le pack `dev` avec eux |
| 14 | tranches dans des agents indépendants : `/dev-batches` fait tourner chaque tranche d'un plan dans un agent d'arrière-plan dans son propre worktree, quatre à la fois par défaut, le contexte principal orchestrant et seul à écrire le backlog ; les worktrees créés par le harnais avec les dossiers non suivis partagés du dépôt liés ; chaque tranche committée et poussée par le harnais (D71) | livré — l'image verte sur le `main` d'Orkeon ad6dc63 ; l'exécution de deux tranches à la fois sur un dépôt d'essai reste à faire. `/dev-batches` et ses agents retirés en novembre 2026 (D114) ; les hooks de worktree restent |
| 15 | l'Orkeon publié : l'atelier est passé de `main` à Orkeon 1.2.0 (D110) — les épingles, les références et le catalogue d'outils, les scripts de contrôle, le banc, les gabarits, l'équipe pilote (`/state` est au runner : son montage est `/registry` ; la carte est `team.json` ; `graph:` remplace `graphConfig`) | livré sur la copie de travail ; l'image se construit sur demande (D74) |
| 16 | un seul réglage pour les clés : `orkeon-bench setup` et `workshop setup`, les deux modes et le retour, aucune clé dans aucune sortie (D108, D109) | livré sur la copie de travail |
| 17 | les outils d'Orkeon par MCP : `orkeon-mcp`, enregistré par `sync-harness.sh` (D112) | livré sur la copie de travail |
| 18 | Orkeon Code et les applications de terminal d'Orkeon Studio dans l'image : `install-orkeon-code.sh`, `build-orkeon-studio.sh`, le Dockerfile et `image.yml` (D111) | écrit ; prouvé par la construction de l'image, sur demande |
| 19 | la chaîne dev est celle d'Orkeon Code : la chaîne, puis les deux skills de test et le pack `dev`, retirés du harnais (D114), `/orkeon-code` et `orkeon-code-run` (D113) | livré sur la copie de travail |
| 20 | Orkeon et Orkeon Code sur `main` : épinglés sur le `main` d'Orkeon à 4709278 et celui d'Orkeon Code à 219cc06 tant qu'aucune release ne porte leurs corrections (D115) — les tableaux par MCP, `sub_graph` servi, `orkeon-code-run` sur `orkeon-code run` ; puis sur le `main` d'Orkeon à 1b480bd (le commit qui prépare la 1.3.0) et Orkeon Code à 61c72f8 — plus de null sur le fil MCP, les imports Python dans l'index de code ; puis la version publiée Orkeon 1.3.0, qui met fin à l'exception pour Orkeon, et Orkeon Code 1.0.0-rc.3, qui y met fin pour Orkeon Code (Orkeon Studio passe à 1.3.0 à côté) | livré sur la copie de travail |

Un lot est **terminé** quand le critère que le plan lui fixe (§ 11) est rempli et que sa preuve — tests,
évals, vérification sur l'image — est consignée au § 11.1 ; **partiel** précise ce qui est déjà livré.
