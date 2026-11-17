global.__DEV__ = false;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = clearTimeout;

jest.mock("@legendapp/spark/ui/sidebar", () => {
  const React = require("react");
  return {
    Sidebar: ({ children }) => React.createElement(React.Fragment, null, children),
    SidebarItem: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: () => null }));
