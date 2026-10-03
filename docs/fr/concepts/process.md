# Comment se construit une équipe

*[English](../../concepts/process.md) · Français*

Demander une équipe d'agents à un assistant de programmation, c'est facile. Quelques minutes plus tard,
on obtient un dossier qui se charge et semble fonctionner — et personne ne sait s'il fait ce qu'il
fallait, ce qui se passe quand l'équipe s'arrête à mi-chemin ou reçoit deux fois la même entrée, ce
qu'elle coûte, si un e-mail qu'elle lit peut la convaincre de faire autre chose, ni pourquoi elle a été
construite ainsi une fois la conversation terminée.

La méthode de l'atelier répond à ces questions avant qu'une équipe soit déclarée terminée.

```mermaid
flowchart LR
    you(["Vous<br/>un besoin, des validations, des décisions"])
    subgraph ws["Orkeon Workshop"]
        direction LR
        claude["Claude Code<br/>guidé par le harnais"]
        team["Une équipe Orkeon<br/>YAML · TypeScript · C#"]
        bench["Tests et mesures<br/>modèles simulés, locaux, distants"]
        claude -->|"construit"| team
        team -->|"est exécutée par"| bench
        bench -->|"écarts : corriger et réessayer"| claude
    end
    done(["Une équipe acceptée<br/>dans l'atelier, avec sa trace"])
    you --> claude
    bench -->|"critères remplis"| done
```

## Deux pistes

Quand vous demandez une équipe, Claude vous propose deux pistes et vous laisse choisir :

- **Un prototype** : un skill générateur écrit l'équipe d'un coup, la vérifie et la charge dans Orkeon.
  C'est rapide, mais rien ne prouve encore qu'elle fait ce dont vous avez besoin.
- **La méthode** décrite ci-dessous : le besoin, les critères et les tests viennent d'abord, et une trace
  prouve le résultat. Une piste allégée l'abrège pour une petite équipe — besoin et acceptation dans un
  seul document et une seule validation, conception et plan ensemble, une seule tranche.

Un prototype peut rejoindre la méthode plus tard, grâce à `/team-init --adopt <slug>` (prévu, lot 2), qui
gardera son crew comme point de départ et fera de son README un premier brouillon du besoin.

## Les étapes

Chaque étape lit un fichier et en écrit un ; rien d'important ne passe par la conversation ; aucune étape
ne commence sans le résultat de la précédente. Vous validez le besoin, le plan de test et la conception ;
ensuite, la boucle tourne seule jusqu'à ce que l'équipe soit acceptée, ou jusqu'à ce qu'il faille une
décision de votre part.

```mermaid
flowchart TB
    subgraph prep["Vous validez chacune de ces étapes"]
        direction LR
        need["1 · Besoin"] --> plan["2 · Plan de test<br/>critères, indicateurs, invariants"]
        plan --> design["3 · Conception<br/>et un plan en tranches"]
    end
    subgraph loop["Puis la boucle tourne seule"]
        direction LR
        tests["4 · Tests<br/>écrits d'abord, en échec"] --> build["5 · Construction<br/>tranche par tranche"]
        build --> run["6 · Exécution<br/>niveaux L0 à L4"]
        run --> review{"7 · Revue"}
        review -->|"ITERATE"| build
    end
    prep --> loop
    loop -->|"ACCEPTED"| release["8 · Livraison"]
    loop -->|"BLOCKED"| decision["Une décision de votre part<br/>puis retour à l'étape qu'elle change"]
```

| # | Étape | Produit | Validation de sortie |
|---|---|---|---|
| 0 | Démarrage — `/team-init <slug>` | le cahier (`STATUS.md`, une première décision) et le dossier des tests ; le dossier de l'équipe lui-même arrive avec la première construction, une fois son format et ses points de montage décidés | — |
| 1 | Besoin — `/team-need` | `NEED.md` : ce que l'équipe lit et écrit, ses points de montage, comment elle reprend après un arrêt, ce qu'elle ne doit pas traiter deux fois, ses contraintes | vous validez le besoin |
| 2 | Plan de test — `/team-test-plan` | `ACCEPTANCE.md`, `TEST-PLAN.md` : critères d'acceptation, indicateurs, invariants ; jeux de données, niveaux de test, budget | vous validez les critères, les seuils et le budget |
| 3 | Conception — `/team-design` | `DESIGN.md`, `PLAN.md` : format, agents, tâches, outils, livrables, stratégie de reprise ; un plan en tranches `B1`, `B2`… | vous validez la conception |
| 4 | Tests — `/team-tests` | jeux de données synthétiques, scénarios, grilles d'évaluation des juges, dans `tests/<slug>/` | chaque test existe, cite un critère, et échoue |
| 5 | Construction — `/team-build` | l'équipe, tranche par tranche, par un sous-agent qui ne peut pas toucher aux tests | les niveaux statique et unitaire passent, aucun test n'est modifié |
| 6 | Exécution — `/team-run` | une tentative : les exécutions et un rapport | barrière de budget avant tout modèle distant |
| 7 | Revue — `/team-review` | une analyse et un plan de correction, par des sous-agents en lecture seule | `ACCEPTED` · `ITERATE` (retour à 5) · `BLOCKED` (une décision est nécessaire) |
| 8 | Livraison — `/team-release` | README, carte Studio et lanceurs réalignés ; une étiquette de version proposée | — |

