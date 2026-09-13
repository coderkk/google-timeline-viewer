// FAQ accordion: a list of collapsible question/answer pairs. Each item can be
// opened and closed independently; visibility is purely local UI state.
import { useState } from 'react'

export interface FAQItem {
  q: string
  a: string
}

export default function FAQ({ items }: { items: FAQItem[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({})

  const toggle = (index: number) => {
    setOpen((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  return (
    <div className="faq">
      {items.map((item, index) => {
        const expanded = Boolean(open[index])
        return (
          <div key={item.q} className={expanded ? 'faq-item open' : 'faq-item'}>
            <button
              type="button"
              className="faq-q"
              onClick={() => toggle(index)}
              aria-expanded={expanded}
            >
              <span>{item.q}</span>
              <span className="faq-caret" aria-hidden="true">
                {expanded ? '−' : '+'}
              </span>
            </button>
            {expanded && <div className="faq-a">{item.a}</div>}
          </div>
        )
      })}
    </div>
  )
}