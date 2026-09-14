{ pkgs }:
let name = "slides";
in pkgs.stdenv.mkDerivation {
  pname = name;
  version = "1.0";
  src = ./.;
  buildPhase = "make";
}
