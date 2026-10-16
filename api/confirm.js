// Called when a company returns from Stripe. Checks the payment with Stripe and moves the job to review.
const { db, stripe, send } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const id = String(req.query.session_id || "");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return send(res, 400, { error: "Invalid session" });

    const session = await stripe().checkout.sessions.retrieve(id);
    const paid = session.payment_status === "paid" || (session.mode === "subscription" && session.status === "complete");
    if (!paid) return send(res, 200, { paid: false });

    const sql = await db();
    await sql`update jobs set status = 'review' where stripe_session_id = ${id} and status = 'unpaid'`;
    return send(res, 200, { paid: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Could not confirm payment" });
  }
};
