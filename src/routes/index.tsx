import { createFileRoute } from "@tanstack/react-router";
import { VoiceJournal } from "@/components/VoiceJournal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Journal — Private on-device recordings" },
      {
        name: "description",
        content:
          "A private voice journal. Record, replay, transcribe and edit — everything stays on your device.",
      },
      { property: "og:title", content: "Voice Journal" },
      {
        property: "og:description",
        content: "Private voice journaling that stays on your device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoiceJournal,
});
