import React from "react";
import RootRouter from "./navigation/root.router";
import { AuthProvider } from "./services/auth/AuthProvider";

function App () {
  return (
    // eslint-disable-next-line react/react-in-jsx-scope
    <AuthProvider>
      <RootRouter/>
    </AuthProvider>
  );
}

export default App;
