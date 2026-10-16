// Owner only. GET: all submissions. POST {id, action}: approve, reject or delete a job.
const { db, isAdmin, send } = require("./_lib");

module.exports = async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return send(res, 503, { error: "Add ADMIN_PASSWORD in Vercel settings first." });
  if (!isAdmin(req)) return send(res, 401, { error: "Wrong password." });
  try {
    const sql = await db();

    if (req.method === "GET") {
      const rows = await sql`select * from jobs order by created_at desc limit 300`;
      const [stats] = await sql`
        select
          count(*) filter (where status = 'review')::int as review,
          count(*) filter (where status = 'live')::int as live,
          coalesce(sum(amount_cents) filter (where status in ('review','live')), 0)::int as revenue_cents
        from jobs`;
      return send(res, 200, { jobs: rows, stats });
    }

    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    const { id, action } = req.body || {};
    const jobId = Number(id);
    if (!Number.isInteger(jobId)) return send(res, 400, { error: "Missing job id" });

    if (action === "approve") await sql`update jobs set status = 'live', approved_at = now() where id = ${jobId}`;
    else if (action === "reject") await sql`update jobs set status = 'rejected' where id = ${jobId}`;
    else if (action === "unpublish") await sql`update jobs set status = 'review' where id = ${jobId}`;
    else if (action === "delete") await sql`delete from jobs where id = ${jobId}`;
    else return send(res, 400, { error: "Unknown action" });

    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Database error" });
  }
};
