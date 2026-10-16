# The Trucker Club

Website for thetruckerclub.com: CDL jobs and WhatsApp driver communities.

- `index.html`: the whole public site plus the admin page (Admin link in the footer)
- `api/jobs.js`: list live jobs, accept new job posts, start Stripe Checkout
- `api/confirm.js`: confirms a Stripe payment when the company returns
- `api/admin.js`: owner only review queue (approve, reject, delete)
- `api/health.js`: shows whether the database and Stripe are connected

Settings in Vercel: Supabase integration (POSTGRES_URL etc.), STRIPE_SECRET_KEY, ADMIN_PASSWORD.
