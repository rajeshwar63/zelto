# Zelto Design System — Visual Style Guide

**Version:** 1.0
**Date:** March 10, 2026
**Purpose:** This document defines the visual language for the entire Zelto platform. Every screen, component, and interaction should follow these guidelines to ensure a consistent, polished experience across the app.

**For coding agents:** Read this file before implementing ANY UI work. This is the single source of truth for visual decisions.

---

## Design Philosophy

Zelto targets Indian SME owners who are accustomed to WhatsApp-level simplicity. The design must feel:

- **Calm and scannable** — users glance at the app between tasks, they don't study it
- **Color-coded for meaning** — every color communicates a status or category instantly
- **Spacious, not cramped** — generous padding and clear separation between elements
- **Information-dense but not overwhelming** — show what matters, hide what doesn't
- **Mobile-first** — 375px reference width, touch-friendly tap targets (minimum 44px)

---

## Color System

### Brand Colors

| Token              | Hex       | Usage                                    |
|--------------------|-----------|------------------------------------------|
| `--brand-primary`  | `#4A6CF7` | Primary actions, active tab, links, highlights |
| `--brand-primary-light` | `#6B8AFF` | Gradient end, hover states          |
| `--brand-primary-bg` | `#F0F4FF` | Primary tinted backgrounds             |

### Status Colors

These colors are used consistently across the entire app wherever order/payment status is displayed — cards, badges, chips, borders, icons, and dots.

| Token               | Hex       | Status / Meaning                         | Background Tint |
|----------------------|-----------|------------------------------------------|-----------------|
| `--status-new`       | `#4A6CF7` | New orders, new items, unread            | `#F0F4FF`       |
| `--status-dispatched`| `#FF8C42` | Dispatched, in transit, pending action   | `#FFF6F0`       |
| `--status-delivered` | `#22B573` | Delivered, completed, success, received  | `#F0FFF6`       |
| `--status-issue`     | `#FFB020` | Issues raised, warnings, needs review    | `#FFFBF0`       |
| `--status-dispute`   | `#8B5CF6` | Disputes, escalations                    | `#F5F0FF`       |
| `--status-payment`   | `#EC4899` | Payment related, verification needed     | `#FFF0F8`       |
| `--status-overdue`   | `#FF6B6B` | Overdue, past due, urgent, to pay        | `#FFF0F0`       |
| `--status-success`   | `#22B573` | Confirmed, paid, resolved                | `#F0FFF6`       |

**Rule:** Never use a status color for decoration. Every color instance must map to a meaning from this table.

### Neutral Colors

| Token              | Hex       | Usage                                    |
|--------------------|-----------|------------------------------------------|
| `--text-primary`   | `#1A1A2E` | Headings, names, amounts, primary text   |
| `--text-secondary` | `#8492A6` | Labels, subtitles, timestamps, captions  |
| `--text-tertiary`  | `#B0B8C4` | Placeholder text, disabled states, hints |
| `--text-muted`     | `#C0C8D4` | Chevrons, dividers, very subtle elements |
| `--bg-screen`      | `#F2F4F8` | Screen background (between cards)        |
| `--bg-card`        | `#FFFFFF` | Card and surface backgrounds             |
| `--bg-header`      | `#FFFFFF` | Header background                        |
| `--border-light`   | `#E8ECF2` | Card borders, dividers, tab bar border   |
| `--border-section` | `#F2F4F8` | Row dividers inside cards                |

### Color Usage Rules

1. **Backgrounds are always light tints** — never use a full status color as a background. Use the `Background Tint` column.
2. **Text on white cards** — use `--text-primary` for values, `--text-secondary` for labels.
3. **Status chips/badges** — colored text on tinted background (e.g., blue text `#4A6CF7` on `#F0F4FF` background).
4. **Count badges** — white text on solid status color (e.g., white on `#4A6CF7`).
5. **Never use pure black** (`#000000`) — use `--text-primary` (`#1A1A2E`) instead.
6. **Never use pure white for text** — use `#FFFFFF` only for text on colored badges.

---

## Typography

### Font Stack

```css
font-family: 'SF Pro Display', -apple-system, 'Segoe UI', sans-serif;
```

This uses the system font on each platform for native feel and optimal rendering. Do NOT import custom web fonts — they add load time and are unnecessary for a mobile-first business app.

### Type Scale

