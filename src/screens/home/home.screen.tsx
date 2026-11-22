import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BRAND_NAME, BRAND_TAGLINE, PREDICTXI_LOGO } from "../../assets/brand";

/**
 * Marketing home page.
 *
 * DESIGN CONSTRAINT: the master logo has an off-white background (#FDFAF7) and
 * no alpha channel, so this page is built on light surfaces.
 *
 * TONE CONSTRAINT: PredictXI sells *analysis*. `AccessPassesScreen` states that
 * predictions "are not a bet or a guarantee of results", so this page must not
 * promise winnings, imply certainty, or read like a betting slip. Copy states
 * what the model does and, explicitly, what it does not.
 */

type Capability = {
  title: string;
  body: string;
  icon: React.ReactNode;
};

const StrokeIcon: React.FC<{ d: string }> = ({ d }) => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

const capabilities: Capability[] = [
  {
    title: "Form-aware modelling",
    body:
      "Recent results, venue splits and goals scored and conceded feed a Poisson-based model instead of a single hot streak.",
    icon: <StrokeIcon d="M3 17l5-5 4 3 5-7 4 4" />,
  },
  {
    title: "Season context applied",
    body:
      "Standings are matched to the correct league and season, so team strength is judged against the right table, never the wrong year.",
    icon: <StrokeIcon d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    title: "Uncertainty made visible",
    body:
      "Every market carries a sample size and a confidence band. Where the data is thin, the model abstains rather than guessing.",
    icon: <StrokeIcon d="M12 8v4m0 4h.01M12 3l9 16H3L12 3z" />,
  },
  {
    title: "Your shortlist, your leagues",
    body:
      "Pick the competitions you care about and see only the fixtures and markets already forecast and published.",
    icon: <StrokeIcon d="M4 6h16M7 12h10M10 18h4" />,
  },
];

