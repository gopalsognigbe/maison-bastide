import { useEffect, useRef } from 'react'
import { createHeroEngine, HERO_BEAT_TIMING } from './hero-engine'
import { t } from './i18n'

function BeatLines({ lines }) {
  const [lead, ...rest] = lines
  return (
    <>
      <span className="hero__beat-lead">
        {[...lead].map((char, charIndex) => (
          <span className="hero__beat-char" key={`lead-${charIndex}`}>
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </span>
      <span className="hero__beat-rest">
        {rest.map((line, lineIndex) => (
          <span className="hero__beat-line" key={`rest-${lineIndex}-${line}`}>
            {[...line].map((char, charIndex) => (
              <span
                className="hero__beat-char"
                key={`rest-${lineIndex}-${charIndex}`}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </span>
        ))}
      </span>
      <span className="hero__beat-rule" aria-hidden="true" />
    </>
  )
}

export default function Hero({ lang, onLoadProgress, onReady }) {
  const rootRef = useRef(null)
  const onLoadProgressRef = useRef(onLoadProgress)
  const onReadyRef = useRef(onReady)
  onLoadProgressRef.current = onLoadProgress
  onReadyRef.current = onReady

  const copy = t(lang)
  const beats = HERO_BEAT_TIMING.map((beat) => ({
    ...beat,
    lines: copy.beats[beat.id],
  }))

  useEffect(() => {
    const engine = createHeroEngine(rootRef.current, {
      onProgress: (pct) => onLoadProgressRef.current?.(pct),
      onReady: () => onReadyRef.current?.(),
    })
    return () => engine.destroy()
  }, [])

  return (
    <section ref={rootRef} className="hero" aria-label={copy.heroAria}>
      <div className="hero__sticky">
        <div className="hero__stage" data-hero-stage>
          <video
            className="hero__video"
            data-hero-video
            muted
            playsInline
            preload="auto"
            poster="/poster.jpg"
            aria-hidden="true"
          />
        </div>
        <div className="hero__gradient" aria-hidden="true" />

        <h1 className="sr-only">{copy.heroSr}</h1>

        <div className="hero__beats" aria-hidden="true">
          {beats.map((beat) => (
            <p key={beat.id} className="hero__beat" data-beat={beat.id}>
              <BeatLines lines={beat.lines} />
            </p>
          ))}
        </div>

        <div className="hero__tech">
          <span className="hero__tech-line">
            <span>{copy.heroTechOrigin}</span>
          </span>
          <span className="hero__tech-line">
            <span>{copy.heroTechDetail}</span>
          </span>
        </div>

        <p className="hero__scroll" data-hero-scroll>
          {copy.heroScroll}
        </p>

        <div className="hero__rail" aria-hidden="true">
          <div className="hero__rail-track">
            <div className="hero__rail-fill" data-hero-rail-fill />
          </div>
        </div>
      </div>
    </section>
  )
}
