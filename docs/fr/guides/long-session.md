# Une longue session autonome

*[English](../../guides/long-session.md) · Français*

Une exécution d'une douzaine de tranches dure un jour ou plus. En octobre 2026, une telle exécution
(GAP-50-55, douze tranches sur Orkeon, avec le `/dev-batches` du harnais) a pris 34 h 31 du lancement à sa
pull request pour environ 15 h 30 de travail : 8 h 17 sont parties dans une machine figée, 1 h 35 dans une
limite de débit, et 9 h à attendre que quelqu'un tape « continue ».

Cette chaîne est retirée du harnais (D114), et avec elle son journal d'exécution, sa reprise au démarrage,
l'interrupteur `HARNESS_AUTO_RESUME` et le script superviseur `dev-batches-supervise.sh`. Une longue
exécution de tranches est désormais le `/dev-batches` d'Orkeon Code, dans son REPL
([Développer une fonctionnalité](../workflows/develop.md)). Cette page dit ce qui aide encore une longue
session, et ce qui reste à vous.

## Ce qui aide encore

- **Claude Code attend la fin d'une limite de débit.** Le harnais pose le `CLAUDE_CODE_RETRY_WATCHDOG=1`
  de Claude Code : une requête frappée par un `429` ou un `529` attend la fenêtre et réessaie au lieu
  d'échouer (D82).
- **Orkeon Code garde l'état de ses tranches.** Il l'écrit dans le projet, sous `.orkeon/dev/<code>/`, et
  son REPL nomme au démarrage les tranches qu'une session précédente a laissées ouvertes. Comment il
  reprend est dit dans [sa documentation](https://orkeon.github.io/orkeon-code/). Ses limites de débit
  sont celles de son propre modèle, pas de votre abonnement Claude.
- **Un terminal qui survit à votre fenêtre.** `tmux` est dans l'image : `tmux new -s code`, puis
  `orkeon-code` dedans (`workshop code` en mode keys) ; détachez-vous par Ctrl+B puis D, revenez par `tmux attach -t code`.
- **Les worktrees sur un volume.** Sur un dossier Windows, les commandes de démarrage d'Installer mettent
  les worktrees sur un volume Docker
  ([Modes Docker](docker-modes.md#avancé--les-worktrees-sur-un-volume), D85).

Rien ne relance un Claude Code ou un Orkeon Code qui s'est arrêté, et rien ne tape dans une conversation
qui s'est figée.

## Ce qui reste à vous

- **L'hôte éveillé.** Un hôte Windows qui se met en veille fige le conteneur et tout ce qu'il contient.
  Réglez son mode d'alimentation pour qu'il ne dorme jamais sur secteur (Paramètres, Système,
  Alimentation : « Sur secteur, mettre l'appareil en veille après : Jamais »), ou lancez
  `powercfg /change standby-timeout-ac 0` dans un terminal Windows.
- **Le conteneur.** Après un redémarrage du conteneur, rouvrez la session vous-même.
- **Le disque.** Un dossier d'un disque Windows monté dans le conteneur est sur un montage 9p : GAP-50-55
  a mesuré une lecture 170 fois plus lente que sur le disque propre de Docker, `git status` à 7,8 secondes,
  et tous les blocages de l'exécution à cet endroit.
- **La facture.** Une longue exécution d'Orkeon Code sur un modèle hébergé est payée par la clé que vous
  avez posée ([Les clés des modèles](keys.md)) ; sur le modèle local elle ne coûte rien et va moins vite.

## Voir aussi

- [Développer une fonctionnalité](../workflows/develop.md).
- [Orkeon Code et les applications de terminal de Studio](orkeon-code.md).
- [Référence du harnais](../reference/harness.md#interrupteurs) : `CLAUDE_CODE_RETRY_WATCHDOG`,
  `HARNESS_BUILD_LOCK`, `HARNESS_WORKTREE_ROOT`.
- [Mesurer ce que coûte une session](../workflows/measure.md).
