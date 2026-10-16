// Shared helpers for the API routes. Files starting with "_" are not exposed as routes by Vercel.
const postgres = require("postgres");
const crypto = require("crypto");

let sql;
let ready;

function connect() {
  if (sql) return sql;
  const raw = process.env.POSTGRES_URL;
  if (!raw) throw new Error("Database is not connected. Connect Supabase to this Vercel project.");
  // Supabase adds extra query params (like supa=...) that Postgres rejects; keep the base URL only.
  const url = new URL(raw);
  url.search = "";
  sql = postgres(url.toString(), { ssl: "require", prepare: false, max: 1, idle_timeout: 20 });
  return sql;
}

// Creates the jobs table the first time any route runs.
async function db() {
  const s = connect();
  if (!ready) {
    ready = (async () => {
      await s`
        create table if not exists jobs (
          id bigint generated always as identity primary key,
          created_at timestamptz not null default now(),
          company text not null,
          city text not null,
          title text not null,
          route_type text,
          role text,
          pay text,
          pay_unit text,
          description text,
          phone text not null,
          email text not null,
          tier text not null,
          status text not null default 'unpaid',
          free_post boolean not null default false,
          amount_cents integer not null default 0,
          stripe_session_id text,
          approved_at timestamptz
        )`;
      // Keeps the table private from Supabase's public API keys; only these server routes can read it.
      await s`alter table jobs enable row level security`;
      await s`create index if not exists jobs_status_idx on jobs (status)`;
      await s`create index if not exists jobs_session_idx on jobs (stripe_session_id)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
  return s;
}

const PLANS = {
  basic: { cents: 4900, name: "Single job post (30 days)", mode: "payment" },
  featured: { cents: 9900, name: "Featured job post (pinned 4 weeks)", mode: "payment" },
  monthly: { cents: 19900, name: "Unlimited job posts (founding rate)", mode: "subscription" },
};

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not connected. Add STRIPE_SECRET_KEY in Vercel.");
  return require("stripe")(key);
}

function origin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD || "";
  const got = String(req.headers["x-admin-key"] || "");
  if (!want || !got) return false;
  const a = crypto.createHash("sha256").update(want).digest();
  const b = crypto.createHash("sha256").update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

function send(res, code, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(code).json(body);
}

module.exports = { db, PLANS, stripe, origin, clean, isAdmin, send };
