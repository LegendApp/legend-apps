import { useDerivedValue } from "react-native-reanimated";

export type GPUShaderDataField = string | readonly [name: string, length: number];

/** Upload one coherent snapshot of an existing host-owned shader timeline. */
export function useGPUShaderData(uniforms: { readonly value: Record<string, number | number[]> }, fields: readonly GPUShaderDataField[]) {
  return useDerivedValue(() => {
    const snapshot = uniforms.value;
    const data: number[] = [];
    for (const field of fields) {
      if (typeof field === "string") data.push(snapshot[field] as number ?? 0);
      else {
        const values = snapshot[field[0]] as number[] | undefined;
        for (let i = 0; i < field[1]; i++) data.push(values?.[i] ?? 0);
      }
    }
    return data;
  }, [uniforms, fields]);
}
