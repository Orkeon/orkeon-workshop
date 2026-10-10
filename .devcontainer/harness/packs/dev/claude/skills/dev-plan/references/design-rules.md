# Design rules

The plan classifies **every id**: applied (cited on the `Applied rules` row of the sheet that applies
it) or `N/A — reason` (once, on the global plan's `Non-applicable rules` line). `/dev-verify` rejects an
id missing from both. The repository's own layer rules (`.claude/rules/*.md`) give how each one is
written there; these ids say what is decided.

| Id | Rule | When | Decision the plan records | Exception |
|----|------|------|---------------------------|-----------|
| DDD-01 | Names come from the business language, never a technical term or a generic service. | Domain or Application changes. | The concept and its owner; code and tests use that vocabulary. | None. |
| DDD-02 | An aggregate is a consistency boundary and owns its invariants. | A command changes business state. | The aggregate and the `BR-nn`; a domain method prevents the invalid state. | Several aggregates only under DDD-08. |
| DDD-03 | State changes through a business method, never a setter or a mutation from the caller. | Aggregate state changes. | The method's name; the use case orchestrates and sets nothing. | None. |
| DDD-04 | A value object is a valid, immutable concept, equal by value. | A datum carries its own rule. | The concept and its invariant; validation inside it. | A primitive when there is no rule. |
| DDD-05 | Aggregates reference each other by id, never by navigation. | One aggregate designates another. | The id and the read need. | None. |
| DDD-06 | Creation validates and records; rehydration only rebuilds. | Creation, or a read from storage. | The creation path and the rehydration path. | None. |
| DDD-07 | A domain event is a past fact with an explicit type and payload. | A change is published as an event. | The event, in the past tense, and its payload. | N/A when nothing is evented. |
| DDD-08 | A command changes and saves one aggregate. | Any write. | The single aggregate; any other read stays targeted and read-only. | Explicit, with its business reason and its consistency. |
| DDD-09 | Logic lives on the object that owns the data; a domain service only when no object owns it. | An operation with no obvious owner, or the pull of a static helper. | The owner and the call shape (`context.Serialize()`, not `Serializer.Serialize(context)`). | A stateless domain service, with the reason each aggregate is excluded. |
| DDD-10 | The domain depends on no transport, storage, framework or adapter. | Domain touched. | Technical dependencies stay at the boundaries. | None. |
| DDD-11 | Absence is modelled, never a convenience `null`. | A parameter, property or result of Domain or Application. | Empty collection, null object, or a genuinely optional scalar. | An optional scalar business value. |
| APP-01 | A use case orchestrates: load, call the domain, save, return. | A use case or service is created or changed. | That flow; no business rule in it. | A pure query: read and return. |
| APP-02 | Ports are declared where they are used, adapters implement them outward. | A dependency on IO is added. | The port, its owner, its adapter. | None. |
| APP-03 | A repository is centred on one aggregate and translates storage failures into domain errors. | Persistence of an aggregate is touched. | The aggregate, the save and read cases, the errors translated. | N/A when persistence is untouched. |
| APP-04 | Boundaries translate (transport, IO); they own no business rule. | An adapter or entry point is touched. | Where the mapping lives; the rule stays inside. | N/A when no boundary is touched. |
| APP-05 | A resource bound has one owner, never re-coded where it is used. | An unbounded read, a public entry point, a size or rate limit. | The bound and its owner. | N/A when no bound is involved. |
| PERF-01 | The cost in IO calls is bounded and independent of the input size. | A use case or an adapter is touched. | Reads and writes per call; no IO inside a loop over the input. | An unbounded cost the plan justifies. |
