#import "RNSidebar.h"

#import <react/renderer/components/RNSidebarSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNSidebarSpec/EventEmitters.h>
#import <react/renderer/components/RNSidebarSpec/Props.h>
#import <react/renderer/components/RNSidebarSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if TARGET_OS_OSX
static NSUserInterfaceItemIdentifier const RNSidebarColumnIdentifier = @"RNSidebarColumn";
static NSUserInterfaceItemIdentifier const RNSidebarDataCellIdentifier = @"RNSidebarDataCell";

@class RNSidebar;

@interface RNSidebarDataItem : NSObject
@property (nonatomic, copy) NSString *itemId;
@property (nonatomic, copy) NSString *title;
@property (nonatomic, assign) BOOL selectable;
@end

@implementation RNSidebarDataItem
@end

@interface RNSidebarRowView : NSTableRowView
@property (nonatomic, assign) BOOL contextHighlighted;
@end

@implementation RNSidebarRowView
- (void)setContextHighlighted:(BOOL)contextHighlighted
{
  _contextHighlighted = contextHighlighted;
  self.needsDisplay = YES;
}

- (void)drawRect:(NSRect)dirtyRect
{
  [super drawRect:dirtyRect];

  if (!_contextHighlighted) {
    return;
  }

  NSRect borderRect = NSInsetRect(self.bounds, 8, 1);
  NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:borderRect xRadius:6 yRadius:6];
  [[NSColor.controlAccentColor colorWithAlphaComponent:0.8] setStroke];
  path.lineWidth = 2;
  [path stroke];
}
@end

@interface RNSidebarTableView : NSTableView
@property (nonatomic, assign) BOOL rightMouseDown;
@end

@implementation RNSidebarTableView
- (BOOL)validateProposedFirstResponder:(NSResponder *)responder forEvent:(NSEvent *)event
{
  return YES;
}

- (void)rightMouseDown:(NSEvent *)event
{
  _rightMouseDown = YES;
  [self.window makeFirstResponder:self];
  [super rightMouseDown:event];
}

- (void)rightMouseUp:(NSEvent *)event
{
  [super rightMouseUp:event];
  _rightMouseDown = NO;
}
@end

@interface RNSidebarItem () <RCTSidebarItemViewProtocol>
@property (nonatomic, copy) NSString *itemId;
@property (nonatomic, assign) BOOL selectable;
@property (nonatomic, assign) CGFloat rowHeight;
@property (nonatomic, assign) BOOL autoHeight;
@property (nonatomic, assign) CGFloat measuredHeight;
@property (nonatomic, weak) RNSidebar *sidebar;
@end

@interface RNSidebar () <NSTableViewDataSource, NSTableViewDelegate, RCTSidebarViewProtocol>
- (void)sidebarItemDidChange:(RNSidebarItem *)item;
- (void)setContextHighlightedItem:(nullable RNSidebarItem *)item;
@end

#else
@interface RNSidebar () <RCTSidebarViewProtocol>
@end

@interface RNSidebarItem () <RCTSidebarItemViewProtocol>
@end
#endif

@implementation RNSidebarItem

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const SidebarItemProps>();
#if TARGET_OS_OSX
    _itemId = @"";
    _selectable = YES;
    _rowHeight = 0;
    _autoHeight = NO;
    _measuredHeight = 0;
    self.wantsLayer = YES;
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)rightMouseDown:(NSEvent *)event
{
  [_sidebar setContextHighlightedItem:_selectable ? self : nil];
  [super rightMouseDown:event];
}

- (void)rightMouseUp:(NSEvent *)event
{
  const auto eventEmitter = std::static_pointer_cast<const SidebarItemEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    NSPoint locationInWindow = event.locationInWindow;
    NSPoint locationInView = [self convertPoint:locationInWindow fromView:nil];
    CGFloat contentViewHeight = self.window.contentView.bounds.size.height;
    CGFloat pageY = contentViewHeight > 0 ? contentViewHeight - locationInWindow.y : locationInWindow.y;
    NSEventModifierFlags modifierFlags = event.modifierFlags;

    eventEmitter->onRightClick(SidebarItemEventEmitter::OnRightClick{
      .altKey = (modifierFlags & NSEventModifierFlagOption) != 0,
      .button = 2,
      .ctrlKey = (modifierFlags & NSEventModifierFlagControl) != 0,
      .metaKey = (modifierFlags & NSEventModifierFlagCommand) != 0,
      .pageX = locationInWindow.x,
      .pageY = pageY,
      .shiftKey = (modifierFlags & NSEventModifierFlagShift) != 0,
      .x = locationInView.x,
      .y = locationInView.y,
    });
  }

  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    [self.sidebar setContextHighlightedItem:nil];
  });

  [super rightMouseUp:event];
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<SidebarItemProps const>(props);

