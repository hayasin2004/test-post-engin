/**
 * tests/lib/topic-filter.test.mjs
 * src/lib/gemini.ts のネタ被り防止ロジックを検証する
 *
 * 注意: extractTokens の正規表現 /[぀-鿿\w]{4,}/g は
 * 日本語文字(U+3040-U+9FFF)と \w(ASCII英数字)を同一クラスとして扱うため、
 * スペース・句読点がない限り混在文字列は1トークンとしてマッチする。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const CASUAL_KEYWORDS = [
  "おなかすいた", "おなかへった", "眠い", "ねむい", "疲れた", "つかれた",
  "コーヒー", "眠れない", "休憩", "ひと息", "のんびり",
];

function isCasualContent(content) {
  return CASUAL_KEYWORDS.some((kw) => content.includes(kw));
}

function extractTokens(text) {
  return (text.match(/[぀-鿿\w]{4,}/g) ?? []);
}

function hasTopicOverlap(candidate, recentContents) {
  if (isCasualContent(candidate)) return false;
  const candidateTokens = extractTokens(candidate);
  for (const past of recentContents) {
    const pastTokens = extractTokens(past);
    const shared = candidateTokens.filter((t) => pastTokens.includes(t));
    if (shared.length >= 3) return true;
  }
  return false;
}

describe("gemini: isCasualContent", () => {
  test("おなかすいた はカジュアル", () => {
    assert.equal(isCasualContent("おなかすいた！"), true);
  });
  test("眠い はカジュアル", () => {
    assert.equal(isCasualContent("今日は眠い"), true);
  });
  test("コーヒー はカジュアル", () => {
    assert.equal(isCasualContent("コーヒー飲みたい"), true);
  });
  test("休憩 はカジュアル", () => {
    assert.equal(isCasualContent("少し休憩します"), true);
  });
  test("技術的な内容はカジュアルでない", () => {
    assert.equal(isCasualContent("TypeScriptの型推論を解説します"), false);
  });
  test("空文字列はカジュアルでない", () => {
    assert.equal(isCasualContent(""), false);
  });
  test("複数キーワード含む場合もカジュアル", () => {
    assert.equal(isCasualContent("眠いしおなかすいた"), true);
  });
});

describe("gemini: extractTokens (実際の挙動)", () => {
  test("スペース区切りの英単語はそれぞれ個別トークン", () => {
    const tokens = extractTokens("Hello World great test");
    assert.ok(tokens.includes("Hello"));
    assert.ok(tokens.includes("World"));
    assert.ok(tokens.includes("great"));
    assert.ok(tokens.includes("test"));
  });
  test("スペースなし混在文字は1トークンになる", () => {
    const tokens = extractTokens("TypeScriptとReact");
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0].includes("TypeScript"));
  });
  test("3文字以下のみ(スペース区切り)はマッチしない", () => {
    const tokens = extractTokens("AI DB Go");
    assert.equal(tokens.length, 0);
  });
  test("句読点・記号はトークンを分割する", () => {
    const tokens = extractTokens("Python. Java! TypeScript?");
    assert.ok(tokens.includes("Python"));
    assert.ok(tokens.includes("Java"));
    assert.ok(tokens.includes("TypeScript"));
  });
  test("4文字以上の英単語は抽出される", () => {
    const tokens = extractTokens("Next great test good");
    assert.ok(tokens.includes("Next"));
    assert.ok(tokens.includes("great"));
  });
  test("空文字列は空配列", () => {
    assert.deepEqual(extractTokens(""), []);
  });
});

describe("gemini: hasTopicOverlap", () => {
  test("カジュアル内容は重複チェックをスキップ false", () => {
    const past = ["おなかすいた本当に腹ペコです"];
    assert.equal(hasTopicOverlap("おなかすいた！！", past), false);
  });
  test("過去投稿が空なら重複なし false", () => {
    assert.equal(hasTopicOverlap("TypeScript React Next good test", []), false);
  });
  test("スペース区切りで3トークン以上一致する場合は重複 true", () => {
    const past = ["TypeScript React Next Vitest Jest unit"];
    const cand = "TypeScript React Next great performance";
    assert.equal(hasTopicOverlap(cand, past), true);
  });
  test("2トークン以下の一致は重複なし false", () => {
    const past = ["TypeScript great post"];
    const cand = "TypeScript Python Ruby great language";
    assert.equal(hasTopicOverlap(cand, past), false);
  });
  test("複数過去投稿でも3トークン一致で重複 true", () => {
    const past = [
      "sunny weather today",
      "TypeScript React Next unit testing vitest",
    ];
    const cand = "TypeScript React Next great performance";
    assert.equal(hasTopicOverlap(cand, past), true);
  });
});
