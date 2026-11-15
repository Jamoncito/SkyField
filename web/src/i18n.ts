import english from "../../data/reference/ui.en.json";

export type Language = "en" | "es";
const messages: Record<string, string> = english;
export function locale(): Language {
  try {
    return localStorage.getItem("skyfield-language") === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}
export function changeLanguage(language: Language) {
  if (language === locale()) return;
  try {
    localStorage.setItem("skyfield-language", language);
  } catch {
    /* The current view still works in private storage modes. */
  }
  window.location.reload();
}
const escapePattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(messages)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([key, value]) => {
    const slots: string[] = [];
    const pieces = key.split(/(\{\d+\})/).map((part) => {
      if (/^\{\d+\}$/.test(part)) {
        slots.push(part);
        return "(.+?)";
      }
      return escapePattern(part);
    });
    return { regex: new RegExp("^" + pieces.join("") + "$"), value, slots };
  });
export function tr<T>(value: T): T {
  if (typeof value !== "string" || locale() === "es") return value;
  const normalized = value.replace(/\s+/g, " ").trim();
  let translated = messages[normalized];
  if (translated === undefined) {
    for (const pattern of patterns) {
      const match = normalized.match(pattern.regex);
      if (!match) continue;
      translated = pattern.value.replace(/\{\d+\}/g, (slot) =>
        tr(match[pattern.slots.indexOf(slot) + 1] ?? slot),
      );
      break;
    }
  }
  if (translated === undefined) return value;
  return ((/^\s/.test(value) ? " " : "") +
    translated +
    (/\s$/.test(value) ? " " : "")) as T;
}

/** Translate public labels while preserving names, IDs and producer-entered records. */
export function localize<T>(value: T): T {
  if (locale() === "es") return value;
  function visit(
    item: unknown,
    key = "",
    parent?: Record<string, unknown>,
  ): unknown {
    if (
      ["field_name", "producer", "sample_code", "cultivar", "email"].includes(
        key,
      )
    )
      return item;
    if (key === "name" && !parent?.code && !parent?.crop) return item;
    if (key === "excluded" && item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([name, entry]) => [tr(name), visit(entry)]),
      );
    if (typeof item === "string") return tr(item);
    if (Array.isArray(item)) return item.map((v) => visit(v));
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(record).map(([name, entry]) => [
          name,
          visit(entry, name, record),
        ]),
      );
    }
    return item;
  }
  return visit(value) as T;
}
