---
version: 1
slug: "frontend-src-pages-profile-index-tsx"
primary_target: "frontend/src/pages/Profile/index.tsx"
related_targets: []
---

## Surface

`/profile` is an authenticated TaskFlow Operate surface. Signed-in users manage existing personal details, copy their immutable user ID, change their avatar, edit the three notification preferences, and open the password-change flow.

## Direction contract

THESIS: A single account ledger keeps identity, personal information, notifications, and security in one readable flow; it avoids a tabbed settings layout.

OWN-WORLD: Inherit TaskFlow's charcoal workbench, compact Inter hierarchy, thin neutral rules, 8px controls, and restrained amber signal. Keep the existing AppShell and its responsive behavior.

STORY: The signed-in user can identify the account, copy its ID, update personal details and preferences, change the avatar, and reach password controls. All existing actions remain available with equal access; use only existing product data and controls.

FIRST VIEWPORT: Center a 760px single-column ledger in the AppShell content. The identity row holds the 48px avatar and visible `Değiştir` action, name, email, and copyable user ID. Below it, show `Kişisel Bilgiler` with name and email inputs and the save action, `Bildirim Tercihleri` with three switch rows, and `Güvenlik` with the password action, divided by thin rules. No local tabs or hidden sections.

FORM: Hesap Kaydı, candidate 1 in the grounded list, selected from dealt positions 6, 7, 1; seed key `090267be`. Approved comp: `frontend/.impeccable/mocks/decision/profile-account-ledger.png`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

- Preserve the current profile API flow, loading/error behavior, and avatar/password interactions.
- Keep tenant and role data read-only; add no company-management controls, profile bio, activity metrics, or unsupported claims.
- Keep all sections available on mobile and respect the existing WCAG AA, keyboard, focus, and reduced-motion requirements.
- No new shipping raster is required; the avatar remains user data from the existing profile flow.

## Unresolved decisions

None. Existing labels, API behavior, and preference state come from the current Profile page and its product documentation.
