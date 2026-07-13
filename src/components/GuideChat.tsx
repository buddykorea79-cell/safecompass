"use client";

import { useRef, useState } from "react";
import { Send, Mic, Volume2, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  grounded?: boolean;
}

export default function GuideChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "안녕하세요! 재난 상황에서 어떻게 행동해야 할지 궁금하신 점을 물어보세요. (예: 지진 났을 때 엘리베이터 안이면 어떻게 해요?)",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/guide/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: json.reply, grounded: json.grounded }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "정확한 정보를 찾지 못했습니다. 119 또는 재난안전상황실(044-205-1541~3)에 문의해 주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleMic() {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="mb-3 max-h-80 space-y-2.5 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={clsx(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
              )}
            >
              <p className="whitespace-pre-line">{m.text}</p>
              {m.role === "assistant" && (
                <button onClick={() => speak(m.text)} className="mt-1.5 text-slate-400 hover:text-slate-600">
                  <Volume2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-3.5 py-2.5">
              <Loader2 size={14} className="animate-spin text-slate-400" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleMic}
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            listening ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"
          )}
        >
          <Mic size={16} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="궁금한 점을 물어보세요"
          className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
