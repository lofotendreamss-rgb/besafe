import "dotenv/config";
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

// Rate limiting middleware (Step 1c)
import {
  createRateLimit,
  keyByLicenseBody,
  keyByIp,
  keyByLicenseHeader,
} from "./middleware/rateLimit.js";

import Anthropic from "@anthropic-ai/sdk";
import { createAuthLicense } from "./middleware/authLicense.js";
import { createDailyQuota } from "./middleware/dailyQuota.js";
import { createChatHandler } from "./chatHandler.js";

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

// Fail-fast: Anthropic API key required for /api/chat endpoint.
// Missing key should crash server at boot, not on first user request.
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("[besafe-server] ANTHROPIC_API_KEY required in .env");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const mailer = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: {
    user: "resend",
    pass: process.env.RESEND_API_KEY,
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

// Personal plan device limit: phone + laptop + work computer.
const MAX_DEVICES = 3;
const TRIAL_DAYS = 14;

// ============================================================
// Rate limiters — Step 1c
// ============================================================
//
// /api/verify-license uses TWO limiters chained (dual protection
// per security review: single license_key limit can be bypassed by
// botnets rotating random license_keys, so IP limit provides
// defence-in-depth. See server/middleware/rateLimit.js).
//
//   1. IP limit:          30/min/IP  — catches botnets
//   2. license_key limit: 10/min/key — catches per-license brute force
//
// Both must pass; whichever 429s first rejects. State is in-memory,
// single-instance only. See TODO(redis) in rateLimit.js for scaling.
const verifyLicenseRateLimitIp = createRateLimit({
  limit: 30,
  windowMs: 60_000,
  keyExtractor: keyByIp,
  action: "rate_limit_verify_ip",
  supabase,
});
const verifyLicenseRateLimitKey = createRateLimit({
  limit: 10,
  windowMs: 60_000,
  keyExtractor: keyByLicenseBody,
  action: "rate_limit_verify_key",
  supabase,
});

// ============================================================
// AI chat endpoint middleware chain (Step 2a)
// ============================================================

const authLicense = createAuthLicense(supabase);

const chatRateLimit = createRateLimit({
  limit:        20,
  windowMs:     60_000,
  keyExtractor: keyByLicenseHeader,
  action:       "rate_limit_chat",
  supabase,
});

const dailyQuota = createDailyQuota(supabase);

const chatHandler = createChatHandler(anthropic, supabase);

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

async function sendLicenseEmail(email, licenseKey, plan) {
  const planLabel = plan === "business" ? "Business" : "Personal";

  await mailer.sendMail({
    from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: "Welcome to BeSafe — Your free trial is ready!",
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
        <div style="text-align:center;margin-bottom:1.5rem">
          <span style="font-size:1.8rem;color:#2ecc8a;font-weight:700">BeSafe</span>
        </div>

        <h1 style="color:#f2f8f4;font-size:1.5rem;margin-bottom:0.5rem;text-align:center">Welcome!</h1>
        <p style="color:#2ecc8a;font-size:1rem;text-align:center;margin-bottom:1.5rem;font-weight:500">Your ${TRIAL_DAYS}-day free trial has started</p>

        <p style="color:#9dc4a8;line-height:1.7;margin-bottom:1.5rem;text-align:center;font-size:0.9rem">
          No credit card required. No obligations.<br>Just explore BeSafe freely for ${TRIAL_DAYS} days.
        </p>

        <div style="background:#080d0b;border:1px solid rgba(46,204,138,0.18);border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem">
          <div style="font-size:0.65rem;color:#9dc4a8;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.6rem">YOUR LICENSE KEY</div>
          <div style="font-family:'Courier New',monospace;font-size:1.15rem;color:#2ecc8a;letter-spacing:0.18em;word-break:break-all">${licenseKey}</div>
        </div>

        <div style="text-align:center;margin-bottom:1.5rem">
          <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.85rem 2.5rem;border-radius:2rem;font-weight:600;font-size:0.95rem;text-decoration:none;letter-spacing:0.04em">Open BeSafe &#8594;</a>
        </div>

        <div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.12);border-radius:10px;padding:1.25rem;margin-bottom:1.5rem">
          <p style="color:#9dc4a8;font-size:0.82rem;line-height:1.8;margin:0">
            &#10003; <strong style="color:#f2f8f4">No credit card needed</strong> &#8212; completely free for ${TRIAL_DAYS} days<br>
            &#10003; <strong style="color:#f2f8f4">No obligations</strong> &#8212; cancel anytime, no questions asked<br>
            &#10003; <strong style="color:#f2f8f4">Your data stays yours</strong> &#8212; stored only on your device, never deleted<br>
            &#10003; <strong style="color:#f2f8f4">Plan: ${planLabel}</strong> &#8212; up to ${MAX_DEVICES} devices
          </p>
        </div>

        <div style="border-top:1px solid rgba(46,204,138,0.1);padding-top:1rem">
          <p style="font-size:0.72rem;color:#5a7d67;line-height:1.7;margin:0;text-align:center">
            After ${TRIAL_DAYS} days you can choose to subscribe or continue in read-only mode.<br>
            Your data is <strong>never deleted</strong> &#8212; it always stays on your device.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendReactivationEmail(email, licenseKey, plan) {
  const planLabel = plan === "business" ? "Business" : "Personal";

  await mailer.sendMail({
    from:    `"BeSafe" <${process.env.EMAIL_FROM}>`,
    to:      email,
    subject: "Welcome back to BeSafe ✨",
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
        <div style="text-align:center;margin-bottom:1.5rem">
          <span style="font-size:1.8rem;color:#2ecc8a;font-weight:700">BeSafe</span>
        </div>
        <h1 style="color:#f2f8f4;font-size:1.4rem;text-align:center;margin-bottom:0.5rem">Welcome back!</h1>
        <p style="color:#2ecc8a;text-align:center;margin-bottom:1.5rem;font-weight:500">Your ${planLabel} plan is active again</p>
        <p style="color:#9dc4a8;line-height:1.7;text-align:center">
          Your data was exactly where you left it &#8212; BeSafe never deletes anything.
          All your transactions, categories, and AI conversation history are ready to use.
        </p>
        <div style="text-align:center;margin:1.5rem 0">
          <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.85rem 2.5rem;border-radius:2rem;font-weight:600;text-decoration:none">Open BeSafe &#8594;</a>
        </div>
        <p style="font-size:0.72rem;color:#5a7d67;text-align:center;margin-top:1.5rem">
          License: <code style="color:#2ecc8a">${licenseKey}</code>
        </p>
      </div>
    `,
  });
}

async function sendWelcomeToPaidEmail(email, licenseKey, plan) {
  const planLabel = plan === "business" ? "Business" : "Personal";

  await mailer.sendMail({
    from:    `"BeSafe" <${process.env.EMAIL_FROM}>`,
    to:      email,
    subject: `Welcome to BeSafe ${planLabel} ✨`,
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
        <div style="text-align:center;margin-bottom:1.5rem">
          <span style="font-size:1.8rem;color:#2ecc8a;font-weight:700">BeSafe</span>
        </div>
        <h1 style="color:#f2f8f4;font-size:1.4rem;text-align:center;margin-bottom:0.5rem">Thank you!</h1>
        <p style="color:#2ecc8a;text-align:center;margin-bottom:1.5rem;font-weight:500">Your ${planLabel} plan is active</p>
        <p style="color:#9dc4a8;line-height:1.7;text-align:center">
          You now have full access to the AI assistant, plus everything else that makes BeSafe yours.
        </p>
        <div style="text-align:center;margin:1.5rem 0">
          <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.85rem 2.5rem;border-radius:2rem;font-weight:600;text-decoration:none">Open BeSafe &#8594;</a>
        </div>
        <p style="font-size:0.72rem;color:#5a7d67;text-align:center;margin-top:1.5rem">
          License: <code style="color:#2ecc8a">${licenseKey}</code> &#183; Plan: ${planLabel}
        </p>
      </div>
    `,
  });
}

// ============================================================
// POST /api/register
// ============================================================

app.post("/api/register", async (req, res) => {
  try {
    const { email, plan } = req.body;

    // Validate
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const selectedPlan = ["personal", "business"].includes(plan) ? plan : "personal";

    // Check if email already registered
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      // Instead of error — find their license and resend it
      const { data: existingLicense } = await supabase
        .from("licenses")
        .select("*")
        .eq("user_id", existing.id)
        .single();

      if (existingLicense) {
        // Send friendly reminder email
        try {
          await mailer.sendMail({
            from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
            to: normalizedEmail,
            subject: "Your BeSafe license key — welcome back!",
            html: `
              <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
                <div style="text-align:center;margin-bottom:1.5rem">
                  <span style="font-size:1.8rem;color:#2ecc8a;font-weight:700">BeSafe</span>
                </div>
                <h1 style="color:#f2f8f4;font-size:1.3rem;margin-bottom:1rem;text-align:center">Welcome back!</h1>
                <p style="color:#9dc4a8;line-height:1.7;margin-bottom:1.5rem;text-align:center;font-size:0.9rem">
                  You already have a BeSafe account. Here is your license key:
                </p>
                <div style="background:#080d0b;border:1px solid rgba(46,204,138,0.18);border-radius:12px;padding:1.5rem;text-align:center;margin-bottom:1.5rem">
                  <div style="font-size:0.65rem;color:#9dc4a8;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.6rem">YOUR LICENSE KEY</div>
                  <div style="font-family:'Courier New',monospace;font-size:1.15rem;color:#2ecc8a;letter-spacing:0.18em">${existingLicense.license_key}</div>
                </div>
                <div style="text-align:center;margin-bottom:1.5rem">
                  <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.85rem 2.5rem;border-radius:2rem;font-weight:600;font-size:0.95rem;text-decoration:none">Open BeSafe &#8594;</a>
                </div>
                <p style="font-size:0.72rem;color:#5a7d67;line-height:1.7;text-align:center">
                  Status: <strong style="color:#2ecc8a">${existingLicense.status}</strong> &#183; Plan: <strong style="color:#f2f8f4">${existingLicense.plan || "personal"}</strong>
                </p>
              </div>
            `,
          });
        } catch (e) {
          console.error("[Register] Resend email failed:", e.message);
        }

        console.log(`[Register] Existing user — resent key to ${normalizedEmail}`);
        return res.json({
          success: true,
          license_key: existingLicense.license_key,
          trial_days: TRIAL_DAYS,
          plan: existingLicense.plan || "personal",
          message: "Welcome back! Your license key has been sent to your email.",
        });
      }

      return res.status(409).json({ error: "Account exists but license not found. Please contact support." });
    }

    // Generate license key
    const licenseKey = generateLicenseKey();
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Save user to Supabase — NO Stripe, just free trial
    const { data: userData, error: userError } = await supabase.from("users").insert({
      email: normalizedEmail,
      subscription_plan: selectedPlan,
      subscription_status: "trial",
      trial_ends_at: trialEndsAt,
    }).select("id");

    if (userError) {
      console.error("[Register] User insert failed:", userError);
      return res.status(500).json({ error: "Registration failed. Please try again." });
    }

    const userId = userData?.[0]?.id || null;

    // Save license
    const { error: licError } = await supabase.from("licenses").insert({
      license_key: licenseKey,
      user_id: userId,
      email: normalizedEmail,
      plan: selectedPlan,
      billing: "monthly",
      status: "trial",
      devices_used: 0,
      devices_max: MAX_DEVICES,
    });

    if (licError) {
      console.error("[Register] License insert failed:", licError);
      return res.status(500).json({ error: "License creation failed." });
    }

    // Send welcome email with license key
    try {
      await sendLicenseEmail(normalizedEmail, licenseKey, selectedPlan, "trial");
      console.log(`[Register] Email sent to ${normalizedEmail}`);
    } catch (mailError) {
      console.error("[Register] Email failed:", mailError.message);
    }

    console.log(`[Register] OK | ${normalizedEmail} | ${selectedPlan} | trial | ${licenseKey}`);

    res.json({
      success: true,
      license_key: licenseKey,
      trial_days: TRIAL_DAYS,
      plan: selectedPlan,
    });
  } catch (error) {
    console.error("[Register] Error:", error.message);
    res.status(500).json({ error: "Server error. Please try again." });
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
              <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.75rem 2rem;border-radius:2rem;font-weight:600;font-size:0.9rem;text-decoration:none">Open BeSafe \u2192</a>
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

app.post(
  "/api/verify-license",
  verifyLicenseRateLimitIp,
  verifyLicenseRateLimitKey,
  async (req, res) => {
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

    // Device limit check (using devices table as source of truth)
    const maxDevices = license.devices_max || MAX_DEVICES;
    const nowIso = new Date().toISOString();

    // Check if this fingerprint is already registered for this license
    const { data: existingDevice } = await supabase
      .from("devices")
      .select("id")
      .eq("license_id", license.id)
      .eq("device_fingerprint", device_fingerprint)
      .maybeSingle();

    if (existingDevice) {
      // Known device - just refresh last_seen_at, no count change
      await supabase
        .from("devices")
        .update({ last_seen_at: nowIso })
        .eq("id", existingDevice.id);

      await supabase
        .from("licenses")
        .update({ last_checked_at: nowIso })
        .eq("license_key", license_key);

      const { count: realCount } = await supabase
        .from("devices")
        .select("id", { count: "exact", head: true })
        .eq("license_id", license.id);

      console.log(`[Verify] OK (known) | ${license_key} | device:${device_fingerprint.substring(0, 8)}... | ${license.status}`);

      return res.json({
        status: "active",
        plan: license.plan,
        billing: license.billing,
        devices_used: realCount || 0,
        max_devices: maxDevices,
      });
    }

    // New device - count real devices, enforce limit
    const { count: currentCount } = await supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", license.id);

    const realUsed = currentCount || 0;

    if (realUsed >= maxDevices) {
      return res.json({
        status: "device_limit",
        error: `Pasiektas irenginiu limitas (${maxDevices}).`,
        max_devices: maxDevices,
        current_devices: realUsed,
      });
    }

    // Register new device
    await supabase
      .from("devices")
      .insert({
        license_id: license.id,
        device_fingerprint: device_fingerprint,
        device_name: req.body.device_name || null,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      });

    // Sync devices_used cache with real count
    await supabase
      .from("licenses")
      .update({
        devices_used: realUsed + 1,
        last_checked_at: nowIso,
      })
      .eq("license_key", license_key);

    console.log(`[Verify] OK (new) | ${license_key} | device:${device_fingerprint.substring(0, 8)}... | ${license.status}`);

    res.json({
      status: "active",
      plan: license.plan,
      billing: license.billing,
      devices_used: realUsed + 1,
      max_devices: maxDevices,
    });
  } catch (error) {
    console.error("[Verify] Error:", error.message);
    res.status(500).json({ status: "error", error: "Server error." });
  }
  }
);

// ============================================================
// POST /api/chat — AI assistant (Step 2a: stateless, no system prompt)
// ============================================================

app.post(
  "/api/chat",
  authLicense,    // 1. Validates X-License-Key, populates req.license
  (req, res, next) => {
    // 2. Trial-gate — AI is a paid-plan feature. Trial users see
    //    the license modal flow successfully, the chat panel opens,
    //    and they only hit this 402 when they try to send. The UI
    //    translates `trial_no_ai` into an upgrade CTA.
    if (req.license && req.license.status === "trial") {
      return res.status(402).json({
        error: "trial_no_ai",
        message: "AI asistentas neprieinamas bandomojoje versijoje. Užsisakyk Personal planą.",
        upgrade_required: true,
      });
    }
    next();
  },
  dailyQuota,     // 3. Enforces per-plan daily chat quota
  chatRateLimit,  // 4. Enforces 20/min/license_key burst limit
  chatHandler,    // 5. Calls Anthropic, RPC-increments quota on success
);

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

  if (!event.id) {
    console.warn('[Webhook] Missing event.id — malformed request');
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // ---- Idempotency gate ----
  const { error: dedupErr } = await supabase
    .from('webhook_events')
    .insert({ event_id: event.id, event_type: type });

  if (dedupErr) {
    if (dedupErr.code === '23505') {
      console.log(`[Webhook] Duplicate ${type} (evt=${event.id}) — skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error(`[Webhook] Dedup insert failed for ${event.id}:`, dedupErr.message);
    return res.status(500).send('Dedup check failed');
  }

  try {
    switch (type) {
      // ---- Subscription created or updated ----
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = data.object;
        const customerId = subscription.customer;

        const { data: license } = await supabase
          .from("licenses")
          .select("license_key, status, plan, email, user_id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (license) {
          const prevStatus = license.status;
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

          // On `created` (not `updated`), if we just transitioned into
          // an active subscription, send the right welcome email. Skip
          // on `updated` events because those fire on every renewal /
          // plan change / small Stripe-side tweak — we don't want to
          // spam the user with "welcome" each month.
          if (type === "customer.subscription.created" && newStatus === "active") {
            // Resolve email: prefer license.email (backfilled or set
            // at register), fall back to users.email via user_id.
            let email = license.email;
            if (!email && license.user_id) {
              const { data: u } = await supabase
                .from("users")
                .select("email")
                .eq("id", license.user_id)
                .single();
              email = u?.email;
            }

            if (email) {
              try {
                if (prevStatus === "cancelled") {
                  await sendReactivationEmail(email, license.license_key, license.plan);
                  console.log(`[Webhook] Reactivation email → ${email}`);
                } else if (prevStatus === "trial") {
                  await sendWelcomeToPaidEmail(email, license.license_key, license.plan);
                  console.log(`[Webhook] Welcome-to-paid email → ${email}`);
                }
                // prevStatus === 'active' → no-op (subscription.created
                // firing with status already active; likely webhook replay)
              } catch (e) {
                console.error("[Webhook] Welcome email failed:", e.message);
              }
            } else {
              console.warn(`[Webhook] No email for ${license.license_key} — welcome skipped`);
            }
          }
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

  // Mark event as successfully processed
  await supabase
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', event.id);

  res.json({ received: true });
}

// ============================================================
// TRIAL REMINDER EMAILS
// ============================================================

function buildTrialEmailHtml(heading, subheading, bodyHtml) {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:2rem;background:#0f1812;color:#f2f8f4;border-radius:16px">
      <div style="text-align:center;margin-bottom:1.5rem">
        <span style="font-size:1.8rem;color:#2ecc8a;font-weight:700">BeSafe</span>
      </div>
      <h1 style="color:#f2f8f4;font-size:1.4rem;margin-bottom:0.5rem;text-align:center">${heading}</h1>
      <p style="color:#2ecc8a;font-size:0.95rem;text-align:center;margin-bottom:1.5rem;font-weight:500">${subheading}</p>
      ${bodyHtml}
      <div style="text-align:center;margin:1.5rem 0">
        <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:#2ecc8a;color:#030d07;padding:0.85rem 2.5rem;border-radius:2rem;font-weight:600;font-size:0.95rem;text-decoration:none;letter-spacing:0.04em">Open BeSafe &#8594;</a>
      </div>
      <div style="border-top:1px solid rgba(46,204,138,0.1);padding-top:1rem">
        <p style="font-size:0.72rem;color:#5a7d67;line-height:1.7;margin:0;text-align:center">
          No pressure &#8212; BeSafe is here whenever you need it.<br>
          Your data is <strong>never deleted</strong> and always stays on your device.
        </p>
      </div>
    </div>
  `;
}

const TRIAL_EMAIL_TEMPLATES = {
  day3: {
    subject: "How's your BeSafe experience so far?",
    html: buildTrialEmailHtml(
      "How&#8217;s it going?",
      "You&#8217;ve been with BeSafe for 3 days &#8212; here are some tips",
      `<div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.12);border-radius:10px;padding:1.25rem;margin-bottom:1rem">
        <p style="color:#9dc4a8;font-size:0.88rem;line-height:1.8;margin:0">
          &#128161; <strong style="color:#f2f8f4">Tip 1:</strong> Add your recurring expenses to see monthly patterns at a glance.<br>
          &#128161; <strong style="color:#f2f8f4">Tip 2:</strong> Create custom categories to organize transactions the way <em>you</em> think about money.<br>
          &#128161; <strong style="color:#f2f8f4">Tip 3:</strong> Use the summary view to track income vs. expenses in real time.
        </p>
      </div>
      <p style="color:#9dc4a8;font-size:0.85rem;line-height:1.7;text-align:center">
        You still have <strong style="color:#2ecc8a">11 days</strong> left in your free trial. Take your time and explore!
      </p>`
    ),
  },
  day10: {
    subject: "4 days left \u2014 here\u2019s what you\u2019ve achieved",
    html: buildTrialEmailHtml(
      "Your progress so far",
      "4 days left in your free trial",
      `<p style="color:#9dc4a8;font-size:0.88rem;line-height:1.8;text-align:center;margin-bottom:1rem">
        You&#8217;ve been using BeSafe for 10 days now, and your financial picture is coming together.
        Keep adding transactions to get the full benefit of your insights.
      </p>
      <div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.12);border-radius:10px;padding:1.25rem;margin-bottom:1rem">
        <p style="color:#9dc4a8;font-size:0.85rem;line-height:1.8;margin:0">
          If your trial ends without upgrading, you&#8217;ll switch to <strong style="color:#f2f8f4">read-only mode</strong>:<br>
          &#8226; You can still <strong style="color:#f2f8f4">view all your data</strong><br>
          &#8226; You just won&#8217;t be able to add new entries<br>
          &#8226; Your data is <strong style="color:#2ecc8a">never deleted</strong>
        </p>
      </div>`
    ),
  },
  day13: {
    subject: "Your free trial ends tomorrow",
    html: buildTrialEmailHtml(
      "Last day tomorrow",
      "Your BeSafe trial ends in 1 day",
      `<p style="color:#9dc4a8;font-size:0.88rem;line-height:1.8;text-align:center;margin-bottom:1rem">
        Tomorrow your free trial will end and BeSafe will switch to read-only mode.
        If you&#8217;d like to keep tracking your finances, you can upgrade at any time.
      </p>
      <div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.12);border-radius:10px;padding:1.25rem;margin-bottom:1rem">
        <p style="color:#9dc4a8;font-size:0.85rem;line-height:1.8;margin:0">
          &#10003; <strong style="color:#f2f8f4">Your data stays safe</strong> &#8212; nothing is ever deleted<br>
          &#10003; <strong style="color:#f2f8f4">Upgrade anytime</strong> &#8212; even after the trial ends<br>
          &#10003; <strong style="color:#f2f8f4">No pressure</strong> &#8212; read-only mode is always free
        </p>
      </div>
      <div style="text-align:center;margin-bottom:0.5rem">
        <a href="https://besafe-oga3.onrender.com/app" style="display:inline-block;background:rgba(46,204,138,0.15);color:#2ecc8a;padding:0.65rem 1.8rem;border-radius:2rem;font-weight:600;font-size:0.85rem;text-decoration:none;border:1px solid rgba(46,204,138,0.3)">View upgrade options</a>
      </div>`
    ),
  },
  expired: {
    subject: "Your BeSafe trial has ended",
    html: buildTrialEmailHtml(
      "Your trial has ended",
      "BeSafe is now in read-only mode",
      `<p style="color:#9dc4a8;font-size:0.88rem;line-height:1.8;text-align:center;margin-bottom:1rem">
        Your 14-day free trial is over. BeSafe has switched to <strong style="color:#f2f8f4">read-only mode</strong> &#8212;
        you can still view all your data, but new entries are paused.
      </p>
      <div style="background:rgba(46,204,138,0.06);border:1px solid rgba(46,204,138,0.12);border-radius:10px;padding:1.25rem;margin-bottom:1rem">
        <p style="color:#9dc4a8;font-size:0.85rem;line-height:1.8;margin:0">
          &#10003; <strong style="color:#f2f8f4">Your data is never deleted</strong> &#8212; it stays on your device forever<br>
          &#10003; <strong style="color:#f2f8f4">Upgrade whenever you&#8217;re ready</strong> &#8212; no rush, no deadlines<br>
          &#10003; <strong style="color:#f2f8f4">All your history is preserved</strong> &#8212; pick up right where you left off
        </p>
      </div>
      <p style="color:#5a7d67;font-size:0.8rem;text-align:center">
        We hope BeSafe has been useful. We&#8217;ll be here if you decide to come back.
      </p>`
    ),
  },
};

app.get("/api/check-trials", async (req, res) => {
  try {
    // Fetch all trial users
    const { data: trialUsers, error } = await supabase
      .from("users")
      .select("id, email, trial_ends_at, last_reminder_sent")
      .eq("subscription_status", "trial");

    if (error) {
      console.error("[TrialCheck] Supabase query error:", error.message);
      return res.status(500).json({ error: "Failed to query trial users." });
    }

    if (!trialUsers || trialUsers.length === 0) {
      return res.json({ message: "No trial users found.", processed: 0 });
    }

    const now = Date.now();
    let sent = 0;
    let expired = 0;
    let skipped = 0;

    for (const user of trialUsers) {
      try {
        const trialEnd = new Date(user.trial_ends_at).getTime();
        const daysUsed = Math.floor((now - (trialEnd - TRIAL_DAYS * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000));
        const daysLeft = Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000));

        let milestone = null;
        let template = null;

        if (daysLeft <= 0) {
          milestone = "expired";
          template = TRIAL_EMAIL_TEMPLATES.expired;
        } else if (daysUsed >= 13 && daysLeft <= 1) {
          milestone = "day13";
          template = TRIAL_EMAIL_TEMPLATES.day13;
        } else if (daysUsed >= 10 && daysLeft <= 4) {
          milestone = "day10";
          template = TRIAL_EMAIL_TEMPLATES.day10;
        } else if (daysUsed >= 3 && daysLeft <= 11) {
          milestone = "day3";
          template = TRIAL_EMAIL_TEMPLATES.day3;
        }

        if (!milestone || !template) {
          skipped++;
          continue;
        }

        // Skip if already sent for this milestone
        if (user.last_reminder_sent === milestone) {
          skipped++;
          continue;
        }

        // Send email
        await mailer.sendMail({
          from: `"BeSafe" <${process.env.EMAIL_FROM}>`,
          to: user.email,
          subject: template.subject,
          html: template.html,
        });

        // Update last_reminder_sent (and expire if needed)
        const updateData = { last_reminder_sent: milestone };
        if (milestone === "expired") {
          updateData.subscription_status = "expired";
          expired++;
        }

        await supabase
          .from("users")
          .update(updateData)
          .eq("id", user.id);

        // Also update license status if expired
        if (milestone === "expired") {
          await supabase
            .from("licenses")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("user_id", user.id);
        }

        sent++;
        console.log(`[TrialCheck] Sent "${milestone}" email to ${user.email}`);
      } catch (userError) {
        console.error(`[TrialCheck] Error processing ${user.email}:`, userError.message);
      }
    }

    console.log(`[TrialCheck] Done: ${sent} sent, ${expired} expired, ${skipped} skipped out of ${trialUsers.length} trial users`);
    res.json({ processed: trialUsers.length, sent, expired, skipped });
  } catch (error) {
    console.error("[TrialCheck] Error:", error.message);
    res.status(500).json({ error: "Trial check failed." });
  }
});

// ============================================================
// POST /api/create-checkout — Stripe Checkout for upgrading
// ============================================================

app.post("/api/create-checkout", async (req, res) => {
  try {
    const { email, plan, billing } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const selectedPlan = ["personal", "business"].includes(plan) ? plan : "personal";
    const selectedBilling = ["monthly", "annual"].includes(billing) ? billing : "monthly";

    // Get the correct Stripe price ID
    const priceId = PLANS[selectedPlan]?.[selectedBilling];
    if (!priceId) {
      return res.status(400).json({ error: "Invalid plan or billing period." });
    }

    // Find user in Supabase
    const { data: user } = await supabase
      .from("users")
      .select("id, stripe_customer_id")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      return res.status(404).json({ error: "User not found. Please register first." });
    }

    // Create or retrieve Stripe customer
    // Always verify customer exists in current Stripe mode (test vs live)
    let stripeCustomerId = user.stripe_customer_id;
    let needsNewCustomer = !stripeCustomerId;

    if (stripeCustomerId) {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch {
        // Customer doesn't exist in current mode — create new one
        needsNewCustomer = true;
      }
    }

    if (needsNewCustomer) {
      const customer = await stripe.customers.create({
        email: normalizedEmail,
        metadata: { besafe_user_id: user.id },
      });
      stripeCustomerId = customer.id;

      // Save Stripe customer ID to user record
      await supabase
        .from("users")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);

      // Also save to license record
      await supabase
        .from("licenses")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "https://besafe-oga3.onrender.com/upgrade.html?success=true",
      cancel_url: "https://besafe-oga3.onrender.com/upgrade.html?cancelled=true",
      metadata: {
        besafe_user_id: user.id,
        plan: selectedPlan,
        billing: selectedBilling,
      },
    });

    console.log(`[Checkout] Session created for ${normalizedEmail} | ${selectedPlan}/${selectedBilling}`);

    res.json({ checkout_url: session.url });
  } catch (error) {
    console.error("[Checkout] Error:", error.message, error.type, error.code);
    res.status(500).json({ error: "Checkout failed: " + error.message });
  }
});

// ============================================================
// POST /api/create-portal — Stripe Customer Portal
// ============================================================

app.post("/api/create-portal", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user and their Stripe customer ID
    const { data: user } = await supabase
      .from("users")
      .select("id, stripe_customer_id")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Verify Stripe customer exists in current mode
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.status(400).json({ error: "No active subscription found. Please upgrade first." });
    }

    try {
      await stripe.customers.retrieve(stripeCustomerId);
    } catch {
      return res.status(400).json({ error: "No active subscription in current mode. Please upgrade first." });
    }

    // Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: "https://besafe-oga3.onrender.com/upgrade.html",
    });

    console.log(`[Portal] Session created for ${normalizedEmail}`);

    res.json({ portal_url: portalSession.url });
  } catch (error) {
    console.error("[Portal] Error:", error.message, error.type, error.code);
    res.status(500).json({ error: "Portal failed: " + error.message });
  }
});

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
  ║   POST  /api/login                      ║
  ║   POST  /api/verify-license             ║
  ║   POST  /api/create-checkout            ║
  ║   POST  /api/create-portal              ║
  ║   POST  /api/webhook                    ║
  ║   GET   /api/check-trials               ║
  ║   GET   /api/health                     ║
  ╚══════════════════════════════════════════╝
  `);
});

// Check trials every hour
setInterval(async () => {
  try {
    const res = await fetch('http://127.0.0.1:' + PORT + '/api/check-trials');
    console.log('[Cron] Trial check completed');
  } catch (e) {
    console.error('[Cron] Trial check failed:', e.message);
  }
}, 60 * 60 * 1000);
