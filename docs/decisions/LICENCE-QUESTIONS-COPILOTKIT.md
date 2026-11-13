# Questions for CopilotKit — draft for the owner to send

Status: **a draft. Nothing has been sent to anyone.** Sending it, and to whom, is the owner's action (OD-8, OD-15). It replaces the four questions in `docs/gates/KIC-01-ASSESSMENT.md` §8 with a fuller set, after the mediation KIC-ARCH-MED-01 found that more depends on the answers than was recorded.

No client is named and none needs to be. The questions describe a pattern: a small services firm deploys, for each of its clients, a separate instance that the client owns.

## What we have read, so that the answers can correct it

- OpenBot's README: Kubernetes or production use "requires a production Intelligence license beyond evaluation. OpenBot for Business includes Intelligence for use with OpenBot." Managed Intelligence "needs no separate license token". The local licence lasts 30 days and is renewable.
- The public pricing page (read 2026-11-13): a free plan; pay as you go per organisation with included interactions and unpublished graduated rates; annual plans, the only ones with offline operation. OpenBot for Business is priced per active user and "covers CopilotKit Intelligence to run OpenBot for Business"; "Building agents into your own product requires a separate Intelligence license."
- The documentation describes self-hosted Intelligence as a preview and "not a production installation".

## Licence and plan

1. A client runs, in its own infrastructure and under its own account, an instance built from the MIT-licensed OpenBot source at a released tag, unmodified, with a tenant package and one additional tool server of ours. Which plan does that client need for production use: pay-as-you-go Intelligence, OpenBot for Business, an annual plan, or something else?
2. Is the pay-as-you-go plan a "production Intelligence license" in the sense of OpenBot's README?
3. Is each client its own organisation for licensing and billing? May the firm that deploys the instance create and administer that organisation on the client's behalf?
4. Does a pilot with one client, on real material but with a handful of users, count as production?
5. What are the graduated rates above the included interactions? Is an interaction arriving through Slack or Teams counted the same way as one in the web interface? Are background runs (routines, check-ins) counted?
6. Do the personal and team editions of OpenBot need different licences? Which capabilities are switched by the licence rather than by the edition (memory, learning, channels)?
7. Does renaming the product and replacing the branding through the tenant package need any permission? What use of the OpenBot name and of third-party marks shipped in the repository is allowed in a client's instance?

## Where data is kept

8. With managed Intelligence: where are conversation threads, memory and learning evidence stored (region), for how long, and how are they deleted on request? Is a data-processing agreement available, and who are the sub-processors?
9. Can a client run Intelligence entirely in its own infrastructure in production? On which plan? When does self-hosted Intelligence stop being a preview? What does a self-hosted deployment report back, and can it run without an outbound connection?
10. What telemetry do the runtime, the Channels packages and OpenBot send by default, and do `COPILOTKIT_TELEMETRY_DISABLED` and `DO_NOT_TRACK` switch all of it off?

## Channels

11. Does reaching Slack or Teams from a self-hosted OpenBot require the managed channel runner, or can OpenTag and the Channels packages run entirely in the client's infrastructure? Under what licence is OpenTag distributed?
12. Is multi-workspace installation supported, or one workspace per instance?

## Models and upgrades

13. Is there any restriction on using a model provider that is not on OpenBot's list, through an OpenAI-compatible endpoint?
14. How are security fixes announced for released tags, and for how long is a released tag supported?

## What depends on each answer

| Answer | Decides |
|---|---|
| 1–4 | Whether the OpenBot foundation (OD-1) is affordable and permitted at all for client instances |
| 5 | Cost per campaign and whether routines are worth using |
| 6 | Which edition a client instance runs (OD-15) |
| 8–10 | Whether a client-owned instance can honestly be described as holding its own data |
| 11–12 | Whether channels (OD-14) can be offered |
