// Paste into the DevTools console of Tolk's library page, after importing the
// three demo books. It adds 30 days of demo reading history and 12 saved words.
// Only use it in a separate Chrome profile kept for recording.
(async () => {
  const history = await import("./js/history-store.js");
  const books = await import("./js/book-store.js");
  const saved = await import("./js/saved-words-store.js");
  const list = await books.listBooks();
  const id = (title) => list.find((b) => b.title === title)?.id;
  const ids = { garden: id("De tuin van oma"), amsterdam: id("Een jaar in Amsterdam"), lighthouse: id("Der Leuchtturm") };
  if (!ids.garden || !ids.amsterdam || !ids.lighthouse) throw new Error("Import the three demo books first");
  const dateAgo = (ago) => { const d = new Date(); d.setDate(d.getDate() - ago); d.setHours(20, 0, 0, 0); return d; };
  for (const [ago, language, seconds, book] of [[29,"nl",1620,"garden"],[28,"nl",1140,"garden"],[28,"nl",360,null],[26,"nl",1500,"garden"],[25,"nl",1020,"garden"],[24,"de",1080,"lighthouse"],[22,"nl",900,"garden"],[21,"nl",1740,"garden"],[20,"nl",1260,"garden"],[20,"nl",390,null],[19,"nl",2100,"garden"],[18,"nl",1620,"garden"],[15,"nl",1500,"garden"],[14,"nl",1020,"amsterdam"],[13,"nl",1860,"amsterdam"],[12,"nl",1380,"amsterdam"],[12,"nl",420,null],[11,"nl",900,"amsterdam"],[11,"nl",420,"garden"],[10,"de",1020,"lighthouse"],[8,"nl",2100,"amsterdam"],[8,"nl",600,null],[7,"nl",1620,"amsterdam"],[6,"nl",1140,"amsterdam"],[6,"nl",420,"garden"],[5,"nl",1980,"amsterdam"],[3,"de",660,"lighthouse"],[2,"nl",1860,"amsterdam"],[1,"nl",1380,"amsterdam"],[1,"nl",420,"garden"]]) {
    await history.addToDay({ date: history.localDate(dateAgo(ago)), language, seconds, words: Math.round(seconds * 1.6), bookId: book === null ? null : ids[book] });
  }
  await history.recordFinish(ids.garden, dateAgo(15));
  await history.assignIdentities();
  await books.updateBook(ids.garden, { progress: 1, lastReadAt: dateAgo(15).getTime() });
  await books.updateBook(ids.amsterdam, { progress: 0.46, lastReadAt: dateAgo(1).getTime() });
  await books.updateBook(ids.lighthouse, { progress: 0.31, lastReadAt: dateAgo(3).getTime() });
  await saved.loadSavedWords();
  const titles = { garden: "De tuin van oma", amsterdam: "Een jaar in Amsterdam" };
  for (const [i, w] of [{"word":"logeerde","translation":"stayed","sentence":"Elke zomer logeerde Sanne een week bij haar oma.","book":"garden","ago":1},{"word":"heg","translation":"hedge","sentence":"Het huis stond aan het einde van een smalle weg, achter een hoge heg.","book":"garden","ago":2},{"word":"oogsten","translation":"harvest","sentence":"“Vandaag gaan we oogsten,” zei oma op de eerste ochtend.","book":"garden","ago":3},{"word":"mand","translation":"basket","sentence":"Ze gaf Sanne een mand en een oude strohoed.","book":"garden","ago":4},{"word":"vroeger","translation":"in the past","sentence":"“Dat deed ik vroeger ook,” zei ze.","book":"garden","ago":5},{"word":"gracht","translation":"canal","sentence":"Hij had een koffer, een kaart van de stad en het adres van een kamer aan een gracht.","book":"amsterdam","ago":6},{"word":"voorbijdrijven","translation":"drift past","sentence":"'s Avonds zag hij de lichten van de boten voorbijdrijven.","book":"amsterdam","ago":7},{"word":"tweedehands","translation":"second-hand","sentence":"In oktober kocht Ali een tweedehands fiets.","book":"amsterdam","ago":8},{"word":"verkoper","translation":"seller","sentence":"De verkoper sprak langzaam als Ali iets niet begreep.","book":"amsterdam","ago":9},{"word":"kazen","translation":"cheeses","sentence":"Op de markt leerde hij de namen van kazen en vissen.","book":"amsterdam","ago":10},{"word":"begreep","translation":"understood","sentence":"De verkoper sprak langzaam als Ali iets niet begreep.","book":"amsterdam","ago":11},{"word":"zonnebloemen","translation":"sunflowers","sentence":"Er groeiden bonen, aardbeien en zonnebloemen die hoger waren dan Sanne zelf.","book":"garden","ago":12}].entries()) {
    await saved.putSavedWord({ id: "demo-" + i, word: w.word, translation: w.translation, sentence: w.sentence,
      source: { title: titles[w.book], bookId: ids[w.book] }, language: "nl", savedAt: dateAgo(w.ago).getTime() });
  }
  location.reload();
})();
