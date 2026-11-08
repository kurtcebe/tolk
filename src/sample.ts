import type { TolkDocument } from "./document.js";

// An original text written for Tolk: the village and the people are invented.
// It deliberately includes the things real sources contain: a non-breaking
// space, a soft hyphen, numbers, quotes, emphasis and a link.
export const SAMPLE_DOCUMENT: TolkDocument = {
  id: "sample",
  source: { kind: "sample" },
  title: "De laatste veerman van Oosterwaal",
  author: "Voorbeeldtekst voor Tolk",
  language: "nl",
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
