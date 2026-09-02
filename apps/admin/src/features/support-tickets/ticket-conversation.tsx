"use client";

import { Lock, MessageSquare } from "lucide-react";

import { DateCell } from "@/components/data";
import { cn } from "@/lib/cn";

import type { SupportTicketDetail, TicketMessage } from "./types";

/**
 * The thread, oldest at the top.
 *
 * THREE KINDS OF BLOCK, NOT TWO
 * ───────────────────────────────────────────────────────────────────────────
 *   The citizen  — left, plain surface. Their words.
 *   Support      — right, tinted. Ours, and they have seen it.
 *   Internal note— FULL WIDTH, amber, dashed, padlocked. Deliberately NOT on
 *                  the support side of the conversation, because it is not part
 *                  of the conversation at all: it is staff marginalia written
 *                  on the ticket. Drawing it in the same column as real replies
 *                  is what makes "did they see this?" a question an agent has
 *                  to stop and answer. Sitting outside the two lanes, it can
 *                  only be read as an annotation.
 *
 * The label says the whole rule in words — "Internal note — not visible to the
 * user" — because colour alone is not readable by everyone, and this is the one
 * distinction in the feature where being wrong is visible to a citizen.
 *
 * WHY THE OPENING MESSAGE IS RENDERED HERE, MARKED AS ITSELF
 * ───────────────────────────────────────────────────────────────────────────
 * `support_tickets.description` is a COLUMN, not row #1 of
 * `support_ticket_messages` — the schema says so, and says why (it is NOT NULL
 * on every existing row and the mobile client already renders it as the ticket
 * body). So it never arrives in `messages`, and a thread that omitted it would
 * start with a reply to something invisible. It is shown at the top, in the
 * citizen's lane, labelled as the opening message so nobody mistakes it for a
 * reply they missed.
 *
 * NO COUNTS, NO CLOCKS. There is no "3 replies · first response 4h" strip. A
 * response-time figure would have to be computed here from the timestamps in
 * hand, and a number this console invented and then displayed as a metric is
 * exactly what a support console must not do — it looks authoritative and
 * answers a question nobody measured.
 *
 * TAMIL. Nothing here sets a font. `--font-sans` lists Inter first and Noto
 * Sans Tamil second, so Tamil codepoints fall through to a face that has them
 * (see `globals.css`). `whitespace-pre-wrap` keeps the citizen's own line
 * breaks and `break-words` stops a long unbroken run — a URL, or Tamil text a
 * browser will not break mid-word — from widening the whole column.
 */
export function TicketConversation({ ticket }: { ticket: SupportTicketDetail }) {
  return (
    <ol className="space-y-3">
      <li>
        <OpeningMessage ticket={ticket} />
      </li>

      {ticket.messages.length === 0 ? (
        <li>
          <p className="flex items-center gap-2 rounded-card border border-dashed border-border px-3 py-4 text-xs text-fg-faint">
            <MessageSquare aria-hidden className="size-3.5 shrink-0" />
            Nobody has replied yet. Your reply below will be the first thing this citizen hears back.
          </p>
        </li>
      ) : (
        ticket.messages.map((message) => (
          <li key={message.id}>
            <Message message={message} citizenName={ticket.user.name} />
          </li>
        ))
      )}
    </ol>
  );
}

function OpeningMessage({ ticket }: { ticket: SupportTicketDetail }) {
  return (
    <Bubble
      side="user"
      author={ticket.user.name?.trim() || "Unnamed"}
      role="Opening message"
      at={ticket.createdAt}
      body={ticket.description}
    />
  );
}

function Message({ message, citizenName }: { message: TicketMessage; citizenName: string | null }) {
  const author =
    message.sender?.name?.trim() ||
    // `sender` goes null when the author's account is deleted — the body
    // survives them, by design, so the message still renders with an honest
    // label rather than a blank name that reads as missing data.
    (message.sender === null
      ? message.senderType === "user"
        ? citizenName?.trim() || "Deleted account"
        : "Deleted account"
      : "Unnamed");

  if (message.isInternalNote) {
    return <InternalNote message={message} author={author} />;
  }

  return (
    <Bubble
      side={message.senderType === "admin" ? "admin" : "user"}
      author={author}
      role={message.senderType === "admin" ? "Support" : undefined}
      at={message.createdAt}
      body={message.body}
    />
  );
}

function Bubble({
  side,
  author,
  role,
  at,
  body,
}: {
  side: "user" | "admin";
  author: string;
  role?: string;
  at: string | null;
  body: string;
}) {
  const fromAdmin = side === "admin";

  return (
    <div className={cn("flex", fromAdmin && "justify-end")}>
      <div className={cn("min-w-0 max-w-[46rem]", fromAdmin && "text-right")}>
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]",
            fromAdmin && "justify-end",
          )}
        >
          <span className="font-semibold text-fg-muted">{author}</span>
          {role ? <span className="micro-label text-fg-faint">{role}</span> : null}
          <span className="text-fg-faint">
            <DateCell value={at} withTime />
          </span>
        </div>

        <div
          className={cn(
            "mt-1 rounded-card border px-3.5 py-2.5 text-left text-fg",
            fromAdmin
              ? "border-primary-soft-border bg-primary-soft"
              : "border-border bg-surface-2",
          )}
        >
          <p className="break-words whitespace-pre-wrap">{body}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Staff marginalia. Full width, amber, dashed, padlocked, and labelled in
 * words — the same treatment the composer wears while it is being written, so
 * an agent sees the note land looking exactly like the box they typed it into.
 */
function InternalNote({ message, author }: { message: TicketMessage; author: string }) {
  return (
    <div className="rounded-card border border-dashed border-warning-soft-border bg-warning-soft px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
        <span className="flex items-center gap-1 font-bold text-warning-fg">
          <Lock aria-hidden className="size-3" />
          Internal note — not visible to the user
        </span>
        <span className="font-semibold text-fg-muted">{author}</span>
        <span className="text-fg-faint">
          <DateCell value={message.createdAt} withTime />
        </span>
      </div>
      <p className="mt-1.5 break-words whitespace-pre-wrap text-fg">{message.body}</p>
    </div>
  );
}
