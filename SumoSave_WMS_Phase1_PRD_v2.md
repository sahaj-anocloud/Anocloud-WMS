SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

> **SUMOSAVE** **RETAIL** **VENTURES** **PVT.** **LTD.**
>
> **Product** **Requirements** **Document** **Phase** **1:**
> **Inventory** **Foundation,** **Vendor** **Visibility** **&**
> **Digital** **Inbound** **Control**

**<u>Warehouse Management System — WMS PRD v2.0 \| Merged & Enhanced
Edition</u>**

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 1

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**A.** **Requirement** **Synthesis**

The source material — comprising on-site diagnostics conducted 9–13
March 2026 across the DC and retail stores, fourteen stakeholder
sessions with SumoSave's CEO, SCM Head, CMO/BnM Head, and warehouse and
store operational teams — points to one central conclusion: SumoSave
does not have an inbound execution problem alone; it has a
truth-at-first-touch problem. Phase 1 therefore must do more than
digitise receiving. It must establish a control architecture that begins
before truck arrival, creates vendor visibility, enforces master-data
readiness, digitises gate and dock events, captures batch-and-expiry
traceability with practical risk-based scanning, performs rule-driven
receipt validation against SAP, and produces a clean inventory state for
later warehouse and store phases.

> • **Blind** **pre-arrival:** The current inbound chain is completely
> blind before arrival because there is no secure vendor portal, no
> appointment scheduling, and no dependable ASN discipline. The
> warehouse reacts to truck arrivals as surprises, making dock planning,
> labour pre-staging, and QC resource allocation impossible.
>
> • **Master** **data** **incompleteness:** Master data is incomplete
> and partly untrusted, especially volumetric attributes and barcode
> readiness, which would later break slotting, box planning, and dock
> productivity. The CEO confirmed that approximately 40–50% of SKUs lack
> accurate weight and dimension data.
>
> • **Person-dependent** **control:** Receiving control is entirely
> person-dependent today: supervisors use calculators for GKM checks,
> rely on memory for promotional bundles, and manually escalate tax or
> price disputes via WhatsApp. The system must embed these rules so they
> cannot be bypassed by any individual.
>
> • **Weak** **sampling** **without** **throughput** **trade-off:** The
> current one-item scan pattern is operationally fast but control-weak,
> allowing expired batches, wrong items, and damaged stock to enter the
> network undetected. Phase 1 must preserve dock throughput while
> replacing weak blanket sampling with category-aware risk-based
> scanning rules.
>
> • **Intentional** **phase** **boundary:** Phase 1 should intentionally
> stop at 'inventory foundation' rather than expand into full warehouse
> execution. That means directed receiving, stock-state creation,
> discrepancy governance, and inbound visibility are in scope, while
> full putaway optimisation, picking, packing, and dispatch remain later
> phases.
>
> • **Innovation** **where** **it** **strengthens** **control:**
> Innovative capability should be introduced only where it strengthens
> control and practicality. For this phase, the best innovations are a
> progressive ASN maturity model, scan-first dual-device UX, digital
> quarantine with cold-chain dwell timers, event-level
>
> chain-of-custody tracking, and vendor scorecarding. AI invoice capture
> may be architected for later addition but should not be a prerequisite
> to Phase 1 go-live.
>
> **Phase** **1** **Central** **Design** **Mandate**
>
> SAP remains the system of financial record. All PO data originates in
> SAP. All GRN financial postings must flow back to SAP. The WMS is the
> execution master — every physical action at the dock must be digitally
> captured, rule-validated, and event-logged before any financial
> posting occurs. No inventory becomes 'truthy' through manual cleanup.
> Truth is established at first touch.

Anocloud Technology Solutions LLP \| ConfidentialPage 2

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**B.** **PRD** **Document** **Map**

This PRD is structured across 28 sections as mandated by the SumoSave
PRD structure template, grouped into six logical clusters for
navigation:

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 3

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **1:** **Executive** **Summary**

**1.1** **What** **Is** **Being** **Built**

This PRD defines Phase 1 of the SumoSave WMS programme: Inventory
Foundation, Vendor Visibility, and Digital Inbound Control. The product
to be built is a tightly controlled inbound execution layer around SAP
that starts at vendor onboarding and product setup, continues through
ASN and delivery-slot visibility, digitises gate and dock events, guides
unloading and risk-based QC, auto-validates receipt data against
commercial and compliance rules, and ends with a clean, auditable
inbound stock state.

Phase 1 is not a standalone warehouse tool. It is the bedrock upon which
all subsequent WMS capabilities — putaway optimisation, picking,
dispatch, store receiving, and reverse logistics — will be built.
Without Phase 1, SumoSave has no reliable inventory truth. Without
inventory truth, every downstream process operates on guesswork.

**1.2** **Why** **It** **Is** **Strategically** **Necessary**

SumoSave is a high-volume, low-margin, fast-scaling value retailer
serving the lower-middle-class consumer segment. In such a model, margin
leakage, dock delays, wrong-cost acceptance, expiry slippage, and hidden
shrink can erase economics quickly. Today the inbound chain depends on
undocumented memory, Excel, paper gate logs, WhatsApp coordination, and
manual SAP interventions. That operating model may be survivable at
small scale, but it will not scale cleanly across more stores, more
vendors, and more nodes.

