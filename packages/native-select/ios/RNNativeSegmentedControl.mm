#import "RNNativeSegmentedControl.h"

#import <react/renderer/components/RNNativeSelectSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNNativeSelectSpec/EventEmitters.h>
#import <react/renderer/components/RNNativeSelectSpec/Props.h>
#import <react/renderer/components/RNNativeSelectSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNNativeSegmentedControl () <RCTNativeSegmentedControlViewProtocol>
@end

@implementation RNNativeSegmentedControl {
#if TARGET_OS_OSX
  NSSegmentedControl *_segmentedControl;
  NSArray<NSString *> *_values;
  NSString *_segmentsJson;
  NSString *_value;
  BOOL _isUpdatingSelection;
#else
  UIView *_segmentedControl;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const NativeSegmentedControlProps>();
#if TARGET_OS_OSX
    _values = @[];
    _segmentsJson = @"";
    _value = @"";
    _segmentedControl = [[NSSegmentedControl alloc] initWithFrame:NSZeroRect];
    _segmentedControl.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _segmentedControl.controlSize = NSControlSizeRegular;
    _segmentedControl.segmentStyle = NSSegmentStyleAutomatic;
    _segmentedControl.trackingMode = NSSegmentSwitchTrackingSelectOne;
    _segmentedControl.target = self;
    _segmentedControl.action = @selector(handleSelectionChange:);
    [self addSubview:_segmentedControl];
#else
    _segmentedControl = [UIView new];
    [self addSubview:_segmentedControl];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (NSArray<NSDictionary *> *)parseSegmentsJson:(NSString *)segmentsJson
{
  NSData *data = [segmentsJson dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @[];
  }

  id parsedSegments = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [parsedSegments isKindOfClass:NSArray.class] ? parsedSegments : @[];
}

- (void)reloadSegments:(NSArray<NSDictionary *> *)segments
{
  NSMutableArray<NSString *> *values = [NSMutableArray new];
  NSMutableArray<NSString *> *labels = [NSMutableArray new];

  for (NSDictionary *segment in segments) {
    if (![segment isKindOfClass:NSDictionary.class]) {
      continue;
    }

    NSString *label = [segment[@"label"] isKindOfClass:NSString.class] ? segment[@"label"] : @"";
    NSString *value = [segment[@"value"] isKindOfClass:NSString.class] ? segment[@"value"] : label;
    if (label.length == 0 && value.length == 0) {
      continue;
    }

    [labels addObject:label.length > 0 ? label : value];
    [values addObject:value.length > 0 ? value : label];
  }

  _values = values;
  _segmentedControl.segmentCount = labels.count;

  CGFloat totalWidth = 0;
  NSFont *font = _segmentedControl.font ?: [NSFont systemFontOfSize:[NSFont systemFontSize]];
  for (NSInteger index = 0; index < labels.count; index += 1) {
    NSString *label = labels[index];
    [_segmentedControl setLabel:label forSegment:index];
    CGFloat segmentWidth = MAX(64, [label sizeWithAttributes:@{NSFontAttributeName: font}].width + 28);
    [_segmentedControl setWidth:segmentWidth forSegment:index];
    totalWidth += segmentWidth;
  }

  CGRect frame = _segmentedControl.frame;
  frame.size.width = totalWidth;
  frame.size.height = MAX(28, _segmentedControl.fittingSize.height);
  _segmentedControl.frame = frame;
}

- (void)selectValue:(NSString *)value
{
  _isUpdatingSelection = YES;
  NSInteger selectedIndex = -1;
  for (NSInteger index = 0; index < _values.count; index += 1) {
    if ([_values[index] isEqualToString:value]) {
      selectedIndex = index;
      break;
    }
  }

  _segmentedControl.selectedSegment = selectedIndex >= 0 ? selectedIndex : (_values.count > 0 ? 0 : -1);
  _isUpdatingSelection = NO;
}

- (void)handleSelectionChange:(id)sender
{
  if (_isUpdatingSelection) {
    return;
  }

  NSInteger selectedIndex = _segmentedControl.selectedSegment;
  NSString *value = selectedIndex >= 0 && selectedIndex < _values.count ? _values[selectedIndex] : @"";
  _value = value ?: @"";

  const auto eventEmitter = std::static_pointer_cast<const NativeSegmentedControlEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onValueChange(NativeSegmentedControlEventEmitter::OnValueChange{.value = _value.UTF8String ?: ""});
  }
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<NativeSegmentedControlProps const>(props);
#if TARGET_OS_OSX
  NSString *nextSegmentsJson = [NSString stringWithUTF8String:newProps.segmentsJson.c_str()];
  NSString *nextValue = [NSString stringWithUTF8String:newProps.value.c_str()];
  BOOL segmentsDidChange = ![_segmentsJson isEqualToString:nextSegmentsJson];

  if (segmentsDidChange) {
    _segmentsJson = nextSegmentsJson;
    [self reloadSegments:[self parseSegmentsJson:_segmentsJson]];
  }

  if (segmentsDidChange || ![_value isEqualToString:nextValue]) {
    _value = nextValue;
    [self selectValue:_value];
  }

  _segmentedControl.enabled = newProps.enabled;
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _values = @[];
  _segmentsJson = @"";
  _value = @"";
  _isUpdatingSelection = NO;
  _segmentedControl.segmentCount = 0;
  _segmentedControl.enabled = YES;
#endif
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _segmentedControl.frame = self.bounds;
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<NativeSegmentedControlComponentDescriptor>();
}

@end
