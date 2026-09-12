#import <AppKit/AppKit.h>
#import <objc/runtime.h>

// AppKit may temporarily mutate `enabled` while a modal panel is open. Keep
// the owner's requested state on the item instead of feeding that mutation
// back into validation (which can otherwise leave a command disabled forever).
static char LegendConfiguredMenuEnabledKey;
static inline void LegendSetConfiguredMenuEnabled(NSMenuItem *item, NSNumber *enabled) {
  objc_setAssociatedObject(item, &LegendConfiguredMenuEnabledKey, enabled, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  if (enabled) item.enabled = enabled.boolValue;
}
static inline BOOL LegendValidateConfiguredMenuItem(NSMenuItem *item) {
  NSNumber *enabled = objc_getAssociatedObject(item, &LegendConfiguredMenuEnabledKey);
  return enabled ? enabled.boolValue : item.enabled;
}
