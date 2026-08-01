import type { ServiceStatus } from "@/lib/content";

/**
 * English copy. This file is the SHAPE the other locales conform to — add a
 * key here first, then to every other locale, or the build fails (pcm.ts is
 * typed as `Copy`).
 *
 * Locale-invariant values (₦7,500, the phone number, URLs, the language list)
 * stay in content.ts. Only prose lives here.
 */

export const en = {
  /* ---------------- shared chrome ---------------- */
  nav: {
    howItWorks: "How it works",
    whyRegister: "Why register",
    services: "Services",
    questions: "Questions",
    register: "Register my business",
    contactLangLabel: "We'll contact you in",
    contactLangAria: "Choose the language we will contact you in",
    siteLangLabel: "Read this site in",
    siteLangAria: "Choose the language of this site",
  },
  demoBanner:
    "no payment is taken, nothing is filed with the government, and the certificate shown is a specimen with no legal status.",
  footer: {
    blurb: "Register your business with the government, in your own language, for a flat",
    colRegister: "Register",
    colProject: "The project",
    colServices: "Services",
    colTalk: "Talk to a person",
    scanToRegister: "Scan to register",
    otherWays: "Other ways to register",
    about: "About Rejista",
    partners: "For banks & partners",
    privacy: "How we use your data",
    terms: "Terms",
    placeholder: "Placeholder contact details — to be replaced before launch.",
    builtBy: "Rejista — built by",
    disclaimer:
      "e-Governance Practicum (ICT4D). Rejista is a filing agent and is not the Corporate Affairs Commission. Registration is filed with CAC, which issues the certificate of incorporation.",
  },

  /* ---------------- landing ---------------- */
  home: {
    heroTitle: "Your business. Registered in minutes.",
    heroLede:
      "Answer a few questions in your own language. In under {minutes} minutes you get your government certificate, your tax number, and a business bank account. Flat fee {fee}.",
    heroCtaPrimary: "Register my business",
    heroCtaSecondary: "See how it works",
    heroFoot:
      "Registered through CAC — the Corporate Affairs Commission, the government office that registers Nigerian businesses.",
    problemEyebrow: "The problem",
    problemTitle: "Nine in ten businesses are invisible on paper.",
    figuresWarning:
      "Figures not yet verified. All three must be checked against SMEDAN/NBS and CAC/FIRS publications before this page goes live. A wrong number on a trust page costs more than a missing one.",
    howEyebrow: "How it works",
    howTitle: "Three steps. About ten minutes.",
    outcomesEyebrow: "What you walk away with",
    outcomesTitle: "Three things, in your business name.",
    benefitsEyebrow: "Why it is worth it",
    benefitsTitle: "What registration actually buys you.",
    benefitsLink: "The full case, with what registration also asks of you →",
    ctaTitle: "Scan with your phone camera, or tap to start.",
    ctaLede: "Free to begin — you only pay when we are ready to file.",
    ctaSecondary: "No smartphone? Other ways",
    qrNote:
      "Scanning this opens the registration form on your phone. The src parameter tells us which poster or market the scan came from, so we learn what actually works.",
  },

  /* ---------------- registration flow ---------------- */
  register: {
    step: "Step",
    of: "of",
    done: "Done",
    back: "Back",
    continue: "Continue",
    stuck: "Stuck? Call",
    s1Title: "Your details",
    s1Lede: "Three questions. We only ask for what the government needs.",
    fullName: "Full name",
    fullNameHelp: "As written on your ID",
    fullNameErr: "Please enter your first and last name.",
    phone: "Phone number",
    phoneHelp: "We'll send you a message here when your case moves",
    phoneErr: "Enter a Nigerian number, like 08031234567.",
    email: "Email address",
    emailHelp: "Where we send your certificate",
    emailErr: "Enter an email address, like adaeze@example.com.",
    // Named for what it actually controls. It used to read just "Language",
    // which people reasonably took for a second site-language switcher — they
    // changed it, the page stayed as it was, and concluded the site was broken.
    langLabel: "Language for us to contact you in",
    langHelp:
      "This is how we'll message you. The site itself is in English and Pidgin only.",
    langConfirm: "{greeting} — we'll message you in {lang}.",
    s2Title: "Your business",
    s2Lede: "The name you want on your certificate, and what you do.",
    bizName: "Business name (first choice)",
    bizNameHelp: "The name you want on your certificate",
    bizNameErr:
      "Use 3–100 characters. Words like “National”, “Federal” or “Bank” need special approval.",
    bizAlt: "Second choice",
    bizAltHelp: "In case your first choice is taken",
    trade: "What the business does",
    tradeHelp: "Pick the closest one",
    tradeChoose: "Choose…",
    state: "State",
    stateHelp: "Where the business operates",
    market: "Market or area",
    marketHelp: "Helps us find you if we need to",
    optional: "optional",
    hintLikely: "Looks free, but we confirm before you pay",
    hintRisky: "Common name — a second choice is wise",
    s3Title: "Confirm and agree",
    s3Lede: "Check what we are about to file. You can change anything.",
    edit: "Edit",
    costTitle: "What it costs",
    costService: "Rejista service fee",
    costGov: "Government (CAC) fee",
    costGovNote: "Paid to the government, not to us",
    costTotal: "Total",
    costNote:
      "An agent charges a comparable all-in. The CAC fee is indicative and confirmed before you pay.",
    consent:
      "I agree that Rejista can use my personal details to register my business with the Corporate Affairs Commission (CAC). I have read",
    consentLink: "how my data is used",
    marketing:
      "Optional: send me messages about services like loans, insurance and payments. You can say no and still register.",
    consentNote:
      "Consent is never pre-ticked. The time you agreed and the wording you agreed to are recorded with your case.",
    submit: "Send my details",
    s4Title: "Filing your registration",
    s4Lede: "You can close this page. We will message you when it moves.",
    s4Demo:
      "These stages are simulated on a timer. Nothing is being submitted to CAC. In the real product, a stage that takes hours or days says so instead of pretending to finish.",
    s5Title: "is on its way to the register.",
    s5Lede:
      "Here is your business card. Save it, print the record for your wall, and send it to whoever needs to see it.",
    print: "Print / save the record",
    copyLink: "Copy verification link",
    copied: "Link copied",
    copyManual: "Copy this link:",
    share: "Share",
    sumLang: "Language",
    statusDone: "Ready",
    statusPending: "In progress",
    statusPartner: "Partner needed",
    demoLabel: "This is a demonstration.",
    unlocked: "What you have unlocked",
    unlockedCac: "CAC certificate",
    unlockedCacNote:
      "Issued by the Corporate Affairs Commission once filing completes.",
    unlockedTin: "Tax Identification Number (TIN)",
    unlockedTinNote: "Requested with your filing.",
    unlockedBank: "Business bank account",
    unlockedBankNote:
      "No bank partner is signed yet, so we do not promise this. Your certificate and TIN are enough to open one yourself.",
    recordTitle: "Your record — printable, A4",
    s5Demo:
      "Nothing was filed with CAC, no payment was taken, and no tax number was issued. The record below is a specimen.",
    servicesLink: "See what else you can get now that you are registered →",
  },

  /* ---------------- secondary pages ---------------- */
  faq: {
    eyebrow: "Questions",
    title: "The things people actually ask.",
    lede: "Including the awkward ones. If your question is not here, call a real person on {phone}.",
    glossTitle: "Words we had to use",
    demo:
      "Nothing on this site files anything with the government yet. The answers above describe how Rejista is designed to work, not a service you can buy today.",
    demoLabel: "Still a demonstration.",
    cta: "Register my business",
  },
  services: {
    eyebrow: "Services",
    title: "What being registered opens up.",
    lede:
      "Registration is the door. These are the rooms behind it. We charge a share when you take one up, never a cut of your sales.",
    badgesLabel: "Read the badges.",
    badges:
      "Of the {total} services listed, {live} are available today, {soon} are built but not shipped, and {partner} need a partner we have not signed yet. They are listed so you can see the plan, not so you think you can buy them.",
    provider: "Provider",
    price: "Price",
    statusLive: "Available",
    statusSoon: "Coming",
    statusPartner: "Partner needed",
    cta: "Register my business first",
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "Three steps from you. Four stages from us.",
    lede:
      "Your part takes about {minutes} minutes. The government's part takes as long as it takes, and we tell you where it has got to instead of showing you a spinner.",
    yourSteps: "Your three steps",
    ourStages: "Our four stages",
    ourStagesLede:
      "Once you have sent your details, this is what actually happens. You can check which stage your case is at any time, without calling anyone.",
    costTitle: "What it costs",
    costWarnLabel: "The government fee is not final.",
    costWarn:
      "CAC sets it, not us, and it is confirmed before you pay anything. We show it separately so you can always see which part of the price is ours and which part is the government's.",
    timeTitle: "How long it really takes",
    timeBody:
      "Your part is about {minutes} minutes of questions. The government's part varies and is outside our control — often a few days. We message you when it moves, and you can look it up yourself in the meantime.",
    trustTitle: "What you can hold us to",
    demoLabel: "Still a demonstration.",
    demo:
      "This build files nothing and takes no payment. The stages above are what the real service is designed to do.",
    cta: "Register my business",
    ctaAlt: "No smartphone? Other ways to register",
  },
  whyRegister: {
    eyebrow: "Why register",
    title: "What registration buys you, and what it asks in return.",
    lede: "The full case. Including the parts that are not in our interest to mention.",
    figuresTitle: "Where things stand",
    buysTitle: "What it buys you",
    walkTitle: "What you walk away with",
    asksTitle: "What it asks of you",
    asksLede:
      "Registration is not free of consequences. These are the three that matter, stated plainly.",
    waitTitle: "When not to bother yet",
    waitBody:
      "If you are not selling yet, not looking for credit, and not trying to supply anyone who asks for papers, registration can wait. It is worth money when it unlocks something. We would rather you registered when it helps than because a website told you to.",
    cta: "Register my business",
    ctaAlt: "Read the questions first",
    obligations: [
      {
        title: "You get a tax number, and eventually a return to file",
        body: "Having a Tax Identification Number is not the same as owing tax. Below the turnover threshold you file a return and pay nothing. Above it, you pay. We would rather you heard that from us than from an inspector.",
      },
      {
        title: "Your registration has to be kept alive",
        body: "Annual returns are due to CAC. Miss them for long enough and the registration lapses, which is worse than never having registered, because you paid for it.",
      },
      {
        title: "Your business details become public",
        body: "That is the point — buyers and banks can look you up. But it does mean your business name, and the fact you own it, are on a public register.",
      },
    ],
  },
  otherWays: {
    eyebrow: "Other ways to register",
    title: "There is no Rejista app, and you do not need one.",
    lede:
      "Nothing to download, nothing to keep updated, nothing taking up space on your phone. Registration happens through one of three doors, and only one of them needs a smartphone.",
    whyNoAppTitle: "Why no app",
    whyNoApp:
      "An app would ask you to find it, download it over data you paid for, and keep it updated — all before you had registered anything. Registration is something most people do once. It should not require installing software.",
    warnLabel: "Two of these three doors are not open yet.",
    warn:
      "The field agent exists only for the pilot market, and USSD is planned rather than built. They are listed so you can see the whole plan, not so you think you can use them today.",
    stuck: "Stuck, or want a person? Call",
    doors: [
      {
        title: "This website",
        status: "Working now",
        body: "If you are reading this, you already have the door open. About ten minutes of questions on any phone with a browser.",
        action: "Register here",
      },
      {
        title: "A field agent, in your market",
        status: "Pilot only",
        body: "A person from Rejista sits with you, asks the same questions, and fills the form in. You do not need a phone at all, and you get to look someone in the eye first. During the pilot this is limited to one Lagos market.",
      },
      {
        title: "USSD, on any phone",
        status: "Planned, not built",
        body: "A short code you dial on the cheapest phone there is, with no internet and no app. This is planned for after the pilot. It is the door most people will eventually use, and it does not exist yet.",
      },
    ],
  },
  notFound: {
    eyebrow: "Page not found",
    title: "That page is not here.",
    lede:
      "Either we moved it or the link was wrong. Nothing you did caused this, and nothing you were doing has been lost.",
    home: "Back to the start",
    register: "Register my business",
    questions: "Questions",
    stuck: "Stuck? Call a real person on",
  },

  /* ---------------- translatable data ---------------- */
  gloss: {
    CAC: "Corporate Affairs Commission — the government office that registers Nigerian businesses",
    TIN: "Tax Identification Number",
    NIN: "National Identification Number",
    NDPA: "Nigeria Data Protection Act",
  },
  figures: [
    {
      value: "~40 million",
      label: "small businesses in Nigeria",
      source: "SMEDAN/NBS national MSME survey — figure to be verified",
    },
    {
      value: "~9 in 10",
      label: "are not registered — invisible to banks, government and big buyers",
      source: "SMEDAN/NBS national MSME survey — figure to be verified",
    },
  ],
  steps: [
    {
      n: 1,
      verb: "Answer",
      body: "A few questions in your own language — no paper forms, no office to visit, no agent to chase.",
    },
    {
      n: 2,
      verb: "Verify",
      body: "Your ID confirms who you are. We check your business name is free, then file it with the government.",
    },
    {
      n: 3,
      verb: "Grow",
      body: "You get your certificate and your tax number — enough to open a business account yourself, and more services as we sign partners.",
    },
  ],
  outcomes: [
    {
      title: "CAC certificate",
      body: "You legally own your business name. Nobody else in Nigeria can trade under it.",
      status: "live" as ServiceStatus,
    },
    {
      title: "Tax Identification Number (TIN)",
      body: "The number banks, corporate buyers and government contracts all ask for.",
      status: "live" as ServiceStatus,
    },
    {
      title: "Business bank account",
      body: "No bank partner is signed yet, so we do not promise this. Your certificate and TIN are enough to open one yourself.",
      status: "partner" as ServiceStatus,
    },
  ],
  benefits: [
    {
      title: "Borrow from a bank, not a moneylender",
      body: "A registered business with a tax number can be assessed on its trading history. Without papers, the only credit on offer is the daily-collection kind.",
    },
    {
      title: "Bid for contracts you cannot touch today",
      body: "Government tenders and corporate supply chains require a CAC number before they will even read your quote.",
    },
    {
      title: "Nobody can take your business name",
      body: "Registration means the name is yours nationally. Today, anyone can register the name you have traded under for fifteen years.",
    },
    {
      title: "Qualify for grants and support you cannot see",
      body: "Federal and state grant programmes, and most donor schemes, are only open to registered businesses.",
    },
  ],
  trust: [
    "Official CAC filing",
    "Your data protected under Nigerian law",
    "No hidden fees",
    "Real people you can call",
  ],
  trades: [
    "Fashion & tailoring",
    "Food & catering",
    "Repairs & mechanics",
    "Trading & retail",
    "Beauty & hair",
    "Building & carpentry",
    "Transport & logistics",
    "Farming & agro-processing",
    "Electronics & phones",
    "Printing & design",
    "Other",
  ],
  filingStages: [
    { label: "Checking your business name", detail: "Searching the CAC register for conflicts" },
    { label: "Confirming your identity", detail: "Matching your details against your ID record" },
    {
      label: "Filing with CAC",
      detail: "Submitting your registration to the Corporate Affairs Commission",
    },
    { label: "Issuing your tax number", detail: "Requesting your TIN" },
  ],
  serviceGroups: [
    {
      group: "Money in",
      blurb: "Get paid — by customers, and by the big companies that only pay registered suppliers.",
      items: [
        { name: "Accept card and transfer payments", provider: "Paystack / Flutterwave", price: "1.5% per transaction", body: "A payment link and a QR for your stall. Money lands in your business account.", status: "soon" as ServiceStatus },
        { name: "POS terminal", provider: "Partner needed", price: "From ₦25,000", body: "A card machine in your own business name, with next-day settlement.", status: "partner" as ServiceStatus },
        { name: "Supply to corporates", provider: "Rejista marketplace", price: "Free to list", body: "Big buyers filter suppliers by CAC number. Registration puts you in that filter.", status: "soon" as ServiceStatus },
      ],
    },
    {
      group: "Money to grow",
      blurb: "Credit priced off what you actually sell, not what you can pledge.",
      items: [
        { name: "Working-capital loan", provider: "Partner needed", price: "Rate set by lender", body: "Assessed on your transaction history rather than collateral or a guarantor.", status: "partner" as ServiceStatus },
        { name: "Equipment finance", provider: "Partner needed", price: "Rate set by lender", body: "For the freezer, the generator, the sewing machine — paid down monthly.", status: "partner" as ServiceStatus },
        { name: "Market-association savings", provider: "Cooperative partners", price: "Free", body: "Formal savings through your own market association, with a record that counts.", status: "soon" as ServiceStatus },
      ],
    },
    {
      group: "Protection",
      blurb: "What happens when the shop floods, or a supplier cheats you.",
      items: [
        { name: "Shop and stock insurance", provider: "Partner needed", price: "From ₦2,000/month", body: "Cover for fire, flood and theft on your premises and your goods.", status: "partner" as ServiceStatus },
        { name: "Health cover", provider: "Partner needed", price: "From ₦1,500/month", body: "For you and the people who work with you.", status: "partner" as ServiceStatus },
        { name: "Legal help", provider: "Partner needed", price: "Per matter", body: "When a supplier, a landlord or a customer does not keep their side.", status: "partner" as ServiceStatus },
      ],
    },
    {
      group: "Staying right",
      blurb: "The paperwork that keeps your registration alive, handled for you.",
      items: [
        { name: "Annual CAC returns", provider: "Rejista", price: "₦5,000/year", body: "Filed on time so your registration never lapses. We remind you before it is due.", status: "soon" as ServiceStatus },
        { name: "Tax filing and reminders", provider: "Rejista", price: "₦5,000/year", body: "What the government needs from you, when it needs it.", status: "soon" as ServiceStatus },
        { name: "Simple bookkeeping", provider: "Rejista", price: "Free tier", body: "Record sales and costs. Enough to satisfy a lender.", status: "soon" as ServiceStatus },
      ],
    },
  ],
  faqs: [
    { q: "Is this legal and official?", a: "Yes. We file your business with the Corporate Affairs Commission (CAC), the government office that registers Nigerian businesses. You receive the same certificate you would get by going to a CAC office yourself. Rejista is a filing agent, not the government." },
    { q: "I don't have a smartphone.", a: "You do not need one. A field agent can register you in person at your market, and a USSD path is planned so any phone works. The website is one of three doors, not the only one." },
    { q: "Why should I pay tax?", a: "Registration gives you a tax number, and above a turnover threshold it does mean filing. In exchange you can borrow from banks, bid for contracts and hold your name legally. We tell you this up front rather than after you have paid." },
    { q: "How do you make money?", a: "A flat fee for registration, and a share when you take up services like payments, loans or insurance through us. We never take a cut of your sales, and we never charge for the government's own fees on top without showing them separately." },
    { q: "Is my data safe?", a: "Your details are used to file your registration and nothing else. We do not sell your data. Sharing with a bank or insurer only happens if you separately agree to it. Full detail is on our privacy page, written under the Nigeria Data Protection Act (NDPA)." },
    { q: "How is this different from an agent?", a: "Price, time and honesty. An agent charges a comparable all-in but you do not know it up front, and it can take weeks. We tell you the government fee separately, and you can see your case status yourself instead of calling someone who does not pick up." },
    { q: "What if my business name is rejected?", a: "We check availability before you pay, and we ask for a second choice for exactly this reason. If both are rejected we work with you on a third at no extra charge." },
    { q: "How long does it really take?", a: "Your part takes about 10 minutes. The government's part varies — often a few days. We tell you the real stage your case is at and message you when it moves, rather than showing you a spinner." },
    { q: "Can I get a refund?", a: "If we cannot register you at all, you get the service fee back. Government fees already paid to CAC cannot be refunded by us — that is the government's money, not ours." },
    { q: "Do I have to pay tax immediately?", a: "No. Having a Tax Identification Number (TIN) is not the same as owing tax. Small businesses below the turnover threshold file a return but pay nothing." },
  ],

  /* Page titles and meta descriptions. These are what a browser tab, a search
     result and a WhatsApp link preview show — the last places on the site that
     were still English-only after the translation.

     /privacy and /terms are deliberately absent: those pages are English by
     design, so an English title is the consistent thing. */
  meta: {
    home: {
      title: "Rejista — Your business. Registered in minutes.",
      description:
        "Register your Nigerian business with the Corporate Affairs Commission in under 10 minutes, in your own language. Flat fee ₦7,500.",
    },
    register: {
      title: "Register your business — Rejista",
      description:
        "Four steps, about ten minutes. Your details, your business, confirm, and we file.",
    },
    faq: {
      title: "Questions — Rejista",
      description:
        "What registration costs, how long it takes, what happens if your name is rejected, and what we do with your data.",
    },
    services: {
      title: "Services — Rejista",
      description:
        "What a registered business can reach through Rejista: payments, credit, protection, and the paperwork that keeps registration alive.",
    },
    howItWorks: {
      title: "How it works — Rejista",
      description:
        "The three steps you take, the four stages we work through, what it costs, and how long the government's part really takes.",
    },
    whyRegister: {
      title: "Why register — Rejista",
      description:
        "What registration buys you, what it asks of you in return, and the honest case for and against doing it now.",
    },
    otherWays: {
      title: "Other ways to register — Rejista",
      description:
        "You do not need a smartphone. A field agent can register you in your market, and a USSD path is planned so any phone works.",
    },
    about: {
      title: "About Rejista",
      description:
        "Who is building Rejista, what stage it is at, what we are trying to prove, and what we do not know yet.",
    },
    partners: {
      title: "For banks & partners — Rejista",
      description:
        "What Rejista needs from a bank, lender or insurer, what we bring, and where we honestly are today.",
    },
    start: {
      title: "Rejista — scan to register",
      description:
        "Scan to register your business in about ten minutes. Below: the market, the model, the pilot, and what we still do not know.",
    },
  },
};

export type Copy = typeof en;
