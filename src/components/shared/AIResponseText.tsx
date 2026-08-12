// src/components/shared/AIResponseText.tsx
//
// Lightweight markdown-ish renderer for short AI responses shown inline in
// tool pages (NmapBuilder's "Explain this command", coach hints, etc).
//
// This is intentionally NOT the same as ChatWindow's MessageRenderer — that
// one is built for full chat messages with syntax-highlighted code blocks
// and is tightly coupled to the chat message data structure. This component
// is a small, dependency-free drop-in for any tool that currently dumps a
// raw AI string into a <span> or <p> with no formatting — the exact bug
// that made "words embedded in each other" reports show up across several
// tools (NmapBuilder, HTB Coach, etc).
//
// Supports: paragraphs (blank-line separated), bullet lists (- or *),
// numbered lists (1. 2. ...), **bold**, `inline code`, and basic headers
// (## Heading). No external libraries required.

import React from 'react'

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Split on **bold** and `code` spans, preserving the rest as plain text.
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  const segments = text.split(regex)

  segments.forEach((seg, i) => {
    if (!seg) return
    if (seg.startsWith('**') && seg.endsWith('**')) {
      parts.push(
        <strong
          key={`${keyPrefix}-b-${i}`}
          className="font-semibold text-white"
        >
          {seg.slice(2, -2)}
        </strong>
      )
    } else if (seg.startsWith('`') && seg.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}-c-${i}`}
          className="rounded-md bg-black/40 border border-white/10 px-1.5 py-0.5 text-[12px] font-mono text-emerald-300/90 shadow-sm"
        >
          {seg.slice(1, -1)}
        </code>
      )
    } else {
      parts.push(
        <React.Fragment key={`${keyPrefix}-t-${i}`}>{seg}</React.Fragment>
      )
    }
  })

  return parts
}

export default function AIResponseText({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  if (!text) return null

  // Split into blocks on blank lines, then classify each block as a
  // heading, bullet list, numbered list, or plain paragraph.
  const blocks = text.trim().split(/\n\s*\n/)

  return (
    <div
      className={`space-y-3.5 leading-relaxed text-[13.5px] text-zinc-300 ${className}`}
    >
      {blocks.map((block, blockIdx) => {
        const lines = block
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)

        // Heading: starts with ## or #
        if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
          const headingText = lines[0].replace(/^#{1,3}\s+/, '')
          return (
            <h4
              key={blockIdx}
              className="text-sm font-semibold tracking-tight text-emerald-400/95 mt-1"
            >
              {renderInline(headingText, `h-${blockIdx}`)}
            </h4>
          )
        }

        // Bullet list: every line starts with - or *
        const isBulletList =
          lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))
        if (isBulletList) {
          return (
            <ul
              key={blockIdx}
              className="list-disc space-y-1.5 pl-5 marker:text-emerald-500/70"
            >
              {lines.map((l, i) => (
                <li key={i} className="pl-0.5">
                  {renderInline(
                    l.replace(/^[-*]\s+/, ''),
                    `bl-${blockIdx}-${i}`
                  )}
                </li>
              ))}
            </ul>
          )
        }

        // Numbered list: every line starts with "1." "2." etc
        const isNumberedList =
          lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l))
        if (isNumberedList) {
          return (
            <ol
              key={blockIdx}
              className="list-decimal space-y-1.5 pl-5 marker:text-emerald-500/70"
            >
              {lines.map((l, i) => (
                <li key={i} className="pl-0.5">
                  {renderInline(
                    l.replace(/^\d+\.\s+/, ''),
                    `nl-${blockIdx}-${i}`
                  )}
                </li>
              ))}
            </ol>
          )
        }

        // Plain paragraph — join wrapped lines back into one flowing paragraph
        // (the model often wraps a single sentence across multiple lines).
        const paragraphText = lines.join(' ')
        return (
          <p key={blockIdx} className="leading-relaxed">
            {renderInline(paragraphText, `p-${blockIdx}`)}
          </p>
        )
      })}
    </div>
  )
}