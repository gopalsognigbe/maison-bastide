import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import './App.css'

gsap.registerPlugin(ScrollTrigger)

const DESKTOP_FRAMES = {
  count: 162,
  poster: '/poster.jpg',
  src: (index) =>
    `/frames/frame-${String(index + 1).padStart(4, '0')}.jpg`,
}

const MOBILE_FRAMES = {
  count: 99,
  poster: '/poster-mobile.jpg',
  src: (index) =>
    `/frames-mobile/frame-${String(index + 1).padStart(4, '0')}.jpg`,
}

/** Narrative beats keyed to desktop frame indices (0-based, sequence = 162).
 *  Bursts fire as the metal paddle crosses the title zone (center) — tuned early
 *  so letters shatter with the blade, not after it.
 */
const HERO_BEATS_DESKTOP = [
  {
    id: '1',
    lines: ['Le café', 'comme un', 'métier d’art'],
    enterFrame: 0,
    burstFrame: 6,
  },
  {
    id: '2',
    lines: ['Torréfié', 'par petites', 'mains, à feu lent'],
    enterFrame: 18,
    burstFrame: 28,
  },
  {
    id: '3',
    lines: ['Des origines', 'choisies,', 'une signature nette'],
    enterFrame: 38,
    burstFrame: 82,
  },
  {
    id: '4',
    lines: ['Chaque lot', 'a son tempo,', 'sa propre chaleur'],
    // Empty beans after T3 wipe — burst as the next paddle enters
    enterFrame: 96,
    burstFrame: 128,
  },
  {
    id: '5',
    lines: ['Parlons de', 'votre prochain', 'café'],
    // After T4 paddle pass
    enterFrame: 142,
    burstFrame: null,
  },
]

function scaleBeats(total) {
  const scale = (total - 1) / (DESKTOP_FRAMES.count - 1)
  return HERO_BEATS_DESKTOP.map((beat) => ({
    ...beat,
    enterFrame: Math.round(beat.enterFrame * scale),
    burstFrame:
      beat.burstFrame == null ? null : Math.round(beat.burstFrame * scale),
  }))
}

