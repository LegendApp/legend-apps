export type CompileDeckSuccess = {
  code: string;
  dependencies: string[];
  success: true;
  uniwindCode: string;
  warnings: string[];
};

export type CompileDeckFailure = {
  errors: string[];
  success: false;
  warnings: string[];
};

export type CompileDeckResult = CompileDeckSuccess | CompileDeckFailure;
