/** RN's Metro address is a host option, not a document supplied by the user. */
export function appLaunchArguments(value: unknown) {
  if (!Array.isArray(value) || !value.includes("-RCT_jsLocation")) return value;
  const args = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "-RCT_jsLocation") i++;
    else args.push(value[i]);
  }
  return args;
}
