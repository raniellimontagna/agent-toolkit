# Modern Web Guidance

Before writing web UI, CSS or browser-side JavaScript, search the platform
guides with a 2–5 word generic query, then retrieve the matching guide:

`DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.1 search "<query>"`
`DISABLE_TELEMETRY=1 npx -y modern-web-guidance@1.0.1 retrieve "<id>"`

Prefer native platform features (dialog, popover, anchor positioning, view
transitions, container queries) over libraries. Baseline Widely available
features need no fallback; for newer ones, follow the guide's lightweight
fallback.
