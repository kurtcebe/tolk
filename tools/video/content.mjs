// Text for the introduction video. All of it was written for the video, so it
// carries this repository's licence and needs no credit.

export const ARTICLE = {
  title: "Waarom fietst Nederland zo veel?",
  byline: "Tolk-demotekst",
  paragraphs: [
    "In Nederland zijn meer fietsen dan mensen. Kinderen fietsen naar school, ouders fietsen naar hun werk en grootouders fietsen naar de markt. Voor veel Nederlanders is de fiets net zo gewoon als een paar schoenen.",
    "Het land is vlak, en de afstanden zijn klein. Een stad is vaak in twintig minuten te doorkruisen. Bovendien zijn er overal brede fietspaden, met eigen verkeerslichten en soms zelfs een eigen brug.",
    "Toch was dat niet altijd zo. In de jaren zeventig reden er steeds meer auto's door de steden, en het verkeer werd gevaarlijk. Ouders gingen de straat op en vroegen om veilige wegen voor hun kinderen. Langzaam veranderde de stad.",
    "Vandaag parkeren mensen hun fiets bij het station in grote garages onder de grond. Wie een keer door Utrecht of Groningen fietst, begrijpt snel waarom zo veel mensen de auto thuis laten staan.",
  ],
};

/** Each book gets a cover drawn in its own colour. */
export const BOOKS = [
  {
    file: "de-tuin-van-oma.epub",
    title: "De tuin van oma",
    author: "Tolk-demotekst",
    language: "nl",
    cover: { background: "#2f5d50", ink: "#f4efe2" },
    chapters: [
      {
        title: "Hoofdstuk 1",
        paragraphs: [
          "Elke zomer logeerde Sanne een week bij haar oma. Het huis stond aan het einde van een smalle weg, achter een hoge heg.",
          "Achter het huis lag de tuin. Er groeiden bonen, aardbeien en zonnebloemen die hoger waren dan Sanne zelf.",
          "“Vandaag gaan we oogsten,” zei oma op de eerste ochtend. Ze gaf Sanne een mand en een oude strohoed.",
        ],
      },
      {
        title: "Hoofdstuk 2",
        paragraphs: [
          "De aardbeien waren rood en warm van de zon. Sanne at er meer dan ze in de mand legde.",
          "Oma lachte. “Dat deed ik vroeger ook,” zei ze. “Daarom planten we er altijd een paar extra.”",
        ],
      },
    ],
  },
  {
    file: "een-jaar-in-amsterdam.epub",
    title: "Een jaar in Amsterdam",
    author: "Tolk-demotekst",
    language: "nl",
    cover: { background: "#7a3b2e", ink: "#f8eee4" },
    chapters: [
      {
        title: "September",
        paragraphs: [
          "Toen Ali in Amsterdam aankwam, regende het. Hij had een koffer, een kaart van de stad en het adres van een kamer aan een gracht.",
          "De kamer was klein, maar het raam keek uit over het water. 's Avonds zag hij de lichten van de boten voorbijdrijven.",
        ],
      },
      {
        title: "Oktober",
        paragraphs: [
          "In oktober kocht Ali een tweedehands fiets. De eerste week viel hij twee keer, de tweede week niet meer.",
          "Op de markt leerde hij de namen van kazen en vissen. De verkoper sprak langzaam als Ali iets niet begreep.",
        ],
      },
    ],
  },
  {
    file: "der-leuchtturm.epub",
    title: "Der Leuchtturm",
    author: "Tolk-Beispieltext",
    language: "de",
    cover: { background: "#1f4e79", ink: "#f2f5f8" },
    chapters: [
      {
        title: "Kapitel 1",
        paragraphs: [
          "Am Ende der Insel stand ein alter Leuchtturm. Niemand wohnte mehr dort, aber jede Nacht ging das Licht an.",
          "Lena wollte wissen, warum. An einem windigen Abend nahm sie ihre Taschenlampe und ging den Weg hinauf.",
        ],
      },
      {
        title: "Kapitel 2",
        paragraphs: [
          "Die Tür war nicht verschlossen. Drinnen roch es nach Salz und altem Holz.",
          "Oben, neben der großen Lampe, saß eine Katze und sah sie ruhig an.",
        ],
      },
    ],
  },
];

/** Words saved before filming, so the tank has bubbles. */
export const SAVED_WORDS = [
  ["logeerde", "stayed", "Elke zomer logeerde Sanne een week bij haar oma."],
  ["heg", "hedge", "Het huis stond aan het einde van een smalle weg, achter een hoge heg."],
  ["oogsten", "harvest", "“Vandaag gaan we oogsten,” zei oma op de eerste ochtend."],
  ["mand", "basket", "Ze gaf Sanne een mand en een oude strohoed."],
  ["vroeger", "in the past", "“Dat deed ik vroeger ook,” zei ze."],
  ["gracht", "canal", "Hij had een koffer, een kaart van de stad en het adres van een kamer aan een gracht."],
  ["voorbijdrijven", "drift past", "'s Avonds zag hij de lichten van de boten voorbijdrijven."],
  ["tweedehands", "second-hand", "In oktober kocht Ali een tweedehands fiets."],
  ["verkoper", "seller", "De verkoper sprak langzaam als Ali iets niet begreep."],
  ["kazen", "cheeses", "Op de markt leerde hij de namen van kazen en vissen."],
  ["begreep", "understood", "De verkoper sprak langzaam als Ali iets niet begreep."],
  ["zonnebloemen", "sunflowers", "Er groeiden bonen, aardbeien en zonnebloemen die hoger waren dan Sanne zelf."],
];