| Role                | Size  | Weight | Color              | Letter Spacing | Usage                              |
|---------------------|-------|--------|--------------------|----------------|------------------------------------|
| Screen Title        | 22px  | 700    | `--text-primary`   | -0.02em        | Business name, screen headers      |
| Section Header      | 13px  | 700    | `--text-secondary` | 0.08em         | "BUSINESS PULSE", "NEEDS ATTENTION" — always uppercase |
| Card Value (large)  | 20px  | 800    | Status color       | -0.02em        | Amounts in pulse cards (₹1,24,500) |
| Card Value (medium) | 15px  | 700    | `--text-primary`   | 0              | Business name on order cards, amounts |
| Body / Row Label    | 14px  | 600    | `--text-primary`   | 0              | Attention row labels, list items   |
| Caption / Meta      | 12px  | 500    | `--text-secondary` | 0              | Order IDs, item descriptions, labels on cards |
| Small Label         | 11px  | 600    | Status color       | 0              | Status chips, timestamps           |
| Badge Count         | 12px  | 700    | `#FFFFFF`          | 0              | Count inside colored badges        |
| Tab Label           | 10px  | 500/700| See tab section    | 0              | Bottom tab bar labels              |
| Subtitle            | 13px  | 500    | `--text-secondary` | 0.02em         | "Welcome back", sub-headers        |

### Typography Rules

1. **Section headers are always uppercase** with wide letter-spacing (0.08em) — this creates clear visual separation between dashboard sections.
2. **Amounts use the Indian number system** — ₹12,45,000 (lakhs), not ₹1,245,000. Build or use a formatter that inserts commas at 3, 5, 7... positions from the right.
3. **Negative letter-spacing** (-0.02em) on large values makes amounts feel tighter and more premium.
4. **Font weight 800 (extra bold)** is reserved for large monetary amounts only.
5. **Never use font-weight 400 (regular)** — minimum is 500. The app should feel confident, not thin.

---

## Spacing & Layout

### Spacing Scale

| Token    | Value | Usage                                              |
|----------|-------|----------------------------------------------------|
| `--sp-xs`| 4px   | Icon-to-text micro gap, badge padding              |
| `--sp-sm`| 8px   | Gap between cards in a list, inner element spacing  |
| `--sp-md`| 12px  | Section padding top, icon-to-label gaps             |
| `--sp-lg`| 16px  | Screen horizontal padding, section vertical padding |
| `--sp-xl`| 20px  | Header horizontal padding                           |
| `--sp-2xl`| 24px | Major section gaps, screen top padding              |

### Layout Rules

1. **Screen horizontal padding:** 16px on both sides — consistent on every screen.
2. **Card internal padding:** 14px–16px — enough to breathe but not wasteful.
3. **Grid cards (Business Pulse):** 10px gap between cards in the 2×2 grid.
4. **List rows (Needs Attention):** 13px vertical padding per row, with 1px `--border-section` divider.
5. **Stacked cards (Recent Activity):** 8px gap between individual order cards.
6. **Section header to content:** 10px gap.
7. **Section to section:** 12px gap (section padding handles this naturally).
8. **Bottom padding on last section:** 100px minimum (clears the tab bar with room to spare).

---

## Component Patterns

### Metric Card (Business Pulse style)

Use for any screen that needs to show a summary number with a label.

```
┌────────────────────────┐
│ Label              [Icon]│  ← 12px grey label, 26px icon in tinted circle
│                          │
│ ₹1,24,500               │  ← 20px extra-bold in status color
└────────────────────────┘
```

- Background: `--bg-card` (`#FFFFFF`)
- Border: 1px solid, using the card's background tint color
- Border radius: 14px
- Padding: 14px
- Icon container: 26×26px, 8px border-radius, filled with the tint color
- Label: 12px, 600 weight, `--text-secondary`
- Value: 20px, 800 weight, status color

**When to use:** Dashboard pulse, order summary screens, analytics, any KPI display.

### Attention Row (Needs Attention style)

Use for any list where each row represents a category with a count.

```
│ [Icon]  Row Label                    (Count) › │
```

- Container: White card with 14px border-radius, rows divided by 1px `--border-section`
- Row padding: 13px horizontal 16px
- Icon: 18px emoji or icon, left-aligned
- Label: 14px, 600 weight, `--text-primary`
- Count badge: 22px height, 11px border-radius (pill shape), 12px bold white text on solid status color
- Chevron: `›` character, 16px, `--text-muted`
- Zero-count rows: opacity 0.4, no badge shown
- Tap: full row is tappable (highlight on press)

