# Page — Agent Guide

Follow the parent guide first. This file adds only durable frontend expectations; it is not a route or source-structure inventory.

## Explore First

Before changing page behavior, inspect the current router setup, route generation config, API client, app providers, styling system, and user-facing docs relevant to the task. Do not rely on this file for dependency versions, route inventory, entry points, or source structure.

## Conventions

- **Follow current route patterns**: keep route files focused on composition and move reusable logic into the established local/shared locations after inspecting current examples.
- **API contract**: derive API calls, request shapes, and response types from the current typed client and backend exports. Do not duplicate schemas or hand-write endpoint contracts.
- **Cross-package types**: keep browser-side imports from backend packages type-only unless the current bundler config explicitly supports runtime imports.
- **Mini App behavior**: use the current Telegram SDK/helpers and established hooks. Do not read platform globals directly when a local abstraction already exists.
- **Error surface**: reuse the current page API error helpers instead of adding route-local parsing for shared error shapes.
- **Hook order**: every hook must run before any conditional return.
- **Generated router artifacts**: after changing route structure, run the current root verification command so generated routing artifacts stay current.
