import type { ComponentType } from "react";
import type {
  DeckConfig,
  PresentationTemplateProps,
  PresentationTemplates,
  SlideConfig,
} from "@legend-apps/presentation";

export type ResolvedSlideTemplate = {
  component?: ComponentType<PresentationTemplateProps>;
  reference?: string;
};

export function resolveSlideTemplate(
  templates: PresentationTemplates,
  deck: DeckConfig,
  slide: SlideConfig,
): ResolvedSlideTemplate {
  const reference = slide.template === false
    ? undefined
    : typeof slide.template === "string"
      ? slide.template
      : deck.template;
  return {
    component: reference ? templates[reference] : undefined,
    reference,
  };
}