**When to use:** Dashboard attention section, settings menu, category lists, filter screens.

### Order Card (Recent Activity style)

Use everywhere an order is displayed — dashboard, orders tab, search results, filtered lists.

```
┃ Business Name  •          ₹32,500
┃ [Status Chip] · ORD-1247   10m ago
┃ Cotton Fabric × 500m
```

- Container: White card, 14px border-radius, 14px–16px padding
- Left border: 3px solid in status color (only for unread/new items; transparent for read items)
- Unread dot: 6px blue circle next to business name (only for unread)
- Row 1: Business name (15px, 700, `--text-primary`) + Amount (15px, 700, right-aligned)
- Row 2: Status chip + Order ID (12px, `--text-secondary`) + Timestamp (11px, `--text-tertiary`, right-aligned)
- Row 3: Item description (12px, `--text-secondary`)
- Status chip: 11px, 600 weight, status color text on 15% opacity status color background, 6px border-radius, 2px 8px padding
- Card gap: 8px between stacked order cards

**When to use:** Everywhere orders appear. This is the single, canonical order card component. Do not create alternative order card layouts.

### Status Chip

Small inline badge showing order/payment status.

```
[New Order]  [Dispatched]  [Delivered]  [Issue Raised]
```

- Font: 11px, 600 weight
- Color: Status color from the status color table
- Background: Status color at 15% opacity (append `15` to hex, or use rgba)
- Padding: 2px 8px
- Border radius: 6px
- Never has a border — the tinted background is sufficient

**When to use:** Inside order cards, order detail headers, list items, anywhere a status label is needed.

### Count Badge

Circular or pill-shaped badge showing a number.

```
(4)  (12)  (0)
```

- Min width: 22px, height: 22px
- Border radius: 11px (fully round for single digits, pill for 2+)
- Padding: 0 6px
- Font: 12px, 700 weight, white (`#FFFFFF`)
- Background: Solid status color
- Zero count: Do not render the badge at all

**When to use:** Needs Attention rows, tab badges (Home tab only), notification indicators.

### Section Header

```
NEEDS ATTENTION                    12 items
```

- Text: 13px, 700 weight, `--text-secondary`, uppercase, letter-spacing 0.08em
- Optional right-side badge: Total count in a pill badge (background `--status-overdue`, white text)
- Margin bottom: 10px

**When to use:** Every major section on every screen. Consistent section labeling across the app.

---

## Surfaces & Elevation

Zelto uses a **flat design with subtle depth** — no heavy shadows, no gradients on cards.

| Surface          | Background     | Border                | Shadow                         | Radius |
|------------------|----------------|-----------------------|--------------------------------|--------|
| Screen           | `--bg-screen`  | None                  | None                           | N/A    |
| Card             | `--bg-card`    | 1px solid tint OR none| None                           | 14px   |
| Header           | `--bg-header`  | None                  | None (border on tab bar below) | N/A    |
| Tab Bar          | `--bg-card`    | 1px solid `--border-light` top | None                  | N/A    |
| Modal / Sheet    | `--bg-card`    | None                  | `0 -4px 20px rgba(0,0,0,0.08)` | 20px top |
| Avatar circle    | Gradient       | None                  | `0 4px 12px rgba(74,108,247,0.3)` | 12px |
| Floating button  | `--brand-primary` | None               | `0 4px 16px rgba(74,108,247,0.4)` | 14px |

### Elevation Rules

1. **Cards have no shadow** — they're distinguished from the screen background by their white fill against `--bg-screen` grey. This keeps the UI clean and fast-rendering.
2. **Only floating elements get shadows** — FABs, modals, bottom sheets.
3. **Avatar gets a subtle branded shadow** — this is the only decorative shadow in the app.
4. **The tab bar uses a border, not a shadow** — 1px top border in `--border-light`.

---

## Border Radius

| Element                | Radius | Notes                                    |
|------------------------|--------|------------------------------------------|
| Cards (all types)      | 14px   | Consistent across all card components    |
| Avatar / Profile image | 12px   | Slightly squared, not fully round        |
| Status chips           | 6px    | Small, subtle rounding                   |
| Count badges           | 11px   | Fully round (half of 22px height)        |
| Icon containers        | 8px    | Small squares with rounding              |
| Buttons (primary)      | 12px   | Matches avatar radius                    |
| Buttons (small)        | 8px    | Compact actions                          |
| Input fields           | 10px   | Between card and chip radius             |
| Modal / Bottom sheet   | 20px   | Top corners only                         |
| Phone frame (if applicable) | 40px | Device frame in mockups only         |

