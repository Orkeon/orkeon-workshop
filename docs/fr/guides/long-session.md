# Une longue session autonome

Un run `/dev-batches` d'une douzaine de tranches dure un jour ou plus. En octobre 2026, un tel run (GAP-50-55,
douze tranches sur Orkeon) a pris 34 h 31 du lancement à sa pull request pour environ 15 h 30 de travail :
8 h 17 sont parties dans une machine figée, 1 h 35 dans une limite de débit, et 9 h à attendre que quelqu'un
tape « reprends » — une nuit après l'arrêt du conteneur, deux heures après la remise à zéro de la limite, un
blocage de 4 h 28 levé par « t'en es où ? ». Cette page dit ce que le harnais fait pour chacun, et ce qui reste
à vous.

## Ce que fait le harnais

- **Il tient un journal du run.** `/dev-batches` ajoute une ligne par événement — une tranche lancée, rendue,
  fusionnée, relancée, arrêtée, un blocage — à `<work>/<code>/<CODE>-BATCHES-STATE.md`, au fil du run.
- **Il reprend après un redémarrage.** À chaque démarrage de Claude Code (un nouveau `claude`, un
  `claude --continue`, le conteneur redémarré), un hook lit ce journal et dit à Claude quelles tranches le run a
  laissées ouvertes. Les agents d'arrière-plan du processus précédent sont perdus ; leurs worktrees et leurs
  points de contrôle (un commit local après chaque étape verte) ne le sont pas. Claude relance le préflight —
  une identité git exportée par `workshop --git-identity` meurt avec le processus qui la tenait —, puis reprend
  chaque tranche ouverte depuis ses points de contrôle : après vous avoir demandé une fois par défaut, sans
  demander quand vous réglez `HARNESS_AUTO_RESUME=1` dans vos réglages (D82).
- **Il attend la fin d'une limite de débit.** Le harnais règle `CLAUDE_CODE_RETRY_WATCHDOG=1` de Claude Code :
  une requête frappée par un `429` attend la fenêtre et réessaie au lieu d'échouer. Un agent de tranche qui a
  échoué malgré tout est repris depuis ses points de contrôle comme une tranche arrêtée.
- **Il note les blocages.** Un agent de tranche attend par tranches de 270 secondes ; une tranche qui revient
  plus de dix minutes en retard est un blocage (l'hôte en veille, le disque figé), noté dans le rapport de la
  tranche et dans le journal, pour que le prochain rapport d'usage l'attribue sans deviner.
- **Il prévient avant le lancement.** Le préflight affiche la mémoire (deux tranches par 15 Go), le type du
  disque où se trouve la copie, et les worktrees qu'un run arrêté a laissés.

## Le superviseur

Rien ne relance un Claude Code qui s'est arrêté, et rien ne tape dans une conversation bloquée. Pour un run qui
passe la nuit, `/dev-batches` vous remet `.claude/local/scripts/dev-batches-supervise.sh` (D83). Une fois :

1. Réglez `HARNESS_AUTO_RESUME` à `1` dans `.claude/settings.local.json`
   (`"env": {"HARNESS_AUTO_RESUME": "1"}`), pour qu'une session reprise continue sans question.
2. Quittez Claude Code (`/exit`). Dans un terminal du conteneur :

   ```bash
   bash .claude/local/scripts/dev-batches-supervise.sh
   ```

3. Puis rattachez-vous à la session qu'il a ouverte :

   ```bash
   tmux attach -t dev-batches
   ```

   La conversation y revient (`claude --continue`), et le run continue. Détachez-vous avec Ctrl+B puis D ; la
   session continue de tourner.

Chaque minute, tant que le journal a une tranche ouverte, le superviseur retape `claude --continue` quand la
session s'est arrêtée, et envoie un message — `Resume the batches` — quand aucune transcription du projet n'a été
écrite depuis 30 minutes (`--idle`). Il ne tape jamais dans une conversation qui travaille, et s'arrête de
lui-même une fois que `/dev-batches` clôt le run. Son journal est `.claude/local/logs/dev-batches-supervise.log` ;
`--check` affiche ce qu'il voit sans rien faire. Il garde une session interactive, jamais `claude -p` : un run
`-p` n'attend pas la fin d'une limite de débit.

## Ce qui reste à vous

- **L'hôte éveillé.** Un hôte Windows qui se met en veille fige le conteneur et chaque tranche. Réglez son plan
  d'alimentation pour qu'il ne se mette jamais en veille sur secteur (Paramètres, Système, Alimentation :
  « Sur secteur, mettre mon appareil en veille après : Jamais »), ou lancez `powercfg /change standby-timeout-ac 0`
  dans un terminal Windows.
- **Le conteneur.** Le superviseur ne peut pas démarrer un conteneur arrêté : après un redémarrage du conteneur,
  relancez-le (étape 2).
- **Le disque.** Un dossier d'un disque Windows monté dans le conteneur est sur un montage 9p : GAP-50-55 y a
  mesuré une lecture 170 fois plus lente que sur le disque propre de Docker, `git status` à 7,8 secondes, et
  chaque blocage du run. Gardez votre dossier où il est et mettez les worktrees des tranches sur un volume
  Docker, le réglage avancé des [modes Docker](docker-modes.md#avancé--les-worktrees-sur-un-volume) : des
  builds deux fois plus rapides, un worktree créé 70 fois plus vite (D85).
- **Pendant que les tranches tournent**, une question passe par `/btw` ; jamais Échap, Ctrl+C ni Ctrl+X Ctrl+K,
  qui arrêtent les agents d'arrière-plan, et aucun message avant que la conversation soit au repos.

## Voir aussi

- [Développer une fonctionnalité](../workflows/develop.md) : la chaîne dev et `/dev-batches`.
- [Référence du harnais](../reference/harness.md) : `HARNESS_AUTO_RESUME`, `HARNESS_DEV_BATCHES_MAX`,
  `HARNESS_BUILD_LOCK`.
- [Mesurer ce que coûte une session](../workflows/measure.md).
