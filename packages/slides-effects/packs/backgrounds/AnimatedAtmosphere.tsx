import { Droplets } from "./Droplets";
import { GlassAtmosphere } from "./GlassAtmosphere";
import { Fluid } from "./Fluid";
import { Wireframe } from "./Wireframe";
import type { AtmosphereProps } from "./Atmosphere";
export type { AtmosphereProps } from "./Atmosphere";
export type AtmosphereVariant = "fluid" | "wireframe" | "glass" | "droplets";
export function AnimatedAtmosphere({ variant = "fluid", ...props }: AtmosphereProps & ({ variant?: Exclude<AtmosphereVariant, "droplets"> } | { variant: "droplets"; intensity?: never })) {
  const Component = variant === "droplets" ? Droplets : variant === "glass" ? GlassAtmosphere : variant === "wireframe" ? Wireframe : Fluid;
  return <Component {...props} />;
}
export { Droplets, GlassAtmosphere, Fluid, Wireframe };