**Rule:** Never use fully round corners (50%) except on count badges and dot indicators. The design language is **rounded rectangles**, not circles.

---

## Tab Bar

```
┌─────────────────────────────────────┐
│  ⌂        📋        🤝        🏢   │
│ Home    Orders  Connections Business │
└─────────────────────────────────────┘
```

- Height: auto (content-driven, ~48px + safe area)
- Top padding: 6px
- Background: `--bg-card`
- Top border: 1px solid `--border-light`
- Icon size: 22px
- Label: 10px
- Active state: Icon full color + label in `--brand-primary` (700 weight)
- Inactive state: Icon greyscale (filter: grayscale(1), opacity 0.5) + label in `--text-secondary` (500 weight)
- Badge on Home tab: 8px red dot (`--status-overdue`), positioned top-right of icon, 2px white border

### Tab Bar Rules

1. **Only the Home tab ever shows a badge** — no other tabs get notification indicators.
2. **Four tabs maximum** — never add a fifth tab. Use navigation within screens instead.
3. **Labels are always visible** — don't hide labels on inactive tabs.

---

## Interaction States

| State        | Visual Treatment                                          |
|--------------|-----------------------------------------------------------|
| Default      | As specified in component patterns                        |
| Pressed      | Background darkens slightly (overlay `rgba(0,0,0,0.04)`) |
| Disabled     | Opacity 0.4, no pointer events                           |
| Loading      | Skeleton placeholder (light grey pulse animation)         |
| Empty        | Centered illustration + message text                      |
| Error        | Inline retry button, not full-screen error                |

### Skeleton Loading

When data is loading, show placeholder shapes that match the final layout:

- Metric cards: Grey rounded rect for value, smaller rect for label
- Attention rows: Grey bars for label and badge
- Order cards: Grey bars for name, amount, status
- Animation: Subtle pulse (`opacity: 0.4 → 0.7 → 0.4`) on a 1.5s loop
- Color: `#E8ECF2` base

### Pull-to-Refresh

- Standard platform pull-to-refresh behavior
- Spinner color: `--brand-primary`
- Refreshes all visible sections

---

## Indian Number Formatting

All monetary values in the app MUST use the Indian numbering system:

| Value        | Correct (Indian)  | Wrong (Western)  |
|--------------|--------------------|------------------|
| 1,000        | ₹1,000             | ₹1,000           |
| 100,000      | ₹1,00,000          | ₹100,000         |
| 1,245,000    | ₹12,45,000         | ₹1,245,000       |
| 28,730,000   | ₹2,87,30,000       | ₹28,730,000      |

### Formatter Function

```typescript
function formatINR(amount: number): string {
  const formatted = amount.toLocaleString('en-IN', {
    maximumFractionDigits: 0,
    style: 'currency',
    currency: 'INR',
  });
  return formatted; // Returns "₹12,45,000"
}
```

Use this formatter everywhere amounts are displayed. Never format amounts manually.

---

## Iconography

Zelto uses **Phosphor Icons** (`@phosphor-icons/react`) for all structural icons.
Phosphor provides 6 weights: thin, light, regular, bold, fill, duotone.

### Weight Rules

| Context               | Weight    | Size  |
|-----------------------|-----------|-------|
| Tab bar — active      | fill      | 24px  |
| Tab bar — inactive    | regular   | 24px  |
| Status in cards       | duotone   | 18px  |
| Status chip inline    | bold      | 12px  |
| Action buttons        | bold      | 20px  |
| Settings rows         | regular   | 20px  |
| Empty state (large)   | thin      | 48-64px |

### Icon Mapping

| Context           | Icon Component   | Import                    |
|-------------------|------------------|---------------------------|
| Home tab          | `House`          | `@phosphor-icons/react`   |
| Orders tab        | `ClipboardText`  | `@phosphor-icons/react`   |
| Connections tab   | `Handshake`      | `@phosphor-icons/react`   |
| Business tab      | `Buildings`      | `@phosphor-icons/react`   |
| To Pay            | `ArrowUp`        | bold weight               |
| To Receive        | `ArrowDown`      | bold weight               |
| Overdue           | `WarningCircle`  | fill weight               |
| Dispatched        | `Truck`          | duotone weight            |
| Delivered         | `CheckCircle`    | duotone weight            |
| Disputes          | `Scales`         | duotone weight            |
| Payment           | `CreditCard`     | duotone weight            |
| New Orders        | `Sparkle`        | duotone weight            |
| Search            | `MagnifyingGlass`| regular weight            |
| Filter            | `Funnel`         | regular weight            |
| Chevron right     | `CaretRight`     | size 16, text-muted color |

