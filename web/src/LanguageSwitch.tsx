import { Languages } from "lucide-react";
import { changeLanguage, locale } from "./i18n";

export function LanguageSwitch() {
  return (
    <div
      className="language-switch"
      role="group"
      aria-label="Language / Idioma"
    >
      <Languages size={17} />
      <button
        type="button"
        lang="en"
        aria-pressed={locale() === "en"}
        onClick={() => changeLanguage("en")}
      >
        English
      </button>
      <button
        type="button"
        lang="es"
        aria-pressed={locale() === "es"}
        onClick={() => changeLanguage("es")}
      >
        Español
      </button>
    </div>
  );
}
