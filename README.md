# Our Budgets

The budgeting app, self-hosted, with UK bank transactions pulled in automatically
through Enable Banking (open banking).

Runs on Cloudflare Pages + Functions + KV. Everything used here is on a free tier.

---

## What you need to do

Five steps. Steps 2–4 are yours because they involve your identity and your
credentials — the secret keys never go in the code and I never see them.

### 1. Put this folder in a Git repo

```bash
git init; git add -A; git commit -m "Initial commit"
```

(Windows PowerShell 5.1 has no `&&` — use `;` between commands, as above.)

Then create an empty repo on GitHub and push to it.

### 2. Get Enable Banking credentials

GoCardless closed Bank Account Data to new signups in 2025. Enable Banking is
the self-serve replacement: its **Restricted Production** tier is free and is
designed for exactly this case — reading accounts you own.

1. Sign up at <https://enablebanking.com/> and open the Control Panel.
2. Register an application. Choose **Restricted Production**, and set the
   redirect URL to `https://YOUR-APP.pages.dev/api/banks/callback`
   (you'll know the real domain after step 3 — you can come back and edit it).
3. Download the private key when it is offered. **It is shown once.** The
   filename is your application ID.
4. **Whitelist your own accounts** in the control panel (Linked accounts). On
   Restricted Production the API returns *only* whitelisted accounts — an
   account you skip here comes back as an empty list and the app will tell you
   it isn't whitelisted.

Free, read-only, and limited to the accounts you whitelist.

### 3. Create the Cloudflare pieces

1. Sign up at <https://dash.cloudflare.com/> (free).
2. **Workers & Pages → KV → Create namespace**, name it `our-budgets`.
   Copy the namespace ID into `wrangler.toml` where it says `REPLACE_ME`.
3. **Workers & Pages → Create → Pages → Connect to Git**, pick your repo.
   Build command: leave empty. Build output directory: `public`.

### 4. Set the environment variables

In the Pages project: **Settings → Environment variables → Production**.
Add all three as **encrypted** (click the lock):

| Name                         | Value                                                    |
| ---------------------------- | -------------------------------------------------------- |
| `ENABLE_BANKING_APP_ID`      | your application ID (the private key's filename)          |
| `ENABLE_BANKING_PRIVATE_KEY` | the whole `.pem` file, pasted including the BEGIN/END lines |
| `APP_PASSWORD`               | a long password you invent, to open the app               |

Then **Settings → Functions → KV namespace bindings**: bind the variable name
`BUDGET_KV` to the `our-budgets` namespace.

Redeploy after adding these — Cloudflare only picks them up on a new build.

### 5. Link your bank

Open your app URL, enter the password from `APP_PASSWORD`, then go to the
**Banks** tab and pick your bank. You are sent to your bank's own app to approve
read-only access, and back again. Transactions start flowing on the next sync.

---

## Security

The app refuses to serve any API route until `APP_PASSWORD` is set — it fails
closed rather than leaving your bank data on an open URL. The password is checked
server-side and stored as an HMAC in an HttpOnly cookie; it never reaches the
page's JavaScript.

If you want something stronger, put **Cloudflare Access** in front of the whole
project (Zero Trust → Access → Applications). Free for up to 50 users and gives
you real login with email one-time codes or a passkey.

Never commit `.dev.vars` or paste your keys into any file in this repo.

---

## Things that will bite you

- **Consent expires every 90 days.** UK Open Banking rule, not ours. The Banks
  tab shows the expiry date and prompts you to re-approve.
- **Rate limits.** The free tier allows only a few pulls per account per day, so
  sync is once-daily by design. Hammering it returns 429.
- **Read-only.** Balances and transactions. No payments, no changes at the bank.
- **Categorisation is guesswork.** Bank descriptions are messy
  (`SAINSBURYS S/MKTS 4021`). Rules live in Settings and you can correct any
  transaction; corrections teach a new rule.
- **Only whitelisted accounts appear.** That's what Restricted Production means.
  Add an account in the control panel first, or the link comes back empty.
- **First run needs a real check.** The endpoints here follow Enable Banking's
  documented API, but until it runs against a live account with your key, treat
  the transaction field mapping in `src/mapping.js` as unverified. The sync
  endpoint returns the field names of the first transaction it sees so a
  mismatch is obvious immediately.

---

## Local development (optional)

Needs Node.js, which isn't installed on this machine — install it from
<https://nodejs.org/> if you want to run the app locally. You don't need it to
deploy: Cloudflare builds in the cloud, so pushing to GitHub is enough.

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in your keys
npm run dev
```

`.dev.vars` is gitignored. `npm run dev` serves the site and functions at
<http://localhost:8788>.

---

## Layout

```
public/index.html      the app itself
functions/api/         serverless endpoints (Cloudflare Pages Functions)
  _middleware.js       password gate — every /api route passes through here
  login.js             exchanges the password for a cookie
  data.js              loads and saves your budget state
  banks/institutions   list of UK banks
  banks/link           starts the consent flow at your bank
  banks/callback       where the bank sends you back
  banks/status         which accounts are linked, when consent expires
  banks/sync           pulls new transactions
src/enablebanking.js   API client and JWT signing
src/mapping.js         bank transaction -> app transaction, and categorisation
```
