import { createElement, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { palettes } from "../theme/palette";

/**
 * Galaxy S26 viewport in CSS px (1080 x 2340 at density 3, 19.5:9). On a desktop browser the app runs
 * inside an iframe of exactly this size, so window dimensions, modals and sheets behave as on the phone.
 */
export const PHONE_VIEWPORT = { width: 360, height: 780 } as const;

const MARGIN = 24;
const BORDER = 1;

/**
 * True on web when this page should host the app in a phone-sized frame instead of running it:
 * top-level window, wider than a phone, and not opted out with `?frame=0` (Playwright scripts that drive
 * the page directly).
 */
export function shouldHostPhoneFrame(): boolean {
  if (process.env.EXPO_OS !== "web" || typeof window === "undefined") return false;
  if (window.self !== window.top) return false;
  if (new URLSearchParams(window.location.search).get("frame") === "0") return false;
  return window.innerWidth > PHONE_VIEWPORT.width * 1.6;
}

function fitScale(): number {
  return Math.min(
    (window.innerHeight - MARGIN * 2) / PHONE_VIEWPORT.height,
    (window.innerWidth - MARGIN * 2) / PHONE_VIEWPORT.width,
  );
}

/** Hosts the app in an S26-shaped iframe, scaled to fit the browser window; keeps the address bar in sync. */
export function PhoneFrame() {
  const [scale, setScale] = useState(fitScale);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [src] = useState(() => window.location.pathname + window.location.search + window.location.hash);

  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener("resize", onResize);
    // Mirror the app's route in the address bar, so a reload reopens the same screen.
    const sync = window.setInterval(() => {
      try {
        const inner = frame.current?.contentWindow?.location;
        if (!inner) return;
        const path = inner.pathname + inner.search + inner.hash;
        if (path !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState(null, "", path);
        }
        if (frame.current?.contentDocument?.title) document.title = frame.current.contentDocument.title;
      } catch {
        // Not readable yet (navigation in progress).
      }
    }, 500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(sync);
    };
  }, []);

  const background = palettes.dark.mediaBackdrop;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: background, overflow: "hidden" }}>
      <View
        style={{
          // Border outside the viewport, so the app window is exactly the S26 size.
          width: PHONE_VIEWPORT.width + BORDER * 2,
          height: PHONE_VIEWPORT.height + BORDER * 2,
          transform: [{ scale }],
          borderRadius: 4,
          borderWidth: BORDER,
          borderColor: palettes.dark.border,
          overflow: "hidden",
        }}
      >
        {createElement("iframe", {
          ref: frame,
          src,
          title: "TrackItBetter",
          allow: "camera; microphone; clipboard-write",
          style: { width: "100%", height: "100%", border: 0, display: "block" },
        })}
      </View>
    </View>
  );
}
