import { ChatApp } from "@/components/ChatApp";
import { ToastProvider } from "@/components/ToastProvider";

export default function Page() {
  return (
    <ToastProvider>
      <ChatApp />
    </ToastProvider>
  );
}
