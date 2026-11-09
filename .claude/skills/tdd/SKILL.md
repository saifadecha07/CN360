---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?"

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
- **Size the test run to the blast radius.** Before running tests, list what the change could break. A _contained_ change stays inside one app's page (its template, JS, view or form) and touches no model, migration, service, settings, shared template or URL another app uses: run only the tests covering that list (e.g. `python manage.py test materials.tests.test_views`) and name the list and the command in the hand-off. Any wider change runs the full suite before hand-off.
- **Every branch gets a test.** Each branch the change adds or keeps is covered before hand-off. When no real input reaches it, drive it from an external boundary (`default_storage`, email, time) with `side_effect`. A test that mocked our own code is rewritten through a real input, never just deleted. Only a branch neither route reaches goes to the human, as "delete this code or keep it", with the reason.

## When the feature is done

Finish everything the story needs in this branch, small UI glue included (a navbar link to the new page, a template field). Leave a piece for someone else only when the issue's Owner or งานย่อย lines assign it to them, and quote that line in the hand-off.

Once the last slice is green, bring the project docs in line with what you built, in the same branch as the code. `_docs/README.md` is the index: it lists every doc and what it covers. Walk it, plus `README.md` and `CONTRIBUTING.md`, and update each doc the feature touched: an Acceptance Criterion now met, a model or field change, a new container or app, a decision worth an ADR, a result the research chapters report, a setup or workflow step. Leave `_docs/archive/` as is.

Done when every doc in that walk either reflects the new behaviour or was checked and needs no change, and you list both groups in your hand-off.

## Human review before push

Commit locally, then stop and hand the work to the human for review: the commits, the test output (plus `coverage report -m` once coverage is installed), and any branch still untested under the *Every branch gets a test* rule. The work stays local (no `git push`, no PR) until the human has looked at it and explicitly says to push. Approval covers that one push. The next batch of work waits for its own review.

## Project standards

Every slice's code, tests included, follows this repo's Django conventions. This is the summary; the full rules and their reasons live in `CONTRIBUTING.md` under "สถาปัตยกรรมและการจัดวางโค้ด" and "มาตรฐานโค้ด Django".

- **Stack**: Python 3.12, Django 6.1, function-based views by default, team CSS in `static/css/retro.css`. Templates are _sketch-first_: semantic HTML with meaning-based classes and full behaviour, styling added later (`CONTRIBUTING.md` "Templates", ADR 0004).
- **Layers**: business logic and writes go in `services.py`, wrapped in `@transaction.atomic`; read queries go in `selectors.py`. Views stay _thin_: input → service/selector → response.
- **Queries**: preload related rows with `select_related` (FK, one-to-one) or `prefetch_related` (M2M, reverse FK) so list pages have no N+1. Every query goes through the ORM; no raw SQL.
- **Imports** flow one way, `catalog` ← `accounts` ← `materials`: `materials` may import both, `accounts` may import `catalog`, `catalog` imports neither.
- **Models**: every model has `__str__` and `class Meta`. `save()` only normalises and validates its own row; external side effects (email, API calls) belong in a service.
- **Forms**: a `ModelForm` lists `fields = [...]` explicitly, never `'__all__'`.
- **Templates**: rely on auto-escaping; `|safe` never touches user input. Every POST form carries `{% csrf_token %}`.
- **Views and URLs**: fetch objects with `get_object_or_404`; build URLs with `reverse()` / `{% url 'ns:name' %}`, never a hardcoded path. A view that needs login gets `@login_required`.
- **Shipping**: every feature lands with unit tests, committed per Conventional Commits.

### Django tests

Full rules live in `CONTRIBUTING.md` under "Testing".

- **Seams by layer**: services and selectors are called directly (no HTTP); views go through `self.client` with `reverse()`. Most tests sit at the service/selector/model/form seams; view tests cover the main flows and permissions.
- **Shape**: Arrange-Act-Assert, one Act per test, test name states the behaviour.
- **Classes**: `TestCase` by default; `SimpleTestCase` when the test touches no database. Read-only fixtures go in `setUpTestData`; data a test mutates goes in `setUp`. Users come from `User.objects.create_user(...)` and log in with `force_login`.
- **Model rules in `clean()`**: `save()`/`create()` skip `clean()`, so call `full_clean()` inside `assertRaises(ValidationError)` and check the field in `message_dict`.
- **Services**: assert the resulting rows, the expected `ValidationError` / `PermissionDenied`, and that a failure part-way leaves no rows behind (`@transaction.atomic` rollback).
- **Views**: anonymous → login redirect; wrong user or other department → 403/404; allowed → 200 plus `assertTemplateUsed` and the `response.context` data; a successful POST → `assertRedirects` plus the row checked in the database.
- **List pages and selectors**: pin the query count with `assertNumQueries`.
- **Mocks**: only external boundaries (email, third-party APIs, time). Read sent mail from `django.core.mail.outbox`. `@patch` the name where the code under test looks it up (`"materials.services.client"`), and drive failures with `side_effect`.
- **Coverage** (Sprint 2 onward): branch coverage, `coverage report -m --fail-under=80` passes. Use the missing lines to find untested branches and boundary values; the bar is meaningful assertions, not the percentage.
