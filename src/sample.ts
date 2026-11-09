import type { TolkDocument } from "./document.js";

// An original text written for Tolk: the village and the people are invented.
// It deliberately includes the things real sources contain: a non-breaking
// space, a soft hyphen, numbers, quotes, emphasis, a link, a line break, and a
// paragraph with line feeds left over from a line-wrapped source. It's over 2000
// words so it can carry the read-along alignment check.
export const SAMPLE_DOCUMENT: TolkDocument = {
  id: "sample",
  source: { kind: "sample" },
  title: "De laatste veerman van Oosterwaal",
  author: "Voorbeeldtekst voor Tolk",
  // Detected like any other source, so it isn't assumed to be Dutch here.
  language: null,
  chapters: [
    {
      id: "sample-1",
      title: "De laatste veerman van Oosterwaal",
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          html: "Elke ochtend om kwart voor zes loopt Harm de dijk op, met een thermosfles onder zijn arm en de sleutels van de pont in zijn jaszak. Het is nog donker, en boven de rivier hangt een dunne laag mist. Aan de overkant brandt één lamp. Die lamp staat bij het huis van zijn zus, die hem elke morgen laat weten dat ze wakker is.",
        },
        {
          id: "b2",
          type: "paragraph",
          html: "Harm is drieënzestig. Hij vaart al ruim veertig jaar over dezelfde tweehonderd meter water, heen en terug, zo'n vijftig keer per dag. Reken maar uit, zegt hij, en dan lacht hij, want hij heeft het zelf ooit uitgerekend: bij elkaar is dat bijna twee keer de wereld rond. <em>En ik ben nog nooit verder gekomen dan de overkant.</em>",
        },
        {
          id: "b3",
          type: "heading",
          html: "Een dorp aan twee oevers",
        },
        {
          id: "b4",
          type: "paragraph",
          html: "Oosterwaal ligt aan twee kanten van de rivier, en dat is altijd lastig geweest. De kerk en de bakker staan aan de noordkant, de school en de voetbalvelden aan de zuidkant. Wie van de ene naar de andere kant wil zonder de pont, moet via de brug bij de stad rijden, en dat is een omweg van 23&nbsp;kilometer. Voor kinderen op de fiets is dat geen optie.",
        },
        {
          id: "b5",
          type: "paragraph",
          html: "Daarom kent Harm iedereen. Hij weet wie er op dinsdag naar de fysiotherapeut gaat en welke leerlingen altijd te laat zijn. Sommige kinderen die vroeger met hun schooltas op zijn pont stonden, staan er nu met hun eigen kinderen. Hij wacht nog even als hij iemand hard ziet fietsen op de dijk, ook al mag dat eigenlijk niet volgens de dienst­regeling.",
        },
        {
          id: "b6",
          type: "quote",
          html: "“Een brug is sneller, dat weet ik ook wel,” zegt Harm. “Maar op een brug praat niemand met elkaar. Hier sta je vijf minuten naast je buurman, of je wilt of niet. In die vijf minuten is in dit dorp meer opgelost dan in de gemeenteraad.”",
        },
        {
          id: "b7",
          type: "heading",
          html: "Wat er na hem komt",
        },
        {
          id: "b8",
          type: "paragraph",
          html: "Over twee jaar gaat Harm met pensioen, en niemand weet nog wat er dan gebeurt. De gemeente onderzoekt of de pont door vrijwilligers gevaren kan worden, zoals bij andere <a href=\"https://nl.wikipedia.org/wiki/Veerpont\">veerponten</a> in het land. Daarvoor is wel een vaarbewijs nodig, en je moet bereid zijn om ook in de winter om zes uur op te staan. Tot nu toe hebben zich elf mensen gemeld. De meesten van hen zijn zelf al met pensioen.",
        },
        {
          id: "b9",
          type: "paragraph",
          html: "Er is ook een ander plan: een pont die zonder schipper vaart, op afstand bestuurd vanuit een kantoor in de stad. Op een informatie-avond in het dorpshuis werd daar in maart lang over gepraat. Een ingenieur liet zien hoe veilig zo'n boot is, met camera's en sensoren aan alle kanten. Toen hij klaar was, stak een oude vrouw haar hand op. Ze vroeg wie er dan zou wachten als zij te laat was. De ingenieur moest het antwoord schuldig blijven.",
        },
        {
          id: "b10",
          type: "paragraph",
          html: "Harm zelf bemoeit zich er niet mee, zegt hij. Dat is niet helemaal waar. Op zaterdag neemt hij tegenwoordig soms een van de vrijwilligers mee, om te laten zien hoe de stroming achter de bocht de pont opzij duwt als het water hoog staat. Dat leer je niet uit een boek, vindt hij. Dat moet je voelen, in je handen en in je voeten, en daar heb je een paar jaar voor nodig. Of een paar goede zaterdagen, als je tenminste <strong>luistert</strong>.",
        },
        {
          id: "b14",
          type: "heading",
          html: "Honderd jaar heen en weer",
        },
        {
          id: "b15",
          type: "paragraph",
          html: "De pont van Oosterwaal is ouder dan iedereen die er nu op vaart. In het dorpshuis hangt een foto uit 1924, waarop een platte houten schuit te zien is met twee paarden en een man met een lange stok. De veerman duwde zijn boot toen nog met de hand naar de overkant. Wie haast had, betaalde een paar cent extra en hielp mee. Pas na de oorlog kwam er een motor, en die maakte zoveel lawaai dat de koeien aan de zuidkant er in het begin van wegliepen.",
        },
        {
          id: "b16",
          type: "paragraph",
          html: "Harm begon op zijn drieëntwintigste, als hulp van de vorige veerman, een zwijgzame man die Dirk heette. Dirk legde weinig uit. De eerste drie maanden mocht Harm alleen de touwen vastmaken en het kaartjesgeld tellen. Toen hij eindelijk zelf aan het stuur mocht staan, botste hij meteen tegen de steiger. Dirk keek naar de schade, stak een sigaret op en zei: <em>nog een keer</em>. Dat was de hele les, en volgens Harm ook de beste die hij ooit heeft gehad.",
        },
        {
          id: "b17",
          type: "paragraph",
          html: "In die tijd kostte een overtocht 25&nbsp;cent voor een fietser en één gulden voor een auto. Nu betaal je 1,20&nbsp;euro met de fiets en 3,50&nbsp;euro met de auto, en de meeste mensen hebben een abonnement. De gemeente legt elk jaar ongeveer 180.000&nbsp;euro bij. Dat vinden sommige raadsleden veel geld voor zo'n klein stukje water. Anderen rekenen voor dat een nieuwe brug minstens 40&nbsp;miljoen zou kosten, en dan heb je nog geen meter fietspad aangelegd.",
        },
        {
          id: "b18",
          type: "heading",
          html: "De winter van het ijs",
        },
        {
          id: "b19",
          type: "paragraph",
          html: "Over de strenge winter van zijn tweede jaar praat Harm nog steeds graag. Het vroor wekenlang, en op een morgen lag er zoveel ijs op de rivier dat de pont niet meer kon varen. Drie dagen later was het ijs zo dik dat de kinderen te voet naar school gingen, midden over de rivier, met de schaatsen om hun nek. De bakker zette een kraam op het ijs, precies op de plek waar normaal de vaargeul ligt. Voor het eerst in zijn leven had Harm niets te doen, en hij wist niet goed wat hij met zichzelf aan moest.",
        },
        {
          id: "b20",
          type: "paragraph",
          html: "Toen kwam de dooi, en die kwam snel. Op een nacht hoorde het hele dorp het ijs kraken, een geluid dat volgens Harm het meest lijkt op een kanon in de verte. De volgende ochtend dreven er schotsen zo groot als een garage voorbij. Twee dagen lang durfde niemand het water op. Toen moest er 's nachts een vroedvrouw naar de zuidkant, omdat een baby niet langer wilde wachten. Dirk en Harm brachten haar over, langzaam, met een lange haak om de schotsen weg te duwen. Het duurde drie kwartier. Dat kind heet Marieke, is nu een vrouw van bijna veertig, en betaalt volgens Harm nog altijd te weinig voor haar abonnement.",
        },
        {
          id: "b21",
          type: "quote",
          html: "“Mensen denken dat het hier saai is,” zegt hij. “Altijd hetzelfde stukje water, hè? Maar het is nooit hetzelfde water. Het is elke dag anders, en je weet pas hoe het vandaag is als je erop ligt.”",
        },
        {
          id: "b22",
          type: "heading",
          html: "Hoog water",
        },
        {
          id: "b23",
          type: "paragraph",
          html: "Het gevaarlijkste moment kwam jaren later, in een natte januarimaand. Het had in Duitsland en Frankrijk wekenlang geregend, en het water steeg elke dag een stukje verder tegen de dijk op. De uiterwaarden stonden al onder, en van de steiger aan de noordkant was alleen de bovenste rand nog te zien. Op een dinsdagmiddag kwam het bericht dat iedereen het dorp moest verlaten, voor het geval de dijk het niet zou houden. Honderden mensen moesten weg, en een groot deel van hen woonde aan de verkeerde kant.",
        },
        {
          id: "b24",
          type: "paragraph",
          html: "Harm voer die dag en die nacht zonder te stoppen. Hij nam auto's mee, ouderen, kippen in kratten, en een boer die weigerde te vertrekken zonder zijn oude tractor. Omdat de stroming veel sterker was dan normaal, moest hij de pont schuin tegen het water in houden, en iedere overtocht duurde twee keer zo lang. Rond vier uur 's nachts was het dorp leeg. Harm legde de pont vast, ging op een bankje in de stuurhut zitten en sliep elf uur achter elkaar. De dijk heeft het gehouden, maar het scheelde volgens de waterbouwers niet veel.",
        },
        {
          id: "b25",
          type: "paragraph",
          html: "Dit stukje komt uit het oude\ndagboek van Dirk, dat nog steeds\nop de pont ligt, in een la\nonder het stuur. Hij schreef er elke\navond één regel in, meer niet. De\nmeeste regels gaan over het weer en\nover de hoogte van het water. Soms\nstaat er ook iets over een passagier,\nmaar nooit een naam.",
        },
        {
          id: "b26",
          type: "quote",
          html: "Mist tot tien uur.<br>Water zakt.<br>De dominee was weer te laat.",
        },
        {
          id: "b27",
          type: "heading",
          html: "Zomergasten",
        },
        {
          id: "b28",
          type: "paragraph",
          html: "In juli en augustus is de pont een ander soort plek. Dan komen de toeristen, op dure elektrische fietsen en met routes op hun telefoon. Ze vragen hoe lang de overtocht duurt, terwijl ze de overkant gewoon kunnen zien. Ze maken foto's van Harm, en een Duits echtpaar stuurt hem al elf jaar een kaart met kerst. Een keer vroeg een Amerikaan of hij het ding ook kon kopen. Harm heeft hem het telefoonnummer van de gemeente gegeven, en daar moet hij nog steeds om lachen.",
        },
        {
          id: "b29",
          type: "paragraph",
          html: "Het drukst wordt het op de eerste zaterdag van augustus, wanneer aan de zuidkant de jaarlijkse braderie wordt gehouden. Dan staan er soms 60 fietsers tegelijk te wachten, en passen ze er niet allemaal op. Harm heeft een vaste regel: wie het langst staat te wachten, gaat voor, en kinderen mogen altijd bij hem in de stuurhut. Daar is de toeter, waar ze één keer op mogen drukken. Er zijn volwassen mannen in Oosterwaal die nog precies weten hoe oud ze waren toen ze dat voor het eerst mochten doen.",
        },
        {
          id: "b35",
          type: "paragraph",
          html: "Als de braderie voorbij is, wordt het snel weer stil op het water. De fietsers rijden terug naar hun hotels, de kramen gaan de vrachtwagen in, en aan de zuidkant ruikt het nog een uur naar gebakken vis. Harm veegt dan het dek schoon en telt het geld in de oude blikken doos. Hij doet dat nog altijd met de hand, hoewel bijna iedereen tegenwoordig met de telefoon betaalt.",
        },
        {
          id: "b30",
          type: "heading",
          html: "De vrijwilligers",
        },
        {
          id: "b31",
          type: "paragraph",
          html: "Van de elf vrijwilligers is Ineke de jongste. Ze is achtenvijftig, werkte dertig jaar als verpleegkundige, en had tot vorig jaar nooit iets groters bestuurd dan een zeilboot op een meer. Ze oefent twee keer per week en is onlangs geslaagd voor haar theorie-examen, met een score van 92&nbsp;procent. Het praktijkgedeelte vindt ze een stuk lastiger. De pont weegt meer dan 30&nbsp;ton, en als je te laat gas terugneemt, ligt de steiger er wel heel snel.",
        },
        {
          id: "b32",
          type: "paragraph",
          html: "“Hij zegt bijna niets,” vertelt Ineke over haar leermeester. “Hij kijkt alleen. En als ik iets verkeerd doe, wacht hij tot ik het zelf merk. Dat duurt soms een hele tijd.” Laatst stond ze voor het eerst met zijstroom aan te leggen, en dat ging behoorlijk mis. De pont kwam dwars op de steiger terecht, en een man met een bakfiets moest flink vooruit springen. Ze keek om, en zag Harm in de deuropening staan. Hij dronk rustig van zijn koffie en zei twee woorden: nog een keer.",
        },
        {
          id: "b33",
          type: "paragraph",
          html: "Of het plan van de vrijwilligers het haalt, is nog onzeker. De verzekering is duur, en de gemeente wil een rooster dat ook in de vakanties en op feestdagen sluit. Daarvoor zijn eigenlijk minstens twintig mensen nodig, en dat zijn er nu nog negen te weinig. Aan het begin van volgend jaar neemt de raad een besluit. Op het prikbord in de supermarkt hangt inmiddels een briefje met grote letters: <strong>Gezocht: schippers met geduld.</strong> Eronder heeft iemand met pen geschreven dat je ook vroeg op moet kunnen staan.",
        },
        {
          id: "b34",
          type: "paragraph",
          html: "Wat Harm na zijn pensioen gaat doen, weet hij nog niet. Zijn zus zegt dat hij vast elke ochtend om kwart voor zes op de dijk zal staan, gewoon om te kijken of ze het wel goed doen. Hij ontkent het niet. Een reis maken lijkt hem ook wel wat, zegt hij na lang nadenken. Hij is immers nooit verder gekomen dan de overkant. Waar hij dan heen zou willen? Hij denkt er even over na, kijkt naar de rivier en haalt zijn schouders op. Misschien naar de zee, zegt hij. Kijken waar al dat water blijft.",
        },
        {
          id: "b11",
          type: "heading",
          html: "De laatste overtocht van de dag",
        },
        {
          id: "b12",
          type: "paragraph",
          html: "'s Avonds om half acht vaart hij voor de laatste keer. In de zomer staat de zon dan nog boven de populieren en zijn er fietsers die alleen voor het uitzicht meevaren. In januari is het pikdonker en is hij vaak alleen, op de hond van de buren na, die om onbegrijpelijke redenen graag aan de overkant slaapt.",
        },
        {
          id: "b13",
          type: "paragraph",
          html: "Als de pont is vastgelegd, draait hij de sleutel om en kijkt nog even naar het water. Dat doet hij al veertig jaar, en hij kan niet precies zeggen waarom. Aan de overkant gaat de lamp bij zijn zus uit. Dan loopt hij langzaam de dijk af, naar huis, met de lege thermosfles onder zijn arm. Morgen om kwart voor zes begint het opnieuw.",
        },
      ],
    },
  ],
};