The business currently runs not because of systems, but despite the
absence of them. The warehouse operates on supervisor judgment, paper
gate registers, handwritten expiry notebooks, and WhatsApp approvals.
This is not sustainable as the store network grows. Every new store
added without a functioning WMS multiplies the manual errors, inventory
ghost stock, and compliance exposure.

**1.3** **What** **Business** **Outcomes** **Phase** **1** **Must**
**Deliver**

> • Replace blind inbound with structured supplier visibility before
> arrival.
>
> • Create inventory truth at the first accountable touchpoint, not
> later through manual cleanup.
>
> • Reduce dock dependence on supervisors by embedding pricing, GST,
> promo, barcode, and scan rules into the system.
>
> • Lower food-safety, compliance, and shrink risk by capturing exact
> inbound batch, expiry, and event timestamps.
>
> • Enable later warehouse and store phases by creating reliable master
> data, stock states, and event history.
>
> • Improve vendor discipline through appointments, ASN completeness,
> and measurable scorecards.
>
> **Phase** **1** **Business** **Outcome**
>
> A truck should no longer arrive as a surprise, a receipt should no
> longer depend on calculator math and memory, and inventory should no
> longer become 'truthy' only after manual reconciliation. By the end of
> Phase 1, SumoSave should know: what was expected, what actually
> arrived, what was accepted or held, why exceptions were blocked, and
> who touched each step — with a full event-grade audit trail.

Anocloud Technology Solutions LLP \| ConfidentialPage 4

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**1.4** **Why** **Now**

SumoSave is at a network inflection point. Each new store added without
a functioning WMS multiplies the manual errors, inventory ghost stock,
and compliance exposure nonlinearly — more vendors mean more blind
arrivals, more promotions mean more inbound judgement calls, and more
categories mean a greater chance that weak scanning and blocking logic
creates financial loss, spoilage, or regulatory exposure. The diagnostic
was conducted in March 2026. Delay compounds technical and operational
debt at an accelerating rate.

**1.5** **Current-State** **Problems** **Phase** **1** **Solves**

||
||
||
||
||
||
||
||
||
||
||

**1.6** **How** **Phase** **1** **Supports** **Scale**

Phase 1 is architected as cloud-native and multi-node from day one. The
master data, vendor portal, and inventory ledger are designed to support
multiple DCs, multiple store clusters, and the planned Repacking Centre
(RPC) — all as additional WMS locations requiring no structural
redesign. The API contract with SAP established in Phase 1 becomes the
integration backbone for all five WMS phases. New DC or store nodes are
added as configuration changes, not code changes.

Anocloud Technology Solutions LLP \| ConfidentialPage 5

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **2:** **Strategic** **Context** **and** **Business**
**Background**

**2.1** **SumoSave** **Business** **Model**

SumoSave Retail Ventures Pvt. Ltd., founded in 2022, is a value retail
chain serving the lower-middle-class consumer segment across urban
India. The business model is predicated on high-volume, low-margin sales
of approximately 3,400 active SKUs (growing to 4,500), concentrated
across seven product categories:

||
||
||
||
||
||
||
||
||
||

**2.2** **Value** **Retail** **Implications** **for** **WMS** **Design**

Thin-margin retail demands zero operational slack. Profitability is
entirely a function of operational precision: receiving exactly what was
ordered at exactly the agreed cost, minimising spoilage across FMCG Food
and BDF categories (which represent 36% of sales combined), maximising
labour productivity on every billed 3PL minute, and maximising truck
utilisation within MTD contract limits. Every WMS feature in Phase 1
must be justified against this lens.

**2.3** **Why** **WMS** **Must** **Be** **Broader** **Than** **a**
**Basic** **Warehouse** **System**

The diagnostic explicitly states: 'A WMS cannot stop at the warehouse
doors.' Phase 1 must establish vendor visibility (pre-arrival), digital
gate control (arrival), and the data foundations for downstream store
receiving. The DC is operated by a 3PL partner, meaning SumoSave bears
all financial and compliance consequences of how the DC operates but
does not directly staff it. This creates a critical governance
requirement: the WMS must enforce SumoSave's business rules on a
third-party workforce through system-level controls, not supervision.

**2.4** **Six** **Structural** **Failures** **Requiring** **Phase**
**1** **Resolution**

The diagnostic identified that the current inbound chain rests partly on
supervisor memory, partly on paper, and partly on WhatsApp. That creates
six structural failures that compound as the network grows:

> 1\. No dependable pre-arrival visibility for labour planning, dock
> planning, or variance anticipation.
>
> 2\. No enforceable master-data readiness gate before a vendor or SKU
> becomes operationally active.

Anocloud Technology Solutions LLP \| ConfidentialPage 6

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

> 3\. No system-native control for practical risk-based scanning by
> packaging class and category. 4. No fast, rules-driven receipt close
> process that removes calculator and memory dependence. 5. No digital
> quarantine and temperature-exposed dwell control for perishable
> exceptions.
>
> 6\. No event-grade chain of custody for accountability, audit, and
> root-cause analysis.
>
> **Why** **This** **Matters** **Now**
>
> As the store network and SKU count grow, these failure modes will
> compound nonlinearly: more vendors mean more blind arrivals, more
> promotions mean more inbound judgement calls, and more categories mean
> a greater chance that weak scanning and blocking logic creates
> financial loss, spoilage, or compliance exposure.

