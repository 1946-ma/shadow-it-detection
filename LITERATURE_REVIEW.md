# Literature Review — AI-Driven Shadow IT Detection Framework

> Working reference document for the BSc Cybersecurity final year project (UMaT).
> Compiled via web search on 2026-07-29. Sources graded by tier; gray literature (vendor
> pages, stat-aggregator blogs) is flagged as such and should **not** be cited as if it
> were peer-reviewed. Where I could not independently verify authorship/venue (ResearchGate
> often blocks scraping), the source is either dropped or explicitly marked "unverified" —
> do not cite an unverified source in the dissertation without checking it yourself first.
>
> **AI disclosure**: This document was assembled with AI-assisted web search (Claude). All
> citations below were checked against a live source before inclusion, but you should still
> pull each PDF/DOI yourself before quoting or including in your final bibliography —
> standard practice, not a special caveat for AI-assisted work.

---

## 1. Search strategy

Searched via general web search (no access to IEEE Xplore / ACM DL / Scopus behind
paywalls from this environment) across five themes:

1. Shadow IT — definition, governance, prevalence
2. CASB (commercial detection approach)
3. ML-based network intrusion detection on CICIDS2017 (IsolationForest, RF, hybrid)
4. ML specifically framed as *Shadow IT* detection (as opposed to generic IDS)
5. Multi-source/data-fusion security detection

**Limitation**: searches surfaced Google-indexed results only; UMaT library database
access (IEEE/ACM/Scopus) would likely surface additional, more rigorously peer-reviewed
sources for themes 3–4 and should be checked before submission.

---

## 2. Annotated bibliography

### Theme A — Shadow IT: definition, governance, prevalence (well-established literature)

**Silic, M., & Back, A. (2014). Shadow IT – A view from behind the curtain. *Computers &
Security*, 45, 274–283.** — ScienceDirect.
Foundational, frequently-cited paper establishing Shadow IT's dual nature: a governance/
security risk (unsanctioned systems bypass controls) *and* a productivity workaround
(employees compensate for inadequate sanctioned tooling). Good source for your "what
problem are we solving" framing — establishes Shadow IT is not just a technical gap but
an organizational-behaviour one.

