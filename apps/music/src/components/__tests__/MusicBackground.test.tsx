// @ts-nocheck The native glass surface is controlled; this checks app composition and the setting transition.
const React = require("react");
const { act, create } = require("react-test-renderer");
const { settings$ } = require("../../systems/Settings");
const { MusicBackground } = require("../MusicBackground");
const { GlassView } = require("@legendapp/spark/ui/glass");

test("uses Spark glass for the enabled backdrop and removes it when disabled", async () => {
    settings$.appearance.background.glassEnabled.set(true);
    let tree;
    await act(() => { tree = create(<MusicBackground><child /></MusicBackground>); });
    expect(tree.root.findAllByType(GlassView)).toHaveLength(1);
    expect(tree.root.findByType(GlassView).props.glassStyle).toBe("regular");
    expect(tree.root.findByType(GlassView).props.tintColor).toBe(settings$.appearance.background.color.peek());
    await act(() => settings$.appearance.background.glassEnabled.set(false));
    expect(tree.root.findAllByType(GlassView)).toHaveLength(0);
    expect(tree.root.findAllByType("child")).toHaveLength(1);
    await act(() => tree.unmount());
});
