import React from "react";
import { useNavigate } from "react-router-dom";

export default function Navbar({ fixed }) {
  const [navbarOpen, setNavbarOpen] = React.useState(false);
  const navigate = useNavigate();

  const navigateToImagesForm = () => {
  };
  return (
    <>
      <nav className=" flex flex-wrap items-center justify-between px-2 py-3 bg-blue-400 mb-60 fixed w-full">
        <div className="container px-4 mx-auto flex flex-wrap items-center justify-between">
          <div className="w-full relative flex justify-between lg:w-auto lg:static lg:block lg:justify-start">
            <span className="text-sm font-bold leading-relaxed inline-block mr-4 py-2 whitespace-nowrap uppercase text-black">
              PREDICTZ
            </span>
            <button
              className="text-black cursor-pointer text-xl leading-none px-3 py-1 border border-solid border-transparent rounded bg-transparent block lg:hidden outline-none focus:outline-none"
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
                <span className="px-3 py-2 flex items-center text-xs uppercase font-bold leading-snug text-black hover:opacity-75">
                  <i className="fab fa-facebook-square text-lg leading-lg text-white opacity-75"></i>
                  <span className="ml-2">BET</span>
                </span>
              </li>
              <li className="nav-item">
                <span className="px-3 py-2 flex items-center text-xs uppercase font-bold leading-snug text-black hover:opacity-75">
                  <i className="fab fa-twitter text-lg leading-lg text-white opacity-75"></i>
                  <span className="ml-2" onClick={navigateToImagesForm}>
                    LIVE
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
