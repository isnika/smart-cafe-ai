import { Outlet } from "react-router-dom";
import { FloatingChatBox } from "@/features/chat/components/FloatingChatBox";

/** Keeps one chat widget mounted throughout the customer ordering flow. */
export function CustomerChatLayout() {
  return (
    <>
      <Outlet />
      <FloatingChatBox />
    </>
  );
}
