import { useEffect, useRef, useState } from "react";

// Counts down once per second and calls onDone when it reaches 0.
export default function useCountdown(seconds, onDone) {
  const [remaining, setRemaining] = useState(seconds);
  const onDoneRef = useRef(onDone);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    setRemaining(seconds);
    const id = setInterval(() => setRemaining((r) => Math.max(r - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  useEffect(() => {
    if (remaining === 0) onDoneRef.current?.();
  }, [remaining]);

  return remaining;
}