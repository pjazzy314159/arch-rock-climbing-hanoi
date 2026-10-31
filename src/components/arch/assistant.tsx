import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, MessageCircle, Send, X, Loader2, AlertCircle, HelpCircle, ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { api, ApiError, ApiUnavailableError } from "@/services/api";

type Mode = "knowledge_base" | "llm_grounded" | "not_covered";

type SourceCategory = "faq" | "route" | "price" | "opening_hour" | "rule" | "course" | "event" | "service" | "unknown";

type Source = {
  id: number;
  question: string;
  category: string;
};

type Message = {
  id: string;
  question: string;
  answer: string;
  mode: Mode;
  sources: { id: number; question: string; category: string }[];
};

type FAQSuggestion = {
  id: number;
  question: string;
  category: string;
};

const MODE_LABELS: Record<Mode, string> = {
  knowledge_base: "From ARCH's published information",
  llm_grounded: "Answered with the configured assistant, using ARCH's published information",
  not_covered: "Not covered by ARCH's published information",
};

const SOURCE_CATEGORY_LABELS = {
  faq: "FAQ",
  route: "Climbing route",
  price: "Price",
  opening_hour: "Opening hours",
  rule: "Rule",
  course: "Course",
  event: "Event",
  service: "Service",
  unknown: "Source",
} as const;

function getSourceCategoryLabel(category: string): string {
  const label = SOURCE_CATEGORY_LABELS[category as keyof typeof SOURCE_CATEGORY_LABELS];
  return label ?? SOURCE_CATEGORY_LABELS.unknown;
}

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
  const [liveModelLoading, setLiveModelLoading] = useState(true);
  const [faqSuggestions, setFaqSuggestions] = useState<FAQSuggestion[]>([]);
  const [faqSuggestionsLoading, setFaqSuggestionsLoading] = useState(false);
  const hydrated = useHydrated();
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api
      .assistantStatus()
      .then((status) => {
        if (!cancelled) {
          setLiveModel(status.live_model_enabled);
          setLiveModelLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveModel(false);
          setLiveModelLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const element = listRef.current;
    if (element && typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
  }, [messages, pending]);

  async function fetchFaqSuggestions() {
    if (faqSuggestionsLoading) return;
    setFaqSuggestionsLoading(true);
    try {
      const faq = await api.faq();
      // The API only returns published FAQ entries
      setFaqSuggestions(faq.slice(0, 5).map((entry) => ({
        id: entry.id,
        question: entry.question,
        category: entry.category,
      })));
    } catch {
      // Silently fail - suggestions are a nice-to-have
    } finally {
      setFaqSuggestionsLoading(false);
    }
  }

  useEffect(() => {
    if (open && faqSuggestions.length === 0 && !faqSuggestionsLoading) {
      fetchFaqSuggestions();
    }
  }, [open, faqSuggestions.length, faqSuggestionsLoading]);

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

  function handleFaqSuggestionClick(suggestion: FAQSuggestion) {
    setQuestion(suggestion.question);
    setFaqSuggestions([]);
  }

  function getRelevantFaqSuggestions(message: Message): FAQSuggestion[] {
    if (message.sources.length === 0) return [];
    const sourceCategories = new Set(message.sources.map((s) => s.category));
    return faqSuggestions
      .filter((s) => sourceCategories.has(s.category) || s.category === "faq")
      .slice(0, 3);
  }

  function isProviderConfigured(): boolean | null {
    if (liveModelLoading) return null;
    return liveModel;
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
                {liveModelLoading
                  ? "Checking assistant status…"
                  : liveModel
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
                    <ul className="assistant-sources" role="list" aria-label="Sources">
                      {message.sources.map((source) => (
                        <li key={source.id}>
                          <span className="source-category-badge">
                            {getSourceCategoryLabel(source.category)}
                          </span>
                          <span className="source-question">{source.question}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Related FAQ suggestions */}
                  {message.sources.length > 0 && faqSuggestions.length > 0 && (
                    <div className="faq-suggestions" role="list" aria-label="Related FAQ suggestions">
                      <p className="suggestion-title">Related FAQs</p>
                      <ul role="list">
                        {getRelevantFaqSuggestions(message).map((suggestion) => (
                          <li key={suggestion.id} role="listitem">
                            <button
                              type="button"
                              className="faq-suggestion-link"
                              onClick={() => handleFaqSuggestionClick(suggestion)}
                              aria-label={`Ask: ${suggestion.question}`}
                            >
                              <span className="suggestion-category">{getSourceCategoryLabel(suggestion.category)}</span>
                              <span className="suggestion-question">{suggestion.question}</span>
                              <ChevronRight size={14} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {pending && (
              <div className="assistant-message assistant-message-pending">
                <p className="assistant-question">…</p>
                <div className="assistant-answer">
                  <p className="loading-text">
                    <Loader2 className="loading-spinner" size={16} aria-hidden="true" />
                    Looking that up…
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className="assistant-error-message" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>

          <form ref={formRef} className="assistant-form" onSubmit={ask}>
            <div className="input-wrapper">
              <input
                value={question}
                placeholder="Ask about the gym…"
                aria-label="Your question"
                maxLength={1000}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={pending}
                autoFocus
              />
              {faqSuggestionsLoading && <Loader2 className="input-loader" size={16} aria-hidden="true" />}
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={!hydrated || pending || !question.trim()}
              aria-label={pending ? "Sending question" : "Send question"}
            >
              {pending ? <Loader2 size={18} aria-hidden="true" /> : <Send />}
              <span className="sr-only">{pending ? "Sending…" : "Send"}</span>
            </Button>
          </form>

          <p className="assistant-footnote">
            <HelpCircle size={14} aria-hidden="true" />
            Cannot find the answer? <Link to="/contact">Ask the team directly</Link>.
          </p>
        </section>
      )}
    </>
  );
}