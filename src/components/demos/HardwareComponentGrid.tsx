import { useState } from "react";

export interface HardwareItem {
  name: string;
  en: string;
  layer: string;
  image: string;
  alt: string;
  description: string;
  refId?: number;
}

interface Props {
  items: HardwareItem[];
  ariaLabel: string;
}

// Selectable grid of robot hardware components. Picking a card shows the
// example photo, description and reference link in the preview panel.
export default function HardwareComponentGrid({ items, ariaLabel }: Props) {
  const [selected, setSelected] = useState(0);
  const layers = [...new Set(items.map((item) => item.layer))];
  const item = items[selected];
  return (
    <section className="hw-grid" aria-label={ariaLabel}>
      <div className="hw-grid-picker">
        {layers.map((layer) => (
          <div className="hw-grid-layer" key={layer} role="group" aria-label={layer}>
            <span className="hw-grid-layer-name">{layer}</span>
            <div className="hw-grid-cards">
              {items.map((card, index) =>
                card.layer !== layer ? null : (
                  <button
                    type="button"
                    key={card.name}
                    aria-pressed={index === selected}
                    onClick={() => setSelected(index)}
                  >
                    <img src={card.image} alt="" loading="lazy" />
                    <span>{card.name}</span>
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <figure className="hw-grid-preview" aria-live="polite">
        <div className="hw-grid-photo">
          <img src={item.image} alt={item.alt} />
        </div>
        <figcaption>
          <span className="hw-grid-layer-name">{item.layer}</span>
          <strong>
            {item.name} <span className="hw-grid-en">{item.en}</span>
          </strong>
          <p>
            {item.description}
            {item.refId !== undefined && (
              <>
                {" "}
                <a href={`#ref-${item.refId}`}>[{item.refId}]</a>
              </>
            )}
          </p>
        </figcaption>
      </figure>
    </section>
  );
}
