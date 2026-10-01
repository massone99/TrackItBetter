---
name: TrackItBetter
description: Clear, tactile tools for logging bodyweight training and understanding progress.
colors:
  background: "#F2F4F5"
  surface: "#FFFFFF"
  surface-muted: "#E8EDF0"
  text: "#19262E"
  text-muted: "#536571"
  border: "#D6DFE5"
  accent: "#2F45C8"
  accent-strong: "#2F45C8"
  accent-soft: "#DFE3F8"
  accent-text: "#FFFFFF"
  tab-bar: "#FFFFFF"
  hero: "#2F45C8"
  hero-text: "#FFFFFF"
  record: "#8A5517"
  record-soft: "#F4E6D3"
  success: "#276F50"
  success-soft: "#E4F2EA"
  success-text: "#FFFFFF"
  warning: "#A64A22"
  dark-background: "#111A21"
  dark-surface: "#1B2730"
  dark-surface-muted: "#283742"
  dark-text: "#F0F4F7"
  dark-text-muted: "#A9B8C4"
  dark-border: "#354652"
  dark-accent: "#8B9BFF"
  dark-accent-strong: "#A4B0FF"
  dark-accent-text: "#10152A"
  dark-accent-soft: "#262F52"
  dark-record: "#E2AE6E"
  dark-record-soft: "#3A2F22"
  dark-warning: "#EE9A74"
  dark-success: "#6FCB9F"
  dark-success-soft: "#203D33"
  dark-success-text: "#102B20"
  dark-tab-bar: "#181E29"
  dark-hero: "#3144B8"
  dark-hero-text: "#FFFFFF"
typography:
  title:
    fontFamily: BarlowCondensed_700Bold
    fontSize: "36px"
    lineHeight: "40px"
    letterSpacing: "-0.4px"
  section:
    fontFamily: BarlowCondensed_600SemiBold
    fontSize: "23px"
    lineHeight: "28px"
  heading:
    fontFamily: Barlow_600SemiBold
    fontSize: "18px"
    lineHeight: "25px"
  body:
    fontFamily: Barlow_400Regular
    fontSize: "15px"
    lineHeight: "22px"
  label:
    fontFamily: Barlow_500Medium
    fontSize: "13px"
    lineHeight: "19px"
  metric:
    fontFamily: BarlowCondensed_700Bold
    fontSize: "40px"
    lineHeight: "44px"
rounded:
  small: "8px"
  control: "12px"
  surface: "16px"
  sheet: "28px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
    height: "54px"
  button-secondary:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
---

# Design System: TrackItBetter

## Overview

Retain the established "Chalk, steel, birch" identity: chalk and steel neutrals, gym-mat blue, and warm record highlights. The interface supports an athlete operating the app with one hand during training. Clear tasks, readable measurements, and recoverable actions determine the layout.

The system refines the existing product. Workout controls, program editing, history, progress, body tracking, photos, mobility, pose analysis, reminders, and data tools remain available. Existing English and Italian copy and the local data model are product constraints.

## Colors

The frontmatter records the light theme and the main dark theme roles. `src/shared/theme/palette.ts` is the runtime source for every role and theme, including dark record, warning, hero, and success foreground colors.

Blue identifies actions and selection. Green identifies completed work and reached goals. Warm brown identifies personal records. Warnings use their own role. Secondary text on the blue workout hero uses the hero foreground rather than a neutral gray.

## Typography

`src/shared/theme/typography.ts` loads Barlow for reading and Barlow Condensed for page titles, section titles, and measurement values. `tokens.ts` defines the shared type roles. Numeric measurements use tabular figures.

The shared `Text` component applies the chosen interface scale once to font metrics and resolves explicit font families for Android. Native system font scaling remains enabled. The portable values above describe logical sizes at the default scale; React Native renders them as logical units, not fixed screen pixels.

## Layout

`Screen` provides a centered column up to 640 logical units wide, page padding of 20, safe-area protection, keyboard handling, and a gap of 20 between major blocks. Group related actions with smaller gaps and place section headings above their associated content.

At widths below 768, keep the five existing tab destinations in a bottom navigation bar. At expanded widths, show the same destinations in a navigation rail. Selected destinations carry a blue tonal indicator and a visible label.

