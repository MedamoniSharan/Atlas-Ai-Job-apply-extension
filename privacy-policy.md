# Privacy Policy — Cosmo Job Assistant

**Effective date:** July 24, 2026  
**Controller:** Cosmovai (“Cosmo”, “we”, “us”)  
**Contact:** support@cosmovai.com · hello@cosmovai.com

This policy describes how Cosmo collects, uses, and stores information when you use the Cosmo website/dashboard and the Cosmo Job Assistant browser extension (Chrome, Microsoft Edge, or Firefox).

> **Store note:** Publish this document at a stable HTTPS URL (for example `https://<your-domain>/privacy`) and link that URL in every browser store listing before submission.

## 1. What Cosmo is

Cosmo helps you sync and manage job-application activity from supported job sites (currently Naukri) into your Cosmo dashboard. Optional co-pilot features can assist with scanning listings and Easy Apply flows while you are signed into those sites in your browser.

## 2. Information we collect

### Account and authentication

- Name and email address (from Google Sign-In when you create or access an account).
- Authentication tokens (access and refresh JWTs) used to call our API.
- For admin accounts only: password hashes (bcrypt). End-user accounts use Google Sign-In.

### Job preferences

Preferences you configure (for example job titles, keywords, locations, experience, salary range, work mode, and auto-scan / auto-apply flags).

### Job and application data

When the extension runs on supported job pages, we may process and store job metadata such as title, company, location, job URL, description excerpts, skills, salary text, and application status events. This data is synced to our servers so it appears in your dashboard.

### Billing

If you subscribe to a paid plan, we process payment-related identifiers through Razorpay (for example customer, order, payment, and subscription IDs). Card details are handled by Razorpay, not stored by Cosmo as full card numbers.

### Extension and device technical data

- Extension connection time.
- API health / error diagnostics needed to operate the service.
- Local extension storage of tokens, preferences, queued events, and co-pilot session state (`chrome.storage.local` or equivalent).

### What we do **not** collect (current product)

- We do not upload your resume/CV files to Cosmo servers in the current product. Easy Apply uses your existing session on the job site.
- We do not run third-party product analytics SDKs (for example Google Analytics or Mixpanel) in the checked-in client.
- We do not sync Naukri cookie values to Cosmo servers; the extension may check for the presence of session cookies only as a login hint.

## 3. How we use information

- Provide authentication, dashboard, and extension sync features.
- Enforce plan limits and apply-safety quotas.
- Process subscriptions and invoices.
- Improve reliability (errors, sync retries) and prevent abuse.
- Communicate about support, security, or material product changes.

## 4. Legal bases (where applicable)

Depending on your jurisdiction, we rely on contract performance, legitimate interests in operating a secure product, and/or consent (for example when you explicitly start co-pilot features after acknowledging the in-product consent text).

## 5. Sharing

We share data with:

- **Infrastructure providers** hosting our API and database.
- **Google** for Sign-In.
- **Razorpay** for payments.
- **Authorities** when required by law.

We do not sell your personal information.

## 6. Storage and security

- Access tokens are short-lived; refresh tokens are stored hashed on the server.
- Tokens may also be stored in your browser (`localStorage` on the dashboard; extension local storage).
- We use HTTPS for production API traffic and industry-standard practices (password hashing for admins, Helmet, input validation). No method of transmission or storage is 100% secure.

## 7. Retention

We retain account, preference, application, and billing records while your account is active and as needed for legal, tax, and dispute purposes. You may request deletion by contacting support (self-serve deletion may be limited in early versions).

## 8. Your rights

Depending on your location, you may have rights to access, correct, delete, or export personal data, or to object to certain processing. Contact support@cosmovai.com.

## 9. Children’s privacy

Cosmo is not directed to children under 16 (or the equivalent minimum age in your region).

## 10. Third-party sites

The extension interacts with third-party job sites (for example Naukri). Their privacy policies and terms govern your use of those sites. Cosmo is not responsible for third-party practices.

## 11. International transfers

If you access Cosmo from outside the country where our servers are located, your information may be processed in other countries with different data-protection laws.

## 12. Changes

We may update this policy. Material changes will be reflected by updating the effective date and, where appropriate, additional notice in the product.

## 13. Contact

Cosmovai — support@cosmovai.com · hello@cosmovai.com
