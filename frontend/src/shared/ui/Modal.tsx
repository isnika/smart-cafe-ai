import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof sizes;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }} // bấm nền mờ để đóng
      className={cn(
        "w-[calc(100%-2rem)] rounded-xl border-0 bg-white p-0 text-gray-900 shadow-modal backdrop:bg-gray-900/50",
        sizes[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-h3 text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-sm p-1 text-gray-500 hover:bg-gray-100"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
