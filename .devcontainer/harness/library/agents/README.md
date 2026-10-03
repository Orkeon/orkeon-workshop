# library/agents — agent fragments

**Purpose.** Agent definitions that worked: a `role`, a `goal`, a `backstory`, the tools and the
sizing (`maxIter`, temperature) that made an agent do its job with a given class of model. They are
the starting point of the next team's `crew/agents/<id>.yaml` (or `agentBuilder()` block), not a
dependency: a team copies a fragment and adapts it.

**Shape.** One file per fragment, `<name>.yaml` (YAML keys as in `references/orkeon/yaml-schema.md`)
or `<name>.ts`, with a header comment giving: origin team and attempt, Orkeon version, the LLM profile
it was accepted with, what it is good at and what it was never asked to do.

**Promotion rule.** A fragment is promoted from a team whose verdict is `ACCEPTED`, unchanged from
what the accepted attempt ran. Its prompts are in English, name no model, no key and no physical
path, and keep `allowDelegation: false` unless the header says why not. A fragment that was accepted
only with a remote model says so: it is not a promise for a local one.
