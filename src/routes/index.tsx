import { createFileRoute } from "@tanstack/react-router";
import { VoiceJournal } from "@/components/VoiceJournal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DearMe — Private voice journal" },
      {
        name: "description",
        content:
          "DearMe is a private, on-device voice journal. Record, replay, and reflect — your entries never leave your device.",
      },
      { property: "og:title", content: "DearMe — Private voice journal" },
      {
        property: "og:description",
        content: "A private, on-device voice journal. Record, replay, and reflect.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoiceJournal,
});
