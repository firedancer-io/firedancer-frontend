import "@fontsource/inter-tight/latin-400.css";
import "@fontsource/roboto-mono/latin-400.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { router } from "./router";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

function render() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Resolve the initial route matches before rendering (microtasks only:
// "/" has no loader and a statically imported component), so the mount
// commit carries route content instead of a matchless shell pass;
// render regardless if load rejects
void router.load().then(render, render);
