import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { parseTableCodeFromQr } from "@/features/dine-in/qr";
import { useEnterTable } from "../hooks/useEnterTable";

type Status = "starting" | "scanning" | "verifying" | "error";

function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Trình duyệt chưa được cấp quyền dùng camera.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Không tìm thấy camera trên thiết bị này.";
  return "Không mở được camera.";
}

/**
 * Quét QR bàn bằng camera (getUserMedia + jsQR). Cần HTTPS hoặc localhost.
 * Chỉ vào bàn khi nội dung QR là mã/URL bàn hợp lệ VÀ server mở được phiên; QR khác bị bỏ qua.
 */
export function QrScanner({ onDone, onManual }: { onDone: () => void; onManual: () => void }) {
  const enterTable = useEnterTable();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState<string | null>(null);
  // Giữ handler mới nhất mà không phải khởi động lại camera mỗi lần render.
  const handlerRef = useRef<(raw: string) => Promise<boolean>>(() => Promise.resolve(false));
  useEffect(() => {
    handlerRef.current = async (raw) => {
      const code = parseTableCodeFromQr(raw);
      if (!code) {
        setMessage("Mã QR này không phải mã bàn của Smart Cafe.");
        return false;
      }
      setStatus("verifying");
      const failure = await enterTable(code);
      if (failure) {
        setMessage(failure);
        setStatus("scanning");
        return false;
      }
      onDone();
      return true;
    };
  });

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let busy = false;
    let lastText = "";
    let lastAt = 0;
    const canvas = document.createElement("canvas");

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && !busy && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          const now = Date.now();
          // Cùng một nội dung thì chờ 2,5 giây mới xử lý lại, tránh gọi API liên tục khi QR vẫn trước camera.
          if (hit?.data && (hit.data !== lastText || now - lastAt > 2500)) {
            lastText = hit.data;
            lastAt = now;
            busy = true;
            void handlerRef.current(hit.data).finally(() => {
              busy = false;
            });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Trình duyệt này không hỗ trợ camera (cần HTTPS hoặc localhost).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStatus("scanning");
        raf = requestAnimationFrame(tick);
      } catch (err) {
        if (!stopped) {
          setStatus("error");
          setMessage(cameraErrorMessage(err));
        }
      }
    }
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      {status !== "error" && (
        <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-900">
          <video ref={videoRef} muted playsInline aria-label="Camera quét mã QR" className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/80" aria-hidden />
        </div>
      )}
      <p role="status" className="text-center text-body text-gray-700">
        {status === "starting" && "Đang mở camera…"}
        {status === "scanning" && "Hướng camera vào mã QR trên bàn."}
        {status === "verifying" && "Đang kiểm tra mã bàn…"}
      </p>
      {message && (
        <p role="alert" className="rounded-md bg-error-soft p-2 text-center text-caption text-error-strong">
          {message}
        </p>
      )}
      <button type="button" onClick={onManual} className="block w-full text-center text-body font-semibold text-primary-600 hover:underline">
        Nhập mã bàn thay thế
      </button>
    </div>
  );
}
