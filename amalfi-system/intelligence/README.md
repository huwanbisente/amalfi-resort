# Amalfi Central Intelligence

This is the only folder for human-edited resort knowledge.

Edit here:

- `knowledge-base.yaml` - room types, units, PAX limits, rates, add-ons, policies, links, and static booking metadata.
- `assets/` - central resort images used by guest, admin, and chatbot experiences.

Do not edit generated JSON. After changing this folder, run from the repo root:

```powershell
.\amalfi-ops\sync\compile-kb.ps1
```

That compiles `knowledge-base.yaml` into `amalfi-system/intelligence/generated/knowledge-base.json` and refreshes the Hub database.

Runtime data such as bookings, payments, availability, chatbot state, and chat logs does not belong here. That data lives under `amalfi-system/runtime/`.
