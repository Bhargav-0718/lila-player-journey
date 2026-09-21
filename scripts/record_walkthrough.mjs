/**
 * Record the guided walkthrough as an MP4, by driving the real app.
 *
 *   npm run walkthrough
 *
 * The brief accepts only a GitHub repo link -- no Drive, no Loom -- so the
 * walkthrough has to be a file committed to the repo. That caps it at GitHub's
 * 100 MB limit, and means it needs to encode small.
 *
 * Rather than stitch static screenshots, this drives the deployed build through
 * the same eight steps the README describes: real navigation, real filters, and
 * the timeline scrubbed through an actual match. Each scene renders to its own
 * clip and they are concatenated, so a still scene costs one PNG instead of
 * hundreds of duplicate frames.
 *
 * Requires ffmpeg on PATH and a Chromium-family browser. Chrome is preferred:
 * on Windows, launching Edge while an Edge window is already open makes the new
 * process hand off to the running instance and exit 0, which Puppeteer reports
 * as an opaque launch failure. Override with BROWSER=/path/to/browser.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import puppeteer from 'puppeteer-core'

const ROOT = resolve(import.meta.dirname, '..')
// Intermediate frames live in the OS temp dir, not the repo: they are bulky,
// and a browser profile left locked inside the tree blocks the next run.
const WORK = join(tmpdir(), 'lila-walkthrough-frames')
const OUT = join(ROOT, 'docs', 'walkthrough.mp4')

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const BROWSER = CANDIDATES.find((p) => existsSync(p))

const W = 1600
const H = 900
const FPS = 20

// Software WebGL is slow. These waits are generous on purpose -- a half-drawn
// deck.gl canvas in the final video is much worse than a longer capture.
const SETTLE_MS = 4200
const FRAME_MS = 120

/** Scene list. `motion` scenes are captured as a frame sequence. */
const SCENES = [
  {
    id: '01-opening',
    url: '/',
    hold: 13,
    caption:
      'Opens on Ambrose Valley — 68% of all telemetry. The foot-traffic heatmap resolves the road network, which is the coordinate projection being correct.',
  },
  {
    id: '02-journeys',
    url: '/?heat=0&paths=1&markers=0',
    hold: 12,
    caption:
      'Raw journey paths. Cyan is a human player, violet a bot — bots drawn thinner and dimmer so they recede.',
  },
  {
    id: '03-bots-only',
    url: '/?heat=0&paths=1&markers=0',
    hold: 10,
    before: async (page) => {
      // Through the real control, not a state hack.
      await clickLabel(page, 'Players')
    },
    caption: 'Bots alone — violet. 91 of them, and they patrol the same interior loops.',
  },
  {
    id: '03b-humans-only',
    url: '/?heat=0&paths=1&markers=0',
    hold: 11,
    before: async (page) => {
      await clickLabel(page, 'Bots')
    },
    caption:
      'Players alone — cyan. 248 of them across five days, but almost never two in the same match: only 5 of 796 matches had more than one human.',
  },
  {
    id: '04-markers',
    url: '/?heat=0&paths=0',
    hold: 12,
    caption:
      'Six event types, each a distinct shape as well as colour. Sized against rarity: 12,885 loot pickups drawn small, the 39 storm deaths drawn large.',
  },
  {
    id: '05-filtering',
    url: '/?map=GrandRift&heat=0&paths=0',
    hold: 11,
    caption:
      'Filters compose: map, any subset of the five days, and match. The match list is sorted by participants — 93% of matches recorded only one.',
  },
  {
    id: '06-timeline',
    url: '/?match=fbbc5d02&heat=0',
    motion: { frames: 110, label: 'Match timeline' },
    caption:
      'Timeline playback over a 16-participant match. Trails grow and fade behind the playhead. Read literally this match lasts 0.4s — `ts` is Unix seconds in a millisecond column.',
  },
  {
    id: '07-heat-kills',
    url: '/?heatmap=kills',
    hold: 9,
    caption: 'Kill zones. Four heatmap metrics run over the same geometry.',
  },
  {
    id: '08-heat-loot',
    url: '/?map=GrandRift&heatmap=loot',
    hold: 12,
    caption:
      'Loot density on Grand Rift. The hotspot sits squarely on Mine Pit — the projection confirmed by the minimap’s own printed labels.',
  },
  {
    id: '09-deadground',
    url: '/?map=Lockdown&heat=0&dead=1&markers=0',
    hold: 15,
    caption:
      'Playable ground nobody has ever entered. Ocean excluded — the region is derived from the telemetry, not the image. A red ring plus the whole northern port complex.',
  },
  {
    id: '10-stats',
    url: '/',
    hold: 13,
    caption:
      'Every figure recomputes against the current filters — so the caption must match the panel. Scoped to Ambrose Valley the combat mix reads 0.17% PvP: 4 player-vs-player events against 2,283 against bots.',
  },
]

// ---------------------------------------------------------------------------

async function clickLabel(page, text) {
  await page.evaluate((t) => {
    const label = [...document.querySelectorAll('label')].find((l) =>
      l.textContent?.trim().startsWith(t),
    )
    label?.querySelector('input')?.click()
  }, text)
}