#if TARGET_OS_OSX
  _itemId = [NSString stringWithUTF8String:newProps.itemId.c_str()];
  _selectable = newProps.selectable;
  _rowHeight = newProps.rowHeight;
  _autoHeight = newProps.autoHeight;
  [_sidebar sidebarItemDidChange:self];
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

#if TARGET_OS_OSX
  CGFloat height = layoutMetrics.frame.size.height;
  if (height > 0 && fabs(height - _measuredHeight) > 0.5) {
    _measuredHeight = height;
    if (_autoHeight) {
      [_sidebar sidebarItemDidChange:self];
    }
  }

  if (_sidebar && [self.superview isKindOfClass:NSTableCellView.class]) {
    self.frame = self.superview.bounds;
  }
#endif
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

#if TARGET_OS_OSX
  _itemId = @"";
  _selectable = YES;
  _rowHeight = 0;
  _autoHeight = NO;
  _measuredHeight = 0;
  _sidebar = nil;
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SidebarItemComponentDescriptor>();
}

@end

@implementation RNSidebar {
#if TARGET_OS_OSX
  NSScrollView *_scrollView;
  RNSidebarTableView *_tableView;
  NSTableColumn *_tableColumn;
  NSMutableArray<RNSidebarItem *> *_itemViews;
  NSArray<RNSidebarDataItem *> *_dataItems;
  NSString *_selectedId;
  CGFloat _contentInsetTop;
  CGFloat _defaultRowHeight;
  NSSize _lastReportedSize;
  NSInteger _contextHighlightedRow;
  BOOL _updatingSelection;
#else
  RCTPlatformView *_placeholderView;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const SidebarProps>();

#if TARGET_OS_OSX
    _itemViews = [NSMutableArray new];
    _dataItems = @[];
    _selectedId = @"";
    _contentInsetTop = 0;
    _defaultRowHeight = 28;
    _lastReportedSize = NSZeroSize;
    _contextHighlightedRow = -1;
    self.wantsLayer = YES;
    [self setupSidebar];
#else
    _placeholderView = [RCTPlatformView new];
    self.contentView = _placeholderView;
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)setupSidebar
{
  _tableView = [RNSidebarTableView new];
  _tableView.allowsEmptySelection = YES;
  _tableView.allowsMultipleSelection = NO;
  _tableView.backgroundColor = NSColor.clearColor;
  _tableView.columnAutoresizingStyle = NSTableViewUniformColumnAutoresizingStyle;
  _tableView.dataSource = self;
  _tableView.delegate = self;
  _tableView.focusRingType = NSFocusRingTypeNone;
  _tableView.gridStyleMask = NSTableViewGridNone;
  _tableView.headerView = nil;
  _tableView.intercellSpacing = NSMakeSize(0, 0);
  _tableView.rowHeight = _defaultRowHeight;
  _tableView.usesAlternatingRowBackgroundColors = NO;

  if (@available(macOS 11.0, *)) {
    _tableView.style = NSTableViewStyleSourceList;
  }

  _tableColumn = [[NSTableColumn alloc] initWithIdentifier:RNSidebarColumnIdentifier];
  _tableColumn.resizingMask = NSTableColumnAutoresizingMask;
  [_tableView addTableColumn:_tableColumn];

  _scrollView = [NSScrollView new];
  _scrollView.autohidesScrollers = YES;
  _scrollView.backgroundColor = NSColor.clearColor;
  _scrollView.borderType = NSNoBorder;
  _scrollView.documentView = _tableView;
  _scrollView.drawsBackground = NO;
  _scrollView.hasHorizontalScroller = NO;
  _scrollView.hasVerticalScroller = YES;

  [self addSubview:_scrollView];
}

- (NSArray<RNSidebarDataItem *> *)itemsFromJson:(std::string const &)json
{
  NSString *jsonString = [NSString stringWithUTF8String:json.c_str()];
  if (jsonString.length == 0) {
    return @[];
  }

  NSData *data = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![parsed isKindOfClass:NSArray.class]) {
    return @[];
  }

  NSMutableArray<RNSidebarDataItem *> *items = [NSMutableArray new];
  for (id rawItem in (NSArray *)parsed) {
    if (![rawItem isKindOfClass:NSDictionary.class]) {
      continue;
    }

    NSDictionary *dictionary = (NSDictionary *)rawItem;
    NSString *itemId = [dictionary[@"id"] isKindOfClass:NSString.class] ? dictionary[@"id"] : nil;
    NSString *title = [dictionary[@"title"] isKindOfClass:NSString.class] ? dictionary[@"title"] : nil;
    if (itemId.length == 0 || title.length == 0) {
      continue;
    }

    RNSidebarDataItem *item = [RNSidebarDataItem new];
    item.itemId = itemId;
    item.title = title;
    item.selectable = ![dictionary[@"selectable"] isKindOfClass:NSNumber.class] || [dictionary[@"selectable"] boolValue];
    [items addObject:item];
  }

  return items;
}

