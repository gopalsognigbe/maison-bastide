import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/** Narrative beats as 0→1 progress along the hero scrub runway.
 *  Rule: one paddle sweep (balayage) → one title wipe. Never hold a title
 *  across two paddle passes (T3 used to span ~38→82 — that was the bug).
 *  Copy lines come from i18n — timing only here. */
const FRAME_SPAN = 161

export const HERO_BEAT_TIMING = [
  {
    id: '1',
    enter: 0 / FRAME_SPAN,
    exitStart: 4 / FRAME_SPAN,
    exitEnd: 16 / FRAME_SPAN,
  },
  {
    id: '2',
    enter: 16 / FRAME_SPAN,
    exitStart: 26 / FRAME_SPAN,
    exitEnd: 36 / FRAME_SPAN,
  },
  {
    id: '3',
    enter: 36 / FRAME_SPAN,
    exitStart: 48 / FRAME_SPAN,
    exitEnd: 62 / FRAME_SPAN,
  },
  {
    id: '4',
    enter: 62 / FRAME_SPAN,
    exitStart: 72 / FRAME_SPAN,
    exitEnd: 84 / FRAME_SPAN,
  },
  {
    id: '5',
    enter: 84 / FRAME_SPAN,
    exitStart: null,
    exitEnd: null,
  },
]

/** @deprecated use HERO_BEAT_TIMING + i18n beats */
export const HERO_BEATS = HERO_BEAT_TIMING

/**
 * T5 enters at video ~52%. Without remapping, ~half the runway remains after
 * it — several wheel flicks before #metier. Map story→T5 onto most of the
 * scroll; leave a short tail for the rest of the clip + section handoff.
 */
const STORY_END_VIDEO = 84 / FRAME_SPAN
const STORY_END_SCROLL = 0.9

function mapScrollToVideo(scrollProgress) {
  const p = clamp01(scrollProgress)
  if (p <= STORY_END_SCROLL) {
    return (p / STORY_END_SCROLL) * STORY_END_VIDEO
  }
  const t = (p - STORY_END_SCROLL) / (1 - STORY_END_SCROLL)
  return STORY_END_VIDEO + t * (1 - STORY_END_VIDEO)
}

const SEEK_EPS = 1 / 30

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isMobileHero() {
  return window.matchMedia('(max-width: 767px)').matches
}

/**
 * Terminal-style hero: scroll progress → video.currentTime.
 * No React state in the engine. Call destroy() on unmount.
 * options.onProgress(0–100) / options.onReady() for the loader.
 */
