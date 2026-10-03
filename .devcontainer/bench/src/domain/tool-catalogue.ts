/** A tool name of the Orkeon catalogue: snake_case, as agents reference it. */
const TOOL_NAME = /^[a-z0-9_]+$/;

/**
 * Tool names from `orkeon run --list-tools` (one name per line, sorted, exit 0 on rc.4).
 * Any other line (banner, warning) is ignored — the same reading as `check_crew.py`.
 */
export function parseToolCatalogue(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => TOOL_NAME.test(line));
}
