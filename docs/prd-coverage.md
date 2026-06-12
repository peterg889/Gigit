# PRD Coverage Matrix — requirements → architecture → design → implementation

**Date:** June 2026. Audit of every PRD requirement against (a) the architecture plan ([`engineering-spec.md`](engineering-spec.md)), (b) a component-level technical design ([`technical-design.md`](technical-design.md), [`m0-technical-spec.md`](m0-technical-spec.md)), and (c) the code as it exists on `main` today. Status values: **✅ built** (verified in code), **🟡 partial** (built with divergences noted), **❌ missing** (P0/committed scope not yet built), **📋 designed-only** (design exists, build deferred per plan), **⬜ deferred** (P1/P2, intentionally not built — listed only when the seam matters).

> **Update (June 12, 2026):** all 14 gaps below were closed in the build sprint
> tracked by tasks 1–11 (see `docs/technical-design.md` §7 for the designs).
> Built and verified: recurrence (slot_series + materializer), saved-search
> alerts, venue→performer search, tech sub-slots on full rails (booked +
> ledgered end-to-end), Twilio SMS router (STOP/HELP/parse/triage; A2P
> registration still pending externally), media trust pipeline (sniff + EXIF
> strip + fraud screen + moderation queue), support_triage + dispute_brief +
> photo gear_extract + golden-set evals, venue_night_facts accrual, Stripe
> gates at offer/accept + band_members seam + SetupIntent capture, ops console
> (search/suspend/adjust/moderation), nightly money reconciliation + alarms +
> worker Sentry, CI deploy stages + runbook + load test + PWA manifest.
> Remaining external items live in the runbook checklist (A2P, SES production
> access, Stripe live keys, GuardDuty S3 scanning, counsel review). The matrix
> below is preserved as the pre-sprint audit record.

## Summary of P0 gaps (launch blockers not yet built — CLOSED, see update above)

| # | Gap | PRD ref | Notes |
|---|---|---|---|
| 1 | **Recurring slot series** | F2.2 (P0) | No `slot_series` table or recurrence anywhere in code. Blocked on open engineering question #3 (RRULE vs materialization). Recurrence is "the core venue habit we monetize" — this is the largest P0 gap. |
| 2 | **Saved-search alerts** | F2.3 (P0) | Not in code **and not in the engineering spec's domain model** — no `saved_searches` table was ever designed. Needs design + build. |
| 3 | **Venue-facing performer search + invite-to-slot** | F2.4 (P0) | No performer search/browse endpoint exists (only public profile by id). "Invites" today are inquiry threads with no slot attachment semantics. |
| 4 | **Tech sub-slots on the booking rails** | F6.2, F6.3 (P0) | No `tech_subslots` table. Techs are discoverable (directory) and messageable (inquiry threads) but cannot be *booked* — no budget, payer, state machine, payment, or review for techs. The M2 exit criterion "tech books through a sub-slot" is **not met** by the current code. |
| 5 | **SMS as a posting surface** | F2.8 (P0) | `slot_parse` works as a web AI widget; there is **no Twilio inbound webhook, no `sms_sessions` router, no STOP/HELP handling**. Also gated externally on A2P 10DLC registration (start now — weeks of lead time). |
| 6 | **Photo-to-specs gear ingestion** | F6.6 (P0) | `gear_extract` is text-only. PRD requires multimodal (photo) extraction — "the data capture that makes F6.1 feasible at scale". Gemini supports image input; the gateway needs an image path. |
| 7 | **Media fraud screening** | F7.5 (P0) | `media/complete` has a stub comment only. No `fraud_flags` table, no `media_fraud_screen` AI task, no ops review queue. Also missing: virus scan, EXIF strip, content-type sniffing, image renditions (the whole §8 processing pipeline — uploads go straight to `ready`). |
| 8 | **AI-first support** (`support_triage`) | F9.4 (P0) | Not built. No support thread scope handling, no KB, no triage task. This underwrites the unit-economics claim (<1 human touch per 20 bookings). |
| 9 | **POS-baseline data accrual** (`venue_night_facts`) | F8.5-P0 | No table, no nightly job. Cheap to build, impossible to backfill — every week unbuilt is lost baseline data for the Phase 2 flagship. |
| 10 | **Stripe onboarding gate before acceptance** | F1.5 / spec §6 | Connect onboarding link exists, but `bookings/accept` does **not** check the performer has a payouts-enabled Stripe account. A booking can confirm with nowhere to send the money. |
| 11 | **Ops dashboard beyond disputes** | F9.1, F9.3 (P0) | Admin can resolve disputes and view liquidity metrics. Missing: user/booking search, manual edits, refunds, payout holds, suspension, moderation queue. |
| 12 | **Distance/ranking in the feed** | F2.7 (P0 v1) | Feed filters by format/metro/date only. No radius (haversine designed in M0 spec, not present), no reliability/recency ranking. |
| 13 | **PRO licensing static guidance in venue onboarding** | F8.3 (P0 portion) | Content-only task; not present. |
| 14 | **PWA push** | F5.2 / §7 NFR | SMS + email exist (worker). No web push / PWA manifest. |