export function createHeroEngine(root, options = {}) {
  if (!root) return { destroy() {} }

  const { onProgress, onReady } = options
  const video = root.querySelector('[data-hero-video]')
  const stage = root.querySelector('[data-hero-stage]')
  const railFill = root.querySelector('[data-hero-rail-fill]')
  const scrollHint = root.querySelector('[data-hero-scroll]')

  if (!video) return { destroy() {} }

  const motionReduced = prefersReducedMotion()
  const mobile = isMobileHero()
  const camera = { zoomPulse: 0 }
  const beatEls = Object.fromEntries(
    HERO_BEATS.map((beat) => [
      beat.id,
      root.querySelector(`.hero__beat[data-beat="${beat.id}"]`),
    ]),
  )
  const beatChars = Object.fromEntries(
    HERO_BEATS.map((beat) => {
      const el = beatEls[beat.id]
      return [beat.id, el ? [...el.querySelectorAll('.hero__beat-char')] : []]
    }),
  )
  const beatRules = Object.fromEntries(
    HERO_BEATS.map((beat) => {
      const el = beatEls[beat.id]
      return [beat.id, el?.querySelector('.hero__beat-rule') || null]
    }),
  )
  /** Last scrub phase per beat — for enter pulse only */
  const beatPhase = Object.fromEntries(HERO_BEATS.map((b) => [b.id, 'hidden']))

  let scrubTrigger = null
  let gsapCtx = null
  let tickerFn = null
  let targetTime = 0
  let seekRaf = 0
  let lastProgress = 0
  let duration = 0
  let destroyed = false
  let loadPct = 0
  let loadDone = false
  let loadPoll = 0
  let loadSafety = 0

  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.pause()

  const bufferRatio = () => {
    if (!video.duration || !Number.isFinite(video.duration)) return 0
    try {
      if (!video.buffered.length) return 0
      return Math.min(
        1,
        video.buffered.end(video.buffered.length - 1) / video.duration,
      )
    } catch {
      return 0
    }
  }

  const READY_RATIO = mobile ? 0.5 : 0.55

  const finishLoad = () => {
    if (loadDone || destroyed) return
    loadDone = true
    loadPct = 100
    onProgress?.(100)
    if (loadPoll) {
      window.clearInterval(loadPoll)
      loadPoll = 0
    }
    if (loadSafety) {
      window.clearTimeout(loadSafety)
      loadSafety = 0
    }
    onReady?.()
  }

  const tickLoad = () => {
    if (loadDone || destroyed) return
    const ratio = bufferRatio()
    const fromReady = video.readyState >= 2 ? 0.08 : 0
    const next = Math.max(
      loadPct,
      Math.min(99, Math.round((ratio * 0.92 + fromReady) * 100)),
    )
    if (next !== loadPct) {
      loadPct = next
      onProgress?.(loadPct)
    }
    if (ratio >= READY_RATIO || video.readyState >= 4) {
      finishLoad()
    }
  }

  const startLoadWatch = () => {
    onProgress?.(2)
    tickLoad()
    loadPoll = window.setInterval(tickLoad, 120)
    loadSafety = window.setTimeout(() => finishLoad(), mobile ? 10000 : 14000)
  }

  const updateRail = (progress) => {
    if (!railFill || motionReduced) return
    railFill.style.transform = `scaleY(${Math.min(1, Math.max(0, progress))})`
  }

  const resetChars = (chars) => {
    if (!chars.length) return
    gsap.set(chars, {
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      filter: 'blur(0px)',
    })
  }

  const pulseTitleZoom = () => {
    if (motionReduced || mobile) return
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

  /** Wipe driven by t∈[0,1] — scrubbable both ways with the paddle. */
  const applyWipe = (chars, rule, t) => {
    const n = Math.max(chars.length - 1, 1)
    chars.forEach((char, i) => {
      /* Paddle enters from the right → letters peel right→left */
      const fromRight = (n - i) / n
      const local = clamp01((t - fromRight * 0.32) / 0.68)
      const e = local * local
      gsap.set(char, {
        x: -e * window.innerWidth * 0.9,
        y: ((i % 2 === 0 ? -1 : 1) * 36 + (i % 3) * 8) * e,
        rotation: -18 * e,
        opacity: 1 - e,
        filter: `blur(${e * 2.5}px)`,
      })
    })
    if (rule) {
      gsap.set(rule, {
        scaleX: 1 - t,
        transformOrigin: 'left center',
        opacity: 1 - t,
      })
    }
  }

  const hideBeat = (id) => {
    const el = beatEls[id]
    if (!el) return
    gsap.set(el, { autoAlpha: 0 })
    resetChars(beatChars[id])
    const rule = beatRules[id]
    if (rule) gsap.set(rule, { scaleX: 1, opacity: 1 })
  }

  const renderBeat = (beat, progress) => {
    const el = beatEls[beat.id]
    if (!el) return 'hidden'
    const chars = beatChars[beat.id]
    const rule = beatRules[beat.id]

    if (progress < beat.enter) {
      hideBeat(beat.id)
      return 'hidden'
    }

    /* Final CTA: appears once title 4 has fully wiped */
    if (beat.exitStart == null) {
      const prev = HERO_BEATS[HERO_BEATS.length - 2]
      if (!prev || progress < prev.exitEnd) {
        hideBeat(beat.id)
        return 'hidden'
      }
      gsap.set(el, { autoAlpha: 1 })
      resetChars(chars)
      if (rule) gsap.set(rule, { scaleX: 1, opacity: 1 })
      return 'visible'
    }

    if (progress >= beat.exitEnd) {
      hideBeat(beat.id)
      return 'gone'
    }

    /* Hold until wipe — enter is a hard cut so scrollY=0 shows title 1 */
    if (progress < beat.exitStart) {
      gsap.set(el, { autoAlpha: 1 })
      resetChars(chars)
      if (rule) gsap.set(rule, { scaleX: 1, opacity: 1 })
      return 'visible'
    }

    const t = clamp01(
      (progress - beat.exitStart) / (beat.exitEnd - beat.exitStart),
    )
    gsap.set(el, { autoAlpha: 1 })
    applyWipe(chars, rule, t)
    return 'exiting'
  }

  const syncBeats = (progress) => {
    HERO_BEATS.forEach((beat) => {
      const next = renderBeat(beat, progress)
      const prev = beatPhase[beat.id]
      if (next === 'visible' && (prev === 'hidden' || prev === 'gone')) {
        pulseTitleZoom()
      }
      beatPhase[beat.id] = next
    })
  }

  const flushSeek = () => {
    seekRaf = 0
    if (destroyed || !duration) return
    const next = Math.min(Math.max(targetTime, 0), duration - 0.001)
    if (Math.abs(video.currentTime - next) < SEEK_EPS) return
    try {
      video.currentTime = next
    } catch {
      /* ignore mid-load seek */
    }
  }

  const scrubTo = (progress) => {
    lastProgress = progress
    const videoProgress = mapScrollToVideo(progress)
    updateRail(videoProgress)
    syncBeats(videoProgress)

    if (scrollHint) {
      scrollHint.style.opacity = progress > 0.04 ? '0' : ''
    }

    if (!duration || motionReduced) return
    targetTime = videoProgress * duration
    if (!seekRaf) seekRaf = requestAnimationFrame(flushSeek)
  }

  const applyCameraDrift = (timeMs) => {
    if (!stage || motionReduced || mobile) return
    const t = timeMs / 1000
    const x = Math.sin(t * 0.28) * 4 + Math.sin(t * 0.09) * 2
    const y = Math.cos(t * 0.24) * 4 + Math.cos(t * 0.16) * 2
    const r = Math.sin(t * 0.15) * 0.18
    const base = 1.02 + Math.sin(t * 0.12) * 0.004
    const s = base + camera.zoomPulse * 0.025
    stage.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${s})`
  }

  const bindSources = () => {
    const mobile = isMobileHero()
    const src = mobile
      ? '/video/hero-mobile-scrub.mp4'
      : '/video/hero-scrub.mp4'
    const poster = mobile ? '/poster-mobile.jpg' : '/poster.jpg'
    if (video.dataset.boundSrc === src) return
    video.dataset.boundSrc = src
    video.poster = poster
    video.src = src
    video.load()
  }

  const onMeta = () => {
    duration = video.duration || 0
    video.pause()
    scrubTo(lastProgress)
  }

  const setupReduced = () => {
    root.classList.add('hero--reduced')
    gsap.set('.hero__beat', { autoAlpha: 0 })
    gsap.set('.hero__beat[data-beat="5"]', { autoAlpha: 1 })
    if (scrollHint) gsap.set(scrollHint, { opacity: 0 })
    updateRail(1)
  }

  const setupScrub = () => {
    scrubTrigger = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: 'bottom bottom',
      scrub: mobile ? 0.55 : 0.4,
      onUpdate: (self) => scrubTo(self.progress),
    })
  }

  bindSources()
  video.addEventListener('loadedmetadata', onMeta)
  video.addEventListener('progress', tickLoad)
  video.addEventListener('canplay', tickLoad)
  video.addEventListener('canplaythrough', finishLoad)
  startLoadWatch()

  gsapCtx = gsap.context(() => {
    gsap.set('.hero__beat', { autoAlpha: 0 })
    gsap.set('.hero__beat-char', {
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
    })

    if (motionReduced) {
      setupReduced()
      finishLoad()
    } else {
      document.documentElement.classList.add('app--hero-scroll')
      setupScrub()
      scrubTo(0)
      if (!mobile) {
        tickerFn = (time) => applyCameraDrift(time * 1000)
        gsap.ticker.add(tickerFn)
        gsap.ticker.lagSmoothing(0)
      }
    }
  }, root)

  const onResize = () => {
    const prev = video.dataset.boundSrc
    bindSources()
    if (video.dataset.boundSrc !== prev) {
      duration = 0
    }
    ScrollTrigger.refresh()
  }

  window.addEventListener('resize', onResize)

  if (import.meta.env.DEV) {
    window.__maisonHeroDebug = {
      progress: () => lastProgress,
      time: () => video.currentTime,
      duration: () => duration,
      beatPhase: () => ({ ...beatPhase }),
      scrubTo,
    }
  }

  return {
    destroy() {
      destroyed = true
      window.removeEventListener('resize', onResize)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('progress', tickLoad)
      video.removeEventListener('canplay', tickLoad)
      video.removeEventListener('canplaythrough', finishLoad)
      if (loadPoll) window.clearInterval(loadPoll)
      if (loadSafety) window.clearTimeout(loadSafety)
      if (seekRaf) cancelAnimationFrame(seekRaf)
      seekRaf = 0
      scrubTrigger?.kill()
      scrubTrigger = null
      if (tickerFn) gsap.ticker.remove(tickerFn)
      tickerFn = null
      gsapCtx?.revert()
      gsapCtx = null
      video.pause()
      if (stage) stage.style.transform = ''
      document.documentElement.classList.remove('app--hero-scroll')
      if (import.meta.env.DEV && window.__maisonHeroDebug) {
        delete window.__maisonHeroDebug
      }
    },
  }
}