/** Set a React-controlled range input through its native setter. */
async function setRange(page, ariaLabel, value) {
  await page.evaluate(
    (label, v) => {
      const el = document.querySelector(`input[aria-label="${label}"]`)
      if (!el) return
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set
      setter.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    ariaLabel,
    value,
  )
}

async function showCaption(page, text) {
  await page.evaluate((t) => {
    document.getElementById('__cap')?.remove()
    const d = document.createElement('div')
    d.id = '__cap'
    d.textContent = t
    Object.assign(d.style, {
      position: 'fixed',
      left: '50%',
      bottom: '84px',
      transform: 'translateX(-50%)',
      maxWidth: '1120px',
      padding: '13px 20px',
      background: 'rgba(5,7,11,0.93)',
      border: '1px solid rgba(34,211,238,0.35)',
      borderRadius: '10px',
      color: '#e6e9ef',
      font: '500 17px/1.45 ui-sans-serif, system-ui, Segoe UI, sans-serif',
      textAlign: 'center',
      zIndex: '99999',
      boxShadow: '0 16px 48px rgba(0,0,0,.6)',
      pointerEvents: 'none',
    })
    document.body.appendChild(d)
  }, text)
}

async function waitForRender(page) {
  await page
    .waitForFunction(() => !document.body.innerText.includes('Loading'), { timeout: 60000 })
    .catch(() => {})
  await new Promise((r) => setTimeout(r, SETTLE_MS))
}

function ff(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: 'inherit',
  })
}

/** A full-frame title or end card, rendered in the page for consistent styling. */
async function card(page, id, lines, seconds) {
  await page.goto('about:blank')
  await page.evaluate((l) => {
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;display:grid;place-items:center;
                  background:#05070b;font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif">
        <div style="text-align:center;max-width:1100px;padding:0 40px">
          ${l
            .map(
              (t, i) =>
                `<div style="color:${i === 0 ? '#e6e9ef' : '#8b93a7'};
                     font-size:${i === 0 ? 42 : 20}px;
                     font-weight:${i === 0 ? 650 : 400};
                     letter-spacing:${i === 0 ? '-0.02em' : '0'};
                     margin-top:${i === 0 ? 0 : 18}px;line-height:1.45">${t}</div>`,
            )
            .join('')}
        </div>
      </div>`
  }, lines)
  await new Promise((r) => setTimeout(r, 400))
  const png = join(WORK, `${id}.png`)
  await page.screenshot({ path: png })
  const clip = join(WORK, `${id}.mp4`)
  ff(['-loop', '1', '-i', png, '-t', String(seconds), '-r', String(FPS),
      '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', clip])
  return clip
}

// ---------------------------------------------------------------------------

async function main() {
  if (!BROWSER) {
    console.error('No Chromium-family browser found. Set BROWSER=/path/to/chrome.')
    process.exit(1)
  }
  console.log(`  browser: ${BROWSER}`)
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(WORK, { recursive: true })
  mkdirSync(join(ROOT, 'docs'), { recursive: true })

  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: true,
    defaultViewport: { width: W, height: H },
    args: [
      '--enable-unsafe-swiftshader',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--window-size=${W},${H}`,
    ],
    // Kept out of WORK so a locked profile cannot block cleanup next run.
    userDataDir: join(tmpdir(), 'lila-walkthrough-profile'),
  })
  const page = await browser.newPage()

  const clips = []

  clips.push(
    await card(page, '00-title', [
      'LILA BLACK · Player Journey Explorer',
      '89,104 events · 796 matches · 1,242 journeys · 3 maps',
      'Level-design telemetry, 10–14 Feb 2026',
    ], 5),
  )

  for (const scene of SCENES) {
    process.stdout.write(`  ${scene.id} ... `)
    await page.goto(BASE + scene.url, { waitUntil: 'networkidle2', timeout: 90000 })
    await waitForRender(page)
    if (scene.before) {
      await scene.before(page)
      await new Promise((r) => setTimeout(r, 1800))
    }
    await showCaption(page, scene.caption)
    await new Promise((r) => setTimeout(r, 400))

    const clip = join(WORK, `${scene.id}.mp4`)

    if (scene.motion) {
      // Step the real slider so the capture shows genuine playback rather than
      // a cross-fade between two stills.
      const max = await page.evaluate((label) => {
        const el = document.querySelector(`input[aria-label="${label}"]`)
        return el ? Number(el.max) : 0
      }, scene.motion.label)

      const dir = join(WORK, scene.id)
      mkdirSync(dir, { recursive: true })
      for (let i = 0; i < scene.motion.frames; i++) {
        const t = (max * i) / (scene.motion.frames - 1)
        await setRange(page, scene.motion.label, t.toFixed(1))
        await new Promise((r) => setTimeout(r, FRAME_MS))
        await page.screenshot({
          path: join(dir, `f${String(i).padStart(4, '0')}.png`),
        })
      }
      ff(['-framerate', '10', '-i', join(dir, 'f%04d.png'),
          '-r', String(FPS), '-c:v', 'libx264', '-crf', '30', '-preset', 'slow',
          '-pix_fmt', 'yuv420p', clip])
      console.log(`${scene.motion.frames} frames`)
    } else {
      const png = join(WORK, `${scene.id}.png`)
      await page.screenshot({ path: png })
      ff(['-loop', '1', '-i', png, '-t', String(scene.hold), '-r', String(FPS),
          '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', clip])
      console.log(`${scene.hold}s`)
    }
    clips.push(clip)
  }

  clips.push(
    await card(page, '99-end', [
      'github.com/Bhargav-0718/lila-player-journey',
      'lila-player-journey-swart.vercel.app',
      'See ARCHITECTURE.md for the coordinate mapping and assumptions · INSIGHTS.md for the three findings',
    ], 6),
  )

  await browser.close()

  const list = join(WORK, 'concat.txt')
  writeFileSync(list, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'))
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT])

  const mb = (readdirSync(join(ROOT, 'docs')), (await import('node:fs')).statSync(OUT).size / 1e6)
  console.log(`\n  wrote ${OUT}  (${mb.toFixed(1)} MB)`)
  if (mb > 90) console.error('  !! over GitHub\'s 100 MB file limit — raise -crf')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
