import { useState } from "react";
import { Banknote, Bot, CheckCircle2, Search } from "lucide-react";
import { Badge, Button, Card, Input, Modal, Skeleton } from "@/shared/ui";
import { formatVND } from "@/shared/lib/cn";

const palettes: Record<string, string[]> = {
  primary: [
    "bg-primary-50",
    "bg-primary-100",
    "bg-primary-200",
    "bg-primary-300",
    "bg-primary-400",
    "bg-primary-500",
    "bg-primary-600",
    "bg-primary-700",
    "bg-primary-800",
    "bg-primary-900",
  ],
  secondary: [
    "bg-secondary-50",
    "bg-secondary-100",
    "bg-secondary-200",
    "bg-secondary-300",
    "bg-secondary-400",
    "bg-secondary-500",
    "bg-secondary-600",
    "bg-secondary-700",
    "bg-secondary-800",
    "bg-secondary-900",
  ],
  accent: [
    "bg-accent-50",
    "bg-accent-100",
    "bg-accent-200",
    "bg-accent-300",
    "bg-accent-400",
    "bg-accent-500",
    "bg-accent-600",
    "bg-accent-700",
    "bg-accent-800",
    "bg-accent-900",
  ],
  gray: [
    "bg-gray-50",
    "bg-gray-100",
    "bg-gray-200",
    "bg-gray-300",
    "bg-gray-400",
    "bg-gray-500",
    "bg-gray-600",
    "bg-gray-700",
    "bg-gray-800",
    "bg-gray-900",
  ],
};

export default function DesignSystemPage() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-4xl space-y-10 p-6">
      <h1 className="text-display">Design system</h1>

      <section className="space-y-3">
        <h2 className="text-h2">Màu sắc</h2>
        {Object.entries(palettes).map(([name, classes]) => (
          <div key={name}>
            <p className="mb-1 text-caption text-gray-500">{name} (50 → 900)</p>
            <div className="flex overflow-hidden rounded-md">
              {classes.map((c) => (
                <div key={c} className={`${c} h-10 flex-1`} />
              ))}
            </div>
          </div>
        ))}
        <div className="h-10 rounded-md bg-ai-gradient" />
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Chữ</h2>
        <p className="text-display">Display 36</p>
        <p className="text-h1">Heading 1 · 28</p>
        <p className="text-h2">Heading 2 · 24</p>
        <p className="text-h3">Heading 3 · 20</p>
        <p className="text-body-lg">
          Body lớn 16 — Cà phê sữa đá {formatVND(35000)}
        </p>
        <p className="text-body">Body 14 — Bàn 05, mã đơn #123</p>
        <p className="text-caption text-gray-500">Caption 12</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Button</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Đặt món</Button>
          <Button variant="secondary">Xác nhận đã thu</Button>
          <Button variant="outline">Huỷ</Button>
          <Button variant="ghost">Bỏ qua</Button>
          <Button variant="danger">Từ chối</Button>
          <Button variant="ai" leftIcon={<Bot className="size-4" />}>
            Hỏi AI
          </Button>
          <Button loading>Đang lưu</Button>
          <Button disabled>Không khả dụng</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm">Nhỏ</Button>
          <Button size="md">Vừa</Button>
          <Button size="lg">Lớn</Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Tìm theo mã đơn / số bàn"
          placeholder="Ví dụ: #123 hoặc Bàn 05"
          leftIcon={<Search />}
        />
        <Input
          label="Số điện thoại"
          defaultValue="09123"
          error="Số điện thoại cần đủ 10 chữ số."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Badge, Card, Skeleton</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning">Chờ xác nhận</Badge>
          <Badge tone="info">Đã xác nhận</Badge>
          <Badge tone="primary">Đang pha chế</Badge>
          <Badge tone="success">Hoàn thành</Badge>
          <Badge tone="error">Đã huỷ</Badge>
          <Badge tone="ai">AI gợi ý</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card accent="info" interactive className="flex items-center gap-3">
            <Banknote className="size-6 text-info" />
            <div>
              <p className="font-medium">Bàn 05 · #123</p>
              <p className="tabular text-gray-600">{formatVND(85000)}</p>
            </div>
          </Card>
          <Card
            accent="success"
            interactive
            className="flex items-center gap-3"
          >
            <CheckCircle2 className="size-6 text-success" />
            <div>
              <p className="font-medium">Bàn 02 · #124</p>
              <p className="text-gray-600">Đã trả online</p>
            </div>
          </Card>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-h2">Bóng đổ</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            "shadow-card",
            "shadow-dropdown",
            "shadow-modal",
            "shadow-sticky",
          ].map((s) => (
            <div
              key={s}
              className={`${s} rounded-lg bg-white p-4 text-caption`}
            >
              {s}
            </div>
          ))}
        </div>
      </section>

      <Button onClick={() => setOpen(true)}>Mở Bill Modal mẫu</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Thanh toán · Bàn 05"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button variant="secondary">Xác nhận đã thu</Button>
          </>
        }
      >
        <p>
          Tổng cộng <strong className="tabular">{formatVND(85000)}</strong>
        </p>
      </Modal>
    </main>
  );
}
