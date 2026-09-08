// Turns a GoCardless transaction into one of ours, and guesses an envelope.

// Bank descriptions are noisy: "SAINSBURYS S/MKTS 4021", "TFL TRAVEL CH".
// Strip the card/reference tail and title-case what is left.
export function tidyName(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/\s+/g, " ")
    .replace(/\b(card|ref|reference|payment|purchase|on)\b\s*\d+/gi, "")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s*[*/#]+\s*/g, " ")
    .trim()
    .slice(0, 40)
    .replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .trim();
}

// Starting rules for common UK merchants. Every rule is [substring, envelope id].
// The user's own rules are stored in settings.rules and take precedence.
export const DEFAULT_RULES = [
  ["tesco", "groceries"], ["sainsbury", "groceries"], ["asda", "groceries"],
  ["aldi", "groceries"], ["lidl", "groceries"], ["morrisons", "groceries"],
  ["waitrose", "groceries"], ["co-op", "groceries"], ["iceland", "groceries"],
  ["m&s", "groceries"], ["ocado", "groceries"],

  ["tfl", "transport"], ["trainline", "transport"], ["uber", "transport"],
  ["bolt", "transport"], ["shell", "transport"], ["bp ", "transport"],
  ["esso", "transport"], ["parking", "transport"], ["rail", "transport"],

  ["deliveroo", "dining"], ["just eat", "dining"], ["ubereats", "dining"],
  ["uber eats", "dining"], ["costa", "dining"], ["pret", "dining"],
  ["greggs", "dining"], ["nando", "dining"], ["mcdonald", "dining"],
  ["starbucks", "dining"], ["restaurant", "dining"], ["cafe", "dining"],

  ["netflix", "fun"], ["spotify", "fun"], ["disney", "fun"], ["cinema", "fun"],
  ["steam", "fun"], ["playstation", "fun"], ["nintendo", "fun"],

  ["british gas", "bills"], ["octopus energy", "bills"], ["edf", "bills"],
  ["thames water", "bills"], ["council tax", "bills"], ["vodafone", "bills"],
  ["ee ", "bills"], ["o2", "bills"], ["three", "bills"], ["sky", "bills"],
  ["virgin media", "bills"], ["bt ", "bills"], ["insurance", "bills"],
  ["tv licence", "bills"],

  ["boots", "health"], ["pharmacy", "health"], ["dentist", "health"],
  ["nuffield", "health"], ["gym", "health"], ["puregym", "health"],

  ["ikea", "home"], ["b&q", "home"], ["homebase", "home"], ["argos", "home"],
  ["dunelm", "home"], ["screwfix", "home"],
];

export function categorise(text, rules) {
  const hay = String(text || "").toLowerCase();
  for (const [needle, cat] of rules) {
    if (hay.includes(String(needle).toLowerCase())) return cat;
  }
  return "other";
}

const name = (party) =>
  !party ? "" : typeof party === "string" ? party : party.name || "";

// Enable Banking sends the amount as a positive decimal string plus a
// credit/debit indicator. Some banks send a signed amount and no indicator, so
// both are honoured — indicator first, sign as the fallback.
export function normalise(tx, rules) {
  const raw = Number(tx.transaction_amount?.amount ?? 0);
  const indicator = String(tx.credit_debit_indicator || "").toUpperCase();
  const isIncome = indicator ? indicator.startsWith("CRDT") : raw > 0;

  const date = (tx.booking_date || tx.transaction_date || tx.value_date || "").slice(0, 10);

  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.join(" ")
    : tx.remittance_information || "";

  const description = [
    name(isIncome ? tx.debtor : tx.creditor),
    name(isIncome ? tx.creditor : tx.debtor),
    remittance,
    tx.additional_information,
  ].filter(Boolean).join(" ");

  const note = tidyName(description);
  const bankId = tx.transaction_id || tx.entry_reference || null;

  return {
    id: "eb-" + (bankId || `${date}-${raw}-${note}`),
    bankId,
    type: isIncome ? "income" : "expense",
    cat: isIncome ? "" : categorise(description, rules),
    amt: Math.abs(raw),
    note,
    date,
    src: "bank",
  };
}
