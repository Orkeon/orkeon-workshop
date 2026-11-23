# Orkeon Code et les applications de terminal de Studio

*[English](../../guides/orkeon-code.md) · Français*

Outre Orkeon lui-même, l'image embarque deux produits de la famille Orkeon, chacun à une version épinglée
(D110, D111). Orkeon Code est de nouveau une version publiée : sa version 1.0.0-rc.3 porte les
corrections pour lesquelles l'image le construisait depuis un commit de son `main` (D115). Orkeon Studio
est son tag v1.3.0 (sa release GitHub était encore un brouillon le 2026-11-19) :

| Produit | Version dans l'image | Commandes | Ce que c'est |
|---|---|---|---|
| Orkeon | 1.3.0, la CLI publiée sur nuget.org (`orkeon --version` : `orkeon 1.3.0`) | `orkeon` | le moteur de vos équipes |
| Orkeon Code | 1.0.0-rc.3, une version candidate | `orkeon-code`, `orkeon-code-run` | un agent de code construit sur Orkeon |
| Orkeon Studio | 1.3.0, ses deux applications de terminal | `orkeon-studio-config`, `orkeon-studio-run` | un éditeur de réglages et un lanceur d'équipes |

L'application de bureau de Studio reste réservée à Windows : elle n'est pas dans l'image, et elle ouvre
toujours les équipes de votre dossier depuis Windows ([L'atelier](../concepts/workshop.md)).

## Orkeon Code

Orkeon Code est un agent à part entière, avec ses propres commandes (`/assistant`, `/review`, `/analyze`,
`/commit`, `/dev-spec`, `/dev-plan`, `/dev-batches`…), chacune exécutée par un crew d'Orkeon. Sa
documentation est sur <https://orkeon.github.io/orkeon-code/>. Dans l'atelier il a deux usages : un second
agent sur votre code, et la chaîne spécification, plan, tranches et audit que le harnais ne porte plus
([Développer une fonctionnalité](../workflows/develop.md)).

### Sur quoi il tourne

Sur un modèle **à lui**. Il ne peut pas tourner sur un abonnement Claude.

| Vous avez | Orkeon Code tourne sur | Coût |
|---|---|---|
| rien d'autre que l'abonnement Claude | le modèle local (Ollama), celui des réglages d'Orkeon | du temps machine ; un petit modèle local est lent et limité pour un travail de code |
| une clé posée avec `workshop setup keys` | le modèle hébergé que vous avez nommé | payé au jeton, par cette clé |
| ni clé ni modèle local | rien : un crew n'a aucun modèle à appeler | — |

Il lit ses réglages dans cet ordre : `~/.orkeon-code/appsettings.json` quand vous en avez écrit un
(`orkeon-code setup` demande le fournisseur, le modèle et le nom de la variable de clé), sinon le
`~/.config/Orkeon/appsettings.json` d'Orkeon — le fichier que le conteneur écrit pour le modèle local et
que `workshop setup keys` met à jour ([Les clés des modèles](./keys.md)).

### Son REPL

Dans un terminal du conteneur, à la racine du projet :

```bash
orkeon-code trust add "$PWD"       # une fois par dossier : Orkeon Code ne travaille que dans un dossier de confiance
orkeon-code                        # son REPL, sur le modèle local
workshop code                      # son REPL, avec les clés de `workshop setup keys` dans son environnement
orkeon-code --version              # sa version, et l'Orkeon qu'il a trouvé
```

Un texte libre est une demande à son assistant ; `plan: …` interroge sans modifier, `acceptEdits: …` le
laisse modifier ; `/mode` règle le mode de permission de la session. Les commandes qui posent des
questions — `/dev-spec`, `/dev-batches` — se lancent ici, avec vous au clavier.

Deux choses à savoir dans l'atelier :

- **En mode `keys`, ouvrez-le par `workshop code`.** Une clé posée avec `workshop setup keys` est donnée
  à ce que Claude Code lance, pas à votre terminal : `workshop code [arguments]` lance `orkeon-code` avec
  les clés de setup dans son environnement, pour cette seule commande — rien n'est exporté dans le shell.
  En mode `subscription`, c'est la même chose qu'`orkeon-code`.
- **Son magasin de confiance et son état sont dans le conteneur** (`~/.orkeon-code/`) : un nouveau
  conteneur démarre sans eux, et vous redonnez votre confiance au dossier. Ce qu'il écrit dans le projet
  (`.orkeon/`, son dossier de travail) reste dans votre dossier.

### Depuis Claude Code : `/orkeon-code` et `orkeon-code-run`

Le skill `/orkeon-code` (pack core : tous les profils, atelier comme copie de travail) fait lancer par
Claude Code un crew d'Orkeon Code en une passe, par la commande `orkeon-code-run` :

```bash
orkeon-code-run --list                           # les crews, chacun avec les entrées qu'il lit
orkeon-code-run <crew> --inputs '<json>' [--workspace <dossier>] [--settings <fichier>] [-- <options d'orkeon run>]
```

Un chemin relatif donné à une option d'`orkeon run` (`--inputs-file`, `--llm-mock`, `--llm-replay`…) est lu
depuis le dossier où vous lancez la commande quand le fichier s'y trouve, non depuis l'espace de travail
(1.0.0-rc.3).

| Demande | Crew | Entrées |
|---|---|---|
| une demande de code | `main-loop` | `{"prompt": "…", "permissionMode": "plan"}` |
| la revue du diff, de fichiers ou d'un commit | `code-review` | `{}`, `{"files": ["…"]}` ou `{"commit": "<sha>"}` |
| une carte de la base de code | `analyze` | `{}` |
| le plan d'une spécification déjà écrite | `dev-plan` | `{"source": "<code>"}` |
| l'audit d'une tranche déjà implémentée | `dev-verify` | `{"batch": "F<n>", "plan": "<code>"}` |
| les propositions tirées des audits passés | `dev-learn` | `{"list": true}` |

Ce que fait la commande :

- c'est le `orkeon-code run <crew>` d'Orkeon Code lui-même : il lance `orkeon run` sur le fichier du crew,
  sous `/usr/local/lib/orkeon-code/current/src/crews/<crew>/`, avec le projet monté en lecture et écriture
  sur `/workspace`, des dossiers de brouillon sur `/output` et `/tmp`, le bloc `orkeonCode` des réglages
  en lecture seule sur `/user-config`, et la porte des permissions ouverte ;
- elle prend l'espace de travail dans `--workspace`, sinon `$ORKEON_CODE_WORKSPACE`, sinon le dossier de
  la session Claude Code (`$CLAUDE_PROJECT_DIR`), sinon le répertoire courant ;
- elle prend les réglages dans `--settings`, sinon `$ORKEON_CODE_SETTINGS`, sinon
  `$ORKEON_CODE_HOME/appsettings.json` (`~/.orkeon-code/` par défaut ; ce qu'écrit `orkeon-code setup`,
  qu'Orkeon Code lit alors lui-même), sinon les réglages d'exemple
  d'Orkeon Code recouverts de la section `Llm` des réglages d'Orkeon (`~/.config/Orkeon/appsettings.json`),
  et de sa section `RateLimiting` quand ils en ont une, écrits dans
  `~/.orkeon-code/workshop/appsettings.json` à chaque exécution ;
- elle refuse un dossier auquel Orkeon Code ne fait pas confiance (code de sortie `3`). Accorder la
  confiance est votre geste : Claude ne le fait pas pour vous ;
- elle affiche un objet JSON sur la sortie standard, les lignes de journal allant sur la sortie d'erreur ;
  `result.finalOutput` est la réponse.

| Code de sortie | Sens |
|---|---|
| `0` | le script est allé au bout — un appel que le mode de permission a refusé n'est pas une erreur : lisez le JSON |
| `1` | une erreur de script |
| `2` | une erreur d'exécution (le modèle injoignable, une limite de débit), ou aucun réglage à lire ou dériver |
| `3` | l'espace de travail n'est pas de confiance |
| `64` | usage : un crew manquant ou inconnu, `--trust` ou `--demo`, un espace de travail qui n'est pas un dossier |
| `75` | l'exécution s'est arrêtée sur une question |
| `127` | `orkeon-code`, `orkeon`, ou `jq` (pour dériver les réglages) absent |
| `130` | annulé |

Le mode de permission voyage dans les entrées (`permissionMode`) :

| Mode | Ce que le crew peut faire dans un lancement en une passe |
|---|---|
| `plan`, `dontAsk` | lire seulement |
| `default` | lire seulement, une action de lecture `github` et un simple GET `http_api` compris |
| `acceptEdits` | lire et modifier des fichiers (une lecture `github` et un GET `http_api` aussi) ; pas de shell |
| `bypassPermissions` | tout, shell compris |

Le mode borne les appels d'outils des agents du crew ; ce que fait le code du crew lui-même (son état sous
`.orkeon/`, ses propres appels `tools.*`) n'y passe pas (Orkeon Code 1.0.0-rc.3, `docs/headless.md`).

Le skill commence par `plan` pour une question ou une revue, dit quel mode il a choisi, et vous demande
avant le premier `bypassPermissions` d'une session. Sur un modèle hébergé, il vous dit que l'exécution est
payante et demande avant le premier lancement. Ensuite Claude lit le JSON, regarde ce qui a changé
(`git status`, `git diff`) et rend compte : l'agent est un opérateur qui a les droits de son mode, pas le
relecteur de son propre travail.

### Les limites

- **Sans modèle, pas d'Orkeon Code**, et donc pas de chaîne spécification, plan, tranches et audit : sans
  clé ni modèle local, Claude Code travaille seul.
- **Une version candidate.** Orkeon Code `1.0.0-rc.3` peut encore changer avant sa 1.0. Dans cette image
  il tourne sur l'`orkeon-repl` de la version publiée 1.3.0 d'Orkeon, pris dans l'archive de la version :
  son propre téléchargement de moteur ne nomme encore aucun moteur (V-61, V-67), et il le dit. La
  commande `orkeon-code-run` appelle son `orkeon-code run`, que l'image prenait d'un commit de son `main`
  jusqu'à cette version (D115, V-63, V-65, V-67).
- **Ce qui a été mesuré** (V-61) : un dossier sans confiance refusé, puis `main-loop` en mode `plan` sur
  un modèle local, qui répond en une dizaine de secondes. Non mesuré : `dev-plan`, `dev-verify` et
  `dev-learn` jusqu'au bout, et un modèle hébergé.
- **Le harnais ne le surveille pas.** Les hooks du harnais gardent les outils de Claude Code. Ce
  qu'Orkeon Code modifie, il le modifie sous ses propres modes de permission ; la barrière de budget du
  banc ne chiffre pas ses exécutions.

## Les applications de terminal de Studio

Deux applications d'Orkeon Studio tournent dans un terminal du conteneur :

```bash
orkeon-studio-config               # édite et valide les réglages d'Orkeon (~/.config/Orkeon/appsettings.json)
orkeon-studio-run                  # liste les équipes de l'atelier et en lance une
```

Elles sont construites depuis le tag de Studio à la construction de l'image, lancent l'`orkeon` du
conteneur, et listent les équipes de `/workspace/teams` (`ORKEON_STUDIO_TEAMS_ROOT`, que l'image pose).
Une équipe est le même dossier que pour l'application de bureau : sa carte `team.json`, ses lanceurs, ses
points de montage ([Les équipes](../concepts/teams.md)).

- `orkeon-studio-config` écrit les réglages d'Orkeon. `workshop setup keys` écrit la section `Llm` du
  même fichier : après avoir modifié cette section à la main, `workshop setup` vous dit où en sont les
  choses.
- Une équipe lancée depuis `orkeon-studio-run` est lancée par vous, hors de Claude Code : la barrière
  d'exécution, le banc et son budget ne voient pas cette exécution. Sur un modèle hébergé, elle est
  payante, et il lui faut la clé dans son environnement : `workshop exec orkeon-studio-run`.
- `orkeon-studio-check`, comme avant, vérifie une équipe telle que Studio la lit
  ([Le harnais](../reference/harness.md#hooks--les-garde-fous)).

## Versions et mises à jour

Les trois versions sont épinglées ensemble dans l'image (`ORKEON_VERSION`, `ORKEON_CODE_VERSION`,
`ORKEON_STUDIO_VERSION`, [Construire l'image](../../../.devcontainer/README.md)) : Orkeon Code nomme le
commit d'Orkeon pour lequel il a été écrit, Studio la version d'Orkeon contre laquelle il se construit.
Ils bougent avec l'image ([Mettre à jour](./updating.md)) ; `orkeon-update` ne change que la commande
`orkeon`.

Suite : [Modes Docker et SonarQube](./docker-modes.md).
