# AI Software Engineer — Practical Assignment

## Objective

This assignment evaluates how you work on an **existing** software project rather than how well you can build something from scratch.

**You are encouraged to use Claude Code throughout.**

We are interested in:

- How quickly you understand an unfamiliar codebase
- How you investigate bugs before changing code
- How effectively you use Claude Code
- Whether you verify AI-generated changes rather than blindly accepting them
- How you handle incomplete or ambiguous requirements
- Whether you can implement and QA your own work
- Whether you leave the codebase in a clean, maintainable state

You do **not** need to redesign the architecture or make major architectural decisions.

**Suggested time limit: 2–3 hours.** We'd rather see two tickets done well than three done sloppily.

## Scenario

You have joined an existing project. The application is already in production, and another engineer has handed you three tickets — see [TICKETS.md](TICKETS.md) (also filed as GitHub issues).

Assume there is no dedicated QA engineer. You are responsible for understanding each issue, implementing the change, testing it, and making sure your work is ready for review.

## Claude Code

Using Claude Code is encouraged. Treat it as an engineering tool rather than simply asking it to complete the entire assignment. We want to understand how you use AI to:

- Explore unfamiliar code
- Form and verify hypotheses
- Locate relevant code
- Implement changes
- Generate or improve tests
- Debug failures
- Review your own implementation

You remain responsible for everything submitted.

## Submission

Work on a branch (or fork) and open a pull request against this repo. Include:

1. **Your changes**, as focused commits.
2. **A short `NOTES.md`** containing:
   - Your understanding of each ticket
   - Root cause of the bug(s)
   - What you changed and why
   - How you tested each change
   - Anything you were uncertain about
   - Anything you would improve with more time
3. **Your Claude Code session transcript**, or a brief record of the important prompts/interactions you used.
4. Updated instructions for running the project and tests, if anything changed.

Keep the notes concise. We care more about your reasoning than polished documentation.

## What we evaluate

We are not primarily evaluating how much code you write. We will evaluate whether you can be given normal engineering tickets and reliably take them toward completion with minimal hand-holding:

- **Codebase understanding** — can you navigate an unfamiliar repository and find the relevant parts without being told where to look?
- **Problem solving** — do you investigate the underlying problem, or immediately start changing code?
- **Claude Code usage** — do you use AI to accelerate your reasoning and implementation while still verifying its output?
- **Implementation quality** — are your changes focused, understandable, and consistent with the existing codebase?
- **QA / verification** — do you actually prove the bug is fixed and the feature works? Do you consider regressions and edge cases?
- **Ownership** — when something is unclear, do you make a reasonable decision, document your assumptions, and move forward, rather than getting blocked?
- **Judgment** — can you distinguish between a ticket-level change and something that needs broader discussion?

The goal is to simulate the type of work you would handle day-to-day on the team.
