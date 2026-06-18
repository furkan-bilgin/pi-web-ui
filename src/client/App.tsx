import { useState, useCallback, useEffect, Component, type ReactNode } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatLog } from "./components/ChatLog";
import { Composer } from "./components/Composer";
import { StatusBar } from "./components/StatusBar";
import { ThemeToggle } from "./components/ThemeToggle";
import { Modal } from "./components/Modal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";
import { ConnectionProvider, useConnection } from "./lib/connection-provider";
import { resolvePicker, setGlobalSend } from "./lib/slash-handler";
import { dispatchPacket } from "./lib/dispatch";
import { useSessionStore } from "./stores/session-store";
import { routeInput } from "./lib/route-input";
import { useChatStore } from "./stores/chat-store";

function AppInner() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pickerModal, setPickerModal] = useState<{
    title: string;
    items: { id: string; label: string; description?: string }[];
  } | null>(null);

  // Connection must be above effects that reference send
  const { send, setHandler } = useConnection();

  // Expose send function to slash-handler (non-React context)
  useEffect(() => {
    setGlobalSend(send);
  }, [send]);

  // Listen for picker modal events from slash-handler
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        title: string;
        items: { id: string; label: string; description?: string }[];
      };
      setPickerModal(detail);
    };
    window.addEventListener("pi:show-picker", handler);
    return () => window.removeEventListener("pi:show-picker", handler);
  }, []);

  // Page title follows session name
  const sessionState = useSessionStore((s) => s.sessionState);
  useEffect(() => {
    const name = sessionState?.sessionName;
    document.title = name ? `Pi Web UI — ${name}` : "Pi Web UI";
  }, [sessionState?.sessionName]);

  // Register the message dispatch handler
  useEffect(() => {
    setHandler((packet) => {
      dispatchPacket(packet);
    });
  }, [setHandler]);

  // Listen for URL hash changes (browser back/forward navigation)
  useEffect(() => {
    const onHashChange = () => {
      const hash = location.hash.startsWith("#")
        ? decodeURIComponent(location.hash.slice(1))
        : null;
      if (hash) {
        send({ type: "switch_session", sessionPath: hash });
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [send]);

  const handleSend = useCallback(
    (text: string, images?: { data: string; mimeType: string }[]) => {
      const route = routeInput(text);
      if (route.kind === "empty" && (!images || images.length === 0)) return;

      if (route.kind === "bash") {
        send({ type: "bash", command: route.command });
        return;
      }

      if (route.kind === "slash") {
        send({ type: "slash_command", name: route.name, arg: route.arg });
        return;
      }

      // Must be 'prompt' at this point due to early returns above
      const promptRoute = route as { kind: "prompt"; message: string };
      // Optimistic user message with images
      useChatStore.getState().submitUser(promptRoute.message, images);

      // Send prompt with images
      send({ type: "prompt", message: promptRoute.message, images: images || [] });
    },
    [send]
  );

  const handleAbort = useCallback(() => {
    send({ type: "abort" });
  }, [send]);

  const handleNewSession = useCallback(() => {
    send({ type: "slash_command", name: "new", arg: "" });
  }, [send]);

  const handleSwitchSession = useCallback(
    (path: string) => {
      // Optimistic: reset chat and show loading
      useChatStore.getState().setSwitching(true);
      useChatStore.getState().resetHistory();
      send({ type: "switch_session", sessionPath: path });
    },
    [send]
  );

  const handleDeleteSession = useCallback(
    (path: string, name: string) => {
      if (confirm(`Delete session "${name.replace(/"/g, '\\"')}"?`)) {
        send({ type: "delete_session", sessionPath: path });
      }
    },
    [send]
  );

  return (
    <div className="flex h-screen">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
      />

      <Toaster richColors closeButton />

      {/* Picker modal for slash commands */}
      {pickerModal && (
        <Modal
          mode="picker"
          open={true}
          title={pickerModal.title}
          items={pickerModal.items}
          onSelect={(id) => {
            resolvePicker(id);
            setPickerModal(null);
          }}
          onClose={() => {
            setPickerModal(null);
          }}
        />
      )}

      <ErrorBoundary>
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2 md:hidden">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            &#9776;
          </button>
          <span className="text-sm font-semibold text-foreground">Pi Web UI</span>
          <ThemeToggle />
        </div>

        <ChatLog />
        <Composer onSend={handleSend} onAbort={handleAbort} />
        <StatusBar />
      </main>
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <ConnectionProvider>
      <AppInner />
    </ConnectionProvider>
  );
}