const steps = [
  {
    n: "01",
    title: "Our team generates the forecasts",
    body:
      "Every morning, before the earliest kickoff, forecasts are generated for the leagues we cover and stored as a permanent record.",
  },
  {
    n: "02",
    title: "You browse them by league",
    body:
      "Open any covered competition and see the model's lean, the supporting form, and how much data sits behind it.",
  },
  {
    n: "03",
    title: "Decide for yourself",
    body:
      "PredictXI does not place bets or hold a balance. The judgement stays with you.",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
};

/**
 * What sets PredictXI apart. Written as verifiable product facts, not
 * superlatives - each line maps to something the app actually does.
 */
const differentiators = [
  {
    title: "It shows its reasoning",
    body:
      "Most tools hand you a number. PredictXI shows the form, the standings and the sample size behind it, so you can judge the assessment instead of trusting it blind.",
  },
  {
    title: "It admits when it doesn't know",
    body:
      "Thin data produces an abstention, not a confident-sounding guess. Markets that fail the quality gate are withheld.",
  },
  {
    title: "Season-correct by construction",
    body:
      "Team strength is judged against the standings for the right league and the right season. A stale table never silently skews the output.",
  },
  {
    title: "Analysis, not a betting slip",
    body:
      "We take no stake and hold no balance. There is no incentive here for you to bet more, and no 'guaranteed' pick to sell you.",
  },
];

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const goToPredictions = () => navigate("/BetAndFixturesScreen", {});

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(60rem 30rem at 85% -10%, rgba(20,184,166,0.14), transparent 60%), radial-gradient(50rem 26rem at -10% 10%, rgba(99,102,241,0.12), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-800">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              {BRAND_TAGLINE}
            </span>

            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              Football analysis that shows
              <span className="bg-gradient-to-r from-teal-600 to-indigo-600 bg-clip-text text-transparent">
                {" "}
                its working
              </span>
              .
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              {BRAND_NAME} turns fixtures, form and standings into structured
              assessments of each market, with the sample size and confidence
              behind every number shown alongside it.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={goToPredictions}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/40 focus:ring-offset-2"
              >
                See today’s predictions
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </motion.button>
              <a
                href="#membership"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:ring-offset-2"
              >
                Compare membership
              </a>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-slate-200 pt-6">
              {[
                { k: "Markets assessed", v: "Goals, results, both teams" },
                { k: "Data basis", v: "Form + standings" },
                { k: "Bets placed", v: "None" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {s.k}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">
                    {s.v}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Logo card — a light surface is required by the asset's background */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative"
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
              <img
                src={PREDICTXI_LOGO}
                alt={`${BRAND_NAME} — ${BRAND_TAGLINE}`}
                className="mx-auto w-full max-w-md"
              />
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-100 pt-6 text-center">
                {["Form", "Standings", "Confidence"].map((t) => (
                  <div
                    key={t}
                    className="rounded-lg bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-600"
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Start here — the single most important call to action on the page */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="start"
        className="scroll-mt-24 border-b border-slate-200 bg-slate-900"
      >
        <div className="mx-auto max-w-7xl px-6 py-12 lg:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_auto]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-teal-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                Start here
              </span>
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                View today’s predictions — no account needed
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                Forecasts are generated for you each morning, before the earliest
                kickoff, and stored as a permanent record. Open the Prediction Desk,
                pick a competition, and read them straight away.
              </p>

              {/* Explicit steps, matched to what a visitor actually does */}
              <ol className="mt-6 grid gap-4 sm:grid-cols-3">
                {[
                  { n: "1", t: "Open the desk", b: "No sign-up needed to look around." },
                  { n: "2", t: "Pick a competition", b: "Choose from the leagues we cover." },
                  { n: "3", t: "Read the forecast", b: "Probability, reasoning and sample size." },
                ].map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500 text-xs font-bold text-white">
                      {s.n}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-white">
                        {s.t}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {s.b}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col items-stretch gap-3 lg:min-w-[16rem]">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={goToPredictions}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 px-7 py-4 text-base font-bold text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                Open the Prediction Desk
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </motion.button>
              <a
                href="#membership"
                className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-7 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                What does membership cost?
              </a>
              <Link
                to="/history"
                className="text-center text-xs font-medium text-slate-400 underline underline-offset-4 transition hover:text-slate-200"
              >
                See our public prediction record
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            What goes into an assessment
          </h2>
          <p className="mt-3 text-slate-600">
            Four inputs, stated plainly. If any of them is weak, the output says
            so rather than papering over it.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((c, i) => (
            <motion.div
              key={c.title}
              {...fadeUp}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                {c.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {c.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why PredictXI — differentiation */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
              Why PredictXI
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Built to be checked, not just believed
            </h2>
            <p className="mt-3 text-slate-600">
              Anyone can print a prediction. The difference is whether you can
              interrogate it — and whether the tool tells you when it simply
              does not have enough to go on.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {differentiators.map((d, i) => (
              <motion.div
                key={d.title}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                  ✓
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {d.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {d.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Membership — presented early so the offer is clear up front */}
      <section id="membership" className="scroll-mt-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
              Membership
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Free to explore. Premium when you want the full picture.
            </h2>
            <p className="mt-3 text-slate-600">
              PredictXI has two levels. You can browse fixtures and run basic
              checks for free, and unlock the complete model output with a
              time-limited access pass.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {/* Free */}
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.45 }}
              className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
            >
              <h3 className="text-lg font-bold text-slate-900">Free</h3>
              <p className="mt-1 text-sm text-slate-600">
                No account charge, no card required to look around.
              </p>
              <p className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">
                R0
                <span className="ml-1 text-sm font-medium text-slate-500">
                  forever
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  "Browse fixtures and leagues",
                  "Fixture and form browsing",
                  "See which markets are available",
                  "No payment details needed",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span className="mt-0.5 text-teal-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={goToPredictions}
                className="mt-7 w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Start browsing
              </button>
            </motion.div>

            {/* Premium */}
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="relative rounded-2xl border-2 border-teal-500 bg-white p-7 shadow-lg"
            >
              <span className="absolute -top-3 left-7 rounded-full bg-teal-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                Full access
              </span>
              <h3 className="text-lg font-bold text-slate-900">Premium</h3>
              <p className="mt-1 text-sm text-slate-600">
                Unlock every market, the confidence bands, and the reasoning
                behind each assessment.
              </p>
              <p className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">
                Passes
                <span className="ml-1 text-sm font-medium text-slate-500">
                  from R5
                </span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  "All premium predictions and markets",
                  "Confidence bands and sample sizes",
                  "Full reasoning behind each assessment",
                  "Time-limited — ends automatically, no auto-renewal",
                ].map((f) => (
                  <li key={f} className="flex gap-3">
                    <span className="mt-0.5 text-teal-600">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/access"
                className="mt-7 flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                View passes
              </Link>
            </motion.div>
          </div>

          {/* Plain-language explanation of how membership actually works */}
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-7">
            <h3 className="text-base font-bold text-slate-900">
              How membership works, in plain terms
            </h3>            <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  t: "Create an account",
                  b: "Sign in with your email. Free access starts immediately.",
                },
                {
                  t: "Choose a pass",
                  b: "Pick a duration that suits you — a week, a month, or longer.",
                },
                {
                  t: "Pay securely",
                  b: "Checkout is handled by PayFast. We never see or store your card details.",
                },
                {
                  t: "Access unlocks",
                  b: "Premium turns on the moment payment is confirmed, and switches off when the pass ends.",
                },
              ].map((s, i) => (
                <li key={s.t}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {s.t}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {s.b}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
              <strong className="font-semibold text-slate-700">
                No auto-renewal.
              </strong>{" "}
              A pass simply expires at the end of its term. Nothing is charged
              again unless you choose to buy another one. Buying a second pass
              while one is active extends your access rather than replacing it.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              Not ready to subscribe?{" "}
              <Link to="/history" className="font-semibold text-teal-700 underline underline-offset-4">
                Our full prediction record is public
              </Link>{" "}
              — every published list, including the ones that lost.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              How these forecasts are made
            </h2>
            <p className="mt-3 text-slate-600">
              Generated for you each morning — then frozen. Three steps, and the
              last one is yours.
            </p>
          </div>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <motion.li
                key={s.n}
                {...fadeUp}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="relative rounded-2xl border border-slate-200 bg-slate-50/60 p-6"
              >
                <span className="text-xs font-bold tracking-widest text-teal-700">
                  {s.n}
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {s.body}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Honest-limits callout */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="grid gap-8 rounded-3xl border border-amber-200 bg-amber-50/70 p-8 lg:grid-cols-[1fr_auto] lg:items-center lg:p-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-amber-900 sm:text-2xl">
              What {BRAND_NAME} is not
            </h2>
            <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-amber-900/90 sm:grid-cols-2">
              <li>• Not a bookmaker — we never accept or hold a stake.</li>
              <li>• Not a tipping service — no “guaranteed” picks.</li>
              <li>• Not a profit promise — models can be wrong.</li>
              <li>• Not financial advice — decisions remain yours.</li>
            </ul>
            <p className="mt-4 max-w-2xl text-sm text-amber-900/80">
              Football is unpredictable. Assessments describe probability, not
              certainty, and should never be treated as a guarantee of any
              outcome.
            </p>
          </div>
          <Link
            to="/access"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            View access passes
          </Link>
        </div>
      </section>

      {/* Closing call to action — the page should end by telling people where to go */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center lg:py-20">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Ready to see today’s forecasts?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Open the Prediction Desk and pick a competition. Everything you see
            has already been generated and published — nothing is calculated
            while you browse.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={goToPredictions}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-7 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/40 focus:ring-offset-2"
            >
              Open the Prediction Desk
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </motion.button>
            <Link
              to="/access"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              See premium access
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <img
              src={PREDICTXI_LOGO}
              alt=""
              aria-hidden="true"
              className="h-8 w-auto"
            />
            <span className="text-sm text-slate-500">
              © {new Date().getFullYear()} {BRAND_NAME}
              <span className="hidden sm:inline"> · {BRAND_TAGLINE}</span>
            </span>
          </div>
          <p className="max-w-md text-center text-xs leading-relaxed text-slate-500 sm:text-right">
            For adults 18+. Analysis only — no betting facilities are provided.
            If gambling affects you or someone you know, seek local support.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomeScreen;
