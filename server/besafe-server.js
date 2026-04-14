import "dotenv/config";
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// ============================================================
// CONFIG
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASS,
  },
});

const PLANS = {
  personal: {
    monthly: process.env.PRICE_PERSONAL_MONTHLY,
    annual: process.env.PRICE_PERSONAL_ANNUAL,
  },
  business: {
    monthly: process.env.PRICE_BUSINESS_MONTHLY,
    annual: process.env.PRICE_BUSINESS_ANNUAL,
  },
};

const MAX_DEVICES = 2;
const TRIAL_DAYS = 14;

// ============================================================
// APP
// ============================================================

const app = express();

// Webhook needs raw body — MUST be before express.json()
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook
);

app.use(cors());
app.use(express.json());

// ============================================================
// IMPORT DATA API from existing server
// ============================================================
import { db } from "./db/db.service.js";

// Transactions
app.get("/api/transactions", async (req, res) => {
  try { res.json(await db.getTransactions()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/transactions/:id", async (req, res) => {
  try { res.json(await db.getTransactionById(req.params.id)); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
app.post("/api/transactions", async (req, res) => {
  try { res.status(201).json(await db.addTransaction(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/transactions/:id", async (req, res) => {
  try { res.json(await db.updateTransaction(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/transactions/:id", async (req, res) => {
  try { res.json(await db.updateTransaction(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/transactions/:id", async (req, res) => {
  try { res.json(await db.deleteTransaction(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Categories
app.get("/api/categories", async (req, res) => {
  try { res.json(await db.getCategories()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/categories", async (req, res) => {
  try { res.status(201).json(await db.addCategory(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/categories/:id", async (req, res) => {
  try { res.json(await db.updateCategory(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/categories/:id", async (req, res) => {
  try { res.json(await db.updateCategory(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/categories/:id", async (req, res) => {
  try { res.json(await db.deleteCategory(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Places
app.get("/api/places", async (req, res) => {
  try { res.json(await db.getPlaces()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/places", async (req, res) => {
  try { res.status(201).json(await db.addPlace(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/places/:id", async (req, res) => {
  try { res.json(await db.updatePlace(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch("/api/places/:id", async (req, res) => {
  try { res.json(await db.updatePlace(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/places/:id", async (req, res) => {
  try { res.json(await db.deletePlace(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Saved Calculations
app.get("/api/saved-calculations", async (req, res) => {
  try { res.json(await db.getSavedCalculations()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/saved-calculations", async (req, res) => {
  try { res.status(201).json(await db.addSavedCalculation(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/saved-calculations/:id", async (req, res) => {
  try { res.json(await db.deleteSavedCalculation(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Summary
app.get("/api/summary", async (req, res) => {
  try {
    const transactions = await db.getTransactions();
    const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
    res.json({ income, expenses, balance: income - expenses, count: transactions.length, transactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve website
const websitePath = process.env.WEBSITE_PATH || path.join(__dirname, "..", "website");
app.use(express.static(websitePath));

// Fallback — serve index.html for root
app.get("/", (req, res) => {
  const indexFile = path.join(websitePath, "index.html");
  res.sendFile(indexFile);
});

// Serve BeSafe web app at /app
const appPath = path.join(__dirname, "..");
app.use("/app", express.static(appPath, {
  index: "index.html",
  extensions: ["html", "js", "css"],
}));

app.get("/app", (req, res) => {
  res.sendFile(path.join(appPath, "index.html"));
});

app.get("/app/*", (req, res) => {
  const filePath = path.join(appPath, req.params[0]);
  res.sendFile(filePath, (err) => {
    if (err) res.sendFile(path.join(appPath, "index.html"));
  });
});

// Download desktop app
app.get("/download", (req, res) => {
  const exePath = path.join(__dirname, "..", "dist", "win-unpacked", "BeSafe.exe");
  res.download(exePath, "BeSafe-Setup.exe", (err) => {
    if (err) {
      res.status(404).json({ error: "Desktop app not available for download yet." });
    }
  });
});

// ============================================================
// HELPERS
// ============================================================

function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `BSAFE-${segment()}-${segment()}-${segment()}-${segment()}`;
}

async function sendLicenseEmail(email, licenseKey, plan, billing) {
  const planLabel = plan === "business" ? "Business" : "Personal";
  const billingLabel = billing === "annual" ? "Annual" : "Monthly";

  await mailer.sendMail({
    from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: "Your BeSafe License Key",
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
        <div style="text-align:center;margin-bottom:1.5rem">
          <span style="font-size:1.5rem;color:#2ecc8a;font-weight:600">BeSafe</span>
        </div>

        <h1 style="color:#2ecc8a;font-size:1.4rem;margin-bottom:1rem;text-align:center">Welcome!</h1>

        <p style="color:#9dc4a8;line-height:1.7;margin-bottom:1.5rem;text-align:center">
          Your BeSafe license has been created. Enter this key in the app to activate.
        </p>

        <div style="background:#080d0b;border:1px solid rgba(46,204,138,0.18);border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem">
          <div style="font-size:0.65rem;color:#9dc4a8;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.6rem">LICENSE KEY</div>
          <div style="font-family:'Courier New',monospace;font-size:1.15rem;color:#2ecc8a;letter-spacing:0.18em;word-break:break-all">${licenseKey}</div>
        </div>

        <div style="text-align:center;margin-bottom:1.5rem">
          <a href="besafe://activate?key=${licenseKey}" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.75rem 2rem;border-radius:2rem;font-weight:600;font-size:0.9rem;text-decoration:none;letter-spacing:0.04em">Atidaryti BeSafe &#8594;</a>
          <p style="font-size:0.7rem;color:#5a7d67;margin-top:0.6rem">Arba nukopijuokite rakta ir iveskite programoje rankiniu budu.</p>
        </div>

        <table style="width:100%;font-size:0.85rem;color:#9dc4a8;margin-bottom:1.5rem;border-collapse:collapse">
          <tr><td style="padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">Plan</td><td style="text-align:right;color:#f2f8f4;padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">${planLabel}</td></tr>
          <tr><td style="padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">Billing</td><td style="text-align:right;color:#f2f8f4;padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">${billingLabel}</td></tr>
          <tr><td style="padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">Free trial</td><td style="text-align:right;color:#2ecc8a;padding:0.4rem 0;border-bottom:1px solid rgba(46,204,138,0.08)">${TRIAL_DAYS} days</td></tr>
          <tr><td style="padding:0.4rem 0">Devices</td><td style="text-align:right;color:#f2f8f4;padding:0.4rem 0">Up to ${MAX_DEVICES}</td></tr>
        </table>

        <div style="border-top:1px solid rgba(46,204,138,0.1);padding-top:1.25rem">
          <p style="font-size:0.75rem;color:#5a7d67;line-height:1.7;margin:0">
            The app verifies your key once a month. If you cancel, your data is never deleted — the app switches to read-only mode.
          </p>
        </div>
      </div>
    `,
  });
}

// ============================================================
// POST /api/register
// ============================================================

app.post("/api/register", async (req, res) => {
  try {
    const { email, plan, billing } = req.body;

    // Validate
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Neteisingas el. pasto adresas." });
    }
    if (!["personal", "business"].includes(plan)) {
      return res.status(400).json({ error: "Neteisingas planas." });
    }
    if (!["monthly", "annual"].includes(billing)) {
      return res.status(400).json({ error: "Neteisingas mokejimo tipas." });
    }

    const priceId = PLANS[plan]?.[billing];
    if (!priceId) {
      return res.status(500).json({ error: "Stripe kaina nesukonfigiruota siam planui." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already registered
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      return res.status(409).json({ error: "Sis el. pastas jau uzregistruotas." });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: normalizedEmail,
      metadata: { plan, billing },
    });

    // Create Stripe checkout session with trial
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { plan, billing },
      },
      success_url: `${req.protocol}://${req.get("host")}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get("host")}/#register`,
    });

    // Generate license key
    const licenseKey = generateLicenseKey();
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Save user to Supabase (matching existing table structure)
    const { data: userData, error: userError } = await supabase.from("users").insert({
      email: normalizedEmail,
      subscription_plan: plan,
      subscription_billing: billing,
      billing,
      stripe_customer_id: customer.id,
      stripe_session_id: session.id,
      stripe_subscription_id: session.subscription || null,
      subscription_status: "trial",
      trial_ends_at: trialEndsAt,
    }).select("id");

    if (userError) {
      console.error("[Register] User insert failed:", userError);
      return res.status(500).json({ error: "Registracija nepavyko." });
    }

    const userId = userData?.[0]?.id || null;

    // Save license to Supabase (matching existing table structure)
    const { error: licError } = await supabase.from("licenses").insert({
      license_key: licenseKey,
      user_id: userId,
      plan,
      billing,
      status: "trial",
      devices_used: 0,
      devices_max: MAX_DEVICES,
    });

    if (licError) {
      console.error("[Register] License insert failed:", licError);
      return res.status(500).json({ error: "Licencijos kurimas nepavyko." });
    }

    // Send license email
    try {
      await sendLicenseEmail(normalizedEmail, licenseKey, plan, billing);
      console.log(`[Register] Email sent to ${normalizedEmail}`);
    } catch (mailError) {
      console.error("[Register] Email failed:", mailError.message);
      // Don't fail registration if email fails
    }

    console.log(`[Register] OK | ${normalizedEmail} | ${plan}/${billing} | ${licenseKey}`);

    res.json({
      success: true,
      license_key: licenseKey,
      checkout_url: session.url,
      trial_days: TRIAL_DAYS,
    });
  } catch (error) {
    console.error("[Register] Error:", error.message);
    res.status(500).json({ error: "Serverio klaida. Bandykite dar karta." });
  }
});

// ============================================================
// POST /api/login
// ============================================================

app.post("/api/login", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Iveskite el. pasto adresa." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "Vartotojas su siuo el. pastu nerastas." });
    }

    // Find license
    const { data: license } = await supabase
      .from("licenses")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!license) {
      return res.status(404).json({ error: "Licencija nerasta. Susisiekite su palaikymu." });
    }

    // Send license key to email
    try {
      await mailer.sendMail({
        from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
        to: normalizedEmail,
        subject: "Your BeSafe License Key",
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
            <div style="text-align:center;margin-bottom:1.5rem">
              <span style="font-size:1.5rem;color:#2ecc8a;font-weight:600">BeSafe</span>
            </div>
            <h2 style="color:#2ecc8a;font-size:1.2rem;margin-bottom:1rem;text-align:center">Your License Key</h2>
            <div style="background:#080d0b;border:1px solid rgba(46,204,138,0.18);border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem">
              <div style="font-family:'Courier New',monospace;font-size:1.15rem;color:#2ecc8a;letter-spacing:0.18em">${license.license_key}</div>
            </div>
            <table style="width:100%;font-size:0.85rem;color:#9dc4a8;border-collapse:collapse">
              <tr><td style="padding:0.4rem 0">Plan</td><td style="text-align:right;color:#f2f8f4">${license.plan || "personal"}</td></tr>
              <tr><td style="padding:0.4rem 0">Status</td><td style="text-align:right;color:#2ecc8a">${license.status || "active"}</td></tr>
            </table>
            <div style="text-align:center;margin-top:1.5rem">
              <a href="besafe://activate?key=${license.license_key}" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.75rem 2rem;border-radius:2rem;font-weight:600;font-size:0.9rem;text-decoration:none">Open BeSafe \u2192</a>
            </div>
          </div>
        `,
      });
    } catch (mailError) {
      console.error("[Login] Email failed:", mailError.message);
    }

    console.log(`[Login] ${normalizedEmail} | ${license.license_key} | ${license.status}`);

    res.json({
      success: true,
      message: "Licencijos raktas issiustas i jusu el. pasta.",
      plan: license.plan,
      status: license.status,
      license_key: license.license_key,
    });
  } catch (error) {
    console.error("[Login] Error:", error.message);
    res.status(500).json({ error: "Serverio klaida. Bandykite dar karta." });
  }
});

// ============================================================
// POST /api/verify-license
// ============================================================

app.post("/api/verify-license", async (req, res) => {
  try {
    const { license_key, device_fingerprint } = req.body;

    if (!license_key || !device_fingerprint) {
      return res.status(400).json({ status: "invalid", error: "Missing parameters." });
    }

    // Find license
    const { data: license, error } = await supabase
      .from("licenses")
      .select("*")
      .eq("license_key", license_key)
      .single();

    if (error || !license) {
      return res.json({ status: "invalid", error: "License key not found." });
    }

    // Cancelled or expired → read-only
    if (license.status === "cancelled" || license.status === "expired") {
      return res.json({
        status: "read_only",
        plan: license.plan,
        message: "Subscription ended. Read-only mode.",
      });
    }

    // Payment failed → warn but allow temporary access
    if (license.status === "payment_failed") {
      return res.json({
        status: "payment_required",
        plan: license.plan,
        message: "Payment failed. Please update your payment method.",
      });
    }

    // Check trial expiry
    if (license.status === "trial" && license.trial_ends_at) {
      const trialEnd = new Date(license.trial_ends_at).getTime();

      if (Date.now() > trialEnd) {
        // Trial expired — check if Stripe subscription became active
        if (license.stripe_subscription_id) {
          try {
            const sub = await stripe.subscriptions.retrieve(license.stripe_subscription_id);
            if (sub.status === "active") {
              await supabase
                .from("licenses")
                .update({ status: "active", updated_at: new Date().toISOString() })
                .eq("license_key", license_key);
              // Continue — now active
            } else {
              await supabase
                .from("licenses")
                .update({ status: "expired", updated_at: new Date().toISOString() })
                .eq("license_key", license_key);
              return res.json({ status: "read_only", plan: license.plan, message: "Trial ended." });
            }
          } catch {
            await supabase
              .from("licenses")
              .update({ status: "expired", updated_at: new Date().toISOString() })
              .eq("license_key", license_key);
            return res.json({ status: "read_only", plan: license.plan, message: "Trial ended." });
          }
        } else {
          await supabase
            .from("licenses")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("license_key", license_key);
          return res.json({ status: "read_only", plan: license.plan, message: "Trial ended." });
        }
      }
    }

    // Device limit check (using devices_used/devices_max columns)
    const devicesUsed = license.devices_used || 0;
    const maxDevices = license.devices_max || MAX_DEVICES;

    if (devicesUsed >= maxDevices) {
      return res.json({
        status: "device_limit",
        error: `Pasiektas irenginiu limitas (${maxDevices}).`,
        max_devices: maxDevices,
        current_devices: devicesUsed,
      });
    }

    // Update device count + last checked
    await supabase
      .from("licenses")
      .update({
        devices_used: devicesUsed + 1,
        last_checked_at: new Date().toISOString(),
      })
      .eq("license_key", license_key);

    console.log(`[Verify] OK | ${license_key} | device:${device_fingerprint.substring(0, 8)}... | ${license.status}`);

    res.json({
      status: "active",
      plan: license.plan,
      billing: license.billing,
      devices_used: devicesUsed + 1,
      max_devices: maxDevices,
    });
  } catch (error) {
    console.error("[Verify] Error:", error.message);
    res.status(500).json({ status: "error", error: "Server error." });
  }
});

// ============================================================
// POST /api/webhook — Stripe
// ============================================================

async function handleWebhook(req, res) {
  let event;

  // If webhook secret is configured, verify signature
  const sig = req.headers["stripe-signature"];
  if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[Webhook] Signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // No webhook secret — parse raw body (development only)
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).send("Invalid payload");
    }
  }

  const { type, data } = event;
  console.log(`[Webhook] ${type}`);

  try {
    switch (type) {
      // ---- Subscription created or updated ----
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = data.object;
        const customerId = subscription.customer;

        const { data: license } = await supabase
          .from("licenses")
          .select("license_key, status")
          .eq("stripe_customer_id", customerId)
          .single();

        if (license) {
          const newStatus = subscription.status === "active" ? "active"
            : subscription.status === "trialing" ? "trial"
            : license.status;

          await supabase
            .from("licenses")
            .update({
              status: newStatus,
              stripe_subscription_id: subscription.id,
              updated_at: new Date().toISOString(),
            })
            .eq("license_key", license.license_key);

          console.log(`[Webhook] ${license.license_key} → ${newStatus}`);
        }
        break;
      }

      // ---- Payment failed ----
      case "invoice.payment_failed": {
        const invoice = data.object;
        const customerId = invoice.customer;

        const { data: license } = await supabase
          .from("licenses")
          .select("license_key, email")
          .eq("stripe_customer_id", customerId)
          .single();

        if (license) {
          await supabase
            .from("licenses")
            .update({ status: "payment_failed", updated_at: new Date().toISOString() })
            .eq("license_key", license.license_key);

          try {
            await mailer.sendMail({
              from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
              to: license.email,
              subject: "BeSafe: Payment Failed",
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
                  <h2 style="color:#e8a44a;margin-bottom:1rem">Payment Failed</h2>
                  <p style="color:#9dc4a8;line-height:1.7">
                    Your BeSafe subscription payment could not be processed. Please update your payment method to continue using the app.
                  </p>
                  <p style="color:#2ecc8a;font-size:0.85rem;margin-top:1rem">Your data is safe and will never be deleted.</p>
                </div>
              `,
            });
          } catch (e) {
            console.error("[Webhook] Payment failed email error:", e.message);
          }

          console.log(`[Webhook] Payment failed: ${license.license_key}`);
        }
        break;
      }

      // ---- Subscription cancelled → read-only ----
      case "customer.subscription.deleted": {
        const subscription = data.object;
        const customerId = subscription.customer;

        const { data: license } = await supabase
          .from("licenses")
          .select("license_key, email")
          .eq("stripe_customer_id", customerId)
          .single();

        if (license) {
          await supabase
            .from("licenses")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("license_key", license.license_key);

          try {
            await mailer.sendMail({
              from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
              to: license.email,
              subject: "BeSafe: Subscription Cancelled",
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
                  <h2 style="color:#9dc4a8;margin-bottom:1rem">Subscription Cancelled</h2>
                  <p style="color:#9dc4a8;line-height:1.7">
                    Your BeSafe subscription has been cancelled. The app will switch to read-only mode.
                  </p>
                  <p style="color:#2ecc8a;font-weight:500;margin-top:1rem">
                    Your data is never deleted. You can reactivate anytime.
                  </p>
                </div>
              `,
            });
          } catch (e) {
            console.error("[Webhook] Cancel email error:", e.message);
          }

          console.log(`[Webhook] Cancelled: ${license.license_key}`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled: ${type}`);
    }
  } catch (error) {
    console.error(`[Webhook] Error processing ${type}:`, error.message);
  }

  res.json({ received: true });
}

// ============================================================
// HEALTH & INFO
// ============================================================

app.get("/api/health", async (req, res) => {
  const checks = { server: "ok", stripe: "unknown", supabase: "unknown", email: "unknown" };

  try {
    await stripe.customers.list({ limit: 1 });
    checks.stripe = "ok";
  } catch {
    checks.stripe = "error";
  }

  try {
    const { error } = await supabase.from("licenses").select("id").limit(1);
    checks.supabase = error ? "error" : "ok";
  } catch {
    checks.supabase = "error";
  }

  try {
    await mailer.verify();
    checks.email = "ok";
  } catch {
    checks.email = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  res.json({
    status: allOk ? "healthy" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   BeSafe Server v1.0.0                  ║
  ║   http://127.0.0.1:${PORT}                  ║
  ╠══════════════════════════════════════════╣
  ║   POST  /api/register                   ║
  ║   POST  /api/verify-license             ║
  ║   POST  /api/webhook                    ║
  ║   GET   /api/health                     ║
  ╚══════════════════════════════════════════╝
  `);
});
