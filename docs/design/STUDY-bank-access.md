# Study: reaching your own bank data without a middleman

The question (2026-10-21): can a person connect to their own banks directly instead of through a middleman, and automate reading their own bank data? The banks studied are Unicaja, Revolut, Openbank and a Canadian bank; Enable Banking and statement files are studied as the alternatives.

This is the study [DESIGN-finance](DESIGN-finance.md) refers to; the design's summary of it is its section "Why you can't simply connect to your own bank yourself". What was built from it is at the end.

## The short answer

You can read your own data, but not through the door the banks built for software. That door (PSD2's account information API) only opens for a licensed company presenting a certificate that names its licence. Everything a person can do alone either goes through the bank's website or app as a human would, which breaks and fights two-factor checks, or through files the bank lets you download. So the options are: borrow a licensed company's door (Enable Banking lends it free for your own accounts), or download files and let software read them. The plugin does both, and makes downloading as close to automatic as it can be without holding your password.

## 1. The PSD2 API is closed to individuals

- **What it is.** Since 2019 every EU bank must offer an "access to account" interface (XS2A) for account information service providers (AISPs) and payment initiators. Most follow the Berlin Group's NextGenPSD2 specification; Spanish banks mostly reach it through Redsys's hub (Unicaja, Openbank).
- **Who may call it.** The caller must present an **eIDAS qualified certificate** (a QWAC for the TLS connection, a QSealC to seal requests) whose PSD2 extension names its role (AISP) and its **national authorisation number**. A qualified trust service provider only issues one against that registration.
- **What registration costs.** In Spain: authorisation as an AISP by the Banco de España (Ley 7/2019 / RDL 19/2018), professional liability insurance (or an equivalent guarantee), a security policy, incident reporting, audits; in practice thousands of euros a year and a legal entity. There is no "personal" tier: the law regulates the service of reading someone's accounts, and a person reading their own is not a market the law provides for.
- **Sandboxes do not help.** Banks' sandboxes return fake data; production needs the certificate.

## 2. Your own online banking: legal, but fragile to automate

- Logging into your own online banking is of course allowed. Automating it (a script that types your password) is a grey area under most banks' terms, and practically fragile:
  - **Strong customer authentication** (SCA, PSD2's two-factor rule) is asked at login. Banks may exempt read-only access from SCA for a period: originally 90 days; since the EBA's 2022 amendment (applied 2023) the exemption for access through a TPP is 180 days, but a bank's own website may still ask every time.
  - **Bot detection**: device fingerprinting, behavioural checks, CAPTCHAs.
  - **Redesigns** break every selector without warning.
- So a login script needs your password kept somewhere, breaks on the next redesign, and can lock your account after failed attempts. The plugin does not do it (see "What was built").

## 3. The banks' mobile app APIs are worse

The apps talk to private APIs protected by device binding, certificate pinning and app attestation (Google Play Integrity, Apple App Attest). Reverse engineering them is possible for study, but they change with every app update and attestation cannot be satisfied outside the genuine app on a genuine device. Not something to build a ledger on.

## 4. No personal API at any of the banks studied

- **Revolut:** an API only for Revolut Business accounts; personal accounts export CSV/Excel/PDF statements.
- **Unicaja:** no public API; exports Norma 43 (the AEB's fixed-width standard), Excel and PDF.
- **Openbank:** no public API; reachable through PSD2 aggregators.
- **The Canadian bank:** no public API; PDF statements (and OFX/QFX through some exports).

## 5. Canada

- **Status:** consumer-driven banking ("open banking") is legislated (the framework act in Bill C-15, Royal Assent 2026-03-26; regulations pre-published 2026-06-26) but has **no live date**: banks are not yet obliged to offer an API.
- **Screen scraping** is explicitly to be banned once the framework is live.
- **Until then** a Canadian bank is reachable only through commercial aggregators (Flinks, Plaid — contracts for businesses) or by exporting files.

## 6. Borrowing a licence: Enable Banking

- **What it is.** A licensed AISP (Finland) whose API reaches some 2,500 European banks. Its **restricted mode is free for accounts you link yourself**: you register an application, link only your own accounts, and read them through Enable Banking's licence. This is the closest thing to "direct" that is legal.
- **Mechanics** (implemented in `plugins/beta/finance/engine/src/bank.rs`):
  - Your application has an RSA key pair; you upload the public key. Every request carries a JWT signed RS256 with the private key (`kid` = the application id, `iss` = enablebanking.com, `aud` = api.enablebanking.com, valid an hour).
  - `GET /aspsps?country=ES` lists the banks.
  - `POST /auth` with the bank, the access's end date and your registered redirect URL answers the bank's consent page; you authenticate there (your bank's own SCA).
  - The bank redirects back with `?code=…`; `POST /sessions` turns it into a `session_id` and the linked accounts (`uid`, IBAN).
  - `GET /accounts/{uid}/transactions?date_from=…` pages through the transactions (`continuation_key`); `…/balances` the balances.
- **Limits:**
  - A consent lasts up to 90–180 days depending on the bank; then it is renewed with the same SCA.
  - PSD2's RTS art. 36(5): **four unattended reads a day** per account (more when you are present).
  - The redirect URL must be registered with the application, so it is a fixed address: the server's.
- **Alternatives looked at:** GoCardless Bank Account Data (formerly Nordigen) had a similar free tier and is what Actual Budget uses; it has been reported closed to new sign-ups since 2025, which is why Actual's data stopped at 2026-05 here. TrueLayer, Tink, Salt Edge: business contracts.

## 7. Files: the path that always works

Every bank lets its customers download statements. Their formats here: Unicaja Norma 43, Excel and PDF; the prepaid card Excel; the funds PDF; Revolut CSV; a Canadian bank's PDF; Actual's database as CSV. A file carries the bank's own running balances, which make the ledger checkable to the cent. Reading files is fully under the user's control and never breaks on a website redesign — only on a format change, which a preset (a TOML file) absorbs.

## What was built from this

- **Statement files** ([DESIGN-finance-import](DESIGN-finance-import.md)): presets as TOML for any format, duplicates across overlapping files and sources, transfers paired, balances asserted, originals archived. The always-works path.
- **Enable Banking on the server**: the application's key and each session are plugin secrets; the sync (every 6 h, under the four-a-day limit) writes the transactions as a CSV into the statements inbox and the `enable-banking` preset imports it, so it goes through the same import as a downloaded file. Not yet tried against the user's own application (it needs the application id, key and redirect).
- **From the bank's site, without a login script:** instead of a Playwright script holding the password (fragile, untestable here, a lock-out risk), the pane opens the bank's page in the browser, the user downloads as always, and the plugin takes every file in the downloads folder that a preset recognises into the inbox. Canadian banks are covered this way until Canada's framework is live.
