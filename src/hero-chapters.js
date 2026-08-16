import gsap from 'gsap'

/**
 * Chapter hero: one gesture plays one clip (`play()`).
 * Reverse plays the same clip backward (pre-rendered *-rev.mp4),
 * never negative playbackRate, never seek mid-GOP.
 *
 * idle  --down--> playing --ended--> ended (freeze + titre suivant)
 * ended --down--> next clip play
 * S4 ended --> T5 --> done (scroll bas = #metier, scroll haut = T4)
 * ended --up----> reversing (current clip back) --ended--> idle (first frame)
 * idle(i>0) --up--> reversing previous clip from its last frame
 *
 * Fallback Terminal scrub: ?scrub=1
 */

export const WIPE_DURATION = 0.8

export const HERO_CHAPTERS = [
  {
    id: '1',
    src: '/video/chapters/s1.mp4',
    rev: '/video/chapters/s1-rev.mp4',
    paddleCue: 0.309,
    revSfxAt: 0.131,
  },
  {
    id: '2',
    src: '/video/chapters/s2.mp4',
    rev: '/video/chapters/s2-rev.mp4',
    paddleCue: 0.772,
    revSfxAt: 0,
  },
  {
    id: '3',
    src: '/video/chapters/s3.mp4',
    rev: '/video/chapters/s3-rev.mp4',
    paddleCue: 0.928,
    revSfxAt: 0.312,
  },
  {
    id: '4',
    src: '/video/chapters/s4.mp4',
    rev: '/video/chapters/s4-rev.mp4',
    paddleCue: 0.773,
    revSfxAt: 0.147,
  },
  {
    id: '5',
    src: '/video/chapters/s5.mp4',
    rev: '/video/chapters/s5-rev.mp4',
    paddleCue: null,
  },
]

