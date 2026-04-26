#import "RNAppKitSplitViewComponent.h"

#import <react/renderer/components/RNAppKitSplitViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/Props.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if TARGET_OS_OSX
static NSToolbarItemIdentifier const RNAppKitSplitViewTrackingSeparatorIdentifier =
  @"RNAppKitSplitViewTrackingSeparator";
static NSString *const RNAppKitSplitViewTitlebarItemPrefix =
  @"RNAppKitSplitViewTitlebarItem.";
static NSUserInterfaceItemIdentifier const RNAppKitSplitViewSidebarColumnIdentifier =
  @"RNAppKitSplitViewSidebarColumn";
static NSUserInterfaceItemIdentifier const RNAppKitSplitViewSidebarCellIdentifier =
  @"RNAppKitSplitViewSidebarCell";
@interface RNAppKitSplitViewComponent () <
  NSTableViewDataSource,
  NSTableViewDelegate,
  NSToolbarDelegate,
  RCTAppKitSplitViewViewProtocol
>
@end
#else
@interface RNAppKitSplitViewComponent () <RCTAppKitSplitViewViewProtocol>
@end
#endif

@implementation RNAppKitSplitViewComponent {
#if TARGET_OS_OSX
  NSSplitViewController *_splitViewController;
  NSViewController *_sidebarViewController;
  NSViewController *_mainViewController;
  NSSplitViewItem *_sidebarSplitViewItem;
  NSSplitViewItem *_mainSplitViewItem;
  NSView *_sidebarContentView;
  NSView *_mainContentView;
  NSTextField *_sidebarLabel;
  NSTextField *_mainLabel;
  NSScrollView *_sidebarScrollView;
  NSTableView *_sidebarTableView;
  NSArray<NSDictionary<NSString *, NSString *> *> *_sidebarItems;
  NSArray<NSDictionary<NSString *, NSString *> *> *_titlebarItems;
  NSString *_selectedSidebarItemId;
  BOOL _usesLiquidGlass;
#else
  UILabel *_sidebarLabel;
  UILabel *_mainLabel;
#endif
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = std::make_shared<const AppKitSplitViewProps>();

#if TARGET_OS_OSX
    _splitViewController = [NSSplitViewController new];
    _splitViewController.splitView.dividerStyle = NSSplitViewDividerStyleThin;
    _splitViewController.splitView.vertical = YES;
    _splitViewController.view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    _sidebarLabel = [self makeLabel:@"Sidebar"];
    _mainLabel = [self makeLabel:@"Main Content"];
    _sidebarItems = @[];
    _titlebarItems = @[];
    _selectedSidebarItemId = @"";

    [self addSubview:_splitViewController.view];
    [self rebuildPanelsWithLiquidGlass:NO];
#else
    _sidebarLabel = [UILabel new];
    _sidebarLabel.text = @"Sidebar";
    _mainLabel = [UILabel new];
    _mainLabel.text = @"Main Content";
    [self addSubview:_sidebarLabel];
    [self addSubview:_mainLabel];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (void)rebuildPanelsWithLiquidGlass:(BOOL)usesLiquidGlass
{
  [_sidebarLabel removeFromSuperview];
  [_mainLabel removeFromSuperview];
  [_sidebarScrollView removeFromSuperview];
  _sidebarScrollView = nil;
  _sidebarTableView = nil;
  _splitViewController.splitViewItems = @[];

  _usesLiquidGlass = usesLiquidGlass;

  _sidebarContentView = [self makeContentViewWithSidebar:YES usesLiquidGlass:usesLiquidGlass];
  _mainContentView = [self makeContentViewWithSidebar:NO usesLiquidGlass:usesLiquidGlass];
  _sidebarViewController = [NSViewController new];
  _mainViewController = [NSViewController new];
  _sidebarViewController.view = _sidebarContentView;
  _mainViewController.view = _mainContentView;

  _sidebarSplitViewItem = usesLiquidGlass
    ? [NSSplitViewItem sidebarWithViewController:_sidebarViewController]
    : [NSSplitViewItem splitViewItemWithViewController:_sidebarViewController];
  _mainSplitViewItem = [NSSplitViewItem splitViewItemWithViewController:_mainViewController];

  _sidebarSplitViewItem.minimumThickness = 180;
  _sidebarSplitViewItem.maximumThickness = 320;
  _sidebarSplitViewItem.preferredThicknessFraction = 0.22;

  if (@available(macOS 11.0, *)) {
    _sidebarSplitViewItem.allowsFullHeightLayout = usesLiquidGlass;
    _sidebarSplitViewItem.titlebarSeparatorStyle = usesLiquidGlass
      ? NSTitlebarSeparatorStyleNone
      : NSTitlebarSeparatorStyleAutomatic;
    _mainSplitViewItem.titlebarSeparatorStyle = NSTitlebarSeparatorStyleAutomatic;
  }

  if (@available(macOS 26.0, *)) {
    _mainSplitViewItem.automaticallyAdjustsSafeAreaInsets = usesLiquidGlass;
  }

  [_sidebarContentView addSubview:_sidebarLabel];
  [self addSidebarItemsListToView:_sidebarContentView];
  [_mainContentView addSubview:_mainLabel];
  [_splitViewController addSplitViewItem:_sidebarSplitViewItem];
  [_splitViewController addSplitViewItem:_mainSplitViewItem];

  [self updateWindowToolbarForLiquidGlassSidebar];
  [self setNeedsLayout:YES];
}

- (NSView *)makeContentViewWithSidebar:(BOOL)isSidebar usesLiquidGlass:(BOOL)usesLiquidGlass
{
  if (!usesLiquidGlass && isSidebar) {
    NSVisualEffectView *view = [NSVisualEffectView new];
    view.material = NSVisualEffectMaterialSidebar;
    view.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    view.state = NSVisualEffectStateActive;
    view.wantsLayer = YES;
    return view;
  }

  NSView *view = [NSView new];
  view.wantsLayer = YES;
  view.layer.backgroundColor = isSidebar ? NSColor.clearColor.CGColor : NSColor.windowBackgroundColor.CGColor;
  return view;
}

- (NSTextField *)makeLabel:(NSString *)text
{
  NSTextField *label = [NSTextField labelWithString:text];
  label.alignment = NSTextAlignmentCenter;
  label.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  label.textColor = NSColor.labelColor;
  label.font = [NSFont systemFontOfSize:18 weight:NSFontWeightSemibold];
  return label;
}

- (void)addSidebarItemsListToView:(NSView *)view
{
  _sidebarTableView = [NSTableView new];
  _sidebarTableView.allowsEmptySelection = YES;
  _sidebarTableView.backgroundColor = NSColor.clearColor;
  _sidebarTableView.dataSource = self;
  _sidebarTableView.delegate = self;
  _sidebarTableView.focusRingType = NSFocusRingTypeNone;
  _sidebarTableView.headerView = nil;
  _sidebarTableView.intercellSpacing = NSMakeSize(0, 2);
  _sidebarTableView.rowHeight = 28;
  _sidebarTableView.selectionHighlightStyle = NSTableViewSelectionHighlightStyleSourceList;

  if (@available(macOS 11.0, *)) {
    _sidebarTableView.style = NSTableViewStyleSourceList;
  }

  NSTableColumn *column = [[NSTableColumn alloc] initWithIdentifier:RNAppKitSplitViewSidebarColumnIdentifier];
  column.resizingMask = NSTableColumnAutoresizingMask;
  [_sidebarTableView addTableColumn:column];

  _sidebarScrollView = [NSScrollView new];
  _sidebarScrollView.autohidesScrollers = YES;
  _sidebarScrollView.backgroundColor = NSColor.clearColor;
  _sidebarScrollView.borderType = NSNoBorder;
  _sidebarScrollView.documentView = _sidebarTableView;
  _sidebarScrollView.drawsBackground = NO;
  _sidebarScrollView.hasHorizontalScroller = NO;
  _sidebarScrollView.hasVerticalScroller = NO;

  [view addSubview:_sidebarScrollView];
  [self reloadSidebarItems];
}

- (NSArray<NSDictionary<NSString *, NSString *> *> *)sidebarItemsFromJson:(std::string const &)json
{
  NSString *jsonString = [NSString stringWithUTF8String:json.c_str()];
  if (jsonString.length == 0) {
    return @[];
  }

  NSData *data = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
  if (![parsed isKindOfClass:NSArray.class]) {
    return @[];
  }

  NSMutableArray<NSDictionary<NSString *, NSString *> *> *items = [NSMutableArray new];
  for (id rawItem in (NSArray *)parsed) {
    if (![rawItem isKindOfClass:NSDictionary.class]) {
      continue;
    }

    NSDictionary *rawDictionary = (NSDictionary *)rawItem;
    NSString *itemId = [rawDictionary[@"id"] isKindOfClass:NSString.class] ? rawDictionary[@"id"] : nil;
    NSString *title = [rawDictionary[@"title"] isKindOfClass:NSString.class] ? rawDictionary[@"title"] : nil;
    NSString *symbolName = [rawDictionary[@"symbolName"] isKindOfClass:NSString.class] ? rawDictionary[@"symbolName"] : @"";
    if (itemId.length == 0 || title.length == 0) {
      continue;
    }

    [items addObject:@{
      @"id": itemId,
      @"title": title,
      @"symbolName": symbolName,
    }];
  }

  return items;
}

- (NSArray<NSDictionary<NSString *, NSString *> *> *)titlebarItemsFromJson:(std::string const &)json
{
  NSString *jsonString = [NSString stringWithUTF8String:json.c_str()];
  if (jsonString.length == 0) {
    return @[];
  }

  NSData *data = [jsonString dataUsingEncoding:NSUTF8StringEncoding];
  NSError *error = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
  if (![parsed isKindOfClass:NSArray.class]) {
    return @[];
  }

  NSMutableArray<NSDictionary<NSString *, NSString *> *> *items = [NSMutableArray new];
  for (id rawItem in (NSArray *)parsed) {
    if (![rawItem isKindOfClass:NSDictionary.class]) {
      continue;
    }

    NSDictionary *rawDictionary = (NSDictionary *)rawItem;
    NSString *itemId = [rawDictionary[@"id"] isKindOfClass:NSString.class] ? rawDictionary[@"id"] : nil;
    NSString *title = [rawDictionary[@"title"] isKindOfClass:NSString.class] ? rawDictionary[@"title"] : nil;
    NSString *symbolName = [rawDictionary[@"symbolName"] isKindOfClass:NSString.class] ? rawDictionary[@"symbolName"] : @"";
    NSString *placement = [rawDictionary[@"placement"] isKindOfClass:NSString.class] ? rawDictionary[@"placement"] : @"leading";
    if (itemId.length == 0 || title.length == 0) {
      continue;
    }

    [items addObject:@{
      @"id": itemId,
      @"title": title,
      @"symbolName": symbolName,
      @"placement": [placement isEqualToString:@"trailing"] ? @"trailing" : @"leading",
    }];
  }

  return items;
}

- (void)reloadSidebarItems
{
  if (!_sidebarTableView) {
    return;
  }

  [_sidebarTableView reloadData];

  NSInteger selectedIndex = [self selectedSidebarItemIndex];
  if (selectedIndex >= 0) {
    [_sidebarTableView selectRowIndexes:[NSIndexSet indexSetWithIndex:selectedIndex] byExtendingSelection:NO];
  }

  [self setNeedsLayout:YES];
}

- (NSInteger)selectedSidebarItemIndex
{
  for (NSUInteger index = 0; index < _sidebarItems.count; index += 1) {
    if ([_sidebarItems[index][@"id"] isEqualToString:_selectedSidebarItemId]) {
      return (NSInteger)index;
    }
  }

  return -1;
}

- (NSInteger)numberOfRowsInTableView:(NSTableView *)tableView
{
  return _sidebarItems.count;
}

- (NSView *)tableView:(NSTableView *)tableView
   viewForTableColumn:(NSTableColumn *)tableColumn
                  row:(NSInteger)row
{
  if (row < 0 || row >= _sidebarItems.count) {
    return nil;
  }

  NSTableCellView *cell = [tableView makeViewWithIdentifier:RNAppKitSplitViewSidebarCellIdentifier owner:self];
  if (!cell) {
    cell = [NSTableCellView new];
    cell.identifier = RNAppKitSplitViewSidebarCellIdentifier;

    NSImageView *imageView = [[NSImageView alloc] initWithFrame:NSMakeRect(6, 6, 16, 16)];
    imageView.imageScaling = NSImageScaleProportionallyDown;
    imageView.symbolConfiguration = [NSImageSymbolConfiguration configurationWithPointSize:14 weight:NSFontWeightMedium];
    imageView.autoresizingMask = NSViewMaxXMargin;

    NSTextField *textField = [NSTextField labelWithString:@""];
    textField.autoresizingMask = NSViewWidthSizable;
    textField.font = [NSFont systemFontOfSize:13 weight:NSFontWeightMedium];
    textField.frame = NSMakeRect(30, 4, 180, 20);
    textField.lineBreakMode = NSLineBreakByTruncatingTail;
    textField.textColor = NSColor.labelColor;

    cell.imageView = imageView;
    cell.textField = textField;
    [cell addSubview:imageView];
    [cell addSubview:textField];
  }

  NSDictionary<NSString *, NSString *> *item = _sidebarItems[row];
  cell.textField.stringValue = item[@"title"] ?: @"";
  cell.textField.frame = NSMakeRect(30, 4, MAX(0, tableView.bounds.size.width - 38), 20);

  NSString *symbolName = item[@"symbolName"] ?: @"";
  cell.imageView.image = symbolName.length > 0
    ? [NSImage imageWithSystemSymbolName:symbolName accessibilityDescription:item[@"title"]]
    : nil;

  return cell;
}

- (void)tableViewSelectionDidChange:(NSNotification *)notification
{
  NSInteger selectedRow = _sidebarTableView.selectedRow;
  if (selectedRow >= 0 && selectedRow < _sidebarItems.count) {
    _selectedSidebarItemId = _sidebarItems[selectedRow][@"id"];
  }
}

- (void)viewDidMoveToWindow
{
  [super viewDidMoveToWindow];
  [self updateWindowToolbarForLiquidGlassSidebar];
}

- (void)updateWindowToolbarForLiquidGlassSidebar
{
  NSWindow *window = self.window;
  if (!window) {
    return;
  }

  NSToolbar *toolbar = window.toolbar ?: [[NSToolbar alloc] initWithIdentifier:@"LegendAppShellToolbar"];
  toolbar.delegate = self;
  toolbar.displayMode = NSToolbarDisplayModeIconOnly;
  toolbar.allowsUserCustomization = NO;
  toolbar.autosavesConfiguration = NO;
  toolbar.showsBaselineSeparator = NO;
  window.toolbar = toolbar;

  BOOL hidesTitle = _usesLiquidGlass || _titlebarItems.count > 0;
  window.titleVisibility = hidesTitle ? NSWindowTitleHidden : NSWindowTitleVisible;

  if (_usesLiquidGlass) {
    window.styleMask = window.styleMask | NSWindowStyleMaskFullSizeContentView;
    window.titlebarAppearsTransparent = YES;
  }

  if (@available(macOS 11.0, *)) {
    window.toolbarStyle = NSWindowToolbarStyleUnified;
  }

  [self reloadWindowToolbarItems:toolbar];
}

- (NSString *)toolbarIdentifierForTitlebarItem:(NSDictionary<NSString *, NSString *> *)item
{
  return [RNAppKitSplitViewTitlebarItemPrefix stringByAppendingString:item[@"id"] ?: @""];
}

- (NSDictionary<NSString *, NSString *> *)titlebarItemForToolbarIdentifier:(NSToolbarItemIdentifier)itemIdentifier
{
  for (NSDictionary<NSString *, NSString *> *item in _titlebarItems) {
    if ([[self toolbarIdentifierForTitlebarItem:item] isEqualToString:itemIdentifier]) {
      return item;
    }
  }

  return nil;
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarItemIdentifiers
{
  NSMutableArray<NSToolbarItemIdentifier> *identifiers = [NSMutableArray new];

  if (_usesLiquidGlass) {
    [identifiers addObject:RNAppKitSplitViewTrackingSeparatorIdentifier];
  }

  for (NSDictionary<NSString *, NSString *> *item in _titlebarItems) {
    if (![item[@"placement"] isEqualToString:@"trailing"]) {
      [identifiers addObject:[self toolbarIdentifierForTitlebarItem:item]];
    }
  }

  if (_titlebarItems.count > 0) {
    [identifiers addObject:NSToolbarFlexibleSpaceItemIdentifier];
  }

  for (NSDictionary<NSString *, NSString *> *item in _titlebarItems) {
    if ([item[@"placement"] isEqualToString:@"trailing"]) {
      [identifiers addObject:[self toolbarIdentifierForTitlebarItem:item]];
    }
  }

  return identifiers;
}

- (void)reloadWindowToolbarItems:(NSToolbar *)toolbar
{
  while (toolbar.items.count > 0) {
    [toolbar removeItemAtIndex:toolbar.items.count - 1];
  }

  NSArray<NSToolbarItemIdentifier> *identifiers = [self toolbarItemIdentifiers];
  for (NSUInteger index = 0; index < identifiers.count; index += 1) {
    [toolbar insertItemWithItemIdentifier:identifiers[index] atIndex:index];
  }
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarAllowedItemIdentifiers:(NSToolbar *)toolbar
{
  NSMutableArray<NSToolbarItemIdentifier> *identifiers = [[self toolbarItemIdentifiers] mutableCopy];
  if (![identifiers containsObject:NSToolbarFlexibleSpaceItemIdentifier]) {
    [identifiers addObject:NSToolbarFlexibleSpaceItemIdentifier];
  }
  return identifiers;
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarDefaultItemIdentifiers:(NSToolbar *)toolbar
{
  return [self toolbarItemIdentifiers];
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarSelectableItemIdentifiers:(NSToolbar *)toolbar
{
  return @[];
}

- (NSToolbarItem *)toolbar:(NSToolbar *)toolbar
     itemForItemIdentifier:(NSToolbarItemIdentifier)itemIdentifier
 willBeInsertedIntoToolbar:(BOOL)flag
{
  if ([itemIdentifier isEqualToString:RNAppKitSplitViewTrackingSeparatorIdentifier]) {
    if (@available(macOS 11.0, *)) {
      return [NSTrackingSeparatorToolbarItem
        trackingSeparatorToolbarItemWithIdentifier:itemIdentifier
                                       splitView:_splitViewController.splitView
                                    dividerIndex:0];
    }
  }

  NSDictionary<NSString *, NSString *> *titlebarItem = [self titlebarItemForToolbarIdentifier:itemIdentifier];
  if (titlebarItem) {
    NSToolbarItem *toolbarItem = [[NSToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
    toolbarItem.label = titlebarItem[@"title"] ?: @"";
    toolbarItem.paletteLabel = titlebarItem[@"title"] ?: @"";
    toolbarItem.toolTip = titlebarItem[@"title"] ?: @"";
    toolbarItem.target = self;
    toolbarItem.action = @selector(titlebarItemPressed:);

    NSString *symbolName = titlebarItem[@"symbolName"] ?: @"";
    if (symbolName.length > 0) {
      toolbarItem.image = [NSImage imageWithSystemSymbolName:symbolName accessibilityDescription:titlebarItem[@"title"]];
    }

    if (@available(macOS 11.0, *)) {
      toolbarItem.bordered = YES;
    }

    return toolbarItem;
  }

  return nil;
}

- (void)titlebarItemPressed:(NSToolbarItem *)sender
{
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<AppKitSplitViewProps const>(props);

#if TARGET_OS_OSX
  if (newProps.usesLiquidGlass != _usesLiquidGlass) {
    [self rebuildPanelsWithLiquidGlass:newProps.usesLiquidGlass];
  }

  _sidebarItems = [self sidebarItemsFromJson:newProps.sidebarItemsJson];
  _titlebarItems = [self titlebarItemsFromJson:newProps.titlebarItemsJson];
  _selectedSidebarItemId = [NSString stringWithUTF8String:newProps.selectedSidebarItemId.c_str()];
  _sidebarLabel.stringValue = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.stringValue = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
  [self reloadSidebarItems];
  [self updateWindowToolbarForLiquidGlassSidebar];
#else
  _sidebarLabel.text = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.text = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
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
  _splitViewController.view.frame = self.bounds;
  CGFloat sidebarWidth = MIN(280, MAX(180, self.bounds.size.width * 0.28));
  [_splitViewController.splitView setPosition:sidebarWidth ofDividerAtIndex:0];
  [_splitViewController.splitView layoutSubtreeIfNeeded];

  CGFloat sidebarTopInset = _usesLiquidGlass ? 52 : 16;
  CGFloat sidebarHorizontalInset = 12;
  CGFloat sidebarListHorizontalInset = 8;
  CGFloat sidebarTitleListSpacing = 12;
  CGFloat titleHeight = 28;
  CGFloat titleY = MAX(0, _sidebarContentView.bounds.size.height - sidebarTopInset - titleHeight);
  _sidebarLabel.alignment = NSTextAlignmentLeft;
  _sidebarLabel.font = [NSFont systemFontOfSize:20 weight:NSFontWeightBold];
  _sidebarLabel.frame = NSMakeRect(
    sidebarHorizontalInset,
    titleY,
    MAX(0, _sidebarContentView.bounds.size.width - sidebarHorizontalInset * 2),
    titleHeight);
  CGFloat rowHeight = _sidebarTableView.rowHeight + _sidebarTableView.intercellSpacing.height;
  CGFloat listHeight = MIN(MAX(0, titleY - sidebarTitleListSpacing), (CGFloat)_sidebarItems.count * rowHeight);
  _sidebarScrollView.frame = NSMakeRect(
    sidebarListHorizontalInset,
    MAX(12, titleY - sidebarTitleListSpacing - listHeight),
    MAX(0, _sidebarContentView.bounds.size.width - sidebarListHorizontalInset * 2),
    listHeight);
  _sidebarTableView.frame = NSMakeRect(0, 0, _sidebarScrollView.bounds.size.width, listHeight);
  _mainLabel.frame = NSInsetRect(_mainContentView.bounds, 16, 16);
#else
  CGFloat width = self.bounds.size.width;
  _sidebarLabel.frame = CGRectMake(0, 0, width * 0.35, self.bounds.size.height);
  _mainLabel.frame = CGRectMake(width * 0.35, 0, width * 0.65, self.bounds.size.height);
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<AppKitSplitViewComponentDescriptor>();
}

@end
