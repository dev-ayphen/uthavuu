# உதவு (Uthavu) — Product Summary

> **Helping begins with one person.**

A plain-language description of what Uthavu is, who it serves and how it works.

**This is not the technical source of truth.** For implementation detail see
[the technical documents](#where-to-go-for-detail) at the end.

**Last updated:** 2026-08-18

---

## 1. What Uthavu is

Uthavu is a **community emergency and help network for Tamil Nadu**. It connects people who
need help with people nearby who can give it — in real time, in under a minute.

The name is Tamil: **உதவு** means *"help"* — as an instruction, not a noun. The product is
built around that: seeing something and doing something about it.

### The problem

Every day, ordinary situations go unresolved because the people who could help don't know
they exist:

- An injured stray dog on a busy road
- Surplus food after a wedding, hours from being thrown away
- An elderly neighbour who needs medicine collected
- A stranded motorist on a highway at night
- An urgent blood requirement at a district hospital

Someone nearby would help. They simply never find out.

### The idea

> **Someone nearby needs help → they report it → nearby users see it → someone says
> "I'll help" → help is given → the outcome becomes an Impact Story.**

---

## 2. The core loop

```
   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  REPORT  │ ──▶ │ DISCOVER │ ──▶ │  ACCEPT  │ ──▶ │   HELP   │ ──▶ │  IMPACT  │
   │          │     │          │     │          │     │          │     │  STORY   │
   └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
   Spot it,         Nearby users     "I'll help"      Coordinate,      Published,
   post it in       see it within    — the mission    complete,        shareable
   under a minute   their radius     begins           record proof     proof it worked
```

1. **Report** — a photo, a category, a short description, a location. Under a minute.
2. **Discover** — the request appears for people **near it**, within their chosen radius.
3. **Accept** — one or more volunteers take it on. A 15-minute window to confirm, or it
   returns to the queue for someone else.
4. **Help** — participants coordinate privately; anyone passing can add useful public
   information.
5. **Impact Story** — the completed mission becomes a public record: before, after, who
   helped, how long it took.

---

## 3. Who uses it

| | Role | What they do |
|---|---|---|
| 📱 | **Reporter** | Sees a situation and posts it |
| 📱 | **Volunteer** | Accepts a nearby request and helps |
| 📱 | **Bystander** | Adds useful information to an active request |
| 🖥️ | **Moderator (Ops)** | Reviews flagged content, manages reports |
| 🖥️ | **Administrator** | Platform settings, categories, broadcasts, sponsors |

**There is no separate "volunteer account".** The same person reports one day and helps the
next — which is the point.

---

## 4. Help categories

Eight categories, each with its own urgency profile and time window:

| | | | |
|---|---|---|---|
| 🐶 Animal Rescue | ❤️ Medical Help | 🍱 Food Donation | 🚗 Roadside Help |
| 👴 Elderly Support | 🩸 Blood Donation | 🌧 Disaster Relief | 🤝 Community Help |

A ninth — 🔍 **Lost & Found** — is available when reporting.

Each category sets how long a request stays open. Blood donation expires in hours; a
community request may stay open for days. Disaster relief is managed centrally.

---

## 5. How discovery works

**Location and radius — not browsing.**

```
📍 Velachery
Within 5 km
```

The default experience is *what needs help near me right now*, at a radius the user
chooses: **1 · 3 · 5 · 10 km**.

**Explore Another Location** is a deliberate secondary mode — for checking on family in
another town, or planning ahead. When active, the app says so plainly:

> 🌍 **Exploring Trichy — not your current location**

There is no state-wide or district-first browse. Help is local, or it isn't help.

---

## 6. Two conversations, not one

On an **active request**:

| | Who can post | Who can see | For |
|---|---|---|---|
| 💬 **Community Comments** | Anyone | Everyone | Useful information — *"the dog moved near the temple"*, *"Blue Cross has already been contacted"* |
| 💬 **Mission Chat** | Reporter + accepted volunteers | Participants only | Coordination — *"I'm 5 minutes away, bring the rope"* |

A passer-by may know something that matters. Keeping that out would be a loss. But
coordination between the people actually acting shouldn't be buried in it — so the two are
separate.

On a **completed Impact Story**: ❤️ Like · 💬 Comments · 📤 Share — open to everyone.

---

## 7. Trust, without scores

Uthavu shows who someone is, not how they rate:

```
👤 Ravi Kumar
💼 Software Engineer
✓ Verified Reporter
✓ 18 Successful Reports
```

**There is no star rating.** A person asking for help in an emergency is not a service to
be scored, and a low score would suppress genuine requests. Trust comes from verification
and completion history.

Every element above is subject to the reporter's own privacy settings — name, photo,
profession and statistics can each be withheld, and a request can be posted anonymously.

---

## 8. Privacy

| Principle | How it works |
|---|---|
| **Post anonymously** | Available on every report |
| **Phone stays hidden by default** | Revealed only if the reporter chooses, and only to accepted volunteers |
| **Email is private** | Collected once, never shown publicly |
| **Granular control** | Name, photo, profession and community stats each have their own toggle |
| **Location is purpose-bound** | Used while creating or responding to a request |

---

## 9. The two products

```
                    ┌─────────────────────┐
                    │  BACKEND / DATABASE │
                    └──────────┬──────────┘
                     ┌─────────┴─────────┐
                     ▼                   ▼
            ┌────────────────┐   ┌────────────────┐
            │   MOBILE APP   │   │   ADMIN WEB    │
            │   (citizens)   │   │  (moderators)  │
            └────────────────┘   └────────────────┘
```

### 📱 Mobile app — where help happens

```
├── Discover nearby help
├── Report
├── Accept / Join
├── Mission
├── Community Comments · Mission Chat
├── Complete
├── Impact Story
├── Alerts
├── Profile
└── Support
```

### 🖥️ Admin web — oversight, not a second app

```
├── Dashboard        — live activity
├── Users            — accounts, suspensions
├── Reports          — review, flags, moderation
├── Community        — impact stories, broadcasts
├── Analytics        — district performance
├── Platform         — categories, settings, support, health
├── Monetization     — sponsors, AdMob
└── Admin            — admin accounts, audit
```

The admin console **watches and moderates**. It is not a copy of the app, and staff do not
respond to requests through it.

---

## 10. How Uthavu sustains itself

Two independent streams, neither charged to users:

| | What it is | Who controls it |
|---|---|---|
| **Sponsors** | Local organisations funding relevant missions — a pet clinic beside animal rescues | Uthavu sells and places these directly |
| **Google AdMob** | Standard advertising in defined slots | Google supplies the ads; Uthavu controls placement and frequency only |

**Users never pay, and money never moves between users.** There is no wallet, no donations
between people, no transaction fees.

---

## 11. What Uthavu is deliberately *not*

| Not | Why |
|---|---|
| ❌ A social network | No follows, no feeds, no profiles to browse |
| ❌ A rating platform | People asking for help are not services |
| ❌ A payment app | No wallet, no transfers, no fees |
| ❌ A gig marketplace | Volunteers aren't workers and aren't paid |
| ❌ A directory of every district | Discovery is local by design |
| ❌ A map product | The map serves the request; the request isn't a pin on a map |

Every one of these was considered and set aside. The product stays narrow on purpose.

---

## 12. Current status

Uthavu today is a **working prototype of both products** — the screens, flows and
interactions are built and usable.

| Layer | Status |
|---|---|
| 📱 Mobile app — 22 screens | 🟢 Built and navigable |
| 🖥️ Admin web — 22 tabs | 🟢 Built and interactive |
| 🔗 Backend / database | 🔵 **Not built** |
| 🔗 The connection between them | 🔵 **Not built** |

**Both products currently run on local, simulated data.** A report published in the app
does not reach the admin console, and admin actions do not reach the app. That connection
is the next major piece of work.

Features that depend on device or platform services — camera capture, GPS, push
notifications, real authentication — are specified but not yet implemented.

> Honest summary: **the product is designed and the interfaces are built; the system behind
> them is not.** See [Implementation Status](./IMPLEMENTATION-STATUS.md) for a
> module-by-module breakdown.

---

## Where to go for detail

| Document | For |
|---|---|
| [`IMPLEMENTATION-STATUS.md`](./IMPLEMENTATION-STATUS.md) | What is built, partly built, or planned — module by module |
| [`USER-JOURNEYS.md`](./USER-JOURNEYS.md) | End-to-end flows with decision logic |
| [`API-CONTRACT.md`](./API-CONTRACT.md) | The backend contract both products need |
| [`PRODUCT-DECISIONS.md`](./PRODUCT-DECISIONS.md) | Decisions and their code impact |
| [`mobile/`](./mobile/) | 26 documents — every screen, in detail |
| [`webadmin/`](./webadmin/) | 12 documents — every tab, in detail |
| `apps/mobile/FUNCTIONAL_FLOW.md` | The product specification — 19 business rules |

**Rule of thumb:** this document explains *what Uthavu is*. `FUNCTIONAL_FLOW.md` defines
*what it should do*. The `docs/` folders record *what the code does today*.
