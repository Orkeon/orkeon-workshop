# Une équipe TypeScript

*[English](../../guides/typescript-team.md) · Français*

Choisissez TypeScript quand une équipe a besoin d'**outils sur mesure** : un calcul, une étape d'analyse,
une règle métier que le modèle ferait mal ou à grands frais — un score, une normalisation, une extraction
par expression régulière, un total. L'équipe est écrite dans le langage de script `.ork.ts` d'Orkeon, sous
sa forme déclarative, et c'est le skill `orkeon-crew-typescript` qui la génère.

## La demander

```text
Crée une équipe TypeScript qui lit des tickets de support, attribue à chacun un score d'urgence selon
une règle déterministe (mots-clés, catégorie du client, ancienneté) et écrit les dix plus urgents avec
leur score.
```

Le skill prend les mêmes décisions que le skill YAML — slug, dossier, points de montage, livrable, agents,
tâches ([Une équipe YAML](./yaml-team.md#ce-que-décide-le-skill)) — et y ajoute les outils sur mesure. Si
le besoin demande quelque chose que seul YAML offre (les garde-fous d'une tâche ou ses réglages de modèle
`llmOverride`, un `graphConfig`, un fournisseur de mémoire), il le dit et propose le skill YAML.

## Ce que le skill écrit

```text
teams/ticket-urgency/
├── mounts.json
├── crew/crew.ork.ts         l'équipe — nom exact : Studio la lance sans rien demander
├── crew/tools/index.ts      les outils sur mesure (seulement s'il y en a)
├── studio-team.json
├── tsconfig.json            la vérification des types dans l'éditeur
├── typings/orkeon.d.ts      les définitions de types du langage de script
├── README.md
├── run.sh, run.cmd          écrits par orkeon-bench scaffold
├── .gitignore               écrit par orkeon-bench scaffold : ce que l'équipe lit et écrit reste hors de git
└── <un dossier par point de montage, chacun avec un .gitkeep>
```

La forme de `crew/crew.ork.ts` :

```typescript
import { pickTools } from "./tools/index.ts";

const scorer = agentBuilder()
    .name("scorer")
    .role("Support triage analyst")
    .goal("Rank the tickets of /tickets by urgency")
    .backstory(`Methodical. Always scores with the score_ticket tool, never by guess.`)
    .tools(["file_read", "directory_read"])
    .withAutonomousTools(pickTools("score_ticket"))
    .allowDelegation(false)
    .maxIterations(12)
    .build();

const rank = taskBuilder()
    .name("rank")
    .agent(scorer)
    .description(`List /tickets with directory_read, read each ticket, score it with score_ticket.`)
    .expectedOutput("The ten most urgent tickets, one per line, with their score.")
    .deliverable({ path: "/reports/urgent.md", source: "final_message", format: "markdown" })
    .build();

const crew = crewBuilder()
    .name("ticket-urgency")
    .goal("Find the most urgent support tickets")
    .process("sequential")
    .withAgents([scorer])
    .withTasks([rank])
    .build();

globalThis.crew = crew;   // le passage de relais à l'exécuteur — jamais `await crew.run()`
```

Et un outil sur mesure, dans `crew/tools/index.ts` :

```typescript
const scoreTicket = toolBuilder<{ text: string; tier: string; ageDays: number }, { score: number }>()
    .name("score_ticket")
    .description("Scores the urgency of a ticket from 0 to 100")
    .withSchema({
        type: "object",
        properties: {
            text: { type: "string" },
            tier: { type: "string" },
            ageDays: { type: "number" },
        },
        required: ["text", "tier", "ageDays"],
    })
    .execute((input) => {
        const keywords = /outage|down|blocked|urgent/i.test(input.text) ? 40 : 0;
        const tier = input.tier === "gold" ? 30 : 10;
        return { score: Math.min(100, keywords + tier + Math.min(30, input.ageDays * 3)) };
    })
    .access("read")
    .build();

// …et pickTools(...names), qui remet les outils nommés à un agent (le skill l'écrit).
```

Un outil sur mesure est du **JavaScript pur** : aucune API Node (`fs`, `fetch`, `process`) — lire des
fichiers ou le web, c'est le rôle des outils intégrés. Les données fixes livrées avec l'équipe (un gabarit,
une liste) vont dans `crew/` et se lisent sous le chemin `/script/<file>`.

## Comment le skill vérifie l'équipe

Trois vérifications :

```bash
python3 .claude/skills/orkeon-crew-typescript/scripts/check_team.py teams/ticket-urgency --orkeon orkeon
npx --no-install tsc -p teams/ticket-urgency          # aucune erreur de type
cd teams/ticket-urgency && ./run.sh --validate
```

`check_team.py` repère ce que ni `tsc` ni `--validate` ne voient : l'organisation attendue par Studio, des
dossiers, une carte et des lanceurs en désaccord avec `mounts.json`, un point de montage lié à un dossier
que les agents de l'équipe ne doivent jamais atteindre, un livrable hors des points de montage en
écriture, une API Node, un `.llm()` qui nomme un fournisseur ou un modèle (refusé ou signalé : le modèle
vient des réglages, de `llm.default_` ou d'un profil nommé), un fichier de réglages d'équipe qui contient un secret ou un réglage valable pour toute la
machine, un fichier de réglages au-dessus des crews, et `shell_command` (signalé par un avertissement ;
refusé dans une équipe qui a un compte e-mail). Dans l'image, il lance aussi `orkeon-studio-check`, la
lecture que Studio fait lui-même de l'équipe. `--validate` compte les outils sur mesure dans
`tools resolved=K`.

Suite : [Outils C#](./csharp-tools.md).