Vous pouvez changer le besoin, les critères ou la conception à tout moment : le changement devient une
décision datée (`/team-decision`) et les étapes qu'il invalide sont refaites. `/team-status` indique où
en est une équipe.

> **Prévu.** Les skills `team-*` ci-dessus pilotent chacun une étape et sont construits lot par lot (voir la
> [feuille de route](../README.md#feuille-de-route)), tout comme le modèle simulé sur lequel la boucle tourne d'abord.
> En attendant, la méthode est suivie à la main, à votre demande, avec les gabarits de `.claude/templates/`
> et la description de `references/process/workflow.md` ; les skills générateurs (`orkeon-crew-yaml`,
> `orkeon-crew-typescript`) construisent et vérifient déjà une équipe — un prototype.

## Le cahier

Tout ce qui concerne la fabrication d'une équipe reste dans `workbooks/<slug>/` :

```text
workbooks/notes-digest/
├── NEED.md          le besoin, tel que vous l'avez validé
├── ACCEPTANCE.md    critères d'acceptation (AC-01…), indicateurs (IND-01…), invariants (INV-…)
├── TEST-PLAN.md     jeux de données, niveaux, budget
├── DESIGN.md        la conception et ses raisons
├── PLAN.md          le plan de construction, en tranches B1, B2…
├── STATUS.md        où en est l'équipe : phase, dernière validation franchie, tentative, verdict, prochaine action
├── decisions/       DEC-0001-<slug>.md, DEC-0002-<slug>.md… — chaque changement de direction, daté
├── attempts/        ATT-0001/… — chaque exécution des niveaux de test : rapport, analyse, plan de correction
└── runs/            les exécutions brutes (écrites par orkeon-bench seulement)
```

`STATUS.md` commence par quelques champs que lisent des scripts :

```markdown
---
phase: build
gate_passed: tests
attempt: ATT-0002
batch: B1
verdict: null
next_action: /team-build B1
updated_at: 2026-09-30T19:12:00Z
---

- 2026-09-30 19:12 — /team-build — B1 opened
```

## Qui fait quoi

Claude Code n'écrit pas tout lui-même. La session principale découpe le travail, le délègue avec un
contrat court et juge le résultat ; les sous-agents produisent ; les hooks surveillent chaque écriture et
chaque exécution ; le banc mesure.

```mermaid
sequenceDiagram
    actor you as Vous
    participant main as Claude Code<br/>(l'orchestrateur)
    participant sub as Sous-agents<br/>(auteur des tests, développeur, relecteur…)
    participant hooks as Hooks<br/>(les garde-fous)
    participant bench as orkeon-bench
    you->>main: un besoin, une validation, une décision
    main->>sub: un contrat compact (chemins, critères)
    sub->>hooks: chaque écriture, chaque exécution
    hooks-->>sub: autorisé, ou refusé avec la raison
    sub-->>main: DONE ou BLOCKED
    main->>bench: exécuter les niveaux de test
    bench-->>main: un rapport (critères, indicateurs, invariants)
    main-->>you: le verdict et l'étape suivante
```

Les hooks font respecter une partie de la méthode, quel que soit le mode de permission — et les réglages
Claude Code que le harnais crée dans l'atelier ne demandent aucune permission (`bypassPermissions`,
[L'atelier](./workshop.md#ce-qui-appartient-à-qui)), si bien que ce sont eux les garde-fous :

- aucune exécution sur un modèle distant payant sans un accord enregistré ;
- aucun test modifié pendant une construction, aucune équipe modifiée par celui qui écrit ses tests, et
  aucun réglage d'équipe écrit par un sous-agent ;
- aucune clé écrite sur le disque.

Les commits et les étiquettes de version sont proposés, jamais effectués : c'est une règle que Claude suit (le hook
`guard-git` qui la ferait respecter est désactivé par défaut). Vos validations seront enregistrées par un
hook, à partir de ce que vous tapez (`/team-approve`), une fois les skills `team-*` livrés.

Le détail de chaque garde-fou se trouve dans [Le harnais](../reference/harness.md).

Suite : [Tester une équipe](./testing.md).
