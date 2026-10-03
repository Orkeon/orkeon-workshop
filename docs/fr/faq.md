# FAQ

*[English](../faq.md) · Français*

**Qu'est-ce qu'Orkeon ?**
Un framework .NET open source pour des équipes d'agents d'IA : agents, tâches et outils, déclarés en YAML,
TypeScript ou C# ([github.com/Orkeon/orkeon](https://github.com/Orkeon/orkeon)). **Orkeon Studio** est son
application de bureau, sous Windows : elle liste vos équipes et les exécute.

**Qu'apporte Orkeon Workshop ?**
Une méthode et ses garde-fous. Claude Code sait écrire une équipe en quelques minutes ; l'atelier lui fait
consigner le besoin, définir ce que « terminé » veut dire, écrire les tests d'abord, exécuter l'équipe sur
des modèles simulés, locaux et distants, la passer en revue et garder une trace de chaque tentative et de
chaque décision — pour que vous puissiez compter sur l'équipe. Aujourd'hui, Claude écrit, vérifie et
exécute un prototype, et peut suivre la méthode à la main ; les skills qui la pilotent pas à pas et le
modèle simulé sont en cours de construction ([feuille de route](./README.md#feuille-de-route)).

**Faut-il savoir programmer ?**
Non, pas pour construire et exécuter des équipes simples : vous décrivez ce que vous voulez, Claude fait le
reste, et la visite guidée (`/orkeon-tour`) explique tout avec des mots simples. Pour l'installer, vous
copierez quelques commandes dans un terminal. Si vous programmez, vous en tirerez davantage : les outils
TypeScript et C#, le banc, les hooks.

**Combien ça coûte ?**
Orkeon Workshop est gratuit (licence MIT). Il vous faut un compte Claude qui donne accès à Claude Code. Vos
équipes s'exécutent par défaut sur un modèle local, qui ne coûte rien d'autre que du temps machine. Un
modèle distant (Anthropic, OpenAI…) se paie auprès de son fournisseur, et l'atelier n'y fait jamais appel
sans votre accord explicite.

**Mes données quittent-elles mon ordinateur ?**
Claude Code travaille avec Claude, un modèle hébergé en ligne : ce que Claude lit dans l'atelier — vos
demandes, les fichiers qu'il ouvre — est envoyé à Anthropic pour être traité, selon les conditions de votre
compte Claude. Les exécutions de vos équipes sur le modèle local restent sur votre ordinateur. Une exécution
sur un modèle distant envoie ses entrées à ce fournisseur. Les clés ont leur place dans des variables
d'environnement : un hook refuse toute modification de Claude qui écrirait une clé dans les dossiers des
équipes, des cahiers, des tests, des réglages, des jeux de dossiers, de la bibliothèque ou des références.

**Faut-il une carte graphique ?**
Non. Avec un GPU NVIDIA, les modèles locaux sont rapides ; sans, ils tournent sur le processeur, plus
lentement. Retirez alors `--gpus=all` de la commande de démarrage.

**Est-ce que ça fonctionne sur Mac ?**
Ce n'est pas testé : l'image est construite pour `linux/amd64` uniquement.

**Puis-je l'utiliser sans Docker ?**
Non : l'image est le produit — Claude Code, la ligne de commande d'Orkeon, les modèles locaux et le harnais,
configurés pour fonctionner ensemble.

**Où sont mes équipes ?**
Dans le sous-dossier `teams/` de votre atelier — sous Windows, `%USERPROFILE%\Orkeon\teams`, celui que liste
Orkeon Studio. La façon dont chacune a été construite est consignée dans `workbooks/`, ses preuves dans
`tests/`. Ce sont de simples fichiers : vous pouvez les lire et les modifier avec n'importe quel éditeur.

**Puis-je versionner mon atelier avec git ?**
Oui : `git init` dans le dossier de l'atelier. Le `.gitignore` créé par le harnais exclut les exécutions,
les jeux de dossiers `mounts.*/`, les sorties de compilation, les sauvegardes et les réglages locaux, et le
`.gitignore` propre à chaque équipe exclut ce que l'équipe lit et écrit dans ses dossiers. Le harnais ne
fait jamais de commit à votre place : il vous propose la commande.

**Quelle différence entre Claude Code et le harnais ?**
Claude Code est l'assistant de programmation d'Anthropic, installé sans modification. Le harnais est ce que
l'atelier ajoute autour : skills, sous-agents, règles, hooks, gabarits et documents de référence, plus
`orkeon-bench` et les gabarits .NET.

**Le projet est-il affilié à Anthropic ? Est-ce une version de Claude Code ?**
Non, ni l'un ni l'autre. Orkeon Workshop est un projet open source indépendant. Il installe Claude Code à
partir du paquet officiel d'Anthropic, et l'image qu'il publie ne contient pas du tout Claude Code : un
conteneur le télécharge à son premier démarrage.

**Les équipes peuvent-elles utiliser un autre modèle que Claude ?**
Oui. Claude Code construit les équipes ; les équipes elles-mêmes utilisent n'importe quel modèle pris en
charge par Orkeon — par défaut le modèle local d'Ollama, ou un fournisseur distant que vous configurez
([Modèles](./guides/models.md)).

**Que veut dire « prévu » dans ces pages ?**
Une partie de la méthode conçue mais pas encore construite, comme les skills `team-*` ou
`orkeon-bench run`. La [feuille de route](./README.md#feuille-de-route) indique quel lot l'apporte.

**Quelle est la licence ?**
MIT. Certains éléments sont adaptés de deux projets sous licence MIT, et quelques fichiers dérivent du
devcontainer de référence d'Anthropic et restent, pour ces parties, sous les conditions d'Anthropic :
[`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md) les liste.
