# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users
Calisthenics and bodyweight trainers who log their own training. Used in gyms and outdoor calisthenics parks (mid-workout, one hand, sweaty or chalky, bright light), and at home for logging past sessions and building programs in advance.

## Product Purpose
Offline-first tracker for calisthenics: log reps, holds and added or assisted load; follow progression chains; track records, bodyweight, photos, measurements and mobility. Everything stays on the device, with JSON backup and restore. Success: logging a set costs a couple of taps, and history and progress are trustworthy.

## Positioning
Built for bodyweight skills (holds, progression chains, levels), not barbell-first logging; fully local data, no account.

## Operating Context
Active workout: rest timers, hold timers, supersets, RPE, warm-ups, swipe gestures. Past sessions can be created and edited after the fact. Programs are built as named sessions with exercises. Users can create custom exercises from any of these flows. UI languages: English and Italian.

## Capabilities and Constraints
Expo / React Native, drizzle + SQLite, existing "Chalk, steel, birch" palette (src/shared/theme/palette.ts), light and dark themes, Barlow / Barlow Condensed fonts. Preserve existing behavior and i18n keys.

## Evidence on Hand
Real app code in this repository; no testimonials or external proof. Do not fabricate any.

## Product Principles
- Fast at the gym: the primary action per screen is reachable and large.
- Dense but calm: rich information available by progressive disclosure, never all at once.
- Every flow can recover: nothing needed is a dead end (e.g. create a missing exercise anywhere).
- Local and trustworthy: data stays on device.
