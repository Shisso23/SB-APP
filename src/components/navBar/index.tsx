import React from "react";
import { useNavigate, Link } from "react-router-dom";

export default function Navbar({ fixed }) {
  const [navbarOpen, setNavbarOpen] = React.useState(false);
  const navigate = useNavigate();

  const navigateToImagesForm = () => {
  };
  return (
    <>
      <nav className=" flex justify-between py-1 mb-12 fixed w-full shadow-md bg-gray-900">
        <div className="container px-4 mx-auto flex flex-wrap items-center justify-between">
          <div className="w-full relative flex justify-between lg:w-auto lg:static lg:block lg:justify-start">
            <Link to="/" className="text-lg grow:1 font-bold leading-relaxed inline-block mr-4 py-2 whitespace-nowrap uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-teal-500">
              PREDICTZ
            </Link>
            <button
              className="text-white cursor-pointer text-base leading-none px-3 py-1 border border-solid border-transparent rounded bg-gradient-to-r from-cyan-500 to-teal-500 block lg:hidden outline-none focus:outline-none"
              type="button"
              onClick={() => setNavbarOpen(!navbarOpen)}
            >
              <i className="fas fa-bars"></i>
            </button>
          </div>
          <div
            className={
              "lg:flex flex-grow items-center" +
              (navbarOpen ? " flex" : " hidden")
            }
            id="example-navbar-danger"
          >
            <ul className="flex flex-col lg:flex-row list-none lg:ml-auto">
              <li className="nav-item">
                <span className="px-3 py-2 flex items-center text-base uppercase font-bold leading-snug text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-teal-500 hover:opacity-75">
                  <i className="fab fa-facebook-square text-lg leading-base text-white opacity-75"></i>
                  <span className="ml-2 cursor-pointer">LOGIN</span>
                </span>
              </li>
              <li className="nav-item">
                <span className="px-3 py-2 flex items-center text-base uppercase font-bold leading-snug text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-teal-500 hover:opacity-75 cursor-pointer">
                  <i className="fab fa-twitter text-base leading-lg text-white opacity-75"></i>
                  <span className="ml-2" onClick={navigateToImagesForm}>
                    SIGNUP
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </>
  );
}
