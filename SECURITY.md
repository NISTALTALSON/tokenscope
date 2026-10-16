# Security policy

## Scope

TokenScope Phase 1 is a browser-local application. It does not implement provider credential storage, cloud synchronization, authentication, or server-side API calls.

Please do not include provider keys, raw prompts/responses, private usage exports, cookies, or other secrets in issues or pull requests.

## Reporting a vulnerability

If you discover a security or privacy issue, avoid opening a public issue with sensitive details. Contact the maintainer privately through the security contact configured for the GitHub repository, or open a minimal issue that only asks for a private follow-up.

Include:

- a short impact summary;
- affected version or commit;
- sanitized reproduction steps;
- any suggested mitigation.

## Privacy boundary

Review imported files before selecting them. TokenScope needs usage metadata and does not require raw model conversations. Exports created by the app remain local downloads and should be handled as potentially sensitive files.
