# Les clés des modèles : les deux modes

*[English](../../guides/keys.md) · Français*

Un atelier reçoit ses clés de modèles de l'une de deux façons (D108, D109). Le mode dit où vivent les
clés des **modèles** ; il ne change rien d'autre.

| | `subscription` (par défaut) | `keys` |
|---|---|---|
| Claude Code tourne sur | votre abonnement Claude, par sa connexion | la même connexion — ou votre compte API, avec `--claude-on-key` |
| Vos équipes tournent sur | le modèle local (Ollama) | le modèle hébergé que vous nommez |
| Orkeon Code tourne sur | le modèle local | le modèle hébergé que vous nommez |
| Vous payez | l'abonnement ; le modèle local ne coûte que du temps machine | l'abonnement, **et** le fournisseur de la clé, au jeton |
| Une clé de modèle sur le disque | aucune | un seul fichier : `.claude/settings.local.json` |

**Orkeon ne peut pas tourner sur un abonnement Claude.** Son fournisseur Anthropic envoie une clé d'API et
rien d'autre, et la connexion d'un abonnement est réservée aux applications d'Anthropic. Sans clé, Claude
Code est donc seul à tourner sur Claude ; les équipes et Orkeon Code tournent sur le modèle local, et
Orkeon donne ses outils à Claude Code ([Les outils d'Orkeon dans Claude Code](./orkeon-tools.md)).

## Les commandes

Tapez-les **dans un terminal du conteneur**, jamais dans la conversation avec Claude : Claude garderait
ce que vous y tapez. Quittez d'abord Claude Code (`/exit`), ou ouvrez un second terminal.

```bash
workshop setup                     # identique à : workshop setup status
workshop setup keys --provider <id> --model <modèle> [--claude-on-key] [--base-url <url>] [--key-variable <NOM>]
workshop setup subscription [--yes]

workshop code [arguments d'orkeon-code]      # le REPL d'Orkeon Code, avec les clés de setup
workshop exec <commande> [arguments]         # toute commande de ce terminal, avec les clés de setup
```

`workshop setup keys` demande la clé et n'affiche rien pendant la frappe. Ensuite, **relancez Claude
Code** (`/exit`, puis `workshop`) : une session lit ses réglages à son démarrage.

| Option | Sens |
|---|---|
| `--provider <id>` | l'un des fournisseurs ci-dessous, ou `custom` |
| `--model <modèle>` | le modèle que les équipes appellent, tel que le fournisseur le nomme |
| `--claude-on-key` | `anthropic` seulement : Claude Code prend la clé lui aussi, et facture le compte API au lieu de l'abonnement |
| `--base-url <url>` | le point d'accès ; obligatoire pour `custom`, celui du fournisseur sinon |
| `--key-variable <NOM>` | la variable qui porte la clé ; obligatoire pour `custom`, celle du fournisseur sinon |

| Fournisseur | Point d'accès | Variable écrite |
|---|---|---|
| `anthropic` | `https://api.anthropic.com` | `WORKSHOP_ANTHROPIC_API_KEY` (`ANTHROPIC_API_KEY` avec `--claude-on-key`) |
| `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `mistral` | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` |
| `deepseek` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |
| `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `grok` | `https://api.x.ai/v1` | `XAI_API_KEY` |
| `together` | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` |
| `custom` | votre `--base-url` | votre `--key-variable` |

Trois choses sont refusées, avec la raison : une variable dont le nom commence par `ORKEON_` (Orkeon
charge toute variable de ce nom dans sa configuration, où les outils d'un crew peuvent la lire) ;
`ANTHROPIC_API_KEY` comme variable sans `--claude-on-key` ; `--claude-on-key` avec un autre fournisseur
qu'`anthropic`.

Le pare-feu, quand il est actif, autorise `api.anthropic.com` ; tout autre fournisseur doit avoir son hôte
dans `FIREWALL_EXTRA_DOMAINS` ([configuration](../reference/configuration.md#pare-feu)).

### Où en sont les choses

```text
$ workshop setup
mode: keys
keys in .claude/settings.local.json: WORKSHOP_ANTHROPIC_API_KEY
Claude Code: on its sign-in
teams: <model> at https://api.anthropic.com — remote: a run is paid
key variable of the teams: WORKSHOP_ANTHROPIC_API_KEY
```

La commande affiche des noms, jamais une valeur. `NOT SET` après la variable de clé veut dire que les
réglages d'Orkeon nomment une variable qui n'est ni dans le fichier ni dans l'environnement. En dessous,
les trois commandes sont
[`orkeon-bench setup`](../reference/orkeon-bench.md#setup--les-clés-des-modèles-pour-claude-code-et-orkeon).

## Ce qui est écrit, et où

| Fichier | Ce que `setup keys` écrit | Dans git |
|---|---|---|
| `.claude/settings.local.json`, dans votre dossier | la clé, dans son bloc `env`, sous la variable ci-dessus ; le fichier passe en mode `0600` | ignoré par le `.gitignore` de l'atelier |
| `~/.config/Orkeon/appsettings.json`, dans le conteneur | le **nom** de la variable (`Llm:ApiKeyEnvVar`), le modèle (`Llm:Model`) et le point d'accès (`Llm:BaseUrl`) ; un `Llm:ApiKey` qui s'y trouvait est retiré ; la borne d'une requête à la fois du modèle local (`RateLimiting:MaxConcurrentRequests` et `QueueLimit`) est levée ; le reste du fichier est conservé | hors de votre dossier |
| `.claude/local/setup.json`, dans votre dossier | les noms des variables écrites, le modèle, le point d'accès et la variable choisis, et les sections `Llm` et `RateLimiting` qu'Orkeon avait avant, pour les lui rendre ; jamais une clé | ignoré par le `.gitignore` de l'atelier |

Claude Code donne le bloc `env` à chaque commande et à chaque serveur MCP qu'il lance (V-59). `orkeon`,
`orkeon-bench`, `orkeon-code-run` et le serveur MCP d'Orkeon trouvent donc la clé dans leur
environnement, sans fichier à eux. Un terminal que vous ouvrez vous-même ne lit pas ce bloc. Deux commandes
donnent les clés de setup à ce que vous y lancez à la main : `workshop code` ouvre le REPL d'Orkeon Code
avec elles, et `workshop exec <commande>` lance n'importe quelle commande avec elles
(`workshop exec orkeon run …`, `workshop exec ./run.sh`, `workshop exec orkeon-studio-run`). Les clés
sont lues pour cette seule commande : rien n'est exporté dans votre shell, rien n'est affiché. En mode
`subscription`, les deux lancent la commande telle quelle.

Un atelier versionné avec git avant novembre 2026 a un `.gitignore` plus ancien. L'image ne le réécrit
jamais, mais au prochain démarrage elle y ajoute les lignes qui manquent — `.claude/local/setup.json`,
`.claude/local/mcp-calls.tsv`, `.orkeon/` — et le dit dans une ligne `[harness] .gitignore:`
([Mettre à jour](./updating.md#le-harnais)). `.claude/settings.local.json` y était déjà.

## Avec une clé : ce qui change, ce qui ne change pas

- **Claude Code reste sur sa connexion.** La clé Anthropic des équipes est écrite sous
  `WORKSHOP_ANTHROPIC_API_KEY`, un nom que Claude Code ne lit pas. Seul `--claude-on-key` écrit
  `ANTHROPIC_API_KEY` ; Claude Code facture alors le compte API au lieu de l'abonnement.
- **Les requêtes des équipes ne sont plus tenues à une à la fois.** Pour le modèle local, l'image écrit
  `RateLimiting.MaxConcurrentRequests: 1` et un `QueueLimit` dans les réglages d'Orkeon, puisqu'Ollama
  répond à une requête à la fois. Un fournisseur hébergé, non : `setup keys` retire ces deux valeurs (le
  reste de la section est conservé) et affiche `the one-request-at-a-time bound of the local model
  is lifted` ; `setup subscription` rend la section telle qu'elle était.
- **Une exécution d'équipe sur ce modèle est payante**, et la barrière de budget s'applique comme avant :
  `orkeon-bench estimate`, puis votre `/team-approve remote <usd>` avant toute exécution payante
  ([Modèles](./models.md#laccord-pour-les-exécutions-payantes)).
- **Orkeon Code sur ce modèle est payant aussi**, et aucune barrière du banc ne le chiffre :
  `/orkeon-code` vous le dit et demande avant le premier lancement d'une session
  ([Orkeon Code](./orkeon-code.md)).
- **Claude n'écrit toujours jamais de clé**, et ne vous en demande jamais : le garde-fou des clés refuse
  ce qui a la forme d'une clé sous `.claude/`, ce fichier compris, et les réglages du harnais refusent à
  Claude le `Read` de `.claude/settings.local.json`. `orkeon-bench setup` est le seul à l'écrire. Ce refus
  est un garde-fou contre les accidents, pas un mur : la clé est dans l'environnement de chaque commande
  que Claude Code lance (plus bas).

## Les limites

Dites clairement, pour que vous choisissiez en connaissance de cause :

- **La clé est dans l'environnement de chaque commande que Claude Code lance**, comme l'est une clé
  donnée par `workshop --secret`. Une commande, un script ou un outil de crew qui lit son environnement
  la lit. Dans un conteneur, Orkeon exécute `shell_command` sans confinement : ne donnez cet outil à
  aucun agent qui lit des entrées non fiables ([Modèles](./models.md#modèles-distants)).
- **Le fichier est dans le dossier de votre atelier, sur votre machine.** Un dossier Windows monté dans
  le conteneur ignore le mode `0600` : tout compte qui lit le dossier lit la clé. Un dossier synchronisé
  vers un nuage (OneDrive, Dropbox, iCloud) y copie le fichier. Une sauvegarde du dossier le contient.
- **Git ignore le fichier ; rien d'autre ne le protège.** Un `git add -f`, une archive du dossier ou une
  copie de `.claude/` emporte la clé.
- **Les réglages d'Orkeon vivent dans le conteneur, la clé dans votre dossier.** Un nouveau conteneur
  (une mise à jour de l'image) écrit des réglages neufs, pour le modèle local. Le démarrage du conteneur
  remet votre choix de lui-même (`orkeon-bench setup apply` : le modèle, le point d'accès et la variable
  sont gardés dans `.claude/local/setup.json`), et le dit en une ligne :
  `[orkeon] mode keys: Orkeon's settings put back on what setup keys chose (…)`. Rien à taper.
- **Ce qui a été mesuré** : Claude Code qui donne le bloc `env` à une commande et à un serveur MCP, et
  `ANTHROPIC_API_KEY` dans ce bloc qui l'emporte sur la connexion, avec `claude -p` (V-59). Dans une
  session interactive, Claude Code peut poser une fois la question d'une clé qu'il trouve ; cela n'a pas
  été mesuré.

Si l'une de ces limites n'est pas acceptable, restez en `subscription` et donnez la clé pour une session
ou un conteneur. Les trois chemins antérieurs fonctionnent toujours et gardent les clés hors du disque
([Comment une clé arrive dans le conteneur](./models.md#comment-une-clé-arrive-dans-le-conteneur)) :

| Chemin | Dure |
|---|---|
| `workshop --secret <NOM>`, dans le terminal du conteneur | la session |
| `-e <NOM>` sur `docker run`, la variable étant définie sur votre ordinateur | le conteneur |
| `remoteEnv` dans `.devcontainer/devcontainer.json` | chaque conteneur que VS Code ouvre |

Avec eux, écrivez vous-même les réglages d'Orkeon (`Llm:Model`, `Llm:BaseUrl`, `Llm:ApiKeyEnvVar`), et
évitez `ANTHROPIC_API_KEY` comme nom, sauf si vous voulez Claude Code sur le compte API.

Une clé qui n'est pas celle d'un modèle — une clé de recherche comme `TAVILY_API_KEY` — est hors des deux
modes : donnez-la par `workshop --secret`, dans un mode comme dans l'autre.

## Revenir en arrière

```bash
workshop setup subscription        # demande confirmation ; --yes saute la question
```

La commande retire du bloc `env` les variables que `setup keys` a écrites, et elles seules ; elle rend à
Orkeon la section `Llm` qu'il avait avant le premier `setup keys` (ou retire la section quand il n'y en
avait pas, et dit comment en écrire une : `orkeon init --provider ollama --model <modèle>`) et la section
`RateLimiting` avec elle, si bien que le modèle local répond de nouveau à une requête à la fois ; elle vide
`.claude/local/setup.json`. Relancez ensuite Claude Code.

Elle ne révoque pas la clé : une clé qui a séjourné dans un dossier synchronisé ou dans une sauvegarde se
révoque chez le fournisseur.

Suite : [Les outils d'Orkeon dans Claude Code](./orkeon-tools.md).