Anocloud Technology Solutions LLP \| ConfidentialPage 7

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **3:** **Problem** **Statement**

**3.1** **Current-State** **Operational** **Breakdown**

SumoSave's inbound supply chain operates across six phases: Vendor
Onboarding, Upstream Planning, Vendor Arrival, Inspection and Receiving,
Putaway and Allocation, and Dispatch. Each phase has critical breakdowns
documented by the Anocloud diagnostic team during on-site observation
from 9–13 March 2026.

**Phase** **0:** **Vendor** **and** **Master** **Data** **—** **No**
**Digital** **Foundation**

NVI and NPI processes are entirely manual and email-driven. Vendor
compliance documents — GSTIN certificates, FSSAI food safety licences,
KYC records — are tracked offline. No automated renewal alerts exist.
SKU volumetric data (weight, height, width, depth) is entered manually
and is highly unreliable. The CEO confirmed that approximately 40–50% of
SKUs lack accurate volumetric data — data that is required by every
downstream WMS planning function.

**Phase** **1:** **Upstream** **Planning** **—** **Blind** **Ordering**

The ARS in SAP generates POs based on MBQ logic. The BnM team's practice
of generating picklists directly from POs — before the WMS has processed
inbound stock — creates phantom demand signals on the warehouse floor.
DC teams manually restructure these lists to match physical aisle
locations, wasting significant time daily.

**Phase** **2:** **Vendor** **Arrival** **—** **The** **Blind** **Dock**

The DC operates in a completely reactive mode. There is no advance
knowledge of what trucks are arriving, from which vendor, carrying which
products, in what quantity. Gate entry is recorded in a paper register.
Dock assignment is manual. No appointment scheduling system exists. When
multiple vendors arrive simultaneously, the dock becomes congested and
throughput collapses.

**Phase** **3:** **Inspection** **and** **Receiving** **—** **The**
**Main** **Bottleneck** **(Confirmed** **Critical)**

> ⚠ **CRITICAL:** **The** **1-Item** **Scan** **policy** **is**
> **SumoSave's** **most** **critical** **compliance** **liability.**
> **If** **a** **batch** **of** **expired** **food** **passes** **this**
> **single-point** **check** **and** **enters** **the** **network,**
> **it** **will** **reach** **store** **shelves.** **The** **WMS**
> **must** **replace** **this** **with** **a** **risk-based,**
> **system-enforced** **scanning** **policy** **that** **captures**
> **batch** **and** **expiry** **at** **the** **carton** **level.**
>
> • **The** **1-Item** **Scan:** QC workers open one carton per batch
> and scan one item. The entire pallet is assumed to match. This is a
> systemic fraud and food-safety vulnerability. Mixed expiry batches,
> damaged inner cartons, and wrong items all pass through undetected.
>
> • **Calculator** **GKM** **Math:** The DC supervisor uses a physical
> calculator to verify that invoice price falls within the 0.1% GKM
> tolerance. This is slow, error-prone, and creates a direct financial
> control gap with no audit trail.
>
> • **Memory-Based** **Promotions:** Three distinct promotional bundle
> scenarios exist. Supervisors handle these from memory. Errors result
> in incorrect SAP postings.
>
> • **Tax** **Mismatch** **Hard** **Stop:** GST mismatches halt
> operations. Perishable goods may sit at ambient temperature for hours
> during Finance resolution. No mechanism exists to physically protect
> perishables while paperwork is resolved.

Anocloud Technology Solutions LLP \| ConfidentialPage 8

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

> • **Missing** **Barcode** **Chaos:** When vendors arrive without
> barcodes, there is no on-dock relabeling capability. Items enter the
> system with incomplete identifiers, breaking traceability from the
> moment of receipt.

**3.2** **Fragmentation** **Across** **Systems** **and** **Information**
**Flows**

Information about a single inbound shipment currently lives across six
disconnected artefacts: the paper gate register, the vendor's physical
invoice, the supervisor's SAP terminal, the BnM team's Excel picklist,
the WhatsApp approval thread, and the QC team's handwritten batch
notebook. A single invoice discrepancy requires manual cross-referencing
across all six. This is the core information architecture failure that
Phase 1 must resolve.

**3.3** **The** **Seven** **Major** **Operational** **Wastes** **—**
**Phase** **1** **Relevance**

||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 9

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **4:** **Vision** **Statement** **and** **Product**
**North** **Star**

> **Product** **North** **Star**
>
> Phase 1 should make inbound execution feel like a controlled operating
> lane rather than a negotiated human process. Every inbound movement
> should be expected before arrival, identifiable at the dock, validated
> by rule rather than memory, auditable at event level, and resolved
> into a clean inventory state that downstream phases can trust.

**4.1** **Vision** **Statement**

To transform SumoSave's inbound supply chain from a
paper-and-memory-driven operation into a fully digital, system-enforced,
real-time inventory control layer — where every inbound transaction is
captured accurately, every exception is handled by rule rather than by
individual judgment, and every item in the DC can be accounted for at
any moment with complete confidence in its identity, quantity, cost,
batch, and condition.

**4.2** **Five** **Pillars** **of** **the** **Phase** **1** **North**
**Star**

