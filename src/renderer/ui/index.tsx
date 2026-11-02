import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../contracts/index.js";
import { getState, subscribe } from "../kernel/index.js";

function App() {
  const [state, setState] = useState<AppState>(getState());

  useEffect(() => subscribe(() => setState(getState())), []);

  return (
    <main className="shell">
      <h1>afeifei</h1>
      <p className="hint">M0 空壳 · store 已通</p>
      <pre className="state">{JSON.stringify(state, null, 2)}</pre>
    </main>
  );
}

const host = document.getElementById("root");
if (host) createRoot(host).render(<App />);
