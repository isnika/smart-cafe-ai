import { useState } from "react";
import { Bike, Coffee, QrCode, ShoppingBag } from "lucide-react";
import { Link } from "react-router-dom";
import { PATHS } from "@/app/routes";
import { Button, Modal } from "@/shared/ui";
import { QrScanner } from "../components/QrScanner";
import { TableCodeForm } from "../components/TableCodeForm";

/** Order Mode Selection (entry). Công khai. Giao hàng / Mang đi chưa có luồng nên hiển thị "Sắp ra mắt" và không bấm được. */
export default function OrderModePage() {
  const [scanHelp, setScanHelp] = useState(false);
  const [manual, setManual] = useState(false);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col bg-primary-50 px-5"
      style={{
        paddingTop: "calc(var(--safe-top) + 1.5rem)",
        paddingBottom: "calc(var(--safe-bottom) + 2rem)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-primary-600 text-white">
          <Coffee className="size-5" aria-hidden />
        </span>
        <span className="font-heading text-h3 text-gray-900">Smart Cafe</span>
      </div>

      <h1 className="mt-10 font-heading text-h1 text-gray-900">
        Bạn muốn đặt món thế nào?
      </h1>
      <p className="mt-2 text-body-lg text-gray-600">
        Một ly ngon, theo cách của bạn. Chọn hình thức đặt món để bắt đầu.
      </p>

      <section
        aria-labelledby="mode-dine-in"
        className="mt-6 rounded-xl border border-primary-100 bg-white p-5 shadow-card"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-primary-50 text-primary-600">
            <QrCode className="size-6" aria-hidden />
          </span>
          <h2 id="mode-dine-in" className="text-h3 text-gray-900">
            Tôi đang ở quán
          </h2>
        </div>
        <p className="mt-4 text-body text-gray-600">
          Quét QR trên bàn để xem menu và đặt món trực tiếp tại bàn của bạn.
        </p>
        <Button
          size="lg"
          fullWidth
          className="mt-4 rounded-full"
          onClick={() => setScanHelp(true)}
        >
          Quét QR bàn
        </Button>
        <button
          type="button"
          onClick={() => setManual(true)}
          className="mt-3 block w-full rounded-md py-1 text-center text-body font-semibold text-primary-600 hover:underline"
        >
          Nhập mã bàn
        </button>
      </section>

      <section
        aria-labelledby="mode-online"
        className="mt-4 rounded-xl border border-primary-100 bg-white p-5 shadow-card"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-primary-50 text-primary-600">
            <ShoppingBag className="size-6" aria-hidden />
          </span>
          <h2 id="mode-online" className="text-h3 text-gray-900">
            Đặt hàng trực tuyến
          </h2>
        </div>
        <p className="mt-4 text-body text-gray-600">
          Thưởng thức ở bất cứ đâu. Giao tận nơi hoặc ghé quán nhận món.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "Giao hàng", icon: Bike },
            { label: "Mang đi", icon: ShoppingBag },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              disabled
              aria-label={`${label} (sắp ra mắt)`}
              className="flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 font-medium text-gray-600"
            >
              <Icon className="size-5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-caption text-gray-600">
          Sắp ra mắt
        </p>
      </section>

      <div className="mt-auto pt-10 text-center">
        <Link
          to={PATHS.home}
          className="text-body font-semibold text-primary-600 hover:underline"
        >
          Xem menu trước
        </Link>
      </div>

      <Modal
        open={scanHelp}
        onClose={() => setScanHelp(false)}
        title="Quét QR trên bàn"
        size="sm"
      >
        <QrScanner
          onDone={() => setScanHelp(false)}
          onManual={() => {
            setScanHelp(false);
            setManual(true);
          }}
        />
      </Modal>

      <Modal
        open={manual}
        onClose={() => setManual(false)}
        title="Nhập mã bàn"
        size="sm"
      >
        <TableCodeForm onDone={() => setManual(false)} />
      </Modal>
    </main>
  );
}
