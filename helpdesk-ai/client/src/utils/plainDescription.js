// Legacy module descriptions may contain formatting; display them as text only.
export function plainDescription(value) {
  return String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "");
}
