/**
 * Curated company profiles — website, a neutral one-liner, and a factual,
 * sourced summary of how each company has intersected with the second Trump
 * administration. Researched and source-checked; loaded into the `companies`
 * table by the enrich stage. Every `trumpImpact` states facts only.
 *
 * Extend this list as more companies enter the disclosure dataset.
 */
export interface CompanyProfile {
  ticker: string;
  website: string;
  oneLiner: string;
  trumpImpact: string;
  sources: string[];
}

export const COMPANY_PROFILES: readonly CompanyProfile[] = [
  {
    ticker: "AAPL",
    website: "https://www.apple.com",
    oneLiner:
      "Apple Inc. designs and sells consumer electronics including the iPhone, iPad, Mac, and Apple Watch, along with software and digital services.",
    trumpImpact:
      "In 2025, amid Trump administration threats of tariffs on imported semiconductors and iPhones not made in the U.S., Apple announced expanded U.S. investment commitments, adding $100 billion in August 2025 to a previously announced $500 billion plan for a stated total of $600 billion over four years. Trump publicly cited Apple's commitments and indicated that companies manufacturing in the United States would be exempt from proposed chip tariffs.",
    sources: [
      "https://www.cnn.com/2025/08/06/tech/apple-investment-us-trump",
      "https://www.cbsnews.com/news/trump-apple-25-tariff-iphones/",
    ],
  },
  {
    ticker: "AMZN",
    website: "https://www.amazon.com",
    oneLiner:
      "Amazon.com Inc. operates a global e-commerce marketplace and the Amazon Web Services cloud-computing platform, along with advertising, devices, and streaming.",
    trumpImpact:
      "Amazon's retail business has faced exposure to the Trump administration's 2025 import tariffs, and the company has won federal cloud-computing contracts during the administration. A pre-existing Federal Trade Commission antitrust suit alleging illegal monopolization of online retail has continued. The company also faced consumer class-action litigation over its handling of tariff-related costs.",
    sources: [
      "https://www.theregister.com/2025/04/30/trump_outreach_to_bezos_shows/",
      "https://www.usnews.com/news/u-s-news-decision-points/articles/2025-04-30/trumps-tussle-with-amazon-reveals-tariff-vulnerability",
    ],
  },
  {
    ticker: "SO",
    website: "https://www.southerncompany.com",
    oneLiner:
      "Southern Company is a U.S. electric and natural gas utility holding company serving customers primarily in the southeastern United States.",
    trumpImpact:
      "Southern Company operates in the electric utility sector, which the Trump administration has targeted with 2025 executive orders aimed at expanding nuclear power and accelerating energy infrastructure for AI data centers. No Trump-administration action specific to Southern Company itself has been identified in available reporting.",
    sources: [
      "https://www.energy.gov/ne/articles/9-key-takeaways-president-trumps-executive-orders-nuclear-energy",
      "https://www.whitehouse.gov/fact-sheets/2026/03/fact-sheet-president-donald-j-trump-advances-energy-affordability-with-the-ratepayer-protection-pledge/",
    ],
  },
  {
    ticker: "XYZ",
    website: "https://block.xyz",
    oneLiner:
      "Block Inc. (formerly Square) is a financial-technology company operating the Square merchant platform, the Cash App consumer app, and other businesses.",
    trumpImpact:
      "Block operates in the fintech and digital-payments sector affected by the Trump administration's deregulatory and crypto-friendly posture, including the May 2025 withdrawal of a proposed CFPB crypto rule and the July 2025 GENIUS Act on stablecoins. In March 2025, Block's subsidiary Square Financial Services received FDIC approval to offer the Cash App Borrow loan product. No Trump-administration action specific to Block was identified.",
    sources: [
      "https://www.fintechanddigitalassets.com/2025/01/cfpb-proposes-extending-electronic-funds-transfer-act-protections-to-stablecoin-and-gaming-accounts/",
      "https://www.businesswire.com/news/home/20250313932264/en/Square-Financial-Services-Inc.-Receives-FDIC-Approval-to-Offer-Consumer-Loan-Product-Cash-App-Borrow",
    ],
  },
  {
    ticker: "INTC",
    website: "https://www.intel.com",
    oneLiner:
      "Intel Corporation designs and manufactures semiconductors, including processors for personal computers, data centers, and other computing devices.",
    trumpImpact:
      "In August 2025, the Trump administration reached an agreement under which the U.S. government took an approximately 10% equity stake in Intel, an $8.9 billion investment funded largely by converting previously awarded CHIPS Act and Secure Enclave grants into common stock. Intel stated the stake is passive, with no board seats, plus a five-year warrant for an additional 5%. The arrangement drew scrutiny from some members of Congress.",
    sources: [
      "https://www.cnbc.com/2025/08/22/intel-goverment-equity-stake.html",
      "https://newsroom.intel.com/corporate/intel-and-trump-administration-reach-historic-agreement",
    ],
  },
  {
    ticker: "MSTR",
    website: "https://www.strategy.com",
    oneLiner:
      "Strategy Inc. (formerly MicroStrategy) is an enterprise software company that has adopted bitcoin as its primary treasury reserve asset.",
    trumpImpact:
      "As a company whose value is closely tied to bitcoin, Strategy's stock has been sensitive to Trump administration cryptocurrency policy; shares rose in March 2025 after Trump announced plans for a U.S. crypto strategic reserve that would include bitcoin. The administration's broader pro-crypto regulatory stance has been cited by analysts as supportive of bitcoin-treasury companies.",
    sources: [
      "https://www.thestreet.com/crypto/markets/microstrategy-stock-jumps-10-as-bitcoin-surges-on-trumps-crypto-reserve-plan",
      "https://www.coindesk.com/business/2025/03/25/michael-saylor-200-trillion-bitcoin-strategy-us-btc-domination-immortality",
    ],
  },
  {
    ticker: "MSFT",
    website: "https://www.microsoft.com",
    oneLiner:
      "Microsoft Corporation develops software, the Azure cloud platform, productivity tools, and hardware, and is a major investor in artificial intelligence.",
    trumpImpact:
      "A Federal Trade Commission antitrust investigation of Microsoft begun late in the Biden administration has continued under the Trump administration, examining cloud-services bundling, cybersecurity offerings, and federal contracts. Microsoft's AI and data-center expansion has intersected with Executive Order 14318 directing accelerated federal permitting of large data centers.",
    sources: [
      "https://fortune.com/2025/03/12/trump-ftc-microsoft-antitrust-probe-ai-openai-meta-amazon/",
      "https://www.insidegovernmentcontracts.com/2025/08/july-2025-ai-developments-under-the-trump-administration/",
    ],
  },
  {
    ticker: "NFLX",
    website: "https://www.netflix.com",
    oneLiner:
      "Netflix Inc. operates a subscription streaming service offering films and television series and produces original content worldwide.",
    trumpImpact:
      "In 2025, President Trump announced a proposed 100% tariff on foreign-produced films, previewed in May and reiterated in September, citing national security and unfair foreign competition. Netflix shares declined following the announcements, though the administration did not specify how a foreign-produced film would be defined or how the tariff would be implemented.",
    sources: [
      "https://variety.com/2025/film/news/trump-movie-tariff-stocks-studios-disney-netflix-1236386712/",
      "https://www.cnn.com/2025/09/29/economy/trump-movie-tariff",
    ],
  },
  {
    ticker: "LRCX",
    website: "https://www.lamresearch.com",
    oneLiner:
      "Lam Research Corporation designs and manufactures semiconductor processing equipment used to fabricate integrated circuits.",
    trumpImpact:
      "As a major maker of semiconductor manufacturing equipment, Lam Research has been affected by the Trump administration's 2025 approach to China export controls, which has included tighter restrictions on chipmaking equipment. The company reports a significant share of revenue from China and has stated it expects that share to decline.",
    sources: [
      "https://www.congress.gov/crs-product/R48642",
      "https://thehill.com/policy/technology/5545901-semiconductor-equipment-export-control/",
    ],
  },
  {
    ticker: "TGT",
    website: "https://www.target.com",
    oneLiner:
      "Target Corporation is a U.S. general-merchandise retailer operating large-format discount stores and an e-commerce business.",
    trumpImpact:
      "In January 2025, Target announced it would roll back certain diversity, equity, and inclusion programs, a move it connected to the Trump administration's executive order ending federal DEI initiatives; the decision prompted consumer boycotts. Target has also cited exposure to 2025 import tariffs and reduced its sales outlook in May 2025, attributing weaker results to both tariff uncertainty and the DEI backlash.",
    sources: [
      "https://www.washingtonpost.com/business/2025/05/21/target-earnings-foot-traffic-tariffs-dei/",
      "https://www.newsweek.com/target-cuts-sales-outlook-dei-backlash-tariff-uncertainty-2075260",
    ],
  },
  {
    ticker: "CARR",
    website: "https://www.corporate.carrier.com",
    oneLiner:
      "Carrier Global Corporation manufactures heating, ventilation, air conditioning, and refrigeration equipment and related building and cold-chain solutions.",
    trumpImpact:
      "As an HVAC manufacturer with production in Mexico and component sourcing from China, Carrier has exposure to the Trump administration's 2025 import tariffs. Industry coverage has identified Carrier among major HVAC makers facing higher input costs and supply-chain pressures from the tariffs. No Trump-administration action specific to Carrier was identified.",
    sources: [
      "https://www.achrnews.com/articles/165075-trump-tariffs-kick-in-and-could-raise-hvac-prices",
      "https://www.marketsandmarkets.com/ResearchInsight/trump-tariffs-impact-hvac-system-market.asp",
    ],
  },
  {
    ticker: "BA",
    website: "https://www.boeing.com",
    oneLiner:
      "Boeing is a U.S. aerospace company that designs and manufactures commercial jetliners, defense aircraft, satellites, and space systems.",
    trumpImpact:
      "Boeing aircraft purchases have featured prominently in trade agreements negotiated by the second Trump administration, including deals with Japan, the U.K., and Indonesia. The administration's 2025 tariffs affect aircraft trade and Boeing's supply costs. Trump has also publicly criticized Boeing over delays in its program to build two replacement Air Force One aircraft.",
    sources: [
      "https://www.axios.com/2025/07/23/japan-trade-deal-boeing-trump-tariffs",
      "https://www.bloomberg.com/news/newsletters/2025-04-10/trump-tariffs-hurt-boeing-s-hopes-of-selling-more-planes-in-china",
    ],
  },
  {
    ticker: "GIS",
    website: "https://www.generalmills.com",
    oneLiner:
      "General Mills is a U.S. packaged-foods company that makes cereals, snacks, baking products, and other branded consumer food items.",
    trumpImpact:
      "In 2025 the Trump administration's Make America Healthy Again initiative and the Department of Health and Human Services pushed food companies to phase out certain artificial dyes. General Mills announced it would remove artificial colors from its U.S. retail portfolio by the end of 2027, with U.S. cereals and K-12 school foods free of the additives by summer 2026.",
    sources: [
      "https://www.foxbusiness.com/lifestyle/popular-foods-affected-companies-align-trump-admins-maha-initiative",
      "https://www.whitehouse.gov/articles/2025/07/president-trump-delivers-on-maha-push",
    ],
  },
  {
    ticker: "FAST",
    website: "https://www.fastenal.com",
    oneLiner:
      "Fastenal is a U.S. industrial and construction supply distributor specializing in fasteners and related maintenance, repair, and operations products.",
    trumpImpact:
      "The Trump administration's 2025 tariffs, including expanded Section 232 duties on steel and aluminum raised to 50%, affected the cost of imported fasteners central to Fastenal's business. The company responded by adjusting its supply chain and raising prices, which added roughly 240-270 basis points to net sales growth in the third quarter of 2025.",
    sources: [
      "https://distributionstrategy.com/fastenal-responds-to-rising-tariffs-with-supply-chain-shifts-price-increases-and-digital-focus/",
      "https://www.whitehouse.gov/fact-sheets/2025/06/fact-sheet-president-donald-j-trump-increases-section-232-tariffs-on-steel-and-aluminum/",
    ],
  },
  {
    ticker: "TMO",
    website: "https://www.thermofisher.com",
    oneLiner:
      "Thermo Fisher Scientific supplies laboratory instruments, reagents, diagnostics, and services for scientific research and healthcare.",
    trumpImpact:
      "In 2025 the Trump administration paused and cut National Institutes of Health research grants and reduced indirect-cost reimbursements, prompting more cautious purchasing by U.S. laboratory customers. Thermo Fisher cited these changes, with tariff exposure, in lowering the midpoint of its 2025 revenue guidance by about $500 million, and announced roughly $2 billion in U.S. manufacturing and R&D investment.",
    sources: [
      "https://www.mddionline.com/business/thermo-fisher-lowers-2025-guidance-as-trump-tariffs-research-cuts-take-toll",
      "https://www.pharmamanufacturing.com/all-articles/article/55285439/thermo-fisher-invests-2b-in-us-manufacturing-and-rd-works-to-offset-impacts-of-tariffs",
    ],
  },
  {
    ticker: "JPM",
    website: "https://www.jpmorganchase.com",
    oneLiner:
      "JPMorgan Chase is a U.S. global financial-services firm providing consumer and commercial banking, investment banking, and asset management.",
    trumpImpact:
      "The Trump administration made bank \"debanking\" a focus, issuing an August 2025 executive order directing regulators to address denial of financial services. JPMorgan disclosed related reviews in SEC filings. In January 2026, President Trump filed a lawsuit against JPMorgan and CEO Jamie Dimon seeking at least $5 billion, alleging his accounts were closed for political reasons; JPMorgan stated it does not close accounts for political or religious reasons.",
    sources: [
      "https://www.bankingdive.com/news/jpmorgan-chase-bank-of-america-debanking-inquiry-sec-filing-trump-occ-fed-fdic/804733/",
      "https://www.npr.org/2026/01/22/nx-s1-5685151/trump-jpmorgan-chase-jamie-dimon-debanking",
    ],
  },
  {
    ticker: "PLTR",
    website: "https://www.palantir.com",
    oneLiner:
      "Palantir Technologies builds data-integration and analytics platforms for government and commercial customers.",
    trumpImpact:
      "Palantir's U.S. federal contracts expanded substantially during 2025, including a roughly $30 million ICE agreement to build an immigration data system known as ImmigrationOS and a Defense Department arrangement with a contract ceiling reported up to $10 billion. The company's federal revenue and stock value rose sharply as it deepened work across defense and immigration-enforcement agencies.",
    sources: [
      "https://thehill.com/policy/technology/5667232-palantir-trump-administration-surveillance/",
      "https://truthout.org/articles/palantir-paid-no-federal-income-tax-in-2025-as-it-partnered-with-ice-pentagon/",
    ],
  },
  {
    ticker: "TYL",
    website: "https://www.tylertech.com",
    oneLiner:
      "Tyler Technologies provides software and services for state and local government operations such as courts, public safety, and finance.",
    trumpImpact:
      "The Trump administration established the Department of Government Efficiency (DOGE) in January 2025 to modernize federal technology. Tyler Technologies, which primarily serves state and local governments, told investors it had not seen and did not anticipate a meaningful negative impact from DOGE, characterizing its software as essential.",
    sources: [
      "https://www.govtech.com/biz/tyler-ceo-sees-opportunity-via-doge-tech-improvements",
      "https://www.whitehouse.gov/presidential-actions/2025/01/establishing-and-implementing-the-presidents-department-of-government-efficiency/",
    ],
  },
  {
    ticker: "TSLA",
    website: "https://www.tesla.com",
    oneLiner:
      "Tesla designs and manufactures electric vehicles, battery energy-storage systems, and solar products.",
    trumpImpact:
      "The Trump administration's 2025 tax-and-spending law ended the federal EV tax credit after September 30, 2025, and Republican budget measures targeted the regulatory-credit revenue Tesla relies on; CEO Elon Musk, who had advised Trump and led DOGE before a public falling-out, criticized the legislation. The NHTSA also opened new investigations into Tesla's autonomous-driving technology following its June 2025 robotaxi launch.",
    sources: [
      "https://www.cnbc.com/2025/07/10/trump-big-beautiful-bill-ends-7500-ev-tax-credit-time-to-buy-vehicle.html",
      "https://www.cnn.com/2025/08/21/business/tesla-nhtsa-self-driving-investigation",
    ],
  },
  {
    ticker: "META",
    website: "https://www.meta.com",
    oneLiner:
      "Meta Platforms operates Facebook, Instagram, and WhatsApp and develops virtual- and augmented-reality products.",
    trumpImpact:
      "The Federal Trade Commission's antitrust case against Meta over its Instagram and WhatsApp acquisitions went to trial in April 2025; on November 18, 2025, a federal judge ruled in Meta's favor, finding the FTC had not proven monopoly power. Separately, in early 2025 Meta paid $25 million to settle a lawsuit Trump had brought over the suspension of his accounts after January 6, 2021.",
    sources: [
      "https://www.hoganlovells.com/en/publications/federal-judge-says-meta-is-not-a-monopoly-ending-ftcs-longrunning-antitrust-case",
      "https://en.wikipedia.org/wiki/FTC_v._Meta",
    ],
  },
  {
    ticker: "BKNG",
    website: "https://www.bookingholdings.com",
    oneLiner:
      "Booking Holdings operates online travel reservation platforms including Booking.com, Priceline, Agoda, Kayak, and OpenTable.",
    trumpImpact:
      "Industry data through 2025 showed a decline in international travel to the United States, which analysts attributed to factors including Trump administration tariffs, immigration enforcement, and trade rhetoric. Booking Holdings reported a moderation in U.S. inbound travel in its Q1 2025 results while noting offsetting strength elsewhere and overall global growth.",
    sources: [
      "https://www.pbs.org/newshour/politics/a-downturn-in-international-travel-to-the-u-s-may-last-beyond-summer-experts-warn",
      "https://www.phocuswire.com/booking-holdings-q1-2025-earnings",
    ],
  },
  {
    ticker: "TEAM",
    website: "https://www.atlassian.com",
    oneLiner:
      "Atlassian makes team collaboration and project-management software such as Jira, Confluence, and Trello.",
    trumpImpact:
      "In March 2025 Atlassian Government Cloud received FedRAMP Moderate authorization, allowing U.S. federal, state, and local agencies to adopt its software. Atlassian framed this as relevant to the Trump administration's DOGE mandate to streamline public-sector operations. No direct contract awards or regulatory actions specific to the administration have been widely reported.",
    sources: [
      "https://www.nasdaq.com/press-release/atlassian-achieves-fedrampr-moderate-authorization-atlassian-government-cloud-2025-03",
      "https://www.capitalbrief.com/briefing/atlassian-gains-access-to-us-federal-agencies-to-boost-productivity-502525a4-9b0b-4eb0-ad85-00abfa1cf4a8/",
    ],
  },
  {
    ticker: "MET",
    website: "https://www.metlife.com",
    oneLiner:
      "MetLife is a multinational insurance and financial-services company providing life insurance, annuities, employee benefits, and asset management.",
    trumpImpact:
      "MetLife has had no notable company-specific intersection with the second Trump administration as of mid-2026. As a large insurer it is broadly exposed to federal financial deregulation and to market and tariff-driven volatility, but no executive order, contract, or regulatory action has singled out the company.",
    sources: [
      "https://investments.metlife.com/insights/macro-strategy/global-risks-2025-midyear-update/",
      "https://www.brookings.edu/articles/tracking-regulatory-changes-in-the-second-trump-administration/",
    ],
  },
  {
    ticker: "LNG",
    website: "https://www.cheniere.com",
    oneLiner:
      "Cheniere Energy is the largest U.S. producer and exporter of liquefied natural gas, operating export terminals in Texas and Louisiana.",
    trumpImpact:
      "On January 20, 2025, President Trump issued an executive order lifting the prior pause on new LNG export permit applications, a change Cheniere said it would use to pursue expansion. In 2025 the Department of Energy approved a roughly 12% export expansion at Cheniere's Corpus Christi LNG terminal. Cheniere's CEO stated the company plans to expand capacity under the administration's energy policy.",
    sources: [
      "https://www.energy.gov/articles/energy-department-approves-export-expansion-corpus-christi-lng",
      "https://energynow.com/2025/02/lng-exporter-cheniere-looking-to-expand-under-trump-ceo-says/",
    ],
  },
  {
    ticker: "CALM",
    website: "https://www.calmainefoods.com",
    oneLiner:
      "Cal-Maine Foods is the largest producer and distributor of fresh shell eggs in the United States.",
    trumpImpact:
      "Amid an avian-flu outbreak that drove record egg prices in early 2025, the Department of Justice's antitrust division opened an investigation into major egg producers' pricing, and Cal-Maine confirmed it is cooperating. In February 2025, Agriculture Secretary Brooke Rollins toured a Cal-Maine facility in Texas and hosted an avian-flu roundtable.",
    sources: [
      "https://www.foodengineeringmag.com/articles/102970-cal-maine-foods-reports-cooperation-with-doj-investigation-into-egg-prices",
      "https://www.usda.gov/about-usda/news/press-releases/2025/02/24/secretary-rollins-tours-egg-laying-facility-hosts-avian-flu-roundtable-texas",
    ],
  },
  {
    ticker: "MS",
    website: "https://www.morganstanley.com",
    oneLiner:
      "Morgan Stanley is a global investment bank and wealth- and asset-management firm.",
    trumpImpact:
      "In August 2025, President Trump signed the \"Guaranteeing Fair Banking for All Americans\" executive order directing regulators to address \"debanking\" and remove reputation-risk criteria from supervisory guidance, a directive applying broadly to banks including Morgan Stanley. No enforcement action specific to Morgan Stanley arising from this order has been publicly identified.",
    sources: [
      "https://www.lw.com/en/insights/president-trump-issues-executive-order-on-fair-banking",
      "https://www.consumerfinancemonitor.com/2025/08/12/trump-issues-executive-order-prohibiting-debanking/",
    ],
  },
  {
    ticker: "AXP",
    website: "https://www.americanexpress.com",
    oneLiner:
      "American Express is a financial-services company that issues credit and charge cards and operates a global payments network.",
    trumpImpact:
      "In April 2025, the Consumer Financial Protection Bureau agreed to a settlement in which a federal judge vacated the CFPB rule that would have capped credit-card late fees at $8, an outcome that benefited card issuers including American Express. The company is otherwise subject to the administration's broader financial deregulatory agenda but has not been the target of a company-specific federal action.",
    sources: [
      "https://www.consumerfinancemonitor.com/2025/04/16/federal-judge-voids-cfpb-credit-card-late-fee-rule/",
      "https://bankingjournal.aba.com/2025/04/cfpb-to-vacate-credit-card-late-fee-rule-in-deal-with-banks/",
    ],
  },
  {
    ticker: "RKLB",
    website: "https://www.rocketlabcorp.com",
    oneLiner:
      "Rocket Lab is an aerospace company that provides launch services and manufactures spacecraft and satellite components.",
    trumpImpact:
      "In December 2025, the U.S. Space Development Agency awarded Rocket Lab an $816 million prime contract to build 18 missile-tracking satellites for the Tracking Layer Tranche 3 program — the company's largest single contract to date — as part of a roughly $3.5 billion package also split among Lockheed Martin, L3Harris, and Northrop Grumman.",
    sources: [
      "https://rocketlabcorp.com/updates/rocket-lab-awarded-816m-prime-contract-to-build-missile-defense-satellite-constellation-for-u-s-space-force/",
      "https://www.airandspaceforces.com/sda-tranche-3-new-missile-tracking-defense-satellites/",
    ],
  },
  {
    ticker: "LMT",
    website: "https://www.lockheedmartin.com",
    oneLiner:
      "Lockheed Martin is a defense and aerospace company that develops military aircraft, missiles, satellites, and related systems.",
    trumpImpact:
      "In 2025 Lockheed Martin and the Pentagon finalized a roughly $24.3 billion contract for nearly 300 F-35 fighters across production lots 18 and 19. The Trump administration's proposed defense-budget framework included continued F-35 procurement. The Defense Department also raised concerns in 2025 about F-35 readiness rates and contractor oversight.",
    sources: [
      "https://breakingdefense.com/2025/09/lockheed-pentagon-finalize-deal-for-296-f-35s/",
      "https://www.thestreet.com/investing/stocks/trumps-2-2t-proposed-defense-budget-boosts-lockheed-martins-outlook",
    ],
  },
  {
    ticker: "COST",
    website: "https://www.costco.com",
    oneLiner:
      "Costco Wholesale operates a global chain of membership-only warehouse retail stores.",
    trumpImpact:
      "In January 2025, Costco's board recommended against, and shareholders rejected, a proposal to reassess the company's diversity, equity, and inclusion practices — diverging from competitors that scaled back DEI. Costco also filed a lawsuit challenging the administration's emergency-powers tariffs, seeking eligibility for refunds, and has cited tariff exposure as a cost-management challenge.",
    sources: [
      "https://www.cnn.com/2025/12/03/business/costco-trump-tariffs",
      "https://finance.yahoo.com/news/costco-defied-trump-dei-directive-130000470.html",
    ],
  },
  {
    ticker: "NVDA",
    website: "https://www.nvidia.com",
    oneLiner:
      "NVIDIA designs graphics processing units and AI computing hardware and software used in data centers, gaming, and other applications.",
    trumpImpact:
      "In April 2025, the Trump administration imposed a licensing requirement on NVIDIA's China-bound H20 AI chips, halting billions in sales; in July 2025 it allowed exports to resume. In August 2025, the administration permitted H20 sales to China on the condition that NVIDIA remit 15% of the resulting revenue to the U.S. government. NVIDIA also announced plans for significant U.S.-based AI-infrastructure investment.",
    sources: [
      "https://www.npr.org/2025/04/09/nx-s1-5356480/nvidia-china-ai-h20-chips-trump",
      "https://time.com/7309264/nvidia-trump-china-chips-deal-h20-blackwell-national-security-concerns/",
    ],
  },
  {
    ticker: "NDAQ",
    website: "https://www.nasdaq.com",
    oneLiner:
      "Nasdaq, Inc. operates stock exchanges and provides market technology, data, and regulatory and listing services.",
    trumpImpact:
      "Nasdaq has had no notable company-specific intersection with the second Trump administration as of mid-2026. As an exchange operator it is affected by the SEC's deregulatory direction under Trump-appointed Chair Paul Atkins, including the agency's \"Project Crypto\" initiative, but no executive order or federal action has specifically targeted Nasdaq.",
    sources: [
      "https://www.sec.gov/newsroom/speeches-statements/atkins-111225-secs-approach-digital-assets-inside-project-crypto",
      "https://www.thestreet.com/crypto/policy/sec-pushes-new-crypto-rule-despite-major-wall-street-warnings",
    ],
  },
  {
    ticker: "ON",
    website: "https://www.onsemi.com",
    oneLiner:
      "ON Semiconductor (onsemi) designs and manufactures power and sensing semiconductors used in automotive, industrial, and other applications.",
    trumpImpact:
      "ON Semiconductor is exposed to the Trump administration's 2025-2026 semiconductor trade policy, including threatened tariffs of up to 100% on imported chips with exemptions for U.S. manufacturers, and a Section 232 tariff action on certain semiconductors and equipment. The administration also moved to renegotiate CHIPS Act incentive awards. No federal action has specifically singled out ON Semiconductor.",
    sources: [
      "https://www.axios.com/2025/08/06/trump-semiconductor-chip-tariffs",
      "https://www.whitehouse.gov/presidential-actions/2026/01/adjusting-imports-of-semiconductors-semiconductor-manufacturing-equipment-and-their-derivative-products-into-the-united-states/",
    ],
  },
] as const;
