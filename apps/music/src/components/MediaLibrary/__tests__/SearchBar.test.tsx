// @ts-nocheck Native search and registration are controlled; the command calls the mounted field's focus method.
const React = require("react");
const { act, create } = require("react-test-renderer");
const mockRegistrations = [];
jest.mock("../../../systems/keyboard/Keyboard", () => ({
    useOnHotkeys: (handlers, options) => mockRegistrations.push({ handlers, options }),
}));
const { MediaLibrarySearchBar } = require("../SearchBar");

test("the library Search command focuses the current search field", async () => {
    const focus = jest.fn();
    let tree;
    await act(() => { tree = create(<MediaLibrarySearchBar searchInputRef={{ current: null }} />, { createNodeMock: () => ({ focus }) }); });
    expect(mockRegistrations.at(-1)?.handlers.Search).toEqual(expect.any(Function));
    mockRegistrations.at(-1).handlers.Search();
    expect(focus).toHaveBeenCalledTimes(1);
    await act(() => tree.unmount());
});