export function isChapterHero() {
  try {
    const query = new URLSearchParams(window.location.search)
    if (query.get('scrub') === '1') return false
    if (query.get('chapters') === '0') return false
    return true
  } catch {
    return true
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isMobileHero() {
  return window.matchMedia('(max-width: 767px)').matches
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function syncLenisLock(locked) {
  const lenis = window.__maisonLenis
  if (!lenis) return
  if (locked) lenis.stop()
  else lenis.start()
}

export function createHeroChapters(root, options = {}) {
  if (!root) return { destroy() {} }

  const { onProgress, onReady } = options
  const videos = [...root.querySelectorAll('[data-hero-video]')]
  const stage = root.querySelector('[data-hero-stage]')
  const scrollHint = root.querySelector('[data-hero-scroll]')
  const dots = [...root.querySelectorAll('[data-hero-dot]')]
  const soundBtn = root.querySelector('[data-hero-sound]')

  if (videos.length < 2) return { destroy() {} }

  const motionReduced = prefersReducedMotion()
  const mobile = isMobileHero()
  const lastIndex = HERO_CHAPTERS.length - 1
  const camera = { zoomPulse: 0 }

  const beatEls = Object.fromEntries(
    HERO_CHAPTERS.map((chapter) => [
      chapter.id,
      root.querySelector(`.hero__beat[data-beat="${chapter.id}"]`),
    ]),
  )
  const beatChars = Object.fromEntries(
    HERO_CHAPTERS.map((chapter) => {
      const el = beatEls[chapter.id]
      return [
        chapter.id,
        el ? [...el.querySelectorAll('.hero__beat-char')] : [],
      ]
    }),
  )
  const beatRules = Object.fromEntries(
    HERO_CHAPTERS.map((chapter) => {
      const el = beatEls[chapter.id]
      return [chapter.id, el?.querySelector('.hero__beat-rule') || null]
    }),
  )

  let index = 0
  /** idle | playing | ended | reversing | done */
  let phase = 'idle'
  let front = 0
  let soundOn = false
  let destroyed = false
  let loadDone = false
  let loadPct = 0
  let loadPoll = 0
  let loadSafety = 0
  let gsapCtx = null
  let tickerFn = null
  let rvfcId = 0
  let rafId = 0
  let touchStartY = 0
  let wheelQuiet = true
  let quietTimer = 0
  let lastDir = 0
  let navBusy = false
  let navGen = 0
  let ignoreEnded = false
  let audioCtx = null
  let sfxBytes = null
  let sfxBuffer = null
  let reverseSfxSource = null
  const bound = new WeakMap()

  root.classList.add('hero--chapters')

  const frontVideo = () => videos[front]
  const backVideo = () => videos[front ^ 1]
  const chapterAt = (i) => HERO_CHAPTERS[i]
  const busy = () =>
    phase === 'playing' || phase === 'reversing' || navBusy

  const prepareVideo = (video) => {
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.pause()
  }

  videos.forEach(prepareVideo)

  const setFront = (slot) => {
    front = slot
    videos.forEach((video, i) => {
      video.classList.toggle('is-front', i === slot)
      video.classList.toggle('is-back', i !== slot)
    })
  }

  const bindSrc = (video, src) => {
    const already =
      bound.get(video) === src &&
      video.readyState >= 2 &&
      (video.currentSrc || '').includes(src)
    if (already) return false
    bound.set(video, src)
    video.src = src
    video.load()
    return true
  }

  const nearStart = (video) => (video.currentTime || 0) <= 0.08

  const nearEnd = (video) => {
    const duration = video.duration
    if (!Number.isFinite(duration) || duration < 0.2) return false
    return (video.currentTime || 0) > duration - 0.12
  }

  const seekToZero = (video, fn) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener('seeked', onSeeked)
      fn()
    }
    const onSeeked = () => {
      if (nearEnd(video)) {
        try {
          video.currentTime = 0
        } catch {
          finish()
          return
        }
        window.setTimeout(finish, 50)
        return
      }
      finish()
    }
    video.pause()
    video.addEventListener('seeked', onSeeked, { once: true })
    try {
      /* Force a real seek even if currentTime already reads 0 (browser resume). */
      video.currentTime = nearStart(video) ? 0.04 : 0
      video.currentTime = 0
    } catch {
      finish()
      return
    }
    window.setTimeout(finish, 320)
  }

  const prepareBack = (src, { muted = false } = {}) =>
    new Promise((resolve) => {
      const video = backVideo()
      if (muted) video.muted = true
      const afterLoad = () => seekToZero(video, () => resolve(video))
      const already =
        bound.get(video) === src &&
        video.readyState >= 2 &&
        (video.currentSrc || '').includes(src)
      if (already) {
        afterLoad()
        return
      }
      bound.set(video, src)
      video.addEventListener('loadeddata', afterLoad, { once: true })
      video.src = src
      video.load()
    })

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

  const applyWipe = (chars, rule, t) => {
    const n = Math.max(chars.length - 1, 1)
    chars.forEach((char, i) => {
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

  const showOnlyBeat = (id) => {
    HERO_CHAPTERS.forEach((chapter) => {
      if (chapter.id !== id) hideBeat(chapter.id)
    })
    const el = beatEls[id]
    if (el) gsap.set(el, { autoAlpha: 1 })
  }

  const paintTitle = (chapterIndex, origTime) => {
    const chapter = chapterAt(chapterIndex)
    const el = beatEls[chapter.id]
    if (!el) return
    gsap.set(el, { autoAlpha: 1 })
    const chars = beatChars[chapter.id]
    const rule = beatRules[chapter.id]
    if (chapter.paddleCue == null || origTime <= chapter.paddleCue) {
      resetChars(chars)
      if (rule) gsap.set(rule, { scaleX: 1, opacity: 1 })
      return
    }
    applyWipe(
      chars,
      rule,
      clamp01((origTime - chapter.paddleCue) / WIPE_DURATION),
    )
  }

  const armReverseTitle = () => {
    const chapter = chapterAt(index)
    showOnlyBeat(chapter.id)
    if (chapter.paddleCue == null) {
      paintTitle(index, 0)
      return
    }
    paintTitle(index, chapter.paddleCue + WIPE_DURATION)
  }

  const syncTitle = (origTime) => paintTitle(index, origTime)

  const revealNextTitle = () => {
    const next = Math.min(index + 1, lastIndex)
    showOnlyBeat(chapterAt(next).id)
    paintTitle(next, 0)
    pulseTitleZoom()
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

  const origProgress = (video, reversing) => {
    const duration = video.duration || 1
    const t = video.currentTime || 0
    const orig = reversing ? Math.max(0, duration - t) : t
    return { orig, duration }
  }

  const updateDots = (active, { complete = false } = {}) => {
    dots.forEach((dot, i) => {
      if (complete) {
        dot.classList.add('is-done')
        dot.classList.toggle('is-current', i === lastIndex)
        return
      }
      dot.classList.toggle('is-done', i < active)
      dot.classList.toggle('is-current', i === active)
    })
  }

  const setPageLock = (locked) => {
    document.documentElement.classList.toggle('app--hero-lock', locked)
    syncLenisLock(locked)
  }

  const decodePaddleSfx = () => {
    if (!audioCtx || !sfxBytes || sfxBuffer) return
    audioCtx.decodeAudioData(sfxBytes.slice(0)).then((buf) => {
      sfxBuffer = buf
    }).catch(() => {})
  }

  const stopReverseSfx = () => {
    try {
      reverseSfxSource?.stop()
    } catch {
      /* already stopped */
    }
    reverseSfxSource = null
  }

  const cueReverseSfx = (chapter) => {
    stopReverseSfx()
    if (!soundOn || chapter.revSfxAt == null) return
    audioCtx?.resume?.()
    const start = () => {
      if (destroyed || !audioCtx || !sfxBuffer) return
      const src = audioCtx.createBufferSource()
      src.buffer = sfxBuffer
      src.connect(audioCtx.destination)
      src.start(audioCtx.currentTime + Math.max(0, chapter.revSfxAt))
      reverseSfxSource = src
    }
    if (sfxBuffer && audioCtx) {
      start()
      return
    }
    if (audioCtx && sfxBytes) {
      audioCtx.decodeAudioData(sfxBytes.slice(0)).then((buf) => {
        sfxBuffer = buf
        start()
      }).catch(() => {})
    }
  }

  const applySound = () => {
    videos.forEach((video) => {
      video.muted = !soundOn
      video.volume = 1
    })
    if (!soundOn) stopReverseSfx()
    if (!soundBtn) return
    soundBtn.classList.toggle('is-on', soundOn)
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false')
    const label = soundOn
      ? soundBtn.getAttribute('data-label-on')
      : soundBtn.getAttribute('data-label-off')
    if (label) soundBtn.setAttribute('aria-label', label)
  }

  const unlockAudio = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx && !audioCtx) audioCtx = new Ctx()
    audioCtx?.resume?.()
    decodePaddleSfx()
    applySound()
  }

  const armSound = () => {
    if (soundOn || destroyed) return
    soundOn = true
    unlockAudio()
  }

  const onSoundToggle = (event) => {
    event.preventDefault()
    event.stopPropagation()
    soundOn = !soundOn
    if (soundOn) unlockAudio()
    else applySound()
  }

  const onSitePointer = (event) => {
    if (event.target.closest?.('[data-hero-sound]')) return
    armSound()
  }

  fetch('/sfx/beans-paddle.wav')
    .then((res) => res.arrayBuffer())
    .then((bytes) => {
      sfxBytes = bytes
      decodePaddleSfx()
    })
    .catch(() => {})

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

  const bufferRatio = (video) => {
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

  const tickLoad = () => {
    if (loadDone || destroyed) return
    const video = videos[0]
    const ratio = bufferRatio(video)
    const fromReady = video.readyState >= 2 ? 0.1 : 0
    const next = Math.max(
      loadPct,
      Math.min(99, Math.round((ratio * 0.9 + fromReady) * 100)),
    )
    if (next !== loadPct) {
      loadPct = next
      onProgress?.(loadPct)
    }
    if (ratio >= 0.55 || video.readyState >= 3) finishLoad()
  }

  const cancelFrameWatch = (video) => {
    if (rvfcId && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(rvfcId)
    }
    rvfcId = 0
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  const watchFrames = (video, reversing) => {
    cancelFrameWatch(video)
    const tick = (mediaTime) => {
      if (destroyed) return
      if (reversing && phase !== 'reversing') return
      if (!reversing && phase !== 'playing') return
      const duration = video.duration || 1
      const t = Number.isFinite(mediaTime) ? mediaTime : video.currentTime
      const orig = reversing ? Math.max(0, duration - t) : t
      syncTitle(orig)
    }

    if (video.requestVideoFrameCallback) {
      const onFrame = (_now, meta) => {
        if (destroyed) return
        if (reversing && phase !== 'reversing') return
        if (!reversing && phase !== 'playing') return
        tick(meta?.mediaTime)
        rvfcId = video.requestVideoFrameCallback(onFrame)
      }
      rvfcId = video.requestVideoFrameCallback(onFrame)
      return
    }

    const loop = () => {
      if (destroyed) return
      if (reversing && phase !== 'reversing') return
      if (!reversing && phase !== 'playing') return
      tick(video.currentTime)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
  }

  const preloadBack = (nextIndex, { reverse = false } = {}) => {
    if (nextIndex < 0 || nextIndex > lastIndex) return
    const chapter = chapterAt(nextIndex)
    prepareBack(reverse ? chapter.rev : chapter.src, { muted: reverse })
  }

  const pageScrollY = () => {
    const lenis = window.__maisonLenis
    if (lenis && Number.isFinite(lenis.scroll)) return lenis.scroll
    return window.scrollY || document.documentElement.scrollTop || 0
  }

  const atPageTop = () => pageScrollY() <= 2

  const armAfterQuiet = () => {
    window.clearTimeout(quietTimer)
    quietTimer = window.setTimeout(() => {
      wheelQuiet = true
    }, 240)
  }

  const settleIdle = (atStart) => {
    navBusy = false
    phase = atStart ? 'idle' : 'ended'
    /* Same-direction leftover scroll is ignored; opposite direction is a new gesture. */
    wheelQuiet = false
    armAfterQuiet()
    if (scrollHint) {
      scrollHint.style.opacity = atStart && index === 0 ? '' : '0'
    }
  }

  const finishStory = () => {
    phase = 'done'
    navBusy = false
    index = Math.max(0, lastIndex - 1)
    cancelFrameWatch(frontVideo())
    showOnlyBeat('5')
    updateDots(lastIndex, { complete: true })
    if (scrollHint) scrollHint.style.opacity = '0'
    lastDir = 1
    wheelQuiet = false
    armAfterQuiet()
    setPageLock(false)
  }

  const playClip = (video) => {
    const playPromise = video.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        video.muted = true
        video.play().catch(() => {})
      })
    }
  }

  const playReverse = () => {
    if (destroyed || busy()) return
    const chapter = chapterAt(index)
    const gen = ++navGen
    navBusy = true
    ignoreEnded = true
    frontVideo().pause()
    prepareBack(chapter.rev).then((video) => {
      if (destroyed || gen !== navGen) return
      setFront(front ^ 1)
      phase = 'reversing'
      navBusy = false
      wheelQuiet = false
      lastDir = -1
      armReverseTitle()
      updateDots(index)
      ignoreEnded = false
      if (soundOn) video.muted = false
      cueReverseSfx(chapter)
      playClip(video)
      watchFrames(video, true)
    })
  }

  const restoreForwardStart = () => {
    const chapter = chapterAt(index)
    const video = frontVideo()
    video.pause()
    /* Keep the last reverse frame (start of the clip). Reloading the forward
       MP4 on the same element resumes at the ended freeze we already left. */
    if (soundOn) video.muted = false
    showOnlyBeat(chapter.id)
    syncTitle(0)
    updateDots(index)
    ignoreEnded = false
    settleIdle(true)
    prepareBack(chapter.src)
  }

  const playCurrent = () => {
    if (destroyed || phase !== 'idle' || navBusy) return
    const chapter = chapterAt(index)
    const video = frontVideo()
    if (bound.get(video) !== chapter.src) {
      navBusy = true
      prepareBack(chapter.src).then(() => {
        if (destroyed) return
        setFront(front ^ 1)
        navBusy = false
        if (phase !== 'idle') return
        playCurrent()
      })
      return
    }
    phase = 'playing'
    wheelQuiet = false
    lastDir = 1
    if (scrollHint) scrollHint.style.opacity = '0'
    showOnlyBeat(chapter.id)
    syncTitle(0)
    updateDots(index)
    if (index < lastIndex) pulseTitleZoom()
    preloadBack(index + 1)
    const start = () => {
      if (destroyed || phase !== 'playing') return
      if (soundOn) video.muted = false
      playClip(video)
      watchFrames(video, false)
    }
    const already =
      bound.get(video) === chapter.src && video.readyState >= 2
    if (already) {
      if (!nearStart(video) || nearEnd(video)) {
        seekToZero(video, start)
        return
      }
      start()
    } else {
      bound.set(video, chapter.src)
      video.addEventListener('loadeddata', start, { once: true })
      video.src = chapter.src
      video.load()
    }
  }

  const playNext = () => {
    if (index >= lastIndex) {
      finishStory()
      return
    }
    const next = index + 1
    const chapter = chapterAt(next)
    const gen = ++navGen
    navBusy = true
    prepareBack(chapter.src).then(() => {
      if (destroyed || gen !== navGen) return
      setFront(front ^ 1)
      index = next
      navBusy = false
      phase = 'idle'
      playCurrent()
    })
  }

  const onEnded = (event) => {
    if (destroyed || ignoreEnded) return
    if (event.currentTarget !== frontVideo()) return
    if (phase !== 'playing' && phase !== 'reversing') return
    const video = frontVideo()
    video.pause()
    cancelFrameWatch(video)

    if (phase === 'reversing') {
      stopReverseSfx()
      restoreForwardStart()
      return
    }

    const { orig, duration } = origProgress(video, false)
    syncTitle(duration)
    void orig

    if (index >= lastIndex) {
      finishStory()
      return
    }
    revealNextTitle()
    updateDots(index + 1)
    if (index === lastIndex - 1) {
      finishStory()
      return
    }
    settleIdle(false)
  }

  const onAdvance = (event) => {
    if (destroyed || motionReduced || phase === 'done') return
    if (event) event.preventDefault()
    if (busy()) return
    lastDir = 1
    if (phase === 'ended') playNext()
    else if (phase === 'idle') playCurrent()
  }

  const onReverse = (event) => {
    if (destroyed || motionReduced) return
    if (busy()) return
    if (phase === 'idle' && index <= 0) return
    if (event) event.preventDefault()
    if (soundOn) audioCtx?.resume?.()
    lastDir = -1

    if (phase === 'done') {
      if (!atPageTop()) return
      setPageLock(true)
      index = Math.max(0, lastIndex - 1)
      playReverse()
      return
    }

    if (phase === 'ended') {
      playReverse()
      return
    }

    if (phase === 'idle' && index > 0) {
      index -= 1
      playReverse()
    }
  }

  const onWheel = (event) => {
    if (destroyed || motionReduced) return

    const dir = event.deltaY > 28 ? 1 : event.deltaY < -28 ? -1 : 0

    if (phase === 'done') {
      if (dir === 1 && atPageTop() && !wheelQuiet) {
        event.preventDefault()
        armAfterQuiet()
        return
      }
      if (!atPageTop() || dir !== -1) return
      event.preventDefault()
      if (dir === lastDir && !wheelQuiet) {
        armAfterQuiet()
        return
      }
      lastDir = dir
      onReverse(event)
      return
    }

    event.preventDefault()
    if (busy() || !dir) return
    if (dir === lastDir && !wheelQuiet) {
      armAfterQuiet()
      return
    }
    lastDir = dir
    if (dir === 1) onAdvance()
    else onReverse()
  }

  const onTouchStart = (event) => {
    touchStartY = event.touches[0]?.clientY ?? 0
  }

  const onTouchMove = (event) => {
    if (destroyed || motionReduced) return
    if (phase === 'done') {
      const y = event.touches[0]?.clientY ?? touchStartY
      if (atPageTop() && y > touchStartY) event.preventDefault()
      return
    }
    event.preventDefault()
  }

  const onTouchEnd = (event) => {
    if (destroyed || motionReduced) return
    const y = event.changedTouches[0]?.clientY ?? touchStartY
    const delta = touchStartY - y
    if (phase === 'done') {
      if (!atPageTop() || delta > -40) return
      onReverse()
      return
    }
    if (delta > 40) onAdvance()
    else if (delta < -40) onReverse()
  }

  const onKey = (event) => {
    if (destroyed || motionReduced) return
    const down = ['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)
    const up = event.key === 'ArrowUp' || event.key === 'PageUp'
    if (!down && !up) return
    if (phase === 'done') {
      if (!up || !atPageTop()) return
      event.preventDefault()
      onReverse()
      return
    }
    event.preventDefault()
    if (down) onAdvance()
    else onReverse()
  }

  const onHeroPointer = (event) => {
    if (event.target.closest?.('[data-hero-sound]')) return
    if (destroyed || motionReduced || phase === 'done') return
    if (phase !== 'idle' && phase !== 'ended') return
    onAdvance()
  }

  const onSkip = () => {
    if (destroyed || phase === 'done') return
    navGen += 1
    navBusy = false
    videos.forEach((video) => video.pause())
    finishStory()
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

  videos.forEach((video) => {
    video.addEventListener('ended', onEnded)
    video.addEventListener('progress', tickLoad)
    video.addEventListener('canplay', tickLoad)
    video.addEventListener('canplaythrough', tickLoad)
  })

  bindSrc(videos[0], HERO_CHAPTERS[0].src)
  bindSrc(videos[1], HERO_CHAPTERS[1].src)
  setFront(0)

  loadPoll = window.setInterval(tickLoad, 120)
  loadSafety = window.setTimeout(() => finishLoad(), mobile ? 10000 : 14000)
  tickLoad()

  gsapCtx = gsap.context(() => {
    gsap.set('.hero__beat', { autoAlpha: 0 })
    gsap.set('.hero__beat-char', {
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
    })

    if (motionReduced) {
      root.classList.add('hero--reduced')
      showOnlyBeat('5')
      if (scrollHint) gsap.set(scrollHint, { opacity: 0 })
      updateDots(lastIndex, { complete: true })
      finishLoad()
      return
    }

    setPageLock(true)
    showOnlyBeat('1')
    syncTitle(0)
    updateDots(0)
    settleIdle(true)
    wheelQuiet = true
    window.clearTimeout(quietTimer)
    if (!mobile) {
      tickerFn = (time) => applyCameraDrift(time * 1000)
      gsap.ticker.add(tickerFn)
      gsap.ticker.lagSmoothing(0)
    }
  }, root)

  const onHashNav = (event) => {
    const link = event.target.closest?.('a[href^="#"]')
    if (!link) return
    const href = link.getAttribute('href')
    if (!href || href === '#') return
    onSkip()
  }

  const wheelOpts = { capture: true, passive: false }
  const touchOpts = { capture: true, passive: false }
  window.addEventListener('wheel', onWheel, wheelOpts)
  window.addEventListener('touchstart', onTouchStart, {
    capture: true,
    passive: true,
  })
  window.addEventListener('touchmove', onTouchMove, touchOpts)
  window.addEventListener('touchend', onTouchEnd, {
    capture: true,
    passive: true,
  })
  window.addEventListener('keydown', onKey)
  root.addEventListener('pointerdown', onHeroPointer)
  document.addEventListener('pointerdown', onSitePointer)
  document.addEventListener('click', onHashNav)
  soundBtn?.addEventListener('click', onSoundToggle)

  if (import.meta.env.DEV) {
    window.__maisonHeroDebug = {
      mode: 'chapters',
      index: () => index,
      phase: () => phase,
      time: () => frontVideo().currentTime,
      duration: () => frontVideo().duration,
      playCurrent,
      playReverse,
    }
  }

  return {
    destroy() {
      destroyed = true
      window.removeEventListener('wheel', onWheel, wheelOpts)
      window.removeEventListener('touchstart', onTouchStart, { capture: true })
      window.removeEventListener('touchmove', onTouchMove, touchOpts)
      window.removeEventListener('touchend', onTouchEnd, { capture: true })
      window.removeEventListener('keydown', onKey)
      root.removeEventListener('pointerdown', onHeroPointer)
      document.removeEventListener('pointerdown', onSitePointer)
      document.removeEventListener('click', onHashNav)
      soundBtn?.removeEventListener('click', onSoundToggle)
      videos.forEach((video) => {
        video.removeEventListener('ended', onEnded)
        video.removeEventListener('progress', tickLoad)
        video.removeEventListener('canplay', tickLoad)
        video.removeEventListener('canplaythrough', tickLoad)
        cancelFrameWatch(video)
        video.pause()
      })
      if (loadPoll) window.clearInterval(loadPoll)
      if (loadSafety) window.clearTimeout(loadSafety)
      window.clearTimeout(quietTimer)
      stopReverseSfx()
      audioCtx?.close?.().catch(() => {})
      audioCtx = null
      if (tickerFn) gsap.ticker.remove(tickerFn)
      tickerFn = null
      gsapCtx?.revert()
      gsapCtx = null
      if (stage) stage.style.transform = ''
      setPageLock(false)
      root.classList.remove('hero--chapters')
      if (import.meta.env.DEV && window.__maisonHeroDebug) {
        delete window.__maisonHeroDebug
      }
    },
  }
}
