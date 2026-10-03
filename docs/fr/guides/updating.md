# Mettre à jour

*[English](../../guides/updating.md) · Français*

Trois choses se mettent à jour, chacune à sa façon : Orkeon et Ollama dans un conteneur, le harnais, et
l'image elle-même.

## Orkeon et Ollama, dans un conteneur

```bash
orkeon-update --check              # version installée et versions disponibles ; rien ne change
orkeon-update --source             # reconstruit la ligne de commande depuis le dernier commit de la branche main d'Orkeon (quelques minutes)
orkeon-update --source <commit>    # depuis une branche, une étiquette ou un commit donnés
orkeon-update --channel dev        # la dernière version de développement publiée (nécessite un jeton GitHub Packages)
orkeon-update --channel release    # revient à la dernière préversion étiquetée
orkeon-update --version <version>  # une version publiée précise (1.0.0-rc.4 est plus ancienne que l'Orkeon construit dans l'image)
orkeon-update --ollama             # met aussi Ollama à niveau et redémarre son serveur
```

L'image contient Orkeon construit à partir des sources de `main` (`orkeon --version` se termine par
`.src.<date>.g<commit>`). Une construction depuis les sources a besoin de github.com et de nuget.org : si le
pare-feu est actif, ajoutez `api.nuget.org` à `FIREWALL_EXTRA_DOMAINS`. Dans Claude Code, le skill
`orkeon-update` pilote le même script — demandez *« mets à jour Orkeon »*. Une mise à jour faite ainsi ne
vaut que pour ce conteneur, et les gabarits .NET gardent les paquets de l'image ; pour tout mettre à jour,
mettez à jour l'image. Sans canal ni version explicites, le script ne revient jamais à une version
antérieure. Utilisez `orkeon-update`, et non `dotnet tool update`, qui ne peut pas remplacer un outil
installé dans une couche de l'image.

## Le harnais

Rien à faire : à chaque démarrage, le conteneur synchronise l'atelier avec le harnais de son image
([L'atelier](../concepts/workshop.md#ce-qui-appartient-à-qui)). Une nouvelle image apporte un nouveau
harnais ; les fichiers de l'image que vous avez modifiés sont sauvegardés dans `.claude/harness-backup/`
avant d'être remplacés.

## L'image

```powershell
docker pull ghcr.io/orkeon/orkeon-workshop:latest
docker tag ghcr.io/orkeon/orkeon-workshop:latest orkeon-workshop
```

Un conteneur garde l'image à partir de laquelle il a été créé : pour utiliser la nouvelle, recréez le
conteneur. Votre dossier d'atelier et le volume des modèles ne sont pas dans le conteneur, ils sont donc
conservés.

### Migrer un conteneur vers une nouvelle image

Un conteneur démarré avec les commandes de la page [Installer](../getting-started/install.md) garde l'état
de Claude Code dans son volume `my-orkeon-workshop-claude` : recréez-le avec la même commande, et rien n'est
perdu. Les étapes ci-dessous concernent un conteneur créé sans ce volume.

Un conteneur ne peut ni changer d'image, ni recevoir après coup `--gpus` ou un volume : il faut le recréer,
et **un nouveau conteneur n'hérite pas de la couche en écriture de l'ancien** — `~/.claude` et
`~/.claude.json` (votre connexion à Claude Code, votre historique et votre mémoire), et tout ce qui n'est
pas dans un dossier monté. Les étapes ci-dessous gardent l'ancien conteneur jusqu'à ce que le nouveau soit
validé, et recopient l'état de Claude Code de l'un à l'autre.

Avant de télécharger ou de construire la nouvelle image, conservez la précédente :
`docker tag orkeon-workshop:latest orkeon-workshop:previous`. Puis, dans PowerShell :

```powershell
$c = "my-orkeon-workshop"   # le conteneur à migrer

# 1. Arrêter l'ancien conteneur et le garder sous un autre nom
docker stop $c
docker rename $c "${c}-old"

# 2. Créer le nouveau, sans le démarrer. Le volume sur ~/.claude, avec CLAUDE_CONFIG_DIR,
#    permet à l'état de Claude Code de survivre aux prochaines mises à jour.
docker create -it --init --name $c --gpus=all `
  --cap-add=NET_ADMIN --cap-add=NET_RAW --add-host=host.docker.internal:host-gateway `
  -v /var/run/docker.sock:/var/run/docker-host.sock `
  -v cc-ollama:/home/node/.ollama/models `
  -v "${c}-claude:/home/node/.claude" -e CLAUDE_CONFIG_DIR=/home/node/.claude `
  -v "$env:USERPROFILE\Orkeon:/workspace" `
  -e DOCKER_MODE=socket orkeon-workshop

# 3. Copier l'état de Claude Code de l'ancien conteneur vers le nouveau
cmd /c "docker cp ${c}-old:/home/node/.claude - | docker cp - ${c}:/home/node/"
cmd /c "docker cp ${c}-old:/home/node/.claude.json - | docker cp - ${c}:/home/node/.claude/"

# 4. Le démarrer
docker start -ai $c

# 5. Une fois que le nouveau conteneur fonctionne
docker rm "${c}-old"
```

- L'étape 3 fait passer une archive d'un conteneur à l'autre, ce qui conserve les propriétaires et les
  droits des fichiers. Elle passe par `cmd` parce que Windows PowerShell 5 corrompt les données binaires
  dans un tube (PowerShell 7.4 et `bash` n'en ont pas besoin).
- Avec `CLAUDE_CONFIG_DIR`, `.claude.json` se trouve dans `~/.claude`, d'où sa destination. Sans le volume
  ni la variable, copiez-le vers `${c}:/home/node/`.
- `docker diff "${c}-old"` liste tout ce que l'ancien conteneur a modifié d'autre ; la même paire de
  `docker cp` le transfère.
- Pour revenir en arrière : `docker rm -f $c; docker rename "${c}-old" $c`.

La fois suivante, avec le volume `~/.claude` en place, recréer le conteneur conserve l'état de Claude Code
sans passer par l'étape 3.

## VS Code

Avec la configuration VS Code de l'atelier, **Dev Containers: Rebuild Container** recrée le conteneur sur
l'image `orkeon-workshop` actuelle ; l'état de Claude Code vit dans un volume et survit à l'opération.

Suite : [Options et variables du conteneur](../reference/configuration.md).