## F1 — Accounts, profiles, verification

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F1.1 multi-role, one login | P0 | spec §4 `actor_roles` | tech-design §4.1 | 🟡 | Built as one-profile-per-type per user (`ownerUserId` on performers/venues/techs; `actor_roles` used only for admin). Functionally equivalent for MVP; diverges from spec §4. `band_members` (+ `payout_split_bps`, which K3 said "ships day one") **does not exist** — the split-payout seam is missing. |
| F1.2 performer EPK | P0 | spec §4 | tech-design §4.1, §4.5 | 🟡 | Bio, genres, rates, set lengths, tech needs, photos, audio, embeds ✅. Stage-plot upload missing (no document media kind). |
| F1.3 venue profile | P0 | spec §4 | tech-design §4.1 | 🟡 | Core + `pa_inventory` ✅. Room photos ✅. Missing fields: room dimensions, hospitality, parking/load-in, "who runs sound" flag (PA inventory has `hasOperator` ✅). |
| F1.4 tech profile | P0 | spec §4 | tech-design §4.1 | 🟡 | Built. Rig specs are gear enum + bio text, not structured `rig_specs jsonb`. |
| F1.5 identity verification | P0 | K6, spec §6 | tech-design §4.2, §5.2 | 🟡 | Phone/email OTP ✅ with rate limit. **Stripe-verified-before-payout gate not enforced** (gap #10). |
| F1.6 badges | P1 | spec §4 reliability | — | ⬜ | `reliability_strikes` counter exists (seam ✅). |
| F1.7 COI | P1 | spec §4 `coi_documents` | — | ⬜ | Not built; designed. |
| F1.8 link-in onboarding | P0 | K9, spec §9 | tech-design §4.6 | 🟡 | `profile_ingest` ✅ (Gemini + heuristic fallback, draft-review-approve). Draft covers name/kind/bio/genres only — PRD also wants discovered media embeds, set lengths, inferred tech needs. <5-min target unmeasured. |

## F2 — Slot posting & discovery

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F2.1 slot posting | P0 | spec §4 | tech-design §4.3 | ✅ | Budget required ✅ (transparency policy). |
| F2.2 recurring series | P0 | spec §4 `slot_series`; open Q#3 | **none** | ❌ | Gap #1. Decide representation, then design + build. |
| F2.3 feed + saved-search alerts | P0 | spec §4 (feed only) | tech-design §4.3 | 🟡 | Feed ✅. Saved searches ❌ — gap #2, never designed. |
| F2.4 venue→performer search + invite | P0 | spec §4 "search/matching" | **none** | ❌ | Gap #3. |
| F2.5 one-tap apply | P0 | spec §4 | tech-design §4.3 | ✅ | Unique (slot, performer) ✅; applicant list with profiles ✅; badges/reviews inline 🟡 (reviews on profile page, not in applicant list). |
| F2.6 comedy lineups | P1 | open Q#5 | — | ⬜ | **Decision needed before schema hardens** (N bookings + `lineup_id` is the lean). |
| F2.7 matching v1 | P0 | spec §4 | tech-design §4.3 | 🟡 | Gap #12 — filters exist; distance + ranking don't. |
| F2.8 NL/SMS slot posting | P0 | K9, spec §9–10 | tech-design §4.6, §6.4 | 🟡 | Web NL parse ✅. SMS surface ❌ — gap #5. |

## F3 — Booking flow & contracts

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F3.1 offer→accept, locked terms | P0 | K4, spec §5 | tech-design §4.4, §6.1 | ✅ | `createOffer` + state machine; both-party re-confirmation on term change is moot (terms immutable post-offer; a change = new offer). |
| F3.2 auto-generated agreement | P0 | K7 | tech-design §4.4 | ✅ | Click-wrap v1, template hash + acceptance timestamps recorded. Rider items from tech needs not yet merged into the text (minor). |
| F3.3 cancellation policy | P0 | spec §5 | tech-design §6.2 | 🟡 | Fee schedule ✅, ledgered + paid ✅, reliability strike ✅, slot auto-reopen ✅. "Repeated late cancels → suspension" not enforced (no suspension logic). Auto-repost-with-priority is P1 (replacement engine). |
| F3.4 replacement engine | P1 | spec §14 deferred | — | ⬜ | Seam ✅ (`cancelled_by_performer` events exist). |
| F3.5 day-of runsheet | P1 | — | — | ⬜ | Also carries the offline-degradation NFR when built. |
| F3.6 calendar / iCal out | P0 | spec §10 | tech-design §4.7 | ✅ | Signed (JWT) per-user feed ✅. In-app availability calendar ❌ (only bookings list). |

## F4 — Payments

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F4.1 Connect charge/hold/release | P0 | K3, spec §6 | tech-design §4.8, §6.1 | 🟡 | Gateway interface + Null/Stripe impls ✅; charge at confirmation, transfer at release, ledger ✅. **Unverified against live Stripe test mode** — saved-payment-method collection for venues (SetupIntent flow) is not visible in the web UI; ACH-vs-card default unresolved (open Q#1). |
| F4.2 mark-played / auto-confirm | P0 | spec §5 | tech-design §6.1 | ✅ | +24h auto-confirm timer + reconciler ✅. |
| F4.3 split payouts | P1 | K3 seam | — | ❌ seam | `band_members.payout_split_bps` was committed to ship day one; it didn't. Cheap now, painful later — add the table even if unused. |
| F4.4 tax (W-9, 1099-K) | P0 | K3 | tech-design §4.8 | ✅* | Delegated to Stripe Express by design; *holds only if gap #10 closes (Express must stay the sole payout path). State-threshold config is a Stripe dashboard task — add to launch runbook. |
| F4.5 instant payout | P2 | — | — | ⬜ | |
| F4.6 tip jar | P2 | — | — | ⬜ | |

## F5 — Messaging & notifications

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F5.1 scoped messaging + inquiries | P0 | spec §10 | tech-design §4.7 | 🟡 | Threads (inquiry/application/booking scopes), venue→performer inquiry with daily cap, performer→tech allowed, no performer→venue cold ✅. **Contact-info reveal at confirmation not implemented** (no phone display template). Mute/block ❌. |
| F5.2 critical-path push+email+SMS | P0 | spec §10 | tech-design §4.9 | 🟡 | Worker notification fan-out with 14 versioned templates, Twilio SMS + SES email + log fallback ✅. Day-before reminder template missing; PWA push ❌ (gap #14); per-user channel prefs ❌. |
| F5.3 response-time surfacing | P1 | — | — | ⬜ | |

## F6 — Sound tech integration

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F6.1 sound-plan computation | P0 | spec §7 | tech-design §4.10 | ✅ | Pure engine v0 in domain, surfaced on slot detail ✅ (computed on read, not persisted — fine at this scale; diverges from spec's `slots.sound_plan` column). |
| F6.2 tech sub-slots | P0 | spec §4–5 | tech-design §7 (to-build) | ❌ | Gap #4. The differentiator is not on the rails yet. |
| F6.3 sub-slot context inheritance | P0 | spec §7 | tech-design §7 | ❌ | Depends on F6.2. |
| F6.4 house tech | P1 | — | — | ⬜ | |
| F6.5 standalone tech bookings | P2 | — | — | ⬜ | |
| F6.6 photo-to-specs | P0 | K9, spec §9 | tech-design §4.6 | 🟡 | Text-only today — gap #6. |

## F7 — Reviews & trust

| Req | Priority | Architecture home | Design home | Status | Notes |
|---|---|---|---|---|---|
| F7.1 double-blind reviews | P0 | spec §4 | tech-design §4.11 | 🟡 | Built (both-submitted-or-7-days read rule). Ratings are `{overall}` only — PRD wants per-dimension (draw/professionalism/quality; hospitality/accuracy/payment). Tech reviews ❌ (no tech bookings to review). |
| F7.2 bookings-only reviews | P0 | spec §4 | tech-design §4.11 | ✅ | FK to booking + terminal-state + one-per-party checks. |
| F7.3 reliability score | P1 | spec §4 | — | ⬜ | Strike counter exists; score/badge/ranking don't. |
| F7.4 disputes | P0 basic | spec §5 | tech-design §6.3 | ✅ | Open → payout held → admin resolves (full/partial/refund, sums validated) ✅. Evidence packs + AI brief = P1. |
| F7.5 media fraud screening | P0 | K9, spec §8–9 | tech-design §7 | ❌ | Gap #7 — includes the entire upload processing pipeline (virus scan, EXIF, sniffing, renditions). |

## F8 — Promotion & compliance

| Req | Priority | Status | Notes |
|---|---|---|---|
| F8.1 event pages | P1 | ⬜ | Consumes `confirmed` events (seam ✅). |
| F8.2 syndication | P1 | ⬜ | |
| F8.3 PRO guidance | **P0 (static)** | ❌ | Gap #13 — onboarding content. |
| F8.4 compliance checklist | P1 | ⬜ | `noise_curfew` field exists ✅. |
| F8.5 ROI loop | P1; **accrual P0** | ❌ | Gap #9 — `venue_night_facts` nightly snapshot. |

## F9 — Admin & ops

| Req | Priority | Status | Notes |
|---|---|---|---|
| F9.1 ops dashboard | P0 | 🟡 | Dispute resolution ✅; the rest ❌ (gap #11). |
| F9.2 liquidity dashboard | P0 | ✅ | `/admin` SQL over events/ledger. Hourly materialized views (spec §12) not needed at current scale. |
| F9.3 moderation queue | P0 | ❌ | Gap #11. |
| F9.4 AI-first support | P0 | ❌ | Gap #8. |

## Non-functional requirements (PRD §7)

| NFR | Status | Notes |
|---|---|---|
| Mobile-first responsive web | 🟡 | Server-rendered, minimal styling; no PWA manifest/push. |
| PCI via Stripe Elements | 🟡 | No card data on origin ✅ by construction; venue payment-method capture UI (Elements/SetupIntent) not yet present — required before real charges. |
| AWS-native minimal infra | ✅ | CDK: App Runner + EC2 worker + RDS + S3/CloudFront + SES + Secrets Manager, staging/prod stacks. CI lacks the deploy stage (spec §3: staging deploy on merge → manual promote). |
| Trust & safety (rate limits, no off-platform-payment detection) | 🟡 | OTP + inquiry caps ✅; message-content detection ❌ (P1-acceptable). |
| 99.9% availability, graceful offline gig-day | 🟡 | Single-AZ RDS accepted at launch (K11). Offline runsheet lands with F3.5. No Sentry/uptime checks yet (spec §12) — add before launch. |
| Privacy (contact gating, CCPA) | 🟡 | Profiles public, payment instruments never exposed ✅. Contact reveal at confirmation ❌ (see F5.1). `docs/pii.md` + deletion/anonymization endpoint (spec §11) ❌. |
| WCAG 2.1 AA | ❌ | No audit yet; semantic-HTML server pages are a good base. |

## Verdict

The **architecture plan exists and is sound** (`engineering-spec.md` — components, commitments, data model, state machine). The **component-level technical design now exists for the system as built** (`technical-design.md`, which supersedes the M0-only spec). What the careful PRD pass surfaced is that the *build* is materially behind the *plan* in five P0 areas that the milestone commit messages overstate: recurrence, discovery (search/alerts/ranking), the entire tech-booking rail, the media trust pipeline, and the AI ops layer (support triage, fraud screen, photo ingestion). Those, plus the small-but-load-bearing items (Stripe gate, splits seam, baseline accrual), constitute the real launch backlog — enumerated as build-ready components in `technical-design.md` §7.
