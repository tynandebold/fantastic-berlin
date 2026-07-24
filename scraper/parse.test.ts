import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFloor,
  parsePrice,
  parseRooms,
  parseSize,
  pricePerSqm,
  parseNeighborhood,
  isNonBerlin,
  slugFromUrl,
} from "./parse.js";

test("parseFloor: German upper floors", () => {
  assert.equal(parseFloor("3. OG").value, 3);
  assert.equal(parseFloor("3.OG").value, 3);
  assert.equal(parseFloor("2. Obergeschoss").value, 2);
  assert.equal(parseFloor("4. Etage").value, 4);
  assert.equal(parseFloor("1. Stock").value, 1);
});

test("parseFloor: English floors", () => {
  assert.equal(parseFloor("3rd floor").value, 3);
  assert.equal(parseFloor("1st floor").value, 1);
  assert.equal(parseFloor("Floor 4").value, 4);
});

test("parseFloor: Fantastic Frank ordinal format", () => {
  assert.equal(parseFloor("4th, front building").value, 4);
  assert.equal(parseFloor("1st, side wing").value, 1);
  assert.equal(parseFloor("2nd, rear building").value, 2);
});

test("parseFloor: ground / basement", () => {
  assert.equal(parseFloor("EG").value, 0);
  assert.equal(parseFloor("Erdgeschoss").value, 0);
  assert.equal(parseFloor("Ground floor").value, 0);
  assert.equal(parseFloor("Hochparterre").value, 0);
  assert.equal(parseFloor("UG").value, -1);
  assert.equal(parseFloor("Souterrain").value, -1);
});

test("parseFloor: attic / top flagged as isTop with null value", () => {
  const dg = parseFloor("DG");

  assert.equal(dg.isTop, true);
  assert.equal(dg.value, null);

  assert.equal(parseFloor("Dachgeschoss").isTop, true);
  assert.equal(parseFloor("Penthouse").isTop, true);
});

test("parseFloor: unknown returns null value, keeps raw", () => {
  const r = parseFloor("somewhere");

  assert.equal(r.value, null);
  assert.equal(r.isTop, false);
  assert.equal(r.raw, "somewhere");
});

test("parseFloor: empty", () => {
  assert.deepEqual(parseFloor(""), { raw: "", value: null, isTop: false });
  assert.deepEqual(parseFloor(null), { raw: "", value: null, isTop: false });
});

test("parsePrice: German and English formats", () => {
  assert.equal(parsePrice("€ 495.000"), 495000);
  assert.equal(parsePrice("495.000 €"), 495000);
  assert.equal(parsePrice("EUR 1.200.000"), 1200000);
  assert.equal(parsePrice("1,200,000"), 1200000);
});

test("parsePrice: non-prices return null", () => {
  assert.equal(parsePrice("Price on request"), null);
  assert.equal(parsePrice("3"), null);
  assert.equal(parsePrice(null), null);
});

test("parseSize: square meters with comma decimals", () => {
  assert.equal(parseSize("72 m²"), 72);
  assert.equal(parseSize("72,5 m²"), 72.5);
  assert.equal(parseSize("120 sqm"), 120);
  assert.equal(parseSize("85 qm"), 85);
});

test("parseRooms", () => {
  assert.equal(parseRooms("3 Zimmer"), 3);
  assert.equal(parseRooms("3,5 rooms"), 3.5);
  assert.equal(parseRooms("2 Zi."), 2);
  assert.equal(parseRooms("not a room"), null);
});

test("pricePerSqm", () => {
  assert.equal(pricePerSqm(495000, 72), 6875);
  assert.equal(pricePerSqm(null, 72), null);
  assert.equal(pricePerSqm(495000, null), null);
});

test("parseNeighborhood: multi-word wins, from slug or text", () => {
  assert.equal(parseNeighborhood("Charming flat in Prenzlauer Berg"), "Prenzlauer Berg");
  assert.equal(parseNeighborhood(null, "kreuzberg-flat"), "Kreuzberg");
  assert.equal(parseNeighborhood("no district here"), null);
});

test("slugFromUrl", () => {
  assert.equal(
    slugFromUrl("https://www.fantasticfrank.com/en/berlin/property/suarezstrasse-12/"),
    "suarezstrasse-12",
  );
});

test("isNonBerlin: drops other German cities, keeps Berlin districts", () => {
  assert.equal(isNonBerlin("Düsseldorf-Friedrichstadt"), true);
  assert.equal(isNonBerlin("Köln - Agnesviertel"), true);
  assert.equal(isNonBerlin("Prenzlauer Berg"), false);
  assert.equal(isNonBerlin("Mitte"), false);
  assert.equal(isNonBerlin(null), false);
});
