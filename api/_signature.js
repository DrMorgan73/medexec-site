"use strict";
/* =====================================================================
   MEDEXEC — ORG email signature for SYSTEM / automated email
   (DrMorgan's rules, 2026-11-04: 18:53 — all getmedexec.com email
   carries the full signature including the logo; 18:55 CORRECTION —
   system/automated mail, i.e. the demo activation email and the
   demo access notifications, uses the ORG variant WITHOUT his
   personal name: logo + "MEDEXEC · IEC, Inc." + phone + info@.
   His personal mailbox keeps the named variant.)

   Single source for the site project's serverless email senders
   (api/demo-notify.js, api/demo-provision.js). Not a route (leading
   underscore). HTML for the HTML part; the plain-text fallback keeps
   the org name, phone and email.

   SENDER NOTE: these senders' From stays Resend's onboarding address
   until the getmedexec.com domain is verified in Resend (checked
   2026-11-04: no resend._domainkey DKIM record and no send-subdomain
   SPF/MX records exist in the domain's DNS). After verification the
   From flips to info@getmedexec.com via the DEMO_NOTIFY_FROM /
   DEMO_PROVISION_FROM env vars — no code change.
   ===================================================================== */

const SIGNATURE_TEXT = [
  "MEDEXEC · IEC, Inc.",
  "857-867-1767",
  "info@getmedexec.com"
].join("\n");

const SIGNATURE_HTML = [
  '<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">',
  '<tr><td><img src="https://getmedexec.com/logo.png" width="140" alt="MEDEXEC" style="display:block;border:0"></td></tr>',
  '<tr><td style="padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#1A1A1A">',
  "<strong>MEDEXEC · IEC, Inc.</strong><br>",
  '<a href="tel:+18578671767" style="color:#1A1A1A;text-decoration:none">857-867-1767</a><br>',
  '<a href="mailto:info@getmedexec.com" style="color:#1A1A1A;text-decoration:none">info@getmedexec.com</a>',
  "</td></tr>",
  "</table>"
].join("");

module.exports = { SIGNATURE_TEXT, SIGNATURE_HTML };