> • **Expected** **before** **arrival:** Every material inbound should
> have a known vendor, vehicle, slot, expected lines, and expected
> quantities — submitted by the vendor before dispatch across any of
> four supported channels.
>
> • **Controlled** **on** **arrival:** Each vehicle should be digitally
> checked in, assigned a dock, timed from gate to GRN, and routed
> through the correct dock and storage-temperature pathway.
>
> • **Validated** **at** **first** **touch:** Receipt acceptance should
> test commercial rules, tax rules, barcode readiness, scan-policy
> compliance, expiry capture, and promotional rules before stock becomes
> available. Truth is established at first touch, not through subsequent
> cleanup.
>
> • **Exception-safe:** Disputed loads should move into defined hold or
> quarantine states without losing paperwork integrity or cold-chain
> integrity. Physical movement and document resolution are decoupled.
>
> • **Auditable** **by** **design:** Every important event should carry
> user ID, device ID, timestamp to millisecond resolution, location
> reference, and evidence attachments where relevant. No destructive
> edits without log.

**4.3** **Design** **Philosophy**

> • System over Supervisor: No business rule lives in a human's memory.
> Every pricing tolerance, promotional rule, scanning requirement, and
> exception approval workflow is encoded into the system.
>
> • Scan-First, Always: No inventory movement without a corresponding
> scan event. Manual data entry is the fallback, not the default.
>
> • Progressive Vendor Trust: Not all vendors will reach full digital
> ASN maturity immediately. The system supports four channels while
> visibly scoring confidence. This preserves operational reality without
> normalising poor vendor discipline.
>
> • SAP as Financial Master, WMS as Physical Master: Both must agree in
> real time. Any divergence triggers an automatic alert and is never
> silently resolved.
>
> • India-Ready: Built for variable network connectivity, mixed device
> hardware, and GST/E-Way Bill compliance baked in from day one.

Anocloud Technology Solutions LLP \| ConfidentialPage 10

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **5:** **Business** **Objectives**

The following business objectives are directly traceable to pain points
identified in the diagnostic and mandates from the CEO, SCM Head, and
CMO/BnM Head. Each objective defines what Phase 1 success looks like in
operational terms.

