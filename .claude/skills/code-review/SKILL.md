---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along three axes: Standards (does the code follow this repo's documented coding standards?), Spec (does the code match what the originating issue/spec asked for?) and Scrutiny (should this change exist in this form, and does the traced code path actually do what it claims?). Runs the axes in parallel sub-agents and reports them side by side. Also reviews a plan or design doc with no diff, on the Scrutiny axis alone. Use when the user wants to review, audit, sanity-check or get a second opinion on a branch, a PR, work-in-progress changes, a plan or a design doc, or asks to \"review since X\"."
---

Three-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?
- **Scrutiny**: read cold, as an outsider: is there a simpler way to reach the same goal, and does the real code path, not just the diff, do what the change claims?

The axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

**Plan or design doc, no code yet?** Skip steps 1–3. Run only the Scrutiny sub-agent, pointed at the document, tracing the proposed flow against the existing code.

The issue tracker should have been provided to you. If `.claude/docs/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `.claude/docs/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`, plus every ADR in `_docs/adr/` (ADR 0001 fixes which app may import which).

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn the sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. For an ADR breach, lead with the smallest fix that restores it (a helper several apps share goes in `portal/`, which imports no app), ahead of heavier options like moving pages to another app or writing an exception ADR. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

**Scrutiny sub-agent prompt** should include:

- The diff command and commit list (or the plan/design doc path), and the spec if one was found.
- The brief: "Review as an outsider; forget who wrote it. Work in order:
  1. **Intent.** State the goal in one sentence. If you can't, say the change is underspecified and stop. Then ask whether a simpler path reaches the same goal: doing nothing, reusing something already in the codebase, a smaller change that gets 90% for 10% of the risk, or solving it at another layer (settings vs code, Django built-in vs custom). Name any better alternative first.
  2. **Trace.** For each behaviour the change claims, follow the real path end-to-end, including unchanged code either side of the diff: URL → view → service/selector → model/ORM → template/response. Note every surprise (unexpected branch, state you didn't know existed).
  3. **Verify.** Per claim: 'It claims X. Path: A → B → C. At C, <observation>. Holds / doesn't hold.' List inputs and states that break it (empty, unauthenticated, other user's object, concurrent requests, partial failure inside a transaction), what it silently changes (queries/N+1, error semantics, contract for other callers, including callers on other branches when the diff moves or deletes a module: count only branches that *add* the old import themselves, since a line inherited from the base merges cleanly. `for b in $(git for-each-ref --format='%(refname:short)' refs/remotes | grep -v HEAD); do git diff origin/main...$b -- '*.py' | grep -q '^+.*<old import>' && echo $b; done`), and whether the tests exercise the traced path or skip it (mocks hiding the bug, happy path only).
  Report each finding, blocker → major → nit, as: finding (cite file:line), why it matters, evidence (the trace step or input), smallest suggested change. Keep 'the change says X' separate from 'I traced X and confirmed/refuted it'. No 'LGTM': if nothing is found, list what you traced. End with one verdict: ship / fix-then-ship / rework / reject, plus the single biggest reason. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the reports under `## Standards`, `## Spec` and `## Scrutiny` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the axes are deliberately separate (see _Why separate axes_).

End with a one-line summary: total findings per axis, the worst issue _within each axis_ (if any), and the Scrutiny verdict. Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Why separate axes

A change can pass one axis and fail another:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**
- Code that passes both, but a three-line change to an existing service would have done the same, or the traced path never reaches the new branch → **Standards and Spec pass, Scrutiny fail.**

Reporting them separately stops one axis from masking another.
