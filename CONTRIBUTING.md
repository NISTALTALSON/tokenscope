# Contributing to TokenScope

Thanks for helping improve TokenScope. Contributions should make local AI usage easier to understand while preserving the project's explicit privacy and data-accuracy boundaries.

## Before you start

- Read the project [README](README.md) and confirm that the proposed behavior is not already listed as planned or intentionally out of scope.
- For a larger change, open an issue or discussion in the repository first so the direction can be agreed before implementation.
- Do not include provider credentials, `.env` files, raw prompts/responses, personal usage exports, or other sensitive data in issues, commits, tests, screenshots, or pull requests.

## Local setup

Requirements are Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

The app is local-first and does not need API keys or a backend for development. Use the labelled DEMO workspace for screenshots and exploratory work.

## Making a change

1. Keep the change focused on one user outcome.
2. Follow the existing TypeScript and React conventions.
3. Keep domain logic independent of the UI where practical.
4. Preserve clear distinctions between source-reported actual cost, catalog estimates, subscriptions, unknown values, and hypothetical scenarios.
5. Update the README, changelog, or other documentation when supported behavior, privacy boundaries, commands, or roadmap status changes.
6. If a new integration is proposed, document its source format, credentials/access requirements, failure behavior, and data minimization before calling it supported.

## Checks

Run all repository checks from the project root:

```bash
npm run typecheck
npm test
npm run build
```

Please include the commands you ran and any relevant results in the pull request description. If a check cannot run locally, explain why and provide the closest available verification.

## Pull requests

Pull requests should include:

- a short summary of the problem and solution;
- the user-facing behavior or documentation change;
- test/check results;
- screenshots only when they clarify a visual change, using DEMO data rather than personal records;
- notes about migration, privacy, compatibility, or follow-up work when relevant.

Keep commits reviewable and avoid mixing unrelated formatting or generated files into a feature. Maintainers may request changes to keep the MVP's privacy claims and support matrix accurate.

## Reporting problems

When reporting a bug, include the operating system, Node.js/npm versions, reproduction steps, expected behavior, actual behavior, and a minimal sanitized example. Never attach secrets or raw model conversations.
