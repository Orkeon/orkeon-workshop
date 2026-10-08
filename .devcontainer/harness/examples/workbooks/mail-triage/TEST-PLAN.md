# Mail triage — Test plan

## Levels

| Level | Runs | When | Stop rule |
|---|---|---|---|
| L0 static | yes | end of every batch, before any run | first failure |
| L1 unit | yes | end of every batch | first failure |
| L2 component | yes | every attempt | first failure |
| L3 e2e local | yes | every attempt | first failure |
| L4 e2e remote | yes, once | the comparison run, before acceptance, behind the budget gate | first failure |

## Datasets

Every set is synthetic: no real mail enters the repository. Each mail carries a marker sentence of its
own, which AC-10 and INV-01 look for. Nothing here needs a mail server: the team reads files only.

| Name | Origin | Size | Cases covered | Criteria served |
|---|---|---|---|---|
| nominal | synthetic | 12 mails | 3 support, 2 sales, 2 billing with a PDF attachment, 1 internal, 1 newsletter, 2 spam, 1 other; 8 in English, 4 in French; 5 expect a draft; 2 name an outage or a deadline within two days | AC-01, AC-02, AC-10, AC-15, AC-16, IND-02, IND-03, IND-04, IND-05, IND-07, IND-09, INV-RESUME, INV-01, INV-02 |
| edge | synthetic | 13 files | `edge-empty-body`, HTML only, `edge-oversized` (a file over 1 MB), `edge-not-a-mail` (an `.eml` file that is not a mail), a `B`-encoded subject, `edge-same-message-id` (two files), no Subject, attachment only, `edge-german` (a support question in German), `edge-unreadable-date` (an outage, a date that cannot be read), `edge-not-eml` (a `.txt` file, and an `.eml` file in a subfolder) | AC-03, AC-07, AC-08, AC-09, AC-12, AC-13, AC-14, INV-IDEMP |
| empty | synthetic | no mail | an empty `/mailbox` | AC-04 |
| adversarial | synthetic | 9 mails | 5 mails carrying instructions for the model — in the body, the subject, a header, an attachment name, the file name — mixed with 4 nominal mails; the manifest lists the forbidden effect of each | AC-06, INV-INJECTION |
| incr-v1 | synthetic | 6 mails | a first export | AC-11, INV-INCR, INV-IDEMP |
| incr-v2 | synthetic | 9 mails | the 6 mails of `incr-v1` and 3 new ones | INV-INCR |
| volume | synthetic | 50 mails | the mix of `nominal`, at the volume the need gives for a daily run | IND-06 |

## LLM targets

| Target | Profile | Model | Required for |
|---|---|---|---|
| stub | `stub` | — | L2 |
| local | `machine` | the model of the machine's Orkeon settings (`qwen3:8b` in the image) | L3 |
| remote | `claude` | `claude-sonnet-5` | L4: AC-06, IND-03, IND-05, IND-07 — the comparison the need allows, on the synthetic mails only |

## Judges

| Id | Rubric | Scale | Threshold | Applies to |
|---|---|---|---|---|
| J-01 | `judges/reply-draft.md` v1 | 1–5 | IND-04 (L3), IND-05 (L4) | the files of `/output/drafts/` |

## Repetitions and flakiness

L3: 3 runs per end-to-end scenario, 2 must pass. L4: 1 run. The invariants hold on every run: one
violation in one repetition fails the invariant. A scenario that passes 2 runs of 3 is noted flaky in
the analysis when its third run fails on a check, not on a time limit.

## Budget

| Kind | Limit |
|---|---|
| local | 120 minutes |
| remote | 2.00 USD per attempt |

## Pass criteria

Every active AC passes at its level, every IND is within its threshold, every INV is true.

Written from the need, without an interview. Assumed, and the user's to confirm or change at gate 2:

- **The remote comparison is a condition of acceptance.** The need makes the local model the target and
  allows a remote one "only to compare, before acceptance": here that comparison is one L4 run with
  thresholds of its own (AC-06, IND-03, IND-05, IND-07), so the team is accepted only once it has run.
  The other reading — a comparison that informs and refuses nothing — drops AC-06 and the three L4
  indicators.
- The thresholds of IND-02 to IND-05, IND-07 and IND-09; the remote model `claude-sonnet-5`; 2 runs of 3
  at L3; the local budget of 120 minutes — three runs of `volume` alone may take 45 minutes (IND-06).
- No check proves that a `reason` holds one or two sentences (R-04): AC-03 and AC-10 prove that it
  exists and does not quote, the reviewer reads its length.
- A mail that is read but whose date cannot be: the need gives `null` for the fields of a file that
  could not be read, and says nothing of this one; AC-13 judges its urgency alone, and what its record
  carries as a date is left to the design.
- The words AC-14 looks for are common German words, listed with the case: their absence shows a draft
  that is not in German, not that it is good English, which J-01 does not grade for `edge`.
