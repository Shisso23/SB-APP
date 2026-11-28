import React from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import SignInScreen from "../auth/SignInScreen";
import { BRAND_NAME } from "../../assets/brand";
import { getAdminStatus } from "../../services/admin";
import { useAuth } from "../../services/auth/AuthProvider";
import { subscribeToAuthChanges } from "../../services/auth/firebase";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname, search, hash, state } = location;
  const { user, initialising } = useAuth();
  const account = React.useRef<HTMLDetailsElement>(null);
  const accountToggle = React.useRef<HTMLElement>(null);
  const [navbarOpen, setNavbarOpen] = React.useState(false);
  // Admin navigation is shown only when the SERVER confirms staff access. The
  // check is a convenience for the operator, never an access control: every admin
  // endpoint independently enforces staff permission.
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    // Wait for Firebase's real auth state before checking admin status.
    // On a fresh load/refresh, Firebase rehydrates a persisted session
    // asynchronously; calling getAdminStatus() before that resolves would
    // read `currentUser` as null and fail closed on a genuinely signed-in
    // admin, with no retry since this effect only runs once.
    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!user) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      getAdminStatus()
        .then((response) => {
          if (!cancelled) setIsAdmin(Boolean(response.data?.isAdmin));
        })
        .catch(() => {
          // Not an admin, or the check failed: simply do not offer the link.
          if (!cancelled) setIsAdmin(false);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    const showAccount = location.hash === "#account";
    setNavbarOpen(showAccount);
    if (account.current) account.current.open = showAccount;
    if (!showAccount) return;

    const frame = window.requestAnimationFrame(() => {
      accountToggle.current?.focus();
      accountToggle.current?.scrollIntoView?.({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location]);

  const closeSignIn = () => {
    if (hash === "#account") navigate({ pathname, search }, { replace: true, state });
  };

  React.useEffect(() => {
    if (!hash && ["/", "/access", "/BetAndFixturesScreen"].includes(pathname)) {
      document.documentElement.scrollTop = 0;
    }
  }, [pathname, hash]);

  const links = [
    { to: "/", label: "Home" },
    { to: "/history", label: "Results & Daily Picks" },
    { to: "/BetAndFixturesScreen", label: "Generate Predictions" },
    { to: "/access", label: "Premium Access" },
    ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <nav
      aria-label="Main navigation"
      className="relative z-40 border-b border-slate-700 bg-[#0d1626]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && account.current?.open) {
          account.current.open = false;
          accountToggle.current?.focus();
        }
      }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-5">
          <Link to="/" aria-label={`${BRAND_NAME} home`} className="flex min-h-[44px] items-center rounded text-2xl font-extrabold tracking-tight text-emerald-300">
            {BRAND_NAME}
          </Link>
          <button
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-500 px-3 text-sm font-semibold text-white lg:hidden"
            type="button"
            aria-controls="predictxi-navigation"
            aria-expanded={navbarOpen}
            onClick={() => setNavbarOpen((open) => !open)}
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Menu
          </button>
          <ul id="predictxi-navigation" className={`${navbarOpen ? "flex" : "hidden"} w-full flex-col gap-1 border-t border-slate-700 py-3 lg:flex lg:w-auto lg:flex-row lg:items-center lg:border-0 lg:py-0`}>
            {links.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} end={to === "/"} className={({ isActive }) =>
                  `flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold ${isActive ? "bg-emerald-300/10 text-emerald-200" : "text-slate-200 hover:bg-slate-800 hover:text-white"}`
                }>
                  {label}
                </NavLink>
              </li>
            ))}
            <li className="lg:ml-2">
              <details id="account" ref={account} className="relative">
                <summary ref={accountToggle} className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-slate-500 px-4 text-sm font-semibold text-white marker:content-none hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                  {user || initialising ? "My Account" : "Sign in"}
                  <span aria-hidden="true">⌄</span>
                </summary>
                <div className="mt-2 rounded-xl border border-slate-600 bg-[#152136] p-4 shadow-lg lg:absolute lg:right-0 lg:w-80">
                  <SignInScreen onSignedIn={closeSignIn} />
                </div>
              </details>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