||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 11

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **6:** **Success** **Metrics** **/** **KPI** **Framework**

Phase 1 success must be measured through an explicit KPI architecture
rather than anecdotes. Metrics should be visible by vendor, dock,
category, temperature class, shift, user, and exception type — enabling
root-cause analysis, not just aggregate reporting.

**6.1** **KPI** **Architecture:** **Baseline,** **Definition,** **and**
**Target**

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 12

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||

**6.2** **Dashboard** **Implications**

Phase 1 must deliver a real-time Operations Dashboard accessible to DC
Supervisor, SCM Head, and Leadership showing live gate status, dock
occupancy, GRN queue, quarantine bin contents, ASN receipt status, and
exception counts. All metrics must be traceable to event data rather
than spreadsheet post-processing. Detailed dashboard specifications are
in Section 20.

Anocloud Technology Solutions LLP \| ConfidentialPage 13

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **7:** **Scope** **Definition**

Phase 1 scope is intentionally broad enough to fix upstream blindness
and first-touch control, but intentionally narrow enough to avoid a
monolithic WMS release. Each scope boundary is grounded in diagnostic
evidence.

**7.1** **In** **Scope** **vs.** **Out** **of** **Scope**

||
||
||
||
||
||
||
||
||
||
||
||

> **Phase** **1** **Completion** **Point**
>
> Phase 1 is complete when accepted inbound stock is digitally
> receipted, commercially validated, traceable to source batch and
> expiry, and visible in clean stock states that can be consumed by
> Phase 2 putaway and internal control workflows without manual
> interpretation or re-entry.

**7.2** **Phase** **Boundary** **Notes**

Some capabilities begin in Phase 1 but are completed in later phases.
The LPN framework established in Phase 1 enables store blind receiving
in Phase 4. Batch/expiry data captured in Phase 1 GRN enables FEFO
enforcement in Phase 2 and store expiry alerts in Phase 4. The vendor
portal built in Phase 1 is extended in later phases to include delivery
performance scorecards and promotional booking. These are noted as
'Phase 1 foundations' throughout this document.

Anocloud Technology Solutions LLP \| ConfidentialPage 14

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **8:** **User** **Personas** **and** **Role**
**Definitions**

Phase 1 requires careful role design because SumoSave's execution spans
vendor users, 3PL labour, internal category and finance users, and
future downstream consumers of the data. Permissions must be
least-privilege, but workflows must still be practical enough for
shift-floor use. The 'If Workflow Fails' column captures the downstream
operational consequence if a role's workflow breaks — driving system
design priorities.

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 15

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 16

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **9:** **End-to-End** **Business** **Process**
**Architecture** **—** **Phase** **1**

Although build scope is Phase 1, the process architecture must be mapped
across the full chain so that Phase 1 creates the right upstream inputs
and downstream outputs. The future-state sequence below shows where
Phase 1 begins, what it owns deeply, and where it hands off to later
phases.

**9.1** **Full** **Supply** **Chain** **Flow** **—** **Phase**
**Assignment**

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 17

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**9.2** **Phase** **1** **Deep** **Future-State** **Process**
**Narrative**

The following narrative describes the exact sequence of digital and
physical events in Phase 1's target state, from vendor activation
through to accepted stock handoff:

> 7\. Vendor or internal category team initiates vendor or SKU workflow.
> System blocks activation until mandatory compliance and product
> attributes are complete.
>
> 8\. SAP/ARS creates PO; WMS ingests the PO and prepares it for inbound
> visibility, including vendor, expected lines, planned quantities, and
> schedule reference.
>
> 9\. Vendor submits ASN through the preferred digital channel (portal
> preferred). If unavailable, controlled fallback methods — structured
> email, paper-assisted capture, or buyer-entered entry — still create
> an expected inbound record with a lower confidence score and stronger
> gate validation requirements.
>
> 10\. Vendor books a delivery slot. Scheduler checks day rules, MOQ
> rules, dock capacity, temperature class, and category constraints
> before confirming.
>
> 11\. At gate arrival, security scans or enters appointment/vehicle
> reference. System verifies slot status, vendor identity, expected
> documents, and starts gate-to-GRN timer automatically.
>
> 12\. Load is queued and assigned to a dock. If the load is perishable
> or high-priority, routing logic sends it to the appropriate
> temperature or fast-lane dock.
>
> 13\. During unloading, workers confirm handling units, segregate
> physical FT/NFT lanes, and trigger internal relabeling workflow
> immediately if barcode issues are detected.
>
> 14\. QC executes packaging-class-specific scan policy. The system
> displays exact instructions per SKU category and packaging type.
> Mandatory evidence fields (batch, expiry, damage) are enforced before
> the line can be accepted.
>
> 15\. Commercial engine evaluates cost, GST, GKM, MRP policy, promo
> case, and line-level quantity variance. Accept, hold, quarantine, or
> reject outcomes are produced per line or per load as configured.
>
> 16\. Accepted lines are posted through Auto-GRN to SAP with full
> receipt context, event trail, and evidence references. Held or
> quarantined lines remain digitally locked but physically traceable in
> designated zones.
>
> 17\. Inventory controller and approvers resolve exception queues. Once
> cleared, stock states update and become available to Phase 2 putaway
> and internal control workflows.
>
> **Recommended** **Design** **Choice:** **Progressive** **Inbound**
> **Trust** **Model**
>
> Not all vendors will reach full digital ASN maturity immediately. The
> system should support four channels — portal, structured email,
> paper-assisted capture, and buyer-entered fallback — while visibly
> scoring confidence. Low-confidence ASNs receive stronger gate scrutiny
> and broader QC prompts. This preserves operational reality without
> normalising poor vendor discipline.

Anocloud Technology Solutions LLP \| ConfidentialPage 18

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **10:** **Current-State** **vs.** **Future-State**
**Process** **Design**

For each major Phase 1 process area, the following table documents: what
happens today (As-Is), what issues this creates (Issues Observed), the
target digital design (To-Be), the controls that enforce the new design
(Target Controls), and the specific product capability required (Product
Implication).

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 19

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **11:** **Functional** **Requirements**

The modules below are organised around Phase 1 build scope. Twelve
modules are specified, each at implementation depth — not a feature
wishlist, but precise operational and system specification grounded in
the diagnostic findings. Later-phase modules are referenced only where
Phase 1 must create the right contracts or data outputs for them.

**Cluster** **A:** **Data** **Foundation**

**Module** **A:** **Master** **Data** **Management**

||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 20

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||

**Cluster** **B:** **Vendor** **and** **ASN** **Management**

**Module** **B:** **Supplier** **/** **ASN** **/** **Appointment**
**Management**

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 21

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

**Cluster** **C:** **Gate** **and** **Dock** **Management**

**Module** **C:** **Yard** **and** **Dock** **Management**

Anocloud Technology Solutions LLP \| ConfidentialPage 22

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 23

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||

**Cluster** **D:** **Receiving** **and** **QC**

**Module** **D:** **Receiving** **and** **QC** **—** **Risk-Based**
**Scanning** **Policy**

||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 24

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||

**Cluster** **E:** **Commercial** **Validation** **and** **Auto-GRN**

**Module** **E:** **Auto-GRN** **and** **Discrepancy** **Handling**

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 25

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 26

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Cluster** **F:** **Barcode** **and** **LPN** **Framework**

**Module** **F:** **Barcode** **/** **LPN** **/** **Relabeling**
**Framework**

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 27

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||

**Cluster** **G:** **Quarantine,** **Hold,** **and** **Damage**
**Management**

**Module** **G:** **Quarantine** **/** **Hold** **/** **Damages** **/**
**OS&D**

||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 28

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||

**Cluster** **H:** **Inventory** **Ledger** **and** **Stock** **States**

**Module** **H:** **Inventory** **Ledger** **and** **Stock** **States**

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 29

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||

**Cluster** **I:** **Alerts** **and** **Notifications**

**Module** **I:** **Alerts** **/** **Notifications** **/**
**Escalations**

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 30

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

**Cluster** **J:** **Reporting,** **Dashboards,** **and** **Control**
**Tower**

**Module** **J:** **Reporting** **/** **Dashboards** **/** **Control**
**Tower**

||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 31

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

**Cluster** **K:** **Audit** **Trail** **and** **Chain** **of**
**Custody**

