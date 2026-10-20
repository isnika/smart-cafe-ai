import { useCallback, useEffect, useState } from "react";

/** Đếm ngược theo mốc thời gian thật (không trôi khi tab bị throttle). */
export function useCountdown(seconds: number) {
  const [deadline, setDeadline] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Date.now() >= deadline) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [deadline]);

  const restart = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setDeadline(t + seconds * 1000);
  }, [seconds]);

  return { remaining: Math.max(0, Math.ceil((deadline - now) / 1000)), restart };
}
