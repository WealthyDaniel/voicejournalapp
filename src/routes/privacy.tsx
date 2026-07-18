import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Voice Journal" },
      {
        name: "description",
        content:
          "Voice Journal keeps every recording on your device. No accounts, no cloud, no database.",
      },
      { property: "og:title", content: "Privacy Policy — Voice Journal" },
      {
        property: "og:description",
        content:
          "Voice Journal keeps every recording on your device. No accounts, no cloud, no database.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span> Back to journal
        </Link>

        <h1 className="mt-6 font-serif text-3xl font-medium tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated: July 18, 2026
        </p>

        <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-foreground/90">
          <p>
            Voice Journal is built to be private by default. Your recordings are
            safe — every voice note you make is saved{" "}
            <span className="font-medium">only on this device</span>, just like the
            built-in recorder on your phone.
          </p>

          <h2 className="font-serif text-xl font-medium">What we store</h2>
          <p>
            All audio, titles, and transcripts are stored locally in your
            browser's on-device storage (IndexedDB). There is{" "}
            <span className="font-medium">no account, no cloud, and no database</span>{" "}
            on our side. We don't upload, back up, sync, or read your journals.
            They live with you, and only you.
          </p>

          <h2 className="font-serif text-xl font-medium">Transcription</h2>
          <p>
            Transcription is optional. When — and only when — you tap the
            transcribe button on a recording, that single audio file is sent to
            the Lovable AI transcription service to be converted to text. The
            resulting text is stored back on your device. Nothing else is sent,
            and nothing is retained by us after the response returns.
          </p>

          <h2 className="font-serif text-xl font-medium">No tracking</h2>
          <p>
            We don't use analytics, ad networks, or third-party trackers inside
            the app. No cookies are set for tracking purposes.
          </p>

          <h2 className="font-serif text-xl font-medium">Your data, your device</h2>
          <p>
            Because your recordings live only on your device, clearing your
            browser data, resetting the app, or uninstalling it will permanently
            erase them. There is no copy elsewhere. If you want to keep an entry
            long-term, export it or back it up yourself.
          </p>

          <h2 className="font-serif text-xl font-medium">Permissions</h2>
          <p>
            The app asks for microphone access only when you start a recording,
            and only uses it while you're actively recording.
          </p>

          <h2 className="font-serif text-xl font-medium">Changes</h2>
          <p>
            If this policy ever changes, the "Last updated" date above will
            reflect it. Since we don't have your contact info, please check back
            here from time to time.
          </p>
        </div>

        <div className="mt-10">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Back to journal
          </Link>
        </div>
      </div>
    </div>
  );
}
