"use strict";
/* =====================================================================
   MEDEXEC Demo Portal — access notification + activity endpoint.

   POST /api/demo-notify  { event, email, name, detail }

   Events (2026-11-05 — FULL ACTIVITY MONITORING, DrMorgan's order):
     activation | login            — the original access notifications
     login_failed                  — detail: wrong password / unknown
                                     email / not activated / …
     paused_attempt | revoked_attempt
     logout | step_view | action   — walkthrough + key demo actions

   Called by the demo portal (demo/index.html), the activation page
   (demo/activate/) and the demo app (demo/app/) — fire-and-forget.

   TWO channels, kept strictly separate:
   1. EMAIL (unchanged from 2026-11-04): ONLY a successful activation
      or login sends DrMorgan a plain factual email naming who
      accessed the demo and when — provisioned accounts only, the
      seed account never. Fail-closed without RESEND_API_KEY: a
      logged NO-OP and 200 { sent: false }.
   2. OFFICE ACTIVITY FEED (new): EVERY accepted event is forwarded
      server-side to the IEC Office ingest
      (https://iecincglobal.com/api/demo-activity) with the
      DEMO_ACTIVITY_SECRET header, where it lands in the central
      Demo Users activity view. Fail-SILENT: with the secret unset
      or the POST failing, a NO-OP line is logged and the demo flow
      is never affected.

   Server-side discipline (the client is a simulation; this is not):
   - The email recipient, the name, and the account status are
     derived HERE from demo/provisioning.js — client-supplied
     name/status ignored for any provisioned account.
   - An event claiming an email that is NOT provisioned is still
     forwarded (monitoring must not drop it) with the claimed
     identity flagged "identity unverified" in the detail; it can
     never trigger an email, and a login/activation event for it
     still answers 403 exactly as before.
   - The internal seed account (demo@medexec.example) NEVER emails;
     its activity forwards flagged seed: true.
   - No token or password is ever forwarded or emailed — the
     forwarded record is built here from whitelisted fields only.

   Env (this Vercel project — medexec-site):
     RESEND_API_KEY      the sending key (Resend workspace
                         "drmohdmorgan", a key created for THIS
                         project — keys are not shared across projects)
     DEMO_NOTIFY_FROM    optional sender override; default is Resend's
                         onboarding sender until a getmedexec.com
                         sender is verified in Resend
     DEMO_NOTIFY_TO      optional recipient override (default below)
     DEMO_ACTIVITY_SECRET shared secret for the IEC Office activity
                         ingest (x-demo-activity-secret header)
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

/* Full-monitoring event vocabulary. Only EMAIL_EVENTS can ever send
   the access email; every event in KNOWN_EVENTS is forwarded to the
   IEC Office activity ingest. */
const EMAIL_EVENTS = ["login", "activation"];
const KNOWN_EVENTS = [
  "login", "activation", "login_failed", "paused_attempt",
  "revoked_attempt", "logout", "step_view", "action"
];
const ACTIVITY_INGEST_URL = "https://iecincglobal.com/api/demo-activity";
const ACTIVITY_ASSET = "medexec";

/* Forward one activity record to the IEC Office ingest. Fail-silent
   by design: an unset secret is a logged NO-OP, a failed POST is a
   logged error — neither ever reaches the demo flow. The record is
   constructed by the caller from whitelisted fields only. */
async function forwardActivity(record) {
  const secret = process.env.DEMO_ACTIVITY_SECRET || "";
  if (!secret) {
    console.log(
      `[demo-notify] ACTIVITY NO-OP — DEMO_ACTIVITY_SECRET is not configured for this project; ` +
      `event not forwarded to the IEC Office: ${record.event} by ${record.email}.`
    );
    return false;
  }
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 3000) : null;
    const r = await fetch(ACTIVITY_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-demo-activity-secret": secret
      },
      body: JSON.stringify(record),
      signal: ctrl ? ctrl.signal : undefined
    });
    if (timer) clearTimeout(timer);
    if (!r.ok) {
      console.error(`[demo-notify] activity forward FAILED for ${record.event} by ${record.email}: HTTP ${r.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[demo-notify] activity forward ERRORED for ${record.event} by ${record.email}: ${e && e.message}`);
    return false;
  }
}

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

  if (!KNOWN_EVENTS.includes(event)) {
    return reply(res, 400, { ok: false, error: "unknown_event" });
  }

  /* ---- Full-monitoring forward (every accepted event) ----
     Identity is derived HERE from provisioning, exactly as for the
     email: a provisioned email gets its provisioned name; the seed
     is flagged; an unprovisioned claimed email is forwarded with the
     claimed identity flagged unverified — never dropped, never
     trusted for anything beyond this log line. The detail is a
     whitelisted, length-capped string; passwords and tokens are
     never read from the body, so they can never leak into the feed. */
  const isSeed = email === SEED_EMAIL;
  const prov = findProvisioned(email);
  const unverified = !prov && !isSeed;
  let detail = String(body.detail || "").slice(0, 200);
  if (unverified) detail = (detail ? detail + " · " : "") + "identity unverified";
  const record = {
    asset: ACTIVITY_ASSET,
    email,
    name: prov ? (prov.name || email) : String(body.name || "").slice(0, 120) || email,
    event,
    detail,
    ts: new Date().toISOString(),
    seed: isSeed
  };
  const forwarded = await forwardActivity(record);

  /* Monitoring-only events end here — they never email. */
  if (!EMAIL_EVENTS.includes(event)) {
    return reply(res, 200, { ok: true, forwarded });
  }

  /* Internal seed: success is accepted and stays silent, always. */
  if (isSeed) {
    console.log(`[demo-notify] seed account ${event} — notification suppressed by design.`);
    return reply(res, 200, { ok: true, sent: false, reason: "seed_silent", forwarded });
  }

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
    return reply(res, 200, { ok: true, sent: false, reason: "not_configured", forwarded });
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
    return reply(res, 200, { ok: true, sent: true, id: data.id || null, forwarded });
  } catch (e) {
    console.error(`[demo-notify] Resend send ERRORED for ${event} by ${email}: ${e && e.message}`);
    return reply(res, 502, { ok: false, error: "send_failed" });
  }
};
