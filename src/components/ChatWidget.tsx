"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatWidget({ slug, botName, greeting }: { slug: string; botName: string; greeting: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`rf-chat-${slug}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { conversationId: string; messages: Msg[] };
        setConversationId(parsed.conversationId);
        setMessages(parsed.messages);
      }
    } catch {}
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  function visitorId() {
    try {
      let id = localStorage.getItem("rf-visitor");
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("rf-visitor", id);
      }
      return id;
    } catch {
      return "anon";
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/storefront/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId, visitorId: visitorId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");
      const updated: Msg[] = [...next, { role: "assistant", content: data.reply }];
      setMessages(updated);
      setConversationId(data.conversationId);
      try {
        sessionStorage.setItem(`rf-chat-${slug}`, JSON.stringify({ conversationId: data.conversationId, messages: updated }));
      } catch {}
    } catch (err) {
      setMessages([...next, { role: "assistant", content: `Sorry, something went wrong (${err instanceof Error ? err.message : "error"}). Please try again.` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
        style={{ background: "var(--brand)" }}
      >
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div className="fixed right-5 bottom-24 z-40 flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="px-4 py-3 text-white" style={{ background: "var(--brand)" }}>
            <p className="font-semibold">{botName}</p>
            <p className="text-xs text-white/80">Usually replies instantly</p>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "text-white" : "bg-white text-slate-800 shadow-sm"}`}
                  style={m.role === "user" ? { background: "var(--brand)" } : undefined}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-slate-400">{botName} is typing…</div>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about prices, dates, orders…" className="input" disabled={busy} />
            <button type="submit" disabled={busy || !input.trim()} className="btn-brand">Send</button>
          </form>
        </div>
      )}
    </>
  );
}
