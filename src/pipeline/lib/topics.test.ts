import { describe, it, expect } from "vitest";
import { SECTOR_TOPICS, topicsForCompany, topicLabel } from "./topics";

const topic = (key: string) => SECTOR_TOPICS.find((t) => t.topic === key)!;

describe("sector topic gazetteer", () => {
  it("maps EDGAR industries to topics", () => {
    expect(topicsForCompany("Semiconductors & Related Devices", "Manufacturing")).toContain(
      "semiconductors",
    );
    expect(topicsForCompany("Air Transportation, Scheduled", null)).toContain("airlines");
    expect(topicsForCompany("Electric Services", "Transportation & Utilities")).toContain(
      "electric_utilities",
    );
    expect(topicsForCompany(null, null)).toEqual([]);
    expect(topicsForCompany("Prepackaged Software", "Services")).toEqual([]);
  });

  it("statement patterns match genuine industry talk", () => {
    expect(topic("semiconductors").statementPattern.test("tariffs on semiconductors")).toBe(true);
    expect(topic("semiconductors").statementPattern.test("the chip makers are coming home")).toBe(
      true,
    );
    expect(topic("pharmaceuticals").statementPattern.test("drug prices will plummet")).toBe(true);
    expect(topic("airlines").statementPattern.test("the airlines owe me an apology")).toBe(true);
    expect(topic("oil_gas").statementPattern.test("DRILL BABY DRILL")).toBe(true);
  });

  it("statement patterns reject look-alike everyday language (precision bias)", () => {
    expect(topic("semiconductors").statementPattern.test("fish and chips with salsa")).toBe(false);
    expect(topic("airlines").statementPattern.test("the air was electric tonight")).toBe(false);
    expect(topic("banks").statementPattern.test("the river banks flooded")).toBe(false);
    expect(topic("steel_aluminum").statementPattern.test("a man of steel resolve")).toBe(false);
    expect(topic("automakers").statementPattern.test("automatic weapons")).toBe(false);
  });

  it("labels are human-readable", () => {
    expect(topicLabel("oil_gas")).toBe("Oil & gas");
    expect(topicLabel("unknown_topic")).toBe("unknown topic");
  });
});
