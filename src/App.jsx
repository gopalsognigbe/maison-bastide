import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import Hero from './Hero'
import { detectLang, persistLang, t } from './i18n'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function App() {
  const appRef = useRef(null)
  const cursorRef = useRef(null)
  const langRef = useRef('fr')

  const [lang, setLang] = useState(() => detectLang())
  const [progress, setProgress] = useState(0)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [loaderExiting, setLoaderExiting] = useState(false)
  const bufferPctRef = useRef(0)
  const videoReadyRef = useRef(false)
  const loaderStartedAt = useRef(Date.now())

  const copy = t(lang)
  langRef.current = lang

  useEffect(() => {
    document.documentElement.lang = lang
    persistLang(lang)
  }, [lang])

  useEffect(() => {
    document.documentElement.classList.add('app--loading')
    return () => document.documentElement.classList.remove('app--loading')
  }, [])

  /* Hold the loader 3s; progress always runs 0 → 100 (bean + trait). */
  useEffect(() => {
    const MIN_MS = 3000
    loaderStartedAt.current = Date.now()
    let raf = 0
    let done = false

    const tick = () => {
      if (done) return
      const elapsed = Date.now() - loaderStartedAt.current
      const timePct = Math.min(100, (elapsed / MIN_MS) * 100)

      if (elapsed >= MIN_MS && videoReadyRef.current) {
        done = true
        setProgress(100)
        return
      }

      setProgress(Math.min(99, Math.round(timePct)))
      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)
    return () => {
      done = true
      window.cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (progress < 100 || !loaderVisible || loaderExiting) return
    setLoaderExiting(true)
    document.documentElement.classList.remove('app--loading')
    const timeoutId = window.setTimeout(() => {
      setLoaderVisible(false)
      ScrollTrigger.refresh()
    }, 480)
    return () => window.clearTimeout(timeoutId)
  }, [progress, loaderVisible, loaderExiting])

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches
    if (!finePointer || prefersReducedMotion()) return

    const cursor = cursorRef.current
    const app = appRef.current
    if (!cursor || !app) return

    const labelEl = cursor.querySelector('[data-cursor-label]')
    app.classList.add('app--cursor')
    gsap.set(cursor, { x: -100, y: -100, opacity: 0 })

    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.32, ease: 'power3.out' })
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.32, ease: 'power3.out' })

    const updateCursorLabel = (target) => {
      const node =
        target && target.nodeType === 1
          ? target
          : target?.parentElement || null
      const overHero = Boolean(node?.closest?.('.hero'))
      const hot = Boolean(
        node?.closest?.(
          'a, button, .js-zoom, .metier__text, .origine, .cta__text, .contact__text, h2, h3, p.section-label',
        ),
      )
      const readMode = hot || !overHero
      const labels = t(langRef.current)
      cursor.classList.toggle('is-hot', readMode)
      if (labelEl) {
        labelEl.textContent = readMode ? labels.cursorRead : labels.cursorScroll
      }
    }

    const onMove = (event) => {
      xTo(event.clientX)
      yTo(event.clientY)
      gsap.to(cursor, { opacity: 1, duration: 0.2, overwrite: 'auto' })
      updateCursorLabel(event.target)
    }

    const onLeave = () => {
      gsap.to(cursor, { opacity: 0, duration: 0.15, overwrite: 'auto' })
    }

    const onOver = (event) => {
      updateCursorLabel(event.target)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('mouseover', onOver)
    document.documentElement.addEventListener('mouseleave', onLeave)

    return () => {
      app.classList.remove('app--cursor')
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('mouseover', onOver)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      gsap.killTweensOf(cursor)
    }
  }, [])

  useEffect(() => {
    const motionReduced = prefersReducedMotion()
    if (motionReduced) {
      document.documentElement.classList.add('app--reduced-motion')
    }

    let lenis = null
    let tickerFn = null
    let gsapCtx = null
    let cancelled = false

    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }

    const setup = () => {
      if (cancelled) return

      if (!motionReduced) {
        lenis = new Lenis({
          duration: 1.05,
          smoothWheel: true,
          wheelMultiplier: 0.85,
          touchMultiplier: 1.1,
        })
        lenis.on('scroll', ScrollTrigger.update)
        lenis.scrollTo(0, { immediate: true })
        window.scrollTo(0, 0)

        tickerFn = (time) => {
          lenis?.raf(time * 1000)
        }
        gsap.ticker.add(tickerFn)
        gsap.ticker.lagSmoothing(0)
      }

      gsapCtx = gsap.context(() => {
        if (motionReduced) {
          gsap.set('.reveal, .js-reveal', {
            clearProps: 'all',
            autoAlpha: 1,
            y: 0,
          })
          gsap.set('.js-zoom', { clearProps: 'transform' })
          return
        }

        gsap.utils.toArray('.reveal').forEach((section, index) => {
          const items = section.querySelectorAll('.js-reveal')
          if (!items.length) return
          gsap.set(items, { autoAlpha: 0, y: 28 })
          gsap.to(items, {
            autoAlpha: 1,
            y: 0,
            duration: 0.85,
            ease: 'power3.out',
            stagger: 0.12,
            scrollTrigger: {
              id: `reveal-${index}`,
              trigger: section,
              start: 'top 78%',
              toggleActions: 'play none none none',
              once: true,
            },
          })
        })

        const finePointer = window.matchMedia('(pointer: fine)').matches
        if (finePointer) {
          gsap.utils.toArray('.js-zoom').forEach((el) => {
            const enter = () => {
              gsap.to(el, {
                scale: 1.035,
                duration: 0.55,
                ease: 'power2.out',
                overwrite: 'auto',
              })
            }
            const leave = () => {
              gsap.to(el, {
                scale: 1,
                duration: 0.5,
                ease: 'power2.out',
                overwrite: 'auto',
              })
            }
            el.addEventListener('pointerenter', enter)
            el.addEventListener('pointerleave', leave)
          })
        }
      }, appRef)

      ScrollTrigger.refresh()
    }

    const raf = requestAnimationFrame(setup)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (tickerFn) gsap.ticker.remove(tickerFn)
      gsapCtx?.revert()
      lenis?.destroy()
      document.documentElement.classList.remove('app--reduced-motion')
    }
  }, [])

  const beanFillY = 110 - (110 * progress) / 100
  const toggleLang = () => setLang((prev) => (prev === 'fr' ? 'en' : 'fr'))

  return (
    <div className="app" ref={appRef}>
      <div className="cursor-label" ref={cursorRef} aria-hidden="true">
        <b />
        <span data-cursor-label>{copy.cursorScroll}</span>
      </div>

      {loaderVisible && (
        <div
          className={`loader${loaderExiting ? ' loader--exiting' : ''}`}
          aria-live="polite"
          aria-busy={progress < 100}
        >
          <div className="loader__glow" aria-hidden="true" />
          <div className="loader__stack">
            <svg
              className="loader__bean"
              viewBox="0 0 80 110"
              aria-hidden="true"
            >
              <defs>
                <clipPath id="loaderBeanClip">
                  <path d="M40 6C22 6 10 28 10 55s12 49 30 49 30-22 30-49S58 6 40 6Z" />
                </clipPath>
                <linearGradient
                  id="loaderBeanFill"
                  x1="0"
                  y1="1"
                  x2="0"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#8A4B2A" />
                  <stop offset="55%" stopColor="#A8B98A" />
                  <stop offset="100%" stopColor="#C5D4A8" />
                </linearGradient>
              </defs>
              <path
                d="M40 6C22 6 10 28 10 55s12 49 30 49 30-22 30-49S58 6 40 6Z"
                fill="rgba(237,233,227,0.06)"
                stroke="rgba(237,233,227,0.22)"
                strokeWidth="2"
              />
              <g clipPath="url(#loaderBeanClip)">
                <rect
                  x="0"
                  y={beanFillY}
                  width="80"
                  height="110"
                  fill="url(#loaderBeanFill)"
                />
              </g>
              <path
                d="M40 18C36 38 36 72 40 92"
                fill="none"
                stroke="rgba(20,17,16,0.4)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <p
              className={`loader__brand${progress >= 12 ? ' loader__brand--on' : ''}`}
            >
              {copy.loaderBrand}
            </p>
            <div className="loader__track" aria-hidden="true">
              <div
                className="loader__bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="loader__pct">{progress}%</p>
          </div>
        </div>
      )}

      <a className="skip-link" href="#metier">
        {copy.skipToContent}
      </a>

      <nav className="nav" aria-label={copy.navLabel}>
        <div className="nav__inner">
          <a href="/" className="nav__logo">
            MAISON BASTIDE
          </a>
          <div className="nav__actions">
            <button
              type="button"
              className="nav__lang"
              onClick={toggleLang}
              aria-label={copy.langSwitchAria}
            >
              {copy.langSwitch}
            </button>
            <a href="#cafes" className="nav__cta">
              {copy.navCta}
            </a>
          </div>
        </div>
      </nav>

      <Hero
        key={lang}
        lang={lang}
        onLoadProgress={(pct) => {
          bufferPctRef.current = Math.max(bufferPctRef.current, pct)
        }}
        onReady={() => {
          videoReadyRef.current = true
          bufferPctRef.current = Math.max(bufferPctRef.current, 100)
        }}
      />

      <section className="metier reveal" id="metier">
        <div className="metier__inner">
          <figure className="metier__photo js-zoom js-reveal">
            <img
              src="/stills/metier.jpg"
              alt={copy.metierPhotoAlt}
              width={1600}
              height={1066}
              loading="lazy"
            />
          </figure>
          <p className="section-label js-reveal">{copy.metierLabel}</p>
          <h2 className="metier__title">
            <span className="js-reveal">{copy.metierTitle1}</span>
            <span className="js-reveal">{copy.metierTitle2}</span>
          </h2>
          <p className="metier__text js-reveal">{copy.metierText}</p>
        </div>
      </section>

      <section className="origines reveal" id="cafes">
        <div className="origines__inner">
          <p className="section-label js-reveal">{copy.originesLabel}</p>
          <h2 className="origines__title js-reveal">{copy.originesTitle}</h2>

          <ul className="origines__list">
            {copy.origines.map((item) => (
              <li className="origine js-reveal" key={item.name}>
                <img
                  className="origine__photo js-zoom"
                  src={item.photo}
                  alt={item.photoAlt}
                  width={1600}
                  height={1066}
                  loading="lazy"
                />
                <h3 className="origine__name">{item.name}</h3>
                <p className="origine__note">{item.note}</p>
                <p className="origine__detail">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="cta reveal" id="commander">
        <div className="cta__inner js-zoom">
          <h2 className="cta__title js-reveal">{copy.ctaTitle}</h2>
          <p className="cta__text js-reveal">{copy.ctaText}</p>
          <a href="#contact" className="cta__button js-reveal">
            {copy.ctaButton}
          </a>
        </div>
      </section>

      <section className="contact reveal" id="contact">
        <div className="contact__inner js-zoom">
          <p className="section-label js-reveal">{copy.contactLabel}</p>
          <h2 className="contact__title js-reveal">{copy.contactTitle}</h2>
          <p className="contact__text js-reveal">{copy.contactText}</p>
          <a
            className="cta__button js-reveal"
            href="mailto:bonjour@maisonbastide.fr"
          >
            bonjour@maisonbastide.fr
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__brand">MAISON BASTIDE</p>
          <p className="footer__copy">{copy.footerCopy}</p>
        </div>
      </footer>
    </div>
  )
}
