"use strict";
/* =====================================================================
   MEDEXEC Demo Portal — provisioned accounts (single source of truth).

   Loaded by demo/index.html (the portal gate) and demo/activate/
   (the activation page). There is NO public self-signup and passwords
   are never sent by email: MEDEXEC provisions each account here, the
   signer receives a one-time activation link carrying the token, and
   sets their own password on the activation page. The token is
   single-use — it dies the moment the password is set. Links do NOT
   expire; control is administrative, through the status field:

     invited  — account created, activation link live, not yet used
     active   — account live (set by us once activation is confirmed,
                or for accounts whose password we manage directly)
     paused   — login blocked, account preserved (flip + redeploy)
     revoked  — activation link dead AND login dead (flip + redeploy)

   To provision a signer: add one entry with a fresh random token and
   status "invited", redeploy, and email them the link
   https://getmedexec.com/demo/activate/?token=<their token>.

   AUTOMATIC (2026-11-04): the DEFAULT trigger is now a MEDEXEC NDA
   signed through the public website — the app records the signing,
   then calls /api/demo-provision (api/demo-provision.js), which adds
   the entry here by committing this file (entries preserved
   byte-for-byte), waits for it to deploy, and sends the activation
   email. The manual path above remains for email-return NDAs.

   Static-stack note: this is the client-side simulation's data layer.
   Statuses are enforced by the portal/activation logic in the browser;
   real per-user auth remains the named next step before scale-out.

   Access notifications (2026-11-04): a successful activation or login
   calls /api/demo-notify (api/demo-notify.js), which emails DrMorgan
   who accessed the demo and when — never on a failed attempt, and
   never for the seed account. Sending needs RESEND_API_KEY in THIS
   project's Vercel env; without it the endpoint logs a NO-OP and the
   demo flow is unaffected.
   ===================================================================== */
const DEMO_PROVISIONED_ACCOUNTS = [
  {
    email: "drmohdmorgan@gmail.com",
    name: "Mohammed M. Morgan, M.D.",
    token: "401cd483d0ac728c3c21e54d313986e9c1299945a6d03b1",
    status: "invited",
    issuedAt: "2026-11-04T18:02:38-05:00"
  },
  {
    email: "colby@impactinsuranceut.com",
    name: "Colby Hepler",
    token: "41812c008d6a4c5528b9f1be5b6c21d9d65971eeddbb9112",
    status: "invited",
    issuedAt: "2026-11-04T18:14:05-05:00"
  },
  {
    /* Internal seed for end-to-end review; password lives in the
       DEMO_SEED_ACCOUNTS list on the portal page. No token: it is
       already active and cannot be (re)activated. */
    email: "demo@medexec.example",
    name: "Demo Reviewer",
    status: "active"
  },
  {
    email: "mohdology@gmail.com",
    name: "Mohamed Ismael",
    token: "263ac95efb00f4cf415af1d5f1d88c8bca400e8e2a0f972d",
    status: "paused",
    issuedAt: "2026-11-05T07:43:52-05:00"
  },
  {
    email: "esteadysteps@gmail.com",
    name: "Mohamed Ismail",
    token: "0ffbee26501d5432e366268674880e7e47ca00b968a6696d",
    status: "invited",
    issuedAt: "2026-11-05T07:49:21-05:00"
  },
  {
    email: "troyhyde@lghires.com",
    name: "Troy Hyde",
    token: "458987a6211bc8a5b032ec8049d83ba69094413c35cbb389",
    status: "invited",
    issuedAt: "2026-11-05T13:53:40-05:00"
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEMO_PROVISIONED_ACCOUNTS };
}
