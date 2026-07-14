"use client";

import { useRef, useState } from "react";
import { Send, Mic, Volume2, Loader2 } from "lucide-react";
import clsx from "clsx";

// 대화(채팅) 형식이 아니라, 마지막 질문 1건과 그 답변만 Q/A로 보여준다.
interface QA {
  question: string;
  answer: string | null; // null = 답변 대기 중
  grounded?: boolean;
}

const ERROR_ANSWER = "정확한 정보를 찾지 못했습니다. 119 또는 재난안전상황실(044-205-1541~3)에 문의해 주세요.";

export default function GuideChat() {
  const [qa, setQa] = useState<QA | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setQa({ question: trimmed, answer: null });
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/guide/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      setQa({ question: trimmed, answer: json.reply ?? ERROR_ANSWER, grounded: json.grounded });
    } catch {
      setQa({ question: trimmed, answer: ERROR_ANSWER });
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
      <div className="mb-3 flex items-center gap-2">
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
          placeholder="궁금한 점을 입력하세요 (예: 지진 났을 때 엘리베이터 안이면?)"
          className="flex-1 rounded-full border border-slate-200 px-4 py-2.5 text-[15px] focus:border-brand-400 focus:outline-none"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </div>

      {qa === null ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-500">
          재난 상황에서 어떻게 행동해야 할지 질문을 입력하면, 국민행동요령을 근거로 답변을 보여드립니다.
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="rounded-xl bg-brand-50 px-4 py-3">
            <p className="mb-1 text-xs font-bold text-brand-700">질문</p>
            <p className="text-[15px] font-medium leading-relaxed text-slate-800">{qa.question}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="mb-1 text-xs font-bold text-slate-500">답변</p>
            {qa.answer === null ? (
              <Loader2 size={16} className="my-1 animate-spin text-slate-400" />
            ) : (
              <>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{qa.answer}</p>
                <button
                  onClick={() => speak(qa.answer!)}
                  className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <Volume2 size={14} /> 음성으로 듣기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
