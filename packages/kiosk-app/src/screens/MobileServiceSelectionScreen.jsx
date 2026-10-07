import { useState } from "react";
import ServiceSelectScreen from "./ServiceSelectScreen.jsx";
import { supabase } from "../services/supabase.js";

export default function MobileServiceSelectionScreen({ sessionId }) {
  const [state, setState] = useState("selecting");
  const [error, setError] = useState("");

  async function chooseService(serviceType) {
    if (!supabase || state !== "selecting") {
      setError("This selection link is no longer available. Please continue at the kiosk or ask clinic staff for help.");
      return;
    }
    setState("saving");
    setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const { data, error: updateError } = await supabase
        .from("kiosk_sessions")
        .update({ service_selected: serviceType, status: "mobile_service_selected" })
        .eq("id", sessionId)
        .eq("status", "awaiting_service_selection")
        .abortSignal(controller.signal)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error("This service selection link has expired.");
      setState("selected");
    } catch (submitError) {
      setState("selecting");
      setError(controller.signal.aborted
        ? "The kiosk did not respond. Please try your selection again or continue at the kiosk."
        : submitError?.message || "We couldn't send your selection to the kiosk. Please try again.");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (state === "selected") {
    return <main className="mobile-service-confirmation">
      <h1>Service selected</h1>
      <p>Your selection was sent to the kiosk. Return there to continue your check-in.</p>
    </main>;
  }

  return <>
    <ServiceSelectScreen mobileMode onSelect={chooseService} isOnline={navigator.onLine} />
    {state === "saving" && <div className="mobile-service-status" role="status">Sending your choice to the kiosk…</div>}
    {error && <div className="mobile-service-error" role="alert">{error}</div>}
  </>;
}
