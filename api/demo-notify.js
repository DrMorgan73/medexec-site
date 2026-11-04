"use strict";
/* =====================================================================
   MEDEXEC Demo Portal — access notification endpoint.

   POST /api/demo-notify  { event: "login" | "activation", email, name }

   Called by the demo portal (demo/index.html) and the activation page
   (demo/activate/) ONLY after a successful login or activation — never
   on a failed attempt. Sends DrMorgan a plain factual email naming
   who accessed the demo, what they did, and when.

   Server-side discipline (the client is a simulation; this is not):
   - The recipient, the name, and the account status are derived HERE
     from demo/provisioning.js — client-supplied name/status ignored.
   - Only provisioned emails can trigger a notification (else 403).
   - The internal seed account (demo@medexec.example) NEVER notifies.
   - No token or password is ever included (none is ever received).
   - Sending is via Resend and FAIL-CLOSED: with no RESEND_API_KEY in
     this project's environment, nothing is sent — the endpoint logs a
     clearly-marked NO-OP line and answers 200 { sent: false }, so a
     missing key never breaks or blocks the demo sign-in flow.

   Env (this Vercel project — medexec-site):
     RESEND_API_KEY   the sending key (Resend workspace "drmohdmorgan",
                      a key created for THIS project — keys are not
                      shared across projects)
     DEMO_NOTIFY_FROM optional sender override; default is Resend's
                      onboarding sender until a getmedexec.com sender
                      is verified in Resend
     DEMO_NOTIFY_TO   optional recipient override (default below)
   ===================================================================== */

let PROVISIONED = [];
try {
  PROVISIONED = require("../demo/provisioning.js").DEMO_PROVISIONED_ACCOUNTS || [];
} catch (e) {
  PROVISIONED = [];
}

/* ORG email signature incl. the MEDEXEC logo (DrMorgan's rules,
   2026-11-04 18:53 + the 18:55 correction: system mail carries the
   org variant — no personal name) — shared with /api/demo-provision. */
const { SIGNATURE_TEXT, SIGNATURE_HTML } = require("./_signature");

const NOTIFY_TO = process.env.DEMO_NOTIFY_TO || "drmohdmorgan@getmedexec.com";
const NOTIFY_FROM =
  process.env.DEMO_NOTIFY_FROM || "MEDEXEC Demo Portal <onboarding@resend.dev>";
const SEED_EMAIL = "demo@medexec.example";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findProvisioned(email) {
  const e = normalizeEmail(email);
  return PROVISIONED.find(a => normalizeEmail(a.email) === e) || null;
}

/* e.g. "November 4, 2026 at 6:21:05 PM EST" — the notification's WHEN
   is stamped here, in DrMorgan's timezone, never trusted to the client. */
function formatEastern(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return new Promise(resolve => {
    let data = "";
    if (typeof req.on !== "function") return resolve({});
    req.on("data", c => { data += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch (e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function reply(res, code, obj) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(code).json(obj);
  }
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, error: "method_not_allowed" });

  const body = await readBody(req);
  const event = String(body.event || "");
  const email = normalizeEmail(body.email);

  if (event !== "login" && event !== "activation") {
    return reply(res, 400, { ok: false, error: "unknown_event" });
  }

  /* Internal seed: success is accepted and stays silent, always. */
  if (email === SEED_EMAIL) {
    console.log(`[demo-notify] seed account ${event} — notification suppressed by design.`);
    return reply(res, 200, { ok: true, sent: false, reason: "seed_silent" });
  }

  const prov = findProvisioned(email);
  if (!prov) return reply(res, 403, { ok: false, error: "not_provisioned" });

  const name = prov.name || email;
  const status = String(prov.status || "invited").toLowerCase();
  const when = formatEastern(new Date());
  const what =
    event === "activation"
      ? "Activated their MEDEXEC demo account (set their password from the activation link)"
      : "Signed in to the MEDEXEC demo portal";

  const key = process.env.RESEND_API_KEY || "";
  if (!key) {
    console.log(
      `[demo-notify] NO-OP — RESEND_API_KEY is not configured for this project; ` +
      `would have emailed ${NOTIFY_TO}: ${event} by ${name} (${email}) at ${when}.`
    );
    return reply(res, 200, { ok: true, sent: false, reason: "not_configured" });
  }

  const subject = `MEDEXEC demo ${event} — ${name} (${email})`;
  const text = [
    "MEDEXEC Demo Portal — access notification",
    "",
    `Who: ${name} (${email})`,
    `What: ${what}`,
    `When: ${when} (America/New_York)`,
    `Account status (provisioning): ${status}`,
    "",
    "Access is controlled in demo/provisioning.js (invited / active / paused / revoked).",
    "",
    SIGNATURE_TEXT
  ].join("\n");
  const esc = s =>
    String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = [
    "<p><strong>MEDEXEC Demo Portal — access notification</strong></p>",
    `<p>Who: ${esc(name)} (${esc(email)})<br>`,
    `What: ${esc(what)}<br>`,
    `When: ${esc(when)} (America/New_York)<br>`,
    `Account status (provisioning): ${esc(status)}</p>`,
    "<p>Access is controlled in demo/provisioning.js (invited / active / paused / revoked).</p>",
    SIGNATURE_HTML
  ].join("\n");

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from: NOTIFY_FROM, to: [NOTIFY_TO], subject, text, html })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`[demo-notify] Resend send FAILED for ${event} by ${email}: HTTP ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
      return reply(res, 502, { ok: false, error: "send_failed" });
    }
    console.log(`[demo-notify] sent ${event} notification for ${email} (Resend id ${data.id || "?"}).`);
    return reply(res, 200, { ok: true, sent: true, id: data.id || null });
  } catch (e) {
    console.error(`[demo-notify] Resend send ERRORED for ${event} by ${email}: ${e && e.message}`);
    return reply(res, 502, { ok: false, error: "send_failed" });
  }
};