- (BOOL)usesReactChildren
{
  return _itemViews.count > 0;
}

- (NSUInteger)itemCount
{
  return self.usesReactChildren ? _itemViews.count : _dataItems.count;
}

- (NSString *)itemIdAtRow:(NSInteger)row
{
  if (row < 0 || row >= (NSInteger)self.itemCount) {
    return @"";
  }

  return self.usesReactChildren ? _itemViews[row].itemId : _dataItems[row].itemId;
}

- (BOOL)isRowSelectable:(NSInteger)row
{
  if (row < 0 || row >= (NSInteger)self.itemCount) {
    return NO;
  }

  return self.usesReactChildren ? _itemViews[row].selectable : _dataItems[row].selectable;
}

- (void)reloadRows
{
  _tableView.rowHeight = _defaultRowHeight;
  [_tableView reloadData];
  [self updateSelection];
  [self setNeedsLayout:YES];
}

- (void)sidebarItemDidChange:(RNSidebarItem *)item
{
  if (![_itemViews containsObject:item]) {
    return;
  }

  [self reloadRows];
}

- (void)setContextHighlightedItem:(RNSidebarItem *)item
{
  NSInteger row = item ? [_itemViews indexOfObject:item] : NSNotFound;
  NSInteger nextRow = row == NSNotFound ? -1 : row;
  NSInteger previousRow = _contextHighlightedRow;
  _contextHighlightedRow = nextRow;

  if (previousRow >= 0) {
    RNSidebarRowView *previousRowView = (RNSidebarRowView *)[_tableView rowViewAtRow:previousRow makeIfNecessary:NO];
    if ([previousRowView isKindOfClass:RNSidebarRowView.class]) {
      previousRowView.contextHighlighted = NO;
    }
  }

  if (nextRow >= 0) {
    RNSidebarRowView *nextRowView = (RNSidebarRowView *)[_tableView rowViewAtRow:nextRow makeIfNecessary:NO];
    if ([nextRowView isKindOfClass:RNSidebarRowView.class]) {
      nextRowView.contextHighlighted = YES;
    }
  }
}

- (void)updateSelection
{
  if (_updatingSelection) {
    return;
  }

  NSInteger selectedRow = -1;
  for (NSUInteger index = 0; index < self.itemCount; index += 1) {
    if ([[self itemIdAtRow:(NSInteger)index] isEqualToString:_selectedId]) {
      selectedRow = (NSInteger)index;
      break;
    }
  }

  _updatingSelection = YES;
  if (selectedRow >= 0) {
    [_tableView selectRowIndexes:[NSIndexSet indexSetWithIndex:selectedRow] byExtendingSelection:NO];
    [_tableView scrollRowToVisible:selectedRow];
  } else {
    [_tableView deselectAll:nil];
  }
  _updatingSelection = NO;
}

- (void)reportLayoutIfNeeded
{
  if (self.bounds.size.width <= 0 || self.bounds.size.height <= 0) {
    return;
  }

  if (NSEqualSizes(_lastReportedSize, self.bounds.size)) {
    return;
  }

  _lastReportedSize = self.bounds.size;
  const auto eventEmitter = std::static_pointer_cast<const SidebarEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onSidebarLayout(SidebarEventEmitter::OnSidebarLayout{
      .height = self.bounds.size.height,
      .width = self.bounds.size.width,
    });
  }
}

- (void)mountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  if ([childComponentView isKindOfClass:RNSidebarItem.class]) {
    RNSidebarItem *item = (RNSidebarItem *)childComponentView;
    item.sidebar = self;
    NSUInteger safeIndex = MIN((NSUInteger)MAX(index, 0), _itemViews.count);
    [_itemViews insertObject:item atIndex:safeIndex];
    [self reloadRows];
    return;
  }

  [super mountChildComponentView:childComponentView index:index];
}

- (void)unmountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  if ([childComponentView isKindOfClass:RNSidebarItem.class]) {
    RNSidebarItem *item = (RNSidebarItem *)childComponentView;
    [item removeFromSuperview];
    item.sidebar = nil;
    [_itemViews removeObject:item];
    [self reloadRows];
    return;
  }

  [super unmountChildComponentView:childComponentView index:index];
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView
{
  return (NSInteger)self.itemCount;
}

