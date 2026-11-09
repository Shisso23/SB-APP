import React from "react";
import { Link } from "react-router-dom";
import SignInScreen from "../auth/SignInScreen";
import { BRAND_NAME, PREDICTXI_LOGO } from "../../assets/brand";
import { getAdminStatus } from "../../services/admin";

/**
 * Top navigation.
 *
 * Uses a LIGHT surface because the master logo has an off-white background
 * (#FDFAF7) and no alpha channel, so it cannot sit on a dark bar without
 * looking like a pasted rectangle.
 */
export default function Navbar() {
  const [navbarOpen, setNavbarOpen] = React.useState(false);
  // Admin navigation is shown only when the SERVER confirms staff access. The
  // check is a convenience for the operator, never an access control: every admin
  // endpoint independently enforces staff permission.
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getAdminStatus()
      .then((response) => {
        if (!cancelled) setIsAdmin(Boolean(response.data?.isAdmin));
      })
      .catch(() => {
        // Signed out, or not an admin: simply do not offer the link.
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const linkBase =
    "text-sm font-medium text-slate-700 transition-colors hover:text-teal-700";

  return (
    <nav className="sticky top-0 left-0 right-0 z-20 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between px-4 py-2.5 sm:px-6">
        <div className="relative flex w-full items-center justify-between lg:static lg:block lg:w-auto lg:justify-start">
          <Link
            to="/"
            className="flex items-center gap-2.5"
            aria-label={`${BRAND_NAME} home`}
          >
            <img
              src={PREDICTXI_LOGO}
              alt={`${BRAND_NAME} logo`}
              className="h-16 w-auto sm:h-20"
            />
          </Link>

          <button
            className="block rounded-md border border-slate-300 p-2 text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 lg:hidden"
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={navbarOpen}
            onClick={() => setNavbarOpen(!navbarOpen)}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>

        <div
          className={
            "flex-grow items-center lg:flex" + (navbarOpen ? " flex" : " hidden")
          }
        >
          <ul className="ml-auto flex list-none flex-col items-start gap-1 pt-3 lg:flex-row lg:items-center lg:gap-6 lg:pt-0">
            <li className="nav-item flex items-center">
              <Link to="/BetAndFixturesScreen" className={linkBase}>
                Predictions
              </Link>
            </li>
            <li className="nav-item flex items-center">
              <Link to="/history" className={linkBase}>
                History
              </Link>
            </li>
            <li className="nav-item flex items-center">
              <Link to="/access" className={linkBase}>
                Premium
              </Link>
            </li>
            {isAdmin ? (
              <li className="nav-item flex items-center">
                <Link
                  to="/admin"
                  className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100"
                >
                  Admin
                </Link>
              </li>
            ) : null}            <li className="nav-item flex items-center pt-2 lg:pt-0">
              <SignInScreen />
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
