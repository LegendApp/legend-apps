export type CompileDeckSuccess = {
  sourceSlideEnds?: number[];
  code: string;
  dependencies: string[];
  success: true;
  uniwindCode: string;
  warnings: string[];
};

export type CompileDeckFailure = {
  sourceSlideEnds?: number[];
  errors: string[];
  success: false;
  warnings: string[];
};

export type CompileDeckResult = CompileDeckSuccess | CompileDeckFailure;
