import { isWithin } from '../paths.js';
import type { MountBinding } from './mount-binding.js';

/** The file `scaffold` leaves in each folder of a mount point, so that git keeps the folder. */
export const FOLDER_KEEPER = '.gitkeep';

/**
 * `teams/<slug>/.gitignore`: the folders of the mount points hold the team's data — the mail it
 * triages, its deliverables, its state — which a pushed workshop must not carry. Git keeps each
 * folder through its `.gitkeep` (a launch from Studio stops on a missing folder), never its content.
 * A folder inside another (`data/state` in `data`) comes after it and is first taken back, with
 * every folder between them: git never looks into a folder an earlier line excludes.
 */
export function renderTeamGitignore(bindings: readonly MountBinding[]): string {
  const lines = [
    '# Written by `orkeon-bench scaffold` from mounts.json: run it again after a change of mounts.json.',
    '# The folders of the mount points hold the data of the team (what it reads, writes and keeps):',
    `# git keeps each folder through its ${FOLDER_KEEPER}, never what the team finds or leaves there.`,
  ];
  const folders = teamFolders(bindings);
  const outer = (folder: string): string[] => folders.filter((other) => other !== folder && isWithin(other, folder));
  const ordered = folders.map((folder, index) => ({ folder, index, depth: outer(folder).length })).sort((a, b) => a.depth - b.depth || a.index - b.index);
  // A folder between two is taken back once: a second `/<folder>/*` would exclude again what a line before took back.
  const takenBack = new Set<string>();
  for (const { folder } of ordered) {
    const nearest = outer(folder).reduce((longest, other) => (other.length > longest.length ? other : longest), '');
    if (nearest.length > 0) {
      const between = folder.slice(nearest.length + 1).split('/');
      for (let count = 1; count < between.length; count += 1) {
        const path = `${nearest}/${between.slice(0, count).join('/')}`;
        if (!takenBack.has(path)) {
          takenBack.add(path);
          lines.push(`!/${gitPattern(path)}/`, `/${gitPattern(path)}/*`);
        }
      }
      lines.push(`!/${gitPattern(folder)}/`);
    }
    lines.push(`/${gitPattern(folder)}/*`, `!/${gitPattern(folder)}/${FOLDER_KEEPER}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The folders of the mount points that lie inside the team, relative, in declaration order, once each. */
export function teamFolders(bindings: readonly MountBinding[]): string[] {
  const folders: string[] = [];
  for (const binding of bindings) {
    const inside = binding.relativePath?.slice(2) ?? '';
    if (inside.length > 0 && !folders.includes(inside)) {
      folders.push(inside);
    }
  }
  return folders;
}

/** A folder as a .gitignore pattern: the characters git reads as wildcards escaped. */
function gitPattern(folder: string): string {
  return folder.replaceAll(/([*?[\\])/g, String.raw`\$1`);
}