**Klotz, S., Kopper, A., Westner, M., & Strahringer, S. (2019). Causing factors, outcomes,
and governance of Shadow IT and business-managed IT: a systematic literature review.
*International Journal of Information Systems and Project Management*, 7(1), 15–43.**
Reviews 107 prior studies; structures the field into causing factors → outcomes →
governance responses. This is your single best citation for "to what extent has the
problem been solved" on the *governance* side — it shows the field has a mature
qualitative/organizational literature but (per your project's framing) a much thinner
*technical automated-detection* literature (see Theme C below).

**Industry/gray-literature prevalence stats** (cite as industry reports, not academic
sources — verify each against the primary report before quoting a number):
- Gartner: shadow IT commonly cited as 30–40% of enterprise IT spend (referenced via
  secondary sources — pull the primary Gartner report if you cite the figure).
- Cisco 2022 Annual Cybersecurity Report: shadow IT flagged as a growing concern by
  surveyed IT professionals.
- McAfee (2021) / BetterCloud (2023) SaaS usage reports: employee-reported unsanctioned
  SaaS app usage rates.
- **Caution**: the numbers above came through SEO stat-aggregator sites (gitnux,
  electroiq, auvik), not the primary Gartner/Cisco/McAfee documents. Treat as directional
  only until you've located and cited the primary report.

### Theme B — CASB (commercial detection approach)

No peer-reviewed academic paper on CASB architecture surfaced — this is genuinely a
vendor-driven technology category, so cite vendor/practitioner sources explicitly as
industry description, not research:
- Microsoft, Palo Alto Networks, Cloudflare, Rapid7, Fortinet — all publish near-identical
  vendor explainers: a CASB sits inline (proxy) or out-of-band (API) between users and
  cloud apps, and discovers unsanctioned SaaS by mining firewall/proxy/DNS logs for
  unrecognized cloud domains.
- **This is exactly the gap your project exploits for your "gaps" answer**: CASB discovery
  is log-mining of *cloud-bound* traffic only — it structurally cannot see on-prem
  network traffic, installed-but-unused software, or identity/session-layer misuse. Cite
  this as absence-of-literature (a technology category described only in vendor
  documentation, not academic study) — itself a valid literature-review observation.

### Theme C — ML-based network intrusion detection on CICIDS2017 (well-established literature)

**Marteau, P.-F., Soheily-Khah, S., & Béchet, N. (2017). Hybrid Isolation Forest –
Application to Intrusion Detection. arXiv:1705.03800.**
Proposes "Hybrid Isolation Forest" (HIF), adding supervised-learning capability on top of
plain IsolationForest to fix a specific weakness in its anomaly scoring; outperforms plain
IF and is competitive with SVM baselines on the ISCX intrusion dataset. **Directly
supports your hybrid IF+RF architecture as a documented, credible design pattern** — you
can cite this to show your two-stage approach has academic precedent, not just an ad hoc
engineering choice.

**Mourouzis, T., & Avgousti, A. (2021). Intrusion Detection with Machine Learning Using
Open-Sourced Datasets. arXiv:2107.12621.**
Compares two supervised models (Random Forest, XGBoost) against two unsupervised models
(Isolation Forest, One-Class SVM) on CICIDS2017-family data. Reports supervised models
achieving ~99% accuracy on *known* threats while unsupervised models (One-Class SVM ~92%)
generalize better to *unknown* threats. **This is your best single citation for the
"why hybrid, not pure-supervised or pure-unsupervised" architectural justification** — it
independently confirms the exact trade-off (known-pattern precision vs. novel-threat
recall) your CLAUDE.md documents from your own experiments (pure IF ceilings ~90%; hybrid
reaches 98.1%).

**Anjum, N., Latif, Z., Lee, C., Shoukat, I. A., & Iqbal, U. (2021). MIND: A Multi-Source
Data Fusion Scheme for Intrusion Detection in Networks. *Sensors*, 21(14), 4941.
https://doi.org/10.3390/s21144941.**
Fuses NSL-KDD and UNSW-NB15 (two different intrusion datasets) via feature-level fusion,
then classifies with a KNN-bagging ensemble; reports 99.80% accuracy and materially lower
false positives than single-source detection. **Use this for Theme E (multi-source
fusion)** — it's a real, peer-reviewed (MDPI Sensors) precedent for the general principle
that fusing independent data sources beats any single source, which is the academic
backing for combining your network/Wazuh/RADIUS channels — even though it fuses two
*datasets* rather than three *live signal types* the way your system does.

### Theme D — ML specifically framed as *Shadow IT* detection (thin literature — this is your novelty claim)

**Kutsal, M., Das, B., Askar, Z., & Das, R. (2023). Detection of Shadow IT Incidents for
Centralized IT Management in Enterprises using Statistical and Machine Learning
Algorithms. *European Journal of Technique (EJT)*.** (DergiPark, received 30 Oct 2023,
accepted 27 Nov 2023.)
Detects unauthorized SaaS purchases using Interquartile Range (statistical), K-Means
(clustering), and a proposed "stabilization" algorithm, tested on a real company
(Arçelik) for low/medium/high-risk classification. **This is one of the very few papers
that frames ML detection explicitly as "Shadow IT" rather than generic intrusion
detection** — important for your novelty argument, but note its scope is narrower than
yours: it detects unauthorized *SaaS purchasing/billing* patterns, not live network
traffic + endpoint inventory + identity signals combined.

**A second 2025 item, "Combating Shadow IT Risks Through AI-Based Monitoring Tools"
(ResearchGate, publication ID 391009254)** exists but I could not independently verify its
authorship or venue (ResearchGate blocks automated access, and search results didn't
surface author names). **Do not cite this without pulling the actual PDF and confirming
the author/journal yourself** — per your own project standards, an unverifiable source is
a fail, not a "cite cautiously."

**Conclusion for this theme**: the technical, automated, ML-driven framing of Shadow-IT-
*specific* detection is genuinely sparse — I found exactly one solidly-verifiable paper
(Kutsal et al. 2023), versus dozens for generic network intrusion detection on CICIDS2017
(Theme C) and dozens more for organizational/governance Shadow IT research (Theme A).
**This gap is real and is your strongest, most defensible novelty claim** — say so
plainly rather than overclaiming "no one has done this."

### Theme E — Multi-source/data-fusion security detection

**Anjum et al. (2021)** — see Theme C, MIND paper; the strongest peer-reviewed precedent.

**Sophos Fusion** (commercial product, MSSPAlert coverage, not academic) — cited only to
show the *industry* is independently converging on the same idea (combining endpoint,
network, identity, and SIEM signals into one detection surface) that your Wazuh +
network-flow + RADIUS architecture implements — useful as a "the industry agrees this is
the right direction" data point, not as a scholarly citation.

---

## 3. Synthesis — mapped to your lecturer's questions

**Existing systems in place** → Theme A (governance frameworks) + Theme B (CASB) +
industry SIEM/EDR practice. Well documented.

**Existing gaps** → CASB is cloud-traffic-only by construction (Theme B); pure-supervised
ML misses novel apps, pure-unsupervised has high FP (Theme C, Mourouzis & Avgousti 2021);
Shadow-IT-specific technical detection literature is thin and mostly single-signal
(Theme D, Kutsal et al. 2023 = SaaS billing only).

**Why this solution over others** → Hybrid IF+RF has direct academic precedent (Marteau
et al. 2017; Mourouzis & Avgousti 2021) for balancing known-pattern precision against
novel-threat recall; multi-source fusion has direct academic precedent (Anjum et al. 2021)
for reducing false positives beyond any single signal.

**What problem are we solving** → Theme A, Silic & Back (2014) — Shadow IT as both a
governance and technical visibility problem.

**What makes the work different** → The *specific combination*: no verified source fuses
live network flow + endpoint software inventory + identity/session signals into one
Shadow-IT detection pipeline with a calibrated hybrid ML gate and a tamper-evident audit
log. Each individual piece has precedent; the combination does not, as far as this search
could establish.

**To what extent has the problem been solved** → Organizationally/governance-wise: fairly
mature (107-paper systematic review exists — Klotz et al. 2019). Commercially, for
*cloud* shadow IT: solved by CASBs, but closed-source and blind to on-prem traffic.
Technically/academically, for *automated multi-signal ML detection specifically framed as
Shadow IT*: not solved — thin, single-signal, mostly SaaS-billing-focused (Kutsal et al.
2023). State this gap honestly in your defense; it's your strongest card.

**How did we get to know there was this problem** → This is your own narrative (personal
observation, internship, or a specific stat that motivated you) — not something I can
supply. Pair it with a real stat once you've verified the primary source (Theme A).

---

## 4. Reference list (APA 7)

Anjum, N., Latif, Z., Lee, C., Shoukat, I. A., & Iqbal, U. (2021). MIND: A multi-source
data fusion scheme for intrusion detection in networks. *Sensors, 21*(14), 4941.
https://doi.org/10.3390/s21144941

Klotz, S., Kopper, A., Westner, M., & Strahringer, S. (2019). Causing factors, outcomes,
and governance of Shadow IT and business-managed IT: A systematic literature review.
*International Journal of Information Systems and Project Management, 7*(1), 15–43.

Kutsal, M., Das, B., Askar, Z., & Das, R. (2023). Detection of shadow IT incidents for
centralized IT management in enterprises using statistical and machine learning
algorithms. *European Journal of Technique*.

Marteau, P.-F., Soheily-Khah, S., & Béchet, N. (2017). *Hybrid isolation forest –
Application to intrusion detection* (arXiv:1705.03800). arXiv.
https://arxiv.org/abs/1705.03800

Mourouzis, T., & Avgousti, A. (2021). *Intrusion detection with machine learning using
open-sourced datasets* (arXiv:2107.12621). arXiv. https://arxiv.org/abs/2107.12621

Silic, M., & Back, A. (2014). Shadow IT – A view from behind the curtain. *Computers &
Security, 45*, 274–283. https://doi.org/10.1016/j.cose.2014.06.007

---

## 5. What to do before your defense

1. Pull each PDF/DOI above yourself and re-read the actual methodology sections — this
   review compressed each into 2–3 sentences.
2. Chase the primary Gartner/Cisco/McAfee reports if you want to quote a hard prevalence
   number — the ones above came via secondary aggregator sites.
3. If UMaT gives you IEEE Xplore/ACM/Scopus access, re-run Theme C and D searches there —
   likely surfaces more rigorously peer-reviewed CICIDS2017 papers than open web search
   does.
4. Drop or independently verify the unverified 2025 ResearchGate item before citing it.
