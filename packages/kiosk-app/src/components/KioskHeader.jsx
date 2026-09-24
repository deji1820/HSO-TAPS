import { useEffect, useState } from "react";
import "../styles/components/KioskHeader.css";

// Matches PDF header: NU crest, "NU FAIRVIEW / Health Services Office",
// live clock + date on the right, and a green/red status dot.
export default function KioskHeader({ isOnline = true }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-US", { hour12: true });
  const date = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
  });

  return (
    <header className="kiosk-header">
      <div className="kiosk-header-brand">
        <span className="kiosk-header-crest-frame">
          <img className="kiosk-header-crest" src="/nu-fairview-crest.png" alt="NU Fairview crest" />
        </span>
        <div>
          <div className="kiosk-header-title">NU FAIRVIEW</div>
          <div className="kiosk-header-subtitle">Health Services Office</div>
        </div>
      </div>

      <div className="kiosk-header-status">
        <span className="kiosk-header-time">{time}</span>
        <span className="kiosk-header-divider" />
        <span className="kiosk-header-date">{date}</span>
        <span className={"kiosk-header-dot" + (isOnline ? "" : " offline")} />
      </div>
    </header>
  );
}
