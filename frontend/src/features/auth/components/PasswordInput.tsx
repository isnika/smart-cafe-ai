import { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input, type InputProps } from "@/shared/ui";

/** Input mật khẩu có icon khoá bên trái và nút hiện/ẩn bên phải (đúng Figma). */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, "type" | "rightElement">
>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      ref={ref}
      leftIcon={<Lock />}
      {...props}
      type={visible ? "text" : "password"}
      rightElement={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          className="grid size-8 place-items-center rounded-sm text-gray-400 hover:text-gray-600"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
});
