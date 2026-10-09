export type CompileDeckSuccess = {
  effectPackIds?: string[];
  noteTargets?: string[];
  sourceSlideEnds?: number[];
  code: string;
  dependencies: string[];
  success: true;
  uniwindCode: string;
  warnings: string[];
};

export type CompileDeckFailure = {
  effectPackIds?: string[];
  missingEffectPacks?: string[];
  sourceSlideEnds?: number[];
  errors: string[];
  success: false;
  warnings: string[];
};

export type CompileDeckResult = CompileDeckSuccess | CompileDeckFailure;
