import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

const DesignSystemPage = lazy(() => import("@/pages/DesignSystemPage"));

export function NotFound() {
  return <div className="p-6"><h1 className="text-h2">Không tìm thấy trang</h1><Link to="/home" className="text-primary-600 underline">Về trang chủ</Link></div>;
}

export function DesignSystemRoute() {
  return <Suspense fallback={null}><DesignSystemPage /></Suspense>;
}
