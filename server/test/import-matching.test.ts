import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeImportText, rankImportCandidates, selectImportMatch } from "../src/importMatching.js";
const source = { id: "source00001", title: "A Beautiful Song", artist: "Test Artist", duration: 180 };
const good = { id: "correct0001", title: "A Beautifull Song (Official Audio)", channel: "Test Artist - Topic", duration: 182 };
test("scored matching accepts a small typo with artist and duration evidence", () => {
  assert.equal(selectImportMatch(source, [good])?.id, good.id);
  const ranked = rankImportCandidates(source, [{ ...good, id: "wrong000001", channel: "Another artist" }, good]);
  assert.equal(ranked[0]?.id, good.id);
});
test("Japanese width/separators normalize without erasing kana voicing", () => {
  const jp = { ...source, title: "チエルカ／エソテリカ", artist: "テスト" };
  assert.equal(selectImportMatch(jp, [{ ...good, title: "チエルカ/エソテリカ【公式MV】", channel: "テスト" }])?.id, good.id);
  assert.notEqual(normalizeImportText("パ"), normalizeImportText("ハ"));
  assert.equal(normalizeImportText("Beyoncé"), normalizeImportText("Beyonce"));
});
test("alternate versions, duration conflicts, absent artists and tied recordings require review", () => {
  const exact = { ...good, title: source.title };
  for (const candidate of [{ ...exact, title: `${source.title} Live` }, { ...exact, duration: 360 }, { ...exact, channel: "Unknown" }])
    assert.equal(selectImportMatch(source, [candidate]), null);
  assert.equal(selectImportMatch({ ...source, artist: "" }, [exact]), null);
  assert.equal(selectImportMatch(source, [exact, { ...exact, id: "another0001" }]), null);
});
test("original IDs win, duplicate provider IDs merge, and arbitrary titles never auto-match", () => {
  assert.equal(selectImportMatch(source, [{ ...good, id: source.id, title: "Different provider title" }])?.id, source.id);
  assert.equal(selectImportMatch(source, [{ ...good, channel: "Unknown" }, good])?.id, good.id);
  assert.equal(selectImportMatch(source, [{ ...good, title: "CSGO SoloQ Part 13" }]), null);
});
