import { tr } from "./i18n";
import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./style.css";
import "./skyfield.css";
import { App } from "./App";
import { locale } from "./i18n";
document.documentElement.lang = locale();
document.title =
  locale() === "es"
    ? tr("SkyField · Planificación agrícola")
    : "SkyField · Agricultural planning";
class Recovery extends Component<
  {
    children: ReactNode;
  },
  {
    failed: boolean;
  }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="empty app-empty">
          <h1>{tr("La vista necesita volver a abrirse")}</h1>
          <p>
            {tr(
              "Ocurrió un error al cargar la interfaz. Vuelve a abrir el panel para continuar.",
            )}
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            {tr("Volver a cargar")}
          </button>
          <a className="button secondary" href="/">
            {tr("Ir al inicio")}
          </a>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <Recovery>
    <App />
  </Recovery>,
);
