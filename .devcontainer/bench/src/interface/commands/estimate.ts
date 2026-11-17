import type { Command } from 'commander';

import { formatUsd } from '../../domain/bench-config.js';
import { DomainError } from '../../domain/errors.js';
import { LEVEL_LABELS, parseLevel } from '../../domain/run.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerEstimate(program: Command, services: Services, session: Session): void {
  program
    .command('estimate <team>')
    .description('price a paid run before its approval: the L4 scenarios on the remote profile from the tokens of their last local runs, × repeat × 1.3 — or an L3 run whose LLM or decision model is remote (--level L3), plus calls of decide --allow-remote (--decide); exit 1 above budget.remote_usd_max')
    .option('--level <level>', 'L4 (default) or L3: the level whose run is priced')
    .option('--decide <calls>', 'calls of orkeon-bench decide --allow-remote to submit with the run, at price_per_call of the top-level decision block')
    .option('--profile <name>', "the profile to price (the level's profile in bench.config.json by default)")
    .option('--json', 'print the estimate as JSON')
    .action(async (teamArgument: string, options: { level?: string; decide?: string; profile?: string; json?: boolean }) => {
      await session.run(async () => {
        const level = options.level === undefined ? 'e2e_remote' : parseLevel(options.level);
        if (level !== 'e2e_local' && level !== 'e2e_remote') {
          throw new DomainError('invalid --level', [`estimate prices L3 or L4, the levels that may call a paid model: ${options.level ?? ''}`]);
        }
        const decideCalls = options.decide === undefined ? 0 : wholeNumber(options.decide);
        const team = await services.locateTeam.execute(teamArgument);
        const estimate = await services.estimateRemote.execute(team, options.profile, { level, decideCalls });
        for (const warning of estimate.warnings) {
          session.output.error(`warning: ${warning}`);
        }
        if (options.json === true) {
          session.output.json({
            team: team.slug,
            level: LEVEL_LABELS[estimate.level],
            remote: estimate.remote,
            profile: estimate.profile,
            model: estimate.model,
            local_profile: estimate.localProfile,
            scenarios: estimate.scenarios,
            repeat: estimate.repeat,
            factor: estimate.factor,
            decision_calls: estimate.decisionCalls,
            decision_price_per_call: estimate.decisionPricePerCall,
            decision_usd: estimate.decisionUsd,
            decide_calls: estimate.decideCalls,
            decide_price_per_call: estimate.decidePricePerCall,
            decide_usd: estimate.decideUsd,
            usd: estimate.usd,
            cap_usd: estimate.capUsd,
            within_cap: estimate.withinCap,
            warnings: estimate.warnings,
          });
        } else if (!estimate.remote) {
          session.output.line(`estimate: 0 USD — a ${LEVEL_LABELS[estimate.level]} run on ${estimate.profile} calls no remote model: no approval needed`);
        } else {
          const model = estimate.model === '' ? '' : ` (${estimate.model})`;
          session.output.line(`estimate: ${formatUsd(estimate.usd)} USD for ${String(estimate.scenarios.length)} scenario(s) × ${String(estimate.repeat)} on ${estimate.profile}${model} — cap ${formatUsd(estimate.capUsd)} USD${estimate.withinCap ? '' : ' — above the cap'}`);
          if (estimate.decisionCalls > 0) {
            const priced = estimate.decisionPricePerCall === null ? 'not priced (local decision model, or none)' : `${formatUsd(estimate.decisionUsd)} USD at ${formatUsd(estimate.decisionPricePerCall)} USD per call`;
            session.output.line(`decision calls: ${String(estimate.decisionCalls)} per pass — ${priced}`);
          }
          if (estimate.decideCalls > 0) {
            session.output.line(`decide calls: ${String(estimate.decideCalls)} — ${formatUsd(estimate.decideUsd)} USD at ${formatUsd(estimate.decidePricePerCall ?? 0)} USD per call`);
          }
        }
        return estimate.withinCap ? EXIT.ok : EXIT.failed;
      });
    });
}

function wholeNumber(raw: string): number {
  const value = Number(raw.trim());
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(value)) {
    throw new DomainError('invalid --decide', [`--decide takes a whole number of calls, 0 or more: ${raw}`]);
  }
  return value;
}
