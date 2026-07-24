import { test } from "node:test";
import assert from "node:assert/strict";

import { parseIndexCards, parseDetailFacts, normalizeListingUrl } from "./ne-extract.js";
import { parseFloor } from "./parse.js";

// Trimmed but structurally faithful markup from next-estate.de/en/buy/.
const INDEX_HTML = `
<div class="listings">
  <div class="item_preview" data-object="LV602 " data-lat="52.5456" data-lng="13.4260">
    <a class="item_preview__link" href="https://www.next-estate.de/en/buy/21147/helmholtzkiez-5-room-rooftop-apartment">
      <div class="item_img_slider">
        <div class="ratio"><img loading="lazy" src="https://www.next-estate.de/wp-content/uploads/resizer/resizer.php?w=700&#038;src=../../uploads/photos/branch_a/21147_aab15dd9.jpg" alt=""></div>
        <div class="ratio"><img data-lazy="https://www.next-estate.de/wp-content/uploads/resizer/resizer.php?w=700&#038;src=../../uploads/photos/branch_a/21147_f1e7d325.jpg" src="" alt=""></div>
      </div>
      <div class="item_desc">
        <div class="top">
          <div class="address"><img src="pin.svg" alt="">10439, Prenzlauer Berg</div>
          <p class="item_id"><b>id </b><span>LV602 </span></p>
        </div>
        <span class="item__title">Helmholtzkiez: Beautiful 5-room rooftop apartment &#038; elevator</span>
        <div class="propertyParameters">
          <div class="propertyParameter"><svg></svg><p>5 rooms</p></div>
          <div class="propertyParameter"><svg></svg><p>150m<sup>2</sup></p></div>
          <div class="propertyParameter"><svg></svg><p>1.995.000</p></div>
        </div>
      </div>
    </a>
  </div>
  <div class="item_preview" data-object="GF101 ">
    <a class="item_preview__link" href="https://www.next-estate.de/en/buy/20155/leibnitzstrasse-ground-floor-2-5-rooms/">
      <div class="item_img_slider"><div class="ratio"><img loading="lazy" src="https://www.next-estate.de/img/20155_a.jpg" alt=""></div></div>
      <div class="item_desc">
        <div class="top"><div class="address"><img src="pin.svg" alt="">14057, Charlottenburg</div></div>
        <span class="item__title">Modern apartment</span>
        <div class="propertyParameters">
          <div class="propertyParameter"><p>2.5 rooms</p></div>
          <div class="propertyParameter"><p>72m<sup>2</sup></p></div>
          <div class="propertyParameter"><p>599.000</p></div>
        </div>
      </div>
    </a>
  </div>
  <div class="item_preview">
    <a class="item_preview__link" href="https://www.next-estate.de/en/buy-an-apartment-in-mitte-berlin/">
      <span class="item__title">Guide page, not a listing</span>
    </a>
  </div>
</div>`;

const DETAIL_HTML = `
<ul class="list-group">
  <li class="list-group-item"><span class="key">Next Estate ID</span><span class="value">ZO246</span></li>
  <li class="list-group-item"><span class="key">Kind of property</span><span class="value">Attic</span></li>
  <li class="list-group-item"><span class="key">District</span><span class="value">Prenzlauer Berg</span></li>
  <li class="list-group-item"><span class="key">Floor Level</span><span class="value">5 </span></li>
  <li class="list-group-item"><span class="key">Size</span><span class="value">170 sqm</span></li>
  <li class="list-group-item"><span class="key">Purchase price</span><span class="value">2.190.000 €</span></li>
</ul>`;

test("normalizeListingUrl: adds trailing slash, strips hash/query", () => {
  assert.equal(
    normalizeListingUrl("https://www.next-estate.de/en/buy/21147/foo"),
    "https://www.next-estate.de/en/buy/21147/foo/",
  );
  assert.equal(
    normalizeListingUrl("https://www.next-estate.de/en/buy/21147/foo/#top"),
    "https://www.next-estate.de/en/buy/21147/foo/",
  );
});

test("parseIndexCards: only real numeric-id listings", () => {
  const cards = parseIndexCards(INDEX_HTML);

  assert.equal(cards.length, 2); // the guide page is skipped
  assert.ok(cards.every((c) => /\/en\/buy\/\d+\/.*\/$/.test(c.url)));
});

test("parseIndexCards: first card fields", () => {
  const [c] = parseIndexCards(INDEX_HTML);

  assert.equal(c.id, "21147");
  assert.equal(c.url.endsWith("/"), true);
  assert.equal(c.neighborhood, "Prenzlauer Berg");
  assert.equal(c.rooms, 5);
  assert.equal(c.sizeSqm, 150);
  assert.equal(c.price, 1995000);
  assert.match(c.title, /^Helmholtzkiez: Beautiful 5-room rooftop apartment & elevator$/);
});

test("parseIndexCards: image URL is decoded and absolute", () => {
  const [c] = parseIndexCards(INDEX_HTML);

  assert.ok(c.imageUrl && c.imageUrl.startsWith("https://www.next-estate.de/"));
  assert.equal(c.imageUrl.includes("&#038;"), false);
  assert.ok(c.imageUrl.includes("w=700"));
  assert.ok(c.imageUrl.endsWith(".jpg"));
});

test("parseIndexCards: half-rooms and ground floor card", () => {
  const [, c2] = parseIndexCards(INDEX_HTML);

  assert.equal(c2.id, "20155");
  assert.equal(c2.neighborhood, "Charlottenburg");
  assert.equal(c2.rooms, 2.5);
  assert.equal(c2.sizeSqm, 72);
  assert.equal(c2.price, 599000);
});

test("parseDetailFacts: key/value map incl. Floor Level", () => {
  const facts = parseDetailFacts(DETAIL_HTML);

  assert.equal(facts["Floor Level"], "5");
  assert.equal(facts["District"], "Prenzlauer Berg");
  assert.equal(facts["Purchase price"], "2.190.000 €");
});

test("parseDetailFacts: Floor Level feeds parseFloor", () => {
  const facts = parseDetailFacts(DETAIL_HTML);

  assert.equal(parseFloor(facts["Floor Level"]).value, 5);
  assert.equal(parseFloor("EG").value, 0); // ground floor form seen on some listings
  assert.equal(parseFloor(facts["Missing"]).value, null); // absent field -> null
});
