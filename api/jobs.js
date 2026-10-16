// GET: live jobs for the job board. POST: a company submits a job (free first post or Stripe checkout).
const { db, PLANS, stripe, origin, clean, send } = require("./_lib");

const ROUTES = ["OTR", "Regional", "Local", "Dedicated"];
const ROLES = ["Company driver", "Owner operator", "Lease purchase", "Team"];
const UNITS = ["per mile", "per week", "of gross", "per hour"];

module.exports = async (req, res) => {
  try {
    const sql = await db();

    if (req.method === "GET") {
      const rows = await sql`
        select id, company, city, title, route_type, role, pay, pay_unit, description, phone, tier, created_at
        from jobs
        where status = 'live'
        order by (tier = 'featured') desc, created_at desc
        limit 200`;
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
      return res.status(200).json({ jobs: rows });
    }

    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    const b = req.body || {};
    if (b.website) return send(res, 200, { free: true }); // hidden field: bots fill it, people don't

    const job = {
      company: clean(b.company, 100),
      city: clean(b.city, 80),
      title: clean(b.title, 120),
      route_type: ROUTES.includes(b.route_type) ? b.route_type : "OTR",
      role: ROLES.includes(b.role) ? b.role : "Company driver",
      pay: clean(b.pay, 30),
      pay_unit: UNITS.includes(b.pay_unit) ? b.pay_unit : "per mile",
      description: clean(b.description, 1200),
      phone: clean(b.phone, 30),
      email: clean(b.email, 120).toLowerCase(),
      tier: PLANS[b.tier] ? b.tier : "basic",
    };

    const missing = ["company", "city", "title", "pay", "phone", "email"].filter((k) => !job[k]);
    if (missing.length) return send(res, 400, { error: "Please fill in: " + missing.join(", ") + "." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(job.email)) return send(res, 400, { error: "Please enter a valid email address." });
    const phoneDigits = job.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) return send(res, 400, { error: "Please enter a full phone number with area code, like (612) 555 0123." });

    // First single post is free for a company that has never posted before.
    if (job.tier === "basic") {
      const digits = job.phone.replace(/\D/g, "");
      const [{ n }] = await sql`
        select count(*)::int as n from jobs
        where status <> 'unpaid'
          and (lower(email) = ${job.email} or regexp_replace(phone, '\\D', '', 'g') = ${digits})`;
      if (n === 0) {
        await sql`insert into jobs ${sql({ ...job, status: "review", free_post: true, amount_cents: 0 })}`;
        return send(res, 200, { free: true });
      }
    }

    const plan = PLANS[job.tier];
    const [row] = await sql`
      insert into jobs ${sql({ ...job, status: "unpaid", amount_cents: plan.cents })}
      returning id`;

    const base = origin(req);
    const price = {
      currency: "usd",
      unit_amount: plan.cents,
      product_data: { name: plan.name, description: `${job.title} · ${job.company}`.slice(0, 250) },
    };
    if (plan.mode === "subscription") price.recurring = { interval: "month" };

    const session = await stripe().checkout.sessions.create({
      mode: plan.mode,
      customer_email: job.email,
      line_items: [{ quantity: 1, price_data: price }],
      metadata: { job_id: String(row.id), tier: job.tier },
      ...(plan.mode === "subscription" ? { subscription_data: { metadata: { job_id: String(row.id) } } } : {}),
      success_url: `${base}/?paid={CHECKOUT_SESSION_ID}#companies`,
      cancel_url: `${base}/?canceled=1#companies`,
    });

    await sql`update jobs set stripe_session_id = ${session.id} where id = ${row.id}`;
    return send(res, 200, { url: session.url });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Something went wrong saving your job. Please try again or email jobs@thetruckerclub.com." });
  }
};
