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
exécute un prototype ; les premières étapes de la méthode sont pilotées par des skills — ouvrir le
cahier d'une équipe, l'entretien qui rédige son besoin, les critères et le plan de test, la conception
et son plan, les tests, les décisions, l'état, et vos validations,
tapées et enregistrées — les premiers tests d'une équipe tournent déjà sur un modèle simulé, sans rien
coûter, et `/deploy` empaquette une équipe pour un autre atelier ; les étapes suivantes sont suivies à la
main en attendant leurs skills ([feuille de route](./README.md#feuille-de-route)).

**Faut-il savoir programmer ?**
Non, pas pour construire et exécuter des équipes simples : vous décrivez ce que vous voulez, Claude fait le
reste, et la visite guidée (`/orkeon-tour`) explique tout avec des mots simples. Pour l'installer, vous
copierez quelques commandes dans un terminal. Si vous programmez, vous en tirerez davantage : les outils
TypeScript et C#, le banc, les hooks.

**Faut-il lire l'anglais ?**
Très peu. Claude vous répond dans la langue de vos messages, et une commande, tapée une fois au début —
`/workshop-language fr`, ou toute autre langue — fait de cette langue celle de votre atelier : Claude
converse alors dans cette langue même quand vous ne tapez que des commandes, et y rédige les documents qui
décrivent vos équipes — besoin, critères, plan de test, conception
([Votre langue](./getting-started/install.md#votre-langue)). Les commandes elles-mêmes, les titres des
documents et ce que lisent les scripts restent en anglais. Les messages du terminal et les écrans de
Claude Code lui-même aussi : la page Installer vous y guide pas à pas.

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
lentement. Retirez alors `--gpus=all` de la commande de démarrage. Si un démarrage avec l'option a déjà
échoué, supprimez d'abord le conteneur qu'il a laissé : `docker rm my-orkeon-workshop`
([Dépannage](./reference/troubleshooting.md#loption---gpusall)).

**Est-ce que ça fonctionne sur Mac ?**
Ce n'est pas testé : l'image est construite pour `linux/amd64` uniquement.

**Puis-je l'utiliser sans Docker ?**
Non : l'image est le produit — Claude Code, la ligne de commande d'Orkeon, les modèles locaux et le harnais,
configurés pour fonctionner ensemble.

**Où sont mes équipes ?**
Dans le sous-dossier `teams/` de votre atelier. L'atelier est le dossier monté sur `/workspace`, quel que
soit son nom ; sous Windows, Orkeon Studio liste ces équipes — de lui-même quand l'atelier est
`%USERPROFILE%\Orkeon`, une fois son sous-dossier `teams` indiqué à Studio sinon
([L'atelier](./concepts/workshop.md#orkeon-studio-le-voit)). La
façon dont chacune a été construite est consignée dans `workbooks/`, ses preuves dans
`tests/`. Ce sont de simples fichiers : vous pouvez les lire et les modifier avec n'importe quel éditeur.

**Puis-je versionner mon atelier avec git ?**
Oui : `git init` dans le dossier de l'atelier. Le `.gitignore` créé par le harnais exclut les exécutions,
les jeux de dossiers `mounts.*/`, les sorties de compilation, les sauvegardes et les réglages locaux, et le
`.gitignore` propre à chaque équipe exclut ce que l'équipe lit et écrit dans ses dossiers. Claude committe
et pousse ce qu'une étape a produit, avec l'identité git que vous avez posée (D71) ; un tag est proposé,
c'est vous qui le lancez. Versionnez aussi le `.gitattributes`
qu'il a créé : il évite qu'un clone fait sous Windows sorte en CRLF, ce que le conteneur ne peut pas
exécuter ([Le versionner avec git](./concepts/workshop.md#le-versionner-avec-git)).

**Claude me demande de taper une commande : où la taper ?**
Claude exécute presque tout lui-même ; il ne vous remet une commande que quand il ne peut pas — un tag
git, une valeur qu'il ne doit pas voir, une action sur votre ordinateur, un changement de votre terminal. Il
dit alors où va la ligne, une ligne par étape : dans Claude Code (une `/commande`) ; dans le terminal du
conteneur, après avoir tapé `/exit` pour quitter Claude Code (`workshop` le rouvre) ; ou dans un terminal
de votre ordinateur (PowerShell sous Windows), pour les commandes `docker`. Un script qu'il a écrit pour
vous se lance avec `bash <chemin>`, jamais `./<nom>.sh` : un dossier d'atelier monté depuis Windows ne
garde pas le bit exécutable. Si une ligne échoue, collez son dernier message à Claude.

**Comment donner une clé, un mot de passe ou un réglage que je garde pour moi ?**
Jamais dans la conversation : Claude le garderait. Pour cette session, tapez `/exit`, puis
`workshop --secret ZAI_API_KEY` (la variable que vos réglages nomment) : le terminal demande la valeur, ne
l'affiche pas pendant que vous la tapez, ne la garde pas, et ouvre Claude Code avec. Pour la garder pour le
conteneur, définissez la variable sur votre ordinateur et ajoutez `-e ZAI_API_KEY` (sans valeur) à la
commande `docker run` : Docker la transmet
([Modèles](./guides/models.md#comment-une-clé-arrive-dans-le-conteneur)). Un réglage que vous gardez pour
vous — une liste de destinataires, une adresse — c'est vous qui le remplissez dans le fichier que Claude
nomme, avec un éditeur de votre ordinateur ; Claude vérifie que le fichier est accepté sans lire la valeur.

**Quel nom figure sur les commits que Claude fait ?**
L'identité que git a dans le conteneur. Donnez-la pour une session avec `/exit`, puis
`workshop --git-identity "<nom>" <email>` — rien n'est écrit sur le disque —, ou pour le conteneur avec
`-e GIT_AUTHOR_NAME=… -e GIT_AUTHOR_EMAIL=… -e GIT_COMMITTER_NAME=… -e GIT_COMMITTER_EMAIL=…` sur
`docker run` ([Configuration](./reference/configuration.md#variables-de-limage)). Sans elle, Claude
s'arrête avant le commit et vous la demande ; il n'invente jamais un nom.

**Quelle différence entre Claude Code et le harnais ?**
Claude Code est l'assistant de programmation d'Anthropic, installé sans modification. Le harnais est ce que
l'atelier ajoute autour : skills, sous-agents, règles, hooks, gabarits et documents de référence, plus
`orkeon-bench` et les gabarits .NET. Il est découpé en packs composés en profils : le profil `user` est
l'atelier décrit dans ces pages ([profils et packs](./reference/harness.md#profils-et-packs)).

**Je contribue à Orkeon lui-même : l'atelier est-il pour moi ?**
Oui. Un profil source (`contrib`, `dev`, `release`, `docs`) déploie les skills de développement du harnais
dans une copie de travail git d'Orkeon ou de ce projet plutôt que dans un atelier : `-e HARNESS_PROFILE=dev`
au premier `docker run`, ou `/workshop-profile dev` ensuite. Rien de ce que git suit n'est écrit
([dans une copie de travail](./reference/harness.md#dans-une-copie-de-travail)).

**Le projet est-il affilié à Anthropic ? Est-ce une version de Claude Code ?**
Non, ni l'un ni l'autre. Orkeon Workshop est un projet open source indépendant. Il installe Claude Code à
partir du paquet officiel d'Anthropic, et l'image qu'il publie ne contient pas du tout Claude Code : un
conteneur le télécharge à son premier démarrage.

**Les équipes peuvent-elles utiliser un autre modèle que Claude ?**
Oui. Claude Code construit les équipes ; les équipes elles-mêmes utilisent n'importe quel modèle pris en
charge par Orkeon — le modèle local d'Ollama nommé à la création du conteneur, ou un fournisseur distant que vous configurez
([Modèles](./guides/models.md)).

**Que veut dire « prévu » dans ces pages ?**
Une partie de la méthode conçue mais pas encore construite, comme les skills `team-*` des étapes
suivantes ou les niveaux local et distant d'`orkeon-bench run`. La [feuille de route](./README.md#feuille-de-route) indique quand elle arrive.

**Quelle est la licence ?**
MIT. Certains éléments sont adaptés de trois projets sous licence MIT, et quelques fichiers dérivent du
devcontainer de référence d'Anthropic et restent, pour ces parties, sous les conditions d'Anthropic :
[`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md) les liste.
