# Security Policy

## Report a vulnerability

Do not open a public issue for a suspected credential leak or vulnerability. Use the repository’s **Security → Report a vulnerability** flow to submit a private GitHub security advisory.

Include the affected version, platform, reproduction steps, impact, and any suggested mitigation. Do not include live API keys or other credentials.

## Supported versions

Security fixes are applied to the latest published major release. Older majors may not receive fixes.

## Credential handling

The CLI reads Exa credentials only from `EXA_API_KEY`. Never pass credentials as arguments, commit them to environment files, or attach them to bug reports.
