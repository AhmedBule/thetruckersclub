// Reports which settings are present. Never returns secret values.
module.exports = (req, res) => {
  const has = (k) => Boolean(process.env[k] && process.env[k].length > 0);
  const stripe = process.env.STRIPE_SECRET_KEY || "";
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    supabase: {
      url: has("NEXT_PUBLIC_SUPABASE_URL") || has("SUPABASE_URL"),
      anonKey: has("NEXT_PUBLIC_SUPABASE_ANON_KEY") || has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      serviceKey: has("SUPABASE_SERVICE_ROLE_KEY") || has("SUPABASE_SECRET_KEY"),
      postgres: has("POSTGRES_URL"),
    },
    stripe: {
      secretKey: stripe.length > 0,
      testMode: stripe.startsWith("sk_test_") || stripe.startsWith("rk_test_"),
    },
    adminPassword: has("ADMIN_PASSWORD"),
    deployedAt: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
  });
};
