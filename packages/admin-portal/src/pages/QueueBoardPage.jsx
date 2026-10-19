import { useEffect, useState } from "react";
import { getQueueBoard } from "../services/api.js";
import UiScaleControl from "../components/UiScaleControl.jsx";
import "../styles/pages/QueueBoard.css";

export default function QueueBoardPage() {
  const [board, setBoard] = useState({ serving: [], waiting: [] });
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let mounted = true;
    let loading = false;
    const refresh = async () => {
      if (loading) return;
      loading = true;
      try {
        const next = await getQueueBoard();
        if (mounted) {
          setBoard(next);
          setError(false);
          setUpdatedAt(new Date());
        }
      } catch {
        if (mounted) setError(true);
      } finally {
        loading = false;
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* Fullscreen may be unavailable in an embedded browser. */ }
  }

  return <main className="queue-board">
    <header className="queue-board-header">
      <div className="queue-board-brand"><span className="queue-board-mark">NU</span><div><strong>NU FAIRVIEW</strong><small>Health Services Office</small></div></div>
      <div className="queue-board-live"><UiScaleControl /><span className={"queue-board-live-dot" + (error ? " queue-board-live-dot--error" : "")} />{error ? "Reconnecting" : "Live queue"}</div>
    </header>
    <section className="queue-board-intro">
      <p>HEALTH SERVICES OFFICE</p>
      <h1>Clinic Queue</h1>
      <span>Please listen for your number. When it appears under <b>Now Serving</b>, proceed to the clinic desk.</span>
    </section>
    <div className="queue-board-columns">
      <section className="queue-board-panel queue-board-serving">
        <header><div><span className="queue-board-kicker">PLEASE PROCEED</span><h2>Now Serving</h2></div><span className="queue-board-count">{board.serving.length}</span></header>
        {board.serving.length ? <div className="queue-board-tickets">{board.serving.map((ticket, index) => <article className="queue-board-ticket queue-board-ticket--serving" key={`${ticket.queueNumber}-${index}`}><strong>{ticket.queueNumber || "—"}</strong><span>{ticket.status === "in_session" ? "At the clinic" : "Proceed to desk"}</span></article>)}</div> : <p className="queue-board-empty">No numbers are being called right now.</p>}
      </section>
      <section className="queue-board-panel queue-board-waiting">
        <header><div><span className="queue-board-kicker">PLEASE WAIT</span><h2>Up Next</h2></div><span className="queue-board-count">{board.waiting.length}</span></header>
        {board.waiting.length ? <div className="queue-board-tickets">{board.waiting.slice(0, 12).map((ticket, index) => <article className="queue-board-ticket" key={`${ticket.queueNumber}-${index}`}><strong>{ticket.queueNumber || "—"}</strong></article>)}</div> : <p className="queue-board-empty">There are no waiting tickets.</p>}
        {board.waiting.length > 12 && <p className="queue-board-more">And {board.waiting.length - 12} more waiting</p>}
      </section>
    </div>
    <footer className="queue-board-footer"><span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Connecting to queue…"}</span><button type="button" onClick={enterFullscreen}>{document.fullscreenElement ? "Exit full screen" : "Full screen"}</button></footer>
  </main>;
}
