import { test, expect } from "@playwright/test";
import { bookOfName } from "../../plugins/beta/books/shared/name.js";

// A server shelf's books named from their files (plugins/beta/books/shared/name.js): the shapes downloaded books carry,
// and names that say nothing kept as they are.
const cases: [string, Record<string, string>][] = [
  ["(Oxford Graduate Texts) Giuseppe Mussardo - Statistical Field Theory_ An Introduction to Exactly Solved Models in Statistical Physics-Oxford University Press (2010)",
    { title: "Statistical Field Theory: An Introduction to Exactly Solved Models in Statistical Physics", author: "Giuseppe Mussardo", series: "Oxford Graduate Texts", year: "2010" }],
  ["Bruus and Flensberg - 2004 - Many-body quantum theory in condensed matter physics an introduction",
    { title: "Many-body quantum theory in condensed matter physics an introduction", author: "Bruus and Flensberg", year: "2004" }],
  ["Gerald D. Mahan - Many-Particle Physics (2000)", { title: "Many-Particle Physics", author: "Gerald D. Mahan", year: "2000" }],
  ["Many-Particle Physics (2000)", { title: "Many-Particle Physics", year: "2000" }],
  ["[Physics textbook] Philip Hofmann - Solid state physics _ an introduction (2008, Wiley-VCH )",
    { title: "Solid state physics: an introduction", author: "Philip Hofmann", series: "Physics textbook", year: "2008" }],
  ["[John R. Taylor] Classical Mechanics", { title: "Classical Mechanics", author: "John R. Taylor" }],
  ["[Graduate Texts in Physics] Wolfgang Nolting - Fundamentals of Many-body Physics", { title: "Fundamentals of Many-body Physics", author: "Wolfgang Nolting", series: "Graduate Texts in Physics" }],
  [") P A M Dirac - The principles of quantum mechanics (1966)", { title: "The principles of quantum mechanics", author: "P A M Dirac", year: "1966" }],
  ["(International series of monographs on physics (Oxford, England)) P A M Dirac - The principles of quantum mechanics-Clarendon Press (1966)",
    { title: "The principles of quantum mechanics", author: "P A M Dirac", series: "International series of monographs on physics (Oxford, England)", year: "1966" }],
  ["70967", { title: "70967" }],
  ["978-1-4613-1469-1", { title: "978-1-4613-1469-1" }],
  ["158871_ROTELLA_2020", { title: "158871 ROTELLA 2020" }],
  ["2605_Alice Example PhD project", { title: "2605 Alice Example PhD project" }],
];

test("a book's title, author, series and year from its file's name", () => {
  for (const [name, want] of cases) expect(bookOfName(name), name).toEqual(want);
});
