import { DomainError } from '../../domain/errors.js';
import { joinPath } from '../../domain/paths.js';
import { teamPaths, type TeamPaths, type TeamRef } from '../../domain/team-ref.js';
import { parseToolCatalogue } from '../../domain/tool-catalogue.js';
import { checkDesign, checkTestPlan, type TestPlanInputs, type ToolCatalogue, type TrackReading, type WorkbookCheck, type WorkbookCheckResult } from '../../domain/workbook/check-workbook.js';
import { ARTEFACTS } from '../../domain/workbook/headings.js';
import { NOT_TESTS, TEST_FOLDERS, isTestFile, type TestFile } from '../../domain/workbook/traceability-rules.js';
import { ApplicationError } from '../errors.js';
import type { FileSystem } from '../ports/file-system.js';
import type { ProcessRunner } from '../ports/process-runner.js';
import { ReadStatus } from './read-status.js';

export interface CheckWorkbookOptions {
  readonly check: WorkbookCheck;
  /** `check design --tests`: the ids ↔ tests traceability as well (the "tests red" gate). */
  readonly tests?: boolean;
  /** For `orkeon run --list-tools`. */
  readonly commandTimeoutMs?: number;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 20_000;

/** What is not judged without the catalogue, said with the reason it could not be read. */
const NOT_CHECKED = 'tool names were not checked';

/**
 * `check test-plan` (gate 2) and `check design` (gate 3) of a team's workbook. Reads the artefacts
 * — a missing one is an error naming the step that writes it —, the bench configuration, and for
 * the design the track of `STATUS.md`, the tool catalogue of the installed Orkeon and, on request,
 * the test files; the domain judges them. A track or a catalogue that cannot be read is reported as
 * skipped, with the reason. Writes nothing.
 */
export class CheckWorkbook {
  private readonly readStatus: ReadStatus;

  constructor(
    private readonly fileSystem: FileSystem,
    private readonly runner: ProcessRunner,
  ) {
    this.readStatus = new ReadStatus(fileSystem);
  }

  async execute(team: TeamRef, options: CheckWorkbookOptions): Promise<WorkbookCheckResult> {
    const paths = teamPaths(team);
    const inputs: TestPlanInputs = {
      need: await this.artefact(paths.needFile, ARTEFACTS.need, '/team-need'),
      acceptance: await this.artefact(paths.acceptanceFile, ARTEFACTS.acceptance, '/team-test-plan'),
      testPlan: await this.artefact(paths.testPlanFile, ARTEFACTS.testPlan, '/team-test-plan'),
      benchConfig: (await this.fileSystem.exists(paths.benchConfigFile)) ? await this.fileSystem.readText(paths.benchConfigFile) : null,
    };
    if (options.check === 'test-plan') {
      return checkTestPlan(team.slug, inputs);
    }
    const design = await this.artefact(paths.designFile, ARTEFACTS.design, '/team-design');
    const plan = await this.artefact(paths.planFile, ARTEFACTS.plan, '/team-design');
    return checkDesign(team.slug, {
      ...inputs,
      design,
      plan,
      track: await this.track(team),
      catalogue: await this.catalogue(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS),
      tests: options.tests === true ? await this.testFiles(paths) : null,
    });
  }

  private async artefact(path: string, name: string, step: string): Promise<string> {
    if (!(await this.fileSystem.exists(path))) {
      throw new ApplicationError('file-not-found', `${name} not found: ${path} — ${step} writes it`);
    }
    return this.fileSystem.readText(path);
  }

  /** The track of `STATUS.md`. A status that cannot be read is the business of `status`: here it only leaves the light track unjudged. */
  private async track(team: TeamRef): Promise<TrackReading> {
    try {
      return { track: (await this.readStatus.execute(team)).status.track };
    } catch (error) {
      if (error instanceof ApplicationError || error instanceof DomainError) {
        return { track: null, reason: `${error.message}: the single batch of the light track was not checked` };
      }
      throw error;
    }
  }

  /** `orkeon run --list-tools` is the authority on tool names, as for `doctor`; without it they are not judged. */
  private async catalogue(timeoutMs: number): Promise<ToolCatalogue> {
    const result = await this.runner.run('orkeon', ['run', '--list-tools'], { timeoutMs });
    if (!result.found) {
      return { tools: null, reason: `orkeon not found on PATH: ${NOT_CHECKED}` };
    }
    if (result.exitCode !== 0) {
      const ending = result.exitCode === null ? 'did not exit (killed or timed out)' : `exited ${String(result.exitCode)}`;
      return { tools: null, reason: `orkeon run --list-tools ${ending}: ${NOT_CHECKED}` };
    }
    const tools = parseToolCatalogue(result.stdout);
    return tools.length === 0 ? { tools: null, reason: `orkeon run --list-tools returned no tool: ${NOT_CHECKED}` } : { tools };
  }

  /**
   * The tests of the four test folders, read through: scenarios, unit tests, what `static/` holds.
   * A folder reached through a symbolic link is not entered — a link may loop —, and a file that
   * cannot be read is handed over as such: the domain reports it, it does not stop the check.
   */
  private async testFiles(paths: TeamPaths): Promise<TestFile[]> {
    const files: TestFile[] = [];
    const walk = async (folder: string, links: ReadonlySet<string>): Promise<void> => {
      for (const name of await this.fileSystem.list(joinPath(paths.tests, folder))) {
        const path = `${folder}/${name}`;
        if (await this.fileSystem.isDirectory(joinPath(paths.tests, path))) {
          if (!NOT_TESTS.includes(name) && !links.has(path)) {
            await walk(path, links);
          }
        } else if (isTestFile(path)) {
          files.push({ path, text: await this.fileSystem.readText(joinPath(paths.tests, path)).catch((error: unknown) => unreadable(error)) });
        }
      }
    };
    for (const folder of Object.keys(TEST_FOLDERS)) {
      const links = await this.fileSystem.symbolicLinks(joinPath(paths.tests, folder));
      if (!links.includes('.')) {
        await walk(folder, new Set(links.map((link) => `${folder}/${link}`)));
      }
    }
    return files;
  }
}

/** A file the port could not read is no text; anything else is not expected here. */
function unreadable(error: unknown): null {
  if (error instanceof ApplicationError) {
    return null;
  }
  throw error;
}
