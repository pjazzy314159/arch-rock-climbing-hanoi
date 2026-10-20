import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, MessageCircle, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { api, ApiError, ApiUnavailableError } from "@/services/api";

type Mode = "knowledge_base" | "llm_grounded" | "not_covered";

type Message = {
  id: string;
  question: string;
  answer: string;
  mode: Mode;
  sources: { id: number; question: string; category: string }[];
};

const MODE_LABELS: Record<Mode, string> = {
  knowledge_base: "From ARCH's published information",
  llm_grounded: "Answered with the configured assistant, using ARCH's published information",
  not_covered: "Not covered by ARCH's published information",
};

/**
 * The customer-support assistant.
 *
 * The answer always states where it came from, so a visitor is never left
 * thinking the site knows something it does not.
 */
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveModel, setLiveModel] = useState(false);
  const hydrated = useHydrated();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .assistantStatus()
      .then((status) => {
        if (!cancelled) setLiveModel(status.live_model_enabled);
      })
      .catch(() => {
        if (!cancelled) setLiveModel(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || pending) return;
    setPending(true);
    setError(null);
    setQuestion("");
    try {
      const reply = await api.askAssistant(asked);
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-${current.length}`,
          question: asked,
          answer: reply.answer,
          mode: reply.mode as Mode,
          sources: reply.sources ?? [],
        },
      ]);
    } catch (caught) {
      if (caught instanceof ApiUnavailableError) {
        setError("The assistant is not reachable right now. Please try again in a moment.");
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("The assistant could not answer that. Please try again.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="assistant-launcher"
        aria-label={open ? "Close the assistant" : "Ask the ARCH assistant"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span>Ask ARCH</span>
      </button>

      {open && (
        <section className="assistant-panel" aria-label="ARCH assistant">
          <header className="assistant-head">
            <span className="assistant-icon">
              <Bot size={18} />
            </span>
            <div>
              <h2>Ask ARCH</h2>
              <p>
                {liveModel
                  ? "Answers use a language model, grounded on ARCH's published information."
                  : "Answers come from ARCH's published information."}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close the assistant"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>

          <div className="assistant-messages" ref={listRef}>
            {messages.length === 0 && (
              <div className="assistant-intro">
                <p>
                  Ask about opening hours, prices, courses, the rules of the wall or what to expect
                  on your first visit.
                </p>
                <p className="muted-note">
                  The assistant only answers from information ARCH has published. If it does not
                  know, it will say so.
                </p>
              </div>
            )}
            {messages.map((message) => (
              <div className="assistant-message" key={message.id}>
                <p className="assistant-question">{message.question}</p>
                <div className="assistant-answer">
                  <p>{message.answer}</p>
                  <span className={`assistant-mode assistant-mode-${message.mode}`}>
                    {MODE_LABELS[message.mode] ?? message.mode}
                  </span>
                  {message.sources.length > 0 && (
                    <ul className="assistant-sources">
                      {message.sources.map((source) => (
                        <li key={source.id}>
                          <span>{source.category}</span>
                          {source.question}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <div className="assistant-message">
                <p className="assistant-question">…</p>
                <div className="assistant-answer">
                  <p>Looking that up…</p>
                </div>
              </div>
            )}
            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
          </div>

          <form className="assistant-form" onSubmit={ask}>
            <input
              value={question}
              placeholder="Ask about the gym…"
              aria-label="Your question"
              maxLength={1000}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button type="submit" size="icon" disabled={!hydrated || pending || !question.trim()}>
              <Send />
              <span className="sr-only">Send</span>
            </Button>
          </form>

          <p className="assistant-footnote">
            Cannot find the answer? <Link to="/contact">Ask the team directly</Link>.
          </p>
        </section>
      )}
    </>
  );
}
