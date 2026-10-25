import { useState, type FormEvent } from "react";
import { isValidTableCode } from "@/features/dine-in/validators";
import { Button } from "@/shared/ui";
import { useEnterTable } from "../hooks/useEnterTable";

/** Nhập mã bàn thủ công. Chỉ điều hướng khi server xác nhận mã tồn tại, nên không bao giờ có bàn giả. */
export function TableCodeForm({ onDone }: { onDone?: () => void }) {
  const enterTable = useEnterTable();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!isValidTableCode(value)) {
      setError("Mã bàn chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.");
      return;
    }
    setChecking(true);
    setError(null);
    const failure = await enterTable(value);
    setChecking(false);
    if (failure) setError(failure);
    else onDone?.();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3" noValidate>
      <div>
        <label htmlFor="table-code" className="mb-1 block text-body font-medium text-gray-800">
          Mã bàn
        </label>
        <input
          id="table-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Ví dụ: QR-B1-T05"
          autoComplete="off"
          autoCapitalize="characters"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "table-code-error" : undefined}
          className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-body-lg text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {error && (
          <p id="table-code-error" role="alert" className="mt-1 text-caption text-error-strong">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" fullWidth loading={checking} disabled={!code.trim()}>
        Vào bàn
      </Button>
    </form>
  );
}
