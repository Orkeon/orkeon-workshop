# Outils C#

*[English](../../guides/csharp-tools.md) · Français*

Une équipe YAML ou TypeScript ne fait d'entrées-sorties qu'à travers les outils intégrés d'Orkeon. Tout le
reste — analyser un format binaire, appeler une API interne, faire un calcul lourd — relève d'un **outil Orkeon
en C#**. L'image fournit quatre gabarits .NET — un outil, un plugin, un hôte d'équipe, et
`orkeon-harness-run`, l'exécuteur qui charge les plugins — ainsi que tous les paquets dont ils ont besoin,
pour qu'ils se compilent sans réseau.

> **Prévu (lot 8) :** les skills `orkeon-tool-csharp` et `orkeon-crew-csharp`, et des équipes C# mesurées
> par le banc. Aujourd'hui, Claude travaille à partir des gabarits ci-dessous.

## Les gabarits

Ils se trouvent dans `/usr/local/share/orkeon-harness/csharp/`, dans le conteneur :

| Gabarit | Ce que c'est |
|---|---|
| `OrkeonTool/` | un outil C# sous forme de bibliothèque : `Domain/` (la logique pure), `Tool/` (l'outil Orkeon, qui n'accède aux fichiers que par le système de fichiers virtuel), des tests |
| `OrkeonPlugin/` | un plugin qui enregistre l'outil, à déposer dans un dossier de plugins |
| `OrkeonRunner/` | `orkeon-harness-run` : la chaîne de traitement d'`orkeon run` **plus le chargement des plugins** — installé dans le `PATH` |
| `OrkeonCrewHost/` | un programme console qui héberge une équipe C# : montages tirés de `mounts.json`, outils, crew, un fichier d'événements |

Chacun est une solution autonome qui suit les conventions du dépôt Orkeon (tous les analyseurs,
avertissements traités comme des erreurs, versions de paquets centralisées, xUnit v3) : du code écrit ici
passerait l'intégration continue d'Orkeon.

## Créer un outil

Un outil C# vit dans le dossier `library/tools/csharp/<Name>/` de l'atelier. À partir du gabarit :

```bash
/usr/local/share/orkeon-harness/csharp/OrkeonTool/new-tool.sh InvoiceParser invoice_parser /workspace/library/tools/csharp
cd /workspace/library/tools/csharp/InvoiceParser
dotnet build -c Release && dotnet test
```

`InvoiceParser` donne son nom aux projets, à l'espace de noms et aux classes ; `invoice_parser` est le nom
qu'un crew liste sous `tools:`. La logique d'exemple du gabarit (`KeyValueExtractor`) sert de point de
départ : remplacez-la par la vôtre, puis adaptez les types record de la requête et de la réponse, ainsi
que les tests.

**L'accès aux fichiers passe par le système de fichiers virtuel d'Orkeon.** Un analyseur fait de
`System.IO` une erreur de compilation dans `src/` (`ORKVFS001`–`007`) : un outil lit `/invoices/march.pdf`,
jamais un chemin du disque.

## Mettre l'outil à disposition d'une équipe

| | Plugin + `orkeon-harness-run` | Hôte C# |
|---|---|---|
| Le crew | YAML ou `.ork.ts`, inchangé — il liste l'outil par son nom | YAML sous `crew/`, ou construit en C# |
| L'outil | une DLL déposée dans un dossier | compilé dans l'hôte |
| `--validate`, `--list-tools`, `--events jsonl` | oui | `--validate` et un fichier d'événements |
| Lancé par Orkeon Studio | non | non |
| Fonctions propres à C# (graphes d'états, flux, stockage des points de contrôle, reprise) | non | oui |

**La voie du plugin** est essayée en premier. Ni `orkeon run` ni Studio ne chargent de plugins, d'où
l'exécuteur propre au harnais :

```bash
orkeon-harness-run crew --plugins /workspace/library/plugins --validate
orkeon-harness-run crew --plugins /workspace/library/plugins --events jsonl
```

Sans `--mount`, il lit le `mounts.json` de l'équipe, et `TEAM_ENV=<set>` applique un jeu de dossiers ; sans
`--settings`, il transmet le fichier de réglages propre à l'équipe, `settings/<slug>/appsettings.json` de
l'atelier, s'il existe — comme les lanceurs. Une équipe qui utilise un outil en plugin est lancée par cet
exécuteur, pas par Studio.

**L'hôte C#** (`OrkeonCrewHost/`) est la solution de repli, et la seule voie pour les fonctions que seul C#
expose.

## Compiler sans réseau

Le pare-feu du conteneur, quand il est actif, rejette nuget.org. Peu importe : les paquets Orkeon que
nuget.org ne propose pas ont été empaquetés à partir des sources d'Orkeon dans un flux local à la
construction de l'image, et tous les paquets dont les gabarits ont besoin sont dans le cache partagé
(`NUGET_PACKAGES`). Un nouvel outil se restaure et se compile hors ligne. Ajouter un paquet absent du
cache demande le réseau — ouvrez `api.nuget.org` avec `FIREWALL_EXTRA_DOMAINS`
([configuration](../reference/configuration.md#pare-feu)).

Pour vérifier l'ensemble en une seule commande :

```bash
/usr/local/share/orkeon-harness/csharp/scripts/verify-templates.sh --offline --smoke
```

Le script restaure, compile et teste chaque gabarit sur une copie, recommence la compilation réseau coupé,
puis charge le plugin de bout en bout avec l'exécuteur.

## Un projet .NET partagé avec Windows

Quand les dossiers `bin/` et `obj/` d'un projet ont été produits sous Windows, nettoyez-les et restaurez le
projet pour le conteneur :

```bash
clean-restore.sh /workspace/library/tools/csharp/InvoiceParser
```

Le script refuse la racine de l'atelier — vos équipes ne sont pas des sorties de compilation.

Pour aller plus loin : le [README des gabarits](../../../.devcontainer/csharp/README.md), en anglais (le flux local,
l'intégration dans l'image, ce qui diffère de la documentation d'Orkeon).

Suite : [Modèles : locaux et distants](./models.md).
