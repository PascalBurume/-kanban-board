/**
 * A sheet per body system — the unit secondary curricula actually teach in.
 *
 * The Systèmes view used to only *group* specimen cards, which sorts but does
 * not teach: a learner met eight digestive organs and never met digestion. Each
 * sheet answers the questions a grid cannot — what the system is for, which
 * organs compose it, how it works as a whole, and how it depends on the others.
 *
 * It also closes a gap no 3D model can. We own no lymphatic specimen and are
 * unlikely to, but immunity is core secondary material; a sheet teaches it
 * without an asset. Systems marked `specimenless` appear in the view on their
 * own terms rather than being invisible because no `Organ` carries their name.
 */
export type SystemSheet = {
  /** Matches `Organ.system` exactly where specimens exist — the grouping key. */
  name: string;
  /** One line under the heading, in the eyebrow style. */
  tagline: string;
  /** What the system is for. */
  role: string;
  /** The organs that compose it, as prose — including any we do not model. */
  composition: string;
  /** How it works as a whole, which is what a grid of organs cannot show. */
  physiology: string;
  /** "À retenir" — four facts. */
  keyPoints: string[];
  /** How it depends on, or serves, the other systems. */
  connections: string;
  /** Book pages, printed numbering. */
  pages: [number, number];
  /** True when no specimen in the library carries this system name. */
  specimenless?: boolean;
};

/**
 * Teaching order, not alphabetical and not by size: it runs from the organising
 * principles outward, following the source text's own sequence. A learner who
 * has not met "tissue" cannot understand why the heart has three layers.
 */
export const SYSTEM_ORDER = [
  "Organisation du corps",
  "Système tégumentaire",
  "Système squelettique",
  "Système musculaire",
  "Système cardiovasculaire",
  "Système lymphatique et immunitaire",
  "Système respiratoire",
  "Système nerveux",
  "Système nerveux périphérique",
  "Organes des sens",
  "Système vestibulaire",
  "Système endocrinien",
  "Système reproducteur",
  "Système digestif",
  "Appareil urinaire",
] as const;

