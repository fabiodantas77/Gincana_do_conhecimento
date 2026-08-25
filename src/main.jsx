import React from "react";
import { createRoot } from "react-dom/client";
import App from "../app.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Falha ao iniciar a aplicação:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
          <section className="max-w-lg rounded-xl border border-red-500/30 bg-slate-900 p-6 space-y-3">
            <h1 className="text-xl font-bold text-red-300">Não foi possível iniciar o painel</h1>
            <p className="text-sm text-slate-300">Atualize a página. Se o problema continuar, envie esta mensagem ao administrador:</p>
            <code className="block break-words rounded bg-black/30 p-3 text-xs text-red-200">{this.state.error.message}</code>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
