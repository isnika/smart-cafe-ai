import { Card } from "@/shared/ui";

/** Màn hình tạm. Thay bằng trang thật khi tới bước tương ứng. */
export default function PlaceholderPage({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div className="p-4">
      <Card padding="lg">
        <h1 className="text-h2">{title}</h1>
        <p className="mt-2 text-gray-500">
          {note ?? "Màn hình này chưa được xây dựng."}
        </p>
      </Card>
    </div>
  );
}
