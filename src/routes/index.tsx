import { createFileRoute } from "@tanstack/react-router";
import { VoiceJournal } from "@/components/VoiceJournal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Journal — Private, on-device recordings" },
      {
        name: "description",
        content:
          "Record and replay voice journal entries stored entirely on your device. No accounts, no cloud.",
      },
      { property: "og:title", content: "Voice Journal — Private, on-device recordings" },
      {
        property: "og:description",
        content: "Record and replay voice journal entries stored entirely on your device. No accounts, no cloud.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoiceJournal,
});