- (CGFloat)tableView:(NSTableView *)tableView heightOfRow:(NSInteger)row
{
  if (!self.usesReactChildren || row < 0 || row >= (NSInteger)_itemViews.count) {
    return _defaultRowHeight;
  }

  RNSidebarItem *item = _itemViews[row];
  if (item.rowHeight > 0) {
    return item.rowHeight;
  }

  if (item.autoHeight) {
    if (item.measuredHeight > 0) {
      return item.measuredHeight;
    }

    if (item.frame.size.height > 0) {
      return item.frame.size.height;
    }
  }

  return _defaultRowHeight;
}

- (NSView *)tableView:(NSTableView *)tableView
   viewForTableColumn:(NSTableColumn *)tableColumn
                  row:(NSInteger)row
{
  if (row < 0 || row >= (NSInteger)self.itemCount) {
    return nil;
  }

  if (self.usesReactChildren) {
    NSTableCellView *cell = [NSTableCellView new];
    RNSidebarItem *item = _itemViews[row];
    [item removeFromSuperview];
    item.frame = cell.bounds;
    item.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [cell addSubview:item];
    return cell;
  }

  NSTableCellView *cell = [tableView makeViewWithIdentifier:RNSidebarDataCellIdentifier owner:self];
  if (!cell) {
    cell = [NSTableCellView new];
    cell.identifier = RNSidebarDataCellIdentifier;

    NSTextField *textField = [NSTextField labelWithString:@""];
    textField.autoresizingMask = NSViewWidthSizable;
    textField.font = [NSFont systemFontOfSize:13 weight:NSFontWeightRegular];
    textField.frame = NSMakeRect(12, 4, 180, MAX(0, _defaultRowHeight - 8));
    textField.lineBreakMode = NSLineBreakByTruncatingTail;
    textField.textColor = NSColor.labelColor;

    cell.textField = textField;
    [cell addSubview:textField];
  }

  RNSidebarDataItem *item = _dataItems[row];
  cell.textField.stringValue = item.title;
  cell.textField.frame = NSMakeRect(12, 4, MAX(0, tableView.bounds.size.width - 20), MAX(0, _defaultRowHeight - 8));
  return cell;
}

- (BOOL)tableView:(NSTableView *)tableView shouldSelectRow:(NSInteger)row
{
  if (_tableView.rightMouseDown) {
    return NO;
  }

  return [self isRowSelectable:row];
}

- (NSTableRowView *)tableView:(NSTableView *)tableView rowViewForRow:(NSInteger)row
{
  RNSidebarRowView *rowView = [RNSidebarRowView new];
  rowView.contextHighlighted = row == _contextHighlightedRow;
  return rowView;
}

- (void)tableViewSelectionDidChange:(NSNotification *)notification
{
  if (_updatingSelection) {
    return;
  }

  NSInteger row = _tableView.selectedRow;
  if (row < 0 || row >= (NSInteger)self.itemCount) {
    return;
  }

  _selectedId = [self itemIdAtRow:row];
  const auto eventEmitter = std::static_pointer_cast<const SidebarEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onSidebarSelectionChange(SidebarEventEmitter::OnSidebarSelectionChange{
      .id = std::string(_selectedId.UTF8String),
    });
  }
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<SidebarProps const>(props);

#if TARGET_OS_OSX
  _contentInsetTop = newProps.contentInsetTop;
  _defaultRowHeight = newProps.defaultRowHeight > 0 ? newProps.defaultRowHeight : 28;
  _dataItems = [self itemsFromJson:newProps.itemsJson];
  _selectedId = [NSString stringWithUTF8String:newProps.selectedId.c_str()];
  _scrollView.contentInsets = NSEdgeInsetsMake(_contentInsetTop, 0, 0, 0);
  [self reloadRows];
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

- (void)layoutSubviews
{
  [super layoutSubviews];

#if TARGET_OS_OSX
  _scrollView.frame = self.bounds;
  _tableColumn.width = self.bounds.size.width;
  [_tableView tile];
  [self reportLayoutIfNeeded];
#else
  _placeholderView.frame = self.bounds;
#endif
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

#if TARGET_OS_OSX
  for (RNSidebarItem *item in _itemViews) {
    [item removeFromSuperview];
    item.sidebar = nil;
  }
  [_itemViews removeAllObjects];
  _dataItems = @[];
  _selectedId = @"";
  _contentInsetTop = 0;
  _defaultRowHeight = 28;
  _lastReportedSize = NSZeroSize;
  _contextHighlightedRow = -1;
  _updatingSelection = NO;
  _scrollView.contentInsets = NSEdgeInsetsZero;
  [self reloadRows];
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SidebarComponentDescriptor>();
}

@end
