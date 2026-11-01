import type { Command } from 'commander';

import { formatUsd } from '../../domain/bench-config.js';
import { EXIT } from '../exit-codes.js';
import type { Services } from '../services.js';
import type { Session } from '../session.js';

export function registerEstimate(program: Command, services: Services, session: Session): void {
  program
    .command('estimate <team>')
    .description('price the L4 scenarios on the remote profile from the tokens of their last local runs, × repeat × 1.3 (exit 1 above budget.remote_usd_max)')
    .option('--profile <name>', 'the profile to price (levels.e2e_remote.profile of bench.config.json by default)')
    .option('--json', 'print the estimate as JSON')
    .action(async (teamArgument: string, options: { profile?: string; json?: boolean }) => {
      await session.run(async () => {
        const team = await services.locateTeam.execute(teamArgument);
        const estimate = await services.estimateRemote.execute(team, options.profile);
        for (const warning of estimate.warnings) {
          session.output.error(`warning: ${warning}`);
        }
        if (options.json === true) {
          session.output.json({
            team: team.slug,
            profile: estimate.profile,
            model: estimate.model,
            local_profile: estimate.localProfile,
            scenarios: estimate.scenarios,
            repeat: estimate.repeat,
            factor: estimate.factor,
            decision_calls: estimate.decisionCalls,
            decision_price_per_call: estimate.decisionPricePerCall,
            decision_usd: estimate.decisionUsd,
            usd: estimate.usd,
            cap_usd: estimate.capUsd,
            within_cap: estimate.withinCap,
            warnings: estimate.warnings,
          });
        } else {
          const model = estimate.model === '' ? '' : ` (${estimate.model})`;
          session.output.line(`estimate: ${formatUsd(estimate.usd)} USD for ${String(estimate.scenarios.length)} scenario(s) × ${String(estimate.repeat)} on ${estimate.profile}${model} — cap ${formatUsd(estimate.capUsd)} USD${estimate.withinCap ? '' : ' — above the cap'}`);
          if (estimate.decisionCalls > 0) {
            const priced = estimate.decisionPricePerCall === null ? 'not priced (local decision model, or none)' : `${formatUsd(estimate.decisionUsd)} USD at ${formatUsd(estimate.decisionPricePerCall)} USD per call`;
            session.output.line(`decision calls: ${String(estimate.decisionCalls)} per pass — ${priced}`);
          }
        }
        return estimate.withinCap ? EXIT.ok : EXIT.failed;
      });
    });
}
