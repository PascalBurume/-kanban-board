import type { ServiceStatus } from "@/lib/content";
import type { Copy } from "./en";

/**
 * Nigerian Pidgin copy.
 *
 * ⚠️ NEEDS NATIVE REVIEW BEFORE LAUNCH — spec §7 requires all copy to be
 * reviewed by a native Pidgin speaker. This is a careful first draft written
 * to be idiomatic rather than word-for-word, but it has NOT been reviewed by
 * a native speaker. Owner: Olu (§15).
 *
 * Reviewer notes:
 *  - Prices, phone numbers and URLs are deliberately untranslated.
 *  - "CAC" is kept as the acronym: it is what the office is called on the
 *    street, and translating it would make the certificate harder to ask for.
 *  - Register is written the way a Lagos market trader speaks, not the way
 *    Pidgin is written in newspapers. If that reads too informal for the
 *    audience, this is the file to change.
 */

export const pcm: Copy = {
  /* ---------------- shared chrome ---------------- */
  nav: {
    howItWorks: "How e dey work",
    whyRegister: "Why you go register",
    services: "Other things",
    questions: "Question dem",
    register: "Register my business",
    contactLangLabel: "We go talk to you for",
    contactLangAria: "Choose di language wey we go take talk to you",
    siteLangLabel: "Read dis site for",
    siteLangAria: "Choose di language of dis site",
  },
  demoBanner:
    "we no dey collect money, we no dey file anything give government, and di certificate wey you see na sample wey no get power for law.",
  footer: {
    blurb: "Register your business with government, for your own language, for one flat",
    colRegister: "Register",
    colProject: "Di project",
    colServices: "Other things",
    colTalk: "Talk to person",
    scanToRegister: "Scan make you register",
    otherWays: "Other way to register",
    about: "About Rejista",
    partners: "For bank & partner",
    privacy: "How we dey use your data",
    terms: "Terms",
    placeholder: "Dis contact na placeholder — we go change am before we launch.",
    builtBy: "Rejista — na",
    disclaimer:
      "e-Governance Practicum (ICT4D). Rejista na filing agent, we no be Corporate Affairs Commission. Na CAC we dey file your registration give, na dem dey give di certificate.",
  },

  /* ---------------- landing ---------------- */
  home: {
    heroTitle: "Your business. Registered for small time.",
    heroLede:
      "Answer small question for your own language. Before {minutes} minutes finish you go get your government certificate, your tax number, and business bank account. One flat price: {fee}.",
    heroCtaPrimary: "Register my business",
    heroCtaSecondary: "See how e dey work",
    heroFoot:
      "Na CAC we dey register am — Corporate Affairs Commission, di government office wey dey register business for Nigeria.",
    problemEyebrow: "Di problem",
    problemTitle: "Nine out of ten business no dey for paper.",
    figuresWarning:
      "We never confirm dis number dem. We must check all three against SMEDAN/NBS and CAC/FIRS before dis page go live. Wrong number for page wey suppose build trust dey cost pass number wey no dey.",
    howEyebrow: "How e dey work",
    howTitle: "Three step. Like ten minutes.",
    outcomesEyebrow: "Wetin you go carry go",
    outcomesTitle: "Three thing, for your business name.",
    benefitsEyebrow: "Why e worth am",
    benefitsTitle: "Wetin registration really dey buy you.",
    benefitsLink: "Di full story, plus wetin registration dey ask from you →",
    ctaTitle: "Point your phone camera come here, abi tap make you start.",
    ctaLede: "E free to start — na when we ready to file you go pay.",
    ctaSecondary: "You no get smart phone? Other way dey",
    qrNote:
      "If you scan dis one, di registration form go open for your phone. Di src part dey tell us which poster or which market di scan comot from, so we go sabi wetin dey work.",
  },

  /* ---------------- registration flow ---------------- */
  register: {
    step: "Step",
    of: "out of",
    done: "E don finish",
    back: "Go back",
    continue: "Continue",
    stuck: "You stuck? Call",
    s1Title: "Your particulars",
    s1Lede: "Three question. Na only wetin government need we dey ask.",
    fullName: "Your full name",
    fullNameHelp: "Di way e dey for your ID",
    fullNameErr: "Abeg put your first name and your last name.",
    phone: "Phone number",
    phoneHelp: "We go send you message for here when your case move",
    phoneErr: "Put Nigerian number, like 08031234567.",
    email: "Email address",
    emailHelp: "Na here we go send your certificate",
    emailErr: "Put email address, like adaeze@example.com.",
    langLabel: "Language",
    langHelp: "Di language wey we go take talk to you",
    s2Title: "Your business",
    s2Lede: "Di name wey you want for your certificate, and wetin you dey do.",
    bizName: "Business name (di one you want pass)",
    bizNameHelp: "Di name wey you want make e dey your certificate",
    bizNameErr:
      "Use 3 to 100 letter. Word like “National”, “Federal” or “Bank” need special permission.",
    bizAlt: "Second choice",
    bizAltHelp: "In case person don take your first choice",
    trade: "Wetin di business dey do",
    tradeHelp: "Pick di one wey near am",
    tradeChoose: "Choose…",
    state: "State",
    stateHelp: "Where di business dey operate",
    market: "Market abi area",
    marketHelp: "E go help us find you if we need am",
    optional: "if you want",
    hintLikely: "E look like say e free, but we go confirm before you pay",
    hintRisky: "Plenty person dey use dis kind name — carry second choice",
    s3Title: "Check am, then agree",
    s3Lede: "Look wetin we wan file. You fit change anything.",
    edit: "Change am",
    costTitle: "Wetin e go cost",
    costService: "Rejista service fee",
    costGov: "Government (CAC) fee",
    costGovNote: "Na government dey collect am, no be us",
    costTotal: "Total",
    costNote:
      "Agent dey collect something near dis same amount. Di CAC fee never final — we go confirm am before you pay.",
    consent:
      "I gree make Rejista use my particulars register my business with Corporate Affairs Commission (CAC). I don read",
    consentLink: "how dem dey use my data",
    marketing:
      "If you want: send me message about other thing like loan, insurance and payment. You fit talk say no and still register.",
    consentNote:
      "We no dey tick dis box for you. We dey record di time wey you gree and di exact words wey you gree to, together with your case.",
    submit: "Send my particulars",
    s4Title: "We dey file your registration",
    s4Lede: "You fit close dis page. We go message you when e move.",
    s4Demo:
      "Dis stage dem na timer we set, no be real. Nothing dey go CAC. For di real product, if one stage go take hours or days, e go tell you instead of pretending say e don finish.",
    s5Title: "don dey go di register.",
    s5Lede:
      "Na your business card be dis. Save am, print di record for your wall, and send am give anybody wey need to see am.",
    print: "Print / save di record",
    copyLink: "Copy di link wey dem go take check",
    copied: "Link don copy",
    copyManual: "Copy dis link:",
    share: "Share am",
    unlocked: "Wetin you don open",
    recordTitle: "Your record — you fit print am, A4",
    s5Demo:
      "Nothing go CAC, we no collect money, and no tax number comot. Di record wey dey below na sample.",
    servicesLink: "See other thing wey you fit get now wey you don register →",
  },

  /* ---------------- secondary pages ---------------- */
  faq: {
    eyebrow: "Question dem",
    title: "Di thing wey people really dey ask.",
    lede: "Even di hard ones. If your own question no dey here, call person for {phone}.",
    glossTitle: "Word dem wey we must use",
    demo:
      "Nothing for dis site dey file anything give government yet. Di answer dem dey explain how Rejista suppose work, no be service wey you fit buy today.",
    demoLabel: "E still be demonstration.",
    cta: "Register my business",
  },
  services: {
    eyebrow: "Other things",
    title: "Wetin registration dey open for you.",
    lede:
      "Registration na di door. Na dis be di room dem wey dey behind am. We dey collect small share when you take one, we no dey touch your sales.",
    badgesLabel: "Look di badge dem well.",
    badges:
      "Out of di {total} thing wey dey here, {live} dey ready today, {soon} don build but never comot, and {partner} still need partner wey we never sign. We put dem so you go see di plan, no be say you fit buy dem now.",
    provider: "Who dey provide am",
    price: "Price",
    statusLive: "E dey ready",
    statusSoon: "E dey come",
    statusPartner: "We need partner",
    cta: "Register your business first",
  },
  howItWorks: {
    eyebrow: "How e dey work",
    title: "Three step from you. Four stage from us.",
    lede:
      "Your own part na like {minutes} minutes. Government own dey take as e go take, and we go tell you where e reach instead of showing you spinner wey dey turn.",
    yourSteps: "Your three step",
    ourStages: "Our four stage",
    ourStagesLede:
      "Once you don send your particulars, na dis dey happen. You fit check which stage your case reach any time, without calling anybody.",
    costTitle: "Wetin e go cost",
    costWarnLabel: "Di government fee never final.",
    costWarn:
      "Na CAC dey set am, no be us, and we go confirm am before you pay anything. We dey show am separate so you go always see which part na our own and which part na government own.",
    timeTitle: "How long e really dey take",
    timeBody:
      "Your part na like {minutes} minutes of question. Government part dey change and e no dey our hand — e fit be some days. We go message you when e move, and you fit check am yourself before then.",
    trustTitle: "Wetin you fit hold us for",
    demoLabel: "E still be demonstration.",
    demo:
      "Dis build no dey file anything and no dey collect money. Di stage dem na wetin di real service suppose do.",
    cta: "Register my business",
    ctaAlt: "You no get smart phone? Other way to register",
  },
  whyRegister: {
    eyebrow: "Why you go register",
    title: "Wetin registration dey buy you, and wetin e dey ask back.",
    lede: "Di full story. Even di part wey no favour us to talk.",
    figuresTitle: "How things be",
    buysTitle: "Wetin e dey buy you",
    walkTitle: "Wetin you go carry go",
    asksTitle: "Wetin e dey ask from you",
    asksLede:
      "Registration no dey come without something attached. Na these three matter, and we go talk am plain.",
    waitTitle: "When e never be your time",
    waitBody:
      "If you never start to sell, you no dey find loan, and nobody dey ask you for paper, registration fit wait. E worth money when e dey open something. We prefer make you register when e dey help you, no be because website tell you.",
    cta: "Register my business",
    ctaAlt: "Read di question dem first",
    obligations: [
      {
        title: "You go get tax number, and one day you go file return",
        body: "Say you get Tax Identification Number no mean say you owe tax. If your sales never reach di threshold, you go file return but you no go pay anything. If e pass am, you go pay. We prefer make you hear am from us, no be from inspector.",
      },
      {
        title: "You must keep di registration alive",
        body: "Annual return dey go CAC every year. If you miss am reach some time, di registration go die — and dat one bad pass say you no register at all, because you don pay money.",
      },
      {
        title: "Your business particulars go dey public",
        body: "Na di whole point — buyer and bank fit look you up. But e mean say your business name, and say na you own am, go dey public register.",
      },
    ],
  },
  otherWays: {
    eyebrow: "Other way to register",
    title: "Rejista no get app, and you no need am.",
    lede:
      "Nothing to download, nothing to dey update, nothing to chop space for your phone. Registration dey pass through one of three door, and na only one need smart phone.",
    whyNoAppTitle: "Why we no get app",
    whyNoApp:
      "App go make you find am, download am with data wey you buy, and dey update am — all before you even register anything. Na once most people dey register. E no suppose need software.",
    warnLabel: "Two out of dis three door never open.",
    warn:
      "Di field agent na only for di pilot market, and USSD na plan, we never build am. We list dem so you go see di whole plan, no be say you fit use dem today.",
    stuck: "You stuck, abi you want person? Call",
    doors: [
      {
        title: "Dis website",
        status: "E dey work now",
        body: "If you dey read dis, di door don already open. Like ten minutes of question for any phone wey get browser.",
        action: "Register here",
      },
      {
        title: "Field agent, for your market",
        status: "Na pilot only",
        body: "Person from Rejista go sidon with you, ask di same question, and fill di form. You no even need phone, and you go first look person for eye. For di pilot, na one Lagos market only.",
      },
      {
        title: "USSD, for any phone",
        status: "Na plan, we never build am",
        body: "Short code wey you go dial for di cheapest phone wey dey, no internet, no app. Dis one na after di pilot. Na dis door most people go use one day, and e never dey.",
      },
    ],
  },
  notFound: {
    eyebrow: "We no see di page",
    title: "Dis page no dey here.",
    lede:
      "Either we move am or di link no correct. Na not your fault, and nothing wey you dey do don lost.",
    home: "Go back to di start",
    register: "Register my business",
    questions: "Question dem",
    stuck: "You stuck? Call person for",
  },

  /* ---------------- translatable data ---------------- */
  gloss: {
    CAC: "Corporate Affairs Commission — di government office wey dey register business for Nigeria",
    TIN: "Tax Identification Number — your tax number",
    NIN: "National Identification Number — your ID number",
    NDPA: "Nigeria Data Protection Act — di law wey dey protect your data",
  },
  figures: [
    {
      value: "~40 million",
      label: "small business for Nigeria",
      source: "SMEDAN/NBS national MSME survey — we never confirm dis number",
    },
    {
      value: "~9 out of 10",
      label: "no register — bank, government and big buyer no fit see dem",
      source: "SMEDAN/NBS national MSME survey — we never confirm dis number",
    },
  ],
  steps: [
    {
      n: 1,
      verb: "Answer",
      body: "Small question for your own language — no paper form, no office to waka go, no agent to dey chase.",
    },
    {
      n: 2,
      verb: "Confirm",
      body: "Your ID go show say na you. We go check say your business name free, then we file am give government.",
    },
    {
      n: 3,
      verb: "Grow",
      body: "You go get your certificate and your tax number — e don reach make you open business account yourself, and more thing go come as we sign partner.",
    },
  ],
  outcomes: [
    {
      title: "CAC certificate",
      body: "Di business name na your own for law. Nobody else for Nigeria fit use am do business.",
      status: "live" as ServiceStatus,
    },
    {
      title: "Tax number (TIN)",
      body: "Di number wey bank, big buyer and government contract dey ask for.",
      status: "live" as ServiceStatus,
    },
    {
      title: "Business bank account",
      body: "We never sign any bank partner, so we no go promise you dis one. Your certificate and TIN don reach make you open am yourself.",
      status: "partner" as ServiceStatus,
    },
  ],
  benefits: [
    {
      title: "Borrow from bank, no be from moneylender",
      body: "Business wey register and get tax number, dem fit look your trading history judge you. Without paper, na only di daily-collection kind credit dey available.",
    },
    {
      title: "Bid for contract wey you no fit touch today",
      body: "Government tender and big company supply chain go ask for CAC number before dem go even read your quote.",
    },
    {
      title: "Nobody fit collect your business name",
      body: "Registration mean say di name na your own for di whole country. Today, anybody fit register di name wey you don dey use for fifteen years.",
    },
    {
      title: "Qualify for grant and support wey you no dey see",
      body: "Federal and state grant programme, and most donor scheme, na only business wey register fit enter.",
    },
  ],
  trust: [
    "Na official CAC filing",
    "Nigerian law dey protect your data",
    "No hidden charge",
    "Real people wey you fit call",
  ],
  trades: [
    "Fashion & tailoring",
    "Food & catering",
    "Repair & mechanic",
    "Trading & retail",
    "Beauty & hair",
    "Building & carpentry",
    "Transport & logistics",
    "Farm & agro-processing",
    "Electronics & phone",
    "Printing & design",
    "Another thing",
  ],
  filingStages: [
    { label: "We dey check your business name", detail: "We dey search CAC register for anybody wey don use am" },
    { label: "We dey confirm say na you", detail: "We dey match your particulars with your ID record" },
    {
      label: "We dey file am with CAC",
      detail: "We dey submit your registration to Corporate Affairs Commission",
    },
    { label: "We dey collect your tax number", detail: "We dey request your TIN" },
  ],
  serviceGroups: [
    {
      group: "Money wey dey enter",
      blurb: "Make you collect money — from customer, and from big company wey dey only pay supplier wey register.",
      items: [
        { name: "Collect card and transfer payment", provider: "Paystack / Flutterwave", price: "1.5% for each transaction", body: "Payment link and QR for your shop. Money go land for your business account.", status: "soon" as ServiceStatus },
        { name: "POS machine", provider: "We need partner", price: "From ₦25,000", body: "Card machine for your own business name, money dey enter next day.", status: "partner" as ServiceStatus },
        { name: "Supply give big company", provider: "Rejista marketplace", price: "E free to list", body: "Big buyer dey filter supplier by CAC number. Registration go put you inside dat filter.", status: "soon" as ServiceStatus },
      ],
    },
    {
      group: "Money to grow",
      blurb: "Credit wey dem price base on wetin you really dey sell, no be wetin you fit pledge.",
      items: [
        { name: "Working-capital loan", provider: "We need partner", price: "Na lender go set di rate", body: "Dem go judge am from your transaction history, no be collateral or guarantor.", status: "partner" as ServiceStatus },
        { name: "Equipment finance", provider: "We need partner", price: "Na lender go set di rate", body: "For di freezer, di generator, di sewing machine — you go dey pay small small every month.", status: "partner" as ServiceStatus },
        { name: "Market association savings", provider: "Cooperative partner", price: "E free", body: "Proper savings through your own market association, with record wey dey count.", status: "soon" as ServiceStatus },
      ],
    },
    {
      group: "Protection",
      blurb: "Wetin go happen if water enter di shop, abi supplier do you anyhow.",
      items: [
        { name: "Shop and goods insurance", provider: "We need partner", price: "From ₦2,000 every month", body: "Cover for fire, flood and thief for your shop and your goods.", status: "partner" as ServiceStatus },
        { name: "Health cover", provider: "We need partner", price: "From ₦1,500 every month", body: "For you and di people wey dey work with you.", status: "partner" as ServiceStatus },
        { name: "Lawyer help", provider: "We need partner", price: "Depend on di matter", body: "When supplier, landlord or customer no do dem own part.", status: "partner" as ServiceStatus },
      ],
    },
    {
      group: "Make you stay correct",
      blurb: "Di paper work wey dey keep your registration alive, we go handle am for you.",
      items: [
        { name: "CAC annual return", provider: "Rejista", price: "₦5,000 every year", body: "We go file am on time so your registration no go die. We go remind you before di time reach.", status: "soon" as ServiceStatus },
        { name: "Tax filing and reminder", provider: "Rejista", price: "₦5,000 every year", body: "Wetin government need from you, and when dem need am.", status: "soon" as ServiceStatus },
        { name: "Simple book keeping", provider: "Rejista", price: "Free tier", body: "Record wetin you sell and wetin you spend. E don reach wetin lender go want see.", status: "soon" as ServiceStatus },
      ],
    },
  ],
  faqs: [
    { q: "Dis thing legal? E be official?", a: "Yes. We dey file your business with Corporate Affairs Commission (CAC), di government office wey dey register business for Nigeria. Na di same certificate wey you for get if you waka go CAC office yourself. Rejista na filing agent, we no be government." },
    { q: "I no get smart phone.", a: "You no need am. Field agent fit register you face to face for your market, and we get plan for USSD so any phone go work. Di website na one out of three door, no be di only one." },
    { q: "Why I go pay tax?", a: "Registration go give you tax number, and if your sales pass di threshold e mean say you go dey file. Wetin you dey collect back be say you fit borrow from bank, bid for contract, and hold your name for law. We dey tell you dis one before, no be after you don pay." },
    { q: "How una dey make money?", a: "One flat fee for registration, and small share when you take service like payment, loan or insurance through us. We no dey collect any part of your sales, and we no dey add anything on top government own fee without showing am separate." },
    { q: "My data safe?", a: "Na to file your registration we dey use your particulars, nothing else. We no dey sell your data. We go only share am with bank or insurance if you separately gree. Full explanation dey our data page, wey we write under Nigeria Data Protection Act (NDPA)." },
    { q: "How dis one different from agent?", a: "Price, time and honesty. Agent dey collect something near di same all-in but you no dey know am before, and e fit take weeks. We dey tell you government fee separate, and you fit check your case yourself instead of calling person wey no dey pick." },
    { q: "Wetin happen if dem reject my business name?", a: "We dey check before you pay, and na for dis exact reason we dey ask for second choice. If dem reject di two, we go work with you for third one, we no go collect extra money." },
    { q: "How long e really dey take?", a: "Your own part na like 10 minutes. Government own dey change — e fit be some days. We go tell you di real stage wey your case reach and message you when e move, instead of showing you spinner." },
    { q: "I fit collect my money back?", a: "If we no fit register you at all, you go collect di service fee back. Government fee wey don already go CAC, we no fit refund am — na government money, no be our own." },
    { q: "I go pay tax immediately?", a: "No. Say you get Tax Identification Number (TIN) no mean say you owe tax. Small business wey never reach di threshold go file return but dem no go pay anything." },
  ],

  meta: {
    home: {
      title: "Rejista — Your business. Registered for small time.",
      description:
        "Register your Nigerian business with Corporate Affairs Commission before 10 minutes finish, for your own language. One flat price: ₦7,500.",
    },
    register: {
      title: "Register your business — Rejista",
      description:
        "Four step, like ten minutes. Your particulars, your business, check am, then we file.",
    },
    faq: {
      title: "Question dem — Rejista",
      description:
        "Wetin registration go cost, how long e go take, wetin go happen if dem reject your name, and wetin we dey do with your data.",
    },
    services: {
      title: "Other things — Rejista",
      description:
        "Wetin business wey don register fit reach through Rejista: payment, credit, protection, and di paper work wey dey keep registration alive.",
    },
    howItWorks: {
      title: "How e dey work — Rejista",
      description:
        "Di three step wey you go take, di four stage wey we dey work through, wetin e go cost, and how long government part really dey take.",
    },
    whyRegister: {
      title: "Why you go register — Rejista",
      description:
        "Wetin registration dey buy you, wetin e dey ask back, and di honest story for and against doing am now.",
    },
    otherWays: {
      title: "Other way to register — Rejista",
      description:
        "You no need smart phone. Field agent fit register you for your market, and USSD dey plan so any phone go work.",
    },
    about: {
      title: "About Rejista",
      description:
        "Who dey build Rejista, which stage e reach, wetin we dey try prove, and wetin we never sabi.",
    },
    partners: {
      title: "For bank & partner — Rejista",
      description:
        "Wetin Rejista need from bank, lender or insurance, wetin we dey bring, and where we really dey today.",
    },
    start: {
      title: "Rejista — scan make you register",
      description:
        "Scan make you register your business for like ten minutes. Below: di market, di model, di pilot, and wetin we never sabi.",
    },
  },
};
