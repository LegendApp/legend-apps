#import "RNTextInputSearch.h"

#import <react/renderer/components/RNTextInputSearchSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNTextInputSearchSpec/EventEmitters.h>
#import <react/renderer/components/RNTextInputSearchSpec/Props.h>
#import <react/renderer/components/RNTextInputSearchSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if TARGET_OS_OSX
@interface RNTextInputSearchField : NSSearchField
@end

static NSAppearance *RNTextInputSearchAppearanceForName(NSString *appearanceName)
{
  if ([appearanceName isEqualToString:@"light"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameAqua];
  }

  if ([appearanceName isEqualToString:@"dark"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  }

  return nil;
}

@implementation RNTextInputSearchField
- (BOOL)performKeyEquivalent:(NSEvent *)event
{
  if (event.keyCode == 126 || event.keyCode == 125) {
    return YES;
  }
  return [super performKeyEquivalent:event];
}

- (void)keyDown:(NSEvent *)event
{
  if (event.keyCode == 126 || event.keyCode == 125) {
    return;
  }
  [super keyDown:event];
}
@end
#endif

@interface RNTextInputSearch () <
#if TARGET_OS_OSX
  NSSearchFieldDelegate,
#endif
  RCTTextInputSearchViewProtocol
>
@end

@implementation RNTextInputSearch {
#if TARGET_OS_OSX
  RNTextInputSearchField *_textField;
  BOOL _hasSetDefaultText;
#else
  UIView *_textField;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const TextInputSearchProps>();
#if TARGET_OS_OSX
    _textField = [RNTextInputSearchField new];
    _textField.delegate = self;
    _textField.focusRingType = NSFocusRingTypeNone;
    _textField.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_textField];
#else
    _textField = [UIView new];
    [self addSubview:_textField];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)controlTextDidChange:(NSNotification *)notification
{
  if (notification.object != _textField) {
    return;
  }
  const auto eventEmitter = std::static_pointer_cast<const TextInputSearchEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onChangeText(TextInputSearchEventEmitter::OnChangeText{
      .text = _textField.stringValue.UTF8String ?: "",
    });
  }
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<TextInputSearchProps const>(props);
#if TARGET_OS_OSX
  NSString *appearanceName = [NSString stringWithUTF8String:newProps.appearance.c_str()];
  NSAppearance *appearance = RNTextInputSearchAppearanceForName(appearanceName);
  self.appearance = appearance;
  _textField.appearance = appearance;

  NSString *placeholder = [NSString stringWithUTF8String:newProps.placeholder.c_str()];
  _textField.placeholderString = placeholder;

  if (!_hasSetDefaultText && !newProps.defaultText.empty()) {
    _textField.stringValue = [NSString stringWithUTF8String:newProps.defaultText.c_str()];
    _hasSetDefaultText = YES;
  }

  if (!newProps.text.empty()) {
    NSString *text = [NSString stringWithUTF8String:newProps.text.c_str()];
    if (![_textField.stringValue isEqualToString:text]) {
      _textField.stringValue = text;
    }
  }
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTTextInputSearchHandleCommand(self, commandName, args);
}

- (void)focus
{
#if TARGET_OS_OSX
  [self.window makeFirstResponder:_textField];
#endif
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _textField.stringValue = @"";
  _textField.placeholderString = @"";
  _hasSetDefaultText = NO;
#endif
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _textField.frame = self.bounds;
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<TextInputSearchComponentDescriptor>();
}

@end
