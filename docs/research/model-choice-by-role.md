# Research brief — how the factory chooses a model

Evidence for a factory decision. This is not a spec.

## Question

Each factory stage needs a model, and the choice is currently fixed by role. Is that the right place to decide, or should each task pick its own model?

## Sources

Each fact below is from a page opened for this brief, or from the factory files named here.

**This factory**

- `factory.config.json`: coordinator, product-manager, tech-lead, and ui-designer are `claude` with no model pin. Backend, frontend, QA, and user-tester are `codex` with `model` set to `gpt-6.1-sol`. The researcher is `grok` and `beside: true`. `effort` is unused.
- `scripts/factory.mjs` `worker()`: the plan copies `agent` from the role, and copies `model` and `effort` only when the role has them. Task checkboxes (`[backend]`, `[frontend]`, `[qa]`) select the role. They do not select a model.
- `.agents/skills/factory/SKILL.md`: the coordinator starts `orca orchestration worker-start --agent <worker.agent>` and adds `--model` and `--effort` only when the plan includes them. Role files say `model: inherit`. `scripts/sync-agents.mjs` does not write the config model into the generated agent files.
- `docs/orca-playbook.md`: Claude does design and review. Codex does build, QA, and user testing, so the long sessions stay off the Claude allowance. Review is always a different model from the one that wrote the code. A usage limit pauses that role: the tech lead stays on Claude, and build, QA, and user testing stay on Codex. A Codex model the ChatGPT plan does not offer fails the worker; the fix is to pin a model that plan offers.
- `docs/adr/0007-lean-factory-loop.md`: the scarce resource is the Claude allowance. One Claude stage runs at a time. The coordinator does not stay awake while Codex works. There is no record of which model finished a stage, how many build loops it took, or whether review sent it back.

**Outside**

- [Anthropic, Building effective agents](https://www.anthropic.com/research/building-effective-agents) (19 Dec 2024; the page notes the tooling has moved on): find the simplest solution and add complexity only when it improves outcomes. A routing workflow fits when inputs fall into distinct categories that are better handled apart, and when that classification is accurate. Their example sends easy questions to a smaller model and hard ones to a more capable one. An orchestrator that invents subtasks fits when the subtasks cannot be known ahead of time. An evaluator loop fits when the pass rule is clear.
- [LMSYS, RouteLLM](https://lmsys.org/blog/2024-07-01-routellm/) (1 Jul 2024): a learned router looks at the prompt and chooses a strong expensive model or a weak cheap one. On MT Bench, their best router reached 95% of GPT-4 quality with 14% of calls going to GPT-4, after training on Arena preferences plus an LLM judge. On MMLU, the same routers were near random until the training data included MMLU examples. The saving is against token price, and it depends on having many easy prompts.

## Already covered

- The role map, the model pin, and the cross-model review rule are in `factory.config.json`, `docs/orca-playbook.md`, and ADR 0007. No spec assigns a model per task.
- No performance ledger exists. A board pass cannot yet say which model failed a stage.

## Fits one pull request

**Keep the choice on the role.** The stage is known before the worker starts: design, UX, backend, frontend, QA, user test, review, research. Anthropic's routing pattern is for inputs that fall into categories you can name in advance. Those categories are already the roles. `worker()` is a table, not a classifier. That is the right design for this factory.

**Do not choose a model per checkbox.** One worker owns every open task of its role for that stage. Splitting `[backend]` lines across models would start several workers, reload the spec each time, and blur the rule that a different model reviews the code. The task tag already did the classification.

**Do not add a learned router, or a model that picks the model.** RouteLLM pays off when many prompts are easy and the bill is per token. A factory stage is a long coding or design session, and the limit that hurts is the Claude allowance, not a token price. ADR 0007 already spends that allowance on design and review and leaves the long work on Codex. A router trained on chat preferences also failed on a benchmark it had not seen until the training data included that benchmark. This factory has no such data. A wrong pin already fails the worker; an automatic picker would fail it more often.

**Escalate on the result, which the loop already does.** Tests, QA, and review are the quality signal. A blocker or major returns the spec to building, up to `maxBuildLoops` of 3. That is an evaluator loop with a fixed author and a fixed reviewer. It uses the test result, which a prompt-only router never sees.

**Change a pin by hand, from a repeated failure.** A usage limit pauses the role. The tech lead stays on Claude, and build, QA, and user testing stay on Codex. Edit `factory.config.json` when a named model is rejected by the plan. Use `effort` on a role only after one role keeps exhausting the build loop. Leave Claude unpinned so the session default can move. Leave Codex pinned to `gpt-6.1-sol` because a ChatGPT plan rejects models it does not offer.

The coordinator's stage note records the role, agent, and model. That is the record for a later pin change. The runner's model table stays as it is.

## Open questions for Elango

1. Should Claude roles stay on the session default?
