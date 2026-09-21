# Security Policy

Please do not open a public issue for a suspected vulnerability that could expose users, credentials, infrastructure or private data.

Use GitHub's private vulnerability reporting for this repository from the **Security** tab and choose **Report a vulnerability**. This is the preferred disclosure channel because it keeps the report private while maintainers investigate and coordinate remediation.

If private vulnerability reporting is unavailable to you, contact Brida maintainers privately through the security contact listed on the Brida organization/profile.

## Public repository security rules
- never submit real API keys or provider credentials;
- use synthetic fixtures only;
- do not publish exploit details before coordinated remediation;
- fork PR workflows must not receive production or publishing secrets;
- generated artifacts must not contain local/private paths or source maps with internal data.
- pull requests and `main` are scanned with GitHub CodeQL; do not bypass a failing code-scanning gate.

Brida may temporarily restrict discussion or publication while a vulnerability is investigated.

Security reports do not grant permission to access data or systems beyond what you are authorized to test.
