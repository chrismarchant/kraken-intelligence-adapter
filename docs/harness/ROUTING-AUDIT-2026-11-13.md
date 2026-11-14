# Model-routing audit of the session of 2026-11-13: what was reported and what was verified

Recorded on 2026-11-14 under the owner authorisation KIC-HARNESS-REPAIR-01. The two parts are kept apart on purpose.

## 1. Reported, not reverified

- **Source:** the owner's recovery instruction of 2026-11-13 ("KIC — new session recovery and harness repair").
- **What it reports:** the previous session (branch `claude/adoring-edison-4wlees`) was deliberately stopped and archived after a model-routing audit established that Fable 5.2 had performed routine engineering rather than delegating to Mistral.
- **Standing:** this is evidence reported by the owner about the archived session. The audit record and the archived session's transcript are not in this repository and were not read by the recovery session. The conclusion is recorded here as reported. It has not been independently reverified, and nothing below should be read as the audit's own findings.

## 2. Verified from the repository by the recovery session (2026-11-13 and 2026-11-14)

These are consistent with the reported conclusion and explain how it could happen. They do not measure how much work each model did: the repository holds no record of that.

1. **Mistral-first coding had no mechanism.** `docs/gates/KIC-00-REPORT.md` (section F) names `mistral-large-4-0` as the primary coding delegate "by direct API" and records the router plugin as not installed. At `4dceeb0` nothing in the repository sent coding work to a Mistral model; `src/gateway/mistral.ts` is product inference.
2. **Nothing checked the model of a sub-agent.** The only hook enforced the global stop. A sub-agent launched without a model runs on the model of the session that launches it.
3. **Model identity in the review ledger was self-declared.** 26 of 27 entries in `harness/state/reviews.json` give the reviewer's model as the free text "opus tier". The schema does not require the field and nothing verified it.
4. **No attribution or accounting.** All 50 commits up to `4dceeb0` are authored "Claude". The task ledger has no model, token or cost field, and there was no usage ledger.
5. **Review rounds were unbounded.** 26 agent reviews and six rounds of remediation in one day; the only limit was a sentence in a checkpoint.
6. **The router was not in use.** `chrismarchant/mistral-code-router`, inspected read-only at commit `b778108` on 2026-11-14, was installed in neither session. It has no licence file, and its skill, command and README tell the session to do a failed workstream "locally", that is, on the session's own model.

## 3. What was done about it

The controls added under KIC-HARNESS-REPAIR-01, what each one enforces and what it cannot, are in `docs/harness/MODEL-ROUTING.md`. The bootstrap exception is stated there too: the controls themselves were written by the orchestrating session, because no delegation route existed until they did.
