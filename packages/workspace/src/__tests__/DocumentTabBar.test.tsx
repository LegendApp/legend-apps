import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DocumentTabBar } from "../DocumentTabBar";
import { withAlpha } from "../titleBar";

jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: () => null }));

const colors = { border: "#ccc", foreground: "#102030", muted: "#888", selection: "#ddd" };
const paths = ["/x/a.md", "/x/b.md", "/x/c.md"];

describe("DocumentTabBar", () => {
  let renderer: ReactTestRenderer;
  const render = (props: Partial<React.ComponentProps<typeof DocumentTabBar>> = {}) => act(async () => {
    renderer = create(<DocumentTabBar activePath="/x/b.md" colors={colors} onClose={jest.fn()} onSelect={jest.fn()} paths={paths} sidebarOpen titleBarHeight={36} {...props} />);
  });
  const tabs = () => renderer.root.findAll(node => node.type === ("Pressable" as never) && node.props.accessibilityRole === "tab");
  const flat = (style: unknown): Record<string, unknown> => Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : (style && typeof style === "object" ? style as Record<string, unknown> : {});
  const layout = (node: ReactTestInstance, width: number) => act(async () => node.props.onLayout({ nativeEvent: { layout: { height: 52, width, x: 0, y: 0 } } }));

  afterEach(() => act(async () => renderer.unmount()));

  it("shares the bar equally between tabs within their width limits", async () => {
    await render();
    await layout(renderer.root.findByType("View" as never), 800);
    // 800 - 8 inset - 36 drag space - 6 gap, less two 2pt gaps, over three tabs.
    expect(tabs().map(tab => flat(tab.props.style).width)).toEqual([220, 220, 220]);
    await layout(renderer.root.findByType("View" as never), 400);
    expect(tabs().map(tab => flat(tab.props.style).width)).toEqual([115, 115, 115]);
    await layout(renderer.root.findByType("View" as never), 200);
    expect(flat(tabs()[0].props.style).width).toBe(110);
  });

  it("fills the chrome theme's title bar height", async () => {
    await render({ titleBarHeight: 44 });
    expect(flat(renderer.root.findByType("View" as never).props.style).height).toBe(44);
  });

  it("marks the active tab, shows its close button only, and separates inactive neighbours", async () => {
    await render();
    expect(tabs().map(tab => tab.props.accessibilityState.selected)).toEqual([false, true, false]);
    const closes = renderer.root.findAll(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel?.startsWith("Close "));
    expect(closes.map(close => close.props.pointerEvents)).toEqual(["none", "auto", "none"]);
    expect(closes.map(close => close.props.tooltip)).toEqual(["Close Tab", "Close Tab", "Close Tab"]);
    // Neither neighbour of the active tab draws a separator.
    expect(tabs().map(tab => tab.findAll(node => node.type === ("View" as never) && flat(node.props.style).position === "absolute" && flat(node.props.style).height === 16).length)).toEqual([0, 0, 0]);
    expect(flat(tabs()[1].props.style).backgroundColor).toBe(withAlpha(colors.foreground, 0.09));
  });

  it("shows the sidebar toggle only when asked, after the traffic lights while the sidebar is hidden", async () => {
    await render();
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === "Show Sidebar" || node.props.accessibilityLabel === "Hide Sidebar")).toHaveLength(0);
    const onToggleSidebar = jest.fn();
    await render({ onToggleSidebar, sidebarOpen: false });
    expect(flat(renderer.root.findByType("View" as never).props.style).paddingLeft).toBe(80);
    await act(async () => renderer.root.find(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === "Show Sidebar").props.onPress());
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("shows a New Tab button after the tabs when asked, and titles tabs as told", async () => {
    await render();
    expect(renderer.root.findAll(node => node.props.accessibilityLabel === "New Tab")).toHaveLength(0);
    const onNewTab = jest.fn();
    await render({ onNewTab, title: path => path === "/x/c.md" ? "New Tab" : path.slice(3) });
    expect(tabs().map(tab => tab.props.accessibilityLabel)).toEqual(["a.md", "b.md", "New Tab"]);
    const button = renderer.root.find(node => node.type === ("Pressable" as never) && node.props.accessibilityLabel === "New Tab" && node.props.accessibilityRole === "button");
    await act(async () => button.props.onPress());
    expect(onNewTab).toHaveBeenCalledTimes(1);
    // The button and its gap come out of the tabs' share.
    await layout(renderer.root.findByType("View" as never), 500);
    expect(flat(tabs()[0].props.style).width).toBe(Math.round((500 - 8 - 36 - 6 - 32 - 4) / 3));
  });

  it("adds alpha to hex colors only", () => {
    expect(withAlpha("#abc", 0.5)).toBe("#aabbcc80");
    expect(withAlpha("#102030", 1)).toBe("#102030");
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgb(1, 2, 3)");
  });
});
