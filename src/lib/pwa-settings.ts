// Local PWA + app preferences. Stored in localStorage.
export type UpdateMode = "toast" | "auto" | "off";

export interface PWASettings {
  updateMode: UpdateMode;
  showInstallPrompt: boolean;
  transcriptionLanguage: string; // '' means auto-detect
}

const KEY = "vj_pwa_settings";
const DEFAULTS: PWASettings = {
  updateMode: "toast",
  showInstallPrompt: true,
  transcriptionLanguage: "",
};

const EVT = "vj-pwa-settings-changed";

export function getSettings(): PWASettings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PWASettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function setSettings(patch: Partial<PWASettings>): PWASettings {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<PWASettings>(EVT, { detail: next }));
  return next;
}

export function onSettingsChange(cb: (s: PWASettings) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<PWASettings>).detail);
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}

// Common Whisper/GPT-4o transcribe languages (ISO-639-1).
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "ur", label: "Urdu" },
  { code: "fa", label: "Persian" },
  { code: "he", label: "Hebrew" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "sw", label: "Swahili" },
  { code: "yo", label: "Yoruba" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
  { code: "am", label: "Amharic" },
  { code: "zu", label: "Zulu" },
  { code: "af", label: "Afrikaans" },
];
