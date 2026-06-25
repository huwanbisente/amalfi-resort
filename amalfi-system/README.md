# Amalfi System

This folder holds the operator-owned system data for Amalfi.

Status: current as of May 25, 2026. This remains the source area for V3
knowledge, assets, and runtime state used by Guest Web, Admin Hub, Admin Desk,
Hub API, Chatbot, reports, and imports.

- `intelligence/`: edit resort facts, prices, PAX limits, policies, and image assets here.
- `runtime/`: local/live runtime state such as SQLite databases, chatbot state, and logs.

For knowledge-base changes, edit:

`amalfi-system/intelligence/knowledge-base.yaml`

Then run:

`.\amalfi-ops\sync\compile-kb.ps1`

Do not edit generated JSON by hand.

Runtime data is operational data. Back it up before production rollout, imports,
migrations, or deployment work that could touch persistent volumes.
