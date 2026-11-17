import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff, ScanLine } from 'lucide-react';

type Status = 'starting' | 'scanning' | 'error';

function cameraError(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Không có quyền truy cập máy ảnh. Hãy cho phép camera trong cài đặt trình duyệt, hoặc nhập mã ca bên dưới.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Không tìm thấy camera trên thiết bị này. Hãy nhập mã ca bên dưới.';
  return 'Không mở được camera. Hãy nhập mã ca bên dưới.';
}

/**
 * Quét QR ca bằng camera (getUserMedia + jsQR, thư viện đã có sẵn trong repo). Cần HTTPS hoặc localhost.
 * Là bản riêng của feature vì QrScanner trong features/home gắn chặt với luồng vào bàn (useEnterTable).
 * `paused` dừng việc đọc khung hình (đang gửi request); camera vẫn mở.
 */
export function CheckinScanner({ onScan, paused }: { onScan: (raw: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onScanRef.current = onScan;
    pausedRef.current = paused;
  });

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let lastText = '';
    let lastAt = 0;
    const canvas = document.createElement('canvas');

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && !pausedRef.current && video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          const now = Date.now();
          // Cùng nội dung thì chờ 3 giây mới xử lý lại, tránh check-in/out liên tục khi QR vẫn trước camera.
          if (hit?.data && (hit.data !== lastText || now - lastAt > 3000)) {
            lastText = hit.data;
            lastAt = now;
            onScanRef.current(hit.data);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setMessage('Trình duyệt này không hỗ trợ camera (cần HTTPS hoặc localhost). Hãy nhập mã ca bên dưới.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setStatus('scanning');
        raf = requestAnimationFrame(tick);
      } catch (err) {
        if (!stopped) {
          setStatus('error');
          setMessage(cameraError(err));
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

  if (status === 'error') {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-md bg-warning-soft p-3 text-body text-warning-strong">
        <CameraOff className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>{message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative aspect-square max-h-72 w-full overflow-hidden rounded-lg bg-gray-900">
        <video ref={videoRef} muted playsInline aria-label="Camera quét mã QR ca" className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/80" aria-hidden />
      </div>
      <p role="status" className="flex items-center justify-center gap-1.5 text-center text-caption text-gray-600">
        <ScanLine className="size-4" aria-hidden />
        {status === 'starting' ? 'Đang mở camera…' : 'Hướng camera vào mã QR ca in tại quầy.'}
      </p>
    </div>
  );
}
