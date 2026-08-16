import { useEffect, useRef } from 'react'
import { createHeroEngine, HERO_BEAT_TIMING } from './hero-engine'
import { createHeroChapters, isChapterHero, HERO_CHAPTERS } from './hero-chapters'
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

  const chapters = isChapterHero()

  useEffect(() => {
    const options = {
      onProgress: (pct) => onLoadProgressRef.current?.(pct),
      onReady: () => onReadyRef.current?.(),
    }
    const engine = chapters
      ? createHeroChapters(rootRef.current, options)
      : createHeroEngine(rootRef.current, options)
    return () => engine.destroy()
  }, [chapters])

  return (
    <section
      ref={rootRef}
      className={chapters ? 'hero hero--chapters' : 'hero'}
      aria-label={copy.heroAria}
    >
      <div className="hero__sticky">
        <div className="hero__stage" data-hero-stage>
          <video
            className="hero__video is-front"
            data-hero-video="0"
            muted
            playsInline
            preload="auto"
            poster="/poster.jpg"
            aria-hidden="true"
          />
          {chapters ? (
            <video
              className="hero__video is-back"
              data-hero-video="1"
              muted
              playsInline
              preload="auto"
              poster="/poster.jpg"
              aria-hidden="true"
            />
          ) : null}
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

        {chapters ? (
          <button
            type="button"
            className="hero__sound"
            data-hero-sound
            aria-pressed="false"
            aria-label={copy.soundPlay}
            data-label-off={copy.soundPlay}
            data-label-on={copy.soundMute}
          >
            <span className="hero__sound-mark" aria-hidden="true">
              <svg
                className="hero__sound-on"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M3.8 9.2v5.6h3.5L12.2 19V5L7.3 9.2H3.8Z"
                  fill="currentColor"
                />
                <path
                  d="M15.4 8.8a4.2 4.2 0 0 1 0 6.4M18 6.6a7.2 7.2 0 0 1 0 10.8"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
              <svg
                className="hero__sound-off"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M3.8 9.2v5.6h3.5L12.2 19V5L7.3 9.2H3.8Z"
                  fill="currentColor"
                />
                <path
                  d="M16 9.2 21 14.8M21 9.2 16 14.8"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="hero__sound-copy">
              <span className="hero__sound-on">ON</span>
              <span className="hero__sound-off">OFF</span>
            </span>
          </button>
        ) : null}

        {chapters ? (
          <div className="hero__dots" aria-hidden="true" data-hero-dots>
            {HERO_CHAPTERS.map((chapter, i) => (
              <span
                key={chapter.id}
                className={i === 0 ? 'hero__dot is-current' : 'hero__dot'}
                data-hero-dot={chapter.id}
              />
            ))}
          </div>
        ) : (
          <div className="hero__rail" aria-hidden="true">
            <div className="hero__rail-track">
              <div className="hero__rail-fill" data-hero-rail-fill />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