**Module** **K:** **Audit** **Trail** **/** **Chain** **of** **Custody**

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 32

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

**Cluster** **L:** **Admin** **and** **Configuration** **Framework**

**Module** **L:** **Admin** **/** **Configuration** **Framework**

||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 33

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 34

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **12:** **Detailed** **User** **Stories** **and**
**Acceptance** **Criteria**

The following user stories are directly traceable to the diagnostic
gaps. Each story is implementation-ready with explicit acceptance
criteria, alternate flows, edge cases, and error handling. SLA
expectations are embedded where operationally relevant.

**US-01:** **Vendor** **User**

||
||
||
||
||
||

**US-02:** **Security** **Gate** **User**

||
||
||
||
||
||

**US-03:** **QC** **Associate**

||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 35

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||

**US-04:** **Inbound** **Supervisor**

||
||
||
||
||
||

**US-05:** **Finance** **User**

||
||
||
||
||
||

**US-06:** **Inventory** **Controller**

Anocloud Technology Solutions LLP \| ConfidentialPage 36

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 37

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **13:** **Business** **Rules** **Repository**

The following business rules are explicitly mandated by SumoSave
leadership and confirmed during diagnostic sessions. Each rule is stated
precisely to enable direct implementation in the WMS rules engine. Rules
are categorised by area. No rule is negotiable without a formal change
request from the appropriate business owner.

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 38

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 39

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **14:** **Exception** **Management** **and** **Edge**
**Cases**

Every exception below was either directly observed during the March 2026
on-site diagnostic or inferred from stakeholder interviews. Each
exception has a defined WMS response that converts a current manual
workaround into a system-governed workflow, with a documented
current-state comparison to justify the design.

||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 40

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 41

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

Anocloud Technology Solutions LLP \| ConfidentialPage 42

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **15:** **Integration** **Requirements**

All integrations defined here are required for Phase 1 function. The WMS
must not operate as a silo. Every significant data event must flow to or
from its connected system in real time or near-real time.

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 43

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **16:** **Data** **Model** **and** **Information**
**Architecture**

The following defines all major master and transaction entities required
for Phase 1. This is the canonical data dictionary from which the
engineering team should derive the database schema. All entities are
designed to be consumable by later phases without architectural
replatforming.

**16.1** **Core** **Master** **Entities**

||
||
||
||
||
||
||
||
||
||
||
||
||
||

**16.2** **Core** **Transactional** **Entities**

||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 44

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 45

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **17:** **UI/UX** **Requirements**

All Phase 1 screens are designed around a scan-first, low-training
philosophy for the warehouse floor, and a queue-and-blocker-first
philosophy for supervisory screens. The UX must be usable by 3PL floor
staff with minimal training.

**17.1** **Core** **Design** **Principles**

> • Scan-First, Large-Target: Every screen on a handheld defaults to a
> scan prompt. Buttons must be minimum 48×48px. Designed for gloved-hand
> operation and warehouse lighting conditions.
>
> • Low Typing, One-Step Wizards: All complex workflows (QC scanning,
> promo receiving, quarantine, relabeling) are presented as linear,
> one-step-at-a-time wizards. No multi-screen navigation during a task.
>
> • Colour Coding for State: Normal flow = green; warning/soft-stop =
> amber; hold/quarantine = red/orange; offline = grey. Associates should
> understand status without reading text.
>
> • Supervisor Screens Emphasise Queues and Blockers: Supervisor screens
> lead with exception queue, aging timers, and dwell indicators — not
> transactional detail. Drill-down is available but secondary.
>
> • Poor-Network Handling is Explicit: Users see an offline indicator at
> all times. Queued scans count is visible. What cannot yet be finalised
> is clearly labelled.
>
> • Offline Tolerance: Core workflows (scanning, QC, putaway) function
> in offline mode with local queue for up to 30 minutes.
> Sync-on-reconnect with duplicate protection.

**17.2** **Key** **Screens** **—** **Phase** **1**

||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 46

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 47

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **18:** **Device** **and** **Hardware** **Requirements**

Phase 1 should not force an all-or-nothing hardware decision. The
recommended design is a dual-device-capable application layer with
process-specific optimisation — preserving cost flexibility while
ensuring the WMS works correctly on both hardware classes.

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 48

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **19:** **Non-Functional** **Requirements**

||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 49

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **20:** **Reporting,** **Dashboards,** **and** **Control**
**Tower**

Phase 1 must deliver role-specific, real-time dashboards that replace
the current fragmented WhatsApp + Excel + verbal-update model. All
metrics must be traceable to event data, not spreadsheet
post-processing.

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 50

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **21:** **Analytics** **and** **Alerting** **Framework**

Phase 1 must implement a configurable alerting engine that delivers
notifications via the WMS mobile app, dashboard pop-ups, email, and
WhatsApp integration where operationally appropriate.

**21.1** **Alert** **Categories**

||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 51

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **22:** **Security,** **Controls,** **and** **Audit**
**Trail**

**22.1** **Role-Based** **Access** **Control**

||
||
||
||
||
||
||
||
||
||
||
||
||
||

**22.2** **Maker-Checker** **Flows**

> • All exception approvals (GKM, cost, GST overrides) require a maker
> (requestor) and a separate checker (approver).
>
> • Mandatory maker-checker for: vendor activation, SKU
> receipt-enablement, scan policy changes, commercial threshold changes,
> and all critical configuration changes.
>
> • Manual inventory adjustments require: associate (maker) + supervisor
> (checker) + mandatory reason code from governed list.
>
> • Supervisor override of a hard-stop requires a second supervisor or
> SCM Head co-approval.

