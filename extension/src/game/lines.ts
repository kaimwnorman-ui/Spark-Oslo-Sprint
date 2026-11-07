// Blot's general lines, in the page's language (SPEC §5). Idea-specific lines come from the
// round (demo) or the creature model (live).
import type { Language } from '../../../shared/types.ts';

const en = {
  hello: "Hi coach! I'm Blot. I know NOTHING about your world. Teach me!",
  hint: 'Pick an idea, then teach it in your own words.',
  gotIt: "Got it! Totally makes sense. I'm sure I understood that perfectly.",
  pasted: "Those are the page's words! Tell me in yours.",
  tooShort: (n: number) => `A few more words, please: ${n} to go.`,
  thenWhat: 'Oh! Then what is it?',
  yay: 'Yay! I knew it!',
  soWhy: 'You are back! So... why?',
  dontKnowYet: "I don't know anything about this one yet. Teach me first?",
  dontKnowCard: "Nobody knows everything! Here's a page that explains it.",
  noSource: "Nobody knows everything! Let's keep going with what we know.",
  bellArmed: 'Press again to send Blot into the fight',
  timeLow: 'Ten seconds! Quick, one more!',
  ready: "I'm ready! I think. Probably.",
  fizzle: "I... don't know this one!",
  hit: 'Take THAT!',
  ko: 'K.O.!',
  escaped: 'The monster escaped with the page!',
  rematch: (name: string) => `Teach me ${name} and let's try again!`,
  whenQuestion: (name: string) => `Ooh! But when would I use "${name}"?`,
  offline: 'Offline mode: Blot is playing from the demo round.',
  onDevice: 'Blot is thinking on this laptop',
  offlineDevice: 'Offline: Blot is still thinking on this laptop',
  expired: 'This round expired. Play it again!',
};

const nb: typeof en = {
  hello: 'Hei, trener! Jeg er Blot. Jeg vet INGENTING om verdenen din. Lær meg!',
  hint: 'Velg en idé, og lær den bort med dine egne ord.',
  gotIt: 'Skjønner! Helt logisk. Jeg er sikker på at jeg forsto alt.',
  pasted: 'Det er sidens ord! Si det med dine egne.',
  tooShort: (n: number) => `Litt flere ord, takk: ${n} til.`,
  thenWhat: 'Å! Hva er det da?',
  yay: 'Jippi! Visste det!',
  soWhy: 'Du er tilbake! Så... hvorfor?',
  dontKnowYet: 'Jeg vet ingenting om denne ennå. Lær meg først?',
  dontKnowCard: 'Ingen vet alt! Her er en side som forklarer det.',
  noSource: 'Ingen vet alt! Vi fortsetter med det vi kan.',
  bellArmed: 'Trykk igjen for å sende Blot i kamp',
  timeLow: 'Ti sekunder! Fort, én til!',
  ready: 'Jeg er klar! Tror jeg. Sikkert.',
  fizzle: 'Jeg... kan ikke denne!',
  hit: 'Ta DEN!',
  ko: 'K.O.!',
  escaped: 'Monsteret stakk av med siden!',
  rematch: (name: string) => `Lær meg ${name}, så prøver vi igjen!`,
  whenQuestion: (name: string) => `Å! Men når skulle jeg brukt «${name}»?`,
  offline: 'Frakoblet: Blot spiller fra demorunden.',
  onDevice: 'Blot tenker på denne maskinen',
  offlineDevice: 'Frakoblet: Blot tenker fortsatt på denne maskinen',
  expired: 'Runden er utløpt. Spill den på nytt!',
};

export type Lines = typeof en;
export function linesFor(language: Language): Lines {
  return language === 'nb' || language === 'nn' ? nb : en;
}
