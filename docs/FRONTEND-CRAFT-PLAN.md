# Frontend Craft Plan

Internal doc for Scent Census work. Deep research digest + practice system.
Assembled from full-read passes on: Emil Kowalski (Design Engineer at Linear,
ex-Vercel design), Rauno Freiberg (ex-Vercel design engineer), Julie Zhuo
(ex-Figma VP design, ex-Facebook design director), Paul Graham's "Taste for
the Makers", Anu Atluru's "Taste Is Eating Silicon Valley", Refactoring UI
(Wathan & Schoger), Butterick's Practical Typography, Ira Glass's taste gap,
and the distillable engineering rules from Vercel's 2023 homepage build
("What will you ship?").

# Part I: The thesis

Software is commoditized. AI makes anything work, and working is expected.
What differentiates is design, feel, brand, intuition. Atluru: "In a world of
scarcity, we treasure tools. In a world of abundance, we treasure taste."
Kowalski: with cars, nobody cared about color when the competition was a
horse; now details are everything.

The best frontend engineers are known for the compound of four skills:

1. **Eye** (taste): trained instinct for what elevates.
2. **Vocabulary** (articulation): the ability to say WHY something feels
   right. PG: "The recipe for great work is: very exacting taste, plus the
   ability to gratify it." Articulation is what lets the eye grow the hand.
3. **Hand** (execution): CSS depth, layout systems, motion, typography,
   performance, a11y. Taste you don't ship is not taste.
4. **Packaging** (era-specific): turning articulated taste into rules and
   skill files so agents execute at your bar (Kowalski publishes his;
   emilkowal.ski/skill).

# Part II: How taste is actually trained (every source converges)

Zhuo's six steps (from "On Taste, Part 3", with her "understand-the-experts"
test from Part 2: you don't need to agree with the masters, you need to
understand their opinions well enough to argue with them):

1. Believe good taste exists as a learnable skill. Aesthetics is "more
   objective and trainable"; taste is the discernment expressed.
2. Identify who has it. Start with the widely respected, then follow who THEY
   respect. Build a tastemaker list.
3. Immerse deeply: use their apps, read their essays, watch their talks.
4. Always be critiquing. " designers paid close attention to details: they
   could recite which apps used which navigation paradigms, compare visual
   styles, identify clever interactions."
5. Calibrate with others. Zhuo: ~73% of her design knowledge came from
   specific critique conversations. Get specific, never just "cool/sucks".
6. Practice the craft at the level of "paring the artichoke, tweaking the
   pixels"; seek honest critique even when it prickles.

Kowalski's version ("Developing Taste"): expose yourself to greatness, then
rationalize rather than trust gut. "Almost every 'taste' decision has a
logical reason if you look close enough." The taste gap (Ira Glass): early
work lags taste; the gap is proof the eye is ahead. Don't quit in it.

PG ("Taste for the Makers"): designing is the running case. If taste were
pure preference, "there would be no way to get better at your job." We can
tell we got better, therefore taste improves and is measurable in aggregate.
Tastemakers cluster ("good design happens in chunks": Florence 1450, Bauhaus,
Parc — you must work adjacent to hotspots). Communities count as much as
talent.

**The synthesis loop**: curate → immerse → dissect + articulate WHY →
practice → calibrate → repeat forever.

# Part III: PG's principles of good design (cross-field)

