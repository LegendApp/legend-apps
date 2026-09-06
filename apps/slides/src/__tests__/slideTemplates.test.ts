// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { resolveSlideTemplate } from "../slideTemplates";

const DefaultTemplate = () => null;
const TitleTemplate = () => null;

describe("slide templates", () => {
  const templates = {
    "templates/Default": DefaultTemplate,
    "templates/Title": TitleTemplate,
  };

  test("uses the deck template by default", () => {
    expect(resolveSlideTemplate(templates, { template: "templates/Default" }, {})).toEqual({
      component: DefaultTemplate,
      reference: "templates/Default",
    });
  });

  test("supports per-slide overrides", () => {
    expect(resolveSlideTemplate(templates, { template: "templates/Default" }, { template: "templates/Title" })).toEqual({
      component: TitleTemplate,
      reference: "templates/Title",
    });
  });

  test("allows a slide to disable the deck template", () => {
    expect(resolveSlideTemplate(templates, { template: "templates/Default" }, { template: false })).toEqual({
      component: undefined,
      reference: undefined,
    });
  });
});