On Today, start or resume training first, show planned sessions when present, then show weekly progress and the four existing activity totals. Guided tools, recent records, and quick actions remain reachable in the same scrollable screen.

In the workout logger, separate set values and completion from load and set options so controls fit narrow screens. History editing follows the same grouping. Keep swipe actions, repeat presses, typed values, timers, warm-ups, RPE, notes, video, and exercise reordering.

The active workout exposes Collapse all / Expand all alongside individual exercise folding. Completing an exercise still folds its results, and adding or reopening a set unfolds it. Folding never stops a running timer.

Exercise details and the exercise scope of Statistics include an additional reps-at-load analysis. Keep signed logged loads separate, including zero and assistance. Show the best set and total reps per completed session, the contributing sets, and the change from the previous session at that load. Retain every existing analysis metric and comparison control.

## Elevation & Depth

Use flat, bordered surfaces and tonal controls for ordinary content. Sheets use a dark scrim and native modal transitions. The existing actionable toast uses an offset shadow and native elevation; decorative shadows do not define cards.

## Shapes

Cards and list groups use radius 16; buttons, fields, and chips use radius 12. Sheets use radius 28 on their top corners. Pills remain appropriate for small status badges, navigation indicators, and progress tracks.

## Components

- Use `ActionButton` variants to distinguish the primary action, supporting actions, and destructive confirmations. The base minimum height is 54 logical units and is clamped to the 48 touch-target minimum at smaller interface scales. Labels can wrap.
- Use `IconButton` for labeled icon actions. Its hit box remains at least 48 even at a small interface scale.
- Use `TextField` for text entry. When present, its label stays above the field; the single-line base minimum is 52 and the multiline base minimum is 84. Both follow the interface scale and retain at least 48 logical units. Multiline text is top-aligned; focused borders use the accent-strong role and validation uses the warning role.
- Use `Card` for ordinary content surfaces: a 1px border, 16 radius, 16 padding, and 12 internal gap, with tonal layering instead of a decorative shadow.
- Use `ListGroup` and `ListRow` for related destinations or records. Groups use the surface radius and a border; rows have a 68 logical-unit base minimum with 16 horizontal and 14 vertical padding, all scaled with the interface setting. Keep trailing controls separate from the row's pressable area. Descriptions can wrap without truncation.
- Use `Chip` and `SegmentedControl` for selection. Chips use 12 radius, 10 by 14 padding, and a 48 minimum; their selected state uses the accent-soft fill and accent border and is exposed to accessibility services.
- Use `Metric` for labeled counts and `ProgressMeter` for measured progress. Progress is clamped to its real total and has an accessible numeric value.
- Use `Sheet` for confirmations and short choices. Sheets use 28 top radius, 20 horizontal padding, and a 640 logical-unit maximum width. Keep Android Back, outside dismissal, and the visible close control working. Content scrolls within the available height.
- Use the five tab destinations in the compact bottom bar or expanded navigation rail. The compact bar is at least 72 logical units high and scales from a 76 base; the expanded rail is 100 logical units wide. Active destinations keep the blue tonal indicator and visible label.
- The mobility player keeps transport controls fixed while long exercise instructions can scroll. Its timer fits the available width.
- Duration fields use a shared minute/second editor with exact second entry, quick presets, adjustment buttons, Save, and Cancel. Opening or cancelling the editor never changes stored values. Holds use this editor in active and historical workouts, micro-sessions, program targets, and mobility routines. Existing rest presets remain direct shortcuts.

## Do's and Don'ts

- Preserve data, routes, translated copy, units, and every existing action when adjusting presentation.
- Use the semantic palette for both themes and the shared components for new screens.
- Keep actual training feedback factual: completed sets, weekly sessions, and achieved records.
- Keep complex information available through the existing expansion, selection, and editing controls.
- Respect interface size, system font size, safe areas, reduced motion, and keyboard behavior.
- Avoid introducing rankings, artificial urgency, fabricated achievements, or new account requirements.
- Native visual review requires current app captures from an Android device or emulator; a successful bundle alone does not prove layout quality.
