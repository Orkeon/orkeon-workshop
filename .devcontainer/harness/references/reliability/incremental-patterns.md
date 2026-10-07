# Incremental patterns — processing only what is new

> Reference document of the Orkeon harness (the workshop's `references/reliability/`). Established on Orkeon main at 80fdefe (2026-10-07, after 1.0.0-rc.4).
> Sources: at 80fdefe: `src/core/Orkeon.Application/Memory/` (`MemoryService.cs`, `MemoryCoordinator.cs`,
> `CrewMemoryScope.cs`, `CrewMemoryOptions.cs`), `src/core/Orkeon.Application/Agent/AgentExecutionService.cs`,
> `src/core/Orkeon.Infrastructure/Memory/` (`MemoryProviderFactory.cs`, `MemoryProviderSettings.cs`,
> `Sqlite/SqliteMemoryOptions.cs`, `RedisMemoryProvider.cs`, `InMemoryCategoryMemoryStore.cs`),
> `src/core/Orkeon.Infrastructure/DependencyInjection/InfrastructureExtensions.cs`, `src/tools/Orkeon.Tools.FileSystem/`
> (`CountPatternTool.cs`, `DirectoryReadTool.cs`, `FileWriteTool.cs`), `src/tools/Orkeon.Tools.Data/JsonTool.cs`,
> `src/tools/Orkeon.Tools.Web/WebScrapeTool.cs`, `src/tools/Orkeon.Tools.Email/` (`Tools/EmailParserTool.cs`, `Dtos/EmailReadingDtos.cs`),
> `src/core/Orkeon.Application/Crew/Execution/AgentPromptComposer.cs`, `docs/guides/email.md`;
> harness: `references/testing/invariants-catalog.md`, `references/orkeon/resume-and-memory.md`. The sketch of § 7
> passed `check_team.py`, `tsc` against the shipped `orkeon.d.ts` and `orkeon run crew/crew.ork.ts --validate` on a
> binary built from main at 24ab0d0 (2026-10-02); at a2bb6c3 it was re-read against `typescript-dsl.md` (the
> builders it uses are unchanged), and on a build of fb26364 its two blocks, closed by a `crewBuilder()`,
> passed `--validate` again.

Orkeon has no deduplication and no watermark (`orkeon/resume-and-memory.md` § 5). Processing only what is
new takes three things the team owns: a **key** per unit, a **registry** of the keys done, and a
**selection rule**. The registry is the one of `reliability/resume-patterns.md` § 4: resume asks "what did
the interrupted run finish?", incremental processing asks "what is new since the last runs?" — one state
answers both.

## 1. What the need decides

`NEED.md` answers these in `## Incremental processing and memory` (`process/artefacts.md` § 3); each answer
becomes a rule `R-nn` and a test.

| Question | Example answer (mail triage) |
|---|---|
| What is a unit, and when are two units the same? | a mail; the same Message-ID |
| What happens to a unit that comes back changed? | ignored, reprocessed as a new version, or flagged for a person |
| How long can a unit come back? | the mailbox keeps 90 days: keys are kept at least 90 days |
| Do units arrive in order? Late? | mails can arrive hours after their `Date` |
| What must never happen twice? | a reply draft, an API call |

## 2. The deduplication key

A key is **stable** (the same unit gives the same key on every run and machine), **unique**, **taken from
the input itself**, **safe** in a file name and a regular expression (letters, digits, `-`), and **cheap** to compute.

| Input | Key | Note |
|---|---|---|
| a mail | its Message-ID — the `message_id` field of `email_parser` (an `.eml` file) or `email_read` (a mailbox), normalised — when its senders are trusted; for untrusted mail, a key no sender chooses (the exported file's name, as the pilot `mail-triage` does: a forged Message-ID would otherwise make a new mail pass for one already processed) | not the opaque id `email_search` returns: an IMAP id changes when the message moves; without a Message-ID, a rule of the need (hash of From, Date, Subject) |
| a document carrying an id (invoice, order) | the business id, read by a deterministic parser | not the model's extraction: it varies |
| a file without an id | a hash of its content | a C# tool: a TypeScript tool cannot read a file |
| a record (CSV row, database row) | its primary-key column | `csv_reader` returns it as is |
| a web page | its canonical URL, plus a content hash or date when changes matter | `web_scrape` with `cached=true` deduplicates by URL only, in memory (`WebScrapeTool`) |
| a file name | only when the need guarantees names never change (an assumption `Hn`) | otherwise the typical violation of `INV-INCR` |

Never an Orkeon id (regenerated at each launch), a run date, a modification time, a path that moves, or a
title or summary the model writes.

- **Normalise in a tool**, not in the prompt: trimming, case, angle brackets. The same Message-ID spelled
  `<CA+x@host>` and `ca+x@host ` must give one key. Unit-test it at L1, the test title citing the id
  (`testing/test-levels.md` § 3).
- **A changed unit**: key = id alone when a change is ignored; id + content hash when a change is a new
  unit to process. The rule is in `NEED.md`, the dataset has the case (`testing/synthetic-data.md` § 9).
- **Duplicates within one run** (two files, one Message-ID) collapse into one unit before processing.

Where the key is computed:

| Team | Key computed by |
|---|---|
| YAML, built-in tools only | a value a tool returns verbatim and that is already safe; anything needing normalisation or hashing has no reliable key — make the team TypeScript or add a C# tool |
| TypeScript | a pure `toolBuilder` tool fed with a short string the model copies from a tool result (§ 7) |
| C# | a tool that reads the file through the VFS and hashes it (`orkeon/csharp-tools.md`; through `orkeon-harness-run`, not Studio — V-07) |

## 3. Selecting what is new

| Rule | Selects | Fits | Watch out |
|---|---|---|---|
| Set difference | the inputs whose key the registry lacks | unordered folders, mailboxes | the cost grows with the listing, and listings are cut (`resume-patterns.md` § 3) |
| Watermark | the inputs whose order key follows the last committed one | ordered, append-only sources: numbered invoices, logs, an API with a `since` parameter | a late arrival is never seen |
| Watermark, window and registry | the inputs after the watermark minus a window, without the keys done | dated sources with late arrivals | the window comes from the need |

A watermark:

- lives in `/state/watermark.json` (small, overwritten), read with `json_tool` (`input` the path,
  `operation` `Query`, `query` `last`);
- advances only once every unit up to it is committed — never before their markers;
- takes its order key from the data (the `Date` header, an id), compared by a deterministic tool: asking the
  model to compare dates is an anti-pattern (`design/prompting.md` § 8);
- never lives in Orkeon memory nor in the model's context (the second typical violation of `INV-INCR`).

**A live mailbox** (the e-mail tools, `docs/guides/email.md`) selects on the server: `email_search` takes a
`folder`, `unread_only`, `flagged_only`, `since` and `before`, returns one page, newest first, and `next_cursor` resumes after the
last message — `limit` (50 at most) is a ceiling: about ten messages fit a tool result, so a page shorter
than `limit` is not the end of the folder; the absence of `next_cursor` is. The mailbox can also hold the done marker: a processed
message moved to a folder (`email_move`) or flagged (`email_mark`) once its output is written — the
`Organize` right, an action on the user's mailbox that the need must allow. Those marks are visible to and
changeable by a person sharing the mailbox, and a moved IMAP message gets a new id: the file registry keyed
by Message-ID stays the record; the mailbox marks only narrow the search.

## 4. Orkeon memory or a file registry

What each guarantees in a team launched by `orkeon run` or Studio at 80fdefe (per the sources); the mechanics
are in `orkeon/resume-and-memory.md` § 2.

| | Crew memory (`memory`, `memoryProvider`) | `memory_store` tool | `Memory:Provider` of the settings | Files under `/state` |
|---|---|---|---|---|
| Written by | Orkeon, with `memory: true`: each successful task output | the model, blind (empty schema, `orkeon/orkeon-reference.md` § 5) | `web_scrape` with `cached=true` | the team |
| Read back by an agent | before each task, the crew's closest memories (same `name:`; 5 at most, cosine ≥ 0.6, 4,000 characters), shown as earlier work | in the same process only | through `cache_search` | `directory_read`, `count_pattern`, `json_tool`, `file_read` |
| Survives the process | only in a durable store the settings name (`Memory:Provider` or `memoryProvider`, plus its `Orkeon:<Type>` section; a type that names no provider is refused); without it, in memory — not exercised by the harness | no | only with a SQLite file on a writable mount — not verified | yes |
| Found by the next run | by crew `name:` and similarity, never by key | no | — | yes, by key |
| Testable | no: nothing a program can check | no | no | yes: snapshot and diff |

A recall is "similar earlier work, possibly outdated", not "this unit is done": it cannot select what is new.
A crew with `memory: true` probes its embedder and its store before the first LLM call and fails the run
there; a store or recall that fails later is a warning (`orkeon/resume-and-memory.md` § 2.1). The
`Redis provider not initialized` failure of 24ab0d0 is fixed (924cca99). Write neither `memory` nor
`memoryProvider` for incremental state: it is files.

## 5. Purge and retention

- **Retention** is the longest time a unit can come back, from the need, plus a margin. Shorter means
  reprocessing; longer costs only growth.
- **Growth** hurts reads, not markers: `directory_read` with a `pattern` returns one entry whatever the
  number of markers, while `count_pattern` scans the whole file and `file_read` is cut at 32,000 characters.
- **Partition by period, in the file name**: `/state/done-2026-10-<key>.json`, found in any period by
  `directory_read` on `/state` with pattern `done-*-<key>.json`; or one registry per period,
  `/state/registry-2026-10.jsonl`, each read once per run. Not a folder per period: a lookup in a folder
  that does not exist yet errors, and three identical errors stop the agent (`resume-patterns.md` § 4). The
  period comes from a launcher argument (`./run.sh --var PERIOD=2026-10`, `orkeon/cli.md` § 2.4) or from the
  unit's date through a deterministic tool.
- **Purging** means deleting old partitions, and that happens outside the team: no tool deletes or moves a
  file under a mount point (`file_write` creates, overwrites or appends; `email_delete` and `email_move` act
  on mailbox messages), and an `rwnd` point forbids deletion by design (`orkeon/cli.md` § 2.3). The user
  deletes the files of the expired periods, a host script does it, or a C# tool with an `rw` point does it
  through `orkeon-harness-run`.
- **Never purge by asking the model to rewrite the registry**: a dropped key is a unit processed twice.
- **Archive instead of deleting** when the registry is an audit trail (the need says so). Moving processed
  inputs aside (`/archive`) is a C# tool's job (`design/io-contracts.md` § 2), not part of the state.

## 6. Idempotence

A rerun on the same inputs finds nothing new and does nothing (`INV-IDEMP`):

- the selection excludes every committed key, so no writing tool is called and no action taken;
- outputs sit at deterministic paths and are overwritten, never appended (`design/io-contracts.md` § 7);
- per-run files are declared volatile in the scenario and left out of the comparison: `AUTO_SUMMARY.md`, the
  work list or batch file the planner rewrites at each run;
- a no-op run rewrites no marker: a rewritten marker changes its modification time and hides real rework;
- an action on the outside world is guarded by intent and done markers and an idempotency key
  (`resume-patterns.md` § 6).

## 7. Sketch — TypeScript, a key tool and a batch tool

Mounts: `/mailbox` (`ro`), `/state` and `/output` (`rw`). The registry is append-only JSON lines; the key and
the selection are computed by pure tools, so the model never decides what was already processed.

```ts
// --- crew/tools/index.ts — pure helpers: no I/O (Jint), unit-tested at L1 (INV-INCR)
/** cyrb53 (public domain): a 53-bit string hash, the same on every run and machine. */
function hash53(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const mailKey = toolBuilder<{ message_id: string }, { key: string }>()
    .name("mail_key")
    .description("Returns the deduplication key of a mail from its Message-ID (the message_id field of email_parser). Always use it; never build a key yourself.")
    .withSchema({
        type: "object",
        properties: { message_id: { type: "string", description: "The message_id field email_parser returned" } },
        required: ["message_id"],
    })
    .execute((input) => {
        const normalised = input.message_id.trim().replace(/^<|>$/g, "").toLowerCase();
        return { key: "m" + hash53(normalised) };
    })
    .access("read")
    .build();

type Mail = { key: string; file: string };

const nextBatch = toolBuilder<{ candidates: Mail[]; done: string[]; limit: number }, { todo: Mail[]; remaining: number }>()
    .name("next_batch")
    .description("Given the mails found this run and the registry matches of count_pattern, returns the next mails to process (by key order, at most limit) and how many remain after them.")
    .withSchema({
        type: "object",
        properties: {
            candidates: {
                type: "array",
                description: "One entry per mail found this run",
                items: { type: "object", properties: { key: { type: "string" }, file: { type: "string" } }, required: ["key", "file"] },
            },
            done: { type: "array", items: { type: "string" }, description: "The matches count_pattern returned on /state/registry.jsonl, as is" },
            limit: { type: "integer", description: "Largest number of mails to return" },
        },
        required: ["candidates", "done", "limit"],
    })
    .execute((input) => {
        const done = new Set(input.done.map((m) => {
            const found = /"key":"(m[0-9a-f]+)"/.exec(m);
            return found ? found[1] : m;
        }));
        const seen = new Set<string>();
        const pending: Mail[] = [];
        for (const mail of input.candidates) {
            if (done.has(mail.key) || seen.has(mail.key)) continue;   // done, or a duplicate of this run
            seen.add(mail.key);
            pending.push(mail);
        }
        pending.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const todo = pending.slice(0, Math.max(0, input.limit));
        return { todo, remaining: pending.length - todo.length };
    })
    .access("read")
    .build();

const all = [mailKey, nextBatch];

/** The named subset an agent carries; throws on an unknown name. */
export function pickTools(...names: string[]) {
    return names.map((name) => {
        const found = all.find((t) => t.name === name);
        if (!found) {
            throw new Error(`unknown team tool "${name}" - available: ${all.map((t) => t.name).join(", ")}`);
        }
        return found;
    });
}
```

```ts
// --- crew/crew.ork.ts (the planner and its task; the triager follows resume-patterns.md § 5)
import { pickTools } from "./tools/index.ts";

const planner = agentBuilder()
    .name("planner").role("Mailbox planner")
    .goal("Find the mails of /mailbox that the registry does not hold yet")
    .backstory(`Literal. Uses mail_key for every key and next_batch for the selection; never decides "already processed" itself.`)
    .tools(["directory_read", "email_parser", "count_pattern"])
    .withAutonomousTools(pickTools("mail_key", "next_batch"))
    .allowDelegation(false).maxIterations(30)
    .build();

const plan = taskBuilder().name("a_plan").agent(planner)
    .description(`1. directory_read on /mailbox with pattern "*.eml".
2. For each file: email_parser on its path, then mail_key on the message_id it returns.
3. count_pattern on /state/registry.jsonl with patterns ['"key":"m[0-9a-f]+"'], include_matches true,
   distinct_matches true. If the file does not exist yet, no mail is done.
4. next_batch with the mails of step 2 ({"key", "file"} each), the matches of step 3 and limit 5.`)
    .expectedOutput(`JSON only: {"todo": [{"key": "<key>", "file": "/mailbox/<name>.eml"}], "remaining": <number>}`)
    .deliverable({ path: "/state/batch.json", source: "structured_output", format: "json",
        schemaInline: '{"type":"object","required":["todo","remaining"]}' })
    .build();
```

The second task (`b_triage`, `.withContext(plan)`) parses each mail of `todo`, writes `/output/<key>.json`,
then — in a later step — appends `{"key":"<key>","record":"/output/<key>.json"}` and a newline to
`/state/registry.jsonl` with `file_write` (`append: true`). Limits of this shape: every run parses every mail
of the listing to compute its key (two calls per mail); the listing and the `count_pattern` matches are cut
at 4,000 characters, and `count_pattern` returns 200 matches unless `max_matches_returned` says more — past
that, done mails look new; a key tool's argument is copied by the model from a tool result. Past a few dozen
mails, a C# tool that lists, hashes and diffs through the VFS returns only the next batch.

## 8. Checking `INV-INCR` and `INV-IDEMP`

Statements and checks: `testing/invariants-catalog.md`. Datasets: `incr-v1/`, then `incr-v2/` = v1 plus new
units and one changed unit with the same key (`testing/synthetic-data.md` § 9).

**`INV-INCR`** — run on v1, keep the written `/state` (and outputs), bind the inputs of v2, run again, then:

1. the registry gained exactly the keys of the delta (`comm -13` of the sorted keys before and after);
2. the outputs of v1 units keep their checksum and modification time;
3. the changed unit is handled as its rule `R-nn` says; a duplicate pair produced one unit;
4. when the delta exceeds the batch, successive runs drain it without touching done units.

**`INV-IDEMP`** — two runs on the same inputs after completion: the second exits 0, writes nothing but its
volatile files, rewrites no marker, and calls no writing or acting tool on a done unit. Events carry
argument names only (`orkeon/cli.md` § 3): which paths were written comes from a snapshot of the roots
(checksums and modification times) or from `--llm-log`.

```bash
cd teams/mail-intake && R=../../mounts.trial/mail-intake && D=../../tests/mail-intake/datasets   # R: a mount set
cp -r "$D"/incr-v1/mailbox/. "$R"/mailbox/ && TEAM_ENV=trial ./run.sh > /dev/null   # v1, as many runs as the batch needs
grep -ho '"key":"m[0-9a-f]*"' "$R"/state/registry.jsonl | sort -u > /tmp/keys-1.txt
(cd "$R"/output && for f in *.json; do echo "$(stat -c %Y "$f") $(sha256sum "$f")"; done) > /tmp/out-1.txt
cp -r "$D"/incr-v2/mailbox/. "$R"/mailbox/ && TEAM_ENV=trial ./run.sh --events jsonl > /tmp/run.jsonl; echo "exit $?"
grep -ho '"key":"m[0-9a-f]*"' "$R"/state/registry.jsonl | sort -u | comm -13 /tmp/keys-1.txt -   # exactly the delta's keys
grep -ho '"key":"m[0-9a-f]*"' "$R"/state/registry.jsonl | sort | uniq -d                         # empty: no key twice
```

**By level.** L1 proves the key (equal spellings give one key, different ids two, no collision on the
dataset) and the selection tool. L2 runs the real key and selection tools under scripted calls: their
results in the stub's log and the registry diff prove the mechanics. Whether a real model follows the
selection is L3 (`testing/test-levels.md` § 3–5).

**Typical violations** beyond the catalogue's: a key built by the model; a watermark advanced before the
units it covers are committed; a work list drawn from a cut listing, so later inputs are never seen;
`web_scrape` caching taken for deduplication; a registry rewritten by the model to purge it.

## 9. Before gate 3

- [ ] `NEED.md` answers the five questions of § 1; each answer is a rule `R-nn`.
- [ ] The key, its normalisation and the tool that computes it are in `DESIGN.md`, with L1 tests planned.
- [ ] The selection rule (set difference, watermark, or both with a window) is chosen and justified.
- [ ] No state in `memory`, `memoryProvider`, `memory_store` or a prompt; the registry is under `/state`.
- [ ] Retention, partitioning and who purges are written; nothing in the team rewrites the registry.
- [ ] `INV-INCR` and `INV-IDEMP` are in `ACCEPTANCE.md`, with the v1 / v2 datasets and the volatile files named.
