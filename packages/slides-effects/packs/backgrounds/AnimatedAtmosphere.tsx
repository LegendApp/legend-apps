import { Droplets } from "./Droplets";
import { GlassAtmosphere } from "./GlassAtmosphere";
import { Fluid } from "./Fluid";
import { Smoke } from "./Smoke";
import { Wireframe } from "./Wireframe";
import type { AtmosphereProps } from "./Atmosphere";
export type { AtmosphereProps } from "./Atmosphere";
export type AtmosphereVariant = "fluid" | "smoke" | "wireframe" | "glass" | "droplets";
export function AnimatedAtmosphere({ variant = "fluid", ...props }: AtmosphereProps & { variant?: AtmosphereVariant }) {
  const Component = variant === "droplets" ? Droplets : variant === "glass" ? GlassAtmosphere : variant === "smoke" ? Smoke : variant === "wireframe" ? Wireframe : Fluid;
  return <Component {...props} />;
}
export { Droplets, GlassAtmosphere, Fluid, Smoke, Wireframe };
