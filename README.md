# Our Budgets

A self-hosted budgeting app for iPhone. Envelopes, debts, monthly review, and
statement import from a CSV file.

Runs on Cloudflare Pages + Functions + KV, entirely on free tiers.

Live at <https://our-budgets.pages.dev>

---

## Why there is no automatic bank link

There was going to be one. It isn't possible at a sensible price for a UK
personal account, and that is worth writing down so it isn't re-litigated:

- **GoCardless Bank Account Data** closed to new signups in 2025.
- **Enable Banking** and **open-banking.io** are self-serve and cheap, but their
  coverage stops at the EEA border. Neither reaches UK institutions.
- The UK runs its own Open Banking regime requiring FCA registration and eIDAS
  certificates (EUR 3,000–8,000/year). Providers that absorb that cost charge
  accordingly: **TrueLayer** GBP 150–300/mo, **Yapily** GBP 200–500/mo,
  **Plaid** USD 500–2,000/mo minimum. All sales-led, all want a company.

So: CSV import. Free, instant, nothing expires, and a statement export is two
taps in the Revolut app.

---

## Importing a statement

Settings → **Import a statement** → choose the CSV.

The importer works out which columns are which, previews what it found, and
imports only rows it hasn't seen before, so re-importing an overlapping file is
safe. It handles:

- **Revolut** (`Completed Date` / `Description` / `Amount`), skipping pending rows
- **Barclays / Starling / HSBC** style exports with separate `Paid In` / `Paid Out`
- ISO (`2026-09-01`) and UK (`01/09/2026`) date formats
- Quoted fields containing commas, and `1,234.56` amounts

If a column is guessed wrong, the three dropdowns under the preview correct it
and the preview updates live.

Money out becomes an expense and is filed into an envelope using the merchant
name. Guesses are frequently wrong on unusual merchants — tap any entry to fix it.

---

## Deploying

Requires Node. From the project root:

```bash
npm install
npx wrangler pages deploy public --project-name=our-budgets
```

On Windows PowerShell use `npx.cmd`, and note that `&&` is not a valid separator
in PowerShell 5.1 — use `;` between commands.

### Secrets

Set once, by hand, so they never touch the repo:

```bash
npx.cmd wrangler pages secret put APP_PASSWORD --project-name=our-budgets
```

Redeploy after changing a secret — Cloudflare only picks them up on a new build.

### KV

The binding lives in `wrangler.toml` (`BUDGET_KV`) and points at the
`our-budgets` namespace. To recreate it:

```bash
npx wrangler kv namespace create our-budgets
```

Then paste the returned id into `wrangler.toml`.

---

## Security

Every `/api` route sits behind a password gate that **fails closed**: with no
`APP_PASSWORD` set the API returns 503 rather than serving data on an open URL.
The password is checked server-side and held as an HMAC in an HttpOnly cookie,
so it never reaches page JavaScript. Login attempts are rate limited per IP.

For something stronger, put **Cloudflare Access** in front of the project
(Zero Trust → Access → Applications) — free for up to 50 users.

Never commit `.dev.vars` or any `.pem`; both are gitignored.

---

## Layout

```
public/index.html      the whole app
public/privacy.html    privacy policy
public/terms.html      terms of use
functions/api/
  _middleware.js       password gate — every /api route passes through here
  login.js             exchanges the password for a cookie
  data.js              loads and saves budget state to KV
wrangler.toml          project config and the KV binding
```

State is one JSON document in KV: settings, months, and debts. Small enough that
splitting it would only add failure modes. The app also keeps a copy in
`localStorage`, so it still works if the server is unreachable — the header says
which mode it is in.
