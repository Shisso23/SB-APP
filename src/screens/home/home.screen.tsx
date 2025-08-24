import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  useEffect(() => {
    const updateWindowDimensions = () => {
      setWindowHeight(window.innerHeight);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", updateWindowDimensions);
    return () => {
      window.removeEventListener("resize", updateWindowDimensions);
    };
  }, []);

  const handleBetClick = () => navigate("/BetAndFixturesScreen", {});

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      {/* Animated gradient blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          initial={{ opacity: 0.4, scale: 0.9 }}
          animate={{ opacity: 0.7, scale: 1 }}
          transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
          className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-gradient-to-tr from-teal-500/50 via-cyan-400/40 to-indigo-500/40 blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0.3, scale: 0.9 }}
          animate={{ opacity: 0.6, scale: 1 }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            repeatType: "reverse",
          }}
          className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-purple-500/40 via-fuchsia-400/30 to-rose-500/30 blur-3xl"
        />
      </div>

      <header className="mx-auto max-w-7xl px-6 pt-10 sm:pt-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg" />
            <span className="text-lg font-semibold tracking-tight">
              BetSmart
            </span>
          </div>
          <button
            onClick={handleBetClick}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/20"
          >
            Go to Bets
          </button>
        </div>
      </header>
      <main className="mx-auto grid min-h-[70vh] max-w-7xl place-items-center px-6 py-16">
        <div className="text-center">
          <motion.h1
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="bg-gradient-to-r from-teal-300 via-cyan-300 to-indigo-300 bg-clip-text text-3xl font-extrabold text-transparent sm:text-5xl"
          >
            Score big with AI‑powered soccer predictions
          </motion.h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-300 sm:text-base">
            Clean odds. Smart picks. Beautifully simple. Jump in and choose your
            leagues.
          </p>

          <motion.button
            whileTap={{ scale: 0.98 }}
            whileHover={{ scale: 1.02 }}
            onClick={handleBetClick}
            className="mx-auto mt-8 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-8 py-3 text-base font-semibold shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
          >
            START
          </motion.button>

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { title: "Live Form", desc: "Recent results baked in" },
              { title: "Standings Aware", desc: "Season context applied" },
              { title: "Your Shortlist", desc: "Focus on your leagues" },
            ].map((f, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm"
              >
                <div className="text-sm font-semibold text-white">
                  {f.title}
                </div>
                <div className="mt-1 text-xs text-gray-300">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-10 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} BetSmart
      </footer>
    </div>
  );
};

export default HomeScreen;