function getFrameConfig() {
  const isMobile = window.matchMedia('(max-width: 767px)').matches
  return isMobile ? MOBILE_FRAMES : DESKTOP_FRAMES
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

async function createSyntheticBitmap() {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#141110')
  gradient.addColorStop(0.55, '#2a221c')
  gradient.addColorStop(1, '#8a4b2a')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return createImageBitmap(canvas)
}

function progressToFrameIndex(progress, total) {
  if (total <= 1) return 0
  return Math.round(Math.min(1, Math.max(0, progress)) * (total - 1))
}

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

export default function App() {
  const appRef = useRef(null)
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const heroRef = useRef(null)
  const railFillRef = useRef(null)
  const framesRef = useRef([])
  const frameIndexRef = useRef(0)
  const cursorRef = useRef(null)

  const [progress, setProgress] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [loaderVisible, setLoaderVisible] = useState(true)
  const [loaderExiting, setLoaderExiting] = useState(false)

  useEffect(() => {
    if (progress < 100 || !loaderVisible || loaderExiting) return
    setLoaderExiting(true)
    const timeoutId = window.setTimeout(() => {
      setLoaderVisible(false)
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
      const hot = Boolean(node?.closest?.('a, button'))
      cursor.classList.toggle('is-hot', hot || !overHero)
      if (labelEl) {
        labelEl.textContent = overHero && !hot ? 'Scroll' : 'Lire'
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
    let cancelled = false
    let lenis = null
    let scrollTrigger = null
    let tickerFn = null
    let gsapCtx = null
    let drawRaf = 0
    let pendingFrameIndex = null

    const motionReduced = prefersReducedMotion()
    setReducedMotion(motionReduced)
    const frameConfig = getFrameConfig()
    const beats = scaleBeats(frameConfig.count)
    const beatPhase = Object.fromEntries(beats.map((beat) => [beat.id, 'hidden']))
    /** Extra scale on title enter — blended into continuous camera drift */
    const camera = { zoomPulse: 0 }
    const canvasState = {
      ctx: null,
      cssW: 0,
      cssH: 0,
      dpr: 0,
    }

    const getDrawContext = (canvas) => {
      if (canvasState.ctx) return canvasState.ctx
      canvasState.ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      })
      return canvasState.ctx
    }

    const syncCanvasSize = (canvas) => {
      const isMobile = window.matchMedia('(max-width: 767px)').matches
      const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75)
      const cssW = canvas.clientWidth
      const cssH = canvas.clientHeight
      if (!cssW || !cssH) return false

      if (
        canvasState.cssW !== cssW ||
        canvasState.cssH !== cssH ||
        canvasState.dpr !== dpr
      ) {
        canvasState.cssW = cssW
        canvasState.cssH = cssH
        canvasState.dpr = dpr
        canvas.width = Math.round(cssW * dpr)
        canvas.height = Math.round(cssH * dpr)
        const ctx = getDrawContext(canvas)
        if (!ctx) return false
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = isMobile ? 'low' : 'medium'
      }
      return true
    }

    const drawFrame = (index) => {
      const canvas = canvasRef.current
      const frames = framesRef.current
      if (!canvas || !frames.length) return

      const safeIndex = Math.max(0, Math.min(index, frames.length - 1))
      const frame = frames[safeIndex]
      if (!frame) return
      frameIndexRef.current = safeIndex

      if (!syncCanvasSize(canvas)) return
      const ctx = getDrawContext(canvas)
      if (!ctx) return

      const { cssW, cssH } = canvasState
      const scale = Math.max(cssW / frame.width, cssH / frame.height)
      const drawW = frame.width * scale
      const drawH = frame.height * scale
      const dx = (cssW - drawW) / 2
      const dy = (cssH - drawH) / 2

      // Cover draw fills the viewport — skip clearRect
      ctx.drawImage(frame, dx, dy, drawW, drawH)
    }

    const queueFrameDraw = (index) => {
      pendingFrameIndex = index
      if (drawRaf) return
      drawRaf = window.requestAnimationFrame(() => {
        drawRaf = 0
        const next = pendingFrameIndex
        pendingFrameIndex = null
        if (next == null || next === frameIndexRef.current) return
        drawFrame(next)
      })
    }

    const applyCameraDrift = (timeMs) => {
      const stage = stageRef.current
      if (!stage || motionReduced) return
      // Continuous drift only — never freeze/resume (that caused the stop-jump)
      const t = timeMs / 1000
      const x = Math.sin(t * 0.28) * 8 + Math.sin(t * 0.09) * 4
      const y = Math.cos(t * 0.24) * 6 + Math.cos(t * 0.16) * 3
      const r = Math.sin(t * 0.15) * 0.28
      const base = 1.06 + Math.sin(t * 0.12) * 0.008
      const s = base + camera.zoomPulse * 0.04
      stage.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${s})`
    }

    const pulseTitleZoom = () => {
      if (motionReduced) return
      gsap.killTweensOf(camera)
      gsap.fromTo(
        camera,
        { zoomPulse: 1 },
        {
          zoomPulse: 0,
          duration: 1.2,
          ease: 'power2.out',
          overwrite: true,
        },
      )
    }

    const resizeCanvas = () => {
      canvasState.cssW = 0
      canvasState.cssH = 0
      canvasState.dpr = 0
      drawFrame(frameIndexRef.current)
      if (!motionReduced) ScrollTrigger.refresh()
    }

    const releaseFrames = () => {
      for (const frame of framesRef.current) {
        if (frame && typeof frame.close === 'function') frame.close()
      }
      framesRef.current = []
    }

    const showTextsImmediately = () => {
      gsap.set('.hero__beat', { autoAlpha: 0 })
      gsap.set('.hero__beat[data-beat="5"]', { autoAlpha: 1 })
      gsap.set('.hero__beat-char', {
        clearProps: 'transform,opacity,filter',
      })
      gsap.set('.reveal, .js-reveal', {
        clearProps: 'all',
        autoAlpha: 1,
        y: 0,
      })
      gsap.set('.js-zoom', { clearProps: 'transform' })
      gsap.set('.hero__scroll', { opacity: 0 })
      gsap.set('.hero__tech', { opacity: 0 })
    }

    const resetBeatChars = (beatEl) => {
      const chars = beatEl.querySelectorAll('.hero__beat-char')
      gsap.killTweensOf(chars)
      gsap.set(chars, {
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        filter: 'blur(0px)',
      })
    }

    const hardHideBeat = (beatEl, id) => {
      gsap.killTweensOf(beatEl)
      gsap.killTweensOf(beatEl.querySelectorAll('.hero__beat-char'))
      gsap.set(beatEl, { autoAlpha: 0 })
      resetBeatChars(beatEl)
      beatPhase[id] = 'hidden'
    }

    const hideOthers = (exceptId) => {
      beats.forEach((beat) => {
        if (beat.id === exceptId) return
        const el = heroRef.current?.querySelector(
          `.hero__beat[data-beat="${beat.id}"]`,
        )
        if (!el) return
        hardHideBeat(el, beat.id)
      })
    }

    const showBeat = (beatEl, id) => {
      hideOthers(id)
      resetBeatChars(beatEl)
      pulseTitleZoom()
      gsap.fromTo(
        beatEl,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: 0.4, ease: 'power2.out', overwrite: true },
      )
      gsap.fromTo(
        beatEl.querySelectorAll('.hero__beat-char'),
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.01,
          overwrite: true,
        },
      )
      gsap.fromTo(
        beatEl.querySelector('.hero__beat-rule'),
        { scaleX: 0, transformOrigin: 'left center' },
        { scaleX: 1, duration: 0.55, delay: 0.12, ease: 'power2.out' },
      )
      beatPhase[id] = 'visible'
    }

    const burstBeat = (beatEl, id) => {
      hideOthers(id)
      beatPhase[id] = 'burst'
      const chars = beatEl.querySelectorAll('.hero__beat-char')
      gsap.to(chars, {
        x: () => gsap.utils.random(-window.innerWidth * 0.95, -80),
        y: () => gsap.utils.random(-90, 90),
        rotation: () => gsap.utils.random(-28, 28),
        opacity: 0,
        duration: 0.7,
        ease: 'power2.in',
        stagger: { each: 0.005, from: 'random' },
        overwrite: true,
        onComplete: () => {
          gsap.set(beatEl, { autoAlpha: 0 })
          resetBeatChars(beatEl)
        },
      })
    }

    const desiredPhaseForFrame = (beat, frameIndex) => {
      if (frameIndex < beat.enterFrame) return 'hidden'
      if (beat.burstFrame == null) {
        // Last title: only after the previous paddle wipe
        if (beatPhase['4'] !== 'burst') return 'hidden'
        return 'visible'
      }
      if (frameIndex >= beat.burstFrame) return 'burst'
      return 'visible'
    }

    const syncBeats = (frameIndex) => {
      beats.forEach((beat) => {
        const beatEl = heroRef.current?.querySelector(
          `.hero__beat[data-beat="${beat.id}"]`,
        )
        if (!beatEl) return

        const desired = desiredPhaseForFrame(beat, frameIndex)
        const current = beatPhase[beat.id]

        if (desired === current) return

        if (desired === 'hidden') {
          hardHideBeat(beatEl, beat.id)
          return
        }

        if (desired === 'visible') {
          showBeat(beatEl, beat.id)
          return
        }

        if (desired === 'burst') {
          if (current === 'hidden') {
            // Landed past the burst point while scrubbing fast: skip show, just clear
            hardHideBeat(beatEl, beat.id)
            beatPhase[beat.id] = 'burst'
            return
          }
          if (current === 'visible') {
            burstBeat(beatEl, beat.id)
          }
        }
      })
    }

    const teardownScroll = () => {
      document.documentElement.classList.remove('app--hero-scroll')
      if (drawRaf) {
        window.cancelAnimationFrame(drawRaf)
        drawRaf = 0
      }
      pendingFrameIndex = null
      if (scrollTrigger) {
        scrollTrigger.kill()
        scrollTrigger = null
      }
      if (gsapCtx) {
        gsapCtx.revert()
        gsapCtx = null
      }
      if (tickerFn) {
        gsap.ticker.remove(tickerFn)
        tickerFn = null
      }
      if (lenis) {
        lenis.destroy()
        lenis = null
      }
      gsap.killTweensOf(camera)
      camera.zoomPulse = 0
      canvasState.ctx = null
      canvasState.cssW = 0
      canvasState.cssH = 0
      canvasState.dpr = 0
      if (stageRef.current) {
        stageRef.current.style.transform = ''
      }
      if (railFillRef.current) {
        railFillRef.current.style.transform = 'scaleY(0)'
      }
    }

    const setupScroll = () => {
      if (cancelled || !heroRef.current || !framesRef.current.length) return

      teardownScroll()

      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual'
      }

      lenis = new Lenis({
        duration: 0.95,
        smoothWheel: true,
        wheelMultiplier: 0.92,
        touchMultiplier: 1.05,
      })
      lenis.on('scroll', ScrollTrigger.update)
      lenis.scrollTo(0, { immediate: true })

      tickerFn = (time) => {
        lenis?.raf(time * 1000)
        applyCameraDrift(time * 1000)
      }
      gsap.ticker.add(tickerFn)
      gsap.ticker.lagSmoothing(500, 33)

      gsapCtx = gsap.context(() => {
        gsap.set('.hero__beat', { autoAlpha: 0 })
        gsap.set('.hero__beat-char', {
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
        })

        scrollTrigger = ScrollTrigger.create({
          id: 'hero-frames',
          trigger: heroRef.current,
          start: 'top top',
          end: 'bottom bottom',
          // Tiny lag for smoothness without a visible settle-jump on stop
          scrub: 0.15,
          onToggle: (self) => {
            document.documentElement.classList.toggle(
              'app--hero-scroll',
              self.isActive && !motionReduced,
            )
          },
          onUpdate: (self) => {
            const total = framesRef.current.length
            if (!total) return
            const index = progressToFrameIndex(self.progress, total)
            queueFrameDraw(index)
            syncBeats(index)
            if (railFillRef.current && !motionReduced) {
              railFillRef.current.style.transform = `scaleY(${self.progress})`
            }
          },
        })

        if (!motionReduced) {
          document.documentElement.classList.add('app--hero-scroll')
          if (railFillRef.current) {
            railFillRef.current.style.transform = 'scaleY(0)'
          }
        }

        // Title 1 on first frame immediately
        syncBeats(0)
        drawFrame(0)

        gsap.to('.hero__scroll', {
          opacity: 0,
          ease: 'none',
          scrollTrigger: {
            id: 'hero-scroll-hint',
            trigger: heroRef.current,
            start: 'top top',
            end: () => {
              const hero = heroRef.current
              const distance = Math.max(
                hero.offsetHeight - window.innerHeight,
                1,
              )
              return `+=${distance * 0.06}`
            },
            scrub: true,
          },
        })

        gsap.to('.hero__tech', {
          opacity: 0,
          y: -12,
          ease: 'none',
          scrollTrigger: {
            id: 'hero-tech-fade',
            trigger: heroRef.current,
            start: 'top top',
            end: () => {
              const hero = heroRef.current
              const distance = Math.max(
                hero.offsetHeight - window.innerHeight,
                1,
              )
              return `+=${distance * 0.12}`
            },
            scrub: true,
          },
        })

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

      if (import.meta.env.DEV) {
        window.__maisonScrollDebug = {
          triggerCount: () => ScrollTrigger.getAll().length,
          frameIndex: () => frameIndexRef.current,
          frameCount: () => framesRef.current.length,
          beatPhase: () => ({ ...beatPhase }),
          beats: () => beats,
        }
      }
    }

    const loadStaticMiddleFrame = async () => {
      const middleIndex = Math.floor((frameConfig.count - 1) / 2)
      let bitmap
      try {
        const img = await loadImage(frameConfig.poster)
        bitmap = await createImageBitmap(img)
      } catch {
        try {
          const img = await loadImage(frameConfig.src(middleIndex))
          bitmap = await createImageBitmap(img)
        } catch {
          bitmap = await createSyntheticBitmap()
        }
      }
      if (cancelled) {
        bitmap.close()
        return false
      }
      releaseFrames()
      framesRef.current = [bitmap]
      drawFrame(0)
      showTextsImmediately()
      setProgress(100)
      return true
    }

    const extractFrames = async () => {
      const bitmaps = []
      const total = frameConfig.count

      for (let i = 0; i < total; i++) {
        if (cancelled) break
        const img = await loadImage(frameConfig.src(i))
        if (cancelled) break
        const bitmap = await createImageBitmap(img)
        bitmaps.push(bitmap)
        setProgress(Math.round(((i + 1) / total) * 100))
      }

      if (cancelled) {
        for (const bitmap of bitmaps) bitmap.close()
        return false
      }

      if (!bitmaps.length) throw new Error('No frames loaded')

      releaseFrames()
      framesRef.current = bitmaps
      drawFrame(0)
      setProgress(100)
      return true
    }

    const run = async () => {
      try {
        if (motionReduced) {
          await loadStaticMiddleFrame()
          return
        }
        const ok = await extractFrames()
        if (ok && !cancelled) setupScroll()
      } catch (error) {
        console.warn('Frame extraction failed, using static fallback.', error)
        if (cancelled) return
        try {
          await loadStaticMiddleFrame()
        } catch (fallbackError) {
          console.error('Fallback frame failed.', fallbackError)
          if (!cancelled) {
            showTextsImmediately()
            setProgress(100)
          }
        }
      }
    }

    window.addEventListener('resize', resizeCanvas)
    run()

    return () => {
      cancelled = true
      window.removeEventListener('resize', resizeCanvas)
      teardownScroll()
      releaseFrames()
    }
  }, [])

  const beanFillY = 110 - (110 * progress) / 100

  return (
    <div
      className={`app${reducedMotion ? ' app--reduced-motion' : ''}`}
      ref={appRef}
    >
      <div className="cursor-label" ref={cursorRef} aria-hidden="true">
        <b />
        <span data-cursor-label>Scroll</span>
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
              Maison Bastide
            </p>
            <p className="loader__pct">{progress}%</p>
          </div>
        </div>
      )}

      <nav className="nav" aria-label="Navigation principale">
        <div className="nav__inner">
          <a href="/" className="nav__logo">
            MAISON BASTIDE
          </a>
          <a href="#cafes" className="nav__cta">
            Nos cafés
          </a>
        </div>
      </nav>

      <section ref={heroRef} className="hero" aria-label="Héros">
        <div className="hero__sticky">
          <div className="hero__stage" ref={stageRef}>
            <canvas
              ref={canvasRef}
              className="hero__canvas"
              aria-hidden="true"
            />
          </div>
          <div className="hero__gradient" aria-hidden="true" />

          <h1 className="sr-only">
            Maison Bastide — Le café comme un métier d’art. Parlons de votre
            prochain café.
          </h1>

          <div className="hero__beats" aria-hidden="true">
            {HERO_BEATS_DESKTOP.map((beat) => (
              <p
                key={beat.id}
                className="hero__beat"
                data-beat={beat.id}
              >
                <BeatLines lines={beat.lines} />
              </p>
            ))}
          </div>

          <div className="hero__tech">
            <span className="hero__tech-line">
              <span>HUILA · COLOMBIE</span>
            </span>
            <span className="hero__tech-line">
              <span>1750 M · LAVÉ · CATURRA</span>
            </span>
          </div>

          <p className="hero__scroll">FAITES DÉFILER</p>

          {!reducedMotion && (
            <div className="hero__rail" aria-hidden="true">
              <div className="hero__rail-track">
                <div className="hero__rail-fill" ref={railFillRef} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="metier reveal" id="metier">
        <div className="metier__inner js-zoom">
          <p className="section-label js-reveal">Le métier</p>
          <h2 className="metier__title">
            <span className="js-reveal">Une torréfaction lente,</span>
            <span className="js-reveal">au service du grain</span>
          </h2>
          <p className="metier__text js-reveal">
            Maison Bastide sélectionne des cafés de terroir, les torréfie par
            petits lots et les livre à leur pic aromatique. Chaque origine est
            traitée pour révéler sa signature — jamais pour la masquer.
          </p>
        </div>
      </section>

      <section className="origines reveal" id="cafes">
        <div className="origines__inner">
          <p className="section-label js-reveal">Origines</p>
          <h2 className="origines__title js-reveal">
            Trois terroirs, trois signatures
          </h2>

          <ul className="origines__list">
            <li className="origine js-reveal js-zoom">
              <h3 className="origine__name">Huila, Colombie</h3>
              <p className="origine__note">Fruits rouges, sucre roux</p>
              <p className="origine__detail">1750 M · LAVÉ · CATURRA</p>
            </li>
            <li className="origine js-reveal js-zoom">
              <h3 className="origine__name">Yirgacheffe, Éthiopie</h3>
              <p className="origine__note">Bergamote, thé noir</p>
              <p className="origine__detail">2000 M · NATUREL · HEIRLOOM</p>
            </li>
            <li className="origine js-reveal js-zoom">
              <h3 className="origine__name">Nariño, Colombie</h3>
              <p className="origine__note">Cacao, noisette</p>
              <p className="origine__detail">1900 M · HONEY · CASTILLO</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="cta reveal" id="commander">
        <div className="cta__inner js-zoom">
          <h2 className="cta__title js-reveal">Goûtez la prochaine récolte</h2>
          <p className="cta__text js-reveal">
            Abonnez-vous à la sélection saisonnière et recevez chaque mois un
            café fraîchement torréfié, avec sa fiche de dégustation.
          </p>
          <a href="#contact" className="cta__button js-reveal">
            Nous contacter
          </a>
        </div>
      </section>

      <section className="contact reveal" id="contact">
        <div className="contact__inner js-zoom">
          <p className="section-label js-reveal">Contact</p>
          <h2 className="contact__title js-reveal">
            Parlons de votre prochain café
          </h2>
          <p className="contact__text js-reveal">
            Commande, collaboration, torréfaction sur mesure — écrivez-nous.
          </p>
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
          <p className="footer__copy">
            Torréfaction artisanale · Depuis 2014
          </p>
        </div>
      </footer>
    </div>
  )
}