Good design is: simple (short proofs; ornament is camouflage for insipid
form), timeless (opting out of fashion), solves the RIGHT problem (stove dials
in a square, not a row; sans-serif text legibility trap: g vs y distinction
matters more than purity of letterform), suggestive (design that lets people
finish the story), often slightly funny (humor = strength, not taking oneself
too seriously), hard (difficulty burns off fashions and flourishes), looks
easy (eighth-rewrite conversational ease), recursive/symmetric, resembles
nature (it had the most time to iterate), redesign ("experts expect to throw
away early work; cultivate dissatisfaction"), able to copy ("it's more
important to be right than original"; unknowing imitation is the recipe for
bad design — conscious copying after understanding is mastery), often strange
(don't cultivate it; don't squash it), daring (see ugliness where others
tolerate it; "as you become expert, you start to hear little voices saying,
what a hack! there must be a better way").

# Part IV: Motion (the Kowalski canon, rules and reasoning)

Purpose first ("You Don't Need Animations"): every animation needs a job:
explain, confirm, orient, or delight. Then frequency governs everything:

- Raycast opens hundreds of times a day with zero animation. Optimal.
- Keyboard-initiated actions should NEVER animate; the highlight lagging the
  key press feels broken.
- Tooltips: initial delay is fine; subsequent tooltips in the same session
  get no delay and no animation (Radix/Base UI `data-instant`).
- Frequent hover states: usually best with no animation at all.

Seven practical tips (articulate "why"s, directly adoptable):

1. `:active { transform: scale(0.97) }` — the interface should feel like
   it's listening. Feedback on every action, immediately.
2. Never animate from `scale(0)`. Start near 0.93–0.95: "like a balloon, even
   when deflated it has a visible shape, it never disappears completely."
3. Skip delay/animation for subsequent tooltips.
4. Easing is the most important part of any animation. ease-out for
   enter/exit (speed at the START reads as responsiveness; ease-in spikes at
   the END, opposite of what UI wants), ease-in-out for on-screen movement,
   `ease`/default for hovers, linear only for constant motion. Built-in CSS
   curves are usually too weak; custom versions (easings.co) are stronger.
5. Origin-aware popovers: `transform-origin` must be the trigger location,
   not center. Radix/Base UI CSS variables do this automatically. "Whether
   you or your users notice it doesn't matter; in the aggregate, unseen
   details become visible, they compound" (PG, "Hackers and Painters").
6. Keep everything under ~300ms. "A faster spinner makes the app seem to
   load faster even though the load time is the same."
7. When something still feels off after correct easing/duration: 1–2px
   `blur()` bridges the visual gap between the two states. Works because it
   blends rather than shows two distinct objects.

Enter vs exit: exit ~20% faster. Match duration to distance.

Rauno's interaction laws ("Invisible Details of Interaction Design"):
interaction design is fluid response to intent. Learn ONE gesture; reuse the
metaphor everywhere (swipe-to-dismiss learned once unlocks layers everywhere).
Model after real-world physics: interruptibility is mandatory because mashing
a menu open/closed is the actual usage. Trigger lightweight actions mid-gesture
at their logical final position; trigger DESTRUCTIVE actions only on gesture
end, regardless of distance. `⌘K` menus: no entrance animation, ever.
macOS context menus don't animate in but fade out with a selected-item
blink: graceful exit + confirmation of selection. Fitts's law: magic corners
(infinite targets), radial menus around the pointer. Commands used at high
frequency have low novelty: flowishes become cognitive burden (semantic
satiation, his "Novelty" essay).

# Part V: Composition, depth, choreography, novelty (Rauno)

"Designing Depth": filmmakers "dirty the frame" with foreground layers.
Software equivalent: blurred backdrops behind overlays signal depth-of-field
AND signal that the dimmed layer is non-interactive (a semantics carried by
visuals). Layered hero compositions beat flat centered screenshots.

Choreography: iOS home-swipe deconstructs into 4 states (blur layer → reveal
suggestions → morph search affordance → expand keyboard). Feedback should
appear near the gesture's origin; keyboard waits so it doesn't compete
cognitively with suggestions. Reverse the choreography when swap-triggered
from a button (input first, then suggestions). Stagger siblings slightly:
"nature does not move in perfect synchrony"; fish-school/dissonance keeps
interfaces from moving like concert-jarring leaves. Motion can communicate
affordance: the Dock slides off at full opacity (still interactive) but only
blurs when the Control Center opens (not interactive). Moving = available.

"Novelty" (2026): novelty is an exclamation mark; seasoning, not a meal.
Cinema's 60/30/10 color rule maps to software: **90% familiar, 10% novel**.
Best spent on one-time moments (onboarding, login) — Devouring Details and
paco.me animate ONLY the first visit via cookie-gated rewrite. Novelty tax
(Arc's saxophone→piano problem): complexity the average job-haver can't
absorb. Vibe-shift lesson: purple got collectively icky through
overexposure. Stripe Press works BECAUSE it contrasts the rest of Stripe.
Intent modulates tolerance: games may go maximal; utility tools should mostly
stay familiar with one unexpected thing.

"Contrasting Aesthetics": interest lives at intersections (Renaissance
painting + bitmap typeface = time passage, craft signaling via Leonardo).
"A clean design sometimes makes me feel nothing." Relevance to us locked-in
direction: the warm oak wall + paper cards in a genre of cold dark-mode SaaS
IS the contrasting aesthetic. Protect it; don't sand it into neutral.

"What will you ship?" (Vercel 2023 homepage): north stars were performance,
restraint in flair, cross-page rhythm. If an animation "didn't perform well,
felt pompous, or out of rhythm," it was cut. Universally-felt primitives:
page speed, legible typography, information honesty, layout stability,
scannability, accessible focus, sensible DOM order. Novelty was BUDGETED per
section on a map (high-novelty sections never adjacent). Technical gems worth
stealing: grid guides via `display: contents` + absolutely positioned guide
cells (no need to fill every cell); pseudo-element alt text
`content: counter(line) / ""` to hush line numbers for screen readers; ARIA
live region `role="log" aria-live="polite"` for copy feedback; visuals as
`role="img"` with aria-label and aria-hidden inner trees; container queries
so widgets respond to their container, not the window; `animation-play-state:
paused` under reduced motion (never `none`), plus `opacity: 1 !important` so
a paused caret never freezes invisible; offset-path for orbit rings.

# Part VI: Typography (Butterick, the non-negotiables)

- The four body-text decisions: size (15–25px web), line spacing (120–145%),
  line length (45–90 characters), font.
- Easiest visible upgrade: a professional font. Already done (Geist).
- Never underline non-links. Use weight/color for UI emphasis.
- All caps: fine under one line; add 5–12% letter-spacing when caps/small
  caps. (Matches Kowalski's rule #4.)
- Kerning on; proper ellipsis character; curly quotes;®/™ real symbols;
  alternate figures (tabular) for columns of numbers.
- Don't use grey text on colored backgrounds (Refactoring UI adds this too;
  we're on a warm wall: keep soft text on white cards only).
- One space between sentences. Exclamation ration: one per long doc.

# Part VII: Visual-language tactics (Refactoring UI chapter map)

The book's skeleton is worth knowing cold: start from a feature not a layout;
detail comes later; choose a personality (our personality: warm, woody,
honest print-shop); hierarchy is everything (size isn't the only lever:
WEIGHT + contrast, de-emphasize to emphasize, labels are a last resort);
start with too much white space; avoid ambiguous spacing; establish a type
and spacing scale; line length in check; baseline alignment; letter-spacing
on caps; HSL not hex (define tints/shades up front); greys need tinting —
ours are warm ink tints, correct; shadows convey elevation via a light
source, and can have two parts (ambient + key) — a refinement opportunity for
`.card`'s single shadow; overlap creates layers; supercharge the defaults;
accent border color touches; fewer borders (use shadow, spacing, or
background contrast instead — our `.rows` hairlines are fine but watch for
border-cruft); don't overlook empty states (personality lives there).

# Part VIII: What "one of the best looking frontend engineers" is, exactly

Ranked importance per the research (invisible beats visible):

1. The floor everyone feels but nobody glamorizes: speed, layout stability,
   information honesty, legibility, focus states, DOM order, a11y feedback.
2. Restraint: cuts ("didn't perform, felt pompous, out of rhythm").
3. Articulated rationale behind every choice, written down.
4. One coherent personality, expressed via contrast, not decoration.
5. Signature novel moments, budgeted at 10%, placed where frequency is low.
6. The vocabulary to transfer all of it to agents (skill files).

# Part IX: Standing rules adopted into this codebase

(Already applied, verified in `globals.css`: press scale 0.97 @120ms,
transitions, focus-visible rings, tabular-nums, caps letter-spacing, coarse
pointer 44px targets, global reduced-motion stop.)

# Part X: Implementation backlog (research-derived, for Scent Census)

Novelty budget & placement:
1. [x] First-visit-only shelf entrance: cookie-gated stagger on bottle drop-in
   (paco.me pattern). Returning visits: instant paint.
2. [x] Everything else stays motionless; feed voting stays zippy. No entrance
   animation on sign-in, census rows, cards.
3. [x] Warm 60/30/10 audit passes by eye: wall dominates, paper is the
   working surface, ink is the accent.

Typography & copy:
4. [x] Two-part card shadows (tight key + soft ambient), matching daylight.
5. [x] Ellipsis characters everywhere; straight-quote approximations gone.
6. [x] Empty states rewritten with personality (census, shelf, feed-dry).
7. [x] Line-length guard on prose blocks (.fine capped at 68ch).

Engineering floor:
8. [x] aria-live on vote confirmations; bottle alts verified present and
   announced at runtime; ghost silhouettes aria-hidden.
9. [x] Layout stability: bottle sizes are CSS-fixed heights, verified
   complete=true with no late reflow.
10. [x] Safe-area padding on the topbar (notch and home-indicator proofing).
11. [x] DOM order on the shelf unit follows visual reading order; no fix needed.

Craft extensions (learn-progressively):
12. [x] Signature interaction shipped, capped: bottle hover lift with contact
   shadow spread, 150ms ease-out, hover+fine-pointer guarded only.
13. [ ] `display: contents` grid-guide technique for any future grid sections.
14. [ ] Copywork rebuilds: one Linear/Vercel/Stripe surface weekly (ritual,
   not codebase work).

Also shipped this round:
- [x] Themed `not-found.tsx` on the wall with the print-link affordance.

# Part XI: The curriculum

Daily (20–30 min): dissect one interface for 10 min with one written WHY;
one micro copywork rebuild (toast, switch, pricing row) focused on details.

Weekly: full copywork rebuild of a great screen, shared for critique; audit
this app against Parts IV–VII; one new WHERE would-motion-help vs
where-would-it-hurt pass.

Monthly: reread one source (rotate); update this doc; ship one before/after
polish publicly. Rebuild budget stays flexible; paid canon (animations.dev,
Refactoring UI, CSS for JavaScript Developers) optional later.

Re-read rotation: "Invisible Details of Interaction Design", "Developing
Taste", "Designing Depth", "Novelty", "What will you ship?", "Contrasting
Aesthetics"; Zhuo I–III; PG "Taste for the Makers"; Butterick key rules;
Atluru; Refactoring UI chapters.

Community ("chunks" per PG): rauno.me/craft archive, devouringdetails.com,
mobbin, godly.website, awwwards, Brian Lovin's App Dissection,
emilkowalski's skill repo. Engage in critique, post work, don't just view.