### Color Rules

- Icon color ALWAYS comes from design system tokens
- Status icons use the matching `--status-*` color
- Inactive/muted icons use `var(--text-secondary)` with opacity 0.6
- Never use raw hex on icons — always reference a CSS variable
- Icon color must match its context's status color (same icon in different contexts may have different colors)

### Never Do

- Never use emoji as structural UI icons
- Never use PNG/JPG raster icons
- Never mix icon libraries (Phosphor only)
- Never use `fill` weight for non-active-tab contexts
- Never make icon-only buttons without aria-label

---

## Applying This System to Other Screens

### Orders Tab

- Use the same **Order Card** component from Dashboard's Recent Activity
- Section headers (All, Pending, Completed) use the **Section Header** pattern
- Filter chips at the top use the **Status Chip** pattern but larger (13px, 8px 14px padding)
- Empty state: centered message with `--text-secondary`

### Connections Tab

- Connection cards follow the same card pattern: 14px radius, 14px-16px padding, white on grey screen
- Connection status uses status colors (pending = `--status-dispatched`, active = `--status-delivered`)
- Count badges on connection requests use the **Count Badge** pattern

### Order Detail Screen

- Status displayed as a large **Status Chip** in the header area
- Financial summary uses the **Metric Card** pattern (2-column grid for amount breakdowns)
- Action buttons: `--brand-primary` background, white text, 12px radius, full width
- Timeline/activity log: left-bordered list items using status colors for each event type

### Business Screen (formerly Profile)

- Avatar uses the branded gradient with shadow (as defined in Surfaces)
- Settings rows follow the **Attention Row** pattern (icon + label + chevron)
- Profile completeness could use a progress bar in `--brand-primary`

### Any New Screen

Before building any new screen, check this document and use the existing component patterns. The rule is: **if a pattern exists here, use it. Don't invent new ones.**

---

## CSS Variables Template

Copy this into the app's global styles:

```css
:root {
  /* Brand */
  --brand-primary: #4A6CF7;
  --brand-primary-light: #6B8AFF;
  --brand-primary-bg: #F0F4FF;

  /* Status */
  --status-new: #4A6CF7;
  --status-dispatched: #FF8C42;
  --status-delivered: #22B573;
  --status-issue: #FFB020;
  --status-dispute: #8B5CF6;
  --status-payment: #EC4899;
  --status-overdue: #FF6B6B;
  --status-success: #22B573;

  /* Text */
  --text-primary: #1A1A2E;
  --text-secondary: #8492A6;
  --text-tertiary: #B0B8C4;
  --text-muted: #C0C8D4;

  /* Backgrounds */
  --bg-screen: #F2F4F8;
  --bg-card: #FFFFFF;
  --bg-header: #FFFFFF;
  --border-light: #E8ECF2;
  --border-section: #F2F4F8;

  /* Spacing */
  --sp-xs: 4px;
  --sp-sm: 8px;
  --sp-md: 12px;
  --sp-lg: 16px;
  --sp-xl: 20px;
  --sp-2xl: 24px;

  /* Radius */
  --radius-card: 14px;
  --radius-avatar: 12px;
  --radius-button: 12px;
  --radius-button-sm: 8px;
  --radius-chip: 6px;
  --radius-badge: 11px;
  --radius-icon: 8px;
  --radius-input: 10px;
  --radius-modal: 20px;
}
```

---

## Checklist for Coding Agents

Before submitting any UI work, verify:

- [ ] All colors come from the design system tokens — no hardcoded hex values outside this system
- [ ] All border-radius values match the radius table
- [ ] Section headers are uppercase with 0.08em letter-spacing
- [ ] Amounts use Indian number formatting (₹12,45,000 not ₹1,245,000)
- [ ] Card padding is 14-16px, card radius is 14px
- [ ] Status colors are used consistently (same status = same color everywhere)
- [ ] No pure black (#000000) text — use --text-primary
- [ ] Font weight minimum is 500
- [ ] Touch targets are minimum 44px
- [ ] Skeleton loaders shown during data fetches, not blank screens
- [ ] Only the Home tab has a notification badge