export const systemSheets: Record<string, SystemSheet> = {
  "Organisation du corps": {
    name: "Organisation du corps",
    tagline: "Le vocabulaire et les niveaux",
    specimenless: true,
    pages: [1, 9],
    role: "Avant d’étudier un organe, il faut savoir comment le corps est organisé et comment en parler sans ambiguïté. C’est le socle de toute l’anatomie : les mêmes termes de position et les mêmes niveaux d’organisation servent ensuite pour chaque système.",
    composition: "Le corps s’organise en niveaux emboîtés. Les cellules s’assemblent en tissus, les tissus en organes, les organes en systèmes, et les systèmes forment l’organisme. Les organes eux-mêmes sont logés dans des cavités : la cavité crânienne et la cavité vertébrale à l’arrière ; en avant, la cavité thoracique, séparée par le diaphragme de la cavité abdomino-pelvienne.",
    physiology: "Toute description part d’une posture de référence, la position anatomique : debout, regard vers l’avant, bras le long du corps, paumes tournées vers l’avant. Les termes qui en découlent ne changent jamais — antérieur et postérieur, supérieur et inférieur, médial et latéral — quelle que soit la position réelle du sujet. Le fil conducteur de toute la physiologie est l’homéostasie : le maintien d’un milieu intérieur constant, en température, en acidité, en eau et en sucre, malgré les variations extérieures.",
    keyPoints: [
      "Cinq niveaux : cellule, tissu, organe, système, organisme.",
      "La position anatomique est la référence de toute description.",
      "Deux grandes cavités, dorsale et ventrale ; le diaphragme sépare thorax et abdomen.",
      "L’homéostasie est le but commun de tous les systèmes.",
    ],
    connections: "Aucun système ne fonctionne seul. La respiration ne sert à rien sans circulation pour distribuer l’oxygène, et la digestion non plus. C’est pourquoi l’anatomie se découpe en systèmes pour être apprise, mais ne se comporte jamais ainsi dans un corps vivant.",
  },

  "Système tégumentaire": {
    name: "Système tégumentaire",
    tagline: "La frontière avec le monde",
    pages: [37, 47],
    role: "La peau sépare le corps de son environnement. Elle protège, perçoit, règle la température, excrète, stocke et fabrique la vitamine D — sept fonctions pour ce que l’on prend souvent pour une simple enveloppe.",
    composition: "Deux couches principales : l’épiderme, externe et mince, fait de cinq strates de cellules ; le derme, interne et bien plus épais, qui contient les vaisseaux, les nerfs, les glandes et les follicules pileux. Sous elles, l’hypoderme rattache la peau aux muscles et aux os. Les poils, les ongles et les glandes en font également partie.",
    physiology: "L’épiderme se renouvelle en continu : les cellules naissent dans la couche basale, remontent en se remplissant de kératine, meurent et se détachent. La couche cornée qui en résulte est imperméable et infranchissable pour la plupart des micro-organismes. Le derme fournit la résistance, par le collagène, et l’élasticité, par l’élastine. La régulation thermique passe par la sueur et par le calibre des vaisseaux du derme, qui se dilatent pour perdre de la chaleur et se resserrent pour la garder.",
    keyPoints: [
      "Le plus grand organe du corps : environ 16 % du poids total.",
      "Épiderme, derme, hypoderme — trois couches, trois rôles distincts.",
      "La mélanine protège des ultraviolets ; le soleil déclenche aussi la vitamine D.",
      "La peau est un organe sensoriel autant qu’une barrière.",
    ],
    connections: "Elle sert le système immunitaire en formant la première barrière contre les infections, le système circulatoire en réglant la perte de chaleur, et le squelette en fabriquant la vitamine D nécessaire à la fixation du calcium.",
  },

  "Système squelettique": {
    name: "Système squelettique",
    tagline: "Charpente vivante",
    pages: [96, 106],
    role: "Le squelette protège les organes, soutient le corps, lui donne sa forme, sert de point d’attache aux muscles, permet le mouvement, fabrique les cellules sanguines et met en réserve des minéraux.",
    composition: "Environ 206 os chez l’adulte, classés par forme : longs, courts, plats et irréguliers. Le crâne en réunit vingt-deux, la colonne trente-trois vertèbres dont vingt-quatre restent mobiles, la cage thoracique douze paires de côtes. S’y ajoutent les articulations, les cartilages et les ligaments qui les relient.",
    physiology: "L’os associe des fibres de collagène, qui résistent à la traction, et des sels minéraux de calcium et de phosphate, qui donnent la dureté : il faut les deux, car l’un sans l’autre donnerait un os soit cassant, soit mou. L’os compact forme une coque solide, l’os spongieux un réseau plus léger abritant la moelle rouge. C’est un tissu vivant, détruit et reconstruit en permanence — ce qui explique qu’il guérisse après une fracture et qu’il puisse aussi s’amincir avec l’âge.",
    keyPoints: [
      "Sept fonctions, dont deux qu’on oublie : fabriquer le sang et stocker le calcium.",
      "Deux types de tissu : compact à l’extérieur, spongieux à l’intérieur.",
      "Un os est un tissu vivant, pas une pièce inerte.",
      "Les os sont des leviers : sans muscles, ils ne produisent aucun mouvement.",
    ],
    connections: "Il travaille avec le système musculaire — os et muscles ne produisent le mouvement qu’ensemble — et avec le système hématologique, puisque les cellules du sang naissent dans sa moelle rouge.",
  },

  "Système musculaire": {
    name: "Système musculaire",
    tagline: "Tirer, jamais pousser",
    pages: [128, 140],
    role: "Les muscles produisent le mouvement, maintiennent la posture, stabilisent les articulations et dégagent de la chaleur. Ils ne servent pas seulement à se déplacer : le cœur et la paroi des organes creux sont eux aussi musculaires.",
    composition: "Trois types de tissu musculaire. Le muscle squelettique, volontaire et strié, attaché aux os par des tendons. Le muscle lisse, involontaire, dans la paroi des vaisseaux et des organes creux. Le muscle cardiaque, strié mais involontaire, qui n’existe que dans le cœur.",
    physiology: "Le principe fondamental tient en une phrase : un muscle ne peut que tirer, jamais pousser. Tout mouvement réversible exige donc une paire antagoniste — le quadriceps tend le genou, les ischio-jambiers le plient, et quand l’un se contracte l’autre se relâche. Les tendons transmettent la force à distance, ce qui permet à une main fine d’être commandée par des muscles logés dans l’avant-bras. La contraction dégage aussi de la chaleur : le frisson n’est rien d’autre qu’une contraction destinée à réchauffer.",
    keyPoints: [
      "Trois types : squelettique, lisse, cardiaque.",
      "Un muscle ne fait que tirer — d’où les paires antagonistes.",
      "Les tendons permettent de commander un segment à distance.",
      "La contraction produit de la chaleur autant que du mouvement.",
    ],
    connections: "Il dépend du squelette pour ses points d’appui, du système nerveux pour ses ordres, et du système circulatoire pour l’oxygène — un muscle privé de sang cesse de fonctionner en quelques secondes.",
  },

  "Système cardiovasculaire": {
    name: "Système cardiovasculaire",
    tagline: "Un circuit fermé, sous pression",
    pages: [173, 185],
    role: "Le système cardiovasculaire transporte : l’oxygène et les nutriments vers les cellules, le dioxyde de carbone et les déchets vers les organes qui les éliminent. Il distribue aussi la chaleur et les hormones.",
    composition: "Le cœur, pompe musculaire à quatre chambres, et trois types de vaisseaux : les artères, à paroi épaisse et élastique, qui s’éloignent du cœur ; les veines, plus minces et munies de valvules, qui y reviennent ; et entre les deux les capillaires, larges d’une seule cellule. Le sang lui-même en fait partie.",
    physiology: "Le sang circule en double circuit. Le circuit pulmonaire, court, envoie le sang pauvre en oxygène du ventricule droit aux poumons et le ramène chargé d’oxygène. Le circuit général, long, envoie ce sang du ventricule gauche vers tout le corps. Les deux ne se rejoignent qu’au cœur — c’est exactement pourquoi celui-ci a besoin de quatre chambres et non de deux. Les échanges n’ont lieu que dans les capillaires ; partout ailleurs, le sang ne fait que voyager.",
    keyPoints: [
      "Deux circuits, joints uniquement au cœur.",
      "Artère et veine désignent un sens de trajet, pas un contenu.",
      "Les échanges se font seulement dans les capillaires.",
      "La paroi élastique des artères transforme des à-coups en flux continu.",
    ],
    connections: "C’est le système de liaison de tous les autres : il prend l’oxygène au système respiratoire, les nutriments au digestif, les hormones à l’endocrinien, et livre le tout aux déchets près, qu’il porte au rein.",
  },

  "Système lymphatique et immunitaire": {
    name: "Système lymphatique et immunitaire",
    tagline: "Le drainage et la défense",
    pages: [211, 229],
    role: "Le système lymphatique est un système de drainage à sens unique. Il récupère le liquide en excès dans les tissus et le renvoie vers le sang, absorbe les graisses digérées, et assure une part essentielle de la défense contre les infections.",
    composition: "Un réseau de vaisseaux lymphatiques, des ganglions répartis le long de ces vaisseaux — notamment au cou, aux aisselles et à l’aine — et des organes lymphoïdes : la rate, le thymus et les amygdales. Le liquide qui y circule est la lymphe.",
    physiology: "La lymphe est un liquide clair issu du liquide qui baigne les tissus. Elle ressemble au plasma sanguin, mais contient moins de protéines : les plus grosses molécules ne peuvent pas repasser à travers la paroi des capillaires sanguins, et c’est le réseau lymphatique qui les récupère. En chemin, la lymphe traverse des ganglions qui la filtrent et détruisent les micro-organismes ; les lymphocytes s’y multiplient et produisent des anticorps. Les graisses digérées prennent également cette voie : elles passent dans les chylifères des villosités intestinales, tandis que sucres et protéines rejoignent directement le sang.",
    keyPoints: [
      "Sens unique : la lymphe va des tissus vers le sang, jamais l’inverse.",
      "Les ganglions filtrent et fabriquent des anticorps.",
      "Les graisses digérées passent par la lymphe, pas par le sang.",
      "L’immunité agit directement, par des cellules, et indirectement, par des anticorps.",
    ],
    connections: "Il prolonge le système cardiovasculaire, dont il récupère les fuites, et complète le système digestif en absorbant les graisses. Sans lui, les tissus gonfleraient et les infections ne rencontreraient presque aucune résistance.",
  },

  "Système respiratoire": {
    name: "Système respiratoire",
    tagline: "Un arbre, et des feuilles",
    pages: [230, 235],
    role: "Le système respiratoire fait entrer l’oxygène dans le sang et en évacue le dioxyde de carbone. Il réchauffe, humidifie et filtre l’air au passage, et fournit le souffle qui produit la voix.",
    composition: "Le nez et le pharynx, le larynx, la trachée, les bronches et les deux poumons. La trachée est maintenue ouverte par une vingtaine d’anneaux de cartilage en C. Le diaphragme, muscle en coupole, ferme le thorax par le bas.",
    physiology: "Le manuel propose une image efficace : l’arbre. La trachée est le tronc, les bronches les branches maîtresses, les bronchioles les rameaux, et les alvéoles les feuilles. L’échange gazeux n’a lieu que dans ces alvéoles, entourées de capillaires ; tout le reste ne fait que conduire l’air. Les poumons ne contiennent aucun muscle : quand le diaphragme s’abaisse, le volume du thorax augmente, la pression y baisse, et l’air extérieur entre de lui-même. On ne tire pas l’air — on fait de la place.",
    keyPoints: [
      "L’échange gazeux se produit uniquement dans les alvéoles.",
      "Les poumons sont passifs ; le diaphragme est le moteur.",
      "Les cils et le mucus nettoient l’air en continu.",
      "L’épiglotte protège la voie aérienne à chaque déglutition.",
    ],
    connections: "Il est inséparable du système cardiovasculaire : l’oxygène capté ne sert à rien sans le sang qui le distribue, et c’est le même sang qui rapporte le dioxyde de carbone à évacuer.",
  },

  "Système nerveux": {
    name: "Système nerveux",
    tagline: "Recevoir, décider, commander",
    pages: [246, 275],
    role: "Le système nerveux reçoit les informations, les interprète et commande la réponse. Il coordonne tous les autres systèmes et rend possibles la conscience, la mémoire et le mouvement volontaire.",
    composition: "Le système nerveux central réunit l’encéphale et la moelle épinière. L’encéphale comprend le cerveau, divisé en lobes, le cervelet, le thalamus, l’hypothalamus et le tronc cérébral. Tout ce qui se trouve hors du système central forme le système périphérique.",
    physiology: "Le cortex comporte des aires sensorielles, motrices et d’association. Le thalamus relaie presque toutes les informations sensorielles. L’hypothalamus règle la faim, la soif, la température, le sommeil et les hormones. Le cervelet ne décide pas des mouvements : il les rend précis, en comparant sans cesse le geste voulu au geste exécuté. Le bulbe rachidien, dans le tronc, contient les centres du cœur et de la respiration — ce qui explique qu’une lésion y soit immédiatement mortelle alors que de larges régions du cortex peuvent être atteintes sans arrêter les fonctions vitales.",
    keyPoints: [
      "Central = encéphale + moelle épinière ; tout le reste est périphérique.",
      "Le cervelet corrige le mouvement, il ne le décide pas.",
      "Le bulbe rachidien commande le cœur et la respiration.",
      "Un réflexe ne remonte pas au cerveau — d’où sa vitesse.",
    ],
    connections: "Il commande le système musculaire, règle le rythme cardiaque et respiratoire, et pilote le système endocrinien par l’hypothalamus. Les deux grands systèmes de commande du corps — nerveux et hormonal — se rejoignent à cet endroit précis.",
  },

  "Système nerveux périphérique": {
    name: "Système nerveux périphérique",
    tagline: "Le câblage vers le corps",
    pages: [253, 257],
    role: "Le système nerveux périphérique relie le centre au reste du corps. Il porte les informations sensitives vers la moelle et l’encéphale, et les ordres moteurs vers les muscles et les glandes.",
    composition: "Trente et une paires de nerfs spinaux — huit cervicales, douze thoraciques, cinq lombaires, cinq sacrées et une coccygienne — auxquelles s’ajoutent douze paires de nerfs crâniens issus directement de l’encéphale. Il se subdivise en système somatique, volontaire, et système autonome, involontaire.",
    physiology: "Chaque nerf spinal se divise en branches qui se réunissent en réseaux appelés plexus avant de repartir vers un membre : un même muscle reçoit donc souvent des fibres venues de plusieurs racines. Le système autonome, lui, fonctionne sans commande consciente et règle le cœur, la digestion et le calibre des vaisseaux. Le réflexe est le raccourci du système : le signal entre dans la moelle et en ressort aussitôt, sans attendre le cerveau.",
    keyPoints: [
      "31 paires de nerfs spinaux, 12 paires de nerfs crâniens.",
      "Somatique = volontaire ; autonome = involontaire.",
      "Un plexus mêle les fibres de plusieurs racines avant de desservir un membre.",
      "Le réflexe court-circuite le cerveau.",
    ],
    connections: "Il est le prolongement du système nerveux central, et son bras autonome règle en permanence le cœur, les vaisseaux et le tube digestif sans que nous en ayons conscience.",
  },

  "Organes des sens": {
    name: "Organes des sens",
    tagline: "Convertir le monde en signaux",
    pages: [258, 274],
    role: "Les organes des sens transforment des formes d’énergie très différentes — lumière, vibration de l’air, molécules dissoutes — en un seul langage : l’impulsion nerveuse. C’est le seul langage que le cerveau sache lire.",
    composition: "L’œil pour la vue, l’oreille pour l’audition, la langue pour le goût, le nez pour l’odorat, et la peau pour le toucher, la pression, la température et la douleur.",
    physiology: "Chaque organe est un convertisseur spécialisé. L’œil concentre la lumière sur la rétine, dont les cellules photosensibles produisent des impulsions. L’oreille transforme une vibration de l’air en mouvement d’un liquide, puis en signal. Le goût et l’odorat détectent des molécules — dissoutes dans la salive pour l’un, en suspension dans l’air pour l’autre. Le point commun est décisif : la sensation elle-même n’existe pas dans l’organe. Le son n’est pas dans l’oreille, la couleur n’est pas dans l’œil ; ce sont des constructions du cerveau à partir des signaux qu’il reçoit.",
    keyPoints: [
      "Tous les sens convertissent vers un seul langage : l’impulsion nerveuse.",
      "La sensation se construit dans le cerveau, pas dans l’organe.",
      "Le goût dépend en grande partie de l’odorat.",
      "Chaque œil a une tache aveugle que le cerveau comble sans prévenir.",
    ],
    connections: "Ils alimentent le système nerveux, qui interprète leurs signaux ; sans le cortex correspondant, un œil parfaitement sain ne fait rien voir.",
  },

  "Système vestibulaire": {
    name: "Système vestibulaire",
    tagline: "Savoir où est le bas",
    pages: [266, 274],
    role: "Le système vestibulaire assure l’équilibre. Il indique en permanence la position de la tête et ses mouvements, y compris les yeux fermés.",
    composition: "Il occupe l’oreille interne, dans l’os temporal : trois canaux semi-circulaires disposés à angle droit, et un vestibule central. La cochlée, voisine, appartient à l’audition et non à l’équilibre.",
    physiology: "Deux mécanismes complémentaires. Les canaux détectent les rotations : quand la tête tourne, le liquide qu’ils contiennent reste un instant en arrière par inertie et plie de fins cils sensoriels. Le vestibule détecte l’inclinaison et les accélérations en ligne droite grâce à de minuscules cristaux qui glissent sous l’effet de la gravité. Les trois canaux étant à angle droit, toute rotation, quelle qu’elle soit, se décompose entre eux.",
    keyPoints: [
      "Trois canaux à angle droit couvrent les trois dimensions.",
      "Les canaux détectent la rotation ; le vestibule, l’inclinaison.",
      "Le vertige vient du liquide qui tourne encore après l’arrêt.",
      "Le mal des transports naît d’un conflit entre la vue et l’oreille interne.",
    ],
    connections: "Il travaille avec la vue et avec les récepteurs des muscles et des articulations. L’équilibre est toujours le produit de ces trois sources ; quand elles se contredisent, le corps réagit par le vertige ou la nausée.",
  },

  "Système endocrinien": {
    name: "Système endocrinien",
    tagline: "Des ordres par le sang",
    pages: [278, 297],
    role: "Le système endocrinien règle le corps par des messages chimiques. Il commande la croissance, le métabolisme, la reproduction et la réponse au stress.",
    composition: "Des glandes qui déversent leurs hormones directement dans le sang : l’hypophyse, la thyroïde, les parathyroïdes, les surrénales, le pancréas endocrine, les ovaires et les testicules.",
    physiology: "C’est le second système de commande, et il fonctionne à l’opposé du premier. Le système nerveux envoie un signal électrique par un câble dédié, à une cible précise, en quelques millisecondes ; le système endocrinien libère une hormone dans le sang, qui atteint tout le corps mais n’agit que sur les cellules capables de la reconnaître. C’est plus lent, mais durable. La plupart des glandes obéissent à une boucle de rétroaction : quand le taux d’hormone baisse, l’hypophyse stimule la glande ; quand il monte, elle relâche la commande — le principe d’un thermostat.",
    keyPoints: [
      "Une hormone atteint tout le corps mais n’agit que sur ses cellules cibles.",
      "Nerveux = rapide et ciblé ; endocrinien = lent et durable.",
      "La rétroaction maintient chaque taux dans une fourchette étroite.",
      "L’hypophyse commande plusieurs autres glandes.",
    ],
    connections: "Il est piloté par l’hypothalamus, donc par le système nerveux, et il utilise le système circulatoire comme réseau de distribution. Le pancréas appartient à la fois à ce système et au digestif.",
  },

  "Système reproducteur": {
    name: "Système reproducteur",
    tagline: "Le seul système facultatif",
    pages: [299, 317],
    role: "Le système reproducteur produit les cellules sexuelles et les hormones sexuelles, et permet la conception, la grossesse et la naissance. C’est le seul système dont le corps n’a pas besoin pour rester en vie.",
    composition: "Chez la femme : les ovaires, les trompes de Fallope, l’utérus, le vagin et la vulve. Chez l’homme : les testicules, l’épididyme, le canal déférent, les vésicules séminales, la prostate et le pénis.",
    physiology: "Chaque gonade a deux fonctions : produire des cellules reproductrices et sécréter des hormones. À partir de la puberté, déclenchée par l’hypophyse, l’appareil féminin suit un cycle mensuel : un follicule mûrit, un ovule est libéré dans la trompe, et l’endomètre s’épaissit pour l’accueillir. Sans fécondation, cette muqueuse se détache. La fécondation a lieu dans le tiers externe de la trompe, non dans l’utérus. À la ménopause, la chute des œstrogènes et de la progestérone met fin aux cycles.",
    keyPoints: [
      "Chaque gonade fait deux choses : des cellules et des hormones.",
      "La fécondation se produit dans la trompe.",
      "La puberté est déclenchée par l’hypophyse, pas par les gonades.",
      "Les testicules sont hors du corps parce qu’il leur faut deux à trois degrés de moins.",
    ],
    connections: "Il est entièrement commandé par le système endocrinien, et l’appareil urinaire masculin partage avec lui son conduit terminal — ce qui explique qu’un même spécimen montre les deux.",
  },

  "Système digestif": {
    name: "Système digestif",
    tagline: "Un tube de sept mètres",
    pages: [318, 339],
    role: "Le système digestif transforme les aliments en molécules assez petites pour passer dans le sang, absorbe ces molécules, et évacue ce qui reste.",
    composition: "Un tube continu de la bouche à l’anus : bouche, pharynx, œsophage, estomac, intestin grêle, gros intestin, rectum. S’y ajoutent des organes annexes que les aliments ne traversent jamais — les glandes salivaires, le foie, la vésicule biliaire et le pancréas.",
    physiology: "La digestion est à la fois mécanique et chimique, et elle commence dès la bouche : les dents broient, la salive lubrifie et son amylase attaque déjà l’amidon. L’estomac brasse et entame les protéines dans un milieu très acide. L’essentiel se joue ensuite dans l’intestin grêle, où la bile émulsionne les graisses et le suc pancréatique fournit les enzymes, et où plus de 400 millions de villosités portent la surface d’absorption à environ 250 mètres carrés. Le côlon ne digère plus : il récupère l’eau et les sels. D’un bout à l’autre, le contenu avance par péristaltisme, une action automatique.",
    keyPoints: [
      "Un tube continu, plus quatre organes annexes que rien ne traverse.",
      "La digestion commence dans la bouche, pas dans l’estomac.",
      "L’absorption se fait presque entièrement dans l’intestin grêle.",
      "Tout le sang de l’intestin passe par le foie avant le reste du corps.",
    ],
    connections: "Il fournit au système circulatoire les nutriments qu’il distribue, dépend du foie pour filtrer ce qu’il absorbe, et confie les graisses au système lymphatique plutôt qu’au sang.",
  },

  "Appareil urinaire": {
    name: "Appareil urinaire",
    tagline: "Garder plutôt qu’éliminer",
    pages: [341, 351],
    role: "L’appareil urinaire règle la composition, le volume et la pression du sang. Éliminer les déchets n’est qu’une partie de son travail : l’essentiel consiste à décider ce qu’il faut garder.",
    composition: "Deux reins, appliqués contre la paroi arrière de l’abdomen ; deux uretères qui descendent vers la vessie ; la vessie, réservoir musculaire ; et l’urètre, par lequel l’urine sort.",
    physiology: "Trois étapes. La filtration est brutale et non sélective : dans les glomérules du cortex, la pression pousse hors du sang l’eau et toutes les petites molécules, utiles ou non. La réabsorption fait le tri en sens inverse, le long des tubules : environ 99 % de ce qui a été filtré est récupéré. La sécrétion ajoute enfin quelques substances à éliminer. Ce qui reste est l’urine. Chaque rein compte plus d’un million de néphrons, et l’ensemble reçoit près d’un quart du débit du cœur à chaque minute.",
    keyPoints: [
      "Filtration, réabsorption sélective, sécrétion.",
      "99 % du filtrat est récupéré : l’urine est le reliquat.",
      "Le cortex filtre, la médulla concentre.",
      "Le rein règle aussi la pression du sang, pas seulement les déchets.",
    ],
    connections: "Il travaille sur le sang que lui apporte le système circulatoire, et c’est le principal organe de l’homéostasie : c’est lui qui maintient constants le volume d’eau et l’équilibre en sels de tout l’organisme.",
  },
};
