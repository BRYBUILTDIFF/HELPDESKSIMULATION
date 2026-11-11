# HelpDesk AI

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students practicing IT support and employees solving real IT problems are equally important audiences (confirmed by the user).

## Product Purpose

Help users troubleshoot IT problems through guided chat and practice through simulations. Describing an IT problem and starting troubleshooting is the primary entry task (confirmed by the user).

## Operating Context

The existing application provides authenticated chat, saved conversations, guided simulations, terminal exercises, and Windows labs. Administrators manage users, policies, and published simulation modules. These capabilities are evidenced by the repository.

## Capabilities and Constraints

- Preserve current functionality during the user interface redesign.
- Keep simulations easy to reach alongside the primary troubleshooting workflow.
- User account settings contain password changes, deletion of saved chat data, and sign out on all devices. Regular logout remains in the user menu.
- The current implementation uses React and Vite with an Express backend.
- This redesign starts with the overall user workspace; administrator screens are outside the current scope.

## Brand Commitments

The user requests less generic AI styling and language. The existing HelpDesk AI name and logo are available; whether they are mandatory brand assets remains undecided. Preserve them until clarified.

## Evidence on Hand

- Existing user workspace: `helpdesk-ai/client/src/pages/users/DashboardPage.jsx` and `dashboard.css`.
- Product documentation: `helpdesk-ai/docs/SYSTEM_OVERVIEW.md`.
- Existing functionality is evidence; no testimonials or performance claims have been supplied.

## Product Principles

- Make starting troubleshooting the clearest first action.
- Support practical help and learning equally.
- Keep previous work and simulations accessible.
- Use direct language and remove decoration that competes with tasks.

## Open Decisions

- Additional school, branding, or terminology requirements have not been confirmed.
- No product-specific accessibility requirements have been supplied; retain accessible keyboard and responsive interactions.
