# Support — Cosmo Job Assistant

**Product:** Cosmo Job Assistant (browser extension) + Cosmo dashboard  
**Company:** Cosmovai

## Contact

| Channel | Address |
|---------|---------|
| General / product help | hello@cosmovai.com |
| Support | support@cosmovai.com |
| Sales / billing | sales@cosmovai.com |

When emailing, include:

1. Cosmo account email  
2. Browser and version (Chrome / Edge / Firefox)  
3. Extension version (from `chrome://extensions` or equivalent)  
4. Steps to reproduce and screenshots if possible  

## Common topics

### Installing the extension

1. Build or download the approved store package (`extension/dist` for local/dev).  
2. Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist`.  
3. After store publication, use the official Chrome / Edge / Firefox listing links on the Cosmo website.

### Signing in

- Dashboard users sign in with **Google**.  
- The extension receives session tokens from the dashboard via the auth bridge when you are signed in on the Cosmo site.  
- Ensure the dashboard origin matches the extension’s configured host permissions (production HTTPS origin required for store builds).

### Naukri co-pilot

- You must be logged into Naukri in the same browser profile.  
- Co-pilot requires explicit consent in the panel before assisted scanning/apply.  
- Captchas, company-site redirects, and screening questions may block Easy Apply automation.

### Billing

- Paid plans are managed on the Cosmo website via Razorpay Subscriptions.  
- For failed charges or cancellation questions, email sales@cosmovai.com with your account email.

### Privacy & terms

- Privacy Policy: see `privacy-policy.md` (must be hosted at a public HTTPS URL for store listings).  
- Terms of Service: see `terms.md` (same hosting requirement).

## Status / outages

If the API is unreachable, the extension queues events locally and retries when connectivity returns. Check the dashboard health endpoint / status communications from Cosmovai for planned maintenance.

## Security reports

Report suspected vulnerabilities to support@cosmovai.com with subject `Security report`. Do not include real user credentials in the report.