**22.3** **Supervisor** **Override** **Governance**

Supervisor override must be explicit — the system must define: what can
be overridden, by whom, with what reason code from a governed list,
within what authority level, and with what post-facto review period.
Overrides that exceed authority automatically route to the next
authority level. All override records are immutable.

**22.4** **Evidence** **Controls**

Anocloud Technology Solutions LLP \| ConfidentialPage 52

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

> • Photos, documents, and print history are protected from silent
> deletion or overwrite by floor users.
>
> • Evidence is linked to the event that triggered it — it cannot be
> detached or replaced without a new event record.
>
> • Critical evidence (damage photos, expired batch scans,
> recall-relevant receipts) require Admin-level action to remove — with
> a mandatory audit log entry.

**22.5** **Location** **and** **Time** **Stamping**

> • Mandatory for: gate events, dock assignment, receipt close, hold
> movement, relabeling events, quarantine placement and release, and all
> override actions.
>
> • Timestamp resolution: milliseconds where feasible; minimum seconds
> for all events.
>
> • Device ID logged alongside user ID on all events — enables
> device-level audit for shared-device deployments.

Anocloud Technology Solutions LLP \| ConfidentialPage 53

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **23:** **SOP** **and** **Operational** **Change**
**Implications**

Phase 1 is not a software-only implementation. Correct product adoption
requires explicit SOP changes at the DC, at HQ, and in vendor-facing
processes. The following SOPs must be documented, trained, and audited
as part of the Phase 1 rollout:

> 18\. **Vendor** **Onboarding** **and** **NPI** **SOP:** Vendor
> registration and NPI can no longer be email-plus-memory processes.
> They must move into structured approval workflows in the Vendor
> Portal. BnM team must complete vendor activation in the portal before
> any delivery can be accepted.
>
> 19\. **Arrival** **Expectation** **SOP:** No inbound should be treated
> as truly 'unexpected' except through a controlled ad hoc arrival lane
> with mandatory supervisor override and reason code. All vendors
> receive a formal communication of the new ASN and appointment
> requirement with contractual effective date.
>
> 20\. **Gate** **Entry** **SOP:** Security and gate staff must follow
> digital check-in as the first record, replacing paper as the system of
> action. Paper backup is only for Wi-Fi failure scenarios and must be
> synced within 2 hours with supervisor authorisation.
>
> 21\. **QC** **Scanning** **SOP:** QC must stop using universal
> one-item shortcuts and instead follow configured scan policies as
> displayed by device for each packaging class. No deviation from
> displayed protocol without supervisor override and reason code.
>
> 22\. **GRN** **Closure** **SOP:** Supervisors must stop using
> calculators and informal promo interpretation for receipt closure. All
> GRN validation is system-executed. Supervisor role shifts to exception
> resolution and dock management — not data entry.
>
> 23\. **Quarantine** **and** **Dispute** **SOP:** Disputed perishables
> must move to designated quarantine zones (physical bins registered in
> WMS) rather than sit on the dock. Physical quarantine bins must be
> signed, assigned, and registered before go-live. Quarantine placement
> must be confirmed by bin scan.
>
> 24\. **Relabeling** **SOP:** Reprints and relabels must be treated as
> controlled events — not convenience actions. Every relabeling event is
> logged with reason code and associate ID. Associates must scan the
> printed label to confirm before the workflow proceeds.

Anocloud Technology Solutions LLP \| ConfidentialPage 54

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **24:** **Rollout** **Strategy**

**24.1** **Recommended** **Implementation** **Stages**

||
||
||
||
||
||
||
||

**24.2** **Training** **Approach**

Training should be role-specific and scenario-based rather than
classroom-heavy. Gate, QC, supervisor, finance, and vendor users each
need short focused workflow training with exception drills. Hypercare
should run daily for the first two weeks and weekly thereafter until
first-pass yield and dwell metrics stabilise.

> • QC Associates and Warehouse Associates: 4-hour hands-on training on
> scanner workflows. Role-play receiving scenarios including exceptions,
> relabeling, and promo cases.
>
> • DC Supervisors: 1-day training on dock dashboard, exception queue
> management, quarantine workflow, and override governance.
>
> • Finance and BnM Teams: 2-hour training on exception resolution
> workflow and hold queue in WMS.
>
> • Vendors: Portal training via video tutorial and live webinar. Vendor
> support hotline for first 60 days. Quick-start guide covering ASN
> submission and appointment booking.
>
> • Gate Security: 2-hour training on Gate App — check-in, search, ad
> hoc arrival creation, and seal capture.
>
> • Quick-reference laminated guides posted at every dock station, QC
> area, and gate — showing packaging-class scan protocols.

**24.3** **Adoption** **Risk** **Mitigations**

> • 3PL workforce resistance: Use role-based training, shift champions
> (super-users), and exception review based on event logs. Performance
> visibility creates natural accountability.
>
> • Vendor portal resistance: Use progressive maturity model with
> scorecards. Gate-level consequences (enhanced scrutiny) for low-ASN
> vendors create commercial pressure to adopt.
>
> • Scan policy too strict: Pilot packaging-class rules and tune by
> category. The configured rules are a starting point — they can be
> adjusted through the Admin module without code changes.

Anocloud Technology Solutions LLP \| ConfidentialPage 55

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **25:** **Dependency** **Map**

**25.1** **Critical** **Dependencies**

> • Master Data Readiness: Mandatory SKU and vendor attribute completion
> before receipt enablement. CEO confirmed achievable. IT + BnM must set
> a 4-week completion deadline at project kickoff. No go-live without
> 100% active SKU completeness.
>
> • Policy Sign-Off: Final sign-off required on packaging-class scan
> policy (by category and risk tier), GKM/cost tolerance logic, and
> quarantine governance — from CEO, SCM Head, and Finance before Sprint
> 4 pilot.
>
> • SAP Integration Contract: SAP GRPO API payload must be agreed with
> the SAP BASIS team before Sprint 5. Delay here directly delays
> Auto-GRN go-live. Manual GRN override mode required as fallback during
> integration testing.
>
> • Wi-Fi Infrastructure: Reliable wireless coverage across gate, dock,
> cold room, and quarantine areas — confirmed by site survey before
> pilot. Remediation must complete before scanner deployment.
>
> • Physical Quarantine Zones: Named, signed, and SAP-registered
> physical hold and quarantine bins (ambient and cold) must exist in the
> DC before go-live. SOP ownership assigned.
>
> • Vendor Onboarding to Portal: Top 20 vendors (by delivery volume)
> onboarded to Vendor Portal before full go-live. BnM must lead vendor
> communication campaign with contractual ASN requirement.
>
> • Hardware Procurement: Scanner and printer procurement must begin in
> Stage 0. Hardware decision (rugged vs. Android) must be finalised
> before UI design is locked.

Anocloud Technology Solutions LLP \| ConfidentialPage 56

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **26:** **Risks** **and** **Mitigations**

||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 57

> SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
> Enhanced Edition
>
> **Section** **27:** **Open** **Questions** **and** **Assumptions**
>
> **27.1** **Open** **Questions** **Requiring** **Business**
> **Decision**

||
||
||
||
||
||
||
||
||
||

> Anocloud Technology Solutions LLP \| ConfidentialPage 58

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**Section** **28:** **Appendix**

**28.1** **Glossary** **and** **Acronyms**

||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||
||

Anocloud Technology Solutions LLP \| ConfidentialPage 59

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

**28.2** **Source** **Evidence** **Themes**

The following themes from the diagnostic grounded this Phase 1 PRD.
Every requirement traces to at least one of these observed realities:

> • Manual workarounds, paper, Excel, SAP rigidity, and WhatsApp-driven
> coordination in the current inbound state.
>
> • Need for pre-arrival visibility via ASN and appointment scheduling —
> warehouse currently 100% blind before arrival.
>
> • One-item scan weakness and the need for practical risk-based
> scanning by packaging class to balance control with throughput.
>
> • Auto-GRN mandate, instant relabeling, chain-of-custody expectations,
> and hard-stop rules on missing cost/tax/expiry/GKM — from CEO and SCM
> Head directives.
>
> • Open decision on dual hardware model and explicit CEO approval to
> use digital quarantine for tax disputes affecting perishables.
>
> • Need for a phase-wise approach so the WMS is fully usable and
> low-risk at each stage rather than as one monolithic release.
>
> • Vendor scorecard and progressive ASN maturity model needed to create
> a commercial accountability loop without forcing a disruptive vendor
> cutover.

**28.3** **Suggested** **Phase** **Roadmap** **After** **Phase** **1**

||
||
||
||
||
||
||
||

> **A** **Note** **on** **Innovation** **Embedded** **in** **Phase**
> **1**
>
> Several world-class practices are deliberately embedded in this Phase
> 1 design that go beyond standard Indian retail WMS implementations:
> (1) ASN confidence scoring across 4 channels — driving vendor
> behaviour improvement while preserving operational continuity. (2)
> Risk-based scanning with configurable category-level sampling rules —
> balancing the CEO's 100% scan aspiration with the SCM Head's
> throughput reality. (3) Systemic quarantine with physical/digital
> decoupling and cold-chain dwell timer — protecting perishables from
> ambient dock conditions during dispute resolution. (4) GS1-128 LPN
> hierarchy from day one — enabling store blind receiving in Phase 4
> without any architectural retrofit. (5) Vendor portal with compliance
> expiry enforcement — making FSSAI and GSTIN lapse an automatic
> hard-stop rather than a manual audit finding. (6) Event-grade chain of
> custody with millisecond timestamping — enabling product recall,
> shrink investigation, and regulatory audit from a single event replay.

Anocloud Technology Solutions LLP \| ConfidentialPage 60

SumoSave WMS — Phase 1 PRD v2.0 \| ConfidentialApril 2026 \| Merged &
Enhanced Edition

> ***—*** ***End*** ***of*** ***SumoSave*** ***WMS*** ***Phase***
> ***1*** ***PRD*** ***—*** ***Version*** ***2.0*** ***(Merged***
> ***&*** ***Enhanced)*** ***—***
>
> Anocloud Technology Solutions LLP \| SumoSave Retail Ventures Pvt.
> Ltd. \| April 2026

Anocloud Technology Solutions LLP \| ConfidentialPage 61
